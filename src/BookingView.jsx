import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'
import { sendWhatsApp } from './lib/whatsapp'

const GOOGLE_MAPS_API_KEY = 'AIzaSyA0k4Rg_XowxjDGUsLD3BldhpTINFMihjw'
const SUPABASE_URL        = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY

const SERVICES = [
  { id: '00131559-0491-479f-a295-664a68c3a222', name: 'Lavado Exterior',  description: 'Lavado completo de carrocería, llantas y cristales',            icon: '🚿', duration: '45 min', prices: { sedan: 199, suv: 249, pickup: 299, van: 299 } },
  { id: 'e85c4c06-9d09-4828-98f2-86401a4481ee', name: 'Lavado Interior',  description: 'Aspirado, limpieza de tablero, tapetes y vidrios interiores',    icon: '🪣', duration: '60 min', prices: { sedan: 249, suv: 299, pickup: 349, van: 349 } },
  { id: 'a539c1f0-73ee-4b22-b477-f1f826601d19', name: 'Lavado Completo',  description: 'Exterior + Interior en un solo servicio',                        icon: '✨', duration: '90 min', prices: { sedan: 399, suv: 499, pickup: 599, van: 599 } },
  { id: '69d83cc5-c32d-4e63-bf4f-bacad6a259a4', name: 'Encerado Premium', description: 'Aplicación de cera protectora de alta duración',                 icon: '💎', duration: '2 hrs',  prices: { sedan: 599, suv: 749, pickup: 899, van: 899 } },
  { id: 'd4d732ae-11a1-4bb8-b84f-8e8dbdacfb51', name: 'Detallado Total',  description: 'Servicio completo con pulido, descontaminación y sellador',      icon: '🏆', duration: '3 hrs',  prices: { sedan: 999, suv: 1299, pickup: 1499, van: 1499 } },
]

const VEHICLE_TYPES = [
  { id: 'sedan',  name: 'Sedán / Compacto', icon: '🚗', priceKey: 'sedan'  },
  { id: 'suv',    name: 'SUV / Camioneta',  icon: '🚙', priceKey: 'suv'    },
  { id: 'pickup', name: 'Pickup',           icon: '🛻', priceKey: 'pickup' },
  { id: 'van',    name: 'Van / Minivan',    icon: '🚐', priceKey: 'van'    },
]

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(window.google.maps); return }
    const existing = document.getElementById('google-maps-script')
    if (existing) { existing.addEventListener('load', () => resolve(window.google.maps)); existing.addEventListener('error', reject); return }
    const script = document.createElement('script')
    script.id = 'google-maps-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true; script.defer = true
    script.onload = () => resolve(window.google.maps); script.onerror = reject
    document.head.appendChild(script)
  })
}

function generateRef() {
  return 'MCL-' + Math.random().toString(36).substring(2, 8).toUpperCase()
}

// ── Hook para detectar móvil ────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

