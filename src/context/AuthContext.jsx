// ============================================================
// MAZ CLEAN -- AuthContext
// src/context/AuthContext.jsx
// ============================================================
import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState({
    user:    null,
    profile: null,
    loading: true,
  })
  const [sessionExpired, setSessionExpired] = useState(false)
  const initDone         = useRef(false)
  const skipNextSignedIn = useRef(false)

  // ── Cerrar sesión por expiración ────────────────────────────────────────
  const handleExpiredSession = async (reason = 'expirada') => {
    console.warn('[AuthContext] Sesión', reason, '— cerrando...')
    try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
    setAuthState({ user: null, profile: null, loading: false })
    setSessionExpired(true)
  }

  // Carga profile desde Supabase - siempre fresco
  const loadProfile = async (user) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        // JWT inválido = sesión expirada
        if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
          await handleExpiredSession('inválida (JWT)')
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
      if (result.user === null) return result // sesión expirada durante retry
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

        if (event === 'SIGNED_OUT') {
          initDone.current         = false
          skipNextSignedIn.current = false
          setAuthState({ user: null, profile: null, loading: false })
          return
        }

        // Token refresh fallido = sesión expirada
        if (event === 'TOKEN_REFRESHED' && !session) {
          await handleExpiredSession('expirada (refresh fallido)')
          return
        }

        // Token refresh exitoso — no recargar profile
        if (event === 'TOKEN_REFRESHED' && session) {
          console.log('[AuthContext] Token renovado correctamente')
          return
        }

        if (event === 'SIGNED_IN' && session?.user) {
          if (skipNextSignedIn.current) {
            skipNextSignedIn.current = false
            return
          }
          if (!initDone.current) return
          setAuthState(prev => ({ ...prev, loading: true }))
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

        // Verificar que el token no esté ya expirado al abrir la app
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

  // ── Watcher: verificar sesión cada 60 segundos ──────────────────────────
  // Detecta expiración cuando la app lleva horas abierta sin actividad
  // Reintenta 2 veces antes de cerrar sesión para evitar falsos positivos
  // cuando el navegador pausa la red al cambiar de ventana/app
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!authState.user) return
      // No verificar si el documento está oculto (usuario cambió de ventana)
      if (document.hidden) return
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          // Esperar 3 segundos y reintentar antes de cerrar sesión
          await new Promise(resolve => setTimeout(resolve, 3000))
          if (!authState.user) return // ya se cerró sesión por otro medio
          const { data: { session: retry } } = await supabase.auth.getSession()
          if (!retry) await handleExpiredSession('expirada (watcher periódico)')
        }
      } catch {
        // silencioso — no romper la app por error de red momentáneo
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
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    return { data, error }
  }

  const signOut = async () => {
    try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
    setSessionExpired(false)
    setAuthState({ user: null, profile: null, loading: false })
  }

  const updateProfile = async (updates) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', authState.user.id)
      .select()
      .single()

    if (error?.code === 'PGRST301' || error?.message?.includes('JWT')) {
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

  const value = {
    user:          authState.user,
    profile:       authState.profile,
    loading:       authState.loading,
    sessionExpired,
    isClient:      authState.profile?.role === 'cliente',
    isOperator:    authState.profile?.role === 'operador',
    isAdmin:       authState.profile?.role === 'admin',
    signUp, signIn, signInWithGoogle, signInWithPhone,
    verifyOTP, resetPassword, signOut, updateProfile,
    loadProfile: refreshProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {/* Modal de sesión expirada — visible sobre cualquier pantalla */}
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
