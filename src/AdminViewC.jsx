// AdminViewC.jsx — Shell principal
// Contiene: Stats cards, navegación de tabs, Tab Catálogo
// Importa AdminViewA (Reservaciones) y AdminViewB (Operadores)

import React, { useState, useEffect } from 'react';
import {
  Plus, ToggleLeft, ToggleRight, Save, CheckSquare, AlertTriangle, Star
} from 'lucide-react';
import { supabase } from './lib/supabase';
import AdminAcademia from './AdminAcademia';
import { sendWhatsApp } from './lib/whatsapp';
import AdminViewA from './AdminViewA';
import MessagingInbox from './MessagingInbox';
import AdminPayments from './AdminPayments';
import AdminViewB from './AdminViewB';

const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const EMOJI_OPTIONS = ['🚿','🪣','✨','💎','🏆','🚗','🧽','💧','🛻','🚙','⚡','🔧','🪟','🧴','🫧'];

const emptyService = {
  name: '', description: '', icon: '🚿', color: '#3b82f6',
  price_sedan: '', price_suv: '', price_truck: '', price_van: '',
  duration_min: '', duration_sedan: '', duration_suv: '', duration_pickup: '', duration_van: '',
  supplies_notes: '', is_active: true, sort_order: 99
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

// ── Componente de configuración paramétrica de membresías ─────────────────
const MembresiaConfig = ({ isMobile }) => {
  const [config, setConfig]   = useState(null);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState(null);
  const [success, setSuccess] = useState('');
  const [error, setError]     = useState('');

  const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  useEffect(() => { fetchConfig(); }, []);

  const fetchConfig = async () => {
    try {
      let token = supabaseAnonKey;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || supabaseAnonKey; }
      } catch {}
      const res = await fetch(`${supabaseUrl}/rest/v1/membership_config?select=*&limit=1`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseAnonKey },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (!rows || rows.length === 0) throw new Error('Sin configuración en DB');
      const data = rows[0];
      setConfig(data);
      setForm({
        ...data,
        // Detectar si hay promo activa al cargar
        operator_promo_active: !!data.operator_promo_price,
        client_promo_active:   !!data.client_promo_price,
        // WhatsApp: extraer solo el número sin el prefijo 'whatsapp:+52'
        whatsapp_number: (data.whatsapp_from || 'whatsapp:+5215539377258')
          .replace('whatsapp:+52', '').replace('whatsapp:+', '').replace('whatsapp:', ''),
      });
    } catch (err) { setError('Error cargando configuración: ' + err.message); }
  };

  const saveConfig = async () => {
    if (!config?.id) { setError('Configuración no cargada, recarga la página.'); return; }
    setSaving(true); setSuccess(''); setError('');
    try {
      let token = supabaseAnonKey;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || supabaseAnonKey; }
      } catch {}
      const body = {
        // Operadores
        operator_price:          parseFloat(form.operator_price)       || 200,
        operator_duration_days:  parseInt(form.operator_duration_days)  || 30,
        operator_enabled:        form.operator_enabled,
        operator_trial_days:     parseInt(form.operator_trial_days)     || 0,
        operator_promo_price:    form.operator_promo_active ? (parseFloat(form.operator_promo_price) || null) : null,
        operator_promo_days:     form.operator_promo_active ? (parseInt(form.operator_promo_days) || null)    : null,
        operator_promo_label:    form.operator_promo_active ? (form.operator_promo_label || null)             : null,
        // Clientes
        client_price:            parseFloat(form.client_price)          || 30,
        client_duration_days:    parseInt(form.client_duration_days)    || 30,
        client_enabled:          form.client_enabled,
        client_trial_days:       parseInt(form.client_trial_days)       || 0,
        client_promo_price:      form.client_promo_active ? (parseFloat(form.client_promo_price) || null)    : null,
        client_promo_days:       form.client_promo_active ? (parseInt(form.client_promo_days) || null)       : null,
        client_promo_label:      form.client_promo_active ? (form.client_promo_label || null)                : null,
        // General
        guarantee_services:      parseInt(form.guarantee_services)      || 5,
        // Comisiones por nivel
        commission_enabled:      form.commission_enabled ?? true,
        commission_pct_base:     parseFloat(form.commission_pct_base)    || 5,
        commission_pct_pro:      parseFloat(form.commission_pct_pro)     || 4,
        commission_pct_proplus:  parseFloat(form.commission_pct_proplus) || 3,
        commission_pct_elite:    parseFloat(form.commission_pct_elite)   || 2,
        updated_at:              new Date().toISOString(),
        // WhatsApp — guardar número completo en formato whatsapp:+52XXXXXXXXXX
        whatsapp_from: form.whatsapp_number
          ? 'whatsapp:+52' + form.whatsapp_number.replace(/\D/g, '').slice(-10)
          : 'whatsapp:+5215539377258',
      };
      const res = await fetch(`${supabaseUrl}/rest/v1/membership_config?id=eq.${config.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': supabaseAnonKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfig({ ...form });
      setSuccess('Configuración guardada correctamente.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  if (!form) return <div style={{ padding: 48, textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>;

  const inp  = { padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 15, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 44 };
  const lbl  = { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' };
  const grid2 = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 };
  const grid3 = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 };

  // Precio efectivo (promo si activa, normal si no)
  const opEffective  = form.operator_promo_active && form.operator_promo_price ? form.operator_promo_price : form.operator_price;
  const clEffective  = form.client_promo_active   && form.client_promo_price   ? form.client_promo_price   : form.client_price;

  return (
    <div style={{ marginTop: 16, display: 'grid', gap: 20 }}>

      {/* ── OPERADORES ── */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>👷 Membresía Operadores</h2>
            <p style={{ color: '#bfdbfe', fontSize: 12, margin: '2px 0 0' }}>
              Precio efectivo: <strong>${opEffective} MXN/mes</strong>
              {form.operator_trial_days > 0 && <span> · {form.operator_trial_days} días gratis</span>}
            </p>
          </div>
          <button onClick={() => setForm(p => ({ ...p, operator_enabled: !p.operator_enabled }))}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: form.operator_enabled ? '#10b981' : 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 36 }}>
            {form.operator_enabled ? '✅ Habilitado' : '○ Deshabilitado'}
          </button>
        </div>
        <div style={{ padding: isMobile ? '14px' : '18px 22px', display: 'grid', gap: 14 }}>
          {/* Precio y duración base */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Precio base</div>
            <div style={grid3}>
              <div><label style={lbl}>Precio mensual (MXN)</label><input type="number" min="0" value={form.operator_price} onChange={e => setForm(p => ({ ...p, operator_price: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Duración (días)</label><input type="number" min="1" value={form.operator_duration_days} onChange={e => setForm(p => ({ ...p, operator_duration_days: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Servicios garantizados</label><input type="number" min="0" value={form.guarantee_services} onChange={e => setForm(p => ({ ...p, guarantee_services: e.target.value }))} style={inp} /></div>
            </div>
          </div>
          {/* Período de prueba */}
          <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 14px', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>🎁 Período de prueba gratuito</div>
            <div style={{ maxWidth: 220 }}>
              <label style={lbl}>Días gratis (0 = sin prueba)</label>
              <input type="number" min="0" max="90" value={form.operator_trial_days || 0} onChange={e => setForm(p => ({ ...p, operator_trial_days: e.target.value }))} style={inp} />
            </div>
            {parseInt(form.operator_trial_days) > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#059669' }}>✅ Los nuevos operadores tendrán {form.operator_trial_days} días gratis antes del primer cobro.</div>
            )}
          </div>
          {/* Promoción */}
          <div style={{ background: '#fffbeb', borderRadius: 10, padding: '12px 14px', border: '1px solid #fde68a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5 }}>🏷️ Precio promocional</div>
              <button onClick={() => setForm(p => ({ ...p, operator_promo_active: !p.operator_promo_active }))}
                style={{ padding: '4px 12px', borderRadius: 8, border: 'none', background: form.operator_promo_active ? '#f59e0b' : '#e5e7eb', color: form.operator_promo_active ? '#fff' : '#6b7280', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {form.operator_promo_active ? '✅ Activa' : '○ Inactiva'}
              </button>
            </div>
            {form.operator_promo_active && (
              <div style={grid3}>
                <div><label style={lbl}>Precio promo (MXN)</label><input type="number" min="0" value={form.operator_promo_price || ''} onChange={e => setForm(p => ({ ...p, operator_promo_price: e.target.value }))} placeholder="ej. 150" style={inp} /></div>
                <div><label style={lbl}>Días de la promo</label><input type="number" min="1" value={form.operator_promo_days || ''} onChange={e => setForm(p => ({ ...p, operator_promo_days: e.target.value }))} placeholder="ej. 30" style={inp} /></div>
                <div><label style={lbl}>Etiqueta (ej. "Lanzamiento")</label><input type="text" value={form.operator_promo_label || ''} onChange={e => setForm(p => ({ ...p, operator_promo_label: e.target.value }))} placeholder="Precio especial" style={inp} /></div>
              </div>
            )}
            {form.operator_promo_active && form.operator_promo_price && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#92400e' }}>
                💡 Los operadores verán <strong>${form.operator_promo_price} MXN/mes</strong> en lugar de ${form.operator_price} MXN.
                {form.operator_promo_label && <span> Etiqueta: "{form.operator_promo_label}"</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CLIENTES ── */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>⭐ Membresía Premium Clientes</h2>
            <p style={{ color: '#ede9fe', fontSize: 12, margin: '2px 0 0' }}>
              Precio efectivo: <strong>${clEffective} MXN/mes</strong>
              {form.client_trial_days > 0 && <span> · {form.client_trial_days} días gratis</span>}
            </p>
          </div>
          <button onClick={() => setForm(p => ({ ...p, client_enabled: !p.client_enabled }))}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: form.client_enabled ? '#10b981' : 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 36 }}>
            {form.client_enabled ? '✅ Habilitado' : '○ Deshabilitado'}
          </button>
        </div>
        <div style={{ padding: isMobile ? '14px' : '18px 22px', display: 'grid', gap: 14 }}>
          {/* Precio base */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Precio base</div>
            <div style={grid2}>
              <div><label style={lbl}>Precio mensual (MXN)</label><input type="number" min="0" value={form.client_price} onChange={e => setForm(p => ({ ...p, client_price: e.target.value }))} style={inp} /></div>
              <div><label style={lbl}>Duración (días)</label><input type="number" min="1" value={form.client_duration_days} onChange={e => setForm(p => ({ ...p, client_duration_days: e.target.value }))} style={inp} /></div>
            </div>
          </div>
          {/* Período de prueba */}
          <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 14px', border: '1px solid #bbf7d0' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>🎁 Período de prueba gratuito</div>
            <div style={{ maxWidth: 220 }}>
              <label style={lbl}>Días gratis (0 = sin prueba)</label>
              <input type="number" min="0" max="90" value={form.client_trial_days || 0} onChange={e => setForm(p => ({ ...p, client_trial_days: e.target.value }))} style={inp} />
            </div>
            {parseInt(form.client_trial_days) > 0 && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#059669' }}>✅ Los nuevos clientes tendrán {form.client_trial_days} días gratis antes del primer cobro.</div>
            )}
          </div>
          {/* Promoción */}
          <div style={{ background: '#faf5ff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e9d5ff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b21a8', textTransform: 'uppercase', letterSpacing: 0.5 }}>🏷️ Precio promocional</div>
              <button onClick={() => setForm(p => ({ ...p, client_promo_active: !p.client_promo_active }))}
                style={{ padding: '4px 12px', borderRadius: 8, border: 'none', background: form.client_promo_active ? '#7c3aed' : '#e5e7eb', color: form.client_promo_active ? '#fff' : '#6b7280', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                {form.client_promo_active ? '✅ Activa' : '○ Inactiva'}
              </button>
            </div>
            {form.client_promo_active && (
              <div style={grid3}>
                <div><label style={lbl}>Precio promo (MXN)</label><input type="number" min="0" value={form.client_promo_price || ''} onChange={e => setForm(p => ({ ...p, client_promo_price: e.target.value }))} placeholder="ej. 19" style={inp} /></div>
                <div><label style={lbl}>Días de la promo</label><input type="number" min="1" value={form.client_promo_days || ''} onChange={e => setForm(p => ({ ...p, client_promo_days: e.target.value }))} placeholder="ej. 30" style={inp} /></div>
                <div><label style={lbl}>Etiqueta (ej. "Intro")</label><input type="text" value={form.client_promo_label || ''} onChange={e => setForm(p => ({ ...p, client_promo_label: e.target.value }))} placeholder="Precio especial" style={inp} /></div>
              </div>
            )}
            {form.client_promo_active && form.client_promo_price && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#6b21a8' }}>
                💡 Los clientes verán <strong>${form.client_promo_price} MXN/mes</strong> en lugar de ${form.client_price} MXN.
                {form.client_promo_label && <span> Etiqueta: "{form.client_promo_label}"</span>}
              </div>
            )}
          </div>
          {/* Beneficios */}
          <div style={{ background: '#f5f3ff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e9d5ff' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>Beneficios Premium</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>⭐ Prioridad en asignación · 📅 Horarios reservados · 🎯 Operador preferente · ❌ Cancelación flexible</div>
          </div>
        </div>
      </div>

      {/* ── COMISIONES POR NIVEL ── */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg,#065f46,#059669)', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>💰 Comisión por servicio</h2>
            <p style={{ color: '#d1fae5', fontSize: 12, margin: '2px 0 0' }}>% sobre total_price · se suma a la membresía al renovar</p>
          </div>
          <button onClick={() => setForm(p => ({ ...p, commission_enabled: !p.commission_enabled }))}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: form.commission_enabled ? '#10b981' : 'rgba(255,255,255,0.2)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 36 }}>
            {form.commission_enabled ? '✅ Activa' : '○ Inactiva'}
          </button>
        </div>
        <div style={{ padding: isMobile ? '14px' : '18px 22px', display: 'grid', gap: 14 }}>
          <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', border: '1px solid #bbf7d0', fontSize: 12, color: '#065f46' }}>
            📋 El operador ve el desglose en su panel: ingresos del ciclo, comisión según su nivel y total a depositar en su fecha de renovación.
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>% de comisión por nivel</div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 12 }}>
            {[
              { key: 'commission_pct_base',    label: 'Operador', range: '0–3.9 ⭐', dot: '#9ca3af', border: '#e5e7eb', bg: '#f9fafb', tc: '#374151' },
              { key: 'commission_pct_pro',     label: 'Pro',      range: '4.0–4.4 ⭐', dot: '#60a5fa', border: '#bfdbfe', bg: '#eff6ff', tc: '#1e40af' },
              { key: 'commission_pct_proplus', label: 'Pro+',     range: '4.5–4.7 ⭐', dot: '#a78bfa', border: '#ddd6fe', bg: '#f5f3ff', tc: '#5b21b6' },
              { key: 'commission_pct_elite',   label: 'Elite',    range: '4.8–5.0 ⭐', dot: '#fbbf24', border: '#fde68a', bg: '#fffbeb', tc: '#92400e' },
            ].map(({ key, label, range, dot, border, bg, tc }) => (
              <div key={key} style={{ background: bg, borderRadius: 10, padding: '12px 14px', border: `1.5px solid ${border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: tc }}>{label}</span>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8 }}>{range}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="number" min="0" max="100" step="0.5"
                    value={form[key] ?? 5}
                    onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
                    style={{ width: '60px', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${border}`, fontSize: 15, fontWeight: 700, color: tc, textAlign: 'center', fontFamily: 'inherit' }} />
                  <span style={{ fontSize: 13, color: '#6b7280' }}>%</span>
                </div>
              </div>
            ))}
          </div>
          {form.commission_enabled && (
            <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Vista previa · ejemplo 30 servicios de $199</div>
              {[
                { nivel: 'Operador', key: 'commission_pct_base',    dot: '#9ca3af', disc: 0 },
                { nivel: 'Pro',      key: 'commission_pct_pro',      dot: '#60a5fa', disc: 0.10 },
                { nivel: 'Pro+',     key: 'commission_pct_proplus',  dot: '#a78bfa', disc: 0.20 },
                { nivel: 'Elite',    key: 'commission_pct_elite',    dot: '#fbbf24', disc: 0.35 },
              ].map(({ nivel, key, dot, disc }) => {
                const pct     = parseFloat(form[key]) || 0;
                const ingreso = 30 * 199;
                const com     = Math.round(ingreso * pct / 100);
                const mem     = Math.round((parseFloat(form.operator_price) || 200) * (1 - disc));
                return (
                  <div key={nivel} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
                      <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{nivel}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>{pct}%</span>
                    </div>
                    <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#6b7280' }}>
                      <span>Com. <strong style={{ color: '#dc2626' }}>${com}</strong></span>
                      <span>Mem. <strong>${mem}</strong></span>
                      <span>Total <strong style={{ color: '#1e40af' }}>${com + mem}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── WHATSAPP ── */}
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ background: 'linear-gradient(135deg,#065f46,#25d366)', padding: '14px 20px' }}>
          <h2 style={{ color: '#fff', fontWeight: 700, fontSize: 15, margin: 0 }}>📱 Número de WhatsApp saliente</h2>
          <p style={{ color: '#d1fae5', fontSize: 12, margin: '2px 0 0' }}>Número registrado en Twilio desde donde salen todas las notificaciones</p>
        </div>
        <div style={{ padding: isMobile ? '14px' : '18px 22px', display: 'grid', gap: 14 }}>
          <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '10px 14px', border: '1px solid #bbf7d0', fontSize: 12, color: '#065f46' }}>
            📋 El número debe estar registrado y aprobado en Twilio como WhatsApp Sender. Solo ingresa los 10 dígitos sin código de país.
          </div>
          <div>
            <label style={lbl}>Número de WhatsApp (10 dígitos)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ padding: '10px 12px', background: '#f3f4f6', borderRadius: '8px 0 0 8px', border: '1.5px solid #e5e7eb', borderRight: 'none', fontSize: 14, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>+52</span>
              <input
                type="tel" maxLength={10}
                value={form.whatsapp_number || ''}
                onChange={e => setForm(p => ({ ...p, whatsapp_number: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                placeholder="5539377258"
                style={{ ...inp, borderRadius: '0 8px 8px 0', borderLeft: 'none' }}
              />
            </div>
            {form.whatsapp_number?.length === 10 && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#059669' }}>
                ✅ Número configurado: <strong>+52{form.whatsapp_number}</strong> → se guardará como <strong>whatsapp:+52{form.whatsapp_number}</strong>
              </div>
            )}
            {form.whatsapp_number && form.whatsapp_number.length !== 10 && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>
                ⚠️ El número debe tener exactamente 10 dígitos
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Botón guardar */}
      {error   && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 14 }}>⚠️ {error}</div>}
      {success && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', color: '#166534', fontSize: 14 }}>✅ {success}</div>}
      <button onClick={saveConfig} disabled={saving}
        style={{ padding: '14px 28px', background: saving ? '#9ca3af' : '#1e40af', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer', minHeight: 52, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
        💾 {saving ? 'Guardando...' : 'Guardar Configuración'}
      </button>
    </div>
  );
};

const AdminViewC = () => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab]   = useState('general');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [bookings, setBookings]     = useState([]);
  const [operators, setOperators]   = useState([]);
  const [incidents, setIncidents]   = useState([]);
  const [pendingOperators, setPendingOperators] = useState([]);
  const [unattendedBookings, setUnattendedBookings] = useState([]);
  const [loading, setLoading]       = useState(true);

  const [stats, setStats] = useState({
    total: 0, pending: 0, active: 0, completed: 0, cancelled: 0, revenue: 0, completionRate: 0
  });

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const [services, setServices]               = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [serviceModal, setServiceModal]       = useState(false);
  const [serviceForm, setServiceForm]         = useState(emptyService);
  const [editingService, setEditingService]   = useState(null);
  const [savingService, setSavingService]     = useState(false);
  const [serviceError, setServiceError]       = useState('');
  const [serviceSuccess, setServiceSuccess]   = useState('');
  const [checklistItems, setChecklistItems]   = useState([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [savingChecklist, setSavingChecklist] = useState(false);

  useEffect(() => {
    fetchData();
    fetchUnattendedBookings();
    fetchUnreadMessages();
    const channel = supabase
      .channel('admin-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        fetchData();
        fetchUnattendedBookings();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (activeTab === 'catalog') fetchServices();
    if (activeTab === 'membresias') fetchPromotions();
    if (activeTab === 'promociones') fetchPromotions();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'operators') return;
    const fixOverflow = () => {
      document.querySelectorAll('*').forEach(el => {
        if (el.offsetWidth > window.innerWidth) {
          el.style.maxWidth = '100%';
          el.style.overflowX = 'hidden';
        }
      });
    };
    const t1 = setTimeout(fixOverflow, 100);
    const t2 = setTimeout(fixOverflow, 500);
    const t3 = setTimeout(fixOverflow, 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [activeTab]);

  // ── fetchData con fetch directo para evitar lock de Supabase ─────────────
  const fetchData = async () => {
    try {
      setLoading(true);
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY;
        }
      } catch {}

      const headers = {
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      };

      const [bRes, oRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/bookings?select=*,customer:client_id(full_name,phone),operator:operator_id(full_name,phone)&order=created_at.desc`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.operador&select=*`, { headers }),
      ]);

      const bookingsData  = bRes.ok ? await bRes.json() : [];
      const operatorsData = oRes.ok ? await oRes.json() : [];

      setBookings(bookingsData || []);
      setOperators(operatorsData || []);

      const total     = (bookingsData || []).length;
      const completed = (bookingsData || []).filter(b => b.status === 'finalizado').length;
      const cancelled = (bookingsData || []).filter(b => b.status === 'cancelado').length;
      const revenue   = (bookingsData || []).filter(b => b.status === 'finalizado').reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
      setStats({
        total, completed, cancelled,
        pending:        (bookingsData || []).filter(b => b.status === 'pendiente').length,
        active:         (bookingsData || []).filter(b => ['confirmado','en_camino','en_proceso'].includes(b.status)).length,
        revenue,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
      });
    } catch (err) { console.error('fetchData:', err); }
    finally { setLoading(false); }
  };

  const fetchUnattendedBookings = async () => {
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY;
        }
      } catch {}
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/bookings?status=eq.pendiente&operator_id=is.null&current_ronda=eq.4&select=*,customer:client_id(full_name,phone)&order=created_at.asc`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      );
      setUnattendedBookings(res.ok ? await res.json() : []);
    } catch (err) { console.error('fetchUnattendedBookings:', err); }
  };

  const fetchUnreadMessages = async () => {
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) {
          const parsed = JSON.parse(stored);
          token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY;
        }
      } catch {}
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/messages?direction=eq.inbound&read_at=is.null&select=id`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      );
      if (res.ok) {
        const data = await res.json();
        setUnreadMessages(Array.isArray(data) ? data.length : 0);
      }
    } catch (err) { console.error('fetchUnreadMessages:', err); }
  };

  // ── Catálogo ──────────────────────────────────────────────────────────────
  const fetchServices = async () => {
    setLoadingServices(true);
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      const res = await fetch(`${SUPABASE_URL}/rest/v1/services?select=*&order=sort_order.asc`, {
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
      });
      const data = res.ok ? await res.json() : [];
      setServices(data || []);
    } catch (err) { console.error('fetchServices:', err); }
    finally { setLoadingServices(false); }
  };

  const loadChecklist = async (serviceId) => {
    let token2 = SUPABASE_ANON_KEY;
    try { const s = localStorage.getItem('mazclean-auth'); if (s) { const p = JSON.parse(s); token2 = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY; } } catch {}
    const clRes = await fetch(`${SUPABASE_URL}/rest/v1/service_checklist?service_id=eq.${serviceId}&order=sort_order.asc&select=*`, {
      headers: { 'Authorization': `Bearer ${token2}`, 'apikey': SUPABASE_ANON_KEY },
    });
    const data = clRes.ok ? await clRes.json() : [];
    setChecklistItems(data || []);
  };

  const addChecklistItem = async (serviceId) => {
    if (!newChecklistItem.trim()) return;
    setSavingChecklist(true);
    let tokenCl = SUPABASE_ANON_KEY;
    try { const s = localStorage.getItem('mazclean-auth'); if (s) { const p = JSON.parse(s); tokenCl = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY; } } catch {}
    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/service_checklist`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${tokenCl}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify({ service_id: serviceId, item: newChecklistItem.trim(), sort_order: checklistItems.length + 1 }),
    });
    const insData = insRes.ok ? await insRes.json() : [];
    const data = insData[0] || null; const error = insRes.ok ? null : { message: `HTTP ${insRes.status}` };
    if (!error) { setChecklistItems(prev => [...prev, data]); setNewChecklistItem(''); }
    setSavingChecklist(false);
  };

  const deleteChecklistItem = async (itemId) => {
    let tokenDel = SUPABASE_ANON_KEY;
    try { const s = localStorage.getItem('mazclean-auth'); if (s) { const p = JSON.parse(s); tokenDel = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY; } } catch {}
    await fetch(`${SUPABASE_URL}/rest/v1/service_checklist?id=eq.${itemId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenDel}`, 'apikey': SUPABASE_ANON_KEY },
    });
    setChecklistItems(prev => prev.filter(i => i.id !== itemId));
  };

  const openNewService = () => {
    setEditingService(null); setServiceForm(emptyService);
    setServiceError(''); setServiceSuccess(''); setChecklistItems([]);
    setServiceModal(true);
  };

  const openEditService = async (service) => {
    setEditingService(service.id);
    setServiceForm({
      name: service.name || '', description: service.description || '', icon: service.icon || '🚿', color: service.color || '#3b82f6',
      price_sedan: service.price_sedan || '', price_suv: service.price_suv || '', price_truck: service.price_truck || '', price_van: service.price_van || '',
      duration_min: service.duration_min || '', duration_sedan: service.duration_sedan || '', duration_suv: service.duration_suv || '',
      duration_pickup: service.duration_pickup || '', duration_van: service.duration_van || '',
      supplies_notes: service.supplies_notes || '', is_active: service.is_active ?? true, sort_order: service.sort_order || 99,
    });
    setServiceError(''); setServiceSuccess('');
    await loadChecklist(service.id);
    setServiceModal(true);
  };

  const saveService = async () => {
    setServiceError('');
    if (!serviceForm.name || !serviceForm.price_sedan) { setServiceError('Nombre y precio Sedán son requeridos.'); return; }
    setSavingService(true);
    try {
      // duration_min y price_truck son NOT NULL en DB — usar duration_sedan y price_suv como fallback
      const durationBase = parseInt(serviceForm.duration_sedan) || parseInt(serviceForm.duration_min) || 45;
      const payload = {
        name: serviceForm.name, description: serviceForm.description, icon: serviceForm.icon, color: serviceForm.color,
        price_sedan: parseFloat(serviceForm.price_sedan) || null,
        price_suv:   parseFloat(serviceForm.price_suv)   || parseFloat(serviceForm.price_sedan) || null,
        price_truck: parseFloat(serviceForm.price_truck) || parseFloat(serviceForm.price_suv) || parseFloat(serviceForm.price_sedan) || null,
        price_van:   parseFloat(serviceForm.price_van)   || null,
        duration_min:    durationBase,
        duration_sedan:  parseInt(serviceForm.duration_sedan)  || durationBase,
        duration_suv:    parseInt(serviceForm.duration_suv)    || durationBase,
        duration_pickup: parseInt(serviceForm.duration_pickup) || durationBase,
        duration_van:    parseInt(serviceForm.duration_van)    || durationBase,
        duration_minutes: durationBase,
        supplies_notes: serviceForm.supplies_notes || null,
        is_active: serviceForm.is_active, sort_order: parseInt(serviceForm.sort_order) || 99, updated_at: new Date().toISOString(),
      };
      if (editingService) {
        let tokenUpd = SUPABASE_ANON_KEY;
        try { const s = localStorage.getItem('mazclean-auth'); if (s) { const p = JSON.parse(s); tokenUpd = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY; } } catch {}
        const updRes = await fetch(`${SUPABASE_URL}/rest/v1/services?id=eq.${editingService}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${tokenUpd}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify(payload),
        });
        const error = updRes.ok ? null : { message: `HTTP ${updRes.status}` };
        if (error) throw error;
        setServiceSuccess('Servicio actualizado.');
      } else {
        let tokenIns = SUPABASE_ANON_KEY;
        try { const s = localStorage.getItem('mazclean-auth'); if (s) { const p = JSON.parse(s); tokenIns = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY; } } catch {}
        const insServRes = await fetch(`${SUPABASE_URL}/rest/v1/services`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${tokenIns}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ ...payload, created_at: new Date().toISOString() }),
        });
        const error = insServRes.ok ? null : { message: `HTTP ${insServRes.status}` };
        if (error) throw error;
        setServiceSuccess('Servicio creado.');
      }
      await fetchServices();
      setTimeout(() => { setServiceModal(false); setServiceSuccess(''); }, 1200);
    } catch (err) { setServiceError(err.message); }
    finally { setSavingService(false); }
  };

  const toggleServiceStatus = async (service) => {
    let tokenTog = SUPABASE_ANON_KEY;
    try { const s = localStorage.getItem('mazclean-auth'); if (s) { const p = JSON.parse(s); tokenTog = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY; } } catch {}
    const togRes = await fetch(`${SUPABASE_URL}/rest/v1/services?id=eq.${service.id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${tokenTog}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ is_active: !service.is_active, updated_at: new Date().toISOString() }),
    });
    const error = togRes.ok ? null : { message: `HTTP ${togRes.status}` };
    if (error) { alert(error.message); return; }
    setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: !s.is_active } : s));
  };

  const deleteService = async (serviceId) => {
    if (!confirm('¿Eliminar este servicio?')) return;
    let tokenDelS = SUPABASE_ANON_KEY;
    try { const s = localStorage.getItem('mazclean-auth'); if (s) { const p = JSON.parse(s); tokenDelS = p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY; } } catch {}
    const delSRes = await fetch(`${SUPABASE_URL}/rest/v1/services?id=eq.${serviceId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${tokenDelS}`, 'apikey': SUPABASE_ANON_KEY },
    });
    const error = delSRes.ok ? null : { message: `HTTP ${delSRes.status}` };
    if (error) { alert(error.message); return; }
    setServices(prev => prev.filter(s => s.id !== serviceId));
  };

  const inputStyle = { padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 16, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', color: '#1f2937', minHeight: 48 };
  const labelStyle = { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, display: 'block' };

  // ── Promociones ──────────────────────────────────────────────────────────
  const [promotions, setPromotions]           = useState([]);
  const [loadingPromos, setLoadingPromos]     = useState(false);
  const [promoModal, setPromoModal]           = useState(false);
  const [editingPromo, setEditingPromo]       = useState(null);
  const [savingPromo, setSavingPromo]         = useState(false);
  const [promoError, setPromoError]           = useState('');
  const [promoForm, setPromoForm]             = useState({
    name: '', user_type: 'operador', discount_type: 'precio_fijo',
    discount_value: '', valid_from: '', valid_until: '',
    zone_keywords: '', min_rating: '', max_rating: '',
    auto_trigger_min_operators: '', is_active: true, priority: 0,
  });

  const fetchPromotions = async () => {
    setLoadingPromos(true);
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/membership_promotions?select=*&order=priority.desc,created_at.desc`,
        { headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY } }
      );
      if (res.ok) setPromotions(await res.json());
    } catch (err) { console.error('fetchPromotions:', err); }
    finally { setLoadingPromos(false); }
  };

  const openNewPromo = () => {
    setEditingPromo(null);
    const today = new Date().toISOString().slice(0, 16);
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    setPromoForm({ name: '', user_type: 'operador', discount_type: 'precio_fijo', discount_value: '', valid_from: today, valid_until: nextMonth, zone_keywords: '', min_rating: '', max_rating: '', auto_trigger_min_operators: '', is_active: true, priority: 0 });
    setPromoError('');
    setPromoModal(true);
  };

  const openEditPromo = (promo) => {
    setEditingPromo(promo.id);
    setPromoForm({
      name: promo.name || '',
      user_type: promo.user_type || 'operador',
      discount_type: promo.discount_type || 'precio_fijo',
      discount_value: promo.discount_value || '',
      valid_from: promo.valid_from ? promo.valid_from.slice(0, 16) : '',
      valid_until: promo.valid_until ? promo.valid_until.slice(0, 16) : '',
      zone_keywords: (promo.zone_keywords || []).join(', '),
      min_rating: promo.min_rating || '',
      max_rating: promo.max_rating || '',
      auto_trigger_min_operators: promo.auto_trigger_min_operators || '',
      is_active: promo.is_active ?? true,
      priority: promo.priority || 0,
    });
    setPromoError('');
    setPromoModal(true);
  };

  const savePromo = async () => {
    if (!promoForm.name.trim()) { setPromoError('El nombre es requerido.'); return; }
    if (!promoForm.discount_value) { setPromoError('El valor del descuento es requerido.'); return; }
    if (!promoForm.valid_from || !promoForm.valid_until) { setPromoError('Las fechas son requeridas.'); return; }
    if (new Date(promoForm.valid_until) <= new Date(promoForm.valid_from)) { setPromoError('La fecha de fin debe ser posterior a la de inicio.'); return; }
    setSavingPromo(true); setPromoError('');
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      const keywords = promoForm.zone_keywords
        ? promoForm.zone_keywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
        : null;
      const body = {
        name:                       promoForm.name.trim(),
        user_type:                  promoForm.user_type,
        discount_type:              promoForm.discount_type,
        discount_value:             parseFloat(promoForm.discount_value),
        valid_from:                 new Date(promoForm.valid_from).toISOString(),
        valid_until:                new Date(promoForm.valid_until).toISOString(),
        zone_keywords:              keywords?.length ? keywords : null,
        min_rating:                 promoForm.min_rating ? parseFloat(promoForm.min_rating) : null,
        max_rating:                 promoForm.max_rating ? parseFloat(promoForm.max_rating) : null,
        auto_trigger_min_operators: promoForm.auto_trigger_min_operators ? parseInt(promoForm.auto_trigger_min_operators) : null,
        is_active:                  promoForm.is_active,
        priority:                   parseInt(promoForm.priority) || 0,
        updated_at:                 new Date().toISOString(),
      };
      const url = editingPromo
        ? `${SUPABASE_URL}/rest/v1/membership_promotions?id=eq.${editingPromo}`
        : `${SUPABASE_URL}/rest/v1/membership_promotions`;
      const method = editingPromo ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchPromotions();
      setPromoModal(false);
    } catch (err) { setPromoError(err.message); }
    finally { setSavingPromo(false); }
  };

  const deletePromo = async (id) => {
    if (!confirm('¿Eliminar esta promoción?')) return;
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      await fetch(`${SUPABASE_URL}/rest/v1/membership_promotions?id=eq.${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY },
      });
      setPromotions(prev => prev.filter(p => p.id !== id));
    } catch (err) { alert('Error: ' + err.message); }
  };

  const togglePromoActive = async (promo) => {
    try {
      let token = SUPABASE_ANON_KEY;
      try {
        const stored = localStorage.getItem('mazclean-auth');
        if (stored) { const parsed = JSON.parse(stored); token = parsed?.access_token || parsed?.session?.access_token || SUPABASE_ANON_KEY; }
      } catch {}
      await fetch(`${SUPABASE_URL}/rest/v1/membership_promotions?id=eq.${promo.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ is_active: !promo.is_active, updated_at: new Date().toISOString() }),
      });
      setPromotions(prev => prev.map(p => p.id === promo.id ? { ...p, is_active: !p.is_active } : p));
    } catch (err) { alert('Error: ' + err.message); }
  };

  const membresíasActivas = operators.filter(o => o.membership_status === 'activa').length;

  const statCards = [
    { label: 'Total',        value: stats.total,                          icon: '📋', color: '#6b7280' },
    { label: 'Pendientes',   value: stats.pending,                        icon: '⏳', color: '#d97706' },
    { label: 'En Curso',     value: stats.active,                         icon: '🔵', color: '#3b82f6' },
    { label: 'Finalizados',  value: stats.completed,                      icon: '✅', color: '#10b981' },
    { label: 'Cancelados',   value: stats.cancelled,                      icon: '❌', color: '#ef4444' },
    { label: 'Ingresos',     value: `$${stats.revenue.toLocaleString()}`, icon: '💰', color: '#059669' },
    { label: '% Completado', value: `${stats.completionRate}%`,           icon: '📈', color: '#7c3aed' },
    { label: 'Membresías',   value: membresíasActivas,                    icon: '💳', color: '#0891b2' },
  ];

  const sharedProps = { bookings, setBookings, operators, setOperators, loading, isMobile, sendWhatsApp };

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', paddingBottom: 48, overflowX: 'hidden', width: '100%', maxWidth: '100vw' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: isMobile ? '20px 16px' : '28px 24px 24px', textAlign: 'center' }}>
        <h1 style={{ color: '#fff', fontSize: isMobile ? 18 : 22, fontWeight: 700, margin: '0 0 4px' }}>🛠 Dashboard de Administración</h1>
        <p style={{ color: '#bfdbfe', fontSize: 13, margin: 0 }}>Gestión integral de MazClean</p>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 12px' : '0 16px', overflowX: 'hidden', boxSizing: 'border-box' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginTop: 20, background: '#e5e7eb', padding: 4, borderRadius: 12, overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[
            { id: 'general',    label: '⚡ General' },
            { id: 'bookings',  label: `📋 Reservaciones${unattendedBookings.length > 0 ? ` 🚨${unattendedBookings.length}` : ''}` },
            { id: 'operators', label: `👷 Operadores${incidents.length > 0 || pendingOperators.length > 0 ? ` ⚠️${incidents.length + pendingOperators.length}` : ''}` },
            { id: 'mensajes',  label: `💬 Mensajes${unreadMessages > 0 ? ` 🔴${unreadMessages}` : ''}` },
            { id: 'catalog',   label: '🛎 Catálogo' },
            { id: 'membresias', label: '💳 Membresías' },
            { id: 'academia', label: '🎓 Academia' },
            { id: 'promociones', label: `🏷️ Promociones${promotions.filter(p => p.is_active && new Date(p.valid_until) > new Date()).length > 0 ? ` (${promotions.filter(p => p.is_active && new Date(p.valid_until) > new Date()).length})` : ''}` },
            { id: 'pagos', label: '🏦 Pagos' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding: isMobile ? '8px 12px' : '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: isMobile ? 12 : 14, fontWeight: 600, whiteSpace: 'nowrap', background: activeTab === tab.id ? '#fff' : 'transparent', color: activeTab === tab.id ? '#1e40af' : '#6b7280', boxShadow: activeTab === tab.id ? '0 2px 8px rgba(0,0,0,0.08)' : 'none', transition: 'all 0.2s', minHeight: 44 }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Reservaciones */}
        {activeTab === 'general' && (
          <AdminViewA
            {...sharedProps}
            unattendedBookings={unattendedBookings}
            setUnattendedBookings={setUnattendedBookings}
            fetchData={fetchData}
            fetchUnattendedBookings={fetchUnattendedBookings}
            showDashboardOnly={true}
          />
        )}

        {activeTab === 'bookings' && (
          <AdminViewA
            {...sharedProps}
            unattendedBookings={unattendedBookings}
            setUnattendedBookings={setUnattendedBookings}
            fetchData={fetchData}
            fetchUnattendedBookings={fetchUnattendedBookings}
            showDashboardOnly={false}
          />
        )}

        {/* Tab: Operadores */}
        {activeTab === 'operators' && (
          <AdminViewB
            {...sharedProps}
            incidents={incidents}
            setIncidents={setIncidents}
            pendingOperators={pendingOperators}
            setPendingOperators={setPendingOperators}
            fetchData={fetchData}
          />
        )}

        {/* Tab: Mensajes */}
        {activeTab === 'mensajes' && (
          <div style={{ marginTop: 16 }}>
            <MessagingInbox
              token={(() => {
                try {
                  const stored = localStorage.getItem('mazclean-auth');
                  if (stored) {
                    const p = JSON.parse(stored);
                    return p?.access_token || p?.session?.access_token || SUPABASE_ANON_KEY;
                  }
                } catch {}
                return SUPABASE_ANON_KEY;
              })()}
              isMobile={isMobile}
            />
          </div>
        )}

        {/* Tab: Catálogo */}
        {activeTab === 'catalog' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', margin: 0 }}>🛎 Catálogo de Servicios</h2>
                <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0' }}>Administra los servicios y sus checklists</p>
              </div>
              <button onClick={openNewService} style={{ padding: '10px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 12px rgba(59,130,246,0.3)', minHeight: 44 }}>
                <Plus size={15} /> Nuevo
              </button>
            </div>
            {loadingServices ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 14 }}>Cargando servicios...</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill,minmax(320px,1fr))', gap: 14 }}>
                {services.map(service => (
                  <div key={service.id} style={{ background: '#fff', borderRadius: 18, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden', border: service.is_active ? '2px solid transparent' : '2px solid #e5e7eb', opacity: service.is_active ? 1 : 0.7 }}>
                    <div style={{ background: `linear-gradient(135deg, ${service.color}22, ${service.color}11)`, borderBottom: `2px solid ${service.color}33`, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 26 }}>{service.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, color: '#1f2937', fontSize: 15 }}>{service.name}</div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{service.description}</div>
                        </div>
                      </div>
                      <button onClick={() => toggleServiceStatus(service)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, minHeight: 44 }}>
                        {service.is_active ? <ToggleRight size={28} color="#10b981" /> : <ToggleLeft size={28} color="#9ca3af" />}
                      </button>
                    </div>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Precios</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                        {[{ label: '🚗', value: service.price_sedan }, { label: '🚙', value: service.price_suv }, { label: '🛻', value: service.price_truck }, { label: '🚐', value: service.price_van }].map((p, i) => (
                          <div key={i} style={{ textAlign: 'center', background: '#f9fafb', borderRadius: 8, padding: '6px 4px' }}>
                            <div style={{ fontSize: 12 }}>{p.label}</div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>${p.value || '—'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {service.supplies_notes && (
                      <div style={{ padding: '10px 16px', borderBottom: '1px solid #f3f4f6', background: '#fefce8' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>🧴 Insumos</div>
                        <div style={{ fontSize: 12, color: '#854d0e' }}>{service.supplies_notes}</div>
                      </div>
                    )}
                    <div style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
                      <button onClick={() => openEditService(service)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 }}>✏️ Editar</button>
                      <button onClick={() => deleteService(service.id)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48 }}>🗑 Eliminar</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Membresías */}
        {activeTab === 'membresias' && (
          <MembresiaConfig isMobile={isMobile} />
        )}

        {/* Tab: Academia */}
        {activeTab === 'academia' && (
          <AdminAcademia isMobile={isMobile} />
        )}

        {/* Tab: Promociones */}
        {activeTab === 'pagos' && (
          <div style={{ marginTop: 16 }}>
            <AdminPayments isMobile={isMobile} />
          </div>
        )}

        {activeTab === 'promociones' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: '#1f2937', margin: 0 }}>🏷️ Promociones de Membresía</h2>
                <p style={{ fontSize: 13, color: '#9ca3af', margin: '4px 0 0' }}>Gestiona descuentos, períodos de prueba y promos por zona o calificación</p>
              </div>
              <button onClick={openNewPromo} style={{ padding: '10px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
                <Plus size={15} /> Nueva Promo
              </button>
            </div>

            {loadingPromos ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 14 }}>Cargando promociones...</div>
            ) : promotions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: '#9ca3af', background: '#fff', borderRadius: 14, border: '2px dashed #e5e7eb' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🏷️</div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Sin promociones creadas</div>
                <div style={{ fontSize: 13 }}>Crea tu primera promoción para operadores o clientes</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {promotions.map(promo => {
                  const now = new Date();
                  const isExpired = new Date(promo.valid_until) < now;
                  const isNotStarted = new Date(promo.valid_from) > now;
                  const isRunning = promo.is_active && !isExpired && !isNotStarted;
                  const statusColor = isExpired ? '#9ca3af' : isNotStarted ? '#3b82f6' : isRunning ? '#10b981' : '#f59e0b';
                  const statusLabel = isExpired ? '⚫ Vencida' : isNotStarted ? '🕐 Programada' : isRunning ? '✅ Activa' : '⏸ Pausada';
                  const discountLabel = promo.discount_type === 'precio_fijo' ? `$${promo.discount_value} MXN/mes` : promo.discount_type === 'porcentaje' ? `${promo.discount_value}% descuento` : `${promo.discount_value} días gratis`;
                  return (
                    <div key={promo.id} style={{ background: '#fff', borderRadius: 14, border: `2px solid ${isRunning ? '#bbf7d0' : '#e5e7eb'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                      <div style={{ background: isRunning ? 'linear-gradient(135deg,#059669,#10b981)' : '#f9fafb', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15, color: isRunning ? '#fff' : '#1f2937' }}>{promo.name}</div>
                          <div style={{ fontSize: 12, color: isRunning ? '#d1fae5' : '#6b7280', marginTop: 2 }}>
                            {promo.user_type === 'operador' ? '👷 Operadores' : promo.user_type === 'cliente' ? '⭐ Clientes' : '👥 Ambos'} · {discountLabel}
                            {promo.auto_triggered && <span style={{ marginLeft: 6, background: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: '1px 6px', fontSize: 11 }}>🤖 Auto-activada</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ background: statusColor + '20', color: statusColor, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{statusLabel}</span>
                          {!isExpired && (
                            <button onClick={() => togglePromoActive(promo)}
                              style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: promo.is_active ? '#fef2f2' : '#f0fdf4', color: promo.is_active ? '#dc2626' : '#059669', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                              {promo.is_active ? 'Pausar' : 'Activar'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 13, color: '#374151', marginBottom: 10 }}>
                          <span>📅 {new Date(promo.valid_from).toLocaleDateString('es-MX')} → {new Date(promo.valid_until).toLocaleDateString('es-MX')}</span>
                          {promo.zone_keywords?.length > 0 && <span>📍 Zona: {promo.zone_keywords.join(', ')}</span>}
                          {promo.min_rating && <span>⭐ Rating: {promo.min_rating}{promo.max_rating ? `–${promo.max_rating}` : '+'}</span>}
                          {promo.auto_trigger_min_operators && <span>🤖 Auto: &lt;{promo.auto_trigger_min_operators} ops en zona</span>}
                          <span>🎯 Prioridad: {promo.priority}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => openEditPromo(promo)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1.5px solid #bfdbfe', background: '#eff6ff', color: '#1e40af', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>✏️ Editar</button>
                          <button onClick={() => deletePromo(promo.id)} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1.5px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 40 }}>🗑 Eliminar</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal: Crear/Editar Promoción */}
      {promoModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16 }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, width: '100%', maxWidth: isMobile ? '100%' : 560, overflow: 'hidden', maxHeight: isMobile ? '92vh' : '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0 }}>{editingPromo ? '✏️ Editar Promoción' : '➕ Nueva Promoción'}</h3>
              <button onClick={() => setPromoModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, borderRadius: 8, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: isMobile ? '16px' : '20px 24px', overflowY: 'auto', display: 'grid', gap: 14 }}>
              {/* Nombre */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Nombre de la promoción *</label>
                <input type="text" value={promoForm.name} onChange={e => setPromoForm(p => ({ ...p, name: e.target.value }))} placeholder="ej. Lanzamiento Naucalpan" style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', minHeight: 44 }} />
              </div>
              {/* Tipo de usuario y descuento */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Aplica a</label>
                  <select value={promoForm.user_type} onChange={e => setPromoForm(p => ({ ...p, user_type: e.target.value }))} style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, width: '100%', outline: 'none', minHeight: 44, background: '#fff' }}>
                    <option value="operador">👷 Operadores</option>
                    <option value="cliente">⭐ Clientes</option>
                    <option value="ambos">👥 Ambos</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Tipo de descuento</label>
                  <select value={promoForm.discount_type} onChange={e => setPromoForm(p => ({ ...p, discount_type: e.target.value }))} style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, width: '100%', outline: 'none', minHeight: 44, background: '#fff' }}>
                    <option value="precio_fijo">💰 Precio fijo (MXN)</option>
                    <option value="porcentaje">% Porcentaje de descuento</option>
                    <option value="dias_gratis">🎁 Días gratis</option>
                  </select>
                </div>
              </div>
              {/* Valor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>
                    {promoForm.discount_type === 'precio_fijo' ? 'Precio con promo (MXN)' : promoForm.discount_type === 'porcentaje' ? '% de descuento' : 'Días gratis'}
                  </label>
                  <input type="number" min="0" value={promoForm.discount_value} onChange={e => setPromoForm(p => ({ ...p, discount_value: e.target.value }))}
                    placeholder={promoForm.discount_type === 'precio_fijo' ? 'ej. 150' : promoForm.discount_type === 'porcentaje' ? 'ej. 25' : 'ej. 30'}
                    style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', minHeight: 44 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Prioridad (mayor = gana)</label>
                  <input type="number" min="0" value={promoForm.priority} onChange={e => setPromoForm(p => ({ ...p, priority: e.target.value }))} style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, width: '100%', boxSizing: 'border-box', outline: 'none', minHeight: 44 }} />
                </div>
              </div>
              {/* Fechas */}
              <div style={{ background: '#f0fdf4', borderRadius: 10, padding: '12px 14px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>📅 Vigencia — se activa/desactiva automáticamente</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Inicio</label>
                    <input type="datetime-local" value={promoForm.valid_from} onChange={e => setPromoForm(p => ({ ...p, valid_from: e.target.value }))} style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1fae5', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', minHeight: 44 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Fin</label>
                    <input type="datetime-local" value={promoForm.valid_until} onChange={e => setPromoForm(p => ({ ...p, valid_until: e.target.value }))} style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #d1fae5', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', minHeight: 44 }} />
                  </div>
                </div>
              </div>
              {/* Zona */}
              <div style={{ background: '#eff6ff', borderRadius: 10, padding: '12px 14px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>📍 Segmentación por zona (opcional)</div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Palabras clave de zona (separadas por coma)</label>
                <input type="text" value={promoForm.zone_keywords} onChange={e => setPromoForm(p => ({ ...p, zone_keywords: e.target.value }))} placeholder="ej. naucalpan, estado de mexico" style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #bfdbfe', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', minHeight: 44 }} />
                <div style={{ marginTop: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>🤖 Auto-activar si hay menos de N operadores en zona</label>
                  <input type="number" min="0" value={promoForm.auto_trigger_min_operators} onChange={e => setPromoForm(p => ({ ...p, auto_trigger_min_operators: e.target.value }))} placeholder="ej. 3 (dejar vacío para manual)" style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #bfdbfe', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', minHeight: 44 }} />
                  {promoForm.auto_trigger_min_operators > 0 && promoForm.zone_keywords && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#1e40af' }}>
                      🤖 Se activará automáticamente si hay menos de {promoForm.auto_trigger_min_operators} operadores activos en "{promoForm.zone_keywords}". El cron revisa cada 6 horas.
                    </div>
                  )}
                </div>
              </div>
              {/* Calificación — solo renovaciones */}
              {(promoForm.user_type === 'operador' || promoForm.user_type === 'ambos') && (
                <div style={{ background: '#fefce8', borderRadius: 10, padding: '12px 14px', border: '1px solid #fde68a' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>⭐ Premio por calificación (solo renovaciones)</div>
                  <div style={{ fontSize: 12, color: '#78716c', marginBottom: 10 }}>Solo aplica a operadores que ya tuvieron membresía. Deja vacío para aplicar a todos.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Rating mínimo</label>
                      <input type="number" min="0" max="5" step="0.1" value={promoForm.min_rating} onChange={e => setPromoForm(p => ({ ...p, min_rating: e.target.value }))} placeholder="ej. 4.5" style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #fde68a', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', minHeight: 44 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Rating máximo</label>
                      <input type="number" min="0" max="5" step="0.1" value={promoForm.max_rating} onChange={e => setPromoForm(p => ({ ...p, max_rating: e.target.value }))} placeholder="ej. 5.0" style={{ padding: '10px 12px', borderRadius: 8, border: '1.5px solid #fde68a', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', minHeight: 44 }} />
                    </div>
                  </div>
                  {promoForm.min_rating && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#92400e' }}>
                      ⭐ Aplica a operadores con rating {promoForm.min_rating}{promoForm.max_rating ? `–${promoForm.max_rating}` : ' o más'} que renueven su membresía.
                    </div>
                  )}
                </div>
              )}
              {/* Toggle activo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button onClick={() => setPromoForm(p => ({ ...p, is_active: !p.is_active }))}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: promoForm.is_active ? '#10b981' : '#e5e7eb', color: promoForm.is_active ? '#fff' : '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
                  {promoForm.is_active ? '✅ Activa al guardar' : '⏸ Pausada al guardar'}
                </button>
                <span style={{ fontSize: 12, color: '#9ca3af' }}>También se activa/pausa automáticamente según las fechas</span>
              </div>
              {promoError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13 }}>⚠️ {promoError}</div>}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => setPromoModal(false)} style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={savePromo} disabled={savingPromo} style={{ flex: 2, padding: '12px', background: savingPromo ? '#9ca3af' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', minHeight: 48 }}>
                {savingPromo ? '⏳ Guardando...' : editingPromo ? '💾 Actualizar' : '✅ Crear Promoción'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Crear/Editar Servicio */}
      {serviceModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? 0 : 16, overflowY: 'auto' }}>
          <div style={{ background: '#fff', borderRadius: isMobile ? '20px 20px 0 0' : 20, boxShadow: '0 8px 40px rgba(0,0,0,0.20)', width: '100%', maxWidth: isMobile ? '100%' : 640, overflow: 'hidden', margin: isMobile ? 0 : 'auto' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)', padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 17, margin: 0 }}>{editingService ? '✏️ Editar Servicio' : '➕ Nuevo Servicio'}</h3>
              <button onClick={() => setServiceModal(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', cursor: 'pointer', color: '#bfdbfe', fontSize: 22, borderRadius: 8, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: isMobile ? '16px' : 24, maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
                <div>
                  <label style={labelStyle}>Nombre del servicio *</label>
                  <input type="text" placeholder="Ej: Lavado de Motor" value={serviceForm.name} onChange={e => setServiceForm(p => ({...p, name: e.target.value}))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Descripción</label>
                  <textarea placeholder="Describe qué incluye este servicio..." value={serviceForm.description} onChange={e => setServiceForm(p => ({...p, description: e.target.value}))} style={{ ...inputStyle, height: 70, resize: 'vertical' }} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Icono</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {EMOJI_OPTIONS.map(emoji => (
                    <button key={emoji} onClick={() => setServiceForm(p => ({...p, icon: emoji}))} style={{ fontSize: 22, padding: '8px', borderRadius: 8, border: serviceForm.icon === emoji ? '2px solid #3b82f6' : '1.5px solid #e5e7eb', background: serviceForm.icon === emoji ? '#eff6ff' : '#fff', cursor: 'pointer', minHeight: 44 }}>{emoji}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Color:</label>
                  <input type="color" value={serviceForm.color} onChange={e => setServiceForm(p => ({...p, color: e.target.value}))} style={{ width: 44, height: 44, borderRadius: 6, border: '1.5px solid #e5e7eb', cursor: 'pointer', padding: 2 }} />
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Precios por tipo de vehículo (MXN)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {[{ key: 'price_sedan', label: '🚗 Sedán *' }, { key: 'price_suv', label: '🚙 SUV' }, { key: 'price_truck', label: '🛻 Pickup' }, { key: 'price_van', label: '🚐 Van' }].map(f => (
                    <div key={f.key}>
                      <label style={{ ...labelStyle, fontSize: 11 }}>{f.label}</label>
                      <input type="number" placeholder="0" value={serviceForm[f.key]} onChange={e => setServiceForm(p => ({...p, [f.key]: e.target.value}))} style={inputStyle} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Duración por tipo (minutos)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                  {[{ key: 'duration_sedan', label: '🚗 Sedán' }, { key: 'duration_suv', label: '🚙 SUV' }, { key: 'duration_pickup', label: '🛻 Pickup' }, { key: 'duration_van', label: '🚐 Van' }].map(f => (
                    <div key={f.key}>
                      <label style={{ ...labelStyle, fontSize: 11 }}>{f.label}</label>
                      <input type="number" placeholder="45" value={serviceForm[f.key]} onChange={e => setServiceForm(p => ({...p, [f.key]: e.target.value}))} style={inputStyle} />
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>🧴 Insumos estimados (opcional)</label>
                <textarea placeholder="Ej: 1L shampoo, 200ml cera, 2 microfibras..." value={serviceForm.supplies_notes} onChange={e => setServiceForm(p => ({...p, supplies_notes: e.target.value}))} style={{ ...inputStyle, height: 60, resize: 'vertical' }} />
              </div>
              {editingService && (
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>✅ Checklist de calidad</label>
                  <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                    {checklistItems.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CheckSquare size={16} color="#10b981" />
                          <span style={{ fontSize: 14, color: '#374151' }}>{item.item}</span>
                        </div>
                        <button onClick={() => deleteChecklistItem(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 18, minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="text" placeholder="Agregar ítem..." value={newChecklistItem} onChange={e => setNewChecklistItem(e.target.value)} onKeyDown={e => e.key === 'Enter' && addChecklistItem(editingService)} style={{ ...inputStyle, flex: 1 }} />
                    <button onClick={() => addChecklistItem(editingService)} disabled={savingChecklist} style={{ padding: '12px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', flexShrink: 0, minHeight: 48 }}>+ Agregar</button>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Orden</label>
                  <input type="number" placeholder="1" value={serviceForm.sort_order} onChange={e => setServiceForm(p => ({...p, sort_order: e.target.value}))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Estado</label>
                  <button onClick={() => setServiceForm(p => ({...p, is_active: !p.is_active}))} style={{ width: '100%', padding: '12px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: serviceForm.is_active ? '#f0fdf4' : '#fef2f2', color: serviceForm.is_active ? '#166534' : '#991b1b', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48 }}>
                    {serviceForm.is_active ? <><ToggleRight size={18} color="#10b981" /> Activo</> : <><ToggleLeft size={18} color="#ef4444" /> Inactivo</>}
                  </button>
                </div>
              </div>
              {serviceError   && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#dc2626', fontSize: 14 }}>⚠️ {serviceError}</div>}
              {serviceSuccess && <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginTop: 16, color: '#166534', fontSize: 14 }}>✅ {serviceSuccess}</div>}
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setServiceModal(false)} style={{ padding: '12px 22px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer', minHeight: 48 }}>Cancelar</button>
              <button onClick={saveService} disabled={savingService} style={{ padding: '12px 28px', background: savingService ? '#9ca3af' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, minHeight: 48 }}>
                <Save size={15} /> {savingService ? 'Guardando...' : editingService ? 'Actualizar' : 'Crear Servicio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminViewC;
