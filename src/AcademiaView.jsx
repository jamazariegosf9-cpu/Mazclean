// AcademiaView.jsx — Certificación Pro MAZ CLEAN
// Academia Código Limpio — curso obligatorio para operadores

import { useState, useEffect, useRef } from 'react'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function getToken() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (stored) { const p = JSON.parse(stored); return p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY }
  } catch {}
  return SUPABASE_ANON_KEY
}

const MODULE_ICONS = ['🤝', '💧', '✨', '🛡️']
const MODULE_COLORS = [
  'linear-gradient(135deg,#1e40af,#3b82f6)',
  'linear-gradient(135deg,#0369a1,#0ea5e9)',
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#92400e,#f59e0b)',
]

export default function AcademiaView({ onBack }) {
  const { user, profile } = useAuth()
  const [modules, setModules]           = useState([])
  const [lessons, setLessons]           = useState([])
  const [quizzes, setQuizzes]           = useState([])
  const [progress, setProgress]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [activeModule, setActiveModule] = useState(null)
  const [activeLesson, setActiveLesson] = useState(null)
  const [quizMode, setQuizMode]         = useState(false)
  const [quizAnswers, setQuizAnswers]   = useState({})
  const [quizResult, setQuizResult]     = useState(null)
  const [submitting, setSubmitting]     = useState(false)
  const [error, setError]               = useState('')
  const [certSubmitted, setCertSubmitted] = useState(false)
  const [membershipConfig, setMembershipConfig] = useState({ operator_price: 200 })
  const [effectivePromo, setEffectivePromo]     = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => { if (user) fetchAll() }, [user])

  const fetchAll = async () => {
    setLoading(true)
    try {
      const headers = { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY }
      const [modRes, lesRes, quizRes, progRes, certRes, cfgRes, promoRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/course_modules?is_active=eq.true&order=order_index.asc&select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/course_lessons?order=order_index.asc&select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/course_quizzes?order=order_index.asc&select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/operator_progress?operator_id=eq.${user.id}&select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/operator_certifications?operator_id=eq.${user.id}&select=*&limit=1`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/membership_config?select=operator_price&limit=1`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/rpc/get_effective_membership_price`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_role: 'operador' }) }),
      ])
      if (modRes.ok)  setModules(await modRes.json())
      if (lesRes.ok)  setLessons(await lesRes.json())
      if (quizRes.ok) setQuizzes(await quizRes.json())
      if (progRes.ok) setProgress(await progRes.json())
      if (certRes.ok) { const c = await certRes.json(); if (c?.[0]) setCertSubmitted(true) }
      if (cfgRes?.ok) { const c = await cfgRes.json(); if (c?.[0]) setMembershipConfig(c[0]) }
      if (promoRes?.ok) { const p = await promoRes.json(); if (p?.has_promo) setEffectivePromo(p) }

      // Cachear lecciones offline
      if (lesRes.ok) {
        try { localStorage.setItem('mazclean-lessons-cache', JSON.stringify(await (await fetch(`${SUPABASE_URL}/rest/v1/course_lessons?order=order_index.asc&select=*`, { headers })).json())) } catch {}
      }
    } catch (err) {
      // Intentar cargar desde caché offline
      const cached = localStorage.getItem('mazclean-lessons-cache')
      if (cached) setLessons(JSON.parse(cached))
      setError('Sin conexión — mostrando contenido guardado')
    } finally { setLoading(false) }
  }

  const getLessonProgress = (lessonId) => progress.find(p => p.lesson_id === lessonId)
  const isLessonCompleted = (lessonId) => getLessonProgress(lessonId)?.completed || false
  const isModuleCompleted = (moduleId) => {
    const moduleLessons = lessons.filter(l => l.module_id === moduleId)
    return moduleLessons.length > 0 && moduleLessons.every(l => isLessonCompleted(l.id))
  }
  const isLessonLocked = (lesson, moduleIdx) => {
    if (moduleIdx === 0) return false
    const prevModule = modules[moduleIdx - 1]
    return prevModule && !isModuleCompleted(prevModule.id)
  }

  const allModulesCompleted = modules.every(m => isModuleCompleted(m.id))
  const totalLessons = lessons.length
  const completedLessons = lessons.filter(l => isLessonCompleted(l.id)).length
  const progressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0

  const openLesson = (lesson) => {
    setActiveLesson(lesson)
    setQuizMode(false)
    setQuizAnswers({})
    setQuizResult(null)
    setError('')
  }

  const markLessonComplete = async (lessonId) => {
    const lessonQuizzes = quizzes.filter(q => q.lesson_id === lessonId)
    if (lessonQuizzes.length > 0) {
      setQuizMode(true)
      return
    }
    // Sin quiz — marcar directamente como completada
    await saveProgress(lessonId, true, true)
  }

  const saveProgress = async (lessonId, completed, quizPassed, attempts = 0) => {
    try {
      const existing = getLessonProgress(lessonId)
      const body = {
        operator_id: user.id, lesson_id: lessonId,
        completed, quiz_passed: quizPassed,
        attempts: (existing?.attempts || 0) + attempts,
        completed_at: completed ? new Date().toISOString() : null,
      }
      const method = existing ? 'PATCH' : 'POST'
      const url = existing
        ? `${SUPABASE_URL}/rest/v1/operator_progress?operator_id=eq.${user.id}&lesson_id=eq.${lessonId}`
        : `${SUPABASE_URL}/rest/v1/operator_progress`
      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setProgress(prev => {
          const idx = prev.findIndex(p => p.lesson_id === lessonId)
          if (idx >= 0) { const updated = [...prev]; updated[idx] = { ...updated[idx], ...body }; return updated }
          return [...prev, { ...body, id: Date.now() }]
        })
      }
    } catch (err) { console.error('saveProgress:', err) }
  }

  const submitQuiz = async () => {
    const lessonQuizzes = quizzes.filter(q => q.lesson_id === activeLesson.id)
    const correct = lessonQuizzes.every(q => quizAnswers[q.id] === q.correct_answer)
    const prog = getLessonProgress(activeLesson.id)
    const currentAttempts = (prog?.attempts || 0) + 1

    // Verificar bloqueo por 24h
    if (prog?.completed_at && !prog.completed) {
      const lastAttempt = new Date(prog.completed_at)
      const hoursSince = (Date.now() - lastAttempt.getTime()) / (1000 * 60 * 60)
      if (currentAttempts >= 3 && hoursSince < 24) {
        setError(`Alcanzaste el límite de intentos. Intenta de nuevo en ${Math.ceil(24 - hoursSince)} horas.`)
        return
      }
    }

    setSubmitting(true)
    setQuizResult(correct ? 'pass' : 'fail')
    await saveProgress(activeLesson.id, correct, correct, 1)
    if (!correct && currentAttempts >= 3) {
      // Guardar timestamp del bloqueo
      await fetch(`${SUPABASE_URL}/rest/v1/operator_progress?operator_id=eq.${user.id}&lesson_id=eq.${activeLesson.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ completed_at: new Date().toISOString() }),
      })
    }
    setSubmitting(false)
  }

  const uploadBeforeAfter = async (file) => {
    if (!file) return
    setUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `certifications/${user.id}/before_after_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('service-photos').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('service-photos').getPublicUrl(path)
      setBeforeAfterPhoto(publicUrl)
    } catch (err) { setError('Error al subir foto: ' + err.message) }
    finally { setUploadingPhoto(false) }
  }

  const submitCertification = async () => {
    if (!beforeAfterPhoto) { setError('Debes subir una foto de antes y después'); return }
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/operator_certifications`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ operator_id: user.id, before_after_photo_url: beforeAfterPhoto }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setCertSubmitted(true)
    } catch (err) { setError('Error al enviar: ' + err.message) }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 48 }}>🎓</div>
      <div style={{ fontSize: 15, color: '#6b7280', fontWeight: 600 }}>Cargando Academia...</div>
    </div>
  )

  // Vista de lección activa
  if (activeLesson) {
    const lessonQuizzes = quizzes.filter(q => q.lesson_id === activeLesson.id)
    const prog = getLessonProgress(activeLesson.id)

    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 40 }}>
        {/* Header */}
        <div style={{ background: '#1e40af', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => { setActiveLesson(null); setQuizMode(false); setQuizResult(null) }}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 36, height: 36, color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>←</button>
          <div style={{ flex: 1 }}>
            <div style={{ color: '#bfdbfe', fontSize: 11 }}>Certificación Pro</div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{activeLesson.title}</div>
          </div>
          {isLessonCompleted(activeLesson.id) && <span style={{ background: '#10b981', borderRadius: 20, padding: '3px 10px', color: '#fff', fontSize: 12, fontWeight: 700 }}>✓ Completada</span>}
        </div>

        <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
          {!quizMode ? (
            <>
              {/* Contenido */}
              {activeLesson.content_type === 'video' && activeLesson.content_url && (
                <div style={{ marginBottom: 20, borderRadius: 14, overflow: 'hidden', background: '#000', aspectRatio: '9/16', maxHeight: 480, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <video src={activeLesson.content_url} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    controlsList="nodownload" playsInline />
                </div>
              )}

              {activeLesson.content_type === 'infografia' && activeLesson.content_url && (
                <div style={{ marginBottom: 20, borderRadius: 14, overflow: 'hidden', border: '2px solid #e5e7eb' }}>
                  <img src={activeLesson.content_url} alt={activeLesson.title} style={{ width: '100%', display: 'block' }} />
                </div>
              )}

              {activeLesson.content_body && (
                <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', marginBottom: 20, border: '1px solid #e5e7eb', fontSize: 14, color: '#374151', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                  {activeLesson.content_body}
                </div>
              )}

              {/* Badge tipo infografía guardable */}
              <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>💡 Guarda esta info para consulta offline</div>
                <div style={{ fontSize: 12, color: '#78716c' }}>Esta lección se guarda automáticamente en tu dispositivo para consultarla sin internet.</div>
              </div>

              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>⚠️ {error}</div>}

              {!isLessonCompleted(activeLesson.id) && (
                <button onClick={() => markLessonComplete(activeLesson.id)}
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
                  {lessonQuizzes.length > 0 ? '📝 Tomar evaluación' : '✅ Marcar como completada'}
                </button>
              )}

              {isLessonCompleted(activeLesson.id) && (
                <div style={{ textAlign: 'center', padding: '16px', background: '#f0fdf4', borderRadius: 12, border: '1.5px solid #bbf7d0' }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>✅</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#065f46' }}>¡Lección completada!</div>
                </div>
              )}
            </>
          ) : (
            // Quiz
            <>
              <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', marginBottom: 20, border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', marginBottom: 6 }}>📝 Evaluación</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>Responde correctamente el 100% para completar la lección. Tienes 3 intentos.</div>

                {lessonQuizzes.map((q, qi) => (
                  <div key={q.id} style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1f2937', marginBottom: 10 }}>
                      {qi + 1}. {q.question}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(q.options || []).map((opt, oi) => (
                        <button key={oi} onClick={() => !quizResult && setQuizAnswers(prev => ({ ...prev, [q.id]: oi }))}
                          style={{
                            padding: '10px 14px', borderRadius: 10, border: `2px solid ${
                              quizResult
                                ? oi === q.correct_answer ? '#10b981'
                                : quizAnswers[q.id] === oi ? '#dc2626' : '#e5e7eb'
                                : quizAnswers[q.id] === oi ? '#3b82f6' : '#e5e7eb'
                            }`,
                            background: quizResult
                              ? oi === q.correct_answer ? '#f0fdf4'
                              : quizAnswers[q.id] === oi ? '#fef2f2' : '#fff'
                              : quizAnswers[q.id] === oi ? '#eff6ff' : '#fff',
                            fontSize: 13, color: '#374151', textAlign: 'left', cursor: quizResult ? 'default' : 'pointer',
                            fontWeight: quizAnswers[q.id] === oi ? 700 : 400,
                          }}>
                          {String.fromCharCode(65 + oi)}. {opt}
                          {quizResult && oi === q.correct_answer && ' ✓'}
                          {quizResult && quizAnswers[q.id] === oi && oi !== q.correct_answer && ' ✗'}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {quizResult === 'pass' && (
                <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '16px', textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#065f46' }}>¡Aprobaste!</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Lección completada con éxito</div>
                </div>
              )}

              {quizResult === 'fail' && (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '16px', textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>❌</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#991b1b' }}>Respuesta incorrecta</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Revisa el contenido y vuelve a intentarlo</div>
                </div>
              )}

              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>⚠️ {error}</div>}

              {!quizResult && (
                <button onClick={submitQuiz} disabled={submitting || Object.keys(quizAnswers).length < lessonQuizzes.length}
                  style={{ width: '100%', padding: '14px', background: Object.keys(quizAnswers).length < lessonQuizzes.length ? '#9ca3af' : 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
                  {submitting ? '⏳ Evaluando...' : '📤 Enviar respuestas'}
                </button>
              )}

              {quizResult && (
                <button onClick={() => { setActiveLesson(null); setQuizMode(false); setQuizResult(null); fetchAll() }}
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 52 }}>
                  ← Volver al curso
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // Vista principal del curso
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af,#1e3a8a)', padding: '20px 20px 24px' }}>
        {onBack && (
          <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 12px', color: '#fff', fontSize: 13, cursor: 'pointer', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            ← Volver
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 44 }}>🎓</div>
          <div>
            <div style={{ color: '#bfdbfe', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>MAZ CLEAN</div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>Certificación Pro</div>
            <div style={{ color: '#93c5fd', fontSize: 13 }}>Academia Código Limpio</div>
          </div>
        </div>

        {/* Barra de progreso */}
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 20, height: 10, marginBottom: 8 }}>
          <div style={{ background: '#10b981', borderRadius: 20, height: 10, width: `${progressPct}%`, transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ color: '#bfdbfe', fontSize: 12 }}>
          {completedLessons} de {totalLessons} lecciones completadas — {progressPct}%
        </div>
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626' }}>⚠️ {error}</div>}

        {/* Estado de certificación */}
        {profile?.is_certified && (
          <div style={{ background: 'linear-gradient(135deg,#065f46,#10b981)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 36 }}>🏆</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>¡Operador Certificado Pro!</div>
              <div style={{ color: '#d1fae5', fontSize: 12, marginTop: 2 }}>
                Certificado desde {profile.certification_date ? new Date(profile.certification_date).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) : 'fecha no disponible'}
              </div>
            </div>
          </div>
        )}

        {/* Módulos */}
        {modules.map((mod, mi) => {
          const modLessons = lessons.filter(l => l.module_id === mod.id)
          const modCompleted = isModuleCompleted(mod.id)
          const modProgress = modLessons.filter(l => isLessonCompleted(l.id)).length
          const isLocked = mi > 0 && !isModuleCompleted(modules[mi - 1]?.id)

          return (
            <div key={mod.id} style={{ background: '#fff', borderRadius: 16, marginBottom: 16, overflow: 'hidden', border: `2px solid ${modCompleted ? '#bbf7d0' : '#e5e7eb'}`, opacity: isLocked ? 0.6 : 1 }}>
              {/* Header módulo */}
              <div style={{ background: modCompleted ? 'linear-gradient(135deg,#065f46,#10b981)' : MODULE_COLORS[mi] || MODULE_COLORS[0], padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 28 }}>{MODULE_ICONS[mi] || '📚'}</span>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{mod.title}</div>
                    <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 }}>{mod.description}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  {isLocked ? (
                    <span style={{ fontSize: 20 }}>🔒</span>
                  ) : modCompleted ? (
                    <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '3px 10px', color: '#fff', fontSize: 12, fontWeight: 700 }}>✓ Completado</span>
                  ) : (
                    <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>{modProgress}/{modLessons.length}</span>
                  )}
                </div>
              </div>

              {/* Lecciones */}
              {!isLocked && (
                <div style={{ padding: '8px 0' }}>
                  {modLessons.map((lesson, li) => {
                    const completed = isLessonCompleted(lesson.id)
                    const locked = isLessonLocked(lesson, mi)
                    const typeIcon = lesson.content_type === 'video' ? '▶️' : lesson.content_type === 'infografia' ? '🖼️' : '📄'
                    const duration = lesson.duration_seconds ? `${Math.ceil(lesson.duration_seconds / 60)} min` : ''

                    return (
                      <button key={lesson.id} onClick={() => !locked && openLesson(lesson)} disabled={locked}
                        style={{ width: '100%', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', borderBottom: li < modLessons.length - 1 ? '1px solid #f3f4f6' : 'none', cursor: locked ? 'not-allowed' : 'pointer', textAlign: 'left' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: completed ? '#f0fdf4' : '#f3f4f6', border: `2px solid ${completed ? '#10b981' : '#e5e7eb'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
                          {completed ? '✓' : typeIcon}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: locked ? '#9ca3af' : '#1f2937' }}>{lesson.title}</div>
                          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                            {lesson.content_type === 'video' ? 'Video' : lesson.content_type === 'infografia' ? 'Infografía' : 'Lectura'}
                            {duration && ` · ${duration}`}
                            {quizzes.filter(q => q.lesson_id === lesson.id).length > 0 && ' · Con evaluación'}
                          </div>
                        </div>
                        {!locked && !completed && <span style={{ color: '#9ca3af', fontSize: 18 }}>›</span>}
                        {completed && <span style={{ color: '#10b981', fontSize: 14, fontWeight: 700 }}>✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}

              {isLocked && (
                <div style={{ padding: '12px 18px', color: '#9ca3af', fontSize: 13, textAlign: 'center' }}>
                  🔒 Completa el módulo anterior para desbloquear
                </div>
              )}
            </div>
          )
        })}

        {/* Pantalla de finalización — todos los módulos completados */}
        {allModulesCompleted && !profile?.is_certified && (
          <div style={{ background: 'linear-gradient(135deg,#7c3aed,#5b21b6)', borderRadius: 16, padding: '22px 20px', marginBottom: 20, border: '2px solid #a78bfa' }}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 52, marginBottom: 10 }}>🏆</div>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 20, marginBottom: 8 }}>¡Felicidades, ya eres un Pro!</div>
              <div style={{ color: '#ede9fe', fontSize: 14, lineHeight: 1.7 }}>
                Completaste los 4 módulos de la Academia Código Limpio. Tu certificación está siendo procesada — recibirás confirmación por WhatsApp en breve.
              </div>
            </div>

            {/* Mensaje según estado de membresía */}
            {effectivePromo?.free_first_month ? (
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '16px', border: '1.5px solid rgba(255,255,255,0.25)' }}>
                <div style={{ fontSize: 22, textAlign: 'center', marginBottom: 8 }}>🎁</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, textAlign: 'center', marginBottom: 6 }}>
                  ¡Tu primer mes es GRATIS!
                </div>
                <div style={{ color: '#ede9fe', fontSize: 13, lineHeight: 1.7, textAlign: 'center' }}>
                  Tienes una promoción activa — no pagas membresía este mes. Actívala ahora y empieza a recibir servicios desde hoy. A partir del segundo mes son solo ${membershipConfig?.operator_price || 200} MXN/mes.
                </div>
              </div>
            ) : effectivePromo?.has_promo ? (
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '16px', border: '1.5px solid rgba(255,255,255,0.25)' }}>
                <div style={{ fontSize: 22, textAlign: 'center', marginBottom: 8 }}>⚡</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, textAlign: 'center', marginBottom: 6 }}>
                  ¡Precio especial de lanzamiento!
                </div>
                <div style={{ color: '#ede9fe', fontSize: 13, lineHeight: 1.7, textAlign: 'center' }}>
                  Activa tu membresía hoy por solo ${effectivePromo?.effective_price || membershipConfig?.operator_price} MXN este mes y empieza a generar ingresos de inmediato.
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 14, padding: '16px', border: '1.5px solid rgba(255,255,255,0.25)' }}>
                <div style={{ fontSize: 22, textAlign: 'center', marginBottom: 8 }}>🚀</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, textAlign: 'center', marginBottom: 6 }}>
                  ¡Un paso más para generar ingresos!
                </div>
                <div style={{ color: '#ede9fe', fontSize: 13, lineHeight: 1.7, textAlign: 'center' }}>
                  Activa tu membresía por solo ${membershipConfig?.operator_price || 200} MXN/mes y empieza a recibir servicios desde hoy. Con dos servicios ya comienzas a tener ganancias.
                </div>
              </div>
            )}

            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, textAlign: 'center', marginTop: 12 }}>
              Activa tu membresía desde la pantalla principal del Panel Operador
            </div>
          </div>
        )}

        {/* Info para nuevos operadores */}
        {!allModulesCompleted && (
          <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 6 }}>ℹ️ ¿Por qué la Certificación Pro?</div>
            <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.7 }}>
              La certificación te acredita como operador de calidad verificada. Los clientes con membresía Premium saben que cada operador en nuestra red cumple estándares profesionales. 🏆
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
