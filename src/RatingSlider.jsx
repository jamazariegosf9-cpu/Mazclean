import { useState, useRef, useEffect } from 'react'

const LABELS = [
  { min: 0,  max: 20,  text: 'Mala experiencia',   color: '#ef4444' },
  { min: 21, max: 40,  text: 'Aceptable',           color: '#f97316' },
  { min: 41, max: 60,  text: 'Aceptable',           color: '#f59e0b' },
  { min: 61, max: 90,  text: '¡Buen servicio!',     color: '#3b82f6' },
  { min: 91, max: 100, text: '¡TU AUTO, IMPECABLE!', color: '#1e40af' },
]

const getLabel = (pct) => LABELS.find(l => pct >= l.min && pct <= l.max) || LABELS[0]

const pctToRating = (pct) => {
  if (pct <= 20)  return 1
  if (pct <= 40)  return 2
  if (pct <= 60)  return 3
  if (pct <= 80)  return 4
  return 5
}

// ── SVG Auto sucio ────────────────────────────────────────────────
const DirtyCar = () => (
  <svg width="48" height="36" viewBox="0 0 48 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="16" width="40" height="14" rx="4" fill="#9ca3af"/>
    <rect x="8" y="10" width="28" height="12" rx="3" fill="#6b7280"/>
    <rect x="10" y="12" width="10" height="7" rx="1.5" fill="#d1d5db" opacity="0.5"/>
    <rect x="23" y="12" width="10" height="7" rx="1.5" fill="#d1d5db" opacity="0.5"/>
    <circle cx="13" cy="30" r="4" fill="#4b5563"/>
    <circle cx="13" cy="30" r="2" fill="#9ca3af"/>
    <circle cx="35" cy="30" r="4" fill="#4b5563"/>
    <circle cx="35" cy="30" r="2" fill="#9ca3af"/>
    {/* Manchas de polvo */}
    <circle cx="16" cy="18" r="2" fill="#d1d5db" opacity="0.7"/>
    <circle cx="30" cy="20" r="1.5" fill="#d1d5db" opacity="0.6"/>
    <circle cx="22" cy="17" r="1" fill="#d1d5db" opacity="0.5"/>
    <circle cx="38" cy="19" r="1.5" fill="#d1d5db" opacity="0.6"/>
    <text x="6" y="9" fontSize="6" fill="#9ca3af" opacity="0.8">· · ·</text>
  </svg>
)

// ── SVG Auto limpio con destellos ─────────────────────────────────
const CleanCar = ({ sparkling }) => (
  <svg width="48" height="36" viewBox="0 0 48 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="16" width="40" height="14" rx="4" fill="#3b82f6"/>
    <rect x="8" y="10" width="28" height="12" rx="3" fill="#1e40af"/>
    <rect x="10" y="12" width="10" height="7" rx="1.5" fill="#bfdbfe" opacity="0.8"/>
    <rect x="23" y="12" width="10" height="7" rx="1.5" fill="#bfdbfe" opacity="0.8"/>
    <circle cx="13" cy="30" r="4" fill="#1e3a8a"/>
    <circle cx="13" cy="30" r="2" fill="#60a5fa"/>
    <circle cx="35" cy="30" r="4" fill="#1e3a8a"/>
    <circle cx="35" cy="30" r="2" fill="#60a5fa"/>
    {/* Destellos */}
    {sparkling && (
      <>
        <line x1="42" y1="8"  x2="44" y2="6"  stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="43" y1="7"  x2="43" y2="4"  stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="44" y1="8"  x2="46" y2="8"  stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="5"  y1="10" x2="3"  y2="8"  stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="4"  y1="9"  x2="4"  y2="6"  stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="3"  y1="10" x2="1"  y2="10" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="24" cy="5" r="1.5" fill="#fbbf24"/>
        <line x1="24" y1="2"  x2="24" y2="1"  stroke="#fbbf24" strokeWidth="1" strokeLinecap="round"/>
        <line x1="24" y1="8"  x2="24" y2="9"  stroke="#fbbf24" strokeWidth="1" strokeLinecap="round"/>
        <line x1="21" y1="5"  x2="20" y2="5"  stroke="#fbbf24" strokeWidth="1" strokeLinecap="round"/>
        <line x1="27" y1="5"  x2="28" y2="5"  stroke="#fbbf24" strokeWidth="1" strokeLinecap="round"/>
      </>
    )}
  </svg>
)

// ── Confeti mini ──────────────────────────────────────────────────
const ConfettiPiece = ({ style }) => <div style={style} />

