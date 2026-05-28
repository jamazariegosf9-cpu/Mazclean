// supabase/functions/follow-up-leads/index.ts
// follow-up-leads v1.0 — Seguimiento automático a prospectos del anuncio Facebook
// Envía hasta 2 mensajes de seguimiento a prospectos que no completaron el registro
// Flujo: 2h sin registrar → mensaje 1 | 24h sin registrar → mensaje 2 | registrado → convertido

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')              ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const TWILIO_ACCOUNT_SID   = Deno.env.get('TWILIO_ACCOUNT_SID')        ?? ''
const TWILIO_AUTH_TOKEN    = Deno.env.get('TWILIO_AUTH_TOKEN')          ?? ''
const TWILIO_FROM_WA       = Deno.env.get('TWILIO_FROM_WHATSAPP')       ?? 'whatsapp:+5215539377258'

const APP_URL = 'https://mazclean.vercel.app'

// Tiempos de seguimiento
const FOLLOWUP_1_HOURS = 2   // 2 horas después de la última interacción
const FOLLOWUP_2_HOURS = 24  // 24 horas después de la primera interacción

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── Mensajes de seguimiento ───────────────────────────────────────────────────
const FOLLOWUP_1_MESSAGE = `¡Hola! Soy Max de MAZ CLEAN 👋

Vi que estuviste a punto de registrarte como operador. ¿Pudiste completar tu registro?

Recuerda que durante mayo y junio tu membresía es COMPLETAMENTE GRATIS 🎁

Si tuviste algún problema al registrarte, con gusto te ayudo. Solo entra a:
${APP_URL}

¿Necesitas ayuda? 😊`

const FOLLOWUP_2_MESSAGE = `¡Hola de nuevo! Soy Max de MAZ CLEAN 🚗

Este es nuestro último recordatorio — la promoción de apertura donde tu membresía es GRATIS solo dura hasta junio.

Si te interesa generar ingresos extra lavando autos a domicilio en CDMX, este es el momento:

✅ Membresía gratis mayo y junio
✅ Certificación de 40 min desde tu celular
✅ Tú eliges tu zona y horario

Regístrate ahora: ${APP_URL}

Si ya no te interesa, no hay problema — ¡mucho éxito! 👍`

// ── Enviar WhatsApp vía Twilio ────────────────────────────────────────────────
async function sendWA(phone: string, body: string): Promise<boolean> {
  try {
    const digits  = phone.replace(/\D/g, '')
    const waPhone = digits.startsWith('52') ? `+${digits}` : `+52${digits.slice(-10)}`
    const waTo    = `whatsapp:${waPhone}`
    const auth    = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: TWILIO_FROM_WA,
          To:   waTo,
          Body: body,
        }).toString(),
      }
    )

    const data = await res.json()
    if (!res.ok) {
      console.error(`[TWILIO] Error enviando a ${waPhone}:`, data?.message)
      return false
    }
    console.log(`[TWILIO] Enviado a ${waPhone} — sid:`, data.sid)
    return true
  } catch (e: any) {
    console.error(`[TWILIO] Excepción enviando a ${phone}:`, e.message)
    return false
  }
}

