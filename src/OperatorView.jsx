import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Clock, Phone, Navigation, LogOut,
  Play, Check, Camera, CheckSquare, Square, AlertTriangle, Upload
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

async function compressForMobile(file) {
  if (file.size < 500 * 1024) return file;
  const MAX = 1000; const QUALITY = 0.78; const TIMEOUT = 5000;
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const bitmap = await Promise.race([
        createImageBitmap(file),
        new Promise((_, r) => setTimeout(() => r(new Error('t')), TIMEOUT)),
      ]);
      let w = bitmap.width, h = bitmap.height;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      const oc = new OffscreenCanvas(w, h);
      oc.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const blob = await Promise.race([
        oc.convertToBlob({ type: 'image/jpeg', quality: QUALITY }),
        new Promise((_, r) => setTimeout(() => r(new Error('t')), TIMEOUT)),
      ]);
      if (blob && blob.size > 0) return blob;
    } catch { }
  }
  try {
    return await new Promise((resolve) => {
      const safe = setTimeout(() => resolve(file), 10000);
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
            if (!ctx) { clearTimeout(safe); resolve(file); return; }
            ctx.drawImage(img, 0, 0, w, h);
            let done = false;
            canvas.toBlob((b) => {
              if (done) return; done = true;
              clearTimeout(safe);
              resolve(b && b.size > 0 ? b : file);
            }, 'image/jpeg', QUALITY);
            setTimeout(() => { if (!done) { done = true; clearTimeout(safe); resolve(file); } }, 5000);
          } catch { clearTimeout(safe); resolve(file); }
        };
        img.onerror = () => { clearTimeout(safe); resolve(file); };
        img.src = e.target.result;
      };
      reader.onerror = () => { clearTimeout(safe); resolve(file); };
      reader.readAsDataURL(file);
    });
  } catch { return file; }
}

