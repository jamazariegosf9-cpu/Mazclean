// ============================================================
// MAZ CLEAN — ClientView.jsx
// Panel del cliente conectado a Supabase
// ============================================================
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'

const STATUS_CONFIG = {
  pendiente:   { label: 'Pendiente',  color: '#FFD166', bg: 'rgba(255,209,102,0.15)' },
  confirmado:  { label: 'Confirmado', color: '#00C8FF', bg: 'rgba(0,200,255,0.15)' },
  en_camino:   { label: 'En camino',  color: '#00C8FF', bg: 'rgba(0,200,255,0.15)' },
  en_proceso:  { label: 'En proceso', color: '#A78BFA', bg: 'rgba(167,139,250,0.15)' },
  finalizado:  { label: 'Finalizado', color: '#00E5C8', bg: 'rgba(0,229,200,0.15)' },
  cancelado:   { label: 'Cancelado',  color: '#F87171', bg: 'rgba(248,113,113,0.15)' },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pendiente
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 100,
      background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block' }}/>
      {cfg.label}
    </span>
  )
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16, ...style,
    }}>
      {children}
    </div>
  )
}

export default function ClientView({ onNavigate }) {
  const { user, profile, updateProfile } = useAuth()
  const [tab, setTab]           = useState('reservaciones')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  // Edicion de perfil
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone, setPhone]       = useState(profile?.phone || '')

  // Cargar reservaciones del cliente
  useEffect(() => {
    if (!user) return
    setLoading(true)
    supabase
      .from('bookings')
      .select(`
        *,
        services ( name, icon, color )
      `)
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setBookings(data || [])
        setLoading(false)
      })
  }, [user])

  const handleSaveProfile = async () => {
    setSaving(true)
    await updateProfile({ full_name: fullName, phone })
    setSaving(false)
    setSaved(true)
    setEditMode(false)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!user) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48 }}>🔐</div>
        <h3 style={{ fontWeight: 800, fontSize: 24 }}>Inicia sesion para ver tu cuenta</h3>
        <button onClick={() => onNavigate('home')} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, cursor: 'pointer' }}>
          Ir al inicio
        </button>
      </div>
    )
  }

  const initials = profile?.full_name?.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase() || 'U'
  const pending  = bookings.filter(b => b.status === 'pendiente' || b.status === 'confirmado' || b.status === 'en_camino' || b.status === 'en_proceso')
  const finished = bookings.filter(b => b.status === 'finalizado' || b.status === 'cancelado')

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px', maxWidth: 800, margin: '0 auto' }}>

      {/* Header perfil */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 36, flexWrap: 'wrap' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'linear-gradient(135deg,#1A3A6B,#0D1F3C)',
          border: '2px solid rgba(0,200,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, fontWeight: 800, color: '#00C8FF', flexShrink: 0,
        }}>{initials}</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontWeight: 800, fontSize: 24, marginBottom: 4 }}>{profile?.full_name}</h2>
          <p style={{ color: '#8CA0BF', fontSize: 14 }}>{user.email}</p>
          <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ color: '#FFD166', fontSize: 13 }}>⭐ {profile?.points || 0} puntos</span>
            <span style={{ color: '#8CA0BF', fontSize: 13 }}>📋 {bookings.length} servicios</span>
          </div>
        </div>
        <button onClick={() => onNavigate('booking')} style={{
          padding: '12px 24px', borderRadius: 12, border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg,#00C8FF,#00E5C8)',
          color: '#050A14', fontWeight: 700, fontSize: 14,
        }}>
          + Nueva Reserva
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4, marginBottom: 28, gap: 4 }}>
        {[
          ['reservaciones', '📋 Reservaciones'],
          ['activas',       '🔵 Activas'],
          ['perfil',        '👤 Perfil'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: '10px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: tab === k ? 'rgba(0,200,255,0.15)' : 'transparent',
            color: tab === k ? '#00C8FF' : '#8CA0BF',
            fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
          }}>{l}</button>
        ))}
      </div>

      {/* ── TAB: RESERVACIONES ── */}
      {tab === 'reservaciones' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {loading ? (
            <p style={{ color: '#8CA0BF', textAlign: 'center', padding: 40 }}>Cargando reservaciones...</p>
          ) : bookings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
              <p style={{ color: '#8CA0BF', fontSize: 16, marginBottom: 20 }}>Aun no tienes reservaciones</p>
              <button onClick={() => onNavigate('booking')} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, cursor: 'pointer' }}>
                Hacer mi primera reserva
              </button>
            </div>
          ) : (
            bookings.map((b, i) => (
              <Card key={b.id} style={{ padding: 22, animationDelay: `${i * 0.06}s` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 46, height: 46, borderRadius: 12, fontSize: 22, flexShrink: 0,
                      background: `${b.services?.color || '#00C8FF'}18`,
                      border: `1px solid ${b.services?.color || '#00C8FF'}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {b.services?.icon || '🚗'}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{b.services?.name || 'Servicio'}</div>
                      <div style={{ color: '#8CA0BF', fontSize: 13, marginBottom: 2 }}>📍 {b.address_line}</div>
                      <div style={{ color: '#8CA0BF', fontSize: 13 }}>📅 {b.scheduled_date} · {b.scheduled_time?.slice(0,5)}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={b.status} />
                    <div style={{ color: '#00C8FF', fontWeight: 800, fontSize: 18, marginTop: 8 }}>${b.total_price} MXN</div>
                    <div style={{ color: '#8CA0BF', fontSize: 12, marginTop: 2 }}>{b.booking_ref}</div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── TAB: ACTIVAS ── */}
      {tab === 'activas' && (
        <div style={{ display: 'grid', gap: 14 }}>
          {pending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
              <p style={{ color: '#8CA0BF', fontSize: 16 }}>No tienes reservaciones activas</p>
            </div>
          ) : (
            pending.map(b => (
              <Card key={b.id} style={{ padding: 22, borderColor: 'rgba(0,200,255,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{b.services?.name || 'Servicio'}</div>
                    <div style={{ color: '#8CA0BF', fontSize: 13, marginBottom: 4 }}>📍 {b.address_line}</div>
                    <div style={{ color: '#8CA0BF', fontSize: 13 }}>📅 {b.scheduled_date} · {b.scheduled_time?.slice(0,5)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={b.status} />
                    <div style={{ color: '#00C8FF', fontWeight: 800, fontSize: 20, marginTop: 8 }}>${b.total_price} MXN</div>
                  </div>
                </div>
                {/* Progress bar de estado */}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    {['Pendiente', 'Confirmado', 'En camino', 'Finalizado'].map((s, i) => {
                      const steps = { pendiente: 0, confirmado: 1, en_camino: 2, en_proceso: 2, finalizado: 3 }
                      const current = steps[b.status] ?? 0
                      return (
                        <span key={s} style={{ fontSize: 11, color: i <= current ? '#00C8FF' : '#8CA0BF', fontWeight: i <= current ? 600 : 400 }}>
                          {s}
                        </span>
                      )
                    })}
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      background: 'linear-gradient(90deg,#00C8FF,#00E5C8)',
                      width: `${({ pendiente: 10, confirmado: 33, en_camino: 66, en_proceso: 75, finalizado: 100 }[b.status]) || 10}%`,
                      transition: 'width 0.5s ease',
                    }}/>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── TAB: PERFIL ── */}
      {tab === 'perfil' && (
        <Card style={{ padding: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h3 style={{ fontWeight: 700, fontSize: 18 }}>Informacion Personal</h3>
            {!editMode && (
              <button onClick={() => setEditMode(true)} style={{ padding: '8px 18px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'none', color: '#F0F6FF', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                Editar
              </button>
            )}
          </div>

          {saved && (
            <div style={{ background: 'rgba(0,229,200,0.12)', border: '1px solid rgba(0,229,200,0.3)', borderRadius: 10, padding: '10px 16px', color: '#00E5C8', fontSize: 14, marginBottom: 20 }}>
              ✓ Perfil actualizado correctamente
            </div>
          )}

          <div style={{ display: 'grid', gap: 18 }}>
            {[
              { label: 'Nombre completo', value: fullName, setter: setFullName, type: 'text' },
              { label: 'Telefono', value: phone, setter: setPhone, type: 'tel' },
            ].map(({ label, value, setter, type }) => (
              <div key={label}>
                <label style={{ fontSize: 13, color: '#8CA0BF', display: 'block', marginBottom: 8 }}>{label}</label>
                <input
                  type={type}
                  value={value}
                  onChange={e => setter(e.target.value)}
                  disabled={!editMode}
                  style={{
                    width: '100%', padding: '12px 16px',
                    background: editMode ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${editMode ? 'rgba(0,200,255,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    borderRadius: 10, color: '#F0F6FF', fontSize: 15, outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}

            {/* Campo no editable */}
            <div>
              <label style={{ fontSize: 13, color: '#8CA0BF', display: 'block', marginBottom: 8 }}>Correo electronico</label>
              <input value={user.email} disabled style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#8CA0BF', fontSize: 15, boxSizing: 'border-box' }} />
            </div>

            <div>
              <label style={{ fontSize: 13, color: '#8CA0BF', display: 'block', marginBottom: 8 }}>Rol de cuenta</label>
              <input value={profile?.role || 'cliente'} disabled style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#8CA0BF', fontSize: 15, boxSizing: 'border-box', textTransform: 'capitalize' }} />
            </div>
          </div>

          {editMode && (
            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button onClick={handleSaveProfile} disabled={saving} style={{ flex: 2, padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button onClick={() => { setEditMode(false); setFullName(profile?.full_name || ''); setPhone(profile?.phone || '') }} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'none', color: '#F0F6FF', fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
