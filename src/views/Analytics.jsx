import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, ChevronRight, CircleDollarSign, Clock3, Download, Gauge, RefreshCw, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react';
import { api } from '../lib/api.js';
import { zakresOkresu, dostepneMiesiace, najnowszyMiesiac, agregujMiesiace, podsumujOkres, zamkniecieKart, profilTygodnia, csvOkresu, etykietaOkresu } from '../analytics/period.js';
import { MHead, MMetric } from '../ui/primitives.jsx';
// ── Analizy i raporty → Wyniki i produktywność ──
export const AnalyticsPage = ({ data, setPage }) => {
  const [snaps, setSnaps] = useState([]);
  const [cronOk, setCronOk] = useState(false);
  const [snapBlad, setSnapBlad] = useState(null);
  const zaladujSnaps = () => { setSnapBlad(null); return api('/kpi?days=30').then((r) => { if (r && r.success) { setSnaps(r.snapshots || []); setCronOk(!!r.cronSkonfigurowany); } else setSnapBlad((r && r.error) || 'Serwer nie zwrócił snapshotów KPI'); }).catch((e) => setSnapBlad(e && e.message ? e.message : 'Brak połączenia z API')); };
  useEffect(() => { zaladujSnaps(); }, []);
  // okres: jeden miesiąc albo 12 miesięcy kalendarzowych kończących się na najnowszym miesiącu z danymi
  const salesMap = ((data.salesData || {}).sales) || {};
  const dostepne = useMemo(() => dostepneMiesiace(data.shifts, salesMap), [data.shifts, data.salesData]);
  const [tryb, setTryb] = useState('r12');
  const [miesiac, setMiesiac] = useState(() => najnowszyMiesiac(data.shifts, salesMap) || '');
  useEffect(() => { if (!miesiac && dostepne.length) setMiesiac(dostepne[dostepne.length - 1]); }, [dostepne.length]);
  const okres = useMemo(() => zakresOkresu({ tryb, miesiac, shifts: data.shifts, sales: salesMap }), [tryb, miesiac, data.shifts, data.salesData]);
  const przeliczSnaps = async () => { const r = await api('/kpi-nightly?job=nightly&days=7'); if (r && r.success) { data.show(`Przeliczono ${r.dni} dni`); zaladujSnaps(); } else data.show((r && r.error) || 'Błąd przeliczenia', 'error'); };
  const konta = data.accounts || [];
  const poIdA = new Map(konta.map((a2) => [a2.id, a2]));
  const poNazA = new Map(konta.flatMap((a2) => [a2.grafikName, a2.name, ...(a2.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a2])));
  const kontoZA = (x) => poIdA.get(x.accountId) || poNazA.get(String(x.name || '').toUpperCase().trim()) || null;
  const MGRA = new Set(['RGM', 'ASM']);
  const FUNKA = new Set(['SM', 'JSM']);

  const agreg = useMemo(() => agregujMiesiace({ shifts: data.shifts, sales: salesMap, months: okres, kontoZ: kontoZA }), [data.shifts, data.salesData, konta, okres]);
  const pod = useMemo(() => podsumujOkres(agreg), [agreg]);
  const sumS = pod.sprzedaz, sumK = pod.koszt, sumH = pod.h, colR = pod.col, splh = pod.splh;
  const maxS = Math.max(1, ...agreg.map(([, o]) => o.sprzedaz || 0));
  const colD = agreg.map(([, o]) => o.sprzedaz ? o.koszt / o.sprzedaz * 100 : null);
  const colMin = Math.min(...colD.filter((v) => v != null), 15), colMax = Math.max(...colD.filter((v) => v != null), 30);
  const mcL = (k) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][Number(k.slice(5, 7)) - 1];
  const fmtA = (n) => Math.round(n).toLocaleString('pl-PL');

  const zk = useMemo(() => zamkniecieKart({ shifts: data.shifts, completed: ((data.ts || {}).completed) || {}, months: okres }), [data.shifts, data.ts, okres]);
  const dniComp = zk.dniComp, dniZmian = zk.dniZmian, zgodnosc = zk.pct;   // „zamknięcie kart czasu” — udział dni okresu oznaczonych Completed (to nie jest kontrola reguł KP)
  const dniSprzOkres = Object.keys(salesMap).filter((d) => okres.includes(String(d).slice(0, 7))).length;

  const crewS = pod.crew, mgrS = pod.mgr, funkS = pod.funk, szkS = pod.szkol;
  const tot = Math.max(1, crewS + mgrS + funkS + szkS);
  const pc = (v) => `${Math.round(v / tot * 100)}%`;
  const donut = `conic-gradient(#741334 0 ${crewS / tot * 360}deg, #5A3542 ${crewS / tot * 360}deg ${(crewS + mgrS) / tot * 360}deg, #A7465F ${(crewS + mgrS) / tot * 360}deg ${(crewS + mgrS + funkS) / tot * 360}deg, #B86D82 ${(crewS + mgrS + funkS) / tot * 360}deg 360deg)`;

  // wnioski heurystyczne z danych
  const dow = profilTygodnia({ shifts: data.shifts, sales: salesMap, months: okres });
  const dniN = ['poniedziałki', 'wtorki', 'środy', 'czwartki', 'piątki', 'soboty', 'niedziele'];
  const najdrozszy = dow.map((o, i) => ({ i, r: o.s ? o.h / o.s * 1000 : 0 })).filter((x) => x.r).sort((a2, b2) => b2.r - a2.r)[0];
  const wnioski = [
    najdrozszy ? [`Przejrzyj obsadę w ${dniN[najdrozszy.i]}`, `najwyższy stosunek godzin do sprzedaży w okresie`, `Potencjał: obniżenie COL`, 'save'] : ['Uzupełnij dane sprzedaży', 'import w Administracji → Import i eksport lub w Modelu popytu', 'Odblokuje analizę COL', 'save'],
    [`Szkolenia: ${szkS.toFixed(0)} h w okresie`, szkS ? 'sprawdź rozliczenie par instruktor–uczeń' : 'brak godzin szkoleniowych', `${pc(szkS)} wszystkich godzin`, 'skill'],
    [zgodnosc < 100 ? 'Domknij karty czasu' : 'Karty czasu domknięte', `${dniComp}/${dniZmian} dni grafiku w okresie oznaczonych Completed`, `Zamknięcie kart: ${zgodnosc}%`, 'forecast'],
  ];

  const eksport = () => {
    const blob = new Blob(['\ufeff' + csvOkresu(agreg)], { type: 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(blob); const a2 = document.createElement('a'); a2.href = u; a2.download = `analityka-pracy-${tryb === 'r12' ? 'R12-' + okres[okres.length - 1] : okres[0]}.csv`; a2.click(); URL.revokeObjectURL(u);
  };
  const kosztInfo = [pod.bezStawki ? `${pod.bezStawki} zmian bez stawki/konta` : null, pod.mieszBezSprz ? `${pod.mieszBezSprz} mies. bez sprzedaży` : null].filter(Boolean).join(' • ');

  return (
    <div className="flex-1 overflow-y-auto"><div className="page-wrap module-view analytics-view" style={{ width: '100%' }}>
      <MHead kicker={`ANALIZY I RAPORTY • ${tryb === 'r12' ? '12 MIESIĘCY KALENDARZOWYCH' : 'MIESIĄC'} • ${etykietaOkresu(okres)}`} title="Wyniki i produktywność" copy="Koszt pracy (szacunek), produktywność, struktura godzin i kompletność danych — wykresy, KPI i CSV liczone dla tego samego okresu.">
        <div className="analytics-period" role="group" aria-label="Okres">
          <button className={tryb === 'miesiac' ? 'active' : ''} onClick={() => setTryb('miesiac')}>Miesiąc</button>
          <button className={tryb === 'r12' ? 'active' : ''} onClick={() => setTryb('r12')}>12 miesięcy</button>
          {tryb === 'miesiac' && <select value={miesiac} onChange={(e) => setMiesiac(e.target.value)} aria-label="Miesiąc">{(dostepne.length ? dostepne : [miesiac]).map((k) => <option key={k} value={k}>{k}</option>)}</select>}
        </div>
        <button className="secondary-action" onClick={() => setPage('prognoza-miesiaca')}><Calendar size={16} /> Prognoza miesiąca</button>
        <button className="primary-action" onClick={eksport}><Download size={16} /> Eksport CSV</button>
      </MHead>
      <section className="analytics-kpis">
        <MMetric icon={CircleDollarSign} label={tryb === 'r12' ? 'COL 12 mies. (szacunek)' : 'COL miesiąca (szacunek)'} value={colR != null ? `${colR.toFixed(1).replace('.', ',')}%` : '—'} helper={colR != null ? `koszt / sprzedaż${kosztInfo ? ' • ' + kosztInfo : ''}` : 'brak danych sprzedaży w okresie'} tone="mint" />
        <MMetric icon={Gauge} label="SPLH" value={splh != null ? `${Math.round(splh)} zł` : '—'} helper={splh != null ? 'sprzedaż / roboczogodzina' : 'wymaga sprzedaży i godzin w okresie'} tone="blue" />
        <MMetric icon={Clock3} label="Godziny (okres)" value={`${fmtA(sumH)} h`} helper={`${pod.mieszDane} z ${okres.length} mies. z danymi`} tone="violet" />
        <MMetric icon={ShieldCheck} label="Zamknięcie kart czasu" value={`${zgodnosc}%`} helper={dniZmian ? `${dniComp}/${dniZmian} dni grafiku w okresie` : 'brak dni z grafikiem w okresie'} tone="mint" />
      </section>
      <section className="analytics-grid">
        <article className="panel performance-chart">
          <div className="panel-title"><div><span>SPRZEDAŻ VS COST OF LABOUR</span><h2>Wzrost przy malejącym udziale kosztu</h2></div><div className="forecast-legend"><span><i className="sales-key" />Sprzedaż tys.</span><span><i className="hours-key" />COL %</span></div></div>
          <div className="dual-chart">
            {agreg.map(([k, o], i) => (
              <div key={k} title={`${k}: ${fmtA(o.sprzedaz || 0)} zł • COL ${colD[i] != null ? colD[i].toFixed(1) : '—'}%`}>
                <i style={{ height: `${(o.sprzedaz || 0) / maxS * 100}%` }} />
                {colD[i] != null && <b style={{ bottom: `${((colD[i] - colMin) / Math.max(1, colMax - colMin)) * 80 + 8}%` }} />}
                {i % 2 === 0 && <span>{mcL(k)}</span>}
              </div>
            ))}
          </div>
          <div className="chart-callout"><TrendingUp size={17} /><span>{sumS ? `Sprzedaż ${fmtA(sumS)} zł w okresie, COL ${colR.toFixed(1).replace('.', ',')}%.` : 'Zaimportuj sprzedaż, aby zobaczyć pełny obraz COL.'}</span></div>
        </article>
        <article className="panel insights-panel">
          <div className="panel-title"><div><span>WNIOSKI</span><h2>Co warto zrobić</h2></div><Sparkles size={20} /></div>
          {wnioski.map(([title, detail, impact, tone]) => <button className="insight-item" key={title} onClick={() => setPage(tone === 'save' ? 'forecast' : tone === 'skill' ? 'wt' : 'wt')}><i className={tone}><Sparkles size={16} /></i><div><strong>{title}</strong><span>{detail}</span><em>{impact}</em></div><ChevronRight size={17} /></button>)}
        </article>
        <article className="panel category-cost-panel">
          <div className="panel-title"><div><span>KOSZT WEDŁUG GRUP • SZACUNEK</span><h2>Struktura roboczogodzin</h2></div><strong title={`Szacunek: UZ = stawka × h, UOP = wynagrodzenie / 160 h × h. ${kosztInfo || 'komplet stawek'}`}>{fmtA(sumK)} zł</strong></div>
          <div className="donut-layout">
            <div className="cost-donut" style={{ background: donut }}><div><strong>{fmtA(sumH)} h</strong><span>total</span></div></div>
            <div>{[['Crew', pc(crewS), '#741334'], ['Manager', pc(mgrS), '#5A3542'], ['Mgr funkcyjny', pc(funkS), '#A7465F'], ['Szkolenia', pc(szkS), '#B86D82']].map(([label, value, color]) => <div className="donut-key" key={label}><span><i style={{ background: color }} />{label}</span><strong>{value}</strong></div>)}</div>
          </div>
        </article>
        <article className="panel forecast-quality-panel">
          <div className="panel-title"><div><span>JAKOŚĆ DANYCH • {etykietaOkresu(okres)}</span><h2>Kompletność okresu</h2></div><em>{zgodnosc}%</em></div>
          {[['Dni z grafikiem', `${dniZmian}`, dniZmian ? 100 : 0], ['Dni ze sprzedażą', `${dniSprzOkres}`, dniZmian ? Math.min(100, dniSprzOkres / dniZmian * 100) : 0], ['Dni Completed', `${dniComp}`, zgodnosc], ['Zmiany ze stawką', `${pod.zmian ? Math.round((pod.zmian - pod.bezStawki) / pod.zmian * 100) : 0}%`, pod.zmian ? (pod.zmian - pod.bezStawki) / pod.zmian * 100 : 0]].map(([label, value, score]) => (
            <div className="quality-row" key={String(label)}><span>{label}</span><div><i style={{ width: `${score}%` }} /></div><strong>{value}</strong></div>
          ))}
        </article>
      </section>
      <article className="panel" style={{ marginTop: 14, padding: 18 }}>
        <div className="panel-title"><div><span>KPI DZIENNE • OSTATNIE 30 DOSTĘPNYCH DNI • NIEZALEŻNIE OD FILTRA OKRESU</span><h2>Dzień po dniu: plan, wykonanie, COL</h2></div><button className="secondary-action" onClick={przeliczSnaps}><RefreshCw size={15} /> Przelicz ostatnie 7 dni</button></div>
        {snapBlad ? <div className="dialog-notice" style={{ marginTop: 10 }}><AlertTriangle size={16} /><span>Nie udało się pobrać KPI dziennych: {snapBlad}.</span><button className="secondary-action" style={{ marginLeft: 'auto' }} onClick={zaladujSnaps}><RefreshCw size={14} /> Ponów</button></div>
        : !snaps.length ? <div className="dialog-empty" style={{ padding: 16 }}>Brak snapshotów. {cronOk ? 'Cron policzy je automatycznie o 03:15.' : 'Ustaw CRON_SECRET w Vercel (zadanie 03:15 UTC) albo przelicz ręcznie.'}</div> : (
          <div className="data-table forecast-table" style={{ marginTop: 10 }}>
            <div className="table-header"><span>Dzień</span><span>Sprzedaż</span><span>Plan h</span><span>Wykonane h</span><span>Koszt plan</span><span>COL plan</span><span>COL actual</span><span>Naruszenia</span></div>
            {snaps.slice(-14).reverse().map((x) => (
              <div className="table-row" key={x.date}>
                <span><b>{x.date.slice(8)}.{x.date.slice(5, 7)}</b><small>{x.completed ? 'Completed' : 'otwarty'}</small></span>
                <span><strong>{x.sprzedaz ? `${x.sprzedaz.toLocaleString('pl-PL')} zł` : '—'}</strong></span>
                <span>{x.planH} h</span><span>{x.actualH ? `${x.actualH} h` : '—'}</span>
                <span>{x.kosztPlan.toLocaleString('pl-PL')} zł</span>
                <span className={x.colPlan != null && x.colPlan > 25 ? 'table-danger' : 'table-good'}>{x.colPlan != null ? `${x.colPlan}%` : '—'}</span>
                <span>{x.colActual != null ? `${x.colActual}%` : '—'}</span>
                <span><em className={x.naruszenia && x.naruszenia.block ? 'status-warning' : 'status-ready'}>{x.naruszenia ? `${x.naruszenia.block} / ${x.naruszenia.warn}` : '—'}</em></span>
              </div>
            ))}
          </div>
        )}
      </article>
    </div></div>
  );
};

