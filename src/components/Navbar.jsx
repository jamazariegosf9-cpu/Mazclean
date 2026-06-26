import { useState, useEffect } from 'react'
import { Menu, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function Navbar({ view, setView, onShowAuth }) {
  const { user, profile, signOut } = useAuth()
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)

  const navLinks = [
    ['home',    'Inicio'],
    ['booking', 'Reservar'],
    ['client',  'Mi Cuenta'],
  ]
  if (profile?.role === 'operador') navLinks.push(['operator', 'Panel Operador'])
  if (profile?.role === 'admin') navLinks.push(['admin', 'Admin'])

  const roleBadge = {
    operador: { label: 'Operador', color: '#3b82f6' },
    cliente:  { label: 'Cliente',  color: '#8CA0BF' },
  }[profile?.role] || null

  const handleNav = (id) => { setView(id); setMenuOpen(false) }

  // FIX: Logout con recarga forzada para limpieza total de estado
  const handleSignOut = async () => {
    await signOut()
    setMenuOpen(false)
    window.location.reload() // <-- Garantía de limpieza del 100%
  }

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
              {profile?.role !== 'admin' && <span style={{ color: '#8CA0BF', fontSize: 12, whiteSpace: 'nowrap' }}>{profile?.full_name?.split(' ')[0] || 'Usuario'}</span>}
              <button onClick={handleSignOut} style={{ padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, background: 'none', color: '#F87171', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>Salir</button>
            </div>
          )}
          {!isMobile && !user && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => onShowAuth('login')} style={{ padding: '8px 14px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, background: 'none', color: '#F0F6FF', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Login</button>
              <button onClick={() => onShowAuth('register')} style={{ padding: '8px 14px', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', border: 'none', borderRadius: 10, color: '#050A14', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Registro</button>
            </div>
          )}
          {isMobile && user && profile?.role !== 'admin' && <span style={{ color: '#8CA0BF', fontSize: 12, whiteSpace: 'nowrap' }}>{profile?.full_name?.split(' ')[0] || 'Usuario'}</span>}
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
                <button onClick={handleSignOut} style={{ width: '100%', padding: '12px', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, background: 'rgba(248,113,113,0.08)', color: '#F87171', cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>Cerrar sesion</button>
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