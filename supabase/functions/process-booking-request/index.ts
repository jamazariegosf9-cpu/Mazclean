// process-booking-request v6
// Fix definitivo: ANON_KEY hardcodeada (es pública, igual que en el frontend)
// SUPABASE_ANON_KEY deprecated en Supabase → usamos valor directo

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')              ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ORS_API_KEY          = Deno.env.get('ORS_API_KEY')               ?? ''

// ANON KEY hardcodeada — es pública por diseño (igual que VITE_SUPABASE_ANON_KEY en frontend)
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzZG1rYndtdGhyamd2eXV2Y21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTAwMTksImV4cCI6MjA4ODc2NjAxOX0.j3NP8hVvBt_KPN-nqVLpr_FvTUcIvGMwnYHieor5QCM'

const APP_URL            = 'https://mazclean.vercel.app'
const RONDA_DURATION_MIN = 5
const TRAVEL_BUFFER_MIN  = 5

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

// ── OpenRouteService: tiempo de traslado en minutos ───────────────────────────
async function getTravelMinutes(
  fromLat: number, fromLng: number,
  toLat: number,   toLng: number
): Promise<number | null> {
  if (!ORS_API_KEY) return null
  try {
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
      method: 'POST',
      headers: { 'Authorization': ORS_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinates: [[fromLng, fromLat], [toLng, toLat]] }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const seconds = data?.routes?.[0]?.summary?.duration
    if (!seconds) return null
    return Math.ceil(seconds / 60)
  } catch (e) {
    console.error('ORS error:', e)
    return null
  }
}

// ── Filtrar candidatos por tiempo de traslado real ────────────────────────────
async function filterByTravelTime(
  candidates: any[],
  booking: any,
  supabase: any
): Promise<any[]> {
  const toLat = booking.address_lat
  const toLng = booking.address_lng
  if (!toLat || !toLng) return candidates

  const bookingDate     = booking.scheduled_date
  const bookingStartStr = booking.scheduled_time_from
  const [bh, bm]        = bookingStartStr.split(':').map(Number)
  const bookingStartMin = bh * 60 + bm
  const filtered: any[] = []

  for (const candidate of candidates) {
    const { data: lastBooking } = await supabase
      .from('bookings')
      .select('address_lat, address_lng, scheduled_time_to')
      .eq('operator_id', candidate.operator_id)
      .eq('scheduled_date', bookingDate)
      .not('status', 'in', '("cancelado","finalizado")')
      .order('scheduled_time_to', { ascending: false })
      .limit(1)
      .maybeSingle()

    let fromLat: number
    let fromLng: number
    let availableAt: number

    if (lastBooking?.address_lat) {
      fromLat     = lastBooking.address_lat
      fromLng     = lastBooking.address_lng
      const [h, m] = (lastBooking.scheduled_time_to as string).split(':').map(Number)
      availableAt  = h * 60 + m
    } else {
      const { data: profile } = await supabase
        .from('profiles')
        .select('base_lat, base_lng')
        .eq('id', candidate.operator_id)
        .single()
      fromLat     = profile?.base_lat
      fromLng     = profile?.base_lng
      availableAt = 0
    }

    if (!fromLat || !fromLng) {
      filtered.push(candidate)
      continue
    }

    const travelMin = await getTravelMinutes(fromLat, fromLng, toLat, toLng)

    if (travelMin === null) {
      filtered.push(candidate)
      continue
    }

    const totalNeeded = availableAt + travelMin + TRAVEL_BUFFER_MIN
    if (totalNeeded <= bookingStartMin) {
      filtered.push({ ...candidate, travel_minutes: travelMin })
    } else {
      console.log(`Operador ${candidate.operator_id} filtrado por ORS: necesita ${totalNeeded} min pero servicio es a ${bookingStartMin} min`)
    }
  }

  return filtered
}

// ── Enviar WhatsApp via send-whatsapp ─────────────────────────────────────────
async function sendWA(event: string, phone: string, bookingData: any): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey':        ANON_KEY,
      },
      body: JSON.stringify({ event, phone, booking: bookingData }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      console.error(`sendWA [${event}] HTTP ${res.status}:`, errBody)
      return false
    }
    const result = await res.json()
    const ok = result?.results?.whatsapp?.ok || result?.results?.sms?.ok || false
    if (!ok) console.error(`sendWA [${event}] falló:`, JSON.stringify(result))
    else console.log(`sendWA [${event}] OK → ${phone}`)
    return ok
  } catch (e) {
    console.error(`Error enviando WA [${event}]:`, e)
    return false
  }
}

// ── Llamar a la siguiente ronda ───────────────────────────────────────────────
async function callNextRound(bookingId: string, ronda: number) {
  await fetch(`${SUPABASE_URL}/functions/v1/process-booking-request`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey':        ANON_KEY,
    },
    body: JSON.stringify({ booking_id: bookingId, ronda }),
  })
}

