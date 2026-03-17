import ClientView from './ClientView'
import OperatorView from './OperatorView'
import AdminView from './AdminView'
import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import AuthModal from './components/auth/AuthModal'
import BookingView from './BookingView'

function Navbar({ view, setView, onShowAuth }) {
  const { user, profile, signOut } = useAuth()

  const navLinks = [
    ['home',     'Inicio'],
    ['booking',  'Reservar'],
    ['client',   'Mi Cuenta'],
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
      padding: '0 24px', display: 'flex', alignItems: 'center', height: 64, gap: 12,
    }}>
      <button onClick={() => setView('home')} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#F0F6FF' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>💧</div>
        <span style={{ fontWeight: 800, fontSize: 18 }}>Maz Clean</span>
      </button>

      <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
        {navLinks.map(([id, label]) => (
          <button
            key={id + label}
            onClick={() => setView(id)}
            style={{
              padding: '8px 14px', border: 'none', cursor: 'pointer', borderRadius: 10,
              background: view === id ? 'rgba(0,200,255,0.12)' : 'none',
              color: view === id ? '#00C8FF' : '#8CA0BF',
              fontWeight: 600, fontSize: 14,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {user ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {roleBadge && (
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: roleBadge.color + '20', color: roleBadge.color,
            }}>
              {roleBadge.label}
            </span>
          )}
          <span style={{ color: '#8CA0BF', fontSize: 14 }}>
            Hola, {profile?.full_name?.split(' ')[0] || 'Usuario'}
          </span>
          <button
            onClick={signOut}
            style={{ padding: '8px 16px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'none', color: '#F87171', cursor: 'pointer', fontSize: 13 }}
          >
            Salir
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onShowAuth('login')} style={{ padding: '9px 20px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, background: 'none', color: '#F0F6FF', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Login</button>
          <button onClick={() => onShowAuth('register')} style={{ padding: '9px 22px', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', border: 'none', borderRadius: 12, color: '#050A14', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Registrarse</button>
        </div>
      )}
    </nav>
  )
}

function HomeView({ setView }) {
  return (
    <div style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40 }}>
      <h1 style={{ fontWeight: 800, fontSize: 72, lineHeight: 1.05, background: 'linear-gradient(135deg,#F0F6FF 30%,#00C8FF 70%,#00E5C8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 24 }}>
        Tu auto, impecable.
      </h1>
      <p style={{ color: '#8CA0BF', fontSize: 18, maxWidth: 500, margin: '0 auto 48px', lineHeight: 1.7 }}>
        Reserva un lavado profesional sin salir de casa.
      </p>
      <button
        onClick={() => setView('booking')}
        style={{ padding: '16px 40px', fontSize: 16, borderRadius: 12, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700 }}
      >
        Reservar Ahora
      </button>
    </div>
  )
}

function AppInner() {
  const { profile } = useAuth()
  const [view, setView]               = useState('home')
  const [authModal, setAuthModal]     = useState(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `* { box-sizing: border-box; margin: 0; padding: 0; } body { background: #050A14; color: #F0F6FF; font-family: sans-serif; }`
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  // Redirigir al panel correcto solo la primera vez que carga el perfil
  useEffect(() => {
    if (!initialized && profile) {
      setInitialized(true)
      if (profile.role === 'admin') setView('admin')
      else if (profile.role === 'operador') setView('operator')
    }
  }, [profile, initialized])

  return (
    <div style={{ minHeight: '100vh', background: '#050A14' }}>
      <Navbar view={view} setView={setView} onShowAuth={(tab) => setAuthModal(tab)} />
      {view === 'home'     && <HomeView setView={setView} />}
      {view === 'booking'  && <BookingView onNavigate={setView} />}
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
