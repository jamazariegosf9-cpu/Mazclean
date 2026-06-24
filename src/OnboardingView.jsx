import { useState, useEffect, useRef } from 'react'
import Analytics from './lib/analytics'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'

const DIAS   = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']
const BANCOS = ['BBVA','Banamex','Santander','Banorte','HSBC','Inbursa','Scotiabank','Afirme','BanBajio','Azteca','Otro']
const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

function validarCLABE(clabe) {
  if (!/^\d{18}$/.test(clabe)) return false
  const pesos = [3,7,1,3,7,1,3,7,1,3,7,1,3,7,1,3,7]
  const suma  = pesos.reduce((acc, p, i) => acc + (parseInt(clabe[i]) * p) % 10, 0)
  return (10 - (suma % 10)) % 10 === parseInt(clabe[17])
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return isMobile
}

const getStorageUrl = (path) => {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/service-photos/${path}`
}

// ── Limpia prefijo +52 del teléfono guardado ──────────────────────────────────
function cleanPhone(raw) {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('52')) return digits.slice(2)
  if (digits.length === 10) return digits
  return digits.slice(-10)
}

// ── Refresca token JWT antes de uploads — fix error 403 exp claim ─────────────
async function refreshTokenIfNeeded() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (!stored) return
    const parsed = JSON.parse(stored)
    const token = parsed?.access_token || parsed?.session?.access_token
    if (!token) return
    // Decodificar exp del JWT sin librería externa
    const payload = JSON.parse(atob(token.split('.')[1]))
    const expIn = (payload.exp * 1000) - Date.now()
    // Si expira en menos de 5 minutos, refrescar
    if (expIn < 5 * 60 * 1000) {
      const { data, error } = await supabase.auth.refreshSession()
      if (!error && data?.session) {
        const newAuth = {
          access_token:  data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at:    data.session.expires_at,
          user:          data.session.user,
        }
        localStorage.setItem('mazclean-auth', JSON.stringify(newAuth))
      }
    }
  } catch {}
}

// ── Token desde localStorage ──────────────────────────────────────────────────
function getTokenFromStorage() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed?.access_token || parsed?.session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY
    }
  } catch {}
  return import.meta.env.VITE_SUPABASE_ANON_KEY
}

// ── Upload genérico con refresh de token — fix 403 ───────────────────────────
async function uploadFile({ file, folder, userId, onProgress }) {
  await refreshTokenIfNeeded()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const token   = getTokenFromStorage()
  const isVideo = file.type.startsWith('video/')
  const isPdf   = file.type === 'application/pdf'
  const ext     = isVideo ? (file.name?.endsWith('.mov') ? 'mov' : 'mp4') : isPdf ? 'pdf' : 'jpg'
  const path    = `${folder}/${userId}/${folder}_${Date.now()}.${ext}`
  const fileToUpload = file

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/service-photos/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', supabaseKey)
    xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg')
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.timeout = 180000
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)) }
    xhr.onload    = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText?.slice(0, 100)}`)) }
    xhr.onerror   = () => reject(new Error('Error de red — verifica tu conexión'))
    xhr.ontimeout = () => reject(new Error('Tiempo agotado — señal débil, intenta de nuevo'))
    xhr.send(fileToUpload)
  })
  return path
}

// ── Upload firma digital ──────────────────────────────────────────────────────
async function uploadSignature({ base64DataUrl, userId }) {
  await refreshTokenIfNeeded()
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const token = getTokenFromStorage()
  const res   = await fetch(base64DataUrl)
  const blob  = await res.blob()
  const path  = `firmas/${userId}/firma_contrato_${Date.now()}.png`

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/service-photos/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', supabaseKey)
    xhr.setRequestHeader('Content-Type', 'image/png')
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.timeout = 30000
    xhr.onload    = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText?.slice(0, 100)}`)) }
    xhr.onerror   = () => reject(new Error('Error de red al subir firma'))
    xhr.ontimeout = () => reject(new Error('Tiempo agotado al subir firma'))
    xhr.send(blob)
  })
  return path
}

// ── Componente PhotoUpload ────────────────────────────────────────────────────
function PhotoUpload({ label, hint, icon, value, onChange, accept = 'image/*', capture, maxMB = 50, disabled = false }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [localErr, setLocalErr]   = useState('')
  const { user } = useAuth()

  const handleFile = async (file) => {
    if (!file || disabled) return
    setUploading(true); setLocalErr(''); setProgress(0)
    try {
      if (file.size > maxMB * 1024 * 1024) throw new Error(`El archivo no debe pesar más de ${maxMB}MB.`)
      const folder = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'_').replace(/[^a-z_]/g,'').slice(0,30)
      const path = await uploadFile({ file, folder, userId: user.id, onProgress: setProgress })
      onChange(path)
    } catch (e) { setLocalErr(e.message) }
    finally { setUploading(false) }
  }

  // Detección basada solo en el valor guardado — no en el accept del input
  // Esto evita que campos que aceptan PDF traten imágenes JPG como documento
  const isVideo = value && (value.includes('.mp4') || value.includes('.mov'))
  const isPdf   = value && value.includes('.pdf')

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>
        {label} <span style={{ color: '#ef4444' }}>*</span>
      </label>
      {hint && <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px', lineHeight: 1.5 }}>{hint}</p>}

      {value ? (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          {isVideo ? (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28 }}>🎥</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Video subido correctamente</div>
                <a href={getStorageUrl(value)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#059669' }}>Ver video →</a>
              </div>
            </div>
          ) : isPdf ? (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 28 }}>📄</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Documento subido</div>
                <a href={getStorageUrl(value)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#059669' }}>Ver documento →</a>
              </div>
            </div>
          ) : (
            <img src={getStorageUrl(value)} alt={label} style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12, border: '2px solid #bbf7d0' }} onError={e => { e.target.style.display = 'none' }} />
          )}
          <span style={{ position: 'absolute', top: 8, right: 8, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20 }}>✅ Guardado</span>
        </div>
      ) : (
        <div style={{ width: '100%', height: 110, background: disabled ? '#f3f4f6' : '#f9fafb', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 10, border: `2px dashed ${disabled ? '#d1d5db' : '#e5e7eb'}` }}>
          <span style={{ fontSize: 32 }}>{disabled ? '🔒' : icon}</span>
          <span style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{disabled ? 'No editable' : 'Sin archivo aún'}</span>
        </div>
      )}

      {uploading && (
        <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 16, height: 16, border: '2px solid #bfdbfe', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>Subiendo... {progress}%</span>
          </div>
          <div style={{ height: 4, background: '#bfdbfe', borderRadius: 4 }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#3b82f6', borderRadius: 4, transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      {localErr && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#dc2626', fontSize: 13 }}>
          ⚠️ {localErr}
          {localErr.includes('403') || localErr.includes('Unauthorized') ? (
            <div style={{ marginTop: 6, fontSize: 12, color: '#991b1b' }}>
              Tu sesión expiró. <button onClick={() => window.location.reload()} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', textDecoration: 'underline', fontSize: 12, padding: 0 }}>Recargar página</button> e intenta de nuevo.
            </div>
          ) : null}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', borderRadius: 12, background: disabled ? '#e5e7eb' : uploading ? '#f3f4f6' : '#6366f1', color: disabled ? '#9ca3af' : uploading ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 700, cursor: disabled ? 'not-allowed' : uploading ? 'not-allowed' : 'pointer', pointerEvents: disabled || uploading ? 'none' : 'auto', minHeight: 50, flexShrink: 0 }}>
        {disabled ? '🔒 Documento bloqueado' : icon + ' ' + (value ? 'Cambiar archivo' : 'Seleccionar archivo')}
        <input type="file" accept={accept} capture={capture} style={{ display: 'none' }} onChange={e => { if (e.target.files[0] && !disabled) handleFile(e.target.files[0]) }} />
      </label>
    </div>
  )
}

// ── Firma digital (canvas) ───────────────────────────────────────────────────
function SignaturePad({ onSign, signed }) {
  const canvasRef = useRef(null)
  const drawing   = useRef(false)
  const [hasSignature, setHasSignature] = useState(signed)

  const getPos = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const source = e.touches ? e.touches[0] : e
    return { x: source.clientX - rect.left, y: source.clientY - rect.top }
  }

  const start = (e) => { e.preventDefault(); drawing.current = true; const canvas = canvasRef.current; const ctx = canvas.getContext('2d'); const { x, y } = getPos(e, canvas); ctx.beginPath(); ctx.moveTo(x, y) }
  const draw  = (e) => { e.preventDefault(); if (!drawing.current) return; const canvas = canvasRef.current; const ctx = canvas.getContext('2d'); ctx.strokeStyle = '#1e40af'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; const { x, y } = getPos(e, canvas); ctx.lineTo(x, y); ctx.stroke(); setHasSignature(true) }
  const stop  = (e) => { e.preventDefault(); if (!drawing.current) return; drawing.current = false; const canvas = canvasRef.current; onSign(canvas.toDataURL('image/png')) }
  const clear = () => { const canvas = canvasRef.current; const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); setHasSignature(false); onSign(null) }

  return (
    <div>
      <div style={{ border: '2px solid #bfdbfe', borderRadius: 12, background: '#f8faff', overflow: 'hidden', position: 'relative' }}>
        <canvas ref={canvasRef} width={480} height={160} style={{ width: '100%', height: 160, touchAction: 'none', cursor: 'crosshair', display: 'block' }}
          onMouseDown={start} onMouseMove={draw} onMouseUp={stop} onMouseLeave={stop}
          onTouchStart={start} onTouchMove={draw} onTouchEnd={stop} />
        {!hasSignature && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: 13, color: '#9ca3af' }}>✍️ Dibuja tu firma aquí</span>
          </div>
        )}
      </div>
      <button onClick={clear} style={{ marginTop: 8, padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 13, color: '#6b7280', cursor: 'pointer', minHeight: 36 }}>🗑 Limpiar firma</button>
    </div>
  )
}

// ── Componente MapaZona — Google Maps Static con círculo aproximado ───────────
// Usamos 8 puntos para el círculo (suficiente aproximación visual)
// y coordenadas con 4 decimales para mantener la URL bajo el límite de 8192 chars
function buildMapUrl(lat, lng, radius, key) {
  if (!key) return null
  const zoom   = radius >= 10 ? 11 : radius >= 5 ? 12 : radius >= 3 ? 13 : 14
  const degLat = radius / 111
  const degLng = radius / (111 * Math.cos(lat * Math.PI / 180))
  // 8 puntos = octágono — visualmente suficiente, URL corta
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 8
    return `${(lat + degLat * Math.sin(a)).toFixed(4)},${(lng + degLng * Math.cos(a)).toFixed(4)}`
  })
  pts.push(pts[0])
  const path   = `color:0x3b82f6ff|fillcolor:0x3b82f640|weight:3|${pts.join('|')}`
  const marker = `color:red|label:P|${lat.toFixed(4)},${lng.toFixed(4)}`
  const url = `https://maps.googleapis.com/maps/api/staticmap`
    + `?center=${lat.toFixed(4)},${lng.toFixed(4)}`
    + `&zoom=${zoom}&size=560x320&maptype=roadmap`
    + `&markers=${encodeURIComponent(marker)}`
    + `&path=${encodeURIComponent(path)}`
    + `&key=${key}`
  return url
}

