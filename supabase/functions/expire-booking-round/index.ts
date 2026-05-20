// expire-booking-round v3
// Fix definitivo: ANON_KEY hardcodeada (SUPABASE_ANON_KEY deprecated en Supabase)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')              ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// ANON KEY hardcodeada — pública por diseño
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlzZG1rYndtdGhyamd2eXV2Y21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTAwMTksImV4cCI6MjA4ODc2NjAxOX0.j3NP8hVvBt_KPN-nqVLpr_FvTUcIvGMwnYHieor5QCM'

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

    if (booking.operator_id) {
      console.log(`Booking ${booking_id} ya asignado, ronda ${ronda} ignorada`)
      return new Response(JSON.stringify({ message: 'Ya asignado, nada que hacer', booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (booking.current_ronda !== ronda) {
      console.log(`Booking ${booking_id} ya en ronda ${booking.current_ronda}, ignorando expiración de ronda ${ronda}`)
      return new Response(JSON.stringify({ message: 'Ronda ya procesada', booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── 2. Marcar solicitudes pendientes como expiradas ───────────────────────
    const { error: expireError } = await supabase
      .from('booking_requests')
      .update({ status: 'expirado', responded_at: new Date().toISOString() })
      .eq('booking_id', booking_id)
      .eq('ronda', ronda)
      .eq('status', 'pendiente')

    if (expireError) {
      console.error('Error expirando booking_requests:', expireError)
    }

    // ── 3. Lanzar siguiente ronda con ANON_KEY ────────────────────────────────
    const nextRonda = ronda + 1
    console.log(`Ronda ${ronda} expirada para booking ${booking_id}, lanzando ronda ${nextRonda}`)

    const res = await fetch(`${SUPABASE_URL}/functions/v1/process-booking-request`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
        'apikey':        ANON_KEY,
      },
      body: JSON.stringify({ booking_id, ronda: nextRonda }),
    })

    const result = await res.json()
    console.log(`Resultado ronda ${nextRonda}:`, result)

    return new Response(JSON.stringify({
      success:          true,
      booking_id,
      ronda_expirada:   ronda,
      ronda_siguiente:  nextRonda,
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
