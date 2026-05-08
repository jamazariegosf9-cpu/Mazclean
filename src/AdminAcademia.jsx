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
  const [editLesson, setEditLesson]         = useState(null)
  const [editForm, setEditForm]             = useState({ content_url: '', duration_seconds: '' })
  const [savingEdit, setSavingEdit]         = useState(false)
  const [editError, setEditError]           = useState('')
  const [quizzes, setQuizzes]               = useState([])
  const [quizLesson, setQuizLesson]         = useState(null)
  const [quizModal, setQuizModal]           = useState(false)
  const [quizForm, setQuizForm]             = useState({ question: '', options: ['','','',''], correct_answer: 0 })
  const [savingQuiz, setSavingQuiz]         = useState(false)
  const [quizError, setQuizError]           = useState('')

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
    { id: 'quizzes',    label: '📝 Quizzes' },
  ]

  const deleteLesson = async (lessonId) => {
    if (!confirm('¿Eliminar esta lección? También se eliminarán sus quizzes.')) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/course_quizzes?lesson_id=eq.${lessonId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY },
      })
      await fetch(`${SUPABASE_URL}/rest/v1/course_lessons?id=eq.${lessonId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY },
      })
      await fetchAll()
    } catch (err) { alert('Error al eliminar: ' + err.message) }
  }

  const openEditLesson = (lesson) => {
    setEditLesson(lesson)
    setEditForm({ content_url: lesson.content_url || '', duration_seconds: lesson.duration_seconds || '' })
    setEditError('')
  }

  const saveEditLesson = async () => {
    if (!editForm.content_url.trim()) { setEditError('La URL es requerida'); return }
    setSavingEdit(true); setEditError('')
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/course_lessons?id=eq.${editLesson.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ content_url: editForm.content_url.trim(), duration_seconds: editForm.duration_seconds ? parseInt(editForm.duration_seconds) : null }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setEditLesson(null)
      await fetchAll()
    } catch (err) { setEditError(err.message) }
    finally { setSavingEdit(false) }
  }

  const fetchQuizzes = async (lessonId) => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/course_quizzes?lesson_id=eq.${lessonId}&order=order_index.asc&select=*`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (res.ok) setQuizzes(await res.json())
    } catch (err) { console.error('fetchQuizzes:', err) }
  }

  const openQuizModal = async (lesson) => {
    setQuizLesson(lesson)
    setQuizForm({ question: '', options: ['','','',''], correct_answer: 0 })
    setQuizError('')
    await fetchQuizzes(lesson.id)
    setQuizModal(true)
  }

  const saveQuiz = async () => {
    if (!quizForm.question.trim()) { setQuizError('La pregunta es requerida'); return }
    if (quizForm.options.some(o => !o.trim())) { setQuizError('Todas las opciones son requeridas'); return }
    setSavingQuiz(true); setQuizError('')
    try {
      const body = {
        lesson_id: quizLesson.id,
        question: quizForm.question.trim(),
        options: quizForm.options.map(o => o.trim()),
        correct_answer: quizForm.correct_answer,
        order_index: quizzes.length + 1,
      }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/course_quizzes`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await fetchQuizzes(quizLesson.id)
      setQuizForm({ question: '', options: ['','','',''], correct_answer: 0 })
    } catch (err) { setQuizError(err.message) }
    finally { setSavingQuiz(false) }
  }

  const deleteQuiz = async (id) => {
    if (!confirm('¿Eliminar esta pregunta?')) return
    await fetch(`${SUPABASE_URL}/rest/v1/course_quizzes?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY },
    })
    setQuizzes(prev => prev.filter(q => q.id !== id))
  }

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
                    <div key={lesson.id} style={{ padding: '12px 16px', borderBottom: li < modLessons.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 20 }}>{lesson.content_type === 'video' ? '▶️' : lesson.content_type === 'infografia' ? '🖼️' : '📄'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>{lesson.title}</div>
                          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                            {lesson.content_type} {lesson.duration_seconds ? `· ${Math.ceil(lesson.duration_seconds / 60)} min` : ''}
                            {lesson.content_url ? ` · ${lesson.content_url.slice(0, 35)}...` : ' · Sin URL'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => openEditLesson(lesson)}
                            style={{ padding: '6px 10px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8, color: '#1e40af', fontSize: 11, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>
                            ✏️ Editar
                          </button>
                          <button onClick={() => deleteLesson(lesson.id)}
                            style={{ padding: '6px 10px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>
                            🗑️
                          </button>
                        </div>
                      </div>
                      {/* Modal inline de edición */}
                      {editLesson?.id === lesson.id && (
                        <div style={{ background: '#f0f9ff', borderRadius: 10, padding: '12px 14px', marginTop: 10, border: '1.5px solid #bae6fd' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#0369a1', marginBottom: 10 }}>✏️ Editar lección</div>
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>URL del video *</label>
                            <input type="text" value={editForm.content_url} onChange={e => setEditForm(p => ({ ...p, content_url: e.target.value }))}
                              placeholder="https://..." style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #bae6fd', fontSize: 12, outline: 'none', boxSizing: 'border-box', minHeight: 38 }} />
                          </div>
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Duración (segundos)</label>
                            <input type="number" value={editForm.duration_seconds} onChange={e => setEditForm(p => ({ ...p, duration_seconds: e.target.value }))}
                              placeholder="ej. 390" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #bae6fd', fontSize: 12, outline: 'none', boxSizing: 'border-box', minHeight: 38 }} />
                          </div>
                          {editError && <div style={{ background: '#fef2f2', borderRadius: 6, padding: '6px 10px', marginBottom: 8, fontSize: 11, color: '#dc2626' }}>⚠️ {editError}</div>}
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => setEditLesson(null)} style={{ flex: 1, padding: '8px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 36 }}>Cancelar</button>
                            <button onClick={saveEditLesson} disabled={savingEdit} style={{ flex: 2, padding: '8px', background: savingEdit ? '#9ca3af' : '#0369a1', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 36 }}>
                              {savingEdit ? '⏳ Guardando...' : '✅ Guardar cambios'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Tab: Quizzes */}
      {tab === 'quizzes' && (
        <div>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#1e40af' }}>
            💡 Selecciona una lección para gestionar sus preguntas de evaluación.
          </div>
          {modules.map(mod => {
            const modLessons = lessons.filter(l => l.module_id === mod.id)
            return (
              <div key={mod.id} style={{ background: '#fff', borderRadius: 14, marginBottom: 12, overflow: 'hidden', border: '1.5px solid #e5e7eb' }}>
                <div style={{ background: '#1e40af', padding: '10px 16px' }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>{mod.title}</div>
                </div>
                {modLessons.map(lesson => (
                  <div key={lesson.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{lesson.title}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{lesson.content_type}</div>
                    </div>
                    <button onClick={() => openQuizModal(lesson)}
                      style={{ padding: '8px 14px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8, color: '#1e40af', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: 38 }}>
                      📝 Gestionar preguntas
                    </button>
                  </div>
                ))}
                {modLessons.length === 0 && <div style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>Sin lecciones</div>}
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

      {/* Modal: Gestionar Quizzes */}
      {quizModal && quizLesson && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>📝 Preguntas — {quizLesson.title}</div>
                <div style={{ color: '#bfdbfe', fontSize: 12, marginTop: 2 }}>{quizzes.length} pregunta{quizzes.length !== 1 ? 's' : ''} registrada{quizzes.length !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => setQuizModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
              {/* Preguntas existentes */}
              {quizzes.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Preguntas actuales</div>
                  {quizzes.map((q, qi) => (
                    <div key={q.id} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', marginBottom: 8, border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937', flex: 1 }}>{qi + 1}. {q.question}</div>
                        <button onClick={() => deleteQuiz(q.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, color: '#dc2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '4px 8px', flexShrink: 0 }}>✕</button>
                      </div>
                      <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
                        {(q.options || []).map((opt, oi) => (
                          <div key={oi} style={{ fontSize: 12, color: oi === q.correct_answer ? '#059669' : '#6b7280', fontWeight: oi === q.correct_answer ? 700 : 400 }}>
                            {oi === q.correct_answer ? '✅' : '○'} {String.fromCharCode(65+oi)}. {opt}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Nueva pregunta */}
              <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #bae6fd' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0369a1', marginBottom: 12 }}>➕ Nueva pregunta</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Pregunta *</label>
                  <input type="text" value={quizForm.question} onChange={e => setQuizForm(p => ({ ...p, question: e.target.value }))} placeholder="Escribe la pregunta..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #bae6fd', fontSize: 13, outline: 'none', boxSizing: 'border-box', minHeight: 42 }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Opciones (marca la correcta)</label>
                  {quizForm.options.map((opt, oi) => (
                    <div key={oi} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                      <button onClick={() => setQuizForm(p => ({ ...p, correct_answer: oi }))}
                        style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${quizForm.correct_answer === oi ? '#10b981' : '#d1d5db'}`, background: quizForm.correct_answer === oi ? '#10b981' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, color: '#fff', fontWeight: 700 }}>
                        {quizForm.correct_answer === oi ? '✓' : ''}
                      </button>
                      <input type="text" value={opt} onChange={e => { const opts = [...quizForm.options]; opts[oi] = e.target.value; setQuizForm(p => ({ ...p, options: opts })) }}
                        placeholder={`Opción ${String.fromCharCode(65+oi)}`}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${quizForm.correct_answer === oi ? '#bbf7d0' : '#e5e7eb'}`, fontSize: 13, outline: 'none', minHeight: 38 }} />
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Toca el círculo para marcar la respuesta correcta</div>
                </div>
                {quizError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#dc2626' }}>⚠️ {quizError}</div>}
                <button onClick={saveQuiz} disabled={savingQuiz}
                  style={{ width: '100%', padding: '12px', background: savingQuiz ? '#9ca3af' : '#1e40af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 46 }}>
                  {savingQuiz ? '⏳ Guardando...' : '✅ Agregar pregunta'}
                </button>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
              <button onClick={() => setQuizModal(false)} style={{ width: '100%', padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 46 }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
