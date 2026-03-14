import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'

const GOOGLE_MAPS_API_KEY = 'AIzaSyA0k4Rg_XowxjDGUsLD3BldhpTINFMihjw'

// Servicios hardcodeados con sus IDs reales de Supabase
// IMPORTANTE: estos IDs deben coincidir con los de tu tabla services
const SERVICES = [
  { id: 'basic',     name: 'Lavado Básico',    description: 'Exterior + secado',                price: 150, duration: '45 min' },
  { id: 'full',      name: 'Lavado Completo',   description: 'Exterior + interior + aspirado',   price: 250, duration: '90 min' },
  { id: 'premium',   name: 'Lavado Premium',    description: 'Full + encerado + aromatizante',   price: 400, duration: '2 hrs'  },
  { id: 'detailing', name: 'Detailing',         description: 'Limpieza profunda completa',        price: 800, duration: '4 hrs'  },
]

const VEHICLE_TYPES = [
  { id: 'sedan',  name: 'Sedán / Compacto', icon: '🚗' },
  { id: 'suv',    name: 'SUV / Camioneta',  icon: '🚙' },
  { id: 'pickup', name: 'Pickup',           icon: '🛻' },
  { id: 'van',    name: 'Van / Minivan',    icon: '🚐' },
]

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(window.google.maps); return }
    const existing = document.getElementById('google-maps-script')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google.maps))
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.id    = 'google-maps-script'
    script.src   = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.defer = true
    script.onload  = () => resolve(window.google.maps)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

function generateRef() {
  return 'MCL-' + Math.random().toString(36).substring(2, 8).toUpperCase()
}

