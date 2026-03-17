import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Calendar, 
  Clock, 
  MapPin, 
  CheckCircle2, 
  AlertCircle, 
  Search,
  Filter,
  MoreVertical,
  ExternalLink,
  Phone,
  Car,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { sendWhatsApp } from './lib/whatsapp';

const AdminView = () => {
  const [bookings, setBookings] = useState([]);
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Estados para estadísticas
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    active: 0,
    completed: 0
  });

  useEffect(() => {
    fetchData();
    
    // Suscripción en tiempo real para actualizaciones de estatus
    const channel = supabase
      .channel('admin-updates')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'bookings' 
      }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 1. Obtener reservaciones con joins de perfiles
      const { data: bookingsData, error: bError } = await supabase
        .from('bookings')
        .select(`
          *,
          customer:client_id(full_name, phone),
          operator:operator_id(full_name, phone)
        `)
        .order('created_at', { ascending: false });

      if (bError) throw bError;

      // 2. Obtener operadores disponibles
      const { data: operatorsData, error: oError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'operador');

      if (oError) throw oError;

      setBookings(bookingsData || []);
      setOperators(operatorsData || []);
      
      // Calcular estadísticas
      const newStats = {
        total: bookingsData.length,
        pending: bookingsData.filter(b => b.status === 'pendiente').length,
        active: bookingsData.filter(b => ['confirmado', 'en_camino', 'en_proceso'].includes(b.status)).length,
        completed: bookingsData.filter(b => b.status === 'finalizado').length
      };
      setStats(newStats);

    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * ESTA ES LA FUNCIÓN CORREGIDA
   */
  const assignOperator = async (bookingId, operatorId) => {
    if (!operatorId) return;
    setAssigning(bookingId);

    try {
      // 1. ACTUALIZACIÓN EN BASE DE DATOS (Prioridad Absoluta)
      // Usamos 'confirmado' que es el valor real de tu ENUM
      const { error } = await supabase
        .from('bookings')
        .update({
          operator_id: operatorId,
          status: 'confirmado', // Sincronizado con el ENUM de Supabase
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      if (error) {
        console.error('Error de Supabase:', error.message);
        alert(`Error al asignar: ${error.message}`);
        return; 
      }

      // 2. ACTUALIZACIÓN LOCAL DE LA UI
      setBookings(prev => prev.map(b =>
        b.id === bookingId ? { ...b, operator_id: operatorId, status: 'confirmado' } : b
      ));
      
      // 3. ENVÍO DE WHATSAPP (Aislado en su propio bloque try/catch)
      const booking = bookings.find(b => b.id === bookingId);
      const operator = operators.find(o => o.id === operatorId);
      
      // Buscamos el teléfono en booking.customer (del join) o booking.profiles
      const targetPhone = booking.customer?.phone || booking.profiles?.phone;

      if (booking && targetPhone) {
        try {
          // No bloqueamos el flujo principal si Twilio falla o tarda
          await sendWhatsApp('operator_assigned', targetPhone, {
            booking_ref:    booking.booking_ref,
            service_name:   booking.service_name,
            scheduled_date: booking.scheduled_date,
            scheduled_time: booking.scheduled_time,
            total_price:    booking.total_price || booking.service_price,
            operator_name:  operator?.full_name || 'nuestro operador',
          });
        } catch (wsErr) {
          // Logueamos pero no interrumpimos la experiencia del admin
          console.warn('WhatsApp omitido por error de Edge Function o límite:', wsErr.message);
        }
      }

      setIsModalOpen(false);

    } catch (err) {
      console.error('Error inesperado en asignación:', err);
      alert('Ocurrió un error inesperado al procesar la asignación.');
    } finally {
      setAssigning(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pendiente': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'confirmado': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'en_camino': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'en_proceso': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'finalizado': return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelado': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredBookings = bookings.filter(booking => {
    const matchesSearch = 
      booking.booking_ref?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.customer?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.service_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header & Stats Section */}
      <div className="bg-white border-b border-gray-200 pt-8 pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
              <p className="mt-1 text-sm text-gray-500">Gestiona reservaciones, asigna operadores y monitorea el servicio.</p>
            </div>
            <div className="mt-4 md:mt-0 flex space-x-3">
              <button 
                onClick={fetchData}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-sm font-medium text-gray-500">Total Servicios</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-sm font-medium text-gray-500 text-yellow-600">Pendientes</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pending}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-sm font-medium text-gray-500 text-blue-600">En Curso</p>
              <p className="text-2xl font-bold text-gray-900">{stats.active}</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <p className="text-sm font-medium text-gray-500 text-green-600">Completados</p>
              <p className="text-2xl font-bold text-gray-900">{stats.completed}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {/* Filtros */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por folio, cliente o servicio..."
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center space-x-2 overflow-x-auto pb-2 md:pb-0">
            <Filter className="h-4 w-4 text-gray-500 mr-2 flex-shrink-0" />
            {[
              { id: 'all', label: 'Todos' },
              { id: 'pendiente', label: 'Pendientes' },
              { id: 'confirmado', label: 'Confirmados' },
              { id: 'en_camino', label: 'En Camino' },
              { id: 'en_proceso', label: 'Lavando' },
              { id: 'finalizado', label: 'Listos' }
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

        {/* Tabla / Listado */}
        <div className="bg-white shadow-sm border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Servicio / Folio</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cliente</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agenda</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estatus</th>
                  <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500 italic">Cargando datos...</td>
                  </tr>
                ) : filteredBookings.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-12 text-center text-gray-500 italic">No se encontraron reservaciones.</td>
                  </tr>
                ) : (
                  filteredBookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-gray-900">{booking.service_name}</div>
                        <div className="flex items-center mt-1 text-xs text-gray-400 font-mono">
                          {booking.booking_ref}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{booking.customer?.full_name}</div>
                        <div className="flex items-center mt-1 text-xs text-gray-500">
                          <Phone className="h-3 w-3 mr-1" /> {booking.customer?.phone}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm text-gray-900">
                          <Calendar className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
                          {booking.scheduled_date}
                        </div>
                        <div className="flex items-center mt-1 text-xs text-gray-500">
                          <Clock className="h-3.5 w-3.5 mr-1.5 text-blue-500" />
                          {booking.scheduled_time}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(booking.status)}`}>
                          {booking.status === 'pendiente' && <AlertCircle className="mr-1 h-3 w-3" />}
                          {booking.status === 'finalizado' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                          {booking.status.charAt(0).toUpperCase() + booking.status.slice(1).replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={() => {
                              setSelectedBooking(booking);
                              setIsModalOpen(true);
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                            title="Asignar Operador"
                          >
                            <Users className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal de Asignación Personalizado */}
      {isModalOpen && selectedBooking && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-lg font-bold text-gray-900">Gestionar Reservación</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">{selectedBooking.booking_ref}</span>
                  <span className="text-sm font-bold text-gray-900">${selectedBooking.total_price || selectedBooking.service_price}</span>
                </div>
                <h4 className="text-lg font-bold text-gray-900">{selectedBooking.service_name}</h4>
                <div className="mt-3 flex items-center text-sm text-gray-600">
                  <MapPin className="h-4 w-4 mr-2 text-blue-500" />
                  {selectedBooking.address_line || 'Sin dirección registrada'}
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-sm font-bold text-gray-700">Asignar Operador Responsable</label>
                <div className="grid grid-cols-1 gap-2">
                  {operators.map((op) => (
                    <button
                      key={op.id}
                      onClick={() => assignOperator(selectedBooking.id, op.id)}
                      disabled={assigning === selectedBooking.id}
                      className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                        selectedBooking.operator_id === op.id 
                        ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-100' 
                        : 'border-gray-100 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold mr-3">
                          {op.full_name?.charAt(0)}
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-bold text-gray-900">{op.full_name}</p>
                          <p className="text-xs text-gray-500">{op.phone}</p>
                        </div>
                      </div>
                      {selectedBooking.operator_id === op.id ? (
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-300" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 text-right">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 mr-2"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminView;