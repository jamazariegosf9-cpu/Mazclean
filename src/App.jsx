import ClientView from './ClientView'
import OperatorView from './OperatorView'
import AdminViewC from './AdminViewC'
import TrackingPublic from './TrackingPublic'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthModal from './components/auth/AuthModal'
import BookingView from './BookingView'
import OnboardingView from './OnboardingView'
import { Menu, X } from 'lucide-react'

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

// Cubre ambos valores posibles del estado pendiente de revision
// pending_review = creado por Admin antes de completar onboarding
// pendiente      = completo onboarding, esperando aprobacion del admin
const PENDING_STATUSES = ['pending_review', 'pendiente']

function Navbar({ view, setView, onShowAuth }) {
  const { user, profile, signOut } = useAuth()
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = [
    ['home',    'Inicio'],
    ['booking', 'Reservar'],
    ['client',  'Mi Cuenta'],
  ]
  if (profile?.role === 'operador') navLinks.push(['operator', 'Panel Operador'])
  if (profile?.role === 'admin') {
    navLinks.push(['operator', 'Panel Operador'])
    navLinks.push(['admin', 'Admin'])
  }

  const roleBadge = {
    admin:    { label: 'Admin',    color: '#10b981' },
    operador: { label: 'Operador', color: '#3b82f6' },
    cliente:  { label: 'Cliente',  color: '#8CA0BF' },
  }[profile?.role] || null

  const handleNav = (id) => { setView(id); setMenuOpen(false) }

  return (
    <>
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(5,10,20,0.97)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center', height: 56, gap: 8 }}>
          <button onClick={() => handleNav('home')} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#F0F6FF', flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💧</div>
            <span style={{ fontWeight: 800, fontSize: 16 }}>Maz Clean</span>
          </button>
          <div style={{ flex: 1 }} />
          {!isMobile && (
            <div style={{ display: 'flex', gap: 2 }}>
              {navLinks.map(([id, label]) => (
                <button key={id + label} onClick={() => handleNav(id)}
                  style={{ padding: '8px 12px', border: 'none', cursor: 'pointer', borderRadius: 10, background: view === id ? 'rgba(0,200,255,0.12)' : 'none', color: view === id ? '#00C8FF' : '#8CA0BF', fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap' }}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {!isMobile && user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {roleBadge && <span style={{ padding: '3px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: roleBadge.color + '20', color: roleBadge.color, whiteSpace: 'nowrap' }}>{roleBadge.label}</span>}
              <span style={{ color: '#8CA0BF', fontSize: 12, whiteSpace: 'nowrap' }}>{profile?.full_name?.split(' ')[0] || 'Usuario'}</span>
              <button onClick={signOut} style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'none', color: '#F87171', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>Salir</button>
            </div>
          )}
          {!isMobile && !user && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => onShowAuth('login')} style={{ padding: '8px 14px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, background: 'none', color: '#F0F6FF', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Login</button>
              <button onClick={() => onShowAuth('register')} style={{ padding: '8px 14px', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', border: 'none', borderRadius: 10, color: '#050A14', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Registro</button>
            </div>
          )}
          {isMobile && user && <span style={{ color: '#8CA0BF', fontSize: 12, whiteSpace: 'nowrap' }}>{profile?.full_name?.split(' ')[0] || 'Usuario'}</span>}
          {isMobile && (
            <button onClick={() => setMenuOpen(o => !o)}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px', cursor: 'pointer', color: '#F0F6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 40, minHeight: 40 }}>
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          )}
        </div>
      </nav>
      {isMobile && menuOpen && (
        <div style={{ position: 'fixed', top: 56, left: 0, right: 0, bottom: 0, zIndex: 99, background: 'rgba(0,0,0,0.5)' }} onClick={() => setMenuOpen(false)}>
          <div style={{ background: 'rgba(5,10,20,0.98)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '8px 0' }} onClick={e => e.stopPropagation()}>
            {navLinks.map(([id, label]) => (
              <button key={id + label} onClick={() => handleNav(id)}
                style={{ display: 'block', width: '100%', padding: '14px 20px', border: 'none', cursor: 'pointer', background: view === id ? 'rgba(0,200,255,0.10)' : 'transparent', color: view === id ? '#00C8FF' : '#F0F6FF', fontWeight: view === id ? 700 : 500, fontSize: 15, textAlign: 'left', borderLeft: view === id ? '3px solid #00C8FF' : '3px solid transparent' }}>
                {label}
              </button>
            ))}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
            {user ? (
              <div style={{ padding: '8px 20px' }}>
                {roleBadge && <div style={{ marginBottom: 8 }}><span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: roleBadge.color + '20', color: roleBadge.color }}>{roleBadge.label}</span></div>}
                <button onClick={() => { signOut(); setMenuOpen(false) }} style={{ width: '100%', padding: '12px', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, background: 'rgba(248,113,113,0.08)', color: '#F87171', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>Cerrar sesion</button>
              </div>
            ) : (
              <div style={{ padding: '8px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => { onShowAuth('login'); setMenuOpen(false) }} style={{ width: '100%', padding: '12px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, background: 'none', color: '#F0F6FF', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Iniciar Sesion</button>
                <button onClick={() => { onShowAuth('register'); setMenuOpen(false) }} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', border: 'none', borderRadius: 10, color: '#050A14', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>Registrarse</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
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
        <button onClick={() => setView('booking')} style={{ padding: isMobile ? '14px 32px' : '16px 40px', fontSize: 16, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, minHeight: 52, width: isMobile ? '100%' : 'auto', maxWidth: 320 }}>
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
  const { user } = useAuth()
  if (!user) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24 }}>
        <div style={{ background: 'rgba(0,200,255,0.08)', border: '1.5px solid rgba(0,200,255,0.25)', borderRadius: 20, padding: '40px 32px', maxWidth: 440, width: '100%' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F0F6FF', marginBottom: 10 }}>Necesitas una cuenta</h2>
          <p style={{ color: '#8CA0BF', fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>Para reservar un servicio debes iniciar sesion o crear una cuenta.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => onShowAuth('login')} style={{ padding: '12px 32px', fontSize: 15, borderRadius: 12, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', background: 'none', color: '#F0F6FF', fontWeight: 600, flex: 1, minHeight: 48 }}>Iniciar Sesion</button>
            <button onClick={() => onShowAuth('register')} style={{ padding: '12px 32px', fontSize: 15, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, flex: 1, minHeight: 48 }}>Registrarse</button>
          </div>
        </div>
      </div>
    )
  }
  return <BookingView onNavigate={onNavigate} />
}

// Pantalla generica de estado para operadores bloqueados
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
  const { loading, user, profile, signOut, loadProfile: refreshProfile } = useAuth()
  const [view, setView]           = useState('home')
  const [authModal, setAuthModal] = useState(null)

  const trackingId = getTrackingId()

  const handleOnboardingComplete = () => { refreshProfile() }

  useEffect(() => {
    const style = document.createElement('style')
  style.textContent = '* { box-sizing: border-box; margin: 0; padding: 0; max-width: 100%; } img, video, svg { max-width: 100%; } body { background: #050A14; color: #F0F6FF; font-family: sans-serif; overflow-x: hidden; max-width: 100vw; } html { overflow-x: hidden; }'
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    if (!loading && !user) setView('home')
  }, [loading, user])

  if (trackingId) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6' }}>
        <TrackingPublic bookingId={trackingId} />
      </div>
    )
  }

  // Pantalla en blanco mientras carga - evita flashes
  if (loading || (user && !profile)) {
    return <div style={{ minHeight: '100vh', background: '#050A14' }} />
  }

  // ============================================================
  // FLUJO OPERADOR
  // El guard !profile.onboarding_done tiene prioridad absoluta.
  // Cubre operadores recien registrados (onboarding_done=false)
  // y operadores creados por Admin pendientes de completar el flujo.
  // ============================================================
  if (profile?.role === 'operador') {

    console.log('[App] Flujo operador:', {
      onboarding_done: profile.onboarding_done,
      onboarding_step: profile.onboarding_step,
      operator_status: profile.operator_status,
      status:          profile.status,
    })

    // 1. Desactivado - bloquea todo
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

    // 2. No completo onboarding - SIEMPRE va al OnboardingView
    //    Prioridad maxima: cubre false, null y undefined
    //    No importa el operator_status - onboarding tiene prioridad absoluta
    if (!profile.onboarding_done) {
      return (
        <div style={{ minHeight: '100vh', background: '#050A14' }}>
          <OnboardingView onComplete={handleOnboardingComplete} />
        </div>
      )
    }

    // A partir de aqui: onboarding_done = true

    // 3. Rechazado
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

    // 4. Pendiente de revision
    //    'pendiente'      = completo onboarding, espera aprobacion
    //    'pending_review' = creado por Admin, en proceso
    if (PENDING_STATUSES.includes(profile.operator_status)) {
      return (
        <StatusScreen
          icon="⏳"
          title="Perfil en revision"
          message="Tu registro esta siendo revisado por el administrador. Te notificaremos cuando sea aprobado."
          onSignOut={signOut}
        />
      )
    }

    // 5. Aprobado - panel de operador
    return (
      <div style={{ minHeight: '100vh', background: '#050A14' }}>
        <OperatorView onNavigate={setView} />
      </div>
    )
  }

  // FLUJO ADMIN
  if (profile?.role === 'admin') {
    return (
      <div style={{ minHeight: '100vh', background: '#050A14' }}>
        <Navbar view={view} setView={setView} onShowAuth={(tab) => setAuthModal(tab)} />
        {view === 'home'     && <HomeView setView={setView} onShowAuth={(tab) => setAuthModal(tab)} />}
        {view === 'booking'  && <BookingViewProtected onNavigate={setView} onShowAuth={(tab) => setAuthModal(tab)} />}
        {view === 'client'   && <ClientView onNavigate={setView} />}
        {view === 'operator' && <OperatorView onNavigate={setView} />}
        {view === 'admin'    && <AdminViewC onNavigate={setView} />}
        {authModal && <AuthModal defaultTab={authModal} onClose={() => setAuthModal(null)} />}
      </div>
    )
  }

  // FLUJO CLIENTE / NO LOGUEADO
  return (
    <div style={{ minHeight: '100vh', background: '#050A14' }}>
      <Navbar view={view} setView={setView} onShowAuth={(tab) => setAuthModal(tab)} />
      {view === 'home'     && <HomeView setView={setView} onShowAuth={(tab) => setAuthModal(tab)} />}
      {view === 'booking'  && <BookingViewProtected onNavigate={setView} onShowAuth={(tab) => setAuthModal(tab)} />}
      {view === 'client'   && <ClientView onNavigate={setView} />}
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
