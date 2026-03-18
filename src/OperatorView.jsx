import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin, Clock, Phone, Navigation, LogOut,
  ChevronRight, AlertCircle, Play, Check, Camera,
  CheckSquare, Square, AlertTriangle, Upload, X
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
import { sendWhatsApp, updateOperatorLocation } from './lib/whatsapp';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const OperatorView = () => {
  const { user, profile, signOut } = useAuth();
  const [bookings, setBookings]             = useState([]);
  const [loading, setLoading]               = useState(true);
  const [activeTab, setActiveTab]           = useState('pendientes');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [updatingId, setUpdatingId]         = useState(null);

  // ── Checklist ──────────────────────────────────────────────────
  const [checklist, setChecklist]           = useState([]);
  const [checklistModal, setChecklistModal] = useState(false);
  const [pendingFinalize, setPendingFinalize] = useState(null);

  // ── Fotos ──────────────────────────────────────────────────────
  const [photoModal, setPhotoModal]         = useState(false);
  const [photoBooking, setPhotoBooking]     = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoType, setPhotoType]           = useState(null);

  // ── Incidencia ─────────────────────────────────────────────────
  const [incidentModal, setIncidentModal]   = useState(false);
  const [incidentBooking, setIncidentBooking] = useState(null);
  const [incidentNote, setIncidentNote]     = useState('');
  const [sendingIncident, setSendingIncident] = useState(false);

  // ── GPS Tracking ───────────────────────────────────────────────
  const gpsWatcherRef = useRef(null);
  const [trackingBookingId, setTrackingBookingId] = useState(null);
  const [gpsError, setGpsError] = useState('');

  useEffect(() => {
    if (user) {
      fetchOperatorBookings();
      const channel = supabase
        .channel('operator-changes')
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'bookings',
          filter: `operator_id=eq.${user.id}`
        }, () => { fetchOperatorBookings(); })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [user]);

  // ── GPS: iniciar tracking cuando hay servicio en_camino ────────
  useEffect(() => {
    const activeBooking = bookings.find(b => b.status === 'en_camino' && (b.operator_id === user?.id || profile?.role === 'admin'));

    if (activeBooking && trackingBookingId !== activeBooking.id) {
      setTrackingBookingId(activeBooking.id);

      if (!navigator.geolocation) return;

      // Limpiar watcher anterior si existe
      if (gpsWatcherRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatcherRef.current);
      }

      gpsWatcherRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setGpsError('');
          updateOperatorLocation(
            activeBooking.id,
            user.id,
            pos.coords.latitude,
            pos.coords.longitude
          );
        },
        (err) => {
          console.warn('GPS error:', err.message);
          if (err.code === 1) {
            setGpsError('⚠️ Ubicación bloqueada. Ve a Configuración > Permisos del sitio > Ubicación y permite el acceso para que el cliente pueda rastrearte.');
          } else {
            setGpsError('⚠️ No se pudo obtener tu ubicación. Verifica que el GPS esté activado.');
          }
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }

    // Detener tracking si ya no hay servicio en_camino
    if (!activeBooking && gpsWatcherRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatcherRef.current);
      gpsWatcherRef.current = null;
      setTrackingBookingId(null);
    }

    return () => {
      if (gpsWatcherRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatcherRef.current);
      }
    };
  }, [bookings, user]);

  const fetchOperatorBookings = async () => {
    try {
      setLoading(true);
      let query = supabase.from('bookings').select('*, customer:client_id(full_name, phone)').order('scheduled_date', { ascending: true });
      if (profile?.role !== 'admin') {
        query = query.eq('operator_id', user.id);
      } else {
        query = query.in('status', ['confirmado', 'en_camino', 'en_proceso', 'finalizado']);
      }
      const { data, error } = await query;
      if (error) throw error;
      setBookings(data || []);
    } catch (err) {
      console.error('Error fetching operator services:', err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Cargar checklist del servicio ──────────────────────────────
  const loadChecklist = async (booking) => {
    const { data, error } = await supabase
      .from('service_checklist')
      .select('*')
      .eq('service_id', booking.service_id)
      .order('sort_order', { ascending: true });

    if (error || !data || data.length === 0) {
      // Si no hay checklist configurado, permitir finalizar directamente
      return null;
    }
    return data.map(item => ({ ...item, checked: false }));
  };

  // ── Iniciar proceso de finalización con checklist ──────────────
  const handleFinalizeClick = async (bookingId) => {
    const booking = bookings.find(b => b.id === bookingId);
    if (!booking) return;

    const items = await loadChecklist(booking);
    if (!items) {
      // Sin checklist, finalizar directo
      updateStatus(bookingId, 'finalizado', 'done');
      return;
    }
    setChecklist(items);
    setPendingFinalize(bookingId);
    setChecklistModal(true);
  };

  const toggleCheckItem = (id) => {
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const confirmFinalize = async () => {
    const allChecked = checklist.every(item => item.checked);
    if (!allChecked) {
      alert('Por favor completa todos los ítems del checklist antes de finalizar.');
      return;
    }
    setChecklistModal(false);
    await updateStatus(pendingFinalize, 'finalizado', 'done');
    setPendingFinalize(null);
    setChecklist([]);
  };

  // ── Upload de fotos ────────────────────────────────────────────
  const handlePhotoUpload = async (file, bookingId, type) => {
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const ext      = file.name.split('.').pop();
      const path     = `${bookingId}/${type}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('service-photos')
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const column = type === 'before' ? 'photo_before' : 'photo_after';
      const { error: updateError } = await supabase
        .from('bookings')
        .update({ [column]: path, updated_at: new Date().toISOString() })
        .eq('id', bookingId);
      if (updateError) throw updateError;

      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, [column]: path } : b
      ));
      if (selectedBooking?.id === bookingId) {
        setSelectedBooking(prev => ({ ...prev, [column]: path }));
      }
      alert(`Foto ${type === 'before' ? '"Antes"' : '"Después"'} guardada ✅`);
    } catch (err) {
      alert(`Error al subir foto: ${err.message}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ── Reporte de incidencia ──────────────────────────────────────
  const sendIncidentReport = async () => {
    if (!incidentNote.trim()) { alert('Describe el problema antes de enviar.'); return; }
    setSendingIncident(true);
    try {
      const { error } = await supabase.from('incidents').insert({
        booking_id:   incidentBooking.id,
        operator_id:  user.id,
        description:  incidentNote,
        status:       'open',
        created_at:   new Date().toISOString(),
      });
      if (error) throw error;
      alert('⚠️ Incidencia reportada al administrador.');
      setIncidentModal(false);
      setIncidentNote('');
      setIncidentBooking(null);
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setSendingIncident(false);
    }
  };

  // ── updateStatus ───────────────────────────────────────────────
  const updateStatus = async (bookingId, newStatus, eventName) => {
    setUpdatingId(bookingId);
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', bookingId);
      if (error) throw error;

      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, status: newStatus } : b
      ));

      const booking = bookings.find(b => b.id === bookingId);
      if (booking && booking.customer?.phone) {
        try {
          await sendWhatsApp(eventName, booking.customer?.phone, {
            booking_ref:  booking.booking_ref,
            service_name: booking.service_name
          });
        } catch (wsErr) {
          console.warn('WhatsApp no enviado:', wsErr.message);
        }
      }

      if (selectedBooking?.id === bookingId) {
        setSelectedBooking(prev => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      alert(`Error al actualizar estado: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const openInMaps = (address) => {
    if (!address) return;
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  };

  const getPhotoUrl = (path) => {
    if (!path) return null;
    return path.startsWith('http') ? path : `${SUPABASE_URL}/storage/v1/object/public/service-photos/${path}`;
  };

  const pendingServices   = bookings.filter(b => b.status === 'confirmado');
  const activeServices    = bookings.filter(b => ['en_camino', 'en_proceso'].includes(b.status));
  const completedServices = bookings.filter(b => b.status === 'finalizado');
  const currentList = activeTab === 'pendientes' ? pendingServices : activeTab === 'activos' ? activeServices : completedServices;

  const getStatusStyle = (status) => {
    switch (status) {
      case 'confirmado': return { bg: '#dbeafe', text: '#1e40af', label: 'Confirmado' };
      case 'en_camino':  return { bg: '#e0e7ff', text: '#3730a3', label: 'En camino' };
      case 'en_proceso': return { bg: '#ffedd5', text: '#9a3412', label: 'Lavando' };
      case 'finalizado': return { bg: '#dcfce7', text: '#166534', label: 'Finalizado' };
      default:           return { bg: '#f3f4f6', text: '#374151', label: status };
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', paddingBottom: 80 }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '32px 24px 28px', borderRadius: '0 0 32px 32px', boxShadow: '0 4px 24px rgba(30,64,175,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>🚗 Mis Servicios</h1>
            <p style={{ color: '#bfdbfe', fontSize: 13, margin: 0 }}>Hola, {user?.user_metadata?.full_name || 'Operador'}</p>
          </div>
          <button onClick={() => signOut()}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}>
            <LogOut size={16} />
          </button>
        </div>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.15)', padding: 4, borderRadius: 14, gap: 4 }}>
          {[
            { id: 'pendientes',  label: 'Pendientes',  count: pendingServices.length },
            { id: 'activos',     label: 'Activos',     count: activeServices.length },
            { id: 'completados', label: 'Historial',   count: completedServices.length },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.2s', background: activeTab === tab.id ? '#fff' : 'transparent', color: activeTab === tab.id ? '#1e40af' : '#bfdbfe', boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.12)' : 'none' }}>
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenido ── */}
      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>

        {/* Banner de error GPS */}
        {gpsError && (
          <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>📍</span>
            <div>
              <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 13, marginBottom: 4 }}>Permiso de ubicación requerido</div>
              <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5 }}>{gpsError}</div>
              <button
                onClick={() => window.location.reload()}
                style={{ marginTop: 8, padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Reintentar
              </button>
            </div>
          </div>
        )}
        {loading ? (
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p style={{ color: '#9ca3af', fontWeight: 500 }}>Cargando tus servicios...</p>
          </div>
        ) : currentList.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <p style={{ color: '#9ca3af', fontWeight: 500 }}>No tienes servicios en esta sección</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {currentList.map(booking => {
              const sc = getStatusStyle(booking.status);
              return (
                <div key={booking.id} onClick={() => setSelectedBooking(booking)}
                  style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 18px', cursor: 'pointer', border: '2px solid transparent' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '3px 10px', borderRadius: 20, letterSpacing: 0.5 }}>{booking.booking_ref}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.label}</span>
                  </div>
                  <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 16, marginBottom: 12 }}>{booking.service_name}</div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
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
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {booking.status === 'confirmado' && (
                      <button onClick={e => { e.stopPropagation(); updateStatus(booking.id, 'en_camino', 'on_the_way'); }}
                        disabled={updatingId === booking.id}
                        style={{ flex: 1, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                        <Navigation size={14} /> Iniciar Viaje
                      </button>
                    )}
                    {booking.status === 'en_camino' && (
                      <button onClick={e => { e.stopPropagation(); updateStatus(booking.id, 'en_proceso', 'washing'); }}
                        disabled={updatingId === booking.id}
                        style={{ flex: 1, background: '#f97316', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Play size={14} /> Empezar Lavado
                      </button>
                    )}
                    {booking.status === 'en_proceso' && (
                      <>
                        <button onClick={e => { e.stopPropagation(); setPhotoBooking(booking); setPhotoModal(true); }}
                          style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <Camera size={14} /> Fotos
                        </button>
                        <button onClick={e => { e.stopPropagation(); handleFinalizeClick(booking.id); }}
                          disabled={updatingId === booking.id}
                          style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <Check size={14} /> Finalizar
                        </button>
                      </>
                    )}
                    {['confirmado','en_camino','en_proceso'].includes(booking.status) && (
                      <button onClick={e => { e.stopPropagation(); setIncidentBooking(booking); setIncidentModal(true); }}
                        style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
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

      {/* ════ MODAL DETALLE ════ */}
      {selectedBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#f3f4f6', overflowY: 'auto' }}>
          <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <button onClick={() => setSelectedBooking(null)}
                style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                ← Cerrar
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Detalle del Servicio</div>
                <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 13 }}>{selectedBooking.booking_ref}</div>
              </div>
              <div style={{ width: 80 }} />
            </div>

            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 20, padding: '20px 22px', color: '#fff', marginBottom: 16, boxShadow: '0 8px 32px rgba(30,64,175,0.3)' }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{selectedBooking.service_name}</h2>
              <p style={{ color: '#bfdbfe', fontSize: 13, margin: '0 0 16px' }}>
                {selectedBooking.vehicle_brand} {selectedBooking.vehicle_model} · {selectedBooking.vehicle_color}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>🕐 {selectedBooking.scheduled_time}</span>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>💰 ${selectedBooking.total_price || selectedBooking.service_price}</span>
              </div>
            </div>

            {/* Fotos antes/después */}
            {selectedBooking.status === 'en_proceso' && (
              <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 18px', marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>📸 Evidencia Fotográfica</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { type: 'before', label: '📷 Antes', field: 'photo_before' },
                    { type: 'after',  label: '📷 Después', field: 'photo_after' },
                  ].map(({ type, label, field }) => (
                    <div key={type} style={{ textAlign: 'center' }}>
                      {getPhotoUrl(selectedBooking[field]) ? (
                        <img src={getPhotoUrl(selectedBooking[field])} alt={label}
                          style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 10, marginBottom: 6 }} />
                      ) : (
                        <div style={{ width: '100%', height: 100, background: '#f9fafb', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, border: '1.5px dashed #e5e7eb' }}>
                          <Camera size={24} color="#d1d5db" />
                        </div>
                      )}
                      <label style={{ display: 'block', padding: '8px 0', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        {uploadingPhoto ? '⏳' : label}
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                          onChange={e => handlePhotoUpload(e.target.files[0], selectedBooking.id, type)} />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Cliente</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 16 }}>{selectedBooking.customer?.full_name}</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>{selectedBooking.customer?.phone}</div>
                </div>
                <a href={`tel:${selectedBooking.customer?.phone}`}
                  style={{ background: '#10b981', padding: '10px 12px', borderRadius: 12, color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
                  <Phone size={18} />
                </a>
              </div>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 18px', marginBottom: 100 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Ubicación</div>
              <p style={{ fontWeight: 500, color: '#1f2937', fontSize: 14, margin: '0 0 14px', lineHeight: 1.5 }}>{selectedBooking.address_line}</p>
              <button onClick={() => openInMaps(selectedBooking.address_line)}
                style={{ width: '100%', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '12px 0', fontSize: 13, fontWeight: 700, color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Navigation size={14} /> Abrir en Google Maps
              </button>
            </div>

            {/* Botón de acción principal */}
            <div style={{ position: 'fixed', bottom: 24, left: 20, right: 20 }}>
              {selectedBooking.status === 'confirmado' && (
                <button onClick={() => updateStatus(selectedBooking.id, 'en_camino', 'on_the_way')} disabled={updatingId === selectedBooking.id}
                  style={{ width: '100%', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 32px rgba(59,130,246,0.4)' }}>
                  {updatingId === selectedBooking.id ? '⏳ Cargando...' : <><Navigation size={18} /> INICIAR VIAJE AHORA</>}
                </button>
              )}
              {selectedBooking.status === 'en_camino' && (
                <button onClick={() => updateStatus(selectedBooking.id, 'en_proceso', 'washing')} disabled={updatingId === selectedBooking.id}
                  style={{ width: '100%', background: '#f97316', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 32px rgba(249,115,22,0.4)' }}>
                  <Play size={18} /> LLEGUÉ / EMPEZAR LAVADO
                </button>
              )}
              {selectedBooking.status === 'en_proceso' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setIncidentBooking(selectedBooking); setIncidentModal(true); }}
                    style={{ background: '#fef2f2', color: '#dc2626', border: '1.5px solid #fecaca', borderRadius: 14, padding: '16px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={18} />
                  </button>
                  <button onClick={() => handleFinalizeClick(selectedBooking.id)} disabled={updatingId === selectedBooking.id}
                    style={{ flex: 1, background: '#10b981', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 32px rgba(16,185,129,0.4)' }}>
                    <Check size={18} /> FINALIZAR SERVICIO
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL CHECKLIST ════ */}
      {checklistModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxWidth: 460, width: '100%', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>✅ Checklist de Calidad</h3>
              <button onClick={() => setChecklistModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bfdbfe', fontSize: 22 }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 16px' }}>Confirma que cada punto fue completado antes de finalizar el servicio.</p>
              <div style={{ display: 'grid', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
                {checklist.map(item => (
                  <button key={item.id} onClick={() => toggleCheckItem(item.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: item.checked ? '2px solid #10b981' : '1.5px solid #e5e7eb', background: item.checked ? '#f0fdf4' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                    {item.checked
                      ? <CheckSquare size={20} color="#10b981" style={{ flexShrink: 0 }} />
                      : <Square size={20} color="#d1d5db" style={{ flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, fontWeight: item.checked ? 600 : 400, color: item.checked ? '#166534' : '#374151' }}>{item.item}</span>
                  </button>
                ))}
              </div>
              <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: checklist.every(i => i.checked) ? '#f0fdf4' : '#fef9c3', border: `1px solid ${checklist.every(i => i.checked) ? '#bbf7d0' : '#fde68a'}` }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: checklist.every(i => i.checked) ? '#166534' : '#854d0e' }}>
                  {checklist.filter(i => i.checked).length}/{checklist.length} ítems completados
                </span>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button onClick={() => setChecklistModal(false)}
                style={{ flex: 1, padding: '10px 0', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmFinalize}
                style={{ flex: 2, padding: '10px 0', background: checklist.every(i => i.checked) ? '#10b981' : '#9ca3af', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {checklist.every(i => i.checked) ? '✅ Confirmar y Finalizar' : 'Completa el checklist'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL FOTOS ════ */}
      {photoModal && photoBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxWidth: 400, width: '100%', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>📸 Evidencia Fotográfica</h3>
              <button onClick={() => setPhotoModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e0e7ff', fontSize: 22 }}>×</button>
            </div>
            <div style={{ padding: 20, display: 'grid', gap: 14 }}>
              {[
                { type: 'before', label: '📷 Foto ANTES del servicio', field: 'photo_before' },
                { type: 'after',  label: '📷 Foto DESPUÉS del servicio', field: 'photo_after' },
              ].map(({ type, label, field }) => (
                <div key={type}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>{label}</div>
                  {getPhotoUrl(photoBooking[field]) ? (
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <img src={getPhotoUrl(photoBooking[field])} alt={label}
                        style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: 10 }} />
                      <span style={{ position: 'absolute', top: 8, right: 8, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20 }}>✅ Guardada</span>
                    </div>
                  ) : null}
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 10, border: '1.5px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <Upload size={14} /> {uploadingPhoto ? 'Subiendo...' : getPhotoUrl(photoBooking[field]) ? 'Cambiar foto' : 'Subir foto'}
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                      onChange={e => handlePhotoUpload(e.target.files[0], photoBooking.id, type)} />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL INCIDENCIA ════ */}
      {incidentModal && incidentBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxWidth: 420, width: '100%', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>⚠️ Reportar Incidencia</h3>
              <button onClick={() => { setIncidentModal(false); setIncidentNote(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fecaca', fontSize: 22 }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ background: '#fef2f2', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#991b1b' }}>
                Servicio: <strong>{incidentBooking.booking_ref}</strong> — {incidentBooking.service_name}
              </div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Describe el problema *</label>
              <textarea value={incidentNote} onChange={e => setIncidentNote(e.target.value)}
                placeholder="Ej: El cliente no se encuentra en casa, hay un problema con el vehículo, se requiere más tiempo..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #fecaca', fontSize: 13, outline: 'none', height: 100, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937' }} />
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10 }}>
              <button onClick={() => { setIncidentModal(false); setIncidentNote(''); }}
                style={{ flex: 1, padding: '10px 0', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={sendIncidentReport} disabled={sendingIncident}
                style={{ flex: 2, padding: '10px 0', background: sendingIncident ? '#9ca3af' : '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {sendingIncident ? '⏳ Enviando...' : '⚠️ Enviar al Admin'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorView;
