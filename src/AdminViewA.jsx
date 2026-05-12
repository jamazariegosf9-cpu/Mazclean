// AdminViewA.jsx — Tab Reservaciones
// Contiene: Panel de bookings sin operador, lista filtrable, modales de asignación y edición

import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { sendWhatsApp } from './lib/whatsapp';
import { useToast } from './App';

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
  const { showToast } = useToast();
  // ── Panel de emergencia ───────────────────────────────────────────────────
  const [emergencyModal, setEmergencyModal]     = useState(false)
  const [emergencyBooking, setEmergencyBooking] = useState(null)
  const [availableOps, setAvailableOps]         = useState([])
  const [loadingOps, setLoadingOps]             = useState(false)
  const [assigningEm, setAssigningEm]           = useState(null)

  const openEmergencyPanel = async (booking) => {
    setEmergencyBooking(booking)
    setEmergencyModal(true)
    setLoadingOps(true)
    setAvailableOps([])
    try {
      const headers = { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY }
      // Buscar operadores disponibles: aprobados, certificados, membresía activa, sin excepción activa
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?role=eq.operador&operator_status=eq.aprobado&is_certified=eq.true&membership_status=eq.activa&select=id,full_name,phone,rating_avg,base_address,coverage_radius,work_days,work_start,work_end`,
        { headers }
      )
      if (res.ok) {
        const ops = await res.json()
        // Filtrar por día y horario del booking
        const bookingDate = new Date(booking.scheduled_date)
        const dayNames = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado']
        const bookingDay = dayNames[bookingDate.getDay()]
        const bookingTime = booking.scheduled_time_from?.slice(0,5)
        const filtered = ops.filter(op => {
          const worksDay = (op.work_days || []).includes(bookingDay)
          const inHours = op.work_start <= bookingTime && op.work_end >= bookingTime
          return worksDay && inHours && op.id !== booking.operator_id
        })
        setAvailableOps(filtered)
      }
    } catch (err) { showToast('Error al buscar operadores: ' + err.message, 'error') }
    finally { setLoadingOps(false) }
  }

  const assignEmergency = async (operatorId) => {
    setAssigningEm(operatorId)
    try {
      const headers = { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }
      const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${emergencyBooking.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ operator_id: operatorId, status: 'confirmado', updated_at: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // WA al nuevo operador
      const op = availableOps.find(o => o.id === operatorId)
      if (op?.phone) {
        await sendWhatsApp('operator_service_request', op.phone, emergencyBooking)
      }
      showToast('Operador asignado por emergencia', 'success')
      setEmergencyModal(false)
      if (fetchData) fetchData()
    } catch (err) { showToast('Error: ' + err.message, 'error') }
    finally { setAssigningEm(null) }
  }

  const sendEmergencyRounds = async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/process-booking-request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ booking_id: emergencyBooking.id, force_new_round: true }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      showToast('Nuevas rondas de asignación enviadas', 'success')
      setEmergencyModal(false)
    } catch (err) { showToast('Error: ' + err.message, 'error') }
  }
  const [confirmAssign, setConfirmAssign] = useState(null); // { bookingId, operatorId, operatorName }
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
  // Paginación
  const [bookingsPage, setBookingsPage] = useState(1);
  const BOOKINGS_PER_PAGE = 20;

  // ── Dashboard operacional ────────────────────────────────────────────────
  const [dash, setDash]           = useState(null)   // métricas calculadas
  const [dashLoading, setDashLoading] = useState(false)
  const [activeCard, setActiveCard]   = useState(null) // card abierta actualmente
  const [dashDetail, setDashDetail]   = useState([])   // lista del panel abierto

  useEffect(() => {
    const fetchServerTime = async () => {
      const { data } = await supabase.rpc('get_server_time');
      if (data) setServerNow(new Date(data));
    };
    fetchServerTime();
    const interval = setInterval(fetchServerTime, 60000);
    return () => clearInterval(interval);
  }, []);

  // ── Fetch métricas del dashboard ─────────────────────────────────────────
  const fetchDashboard = async () => {
    setDashLoading(true)
    try {
      const token = getToken()
      const h = { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
      const today = new Date().toISOString().slice(0, 10)

      const [bkRes, opRes, zoneRes, depRes, incRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/bookings?select=id,status,scheduled_date,operator_id,booking_ref,service_name,total_price,client_id,scheduled_time_from`, { headers: h }),
        fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.operador&select=id,full_name,phone,operator_status,is_certified,membership_status,membership_end_at,operator_level,rating_avg`, { headers: h }),
        fetch(`${SUPABASE_URL}/rest/v1/operator_zone_requests?status=eq.pendiente&select=id,operator_id,new_address,new_radius,reason_type,created_at,operator:operator_id(full_name,phone)`, { headers: h }),
        fetch(`${SUPABASE_URL}/rest/v1/membership_requests?status=eq.pendiente&select=id,user_id,amount,created_at,referral_code,profile:user_id(full_name,phone)`, { headers: h }),
        fetch(`${SUPABASE_URL}/rest/v1/incidents?status=eq.abierto&select=id,description,operator_id,booking_id,created_at,operator:operator_id(full_name)`, { headers: h }),
      ])

      const [bks, ops, zones, deps, incs] = await Promise.all([
        bkRes.ok ? bkRes.json() : [],
        opRes.ok ? opRes.json() : [],
        zoneRes.ok ? zoneRes.json() : [],
        depRes.ok ? depRes.json() : [],
        incRes.ok ? incRes.json() : [],
      ])

      const now = new Date()
      const in7days = new Date(now); in7days.setDate(in7days.getDate() + 7)

      // Calcular métricas
      const desfasados   = bks.filter(b => ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status) && b.scheduled_date < today)
      const sinOperador  = bks.filter(b => b.status === 'pendiente' && !b.operator_id)
      const hoy          = bks.filter(b => b.scheduled_date === today)
      const enCurso      = bks.filter(b => ['en_camino','en_proceso'].includes(b.status))
      const mesActual    = bks.filter(b => b.status === 'finalizado' && b.scheduled_date?.slice(0,7) === today.slice(0,7))
      const ingresosMes  = mesActual.reduce((acc, b) => acc + parseFloat(b.total_price || 0), 0)
      const opsActivos   = ops.filter(o => o.operator_status === 'aprobado' && o.is_certified && o.membership_status === 'activa')
      const opsPendientes= ops.filter(o => ['pending_review','pendiente'].includes(o.operator_status))
      const opsDocsCorr  = ops.filter(o => o.operator_status === 'docs_required')
      const opsVencen    = ops.filter(o => o.membership_status === 'activa' && o.membership_end_at && new Date(o.membership_end_at) <= in7days)
      const opsNoRenov   = ops.filter(o => o.operator_status === 'aprobado' && o.membership_status !== 'activa')
      const ratingProm   = opsActivos.length ? (opsActivos.reduce((a,o) => a + parseFloat(o.rating_avg||0), 0) / opsActivos.length).toFixed(1) : '—'

      setDash({
        desfasados, sinOperador, hoy, enCurso, ingresosMes,
        opsActivos, opsPendientes, opsDocsCorr, opsVencen, opsNoRenov,
        zones, deps, incs, ratingProm,
        totalHoy: hoy.length,
        finalizadosHoy: hoy.filter(b => b.status === 'finalizado').length,
      })
    } catch (err) { console.error('fetchDashboard:', err) }
    finally { setDashLoading(false) }
  }

  const openCard = (key, data) => {
    if (activeCard === key) { setActiveCard(null); setDashDetail([]); return }
    setActiveCard(key)
    setDashDetail(data)
  }

  useEffect(() => { fetchDashboard() }, [])

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

  // Reset página al cambiar filtros
  useEffect(() => { setBookingsPage(1); }, [searchTerm, statusFilter, dateFilter]);

  const filteredBookings = bookings.filter(b => {
    const matchSearch = b.booking_ref?.toLowerCase().includes(searchTerm.toLowerCase()) || b.customer?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || b.service_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchSearch && matchStatus && applyDateFilter(b);
  });

  const totalBookingPages = Math.max(1, Math.ceil(filteredBookings.length / BOOKINGS_PER_PAGE));
  const paginatedBookings = filteredBookings.slice((bookingsPage - 1) * BOOKINGS_PER_PAGE, bookingsPage * BOOKINGS_PER_PAGE);

  const getToken = () => {
    try {
      const stored = localStorage.getItem('mazclean-auth')
      if (stored) { const p = JSON.parse(stored); return p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY; }
    } catch {}
    return SUPABASE_ANON_KEY;
  };

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
    const operator = operators.find(o => o.id === operatorId);
    // Mostrar confirmación antes de asignar
    setConfirmAssign({ bookingId, operatorId, operatorName: operator?.full_name || 'este operador' });
  };

  const confirmAssignOperator = async () => {
    if (!confirmAssign) return;
    const { bookingId, operatorId, operatorName } = confirmAssign;
    setConfirmAssign(null);
    setAssigning(bookingId);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ operator_id: operatorId, status: 'confirmado', updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, operator_id: operatorId, status: 'confirmado' } : b));
      const booking = bookings.find(b => b.id === bookingId);
      const operator = operators.find(o => o.id === operatorId);
      if (booking?.customer?.phone) {
        try { await sendWhatsApp('operator_assigned', booking.customer.phone, { booking_ref: booking.booking_ref, service_name: booking.service_name, scheduled_date: booking.scheduled_date, scheduled_time: booking.scheduled_time, total_price: booking.total_price || booking.service_price, operator_name: operator?.full_name || 'nuestro operador' }); }
        catch (wsErr) { console.warn('WhatsApp omitido:', wsErr.message); }
      }
      showToast(`✅ ${operatorName} asignado correctamente`, 'success');
      setIsModalOpen(false);
    } catch (err) { showToast('Error al asignar: ' + err.message, 'error'); }
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
    } catch (err) { showToast('Error al asignar: ' + err.message, 'error'); }
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
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const supaUrl = import.meta.env.VITE_SUPABASE_URL;
      let token = anonKey;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          token = parsed?.access_token || parsed?.session?.access_token || anonKey;
        }
      } catch {}

      const res = await fetch(`${supaUrl}/rest/v1/bookings?id=eq.${booking.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': anonKey,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'rechazado', updated_at: new Date().toISOString() }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }

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

  // ── Componente tarjeta del dashboard ────────────────────────────────────
  const DashCard = ({ id, icon, label, value, sub, color, urgent, data, formatter }) => {
    const isOpen = activeCard === id
    const hasData = data && data.length > 0
    return (
      <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', cursor: hasData ? 'pointer' : 'default', border: `2px solid ${urgent && hasData ? '#fca5a5' : '#e5e7eb'}`, transition: 'all 0.2s', animation: urgent && hasData ? 'pulse-border 2s infinite' : 'none' }}
        onClick={() => hasData && openCard(id, data)}>
        <div style={{ background: urgent && hasData ? '#fef2f2' : '#fff', padding: '16px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: urgent && hasData ? '#dc2626' : color || '#1f2937', lineHeight: 1.1, marginTop: 2 }}>{value}</div>
              {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{sub}</div>}
            </div>
            {hasData && <div style={{ background: isOpen ? '#3b82f6' : '#f3f4f6', color: isOpen ? '#fff' : '#6b7280', borderRadius: 8, padding: '4px 8px', fontSize: 11, fontWeight: 700 }}>{isOpen ? '▲ Cerrar' : '▼ Ver'}</div>}
          </div>
        </div>
        {isOpen && (
          <div style={{ background: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '12px 16px', maxHeight: 320, overflowY: 'auto' }}>
            {formatter ? formatter(dashDetail) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dashDetail.map((item, i) => (
                  <div key={item.id || i} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #e5e7eb', fontSize: 13, color: '#374151' }}>
                    {item._label || JSON.stringify(item)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16 }}>

      {/* ── DASHBOARD OPERACIONAL ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>⚡ Panel Operacional</div>
          <button onClick={fetchDashboard} disabled={dashLoading}
            style={{ padding: '8px 14px', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            {dashLoading ? '⏳' : '↻'} Actualizar
          </button>
        </div>

        {dashLoading && !dash ? (
          <div style={{ background: '#fff', borderRadius: 14, padding: 40, textAlign: 'center', color: '#9ca3af' }}>⏳ Cargando métricas...</div>
        ) : dash ? (
          <>
            {/* 🚨 ALERTAS URGENTES */}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>🚨 Alertas urgentes</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              <DashCard id="desfasados" icon="⏰" label="Servicios desfasados" value={dash.desfasados.length} sub="Fecha pasada" color="#dc2626" urgent={dash.desfasados.length > 0}
                data={dash.desfasados}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(b => (
                      <div key={b.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #fecaca' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{b.booking_ref} · {b.service_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>📅 {b.scheduled_date} · Estado: {b.status}</div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          <button onClick={() => { openCard(null, []); openEmergencyPanel(b) }}
                            style={{ flex: 1, padding: '6px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>👷 Asignar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              />
              <DashCard id="sinOperador" icon="🚨" label="Sin operador" value={dash.sinOperador.length} sub="Sin asignar" color="#dc2626" urgent={dash.sinOperador.length > 0}
                data={dash.sinOperador}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(b => (
                      <div key={b.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #fecaca' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{b.booking_ref} · {b.service_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>📅 {b.scheduled_date}</div>
                        <button onClick={() => { openCard(null, []); openEmergencyPanel(b) }}
                          style={{ marginTop: 8, width: '100%', padding: '6px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>🚨 Asignar ahora</button>
                      </div>
                    ))}
                  </div>
                )}
              />
              <DashCard id="incidencias" icon="⚠️" label="Incidencias abiertas" value={dash.incs.length} sub="Sin resolver" color="#f97316" urgent={dash.incs.length > 0}
                data={dash.incs}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(inc => (
                      <div key={inc.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #fed7aa' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>👷 {inc.operator?.full_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{inc.description}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{new Date(inc.created_at).toLocaleString('es-MX')}</div>
                      </div>
                    ))}
                  </div>
                )}
              />
            </div>

            {/* ⏳ PENDIENTES DE REVISIÓN */}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>⏳ Pendientes de revisión</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
              <DashCard id="opsPendientes" icon="👤" label="Ops por autorizar" value={dash.opsPendientes.length} sub="Nuevos registros" color="#92400e" urgent={dash.opsPendientes.length > 0}
                data={dash.opsPendientes}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(op => (
                      <div key={op.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #fde68a' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{op.full_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>📱 {op.phone}</div>
                      </div>
                    ))}
                  </div>
                )}
              />
              <DashCard id="zonas" icon="🗺️" label="Cambios de zona" value={dash.zones.length} sub="Pendientes" color="#92400e" urgent={dash.zones.length > 0}
                data={dash.zones}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(z => (
                      <div key={z.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #fde68a' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{z.operator?.full_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>→ {z.new_address} · {z.new_radius}km</div>
                      </div>
                    ))}
                  </div>
                )}
              />
              <DashCard id="depositos" icon="🏦" label="Depósitos bancarios" value={dash.deps.length} sub="Por verificar" color="#92400e" urgent={dash.deps.length > 0}
                data={dash.deps}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(d => (
                      <div key={d.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #fde68a' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{d.profile?.full_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>💰 ${d.amount} MXN · Ref: {d.referral_code}</div>
                      </div>
                    ))}
                  </div>
                )}
              />
              <DashCard id="docsCorr" icon="📋" label="Docs a corregir" value={dash.opsDocsCorr.length} sub="Requieren revisión" color="#92400e" urgent={dash.opsDocsCorr.length > 0}
                data={dash.opsDocsCorr}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(op => (
                      <div key={op.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #fde68a' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{op.full_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>📱 {op.phone}</div>
                      </div>
                    ))}
                  </div>
                )}
              />
            </div>

            {/* 📊 ESTADO OPERACIONAL */}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>📊 Estado operacional</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
              <DashCard id="hoy" icon="📅" label="Servicios hoy" value={dash.totalHoy} sub={`${dash.finalizadosHoy} finalizados`} color="#1e40af"
                data={dash.hoy}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(b => (
                      <div key={b.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{b.booking_ref} · {b.service_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>Estado: {b.status} · {b.scheduled_time_from?.slice(0,5)}</div>
                      </div>
                    ))}
                  </div>
                )}
              />
              <DashCard id="enCurso" icon="⚡" label="En curso ahora" value={dash.enCurso.length} sub="Activos" color="#059669"
                data={dash.enCurso}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(b => (
                      <div key={b.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #bbf7d0' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{b.booking_ref}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{b.status === 'en_camino' ? '🚗 En camino' : '🧼 Lavando'}</div>
                      </div>
                    ))}
                  </div>
                )}
              />
              <DashCard id="opsActivos" icon="👷" label="Ops activos" value={dash.opsActivos.length} sub={`Prom ⭐${dash.ratingProm}`} color="#059669"
                data={dash.opsActivos}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.sort((a,b) => parseFloat(b.rating_avg||0) - parseFloat(a.rating_avg||0)).map(op => (
                      <div key={op.id} style={{ background: '#fff', borderRadius: 10, padding: '8px 12px', border: '1px solid #bbf7d0', display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 12 }}>{op.full_name}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{op.operator_level}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>⭐{parseFloat(op.rating_avg||0).toFixed(1)}</div>
                      </div>
                    ))}
                  </div>
                )}
              />
              <DashCard id="vencen" icon="⏱️" label="Memb. por vencer" value={dash.opsVencen.length} sub="≤7 días" color="#d97706" urgent={dash.opsVencen.length > 0}
                data={dash.opsVencen}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(op => (
                      <div key={op.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #fde68a' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{op.full_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>Vence: {new Date(op.membership_end_at).toLocaleDateString('es-MX')}</div>
                      </div>
                    ))}
                  </div>
                )}
              />
              <DashCard id="noRenov" icon="💳" label="Sin membresía" value={dash.opsNoRenov.length} sub="No renovaron" color="#6b7280"
                data={dash.opsNoRenov}
                formatter={items => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map(op => (
                      <div key={op.id} style={{ background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid #e5e7eb' }}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{op.full_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>📱 {op.phone} · {op.membership_status}</div>
                      </div>
                    ))}
                  </div>
                )}
              />
            </div>

            {/* Ingreso del mes — barra completa */}
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 14, padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#bfdbfe', textTransform: 'uppercase', letterSpacing: 1 }}>💰 Ingresos del mes</div>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', marginTop: 4 }}>${Math.round(dash.ingresosMes).toLocaleString('es-MX')} MXN</div>
                <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 2 }}>{dash.hoy.filter(b=>b.status==='finalizado').length} servicios finalizados hoy</div>
              </div>
              <div style={{ fontSize: 48 }}>📈</div>
            </div>
          </>
        ) : null}
      </div>

      {/* ── SEPARADOR ── */}
      <div style={{ height: 1, background: '#e5e7eb', marginBottom: 16 }} />

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
                  <button onClick={() => openEmergencyPanel(booking)}
                    style={{ padding: '10px 14px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44, flexShrink: 0 }}>
                    🚨 Emergencia
                  </button>
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
          {paginatedBookings.map(booking => {
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button onClick={() => { setSelectedBooking(booking); setIsModalOpen(true); }} style={{ padding: '10px 8px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>👥 Asignar</button>
                    <button onClick={() => { setEditData({ ...booking }); setEditModal(true); }} style={{ padding: '10px 8px', borderRadius: 8, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>✏️ Editar</button>
                    {!['rechazado','cancelado','finalizado'].includes(booking.status) ? (
                      <button onClick={() => rejectBooking(booking)} disabled={rejectingBooking === booking.id} style={{ padding: '10px 8px', borderRadius: 8, border: '1.5px solid #e9d5ff', background: '#faf5ff', color: '#7e22ce', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>
                        {rejectingBooking === booking.id ? '⏳...' : '🚫 Rechazar'}
                      </button>
                    ) : <div />}
                    <button onClick={() => deleteBooking(booking.id)} style={{ padding: '10px 8px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>🗑 Eliminar</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Confirmar Asignación */}
      {confirmAssign && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 360, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👷</div>
            <h3 style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', margin: '0 0 10px' }}>Confirmar asignación</h3>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.6 }}>
              ¿Asignar a <strong style={{ color: '#1e40af' }}>{confirmAssign.operatorName}</strong> a este servicio?<br/>
              Se le notificará por WhatsApp al cliente.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmAssign(null)}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#f9fafb', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 46 }}>
                Cancelar
              </button>
              <button onClick={confirmAssignOperator}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 46 }}>
                ✅ Sí, asignar
              </button>
            </div>
          </div>
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

      {/* Modal: Emergencia */}
      {emergencyModal && emergencyBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>🚨 Panel de Emergencia</div>
                <div style={{ color: '#fecaca', fontSize: 12, marginTop: 2 }}>{emergencyBooking.booking_ref} · {emergencyBooking.service_name}</div>
              </div>
              <button onClick={() => setEmergencyModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
                📍 {emergencyBooking.address} · {emergencyBooking.scheduled_date} {emergencyBooking.scheduled_time_from?.slice(0,5)} hrs
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 10 }}>Operadores disponibles para esta zona y horario</div>
              {loadingOps ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>Buscando operadores...</div>
              ) : availableOps.length === 0 ? (
                <div style={{ background: '#f9fafb', borderRadius: 10, padding: '16px', textAlign: 'center', marginBottom: 16, border: '1.5px dashed #e5e7eb' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>😔</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>No hay operadores disponibles en este horario</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {availableOps.map(op => (
                    <div key={op.id} style={{ background: '#f9fafb', borderRadius: 12, padding: '12px 14px', border: '1.5px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>👷</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{op.full_name}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>⭐ {op.rating_avg || '—'} · {(op.base_address || '').slice(0,35)}...</div>
                      </div>
                      <button onClick={() => assignEmergency(op.id)} disabled={!!assigningEm}
                        style={{ padding: '8px 14px', background: assigningEm === op.id ? '#9ca3af' : '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 36, flexShrink: 0 }}>
                        {assigningEm === op.id ? '⏳' : 'Asignar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>¿Prefieres enviar nuevas rondas de aceptación?</div>
                <div style={{ fontSize: 12, color: '#78716c', marginBottom: 10 }}>El sistema notificará a todos los operadores disponibles para que acepten el servicio.</div>
                <button onClick={sendEmergencyRounds}
                  style={{ width: '100%', padding: '10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 42 }}>
                  📣 Enviar nuevas rondas de asignación
                </button>
              </div>
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
