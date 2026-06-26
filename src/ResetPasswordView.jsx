// src/ResetPasswordView.jsx
// Pantalla de restablecimiento de contraseña
// Se muestra cuando Supabase redirige al usuario tras clic en el email de reset
// Lee el token del hash del URL y llama a supabase.auth.updateUser()

import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'

export default function ResetPasswordView({ onDone }) {
  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState(false)
  const [showPass, setShowPass]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [tokenReady, setTokenReady]   = useState(false)

  // Supabase maneja el token del hash automáticamente via onAuthStateChange
  // Solo necesitamos esperar el evento PASSWORD_RECOVERY
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setTokenReady(true)
      }
    })
    // Si ya hay sesión activa con recovery token, marcar listo
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setTokenReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Validación de fortaleza de contraseña
  const getStrength = (p) => {
    let score = 0
    if (p.length >= 8)  score++
    if (p.length >= 12) score++
    if (/[A-Z]/.test(p)) score++
    if (/[0-9]/.test(p)) score++
    if (/[^A-Za-z0-9]/.test(p)) score++
    return score
  }
  const strength = getStrength(password)
  const strengthLabel = ['', 'Muy débil', 'Débil', 'Regular', 'Fuerte', 'Muy fuerte'][strength]
  const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'][strength]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    if (strength < 2) return setError('La contraseña es muy débil. Agrega números o mayúsculas.')
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setSuccess(true)
      setTimeout(() => { onDone?.() }, 3000)
    } catch (err) {
      setError(err.message?.includes('same password')
        ? 'La nueva contraseña no puede ser igual a la anterior.'
        : 'Error al actualizar la contraseña. El enlace puede haber expirado.')
    } finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg,#0f172a,#1e3a8a)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "'Poppins', sans-serif",
    }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 24, padding: '36px 32px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1e3a8a' }}>MAZ CLEAN</div>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>Nueva contraseña</div>
        </div>

        {success ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>¡Contraseña actualizada!</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 1.6 }}>
              Tu contraseña fue cambiada exitosamente. Serás redirigido en un momento.
            </div>
            <button onClick={onDone} style={{ width: '100%', padding: '14px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Ir al inicio
            </button>
          </div>
        ) : !tokenReady ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: 14, color: '#6b7280' }}>Verificando enlace de recuperación...</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
              Elige una contraseña segura de al menos 8 caracteres.
            </p>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
                ⚠️ {error}
              </div>
            )}

            {/* Nueva contraseña */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Nueva contraseña
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  style={{ width: '100%', padding: '12px 44px 12px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  required
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
              {/* Indicador de fortaleza */}
              {password.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= strength ? strengthColor : '#e5e7eb', transition: 'background 0.3s' }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: strengthColor, fontWeight: 600 }}>{strengthLabel}</div>
                </div>
              )}
            </div>

            {/* Confirmar contraseña */}
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                Confirmar contraseña
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Repite tu contraseña"
                  style={{ width: '100%', padding: '12px 44px 12px 14px', border: `1.5px solid ${confirm && password !== confirm ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  required
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>
                  {showConfirm ? '🙈' : '👁️'}
                </button>
              </div>
              {confirm && password !== confirm && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Las contraseñas no coinciden</div>
              )}
            </div>

            {/* Tips de seguridad */}
            <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#0369a1' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>💡 Contraseña segura:</div>
              <div style={{ color: password.length >= 8 ? '#16a34a' : '#6b7280' }}>{'✓ '} Mínimo 8 caracteres</div>
              <div style={{ color: /[A-Z]/.test(password) ? '#16a34a' : '#6b7280' }}>{'✓ '} Al menos una mayúscula</div>
              <div style={{ color: /[0-9]/.test(password) ? '#16a34a' : '#6b7280' }}>{'✓ '} Al menos un número</div>
            </div>

            <button type="submit" disabled={loading || !password || !confirm}
              style={{ padding: '14px', background: loading ? '#93c5fd' : '#1e3a8a', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer', marginTop: 4 }}>
              {loading ? '⏳ Guardando...' : '🔐 Actualizar contraseña'}
            </button>
          </form>
        )}
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');`}</style>
    </div>
  )
}
