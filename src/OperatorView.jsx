import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Clock, Phone, Navigation, LogOut,
  Play, Check, Camera, CheckSquare, Square, AlertTriangle, Bell
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
import { sendWhatsApp, updateOperatorLocation } from './lib/whatsapp';
import { useToast } from './App';
import AcademiaView from './AcademiaView';
import {
  useIsMobile, uploadFile,
  RequestCard, PhotoUploadServicio, ActivationScreen,
  FotoModal, InfografiaItem,
  playNotificationSound, vibrateDevice,
  requestNotificationPermission, showSystemNotification,
  getAbsoluteUTCMs,
} from './OperatorHelpers';
import OperatorAccount from './OperatorAccount';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_MAPS_KEY   = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

const OperatorView = () => {
  const { user, profile, signOut, loadProfileDirect } = useAuth();
  const { showToast } = useToast();
  const [membershipPanelOpen, setMembershipPanelOpen] = useState(false)

  // ── Mis Horarios ─────────────────────────────────────────────────────────
  const [exceptions, setExceptions]         = useState([])
  const [excLoading, setExcLoading]         = useState(false)
  const [excTab, setExcTab]                 = useState('excepciones') // 'excepciones' | 'horario' | 'zona'
  // ── Solicitud cambio de zona ───────────────────────────────────────────────
  const [zoneRequest, setZoneRequest]       = useState(null)   // solicitud activa pendiente
  const [zoneForm, setZoneForm]             = useState({ new_address: '', new_lat: null, new_lng: null, new_radius: 3, reason_type: 'cambio_domicilio', reason_detail: '' })
  const [zoneMapUrl, setZoneMapUrl]         = useState(null)
  const [savingZone, setSavingZone]         = useState(false)
  const [zoneSuccess, setZoneSuccess]       = useState('')
  const [zoneError, setZoneError]           = useState('')
  const [excType, setExcType]               = useState('day_off') // day_off | vacation | schedule_change
  const [excStartDate, setExcStartDate]     = useState('')
  const [excEndDate, setExcEndDate]         = useState('')
  const [excStartTime, setExcStartTime]     = useState('08:00')
  const [excEndTime, setExcEndTime]         = useState('18:00')
  const [excReason, setExcReason]           = useState('')
  const [excSaving, setExcSaving]           = useState(false)
  const [excError, setExcError]             = useState('')
  // Cambio permanente de horario
  const [newWorkDays, setNewWorkDays]       = useState([])
  const [newWorkStart, setNewWorkStart]     = useState('08:00')
  const [newWorkEnd, setNewWorkEnd]         = useState('18:00')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleError, setScheduleError]   = useState('')
  const [showAcademia, setShowAcademia] = useState(false);
  const [showInfografias, setShowInfografias]       = useState(false);
  const [infografias, setInfografias]               = useState([]);
  const [loadingInfografias, setLoadingInfografias] = useState(false);

  // ── Video prueba de vida (post-aprobación, Opción A) ──────────────────────
  const [lifeVideoUploading, setLifeVideoUploading] = useState(false)
  const [lifeVideoProgress, setLifeVideoProgress]   = useState(0)
  const [lifeVideoError, setLifeVideoError]         = useState('')

  const handleUploadLifeVideo = async (file) => {
    if (!file || !user) return
    if (file.size > 50 * 1024 * 1024) { setLifeVideoError('El video no debe pesar más de 50 MB.'); return }
    setLifeVideoUploading(true); setLifeVideoError(''); setLifeVideoProgress(0)
    try {
      const path = await uploadFile({ file, folder: 'video_de_prueba_de_vida', userId: user.id, onProgress: setLifeVideoProgress })
      // Guardar en profile
      const token = getToken()
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ proof_of_life_video_url: path, updated_at: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      // Notificar al admin por WhatsApp — función Edge existente
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: '5539377258',
            message: `🎥 *Video de prueba de vida recibido*\nOperador: ${profile?.full_name}\nTeléfono: ${profile?.phone}\nRevisar en el panel de admin para aprobar.`,
          }),
        })
      } catch {} // No bloquear si falla la notificación
      // Refrescar perfil
      try { await loadProfileDirect() } catch { await loadProfile() }
      setLifeVideoError('')
    } catch (e) {
      setLifeVideoError(e.message)
    } finally {
      setLifeVideoUploading(false)
    }
  }
  const [selectedInfografia, setSelectedInfografia] = useState(null); // índice 0-3
  // Comisiones del ciclo
  const [commissionData, setCommissionData]         = useState(null);
  const [loadingCommission, setLoadingCommission]   = useState(false);
  // Dashboard de calificación
  const [ratingData, setRatingData]                 = useState(null);
  const [membershipConfig, setMembershipConfig]           = useState(null);
  const [payingMembership, setPayingMembership]           = useState(false);
  const [payError, setPayError]                           = useState('');
  const [membershipHistory, setMembershipHistory]         = useState([]);
  const [showMembershipHistory, setShowMembershipHistory] = useState(false);
  // Estado local de membresía — se refresca tras regresar de Stripe
  const [operatorMembership, setOperatorMembership]       = useState(null);
  // Promo efectiva del operador
  const [effectivePromo, setEffectivePromo]               = useState(null);
  // Chat interno
  const [chatBookingId, setChatBookingId]     = useState(null);
  const [unreadByBooking, setUnreadByBooking]  = useState({}) // { bookingId: count }
  const [chatMessages, setChatMessages]       = useState([]);
  const [chatInput, setChatInput]             = useState('');
  const [chatLoading, setChatLoading]         = useState(false);
  const [chatSending, setChatSending]         = useState(false);
  const [chatError, setChatError]             = useState('');
  const chatBottomRef                         = useRef(null);
  const chatChannelRef                        = useRef(null);
  const globalMsgChannelRef                   = useRef(null); // canal global para badges cuando chat cerrado
  // Deposito bancario
  const [depositModal, setDepositModal]                   = useState(false);
  const [depositLoading, setDepositLoading]               = useState(false);
  const [depositSuccess, setDepositSuccess]               = useState(false);
  const [depositError, setDepositError]                   = useState('');
  // Cancelar membresia Stripe
  const [cancellingMembership, setCancellingMembership]   = useState(false);
  const isMobile = useIsMobile();

  // ── Estado general ────────────────────────────────────────────────────────
  const [bookings, setBookings]               = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [fetchError, setFetchError]           = useState('');
  const [activeTab, setActiveTab]             = useState('solicitudes');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [updatingId, setUpdatingId]           = useState(null);
  const fetchingRef                           = useRef(false);
  const bookingsCache                         = useRef([]);

  // ── Estado solicitudes ────────────────────────────────────────────────────
  const [requests, setRequests]       = useState([]);
  const [loadingReqs, setLoadingReqs] = useState(false);
  const [accepting, setAccepting]     = useState(null); // id del request que se está aceptando
  const [acceptError, setAcceptError] = useState('');

  // ── Estado fotos ──────────────────────────────────────────────────────────
  const [checklist, setChecklist]             = useState([]);
  const [checklistModal, setChecklistModal]   = useState(false);
  const [pendingFinalize, setPendingFinalize] = useState(null);
  const [photoModal, setPhotoModal] = useState(false);
  const photoModalRef = useRef(false);
  const setPhotoModalSafe = (val) => {
    photoModalRef.current = val;
    setPhotoModal(val);
  };
  const [photoBooking, setPhotoBooking]       = useState(null);
  const [photoStep, setPhotoStep]             = useState(1);
  const [photosData, setPhotosData]           = useState({});
  const [uploadingPhoto, setUploadingPhoto]   = useState(false);
  const [uploadError, setUploadError]         = useState('');
  const [uploadProgress, setUploadProgress]   = useState('');
  const [photoPhase, setPhotoPhase]           = useState('before');

  // ── Estado incidencias ────────────────────────────────────────────────────
  const [incidentModal, setIncidentModal]     = useState(false);
  const [incidentBooking, setIncidentBooking] = useState(null);
  const [incidentNote, setIncidentNote]       = useState('');
  const [sendingIncident, setSendingIncident] = useState(false);

  const gpsWatcherRef                             = useRef(null);
  const [trackingBookingId, setTrackingBookingId] = useState(null);
  const [gpsError, setGpsError]                   = useState('');
  const [sessionToken, setSessionToken]           = useState(null);

  // ── Carga inicial y realtime ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    fetchOperatorBookings();
    fetchBookingRequests();
    fetchMembershipConfig();
    fetchEffectivePromo(); // llama fetchCommissionData internamente con promo correcta
    fetchRatingData();
    fetchBillingHistory();
    fetchUnreadCounts();

    // ── Detectar regreso desde Stripe con pago exitoso ────────────────────
    const params = new URLSearchParams(window.location.search);
    if (params.get('membership') === 'success') {
      // Limpiar URL inmediatamente
      window.history.replaceState({}, '', window.location.pathname);
      // Esperar 3s para que el webhook procese, luego refrescar membresía
      setTimeout(async () => {
        try {
          let token = SUPABASE_ANON_KEY;
          try {
            const stored = localStorage.getItem('mazclean-auth');
            if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
          } catch {}
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=membership_status,membership_type,membership_end_at,membership_start_at,membership_record_since`,
            { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data?.[0]) setOperatorMembership(data[0]);
          }
        } catch (err) { console.error('refreshMembership:', err); }
      }, 3000);
    }

    // Realtime: cambios en bookings del operador
    const bookingsChannel = supabase
      .channel('operator-bookings')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bookings',
        filter: `operator_id=eq.${user.id}`,
      }, () => {
        // No refrescar mientras el modal de fotos está abierto — evita que se reabra
        if (!photoModalRef.current) fetchOperatorBookings(true);
      })
      .subscribe();

    // Realtime: nuevas solicitudes para este operador
    const requestsChannel = supabase
      .channel('operator-requests')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'booking_requests',
        filter: `operator_id=eq.${user.id}`,
      }, (payload) => {
        fetchBookingRequests();
        // Si se aceptó un request, refrescar bookings para ver el servicio confirmado
        if (payload.new?.status === 'aceptado') {
          setTimeout(() => fetchOperatorBookings(true), 500);
        }
        // Cambiar al tab de solicitudes automáticamente si llega una nueva
        setActiveTab(prev => prev === 'solicitudes' ? prev : 'solicitudes');
      })
      .subscribe();

    // Polling cada 15s como respaldo al Realtime
    // Supabase Realtime no emite eventos para cambios hechos con service_role
    // (expire-booking-round usa service_role al crear nuevas rondas)
    const pollingInterval = setInterval(() => {
      fetchBookingRequests();
    }, 15000);

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(requestsChannel);
      clearInterval(pollingInterval);
    };
  }, [user]);

  useEffect(() => {
    // Leer token de localStorage sin llamar getSession() para no romper el lock en móvil
    try {
      const stored = localStorage.getItem('mazclean-auth')
      if (stored) {
        const parsed = JSON.parse(stored)
        const t = parsed?.access_token || parsed?.session?.access_token
        if (t) setSessionToken(t)
      }
    } catch {}
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) setSessionToken(session.access_token);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Canal global de mensajes — badge cuando chat está cerrado ───────────
  // NO toca el canal del chat abierto (chatChannelRef) — son independientes
  useEffect(() => {
    if (!user?.id || !bookings.length) return

    // Bookings activos donde el operador puede recibir mensajes
    const activeBookingIds = bookings
      .filter(b => ['confirmado','en_camino','en_proceso'].includes(b.status))
      .map(b => b.id)

    if (!activeBookingIds.length) return

    // Limpiar canal global previo si existía
    if (globalMsgChannelRef.current) {
      supabase.removeChannel(globalMsgChannelRef.current)
      globalMsgChannelRef.current = null
    }

    // Crear un canal por cada booking activo para escuchar mensajes del cliente
    // Cuando llega un mensaje y el chat de ESE booking NO está abierto → badge +1
    const channels = activeBookingIds.map(bookingId => {
      return supabase
        .channel(`global-msg-${bookingId}-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `booking_id=eq.${bookingId}`,
        }, (payload) => {
          const msg = payload.new
          // Solo contar mensajes del cliente que llegan cuando el chat está CERRADO
          if (msg.sender_role === 'cliente' && msg.booking_id !== chatBookingId) {
            setUnreadByBooking(prev => ({
              ...prev,
              [msg.booking_id]: (prev[msg.booking_id] || 0) + 1,
            }))
            playNotificationSound()
            vibrateDevice()
            showSystemNotification('💬 Mensaje del cliente', msg.content)
          }
        })
        .subscribe()
    })

    // Guardar referencia para cleanup (array de canales)
    globalMsgChannelRef.current = { channels, remove: () => channels.forEach(c => supabase.removeChannel(c)) }

    return () => {
      if (globalMsgChannelRef.current?.remove) globalMsgChannelRef.current.remove()
      globalMsgChannelRef.current = null
    }
  }, [bookings, user?.id])

  useEffect(() => {
    const activeBooking = bookings.find(
      b => b.status === 'en_camino' && (b.operator_id === user?.id || profile?.role === 'admin')
    );
    if (activeBooking && trackingBookingId !== activeBooking.id) {
      setTrackingBookingId(activeBooking.id);
      if (!navigator.geolocation) return;
      if (gpsWatcherRef.current !== null) navigator.geolocation.clearWatch(gpsWatcherRef.current);
      gpsWatcherRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsError('');
          updateOperatorLocation(activeBooking.id, user.id, pos.coords.latitude, pos.coords.longitude);
        },
        (err) => {
          if (err.code === 1) setGpsError('Ubicacion bloqueada. Ve a Configuracion > Permisos > Ubicacion.');
          else setGpsError('No se pudo obtener tu ubicacion. Verifica que el GPS este activado.');
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }
    if (!activeBooking && gpsWatcherRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatcherRef.current);
      gpsWatcherRef.current = null;
      setTrackingBookingId(null);
    }
    return () => { if (gpsWatcherRef.current !== null) navigator.geolocation.clearWatch(gpsWatcherRef.current); };
  }, [bookings, user]);

  // ── Sign out seguro — limpia localStorage antes de redirigir ─────────────
  const handleSignOut = async () => {
    try {
      localStorage.removeItem('mazclean-auth')
      localStorage.removeItem('supabase.auth.token')
      sessionStorage.clear()
      await supabase.auth.signOut()
    } catch {}
    window.location.href = '/'
  }

  // ── GUARDS (después de todos los hooks) ───────────────────────────────────
  if (profile?.role !== 'admin' && (!profile || !profile.onboarding_done)) {
    const step = profile?.onboarding_step || 1;
    return (
      <div style={{ minHeight: '100vh', background: '#050A14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1.5px solid rgba(59,130,246,0.3)', borderRadius: 20, padding: '40px 32px', maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F0F6FF', marginBottom: 12 }}>Completa tu registro</h2>
          <p style={{ color: '#8CA0BF', fontSize: 15, marginBottom: 8, lineHeight: 1.6 }}>Para acceder al panel necesitas completar tu proceso de alta como operador.</p>
          {step > 1 && <p style={{ color: '#60a5fa', fontSize: 13, marginBottom: 24 }}>Continuaras desde el paso {step} de 5</p>}
          <button onClick={() => window.location.reload()} style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', marginBottom: 12 }}>
            {step > 1 ? 'Continuar registro (Paso ' + step + '/5)' : 'Iniciar registro'}
          </button>
          <button onClick={handleSignOut} style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#8CA0BF', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  if (profile?.role !== 'admin' && profile.onboarding_done &&
    (profile.operator_status === 'pending_review' || profile.operator_status === 'pendiente')) {
    return (
      <div style={{ minHeight: '100vh', background: '#050A14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1.5px solid rgba(59,130,246,0.3)', borderRadius: 20, padding: '40px 32px', maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⏳</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F0F6FF', marginBottom: 12 }}>Perfil en revisión</h2>
          <p style={{ color: '#8CA0BF', fontSize: 15, marginBottom: 8, lineHeight: 1.6 }}>
            Tu registro está siendo revisado por el administrador.
          </p>
          <p style={{ color: '#60a5fa', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
            📱 Te notificaremos por WhatsApp en máximo <strong style={{ color: '#93c5fd' }}>4 horas hábiles</strong>.
          </p>
          <button onClick={handleSignOut} style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#8CA0BF', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const handleSubscribeOperator = async () => {
    setPayingMembership(true);
    setPayError('');
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      // Usar precio efectivo con promo si existe
      const priceToCharge = effectiveMembershipPrice || membershipConfig?.operator_price || 200;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-subscription`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'operador',
          user_id: user.id,
          email: user.email,
          price: priceToCharge,
          success_url: `${window.location.origin}?membership=success`,
          cancel_url: window.location.href,
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`)
        throw new Error(errText || `HTTP ${res.status}`)
      }
      const data = await res.json();
      if (!data?.url) throw new Error(data?.error || 'No se recibió URL de pago. Intenta de nuevo.');
      window.location.href = data.url;
    } catch (err) {
      console.error('handleSubscribeOperator:', err)
      setPayError(err.message || 'Error al conectar con el sistema de pagos. Intenta de nuevo o usa depósito bancario.');
      setPayingMembership(false);
    }
  };

  // ── Solicitar membresía por depósito bancario ────────────────────────────
  const handleDepositRequest = async () => {
    if (!profile?.referral_code) return;
    setDepositLoading(true);
    setDepositError('');
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      // Usar precio efectivo con promo si existe, igual que Stripe
      const basePrice  = parseFloat(membershipConfig?.operator_price || 200)
      const promoPrice = effectivePromo?.effective_price ? parseFloat(effectivePromo.effective_price) : null
      const amount     = promoPrice !== null ? Math.min(promoPrice, basePrice) : basePrice;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/membership_requests`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, user_type: 'operador', referral_code: profile.referral_code, amount }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || `HTTP ${res.status}`);
      }
      setDepositSuccess(true);
    } catch (err) {
      setDepositError(err.message || 'Error al registrar solicitud');
    } finally {
      setDepositLoading(false);
    }
  };

  // ── Cancelar membresía activa ─────────────────────────────────────────────

    // ── Perfil efectivo: usa refresco local si existe (post-pago Stripe) ────
  const effectiveProfile = operatorMembership
    ? { ...profile, ...operatorMembership }
    : profile;

  // Precio efectivo de membresía (con promo si aplica)
  const effectiveMembershipPrice = effectivePromo?.effective_price || membershipConfig?.operator_price || 200;


  // ── Fetch bookings ────────────────────────────────────────────────────────
  const fetchInfografias = async () => {
    setLoadingInfografias(true)
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/course_lessons?content_type=eq.infografia&select=id,title,content_url,module_id&order=order_index.asc`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (res.ok) {
        const data = await res.json()
        // Traer también los títulos de módulos para mostrar el nombre
        const modRes = await fetch(
          `${SUPABASE_URL}/rest/v1/course_modules?is_active=eq.true&order=order_index.asc&select=id,title,order_index`,
          { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
        )
        const modules = modRes.ok ? await modRes.json() : []
        // Combinar: una infografía por módulo
        const combined = modules.map(mod => ({
          ...mod,
          infografia: data.find(d => d.module_id === mod.id) || null,
        })).filter(m => m.infografia)
        setInfografias(combined)
      }
    } catch (err) { console.error('fetchInfografias:', err) }
    finally { setLoadingInfografias(false) }
  }

  const fetchCommissionData = async (promoOverride = null) => {
    if (!user?.id) return
    setLoadingCommission(true)
    // promoOverride permite pasar la promo directamente cuando effectivePromo aún no está en state
    const activePromo = promoOverride !== undefined ? promoOverride : effectivePromo
    try {
      let token = SUPABASE_ANON_KEY
      try {
        const stored = localStorage.getItem('mazclean-auth')
        if (stored) { const p = JSON.parse(stored); token = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY }
      } catch {}
      const headers = { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }

      // 1. Traer config de comisiones
      const cfgRes = await fetch(`${SUPABASE_URL}/rest/v1/membership_config?select=commission_enabled,commission_pct_base,commission_pct_pro,commission_pct_proplus,commission_pct_elite,operator_price&limit=1`, { headers })
      const cfgData = cfgRes.ok ? await cfgRes.json() : []
      const cfg = cfgData[0] || {}
      if (!cfg.commission_enabled) { setCommissionData(null); setLoadingCommission(false); return }

      // 2. Perfil: membership_start_at, membership_end_at, operator_level, avg_rating
      const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=membership_start_at,membership_end_at,operator_level,membership_status`, { headers })
      const profData = profRes.ok ? await profRes.json() : []
      const prof = profData[0] || {}

      // 3. Calcular inicio del ciclo (Solución B: si pagó antes del vencimiento, ciclo empieza en fecha original)
      let cycleStart = prof.membership_start_at ? new Date(prof.membership_start_at) : new Date()
      let cycleEnd   = prof.membership_end_at   ? new Date(prof.membership_end_at)   : new Date()
      // Si pagó antes del vencimiento anterior, el ciclo empieza en membership_end_at - 30 días
      const prevEnd = new Date(cycleEnd)
      prevEnd.setDate(prevEnd.getDate() - 30)
      if (cycleStart < prevEnd) cycleStart = prevEnd

      // 4. Traer bookings finalizados en el ciclo actual
      const dateFrom = cycleStart.toISOString().slice(0, 10)
      const bkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?operator_id=eq.${user.id}&status=eq.finalizado&scheduled_date=gte.${dateFrom}&select=total_price,scheduled_date`,
        { headers }
      )
      const bookings = bkRes.ok ? await bkRes.json() : []

      // 5. Calcular ingresos y comisión según nivel
      const level = prof.operator_level || 'operador'
      const pctMap = {
        operador: parseFloat(cfg.commission_pct_base)    || 5,
        pro:      parseFloat(cfg.commission_pct_pro)     || 4,
        proplus:  parseFloat(cfg.commission_pct_proplus) || 3,
        elite:    parseFloat(cfg.commission_pct_elite)   || 2,
      }
      const pct         = pctMap[level]
      const totalIncome = bookings.reduce((acc, b) => acc + parseFloat(b.total_price || 0), 0)
      const commission  = Math.round(totalIncome * pct / 100)

      // 6. Membresía con descuento por nivel o promo activa (lo que sea menor)
      const discMap    = { operador: 0, pro: 0.10, proplus: 0.20, elite: 0.35 }
      const basePrice  = parseFloat(cfg.operator_price) || 200
      const levelPrice = Math.round(basePrice * (1 - (discMap[level] || 0)))
      // Si hay promo activa, usar su precio efectivo (puede ser mejor que el descuento por nivel)
      const promoPrice = activePromo?.effective_price ? parseFloat(activePromo.effective_price) : null
      const membership = promoPrice !== null ? Math.round(Math.min(promoPrice, levelPrice)) : levelPrice
      const totalDue   = commission + membership

      // 7. Tabla de niveles con %s configurados
      const levelsTable = [
        { key: 'operador', label: 'Operador', range: '0–3.9',  pct: parseFloat(cfg.commission_pct_base)    || 5,  dot: '#9ca3af' },
        { key: 'pro',      label: 'Pro',      range: '4.0–4.4', pct: parseFloat(cfg.commission_pct_pro)     || 4,  dot: '#60a5fa' },
        { key: 'proplus',  label: 'Pro+',     range: '4.5–4.7', pct: parseFloat(cfg.commission_pct_proplus) || 3,  dot: '#a78bfa' },
        { key: 'elite',    label: 'Elite',    range: '4.8–5.0', pct: parseFloat(cfg.commission_pct_elite)   || 2,  dot: '#fbbf24' },
      ]

      setCommissionData({
        level, pct, totalIncome: Math.round(totalIncome),
        commission, membership, totalDue,
        serviceCount: bookings.length,
        cycleEnd: prof.membership_end_at,
        levelsTable,
      })
    } catch (err) { console.error('fetchCommissionData:', err) }
    finally { setLoadingCommission(false) }
  }

  const fetchRatingData = async () => {
    if (!user?.id) return
    try {
      let token = SUPABASE_ANON_KEY
      try {
        const stored = localStorage.getItem('mazclean-auth')
        if (stored) { const p = JSON.parse(stored); token = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY }
      } catch {}
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=rating_avg,total_ratings,operator_level`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (!res.ok) return
      const data = await res.json()
      const p = data[0] || {}
      const avg   = parseFloat(p.rating_avg) || 0
      const total = parseInt(p.total_ratings) || 0
      const level = p.operator_level || 'operador'
      // Calcular siguiente nivel y progreso
      const levels = [
        { key: 'operador', label: 'Operador', min: 0,   max: 3.9,  next: 'Pro',    nextMin: 4.0, dot: '#9ca3af' },
        { key: 'pro',      label: 'Pro',      min: 4.0,  max: 4.4,  next: 'Pro+',   nextMin: 4.5, dot: '#60a5fa' },
        { key: 'proplus',  label: 'Pro+',     min: 4.5,  max: 4.7,  next: 'Elite',  nextMin: 4.8, dot: '#a78bfa' },
        { key: 'elite',    label: 'Elite',    min: 4.8,  max: 5.0,  next: null,     nextMin: null, dot: '#fbbf24' },
      ]
      const currentLevel = levels.find(l => l.key === level) || levels[0]
      let progress = 0
      let puntosParaSubir = null
      if (currentLevel.next && avg > 0) {
        const range = currentLevel.max - currentLevel.min
        progress = Math.min(100, Math.round(((avg - currentLevel.min) / range) * 100))
        puntosParaSubir = Math.max(0, (currentLevel.nextMin - avg).toFixed(2))
      } else if (level === 'elite') {
        progress = 100
      }
      setRatingData({ avg, total, level, currentLevel, progress, puntosParaSubir })
    } catch (err) { console.error('fetchRatingData:', err) }
  }

  const fetchMembershipConfig = async () => {
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      const res = await fetch(`${SUPABASE_URL}/rest/v1/membership_config?select=operator_price,operator_duration_days,operator_enabled&limit=1`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
      });
      if (res.ok) {
        const data = await res.json();
        setMembershipConfig(data?.[0] || null);
      }
    } catch (err) { console.error('fetchMembershipConfig:', err); }
  };

  const fetchEffectivePromo = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase.rpc('get_effective_membership_price', {
        p_user_id: user.id,
        p_user_type: 'operador',
      });
      const promo = (!error && data?.[0]) ? data[0] : null;
      if (promo) setEffectivePromo(promo);
      // Pasar la promo directamente para evitar race condition con el state
      await fetchCommissionData(promo);
    } catch (err) { console.error('fetchEffectivePromo:', err); }
  };

  const fetchMembershipHistory = async () => {
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      const res = await fetch(`${SUPABASE_URL}/rest/v1/membership_history?user_id=eq.${user.id}&order=start_at.desc`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
      });
      if (res.ok) setMembershipHistory(await res.json());
    } catch (err) { console.error('fetchMembershipHistory:', err); }
  };


  const handleCancelMembership = async () => {
    if (!confirm('¿Deseas cancelar tu membresía? Se mantendrá activa hasta la fecha de vencimiento actual.')) return;
    setCancellingMembership(true);
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      // Cancelar suscripción en Stripe si existe
      if (effectiveProfile?.stripe_subscription_id) {
        await fetch(`${SUPABASE_URL}/functions/v1/cancel-subscription`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription_id: effectiveProfile.stripe_subscription_id }),
        });
      }
      // Marcar como cancelada en profiles (sin quitar acceso hasta end_at)
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ membership_status: 'cancelada', updated_at: new Date().toISOString() }),
      });
      setOperatorMembership(prev => ({ ...(prev || {}), membership_status: 'cancelada' }));
      showToast('Membresía cancelada. Sigue activa hasta ' + new Date(effectiveProfile.membership_end_at).toLocaleDateString('es-MX'), 'info');
    } catch (err) {
      showToast('Error al cancelar: ' + err.message, 'error');
    } finally {
      setCancellingMembership(false);
    }
  };

  // ── Helper token — sin getSession() para no romper el lock en móvil ───────────
  const getToken = () => {
    try {
      const stored = localStorage.getItem('mazclean-auth')
      if (stored) { const p = JSON.parse(stored); return p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY }
    } catch {}
    return SUPABASE_ANON_KEY
  }

  // ── Validar que el mensaje no contiene números de teléfono (8+ dígitos) ──────
  const containsPhone = (text) => {
    const digits = text.replace(/[^0-9]/g, '')
    // Buscar secuencias de 8+ dígitos consecutivos en el texto original
    return /\d[\d\s\-\.]{6,}\d/.test(text) && digits.length >= 8
  }

  // ── Cargar mensajes del chat ───────────────────────────────────────────────
  const fetchMessages = async (bookingId) => {
    setChatLoading(true)
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?booking_id=eq.${bookingId}&order=created_at.asc&select=*`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (res.ok) setChatMessages(await res.json())
    } catch (err) { console.error('fetchMessages:', err) }
    finally { setChatLoading(false) }
  }

  // ── Abrir chat ────────────────────────────────────────────────────────────
  // ── Marcar mensajes del cliente como leídos ─────────────────────────────
  const markMessagesRead = async (bookingId) => {
    if (!bookingId) return
    try {
      const token = getToken()
      await fetch(
        `${SUPABASE_URL}/rest/v1/messages?booking_id=eq.${bookingId}&sender_role=eq.cliente&read_at=is.null`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ read_at: new Date().toISOString() }),
        }
      )
      // Limpiar badge del booking
      setUnreadByBooking(prev => ({ ...prev, [bookingId]: 0 }))
    } catch (err) { console.error('markMessagesRead:', err) }
  }

  const openChat = async (bookingId) => {
    setChatBookingId(bookingId)
    setChatInput('')
    setChatError('')
    markMessagesRead(bookingId)
    if (chatChannelRef.current) { supabase.removeChannel(chatChannelRef.current); chatChannelRef.current = null }
    await fetchMessages(bookingId)
    await requestNotificationPermission()
    // Canal con nombre único para evitar conflictos
    const channelName = `chat-op-${bookingId}-${Date.now()}`
    chatChannelRef.current = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `booking_id=eq.${bookingId}`
      }, (payload) => {
        const msg = payload.new
        if (msg.sender_role === 'cliente') {
          // Chat abierto → marcar como leído inmediatamente
          // El canal global maneja el badge cuando el chat está cerrado
          markMessagesRead(msg.booking_id)
        }
        setChatMessages(prev => {
          const tempIdx = prev.findIndex(m =>
            m.id?.toString().startsWith('temp-') &&
            m.content === msg.content &&
            m.sender_role === msg.sender_role
          )
          if (tempIdx >= 0) {
            const updated = [...prev]
            updated[tempIdx] = msg
            return updated
          }
          if (prev.find(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `booking_id=eq.${bookingId}`
      }, (payload) => {
        // Actualizar read_at en tiempo real — activa el doble tick azul sin refrescar
        const updated = payload.new
        setChatMessages(prev => prev.map(m => m.id === updated.id ? { ...m, read_at: updated.read_at } : m))
      })
      .subscribe((status) => {
        console.log('[Chat Op] Realtime status:', status)
      })
  }

  const closeChat = () => {
    setChatBookingId(null)
    setChatMessages([])
    setChatInput('')
    setChatError('')
    if (chatChannelRef.current) { supabase.removeChannel(chatChannelRef.current); chatChannelRef.current = null }
  }

  // ── Enviar mensaje ────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!chatInput.trim() || chatSending) return
    if (containsPhone(chatInput)) {
      setChatError('No está permitido compartir números de contacto en el chat.')
      return
    }
    const msgContent = chatInput.trim()
    setChatSending(true)
    setChatError('')
    setChatInput('')
    // Agregar mensaje optimísticamente al state local
    const tempMsg = { id: `temp-${Date.now()}`, booking_id: chatBookingId, sender_id: user.id, sender_role: 'operador', content: msgContent, created_at: new Date().toISOString() }
    setChatMessages(prev => [...prev, tempMsg])
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ booking_id: chatBookingId, sender_id: user.id, sender_role: 'operador', content: msgContent }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const [saved] = await res.json()
      // Reemplazar mensaje temporal con el real
      if (saved?.id) setChatMessages(prev => prev.map(m => m.id === tempMsg.id ? saved : m))
    } catch (err) {
      // Revertir mensaje temporal si falla
      setChatMessages(prev => prev.filter(m => m.id !== tempMsg.id))
      setChatError('Error al enviar: ' + err.message)
    }
    finally { setChatSending(false) }
  }

  // Scroll al fondo cuando llegan mensajes nuevos
  useEffect(() => {
    if (chatBottomRef.current) chatBottomRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const fetchOperatorBookings = async (silent = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!silent) setLoading(true);
    setFetchError('');
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true; fetchingRef.current = false; setLoading(false);
      if (bookingsCache.current.length > 0) { setBookings(bookingsCache.current); setFetchError('Sin conexion — mostrando datos anteriores.'); }
      else { setFetchError('Sin conexion. Verifica tu red e intenta de nuevo.'); }
    }, 8000);
    try {
      let query = supabase.from('bookings').select('*, customer:client_id(full_name, phone)').order('scheduled_date', { ascending: true });
      if (profile?.role !== 'admin') query = query.eq('operator_id', user.id);
      else query = query.in('status', ['confirmado', 'en_camino', 'en_proceso', 'finalizado']);
      const { data, error } = await query;
      clearTimeout(timeoutId); if (timedOut) return;
      if (error) throw error;
      const result = data || [];
      bookingsCache.current = result; setBookings(result); setFetchError('');
      // Cargar badges de mensajes sin leer una vez que tenemos los bookings
      fetchUnreadCounts();
    } catch (err) {
      clearTimeout(timeoutId); if (timedOut) return;
      if (bookingsCache.current.length > 0) { setBookings(bookingsCache.current); setFetchError('Error de red — mostrando datos anteriores.'); }
      else { setFetchError('No se pudieron cargar los servicios. Verifica tu conexion.'); }
    } finally { if (!timedOut) { fetchingRef.current = false; setLoading(false); } }
  };

  // ── Cargar unread count al iniciar ──────────────────────────────────────
  const fetchUnreadCounts = async () => {
    if (!user?.id) return
    try {
      const token = getToken()
      // Obtener todos los bookings activos del operador
      const bkRes = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?operator_id=eq.${user.id}&status=in.(confirmado,en_camino,en_proceso)&select=id`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (!bkRes.ok) return
      const bks = await bkRes.json()
      if (!bks.length) return
      // Contar mensajes sin leer del cliente por booking
      const ids = bks.map(b => `"${b.id}"`).join(',')
      const msgRes = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?booking_id=in.(${ids})&sender_role=eq.cliente&read_at=is.null&select=booking_id`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (!msgRes.ok) return
      const msgs = await msgRes.json()
      const counts = {}
      msgs.forEach(m => { counts[m.booking_id] = (counts[m.booking_id] || 0) + 1 })
      setUnreadByBooking(counts)
    } catch (err) { console.error('fetchUnreadCounts:', err) }
  }

  // ── Fetch solicitudes pendientes del operador ─────────────────────────────
  const fetchBookingRequests = async () => {
    if (!user) return;
    setLoadingReqs(true);
    try {
      // Paso 1: obtener booking_requests del operador
      const { data: reqs, error } = await supabase
        .from('booking_requests')
        .select('id, booking_id, ronda, status, notified_at, expires_at')
        .eq('operator_id', user.id)
        .eq('status', 'pendiente')
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: true });

      if (error) throw error;
      if (!reqs || reqs.length === 0) { setRequests([]); return; }

      // Paso 2: obtener datos de cada booking por separado
      // La política RLS ya permite ver bookings con request activo
      const bookingIds = reqs.map(r => r.booking_id);
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, booking_ref, service_name, scheduled_date, scheduled_time_from, scheduled_time_to, address_line, total_price')
        .in('id', bookingIds);

      // Combinar requests con datos del booking
      const bookingsMap = Object.fromEntries((bookings || []).map(b => [b.id, b]));
      const combined = reqs.map(r => ({
        ...r,
        booking: bookingsMap[r.booking_id] || null,
      }));

      setRequests(combined);
    } catch (err) {
      console.error('Error cargando solicitudes:', err);
    } finally {
      setLoadingReqs(false);
    }
  };

  // ── Aceptar solicitud ─────────────────────────────────────────────────────
  const handleAcceptRequest = async (request) => {
    setAccepting(request.id);
    setAcceptError('');
    try {
      // Actualizar booking_request a 'aceptado'
      // El trigger en DB se encarga de:
      //   1. Asignar operator_id al booking
      //   2. Cambiar status del booking a 'confirmado'
      //   3. Cancelar las demás solicitudes del mismo booking
      const { error } = await supabase
        .from('booking_requests')
        .update({ status: 'aceptado', responded_at: new Date().toISOString() })
        .eq('id', request.id)
        .eq('status', 'pendiente'); // evitar doble aceptación

      if (error) throw error;

      // Notificar al cliente por WhatsApp
      const b = request.booking;
      if (b) {
        try {
          const { data: bookingFull } = await supabase
            .from('bookings')
            .select('*, customer:client_id(phone, full_name)')
            .eq('id', request.booking_id)
            .single();

          const phone = bookingFull?.customer?.phone;
          if (phone) {
            console.log(`[WA] operator_assigned → ${phone}`);
            sendWhatsApp('operator_assigned', phone, {
              booking_ref:         b.booking_ref,
              service_name:        b.service_name,
              scheduled_date:      b.scheduled_date,
              scheduled_time_from: b.scheduled_time_from,
              scheduled_time_to:   b.scheduled_time_to,
              total_price:         b.total_price,
              operator_name:       profile?.full_name || 'tu operador',
            });
          } else {
            console.warn('[WA] operator_assigned: no se encontró teléfono del cliente');
          }
        } catch (e) { console.warn('No se pudo notificar al cliente:', e.message); }
      }

      // Refrescar listas
      await Promise.all([fetchBookingRequests(), fetchOperatorBookings(true)]);
      fetchUnreadCounts();

      // Cambiar al tab de servicios activos
      setActiveTab('pendientes');

    } catch (err) {
      console.error('Error aceptando solicitud:', err);
      setAcceptError('Error al aceptar. Intenta de nuevo.');
    } finally {
      setAccepting(null);
    }
  };

  // ── updateStatus ──────────────────────────────────────────────────────────
  const updateStatus = async (bookingId, newStatus, eventName, bookingData = null) => {
    if (newStatus === 'en_camino' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => setGpsError(''),
        (err) => { if (err.code === 1) setGpsError('Ubicacion bloqueada.'); else setGpsError('GPS no disponible.'); },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
    setUpdatingId(bookingId);
    const timeoutId = setTimeout(() => { setUpdatingId(null); showToast('La operación tardó demasiado. Verifica tu conexión.', 'warning'); }, 12000);
    try {
      // Usar fetch directo para evitar el lock de Supabase en móvil
      let token = SUPABASE_ANON_KEY
      try {
        const stored = localStorage.getItem('mazclean-auth')
        if (stored) {
          const parsed = JSON.parse(stored)
          token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY
        }
      } catch {}
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ status: newStatus, updated_at: new Date().toISOString() }),
        }
      )
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
      const booking = bookingData || bookings.find(b => b.id === bookingId);
      let phone = booking?.customer?.phone;

      // Si no tiene teléfono, obtenerlo via fetch directo (evita lock en móvil)
      if (!phone) {
        try {
          let token = SUPABASE_ANON_KEY
          try {
            const stored = localStorage.getItem('mazclean-auth')
            if (stored) {
              const parsed = JSON.parse(stored)
              token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY
            }
          } catch {}
          const r = await fetch(
            `${SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=booking_ref,service_name,customer:client_id(phone,full_name)`,
            { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
          )
          if (r.ok) {
            const d = await r.json()
            phone = d?.[0]?.customer?.phone
          }
        } catch {}
      }

      if (phone) {
        console.log(`[WA] ${eventName} → ${phone}`);
        sendWhatsApp(eventName, phone, {
          booking_ref: booking?.booking_ref, service_name: booking?.service_name,
          booking_id: bookingId, operator_name: profile?.full_name || user?.user_metadata?.full_name || 'tu operador',
          total_price: booking?.total_price, scheduled_date: booking?.scheduled_date,
          scheduled_time_from: booking?.scheduled_time_from, scheduled_time_to: booking?.scheduled_time_to,
        });
      } else {
        console.warn(`[WA] ${eventName}: no se encontró teléfono`);
      }
      if (selectedBooking?.id === bookingId) setSelectedBooking(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      clearTimeout(timeoutId);
      showToast('Error al actualizar estado: ' + err.message, 'error');
    } finally { setUpdatingId(null); }
  };

  // ── Fotos ─────────────────────────────────────────────────────────────────
  const PHOTO_STEPS = [
    { step: 1, key: 'front_before',   phase: 'before', label: 'Foto 1 de 4 — Frontal ANTES',    desc: 'Captura el frente del auto con la placa visible', color: '#f97316' },
    { step: 2, key: 'side_before',    phase: 'before', label: 'Foto 2 de 4 — Lateral ANTES',    desc: 'Captura el lado mas expuesto del auto',           color: '#f97316' },
    { step: 3, key: 'front_after',    phase: 'after',  label: 'Foto 3 de 4 — Frontal DESPUES',  desc: 'Captura el frente del auto ya lavado',            color: '#10b981' },
    { step: 4, key: 'interior_after', phase: 'after',  label: 'Foto 4 de 4 — Interior DESPUES', desc: 'Captura el interior o cajuela segun el servicio', color: '#10b981' },
  ];

  const handleStartWashing = async (booking) => {
    await updateStatus(booking.id, 'en_proceso', 'washing', booking);
    const updated = { ...booking, status: 'en_proceso' };
    const existing = {};
    if (updated.photo_front_before) existing.front_before = updated.photo_front_before;
    if (updated.photo_side_before)  existing.side_before  = updated.photo_side_before;
    setPhotoBooking(updated); setPhotosData(existing); setPhotoStep(1); setPhotoPhase('before');
    setUploadError(''); setUploadProgress(''); setUploadingPhoto(false); setPhotoModalSafe(true);
  };

  const handleFinalizeClick = (booking) => {
    if (!booking.photo_front_before || !booking.photo_side_before) {
      showToast('Debes subir las fotos ANTES del servicio primero.', 'warning');
      return;
    }
    const existing = {};
    if (booking.photo_front_after)    existing.front_after    = booking.photo_front_after;
    if (booking.photo_interior_after) existing.interior_after = booking.photo_interior_after;
    setPhotoBooking(booking); setPhotosData(existing); setPhotoStep(3); setPhotoPhase('after');
    setPendingFinalize(booking.id); setUploadError(''); setUploadProgress(''); setUploadingPhoto(false); setPhotoModalSafe(true);

    // WA 'done' se envía una sola vez al finalizar en updateStatus — no aquí
  };

  const closePhotoModal = async (bookingOverride = null) => {
    const currentPending = pendingFinalize;
    const bookingForChecklist = bookingOverride || bookings.find(b => b.id === currentPending);
    console.log('[CHECKLIST] currentPending:', currentPending);
    console.log('[CHECKLIST] bookingForChecklist:', bookingForChecklist?.id, 'service_id:', bookingForChecklist?.service_id);
    sessionStorage.removeItem('photoModal');
    setPhotoModalSafe(false); setPhotosData({}); setPhotoBooking(null);
    if (currentPending) {
      if (!bookingForChecklist) { console.log('[CHECKLIST] No se encontró booking'); setPendingFinalize(null); return; }
      const items = await loadChecklist(bookingForChecklist);
      console.log('[CHECKLIST] items:', items);
      if (!items) { setPendingFinalize(null); await updateStatus(currentPending, 'finalizado', 'done', bookingForChecklist); return; }
      setChecklist(items); setChecklistModal(true);
    }
  };

  const handleNextPhotoStep = () => {
    if (photoStep === 1 && photoPhase === 'before') { setPhotoStep(2); }
    else if (photoStep === 2 && photoPhase === 'before') { savePhotosMeta(photoBooking.id); setPhotoModalSafe(false); setPhotosData({}); setPhotoBooking(null); }
    else if (photoStep === 3 && photoPhase === 'after') { setPhotoStep(4); }
    else if (photoStep === 4 && photoPhase === 'after') { savePhotosMeta(photoBooking.id); closePhotoModal(photoBooking); }
  };

  const savePhotosMeta = (bookingId) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      supabase.from('bookings').update({ photos_geo_lat: pos.coords.latitude, photos_geo_lng: pos.coords.longitude, photos_completed_at: new Date().toISOString() }).eq('id', bookingId).then(() => {});
    }, () => { supabase.from('bookings').update({ photos_completed_at: new Date().toISOString() }).eq('id', bookingId).then(() => {}); });
  };

  const loadChecklist = async (booking) => {
    try {
      // Usar fetch directo para evitar el lock de Supabase en móvil
      let token = SUPABASE_ANON_KEY
      try {
        const stored = localStorage.getItem('mazclean-auth')
        if (stored) {
          const parsed = JSON.parse(stored)
          token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY
        }
      } catch {}
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/service_checklist?service_id=eq.${booking.service_id}&order=sort_order.asc`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          }
        }
      )
      if (!res.ok) return null
      const data = await res.json()
      if (!data || data.length === 0) return null
      return data.map(item => ({ ...item, checked: false }))
    } catch (err) {
      console.error('[CHECKLIST] Error loadChecklist:', err)
      return null
    }
  };

  const toggleCheckItem = (id) => { setChecklist(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item)); };

  const confirmFinalize = async () => {
    if (!checklist.every(item => item.checked)) { showToast('Por favor completa todos los ítems del checklist.', 'warning'); return; }
    const bookingToFinalize = pendingFinalize;
    const bookingData = bookings.find(b => b.id === bookingToFinalize);
    setChecklistModal(false);
    setPendingFinalize(null);
    setChecklist([]);
    setPhotoModalSafe(false);
    setPhotosData({});
    setPhotoBooking(null);
    await updateStatus(bookingToFinalize, 'finalizado', 'done', bookingData);
  };




  const handleNewPhotoUpload = async (file, bookingId, type) => {
    if (!file || !bookingId || !type) return;

    const TYPE_TO_COLUMN = {
      front_before:   'photo_front_before',
      side_before:    'photo_side_before',
      front_after:    'photo_front_after',
      interior_after: 'photo_interior_after',
    };

    setUploadingPhoto(true);
    setUploadError('');
    setUploadProgress(0);

    try {
      const column = TYPE_TO_COLUMN[type] || type;

      // Token fresco desde localStorage sin llamar getSession() para no romper el lock
      let token = sessionToken;
      try {
        const stored = localStorage.getItem('mazclean-auth')
        if (stored) {
          const parsed = JSON.parse(stored)
          token = parsed?.access_token || parsed?.session?.access_token || sessionToken
        }
      } catch {}

      const uploadedPath = await uploadFile({
        file,
        folder: bookingId,
        userId: type,
        onProgress: (perc) => setUploadProgress(perc),
      });

      const { error: dbErr } = await supabase
        .from('bookings')
        .update({ [column]: uploadedPath, updated_at: new Date().toISOString() })
        .eq('id', bookingId);
      if (dbErr) throw dbErr;

      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, [column]: uploadedPath } : b));
      if (selectedBooking?.id === bookingId) setSelectedBooking(prev => ({ ...prev, [column]: uploadedPath }));
      if (photoBooking?.id === bookingId) setPhotoBooking(prev => ({ ...prev, [column]: uploadedPath }));
      setPhotosData(prev => ({ ...prev, [type]: uploadedPath }));
      setUploadProgress(100);

    } catch (err) {
      console.error('Error subida foto:', err);
      setUploadError(err.message || 'Error al subir la foto. Intenta de nuevo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const sendIncidentReport = async () => {
    if (!incidentNote.trim()) { showToast('Describe el problema antes de enviar.', 'warning'); return; }
    setSendingIncident(true);
    try {
      const { error } = await supabase.from('incidents').insert({ booking_id: incidentBooking.id, operator_id: user.id, description: incidentNote, status: 'abierto', created_at: new Date().toISOString() });
      if (error) throw error;
      showToast('Incidencia reportada al administrador.', 'success');
      setIncidentModal(false); setIncidentNote(''); setIncidentBooking(null);
    } catch (err) { showToast('Error: ' + err.message, 'error'); }
    finally { setSendingIncident(false); }
  };

  const openInMaps = (address) => { if (!address) return; window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address), '_blank'); };
  const getPhotoUrl = (path) => { if (!path) return null; return path.startsWith('http') ? path : SUPABASE_URL + '/storage/v1/object/public/service-photos/' + path; };

  // ── Listas filtradas ──────────────────────────────────────────────────────
  const pendingServices   = bookings.filter(b => b.status === 'confirmado');
  const activeServices    = bookings.filter(b => ['en_camino', 'en_proceso'].includes(b.status));
  const completedServices = bookings.filter(b => b.status === 'finalizado');
  const pendingRequests   = requests.filter(r => r.status === 'pendiente' && getAbsoluteUTCMs(r.expires_at) > Date.now());

  const currentList = activeTab === 'pendientes'  ? pendingServices
                    : activeTab === 'activos'     ? activeServices
                    : activeTab === 'completados' ? completedServices
                    : [];

  const getStatusStyle = (status) => {
    switch (status) {
      case 'confirmado': return { bg: '#dbeafe', text: '#1e40af', label: 'Confirmado' };
      case 'en_camino':  return { bg: '#e0e7ff', text: '#3730a3', label: 'En camino'  };
      case 'en_proceso': return { bg: '#ffedd5', text: '#9a3412', label: 'Lavando'    };
      case 'finalizado': return { bg: '#dcfce7', text: '#166534', label: 'Finalizado' };
      default:           return { bg: '#f3f4f6', text: '#374151', label: status       };
    }
  };

  const currentPhotoConfig = PHOTO_STEPS.find(p => p.step === photoStep) || PHOTO_STEPS[0];
  const currentPhotoKey    = currentPhotoConfig.key;
  const currentPhotoSaved  = !!photosData[currentPhotoKey];
  const photoBtnLabel      = uploadingPhoto ? (uploadProgress || 'Subiendo...') : currentPhotoSaved ? 'Cambiar foto' : 'Tomar foto';
  const canAdvancePhoto    = currentPhotoSaved && !uploadingPhoto;

  // effectiveProfile movido antes de pantalla de activación

  // ── Tabs con el nuevo "Solicitudes" primero ───────────────────────────────
  const tabs = [
    { id: 'solicitudes',  label: 'Solicitudes', icon: '🔔', count: pendingRequests.length },
    { id: 'pendientes',   label: 'Pendientes',  icon: '📋', count: pendingServices.length },
    { id: 'activos',      label: 'Activos',     icon: '⚡', count: activeServices.length },
    { id: 'completados',  label: 'Historial',   icon: '📖', count: completedServices.length },
    { id: 'micuenta',     label: 'Mi Cuenta',   icon: '💰', count: 0 },
    { id: 'horarios',     label: 'Mi Configuración', icon: '⚙️', count: 0 },
  ];

  // ── Mis Horarios: funciones ─────────────────────────────────────────────
  const fetchExceptions = async () => {
    setExcLoading(true)
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/operator_exceptions?operator_id=eq.${user?.id}&order=start_datetime.asc&select=*`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (res.ok) setExceptions(await res.json())
    } catch {}
    setExcLoading(false)
  }

  const saveException = async () => {
    setExcError('')
    if (!excStartDate) { setExcError('Selecciona la fecha de inicio'); return }
    if (excType === 'vacation' && !excEndDate) { setExcError('Selecciona la fecha de regreso'); return }
    const startDt = excType === 'day_off'
      ? `${excStartDate}T${excStartTime}:00`
      : `${excStartDate}T00:00:00`
    const endDt = excType === 'day_off'
      ? `${excStartDate}T${excEndTime}:00`
      : `${excEndDate}T23:59:59`
    try {
      const conflictRes = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?operator_id=eq.${user?.id}&status=in.(confirmado,en_camino,en_proceso)&select=booking_ref,scheduled_date,scheduled_time_from`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (conflictRes.ok) {
        const bookings = await conflictRes.json()
        const conflicts = bookings.filter(b => {
          const bDate = new Date(`${b.scheduled_date}T${b.scheduled_time_from}`)
          return bDate >= new Date(startDt) && bDate <= new Date(endDt)
        })
        if (conflicts.length > 0) {
          setExcError(`Tienes ${conflicts.length} servicio(s) activo(s) en ese período: ${conflicts.map(b => b.booking_ref).join(', ')}`)
          return
        }
      }
    } catch {}
    setExcSaving(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/operator_exceptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ operator_id: user.id, exception_type: excType, start_datetime: startDt, end_datetime: endDt, reason: excReason || null }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      showToast('Excepción guardada correctamente', 'success')
      setExcStartDate(''); setExcEndDate(''); setExcReason('')
      await fetchExceptions()
    } catch (err) { setExcError(err.message) }
    setExcSaving(false)
  }

  const deleteException = async (id) => {
    if (!confirm('¿Eliminar esta excepción?')) return
    await fetch(`${SUPABASE_URL}/rest/v1/operator_exceptions?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY },
    })
    setExceptions(prev => prev.filter(e => e.id !== id))
    showToast('Excepción eliminada', 'success')
  }

  const saveScheduleChange = async () => {
    setScheduleError('')
    if (newWorkDays.length === 0) { setScheduleError('Selecciona al menos un día'); return }
    if (newWorkStart >= newWorkEnd) { setScheduleError('La hora de inicio debe ser antes del cierre'); return }
    if (newWorkStart < '06:00' || newWorkEnd > '21:00') { setScheduleError('El horario debe estar entre 6:00 am y 9:00 pm'); return }
    setSavingSchedule(true)
    try {
      // Token desde localStorage — patrón establecido para móvil
      let token = SUPABASE_ANON_KEY
      try {
        const stored = localStorage.getItem('mazclean-auth')
        if (stored) { const p = JSON.parse(stored); token = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY }
      } catch {}
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ work_days: newWorkDays, work_start: newWorkStart, work_end: newWorkEnd, updated_at: new Date().toISOString() }),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error('HTTP ' + res.status + (body ? ': ' + body.slice(0, 120) : ''))
      }
      showToast('Horario actualizado correctamente ✅', 'success')
    } catch (err) { setScheduleError(err.message) }
    setSavingSchedule(false)
  }

  // Inicializar horario editable con valores del perfil
  useEffect(() => {
    if (profile?.work_days) setNewWorkDays(profile.work_days)
    if (profile?.work_start) setNewWorkStart(profile.work_start.slice(0,5))
    if (profile?.work_end)   setNewWorkEnd(profile.work_end.slice(0,5))
  }, [profile?.id])

  // Cargar excepciones cuando está activo el tab
  useEffect(() => {
    if (user && activeTab === 'horarios') { fetchExceptions(); fetchZoneRequest() }
  }, [activeTab, user?.id])

  // Generar mapa estático cuando cambia la ubicación del formulario de zona
  useEffect(() => {
    const { new_lat, new_lng, new_radius } = zoneForm
    if (new_lat && new_lng) {
      const delta = new_radius > 10 ? 0.08 : new_radius > 5 ? 0.05 : 0.02
      const url = `https://www.openstreetmap.org/export/embed.html?bbox=${new_lng - delta},${new_lat - delta},${new_lng + delta},${new_lat + delta}&layer=mapnik&marker=${new_lat},${new_lng}`
      setZoneMapUrl(url)
    } else {
      setZoneMapUrl(null)
    }
  }, [zoneForm.new_lat, zoneForm.new_lng, zoneForm.new_radius])

  // ── Solicitud cambio de zona ─────────────────────────────────────────────
  // ── Historial de billing ─────────────────────────────────────────────────
  const [billingHistory, setBillingHistory] = useState([])
  const [loadingBilling, setLoadingBilling] = useState(false)

  const fetchBillingHistory = async () => {
    if (!user?.id) return
    setLoadingBilling(true)
    try {
      const token = getToken()
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/operator_billing?operator_id=eq.${user.id}&order=period_start.desc&limit=12`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (res.ok) setBillingHistory(await res.json())
    } catch (err) { console.error('fetchBillingHistory:', err) }
    finally { setLoadingBilling(false) }
  }

  const fetchZoneRequest = async () => {
    if (!user?.id) return
    try {
      const token = getToken()
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/operator_zone_requests?operator_id=eq.${user.id}&status=eq.pendiente&order=created_at.desc&limit=1`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (res.ok) { const data = await res.json(); setZoneRequest(data[0] || null) }
    } catch (err) { console.error('fetchZoneRequest:', err) }
  }

  const submitZoneRequest = async () => {
    if (!zoneForm.new_address.trim()) { setZoneError('Ingresa la nueva dirección.'); return }
    if (!zoneForm.new_lat || !zoneForm.new_lng) { setZoneError('Confirma la dirección en el mapa primero.'); return }
    if (!zoneForm.reason_type) { setZoneError('Selecciona el motivo del cambio.'); return }
    setSavingZone(true); setZoneError(''); setZoneSuccess('')
    try {
      const token = getToken()
      const res = await fetch(`${SUPABASE_URL}/rest/v1/operator_zone_requests`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          operator_id:     user.id,
          current_address: profile?.base_address || null,
          current_lat:     profile?.base_lat || null,
          current_lng:     profile?.base_lng || null,
          current_radius:  profile?.coverage_radius || null,
          new_address:     zoneForm.new_address,
          new_lat:         zoneForm.new_lat,
          new_lng:         zoneForm.new_lng,
          new_radius:      parseInt(zoneForm.new_radius) || 3,
          reason_type:     zoneForm.reason_type,
          reason_detail:   zoneForm.reason_detail || null,
          status:          'pendiente',
          updated_at:      new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setZoneSuccess('✅ Solicitud enviada. El administrador la revisará pronto.')
      setZoneForm({ new_address: '', new_lat: null, new_lng: null, new_radius: 3, reason_type: 'cambio_domicilio', reason_detail: '' })
      await fetchZoneRequest()
    } catch (err) { setZoneError('Error al enviar: ' + err.message) }
    finally { setSavingZone(false) }
  }

  const geocodeZoneAddress = async () => {
    if (!zoneForm.new_address.trim()) { setZoneError('Escribe una dirección primero.'); return }
    setZoneError('')
    try {
      const query = encodeURIComponent(zoneForm.new_address.trim() + ', México')
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&accept-language=es`, { headers: { 'Accept-Language': 'es' } })
      const data = await res.json()
      if (!data || data.length === 0) { setZoneError('No se encontró la dirección. Intenta ser más específico.'); return }
      setZoneForm(p => ({ ...p, new_lat: parseFloat(data[0].lat), new_lng: parseFloat(data[0].lon), new_address: data[0].display_name || p.new_address }))
      setZoneError('')
    } catch { setZoneError('Error al buscar la dirección. Verifica tu conexión.') }
  }

  // ── RENDER ────────────────────────────────────────────────────────────────
  // Academia — aquí ya están declaradas todas las variables
  if (showAcademia) return <AcademiaView onBack={() => setShowAcademia(false)} />;

  // Pantalla de activación — aquí ya están declaradas todas las variables
  const needsCertification = !profile?.is_certified
  const needsMembership    = operatorMembership?.membership_status !== 'activa' && profile?.membership_status !== 'activa'
  const isApproved         = profile?.operator_status === 'aprobado'

  // Si hay promo de $0 y membresía no activa → activar automáticamente
  const hasFreeMembership = effectiveMembershipPrice === 0 || effectiveMembershipPrice === '0'

  if (isApproved && profile?.role !== 'admin' && needsMembership && hasFreeMembership) {
    // Activar membresía gratuita automáticamente sin pasar por Stripe
    const activateFreeMembership = async () => {
      try {
        let token = SUPABASE_ANON_KEY
        try {
          const stored = localStorage.getItem('mazclean-auth')
          if (stored) { const p = JSON.parse(stored); token = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY }
        } catch {}
        const end = new Date(); end.setDate(end.getDate() + (membershipConfig?.operator_duration_days || 30))
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ membership_status: 'activa', membership_start_at: new Date().toISOString(), membership_end_at: end.toISOString(), membership_type: 'promo_gratuita', updated_at: new Date().toISOString() }),
        })
        await loadProfileDirect()
      } catch (err) { console.error('activateFreeMembership:', err) }
    }
    activateFreeMembership()
  }

  if (isApproved && profile?.role !== 'admin' && (needsCertification || needsMembership) && !showAcademia) {
    return (
      <ActivationScreen
        profile={profile}
        membershipStatus={operatorMembership?.membership_status || profile?.membership_status}
        membershipPrice={effectiveMembershipPrice}
        effectivePromo={effectivePromo}
        payingMembership={payingMembership}
        onSubscribe={effectiveMembershipPrice === 0 ? null : handleSubscribeOperator}
        onDeposit={() => setDepositModal(true)}
        onAcademia={() => setShowAcademia(true)}
        onSignOut={() => signOut()}
      />
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', paddingBottom: isMobile ? 72 : 80 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: isMobile ? '20px 16px 16px' : '32px 24px 28px', borderRadius: '0 0 24px 24px', boxShadow: '0 4px 24px rgba(30,64,175,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? 0 : 20 }}>
          <div>
            <h1 style={{ color: '#fff', fontSize: isMobile ? 18 : 22, fontWeight: 700, margin: '0 0 4px' }}>🚗 Mis Servicios</h1>
            <p style={{ color: '#bfdbfe', fontSize: 13, margin: 0 }}>Hola, {user?.user_metadata?.full_name || profile?.full_name || 'Operador'}</p>
            {/* ── Chip de membresía colapsable ── */}
            {effectiveProfile && (
              <div style={{ marginTop: 8 }}>
                {/* Chip — siempre visible, toque para expandir */}
                <button onClick={() => {
                  setMembershipPanelOpen(p => !p)
                  if (!showMembershipHistory) fetchMembershipHistory()
                }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', minHeight: 30,
                  background: effectiveProfile.membership_status === 'activa'
                    ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.25)',
                  border: effectiveProfile.membership_status === 'activa'
                    ? '1px solid rgba(16,185,129,0.5)' : '1px solid rgba(245,158,11,0.5)',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700,
                    color: effectiveProfile.membership_status === 'activa' ? '#6ee7b7' : '#fde68a' }}>
                    {effectiveProfile.membership_status === 'activa'
                      ? `💳 Activa · vence ${new Date(effectiveProfile.membership_end_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`
                      : effectiveProfile.membership_status === 'vencida'
                        ? '⚠️ Membresía vencida'
                        : '⚠️ Sin membresía activa'}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>
                    {membershipPanelOpen ? '▲' : '▼'}
                  </span>
                </button>

                {/* Record de miembro — siempre visible, pequeño */}
                {effectiveProfile.membership_record_since && (
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginLeft: 8 }}>
                    🏅 desde {new Date(effectiveProfile.membership_record_since).toLocaleDateString('es-MX', { year: 'numeric', month: 'short' })}
                  </span>
                )}

                {/* Panel expandible */}
                {membershipPanelOpen && (
                  <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.2)', borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Promo si aplica */}
                    {effectivePromo?.promo_name && (
                      <div style={{ background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 10, padding: '6px 10px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#6ee7b7' }}>🏷️ {effectivePromo.promo_name}</div>
                        <div style={{ fontSize: 10, color: '#d1fae5' }}>
                          {effectivePromo.discount_type === 'precio_fijo' && `Precio especial: $${effectivePromo.effective_price} MXN`}
                          {effectivePromo.discount_type === 'porcentaje' && `${effectivePromo.discount_value}% descuento → $${effectivePromo.effective_price} MXN`}
                          {effectivePromo.discount_type === 'dias_gratis' && `${effectivePromo.trial_days} días gratis incluidos`}
                        </div>
                      </div>
                    )}
                    {/* Botones de pago si no está activa */}
                    {effectiveProfile.membership_status !== 'activa' && (
                      <>
                        {payError && <div style={{ fontSize: 10, color: '#fca5a5' }}>⚠️ {payError}</div>}
                        <button onClick={handleSubscribeOperator} disabled={payingMembership}
                          style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 700, cursor: payingMembership ? 'not-allowed' : 'pointer', minHeight: 38 }}>
                          {payingMembership ? '⏳ Redirigiendo...' : `💳 Pagar con tarjeta $${effectivePromo?.effective_price || membershipConfig?.operator_price || 200} MXN/mes`}
                        </button>
                        <button onClick={() => { setDepositModal(true); setDepositSuccess(false); setDepositError('') }}
                          style={{ padding: '8px 14px', background: 'rgba(16,185,129,0.15)', border: '1.5px solid rgba(16,185,129,0.4)', borderRadius: 10, color: '#6ee7b7', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 38 }}>
                          🏦 Pagar con depósito bancario
                        </button>
                      </>
                    )}
                    {/* Renovar anticipado — siempre visible con ambas opciones de pago */}
                    {effectiveProfile.membership_status === 'activa' && effectiveProfile.membership_end_at && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          🔄 Renovar anticipado · {Math.ceil((new Date(effectiveProfile.membership_end_at) - new Date()) / 86400000)}d restantes
                        </div>
                        {payError && <div style={{ fontSize: 10, color: '#fca5a5' }}>⚠️ {payError}</div>}
                        <button onClick={handleSubscribeOperator} disabled={payingMembership}
                          style={{ padding: '8px 14px', background: 'rgba(251,191,36,0.2)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 10, color: '#fde68a', fontSize: 12, fontWeight: 700, cursor: payingMembership ? 'not-allowed' : 'pointer', minHeight: 38 }}>
                          {payingMembership ? '⏳ Redirigiendo...' : `💳 Renovar con tarjeta $${effectiveMembershipPrice} MXN`}
                        </button>
                        <button onClick={() => { setDepositModal(true); setDepositSuccess(false); setDepositError('') }}
                          style={{ padding: '8px 14px', background: 'rgba(16,185,129,0.15)', border: '1.5px solid rgba(16,185,129,0.4)', borderRadius: 10, color: '#6ee7b7', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 38 }}>
                          🏦 Renovar con depósito/transferencia
                        </button>
                      </div>
                    )}
                    {/* Cancelar */}
                    {effectiveProfile.membership_status === 'activa' && (
                      <button onClick={handleCancelMembership} disabled={cancellingMembership}
                        style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#fca5a5', fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 34 }}>
                        {cancellingMembership ? '⏳...' : '✕ Cancelar membresía'}
                      </button>
                    )}
                    {/* Historial */}
                    <button onClick={() => { setShowMembershipHistory(p => !p); if (!showMembershipHistory) fetchMembershipHistory() }}
                      style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 34 }}>
                      {showMembershipHistory ? '▲ Ocultar historial' : '📋 Historial membresías'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            <button onClick={() => signOut()} style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', minHeight: 44 }}>
              <LogOut size={16} />
            </button>
            {profile?.is_certified && (
              <button onClick={() => { setShowInfografias(true); fetchInfografias(); }}
                style={{ background: 'rgba(6,182,212,0.2)', border: '1.5px solid rgba(6,182,212,0.5)', borderRadius: 10, padding: '7px 12px', cursor: 'pointer', color: '#67e8f9', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, minHeight: 36, whiteSpace: 'nowrap' }}>
                🖼️ Mis Guías
              </button>
            )}
          </div>
        </div>

        {/* Panel historial membresías */}
        {showMembershipHistory && (
          <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 16px', marginBottom: 12, border: '1px solid rgba(255,255,255,0.2)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 8 }}>📋 Historial de membresías</div>
            {membershipHistory.length === 0 ? (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>Sin historial registrado aún.</div>
            ) : membershipHistory.map((h, i) => (
              <div key={h.id || i} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 10px', marginBottom: 6, border: `1px solid ${h.status === 'activa' ? 'rgba(16,185,129,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: h.status === 'activa' ? '#6ee7b7' : 'rgba(255,255,255,0.6)' }}>
                    {h.status === 'activa' ? '✅ Activa' : '⚫ Vencida'}
                  </span>
                  {h.amount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#6ee7b7' }}>${h.amount} MXN</span>}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                  {new Date(h.start_at).toLocaleDateString('es-MX')} → {new Date(h.end_at).toLocaleDateString('es-MX')}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isMobile && (
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.15)', padding: 4, borderRadius: 14, gap: 4, marginTop: 16 }}>
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: activeTab === tab.id ? '#fff' : 'transparent', color: activeTab === tab.id ? '#1e40af' : '#bfdbfe', boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.12)' : 'none', position: 'relative' }}>
                {tab.label} {tab.count > 0 ? `(${tab.count})` : ''}
                {tab.id === 'solicitudes' && tab.count > 0 && (
                  <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contenido */}
      <div style={{ padding: isMobile ? '16px 12px' : '20px 16px', maxWidth: 600, margin: '0 auto' }}>

        {gpsError && (
          <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 13 }}>Permiso de ubicacion requerido</div>
            <div style={{ fontSize: 12, color: '#7f1d1d' }}>{gpsError}</div>
            <button onClick={() => window.location.reload()} style={{ marginTop: 8, padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Reintentar</button>
          </div>
        )}

        {fetchError && (
          <div style={{ background: '#fef9c3', border: '1.5px solid #fde68a', borderRadius: 12, padding: '14px 16px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#854d0e', fontWeight: 600 }}>{fetchError}</span>
            <button onClick={() => fetchOperatorBookings()} style={{ padding: '8px 16px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Reintentar</button>
          </div>
        )}

        {/* ── TAB MI CUENTA ── */}

        {/* ── TABS MI CUENTA + MI CONFIGURACION ── */}
        <OperatorAccount
          activeTab={activeTab}
          commissionData={commissionData} loadingCommission={loadingCommission}
          ratingData={ratingData}
          effectiveProfile={effectiveProfile} membershipConfig={membershipConfig} effectivePromo={effectivePromo}
          membershipHistory={membershipHistory} showMembershipHistory={showMembershipHistory} setShowMembershipHistory={setShowMembershipHistory}
          payingMembership={payingMembership} payError={payError}
          cancellingMembership={cancellingMembership}
          handleSubscribeOperator={handleSubscribeOperator}
          handleDepositRequest={handleDepositRequest}
          handleCancelMembership={handleCancelMembership}
          fetchMembershipHistory={fetchMembershipHistory}
          setDepositModal={setDepositModal}
          excTab={excTab} setExcTab={setExcTab}
          exceptions={exceptions} excLoading={excLoading}
          excType={excType} setExcType={setExcType}
          excStartDate={excStartDate} setExcStartDate={setExcStartDate}
          excEndDate={excEndDate} setExcEndDate={setExcEndDate}
          excStartTime={excStartTime} setExcStartTime={setExcStartTime}
          excEndTime={excEndTime} setExcEndTime={setExcEndTime}
          excReason={excReason} setExcReason={setExcReason}
          excSaving={excSaving} excError={excError}
          saveException={saveException} deleteException={deleteException}
          newWorkDays={newWorkDays} setNewWorkDays={setNewWorkDays}
          newWorkStart={newWorkStart} setNewWorkStart={setNewWorkStart}
          newWorkEnd={newWorkEnd} setNewWorkEnd={setNewWorkEnd}
          savingSchedule={savingSchedule} scheduleError={scheduleError}
          saveScheduleChange={saveScheduleChange}
          zoneRequest={zoneRequest} zoneForm={zoneForm} setZoneForm={setZoneForm}
          savingZone={savingZone} zoneSuccess={zoneSuccess} zoneError={zoneError}
          submitZoneRequest={submitZoneRequest} geocodeZoneAddress={geocodeZoneAddress}
          profile={profile} isMobile={isMobile}
          onUploadLifeVideo={handleUploadLifeVideo}
          lifeVideoUploading={lifeVideoUploading}
          lifeVideoProgress={lifeVideoProgress}
          lifeVideoError={lifeVideoError}
          billingHistory={billingHistory} loadingBilling={loadingBilling} fetchBillingHistory={fetchBillingHistory}
        />
        {/* ── TAB SOLICITUDES ── */}
        {activeTab === 'solicitudes' && (
          <div style={{ display: 'grid', gap: 12 }}>
            {loadingReqs ? (
              <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                <p style={{ color: '#9ca3af' }}>Cargando solicitudes...</p>
              </div>
            ) : pendingRequests.length === 0 ? (
              <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🔔</div>
                <p style={{ color: '#1f2937', fontWeight: 700, fontSize: 16, margin: '0 0 8px' }}>Sin solicitudes pendientes</p>
                <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>Cuando un cliente solicite un servicio en tu zona y horario, aparecerá aquí.</p>
              </div>
            ) : (
              <>
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Bell size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                  <p style={{ fontSize: 13, color: '#92400e', margin: 0, lineHeight: 1.4 }}>
                    Tienes <strong>{pendingRequests.length}</strong> solicitud{pendingRequests.length > 1 ? 'es' : ''} pendiente{pendingRequests.length > 1 ? 's' : ''}. El primero en aceptar se queda con el servicio.
                  </p>
                  <button onClick={fetchBookingRequests} style={{ background: 'none', border: 'none', color: '#f59e0b', cursor: 'pointer', fontSize: 18, flexShrink: 0 }}>↻</button>
                </div>
                {acceptError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 14, color: '#dc2626' }}>⚠️ {acceptError}</div>
                )}
                {pendingRequests.map(req => (
                  <RequestCard
                    key={req.id}
                    request={req}
                    onAccept={handleAcceptRequest}
                    accepting={accepting}
                    isMobile={isMobile}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* ── TAB MIS HORARIOS ── */}
        {activeTab === 'horarios' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Sub-tabs: Excepciones / Horario permanente / Mi Zona */}
            <div style={{ display: 'flex', background: '#e5e7eb', borderRadius: 12, padding: 4, gap: 4 }}>
              <button onClick={() => setExcTab('excepciones')}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                  background: excTab === 'excepciones' ? '#fff' : 'transparent',
                  color:      excTab === 'excepciones' ? '#1e40af' : '#6b7280',
                  boxShadow:  excTab === 'excepciones' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                📅 Excepciones
              </button>
              <button onClick={() => setExcTab('horario')}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                  background: excTab === 'horario' ? '#fff' : 'transparent',
                  color:      excTab === 'horario' ? '#1e40af' : '#6b7280',
                  boxShadow:  excTab === 'horario' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                🕐 Horario
              </button>
              <button onClick={() => setExcTab('zona')}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                  background: excTab === 'zona' ? '#fff' : 'transparent',
                  color:      excTab === 'zona' ? '#1e40af' : '#6b7280',
                  boxShadow:  excTab === 'zona' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                🗺️ Mi Zona
              </button>
            </div>

            {/* ── SUB-TAB EXCEPCIONES ── */}
            {excTab === 'excepciones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Formulario nueva excepción */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '18px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1f2937', marginBottom: 14 }}>➕ Nueva excepción</div>

                  {/* Tipo */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Tipo</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { v: 'day_off',  label: '🚫 Pausa horario' },
                        { v: 'vacation', label: '🏖️ Vacaciones' },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setExcType(opt.v)}
                          style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: `2px solid ${excType === opt.v ? '#3b82f6' : '#e5e7eb'}`,
                            background: excType === opt.v ? '#eff6ff' : '#f9fafb',
                            color: excType === opt.v ? '#1e40af' : '#374151',
                            fontWeight: 700, fontSize: 12, cursor: 'pointer', minHeight: 44 }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fecha inicio */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>
                      {excType === 'day_off' ? 'Fecha' : 'Fecha de inicio'}
                    </label>
                    <input type="date" value={excStartDate} onChange={e => setExcStartDate(e.target.value)}
                      min={new Date().toISOString().slice(0,10)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>

                  {/* Horas (solo day_off) */}
                  {excType === 'day_off' && (
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Hora inicio</label>
                        <input type="time" value={excStartTime} onChange={e => setExcStartTime(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Hora fin</label>
                        <input type="time" value={excEndTime} onChange={e => setExcEndTime(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                      </div>
                    </div>
                  )}

                  {/* Fecha fin (solo vacation) */}
                  {excType === 'vacation' && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Fecha de regreso</label>
                      <input type="date" value={excEndDate} onChange={e => setExcEndDate(e.target.value)}
                        min={excStartDate || new Date().toISOString().slice(0,10)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    </div>
                  )}

                  {/* Motivo */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Motivo (opcional)</label>
                    <input type="text" value={excReason} onChange={e => setExcReason(e.target.value)}
                      placeholder="Ej: Cita médica, vacaciones familiares..."
                      maxLength={120}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>

                  {excError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
                      ⚠️ {excError}
                    </div>
                  )}

                  <button onClick={saveException} disabled={excSaving}
                    style={{ width: '100%', padding: '13px 0', background: excSaving ? '#9ca3af' : 'linear-gradient(135deg,#1e40af,#3b82f6)',
                      color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      cursor: excSaving ? 'not-allowed' : 'pointer', minHeight: 48 }}>
                    {excSaving ? '⏳ Guardando...' : '💾 Guardar excepción'}
                  </button>
                </div>

                {/* Lista de excepciones activas */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937', marginBottom: 12 }}>
                    📋 Excepciones registradas
                  </div>
                  {excLoading ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 14 }}>⏳ Cargando...</div>
                  ) : exceptions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 14 }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                      Sin excepciones registradas. Tu horario está activo normalmente.
                    </div>
                  ) : exceptions.map(exc => {
                    const typeLabel = exc.exception_type === 'day_off' ? '🚫 Pausa' : '🏖️ Vacaciones';
                    const from = new Date(exc.start_datetime).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
                    const to   = new Date(exc.end_datetime).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
                    const isActive = new Date(exc.end_datetime) > new Date();
                    return (
                      <div key={exc.id} style={{ background: isActive ? '#f0fdf4' : '#f9fafb', border: `1px solid ${isActive ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#1f2937', marginBottom: 4 }}>{typeLabel}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                            {from} → {to}
                            {exc.reason && <div style={{ marginTop: 2, fontStyle: 'italic' }}>"{exc.reason}"</div>}
                          </div>
                        </div>
                        {isActive && (
                          <button onClick={() => deleteException(exc.id)}
                            style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#dc2626', fontWeight: 700, cursor: 'pointer', flexShrink: 0, minHeight: 36 }}>
                            🗑️
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── SUB-TAB MI ZONA ── */}
            {excTab === 'zona' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Zona actual */}
                <div style={{ background: '#f0fdf4', borderRadius: 14, padding: '14px 16px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>📍 Tu zona actual</div>
                  {profile?.base_address ? (
                    <div style={{ fontSize: 13, color: '#374151' }}>
                      <div>{profile.base_address}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Radio de cobertura: {profile?.coverage_radius || '—'} km</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>Sin zona configurada</div>
                  )}
                </div>

                {/* Solicitud pendiente activa */}
                {zoneRequest && (
                  <div style={{ background: '#fffbeb', borderRadius: 14, padding: '14px 16px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>⏳ Solicitud pendiente</div>
                    <div style={{ fontSize: 12, color: '#78350f' }}>
                      <div>Nueva dirección: {zoneRequest.new_address}</div>
                      <div style={{ marginTop: 3 }}>Radio solicitado: {zoneRequest.new_radius} km</div>
                      <div style={{ marginTop: 3 }}>Motivo: {{
                        cambio_domicilio: 'Cambio de domicilio',
                        ampliar_zona: 'Ampliar zona de cobertura',
                        reducir_zona: 'Reducir zona de cobertura',
                        otro: 'Otro motivo'
                      }[zoneRequest.reason_type]}</div>
                      {zoneRequest.reason_detail && <div style={{ marginTop: 3, fontStyle: 'italic' }}>"{zoneRequest.reason_detail}"</div>}
                    </div>
                    <div style={{ fontSize: 11, color: '#d97706', marginTop: 8 }}>
                      El administrador revisará tu solicitud pronto.
                    </div>
                  </div>
                )}

                {/* Formulario nueva solicitud */}
                {!zoneRequest && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '18px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>📝 Solicitar cambio de zona</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
                      Si necesitas cambiar tu zona de operación, envía una solicitud. El administrador la revisará y te notificará por WhatsApp.
                    </div>

                    {/* Motivo */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Motivo del cambio</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { v: 'cambio_domicilio', label: '🏠 Cambio de domicilio' },
                          { v: 'ampliar_zona',     label: '📈 Ampliar zona' },
                          { v: 'reducir_zona',     label: '📉 Reducir zona' },
                          { v: 'otro',             label: '💬 Otro motivo' },
                        ].map(opt => (
                          <button key={opt.v} onClick={() => setZoneForm(p => ({ ...p, reason_type: opt.v }))}
                            style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${zoneForm.reason_type === opt.v ? '#3b82f6' : '#e5e7eb'}`,
                              background: zoneForm.reason_type === opt.v ? '#eff6ff' : '#fff',
                              color: zoneForm.reason_type === opt.v ? '#1e40af' : '#374151',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', minHeight: 44 }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Nueva dirección */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Nueva dirección base</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          value={zoneForm.new_address}
                          onChange={e => setZoneForm(p => ({ ...p, new_address: e.target.value, new_lat: null, new_lng: null }))}
                          placeholder="Ej: Colonia Roma Norte, CDMX"
                          style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit' }}
                        />
                        <button onClick={geocodeZoneAddress}
                          style={{ padding: '10px 12px', borderRadius: 10, background: '#3b82f6', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          🔍 Verificar
                        </button>
                      </div>
                      {zoneForm.new_lat && zoneForm.new_lng && (
                        <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '6px 10px', marginTop: 6, fontSize: 12, color: '#065f46' }}>
                          ✅ Dirección verificada: {zoneForm.new_lat.toFixed(4)}, {zoneForm.new_lng.toFixed(4)}
                        </div>
                      )}
                      {zoneMapUrl && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>🗺️ Tu nueva zona de operación</div>
                          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1.5px solid #bfdbfe', height: 200 }}>
                            <iframe src={zoneMapUrl} width="100%" height="200" frameBorder="0" scrolling="no" title="Mapa nueva zona" style={{ display: 'block', border: 'none' }} />
                          </div>
                          <p style={{ fontSize: 11, color: '#9ca3af', margin: '6px 0 0' }}>
                            📍 Zona base · {zoneForm.new_lat?.toFixed(4)}, {zoneForm.new_lng?.toFixed(4)} · Radio: {zoneForm.new_radius} km
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Radio de cobertura */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                        Radio de cobertura solicitado: <strong style={{ color: '#1e40af' }}>{zoneForm.new_radius} km</strong>
                      </label>
                      <input type="range" min="1" max="20" step="1" value={zoneForm.new_radius}
                        onChange={e => setZoneForm(p => ({ ...p, new_radius: e.target.value }))}
                        style={{ width: '100%', accentColor: '#3b82f6' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        <span>1 km</span><span>10 km</span><span>20 km</span>
                      </div>
                    </div>

                    {/* Explicación adicional */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                        Explicación adicional <span style={{ fontWeight: 400, color: '#9ca3af' }}>(opcional)</span>
                      </label>
                      <textarea
                        value={zoneForm.reason_detail}
                        onChange={e => setZoneForm(p => ({ ...p, reason_detail: e.target.value }))}
                        placeholder="Explica brevemente el motivo de tu solicitud..."
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 80, boxSizing: 'border-box' }}
                      />
                    </div>

                    {zoneError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#dc2626', fontSize: 12 }}>⚠️ {zoneError}</div>}
                    {zoneSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#065f46', fontSize: 12 }}>{zoneSuccess}</div>}

                    <button onClick={submitZoneRequest} disabled={savingZone || !zoneForm.new_address.trim() || !zoneForm.new_lat}
                      style={{ width: '100%', padding: '13px 0', background: savingZone || !zoneForm.new_address.trim() || !zoneForm.new_lat ? '#9ca3af' : 'linear-gradient(135deg,#1e40af,#3b82f6)',
                        color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
                        cursor: savingZone || !zoneForm.new_address.trim() || !zoneForm.new_lat ? 'not-allowed' : 'pointer', minHeight: 48 }}>
                      {savingZone ? '⏳ Enviando...' : '📤 Enviar solicitud de cambio de zona'}
                    </button>
                  </div>
                )}

              </div>
            )}

          </div>
        )}

        {/* ── TABS DE SERVICIOS ── */}
        {activeTab !== 'solicitudes' && activeTab !== 'horarios' && (
          loading ? (
            <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
              <p style={{ color: '#9ca3af' }}>Cargando tus servicios...</p>
            </div>
          ) : currentList.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <p style={{ color: '#9ca3af' }}>No tienes servicios en esta seccion</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {currentList.map(booking => {
                const sc = getStatusStyle(booking.status);
                const timeFrom = booking.scheduled_time_from?.slice(0,5);
                const timeTo   = booking.scheduled_time_to?.slice(0,5);
                return (
                  <div key={booking.id} onClick={() => setSelectedBooking(booking)}
                    style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: isMobile ? 14 : '16px 18px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '3px 10px', borderRadius: 20 }}>{booking.booking_ref}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.label}</span>
                    </div>
                    <div style={{ fontWeight: 700, color: '#1f2937', fontSize: isMobile ? 15 : 16, marginBottom: 10 }}>{booking.service_name}</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151' }}>
                        <Clock size={14} color="#3b82f6" />
                        <span style={{ fontWeight: 600 }}>
                          {timeFrom && timeTo ? `${timeFrom} — ${timeTo}` : booking.scheduled_time?.slice(0,5) ?? '—'}
                        </span>
                        <span style={{ color: '#9ca3af' }}>·</span>
                        <span style={{ color: '#6b7280' }}>{booking.scheduled_date}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#6b7280' }}>
                        <MapPin size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ lineHeight: 1.4 }}>{booking.address_line || 'Ver detalles...'}</span>
                      </div>
                    </div>
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
                      {booking.status === 'confirmado' && (
                        <button onClick={async e => { e.stopPropagation(); await updateStatus(booking.id, 'en_camino', 'on_the_way', booking); }} disabled={updatingId === booking.id}
                          style={{ flex: 1, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 }}>
                          <Navigation size={14} /> Iniciar Viaje
                        </button>
                      )}
                      {booking.status === 'en_camino' && (
                        <button onClick={async e => { e.stopPropagation(); await handleStartWashing(booking); }} disabled={updatingId === booking.id}
                          style={{ flex: 1, background: '#f97316', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 }}>
                          <Play size={14} /> Empezar Lavado
                        </button>
                      )}
                      {booking.status === 'en_proceso' && !(booking.photo_front_before && booking.photo_side_before) && (
                        <button onClick={e => {
                          e.stopPropagation();
                          const existing = {};
                          if (booking.photo_front_before) existing.front_before = booking.photo_front_before;
                          if (booking.photo_side_before)  existing.side_before  = booking.photo_side_before;
                          const startStep = booking.photo_front_before ? 2 : 1;
                          setPhotoBooking(booking); setPhotosData(existing); setPhotoStep(startStep); setPhotoPhase('before');
                          setUploadError(''); setUploadProgress(''); setUploadingPhoto(false); setPhotoModalSafe(true);
                        }} disabled={updatingId === booking.id}
                          style={{ flex: 1, background: '#f97316', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 }}>
                          <Camera size={14} /> {booking.photo_front_before ? 'Foto 2 ANTES' : 'Fotos ANTES'}
                        </button>
                      )}
                      {booking.status === 'en_proceso' && booking.photo_front_before && booking.photo_side_before && (
                        <button onClick={e => { e.stopPropagation(); handleFinalizeClick(booking); }} disabled={updatingId === booking.id}
                          style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 }}>
                          <Check size={14} /> Finalizar
                        </button>
                      )}
                      {['confirmado','en_camino','en_proceso'].includes(booking.status) && (
                        <>
                          <button onClick={e => { e.stopPropagation(); openChat(booking.id); }}
                            style={{ background: unreadByBooking[booking.id] ? '#1e40af' : '#eff6ff', color: unreadByBooking[booking.id] ? '#fff' : '#1e40af', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '13px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, minHeight: 48, position: 'relative' }}>
                            💬
                            {unreadByBooking[booking.id] > 0 && (
                              <span style={{ background: '#dc2626', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'absolute', top: -6, right: -6 }}>
                                {unreadByBooking[booking.id]}
                              </span>
                            )}
                          </button>
                          <button onClick={e => { e.stopPropagation(); setIncidentBooking(booking); setIncidentModal(true); }}
                            style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 10, padding: '13px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, minHeight: 48 }}>
                            <AlertTriangle size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Nav bar móvil */}
      {isMobile && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: '#fff', borderTop: '1px solid #e5e7eb', display: 'flex', boxShadow: '0 -4px 16px rgba(0,0,0,0.08)' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ flex: 1, padding: '10px 2px 12px', border: 'none', cursor: 'pointer', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, borderTop: activeTab === tab.id ? '3px solid #3b82f6' : '3px solid transparent', minHeight: 60, position: 'relative' }}>
              <span style={{ fontSize: tab.id === 'solicitudes' ? 18 : 20 }}>{tab.icon}</span>
              <span style={{ fontSize: 9, fontWeight: 700, color: activeTab === tab.id ? '#1e40af' : '#9ca3af' }}>{tab.label}</span>
              {tab.count > 0 && (
                <span style={{ position: 'absolute', top: 6, right: '50%', transform: 'translateX(12px)', fontSize: 9, fontWeight: 700, background: tab.id === 'solicitudes' ? '#ef4444' : '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 5px', minWidth: 16, textAlign: 'center' }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Detalle booking */}
      {selectedBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#f3f4f6', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: isMobile ? 12 : 20, paddingBottom: isMobile ? 160 : 120 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button onClick={() => setSelectedBooking(null)} style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 44 }}>← Cerrar</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Detalle del Servicio</div>
                <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 13 }}>{selectedBooking.booking_ref}</div>
              </div>
              <div style={{ width: 80 }} />
            </div>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 20, padding: isMobile ? 16 : '20px 22px', color: '#fff', marginBottom: 16 }}>
              <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, margin: '0 0 4px' }}>{selectedBooking.service_name}</h2>
              <p style={{ color: '#bfdbfe', fontSize: 13, margin: '0 0 16px' }}>{selectedBooking.vehicle_brand} {selectedBooking.vehicle_model} · {selectedBooking.vehicle_color}</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                  🕐 {selectedBooking.scheduled_time_from?.slice(0,5) ?? selectedBooking.scheduled_time?.slice(0,5)}
                  {selectedBooking.scheduled_time_to ? ` — ${selectedBooking.scheduled_time_to.slice(0,5)}` : ''} hrs
                </span>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>💰 ${selectedBooking.total_price || selectedBooking.service_price}</span>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>Cliente</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 16 }}>{selectedBooking.customer?.full_name}</div>
                  <div style={{ fontSize: 14, color: '#6b7280', marginTop: 3 }}>{selectedBooking.customer?.phone}</div>
                </div>
                <a href={'tel:' + selectedBooking.customer?.phone} style={{ background: '#10b981', padding: '12px 14px', borderRadius: 12, color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', minHeight: 48 }}>
                  <Phone size={18} />
                </a>
              </div>
            </div>
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>Ubicacion</div>
              <p style={{ fontWeight: 500, color: '#1f2937', fontSize: 14, margin: '0 0 14px' }}>{selectedBooking.address_line}</p>
              <button onClick={() => openInMaps(selectedBooking.address_line)} style={{ width: '100%', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '14px 0', fontSize: 14, fontWeight: 700, color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 }}>
                <Navigation size={14} /> Abrir en Google Maps
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {selectedBooking.status === 'confirmado' && (
                <button onClick={() => updateStatus(selectedBooking.id, 'en_camino', 'on_the_way', selectedBooking)} disabled={updatingId === selectedBooking.id}
                  style={{ width: '100%', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, flexShrink: 0 }}>
                  {updatingId === selectedBooking.id ? 'Cargando...' : <><Navigation size={18} /> INICIAR VIAJE AHORA</>}
                </button>
              )}
              {selectedBooking.status === 'en_camino' && (
                <button onClick={() => handleStartWashing(selectedBooking)} disabled={updatingId === selectedBooking.id}
                  style={{ width: '100%', background: '#f97316', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56, flexShrink: 0 }}>
                  <Play size={18} /> LLEGUE / EMPEZAR LAVADO
                </button>
              )}
              {selectedBooking.status === 'en_proceso' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setIncidentBooking(selectedBooking); setIncidentModal(true); }}
                    style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 14, padding: '16px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: 56, flexShrink: 0 }}>
                    <AlertTriangle size={18} />
                  </button>
                  {!(selectedBooking.photo_front_before && selectedBooking.photo_side_before) ? (
                    <button onClick={() => {
                      const existing = {};
                      if (selectedBooking.photo_front_before) existing.front_before = selectedBooking.photo_front_before;
                      if (selectedBooking.photo_side_before)  existing.side_before  = selectedBooking.photo_side_before;
                      const startStep = selectedBooking.photo_front_before ? 2 : 1;
                      setPhotoBooking(selectedBooking); setPhotosData(existing); setPhotoStep(startStep); setPhotoPhase('before');
                      setUploadError(''); setUploadProgress(''); setUploadingPhoto(false); setPhotoModalSafe(true);
                    }} disabled={updatingId === selectedBooking.id}
                      style={{ flex: 1, background: '#f97316', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56 }}>
                      <Camera size={18} /> {selectedBooking.photo_front_before ? 'FOTO 2 ANTES' : 'SUBIR FOTOS ANTES'}
                    </button>
                  ) : (
                    <button onClick={() => handleFinalizeClick(selectedBooking)} disabled={updatingId === selectedBooking.id}
                      style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56 }}>
                      <Check size={18} /> FINALIZAR SERVICIO
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL FOTOS - Una pantalla por foto igual que el Onboarding */}
      {photoModal && photoBooking && <FotoModal
        photoStep={photoStep} photoPhase={photoPhase} photosData={photosData}
        photoBooking={photoBooking} isMobile={isMobile} pendingFinalize={pendingFinalize}
        handleNextPhotoStep={handleNextPhotoStep} setPhotoModalSafe={setPhotoModalSafe}
        setPhotosData={setPhotosData} setPhotoBooking={setPhotoBooking}
        setPendingFinalize={setPendingFinalize} setBookings={setBookings}
        setSelectedBooking={setSelectedBooking} selectedBooking={selectedBooking}
        supabase={supabase}
      />}

      {/* MODAL CHECKLIST */}
      {checklistModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, width: '100%', maxWidth: isMobile ? '100%' : 460, display: 'flex', flexDirection: 'column', maxHeight: isMobile ? 'calc(92vh - 60px)' : '85vh' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: isMobile ? '20px 20px 0 0' : '20px 20px 0 0', flexShrink: 0 }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>Checklist de Calidad</h3>
              <button onClick={() => setChecklistModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
            </div>
            <div style={{ padding: isMobile ? '16px 14px' : 20, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 16px' }}>Confirma que cada punto fue completado antes de finalizar.</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {checklist.map(item => (
                  <button key={item.id} onClick={() => toggleCheckItem(item.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, border: item.checked ? '2px solid #10b981' : '1.5px solid #e5e7eb', background: item.checked ? '#f0fdf4' : '#fff', cursor: 'pointer', textAlign: 'left', minHeight: 52 }}>
                    {item.checked ? <CheckSquare size={20} color="#10b981" style={{ flexShrink: 0 }} /> : <Square size={20} color="#d1d5db" style={{ flexShrink: 0 }} />}
                    <span style={{ fontSize: 14, fontWeight: item.checked ? 600 : 400, color: item.checked ? '#166534' : '#374151' }}>{item.item}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setChecklistModal(false)} style={{ flex: 1, padding: '12px 0', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={confirmFinalize} style={{ flex: 2, padding: '12px 0', background: checklist.every(i => i.checked) ? '#10b981' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                {checklist.every(i => i.checked) ? 'Confirmar y Finalizar' : 'Completa el checklist'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DEPOSITO BANCARIO */}
      {depositModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ background: 'linear-gradient(135deg,#059669,#10b981)', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>🏦 Pago por depósito bancario</div>
                <div style={{ color: '#d1fae5', fontSize: 12, marginTop: 2 }}>Membresía Operador — ${effectiveMembershipPrice} MXN / 7 días</div>
              </div>
              <button onClick={() => setDepositModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px' }}>
              {!depositSuccess ? (
                <>
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 10 }}>📋 Datos para tu depósito:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {[
                        ['Banco', 'BBVA'],
                        ['Titular', 'Juan Alberto Mazariegos Fernandez'],
                        ['Cuenta', '261 197 8748'],
                        ['CLABE', '012 180 02611978748 1'],
                        ['Monto', `$${effectiveMembershipPrice} MXN`],
                      ].map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                          <span style={{ color: '#6b7280', fontWeight: 500 }}>{label}</span>
                          <span style={{ color: '#1f2937', fontWeight: 700, fontFamily: 'monospace' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>⚠️ Referencia obligatoria:</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#1f2937', fontFamily: 'monospace', letterSpacing: 2, textAlign: 'center', padding: '6px 0' }}>
                      {profile?.referral_code}
                    </div>
                    <div style={{ fontSize: 11, color: '#78716c', textAlign: 'center' }}>Escribe exactamente este código en el concepto o referencia de tu transferencia</div>
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
                    Tu membresía se activará en un máximo de <strong>24 horas</strong> después de confirmar el depósito. Recibirás una notificación por WhatsApp cuando esté activa.
                  </div>
                  {depositError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#dc2626' }}>⚠️ {depositError}</div>}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setDepositModal(false)}
                      style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 46 }}>
                      Cerrar
                    </button>
                    <button onClick={handleDepositRequest} disabled={depositLoading}
                      style={{ flex: 2, padding: '12px', background: depositLoading ? '#9ca3af' : 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: depositLoading ? 'not-allowed' : 'pointer', minHeight: 46 }}>
                      {depositLoading ? '⏳ Registrando...' : '✅ Ya realicé el depósito'}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>¡Solicitud registrada!</div>
                  <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, marginBottom: 20 }}>
                    Tu depósito con referencia <strong>{profile?.referral_code}</strong> fue registrado.<br/>
                    Recibirás una notificación por WhatsApp en cuanto el admin confirme tu pago (máx. 24 hrs).
                  </div>
                  <button onClick={() => setDepositModal(false)}
                    style={{ padding: '12px 32px', background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 46 }}>
                    Entendido
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL CHAT */}
      {chatBookingId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, width: '100%', maxWidth: isMobile ? '100%' : 440, height: isMobile ? '75vh' : 520, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>💬 Chat con el cliente</div>
                <div style={{ color: '#bfdbfe', fontSize: 11, marginTop: 2 }}>Solo disponible durante el servicio activo</div>
              </div>
              <button onClick={closeChat} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            {/* Mensajes */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc' }}>
              {chatLoading ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 24 }}>Cargando mensajes...</div>
              ) : chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 24 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
                  Sin mensajes aún. Escribe para contactar al cliente.
                </div>
              ) : chatMessages.map(msg => {
                const isMe = msg.sender_id === user?.id
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '78%', padding: '8px 12px', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMe ? '#1e40af' : '#fff', color: isMe ? '#fff' : '#1f2937', fontSize: 13, lineHeight: 1.5, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                      {!isMe && <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 3 }}>Cliente</div>}
                      {msg.content}
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <span>{new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && (
                          <span style={{ fontSize: 11, color: msg.read_at ? '#60a5fa' : 'rgba(255,255,255,0.6)', letterSpacing: -2, fontWeight: 700 }}>
                            {msg.read_at ? '✓✓' : (msg.id?.toString().startsWith('temp-') ? '○' : '✓')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={chatBottomRef} />
            </div>
            {/* Aviso privacidad */}
            <div style={{ background: '#fffbeb', borderTop: '1px solid #fde68a', padding: '6px 14px', fontSize: 11, color: '#92400e', flexShrink: 0 }}>
              🔒 No compartas números telefónicos. La comunicación es exclusiva de la App.
            </div>
            {/* Input */}
            <div style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6', background: '#fff', flexShrink: 0 }}>
              {chatError && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 6, padding: '4px 8px', background: '#fef2f2', borderRadius: 6 }}>⚠️ {chatError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={chatInput}
                  onChange={e => { setChatInput(e.target.value); setChatError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="Escribe un mensaje..."
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', fontFamily: 'inherit', minHeight: 42 }}
                  maxLength={300}
                />
                <button onClick={sendMessage} disabled={chatSending || !chatInput.trim()}
                  style={{ padding: '10px 16px', background: chatSending || !chatInput.trim() ? '#9ca3af' : '#1e40af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: chatSending || !chatInput.trim() ? 'not-allowed' : 'pointer', minHeight: 42, flexShrink: 0 }}>
                  {chatSending ? '⏳' : '➤'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INCIDENCIA */}
      {incidentModal && incidentBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, width: '100%', maxWidth: isMobile ? '100%' : 420, display: 'flex', flexDirection: 'column', maxHeight: isMobile ? 'calc(92vh - 60px)' : '85vh' }}>
            <div style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: isMobile ? '20px 20px 0 0' : '20px 20px 0 0', flexShrink: 0 }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>Reportar Incidencia</h3>
              <button onClick={() => { setIncidentModal(false); setIncidentNote(''); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
            </div>
            <div style={{ padding: isMobile ? '16px 14px' : 20, overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
              <div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#991b1b' }}>
                Servicio: <strong>{incidentBooking.booking_ref}</strong> — {incidentBooking.service_name}
              </div>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Describe el problema *</label>
              <textarea value={incidentNote} onChange={e => setIncidentNote(e.target.value)}
                placeholder="Ej: El cliente no se encuentra en casa..."
                style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1.5px solid #fecaca', fontSize: 16, outline: 'none', height: 100, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937' }} />
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => { setIncidentModal(false); setIncidentNote(''); }} style={{ flex: 1, padding: '12px 0', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={sendIncidentReport} disabled={sendingIncident}
                style={{ flex: 2, padding: '12px 0', background: sendingIncident ? '#9ca3af' : '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                {sendingIncident ? 'Enviando...' : 'Enviar al Admin'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INFOGRAFÍAS */}
      {showInfografias && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, width: '100%', maxWidth: isMobile ? '100%' : 480, maxHeight: isMobile ? '90vh' : '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* ── VISTA SELECCIÓN (índice null) ── */}
            {selectedInfografia === null && (
              <>
                {/* Header */}
                <div style={{ background: 'linear-gradient(135deg,#0c4a6e,#0369a1)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>🖼️ Mis Guías de Referencia</div>
                    <div style={{ color: '#bae6fd', fontSize: 12, marginTop: 2 }}>Elige una guía para verla</div>
                  </div>
                  <button onClick={() => { setShowInfografias(false); setSelectedInfografia(null); }}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 34, height: 34, color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
                {/* Grid de tarjetas */}
                <div style={{ overflowY: 'auto', flex: 1, padding: '20px 16px', WebkitOverflowScrolling: 'touch' }}>
                  {loadingInfografias ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>Cargando guías...
                    </div>
                  ) : infografias.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
                      <div style={{ fontSize: 32, marginBottom: 12 }}>🖼️</div>Las guías estarán disponibles pronto.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {infografias.map((mod, mi) => {
                        const emojis = ['🤝','💧','✨','🛡️'];
                        const colors = ['#1e3a8a','#0c4a6e','#4c1d95','#78350f'];
                        return (
                          <button key={mod.id} onClick={() => setSelectedInfografia(mi)}
                            style={{ background: '#fff', border: `2px solid ${colors[mi] || '#e5e7eb'}22`, borderRadius: 16, padding: '20px 12px', cursor: 'pointer', textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', transition: 'transform 0.15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minHeight: 120 }}>
                            <div style={{ width: 52, height: 52, borderRadius: '50%', background: `${colors[mi] || '#1e3a8a'}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                              {emojis[mi] || '🖼️'}
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Módulo {mod.order_index}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', lineHeight: 1.3 }}>
                              {mod.title.replace(/^Módulo \d+[:\s·-]*/i, '').trim()}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {/* Footer */}
                <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
                  <button onClick={() => { setShowInfografias(false); setSelectedInfografia(null); }}
                    style={{ width: '100%', padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 46 }}>
                    Cerrar
                  </button>
                </div>
              </>
            )}

            {/* ── VISTA INFOGRAFÍA INDIVIDUAL ── */}
            {selectedInfografia !== null && infografias[selectedInfografia] && <InfografiaItem
              mod={infografias[selectedInfografia]}
              idx={selectedInfografia}
              total={infografias.length}
              setSelectedInfografia={setSelectedInfografia}
              setShowInfografias={setShowInfografias}
            />}

          </div>
        </div>
      )}

      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
    </div>
  );
};

export default OperatorView;
