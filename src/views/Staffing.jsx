import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, CheckCircle2, ChevronLeft, ChevronRight, FileSpreadsheet, LayoutGrid, Plus, RefreshCw, Upload, X } from 'lucide-react';
import { NSLOT as V4_NSLOT, addCoverage as v4AddCoverage } from '../planning/timeSlots.js';
import { coverageSummary as v4Coverage, upsample48to96 as v4Up96 } from '../planning/coverageEngine.js';
import { api } from '../lib/api.js';
import { SZAB, optKsztaltuj, optRozbicie } from '../lib/demandEngine.js';
import { colors, godzZ, jestInstruktor, kosztGodzin, stationColor, wtMonday, ymd } from '../lib/domain.js';
import { publikujMiesiac } from '../lib/publish.js';
// ── Planowanie → Zapotrzebowanie i obsada ──
// ===================== PLANOWANIE: OPTYMALIZACJA + BUDŻET w jednym module =====================
// ═════════ Planowanie obsady — integracja: prognoza (/forecast) → popyt 15 min (silnik 48/96)
// → obsada z grafiku → KPI/koszty kont → heatmapa i Gantt → Smart Scheduler → publikacja ═════════
const POB_MIN = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const pobOp = (t) => { let x = POB_MIN(t) - 360; if (x < 0) x += 1440; return x; };
const pobHH = (min) => { const m = ((min + 360) % 1440 + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const pobH1 = (v) => `${(Math.round(v * 10) / 10).toFixed(1).replace('.', ',')} h`;
const pobTydzien = (d) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - dn + 3); const p1 = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return 1 + Math.round(((x - p1) / 86400000 - 3 + ((p1.getUTCDay() + 6) % 7)) / 7); };

