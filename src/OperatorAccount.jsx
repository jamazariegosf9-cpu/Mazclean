import React from 'react';
import { Clock } from 'lucide-react';
import { LevelBadge } from './OperatorHelpers';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GOOGLE_MAPS_KEY   = import.meta.env.VITE_GOOGLE_MAPS_KEY || '';

const WORK_DAYS_LABELS = {
  lunes: 'Lun', martes: 'Mar', miercoles: 'Mie',
  jueves: 'Jue', viernes: 'Vie', sabado: 'Sab', domingo: 'Dom',
};

export default function OperatorAccount({
  activeTab,
  // Mi Cuenta
  commissionData, loadingCommission, ratingData,
  effectiveProfile, membershipConfig, effectivePromo,
  membershipHistory, showMembershipHistory, setShowMembershipHistory,
  payingMembership, payError, cancellingMembership,
  handleSubscribeOperator, handleDepositRequest, handleCancelMembership,
  fetchMembershipHistory, setDepositModal,
  // Mi Configuracion
  excTab, setExcTab,
  exceptions, excLoading,
  excType, setExcType,
  excStartDate, setExcStartDate,
  excEndDate, setExcEndDate,
  excStartTime, setExcStartTime,
  excEndTime, setExcEndTime,
  excReason, setExcReason,
  excSaving, excError,
  saveException, deleteException,
  newWorkDays, setNewWorkDays,
  newWorkStart, setNewWorkStart,
  newWorkEnd, setNewWorkEnd,
  savingSchedule, scheduleError, saveScheduleChange,
  zoneRequest, zoneForm, setZoneForm,
  zoneMapUrl, savingZone, zoneSuccess, zoneError,
  submitZoneRequest, geocodeZoneAddress,
  profile, isMobile,
}) {
  return (
    <>
        {activeTab === 'micuenta' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── TARJETA MI CUENTA DEL MES ── */}
        {commissionData && !loadingCommission && (
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1.5px solid #e5e7eb', marginBottom: 4 }}>
            {/* Header */}
            <div style={{ background: '#1e3a8a', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>💰 Mi cuenta del mes</div>
                {commissionData.cycleEnd && (
                  <div style={{ color: '#93c5fd', fontSize: 11, marginTop: 2 }}>
                    Cierra el {new Date(commissionData.cycleEnd).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
                  </div>
                )}
              </div>
              {/* Badge de nivel */}
              <LevelBadge level={commissionData.level} variant="account" />
            </div>
            {/* Cuerpo */}
            <div style={{ padding: '14px 16px' }}>
              {/* Fila ingresos */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '0.5px solid #f3f4f6' }}>
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  Ingresos acumulados
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>({commissionData.serviceCount} servicios)</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1f2937' }}>${commissionData.totalIncome.toLocaleString('es-MX')} MXN</div>
              </div>
              {/* Fila comisión */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '0.5px solid #f3f4f6' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Comisión MAZ CLEAN</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{commissionData.pct}% · tarifa nivel {commissionData.level}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>−${commissionData.commission.toLocaleString('es-MX')} MXN</div>
              </div>
              {/* Fila membresía */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '0.5px solid #f3f4f6' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>Membresía mensual</div>
                  {commissionData.level !== 'operador' && (
                    <div style={{ fontSize: 11, color: '#059669', marginTop: 1 }}>
                      {commissionData.level === 'pro' ? '10' : commissionData.level === 'proplus' ? '20' : '35'}% de descuento por tu nivel
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626' }}>−${commissionData.membership.toLocaleString('es-MX')} MXN</div>
              </div>
              {/* Total */}
              <div style={{ background: '#1e3a8a', borderRadius: 10, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Total a depositar</div>
                  {commissionData.cycleEnd && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                      {new Date(commissionData.cycleEnd).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>${commissionData.totalDue.toLocaleString('es-MX')} MXN</div>
              </div>
              {/* Tabla de niveles colapsable */}
              <div style={{ marginTop: 12, background: '#f8fafc', borderRadius: 10, padding: '10px 12px', border: '0.5px solid #e5e7eb' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Comisión según nivel</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textAlign: 'left', padding: '3px 6px', borderBottom: '0.5px solid #e5e7eb' }}>Nivel</th>
                      <th style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textAlign: 'left', padding: '3px 6px', borderBottom: '0.5px solid #e5e7eb' }}>Calificación</th>
                      <th style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textAlign: 'right', padding: '3px 6px', borderBottom: '0.5px solid #e5e7eb' }}>Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionData.levelsTable.map(row => {
                      const isActive = row.key === commissionData.level
                      return (
                        <tr key={row.key} style={{ background: isActive ? '#eff6ff' : 'transparent' }}>
                          <td style={{ padding: '6px 6px', fontSize: 12, color: isActive ? '#1e40af' : '#374151', fontWeight: isActive ? 700 : 400, borderBottom: '0.5px solid #f3f4f6' }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: row.dot, marginRight: 6 }} />
                            {row.label}
                          </td>
                          <td style={{ padding: '6px 6px', fontSize: 12, color: '#9ca3af', borderBottom: '0.5px solid #f3f4f6' }}>{row.range} ⭐</td>
                          <td style={{ padding: '6px 6px', fontSize: 12, textAlign: 'right', fontWeight: isActive ? 700 : 400, color: isActive ? '#059669' : '#6b7280', borderBottom: '0.5px solid #f3f4f6' }}>
                            {row.pct}%{isActive ? ' ← tú' : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── DASHBOARD CALIFICACIÓN ── */}
        {ratingData && (
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1.5px solid #e5e7eb', marginBottom: 4 }}>
            {/* Header */}
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>⭐ Mi calificación</div>
              <LevelBadge level={ratingData.level} variant="rating" />
            </div>
            <div style={{ padding: '14px 16px' }}>
              {/* Promedio grande */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: ratingData.avg >= 4.8 ? '#f59e0b' : ratingData.avg >= 4.0 ? '#3b82f6' : '#9ca3af', lineHeight: 1 }}>
                    {ratingData.avg > 0 ? ratingData.avg.toFixed(1) : '—'}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    {ratingData.total > 0 ? `${ratingData.total} calificaciones` : 'Sin calificaciones aún'}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  {/* Estrellas visuales */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} style={{ flex: 1, height: 8, borderRadius: 4,
                        background: ratingData.avg >= i ? (ratingData.avg >= 4.8 ? '#f59e0b' : '#3b82f6') : '#e5e7eb' }} />
                    ))}
                  </div>
                  {/* Barra progreso hacia siguiente nivel */}
                  {ratingData.currentLevel.next && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>
                        <span>{ratingData.currentLevel.label}</span>
                        <span>{ratingData.currentLevel.next}</span>
                      </div>
                      <div style={{ background: '#f3f4f6', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${ratingData.progress}%`, height: '100%', borderRadius: 99,
                          background: ratingData.level === 'elite' ? '#f59e0b' : 'linear-gradient(90deg,#3b82f6,#a78bfa)', transition: 'width 0.6s ease' }} />
                      </div>
                      {ratingData.puntosParaSubir > 0 && ratingData.total > 0 && (
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, textAlign: 'center' }}>
                          Te faltan <strong style={{ color: '#1e40af' }}>{ratingData.puntosParaSubir} ⭐</strong> para llegar a {ratingData.currentLevel.next}
                        </div>
                      )}
                      {ratingData.total === 0 && (
                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, textAlign: 'center' }}>
                          Completa servicios para comenzar a acumular calificaciones
                        </div>
                      )}
                    </div>
                  )}
                  {ratingData.level === 'elite' && (
                    <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 700, textAlign: 'center', marginTop: 4 }}>
                      🏆 Nivel máximo — ¡sigue así!
                    </div>
                  )}
                </div>
              </div>
              {/* Info de impacto en comisiones */}
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '8px 12px', border: '1px solid #bbf7d0', fontSize: 12, color: '#065f46' }}>
                💡 Tu nivel determina tu comisión y descuento en membresía. Mantén tu calificación alta para pagar menos.
              </div>
            </div>
          </div>
        )}

          {/* Placeholder si no hay datos aún */}
          {!commissionData && !ratingData && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
              <p style={{ color: '#9ca3af', fontSize: 14 }}>Completa servicios para ver tu resumen de cuenta.</p>
            </div>
          )}

          </div>
        )}

        {/* ── TAB MIS HORARIOS ── */}
        {activeTab === 'horarios' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Sub-tabs: Excepciones / Horario permanente / Mi Zona */}
            <div style={{ display: 'flex', background: '#e5e7eb', borderRadius: 12, padding: 4, gap: 4 }}>
              <button onClick={() => setExcTab('excepciones')}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                  background: excTab === 'excepciones' ? '#fff' : 'transparent',
                  color:      excTab === 'excepciones' ? '#1e40af' : '#6b7280',
                  boxShadow:  excTab === 'excepciones' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                📅 Excepciones
              </button>
              <button onClick={() => setExcTab('horario')}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                  background: excTab === 'horario' ? '#fff' : 'transparent',
                  color:      excTab === 'horario' ? '#1e40af' : '#6b7280',
                  boxShadow:  excTab === 'horario' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                🕐 Horario
              </button>
              <button onClick={() => setExcTab('zona')}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12,
                  background: excTab === 'zona' ? '#fff' : 'transparent',
                  color:      excTab === 'zona' ? '#1e40af' : '#6b7280',
                  boxShadow:  excTab === 'zona' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                🗺️ Mi Zona
              </button>
            </div>

            {/* ── SUB-TAB EXCEPCIONES ── */}
            {excTab === 'excepciones' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Formulario nueva excepción */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '18px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1f2937', marginBottom: 14 }}>➕ Nueva excepción</div>

                  {/* Tipo */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Tipo</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {[
                        { v: 'day_off',  label: '🚫 Pausa horario' },
                        { v: 'vacation', label: '🏖️ Vacaciones' },
                      ].map(opt => (
                        <button key={opt.v} onClick={() => setExcType(opt.v)}
                          style={{ flex: 1, padding: '10px 4px', borderRadius: 10, border: `2px solid ${excType === opt.v ? '#3b82f6' : '#e5e7eb'}`,
                            background: excType === opt.v ? '#eff6ff' : '#f9fafb',
                            color: excType === opt.v ? '#1e40af' : '#374151',
                            fontWeight: 700, fontSize: 12, cursor: 'pointer', minHeight: 44 }}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fecha inicio */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>
                      {excType === 'day_off' ? 'Fecha' : 'Fecha de inicio'}
                    </label>
                    <input type="date" value={excStartDate} onChange={e => setExcStartDate(e.target.value)}
                      min={new Date().toISOString().slice(0,10)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>

                  {/* Horas (solo day_off) */}
                  {excType === 'day_off' && (
                    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Hora inicio</label>
                        <input type="time" value={excStartTime} onChange={e => setExcStartTime(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Hora fin</label>
                        <input type="time" value={excEndTime} onChange={e => setExcEndTime(e.target.value)}
                          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                      </div>
                    </div>
                  )}

                  {/* Fecha fin (solo vacation) */}
                  {excType === 'vacation' && (
                    <div style={{ marginBottom: 12 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Fecha de regreso</label>
                      <input type="date" value={excEndDate} onChange={e => setExcEndDate(e.target.value)}
                        min={excStartDate || new Date().toISOString().slice(0,10)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                    </div>
                  )}

                  {/* Motivo */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Motivo (opcional)</label>
                    <input type="text" value={excReason} onChange={e => setExcReason(e.target.value)}
                      placeholder="Ej: Cita médica, vacaciones familiares..."
                      maxLength={120}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>

                  {excError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
                      ⚠️ {excError}
                    </div>
                  )}

                  <button onClick={saveException} disabled={excSaving}
                    style={{ width: '100%', padding: '13px 0', background: excSaving ? '#9ca3af' : 'linear-gradient(135deg,#1e40af,#3b82f6)',
                      color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      cursor: excSaving ? 'not-allowed' : 'pointer', minHeight: 48 }}>
                    {excSaving ? '⏳ Guardando...' : '💾 Guardar excepción'}
                  </button>
                </div>

                {/* Lista de excepciones activas */}
                <div style={{ background: '#fff', borderRadius: 16, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937', marginBottom: 12 }}>
                    📋 Excepciones registradas
                  </div>
                  {excLoading ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 14 }}>⏳ Cargando...</div>
                  ) : exceptions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 14 }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                      Sin excepciones registradas. Tu horario está activo normalmente.
                    </div>
                  ) : exceptions.map(exc => {
                    const typeLabel = exc.exception_type === 'day_off' ? '🚫 Pausa' : '🏖️ Vacaciones';
                    const from = new Date(exc.start_datetime).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
                    const to   = new Date(exc.end_datetime).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
                    const isActive = new Date(exc.end_datetime) > new Date();
                    return (
                      <div key={exc.id} style={{ background: isActive ? '#f0fdf4' : '#f9fafb', border: `1px solid ${isActive ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#1f2937', marginBottom: 4 }}>{typeLabel}</div>
                          <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
                            {from} → {to}
                            {exc.reason && <div style={{ marginTop: 2, fontStyle: 'italic' }}>"{exc.reason}"</div>}
                          </div>
                        </div>
                        {isActive && (
                          <button onClick={() => deleteException(exc.id)}
                            style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: '#dc2626', fontWeight: 700, cursor: 'pointer', flexShrink: 0, minHeight: 36 }}>
                            🗑️
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── SUB-TAB HORARIO PERMANENTE ── */}
            {excTab === 'horario' && (
              <div style={{ background: '#fff', borderRadius: 16, padding: '18px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1f2937', marginBottom: 6 }}>🕐 Cambiar horario de trabajo</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 1.5 }}>
                  Este cambio afecta tu disponibilidad permanente. El sistema de asignación usará este horario para enviarte servicios.
                </div>

                {/* Días de la semana */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 8 }}>Días de trabajo</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {['lunes','martes','miércoles','jueves','viernes','sábado','domingo'].map(day => {
                      const active = newWorkDays.includes(day);
                      return (
                        <button key={day} onClick={() => setNewWorkDays(prev => active ? prev.filter(d => d !== day) : [...prev, day])}
                          style={{ padding: '8px 14px', borderRadius: 20, border: `2px solid ${active ? '#3b82f6' : '#e5e7eb'}`,
                            background: active ? '#eff6ff' : '#f9fafb',
                            color: active ? '#1e40af' : '#6b7280',
                            fontWeight: 700, fontSize: 13, cursor: 'pointer',
                            textTransform: 'capitalize', minHeight: 38 }}>
                          {day.slice(0,3).toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Horas */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Inicio (mín. 6:00)</label>
                    <input type="time" value={newWorkStart} min="06:00" max="20:00"
                      onChange={e => setNewWorkStart(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 6 }}>Cierre (máx. 21:00)</label>
                    <input type="time" value={newWorkEnd} min="07:00" max="21:00"
                      onChange={e => setNewWorkEnd(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' }} />
                  </div>
                </div>

                {/* Horario actual del perfil */}
                {profile?.work_days && (
                  <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#065f46' }}>
                    <strong>Horario actual:</strong>{' '}
                    {(profile.work_days || []).join(', ')} · {profile.work_start?.slice(0,5)} – {profile.work_end?.slice(0,5)} hrs
                  </div>
                )}

                {scheduleError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#dc2626' }}>
                    ⚠️ {scheduleError}
                  </div>
                )}

                <button onClick={saveScheduleChange} disabled={savingSchedule}
                  style={{ width: '100%', padding: '13px 0', background: savingSchedule ? '#9ca3af' : 'linear-gradient(135deg,#059669,#10b981)',
                    color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
                    cursor: savingSchedule ? 'not-allowed' : 'pointer', minHeight: 48 }}>
                  {savingSchedule ? '⏳ Guardando...' : '💾 Guardar horario permanente'}
                </button>
              </div>
            )}

            {/* ── SUB-TAB MI ZONA ── */}
            {excTab === 'zona' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Zona actual */}
                <div style={{ background: '#f0fdf4', borderRadius: 14, padding: '14px 16px', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#065f46', marginBottom: 8 }}>📍 Tu zona actual</div>
                  {profile?.base_address ? (
                    <div style={{ fontSize: 13, color: '#374151' }}>
                      <div>{profile.base_address}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>Radio de cobertura: {profile?.coverage_radius || '—'} km</div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#9ca3af' }}>Sin zona configurada</div>
                  )}
                </div>

                {/* Solicitud pendiente activa */}
                {zoneRequest && (
                  <div style={{ background: '#fffbeb', borderRadius: 14, padding: '14px 16px', border: '1px solid #fde68a' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>⏳ Solicitud pendiente</div>
                    <div style={{ fontSize: 12, color: '#78350f' }}>
                      <div>Nueva dirección: {zoneRequest.new_address}</div>
                      <div style={{ marginTop: 3 }}>Radio solicitado: {zoneRequest.new_radius} km</div>
                      <div style={{ marginTop: 3 }}>Motivo: {{
                        cambio_domicilio: 'Cambio de domicilio',
                        ampliar_zona: 'Ampliar zona de cobertura',
                        reducir_zona: 'Reducir zona de cobertura',
                        otro: 'Otro motivo'
                      }[zoneRequest.reason_type]}</div>
                      {zoneRequest.reason_detail && <div style={{ marginTop: 3, fontStyle: 'italic' }}>"{zoneRequest.reason_detail}"</div>}
                    </div>
                    <div style={{ fontSize: 11, color: '#d97706', marginTop: 8 }}>
                      El administrador revisará tu solicitud pronto.
                    </div>
                  </div>
                )}

                {/* Formulario nueva solicitud */}
                {!zoneRequest && (
                  <div style={{ background: '#fff', borderRadius: 14, padding: '18px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#1f2937', marginBottom: 4 }}>📝 Solicitar cambio de zona</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
                      Si necesitas cambiar tu zona de operación, envía una solicitud. El administrador la revisará y te notificará por WhatsApp.
                    </div>

                    {/* Motivo */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>Motivo del cambio</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { v: 'cambio_domicilio', label: '🏠 Cambio de domicilio' },
                          { v: 'ampliar_zona',     label: '📈 Ampliar zona' },
                          { v: 'reducir_zona',     label: '📉 Reducir zona' },
                          { v: 'otro',             label: '💬 Otro motivo' },
                        ].map(opt => (
                          <button key={opt.v} onClick={() => setZoneForm(p => ({ ...p, reason_type: opt.v }))}
                            style={{ padding: '10px 8px', borderRadius: 10, border: `2px solid ${zoneForm.reason_type === opt.v ? '#3b82f6' : '#e5e7eb'}`,
                              background: zoneForm.reason_type === opt.v ? '#eff6ff' : '#fff',
                              color: zoneForm.reason_type === opt.v ? '#1e40af' : '#374151',
                              fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center', minHeight: 44 }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Nueva dirección */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Nueva dirección base</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input
                          value={zoneForm.new_address}
                          onChange={e => setZoneForm(p => ({ ...p, new_address: e.target.value, new_lat: null, new_lng: null }))}
                          placeholder="Ej: Colonia Roma Norte, CDMX"
                          style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit' }}
                        />
                        <button onClick={geocodeZoneAddress}
                          style={{ padding: '10px 12px', borderRadius: 10, background: '#3b82f6', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          🔍 Verificar
                        </button>
                      </div>
                      {zoneForm.new_lat && zoneForm.new_lng && (
                        <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '6px 10px', marginTop: 6, fontSize: 12, color: '#065f46' }}>
                          ✅ Dirección verificada: {zoneForm.new_lat.toFixed(4)}, {zoneForm.new_lng.toFixed(4)}
                        </div>
                      )}
                      {zoneMapUrl && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>🗺️ Tu nueva zona de operación</div>
                          <div style={{ borderRadius: 12, overflow: 'hidden', border: '1.5px solid #bfdbfe', height: 200 }}>
                            <iframe src={zoneMapUrl} width="100%" height="200" frameBorder="0" scrolling="no" title="Mapa nueva zona" style={{ display: 'block', border: 'none' }} />
                          </div>
                          <p style={{ fontSize: 11, color: '#9ca3af', margin: '6px 0 0' }}>
                            📍 Zona base · {zoneForm.new_lat?.toFixed(4)}, {zoneForm.new_lng?.toFixed(4)} · Radio: {zoneForm.new_radius} km
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Radio de cobertura */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                        Radio de cobertura solicitado: <strong style={{ color: '#1e40af' }}>{zoneForm.new_radius} km</strong>
                      </label>
                      <input type="range" min="1" max="20" step="1" value={zoneForm.new_radius}
                        onChange={e => setZoneForm(p => ({ ...p, new_radius: e.target.value }))}
                        style={{ width: '100%', accentColor: '#3b82f6' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        <span>1 km</span><span>10 km</span><span>20 km</span>
                      </div>
                    </div>

                    {/* Explicación adicional */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
                        Explicación adicional <span style={{ fontWeight: 400, color: '#9ca3af' }}>(opcional)</span>
                      </label>
                      <textarea
                        value={zoneForm.reason_detail}
                        onChange={e => setZoneForm(p => ({ ...p, reason_detail: e.target.value }))}
                        placeholder="Explica brevemente el motivo de tu solicitud..."
                        style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', resize: 'vertical', minHeight: 80, boxSizing: 'border-box' }}
                      />
                    </div>

                    {zoneError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#dc2626', fontSize: 12 }}>⚠️ {zoneError}</div>}
                    {zoneSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginBottom: 10, color: '#065f46', fontSize: 12 }}>{zoneSuccess}</div>}

                    <button onClick={submitZoneRequest} disabled={savingZone || !zoneForm.new_address.trim() || !zoneForm.new_lat}
                      style={{ width: '100%', padding: '13px 0', background: savingZone || !zoneForm.new_address.trim() || !zoneForm.new_lat ? '#9ca3af' : 'linear-gradient(135deg,#1e40af,#3b82f6)',
                        color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
                        cursor: savingZone || !zoneForm.new_address.trim() || !zoneForm.new_lat ? 'not-allowed' : 'pointer', minHeight: 48 }}>
                      {savingZone ? '⏳ Enviando...' : '📤 Enviar solicitud de cambio de zona'}
                    </button>
                  </div>
                )}

              </div>
            )}

          </div>
        )}

    </>
  )
}
