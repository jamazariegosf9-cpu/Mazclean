// src/lib/analytics.js
// Módulo de tracking de eventos para MAZ CLEAN
// Registra eventos de visitas, clics y conversiones en analytics_events
// Excluye automáticamente a usuarios con role='admin' para no ensuciar estadísticas

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

// ── Generar o recuperar session_id anónimo ────────────────────────────────────
function getSessionId() {
  const KEY = 'maz_session_id'
  let sid = sessionStorage.getItem(KEY)
  if (!sid) {
    sid = 'sess_' + Math.random().toString(36).slice(2) + '_' + Date.now()
    sessionStorage.setItem(KEY, sid)
  }
  return sid
}

// ── Verificar si el usuario actual es admin ───────────────────────────────────
function isAdminUser() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (!stored) return false
    const parsed = JSON.parse(stored)
    // Verificar role en el profile guardado
    const role = parsed?.profile?.role || parsed?.user?.user_metadata?.role
    return role === 'admin'
  } catch { return false }
}

// ── Obtener user_id del usuario logueado (no admin) ───────────────────────────
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

// ── Detectar fuente de tráfico ────────────────────────────────────────────────
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

// ── Función principal de tracking ────────────────────────────────────────────
export async function trackEvent(eventName, metadata = {}) {
  // No rastrear admins
  if (isAdminUser()) return

  try {
    const payload = {
      event_name: eventName,
      user_id:    getCurrentUserId(),
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

    // Fire-and-forget: no bloquear el UI si falla
    fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(payload),
    }).catch(() => {}) // silencioso
  } catch {}
}

// ── Helpers específicos por evento ────────────────────────────────────────────
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
}

export default Analytics
