// src/AdminLeads.jsx
// Panel de prospectos — v2.0
// Cambios: hilo de conversación integrado (igual que MessagingInbox)
// El botón WhatsApp externo se reemplaza por "Ver conversación"
// Si el número tiene mensajes en la tabla messages, los muestra
// Si no tiene, permite enviar el primer mensaje

import React, { useState, useEffect, useCallback, useRef } from 'react'
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

function timeAgo(dateStr) {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 60)  return `hace ${mins} min`
  if (hours < 24) return `hace ${hours}h`
  return `hace ${days}d`
}

function formatPhone(phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+52 ${digits.slice(2,4)} ${digits.slice(4,8)} ${digits.slice(8)}`
  }
  return phone
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
}

// Normaliza el teléfono del lead al formato conversation_id (+521XXXXXXXXXX)
function toConversationId(phone) {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('521') && digits.length === 13) return '+' + digits
  if (digits.startsWith('52')  && digits.length === 12) return '+' + digits
  if (digits.length === 10) return '+52' + digits
  return '+' + digits
}

// ── Hilo de conversación — reutiliza la misma lógica que MessagingInbox ────────
function LeadConversationThread({ lead, onBack, isMobile }) {
  const token         = getToken()
  const convId        = toConversationId(lead.phone)
  const [messages, setMessages] = useState([])
  const [reply, setReply]       = useState('')
  const [sending, setSending]   = useState(false)
  const [loading, setLoading]   = useState(true)
  const bottomRef               = useRef(null)

  const fetchMessages = async () => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${encodeURIComponent(convId)}&order=created_at.asc`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      const data = await res.json()
      if (Array.isArray(data)) setMessages(data)
      // Marcar inbound como leídos
      await fetch(
        `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${encodeURIComponent(convId)}&direction=eq.inbound&read_at=is.null`,
        {
          method:  'PATCH',
          headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body:    JSON.stringify({ read_at: new Date().toISOString() }),
        }
      )
    } catch (e) { console.error('fetchMessages lead:', e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    fetchMessages()
    const channel = supabase
      .channel(`lead-thread-${convId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${convId}` },
        () => fetchMessages())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [convId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const sendReply = async () => {
    if (!reply.trim() || sending) return
    setSending(true)
    try {
      // Enviar por WhatsApp via Edge Function
      await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY },
        body:    JSON.stringify({ event: 'free_message', phone: convId, booking: { free_text: reply.trim() } }),
      })
      // Guardar en DB
      await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body:    JSON.stringify({
          conversation_id: convId,
          from_phone:      'mazclean',
          to_phone:        convId,
          direction:       'outbound',
          channel:         'whatsapp',
          sender_role:     'admin',
          content:         reply.trim(),
          read_at:         new Date().toISOString(),
        }),
      })
      setReply('')
      await fetchMessages()
    } catch (e) { console.error('sendReply lead:', e) }
    finally { setSending(false) }
  }

  const displayName = lead.profile?.full_name || formatPhone(lead.phone)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden', height: isMobile ? 'calc(100vh - 160px)' : 580 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#7c3aed', color: '#fff' }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 16, color: '#fff', padding: '4px 10px', fontWeight: 700 }}>← Volver</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{displayName}</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>{formatPhone(lead.phone)} · Prospecto Facebook</div>
        </div>
        <button onClick={() => navigator.clipboard?.writeText(lead.phone)}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 12, color: '#fff' }}>
          📋
        </button>
        <button onClick={fetchMessages}
          style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 14, color: '#fff' }}>
          ↻
        </button>
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8, background: '#f9fafb' }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, paddingTop: 40 }}>Cargando conversación...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, paddingTop: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div>Sin mensajes aún</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Escribe abajo para iniciar la conversación con este prospecto</div>
          </div>
        ) : messages.map(msg => (
          <div key={msg.id || msg.created_at} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
            {msg.direction === 'outbound' && (
              <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2, paddingRight: 4 }}>
                {msg.from_phone === 'mazclean' ? '👤 Asesor' : '🤖 Max (bot)'}
              </div>
            )}
            <div style={{
              maxWidth:     '75%',
              background:   msg.direction === 'outbound'
                ? (msg.from_phone === 'mazclean' ? '#059669' : '#3b82f6')
                : '#fff',
              color:        msg.direction === 'outbound' ? '#fff' : '#111827',
              borderRadius: msg.direction === 'outbound' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              padding:      '8px 12px',
              boxShadow:    '0 1px 3px rgba(0,0,0,0.08)',
              fontSize:     13,
              lineHeight:   1.5,
            }}>
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>
                {formatTime(msg.created_at)} {msg.direction === 'outbound' && '✓✓'}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: 12, background: '#fff', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
        <textarea
          value={reply}
          onChange={e => setReply(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
          placeholder="Escribe un mensaje... (Enter para enviar)"
          rows={2}
          style={{ flex: 1, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none' }}
        />
        <button
          onClick={sendReply}
          disabled={!reply.trim() || sending}
          style={{
            background: (reply.trim() && !sending) ? '#7c3aed' : '#e5e7eb',
            color:      (reply.trim() && !sending) ? '#fff'    : '#9ca3af',
            border: 'none', borderRadius: 10, padding: '0 16px',
            cursor: (reply.trim() && !sending) ? 'pointer' : 'default',
            fontSize: 13, fontWeight: 600, minWidth: 72,
          }}
        >
          {sending ? '⏳' : '📤 Enviar'}
        </button>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AdminLeads({ isMobile }) {
  const [leads, setLeads]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [filter, setFilter]         = useState('all')
  const [search, setSearch]         = useState('')
  const [selectedLead, setSelectedLead] = useState(null) // lead seleccionado para ver conversación
  const [msgCounts, setMsgCounts]   = useState({}) // { conversationId: count }

  const fetchLeads = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/ad_leads?order=created_at.desc&limit=100&select=*,profile:profile_id(id,full_name,role,membership_status)`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (!res.ok) throw new Error('Error al cargar prospectos')
      const data = await res.json()
      setLeads(data)
      // Cargar conteo de mensajes por conversación
      fetchMsgCounts(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  const fetchMsgCounts = async (leadsData) => {
    try {
      // Traer todos los conversation_ids de los leads
      const convIds = leadsData.map(l => toConversationId(l.phone))
      if (!convIds.length) return
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?conversation_id=in.(${convIds.map(c => `"${c}"`).join(',')})&select=conversation_id`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (!res.ok) return
      const data = await res.json()
      const counts = {}
      for (const msg of data) {
        counts[msg.conversation_id] = (counts[msg.conversation_id] || 0) + 1
      }
      setMsgCounts(counts)
    } catch {}
  }

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const filtered = leads.filter(lead => {
    const matchSearch = search === '' ||
      lead.phone.includes(search) ||
      lead.ad_message?.toLowerCase().includes(search.toLowerCase()) ||
      lead.profile?.full_name?.toLowerCase().includes(search.toLowerCase())
    const matchFilter =
      filter === 'all'        ? true :
      filter === 'registered' ? !!lead.profile :
      filter === 'pending'    ? !lead.profile  : true
    return matchSearch && matchFilter
  })

  const totalRegistered = leads.filter(l => !!l.profile).length
  const totalPending    = leads.filter(l => !l.profile).length

  // ── Vista de conversación ──────────────────────────────────────────────────
  if (selectedLead) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <LeadConversationThread
          lead={selectedLead}
          onBack={() => { setSelectedLead(null); fetchLeads() }}
          isMobile={isMobile}
        />
      </div>
    )
  }

  // ── Vista de lista ─────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', borderRadius: 16, padding: '16px 20px', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>🎯 Prospectos — Anuncio Facebook</div>
        <div style={{ fontSize: 13, color: '#ddd6fe', lineHeight: 1.5 }}>
          Personas que llegaron desde el anuncio de reclutamiento de operadores
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          {[
            { label: 'Total leads',   value: leads.length,    color: '#fff' },
            { label: 'Registrados',   value: totalRegistered, color: '#86efac' },
            { label: 'Sin registrar', value: totalPending,    color: '#fde68a' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#ddd6fe', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { id: 'all',        label: `Todos (${leads.length})` },
          { id: 'pending',    label: `Sin registrar (${totalPending})` },
          { id: 'registered', label: `Registrados (${totalRegistered})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{ padding: '7px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: filter === f.id ? '#7c3aed' : '#f3f4f6',
              color:      filter === f.id ? '#fff' : '#6b7280' }}>
            {f.label}
          </button>
        ))}
        <button onClick={fetchLeads}
          style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 99, border: '1px solid #e5e7eb',
            background: '#fff', fontSize: 12, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
          🔄 Actualizar
        </button>
      </div>

      {/* Búsqueda */}
      <input
        placeholder="Buscar por teléfono, nombre o mensaje..."
        value={search} onChange={e => setSearch(e.target.value)}
        style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb',
          fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
      />

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#dc2626' }}>
          ⚠️ {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>⏳ Cargando prospectos...</div>
      )}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
          {leads.length === 0
            ? 'Aún no hay prospectos — cuando alguien llegue del anuncio aparecerá aquí'
            : 'No hay resultados para esta búsqueda'}
        </div>
      )}

      {/* Lista de leads */}
      {!loading && filtered.map(lead => {
        const isRegistered = !!lead.profile
        const membershipOk = lead.profile?.membership_status === 'activa'
        const convId       = toConversationId(lead.phone)
        const msgCount     = msgCounts[convId] || 0
        const hasMessages  = msgCount > 0

        return (
          <div key={lead.id} style={{ background: '#fff', borderRadius: 14,
            border: `1px solid ${isRegistered ? '#bbf7d0' : '#e5e7eb'}`,
            overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

            {/* Header del card */}
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937', marginBottom: 2 }}>
                  {lead.profile?.full_name || formatPhone(lead.phone)}
                </div>
                {lead.profile?.full_name && (
                  <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                    {formatPhone(lead.phone)}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  📅 {timeAgo(lead.created_at)} · {new Date(lead.created_at).toLocaleDateString('es-MX')}
                </div>
              </div>

              {/* Status badges */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '3px 10px',
                  background: isRegistered ? '#f0fdf4' : '#fffbeb',
                  color:      isRegistered ? '#059669' : '#d97706',
                  border:     `1px solid ${isRegistered ? '#bbf7d0' : '#fde68a'}`
                }}>
                  {isRegistered ? '✅ Registrado' : '⏳ Sin registrar'}
                </span>
                {isRegistered && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '3px 10px',
                    background: membershipOk ? '#eff6ff' : '#f9fafb',
                    color:      membershipOk ? '#1e40af' : '#6b7280',
                    border:     `1px solid ${membershipOk ? '#bfdbfe' : '#e5e7eb'}`
                  }}>
                    {membershipOk ? '💳 Membresía activa' : '💳 Sin membresía'}
                  </span>
                )}
              </div>
            </div>

            {/* Mensaje original del anuncio */}
            {lead.ad_message && (
              <div style={{ margin: '0 16px 12px', padding: '8px 12px',
                background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Mensaje del anuncio
                </div>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                  "{lead.ad_message}"
                </div>
              </div>
            )}

            {/* Footer — fuente + botón conversación */}
            <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                📢 {lead.source === 'facebook_ad' ? 'Anuncio Facebook' : lead.source}
                {hasMessages && (
                  <span style={{ marginLeft: 8, background: '#7c3aed', color: '#fff', borderRadius: 99, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
                    {msgCount} msgs
                  </span>
                )}
              </span>

              {/* Botón — Ver/Iniciar conversación en lugar de WhatsApp externo */}
              <button
                onClick={() => setSelectedLead(lead)}
                style={{
                  padding: '7px 16px',
                  background: hasMessages ? '#7c3aed' : '#6366f1',
                  border: 'none', borderRadius: 99,
                  color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}>
                💬 {hasMessages ? `Ver conversación (${msgCount})` : 'Iniciar conversación'}
              </button>
            </div>
          </div>
        )
      })}

      {!loading && leads.length > 0 && (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', paddingBottom: 8 }}>
          Mostrando {filtered.length} de {leads.length} prospectos
        </div>
      )}
    </div>
  )
}
