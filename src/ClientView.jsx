import { useState, useEffect, useRef } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './context/AuthContext'
import RatingSlider from './RatingSlider'
import { useToast } from './App'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

// ── Notificaciones de chat ────────────────────────────────────────────────────
function playNotificationSound() {
  try {
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
const SUPABASE_URL        = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY   = import.meta.env.VITE_SUPABASE_ANON_KEY

// Helper token a nivel módulo — accesible por todas las funciones
function getToken() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY
    }
  } catch {}
  return SUPABASE_ANON_KEY
}

const STATUS_INFO = {
  pendiente:  { label: 'Pendiente',  icon: '⏳', color: '#f59e0b', desc: 'Buscando operador disponible...' },
  confirmado: { label: 'Confirmado', icon: '📋', color: '#3b82f6', desc: 'Operador asignado, en espera de inicio' },
  en_camino:  { label: 'En camino',  icon: '🚗', color: '#6366f1', desc: 'Tu operador está en camino' },
  en_proceso: { label: 'Lavando',    icon: '🧽', color: '#8b5cf6', desc: 'Tu vehículo está siendo lavado' },
  finalizado: { label: 'Completado', icon: '✅', color: '#10b981', desc: '¡Tu vehículo está listo!' },
  cancelado:  { label: 'Cancelado',  icon: '❌', color: '#ef4444', desc: 'Reservación cancelada' },
}

function loadGoogleMapsScript(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(window.google.maps); return }
    const existing = document.getElementById('google-maps-script')
    if (existing) { existing.addEventListener('load', () => resolve(window.google.maps)); return }
    const script = document.createElement('script')
    script.id = 'google-maps-script'
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
    script.async = true
    script.onload = () => resolve(window.google.maps)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

