// ============================================================
// MAZ CLEAN — ProtectedRoute
// src/components/auth/ProtectedRoute.jsx
// Redirige a login si no hay sesión activa
// ============================================================
import { useAuth } from '../../context/AuthContext'

/**
 * Envuelve rutas que requieren autenticación y/o un rol específico.
 * 
 * Uso:
 *   <ProtectedRoute>                   // solo requiere login
 *   <ProtectedRoute role="admin">      // solo admin
 *   <ProtectedRoute role="operador">   // solo operador
 */
export default function ProtectedRoute({ children, role, onShowAuth }) {
  const { user, profile, loading } = useAuth()

  // Mientras carga la sesión
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: '50%',
          border: '3px solid rgba(0,200,255,0.2)',
          borderTopColor: '#00C8FF',
          animation: 'rotate 0.8s linear infinite',
        }}/>
        <p style={{ color: '#8CA0BF', fontSize: 14 }}>Cargando...</p>
      </div>
    )
  }

  // No autenticado
  if (!user) {
    if (onShowAuth) onShowAuth()
    return (
      <div style={{
        minHeight: '60vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16, padding: 40,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>🔐</div>
        <h3 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24,
          color: '#F0F6FF',
        }}>
          Inicia sesión para continuar
        </h3>
        <p style={{ color: '#8CA0BF', maxWidth: 320, lineHeight: 1.7 }}>
          Necesitas una cuenta para acceder a esta sección.
        </p>
        <button
          onClick={onShowAuth}
          style={{
            padding: '12px 32px',
            background: 'linear-gradient(135deg, #00C8FF, #00E5C8)',
            border: 'none', borderRadius: 12,
            color: '#050A14', fontFamily: "'Syne', sans-serif",
            fontWeight: 700, fontSize: 15, cursor: 'pointer',
          }}
        >
          Iniciar sesión →
        </button>
      </div>
    )
  }

  // Rol incorrecto
  if (role && profile?.role !== role) {
    return (
      <div style={{
        minHeight: '60vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16, padding: 40,
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48 }}>🚫</div>
        <h3 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 24,
          color: '#F0F6FF',
        }}>
          Acceso restringido
        </h3>
        <p style={{ color: '#8CA0BF', maxWidth: 320, lineHeight: 1.7 }}>
          No tienes permisos para acceder a esta sección.
          {role === 'admin' && ' Esta área es exclusiva para administradores.'}
          {role === 'operador' && ' Esta área es exclusiva para operadores.'}
        </p>
      </div>
    )
  }

  return children
}
