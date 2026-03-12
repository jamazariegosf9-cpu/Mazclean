// ============================================================
// MAZ CLEAN — OperatorView.jsx
// Panel del operador conectado a Supabase
// ============================================================
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'

const STATUS_FLOW = {
  pendiente:  { next: 'confirmado',  label: 'Confirmar',     color: '#FFD166', nextLabel: 'Confirmado' },
  confirmado: { next: 'en_camino',   label: 'Salir',         color: '#00C8FF', nextLabel: 'En camino' },
  en_camino:  { next: 'en_proceso',  label: 'Iniciar',       color: '#A78BFA', nextLabel: 'En proceso' },
  en_proceso: { next: 'finalizado',  label: 'Finalizar',     color: '#00E5C8', nextLabel: 'Finalizado' },
  finalizado: { next: null,          label: 'Completado',    color: '#00E5C8', nextLabel: null },
  cancelado:  { next: null,          label: 'Cancelado',     color: '#F87171', nextLabel: null },
}

const STATUS_LABELS = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  en_camino:  'En camino',
  en_proceso: 'En proceso',
  finalizado: 'Finalizado',
  cancelado:  'Cancelado',
}

function StatusBadge({ status }) {
  const cfg = STATUS_FLOW[status] || STATUS_FLOW.pendiente
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 12px', borderRadius: 100,
      background: `${cfg.color}20`, color: cfg.color,
      fontSize: 12, fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block' }}/>
      {STATUS_LABELS[status]}
    </span>
  )
}

export default function OperatorView({ onNavigate }) {
  const { user, profile } = useAuth()
  const [tab, setTab]           = useState('activas')
  const [bookings, setBookings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [updating, setUpdating] = useState(null)

  const loadBookings = () => {
    if (!user) return
    setLoading(true)
    supabase
      .from('bookings')
      .select(`*, services ( name, icon, color ), profiles!bookings_client_id_fkey ( full_name, phone )`)
      .eq('operator_id', user.id)
      .order('scheduled_date', { ascending: true })
      .then(({ data, error }) => {
        if (!error && data) setBookings(data)
        setLoading(false)
      })
  }

  useEffect(() => { loadBookings() }, [user])

  const handleStatusChange = async (bookingId, newStatus) => {
    setUpdating(bookingId)
    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus })
      .eq('id', bookingId)
    if (!error) {
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b))
    }
    setUpdating(null)
  }

  if (!user || profile?.role !== 'operador') {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48 }}>🔐</div>
        <h3 style={{ fontWeight: 800, fontSize: 24 }}>Acceso solo para operadores</h3>
        <p style={{ color: '#8CA0BF' }}>Tu cuenta no tiene permisos de operador.</p>
        <button onClick={() => onNavigate('home')} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, cursor: 'pointer' }}>
          Ir al inicio
        </button>
      </div>
    )
  }

  const activas   = bookings.filter(b => !['finalizado','cancelado'].includes(b.status))
  const historial = bookings.filter(b =>  ['finalizado','cancelado'].includes(b.status))
  const shown     = tab === 'activas' ? activas : historial

  const today = new Date().toISOString().split('T')[0]
  const hoy   = activas.filter(b => b.scheduled_date === today)

  return (
    <div style={{ minHeight: '100vh', padding: '32px 24px', maxWidth: 800, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg,#1A3A6B,#0D1F3C)',
          border: '2px solid rgba(0,229,200,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
        }}>🧹</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontWeight: 800, fontSize: 22, marginBottom: 2 }}>Panel Operador</h2>
          <p style={{ color: '#8CA0BF', fontSize: 14 }}>{profile?.full_name}</p>
        </div>
        <button onClick={loadBookings} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'none', color: '#8CA0BF', cursor: 'pointer', fontSize: 13 }}>
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { label: 'Hoy',      value: hoy.length,      color: '#00C8FF', icon: '📅' },
          { label: 'Activas',  value: activas.length,   color: '#FFD166', icon: '🔵' },
          { label: 'Completados', value: historial.filter(b => b.status === 'finalizado').length, color: '#00E5C8', icon: '✅' },
        ].map(s => (
          <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
            <div style={{ fontWeight: 800, fontSize: 24, color: s.color }}>{s.value}</div>
            <div style={{ color: '#8CA0BF', fontSize: 12 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 4, marginBottom: 24, gap: 4 }}>
        {[['activas','🔵 Activas'],['historial','📋 Historial']].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            flex: 1, padding: '10px 8px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: tab === k ? 'rgba(0,200,255,0.15)' : 'transparent',
            color: tab === k ? '#00C8FF' : '#8CA0BF',
            fontWeight: 600, fontSize: 13,
          }}>{l}</button>
        ))}
      </div>

      {/* Bookings */}
      {loading ? (
        <p style={{ color: '#8CA0BF', textAlign: 'center', padding: 40 }}>Cargando servicios...</p>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{tab === 'activas' ? '🎉' : '📭'}</div>
          <p style={{ color: '#8CA0BF', fontSize: 16 }}>
            {tab === 'activas' ? 'No tienes servicios activos por ahora' : 'No hay servicios completados aun'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {shown.map(b => {
            const flow = STATUS_FLOW[b.status]
            const isToday = b.scheduled_date === today
            return (
              <div key={b.id} style={{
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${isToday ? 'rgba(0,200,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 16, padding: 22,
              }}>
                {isToday && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,200,255,0.12)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 100, padding: '3px 12px', fontSize: 11, color: '#00C8FF', fontWeight: 600, marginBottom: 14 }}>
                    ⚡ HOY
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
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
                      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{b.services?.name}</div>
                      <div style={{ color: '#8CA0BF', fontSize: 13, marginBottom: 2 }}>
                        👤 {b.profiles?.full_name || 'Cliente'}
                      </div>
                      {b.profiles?.phone && (
                        <div style={{ color: '#8CA0BF', fontSize: 13, marginBottom: 2 }}>
                          📞 {b.profiles.phone}
                        </div>
                      )}
                      <div style={{ color: '#8CA0BF', fontSize: 13, marginBottom: 2 }}>📍 {b.address_line}</div>
                      <div style={{ color: '#8CA0BF', fontSize: 13 }}>📅 {b.scheduled_date} · {b.scheduled_time?.slice(0,5)}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={b.status} />
                    <div style={{ color: '#00C8FF', fontWeight: 800, fontSize: 18, marginTop: 8 }}>${b.total_price} MXN</div>
                    <div style={{ color: '#8CA0BF', fontSize: 11, marginTop: 2 }}>{b.booking_ref}</div>
                  </div>
                </div>

                {/* Botones de accion */}
                {flow?.next && (
                  <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <button
                      onClick={() => handleStatusChange(b.id, flow.next)}
                      disabled={updating === b.id}
                      style={{
                        flex: 2, padding: '11px', borderRadius: 10, border: 'none', cursor: 'pointer',
                        background: `linear-gradient(135deg, ${flow.color}, ${flow.color}CC)`,
                        color: '#050A14', fontWeight: 700, fontSize: 14,
                        opacity: updating === b.id ? 0.6 : 1,
                      }}>
                      {updating === b.id ? 'Actualizando...' : `${flow.label} → ${flow.nextLabel}`}
                    </button>
                    {b.status === 'pendiente' && (
                      <button
                        onClick={() => handleStatusChange(b.id, 'cancelado')}
                        disabled={updating === b.id}
                        style={{
                          flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
                          border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)',
                          color: '#F87171', fontWeight: 600, fontSize: 13,
                        }}>
                        Cancelar
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
