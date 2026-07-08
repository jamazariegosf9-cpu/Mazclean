import ClientView from './ClientView'
import OperatorView from './OperatorView'
import AdminViewC from './AdminViewC'
import ResetPasswordView from './ResetPasswordView'
import TrackingPublic from './TrackingPublic'
import { useState, useEffect, useRef, createContext, useContext, useCallback } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthModal from './components/auth/AuthModal'
import BookingView from './BookingView'
import OnboardingView from './OnboardingView'
import LandingOperador from './LandingOperador'
import { Menu, X } from 'lucide-react'
import './App.css'
import { supabase } from './lib/supabase'
import Analytics from './lib/analytics'
import Navbar from './components/Navbar'

// ── Toast System ─────────────────────────────────────────────────────────────
export const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) return { showToast: () => {} } // fallback silencioso
  return ctx
}

const TOAST_ICONS = {
  success: '✅',
  error:   '❌',
  warning: '⚠️',
  info:    'ℹ️',
}

const TOAST_COLORS = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#065f46' },
  error:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
  warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e' },
  info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
}

function ToastContainer({ toasts, onRemove }) {
  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 8,
      width: 'calc(100vw - 32px)', maxWidth: 420, pointerEvents: 'none',
    }}>
      {toasts.map(toast => {
        const colors = TOAST_COLORS[toast.type] || TOAST_COLORS.info
        return (
          <div key={toast.id} style={{
            background: colors.bg, border: `1.5px solid ${colors.border}`,
            borderRadius: 12, padding: '12px 16px',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            pointerEvents: 'all',
            animation: 'toastIn 0.25s ease',
          }}>
            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
              {TOAST_ICONS[toast.type] || TOAST_ICONS.info}
            </span>
            <span style={{ fontSize: 14, color: colors.text, fontWeight: 600, flex: 1, lineHeight: 1.5 }}>
              {toast.message}
            </span>
            <button onClick={() => onRemove(toast.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: colors.text, fontSize: 18, lineHeight: 1,
              opacity: 0.6, flexShrink: 0, padding: 0, minWidth: 24,
            }}>×</button>
          </div>
        )
      })}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

// ── Offline Indicator ────────────────────────────────────────────────────────
function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  useEffect(() => {
    const goOnline  = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online',  goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online',  goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])
  return isOnline
}

function OfflineBanner() {
  const isOnline = useOnlineStatus()
  const [wasOffline, setWasOffline] = useState(false)
  const [showReconnected, setShowReconnected] = useState(false)

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true)
      setShowReconnected(false)
    } else if (wasOffline) {
      setShowReconnected(true)
      const t = setTimeout(() => { setShowReconnected(false); setWasOffline(false); }, 3000)
      return () => clearTimeout(t)
    }
  }, [isOnline, wasOffline])

  if (isOnline && !showReconnected) return null

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99998,
      background: isOnline ? '#059669' : '#dc2626',
      color: '#fff', textAlign: 'center',
      padding: '10px 16px', fontSize: 14, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      transition: 'background 0.3s ease',
    }}>
      {isOnline
        ? '✅ Conexión restaurada'
        : '📵 Sin conexión — verifica tu internet'}
    </div>
  )
}

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev.slice(-4), { id, message, type }]) // max 5 toasts
    if (duration > 0) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      <OfflineBanner />
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

