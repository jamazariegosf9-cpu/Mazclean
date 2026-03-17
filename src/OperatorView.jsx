import React, { useState, useEffect } from 'react';
import {
  MapPin, Clock, Phone, Navigation, CheckCircle2,
  LogOut, ChevronRight, AlertCircle, Play, Check
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
import { sendWhatsApp } from './lib/whatsapp';

const OperatorView = () => {
  const { user, profile, signOut } = useAuth();
  const [bookings, setBookings]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState('pendientes');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [updatingId, setUpdatingId]     = useState(null);

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
            booking_ref: booking.booking_ref,
            service_name: booking.service_name
          });
        } catch (wsErr) {
          console.warn('WhatsApp de cambio de estado no enviado:', wsErr.message);
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
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
    window.open(url, '_blank');
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
          <button
            onClick={() => signOut()}
            style={{ background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 10, padding: '8px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center' }}
          >
            <LogOut size={16} />
          </button>
        </div>

        {/* Tabs tipo cápsula */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.15)', padding: 4, borderRadius: 14, gap: 4 }}>
          {[
            { id: 'pendientes',  label: 'Pendientes',  count: pendingServices.length },
            { id: 'activos',     label: 'Activos',     count: activeServices.length },
            { id: 'completados', label: 'Historial',   count: completedServices.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '10px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.2s',
                background: activeTab === tab.id ? '#fff' : 'transparent',
                color: activeTab === tab.id ? '#1e40af' : '#bfdbfe',
                boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.12)' : 'none',
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* ── Contenido ── */}
      <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto' }}>
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
                <div
                  key={booking.id}
                  onClick={() => setSelectedBooking(booking)}
                  style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 18px', cursor: 'pointer', transition: 'transform 0.15s', border: '2px solid transparent' }}
                >
                  {/* Folio + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '3px 10px', borderRadius: 20, letterSpacing: 0.5 }}>
                      {booking.booking_ref}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>
                      {sc.label}
                    </span>
                  </div>

                  {/* Nombre servicio */}
                  <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 16, marginBottom: 12 }}>{booking.service_name}</div>

                  {/* Info */}
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

                  {/* Botones de acción rápida */}
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f3f4f6', display: 'flex', gap: 8 }}>
                    {booking.status === 'confirmado' && (
                      <button
                        onClick={e => { e.stopPropagation(); updateStatus(booking.id, 'en_camino', 'on_the_way'); }}
                        disabled={updatingId === booking.id}
                        style={{ flex: 1, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
                      >
                        <Navigation size={14} /> Iniciar Viaje
                      </button>
                    )}
                    {booking.status === 'en_camino' && (
                      <button
                        onClick={e => { e.stopPropagation(); updateStatus(booking.id, 'en_proceso', 'washing'); }}
                        disabled={updatingId === booking.id}
                        style={{ flex: 1, background: '#f97316', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 12px rgba(249,115,22,0.3)' }}
                      >
                        <Play size={14} /> Empezar Lavado
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

            {/* Header modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <button
                onClick={() => setSelectedBooking(null)}
                style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}
              >
                ← Cerrar
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>Detalle del Servicio</div>
                <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 13 }}>{selectedBooking.booking_ref}</div>
              </div>
              <div style={{ width: 80 }} />
            </div>

            {/* Card principal azul */}
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', borderRadius: 20, padding: '20px 22px', color: '#fff', marginBottom: 16, boxShadow: '0 8px 32px rgba(30,64,175,0.3)' }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>{selectedBooking.service_name}</h2>
              <p style={{ color: '#bfdbfe', fontSize: 13, margin: '0 0 16px' }}>
                {selectedBooking.vehicle_brand} {selectedBooking.vehicle_model} · {selectedBooking.vehicle_color}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                  🕐 {selectedBooking.scheduled_time}
                </span>
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700 }}>
                  💰 ${selectedBooking.total_price || selectedBooking.service_price}
                </span>
              </div>
            </div>

            {/* Info cliente */}
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Cliente</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 16 }}>{selectedBooking.customer?.full_name}</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginTop: 3 }}>{selectedBooking.customer?.phone}</div>
                </div>
                <a
                  href={`tel:${selectedBooking.customer?.phone}`}
                  style={{ background: '#10b981', padding: '10px 12px', borderRadius: 12, color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}
                >
                  <Phone size={18} />
                </a>
              </div>
            </div>

            {/* Ubicación */}
            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '16px 18px', marginBottom: 100 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Ubicación</div>
              <p style={{ fontWeight: 500, color: '#1f2937', fontSize: 14, margin: '0 0 14px', lineHeight: 1.5 }}>{selectedBooking.address_line}</p>
              <button
                onClick={() => openInMaps(selectedBooking.address_line)}
                style={{ width: '100%', background: '#eff6ff', border: '1.5px solid #bfdbfe', borderRadius: 10, padding: '12px 0', fontSize: 13, fontWeight: 700, color: '#1e40af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Navigation size={14} /> Abrir en Google Maps
              </button>
            </div>

            {/* Botón de acción principal */}
            <div style={{ position: 'fixed', bottom: 24, left: 20, right: 20 }}>
              {selectedBooking.status === 'confirmado' && (
                <button
                  onClick={() => updateStatus(selectedBooking.id, 'en_camino', 'on_the_way')}
                  disabled={updatingId === selectedBooking.id}
                  style={{ width: '100%', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 32px rgba(59,130,246,0.4)' }}
                >
                  {updatingId === selectedBooking.id ? '⏳ Cargando...' : <><Navigation size={18} /> INICIAR VIAJE AHORA</>}
                </button>
              )}
              {selectedBooking.status === 'en_camino' && (
                <button
                  onClick={() => updateStatus(selectedBooking.id, 'en_proceso', 'washing')}
                  disabled={updatingId === selectedBooking.id}
                  style={{ width: '100%', background: '#f97316', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 32px rgba(249,115,22,0.4)' }}
                >
                  <Play size={18} /> LLEGUÉ / EMPEZAR LAVADO
                </button>
              )}
              {selectedBooking.status === 'en_proceso' && (
                <button
                  onClick={() => updateStatus(selectedBooking.id, 'finalizado', 'done')}
                  disabled={updatingId === selectedBooking.id}
                  style={{ width: '100%', background: '#10b981', color: '#fff', border: 'none', borderRadius: 16, padding: '18px 0', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 32px rgba(16,185,129,0.4)' }}
                >
                  <Check size={18} /> FINALIZAR SERVICIO
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorView;
