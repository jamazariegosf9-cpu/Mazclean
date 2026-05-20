// track-operator v3
// Fix definitivo: fetch directo con ANON_KEY hardcodeada para llamar send-whatsapp
// (SUPABASE_ANON_KEY deprecated, supabase.functions.invoke usa SERVICE_KEY)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')              ?? ''
const GOOGLE_MAPS_KEY = Deno.env.get('GOOGLE_MAPS_KEY')           ?? ''

// ANON KEY hardcodeada — pública por diseño
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzZG1rYndtdGhyamd2eXV2Y21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTAwMTksImV4cCI6MjA4ODc2NjAxOX0.j3NP8hVvBt_KPN-nqVLpr_FvTUcIvGMwnYHieor5QCM'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NEAR_THRESHOLD_METERS = 800

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { booking_id, operator_id, lat, lng } = await req.json()

    const supabase = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Guardar ubicación del operador
    const { error: locError } = await supabase
      .from('operator_locations')
      .upsert({ booking_id, operator_id, lat, lng, updated_at: new Date().toISOString() }, { onConflict: 'booking_id' })

    if (locError) throw locError

    // 2. Obtener datos del booking
    const { data: booking, error: bError } = await supabase
      .from('bookings')
      .select('*, customer:client_id(full_name, phone)')
      .eq('id', booking_id)
      .single()

    if (bError || !booking) throw bError || new Error('Booking no encontrado')

    if (booking.status !== 'en_camino') {
      return new Response(JSON.stringify({ success: true, action: 'location_saved' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const clientLat = booking.address_lat
    const clientLng = booking.address_lng

    if (!clientLat || !clientLng) {
      return new Response(JSON.stringify({ success: true, action: 'no_client_coords' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // 3. Calcular distancia al cliente
    const matrixUrl  = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${lat},${lng}&destinations=${clientLat},${clientLng}&mode=driving&key=${GOOGLE_MAPS_KEY}`
    const matrixRes  = await fetch(matrixUrl)
    const matrixData = await matrixRes.json()

    const element        = matrixData?.rows?.[0]?.elements?.[0]
    const durationSecs   = element?.duration?.value  ?? 9999
    const distanceMeters = element?.distance?.value  ?? 9999

    // 4. Verificar si ya se envió el aviso "llegando"
    const { data: alreadySent } = await supabase
      .from('booking_status_log')
      .select('id')
      .eq('booking_id', booking_id)
      .eq('status', 'llegando')
      .single()

    // 5. Si está a menos de 800m y no se ha enviado aviso
    if (distanceMeters <= NEAR_THRESHOLD_METERS && !alreadySent) {
      const phone = booking.customer?.phone
      if (phone) {
        // fetch directo con ANON_KEY — NO supabase.functions.invoke()
        await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${ANON_KEY}`,
            'apikey':        ANON_KEY,
          },
          body: JSON.stringify({
            event:   'llegando',
            phone,
            booking: {
              booking_ref:  booking.booking_ref,
              service_name: booking.service_name,
              operator_lat: lat,
              operator_lng: lng,
              address_line: booking.address_line,
              minutes_away: Math.ceil(durationSecs / 60),
            }
          }),
        })
      }

      await supabase.from('booking_status_log').insert({
        booking_id,
        status:     'llegando',
        changed_by: operator_id,
        note:       `Operador a ${distanceMeters}m / ${Math.ceil(durationSecs/60)} min`,
        created_at: new Date().toISOString()
      })

      return new Response(JSON.stringify({
        success:    true,
        action:     'whatsapp_llegando_sent',
        distance_m: distanceMeters,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      success:    true,
      action:     'location_updated',
      distance_m: distanceMeters,
      duration_s: durationSecs,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
