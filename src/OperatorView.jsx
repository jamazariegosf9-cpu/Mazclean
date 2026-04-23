import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin, Clock, Phone, Navigation, LogOut,
  Play, Check, Camera, CheckSquare, Square, AlertTriangle, Upload, Bell
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
import { sendWhatsApp, updateOperatorLocation } from './lib/whatsapp';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.size < 500 * 1024) return file;
  const MAX = 1000; const QUALITY = 0.78;
  try {
    const blob = await new Promise((resolve) => {
      const safeTimer = setTimeout(() => resolve(file), 10000);
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) {
              if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
              else       { w = Math.round(w * MAX / h); h = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { clearTimeout(safeTimer); resolve(file); return; }
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((b) => { clearTimeout(safeTimer); resolve(b && b.size > 0 ? b : file); }, 'image/jpeg', QUALITY);
          } catch { clearTimeout(safeTimer); resolve(file); }
        };
        img.onerror = () => { clearTimeout(safeTimer); resolve(file); };
        img.src = e.target.result;
      };
      reader.onerror = () => { clearTimeout(safeTimer); resolve(file); };
      reader.readAsDataURL(file);
    });
    return blob;
  } catch { return file; }
}

// uploadFile — copia exacta del OnboardingView que funciona en móvil
async function uploadFile({ file, folder, userId, onProgress }) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token || supabaseKey
  const isVideo = file.type.startsWith('video/')
  const isPdf   = file.type === 'application/pdf'
  const ext     = isVideo ? (file.name?.endsWith('.mov') ? 'mov' : 'mp4') : isPdf ? 'pdf' : 'jpg'
  const path    = `${folder}/${userId}/${folder}_${Date.now()}.${ext}`
  const fileToUpload = file  // Sin compresión — prueba definitiva

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/service-photos/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', supabaseKey)
    xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg')
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.timeout = 180000
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100)) }
    xhr.onload    = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText?.slice(0, 100)}`)) }
    xhr.onerror   = () => reject(new Error('Error de red — verifica tu conexión'))
    xhr.ontimeout = () => reject(new Error('Tiempo agotado — señal débil, intenta de nuevo'))
    xhr.send(fileToUpload)
  })
  return path
}

// ── Countdown hook: devuelve segundos restantes hasta expires_at ──────────────
function useCountdown(expiresAt) {
  const [seconds, setSeconds] = useState(() => {
    if (!expiresAt) return 0;
    return Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
  });
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000));
      setSeconds(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return seconds;
}

// ── Card individual de solicitud con su propio countdown ──────────────────────
function RequestCard({ request, onAccept, accepting, isMobile }) {
  const secondsLeft = useCountdown(request.expires_at);
  const minutes     = Math.floor(secondsLeft / 60);
  const secs        = secondsLeft % 60;
  const isUrgent    = secondsLeft <= 60;
  const isExpired   = secondsLeft === 0;
  const b           = request.booking;

  const timeFrom = b?.scheduled_time_from?.slice(0, 5) ?? '';
  const timeTo   = b?.scheduled_time_to?.slice(0, 5)   ?? '';

  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      boxShadow: isUrgent ? '0 0 0 2px #ef4444, 0 4px 24px rgba(239,68,68,0.15)' : '0 4px 24px rgba(0,0,0,0.08)',
      padding: isMobile ? 16 : '18px 20px',
      opacity: isExpired ? 0.5 : 1,
      transition: 'box-shadow 0.3s',
    }}>

      {/* Header: ref + countdown */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '3px 10px', borderRadius: 20 }}>
          {b?.booking_ref ?? '—'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: isUrgent ? '#fef2f2' : '#f0fdf4', borderRadius: 20, padding: '4px 12px' }}>
          <Clock size={12} color={isUrgent ? '#dc2626' : '#059669'} />
          <span style={{ fontSize: 12, fontWeight: 700, color: isUrgent ? '#dc2626' : '#059669', fontFamily: 'monospace' }}>
            {isExpired ? 'Expirado' : `${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`}
          </span>
        </div>
      </div>

      {/* Servicio */}
      <div style={{ fontWeight: 700, color: '#1f2937', fontSize: isMobile ? 16 : 18, marginBottom: 12 }}>
        {b?.service_name ?? '—'}
      </div>

      {/* Info */}
      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151' }}>
          <Clock size={14} color="#3b82f6" style={{ flexShrink: 0 }} />
          <span>{b?.scheduled_date ?? '—'}</span>
          <span style={{ color: '#9ca3af' }}>·</span>
          <span style={{ fontWeight: 600 }}>{timeFrom} — {timeTo} hrs</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#6b7280' }}>
          <MapPin size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ lineHeight: 1.4 }}>{b?.address_line ?? '—'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#059669', fontWeight: 700 }}>
          <span>💰</span>
          <span>${b?.total_price ?? '—'} MXN</span>
        </div>
      </div>

      {/* Aviso urgente */}
      {isUrgent && !isExpired && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#dc2626', fontWeight: 600, textAlign: 'center' }}>
          ⚡ ¡Menos de 1 minuto! Acepta ahora o pasará al siguiente operador.
        </div>
      )}

      {isExpired ? (
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 0', textAlign: 'center', fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>
          Solicitud expirada
        </div>
      ) : (
        <button
          onClick={() => onAccept(request)}
          disabled={accepting === request.id}
          style={{
            width: '100%',
            padding: '14px 0',
            background: accepting === request.id ? '#9ca3af' : 'linear-gradient(135deg,#10b981,#059669)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 800,
            cursor: accepting === request.id ? 'not-allowed' : 'pointer',
            minHeight: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
            flexShrink: 0,
          }}>
          {accepting === request.id ? '⏳ Aceptando...' : <><Check size={18} /> Aceptar servicio</>}
        </button>
      )}
    </div>
  );
}


// ── Componente PhotoStep — copia exacta del PhotoUpload del Onboarding ──────
function PhotoStep({ label, value, bookingId, photoKey, onSuccess, disabled }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [localErr, setLocalErr]   = useState('')
  const { user } = useAuth()

  const handleFile = async (file) => {
    if (!file || disabled) return
    setUploading(true); setLocalErr(''); setProgress(0)
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('El archivo no debe pesar más de 50MB.')
      const folder = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_').replace(/[^a-z_]/g,'').slice(0,30)
      const path = await uploadFile({ file, folder, userId: user.id, onProgress: setProgress })
      onSuccess(path)
    } catch (e) { setLocalErr(e.message) }
    finally { setUploading(false) }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {value ? (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <img src={value} alt={label} style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12, border: '2px solid #bbf7d0' }} onError={e => { e.target.style.display = 'none' }} />
          <span style={{ position: 'absolute', top: 8, right: 8, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20 }}>✅ Guardada</span>
        </div>
      ) : (
        <div style={{ width: '100%', height: 160, background: '#f9fafb', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 10, border: '2px dashed #e5e7eb' }}>
          <Camera size={40} color="#d1d5db" />
          <span style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Sin foto aún</span>
        </div>
      )}
      {uploading && (
        <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 16, height: 16, border: '2px solid #bfdbfe', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>Subiendo... {progress}%</span>
          </div>
          <div style={{ height: 4, background: '#bfdbfe', borderRadius: 4 }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#3b82f6', borderRadius: 4, transition: 'width 0.2s' }} />
          </div>
        </div>
      )}
      {localErr && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#dc2626', fontSize: 13 }}>⚠️ {localErr}</div>}
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', borderRadius: 12, background: uploading ? '#f3f4f6' : '#6366f1', color: uploading ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', pointerEvents: uploading ? 'none' : 'auto', minHeight: 50, flexShrink: 0 }}>
        📸 {value ? 'Cambiar foto' : 'Tomar foto'}
        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }} />
      </label>
    </div>
  )
}

// ── Componente PhotoModal usa PhotoStep ───────────────────────────────────────
function PhotoModal({ isMobile, photoBooking, photoStep, photoPhase, photosData, pendingFinalize, PHOTO_STEPS, getPhotoUrl, onClose, onPhotoSaved, onNext, canAdvance }) {
  const currentPhotoConfig = PHOTO_STEPS.find(p => p.step === photoStep) || PHOTO_STEPS[0];
  const currentPhotoKey    = currentPhotoConfig.key;
  const uploading          = false; // PhotoStep maneja su propio estado
  const canAdvancePhoto    = canAdvance;

  const TYPE_TO_COLUMN = {
    front_before:   'photo_front_before',
    side_before:    'photo_side_before',
    front_after:    'photo_front_after',
    interior_after: 'photo_interior_after',
  };

  const handleFile = () => {}; // no usado — PhotoStep lo maneja

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
      <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 24, width: '100%', maxWidth: isMobile ? '100%' : 420, maxHeight: isMobile ? '92vh' : '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>

        <div style={{ background: currentPhotoConfig.phase === 'before' ? 'linear-gradient(135deg,#f97316,#fb923c)' : 'linear-gradient(135deg,#10b981,#34d399)', padding: '16px 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{currentPhotoConfig.label}</h3>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12, margin: 0 }}>{currentPhotoConfig.desc}</p>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.3)', border: 'none', color: '#fff', fontSize: 22, width: 38, height: 38, borderRadius: 10, cursor: 'pointer' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: isMobile ? '20px 16px' : '24px', flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <PhotoStep
            key={currentPhotoKey}
            label={currentPhotoConfig.label}
            value={getPhotoUrl(photosData[currentPhotoKey] || photoBooking[`photo_${currentPhotoKey}`])}
            bookingId={photoBooking.id}
            photoKey={currentPhotoKey}
            disabled={false}
            onSuccess={(path) => {
              const column = TYPE_TO_COLUMN[currentPhotoKey] || currentPhotoKey;
              onPhotoSaved(currentPhotoKey, path, column);
            }}
          />

          <button onClick={onNext} disabled={!canAdvancePhoto} style={{ width: '100%', padding: '16px 0', borderRadius: 16, border: 'none', background: canAdvancePhoto ? (currentPhotoConfig.phase === 'before' ? '#f97316' : '#10b981') : '#94a3b8', color: '#fff', fontSize: 16, fontWeight: 700, cursor: canAdvancePhoto ? 'pointer' : 'not-allowed', minHeight: 56 }}>
            {photoStep < 4 ? 'Siguiente foto →' : pendingFinalize ? 'Ir al Checklist' : 'Listo'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
const OperatorView = () => {
  const { user, profile, signOut } = useAuth();
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
  const [photoModal, setPhotoModal]           = useState(false);
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

  // ── GPS ───────────────────────────────────────────────────────────────────
  const gpsWatcherRef                             = useRef(null);
  const [trackingBookingId, setTrackingBookingId] = useState(null);
  const [gpsError, setGpsError]                   = useState('');
  const [sessionToken, setSessionToken]           = useState(null);

  // ── Carga inicial y realtime ──────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;

    fetchOperatorBookings();
    fetchBookingRequests();

    // Realtime: cambios en bookings del operador
    const bookingsChannel = supabase
      .channel('operator-bookings')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bookings',
        filter: `operator_id=eq.${user.id}`,
      }, () => fetchOperatorBookings(true))
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

    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(requestsChannel);
    };
  }, [user]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) setSessionToken(session.access_token);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) setSessionToken(session.access_token);
    });
    return () => subscription.unsubscribe();
  }, []);

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
          <button onClick={() => signOut()} style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#8CA0BF', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cerrar sesion</button>
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
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F0F6FF', marginBottom: 12 }}>Perfil en revision</h2>
          <p style={{ color: '#8CA0BF', fontSize: 15, marginBottom: 24, lineHeight: 1.6 }}>Tu registro esta siendo revisado por el administrador. Te notificaremos cuando sea aprobado.</p>
          <button onClick={() => signOut()} style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#8CA0BF', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Cerrar sesion</button>
        </div>
      </div>
    );
  }

  // ── Fetch bookings ────────────────────────────────────────────────────────
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
    } catch (err) {
      clearTimeout(timeoutId); if (timedOut) return;
      if (bookingsCache.current.length > 0) { setBookings(bookingsCache.current); setFetchError('Error de red — mostrando datos anteriores.'); }
      else { setFetchError('No se pudieron cargar los servicios. Verifica tu conexion.'); }
    } finally { if (!timedOut) { fetchingRef.current = false; setLoading(false); } }
  };

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
          const { data: clientProfile } = await supabase
            .from('profiles')
            .select('phone')
            .eq('id', (await supabase.from('bookings').select('client_id').eq('id', b.id).single()).data?.client_id)
            .single();

          if (clientProfile?.phone) {
            sendWhatsApp('operator_assigned', clientProfile.phone, {
              booking_ref:         b.booking_ref,
              service_name:        b.service_name,
              scheduled_date:      b.scheduled_date,
              scheduled_time_from: b.scheduled_time_from,
              scheduled_time_to:   b.scheduled_time_to,
              total_price:         b.total_price,
              operator_name:       profile?.full_name || 'tu operador',
            });
          }
        } catch (e) { console.warn('No se pudo notificar al cliente:', e.message); }
      }

      // Refrescar listas
      await Promise.all([fetchBookingRequests(), fetchOperatorBookings(true)]);

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
    const timeoutId = setTimeout(() => { setUpdatingId(null); alert('La operacion tardo demasiado. Verifica tu conexion.'); }, 12000);
    try {
      const { error } = await supabase.from('bookings').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', bookingId);
      clearTimeout(timeoutId);
      if (error) throw error;
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
      const booking = bookingData || bookings.find(b => b.id === bookingId);
      const phone = booking?.customer?.phone;
      if (phone) {
        sendWhatsApp(eventName, phone, {
          booking_ref: booking.booking_ref, service_name: booking.service_name,
          booking_id: bookingId, operator_name: profile?.full_name || user?.user_metadata?.full_name || 'tu operador',
        });
      }
      if (selectedBooking?.id === bookingId) setSelectedBooking(prev => ({ ...prev, status: newStatus }));
    } catch (err) {
      clearTimeout(timeoutId);
      alert('Error al actualizar estado: ' + err.message);
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
    setUploadError(''); setUploadProgress(''); setUploadingPhoto(false); setPhotoModal(true);
  };

  const handleFinalizeClick = (booking) => {
    if (!booking.photo_front_before || !booking.photo_side_before) {
      alert('Debes subir las fotos ANTES del servicio primero.');
      return;
    }
    const existing = {};
    if (booking.photo_front_after)    existing.front_after    = booking.photo_front_after;
    if (booking.photo_interior_after) existing.interior_after = booking.photo_interior_after;
    setPhotoBooking(booking); setPhotosData(existing); setPhotoStep(3); setPhotoPhase('after');
    setPendingFinalize(booking.id); setUploadError(''); setUploadProgress(''); setUploadingPhoto(false); setPhotoModal(true);
  };

  const closePhotoModal = async () => {
    const currentPending = pendingFinalize;
    setPhotoModal(false); setPhotosData({}); setPhotoBooking(null);
    if (currentPending) {
      const booking = bookings.find(b => b.id === currentPending);
      if (!booking) { setPendingFinalize(null); return; }
      const items = await loadChecklist(booking);
      if (!items) { setPendingFinalize(null); await updateStatus(currentPending, 'finalizado', 'done'); return; }
      setChecklist(items); setChecklistModal(true);
    }
  };

  const handleNextPhotoStep = () => {
    if (photoStep === 1 && photoPhase === 'before') { setPhotoStep(2); }
    else if (photoStep === 2 && photoPhase === 'before') { savePhotosMeta(photoBooking.id); setPhotoModal(false); setPhotosData({}); setPhotoBooking(null); }
    else if (photoStep === 3 && photoPhase === 'after') { setPhotoStep(4); }
    else if (photoStep === 4 && photoPhase === 'after') { savePhotosMeta(photoBooking.id); closePhotoModal(); }
  };

  const savePhotosMeta = (bookingId) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      supabase.from('bookings').update({ photos_geo_lat: pos.coords.latitude, photos_geo_lng: pos.coords.longitude, photos_completed_at: new Date().toISOString() }).eq('id', bookingId).then(() => {});
    }, () => { supabase.from('bookings').update({ photos_completed_at: new Date().toISOString() }).eq('id', bookingId).then(() => {}); });
  };

  const loadChecklist = async (booking) => {
    const { data, error } = await supabase.from('service_checklist').select('*').eq('service_id', booking.service_id).order('sort_order', { ascending: true });
    if (error || !data || data.length === 0) return null;
    return data.map(item => ({ ...item, checked: false }));
  };

  const toggleCheckItem = (id) => { setChecklist(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item)); };

  const confirmFinalize = async () => {
    if (!checklist.every(item => item.checked)) { alert('Por favor completa todos los items del checklist.'); return; }
    setChecklistModal(false);
    await updateStatus(pendingFinalize, 'finalizado', 'done');
    setPendingFinalize(null); setChecklist([]);
  };

  // Guardar estado del modal en sessionStorage para restaurar si la cámara recarga la app
  useEffect(() => {
    if (photoModal && photoBooking) {
      sessionStorage.setItem('photoModal', JSON.stringify({
        bookingId: photoBooking.id,
        photoStep,
        photoPhase,
        photosData,
      }))
    } else {
      sessionStorage.removeItem('photoModal')
    }
  }, [photoModal, photoBooking, photoStep, photoPhase, photosData])

  // Restaurar modal de fotos si la app se recargó mientras la cámara estaba abierta
  useEffect(() => {
    const saved = sessionStorage.getItem('photoModal')
    if (!saved) return
    try {
      const { bookingId, photoStep: step, photoPhase: phase, photosData: data } = JSON.parse(saved)
      const booking = bookings.find(b => b.id === bookingId)
      if (!booking) return
      setPhotoBooking(booking)
      setPhotoStep(step)
      setPhotoPhase(phase)
      setPhotosData(data || {})
      setPhotoModal(true)
      if (phase === 'after') setPendingFinalize(bookingId)
    } catch { sessionStorage.removeItem('photoModal') }
  }, [bookings])

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

      // Exactamente igual al Onboarding: folder=type, userId=user.id
      const uploadedPath = await uploadFile({
        file,
        folder: type,
        userId: user.id,
        onProgress: setUploadProgress,
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
    if (!incidentNote.trim()) { alert('Describe el problema antes de enviar.'); return; }
    setSendingIncident(true);
    try {
      const { error } = await supabase.from('incidents').insert({ booking_id: incidentBooking.id, operator_id: user.id, description: incidentNote, status: 'abierto', created_at: new Date().toISOString() });
      if (error) throw error;
      alert('Incidencia reportada al administrador.');
      setIncidentModal(false); setIncidentNote(''); setIncidentBooking(null);
    } catch (err) { alert('Error: ' + err.message); }
    finally { setSendingIncident(false); }
  };

  const openInMaps = (address) => { if (!address) return; window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address), '_blank'); };
  const getPhotoUrl = (path) => { if (!path) return null; return path.startsWith('http') ? path : SUPABASE_URL + '/storage/v1/object/public/service-photos/' + path; };

  // ── Listas filtradas ──────────────────────────────────────────────────────
  const pendingServices   = bookings.filter(b => b.status === 'confirmado');
  const activeServices    = bookings.filter(b => ['en_camino', 'en_proceso'].includes(b.status));
  const completedServices = bookings.filter(b => b.status === 'finalizado');
  const pendingRequests   = requests.filter(r => r.status === 'pendiente' && new Date(r.expires_at) > new Date());

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

  // ── Tabs con el nuevo "Solicitudes" primero ───────────────────────────────
  const tabs = [
    { id: 'solicitudes',  label: 'Solicitudes', icon: '🔔', count: pendingRequests.length },
    { id: 'pendientes',   label: 'Pendientes',  icon: '📋', count: pendingServices.length },
    { id: 'activos',      label: 'Activos',     icon: '⚡', count: activeServices.length },
    { id: 'completados',  label: 'Historial',   icon: '📖', count: completedServices.length },
  ];

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', paddingBottom: isMobile ? 72 : 80 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: isMobile ? '20px 16px 16px' : '32px 24px 28px', borderRadius: '0 0 24px 24px', boxShadow: '0 4px 24px rgba(30,64,175,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? 0 : 20 }}>
          <div>
            <h1 style={{ color: '#fff', fontSize: isMobile ? 18 : 22, fontWeight: 700, margin: '0 0 4px' }}>🚗 Mis Servicios</h1>
            <p style={{ color: '#bfdbfe', fontSize: 13, margin: 0 }}>Hola, {user?.user_metadata?.full_name || profile?.full_name || 'Operador'}</p>
          </div>
          <button onClick={() => signOut()} style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '10px 12px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', minHeight: 44 }}>
            <LogOut size={16} />
          </button>
        </div>
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

        {/* ── TABS DE SERVICIOS ── */}
        {activeTab !== 'solicitudes' && (
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
                          setUploadError(''); setUploadProgress(''); setUploadingPhoto(false); setPhotoModal(true);
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
                        <button onClick={e => { e.stopPropagation(); setIncidentBooking(booking); setIncidentModal(true); }}
                          style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 10, padding: '13px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, minHeight: 48 }}>
                          <AlertTriangle size={14} />
                        </button>
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
                      setUploadError(''); setUploadProgress(''); setUploadingPhoto(false); setPhotoModal(true);
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

      {/* MODAL FOTOS - Componente autocontenido */}
      {photoModal && photoBooking && (
        <PhotoModal
          isMobile={isMobile}
          photoBooking={photoBooking}
          photoStep={photoStep}
          photoPhase={photoPhase}
          photosData={photosData}
          pendingFinalize={pendingFinalize}
          PHOTO_STEPS={PHOTO_STEPS}
          getPhotoUrl={getPhotoUrl}
          onClose={() => { setPhotoModal(false); setPhotosData({}); setPhotoBooking(null); setPendingFinalize(null); setUploadingPhoto(false); setUploadError(''); setUploadProgress(''); }}
          onPhotoSaved={(type, path, column) => {
            // UPDATE a DB aquí donde auth funciona correctamente
            supabase.from('bookings')
              .update({ [column]: path, updated_at: new Date().toISOString() })
              .eq('id', photoBooking.id)
              .then(({ error }) => {
                if (error) console.error('Error guardando foto en DB:', error);
              });
            setBookings(prev => prev.map(b => b.id === photoBooking.id ? { ...b, [column]: path } : b));
            if (selectedBooking?.id === photoBooking.id) setSelectedBooking(prev => ({ ...prev, [column]: path }));
            setPhotoBooking(prev => ({ ...prev, [column]: path }));
            setPhotosData(prev => ({ ...prev, [type]: path }));
          }}
          onNext={handleNextPhotoStep}
          canAdvance={canAdvancePhoto}
        />
      )}

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

      <style>{'@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }'}</style>
    </div>
  );
};

export default OperatorView;