const OperatorView = () => {
  const { user, profile, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [bookings, setBookings]               = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [fetchError, setFetchError]           = useState('');
  const [activeTab, setActiveTab]             = useState('pendientes');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [updatingId, setUpdatingId]           = useState(null);
  const fetchingRef                           = useRef(false);
  const bookingsCache                         = useRef([]);
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
  const [incidentModal, setIncidentModal]     = useState(false);
  const [incidentBooking, setIncidentBooking] = useState(null);
  const [incidentNote, setIncidentNote]       = useState('');
  const [sendingIncident, setSendingIncident] = useState(false);
  const gpsWatcherRef                         = useRef(null);
  const [trackingBookingId, setTrackingBookingId] = useState(null);
  const [gpsError, setGpsError]               = useState('');
  const [sessionToken, setSessionToken]       = useState(null);

  useEffect(() => {
    if (user) {
      fetchOperatorBookings();
      const channel = supabase
        .channel('operator-changes')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'bookings',
          filter: `operator_id=eq.${user.id}`
        }, () => fetchOperatorBookings(true))
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
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

  // GUARD: debe ir despues de todos los hooks
  if (!profile || profile.onboarding_done === false) {
    const step = profile?.onboarding_step || 1;
    return (
      <div style={{ minHeight: '100vh', background: '#050A14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1.5px solid rgba(59,130,246,0.3)', borderRadius: 20, padding: '40px 32px', maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>📋</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F0F6FF', marginBottom: 12 }}>
            Completa tu registro
          </h2>
          <p style={{ color: '#8CA0BF', fontSize: 15, marginBottom: 8, lineHeight: 1.6 }}>
            Para acceder al panel necesitas completar tu proceso de alta como operador.
          </p>
          {step > 1 && (
            <p style={{ color: '#60a5fa', fontSize: 13, marginBottom: 24 }}>
              Continuaras desde el paso {step} de 5
            </p>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', border: 'none', borderRadius: 12, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', marginBottom: 12 }}>
            {step > 1 ? 'Continuar registro (Paso ' + step + '/5)' : 'Iniciar registro'}
          </button>
          <button onClick={() => signOut()}
            style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#8CA0BF', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Cerrar sesion
          </button>
        </div>
      </div>
    );
  }

  if (profile.onboarding_done &&
      (profile.operator_status === 'pending_review' || profile.operator_status === 'pendiente')) {
    return (
      <div style={{ minHeight: '100vh', background: '#050A14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1.5px solid rgba(59,130,246,0.3)', borderRadius: 20, padding: '40px 32px', maxWidth: 420, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⏳</div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#F0F6FF', marginBottom: 12 }}>Perfil en revision</h2>
          <p style={{ color: '#8CA0BF', fontSize: 15, marginBottom: 24, lineHeight: 1.6 }}>
            Tu registro esta siendo revisado por el administrador. Te notificaremos cuando sea aprobado.
          </p>
          <button onClick={() => signOut()}
            style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, color: '#8CA0BF', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Cerrar sesion
          </button>
        </div>
      </div>
    );
  }

  const fetchOperatorBookings = async (silent = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!silent) setLoading(true);
    setFetchError('');
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      fetchingRef.current = false;
      setLoading(false);
      if (bookingsCache.current.length > 0) {
        setBookings(bookingsCache.current);
        setFetchError('Sin conexion — mostrando datos anteriores.');
      } else {
        setFetchError('Sin conexion. Verifica tu red e intenta de nuevo.');
      }
    }, 8000);
    try {
      let query = supabase.from('bookings').select('*, customer:client_id(full_name, phone)').order('scheduled_date', { ascending: true });
      if (profile?.role !== 'admin') query = query.eq('operator_id', user.id);
      else query = query.in('status', ['confirmado', 'en_camino', 'en_proceso', 'finalizado']);
      const { data, error } = await query;
      clearTimeout(timeoutId);
      if (timedOut) return;
      if (error) throw error;
      const result = data || [];
      bookingsCache.current = result;
      setBookings(result);
      setFetchError('');
    } catch (err) {
      clearTimeout(timeoutId);
      if (timedOut) return;
      if (bookingsCache.current.length > 0) {
        setBookings(bookingsCache.current);
        setFetchError('Error de red — mostrando datos anteriores.');
      } else {
        setFetchError('No se pudieron cargar los servicios. Verifica tu conexion.');
      }
    } finally {
      if (!timedOut) { fetchingRef.current = false; setLoading(false); }
    }
  };

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

  const PHOTO_STEPS = [
    { step: 1, key: 'front_before',   phase: 'before', label: 'Foto 1 de 4 — Frontal ANTES',   desc: 'Captura el frente del auto con la placa visible',  color: '#f97316' },
    { step: 2, key: 'side_before',    phase: 'before', label: 'Foto 2 de 4 — Lateral ANTES',   desc: 'Captura el lado mas expuesto del auto',            color: '#f97316' },
    { step: 3, key: 'front_after',    phase: 'after',  label: 'Foto 3 de 4 — Frontal DESPUES', desc: 'Captura el frente del auto ya lavado',             color: '#10b981' },
    { step: 4, key: 'interior_after', phase: 'after',  label: 'Foto 4 de 4 — Interior DESPUES',desc: 'Captura el interior o cajuela segun el servicio',  color: '#10b981' },
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

  const handlePhotoUpload = async (file, bookingId, type) => {
    if (!file) return;
    setUploadingPhoto(true); setUploadError(''); setUploadProgress('Comprimiendo...');
    const TYPE_TO_COLUMN = { front_before: 'photo_front_before', side_before: 'photo_side_before', front_after: 'photo_front_after', interior_after: 'photo_interior_after' };
    try {
      if (file.size > 15 * 1024 * 1024) throw new Error('La foto pesa mas de 15 MB.');
      const compressed = await compressForMobile(file);
      setUploadProgress('Subiendo...');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const token = sessionToken || supabaseKey;
      const path = bookingId + '/' + type + '_' + Date.now() + '.jpg';
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', supabaseUrl + '/storage/v1/object/service-photos/' + path);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.setRequestHeader('apikey', supabaseKey);
        xhr.setRequestHeader('Content-Type', 'image/jpeg');
        xhr.setRequestHeader('x-upsert', 'true');
        xhr.timeout = 60000;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) setUploadProgress(Math.round(e.loaded/e.total*100) + '%'); };
        xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('HTTP ' + xhr.status));
        xhr.onerror = () => reject(new Error('Error de red.'));
        xhr.ontimeout = () => reject(new Error('Tiempo agotado.'));
        xhr.send(compressed);
      });
      setUploadProgress('Guardando...');
      const column = TYPE_TO_COLUMN[type] || type;
      const { error: dbErr } = await supabase.from('bookings').update({ [column]: path, updated_at: new Date().toISOString() }).eq('id', bookingId);
      if (dbErr) throw dbErr;
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, [column]: path } : b));
      if (selectedBooking?.id === bookingId) setSelectedBooking(prev => ({ ...prev, [column]: path }));
      if (photoBooking?.id === bookingId)    setPhotoBooking(prev => ({ ...prev, [column]: path }));
      setPhotosData(prev => ({ ...prev, [type]: path }));
      setUploadProgress('');
    } catch (err) {
      setUploadError(err.message || 'Error al subir. Intenta de nuevo.');
      setUploadProgress('');
    } finally { setUploadingPhoto(false); }
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

  const pendingServices   = bookings.filter(b => b.status === 'confirmado');
  const activeServices    = bookings.filter(b => ['en_camino', 'en_proceso'].includes(b.status));
  const completedServices = bookings.filter(b => b.status === 'finalizado');
  const currentList = activeTab === 'pendientes' ? pendingServices : activeTab === 'activos' ? activeServices : completedServices;

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

  const tabs = [
    { id: 'pendientes',  label: 'Pendientes', icon: '📋', count: pendingServices.length },
    { id: 'activos',     label: 'Activos',    icon: '⚡', count: activeServices.length },
    { id: 'completados', label: 'Historial',  icon: '📖', count: completedServices.length },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', paddingBottom: isMobile ? 72 : 80 }}>
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
                style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, background: activeTab === tab.id ? '#fff' : 'transparent', color: activeTab === tab.id ? '#1e40af' : '#bfdbfe', boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.12)' : 'none' }}>
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        )}
      </div>

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
        {loading ? (
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
                      <span style={{ fontWeight: 600 }}>{booking.scheduled_time}</span>
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
                    {booking.status === 'en_proceso' && (
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
        )}
      </div>

      {isMobile && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100, background: '#fff', borderTop: '1px solid #e5e7eb', display: 'flex', boxShadow: '0 -4px 16px rgba(0,0,0,0.08)' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ flex: 1, padding: '10px 4px 12px', border: 'none', cursor: 'pointer', background: 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, borderTop: activeTab === tab.id ? '3px solid #3b82f6' : '3px solid transparent', minHeight: 60, position: 'relative' }}>
              <span style={{ fontSize: 20 }}>{tab.icon}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: activeTab === tab.id ? '#1e40af' : '#9ca3af' }}>{tab.label}</span>
              {tab.count > 0 && (
                <span style={{ position: 'absolute', top: 6, right: '50%', transform: 'translateX(12px)', fontSize: 9, fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: 10, padding: '1px 5px', minWidth: 16, textAlign: 'center' }}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {selectedBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#f3f4f6', overflowY: 'auto' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: isMobile ? 12 : 20 }}>
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
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>🕐 {selectedBooking.scheduled_time}</span>
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
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', marginBottom: 120 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 }}>Ubicacion</div>
              <p style={{ fontWeight: 500, color: '#1f2937', fontSize: 14, margin: '0 0 14px' }}>{selectedBooking.address_line}</p>
              <button onClick={() => openInMaps(selectedBooking.address_line)} style={{ width: '100%', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '14px 0', fontSize: 14, fontWeight: 700, color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 }}>
                <Navigation size={14} /> Abrir en Google Maps
              </button>
            </div>
            <div style={{ position: 'fixed', bottom: isMobile ? 72 : 24, left: isMobile ? 12 : 20, right: isMobile ? 12 : 20 }}>
              {selectedBooking.status === 'confirmado' && (
                <button onClick={() => updateStatus(selectedBooking.id, 'en_camino', 'on_the_way', selectedBooking)} disabled={updatingId === selectedBooking.id}
                  style={{ width: '100%', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56 }}>
                  {updatingId === selectedBooking.id ? 'Cargando...' : <><Navigation size={18} /> INICIAR VIAJE AHORA</>}
                </button>
              )}
              {selectedBooking.status === 'en_camino' && (
                <button onClick={() => handleStartWashing(selectedBooking)} disabled={updatingId === selectedBooking.id}
                  style={{ width: '100%', background: '#f97316', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56 }}>
                  <Play size={18} /> LLEGUE / EMPEZAR LAVADO
                </button>
              )}
              {selectedBooking.status === 'en_proceso' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setIncidentBooking(selectedBooking); setIncidentModal(true); }}
                    style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 14, padding: '16px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: 56 }}>
                    <AlertTriangle size={18} />
                  </button>
                  <button onClick={() => handleFinalizeClick(selectedBooking)} disabled={updatingId === selectedBooking.id}
                    style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 56 }}>
                    <Check size={18} /> FINALIZAR SERVICIO
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {photoModal && photoBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 24, width: '100%', maxWidth: isMobile ? '100%' : 420, overflow: 'hidden' }}>
            <div style={{ background: currentPhotoConfig.phase === 'before' ? 'linear-gradient(135deg,#f97316,#fb923c)' : 'linear-gradient(135deg,#10b981,#34d399)', padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: '0 0 4px' }}>{currentPhotoConfig.label}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, margin: 0 }}>{currentPhotoConfig.desc}</p>
                </div>
                <button onClick={() => { setPhotoModal(false); setPhotosData({}); setPhotoBooking(null); setPendingFinalize(null); setUploadingPhoto(false); setUploadProgress(''); }}
                  style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18, borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 8 }}>x</button>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                {PHOTO_STEPS.map(p => (
                  <div key={p.step} style={{ flex: 1, height: 4, borderRadius: 4, background: photosData[p.key] ? '#fff' : p.step === photoStep ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)' }} />
                ))}
              </div>
            </div>
            <div style={{ padding: isMobile ? '18px 16px' : '20px 24px' }}>
              {getPhotoUrl(photosData[currentPhotoKey] || photoBooking['photo_' + currentPhotoKey]) ? (
                <div style={{ position: 'relative', marginBottom: 14 }}>
                  <img src={getPhotoUrl(photosData[currentPhotoKey] || photoBooking['photo_' + currentPhotoKey])} alt={currentPhotoConfig.label} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 12 }} />
                  <span style={{ position: 'absolute', top: 10, right: 10, background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20 }}>Guardada</span>
                </div>
              ) : (
                <div style={{ width: '100%', height: 160, background: '#f9fafb', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 14, border: '2px dashed #e5e7eb' }}>
                  <Camera size={40} color="#d1d5db" />
                  <span style={{ fontSize: 13, color: '#9ca3af', marginTop: 10 }}>Toma la foto ahora</span>
                </div>
              )}
              {uploadingPhoto && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 18, height: 18, border: '3px solid #bfdbfe', borderTop: '3px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>{uploadProgress || 'Procesando...'}</span>
                </div>
              )}
              {uploadError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>{uploadError}</span>
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', borderRadius: 12, background: uploadingPhoto ? '#f3f4f6' : '#3b82f6', color: uploadingPhoto ? '#9ca3af' : '#fff', fontSize: 15, fontWeight: 700, cursor: uploadingPhoto ? 'not-allowed' : 'pointer', pointerEvents: uploadingPhoto ? 'none' : 'auto', minHeight: 52, marginBottom: 10 }}>
                <Upload size={16} /> {photoBtnLabel}
                <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files[0]) handlePhotoUpload(e.target.files[0], photoBooking.id, currentPhotoKey); }} />
              </label>
              <button onClick={handleNextPhotoStep} disabled={!canAdvancePhoto}
                style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: canAdvancePhoto ? (currentPhotoConfig.phase === 'before' ? '#f97316' : '#10b981') : '#e5e7eb', color: canAdvancePhoto ? '#fff' : '#9ca3af', fontSize: 15, fontWeight: 700, cursor: canAdvancePhoto ? 'pointer' : 'not-allowed', minHeight: 52 }}>
                {photoStep < 2 ? 'Siguiente foto' : photoStep === 2 ? 'Fotos ANTES listas' : photoStep === 3 ? 'Siguiente foto' : pendingFinalize ? 'Continuar al Checklist' : 'Listo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {checklistModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, width: '100%', maxWidth: isMobile ? '100%' : 460, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>Checklist de Calidad</h3>
              <button onClick={() => setChecklistModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
            </div>
            <div style={{ padding: isMobile ? '16px 14px' : 20 }}>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 16px' }}>Confirma que cada punto fue completado antes de finalizar.</p>
              <div style={{ display: 'grid', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
                {checklist.map(item => (
                  <button key={item.id} onClick={() => toggleCheckItem(item.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, border: item.checked ? '2px solid #10b981' : '1.5px solid #e5e7eb', background: item.checked ? '#f0fdf4' : '#fff', cursor: 'pointer', textAlign: 'left', minHeight: 52 }}>
                    {item.checked ? <CheckSquare size={20} color="#10b981" style={{ flexShrink: 0 }} /> : <Square size={20} color="#d1d5db" style={{ flexShrink: 0 }} />}
                    <span style={{ fontSize: 14, fontWeight: item.checked ? 600 : 400, color: item.checked ? '#166534' : '#374151' }}>{item.item}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button onClick={() => setChecklistModal(false)} style={{ flex: 1, padding: '12px 0', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={confirmFinalize} style={{ flex: 2, padding: '12px 0', background: checklist.every(i => i.checked) ? '#10b981' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                {checklist.every(i => i.checked) ? 'Confirmar y Finalizar' : 'Completa el checklist'}
              </button>
            </div>
          </div>
        </div>
      )}

      {incidentModal && incidentBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, width: '100%', maxWidth: isMobile ? '100%' : 420, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>Reportar Incidencia</h3>
              <button onClick={() => { setIncidentModal(false); setIncidentNote(''); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>x</button>
            </div>
            <div style={{ padding: isMobile ? '16px 14px' : 20 }}>
              <div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#991b1b' }}>
                Servicio: <strong>{incidentBooking.booking_ref}</strong> — {incidentBooking.service_name}
              </div>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Describe el problema *</label>
              <textarea value={incidentNote} onChange={e => setIncidentNote(e.target.value)}
                placeholder="Ej: El cliente no se encuentra en casa..."
                style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1.5px solid #fecaca', fontSize: 16, outline: 'none', height: 100, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937' }} />
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
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
