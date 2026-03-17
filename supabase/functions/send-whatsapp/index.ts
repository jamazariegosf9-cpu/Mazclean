// v3 - fix auth using encodeURIComponent
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_FROM        = 'whatsapp:+14155238886'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getMessage(event: string, data: any): string {
  const ref   = data.booking_ref    || ''
  const svc   = data.service_name   || 'tu lavado'
  const date  = data.scheduled_date || ''
  const time  = data.scheduled_time || ''
  const price = data.total_price    || ''
  const op    = data.operator_name  || 'tu operador'

  switch (event) {
    case 'booking_created':
      return `Maz Clean - Reservacion recibida!\n\nRef: ${ref}\nServicio: ${svc}\nFecha: ${date} a las ${time}\nTotal: $${price} MXN\n\nEn breve te asignaremos un operador. Gracias!`
    case 'operator_assigned':
      return `Maz Clean - Operador asignado!\n\nRef: ${ref}\nOperador: ${op}\nFecha: ${date} a las ${time}\n\nTe avisaremos cuando este en camino.`
    case 'on_the_way':
      return `Maz Clean - Tu operador esta en camino!\n\nRef: ${ref}\n${op} se dirige a tu ubicacion.\n\nPuedes verlo en tiempo real en la app.`
    case 'arrived':
      return `Maz Clean - Tu operador ha llegado!\n\nRef: ${ref}\n${op} esta en tu ubicacion. El lavado comenzara en unos momentos!`
    case 'washing':
      return `Maz Clean - Tu vehiculo esta siendo lavado!\n\nRef: ${ref}\n\nTe avisaremos cuando este listo.`
    case 'done':
      return `Maz Clean - Tu vehiculo esta listo!\n\nRef: ${ref}\nServicio completado: ${svc}\nTotal: $${price} MXN\n\nGracias por usar Maz Clean!`
    default:
      return `Maz Clean - Actualizacion reservacion ${ref}`
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('SID length:', TWILIO_ACCOUNT_SID.length)
    console.log('TOKEN length:', TWILIO_AUTH_TOKEN.length)

    const { event, phone, booking } = await req.json()

    if (!phone) {
      return new Response(JSON.stringify({ error: 'phone requerido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let normalizedPhone = phone.toString().replace(/\D/g, '')
    if (normalizedPhone.length === 10) normalizedPhone = '52' + normalizedPhone
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone
    const toWhatsApp = 'whatsapp:' + normalizedPhone

    const message = getMessage(event, booking || {})

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`

    // Usar encodeURIComponent para el header de autenticacion
    const auth = `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
    const encoder = new TextEncoder()
    const data = encoder.encode(auth)
    const base64 = btoa(String.fromCharCode(...data))

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${base64}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: TWILIO_FROM,
        To:   toWhatsApp,
        Body: message,
      }).toString(),
    })

    const twilioData = await twilioResponse.json()
    console.log('Twilio response status:', twilioResponse.status)
    console.log('Twilio response:', JSON.stringify(twilioData))

    if (!twilioResponse.ok) {
      return new Response(JSON.stringify({ error: twilioData.message, code: twilioData.code }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, sid: twilioData.sid }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('Error:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})