export const PlanObsada = ({ data, setPage }) => {
  const dzisIso = ymd(new Date());
  const [weekStart, setWeekStart] = useState(wtMonday(dzisIso));
  const [day, setDay] = useState(dzisIso);
  const [scenariusz, setScenariusz] = useState('bazowy');
  const [fcDni, setFcDni] = useState({});
  const [pubInfo, setPubInfo] = useState({});
  const [porownaj, setPorownaj] = useState(false);
  const [slotSel, setSlotSel] = useState(null);
  const [rekomOn, setRekomOn] = useState(true);
  const [propozycje, setPropozycje] = useState(null);
  const [modal, setModal] = useState(null);          // { date, start, end, station, osoba }
  const [dyspo, setDyspo] = useState([]);
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return ymd(d); }), [weekStart]);
  useEffect(() => { if (!days.includes(day)) setDay(days.includes(dzisIso) ? dzisIso : days[0]); }, [weekStart]);

  // dane zewnętrzne modułu: prognoza sprzedaży, stan publikacji, zatwierdzone dyspozycje
  useEffect(() => {
    api(`/forecast?from=${weekStart}&days=7`).then((r) => { if (r && r.success) { const m = {}; (r.days || []).forEach((x) => { m[x.date] = x.forecast; }); setFcDni(m); } }).catch(() => {});
    api('/availability?reqs=1').then((r) => { if (r && r.success) setDyspo((r.requests || []).filter((x) => x.status === 'approved')); }).catch(() => {});
  }, [weekStart]);
  const mieszki = useMemo(() => [...new Set(days.map((d) => d.slice(0, 7)))], [days]);
  const zaladujPub = useCallback(() => { mieszki.forEach((ym) => { api(`/schedule?action=pubinfo&pubmonth=${ym}`).then((r) => { if (r && r.success) setPubInfo((x) => ({ ...x, [ym]: r })); }).catch(() => {}); }); }, [mieszki]);
  useEffect(zaladujPub, [zaladujPub]);

  const params = (data.salesData && data.salesData.params) || {};
  const splh = params.splh || 420, podloga = params.podloga || 3;
  const mnoznik = scenariusz === 'oszczedny' ? 0.9 : scenariusz === 'bezpieczny' ? 1.1 : 1;

  // silnik dnia: wymagane (48→96) i zaplanowane (96) + podsumowanie slotowe
  const silnikDnia = useCallback((d) => {
    const dow = new Date(d + 'T12:00:00').getDay();
    const sprzedaz = fcDni[d] || 0;
    const tryb = sprzedaz > 0 ? 'silnik' : 'krzywa';
    const { dir, ind } = optRozbicie(sprzedaz, splh, podloga, tryb, dow);
    const req48 = dir.map((v, i) => Math.max(v, ind[i]) * mnoznik);
    const req96 = v4Up96(req48);
    const sch96 = new Float64Array(V4_NSLOT);
    const zmiany = data.shifts.filter((x) => x.date === d && !jestInstruktor(x));
    zmiany.forEach((x) => v4AddCoverage(sch96, x.start, x.end));
    return { req48, req96, sch96, zmiany, pods: v4Coverage(req96, sch96), tryb };
  }, [data.shifts, fcDni, splh, podloga, mnoznik]);

  const dniS = useMemo(() => { const m = {}; days.forEach((d) => { m[d] = silnikDnia(d); }); return m; }, [days, silnikDnia]);
  const D = dniS[day] || silnikDnia(day);

  // KPI tygodnia
  const kontoZm = (x) => (x.accountId && (data.accounts || []).find((a) => a.id === x.accountId)) || null;
  const kpi = useMemo(() => {
    let plan = 0, req = 0, exc = 0, def = 0, koszt = 0, sprzedaz = 0;
    days.forEach((d) => { const S = dniS[d]; if (!S) return; plan += S.zmiany.reduce((a, x) => a + godzZ(x), 0); req += S.pods.requiredH; exc += S.pods.excessH; def += S.pods.deficitH; S.zmiany.forEach((x) => { koszt += kosztGodzin(kontoZm(x), godzZ(x)); }); sprzedaz += fcDni[d] || 0; });
    const score = Math.max(5, Math.min(100, Math.round(100 - Math.min(45, def * 4) - Math.min(30, exc * 1.5))));
    return { plan, req, exc, def, koszt, sprzedaz, splhP: plan ? sprzedaz / plan : 0, colP: sprzedaz ? koszt / sprzedaz * 100 : 0, score };
  }, [days, dniS, fcDni, data.accounts]);

  // konflikty zmian z absencjami / dyspozycjami (zatwierdzonymi)
  const dyObow = (r, d) => r.date === d || (r.recurrence === 'weekly' && r.date <= d && (!r.repeatUntil || r.repeatUntil >= d) && new Date(r.date + 'T12:00:00').getDay() === new Date(d + 'T12:00:00').getDay());
  const konfliktZmiany = (x) => {
    if (!x.accountId) return null;
    const ab = (data.absences || []).find((a) => a.accountId === x.accountId && a.status === 'approved' && a.from <= x.date && x.date <= a.to);
    if (ab) return `absencja (${ab.type}) ${ab.from}–${ab.to}`;
    const dy = dyspo.find((r) => r.accountId === x.accountId && dyObow(r, x.date));
    if (dy) {
      if (dy.type === 'unavailable') return 'dyspozycja: nie może pracować';
      if (dy.type === 'from_time' && POB_MIN(x.start) < POB_MIN(dy.startTime)) return `dyspozycja: może od ${dy.startTime}`;
      if (dy.type === 'until_time' && POB_MIN(x.end) > POB_MIN(dy.endTime)) return `dyspozycja: może do ${dy.endTime}`;
      if (dy.type === 'specific_shift' && (POB_MIN(x.start) < POB_MIN(dy.startTime) || POB_MIN(x.end) > POB_MIN(dy.endTime))) return `dyspozycja: preferuje ${dy.startTime}–${dy.endTime}`;
    }
    return null;
  };

  // zakresy niedoboru/nadmiaru (na siatce 96)
  const zakresy = (warunek) => {
    const out = []; let a = -1;
    for (let i = 0; i < V4_NSLOT; i++) {
      const ok = warunek(D.pods.perSlot[i]);
      if (ok && a < 0) a = i;
      if ((!ok || i === V4_NSLOT - 1) && a >= 0) { const b = ok ? i + 1 : i; if (b - a >= 2) out.push({ od: a, do: b, h: D.pods.perSlot.slice(a, b).reduce((x, y) => x + (warunek === undefined ? 0 : Math.abs(y.req - y.sch)), 0) / 4 }); a = -1; }
    }
    return out;
  };
  const niedobory = useMemo(() => zakresy((sl2) => sl2.def > 0.4).sort((a, b) => b.h - a.h), [D]);
  const nadmiary = useMemo(() => zakresy((sl2) => sl2.req > 0 && sl2.exc > 0.6).sort((a, b) => b.h - a.h), [D]);
  const konflikty = useMemo(() => D.zmiany.map((x) => ({ x, k: konfliktZmiany(x) })).filter((z) => z.k), [D, dyspo, data.absences]);

  // optymalizator: dokładanie szablonów na rezydualny niedobór (istniejący silnik optKsztaltuj)
  const uruchomOptymalizator = () => {
    const rez = D.req48.map((v, i) => Math.max(0, v - (D.sch96[i * 2] + D.sch96[i * 2 + 1]) / 2));
    const wl = Object.fromEntries(SZAB.map((t) => [t.n, true]));
    const { out } = optKsztaltuj(rez, wl);
    setPropozycje(out.map((c) => ({ n: c.t.n, od: `${String(c.t.od % 24).padStart(2, '0')}:00`, do: `${String(c.t.do % 24).padStart(2, '0')}:00`, h: c.t.do - c.t.od })));
  };

  // publikacja + status
  const wszystkieOpublikowane = mieszki.every((ym) => pubInfo[ym] && pubInfo[ym].opublikowany && pubInfo[ym].roznice && pubInfo[ym].roznice.razem === 0);
  const opublikuj = async () => {
    if (!confirm(`Opublikować grafik (${mieszki.join(', ')})? Pracownicy zobaczą nową wersję, potwierdzenia wyzerują się.`)) return;
    setBusy(true);
    for (const ym of mieszki) { const r = await publikujMiesiac(ym); if (r.success) data.show(`Opublikowano ${ym} — wersja ${r.wersjaPub}`); else if (!String(r.error || '').includes('żadnych zmian')) data.show(r.error || 'Błąd publikacji', 'error'); }
    setBusy(false); zaladujPub();
  };

  // gantt: wiersze per osoba
  const wiersze = useMemo(() => {
    const m = new Map();
    D.zmiany.forEach((x) => { const k = kontoZm(x); const id = x.accountId || `n:${x.name}`; if (!m.has(id)) m.set(id, { id, name: (k && k.name) || x.name, rola: (k && k.funkcja) || '—', zm: [] }); m.get(id).zm.push(x); });
    return [...m.values()].sort((a, b) => POB_MIN(a.zm[0].start) - POB_MIN(b.zm[0].start) || a.name.localeCompare(b.name, 'pl'));
  }, [D]);
  const otwarte = niedobory.slice(0, 3).map((z) => ({ od: pobHH(z.od * 15), do: pobHH(z.do * 15), h: (z.do - z.od) / 4 }));

  const zapiszModal = async () => {
    if (!modal || !modal.osoba || !modal.osoba.trim()) return data.show('Podaj pracownika', 'error');
    const konto = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((n) => String(n).toUpperCase().trim() === modal.osoba.trim().toUpperCase()));
    setBusy(true);
    const ok = await data.addShiftManual({ date: modal.date, name: modal.osoba.trim(), station: modal.station, start: modal.start, end: modal.end, accountId: konto ? konto.id : undefined });
    setBusy(false); if (ok) setModal(null);
  };
  const skroc = async (z) => {
    const nowyKoniec = pobHH(z.zakres.od * 15);
    if (!confirm(`Skrócić zmianę ${z.osoba} do ${nowyKoniec}? (nadmiar ${pobH1(z.zakres.h)})`)) return;
    await data.updateShiftManual({ sid: z.x.sid, date: z.x.date, name: z.x.name, start: z.x.start, end: z.x.end }, { end: nowyKoniec });
  };
  // dopasuj zmianę do skrócenia: kończy się wewnątrz największego nadmiaru
  const doSkrocenia = useMemo(() => {
    for (const zak of nadmiary) {
      const kand = D.zmiany.filter((x) => { const e = pobOp(x.end) / 15; return e > zak.od && e <= zak.do + 1 && (pobOp(x.end) - pobOp(x.start)) / 60 - (zak.do - zak.od) / 4 >= 3; })
        .sort((a, b) => pobOp(b.end) - pobOp(a.end))[0];
      if (kand) { const k = kontoZm(kand); return { x: kand, osoba: (k && k.name) || kand.name, zakres: zak }; }
    }
    return null;
  }, [nadmiary, D]);

  const stacje = useMemo(() => [...new Set(['MANAGER', 'MGR FUNKCYJNE', ...data.shifts.map((x) => x.station)])].filter(Boolean), [data.shifts]);
  const maxY = Math.max(4, ...D.req96, ...D.sch96);
  const dayLabel = (d) => { const dt = new Date(d + 'T12:00:00'); return { dn: ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'][dt.getDay()], nr: `${dt.getDate()} ${['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'][dt.getMonth()]}` }; };
  const KPI_KARTA = ({ label, val, sub, kol }) => (
    <div className="bg-white rounded-2xl border p-4 min-w-0" style={{ borderColor: '#E3DCDD' }}>
      <p className="text-[11px] font-semibold" style={{ color: colors.primary.light }}>{label}</p>
      <p className="text-[22px] font-bold mt-1 leading-none" style={{ color: kol || colors.primary.darkest }}>{val}</p>
      <p className="text-[10.5px] mt-1.5 truncate" style={{ color: '#71656A' }}>{sub}</p>
    </div>
  );
  const tydzienLabel = `${days[0].slice(8)}–${days[6].slice(8)} ${['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'][new Date(days[6] + 'T12:00:00').getMonth()]} ${days[6].slice(0, 4)}`;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-8" style={{ backgroundColor: '#F7F5F5' }}>
      {/* nagłówek */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] font-extrabold tracking-[0.14em]" style={{ color: '#741334' }}>WORKRHYTHM PLANNING · TYDZIEŃ {pobTydzien(new Date(weekStart))}</p>
          <h1 className="text-[30px] font-bold mt-1" style={{ color: colors.primary.darkest, letterSpacing: '-.03em' }}>Planowanie obsady</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.primary.light }}>Układaj grafik w oparciu o popyt, kompetencje i koszt pracy.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage('import')} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold flex items-center gap-2" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}><Upload size={15} /> Importuj</button>
          <button onClick={() => setPorownaj((v) => !v)} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold flex items-center gap-2" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}><RefreshCw size={15} /> Porównaj</button>
          <button onClick={opublikuj} disabled={busy} className="px-4 h-10 rounded-xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: colors.primary.darkest }}><CheckCircle2 size={15} /> Opublikuj grafik</button>
        </div>
      </div>

      {/* pasek tygodnia + scenariusz */}
      <div className="bg-white rounded-2xl border px-4 py-3 mb-4 flex flex-wrap items-center gap-3" style={{ borderColor: '#E3DCDD' }}>
        <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(ymd(d)); }} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: '#E3DCDD' }}><ChevronLeft size={16} /></button>
        <span className="flex items-center gap-2 text-[15px] font-bold" style={{ color: colors.primary.darkest }}><Calendar size={16} style={{ color: colors.primary.medium }} /> {tydzienLabel}</span>
        <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(ymd(d)); }} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: '#E3DCDD' }}><ChevronRight size={16} /></button>
        <button onClick={() => { setWeekStart(wtMonday(dzisIso)); setDay(dzisIso); }} className="px-3 h-9 rounded-xl border text-sm font-semibold" style={{ borderColor: '#E3DCDD', color: colors.primary.dark }}>Dzisiaj</button>
        <span className="ml-auto flex items-center gap-2 text-xs" style={{ color: colors.primary.light }}>
          Scenariusz
          <select value={scenariusz} onChange={(e) => setScenariusz(e.target.value)} className="px-3 h-9 rounded-xl border text-sm font-semibold" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}>
            <option value="bazowy">Bazowy · zbalansowany</option>
            <option value="oszczedny">Oszczędny · −10% popytu</option>
            <option value="bezpieczny">Bezpieczny · +10% popytu</option>
          </select>
          <span className="px-3 h-9 rounded-xl border text-xs font-bold flex items-center gap-1.5" style={{ borderColor: '#E3DCDD', color: wszystkieOpublikowane ? '#741334' : '#A7465F', backgroundColor: wszystkieOpublikowane ? '#F1E4E8' : '#fff6e4' }}>
            <i className="w-2 h-2 rounded-full" style={{ backgroundColor: wszystkieOpublikowane ? '#741334' : '#B86D82' }} />{wszystkieOpublikowane ? 'Published' : 'Preliminary'}
          </span>
        </span>
      </div>
      {porownaj && (
        <div className="bg-white rounded-2xl border px-4 py-3 mb-4 text-sm flex flex-wrap gap-x-6 gap-y-1" style={{ borderColor: '#E3DCDD', color: colors.primary.dark }}>
          {mieszki.map((ym) => { const pi = pubInfo[ym]; return <span key={ym}><b>{ym}</b>: {pi ? (pi.opublikowany ? `v${pi.wersjaPub} · potwierdzenia ${(pi.potwierdzenia || []).length}/${pi.osobOczekiwane}${pi.roznice ? ` · zmiany od publikacji +${pi.roznice.dodane}/±${pi.roznice.zmienione}/−${pi.roznice.usuniete}` : ''}` : 'nieopublikowany') : '…'}</span>; })}
        </div>
      )}

      {/* KPI */}
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <KPI_KARTA label="Plan Hours" val={pobH1(kpi.plan)} sub={`${kpi.plan - kpi.req >= 0 ? '+' : ''}${pobH1(kpi.plan - kpi.req)} vs Required`} />
        <KPI_KARTA label="Required Hours" val={pobH1(kpi.req)} sub="prognoza slotowa" />
        <KPI_KARTA label="Excess" val={pobH1(kpi.exc)} sub={`${kpi.plan ? (kpi.exc / kpi.plan * 100).toFixed(1).replace('.', ',') : 0}% godzin`} kol="#A7465F" />
        <KPI_KARTA label="Deficit" val={pobH1(kpi.def)} sub={`${niedobory.length} krytyczne sloty (dzień)`} kol="#B94352" />
        <KPI_KARTA label="SPLH" val={kpi.splhP ? Math.round(kpi.splhP).toLocaleString('pl-PL') : '—'} sub={`cel ${splh}`} />
        <KPI_KARTA label="COL" val={kpi.colP ? `${kpi.colP.toFixed(1).replace('.', ',')}%` : '—'} sub="target ≤ 20%" kol={kpi.colP > 20 ? '#B94352' : '#741334'} />
        <KPI_KARTA label="Labor Cost" val={`${Math.round(kpi.koszt).toLocaleString('pl-PL')} zł`} sub="wg stawek kont" />
        <KPI_KARTA label="Schedule Score" val={kpi.score} sub={kpi.score >= 85 ? 'Dobry plan' : kpi.score >= 70 ? 'Do poprawy' : 'Wymaga zmian'} kol={kpi.score >= 85 ? '#741334' : kpi.score >= 70 ? '#A7465F' : '#B94352'} />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: rekomOn ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr)' }}>
        <div className="min-w-0 space-y-4">
          {/* wykres Demand vs Coverage */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E3DCDD' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <div><p className="text-[15px] font-bold" style={{ color: colors.primary.darkest }}>Demand vs Coverage</p><p className="text-[11px]" style={{ color: colors.primary.light }}>wymagana i zaplanowana obsada · interwał 15 min · {day} {D.tryb === 'krzywa' ? '· krzywa (brak prognozy sprzedaży)' : ''}</p></div>
              <span className="flex items-center gap-4 text-[11px]" style={{ color: colors.primary.dark }}>
                <span className="flex items-center gap-1.5"><i className="w-4 h-0.5" style={{ backgroundColor: '#5A3542' }} /> Required</span>
                <span className="flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed" style={{ borderColor: '#A7465F' }} /> Scheduled</span>
                <button onClick={() => setPage('optymalizacja')} className="px-3 h-8 rounded-lg border text-xs font-bold" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}>Parametry popytu</button>
              </span>
            </div>
            <svg viewBox="0 0 970 190" className="w-full" style={{ height: 180 }}>
              {[0, 0.5, 1].map((f) => <line key={f} x1="30" x2="960" y1={165 - f * 150} y2={165 - f * 150} stroke="#EDE3E6" />)}
              {[0, 0.5, 1].map((f) => <text key={f} x="24" y={168 - f * 150} fontSize="9" fill="#A38D95" textAnchor="end">{Math.round(maxY * f)}</text>)}
              <polygon points={`30,165 ${[...D.req96].map((v, i) => `${30 + i * 9.7},${165 - v / maxY * 150}`).join(' ')} 960,165`} fill="rgba(116,19,52,.12)" />
              <polyline points={[...D.req96].map((v, i) => `${30 + i * 9.7},${165 - v / maxY * 150}`).join(' ')} fill="none" stroke="#5A3542" strokeWidth="2" />
              <polyline points={[...D.sch96].map((v, i) => `${30 + i * 9.7},${165 - v / maxY * 150}`).join(' ')} fill="none" stroke="#A7465F" strokeWidth="2" strokeDasharray="5 4" />
              {[0, 12, 24, 36, 48, 60, 72, 84, 95].map((i) => <text key={i} x={30 + i * 9.7} y="182" fontSize="9" fill="#A38D95" textAnchor="middle">{pobHH(i * 15)}</text>)}
            </svg>
            {/* heatmapa pokrycia */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[12px] font-bold" style={{ color: colors.primary.darkest }}>Coverage heatmap <span className="font-normal text-[10.5px]" style={{ color: colors.primary.light }}>· kliknij slot, aby zobaczyć szczegóły</span></p>
                <span className="flex items-center gap-3 text-[10.5px]" style={{ color: colors.primary.dark }}><span className="flex items-center gap-1"><i className="w-3 h-2.5 rounded" style={{ backgroundColor: '#A7465F' }} /> Pokrycie</span><span className="flex items-center gap-1"><i className="w-3 h-2.5 rounded" style={{ backgroundColor: '#B86D82' }} /> Nadmiar</span><span className="flex items-center gap-1"><i className="w-3 h-2.5 rounded" style={{ backgroundColor: '#B94352' }} /> Niedobór</span></span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 24 }, (_, h) => {
                  let req = 0, sch = 0; for (let i = h * 4; i < h * 4 + 4; i++) { req += D.pods.perSlot[i].req; sch += D.pods.perSlot[i].sch; }
                  const st2 = req - sch > 1 ? '#B94352' : sch - req > 2 && req > 0 ? '#B86D82' : '#A7465F';
                  return <button key={h} onClick={() => setSlotSel({ h, req: req / 4, sch: sch / 4 })} className="flex-1 h-5 rounded" title={`${pobHH(h * 60)}–${pobHH(h * 60 + 60)}`} style={{ backgroundColor: st2, outline: slotSel && slotSel.h === h ? `2px solid ${colors.primary.darkest}` : 'none' }} />;
                })}
              </div>
              {slotSel && <p className="text-[11.5px] mt-1.5" style={{ color: colors.primary.dark }}>Slot <b>{pobHH(slotSel.h * 60)}–{pobHH(slotSel.h * 60 + 60)}</b>: wymagane <b>{slotSel.req.toFixed(1).replace('.', ',')}</b> · plan <b>{slotSel.sch.toFixed(1).replace('.', ',')}</b> · {slotSel.req > slotSel.sch ? <span style={{ color: '#B94352' }}>niedobór {(slotSel.req - slotSel.sch).toFixed(1).replace('.', ',')}</span> : <span style={{ color: '#741334' }}>OK</span>} · na zmianie: {D.zmiany.filter((x) => { const a = pobOp(x.start), b = pobOp(x.end) <= a ? pobOp(x.end) + 1440 : pobOp(x.end); return a < (slotSel.h + 1) * 60 && b > slotSel.h * 60; }).map((x) => (kontoZm(x) || { name: x.name }).name.split(' ')[0]).join(', ') || '—'}</p>}
            </div>
          </div>

          {/* zakładki dni */}
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E3DCDD' }}>
            <div className="flex items-center border-b" style={{ borderColor: '#EDE3E6' }}>
              {days.map((d) => { const L = dayLabel(d); const S = dniS[d]; const zle = S && S.pods.deficitH > 0.5; return (
                <button key={d} onClick={() => { setDay(d); setSlotSel(null); setPropozycje(null); }} className="relative flex-1 px-2 py-2.5 text-center border-r last:border-0" style={{ borderColor: '#EDE3E6', backgroundColor: day === d ? '#F7F5F5' : 'white', borderBottom: day === d ? `3px solid ${colors.primary.darkest}` : '3px solid transparent' }}>
                  {zle && <i className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#B94352' }} />}
                  <p className="text-[11px] font-semibold" style={{ color: colors.primary.light }}>{L.dn}</p>
                  <p className="text-[13px] font-bold" style={{ color: colors.primary.darkest }}>{L.nr}</p>
                </button>
              ); })}
              <div className="px-4 text-[11.5px] whitespace-nowrap hidden xl:block" style={{ color: colors.primary.light }}>
                Required <b style={{ color: colors.primary.darkest }}>{pobH1(D.pods.requiredH)}</b> · Plan <b style={{ color: colors.primary.darkest }}>{pobH1(D.pods.scheduledH)}</b> · Coverage <b style={{ color: D.pods.coveragePct >= 95 ? '#741334' : '#A7465F' }}>{Math.round(D.pods.coveragePct)}%</b>
              </div>
            </div>
            <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b" style={{ borderColor: '#EDE3E6' }}>
              <button onClick={() => setModal({ date: day, start: '08:00', end: '16:00', station: stacje[0], osoba: '' })} className="px-4 h-10 rounded-xl text-sm font-bold text-white flex items-center gap-2" style={{ backgroundColor: colors.primary.darkest }}><Plus size={15} /> Dodaj zmianę</button>
              <button onClick={() => { setPage('wt'); }} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold flex items-center gap-2" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}><FileSpreadsheet size={15} /> Szablon dnia</button>
              <button onClick={() => setRekomOn((v) => !v)} className="ml-auto px-4 h-10 rounded-xl text-sm font-bold flex items-center gap-2" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>{rekomOn ? 'Ukryj rekomendacje' : 'Pokaż rekomendacje'}</button>
            </div>
            {/* gantt */}
            <div className="overflow-x-auto">
              <div style={{ minWidth: 860 }}>
                <div className="flex border-b" style={{ borderColor: '#EDE3E6' }}>
                  <div className="w-56 shrink-0 px-4 py-2 text-[10.5px] font-extrabold tracking-wide" style={{ color: colors.primary.light }}>PRACOWNIK / ROLA</div>
                  <div className="relative flex-1 h-7">{Array.from({ length: 12 }, (_, i) => <span key={i} className="absolute top-1.5 text-[9.5px]" style={{ left: `${i * 2 / 24 * 100}%`, color: '#A38D95' }}>{pobHH(i * 120)}</span>)}</div>
                </div>
                {wiersze.map((w) => (
                  <div key={w.id} className="flex items-stretch border-b last:border-0" style={{ borderColor: '#F7F5F5' }}>
                    <div className="w-56 shrink-0 px-4 py-3 flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>{w.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
                      <div className="min-w-0"><p className="text-[13px] font-bold truncate" style={{ color: colors.primary.darkest }}>{w.name}</p><p className="text-[10.5px] truncate" style={{ color: colors.primary.light }}>{w.rola}{w.zm[0] ? ` · ${w.zm[0].station}` : ''}</p></div>
                      {w.zm.some((x) => konfliktZmiany(x)) && <AlertTriangle size={14} className="shrink-0" style={{ color: '#B94352' }} title={w.zm.map((x) => konfliktZmiany(x)).filter(Boolean).join('; ')} />}
                    </div>
                    <div className="relative flex-1 py-3" style={{ backgroundImage: 'repeating-#F7F5F5' }}>
                      {w.zm.map((x, i) => { const a = pobOp(x.start); let b = pobOp(x.end); if (b <= a) b += 1440; const kfl = konfliktZmiany(x); return (
                        <div key={i} title={`${x.start}–${x.end} · ${x.station}${kfl ? ` · ⚠ ${kfl}` : ''}`} className="absolute h-8 rounded-lg border flex items-center px-2 text-[11px] font-semibold truncate cursor-default" style={{ left: `${a / 1440 * 100}%`, width: `${Math.min(b - a, 1440 - a) / 1440 * 100}%`, top: 8, backgroundColor: kfl ? '#F5E3E8' : stationColor(x.station) + '22', borderColor: kfl ? '#E0B9C4' : stationColor(x.station) + '55', color: kfl ? '#B94352' : colors.primary.darkest, borderLeft: `3px solid ${kfl ? '#B94352' : stationColor(x.station)}` }}>{x.start}–{x.end} · {x.station}{kfl && <AlertTriangle size={11} className="ml-1 shrink-0" />}</div>
                      ); })}
                    </div>
                  </div>
                ))}
                {otwarte.map((o, i) => (
                  <div key={i} className="flex items-stretch border-b last:border-0" style={{ borderColor: '#F7F5F5' }}>
                    <div className="w-56 shrink-0 px-4 py-3 flex items-center gap-2.5">
                      <button onClick={() => setModal({ date: day, start: o.od, end: o.do, station: stacje[0], osoba: '' })} className="w-9 h-9 rounded-full border-2 border-dashed flex items-center justify-center shrink-0" style={{ borderColor: '#C7B4BB', color: '#71656A' }}><Plus size={15} /></button>
                      <div><p className="text-[13px] font-bold" style={{ color: colors.primary.dark }}>Otwarta zmiana</p><p className="text-[10.5px]" style={{ color: '#B94352' }}>niedobór {pobH1(o.h)}</p></div>
                      <AlertTriangle size={14} style={{ color: '#B94352' }} />
                    </div>
                    <div className="relative flex-1 py-3">
                      <button onClick={() => setModal({ date: day, start: o.od, end: o.do, station: stacje[0], osoba: '' })} className="absolute h-8 rounded-lg border-2 border-dashed flex items-center px-2 text-[11px] font-semibold" style={{ left: `${pobOp(o.od) / 1440 * 100}%`, width: `${((pobOp(o.do) <= pobOp(o.od) ? pobOp(o.do) + 1440 : pobOp(o.do)) - pobOp(o.od)) / 1440 * 100}%`, top: 8, borderColor: '#C7A9B3', color: '#A7465F', backgroundImage: 'repeating-#F5ECEF' }}>{o.od}–{o.do} · Nieprzypisana</button>
                    </div>
                  </div>
                ))}
                {!wiersze.length && !otwarte.length && <p className="text-center py-8 text-sm" style={{ color: colors.primary.light }}>Brak zmian i niedoborów w tym dniu.</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Smart Scheduler */}
        {rekomOn && (
          <aside className="space-y-3">
            <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E3DCDD' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-extrabold tracking-[0.12em]" style={{ color: '#741334' }}>⚡ SMART SCHEDULER</p>
                <button onClick={() => setRekomOn(false)} className="w-7 h-7 rounded-lg border flex items-center justify-center" style={{ borderColor: '#E3DCDD' }}><X size={13} /></button>
              </div>
              <p className="text-[16px] font-bold mb-3" style={{ color: colors.primary.darkest }}>Rekomendacje zmian</p>
              <div className="rounded-xl p-3 flex items-center gap-3 mb-3" style={{ backgroundColor: '#F7F5F5' }}>
                <svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="none" stroke="#E3DCDD" strokeWidth="5" /><circle cx="23" cy="23" r="19" fill="none" stroke={kpi.score >= 85 ? '#741334' : kpi.score >= 70 ? '#B86D82' : '#B94352'} strokeWidth="5" strokeDasharray={`${kpi.score / 100 * 119} 119`} strokeLinecap="round" transform="rotate(-90 23 23)" /><text x="23" y="27" fontSize="12" fontWeight="800" textAnchor="middle" fill="#2B171E">{kpi.score}</text></svg>
                <div><p className="text-[13px] font-bold" style={{ color: colors.primary.darkest }}>{kpi.score >= 85 ? 'Dobry plan' : kpi.score >= 70 ? 'Plan do poprawy' : 'Plan wymaga zmian'}</p><p className="text-[11px]" style={{ color: colors.primary.light }}>{(niedobory.length ? 1 : 0) + (doSkrocenia ? 1 : 0) + konflikty.length} sugestie mogą poprawić wynik</p></div>
              </div>
              <div className="space-y-3">
                {niedobory.slice(0, 2).map((z, i) => (
                  <div key={i} className="border rounded-xl p-3" style={{ borderColor: '#E9D6DC' }}>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>{pobHH(z.od * 15)}–{pobHH(z.do * 15)}</span>
                    <p className="text-[13px] font-bold mt-1.5" style={{ color: colors.primary.darkest }}>Uzupełnij niedobór obsady</p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: colors.primary.light }}>Dodaj zmianę pokrywającą ten zakres albo wydłuż sąsiednią.</p>
                    <div className="flex gap-1.5 mt-1.5"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded border" style={{ borderColor: '#eee', color: colors.primary.dark }}>Deficit −{pobH1((z.do - z.od) / 4)}</span></div>
                    <button onClick={() => setModal({ date: day, start: pobHH(z.od * 15), end: pobHH(z.do * 15), station: stacje[0], osoba: '' })} className="text-[12px] font-bold mt-2" style={{ color: '#741334' }}>Dodaj zmianę →</button>
                  </div>
                ))}
                {doSkrocenia && (
                  <div className="border rounded-xl p-3" style={{ borderColor: '#E3DCDD' }}>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#F1E4E8', color: '#A7465F' }}>{pobHH(doSkrocenia.zakres.od * 15)}–{pobHH(doSkrocenia.zakres.do * 15)}</span>
                    <p className="text-[13px] font-bold mt-1.5" style={{ color: colors.primary.darkest }}>Usuń nadmiar obsady</p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: colors.primary.light }}>Skróć zmianę {doSkrocenia.osoba} do {pobHH(doSkrocenia.zakres.od * 15)} — pokrycie pozostanie pełne.</p>
                    <div className="flex gap-1.5 mt-1.5"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded border" style={{ borderColor: '#eee', color: colors.primary.dark }}>Koszt −{Math.round(kosztGodzin(kontoZm(doSkrocenia.x), doSkrocenia.zakres.h))} zł</span><span className="text-[10px] font-bold px-1.5 py-0.5 rounded border" style={{ borderColor: '#eee', color: colors.primary.dark }}>Excess −{pobH1(doSkrocenia.zakres.h)}</span></div>
                    <button onClick={() => skroc(doSkrocenia)} className="text-[12px] font-bold mt-2" style={{ color: '#741334' }}>Zastosuj →</button>
                  </div>
                )}
                {konflikty.slice(0, 2).map((z, i) => (
                  <div key={`k${i}`} className="border rounded-xl p-3" style={{ borderColor: '#E9D6DC' }}>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>{z.x.start}–{z.x.end}</span>
                    <p className="text-[13px] font-bold mt-1.5" style={{ color: colors.primary.darkest }}>Konflikt: {(kontoZm(z.x) || { name: z.x.name }).name}</p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: colors.primary.light }}>{z.k}.</p>
                    <button onClick={() => setPage('dyspo')} className="text-[12px] font-bold mt-2" style={{ color: '#741334' }}>Otwórz dyspozycje →</button>
                  </div>
                ))}
                {!niedobory.length && !doSkrocenia && !konflikty.length && <p className="text-[12px] text-center py-2" style={{ color: colors.primary.light }}>Brak sugestii — plan wygląda dobrze. ✓</p>}
              </div>
              <button onClick={uruchomOptymalizator} className="w-full mt-3 h-11 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2" style={{ backgroundColor: colors.primary.darkest }}><LayoutGrid size={15} /> Uruchom optymalizator</button>
              {propozycje && (
                <div className="mt-3 border-t pt-3" style={{ borderColor: '#EDE3E6' }}>
                  <p className="text-[12px] font-bold mb-2" style={{ color: colors.primary.darkest }}>Propozycje ({propozycje.length}) · {pobH1(propozycje.reduce((a, x) => a + x.h, 0))}</p>
                  {propozycje.length === 0 && <p className="text-[11.5px]" style={{ color: colors.primary.light }}>Popyt jest pokryty — nic nie trzeba dokładać.</p>}
                  {propozycje.map((pr, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor: '#F7F5F5' }}>
                      <span className="text-[11.5px] flex-1" style={{ color: colors.primary.dark }}><b>{pr.od}–{pr.do}</b> · {pr.n}</span>
                      <button onClick={() => setModal({ date: day, start: pr.od, end: pr.do, station: stacje[0], osoba: '' })} className="text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>Użyj</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* modal Dodaj zmianę */}
      {modal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>Dodaj zmianę · {modal.date}</h3><button onClick={() => setModal(null)}><X size={20} className="text-slate-400" /></button></div>
            <div className="space-y-3">
              <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Pracownik</label>
                <input list="pob-konta" value={modal.osoba} onChange={(e) => setModal((m) => ({ ...m, osoba: e.target.value }))} placeholder="wpisz nazwisko…" className="w-full px-3 py-2.5 rounded-lg border" style={{ borderColor: colors.primary.bg }} autoFocus />
                <datalist id="pob-konta">{(data.accounts || []).map((a) => <option key={a.id} value={a.grafikName || a.name}>{a.name}</option>)}</datalist></div>
              <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Stanowisko</label>
                <select value={modal.station} onChange={(e) => setModal((m) => ({ ...m, station: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border" style={{ borderColor: colors.primary.bg }}>{stacje.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Od</label><input type="time" value={modal.start} onChange={(e) => setModal((m) => ({ ...m, start: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
                <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Do</label><input type="time" value={modal.end} onChange={(e) => setModal((m) => ({ ...m, end: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
              </div>
              <p className="text-[11px]" style={{ color: colors.primary.light }}>Planer sprawdzi absencje, dyspozycje, nakładanie i reguły umów (blokady/ostrzeżenia).</p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Anuluj</button>
              <button disabled={busy} onClick={zapiszModal} className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: colors.primary.darkest }}>Dodaj do grafiku</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

