// process-booking-request v3
// Motor principal del sistema de asignación automática por rondas.
// Flujo:
//   Ronda 1 (5 min) → operadores admin_asignado en zona
//   Ronda 2 (5 min) → operadores autonomo en zona
//   Ronda 3 (5 min) → segunda oportunidad (mismos candidatos ronda 2)
//   Ronda 4         → notifica cliente que seguimos buscando + alerta admin

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL            = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const APP_URL                 = 'https://mazclean.vercel.app'
const RONDA_DURATION_MINUTES  = 5

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
}

async function sendWhatsApp(event: string, phone: string, bookingData: any) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey':        SUPABASE_SERVICE_KEY,
      },
      body: JSON.stringify({ event, phone, booking: bookingData }),
    })
    return res.ok
  } catch (e) {
    console.error(`Error enviando WhatsApp [${event}]:`, e)
    return false
  }
}

async function sendWhatsAppToOperator(phone: string, booking: any, ronda: number) {
  const timeFrom = booking.scheduled_time_from?.slice(0, 5) ?? ''
  const timeTo   = booking.scheduled_time_to?.slice(0, 5) ?? ''
  const message  = [
    `🚗 Maz Clean — Nueva solicitud de servicio!`,
    ``,
    `Ref: ${booking.booking_ref ?? ''}`,
    `Servicio: ${booking.service_name ?? ''}`,
    `Fecha: ${booking.scheduled_date ?? ''}`,
    `Horario solicitado: ${timeFrom} a ${timeTo} hrs`,
    `Pago: $${booking.total_price ?? ''} MXN`,
    ``,
    `⏱ Tienes ${RONDA_DURATION_MINUTES} minutos para aceptar.`,
    ``,
    `Entra a la app para aceptar:`,
    `${APP_URL}`,
  ].join('\n')

  return sendWhatsApp('operator_service_request', phone, { ...booking, custom_message: message })
}

async function scheduleNextRound(bookingId: string, ronda: number, delayMinutes: number) {
  const delayMs = delayMinutes * 60 * 1000
  const runAfterDelay = async () => {
    await new Promise(resolve => setTimeout(resolve, delayMs))
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/expire-booking-round`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey':        SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({ booking_id: bookingId, ronda }),
      })
    } catch (e) {
      console.error('Error llamando expire-booking-round:', e)
    }
  }
  // @ts-ignore
  if (typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(runAfterDelay())
  } else {
    runAfterDelay()
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { booking_id, ronda = 1 } = await req.json()

    if (!booking_id) {
      return new Response(JSON.stringify({ error: 'booking_id requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase  = getSupabase()
    const expiresAt = new Date(Date.now() + RONDA_DURATION_MINUTES * 60 * 1000).toISOString()

    // ── 1. Obtener datos del booking ──────────────────────────────────────────
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*, client:client_id(phone, full_name)')
      .eq('id', booking_id)
      .single()

    if (bookingError || !booking) {
      return new Response(JSON.stringify({ error: 'Booking no encontrado' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (booking.operator_id) {
      return new Response(JSON.stringify({ message: 'Booking ya tiene operador asignado', booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const clientPhone = booking.client?.phone || booking.client_phone || null

    // ── 2. Ronda 4 → 3 rondas fallaron ───────────────────────────────────────
    if (ronda >= 4) {
      await supabase
        .from('bookings')
        .update({
          current_ronda:      4,
          request_expires_at: null,
          status:             'pendiente',
          updated_at:         new Date().toISOString(),
        })
        .eq('id', booking_id)

      const bookingData = {
        booking_ref:         booking.booking_ref,
        service_name:        booking.service_name,
        scheduled_date:      booking.scheduled_date,
        scheduled_time_from: booking.scheduled_time_from,
        scheduled_time_to:   booking.scheduled_time_to,
        address_line:        booking.address_line,
        total_price:         booking.total_price,
      }

      // ── Notificar al CLIENTE que seguimos buscando ────────────────────────
      if (clientPhone) {
        await sendWhatsApp('booking_searching', clientPhone, {
          ...bookingData,
          client_name: booking.client?.full_name || 'cliente',
        })
        console.log(`Cliente notificado (booking_searching): ${clientPhone}`)
      }

      // ── Notificar a todos los admins ──────────────────────────────────────
      const { data: admins } = await supabase
        .from('profiles')
        .select('phone, full_name')
        .eq('role', 'admin')

      for (const admin of admins ?? []) {
        if (admin.phone) {
          await sendWhatsApp('admin_assignment_needed', admin.phone, bookingData)
        }
      }

      return new Response(JSON.stringify({ message: 'Ronda 4: cliente y admin notificados', booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── 3. Obtener candidatos disponibles ─────────────────────────────────────
    const { data: candidates, error: candidatesError } = await supabase
      .rpc('get_available_operators', { p_booking_id: booking_id, p_ronda: ronda })

    if (candidatesError) {
      console.error('Error obteniendo candidatos:', candidatesError)
      return new Response(JSON.stringify({ error: candidatesError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── 4. Sin candidatos → saltar a siguiente ronda ──────────────────────────
    if (!candidates || candidates.length === 0) {
      console.log(`Ronda ${ronda}: sin candidatos, avanzando a ronda ${ronda + 1}`)
      const nextRonda = ronda + 1
      await fetch(`${SUPABASE_URL}/functions/v1/process-booking-request`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey':        SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({ booking_id, ronda: nextRonda }),
      })
      return new Response(JSON.stringify({ message: `Ronda ${ronda} sin candidatos, saltando a ronda ${nextRonda}`, booking_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── 5. Actualizar booking ─────────────────────────────────────────────────
    await supabase
      .from('bookings')
      .update({ current_ronda: ronda, request_expires_at: expiresAt, updated_at: new Date().toISOString() })
      .eq('id', booking_id)

    // ── 6. Crear booking_requests ─────────────────────────────────────────────
    const requests = candidates.map((c: any) => ({
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

    // ── 7. Notificar operadores ───────────────────────────────────────────────
    const operatorIds = candidates.map((c: any) => c.operator_id)
    const { data: operatorProfiles } = await supabase
      .from('profiles')
      .select('id, phone, full_name')
      .in('id', operatorIds)

    let notifiedCount = 0
    for (const op of operatorProfiles ?? []) {
      if (op.phone) {
        const sent = await sendWhatsAppToOperator(op.phone, booking, ronda)
        if (sent) notifiedCount++
      }
    }

    console.log(`Ronda ${ronda}: ${candidates.length} candidatos, ${notifiedCount} notificados`)

    // ── 8. Programar expiración ───────────────────────────────────────────────
    await scheduleNextRound(booking_id, ronda, RONDA_DURATION_MINUTES)

    return new Response(JSON.stringify({
      success:          true,
      booking_id,
      ronda,
      candidates_count: candidates.length,
      notified_count:   notifiedCount,
      expires_at:       expiresAt,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Error en process-booking-request:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