// ── Guardar mensaje de seguimiento en DB ──────────────────────────────────────
async function saveFollowupMessage(supabase: any, phone: string, content: string): Promise<void> {
  try {
    await supabase.from('messages').insert({
      conversation_id: phone,
      from_phone:      Deno.env.get('TWILIO_FROM_WHATSAPP')?.replace('whatsapp:', '') ?? '+5215539377258',
      to_phone:        phone,
      direction:       'outbound',
      channel:         'whatsapp',
      sender_role:     'admin',
      content,
      read_at:         new Date().toISOString(),
    })
  } catch (e: any) {
    console.error('[DB] Error guardando mensaje de seguimiento:', e.message)
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    const now      = new Date()

    console.log(`[follow-up-leads] Ejecutando a ${now.toISOString()}`)

    // ── 1. Marcar leads como convertidos si ya se registraron ─────────────────
    const { data: pendingLeads } = await supabase
      .from('ad_leads')
      .select('id, phone')
      .in('followup_status', ['pending', 'followup_1', 'followup_2'])

    for (const lead of pendingLeads ?? []) {
      // Buscar si el teléfono ya tiene un perfil registrado
      const digits10 = lead.phone.replace(/^\+52/, '').replace(/^\+/, '')
      const digits12 = '52' + digits10.slice(-10)

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .or(`phone.eq.${digits10},phone.eq.${lead.phone},phone.eq.+${digits12}`)
        .limit(1)

      if (profile?.length) {
        await supabase
          .from('ad_leads')
          .update({
            followup_status: 'converted',
            converted_at:    now.toISOString(),
            profile_id:      profile[0].id,
          })
          .eq('id', lead.id)
        console.log(`[CONVERTED] ${lead.phone} se registró ✅`)
      }
    }

    // ── 2. Traer leads pendientes de seguimiento (no convertidos) ─────────────
    const { data: leads } = await supabase
      .from('ad_leads')
      .select('id, phone, created_at, followup_status, followup_1_sent_at, followup_2_sent_at')
      .in('followup_status', ['pending', 'followup_1'])
      .order('created_at', { ascending: true })

    let sent1 = 0, sent2 = 0, skipped = 0

    for (const lead of leads ?? []) {
      const createdAt    = new Date(lead.created_at)
      const hoursElapsed = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60)

      // ── Seguimiento 2 — 24h después, solo si ya se envió el 1 ────────────
      if (
        lead.followup_status === 'followup_1' &&
        !lead.followup_2_sent_at &&
        hoursElapsed >= FOLLOWUP_2_HOURS
      ) {
        console.log(`[FOLLOWUP 2] Enviando a ${lead.phone} (${hoursElapsed.toFixed(1)}h desde creación)`)
        const ok = await sendWA(lead.phone, FOLLOWUP_2_MESSAGE)
        if (ok) {
          await saveFollowupMessage(supabase, lead.phone, FOLLOWUP_2_MESSAGE)
          await supabase
            .from('ad_leads')
            .update({
              followup_status:    'followup_2',
              followup_2_sent_at: now.toISOString(),
              notes:              `Followup 2 enviado a las ${now.toISOString()}`,
            })
            .eq('id', lead.id)
          sent2++
        }
        continue
      }

      // ── Seguimiento 1 — 2h después ────────────────────────────────────────
      if (
        lead.followup_status === 'pending' &&
        !lead.followup_1_sent_at &&
        hoursElapsed >= FOLLOWUP_1_HOURS
      ) {
        console.log(`[FOLLOWUP 1] Enviando a ${lead.phone} (${hoursElapsed.toFixed(1)}h desde creación)`)
        const ok = await sendWA(lead.phone, FOLLOWUP_1_MESSAGE)
        if (ok) {
          await saveFollowupMessage(supabase, lead.phone, FOLLOWUP_1_MESSAGE)
          await supabase
            .from('ad_leads')
            .update({
              followup_status:    'followup_1',
              followup_1_sent_at: now.toISOString(),
              notes:              `Followup 1 enviado a las ${now.toISOString()}`,
            })
            .eq('id', lead.id)
          sent1++
        }
        continue
      }

      skipped++
    }

    // ── 3. Marcar como inactivos leads con followup_2 enviado hace +48h ──────
    const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
    await supabase
      .from('ad_leads')
      .update({ followup_status: 'inactive' })
      .eq('followup_status', 'followup_2')
      .lt('followup_2_sent_at', cutoff48h)

    const summary = {
      timestamp:  now.toISOString(),
      followup_1: sent1,
      followup_2: sent2,
      skipped,
      total:      (leads ?? []).length,
    }

    console.log('[follow-up-leads] Resumen:', JSON.stringify(summary))

    return new Response(JSON.stringify(summary), {
      status:  200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    console.error('[follow-up-leads] Error fatal:', err.message)
    return new Response(JSON.stringify({ error: err.message }), {
      status:  500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
