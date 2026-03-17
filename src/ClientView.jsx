import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'

const GOOGLE_MAPS_API_KEY = 'AIzaSyA0k4Rg_XowxjDGUsLD3BldhpTINFMihjw'

const STATUS_INFO = {
  pendiente:  { label: 'Pendiente',  icon: '⏳', color: '#f59e0b', desc: 'Buscando operador disponible...' },
  confirmado: { label: 'Confirmado', icon: '📋', color: '#3b82f6', desc: 'Operador asignado, en espera de inicio' },
  en_camino:  { label: 'En camino',  icon: '🚗', color: '#6366f1', desc: 'Tu operador está en camino' },
  en_proceso: { label: 'Lavando',    icon: '🧽', color: '#8b5cf6', desc: 'Tu vehículo está siendo lavado' },
  finalizado: { label: 'Completado', icon: '✅', color: '#10b981', desc: '¡Tu vehículo está listo!' },
  cancelado:  { label: 'Cancelado',  icon: '❌', color: '#ef4444', desc: 'Reservación cancelada' },
}

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(window.google.maps); return }
    const existing = document.getElementById('google-maps-script')
    if (existing) { existing.addEventListener('load', () => resolve(window.google.maps)); return }
    const script = document.createElement('script')
    script.id = 'google-maps-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.onload = () => resolve(window.google.maps)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export default function ClientView() {
  const { user } = useAuth()
  const [bookings, setBookings]       = useState([])
  const [activeBooking, setActiveBooking] = useState(null)
  const [tab, setTab]                 = useState('active')
  const [loading, setLoading]         = useState(true)
  const [mapsLoaded, setMapsLoaded]   = useState(false)
  const [eta, setEta]                 = useState(null)

  // ── Calificación ───────────────────────────────────────────────
  const [ratingModal, setRatingModal]       = useState(false)
  const [ratingBooking, setRatingBooking]   = useState(null)
  const [ratingValue, setRatingValue]       = useState(0)
  const [ratingHover, setRatingHover]       = useState(0)
  const [ratingReview, setRatingReview]     = useState('')
  const [savingRating, setSavingRating]     = useState(false)

  useEffect(() => {
    if (user) {
      fetchBookings()
      loadGoogleMapsScript(GOOGLE_MAPS_API_KEY).then(() => setMapsLoaded(true))
    }
  }, [user])

  const fetchBookings = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('client_id', user.id)
      .order('created_at', { ascending: false })
    setBookings(data || [])
    const active = (data || []).find(b => ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status))
    if (active) setActiveBooking(active)
    setLoading(false)
  }

  useEffect(() => {
    if (!activeBooking) return
    const channel = supabase
      .channel(`booking-${activeBooking.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'bookings',
        filter: `id=eq.${activeBooking.id}`,
      }, (payload) => {
        setActiveBooking(payload.new)
        setBookings(prev => prev.map(b => b.id === payload.new.id ? payload.new : b))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [activeBooking?.id])

  // ── Guardar calificación ───────────────────────────────────────
  const saveRating = async () => {
    if (!ratingValue) { alert('Por favor selecciona una calificación.'); return; }
    setSavingRating(true)
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          client_rating: ratingValue,
          client_review: ratingReview || null,
          rated_at:      new Date().toISOString(),
        })
        .eq('id', ratingBooking.id)
      if (error) throw error
      setBookings(prev => prev.map(b =>
        b.id === ratingBooking.id ? { ...b, client_rating: ratingValue, client_review: ratingReview } : b
      ))
      setRatingModal(false)
      setRatingValue(0)
      setRatingReview('')
      setRatingBooking(null)
    } catch (err) {
      alert(`Error: ${err.message}`)
    } finally {
      setSavingRating(false)
    }
  }

  const activeList  = bookings.filter(b => ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status))
  const historyList = bookings.filter(b => ['finalizado','cancelado'].includes(b.status))

  if (loading) return <div style={styles.loading}>Cargando tus reservaciones...</div>

  return (
    <div style={styles.container}>
      {activeBooking && ['en_camino', 'en_proceso'].includes(activeBooking.status) && (
        <TrackingCard booking={activeBooking} mapsLoaded={mapsLoaded} eta={eta} setEta={setEta} />
      )}

      <div style={styles.card}>
        <h2 style={styles.title}>🚗 Mis Reservaciones</h2>
        <div style={styles.tabs}>
          {[
            { key: 'active',  label: `Activas (${activeList.length})` },
            { key: 'history', label: `Historial (${historyList.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ ...styles.tab, ...(tab === t.key ? styles.tabActive : {}) }}>
              {t.label}
            </button>
          ))}
        </div>

        {(tab === 'active' ? activeList : historyList).length === 0 ? (
          <div style={styles.empty}>
            {tab === 'active' ? 'No tienes reservaciones activas' : 'Sin historial aún'}
          </div>
        ) : (
          (tab === 'active' ? activeList : historyList).map(b => (
            <BookingCard key={b.id} booking={b}
              onRate={() => { setRatingBooking(b); setRatingValue(b.client_rating || 0); setRatingReview(b.client_review || ''); setRatingModal(true); }} />
          ))
        )}
      </div>

      {/* ════ MODAL CALIFICACIÓN ════ */}
      {ratingModal && ratingBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxWidth: 420, width: '100%', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>⭐ Calificar Servicio</h3>
              <button onClick={() => setRatingModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bfdbfe', fontSize: 22 }}>×</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ background: '#f9fafb', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 15 }}>{ratingBooking.service_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>📅 {ratingBooking.scheduled_date} · {ratingBooking.scheduled_time}</div>
              </div>

              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>¿Cómo calificarías el servicio?</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                  {[1,2,3,4,5].map(star => (
                    <button key={star}
                      onClick={() => setRatingValue(star)}
                      onMouseEnter={() => setRatingHover(star)}
                      onMouseLeave={() => setRatingHover(0)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 28, transition: 'transform 0.1s', transform: (ratingHover || ratingValue) >= star ? 'scale(1.2)' : 'scale(1)' }}>
                      {(ratingHover || ratingValue) >= star ? '⭐' : '☆'}
                    </button>
                  ))}
                </div>
                {ratingValue > 0 && (
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: '#f59e0b' }}>
                    {['','😞 Muy malo','😕 Malo','😐 Regular','😊 Bueno','🤩 Excelente'][ratingValue]}
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Comentario (opcional)</label>
                <textarea value={ratingReview} onChange={e => setRatingReview(e.target.value)}
                  placeholder="¿Algo que quieras comentar sobre el servicio?"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', height: 80, resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937' }} />
              </div>
            </div>
            <div style={{ padding: '12px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button onClick={() => setRatingModal(false)}
                style={{ flex: 1, padding: '10px 0', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={saveRating} disabled={savingRating || !ratingValue}
                style={{ flex: 2, padding: '10px 0', background: savingRating || !ratingValue ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {savingRating ? '⏳ Guardando...' : '⭐ Enviar Calificación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function TrackingCard({ booking, mapsLoaded, eta, setEta }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const operatorMarkerRef = useRef(null)
  const clientMarkerRef = useRef(null)
  const status = STATUS_INFO[booking.status] || STATUS_INFO.pendiente

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current) return
    const timer = setTimeout(initMap, 100)
    return () => clearTimeout(timer)
  }, [mapsLoaded, booking.id])

  const initMap = () => {
    if (mapInstanceRef.current) return
    const center = { lat: booking.address_lat || 19.4326, lng: booking.address_lng || -99.1332 }
    const map = new window.google.maps.Map(mapRef.current, { center, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false })
    mapInstanceRef.current = map
    if (booking.address_lat && booking.address_lng) {
      clientMarkerRef.current = new window.google.maps.Marker({
        position: { lat: booking.address_lat, lng: booking.address_lng },
        map, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }, title: 'Tu ubicación',
      })
    }
  }

  useEffect(() => {
    if (!booking.id) return
    const channel = supabase
      .channel(`operator-location-${booking.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operator_locations', filter: `booking_id=eq.${booking.id}` },
        (payload) => {
          const { lat, lng } = payload.new
          updateOperatorMarker(lat, lng)
          if (booking.address_lat && booking.address_lng) calculateETA(lat, lng, booking.address_lat, booking.address_lng)
        })
      .subscribe()
    loadLastLocation()
    return () => supabase.removeChannel(channel)
  }, [booking.id, mapsLoaded])

  const loadLastLocation = async () => {
    const { data } = await supabase.from('operator_locations').select('*').eq('booking_id', booking.id).single()
    if (data && mapsLoaded) {
      updateOperatorMarker(data.lat, data.lng)
      if (booking.address_lat && booking.address_lng) calculateETA(data.lat, data.lng, booking.address_lat, booking.address_lng)
    }
  }

  const updateOperatorMarker = (lat, lng) => {
    if (!mapInstanceRef.current) return
    const pos = { lat, lng }
    if (operatorMarkerRef.current) {
      operatorMarkerRef.current.setPosition(pos)
    } else {
      operatorMarkerRef.current = new window.google.maps.Marker({
        position: pos, map: mapInstanceRef.current,
        icon: { url: 'https://maps.google.com/mapfiles/ms/icons/cabs.png' },
        title: 'Tu operador', animation: window.google.maps.Animation.BOUNCE,
      })
      setTimeout(() => operatorMarkerRef.current?.setAnimation(null), 2000)
    }
    if (clientMarkerRef.current) {
      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(pos)
      bounds.extend(clientMarkerRef.current.getPosition())
      mapInstanceRef.current.fitBounds(bounds, { padding: 60 })
    } else {
      mapInstanceRef.current.setCenter(pos)
      mapInstanceRef.current.setZoom(15)
    }
  }

  const calculateETA = (fromLat, fromLng, toLat, toLng) => {
    if (!window.google) return
    new window.google.maps.DistanceMatrixService().getDistanceMatrix({
      origins: [{ lat: fromLat, lng: fromLng }],
      destinations: [{ lat: toLat, lng: toLng }],
      travelMode: window.google.maps.TravelMode.DRIVING,
    }, (response, status) => {
      if (status === 'OK' && response.rows[0]?.elements[0]?.status === 'OK') {
        setEta(response.rows[0].elements[0].duration.text)
      }
    })
  }

  return (
    <div style={styles.trackingCard}>
      <div style={styles.trackingHeader}>
        <div style={styles.liveChip}><span style={styles.liveDot} />EN VIVO</div>
        <div style={{ color: '#bfdbfe', fontSize: 13 }}>{booking.service_name}</div>
      </div>
      <div style={styles.statusRow}>
        <span style={{ fontSize: 32 }}>{status.icon}</span>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{status.label}</div>
          <div style={{ color: '#bfdbfe', fontSize: 13 }}>{status.desc}</div>
        </div>
        {eta && booking.status === 'en_camino' && (
          <div style={styles.etaChip}>
            <div style={{ fontSize: 11, color: '#93c5fd' }}>LLEGA EN</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{eta}</div>
          </div>
        )}
      </div>
      {!mapsLoaded ? <div style={styles.mapPlaceholder}>Cargando mapa...</div> : <div ref={mapRef} style={styles.trackingMap} />}
      <div style={styles.trackingFooter}>
        <span style={{ fontSize: 12, color: '#93c5fd' }}>🔵 Tu ubicación &nbsp;&nbsp; 🚕 Operador</span>
        <span style={{ fontSize: 11, color: '#60a5fa' }}>Actualización automática</span>
      </div>
    </div>
  )
}

function BookingCard({ booking, onRate }) {
  const status = STATUS_INFO[booking.status] || STATUS_INFO.pendiente
  const canRate = booking.status === 'finalizado' && !booking.client_rating
  const hasRated = booking.status === 'finalizado' && booking.client_rating

  return (
    <div style={styles.bookingCard}>
      <div style={styles.bookingHeader}>
        <div>
          <div style={styles.bookingTitle}>{booking.service_name}</div>
          <div style={styles.bookingMeta}>{booking.vehicle_brand} · {booking.vehicle_color}</div>
        </div>
        <div style={{ ...styles.statusPill, background: status.color + '20', color: status.color }}>
          {status.icon} {status.label}
        </div>
      </div>
      <div style={styles.bookingInfo}>
        <span>📍 {booking.address_line}</span>
        <span>📅 {booking.scheduled_date} · {booking.scheduled_time} hrs</span>
        <span>💰 ${booking.total_price || booking.service_price} MXN</span>
      </div>

      {/* Calificación */}
      {hasRated && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>{'⭐'.repeat(booking.client_rating)}</span>
          {booking.client_review && <span style={{ fontSize: 12, color: '#854d0e' }}>{booking.client_review}</span>}
        </div>
      )}
      {canRate && (
        <button onClick={onRate}
          style={{ marginTop: 10, width: '100%', padding: '9px 0', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8, color: '#1e40af', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ⭐ Calificar este servicio
        </button>
      )}
    </div>
  )
}

const styles = {
  container: { minHeight: '100vh', background: '#f3f4f6', padding: 16 },
  loading: { padding: 40, textAlign: 'center', color: '#6b7280' },
  card: { background: '#fff', borderRadius: 16, padding: 20, maxWidth: 640, margin: '0 auto', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  title: { fontSize: 20, fontWeight: 700, color: '#1f2937', margin: '0 0 16px' },
  tabs: { display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #f3f4f6', paddingBottom: 8 },
  tab: { padding: '6px 16px', borderRadius: 20, border: 'none', background: '#f3f4f6', color: '#6b7280', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  tabActive: { background: '#eff6ff', color: '#3b82f6', fontWeight: 600 },
  empty: { textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 14 },
  trackingCard: { background: 'linear-gradient(135deg, #1e3a8a, #1e40af)', borderRadius: 16, padding: 16, maxWidth: 640, margin: '0 auto 16px', overflow: 'hidden' },
  trackingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  liveChip: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 12px', color: '#fff', fontWeight: 700, fontSize: 12 },
  liveDot: { width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80', display: 'inline-block' },
  statusRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  etaChip: { marginLeft: 'auto', background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' },
  trackingMap: { width: '100%', height: 240, borderRadius: 12, border: '2px solid rgba(255,255,255,0.2)', marginBottom: 10 },
  mapPlaceholder: { width: '100%', height: 240, borderRadius: 12, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93c5fd', fontSize: 14, marginBottom: 10 },
  trackingFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  bookingCard: { border: '2px solid #f3f4f6', borderRadius: 12, padding: 14, marginBottom: 10 },
  bookingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  bookingTitle: { fontWeight: 600, fontSize: 15, color: '#1f2937' },
  bookingMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  statusPill: { padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0 },
  bookingInfo: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#374151' },
}
