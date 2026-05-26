// src/AdminLeads.jsx
// Panel de prospectos — muestra leads captados desde anuncios de Facebook
// Permite ver quién llegó, cuándo, si ya se registró y contactarlos por WhatsApp

import React, { useState, useEffect, useCallback } from 'react'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const WA_BOT_NUMBER     = '5215539377258'

function getToken() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (stored) { const p = JSON.parse(stored); return p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY }
  } catch {}
  return SUPABASE_ANON_KEY
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins < 60)  return `hace ${mins} min`
  if (hours < 24) return `hace ${hours}h`
  return `hace ${days}d`
}

function formatPhone(phone) {
  // Formatear teléfono para mostrar
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('52')) {
    return `+52 ${digits.slice(2,4)} ${digits.slice(4,8)} ${digits.slice(8)}`
  }
  return phone
}

function openWhatsApp(phone) {
  const digits = phone.replace(/\D/g, '')
  const wa = digits.startsWith('52') ? digits : '52' + digits.slice(-10)
  window.open(`https://wa.me/${wa}`, '_blank')
}

export default function AdminLeads({ isMobile }) {
  const [leads, setLeads]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [filter, setFilter]     = useState('all') // 'all' | 'registered' | 'pending'
  const [search, setSearch]     = useState('')

  const fetchLeads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Traer leads con join a profiles para saber si ya se registraron
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/ad_leads?order=created_at.desc&limit=100&select=*,profile:profile_id(id,full_name,role,membership_status)`,
        {
          headers: {
            'Authorization': `Bearer ${getToken()}`,
            'apikey':        SUPABASE_ANON_KEY,
          }
        }
      )
      if (!res.ok) throw new Error('Error al cargar prospectos')
      const data = await res.json()
      setLeads(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  // Filtrar y buscar
  const filtered = leads.filter(lead => {
    const matchSearch = search === '' ||
      lead.phone.includes(search) ||
      lead.ad_message?.toLowerCase().includes(search.toLowerCase()) ||
      lead.profile?.full_name?.toLowerCase().includes(search.toLowerCase())

    const matchFilter =
      filter === 'all'        ? true :
      filter === 'registered' ? !!lead.profile :
      filter === 'pending'    ? !lead.profile  : true

    return matchSearch && matchFilter
  })

  const totalRegistered = leads.filter(l => !!l.profile).length
  const totalPending    = leads.filter(l => !l.profile).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', borderRadius: 16, padding: '16px 20px', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>🎯 Prospectos — Anuncio Facebook</div>
        <div style={{ fontSize: 13, color: '#ddd6fe', lineHeight: 1.5 }}>
          Personas que llegaron desde el anuncio de reclutamiento de operadores
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
          {[
            { label: 'Total leads',    value: leads.length,    color: '#fff' },
            { label: 'Registrados',    value: totalRegistered, color: '#86efac' },
            { label: 'Sin registrar',  value: totalPending,    color: '#fde68a' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#ddd6fe', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { id: 'all',        label: `Todos (${leads.length})` },
          { id: 'pending',    label: `Sin registrar (${totalPending})` },
          { id: 'registered', label: `Registrados (${totalRegistered})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{ padding: '7px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: filter === f.id ? '#7c3aed' : '#f3f4f6',
              color:      filter === f.id ? '#fff' : '#6b7280' }}>
            {f.label}
          </button>
        ))}

        <button onClick={fetchLeads}
          style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 99, border: '1px solid #e5e7eb',
            background: '#fff', fontSize: 12, fontWeight: 600, color: '#6b7280', cursor: 'pointer' }}>
          🔄 Actualizar
        </button>
      </div>

      {/* Búsqueda */}
      <input
        placeholder="Buscar por teléfono, nombre o mensaje..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e7eb',
          fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
      />

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '12px 16px', fontSize: 13, color: '#dc2626' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
          ⏳ Cargando prospectos...
        </div>
      )}

      {/* Sin resultados */}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
          {leads.length === 0
            ? 'Aún no hay prospectos — cuando alguien llegue del anuncio aparecerá aquí'
            : 'No hay resultados para esta búsqueda'}
        </div>
      )}

      {/* Lista de leads */}
      {!loading && filtered.map(lead => {
        const isRegistered = !!lead.profile
        const membershipOk = lead.profile?.membership_status === 'activa'

        return (
          <div key={lead.id} style={{ background: '#fff', borderRadius: 14,
            border: `1px solid ${isRegistered ? '#bbf7d0' : '#e5e7eb'}`,
            overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

            {/* Header del card */}
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>

                {/* Nombre o teléfono */}
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937', marginBottom: 2 }}>
                  {lead.profile?.full_name || formatPhone(lead.phone)}
                </div>

                {/* Teléfono si tiene nombre */}
                {lead.profile?.full_name && (
                  <div style={{ fontSize: 12, color: '#6b7280', fontFamily: 'monospace' }}>
                    {formatPhone(lead.phone)}
                  </div>
                )}

                {/* Tiempo */}
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                  📅 {timeAgo(lead.created_at)} · {new Date(lead.created_at).toLocaleDateString('es-MX')}
                </div>
              </div>

              {/* Status badges */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, borderRadius: 99, padding: '3px 10px',
                  background: isRegistered ? '#f0fdf4' : '#fffbeb',
                  color:      isRegistered ? '#059669' : '#d97706',
                  border:     `1px solid ${isRegistered ? '#bbf7d0' : '#fde68a'}`
                }}>
                  {isRegistered ? '✅ Registrado' : '⏳ Sin registrar'}
                </span>
                {isRegistered && (
                  <span style={{
                    fontSize: 11, fontWeight: 600, borderRadius: 99, padding: '3px 10px',
                    background: membershipOk ? '#eff6ff' : '#f9fafb',
                    color:      membershipOk ? '#1e40af' : '#6b7280',
                    border:     `1px solid ${membershipOk ? '#bfdbfe' : '#e5e7eb'}`
                  }}>
                    {membershipOk ? '💳 Membresía activa' : '💳 Sin membresía'}
                  </span>
                )}
              </div>
            </div>

            {/* Mensaje original */}
            {lead.ad_message && (
              <div style={{ margin: '0 16px 12px', padding: '8px 12px',
                background: '#f8fafc', borderRadius: 8, border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Mensaje del anuncio
                </div>
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>
                  "{lead.ad_message}"
                </div>
              </div>
            )}

            {/* Fuente */}
            <div style={{ padding: '0 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                📢 {lead.source === 'facebook_ad' ? 'Anuncio Facebook' : lead.source}
              </span>

              {/* Botón WhatsApp */}
              <button
                onClick={() => openWhatsApp(lead.phone)}
                style={{ padding: '6px 14px', background: '#25d366', border: 'none',
                  borderRadius: 99, color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                💬 WhatsApp
              </button>
            </div>
          </div>
        )
      })}

      {/* Footer info */}
      {!loading && leads.length > 0 && (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', paddingBottom: 8 }}>
          Mostrando {filtered.length} de {leads.length} prospectos
        </div>
      )}

    </div>
  )
}
