import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Clock, 
  Phone, 
  Navigation, 
  CheckCircle2, 
  Camera, 
  LogOut,
  ChevronRight,
  ExternalLink,
  AlertCircle,
  Play,
  Check
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
import { sendWhatsApp } from './lib/whatsapp';

const OperatorView = () => {
  const { user, profile, signOut } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pendientes');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    if (user) {
      fetchOperatorBookings();
      
      // Suscripción en tiempo real para cambios asignados a este operador
      const channel = supabase
        .channel('operator-changes')
        .on('postgres_changes', { 
          event: '*', 
          schema: 'public', 
          table: 'bookings',
          filter: `operator_id=eq.${user.id}`
        }, () => {
          fetchOperatorBookings();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchOperatorBookings = async () => {
    try {
      setLoading(true);
      // Admin ve todas las activas, operador solo las suyas
      let query = supabase.from('bookings').select('*').order('scheduled_date', { ascending: true });
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
      // 1. Actualización en Base de Datos
      const { error } = await supabase
        .from('bookings')
        .update({ 
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookingId);

      if (error) throw error;

      // 2. Actualización Local
      setBookings(prev => prev.map(b => 
        b.id === bookingId ? { ...b, status: newStatus } : b
      ));

      // 3. Notificación WhatsApp (Opcional/Blindada)
      const booking = bookings.find(b => b.id === bookingId);
      if (booking && booking.customer?.phone) {
        try {
          await sendWhatsApp(eventName, booking.customer.phone, {
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

  // FILTROS DE PESTAÑAS (CORREGIDOS SEGÚN ENUM)
  const pendingServices = bookings.filter(b => b.status === 'confirmado');
  const activeServices = bookings.filter(b => ['en_camino', 'en_proceso'].includes(b.status));
  const completedServices = bookings.filter(b => b.status === 'finalizado');

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header Operador */}
      <div className="bg-slate-900 text-white px-6 pt-12 pb-8 rounded-b-[40px] shadow-lg">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold">Mis Servicios</h1>
            <p className="text-slate-400 text-sm">Hola, {user?.user_metadata?.full_name || 'Operador'}</p>
          </div>
          <button 
            onClick={() => signOut()}
            className="p-2 bg-slate-800 rounded-full text-slate-300 hover:text-white transition-colors"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs de Navegación */}
        <div className="flex bg-slate-800/50 p-1 rounded-2xl">
          {[
            { id: 'pendientes', label: 'Pendientes', count: pendingServices.length },
            { id: 'activos', label: 'Activos', count: activeServices.length },
            { id: 'completados', label: 'Historial', count: completedServices.length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.id 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* Contenido Principal */}
      <div className="px-6 -mt-4">
        {loading ? (
          <div className="bg-white p-12 rounded-3xl shadow-sm text-center flex flex-col items-center">
            <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
            <p className="text-gray-500 font-medium">Cargando tus servicios...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {(activeTab === 'pendientes' ? pendingServices : 
              activeTab === 'activos' ? activeServices : 
              completedServices).map((booking) => (
              <div 
                key={booking.id}
                onClick={() => setSelectedBooking(booking)}
                className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 active:scale-[0.98] transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-md">
                      {booking.booking_ref}
                    </span>
                    <h3 className="text-lg font-bold text-gray-900 mt-2">{booking.service_name}</h3>
                  </div>
                  <div className="bg-gray-50 p-2 rounded-xl">
                    <ChevronRight className="h-5 w-5 text-gray-300" />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mr-3">
                      <Clock className="h-4 w-4 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">{booking.scheduled_time}</p>
                      <p className="text-xs text-gray-400">{booking.scheduled_date}</p>
                    </div>
                  </div>

                  <div className="flex items-center text-sm text-gray-600">
                    <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center mr-3">
                      <MapPin className="h-4 w-4 text-red-500" />
                    </div>
                    <p className="flex-1 truncate">{booking.address_line || 'Ver detalles...'}</p>
                  </div>
                </div>

                {/* Botones de acción rápida por estado */}
                <div className="mt-5 pt-4 border-t border-gray-50 flex gap-2">
                  {booking.status === 'confirmado' && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        updateStatus(booking.id, 'en_camino', 'on_the_way');
                      }}
                      className="flex-1 bg-blue-600 text-white py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
                    >
                      <Navigation className="h-4 w-4" /> Iniciar Viaje
                    </button>
                  )}
                  {booking.status === 'en_camino' && (
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        updateStatus(booking.id, 'en_proceso', 'washing');
                      }}
                      className="flex-1 bg-orange-500 text-white py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                    >
                      <Play className="h-4 w-4" /> Empezar Lavado
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Empty State */}
            {(activeTab === 'pendientes' ? pendingServices : 
              activeTab === 'activos' ? activeServices : 
              completedServices).length === 0 && (
              <div className="py-20 text-center">
                <div className="bg-gray-100 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="h-8 w-8 text-gray-300" />
                </div>
                <p className="text-gray-400 font-medium">No tienes servicios en esta sección</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Detalle de Servicio (Full Screen Mobile) */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 bg-white animate-in slide-in-from-bottom duration-300 overflow-y-auto">
          <div className="p-6">
            <div className="flex justify-between items-center mb-8">
              <button 
                onClick={() => setSelectedBooking(null)}
                className="bg-gray-100 p-2 rounded-xl text-gray-600"
              >
                Cerrar
              </button>
              <div className="text-center">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Detalle del Servicio</p>
                <p className="font-bold text-gray-900">{selectedBooking.booking_ref}</p>
              </div>
              <div className="w-10"></div>
            </div>

            <div className="space-y-6">
              <div className="bg-blue-600 p-6 rounded-[32px] text-white shadow-xl shadow-blue-100">
                <h2 className="text-2xl font-black mb-1">{selectedBooking.service_name}</h2>
                <p className="opacity-80 text-sm mb-4">{selectedBooking.car_brand} {selectedBooking.car_model} • {selectedBooking.car_color}</p>
                <div className="flex items-center gap-4">
                  <div className="bg-white/20 px-3 py-1 rounded-lg text-xs font-bold">
                    {selectedBooking.scheduled_time}
                  </div>
                  <div className="bg-white/20 px-3 py-1 rounded-lg text-xs font-bold">
                    ${selectedBooking.total_price || selectedBooking.service_price}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-gray-50 p-5 rounded-3xl">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-3">Cliente</p>
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-bold text-gray-900 text-lg">{selectedBooking.customer?.full_name}</p>
                      <p className="text-sm text-gray-500">{selectedBooking.customer?.phone}</p>
                    </div>
                    <a 
                      href={`tel:${selectedBooking.customer?.phone}`}
                      className="bg-green-500 p-3 rounded-2xl text-white shadow-lg shadow-green-100"
                    >
                      <Phone className="h-5 w-5" />
                    </a>
                  </div>
                </div>

                <div className="bg-gray-50 p-5 rounded-3xl">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-3">Ubicación</p>
                  <p className="font-medium text-gray-800 mb-4">{selectedBooking.address_line}</p>
                  <button 
                    onClick={() => openInMaps(selectedBooking.address_line)}
                    className="w-full bg-white border border-gray-200 py-4 rounded-2xl font-bold text-blue-600 flex items-center justify-center gap-2"
                  >
                    <Navigation className="h-4 w-4" /> Abrir en Google Maps
                  </button>
                </div>
              </div>

              {/* Botón de acción principal en el modal */}
              <div className="fixed bottom-8 left-6 right-6">
                {selectedBooking.status === 'confirmado' && (
                  <button 
                    onClick={() => updateStatus(selectedBooking.id, 'en_camino', 'on_the_way')}
                    className="w-full bg-blue-600 text-white py-5 rounded-[24px] font-black text-lg shadow-2xl shadow-blue-200 flex items-center justify-center gap-3"
                    disabled={updatingId === selectedBooking.id}
                  >
                    {updatingId === selectedBooking.id ? 'Cargando...' : 'INICIAR VIAJE AHORA'}
                  </button>
                )}
                {selectedBooking.status === 'en_camino' && (
                  <button 
                    onClick={() => updateStatus(selectedBooking.id, 'en_proceso', 'washing')}
                    className="w-full bg-orange-500 text-white py-5 rounded-[24px] font-black text-lg shadow-2xl shadow-orange-200 flex items-center justify-center gap-3"
                  >
                    LLEGUÉ / EMPEZAR LAVADO
                  </button>
                )}
                {selectedBooking.status === 'en_proceso' && (
                  <button 
                    onClick={() => updateStatus(selectedBooking.id, 'finalizado', 'done')}
                    className="w-full bg-green-500 text-white py-5 rounded-[24px] font-black text-lg shadow-2xl shadow-green-200 flex items-center justify-center gap-3"
                  >
                    <Check className="h-6 w-6" /> FINALIZAR SERVICIO
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OperatorView;