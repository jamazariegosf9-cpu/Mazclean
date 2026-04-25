// AdminViewA.jsx — Tab Reservaciones
// Contiene: Panel de bookings sin operador, lista filtrable, modales de asignación y edición

import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { sendWhatsApp } from './lib/whatsapp';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const getStatusStyle = (status) => {
  switch (status) {
    case 'pendiente':  return { bg: '#fef9c3', text: '#854d0e', border: '#fde68a' };
    case 'confirmado': return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
    case 'en_camino':  return { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' };
    case 'en_proceso': return { bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' };
    case 'finalizado': return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' };
    case 'cancelado':  return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
    case 'rechazado':  return { bg: '#fae8ff', text: '#7e22ce', border: '#e9d5ff' };
    default:           return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' };
  }
};

const AdminViewA = ({
  bookings, setBookings, operators, loading, isMobile,
  unattendedBookings, setUnattendedBookings,
  fetchData, fetchUnattendedBookings,
}) => {
  const [searchTerm, setSearchTerm]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter]     = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [assigning, setAssigning]       = useState(null);
  const [assigningManual, setAssigningManual] = useState(null);
  const [cancellingBooking, setCancellingBooking] = useState(null);
  const [rejectingBooking, setRejectingBooking] = useState(null);
  const [editModal, setEditModal]       = useState(false);
  const [editData, setEditData]         = useState({});
  const [savingEdit, setSavingEdit]     = useState(false);
  const [photoModal, setPhotoModal]     = useState(null);
  const [serverNow, setServerNow]       = useState(null);

  useEffect(() => {
    const fetchServerTime = async () => {
      const { data } = await supabase.rpc('get_server_time');
      if (data) setServerNow(new Date(data));
    };
    fetchServerTime();
    const interval = setInterval(fetchServerTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const isDelayed = (booking) => {
    if (!['confirmado','en_camino','en_proceso'].includes(booking.status)) return false;
    const now = serverNow || new Date();
    const scheduled = new Date(`${booking.scheduled_date}T${booking.scheduled_time}+00:00`);
    return now > scheduled && (now - scheduled) > 10 * 60 * 1000;
  };

  const isUrgent = (b) => {
    if (!['pendiente','confirmado'].includes(b.status)) return false;
    return new Date(`${b.scheduled_date}T${b.scheduled_time}`) < new Date();
  };

  const applyDateFilter = (b) => {
    if (dateFilter === 'all') return true;
    const date = new Date(b.scheduled_date); const today = new Date(); today.setHours(0,0,0,0);
    if (dateFilter === 'today') return date.toDateString() === today.toDateString();
    if (dateFilter === 'week')  { const w = new Date(today); w.setDate(today.getDate()-7); return date >= w; }
    if (dateFilter === 'month') { const m = new Date(today); m.setMonth(today.getMonth()-1); return date >= m; }
    return true;
  };

  const filteredBookings = bookings.filter(b => {
    const matchSearch = b.booking_ref?.toLowerCase().includes(searchTerm.toLowerCase()) || b.customer?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || b.service_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchSearch && matchStatus && applyDateFilter(b);
  });

  const getOperatorStatus = (operatorId, forBooking = null) => {
    if (forBooking) {
      const [fH, fM] = (forBooking.scheduled_time || '00:00').split(':').map(Number);
      const fStart = fH * 60 + fM; const fEnd = fStart + 60;
      const conflict = bookings.find(b => {
        if (b.operator_id !== operatorId || !['confirmado','en_camino','en_proceso'].includes(b.status)) return false;
        if (b.scheduled_date !== forBooking.scheduled_date || b.id === forBooking.id) return false;
        const [bH, bM] = (b.scheduled_time || '00:00').split(':').map(Number);
        const bStart = bH * 60 + bM; const bEnd = bStart + 60;
        return fStart < bEnd && fEnd > bStart;
      });
      if (conflict) return { label: 'Ocupado', color: '#ef4444', dot: '#ef4444' };
      return { label: 'Disponible', color: '#10b981', dot: '#10b981' };
    }
    const active = bookings.find(b => b.operator_id === operatorId && ['en_camino','en_proceso'].includes(b.status));
    if (active) return { label: active.status === 'en_camino' ? 'En camino' : 'Lavando', color: '#f97316', dot: '#f97316' };
    const confirmed = bookings.find(b => b.operator_id === operatorId && b.status === 'confirmado');
    if (confirmed) {
      const diffHours = (new Date(`${confirmed.scheduled_date}T${confirmed.scheduled_time}`) - new Date()) / (1000 * 60 * 60);
      if (diffHours <= 2) return { label: 'Ocupado próximo', color: '#f59e0b', dot: '#f59e0b' };
      return { label: 'Asignado', color: '#3b82f6', dot: '#3b82f6' };
    }
    return { label: 'Libre', color: '#10b981', dot: '#10b981' };
  };

  const assignOperator = async (bookingId, operatorId) => {
    if (!operatorId) return;
    setAssigning(bookingId);
    try {
      const { error } = await supabase.from('bookings').update({ operator_id: operatorId, status: 'confirmado', updated_at: new Date().toISOString() }).eq('id', bookingId);
      if (error) { alert(`Error al asignar: ${error.message}`); return; }
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, operator_id: operatorId, status: 'confirmado' } : b));
      const booking = bookings.find(b => b.id === bookingId);
      const operator = operators.find(o => o.id === operatorId);
      if (booking?.customer?.phone) {
        try { await sendWhatsApp('operator_assigned', booking.customer.phone, { booking_ref: booking.booking_ref, service_name: booking.service_name, scheduled_date: booking.scheduled_date, scheduled_time: booking.scheduled_time, total_price: booking.total_price || booking.service_price, operator_name: operator?.full_name || 'nuestro operador' }); }
        catch (wsErr) { console.warn('WhatsApp omitido:', wsErr.message); }
      }
      setIsModalOpen(false);
    } catch (err) { alert('Error inesperado al asignar.'); }
    finally { setAssigning(null); }
  };

  const assignManuallyToBooking = async (bookingId, operatorId) => {
    if (!operatorId) return;
    setAssigningManual(bookingId);
    try {
      const { error } = await supabase.from('bookings').update({ operator_id: operatorId, status: 'confirmado', current_ronda: 4, updated_at: new Date().toISOString() }).eq('id', bookingId);
      if (error) throw error;
      const booking  = unattendedBookings.find(b => b.id === bookingId);
      const operator = operators.find(o => o.id === operatorId);
      if (booking?.customer?.phone) {
        try {
          await sendWhatsApp('operator_assigned', booking.customer.phone, {
            booking_ref: booking.booking_ref, service_name: booking.service_name,
            scheduled_date: booking.scheduled_date,
            scheduled_time: booking.scheduled_time_from?.slice(0,5) || booking.scheduled_time,
            total_price: booking.total_price, operator_name: operator?.full_name || 'nuestro operador',
          });
        } catch (e) { console.warn('WhatsApp omitido:', e.message); }
      }
      setUnattendedBookings(prev => prev.filter(b => b.id !== bookingId));
      fetchData();
    } catch (err) { alert('Error al asignar: ' + err.message); }
    finally { setAssigningManual(null); }
  };

  const cancelUnattendedBooking = async (booking) => {
    if (!confirm(`¿Cancelar la reservación ${booking.booking_ref}?`)) return;
    setCancellingBooking(booking.id);
    try {
      const { error } = await supabase.from('bookings').update({ status: 'cancelado', updated_at: new Date().toISOString() }).eq('id', booking.id);
      if (error) throw error;
      if (booking.customer?.phone) {
        try { await sendWhatsApp('booking_cancelled', booking.customer.phone, { booking_ref: booking.booking_ref, service_name: booking.service_name }); }
        catch (e) { console.warn('WhatsApp omitido:', e.message); }
      }
      setUnattendedBookings(prev => prev.filter(b => b.id !== booking.id));
      fetchData();
    } catch (err) { alert('Error al cancelar: ' + err.message); }
    finally { setCancellingBooking(null); }
  };

  // Rechazar reservación — status 'rechazado' para análisis de zonas sin cobertura
  const rejectBooking = async (booking) => {
    if (!confirm(`¿Rechazar la reservación ${booking.booking_ref}? Se notificará al cliente y quedará registrada para análisis de cobertura.`)) return;
    setRejectingBooking(booking.id);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'rechazado', updated_at: new Date().toISOString() })
        .eq('id', booking.id);
      if (error) throw error;

      if (booking.customer?.phone) {
        try { await sendWhatsApp('booking_cancelled', booking.customer.phone, { booking_ref: booking.booking_ref, service_name: booking.service_name }); }
        catch (e) { console.warn('WhatsApp omitido:', e.message); }
      }
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: 'rechazado' } : b));
      setUnattendedBookings(prev => prev.filter(b => b.id !== booking.id));
      fetchData();
    } catch (err) { alert('Error al rechazar: ' + err.message); }
    finally { setRejectingBooking(null); }
  };

  const deleteBooking = async (bookingId) => {
    if (!confirm('¿Eliminar esta reservación?')) return;
    const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
    if (error) { alert(`Error: ${error.message}`); return; }
    setBookings(prev => prev.filter(b => b.id !== bookingId));
  };

  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const { error } = await supabase.from('bookings').update({ scheduled_date: editData.scheduled_date, scheduled_time: editData.scheduled_time, address_line: editData.address_line, updated_at: new Date().toISOString() }).eq('id', editData.id);
      if (error) throw error;
      setBookings(prev => prev.map(b => b.id === editData.id ? { ...b, ...editData } : b));
      setEditModal(false);
    } catch (err) { alert(`Error al guardar: ${err.message}`); }
    finally { setSavingEdit(false); }
  };

  const getPhotoUrl = (booking) => {
    if (!booking.photo_url) return null;
    return booking.photo_url.startsWith('http') ? booking.photo_url : `${SUPABASE_URL}/storage/v1/object/public/service-photos/${booking.photo_url}`;
  };

  const inputStyle = { padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 48 };
  const labelStyle = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };

  return (
    <div style={{ marginTop: 16 }}>

      {/* Filtros */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? '12px' : '16px 20px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? '100%' : 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>🔍</span>
          <input type="text" placeholder="Buscar folio, cliente o servicio..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, paddingLeft: 36 }} />
        </div>
        <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#1f2937', minHeight: 48, flex: isMobile ? 1 : 'none' }}>
          <option value="all">Todas las fechas</option>
          <option value="today">Hoy</option>
          <option value="week">Esta semana</option>
          <option value="month">Este mes</option>
        </select>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
          {[
            { id: 'all',       label: 'Todos' },
            { id: 'pendiente', label: 'Pendientes' },
            { id: 'confirmado',label: 'Confirmados' },
            { id: 'en_camino', label: 'En Camino' },
            { id: 'en_proceso',label: 'Lavando' },
            { id: 'finalizado',label: 'Listos' },
            { id: 'cancelado', label: 'Cancelados' },
            { id: 'rechazado', label: 'Rechazados' },
          ].map(f => (
            <button key={f.id} onClick={() => setStatusFilter(f.id)} style={{ padding: '8px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: statusFilter === f.id ? '#3b82f6' : '#f3f4f6', color: statusFilter === f.id ? '#fff' : '#6b7280', minHeight: 36 }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Panel sin operador */}
      {unattendedBookings.length > 0 && (
        <div style={{ background: '#fef2f2', borderRadius: 14, border: '2px solid #fecaca', padding: isMobile ? '16px' : '20px 24px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>🚨</span>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#991b1b', margin: 0 }}>Requieren tu atención — Sin operador ({unattendedBookings.length})</h2>
          </div>
          <p style={{ fontSize: 13, color: '#7f1d1d', margin: '0 0 14px', lineHeight: 1.5 }}>Estos servicios no fueron aceptados en las 3 rondas automáticas. Asigna manualmente, cancela o rechaza.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {unattendedBookings.map(booking => (
              <div key={booking.id} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', border: '1px solid #fecaca' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: 20 }}>{booking.booking_ref}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '2px 8px', borderRadius: 20 }}>3 rondas sin respuesta</span>
                    </div>
                    <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 14, marginBottom: 2 }}>{booking.service_name}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>👤 {booking.customer?.full_name || '—'} · 📞 {booking.customer?.phone || '—'}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>📅 {booking.scheduled_date} · 🕐 {booking.scheduled_time_from?.slice(0,5) || '—'} — {booking.scheduled_time_to?.slice(0,5) || '—'} hrs</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>📍 {booking.address_line}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#059669', fontSize: 15, flexShrink: 0 }}>${booking.total_price}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select defaultValue="" onChange={e => { if (e.target.value) assignManuallyToBooking(booking.id, e.target.value) }} disabled={assigningManual === booking.id}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, fontFamily: 'inherit' }}>
                    <option value="">{assigningManual === booking.id ? '⏳ Asignando...' : '👷 Asignar operador...'}</option>
                    {operators.filter(op => op?.operator_status === 'aprobado' && op?.status === 'activo').map(op => (
                      <option key={op.id} value={op.id}>{op.full_name} — {op.assignment_mode === 'preferente' ? '⭐ Preferente' : 'Autónomo'}</option>
                    ))}
                  </select>
                  <button onClick={() => cancelUnattendedBooking(booking)} disabled={cancellingBooking === booking.id}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44, flexShrink: 0 }}>
                    {cancellingBooking === booking.id ? '⏳...' : '❌ Cancelar'}
                  </button>
                  <button onClick={() => rejectBooking(booking)} disabled={rejectingBooking === booking.id}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e9d5ff', background: '#faf5ff', color: '#7e22ce', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44, flexShrink: 0 }}>
                    {rejectingBooking === booking.id ? '⏳...' : '🚫 Rechazar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de reservaciones */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 14 }}>Cargando...</div>
      ) : filteredBookings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>No se encontraron reservaciones.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredBookings.map(booking => {
            const sc = getStatusStyle(booking.status);
            const urgent = isUrgent(booking);
            const delayed = isDelayed(booking);
            return (
              <div key={booking.id} style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? 14 : '16px 20px', border: urgent ? '2px solid #f97316' : '2px solid transparent' }}>
                {delayed && (
                  <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 10, padding: '8px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#854d0e' }}>Servicio con más de 10 min de retraso — Programado: {booking.scheduled_time}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: isMobile ? 10 : 16, alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      {urgent && !delayed && <span>⚠️</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: 20, letterSpacing: 0.5 }}>{booking.booking_ref}</span>
                    </div>
                    <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 15 }}>{booking.service_name}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>{booking.customer?.full_name || '—'}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>📞 {booking.customer?.phone || '—'}</div>
                    {booking.client_rating && <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>{'⭐'.repeat(booking.client_rating)}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, color: '#374151' }}>📅 {booking.scheduled_date}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>🕐 {booking.scheduled_time_from ? `${booking.scheduled_time_from.slice(0,5)} — ${booking.scheduled_time_to?.slice(0,5)}` : booking.scheduled_time}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>👷 {booking.operator?.full_name || <span style={{ fontStyle: 'italic' }}>Sin asignar</span>}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                      {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('_',' ')}
                    </span>
                    {getPhotoUrl(booking) && (
                      <button onClick={() => setPhotoModal(getPhotoUrl(booking))} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                        <img src={getPhotoUrl(booking)} alt="foto" style={{ height: 40, width: 40, borderRadius: 8, objectFit: 'cover', border: '1.5px solid #e5e7eb' }} />
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                    <button onClick={() => { setSelectedBooking(booking); setIsModalOpen(true); }} style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, flex: isMobile ? 1 : 'none' }}>👥 Asignar</button>
                    <button onClick={() => { setEditData({ ...booking }); setEditModal(true); }} style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#166534', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, flex: isMobile ? 1 : 'none' }}>✏️ Editar</button>
                    {!['rechazado','cancelado','finalizado'].includes(booking.status) && (
                      <button onClick={() => rejectBooking(booking)} disabled={rejectingBooking === booking.id} style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #e9d5ff', background: '#faf5ff', color: '#7e22ce', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, flex: isMobile ? 1 : 'none' }}>
                        {rejectingBooking === booking.id ? '⏳...' : '🚫 Rechazar'}
                      </button>
                    )}
                    <button onClick={() => deleteBooking(booking.id)} style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44, flex: isMobile ? 1 : 'none' }}>🗑 Eliminar</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Asignar Operador */}
      {isModalOpen && selectedBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 16, boxShadow: '0 4px 24px rgba(0,0,0,0.20)', width: '100%', maxWidth: isMobile ? '100%' : 480, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>Asignar Operador</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: isMobile ? '16px' : 20 }}>
              <div style={{ background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb', padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: 20 }}>{selectedBooking.booking_ref}</span>
                  <span style={{ fontWeight: 700, color: '#1f2937' }}>${selectedBooking.total_price || selectedBooking.service_price}</span>
                </div>
                <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>{selectedBooking.service_name}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>📍 {selectedBooking.address_line || 'Sin dirección'}</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>📅 {selectedBooking.scheduled_date} · 🕐 {selectedBooking.scheduled_time}</div>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'grid', gap: 8 }}>
                {operators.length === 0 && <p style={{ color: '#9ca3af', textAlign: 'center', padding: 16, fontSize: 14, fontStyle: 'italic' }}>No hay operadores disponibles.</p>}
                {operators.filter(op => op && op.id).map(op => {
                  const opStatus = getOperatorStatus(op.id, selectedBooking);
                  const isAvailable = opStatus.label === 'Disponible';
                  return (
                    <button key={op.id} onClick={() => assignOperator(selectedBooking.id, op.id)} disabled={assigning === selectedBooking.id}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', borderRadius: 10, border: selectedBooking.operator_id === op.id ? '2px solid #3b82f6' : isAvailable ? '1.5px solid #bbf7d0' : '1.5px solid #fecaca', background: selectedBooking.operator_id === op.id ? '#eff6ff' : isAvailable ? '#f0fdf4' : '#fef2f2', cursor: 'pointer', minHeight: 56 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ height: 40, width: 40, borderRadius: '50%', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>{op.full_name?.charAt(0) || '?'}</div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>{op.full_name || 'Sin nombre'}</div>
                          <div style={{ fontSize: 12, color: opStatus.color, fontWeight: 600 }}>{opStatus.label}</div>
                        </div>
                      </div>
                      <span style={{ color: selectedBooking.operator_id === op.id ? '#3b82f6' : isAvailable ? '#10b981' : '#ef4444', fontSize: 18 }}>
                        {selectedBooking.operator_id === op.id ? '✓' : isAvailable ? '›' : '✕'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', textAlign: 'right' }}>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#6b7280', minHeight: 44, padding: '0 16px' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Editar Reservación */}
      {editModal && editData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 16, boxShadow: '0 4px 24px rgba(0,0,0,0.20)', width: '100%', maxWidth: isMobile ? '100%' : 420, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>✏️ Editar Reservación</h3>
              <button onClick={() => setEditModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: isMobile ? '16px' : 20, display: 'grid', gap: 14 }}>
              {[{ key: 'scheduled_date', label: 'Fecha', type: 'date' }, { key: 'scheduled_time', label: 'Hora', type: 'time' }, { key: 'address_line', label: 'Dirección', type: 'text' }].map(f => (
                <div key={f.key}>
                  <label style={labelStyle}>{f.label}</label>
                  <input type={f.type} value={f.key === 'scheduled_time' ? editData[f.key]?.slice(0,5) || '' : editData[f.key] || ''} onChange={e => setEditData(p => ({...p,[f.key]:e.target.value}))} style={inputStyle} />
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setEditModal(false)} style={{ padding: '12px 20px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={saveEdit} disabled={savingEdit} style={{ padding: '12px 24px', background: savingEdit ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 48 }}>
                {savingEdit ? '⏳ Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Foto */}
      {photoModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPhotoModal(null)}>
          <div style={{ position: 'relative', maxWidth: 600, width: '100%' }}>
            <button onClick={() => setPhotoModal(null)} style={{ position: 'absolute', top: -40, right: 0, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, borderRadius: 8, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            <img src={photoModal} alt="Foto del servicio" style={{ width: '100%', borderRadius: 16, maxHeight: '80vh', objectFit: 'contain' }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminViewA;