export default function RatingSlider({ onRatingChange, initialValue = 0 }) {
  const [pct, setPct]             = useState(initialValue > 0 ? (initialValue / 5) * 100 : 0)
  const [sparkling, setSparkling] = useState(false)
  const [confetti, setConfetti]   = useState([])
  const [dragging, setDragging]   = useState(false)
  const trackRef                  = useRef(null)
  const prevPctRef                = useRef(pct)

  // Notificar al padre cuando cambia el rating
  useEffect(() => {
    const rating = pctToRating(pct)
    onRatingChange(rating)
  }, [pct])

  // Activar destellos y confeti al llegar a 100%
  useEffect(() => {
    if (pct >= 91 && prevPctRef.current < 91) {
      setSparkling(true)
      spawnConfetti()
      setTimeout(() => setSparkling(false), 2000)
    }
    prevPctRef.current = pct
  }, [pct])

  const spawnConfetti = () => {
    const pieces = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      left:  `${10 + Math.random() * 80}%`,
      color: ['#3b82f6','#fbbf24','#10b981','#f97316','#a78bfa'][Math.floor(Math.random() * 5)],
      delay: `${Math.random() * 0.3}s`,
      size:  `${4 + Math.random() * 4}px`,
    }))
    setConfetti(pieces)
    setTimeout(() => setConfetti([]), 1500)
  }

  const calcPct = (clientX) => {
    if (!trackRef.current) return 0
    const rect = trackRef.current.getBoundingClientRect()
    const raw  = ((clientX - rect.left) / rect.width) * 100
    return Math.min(100, Math.max(0, Math.round(raw)))
  }

  // Mouse events
  const onMouseDown = (e) => { setDragging(true); setPct(calcPct(e.clientX)) }
  const onMouseMove = (e) => { if (dragging) setPct(calcPct(e.clientX)) }
  const onMouseUp   = ()  => setDragging(false)

  // Touch events
  const onTouchStart = (e) => { setDragging(true); setPct(calcPct(e.touches[0].clientX)) }
  const onTouchMove  = (e) => { if (dragging) setPct(calcPct(e.touches[0].clientX)) }
  const onTouchEnd   = ()  => setDragging(false)

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      window.addEventListener('touchmove', onTouchMove, { passive: true })
      window.addEventListener('touchend', onTouchEnd)
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [dragging, pct])

  const label   = getLabel(pct)
  const rating  = pctToRating(pct)
  const trackBg = pct === 0 ? '#e5e7eb' : `linear-gradient(90deg, ${label.color} ${pct}%, #e5e7eb ${pct}%)`

  return (
    <div style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>

      {/* Autos + barra */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>

        {/* Auto sucio */}
        <div style={{ flexShrink: 0, opacity: pct > 50 ? 0.4 : 1, transition: 'opacity 0.3s' }}>
          <DirtyCar />
        </div>

        {/* Track */}
        <div style={{ flex: 1, position: 'relative', paddingTop: 8, paddingBottom: 8, cursor: 'pointer' }}
          ref={trackRef}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
        >
          {/* Barra de fondo */}
          <div style={{
            height: 10, borderRadius: 99,
            background: trackBg,
            transition: dragging ? 'none' : 'background 0.2s',
            boxShadow: pct > 0 ? `0 0 8px ${label.color}55` : 'none',
          }} />

          {/* Thumb */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: `${pct}%`,
            transform: 'translate(-50%, -50%)',
            width: 26, height: 26,
            borderRadius: '50%',
            background: pct === 0 ? '#e5e7eb' : label.color,
            border: '3px solid #fff',
            boxShadow: `0 2px 8px ${pct === 0 ? '#00000033' : label.color + '88'}`,
            transition: dragging ? 'none' : 'background 0.2s, left 0.05s',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab',
          }}>
            {pct > 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', lineHeight: 1 }}>
                {rating}
              </span>
            )}
          </div>

          {/* Confeti */}
          {confetti.map(piece => (
            <ConfettiPiece key={piece.id} style={{
              position: 'absolute',
              top: -20,
              left: piece.left,
              width: piece.size,
              height: piece.size,
              borderRadius: 2,
              background: piece.color,
              animation: `fall 1.2s ease-in ${piece.delay} forwards`,
              pointerEvents: 'none',
            }} />
          ))}
        </div>

        {/* Auto limpio */}
        <div style={{ flexShrink: 0, opacity: pct < 50 ? 0.4 : 1, transition: 'opacity 0.3s', position: 'relative' }}>
          <CleanCar sparkling={sparkling} />
          {sparkling && (
            <div style={{
              position: 'absolute', inset: 0,
              borderRadius: 8,
              background: 'radial-gradient(circle, #fbbf2444 0%, transparent 70%)',
              animation: 'pulse 0.5s ease-in-out 3',
              pointerEvents: 'none',
            }} />
          )}
        </div>
      </div>

      {/* Texto dinámico */}
      <div style={{ textAlign: 'center', minHeight: 28 }}>
        {pct === 0 ? (
          <span style={{ fontSize: 13, color: '#9ca3af' }}>Desliza para calificar</span>
        ) : (
          <span style={{
            fontSize: pct >= 91 ? 15 : 13,
            fontWeight: pct >= 91 ? 800 : 600,
            color: label.color,
            letterSpacing: pct >= 91 ? 0.5 : 0,
            transition: 'all 0.2s',
          }}>
            {label.text}
          </span>
        )}
      </div>

      {/* CSS para animaciones */}
      <style>{`
        @keyframes fall {
          0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(40px) rotate(180deg); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.3; }
          50%       { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
