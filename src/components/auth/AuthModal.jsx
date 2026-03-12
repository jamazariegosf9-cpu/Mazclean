// ============================================================
// MAZ CLEAN — AuthModal
// src/components/auth/AuthModal.jsx
// Maneja: Login · Registro · Recuperar contraseña · OTP
// ============================================================
import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'

// ── Estilos internos ──────────────────────────────────────────
const S = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(5,10,20,0.85)',
    backdropFilter: 'blur(12px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
    animation: 'fadeIn 0.2s ease',
  },
  card: {
    background: '#0A1628',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 24,
    padding: '40px',
    width: '100%',
    maxWidth: 440,
    position: 'relative',
  },
  logo: {
    display: 'flex', alignItems: 'center', gap: 10,
    justifyContent: 'center', marginBottom: 32,
  },
  logoIcon: {
    width: 40, height: 40, borderRadius: 12,
    background: 'linear-gradient(135deg, #00C8FF, #00E5C8)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20,
  },
  logoText: {
    fontFamily: "'Syne', sans-serif", fontWeight: 800,
    fontSize: 22, color: '#F0F6FF', letterSpacing: '-0.5px',
  },
  title: {
    fontFamily: "'Syne', sans-serif", fontWeight: 800,
    fontSize: 26, color: '#F0F6FF', textAlign: 'center', marginBottom: 6,
  },
  subtitle: {
    color: '#8CA0BF', fontSize: 14, textAlign: 'center', marginBottom: 32,
  },
  tabs: {
    display: 'flex', background: 'rgba(255,255,255,0.04)',
    borderRadius: 12, padding: 4, marginBottom: 28, gap: 4,
  },
  tab: (active) => ({
    flex: 1, padding: '10px', border: 'none', borderRadius: 10,
    cursor: 'pointer', fontFamily: "'Syne', sans-serif", fontWeight: 600,
    fontSize: 14, transition: 'all 0.2s',
    background: active ? 'rgba(0,200,255,0.15)' : 'transparent',
    color: active ? '#00C8FF' : '#8CA0BF',
  }),
  field: {
    marginBottom: 16,
  },
  label: {
    display: 'block', fontSize: 13,
    color: '#8CA0BF', marginBottom: 8, fontWeight: 500,
  },
  input: {
    width: '100%', padding: '13px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 10, color: '#F0F6FF',
    fontFamily: "'DM Sans', sans-serif", fontSize: 15,
    outline: 'none', boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  btnPrimary: {
    width: '100%', padding: '14px',
    background: 'linear-gradient(135deg, #00C8FF, #00E5C8)',
    border: 'none', borderRadius: 12,
    color: '#050A14', fontFamily: "'Syne', sans-serif",
    fontWeight: 700, fontSize: 16, cursor: 'pointer',
    marginTop: 8, transition: 'all 0.3s',
  },
  divider: {
    display: 'flex', alignItems: 'center', gap: 12,
    margin: '20px 0', color: '#8CA0BF', fontSize: 13,
  },
  dividerLine: {
    flex: 1, height: 1, background: 'rgba(255,255,255,0.08)',
  },
  btnGoogle: {
    width: '100%', padding: '13px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, color: '#F0F6FF',
    fontFamily: "'Syne', sans-serif", fontWeight: 600,
    fontSize: 15, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    transition: 'all 0.2s',
  },
  errorBox: {
    background: 'rgba(248,113,113,0.12)',
    border: '1px solid rgba(248,113,113,0.3)',
    borderRadius: 10, padding: '12px 16px',
    color: '#F87171', fontSize: 14, marginBottom: 16,
  },
  successBox: {
    background: 'rgba(0,229,200,0.12)',
    border: '1px solid rgba(0,229,200,0.3)',
    borderRadius: 10, padding: '12px 16px',
    color: '#00E5C8', fontSize: 14, marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute', top: 16, right: 16,
    background: 'rgba(255,255,255,0.06)', border: 'none',
    width: 32, height: 32, borderRadius: 8,
    color: '#8CA0BF', cursor: 'pointer', fontSize: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  forgotLink: {
    background: 'none', border: 'none',
    color: '#00C8FF', fontSize: 13,
    cursor: 'pointer', marginTop: 8,
    float: 'right', fontWeight: 500,
  },
  switchText: {
    textAlign: 'center', marginTop: 20,
    color: '#8CA0BF', fontSize: 14,
  },
  switchLink: {
    background: 'none', border: 'none',
    color: '#00C8FF', cursor: 'pointer',
    fontWeight: 600, fontSize: 14,
  },
}

// ── Componente principal ──────────────────────────────────────
export default function AuthModal({ onClose, defaultTab = 'login' }) {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuth()

  const [tab, setTab]           = useState(defaultTab)  // 'login' | 'register' | 'forgot'
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  // Form fields
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [fullName, setFullName]   = useState('')
  const [phone, setPhone]         = useState('')
  const [showPass, setShowPass]   = useState(false)

  const reset = () => { setError(''); setSuccess('') }

  // ── LOGIN ─────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault()
    reset()
    if (!email || !password) return setError('Completa todos los campos.')
    setLoading(true)
    const { error } = await signIn({ email, password })
    setLoading(false)
    if (error) return setError(translateError(error.message))
    onClose()
  }

  // ── REGISTRO ──────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault()
    reset()
    if (!fullName || !email || !password || !confirm)
      return setError('Completa todos los campos.')
    if (password !== confirm)
      return setError('Las contraseñas no coinciden.')
    if (password.length < 8)
      return setError('La contraseña debe tener al menos 8 caracteres.')
    setLoading(true)
    const { error } = await signUp({ email, password, fullName, phone })
    setLoading(false)
    if (error) return setError(translateError(error.message))
    setSuccess('¡Cuenta creada! Revisa tu correo para confirmar tu registro.')
  }

  // ── RECUPERAR CONTRASEÑA ──────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault()
    reset()
    if (!email) return setError('Ingresa tu correo electrónico.')
    setLoading(true)
    const { error } = await resetPassword(email)
    setLoading(false)
    if (error) return setError(translateError(error.message))
    setSuccess('Te enviamos un enlace para restablecer tu contraseña.')
  }

  // ── GOOGLE ────────────────────────────────────────────────
  const handleGoogle = async () => {
    reset()
    const { error } = await signInWithGoogle()
    if (error) setError(translateError(error.message))
  }

  // ── Traducir errores de Supabase ──────────────────────────
  const translateError = (msg) => {
    if (msg.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.'
    if (msg.includes('Email not confirmed'))       return 'Confirma tu correo antes de iniciar sesión.'
    if (msg.includes('User already registered'))   return 'Este correo ya está registrado.'
    if (msg.includes('Password should be'))        return 'La contraseña debe tener al menos 6 caracteres.'
    if (msg.includes('rate limit'))                return 'Demasiados intentos. Espera un momento.'
    return msg
  }

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={S.card}>
        <button style={S.closeBtn} onClick={onClose}>✕</button>

        {/* Logo */}
        <div style={S.logo}>
          <div style={S.logoIcon}>💧</div>
          <span style={S.logoText}>Maz Clean</span>
        </div>

        {/* ── FORGOT PASSWORD ── */}
        {tab === 'forgot' ? (
          <>
            <h2 style={S.title}>Recuperar contraseña</h2>
            <p style={S.subtitle}>Te enviaremos un enlace a tu correo</p>
            {error && <div style={S.errorBox}>{error}</div>}
            {success && <div style={S.successBox}>{success}</div>}
            {!success && (
              <form onSubmit={handleForgot}>
                <div style={S.field}>
                  <label style={S.label}>Correo electrónico</label>
                  <input style={S.input} type="email" placeholder="tu@correo.com"
                    value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <button style={S.btnPrimary} type="submit" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </form>
            )}
            <p style={S.switchText}>
              <button style={S.switchLink} onClick={() => { setTab('login'); reset() }}>
                ← Volver al inicio de sesión
              </button>
            </p>
          </>
        ) : (
          <>
            {/* Tabs login / register */}
            <div style={S.tabs}>
              <button style={S.tab(tab === 'login')}    onClick={() => { setTab('login');    reset() }}>Iniciar sesión</button>
              <button style={S.tab(tab === 'register')} onClick={() => { setTab('register'); reset() }}>Registrarme</button>
            </div>

            {error   && <div style={S.errorBox}>{error}</div>}
            {success && <div style={S.successBox}>{success}</div>}

            {/* ── LOGIN FORM ── */}
            {tab === 'login' && (
              <form onSubmit={handleLogin}>
                <div style={S.field}>
                  <label style={S.label}>Correo electrónico</label>
                  <input style={S.input} type="email" placeholder="tu@correo.com"
                    value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>
                    Contraseña
                    <button type="button" style={S.forgotLink}
                      onClick={() => { setTab('forgot'); reset() }}>
                      ¿Olvidaste tu contraseña?
                    </button>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{ ...S.input, paddingRight: 44 }}
                      type={showPass ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)} style={{
                      position: 'absolute', right: 12, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none',
                      color: '#8CA0BF', cursor: 'pointer', fontSize: 16,
                    }}>
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
                <button style={{
                  ...S.btnPrimary,
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }} type="submit" disabled={loading}>
                  {loading ? 'Iniciando sesión...' : 'Iniciar sesión →'}
                </button>
              </form>
            )}

            {/* ── REGISTER FORM ── */}
            {tab === 'register' && !success && (
              <form onSubmit={handleRegister}>
                <div style={S.field}>
                  <label style={S.label}>Nombre completo</label>
                  <input style={S.input} type="text" placeholder="Tu nombre"
                    value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Correo electrónico</label>
                  <input style={S.input} type="email" placeholder="tu@correo.com"
                    value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Teléfono (opcional)</label>
                  <input style={S.input} type="tel" placeholder="+52 55 1234 5678"
                    value={phone} onChange={e => setPhone(e.target.value)} autoComplete="tel" />
                </div>
                <div style={S.field}>
                  <label style={S.label}>Contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      style={{ ...S.input, paddingRight: 44 }}
                      type={showPass ? 'text' : 'password'}
                      placeholder="Mínimo 8 caracteres"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)} style={{
                      position: 'absolute', right: 12, top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none', border: 'none',
                      color: '#8CA0BF', cursor: 'pointer', fontSize: 16,
                    }}>
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {/* Indicador de fuerza */}
                  {password && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
                      {['Débil', 'Regular', 'Fuerte'].map((l, i) => {
                        const strength = password.length < 8 ? 0 : password.length < 12 ? 1 : 2
                        const colors = ['#F87171', '#FFD166', '#00E5C8']
                        return (
                          <div key={i} style={{
                            flex: 1, height: 3, borderRadius: 2,
                            background: i <= strength ? colors[strength] : 'rgba(255,255,255,0.1)',
                            transition: 'background 0.3s',
                          }}/>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div style={S.field}>
                  <label style={S.label}>Confirmar contraseña</label>
                  <input
                    style={{
                      ...S.input,
                      borderColor: confirm && confirm !== password
                        ? 'rgba(248,113,113,0.6)' : 'rgba(255,255,255,0.10)',
                    }}
                    type={showPass ? 'text' : 'password'}
                    placeholder="Repite tu contraseña"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <p style={{ fontSize: 12, color: '#8CA0BF', marginBottom: 16, lineHeight: 1.6 }}>
                  Al registrarte aceptas los{' '}
                  <span style={{ color: '#00C8FF', cursor: 'pointer' }}>Términos de servicio</span>
                  {' '}y la{' '}
                  <span style={{ color: '#00C8FF', cursor: 'pointer' }}>Política de privacidad</span>.
                </p>
                <button style={{
                  ...S.btnPrimary,
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }} type="submit" disabled={loading}>
                  {loading ? 'Creando cuenta...' : 'Crear cuenta →'}
                </button>
              </form>
            )}

            {/* ── Divider + Google ── */}
            {!success && (
              <>
                <div style={S.divider}>
                  <div style={S.dividerLine}/>
                  <span>o continúa con</span>
                  <div style={S.dividerLine}/>
                </div>
                <button style={S.btnGoogle} onClick={handleGoogle}>
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
                    <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
                  </svg>
                  Continuar con Google
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
