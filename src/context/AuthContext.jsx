// ============================================================
// MAZ CLEAN — AuthContext
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
  // Evita que onAuthStateChange interfiera mientras initAuth corre
  const initDone = useRef(false)

  const loadProfile = async (user) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      if (!error && data?.role) return { user, profile: data }
    } catch (err) {
      console.error('Error cargando perfil:', err)
    }
    return { user, profile: null }
  }

  useEffect(() => {
    // onAuthStateChange solo maneja SIGNED_OUT y TOKEN_REFRESHED
    // SIGNED_IN lo ignora — initAuth es el único que setea el estado inicial
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          initDone.current = false
          setAuthState({ user: null, profile: null, loading: false })
          return
        }
        if (event === 'TOKEN_REFRESHED' && !session) {
          try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
          setAuthState({ user: null, profile: null, loading: false })
          return
        }
        // SIGNED_IN: solo actuar si initAuth ya terminó
        // (es un login posterior, no el inicial)
        if (event === 'SIGNED_IN' && session?.user && initDone.current) {
          setAuthState(prev => ({ ...prev, loading: true }))
          const result = await loadProfile(session.user)
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
        const result = await loadProfile(session.user)
        setAuthState({ ...result, loading: false })
      } catch (err) {
        console.error('Error en initAuth:', err)
        try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
        setAuthState({ user: null, profile: null, loading: false })
      } finally {
        initDone.current = true
      }
    }

    initAuth()
    return () => subscription.unsubscribe()
  }, [])

  const signUp = async ({ email, password, fullName, phone }) => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, phone, role: 'cliente' } },
    })
    return { data, error }
  }

  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
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

  const updateProfile = async (updates) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', authState.user.id)
      .select()
      .single()
    if (!error && data?.role) setAuthState(prev => ({ ...prev, profile: data }))
    return { data, error }
  }

  const refreshProfile = async () => {
    if (!authState.user) return
    const result = await loadProfile(authState.user)
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
