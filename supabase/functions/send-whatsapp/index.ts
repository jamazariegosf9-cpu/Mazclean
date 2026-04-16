// send-whatsapp v8 — agrega booking_searching (notificación al cliente cuando 3 rondas fallan)
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
  const ref       = data.booking_ref    || ''
  const svc       = data.service_name   || 'tu lavado'
  const date      = data.scheduled_date || ''
  const time      = data.scheduled_time || ''
  const timeFrom  = data.scheduled_time_from?.slice(0,5) || ''
  const timeTo    = data.scheduled_time_to?.slice(0,5)   || ''
  const price     = data.total_price    || ''
  const op        = data.operator_name  || 'tu operador'
  const address   = data.address_line   || ''
  const bookingId = data.booking_id     || ''
  const trackingUrl = bookingId ? `${APP_URL}/tracking/${bookingId}` : APP_URL

  switch (event) {

    // ── Mensajes al cliente ─────────────────────────────────────────────────
    case 'booking_created':
      return [
        `Maz Clean - Reservacion recibida!`,
        ``,
        `Ref: ${ref}`,
        `Servicio: ${svc}`,
        `Fecha: ${date}`,
        `Horario solicitado: ${timeFrom} a ${timeTo} hrs`,
        `Total: $${price} MXN`,
        ``,
        `Estamos buscando el mejor operador para ti. Te avisamos en breve!`,
      ].join('\n')

    case 'booking_searching':
      return [
        `⏳ Maz Clean — Seguimos buscando tu operador`,
        ``,
        `Ref: ${ref}`,
        ``,
        `Hola${data.client_name ? ` ${data.client_name}` : ''}! Tu reservacion para el ${date} sigue activa.`,
        ``,
        `No encontramos un operador disponible de forma automatica en tu zona, pero nuestro equipo ya esta buscando uno manualmente para ti.`,
        ``,
        `Te notificaremos en cuanto tengamos a alguien asignado. Disculpa la espera!`,
        ``,
        `Si deseas cancelar o tienes dudas, respondenos a este mensaje.`,
      ].join('\n')

    case 'operator_assigned':
      return [
        `Maz Clean - Operador asignado!`,
        ``,
        `Ref: ${ref}`,
        `Operador: ${op}`,
        `Fecha: ${date} a las ${time}`,
        ``,
        `Te avisaremos cuando este en camino.`,
      ].join('\n')

    case 'on_the_way':
      return [
        `Maz Clean - Tu experto ya va en camino! 🚗💨`,
        ``,
        `Ref: ${ref}`,
        `${op} se dirige a tu ubicacion.`,
        ``,
        `Sigue su llegada en tiempo real aqui:`,
        `${trackingUrl}`,
        ``,
        `Preparate para dejar tu auto IMPECABLE! ✨`,
      ].join('\n')

    case 'llegando':
      return [
        `Maz Clean - Estamos a ${data.minutes_away || 5} minutos! 🕒`,
        ``,
        `Ref: ${ref}`,
        `Por favor ten las llaves a la mano o el acceso listo.`,
        ``,
        `Vamos a dejar tu auto IMPECABLE! ✨`,
      ].join('\n')

    case 'arrived':
      return [
        `Maz Clean - Tu operador ha llegado!`,
        ``,
        `Ref: ${ref}`,
        `${op} esta en tu ubicacion. El lavado comenzara en unos momentos!`,
      ].join('\n')

    case 'washing':
      return [
        `Maz Clean - Tu vehiculo esta siendo lavado!`,
        ``,
        `Ref: ${ref}`,
        ``,
        `Te avisaremos cuando este listo.`,
      ].join('\n')

    case 'done':
      return [
        `Maz Clean - Tu vehiculo esta listo! 🎉`,
        ``,
        `Ref: ${ref}`,
        `Servicio completado: ${svc}`,
        `Total: $${price} MXN`,
        ``,
        `Gracias por usar Maz Clean! Tu opinion nos importa, calificanos en la app.`,
      ].join('\n')

    case 'booking_cancelled':
      return [
        `Maz Clean - Reservacion cancelada`,
        ``,
        `Ref: ${ref}`,
        `Lamentablemente no encontramos un operador disponible para tu zona en este momento.`,
        ``,
        `Te invitamos a intentar de nuevo mas tarde o en un horario diferente.`,
        `Disculpa los inconvenientes.`,
      ].join('\n')

    // ── Mensajes al operador ────────────────────────────────────────────────
    case 'operator_service_request':
      if (data.custom_message) return data.custom_message
      return [
        `🚗 Maz Clean — Nueva solicitud de servicio!`,
        ``,
        `Ref: ${ref}`,
        `Servicio: ${svc}`,
        `Fecha: ${date}`,
        `Horario: ${timeFrom} a ${timeTo} hrs`,
        `Pago: $${price} MXN`,
        ``,
        `⏱ Tienes 5 minutos para aceptar.`,
        ``,
        `Entra a la app para aceptar:`,
        `${APP_URL}`,
      ].join('\n')

    case 'operator_request_taken':
      return [
        `Maz Clean - Solicitud asignada a otro operador`,
        ``,
        `Ref: ${ref}`,
        `El servicio del ${date} ya fue tomado por otro operador.`,
        ``,
        `Sigue pendiente de nuevas solicitudes en la app!`,
      ].join('\n')

    case 'operator_request_expired':
      return [
        `Maz Clean - Solicitud expirada`,
        ``,
        `Ref: ${ref}`,
        `El tiempo para aceptar el servicio del ${date} ha expirado.`,
        ``,
        `Mantente activo en la app para no perder proximas oportunidades.`,
      ].join('\n')

    case 'operator_docs_required':
      return [
        `⚠️ Maz Clean — Documentos requeridos`,
        ``,
        `Hola ${data.operator_name || 'operador'},`,
        ``,
        `Revisamos tu solicitud y necesitamos que corrijas los siguientes documentos:`,
        ``,
        data.docs_list || '',
        ``,
        `Ingresa a la app para corregirlos:`,
        `${APP_URL}`,
        ``,
        `Una vez que los corrijas tu solicitud sera revisada nuevamente.`,
      ].join('\n')

    case 'operator_approved':
      return [
        `✅ Maz Clean — Solicitud aprobada!`,
        ``,
        `Hola ${data.operator_name || 'operador'},`,
        ``,
        `Tu solicitud ha sido aprobada. Ya puedes recibir servicios en la app.`,
        ``,
        `Bienvenido al equipo Maz Clean! 🎉`,
        ``,
        `${APP_URL}`,
      ].join('\n')

    case 'operator_rejected':
      return [
        `❌ Maz Clean — Solicitud rechazada`,
        ``,
        `Hola ${data.operator_name || 'operador'},`,
        ``,
        `Lamentablemente tu solicitud no fue aprobada.`,
        ``,
        `Motivo: ${data.rejection_reason || 'No cumple con los requisitos.'}`,
        ``,
        `Si tienes dudas contacta a nuestro equipo.`,
      ].join('\n')

    // ── Mensajes al admin ───────────────────────────────────────────────────
    case 'admin_assignment_needed':
      return [
        `⚠️ Maz Clean Admin — Servicio sin operador`,
        ``,
        `Ref: ${ref}`,
        `Servicio: ${svc}`,
        `Fecha: ${date}`,
        `Horario: ${timeFrom} a ${timeTo} hrs`,
        `Direccion: ${address}`,
        `Total: $${price} MXN`,
        ``,
        `Ningun operador acepto en las 3 rondas automaticas.`,
        `Ingresa al panel de admin para asignar manualmente o cancelar.`,
        ``,
        `${APP_URL}`,
      ].join('\n')

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

    // ── WhatsApp ────────────────────────────────────────────────────────────
    const waTo     = 'whatsapp:' + normalizedPhone
    const waResult = await sendTwilioMessage(TWILIO_FROM, waTo, message)
    results.whatsapp = { ok: waResult.ok, sid: waResult.data.sid, error: waResult.data.message }

    // ── SMS paralelo ────────────────────────────────────────────────────────
    if (TWILIO_FROM_SMS) {
      const smsResult = await sendTwilioMessage(TWILIO_FROM_SMS, normalizedPhone, message)
      results.sms = { ok: smsResult.ok, sid: smsResult.data.sid, error: smsResult.data.message }
    }

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
