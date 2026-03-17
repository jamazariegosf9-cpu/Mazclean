// ============================================================
// MAZ CLEAN — AdminView.jsx
// Panel de administración conectado a Supabase
// ============================================================
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'
import { sendWhatsApp } from './lib/whatsapp'

const STATUS_COLORS = {
  pendiente:   '#FFD166',
  confirmado:  '#00C8FF',
  en_camino:   '#A78BFA',
  en_proceso:  '#F97316',
  finalizado:  '#00E5C8',
  cancelado:   '#F87171',
}

const STATUS_LABELS = {
  pendiente:   'Pendiente',
  confirmado:  'Confirmado',
  en_camino:   'En camino',
  en_proceso:  'En proceso',
  finalizado:  'Finalizado',
  cancelado:   'Cancelado',
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#8CA0BF'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 100,
      background: `${color}20`, color, fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }}/>
      {STATUS_LABELS[status] || status}
    </span>
  )
}

export default function AdminView({ onNavigate }) {
  const { user, profile } = useAuth()
  const [tab, setTab]             = useState('dashboard')
  const [bookings, setBookings]   = useState([])
  const [operators, setOperators] = useState([])
  const [clients, setClients]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [assigning, setAssigning] = useState(null)

  useEffect(() => {
    if (!user) return
    loadAll()
  }, [user])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [b, o, c] = await Promise.all([
        supabase
          .from('bookings')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'operador'),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'cliente'),
      ])
      if (b.data) setBookings(b.data)
      if (o.data) setOperators(o.data)
      if (c.data) setClients(c.data)
    } catch (err) {
      console.error('Error cargando datos:', err)
    } finally {
      setLoading(false)
    }
  }

  const assignOperator = async (bookingId, operatorId) => {
    setAssigning(bookingId)
    const { error } = await supabase
      .from('bookings')
      .update({ operator_id: operatorId, status: 'confirmado' })
      .eq('id', bookingId)
    if (!error) {
      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, operator_id: operatorId, status: 'confirmado' } : b
      ))

      // Notificación WhatsApp al cliente — no bloqueante
      const booking   = bookings.find(b => b.id === bookingId)
      const operator  = operators.find(o => o.id === operatorId)
      if (booking) {
        supabase.from('profiles').select('phone').eq('id', booking.client_id).single()
          .then(({ data: clientProfile }) => {
            if (clientProfile?.phone) {
              sendWhatsApp('operator_assigned', clientProfile.phone, {
                booking_ref:    booking.booking_ref,
                service_name:   booking.service_name,
                scheduled_date: booking.scheduled_date,
                scheduled_time: booking.scheduled_time,
                total_price:    booking.total_price || booking.service_price,
                operator_name:  operator?.full_name || 'nuestro operador',
              })
            }
          })
          .catch(() => {})
      }
    }
    setAssigning(null)
  }

  const updateStatus = async (bookingId, newStatus) => {
    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus })
      .eq('id', bookingId)
    if (!error) {
      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, status: newStatus } : b
      ))
    }
  }

  if (!user || !profile) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#8CA0BF' }}>Cargando...</p>
      </div>
    )
  }

  if (profile.role !== 'admin') {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48 }}>🔐</div>
        <h3 style={{ fontWeight: 800, fontSize: 24 }}>Acceso solo para administradores</h3>
        <p style={{ color: '#8CA0BF' }}>Tu cuenta no tiene permisos de administrador.</p>
        <button onClick={() => onNavigate('home')} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, cursor: 'pointer' }}>
          Ir al inicio
        </button>
      </div>
    )
  }

  // ── Métricas ──────────────────────────────────────────────
  const total       = bookings.length
  const pendientes  = bookings.filter(b => b.status === 'pending').length
  const activos     = bookings.filter(b => ['confirmado','en_camino','en_proceso'].includes(b.status)).length
  const finalizados = bookings.filter(b => b.status === 'finalizado').length
  const ingresos    = bookings.filter(b => b.status === 'finalizado').reduce((s, b) => s + (b.service_price || b.total_price || 0), 0)
  const today       = new Date().toISOString().split('T')[0]
  const hoy         = bookings.filter(b => b.scheduled_date === today).length

  const tabs = [
    ['dashboard', '📊 Dashboard'],
    ['bookings',  '📋 Reservaciones'],
    ['operators', '🧹 Operadores'],
    ['clients',   '👥 Clientes'],
  ]

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>⚙️</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 2 }}>Panel Admin</h2>
          <p style={{ color: '#8CA0BF', fontSize: 14 }}>{profile?.full_name}</p>
        </div>
        <button onClick={loadAll} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#8CA0BF', cursor: 'pointer', fontSize: 13 }}>
          Actualizar
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4, marginBottom: 28, gap: 4, flexWrap: 'wrap' }}>
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, minWidth: 120, padding: '10px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: tab === k ? 'rgba(0,200,255,0.15)' : 'transparent',
            color: tab === k ? '#00C8FF' : '#8CA0BF',
            fontWeight: 600, fontSize: 13,
          }}>{l}</button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#8CA0BF', textAlign: 'center', padding: 60 }}>Cargando datos...</p>
      ) : (
        <>
          {/* ── DASHBOARD ── */}
          {tab === 'dashboard' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginBottom: 28 }}>
                {[
                  { label: 'Total',       value: total,       color: '#00C8FF', icon: '📋' },
                  { label: 'Hoy',         value: hoy,         color: '#A78BFA', icon: '📅' },
                  { label: 'Pendientes',  value: pendientes,  color: '#FFD166', icon: '⏳' },
                  { label: 'En curso',    value: activos,     color: '#F97316', icon: '🔵' },
                  { label: 'Finalizados', value: finalizados, color: '#00E5C8', icon: '✅' },
                  { label: 'Ingresos',    value: `$${ingresos.toLocaleString()}`, color: '#00E5C8', icon: '💰' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{s.icon}</div>
                    <div style={{ fontWeight: 800, fontSize: 22, color: s.color }}>{s.value}</div>
                    <div style={{ color: '#8CA0BF', fontSize: 12, marginTop: 4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 14, color: '#8CA0BF' }}>Últimas reservaciones</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {bookings.slice(0, 5).map(b => (
                  <div key={b.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 22 }}>🚗</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{b.service_name}</div>
                      <div style={{ color: '#8CA0BF', fontSize: 12 }}>{b.scheduled_date} · {b.scheduled_time}</div>
                    </div>
                    <StatusBadge status={b.status} />
                    <div style={{ color: '#00C8FF', fontWeight: 700 }}>${b.service_price || b.total_price || 0} MXN</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── RESERVACIONES ── */}
          {tab === 'bookings' && (
            <div style={{ display: 'grid', gap: 14 }}>
              {bookings.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#8CA0BF' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
                  <p>No hay reservaciones aún.</p>
                </div>
              ) : bookings.map(b => (
                <div key={b.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 28 }}>🚗</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{b.service_name}</div>
                        <div style={{ color: '#8CA0BF', fontSize: 13 }}>🚙 {b.vehicle_brand} {b.vehicle_color}</div>
                        <div style={{ color: '#8CA0BF', fontSize: 13 }}>📍 {b.address}</div>
                        <div style={{ color: '#8CA0BF', fontSize: 13 }}>📅 {b.scheduled_date} · {b.scheduled_time}</div>
                        {b.notes && <div style={{ color: '#8CA0BF', fontSize: 12, marginTop: 2 }}>📝 {b.notes}</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <StatusBadge status={b.status} />
                      <div style={{ color: '#00C8FF', fontWeight: 800, fontSize: 17, marginTop: 6 }}>${b.service_price || b.total_price || 0} MXN</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                      defaultValue={b.operator_id || ''}
                      onChange={e => e.target.value && assignOperator(b.id, e.target.value)}
                      disabled={assigning === b.id}
                      style={{ flex: 1, minWidth: 180, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: '#0D1F3C', color: '#F0F6FF', fontSize: 13, cursor: 'pointer' }}
                    >
                      <option value=''>— Asignar operador —</option>
                      {operators.map(op => (
                        <option key={op.id} value={op.id}>{op.full_name}</option>
                      ))}
                    </select>

                    <select
                      value={b.status}
                      onChange={e => updateStatus(b.id, e.target.value)}
                      style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: '#0D1F3C', color: '#F0F6FF', fontSize: 13, cursor: 'pointer' }}
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── OPERADORES ── */}
          {tab === 'operators' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontWeight: 700, fontSize: 16 }}>Operadores ({operators.length})</h3>
              </div>
              {operators.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🧹</div>
                  <p style={{ color: '#8CA0BF' }}>No hay operadores registrados aún.</p>
                  <p style={{ color: '#8CA0BF', fontSize: 13, marginTop: 8 }}>Para agregar un operador, regístralo como usuario y cambia su rol a "operador" en la base de datos.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12 }}>
                  {operators.map(op => {
                    const asignados   = bookings.filter(b => b.operator_id === op.id && !['finalizado','cancelado'].includes(b.status)).length
                    const completados = bookings.filter(b => b.operator_id === op.id && b.status === 'finalizado').length
                    return (
                      <div key={op.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#1A3A6B,#0D1F3C)', border: '2px solid rgba(0,229,200,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#00E5C8', flexShrink: 0 }}>
                          {op.full_name?.charAt(0)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{op.full_name}</div>
                          <div style={{ color: '#8CA0BF', fontSize: 13 }}>{op.phone || 'Sin teléfono'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 18, color: '#FFD166' }}>{asignados}</div>
                            <div style={{ color: '#8CA0BF', fontSize: 11 }}>Activos</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: 18, color: '#00E5C8' }}>{completados}</div>
                            <div style={{ color: '#8CA0BF', fontSize: 11 }}>Completados</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── CLIENTES ── */}
          {tab === 'clients' && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Clientes ({clients.length})</h3>
              {clients.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#8CA0BF' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
                  <p>No hay clientes registrados aún.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {clients.map(c => {
                    const totalServicios = bookings.filter(b => b.client_id === c.id).length
                    const gasto = bookings.filter(b => b.client_id === c.id && b.status === 'finalizado').reduce((s, b) => s + (b.service_price || b.total_price || 0), 0)
                    return (
                      <div key={c.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#1A3A6B,#0D1F3C)', border: '2px solid rgba(0,200,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, color: '#00C8FF', flexShrink: 0 }}>
                          {c.full_name?.charAt(0)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{c.full_name}</div>
                          <div style={{ color: '#8CA0BF', fontSize: 12 }}>{c.phone || 'Sin teléfono'}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 20, textAlign: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 16, color: '#00C8FF' }}>{totalServicios}</div>
                            <div style={{ color: '#8CA0BF', fontSize: 11 }}>Servicios</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 16, color: '#00E5C8' }}>${gasto.toLocaleString()}</div>
                            <div style={{ color: '#8CA0BF', fontSize: 11 }}>Gastado</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
