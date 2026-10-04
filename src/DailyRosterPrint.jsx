import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';

// Karta wydruku dziennego — układ wg „ORDO_grafik_dzienny_propozycja_v3” (kolorystyka ORDO, bez kosztu dnia).
// A4 poziomo, jedna strona: nagłówek + 4 wskaźniki, pełnoszerokościowa tabela obsady z osią 06→06,
// pod nią panel operacyjny: obsada vs zapotrzebowanie, prowadzenie zmiany (podpis), priorytety i uwagi.
// Rezerwa: do 3 osób z zatwierdzoną dyspozycją „dostępny” w tym dniu, bez zmiany w grafiku (z informacją od–do).
// Klasy opv3-* są zdefiniowane w ordo-overrides.css; powłoka (overlay, pasek, strona, @media print) w ordo-views.css.

const OS_H = Array.from({ length: 13 }, (_, i) => (6 + i * 2) % 24);          // 06 08 … 04 06
const gL = (h) => String(h).padStart(2, '0');
const TONE_LBL = [['deep', 'Manager'], ['mid', 'Front / obsługa'], ['soft', 'Kuchnia'], ['outline', 'Prep / pozostałe']];

export const DailyRosterPrint = ({ open, data, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', esc); };
  }, [onClose, open]);
  if (!open || !data) return null;

  const d = data;
  const people = d.people || [];
  const need = d.needHours || [];
  const plan = d.planHours || [];
  const n = Math.max(need.length, plan.length, 20);
  const godzOsi = Array.from({ length: n }, (_, i) => (6 + i) % 24);
  const osoby = people.length;
  const gesto = osoby > 16 ? ' dense' : '';

  return (
    <div className="ordo-print-overlay" role="dialog" aria-modal="true" aria-label="Podgląd wydruku grafiku dziennego">
      <div className="ordo-print-toolbar">
        <div><Printer size={18} /><span><strong>Podgląd wydruku dnia</strong><small>A4 poziomo • cały grafik na jednej stronie</small></span></div>
        <div><button onClick={onClose}><X size={15} /> Zamknij</button><button className="primary" onClick={() => window.print()}><Printer size={15} /> Drukuj / zapisz PDF</button></div>
      </div>

      <article className={`ordo-print-page opv3${gesto}`}>
        <header className="opv3-head">
          <div className="opv3-brand"><b>ORDO</b><span>WORKFORCE STUDIO</span></div>
          <div className="opv3-title"><span>WORKFORCE / SCHEDULE</span><h1>Grafik dzienny</h1><strong>{d.dateLabel}</strong><small>{d.operationalDayLabel} • {(d.versionLabel || '').toLowerCase()}</small></div>
          <div className="opv3-loc"><span>LOKAL</span><strong>{d.restaurantName} – {d.restaurantDetail}</strong><small>{d.locationCode} • dokument operacyjny</small></div>
        </header>

        <section className="opv3-kpis">
          <div><span>OSOBY W PLANIE</span><strong>{d.employeeCount}</strong><small>pełna obsada dnia</small></div>
          <div><span>GODZINY ŁĄCZNIE</span><strong>{d.plannedHours}</strong><small>plan dnia • {d.shiftCount} zmian</small></div>
          <div><span>GODZINY MGR</span><strong>{d.managerHours}</strong><small>managerowie</small></div>
          <div><span>POKRYCIE OBSADY</span><strong>{d.coveragePercent}%</strong><small>{d.coverageAttentionLabel || 'plan vs zapotrzebowanie'}</small></div>
        </section>

        <section className="opv3-card opv3-roster">
          <div className="opv3-card-head">
            <i>01</i><div><strong>Obsada i przydział stanowisk</strong><small>Kto pracuje, na jakim stanowisku i w których godzinach</small></div>
            <div className="opv3-legend">{TONE_LBL.map(([t, l]) => <span key={t}><b className={`opv3-sw ${t}`} />{l}</span>)}</div>
          </div>
          <div className="opv3-table">
            <div className="opv3-tr opv3-th">
              <span>ZESPÓŁ</span><span>ZMIANA</span><span>STANOWISKO</span><span>PRZERWA</span>
              <span className="opv3-axis">{OS_H.map((h, i) => <i key={i} style={{ left: `${i / 12 * 100}%` }}>{gL(h)}</i>)}</span>
            </div>
            {people.map((p) => (
              <div className="opv3-tr" key={p.name}>
                <span className="opv3-who"><i>{p.initials}</i><div><strong>{p.name}</strong><small>{String(p.job || '').replace('Młodszy ', 'Mł. ')}</small></div></span>
                <span className="opv3-time"><div>{p.segments.map((s, i) => <b key={i}>{s.time}</b>)}</div></span>
                <span className="opv3-st">{p.segments.map((s, i) => <b key={i} className={`opv3-chip ${s.tone || 'mid'}`}>{s.role}</b>)}</span>
                <span className="opv3-brk">{p.przerwa}</span>
                <span className="opv3-tl">
                  <i className="opv3-grid">{Array.from({ length: 12 }, (_, i) => <b key={i} />)}</i>
                  {p.segments.map((s, i) => { const l = Math.max(0, (s.start - 6) / 24), w = Math.min((s.end - s.start) / 24, 1 - l); return (
                    <em key={i} className={`opv3-bar ${s.tone || 'mid'}`} style={{ left: `${l * 100}%`, width: `${w * 100}%` }}><small>{p.initials} {s.time}</small></em>
                  ); })}
                </span>
              </div>
            ))}
            {!people.length && <div className="opv3-empty">Brak zmian w tym dniu.</div>}
          </div>
        </section>

        <section className="opv3-card opv3-ops">
          <div className="opv3-card-head"><i>02</i><div><strong>Panel operacyjny</strong><small>Najważniejsze informacje do prowadzenia zmiany</small></div></div>
          <div className="opv3-ops-grid">
            <div className="opv3-cov">
              <div className="opv3-cov-head"><div><strong>Obsada względem zapotrzebowania</strong><small>Liczba osób w planie na kolejne godziny</small></div><b>{d.coveragePercent}%</b></div>
              <div className="opv3-cov-hours">{godzOsi.map((h, i) => <span key={i}>{i % 4 === 0 || i === n - 1 ? gL(h) : ''}</span>)}</div>
              <div className="opv3-cov-row need">{godzOsi.map((_, i) => <span key={i}>{need[i] || ''}</span>)}</div>
              <div className="opv3-cov-row plan">{godzOsi.map((_, i) => <span key={i} className={plan[i] < need[i] ? 'deficit' : ''}>{plan[i] || ''}</span>)}</div>
              <small className="opv3-cov-note">góra: zapotrzebowanie • dół: plan</small>
            </div>
            <div className="opv3-lead">
              <strong className="opv3-h">Prowadzenie zmiany</strong>
              <div><span>OTWARCIE</span><b>{d.openingManager}</b></div>
              <div><span>ZAMKNIĘCIE</span><b>{d.closingManager}</b></div>
              <label>Podpis managera prowadzącego<i /></label>
            </div>
            <div className="opv3-reserve">
              <strong className="opv3-h">Rezerwa — dostępni dziś</strong>
              {(d.rezerwa || []).length ? (d.rezerwa || []).map((r) => (
                <div key={r.name}><i>{r.initials}</i><div><b>{r.name}</b><small>{r.job}</small></div><em>{r.dostepnosc}</em></div>
              )) : <small className="opv3-muted">Brak osób z zatwierdzoną dyspozycją poza grafikiem.</small>}
            </div>
            <div className="opv3-prio">
              <strong className="opv3-h">{(d.priorities || []).length ? 'Priorytety / komunikaty' : 'Uwagi zmiany'}</strong>
              {(d.priorities || []).length > 0 && <ul>{d.priorities.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              {(d.priorities || []).length > 0 && <span className="opv3-notes-lbl">UWAGI ZMIANY</span>}
              <i className="opv3-line" /><i className="opv3-line" />{!(d.priorities || []).length && <><i className="opv3-line" /><i className="opv3-line" /></>}
            </div>
          </div>
        </section>

        <footer className="opv3-foot"><span>ORDO Workforce Studio • Schedule</span><span>{d.generatedAt}</span><span>{d.documentLabel}</span></footer>
      </article>
    </div>
  );
};

export default DailyRosterPrint;
