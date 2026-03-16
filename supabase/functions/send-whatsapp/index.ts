// supabase/functions/send-whatsapp/index.ts
// Edge Function — envía mensajes de WhatsApp via Twilio Sandbox
 
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
 
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN')!
const TWILIO_FROM        = 'whatsapp:+14155238886' // Número Sandbox de Twilio
 
const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
 
// Mensajes por evento
function getMessage(event: string, data: any): string {
  const ref   = data.booking_ref  || ''
  const svc   = data.service_name || 'tu lavado'
  const date  = data.scheduled_date || ''
  const time  = data.scheduled_time || ''
  const price = data.total_price  || ''
 
  switch (event) {
    case 'booking_created':
      return `✅ *Maz Clean* — ¡Reservación recibida!\n\n📋 Ref: ${ref}\n🧽 Servicio: ${svc}\n📅 Fecha: ${date} a las ${time}\n💰 Total: $${price} MXN\n\nEn breve te asignaremos un operador. ¡Gracias por elegirnos! 🚗`
 
    case 'operator_assigned':
      return `🧹 *Maz Clean* — ¡Operador asignado!\n\n📋 Ref: ${ref}\n👨‍🔧 Operador: ${data.operator_name || 'nuestro equipo'}\n📅 ${date} a las ${time}\n\nTe avisaremos cuando esté en camino. 🚀`
 
    case 'on_the_way':
      return `🚗 *Maz Clean* — ¡Tu operador está en camino!\n\n📋 Ref: ${ref}\n👨‍🔧 ${data.operator_name || 'Tu operador'} se dirige a tu ubicación.\n\nPuedes ver su ubicación en tiempo real en la app. 📍`
 
    case 'arrived':
      return `📍 *Maz Clean* — ¡Tu operador ha llegado!\n\n📋 Ref: ${ref}\n👨‍🔧 ${data.operator_name || 'Tu operador'} está en tu ubicación.\n\n¡El lavado comenzará en unos momentos! 🧽`
 
    case 'washing':
      return `🧽 *Maz Clean* — ¡Tu vehículo está siendo lavado!\n\n📋 Ref: ${ref}\n\nTe avisaremos cuando esté listo. ✨`
 
    case 'done':
      return `✅ *Maz Clean* — ¡Tu vehículo está listo!\n\n📋 Ref: ${ref}\n🚗 Tu ${svc} ha sido completado.\n💰 Total pagado: $${price} MXN\n\n¡Gracias por usar Maz Clean! ⭐ Si quedaste satisfecho, comparte tu experiencia.`
 
    default:
      return `*Maz Clean* — Actualización de tu reservación ${ref}`
  }
}
 
serve(async (req) => {
  // CORS preflight
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
 
    // Normalizar teléfono mexicano → formato WhatsApp
    let normalizedPhone = phone.toString().replace(/\D/g, '')
    if (normalizedPhone.length === 10) normalizedPhone = '52' + normalizedPhone
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone
    const toWhatsApp = 'whatsapp:' + normalizedPhone
 
    const message = getMessage(event, booking || {})
 
    // Llamar a la API de Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
    const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)
 
    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        From: TWILIO_FROM,
        To:   toWhatsApp,
        Body: message,
      }),
    })
 
    const twilioData = await twilioResponse.json()
 
    if (!twilioResponse.ok) {
      console.error('Twilio error:', twilioData)
      return new Response(JSON.stringify({ error: twilioData.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
 
    return new Response(JSON.stringify({ success: true, sid: twilioData.sid }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
 
  } catch (err) {
    console.error('Error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})