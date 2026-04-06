import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'

// ── Alcaldías CDMX + municipios Estado de México principales ──
const ZONAS = [
  'Álvaro Obregón','Azcapotzalco','Benito Juárez','Coyoacán',
  'Cuajimalpa','Cuauhtémoc','Gustavo A. Madero','Iztacalco',
  'Iztapalapa','La Magdalena Contreras','Miguel Hidalgo','Milpa Alta',
  'Tláhuac','Tlalpan','Venustiano Carranza','Xochimilco',
  'Atizapán','Cuautitlán Izcalli','Ecatepec','Huixquilucan',
  'Naucalpan','Nezahualcóyotl','Tlalnepantla','Tultitlán',
]

const DIAS = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo']

const BANCOS = [
  'BBVA','Banamex','Santander','Banorte','HSBC',
  'Inbursa','Scotiabank','Afirme','BanBajío','Azteca','Otro',
]

// ── Validar dígito verificador CLABE ─────────────────────────
function validarCLABE(clabe) {
  if (!/^\d{18}$/.test(clabe)) return false
  const pesos = [3,7,1,3,7,1,3,7,1,3,7,1,3,7,1,3,7]
  const suma = pesos.reduce((acc, p, i) => acc + (parseInt(clabe[i]) * p) % 10, 0)
  const control = (10 - (suma % 10)) % 10
  return control === parseInt(clabe[17])
}

// ── Hook móvil ────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  return isMobile
}

// ── Comprimir imagen con fallback para Samsung/Android WebView ──
function compressImage(file) {
  return new Promise((resolve) => {
    // Si el archivo ya es pequeño (<800KB) subir directo sin comprimir
    if (file.size < 800 * 1024) { resolve(file); return }

    const MAX = 1200
    const url = URL.createObjectURL(file)
    const img = new Image()

    // Timeout de seguridad: si toBlob no responde en 8s, usar archivo original
    let settled = false
    const fallbackTimer = setTimeout(() => {
      if (!settled) { settled = true; URL.revokeObjectURL(url); resolve(file) }
    }, 8000)

    img.onload = () => {
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX }
        else { width = Math.round(width * MAX / height); height = MAX }
      }
      try {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { clearTimeout(fallbackTimer); settled = true; URL.revokeObjectURL(url); resolve(file); return }
        ctx.drawImage(img, 0, 0, width, height)
        URL.revokeObjectURL(url)
        canvas.toBlob(
          blob => {
            if (settled) return
            clearTimeout(fallbackTimer)
            settled = true
            resolve(blob || file) // si blob es null, usar original
          },
          'image/jpeg',
          0.82
        )
      } catch {
        clearTimeout(fallbackTimer)
        settled = true
        URL.revokeObjectURL(url)
        resolve(file) // fallback: subir original
      }
    }
    img.onerror = () => {
      if (settled) return
      clearTimeout(fallbackTimer)
      settled = true
      URL.revokeObjectURL(url)
      resolve(file) // fallback: subir original
    }
    img.src = url
  })
}

