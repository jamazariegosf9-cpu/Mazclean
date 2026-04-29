import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'
import RatingSlider from './RatingSlider'

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
  const [bookings, setBookings]           = useState([])
  const [activeBooking, setActiveBooking] = useState(null)
  const [tab, setTab]                     = useState('active')
  const [loading, setLoading]             = useState(false)
  const [fetchError, setFetchError]       = useState('')
  const [mapsLoaded, setMapsLoaded]       = useState(false)
  const [eta, setEta]                     = useState(null)
  const fetchingRef                       = useRef(false)
  const bookingsCache                     = useRef([])

  // ── Calificación ───────────────────────────────────────────────
  const [ratingModal, setRatingModal]     = useState(false)
  const [ratingBooking, setRatingBooking] = useState(null)
  const [ratingValue, setRatingValue]     = useState(0)
  const [ratingReview, setRatingReview]   = useState('')
  const [savingRating, setSavingRating]   = useState(false)

  // ── Membresía ───────────────────────────────────────────────────
  const [membershipConfig, setMembershipConfig] = useState(null)
  const [clientProfile, setClientProfile]       = useState(null)

  useEffect(() => {
    if (user) {
      fetchBookings()
      loadGoogleMapsScript(GOOGLE_MAPS_API_KEY).then(() => setMapsLoaded(true))
      fetchMembershipData()
    }
  }, [user])

  const fetchMembershipData = async () => {
    try {
      const [{ data: cfg }, { data: prof }] = await Promise.all([
        supabase.from('membership_config').select('*').single(),
        supabase.from('profiles').select('membership_status,membership_type,membership_end_at').eq('id', user.id).single(),
      ])
      setMembershipConfig(cfg)
      setClientProfile(prof)
    } catch (err) { console.error('fetchMembershipData:', err) }
  }

  const fetchBookings = async (silent = false) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    if (!silent) setLoading(true)
    setFetchError('')

    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      fetchingRef.current = false
      setLoading(false)
      if (bookingsCache.current.length > 0) {
        setBookings(bookingsCache.current)
        const active = bookingsCache.current.find(b =>
          ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status)
        )
        if (active) setActiveBooking(active)
        setFetchError('Sin conexión — mostrando datos anteriores.')
      } else {
        setFetchError('Sin conexión. Verifica tu red e intenta de nuevo.')
      }
    }, 8000)

    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
      clearTimeout(timeoutId)
      if (timedOut) return
      if (error) throw error
      const result = data || []
      bookingsCache.current = result
      setBookings(result)
      const active = result.find(b =>
        ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status)
      )
      if (active) setActiveBooking(active)
      setFetchError('')
    } catch (err) {
      clearTimeout(timeoutId)
      if (timedOut) return
      if (bookingsCache.current.length > 0) {
        setBookings(bookingsCache.current)
        const active = bookingsCache.current.find(b =>
          ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status)
        )
        if (active) setActiveBooking(active)
        setFetchError('Error de red — mostrando datos anteriores.')
      } else {
        setFetchError('No se pudieron cargar las reservaciones. Verifica tu conexión.')
      }
    } finally {
      if (!timedOut) {
        fetchingRef.current = false
        setLoading(false)
      }
    }
  }

  // ── Realtime: detectar cambio a 'finalizado' y abrir modal ────
  useEffect(() => {
    if (!activeBooking) return

    const channel = supabase
      .channel(`booking-${activeBooking.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'bookings',
        filter: `id=eq.${activeBooking.id}`,
      }, (payload) => {
        const updated = payload.new

        // Actualizar estado local
        setActiveBooking(updated)
        setBookings(prev => prev.map(b => b.id === updated.id ? updated : b))
        bookingsCache.current = bookingsCache.current.map(b =>
          b.id === updated.id ? updated : b
        )

        // ── NUEVO: si acaba de pasar a 'finalizado' y no tiene calificación,
        //    abrir el modal de calificación automáticamente
        if (
          updated.status === 'finalizado' &&
          !updated.client_rating &&
          activeBooking.status !== 'finalizado' // evitar re-abrir si ya estaba finalizado
        ) {
          // Pequeño delay para que el cliente vea el cambio de estado antes del modal
          setTimeout(() => {
            setRatingBooking(updated)
            setRatingValue(0)
            setRatingReview('')
            setRatingModal(true)
            setTab('history') // cambiar al tab de historial donde verá la card
          }, 1200)
        }

        // Si el servicio ya no está activo, limpiar activeBooking
        if (['finalizado', 'cancelado'].includes(updated.status)) {
          setActiveBooking(null)
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [activeBooking?.id, activeBooking?.status])

  // ── Guardar calificación ───────────────────────────────────────
  const saveRating = async () => {
    if (!ratingValue) { alert('Por favor selecciona una calificación.'); return }
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

      // Actualizar lista local
      setBookings(prev => prev.map(b =>
        b.id === ratingBooking.id
          ? { ...b, client_rating: ratingValue, client_review: ratingReview }
          : b
      ))
      bookingsCache.current = bookingsCache.current.map(b =>
        b.id === ratingBooking.id
          ? { ...b, client_rating: ratingValue, client_review: ratingReview }
          : b
      )

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

  // Cerrar modal sin calificar — el cliente podrá calificar desde la card
  const dismissRatingModal = () => {
    setRatingModal(false)
    setRatingValue(0)
    setRatingReview('')
    // NO limpiamos ratingBooking para que el botón en la card siga disponible
  }

  const activeList  = bookings.filter(b => ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status))
  const historyList = bookings.filter(b => ['finalizado','cancelado'].includes(b.status))

  if (!user) return null

  return (
    <div style={styles.container}>
      {activeBooking && ['en_camino', 'en_proceso'].includes(activeBooking.status) && (
        <TrackingCard booking={activeBooking} mapsLoaded={mapsLoaded} eta={eta} setEta={setEta} />
      )}

      <div style={styles.card}>

        {/* ── Membresía Premium (visible solo si client_enabled = true) ── */}
        {membershipConfig?.client_enabled && (
          <div style={{ marginBottom: 20, borderRadius: 14, overflow: 'hidden', border: '1.5px solid #e9d5ff' }}>
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>⭐ Membresía Premium</div>
                <div style={{ color: '#ede9fe', fontSize: 12, marginTop: 2 }}>
                  ${membershipConfig.client_price} MXN / {membershipConfig.client_duration_days} días
                </div>
              </div>
              {clientProfile?.membership_status === 'activa'
                ? <span style={{ background: 'rgba(16,185,129,0.25)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: 20, padding: '4px 12px', color: '#6ee7b7', fontSize: 12, fontWeight: 700 }}>✅ Activa</span>
                : <span style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '4px 12px', color: '#ede9fe', fontSize: 12, fontWeight: 700 }}>○ Inactiva</span>
              }
            </div>
            <div style={{ background: '#faf5ff', padding: '12px 16px' }}>
              {clientProfile?.membership_status === 'activa' ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: 13, color: '#6b21a8', fontWeight: 600 }}>
                    💳 Tu membresía está activa
                    {clientProfile.membership_end_at && (
                      <span style={{ fontWeight: 400, color: '#7c3aed', marginLeft: 6 }}>
                        — vence el {new Date(clientProfile.membership_end_at).toLocaleDateString('es-MX')}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10, lineHeight: 1.6 }}>
                    ⭐ Prioridad en asignación · 📅 Horarios reservados · 🎯 Operador preferente · ❌ Cancelación flexible
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>
                    Próximamente disponible el pago en línea.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <h2 style={styles.title}>🚗 Mis Reservaciones</h2>

        {fetchError && (
          <div style={{ background: '#fef9c3', border: '1.5px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#854d0e', fontWeight: 600 }}>⚠️ {fetchError}</span>
            <button onClick={() => fetchBookings()} style={{ padding: '7px 14px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              🔄 Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div style={styles.loading}>Cargando tus reservaciones...</div>
        ) : (
          <>
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
                  onRate={() => {
                    setRatingBooking(b)
                    setRatingValue(b.client_rating || 0)
                    setRatingReview(b.client_review || '')
                    setRatingModal(true)
                  }} />
              ))
            )}
          </>
        )}
      </div>

      {/* ════ MODAL CALIFICACIÓN ════ */}
      {ratingModal && ratingBooking && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 110,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          // Animación de entrada suave
          animation: 'fadeIn 0.25s ease',
        }}>
          <div style={{
            background: '#fff', borderRadius: 20,
            boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
            maxWidth: 420, width: '100%',
            overflow: 'hidden',
            animation: 'slideUp 0.3s ease',
          }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 18, margin: '0 0 4px' }}>
                    ✅ ¡Servicio completado!
                  </h3>
                  <p style={{ color: '#bfdbfe', fontSize: 13, margin: 0 }}>
                    ¿Cómo estuvo tu experiencia?
                  </p>
                </div>
                <button onClick={dismissRatingModal}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18, borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  ×
                </button>
              </div>
            </div>

            {/* Cuerpo */}
            <div style={{ padding: '20px 24px' }}>
              {/* Info del servicio */}
              <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '12px 16px', marginBottom: 20, border: '1px solid #bbf7d0' }}>
                <div style={{ fontWeight: 700, color: '#065f46', fontSize: 15 }}>
                  {ratingBooking.service_name}
                </div>
                <div style={{ fontSize: 12, color: '#059669', marginTop: 3 }}>
                  {ratingBooking.vehicle_brand} · {ratingBooking.vehicle_color} · {ratingBooking.scheduled_date}
                </div>
              </div>

              {/* Slider de calificación */}
              <RatingSlider
                initialValue={ratingValue}
                onRatingChange={(val) => setRatingValue(val)}
              />

              {/* Comentario */}
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Comentario <span style={{ fontWeight: 400, color: '#9ca3af' }}>(opcional)</span>
                </label>
                <textarea
                  value={ratingReview}
                  onChange={e => setRatingReview(e.target.value)}
                  placeholder="¿Algo que quieras comentar sobre el servicio?"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', height: 76, resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937' }}
                />
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 10 }}>
              <button onClick={dismissRatingModal}
                style={{ flex: 1, padding: '12px 0', background: '#f3f4f6', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>
                Después
              </button>
              <button onClick={saveRating} disabled={savingRating || !ratingValue}
                style={{ flex: 2, padding: '12px 0', background: savingRating || !ratingValue ? '#9ca3af' : 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: savingRating || !ratingValue ? 'not-allowed' : 'pointer', minHeight: 48 }}>
                {savingRating ? '⏳ Guardando...' : '⭐ Enviar calificación'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(24px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── TrackingCard ───────────────────────────────────────────────────
function TrackingCard({ booking, mapsLoaded, eta, setEta }) {
  const mapRef            = useRef(null)
  const mapInstanceRef    = useRef(null)
  const operatorMarkerRef = useRef(null)
  const clientMarkerRef   = useRef(null)
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
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'operator_locations',
        filter: `booking_id=eq.${booking.id}`,
      }, (payload) => {
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
      origins:      [{ lat: fromLat, lng: fromLng }],
      destinations: [{ lat: toLat, lng: toLng }],
      travelMode:   window.google.maps.TravelMode.DRIVING,
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
      {!mapsLoaded
        ? <div style={styles.mapPlaceholder}>Cargando mapa...</div>
        : <div ref={mapRef} style={styles.trackingMap} />
      }
      <div style={styles.trackingFooter}>
        <span style={{ fontSize: 12, color: '#93c5fd' }}>🔵 Tu ubicación &nbsp;&nbsp; 🚕 Operador</span>
        <span style={{ fontSize: 11, color: '#60a5fa' }}>Actualización automática</span>
      </div>
    </div>
  )
}

// ── BookingCard ────────────────────────────────────────────────────
function BookingCard({ booking, onRate }) {
  const status  = STATUS_INFO[booking.status] || STATUS_INFO.pendiente
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
        <span>📅 {booking.scheduled_date} · {booking.scheduled_time_from?.slice(0,5) ?? booking.scheduled_time} hrs</span>
        <span>💰 ${booking.total_price || booking.service_price} MXN</span>
      </div>
      {hasRated && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>{'⭐'.repeat(booking.client_rating)}</span>
          {booking.client_review && <span style={{ fontSize: 12, color: '#854d0e' }}>{booking.client_review}</span>}
        </div>
      )}
      {canRate && (
        <button onClick={onRate}
          style={{ marginTop: 10, width: '100%', padding: '11px 0', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1.5px solid #bfdbfe', borderRadius: 8, color: '#1e40af', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          ⭐ Calificar este servicio
        </button>
      )}
    </div>
  )
}

const styles = {
  container:      { minHeight: '100vh', background: '#f3f4f6', padding: 16 },
  loading:        { padding: 40, textAlign: 'center', color: '#6b7280' },
  card:           { background: '#fff', borderRadius: 16, padding: 20, maxWidth: 640, margin: '0 auto', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  title:          { fontSize: 20, fontWeight: 700, color: '#1f2937', margin: '0 0 16px' },
  tabs:           { display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #f3f4f6', paddingBottom: 8 },
  tab:            { padding: '6px 16px', borderRadius: 20, border: 'none', background: '#f3f4f6', color: '#6b7280', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  tabActive:      { background: '#eff6ff', color: '#3b82f6', fontWeight: 600 },
  empty:          { textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 14 },
  trackingCard:   { background: 'linear-gradient(135deg, #1e3a8a, #1e40af)', borderRadius: 16, padding: 16, maxWidth: 640, margin: '0 auto 16px', overflow: 'hidden' },
  trackingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  liveChip:       { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 12px', color: '#fff', fontWeight: 700, fontSize: 12 },
  liveDot:        { width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80', display: 'inline-block' },
  statusRow:      { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  etaChip:        { marginLeft: 'auto', background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' },
  trackingMap:    { width: '100%', height: 240, borderRadius: 12, border: '2px solid rgba(255,255,255,0.2)', marginBottom: 10 },
  mapPlaceholder: { width: '100%', height: 240, borderRadius: 12, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93c5fd', fontSize: 14, marginBottom: 10 },
  trackingFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  bookingCard:    { border: '2px solid #f3f4f6', borderRadius: 12, padding: 14, marginBottom: 10 },
  bookingHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  bookingTitle:   { fontWeight: 600, fontSize: 15, color: '#1f2937' },
  bookingMeta:    { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  statusPill:     { padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0 },
  bookingInfo:    { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#374151' },
}
