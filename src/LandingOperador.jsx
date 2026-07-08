// ============================================================
// MAZ CLEAN — LandingOperador v2
// src/LandingOperador.jsx
// Mobile-first — todo visible sin scroll en 375px
// Sin navbar, imagen full-width, CTA WhatsApp siempre visible
// ============================================================
import { useEffect, useState } from 'react'
import Analytics from './lib/analytics'

const WHATSAPP_URL = 'https://wa.me/525539377258?text=Hola%2C%20quiero%20información%20sobre%20MAZ%20CLEAN%20%F0%9F%9A%97'
const IMAGE_URL    = 'https://ysdmkbwmthrjgvyuvcmm.supabase.co/storage/v1/object/public/Academia/Anuncio%20Operadores.png'

export default function LandingOperador({ onRegister }) {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => {
    Analytics.pageView('/operador')
    // Detectar llegada desde Facebook Ads
    const params = new URLSearchParams(window.location.search)
    if (params.get('fbclid') || params.get('utm_source') === 'facebook') {
      Analytics.facebookAdArrival(params.get('utm_campaign') || 'facebook_ad')
    }
  }, [])

  const benefits = [
    '🧴 Kit completo de materiales financiado sin anticipo',
    '📅 Membresía GRATIS julio y agosto 2026',
    '💰 Te quedas con el 90–93% de cada servicio',
  ]

  if (isMobile) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#061135',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Poppins', 'DM Sans', sans-serif",
        position: 'relative',
      }}>

        {/* ── Imagen hero full-width ── */}
        <div style={{ position: 'relative', width: '100%', height: '42vh', flexShrink: 0 }}>
          <img
            src={IMAGE_URL}
            alt="Operadores MAZ CLEAN"
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 20%', display: 'block' }}
          />
          {/* Gradiente inferior para fundir con contenido */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '65%',
            background: 'linear-gradient(to bottom, transparent, #061135)',
          }} />
          {/* Solo badge de promo — logo ya está en la imagen */}
          <div style={{
            position: 'absolute', top: 14, right: 14,
            background: 'linear-gradient(135deg,#00b4d8,#00d4ff)',
            color: '#061135', padding: '5px 12px', borderRadius: 20,
            fontSize: 11, fontWeight: 800,
            boxShadow: '0 2px 8px rgba(0,180,216,0.4)',
          }}>
            ⚡ Solo primeros 15 — Kit financiado + Membresía GRATIS jul-ago
          </div>
        </div>

        {/* ── Contenido principal ── */}
        <div style={{
          flex: 1,
          padding: '0 20px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          marginTop: -8,
        }}>

          {/* Título */}
          <div>
            <h1 style={{
              fontSize: 24, fontWeight: 800, color: '#ffffff',
              margin: '0 0 6px', lineHeight: 1.2,
            }}>
              Sin inversión inicial —{' '}
              <span style={{ color: '#00C8FF' }}>únete y empieza a ganar 🚗</span>
            </h1>
            <p style={{ fontSize: 13, color: '#8CA0BF', margin: 0 }}>
              Únete a <strong style={{ color: '#fff' }}>MAZ CLEAN</strong> como Operador Certificado
            </p>
          </div>

          {/* Beneficios — solo 3, compactos */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {benefits.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'rgba(0,230,118,0.15)', border: '1.5px solid #00e676',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontSize: 11, color: '#00e676', fontWeight: 700,
                }}>✓</div>
                <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{b}</span>
              </div>
            ))}
          </div>

          {/* Ganancia estimada — compacta */}
          <div style={{
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.25)',
            borderRadius: 12, padding: '10px 14px',
            display: 'flex', gap: 20, alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Por servicio</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#60a5fa' }}>$98–$185</div>
            </div>
            <div style={{ width: 1, height: 32, background: 'rgba(59,130,246,0.3)' }} />
            <div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Semanal estimado</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#60a5fa' }}>$1,500–$3,000</div>
              <div style={{ fontSize: 9, color: '#10b981', marginTop: 2 }}>90–93% del servicio para ti ✓</div>
            </div>
          </div>

          {/* CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => Analytics.trackEvent?.('click_whatsapp_operador') || import('./lib/analytics').then(m => m.trackEvent('click_whatsapp_operador'))}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                background: '#00a86b', color: '#fff',
                padding: '15px', borderRadius: 14,
                fontWeight: 700, fontSize: 16, textDecoration: 'none',
                boxShadow: '0 4px 16px rgba(0,168,107,0.45)',
              }}
            >
              <WhatsAppIcon /> 👉 Escríbenos por WhatsApp
            </a>

            <button
              onClick={() => { Analytics.clickOperador(); onRegister(); }}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'transparent',
                border: '2px solid rgba(255,255,255,0.25)',
                color: '#e2e8f0', padding: '13px', borderRadius: 14,
                fontWeight: 600, fontSize: 14, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              📝 Registrarme directamente
            </button>
          </div>

          {/* Footer */}
          <p style={{ fontSize: 12, color: '#4a5568', margin: 0, textAlign: 'center' }}>
            ¿Ya tienes cuenta?{' '}
            <button onClick={onRegister} style={{
              background: 'none', border: 'none', color: '#00C8FF',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, padding: 0,
            }}>
              Iniciar sesión
            </button>
          </p>
        </div>
      </div>
    )
  }

  // ── DESKTOP ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 40% 50%, #0f2b80 0%, #061135 100%)',
      display: 'flex',
      alignItems: 'stretch',
      fontFamily: "'Poppins', 'DM Sans', sans-serif",
      overflow: 'hidden',
    }}>

      {/* ── Columna izquierda — contenido ── */}
      <div style={{
        flex: '0 0 52%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '60px 56px 60px 64px',
        gap: 28,
        zIndex: 1,
      }}>

        {/* Título */}
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 800, color: '#fff', margin: '0 0 10px', lineHeight: 1.2 }}>
            Gana dinero lavando autos{' '}
            <span style={{ color: '#00C8FF' }}>— sé tu propio jefe 🚗</span>
          </h1>
          <p style={{ fontSize: 16, color: '#8CA0BF', margin: 0 }}>
            Únete a <strong style={{ color: '#fff' }}>MAZ CLEAN</strong> como Operador Certificado en Ciudad de México
          </p>
        </div>

        {/* Badge promo */}
        <div style={{
          display: 'inline-flex', alignSelf: 'flex-start',
          background: 'linear-gradient(135deg,#00b4d8,#00d4ff)',
          color: '#061135', padding: '8px 20px', borderRadius: 12,
          fontWeight: 800, fontSize: 14,
          boxShadow: '0 4px 14px rgba(0,180,216,0.35)',
          gap: 8, alignItems: 'center',
        }}>
          ⚡ Solo primeros 15 — Kit financiado + Membresía GRATIS jul-ago + Membresía GRATIS mayo-junio
        </div>

        {/* Beneficios */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            'Kit completo de materiales financiado — sin anticipo inicial',
            'Membresía GRATIS durante julio y agosto 2026',
            'Te quedas con el 90–93% de cada servicio realizado',
            'Tú cobras directo al cliente — efectivo o transferencia',
            'Certificación profesional gratis desde tu celular',
          ].map((b, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: 'rgba(0,230,118,0.15)', border: '1.5px solid #00e676',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, fontSize: 13, color: '#00e676', fontWeight: 700,
              }}>✓</div>
              <span style={{ fontSize: 15, color: '#e2e8f0', fontWeight: 500 }}>{b}</span>
            </li>
          ))}
        </ul>

        {/* Ganancia */}
        <div style={{
          background: 'rgba(59,130,246,0.12)',
          border: '1.5px solid rgba(59,130,246,0.25)',
          borderRadius: 14, padding: '16px 20px',
          display: 'flex', gap: 32, alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Por servicio</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa' }}>$98–$185 MXN</div>
          </div>
          <div style={{ width: 1, height: 40, background: 'rgba(59,130,246,0.3)' }} />
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Semanal estimado (3–4 servicios/día)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#60a5fa' }}>$1,500–$3,000 MXN</div>
            <div style={{ fontSize: 11, color: '#10b981', marginTop: 2 }}>90–93% del servicio para ti ✓</div>
          </div>
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420 }}>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => Analytics.trackEvent?.('click_whatsapp_operador')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: '#00a86b', color: '#fff',
              padding: '16px 28px', borderRadius: 14,
              fontWeight: 700, fontSize: 16, textDecoration: 'none',
              boxShadow: '0 5px 18px rgba(0,168,107,0.4)',
            }}
          >
            <WhatsAppIcon /> 👉 Escríbenos por WhatsApp ahora
          </a>
          <button
            onClick={() => { Analytics.clickOperador(); onRegister(); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: 'transparent',
              border: '2px solid rgba(255,255,255,0.2)',
              color: '#cbd5e1', padding: '14px', borderRadius: 14,
              fontWeight: 600, fontSize: 15, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'border-color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.45)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
          >
            📝 Registrarme directamente
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#4a5568', margin: 0 }}>
          ¿Ya tienes cuenta?{' '}
          <button onClick={onRegister} style={{
            background: 'none', border: 'none', color: '#00C8FF',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0,
          }}>
            Iniciar sesión
          </button>
        </p>
      </div>

      {/* ── Columna derecha — imagen ── */}
      <div style={{
        flex: '0 0 48%',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Gradiente de fusión izquierdo */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          background: 'linear-gradient(to right, #061135 0%, rgba(6,17,53,0.3) 35%, transparent 65%)',
        }} />
        <img
          src={IMAGE_URL}
          alt="Operadores MAZ CLEAN"
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
            display: 'block',
          }}
        />
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');
      `}</style>
    </div>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M11.999 0C5.373 0 0 5.373 0 12c0 2.115.554 4.103 1.522 5.827L.06 23.446a.5.5 0 00.613.61l5.757-1.505A11.943 11.943 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.802 9.802 0 01-5.027-1.383l-.36-.214-3.733.977.998-3.63-.235-.374A9.77 9.77 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.429 0 9.818 4.388 9.818 9.818 0 5.429-4.389 9.818-9.819 9.818z"/>
    </svg>
  )
}