function getTrackingId() {
  const path = window.location.pathname
  const match = path.match(/^\/tracking\/([a-zA-Z0-9-]+)$/)
  return match ? match[1] : null
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

const PENDING_STATUSES = ['pending_review', 'pendiente']

// ── Pantalla de selección de rol — visitantes sin sesión ──────────────────────

// ── Globo flotante de Max — abre WhatsApp ─────────────────────────────────────
const WHATSAPP_MAX = 'https://wa.me/525539377258?text=Hola%2C%20quiero%20información%20sobre%20MAZ%20CLEAN%20%F0%9F%9A%97'

function MaxFAB({ visible = true }) {
  const [tooltip, setTooltip] = useState(false)
  const [pulse, setPulse]     = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setPulse(false), 4000)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    <div style={{ position: 'fixed', bottom: 24, right: 20, zIndex: 999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
      {tooltip && (
        <div style={{
          background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12, padding: '10px 14px', maxWidth: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          animation: 'fadeInUp 0.2s ease',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>💬 Hola, soy Max</div>
          <div style={{ fontSize: 12, color: '#8CA0BF', lineHeight: 1.4 }}>¿Tienes dudas? Escríbeme por WhatsApp</div>
          <div style={{ position: 'absolute', bottom: -6, right: 22, width: 12, height: 12, background: '#1e293b', transform: 'rotate(45deg)', borderRight: '1px solid rgba(255,255,255,0.12)', borderBottom: '1px solid rgba(255,255,255,0.12)' }} />
        </div>
      )}

      <a
        href={WHATSAPP_MAX}
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setTooltip(true)}
        onMouseLeave={() => setTooltip(false)}
        style={{
          width: 60, height: 60, borderRadius: '50%',
          background: '#00a86b',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(0,168,107,0.5)',
          textDecoration: 'none', flexShrink: 0,
          position: 'relative',
        }}
      >
        {pulse && (
          <div style={{
            position: 'absolute', inset: -4,
            borderRadius: '50%',
            border: '3px solid rgba(0,168,107,0.5)',
            animation: 'maxPulse 1.5s ease-out infinite',
          }} />
        )}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          <path d="M11.999 0C5.373 0 0 5.373 0 12c0 2.115.554 4.103 1.522 5.827L.06 23.446a.5.5 0 00.613.61l5.757-1.505A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.802 9.802 0 01-5.027-1.383l-.36-.214-3.733.977.998-3.63-.235-.374A9.77 9.77 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.429 0 9.818 4.388 9.818 9.818 0 5.429-4.389 9.818-9.819 9.818z"/>
        </svg>
        <div style={{
          position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
          background: '#1e40af', color: '#fff',
          fontSize: 9, fontWeight: 800, padding: '2px 6px',
          borderRadius: 20, letterSpacing: 0.5, whiteSpace: 'nowrap',
          border: '1.5px solid rgba(255,255,255,0.2)',
        }}>MAX</div>
      </a>

      <style>{`
        @keyframes maxPulse {
          0%   { transform: scale(1);   opacity: 0.8; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

function RoleSelector({ onOperator, onClient }) {
  const IMG_OPERADOR = 'https://ysdmkbwmthrjgvyuvcmm.supabase.co/storage/v1/object/public/Academia/Operadores%201.png'
  const IMG_CLIENTE  = 'https://ysdmkbwmthrjgvyuvcmm.supabase.co/storage/v1/object/public/Academia/Cliente.png'

  const cardBase = {
    flex: 1, borderRadius: 18, padding: '12px 12px 14px',
    cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit',
    transition: 'all 0.18s', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 8, border: '2px solid transparent',
  }

  return (
    <div style={{
      height: '100vh', maxHeight: '100vh', overflow: 'hidden',
      background: 'radial-gradient(circle at 50% 25%, #0f2b80 0%, #061135 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Poppins','DM Sans',sans-serif",
      padding: '16px 16px 12px',
      boxSizing: 'border-box',
    }}>

      <div style={{ textAlign: 'center', marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>💧</div>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#F0F6FF', letterSpacing: '-0.3px' }}>MAZ CLEAN</span>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: '0 0 4px', lineHeight: 1.2 }}>
          ¿Qué quieres hacer?
        </h1>
        <p style={{ fontSize: 13, color: '#8CA0BF', margin: 0 }}>
          Selecciona tu perfil
        </p>
      </div>

      <div style={{
        display: 'flex', flexDirection: 'row',
        gap: 12, width: '100%', maxWidth: 560, flexShrink: 0,
      }}>

        <button
          onClick={onClient}
          style={{ ...cardBase, background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.35)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.18)'; e.currentTarget.style.borderColor = '#10b981'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.08)'; e.currentTarget.style.borderColor = 'rgba(16,185,129,0.35)'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          <div style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981', color: '#6ee7b7', padding: '3px 14px', borderRadius: 20, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>
            Cliente
          </div>
          <div style={{ width: '100%', height: 140, flexShrink: 0, borderRadius: 12, overflow: 'hidden' }}>
            <img src={IMG_CLIENTE} alt="Cliente MAZ CLEAN" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 10%', display: 'block' }} />
          </div>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 3 }}>🧼 Soy Cliente</div>
            <div style={{ fontSize: 11, color: '#6ee7b7', lineHeight: 1.4 }}>Reserva un lavado profesional a domicilio</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, width: '100%', flexShrink: 0 }}>
            Reservar ahora →
          </div>
        </button>

        <button
          onClick={onOperator}
          style={{ ...cardBase, background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.4)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.2)'; e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.1)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; e.currentTarget.style.transform = 'translateY(0)' }}
        >
          <div style={{ background: 'rgba(59,130,246,0.2)', border: '1px solid #3b82f6', color: '#93c5fd', padding: '3px 14px', borderRadius: 20, fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', flexShrink: 0 }}>
            Operador
          </div>
          <div style={{ width: '100%', height: 140, flexShrink: 0, borderRadius: 12, overflow: 'hidden' }}>
            <img src={IMG_OPERADOR} alt="Operadores MAZ CLEAN" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 15%', display: 'block' }} />
          </div>
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 3 }}>🚗 Ser Operador</div>
            <div style={{ fontSize: 11, color: '#93c5fd', lineHeight: 1.4 }}>Genera ingresos lavando autos en tu zona</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: '#fff', padding: '9px 0', borderRadius: 10, fontSize: 13, fontWeight: 700, width: '100%', flexShrink: 0 }}>
            Ver cómo funciona →
          </div>
        </button>
      </div>

      <p style={{ fontSize: 12, color: '#4a5568', margin: '12px 0 0', textAlign: 'center', flexShrink: 0 }}>
        ¿Ya tienes cuenta?{' '}
        <button onClick={onClient} style={{ background: 'none', border: 'none', color: '#00C8FF', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0, fontFamily: 'inherit' }}>
          Iniciar sesión
        </button>
      </p>
    </div>
  )
}


function HomeView({ setView, onShowAuth }) {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  return (
    <div style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: isMobile ? '32px 24px' : '40px' }}>
      <h1 style={{ fontWeight: 800, fontSize: isMobile ? 40 : 72, lineHeight: 1.1, background: 'linear-gradient(135deg,#F0F6FF 30%,#00C8FF 70%,#00E5C8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: isMobile ? 16 : 24, wordBreak: 'break-word' }}>
        Tu auto, impecable.
      </h1>
      <p style={{ color: '#8CA0BF', fontSize: isMobile ? 16 : 18, maxWidth: 500, margin: isMobile ? '0 auto 32px' : '0 auto 48px', lineHeight: 1.7 }}>
        Reserva un lavado profesional sin salir de casa.
      </p>
      {user ? (
        <button onClick={() => { Analytics.clickReservar(); setView('booking'); }} style={{ padding: isMobile ? '14px 32px' : '16px 40px', fontSize: 16, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, minHeight: 52, width: isMobile ? '100%' : 'auto', maxWidth: 320 }}>
          Reservar Ahora
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 400 }}>
          <button onClick={() => onShowAuth('login')} style={{ padding: '14px 32px', fontSize: 15, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', background: 'none', color: '#F0F6FF', fontWeight: 700, flex: 1, minHeight: 52 }}>Iniciar Sesion</button>
          <button onClick={() => onShowAuth('register')} style={{ padding: '14px 32px', fontSize: 15, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, flex: 1, minHeight: 52 }}>Registrarse</button>
        </div>
      )}
    </div>
  )
}

function BookingViewProtected({ onNavigate, onShowAuth }) {
  // Guest checkout habilitado — BookingView maneja internamente
  // la creación de cuenta cuando no hay sesión activa
  return <BookingView onNavigate={onNavigate} />
}

function StatusScreen({ icon, title, message, extra, onSignOut }) {
  return (
    <div style={{ minHeight: '100vh', background: '#050A14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1.5px solid rgba(59,130,246,0.3)', borderRadius: 20, padding: '40px 32px', maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#F0F6FF', marginBottom: 10 }}>{title}</h2>
        <p style={{ color: '#8CA0BF', fontSize: 15, marginBottom: extra ? 8 : 24, lineHeight: 1.6 }}>{message}</p>
        {extra}
        <button onClick={onSignOut} style={{ marginTop: 16, padding: '12px 32px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, color: '#F0F6FF', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
          Cerrar sesion
        </button>
      </div>
    </div>
  )
}

function AppInner() {
  const { loading, user, profile, signOut, loadProfile: refreshProfile, isRecoveryFlow } = useAuth()
  const [view, setView]           = useState('home')
  const [authModal, setAuthModal] = useState(null)
  
  const [showResetPassword, setShowResetPassword] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const hash   = window.location.hash
    return params.get('type') === 'recovery' || hash.includes('type=recovery')
  })

  const trackingId = getTrackingId()
  const handleOnboardingComplete = () => { refreshProfile() }
  const viewHistory = useRef(['home'])

  useEffect(() => { Analytics.sessionStart() }, [])

  // Limpiar sesión guest al iniciar — evita pantalla negra por guests previos
  useEffect(() => {
    const cleanGuestSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return
        const u = session.user
        const isGuest = u.is_anonymous === true ||
                        u.email?.includes('@guestmazclean.com') ||
                        u.email?.includes('@guest.mazclean') ||
                        u.user_metadata?.is_guest === true ||
                        u.app_metadata?.provider === 'anonymous'
        if (isGuest) {
          console.log('[App] Sesión anónima/guest detectada al iniciar — limpiando')
          await supabase.auth.signOut({ scope: 'local' })
          localStorage.removeItem('mazclean-auth')
        }
      } catch (e) { console.warn('[App] cleanGuestSession:', e.message) }
    }
    cleanGuestSession()
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (isRecoveryFlow) setShowResetPassword(true)
  }, [isRecoveryFlow])

  const navigateTo = (newView) => {
    if (newView === view) return
    Analytics.pageView('/' + newView)
    viewHistory.current = [...viewHistory.current, newView]
    window.history.pushState({ view: newView }, '', window.location.pathname)
    setView(newView)
  }

  useEffect(() => {
    const handlePopState = (e) => {
      if (viewHistory.current.length <= 1) {
        const confirm = window.confirm('¿Deseas salir de Maz Clean?')
        if (confirm) {
          window.history.back()
        } else {
          window.history.pushState({ view }, '', window.location.pathname)
        }
        return
      }
      const newHistory = viewHistory.current.slice(0, -1)
      viewHistory.current = newHistory
      const prevView = newHistory[newHistory.length - 1]
      setView(prevView)
    }

    window.history.replaceState({ view: 'home' }, '', window.location.pathname)
    window.history.pushState({ view: 'home' }, '', window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [view])

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = '* { box-sizing: border-box; margin: 0; padding: 0; } body { background: #050A14; color: #F0F6FF; font-family: sans-serif; overflow-x: hidden; max-width: 100vw; } html { overflow-x: hidden; }'
    document.head.appendChild(style)

    const fixOverflow = () => {
      document.querySelectorAll('*').forEach(el => {
        if (el.offsetWidth > window.innerWidth) {
          el.style.maxWidth = '100%'
          el.style.overflowX = 'hidden'
        }
      })
    }

    fixOverflow()
    const timer = setTimeout(fixOverflow, 500)
    window.addEventListener('resize', fixOverflow)

    return () => {
      document.head.removeChild(style)
      clearTimeout(timer)
      window.removeEventListener('resize', fixOverflow)
    }
  }, [])

  useEffect(() => {
    // No redirigir al home si el usuario está en la vista de booking
    // BookingView maneja internamente el guest checkout sin sesión
    if (!loading && !user && view !== 'booking') setView('home')
  }, [loading, user, view])

  // ── INTERCEPCIÓN PRIORITARIA DEL FLUJO DE RECUPERACIÓN ───────────────────
  if (showResetPassword) {
    return (
      <ResetPasswordView onDone={() => {
        setShowResetPassword(false)
        window.location.hash = ''
        const url = new URL(window.location)
        url.searchParams.delete('type')
        window.history.replaceState({}, '', url.pathname)
        setAuthModal('login')
      }} />
    )
  }

  if (trackingId) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
        <TrackingPublic bookingId={trackingId} />
      </div>
    )
  }

  // Si hay usuario sin perfil, verificar si es guest (email temporal)
  // Los guests no tienen perfil en la tabla profiles y no deben bloquear la app
  const isGuestUser = user && !profile && (
    user.is_anonymous === true ||
    user.email?.includes('@guestmazclean.com') ||
    user.email?.includes('@guest.mazclean') ||
    user.user_metadata?.is_guest === true ||
    user.app_metadata?.provider === 'anonymous'
  )
  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#050A14' }} />
  }
  // Guest sin perfil: limpiar sesión y mostrar home limpio
  if (user && !profile && !isGuestUser) {
    return <div style={{ minHeight: '100vh', background: '#050A14' }} />
  }

  if (profile?.role === 'operador') {
    console.log('[App] Flujo operador:', {
      onboarding_done: profile.onboarding_done,
      onboarding_step: profile.onboarding_step,
      operator_status: profile.operator_status,
      status:          profile.status,
    })

    if (profile.status === 'desactivado') {
      return (
        <StatusScreen
          icon="🚫"
          title="Cuenta desactivada"
          message="Tu cuenta ha sido desactivada. Contacta al administrador para mas informacion."
          onSignOut={signOut}
        />
      )
    }

    if (!profile.onboarding_done) {
      return (
        <div style={{ minHeight: '100vh', background: '#050A14' }}>
          <OnboardingView onComplete={handleOnboardingComplete} />
        </div>
      )
    }

    if (profile.operator_status === 'rechazado') {
      return (
        <StatusScreen
          icon="❌"
          title="Solicitud rechazada"
          message="Tu solicitud como operador no fue aprobada."
          extra={
            profile.rejection_reason
              ? <p style={{ color: '#fca5a5', fontSize: 14, background: 'rgba(239,68,68,0.1)', padding: '10px 16px', borderRadius: 10, marginBottom: 8 }}>
                  Motivo: {profile.rejection_reason}
                </p>
              : null
          }
          onSignOut={signOut}
        />
      )
    }

    if (PENDING_STATUSES.includes(profile.operator_status)) {
      return (
        <StatusScreen
          icon="⏳"
          title="Perfil en revision"
          message="Tu registro está siendo revisado. Te notificaremos por WhatsApp en máximo 4 horas hábiles."
          onSignOut={signOut}
        />
      )
    }

    return (
      <div style={{ minHeight: '100vh', background: '#050A14' }}>
        <OperatorView onNavigate={setView} />
      </div>
    )
  }

  if (profile?.role === 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: '#050A14' }}>
        <Navbar view={view} setView={navigateTo} onShowAuth={(tab) => setAuthModal(tab)} />
        {view === 'home'     && <HomeView setView={navigateTo} onShowAuth={(tab) => setAuthModal(tab)} />}
        {view === 'booking'  && <BookingViewProtected onNavigate={navigateTo} onShowAuth={(tab) => setAuthModal(tab)} />}
        {view === 'client'   && <ClientView onNavigate={navigateTo} />}
        {view === 'operator' && <OperatorView onNavigate={navigateTo} />}
        {view === 'admin'    && <AdminViewC onNavigate={navigateTo} />}
        {authModal && <AuthModal defaultTab={authModal} onClose={() => setAuthModal(null)} />}
      </div>
    )
  }

  if (view === 'home' && !user && !authModal) {
    return (
      <div style={{ minHeight: '100vh', background: '#061135' }}>
        <RoleSelector
          onOperator={() => setAuthModal('operator_landing')}
          onClient={() => navigateTo('booking')}
        />
        <MaxFAB visible={!authModal} />
        {authModal && <AuthModal defaultTab={authModal} onClose={() => setAuthModal(null)} />}
      </div>
    )
  }

  if (view === 'home' && !user && authModal === 'operator_landing') {
    return (
      <div style={{ minHeight: '100vh', background: '#061135' }}>
        <LandingOperador onRegister={() => setAuthModal('operator')} />
        <MaxFAB visible={authModal !== 'operator'} />
        {authModal === 'operator' && (
          <AuthModal defaultTab="operator" onClose={() => setAuthModal(null)} />
        )}
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050A14' }}>
      <Navbar view={view} setView={navigateTo} onShowAuth={(tab) => setAuthModal(tab)} />
      {view === 'home'     && <HomeView setView={navigateTo} onShowAuth={(tab) => setAuthModal(tab)} />}
      {view === 'booking'  && <BookingViewProtected onNavigate={navigateTo} onShowAuth={(tab) => setAuthModal(tab)} />}
      {view === 'client'   && <ClientView onNavigate={navigateTo} />}
      <MaxFAB visible={!authModal && (view === 'home' || view === 'operator')} />
      {authModal && <AuthModal defaultTab={authModal} onClose={() => setAuthModal(null)} />}
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ToastProvider>
  )
}