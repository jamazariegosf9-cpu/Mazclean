import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'

const DIAS   = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo']
const BANCOS = ['BBVA','Banamex','Santander','Banorte','HSBC','Inbursa','Scotiabank','Afirme','BanBajio','Azteca','Otro']

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

async function compressForMobile(file) {
  if (file.size < 500 * 1024) return file
  const MAX = 1000; const QUALITY = 0.78; const TIMEOUT = 5000
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const bitmap = await Promise.race([
        createImageBitmap(file),
        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT)),
      ])
      let w = bitmap.width, h = bitmap.height
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX }
        else       { w = Math.round(w * MAX / h); h = MAX }
      }
      const oc = new OffscreenCanvas(w, h)
      const ctx = oc.getContext('2d')
      ctx.drawImage(bitmap, 0, 0, w, h)
      bitmap.close()
      const blob = await Promise.race([
        oc.convertToBlob({ type: 'image/jpeg', quality: QUALITY }),
        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT)),
      ])
      if (blob && blob.size > 0) return blob
    } catch { }
  }
  try {
    const blob = await new Promise((resolve) => {
      const safeTimer = setTimeout(() => resolve(file), 10000)
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          try {
            let w = img.width, h = img.height
            if (w > MAX || h > MAX) {
              if (w > h) { h = Math.round(h * MAX / w); w = MAX }
              else       { w = Math.round(w * MAX / h); h = MAX }
            }
            const canvas = document.createElement('canvas')
            canvas.width = w; canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) { clearTimeout(safeTimer); resolve(file); return }
            ctx.drawImage(img, 0, 0, w, h)
            let blobDone = false
            canvas.toBlob((b) => {
              if (blobDone) return
              blobDone = true
              clearTimeout(safeTimer)
              resolve(b && b.size > 0 ? b : file)
            }, 'image/jpeg', QUALITY)
            setTimeout(() => {
              if (!blobDone) { blobDone = true; clearTimeout(safeTimer); resolve(file) }
            }, 5000)
          } catch { clearTimeout(safeTimer); resolve(file) }
        }
        img.onerror = () => { clearTimeout(safeTimer); resolve(file) }
        img.src = e.target.result
      }
      reader.onerror = () => { clearTimeout(safeTimer); resolve(file) }
      reader.readAsDataURL(file)
    })
    return blob
  } catch { return file }
}

const getStorageUrl = (path) => {
  if (!path) return null
  if (path.startsWith('http')) return path
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  return `${supabaseUrl}/storage/v1/object/public/service-photos/${path}`
}