export default function BookingView() {
  const { user } = useAuth()
  const [step, setStep]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')
  const [mapsLoaded, setMapsLoaded] = useState(false)

  // Paso 1
  const [selectedService, setSelectedService] = useState(null)
  const [vehicleType, setVehicleType]         = useState('')
  const [vehicleBrand, setVehicleBrand]       = useState('')
  const [vehicleColor, setVehicleColor]       = useState('')

  // Paso 2
  const [address, setAddress]           = useState('')
  const [addressDetails, setAddressDetails] = useState(null)
  const [mapError, setMapError]         = useState('')
  const mapRef          = useRef(null)
  const mapInstanceRef  = useRef(null)
  const markerRef       = useRef(null)
  const autocompleteRef = useRef(null)
  const inputRef        = useRef(null)

  // Paso 3
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY)
      .then(() => setMapsLoaded(true))
      .catch(() => setMapError('No se pudo cargar Google Maps.'))
  }, [])

  useEffect(() => {
    if (step !== 2 || !mapsLoaded) return
    const timer = setTimeout(() => { initMap(); initAutocomplete() }, 100)
    return () => clearTimeout(timer)
  }, [step, mapsLoaded])

  const initMap = useCallback(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const center = { lat: 19.4326, lng: -99.1332 }
    const map = new window.google.maps.Map(mapRef.current, {
      center, zoom: 13,
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
    })
    mapInstanceRef.current = map
    const marker = new window.google.maps.Marker({
      position: center, map, draggable: true,
      animation: window.google.maps.Animation.DROP,
    })
    markerRef.current = marker
    marker.addListener('dragend', async (e) => {
      await reverseGeocode(e.latLng.lat(), e.latLng.lng())
    })
    map.addListener('click', async (e) => {
      marker.setPosition(e.latLng)
      await reverseGeocode(e.latLng.lat(), e.latLng.lng())
    })
  }, [])

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || autocompleteRef.current) return
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: 'mx' },
      fields: ['geometry', 'formatted_address'],
    })
    autocompleteRef.current = ac
    ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      if (!place.geometry) return
      const lat = place.geometry.location.lat()
      const lng = place.geometry.location.lng()
      const formatted = place.formatted_address
      setAddress(formatted)
      setAddressDetails({ lat, lng, formatted })
      setMapError('')
      if (mapInstanceRef.current && markerRef.current) {
        mapInstanceRef.current.setCenter({ lat, lng })
        mapInstanceRef.current.setZoom(16)
        markerRef.current.setPosition({ lat, lng })
      }
    })
  }, [])

  const reverseGeocode = async (lat, lng) => {
    try {
      const geocoder = new window.google.maps.Geocoder()
      const result = await geocoder.geocode({ location: { lat, lng } })
      if (result.results[0]) {
        const formatted = result.results[0].formatted_address
        setAddress(formatted)
        setAddressDetails({ lat, lng, formatted })
        if (inputRef.current) inputRef.current.value = formatted
      }
    } catch (err) { console.error(err) }
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) { setMapError('Tu navegador no soporta geolocalización.'); return }
    setMapError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        if (mapInstanceRef.current && markerRef.current) {
          mapInstanceRef.current.setCenter({ lat, lng })
          mapInstanceRef.current.setZoom(16)
          markerRef.current.setPosition({ lat, lng })
        }
        await reverseGeocode(lat, lng)
      },
      () => setMapError('No se pudo obtener tu ubicación. Verifica los permisos.')
    )
  }

  const canGoNext = () => {
    if (step === 1) return selectedService && vehicleType && vehicleBrand && vehicleColor
    if (step === 2) return addressDetails !== null
    if (step === 3) return date && time
    return true
  }

  const handleSubmit = async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const service = SERVICES.find(s => s.id === selectedService)

      // Insertar con las columnas REALES de tu tabla bookings
      const { error: insertError } = await supabase.from('bookings').insert({
        booking_ref:     generateRef(),
        client_id:       user.id,
        service_id:      null,            // null por ahora — sin tabla services vinculada
        address_line:    addressDetails.formatted,
        address_lat:     addressDetails.lat,
        address_lng:     addressDetails.lng,
        address_notes:   notes || null,
        scheduled_date:  date,
        scheduled_time:  time + ':00',
        base_price:      service.price,
        discount_amount: 0,
        total_price:     service.price,
        payment_method:  'efectivo',
        payment_status:  'pendiente',
        status:          'pendiente',
        has_incident:    false,
        created_at:      new Date().toISOString(),
        updated_at:      new Date().toISOString(),
        // Campos extra para que los paneles funcionen bien
        service_name:    service.name,
        service_price:   service.price,
        vehicle_type:    vehicleType,
        vehicle_brand:   vehicleBrand,
        vehicle_color:   vehicleColor,
      })

      if (insertError) throw insertError
      setSuccess(true)
    } catch (err) {
      console.error('Error al guardar reservación:', err)
      setError('Hubo un error al guardar. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(1); setSuccess(false); setError('')
    setSelectedService(null); setVehicleType(''); setVehicleBrand(''); setVehicleColor('')
    setAddress(''); setAddressDetails(null); setDate(''); setTime(''); setNotes('')
    mapInstanceRef.current = null; markerRef.current = null; autocompleteRef.current = null
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.successCard}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: '#065f46', margin: '0 0 12px' }}>
            ¡Reservación confirmada!
          </h2>
          <p style={{ fontSize: 16, color: '#374151', margin: '0 0 8px' }}>
            Tu lavado está agendado para el <strong>{date}</strong> a las <strong>{time}</strong> hrs.
          </p>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 8px' }}>
            📍 {addressDetails?.formatted}
          </p>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 24px' }}>
            Te notificaremos cuando un operador sea asignado.
          </p>
          <button onClick={resetForm} style={styles.btnPrimary}>Nueva reservación</button>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>

        {/* Header con pasos */}
        <div style={styles.header}>
          <h1 style={styles.title}>🚗 Reservar Lavado</h1>
          <div style={styles.stepsBar}>
            {[1,2,3,4].map(s => (
              <div key={s} style={{ display:'flex', alignItems:'center' }}>
                <div style={{
                  ...styles.stepDot,
                  background: s <= step ? '#3b82f6' : '#e5e7eb',
                  color:      s <= step ? '#fff'    : '#9ca3af',
                }}>
                  {s < step ? '✓' : s}
                </div>
                {s < 4 && <div style={{ ...styles.stepLine, background: s < step ? '#3b82f6' : '#e5e7eb' }} />}
              </div>
            ))}
          </div>
          <div style={styles.stepLabel}>
            {step === 1 && 'Servicio y vehículo'}
            {step === 2 && 'Ubicación'}
            {step === 3 && 'Fecha y hora'}
            {step === 4 && 'Confirmar'}
          </div>
        </div>

        {/* ── PASO 1 ── */}
        {step === 1 && (
          <div style={styles.body}>
            <h3 style={styles.sectionTitle}>¿Qué servicio necesitas?</h3>
            <div style={styles.serviceGrid}>
              {SERVICES.map(s => (
                <div
                  key={s.id}
                  onClick={() => setSelectedService(s.id)}
                  style={{
                    ...styles.serviceCard,
                    border: selectedService === s.id ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                    background: selectedService === s.id ? '#eff6ff' : '#fff',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#1f2937' }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.description}</div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop: 8, alignItems:'center' }}>
                    <span style={{ fontWeight: 700, color: '#3b82f6', fontSize: 16 }}>${s.price}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>⏱ {s.duration}</span>
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ ...styles.sectionTitle, marginTop: 24 }}>Tipo de vehículo</h3>
            <div style={styles.vehicleGrid}>
              {VEHICLE_TYPES.map(v => (
                <div
                  key={v.id}
                  onClick={() => setVehicleType(v.id)}
                  style={{
                    ...styles.vehicleCard,
                    border: vehicleType === v.id ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                    background: vehicleType === v.id ? '#eff6ff' : '#fff',
                  }}
                >
                  <span style={{ fontSize: 28 }}>{v.icon}</span>
                  <span style={{ fontSize: 11, color: '#374151', textAlign: 'center', fontWeight: 500 }}>{v.name}</span>
                </div>
              ))}
            </div>

            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label}>Marca / Modelo</label>
                <input style={styles.input} placeholder="Ej: Toyota Corolla"
                  value={vehicleBrand} onChange={e => setVehicleBrand(e.target.value)} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Color</label>
                <input style={styles.input} placeholder="Ej: Blanco"
                  value={vehicleColor} onChange={e => setVehicleColor(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ── PASO 2 ── */}
        {step === 2 && (
          <div style={styles.body}>
            <h3 style={styles.sectionTitle}>¿Dónde está tu vehículo?</h3>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input
                ref={inputRef}
                style={{ ...styles.input, paddingLeft: 40 }}
                placeholder="Busca tu dirección..."
                defaultValue={address}
                onChange={e => { if (!e.target.value) { setAddress(''); setAddressDetails(null) } }}
              />
              <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:16 }}>🔍</span>
            </div>
            <button onClick={handleUseMyLocation} style={styles.btnLocation}>
              📍 Usar mi ubicación actual
            </button>
            {mapError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 8 }}>{mapError}</p>}
            {!mapsLoaded ? (
              <div style={styles.mapPlaceholder}>Cargando mapa...</div>
            ) : (
              <div ref={mapRef} style={styles.mapContainer} />
            )}
            {addressDetails && (
              <div style={styles.addressConfirm}>
                ✅ <strong>Dirección seleccionada:</strong> {addressDetails.formatted}
              </div>
            )}
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>
              💡 Puedes arrastrar el pin o hacer clic en el mapa para ajustar la ubicación exacta.
            </p>
          </div>
        )}

        {/* ── PASO 3 ── */}
        {step === 3 && (
          <div style={styles.body}>
            <h3 style={styles.sectionTitle}>¿Cuándo lo necesitas?</h3>
            <div style={styles.row}>
              <div style={styles.field}>
                <label style={styles.label}>Fecha</label>
                <input type="date" style={styles.input} value={date}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setDate(e.target.value)} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>Hora</label>
                <select style={styles.input} value={time} onChange={e => setTime(e.target.value)}>
                  <option value="">Selecciona hora</option>
                  {['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00'].map(t => (
                    <option key={t} value={t}>{t} hrs</option>
                  ))}
                </select>
              </div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Notas adicionales (opcional)</label>
              <textarea
                style={{ ...styles.input, height: 80, resize: 'vertical' }}
                placeholder="Ej: El coche está en la cochera, tocar el timbre..."
                value={notes} onChange={e => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* ── PASO 4 ── */}
        {step === 4 && (
          <div style={styles.body}>
            <h3 style={styles.sectionTitle}>Resumen de tu reservación</h3>
            {(() => {
              const service = SERVICES.find(s => s.id === selectedService)
              const vehicle = VEHICLE_TYPES.find(v => v.id === vehicleType)
              return (
                <div style={{ background:'#f9fafb', borderRadius:12, border:'1px solid #e5e7eb', overflow:'hidden' }}>
                  <SummaryRow icon="🧽" label="Servicio"    value={service?.name}  sub={`$${service?.price} · ${service?.duration}`} />
                  <SummaryRow icon={vehicle?.icon} label="Vehículo" value={`${vehicleBrand} · ${vehicleColor}`} sub={vehicle?.name} />
                  <SummaryRow icon="📍" label="Dirección"   value={addressDetails?.formatted} />
                  <SummaryRow icon="📅" label="Fecha y hora" value={`${date} a las ${time} hrs`} />
                  {notes && <SummaryRow icon="📝" label="Notas" value={notes} />}
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px', background:'#eff6ff', fontWeight:600, fontSize:15, color:'#1e40af' }}>
                    <span>Total a pagar</span>
                    <span style={{ fontSize:20, fontWeight:700, color:'#1d4ed8' }}>${service?.price} MXN</span>
                  </div>
                </div>
              )
            })()}
            {error && (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:8, padding:'10px 14px', marginTop:12, color:'#dc2626', fontSize:13 }}>
                ⚠️ {error}
              </div>
            )}
          </div>
        )}

        {/* Footer navegación */}
        <div style={styles.footer}>
          {step > 1 && (
            <button onClick={() => setStep(s => s - 1)} style={styles.btnSecondary}>
              ← Atrás
            </button>
          )}
          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canGoNext()}
              style={{ ...styles.btnPrimary, opacity: canGoNext() ? 1 : 0.5 }}
            >
              Siguiente →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{ ...styles.btnPrimary, background: loading ? '#9ca3af' : '#10b981' }}
            >
              {loading ? '⏳ Guardando...' : '✅ Confirmar reservación'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ icon, label, value, sub }) {
  return (
    <div style={{ display:'flex', gap:12, padding:'14px 16px', borderBottom:'1px solid #f3f4f6', alignItems:'flex-start' }}>
      <span style={{ fontSize:20, flexShrink:0, marginTop:2 }}>{icon}</span>
      <div>
        <div style={{ fontSize:11, color:'#9ca3af', textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
        <div style={{ fontSize:14, color:'#1f2937', fontWeight:500, marginTop:2 }}>{value}</div>
        {sub && <div style={{ fontSize:12, color:'#6b7280', marginTop:1 }}>{sub}</div>}
      </div>
    </div>
  )
}

const styles = {
  container: { minHeight:'100vh', background:'#f3f4f6', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 16px' },
  card:      { background:'#fff', borderRadius:16, boxShadow:'0 4px 24px rgba(0,0,0,0.10)', width:'100%', maxWidth:680, overflow:'hidden' },
  header:    { background:'linear-gradient(135deg,#1e40af,#3b82f6)', padding:'24px', textAlign:'center' },
  title:     { color:'#fff', fontSize:22, fontWeight:700, margin:'0 0 16px' },
  stepsBar:  { display:'flex', alignItems:'center', justifyContent:'center' },
  stepDot:   { width:32, height:32, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14, transition:'all 0.3s' },
  stepLine:  { width:40, height:3, transition:'all 0.3s' },
  stepLabel: { color:'#bfdbfe', fontSize:13, marginTop:8 },
  body:      { padding:24 },
  footer:    { padding:'16px 24px', borderTop:'1px solid #f3f4f6', display:'flex', justifyContent:'space-between', gap:12 },
  sectionTitle: { fontSize:16, fontWeight:600, color:'#1f2937', marginBottom:12, marginTop:0 },
  serviceGrid:  { display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 },
  serviceCard:  { padding:14, borderRadius:10, cursor:'pointer', transition:'all 0.2s' },
  vehicleGrid:  { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 },
  vehicleCard:  { padding:'10px 4px', borderRadius:10, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, transition:'all 0.2s' },
  row:   { display:'flex', gap:12 },
  field: { flex:1, display:'flex', flexDirection:'column', gap:4, marginBottom:12 },
  label: { fontSize:13, fontWeight:500, color:'#374151' },
  input: { padding:'10px 12px', borderRadius:8, border:'1.5px solid #e5e7eb', fontSize:14, outline:'none', width:'100%', boxSizing:'border-box', fontFamily:'inherit' },
  btnLocation:    { background:'#f0f9ff', border:'1.5px solid #bae6fd', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:13, color:'#0369a1', fontWeight:500, marginBottom:12, width:'100%' },
  mapContainer:   { width:'100%', height:280, borderRadius:12, border:'1.5px solid #e5e7eb', overflow:'hidden', marginBottom:12 },
  mapPlaceholder: { width:'100%', height:280, borderRadius:12, background:'#f9fafb', display:'flex', alignItems:'center', justifyContent:'center', color:'#9ca3af', fontSize:14, border:'1.5px solid #e5e7eb', marginBottom:12 },
  addressConfirm: { background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#166534', marginBottom:8 },
  successCard:    { background:'#fff', borderRadius:16, padding:40, maxWidth:480, margin:'0 auto', textAlign:'center', boxShadow:'0 4px 24px rgba(0,0,0,0.10)' },
  btnPrimary:     { background:'#3b82f6', color:'#fff', border:'none', borderRadius:8, padding:'11px 24px', cursor:'pointer', fontSize:15, fontWeight:600, flex:1 },
  btnSecondary:   { background:'#f3f4f6', color:'#374151', border:'none', borderRadius:8, padding:'11px 20px', cursor:'pointer', fontSize:15, fontWeight:500 },
}
