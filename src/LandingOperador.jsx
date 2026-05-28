// ============================================================
// MAZ CLEAN — LandingOperador
// src/LandingOperador.jsx
// Landing page pre-registro de operadores
// Se muestra antes del AuthModal cuando el prospecto llega
// desde el anuncio o el bot de WhatsApp
// ============================================================
import { useEffect, useState } from 'react'

const WHATSAPP_URL = 'https://wa.me/message/K2T33UDXT6XZN1'
const IMAGE_URL    = 'https://ysdmkbwmthrjgvyuvcmm.supabase.co/storage/v1/object/public/Academia/Anuncio%20Operadores.png'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return isMobile
}

export default function LandingOperador({ onRegister }) {
  const isMobile = useIsMobile()
  const [imgLoaded, setImgLoaded] = useState(false)

  const benefits = [
    { icon: '🕐', text: 'Tú decides tu horario y zona de trabajo' },
    { icon: '🎓', text: 'Certificación profesional completamente gratis' },
    { icon: '📱', text: 'App propia para gestionar tus servicios' },
    { icon: '💰', text: 'Sin inversión inicial — solo tus ganas de trabajar' },
    { icon: '🚗', text: 'Clientes a domicilio, tú solo lavas' },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 30%, #0f2b80 0%, #061135 100%)',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      justifyContent: 'center',
      fontFamily: "'Poppins', 'DM Sans', sans-serif",
      overflowX: 'hidden',
    }}>

      {/* ── Imagen lateral (desktop) / superior (mobile) ───────── */}
      <div style={{
        width: isMobile ? '100%' : '42%',
        height: isMobile ? '38vh' : '100vh',
        position: 'relative',
        flexShrink: 0,
        order: isMobile ? 0 : 2,
      }}>
        <img
          src={IMAGE_URL}
          alt="Operadores MAZ CLEAN"
          onLoad={() => setImgLoaded(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center bottom',
            opacity: imgLoaded ? 1 : 0,
            transition: 'opacity 0.4s',
          }}
        />
        {/* Gradiente de fusión */}
        <div style={{
          position: 'absolute', inset: 0,
          background: isMobile
            ? 'linear-gradient(to bottom, rgba(6,17,53,0.7) 0%, rgba(6,17,53,0) 25%, rgba(6,17,53,0) 75%, rgba(6,17,53,1) 100%)'
            : 'linear-gradient(to left, rgba(6,17,53,0) 30%, rgba(6,17,53,1) 100%)',
        }} />
      </div>

      {/* ── Contenido principal ─────────────────────────────────── */}
      <div style={{
        flex: 1,
        maxWidth: isMobile ? '100%' : 560,
        padding: isMobile ? '24px 20px 40px' : '60px 56px',
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile ? 16 : 24,
        order: isMobile ? 1 : 1,
        zIndex: 1,
      }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg,#00C8FF,#00E5C8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, flexShrink: 0,
          }}>💧</div>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#F0F6FF', letterSpacing: '-0.5px' }}>
            MAZ CLEAN
          </span>
        </div>

        {/* Título principal */}
        <div>
          <h1 style={{
            fontSize: isMobile ? 22 : 30,
            fontWeight: 800,
            color: '#ffffff',
            margin: '0 0 8px',
            lineHeight: 1.25,
          }}>
            ¿Quieres ser tu propio jefe{' '}
            <span style={{ fontWeight: 400, color: '#93c5fd' }}>
              ganando dinero lavando autos a domicilio?
            </span> 🚗
          </h1>
          <p style={{ fontSize: isMobile ? 14 : 16, color: '#8CA0BF', margin: 0, lineHeight: 1.6 }}>
            Únete a <strong style={{ color: '#fff' }}>MAZ CLEAN</strong> como Operador Certificado
          </p>
        </div>

        {/* Badge de promoción */}
        <div style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          background: 'linear-gradient(135deg,#00b4d8,#00d4ff)',
          color: '#061135',
          padding: '8px 18px',
          borderRadius: 12,
          fontWeight: 700,
          fontSize: isMobile ? 13 : 15,
          boxShadow: '0 4px 14px rgba(0,180,216,0.35)',
          gap: 8,
          alignItems: 'center',
        }}>
          📅 Mayo y Junio —{' '}
          <span style={{ fontWeight: 800 }}>SIN costo de membresía</span>
        </div>

        {/* Lista de beneficios */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {benefits.map((b, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(0,230,118,0.15)',
                border: '1.5px solid #00e676',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, fontSize: 14,
              }}>✓</div>
              <span style={{ fontSize: isMobile ? 13 : 15, color: '#e2e8f0', fontWeight: 500, lineHeight: 1.4 }}>
                {b.text}
              </span>
            </li>
          ))}
        </ul>

        {/* Ganancia estimada */}
        <div style={{
          background: 'rgba(59,130,246,0.12)',
          border: '1.5px solid rgba(59,130,246,0.3)',
          borderRadius: 14,
          padding: '14px 18px',
        }}>
          <div style={{ fontSize: isMobile ? 12 : 13, color: '#93c5fd', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            💵 ¿Cuánto puedo ganar?
          </div>
          <div style={{ display: 'flex', gap: isMobile ? 12 : 20, flexWrap: 'wrap' }}>
            {[
              { label: 'Por servicio', value: '$150–$300' },
              { label: 'Semanal (4-6 servicios/día)', value: '$4,000–$8,000' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: isMobile ? 11 : 12, color: '#64748b' }}>{label}</div>
                <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: '#60a5fa' }}>{value} MXN</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* CTA Principal — WhatsApp */}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: '#00a86b',
              color: '#fff',
              padding: isMobile ? '14px' : '16px',
              borderRadius: 14,
              fontWeight: 700,
              fontSize: isMobile ? 15 : 16,
              textDecoration: 'none',
              boxShadow: '0 5px 18px rgba(0,168,107,0.4)',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M11.999 0C5.373 0 0 5.373 0 12c0 2.115.554 4.103 1.522 5.827L.06 23.446a.5.5 0 00.613.61l5.757-1.505A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.802 9.802 0 01-5.027-1.383l-.36-.214-3.733.977.998-3.63-.235-.374A9.77 9.77 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.429 0 9.818 4.388 9.818 9.818 0 5.429-4.389 9.818-9.819 9.818z"/>
            </svg>
            👉 Escríbenos por WhatsApp ahora
          </a>

          {/* CTA Secundario — Registro directo */}
          <button
            onClick={onRegister}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'rgba(255,255,255,0.06)',
              border: '1.5px solid rgba(255,255,255,0.18)',
              color: '#e2e8f0',
              padding: isMobile ? '13px' : '15px',
              borderRadius: 14,
              fontWeight: 600,
              fontSize: isMobile ? 14 : 15,
              cursor: 'pointer',
              transition: 'background 0.2s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.10)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          >
            📝 Registrarme directamente
          </button>
        </div>

        {/* Footer */}
        <p style={{ fontSize: 12, color: '#4a5568', margin: 0, textAlign: isMobile ? 'center' : 'left' }}>
          ¿Ya tienes cuenta?{' '}
          <button
            onClick={onRegister}
            style={{ background: 'none', border: 'none', color: '#00C8FF', cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0 }}
          >
            Iniciar sesión
          </button>
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');
      `}</style>
    </div>
  )
}
