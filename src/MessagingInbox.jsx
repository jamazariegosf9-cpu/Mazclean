// MessagingInbox.jsx v1.2
// Bandeja de mensajes WhatsApp entrantes para el Admin
// JS puro — sin TypeScript annotations

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './lib/supabase';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Hook para cargar conversaciones ──────────────────────────────────────────
function useConversations(token) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading]             = useState(true);

  const fetchConversations = async () => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?select=conversation_id,from_phone,sender_role,user_id,content,direction,read_at,created_at,is_escalation&order=created_at.desc`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      );
      const data = await res.json();
      if (!Array.isArray(data)) { setLoading(false); return; }

      // Agrupar por conversation_id
      // IMPORTANTE: el conversation_id ES el teléfono del usuario
      // Siempre usar datos del mensaje inbound para identificar al contacto
      const grouped = {};
      for (const msg of data) {
        if (!msg.conversation_id) continue;
        if (!grouped[msg.conversation_id]) {
          grouped[msg.conversation_id] = {
            conversation_id: msg.conversation_id,
            from_phone:      msg.conversation_id,
            sender_role:     msg.direction === 'inbound' ? msg.sender_role : 'desconocido',
            user_id:         msg.direction === 'inbound' ? msg.user_id : null,
            last_message:    msg.content,
            last_at:         msg.created_at,
            unread:          0,
            escalated:       false,
            admin_replied:   false,
          };
        }
        // Si encontramos un mensaje inbound, actualizar role y user_id del contacto real
        if (msg.direction === 'inbound') {
          grouped[msg.conversation_id].sender_role = msg.sender_role;
          grouped[msg.conversation_id].user_id     = msg.user_id;
          if (!msg.read_at) {
            grouped[msg.conversation_id].unread++;
          }
        }
        // Detectar si hubo escalación del bot
        if (msg.is_escalation) {
          grouped[msg.conversation_id].escalated = true;
        }
        // Detectar si el Admin ya respondió manualmente
        if (msg.direction === 'outbound' && msg.sender_role === 'admin' && msg.from_phone === 'mazclean') {
          grouped[msg.conversation_id].admin_replied = true;
        }
        // Actualizar último mensaje si es más reciente
        if (new Date(msg.created_at) > new Date(grouped[msg.conversation_id].last_at)) {
          grouped[msg.conversation_id].last_message = msg.content;
          grouped[msg.conversation_id].last_at      = msg.created_at;
        }
      }

      const sorted = Object.values(grouped).sort((a, b) =>
        new Date(b.last_at).getTime() - new Date(a.last_at).getTime()
      );
      setConversations(sorted);
    } catch (e) {
      console.error('fetchConversations:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();

    // Realtime — actualización instantánea cuando llega mensaje nuevo
    const channel = supabase
      .channel('messages-inbox')
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'messages',
      }, () => {
        fetchConversations();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [token]);

  return { conversations, loading, refetch: fetchConversations };
}

// ── Formato de hora ───────────────────────────────────────────────────────────
function formatTime(iso) {
  const d       = new Date(iso);
  const now     = new Date();
  const diffMs  = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7)  return d.toLocaleDateString('es-MX', { weekday: 'short' });
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

// ── Badge de rol ──────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const map = {
    cliente:     { label: 'Cliente',  color: '#1d4ed8', bg: '#eff6ff' },
    operador:    { label: 'Operador', color: '#065f46', bg: '#ecfdf5' },
    admin:       { label: 'Admin',    color: '#92400e', bg: '#fffbeb' },
    desconocido: { label: 'Nuevo',    color: '#7c3aed', bg: '#f5f3ff' },
  };
  const s = map[role] || map.desconocido;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, padding: '2px 6px', borderRadius: 10 }}>
      {s.label}
    </span>
  );
}

// ── Vista de conversación ─────────────────────────────────────────────────────
function ConversationThread({ conv, token, onBack, onRefetch, isMobile }) {
  const [messages, setMessages] = useState([]);
  const [reply, setReply]       = useState('');
  const [sending, setSending]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const bottomRef               = useRef(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${encodeURIComponent(conv.conversation_id)}&order=created_at.asc`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      );
      const data = await res.json();
      if (Array.isArray(data)) setMessages(data);

      // Marcar como leídos
      await fetch(
        `${SUPABASE_URL}/rest/v1/messages?conversation_id=eq.${encodeURIComponent(conv.conversation_id)}&direction=eq.inbound&read_at=is.null`,
        {
          method:  'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey':        SUPABASE_ANON_KEY,
            'Content-Type':  'application/json',
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify({ read_at: new Date().toISOString() }),
        }
      );
      onRefetch();
    } catch (e) { console.error('fetchMessages:', e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchMessages();

    // Realtime — actualización instantánea de mensajes en el hilo abierto
    const channel = supabase
      .channel(`messages-thread-${conv.conversation_id}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'messages',
        filter: `conversation_id=eq.${conv.conversation_id}`,
      }, () => {
        fetchMessages();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [conv.conversation_id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendReply = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey':        SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          event:   'free_message',
          phone:   conv.from_phone,
          booking: { free_text: reply.trim() },
        }),
      });

      await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey':        SUPABASE_ANON_KEY,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({
          conversation_id: conv.conversation_id,
          from_phone:      'mazclean',
          to_phone:        conv.from_phone,
          direction:       'outbound',
          channel:         'whatsapp',
          sender_role:     'admin',
          content:         reply.trim(),
          read_at:         new Date().toISOString(),
        }),
      });

      setReply('');
      await fetchMessages();
    } catch (e) { console.error('sendReply:', e); }
    finally { setSending(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'calc(100vh - 160px)' : 600, background: '#f9fafb', borderRadius: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fff', borderRadius: '12px 12px 0 0', borderBottom: '1px solid #e5e7eb' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', padding: 0 }}>←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{conv.from_phone}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <RoleBadge role={conv.sender_role} />
            {/* Botón copiar teléfono */}
            <button
              onClick={() => { navigator.clipboard?.writeText(conv.from_phone); }}
              title="Copiar teléfono"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9ca3af', padding: '0 2px' }}>
              📋
            </button>
          </div>
        </div>
        {/* Botón WhatsApp directo */}
        <button
          onClick={() => {
            const digits = conv.from_phone.replace(/\D/g, '')
            const wa = digits.startsWith('52') ? digits : '52' + digits.slice(-10)
            window.open(`https://wa.me/${wa}`, '_blank')
          }}
          title="Abrir en WhatsApp"
          style={{ background: '#25d366', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 13, color: '#fff', fontWeight: 700, flexShrink: 0 }}>
          💬 WA
        </button>
        <button onClick={fetchMessages} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>↻</button>
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Cargando...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Sin mensajes</div>
        ) : messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start', flexDirection: 'column', alignItems: msg.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
            {/* Etiqueta Bot vs Admin */}
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
              <div>{msg.content}</div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                {formatTime(msg.created_at)}
                {msg.direction === 'outbound' && <span title='Enviado'>✓✓</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input respuesta */}
      <div style={{ padding: 12, background: '#fff', borderRadius: '0 0 12px 12px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
        <textarea
          value={reply}
          onChange={e => setReply(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
          placeholder="Escribe una respuesta... (Enter para enviar)"
          rows={2}
          style={{ flex: 1, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none' }}
        />
        <button
          onClick={sendReply}
          disabled={!reply.trim() || sending}
          style={{
            background: (reply.trim() && !sending) ? '#3b82f6' : '#e5e7eb',
            color:      (reply.trim() && !sending) ? '#fff'    : '#9ca3af',
            border:     'none', borderRadius: 10, padding: '0 16px',
            cursor:     (reply.trim() && !sending) ? 'pointer' : 'default',
            fontSize:   13, fontWeight: 600, minWidth: 72,
          }}
        >
          {sending ? '⏳' : '📤 Enviar'}
        </button>
      </div>
    </div>
  );
}

// ── Componente principal: MessagingInbox ──────────────────────────────────────
export default function MessagingInbox({ token, isMobile }) {
  const { conversations, loading, refetch } = useConversations(token);
  const [selected, setSelected]             = useState(null);
  const [filter, setFilter]                 = useState('all'); // 'all' | 'escalated' | 'unread'

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Cargando conversaciones...</div>;
  }

  if (selected) {
    return (
      <ConversationThread
        conv={selected}
        token={token}
        onBack={() => setSelected(null)}
        onRefetch={refetch}
        isMobile={isMobile}
      />
    );
  }

  if (conversations.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Sin mensajes aún</div>
        <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.6 }}>
          Cuando un cliente u operador responda por WhatsApp,<br />aparecerá aquí.
        </div>
      </div>
    );
  }

  const totalUnread   = conversations.reduce((s, c) => s + c.unread, 0);
  const totalEscalated = conversations.filter(c => c.escalated && !c.admin_replied).length;

  const filtered = conversations.filter(c => {
    if (filter === 'escalated') return c.escalated && !c.admin_replied;
    if (filter === 'unread')    return c.unread > 0;
    return true;
  });

  return (
    <div style={{ marginTop: 8 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
          💬 Mensajes WhatsApp
          {totalUnread > 0 && (
            <span style={{ marginLeft: 8, background: '#ef4444', color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
              {totalUnread} nuevos
            </span>
          )}
        </div>
        <button onClick={refetch} style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#1e40af', cursor: 'pointer' }}>
          ↻ Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { id: 'all',       label: `Todos (${conversations.length})`,              color: '#6b7280', activeBg: '#f3f4f6' },
          { id: 'escalated', label: `🚨 Requieren asesor (${totalEscalated})`,      color: '#dc2626', activeBg: '#fef2f2' },
          { id: 'unread',    label: `🔵 Sin leer (${totalUnread})`,                 color: '#1d4ed8', activeBg: '#eff6ff' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: filter === f.id ? f.activeBg : '#f9fafb',
              color:      filter === f.id ? f.color    : '#9ca3af',
              boxShadow:  filter === f.id ? `0 0 0 1.5px ${f.color}` : 'none',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista de conversaciones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>No hay conversaciones en este filtro</div>
        ) : filtered.map(conv => (
          <div
            key={conv.conversation_id}
            onClick={() => setSelected(conv)}
            style={{
              background:  '#fff',
              borderRadius: 12,
              padding:      '12px 16px',
              cursor:       'pointer',
              border:       conv.unread > 0 ? '1.5px solid #bfdbfe' : '1.5px solid #f3f4f6',
              boxShadow:    '0 1px 4px rgba(0,0,0,0.06)',
              display:      'flex',
              alignItems:   'center',
              gap:          12,
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
              background: conv.sender_role === 'cliente' ? '#eff6ff' : conv.sender_role === 'operador' ? '#ecfdf5' : '#f5f3ff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>
              {conv.sender_role === 'cliente' ? '👤' : conv.sender_role === 'operador' ? '🔧' : '❓'}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <div style={{ fontWeight: conv.unread > 0 ? 700 : 500, fontSize: 13, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {conv.from_phone}
                  <RoleBadge role={conv.sender_role} />
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{formatTime(conv.last_at)}</div>
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {conv.last_message?.slice(0, 80)}
              </div>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', flexShrink: 0 }}>
              {conv.escalated && !conv.admin_replied && (
                <div style={{ background: '#dc2626', color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  🚨 Asesor
                </div>
              )}
              {conv.unread > 0 && (
                <div style={{ background: '#3b82f6', color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                  {conv.unread}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
