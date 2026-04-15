// expire-booking-round v1
// Se llama después del delay de 5 minutos para verificar si alguien aceptó.
// Si nadie aceptó → lanza la siguiente ronda vía process-booking-request.
// Si alguien aceptó → no hace nada (el trigger de DB ya manejó la asignación).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { booking_id, ronda } = await req.json()

    if (!booking_id || ronda === undefined) {
      return new Response(JSON.stringify({ error: 'booking_id y ronda requeridos' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // ── 1. Verificar si el booking ya fue asignado ────────────────────────────
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, operator_id, current_ronda, status')
      .eq('id', booking_id)
      .single()

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking no encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Si ya tiene operador asignado, el trigger lo manejó — no hacer nada
    if (booking.operator_id) {
      console.log(`Booking ${booking_id} ya asignado al operador ${booking.operator_id}, ronda ${ronda} ignorada`)
      return new Response(JSON.stringify({ message: 'Ya asignado, nada que hacer', booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Si el booking ya cambió a una ronda diferente (race condition), ignorar
    if (booking.current_ronda !== ronda) {
      console.log(`Booking ${booking_id} ya está en ronda ${booking.current_ronda}, ignorando expiración de ronda ${ronda}`)
      return new Response(JSON.stringify({ message: 'Ronda ya procesada', booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── 2. Marcar como expiradas todas las solicitudes pendientes de esta ronda
    const { error: expireError } = await supabase
      .from('booking_requests')
      .update({
        status:       'expirado',
        responded_at: new Date().toISOString(),
      })
      .eq('booking_id', booking_id)
      .eq('ronda', ronda)
      .eq('status', 'pendiente')

    if (expireError) {
      console.error('Error expirando booking_requests:', expireError)
    }

    // ── 3. Lanzar siguiente ronda ─────────────────────────────────────────────
    const nextRonda = ronda + 1
    console.log(`Ronda ${ronda} expirada para booking ${booking_id}, lanzando ronda ${nextRonda}`)

    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-booking-request`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey':        SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({ booking_id, ronda: nextRonda }),
    })

    const result = await res.json()
    console.log(`Resultado ronda ${nextRonda}:`, result)

    return new Response(JSON.stringify({
      success:     true,
      booking_id,
      ronda_expirada:  ronda,
      ronda_siguiente: nextRonda,
      result,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Error en expire-booking-round:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