export default function BookingView() {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  const [step, setStep]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError]     = useState('')
  const [mapsLoaded, setMapsLoaded] = useState(false)

  const [selectedService, setSelectedService] = useState(null)
  const [vehicleType, setVehicleType]         = useState('')
  const [vehicleBrand, setVehicleBrand]       = useState('')
  const [vehicleColor, setVehicleColor]       = useState('')

  const [address, setAddress]               = useState('')
  const [addressDetails, setAddressDetails] = useState(null)
  const [mapError, setMapError]             = useState('')
  const mapRef = useRef(null); const mapInstanceRef = useRef(null)
  const markerRef = useRef(null); const autocompleteRef = useRef(null); const inputRef = useRef(null)

  const [date, setDate]   = useState('')
  const [time, setTime]   = useState('')
  const [notes, setNotes] = useState('')

  const [slots, setSlots]               = useState([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError]     = useState('')

  const getPrice = useCallback(() => {
    if (!selectedService || !vehicleType) return null
    const service = SERVICES.find(s => s.id === selectedService)
    const vehicle = VEHICLE_TYPES.find(v => v.id === vehicleType)
    return service?.prices?.[vehicle?.priceKey] ?? null
  }, [selectedService, vehicleType])

  useEffect(() => {
    loadGoogleMapsScript(GOOGLE_MAPS_API_KEY).then(() => setMapsLoaded(true)).catch(() => setMapError('No se pudo cargar Google Maps.'))
  }, [])

  useEffect(() => {
    if (step !== 2 || !mapsLoaded) return
    const t = setTimeout(() => { initMap(); initAutocomplete() }, 100)
    return () => clearTimeout(t)
  }, [step, mapsLoaded])

  useEffect(() => {
    if (step === 3 && date && selectedService && vehicleType && addressDetails) {
      fetchSlots()
    }
  }, [step, date, selectedService, vehicleType, addressDetails])

  const fetchSlots = async () => {
    if (!date || !selectedService || !vehicleType || !addressDetails) return
    setLoadingSlots(true); setSlotsError(''); setTime('')
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-available-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ lat: addressDetails.lat, lng: addressDetails.lng, fecha: date, service_id: selectedService, vehicle_type: vehicleType })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSlots(data.slots || [])
    } catch (err) {
      setSlotsError('No se pudo cargar la disponibilidad. Intenta de nuevo.')
    } finally {
      setLoadingSlots(false)
    }
  }

  const initMap = useCallback(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    const center = { lat: 19.4326, lng: -99.1332 }
    const map = new window.google.maps.Map(mapRef.current, { center, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false })
    mapInstanceRef.current = map
    const marker = new window.google.maps.Marker({ position: center, map, draggable: true, animation: window.google.maps.Animation.DROP })
    markerRef.current = marker
    marker.addListener('dragend', async (e) => await reverseGeocode(e.latLng.lat(), e.latLng.lng()))
    map.addListener('click', async (e) => { marker.setPosition(e.latLng); await reverseGeocode(e.latLng.lat(), e.latLng.lng()) })
  }, [])

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || autocompleteRef.current) return
    const ac = new window.google.maps.places.Autocomplete(inputRef.current, { componentRestrictions: { country: 'mx' }, fields: ['geometry', 'formatted_address'] })
    autocompleteRef.current = ac
    ac.addListener('place_changed', () => {
      const place = ac.getPlace(); if (!place.geometry) return
      const lat = place.geometry.location.lat(); const lng = place.geometry.location.lng(); const formatted = place.formatted_address
      setAddress(formatted); setAddressDetails({ lat, lng, formatted }); setMapError('')
      if (mapInstanceRef.current && markerRef.current) { mapInstanceRef.current.setCenter({ lat, lng }); mapInstanceRef.current.setZoom(16); markerRef.current.setPosition({ lat, lng }) }
    })
  }, [])

  const reverseGeocode = async (lat, lng) => {
    try {
      const result = await new window.google.maps.Geocoder().geocode({ location: { lat, lng } })
      if (result.results[0]) { const f = result.results[0].formatted_address; setAddress(f); setAddressDetails({ lat, lng, formatted: f }); if (inputRef.current) inputRef.current.value = f }
    } catch (e) { console.error(e) }
  }

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) { setMapError('Tu navegador no soporta geolocalización.'); return }
    setMapError('')
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude; const lng = pos.coords.longitude
      if (mapInstanceRef.current && markerRef.current) { mapInstanceRef.current.setCenter({ lat, lng }); mapInstanceRef.current.setZoom(16); markerRef.current.setPosition({ lat, lng }) }
      await reverseGeocode(lat, lng)
    }, () => setMapError('No se pudo obtener tu ubicación. Verifica los permisos.'))
  }

  const canGoNext = () => {
    if (step === 1) return selectedService && vehicleType && vehicleBrand && vehicleColor
    if (step === 2) return addressDetails !== null
    if (step === 3) return date && time
    return true
  }

  const handleSubmit = async () => {
    if (!user) return
    setLoading(true); setError('')
    try {
      const service    = SERVICES.find(s => s.id === selectedService)
      const price      = getPrice()
      const bookingRef = generateRef()
      const { error: insertError } = await supabase.from('bookings').insert({
        booking_ref: bookingRef, client_id: user.id, service_id: service.id,
        address_line: addressDetails.formatted, address_lat: addressDetails.lat, address_lng: addressDetails.lng,
        address_notes: notes || null, scheduled_date: date, scheduled_time: time + ':00',
        base_price: price, discount_amount: 0, total_price: price,
        payment_method: 'efectivo', payment_status: 'pendiente', status: 'pendiente', has_incident: false,
        service_name: service.name, service_price: price, vehicle_type: vehicleType,
        vehicle_brand: vehicleBrand, vehicle_color: vehicleColor,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      })
      if (insertError) throw insertError
      setLoading(false); setSuccess(true)
      setTimeout(() => {
        supabase.from('profiles').select('phone').eq('id', user.id).single()
          .then(({ data: profileData }) => {
            if (profileData?.phone) {
              sendWhatsApp('booking_created', profileData.phone, { booking_ref: bookingRef, service_name: service.name, scheduled_date: date, scheduled_time: time, total_price: price })
            }
          }).catch(() => {})
      }, 0)
    } catch (err) {
      setError('Hubo un error al guardar. Intenta de nuevo.')
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(1); setSuccess(false); setError('')
    setSelectedService(null); setVehicleType(''); setVehicleBrand(''); setVehicleColor('')
    setAddress(''); setAddressDetails(null); setDate(''); setTime(''); setNotes('')
    setSlots([]); setSlotsError('')
    mapInstanceRef.current = null; markerRef.current = null; autocompleteRef.current = null
    if (inputRef.current) inputRef.current.value = ''
  }

  const price   = getPrice()
  const service = SERVICES.find(s => s.id === selectedService)
  const vehicle = VEHICLE_TYPES.find(v => v.id === vehicleType)

  if (success) {
    return (
      <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isMobile ? '16px 12px' : '24px 16px' }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? 28 : 40, maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: '#065f46', margin: '0 0 12px' }}>¡Reservación confirmada!</h2>
          <p style={{ fontSize: 16, color: '#374151', margin: '0 0 8px' }}>Tu lavado está agendado para el <strong>{date}</strong> a las <strong>{time}</strong> hrs.</p>
          <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 8px' }}>📍 {addressDetails?.formatted}</p>
          <p style={{ fontSize: 14, color: '#9ca3af', margin: '0 0 24px' }}>Te notificaremos cuando un operador sea asignado.</p>
          <button onClick={resetForm} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', fontSize: 16, fontWeight: 600, width: '100%', minHeight: 48 }}>Nueva reservación</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: isMobile ? '12px 8px 80px' : '24px 16px' }}>
      <div style={{ background: '#fff', borderRadius: isMobile ? 12 : 16, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', width: '100%', maxWidth: 680, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: isMobile ? '20px 16px' : '24px', textAlign: 'center' }}>
          <h1 style={{ color: '#fff', fontSize: isMobile ? 18 : 22, fontWeight: 700, margin: '0 0 16px' }}>🚗 Reservar Lavado</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {[1,2,3,4].map(s => (
              <div key={s} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: isMobile ? 12 : 14, background: s <= step ? '#fff' : 'rgba(255,255,255,0.2)', color: s <= step ? '#1e40af' : 'rgba(255,255,255,0.5)', transition: 'all 0.3s' }}>
                  {s < step ? '✓' : s}
                </div>
                {s < 4 && <div style={{ width: isMobile ? 24 : 40, height: 3, background: s < step ? '#fff' : 'rgba(255,255,255,0.2)', transition: 'all 0.3s' }} />}
              </div>
            ))}
          </div>
          <div style={{ color: '#bfdbfe', fontSize: isMobile ? 12 : 13, marginTop: 8 }}>
            {step===1?'Servicio y vehículo':step===2?'Ubicación':step===3?'Fecha y hora':'Confirmar'}
          </div>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div style={{ padding: isMobile ? '16px 12px' : 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1f2937', marginBottom: 12, marginTop: 0 }}>¿Qué servicio necesitas?</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: isMobile ? 8 : 10 }}>
              {SERVICES.map(s => {
                const p = vehicleType ? s.prices[VEHICLE_TYPES.find(v=>v.id===vehicleType)?.priceKey] : s.prices.sedan
                return (
                  <div key={s.id} onClick={() => setSelectedService(s.id)}
                    style={{ padding: isMobile ? 10 : 12, borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s', border: selectedService===s.id ? '2px solid #3b82f6' : '2px solid #e5e7eb', background: selectedService===s.id ? '#eff6ff' : '#fff', minHeight: 44 }}>
                    <div style={{ fontSize: isMobile ? 20 : 22, marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: isMobile ? 13 : 13, color: '#1f2937' }}>{s.name}</div>
                    <div style={{ fontSize: isMobile ? 11 : 11, color: '#6b7280', marginTop: 2 }}>{s.description}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#3b82f6', fontSize: 14 }}>${p}</span>
                      <span style={{ fontSize: 10, color: '#9ca3af' }}>⏱ {s.duration}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1f2937', marginBottom: 12, marginTop: 20 }}>Tipo de vehículo</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: isMobile ? 6 : 8, marginBottom: 12 }}>
              {VEHICLE_TYPES.map(v => (
                <div key={v.id} onClick={() => setVehicleType(v.id)}
                  style={{ padding: isMobile ? '8px 2px' : '10px 4px', borderRadius: 10, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, transition: 'all 0.2s', border: vehicleType===v.id ? '2px solid #3b82f6' : '2px solid #e5e7eb', background: vehicleType===v.id ? '#eff6ff' : '#fff', minHeight: 44 }}>
                  <span style={{ fontSize: isMobile ? 22 : 26 }}>{v.icon}</span>
                  <span style={{ fontSize: isMobile ? 9 : 10, color: '#374151', textAlign: 'center', fontWeight: 500 }}>{v.name}</span>
                </div>
              ))}
            </div>

            {selectedService && vehicleType && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#166534', marginBottom: 12 }}>
                💰 Precio para tu vehículo: <strong>${price} MXN</strong>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Marca / Modelo</label>
                <input style={{ padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 48 }} placeholder="Ej: Toyota Corolla" value={vehicleBrand} onChange={e => setVehicleBrand(e.target.value)} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Color</label>
                <input style={{ padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 48 }} placeholder="Ej: Blanco" value={vehicleColor} onChange={e => setVehicleColor(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div style={{ padding: isMobile ? '16px 12px' : 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1f2937', marginBottom: 12, marginTop: 0 }}>¿Dónde está tu vehículo?</h3>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <input ref={inputRef} style={{ padding: '12px 12px 12px 40px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 48 }} placeholder="Busca tu dirección..." defaultValue={address} onChange={e => { if (!e.target.value) { setAddress(''); setAddressDetails(null) } }} />
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16 }}>🔍</span>
            </div>
            <button onClick={handleUseMyLocation} style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 8, padding: '12px 14px', cursor: 'pointer', fontSize: 14, color: '#0369a1', fontWeight: 500, marginBottom: 12, width: '100%', minHeight: 48 }}>📍 Usar mi ubicación actual</button>
            {mapError && <p style={{ color: '#dc2626', fontSize: 14, marginBottom: 8 }}>{mapError}</p>}
            {!mapsLoaded
              ? <div style={{ width: '100%', height: isMobile ? 220 : 280, borderRadius: 12, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 14, border: '1.5px solid #e5e7eb', marginBottom: 12 }}>Cargando mapa...</div>
              : <div ref={mapRef} style={{ width: '100%', height: isMobile ? 220 : 280, borderRadius: 12, border: '1.5px solid #e5e7eb', overflow: 'hidden', marginBottom: 12 }} />
            }
            {addressDetails && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#166534', marginBottom: 8 }}>✅ <strong>Dirección:</strong> {addressDetails.formatted}</div>}
            <p style={{ fontSize: 12, color: '#9ca3af', margin: '4px 0 0' }}>💡 Arrastra el pin o haz clic en el mapa para ajustar la ubicación exacta.</p>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div style={{ padding: isMobile ? '16px 12px' : 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1f2937', marginBottom: 12, marginTop: 0 }}>¿Cuándo lo necesitas?</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Fecha</label>
              <input type="date" style={{ padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 48 }} value={date} min={new Date().toISOString().split('T')[0]} onChange={e => { setDate(e.target.value); setTime(''); setSlots([]) }} />
            </div>

            {date && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>
                  Hora disponible
                  {loadingSlots && <span style={{ marginLeft: 8, fontSize: 11, color: '#9ca3af' }}>⏳ Calculando...</span>}
                </label>

                {slotsError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: 14, color: '#dc2626', marginBottom: 8 }}>
                    ⚠️ {slotsError}
                    <button onClick={fetchSlots} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Reintentar</button>
                  </div>
                )}

                {loadingSlots ? (
                  <div style={{ background: '#f9fafb', borderRadius: 10, padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>🔍 Buscando los mejores horarios para ti...</div>
                ) : slots.length > 0 ? (
                  <div>
                    {slots.some(s => s.available && s.suggested) && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>⚡ Horarios recomendados</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
                          {slots.filter(s => s.available && s.suggested).map(slot => (
                            <button key={slot.time} onClick={() => setTime(slot.time)}
                              style={{ padding: '12px 6px', borderRadius: 10, border: time === slot.time ? '2px solid #059669' : '2px solid #bbf7d0', background: time === slot.time ? '#059669' : '#f0fdf4', color: time === slot.time ? '#fff' : '#166534', cursor: 'pointer', fontSize: 14, fontWeight: 700, minHeight: 48, textAlign: 'center' }}>
                              <div>{slot.time}</div>
                              <div style={{ fontSize: 10, fontWeight: 500, marginTop: 2, opacity: 0.8 }}>🌱 Puntual</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Todos los horarios</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(4,1fr)' : 'repeat(5,1fr)', gap: 6 }}>
                      {slots.map(slot => {
                        if (slot.available && slot.suggested) return null
                        return (
                          <button key={slot.time} onClick={() => slot.available ? setTime(slot.time) : null} disabled={!slot.available}
                            style={{ padding: '10px 4px', borderRadius: 8, border: time === slot.time ? '2px solid #3b82f6' : '1.5px solid #e5e7eb', background: !slot.available ? '#f9fafb' : time === slot.time ? '#3b82f6' : '#fff', color: !slot.available ? '#d1d5db' : time === slot.time ? '#fff' : '#374151', cursor: slot.available ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, minHeight: 44, textDecoration: !slot.available ? 'line-through' : 'none', opacity: !slot.available ? 0.5 : 1 }}>
                            {slot.time}
                          </button>
                        )
                      })}
                    </div>
                    {slots.every(s => !s.available) && (
                      <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', fontSize: 14, color: '#854d0e', marginTop: 8 }}>
                        😔 No hay horarios disponibles para esta fecha. Por favor selecciona otro día.
                      </div>
                    )}
                  </div>
                ) : date && !loadingSlots && !slotsError ? (
                  <div style={{ background: '#f9fafb', borderRadius: 10, padding: 16, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>Selecciona una fecha para ver los horarios disponibles.</div>
                ) : null}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 16 }}>
              <label style={{ fontSize: 14, fontWeight: 500, color: '#374151' }}>Notas adicionales (opcional)</label>
              <textarea style={{ padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', height: 80, resize: 'vertical' }} placeholder="Ej: El coche está en la cochera, tocar el timbre..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div style={{ padding: isMobile ? '16px 12px' : 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1f2937', marginBottom: 12, marginTop: 0 }}>Resumen de tu reservación</h3>
            <div style={{ background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <SummaryRow icon={service?.icon||'🧽'} label="Servicio"     value={service?.name}  sub={`⏱ ${service?.duration}`} />
              <SummaryRow icon={vehicle?.icon||'🚗'} label="Vehículo"     value={`${vehicleBrand} · ${vehicleColor}`} sub={vehicle?.name} />
              <SummaryRow icon="📍"                  label="Dirección"    value={addressDetails?.formatted} />
              <SummaryRow icon="📅"                  label="Fecha y hora" value={`${date} a las ${time} hrs`} />
              {notes && <SummaryRow icon="📝"        label="Notas"        value={notes} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: '#eff6ff', fontWeight: 600, fontSize: 15, color: '#1e40af' }}>
                <span>Total a pagar</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#1d4ed8' }}>${price} MXN</span>
              </div>
            </div>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 12, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: isMobile ? '12px' : '16px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          {step > 1 && (
            <button onClick={() => setStep(s => s-1)} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, padding: '14px 20px', cursor: 'pointer', fontSize: 15, fontWeight: 500, minHeight: 52 }}>← Atrás</button>
          )}
          {step < 4
            ? <button onClick={() => setStep(s => s+1)} disabled={!canGoNext()} style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', fontSize: 15, fontWeight: 600, flex: 1, opacity: canGoNext() ? 1 : 0.5, minHeight: 52 }}>Siguiente →</button>
            : <button onClick={handleSubmit} disabled={loading} style={{ background: loading ? '#9ca3af' : '#10b981', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 24px', cursor: 'pointer', fontSize: 15, fontWeight: 600, flex: 1, minHeight: 52 }}>{loading ? '⏳ Guardando...' : '✅ Confirmar reservación'}</button>
          }
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ icon, label, value, sub }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '14px 16px', borderBottom: '1px solid #f3f4f6', alignItems: 'flex-start' }}>
      <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 14, color: '#1f2937', fontWeight: 500, marginTop: 2 }}>{value}</div>
        {sub && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 1 }}>{sub}</div>}
      </div>
    </div>
  )
}