function ReferralCodeDisplay({ userId }) {
  const [code, setCode] = useState('')
  useEffect(() => {
    if (!userId) return
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=referral_code&limit=1`, {
      headers: { 'apikey': key }
    }).then(r => r.json()).then(rows => { if (rows?.[0]?.referral_code) setCode(rows[0].referral_code) })
  }, [userId])
  return (
    <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>⚠️ Referencia obligatoria en tu depósito:</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#1f2937', fontFamily: 'monospace', letterSpacing: 2, textAlign: 'center', padding: '6px 0' }}>
        {code || '...'}
      </div>
      <div style={{ fontSize: 11, color: '#78716c', textAlign: 'center' }}>Escribe exactamente este código en el concepto o referencia de tu transferencia</div>
    </div>
  )
}

export default function ClientView() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [bookings, setBookings]           = useState([])
  const [activeBooking, setActiveBooking] = useState(null)
  const [tab, setTab]                     = useState('active')
  const [loading, setLoading]             = useState(false)
  const [fetchError, setFetchError]       = useState('')
  const [mapsLoaded, setMapsLoaded]       = useState(false)
  const [eta, setEta]                     = useState(null)
  const fetchingRef                       = useRef(false)
  const bookingsCache                     = useRef([])

  // ── Calificación ───────────────────────────────────────────────
  const [ratingModal, setRatingModal]         = useState(false)
  const [ratingBooking, setRatingBooking]     = useState(null)
  const [ratingPuntualidad, setRatingPuntualidad] = useState(0)
  const [ratingCalidad, setRatingCalidad]     = useState(0)
  const [ratingPresentacion, setRatingPresentacion] = useState(0)
  const [ratingValue, setRatingValue]         = useState(0) // promedio de los 3
  const [ratingReview, setRatingReview]       = useState('')
  const [savingRating, setSavingRating]       = useState(false)

  // ── Membresía ───────────────────────────────────────────────────
  const [membershipConfig, setMembershipConfig]       = useState(null)
  const [clientProfile, setClientProfile]             = useState(null)
  const [payingMembership, setPayingMembership]       = useState(false)
  const [payError, setPayError]                       = useState('')
  const [membershipHistory, setMembershipHistory]     = useState([])
  const [showMembershipHistory, setShowMembershipHistory] = useState(false)
  // Promo efectiva
  const [effectivePromo, setEffectivePromo]               = useState(null)
  // Deposito bancario
  const [depositModal, setDepositModal]                   = useState(false)
  const [depositLoading, setDepositLoading]               = useState(false)
  const [depositSuccess, setDepositSuccess]               = useState(false)
  const [depositError, setDepositError]                   = useState('')
  // Cancelar membresia
  const [cancellingMembership, setCancellingMembership]   = useState(false)
  // Chat interno
  // Contrato de membresía cliente
  const [showClientTerms, setShowClientTerms] = useState(false)
  const [clientTermsAccepted, setClientTermsAccepted] = useState(false)
  const [chatOpen, setChatOpen]           = useState(false)
  const [membershipExpanded, setMembershipExpanded] = useState(false)
  const [chatMessages, setChatMessages]   = useState([])
  const [chatInput, setChatInput]         = useState('')
  const [chatLoading, setChatLoading]     = useState(false)
  const [chatSending, setChatSending]     = useState(false)
  const [chatError, setChatError]         = useState('')
  const [unreadCount, setUnreadCount]     = useState(0)
  const [unreadByBooking, setUnreadByBooking] = useState({}) // { bookingId: count }
  const chatBottomRef                     = useRef(null)
  const chatChannelRef                    = useRef(null)
  const bgChannelRef                      = useRef(null)

  useEffect(() => {
    if (user) {
      fetchBookings()
      loadGoogleMapsScript(GOOGLE_MAPS_API_KEY).then(() => setMapsLoaded(true))
      fetchMembershipData()
      fetchEffectivePromo()
    }
  }, [user])


  const fetchMembershipData = async () => {
    try {
      const token = getToken()
      const headers = { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY }
      const [cfgRes, profRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/membership_config?select=*&limit=1`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=membership_status,membership_type,membership_end_at,membership_start_at,membership_record_since,stripe_subscription_id,referral_code&limit=1`, { headers }),
      ])
      if (cfgRes.ok) { const rows = await cfgRes.json(); if (rows?.[0]) setMembershipConfig(rows[0]) }
      if (profRes.ok) { const rows = await profRes.json(); if (rows?.[0]) setClientProfile(rows[0]) }
    } catch (err) { console.error('fetchMembershipData:', err) }
  }

  const fetchMembershipHistory = async () => {
    try {
      const token = getToken()
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/membership_history?user_id=eq.${user.id}&order=start_at.desc&select=*`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (res.ok) setMembershipHistory(await res.json())
    } catch (err) { console.error('fetchMembershipHistory:', err) }
  }

  const fetchEffectivePromo = async () => {
    if (!user?.id) return
    try {
      const token = getToken()
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_effective_membership_price`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_user_id: user.id, p_user_type: 'cliente' }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data?.[0]) setEffectivePromo(data[0])
      }
    } catch (err) { console.error('fetchEffectivePromo:', err) }
  }

  const handleDepositRequest = async () => {
    setDepositLoading(true)
    setDepositError('')
    try {
      const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=referral_code&limit=1`, {
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY }
      })
      const profRows = profRes.ok ? await profRes.json() : []
      const prof = profRows?.[0]
      if (!prof?.referral_code) throw new Error('No se encontró tu código de referencia')
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      let token = supabaseKey
      try {
        const stored = localStorage.getItem('mazclean-auth')
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || supabaseKey }
      } catch {}
      const amount = effectivePromo?.effective_price || membershipConfig?.client_price || 30
      const res = await fetch(`${supabaseUrl}/rest/v1/membership_requests`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, user_type: 'cliente', referral_code: prof.referral_code, amount }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setDepositSuccess(true)
    } catch (err) {
      setDepositError(err.message || 'Error al registrar solicitud')
    } finally {
      setDepositLoading(false)
    }
  }

  const handleCancelMembership = async () => {
    if (!confirm('¿Deseas cancelar tu membresía? Se mantendrá activa hasta la fecha de vencimiento.')) return
    setCancellingMembership(true)
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      let token = supabaseKey
      try {
        const stored = localStorage.getItem('mazclean-auth')
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || supabaseKey }
      } catch {}
      if (clientProfile?.stripe_subscription_id) {
        await fetch(`${supabaseUrl}/functions/v1/cancel-subscription`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription_id: clientProfile.stripe_subscription_id }),
        })
      }
      await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ membership_status: 'cancelada', updated_at: new Date().toISOString() }),
      })
      setClientProfile(prev => ({ ...prev, membership_status: 'cancelada' }))
      showToast('Membresía cancelada. Sigue activa hasta ' + (clientProfile?.membership_end_at ? new Date(clientProfile.membership_end_at).toLocaleDateString('es-MX') : 'la fecha de vencimiento'), 'info')
    } catch (err) {
      showToast('Error al cancelar: ' + err.message, 'error')
    } finally {
      setCancellingMembership(false)
    }
  }

  const handleSubscribeClient = async () => {
    setPayingMembership(true)
    setPayError('')
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      let token = supabaseKey
      try {
        const stored = localStorage.getItem('mazclean-auth')
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || supabaseKey }
      } catch {}
      const res = await fetch(`${supabaseUrl}/functions/v1/create-subscription`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cliente', user_id: user.id, email: user.email, success_url: `${window.location.origin}?membership=success`, cancel_url: window.location.href }),
      })
      const data = await res.json()
      if (!res.ok || !data?.url) throw new Error(data?.error || 'No se pudo crear la sesión de pago')
      window.location.href = data.url
    } catch (err) {
      setPayError(err.message)
      setPayingMembership(false)
    }
  }

  // ── Chat interno ──────────────────────────────────────────────────────────────
  const containsPhone = (text) => /\d[\d\s\-\.]{6,}\d/.test(text) && text.replace(/[^0-9]/g, '').length >= 8

  const fetchMessages = async (bookingId) => {
    setChatLoading(true)
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?booking_id=eq.${bookingId}&order=created_at.asc&select=*`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (res.ok) {
        const msgs = await res.json()
        setChatMessages(msgs)
        const unread = msgs.filter(m => m.sender_role === 'operador' && !m.read_at).length
        setUnreadByBooking(prev => ({ ...prev, [bookingId]: unread }))
        // Contar no leídos del operador
        setUnreadCount(msgs.filter(m => m.sender_role === 'operador' && !m.read_at).length)
      }
    } catch (err) { console.error('fetchMessages:', err) }
    finally { setChatLoading(false) }
  }

  const markMessagesRead = async (bookingId) => {
    if (!bookingId) return
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/messages?booking_id=eq.${bookingId}&sender_role=eq.operador&read_at=is.null`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ read_at: new Date().toISOString() }),
        }
      )
      setUnreadCount(0)
      setUnreadByBooking(prev => ({ ...prev, [bookingId]: 0 }))
    } catch (err) { console.error('markMessagesRead cliente:', err) }
  }

  const openChat = async (bookingId) => {
    setChatOpen(true)
    setChatInput('')
    setChatError('')
    markMessagesRead(bookingId)
    // Limpiar todos los canales previos
    if (bgChannelRef.current) { supabase.removeChannel(bgChannelRef.current); bgChannelRef.current = null }
    if (chatChannelRef.current) { supabase.removeChannel(chatChannelRef.current); chatChannelRef.current = null }
    await fetchMessages(bookingId)
    await requestNotificationPermission()
    // Canal único con nombre único para evitar conflictos
    const channelName = `chat-open-${bookingId}-${Date.now()}`
    chatChannelRef.current = supabase
      .channel(channelName)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `booking_id=eq.${bookingId}`
      }, (payload) => {
        const msg = payload.new
        if (msg.sender_role === 'operador') {
          // Chat abierto → marcar como leído inmediatamente
          markMessagesRead(bookingId)
          playNotificationSound()
          vibrateDevice()
          showSystemNotification('💬 Mensaje de tu operador', msg.content)
        }
        setChatMessages(prev => {
          // Reemplazar temporal si existe
          const tempIdx = prev.findIndex(m =>
            m.id?.toString().startsWith('temp-') &&
            m.content === msg.content &&
            m.sender_role === msg.sender_role
          )
          if (tempIdx >= 0) {
            const updated = [...prev]
            updated[tempIdx] = msg
            return updated
          }
          if (prev.find(m => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `booking_id=eq.${bookingId}`
      }, (payload) => {
        // Actualizar read_at en tiempo real — activa el doble tick azul sin refrescar
        const updated = payload.new
        setChatMessages(prev => prev.map(m => m.id === updated.id ? { ...m, read_at: updated.read_at } : m))
      })
      .subscribe((status) => {
        console.log('[Chat] Realtime status:', status)
      })
  }

  const closeChat = (bookingId) => {
    setChatOpen(false)
    setChatMessages([])
    setChatInput('')
    setChatError('')
    if (chatChannelRef.current) { supabase.removeChannel(chatChannelRef.current); chatChannelRef.current = null }
    // El canal background global (setupBackgroundChannels) ya maneja todos los bookings
    // No crear canal individual aquí para evitar doble conteo del badge
  }

  const sendMessage = async (bookingId) => {
    if (!chatInput.trim() || chatSending) return
    if (containsPhone(chatInput)) { setChatError('No está permitido compartir números de contacto en el chat.'); return }
    const msgContent = chatInput.trim()
    setChatSending(true); setChatError(''); setChatInput('')
    // Agregar mensaje optimísticamente
    const tempMsg = { id: `temp-${Date.now()}`, booking_id: bookingId, sender_id: user.id, sender_role: 'cliente', content: msgContent, created_at: new Date().toISOString() }
    setChatMessages(prev => [...prev, tempMsg])
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
        body: JSON.stringify({ booking_id: bookingId, sender_id: user.id, sender_role: 'cliente', content: msgContent }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const [saved] = await res.json()
      if (saved?.id) setChatMessages(prev => prev.map(m => m.id === tempMsg.id ? saved : m))
    } catch (err) {
      setChatMessages(prev => prev.filter(m => m.id !== tempMsg.id))
      setChatError('Error al enviar: ' + err.message)
    }
    finally { setChatSending(false) }
  }

  useEffect(() => {
    if (chatBottomRef.current) chatBottomRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  // Canal global cliente — escucha mensajes del operador en TODOS los bookings activos
  // Se reactiva cuando cambia la lista de bookings
  useEffect(() => {
    if (!user?.id || !bookings.length) return
    const activeIds = bookings
      .filter(b => ['confirmado','en_camino','en_proceso'].includes(b.status))
      .map(b => b.id)
    if (!activeIds.length) return

    // Cargar unread reales de DB por cada booking activo
    Promise.all(activeIds.map(id =>
      fetch(
        `${SUPABASE_URL}/rest/v1/messages?booking_id=eq.${id}&sender_role=eq.operador&read_at=is.null&select=id`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      ).then(r => r.json()).then(rows => ({ id, count: rows?.length || 0 })).catch(() => ({ id, count: 0 }))
    )).then(results => {
      const counts = {}
      results.forEach(({ id, count }) => { counts[id] = count })
      setUnreadByBooking(counts)
      setUnreadCount(results.reduce((s, r) => s + r.count, 0))
    })

    // Limpiar canales previos
    if (bgChannelRef.current?.remove) bgChannelRef.current.remove()

    // Un canal por cada booking activo
    requestNotificationPermission()
    const channels = activeIds.map(bookingId =>
      supabase
        .channel(`chat-bg-client-${bookingId}-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages',
          filter: `booking_id=eq.${bookingId}`,
        }, (payload) => {
          const msg = payload.new
          // Solo mensajes del operador cuando el chat de ese booking NO está abierto
          if (msg.sender_role === 'operador' && !chatOpen) {
            setUnreadByBooking(prev => ({ ...prev, [bookingId]: (prev[bookingId] || 0) + 1 }))
            setUnreadCount(prev => prev + 1)
            playNotificationSound()
            vibrateDevice()
            showSystemNotification('💬 Tu operador te escribió', msg.content)
          }
        })
        .subscribe()
    )

    bgChannelRef.current = { channels, remove: () => channels.forEach(c => supabase.removeChannel(c)) }

    return () => {
      if (bgChannelRef.current?.remove) bgChannelRef.current.remove()
      bgChannelRef.current = null
    }
  }, [bookings, user?.id])

  const fetchBookings = async (silent = false) => {
    if (fetchingRef.current) return
    fetchingRef.current = true
    if (!silent) setLoading(true)
    setFetchError('')

    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      fetchingRef.current = false
      setLoading(false)
      if (bookingsCache.current.length > 0) {
        setBookings(bookingsCache.current)
        const active = bookingsCache.current.find(b =>
          ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status)
        )
        if (active) setActiveBooking(active)
        setFetchError('Sin conexión — mostrando datos anteriores.')
      } else {
        setFetchError('Sin conexión. Verifica tu red e intenta de nuevo.')
      }
    }, 8000)

    try {
      // fetch directo — evita lock de supabase client en móvil
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?client_id=eq.${user.id}&order=created_at.desc&select=*`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      clearTimeout(timeoutId)
      if (timedOut) return
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result = await res.json()
      bookingsCache.current = result
      setBookings(result)
      const active = result.find(b =>
        ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status)
      )
      if (active) setActiveBooking(active)
      setFetchError('')
    } catch (err) {
      clearTimeout(timeoutId)
      if (timedOut) return
      if (bookingsCache.current.length > 0) {
        setBookings(bookingsCache.current)
        const active = bookingsCache.current.find(b =>
          ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status)
        )
        if (active) setActiveBooking(active)
        setFetchError('Error de red — mostrando datos anteriores.')
      } else {
        setFetchError('No se pudieron cargar las reservaciones. Verifica tu conexión.')
      }
    } finally {
      if (!timedOut) {
        fetchingRef.current = false
        setLoading(false)
      }
    }
  }

  // ── Realtime: detectar cambio a 'finalizado' y abrir modal ────
  useEffect(() => {
    if (!activeBooking) return

    const channel = supabase
      .channel(`booking-${activeBooking.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'bookings',
        filter: `id=eq.${activeBooking.id}`,
      }, (payload) => {
        const updated = payload.new

        // Actualizar estado local
        setActiveBooking(updated)
        setBookings(prev => prev.map(b => b.id === updated.id ? updated : b))
        bookingsCache.current = bookingsCache.current.map(b =>
          b.id === updated.id ? updated : b
        )

        // ── NUEVO: si acaba de pasar a 'finalizado' y no tiene calificación,
        //    abrir el modal de calificación automáticamente
        if (
          updated.status === 'finalizado' &&
          !updated.client_rating &&
          activeBooking.status !== 'finalizado' // evitar re-abrir si ya estaba finalizado
        ) {
          // Pequeño delay para que el cliente vea el cambio de estado antes del modal
          setTimeout(() => {
            // Verificar de nuevo que no se haya calificado ya (evita reabrir tras guardar)
            setBookings(prev => {
              const current = prev.find(b => b.id === updated.id)
              if (!current?.client_rating) {
                setRatingBooking(updated)
                setRatingPuntualidad(0)
                setRatingCalidad(0)
                setRatingPresentacion(0)
                setRatingValue(0)
                setRatingReview('')
                setRatingModal(true)
                setTab('history')
              }
              return prev
            })
          }, 1200)
        }

        // Si el servicio ya no está activo, limpiar activeBooking
        if (['finalizado', 'cancelado'].includes(updated.status)) {
          setActiveBooking(null)
        }
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [activeBooking?.id, activeBooking?.status])

  // ── Guardar calificación ───────────────────────────────────────
  const saveRating = async () => {
    if (!ratingPuntualidad || !ratingCalidad || !ratingPresentacion) {
      showToast('Por favor califica los 3 aspectos del servicio.', 'warning'); return
    }
    // Calcular promedio de las 3 dimensiones
    const avg = Math.round((ratingPuntualidad + ratingCalidad + ratingPresentacion) / 3)
    setRatingValue(avg)
    setSavingRating(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${ratingBooking.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          client_rating: Math.round((ratingPuntualidad + ratingCalidad + ratingPresentacion) / 3),
          client_review: ratingReview || null,
          rated_at:      new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      // Actualizar lista local con el valor calculado (no ratingValue que es async)
      const finalRating = Math.round((ratingPuntualidad + ratingCalidad + ratingPresentacion) / 3)
      setBookings(prev => prev.map(b =>
        b.id === ratingBooking.id
          ? { ...b, client_rating: finalRating, client_review: ratingReview }
          : b
      ))
      bookingsCache.current = bookingsCache.current.map(b =>
        b.id === ratingBooking.id
          ? { ...b, client_rating: finalRating, client_review: ratingReview }
          : b
      )

      showToast('¡Gracias por tu calificación! 🌟', 'success')
      setRatingModal(false)
      setRatingValue(0)
      setRatingPuntualidad(0)
      setRatingCalidad(0)
      setRatingPresentacion(0)
      setRatingReview('')
      setRatingBooking(null)
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error')
    } finally {
      setSavingRating(false)
    }
  }

  // Cerrar modal sin calificar — el cliente podrá calificar desde la card
  const dismissRatingModal = () => {
    setRatingModal(false)
    setRatingValue(0)
    setRatingPuntualidad(0)
    setRatingCalidad(0)
    setRatingPresentacion(0)
    setRatingReview('')
    // NO limpiamos ratingBooking para que el botón en la card siga disponible
  }

  const activeList  = bookings.filter(b => ['pendiente','confirmado','en_camino','en_proceso'].includes(b.status))
  const historyList = bookings.filter(b => ['finalizado','cancelado'].includes(b.status))

  if (!user) return null

  return (
    <div style={styles.container}>
      {activeBooking && ['en_camino', 'en_proceso'].includes(activeBooking.status) && (
        <TrackingCard booking={activeBooking} mapsLoaded={mapsLoaded} eta={eta} setEta={setEta} />
      )}

      {/* Botón chat global eliminado — ahora cada tarjeta tiene su propio botón */}

      <div style={styles.card}>

        {/* ── Membresía Premium colapsable ── */}
        {membershipConfig?.client_enabled && (
          <div style={{ marginBottom: 20, borderRadius: 14, overflow: 'hidden', border: clientProfile?.membership_status === 'activa' ? '1.5px solid #bbf7d0' : '1.5px solid #e9d5ff' }}>
            {/* Header siempre visible — toque para expandir/colapsar */}
            <button onClick={() => { setMembershipExpanded(p => !p); if (!showMembershipHistory) fetchMembershipHistory() }}
              style={{ width: '100%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: 'none', cursor: 'pointer' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>⭐ Membresía Premium</div>
                <div style={{ color: '#ede9fe', fontSize: 11, marginTop: 1 }}>
                  {clientProfile?.membership_status === 'activa'
                    ? `Activa · vence ${new Date(clientProfile.membership_end_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`
                    : `$${membershipConfig.client_price} MXN / mes · Toca para activar`}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {clientProfile?.membership_status === 'activa'
                  ? <span style={{ background: 'rgba(16,185,129,0.3)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: 20, padding: '3px 10px', color: '#6ee7b7', fontSize: 11, fontWeight: 700 }}>✅ Activa</span>
                  : <span style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '3px 10px', color: '#ede9fe', fontSize: 11, fontWeight: 700 }}>○ Inactiva</span>
                }
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{membershipExpanded ? '▲' : '▼'}</span>
              </div>
            </button>
            {membershipExpanded && <div style={{ background: '#faf5ff', padding: '12px 16px' }}>

              {/* Record de miembro */}
              {clientProfile?.membership_record_since && (
                <div style={{ background: '#f3e8ff', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14 }}>🏅</span>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>Miembro desde</div>
                    <div style={{ fontSize: 12, color: '#6b21a8' }}>{new Date(clientProfile.membership_record_since).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                  </div>
                </div>
              )}

              {clientProfile?.membership_status === 'activa' ? (
                <div>
                  <div style={{ fontSize: 13, color: '#6b21a8', fontWeight: 600, marginBottom: 8 }}>
                    💳 Membresía activa
                    {clientProfile.membership_end_at && (
                      <span style={{ fontWeight: 400, color: '#7c3aed', marginLeft: 6 }}>
                        — vence el {new Date(clientProfile.membership_end_at).toLocaleDateString('es-MX')}
                      </span>
                    )}
                  </div>
                  {clientProfile.membership_start_at && (
                    <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
                      Período actual: {new Date(clientProfile.membership_start_at).toLocaleDateString('es-MX')} → {clientProfile.membership_end_at ? new Date(clientProfile.membership_end_at).toLocaleDateString('es-MX') : '—'}
                    </div>
                  )}
                  <button onClick={handleCancelMembership} disabled={cancellingMembership}
                    style={{ width: '100%', padding: '10px', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40, marginBottom: 8 }}>
                    {cancellingMembership ? '⏳ Cancelando...' : '✕ Cancelar membresía'}
                  </button>
                  <button onClick={() => { setShowMembershipHistory(!showMembershipHistory); if (!showMembershipHistory) fetchMembershipHistory(); }}
                    style={{ width: '100%', padding: '10px', background: '#f3e8ff', border: '1.5px solid #d8b4fe', borderRadius: 8, color: '#7c3aed', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>
                    {showMembershipHistory ? '▲ Ocultar historial' : '📋 Ver historial de pagos'}
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12, lineHeight: 1.6 }}>
                    ⭐ Prioridad en asignación · 📅 Horarios reservados · 🎯 Operador preferente · ❌ Cancelación flexible
                  </div>
                  {/* Términos y condiciones membresía */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={() => setClientTermsAccepted(!clientTermsAccepted)}
                        style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${clientTermsAccepted ? '#10b981' : '#d1d5db'}`, background: clientTermsAccepted ? '#10b981' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {clientTermsAccepted && <span style={{ color: '#fff', fontSize: 13 }}>✓</span>}
                      </button>
                      <span style={{ fontSize: 13, color: '#374151' }}>
                        He leído y acepto los{' '}
                        <button onClick={() => setShowClientTerms(true)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 13, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                          Términos y Condiciones de Membresía
                        </button>
                      </span>
                    </div>
                  </div>
                  {/* Banner de promoción si aplica */}
                  {effectivePromo?.promo_name && (
                    <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>🏷️ {effectivePromo.promo_name}</div>
                      <div style={{ fontSize: 12, color: '#059669', marginTop: 3 }}>
                        {effectivePromo.discount_type === 'precio_fijo' && `Precio especial: $${effectivePromo.effective_price} MXN (precio normal: $${effectivePromo.base_price})`}
                        {effectivePromo.discount_type === 'porcentaje' && `${effectivePromo.discount_value}% de descuento → $${effectivePromo.effective_price} MXN/mes`}
                        {effectivePromo.discount_type === 'dias_gratis' && `¡${effectivePromo.trial_days} días gratis incluidos antes del primer cobro!`}
                      </div>
                    </div>
                  )}
                  {payError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#dc2626' }}>⚠️ {payError}</div>
                  )}
                  <button onClick={handleSubscribeClient} disabled={payingMembership || !clientTermsAccepted}
                    style={{ width: '100%', padding: '13px', background: payingMembership ? '#9ca3af' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: payingMembership ? 'not-allowed' : 'pointer', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    {payingMembership ? '⏳ Redirigiendo...' : `💳 Pagar con tarjeta $${effectivePromo?.effective_price || membershipConfig?.client_price || 30} MXN/mes`}
                  </button>
                  <button onClick={() => { if (!clientTermsAccepted) { showToast('Debes aceptar los términos y condiciones', 'warning'); return } setDepositModal(true); setDepositSuccess(false); setDepositError('') }}
                    style={{ width: '100%', marginTop: 10, padding: '13px', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#059669', cursor: 'pointer', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    🏦 Pagar con depósito bancario
                  </button>
                  <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 8 }}>
                    Pago seguro · Cancela cuando quieras
                  </div>
                  {membershipHistory.length > 0 && (
                    <button onClick={() => { setShowMembershipHistory(!showMembershipHistory); if (!showMembershipHistory) fetchMembershipHistory(); }}
                      style={{ width: '100%', padding: '10px', background: '#f3e8ff', border: '1.5px solid #d8b4fe', borderRadius: 8, color: '#7c3aed', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40, marginTop: 10 }}>
                      {showMembershipHistory ? '▲ Ocultar historial' : '📋 Ver historial de pagos'}
                    </button>
                  )}
                </div>
              )}

              {/* Historial de membresías */}
              {showMembershipHistory && (
                <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: 0.5 }}>Historial de membresías</div>
                  {membershipHistory.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Sin historial registrado aún.</div>
                  ) : membershipHistory.map((h, i) => (
                    <div key={h.id || i} style={{ background: h.status === 'activa' ? '#f0fdf4' : '#f9fafb', borderRadius: 8, padding: '10px 12px', border: `1px solid ${h.status === 'activa' ? '#bbf7d0' : '#e5e7eb'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: h.status === 'activa' ? '#059669' : '#6b7280', background: h.status === 'activa' ? '#dcfce7' : '#f3f4f6', padding: '2px 8px', borderRadius: 20 }}>
                          {h.status === 'activa' ? '✅ Activa' : '⚫ Vencida'}
                        </span>
                        {h.amount > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>${h.amount} MXN</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>
                        {new Date(h.start_at).toLocaleDateString('es-MX')} → {new Date(h.end_at).toLocaleDateString('es-MX')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>}
          </div>
        )}

        <h2 style={styles.title}>🚗 Mis Reservaciones</h2>

        {fetchError && (
          <div style={{ background: '#fef9c3', border: '1.5px solid #fde68a', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: '#854d0e', fontWeight: 600 }}>⚠️ {fetchError}</span>
            <button onClick={() => fetchBookings()} style={{ padding: '7px 14px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
              🔄 Reintentar
            </button>
          </div>
        )}

        {loading ? (
          <div style={styles.loading}>Cargando tus reservaciones...</div>
        ) : (
          <>
            <div style={styles.tabs}>
              {[
                { key: 'active',  label: `Activas (${activeList.length})` },
                { key: 'history', label: `Historial (${historyList.length})` },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  style={{ ...styles.tab, ...(tab === t.key ? styles.tabActive : {}) }}>
                  {t.label}
                </button>
              ))}
            </div>

            {(tab === 'active' ? activeList : historyList).length === 0 ? (
              <div style={styles.empty}>
                {tab === 'active' ? 'No tienes reservaciones activas' : 'Sin historial aún'}
              </div>
            ) : (
              (tab === 'active' ? activeList : historyList).map(b => (
                <BookingCard key={b.id} booking={b}
                  onRate={() => {
                    setRatingBooking(b)
                    setRatingValue(b.client_rating || 0)
                    setRatingReview(b.client_review || '')
                    setRatingModal(true)
                  }}
                  onChat={['confirmado','en_camino','en_proceso'].includes(b.status) ? () => openChat(b.id) : null}
                  chatUnread={unreadByBooking[b.id] || 0}
                />
              ))
            )}
          </>
        )}
      </div>

      {/* ════ MODAL TÉRMINOS MEMBRESÍA CLIENTE ════ */}
      {showClientTerms && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1a3a6e,#3b82f6)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>💧 MAZ CLEAN</div>
                <div style={{ color: '#bfdbfe', fontSize: 12, marginTop: 2 }}>Términos y Condiciones de Membresía Premium</div>
              </div>
              <button onClick={() => setShowClientTerms(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '20px', fontSize: 13, color: '#374151', lineHeight: 1.8 }}>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a3a6e' }}>TÉRMINOS Y CONDICIONES DE MEMBRESÍA PREMIUM</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Versión 1.0 — Ciudad de México, 2026</div>
              </div>

              <p style={{ marginBottom: 10 }}><strong>I. PARTES.</strong> MAZ CLEAN, plataforma digital operada por <strong>Juan Alberto Mazariegos Fernandez</strong>, y el Cliente suscriptor (en adelante "el Cliente").</p>

              <p style={{ marginBottom: 10 }}><strong>II. DESCRIPCIÓN.</strong> MAZ CLEAN es una plataforma tecnológica que conecta clientes con operadores independientes certificados en estética automotriz a domicilio. MAZ CLEAN actúa como intermediario tecnológico y garante del estándar de calidad de sus operadores.</p>

              <p style={{ marginBottom: 10 }}><strong>III. MEMBRESÍA PREMIUM — BENEFICIOS.</strong> Al suscribirse a la Membresía Premium por <strong>${membershipConfig?.client_price || 30} MXN mensuales</strong>, el Cliente obtiene:</p>
              <ul style={{ paddingLeft: 20, marginBottom: 10 }}>
                <li>Prioridad en asignación de servicios sobre clientes sin membresía</li>
                <li>Acceso a descuentos y promociones exclusivas para miembros</li>
                <li>Operadores verificados con identidad comprobada y Certificación Pro activa</li>
                <li>Historial de servicios con fotos de antes y después</li>
                <li>Seguimiento del operador en tiempo real durante el servicio</li>
                <li>Comunicación directa con el operador a través de la App durante el servicio</li>
              </ul>

              <p style={{ marginBottom: 10 }}><strong>IV. PRECIO Y RENOVACIÓN.</strong> La membresía tiene un costo de <strong>${membershipConfig?.client_price || 30} MXN al mes</strong> y se renueva automáticamente. MAZ CLEAN notificará cambios de precio con al menos 30 días de anticipación.</p>

              <p style={{ marginBottom: 10 }}><strong>V. CANCELACIÓN.</strong> El Cliente puede cancelar en cualquier momento desde su perfil, sin penalización ni permanencia mínima. La membresía permanece activa hasta el último día del período pagado. No se realizan reembolsos por períodos parciales salvo lo previsto por PROFECO.</p>

              <p style={{ marginBottom: 10 }}><strong>VI. RESERVACIONES.</strong> El Cliente puede cancelar sin cargo hasta 1 hora antes del servicio confirmado. Cancelaciones tardías reiteradas podrán resultar en suspensión temporal de la cuenta.</p>

              <p style={{ marginBottom: 10 }}><strong>VII. RESPONSABILIDAD.</strong> Los servicios son prestados por operadores independientes. MAZ CLEAN no es responsable por daños a vehículos u objetos durante el servicio. MAZ CLEAN garantiza que todos sus operadores han pasado verificación de identidad y cuentan con Certificación Pro activa. Ante cualquier incidencia, MAZ CLEAN actuará como mediador.</p>

              <p style={{ marginBottom: 10 }}><strong>VIII. SEGURIDAD.</strong> MAZ CLEAN verifica: identificación oficial con selfie, comprobante de domicilio, video de prueba de vida, CURP validada, firma digital de contrato y Certificación Pro. Esta verificación brinda seguridad al Cliente sobre la identidad de cada operador.</p>

              <p style={{ marginBottom: 10 }}><strong>IX. PRIVACIDAD.</strong> Los datos del Cliente son tratados conforme a la LFPDPPP. MAZ CLEAN comparte con el operador asignado únicamente nombre y dirección del servicio. Toda comunicación entre Cliente y Operador se realiza exclusivamente a través de la App — MAZ CLEAN no comparte números telefónicos.</p>

              <p style={{ marginBottom: 10 }}><strong>X. CONDUCTA.</strong> El Cliente se compromete a tratar a los operadores con respeto. MAZ CLEAN podrá suspender cuentas con conductas abusivas, reportes falsos o uso indebido de la plataforma.</p>

              <p style={{ marginBottom: 10 }}><strong>XI. JURISDICCIÓN.</strong> Para cualquier controversia, las partes se someten a los tribunales competentes de la Ciudad de México.</p>

              <p style={{ fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 12 }}>Al activar su Membresía Premium, el Cliente acepta íntegramente los presentes términos y condiciones.</p>
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setShowClientTerms(false)}
                style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 46 }}>
                Cerrar
              </button>
              <button onClick={() => { setClientTermsAccepted(true); setShowClientTerms(false) }}
                style={{ flex: 2, padding: '12px', background: 'linear-gradient(135deg,#1a3a6e,#3b82f6)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 46 }}>
                ✅ Aceptar términos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL CHAT ════ */}
      {chatOpen && activeBooking && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, height: '75vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>💬 Chat con tu operador</div>
                <div style={{ color: '#bfdbfe', fontSize: 11, marginTop: 2 }}>
                  {activeBooking?.booking_ref} · {activeBooking?.service_name}
                </div>
              </div>
              <button onClick={() => closeChat(activeBooking?.id)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc' }}>
              {chatLoading ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 24 }}>Cargando mensajes...</div>
              ) : chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 24 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
                  Sin mensajes aún. Puedes escribirle a tu operador.
                </div>
              ) : chatMessages.map(msg => {
                const isMe = msg.sender_role === 'cliente'
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{ maxWidth: '78%', padding: '8px 12px', borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMe ? '#1e40af' : '#fff', color: isMe ? '#fff' : '#1f2937', fontSize: 13, lineHeight: 1.5, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                      {!isMe && <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', marginBottom: 3 }}>Operador</div>}
                      {msg.content}
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 3, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <span>{new Date(msg.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                        {isMe && (
                          <span style={{ fontSize: 11, color: msg.read_at ? '#60a5fa' : 'rgba(255,255,255,0.6)', letterSpacing: -2, fontWeight: 700 }}>
                            {msg.read_at ? '✓✓' : (msg.id?.toString().startsWith('temp-') ? '○' : '✓')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={chatBottomRef} />
            </div>
            <div style={{ background: '#fffbeb', borderTop: '1px solid #fde68a', padding: '6px 14px', fontSize: 11, color: '#92400e', flexShrink: 0 }}>
              🔒 No compartas números telefónicos. Comunicación exclusiva de la App.
            </div>
            <div style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6', background: '#fff', flexShrink: 0 }}>
              {chatError && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 6, padding: '4px 8px', background: '#fef2f2', borderRadius: 6 }}>⚠️ {chatError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={chatInput} onChange={e => { setChatInput(e.target.value); setChatError('') }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(activeBooking.id) } }}
                  placeholder="Escribe un mensaje..." maxLength={300}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none', fontFamily: 'inherit', minHeight: 42 }} />
                <button onClick={() => sendMessage(activeBooking.id)} disabled={chatSending || !chatInput.trim()}
                  style={{ padding: '10px 16px', background: chatSending || !chatInput.trim() ? '#9ca3af' : '#1e40af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: chatSending || !chatInput.trim() ? 'not-allowed' : 'pointer', minHeight: 42, flexShrink: 0 }}>
                  {chatSending ? '⏳' : '➤'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL DEPOSITO BANCARIO ════ */}
      {depositModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 420, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ background: 'linear-gradient(135deg,#059669,#10b981)', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>🏦 Pago por depósito bancario</div>
                <div style={{ color: '#d1fae5', fontSize: 12, marginTop: 2 }}>Membresía Premium — ${effectivePromo?.effective_price || membershipConfig?.client_price || 30} MXN</div>
              </div>
              <button onClick={() => setDepositModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 32, height: 32, color: '#fff', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px' }}>
              {!depositSuccess ? (
                <>
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46', marginBottom: 10 }}>📋 Datos para tu depósito:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {[
                        ['Banco', 'BBVA'],
                        ['Titular', 'Juan Alberto Mazariegos Fernandez'],
                        ['Cuenta', '261 197 8748'],
                        ['CLABE', '012 180 02611978748 1'],
                        ['Monto', `$${effectivePromo?.effective_price || membershipConfig?.client_price || 30} MXN`],
                      ].map(([label, value]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                          <span style={{ color: '#6b7280', fontWeight: 500 }}>{label}</span>
                          <span style={{ color: '#1f2937', fontWeight: 700, fontFamily: 'monospace' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <ReferralCodeDisplay userId={user?.id} />
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
                    Tu membresía se activará en un máximo de <strong>24 horas</strong>. Recibirás una notificación por WhatsApp cuando esté activa.
                  </div>
                  {depositError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#dc2626' }}>⚠️ {depositError}</div>}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => setDepositModal(false)}
                      style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 46 }}>
                      Cerrar
                    </button>
                    <button onClick={handleDepositRequest} disabled={depositLoading}
                      style={{ flex: 2, padding: '12px', background: depositLoading ? '#9ca3af' : 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: depositLoading ? 'not-allowed' : 'pointer', minHeight: 46 }}>
                      {depositLoading ? '⏳ Registrando...' : '✅ Ya realicé el depósito'}
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>¡Solicitud registrada!</div>
                  <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.7, marginBottom: 20 }}>
                    Tu depósito fue registrado.<br/>
                    Recibirás una notificación por WhatsApp en cuanto el admin confirme tu pago (máx. 24 hrs).
                  </div>
                  <button onClick={() => setDepositModal(false)}
                    style={{ padding: '12px 32px', background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 46 }}>
                    Entendido
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════ MODAL CALIFICACIÓN ════ */}
      {ratingModal && ratingBooking && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 110,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
          // Animación de entrada suave
          animation: 'fadeIn 0.25s ease',
        }}>
          <div style={{
            background: '#fff', borderRadius: 20,
            boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
            maxWidth: 420, width: '100%',
            maxHeight: '90vh',
            display: 'flex', flexDirection: 'column',
            animation: 'slideUp 0.3s ease',
          }}>
            {/* Header — fijo */}
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '20px 24px', borderRadius: '20px 20px 0 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 18, margin: '0 0 4px' }}>
                    ✅ ¡Servicio completado!
                  </h3>
                  <p style={{ color: '#bfdbfe', fontSize: 13, margin: 0 }}>
                    ¿Cómo estuvo tu experiencia?
                  </p>
                </div>
                <button onClick={dismissRatingModal}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18, borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  ×
                </button>
              </div>
            </div>

            {/* Cuerpo — scrollable */}
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              {/* Info del servicio */}
              <div style={{ background: '#f0fdf4', borderRadius: 12, padding: '12px 16px', marginBottom: 20, border: '1px solid #bbf7d0' }}>
                <div style={{ fontWeight: 700, color: '#065f46', fontSize: 15 }}>
                  {ratingBooking.service_name}
                </div>
                <div style={{ fontSize: 12, color: '#059669', marginTop: 3 }}>
                  {ratingBooking.vehicle_brand} · {ratingBooking.vehicle_color} · {ratingBooking.scheduled_date}
                </div>
              </div>

              {/* 3 dimensiones de calificación */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>⏰ Puntualidad</span>
                    {ratingPuntualidad > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>{ratingPuntualidad}/5</span>}
                  </div>
                  <RatingSlider
                    key="puntualidad"
                    initialValue={ratingPuntualidad}
                    onRatingChange={(val) => setRatingPuntualidad(val)}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>🧼 Calidad del lavado</span>
                    {ratingCalidad > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>{ratingCalidad}/5</span>}
                  </div>
                  <RatingSlider
                    key="calidad"
                    initialValue={ratingCalidad}
                    onRatingChange={(val) => setRatingCalidad(val)}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>👔 Presentación</span>
                    {ratingPresentacion > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: '#1e40af' }}>{ratingPresentacion}/5</span>}
                  </div>
                  <RatingSlider
                    key="presentacion"
                    initialValue={ratingPresentacion}
                    onRatingChange={(val) => setRatingPresentacion(val)}
                  />
                </div>
                {ratingPuntualidad > 0 && ratingCalidad > 0 && ratingPresentacion > 0 && (
                  <div style={{ background: '#eff6ff', borderRadius: 10, padding: '8px 14px', textAlign: 'center', border: '1px solid #bfdbfe' }}>
                    <span style={{ fontSize: 13, color: '#1e40af', fontWeight: 700 }}>
                      Calificación final: {Math.round((ratingPuntualidad + ratingCalidad + ratingPresentacion) / 3)}/5 ⭐
                    </span>
                  </div>
                )}
              </div>

              {/* Comentario */}
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                  Comentario <span style={{ fontWeight: 400, color: '#9ca3af' }}>(opcional)</span>
                </label>
                <textarea
                  value={ratingReview}
                  onChange={e => setRatingReview(e.target.value)}
                  placeholder="¿Algo que quieras comentar sobre el servicio?"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none', height: 76, resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937' }}
                />
              </div>
            </div>

            {/* Footer — fijo en la parte inferior */}
            <div style={{ padding: '12px 24px 20px', display: 'flex', gap: 10, borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
              <button onClick={dismissRatingModal}
                style={{ flex: 1, padding: '12px 0', background: '#f3f4f6', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>
                Después
              </button>
              <button onClick={saveRating} disabled={savingRating || !ratingPuntualidad || !ratingCalidad || !ratingPresentacion}
                style={{ flex: 2, padding: '12px 0', background: savingRating || !ratingPuntualidad || !ratingCalidad || !ratingPresentacion ? '#9ca3af' : 'linear-gradient(135deg,#1e40af,#3b82f6)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: savingRating || !ratingPuntualidad || !ratingCalidad || !ratingPresentacion ? 'not-allowed' : 'pointer', minHeight: 48 }}>
                {savingRating ? '⏳ Guardando...' : '⭐ Enviar calificación'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(24px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// ── TrackingCard ───────────────────────────────────────────────────
function TrackingCard({ booking, mapsLoaded, eta, setEta }) {
  const mapRef            = useRef(null)
  const mapInstanceRef    = useRef(null)
  const operatorMarkerRef = useRef(null)
  const clientMarkerRef   = useRef(null)
  const status = STATUS_INFO[booking.status] || STATUS_INFO.pendiente

  useEffect(() => {
    if (!mapsLoaded || !mapRef.current) return
    const timer = setTimeout(initMap, 100)
    return () => clearTimeout(timer)
  }, [mapsLoaded, booking.id])

  const initMap = () => {
    if (mapInstanceRef.current) return
    const center = { lat: booking.address_lat || 19.4326, lng: booking.address_lng || -99.1332 }
    const map = new window.google.maps.Map(mapRef.current, { center, zoom: 14, mapTypeControl: false, streetViewControl: false, fullscreenControl: false })
    mapInstanceRef.current = map
    if (booking.address_lat && booking.address_lng) {
      clientMarkerRef.current = new window.google.maps.Marker({
        position: { lat: booking.address_lat, lng: booking.address_lng },
        map, icon: { url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png' }, title: 'Tu ubicación',
      })
    }
  }

  useEffect(() => {
    if (!booking.id) return
    const channel = supabase
      .channel(`operator-location-${booking.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'operator_locations',
        filter: `booking_id=eq.${booking.id}`,
      }, (payload) => {
        const { lat, lng } = payload.new
        updateOperatorMarker(lat, lng)
        if (booking.address_lat && booking.address_lng) calculateETA(lat, lng, booking.address_lat, booking.address_lng)
      })
      .subscribe()
    loadLastLocation()
    return () => supabase.removeChannel(channel)
  }, [booking.id, mapsLoaded])

  const loadLastLocation = async () => {
    const locRes = await fetch(
      `${SUPABASE_URL}/rest/v1/operator_locations?booking_id=eq.${booking.id}&select=*&limit=1`,
      { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
    )
    const locRows = locRes.ok ? await locRes.json() : []
    const data = locRows?.[0] || null
    if (data && mapsLoaded) {
      updateOperatorMarker(data.lat, data.lng)
      if (booking.address_lat && booking.address_lng) calculateETA(data.lat, data.lng, booking.address_lat, booking.address_lng)
    }
  }

  const updateOperatorMarker = (lat, lng) => {
    if (!mapInstanceRef.current) return
    const pos = { lat, lng }
    if (operatorMarkerRef.current) {
      operatorMarkerRef.current.setPosition(pos)
    } else {
      operatorMarkerRef.current = new window.google.maps.Marker({
        position: pos, map: mapInstanceRef.current,
        icon: { url: 'https://maps.google.com/mapfiles/ms/icons/cabs.png' },
        title: 'Tu operador', animation: window.google.maps.Animation.BOUNCE,
      })
      setTimeout(() => operatorMarkerRef.current?.setAnimation(null), 2000)
    }
    if (clientMarkerRef.current) {
      const bounds = new window.google.maps.LatLngBounds()
      bounds.extend(pos)
      bounds.extend(clientMarkerRef.current.getPosition())
      mapInstanceRef.current.fitBounds(bounds, { padding: 60 })
    } else {
      mapInstanceRef.current.setCenter(pos)
      mapInstanceRef.current.setZoom(15)
    }
  }

  const calculateETA = (fromLat, fromLng, toLat, toLng) => {
    if (!window.google) return
    new window.google.maps.DistanceMatrixService().getDistanceMatrix({
      origins:      [{ lat: fromLat, lng: fromLng }],
      destinations: [{ lat: toLat, lng: toLng }],
      travelMode:   window.google.maps.TravelMode.DRIVING,
    }, (response, status) => {
      if (status === 'OK' && response.rows[0]?.elements[0]?.status === 'OK') {
        setEta(response.rows[0].elements[0].duration.text)
      }
    })
  }

  return (
    <div style={styles.trackingCard}>
      <div style={styles.trackingHeader}>
        <div style={styles.liveChip}><span style={styles.liveDot} />EN VIVO</div>
        <div style={{ color: '#bfdbfe', fontSize: 13 }}>{booking.service_name}</div>
      </div>
      <div style={styles.statusRow}>
        <span style={{ fontSize: 32 }}>{status.icon}</span>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>{status.label}</div>
          <div style={{ color: '#bfdbfe', fontSize: 13 }}>{status.desc}</div>
        </div>
        {eta && booking.status === 'en_camino' && (
          <div style={styles.etaChip}>
            <div style={{ fontSize: 11, color: '#93c5fd' }}>LLEGA EN</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{eta}</div>
          </div>
        )}
      </div>
      {!mapsLoaded
        ? <div style={styles.mapPlaceholder}>Cargando mapa...</div>
        : <div ref={mapRef} style={styles.trackingMap} />
      }
      <div style={styles.trackingFooter}>
        <span style={{ fontSize: 12, color: '#93c5fd' }}>🔵 Tu ubicación &nbsp;&nbsp; 🚕 Operador</span>
        <span style={{ fontSize: 11, color: '#60a5fa' }}>Actualización automática</span>
      </div>
    </div>
  )
}

// ── BookingCard ────────────────────────────────────────────────────
function BookingCard({ booking, onRate, onChat, chatUnread }) {
  const status  = STATUS_INFO[booking.status] || STATUS_INFO.pendiente
  const canRate = booking.status === 'finalizado' && !booking.client_rating
  const hasRated = booking.status === 'finalizado' && booking.client_rating

  return (
    <div style={styles.bookingCard}>
      <div style={styles.bookingHeader}>
        <div>
          <div style={styles.bookingTitle}>{booking.service_name}</div>
          <div style={styles.bookingMeta}>{booking.vehicle_brand} · {booking.vehicle_color}</div>
        </div>
        <div style={{ ...styles.statusPill, background: status.color + '20', color: status.color }}>
          {status.icon} {status.label}
        </div>
      </div>
      <div style={styles.bookingInfo}>
        <span>📍 {booking.address_line}</span>
        <span>📅 {booking.scheduled_date} · {booking.scheduled_time_from?.slice(0,5) ?? booking.scheduled_time} hrs</span>
        <span>💰 ${booking.total_price || booking.service_price} MXN</span>
      </div>
      {hasRated && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#fefce8', borderRadius: 8, border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>{'⭐'.repeat(booking.client_rating)}</span>
          {booking.client_review && <span style={{ fontSize: 12, color: '#854d0e' }}>{booking.client_review}</span>}
        </div>
      )}
      {/* Botón chat — visible solo en bookings activos */}
      {onChat && (
        <button onClick={onChat}
          style={{ marginTop: 10, width: '100%', padding: '11px 0', background: 'linear-gradient(135deg,#1e40af,#3b82f6)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 44, position: 'relative' }}>
          💬 Contactar a mi operador
          {chatUnread > 0 && (
            <span style={{ background: '#dc2626', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {chatUnread}
            </span>
          )}
        </button>
      )}
      {canRate && (
        <button onClick={onRate}
          style={{ marginTop: 10, width: '100%', padding: '11px 0', background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1.5px solid #bfdbfe', borderRadius: 8, color: '#1e40af', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          ⭐ Calificar este servicio
        </button>
      )}
    </div>
  )
}

const styles = {
  container:      { minHeight: '100vh', background: '#f3f4f6', padding: 16 },
  loading:        { padding: 40, textAlign: 'center', color: '#6b7280' },
  card:           { background: '#fff', borderRadius: 16, padding: 20, maxWidth: 640, margin: '0 auto', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  title:          { fontSize: 20, fontWeight: 700, color: '#1f2937', margin: '0 0 16px' },
  tabs:           { display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #f3f4f6', paddingBottom: 8 },
  tab:            { padding: '6px 16px', borderRadius: 20, border: 'none', background: '#f3f4f6', color: '#6b7280', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
  tabActive:      { background: '#eff6ff', color: '#3b82f6', fontWeight: 600 },
  empty:          { textAlign: 'center', color: '#9ca3af', padding: '32px 0', fontSize: 14 },
  trackingCard:   { background: 'linear-gradient(135deg, #1e3a8a, #1e40af)', borderRadius: 16, padding: 16, maxWidth: 640, margin: '0 auto 16px', overflow: 'hidden' },
  trackingHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  liveChip:       { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 12px', color: '#fff', fontWeight: 700, fontSize: 12 },
  liveDot:        { width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80', display: 'inline-block' },
  statusRow:      { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 },
  etaChip:        { marginLeft: 'auto', background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '8px 14px', textAlign: 'center' },
  trackingMap:    { width: '100%', height: 240, borderRadius: 12, border: '2px solid rgba(255,255,255,0.2)', marginBottom: 10 },
  mapPlaceholder: { width: '100%', height: 240, borderRadius: 12, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93c5fd', fontSize: 14, marginBottom: 10 },
  trackingFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  bookingCard:    { border: '2px solid #f3f4f6', borderRadius: 12, padding: 14, marginBottom: 10 },
  bookingHeader:  { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  bookingTitle:   { fontWeight: 600, fontSize: 15, color: '#1f2937' },
  bookingMeta:    { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  statusPill:     { padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, flexShrink: 0 },
  bookingInfo:    { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: '#374151' },
}
