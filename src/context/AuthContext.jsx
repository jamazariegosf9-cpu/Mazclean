// ============================================================
// MAZ CLEAN — AuthContext
// src/context/AuthContext.jsx
// ============================================================
import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // Evita que initAuth y onAuthStateChange corran loadProfile en paralelo
  const loadingProfileRef = useRef(false)
  const initializedRef    = useRef(false)

  const loadProfile = async (userId) => {
    // Si ya hay una carga en curso, esperar
    if (loadingProfileRef.current) return null
    loadingProfileRef.current = true
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (!error && data?.role) {
        setProfile(data)
        return data
      }
      // Si no tiene role, mantener profile como null (no setear {})
      return null
    } catch (err) {
      console.error('Error cargando perfil:', err)
      return null
    } finally {
      loadingProfileRef.current = false
    }
  }

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.warn('Sesión inválida:', error.message)
          await supabase.auth.signOut({ scope: 'local' })
          setUser(null)
          setProfile(null)
          return
        }

        if (session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id)
        }
      } catch (err) {
        console.error('Error en initAuth:', err)
        try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
        setUser(null)
        setProfile(null)
      } finally {
        initializedRef.current = true
        setLoading(false)
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Ignorar eventos que llegan antes de que initAuth termine
        // initAuth ya se encarga del estado inicial
        if (!initializedRef.current) return

        if (event === 'TOKEN_REFRESHED' && !session) {
          try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
          setUser(null)
          setProfile(null)
          return
        }

        if (event === 'TOKEN_REFRESHED') return

        if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
          return
        }

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user)
          // Solo cargar profile si no hay uno ya cargado para este usuario
          setProfile(prev => {
            if (prev?.id === session.user.id) return prev
            // Cargar en background
            loadProfile(session.user.id)
            return prev
          })
          return
        }

        if (!session) {
          setUser(null)
          setProfile(null)
        }
      }
    )

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
    setUser(null)
    setProfile(null)
  }

  const updateProfile = async (updates) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    if (!error && data?.role) setProfile(data)
    return { data, error }
  }

  const value = {
    user, profile, loading,
    isClient:   profile?.role === 'cliente',
    isOperator: profile?.role === 'operador',
    isAdmin:    profile?.role === 'admin',
    signUp, signIn, signInWithGoogle, signInWithPhone,
    verifyOTP, resetPassword, signOut, updateProfile, loadProfile,
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
