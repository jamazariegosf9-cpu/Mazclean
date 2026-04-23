// ============================================================
// MAZ CLEAN — Configuración de Supabase
// src/lib/supabase.js
// ============================================================
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('⚠️  Faltan variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY')
}

// En móvil, Chrome suspende la pestaña al abrir la cámara.
// Al regresar, Supabase intenta adquirir el navigator.locks y lo rompe
// porque la instancia anterior quedó suspendida con el lock tomado.
// Solución: reemplazar el mecanismo de lock por una función no-op
// que simplemente ejecuta la función sin adquirir ningún lock.
const noopLock = (_name, _acquireTimeout, fn) => fn()

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: true,
    storageKey:         'mazclean-auth',
    lock:               noopLock,
  },
})

export default supabase
