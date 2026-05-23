// MessagingInbox.jsx v1.0
// Bandeja de mensajes WhatsApp entrantes para el Admin
// Muestra conversaciones agrupadas por número, permite responder

import React, { useState, useEffect, useRef } from 'react';

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ── Hook para cargar conversaciones ──────────────────────────────────────────
function useConversations(token) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading]             = useState(true);

  const fetchConversations = async () => {
    try {
      // Agrupar mensajes por conversation_id con el último mensaje y conteo de no leídos
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?select=conversation_id,from_phone,sender_role,user_id,content,direction,read_at,created_at&order=created_at.desc`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      );
      const data = await res.json();
      if (!Array.isArray(data)) { setLoading(false); return; }

      // Agrupar por conversation_id
      const grouped: Record<string, any> = {};
      for (const msg of data) {
        if (!msg.conversation_id) continue;
        if (!grouped[msg.conversation_id]) {
          grouped[msg.conversation_id] = {
            conversation_id: msg.conversation_id,
            from_phone:      msg.from_phone,
            sender_role:     msg.sender_role,
            user_id:         msg.user_id,
            last_message:    msg.content,
            last_at:         msg.created_at,
            unread:          0,
            messages:        [],
          };
        }
        grouped[msg.conversation_id].messages.push(msg);
        if (msg.direction === 'inbound' && !msg.read_at) {
          grouped[msg.conversation_id].unread++;
        }
      }

      // Ordenar por último mensaje
      const sorted = Object.values(grouped).sort((a: any, b: any) =>
        new Date(b.last_at).getTime() - new Date(a.last_at).getTime()
      );
      setConversations(sorted);
    } catch (e) {
      console.error('fetchConversations:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConversations(); }, [token]);

  return { conversations, loading, refetch: fetchConversations };
}

// ── Formato de hora ───────────────────────────────────────────────────────────
function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7)  return d.toLocaleDateString('es-MX', { weekday: 'short' });
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}

// ── Badge de rol ──────────────────────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    cliente:      { label: 'Cliente',   color: '#1d4ed8', bg: '#eff6ff' },
    operador:     { label: 'Operador',  color: '#065f46', bg: '#ecfdf5' },
    admin:        { label: 'Admin',     color: '#92400e', bg: '#fffbeb' },
    desconocido:  { label: 'Nuevo',     color: '#7c3aed', bg: '#f5f3ff' },
  };
  const s = map[role] || map.desconocido;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, padding: '2px 6px', borderRadius: 10 }}>
      {s.label}
    </span>
  );
}

// ── Vista de conversación ─────────────────────────────────────────────────────
function ConversationThread({ conv, token, onBack, onRefetch, isMobile }: any) {
  const [messages, setMessages]   = useState<any[]>([]);
  const [reply, setReply]         = useState('');
  const [sending, setSending]     = useState(false);
  const [loading, setLoading]     = useState(true);
  const bottomRef                 = useRef<HTMLDivElement>(null);

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
          method: 'PATCH',
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

  useEffect(() => { fetchMessages(); }, [conv.conversation_id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendReply = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      // Llamar a send-whatsapp directamente
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

      // Guardar en messages como outbound
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
          from_phone:      conv.to_phone || 'mazclean',
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
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{conv.from_phone}</div>
          <RoleBadge role={conv.sender_role} />
        </div>
        <button onClick={fetchMessages} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#6b7280' }}>↻</button>
      </div>

      {/* Mensajes */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Cargando...</div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Sin mensajes</div>
        ) : messages.map(msg => (
          <div key={msg.id} style={{ display: 'flex', justifyContent: msg.direction === 'outbound' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '75%',
              background: msg.direction === 'outbound' ? '#3b82f6' : '#fff',
              color:      msg.direction === 'outbound' ? '#fff' : '#111827',
              borderRadius: msg.direction === 'outbound' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              padding: '8px 12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              fontSize: 13,
              lineHeight: 1.5,
            }}>
              <div>{msg.content}</div>
              <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>{formatTime(msg.created_at)}</div>
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
            background: reply.trim() && !sending ? '#3b82f6' : '#e5e7eb',
            color:      reply.trim() && !sending ? '#fff' : '#9ca3af',
            border:     'none', borderRadius: 10, padding: '0 16px', cursor: reply.trim() && !sending ? 'pointer' : 'default',
            fontSize: 13, fontWeight: 600, minWidth: 72,
          }}
        >
          {sending ? '⏳' : '📤 Enviar'}
        </button>
      </div>
    </div>
  );
}

// ── Componente principal: MessagingInbox ──────────────────────────────────────
export default function MessagingInbox({ token, isMobile }: { token: string; isMobile: boolean }) {
  const { conversations, loading, refetch } = useConversations(token);
  const [selected, setSelected]             = useState<any>(null);

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

  const totalUnread = conversations.reduce((s: number, c: any) => s + c.unread, 0);

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

      {/* Lista de conversaciones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {conversations.map((conv: any) => (
          <div
            key={conv.conversation_id}
            onClick={() => setSelected(conv)}
            style={{
              background:    '#fff',
              borderRadius:  12,
              padding:       '12px 16px',
              cursor:        'pointer',
              border:        conv.unread > 0 ? '1.5px solid #bfdbfe' : '1.5px solid #f3f4f6',
              boxShadow:     '0 1px 4px rgba(0,0,0,0.06)',
              display:       'flex',
              alignItems:    'center',
              gap:           12,
              transition:    'box-shadow 0.15s',
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

            {/* Badge no leídos */}
            {conv.unread > 0 && (
              <div style={{ background: '#3b82f6', color: '#fff', borderRadius: 20, padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {conv.unread}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
