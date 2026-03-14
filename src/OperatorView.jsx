import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'

const STATUS_FLOW = [
  { key: 'assigned',  label: 'Asignado',    icon: '📋', color: '#6b7280' },
  { key: 'on_the_way', label: 'En camino',  icon: '🚗', color: '#3b82f6' },
  { key: 'arrived',   label: 'Llegué',      icon: '📍', color: '#f59e0b' },
  { key: 'washing',   label: 'Lavando',     icon: '🧽', color: '#8b5cf6' },
  { key: 'done',      label: 'Terminado',   icon: '✅', color: '#10b981' },
]

export default function OperatorView() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState([])
  const [activeBooking, setActiveBooking] = useState(null)
  const [tracking, setTracking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending') // pending | active | done
  const watchIdRef = useRef(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (user) fetchBookings()
    return () => stopTracking()
  }, [user])

  const fetchBookings = async () => {
    setLoading(true)
    try {
      // Buscar el operador por user_id
      const { data: opData } = await supabase
        .from('operators')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!opData) { setLoading(false); return }

      const { data } = await supabase
        .from('bookings')
        .select('*')
        .eq('operator_id', opData.id)
        .order('scheduled_date', { ascending: true })

      setBookings(data || [])

      // Si hay uno activo, restaurarlo
      const active = (data || []).find(b =>
        ['on_the_way', 'arrived', 'washing'].includes(b.status)
      )
      if (active) setActiveBooking(active)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // ── GPS tracking ────────────────────────────────────────────────────
  const startTracking = async (booking) => {
    if (!navigator.geolocation) {
      alert('Tu dispositivo no soporta GPS.')
      return
    }

    setActiveBooking(booking)
    setTracking(true)

    // Actualizar estado a "en camino"
    await updateBookingStatus(booking.id, 'on_the_way')

    // Enviar ubicación cada 10 segundos
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          await supabase.from('operator_locations').upsert({
            operator_id: user.id,
            booking_id: booking.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'booking_id' })
        },
        (err) => console.error('GPS error:', err),
        { enableHighAccuracy: true }
      )
    }, 10000)

    // Primera ubicación inmediata
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await supabase.from('operator_locations').upsert({
        operator_id: user.id,
        booking_id: booking.id,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'booking_id' })
    })
  }

  const stopTracking = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current)
    setTracking(false)
  }

  const updateBookingStatus = async (bookingId, newStatus) => {
    await supabase
      .from('bookings')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', bookingId)

    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, status: newStatus } : b
    ))
    if (activeBooking?.id === bookingId) {
      setActiveBooking(prev => ({ ...prev, status: newStatus }))
    }

    if (newStatus === 'done') {
      stopTracking()
      setActiveBooking(null)
    }
  }

  // ── Filtros ──────────────────────────────────────────────────────────
  const pendingBookings = bookings.filter(b => b.status === 'assigned' || b.status === 'pending')
  const activeBookings  = bookings.filter(b => ['on_the_way','arrived','washing'].includes(b.status))
  const doneBookings    = bookings.filter(b => b.status === 'done')

  const currentList = tab === 'pending' ? pendingBookings
                    : tab === 'active'  ? activeBookings
                    : doneBookings

  if (loading) return <div style={styles.loading}>Cargando servicios...</div>

  return (
    <div style={styles.container}>
      {/* Panel de tracking activo */}
      {activeBooking && tracking && (
        <ActiveTrackingBanner
          booking={activeBooking}
          onStatusChange={(s) => updateBookingStatus(activeBooking.id, s)}
          onStopTracking={stopTracking}
        />
      )}

      <div style={styles.card}>
        <h2 style={styles.title}>📋 Mis Servicios</h2>

        {/* Tabs */}
        <div style={styles.tabs}>
          {[
            { key: 'pending', label: `Pendientes (${pendingBookings.length})` },
            { key: 'active',  label: `Activos (${activeBookings.length})` },
            { key: 'done',    label: `Completados (${doneBookings.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{ ...styles.tab, ...(tab === t.key ? styles.tabActive : {}) }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {currentList.length === 0 ? (
          <div style={styles.empty}>No hay servicios en esta sección</div>
        ) : (
          currentList.map(booking => (
            <BookingCard
              key={booking.id}
              booking={booking}
              isActive={activeBooking?.id === booking.id}
              tracking={tracking && activeBooking?.id === booking.id}
              onStart={() => startTracking(booking)}
              onStatusChange={(s) => updateBookingStatus(booking.id, s)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Banner de tracking activo ────────────────────────────────────────
function ActiveTrackingBanner({ booking, onStatusChange, onStopTracking }) {
  const currentStatus = STATUS_FLOW.find(s => s.key === booking.status)
  const currentIdx = STATUS_FLOW.findIndex(s => s.key === booking.status)
  const nextStatus = STATUS_FLOW[currentIdx + 1]

  return (
    <div style={styles.banner}>
      <div style={styles.bannerHeader}>
        <div style={styles.liveIndicator}>
          <span style={styles.liveDot} />
          GPS ACTIVO
        </div>
        <span style={{ fontSize: 13, color: '#bfdbfe' }}>
          Actualizando cada 10 seg
        </span>
      </div>
      <div style={styles.bannerBody}>
        <div>
          <div style={styles.bannerTitle}>{booking.service_name}</div>
          <div style={styles.bannerAddress}>📍 {booking.address}</div>
          <div style={{ ...styles.statusBadge, background: currentStatus?.color }}>
            {currentStatus?.icon} {currentStatus?.label}
          </div>
        </div>
        <div style={styles.bannerButtons}>
          {nextStatus && (
            <button
              onClick={() => onStatusChange(nextStatus.key)}
              style={styles.btnNext}
            >
              {nextStatus.icon} {nextStatus.label}
            </button>
          )}
          <button onClick={onStopTracking} style={styles.btnStop}>
            ⏹ Pausar GPS
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta de reservación ───────────────────────────────────────────
function BookingCard({ booking, isActive, tracking, onStart, onStatusChange }) {
  const status = STATUS_FLOW.find(s => s.key === booking.status) || STATUS_FLOW[0]
  const currentIdx = STATUS_FLOW.findIndex(s => s.key === booking.status)
  const nextStatus = STATUS_FLOW[currentIdx + 1]

  return (
    <div style={{ ...styles.bookingCard, border: isActive ? '2px solid #3b82f6' : '2px solid #f3f4f6' }}>
      <div style={styles.bookingHeader}>
        <div>
          <div style={styles.bookingTitle}>{booking.service_name}</div>
          <div style={styles.bookingMeta}>
            {booking.vehicle_brand} · {booking.vehicle_color} · {booking.vehicle_type}
          </div>
        </div>
        <div style={{ ...styles.statusPill, background: status.color + '20', color: status.color }}>
          {status.icon} {status.label}
        </div>
      </div>

      <div style={styles.bookingInfo}>
        <InfoRow icon="📍" text={booking.address} />
        <InfoRow icon="📅" text={`${booking.scheduled_date} · ${booking.scheduled_time} hrs`} />
        <InfoRow icon="💰" text={`$${booking.service_price} MXN`} />
        {booking.notes && <InfoRow icon="📝" text={booking.notes} />}
      </div>

      {/* Barra de progreso */}
      <div style={styles.progressBar}>
        {STATUS_FLOW.map((s, i) => (
          <div key={s.key} style={styles.progressStep}>
            <div style={{
              ...styles.progressDot,
              background: i <= currentIdx ? s.color : '#e5e7eb',
            }}>
              {i < currentIdx ? '✓' : s.icon}
            </div>
            <div style={{ fontSize: 9, color: i <= currentIdx ? s.color : '#9ca3af', marginTop: 2 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div style={styles.bookingActions}>
        {booking.status === 'assigned' && !tracking && (
          <button onClick={onStart} style={styles.btnStart}>
            🚗 Iniciar viaje + GPS
          </button>
        )}
        {isActive && tracking && nextStatus && nextStatus.key !== 'done' && (
          <button
            onClick={() => onStatusChange(nextStatus.key)}
            style={{ ...styles.btnAction, background: nextStatus.color }}
          >
            {nextStatus.icon} Marcar como: {nextStatus.label}
          </button>
        )}
        {isActive && tracking && booking.status === 'washing' && (
          <button
            onClick={() => onStatusChange('done')}
            style={{ ...styles.btnAction, background: '#10b981' }}
          >
            ✅ Servicio completado
          </button>
        )}
      </div>
    </div>
  )
}

function InfoRow({ icon, text }) {
  return (
    <div style={styles.infoRow}>
      <span>{icon}</span>
      <span style={styles.infoText}>{text}</span>
    </div>
  )
}

const styles = {
  container: { minHeight: '100vh', background: '#f3f4f6', padding: '16px' },
  loading: { padding: 40, textAlign: 'center', color: '#6b7280' },
  card: {
    background: '#fff', borderRadius: 16, padding: 20,
    maxWidth: 640, margin: '0 auto',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  title: { fontSize: 20, fontWeight: 700, color: '#1f2937', margin: '0 0 16px' },
  tabs: { display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #f3f4f6', paddingBottom: 8 },
  tab: {
    padding: '6px 14px', borderRadius: 20, border: 'none',
    background: '#f3f4f6', color: '#6b7280', cursor: 'pointer',
    fontSize: 13, fontWeight: 500,
  },
  tabActive: { background: '#eff6ff', color: '#3b82f6', fontWeight: 600 },
  empty: { textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 14 },

  // Banner
  banner: {
    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
    borderRadius: 16, padding: 16, marginBottom: 16,
    maxWidth: 640, margin: '0 auto 16px',
  },
  bannerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  liveIndicator: { display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontWeight: 700, fontSize: 13 },
  liveDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#4ade80',
    boxShadow: '0 0 8px #4ade80', animation: 'pulse 1.5s infinite',
  },
  bannerBody: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  bannerTitle: { color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 },
  bannerAddress: { color: '#bfdbfe', fontSize: 13, marginBottom: 8 },
  statusBadge: {
    display: 'inline-block', padding: '4px 10px', borderRadius: 20,
    color: '#fff', fontSize: 12, fontWeight: 600,
  },
  bannerButtons: { display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 },
  btnNext: {
    background: '#fff', color: '#1e40af', border: 'none',
    borderRadius: 8, padding: '8px 14px', cursor: 'pointer',
    fontSize: 13, fontWeight: 700,
  },
  btnStop: {
    background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13,
  },

  // Booking card
  bookingCard: {
    borderRadius: 12, padding: 16, marginBottom: 12,
    transition: 'all 0.2s',
  },
  bookingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  bookingTitle: { fontWeight: 600, fontSize: 16, color: '#1f2937' },
  bookingMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  statusPill: { padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0 },
  bookingInfo: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
  infoRow: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  infoText: { fontSize: 13, color: '#374151' },

  // Progress
  progressBar: { display: 'flex', justifyContent: 'space-between', marginBottom: 12, padding: '8px 0' },
  progressStep: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 },
  progressDot: {
    width: 28, height: 28, borderRadius: '50%', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontSize: 12,
    color: '#fff', fontWeight: 700, marginBottom: 2,
  },

  // Buttons
  bookingActions: { display: 'flex', gap: 8 },
  btnStart: {
    flex: 1, background: '#3b82f6', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 16px', cursor: 'pointer',
    fontSize: 14, fontWeight: 600,
  },
  btnAction: {
    flex: 1, color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 16px', cursor: 'pointer',
    fontSize: 14, fontWeight: 600,
  },
}
