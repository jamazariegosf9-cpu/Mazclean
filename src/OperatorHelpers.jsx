import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin, Clock, Phone, Navigation, LogOut,
  Play, Check, Camera, CheckSquare, Square, AlertTriangle, Upload, Bell
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
import { sendWhatsApp, updateOperatorLocation } from './lib/whatsapp';
import { useToast } from './App';
import AcademiaView from './AcademiaView';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_MAPS_KEY   = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

// ── Notificaciones de chat ────────────────────────────────────────────────────
let chatAudio = null
function playNotificationSound() {
  try {
    // Tono simple usando Web Audio API — sin archivo externo
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const oscillator = ctx.createOscillator()
    const gainNode   = ctx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    oscillator.frequency.setValueAtTime(880, ctx.currentTime)
    oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.1)
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.3)
  } catch {}
}

function vibrateDevice() {
  try { if (navigator.vibrate) navigator.vibrate([100, 50, 100]) } catch {}
}

async function requestNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
  } catch {}
}

function showSystemNotification(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico' })
    }
  } catch {}
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.size < 500 * 1024) return file;
  const MAX = 1000; const QUALITY = 0.78;
  try {
    const blob = await new Promise((resolve) => {
      const safeTimer = setTimeout(() => resolve(file), 10000);
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) {
              if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
              else       { w = Math.round(w * MAX / h); h = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { clearTimeout(safeTimer); resolve(file); return; }
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((b) => { clearTimeout(safeTimer); resolve(b && b.size > 0 ? b : file); }, 'image/jpeg', QUALITY);
          } catch { clearTimeout(safeTimer); resolve(file); }
        };
        img.onerror = () => { clearTimeout(safeTimer); resolve(file); };
        img.src = e.target.result;
      };
      reader.onerror = () => { clearTimeout(safeTimer); resolve(file); };
      reader.readAsDataURL(file);
    });
    return blob;
  } catch { return file; }
}

