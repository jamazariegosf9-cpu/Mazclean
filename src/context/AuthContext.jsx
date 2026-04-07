// ============================================================
// MAZ CLEAN — AuthContext
// src/context/AuthContext.jsx
// ============================================================
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (!error && data) {
        setProfile(data)
        return data
      }
    } catch (err) {
      console.error('Error cargando perfil:', err)
    }
    return null
  }

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()

        // ── Token inválido o expirado → limpiar sesión ──────────
        if (error) {
          console.warn('Sesión inválida, limpiando:', error.message)
          await supabase.auth.signOut({ scope: 'local' })
          setUser(null)
          setProfile(null)
          setLoading(false)
          return
        }

        if (session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id)
        }
      } catch (err) {
        // Cualquier error inesperado → limpiar y mostrar home
        console.error('Error en initAuth:', err)
        try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
        setUser(null)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }

    initAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // ── Token de refresco inválido → cerrar sesión limpia ───
        if (event === 'TOKEN_REFRESHED' && !session) {
          console.warn('Refresh token inválido, cerrando sesión')
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
          await loadProfile(session.user.id)
          return
        }

        // ── Cualquier evento con error de auth → limpiar ────────
        if (!session && (event === 'USER_UPDATED' || event === 'INITIAL_SESSION')) {
          setUser(null)
          setProfile(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signUp = async ({ email, password, fullName, phone }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone, role: 'cliente' },
      },
    })
    return { data, error }
  }

  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
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
    const { data, error } = await supabase.auth.verifyOtp({
      phone, token, type: 'sms',
    })
    return { data, error }
  }

  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    return { data, error }
  }

  const signOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch (e) {}
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
    if (!error) setProfile(data)
    return { data, error }
  }

  const value = {
    user,
    profile,
    loading,
    isClient:   profile?.role === 'cliente',
    isOperator: profile?.role === 'operador',
    isAdmin:    profile?.role === 'admin',
    signUp,
    signIn,
    signInWithGoogle,
    signInWithPhone,
    verifyOTP,
    resetPassword,
    signOut,
    updateProfile,
    loadProfile,
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

const loadProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    // ── Solo guardar si tiene datos válidos con role ──
    if (!error && data?.role) {
      setProfile(data)
      return data
    }
  } catch (err) {
    console.error('Error cargando perfil:', err)
  }
  return null
}