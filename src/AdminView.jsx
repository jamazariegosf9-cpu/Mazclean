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

// Normalizar status al enum correcto
function normalizeStatus(status) {
  const map = { 
    pending: 'pendiente', 
    assigned: 'confirmado', 
    confirmed: 'confirmado',
    on_the_way: 'en_camino', 
    arrived: 'en_proceso', 
    washing: 'en_proceso', 
    done: 'finalizado', 
    cancelled: 'cancelado' 
  }
  return map[status] || status
}

function StatusBadge({ status }) {
  const normalized = normalizeStatus(status)
  const color = STATUS_COLORS[normalized] || '#8CA0BF'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 100,
      background: `${color}20`, color, fontSize: 11, fontWeight: 600,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block' }}/>
      {STATUS_LABELS[normalized] || normalized}
    </span>
  )
}

// Verifica si un error de Supabase es ignorable
function isIgnorableError(error) {
  if (!error) return true
  const msg = error.message || ''
  return msg.includes('409') || msg.includes('Conflict') || error.code === '23505'
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
    if (profile && profile.role !== 'admin') {
      onNavigate('home')
      return
    }
    loadAll()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadAll()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [user, profile])

  const loadAll = async () => {
    setLoading(true)
    try {
      // CARGA DE DATOS CORREGIDA: Se traen perfiles por rol exacto (ajustar si es 'operator' o 'operador' según tu DB)
      const [b, o, c] = await Promise.all([
        supabase
          .from('bookings')
          .select(`
            *,
            profiles!bookings_client_id_fkey (
              full_name,
              phone
            )
          `)
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
    if (!operatorId) return
    setAssigning(bookingId)

    try {
      // ACTUALIZACIÓN ROBUSTA: Incluye updated_at y maneja el error de foreign key si existiera
      const { error } = await supabase
        .from('bookings')
        .update({
          operator_id: operatorId,
          status: 'confirmado',
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId)

      if (error) {
        console.error('Error de Supabase:', error.message)
        alert(`Error al asignar: ${error.message}`)
      } else {
        // Actualización local inmediata
        setBookings(prev => prev.map(b =>
          b.id === bookingId ? { ...b, operator_id: operatorId, status: 'confirmado' } : b
        ))
        
        // WhatsApp (Lógica original conservada)
        const booking  = bookings.find(b => b.id === bookingId)
        const operator = operators.find(o => o.id === operatorId)
        if (booking && booking.profiles?.phone) {
          sendWhatsApp('operator_assigned', booking.profiles.phone, {
            booking_ref:    booking.booking_ref,
            service_name:   booking.service_name,
            scheduled_date: booking.scheduled_date,
            scheduled_time: booking.scheduled_time,
            total_price:    booking.total_price || booking.service_price,
            operator_name:  operator?.full_name || 'nuestro operador',
          })
        }
      }
    } catch (err) {
      console.error('Error inesperado:', err)
    } finally {
      setAssigning(null)
    }
  }

  const updateStatus = async (bookingId, newStatus) => {
    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus })
      .eq('id', bookingId)

    if (isIgnorableError(error)) {
      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, status: newStatus } : b
      ))
    }
  }

  const deleteBooking = async (bookingId) => {
    if (!window.confirm('¿Eliminar esta reservación? Esta acción no se puede deshacer.')) return
    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', bookingId)
    if (!error) {
      setBookings(prev => prev.filter(b => b.id !== bookingId))
    }
  }

  if (!user || !profile) return null
  if (profile.role !== 'admin') {
    onNavigate('home')
    return null
  }

  // Métricas (Usando normalizeStatus para que sean reales)
  const total       = bookings.length
  const pendientes  = bookings.filter(b => normalizeStatus(b.status) === 'pendiente').length
  const activos     = bookings.filter(b => ['confirmado','en_camino','en_proceso'].includes(normalizeStatus(b.status))).length
  const finalizados = bookings.filter(b => normalizeStatus(b.status) === 'finalizado').length
  const ingresos    = bookings.filter(b => normalizeStatus(b.status) === 'finalizado').reduce((s, b) => s + (Number(b.total_price) || Number(b.service_price) || 0), 0)
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
          {/* DASHBOARD */}
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

          {/* RESERVACIONES */}
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
                    <button
                      onClick={() => deleteBooking(b.id)}
                      style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.1)', color: '#F87171', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                    >
                      🗑️ Eliminar
                    </button>
                    <select
                      value={b.operator_id || ''}
                      onChange={e => assignOperator(b.id, e.target.value)}
                      disabled={assigning === b.id}
                      style={{ flex: 1, minWidth: 180, padding: '9px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: '#0D1F3C', color: '#F0F6FF', fontSize: 13, cursor: 'pointer' }}
                    >
                      <option value=''>— Asignar operador —</option>
                      {operators.map(op => (
                        <option key={op.id} value={op.id}>{op.full_name}</option>
                      ))}
                    </select>

                    <select
                      value={normalizeStatus(b.status)}
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

          {/* OPERADORES */}
          {tab === 'operators' && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Operadores ({operators.length})</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                {operators.map(op => {
                  const asignados   = bookings.filter(b => b.operator_id === op.id && !['finalizado','cancelado'].includes(normalizeStatus(b.status))).length
                  const completados = bookings.filter(b => b.operator_id === op.id && normalizeStatus(b.status) === 'finalizado').length
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
            </div>
          )}

          {/* CLIENTES */}
          {tab === 'clients' && (
            <div>
              <h3 style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Clientes ({clients.length})</h3>
              <div style={{ display: 'grid', gap: 10 }}>
                {clients.map(c => {
                  const userBookings = bookings.filter(b => b.client_id === c.id)
                  const totalServicios = userBookings.length
                  const gasto = userBookings.filter(b => normalizeStatus(b.status) === 'finalizado').reduce((s, b) => s + (Number(b.total_price) || 0), 0)
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
            </div>
          )}
        </>
      )}
    </div>
  )
}