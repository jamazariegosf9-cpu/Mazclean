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
  const initDone         = useRef(false)
  const skipNextSignedIn = useRef(false)

  // Carga profile desde Supabase - siempre fresco
  const loadProfile = async (user) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
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

  // loadProfileWithRetry: si el profile viene null (trigger aun no termino)
  // reintenta hasta 3 veces con 600ms de espera entre intentos
  // Esto resuelve la condicion de carrera entre el signUp y el trigger handle_new_user
  const loadProfileWithRetry = async (user, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
      const result = await loadProfile(user)
      if (result.profile !== null) return result
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
        if (event === 'SIGNED_OUT') {
          initDone.current         = false
          skipNextSignedIn.current = false
          setAuthState({ user: null, profile: null, loading: false })
          return
        }
        if (event === 'TOKEN_REFRESHED' && !session) {
          try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
          setAuthState({ user: null, profile: null, loading: false })
          return
        }
        if (event === 'TOKEN_REFRESHED') return
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
          try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
          setAuthState({ user: null, profile: null, loading: false })
          return
        }
        if (!session?.user) {
          setAuthState({ user: null, profile: null, loading: false })
          return
        }
        const result = await loadProfileWithRetry(session.user)
        setAuthState({ ...result, loading: false })
      } catch (err) {
        console.error('[AuthContext] Error en initAuth:', err)
        try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
        setAuthState({ user: null, profile: null, loading: false })
      } finally {
        initDone.current = true
      }
    }

    initAuth()
    return () => subscription.unsubscribe()
  }, [])

  // signUp acepta role opcional - por defecto 'cliente'
  // Si role='operador', el trigger y el upsert en AuthModal crean el perfil correcto
  const signUp = async ({ email, password, fullName, phone, role = 'cliente' }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone, role },
      },
    })
    return { data, error }
  }

  // signIn usa retry para manejar el caso donde el profile aun no existe
  // (importante despues de un signUp de operador con upsert manual)
  const signIn = async ({ email, password }) => {
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
    setAuthState({ user: null, profile: null, loading: false })
  }

  // updateProfile: actualiza DB y sincroniza el state en memoria
  const updateProfile = async (updates) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', authState.user.id)
      .select()
      .single()

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

  // refreshProfile: fuerza recarga desde Supabase
  const refreshProfile = async () => {
    if (!authState.user) return
    console.log('[AuthContext] refreshProfile - recargando desde Supabase...')
    const result = await loadProfileWithRetry(authState.user)
    setAuthState(prev => ({ ...prev, profile: result.profile }))
  }

  const value = {
    user:    authState.user,
    profile: authState.profile,
    loading: authState.loading,
    isClient:   authState.profile?.role === 'cliente',
    isOperator: authState.profile?.role === 'operador',
    isAdmin:    authState.profile?.role === 'admin',
    signUp, signIn, signInWithGoogle, signInWithPhone,
    verifyOTP, resetPassword, signOut, updateProfile,
    loadProfile: refreshProfile,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
