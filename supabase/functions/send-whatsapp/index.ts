// send-whatsapp v11.1 — retry automático + whatsapp_log
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TWILIO_ACCOUNT_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')          ?? ''
const TWILIO_AUTH_TOKEN    = Deno.env.get('TWILIO_AUTH_TOKEN')            ?? ''
const TWILIO_FROM          = Deno.env.get('TWILIO_FROM_WHATSAPP')         ?? 'whatsapp:+5215539377258'
const TWILIO_FROM_SMS      = Deno.env.get('TWILIO_FROM_SMS')              ?? ''
const APP_URL              = 'https://mazclean.vercel.app'
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')                 ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')    ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Content Template SIDs ───────────────────────────────────────────────────
const TEMPLATE_SIDS: Record<string, string> = {
  booking_created:          'HX1f453ed66c36623cac84a2906d1f3a4c',
  operator_assigned:        'HX22d43581e868f0287be84a75d2987129',
  on_the_way:               'HXd2a05ad2870ddc9299a7f845faa9088a',
  llegando:                 'HX40f974fc28c8c86904b68226df46b87b',
  arrived:                  'HXc5b8063babff2fb775dc9e6505a42965',
  washing:                  'HXd82f427e886a5cfe4c91a2e70a19e7f1',
  done:                     'HX2ffac597975c104dbeaaad4f3bdbce44',
  booking_cancelled:        'HXc9e107717c0464b47a43d6d3327d8d8e',
  booking_searching:        'HXfaf03fa2fca00d41bfd8fd58f371caa2',
  operator_service_request: 'HX5b291424e298026b897d278bb5353b64', // v3 ✅
  operator_request_taken:   'HX3c5584f4f4b8a44f7549b8ff14aad300',
  operator_request_expired: 'HXeca8d8b6007d2802cf88825270c6c5c9',
  operator_docs_required:   'HX9d976a938e1932c4cadb12d4a9d26b91',
  operator_approved:        'HXfacd0cf1816e308d26f3baf3d65c0bde', // v2 ✅
  operator_rejected:        'HXe67103a838257b3edc1026638c82c4fd',
  admin_assignment_needed:  'HX1d59669c141a59ab2b20fff7e894fa68', // v2 ✅
}

// ── Variables por template ──────────────────────────────────────────────────
function getTemplateVariables(event: string, data: any): Record<string, string> {
  const ref         = data.booking_ref          || ''
  const svc         = data.service_name         || 'tu lavado'
  const date        = data.scheduled_date       || ''
  const time        = data.scheduled_time       || ''
  const timeFrom    = data.scheduled_time_from?.slice(0, 5) || ''
  const timeTo      = data.scheduled_time_to?.slice(0, 5)   || ''
  const price       = data.total_price          || ''
  const op          = data.operator_name        || 'tu operador'
  const address     = data.address_line         || ''
  const bookingId   = data.booking_id           || ''
  const trackingUrl = bookingId ? `${APP_URL}/tracking/${bookingId}` : APP_URL
  const clientName  = data.client_name          || ''
  const minutes     = data.minutes_away         || '5'
  const docsList    = data.docs_list            || ''
  const reason      = data.rejection_reason     || 'No cumple con los requisitos.'

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

// ── Envío individual a Twilio ───────────────────────────────────────────────
const sendWithTemplate = async (
  to: string,
  contentSid: string,
  variables: Record<string, string>
) => {
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

// ── Nivel 1: Retry automático (1 reintento tras 2s) ────────────────────────
const sendWithRetry = async (
  to: string,
  contentSid: string,
  variables: Record<string, string>
): Promise<{ ok: boolean; data: any; retried: boolean }> => {
  const first = await sendWithTemplate(to, contentSid, variables)
  if (first.ok) return { ...first, retried: false }
  await new Promise(resolve => setTimeout(resolve, 2000))
  const second = await sendWithTemplate(to, contentSid, variables)
  return { ...second, retried: true }
}

// ── Nivel 2: Insertar en whatsapp_log ──────────────────────────────────────
const logWhatsApp = async (params: {
  booking_id:   string | null
  operator_id:  string | null
  event:        string
  phone:        string
  booking_data: any
  status:       'sent' | 'failed' | 'retried'
  error:        string | null
}) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.warn('[whatsapp_log] Faltan variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
    return
  }
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: {
        persistSession:   false,
        autoRefreshToken: false,
      },
    })
    const { error } = await supabase.from('whatsapp_log').insert({
      booking_id:   params.booking_id  || null,
      operator_id:  params.operator_id || null,
      event:        params.event,
      phone:        params.phone,
      booking_data: params.booking_data,
      status:       params.status,
      error:        params.error,
      attempted_at: new Date().toISOString(),
      resolved_at:  params.status === 'sent' || params.status === 'retried'
                      ? new Date().toISOString()
                      : null,
    })
    if (error) console.error('[whatsapp_log] Error insert:', error.message)
  } catch (logErr) {
    console.error('[whatsapp_log] Error inesperado:', logErr)
  }
}

// ── Eventos de operador (para operator_id en log) ──────────────────────────
const OPERATOR_EVENTS = new Set([
  'operator_service_request',
  'operator_request_taken',
  'operator_request_expired',
  'operator_docs_required',
  'operator_approved',
  'operator_rejected',
  'admin_assignment_needed',
])

// ── Handler principal ───────────────────────────────────────────────────────
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

    const bookingId  = data.booking_id  || null
    const operatorId = OPERATOR_EVENTS.has(event) ? (data.operator_id || null) : null

    if (contentSid) {
      const waTo     = 'whatsapp:' + normalizedPhone
      const waResult = await sendWithRetry(waTo, contentSid, variables)

      results.whatsapp = {
        ok:      waResult.ok,
        sid:     waResult.data.sid,
        error:   waResult.data.message,
        retried: waResult.retried,
      }

      const logStatus = waResult.ok
        ? (waResult.retried ? 'retried' : 'sent')
        : 'failed'

      await logWhatsApp({
        booking_id:   bookingId,
        operator_id:  operatorId,
        event,
        phone:        normalizedPhone,
        booking_data: data,
        status:       logStatus,
        error:        waResult.ok ? null : (waResult.data.message || 'Error desconocido'),
      })

    } else {
      console.warn(`[send-whatsapp] Sin template para evento: ${event}`)
      results.whatsapp = { ok: false, error: `Sin template para evento: ${event}` }

      await logWhatsApp({
        booking_id:   bookingId,
        operator_id:  operatorId,
        event,
        phone:        normalizedPhone,
        booking_data: data,
        status:       'failed',
        error:        `Sin template para evento: ${event}`,
      })
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
