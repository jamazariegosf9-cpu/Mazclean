import React, { useState, useEffect } from 'react';
import {
  Users, Calendar, Clock, MapPin, CheckCircle2, AlertCircle,
  Search, Phone, ChevronRight, RefreshCw, TrendingUp, DollarSign,
  Edit3, Trash2, UserPlus, Activity, AlertTriangle, BarChart2,
  X, XCircle, Plus, ToggleLeft, ToggleRight, Save, CheckSquare,
  Square, Bell, Star
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { sendWhatsApp } from './lib/whatsapp';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const EMOJI_OPTIONS     = ['🚿','🪣','✨','💎','🏆','🚗','🧽','💧','🛻','🚙','⚡','🔧','🪟','🧴','🫧'];

const emptyService = {
  name: '', description: '', icon: '🚿', color: '#3b82f6',
  price_sedan: '', price_suv: '', price_truck: '', price_van: '',
  duration_min: '', duration_sedan: '', duration_suv: '', duration_pickup: '', duration_van: '',
  supplies_notes: '', is_active: true, sort_order: 99
};

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
    total: 0, pending: 0, active: 0, completed: 0, cancelled: 0, revenue: 0, completionRate: 0
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

  // ── Comisiones ──────────────────────────────────────────────────
  const [commissionModal, setCommissionModal]   = useState(false);
  const [commissionOp, setCommissionOp]         = useState(null);
  const [commissionPct, setCommissionPct]       = useState(15);
  const [savingCommission, setSavingCommission] = useState(false);
  const [commissionReport, setCommissionReport] = useState(null);

  // ── KPIs de tiempo ──────────────────────────────────────────────
  const [kpisModal, setKpisModal]   = useState(false);
  const [kpisOp, setKpisOp]         = useState(null);
  const [kpisData, setKpisData]     = useState(null);
  const [kpisTimeline, setKpisTimeline] = useState([]);
  const [loadingKpis, setLoadingKpis] = useState(false);

  // ── Incidencias ─────────────────────────────────────────────────
  const [incidents, setIncidents]     = useState([]);
  const [incidentsTab, setIncidentsTab] = useState(false);

  // ── Catálogo ─────────────────────────────────────────────────────
  const [services, setServices]           = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceModal, setServiceModal]   = useState(false);
  const [serviceForm, setServiceForm]     = useState(emptyService);
  const [editingService, setEditingService] = useState(null);
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError]   = useState('');
  const [serviceSuccess, setServiceSuccess] = useState('');

  // ── Checklist del catálogo ───────────────────────────────────────
  const [checklistItems, setChecklistItems]   = useState([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [checklistServiceId, setChecklistServiceId] = useState(null);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('admin-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (activeTab === 'catalog') fetchServices();
    if (activeTab === 'operators') fetchIncidents();
  }, [activeTab]);

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
      const revenue   = bookingsData.filter(b => b.status === 'finalizado').reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);

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

  const fetchIncidents = async () => {
    const { data } = await supabase
      .from('incidents')
      .select('*, operator:operator_id(full_name, id)')
      .eq('status', 'abierto')
      .order('created_at', { ascending: false });
    setIncidents(data || []);
  };

  const resolveIncident = async (incidentId) => {
    await supabase.from('incidents').update({ status: 'resuelto', resolved_at: new Date().toISOString() }).eq('id', incidentId);
    fetchIncidents();
  };

  // ── KPIs de tiempo ──────────────────────────────────────────────
  const fetchOperatorKpis = async (op) => {
    setKpisOp(op);
    setLoadingKpis(true);
    setKpisModal(true);
    try {
      // Llamar función PostgreSQL
      const { data: kpis, error: kError } = await supabase
        .rpc('get_operator_time_kpis', { p_operator_id: op.id });
      if (kError) throw kError;
      setKpisData(kpis?.[0] || null);

      // Timeline: últimos 5 servicios finalizados con sus logs
      const { data: recentBookings } = await supabase
        .from('bookings')
        .select('id, booking_ref, service_name, scheduled_date, scheduled_time, duration_min')
        .eq('operator_id', op.id)
        .eq('status', 'finalizado')
        .order('updated_at', { ascending: false })
        .limit(5);

      if (recentBookings && recentBookings.length > 0) {
        const timelines = await Promise.all(recentBookings.map(async (b) => {
          const { data: logs } = await supabase
            .from('booking_status_log')
            .select('status, created_at, duration_seconds')
            .eq('booking_id', b.id)
            .order('created_at', { ascending: true });
          return { ...b, logs: logs || [] };
        }));
        setKpisTimeline(timelines);
      } else {
        setKpisTimeline([]);
      }
    } catch (err) {
      console.error('Error fetching KPIs:', err);
    } finally {
      setLoadingKpis(false);
    }
  };

  const formatSeconds = (secs) => {
    if (!secs) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m} min ${s > 0 ? s + 's' : ''}`.trim() : `${s}s`;
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  // ── Comisiones ──────────────────────────────────────────────────
  const openCommissionModal = (op) => {
    setCommissionOp(op);
    setCommissionPct(op.commission_pct || 15);
    const opBookings = bookings.filter(b => b.operator_id === op.id && b.status === 'finalizado');
    const totalRevenue = opBookings.reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
    const commission = totalRevenue * ((op.commission_pct || 15) / 100);
    setCommissionReport({ bookings: opBookings, totalRevenue, commission, services: opBookings.length });
    setCommissionModal(true);
  };

  const saveCommission = async () => {
    setSavingCommission(true);
    const { error } = await supabase.from('profiles').update({ commission_pct: parseFloat(commissionPct) }).eq('id', commissionOp.id);
    if (error) { alert(error.message); setSavingCommission(false); return; }
    setOperators(prev => prev.map(o => o.id === commissionOp.id ? { ...o, commission_pct: parseFloat(commissionPct) } : o));
    setSavingCommission(false);
    setCommissionModal(false);
  };

  // ── Alerta de retraso ───────────────────────────────────────────
  const isDelayed = (booking) => {
    if (!['confirmado','en_camino','en_proceso'].includes(booking.status)) return false;
    const scheduled = new Date(`${booking.scheduled_date}T${booking.scheduled_time}`);
    const now = new Date();
    return now > scheduled && (now - scheduled) > 30 * 60 * 1000; // más de 30 min de retraso
  };

  // ── Catálogo ─────────────────────────────────────────────────────
  const fetchServices = async () => {
    setLoadingServices(true);
    try {
      const { data, error } = await supabase.from('services').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      setServices(data || []);
    } catch (err) {
      console.error('Error fetching services:', err);
    } finally {
      setLoadingServices(false);
    }
  };

  const loadChecklist = async (serviceId) => {
    setChecklistServiceId(serviceId);
    const { data } = await supabase.from('service_checklist').select('*').eq('service_id', serviceId).order('sort_order', { ascending: true });
    setChecklistItems(data || []);
  };

  const addChecklistItem = async (serviceId) => {
    if (!newChecklistItem.trim()) return;
    setSavingChecklist(true);
    const { data, error } = await supabase.from('service_checklist').insert({
      service_id: serviceId, item: newChecklistItem.trim(), sort_order: checklistItems.length + 1
    }).select().single();
    if (!error) { setChecklistItems(prev => [...prev, data]); setNewChecklistItem(''); }
    setSavingChecklist(false);
  };

  const deleteChecklistItem = async (itemId) => {
    await supabase.from('service_checklist').delete().eq('id', itemId);
    setChecklistItems(prev => prev.filter(i => i.id !== itemId));
  };

  const openNewService = () => {
    setEditingService(null); setServiceForm(emptyService);
    setServiceError(''); setServiceSuccess(''); setChecklistItems([]); setChecklistServiceId(null);
    setServiceModal(true);
  };

  const openEditService = async (service) => {
    setEditingService(service.id);
    setServiceForm({
      name: service.name || '', description: service.description || '', icon: service.icon || '🚿', color: service.color || '#3b82f6',
      price_sedan: service.price_sedan || '', price_suv: service.price_suv || '', price_truck: service.price_truck || '', price_van: service.price_van || '',
      duration_min: service.duration_min || '', duration_sedan: service.duration_sedan || '', duration_suv: service.duration_suv || '',
      duration_pickup: service.duration_pickup || '', duration_van: service.duration_van || '',
      supplies_notes: service.supplies_notes || '', is_active: service.is_active ?? true, sort_order: service.sort_order || 99,
    });
    setServiceError(''); setServiceSuccess('');
    await loadChecklist(service.id);
    setServiceModal(true);
  };

  const saveService = async () => {
    setServiceError('');
    if (!serviceForm.name || !serviceForm.price_sedan) { setServiceError('Nombre y precio Sedán son requeridos.'); return; }
    setSavingService(true);
    try {
      const payload = {
        name: serviceForm.name, description: serviceForm.description, icon: serviceForm.icon, color: serviceForm.color,
        price_sedan: parseFloat(serviceForm.price_sedan) || null, price_suv: parseFloat(serviceForm.price_suv) || null,
        price_truck: parseFloat(serviceForm.price_truck) || null, price_van: parseFloat(serviceForm.price_van) || null,
        duration_min: parseInt(serviceForm.duration_min) || null, duration_sedan: parseInt(serviceForm.duration_sedan) || null,
        duration_suv: parseInt(serviceForm.duration_suv) || null, duration_pickup: parseInt(serviceForm.duration_pickup) || null,
        duration_van: parseInt(serviceForm.duration_van) || null, supplies_notes: serviceForm.supplies_notes || null,
        is_active: serviceForm.is_active, sort_order: parseInt(serviceForm.sort_order) || 99, updated_at: new Date().toISOString(),
      };
      if (editingService) {
        const { error } = await supabase.from('services').update(payload).eq('id', editingService);
        if (error) throw error;
        setServiceSuccess('Servicio actualizado exitosamente.');
      } else {
        const { error } = await supabase.from('services').insert({ ...payload, created_at: new Date().toISOString() });
        if (error) throw error;
        setServiceSuccess('Servicio creado exitosamente.');
      }
      await fetchServices();
      setTimeout(() => { setServiceModal(false); setServiceSuccess(''); }, 1200);
    } catch (err) {
      setServiceError(err.message);
    } finally {
      setSavingService(false);
    }
  };

  const toggleServiceStatus = async (service) => {
    const { error } = await supabase.from('services').update({ is_active: !service.is_active, updated_at: new Date().toISOString() }).eq('id', service.id);
    if (error) { alert(error.message); return; }
    setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: !s.is_active } : s));
  };

  const deleteService = async (serviceId) => {
    if (!confirm('¿Eliminar este servicio?')) return;
    const { error } = await supabase.from('services').delete().eq('id', serviceId);
    if (error) { alert(error.message); return; }
    setServices(prev => prev.filter(s => s.id !== serviceId));
  };

  const applyDateFilter = (b) => {
    if (dateFilter === 'all') return true;
    const date = new Date(b.scheduled_date); const today = new Date(); today.setHours(0,0,0,0);
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
    const matchSearch = b.booking_ref?.toLowerCase().includes(searchTerm.toLowerCase()) || b.customer?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || b.service_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchSearch && matchStatus && applyDateFilter(b);
  });

  const assignOperator = async (bookingId, operatorId) => {
    if (!operatorId) return;
    setAssigning(bookingId);
    try {
      const { error } = await supabase.from('bookings').update({ operator_id: operatorId, status: 'confirmado', updated_at: new Date().toISOString() }).eq('id', bookingId);
      if (error) { alert(`Error al asignar: ${error.message}`); return; }
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, operator_id: operatorId, status: 'confirmado' } : b));
      const booking = bookings.find(b => b.id === bookingId); const operator = operators.find(o => o.id === operatorId); const phone = booking?.customer?.phone;
      if (booking && phone) {
        try { await sendWhatsApp('operator_assigned', phone, { booking_ref: booking.booking_ref, service_name: booking.service_name, scheduled_date: booking.scheduled_date, scheduled_time: booking.scheduled_time, total_price: booking.total_price || booking.service_price, operator_name: operator?.full_name || 'nuestro operador' }); }
        catch (wsErr) { console.warn('WhatsApp omitido:', wsErr.message); }
      }
      setIsModalOpen(false);
    } catch (err) { alert('Error inesperado al asignar.'); } finally { setAssigning(null); }
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
    } catch (err) { alert(`Error al guardar: ${err.message}`); } finally { setSavingEdit(false); }
  };

  const createOperator = async () => {
    setOperatorError(''); setOperatorSuccess('');
    if (!newOperator.email || !newOperator.password || !newOperator.full_name) { setOperatorError('Nombre, email y contraseña son requeridos.'); return; }
    setCreatingOperator(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-operator`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }, body: JSON.stringify(newOperator) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOperatorSuccess(`Operador ${newOperator.full_name} creado exitosamente.`);
      setNewOperator({ full_name: '', phone: '', email: '', password: '' });
      fetchData();
    } catch (err) { setOperatorError(err.message); } finally { setCreatingOperator(false); }
  };

  const getOperatorStatus = (operatorId) => {
    const active = bookings.find(b => b.operator_id === operatorId && ['en_camino','en_proceso'].includes(b.status));
    if (active) return { label: active.status === 'en_camino' ? 'En camino' : 'Lavando', color: '#f97316', dot: '#f97316' };
    const confirmed = bookings.find(b => b.operator_id === operatorId && b.status === 'confirmado');
    if (confirmed) {
      const scheduledAt = new Date(`${confirmed.scheduled_date}T${confirmed.scheduled_time}`);
      const now = new Date();
      const diffHours = (scheduledAt - now) / (1000 * 60 * 60);
      if (diffHours <= 2) return { label: 'Ocupado próximo', color: '#f59e0b', dot: '#f59e0b' };
      return { label: 'Asignado', color: '#3b82f6', dot: '#3b82f6' };
    }
    return { label: 'Libre', color: '#10b981', dot: '#10b981' };
  };

  const fetchOperatorHistory = async (operatorId) => {
    let query = supabase.from('bookings').select('*, customer:client_id(full_name)').eq('operator_id', operatorId).eq('status', 'finalizado').order('scheduled_date', { ascending: false });
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
    return booking.photo_url.startsWith('http') ? booking.photo_url : `${SUPABASE_URL}/storage/v1/object/public/service-photos/${booking.photo_url}`;
  };

  const inputStyle = { padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937' };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };

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
        <button onClick={fetchData}
          style={{ marginTop: 16, background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '8px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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
        <div style={{ display: 'flex', gap: 4, marginTop: 24, background: '#e5e7eb', padding: 4, borderRadius: 12, width: 'fit-content', flexWrap: 'wrap' }}>
          {[
            { id: 'bookings',  label: '📋 Reservaciones' },
            { id: 'operators', label: `👷 Operadores${incidents.length > 0 ? ` ⚠️${incidents.length}` : ''}` },
            { id: 'catalog',   label: '🛎 Catálogo' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, background: activeTab === tab.id ? '#fff' : 'transparent', color: activeTab === tab.id ? '#1e40af' : '#6b7280', boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.2s' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ════════════════ TAB: RESERVACIONES ════════════════ */}
        {activeTab === 'bookings' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 20px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>🔍</span>
                <input type="text" placeholder="Buscar folio, cliente o servicio..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{ ...inputStyle, paddingLeft: 36 }} />
              </div>
              <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#1f2937' }}>
                <option value="all">Todas las fechas</option>
                <option value="today">Hoy</option>
                <option value="week">Esta semana</option>
                <option value="month">Este mes</option>
              </select>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'Todos' }, { id: 'pendiente', label: 'Pendientes' }, { id: 'confirmado', label: 'Confirmados' },
                  { id: 'en_camino', label: 'En Camino' }, { id: 'en_proceso', label: 'Lavando' }, { id: 'finalizado', label: 'Listos' }, { id: 'cancelado', label: 'Cancelados' },
                ].map(f => (
                  <button key={f.id} onClick={() => setStatusFilter(f.id)}
                    style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', transition: 'all 0.2s', background: statusFilter === f.id ? '#3b82f6' : '#f3f4f6', color: statusFilter === f.id ? '#fff' : '#6b7280' }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 16 }}>Cargando...</div>
            ) : filteredBookings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>No se encontraron reservaciones.</div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {filteredBookings.map(booking => {
                  const sc      = getStatusStyle(booking.status);
                  const urgent  = isUrgent(booking);
                  const delayed = isDelayed(booking);
                  return (
                    <div key={booking.id} style={{ background: delayed ? '#fef2f2' : '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 20px', border: delayed ? '2px solid #ef4444' : urgent ? '2px solid #f97316' : '2px solid transparent' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, alignItems: 'center' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            {delayed && <span title="⚠️ Servicio retrasado más de 30 min">🔴</span>}
                            {urgent && !delayed && <span title="¡Fuera de horario!">⚠️</span>}
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: 20, letterSpacing: 0.5 }}>{booking.booking_ref}</span>
                          </div>
                          <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 14 }}>{booking.service_name}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{booking.customer?.full_name || '—'}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>📞 {booking.customer?.phone || '—'}</div>
                          {booking.client_rating && (
                            <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4 }}>{'⭐'.repeat(booking.client_rating)}</div>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: '#374151' }}>📅 {booking.scheduled_date}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>🕐 {booking.scheduled_time}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>👷 {booking.operator?.full_name || <span style={{ fontStyle: 'italic' }}>Sin asignar</span>}</div>
                        </div>
                        <div>
                          <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('_',' ')}
                          </span>
                          {delayed && <div style={{ fontSize: 10, color: '#dc2626', fontWeight: 700, marginTop: 4 }}>⚠️ RETRASADO</div>}
                          {getPhotoUrl(booking) && (
                            <button onClick={() => setPhotoModal(getPhotoUrl(booking))} style={{ display: 'block', marginTop: 8, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>
                              <img src={getPhotoUrl(booking)} alt="foto" style={{ height: 40, width: 40, borderRadius: 8, objectFit: 'cover', border: '1.5px solid #e5e7eb' }} />
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <button onClick={() => { setSelectedBooking(booking); setIsModalOpen(true); }}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            👥 Asignar
                          </button>
                          <button onClick={() => { setEditData({ ...booking }); setEditModal(true); }}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            ✏️ Editar
                          </button>
                          <button onClick={() => deleteBooking(booking.id)}
                            style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
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

            {/* Incidencias abiertas */}
            {incidents.length > 0 && (
              <div style={{ background: '#fef2f2', borderRadius: 16, border: '2px solid #fecaca', padding: '20px 24px' }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#991b1b', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  ⚠️ Incidencias Abiertas ({incidents.length})
                </h2>
                <div style={{ display: 'grid', gap: 10 }}>
                  {incidents.map(inc => (
                    <div key={inc.id} style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>👷 {inc.operator?.full_name || 'Operador'}</div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>{inc.description}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{new Date(inc.created_at).toLocaleString('es-MX')}</div>
                      </div>
                      <button onClick={() => resolveIncident(inc.id)}
                        style={{ padding: '6px 14px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                        ✅ Resolver
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Status en tiempo real */}
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '20px 24px' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', margin: '0 0 16px' }}>🟢 Estado en Tiempo Real</h2>
              {operators.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: 14, fontStyle: 'italic' }}>No hay operadores registrados.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
                  {operators.map(op => {
                    const status = getOperatorStatus(op.id);
                    const opBookings = bookings.filter(b => b.operator_id === op.id && b.status === 'finalizado');
                    const totalRev = opBookings.reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
                    const commission = totalRev * ((op.commission_pct || 15) / 100);
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
                        {/* Mini reporte de comisión */}
                        <div style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Comisión ({op.commission_pct || 15}%)</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>${commission.toFixed(2)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Servicios</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>{opBookings.length}</div>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                          <button onClick={() => fetchOperatorHistory(op.id)}
                            style={{ padding: '8px 0', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            📊 Historial
                          </button>
                          <button onClick={() => openCommissionModal(op)}
                            style={{ padding: '8px 0', borderRadius: 8, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#166534', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            💰 Comisión
                          </button>
                          <button onClick={() => fetchOperatorKpis(op)}
                            style={{ padding: '8px 0', borderRadius: 8, border: '1.5px solid #e9d5ff', background: '#faf5ff', color: '#7c3aed', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            ⏱ Tiempos
                          </button>
                        </div>
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
                        style={{ ...inputStyle, width: 'auto' }} />
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
                  { key: 'full_name', label: 'Nombre completo *', placeholder: 'Juan Pérez', type: 'text' },
                  { key: 'phone', label: 'Teléfono', placeholder: '5512345678', type: 'tel' },
                  { key: 'email', label: 'Email *', placeholder: 'op@mazclean.mx', type: 'email' },
                  { key: 'password', label: 'Contraseña *', placeholder: 'Mínimo 8 caracteres', type: 'password' },
                ].map(field => (
                  <div key={field.key}>
                    <label style={labelStyle}>{field.label}</label>
                    <input type={field.type} placeholder={field.placeholder} value={newOperator[field.key]}
                      onChange={e => setNewOperator(p => ({...p, [field.key]: e.target.value}))}
                      style={inputStyle} />
                  </div>
                ))}
              </div>
              {operatorError   && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 12, color: '#dc2626', fontSize: 13 }}>⚠️ {operatorError}</div>}
              {operatorSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginTop: 12, color: '#166534', fontSize: 13 }}>✅ {operatorSuccess}</div>}
              <button onClick={createOperator} disabled={creatingOperator}
                style={{ marginTop: 16, padding: '11px 28px', background: creatingOperator ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                {creatingOperator ? '⏳ Creando...' : '➕ Crear Operador'}
              </button>
            </div>
          </div>
        )}

        {/* ════════════════ TAB: CATÁLOGO ════════════════ */}
        {activeTab === 'catalog' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: 0 }}>🛎 Catálogo de Servicios</h2>
                <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0' }}>Administra los servicios y sus checklists</p>
              </div>
              <button onClick={openNewService}
                style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                <Plus size={16} /> Nuevo Servicio
              </button>
            </div>

            {loadingServices ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 16 }}>Cargando servicios...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }}>
                {services.map(service => (
                  <div key={service.id} style={{ background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden', border: service.is_active ? '2px solid transparent' : '2px solid #e5e7eb', opacity: service.is_active ? 1 : 0.7 }}>
                    <div style={{ background: `linear-gradient(135deg, ${service.color}22, ${service.color}11)`, borderBottom: `2px solid ${service.color}33`, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 28 }}>{service.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 15 }}>{service.name}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{service.description}</div>
                        </div>
                      </div>
                      <button onClick={() => toggleServiceStatus(service)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }} title={service.is_active ? 'Desactivar' : 'Activar'}>
                        {service.is_active ? <ToggleRight size={28} color="#10b981" /> : <ToggleLeft size={28} color="#9ca3af" />}
                      </button>
                    </div>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Precios</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                        {[{ label: '🚗', value: service.price_sedan }, { label: '🚙', value: service.price_suv }, { label: '🛻', value: service.price_truck }, { label: '🚐', value: service.price_van }].map((p, i) => (
                          <div key={i} style={{ textAlign: 'center', background: '#f9fafb', borderRadius: 8, padding: '6px 4px' }}>
                            <div style={{ fontSize: 12 }}>{p.label}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>${p.value || '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {service.supplies_notes && (
                      <div style={{ padding: '10px 18px', borderBottom: '1px solid #f3f4f6', background: '#fefce8' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>🧴 Insumos</div>
                        <div style={{ fontSize: 12, color: '#854d0e' }}>{service.supplies_notes}</div>
                      </div>
                    )}
                    <div style={{ padding: '12px 18px', display: 'flex', gap: 8 }}>
                      <button onClick={() => openEditService(service)}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        ✏️ Editar y Checklist
                      </button>
                      <button onClick={() => deleteService(service.id)}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        🗑 Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                  <button key={op.id} onClick={() => assignOperator(selectedBooking.id, op.id)} disabled={assigning === selectedBooking.id}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, border: selectedBooking.operator_id === op.id ? '2px solid #3b82f6' : '1.5px solid #e5e7eb', background: selectedBooking.operator_id === op.id ? '#eff6ff' : '#fff', cursor: 'pointer', transition: 'all 0.2s' }}>
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
                { key: 'scheduled_date', label: 'Fecha', type: 'date' },
                { key: 'scheduled_time', label: 'Hora', type: 'time' },
                { key: 'address_line', label: 'Dirección', type: 'text' },
              ].map(f => (
                <div key={f.key}>
                  <label style={labelStyle}>{f.label}</label>
                  <input type={f.type} value={f.key === 'scheduled_time' ? editData[f.key]?.slice(0,5) || '' : editData[f.key] || ''}
                    onChange={e => setEditData(p => ({...p,[f.key]:e.target.value}))} style={inputStyle} />
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

      {/* ════ MODAL: KPIs DE TIEMPO ════ */}
      {kpisModal && kpisOp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxWidth: 560, width: '100%', overflow: 'hidden', margin: 'auto' }}>
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>⏱ Rendimiento — {kpisOp.full_name}</h3>
              <button onClick={() => setKpisModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ede9fe', fontSize: 22 }}>×</button>
            </div>

            <div style={{ padding: 20, maxHeight: '75vh', overflowY: 'auto' }}>
              {loadingKpis ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>⏳ Calculando KPIs...</div>
              ) : (
                <>
                  {/* KPIs principales */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, marginBottom: 20 }}>
                    {[
                      { label: 'Prom. traslado', value: formatSeconds(Math.round(kpisData?.avg_travel_seconds || 0)),  icon: '🚗', color: '#3b82f6' },
                      { label: 'Prom. lavado',   value: formatSeconds(Math.round(kpisData?.avg_washing_seconds || 0)), icon: '🧽', color: '#f97316' },
                      { label: 'Servicios',      value: kpisData?.total_services || 0,                                  icon: '✅', color: '#10b981' },
                      { label: 'Real vs Est.',   value: kpisData?.avg_real_vs_estimated ? `${Math.round(kpisData.avg_real_vs_estimated)}%` : '—', icon: '📊', color: kpisData?.avg_real_vs_estimated > 110 ? '#ef4444' : '#7c3aed' },
                    ].map((k, i) => (
                      <div key={i} style={{ background: '#f9fafb', borderRadius: 12, padding: '12px 10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{k.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Nota real vs estimado */}
                  {kpisData?.avg_real_vs_estimated && (
                    <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 20, background: kpisData.avg_real_vs_estimated > 110 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${kpisData.avg_real_vs_estimated > 110 ? '#fecaca' : '#bbf7d0'}` }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: kpisData.avg_real_vs_estimated > 110 ? '#dc2626' : '#166534' }}>
                        {kpisData.avg_real_vs_estimated > 110
                          ? `⚠️ El operador tarda ${Math.round(kpisData.avg_real_vs_estimated - 100)}% más de lo estimado en promedio`
                          : `✅ El operador opera dentro del tiempo estimado`}
                      </span>
                    </div>
                  )}

                  {/* Timeline por servicio */}
                  {kpisTimeline.length > 0 && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>📅 Timeline de servicios recientes</div>
                      <div style={{ display: 'grid', gap: 12 }}>
                        {kpisTimeline.map(b => (
                          <div key={b.id} style={{ background: '#f9fafb', borderRadius: 12, padding: '12px 14px', border: '1px solid #e5e7eb' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '2px 8px', borderRadius: 20 }}>{b.booking_ref}</span>
                              <span style={{ fontSize: 11, color: '#6b7280' }}>{b.service_name}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                              {b.logs.map((log, idx) => {
                                const statusLabels = {
                                  confirmado: { label: 'Asignado', color: '#3b82f6' },
                                  en_camino:  { label: 'Salió',    color: '#6366f1' },
                                  en_proceso: { label: 'Inició',   color: '#f97316' },
                                  finalizado: { label: 'Terminó',  color: '#10b981' },
                                };
                                const info = statusLabels[log.status];
                                if (!info) return null;
                                return (
                                  <React.Fragment key={idx}>
                                    <div style={{ textAlign: 'center' }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: info.color, background: info.color + '15', padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                                        {info.label}
                                      </div>
                                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                                        {formatTime(log.created_at)}
                                      </div>
                                      {log.duration_seconds && (
                                        <div style={{ fontSize: 9, color: '#d1d5db' }}>
                                          +{formatSeconds(log.duration_seconds)}
                                        </div>
                                      )}
                                    </div>
                                    {idx < b.logs.filter(l => statusLabels[l.status]).length - 1 && (
                                      <div style={{ fontSize: 12, color: '#d1d5db', flexShrink: 0 }}>→</div>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </div>
                            {b.duration_min && (
                              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 6 }}>
                                Duración estimada: {b.duration_min} min
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {kpisTimeline.length === 0 && !loadingKpis && (
                    <p style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>Sin servicios finalizados aún.</p>
                  )}
                </>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', textAlign: 'right' }}>
              <button onClick={() => setKpisModal(false)} style={{ padding: '9px 24px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: COMISIÓN ════ */}
      {commissionModal && commissionOp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxWidth: 460, width: '100%', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#059669,#10b981)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>💰 Comisiones — {commissionOp.full_name}</h3>
              <button onClick={() => setCommissionModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a7f3d0', fontSize: 22 }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              {commissionReport && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Servicios finalizados', value: commissionReport.services, color: '#1e40af' },
                    { label: 'Ingresos generados', value: `$${commissionReport.totalRevenue.toFixed(2)}`, color: '#059669' },
                    { label: 'Comisión a pagar', value: `$${(commissionReport.totalRevenue * (commissionPct / 100)).toFixed(2)}`, color: '#7c3aed' },
                  ].map((s, i) => (
                    <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label style={labelStyle}>Porcentaje de comisión (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" min="0" max="100" step="0.5" value={commissionPct}
                    onChange={e => setCommissionPct(e.target.value)}
                    style={{ ...inputStyle, width: 100 }} />
                  <span style={{ fontSize: 13, color: '#6b7280' }}>
                    = ${(( commissionReport?.totalRevenue || 0) * (commissionPct / 100)).toFixed(2)} MXN
                  </span>
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCommissionModal(false)} style={{ padding: '9px 20px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={saveCommission} disabled={savingCommission}
                style={{ padding: '9px 24px', background: savingCommission ? '#9ca3af' : '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {savingCommission ? '⏳ Guardando...' : '💾 Guardar %'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: CREAR/EDITAR SERVICIO + CHECKLIST ════ */}
      {serviceModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.20)', maxWidth: 640, width: '100%', overflow: 'hidden', margin: 'auto' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 17, margin: 0 }}>{editingService ? '✏️ Editar Servicio' : '➕ Nuevo Servicio'}</h3>
              <button onClick={() => setServiceModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bfdbfe', fontSize: 22 }}>×</button>
            </div>
            <div style={{ padding: 24, maxHeight: '75vh', overflowY: 'auto' }}>

              <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={labelStyle}>Nombre del servicio *</label>
                  <input type="text" placeholder="Ej: Lavado de Motor" value={serviceForm.name}
                    onChange={e => setServiceForm(p => ({...p, name: e.target.value}))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Descripción</label>
                  <textarea placeholder="Describe qué incluye este servicio..." value={serviceForm.description}
                    onChange={e => setServiceForm(p => ({...p, description: e.target.value}))}
                    style={{ ...inputStyle, height: 70, resize: 'vertical' }} />
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Icono del servicio</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {EMOJI_OPTIONS.map(emoji => (
                    <button key={emoji} onClick={() => setServiceForm(p => ({...p, icon: emoji}))}
                      style={{ fontSize: 22, padding: '6px 8px', borderRadius: 8, border: serviceForm.icon === emoji ? '2px solid #3b82f6' : '1.5px solid #e5e7eb', background: serviceForm.icon === emoji ? '#eff6ff' : '#fff', cursor: 'pointer' }}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Color:</label>
                  <input type="color" value={serviceForm.color} onChange={e => setServiceForm(p => ({...p, color: e.target.value}))}
                    style={{ width: 40, height: 32, borderRadius: 6, border: '1.5px solid #e5e7eb', cursor: 'pointer', padding: 2 }} />
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Precios por tipo de vehículo (MXN)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {[{ key: 'price_sedan', label: '🚗 Sedán *' }, { key: 'price_suv', label: '🚙 SUV' }, { key: 'price_truck', label: '🛻 Pickup' }, { key: 'price_van', label: '🚐 Van' }].map(f => (
                    <div key={f.key}>
                      <label style={{ ...labelStyle, fontSize: 11 }}>{f.label}</label>
                      <input type="number" placeholder="0" value={serviceForm[f.key]}
                        onChange={e => setServiceForm(p => ({...p, [f.key]: e.target.value}))} style={inputStyle} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Duración por tipo de vehículo (minutos)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {[{ key: 'duration_sedan', label: '🚗 Sedán' }, { key: 'duration_suv', label: '🚙 SUV' }, { key: 'duration_pickup', label: '🛻 Pickup' }, { key: 'duration_van', label: '🚐 Van' }].map(f => (
                    <div key={f.key}>
                      <label style={{ ...labelStyle, fontSize: 11 }}>{f.label}</label>
                      <input type="number" placeholder="45" value={serviceForm[f.key]}
                        onChange={e => setServiceForm(p => ({...p, [f.key]: e.target.value}))} style={inputStyle} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>🧴 Insumos estimados (opcional)</label>
                <textarea placeholder="Ej: 1L shampoo, 200ml cera, 2 microfibras..." value={serviceForm.supplies_notes}
                  onChange={e => setServiceForm(p => ({...p, supplies_notes: e.target.value}))}
                  style={{ ...inputStyle, height: 60, resize: 'vertical' }} />
              </div>

              {/* ── Checklist del servicio ── */}
              {editingService && (
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>✅ Checklist de calidad</label>
                  <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                    {checklistItems.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CheckSquare size={16} color="#10b981" />
                          <span style={{ fontSize: 13, color: '#374151' }}>{item.item}</span>
                        </div>
                        <button onClick={() => deleteChecklistItem(item.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16 }}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" placeholder="Agregar ítem al checklist..." value={newChecklistItem}
                      onChange={e => setNewChecklistItem(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addChecklistItem(editingService)}
                      style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => addChecklistItem(editingService)} disabled={savingChecklist}
                      style={{ padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                      + Agregar
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Orden de aparición</label>
                  <input type="number" placeholder="1" value={serviceForm.sort_order}
                    onChange={e => setServiceForm(p => ({...p, sort_order: e.target.value}))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Estado</label>
                  <button onClick={() => setServiceForm(p => ({...p, is_active: !p.is_active}))}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: serviceForm.is_active ? '#f0fdf4' : '#fef2f2', color: serviceForm.is_active ? '#166534' : '#991b1b', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {serviceForm.is_active ? <><ToggleRight size={18} color="#10b981" /> Activo</> : <><ToggleLeft size={18} color="#ef4444" /> Inactivo</>}
                  </button>
                </div>
              </div>

              {serviceError   && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 13 }}>⚠️ {serviceError}</div>}
              {serviceSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#166534', fontSize: 13 }}>✅ {serviceSuccess}</div>}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setServiceModal(false)} style={{ padding: '10px 22px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={saveService} disabled={savingService}
                style={{ padding: '10px 28px', background: savingService ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Save size={15} /> {savingService ? 'Guardando...' : editingService ? 'Actualizar' : 'Crear Servicio'}
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
