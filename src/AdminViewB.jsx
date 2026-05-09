// AdminViewB.jsx — Tab Operadores v3
// Nuevas funciones:
// - Filtros de chips: Todos / Sin revisar / Correcciones / Aprobados recientes / Activos
// - Filtro por zona declarada (texto) y radio de cobertura
// - Eliminar operador: desactivar o eliminar permanentemente
// - Sistema de rechazo por documentos específicos

import React, { useState, useEffect } from 'react';
import { AlertTriangle, Star } from 'lucide-react';
import { supabase } from './lib/supabase';
import { sendWhatsApp } from './lib/whatsapp';
import { useToast } from './App';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const getMembershipBadge = (op) => {
  const status = op.membership_status || 'ninguna';
  if (status === 'activa') {
    const endAt    = op.membership_end_at ? new Date(op.membership_end_at) : null;
    const daysLeft = endAt ? Math.ceil((endAt - new Date()) / (1000 * 60 * 60 * 24)) : null;
    return { label: daysLeft !== null ? `💳 Activa — ${daysLeft}d` : '💳 Activa', color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' };
  }
  if (status === 'vencida') return { label: '⚠️ Vencida', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
  return { label: '○ Sin membresía', color: '#9ca3af', bg: '#f9fafb', border: '#e5e7eb' };
};

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

const REJECTABLE_DOCS = [
  { key: 'ine_front_url',           label: 'INE — Frente',              icon: '🪪', step: 2 },
  { key: 'ine_back_url',            label: 'INE — Reverso',             icon: '🪪', step: 2 },
  { key: 'selfie_with_id_url',      label: 'Selfie con INE',            icon: '🤳', step: 2 },
  { key: 'clabe',                   label: 'Datos bancarios (CLABE)',    icon: '🏦', step: 2 },
  { key: 'proof_of_address_url',    label: 'Comprobante de domicilio',  icon: '📄', step: 3 },
  { key: 'proof_of_life_video_url', label: 'Video de prueba de vida',   icon: '🎥', step: 3 },
  { key: 'vehicle_photo_url',       label: 'Foto del vehículo',         icon: '🚗', step: 3 },
  { key: 'kit_photo_url',           label: 'Foto del kit de materiales',icon: '🧴', step: 4 },
  { key: 'terms_accepted_at',       label: 'Contrato / Firma digital',  icon: '📋', step: 5 },
];

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
  const { showToast } = useToast();
  const [incidentsHistory, setIncidentsHistory] = useState([]);
  const [operatorHistory, setOperatorHistory]   = useState(null);
  const [historyFilter, setHistoryFilter]       = useState({ from: '', to: '' });

  // ── Filtros ───────────────────────────────────────────────────────────────
  const [activeChip, setActiveChip]         = useState('todos');
  const [zoneSearch, setZoneSearch]         = useState('');
  const [radiusFilter, setRadiusFilter]     = useState('all');
  // ── Paginación ────────────────────────────────────────────────────────────
  const [operatorsPage, setOperatorsPage]   = useState(1);
  const [pendingPage, setPendingPage]       = useState(1);
  const OPERATORS_PER_PAGE = 15;
  const PENDING_PER_PAGE   = 10;

  // ── Review modal ─────────────────────────────────────────────────────────
  const [reviewModal, setReviewModal]       = useState(false);
  const [reviewingOp, setReviewingOp]       = useState(null);
  const [reviewAction, setReviewAction]     = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectedDocs, setRejectedDocs]     = useState([]);
  const [savingReview, setSavingReview]     = useState(false);
  const [reviewError, setReviewError]       = useState('');
  const [reviewPhotoModal, setReviewPhotoModal] = useState(null);
  const [reviewDocTab, setReviewDocTab]     = useState('personal');

  // ── Delete modal ──────────────────────────────────────────────────────────
  const [deleteModal, setDeleteModal]       = useState(null); // op object
  const [deleteMode, setDeleteMode]         = useState('deactivate'); // 'deactivate' | 'permanent'
  const [deletingOp, setDeletingOp]         = useState(false);

  const [updatingOpStatus, setUpdatingOpStatus] = useState(null);
  const [resetOnboardingModal, setResetOnboardingModal] = useState(null);
  const [savingOpAction, setSavingOpAction] = useState(false);

  const [commissionModal, setCommissionModal]   = useState(false);
  const [commissionOp, setCommissionOp]         = useState(null);
  const [commissionPct, setCommissionPct]       = useState(15);
  const [savingCommission, setSavingCommission] = useState(false);
  const [commissionReport, setCommissionReport] = useState(null);

  const [kpisModal, setKpisModal]   = useState(false);
  // Solicitudes de deposito bancario
  const [depositRequests, setDepositRequests]         = useState([]);
  const [loadingDeposits, setLoadingDeposits]         = useState(false);
  const [approvingDeposit, setApprovingDeposit]       = useState(null);
  const [rejectingDeposit, setRejectingDeposit]       = useState(null);
  const [depositAdminNote, setDepositAdminNote]       = useState('');
  const [kpisOp, setKpisOp]         = useState(null);
  const [kpisData, setKpisData]     = useState(null);
  const [loadingKpis, setLoadingKpis] = useState(false);

  const [newOperator, setNewOperator]           = useState({ full_name: '', phone: '', email: '', password: '' });
  const [creatingOperator, setCreatingOperator] = useState(false);
  const [operatorError, setOperatorError]       = useState('');
  const [operatorSuccess, setOperatorSuccess]   = useState('');

  useEffect(() => { fetchIncidents(); fetchPendingOperators(); fetchMembershipConfig(); fetchDepositRequests(); }, []);

  // ── Membresía ─────────────────────────────────────────────────────────────
  const [membershipConfig, setMembershipConfig]     = useState(null);
  const [updatingMembership, setUpdatingMembership] = useState(null);
  const [membershipModal, setMembershipModal]       = useState(false);
  const [membershipOp, setMembershipOp]             = useState(null);
  const [membershipDays, setMembershipDays]         = useState(30);

  const fetchMembershipConfig = async () => {
    try {
      const { data } = await supabase.from('membership_config').select('*').single();
      setMembershipConfig(data);
    } catch (err) { console.error('fetchMembershipConfig:', err); }
  };

  const toggleMembershipEnabled = async (field) => {
    if (!membershipConfig) return;
    const newVal = !membershipConfig[field];
    try {
      const { error } = await supabase.from('membership_config').update({ [field]: newVal, updated_at: new Date().toISOString() }).eq('id', membershipConfig.id);
      if (error) throw error;
      setMembershipConfig(prev => ({ ...prev, [field]: newVal }));
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
  };

  const openMembershipModal = (op) => {
    setMembershipOp(op);
    setMembershipDays(membershipConfig?.operator_duration_days || 30);
    setMembershipModal(true);
  };

  const saveMembership = async () => {
    if (!membershipOp) return;
    setUpdatingMembership(membershipOp.id);
    try {
      const now   = new Date();
      const endAt = new Date(now.getTime() + membershipDays * 24 * 60 * 60 * 1000);
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${membershipOp.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ membership_status: 'activa', membership_type: 'operador', membership_start_at: now.toISOString(), membership_end_at: endAt.toISOString(), updated_at: now.toISOString() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOperators(prev => prev.map(o => o.id === membershipOp.id ? { ...o, membership_status: 'activa', membership_type: 'operador', membership_start_at: now.toISOString(), membership_end_at: endAt.toISOString() } : o));
      setMembershipModal(false);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setUpdatingMembership(null); }
  };

  const revokeMembership = async (op) => {
    if (!confirm(`¿Desactivar membresía de ${op.full_name}?`)) return;
    setUpdatingMembership(op.id);
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${op.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ membership_status: 'vencida', membership_end_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOperators(prev => prev.map(o => o.id === op.id ? { ...o, membership_status: 'vencida' } : o));
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setUpdatingMembership(null); }
  };

  const fetchDepositRequests = async () => {
    setLoadingDeposits(true);
    try {
      const { data } = await supabase
        .from('membership_requests')
        .select('*, profile:user_id(full_name, phone, referral_code, role)')
        .eq('status', 'pendiente')
        .order('created_at', { ascending: false });
      setDepositRequests(data || []);
    } catch (err) { console.error('fetchDepositRequests:', err); }
    finally { setLoadingDeposits(false); }
  };

  const approveDepositRequest = async (req) => {
    if (!confirm(`¿Activar membresía de ${req.profile?.full_name}?`)) return;
    setApprovingDeposit(req.id);
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      const now   = new Date();
      const days  = req.user_type === 'operador' ? (membershipConfig?.operator_duration_days || 30) : (membershipConfig?.client_duration_days || 30);
      const endAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      // Activar membresía en profiles
      const pRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${req.user_id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ membership_status: 'activa', membership_type: req.user_type, membership_start_at: now.toISOString(), membership_end_at: endAt.toISOString(), updated_at: now.toISOString() }),
      });
      if (!pRes.ok) throw new Error(`Profiles HTTP ${pRes.status}`);
      // Registrar en historial
      await fetch(`${SUPABASE_URL}/rest/v1/membership_history`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: req.user_id, membership_type: req.user_type, start_at: now.toISOString(), end_at: endAt.toISOString(), amount: req.amount, status: 'activa' }),
      });
      // Marcar solicitud como aprobada
      await fetch(`${SUPABASE_URL}/rest/v1/membership_requests?id=eq.${req.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'aprobado', updated_at: now.toISOString() }),
      });
      // Enviar WA de confirmación al usuario
      if (req.profile?.phone) {
        const msg = `✅ *MAZ CLEAN* — ¡Tu membresía ${req.user_type === 'operador' ? 'de Operador' : 'Premium'} ha sido activada! Válida del ${now.toLocaleDateString('es-MX')} al ${endAt.toLocaleDateString('es-MX')}. ¡Bienvenido! 🚗`;
        await sendWhatsApp({ to: req.profile.phone, message: msg });
      }
      setDepositRequests(prev => prev.filter(r => r.id !== req.id));
      setOperators(prev => prev.map(o => o.id === req.user_id ? { ...o, membership_status: 'activa', membership_end_at: endAt.toISOString() } : o));
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setApprovingDeposit(null); }
  };

  const rejectDepositRequest = async (req) => {
    if (!depositAdminNote.trim()) { showToast('Escribe una nota para el usuario', 'warning'); return; }
    if (!confirm(`¿Rechazar solicitud de ${req.profile?.full_name}?`)) return;
    setRejectingDeposit(req.id);
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      await fetch(`${SUPABASE_URL}/rest/v1/membership_requests?id=eq.${req.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ status: 'rechazado', admin_note: depositAdminNote, updated_at: new Date().toISOString() }),
      });
      if (req.profile?.phone) {
        const msg = `⚠️ *MAZ CLEAN* — Tu solicitud de membresía fue rechazada. Motivo: ${depositAdminNote}. Contacta al soporte si crees que es un error.`;
        await sendWhatsApp({ to: req.profile.phone, message: msg });
      }
      setDepositRequests(prev => prev.filter(r => r.id !== req.id));
      setDepositAdminNote('');
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setRejectingDeposit(null); }
  };

  const fetchPendingOperators = async () => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('role', 'operador')
        .in('operator_status', ['pendiente', 'pending_review', 'docs_requeridos'])
        .order('created_at', { ascending: false });
      setPendingOperators(data || []);
    } catch (err) { console.error('fetchPendingOperators:', err); }
  };

  const fetchIncidents = async () => {
    try {
      const { data } = await supabase.from('incidents').select('*, operator:operator_id(full_name, id)').eq('status', 'abierto').order('created_at', { ascending: false });
      setIncidents(data || []);
      const { data: history } = await supabase.from('incidents').select('*, operator:operator_id(full_name, id)').eq('status', 'resuelto').order('resolved_at', { ascending: false }).limit(20);
      setIncidentsHistory(history || []);
    } catch (err) { setIncidents([]); setIncidentsHistory([]); }
  };

  const resolveIncident = async (incidentId) => {
    await supabase.from('incidents').update({ status: 'resuelto', resolved_at: new Date().toISOString() }).eq('id', incidentId);
    fetchIncidents();
  };

  // ── Chips — conteos ───────────────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const chipCounts = {
    todos:       (pendingOperators.length) + operators.filter(o => o.operator_status === 'aprobado').length,
    sin_revisar: pendingOperators.filter(o => ['pendiente','pending_review'].includes(o.operator_status)).length,
    correcciones:pendingOperators.filter(o => o.operator_status === 'docs_requeridos').length,
    aprobados:   operators.filter(o => o.operator_status === 'aprobado' && o.reviewed_at > thirtyDaysAgo).length,
    activos:     operators.filter(o => o.status === 'activo' && o.operator_status === 'aprobado').length,
  };

  // Reset páginas al cambiar filtros — deben estar antes de los renders
  useEffect(() => { setOperatorsPage(1); }, [activeChip, zoneSearch, radiusFilter]);
  useEffect(() => { setPendingPage(1); }, [zoneSearch]);

  // ── Filtro de zona sobre operadores activos ───────────────────────────────
  const filteredOperators = operators.filter(op => {
    if (activeChip === 'aprobados') return op.operator_status === 'aprobado' && op.reviewed_at > thirtyDaysAgo;
    if (activeChip === 'activos')   return op.status === 'activo' && op.operator_status === 'aprobado';
    if (activeChip === 'sin_revisar' || activeChip === 'correcciones') return false; // solo muestran pendientes
    return op.operator_status === 'aprobado'; // todos
  }).filter(op => {
    if (zoneSearch && !op.base_address?.toLowerCase().includes(zoneSearch.toLowerCase())) return false;
    if (radiusFilter !== 'all') {
      const r = op.coverage_radius || 0;
      if (radiusFilter === '0-5'  && !(r <= 5))  return false;
      if (radiusFilter === '5-10' && !(r > 5 && r <= 10)) return false;
      if (radiusFilter === '10+'  && !(r > 10)) return false;
    }
    return true;
  });

  const filteredPending = pendingOperators.filter(op => {
    if (activeChip === 'sin_revisar')  return ['pendiente','pending_review'].includes(op.operator_status);
    if (activeChip === 'correcciones') return op.operator_status === 'docs_requeridos';
    if (activeChip === 'aprobados' || activeChip === 'activos') return false;
    return true; // todos
  }).filter(op => {
    if (zoneSearch && !op.base_address?.toLowerCase().includes(zoneSearch.toLowerCase())) return false;
    if (radiusFilter !== 'all') {
      const r = op.coverage_radius || 0;
      if (radiusFilter === '0-5'  && !(r <= 5))  return false;
      if (radiusFilter === '5-10' && !(r > 5 && r <= 10)) return false;
      if (radiusFilter === '10+'  && !(r > 10)) return false;
    }
    return true;
  });

  // ── Variables paginadas ──────────────────────────────────────────────────
  const totalOperatorsPages = Math.max(1, Math.ceil(filteredOperators.length / OPERATORS_PER_PAGE));
  const totalPendingPages   = Math.max(1, Math.ceil(filteredPending.length / PENDING_PER_PAGE));
  const paginatedOperators  = filteredOperators.slice((operatorsPage - 1) * OPERATORS_PER_PAGE, operatorsPage * OPERATORS_PER_PAGE);
  const paginatedPending    = filteredPending.slice((pendingPage - 1) * PENDING_PER_PAGE, pendingPage * PENDING_PER_PAGE);

  // ── Review ────────────────────────────────────────────────────────────────
  const openReviewModal = (op) => {
    setReviewingOp(op); setReviewAction(null); setRejectionReason('');
    // Pre-cargar docs que ya estaban rechazados para mostrar historial
    const prevRejected = (op.rejected_documents || []).filter(d => d.status !== 'corregido')
    setRejectedDocs(prevRejected.length > 0 ? prevRejected : []);
    // Si había docs rechazados, pre-seleccionar acción de correcciones
    if (prevRejected.length > 0) setReviewAction('reject_docs');
    setReviewError(''); setReviewDocTab('personal'); setReviewModal(true);
  };

  // Docs que el operador acaba de corregir (status = 'corregido')
  const isDocCorrected = (key) => {
    if (!reviewingOp) return false;
    return (reviewingOp.rejected_documents || []).some(d => d.key === key && d.status === 'corregido');
  };
  const getCorrectedDocs = (op) => (op?.rejected_documents || []).filter(d => d.status === 'corregido');

  const toggleRejectedDoc = (doc) => {
    const isCurrentlySelected = rejectedDocs.some(d => d.key === doc.key)
    if (isCurrentlySelected) {
      // Desmarcar — quitar de la lista sin confirmación
      setRejectedDocs(prev => prev.filter(d => d.key !== doc.key))
    } else {
      // Marcar para corrección
      setRejectedDocs(prev => [...prev, { ...doc, reason: '' }])
    }
  };

  const updateDocReason = (key, reason) => setRejectedDocs(prev => prev.map(d => d.key === key ? { ...d, reason } : d));
  const isDocRejected = (key) => rejectedDocs.some(d => d.key === key);

  const submitReview = async () => {
    if (!reviewAction) { setReviewError('Selecciona una acción.'); return; }
    if (reviewAction === 'reject_docs' && rejectedDocs.length === 0) { setReviewError('Selecciona al menos un documento.'); return; }
    if (reviewAction === 'reject' && !rejectionReason.trim()) { setReviewError('El motivo de rechazo es obligatorio.'); return; }
    setSavingReview(true); setReviewError('');
    try {
      const { data: { user: adminUser } } = await supabase.auth.getUser();
      let updatePayload = { reviewed_at: new Date().toISOString(), reviewed_by: adminUser?.id || null };
      if (reviewAction === 'approve') {
        updatePayload = { ...updatePayload, operator_status: 'aprobado', status: 'activo', rejected_documents: [] };
      } else if (reviewAction === 'reject_docs') {
        const minStep = Math.min(...rejectedDocs.map(d => d.step));
        updatePayload = { ...updatePayload, operator_status: 'docs_requeridos', onboarding_done: false, onboarding_step: minStep, rejected_documents: rejectedDocs, rejection_reason: `Documentos a corregir: ${rejectedDocs.map(d => d.label).join(', ')}` };
      } else {
        updatePayload = { ...updatePayload, operator_status: 'rechazado', onboarding_done: false, onboarding_step: 1, rejected_documents: [], rejection_reason: rejectionReason.trim() };
      }
      const { error } = await supabase.from('profiles').update(updatePayload).eq('id', reviewingOp.id);
      if (error) throw error;
      const phone = reviewingOp?.phone;
      if (phone) {
        try {
          if (reviewAction === 'approve') await sendWhatsApp('operator_approved', phone, { operator_name: reviewingOp.full_name });
          else if (reviewAction === 'reject_docs') await sendWhatsApp('operator_docs_required', phone, { operator_name: reviewingOp.full_name, docs_list: rejectedDocs.map(d => `${d.icon} ${d.label}${d.reason ? `: ${d.reason}` : ''}`).join('\n') });
          else await sendWhatsApp('operator_rejected', phone, { operator_name: reviewingOp.full_name, rejection_reason: rejectionReason });
        } catch (wsErr) { console.warn('WhatsApp omitido:', wsErr.message); }
      }
      if (reviewAction === 'approve' || reviewAction === 'reject') {
        setPendingOperators(prev => prev.filter(o => o.id !== reviewingOp.id));
      } else {
        setPendingOperators(prev => prev.map(o => o.id === reviewingOp.id ? { ...o, operator_status: 'docs_requeridos', rejected_documents: rejectedDocs } : o));
      }
      setOperators(prev => prev.map(o => o.id === reviewingOp.id ? { ...o, operator_status: updatePayload.operator_status } : o));
      setReviewModal(false);
    } catch (err) { setReviewError(err.message); }
    finally { setSavingReview(false); }
  };

  // ── Delete operador ───────────────────────────────────────────────────────
  const handleDeleteOperator = async () => {
    if (!deleteModal) return;
    setDeletingOp(true);
    try {
      if (deleteMode === 'deactivate') {
        const { error } = await supabase.from('profiles').update({ status: 'desactivado', operator_status: 'rechazado', updated_at: new Date().toISOString() }).eq('id', deleteModal.id);
        if (error) throw error;
        setOperators(prev => prev.map(o => o.id === deleteModal.id ? { ...o, status: 'desactivado', operator_status: 'rechazado' } : o));
        setPendingOperators(prev => prev.filter(o => o.id !== deleteModal.id));
      } else {
        // Eliminación permanente — primero eliminar de auth.users (cascadea profiles por FK)
        const { error } = await supabase.rpc('delete_operator', { p_operator_id: deleteModal.id });
        if (error) {
          // Fallback: solo desactivar si no existe la función RPC
          await supabase.from('profiles').update({ status: 'desactivado', operator_status: 'rechazado', updated_at: new Date().toISOString() }).eq('id', deleteModal.id);
        }
        setOperators(prev => prev.filter(o => o.id !== deleteModal.id));
        setPendingOperators(prev => prev.filter(o => o.id !== deleteModal.id));
      }
      setDeleteModal(null);
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
    finally { setDeletingOp(false); }
  };

  // ── Otros handlers ────────────────────────────────────────────────────────
  const updateOperatorStatus = async (opId, newStatus) => {
    setUpdatingOpStatus(opId);
    try {
      const { error } = await supabase.from('profiles').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', opId);
      if (error) throw error;
      setOperators(prev => prev.map(o => o.id === opId ? { ...o, status: newStatus } : o));
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
    finally { setUpdatingOpStatus(null); }
  };

  const toggleAssignmentMode = async (op) => {
    const newMode = op.assignment_mode === 'preferente' ? 'autonomo' : 'preferente';
    try {
      const { error } = await supabase.from('profiles').update({ assignment_mode: newMode, updated_at: new Date().toISOString() }).eq('id', op.id);
      if (error) throw error;
      setOperators(prev => prev.map(o => o.id === op.id ? { ...o, assignment_mode: newMode } : o));
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
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
        terms_accepted_at: null, rejected_documents: [], updated_at: new Date().toISOString(),
      }).eq('id', op.id);
      if (error) throw error;
      setOperators(prev => prev.map(o => o.id === op.id ? { ...o, onboarding_done: false, onboarding_step: 1, operator_status: 'pendiente' } : o));
      setResetOnboardingModal(null);
      showToast(`✅ Onboarding reiniciado para ${op.full_name}.`, 'success');
    } catch (err) { showToast(`Error: ${err.message}`, 'error'); }
    finally { setSavingOpAction(false); }
  };

  const openCommissionModal = (op) => {
    setCommissionOp(op); setCommissionPct(op.commission_pct || 15);
    const opBookings = bookings.filter(b => b.operator_id === op.id && b.status === 'finalizado');
    const totalRevenue = opBookings.reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
    setCommissionReport({ totalRevenue, services: opBookings.length });
    setCommissionModal(true);
  };

  const saveCommission = async () => {
    setSavingCommission(true);
    const { error } = await supabase.from('profiles').update({ commission_pct: parseFloat(commissionPct) }).eq('id', commissionOp.id);
    if (error) { showToast(error.message, 'error'); setSavingCommission(false); return; }
    setOperators(prev => prev.map(o => o.id === commissionOp.id ? { ...o, commission_pct: parseFloat(commissionPct) } : o));
    setSavingCommission(false); setCommissionModal(false);
  };

  const fetchOperatorKpis = async (op) => {
    setKpisOp(op); setLoadingKpis(true); setKpisModal(true);
    try {
      const { data: kpis } = await supabase.rpc('get_operator_time_kpis', { p_operator_id: op.id });
      setKpisData(kpis?.[0] || null);
    } catch (err) { console.error('KPIs:', err); }
    finally { setLoadingKpis(false); }
  };

  const fetchOperatorHistory = async (operatorId) => {
    let query = supabase.from('bookings').select('*, customer:client_id(full_name)').eq('operator_id', operatorId).eq('status', 'finalizado').order('scheduled_date', { ascending: false });
    if (historyFilter.from) query = query.gte('scheduled_date', historyFilter.from);
    if (historyFilter.to)   query = query.lte('scheduled_date', historyFilter.to);
    const { data, error } = await query;
    if (error) { showToast(error.message, 'error'); return; }
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

  const StarRating = ({ rating, size = 14 }) => {
    if (!rating) return <span style={{ fontSize: 11, color: '#9ca3af' }}>Sin calificaciones</span>;
    const stars = [];
    for (let i = 1; i <= 5; i++) stars.push(<Star key={i} size={size} fill={i <= Math.round(rating) ? '#f59e0b' : 'none'} color={i <= Math.round(rating) ? '#f59e0b' : '#d1d5db'} style={{ display: 'inline-block' }} />);
    return <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{stars}<span style={{ fontSize: 11, color: '#6b7280', marginLeft: 4, fontWeight: 600 }}>{Number(rating).toFixed(1)}</span></span>;
  };

  const inputStyle = { padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 48 };
  const labelStyle = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };

  const DocImage = ({ url, label, rejected = false }) => {
    if (!url) return (
      <div style={{ background: rejected ? '#fef2f2' : '#f9fafb', borderRadius: 10, border: `2px dashed ${rejected ? '#fecaca' : '#e5e7eb'}`, padding: '20px', textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 4 }}>📷</div>
        <div style={{ fontSize: 12, color: rejected ? '#dc2626' : '#9ca3af' }}>{rejected ? '⚠️ Requerido' : `Sin ${label}`}</div>
      </div>
    );
    const fullUrl = getPhotoStorageUrl(url);
    if (url.includes('.pdf')) return (
      <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}>📄</span>
        <div><div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>{label}</div><a href={fullUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#059669' }}>Ver →</a></div>
      </div>
    );
    if (url.includes('.mp4') || url.includes('.mov') || url.includes('video')) return (
      <div style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 24 }}>🎥</span>
        <div><div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>{label}</div><a href={fullUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#3b82f6' }}>Ver video →</a></div>
      </div>
    );
    return (
      <button onClick={() => setReviewPhotoModal(fullUrl)} style={{ background: 'none', border: 'none', cursor: 'zoom-in', padding: 0, display: 'block', width: '100%' }}>
        <img src={fullUrl} alt={label} style={{ width: '100%', maxHeight: 180, objectFit: 'cover', borderRadius: 10, border: `2px solid ${rejected ? '#fecaca' : '#e5e7eb'}`, display: 'block' }} />
        <div style={{ fontSize: 11, color: rejected ? '#dc2626' : '#9ca3af', marginTop: 4, textAlign: 'center' }}>{rejected ? '⚠️ Rechazado — toca para ver' : 'Toca para ampliar'}</div>
      </button>
    );
  };

  // ── CHIPS ─────────────────────────────────────────────────────────────────
  const CHIPS = [
    { id: 'todos',        label: 'Todos',        color: '#6b7280' },
    { id: 'sin_revisar',  label: '🆕 Nuevos',    color: '#f59e0b' },
    { id: 'correcciones', label: '⚠️ Correc.',   color: '#ef4444' },
    { id: 'aprobados',    label: '✅ Aprobados', color: '#10b981' },
    { id: 'activos',      label: '🟢 Activos',   color: '#3b82f6' },
  ];

  const showPending   = ['todos','sin_revisar','correcciones'].includes(activeChip);
  const showOperators = ['todos','aprobados','activos'].includes(activeChip);

  return (
    <div style={{ marginTop: 16, display: 'grid', gap: 16, overflowX: 'hidden', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>

      {/* ── CONTROL MEMBRESÍAS ── */}
      {membershipConfig && (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: isMobile ? '12px' : '16px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>💳 Control de Membresías</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', borderRadius: 10, padding: '10px 14px', border: '1px solid #e5e7eb' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>Membresía Operadores</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>${membershipConfig.operator_price} MXN / {membershipConfig.operator_duration_days} días</div>
              </div>
              <button onClick={() => toggleMembershipEnabled('operator_enabled')}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: membershipConfig.operator_enabled ? '#10b981' : '#e5e7eb', color: membershipConfig.operator_enabled ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 36 }}>
                {membershipConfig.operator_enabled ? '✅ Activo' : '○ Inactivo'}
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f9fafb', borderRadius: 10, padding: '10px 14px', border: '1px solid #e5e7eb' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>Membresía Premium Clientes</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>${membershipConfig.client_price} MXN / {membershipConfig.client_duration_days} días</div>
              </div>
              <button onClick={() => toggleMembershipEnabled('client_enabled')}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: membershipConfig.client_enabled ? '#10b981' : '#e5e7eb', color: membershipConfig.client_enabled ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 36 }}>
                {membershipConfig.client_enabled ? '✅ Activo' : '○ Inactivo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CHIPS + FILTROS ── */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: isMobile ? '12px' : '16px 20px' }}>

        {/* Chips — flex-wrap en móvil para evitar scroll horizontal */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 12,
        }}>
          {CHIPS.map(chip => (
            <button key={chip.id} onClick={() => setActiveChip(chip.id)}
              style={{
                padding: isMobile ? '6px 10px' : '7px 14px',
                borderRadius: 20,
                fontSize: isMobile ? 12 : 13,
                fontWeight: 600,
                cursor: 'pointer',
                border: `1.5px solid ${activeChip === chip.id ? chip.color : '#e5e7eb'}`,
                background: activeChip === chip.id ? chip.color : '#fff',
                color: activeChip === chip.id ? '#fff' : '#374151',
                minHeight: 34,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}>
              {chip.label}
              <span style={{
                fontSize: 10,
                background: activeChip === chip.id ? 'rgba(255,255,255,0.3)' : '#f3f4f6',
                color: activeChip === chip.id ? '#fff' : '#6b7280',
                padding: '1px 6px', borderRadius: 10, fontWeight: 700,
              }}>
                {chipCounts[chip.id] || 0}
              </span>
            </button>
          ))}
        </div>

        {/* Filtros de zona y radio — siempre en columna en móvil */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, alignItems: 'stretch' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 14 }}>📍</span>
            <input type="text" placeholder="Filtrar por zona o colonia..." value={zoneSearch} onChange={e => setZoneSearch(e.target.value)}
              style={{ ...inputStyle, paddingLeft: 32, fontSize: 14, minHeight: 40, width: '100%' }} />
          </div>
          <select value={radiusFilter} onChange={e => setRadiusFilter(e.target.value)}
            style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, background: '#fff', cursor: 'pointer', fontFamily: 'inherit', color: '#1f2937', minHeight: 40, width: '100%', boxSizing: 'border-box' }}>
            <option value="all">🗺 Todos los radios</option>
            <option value="0-5">Hasta 5 km</option>
            <option value="5-10">5 a 10 km</option>
            <option value="10+">Más de 10 km</option>
          </select>
          {(zoneSearch || radiusFilter !== 'all') && (
            <button onClick={() => { setZoneSearch(''); setRadiusFilter('all'); }}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', color: '#6b7280', fontSize: 13, cursor: 'pointer', minHeight: 40, fontWeight: 600, width: '100%', boxSizing: 'border-box' }}>
              ✕ Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── PENDIENTES ── */}
      {showPending && filteredPending.length > 0 && (
        <div style={{ background: '#fffbeb', borderRadius: 14, border: '2px solid #fde68a', padding: isMobile ? '12px' : '20px 24px', boxSizing: 'border-box', width: '100%', maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#92400e', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeChip === 'correcciones' ? '⚠️ Esperando correcciones' : '🕐 Pendientes de Aprobación'}
              <span style={{ background: '#f59e0b', color: '#fff', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>{filteredPending.length}</span>
            </h2>
            <button onClick={fetchPendingOperators} style={{ border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 13, fontWeight: 600, padding: '6px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.12)', minHeight: 36 }}>↻ Refrescar</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, width: '100%', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }}>
            {paginatedPending.map(op => {
              const allRejDocs    = Array.isArray(op.rejected_documents) ? op.rejected_documents : [];
              const correctedDocs = allRejDocs.filter(d => d.status === 'corregido');
              const pendingDocs   = allRejDocs.filter(d => d.status !== 'corregido');
              const isDocsRequired = op.operator_status === 'docs_requeridos';
              const fromCorrection = op.operator_status === 'pending_review' && correctedDocs.length > 0;
              const cardBorder = fromCorrection ? '2px solid #3b82f6'
                : isDocsRequired ? '1.5px solid #fecaca'
                : '1.5px solid #fde68a';

              return (
                <div key={op.id} style={{
                  background: '#fff', borderRadius: 10, border: cardBorder,
                  padding: isMobile ? '10px 12px' : 14,
                  display: 'flex', flexDirection: 'column', gap: 8,
                  boxSizing: 'border-box', width: '100%', minWidth: 0, maxWidth: '100%',
                }}>

                  {/* ── Fila superior: avatar + info ── */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>

                    {/* Avatar compacto */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      {op.selfie_with_id_url ? (
                        <img src={getPhotoStorageUrl(op.selfie_with_id_url)} alt="selfie"
                          style={{ height: 44, width: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid #fde68a', display: 'block' }} />
                      ) : (
                        <div style={{ height: 44, width: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
                          {op.full_name?.charAt(0) || '?'}
                        </div>
                      )}
                      <span style={{ position: 'absolute', bottom: -1, right: -1, background: fromCorrection ? '#3b82f6' : isDocsRequired ? '#ef4444' : '#f59e0b', borderRadius: '50%', width: 13, height: 13, fontSize: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #fff' }}>
                        {fromCorrection ? '↺' : isDocsRequired ? '!' : '⏳'}
                      </span>
                    </div>

                    {/* Info — sin overflow */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {op.full_name || 'Sin nombre'}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{op.phone || '—'}</div>
                      {op.base_address && (
                        <div style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          📍 {op.base_address}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Botones: ancho completo, siempre visibles ── */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px', gap: 6, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                    <button type="button" onClick={() => openReviewModal(op)} style={{
                      padding: '11px 0',
                      background: fromCorrection ? 'linear-gradient(135deg,#3b82f6,#1e40af)' : isDocsRequired ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#f59e0b,#d97706)',
                      border: 'none', borderRadius: 8, color: '#fff',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      width: '100%', minHeight: 44,
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation',
                    }}>
                      {fromCorrection ? '🔍 Revisar correcciones' : isDocsRequired ? '⚠️ Ver pendientes' : '🔍 Revisar'}
                    </button>
                    <button type="button" onClick={() => { setDeleteModal(op); setDeleteMode('deactivate'); }} style={{
                      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
                      color: '#dc2626', fontSize: 16, cursor: 'pointer',
                      width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation',
                    }}>🗑</button>
                  </div>

                  {/* Badge de estado — debajo, ocupa solo lo que necesita */}
                  <div>
                    <span style={{
                      display: 'inline-block',
                      fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                      background: fromCorrection ? '#dbeafe' : isDocsRequired ? '#fef2f2' : '#fffbeb',
                      color: fromCorrection ? '#1e40af' : isDocsRequired ? '#dc2626' : '#92400e',
                      border: `1px solid ${fromCorrection ? '#93c5fd' : isDocsRequired ? '#fecaca' : '#fde68a'}`,
                    }}>
                      {fromCorrection
                        ? `🔄 ${correctedDocs.length} corregido${correctedDocs.length !== 1 ? 's' : ''}`
                        : isDocsRequired
                          ? `⚠️ ${pendingDocs.length} pendiente${pendingDocs.length !== 1 ? 's' : ''}`
                          : '⏳ Nuevo — sin revisar'}
                    </span>
                  </div>

                  {/* Docs corregidos (azul) */}
                  {correctedDocs.length > 0 && (
                    <div style={{ background: '#eff6ff', borderRadius: 6, padding: '8px 10px', border: '1.5px solid #93c5fd' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>🔄 Recién corregidos — revisar:</div>
                      {correctedDocs.map(doc => (
                        <div key={doc.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#1e40af', marginBottom: 2 }}>
                          <span>{doc.icon}</span>
                          <strong>{doc.label}</strong>
                          {doc.corrected_at && (
                            <span style={{ fontSize: 9, color: '#60a5fa', marginLeft: 'auto' }}>
                              {new Date(doc.corrected_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Docs pendientes (rojo) */}
                  {pendingDocs.length > 0 && (
                    <div style={{ background: '#fef2f2', borderRadius: 6, padding: '6px 10px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', marginBottom: 3 }}>⚠️ Pendientes de corregir:</div>
                      {pendingDocs.map(doc => (
                        <div key={doc.key} style={{ fontSize: 11, color: '#991b1b', marginBottom: 1 }}>
                          {doc.icon} <strong>{doc.label}</strong>{doc.reason ? ` — ${doc.reason}` : ''}
                        </div>
                      ))}
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Paginación — pendientes */}
      {showPending && filteredPending.length > PENDING_PER_PAGE && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 12, padding: '10px 0' }}>
          <button onClick={() => setPendingPage(p => Math.max(1, p - 1))} disabled={pendingPage === 1}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: pendingPage === 1 ? '#f9fafb' : '#fff', color: pendingPage === 1 ? '#9ca3af' : '#374151', fontSize: 12, fontWeight: 600, cursor: pendingPage === 1 ? 'not-allowed' : 'pointer', minHeight: 38 }}>← Anterior</button>
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Página {pendingPage} de {totalPendingPages} · {filteredPending.length} pendientes</span>
          <button onClick={() => setPendingPage(p => Math.min(totalPendingPages, p + 1))} disabled={pendingPage === totalPendingPages}
            style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: pendingPage === totalPendingPages ? '#f9fafb' : '#fff', color: pendingPage === totalPendingPages ? '#9ca3af' : '#374151', fontSize: 12, fontWeight: 600, cursor: pendingPage === totalPendingPages ? 'not-allowed' : 'pointer', minHeight: 38 }}>Siguiente →</button>
        </div>
      )}

      {showPending && filteredPending.length === 0 && (
        <div style={{ background: '#f0fdf4', borderRadius: 12, border: '1.5px solid #bbf7d0', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span>✅</span><span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>Sin operadores pendientes en esta vista</span>
        </div>
      )}

      {/* ── SOLICITUDES DE DEPOSITO BANCARIO ── */}
      {depositRequests.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>
            🏦 Solicitudes de membresía por depósito ({depositRequests.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {depositRequests.map(req => (
              <div key={req.id} style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #fde68a', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <div style={{ background: 'linear-gradient(135deg,#f59e0b,#fbbf24)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{req.profile?.full_name || 'Sin nombre'}</span>
                    <span style={{ color: '#fef3c7', fontSize: 12, marginLeft: 8 }}>({req.user_type === 'operador' ? 'Operador' : 'Cliente'})</span>
                  </div>
                  <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 20, padding: '2px 10px', color: '#fff', fontSize: 12, fontWeight: 700 }}>${req.amount} MXN</span>
                </div>
                <div style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, color: '#374151', marginBottom: 10 }}>
                    <span>📱 {req.profile?.phone}</span>
                    <span>🔖 Ref: <strong style={{ fontFamily: 'monospace' }}>{req.referral_code}</strong></span>
                    <span>📅 {new Date(req.created_at).toLocaleDateString('es-MX')}</span>
                  </div>
                  <textarea
                    placeholder="Nota para el usuario (requerida para rechazar)"
                    onChange={e => setDepositAdminNote(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', height: 60, resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', marginBottom: 10 }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => approveDepositRequest(req)} disabled={!!approvingDeposit || !!rejectingDeposit}
                      style={{ flex: 1, padding: '10px', background: approvingDeposit === req.id ? '#9ca3af' : '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
                      {approvingDeposit === req.id ? '⏳ Activando...' : '✅ Aprobar y activar'}
                    </button>
                    <button onClick={() => rejectDepositRequest(req)} disabled={!!approvingDeposit || !!rejectingDeposit}
                      style={{ flex: 1, padding: '10px', background: rejectingDeposit === req.id ? '#9ca3af' : '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
                      {rejectingDeposit === req.id ? '⏳ Rechazando...' : '✕ Rechazar'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Incidencias */}
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
      {showOperators && (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? '16px' : '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', margin: 0 }}>
              {activeChip === 'aprobados' ? '✅ Aprobados últimos 30 días' : '🟢 Estado en Tiempo Real'}
              {filteredOperators.length > 0 && <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>({filteredOperators.length} operadores)</span>}
            </h2>
          </div>
          {/* Paginación — operadores aprobados */}
          {filteredOperators.length > OPERATORS_PER_PAGE && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 16, padding: '10px 0' }}>
              <button onClick={() => setOperatorsPage(p => Math.max(1, p - 1))} disabled={operatorsPage === 1}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: operatorsPage === 1 ? '#f9fafb' : '#fff', color: operatorsPage === 1 ? '#9ca3af' : '#374151', fontSize: 12, fontWeight: 600, cursor: operatorsPage === 1 ? 'not-allowed' : 'pointer', minHeight: 38 }}>← Anterior</button>
              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Página {operatorsPage} de {totalOperatorsPages} · {filteredOperators.length} operadores</span>
              <button onClick={() => setOperatorsPage(p => Math.min(totalOperatorsPages, p + 1))} disabled={operatorsPage === totalOperatorsPages}
                style={{ padding: '7px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: operatorsPage === totalOperatorsPages ? '#f9fafb' : '#fff', color: operatorsPage === totalOperatorsPages ? '#9ca3af' : '#374151', fontSize: 12, fontWeight: 600, cursor: operatorsPage === totalOperatorsPages ? 'not-allowed' : 'pointer', minHeight: 38 }}>Siguiente →</button>
            </div>
          )}
          {filteredOperators.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 14, fontStyle: 'italic' }}>No hay operadores en esta vista.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
              {paginatedOperators.map(op => {
                const status = getOperatorStatus(op.id);
                const opBookings = bookings.filter(b => b.operator_id === op.id && b.status === 'finalizado');
                const totalRev = opBookings.reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
                const commission = totalRev * ((op.commission_pct || 15) / 100);
                const opStatusCfg = getOpStatusCfg(op.status);
                const memBadge = getMembershipBadge(op);
                return (
                  <div key={op.id} style={{ background: '#f9fafb', borderRadius: 12, border: `1.5px solid ${opStatusCfg.border}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, opacity: op.status === 'desactivado' ? 0.7 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ height: 46, width: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>{op.full_name?.charAt(0) || '?'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 14 }}>{op.full_name || 'Sin nombre'}</div>
                        <div style={{ fontSize: 12, color: '#6b7280' }}>{op.phone || '—'}</div>
                        {op.base_address && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {op.base_address}</div>}
                        {op.coverage_radius && <div style={{ fontSize: 11, color: '#9ca3af' }}>Radio: {op.coverage_radius} km</div>}
                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <StarRating rating={op.rating_avg} />
                          {op.operator_level && (
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                              background: op.operator_level === 'elite' ? '#fffbeb' : op.operator_level === 'proplus' ? '#f5f3ff' : op.operator_level === 'pro' ? '#eff6ff' : '#f3f4f6',
                              color: op.operator_level === 'elite' ? '#92400e' : op.operator_level === 'proplus' ? '#5b21b6' : op.operator_level === 'pro' ? '#1e40af' : '#374151' }}>
                              {op.operator_level === 'elite' ? '⭐ Elite' : op.operator_level === 'proplus' ? '🟣 Pro+' : op.operator_level === 'pro' ? '🔵 Pro' : '⚪ Operador'}
                            </span>
                          )}
                        </div>
                        {op.total_ratings > 0 && (
                          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{op.total_ratings} calificaciones · últimas 30</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: opStatusCfg.bg, color: opStatusCfg.color, border: `1px solid ${opStatusCfg.border}`, fontWeight: 700 }}>{opStatusCfg.icon} {opStatusCfg.label}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: status.color }}>
                          <span style={{ height: 7, width: 7, borderRadius: '50%', background: status.dot, display: 'inline-block' }} />{status.label}
                        </span>
                      </div>
                    </div>

                    <div style={{ background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
                      <div><div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Comisión ({op.commission_pct || 15}%)</div><div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>${commission.toFixed(2)}</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase' }}>Servicios</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>{opBookings.length}</div></div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 2 }}>Rating</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: op.rating_avg >= 4.8 ? '#f59e0b' : op.rating_avg >= 4.0 ? '#10b981' : op.rating_avg ? '#f59e0b' : '#9ca3af' }}>
                          {op.rating_avg ? `${Number(op.rating_avg).toFixed(1)} ⭐` : '—'}
                        </div>
                        {op.operator_level && op.operator_level !== 'operador' && (
                          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2,
                            color: op.operator_level === 'elite' ? '#92400e' : op.operator_level === 'proplus' ? '#5b21b6' : '#1e40af' }}>
                            {op.operator_level === 'elite' ? '⭐ Elite' : op.operator_level === 'proplus' ? '🟣 Pro+' : '🔵 Pro'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── MEMBRESÍA ── */}
                    <div style={{ background: memBadge.bg, borderRadius: 10, padding: '10px 14px', border: `1.5px solid ${memBadge.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: memBadge.color }}>{memBadge.label}</div>
                        {op.membership_status === 'activa' && op.membership_end_at && (
                          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Vence: {new Date(op.membership_end_at).toLocaleDateString('es-MX')}</div>
                        )}
                        {op.membership_status === 'vencida' && op.membership_end_at && (
                          <div style={{ fontSize: 10, color: '#d97706', marginTop: 2 }}>Venció: {new Date(op.membership_end_at).toLocaleDateString('es-MX')}</div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {op.membership_status === 'activa' ? (
                          <>
                            <button onClick={() => revokeMembership(op)} disabled={updatingMembership === op.id}
                              style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>
                              {updatingMembership === op.id ? '⏳' : '✕ Revocar'}
                            </button>
                            <button onClick={() => openMembershipModal(op)} disabled={updatingMembership === op.id}
                              style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 10, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>
                              ↻ Extender
                            </button>
                          </>
                        ) : (
                          <button onClick={() => openMembershipModal(op)} disabled={updatingMembership === op.id}
                            style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#059669', fontSize: 10, fontWeight: 700, cursor: 'pointer', minHeight: 32 }}>
                            {updatingMembership === op.id ? '⏳' : '+ Activar'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', marginBottom: 5 }}>Estado operativo</div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 4 }}>
                        {Object.entries(OPERATOR_STATUS_CONFIG).map(([key, cfg]) => (
                          <button key={key} onClick={() => updateOperatorStatus(op.id, key)} disabled={updatingOpStatus === op.id || op.status === key}
                            style={{ padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${op.status === key ? cfg.color : '#e5e7eb'}`, background: op.status === key ? cfg.bg : '#fff', color: op.status === key ? cfg.color : '#6b7280', fontSize: 10, fontWeight: 700, cursor: op.status === key ? 'default' : 'pointer', textAlign: 'center', minHeight: 40, lineHeight: 1.4 }}>
                            {cfg.icon}<br/>{cfg.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(5,1fr)' : 'repeat(5,1fr)', gap: isMobile ? 3 : 4, overflowX: isMobile ? 'auto' : 'visible' }}>
                      <button onClick={() => fetchOperatorHistory(op.id)} style={{ padding: isMobile ? '6px 0' : '8px 0', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: isMobile ? 8 : 9, fontWeight: 600, cursor: 'pointer', minHeight: 38, textAlign: 'center', lineHeight: 1.3 }}>📊<br/>Hist.</button>
                      <button onClick={() => openCommissionModal(op)} style={{ padding: isMobile ? '6px 0' : '8px 0', borderRadius: 8, border: '1.5px solid #bbf7d0', background: '#f0fdf4', color: '#166534', fontSize: isMobile ? 8 : 9, fontWeight: 600, cursor: 'pointer', minHeight: 38, textAlign: 'center', lineHeight: 1.3 }}>💰<br/>Com.</button>
                      <button onClick={() => fetchOperatorKpis(op)} style={{ padding: isMobile ? '6px 0' : '8px 0', borderRadius: 8, border: '1.5px solid #e9d5ff', background: '#faf5ff', color: '#7c3aed', fontSize: isMobile ? 8 : 9, fontWeight: 600, cursor: 'pointer', minHeight: 38, textAlign: 'center', lineHeight: 1.3 }}>⏱<br/>KPIs</button>
                      <button onClick={() => setResetOnboardingModal(op)} style={{ padding: isMobile ? '6px 0' : '8px 0', borderRadius: 8, border: '1.5px solid #fde68a', background: '#fffbeb', color: '#92400e', fontSize: isMobile ? 8 : 9, fontWeight: 600, cursor: 'pointer', minHeight: 38, textAlign: 'center', lineHeight: 1.3 }}>🔄<br/>Reset</button>
                      <button onClick={() => { setDeleteModal(op); setDeleteMode('deactivate'); }} style={{ padding: isMobile ? '6px 0' : '8px 0', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: isMobile ? 8 : 9, fontWeight: 600, cursor: 'pointer', minHeight: 38, textAlign: 'center', lineHeight: 1.3 }}>🗑<br/>Elim.</button>
                    </div>

                    <div style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{op.assignment_mode === 'preferente' ? '⭐ Preferente' : '🤖 Autónomo'}</div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{op.assignment_mode === 'preferente' ? 'Tiene prioridad en la asignación' : 'Acepta por su cuenta'}</div>
                      </div>
                      <button onClick={() => toggleAssignmentMode(op)} style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: op.assignment_mode === 'preferente' ? '#1e40af' : '#e5e7eb', color: op.assignment_mode === 'preferente' ? '#fff' : '#6b7280', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, minHeight: 36 }}>
                        {op.assignment_mode === 'preferente' ? '⭐ Pref.' : '🤖 Auto'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Historial operador */}
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
          {!operatorHistory.data?.length ? (
            <p style={{ color: '#9ca3af', fontStyle: 'italic', fontSize: 14 }}>Sin servicios en este rango.</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {operatorHistory.data.map(b => (
                <div key={b.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr auto', gap: 10, padding: '12px 14px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb', alignItems: 'center' }}>
                  <div><div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{b.booking_ref}</div><div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{b.service_name}</div></div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{b.customer?.full_name || '—'}</div>
                  {!isMobile && <div style={{ fontSize: 13, color: '#6b7280' }}>{b.scheduled_date}</div>}
                  <div style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>${b.total_price}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historial incidencias */}
      {Array.isArray(incidentsHistory) && incidentsHistory.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? '16px' : '20px 24px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', margin: '0 0 14px' }}>📋 Historial de Incidencias ({incidentsHistory.length})</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {incidentsHistory.filter(inc => inc && inc.id).map(inc => (
              <div key={inc.id} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 16px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', background: '#f0fdf4', padding: '2px 8px', borderRadius: 20 }}>✅ Resuelta</span>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>👷 {inc.operator?.full_name || '—'}</span>
                </div>
                <div style={{ fontSize: 13, color: '#374151' }}>{inc.description || '—'}</div>
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
                <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>🔍 Revisión — {reviewingOp.full_name}</h3>
                <div style={{ color: '#fef3c7', fontSize: 12, marginTop: 2 }}>{reviewingOp.phone || '—'} · {reviewingOp.base_address ? reviewingOp.base_address.substring(0, 40) + '…' : 'Sin zona'}</div>
              </div>
              <button onClick={() => setReviewModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 22, borderRadius: 8, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ display: 'flex', background: '#fffbeb', borderBottom: '1px solid #fde68a', overflowX: 'auto', scrollbarWidth: 'none' }}>
              {[{ id: 'personal', label: '👤 Personal' }, { id: 'identidad', label: '🪪 Identidad' }, { id: 'banco', label: '🏦 Banco' }, { id: 'domicilio', label: '🏠 Domicilio' }, { id: 'vehiculo', label: '🚗 Vehículo' }, { id: 'zona', label: '📍 Zona' }, { id: 'contrato', label: '📋 Contrato' }, { id: 'decision', label: '⚖️ Decisión' }].map(tab => (
                <button key={tab.id} onClick={() => setReviewDocTab(tab.id)}
                  style={{ padding: '10px 14px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: reviewDocTab === tab.id ? '#fff' : 'transparent', color: reviewDocTab === tab.id ? '#92400e' : '#b45309', borderBottom: reviewDocTab === tab.id ? '2px solid #f59e0b' : '2px solid transparent', minHeight: 44 }}>
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ padding: isMobile ? '16px' : 24, maxHeight: isMobile ? '65vh' : '60vh', overflowY: 'auto' }}>

              {/* Banner docs corregidos — solo visible cuando vienen de corrección */}
              {(() => {
                const corrected = getCorrectedDocs(reviewingOp);
                if (corrected.length === 0) return null;
                return (
                  <div style={{ background: '#eff6ff', border: '1.5px solid #3b82f6', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>🔄</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>
                        El operador corrigió {corrected.length} documento{corrected.length !== 1 ? 's' : ''} — revisa los marcados en azul
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {corrected.map(doc => (
                          <span key={doc.key} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#dbeafe', color: '#1e40af', fontWeight: 700, border: '1px solid #93c5fd' }}>
                            {doc.icon} {doc.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {reviewDocTab === 'personal' && (
                <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>👤 Datos Personales</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                    {[{ label: 'Nombre', value: reviewingOp.full_name }, { label: 'Teléfono', value: reviewingOp.phone || '—' }, { label: 'CURP', value: reviewingOp.curp || '—' }, { label: 'Solicitud', value: reviewingOp.created_at ? new Date(reviewingOp.created_at).toLocaleDateString('es-MX') : '—' }, { label: 'Experiencia', value: reviewingOp.experience_years ? `${reviewingOp.experience_years} años` : '—' }, { label: 'Notas', value: reviewingOp.experience_notes || '—' }].map(({ label, value }) => (
                      <div key={label}><div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{label}</div><div style={{ fontSize: 13, color: '#1f2937', fontWeight: 600, marginTop: 2 }}>{value}</div></div>
                    ))}
                  </div>
                </div>
              )}

              {reviewDocTab === 'identidad' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  {[{ field: 'ine_front_url', label: '🪪 INE — Frente' }, { field: 'ine_back_url', label: '🪪 INE — Reverso' }, { field: 'selfie_with_id_url', label: '🤳 Selfie con INE' }].map(({ field, label }) => (
                    <div key={field}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{label}</div>
                        {isDocCorrected(field) && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#dbeafe', color: '#1e40af', fontWeight: 700, border: '1px solid #93c5fd' }}>🔄 Recién corregido</span>}
                      </div>
                      <DocImage url={reviewingOp[field]} label={label} rejected={isDocRejected(field)} />
                    </div>
                  ))}
                </div>
              )}

              {reviewDocTab === 'banco' && (
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #bbf7d0' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', textTransform: 'uppercase', marginBottom: 10 }}>🏦 Datos Bancarios</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                    {[{ label: 'Banco', value: reviewingOp.bank_name || '—' }, { label: 'Titular', value: reviewingOp.clabe_holder || '—' }, { label: 'CLABE', value: reviewingOp.clabe || '—' }].map(({ label, value }) => (
                      <div key={label}><div style={{ fontSize: 10, color: '#059669', fontWeight: 600 }}>{label}</div><div style={{ fontSize: 13, color: '#065f46', fontWeight: 600, marginTop: 2, fontFamily: label === 'CLABE' ? 'monospace' : 'inherit' }}>{value}</div></div>
                    ))}
                  </div>
                  {isDocRejected('clabe') && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginTop: 12, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>⚠️ Marcado para corrección</div>}
                </div>
              )}

              {reviewDocTab === 'domicilio' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #bae6fd' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', marginBottom: 8 }}>📍 Dirección Declarada</div>
                    <div style={{ fontSize: 13, color: '#0369a1', fontWeight: 600 }}>{reviewingOp.base_address || '—'}</div>
                    {reviewingOp.base_lat && reviewingOp.base_lng && (() => {
                      const mapUrl = getZoneMapUrl(reviewingOp.base_lat, reviewingOp.base_lng, reviewingOp.coverage_radius ? reviewingOp.coverage_radius * 1000 : 3000);
                      return mapUrl ? <div style={{ marginTop: 10 }}><img src={mapUrl} alt="zona" style={{ width: '100%', borderRadius: 10, border: '1.5px solid #bae6fd', maxHeight: 160, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} /></div> : null;
                    })()}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>📄 Comprobante de Domicilio</div>
                      {isDocCorrected('proof_of_address_url') && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#dbeafe', color: '#1e40af', fontWeight: 700, border: '1px solid #93c5fd' }}>🔄 Recién corregido</span>}
                    </div>
                    <DocImage url={reviewingOp.proof_of_address_url} label="Comprobante" rejected={isDocRejected('proof_of_address_url')} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>🎥 Video de Prueba de Vida</div>
                      {isDocCorrected('proof_of_life_video_url') && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#dbeafe', color: '#1e40af', fontWeight: 700, border: '1px solid #93c5fd' }}>🔄 Recién corregido</span>}
                    </div>
                    <DocImage url={reviewingOp.proof_of_life_video_url} label="Video de vida" rejected={isDocRejected('proof_of_life_video_url')} />
                  </div>
                </div>
              )}

              {reviewDocTab === 'vehiculo' && (
                <div style={{ display: 'grid', gap: 16 }}>
                  <div style={{ background: '#f9fafb', borderRadius: 12, padding: '14px 16px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 }}>🚗 Datos del Vehículo</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[{ label: 'Placa', value: reviewingOp.vehicle_plate || '—' }, { label: 'Tipo', value: reviewingOp.vehicle_type_own || '—' }].map(({ label, value }) => (
                        <div key={label}><div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{label}</div><div style={{ fontSize: 13, color: '#1f2937', fontWeight: 600, marginTop: 2 }}>{value}</div></div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>📸 Foto del Vehículo</div>
                      {isDocCorrected('vehicle_photo_url') && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#dbeafe', color: '#1e40af', fontWeight: 700, border: '1px solid #93c5fd' }}>🔄 Recién corregido</span>}
                    </div>
                    <DocImage url={reviewingOp.vehicle_photo_url} label="Vehículo" rejected={isDocRejected('vehicle_photo_url')} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>📸 Kit de Materiales</div>
                      {isDocCorrected('kit_photo_url') && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#dbeafe', color: '#1e40af', fontWeight: 700, border: '1px solid #93c5fd' }}>🔄 Recién corregido</span>}
                    </div>
                    <DocImage url={reviewingOp.kit_photo_url} label="Kit" rejected={isDocRejected('kit_photo_url')} />
                  </div>
                </div>
              )}

              {reviewDocTab === 'zona' && (
                <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '14px 16px', border: '1.5px solid #bae6fd' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', marginBottom: 10 }}>📍 Zona de Operación</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                    {[{ label: 'Radio', value: reviewingOp.coverage_radius ? `${reviewingOp.coverage_radius} km` : '—' }, { label: 'Días', value: Array.isArray(reviewingOp.work_days) ? reviewingOp.work_days.map(d => WORK_DAYS_LABELS[d] || d).join(', ') : '—' }, { label: 'Horario', value: reviewingOp.work_start && reviewingOp.work_end ? `${reviewingOp.work_start} – ${reviewingOp.work_end}` : '—' }].map(({ label, value }) => (
                      <div key={label}><div style={{ fontSize: 10, color: '#0284c7', fontWeight: 600 }}>{label}</div><div style={{ fontSize: 13, color: '#0369a1', fontWeight: 600, marginTop: 2 }}>{value}</div></div>
                    ))}
                  </div>
                </div>
              )}

              {reviewDocTab === 'contrato' && (
                <div style={{ display: 'grid', gap: 14 }}>

                  {/* Estado del contrato */}
                  <div style={{ background: reviewingOp.terms_accepted_at ? '#f0fdf4' : '#fef2f2', borderRadius: 12, padding: '14px 16px', border: `1.5px solid ${reviewingOp.terms_accepted_at ? '#bbf7d0' : '#fecaca'}` }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: reviewingOp.terms_accepted_at ? '#166534' : '#dc2626', marginBottom: 4 }}>
                      {reviewingOp.terms_accepted_at ? '✅ Contrato aceptado digitalmente' : '❌ Contrato sin aceptar'}
                    </div>
                    {reviewingOp.terms_accepted_at && (
                      <div style={{ fontSize: 12, color: '#059669' }}>
                        📅 {new Date(reviewingOp.terms_accepted_at).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' })}
                      </div>
                    )}
                  </div>

                  {/* Comparación lado a lado: INE reverso + Firma digital */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Verificación de firma
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                    {/* INE Reverso */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                        🪪 INE — Reverso
                        <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>(firma física)</span>
                      </div>
                      {reviewingOp.ine_back_url ? (
                        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1.5px solid #e5e7eb', background: '#f8fafc' }}>
                          <img
                            src={reviewingOp.ine_back_url}
                            alt="INE reverso"
                            style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: 200 }}
                            onClick={() => window.open(reviewingOp.ine_back_url, '_blank')}
                            onError={e => { e.target.parentElement.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:12px">⚠️ No se pudo cargar</div>' }}
                          />
                          <div style={{ padding: '6px 10px', background: '#f1f5f9', fontSize: 11, color: '#64748b', textAlign: 'center', cursor: 'pointer' }}
                            onClick={() => window.open(reviewingOp.ine_back_url, '_blank')}>
                            🔍 Ver completo
                          </div>
                        </div>
                      ) : (
                        <div style={{ borderRadius: 10, border: '1.5px solid #fecaca', background: '#fef2f2', padding: '24px 12px', textAlign: 'center', fontSize: 12, color: '#dc2626' }}>
                          ⚠️ Sin documento
                        </div>
                      )}
                    </div>

                    {/* Firma digital */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                        ✍️ Firma digital
                        <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>(en la App)</span>
                      </div>
                      {reviewingOp.signature_url ? (
                        <div style={{ borderRadius: 10, overflow: 'hidden', border: '1.5px solid #e5e7eb', background: '#fff' }}>
                          <img
                            src={reviewingOp.signature_url}
                            alt="Firma digital"
                            style={{ width: '100%', display: 'block', objectFit: 'contain', maxHeight: 200, background: '#fff' }}
                            onClick={() => window.open(reviewingOp.signature_url, '_blank')}
                            onError={e => { e.target.parentElement.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;font-size:12px">⚠️ No se pudo cargar</div>' }}
                          />
                          <div style={{ padding: '6px 10px', background: '#f1f5f9', fontSize: 11, color: '#64748b', textAlign: 'center', cursor: 'pointer' }}
                            onClick={() => window.open(reviewingOp.signature_url, '_blank')}>
                            🔍 Ver completo
                          </div>
                        </div>
                      ) : (
                        <div style={{ borderRadius: 10, border: '1.5px solid #fde68a', background: '#fffbeb', padding: '24px 12px', textAlign: 'center', fontSize: 12, color: '#92400e' }}>
                          ⚠️ Sin firma registrada
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Instrucción para el revisor */}
                  <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', border: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
                    💡 Compara la firma del reverso del INE con la firma digital. Deben ser similares. Si no coinciden, solicita corrección del documento de identidad.
                  </div>

                </div>
              )}

              {reviewDocTab === 'decision' && (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <button onClick={() => { setReviewAction('approve'); setRejectedDocs([]); }}
                      style={{ padding: '14px 8px', borderRadius: 12, border: reviewAction === 'approve' ? '2.5px solid #10b981' : '1.5px solid #e5e7eb', background: reviewAction === 'approve' ? '#f0fdf4' : '#fff', color: reviewAction === 'approve' ? '#065f46' : '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 56 }}>
                      ✅ Aprobar todo
                    </button>
                    <button onClick={() => setReviewAction('reject_docs')}
                      style={{ padding: '14px 8px', borderRadius: 12, border: reviewAction === 'reject_docs' ? '2.5px solid #f59e0b' : '1.5px solid #e5e7eb', background: reviewAction === 'reject_docs' ? '#fffbeb' : '#fff', color: reviewAction === 'reject_docs' ? '#92400e' : '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 56 }}>
                      ⚠️ Correcciones
                    </button>
                    <button onClick={() => { setReviewAction('reject'); setRejectedDocs([]); }}
                      style={{ padding: '14px 8px', borderRadius: 12, border: reviewAction === 'reject' ? '2.5px solid #ef4444' : '1.5px solid #e5e7eb', background: reviewAction === 'reject' ? '#fef2f2' : '#fff', color: reviewAction === 'reject' ? '#991b1b' : '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 56 }}>
                      ❌ Rechazar
                    </button>
                  </div>

                  {reviewAction === 'reject_docs' && (
                    <div style={{ background: '#fffbeb', borderRadius: 12, padding: '14px', border: '1.5px solid #fde68a' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 10 }}>Selecciona los documentos a corregir:</div>
                      <div style={{ display: 'grid', gap: 8 }}>
                        {REJECTABLE_DOCS.map(doc => {
                          const isSelected = isDocRejected(doc.key);
                          const selectedDoc = rejectedDocs.find(d => d.key === doc.key);
                          return (
                            <div key={doc.key} style={{ background: isSelected ? '#fef2f2' : '#fff', borderRadius: 10, border: `1.5px solid ${isSelected ? '#fecaca' : '#e5e7eb'}`, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                                <button onClick={() => toggleRejectedDoc(doc)} style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? '#ef4444' : '#d1d5db'}`, background: isSelected ? '#ef4444' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {isSelected && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                                </button>
                                <span style={{ fontSize: 16 }}>{doc.icon}</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{doc.label}</div>
                                  <div style={{ fontSize: 11, color: isSelected ? '#dc2626' : reviewingOp[doc.key] ? '#10b981' : '#9ca3af' }}>
                                    {isSelected ? '⚠️ Marcado para corrección' : reviewingOp[doc.key] ? '✅ Aprobado' : '⚠️ Sin documento'}
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <div style={{ padding: '0 12px 10px', borderTop: '1px solid #fecaca' }}>
                                  <input type="text" placeholder="Motivo (opcional)" value={selectedDoc?.reason || ''} onChange={e => updateDocReason(doc.key, e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #fecaca', fontSize: 13, fontFamily: 'inherit', color: '#374151', background: '#fff5f5', boxSizing: 'border-box', marginTop: 8 }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {rejectedDocs.length > 0 && (
                        <div style={{ background: '#fef2f2', borderRadius: 8, padding: '8px 12px', marginTop: 10, fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                          ⚠️ {rejectedDocs.length} doc{rejectedDocs.length !== 1 ? 's' : ''} seleccionado{rejectedDocs.length !== 1 ? 's' : ''}. El operador regresará al paso {Math.min(...rejectedDocs.map(d => d.step))}.
                        </div>
                      )}
                    </div>
                  )}

                  {reviewAction === 'reject' && (
                    <div>
                      <label style={{ ...labelStyle, color: '#991b1b' }}>Motivo de rechazo *</label>
                      <textarea placeholder="Ej: Las fotos del INE no son claras..." value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} style={{ ...inputStyle, height: 80, resize: 'vertical', borderColor: '#fecaca', background: '#fff5f5' }} />
                    </div>
                  )}

                  {reviewAction === 'approve' && (
                    <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#065f46' }}>ℹ️ El operador recibirá WhatsApp de bienvenida y podrá recibir servicios de inmediato.</div>
                  )}

                  {reviewError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>⚠️ {reviewError}</div>}
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setReviewModal(false)} style={{ padding: '12px 22px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              {reviewDocTab === 'decision' && (
                <button onClick={submitReview} disabled={savingReview || !reviewAction}
                  style={{ padding: '12px 28px', background: savingReview || !reviewAction ? '#9ca3af' : reviewAction === 'approve' ? '#10b981' : reviewAction === 'reject_docs' ? '#f59e0b' : '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: !reviewAction ? 'not-allowed' : 'pointer', minHeight: 48 }}>
                  {savingReview ? '⏳ Guardando...' : reviewAction === 'approve' ? '✅ Aprobar' : reviewAction === 'reject_docs' ? `⚠️ Solicitar ${rejectedDocs.length} corrección${rejectedDocs.length !== 1 ? 'es' : ''}` : '❌ Rechazar'}
                </button>
              )}
              {reviewDocTab !== 'decision' && (
                <button onClick={() => setReviewDocTab('decision')} style={{ padding: '12px 22px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>Ir a Decisión →</button>
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

      {/* ════ MODAL: ELIMINAR OPERADOR ════ */}
      {deleteModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: 440, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', padding: '16px 20px' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>🗑 Eliminar Operador</h3>
              <div style={{ color: '#fecaca', fontSize: 12, marginTop: 2 }}>{deleteModal.full_name}</div>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 14, color: '#374151', margin: '0 0 16px', lineHeight: 1.6 }}>¿Cómo deseas proceder con <strong>{deleteModal.full_name}</strong>?</p>

              <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
                <button onClick={() => setDeleteMode('deactivate')}
                  style={{ padding: '14px 16px', borderRadius: 12, border: deleteMode === 'deactivate' ? '2.5px solid #f59e0b' : '1.5px solid #e5e7eb', background: deleteMode === 'deactivate' ? '#fffbeb' : '#fff', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>⚫ Desactivar cuenta</div>
                  <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>El operador pierde acceso pero su historial y datos se conservan. Puede reactivarse después.</div>
                </button>
                <button onClick={() => setDeleteMode('permanent')}
                  style={{ padding: '14px 16px', borderRadius: 12, border: deleteMode === 'permanent' ? '2.5px solid #ef4444' : '1.5px solid #e5e7eb', background: deleteMode === 'permanent' ? '#fef2f2' : '#fff', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>❌ Eliminar permanentemente</div>
                  <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>Se elimina el perfil y acceso del operador. Esta acción no se puede deshacer.</div>
                </button>
              </div>

              {deleteMode === 'permanent' && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 8, fontSize: 12, color: '#991b1b', lineHeight: 1.5 }}>
                  ⚠️ <strong>Acción irreversible.</strong> El historial de servicios asociado permanecerá en el sistema pero el operador no podrá volver a acceder con este email.
                </div>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteModal(null)} style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={handleDeleteOperator} disabled={deletingOp}
                style={{ flex: 1, padding: '12px', background: deletingOp ? '#9ca3af' : deleteMode === 'permanent' ? '#ef4444' : '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                {deletingOp ? '⏳ Procesando...' : deleteMode === 'permanent' ? '❌ Eliminar' : '⚫ Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Comisión */}
      {commissionModal && commissionOp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: isMobile ? '100%' : 420, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#059669,#10b981)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>💰 Comisiones — {commissionOp.full_name}</h3>
              <button onClick={() => setCommissionModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#a7f3d0', fontSize: 22, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: isMobile ? '16px' : 20 }}>
              {commissionReport && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
                  {[{ label: 'Servicios', value: commissionReport.services, color: '#1e40af' }, { label: 'Ingresos', value: `$${commissionReport.totalRevenue.toFixed(2)}`, color: '#059669' }, { label: 'Comisión', value: `$${(commissionReport.totalRevenue * (commissionPct / 100)).toFixed(2)}`, color: '#7c3aed' }].map((s, i) => (
                    <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
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
                {savingCommission ? '⏳...' : '💾 Guardar %'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: KPIs */}
      {kpisModal && kpisOp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: isMobile ? '100%' : 480, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>⏱ Rendimiento — {kpisOp.full_name}</h3>
              <button onClick={() => setKpisModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#ede9fe', fontSize: 22, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: isMobile ? '16px' : 20 }}>
              {loadingKpis ? <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>⏳ Calculando...</div> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {[{ label: 'Prom. traslado', value: formatSeconds(Math.round(kpisData?.avg_travel_seconds || 0)), icon: '🚗', color: '#3b82f6' }, { label: 'Prom. lavado', value: formatSeconds(Math.round(kpisData?.avg_washing_seconds || 0)), icon: '🧽', color: '#f97316' }, { label: 'Servicios', value: kpisData?.total_services || 0, icon: '✅', color: '#10b981' }, { label: 'Real vs Est.', value: kpisData?.avg_real_vs_estimated ? `${Math.round(kpisData.avg_real_vs_estimated)}%` : '—', icon: '📊', color: '#7c3aed' }].map((k, i) => (
                    <div key={i} style={{ background: '#f9fafb', borderRadius: 12, padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', textAlign: 'right' }}>
              <button onClick={() => setKpisModal(false)} style={{ padding: '12px 24px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL: ACTIVAR/EXTENDER MEMBRESÍA ════ */}
      {membershipModal && membershipOp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', width: '100%', maxWidth: isMobile ? '100%' : 420, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#059669,#10b981)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>💳 {membershipOp.membership_status === 'activa' ? 'Extender' : 'Activar'} Membresía</h3>
              <button onClick={() => setMembershipModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#a7f3d0', fontSize: 22, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: isMobile ? '16px' : 20 }}>
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 14px', marginBottom: 16, border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#065f46' }}>{membershipOp.full_name}</div>
                <div style={{ fontSize: 12, color: '#059669', marginTop: 2 }}>
                  {membershipOp.membership_status === 'activa' && membershipOp.membership_end_at
                    ? `Vence actualmente: ${new Date(membershipOp.membership_end_at).toLocaleDateString('es-MX')}`
                    : 'Sin membresía activa'}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' }}>Días de membresía</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {[30, 60, 90].map(d => (
                    <button key={d} onClick={() => setMembershipDays(d)}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `1.5px solid ${membershipDays === d ? '#059669' : '#e5e7eb'}`, background: membershipDays === d ? '#f0fdf4' : '#fff', color: membershipDays === d ? '#059669' : '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>
                      {d} días
                    </button>
                  ))}
                </div>
                <input type="number" min="1" max="365" value={membershipDays} onChange={e => setMembershipDays(parseInt(e.target.value) || 30)} style={{ padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 48 }} />
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
                  Nueva fecha de vencimiento: <strong>{new Date(Date.now() + membershipDays * 24 * 60 * 60 * 1000).toLocaleDateString('es-MX')}</strong>
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button onClick={() => setMembershipModal(false)} style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={saveMembership} disabled={updatingMembership === membershipOp.id}
                style={{ flex: 2, padding: '12px', background: updatingMembership === membershipOp.id ? '#9ca3af' : '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                {updatingMembership === membershipOp.id ? '⏳ Guardando...' : `✅ ${membershipOp.membership_status === 'activa' ? 'Extender' : 'Activar'} por ${membershipDays} días`}
              </button>
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
              <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#854d0e' }}>⚠️ Se eliminarán todos los documentos. El operador deberá completar los 5 pasos de nuevo.</div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button onClick={() => setResetOnboardingModal(null)} style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={() => resetOnboarding(resetOnboardingModal)} disabled={savingOpAction} style={{ flex: 1, padding: '12px', background: savingOpAction ? '#9ca3af' : '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                {savingOpAction ? '⏳...' : '🔄 Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminViewB;
