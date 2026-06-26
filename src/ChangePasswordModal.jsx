// src/ChangePasswordModal.jsx
// Modal reutilizable para cambiar contraseña desde el perfil
// Para usuarios ya logueados — pide contraseña actual + nueva
// Usado en ClientView y OperatorAccount

import { useState } from 'react'
import { supabase } from './lib/supabase'

export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent]     = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState(false)
  const [show, setShow]           = useState({ current: false, password: false, confirm: false })

  const getStrength = (p) => {
    let s = 0
    if (p.length >= 8)  s++
    if (p.length >= 12) s++
    if (/[A-Z]/.test(p)) s++
    if (/[0-9]/.test(p)) s++
    if (/[^A-Za-z0-9]/.test(p)) s++
    return s
  }
  const strength      = getStrength(password)
  const strengthLabel = ['', 'Muy débil', 'Débil', 'Regular', 'Fuerte', 'Muy fuerte'][strength]
  const strengthColor = ['', '#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'][strength]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!current) return setError('Ingresa tu contraseña actual.')
    if (password.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres.')
    if (password !== confirm) return setError('Las contraseñas no coinciden.')
    if (strength < 2) return setError('La contraseña es muy débil. Agrega números o mayúsculas.')
    if (current === password) return setError('La nueva contraseña no puede ser igual a la actual.')
    setLoading(true)
    try {
      // Verificar contraseña actual re-autenticando
      const { data: { user } } = await supabase.auth.getUser()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email:    user.email,
        password: current,
      })
      if (signInError) { setError('La contraseña actual es incorrecta.'); setLoading(false); return }
      // Actualizar a la nueva
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      setSuccess(true)
    } catch (err) {
      setError(err.message?.includes('same password')
        ? 'La nueva contraseña no puede ser igual a la anterior.'
        : 'Error al cambiar la contraseña. Intenta de nuevo.')
    } finally { setLoading(false) }
  }

  const InputField = ({ label, value, onChange, show: vis, onToggle, placeholder }) => (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={vis ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          style={{ width: '100%', padding: '11px 44px 11px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          required
        />
        <button type="button" onClick={onToggle}
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#9ca3af' }}>
          {vis ? '🙈' : '👁️'}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '28px 28px', width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1f2937' }}>🔐 Cambiar contraseña</div>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>✕</button>
        </div>

        {success ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>¡Contraseña actualizada!</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Tu contraseña fue cambiada exitosamente.</div>
            <button onClick={onClose} style={{ width: '100%', padding: '13px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
                ⚠️ {error}
              </div>
            )}

            <InputField label="Contraseña actual" value={current} onChange={setCurrent}
              show={show.current} onToggle={() => setShow(s => ({ ...s, current: !s.current }))}
              placeholder="Tu contraseña actual" />

            <InputField label="Nueva contraseña" value={password} onChange={setPassword}
              show={show.password} onToggle={() => setShow(s => ({ ...s, password: !s.password }))}
              placeholder="Mínimo 8 caracteres" />

            {password.length > 0 && (
              <div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= strength ? strengthColor : '#e5e7eb' }} />
                  ))}
                </div>
                <div style={{ fontSize: 11, color: strengthColor, fontWeight: 600 }}>{strengthLabel}</div>
              </div>
            )}

            <InputField label="Confirmar nueva contraseña" value={confirm} onChange={setConfirm}
              show={show.confirm} onToggle={() => setShow(s => ({ ...s, confirm: !s.confirm }))}
              placeholder="Repite la nueva contraseña" />

            {confirm && password !== confirm && (
              <div style={{ fontSize: 11, color: '#ef4444', marginTop: -8 }}>Las contraseñas no coinciden</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button type="button" onClick={onClose}
                style={{ flex: 1, padding: '13px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="submit" disabled={loading}
                style={{ flex: 1, padding: '13px', background: loading ? '#93c5fd' : '#1e3a8a', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer' }}>
                {loading ? '⏳ Guardando...' : 'Actualizar'}
              </button>
            </div>

            <button type="button"
              onClick={() => { onClose(); }}
              style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 13, textAlign: 'center', padding: '4px 0' }}>
              ¿Olvidaste tu contraseña? → Recuperar por email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
