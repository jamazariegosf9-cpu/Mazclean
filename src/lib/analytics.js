// src/lib/analytics.js
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ⚠️ ACCIÓN REQUERIDA POST-DEPLOY:
// Reemplaza el fallback de abajo con tu ID real de conversión de Google Ads
// (formato 'AW-XXXXXXXXX/YYYYYYYYYYYYYYYY'). Idealmente configúralo como
// variable de entorno VITE_GOOGLE_ADS_CONVERSION_ID en Vercel para no
// tocar código cada vez que cambie.
// A julio 2026 no existe cuenta de Google Ads para MAZ CLEAN, por eso
// leadRegistered() usa provider='meta' por default (ver más abajo) y no
// se dispara este branch en el flujo normal. Cuando exista la cuenta,
// define VITE_GOOGLE_ADS_CONVERSION_ID en Vercel con el valor real.
const GOOGLE_ADS_CONVERSION_ID =
  import.meta.env.VITE_GOOGLE_ADS_CONVERSION_ID || 'TU_ID_DE_CONVERSION_AQUI'

function getSessionId() {
  const KEY = 'maz_session_id'
  let sid = sessionStorage.getItem(KEY)
  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).slice(2) + '_' + Date.now()
    sessionStorage.setItem(KEY, sid)
  }
  return sid
}

function isAdminUser() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (!stored) return false
    const parsed = JSON.parse(stored)
    const role = parsed?.profile?.role || parsed?.user?.user_metadata?.role
    return role === 'admin'
  } catch { return false }
}

function getCurrentUserId() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (!stored) return null
    const parsed = JSON.parse(stored)
    const role = parsed?.profile?.role
    if (role === 'admin') return null
    return parsed?.profile?.id || parsed?.user?.id || null
  } catch { return null }
}

function getTrafficSource() {
  const params = new URLSearchParams(window.location.search)
  const utmSource   = params.get('utm_source')
  const utmMedium   = params.get('utm_medium')
  const utmCampaign = params.get('utm_campaign')
  const fbclid      = params.get('fbclid')

  if (fbclid || utmSource === 'facebook') return { source: 'facebook_ads', medium: utmMedium || 'paid', campaign: utmCampaign || null }
  if (utmSource)                          return { source: utmSource, medium: utmMedium || 'unknown', campaign: utmCampaign || null }
  if (document.referrer.includes('google')) return { source: 'google', medium: 'organic', campaign: null }
  if (document.referrer)                  return { source: new URL(document.referrer).hostname, medium: 'referral', campaign: null }
  return { source: 'direct', medium: 'none', campaign: null }
}

/**
 * Registra un evento en la tabla analytics_events (Supabase).
 *
 * @param {string} eventName - Nombre del evento.
 * @param {object} [metadata] - Datos adicionales del evento.
 * @param {object} [options] - options.userId permite forzar el user_id
 *   cuando el evento se dispara ANTES de que exista sesión en
 *   localStorage (ej. justo después de un signUp exitoso, antes del
 *   signIn posterior). Sin esto, el evento se guardaría con user_id
 *   null y se perdería la atribución del lead.
 */
export async function trackEvent(eventName, metadata = {}, options = {}) {
  if (isAdminUser()) return

  try {
    const resolvedUserId = options.userId ?? getCurrentUserId()

    const payload = {
      event_name: eventName,
      user_id:    resolvedUserId,
      session_id: getSessionId(),
      page:       window.location.pathname + window.location.search,
      metadata:   {
        ...metadata,
        ...getTrafficSource(),
        user_agent:  navigator.userAgent.slice(0, 200),
        screen_w:    window.screen.width,
        timestamp:   new Date().toISOString(),
      },
    }

    fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(payload),
    }).catch((err) => {
      // El .catch() silencioso original tragaba errores de RLS sin dejar
      // rastro. En dev al menos lo dejamos visible en consola.
      if (import.meta.env.DEV) console.warn('[Analytics] trackEvent fetch error:', err)
    })
  } catch (err) {
    if (import.meta.env.DEV) console.warn('[Analytics] trackEvent error:', err)
  }
}

