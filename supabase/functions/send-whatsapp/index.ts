// send-whatsapp v9 — número propio +5215539377258 + Content Templates aprobados
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? ''
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN') ?? ''
const TWILIO_FROM        = 'whatsapp:+5215539377258'
const TWILIO_FROM_SMS    = Deno.env.get('TWILIO_FROM_SMS') ?? ''
const APP_URL            = 'https://mazclean.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Content Template SIDs ───────────────────────────────────────────────────
const TEMPLATE_SIDS: Record<string, string> = {
  booking_created:              'HX1f453ed66c36623cac84a2906d1f3a4c',
  operator_assigned:            'HX22d43581e868f0287be84a75d2987129',
  on_the_way:                   'HXd2a05ad2870ddc9299a7f845faa9088a',
  llegando:                     'HX40f974fc28c8c86904b68226df46b87b',
  arrived:                      'HXc5b8063babff2fb775dc9e6505a42965',
  washing:                      'HXd82f427e886a5cfe4c91a2e70a19e7f1',
  done:                         'HX2ffac597975c104dbeaaad4f3bdbce44',
  booking_cancelled:            'HXc9e107717c0464b47a43d6d3327d8d8e',
  booking_searching:            'HXfaf03fa2fca00d41bfd8fd58f371caa2',
  operator_service_request:     'HXdd7406feca5d26bc978928f125c3a650',
  operator_request_taken:       'HX3c5584f4f4b8a44f7549b8ff14aad300',
  operator_request_expired:     'HXeca8d8b6007d2802cf88825270c6c5c9',
  operator_docs_required:       'HX9d976a938e1932c4cadb12d4a9d26b91',
  operator_approved:            'HX30cddade3f8f08e9121d30c601edffdc',
  operator_rejected:            'HXe67103a838257b3edc1026638c82c4fd',
  admin_assignment_needed:      'HXb5eab312286b44167a137912c49d0338',
}

// ── Variables por template (orden exacto de {{1}}, {{2}}...) ───────────────
function getTemplateVariables(event: string, data: any): Record<string, string> {
  const ref        = data.booking_ref          || ''
  const svc        = data.service_name         || 'tu lavado'
  const date       = data.scheduled_date       || ''
  const time       = data.scheduled_time       || ''
  const timeFrom   = data.scheduled_time_from?.slice(0, 5) || ''
  const timeTo     = data.scheduled_time_to?.slice(0, 5)   || ''
  const price      = data.total_price          || ''
  const op         = data.operator_name        || 'tu operador'
  const address    = data.address_line         || ''
  const bookingId  = data.booking_id           || ''
  const trackingUrl = bookingId ? `${APP_URL}/tracking/${bookingId}` : APP_URL
  const clientName = data.client_name          || ''
  const minutes    = data.minutes_away         || '5'
  const docsList   = data.docs_list            || ''
  const reason     = data.rejection_reason     || 'No cumple con los requisitos.'

  switch (event) {
    case 'booking_created':
      return { '1': ref, '2': svc, '3': date, '4': timeFrom, '5': timeTo, '6': String(price) }
    case 'operator_assigned':
      return { '1': ref, '2': op, '3': date, '4': time }
    case 'on_the_way':
      return { '1': ref, '2': op, '3': trackingUrl }
    case 'llegando':
      return { '1': String(minutes), '2': ref }
    case 'arrived':
      return { '1': ref, '2': op }
    case 'washing':
      return { '1': ref }
    case 'done':
      return { '1': ref, '2': svc, '3': String(price) }
    case 'booking_cancelled':
      return { '1': ref }
    case 'booking_searching':
      return { '1': ref, '2': clientName, '3': date }
    case 'operator_service_request':
      return { '1': ref, '2': svc, '3': date, '4': timeFrom, '5': timeTo, '6': String(price), '7': APP_URL }
    case 'operator_request_taken':
      return { '1': ref, '2': date }
    case 'operator_request_expired':
      return { '1': ref, '2': date }
    case 'operator_docs_required':
      return { '1': op, '2': docsList, '3': APP_URL }
    case 'operator_approved':
      return { '1': op, '2': APP_URL }
    case 'operator_rejected':
      return { '1': op, '2': reason }
    case 'admin_assignment_needed':
      return { '1': ref, '2': svc, '3': date, '4': timeFrom, '5': timeTo, '6': address, '7': String(price), '8': APP_URL }
    default:
      return {}
  }
}

function getFallbackMessage(event: string, data: any): string {
  const ref = data.booking_ref || ''
  return `Maz Clean — Actualizacion reservacion ${ref}`
}

const getBase64Auth = () => {
  const auth    = `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
  const encoder = new TextEncoder()
  const bytes   = encoder.encode(auth)
  return btoa(String.fromCharCode(...bytes))
}

const sendWithTemplate = async (to: string, contentSid: string, variables: Record<string, string>) => {
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const params = new URLSearchParams({
    From:             TWILIO_FROM,
    To:               to,
    ContentSid:       contentSid,
    ContentVariables: JSON.stringify(variables),
  })
  const response = await fetch(twilioUrl, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${getBase64Auth()}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })
  const result = await response.json()
  return { ok: response.ok, data: result }
}

const sendSMS = async (to: string, body: string) => {
  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
  const response  = await fetch(twilioUrl, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${getBase64Auth()}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ From: TWILIO_FROM_SMS, To: to, Body: body }).toString(),
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
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let normalizedPhone = phone.toString().replace(/\D/g, '')
    if (normalizedPhone.length === 10) normalizedPhone = '52' + normalizedPhone
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone

    const data       = booking || {}
    const contentSid = TEMPLATE_SIDS[event]
    const variables  = getTemplateVariables(event, data)
    const results: any = {}

    if (contentSid) {
      const waTo     = 'whatsapp:' + normalizedPhone
      const waResult = await sendWithTemplate(waTo, contentSid, variables)
      results.whatsapp = { ok: waResult.ok, sid: waResult.data.sid, error: waResult.data.message }
    } else {
      console.warn(`[send-whatsapp] Sin template para evento: ${event}`)
      results.whatsapp = { ok: false, error: `Sin template para evento: ${event}` }
    }

    if (TWILIO_FROM_SMS) {
      const smsBody   = getFallbackMessage(event, data)
      const smsResult = await sendSMS(normalizedPhone, smsBody)
      results.sms = { ok: smsResult.ok, sid: smsResult.data.sid, error: smsResult.data.message }
    }

    const anySuccess = results.whatsapp?.ok || results.sms?.ok

    if (!anySuccess) {
      return new Response(
        JSON.stringify({ error: results.whatsapp?.error || results.sms?.error, results }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )

  } catch (err) {
    console.error('[send-whatsapp] Error:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})