// src/lib/whatsapp.js
// Helper para enviar notificaciones WhatsApp desde el frontend
// Llama a la Edge Function de Supabase que se comunica con Twilio

import { supabase } from './supabase'

/**
 * Envía un mensaje de WhatsApp al cliente
 * @param {string} event   - Tipo de evento: booking_created, operator_assigned, on_the_way, arrived, washing, done
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

    if (error) throw error
    console.log(`✅ WhatsApp enviado [${event}] a ${phone}`)
    return data
  } catch (err) {
    // No lanzar error — las notificaciones nunca deben bloquear el flujo principal
    console.error(`⚠️ WhatsApp falló [${event}]:`, err.message)
  }
}