export const Analytics = {
  pageView:             (page)     => trackEvent('page_view',              { page }),
  clickOperador:        ()         => trackEvent('click_quiero_operador'),
  clickReservar:        ()         => trackEvent('click_reservar'),
  onboardingStart:      ()         => trackEvent('onboarding_start'),
  onboardingStep:       (step)     => trackEvent('onboarding_step',        { step }),
  onboardingComplete:   ()         => trackEvent('onboarding_complete'),
  facebookAdArrival:    (campaign) => trackEvent('facebook_ad_arrival',    { campaign }),
  authModalOpen:        (tab)      => trackEvent('auth_modal_open',        { tab }),
  loginSuccess:         (role)     => trackEvent('login_success',          { role }),
  bookingStarted:       ()         => trackEvent('booking_started'),
  bookingCompleted:     (service)  => trackEvent('booking_completed',      { service }),
  sessionStart:         ()         => trackEvent('session_start'),

  /**
   * Registra un lead (registro de cliente u operador) y dispara los
   * píxeles de conversión de Meta y Google Ads.
   *
   * @param {object} params
   * @param {'cliente'|'operador'} params.role - Tipo de registro.
   * @param {string} [params.userId] - ID del usuario recién creado.
   *   Pásalo explícitamente cuando el evento se dispare antes del
   *   signIn (localStorage aún no tiene sesión en ese momento).
   * @param {'all'|'meta'|'google'} [params.provider='meta'] - Qué píxeles disparar.
   *   Default 'meta' porque a julio 2026 no existe cuenta de Google Ads
   *   activa para MAZ CLEAN. Cuando se cree la cuenta y se configure
   *   GOOGLE_ADS_CONVERSION_ID, cambiar el default a 'all' (o pasar
   *   provider: 'all' explícito en las llamadas que lo necesiten).
   *
   * ⚠️ BREAKING CHANGE vs. la versión anterior: el parámetro ahora es
   * un objeto, no un string posicional ('meta' | 'google' | 'all').
   * Si existe alguna otra llamada a Analytics.leadRegistered('meta')
   * o similar en otro archivo del repo (fuera de AuthModal.jsx),
   * debe actualizarse a esta firma o su lógica de provider se rompe
   * silenciosamente. Recomiendo correr:
   *   grep -rn "leadRegistered(" src/
   * antes de desplegar, para confirmar que no hay otros call sites.
   */
  leadRegistered: ({ role, userId, provider = 'meta' } = {}) => {
    trackEvent('lead_registered', { role }, { userId })

    if (provider === 'all' || provider === 'meta') {
      if (typeof window.fbq === 'function') {
        window.fbq('track', 'Lead', {
          content_name:     role === 'operador' ? 'registro_operador' : 'registro_cliente',
          content_category: role || 'unknown',
        })
        // Evento custom separado, exclusivo de operadores. Permite crear
        // una Conversión Personalizada en Meta Ads Manager y usarla como
        // meta de optimización de la campaña de reclutamiento SIN mezclar
        // señal con los registros de cliente (que también disparan 'Lead').
        if (role === 'operador') {
          window.fbq('trackCustom', 'LeadOperador')
        }
      } else if (import.meta.env.DEV) {
        console.warn('[Analytics] window.fbq no está definido. ¿Se cargó el script del Pixel en index.html?')
      }
    }

    if (provider === 'all' || provider === 'google') {
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'conversion', {
          send_to:         GOOGLE_ADS_CONVERSION_ID,
          event_category:  role || 'unknown',
        })
      } else if (import.meta.env.DEV) {
        console.warn('[Analytics] window.gtag no está definido. Falta cargar gtag.js en index.html.')
      }
    }
  }
}

export default Analytics

/* ─────────────────────────────────────────────────────────────
 * Commit: fix(analytics): preservar user_id, diferenciar leads cliente/operador
 * y desactivar Google Ads (sin cuenta activa)
 *
 * - trackEvent acepta options.userId para no depender de localStorage
 *   cuando el evento se dispara antes del signIn (corrige user_id: null
 *   en analytics_events para todos los leads registrados hasta ahora).
 * - leadRegistered cambia a firma de objeto { role, userId, provider }
 *   [BREAKING CHANGE, ver JSDoc en el código] y envía content_name/
 *   content_category a Meta + evento trackCustom 'LeadOperador' para
 *   permitir optimizar la campaña de reclutamiento de forma aislada.
 * - provider default cambia de 'all' a 'meta': no existe cuenta de
 *   Google Ads para MAZ CLEAN a julio 2026. El código de Google queda
 *   intacto y guardado (typeof window.gtag), listo para reactivar
 *   cambiando el default a 'all' cuando exista la cuenta.
 * - Confirmado con JAM: RLS de analytics_events ya permite INSERT
 *   público (policy insert_analytics, with_check: true) — no era la
 *   causa del problema, sin cambios necesarios ahí.
 * ───────────────────────────────────────────────────────────── */
