import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BASE_LAT = 19.313802
const BASE_LNG = -99.1070498
const COURTESY_MINUTES = 15
const BUSINESS_START = 8
const BUSINESS_END = 19
const GOOGLE_MAPS_KEY = Deno.env.get('GOOGLE_MAPS_KEY') ?? ''

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { lat, lng, fecha, service_id, vehicle_type } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Obtener duración del servicio según tipo de vehículo
    const { data: service, error: sError } = await supabase
      .from('services')
      .select('name, duration_sedan, duration_suv, duration_pickup, duration_van')
      .eq('id', service_id)
      .single()
    if (sError) throw sError

    const durationMap: Record<string, number> = {
      sedan:  service.duration_sedan,
      suv:    service.duration_suv,
      pickup: service.duration_pickup,
      van:    service.duration_van,
    }
    const serviceDuration = durationMap[vehicle_type] ?? service.duration_sedan

    // 2. Obtener todos los operadores activos
    const { data: operators, error: oError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'operador')
      .eq('is_active', true)
    if (oError) throw oError

    if (!operators || operators.length === 0) {
      return new Response(JSON.stringify({ slots: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Obtener reservaciones del día para todos los operadores
    // Incluye 'pendiente' para bloquear slots aunque no haya operador asignado aún
    const operatorIds = operators.map(o => o.id)
    const { data: bookings, error: bError } = await supabase
      .from('bookings')
      .select('operator_id, scheduled_time, address_lat, address_lng, service_id, vehicle_type')
      .eq('scheduled_date', fecha)
      .in('status', ['pendiente', 'confirmado', 'en_camino', 'en_proceso'])
      .order('scheduled_time', { ascending: true })
    if (bError) throw bError

    // 4. Obtener duración de cada reservación existente
    const serviceIds = [...new Set((bookings || []).map(b => b.service_id))]
    let existingServicesMap: Record<string, any> = {}
    if (serviceIds.length > 0) {
      const { data: existingServices } = await supabase
        .from('services')
        .select('id, duration_sedan, duration_suv, duration_pickup, duration_van')
        .in('id', serviceIds)
      ;(existingServices || []).forEach(s => { existingServicesMap[s.id] = s })
    }

    // 5. Calcular tiempo de traslado via Google Distance Matrix
    const getTravelTime = async (originLat: number, originLng: number, destLat: number, destLng: number): Promise<number> => {
      try {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLat},${originLng}&destinations=${destLat},${destLng}&mode=driving&key=${GOOGLE_MAPS_KEY}`
        const res  = await fetch(url)
        const data = await res.json()
        const seconds = data?.rows?.[0]?.elements?.[0]?.duration?.value ?? 1800
        return Math.ceil(seconds / 60)
      } catch {
        return 30 // fallback 30 min si falla
      }
    }

    // 6. Generar slots de 8:00 a 19:00 cada 30 minutos
    // Calcular hora actual en CDMX (UTC-6)
    const nowUTC = new Date()
    const nowCDMX = new Date(nowUTC.getTime() - 6 * 60 * 60 * 1000)
    const todayCDMX = nowCDMX.toISOString().split('T')[0]
    const isToday = fecha === todayCDMX
    const currentMinutesCDMX = nowCDMX.getUTCHours() * 60 + nowCDMX.getUTCMinutes()
    const MIN_ADVANCE_MINUTES = 60 // mínimo 1 hora de anticipación

    const allSlots: string[] = []
    for (let h = BUSINESS_START; h < BUSINESS_END; h++) {
      allSlots.push(`${String(h).padStart(2,'0')}:00`)
      if (h < BUSINESS_END - 1) allSlots.push(`${String(h).padStart(2,'0')}:30`)
    }

    // 7. Para cada slot, verificar disponibilidad por operador
    const slotResults = await Promise.all(allSlots.map(async (slot) => {
      const [slotH, slotM] = slot.split(':').map(Number)
      const slotMinutes = slotH * 60 + slotM
      const slotEndMinutes = slotMinutes + serviceDuration

      // Fin de jornada
      if (slotEndMinutes > BUSINESS_END * 60) {
        return { time: slot, available: false, suggested: false, reason: 'Fuera de horario' }
      }

      // Filtrar slots pasados si es hoy en CDMX
      if (isToday && slotMinutes < currentMinutesCDMX + MIN_ADVANCE_MINUTES) {
        return { time: slot, available: false, suggested: false, reason: 'Horario ya pasado' }
      }

      // Verificar cada operador
      for (const operator of operators) {
        // Reservaciones asignadas a este operador
        const opBookings = (bookings || [])
          .filter(b => b.operator_id === operator.id)
          .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))

        // Reservaciones pendientes sin operador asignado (bloquean a todos los operadores)
        const pendingBookings = (bookings || [])
          .filter(b => !b.operator_id)
          .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))

        // Combinar ambas listas para calcular ocupación real
        const allOpBookings = [...opBookings, ...pendingBookings]
          .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time))

        // Calcular ocupación del operador en este slot
        let operatorFree = true
        let prevEndLat = BASE_LAT
        let prevEndLng = BASE_LNG
        let prevEndMinutes = BUSINESS_START * 60

        for (const booking of allOpBookings) {
          const [bH, bM] = booking.scheduled_time.split(':').map(Number)
          const bStart = bH * 60 + bM
          const bService = existingServicesMap[booking.service_id]
          const bDurationMap: Record<string, number> = {
            sedan:  bService?.duration_sedan  ?? 45,
            suv:    bService?.duration_suv    ?? 45,
            pickup: bService?.duration_pickup ?? 45,
            van:    bService?.duration_van    ?? 45,
          }
          const bDuration = bDurationMap[booking.vehicle_type] ?? 45
          const bEnd = bStart + bDuration

          // Conflicto directo: el slot se superpone con esta reserva
          if (slotMinutes < bEnd && slotEndMinutes > bStart) {
            operatorFree = false
            break
          }
          prevEndLat = booking.address_lat ?? BASE_LAT
          prevEndLng = booking.address_lng ?? BASE_LNG
          prevEndMinutes = bEnd
        }

        if (!operatorFree) continue

        // Calcular tiempo de traslado desde última posición del operador
        const travelTime = await getTravelTime(prevEndLat, prevEndLng, lat, lng)
        const earliestAvailable = prevEndMinutes + travelTime + COURTESY_MINUTES

        if (slotMinutes < earliestAvailable) continue

        // Este operador PUEDE hacer este slot
        // Es "sugerido" si el operador ya está cerca (viaje <= 15 min)
        const isSuggested = travelTime <= 15

        return {
          time:        slot,
          available:   true,
          suggested:   isSuggested,
          operator_id: operator.id,
          operator_name: operator.full_name,
          travel_minutes: travelTime,
        }
      }

      return { time: slot, available: false, suggested: false, reason: 'Sin operadores disponibles' }
    }))

    return new Response(JSON.stringify({ slots: slotResults }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