// ── Upload genérico a Supabase Storage ───────────────────────────────────────
async function uploadFile(file, folder, userId, token, onProgress) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const ext  = file.type.includes('video') ? 'mp4' : file.type.includes('pdf') ? 'pdf' : 'jpg'
  const path = `${folder}/${userId}/${folder}_${Date.now()}.${ext}`

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/service-photos/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', supabaseKey)
    xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg')
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.timeout = 120000
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)) }
    xhr.onload    = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText?.substring(0, 120)}`)) }
    xhr.onerror   = () => reject(new Error('Error de red — verifica tu conexión'))
    xhr.ontimeout = () => reject(new Error('Tiempo agotado — señal débil, intenta de nuevo'))
    xhr.send(file)
  })
  return path
}

// ── Componente de upload de foto ─────────────────────────────────────────────
function PhotoUpload({ label, hint, icon, value, onChange, accept = 'image/*', capture, required = true, disabled = false }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [localError, setLocalError] = useState('')

  const handleFile = async (file) => {
    if (!file) return
    setUploading(true); setLocalError(''); setProgress(0)
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('El archivo no debe pesar más de 50MB.')
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY
      const { data: { user } } = await supabase.auth.getUser()
      const folder = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '')
      const fileToUpload = file.type.startsWith('image/') ? await compressForMobile(file) : file
      const path = await uploadFile(fileToUpload, folder, user.id, token, setProgress)
      onChange(path)
    } catch (e) {
      setLocalError(e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }}>
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      {hint && <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 10px', lineHeight: 1.5 }}>{hint}</p>}

      {value ? (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          {accept.includes('video') ? (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>🎥</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Video subido correctamente</div>
                <div style={{ fontSize: 11, color: '#059669' }}>✅ Archivo guardado</div>
              </div>
            </div>
          ) : accept.includes('pdf') || value.includes('.pdf') ? (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>📄</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>Documento subido</div>
                <div style={{ fontSize: 11, color: '#059669' }}>✅ Archivo guardado</div>
              </div>
            </div>
          ) : (
            <img src={getStorageUrl(value)} alt={label}
              style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12, border: '2px solid #bbf7d0' }}
              onError={e => { e.target.style.display = 'none' }} />
          )}
          <span style={{ position: 'absolute', top: 8, right: 8, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20 }}>✅ Guardado</span>
        </div>
      ) : (
        <div style={{ width: '100%', height: 120, background: '#f9fafb', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 10, border: '2px dashed #e5e7eb' }}>
          <span style={{ fontSize: 32 }}>{icon}</span>
          <span style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Sin archivo aún</span>
        </div>
      )}

      {uploading && (
        <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 16, height: 16, border: '2px solid #bfdbfe', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>Subiendo... {progress}%</div>
            <div style={{ height: 4, background: '#bfdbfe', borderRadius: 4, marginTop: 4 }}>
              <div style={{ height: '100%', width: `${progress}%`, background: '#3b82f6', borderRadius: 4, transition: 'width 0.2s' }} />
            </div>
          </div>
        </div>
      )}

      {localError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#dc2626', fontSize: 13 }}>⚠️ {localError}</div>}

      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', borderRadius: 12, background: uploading || disabled ? '#f3f4f6' : '#6366f1', color: uploading || disabled ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 700, cursor: uploading || disabled ? 'not-allowed' : 'pointer', pointerEvents: uploading || disabled ? 'none' : 'auto', minHeight: 50, flexShrink: 0 }}>
        {icon} {value ? 'Cambiar archivo' : 'Seleccionar archivo'}
        <input type="file" accept={accept} capture={capture} style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }} />
      </label>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function OnboardingView({ onComplete }) {
  const { user, profile, updateProfile } = useAuth()
  const isMobile = useIsMobile()

  // Sub-paso: cada paso principal tiene sub-pasos (a, b, c...)
  // step = 1-5, subStep = 1-N
  const [step, setStep]       = useState(profile?.onboarding_step || 1)
  const [subStep, setSubStep] = useState(1)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  // ── Paso 1: Datos personales ─────────────────────────────────────────────
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [phone, setPhone]       = useState(profile?.phone || '')

  // ── Paso 2: Identidad ────────────────────────────────────────────────────
  const [ineFrontUrl, setIneFrontUrl]     = useState(profile?.ine_front_url || '')
  const [ineBackUrl, setIneBackUrl]       = useState(profile?.ine_back_url || '')
  const [selfieIdUrl, setSelfieIdUrl]     = useState(profile?.selfie_with_id_url || '')

  // ── Paso 3: Kit + Vehículo ───────────────────────────────────────────────
  const [kitPhotoUrl, setKitPhotoUrl]     = useState(profile?.kit_photo_url || '')
  const [vehiclePhotoUrl, setVehiclePhotoUrl] = useState(profile?.vehicle_photo_url || '')
  const [vehiclePlate, setVehiclePlate]   = useState(profile?.vehicle_plate || '')
  const [vehicleType, setVehicleType]     = useState(profile?.vehicle_type_own || '')

  // ── Paso 4: Domicilio + Zona ─────────────────────────────────────────────
  const [baseAddress, setBaseAddress]     = useState(profile?.base_address || '')
  const [baseLat, setBaseLat]             = useState(profile?.base_lat || null)
  const [baseLng, setBaseLng]             = useState(profile?.base_lng || null)
  const [geoLoading, setGeoLoading]       = useState(false)
  const [geoError, setGeoError]           = useState('')
  const [proofAddressUrl, setProofAddressUrl] = useState(profile?.proof_of_address_url || '')
  const [proofLifeUrl, setProofLifeUrl]   = useState(profile?.proof_of_life_video_url || '')
  const [radius, setRadius]               = useState(profile?.coverage_radius || 5)
  const [selectedDays, setSelectedDays]   = useState(profile?.work_days || [])
  const [workStart, setWorkStart]         = useState(profile?.work_start?.slice(0, 5) || '08:00')
  const [workEnd, setWorkEnd]             = useState(profile?.work_end?.slice(0, 5) || '18:00')

  // ── Paso 5: Pago + Encuesta + Consentimientos ────────────────────────────
  const [clabe, setClabe]                 = useState('')
  const [clabeHolder, setClabeHolder]     = useState(profile?.clabe_holder || '')
  const [bankName, setBankName]           = useState(profile?.bank_name || '')
  const [clabeError, setClabeError]       = useState('')
  const [experienceYears, setExperienceYears] = useState(profile?.experience_years || '')
  const [experienceNotes, setExperienceNotes] = useState(profile?.experience_notes || '')
  const [bgConsent, setBgConsent]         = useState(profile?.background_check_consent || false)
  const [termsAccepted, setTermsAccepted] = useState(!!profile?.terms_accepted_at)

  useEffect(() => {
    if (profile?.onboarding_step) setStep(profile.onboarding_step)
  }, [profile])

  const inp = { padding: '13px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 50, background: '#fff' }
  const lbl = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block' }

  const saveStep = async (data, next) => {
    setSaving(true); setError('')
    try {
      const { error: e } = await updateProfile({
        ...data,
        onboarding_step: next,
        updated_at: new Date().toISOString(),
      })
      if (e) throw e
      setStep(next)
      setSubStep(1)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const nextSub = () => { setError(''); setSubStep(s => s + 1) }
  const prevSub = () => { setError(''); setSubStep(s => s - 1) }
  const goStep  = (n) => { setStep(n); setSubStep(1); setError('') }

  // ── Handlers por paso ────────────────────────────────────────────────────
  const handleStep1 = async () => {
    if (!fullName.trim()) { setError('El nombre completo es requerido.'); return }
    if (!/^\d{10}$/.test(phone.replace(/\s/g, ''))) { setError('El teléfono debe tener 10 dígitos.'); return }
    await saveStep({ full_name: fullName.trim(), phone: phone.replace(/\s/g, '') }, 2)
  }

  const handleStep2 = async () => {
    if (!ineFrontUrl) { setError('Sube el frente de tu INE.'); return }
    if (!ineBackUrl)  { setError('Sube el reverso de tu INE.'); return }
    if (!selfieIdUrl) { setError('Sube tu selfie sosteniendo el INE.'); return }
    await saveStep({ ine_front_url: ineFrontUrl, ine_back_url: ineBackUrl, selfie_with_id_url: selfieIdUrl }, 3)
  }

  const handleStep3 = async () => {
    if (!kitPhotoUrl)     { setError('Sube la foto de tu kit de materiales.'); return }
    if (!vehiclePhotoUrl) { setError('Sube la foto de tu vehículo.'); return }
    if (!vehiclePlate.trim()) { setError('Ingresa la placa de tu vehículo.'); return }
    await saveStep({ kit_photo_url: kitPhotoUrl, vehicle_photo_url: vehiclePhotoUrl, vehicle_plate: vehiclePlate.trim().toUpperCase(), vehicle_type_own: vehicleType }, 4)
  }

  const handleGeolocate = () => {
    if (!navigator.geolocation) { setGeoError('Tu navegador no soporta geolocalización.'); return }
    setGeoLoading(true); setGeoError('')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude; const lng = pos.coords.longitude
        setBaseLat(lat); setBaseLng(lng)
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
        else setGeoError('No se pudo obtener tu ubicación. Intenta de nuevo.')
      },
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }

  const toggleDay = (d) => setSelectedDays(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])

  const handleStep4 = async () => {
    if (!baseAddress.trim())  { setError('Ingresa tu dirección base.'); return }
    if (!proofAddressUrl)     { setError('Sube tu comprobante de domicilio.'); return }
    if (!proofLifeUrl)        { setError('Sube el video de prueba de vida.'); return }
    if (!selectedDays.length) { setError('Selecciona al menos un día de trabajo.'); return }
    if (workStart >= workEnd) { setError('La hora de inicio debe ser antes del cierre.'); return }
    if (radius > 2 && !vehicleType) { setError('Indica tu tipo de transporte.'); return }
    await saveStep({
      base_address: baseAddress.trim(), base_lat: baseLat, base_lng: baseLng,
      proof_of_address_url: proofAddressUrl, proof_of_life_video_url: proofLifeUrl,
      coverage_radius: radius, coverage_zones: null,
      work_days: selectedDays, work_start: workStart, work_end: workEnd,
      requires_transport_verification: radius > 2,
    }, 5)
  }

  const handleStep5 = async () => {
    const clabeClean = clabe.replace(/\s/g, '')
    if (!clabeClean && !profile?.clabe) { setError('La CLABE es requerida.'); return }
    if (clabeClean && !validarCLABE(clabeClean)) { setClabeError('CLABE inválida. Verifica los 18 dígitos.'); return }
    if (!clabeHolder.trim()) { setError('El nombre del titular es requerido.'); return }
    if (!bankName)           { setError('Selecciona un banco.'); return }
    if (!termsAccepted)      { setError('Debes aceptar los términos y condiciones.'); return }
    const clabeToSave = clabeClean ? '****' + clabeClean.slice(14) : profile?.clabe
    await saveStep({
      clabe: clabeToSave, clabe_holder: clabeHolder.trim(), bank_name: bankName,
      experience_years: experienceYears ? parseInt(experienceYears) : null,
      experience_notes: experienceNotes.trim() || null,
      background_check_consent: bgConsent,
      terms_accepted_at: new Date().toISOString(),
      operator_status: 'pendiente',
      onboarding_done: true,
    }, 6)
  }

  // ── Barra de progreso principal ───────────────────────────────────────────
  const STEPS = [
    { n: 1, label: 'Datos',    icon: '👤', subs: 1 },
    { n: 2, label: 'Identidad',icon: '🪪', subs: 3 },
    { n: 3, label: 'Kit',      icon: '🧴', subs: 2 },
    { n: 4, label: 'Domicilio',icon: '🏠', subs: 4 },
    { n: 5, label: 'Pago',     icon: '💳', subs: 3 },
  ]

  const currentStepConfig = STEPS.find(s => s.n === step)
  const totalSubs  = currentStepConfig?.subs || 1
  const progressPct = Math.round(((step - 1) / 5 + (subStep / (totalSubs * 5))) * 100)

  const NavButtons = ({ onBack, onNext, nextLabel = 'Continuar →', nextDisabled = false, nextColor = '#3b82f6' }) => (
    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
      {onBack && <button onClick={onBack} style={{ flex: 1, padding: '13px 0', background: '#f3f4f6', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 52 }}>← Atrás</button>}
      <button onClick={onNext} disabled={nextDisabled || saving}
        style={{ flex: 2, padding: '13px 0', background: nextDisabled || saving ? '#9ca3af' : nextColor, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: nextDisabled || saving ? 'not-allowed' : 'pointer', minHeight: 52 }}>
        {saving ? '⏳ Guardando...' : nextLabel}
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
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Este proceso toma aproximadamente 10-15 minutos</p>
        </div>

        {/* Barra de progreso */}
        {step <= 5 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              {STEPS.map((s, i) => (
                <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: step > s.n ? '#10b981' : step === s.n ? '#3b82f6' : '#e5e7eb', color: step >= s.n ? '#fff' : '#9ca3af', fontWeight: 700 }}>
                      {step > s.n ? '✓' : s.icon}
                    </div>
                    <span style={{ fontSize: 9, color: step >= s.n ? '#1f2937' : '#9ca3af', fontWeight: step === s.n ? 700 : 400, textAlign: 'center' }}>{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div style={{ flex: 1, height: 3, background: step > s.n ? '#10b981' : '#e5e7eb', margin: '0 3px', marginBottom: 18, borderRadius: 4 }} />}
                </div>
              ))}
            </div>
            {/* Progreso general */}
            <div style={{ height: 6, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg,#3b82f6,#10b981)', borderRadius: 4, transition: 'width 0.4s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 11, color: '#6b7280' }}>Paso {step} de 5 — {currentStepConfig?.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6' }}>{progressPct}%</span>
            </div>
            {/* Sub-pasos */}
            {totalSubs > 1 && (
              <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                {Array.from({ length: totalSubs }).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 3, borderRadius: 4, background: subStep > i + 1 ? '#10b981' : subStep === i + 1 ? '#3b82f6' : '#e5e7eb' }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ PASO 1 — Datos personales ════ */}
        {step === 1 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>👤 Datos personales</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>Confirma o actualiza tu información de contacto.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lbl}>Nombre completo *</label>
                <input style={inp} placeholder="Ej: Juan Alberto Mazariegos" value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Teléfono celular (10 dígitos) *</label>
                <input style={inp} placeholder="Ej: 5512345678" type="tel" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 13, color: '#166534', margin: 0, lineHeight: 1.5 }}>📱 Usaremos este número para coordinar servicios y enviarte notificaciones importantes.</p>
              </div>
            </div>
            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
            <NavButtons onNext={handleStep1} nextLabel="Continuar →" />
          </div>
        )}

        {/* ════ PASO 2 — Identidad ════ */}
        {step === 2 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

            {/* 2a: INE frente */}
            {subStep === 1 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🪪 Identificación oficial — Frente</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Sube una foto clara del frente de tu INE o licencia de conducir.</p>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', margin: '0 0 6px' }}>📋 Requisitos:</p>
                  {['Foto legible, sin reflejos ni sombras', 'Todos los datos visibles', 'No recortada ni doblada', 'JPG o PNG, máximo 15MB'].map(r => (
                    <div key={r} style={{ fontSize: 12, color: '#1e40af', marginBottom: 3 }}>• {r}</div>
                  ))}
                </div>
                <PhotoUpload label="INE Frente" hint="" icon="🪪" value={ineFrontUrl} onChange={setIneFrontUrl} capture="environment" />
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={() => goStep(1)} onNext={() => { if (!ineFrontUrl) { setError('Sube el frente de tu INE.'); return } nextSub() }} />
              </>
            )}

            {/* 2b: INE reverso */}
            {subStep === 2 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🪪 Identificación oficial — Reverso</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Ahora sube el reverso de tu INE o licencia.</p>
                <PhotoUpload label="INE Reverso" hint="Asegúrate que el código de barras y datos sean visibles." icon="🪪" value={ineBackUrl} onChange={setIneBackUrl} capture="environment" />
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={() => { if (!ineBackUrl) { setError('Sube el reverso de tu INE.'); return } nextSub() }} />
              </>
            )}

            {/* 2c: Selfie con INE */}
            {subStep === 3 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🤳 Selfie sosteniendo tu INE</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Tómate una foto sosteniendo tu INE junto a tu cara.</p>
                <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#854d0e', margin: '0 0 6px' }}>📸 Instrucciones:</p>
                  {['Sostén tu INE con la foto hacia la cámara', 'Tu cara y el INE deben verse claramente', 'Buena iluminación, sin filtros', 'No uses lentes de sol'].map(r => (
                    <div key={r} style={{ fontSize: 12, color: '#854d0e', marginBottom: 3 }}>• {r}</div>
                  ))}
                </div>
                <PhotoUpload label="Selfie con INE" hint="" icon="🤳" value={selfieIdUrl} onChange={setSelfieIdUrl} capture="user" />
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={handleStep2} nextLabel="Guardar y continuar →" nextColor="#10b981" />
              </>
            )}
          </div>
        )}

        {/* ════ PASO 3 — Kit + Vehículo ════ */}
        {step === 3 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

            {/* 3a: Kit de materiales */}
            {subStep === 1 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🧴 Kit de materiales</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Sube una foto de tu kit completo para verificar que tienes todo lo necesario.</p>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', margin: '0 0 8px' }}>✅ Materiales obligatorios:</p>
                  {['Shampoo para autos', 'Mínimo 4 microfibras limpias', 'Cubeta de doble balde', 'Aspiradora portátil'].map(m => (
                    <div key={m} style={{ fontSize: 13, color: '#1e40af', marginBottom: 4 }}>• {m}</div>
                  ))}
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '8px 0 0', fontStyle: 'italic' }}>Recomendados: sellador de llantas, agua propia</p>
                </div>
                <PhotoUpload label="Foto del kit" hint="Coloca todos los materiales visibles en la foto." icon="📦" value={kitPhotoUrl} onChange={setKitPhotoUrl} capture="environment" />
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={() => goStep(2)} onNext={() => { if (!kitPhotoUrl) { setError('Sube la foto del kit.'); return } nextSub() }} />
              </>
            )}

            {/* 3b: Vehículo */}
            {subStep === 2 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🚗 Tu vehículo</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Registra el vehículo que usarás para desplazarte a los servicios.</p>
                <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: '#854d0e', margin: 0 }}>📸 La foto debe mostrar claramente la placa del vehículo. Si usas transporte público, toma una foto de tu tarjeta de transporte o sube una foto referencial.</p>
                </div>
                <PhotoUpload label="Foto del vehículo" hint="Asegúrate que la placa sea legible." icon="🚗" value={vehiclePhotoUrl} onChange={setVehiclePhotoUrl} capture="environment" />
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Número de placa *</label>
                  <input style={inp} placeholder="Ej: ABC-123-D" value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value.toUpperCase())} maxLength={10} />
                  <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>Si usas transporte público escribe: "TRANSPORTE PÚBLICO"</p>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={lbl}>Tipo de vehículo</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {[
                      { value: 'auto', label: '🚗 Auto' },
                      { value: 'moto', label: '🏍️ Moto' },
                      { value: 'bicicleta', label: '🚲 Bicicleta' },
                      { value: 'transporte_publico', label: '🚌 Transporte público' },
                      { value: 'otro', label: '🚐 Otro' },
                    ].map(opt => (
                      <button key={opt.value} onClick={() => setVehicleType(opt.value)}
                        style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: vehicleType === opt.value ? '#3b82f6' : '#f3f4f6', color: vehicleType === opt.value ? '#fff' : '#374151', minHeight: 36 }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={handleStep3} nextLabel="Guardar y continuar →" nextColor="#10b981" />
              </>
            )}
          </div>
        )}

        {/* ════ PASO 4 — Domicilio + Zona ════ */}
        {step === 4 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

            {/* 4a: Dirección base */}
            {subStep === 1 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🏠 Tu dirección base</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>¿Desde dónde saldrás a atender los servicios?</p>
                <div style={{ marginBottom: 16 }}>
                  <label style={lbl}>Dirección o colonia de origen *</label>
                  <textarea style={{ ...inp, height: 80, resize: 'vertical', fontSize: 14 }}
                    placeholder="Ej: Colonia Roma Norte, Cuauhtémoc, CDMX"
                    value={baseAddress}
                    onChange={e => { setBaseAddress(e.target.value); setBaseLat(null); setBaseLng(null) }} />
                  <button onClick={handleGeolocate} disabled={geoLoading}
                    style={{ marginTop: 10, width: '100%', padding: '12px 0', background: geoLoading ? '#f3f4f6' : '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, color: geoLoading ? '#9ca3af' : '#1e40af', fontSize: 14, fontWeight: 600, cursor: geoLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48 }}>
                    {geoLoading ? <><div style={{ width: 16, height: 16, border: '2px solid #bfdbfe', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Obteniendo ubicación...</> : <>📡 Usar mi ubicación actual</>}
                  </button>
                  {geoError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginTop: 8, color: '#dc2626', fontSize: 13 }}>⚠️ {geoError}</div>}
                  {baseLat && baseLng && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>✅</span>
                      <span style={{ fontSize: 12, color: '#166534' }}>Ubicación registrada: {Number(baseLat).toFixed(4)}, {Number(baseLng).toFixed(4)}</span>
                    </div>
                  )}
                </div>
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={() => goStep(3)} onNext={() => { if (!baseAddress.trim()) { setError('Ingresa tu dirección.'); return } nextSub() }} />
              </>
            )}

            {/* 4b: Comprobante de domicilio */}
            {subStep === 2 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>📄 Comprobante de domicilio</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Sube un comprobante reciente que confirme tu dirección declarada.</p>
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', margin: '0 0 6px' }}>📋 Documentos aceptados (máximo 3 meses de antigüedad):</p>
                  {['Recibo de luz (CFE)', 'Recibo de agua', 'Recibo de internet / teléfono', 'Estado de cuenta bancario', 'Recibo de gas'].map(d => (
                    <div key={d} style={{ fontSize: 12, color: '#1e40af', marginBottom: 3 }}>• {d}</div>
                  ))}
                  <p style={{ fontSize: 11, color: '#6b7280', margin: '8px 0 0', fontStyle: 'italic' }}>La dirección debe coincidir con la que declaraste.</p>
                </div>
                <PhotoUpload label="Comprobante de domicilio" hint="Acepta imágenes JPG, PNG o PDF. Máximo 15MB." icon="📄" value={proofAddressUrl} onChange={setProofAddressUrl} accept="image/*,.pdf" />
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={() => { if (!proofAddressUrl) { setError('Sube tu comprobante de domicilio.'); return } nextSub() }} />
              </>
            )}

            {/* 4c: Video de prueba de vida */}
            {subStep === 3 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🎥 Video de prueba de vida</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Graba un video corto verificando que vives donde declaras.</p>
                <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#854d0e', margin: '0 0 8px' }}>🎬 ¿Cómo grabar el video? (30-60 segundos)</p>
                  {[
                    '1. Sal afuera de tu domicilio',
                    '2. Muestra la fachada y el número/placa de tu casa',
                    '3. Di en voz alta tu nombre y la fecha de hoy',
                    '4. Entra al domicilio mostrando el interior brevemente',
                  ].map(i => (
                    <div key={i} style={{ fontSize: 13, color: '#854d0e', marginBottom: 6, lineHeight: 1.4 }}>{i}</div>
                  ))}
                  <p style={{ fontSize: 11, color: '#92400e', margin: '8px 0 0', fontStyle: 'italic' }}>Formato MP4 o MOV, máximo 50MB. Puedes grabarlo desde tu galería.</p>
                </div>
                <PhotoUpload label="Video de prueba de vida" hint="" icon="🎥" value={proofLifeUrl} onChange={setProofLifeUrl} accept="video/*" />
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={() => { if (!proofLifeUrl) { setError('Sube el video de prueba de vida.'); return } nextSub() }} />
              </>
            )}

            {/* 4d: Zona + días + horario */}
            {subStep === 4 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>📍 Zona de cobertura y horario</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>Define hasta qué distancia puedes ir y cuándo estás disponible.</p>

                <div style={{ marginBottom: 20 }}>
                  <label style={lbl}>
                    Radio de cobertura: <strong>{radius} km</strong>
                    {radius > 2 && <span style={{ fontSize: 11, color: '#f59e0b', marginLeft: 8 }}>⚠️ Requiere verificación de transporte</span>}
                  </label>
                  <input type="range" min={1} max={50} value={radius} onChange={e => setRadius(Number(e.target.value))} style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    <span>1 km</span><span>50 km</span>
                  </div>
                  {radius > 2 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginTop: 10 }}>
                      <p style={{ fontSize: 13, color: '#92400e', margin: 0, lineHeight: 1.5 }}>🚗 Como tu radio es mayor a 2 km, el administrador verificará que cuentas con transporte propio.</p>
                      <div style={{ marginTop: 12 }}>
                        <label style={lbl}>Tipo de transporte para desplazarte *</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {[
                            { value: 'auto', label: '🚗 Auto propio' },
                            { value: 'moto', label: '🏍️ Moto' },
                            { value: 'transporte_publico', label: '🚌 Transporte público' },
                          ].map(opt => (
                            <button key={opt.value} onClick={() => setVehicleType(opt.value)}
                              style={{ padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: vehicleType === opt.value ? '#f59e0b' : '#f3f4f6', color: vehicleType === opt.value ? '#fff' : '#374151', minHeight: 36 }}>
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
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

                <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Hora inicio *</label>
                    <input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)} style={inp} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={lbl}>Hora cierre *</label>
                    <input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)} style={inp} />
                  </div>
                </div>

                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 8, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={handleStep4} nextLabel="Guardar y continuar →" nextColor="#10b981" />
              </>
            )}
          </div>
        )}

        {/* ════ PASO 5 — Pago + Encuesta + Consentimientos ════ */}
        {step === 5 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>

            {/* 5a: CLABE */}
            {subStep === 1 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>💳 Datos de pago</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>Para recibir tus liquidaciones semanales vía transferencia SPEI.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={lbl}>CLABE interbancaria (18 dígitos) *</label>
                    <input style={{ ...inp, borderColor: clabeError ? '#fca5a5' : '#e5e7eb' }}
                      placeholder="Ej: 012345678901234567" type="tel" maxLength={18}
                      value={clabe} onChange={e => { setClabe(e.target.value.replace(/\D/g, '')); setClabeError('') }} />
                    {clabeError && <p style={{ fontSize: 12, color: '#dc2626', margin: '4px 0 0' }}>⚠️ {clabeError}</p>}
                    {clabe.length === 18 && !clabeError && validarCLABE(clabe) && <p style={{ fontSize: 12, color: '#10b981', margin: '4px 0 0' }}>✅ CLABE válida</p>}
                    {profile?.clabe && !clabe && <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>CLABE registrada: {profile.clabe} — deja en blanco para mantenerla</p>}
                  </div>
                  <div>
                    <label style={lbl}>Nombre del titular *</label>
                    <input style={inp} placeholder="Nombre como aparece en tu cuenta" value={clabeHolder} onChange={e => setClabeHolder(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Banco *</label>
                    <select value={bankName} onChange={e => setBankName(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                      <option value="">Selecciona tu banco</option>
                      {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginTop: 16 }}>
                  <p style={{ fontSize: 12, color: '#854d0e', margin: 0, lineHeight: 1.5 }}>🔒 Tus datos bancarios se almacenan de forma segura. Solo mostramos los últimos 4 dígitos. Las liquidaciones se realizan cada lunes por la semana anterior.</p>
                </div>
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={() => goStep(4)} onNext={() => {
                  const clabeClean = clabe.replace(/\s/g, '')
                  if (!clabeClean && !profile?.clabe) { setError('La CLABE es requerida.'); return }
                  if (clabeClean && !validarCLABE(clabeClean)) { setClabeError('CLABE inválida.'); return }
                  if (!clabeHolder.trim()) { setError('El nombre del titular es requerido.'); return }
                  if (!bankName) { setError('Selecciona un banco.'); return }
                  nextSub()
                }} />
              </>
            )}

            {/* 5b: Encuesta de experiencia */}
            {subStep === 2 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>📋 Tu experiencia</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>Cuéntanos un poco sobre ti para asignarte los mejores servicios.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={lbl}>¿Cuántos años de experiencia en lavado de autos?</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {[
                        { value: '0', label: 'Sin experiencia' },
                        { value: '1', label: 'Menos de 1 año' },
                        { value: '2', label: '1-3 años' },
                        { value: '5', label: '3-5 años' },
                        { value: '6', label: 'Más de 5 años' },
                      ].map(opt => (
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
                      placeholder="Ej: Trabajé 2 años en un autolavado, tengo experiencia en vehículos de lujo..."
                      value={experienceNotes}
                      onChange={e => setExperienceNotes(e.target.value)}
                      maxLength={500} />
                    <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0', textAlign: 'right' }}>{experienceNotes.length}/500</p>
                  </div>
                </div>
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={nextSub} />
              </>
            )}

            {/* 5c: Consentimientos y términos */}
            {subStep === 3 && (
              <>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>✅ Consentimientos</h2>
                <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>Por favor lee y acepta los siguientes puntos para completar tu registro.</p>

                {/* Consentimiento antecedentes */}
                <div style={{ background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: '16px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <button onClick={() => setBgConsent(!bgConsent)}
                      style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${bgConsent ? '#3b82f6' : '#d1d5db'}`, background: bgConsent ? '#3b82f6' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      {bgConsent && <span style={{ color: '#fff', fontSize: 14 }}>✓</span>}
                    </button>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 4 }}>Consentimiento para verificación de antecedentes <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>(opcional pero recomendado)</span></div>
                      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>Autorizo a Maz Clean a realizar una consulta de antecedentes penales para verificar mi idoneidad como operador. Esta consulta se realiza de forma confidencial.</div>
                    </div>
                  </div>
                </div>

                {/* Términos y condiciones */}
                <div style={{ background: termsAccepted ? '#f0fdf4' : '#f9fafb', border: `1.5px solid ${termsAccepted ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 12, padding: '16px', marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <button onClick={() => setTermsAccepted(!termsAccepted)}
                      style={{ width: 24, height: 24, borderRadius: 6, border: `2px solid ${termsAccepted ? '#10b981' : '#d1d5db'}`, background: termsAccepted ? '#10b981' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                      {termsAccepted && <span style={{ color: '#fff', fontSize: 14 }}>✓</span>}
                    </button>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 4 }}>Acepto los Términos y Condiciones <span style={{ color: '#ef4444' }}>*</span></div>
                      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>He leído y acepto los términos de servicio de Maz Clean, incluyendo las políticas de comisiones, cancelaciones y código de conducta del operador. Entiendo que toda la información proporcionada es verdadera.</div>
                    </div>
                  </div>
                </div>

                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
                  <p style={{ fontSize: 13, color: '#1e40af', margin: 0, lineHeight: 1.5 }}>🔍 Tu solicitud será revisada en un plazo máximo de <strong>4 horas hábiles</strong>. Recibirás una notificación por WhatsApp con el resultado.</p>
                </div>

                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
                <NavButtons onBack={prevSub} onNext={handleStep5} nextLabel="✅ Enviar para revisión" nextColor="#10b981" nextDisabled={!termsAccepted} />
              </>
            )}
          </div>
        )}

        {/* ════ PASO 6 — Confirmación final ════ */}
        {step >= 6 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '28px 20px' : 40, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1f2937', margin: '0 0 12px' }}>¡Registro completado!</h2>
            <p style={{ fontSize: 15, color: '#374151', margin: '0 0 8px', lineHeight: 1.6 }}>Tu solicitud está siendo revisada por nuestro equipo.</p>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>Recibirás una notificación en máximo <strong>4 horas hábiles</strong>. Una vez aprobado podrás empezar a recibir servicios.</p>

            <div style={{ background: '#f9fafb', borderRadius: 12, padding: '16px 20px', marginBottom: 24, textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 12px' }}>📋 Estado de tu solicitud:</p>
              {[
                { label: 'Datos personales',        done: !!profile?.full_name },
                { label: 'Identificación (INE)',     done: !!profile?.ine_front_url },
                { label: 'Selfie con INE',           done: !!profile?.selfie_with_id_url },
                { label: 'Kit de materiales',        done: !!profile?.kit_photo_url },
                { label: 'Vehículo',                 done: !!profile?.vehicle_photo_url },
                { label: 'Comprobante de domicilio', done: !!profile?.proof_of_address_url },
                { label: 'Video de prueba de vida',  done: !!profile?.proof_of_life_video_url },
                { label: 'Zona y horario',           done: !!profile?.base_address },
                { label: 'Datos bancarios',          done: !!profile?.clabe },
                { label: 'Consentimientos',          done: !!profile?.terms_accepted_at },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>{item.done ? '✅' : '⏳'}</span>
                  <span style={{ fontSize: 13, color: item.done ? '#166534' : '#9ca3af', fontWeight: item.done ? 600 : 400 }}>{item.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: item.done ? '#10b981' : '#d97706', fontWeight: 600 }}>{item.done ? 'Entregado' : 'Pendiente'}</span>
                </div>
              ))}
            </div>

            {profile?.operator_status === 'aprobado' && (
              <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#166534', margin: 0 }}>🎉 ¡Tu cuenta está activa! Ya puedes recibir servicios.</p>
              </div>
            )}

            {profile?.operator_status === 'rechazado' && profile?.rejection_reason && (
              <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', margin: '0 0 6px' }}>❌ Solicitud rechazada</p>
                <p style={{ fontSize: 13, color: '#991b1b', margin: 0, lineHeight: 1.5 }}>{profile.rejection_reason}</p>
                <button onClick={() => goStep(1)} style={{ marginTop: 12, padding: '10px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
                  Corregir y reenviar
                </button>
              </div>
            )}

            {profile?.operator_status === 'aprobado' && (
              <button onClick={onComplete}
                style={{ width: '100%', padding: '15px 0', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
                Ir al Panel de Operador →
              </button>
            )}
          </div>
        )}

      </div>
      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  )
}
