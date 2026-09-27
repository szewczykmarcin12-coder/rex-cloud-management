import React, { useEffect } from 'react';
import { AlertCircle, Check, RefreshCw, X } from 'lucide-react';
import { colors } from '../lib/domain.js';
// ── Wspólne elementy interfejsu Studio ──
export const Btn = ({ children, variant = 'primary', icon: Icon, onClick, disabled, loading, className = '' }) => {
  const vars = {
    primary: { bg: colors.primary.dark, text: 'white' },
    secondary: { bg: colors.primary.bg, text: colors.primary.dark },
    danger: { bg: '#B94352', text: 'white' },
    ghost: { bg: 'transparent', text: colors.primary.light },
    accent: { bg: colors.accent.medium, text: 'white' },
    success: { bg: '#A7465F', text: 'white' }
  };
  const v = vars[variant] || vars.primary;
  return <button onClick={onClick} disabled={disabled || loading} className={`px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm ${className}`} style={{ background: v.bg, color: v.text }}>{loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4" />}{children}</button>;
};

export const Toast = ({ message, type, onClose }) => { useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]); const bg = { success: '#741334', error: '#B94352', info: '#5A3542' }[type] || colors.primary.medium; return <div className="fixed bottom-4 right-4 px-6 py-3 rounded-xl text-white shadow-lg z-50 flex items-center gap-2" style={{ backgroundColor: bg }}>{type === 'success' ? <Check className="w-5 h-5" /> : type === 'error' ? <X className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}{message}</div>; };

const StatCard = ({ label, value, icon: Icon, color }) => (
  <article className="metric-card">
    <span className="metric-icon" style={{ color, background: `${color}1a` }}><Icon size={18} /></span>
    <div className="metric-copy"><span>{String(label).toUpperCase()}</span><strong>{value}</strong><small>ORDO Workforce Studio</small></div>
    <span className="metric-progress"><i style={{ width: '62%' }} /></span>
  </article>
);

export const Header = ({ title, subtitle, children }) => (
  <div className="page-wrap" style={{ paddingTop: 24, paddingBottom: 0 }}>
    <div className="page-heading" style={{ marginBottom: 6 }}>
      <div>
        <div className="eyebrow"><span className="status-pulse" /> ORDO WORKFORCE STUDIO</div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  </div>);

// ===================== LOGIN =====================

export const MHead = ({ kicker, title, copy, children }) => (
  <div className="module-heading"><div><span>{kicker}</span><h1>{title}</h1><p>{copy}</p></div>{children && <div className="module-actions">{children}</div>}</div>
);
export const MMetric = ({ label, value, helper, tone = 'blue', icon: Icon }) => (
  <article className="mini-metric"><div className={`mini-metric-icon ${tone}`}><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small>{helper}</small></article>
);

// ═════════ OBSADA LIVE (Live Command) — wzorzec ORDO na danych z Employee Hub ═════════
export const Sekcja = ({ children, kolor, tytul, ikona: Ik }) => (
  <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${kolor}` }}>
    <div className="flex items-center gap-2 mb-4">{Ik && <Ik className="w-5 h-5" style={{ color: kolor }} />}<h3 className="text-lg font-semibold" style={{ color: colors.primary.darkest }}>{tytul}</h3></div>
    {children}
  </div>
);

export const DialogS = ({ title, kicker, description, onClose, children, actions, size = 'medium' }) => {
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <section className={`app-dialog dialog-${size}`} role="dialog" aria-modal="true">
        <header className="dialog-header"><div>{kicker && <span>{kicker}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div><button onClick={onClose} aria-label="Zamknij"><X size={19} /></button></header>
        <div className="dialog-body">{children}</div>
        {actions && <footer className="dialog-actions">{actions}</footer>}
      </section>
    </div>
  );
};

// ── WFM-02: dostępność — akceptacja propozycji pracowników ──
export const DNI_KROTKIE = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
export const opisDnia = (w) => !w || w.tryb === 'pelna' ? 'cały dzień' : w.tryb === 'brak' ? '—' : `${w.od}–${w.do}`;
