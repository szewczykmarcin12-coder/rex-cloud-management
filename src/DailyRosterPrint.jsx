import { useEffect } from 'react';
import { Printer, X } from 'lucide-react';

// Karta wydruku dziennego 1:1 wg wzorca ORDO (klasy ordo-print-* z ordo-views.css).
// A4 poziomo, jedna strona: tabela obsady z mini-osią 06→02, pokrycie godzinowe,
// podsumowanie godzin, priorytety zmiany i podpisy managerów.

const OSIE = [6, 8, 10, 12, 14, 16, 18, 20, 22, 0, 2];
const gL = (h) => String(h).padStart(2, '0');

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
  const kosztLbl = d.koszt != null ? `${Math.round(d.koszt).toLocaleString('pl-PL')} zł` : '—';
  const kosztSub = d.sprzedaz ? `${(d.koszt / d.sprzedaz * 100).toFixed(1).replace('.', ',')}% sprzedaży` : 'wg stawek kont';

  return (
    <div className="ordo-print-overlay" role="dialog" aria-modal="true" aria-label="Podgląd wydruku grafiku dziennego">
      <div className="ordo-print-toolbar">
        <div><Printer size={18} /><span><strong>Podgląd wydruku dnia</strong><small>A4 poziomo • cały grafik na jednej stronie</small></span></div>
        <div><button onClick={onClose}><X size={15} /> Zamknij</button><button className="primary" onClick={() => window.print()}><Printer size={15} /> Drukuj / zapisz PDF</button></div>
      </div>

      <article className="ordo-print-page">
        <header className="ordo-print-header">
          <div className="ordo-print-brand"><b style={{ color: '#741334', fontSize: 26, letterSpacing: '.26em', fontWeight: 800 }}>ORDO</b><span>Workforce Studio</span></div>
          <div className="ordo-print-title"><span>WORKFORCE • SCHEDULE</span><h1>Grafik dzienny</h1><strong>{d.dateLabel}</strong><small>{d.operationalDayLabel} • {d.versionLabel?.toLowerCase()}</small></div>
          <div className="ordo-print-location"><span>RESTAURACJA</span><strong>{d.restaurantName} • {d.restaurantDetail}</strong><small>{d.locationCode} • dokument operacyjny</small></div>
        </header>

        <section className="ordo-print-summary">
          <div><span>Pracownicy</span><strong>{d.employeeCount}</strong><small>pełna obsada dnia</small></div>
          <div><span>Zmiany</span><strong>{d.shiftCount}</strong><small>w tym podziały stanowisk</small></div>
          <div><span>Godziny planu</span><strong>{d.plannedHours}</strong><small>łącznie</small></div>
          <div><span>Godziny managerów</span><strong>{d.managerHours}</strong><small>otwarcie + zamknięcie</small></div>
          <div><span>Pokrycie</span><strong>{d.coveragePercent}%</strong><small>{d.coverageAttentionLabel}</small></div>
          <div><span>Koszt szacowany</span><strong>{kosztLbl}</strong><small>{kosztSub}</small></div>
        </section>

        <main className="ordo-print-layout">
          <section className="ordo-print-roster">
            <div className="ordo-print-section-head"><span>01</span><div><strong>Obsada i stanowiska</strong><small>Plan pracy wszystkich osób na jednej osi dnia</small></div></div>
            <div className="ordo-print-table">
              <div className="ordo-print-table-head"><span>PRACOWNIK</span><span>FUNKCJA</span><span>GODZINY</span><span>STANOWISKO</span><span>PRZERWA</span><span className="ordo-print-timeline-head">{OSIE.map((h) => <i key={h}>{gL(h)}</i>)}</span></div>
              {people.map((p) => (
                <div className="ordo-print-person" key={p.name}>
                  <span className="ordo-print-name"><i>{p.initials}</i><strong>{p.name}</strong></span>
                  <span>{p.job.replace('Młodszy ', 'Mł. ')}</span>
                  <strong>{p.segments.map((s) => s.time).join(' / ')}</strong>
                  <span>{p.segments.map((s) => s.role).join(' → ')}</span>
                  <span>{p.przerwa}</span>
                  <span className="ordo-print-timeline">
                    <i className="ordo-print-grid">{Array.from({ length: 10 }, (_, i) => <b key={i} />)}</i>
                    {p.segments.map((s, i) => <em key={i} className={`print-shift-${s.tone || 'mid'}`} style={{ left: `${Math.max(0, (s.start - 6) / 20) * 100}%`, width: `${Math.min((s.end - s.start) / 20, 1 - Math.max(0, (s.start - 6) / 20)) * 100}%` }}><small>{i ? s.role : p.initials}</small></em>)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <aside className="ordo-print-side">
            <section className="ordo-print-coverage">
              <div className="ordo-print-section-head"><span>02</span><div><strong>Pokrycie godzinowe</strong><small>Plan względem personelu idealnego</small></div><b>{d.coveragePercent}%</b></div>
              <div className="ordo-print-coverage-hours">{Array.from({ length: 20 }, (_, i) => <span key={i}>{i % 2 === 0 ? gL((6 + i) % 24) : ''}</span>)}</div>
              <div className="ordo-print-coverage-row"><label>IDEAŁ</label><div>{need.map((v, i) => <span key={i}>{v || ''}</span>)}</div></div>
              <div className="ordo-print-coverage-row plan"><label>PLAN</label><div>{plan.map((v, i) => <span className={v < need[i] ? 'deficit' : v > need[i] + 2 ? 'excess' : ''} key={i}>{v || ''}</span>)}</div></div>
              <p><i /> pokrycie <i /> zapas <i /> niedobór</p>
            </section>

            <section className="ordo-print-hours">
              <div className="ordo-print-section-head"><span>03</span><div><strong>Podsumowanie godzin</strong><small>Podział dnia według funkcji</small></div></div>
              {(d.hoursSummary || []).map((w) => <div key={w.id}><span>{w.label}</span><strong>{w.planned}</strong><i /></div>)}
            </section>

            <section className="ordo-print-priorities">
              <div className="ordo-print-section-head"><span>04</span><div><strong>Priorytety zmiany</strong><small>Do omówienia na pre-shifcie</small></div></div>
              <ol>{(d.priorities || []).map((x, i) => <li key={i}>{x}</li>)}</ol>
              <label>Uwagi kierownika<i /></label>
            </section>

            <section className="ordo-print-signatures">
              <div><span>Manager otwierający</span><strong>{d.openingManager}</strong></div>
              <div><span>Manager zamykający</span><strong>{d.closingManager}</strong></div>
              <label>Podpis<i /></label>
            </section>
          </aside>
        </main>

        <footer className="ordo-print-footer"><span>ORDO Workforce Studio • Schedule</span><span>{d.generatedAt}</span><span>{d.documentLabel}</span></footer>
      </article>
    </div>
  );
};

export default DailyRosterPrint;
