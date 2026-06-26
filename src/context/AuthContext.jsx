// ============================================================
// MAZ CLEAN -- AuthContext [Blindado]
// src/context/AuthContext.jsx
// ============================================================
import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// Lee el token directo de localStorage sin tocar supabase.auth (evita lock en móvil)
function getTokenFromStorage() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (!stored) return null
    const parsed = JSON.parse(stored)
    return parsed?.access_token || parsed?.session?.access_token || null
  } catch { return null }
}

// Verifica si el token en localStorage está expirado
function isTokenExpired() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (!stored) return true
    const parsed = JSON.parse(stored)
    const expiresAt = parsed?.expires_at || parsed?.session?.expires_at
    if (!expiresAt) return false // sin expires_at, asumir válido
    return Math.floor(Date.now() / 1000) > expiresAt
  } catch { return false }
}

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({
    user:    null,
    profile: null,
    loading: true,
  })
  const [sessionExpired, setSessionExpired] = useState(false)
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false)
  const initDone         = useRef(false)
  const skipNextSignedIn = useRef(false)

  // Centraliza la purga absoluta de datos locales ante sesiones muertas o corruptas
  const purgeLocalSession = () => {
    try { localStorage.removeItem('mazclean-auth') } catch {}
    setAuthState({ user: null, profile: null, loading: false })
  }

  const handleExpiredSession = async (reason = 'expirada') => {
    console.warn('[AuthContext] Sesión', reason, '— cerrando y purgando localmente...')
    try { 
      // Intentamos avisar localmente a Supabase, ignoramos cualquier 403/error de red
      await supabase.auth.signOut({ scope: 'local' }) 
    } catch (err) {
      console.warn('[AuthContext] Fallo silencioso en signOut local de Supabase:', err.message)
    } finally {
      // Garantía absoluta de limpieza
      purgeLocalSession()
      setSessionExpired(true)
    }
  }

  const loadProfile = async (user) => {
    // Si no hay objeto usuario válido, abortamos de inmediato
    if (!user?.id) return { user: null, profile: null }

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        if (error.code === 'PGRST301' || error.status === 401 || error.message?.includes('JWT')) {
          await handleExpiredSession('inválida (JWT / 401)')
          return { user: null, profile: null }
        }
        console.error('[AuthContext] Error cargando perfil:', error.message)
        return { user, profile: null }
      }

      console.log('[AuthContext] Profile cargado:', {
        role:            data?.role,
        onboarding_done: data?.onboarding_done,
        onboarding_step: data?.onboarding_step,
        operator_status: data?.operator_status,
        status:          data?.status,
      })

      if (data?.role) return { user, profile: data }
    } catch (err) {
      console.error('[AuthContext] Excepcion cargando perfil:', err)
    }
    return { user, profile: null }
  }

  const loadProfileWithRetry = async (user, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
      const result = await loadProfile(user)
      if (result.profile !== null) return result
      if (result.user === null) return result
      if (i < maxRetries - 1) {
        console.log('[AuthContext] Profile null, reintentando en 600ms... (intento ' + (i + 1) + ')')
        await new Promise(resolve => setTimeout(resolve, 600))
      }
    }
    return { user, profile: null }
  }

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthContext] Auth event:', event, '| session:', !!session)

        // ── PASSWORD_RECOVERY — interceptar ANTES que cualquier otra lógica ──
        if (event === 'PASSWORD_RECOVERY') {
          console.log('[AuthContext] PASSWORD_RECOVERY detectado — activando recovery flow')
          setIsRecoveryFlow(true)
          setAuthState(prev => ({ ...prev, loading: false }))
          return
        }

        if (event === 'SIGNED_OUT') {
          await new Promise(resolve => setTimeout(resolve, 1000))
          const token = getTokenFromStorage()
          if (token) {
            console.log('[AuthContext] SIGNED_OUT ignorado — token sigue en localStorage')
            return
          }
          initDone.current         = false
          skipNextSignedIn.current = false
          purgeLocalSession()
          return
        }

        if (event === 'TOKEN_REFRESHED' && !session) {
          await handleExpiredSession('expirada (refresh fallido)')
          return
        }

        if (event === 'TOKEN_REFRESHED' && session) {
          console.log('[AuthContext] Token renovado correctamente')
          return
        }

        if (event === 'SIGNED_IN' && session?.user) {
          // Si hay token de recovery en el URL, no cargar el perfil
          // — App.jsx mostrará ResetPasswordView
          const params = new URLSearchParams(window.location.search)
          const hash   = window.location.hash
          if (params.get('type') === 'recovery' || hash.includes('type=recovery')) {
            console.log('[AuthContext] SIGNED_IN ignorado — recovery flow activo')
            return
          }
          if (skipNextSignedIn.current) {
            skipNextSignedIn.current = false
            return
          }
          if (!initDone.current) return
          setAuthState(prev => ({ ...prev, loading: prev.user ? false : true }))
          const result = await loadProfileWithRetry(session.user)
          setAuthState({ ...result, loading: false })
        }
      }
    )

    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) {
          await handleExpiredSession('inválida (getSession error)')
          return
        }
        if (!session?.user) {
          setAuthState({ user: null, profile: null, loading: false })
          return
        }

        // Si hay recovery flow activo, no cargar el perfil — mostrar reset password
        if (isRecoveryFlow) {
          console.log('[AuthContext] initAuth bloqueado — recovery flow activo')
          setAuthState({ user: session.user, profile: null, loading: false })
          return
        }

        const expiresAt = session.expires_at
        const nowSecs   = Math.floor(Date.now() / 1000)
        if (expiresAt && nowSecs > expiresAt) {
          await handleExpiredSession('expirada (token vencido al iniciar)')
          return
        }

        const result = await loadProfileWithRetry(session.user)
        setAuthState({ ...result, loading: false })
      } catch (err) {
        console.error('[AuthContext] Error en initAuth:', err)
        await handleExpiredSession('error inesperado')
      } finally {
        initDone.current = true
      }
    }

    initAuth()
    return () => subscription.unsubscribe()
  }, [])

  // Watcher: verificar sesión cada 60 segundos
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!authState.user) return
      if (document.hidden) return
      try {
        const token = getTokenFromStorage()
        if (!token) {
          await new Promise(resolve => setTimeout(resolve, 3000))
          if (!authState.user) return
          const tokenRetry = getTokenFromStorage()
          if (!tokenRetry) await handleExpiredSession('expirada (watcher periódico)')
          return
        }
        if (isTokenExpired()) {
          console.warn('[AuthContext] Token expirado detectado por watcher')
          await handleExpiredSession('expirada (token vencido en watcher)')
        }
      } catch {
        // silencioso
      }
    }, 60 * 1000)

    return () => clearInterval(interval)
  }, [authState.user])

  const signUp = async ({ email, password, fullName, phone, role = 'cliente' }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone, role } },
    })
    return { data, error }
  }

  const signIn = async ({ email, password }) => {
    setSessionExpired(false)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data?.user) {
      skipNextSignedIn.current = true
      setAuthState(prev => ({ ...prev, loading: true }))
      const result = await loadProfileWithRetry(data.user)
      setAuthState({ ...result, loading: false })
    }
    return { data, error }
  }

  const signInWithGoogle = async () => {
    setSessionExpired(false)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    return { data, error }
  }

  const signInWithPhone = async (phone) => {
    const { data, error } = await supabase.auth.signInWithOtp({ phone })
    return { data, error }
  }

  const verifyOTP = async (phone, token) => {
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' })
    return { data, error }
  }

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?type=recovery`,
    })
    return { data, error }
  }

  const signOut = async () => {
    console.log('[AuthContext] Ejecutando signOut controlado...')
    setSessionExpired(false)
    try {
      // Intentamos cerrar la sesión de forma limpia en el servidor
      await supabase.auth.signOut({ scope: 'local' })
    } catch (err) {
      console.warn('[AuthContext] Error destruyendo sesión en backend:', err.message)
    } finally {
      // PASE LO QUE PASE, borramos el localStorage y limpiamos React para tumbar la UI
      purgeLocalSession()
      // Pequeño delay y redirección forzada para limpiar remanentes o loops de GPS en segundo plano
      setTimeout(() => { window.location.href = '/' }, 100)
    }
  }

  const updateProfile = async (updates) => {
    if (!authState.user?.id) return { data: null, error: new Error('Sin usuario autenticado') }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', authState.user.id)
      .select()
      .single()

    if (error?.code === 'PGRST301' || error?.status === 401 || error?.message?.includes('JWT')) {
      await handleExpiredSession('expirada (updateProfile)')
      return { data: null, error }
    }

    if (!error && data) {
      console.log('[AuthContext] updateProfile OK:', {
        onboarding_done: data.onboarding_done,
        onboarding_step: data.onboarding_step,
        operator_status: data.operator_status,
      })
      setAuthState(prev => ({ ...prev, profile: data }))
    }
    return { data, error }
  }

  const refreshProfile = async () => {
    if (!authState.user) return
    console.log('[AuthContext] refreshProfile - recargando desde Supabase...')
    const result = await loadProfileWithRetry(authState.user)
    setAuthState(prev => ({ ...prev, profile: result.profile }))
  }

  const refreshProfileDirect = async () => {
    if (!authState.user?.id) return
    try {
      const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const token = getTokenFromStorage() || SUPABASE_ANON_KEY
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${authState.user.id}&select=*`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      
      if (res.status === 401) {
        await handleExpiredSession('expirada (refreshProfileDirect 401)')
        return
      }

      if (res.ok) {
        const data = await res.json()
        if (data?.[0]) {
          console.log('[AuthContext] refreshProfileDirect OK')
          setAuthState(prev => ({ ...prev, profile: data[0] }))
        }
      }
    } catch (err) {
      console.error('[AuthContext] refreshProfileDirect error:', err)
    }
  }

  const value = {
    user:          authState.user,
    profile:       authState.profile,
    loading:       authState.loading,
    sessionExpired,
    isRecoveryFlow,
    isClient:      authState.profile?.role === 'cliente',
    isOperator:    authState.profile?.role === 'operador',
    isAdmin:       authState.profile?.role === 'admin',
    signUp, signIn, signInWithGoogle, signInWithPhone,
    verifyOTP, resetPassword, signOut, updateProfile,
    loadProfile:       refreshProfile,
    loadProfileDirect: refreshProfileDirect,
  }

  return (
    <AuthContext.Provider value={value}>
      {sessionExpired && !authState.user && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: '32px 28px',
            maxWidth: 380, width: '100%', textAlign: 'center',
            boxShadow: '0 8px 48px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#1f2937', margin: '0 0 10px' }}>
              Sesión expirada
            </h2>
            <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.6 }}>
              Tu sesión ha expirado por inactividad. Vuelve a iniciar sesión para continuar.
            </p>
            <button
              onClick={() => setSessionExpired(false)}
              style={{
                width: '100%', padding: '14px 0',
                background: '#3b82f6', color: '#fff',
                border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 52,
              }}>
              🔐 Iniciar sesión
            </button>
          </div>
        </div>
      )}
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}