function MapaZona({ lat, lng, radius, onConfirm, onBack }) {
  const [confirmed, setConfirmed] = useState(false)
  const mapUrl = buildMapUrl(lat, lng, radius, GOOGLE_MAPS_KEY)

  const handleConfirm = () => { setConfirmed(true); onConfirm() }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🗺️ Confirma tu zona de trabajo</h2>
      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px', lineHeight: 1.5 }}>
        El área azul muestra tu zona de cobertura de <strong>{radius} km</strong> de radio. Verifica que sea correcta antes de continuar.
      </p>

      {mapUrl ? (
        <div style={{ borderRadius: 14, overflow: 'hidden', border: '2px solid #bfdbfe', marginBottom: 16, position: 'relative' }}>
          <img
            src={mapUrl}
            alt="Zona de cobertura"
            style={{ width: '100%', display: 'block', maxHeight: 300, objectFit: 'cover' }}
            onError={e => { e.target.parentElement.innerHTML = '<div style="padding:20px;text-align:center;color:#6b7280;font-size:13px">⚠️ No se pudo cargar el mapa. Verifica tu conexión.</div>' }}
          />
          <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(255,255,255,0.92)', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#1e40af', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            📍 Radio: {radius} km
          </div>
        </div>
      ) : (
        <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: '20px', marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📍</div>
          <p style={{ fontSize: 13, color: '#0284c7', margin: 0 }}>
            Ubicación: {lat.toFixed(4)}, {lng.toFixed(4)}<br/>Radio de cobertura: <strong>{radius} km</strong>
          </p>
        </div>
      )}

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
        <p style={{ fontSize: 13, color: '#1e40af', margin: 0, lineHeight: 1.5 }}>
          💡 Si el área no es correcta, regresa y ajusta tu punto de partida o el radio de cobertura.
        </p>
      </div>

      {confirmed && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>✅</span><span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>Zona confirmada</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={onBack} style={{ flex: 1, padding: '13px 0', background: '#f3f4f6', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 52 }}>← Ajustar</button>
        <button onClick={handleConfirm} style={{ flex: 2, padding: '13px 0', background: '#10b981', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
          ✅ Confirmar zona →
        </button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function OnboardingView({ onComplete }) {
  const { user, profile, updateProfile, loadProfile, loadProfileDirect } = useAuth()
  const isMobile = useIsMobile()

  useEffect(() => { Analytics.onboardingStart() }, [])

  const [step, setStep] = useState(() => {
    if (
      profile?.operator_status === 'docs_requeridos' &&
      Array.isArray(profile?.rejected_documents) &&
      profile.rejected_documents.length > 0
    ) return 6
    const savedStep = profile?.onboarding_step || 0
    return savedStep <= 1 ? 0 : savedStep
  })
  const [subStep, setSubStep] = useState(1)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  // Paso 1 — Datos personales
  const [fullName, setFullName] = useState(profile?.full_name || '')
  // Fix: limpiar prefijo +52 del teléfono guardado
  const [phone, setPhone]       = useState(cleanPhone(profile?.phone || ''))
  // curp conservado en DB pero no se pide en registro simplificado
  const [curp, setCurp]         = useState(profile?.curp || '')

  // Paso 2 — Identidad completa (INE + Selfie + Comprobante + Video)
  const [ineFrontUrl, setIneFrontUrl]     = useState(profile?.ine_front_url || '')
  const [ineBackUrl, setIneBackUrl]       = useState(profile?.ine_back_url || '')
  const [selfieIdUrl, setSelfieIdUrl]     = useState(profile?.selfie_with_id_url || '')
  const [proofAddressUrl, setProofAddressUrl] = useState(profile?.proof_of_address_url || '')
  const [proofLifeUrl, setProofLifeUrl]   = useState(profile?.proof_of_life_video_url || '')

  // Estado banco — conservado en state aunque no se muestra (campo DB intacto)
  const [clabe, setClabe]           = useState('')
  const [clabeHolder, setClabeHolder] = useState(profile?.clabe_holder || '')
  const [bankName, setBankName]     = useState(profile?.bank_name || '')
  const [clabeError, setClabeError] = useState('')

  // Paso 3 — Zona de trabajo + Vehículo
  const [baseAddress, setBaseAddress]   = useState(profile?.base_address || '')
  const [baseLat, setBaseLat]           = useState(profile?.base_lat || null)
  const [baseLng, setBaseLng]           = useState(profile?.base_lng || null)
  const [geoLoading, setGeoLoading]     = useState(false)
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeError, setGeocodeError]     = useState('')
  const [geoError, setGeoError]         = useState('')
  const [radius, setRadius]             = useState(profile?.coverage_radius || 2)
  const [zonaConfirmada, setZonaConfirmada] = useState(false)
  const [selectedDays, setSelectedDays] = useState(profile?.work_days || [])
  const [workStart, setWorkStart]       = useState(profile?.work_start?.slice(0,5) || '08:00')
  const [workEnd, setWorkEnd]           = useState(profile?.work_end?.slice(0,5) || '18:00')
  const [vehicleType, setVehicleType]   = useState(profile?.vehicle_type_own || '')
  const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState(profile?.vehicle_photo_url || '')
  const [vehiclePlate, setVehiclePlate] = useState(profile?.vehicle_plate || '')

  // Paso 4 — Materiales
  const [kitPhotoUrl, setKitPhotoUrl]   = useState(profile?.kit_photo_url || '')

  // Paso 5 — Contrato
  const [experienceYears, setExperienceYears] = useState(profile?.experience_years || '')
  const [experienceNotes, setExperienceNotes] = useState(profile?.experience_notes || '')
  const [termsAccepted, setTermsAccepted]     = useState(!!profile?.terms_accepted_at)
  const [signature, setSignature]             = useState(null)
  const [uploadingSignature, setUploadingSignature] = useState(false)
  const [membershipConfig, setMembershipConfig] = useState({ operator_price: 50, client_price: 30 })

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/membership_config?select=operator_price,client_price&limit=1`,
          { headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY } }
        )
        if (res.ok) { const rows = await res.json(); if (rows?.[0]) setMembershipConfig(rows[0]) }
      } catch {}
    }
    fetchConfig()
  }, [])

  useEffect(() => {
    if (!profile) return
    if (
      profile.operator_status === 'docs_requeridos' &&
      Array.isArray(profile.rejected_documents) &&
      profile.rejected_documents.length > 0
    ) { setStep(6); return }
    if (profile.onboarding_step > 1 && step < 2) setStep(profile.onboarding_step)
  }, [profile])

  const inp = { padding: '13px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 50, background: '#fff' }
  const lbl = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }

  const saveStep = async (data, next) => {
    setSaving(true); setError('')
    try {
      let extraData = {}
      if (profile?.operator_status === 'docs_requeridos' &&
          Array.isArray(profile?.rejected_documents) &&
          profile.rejected_documents.length > 0) {
        const keysBeingSaved = Object.keys(data)
        const updatedDocs = profile.rejected_documents.map(doc =>
          keysBeingSaved.includes(doc.key)
            ? { ...doc, status: 'corregido', corrected_at: new Date().toISOString() }
            : doc
        )
        const stillPending = updatedDocs.filter(d => d.status !== 'corregido')
        extraData = {
          rejected_documents: updatedDocs,
          ...(stillPending.length === 0 ? { operator_status: 'pending_review', onboarding_done: true, onboarding_step: 6 } : {}),
        }
        if (stillPending.length > 0) next = 6
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const token = getTokenFromStorage()
      const body = { ...data, ...extraData, onboarding_step: next, updated_at: new Date().toISOString() }
      const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      try { await loadProfileDirect() } catch {}
      Analytics.onboardingStep(next)
      setStep(next); setSubStep(1)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const nextSub = () => { setError(''); setSubStep(s => s + 1) }
  const prevSub = () => { setError(''); setSubStep(s => s - 1) }
  const goStep  = (n) => { setStep(n); setSubStep(1); setError('') }

  const getRejectedKeys = () => {
    if (profile?.operator_status !== 'docs_requeridos') return []
    return (profile?.rejected_documents || []).filter(d => d.status !== 'corregido').map(d => d.key)
  }

  const canEdit = (docKey) => {
    if (profile?.operator_status === 'aprobado') return false
    if (profile?.operator_status === 'docs_requeridos') return getRejectedKeys().includes(docKey)
    return true
  }

  const canNavigateTo = (targetStep) => {
    if (profile?.operator_status === 'aprobado') return false
    if (profile?.operator_status === 'docs_requeridos') {
      const rejectedSteps = new Set((profile?.rejected_documents || []).filter(d => d.status !== 'corregido').map(d => d.step))
      return targetStep === 6 || rejectedSteps.has(targetStep)
    }
    return true
  }

  const goStepSafe = (n) => {
    if (!canNavigateTo(n)) { setStep(6); setSubStep(1); setError(''); return }
    setStep(n); setSubStep(1); setError('')
  }

  const handleGeolocate = () => {
    if (!navigator.geolocation) { setGeoError('Tu navegador no soporta geolocalización.'); return }
    setGeoLoading(true); setGeoError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude; const lng = pos.coords.longitude
        setBaseLat(lat); setBaseLng(lng); setZonaConfirmada(false)
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`)
          const data = await res.json()
          setBaseAddress(data?.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
        } catch { setBaseAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`) }
        setGeoLoading(false)
      },
      (err) => {
        setGeoLoading(false)
        if (err.code === 1) setGeoError('Permiso denegado. Escribe tu dirección manualmente.')
        else setGeoError('No se pudo obtener tu ubicación.')
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const handleGeocodeAddress = async () => {
    if (!baseAddress.trim()) { setGeocodeError('Escribe una dirección primero.'); return }
    setGeocodeLoading(true); setGeocodeError(''); setBaseLat(null); setBaseLng(null); setZonaConfirmada(false)
    try {
      const query = encodeURIComponent(baseAddress.trim() + ', México')
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&accept-language=es`, { headers: { 'Accept-Language': 'es' } })
      const data = await res.json()
      if (!data || data.length === 0) { setGeocodeError('No se encontró la dirección. Intenta ser más específico o usa "Usar mi ubicación actual".'); return }
      setBaseLat(parseFloat(data[0].lat)); setBaseLng(parseFloat(data[0].lon))
      setBaseAddress(data[0].display_name || baseAddress)
    } catch { setGeocodeError('Error al buscar la dirección. Verifica tu conexión.') }
    finally { setGeocodeLoading(false) }
  }

  const toggleDay = (d) => setSelectedDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleStep1 = async () => {
    if (!fullName.trim()) { setError('El nombre completo es requerido.'); return }
    if (!/^\d{10}$/.test(phone.replace(/\s/g,''))) { setError('El teléfono debe tener 10 dígitos.'); return }
    await saveStep({ full_name: fullName.trim(), phone: phone.replace(/\s/g,'') }, 2)
  }

  // Paso 2: INE + Selfie + Comprobante + Video
  const handleStep2 = async () => {
    if (!ineFrontUrl)     { setError('Sube el frente de tu INE.'); return }
    if (!ineBackUrl)      { setError('Sube el reverso de tu INE.'); return }
    if (!selfieIdUrl)     { setError('Sube tu selfie con el INE.'); return }
    if (!proofAddressUrl) { setError('Sube tu comprobante de domicilio.'); return }
    await saveStep({
      ine_front_url: ineFrontUrl, ine_back_url: ineBackUrl,
      selfie_with_id_url: selfieIdUrl,
      proof_of_address_url: proofAddressUrl,
      // proof_of_life_video_url: pedido post-aprobación en OperatorAccount
    }, 3)
  }

  const handleStep3 = async () => {
    if (!baseAddress.trim())  { setError('Ingresa tu punto de partida.'); return }
    if (!zonaConfirmada)      { setError('Confirma tu zona de trabajo en el mapa antes de continuar.'); return }
    if (!selectedDays.length) { setError('Selecciona al menos un día de trabajo.'); return }
    if (workStart >= workEnd) { setError('La hora de inicio debe ser antes del cierre.'); return }
    if (radius > 2) {
      if (!vehicleType)       { setError('Indica tu medio de transporte.'); return }
      if (!vehiclePhotoUrl)   { setError('Sube la foto de tu vehículo.'); return }
      if (!vehiclePlate.trim()) { setError('Ingresa la placa de tu vehículo.'); return }
    }
    await saveStep({
      base_address: baseAddress.trim(), base_lat: baseLat, base_lng: baseLng,
      coverage_radius: radius, work_days: selectedDays, work_start: workStart, work_end: workEnd,
      requires_transport_verification: radius > 2,
      vehicle_type_own: vehicleType || null, vehicle_photo_url: vehiclePhotoUrl || null,
      vehicle_plate: vehiclePlate.trim().toUpperCase() || null,
    }, 4)
  }

  const handleStep4 = async () => {
    if (!kitPhotoUrl) { setError('Sube la foto de tu kit de materiales.'); return }
    await saveStep({ kit_photo_url: kitPhotoUrl }, 5)
  }

  const handleStep5 = async () => {
    if (!termsAccepted) { setError('Debes aceptar el contrato.'); return }
    if (!signature)     { setError('Por favor firma el contrato.'); return }
    setSaving(true); setError('')
    try {
      setUploadingSignature(true)
      let signatureUrl = null
      try { signatureUrl = await uploadSignature({ base64DataUrl: signature, userId: user.id }) }
      catch (sigErr) { console.warn('No se pudo subir la firma:', sigErr.message) }
      finally { setUploadingSignature(false) }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const token = getTokenFromStorage()
      const profileData = {
        experience_years: experienceYears ? parseInt(experienceYears) : null,
        experience_notes: experienceNotes.trim() || null,
        terms_accepted_at: new Date().toISOString(),
        signature_url: signatureUrl || null,
        operator_status: 'pendiente',
        onboarding_done: true,
        onboarding_step: 6,
        updated_at: new Date().toISOString(),
      }
      const res = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(profileData),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      try { await loadProfileDirect() } catch {}
      Analytics.onboardingComplete()
      setStep(6); setSubStep(1)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  // ── Configuración de pasos ────────────────────────────────────────────────
  // Paso 2 Identidad: 5 subs (INE frente, reverso, selfie, comprobante, video)
  // Paso 3 Zona: 2 subs base + 1 extra si radio > 2 km
  const STEPS = [
    { n: 1, label: 'Datos',      icon: '👤', subs: 1 },
    { n: 2, label: 'Identidad',  icon: '🪪', subs: 4 },
    { n: 3, label: 'Zona',       icon: '📍', subs: radius > 2 ? 3 : 2 },
    { n: 4, label: 'Materiales', icon: '🧴', subs: 1 },
    { n: 5, label: 'Contrato',   icon: '📋', subs: 2 },
  ]

  const currentStepCfg = STEPS.find(s => s.n === step)
  const totalSubs  = currentStepCfg?.subs || 1
  const progressPct = step <= 5 ? Math.round(((step - 1) / 5 + (subStep / (totalSubs * 5))) * 100) : 100

  const NavButtons = ({ onBack, onNext, nextLabel = 'Continuar →', nextDisabled = false, nextColor = '#3b82f6' }) => (
    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
      {onBack && <button onClick={onBack} style={{ flex: 1, padding: '13px 0', background: '#f3f4f6', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 52 }}>← Atrás</button>}
      <button onClick={onNext} disabled={nextDisabled || saving}
        style={{ flex: 2, padding: '13px 0', background: nextDisabled || saving ? '#9ca3af' : nextColor, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: nextDisabled || saving ? 'not-allowed' : 'pointer', minHeight: 52 }}>
        {saving ? (uploadingSignature ? '⏳ Subiendo firma...' : '⏳ Guardando...') : nextLabel}
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: isMobile ? '16px 12px 80px' : '32px 16px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💧</div>
          <h1 style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: '#1f2937', margin: '0 0 4px' }}>Registro de Operador</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Este proceso toma aproximadamente <strong>~8 minutos</strong></p>
        </div>

        {/* Barra de progreso */}
        {step >= 1 && step <= 5 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              {STEPS.map((s, i) => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: step > s.n ? '#10b981' : step === s.n ? '#3b82f6' : '#e5e7eb', color: step >= s.n ? '#fff' : '#9ca3af', fontWeight: 700 }}>
                      {step > s.n ? '✓' : s.icon}
                    </div>
                    <span style={{ fontSize: 9, color: step >= s.n ? '#1f2937' : '#9ca3af', fontWeight: step === s.n ? 700 : 400 }}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div style={{ flex: 1, height: 3, background: step > s.n ? '#10b981' : '#e5e7eb', margin: '0 3px', marginBottom: 18, borderRadius: 4 }} />}
                </div>
              ))}
            </div>
            <div style={{ height: 6, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg,#3b82f6,#10b981)', borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#6b7280' }}>Paso {step} de 5 — {currentStepCfg?.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>{progressPct}%</span>
            </div>
            {totalSubs > 1 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                {Array.from({ length: totalSubs }).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 3, borderRadius: 4, background: subStep > i + 1 ? '#10b981' : subStep === i + 1 ? '#3b82f6' : '#e5e7eb' }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ PASO 0 — Bienvenida ════ */}
        {step === 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>📋</div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1f2937', margin: '0 0 8px' }}>Antes de comenzar</h2>
              <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>Ten a la mano los siguientes documentos y materiales. El proceso toma aproximadamente <strong>~8 minutos</strong>.</p>
            </div>

            {/* Mensaje motivacional */}
            <div style={{ background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)', border: '1.5px solid #bfdbfe', borderRadius: 12, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', margin: '0 0 4px' }}>🚀 ¡Estás a minutos de empezar a ganar!</p>
              <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.5 }}>Únete a la comunidad MAZ CLEAN y genera ingresos en tu zona de trabajo.</p>
            </div>

            <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
              {[
                {
                  icon: '🪪',
                  iconBg: '#eff6ff',
                  iconColor: '#3b82f6',
                  title: 'Identificación oficial',
                  desc: 'INE o licencia de conducir — frente y reverso',
                },
                {
                  icon: '📄',
                  iconBg: '#f0fdf4',
                  iconColor: '#10b981',
                  title: 'Comprobante de domicilio',
                  desc: 'Recibo de luz, agua o internet — máximo 3 meses de antigüedad',
                },
                {
                  icon: '🧴',
                  iconBg: '#faf5ff',
                  iconColor: '#7c3aed',
                  title: 'Kit de materiales',
                  desc: 'Shampoo pH neutro, waterless + atomizador, microfibras por color, brocha de detailing, cubeta doble balde, aspiradora portátil, antibacterial y limpiador de cristales.',
                  extra: '💰 Inversión estimada: $400–$800 MXN — muy probablemente ya tienes varios artículos en casa, por lo que tu inversión real puede ser mucho menor.',
                },
                {
                  icon: '🚗🏍️🚲',
                  iconBg: '#fffbeb',
                  iconColor: '#d97706',
                  title: 'Datos de tu vehículo',
                  desc: '🚗 Vehículo propio — Solamente aplica si tu zona supera 2 km de radio. Puede ser bicicleta, moto o auto según tus distancias.',
                  highlight: true,
                },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: '#f9fafb', borderRadius: 12, padding: '12px 14px', border: `1px solid ${item.highlight ? '#fde68a' : '#e5e7eb'}` }}>
                  {/* Ícono con fondo de color */}
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: item.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: item.icon.length > 2 ? 13 : 20, flexShrink: 0 }}>
                    {item.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937', marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{item.desc}</div>
                    {item.extra && (
                      <div style={{ fontSize: 12, color: '#065f46', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 10px', marginTop: 6, lineHeight: 1.5 }}>
                        {item.extra}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, color: '#1e40af', margin: 0, lineHeight: 1.5 }}>💡 <strong>Consejo:</strong> Prepara todos los documentos antes de iniciar para completar el registro sin interrupciones.</p>
            </div>

            {profile?.operator_status === 'aprobado' ? (
              <button onClick={onComplete} style={{ width: '100%', padding: '15px 0', background: '#10b981', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
                Ir al Panel de Operador →
              </button>
            ) : (
              <button onClick={() => setStep(1)} style={{ width: '100%', padding: '15px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
                ✅ Estoy listo — Comenzar registro
              </button>
            )}
          </div>
        )}

        {/* ════ PASO 1 — Datos personales ════ */}
        {step === 1 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>👤 Datos personales</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>Confirma tu información básica.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lbl}>Nombre completo *</label>
                <input style={inp} placeholder="Ej: Juan Alberto Mazariegos" value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Teléfono celular (10 dígitos) *</label>
                <input style={inp} placeholder="Ej: 5512345678" type="tel" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,''))} />
                <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>Solo los 10 dígitos, sin código de país</p>
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 13, color: '#166534', margin: 0, lineHeight: 1.5 }}>📱 Usaremos este teléfono para coordinar servicios y enviarte notificaciones por WhatsApp.</p>
              </div>
            </div>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
            <NavButtons onNext={handleStep1} />
          </div>
        )}

        {/* ════ PASO 2 — Identidad completa (5 sub-pasos) ════ */}
        {step === 2 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

            {/* Sub 1: INE Frente */}
            {subStep === 1 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🪪 INE — Frente</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Foto clara del frente de tu INE o licencia de conducir.</p>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  {['Foto legible sin reflejos ni sombras','Todos los datos visibles','No recortada ni doblada'].map(r => <div key={r} style={{ fontSize: 12, color: '#1e40af', marginBottom: 3 }}>• {r}</div>)}
                </div>
                <PhotoUpload label="INE Frente" icon="🪪" value={ineFrontUrl} onChange={setIneFrontUrl} capture="environment" disabled={!canEdit('ine_front_url')} />
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={() => goStepSafe(1)} onNext={() => { if (!ineFrontUrl) { setError('Sube el frente de tu INE.'); return } nextSub() }} />
              </>
            )}

            {/* Sub 2: INE Reverso */}
            {subStep === 2 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🪪 INE — Reverso</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Ahora el reverso de tu INE o licencia.</p>
                <PhotoUpload label="INE Reverso" hint="Asegúrate que el código de barras sea visible." icon="🪪" value={ineBackUrl} onChange={setIneBackUrl} capture="environment" disabled={!canEdit('ine_back_url')} />
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={() => { if (!ineBackUrl) { setError('Sube el reverso de tu INE.'); return } nextSub() }} />
              </>
            )}

            {/* Sub 3: Selfie */}
            {subStep === 3 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🤳 Selfie con tu INE</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Tómate una foto sosteniendo tu INE junto a tu cara.</p>
                <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  {['Sostén tu INE con la foto hacia la cámara','Tu cara y el INE deben verse claramente','Buena iluminación, sin filtros ni lentes de sol'].map(r => <div key={r} style={{ fontSize: 12, color: '#854d0e', marginBottom: 3 }}>• {r}</div>)}
                </div>
                <PhotoUpload label="Selfie con INE" icon="🤳" value={selfieIdUrl} onChange={setSelfieIdUrl} capture="user" disabled={!canEdit('selfie_with_id_url')} />
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={() => { if (!selfieIdUrl) { setError('Sube tu selfie con el INE.'); return } nextSub() }} />
              </>
            )}

            {/* Sub 4: Comprobante de domicilio */}
            {subStep === 4 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>📄 Comprobante de domicilio</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Confirma dónde vives con un recibo reciente.</p>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  {['Recibo de luz, agua, internet o estado de cuenta','Máximo 3 meses de antigüedad','JPG, PNG o PDF — máximo 15 MB'].map(r => <div key={r} style={{ fontSize: 12, color: '#1e40af', marginBottom: 3 }}>• {r}</div>)}
                </div>
                <PhotoUpload label="Comprobante de domicilio" icon="📄" value={proofAddressUrl} onChange={setProofAddressUrl} accept="image/*,.pdf" maxMB={15} disabled={!canEdit('proof_of_address_url')} />
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={() => { if (!proofAddressUrl) { setError('Sube tu comprobante de domicilio.'); return } handleStep2() }} nextLabel="Guardar y continuar →" nextColor="#10b981" />
              </>
            )}

            </div>
        )}

        {/* ════ PASO 3 — Zona de trabajo ════ */}
        {step === 3 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

            {/* Sub 1: Punto de partida + radio en la misma pantalla */}
            {subStep === 1 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🏠 Tu zona de trabajo</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px' }}>Define desde dónde saldrás y qué tan lejos quieres atender.</p>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 12, color: '#1e40af', margin: 0, lineHeight: 1.5 }}>💡 No tiene que ser tu domicilio — puede ser desde donde tú decidas partir: tu colonia, tu trabajo, donde te sea más práctico.</p>
                </div>

                {/* Dirección */}
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Punto de partida *</label>
                  <textarea style={{ ...inp, height: 80, resize: 'vertical', fontSize: 14 }}
                    placeholder="Ej: Colonia Roma Norte, Cuauhtémoc, CDMX"
                    value={baseAddress}
                    onChange={e => { setBaseAddress(e.target.value); setBaseLat(null); setBaseLng(null); setZonaConfirmada(false); setGeocodeError('') }} />

                  <button onClick={handleGeocodeAddress} disabled={geocodeLoading || !baseAddress.trim()}
                    style={{ marginTop: 8, width: '100%', padding: '12px 0', background: geocodeLoading ? '#f3f4f6' : !baseAddress.trim() ? '#f3f4f6' : '#3b82f6', border: 'none', borderRadius: 10, color: geocodeLoading || !baseAddress.trim() ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 600, cursor: geocodeLoading || !baseAddress.trim() ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 }}>
                    {geocodeLoading ? <><div style={{ width: 16, height: 16, border: '2px solid #bfdbfe', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Buscando...</> : <>🔍 Confirmar en el mapa</>}
                  </button>
                  {geocodeError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginTop: 8, color: '#dc2626', fontSize: 13 }}>⚠️ {geocodeError}</div>}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
                    <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} /><span style={{ fontSize: 12, color: '#9ca3af' }}>o</span><div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  </div>

                  <button onClick={handleGeolocate} disabled={geoLoading}
                    style={{ width: '100%', padding: '12px 0', background: geoLoading ? '#f3f4f6' : '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, color: geoLoading ? '#9ca3af' : '#1e40af', fontSize: 14, fontWeight: 600, cursor: geoLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 }}>
                    {geoLoading ? <><div style={{ width: 16, height: 16, border: '2px solid #bfdbfe', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Obteniendo ubicación...</> : <>📡 Usar mi ubicación actual</>}
                  </button>
                  {geoError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginTop: 8, color: '#dc2626', fontSize: 13 }}>⚠️ {geoError}</div>}

                  {baseLat && baseLng && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>✅</span><span style={{ fontSize: 12, color: '#166534' }}>Ubicación registrada: {Number(baseLat).toFixed(4)}, {Number(baseLng).toFixed(4)}</span>
                    </div>
                  )}
                </div>

                {/* Radio de cobertura — en la misma pantalla */}
                <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16, marginTop: 4 }}>
                  <label style={lbl}>
                    Radio de cobertura: <strong style={{ color: '#3b82f6' }}>{radius} km</strong>
                    {radius > 2 && <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 8, fontWeight: 600 }}>⚠️ Requiere transporte propio</span>}
                  </label>
                  <input type="range" min={1} max={20} value={radius} onChange={e => { setRadius(Number(e.target.value)); setZonaConfirmada(false) }} style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer', marginBottom: 4 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af' }}>
                    <span>1 km (a pie)</span><span>20 km (máximo)</span>
                  </div>
                  {radius > 2 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginTop: 10 }}>
                      <p style={{ fontSize: 13, color: '#92400e', margin: 0, lineHeight: 1.5 }}>🚗 Radio mayor a 2 km desde tu zona de trabajo elegida — deberás indicar tu medio de transporte propio.</p>
                    </div>
                  )}
                </div>

                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 12, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}

                <NavButtons onBack={() => goStepSafe(2)} onNext={() => {
                  if (!baseAddress.trim()) { setError('Ingresa tu punto de partida.'); return }
                  if (!baseLat || !baseLng) { setError('Confirma tu dirección en el mapa o usa tu ubicación actual.'); return }
                  nextSub()
                }} nextLabel="Ver mi zona en el mapa →" />
              </>
            )}

            {/* Sub 2: Mapa Google Maps con zona marcada */}
            {subStep === 2 && baseLat && baseLng && (
              <MapaZona
                lat={baseLat}
                lng={baseLng}
                radius={radius}
                onConfirm={() => {
                  setZonaConfirmada(true)
                  if (radius > 2) nextSub()
                  else {
                    // Continuar directamente a horarios (siguiente pantalla)
                    setSubStep(3)
                  }
                }}
                onBack={prevSub}
              />
            )}

            {/* Sub 3: Días y horario (siempre) + Transporte si radio > 2 */}
            {subStep === 3 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🗓️ Días y horario</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px' }}>¿Cuándo estás disponible para atender servicios?</p>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 12, color: '#065f46', margin: 0, lineHeight: 1.6 }}>
                    💡 <strong>No te preocupes si cambia tu disponibilidad.</strong> Podrás modificar tus días y horario desde tu panel en cualquier momento.
                  </p>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={lbl}>Días disponibles *</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {DIAS.map(d => (
                      <button key={d} onClick={() => toggleDay(d)}
                        style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: selectedDays.includes(d) ? '#10b981' : '#f3f4f6', color: selectedDays.includes(d) ? '#fff' : '#374151', minHeight: 36, textTransform: 'capitalize' }}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Hora inicio *</label>
                    <input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)} style={inp} />
                    <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>⏰ Primer servicio del día</p>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Hora cierre *</label>
                    <input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)} style={inp} />
                    <p style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 0' }}>🏁 Último servicio aceptado</p>
                  </div>
                </div>

                {/* Transporte — solo si radius > 2 */}
                {radius > 2 && (
                  <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16, marginTop: 4 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🚗 Tu medio de transporte</h3>
                    <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 8px' }}>Tu zona supera los 2 km — necesitamos verificar tu transporte.</p>
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                      <p style={{ fontSize: 12, color: '#1e40af', margin: 0, lineHeight: 1.5 }}>📍 La distancia se mide desde tu <strong>punto de partida</strong> hasta el centro de tu <strong>zona de trabajo elegida</strong>.</p>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={lbl}>Tipo de transporte *</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {[
                          { value: 'auto',               label: '🚗 Automóvil' },
                          { value: 'motocicleta',         label: '🏍️ Motocicleta' },
                          { value: 'camioneta',           label: '🚐 Camioneta' },
                          { value: 'bicicleta',           label: '🚲 Bicicleta' },
                          { value: 'bicicleta_electrica', label: '⚡ Bici eléctrica' },
                        ].map(opt => (
                          <button key={opt.value} onClick={() => setVehicleType(opt.value)}
                            style={{ padding: '10px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: vehicleType === opt.value ? '#3b82f6' : '#f3f4f6', color: vehicleType === opt.value ? '#fff' : '#374151', minHeight: 40 }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <PhotoUpload label="Foto del vehículo" hint="La placa debe ser legible en la fotografía." icon="🚗" value={vehiclePhotoUrl} onChange={setVehiclePhotoUrl} capture="environment" disabled={!canEdit('vehicle_photo_url')} />
                    <div style={{ marginBottom: 8 }}>
                      <label style={lbl}>Número de placa *</label>
                      <input style={{ ...inp, textTransform: 'uppercase', fontFamily: 'monospace', background: !canEdit('vehicle_photo_url') ? '#f3f4f6' : '#fff' }}
                        placeholder="Ej: ABC-123-D" value={vehiclePlate}
                        onChange={e => { if(canEdit('vehicle_photo_url')) setVehiclePlate(e.target.value.toUpperCase()) }}
                        disabled={!canEdit('vehicle_photo_url')} maxLength={10} />
                    </div>
                  </div>
                )}

                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={handleStep3} nextLabel="Guardar y continuar →" nextColor="#10b981" />
              </>
            )}
          </div>
        )}

        {/* ════ PASO 4 — Materiales ════ */}
        {step === 4 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🧴 Kit de materiales</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Sube una foto de tu kit completo para verificar que tienes todo lo necesario.</p>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', margin: '0 0 8px' }}>✅ Materiales obligatorios:</p>
              {['Shampoo pH neutro para autos','Producto waterless (lavado en seco) + atomizador','Microfibras por color: azul (carrocería), negro (rines), gris (interiores)','Brocha de detailing (para rejillas y emblemas)','Cubeta de doble balde','Aspiradora portátil','Producto antibacterial (spray)','Limpiador de cristales base agua'].map(m => (
                <div key={m} style={{ fontSize: 13, color: '#1e40af', marginBottom: 4 }}>• {m}</div>
              ))}
              <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 0', fontStyle: 'italic' }}>Recomendado: producto base agua para tablero y plásticos interiores</p>
            </div>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, color: '#065f46', margin: 0, lineHeight: 1.6 }}>
                💰 <strong>Inversión estimada: $400–$800 MXN</strong> — muy probablemente ya tienes varios artículos en casa (shampoo, microfibras, cubeta), por lo que tu inversión real puede ser mucho menor.
              </p>
            </div>
            <PhotoUpload label="Foto del kit" hint="Coloca todos los materiales visibles en la foto." icon="📦" value={kitPhotoUrl} onChange={setKitPhotoUrl} capture="environment" disabled={!canEdit('kit_photo_url')} />
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
            <NavButtons onBack={() => goStepSafe(3)} onNext={handleStep4} nextLabel="Guardar y continuar →" nextColor="#10b981" />
          </div>
        )}

        {/* ════ PASO 5 — Contrato ════ */}
        {step === 5 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            {subStep === 1 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>📋 Tu experiencia</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>Cuéntanos un poco sobre ti.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
                  <div>
                    <label style={lbl}>¿Cuántos años de experiencia en lavado de autos?</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {[{ value: '0', label: 'Sin experiencia' }, { value: '1', label: 'Menos de 1 año' }, { value: '2', label: '1-3 años' }, { value: '5', label: '3-5 años' }, { value: '6', label: 'Más de 5 años' }].map(opt => (
                        <button key={opt.value} onClick={() => setExperienceYears(opt.value)}
                          style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: experienceYears === opt.value ? '#3b82f6' : '#f3f4f6', color: experienceYears === opt.value ? '#fff' : '#374151', minHeight: 36 }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Cuéntanos sobre tu experiencia (opcional)</label>
                    <textarea style={{ ...inp, height: 90, resize: 'vertical', fontSize: 14 }}
                      placeholder="Ej: Trabajé 2 años en un autolavado..."
                      value={experienceNotes} onChange={e => setExperienceNotes(e.target.value)} maxLength={500} />
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0', textAlign: 'right' }}>{experienceNotes.length}/500</p>
                  </div>
                </div>
                <NavButtons onBack={() => goStepSafe(4)} onNext={nextSub} />
              </>
            )}
            {subStep === 2 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>📋 Contrato de Operador</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Lee el contrato con tus datos y fírmalo digitalmente.</p>
                <div style={{ background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '16px 18px', marginBottom: 16, maxHeight: 320, overflowY: 'auto', fontSize: 13, color: '#374151', lineHeight: 1.7 }}>
                  <div style={{ textAlign: 'center', marginBottom: 14 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#1a3a6e' }}>💧 MAZ CLEAN</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', marginTop: 6 }}>CONTRATO DE ACCESO A PLATAFORMA Y PRESTACIÓN DE SERVICIOS INDEPENDIENTES</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Operador de Estética Automotriz · Versión 1.0</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Fecha: {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  </div>
                  <p><strong>I. PARTES.</strong> MAZ CLEAN, plataforma digital operada por <strong>Juan Alberto Mazariegos Fernandez</strong> (en adelante "MAZ CLEAN" o "la Plataforma"), y <strong>{profile?.full_name || fullName}</strong> (en adelante "el Operador").</p>
                  <p><strong>II. OBJETO.</strong> El presente contrato regula los términos bajo los cuales el Operador accede a la plataforma tecnológica MAZ CLEAN para ofrecer servicios de estética automotriz a domicilio de manera <strong>independiente</strong>, sin que exista relación laboral alguna con MAZ CLEAN. MAZ CLEAN actúa exclusivamente como intermediario tecnológico.</p>
                  <p><strong>III. MEMBRESÍA.</strong> Para acceder a la plataforma, el Operador pagará una <strong>membresía semanal de ${membershipConfig?.operator_price || 50} MXN</strong>, renovable automáticamente cada 7 días desde la fecha de activación. Este monto podrá modificarse con al menos 7 días de anticipación. La membresía no garantiza un número mínimo de servicios.</p>
                  <p><strong>IV. COMISIONES POR SERVICIO.</strong> MAZ CLEAN aplica una comisión sobre el precio total de cada servicio finalizado, conforme al nivel de calificación del Operador: <strong>Operador (0–3.9 ⭐) 10% · Pro (4.0–4.4 ⭐) 9% · Pro+ (4.5–4.7 ⭐) 8% · Elite (4.8–5.0 ⭐) 7%</strong>. Dicha comisión se acumula durante el ciclo de 7 días del Operador y se suma a la membresía en la fecha de renovación. MAZ CLEAN podrá modificar estos porcentajes notificando al Operador con mínimo <strong>7 días naturales de anticipación</strong>. El nivel de calificación se calcula sobre los últimos 7 días y se actualiza automáticamente.</p>
                  <p><strong>V. PRECIOS.</strong> Los precios de cada servicio son establecidos exclusivamente por MAZ CLEAN. El Operador se compromete a respetar los precios publicados en la App.</p>
                  <p><strong>VI. ZONA Y DISPONIBILIDAD.</strong> El Operador declara una zona de cobertura de <strong>{profile?.coverage_radius || radius} km</strong> desde <strong>{profile?.base_address || baseAddress}</strong>, con disponibilidad los días <strong>{(profile?.work_days || selectedDays).join(', ')}</strong> en horario de <strong>{profile?.work_start || workStart}</strong> a <strong>{profile?.work_end || workEnd}</strong> hrs. No existe exclusividad de zona.</p>
                  <p><strong>VII. OBLIGACIONES.</strong> Mantener membresía y kit de materiales activos. Presentarse puntualmente. Tratar a clientes con respeto. Usar la App durante todo el servicio (fotos obligatorias). No contactar clientes fuera de la plataforma. Notificar cancelaciones con mínimo 2 horas de anticipación.</p>
                  <p><strong>VIII. CANCELACIONES Y PENALIZACIONES.</strong> Las cancelaciones injustificadas resultarán en reducción de calificación: primera cancelación −0.5 puntos; segunda en 30 días −1.0 punto y suspensión 48 horas; tercera en 30 días, revisión y posible suspensión definitiva. Calificación sostenida menor a 3.5 estrellas podrá resultar en suspensión temporal.</p>
                  <p><strong>IX. RESPONSABILIDAD.</strong> El Operador presta sus servicios de forma independiente y bajo su propia responsabilidad. MAZ CLEAN no responde por daños a vehículos u objetos durante el servicio. Ante reclamaciones, MAZ CLEAN actuará como mediador.</p>
                  <p><strong>X. VERACIDAD DE LA INFORMACIÓN.</strong> El Operador manifiesta bajo protesta de decir verdad que toda la información, documentación y datos personales o profesionales proporcionados a MAZ CLEAN son completos y verídicos. Se obliga a mantener actualizados dichos datos y a notificar oportunamente cualquier modificación. En caso de detectarse falsedad, omisión o inexactitud, MAZ CLEAN podrá dar por terminado el contrato de manera inmediata sin responsabilidad alguna, reservándose el derecho de ejercer las acciones legales correspondientes.</p>
                  <p><strong>XI. VIGENCIA.</strong> Vigencia indefinida. Puede rescindirse por el Operador cancelando su membresía sin penalización, o por MAZ CLEAN por incumplimiento grave, conducta inapropiada, información falsa o calificación sostenidamente baja.</p>
                  <p><strong>XII. PROTECCIÓN DE DATOS.</strong> Los datos del Operador son tratados conforme a la LFPDPPP. MAZ CLEAN no comparte datos personales con terceros sin consentimiento, salvo requerimiento de autoridad competente.</p>
                  <p style={{ fontSize: 12, color: '#6b7280', marginTop: 8, fontStyle: 'italic' }}>Al firmar digitalmente este contrato, el Operador declara haber leído, entendido y aceptado íntegramente los términos aquí establecidos.</p>
                </div>

                <div style={{ background: termsAccepted ? '#f0fdf4' : '#f9fafb', border: `1.5px solid ${termsAccepted ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <button onClick={() => setTermsAccepted(!termsAccepted)}
                      style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${termsAccepted ? '#10b981' : '#d1d5db'}`, background: termsAccepted ? '#10b981' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      {termsAccepted && <span style={{ color: '#fff', fontSize: 14 }}>✓</span>}
                    </button>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 4 }}>He leído y acepto el contrato <span style={{ color: '#ef4444' }}>*</span></div>
                      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>Declaro que toda la información es verídica y acepto los términos establecidos.</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...lbl, marginBottom: 10 }}>✍️ Firma digital <span style={{ color: '#ef4444' }}>*</span></label>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px' }}>Dibuja tu firma con el dedo o con el mouse en el área de abajo.</p>
                  <SignaturePad onSign={setSignature} signed={!!signature} />
                  {signature && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>✅</span><span style={{ fontSize: 12, color: '#166534' }}>Firma registrada — se guardará al enviar</span>
                    </div>
                  )}
                </div>

                {uploadingSignature && (
                  <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 16, height: 16, border: '2px solid #bfdbfe', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>Subiendo firma digital...</span>
                  </div>
                )}
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: '#1e40af', margin: 0, lineHeight: 1.5 }}>🔍 Tu solicitud será revisada en máximo <strong>4 horas hábiles</strong>. Recibirás una notificación por WhatsApp.</p>
                </div>
                <NavButtons onBack={prevSub} onNext={handleStep5} nextLabel="✅ Enviar para revisión" nextColor="#10b981" nextDisabled={!termsAccepted || !signature} />
              </>
            )}
          </div>
        )}

        {/* ════ PASO 6 — Estado final ════ */}
        {step >= 6 && (() => {
          const status  = profile?.operator_status
          const rejDocs = Array.isArray(profile?.rejected_documents) ? profile.rejected_documents : []
          const pendingDocs = rejDocs.filter(d => d.status !== 'corregido')

          if (status === 'docs_requeridos' && pendingDocs.length > 0) {
            const DOC_LOCATION = {
              ine_front_url:           { step: 2, subStep: 1 },
              ine_back_url:            { step: 2, subStep: 2 },
              selfie_with_id_url:      { step: 2, subStep: 3 },
              proof_of_address_url:    { step: 2, subStep: 4 },
              // proof_of_life_video_url: verificación post-aprobación
              vehicle_photo_url:       { step: 3, subStep: 3 },
              kit_photo_url:           { step: 4, subStep: 1 },
              terms_accepted_at:       { step: 5, subStep: 2 },
            }
            const handleCorrect = () => {
              const locations = pendingDocs.map(d => DOC_LOCATION[d.key] || { step: d.step || 1, subStep: 1 })
              const earliest  = locations.reduce((min, loc) => loc.step < min.step || (loc.step === min.step && loc.subStep < min.subStep) ? loc : min, locations[0])
              setStep(earliest.step); setSubStep(earliest.subStep); setError('')
            }
            return (
              <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '24px 16px' : 36, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                  <div style={{ fontSize: 52, marginBottom: 12 }}>⚠️</div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, color: '#dc2626', margin: '0 0 8px' }}>Documentos a corregir</h2>
                  <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.6 }}>El administrador revisó tu solicitud y necesita que corrijas los siguientes documentos.</p>
                </div>
                <div style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
                  {pendingDocs.map((doc, i) => (
                    <div key={i} style={{ background: '#fef2f2', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #fecaca', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <span style={{ fontSize: 24, flexShrink: 0 }}>{doc.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 2 }}>{doc.label}</div>
                        {doc.reason && <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{doc.reason}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
                  <p style={{ fontSize: 13, color: '#1e40af', margin: 0, lineHeight: 1.5 }}>💡 <strong>Solo necesitas corregir los documentos marcados arriba.</strong> Tu demás información está guardada.</p>
                </div>
                <button onClick={handleCorrect} style={{ width: '100%', padding: '15px 0', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
                  ✏️ Corregir documentos →
                </button>
              </div>
            )
          }

          if (status === 'aprobado') {
            return (
              <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '28px 20px' : 40, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#166534', margin: '0 0 12px' }}>¡Cuenta aprobada!</h2>
                <p style={{ fontSize: 15, color: '#374151', margin: '0 0 24px', lineHeight: 1.6 }}>Ya puedes recibir servicios en la app.</p>
                <button onClick={onComplete} style={{ width: '100%', padding: '15px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
                  Ir al Panel de Operador →
                </button>
              </div>
            )
          }

          if (status === 'rechazado') {
            return (
              <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '28px 20px' : 40, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                <div style={{ fontSize: 64, marginBottom: 16 }}>❌</div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#dc2626', margin: '0 0 12px' }}>Solicitud rechazada</h2>
                <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>{profile?.rejection_reason || 'Tu solicitud no cumplió con los requisitos.'}</p>
                <button onClick={() => goStep(1)} style={{ width: '100%', padding: '14px 0', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
                  🔄 Corregir y reenviar
                </button>
              </div>
            )
          }

          return (
            <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '28px 20px' : 40, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
              <div style={{ fontSize: 64, marginBottom: 16 }}>📋</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1f2937', margin: '0 0 12px' }}>¡Solicitud enviada!</h2>
              <p style={{ fontSize: 15, color: '#374151', margin: '0 0 8px', lineHeight: 1.6 }}>Tu registro está siendo revisado por nuestro equipo.</p>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>Recibirás una notificación en máximo <strong>4 horas hábiles</strong>.</p>
              <div style={{ background: '#f9fafb', borderRadius: 12, padding: '16px 20px', textAlign: 'left' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 12px' }}>📋 Estado de tu solicitud:</p>
                {[
                  { label: 'Datos personales',          done: !!profile?.full_name },
                  { label: 'INE frente y reverso',       done: !!profile?.ine_front_url && !!profile?.ine_back_url },
                  { label: 'Selfie con INE',             done: !!profile?.selfie_with_id_url },
                  { label: 'Comprobante de domicilio',   done: !!profile?.proof_of_address_url },
                  { label: 'Zona de trabajo',            done: !!profile?.base_address },
                  { label: 'Kit de materiales',          done: !!profile?.kit_photo_url },
                  { label: 'Contrato firmado',           done: !!profile?.terms_accepted_at },
                  { label: 'Firma digital',              done: !!profile?.signature_url },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 14 }}>{item.done ? '✅' : '⏳'}</span>
                    <span style={{ fontSize: 13, color: item.done ? '#166534' : '#9ca3af', fontWeight: item.done ? 600 : 400 }}>{item.label}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: item.done ? '#10b981' : '#d97706', fontWeight: 600 }}>{item.done ? 'Entregado' : 'Pendiente'}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

      </div>
      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  )
}
