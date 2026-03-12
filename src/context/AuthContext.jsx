// ============================================================
// MAZ CLEAN — AuthContext
// src/context/AuthContext.jsx
// ============================================================
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)   // auth.users row
  const [profile, setProfile] = useState(null)   // profiles row (con role)
  const [loading, setLoading] = useState(true)

  // ── Cargar perfil extendido ───────────────────────────────
  const loadProfile = async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (!error) setProfile(data)
  }

  // ── Inicializar sesión ────────────────────────────────────
  useEffect(() => {
    // Obtener sesión activa al cargar
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      setLoading(false)
    })

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await loadProfile(session.user.id)
        } else {
          setProfile(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  // ── Registro con email ────────────────────────────────────
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

  // ── Login con email ───────────────────────────────────────
  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }

  // ── Login con Google ──────────────────────────────────────
  const signInWithGoogle = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    return { data, error }
  }

  // ── Login con teléfono (OTP) ──────────────────────────────
  const signInWithPhone = async (phone) => {
    const { data, error } = await supabase.auth.signInWithOtp({ phone })
    return { data, error }
  }

  const verifyOTP = async (phone, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    })
    return { data, error }
  }

  // ── Recuperar contraseña ──────────────────────────────────
  const resetPassword = async (email) => {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    return { data, error }
  }

  // ── Cerrar sesión ─────────────────────────────────────────
  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  // ── Actualizar perfil ─────────────────────────────────────
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
