// src/lib/whatsapp.js v3.1 [Blindado]
// Agrega: reintentos con backoff exponencial (3 intentos: 0s, 5s, 15s)
// Si los 3 fallan → log en whatsapp_failures
// updateOperatorLocation sin reintentos (se llama cada 30s de todas formas)

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY

function getToken() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed?.access_token || parsed?.session?.access_token || SUPABASE_KEY
    }
  } catch {}
  return SUPABASE_KEY
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function logFailure(event, phone, error, bookingId, operatorId) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_failures`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'apikey':        SUPABASE_KEY,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        event,
        phone,
        error:       error?.toString() || 'Error desconocido',
        attempts:    3,
        booking_id:  bookingId  || null,
        operator_id: operatorId || null,
      }),
    })
  } catch (logErr) {
    console.error('Error registrando fallo WA:', logErr.message)
  }
}

/**
 * Envía un mensaje de WhatsApp con reintentos (backoff: 0s → 5s → 15s)
 */
export async function sendWhatsApp(event, phone, booking, options = {}) {
  if (!phone) {
    console.warn('sendWhatsApp: no hay teléfono, omitiendo notificación')
    return { success: false, error: 'sin teléfono' }
  }

  const delays = [0, 5000, 15000]
  let lastError = null

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt] > 0) {
      console.log(`sendWhatsApp [${event}]: reintento ${attempt + 1} en ${delays[attempt] / 1000}s...`)
      await sleep(delays[attempt])
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'apikey':        SUPABASE_KEY,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ event, phone, booking, extra: booking }),
      })

      const data = await res.json()

      if (res.ok) {
        if (attempt > 0) console.log(`✅ WhatsApp enviado [${event}] en intento ${attempt + 1}`)
        else console.log(`✅ WhatsApp enviado [${event}] a ${phone}`)
        return { success: true, ...data }
      }

      lastError = data?.error || `HTTP ${res.status}`
      console.warn(`⚠️ WhatsApp intento ${attempt + 1} fallido [${event}]: ${lastError}`)

    } catch (err) {
      lastError = err.message
      console.warn(`⚠️ WhatsApp intento ${attempt + 1} excepción [${event}]: ${lastError}`)
    }
  }

  // Los 3 intentos fallaron — registrar en whatsapp_failures
  console.error(`❌ WhatsApp [${event}] falló después de 3 intentos. Registrando fallo.`)
  await logFailure(event, phone, lastError, options?.bookingId, options?.operatorId)
  return { success: false, error: lastError }
}

/**
 * Envía ubicación del operador a track-operator.
 * Sin reintentos — se llama cada 30s, un fallo aislado es irrelevante.
 */
export async function updateOperatorLocation(bookingId, operatorId, lat, lng) {
  // FILTRO EVASOR DE ERRORES 400 (Bad Request):
  // Si las variables de sesión se destruyeron o son nulas/indefinidas por el cierre de sesión, 
  // abortamos de forma limpia inmediatamente sin disparar el fetch erróneo.
  if (!operatorId || operatorId === 'undefined' || operatorId === 'null') {
    return { success: false, error: 'Omitiendo trackeo: No hay un operador activo logueado.' }
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/track-operator`, {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'apikey':        SUPABASE_KEY,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ 
        booking_id: (bookingId && bookingId !== 'undefined' && bookingId !== 'null') ? bookingId : null, 
        operator_id: operatorId, 
        lat, 
        lng 
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.warn('⚠️ track-operator error:', data?.error || res.status)
      return { success: false, error: data?.error }
    }

    return data
  } catch (err) {
    console.error('⚠️ Error en updateOperatorLocation:', err.message)
    return { success: false, error: err.message }
  }
}