// ── Handler principal ─────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { booking_id, ronda = 1 } = await req.json()

    if (!booking_id) {
      return new Response(JSON.stringify({ error: 'booking_id requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase  = getSupabase()
    const expiresAt = new Date(Date.now() + RONDA_DURATION_MIN * 60 * 1000).toISOString()

    // ── 1. Obtener booking con datos del cliente ───────────────────────────────
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*, client:client_id(phone, full_name)')
      .eq('id', booking_id)
      .single()

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking no encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (booking.operator_id) {
      return new Response(JSON.stringify({ message: 'Booking ya asignado', booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const clientPhone = booking.client?.phone || null

    const bookingPayload = {
      booking_ref:         booking.booking_ref,
      service_name:        booking.service_name,
      scheduled_date:      booking.scheduled_date,
      scheduled_time_from: booking.scheduled_time_from,
      scheduled_time_to:   booking.scheduled_time_to,
      total_price:         booking.total_price,
      address_line:        booking.address_line,
      booking_id:          booking.id,
    }

    // ── 2. Ronda 1: notificar booking_created al cliente ──────────────────────
    if (ronda === 1 && clientPhone) {
      await sendWA('booking_created', clientPhone, bookingPayload)
    }

    // ── 3. Rondas agotadas (> 3): notificar admin + cliente ───────────────────
    if (ronda > 3) {
      await supabase
        .from('bookings')
        .update({ current_ronda: 3, request_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', booking_id)

      if (clientPhone) {
        await sendWA('booking_searching', clientPhone, bookingPayload)
      }

      const { data: admins } = await supabase
        .from('profiles').select('phone').eq('role', 'admin')

      for (const admin of admins ?? []) {
        if (admin.phone) {
          await sendWA('admin_assignment_needed', admin.phone, bookingPayload)
        }
      }

      return new Response(JSON.stringify({ message: 'Rondas agotadas: admin y cliente notificados', booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 4. Obtener candidatos según ronda ─────────────────────────────────────
    let { data: candidates, error: candidatesError } = await supabase
      .rpc('get_available_operators', { p_booking_id: booking_id, p_ronda: ronda })

    if (candidatesError) {
      console.error('Error obteniendo candidatos:', candidatesError)
      return new Response(JSON.stringify({ error: candidatesError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 5. Ronda 1 sin Preferentes → fallback inmediato a Autónomos ──────────
    if (ronda === 1 && (!candidates || candidates.length === 0)) {
      console.log('Ronda 1: sin Preferentes disponibles, buscando Autónomos...')
      const { data: autonomos } = await supabase
        .rpc('get_available_operators', { p_booking_id: booking_id, p_ronda: 2 })
      candidates = autonomos || []
    }

    // ── 6. Sin candidatos → avanzar a siguiente ronda ─────────────────────────
    if (!candidates || candidates.length === 0) {
      console.log(`Ronda ${ronda}: sin candidatos, avanzando a ronda ${ronda + 1}`)
      await callNextRound(booking_id, ronda + 1)
      return new Response(JSON.stringify({ message: `Ronda ${ronda} sin candidatos`, booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 7. Filtrar candidatos por tiempo de traslado (OpenRouteService) ───────
    const filteredCandidates = await filterByTravelTime(candidates, booking, supabase)

    if (filteredCandidates.length === 0) {
      console.log(`Ronda ${ronda}: todos filtrados por ORS, avanzando a ronda ${ronda + 1}`)
      await callNextRound(booking_id, ronda + 1)
      return new Response(JSON.stringify({ message: `Ronda ${ronda} sin candidatos tras filtro ORS`, booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── 8. Actualizar booking con ronda actual y expiración ───────────────────
    await supabase
      .from('bookings')
      .update({ current_ronda: ronda, request_expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('id', booking_id)

    // ── 9. Crear booking_requests para cada candidato ─────────────────────────
    const requests = filteredCandidates.map((c: any) => ({
      booking_id,
      operator_id: c.operator_id,
      ronda,
      status:      'pendiente',
      notified_at: new Date().toISOString(),
      expires_at:  expiresAt,
    }))

    const { error: insertError } = await supabase
      .from('booking_requests')
      .insert(requests)

    if (insertError) {
      console.error('Error insertando booking_requests:', insertError)
    }

    // ── 10. Notificar operadores por WhatsApp ─────────────────────────────────
    const operatorIds = filteredCandidates.map((c: any) => c.operator_id)
    const { data: operatorProfiles } = await supabase
      .from('profiles')
      .select('id, phone, full_name')
      .in('id', operatorIds)

    let notifiedCount = 0
    for (const op of operatorProfiles ?? []) {
      if (op.phone) {
        const sent = await sendWA('operator_service_request', op.phone, {
          ...bookingPayload,
          operator_id: op.id,
        })
        if (sent) notifiedCount++
      }
    }

    console.log(`Ronda ${ronda}: ${filteredCandidates.length} candidatos, ${notifiedCount} notificados`)

    return new Response(JSON.stringify({
      success:          true,
      booking_id,
      ronda,
      candidates_count: filteredCandidates.length,
      notified_count:   notifiedCount,
      expires_at:       expiresAt,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Error en process-booking-request:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
