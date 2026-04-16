// AdminViewC.jsx — Shell principal
// Contiene: Stats cards, navegación de tabs, Tab Catálogo
// Importa AdminViewA (Reservaciones) y AdminViewB (Operadores)

import React, { useState, useEffect } from 'react';
import {
  Plus, ToggleLeft, ToggleRight, Save, CheckSquare, AlertTriangle, Star
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { sendWhatsApp } from './lib/whatsapp';
import AdminViewA from './AdminViewA';
import AdminViewB from './AdminViewB';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const EMOJI_OPTIONS = ['🚿','🪣','✨','💎','🏆','🚗','🧽','💧','🛻','🚙','⚡','🔧','🪟','🧴','🫧'];

const emptyService = {
  name: '', description: '', icon: '🚿', color: '#3b82f6',
  price_sedan: '', price_suv: '', price_truck: '', price_van: '',
  duration_min: '', duration_sedan: '', duration_suv: '', duration_pickup: '', duration_van: '',
  supplies_notes: '', is_active: true, sort_order: 99
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

const AdminViewC = () => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab]   = useState('bookings');
  const [bookings, setBookings]     = useState([]);
  const [operators, setOperators]   = useState([]);
  const [incidents, setIncidents]   = useState([]);
  const [pendingOperators, setPendingOperators] = useState([]);
  const [unattendedBookings, setUnattendedBookings] = useState([]);
  const [loading, setLoading]       = useState(true);

  const [stats, setStats] = useState({
    total: 0, pending: 0, active: 0, completed: 0, cancelled: 0, revenue: 0, completionRate: 0
  });

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const [services, setServices]               = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceModal, setServiceModal]       = useState(false);
  const [serviceForm, setServiceForm]         = useState(emptyService);
  const [editingService, setEditingService]   = useState(null);
  const [savingService, setSavingService]     = useState(false);
  const [serviceError, setServiceError]       = useState('');
  const [serviceSuccess, setServiceSuccess]   = useState('');
  const [checklistItems, setChecklistItems]   = useState([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [savingChecklist, setSavingChecklist] = useState(false);

  useEffect(() => {
    fetchData();
    fetchUnattendedBookings();
    const channel = supabase
      .channel('admin-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchData();
        fetchUnattendedBookings();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (activeTab === 'catalog') fetchServices();
  }, [activeTab]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: bookingsData } = await supabase
        .from('bookings')
        .select('*, customer:client_id(full_name, phone), operator:operator_id(full_name, phone)')
        .order('created_at', { ascending: false });
      const { data: operatorsData } = await supabase
        .from('profiles').select('*').eq('role', 'operador');

      setBookings(bookingsData || []);
      setOperators(operatorsData || []);

      const total     = (bookingsData || []).length;
      const completed = (bookingsData || []).filter(b => b.status === 'finalizado').length;
      const cancelled = (bookingsData || []).filter(b => b.status === 'cancelado').length;
      const revenue   = (bookingsData || []).filter(b => b.status === 'finalizado').reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
      setStats({
        total, completed, cancelled,
        pending:        (bookingsData || []).filter(b => b.status === 'pendiente').length,
        active:         (bookingsData || []).filter(b => ['confirmado','en_camino','en_proceso'].includes(b.status)).length,
        revenue,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
      });
    } catch (err) { console.error('fetchData:', err); }
    finally { setLoading(false); }
  };

  const fetchUnattendedBookings = async () => {
    try {
      const { data } = await supabase
        .from('bookings')
        .select('*, customer:client_id(full_name, phone)')
        .eq('status', 'pendiente').is('operator_id', null).eq('current_ronda', 4)
        .order('created_at', { ascending: true });
      setUnattendedBookings(data || []);
    } catch (err) { console.error('fetchUnattendedBookings:', err); }
  };

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const fetchServices = async () => {
    setLoadingServices(true);
    try {
      const { data } = await supabase.from('services').select('*').order('sort_order', { ascending: true });
      setServices(data || []);
    } catch (err) { console.error('fetchServices:', err); }
    finally { setLoadingServices(false); }
  };

  const loadChecklist = async (serviceId) => {
    const { data } = await supabase.from('service_checklist').select('*').eq('service_id', serviceId).order('sort_order', { ascending: true });
    setChecklistItems(data || []);
  };

  const addChecklistItem = async (serviceId) => {
    if (!newChecklistItem.trim()) return;
    setSavingChecklist(true);
    const { data, error } = await supabase.from('service_checklist').insert({ service_id: serviceId, item: newChecklistItem.trim(), sort_order: checklistItems.length + 1 }).select().single();
    if (!error) { setChecklistItems(prev => [...prev, data]); setNewChecklistItem(''); }
    setSavingChecklist(false);
  };

  const deleteChecklistItem = async (itemId) => {
    await supabase.from('service_checklist').delete().eq('id', itemId);
    setChecklistItems(prev => prev.filter(i => i.id !== itemId));
  };

  const openNewService = () => {
    setEditingService(null); setServiceForm(emptyService);
    setServiceError(''); setServiceSuccess(''); setChecklistItems([]);
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
        setServiceSuccess('Servicio actualizado.');
      } else {
        const { error } = await supabase.from('services').insert({ ...payload, created_at: new Date().toISOString() });
        if (error) throw error;
        setServiceSuccess('Servicio creado.');
      }
      await fetchServices();
      setTimeout(() => { setServiceModal(false); setServiceSuccess(''); }, 1200);
    } catch (err) { setServiceError(err.message); }
    finally { setSavingService(false); }
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

  const inputStyle = { padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 48 };
  const labelStyle = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };

  const statCards = [
    { label: 'Total',        value: stats.total,                          icon: '📋', color: '#6b7280' },
    { label: 'Pendientes',   value: stats.pending,                        icon: '⏳', color: '#d97706' },
    { label: 'En Curso',     value: stats.active,                         icon: '🔵', color: '#3b82f6' },
    { label: 'Finalizados',  value: stats.completed,                      icon: '✅', color: '#10b981' },
    { label: 'Cancelados',   value: stats.cancelled,                      icon: '❌', color: '#ef4444' },
    { label: 'Ingresos',     value: `$${stats.revenue.toLocaleString()}`, icon: '💰', color: '#059669' },
    { label: '% Completado', value: `${stats.completionRate}%`,           icon: '📈', color: '#7c3aed' },
  ];

  // Props compartidos para A y B
  const sharedProps = { bookings, setBookings, operators, setOperators, loading, isMobile, sendWhatsApp };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', paddingBottom: 48, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: isMobile ? '20px 16px' : '28px 24px 24px', textAlign: 'center' }}>
        <h1 style={{ color: '#fff', fontSize: isMobile ? 18 : 22, fontWeight: 700, margin: '0 0 4px' }}>🛠 Dashboard de Administración</h1>
        <p style={{ color: '#bfdbfe', fontSize: 13, margin: 0 }}>Gestión integral de MazClean</p>
        <button onClick={fetchData} style={{ marginTop: 16, background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 8, padding: '10px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
          ↻ Actualizar
        </button>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 12px' : '0 16px', overflowX: 'hidden', boxSizing: 'border-box' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit,minmax(140px,1fr))', gap: isMobile ? 8 : 12, marginTop: 20 }}>
          {statCards.map((s, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? '14px' : '16px 18px' }}>
              <div style={{ fontSize: isMobile ? 20 : 22, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
              <div style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: s.color, marginTop: 2 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 20, background: '#e5e7eb', padding: 4, borderRadius: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[
            { id: 'bookings',  label: `📋 Reservaciones${unattendedBookings.length > 0 ? ` 🚨${unattendedBookings.length}` : ''}` },
            { id: 'operators', label: `👷 Operadores${incidents.length > 0 || pendingOperators.length > 0 ? ` ⚠️${incidents.length + pendingOperators.length}` : ''}` },
            { id: 'catalog',   label: '🛎 Catálogo' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: isMobile ? '8px 12px' : '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: isMobile ? 12 : 14, fontWeight: 600, whiteSpace: 'nowrap', background: activeTab === tab.id ? '#fff' : 'transparent', color: activeTab === tab.id ? '#1e40af' : '#6b7280', boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.2s', minHeight: 44 }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Reservaciones */}
        {activeTab === 'bookings' && (
          <AdminViewA
            {...sharedProps}
            unattendedBookings={unattendedBookings}
            setUnattendedBookings={setUnattendedBookings}
            fetchData={fetchData}
            fetchUnattendedBookings={fetchUnattendedBookings}
          />
        )}

        {/* Tab: Operadores */}
        {activeTab === 'operators' && (
          <AdminViewB
            {...sharedProps}
            incidents={incidents}
            setIncidents={setIncidents}
            pendingOperators={pendingOperators}
            setPendingOperators={setPendingOperators}
            fetchData={fetchData}
          />
        )}

        {/* Tab: Catálogo */}
        {activeTab === 'catalog' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', margin: 0 }}>🛎 Catálogo de Servicios</h2>
                <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0' }}>Administra los servicios y sus checklists</p>
              </div>
              <button onClick={openNewService} style={{ padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(59,130,246,0.3)', minHeight: 44 }}>
                <Plus size={15} /> Nuevo
              </button>
            </div>
            {loadingServices ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 14 }}>Cargando servicios...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(320px,1fr))', gap: 14 }}>
                {services.map(service => (
                  <div key={service.id} style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden', border: service.is_active ? '2px solid transparent' : '2px solid #e5e7eb', opacity: service.is_active ? 1 : 0.7 }}>
                    <div style={{ background: `linear-gradient(135deg, ${service.color}22, ${service.color}11)`, borderBottom: `2px solid ${service.color}33`, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 26 }}>{service.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 15 }}>{service.name}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{service.description}</div>
                        </div>
                      </div>
                      <button onClick={() => toggleServiceStatus(service)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, minHeight: 44 }}>
                        {service.is_active ? <ToggleRight size={28} color="#10b981" /> : <ToggleLeft size={28} color="#9ca3af" />}
                      </button>
                    </div>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Precios</div>
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
                      <div style={{ padding: '10px 16px', borderBottom: '1px solid #f3f4f6', background: '#fefce8' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>🧴 Insumos</div>
                        <div style={{ fontSize: 12, color: '#854d0e' }}>{service.supplies_notes}</div>
                      </div>
                    )}
                    <div style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
                      <button onClick={() => openEditService(service)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 }}>✏️ Editar</button>
                      <button onClick={() => deleteService(service.id)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 }}>🗑 Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Crear/Editar Servicio */}
      {serviceModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, boxShadow: '0 8px 40px rgba(0,0,0,0.20)', width: '100%', maxWidth: isMobile ? '100%' : 640, overflow: 'hidden', margin: isMobile ? 0 : 'auto' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 17, margin: 0 }}>{editingService ? '✏️ Editar Servicio' : '➕ Nuevo Servicio'}</h3>
              <button onClick={() => setServiceModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#bfdbfe', fontSize: 22, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: isMobile ? '16px' : 24, maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={labelStyle}>Nombre del servicio *</label>
                  <input type="text" placeholder="Ej: Lavado de Motor" value={serviceForm.name} onChange={e => setServiceForm(p => ({...p, name: e.target.value}))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Descripción</label>
                  <textarea placeholder="Describe qué incluye este servicio..." value={serviceForm.description} onChange={e => setServiceForm(p => ({...p, description: e.target.value}))} style={{ ...inputStyle, height: 70, resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Icono</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {EMOJI_OPTIONS.map(emoji => (
                    <button key={emoji} onClick={() => setServiceForm(p => ({...p, icon: emoji}))} style={{ fontSize: 22, padding: '8px', borderRadius: 8, border: serviceForm.icon === emoji ? '2px solid #3b82f6' : '1.5px solid #e5e7eb', background: serviceForm.icon === emoji ? '#eff6ff' : '#fff', cursor: 'pointer', minHeight: 44 }}>{emoji}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Color:</label>
                  <input type="color" value={serviceForm.color} onChange={e => setServiceForm(p => ({...p, color: e.target.value}))} style={{ width: 44, height: 44, borderRadius: 6, border: '1.5px solid #e5e7eb', cursor: 'pointer', padding: 2 }} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Precios por tipo de vehículo (MXN)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {[{ key: 'price_sedan', label: '🚗 Sedán *' }, { key: 'price_suv', label: '🚙 SUV' }, { key: 'price_truck', label: '🛻 Pickup' }, { key: 'price_van', label: '🚐 Van' }].map(f => (
                    <div key={f.key}>
                      <label style={{ ...labelStyle, fontSize: 11 }}>{f.label}</label>
                      <input type="number" placeholder="0" value={serviceForm[f.key]} onChange={e => setServiceForm(p => ({...p, [f.key]: e.target.value}))} style={inputStyle} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Duración por tipo (minutos)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {[{ key: 'duration_sedan', label: '🚗 Sedán' }, { key: 'duration_suv', label: '🚙 SUV' }, { key: 'duration_pickup', label: '🛻 Pickup' }, { key: 'duration_van', label: '🚐 Van' }].map(f => (
                    <div key={f.key}>
                      <label style={{ ...labelStyle, fontSize: 11 }}>{f.label}</label>
                      <input type="number" placeholder="45" value={serviceForm[f.key]} onChange={e => setServiceForm(p => ({...p, [f.key]: e.target.value}))} style={inputStyle} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>🧴 Insumos estimados (opcional)</label>
                <textarea placeholder="Ej: 1L shampoo, 200ml cera, 2 microfibras..." value={serviceForm.supplies_notes} onChange={e => setServiceForm(p => ({...p, supplies_notes: e.target.value}))} style={{ ...inputStyle, height: 60, resize: 'vertical' }} />
              </div>
              {editingService && (
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>✅ Checklist de calidad</label>
                  <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                    {checklistItems.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CheckSquare size={16} color="#10b981" />
                          <span style={{ fontSize: 14, color: '#374151' }}>{item.item}</span>
                        </div>
                        <button onClick={() => deleteChecklistItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 18, minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" placeholder="Agregar ítem..." value={newChecklistItem} onChange={e => setNewChecklistItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addChecklistItem(editingService)} style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => addChecklistItem(editingService)} disabled={savingChecklist} style={{ padding: '12px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', flexShrink: 0, minHeight: 48 }}>+ Agregar</button>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Orden</label>
                  <input type="number" placeholder="1" value={serviceForm.sort_order} onChange={e => setServiceForm(p => ({...p, sort_order: e.target.value}))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Estado</label>
                  <button onClick={() => setServiceForm(p => ({...p, is_active: !p.is_active}))} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: serviceForm.is_active ? '#f0fdf4' : '#fef2f2', color: serviceForm.is_active ? '#166534' : '#991b1b', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 }}>
                    {serviceForm.is_active ? <><ToggleRight size={18} color="#10b981" /> Activo</> : <><ToggleLeft size={18} color="#ef4444" /> Inactivo</>}
                  </button>
                </div>
              </div>
              {serviceError   && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 14 }}>⚠️ {serviceError}</div>}
              {serviceSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#166534', fontSize: 14 }}>✅ {serviceSuccess}</div>}
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setServiceModal(false)} style={{ padding: '12px 22px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={saveService} disabled={savingService} style={{ padding: '12px 28px', background: savingService ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: 48 }}>
                <Save size={15} /> {savingService ? 'Guardando...' : editingService ? 'Actualizar' : 'Crear Servicio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminViewC;
