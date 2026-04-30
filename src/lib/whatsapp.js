// src/lib/whatsapp.js
import { supabase } from './supabase'

/**
 * Envía un mensaje de WhatsApp al cliente
 * @param {string} event   - Tipo de evento: booking_created, operator_assigned,
 *                           on_the_way, llegando, washing, done
 * @param {string} phone   - Teléfono del cliente (10 dígitos mexicanos)
 * @param {object} booking - Datos de la reservación
 */
export async function sendWhatsApp(event, phone, booking) {
  if (!phone) {
    console.warn('sendWhatsApp: no hay teléfono del cliente, omitiendo notificación')
    return
  }

  try {
    const { data, error } = await supabase.functions.invoke('send-whatsapp', {
      body: { event, phone, booking }
    })

    if (error) {
      console.warn(`⚠️ Twilio Límite/Error [${event}]:`, error.message)
      return { success: false, error: error.message }
    }

    console.log(`✅ WhatsApp enviado [${event}] a ${phone}`)
    return data
  } catch (err) {
    console.error(`⚠️ Error crítico en invocación [${event}]:`, err.message)
    return { success: false, error: err.message }
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
  try {
    const { data, error } = await supabase.functions.invoke('track-operator', {
      body: { booking_id: bookingId, operator_id: operatorId, lat, lng }
    })

    if (error) {
      console.warn('⚠️ track-operator error:', error.message)
      return { success: false, error: error.message }
    }

    return data
  } catch (err) {
    console.error('⚠️ Error en updateOperatorLocation:', err.message)
    return { success: false, error: err.message }
  }
}
