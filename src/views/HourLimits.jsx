import React, { useEffect, useState } from 'react';
import { Clock, LayoutGrid } from 'lucide-react';
import { colors, dniMiesiaca, godzZ, months, podsumowanieMiesiaca, ymd } from '../lib/domain.js';
import { Btn, Header, Sekcja } from '../ui/primitives.jsx';
// ── Planowanie → Limity godzin (plan godzin miesiąca, MGR / MGR funkcyjni) ──
export const PlanPage = ({ data }) => {
  const domyslnyYm = (data.months && data.months[0]?.key) || (data.meta.firstDate || '').slice(0, 7) || ymd(new Date()).slice(0, 7);
  const [ym, setYm] = useState(domyslnyYm);
  const dni = dniMiesiaca(ym);
  const [mgrH, setMgrH] = useState(8);
  const [mgrDate, setMgrDate] = useState(dni[0] || '');
  const [funkH, setFunkH] = useState(8);
  const [funkDate, setFunkDate] = useState(dni[0] || '');
  const [wd, setWd] = useState([]);
  const [planLocal, setPlanLocal] = useState('');
  useEffect(() => { const d = dniMiesiaca(ym); setMgrDate(d[0] || ''); setFunkDate(d[0] || ''); }, [ym]);

  const p = podsumowanieMiesiaca(data.shifts, data.planowanie, ym);
  useEffect(() => { setPlanLocal(p.planTotal ? String(p.planTotal) : ''); }, [ym, p.planTotal]);
  const nadmiar = p.planTotal > 0 ? p.total - p.planTotal : 0;
  const pct = p.planTotal > 0 ? Math.min(100, (p.total / p.planTotal) * 100) : 0;
  const kolorStanu = p.planTotal === 0 ? colors.primary.light : nadmiar > 0 ? '#B94352' : (p.total >= p.planTotal * 0.95 ? '#B86D82' : '#741334');
  const topDni = (() => {
    const g = {};
    p.mShifts.forEach(s => { g[s.date] = (g[s.date] || 0) + godzZ(s); });
    return Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 3);
  })();
  const [y, m] = ym.split('-').map(Number);
  const label = `${months[m - 1]} ${y}`;
  const dniTyg = [['Pn', 1], ['Wt', 2], ['Śr', 3], ['Cz', 4], ['Pt', 5], ['So', 6], ['Nd', 0]];

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Plan godzin" subtitle="Plan miesiąca, ręczne godziny MGR i monitoring przekroczeń" />
      <div className="flex-1 p-8 space-y-6 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" style={{ color: colors.primary.dark }}>Miesiąc:</span>
          <select value={ym} onChange={e => setYm(e.target.value)} className="px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}>
            {(data.months && data.months.length ? data.months : [{ key: ym, label }]).map(mm => <option key={mm.key} value={mm.key}>{mm.label || mm.key}</option>)}
          </select>
        </div>

        <Sekcja kolor={kolorStanu} tytul={`Plan total — ${label}`} ikona={LayoutGrid}>
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Plan total godzin (miesiąc)</label>
              <input type="number" value={planLocal} onChange={e => setPlanLocal(e.target.value)} onBlur={() => data.setPlanTotal(ym, planLocal)} placeholder="np. 1800" className="w-40 px-3 py-2 rounded-lg border text-lg font-semibold" style={{ borderColor: colors.primary.bg }} />
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className="flex justify-between text-sm mb-1"><span style={{ color: colors.primary.dark }}>Zaplanowano: <b>{p.total.toFixed(1)} h</b></span><span style={{ color: colors.primary.light }}>{p.planTotal ? `z ${p.planTotal} h` : 'brak planu'}</span></div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: colors.primary.bg }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: kolorStanu, transition: 'width .3s' }} />
              </div>
            </div>
          </div>
          {p.planTotal > 0 && (nadmiar > 0
            ? <div className="rounded-xl p-4" style={{ backgroundColor: '#F5E3E8' }}>
                <p className="font-semibold mb-1" style={{ color: '#B94352' }}>Przekroczenie planu o {nadmiar.toFixed(1)} h</p>
                <p className="text-sm mb-2" style={{ color: colors.primary.dark }}>Sugerowane ścięcie: <b>{nadmiar.toFixed(1)} h</b>. Dni z największą liczbą godzin (kandydaci do redukcji):</p>
                <div className="flex flex-wrap gap-2">{topDni.map(([d, h]) => <span key={d} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: 'white', color: colors.primary.dark }}>{d.slice(5)} — {h.toFixed(1)} h</span>)}</div>
              </div>
            : <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>W ramach planu — pozostało {(p.planTotal - p.total).toFixed(1)} h.</div>)}
          <div className="grid grid-cols-4 gap-3 mt-4 text-center text-sm">
            <div className="rounded-lg p-2" style={{ backgroundColor: colors.primary.bg }}><b>{p.crew.toFixed(1)}</b><br />CREW</div>
            <div className="rounded-lg p-2" style={{ backgroundColor: '#F1E4E8' }}><b>{p.szkol.toFixed(1)}</b><br />Szkoleniowe</div>
            <div className="rounded-lg p-2" style={{ backgroundColor: colors.primary.bgLight }}><b>{p.mgr.toFixed(1)}</b><br />MGR{p.mgrManual ? ` (+${p.mgrManual})` : ''}</div>
            <div className="rounded-lg p-2" style={{ backgroundColor: colors.primary.bgLight }}><b>{p.funk.toFixed(1)}</b><br />MGR funkc.{p.funkManual ? ` (+${p.funkManual})` : ''}</div>
          </div>
        </Sekcja>

        <Sekcja kolor="#2B171E" tytul="Godziny MGR (ręcznie)" ikona={Clock}>
          <p className="text-sm mb-3" style={{ color: colors.primary.light }}>Dodaj godziny managera do sumy RAZEM — w wybrany dzień albo w każdy dzień miesiąca. Ręcznie dodane: <b>{p.mgrManual.toFixed(1)} h</b> ({Object.keys((data.planowanie[ym] || {}).mgr || {}).length} dni).</p>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Godziny</label><input type="number" value={mgrH} onChange={e => setMgrH(e.target.value)} className="w-24 px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Dzień</label><select value={mgrDate} onChange={e => setMgrDate(e.target.value)} className="px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}>{dni.map(d => <option key={d} value={d}>{d.slice(5)}</option>)}</select></div>
            <Btn variant="secondary" onClick={() => data.applyGodziny(ym, 'mgr', 'day', mgrH, mgrDate)}>Zastosuj w ten dzień</Btn>
            <Btn onClick={() => data.applyGodziny(ym, 'mgr', 'month', mgrH)}>Przenieś na cały miesiąc</Btn>
            <Btn variant="secondary" onClick={() => data.clearGodziny(ym, 'mgr')}>Wyczyść</Btn>
          </div>
        </Sekcja>

        <Sekcja kolor="#5A3542" tytul="Godziny MGR funkcyjne (ręcznie)" ikona={Clock}>
          <p className="text-sm mb-3" style={{ color: colors.primary.light }}>Jak wyżej, dodatkowo „wg schematu" — np. 8 h w każdy poniedziałek. Ręcznie dodane: <b>{p.funkManual.toFixed(1)} h</b> ({Object.keys((data.planowanie[ym] || {}).mgrFunk || {}).length} dni).</p>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Godziny</label><input type="number" value={funkH} onChange={e => setFunkH(e.target.value)} className="w-24 px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Dzień</label><select value={funkDate} onChange={e => setFunkDate(e.target.value)} className="px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}>{dni.map(d => <option key={d} value={d}>{d.slice(5)}</option>)}</select></div>
            <Btn variant="secondary" onClick={() => data.applyGodziny(ym, 'mgrFunk', 'day', funkH, funkDate)}>Ten dzień</Btn>
            <Btn onClick={() => data.applyGodziny(ym, 'mgrFunk', 'month', funkH)}>Cały miesiąc</Btn>
            <Btn variant="secondary" onClick={() => data.clearGodziny(ym, 'mgrFunk')}>Wyczyść</Btn>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: colors.primary.bgLight }}>
            <p className="text-xs mb-2" style={{ color: colors.primary.dark }}>Schemat — wybierz dni tygodnia, potem „Wg schematu":</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {dniTyg.map(([lbl, val]) => {
                const on = wd.includes(val);
                return <button key={val} onClick={() => setWd(w => on ? w.filter(x => x !== val) : [...w, val])} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ backgroundColor: on ? colors.primary.medium : 'white', color: on ? 'white' : colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>{lbl}</button>;
              })}
            </div>
            <Btn onClick={() => { if (!wd.length) { data.show('Zaznacz dni tygodnia', 'error'); return; } data.applyGodziny(ym, 'mgrFunk', 'schemat', funkH, null, wd); }}>Wg schematu ({wd.length} dni tyg.)</Btn>
          </div>
        </Sekcja>
      </div>
    </div>
  );
};

