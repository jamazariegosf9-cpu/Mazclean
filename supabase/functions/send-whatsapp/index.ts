// v5 - WhatsApp + SMS paralelo
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_FROM        = 'whatsapp:+14155238886'
const TWILIO_FROM_SMS    = Deno.env.get('TWILIO_FROM_SMS') ?? ''
const APP_URL            = 'https://mazclean.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getMessage(event: string, data: any): string {
  const ref      = data.booking_ref    || ''
  const svc      = data.service_name   || 'tu lavado'
  const date     = data.scheduled_date || ''
  const time     = data.scheduled_time || ''
  const price    = data.total_price    || ''
  const op       = data.operator_name  || 'tu operador'
  const bookingId = data.booking_id    || ''
  const trackingUrl = bookingId ? `${APP_URL}/tracking/${bookingId}` : APP_URL

  switch (event) {
    case 'booking_created':
      return `Maz Clean - Reservacion recibida!\n\nRef: ${ref}\nServicio: ${svc}\nFecha: ${date} a las ${time}\nTotal: $${price} MXN\n\nEn breve te asignaremos un operador. Gracias!`
    case 'operator_assigned':
      return `Maz Clean - Operador asignado!\n\nRef: ${ref}\nOperador: ${op}\nFecha: ${date} a las ${time}\n\nTe avisaremos cuando este en camino.`
    case 'on_the_way':
      return `Maz Clean - Tu experto ya va en camino! 🚗💨\n\nRef: ${ref}\n${op} se dirige a tu ubicacion.\n\nSigue su llegada en tiempo real aqui:\n${trackingUrl}\n\nPreparate para dejar tu auto IMPECABLE! ✨`
    case 'llegando':
      return `Maz Clean - Estamos a ${data.minutes_away || 5} minutos! 🕒\n\nRef: ${ref}\nPor favor ten las llaves a la mano o el acceso listo para recibirnos.\n\nVamos a dejar tu auto IMPECABLE! ✨`
    case 'arrived':
      return `Maz Clean - Tu operador ha llegado!\n\nRef: ${ref}\n${op} esta en tu ubicacion. El lavado comenzara en unos momentos!`
    case 'washing':
      return `Maz Clean - Tu vehiculo esta siendo lavado!\n\nRef: ${ref}\n\nTe avisaremos cuando este listo.`
    case 'done':
      return `Maz Clean - Tu vehiculo esta listo! 🎉\n\nRef: ${ref}\nServicio completado: ${svc}\nTotal: $${price} MXN\n\nGracias por usar Maz Clean! Tu opinion nos importa, califícanos en la app.`
    default:
      return `Maz Clean - Actualizacion reservacion ${ref}`
  }
}

const getBase64Auth = () => {
  const auth    = `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
  const encoder = new TextEncoder()
  const data    = encoder.encode(auth)
  return btoa(String.fromCharCode(...data))
}

const sendTwilioMessage = async (from: string, to: string, body: string) => {
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const response  = await fetch(twilioUrl, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${getBase64Auth()}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: from, To: to, Body: body }).toString(),
  })
  const result = await response.json()
  return { ok: response.ok, data: result }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { event, phone, booking } = await req.json()

    if (!phone) {
      return new Response(JSON.stringify({ error: 'phone requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let normalizedPhone = phone.toString().replace(/\D/g, '')
    if (normalizedPhone.length === 10) normalizedPhone = '52' + normalizedPhone
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone

    const message = getMessage(event, booking || {})

    const results: any = {}

    // ── Envío WhatsApp ──────────────────────────────────────────
    const waTo = 'whatsapp:' + normalizedPhone
    const waResult = await sendTwilioMessage(TWILIO_FROM, waTo, message)
    results.whatsapp = { ok: waResult.ok, sid: waResult.data.sid, error: waResult.data.message }

    // ── Envío SMS paralelo ──────────────────────────────────────
    if (TWILIO_FROM_SMS) {
      const smsResult = await sendTwilioMessage(TWILIO_FROM_SMS, normalizedPhone, message)
      results.sms = { ok: smsResult.ok, sid: smsResult.data.sid, error: smsResult.data.message }
    }

    // Considerar éxito si al menos uno de los dos canales funcionó
    const anySuccess = results.whatsapp?.ok || results.sms?.ok

    if (!anySuccess) {
      return new Response(JSON.stringify({ error: results.whatsapp?.error || results.sms?.error, results }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
