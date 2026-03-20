import ClientView from './ClientView'
import OperatorView from './OperatorView'
import AdminView from './AdminView'
import TrackingPublic from './TrackingPublic'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthModal from './components/auth/AuthModal'
import BookingView from './BookingView'

// ── Detectar ruta /tracking/:id ────────────────────────────────
function getTrackingId() {
  const path = window.location.pathname
  const match = path.match(/^\/tracking\/([a-zA-Z0-9-]+)$/)
  return match ? match[1] : null
}

// ── Hook móvil ─────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

function Navbar({ view, setView, onShowAuth }) {
  const { user, profile, signOut } = useAuth()

  const navLinks = [
    ['home',    'Inicio'],
    ['booking', 'Reservar'],
    ['client',  'Mi Cuenta'],
  ]
  if (profile?.role === 'operador') {
    navLinks.push(['operator', 'Panel Operador'])
  }
  if (profile?.role === 'admin') {
    navLinks.push(['operator', 'Panel Operador'])
    navLinks.push(['admin',    'Admin'])
  }

  const roleBadge = {
    admin:    { label: 'Admin',    color: '#10b981' },
    operador: { label: 'Operador', color: '#3b82f6' },
    cliente:  { label: 'Cliente',  color: '#8CA0BF' },
  }[profile?.role] || null

  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(5,10,20,0.95)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center', height: 56, gap: 8 }}>

        {/* Logo */}
        <button onClick={() => setView('home')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#F0F6FF', flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💧</div>
          <span style={{ fontWeight: 800, fontSize: 16 }}>Maz Clean</span>
        </button>

        {/* Links */}
        <div style={{ display: 'flex', gap: 2, flex: 1, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {navLinks.map(([id, label]) => (
            <button
              key={id + label}
              onClick={() => setView(id)}
              style={{
                padding: '8px 10px', border: 'none', cursor: 'pointer', borderRadius: 10,
                background: view === id ? 'rgba(0,200,255,0.12)' : 'none',
                color: view === id ? '#00C8FF' : '#8CA0BF',
                fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Usuario */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {roleBadge && (
              <span style={{
                padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                background: roleBadge.color + '20', color: roleBadge.color, whiteSpace: 'nowrap',
              }}>
                {roleBadge.label}
              </span>
            )}
            <span style={{ color: '#8CA0BF', fontSize: 12, whiteSpace: 'nowrap' }}>
              {profile?.full_name?.split(' ')[0] || 'Usuario'}
            </span>
            <button
              onClick={signOut}
              style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'none', color: '#F87171', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap', minHeight: 36 }}
            >
              Salir
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => onShowAuth('login')} style={{ padding: '8px 14px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, background: 'none', color: '#F0F6FF', fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 36 }}>Login</button>
            <button onClick={() => onShowAuth('register')} style={{ padding: '8px 14px', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', border: 'none', borderRadius: 10, color: '#050A14', fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 36 }}>Registro</button>
          </div>
        )}
      </div>
    </nav>
  )
}

function HomeView({ setView, onShowAuth }) {
  const { user } = useAuth()
  const isMobile = useIsMobile()

  return (
    <div style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: isMobile ? '32px 24px' : '40px' }}>
      <h1 style={{
        fontWeight: 800,
        fontSize: isMobile ? 40 : 72,
        lineHeight: 1.1,
        background: 'linear-gradient(135deg,#F0F6FF 30%,#00C8FF 70%,#00E5C8 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        marginBottom: isMobile ? 16 : 24,
        wordBreak: 'break-word',
      }}>
        Tu auto, impecable.
      </h1>
      <p style={{ color: '#8CA0BF', fontSize: isMobile ? 16 : 18, maxWidth: 500, margin: isMobile ? '0 auto 32px' : '0 auto 48px', lineHeight: 1.7 }}>
        Reserva un lavado profesional sin salir de casa.
      </p>
      {user ? (
        <button
          onClick={() => setView('booking')}
          style={{ padding: isMobile ? '14px 32px' : '16px 40px', fontSize: 16, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, minHeight: 52, width: isMobile ? '100%' : 'auto', maxWidth: 320 }}
        >
          Reservar Ahora
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: 400 }}>
          <button
            onClick={() => onShowAuth('login')}
            style={{ padding: '14px 32px', fontSize: 15, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', background: 'none', color: '#F0F6FF', fontWeight: 700, flex: 1, minHeight: 52 }}
          >
            Iniciar Sesión
          </button>
          <button
            onClick={() => onShowAuth('register')}
            style={{ padding: '14px 32px', fontSize: 15, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, flex: 1, minHeight: 52 }}
          >
            Registrarse
          </button>
        </div>
      )}
    </div>
  )
}

// ── Wrapper de BookingView con protección de login ─────────────
function BookingViewProtected({ onNavigate, onShowAuth }) {
  const { user } = useAuth()

  if (!user) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        <div style={{ background: 'rgba(0,200,255,0.08)', border: '1.5px solid rgba(0,200,255,0.25)', borderRadius: 20, padding: '40px 32px', maxWidth: 440, width: '100%' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F0F6FF', marginBottom: 10 }}>
            Necesitas una cuenta
          </h2>
          <p style={{ color: '#8CA0BF', fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>
            Para reservar un servicio debes iniciar sesión o crear una cuenta. Es rápido y gratuito.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => onShowAuth('login')}
              style={{ padding: '12px 32px', fontSize: 15, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', background: 'none', color: '#F0F6FF', fontWeight: 600, flex: 1, minHeight: 48 }}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => onShowAuth('register')}
              style={{ padding: '12px 32px', fontSize: 15, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, flex: 1, minHeight: 48 }}
            >
              Registrarse
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <BookingView onNavigate={onNavigate} />
}

function AppInner() {
  const { loading, user } = useAuth()
  const [view, setView]           = useState('home')
  const [authModal, setAuthModal] = useState(null)

  const trackingId = getTrackingId()

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `* { box-sizing: border-box; margin: 0; padding: 0; } body { background: #050A14; color: #F0F6FF; font-family: sans-serif; }`
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    if (!loading && !user) {
      setView('home')
    }
  }, [loading, user])

  if (trackingId) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
        <TrackingPublic bookingId={trackingId} />
      </div>
    )
  }

  if (loading && !user) {
    return (
      <div style={{ minHeight: '100vh', background: '#050A14' }} />
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050A14' }}>
      <Navbar view={view} setView={setView} onShowAuth={(tab) => setAuthModal(tab)} />
      {view === 'home'     && <HomeView setView={setView} onShowAuth={(tab) => setAuthModal(tab)} />}
      {view === 'booking'  && <BookingViewProtected onNavigate={setView} onShowAuth={(tab) => setAuthModal(tab)} />}
      {view === 'client'   && <ClientView onNavigate={setView} />}
      {view === 'operator' && <OperatorView onNavigate={setView} />}
      {view === 'admin'    && <AdminView onNavigate={setView} />}
      {authModal && <AuthModal defaultTab={authModal} onClose={() => setAuthModal(null)} />}
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