// uploadFile — copia exacta del OnboardingView que funciona en móvil
async function uploadFile({ file, folder, userId, onProgress, onLog }) {

  // Token desde localStorage — sin getSession() para no romper el lock en móvil
  let token = SUPABASE_ANON_KEY
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY
    }
  } catch { token = SUPABASE_ANON_KEY }

  const isVideo = file.type.startsWith('video/')
  const isPdf   = file.type === 'application/pdf'
  const ext     = isVideo ? (file.name?.endsWith('.mov') ? 'mov' : 'mp4') : isPdf ? 'pdf' : 'jpg'
  const path    = `${folder}/${userId}/${folder}_${Date.now()}.${ext}`

  // Sin compresión — evita que el canvas se congele en móvil
  onLog?.(`📦 Enviando sin comprimir ${Math.round(file.size/1024)}KB`)

  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/service-photos/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY)
    xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg')
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.timeout = 180000
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round(e.loaded / e.total * 100))
    }
    xhr.onload = () => {
      onLog?.(`📡 XHR status: ${xhr.status}`)
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText?.slice(0, 150)}`))
    }
    xhr.onerror   = () => { onLog?.('📡 XHR onerror'); reject(new Error('Error de red — verifica tu conexión')) }
    xhr.ontimeout = () => { onLog?.('📡 XHR timeout'); reject(new Error('Tiempo agotado — señal débil, intenta de nuevo')) }
    xhr.send(file)
  })
  return path
}

// ── Parsear timestamp de Supabase correctamente en todos los browsers ──────────
// Supabase devuelve '2026-05-21 17:40:02.343+00' con espacio en lugar de T
// Algunos browsers no parsean correctamente → NaN. Normalizamos a ISO estándar.
function parseSupabaseTimestamp(ts) {
  if (!ts) return new Date(0);
  return new Date(ts.toString().replace(' ', 'T').replace('+00', '+00:00'));
}

// ── Countdown hook: devuelve segundos restantes hasta expires_at ──────────────
function useCountdown(expiresAt) {
  const [seconds, setSeconds] = useState(() => {
    if (!expiresAt) return 0;
    return Math.max(0, Math.floor((parseSupabaseTimestamp(expiresAt) - Date.now()) / 1000));
  });
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((parseSupabaseTimestamp(expiresAt) - Date.now()) / 1000));
      setSeconds(remaining);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  return seconds;
}

// ── Card individual de solicitud con su propio countdown ──────────────────────
function RequestCard({ request, onAccept, accepting, isMobile }) {
  const secondsLeft = useCountdown(request.expires_at);
  const minutes     = Math.floor(secondsLeft / 60);
  const secs        = secondsLeft % 60;
  const isUrgent    = secondsLeft <= 60;
  const isExpired   = secondsLeft === 0;
  const b           = request.booking;

  const timeFrom = b?.scheduled_time_from?.slice(0, 5) ?? '';
  const timeTo   = b?.scheduled_time_to?.slice(0, 5)   ?? '';

  return (
    <div style={{
      background: '#fff',
      borderRadius: 16,
      boxShadow: isUrgent ? '0 0 0 2px #ef4444, 0 4px 24px rgba(239,68,68,0.15)' : '0 4px 24px rgba(0,0,0,0.08)',
      padding: isMobile ? 16 : '18px 20px',
      opacity: isExpired ? 0.5 : 1,
      transition: 'box-shadow 0.3s',
    }}>

      {/* Header: ref + countdown */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', background: '#eff6ff', padding: '3px 10px', borderRadius: 20 }}>
          {b?.booking_ref ?? '—'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: isUrgent ? '#fef2f2' : '#f0fdf4', borderRadius: 20, padding: '4px 12px' }}>
          <Clock size={12} color={isUrgent ? '#dc2626' : '#059669'} />
          <span style={{ fontSize: 12, fontWeight: 700, color: isUrgent ? '#dc2626' : '#059669', fontFamily: 'monospace' }}>
            {isExpired ? 'Expirado' : `${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`}
          </span>
        </div>
      </div>

      {/* Servicio */}
      <div style={{ fontWeight: 700, color: '#1f2937', fontSize: isMobile ? 16 : 18, marginBottom: 12 }}>
        {b?.service_name ?? '—'}
      </div>

      {/* Info */}
      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151' }}>
          <Clock size={14} color="#3b82f6" style={{ flexShrink: 0 }} />
          <span>{b?.scheduled_date ?? '—'}</span>
          <span style={{ color: '#9ca3af' }}>·</span>
          <span style={{ fontWeight: 600 }}>{timeFrom} — {timeTo} hrs</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#6b7280' }}>
          <MapPin size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ lineHeight: 1.4 }}>{b?.address_line ?? '—'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#059669', fontWeight: 700 }}>
          <span>💰</span>
          <span>${b?.total_price ?? '—'} MXN</span>
        </div>
      </div>

      {/* Aviso urgente */}
      {isUrgent && !isExpired && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#dc2626', fontWeight: 600, textAlign: 'center' }}>
          ⚡ ¡Menos de 1 minuto! Acepta ahora o pasará al siguiente operador.
        </div>
      )}

      {isExpired ? (
        <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 0', textAlign: 'center', fontSize: 13, color: '#9ca3af', fontWeight: 600 }}>
          Solicitud expirada
        </div>
      ) : (
        <button
          onClick={() => onAccept(request)}
          disabled={accepting === request.id}
          style={{
            width: '100%',
            padding: '14px 0',
            background: accepting === request.id ? '#9ca3af' : 'linear-gradient(135deg,#10b981,#059669)',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 800,
            cursor: accepting === request.id ? 'not-allowed' : 'pointer',
            minHeight: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: '0 4px 12px rgba(16,185,129,0.3)',
            flexShrink: 0,
          }}>
          {accepting === request.id ? '⏳ Aceptando...' : <><Check size={18} /> Aceptar servicio</>}
        </button>
      )}
    </div>
  );
}


// ── PhotoUploadServicio — copia exacta de PhotoUpload del Onboarding ─────────
function PhotoUploadServicio({ label, value, onChange, capture = 'environment', onLog }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [localErr, setLocalErr]   = useState('')
  const { user } = useAuth()

  const handleFile = async (file) => {
    if (!file) return
    setUploading(true); setLocalErr(''); setProgress(0)
    onLog?.(`📁 Archivo: ${file.name} ${Math.round(file.size/1024)}KB tipo:${file.type}`)
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('El archivo no debe pesar más de 50MB.')
      const folder = label.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,'_').replace(/[^a-z_]/g,'').slice(0,30)
      onLog?.(`🚀 Iniciando upload folder:${folder}`)
      const stored = localStorage.getItem('mazclean-auth')
      onLog?.(`🔑 Token en storage: ${stored ? 'SÍ' : 'NO'}`)
      const path = await uploadFile({ file, folder, userId: user.id, onProgress: setProgress, onLog })
      onLog?.(`✅ Upload OK: ${path}`)
      onChange(path)
    } catch (e) {
      onLog?.(`❌ Error: ${e.message}`)
      setLocalErr(e.message)
    }
    finally { setUploading(false) }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {value ? (
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <img src={value.startsWith('http') ? value : `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/service-photos/${value}`} alt={label} style={{ width: '100%', height: 200, objectFit: 'cover', borderRadius: 12, border: '2px solid #bbf7d0' }} onError={e => { e.target.style.display = 'none' }} />
          <span style={{ position: 'absolute', top: 8, right: 8, background: '#10b981', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20 }}>✅ Guardada</span>
        </div>
      ) : (
        <div style={{ width: '100%', height: 160, background: '#f9fafb', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: 10, border: '2px dashed #e5e7eb' }}>
          <Camera size={40} color="#d1d5db" />
          <span style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>Sin foto aún</span>
        </div>
      )}
      {uploading && (
        <div style={{ background: '#eff6ff', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 16, height: 16, border: '2px solid #bfdbfe', borderTop: '2px solid #3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 600 }}>Subiendo... {progress}%</span>
          </div>
          <div style={{ height: 4, background: '#bfdbfe', borderRadius: 4 }}>
            <div style={{ height: '100%', width: `${progress}%`, background: '#3b82f6', borderRadius: 4, transition: 'width 0.2s' }} />
          </div>
        </div>
      )}
      {localErr && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#dc2626', fontSize: 13 }}>⚠️ {localErr}</div>}
      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', borderRadius: 12, background: uploading ? '#f3f4f6' : '#6366f1', color: uploading ? '#9ca3af' : '#fff', fontSize: 14, fontWeight: 700, cursor: uploading ? 'not-allowed' : 'pointer', pointerEvents: uploading ? 'none' : 'auto', minHeight: 50, flexShrink: 0 }}>
        📸 {value ? 'Cambiar foto' : 'Tomar foto'}
        <input type="file" accept="image/*" capture={capture} style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]) }} />
      </label>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
// ── Pantalla de Activación — componente separado para evitar problemas de scope ──
function ActivationScreen({ profile, membershipStatus, membershipPrice, effectivePromo, payingMembership, onSubscribe, onDeposit, onAcademia, onSignOut }) {
  const certDone = !!profile?.is_certified
  const memDone  = membershipStatus === 'activa'
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#050A14 0%,#0d1f3c 100%)', overflowY: 'auto', paddingBottom: 40 }}>
      <div style={{ padding: '28px 20px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 52, marginBottom: 10 }}>🚗</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#F0F6FF', margin: '0 0 8px' }}>
          ¡Ya estás dentro, {profile?.full_name?.split(' ')[0]}!
        </h1>
        <p style={{ fontSize: 14, color: '#8CA0BF', margin: '0 auto', lineHeight: 1.6, maxWidth: 320 }}>
          Solo faltan 2 pasos para empezar a recibir servicios y generar ingresos.
        </p>
      </div>

      {/* Progreso */}
      <div style={{ margin: '0 16px 24px', background: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: '16px 20px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#8CA0BF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Tu progreso</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: certDone ? 'linear-gradient(135deg,#059669,#10b981)' : 'rgba(59,130,246,0.2)', border: `2px solid ${certDone ? '#10b981' : '#3b82f6'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: 20 }}>
              {certDone ? '✅' : '🎓'}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: certDone ? '#10b981' : '#F0F6FF' }}>Certificación</div>
            <div style={{ fontSize: 11, color: certDone ? '#10b981' : '#8CA0BF', marginTop: 2 }}>{certDone ? '¡Completada!' : 'Pendiente'}</div>
          </div>
          <div style={{ width: 40, height: 2, background: certDone && memDone ? '#10b981' : 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: memDone ? 'linear-gradient(135deg,#059669,#10b981)' : 'rgba(59,130,246,0.2)', border: `2px solid ${memDone ? '#10b981' : '#3b82f6'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: 20 }}>
              {memDone ? '✅' : '💳'}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: memDone ? '#10b981' : '#F0F6FF' }}>Membresía</div>
            <div style={{ fontSize: 11, color: memDone ? '#10b981' : '#8CA0BF', marginTop: 2 }}>{memDone ? '¡Activa!' : 'Pendiente'}</div>
          </div>
          <div style={{ width: 40, height: 2, background: certDone && memDone ? '#10b981' : 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: certDone && memDone ? 'linear-gradient(135deg,#059669,#10b981)' : 'rgba(255,255,255,0.05)', border: `2px solid ${certDone && memDone ? '#10b981' : 'rgba(255,255,255,0.1)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', fontSize: 20 }}>
              🚀
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: certDone && memDone ? '#10b981' : '#4b6a8a' }}>¡A generar!</div>
            <div style={{ fontSize: 11, color: certDone && memDone ? '#10b981' : '#4b6a8a', marginTop: 2 }}>Primer servicio</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Paso 1 — Certificación */}
        <div style={{ background: certDone ? 'rgba(16,185,129,0.08)' : 'rgba(59,130,246,0.08)', border: `1.5px solid ${certDone ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.4)'}`, borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: certDone ? 0 : 14 }}>
            <div style={{ fontSize: 36, flexShrink: 0 }}>{certDone ? '✅' : '🎓'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#F0F6FF' }}>Certificación Pro</div>
                {!certDone && <span style={{ background: '#3b82f6', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>RECOMENDADO PRIMERO</span>}
              </div>
              <div style={{ fontSize: 13, color: '#8CA0BF', lineHeight: 1.6 }}>
                {certDone ? '¡Listo! Ya tienes tu Certificación Pro. Los clientes verán tu badge de calidad certificada. 🏆' : '4 módulos de estética automotriz profesional. Menos de 30 minutos. El badge que te diferencia ante los clientes.'}
              </div>
            </div>
          </div>
          {!certDone && (
            <button onClick={onAcademia} style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 50 }}>
              🎓 Iniciar Certificación Pro →
            </button>
          )}
        </div>

        {/* Paso 2 — Membresía */}
        <div style={{ background: memDone ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.04)', border: `1.5px solid ${memDone ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: memDone ? 0 : 14 }}>
            <div style={{ fontSize: 36, flexShrink: 0 }}>{memDone ? '✅' : '💳'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#F0F6FF', marginBottom: 4 }}>Membresía Mensual</div>
              <div style={{ fontSize: 13, color: '#8CA0BF', lineHeight: 1.6 }}>
                {memDone
                  ? '¡Membresía activa! Estás listo para recibir servicios.'
                  : membershipPrice === 0
                    ? 'Activando tu membresía gratuita automáticamente...'
                    : effectivePromo
                      ? `Activa tu membresía — precio especial $${membershipPrice} MXN/mes (precio regular $${effectivePromo.base_price} MXN).`
                      : `Activa tu membresía de $${membershipPrice} MXN/mes para acceder a la plataforma y empezar a generar ingresos.`}
              </div>
            </div>
          </div>
          {!memDone && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={onSubscribe} disabled={payingMembership} style={{ width: '100%', padding: '13px', background: payingMembership ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: payingMembership ? 'not-allowed' : 'pointer', minHeight: 50 }}>
                {payingMembership ? '⏳ Redirigiendo...' : membershipPrice === 0 ? '✅ Membresía gratuita activándose...' : `💳 Pagar con tarjeta $${membershipPrice} MXN/mes`}
              </button>
              <button onClick={onDeposit} style={{ width: '100%', padding: '13px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, fontSize: 14, fontWeight: 600, color: '#8CA0BF', cursor: 'pointer', minHeight: 46 }}>
                🏦 Pagar con depósito bancario
              </button>
            </div>
          )}
        </div>

        {/* Tip motivador */}
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>💡</span>
          <div style={{ fontSize: 13, color: '#fbbf24', lineHeight: 1.6 }}>
            <strong>Consejo:</strong> Te recomendamos completar primero la Certificación y luego activar la membresía. ¡Así llegas listo desde el día uno!
          </div>
        </div>

        <button onClick={onSignOut} style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, color: '#4b6a8a', fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 8 }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

// ── LevelBadge ─────────────────────────────────────────────────────────────
function LevelBadge({ level, variant }) {
  const accountStyles = {
    elite:    { bg: 'rgba(251,191,36,0.2)',  color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)',  label: '⭐ Elite' },
    proplus:  { bg: 'rgba(167,139,250,0.2)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.4)', label: '🟣 Pro+' },
    pro:      { bg: 'rgba(96,165,250,0.2)',  color: '#60a5fa', border: '1px solid rgba(96,165,250,0.4)',  label: '🔵 Pro' },
    operador: { bg: 'rgba(156,163,175,0.2)', color: '#9ca3af', border: '1px solid rgba(156,163,175,0.4)', label: '⚪ Operador' },
  }
  const ratingStyles = {
    elite:    { bg: 'rgba(251,191,36,0.12)',  color: '#92400e', label: '⭐ Elite' },
    proplus:  { bg: 'rgba(167,139,250,0.12)', color: '#5b21b6', label: '🟣 Pro+' },
    pro:      { bg: 'rgba(96,165,250,0.12)',  color: '#1e40af', label: '🔵 Pro' },
    operador: { bg: 'rgba(156,163,175,0.12)', color: '#374151', label: '⚪ Operador' },
  }
  const styles = variant === 'account' ? accountStyles : ratingStyles
  const s = styles[level] || styles.operador
  return variant === 'account'
    ? <div style={{ background: s.bg, color: s.color, border: s.border, borderRadius: 99, padding: '4px 10px', fontSize: 12, fontWeight: 700 }}>{s.label}</div>
    : <div style={{ background: s.bg, color: s.color, borderRadius: 99, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>{s.label}</div>
}

// ── FotoModal ───────────────────────────────────────────────────────────────
function FotoModal({ photoStep, photoPhase, photosData, photoBooking, isMobile, pendingFinalize, handleNextPhotoStep, setPhotoModalSafe, setPhotosData, setPhotoBooking, setPendingFinalize, setBookings, setSelectedBooking, selectedBooking, supabase }) {
  const FOTO_CONFIG = [
    { step: 1, key: 'front_before',   column: 'photo_front_before',   label: 'Foto Frontal ANTES',    desc: 'Frente del auto con placa visible', color: '#f97316' },
    { step: 2, key: 'side_before',    column: 'photo_side_before',    label: 'Foto Lateral ANTES',    desc: 'Lado más expuesto del auto',        color: '#f97316' },
    { step: 3, key: 'front_after',    column: 'photo_front_after',    label: 'Foto Frontal DESPUÉS',  desc: 'Frente del auto ya lavado',         color: '#10b981' },
    { step: 4, key: 'interior_after', column: 'photo_interior_after', label: 'Foto Interior DESPUÉS', desc: 'Interior o cajuela del auto',        color: '#10b981' },
  ]
  const cfg = FOTO_CONFIG.find(f => f.step === photoStep) || FOTO_CONFIG[0]
  const isLast = photoStep === (photoPhase === 'before' ? 2 : 4)
  const currentValue = photosData[cfg.key] || photoBooking[`photo_${cfg.key}`]
  const canGoNext = !!photosData[cfg.key]
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: '#f3f4f6', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: isMobile ? '16px 12px 80px' : '32px 16px' }}>
        <div style={{ background: `linear-gradient(135deg,${cfg.color},${cfg.color}dd)`, borderRadius: 16, padding: '20px', marginBottom: 20, color: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Foto {photoStep} de {photoPhase === 'before' ? 2 : 4}</span>
            <button onClick={() => { setPhotoModalSafe(false); setPhotosData({}); setPhotoBooking(null); setPendingFinalize(null); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', fontSize: 20, width: 36, height: 36, borderRadius: 8, cursor: 'pointer' }}>✕</button>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>{cfg.label}</h2>
          <p style={{ fontSize: 13, opacity: 0.9, margin: 0 }}>{cfg.desc}</p>
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            {FOTO_CONFIG.filter(f => photoPhase === 'before' ? f.step <= 2 : f.step >= 3).map(f => (
              <div key={f.step} style={{ flex: 1, height: 4, borderRadius: 4, background: photosData[f.key] ? '#fff' : f.step === photoStep ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)' }} />
            ))}
          </div>
        </div>
        <div style={{ background: '#fff', borderRadius: 16, padding: '20px', marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <PhotoUploadServicio label={cfg.label} value={currentValue} capture="environment"
            onChange={(path) => {
              supabase.from('bookings').update({ [cfg.column]: path, updated_at: new Date().toISOString() }).eq('id', photoBooking.id).then(({ error }) => { if (error) console.error('Error DB:', error) })
              setBookings(prev => prev.map(b => b.id === photoBooking.id ? { ...b, [cfg.column]: path } : b))
              if (selectedBooking?.id === photoBooking.id) setSelectedBooking(prev => ({ ...prev, [cfg.column]: path }))
              setPhotoBooking(prev => ({ ...prev, [cfg.column]: path }))
              setPhotosData(prev => ({ ...prev, [cfg.key]: path }))
            }}
          />
        </div>
        <button onClick={handleNextPhotoStep} disabled={!canGoNext}
          style={{ width: '100%', padding: '16px 0', background: canGoNext ? cfg.color : '#94a3b8', color: '#fff', border: 'none', borderRadius: 16, fontSize: 16, fontWeight: 700, cursor: canGoNext ? 'pointer' : 'not-allowed', minHeight: 56 }}>
          {isLast ? (pendingFinalize ? 'Ir al Checklist' : 'Listo') : 'Siguiente foto →'}
        </button>
      </div>
    </div>
  )
}

// ── InfografiaItem ──────────────────────────────────────────────────────────
function InfografiaItem({ mod, idx, total, setSelectedInfografia, setShowInfografias }) {
  const hasPrev = idx > 0
  const hasNext = idx < total - 1
  return (
    <>
      <div style={{ background: 'linear-gradient(135deg,#0c4a6e,#0369a1)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => setSelectedInfografia(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 34, whiteSpace: 'nowrap' }}>← Regresar</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Módulo {mod.order_index}</div>
          <div style={{ color: '#bae6fd', fontSize: 11 }}>{idx + 1} / {total}</div>
        </div>
        <button onClick={() => { setShowInfografias(false); setSelectedInfografia(null); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 34, height: 34, color: '#fff', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1, WebkitOverflowScrolling: 'touch', background: '#f8fafc' }}>
        <img src={mod.infografia.content_url} alt={`Infografía ${mod.title}`} style={{ width: '100%', display: 'block' }}
          onError={e => { e.target.parentElement.innerHTML = '<div style="padding:48px;text-align:center;color:#9ca3af;font-size:13px">⚠️ No se pudo cargar la imagen</div>' }} />
      </div>
      <div style={{ padding: '12px 16px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, flexShrink: 0 }}>
        <button onClick={() => setSelectedInfografia(i => i - 1)} disabled={!hasPrev}
          style={{ flex: 1, padding: '12px', background: hasPrev ? '#eff6ff' : '#f9fafb', border: `1.5px solid ${hasPrev ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: 10, fontSize: 14, fontWeight: 700, color: hasPrev ? '#1e40af' : '#d1d5db', cursor: hasPrev ? 'pointer' : 'not-allowed', minHeight: 46 }}>← Anterior</button>
        <button onClick={() => setSelectedInfografia(i => i + 1)} disabled={!hasNext}
          style={{ flex: 1, padding: '12px', background: hasNext ? '#eff6ff' : '#f9fafb', border: `1.5px solid ${hasNext ? '#bfdbfe' : '#e5e7eb'}`, borderRadius: 10, fontSize: 14, fontWeight: 700, color: hasNext ? '#1e40af' : '#d1d5db', cursor: hasNext ? 'pointer' : 'not-allowed', minHeight: 46 }}>Siguiente →</button>
      </div>
    </>
  )
}


// ── Exports ──────────────────────────────────────────────────────────────────
export {
  playNotificationSound,
  vibrateDevice,
  requestNotificationPermission,
  showSystemNotification,
  useIsMobile,
  compressImage,
  uploadFile,
  useCountdown,
  RequestCard,
  PhotoUploadServicio,
  ActivationScreen,
  LevelBadge,
  FotoModal,
  InfografiaItem,
}
