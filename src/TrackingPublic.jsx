import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'

const GOOGLE_MAPS_API_KEY = 'AIzaSyA0k4Rg_XowxjDGUsLD3BldhpTINFMihjw'

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

const STATUS_INFO = {
  en_camino:  { label: 'Tu operador va en camino', icon: '🚗', color: '#6366f1', desc: 'Sigue su ubicación en tiempo real' },
  en_proceso: { label: 'Lavando tu vehículo',      icon: '🧽', color: '#f97316', desc: 'Tu auto está siendo lavado' },
  finalizado: { label: '¡Tu auto está listo!',     icon: '✅', color: '#10b981', desc: 'Servicio completado' },
  confirmado: { label: 'Operador asignado',         icon: '📋', color: '#3b82f6', desc: 'En espera de inicio' },
}

export default function TrackingPublic({ bookingId }) {
  const [booking, setBooking]     = useState(null)
  const [loading, setLoading]     = useState(true)
  const [mapsLoaded, setMapsLoaded] = useState(false)
  const [eta, setEta]             = useState(null)
  const [notFound, setNotFound]   = useState(false)

  const mapRef            = useRef(null)
  const mapInstanceRef    = useRef(null)
  const operatorMarkerRef = useRef(null)
  const clientMarkerRef   = useRef(null)

  useEffect(() => {
    if (!bookingId) { setNotFound(true); setLoading(false); return }
    fetchBooking()
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY).then(() => setMapsLoaded(true))
  }, [bookingId])

  const fetchBooking = async () => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, booking_ref, service_name, status, address_lat, address_lng, address_line, scheduled_time, scheduled_date')
      .eq('id', bookingId)
      .single()
    if (error || !data) { setNotFound(true); setLoading(false); return }
    setBooking(data)
    setLoading(false)
  }

  // Realtime: escuchar cambios de status
  useEffect(() => {
    if (!bookingId) return
    const channel = supabase
      .channel(`public-tracking-${bookingId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'bookings',
        filter: `id=eq.${bookingId}`,
      }, (payload) => setBooking(prev => ({ ...prev, ...payload.new })))
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [bookingId])

  // Inicializar mapa
  useEffect(() => {
    if (!mapsLoaded || !mapRef.current || !booking) return
    const timer = setTimeout(initMap, 200)
    return () => clearTimeout(timer)
  }, [mapsLoaded, booking])

  const initMap = () => {
    if (mapInstanceRef.current) return
    const center = { lat: booking.address_lat || 19.4326, lng: booking.address_lng || -99.1332 }
    const map = new window.google.maps.Map(mapRef.current, {
      center, zoom: 14,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }]
    })
    mapInstanceRef.current = map
    if (booking.address_lat && booking.address_lng) {
      clientMarkerRef.current = new window.google.maps.Marker({
        position: center, map,
        icon: { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' },
        title: 'Tu ubicación',
      })
    }
  }

  // Realtime ubicación del operador
  useEffect(() => {
    if (!bookingId) return
    const channel = supabase
      .channel(`public-operator-location-${bookingId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'operator_locations',
        filter: `booking_id=eq.${bookingId}`,
      }, (payload) => {
        updateOperatorMarker(payload.new.lat, payload.new.lng)
        if (booking?.address_lat && booking?.address_lng) {
          calculateETA(payload.new.lat, payload.new.lng, booking.address_lat, booking.address_lng)
        }
      })
      .subscribe()
    loadLastLocation()
    return () => supabase.removeChannel(channel)
  }, [bookingId, mapsLoaded, booking])

  const loadLastLocation = async () => {
    const { data } = await supabase
      .from('operator_locations')
      .select('*')
      .eq('booking_id', bookingId)
      .single()
    if (data && mapsLoaded) {
      updateOperatorMarker(data.lat, data.lng)
      if (booking?.address_lat && booking?.address_lng) {
        calculateETA(data.lat, data.lng, booking.address_lat, booking.address_lng)
      }
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
        title: 'Tu operador',
        animation: window.google.maps.Animation.BOUNCE,
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

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <p style={{ color: '#6b7280', fontSize: 15 }}>Cargando tu seguimiento...</p>
        </div>
      </div>
    )
  }

  if (notFound || !booking) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingCard}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>😔</div>
          <p style={{ color: '#6b7280', fontSize: 15 }}>No se encontró este servicio.</p>
          <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 8 }}>El link puede haber expirado.</p>
        </div>
      </div>
    )
  }

  const statusInfo = STATUS_INFO[booking.status] || STATUS_INFO.confirmado
  const isLive     = booking.status === 'en_camino'

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💧</div>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>Maz Clean</span>
          {isLive && (
            <div style={styles.liveBadge}>
              <span style={styles.liveDot} />
              EN VIVO
            </div>
          )}
        </div>
        <p style={{ color: '#bfdbfe', fontSize: 12 }}>{booking.service_name} · {booking.booking_ref}</p>
      </div>

      {/* Status */}
      <div style={{ ...styles.statusCard, borderLeft: `4px solid ${statusInfo.color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 32 }}>{statusInfo.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1f2937' }}>{statusInfo.label}</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{statusInfo.desc}</div>
          </div>
          {eta && isLive && (
            <div style={styles.etaBox}>
              <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Llega en</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1e40af' }}>{eta}</div>
            </div>
          )}
        </div>
      </div>

      {/* Mapa */}
      <div style={styles.mapWrapper}>
        {!mapsLoaded ? (
          <div style={styles.mapPlaceholder}>
            <span style={{ fontSize: 24 }}>🗺</span>
            <span style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>Cargando mapa...</span>
          </div>
        ) : (
          <div ref={mapRef} style={styles.map} />
        )}
        <div style={styles.mapLegend}>
          <span>🔵 Tu ubicación</span>
          <span>🚕 Operador</span>
          <span style={{ color: '#9ca3af', fontSize: 11 }}>Actualización automática</span>
        </div>
      </div>

      {/* Dirección */}
      <div style={styles.addressCard}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>📍 Dirección del servicio</div>
        <div style={{ fontSize: 14, color: '#1f2937', fontWeight: 500 }}>{booking.address_line}</div>
        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>🕐 {booking.scheduled_date} · {booking.scheduled_time}</div>
      </div>

      {booking.status === 'finalizado' && (
        <div style={styles.doneCard}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#166534' }}>¡Tu auto está impecable!</div>
          <div style={{ fontSize: 13, color: '#4b7c5c', marginTop: 4 }}>Gracias por usar Maz Clean</div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #1e3a8a 0%, #f3f4f6 200px)',
    paddingBottom: 40,
  },
  header: {
    padding: '20px 20px 16px',
    background: 'linear-gradient(135deg,#1e40af,#3b82f6)',
  },
  liveBadge: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: 'rgba(255,255,255,0.2)', borderRadius: 20,
    padding: '3px 10px', color: '#fff', fontWeight: 700, fontSize: 11,
  },
  liveDot: {
    width: 7, height: 7, borderRadius: '50%',
    background: '#4ade80', boxShadow: '0 0 6px #4ade80',
    display: 'inline-block',
  },
  statusCard: {
    background: '#fff', margin: '16px 16px 0',
    borderRadius: 16, padding: '16px 18px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  etaBox: {
    background: '#eff6ff', borderRadius: 12,
    padding: '8px 14px', textAlign: 'center', flexShrink: 0,
  },
  mapWrapper: {
    margin: '14px 16px 0',
    borderRadius: 16, overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    background: '#fff',
  },
  map: {
    width: '100%', height: 300,
  },
  mapPlaceholder: {
    width: '100%', height: 300,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    background: '#f9fafb',
  },
  mapLegend: {
    display: 'flex', justifyContent: 'space-between',
    padding: '10px 14px', fontSize: 12, color: '#6b7280',
    borderTop: '1px solid #f3f4f6',
  },
  addressCard: {
    background: '#fff', margin: '14px 16px 0',
    borderRadius: 16, padding: '14px 16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
  doneCard: {
    background: '#f0fdf4', border: '1px solid #bbf7d0',
    margin: '14px 16px 0', borderRadius: 16,
    padding: '20px', textAlign: 'center',
  },
  loadingCard: {
    background: '#fff', borderRadius: 16,
    padding: 48, textAlign: 'center',
    maxWidth: 400, margin: '80px auto',
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
  },
}
