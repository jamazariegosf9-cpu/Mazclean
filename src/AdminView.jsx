import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Calendar, Clock, MapPin, CheckCircle2, AlertCircle,
  Search, Filter, MoreVertical, Phone, ChevronRight, RefreshCw,
  TrendingUp, DollarSign, Star, Zap, Eye, Edit3, Trash2,
  UserPlus, Activity, Bell, Camera, XCircle, ChevronDown,
  AlertTriangle, BarChart2, List, Map, Settings, X, Check,
  Navigation, Play, LogOut, Package, Award, Send
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { sendWhatsApp } from './lib/whatsapp';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const AdminView = () => {
  // ─── Estado principal ───────────────────────────────────────────
  const [bookings, setBookings]       = useState([]);
  const [operators, setOperators]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [assigning, setAssigning]     = useState(null);
  const [searchTerm, setSearchTerm]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter]   = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab]     = useState('bookings');

  // ─── Stats ──────────────────────────────────────────────────────
  const [stats, setStats] = useState({
    total: 0, pending: 0, active: 0, completed: 0,
    cancelled: 0, revenue: 0, completionRate: 0
  });

  // ─── Operadores ─────────────────────────────────────────────────
  const [newOperator, setNewOperator] = useState({ full_name: '', phone: '', email: '', password: '' });
  const [creatingOperator, setCreatingOperator] = useState(false);
  const [operatorError, setOperatorError]       = useState('');
  const [operatorSuccess, setOperatorSuccess]   = useState('');
  const [operatorHistory, setOperatorHistory]   = useState(null);
  const [historyFilter, setHistoryFilter]       = useState({ from: '', to: '' });

  // ─── Edición de reservación ──────────────────────────────────────
  const [editModal, setEditModal]   = useState(false);
  const [editData, setEditData]     = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  // ─── Foto ────────────────────────────────────────────────────────
  const [photoModal, setPhotoModal] = useState(null);

  // ─── Tiempo real ─────────────────────────────────────────────────
  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('admin-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => fetchData())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // ─── fetchData ───────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: bookingsData, error: bError } = await supabase
        .from('bookings')
        .select('*, customer:client_id(full_name, phone), operator:operator_id(full_name, phone)')
        .order('created_at', { ascending: false });
      if (bError) throw bError;

      const { data: operatorsData, error: oError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'operador');
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
        total,
        pending:        bookingsData.filter(b => b.status === 'pendiente').length,
        active:         bookingsData.filter(b => ['confirmado','en_camino','en_proceso'].includes(b.status)).length,
        completed,
        cancelled,
        revenue,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
      });
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Filtro por fecha ─────────────────────────────────────────────
  const applyDateFilter = (b) => {
    if (dateFilter === 'all') return true;
    const date = new Date(b.scheduled_date);
    const today = new Date();
    today.setHours(0,0,0,0);
    if (dateFilter === 'today') {
      return date.toDateString() === today.toDateString();
    }
    if (dateFilter === 'week') {
      const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
      return date >= weekAgo;
    }
    if (dateFilter === 'month') {
      const monthAgo = new Date(today); monthAgo.setMonth(today.getMonth() - 1);
      return date >= monthAgo;
    }
    return true;
  };

  // ─── Urgencia ─────────────────────────────────────────────────────
  const isUrgent = (booking) => {
    if (!['pendiente','confirmado'].includes(booking.status)) return false;
    const scheduled = new Date(`${booking.scheduled_date}T${booking.scheduled_time}`);
    const now = new Date();
    return scheduled < now;
  };

  // ─── Filtrado final ───────────────────────────────────────────────
  const filteredBookings = bookings.filter(b => {
    const matchSearch =
      b.booking_ref?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.customer?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.service_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' || b.status === statusFilter;
    return matchSearch && matchStatus && applyDateFilter(b);
  });

  // ─── assignOperator ───────────────────────────────────────────────
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
        } catch (wsErr) {
          console.warn('WhatsApp omitido:', wsErr.message);
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      alert('Error inesperado al asignar.');
    } finally {
      setAssigning(null);
    }
  };

  // ─── deleteBooking ────────────────────────────────────────────────
  const deleteBooking = async (bookingId) => {
    if (!confirm('¿Eliminar esta reservación?')) return;
    const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
    if (error) { alert(`Error: ${error.message}`); return; }
    setBookings(prev => prev.filter(b => b.id !== bookingId));
  };

  // ─── saveEdit ────────────────────────────────────────────────────
  const saveEdit = async () => {
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({
          scheduled_date: editData.scheduled_date,
          scheduled_time: editData.scheduled_time,
          address_line:   editData.address_line,
          updated_at:     new Date().toISOString()
        })
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

  // ─── createOperator ──────────────────────────────────────────────
  const createOperator = async () => {
    setOperatorError('');
    setOperatorSuccess('');
    if (!newOperator.email || !newOperator.password || !newOperator.full_name) {
      setOperatorError('Nombre, email y contraseña son requeridos.');
      return;
    }
    setCreatingOperator(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-operator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
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

  // ─── operatorStatus ──────────────────────────────────────────────
  const getOperatorStatus = (operatorId) => {
    const active = bookings.find(b =>
      b.operator_id === operatorId &&
      ['en_camino','en_proceso'].includes(b.status)
    );
    if (active) return { label: active.status === 'en_camino' ? 'En camino' : 'Lavando', color: 'text-orange-500', dot: 'bg-orange-500' };
    const confirmed = bookings.find(b => b.operator_id === operatorId && b.status === 'confirmado');
    if (confirmed) return { label: 'Asignado', color: 'text-blue-500', dot: 'bg-blue-500' };
    return { label: 'Libre', color: 'text-green-500', dot: 'bg-green-500' };
  };

  // ─── fetchOperatorHistory ────────────────────────────────────────
  const fetchOperatorHistory = async (operatorId) => {
    let query = supabase
      .from('bookings')
      .select('*, customer:client_id(full_name)')
      .eq('operator_id', operatorId)
      .eq('status', 'finalizado')
      .order('scheduled_date', { ascending: false });
    if (historyFilter.from) query = query.gte('scheduled_date', historyFilter.from);
    if (historyFilter.to)   query = query.lte('scheduled_date', historyFilter.to);
    const { data, error } = await query;
    if (error) { alert(error.message); return; }
    setOperatorHistory({ operatorId, data });
  };

  // ─── Helpers ─────────────────────────────────────────────────────
  const getStatusColor = (status) => {
    switch (status) {
      case 'pendiente':  return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'confirmado': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'en_camino':  return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'en_proceso': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'finalizado': return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelado':  return 'bg-red-100 text-red-800 border-red-200';
      default:           return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPhotoUrl = (booking) => {
    if (!booking.photo_url) return null;
    return booking.photo_url.startsWith('http')
      ? booking.photo_url
      : `${SUPABASE_URL}/storage/v1/object/public/service-photos/${booking.photo_url}`;
  };

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-8 py-5">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Dashboard de Administración</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gestión integral de MazClean</p>
          </div>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total',       value: stats.total,                          color: 'text-gray-900',   icon: <List className="h-4 w-4" /> },
            { label: 'Pendientes',  value: stats.pending,                        color: 'text-yellow-600', icon: <AlertCircle className="h-4 w-4" /> },
            { label: 'En Curso',    value: stats.active,                         color: 'text-blue-600',   icon: <Activity className="h-4 w-4" /> },
            { label: 'Finalizados', value: stats.completed,                      color: 'text-green-600',  icon: <CheckCircle2 className="h-4 w-4" /> },
            { label: 'Cancelados',  value: stats.cancelled,                      color: 'text-red-500',    icon: <XCircle className="h-4 w-4" /> },
            { label: 'Ingresos',    value: `$${stats.revenue.toLocaleString()}`, color: 'text-emerald-600',icon: <DollarSign className="h-4 w-4" /> },
            { label: '% Completado',value: `${stats.completionRate}%`,           color: 'text-purple-600', icon: <TrendingUp className="h-4 w-4" /> },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${s.color} mb-1`}>
                {s.icon} {s.label}
              </div>
              <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          {[
            { id: 'bookings',   label: 'Reservaciones', icon: <Calendar className="h-4 w-4" /> },
            { id: 'operators',  label: 'Operadores',    icon: <Users className="h-4 w-4" /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════
          TAB: RESERVACIONES
      ════════════════════════════════════════ */}
      {activeTab === 'bookings' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-4 pb-12">

          {/* Filtros */}
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar folio, cliente o servicio..."
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              {/* Filtro fecha */}
              <select
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Todas las fechas</option>
                <option value="today">Hoy</option>
                <option value="week">Esta semana</option>
                <option value="month">Este mes</option>
              </select>

              {/* Filtro status */}
              <div className="flex gap-1 flex-wrap">
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
                    className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                      statusFilter === f.id
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tabla */}
          <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Servicio</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliente</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agenda</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Operador</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estatus</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Foto</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {loading ? (
                    <tr><td colSpan="7" className="px-4 py-12 text-center text-gray-400 italic">Cargando...</td></tr>
                  ) : filteredBookings.length === 0 ? (
                    <tr><td colSpan="7" className="px-4 py-12 text-center text-gray-400 italic">No se encontraron reservaciones.</td></tr>
                  ) : filteredBookings.map(booking => (
                    <tr key={booking.id} className={`hover:bg-gray-50 transition-colors ${isUrgent(booking) ? 'bg-red-50 border-l-4 border-red-400' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isUrgent(booking) && (
                            <span title="¡Servicio retrasado!" className="flex-shrink-0">
                              <AlertTriangle className="h-4 w-4 text-red-500" />
                            </span>
                          )}
                          <div>
                            <div className="font-bold text-gray-900">{booking.service_name}</div>
                            <div className="text-xs text-gray-400 font-mono">{booking.booking_ref}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{booking.customer?.full_name || '—'}</div>
                        <div className="flex items-center text-xs text-gray-500 mt-0.5">
                          <Phone className="h-3 w-3 mr-1" />{booking.customer?.phone || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center text-gray-900">
                          <Calendar className="h-3.5 w-3.5 mr-1.5 text-blue-500" />{booking.scheduled_date}
                        </div>
                        <div className="flex items-center text-xs text-gray-500 mt-0.5">
                          <Clock className="h-3.5 w-3.5 mr-1.5 text-blue-500" />{booking.scheduled_time}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-900">{booking.operator?.full_name || <span className="text-gray-400 italic text-xs">Sin asignar</span>}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(booking.status)}`}>
                          {booking.status === 'pendiente'  && <AlertCircle className="mr-1 h-3 w-3" />}
                          {booking.status === 'finalizado' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                          {booking.status === 'cancelado'  && <XCircle className="mr-1 h-3 w-3" />}
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('_',' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {getPhotoUrl(booking) ? (
                          <button onClick={() => setPhotoModal(getPhotoUrl(booking))}>
                            <img src={getPhotoUrl(booking)} alt="foto" className="h-10 w-10 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity" />
                          </button>
                        ) : (
                          <span className="text-gray-300 text-xs italic">Sin foto</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setSelectedBooking(booking); setIsModalOpen(true); }}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Asignar Operador"
                          >
                            <Users className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => { setEditData({ ...booking }); setEditModal(true); }}
                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all"
                            title="Editar Reservación"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteBooking(booking.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          TAB: OPERADORES
      ════════════════════════════════════════ */}
      {activeTab === 'operators' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-8 mt-4 pb-12 space-y-6">

          {/* Status en tiempo real */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" /> Estado en Tiempo Real
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {operators.length === 0 && (
                <p className="text-gray-400 text-sm italic col-span-3">No hay operadores registrados.</p>
              )}
              {operators.map(op => {
                const status = getOperatorStatus(op.id);
                return (
                  <div key={op.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                        {op.full_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{op.full_name}</p>
                        <p className="text-xs text-gray-500">{op.phone || 'Sin teléfono'}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`flex items-center gap-1.5 text-xs font-bold ${status.color}`}>
                        <span className={`h-2 w-2 rounded-full ${status.dot}`}></span>
                        {status.label}
                      </span>
                      <button
                        onClick={() => fetchOperatorHistory(op.id)}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <BarChart2 className="h-3 w-3" /> Historial
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Historial de operador */}
          {operatorHistory && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <BarChart2 className="h-5 w-5 text-purple-500" />
                  Historial — {operators.find(o => o.id === operatorHistory.operatorId)?.full_name}
                </h2>
                <button onClick={() => setOperatorHistory(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex gap-3 mb-4 flex-wrap">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Desde</label>
                  <input type="date" value={historyFilter.from} onChange={e => setHistoryFilter(p => ({...p, from: e.target.value}))}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Hasta</label>
                  <input type="date" value={historyFilter.to} onChange={e => setHistoryFilter(p => ({...p, to: e.target.value}))}
                    className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                </div>
                <div className="flex items-end">
                  <button onClick={() => fetchOperatorHistory(operatorHistory.operatorId)}
                    className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                    Filtrar
                  </button>
                </div>
              </div>
              {operatorHistory.data.length === 0 ? (
                <p className="text-gray-400 italic text-sm">Sin servicios finalizados en este rango.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Folio</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Servicio</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Cliente</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Fecha</th>
                        <th className="px-3 py-2 text-xs font-semibold text-gray-500 text-left">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {operatorHistory.data.map(b => (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono text-xs text-gray-400">{b.booking_ref}</td>
                          <td className="px-3 py-2 font-medium text-gray-900">{b.service_name}</td>
                          <td className="px-3 py-2 text-gray-600">{b.customer?.full_name || '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{b.scheduled_date}</td>
                          <td className="px-3 py-2 font-bold text-green-600">${b.total_price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Alta de Operador */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-green-500" /> Dar de Alta Operador
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nombre completo *</label>
                <input
                  type="text"
                  placeholder="Juan Pérez"
                  value={newOperator.full_name}
                  onChange={e => setNewOperator(p => ({...p, full_name: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Teléfono</label>
                <input
                  type="tel"
                  placeholder="5512345678"
                  value={newOperator.phone}
                  onChange={e => setNewOperator(p => ({...p, phone: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Email *</label>
                <input
                  type="email"
                  placeholder="operador@mazclean.mx"
                  value={newOperator.email}
                  onChange={e => setNewOperator(p => ({...p, email: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Contraseña *</label>
                <input
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={newOperator.password}
                  onChange={e => setNewOperator(p => ({...p, password: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {operatorError   && <p className="text-red-500 text-sm mt-3">{operatorError}</p>}
            {operatorSuccess && <p className="text-green-600 text-sm mt-3">{operatorSuccess}</p>}
            <button
              onClick={createOperator}
              disabled={creatingOperator}
              className="mt-4 px-6 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              <UserPlus className="h-4 w-4" />
              {creatingOperator ? 'Creando...' : 'Crear Operador'}
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          MODAL: ASIGNAR OPERADOR
      ════════════════════════════════════════ */}
      {isModalOpen && selectedBooking && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Asignar Operador</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="mb-5 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{selectedBooking.booking_ref}</span>
                  <span className="text-sm font-bold text-gray-900">${selectedBooking.total_price || selectedBooking.service_price}</span>
                </div>
                <h4 className="font-bold text-gray-900">{selectedBooking.service_name}</h4>
                <div className="flex items-center text-sm text-gray-500 mt-2">
                  <MapPin className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
                  {selectedBooking.address_line || 'Sin dirección'}
                </div>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {operators.length === 0 && <p className="text-gray-400 text-sm italic text-center py-4">No hay operadores disponibles.</p>}
                {operators.map(op => (
                  <button
                    key={op.id}
                    onClick={() => assignOperator(selectedBooking.id, op.id)}
                    disabled={assigning === selectedBooking.id}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                      selectedBooking.operator_id === op.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-100 hover:border-blue-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                        {op.full_name?.charAt(0)}
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900">{op.full_name}</p>
                        <p className="text-xs text-gray-500">{getOperatorStatus(op.id).label}</p>
                      </div>
                    </div>
                    {selectedBooking.operator_id === op.id
                      ? <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      : <ChevronRight className="h-5 w-5 text-gray-300" />
                    }
                  </button>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 text-right">
              <button onClick={() => setIsModalOpen(false)} className="text-sm font-bold text-gray-500 hover:text-gray-700">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          MODAL: EDITAR RESERVACIÓN
      ════════════════════════════════════════ */}
      {editModal && editData && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Editar Reservación</h3>
              <button onClick={() => setEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Fecha</label>
                <input type="date" value={editData.scheduled_date || ''}
                  onChange={e => setEditData(p => ({...p, scheduled_date: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Hora</label>
                <input type="time" value={editData.scheduled_time?.slice(0,5) || ''}
                  onChange={e => setEditData(p => ({...p, scheduled_time: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Dirección</label>
                <input type="text" value={editData.address_line || ''}
                  onChange={e => setEditData(p => ({...p, address_line: e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setEditModal(false)} className="text-sm font-bold text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={saveEdit} disabled={savingEdit}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50">
                {savingEdit ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          MODAL: FOTO
      ════════════════════════════════════════ */}
      {photoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPhotoModal(null)}>
          <div className="relative max-w-2xl w-full">
            <button onClick={() => setPhotoModal(null)} className="absolute -top-10 right-0 text-white hover:text-gray-300">
              <X className="h-6 w-6" />
            </button>
            <img src={photoModal} alt="Foto del servicio" className="w-full rounded-2xl shadow-2xl object-contain max-h-[80vh]" />
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminView;
