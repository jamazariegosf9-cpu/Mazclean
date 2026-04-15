// AdminViewB.jsx — Tab Operadores
// Contiene: Pendientes de aprobación (con nuevos docs), estado en tiempo real,
// historial, comisiones, KPIs, toggle assignment_mode, dar de alta operador

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Star } from 'lucide-react';
import { supabase } from './lib/supabase';
import { sendWhatsApp } from './lib/whatsapp';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BANCOS = ['BBVA','Banamex','Santander','Banorte','HSBC','Inbursa','Scotiabank','Afirme','BanBajio','Azteca','Otro'];

const WORK_DAYS_LABELS = {
  lun: 'Lunes', mar: 'Martes', mie: 'Miércoles', jue: 'Jueves',
  vie: 'Viernes', sab: 'Sábado', dom: 'Domingo'
};

const OPERATOR_STATUS_CONFIG = {
  activo:      { label: 'Activo',         color: '#10b981', bg: '#f0fdf4', border: '#bbf7d0', icon: '🟢' },
  observacion: { label: 'En Observación', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a', icon: '🟡' },
  suspendido:  { label: 'Suspendido',     color: '#ef4444', bg: '#fef2f2', border: '#fecaca', icon: '🔴' },
  desactivado: { label: 'Desactivado',    color: '#6b7280', bg: '#f3f4f6', border: '#e5e7eb', icon: '⚫' },
};

const getOpStatusCfg = (status) => OPERATOR_STATUS_CONFIG[status] || OPERATOR_STATUS_CONFIG['activo'];

const getPhotoStorageUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/service-photos/${path}`;
};

const getZoneMapUrl = (lat, lng, radius = 3000) => {
  if (!lat || !lng) return null;
  const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';
  const zoom = radius > 5000 ? 11 : radius > 2000 ? 12 : 13;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=400x200&maptype=roadmap&markers=color:blue%7C${lat},${lng}&key=${GOOGLE_KEY}`;
};

