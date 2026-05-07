// AdminAcademia.jsx — Panel admin para gestionar Certificación Pro
import { useState, useEffect } from 'react'
import { useAuth } from './context/AuthContext'
import { sendWhatsApp } from './lib/whatsapp'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function getToken() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (stored) { const p = JSON.parse(stored); return p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY }
  } catch {}
  return SUPABASE_ANON_KEY
}

export default function AdminAcademia({ isMobile }) {
  const { user } = useAuth()
  const [tab, setTab]                       = useState('pendientes')
  const [pendingCerts, setPendingCerts]     = useState([])
  const [modules, setModules]               = useState([])
  const [lessons, setLessons]               = useState([])
  const [operators, setOperators]           = useState([])
  const [loading, setLoading]               = useState(true)
  const [validating, setValidating]         = useState(null)
  // Formulario nueva lección
  const [lessonModal, setLessonModal]       = useState(false)
  const [lessonForm, setLessonForm]         = useState({ module_id: '', title: '', content_type: 'video', content_url: '', content_body: '', duration_seconds: '' })
  const [savingLesson, setSavingLesson]     = useState(false)
  const [lessonError, setLessonError]       = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const headers = { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY }
      const [certRes, modRes, lesRes, opRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/operator_certifications?validated_at=is.null&is_active=eq.true&select=*,operator:operator_id(full_name,phone,rating_avg)`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/course_modules?order=order_index.asc&select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/course_lessons?order=order_index.asc&select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.operador&operator_status=eq.aprobado&select=id,full_name,is_certified,certification_date,phone,rating_avg`, { headers }),
      ])
      if (certRes.ok) setPendingCerts(await certRes.json())
      if (modRes.ok)  setModules(await modRes.json())
      if (lesRes.ok)  setLessons(await lesRes.json())
      if (opRes.ok)   setOperators(await opRes.json())
    } catch (err) { console.error('AdminAcademia fetch:', err) }
    finally { setLoading(false) }
  }

  const approveCert = async (cert) => {
    setValidating(cert.id)
    try {
      const headers = { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }
      // Actualizar certificación
      await fetch(`${SUPABASE_URL}/rest/v1/operator_certifications?id=eq.${cert.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ validated_by: user.id, validated_at: new Date().toISOString(), kit_photo_validated: true }),
      })
      // Actualizar perfil del operador
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${cert.operator_id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ is_certified: true, certification_date: new Date().toISOString(), updated_at: new Date().toISOString() }),
      })
      // Enviar WA de felicitación
      if (cert.operator?.phone) {
        const msg = `🏆 *MAZ CLEAN — ¡Felicidades!* \n\nHas obtenido tu *Certificación Pro* de Academia Código Limpio. A partir de ahora apareces como Operador Certificado para los clientes. ¡Sigue así, Pro! 🚗✨`
        await sendWhatsApp({ to: cert.operator.phone, message: msg })
      }
      setPendingCerts(prev => prev.filter(c => c.id !== cert.id))
      setOperators(prev => prev.map(o => o.id === cert.operator_id ? { ...o, is_certified: true, certification_date: new Date().toISOString() } : o))
    } catch (err) { alert('Error: ' + err.message) }
    finally { setValidating(null) }
  }

  const rejectCert = async (cert) => {
    const reason = prompt('Motivo del rechazo (se enviará al operador):')
    if (!reason) return
    setValidating(cert.id)
    try {
      const headers = { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }
      await fetch(`${SUPABASE_URL}/rest/v1/operator_certifications?id=eq.${cert.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ validated_by: user.id, validated_at: new Date().toISOString(), is_active: false, notes: reason }),
      })
      if (cert.operator?.phone) {
        const msg = `⚠️ *MAZ CLEAN* — Tu solicitud de Certificación Pro fue rechazada. Motivo: ${reason}. Puedes volver a intentarlo cuando tengas una foto de antes y después más clara. ¡Ánimo!`
        await sendWhatsApp({ to: cert.operator.phone, message: msg })
      }
      setPendingCerts(prev => prev.filter(c => c.id !== cert.id))
    } catch (err) { alert('Error: ' + err.message) }
    finally { setValidating(null) }
  }

  const saveLesson = async () => {
    if (!lessonForm.module_id || !lessonForm.title) { setLessonError('Módulo y título son requeridos'); return }
    setSavingLesson(true); setLessonError('')
    try {
      const modLessons = lessons.filter(l => l.module_id === lessonForm.module_id)
      const body = {
        module_id:        lessonForm.module_id,
        title:            lessonForm.title,
        content_type:     lessonForm.content_type,
        content_url:      lessonForm.content_url || null,
        content_body:     lessonForm.content_body || null,
        duration_seconds: lessonForm.duration_seconds ? parseInt(lessonForm.duration_seconds) : null,
        order_index:      modLessons.length + 1,
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/course_lessons`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setLessonModal(false)
      setLessonForm({ module_id: '', title: '', content_type: 'video', content_url: '', content_body: '', duration_seconds: '' })
      await fetchAll()
    } catch (err) { setLessonError(err.message) }
    finally { setSavingLesson(false) }
  }

  const TABS = [
    { id: 'pendientes', label: `⏳ Pendientes${pendingCerts.length > 0 ? ` (${pendingCerts.length})` : ''}` },
    { id: 'operadores', label: '👷 Operadores' },
    { id: 'contenido',  label: '📚 Contenido' },
  ]

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>Cargando Academia...</div>

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, overflowX: 'auto', paddingBottom: 4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '8px 14px', borderRadius: 20, border: `1.5px solid ${tab === t.id ? '#1e40af' : '#e5e7eb'}`, background: tab === t.id ? '#1e40af' : '#fff', color: tab === t.id ? '#fff' : '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 38 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Pendientes de validación */}
      {tab === 'pendientes' && (
        <div>
          {pendingCerts.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', border: '2px dashed #e5e7eb' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>Sin certificaciones pendientes</div>
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>Todas las solicitudes han sido revisadas</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {pendingCerts.map(cert => (
                <div key={cert.id} style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', border: '1.5px solid #fde68a', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{cert.operator?.full_name || 'Operador'}</div>
                      <div style={{ color: '#fef3c7', fontSize: 12, marginTop: 2 }}>
                        ⭐ {cert.operator?.rating_avg || '—'} · Solicitud: {new Date(cert.certified_at).toLocaleDateString('es-MX')}
                      </div>
                    </div>
                    <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '3px 10px', color: '#fff', fontSize: 12, fontWeight: 700 }}>⏳ Pendiente</span>
                  </div>
                  <div style={{ padding: '16px' }}>
                    {cert.before_after_photo_url && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>📸 Foto Antes y Después:</div>
                        <img src={cert.before_after_photo_url} alt="Antes y después" style={{ width: '100%', borderRadius: 10, maxHeight: 250, objectFit: 'cover', border: '1px solid #e5e7eb' }} />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => approveCert(cert)} disabled={!!validating}
                        style={{ flex: 1, padding: '12px', background: validating === cert.id ? '#9ca3af' : '#059669', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 46 }}>
                        {validating === cert.id ? '⏳...' : '🏆 Aprobar y Certificar'}
                      </button>
                      <button onClick={() => rejectCert(cert)} disabled={!!validating}
                        style={{ flex: 1, padding: '12px', background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 46 }}>
                        ✕ Rechazar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Operadores */}
      {tab === 'operadores' && (
        <div style={{ display: 'grid', gap: 12 }}>
          {operators.map(op => (
            <div key={op.id} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: `1.5px solid ${op.is_certified ? '#bbf7d0' : '#fde68a'}`, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: op.is_certified ? 'linear-gradient(135deg,#065f46,#10b981)' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                {op.is_certified ? '🏆' : '⏳'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>{op.full_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  ⭐ {op.rating_avg || '—'}
                  {op.is_certified
                    ? ` · Certificado ${op.certification_date ? new Date(op.certification_date).toLocaleDateString('es-MX') : ''}`
                    : ' · Pendiente de certificación'}
                </div>
              </div>
              <span style={{ background: op.is_certified ? '#f0fdf4' : '#fffbeb', color: op.is_certified ? '#059669' : '#92400e', borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>
                {op.is_certified ? '✓ Certificado' : '⏳ Pendiente'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Contenido del curso */}
      {tab === 'contenido' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => { setLessonModal(true); setLessonError('') }}
              style={{ padding: '10px 16px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 42 }}>
              ➕ Nueva lección
            </button>
          </div>

          {modules.map((mod, mi) => {
            const modLessons = lessons.filter(l => l.module_id === mod.id)
            return (
              <div key={mod.id} style={{ background: '#fff', borderRadius: 14, marginBottom: 16, overflow: 'hidden', border: '1.5px solid #e5e7eb' }}>
                <div style={{ background: '#1e40af', padding: '12px 16px' }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Módulo {mi + 1}: {mod.title}</div>
                  <div style={{ color: '#bfdbfe', fontSize: 12, marginTop: 2 }}>{modLessons.length} lecciones</div>
                </div>
                <div>
                  {modLessons.length === 0 ? (
                    <div style={{ padding: '14px 16px', fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>Sin lecciones — agrega una con el botón de arriba</div>
                  ) : modLessons.map((lesson, li) => (
                    <div key={lesson.id} style={{ padding: '12px 16px', borderBottom: li < modLessons.length - 1 ? '1px solid #f3f4f6' : 'none', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 20 }}>{lesson.content_type === 'video' ? '▶️' : lesson.content_type === 'infografia' ? '🖼️' : '📄'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{lesson.title}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                          {lesson.content_type} {lesson.duration_seconds ? `· ${Math.ceil(lesson.duration_seconds / 60)} min` : ''}
                          {lesson.content_url && ` · URL: ${lesson.content_url.slice(0, 40)}...`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal nueva lección */}
      {lessonModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, width: '100%', maxWidth: 520, overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#1e40af', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>➕ Nueva Lección</div>
              <button onClick={() => setLessonModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', display: 'grid', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Módulo *</label>
                <select value={lessonForm.module_id} onChange={e => setLessonForm(p => ({ ...p, module_id: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', minHeight: 44, background: '#fff' }}>
                  <option value="">Selecciona un módulo</option>
                  {modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Título *</label>
                <input type="text" value={lessonForm.title} onChange={e => setLessonForm(p => ({ ...p, title: e.target.value }))} placeholder="ej. Técnica de las 2 Microfibras"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', minHeight: 44, boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Tipo de contenido</label>
                <select value={lessonForm.content_type} onChange={e => setLessonForm(p => ({ ...p, content_type: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', minHeight: 44, background: '#fff' }}>
                  <option value="video">▶️ Video</option>
                  <option value="infografia">🖼️ Infografía</option>
                  <option value="texto">📄 Texto</option>
                </select>
              </div>
              {(lessonForm.content_type === 'video' || lessonForm.content_type === 'infografia') && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>URL del contenido (Supabase Storage)</label>
                  <input type="text" value={lessonForm.content_url} onChange={e => setLessonForm(p => ({ ...p, content_url: e.target.value }))} placeholder="https://..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', minHeight: 44, boxSizing: 'border-box' }} />
                </div>
              )}
              {lessonForm.content_type === 'video' && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Duración (segundos)</label>
                  <input type="number" value={lessonForm.duration_seconds} onChange={e => setLessonForm(p => ({ ...p, duration_seconds: e.target.value }))} placeholder="ej. 90"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', minHeight: 44, boxSizing: 'border-box' }} />
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Texto / descripción adicional</label>
                <textarea value={lessonForm.content_body} onChange={e => setLessonForm(p => ({ ...p, content_body: e.target.value }))} placeholder="Contenido de la lección, guión, tips..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', minHeight: 100, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>
              {lessonError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#dc2626' }}>⚠️ {lessonError}</div>}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setLessonModal(false)} style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={saveLesson} disabled={savingLesson} style={{ flex: 2, padding: '12px', background: savingLesson ? '#9ca3af' : '#1e40af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                {savingLesson ? '⏳ Guardando...' : '✅ Guardar lección'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
