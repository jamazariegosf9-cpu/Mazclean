// src/lib/whatsapp.js
// v2 — fetch directo a Edge Function para evitar lock de Supabase en móvil
// El lock de supabase.functions.invoke() bloquea llamadas en mobile WebView

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * Envía un mensaje de WhatsApp al cliente
 * @param {string} event   - Tipo de evento: booking_created, operator_assigned,
 *                           on_the_way, llegando, washing, done
 * @param {string} phone   - Teléfono del cliente (10 dígitos mexicanos)
 * @param {object} booking - Datos de la reservación
 */
export async function sendWhatsApp(event, phone, booking) {
  if (!phone) {
    console.warn('sendWhatsApp: no hay teléfono del cliente, omitiendo notificación');
    return;
  }

  // Obtener token fresco desde localStorage — nunca getSession() en móvil
  let token = SUPABASE_ANON_KEY;
  try {
    const stored = localStorage.getItem('mazclean-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY;
    }
  } catch {}

  try {
    // fetch directo — evita el lock de supabase.functions.invoke() en móvil
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey':        SUPABASE_ANON_KEY,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ event, phone, booking }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.warn(`⚠️ sendWhatsApp Error [${event}]:`, data?.error || res.status);
      return { success: false, error: data?.error || `HTTP ${res.status}` };
    }

    console.log(`✅ WhatsApp enviado [${event}] a ${phone}`);
    return { success: true, ...data };
  } catch (err) {
    console.error(`⚠️ Error crítico en sendWhatsApp [${event}]:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Envía ubicación del operador a la Edge Function track-operator.
 * Actualiza operator_locations y dispara WhatsApp "llegando" si está a ~5 min.
 * @param {string} bookingId   - ID de la reservación activa
 * @param {string} operatorId  - ID del operador
 * @param {number} lat         - Latitud actual del operador
 * @param {number} lng         - Longitud actual del operador
 */
export async function updateOperatorLocation(bookingId, operatorId, lat, lng) {
  // Obtener token fresco desde localStorage
  let token = SUPABASE_ANON_KEY;
  try {
    const stored = localStorage.getItem('mazclean-auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY;
    }
  } catch {}

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/track-operator`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey':        SUPABASE_ANON_KEY,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ booking_id: bookingId, operator_id: operatorId, lat, lng }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.warn('⚠️ track-operator error:', data?.error || res.status);
      return { success: false, error: data?.error || `HTTP ${res.status}` };
    }

    return data;
  } catch (err) {
    console.error('⚠️ Error en updateOperatorLocation:', err.message);
    return { success: false, error: err.message };
  }
}