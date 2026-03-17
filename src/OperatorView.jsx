import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'
import { sendWhatsApp } from './lib/whatsapp'

const STATUS_FLOW = [
  { key: 'confirmado',  label: 'Confirmado', icon: '📋', color: '#6b7280' },
  { key: 'en_camino',   label: 'En camino',  icon: '🚗', color: '#3b82f6' },
  { key: 'en_proceso',  label: 'Lavando',    icon: '🧽', color: '#8b5cf6' },
  { key: 'finalizado',  label: 'Terminado',  icon: '✅', color: '#10b981' },
]

export default function OperatorView() {
  const { user } = useAuth()
  const [bookings, setBookings]           = useState([])
  const [activeBooking, setActiveBooking] = useState(null)
  const [tracking, setTracking]           = useState(false)
  const [loading, setLoading]             = useState(true)
  const [tab, setTab]                     = useState('pending')
  const intervalRef                       = useRef(null)

  useEffect(() => {
    if (user) fetchBookings()
    return () => stopTracking()
  }, [user])

  const fetchBookings = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('operator_id', user.id)
        .order('scheduled_date', { ascending: true })

      if (error) throw error
      setBookings(data || [])

      const active = (data || []).find(b =>
        ['en_camino', 'en_proceso'].includes(b.status)
      )
      if (active) {
        setActiveBooking(active)
        setTracking(true)
        startGPS(active)
      }
    } catch (err) {
      console.error('Error cargando reservaciones:', err)
    } finally {
      setLoading(false)
    }
  }

  const startGPS = (booking) => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await sendLocation(booking.id, pos.coords.latitude, pos.coords.longitude)
    })
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        await sendLocation(booking.id, pos.coords.latitude, pos.coords.longitude)
      }, null, { enableHighAccuracy: true })
    }, 10000)
  }

  const sendLocation = async (bookingId, lat, lng) => {
    await supabase.from('operator_locations').upsert({
      operator_id: user.id,
      booking_id: bookingId,
      lat,
      lng,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'booking_id' })
  }

  const stopTracking = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = null
    setTracking(false)
  }

  const startTracking = async (booking) => {
    if (!navigator.geolocation) {
      alert('Tu dispositivo no soporta GPS.')
      return
    }
    setActiveBooking(booking)
    setTracking(true)
    await updateBookingStatus(booking.id, 'en_camino')
    startGPS(booking)
  }

  const updateBookingStatus = async (bookingId, newStatus) => {
    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', bookingId)

    if (error) { console.error(error); return }

    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, status: newStatus } : b
    ))
    if (activeBooking?.id === bookingId) {
      setActiveBooking(prev => ({ ...prev, status: newStatus }))
    }

    // Notificación WhatsApp al cliente según el nuevo estado
    const booking = bookings.find(b => b.id === bookingId)
    if (booking && ['en_camino', 'en_proceso', 'finalizado'].includes(newStatus)) {
      const { data: clientProfile } = await supabase
        .from('profiles').select('phone').eq('id', booking.client_id).single()
      if (clientProfile?.phone) {
        await sendWhatsApp(newStatus === 'en_camino' ? 'on_the_way' : newStatus === 'en_proceso' ? 'washing' : newStatus === 'finalizado' ? 'done' : newStatus, clientProfile.phone, {
          booking_ref:    booking.booking_ref,
          service_name:   booking.service_name,
          scheduled_date: booking.scheduled_date,
          scheduled_time: booking.scheduled_time,
          total_price:    booking.total_price || booking.service_price,
          operator_name:  'tu operador Maz Clean',
        })
      }
    }

    if (newStatus === 'finalizado') {
      stopTracking()
      setActiveBooking(null)
    }
  }

  const pendingList = bookings.filter(b =>
    b.status === 'confirmado'
  )
  const activeList = bookings.filter(b =>
    ['en_camino', 'en_proceso'].includes(b.status)
  )
  const doneList = bookings.filter(b =>
    b.status === 'finalizado'
  )
  const currentList = tab === 'pending' ? pendingList
                    : tab === 'active'  ? activeList
                    : doneList

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔄</div>
        Cargando tus servicios...
      </div>
    )
  }

  return (
    <div style={styles.container}>

      {activeBooking && tracking && (
        <ActiveTrackingBanner
          booking={activeBooking}
          onStatusChange={(s) => updateBookingStatus(activeBooking.id, s)}
          onStopTracking={stopTracking}
        />
      )}

      <div style={styles.card}>
        <h2 style={styles.title}>📋 Mis Servicios</h2>

        <div style={styles.tabs}>
          {[
            { key: 'pending', label: `Pendientes (${pendingList.length})` },
            { key: 'active',  label: `Activos (${activeList.length})` },
            { key: 'done',    label: `Completados (${doneList.length})` },
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

        {currentList.length === 0 ? (
          <div style={styles.empty}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>
              {tab === 'pending' ? '📭' : tab === 'active' ? '🚗' : '✅'}
            </div>
            {tab === 'pending' ? 'No tienes servicios pendientes' :
             tab === 'active'  ? 'No tienes servicios activos' :
             'No has completado servicios aún'}
          </div>
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

function ActiveTrackingBanner({ booking, onStatusChange, onStopTracking }) {
  const currentStatus = STATUS_FLOW.find(s => s.key === booking.status)
  const currentIdx    = STATUS_FLOW.findIndex(s => s.key === booking.status)
  const nextStatus    = STATUS_FLOW[currentIdx + 1]

  return (
    <div style={styles.banner}>
      <div style={styles.bannerHeader}>
        <div style={styles.liveIndicator}>
          <span style={styles.liveDot} />
          GPS ACTIVO
        </div>
        <span style={{ fontSize: 12, color: '#bfdbfe' }}>Actualizando cada 10 seg</span>
      </div>
      <div style={styles.bannerBody}>
        <div style={{ flex: 1 }}>
          <div style={styles.bannerTitle}>{booking.service_name}</div>
          <div style={styles.bannerAddress}>📍 {booking.address}</div>
          <div style={{ ...styles.statusBadge, background: currentStatus?.color }}>
            {currentStatus?.icon} {currentStatus?.label}
          </div>
        </div>
        <div style={styles.bannerButtons}>
          {nextStatus && (
            <button onClick={() => onStatusChange(nextStatus.key)} style={styles.btnNext}>
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

function BookingCard({ booking, isActive, tracking, onStart, onStatusChange }) {
  const status     = STATUS_FLOW.find(s => s.key === booking.status) || STATUS_FLOW[0]
  const currentIdx = STATUS_FLOW.findIndex(s => s.key === booking.status)
  const nextStatus = STATUS_FLOW[currentIdx + 1]
  const isPending  = booking.status === 'confirmado'

  return (
    <div style={{
      ...styles.bookingCard,
      border: isActive ? '2px solid #3b82f6' : '2px solid #f3f4f6',
    }}>
      <div style={styles.bookingHeader}>
        <div>
          <div style={styles.bookingTitle}>{booking.service_name}</div>
          <div style={styles.bookingMeta}>
            {booking.vehicle_brand} · {booking.vehicle_color} · {booking.vehicle_type}
          </div>
        </div>
        <div style={{
          ...styles.statusPill,
          background: (status.color || '#6b7280') + '20',
          color: status.color || '#6b7280',
        }}>
          {status.icon} {status.label}
        </div>
      </div>

      <div style={styles.bookingInfo}>
        <InfoRow icon="📍" text={booking.address} />
        <InfoRow icon="📅" text={`${booking.scheduled_date} · ${booking.scheduled_time} hrs`} />
        <InfoRow icon="💰" text={`$${booking.service_price} MXN`} />
        {booking.notes && <InfoRow icon="📝" text={booking.notes} />}
      </div>

      <div style={styles.progressBar}>
        {STATUS_FLOW.map((s, i) => (
          <div key={s.key} style={styles.progressStep}>
            <div style={{
              ...styles.progressDot,
              background: i <= currentIdx ? s.color : '#e5e7eb',
            }}>
              {i < currentIdx ? '✓' : s.icon}
            </div>
            <div style={{
              fontSize: 9,
              color: i <= currentIdx ? s.color : '#9ca3af',
              marginTop: 2, textAlign: 'center',
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.bookingActions}>
        {isPending && !tracking && (
          <button onClick={onStart} style={styles.btnStart}>
            🚗 Iniciar viaje + GPS
          </button>
        )}
        {isActive && tracking && nextStatus && nextStatus.key !== 'done' && (
          <button
            onClick={() => onStatusChange(nextStatus.key)}
            style={{ ...styles.btnAction, background: nextStatus.color }}
          >
            {nextStatus.icon} Marcar: {nextStatus.label}
          </button>
        )}
        {isActive && tracking && booking.status === 'en_proceso' && (
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
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={styles.infoText}>{text}</span>
    </div>
  )
}

const styles = {
  container: { minHeight: '100vh', background: '#f3f4f6', padding: 16 },
  loading: {
    minHeight: '60vh', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: '#6b7280', fontSize: 15,
  },
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
  empty: { textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: 14 },
  banner: {
    background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
    borderRadius: 16, padding: 16,
    maxWidth: 640, margin: '0 auto 16px',
  },
  bannerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  liveIndicator: { display: 'flex', alignItems: 'center', gap: 6, color: '#fff', fontWeight: 700, fontSize: 13 },
  liveDot: {
    width: 8, height: 8, borderRadius: '50%',
    background: '#4ade80', boxShadow: '0 0 8px #4ade80', display: 'inline-block',
  },
  bannerBody: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  bannerTitle: { color: '#fff', fontWeight: 700, fontSize: 16, marginBottom: 4 },
  bannerAddress: { color: '#bfdbfe', fontSize: 13, marginBottom: 8 },
  statusBadge: { display: 'inline-block', padding: '4px 10px', borderRadius: 20, color: '#fff', fontSize: 12, fontWeight: 600 },
  bannerButtons: { display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 },
  btnNext: {
    background: '#fff', color: '#1e40af', border: 'none',
    borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700,
  },
  btnStop: {
    background: 'rgba(255,255,255,0.15)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13,
  },
  bookingCard: { borderRadius: 12, padding: 16, marginBottom: 12, transition: 'all 0.2s' },
  bookingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  bookingTitle: { fontWeight: 600, fontSize: 16, color: '#1f2937' },
  bookingMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  statusPill: { padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0 },
  bookingInfo: { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
  infoRow: { display: 'flex', gap: 8, alignItems: 'flex-start' },
  infoText: { fontSize: 13, color: '#374151' },
  progressBar: { display: 'flex', justifyContent: 'space-between', marginBottom: 12, padding: '8px 0' },
  progressStep: { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 },
  progressDot: {
    width: 28, height: 28, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, color: '#fff', fontWeight: 700, marginBottom: 2,
  },
  bookingActions: { display: 'flex', gap: 8 },
  btnStart: {
    flex: 1, background: '#3b82f6', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  btnAction: {
    flex: 1, color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
}