const AdminViewB = ({
  bookings, setBookings, operators, setOperators, isMobile,
  incidents, setIncidents, pendingOperators, setPendingOperators,
  fetchData,
}) => {
  const [incidentsHistory, setIncidentsHistory] = useState([]);
  const [operatorHistory, setOperatorHistory]   = useState(null);
  const [historyFilter, setHistoryFilter]       = useState({ from: '', to: '' });

  const [reviewModal, setReviewModal]           = useState(false);
  const [reviewingOp, setReviewingOp]           = useState(null);
  const [reviewAction, setReviewAction]         = useState(null);
  const [rejectionReason, setRejectionReason]   = useState('');
  const [savingReview, setSavingReview]         = useState(false);
  const [reviewError, setReviewError]           = useState('');
  const [reviewPhotoModal, setReviewPhotoModal] = useState(null);
  const [reviewDocTab, setReviewDocTab]         = useState('personal');

  const [updatingOpStatus, setUpdatingOpStatus] = useState(null);
  const [resetOnboardingModal, setResetOnboardingModal] = useState(null);
  const [savingOpAction, setSavingOpAction]     = useState(false);

  const [commissionModal, setCommissionModal]   = useState(false);
  const [commissionOp, setCommissionOp]         = useState(null);
  const [commissionPct, setCommissionPct]       = useState(15);
  const [savingCommission, setSavingCommission] = useState(false);
  const [commissionReport, setCommissionReport] = useState(null);

  const [kpisModal, setKpisModal]               = useState(false);
  const [kpisOp, setKpisOp]                     = useState(null);
  const [kpisData, setKpisData]                 = useState(null);
  const [kpisTimeline, setKpisTimeline]         = useState([]);
  const [loadingKpis, setLoadingKpis]           = useState(false);

  const [newOperator, setNewOperator]           = useState({ full_name: '', phone: '', email: '', password: '' });
  const [creatingOperator, setCreatingOperator] = useState(false);
  const [operatorError, setOperatorError]       = useState('');
  const [operatorSuccess, setOperatorSuccess]   = useState('');

  useEffect(() => {
    fetchIncidents();
    fetchPendingOperators();
  }, []);

  const fetchPendingOperators = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('role', 'operador')
        .in('operator_status', ['pendiente', 'pending_review']).order('created_at', { ascending: false });
      if (!error) setPendingOperators(data || []);
    } catch (err) { console.error('fetchPendingOperators:', err); }
  };

  const fetchIncidents = async () => {
    try {
      const { data } = await supabase.from('incidents').select('*, operator:operator_id(full_name, id)').eq('status', 'abierto').order('created_at', { ascending: false });
      setIncidents(data || []);
      const { data: history } = await supabase.from('incidents').select('*, operator:operator_id(full_name, id)').eq('status', 'resuelto').order('resolved_at', { ascending: false }).limit(20);
      setIncidentsHistory(history || []);
    } catch (err) { console.error('fetchIncidents:', err); setIncidents([]); setIncidentsHistory([]); }
  };

  const resolveIncident = async (incidentId) => {
    await supabase.from('incidents').update({ status: 'resuelto', resolved_at: new Date().toISOString() }).eq('id', incidentId);
    fetchIncidents();
  };

  const openReviewModal = (op) => {
    setReviewingOp(op); setReviewAction(null); setRejectionReason('');
    setReviewError(''); setReviewDocTab('personal'); setReviewModal(true);
  };

  const submitReview = async () => {
    if (!reviewAction) { setReviewError('Selecciona una acción.'); return; }
    if (reviewAction === 'reject' && !rejectionReason.trim()) { setReviewError('El motivo de rechazo es obligatorio.'); return; }
    setSavingReview(true); setReviewError('');
    try {
      const updatePayload = {
        operator_status: reviewAction === 'approve' ? 'aprobado' : 'rechazado',
        ...(reviewAction === 'reject' ? { onboarding_done: false, onboarding_step: 1, rejection_reason: rejectionReason.trim() } : {}),
        status: reviewAction === 'approve' ? 'activo' : undefined,
        reviewed_at: new Date().toISOString(),
        reviewed_by: (await supabase.auth.getUser()).data.user?.id || null,
      };
      const { error } = await supabase.from('profiles').update(updatePayload).eq('id', reviewingOp.id);
      if (error) throw error;
      const phone = reviewingOp?.phone;
      if (phone) {
        try {
          await sendWhatsApp(reviewAction === 'approve' ? 'operator_approved' : 'operator_rejected', phone, {
            operator_name: reviewingOp.full_name, rejection_reason: rejectionReason || ''
          });
        } catch (wsErr) { console.warn('WhatsApp omitido:', wsErr.message); }
      }
      setPendingOperators(prev => prev.filter(o => o.id !== reviewingOp.id));
      setOperators(prev => prev.map(o => o.id === reviewingOp.id
        ? { ...o, operator_status: reviewAction === 'approve' ? 'aprobado' : 'rechazado', onboarding_done: reviewAction === 'approve' } : o
      ));
      setReviewModal(false);
    } catch (err) { setReviewError(err.message); }
    finally { setSavingReview(false); }
  };

  const updateOperatorStatus = async (opId, newStatus) => {
    setUpdatingOpStatus(opId);
    try {
      const { error } = await supabase.from('profiles').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', opId);
      if (error) throw error;
      setOperators(prev => prev.map(o => o.id === opId ? { ...o, status: newStatus } : o));
    } catch (err) { alert(`Error: ${err.message}`); }
    finally { setUpdatingOpStatus(null); }
  };

  const toggleAssignmentMode = async (op) => {
    const newMode = op.assignment_mode === 'admin_asignado' ? 'autonomo' : 'admin_asignado';
    try {
      const { error } = await supabase.from('profiles').update({ assignment_mode: newMode, updated_at: new Date().toISOString() }).eq('id', op.id);
      if (error) throw error;
      setOperators(prev => prev.map(o => o.id === op.id ? { ...o, assignment_mode: newMode } : o));
    } catch (err) { alert('Error: ' + err.message); }
  };

  const resetOnboarding = async (op) => {
    setSavingOpAction(true);
    try {
      const { error } = await supabase.from('profiles').update({
        onboarding_done: false, onboarding_step: 1, operator_status: 'pendiente',
        kit_photo_url: null, coverage_zones: null, work_days: null,
        clabe: null, clabe_holder: null, bank_name: null,
        ine_front_url: null, ine_back_url: null, selfie_with_id_url: null,
        vehicle_photo_url: null, vehicle_plate: null, vehicle_type_own: null,
        proof_of_address_url: null, proof_of_life_video_url: null,
        terms_accepted_at: null, updated_at: new Date().toISOString(),
      }).eq('id', op.id);
      if (error) throw error;
      setOperators(prev => prev.map(o => o.id === op.id ? { ...o, onboarding_done: false, onboarding_step: 1, operator_status: 'pendiente' } : o));
      setResetOnboardingModal(null);
      alert(`✅ Onboarding reiniciado para ${op.full_name}.`);
    } catch (err) { alert(`Error: ${err.message}`); }
    finally { setSavingOpAction(false); }
  };

  const openCommissionModal = (op) => {
    setCommissionOp(op); setCommissionPct(op.commission_pct || 15);
    const opBookings = bookings.filter(b => b.operator_id === op.id && b.status === 'finalizado');
    const totalRevenue = opBookings.reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
    setCommissionReport({ bookings: opBookings, totalRevenue, services: opBookings.length });
    setCommissionModal(true);
  };

  const saveCommission = async () => {
    setSavingCommission(true);
    const { error } = await supabase.from('profiles').update({ commission_pct: parseFloat(commissionPct) }).eq('id', commissionOp.id);
    if (error) { alert(error.message); setSavingCommission(false); return; }
    setOperators(prev => prev.map(o => o.id === commissionOp.id ? { ...o, commission_pct: parseFloat(commissionPct) } : o));
    setSavingCommission(false); setCommissionModal(false);
  };

  const fetchOperatorKpis = async (op) => {
    setKpisOp(op); setLoadingKpis(true); setKpisModal(true);
    try {
      const { data: kpis } = await supabase.rpc('get_operator_time_kpis', { p_operator_id: op.id });
      setKpisData(kpis?.[0] || null);
      const { data: recentBookings } = await supabase.from('bookings')
        .select('id, booking_ref, service_name, scheduled_date, scheduled_time, duration_min')
        .eq('operator_id', op.id).eq('status', 'finalizado').order('updated_at', { ascending: false }).limit(5);
      if (recentBookings?.length > 0) {
        const timelines = await Promise.all(recentBookings.map(async (b) => {
          const { data: logs } = await supabase.from('booking_status_log').select('status, created_at, duration_seconds').eq('booking_id', b.id).order('created_at', { ascending: true });
          return { ...b, logs: logs || [] };
        }));
        setKpisTimeline(timelines);
      } else { setKpisTimeline([]); }
    } catch (err) { console.error('Error fetching KPIs:', err); }
    finally { setLoadingKpis(false); }
  };

  const fetchOperatorHistory = async (operatorId) => {
    let query = supabase.from('bookings').select('*, customer:client_id(full_name)').eq('operator_id', operatorId).eq('status', 'finalizado').order('scheduled_date', { ascending: false });
    if (historyFilter.from) query = query.gte('scheduled_date', historyFilter.from);
    if (historyFilter.to)   query = query.lte('scheduled_date', historyFilter.to);
    const { data, error } = await query;
    if (error) { alert(error.message); return; }
    setOperatorHistory({ operatorId, data });
  };

  const getOperatorStatus = (operatorId) => {
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

  const createOperator = async () => {
    setOperatorError(''); setOperatorSuccess('');
    if (!newOperator.email || !newOperator.password || !newOperator.full_name) { setOperatorError('Nombre, email y contraseña son requeridos.'); return; }
    if (newOperator.password.length < 8) { setOperatorError('La contraseña debe tener al menos 8 caracteres.'); return; }
    setCreatingOperator(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email: newOperator.email, password: newOperator.password, options: { data: { full_name: newOperator.full_name, phone: newOperator.phone, role: 'operador' } } });
      if (signUpError) throw signUpError;
      if (data?.user?.id) {
        const { error: profileError } = await supabase.from('profiles').upsert({ id: data.user.id, full_name: newOperator.full_name, phone: newOperator.phone || '', role: 'operador', operator_status: 'pending_review', onboarding_done: false, onboarding_step: 1, status: 'activo', updated_at: new Date().toISOString() }, { onConflict: 'id' });
        if (profileError) throw profileError;
      }
      setOperatorSuccess(`Operador ${newOperator.full_name} creado.`);
      setNewOperator({ full_name: '', phone: '', email: '', password: '' });
      fetchData();
    } catch (err) { setOperatorError(err.message); }
    finally { setCreatingOperator(false); }
  };

  const formatSeconds = (secs) => {
    if (!secs) return '—';
    const m = Math.floor(secs / 60); const s = secs % 60;
    return m > 0 ? `${m} min ${s > 0 ? s + 's' : ''}`.trim() : `${s}s`;
  };

  const formatTime = (isoStr) => {
    if (!isoStr) return '—';
    return new Date(isoStr).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  };

  const StarRating = ({ rating, size = 14 }) => {
    if (!rating) return <span style={{ fontSize: 11, color: '#9ca3af' }}>Sin calificaciones</span>;
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(<Star key={i} size={size} fill={i <= Math.round(rating) ? '#f59e0b' : 'none'} color={i <= Math.round(rating) ? '#f59e0b' : '#d1d5db'} style={{ display: 'inline-block' }} />);
    }
    return <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{stars}<span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4, fontWeight: 600 }}>{Number(rating).toFixed(1)}</span></span>;
  };

  const inputStyle = { padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 48 };
  const labelStyle = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };

  // ── Sección de documentos para la revisión ───────────────────────────────
  const DocImage = ({ url, label }) => {
    if (!url) return (
      <div style={{ background: '#f9fafb', borderRadius: 10, border: '2px dashed #e5e7eb', padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 4 }}>📷</div>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Sin {label}</div>
      </div>
    );
    const fullUrl = getPhotoStorageUrl(url);
    if (url.includes('.pdf')) return (
      <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}>📄</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>{label}</div>
          <a href={fullUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#059669' }}>Ver documento →</a>
        </div>
      </div>
    );
    if (url.includes('.mp4') || url.includes('.mov') || url.includes('video')) return (
      <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}>🎥</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>{label}</div>
          <a href={fullUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#3b82f6' }}>Ver video →</a>
        </div>
      </div>
    );
    return (
      <button onClick={() => setReviewPhotoModal(fullUrl)} style={{ background: 'none', border: 'none', cursor: 'zoom-in', padding: 0, display: 'block', width: '100%' }}>
        <img src={fullUrl} alt={label} style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, border: '1.5px solid #e5e7eb', display: 'block' }} />
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, textAlign: 'center' }}>Toca para ampliar — {label}</div>
      </button>
    );
  };

  return (
    <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>

      {/* Operadores pendientes */}
      {Array.isArray(pendingOperators) && pendingOperators.length > 0 && (
        <div style={{ background: '#fffbeb', borderRadius: 14, border: '2px solid #fde68a', padding: isMobile ? '16px' : '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#92400e', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              🕐 Operadores Pendientes de Aprobación
              <span style={{ background: '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>{pendingOperators.length}</span>
            </h2>
            <button onClick={fetchPendingOperators} style={{ border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, minHeight: 36, padding: '6px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.12)' }}>↻ Refrescar</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(320px,1fr))', gap: 12 }}>
            {pendingOperators.filter(op => op && op.id).map(op => {
              const step = op.onboarding_step || 0;
              const progressPct = Math.round((step / 6) * 100);
              const workDays = Array.isArray(op.work_days) ? op.work_days : [];
              return (
                <div key={op.id} style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #fde68a', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {op.selfie_with_id_url ? (
                        <img src={getPhotoStorageUrl(op.selfie_with_id_url)} alt="selfie" style={{ height: 52, width: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fde68a' }} />
                      ) : op.kit_photo_url ? (
                        <img src={getPhotoStorageUrl(op.kit_photo_url)} alt="kit" style={{ height: 52, width: 52, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fde68a' }} />
                      ) : (
                        <div style={{ height: 52, width: 52, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20 }}>{op.full_name?.charAt(0) || '?'}</div>
                      )}
                      <span style={{ position: 'absolute', bottom: -2, right: -2, background: '#f59e0b', borderRadius: '50%', width: 18, height: 18, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>⏳</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 14 }}>{op.full_name || 'Sin nombre'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>{op.phone || 'Sin teléfono'}</div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{op.created_at ? new Date(op.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' }}>Onboarding completado</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>{progressPct}%</span>
                    </div>
                    <div style={{ background: '#f3f4f6', borderRadius: 20, height: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg,#f59e0b,#fbbf24)', borderRadius: 20 }} />
                    </div>
                    {/* Indicadores de documentos */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      {[
                        { label: 'INE', done: !!op.ine_front_url },
                        { label: 'Selfie', done: !!op.selfie_with_id_url },
                        { label: 'CLABE', done: !!op.clabe },
                        { label: 'Kit', done: !!op.kit_photo_url },
                        { label: 'Domicilio', done: !!op.proof_of_address_url },
                        { label: 'Video', done: !!op.proof_of_life_video_url },
                        { label: 'Contrato', done: !!op.terms_accepted_at },
                      ].map(doc => (
                        <span key={doc.label} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: doc.done ? '#f0fdf4' : '#fef2f2', color: doc.done ? '#166534' : '#dc2626', fontWeight: 600, border: `1px solid ${doc.done ? '#bbf7d0' : '#fecaca'}` }}>
                          {doc.done ? '✅' : '❌'} {doc.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => openReviewModal(op)} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#f59e0b,#d97706)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 }}>
                    🔍 Revisar y Decidir
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Array.isArray(pendingOperators) && pendingOperators.length === 0 && (
        <div style={{ background: '#f0fdf4', borderRadius: 12, border: '1.5px solid #bbf7d0', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>Sin operadores pendientes de aprobación</span>
        </div>
      )}

      {/* Incidencias abiertas */}
      {Array.isArray(incidents) && incidents.length > 0 && (
        <div style={{ background: '#fef2f2', borderRadius: 14, border: '2px solid #fecaca', padding: isMobile ? '16px' : '20px 24px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#991b1b', margin: '0 0 14px' }}>⚠️ Incidencias Abiertas ({incidents.length})</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {incidents.filter(inc => inc && inc.id).map(inc => (
              <div key={inc.id} style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937' }}>👷 {inc.operator?.full_name || 'Operador'}</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>{inc.description || '—'}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{inc.created_at ? new Date(inc.created_at).toLocaleString('es-MX') : '—'}</div>
                </div>
                <button onClick={() => resolveIncident(inc.id)} style={{ padding: '8px 14px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 8, color: '#166534', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0, minHeight: 44 }}>✅ Resolver</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estado en tiempo real */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? '16px' : '20px 24px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', margin: '0 0 16px' }}>🟢 Estado en Tiempo Real</h2>
        {!Array.isArray(operators) || operators.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: 14, fontStyle: 'italic' }}>No hay operadores registrados.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {operators.filter(op => op && op.id).map(op => {
              const status = getOperatorStatus(op.id);
              const opBookings = bookings.filter(b => b.operator_id === op.id && b.status === 'finalizado');
              const totalRev = opBookings.reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
              const commission = totalRev * ((op.commission_pct || 15) / 100);
              const opStatusCfg = getOpStatusCfg(op.status);
              const showObsAlert = op.status === 'observacion' || (op.rating_avg && op.rating_avg < 4.0 && op.status === 'activo');
              return (
                <div key={op.id} style={{ background: '#f9fafb', borderRadius: 12, border: `1.5px solid ${opStatusCfg.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, opacity: op.status === 'desactivado' ? 0.7 : 1 }}>
                  {showObsAlert && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={14} color="#f59e0b" />
                      <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>
                        {op.status === 'observacion' ? 'En observación — calificación baja' : `Calificación ${op.rating_avg?.toFixed(1)} — considera ponerlo en observación`}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ height: 48, width: 48, borderRadius: '50%', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0 }}>{op.full_name?.charAt(0) || '?'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 14 }}>{op.full_name || 'Sin nombre'}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>{op.phone || 'Sin teléfono'}</div>
                      <div style={{ marginTop: 4 }}><StarRating rating={op.rating_avg} /></div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: opStatusCfg.bg, color: opStatusCfg.color, border: `1px solid ${opStatusCfg.border}`, fontWeight: 700 }}>{opStatusCfg.icon} {opStatusCfg.label}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: status.color }}>
                        <span style={{ height: 7, width: 7, borderRadius: '50%', background: status.dot, display: 'inline-block' }} />
                        {status.label}
                      </span>
                    </div>
                  </div>
                  <div style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Comisión ({op.commission_pct || 15}%)</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>${commission.toFixed(2)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Servicios</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{opBookings.length}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Rating</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: op.rating_avg >= 4 ? '#10b981' : op.rating_avg ? '#f59e0b' : '#9ca3af' }}>{op.rating_avg ? `${Number(op.rating_avg).toFixed(1)} ⭐` : '—'}</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 }}>Cambiar estado operativo</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4 }}>
                      {Object.entries(OPERATOR_STATUS_CONFIG).map(([key, cfg]) => (
                        <button key={key} onClick={() => updateOperatorStatus(op.id, key)} disabled={updatingOpStatus === op.id || op.status === key}
                          style={{ padding: '6px 2px', borderRadius: 8, border: `1.5px solid ${op.status === key ? cfg.color : '#e5e7eb'}`, background: op.status === key ? cfg.bg : '#fff', color: op.status === key ? cfg.color : '#6b7280', fontSize: 9, fontWeight: 700, cursor: op.status === key ? 'default' : 'pointer', textAlign: 'center', minHeight: 36, lineHeight: 1.3 }}>
                          {cfg.icon}<br/>{cfg.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 5 }}>
                    <button onClick={() => fetchOperatorHistory(op.id)} style={{ padding: '8px 0', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40 }}>📊<br/>Historial</button>
                    <button onClick={() => openCommissionModal(op)} style={{ padding: '8px 0', borderRadius: 8, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#166534', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40 }}>💰<br/>Comisión</button>
                    <button onClick={() => fetchOperatorKpis(op)} style={{ padding: '8px 0', borderRadius: 8, border: '1.5px solid #e9d5ff', background: '#faf5ff', color: '#7c3aed', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40 }}>⏱<br/>Tiempos</button>
                    <button onClick={() => setResetOnboardingModal(op)} style={{ padding: '8px 0', borderRadius: 8, border: '1.5px solid #fde68a', background: '#fffbeb', color: '#92400e', fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 40 }}>🔄<br/>Onboard</button>
                  </div>
                  {/* Toggle assignment_mode */}
                  <div style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{op.assignment_mode === 'admin_asignado' ? '⭐ Admin asignado' : '🤖 Autónomo'}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{op.assignment_mode === 'admin_asignado' ? 'Tiene prioridad en asignación automática' : 'Acepta servicios por su cuenta'}</div>
                    </div>
                    <button onClick={() => toggleAssignmentMode(op)} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: op.assignment_mode === 'admin_asignado' ? '#1e40af' : '#e5e7eb', color: op.assignment_mode === 'admin_asignado' ? '#fff' : '#6b7280', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, minHeight: 36 }}>
                      {op.assignment_mode === 'admin_asignado' ? '⭐ Admin' : '🤖 Autónomo'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historial del operador */}
      {operatorHistory && (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? '16px' : '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', margin: 0 }}>📊 Historial — {operators.find(o => o.id === operatorHistory.operatorId)?.full_name || '—'}</h2>
            <button onClick={() => setOperatorHistory(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 20, minHeight: 44, minWidth: 44 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {[['from','Desde'],['to','Hasta']].map(([key,label]) => (
              <div key={key}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>{label}</div>
                <input type="date" value={historyFilter[key]} onChange={e => setHistoryFilter(p => ({...p,[key]:e.target.value}))} style={{ ...inputStyle, width: 'auto' }} />
              </div>
            ))}
            <button onClick={() => fetchOperatorHistory(operatorHistory.operatorId)} style={{ padding: '12px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 48 }}>Filtrar</button>
          </div>
          {!operatorHistory.data || operatorHistory.data.length === 0 ? (
            <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: 14 }}>Sin servicios en este rango.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {operatorHistory.data.map(b => (
                <div key={b.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr auto', gap: 10, padding: '12px 14px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{b.booking_ref}</div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{b.service_name}</div>
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{b.customer?.full_name || '—'}</div>
                  {!isMobile && <div style={{ fontSize: 13, color: '#6b7280' }}>{b.scheduled_date}</div>}
                  <div style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>${b.total_price}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historial de incidencias */}
      {Array.isArray(incidentsHistory) && incidentsHistory.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? '16px' : '20px 24px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', margin: '0 0 14px' }}>📋 Historial de Incidencias ({incidentsHistory.length})</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {incidentsHistory.filter(inc => inc && inc.id).map(inc => (
              <div key={inc.id} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 16px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', background: '#f0fdf4', padding: '2px 8px', borderRadius: 20 }}>✅ Resuelta</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>👷 {inc.operator?.full_name || 'Operador'}</span>
                </div>
                <div style={{ fontSize: 13, color: '#374151' }}>{inc.description || '—'}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>📅 {inc.created_at ? new Date(inc.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</span>
                  {inc.resolved_at && <span style={{ fontSize: 11, color: '#9ca3af' }}>✅ {new Date(inc.resolved_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dar de alta operador */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? '16px' : '20px 24px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', margin: '0 0 16px' }}>➕ Dar de Alta Operador</h2>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          {[{ key: 'full_name', label: 'Nombre completo *', placeholder: 'Juan Pérez', type: 'text' }, { key: 'phone', label: 'Teléfono', placeholder: '5512345678', type: 'tel' }, { key: 'email', label: 'Email *', placeholder: 'op@mazclean.mx', type: 'email' }, { key: 'password', label: 'Contraseña *', placeholder: 'Mínimo 8 caracteres', type: 'password' }].map(field => (
            <div key={field.key}>
              <label style={labelStyle}>{field.label}</label>
              <input type={field.type} placeholder={field.placeholder} value={newOperator[field.key]} onChange={e => setNewOperator(p => ({...p, [field.key]: e.target.value}))} style={inputStyle} />
            </div>
          ))}
        </div>
        {operatorError   && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 12, color: '#dc2626', fontSize: 14 }}>⚠️ {operatorError}</div>}
        {operatorSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginTop: 12, color: '#166534', fontSize: 14 }}>✅ {operatorSuccess}</div>}
        <button onClick={createOperator} disabled={creatingOperator} style={{ marginTop: 16, padding: '14px 28px', background: creatingOperator ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: 'pointer', minHeight: 52, width: isMobile ? '100%' : 'auto' }}>
          {creatingOperator ? '⏳ Creando...' : '➕ Crear Operador'}
        </button>
      </div>

      {/* ════ MODAL: REVISAR OPERADOR ════ */}
      {reviewModal && reviewingOp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '24px 24px 0 0' : 20, boxShadow: '0 8px 48px rgba(0,0,0,0.25)', width: '100%', maxWidth: isMobile ? '100%' : 640, overflow: 'hidden', margin: isMobile ? 0 : 'auto' }}>
            <div style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>🔍 Revisión de Operador</h3>
                <div style={{ color: '#fef3c7', fontSize: 12, marginTop: 2 }}>{reviewingOp.full_name}</div>
              </div>
              <button onClick={() => setReviewModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 22, borderRadius: 8, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            {/* Tabs de documentos */}
            <div style={{ display: 'flex', background: '#fffbeb', borderBottom: '1px solid #fde68a', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {[
                { id: 'personal', label: '👤 Personal' },
                { id: 'identidad', label: '🪪 Identidad' },
                { id: 'banco', label: '🏦 Banco' },
                { id: 'domicilio', label: '🏠 Domicilio' },
                { id: 'vehiculo', label: '🚗 Vehículo' },
                { id: 'zona', label: '📍 Zona' },
                { id: 'contrato', label: '📋 Contrato' },
                { id: 'decision', label: '⚖️ Decisión' },
              ].map(tab => (
                <button key={tab.id} onClick={() => setReviewDocTab(tab.id)}
                  style={{ padding: '10px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: reviewDocTab === tab.id ? '#fff' : 'transparent', color: reviewDocTab === tab.id ? '#92400e' : '#b45309', borderBottom: reviewDocTab === tab.id ? '2px solid #f59e0b' : '2px solid transparent', minHeight: 44 }}>
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ padding: isMobile ? '16px' : 24, maxHeight: isMobile ? '65vh' : '60vh', overflowY: 'auto' }}>

              {/* Tab: Personal */}
              {reviewDocTab === 'personal' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>👤 Datos Personales</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Nombre', value: reviewingOp.full_name },
                        { label: 'Teléfono', value: reviewingOp.phone || '—' },
                        { label: 'CURP', value: reviewingOp.curp || '—' },
                        { label: 'Solicitud', value: reviewingOp.created_at ? new Date(reviewingOp.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
                        { label: 'Experiencia', value: reviewingOp.experience_years ? `${reviewingOp.experience_years} años` : '—' },
                        { label: 'Notas de experiencia', value: reviewingOp.experience_notes || '—' },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{label}</div>
                          <div style={{ fontSize: 13, color: '#1f2937', fontWeight: 600, marginTop: 2 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Identidad */}
              {reviewDocTab === 'identidad' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>🪪 INE — Frente</div>
                    <DocImage url={reviewingOp.ine_front_url} label="INE Frente" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>🪪 INE — Reverso</div>
                    <DocImage url={reviewingOp.ine_back_url} label="INE Reverso" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>🤳 Selfie con INE</div>
                    <DocImage url={reviewingOp.selfie_with_id_url} label="Selfie con INE" />
                  </div>
                </div>
              )}

              {/* Tab: Banco */}
              {reviewDocTab === 'banco' && (
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #bbf7d0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', marginBottom: 10 }}>🏦 Datos Bancarios</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                    {[
                      { label: 'Banco', value: reviewingOp.bank_name || '—' },
                      { label: 'Titular', value: reviewingOp.clabe_holder || '—' },
                      { label: 'CLABE', value: reviewingOp.clabe || '—' },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>{label}</div>
                        <div style={{ fontSize: 13, color: '#065f46', fontWeight: 600, marginTop: 2, fontFamily: label === 'CLABE' ? 'monospace' : 'inherit' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tab: Domicilio */}
              {reviewDocTab === 'domicilio' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #bae6fd' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', marginBottom: 10 }}>📍 Dirección Declarada</div>
                    <div style={{ fontSize: 13, color: '#0369a1', fontWeight: 600 }}>{reviewingOp.base_address || '—'}</div>
                    {reviewingOp.base_lat && reviewingOp.base_lng && (() => {
                      const mapUrl = getZoneMapUrl(reviewingOp.base_lat, reviewingOp.base_lng, reviewingOp.coverage_radius ? reviewingOp.coverage_radius * 1000 : 3000);
                      return mapUrl ? (
                        <div style={{ marginTop: 12 }}>
                          <img src={mapUrl} alt="zona" style={{ width: '100%', borderRadius: 10, border: '1.5px solid #bae6fd', maxHeight: 180, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                          <div style={{ fontSize: 10, color: '#7dd3fc', marginTop: 4 }}>Coordenadas: {Number(reviewingOp.base_lat).toFixed(5)}, {Number(reviewingOp.base_lng).toFixed(5)}</div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📄 Comprobante de Domicilio</div>
                    <DocImage url={reviewingOp.proof_of_address_url} label="Comprobante de domicilio" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>🎥 Video de Prueba de Vida</div>
                    <DocImage url={reviewingOp.proof_of_life_video_url} label="Video de prueba de vida" />
                  </div>
                </div>
              )}

              {/* Tab: Vehículo */}
              {reviewDocTab === 'vehiculo' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>🚗 Datos del Vehículo</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                      {[
                        { label: 'Placa', value: reviewingOp.vehicle_plate || '—' },
                        { label: 'Tipo de transporte', value: reviewingOp.vehicle_type_own || '—' },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{label}</div>
                          <div style={{ fontSize: 13, color: '#1f2937', fontWeight: 600, marginTop: 2 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    {reviewingOp.requires_transport_verification && (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e' }}>
                        ⚠️ Radio &gt; 2km — requiere verificación de transporte
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📸 Foto del Vehículo</div>
                    <DocImage url={reviewingOp.vehicle_photo_url} label="Foto del vehículo" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>📸 Foto del Kit de Materiales</div>
                    <DocImage url={reviewingOp.kit_photo_url} label="Kit de materiales" />
                  </div>
                </div>
              )}

              {/* Tab: Zona */}
              {reviewDocTab === 'zona' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #bae6fd' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', marginBottom: 10 }}>📍 Zona de Operación</div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                      {[
                        { label: 'Radio de cobertura', value: reviewingOp.coverage_radius ? `${reviewingOp.coverage_radius} km` : '—' },
                        { label: 'Días de trabajo', value: Array.isArray(reviewingOp.work_days) && reviewingOp.work_days.length > 0 ? reviewingOp.work_days.map(d => WORK_DAYS_LABELS[d] || d).join(', ') : '—' },
                        { label: 'Horario', value: reviewingOp.work_start && reviewingOp.work_end ? `${reviewingOp.work_start} – ${reviewingOp.work_end}` : '—' },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={{ fontSize: 10, color: '#0284c7', fontWeight: 600 }}>{label}</div>
                          <div style={{ fontSize: 13, color: '#0369a1', fontWeight: 600, marginTop: 2 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Contrato */}
              {reviewDocTab === 'contrato' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ background: reviewingOp.terms_accepted_at ? '#f0fdf4' : '#fef2f2', borderRadius: 12, padding: '14px 16px', border: `1.5px solid ${reviewingOp.terms_accepted_at ? '#bbf7d0' : '#fecaca'}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: reviewingOp.terms_accepted_at ? '#166534' : '#dc2626', marginBottom: 8 }}>
                      {reviewingOp.terms_accepted_at ? '✅ Contrato aceptado digitalmente' : '❌ Contrato no aceptado'}
                    </div>
                    {reviewingOp.terms_accepted_at && (
                      <div style={{ fontSize: 12, color: '#059669' }}>Fecha de aceptación: {new Date(reviewingOp.terms_accepted_at).toLocaleString('es-MX')}</div>
                    )}
                  </div>
                  <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 }}>Consentimiento antecedentes</div>
                    <div style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
                      {reviewingOp.background_check_consent ? '✅ Autorizado' : '⏭️ No autorizado (opcional)'}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Decisión */}
              {reviewDocTab === 'decision' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <button onClick={() => setReviewAction('approve')}
                      style={{ padding: '14px', borderRadius: 12, border: reviewAction === 'approve' ? '2.5px solid #10b981' : '1.5px solid #e5e7eb', background: reviewAction === 'approve' ? '#f0fdf4' : '#fff', color: reviewAction === 'approve' ? '#065f46' : '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 56 }}>
                      ✅ Aprobar
                    </button>
                    <button onClick={() => setReviewAction('reject')}
                      style={{ padding: '14px', borderRadius: 12, border: reviewAction === 'reject' ? '2.5px solid #ef4444' : '1.5px solid #e5e7eb', background: reviewAction === 'reject' ? '#fef2f2' : '#fff', color: reviewAction === 'reject' ? '#991b1b' : '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 56 }}>
                      ❌ Rechazar
                    </button>
                  </div>
                  {reviewAction === 'reject' && (
                    <div>
                      <label style={{ ...labelStyle, color: '#991b1b' }}>Motivo de rechazo * <span style={{ fontWeight: 400, color: '#9ca3af' }}>(se enviará al operador)</span></label>
                      <textarea placeholder="Ej: Las fotos del INE no son claras..." value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} style={{ ...inputStyle, height: 80, resize: 'vertical', borderColor: '#fecaca', background: '#fff5f5' }} />
                    </div>
                  )}
                  {reviewAction === 'approve' && (
                    <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>ℹ️</span>
                      <span style={{ fontSize: 12, color: '#065f46' }}>Al aprobar, el operador recibirá un WhatsApp de bienvenida y podrá recibir servicios.</span>
                    </div>
                  )}
                  {reviewError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>⚠️ {reviewError}</div>}
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setReviewModal(false)} style={{ padding: '12px 22px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              {reviewDocTab === 'decision' && (
                <button onClick={submitReview} disabled={savingReview || !reviewAction}
                  style={{ padding: '12px 28px', background: savingReview || !reviewAction ? '#9ca3af' : reviewAction === 'approve' ? '#10b981' : '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: !reviewAction ? 'not-allowed' : 'pointer', minHeight: 48 }}>
                  {savingReview ? '⏳ Guardando...' : reviewAction === 'approve' ? '✅ Confirmar Aprobación' : reviewAction === 'reject' ? '❌ Confirmar Rechazo' : 'Selecciona una acción'}
                </button>
              )}
              {reviewDocTab !== 'decision' && (
                <button onClick={() => setReviewDocTab('decision')} style={{ padding: '12px 22px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                  Ir a Decisión →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Foto ampliada */}
      {reviewPhotoModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setReviewPhotoModal(null)}>
          <div style={{ position: 'relative', maxWidth: 600, width: '100%' }}>
            <button onClick={() => setReviewPhotoModal(null)} style={{ position: 'absolute', top: -44, right: 0, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 24, borderRadius: 8, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            <img src={reviewPhotoModal} alt="Documento" style={{ width: '100%', borderRadius: 16, maxHeight: '82vh', objectFit: 'contain' }} />
          </div>
        </div>
      )}

      {/* Modal: Comisión */}
      {commissionModal && commissionOp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: isMobile ? '100%' : 460, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#059669,#10b981)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>💰 Comisiones — {commissionOp.full_name}</h3>
              <button onClick={() => setCommissionModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#a7f3d0', fontSize: 22, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: isMobile ? '16px' : 20 }}>
              {commissionReport && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
                  {[{ label: 'Servicios', value: commissionReport.services, color: '#1e40af' }, { label: 'Ingresos', value: `$${commissionReport.totalRevenue.toFixed(2)}`, color: '#059669' }, { label: 'Comisión', value: `$${(commissionReport.totalRevenue * (commissionPct / 100)).toFixed(2)}`, color: '#7c3aed' }].map((s, i) => (
                    <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <label style={labelStyle}>Porcentaje de comisión (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" min="0" max="100" step="0.5" value={commissionPct} onChange={e => setCommissionPct(e.target.value)} style={{ ...inputStyle, width: 100 }} />
                  <span style={{ fontSize: 14, color: '#6b7280' }}>= ${((commissionReport?.totalRevenue || 0) * (commissionPct / 100)).toFixed(2)} MXN</span>
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCommissionModal(false)} style={{ padding: '12px 20px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={saveCommission} disabled={savingCommission} style={{ padding: '12px 24px', background: savingCommission ? '#9ca3af' : '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                {savingCommission ? '⏳ Guardando...' : '💾 Guardar %'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: KPIs */}
      {kpisModal && kpisOp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: isMobile ? '100%' : 560, overflow: 'hidden', margin: isMobile ? 0 : 'auto' }}>
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>⏱ Rendimiento — {kpisOp.full_name}</h3>
              <button onClick={() => setKpisModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#ede9fe', fontSize: 22, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: isMobile ? '16px' : 20, maxHeight: '70vh', overflowY: 'auto' }}>
              {loadingKpis ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>⏳ Calculando KPIs...</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 20 }}>
                    {[
                      { label: 'Prom. traslado', value: formatSeconds(Math.round(kpisData?.avg_travel_seconds || 0)), icon: '🚗', color: '#3b82f6' },
                      { label: 'Prom. lavado',   value: formatSeconds(Math.round(kpisData?.avg_washing_seconds || 0)), icon: '🧽', color: '#f97316' },
                      { label: 'Servicios',      value: kpisData?.total_services || 0, icon: '✅', color: '#10b981' },
                      { label: 'Real vs Est.',   value: kpisData?.avg_real_vs_estimated ? `${Math.round(kpisData.avg_real_vs_estimated)}%` : '—', icon: '📊', color: kpisData?.avg_real_vs_estimated > 110 ? '#ef4444' : '#7c3aed' },
                    ].map((k, i) => (
                      <div key={i} style={{ background: '#f9fafb', borderRadius: 12, padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{k.label}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
                      </div>
                    ))}
                  </div>
                  {kpisTimeline.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>Sin servicios finalizados aún.</p>}
                </>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', textAlign: 'right' }}>
              <button onClick={() => setKpisModal(false)} style={{ padding: '12px 24px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reset Onboarding */}
      {resetOnboardingModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: 400, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', padding: '16px 20px' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>🔄 Reiniciar Onboarding</h3>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 14, color: '#374151', margin: '0 0 8px', lineHeight: 1.6 }}>¿Confirmas reiniciar el onboarding de <strong>{resetOnboardingModal.full_name}</strong>?</p>
              <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#854d0e', lineHeight: 1.5 }}>
                ⚠️ Se eliminarán todos los documentos y datos del onboarding. El operador deberá completar los 5 pasos de nuevo.
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button onClick={() => setResetOnboardingModal(null)} style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={() => resetOnboarding(resetOnboardingModal)} disabled={savingOpAction} style={{ flex: 1, padding: '12px', background: savingOpAction ? '#9ca3af' : '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                {savingOpAction ? '⏳ Procesando...' : '🔄 Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminViewB;
