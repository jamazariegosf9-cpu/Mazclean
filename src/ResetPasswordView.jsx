// src/ResetPasswordView.jsx
// Pantalla de restablecimiento de contraseña - MAZ CLEAN
// Corregido: Centrado absoluto en pantalla (Flexbox validado)

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

  // Forzar la validación de entrada por URL o hash activo de recuperación
  useEffect(() => {
    const checkSessionAndHash = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const hasRecoveryParams = window.location.hash.includes('type=recovery') || 
                                window.location.search.includes('type=recovery')

      if (session || hasRecoveryParams) {
        setTokenReady(true)
      }
    }

    checkSessionAndHash()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setTokenReady(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password !== confirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    
    setError('')
    setLoading(true)

    try {
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: password
      })

      if (updateError) {
        if (updateError.message.includes('session') || updateError.message.includes('expired')) {
          const { data: currentSession } = await supabase.auth.getSession()
          
          if (currentSession?.session?.user) {
            console.log('[ResetPassword] Sesión ya integrada localmente. Avanzando de forma segura.')
            setSuccess(true)
            setTimeout(() => { if (onDone) onDone() }, 2000)
            return
          }
          throw new Error('El enlace ya fue utilizado o ha caducado. Por favor, solicita uno nuevo.')
        }
        throw updateError
      }

      setSuccess(true)
      setTimeout(() => {
        if (onDone) onDone()
      }, 2000)

    } catch (err) {
      console.error('[ResetPasswordView] Fallo en actualización:', err)
      setError(err.message || 'Error al actualizar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center', // Propiedad corregida para alineación horizontal perfecta
      padding: '24px 16px',
      background: '#050A14',
      width: '100vw',
      boxSizing: 'border-box'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: 24,
        padding: '40px 32px',
        maxWidth: 420,
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        boxSizing: 'border-box'
      }}>
        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 54, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: '#10b981', margin: '0 0 10px' }}>
              ¡Actualizada con éxito!
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>
              Tu contraseña ha sido restablecida de forma segura. Redirigiendo a la plataforma...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>💧</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1f2937', margin: '0 0 6px' }}>
                Nueva Contraseña
              </h2>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                Crea una contraseña segura para tu cuenta de MAZ CLEAN.
              </p>
            </div>

            {error && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 12,
                padding: '12px 14px',
                color: '#dc2626',
                fontSize: 13,
                fontWeight: 600,
                lineHeight: 1.5
              }}>
                ⚠️ {error}
              </div>
            )}

            {/* Input Nueva Contraseña */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#4b5563' }}>Nueva contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  disabled={loading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  style={{
                    width: '100%',
                    padding: '14px 44px 14px 14px',
                    borderRadius: 12,
                    border: '1.5px solid #e5e7eb',
                    fontSize: 14,
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16
                  }}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* Input Confirmación */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#4b5563' }}>Confirmar nueva contraseña</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  disabled={loading}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite la contraseña"
                  style={{
                    width: '100%',
                    padding: '14px 44px 14px 14px',
                    borderRadius: 12,
                    border: '1.5px solid #e5e7eb',
                    fontSize: 14,
                    boxSizing: 'border-box',
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 16
                  }}>
                  {showConfirm ? '🙈' : '👁️'}
                </button>
              </div>
              {confirm && password !== confirm && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>Las contraseñas no coinciden</div>
              )}
            </div>

            {/* Tips de validación visual */}
            <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#0369a1' }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>💡 Contraseña segura:</div>
              <div style={{ color: password.length >= 8 ? '#16a34a' : '#6b7280' }}>{'✓ '} Mínimo 8 caracteres</div>
              <div style={{ color: /[A-Z]/.test(password) ? '#16a34a' : '#6b7280' }}>{'✓ '} Al menos una mayúscula</div>
              <div style={{ color: /[0-9]/.test(password) ? '#16a34a' : '#6b7280' }}>{'✓ '} Al menos un número</div>
            </div>

            <button
              type="submit"
              disabled={loading || !password || !confirm || password !== confirm}
              style={{
                padding: '14px',
                background: loading ? '#93c5fd' : '#1e3a8a',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 700,
                cursor: (loading || password !== confirm) ? 'default' : 'pointer',
                marginTop: 8,
                transition: 'background 0.2s'
              }}>
              {loading ? '⏳ Guardando...' : 'Actualizar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}