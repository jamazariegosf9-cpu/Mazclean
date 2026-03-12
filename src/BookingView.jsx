// ============================================================
// MAZ CLEAN — BookingView.jsx
// Flujo de reservación conectado a Supabase
// ============================================================
import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'

const CAR_TYPES = [
  { id: 'sedan', label: 'Sedan', emoji: '🚗' },
  { id: 'suv',   label: 'SUV',   emoji: '🚙' },
  { id: 'truck', label: 'Camioneta', emoji: '🛻' },
]

const TIMES = ['08:00','09:00','10:00','11:00','13:00','14:00','15:00','16:00']

const btn = (active) => ({
  padding: '13px 16px', borderRadius: 12, cursor: 'pointer',
  border: `1px solid ${active ? '#00C8FF' : 'rgba(255,255,255,0.1)'}`,
  background: active ? 'rgba(0,200,255,0.12)' : 'rgba(255,255,255,0.04)',
  color: active ? '#00C8FF' : '#F0F6FF',
  fontWeight: 600, fontSize: 14, transition: 'all 0.2s', textAlign: 'left',
})

export default function BookingView({ onNavigate }) {
  const { user, profile } = useAuth()
  const [step, setStep]         = useState(1)
  const [services, setServices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [confirmed, setConfirmed] = useState(null)
  const [error, setError]       = useState('')

  const [carType,    setCarType]    = useState('')
  const [serviceId,  setServiceId]  = useState('')
  const [address,    setAddress]    = useState('')
  const [date,       setDate]       = useState('')
  const [time,       setTime]       = useState('')
  const [payment,    setPayment]    = useState('')

  // Cargar servicios desde Supabase
  useEffect(() => {
    supabase
      .from('services')
      .select('*')
      .order('name')
      .then(({ data, error }) => {
        console.log('DATA:', data)
        console.log('ERROR:', JSON.stringify(error))
        setServices(data || [])
        setLoading(false)
      })
  }, [])

  const selectedService = services.find(s => s.id === serviceId)
  const priceKey = `price_${carType}`
  const total = selectedService?.[priceKey] || 0

  const handleConfirm = async () => {
    if (!user) return setError('Debes iniciar sesion para reservar.')
    setSaving(true)
    setError('')

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        client_id:      user.id,
        service_id:     serviceId,
        address_line:   address,
        scheduled_date: date,
        scheduled_time: time,
        base_price:     total,
        total_price:    total,
        payment_method: payment,
        status:         'pendiente',
      })
      .select()
      .single()

    setSaving(false)
    if (error) return setError('Error al guardar: ' + error.message)
    setConfirmed(data)
  }

  // ── CONFIRMACION ──────────────────────────────────────────
  if (confirmed) {
    return (
      <div style={{ minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 40, textAlign: 'center' }}>
        <div style={{ width: 90, height: 90, borderRadius: '50%', fontSize: 44, background: 'rgba(0,229,200,0.15)', border: '2px solid #00E5C8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
        <h2 style={{ fontWeight: 800, fontSize: 32, color: '#00E5C8' }}>Reservacion Confirmada</h2>
        <p style={{ color: '#8CA0BF', maxWidth: 380, lineHeight: 1.7 }}>
          Tu folio es <strong style={{ color: '#00C8FF' }}>{confirmed.booking_ref}</strong>. Nos vemos pronto.
        </p>
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, maxWidth: 380, width: '100%', textAlign: 'left' }}>
          {[
            ['Servicio',  selectedService?.name],
            ['Vehiculo',  CAR_TYPES.find(c => c.id === carType)?.label],
            ['Direccion', address],
            ['Fecha',     date],
            ['Hora',      time],
            ['Pago',      payment],
            ['Total',     `$${total} MXN`],
          ].map(([k, v]) => v && (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 10 }}>
              <span style={{ color: '#8CA0BF' }}>{k}</span>
              <span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => onNavigate('home')} style={{ padding: '12px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', fontWeight: 700, cursor: 'pointer' }}>
            Ir al inicio
          </button>
          <button onClick={() => { setConfirmed(null); setStep(1); setCarType(''); setServiceId(''); setAddress(''); setDate(''); setTime(''); setPayment('') }}
            style={{ padding: '12px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'none', color: '#F0F6FF', fontWeight: 600, cursor: 'pointer' }}>
            Nueva reserva
          </button>
        </div>
      </div>
    )
  }

  // ── PROGRESS BAR ─────────────────────────────────────────
  const totalSteps = 4
  const Progress = () => (
    <div style={{ marginBottom: 36 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <div key={i} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i < step ? 'linear-gradient(90deg,#00C8FF,#00E5C8)' : 'rgba(255,255,255,0.08)',
            transition: 'background 0.3s',
          }}/>
        ))}
      </div>
      <p style={{ color: '#8CA0BF', fontSize: 13 }}>Paso {step} de {totalSteps}</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', padding: '40px 24px', maxWidth: 660, margin: '0 auto' }}>
      <button onClick={() => step > 1 ? setStep(s => s-1) : onNavigate('home')}
        style={{ background: 'none', border: 'none', color: '#8CA0BF', cursor: 'pointer', fontSize: 14, marginBottom: 28 }}>
        ← {step > 1 ? 'Atras' : 'Inicio'}
      </button>

      <h2 style={{ fontWeight: 800, fontSize: 28, marginBottom: 6 }}>Reservar Servicio</h2>
      <Progress />

      {error && (
        <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 10, padding: '12px 16px', color: '#F87171', fontSize: 14, marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* ── PASO 1: Vehiculo y servicio ── */}
      {step === 1 && (
        <div>
          <p style={{ color: '#8CA0BF', fontSize: 14, marginBottom: 14 }}>Tipo de vehiculo</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 28 }}>
            {CAR_TYPES.map(ct => (
              <button key={ct.id} onClick={() => setCarType(ct.id)} style={{ ...btn(carType === ct.id), textAlign: 'center' }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>{ct.emoji}</div>
                {ct.label}
              </button>
            ))}
          </div>

          <p style={{ color: '#8CA0BF', fontSize: 14, marginBottom: 14 }}>Tipo de servicio</p>
          {loading ? (
            <p style={{ color: '#8CA0BF' }}>Cargando servicios...</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {services.map(s => (
                <button key={s.id} onClick={() => setServiceId(s.id)} style={{
                  ...btn(serviceId === s.id),
                  display: 'flex', alignItems: 'center', gap: 14,
                  border: `1px solid ${serviceId === s.id ? s.color + '60' : 'rgba(255,255,255,0.08)'}`,
                  background: serviceId === s.id ? `${s.color}10` : 'rgba(255,255,255,0.03)',
                }}>
                  <span style={{ fontSize: 22 }}>{s.icon}</span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div style={{ color: '#8CA0BF', fontSize: 12 }}>⏱ {s.duration_min} min</div>
                  </div>
                  {carType && (
                    <span style={{ color: s.color, fontWeight: 800, fontSize: 18 }}>
                      ${s[priceKey]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <button onClick={() => setStep(2)} disabled={!carType || !serviceId}
            style={{ marginTop: 28, width: '100%', padding: 15, borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', opacity: (!carType || !serviceId) ? 0.4 : 1 }}>
            Continuar →
          </button>
        </div>
      )}

      {/* ── PASO 2: Direccion ── */}
      {step === 2 && (
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 20, marginBottom: 24 }}>Donde atendemos tu vehiculo?</h3>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#8CA0BF', display: 'block', marginBottom: 8 }}>Direccion completa</label>
            <input value={address} onChange={e => setAddress(e.target.value)}
              placeholder="Ej: Av. Insurgentes Sur 1234, Col. Del Valle"
              style={{ width: '100%', padding: '13px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: '#F0F6FF', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, color: '#8CA0BF', display: 'block', marginBottom: 8 }}>Notas adicionales (opcional)</label>
            <textarea placeholder="Ej: Dejar con el portero, edificio azul..."
              style={{ width: '100%', padding: '13px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: '#F0F6FF', fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: 80 }} />
          </div>

          {/* Mapa placeholder */}
          <div style={{ height: 200, borderRadius: 14, border: '1px solid rgba(0,200,255,0.2)', background: 'linear-gradient(135deg,#0A1F3C,#0D2A50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,200,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,200,255,0.05) 1px,transparent 1px)', backgroundSize: '28px 28px' }}/>
            {address ? (
              <>
                <div style={{ fontSize: 32 }}>📍</div>
                <div style={{ background: 'rgba(0,200,255,0.12)', border: '1px solid rgba(0,200,255,0.3)', borderRadius: 10, padding: '8px 16px', fontSize: 13, color: '#00C8FF' }}>
                  Direccion confirmada
                </div>
              </>
            ) : (
              <p style={{ color: '#8CA0BF', fontSize: 14 }}>Ingresa tu direccion para confirmarla</p>
            )}
          </div>

          <button onClick={() => setStep(3)} disabled={!address}
            style={{ width: '100%', padding: 15, borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', opacity: !address ? 0.4 : 1 }}>
            Confirmar Direccion →
          </button>
        </div>
      )}

      {/* ── PASO 3: Fecha y hora ── */}
      {step === 3 && (
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 20, marginBottom: 24 }}>Cuando te visitamos?</h3>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, color: '#8CA0BF', display: 'block', marginBottom: 8 }}>Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              style={{ width: '100%', padding: '13px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, color: '#F0F6FF', fontSize: 15, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <p style={{ color: '#8CA0BF', fontSize: 13, marginBottom: 14 }}>Horario disponible</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 28 }}>
            {TIMES.map(t => (
              <button key={t} onClick={() => setTime(t)} style={{ ...btn(time === t), textAlign: 'center', padding: '12px 6px' }}>
                {t}
              </button>
            ))}
          </div>

          <button onClick={() => setStep(4)} disabled={!date || !time}
            style={{ width: '100%', padding: 15, borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', opacity: (!date || !time) ? 0.4 : 1 }}>
            Continuar →
          </button>
        </div>
      )}

      {/* ── PASO 4: Pago y confirmacion ── */}
      {step === 4 && (
        <div>
          <h3 style={{ fontWeight: 700, fontSize: 20, marginBottom: 24 }}>Metodo de pago</h3>

          <div style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
            {[
              { id: 'efectivo',       label: 'Efectivo',                icon: '💵', desc: 'Pagas al operador al llegar' },
              { id: 'transferencia',  label: 'Transferencia bancaria',  icon: '🏦', desc: 'CLABE / SPEI al confirmar' },
              { id: 'tarjeta',        label: 'Tarjeta credito/debito',  icon: '💳', desc: 'Visa, Mastercard, Amex' },
            ].map(p => (
              <button key={p.id} onClick={() => setPayment(p.id)} style={{
                ...btn(payment === p.id),
                display: 'flex', alignItems: 'center', gap: 14,
              }}>
                <span style={{ fontSize: 24 }}>{p.icon}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{p.label}</div>
                  <div style={{ color: '#8CA0BF', fontSize: 12 }}>{p.desc}</div>
                </div>
                {payment === p.id && <span style={{ color: '#00C8FF' }}>✓</span>}
              </button>
            ))}
          </div>

          {/* Resumen */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,200,255,0.2)', borderRadius: 14, padding: 20, marginBottom: 20 }}>
            <p style={{ fontWeight: 700, color: '#00C8FF', marginBottom: 14 }}>Resumen</p>
            {[
              ['Servicio',  selectedService?.name],
              ['Vehiculo',  CAR_TYPES.find(c => c.id === carType)?.label],
              ['Fecha',     date],
              ['Hora',      time],
              ['Direccion', address],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: '#8CA0BF' }}>{k}</span>
                <span style={{ fontWeight: 500, maxWidth: '60%', textAlign: 'right' }}>{v}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700 }}>Total</span>
              <span style={{ fontWeight: 800, color: '#00C8FF', fontSize: 20 }}>${total} MXN</span>
            </div>
          </div>

          <button onClick={handleConfirm} disabled={!payment || saving}
            style={{ width: '100%', padding: 15, borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 15, background: 'linear-gradient(135deg,#00C8FF,#00E5C8)', color: '#050A14', opacity: (!payment || saving) ? 0.5 : 1 }}>
            {saving ? 'Guardando...' : 'Confirmar Reservacion ✓'}
          </button>
        </div>
      )}
    </div>
  )
}