export default function OnboardingView({ onComplete }) {
  const { user, profile } = useAuth()
  const isMobile = useIsMobile()
  const [step, setStep] = useState(profile?.onboarding_step || 1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // ── Paso 1: Datos personales ──────────────────────────────
  const [fullName, setFullName]   = useState(profile?.full_name || '')
  const [phone, setPhone]         = useState(profile?.phone || '')

  // ── Paso 2: Kit de materiales ─────────────────────────────
  const [kitPhoto, setKitPhoto]           = useState(null)
  const [kitPhotoUrl, setKitPhotoUrl]     = useState(profile?.kit_photo_url || '')
  const [uploadingKit, setUploadingKit]   = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')

  // ── Paso 3: Zona de trabajo ───────────────────────────────
  const [selectedZones, setSelectedZones] = useState(profile?.coverage_zones || [])
  const [radius, setRadius]               = useState(profile?.coverage_radius || 10)
  const [selectedDays, setSelectedDays]   = useState(profile?.work_days || [])
  const [workStart, setWorkStart]         = useState(profile?.work_start?.slice(0,5) || '08:00')
  const [workEnd, setWorkEnd]             = useState(profile?.work_end?.slice(0,5) || '18:00')

  // ── Paso 4: Datos de pago ─────────────────────────────────
  const [clabe, setClabe]             = useState('')
  const [clabeHolder, setClabeHolder] = useState(profile?.clabe_holder || '')
  const [bankName, setBankName]       = useState(profile?.bank_name || '')
  const [clabeError, setClabeError]   = useState('')

  // ── Sincronizar step con profile ──────────────────────────
  useEffect(() => {
    if (profile?.onboarding_step) setStep(profile.onboarding_step)
  }, [profile])

  const saveStep = async (stepData, nextStep) => {
    setSaving(true)
    setError('')
    try {
      const { error: err } = await supabase
        .from('profiles')
        .update({
          ...stepData,
          onboarding_step: nextStep,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
      if (err) throw err
      setStep(nextStep)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Handlers por paso ─────────────────────────────────────
  const handleStep1 = async () => {
    if (!fullName.trim()) { setError('El nombre completo es requerido.'); return }
    if (!/^\d{10}$/.test(phone.replace(/\s/g,''))) { setError('El teléfono debe tener 10 dígitos.'); return }
    await saveStep({ full_name: fullName.trim(), phone: phone.replace(/\s/g,'') }, 2)
  }

  // ── FIXED: handleKitUpload con compresión confiable ───────
  const handleKitUpload = async (file) => {
    if (!file) return
    setUploadingKit(true)
    setError('')
    setUploadProgress('Procesando imagen...')
    try {
      // 1. Comprimir
      setUploadProgress('Comprimiendo imagen...')
      const compressed = await compressImage(file)

      // 2. Subir a Supabase Storage
      setUploadProgress('Subiendo foto...')
      const path = `kits/${user.id}/kit_${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage
        .from('service-photos')
        .upload(path, compressed, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr

      // 3. Construir URL pública
      const url = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/service-photos/${path}`
      setKitPhotoUrl(url)
      setKitPhoto(file)
      setUploadProgress('')
    } catch (e) {
      setError(`Error al subir foto: ${e.message}`)
      setUploadProgress('')
    } finally {
      setUploadingKit(false) // siempre se libera, aunque falle
    }
  }

  const handleStep2 = async () => {
    if (!kitPhotoUrl) { setError('Sube una foto de tu kit de materiales.'); return }
    await saveStep({ kit_photo_url: kitPhotoUrl }, 3)
  }

  const toggleZone = (zone) => {
    setSelectedZones(prev =>
      prev.includes(zone) ? prev.filter(z => z !== zone) : [...prev, zone]
    )
  }

  const toggleDay = (day) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  const handleStep3 = async () => {
    if (selectedZones.length === 0) { setError('Selecciona al menos una zona de cobertura.'); return }
    if (selectedDays.length === 0)  { setError('Selecciona al menos un día disponible.'); return }
    if (workStart >= workEnd)       { setError('La hora de inicio debe ser antes de la hora de cierre.'); return }
    await saveStep({
      coverage_zones:  selectedZones,
      coverage_radius: radius,
      work_days:       selectedDays,
      work_start:      workStart,
      work_end:        workEnd,
    }, 4)
  }

  const handleStep4 = async () => {
    const clabeClean = clabe.replace(/\s/g,'')
    if (!clabeClean && !profile?.clabe) { setError('La CLABE es requerida.'); return }
    if (clabeClean && !validarCLABE(clabeClean)) {
      setClabeError('CLABE inválida. Verifica los 18 dígitos.')
      return
    }
    if (!clabeHolder.trim()) { setError('El nombre del titular es requerido.'); return }
    if (!bankName)           { setError('Selecciona un banco.'); return }

    const clabeToSave = clabeClean
      ? '****' + clabeClean.slice(14)
      : profile?.clabe

    await saveStep({
      clabe:           clabeToSave,
      clabe_holder:    clabeHolder.trim(),
      bank_name:       bankName,
      operator_status: 'pendiente',
      onboarding_done: true,
    }, 5)
  }

  // Progreso visual
  const STEPS = [
    { n: 1, label: 'Datos',    icon: '👤' },
    { n: 2, label: 'Kit',      icon: '🧴' },
    { n: 3, label: 'Zona',     icon: '📍' },
    { n: 4, label: 'Pago',     icon: '💳' },
    { n: 5, label: 'Revisión', icon: '✅' },
  ]

  const inputStyle = {
    padding: '13px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb',
    fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box',
    fontFamily: 'inherit', color: '#1f2937', minHeight: 50, background: '#fff',
  }

  const labelStyle = {
    fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6, display: 'block',
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: isMobile ? '16px 12px 40px' : '32px 16px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💧</div>
          <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, color: '#1f2937', margin: '0 0 6px' }}>
            Bienvenido a Maz Clean
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Completa tu registro para empezar a recibir servicios
          </p>
        </div>

        {/* Barra de progreso */}
        <div style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            {STEPS.map((s, i) => (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    background: step > s.n ? '#10b981' : step === s.n ? '#3b82f6' : '#e5e7eb',
                    color: step >= s.n ? '#fff' : '#9ca3af',
                    fontWeight: 700,
                  }}>
                    {step > s.n ? '✓' : s.icon}
                  </div>
                  <span style={{ fontSize: 10, color: step >= s.n ? '#1f2937' : '#9ca3af', fontWeight: step === s.n ? 700 : 400 }}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 3, background: step > s.n ? '#10b981' : '#e5e7eb', margin: '0 4px', marginBottom: 20, borderRadius: 4 }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── PASO 1: Datos personales ── */}
        {step === 1 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>👤 Datos personales</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>Confirma o actualiza tu información de contacto.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Nombre completo *</label>
                <input style={inputStyle} placeholder="Ej: Juan Alberto Mazariegos"
                  value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Teléfono celular (10 dígitos) *</label>
                <input style={inputStyle} placeholder="Ej: 5512345678" type="tel"
                  maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g,''))} />
              </div>
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 13, color: '#166534', margin: 0, lineHeight: 1.5 }}>
                  📱 Usaremos este número para coordinar servicios y enviarte notificaciones importantes.
                </p>
              </div>
            </div>

            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}

            <button onClick={handleStep1} disabled={saving}
              style={{ width: '100%', marginTop: 20, padding: '14px 0', background: saving ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 52 }}>
              {saving ? '⏳ Guardando...' : 'Continuar →'}
            </button>
          </div>
        )}

        {/* ── PASO 2: Kit de materiales ── */}
        {step === 2 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🧴 Kit de materiales</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Sube una foto de tu kit completo para que podamos verificar que tienes todo lo necesario.</p>

            {/* Lista de materiales requeridos */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', margin: '0 0 10px' }}>✅ Materiales obligatorios:</p>
              {['Shampoo para autos','Mínimo 4 microfibras limpias','Cubeta de doble balde','Aspiradora portátil'].map(m => (
                <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: '#3b82f6', fontSize: 14 }}>•</span>
                  <span style={{ fontSize: 13, color: '#1e40af' }}>{m}</span>
                </div>
              ))}
              <p style={{ fontSize: 12, color: '#6b7280', margin: '10px 0 0', fontStyle: 'italic' }}>
                Recomendados: sellador de llantas, agua propia
              </p>
            </div>

            {/* Preview foto */}
            {kitPhotoUrl ? (
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <img src={kitPhotoUrl} alt="Kit" style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 12 }} />
                <span style={{ position: 'absolute', top: 10, right: 10, background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>✅ Foto guardada</span>
              </div>
            ) : (
              <div style={{ width: '100%', height: 160, background: '#f9fafb', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 14, border: '2px dashed #e5e7eb' }}>
                <span style={{ fontSize: 40 }}>📦</span>
                <span style={{ fontSize: 13, color: '#9ca3af', marginTop: 8 }}>Aún no has subido la foto</span>
              </div>
            )}

            {/* Progreso de upload */}
            {uploadingKit && (
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 18, height: 18, border: '3px solid #bfdbfe', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>{uploadProgress || 'Procesando...'}</span>
              </div>
            )}

            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}

            {/* Botón subir foto */}
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '13px 0', borderRadius: 12,
              background: uploadingKit ? '#f3f4f6' : '#6366f1',
              color: uploadingKit ? '#9ca3af' : '#fff',
              fontSize: 15, fontWeight: 700,
              cursor: uploadingKit ? 'not-allowed' : 'pointer',
              pointerEvents: uploadingKit ? 'none' : 'auto',
              minHeight: 50, marginBottom: 12,
            }}>
              📷 {kitPhotoUrl ? 'Cambiar foto' : 'Tomar / Subir foto del kit'}
              <input
                type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files[0]) handleKitUpload(e.target.files[0]) }}
              />
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: '13px 0', background: '#f3f4f6', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 52 }}>← Atrás</button>
              <button onClick={handleStep2} disabled={saving || !kitPhotoUrl || uploadingKit}
                style={{ flex: 2, padding: '13px 0', background: saving || !kitPhotoUrl || uploadingKit ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: saving || !kitPhotoUrl || uploadingKit ? 'not-allowed' : 'pointer', minHeight: 52 }}>
                {saving ? '⏳ Guardando...' : uploadingKit ? '⏳ Espera...' : 'Continuar →'}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 3: Zona de trabajo ── */}
        {step === 3 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>📍 Zona de trabajo</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>Define dónde y cuándo puedes atender servicios.</p>

            {/* Zonas */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Alcaldías / Municipios de cobertura * ({selectedZones.length} seleccionadas)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {ZONAS.map(z => (
                  <button key={z} onClick={() => toggleZone(z)}
                    style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                      background: selectedZones.includes(z) ? '#3b82f6' : '#f3f4f6',
                      color: selectedZones.includes(z) ? '#fff' : '#374151', minHeight: 36 }}>
                    {z}
                  </button>
                ))}
              </div>
            </div>

            {/* Radio */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Radio máximo de traslado: <strong>{radius} km</strong></label>
              <input type="range" min={1} max={20} value={radius} onChange={e => setRadius(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#3b82f6' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                <span>1 km</span><span>20 km</span>
              </div>
            </div>

            {/* Días */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Días disponibles *</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {DIAS.map(d => (
                  <button key={d} onClick={() => toggleDay(d)}
                    style={{ padding: '7px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: selectedDays.includes(d) ? '#10b981' : '#f3f4f6',
                      color: selectedDays.includes(d) ? '#fff' : '#374151', minHeight: 36, textTransform: 'capitalize' }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Horario */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Hora inicio *</label>
                <input type="time" value={workStart} onChange={e => setWorkStart(e.target.value)} style={{ ...inputStyle }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Hora cierre *</label>
                <input type="time" value={workEnd} onChange={e => setWorkEnd(e.target.value)} style={{ ...inputStyle }} />
              </div>
            </div>

            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 12, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setStep(2)} style={{ flex: 1, padding: '13px 0', background: '#f3f4f6', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 52 }}>← Atrás</button>
              <button onClick={handleStep3} disabled={saving}
                style={{ flex: 2, padding: '13px 0', background: saving ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 52 }}>
                {saving ? '⏳ Guardando...' : 'Continuar →'}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 4: Datos de pago ── */}
        {step === 4 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '20px 16px' : 28, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>💳 Datos de pago</h2>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px' }}>Para recibir tus liquidaciones semanales vía transferencia SPEI.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>CLABE interbancaria (18 dígitos) *</label>
                <input style={{ ...inputStyle, borderColor: clabeError ? '#fca5a5' : '#e5e7eb' }}
                  placeholder="Ej: 012345678901234567" type="tel" maxLength={18}
                  value={clabe} onChange={e => { setClabe(e.target.value.replace(/\D/g,'')); setClabeError('') }} />
                {clabeError && <p style={{ fontSize: 12, color: '#dc2626', margin: '4px 0 0' }}>⚠️ {clabeError}</p>}
                {clabe.length === 18 && !clabeError && validarCLABE(clabe) && (
                  <p style={{ fontSize: 12, color: '#10b981', margin: '4px 0 0' }}>✅ CLABE válida</p>
                )}
                {profile?.clabe && !clabe && (
                  <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>CLABE registrada: {profile.clabe} — deja en blanco para mantenerla</p>
                )}
              </div>

              <div>
                <label style={labelStyle}>Nombre del titular *</label>
                <input style={inputStyle} placeholder="Nombre como aparece en tu cuenta"
                  value={clabeHolder} onChange={e => setClabeHolder(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Banco *</label>
                <select value={bankName} onChange={e => setBankName(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="">Selecciona tu banco</option>
                  {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            </div>

            <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginTop: 16 }}>
              <p style={{ fontSize: 12, color: '#854d0e', margin: 0, lineHeight: 1.5 }}>
                🔒 Tus datos bancarios se almacenan de forma segura. Solo mostramos los últimos 4 dígitos de tu CLABE. Las liquidaciones se realizan cada lunes por la semana anterior.
              </p>
            </div>

            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setStep(3)} style={{ flex: 1, padding: '13px 0', background: '#f3f4f6', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 52 }}>← Atrás</button>
              <button onClick={handleStep4} disabled={saving}
                style={{ flex: 2, padding: '13px 0', background: saving ? '#9ca3af' : '#10b981', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', minHeight: 52 }}>
                {saving ? '⏳ Enviando...' : '✅ Enviar para revisión'}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO 5: En revisión ── */}
        {step === 5 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? '28px 20px' : 40, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1f2937', margin: '0 0 12px' }}>¡Registro completado!</h2>
            <p style={{ fontSize: 15, color: '#374151', margin: '0 0 8px', lineHeight: 1.6 }}>
              Tu solicitud está siendo revisada por nuestro equipo.
            </p>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>
              Recibirás una notificación en máximo <strong>4 horas hábiles</strong> con el resultado. Una vez aprobado podrás empezar a recibir servicios.
            </p>

            {/* Estado de documentos */}
            <div style={{ background: '#f9fafb', borderRadius: 12, padding: '16px 20px', marginBottom: 24, textAlign: 'left' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#374151', margin: '0 0 12px' }}>📋 Estado de tu solicitud:</p>
              {[
                { label: 'Datos personales', done: true },
                { label: 'Foto del kit',     done: !!profile?.kit_photo_url },
                { label: 'Zona de trabajo',  done: !!profile?.coverage_zones?.length },
                { label: 'Datos bancarios',  done: !!profile?.clabe },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 16 }}>{item.done ? '✅' : '⏳'}</span>
                  <span style={{ fontSize: 14, color: item.done ? '#166534' : '#9ca3af', fontWeight: item.done ? 600 : 400 }}>{item.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: item.done ? '#10b981' : '#d97706', fontWeight: 600 }}>
                    {item.done ? 'Entregado' : 'Pendiente'}
                  </span>
                </div>
              ))}
            </div>

            {profile?.operator_status === 'aprobado' && (
              <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#166534', margin: 0 }}>
                  🎉 ¡Tu cuenta está activa! Ya puedes recibir servicios.
                </p>
              </div>
            )}

            {profile?.operator_status === 'rechazado' && profile?.rejection_reason && (
              <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '14px 18px', marginBottom: 20 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', margin: '0 0 6px' }}>❌ Solicitud rechazada</p>
                <p style={{ fontSize: 13, color: '#991b1b', margin: 0, lineHeight: 1.5 }}>{profile.rejection_reason}</p>
                <button onClick={() => setStep(1)} style={{ marginTop: 12, padding: '10px 20px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
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
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
