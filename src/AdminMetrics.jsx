// src/AdminMetrics.jsx
// Dashboard de métricas y analíticas para MAZ CLEAN
// Muestra visitas, conversiones, funnel y fuentes de tráfico
// Solo visible para admins — lee de analytics_events en Supabase

import React, { useState, useEffect, useCallback } from 'react'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

function getToken() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (stored) { const p = JSON.parse(stored); return p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY }
  } catch {}
  return SUPABASE_ANON_KEY
}

function fmt(n) { return (n || 0).toLocaleString('es-MX') }
function pct(a, b) { return b === 0 ? '0%' : Math.round((a / b) * 100) + '%' }

// ── Tarjeta KPI ───────────────────────────────────────────────────────────────
function KPICard({ icon, label, value, sub, color = '#3b82f6', loading }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '16px 18px', border: '1.5px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flex: 1, minWidth: 140 }}>
      <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
      {loading ? (
        <div style={{ height: 28, background: '#f3f4f6', borderRadius: 6, marginBottom: 4, animation: 'pulse 1.5s infinite' }} />
      ) : (
        <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{fmt(value)}</div>
      )}
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Barra de funnel ───────────────────────────────────────────────────────────
function FunnelBar({ label, value, max, color, pctVal }) {
  const w = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{fmt(value)} <span style={{ color: '#9ca3af', fontWeight: 400 }}>({pctVal})</span></span>
      </div>
      <div style={{ background: '#f3f4f6', borderRadius: 99, height: 10, overflow: 'hidden' }}>
        <div style={{ width: w + '%', height: '100%', background: color, borderRadius: 99, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AdminMetrics() {
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [range, setRange]         = useState('7d') // '1d' | '7d' | '30d'
  const [events, setEvents]       = useState([])
  const [lastRefresh, setLastRefresh] = useState(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const days = range === '1d' ? 1 : range === '7d' ? 7 : 30
      const since = new Date(Date.now() - days * 86400000).toISOString()
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/analytics_events?created_at=gte.${since}&order=created_at.desc&limit=5000&select=event_name,session_id,user_id,metadata,created_at`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (!res.ok) throw new Error('Error al cargar métricas')
      const data = await res.json()
      setEvents(Array.isArray(data) ? data : [])
      setLastRefresh(new Date())
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [range])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // ── Calcular métricas ──────────────────────────────────────────────────────
  const byName = (name) => events.filter(e => e.event_name === name)

  const uniqueSessions  = new Set(events.map(e => e.session_id)).size
  const pageViews       = byName('page_view').length
  const clicksOperador  = byName('click_quiero_operador').length
  const clicksReservar  = byName('click_reservar').length
  const onboardingStart = byName('onboarding_start').length
  const onboardingEnd   = byName('onboarding_complete').length
  const fbArrivals      = byName('facebook_ad_arrival').length
  const loginSuccess    = byName('login_success').length
  const bookingDone     = byName('booking_completed').length
  const sessionStarts   = byName('session_start').length

  // Fuentes de tráfico
  const sources = events.reduce((acc, e) => {
    const src = e.metadata?.source || 'direct'
    acc[src] = (acc[src] || 0) + 1
    return acc
  }, {})
  const topSources = Object.entries(sources).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Páginas más visitadas
  const pages = byName('page_view').reduce((acc, e) => {
    const p = e.metadata?.page || e.page || '/'
    acc[p] = (acc[p] || 0) + 1
    return acc
  }, {})
  const topPages = Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 5)

  // Eventos recientes
  const recentEvents = events.slice(0, 20)

  // Tasa de conversión operador
  const convRate = uniqueSessions > 0 ? Math.round((onboardingEnd / uniqueSessions) * 100) : 0

  const SOURCE_ICONS = { facebook_ads: '📘', google: '🔍', direct: '🔗', whatsapp: '💬' }
  const EVENT_LABELS = {
    page_view: '👁️ Vista de página', click_quiero_operador: '🔧 Clic "Quiero ser Operador"',
    click_reservar: '📅 Clic "Reservar"', onboarding_start: '📝 Inicio de onboarding',
    onboarding_complete: '✅ Onboarding completado', facebook_ad_arrival: '📘 Llegada desde Facebook',
    login_success: '🔑 Login exitoso', booking_completed: '🚗 Reserva completada',
    session_start: '🟢 Inicio de sesión', auth_modal_open: '🔒 Modal de auth',
    booking_started: '📅 Inicio de reserva', onboarding_step: '👣 Paso de onboarding',
  }

  const rangeLabel = range === '1d' ? 'hoy' : range === '7d' ? 'últimos 7 días' : 'últimos 30 días'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 16, padding: '16px 20px', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 2 }}>📊 Métricas y Analíticas</div>
            <div style={{ fontSize: 13, color: '#bfdbfe' }}>Actividad real de visitantes y usuarios — excluye admins</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['1d','Hoy'],['7d','7 días'],['30d','30 días']].map(([v,l]) => (
              <button key={v} onClick={() => setRange(v)}
                style={{ padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  background: range === v ? '#fff' : 'rgba(255,255,255,0.15)',
                  color:      range === v ? '#1e40af' : '#fff' }}>
                {l}
              </button>
            ))}
            <button onClick={fetchEvents}
              style={{ padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 14,
                background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              ↻
            </button>
          </div>
        </div>
        {lastRefresh && (
          <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 8 }}>
            Actualizado: {lastRefresh.toLocaleTimeString('es-MX')} · Mostrando {rangeLabel}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#dc2626' }}>
          ⚠️ {error} — <button onClick={fetchEvents} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700 }}>Reintentar</button>
        </div>
      )}

      {/* Sin datos */}
      {!loading && !error && events.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 14, padding: '40px 20px', textAlign: 'center', border: '1.5px dashed #e5e7eb' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Sin datos aún</div>
          <div style={{ fontSize: 13, color: '#6b7280', maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
            Los eventos comenzarán a registrarse cuando instrumentes los componentes con <code>Analytics.pageView()</code> y demás funciones de <code>src/lib/analytics.js</code>.
          </div>
        </div>
      )}

      {events.length > 0 && (
        <>
          {/* KPIs principales */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>🎯 Métricas clave — {rangeLabel}</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <KPICard icon="👥" label="Sesiones únicas"    value={uniqueSessions}  color="#1e40af" loading={loading} />
              <KPICard icon="👁️" label="Vistas de página"   value={pageViews}       color="#7c3aed" loading={loading} />
              <KPICard icon="🔧" label="Clics 'Operador'"   value={clicksOperador}  color="#059669" loading={loading} />
              <KPICard icon="📅" label="Clics 'Reservar'"   value={clicksReservar}  color="#d97706" loading={loading} />
              <KPICard icon="✅" label="Onboarding completado" value={onboardingEnd} sub={`${convRate}% conversión`} color="#059669" loading={loading} />
              <KPICard icon="🚗" label="Reservas completadas" value={bookingDone}   color="#0891b2" loading={loading} />
            </div>
          </div>

          {/* Funnel de conversión */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', border: '1.5px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 16 }}>🔽 Funnel de conversión — Operadores</div>
            <FunnelBar label="Sesiones únicas"         value={uniqueSessions}  max={uniqueSessions} color="#1e40af" pctVal="100%" />
            <FunnelBar label="Clic 'Quiero ser Operador'" value={clicksOperador} max={uniqueSessions} color="#7c3aed" pctVal={pct(clicksOperador, uniqueSessions)} />
            <FunnelBar label="Inició onboarding"       value={onboardingStart} max={uniqueSessions} color="#d97706" pctVal={pct(onboardingStart, uniqueSessions)} />
            <FunnelBar label="Completó onboarding"     value={onboardingEnd}   max={uniqueSessions} color="#059669" pctVal={pct(onboardingEnd, uniqueSessions)} />
            <div style={{ marginTop: 12, padding: '10px 14px', background: onboardingEnd > 0 ? '#f0fdf4' : '#f9fafb', borderRadius: 10, fontSize: 13, color: onboardingEnd > 0 ? '#065f46' : '#6b7280', fontWeight: 600 }}>
              {onboardingEnd > 0
                ? `✅ De cada 100 visitantes, ${convRate} se convierten en operadores registrados`
                : '📊 Instrumenta los componentes para ver el funnel completo'}
            </div>
          </div>

          {/* Fuentes de tráfico + Páginas top */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

            {/* Fuentes */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', border: '1.5px solid #f3f4f6' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 14 }}>📡 Fuentes de tráfico</div>
              {loading ? (
                [1,2,3].map(i => <div key={i} style={{ height: 16, background: '#f3f4f6', borderRadius: 4, marginBottom: 10 }} />)
              ) : topSources.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: 13 }}>Sin datos</div>
              ) : topSources.map(([src, count]) => (
                <div key={src} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{SOURCE_ICONS[src] || '🌐'}</span>
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, textTransform: 'capitalize' }}>{src}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 60, height: 6, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: pct(count, events.length), height: '100%', background: '#3b82f6', borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#6b7280', minWidth: 30, textAlign: 'right' }}>{fmt(count)}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Páginas top */}
            <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', border: '1.5px solid #f3f4f6' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 14 }}>📄 Páginas más visitadas</div>
              {loading ? (
                [1,2,3].map(i => <div key={i} style={{ height: 16, background: '#f3f4f6', borderRadius: 4, marginBottom: 10 }} />)
              ) : topPages.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: 13 }}>Sin datos</div>
              ) : topPages.map(([page, count]) => (
                <div key={page} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: '#374151', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                    {page || '/'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 50, height: 6, background: '#f3f4f6', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: topPages[0] ? pct(count, topPages[0][1]) : '0%', height: '100%', background: '#7c3aed', borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#6b7280', minWidth: 28, textAlign: 'right' }}>{fmt(count)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Facebook Ads */}
          {fbArrivals > 0 && (
            <div style={{ background: 'linear-gradient(135deg,#eff6ff,#f0f9ff)', borderRadius: 14, padding: '14px 18px', border: '1.5px solid #bfdbfe' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginBottom: 10 }}>📘 Rendimiento Facebook Ads</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'Llegadas del anuncio', value: fbArrivals, color: '#1e40af' },
                  { label: 'Iniciaron onboarding', value: onboardingStart, color: '#7c3aed' },
                  { label: 'Completaron onboarding', value: onboardingEnd, color: '#059669' },
                  { label: 'Conversión anuncio→registro', value: pct(onboardingEnd, fbArrivals), color: '#d97706', raw: true },
                ].map(({ label, value, color, raw }) => (
                  <div key={label} style={{ flex: 1, minWidth: 120, background: '#fff', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color }}>{raw ? value : fmt(value)}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actividad reciente */}
          <div style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', border: '1.5px solid #f3f4f6' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#374151', marginBottom: 12 }}>⏱️ Actividad reciente</div>
            {loading ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0' }}>Cargando...</div>
            ) : recentEvents.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0', fontSize: 13 }}>Sin eventos recientes</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentEvents.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 12 }}>
                    <div style={{ flex: 1, fontWeight: 600, color: '#374151' }}>
                      {EVENT_LABELS[e.event_name] || e.event_name}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: 11, flexShrink: 0 }}>
                      {new Date(e.created_at).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {e.metadata?.source && e.metadata.source !== 'direct' && (
                      <span style={{ background: '#eff6ff', color: '#1e40af', borderRadius: 99, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                        {SOURCE_ICONS[e.metadata.source] || '🌐'} {e.metadata.source}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resumen total */}
          <div style={{ background: '#f9fafb', borderRadius: 12, padding: '12px 16px', border: '1px solid #e5e7eb', fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
            {fmt(events.length)} eventos registrados en {rangeLabel} · {fmt(uniqueSessions)} sesiones únicas
          </div>
        </>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  )
}
