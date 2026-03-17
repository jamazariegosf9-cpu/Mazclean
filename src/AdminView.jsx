import React, { useState, useEffect } from 'react';
import {
  Users, Calendar, Clock, MapPin, CheckCircle2, AlertCircle,
  Search, Filter, MoreVertical, Phone, ChevronRight, RefreshCw,
  TrendingUp, DollarSign, Edit3, Trash2, UserPlus, Activity,
  AlertTriangle, BarChart2, X, Check, XCircle, List
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { sendWhatsApp } from './lib/whatsapp';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const AdminView = () => {
  const [bookings, setBookings]         = useState([]);
  const [operators, setOperators]       = useState([]);
  const [loading, setLoading]           = useState(true);
  const [assigning, setAssigning]       = useState(null);
  const [searchTerm, setSearchTerm]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter]     = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [activeTab, setActiveTab]       = useState('bookings');

  const [stats, setStats] = useState({
    total: 0, pending: 0, active: 0, completed: 0,
    cancelled: 0, revenue: 0, completionRate: 0
  });

  const [newOperator, setNewOperator]           = useState({ full_name: '', phone: '', email: '', password: '' });
  const [creatingOperator, setCreatingOperator] = useState(false);
  const [operatorError, setOperatorError]       = useState('');
  const [operatorSuccess, setOperatorSuccess]   = useState('');
  const [operatorHistory, setOperatorHistory]   = useState(null);
  const [historyFilter, setHistoryFilter]       = useState({ from: '', to: '' });

  const [editModal, setEditModal]   = useState(false);
  const [editData, setEditData]     = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const [photoModal, setPhotoModal] = useState(null);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('admin-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: bookingsData, error: bError } = await supabase
        .from('bookings')
        .select('*, customer:client_id(full_name, phone), operator:operator_id(full_name, phone)')
        .order('created_at', { ascending: false });
      if (bError) throw bError;

      const { data: operatorsData, error: oError } = await supabase
        .from('profiles').select('*').eq('role', 'operador');
      if (oError) throw oError;

      setBookings(bookingsData || []);
      setOperators(operatorsData || []);

      const total     = bookingsData.length;
      const completed = bookingsData.filter(b => b.status === 'finalizado').length;
      const cancelled = bookingsData.filter(b => b.status === 'cancelado').length;
      const revenue   = bookingsData
        .filter(b => b.status === 'finalizado')
        .reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);

      setStats({
        total, completed, cancelled,
        pending:        bookingsData.filter(b => b.status === 'pendiente').length,
        active:         bookingsData.filter(b => ['confirmado','en_camino','en_proceso'].includes(b.status)).length,
        revenue,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
      });
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyDateFilter = (b) => {
    if (dateFilter === 'all') return true;
    const date  = new Date(b.scheduled_date);
    const today = new Date(); today.setHours(0,0,0,0);
    if (dateFilter === 'today') return date.toDateString() === today.toDateString();
    if (dateFilter === 'week')  { const w = new Date(today); w.setDate(today.getDate()-7); return date >= w; }
    if (dateFilter === 'month') { const m = new Date(today); m.setMonth(today.getMonth()-1); return date >= m; }
    return true;
  };

  const isUrgent = (b) => {
    if (!['pendiente','confirmado'].includes(b.status)) return false;
    return new Date(`${b.scheduled_date}T${b.scheduled_time}`) < new Date();
  };

  const filteredBookings = bookings.filter(b => {
    const matchSearch =
      b.booking_ref?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.customer?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.service_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchSearch && matchStatus && applyDateFilter(b);
  });

  const assignOperator = async (bookingId, operatorId) => {
    if (!operatorId) return;
    setAssigning(bookingId);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ operator_id: operatorId, status: 'confirmado', updated_at: new Date().toISOString() })
        .eq('id', bookingId);
      if (error) { alert(`Error al asignar: ${error.message}`); return; }

      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, operator_id: operatorId, status: 'confirmado' } : b
      ));

      const booking  = bookings.find(b => b.id === bookingId);
      const operator = operators.find(o => o.id === operatorId);
      const phone    = booking?.customer?.phone;
      if (booking && phone) {
        try {
          await sendWhatsApp('operator_assigned', phone, {
            booking_ref:    booking.booking_ref,
            service_name:   booking.service_name,
            scheduled_date: booking.scheduled_date,
            scheduled_time: booking.scheduled_time,
            total_price:    booking.total_price || booking.service_price,
            operator_name:  operator?.full_name || 'nuestro operador',
          });
        } catch (wsErr) { console.warn('WhatsApp omitido:', wsErr.message); }
      }
      setIsModalOpen(false);
    } catch (err) {
      alert('Error inesperado al asignar.');
    } finally {
      setAssigning(null);
    }
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
      const { error } = await supabase
        .from('bookings')
        .update({ scheduled_date: editData.scheduled_date, scheduled_time: editData.scheduled_time, address_line: editData.address_line, updated_at: new Date().toISOString() })
        .eq('id', editData.id);
      if (error) throw error;
      setBookings(prev => prev.map(b => b.id === editData.id ? { ...b, ...editData } : b));
      setEditModal(false);
    } catch (err) {
      alert(`Error al guardar: ${err.message}`);
    } finally {
      setSavingEdit(false);
    }
  };

  const createOperator = async () => {
    setOperatorError(''); setOperatorSuccess('');
    if (!newOperator.email || !newOperator.password || !newOperator.full_name) {
      setOperatorError('Nombre, email y contraseña son requeridos.'); return;
    }
    setCreatingOperator(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-operator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify(newOperator)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOperatorSuccess(`Operador ${newOperator.full_name} creado exitosamente.`);
      setNewOperator({ full_name: '', phone: '', email: '', password: '' });
      fetchData();
    } catch (err) {
      setOperatorError(err.message);
    } finally {
      setCreatingOperator(false);
    }
  };

  const getOperatorStatus = (operatorId) => {
    const active = bookings.find(b => b.operator_id === operatorId && ['en_camino','en_proceso'].includes(b.status));
    if (active) return { label: active.status === 'en_camino' ? 'En camino' : 'Lavando', color: '#f97316', dot: '#f97316' };
    const confirmed = bookings.find(b => b.operator_id === operatorId && b.status === 'confirmado');
    if (confirmed) return { label: 'Asignado', color: '#3b82f6', dot: '#3b82f6' };
    return { label: 'Libre', color: '#10b981', dot: '#10b981' };
  };

  const fetchOperatorHistory = async (operatorId) => {
    let query = supabase.from('bookings')
      .select('*, customer:client_id(full_name)')
      .eq('operator_id', operatorId).eq('status', 'finalizado')
      .order('scheduled_date', { ascending: false });
    if (historyFilter.from) query = query.gte('scheduled_date', historyFilter.from);
    if (historyFilter.to)   query = query.lte('scheduled_date', historyFilter.to);
    const { data, error } = await query;
    if (error) { alert(error.message); return; }
    setOperatorHistory({ operatorId, data });
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'pendiente':  return { bg: '#fef9c3', text: '#854d0e', border: '#fde68a' };
      case 'confirmado': return { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' };
      case 'en_camino':  return { bg: '#e0e7ff', text: '#3730a3', border: '#c7d2fe' };
      case 'en_proceso': return { bg: '#ffedd5', text: '#9a3412', border: '#fed7aa' };
      case 'finalizado': return { bg: '#dcfce7', text: '#166534', border: '#bbf7d0' };
      case 'cancelado':  return { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' };
      default:           return { bg: '#f3f4f6', text: '#374151', border: '#e5e7eb' };
    }
  };

  const getPhotoUrl = (booking) => {
    if (!booking.photo_url) return null;
    return booking.photo_url.startsWith('http')
      ? booking.photo_url
      : `${SUPABASE_URL}/storage/v1/object/public/service-photos/${booking.photo_url}`;
  };

  const statCards = [
    { label: 'Total',        value: stats.total,                          icon: '📋', color: '#6b7280' },
    { label: 'Pendientes',   value: stats.pending,                        icon: '⏳', color: '#d97706' },
    { label: 'En Curso',     value: stats.active,                         icon: '🔵', color: '#3b82f6' },
    { label: 'Finalizados',  value: stats.completed,                      icon: '✅', color: '#10b981' },
    { label: 'Cancelados',   value: stats.cancelled,                      icon: '❌', color: '#ef4444' },
    { label: 'Ingresos',     value: `$${stats.revenue.toLocaleString()}`, icon: '💰', color: '#059669' },
    { label: '% Completado', value: `${stats.completionRate}%`,           icon: '📈', color: '#7c3aed' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', paddingBottom: 48 }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '28px 24px 24px', textAlign: 'center' }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>🛠 Dashboard de Administración</h1>
        <p style={{ color: '#bfdbfe', fontSize: 13, margin: 0 }}>Gestión integral de MazClean</p>
        <button
          onClick={fetchData}
          style={{ marginTop: 16, background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '8px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          ↻ Actualizar
        </button>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>

        {/* ── Stats ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginTop: 24 }}>
          {statCards.map((s, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 18px' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: 'flex', gap: 4, marginTop: 24, background: '#e5e7eb', padding: 4, borderRadius: 12, width: 'fit-content' }}>
          {[
            { id: 'bookings',  label: '📋 Reservaciones' },
            { id: 'operators', label: '👷 Operadores' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                background: activeTab === tab.id ? '#fff' : 'transparent',
                color: activeTab === tab.id ? '#1e40af' : '#6b7280',
                boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ════════════════ TAB: RESERVACIONES ════════════════ */}
        {activeTab === 'bookings' && (
          <div style={{ marginTop: 20 }}>
            {/* Filtros */}
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>🔍</span>
                <input
                  type="text"
                  placeholder="Buscar folio, cliente o servicio..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  style={{ padding: '9px 12px 9px 36px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
                />
              </div>
              <select
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <option value="all">Todas las fechas</option>
                <option value="today">Hoy</option>
                <option value="week">Esta semana</option>
                <option value="month">Este mes</option>
              </select>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all',       label: 'Todos' },
                  { id: 'pendiente', label: 'Pendientes' },
                  { id: 'confirmado',label: 'Confirmados' },
                  { id: 'en_camino', label: 'En Camino' },
                  { id: 'en_proceso',label: 'Lavando' },
                  { id: 'finalizado',label: 'Listos' },
                  { id: 'cancelado', label: 'Cancelados' },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setStatusFilter(f.id)}
                    style={{
                      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                      background: statusFilter === f.id ? '#3b82f6' : '#f3f4f6',
                      color: statusFilter === f.id ? '#fff' : '#6b7280',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cards de reservaciones */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 16 }}>Cargando...</div>
            ) : filteredBookings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>No se encontraron reservaciones.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {filteredBookings.map(booking => {
                  const sc     = getStatusStyle(booking.status);
                  const urgent = isUrgent(booking);
                  return (
                    <div key={booking.id} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 20px', border: urgent ? '2px solid #ef4444' : '2px solid transparent' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 16, alignItems: 'center' }}>
                        {/* Servicio */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            {urgent && <span title="¡Servicio retrasado!">⚠️</span>}
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: 20, letterSpacing: 0.5 }}>{booking.booking_ref}</span>
                          </div>
                          <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 14 }}>{booking.service_name}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{booking.customer?.full_name || '—'}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>📞 {booking.customer?.phone || '—'}</div>
                        </div>
                        {/* Agenda */}
                        <div>
                          <div style={{ fontSize: 13, color: '#374151' }}>📅 {booking.scheduled_date}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>🕐 {booking.scheduled_time}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>👷 {booking.operator?.full_name || <span style={{ fontStyle: 'italic' }}>Sin asignar</span>}</div>
                        </div>
                        {/* Status + foto */}
                        <div>
                          <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('_',' ')}
                          </span>
                          {getPhotoUrl(booking) && (
                            <button onClick={() => setPhotoModal(getPhotoUrl(booking))} style={{ display: 'block', marginTop: 8, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                              <img src={getPhotoUrl(booking)} alt="foto" style={{ height: 40, width: 40, borderRadius: 8, objectFit: 'cover', border: '1.5px solid #e5e7eb' }} />
                            </button>
                          )}
                        </div>
                        {/* Acciones */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button
                            onClick={() => { setSelectedBooking(booking); setIsModalOpen(true); }}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            👥 Asignar
                          </button>
                          <button
                            onClick={() => { setEditData({ ...booking }); setEditModal(true); }}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => deleteBooking(booking.id)}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            🗑 Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════════ TAB: OPERADORES ════════════════ */}
        {activeTab === 'operators' && (
          <div style={{ marginTop: 20, display: 'grid', gap: 20 }}>

            {/* Status en tiempo real */}
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '20px 24px' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', margin: '0 0 16px' }}>🟢 Estado en Tiempo Real</h2>
              {operators.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: 14, fontStyle: 'italic' }}>No hay operadores registrados.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
                  {operators.map(op => {
                    const status = getOperatorStatus(op.id);
                    return (
                      <div key={op.id} style={{ background: '#f9fafb', borderRadius: 12, border: '1.5px solid #e5e7eb', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ height: 48, width: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>
                            {op.full_name?.charAt(0)}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 14 }}>{op.full_name}</div>
                            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{op.phone || 'Sin teléfono'}</div>
                          </div>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: status.color }}>
                            <span style={{ height: 8, width: 8, borderRadius: '50%', background: status.dot, display: 'inline-block' }}></span>
                            {status.label}
                          </span>
                        </div>
                        <button
                          onClick={() => fetchOperatorHistory(op.id)}
                          style={{ padding: '8px 0', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          📊 Ver Historial
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Historial */}
            {operatorHistory && (
              <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', margin: 0 }}>
                    📊 Historial — {operators.find(o => o.id === operatorHistory.operatorId)?.full_name}
                  </h2>
                  <button onClick={() => setOperatorHistory(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 20 }}>×</button>
                </div>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {[['from','Desde'],['to','Hasta']].map(([key,label]) => (
                    <div key={key}>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
                      <input type="date" value={historyFilter[key]} onChange={e => setHistoryFilter(p => ({...p,[key]:e.target.value}))}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit' }} />
                    </div>
                  ))}
                  <button onClick={() => fetchOperatorHistory(operatorHistory.operatorId)}
                    style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Filtrar
                  </button>
                </div>
                {operatorHistory.data.length === 0 ? (
                  <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: 14 }}>Sin servicios en este rango.</p>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {operatorHistory.data.map(b => (
                      <div key={b.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, padding: '12px 16px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{b.booking_ref}</div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{b.service_name}</div>
                        </div>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>{b.customer?.full_name || '—'}</div>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>{b.scheduled_date}</div>
                        <div style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>${b.total_price}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Alta de Operador */}
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '20px 24px' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', margin: '0 0 16px' }}>➕ Dar de Alta Operador</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
                {[
                  { key: 'full_name', label: 'Nombre completo *', placeholder: 'Juan Pérez',            type: 'text'     },
                  { key: 'phone',     label: 'Teléfono',          placeholder: '5512345678',             type: 'tel'      },
                  { key: 'email',     label: 'Email *',           placeholder: 'op@mazclean.mx',         type: 'email'    },
                  { key: 'password',  label: 'Contraseña *',      placeholder: 'Mínimo 8 caracteres',    type: 'password' },
                ].map(field => (
                  <div key={field.key}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{field.label}</div>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      value={newOperator[field.key]}
                      onChange={e => setNewOperator(p => ({...p, [field.key]: e.target.value}))}
                      style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                ))}
              </div>
              {operatorError   && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 12, color: '#dc2626', fontSize: 13 }}>⚠️ {operatorError}</div>}
              {operatorSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginTop: 12, color: '#166534', fontSize: 13 }}>✅ {operatorSuccess}</div>}
              <button
                onClick={createOperator}
                disabled={creatingOperator}
                style={{ marginTop: 16, padding: '11px 28px', background: creatingOperator ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
              >
                {creatingOperator ? '⏳ Creando...' : '➕ Crear Operador'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════ MODAL: ASIGNAR OPERADOR ════ */}
      {isModalOpen && selectedBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.20)', maxWidth: 480, width: '100%', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>Asignar Operador</h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bfdbfe', fontSize: 20 }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb', padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: 20 }}>{selectedBooking.booking_ref}</span>
                  <span style={{ fontWeight: 700, color: '#1f2937' }}>${selectedBooking.total_price || selectedBooking.service_price}</span>
                </div>
                <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 6 }}>{selectedBooking.service_name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>📍 {selectedBooking.address_line || 'Sin dirección'}</div>
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 8 }}>
                {operators.length === 0 && <p style={{ color: '#9ca3af', textAlign: 'center', padding: 16, fontSize: 14, fontStyle: 'italic' }}>No hay operadores disponibles.</p>}
                {operators.map(op => (
                  <button
                    key={op.id}
                    onClick={() => assignOperator(selectedBooking.id, op.id)}
                    disabled={assigning === selectedBooking.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, border: selectedBooking.operator_id === op.id ? '2px solid #3b82f6' : '1.5px solid #e5e7eb', background: selectedBooking.operator_id === op.id ? '#eff6ff' : '#fff', cursor: 'pointer', transition: 'all 0.2s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ height: 38, width: 38, borderRadius: '50%', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>
                        {op.full_name?.charAt(0)}
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#1f2937' }}>{op.full_name}</div>
                        <div style={{ fontSize: 11, color: getOperatorStatus(op.id).color, fontWeight: 600 }}>{getOperatorStatus(op.id).label}</div>
                      </div>
                    </div>
                    <span style={{ color: selectedBooking.operator_id === op.id ? '#3b82f6' : '#d1d5db', fontSize: 18 }}>
                      {selectedBooking.operator_id === op.id ? '✓' : '›'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', textAlign: 'right' }}>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#6b7280' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: EDITAR RESERVACIÓN ════ */}
      {editModal && editData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.20)', maxWidth: 420, width: '100%', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>✏️ Editar Reservación</h3>
              <button onClick={() => setEditModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bfdbfe', fontSize: 20 }}>×</button>
            </div>
            <div style={{ padding: 20, display: 'grid', gap: 14 }}>
              {[
                { key: 'scheduled_date', label: 'Fecha',     type: 'date' },
                { key: 'scheduled_time', label: 'Hora',      type: 'time' },
                { key: 'address_line',   label: 'Dirección', type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>{f.label}</div>
                  <input
                    type={f.type}
                    value={f.key === 'scheduled_time' ? editData[f.key]?.slice(0,5) || '' : editData[f.key] || ''}
                    onChange={e => setEditData(p => ({...p,[f.key]:e.target.value}))}
                    style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setEditModal(false)} style={{ padding: '9px 20px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={saveEdit} disabled={savingEdit} style={{ padding: '9px 24px', background: savingEdit ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {savingEdit ? '⏳ Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: FOTO ════ */}
      {photoModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setPhotoModal(null)}>
          <div style={{ position: 'relative', maxWidth: 600, width: '100%' }}>
            <button onClick={() => setPhotoModal(null)} style={{ position: 'absolute', top: -36, right: 0, background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24 }}>×</button>
            <img src={photoModal} alt="Foto del servicio" style={{ width: '100%', borderRadius: 16, maxHeight: '80vh', objectFit: 'contain' }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminView;
