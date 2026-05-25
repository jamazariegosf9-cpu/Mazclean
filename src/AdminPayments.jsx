// src/AdminPayments.jsx
// Panel de conciliación bancaria MAZ CLEAN
// Permite al Admin subir el estado de cuenta BBVA y procesar pagos de operadores

import React, { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const STATUS_LABELS = {
  matched:          { label: 'Coincide',           color: '#059669', bg: '#f0fdf4', border: '#bbf7d0' },
  applied:          { label: 'Aplicado ✅',         color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
  amount_mismatch:  { label: 'Monto diferente ⚠️', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
  not_found:        { label: 'No identificado ❓',  color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
  duplicate:        { label: 'Duplicado 🔁',        color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe' },
  pending:          { label: 'Pendiente',            color: '#374151', bg: '#f3f4f6', border: '#e5e7eb' },
}

function getToken() {
  try {
    const stored = localStorage.getItem('mazclean-auth')
    if (stored) { const p = JSON.parse(stored); return p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY }
  } catch {}
  return SUPABASE_ANON_KEY
}

export default function AdminPayments({ isMobile }) {
  const [tab, setTab]                   = useState('upload')   // 'upload' | 'history'
  const [file, setFile]                 = useState(null)
  const [preview, setPreview]           = useState([])          // primeras 5 filas para preview
  const [allRows, setAllRows]           = useState([])          // todas las filas
  const [processing, setProcessing]     = useState(false)
  const [result, setResult]             = useState(null)
  const [error, setError]               = useState('')
  const [batches, setBatches]           = useState([])
  const [loadingBatches, setLoadingBatches] = useState(false)
  const [selectedBatch, setSelectedBatch]   = useState(null)
  const [batchPayments, setBatchPayments]   = useState([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const fileInputRef = useRef(null)

  // ── Leer archivo Excel ──────────────────────────────────────────────────────
  const handleFileChange = useCallback((e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setResult(null)
    setError('')

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const data     = new Uint8Array(evt.target.result)
        const workbook = XLSX.read(data, { type: 'array', cellDates: false })
        const sheet    = workbook.Sheets[workbook.SheetNames[0]]
        const rows     = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

        if (!rows.length) { setError('El archivo está vacío'); return }

        setAllRows(rows)
        setPreview(rows.slice(0, 6)) // header + 5 filas
      } catch (err) {
        setError('Error al leer el archivo: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(f)
  }, [])

  // ── Procesar archivo ────────────────────────────────────────────────────────
  const handleProcess = async () => {
    if (!allRows.length) return
    setProcessing(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/process-bank-file`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'apikey':        SUPABASE_ANON_KEY,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ rows: allRows, filename: file.name }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
      setResult(data)
      setAllRows([])
      setPreview([])
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err.message || 'Error al procesar el archivo')
    } finally {
      setProcessing(false)
    }
  }

  // ── Cargar historial de lotes ───────────────────────────────────────────────
  const fetchBatches = async () => {
    setLoadingBatches(true)
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/bank_payment_batches?order=uploaded_at.desc&limit=20`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (res.ok) setBatches(await res.json())
    } catch {}
    setLoadingBatches(false)
  }

  // ── Cargar pagos de un lote ─────────────────────────────────────────────────
  const fetchBatchPayments = async (batchId) => {
    setLoadingPayments(true)
    setSelectedBatch(batchId)
    setBatchPayments([])
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/bank_payments?batch_id=eq.${batchId}&order=movement_date.desc&select=*,operator:operator_id(full_name,referral_code)`,
        { headers: { 'Authorization': `Bearer ${getToken()}`, 'apikey': SUPABASE_ANON_KEY } }
      )
      if (res.ok) setBatchPayments(await res.json())
    } catch {}
    setLoadingPayments(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)', borderRadius: 16, padding: '16px 20px', color: '#fff' }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>🏦 Conciliación Bancaria</div>
        <div style={{ fontSize: 13, color: '#bfdbfe', lineHeight: 1.5 }}>
          Sube el estado de cuenta BBVA para activar membresías automáticamente
        </div>
        <div style={{ marginTop: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: '#93c5fd', marginBottom: 2 }}>CLABE MAZ CLEAN para transferencias:</div>
          <div style={{ fontFamily: 'monospace', fontSize: 14, letterSpacing: 2, color: '#fff' }}>012 180 02611978748 1</div>
          <div style={{ color: '#93c5fd', fontSize: 11, marginTop: 2 }}>BBVA · JUAN ALBERTO MAZARIEGOS FERNANDEZ</div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', background: '#e5e7eb', borderRadius: 12, padding: 4, gap: 4 }}>
        {[
          { id: 'upload',  label: '📤 Subir archivo' },
          { id: 'history', label: '📋 Historial' },
        ].map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); if (t.id === 'history') fetchBatches() }}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13,
              background: tab === t.id ? '#fff' : 'transparent',
              color:      tab === t.id ? '#1e40af' : '#6b7280',
              boxShadow:  tab === t.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB UPLOAD ── */}
      {tab === 'upload' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Instrucciones */}
          <div style={{ background: '#eff6ff', borderRadius: 14, padding: '14px 16px', border: '1px solid #bfdbfe' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginBottom: 8 }}>📋 Instrucciones</div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#374151', lineHeight: 1.8 }}>
              <li>Descarga el estado de cuenta BBVA en formato <strong>Excel (.xlsx)</strong></li>
              <li>Asegúrate de que el archivo incluya: fecha, referencia, monto</li>
              <li>Los operadores deben usar su <strong>código MAZ</strong> como referencia al transferir</li>
              <li>Sube el archivo y revisa el preview antes de procesar</li>
              <li>El sistema detecta duplicados automáticamente</li>
            </ol>
          </div>

          {/* Zona de carga */}
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{ border: '2px dashed #93c5fd', borderRadius: 14, padding: '28px 16px',
              textAlign: 'center', cursor: 'pointer', background: file ? '#f0fdf4' : '#f8fafc',
              transition: 'background 0.2s' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>{file ? '✅' : '📁'}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>
              {file ? file.name : 'Toca para seleccionar el archivo Excel'}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>
              {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Formato: .xlsx (Excel)'}
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange}
              style={{ display: 'none' }} />
          </div>

          {/* Preview de primeras filas */}
          {preview.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>Vista previa ({allRows.length - 1} filas de datos)</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Primeras 5 filas</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {preview[0]?.map((h, i) => (
                        <th key={i} style={{ padding: '6px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>
                          {String(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(1).map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                        {row.map((cell, ci) => (
                          <td key={ci} style={{ padding: '5px 10px', color: '#374151', whiteSpace: 'nowrap' }}>
                            {String(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#dc2626' }}>
              ⚠️ {error}
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 14, padding: '16px' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#065f46', marginBottom: 12 }}>✅ Conciliación completada</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { label: 'Total filas',         value: result.total_rows,  color: '#374151' },
                  { label: 'Membresías activadas', value: result.applied,     color: '#059669' },
                  { label: 'Coinciden (pendientes)', value: result.matched,   color: '#1e40af' },
                  { label: 'Monto diferente',      value: result.mismatched,  color: '#d97706' },
                  { label: 'No identificados',     value: result.not_found,   color: '#6b7280' },
                  { label: 'Duplicados ignorados', value: result.duplicates,  color: '#7c3aed' },
                ].map(stat => (
                  <div key={stat.label} style={{ background: '#fff', borderRadius: 10, padding: '10px 12px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>{stat.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setTab('history'); fetchBatches() }}
                style={{ width: '100%', marginTop: 12, padding: '11px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Ver detalle completo →
              </button>
            </div>
          )}

          {/* Botón procesar */}
          {allRows.length > 0 && !result && (
            <button onClick={handleProcess} disabled={processing}
              style={{ width: '100%', padding: '14px', background: processing ? '#9ca3af' : 'linear-gradient(135deg,#059669,#10b981)',
                color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800,
                cursor: processing ? 'not-allowed' : 'pointer', minHeight: 52 }}>
              {processing ? '⏳ Procesando conciliación...' : `🚀 Procesar ${allRows.length - 1} movimientos`}
            </button>
          )}
        </div>
      )}

      {/* ── TAB HISTORIAL ── */}
      {tab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loadingBatches ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>⏳ Cargando historial...</div>
          ) : batches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
              No hay archivos procesados aún
            </div>
          ) : (
            <>
              {batches.map(batch => (
                <div key={batch.id} style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                  <button onClick={() => selectedBatch === batch.id ? setSelectedBatch(null) : fetchBatchPayments(batch.id)}
                    style={{ width: '100%', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>📄 {batch.filename}</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          {new Date(batch.uploaded_at).toLocaleString('es-MX')} · {batch.total_rows} filas
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#059669' }}>✅ {batch.applied} aplicados</span>
                        {batch.mismatched > 0 && <span style={{ fontSize: 11, color: '#d97706' }}>⚠️ {batch.mismatched} diferencias</span>}
                        {batch.not_found > 0 && <span style={{ fontSize: 11, color: '#6b7280' }}>❓ {batch.not_found} no identificados</span>}
                      </div>
                    </div>
                  </button>

                  {/* Detalle de pagos del lote */}
                  {selectedBatch === batch.id && (
                    <div style={{ borderTop: '1px solid #f3f4f6' }}>
                      {loadingPayments ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>⏳ Cargando...</div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#f8fafc' }}>
                                {['Fecha', 'Referencia', 'Operador', 'Monto', 'Esperado', 'Estado', 'Notas'].map(h => (
                                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#6b7280', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {batchPayments.map(p => {
                                const s = STATUS_LABELS[p.status] || STATUS_LABELS.pending
                                return (
                                  <tr key={p.id} style={{ borderBottom: '0.5px solid #f3f4f6' }}>
                                    <td style={{ padding: '7px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{p.movement_date}</td>
                                    <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 600 }}>{p.reference}</td>
                                    <td style={{ padding: '7px 10px', color: '#374151' }}>{p.operator?.full_name || '—'}</td>
                                    <td style={{ padding: '7px 10px', fontWeight: 700, color: '#059669' }}>${parseFloat(p.amount).toLocaleString('es-MX')}</td>
                                    <td style={{ padding: '7px 10px', color: '#6b7280' }}>{p.expected_amount ? `$${parseFloat(p.expected_amount).toLocaleString('es-MX')}` : '—'}</td>
                                    <td style={{ padding: '7px 10px' }}>
                                      <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 99, padding: '2px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                        {s.label}
                                      </span>
                                    </td>
                                    <td style={{ padding: '7px 10px', color: '#9ca3af', fontSize: 11 }}>{p.notes || '—'}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
