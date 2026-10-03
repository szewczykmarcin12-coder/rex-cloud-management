import React, { useState } from 'react';
import { AlertTriangle, Check, TrendingDown, TrendingUp } from 'lucide-react';
import { DialogS } from '../ui/primitives.jsx';

// ── Podgląd i import raportów POS (Sales Day by Day / Daily Operations) — Administracja → Import i eksport ──
const zl = (n) => `${Math.round(n || 0).toLocaleString('pl-PL')} zł`;
const tys = (n) => `${(Math.round((n || 0) / 100) / 10).toLocaleString('pl-PL')} tys.`;
const DNI = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];

export const PosImportDialog = ({ raport, onClose, onDone, api, show }) => {
  const [busy, setBusy] = useState(false);
  const sales = raport.typ === 'sales-day-by-day';
  const pelne = sales ? raport.weeks.filter((w) => w.days === 7) : [];
  const trend = pelne.length >= 2 ? (pelne[pelne.length - 1].net - pelne[0].net) / pelne[0].net * 100 : null;
  const maxTyg = Math.max(1, ...pelne.map((w) => w.net));
  const maxDow = sales ? Math.max(1, ...raport.dow.map((d) => d.net || 0)) : 1;
  const maxSlot = !sales ? Math.max(1e-9, ...raport.profile96.map((s) => s.sales)) : 1;
  const wyslij = async () => {
    setBusy(true);
    const body = sales
      ? { source: 'pos-sales-day-by-day', basis: 'net', sales: raport.sales, salesGross: raport.salesGross, checks: raport.checks }
      : { source: 'pos-daily-operations', intraday: raport.intraday };
    const r = await api('/sales', 'PUT', body);
    setBusy(false);
    if (r && r.success) { show(sales ? `Zaimportowano ${raport.n} dni sprzedaży netto (${raport.from} – ${raport.to}) + paragony. Prognoza dzienna, miesiąc i COL liczą się na netto.` : `Zaimportowano zmierzony profil śróddzienny (${raport.from} – ${raport.to}). Sloty 15 min prognozy, obsada godzinowa i autoplan używają go od teraz.`); onDone(); }
    else show((r && r.error) || 'Błąd importu POS', 'error');
  };
  return (
    <DialogS title={sales ? 'Import sprzedaży dziennej z POS' : 'Import profilu śróddziennego z POS'} kicker={`${raport.plik} • ${raport.location || 'lokal'} • ${raport.from || '?'} – ${raport.to || '?'}`}
      description={sales ? 'Podstawa w ORDO: sprzedaż NETTO (Sales Net VAT) — tak jak „Planowana sprzedaż netto” w Prognozie miesiąca i COL. Brutto po rabatach zapisujemy obok. Dni już obecne w bazie zostaną nadpisane.' : 'Rozkład sprzedaży i paragonów na kwadranse z całego okresu raportu. Zastępuje standardowe założenie QSR w slotach 15 min Prognozy miesiąca, w obsadzie godzinowej i w autoplanie (ten sam profil dla każdego dnia tygodnia, dopóki nie ma importu godzinowego per dzień).'}
      onClose={onClose} size="large"
      actions={<><button onClick={onClose}>Anuluj</button><button className="dialog-primary" disabled={busy} onClick={wyslij}><Check size={15} /> {busy ? 'Importuję…' : (sales ? `Importuj ${raport.n} dni` : 'Importuj profil')}</button></>}>
      {sales ? (
        <>
          <div className="dialog-stat-grid">
            <div className="dialog-stat"><span>Dni / braki</span><strong>{raport.n} / {raport.braki.length}</strong></div>
            <div className="dialog-stat"><span>Sprzedaż netto</span><strong>{zl(raport.totals.net)}</strong></div>
            <div className="dialog-stat"><span>Brutto po rabatach</span><strong>{zl(raport.totals.gross)}</strong></div>
            <div className="dialog-stat"><span>Paragony • AGC</span><strong>{(raport.totals.checks || 0).toLocaleString('pl-PL')} • {raport.totals.avgCheck != null ? `${raport.totals.avgCheck.toFixed(2).replace('.', ',')} zł` : '—'}</strong></div>
          </div>
          {pelne.length > 0 && (
            <>
              <p className="dialog-section-title" style={{ marginTop: 12 }}>PEŁNE TYGODNIE (PN–ND) • NETTO {trend != null && <em style={{ marginLeft: 8, color: trend < -5 ? '#B94352' : '#5A3542', fontStyle: 'normal' }}>{trend < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />} {trend > 0 ? '+' : ''}{trend.toFixed(0)}% pierwszy → ostatni</em>}</p>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${pelne.length}, 1fr)`, gap: 6, alignItems: 'end', height: 86 }}>
                {pelne.map((w) => <div key={w.weekStart} title={`${w.weekStart}: ${zl(w.net)} • ${w.checks} paragonów`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}><small style={{ fontSize: 10, color: '#6e5a62' }}>{tys(w.net)}</small><i style={{ width: '100%', height: `${w.net / maxTyg * 60}px`, background: '#741334', borderRadius: 4 }} /><small style={{ fontSize: 9.5, color: '#8a7a80' }}>{w.weekStart.slice(5)}</small></div>)}
              </div>
            </>
          )}
          <p className="dialog-section-title" style={{ marginTop: 12 }}>ŚREDNIA NETTO WG DNIA TYGODNIA</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {[1, 2, 3, 4, 5, 6, 0].map((i) => <div key={i} style={{ textAlign: 'center' }}><div style={{ height: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}><i style={{ width: 22, height: `${(raport.dow[i].net || 0) / maxDow * 40}px`, background: i === 0 || i === 6 ? '#A7465F' : '#5A3542', borderRadius: 3, display: 'block' }} /></div><small style={{ fontSize: 10.5, fontWeight: 700 }}>{DNI[i]}</small><br /><small style={{ fontSize: 10, color: '#6e5a62' }}>{raport.dow[i].net != null ? tys(raport.dow[i].net) : '—'}</small></div>)}
          </div>
          {raport.warnings.length > 0 && <div className="dialog-notice" style={{ marginTop: 12 }}><AlertTriangle size={16} /><span>{raport.warnings.join(' ')}</span></div>}
          <p style={{ marginTop: 12, fontSize: 12, color: '#6e5a62' }}>Co z tego korzysta: prognoza dzienna (mediana tego samego dnia tygodnia × trend 4 tyg., backtest MAPE/WAPE), rozkład miesiąca AOP na dni, MPT z paragonów, COL w Analizach. Labor % z POS nie jest używany — kalibracja SPLH pochodzi z odbić ORDO.</p>
        </>
      ) : (
        <>
          <div className="dialog-stat-grid">
            <div className="dialog-stat"><span>Sprzedaż netto okresu</span><strong>{zl(raport.totals.net)}</strong></div>
            <div className="dialog-stat"><span>Paragony • AGC</span><strong>{(raport.totals.checks || 0).toLocaleString('pl-PL')} • {raport.totals.avgCheck != null ? `${raport.totals.avgCheck.toFixed(2).replace('.', ',')} zł` : '—'}</strong></div>
            <div className="dialog-stat"><span>Kwadranse z danymi</span><strong>{Object.keys(raport.slots15).length}</strong></div>
            <div className="dialog-stat"><span>Szczyty</span><strong>{raport.peaks.slice(0, 2).join(' • ')}</strong></div>
          </div>
          <p className="dialog-section-title" style={{ marginTop: 12 }}>UDZIAŁ SPRZEDAŻY W DOBIE OPERACYJNEJ 06 → 06 (15 MIN)</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 70, borderBottom: '1px solid #e7dcdf' }}>
            {raport.profile96.map((s) => <i key={s.time} title={`${s.time}: ${(s.sales * 100).toFixed(2)}% sprzedaży, ${(s.checks * 100).toFixed(2)}% paragonów`} style={{ flex: 1, height: `${s.sales / maxSlot * 66}px`, background: s.time >= '12:00' && s.time < '15:00' || s.time >= '18:00' && s.time < '21:00' ? '#741334' : '#B86D82', display: 'block', minWidth: 2 }} />)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#8a7a80', marginTop: 2 }}>{['06', '09', '12', '15', '18', '21', '00', '03'].map((h) => <span key={h}>{h}</span>)}</div>
          {raport.orderTypes.length > 0 && <><p className="dialog-section-title" style={{ marginTop: 12 }}>TYPY ZAMÓWIEŃ (INFORMACYJNIE)</p><div className="dialog-list">{raport.orderTypes.slice(0, 6).map((o) => <div key={o.name}><i>{Math.round(o.sharePct)}%</i><span><strong>{o.name}</strong><small>{zl(o.net)} • {o.checks.toLocaleString('pl-PL')} paragonów • AGC {o.avgCheck.toFixed(2).replace('.', ',')} zł</small></span></div>)}</div></>}
          {!raport.totals.laborTracked && <p style={{ marginTop: 10, fontSize: 12, color: '#6e5a62' }}>Labor Cost % w POS = 0 (POS nie śledzi pracy) — koszt pracy liczy ORDO z grafiku i odbić.</p>}
          {raport.warnings.length > 0 && <div className="dialog-notice" style={{ marginTop: 12 }}><AlertTriangle size={16} /><span>{raport.warnings.join(' ')}</span></div>}
        </>
      )}
    </DialogS>
  );
};
