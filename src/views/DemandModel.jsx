import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import * as XLSX from 'xlsx';
import { D3, NS, OC, PIK, S0, SZAB, ZLH, f0, fH1, hmS, optKsztaltuj, optRozbicie, optZapotrzebowanie, sl, toISOdate } from '../lib/demandEngine.js';
import { colors, funkcjaLabel, godzZ, jestInstruktor, kosztGodzin, months, wtDur, wtRel, ymd } from '../lib/domain.js';
import { Header, Sekcja } from '../ui/primitives.jsx';
import { BPBars, BPLine } from './BudgetPlan.jsx';
import { ForecastQuality } from './ForecastQuality.jsx';
// ── Prognozy i estymacja → Model popytu (historia, sezonowość, krzywa dnia, symulacja) ──
const OptKpi = ({ label, value, sub, tone }) => (
  <div className="rounded-xl p-3 bg-white shadow-sm border" style={{ borderColor: colors.primary.bg }}>
    <div className="text-[11px]" style={{ color: colors.primary.light }}>{label}</div>
    <div className="font-mono text-lg mt-0.5" style={{ color: tone || colors.primary.darkest }}>{value}</div>
    {sub && <div className="text-[10px]" style={{ color: "#A38D95" }}>{sub}</div>}
  </div>
);
const OptSuw = ({ label, value, min, max, step, unit, onChange }) => (
  <div>
    <div className="flex items-baseline justify-between"><span className="text-xs font-medium" style={{ color: colors.primary.dark }}>{label}</span><span className="font-mono text-xs" style={{ color: OC.silnik }}>{value.toLocaleString("pl-PL")} {unit}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: OC.silnik }} />
  </div>
);

const OptWidokDnia = ({ dem, kc, cover, shifts }) => {
  const W = 780, PL = 116, cw = (W - PL - 4) / NS;
  const rows = [{ l: "Krzywa celu", a: kc, c: OC.cel }, { l: "Zapotrzebowanie", a: dem, c: OC.silnik }, { l: "Obsada z szablonów", a: cover, c: OC.obsada }];
  const diff = cover.map((c, i) => c - dem[i]);
  const H = 22 * (rows.length + 2) + 12, gH = Math.max(26, shifts.length * 15 + 6);
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 700 }}>
        {[...Array(NS)].map((_, i) => { const h = S0 + Math.floor(i / 2); return PIK.includes(h) ? <rect key={i} x={PL + i * cw} y={0} width={cw} height={8} fill={OC.bad} opacity=".7" /> : null; })}
        <text x={2} y={7} fontSize="7.5" fill="#A38D95">Szczyt 13–20</text>
        {[...Array(NS)].map((_, i) => i % 4 === 0 ? <text key={i} x={PL + i * cw} y={18} fontSize="7" fill="#A38D95">{hmS(i).slice(0, 2)}</text> : null)}
        {rows.map((r, ri) => (<g key={ri}>
          <text x={2} y={22 * (ri + 1) + 17} fontSize="8.5" fill={r.c}>{r.l}</text>
          {r.a.map((v, i) => (<g key={i}>
            <rect x={PL + i * cw} y={22 * (ri + 1) + 7} width={cw - .3} height={13} fill={r.c} opacity={v > 0 ? Math.min(.1 + v * .1, .85) : .04} />
            <text x={PL + i * cw + cw / 2} y={22 * (ri + 1) + 17} fontSize="6.5" textAnchor="middle" fill={v > 3 ? "#fff" : "#A38D95"}>{v > 0 ? v : ""}</text>
          </g>))}
        </g>))}
        <text x={2} y={22 * (rows.length + 1) + 17} fontSize="8.5" fill={colors.primary.darkest}>Różnica</text>
        {diff.map((v, i) => { if (dem[i] === 0 && v === 0) return null; const h = S0 + Math.floor(i / 2), kryt = v < 0 && PIK.includes(h);
          return (<g key={i}>
            <rect x={PL + i * cw} y={22 * (rows.length + 1) + 7} width={cw - .3} height={13} fill={v === 0 ? OC.ok : v > 0 ? OC.warn : kryt ? OC.bad : "#E5A5A0"} opacity={v === 0 ? .18 : .75} />
            <text x={PL + i * cw + cw / 2} y={22 * (rows.length + 1) + 17} fontSize="6.5" textAnchor="middle" fill={v === 0 ? OC.ok : "#fff"}>{v === 0 ? "✓" : v > 0 ? `+${v}` : v}</text>
          </g>); })}
      </svg>
      <svg viewBox={`0 0 ${W} ${gH}`} className="w-full" style={{ minWidth: 700 }}>
        {shifts.map((c, i) => (<g key={i}>
          <rect x={PL + c.s * cw} y={2 + i * 15} width={c.len * cw - 1} height={12} rx="2" fill={c.t.kol} />
          <text x={PL + c.s * cw + 3} y={11 + i * 15} fontSize="7.5" fill="#fff">{c.len * cw > 70 ? c.t.n : ""}</text>
        </g>))}
      </svg>
    </div>
  );
};

// ── P4: jakość prognozy — backtest MAPE/WAPE + korekty dnia z uzasadnieniem ──
export const ForecastPlan = ({ data, setPage }) => {
  const [tab, setTab] = useState("miesiac");
  const hydrated = useRef(false);
  const [mIdx, setMIdx] = useState(new Date().getMonth());   // zawsze bieżący miesiąc na start
  const [yrSel, setYrSel] = useState(new Date().getFullYear());
  const [splh, setSplh] = useState(420);
  const [podloga, setPodloga] = useState(3);
  const [tryb, setTryb] = useState("silnik");
  const [wl, setWl] = useState(() => Object.fromEntries(SZAB.map((t) => [t.n, true])));
  const [dzien, setDzien] = useState(12);
  const [realSales, setRealSales] = useState({});
  const [realChecks, setRealChecks] = useState({});
  const [importInfo, setImportInfo] = useState(null);
  const [korekta, setKorekta] = useState(0);      // ręczna korekta prognozy w %
  const [oknoTyg, setOknoTyg] = useState(8);      // ile tygodni historii bierzemy pod uwagę
  const [limitMies, setLimitMies] = useState(4700);
  const [mgrDoba, setMgrDoba] = useState(32);
  const [szkol, setSzkol] = useState(162);
  const fileRef = useRef(null);

  useEffect(() => {
    if (hydrated.current || !data.salesData) return;
    const sd = data.salesData;
    if (sd.sales && Object.keys(sd.sales).length) {
      setRealSales(sd.sales); setRealChecks(sd.checks || {});
      const ks = Object.keys(sd.sales).sort();
      setImportInfo({ n: ks.length, from: ks[0], to: ks[ks.length - 1], checks: Object.keys(sd.checks || {}).length });
    }
    if (sd.params) { const p = sd.params; if (p.splh) setSplh(p.splh); if (p.podloga) setPodloga(p.podloga); if (p.tryb) setTryb(p.tryb); if (p.limitMies) setLimitMies(p.limitMies); if (p.mgrDoba) setMgrDoba(p.mgrDoba); if (p.szkol != null) setSzkol(p.szkol); if (p.wl) setWl((w) => ({ ...w, ...p.wl })); }
    hydrated.current = true;
  }, [data.salesData]);

  useEffect(() => { if (!hydrated.current) return; data.saveSales({ params: { splh, podloga, tryb, limitMies, mgrDoba, szkol, wl } }); }, [splh, podloga, tryb, limitMies, mgrDoba, szkol, wl]);

  const onImport = async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      const sales = {}, checks = {};
      let secFrom = null, secTo = null;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || [];
        if (!r.some((c) => String(c).trim().toLowerCase() === "business date")) continue;
        const hdr = r.map((c) => String(c || "").toLowerCase());
        const cDate = hdr.findIndex((h) => h.includes("business date"));
        const cGross = hdr.findIndex((h) => h.includes("gross sales"));
        const cChecks = hdr.findIndex((h) => h.includes("checks count"));
        for (let j = i + 1; j < rows.length; j++) {
          const q = rows[j]; if (!q) continue;
          if (String(q[cDate]).trim().toLowerCase() === "business date") break;
          const ds = toISOdate(q[cDate]); if (!ds) continue;
          if (cGross >= 0 && !isNaN(Number(q[cGross]))) sales[ds] = Number(q[cGross]);
          if (cChecks >= 0 && !isNaN(Number(q[cChecks]))) checks[ds] = Number(q[cChecks]);
          if (!secFrom || ds < secFrom) secFrom = ds;
          if (!secTo || ds > secTo) secTo = ds;
        }
      }
      const keys = Object.keys(sales);
      if (!keys.length) { data.show("Nie znaleziono danych sprzedaży w pliku", "error"); return; }
      setRealSales((p) => ({ ...p, ...sales })); setRealChecks((p) => ({ ...p, ...checks }));
      keys.sort(); const last = new Date(keys[keys.length - 1]);
      setImportInfo({ n: keys.length, from: secFrom, to: secTo, checks: Object.keys(checks).length });
      data.saveSales({ sales, checks });
      data.show(`Zaimportowano ${keys.length} dni sprzedaży${Object.keys(checks).length ? " + paragony" : ""}`);
    } catch (e) { data.show("Błąd importu: " + e.message, "error"); }
  };

  const yrShifts = useMemo(() => { const ys = data.shifts.map((s) => +s.date.slice(0, 4)).filter(Boolean); return ys.length ? Math.max(...ys) : new Date().getFullYear(); }, [data.shifts]);
  const year = yrSel || yrShifts;
  // ── SILNIK ESTYMACJI: profil dnia tygodnia z okna historii + trend tygodniowy ──
  const PRED = useMemo(() => {
    const daty = Object.keys(realSales).sort();
    if (!daty.length) return null;
    const ostatnia = daty[daty.length - 1];
    const granica = new Date(ostatnia); granica.setDate(granica.getDate() - oknoTyg * 7);
    const okno = daty.filter((d) => new Date(d) >= granica);
    const uzyte = okno.length ? okno : daty;

    // średnie wg dnia tygodnia w oknie
    const acc = Array.from({ length: 7 }, () => ({ s: 0, n: 0 }));
    uzyte.forEach((d) => { const dw = new Date(d).getDay(); acc[dw].s += realSales[d]; acc[dw].n++; });
    const wd = acc.map((a) => (a.n ? a.s / a.n : null));

    // trend: regresja liniowa na tygodniowych sumach
    const tyg = {};
    uzyte.forEach((d) => { const x = new Date(d); const pon = new Date(x); pon.setDate(x.getDate() - ((x.getDay() + 6) % 7)); const k = ymd(pon); tyg[k] = (tyg[k] || 0) + realSales[d]; });
    const klucze = Object.keys(tyg).sort();
    const pelne = klucze.length > 2 ? klucze.slice(0, -1) : klucze;   // ostatni tydzień bywa niepełny
    let trend = 0, pewnosc = 0;
    if (pelne.length >= 3) {
      const ys = pelne.map((k) => tyg[k]); const n = ys.length;
      const sx = (n - 1) * n / 2, sxx = (n - 1) * n * (2 * n - 1) / 6;
      const sy = ys.reduce((a, b) => a + b, 0), sxy = ys.reduce((a, y, i) => a + i * y, 0);
      const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      const sr = sy / n;
      // Im mniej pełnych tygodni, tym ostrożniej ekstrapolujemy trend (tłumienie).
      pewnosc = Math.max(0, Math.min(1, (n - 2) / 6));
      if (sr > 0 && isFinite(m)) trend = Math.max(-0.03, Math.min(0.03, (m / sr) * pewnosc));
    }
    return { wd, trend, pewnosc, pelneTyg: pelne.length, ostatnia, tygodni: klucze.length, dni: uzyte.length, od: uzyte[0], do: ostatnia };
  }, [realSales, oknoTyg]);

  const estymuj = (ds) => {
    if (!PRED) return null;
    const dw = new Date(ds).getDay();
    const baza = PRED.wd[dw] != null ? PRED.wd[dw] : PRED.wd.filter((x) => x != null).reduce((a, b, _, arr) => a + b / arr.length, 0);
    if (!baza) return null;
    const tygRoznica = (new Date(ds) - new Date(PRED.ostatnia)) / (7 * 864e5);
    return baza * (1 + PRED.trend * tygRoznica) * (1 + korekta / 100);
  };

  const wdAvg = useMemo(() => { const acc = Array.from({ length: 7 }, () => ({ s: 0, n: 0 })); Object.entries(realSales).forEach(([ds, v]) => { const dw = new Date(ds).getDay(); acc[dw].s += v; acc[dw].n++; }); return acc.map((a) => (a.n ? a.s / a.n : null)); }, [realSales]);
  const hasReal = wdAvg.some((x) => x != null);

  const R = useMemo(() => {
    const dim = new Date(year, mIdx + 1, 0).getDate();
    const dni = Array.from({ length: dim }, (_, k) => {
      const d = k + 1, ds = ymd(new Date(year, mIdx, d));
      const js = new Date(ds).getDay(), dow = (js + 6) % 7; // 0=Pon
      const realna = realSales[ds];
      const est = realna == null ? estymuj(ds) : null;
      const sprzedaz = realna != null ? realna : (est != null ? est : 35000);
      const jestEst = realna == null;
      const checks = realChecks[ds] || 0;
      const akt = data.shifts.filter((s) => s.date === ds && !jestInstruktor(s)).reduce((a, s) => a + godzZ(s), 0);
      const dem = optZapotrzebowanie(sprzedaz, splh, podloga, tryb, dow);
      const kc = optZapotrzebowanie(sprzedaz, splh, podloga, "krzywa", dow);
      const { out, cover } = optKsztaltuj(dem, wl);
      const he = out.reduce((a, c) => a + c.len, 0) / 2;
      const { dir, ind } = optRozbicie(sprzedaz, splh, podloga, tryb, dow);
      // pokrycie wynikające z REALNEGO grafiku (do porównania z obsadą idealną — jak Defecto/Exceso w MAPAL)
      const coverAkt = new Array(NS).fill(0);
      data.shifts.filter((x) => x.date === ds && !jestInstruktor(x)).forEach((x) => {
        const a = wtRel(x.start); const dl = Math.round(wtDur(x.start, x.end) / 30);
        for (let i = 0; i < dl; i++) { const p = Math.floor(a / 30) + i; if (p >= 0 && p < NS) coverAkt[p]++; }
      });
      let excA = 0, dDirA = 0, dIndA = 0;
      for (let i = 0; i < NS; i++) {
        const r = coverAkt[i] - dem[i];
        if (r > 0) excA += r;
        else if (r < 0) { const t = dir[i] + ind[i] || 1; dDirA += (-r) * (dir[i] / t); dIndA += (-r) * (ind[i] / t); }
      }
      let exc = 0, dDir = 0, dInd = 0;
      for (let i = 0; i < NS; i++) {
        const r = cover[i] - dem[i];
        if (r > 0) exc += r;
        else if (r < 0) { const t = dir[i] + ind[i] || 1; dDir += (-r) * (dir[i] / t); dInd += (-r) * (ind[i] / t); }
      }
      const ideal = dem.reduce((a, b) => a + b, 0) / 2;
      return { d, ds, dow, sprzedaz, jestEst, checks, akt, dem, kc, cover, dir, ind, shifts: out, he, ideal, coverAkt, exc: exc / 2, dDir: dDir / 2, dInd: dInd / 2, excA: excA / 2, dDirA: dDirA / 2, dIndA: dIndA / 2,
        splhA: akt ? sprzedaz / akt : 0, splhE: he ? sprzedaz / he : 0,
        mptA: checks ? (akt * 60) / checks : 0, mptE: checks ? (he * 60) / checks : 0 };
    });
    const sumS = dni.reduce((a, x) => a + x.sprzedaz, 0), sumA = dni.reduce((a, x) => a + x.akt, 0);
    const sumE = dni.reduce((a, x) => a + x.he, 0), sumC = dni.reduce((a, x) => a + x.checks, 0);
    const zalogaMap = {};
    data.shifts.filter((x) => String(x.date || '').startsWith(`${year}-${String(mIdx + 1).padStart(2, '0')}`) && !jestInstruktor(x)).forEach((x) => { const k = String(x.name || '').toUpperCase().trim(); zalogaMap[k] = (zalogaMap[k] || 0) + godzZ(x); });
    const byDow = [...Array(7)].map((_, i) => { const g = dni.filter((x) => x.dow === i); return { dow: i, n: g.length, s: g.length ? g.reduce((a, x) => a + x.sprzedaz, 0) / g.length : 0, a: g.length ? g.reduce((a, x) => a + x.akt, 0) / g.length : 0, e: g.length ? g.reduce((a, x) => a + x.he, 0) / g.length : 0 }; });
    return { dni, dim, sumS, sumA, sumE, sumC, byDow, zalogaMap, splhA: sumA ? sumS / sumA : 0, splhE: sumE ? sumS / sumE : 0, mgr: mgrDoba * dim };
  }, [year, mIdx, realSales, realChecks, wdAvg, PRED, korekta, splh, podloga, tryb, wl, data.shifts, mgrDoba]);

  const D = R.dni[Math.min(dzien, R.dim) - 1] || R.dni[0];
  const roz = R.sumE - R.sumA;
  const przesun = R.dni.reduce((a, x) => a + Math.abs(x.he - x.akt), 0);
  const razem = R.sumE + R.mgr + szkol;

  const TABS = [["miesiac", "Miesiąc"], ["dzien", "Dzień"], ["pulpit", "Pulpit"], ["prognoza", "Prognoza"], ["zaloga", "Załoga"], ["dane", "Dane"], ["param", "Parametry"]];
  const kosztMies = useMemo(() => {
    const poId = new Map((data.accounts || []).map((a) => [a.id, a]));
    const poNazwie = new Map((data.accounts || []).flatMap((a) => [a.grafikName, ...(a.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a])));
    const pre = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
    return data.shifts.filter((x) => String(x.date || '').startsWith(pre) && !jestInstruktor(x)).reduce((a, x) => {
      const k = (x.accountId && poId.get(x.accountId)) || poNazwie.get(String(x.name || '').toUpperCase().trim());
      return a + kosztGodzin(k, godzZ(x));
    }, 0);
  }, [data.shifts, data.accounts, year, mIdx]);
  const dniEst = R.dni.filter((x) => x.jestEst).length;
  const sumaEst = R.dni.filter((x) => x.jestEst).reduce((a, x) => a + x.sprzedaz, 0);

  return (
    <div>
      <Header title="Optymalizacja" subtitle="Silnik obsady: sprzedaż → zapotrzebowanie w slotach 30 min → szablony zmian → godziny i COL">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/80">Miesiąc</span>
          <select value={mIdx} onChange={(e) => setMIdx(Number(e.target.value))} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ color: colors.primary.darkest }}>{months.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
        </div>
      </Header>
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#F7F5F5", color: colors.primary.dark }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files[0] && onImport(e.target.files[0])} />
          <button onClick={() => fileRef.current && fileRef.current.click()} className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2" style={{ backgroundColor: colors.primary.medium }}><Upload size={15} />Importuj sprzedaż (Excel)</button>
          {importInfo ? <span className="text-sm">Wczytano <b>{importInfo.n}</b> dni ({importInfo.from} → {importInfo.to}){importInfo.checks ? `, paragony: ${importInfo.checks} dni` : ""}.</span> : <span className="text-sm">Wgraj raport „Sales Day by Day". Bez importu silnik używa średnich dni tygodnia.</span>}
          {hasReal && <button onClick={() => { setRealSales({}); setRealChecks({}); setImportInfo(null); data.clearSales(); }} className="ml-auto text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: "white", color: colors.primary.dark }}>Wyczyść</button>}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button onClick={() => setPage && setPage('wt')} className="px-3 py-1.5 rounded-full font-medium" style={{ backgroundColor: 'white', color: colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>← Siatka grafiku (planowanie)</button>
          <button onClick={() => setPage && setPage('plan')} className="px-3 py-1.5 rounded-full font-medium" style={{ backgroundColor: 'white', color: colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>Budżet i koszty pracy (COL) →</button>
        </div>
        {dniEst > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#F1E4E8", color: "#A7465F" }}>
            <span className="text-sm"><b>Prognoza</b> — {dniEst} z {R.dim} dni tego miesiąca nie ma jeszcze danych sprzedaży, więc są <b>estymowane</b>{PRED ? ` na podstawie ${PRED.dni} dni historii (${PRED.od} → ${PRED.do})` : ""}.</span>
            <button onClick={() => setTab("prognoza")} className="ml-auto text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: colors.primary.medium }}>Ustawienia prognozy</button>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <OptKpi label="Godziny crew — grafik" value={f0(R.sumA) + " h"} sub={`SPLH ${f0(R.splhA)} zł/rbh`} />
          <OptKpi label="Godziny crew — silnik" value={f0(R.sumE) + " h"} sub={`SPLH ${f0(R.splhE)} zł/rbh`} tone={roz < 0 ? OC.ok : OC.warn} />
          <OptKpi label="Różnica" value={`${roz >= 0 ? "+" : "−"}${f0(Math.abs(roz))} h`} tone={roz < 0 ? OC.ok : OC.warn} sub={`${R.sumA ? (roz / R.sumA * 100).toFixed(1).replace(".", ",") : 0}% · przesunięcie ${f0(przesun)} h`} />
          <OptKpi label="Limit miesiąca" value={`${f0(limitMies)} h`} sub={`crew ${f0(R.sumE)} + mgr ${f0(R.mgr)} + szkol. ${szkol} = ${f0(razem)}`} tone={razem > limitMies ? OC.bad : OC.ok} />
          <OptKpi label="Koszt pracy — grafik (szac.)" value={`${f0(kosztMies)} zł`} sub={`${R.sumS ? (kosztMies / R.sumS * 100).toFixed(1).replace('.', ',') : 0}% sprzedaży · pełny COL w module Budżet`} tone={R.sumS && kosztMies / R.sumS > 0.2 ? OC.warn : undefined} />
        </div>

        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: colors.primary.bgLight }}>
          {TABS.map(([id, l]) => <button key={id} onClick={() => setTab(id)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: tab === id ? colors.primary.medium : "transparent", color: tab === id ? "white" : colors.primary.dark }}>{l}</button>)}
        </div>

        {tab === "miesiac" && (
          <Sekcja kolor={colors.primary.medium} tytul={`Dzień po dniu — ${months[mIdx]} ${year}`}>
            <div className="overflow-x-auto"><div className="min-w-[760px]">
              <div className="grid grid-cols-[54px_1fr_1fr_1fr_1fr_1fr_86px] gap-2 px-2 py-2 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}>
                <span>Dzień</span><span className="text-right">Sprzedaż</span><span className="text-right">Grafik h</span><span className="text-right">Silnik h</span><span className="text-right">Δ h</span><span className="text-right">SPLH silnik</span><span className="text-center">Status</span>
              </div>
              {R.dni.map((x) => { const d = x.he - x.akt, over = d > 1.5, under = d < -1.5; return (
                <div key={x.d} className="grid grid-cols-[54px_1fr_1fr_1fr_1fr_1fr_86px] gap-2 px-2 py-1.5 text-sm items-center border-b cursor-pointer hover:bg-slate-50" style={{ borderColor: "#EDE3E6" }} onClick={() => { setDzien(x.d); setTab("dzien"); }}>
                  <span style={{ color: colors.primary.dark }}>{D3[x.dow]} {x.d}</span>
                  <span className="text-right" style={{ color: colors.primary.darkest }}>{f0(x.sprzedaz)}</span>
                  <span className="text-right" style={{ color: colors.primary.dark }}>{fH1(x.akt)}</span>
                  <span className="text-right font-medium" style={{ color: OC.silnik }}>{fH1(x.he)}</span>
                  <span className="text-right font-medium" style={{ color: over ? OC.warn : under ? OC.ok : "#A38D95" }}>{d >= 0 ? "+" : ""}{d.toFixed(1)}</span>
                  <span className="text-right" style={{ color: colors.primary.dark }}>{f0(x.splhE)}</span>
                  <span className="text-center"><span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: over ? "#F1E4E8" : under ? "#F1E4E8" : "#EDE3E6", color: over ? OC.warn : under ? OC.ok : "#71656A" }}>{over ? "dołóż" : under ? "oszczędność" : "OK"}</span></span>
                </div>); })}
            </div></div>
          </Sekcja>
        )}

        {tab === "dzien" && D && (<>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm" style={{ color: colors.primary.light }}>Dzień:</span>
            <select value={dzien} onChange={(e) => setDzien(Number(e.target.value))} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>{R.dni.map((x) => <option key={x.d} value={x.d}>{D3[x.dow]} {x.d} · {f0(x.sprzedaz)} zł</option>)}</select>
            <div className="flex gap-1 ml-auto">{[["silnik", "Silnik (ze sprzedaży)"], ["krzywa", "Krzywa celu"]].map(([id, l]) => <button key={id} onClick={() => setTryb(id)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: tryb === id ? OC.silnik : "white", color: tryb === id ? "white" : colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>{l}</button>)}</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <OptKpi label="Sprzedaż" value={`${f0(D.sprzedaz)} zł`} sub={D.checks ? `${f0(D.checks)} paragonów` : "—"} />
            <OptKpi label="Grafik / Silnik" value={`${fH1(D.akt)} / ${fH1(D.he)}`} sub={`Δ ${(D.he - D.akt).toFixed(1)} h`} tone={D.he < D.akt ? OC.ok : OC.warn} />
            <OptKpi label="SPLH silnika" value={f0(D.splhE)} sub={`grafik ${f0(D.splhA)}`} />
            <OptKpi label="MPT silnika" value={D.mptE ? D.mptE.toFixed(2) : "—"} sub={D.mptA ? `grafik ${D.mptA.toFixed(2)}` : "brak paragonów"} />
          </div>
          <Sekcja kolor={OC.silnik} tytul="Zapotrzebowanie vs obsada (sloty 30 min)"><OptWidokDnia dem={D.dem} kc={D.kc} cover={D.cover} shifts={D.shifts} /></Sekcja>
          <Sekcja kolor={OC.obsada} tytul={`Proponowane zmiany (${D.shifts.length}) — ${fH1(D.he)}`}>
            <div className="flex flex-wrap gap-2">{D.shifts.map((c, i) => <span key={i} className="text-xs px-2.5 py-1 rounded-lg text-white font-medium" style={{ backgroundColor: c.t.kol }}>{c.t.n}</span>)}</div>
          </Sekcja>
        </>)}

        {tab === "pulpit" && (<>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <OptKpi label="Niedobór pracy bezpośredniej" value={`${f1(R.dni.reduce((a, x) => a + x.dDirA, 0))} h`} tone={PC.dir} sub="grafik vs obsada idealna" />
            <OptKpi label="Niedobór pracy pośredniej" value={`${f1(R.dni.reduce((a, x) => a + x.dIndA, 0))} h`} tone={PC.ind} sub="prep i sprzątanie" />
            <OptKpi label="Nadmiar obsady" value={`${f1(R.dni.reduce((a, x) => a + x.excA, 0))} h`} tone={PC.plan} sub="godziny ponad krzywą" />
            <OptKpi label="Obsada idealna" value={`${f0(R.dni.reduce((a, x) => a + x.ideal, 0))} h`} sub="suma zapotrzebowania" />
          </div>

          <Karta tytul="Rozbieżność miesiąca" podtytul="grafik vs obsada idealna">
            <div className="flex flex-wrap justify-around gap-2">
              <Zegar label="Niedobór pracy bezpośredniej" wartosc={R.dni.reduce((a, x) => a + x.dDirA, 0)} max={300} kolor={PC.dir} />
              <Zegar label="Niedobór pracy pośredniej" wartosc={R.dni.reduce((a, x) => a + x.dIndA, 0)} max={300} kolor={PC.ind} />
              <Zegar label="Nadmiar obsady" wartosc={R.dni.reduce((a, x) => a + x.excA, 0)} max={600} kolor={PC.plan} />
            </div>
            <div className="text-xs text-center mt-1" style={{ color: PC.mute }}>Zsumowane w jedną liczbę te trzy wskaźniki znoszą się nawzajem — dlatego trzymamy je osobno.</div>
          </Karta>

          <Karta tytul="Niedobór i nadmiar" podtytul="wg dni tygodnia, w godzinach"
            prawo={<span style={{ color: PC.mute }}><span style={{ color: PC.dir }}>■</span> bezpośrednia <span style={{ color: PC.ind }}>■</span> pośrednia <span style={{ color: PC.plan }}>■</span> nadmiar</span>}>
            <Rozbieznosc procent={false} grupy={[...Array(7)].map((_, i) => {
              const g = R.dni.filter((x) => x.dow === i);
              const dDir = g.reduce((a, x) => a + x.dDirA, 0), dInd = g.reduce((a, x) => a + x.dIndA, 0);
              const exc = g.reduce((a, x) => a + x.excA, 0), ideal = g.reduce((a, x) => a + x.ideal, 0) || 1;
              return { nazwa: D3[i], def: dDir + dInd, dDir, dInd, exc, pDef: (dDir + dInd) / ideal * 100, pDir: dDir / ideal * 100, pInd: dInd / ideal * 100, pExc: exc / ideal * 100 };
            })} />
          </Karta>

          <Karta tytul="Ewolucja sprzedaży narastająco" podtytul="odchylenie od średniej dziennej, skumulowane"
            prawo={<span style={{ color: PC.mute }}>{months[mIdx]} {year} · {f0(R.sumS)} zł</span>}>
            <Ewolucja dni={R.dni} />
          </Karta>

          <Karta tytul={`Przebieg dnia — ${DNI_PELNE[D.dow]} ${D.d}`} podtytul={`${f0(D.sprzedaz)} zł${D.checks ? ` · ${f0(D.checks)} transakcji` : ''}`}>
            <div className="flex gap-1 flex-wrap mb-2">
              {R.dni.map((x) => (
                <button key={x.d} onClick={() => setDzien(x.d)} className="px-1.5 py-0.5 rounded font-mono" style={{ fontSize: 10, background: x.d === dzien ? PC.ink : PC.bg, color: x.d === dzien ? '#fff' : x.dow >= 5 ? PC.bad : PC.mute, border: `1px solid ${x.d === dzien ? PC.ink : PC.line}` }}>{x.d}</button>))}
            </div>
            <Sroddzienny D={D} nakladka="brak" />
            <div className="flex gap-4 text-xs mt-1" style={{ color: PC.mute }}>
              <span className="flex items-center gap-1"><span className="w-3 h-2 inline-block" style={{ background: PC.ind }} />praca pośrednia</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 inline-block" style={{ background: PC.dir }} />praca bezpośrednia</span>
              <span className="flex items-center gap-1"><span className="w-3 inline-block" style={{ height: 2, background: PC.plan }} />obsada zaplanowana</span>
            </div>
          </Karta>

          <div className="grid md:grid-cols-2 gap-2">
            <Karta tytul="Ranking dni tygodnia" podtytul="SPLH z grafiku">
              <Ranking jednostka="zł/rbh" dane={[...Array(7)].map((_, i) => { const g = R.dni.filter((x) => x.dow === i); const sh = g.reduce((a, x) => a + x.akt, 0); return { n: D3[i], v: sh ? g.reduce((a, x) => a + x.sprzedaz, 0) / sh : 0 }; })} />
            </Karta>
            <Karta tytul="Struktura sprzedaży wg pory dnia" podtytul="z profilu godzinowego">
              <Piers czesci={[
                { n: 'Poranek 07–11', v: [7, 8, 9, 10].reduce((a, h) => a + ZLH[h], 0), kol: '#DFC9D1' },
                { n: 'Lunch 11–15', v: [11, 12, 13, 14].reduce((a, h) => a + ZLH[h], 0), kol: PC.accent },
                { n: 'Popołudnie 15–19', v: [15, 16, 17, 18].reduce((a, h) => a + ZLH[h], 0), kol: PC.plan },
                { n: 'Wieczór 19–23', v: [19, 20, 21, 22, 23].reduce((a, h) => a + ZLH[h], 0), kol: PC.cel },
              ]} />
            </Karta>
          </div>

          <Karta tytul="Godziny idealne vs zaplanowane" podtytul="średnia na dzień tygodnia, linia = wykonanie w %"
            prawo={<span style={{ color: PC.mute }}><span style={{ color: PC.cel }}>■</span> idealne <span style={{ color: PC.plan }}>■</span> w grafiku <span style={{ color: PC.bad }}>—</span> %</span>}>
            <SlupkiLinia dane={[...Array(7)].map((_, i) => { const g = R.dni.filter((x) => x.dow === i) ; const n = g.length || 1; return { n: D3[i], a: g.reduce((x, y) => x + y.ideal, 0) / n, b: g.reduce((x, y) => x + y.akt, 0) / n }; })} />
          </Karta>

          <Karta tytul="Rozkład załogi wg godzin miesiąca" podtytul={`${Object.keys(R.zalogaMap).length} osób`}>
            <Histogram kubelki={(() => { const h = Object.values(R.zalogaMap); return [
              { l: '<40 h', n: h.filter((x) => x < 40).length },
              { l: '40–80', n: h.filter((x) => x >= 40 && x < 80).length },
              { l: '80–120', n: h.filter((x) => x >= 80 && x < 120).length },
              { l: '120–160', n: h.filter((x) => x >= 120 && x < 160).length },
              { l: '160–200', n: h.filter((x) => x >= 160 && x < 200).length },
              { l: '200+', n: h.filter((x) => x >= 200).length }]; })()} />
          </Karta>
        </>)}

        {tab === "prognoza" && (<>
          <ForecastQuality data={data} />
          {!PRED ? (
            <Sekcja kolor="#A7465F" tytul="Brak historii sprzedaży">
              <p className="text-sm" style={{ color: colors.primary.dark }}>Aby prognozować kolejny miesiąc, zaimportuj najpierw raport „Sales Day by Day" z co najmniej kilku tygodni. Im dłuższa historia, tym stabilniejszy profil dni tygodnia i trend.</p>
            </Sekcja>
          ) : (<>
            <Sekcja kolor={colors.primary.medium} tytul="Podstawa prognozy">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <OptKpi label="Dni historii" value={f0(PRED.dni)} sub={`${PRED.od} → ${PRED.do}`} />
                <OptKpi label="Tygodnie w próbie" value={f0(PRED.tygodni)} />
                <OptKpi label="Trend tygodniowy" value={`${PRED.trend >= 0 ? "+" : ""}${(PRED.trend * 100).toFixed(2).replace(".", ",")}%`} tone={PRED.trend >= 0 ? OC.ok : OC.warn} sub={`pewność ${Math.round(PRED.pewnosc * 100)}% · ${PRED.pelneTyg} pełnych tyg.`} />
                <OptKpi label="Dni estymowane" value={`${f0(dniEst)} / ${R.dim}`} sub={dniEst ? `${f0(sumaEst)} zł prognozy` : "miesiąc ma pełne dane"} />
              </div>
            </Sekcja>

            <Sekcja kolor="#2B171E" tytul="Sterowanie prognozą">
              <div className="grid md:grid-cols-2 gap-6">
                <OptSuw label="Okno historii" value={oknoTyg} min={2} max={26} step={1} unit="tyg." onChange={setOknoTyg} />
                <OptSuw label="Ręczna korekta (np. wydarzenie, remont)" value={korekta} min={-30} max={30} step={1} unit="%" onChange={setKorekta} />
              </div>
              <p className="text-xs text-slate-400 mt-3">Krótsze okno szybciej reaguje na zmiany (nowe menu, sezon), dłuższe jest stabilniejsze. Korekta przesuwa całą prognozę w górę lub w dół.</p>
            </Sekcja>

            <Sekcja kolor="#5A3542" tytul="Średnia sprzedaż wg dnia tygodnia (z okna historii)">
              <BPBars unit="zł" items={[1, 2, 3, 4, 5, 6, 0].map((js) => ({ label: D3[(js + 6) % 7], value: PRED.wd[js] || 0, n: 0, color: (js === 0 || js === 5 || js === 6) ? OC.silnik : colors.primary.medium }))} />
            </Sekcja>

            <Sekcja kolor={OC.silnik} tytul={`Prognoza dzienna — ${months[mIdx]} ${year}`}>
              <BPLine labels={R.dni.map((x) => String(x.d))} unit="" series={[{ name: "Sprzedaż (dane + prognoza)", color: OC.silnik, data: R.dni.map((x) => x.sprzedaz), fill: true }]} />
              <div className="overflow-x-auto mt-3"><div className="min-w-[560px]">
                <div className="grid grid-cols-[70px_1fr_1fr_1fr_90px] gap-2 px-2 py-1.5 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}><span>Dzień</span><span className="text-right">Sprzedaż zł</span><span className="text-right">Rekom. h</span><span className="text-right">Plan h</span><span className="text-center">Źródło</span></div>
                {R.dni.map((x) => (
                  <div key={x.d} className="grid grid-cols-[70px_1fr_1fr_1fr_90px] gap-2 px-2 py-1.5 text-sm items-center border-b" style={{ borderColor: "#EDE3E6" }}>
                    <span style={{ color: colors.primary.dark }}>{D3[x.dow]} {x.d}</span>
                    <span className="text-right" style={{ color: colors.primary.darkest }}>{f0(x.sprzedaz)}</span>
                    <span className="text-right font-medium" style={{ color: OC.silnik }}>{fH1(x.he)}</span>
                    <span className="text-right" style={{ color: colors.primary.dark }}>{fH1(x.akt)}</span>
                    <span className="text-center"><span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: x.jestEst ? "#F1E4E8" : "#F1E4E8", color: x.jestEst ? "#A7465F" : "#5A3542" }}>{x.jestEst ? "prognoza" : "dane"}</span></span>
                  </div>
                ))}
              </div></div>
            </Sekcja>
          </>)}
        </>)}

        {tab === "zaloga" && (
          <Sekcja kolor="#2B171E" tytul={`Załoga — godziny pracowników w miesiącu (${months[mIdx]} ${year})`}>
            {(() => {
              const pre = `${year}-${String(mIdx + 1).padStart(2, "0")}`;
              const mies = data.shifts.filter((s) => (s.date || "").slice(0, 7) === pre && !jestInstruktor(s));
              // godziny po IDENTYFIKATORZE KONTA; zapasowo po nazwie w grafiku / aliasach
              const poId = {}, poNazwie = {};
              mies.forEach((s) => {
                if (s.accountId) poId[s.accountId] = (poId[s.accountId] || 0) + godzZ(s);
                else { const k = String(s.name || "").toUpperCase().trim(); poNazwie[k] = (poNazwie[k] || 0) + godzZ(s); }
              });
              const wiersze = (data.accounts || []).map((a) => {
                const klucze = [a.grafikName, ...(a.aliasy || [])].filter(Boolean).map((x) => String(x).toUpperCase().trim());
                const h = (poId[a.id] || 0) + klucze.reduce((x, k) => x + (poNazwie[k] || 0), 0);
                const zmian = mies.filter((s) => s.accountId === a.id || klucze.includes(String(s.name || "").toUpperCase().trim())).length;
                return { id: a.id, name: a.name, funkcja: a.funkcja, instruktor: a.instruktor, grafik: a.grafikName, h, zmian, koszt: kosztGodzin(a, h) };
              }).sort((a, b) => b.h - a.h || a.name.localeCompare(b.name));
              const przypisaneNazwy = new Set((data.accounts || []).flatMap((a) => [a.grafikName, ...(a.aliasy || [])].filter(Boolean).map((x) => String(x).toUpperCase().trim())));
              const bezKonta = Object.entries(poNazwie).filter(([k]) => !przypisaneNazwy.has(k)).sort((a, b) => b[1] - a[1]);
              const max = Math.max(1, ...wiersze.map((x) => x.h));
              const sumaH = wiersze.reduce((a, x) => a + x.h, 0);
              if (!mies.length) return <p className="text-slate-400 text-sm">Brak grafiku w tym miesiącu.</p>;
              return (<>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <OptKpi label="Pracowników ze zmianami" value={f0(wiersze.filter((x) => x.h > 0).length)} sub={`z ${wiersze.length} kont`} />
                  <OptKpi label="Godziny przypisane" value={`${f0(sumaH)} h`} />
                  <OptKpi label="Koszt (szac.)" value={`${f0(wiersze.reduce((a, x) => a + x.koszt, 0))} zł`} />
                  <OptKpi label="Bez konta" value={f0(bezKonta.length)} sub={bezKonta.length ? `${f0(bezKonta.reduce((a, x) => a + x[1], 0))} h poza rozliczeniem` : "wszystko przypisane"} tone={bezKonta.length ? OC.warn : OC.ok} />
                </div>
                <div className="space-y-1.5">
                  {wiersze.filter((x) => x.h > 0).map((w) => (
                    <div key={w.id}>
                      <div className="flex items-center justify-between text-xs mb-0.5 gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium truncate" style={{ color: colors.primary.darkest }}>{w.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{funkcjaLabel(w.funkcja)}</span>
                          {w.instruktor && <span className="shrink-0">🎓</span>}
                        </span>
                        <span className="shrink-0"><b style={{ color: colors.primary.darkest }}>{fH1(w.h)}</b><span className="text-slate-400"> · {w.zmian} zm. · {f0(w.koszt)} zł</span></span>
                      </div>
                      <div className="h-2.5 rounded" style={{ backgroundColor: colors.primary.bgLight }}><div className="h-2.5 rounded" style={{ width: `${w.h / max * 100}%`, backgroundColor: w.h > 200 ? OC.warn : colors.primary.medium }} /></div>
                    </div>
                  ))}
                  <p className="text-xs text-slate-400 mt-2">Suma: {fH1(sumaH)} · pracowników ze zmianami: {wiersze.filter((x) => x.h > 0).length}</p>
                  {wiersze.some((x) => x.h === 0) && <p className="text-xs text-slate-300">Bez zmian w tym miesiącu: {wiersze.filter((x) => x.h === 0).map((x) => x.name).join(", ")}</p>}
                </div>
                {bezKonta.length > 0 && (
                  <div className="mt-4 rounded-xl p-3" style={{ backgroundColor: "#F5E9ED" }}>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: "#A7465F" }}>Zmiany bez konta — nie liczą się do pracowników powyżej. Uzupełnij „Nazwę w grafiku" lub alias w module Pracownicy i kliknij „Przypisz zmiany do kont".</p>
                    <div className="flex flex-wrap gap-1.5">{bezKonta.map(([k, h]) => <span key={k} className="text-xs px-2 py-1 rounded-lg font-mono" style={{ backgroundColor: "white", color: "#A7465F" }}>{k} <span className="opacity-60">{fH1(h)}</span></span>)}</div>
                  </div>
                )}
              </>);
            })()}
          </Sekcja>
        )}

        {tab === "dane" && (<>
          {(() => { const sd = data.salesData || {}; const braki = sd.braki || []; const meta = sd.meta; return (
            <div className="rounded-xl p-3 mb-3 text-xs flex flex-wrap items-center gap-x-5 gap-y-1" style={{ backgroundColor: braki.length ? '#F1E4E8' : '#F1E4E8', color: braki.length ? '#A7465F' : '#741334' }}>
              <b>Jakość danych sprzedaży (P4):</b>
              {meta ? <span>import v{meta.wersja} · {new Date(meta.importedAt).toLocaleString('pl-PL')} · {meta.source} · {meta.importedBy}</span> : <span>brak zarejestrowanych importów</span>}
              {braki.length ? <span>braki w ostatnich 30 dniach: <b>{braki.length}</b> ({braki.slice(0, 5).join(', ')}{braki.length > 5 ? '…' : ''})</span> : <span>komplet danych za ostatnie 30 dni</span>}
            </div>
          ); })()}
          <Sekcja kolor={colors.primary.medium} tytul="Średnie wg dnia tygodnia">
            <div className="overflow-x-auto"><div className="min-w-[520px]">
              <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] gap-2 px-2 py-2 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}><span>Dzień</span><span className="text-right">Śr. sprzedaż</span><span className="text-right">Śr. grafik h</span><span className="text-right">Śr. silnik h</span><span className="text-right">Δ h</span></div>
              {R.byDow.map((b) => (<div key={b.dow} className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] gap-2 px-2 py-1.5 text-sm border-b" style={{ borderColor: "#EDE3E6" }}>
                <span style={{ color: colors.primary.dark }}>{D3[b.dow]}</span><span className="text-right">{f0(b.s)} zł</span><span className="text-right">{fH1(b.a)}</span><span className="text-right" style={{ color: OC.silnik }}>{fH1(b.e)}</span>
                <span className="text-right font-medium" style={{ color: b.e - b.a > 0 ? OC.warn : OC.ok }}>{(b.e - b.a) >= 0 ? "+" : ""}{(b.e - b.a).toFixed(1)}</span></div>))}
            </div></div>
          </Sekcja>
          <Sekcja kolor="#5A3542" tytul="Profil godzinowy sprzedaży (udział doby)">
            <div className="flex items-end gap-1 h-32">{Object.entries(ZLH).map(([h, v]) => (<div key={h} className="flex-1 flex flex-col items-center justify-end">
              <div className="w-full rounded-t" style={{ height: `${v / Math.max(...Object.values(ZLH)) * 100}%`, backgroundColor: PIK.includes(+h) ? OC.silnik : colors.primary.bg }} />
              <span className="text-[9px] mt-1" style={{ color: colors.primary.light }}>{h}</span></div>))}</div>
            <p className="text-xs text-slate-400 mt-2">Rozkład z historii micros — steruje podziałem dziennej sprzedaży na sloty. Docelowo: zasilany realnym eksportem godzinowym.</p>
          </Sekcja>
        </>)}

        {tab === "param" && (
          <div className="grid md:grid-cols-2 gap-4">
            <Sekcja kolor={OC.silnik} tytul="Parametry silnika">
              <div className="space-y-4">
                <OptSuw label="Docelowy SPLH" value={splh} min={280} max={600} step={10} unit="zł/rbh" onChange={setSplh} />
                <OptSuw label="Podłoga obsady (min. osób)" value={podloga} min={1} max={5} step={1} unit="os." onChange={setPodloga} />
                <OptSuw label="Limit godzin / miesiąc" value={limitMies} min={3000} max={6000} step={50} unit="h" onChange={setLimitMies} />
                <OptSuw label="Godziny MGR / doba" value={mgrDoba} min={16} max={48} step={1} unit="h" onChange={setMgrDoba} />
                <OptSuw label="Godziny szkoleniowe / m-c" value={szkol} min={0} max={400} step={2} unit="h" onChange={setSzkol} />
                <div><p className="text-xs font-medium mb-1" style={{ color: colors.primary.dark }}>Tryb zapotrzebowania</p>
                  <div className="flex gap-1">{[["silnik", "Ze sprzedaży (SPLH)"], ["krzywa", "Krzywa celu (KC)"]].map(([id, l]) => <button key={id} onClick={() => setTryb(id)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: tryb === id ? OC.silnik : "white", color: tryb === id ? "white" : colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>{l}</button>)}</div></div>
              </div>
            </Sekcja>
            <Sekcja kolor={OC.obsada} tytul="Szablony zmian (włącz/wyłącz)">
              <div className="space-y-1">{SZAB.map((t) => (
                <label key={t.n} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input type="checkbox" checked={!!wl[t.n]} onChange={(e) => setWl((p) => ({ ...p, [t.n]: e.target.checked }))} />
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: t.kol }} />
                  <span style={{ color: colors.primary.dark }}>{t.n}</span>
                  <span className="ml-auto text-xs text-slate-400">{t.do - t.od} h</span>
                </label>))}</div>
            </Sekcja>
          </div>
        )}
      </div>
    </div>
  );
};




// ===================== PULPIT WSKAŹNIKÓW (wykresy wzorowane na GIR/MAPAL) =====================
const PC = { bg: '#F5F4F0', card: '#FFFFFF', line: '#DEDCD5', ink: '#1C1E21', mute: '#8C8A83', accent: '#A7465F', cel: '#741334', plan: '#5A3542', dir: '#B5482F', ind: '#A7465F', bad: '#B94352', ok: '#5A3542' };
const DNI_PELNE = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const f1 = (v) => (v || 0).toFixed(1).replace('.', ',');
const hmL = (i) => String(Math.floor(((S0 * 60 + i * 30) % 1440) / 60)).padStart(2, '0');

/* 1. Ewolucja — wariancja narastająca, pole zielone nad zerem / czerwone pod */
function Ewolucja({ dni }) {
  const W = 720, H = 190, PL = 34, PB = 22, PT = 8;
  const plan = dni.reduce((a, x) => a + x.sprzedaz, 0) / 31;
  let cs = 0, cp = 0;
  const pts = dni.map((x, i) => {
    cs += x.sprzedaz; cp += plan;
    return { i, v: ((cs - cp) / cp) * 100, d: x.d };
  });
  const mx = Math.max(3, ...pts.map((p) => Math.abs(p.v))) * 1.15;
  const X = (i) => PL + (i * (W - PL - 8)) / 30;
  const Y = (v) => PT + ((H - PT - PB) / 2) * (1 - v / mx);
  const y0 = Y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560 }}>
      {[-mx, -mx / 2, 0, mx / 2, mx].map((v, i) => (<g key={i}>
        <line x1={PL} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? PC.mute : PC.line} />
        <text x={PL - 4} y={Y(v) + 3} textAnchor="end" fontSize="7.5" fill={PC.mute}>{v.toFixed(0)}%</text></g>))}
      {pts.slice(1).map((p, k) => {
        const a = pts[k], dodatnie = (a.v + p.v) / 2 >= 0;
        return <polygon key={k} points={`${X(a.i)},${y0} ${X(a.i)},${Y(a.v)} ${X(p.i)},${Y(p.v)} ${X(p.i)},${y0}`}
          fill={dodatnie ? PC.ok : PC.bad} opacity=".28" />;
      })}
      <polyline points={pts.map((p) => `${X(p.i)},${Y(p.v)}`).join(" ")} fill="none" stroke={PC.ink} strokeWidth="1.6" />
      {pts.map((p, i) => i % 5 === 0 || i === 30 ? (
        <g key={i}><circle cx={X(p.i)} cy={Y(p.v)} r="2.4" fill={p.v >= 0 ? PC.ok : PC.bad} />
          <text x={X(p.i)} y={H - 6} fontSize="7" textAnchor="middle" fill={PC.mute}>{p.d}</text></g>) : null)}
      <text x={W - 8} y={Y(pts[30].v) - 6} fontSize="9" textAnchor="end" fill={pts[30].v >= 0 ? PC.ok : PC.bad}>
        {pts[30].v >= 0 ? "+" : ""}{f1(pts[30].v)}%</text>
    </svg>
  );
}

/* 2. Zegar półkolisty */
function Zegar({ label, wartosc, max, kolor }) {
  const W = 160, H = 96, cx = 80, cy = 80, r = 58;
  const frac = Math.max(0, Math.min(1, wartosc / max));
  const pol = (a) => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
  const [x1, y1] = pol(0), [x2, y2] = pol(frac);
  const [bx, by] = pol(1);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 150 }}>
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${bx} ${by}`} fill="none" stroke={PC.line} strokeWidth="11" />
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={kolor} strokeWidth="11" strokeLinecap="round" />
        <text x={cx} y={cy - 12} textAnchor="middle" fontSize="20" fill={PC.ink} fontFamily="ui-monospace,monospace">{f1(wartosc)}</text>
        <text x={cx} y={cy + 2} textAnchor="middle" fontSize="8" fill={PC.mute}>godzin</text>
        <text x={12} y={cy + 10} fontSize="7" fill={PC.mute}>0</text>
        <text x={W - 12} y={cy + 10} fontSize="7" textAnchor="end" fill={PC.mute}>{max}</text>
      </svg>
      <div className="text-xs text-center" style={{ color: PC.mute }}>{label}</div>
    </div>
  );
}

/* 3. Rozbieżność — słupki rozchodzące się od zera */
function Rozbieznosc({ grupy, procent }) {
  const W = 700, rowH = 30, PL = 46, H = grupy.length * rowH + 22;
  const mx = Math.max(...grupy.map((g) => Math.max(procent ? g.pDef : g.def, procent ? g.pExc : g.exc))) * 1.1 || 1;
  const mid = PL + (W - PL - 16) / 2, half = (W - PL - 20) / 2;
  const sc = (v) => (v / mx) * half;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 540 }}>
      <line x1={mid} x2={mid} y1={0} y2={H - 16} stroke={PC.mute} strokeWidth=".8" />
      {grupy.map((g, i) => {
        const y = i * rowH + 6;
        const dDir = sc(procent ? g.pDir : g.dDir), dInd = sc(procent ? g.pInd : g.dInd), e = sc(procent ? g.pExc : g.exc);
        const jed = procent ? "%" : "h";
        return (<g key={i}>
          <text x={2} y={y + 13} fontSize="9" fill={PC.mute}>{g.nazwa}</text>
          <rect x={mid - dDir - dInd} y={y} width={dInd} height={17} fill={PC.ind} />
          <rect x={mid - dDir} y={y} width={dDir} height={17} fill={PC.dir} />
          <rect x={mid} y={y} width={e} height={17} fill={PC.plan} opacity=".8" />
          {dDir + dInd > 3 && <text x={mid - dDir - dInd - 4} y={y + 12} fontSize="8" textAnchor="end" fill={PC.bad}>
            −{f1(procent ? g.pDef : g.def)}{jed}</text>}
          {e > 3 && <text x={mid + e + 4} y={y + 12} fontSize="8" fill={PC.plan}>+{f1(procent ? g.pExc : g.exc)}{jed}</text>}
        </g>);
      })}
      <text x={PL} y={H - 3} fontSize="7.5" fill={PC.mute}>niedobór</text>
      <text x={W - 8} y={H - 3} fontSize="7.5" textAnchor="end" fill={PC.mute}>nadmiar</text>
    </svg>
  );
}

/* 4. Wykres śróddzienny — słupki pośrednia/bezpośrednia + linia obsady + nakładki */
function Sroddzienny({ D, nakladka }) {
  const W = 720, H = 210, PL = 26, PB = 20, PT = 8;
  const cw = (W - PL - 8) / NS;
  const mxY = Math.max(...D.dem, ...D.cover) + 1;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / mxY);
  const sprz = new Array(NS).fill(0);
  for (let h = 7; h <= 23; h++) { const v = ZLH[h] / 2; sprz[sl(h)] = v; sprz[sl(h) + 1] = v; }
  const trans = sprz.map((v) => v / 44.38);
  const nak = nakladka === "sprzedaz" ? sprz : nakladka === "transakcje" ? trans : null;
  const mxN = nak ? Math.max(...nak) * 1.15 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 620 }}>
      {[...Array(mxY + 1)].map((_, v) => v % 2 === 0 ? (<g key={v}>
        <line x1={PL} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke={PC.line} />
        <text x={PL - 4} y={Y(v) + 3} textAnchor="end" fontSize="7" fill={PC.mute}>{v}</text></g>) : null)}
      {D.dir.map((v, i) => v > 0 ? <rect key={`d${i}`} x={PL + i * cw + .5} y={Y(v)} width={cw - 1} height={Y(0) - Y(v)} fill={PC.dir} /> : null)}
      {D.ind.map((v, i) => v > 0 ? <rect key={`i${i}`} x={PL + i * cw + .5} y={Y(v)} width={cw - 1} height={Y(0) - Y(v)} fill={PC.ind} opacity=".95" /> : null)}
      <polyline points={D.cover.flatMap((v, i) => [`${PL + i * cw},${Y(v)}`, `${PL + (i + 1) * cw},${Y(v)}`]).join(" ")}
        fill="none" stroke={PC.plan} strokeWidth="1.8" />
      {D.cover.map((v, i) => i % 2 === 0 && v > 0 ? <circle key={i} cx={PL + i * cw + cw} cy={Y(v)} r="1.7" fill={PC.plan} /> : null)}
      {nak && <polyline points={nak.map((v, i) => `${PL + i * cw + cw / 2},${PT + (H - PT - PB) * (1 - v / mxN)}`).join(" ")}
        fill="none" stroke={PC.cel} strokeWidth="1.3" strokeDasharray="3 2" />}
      {[...Array(NS)].map((_, i) => i % 4 === 0 ? <text key={i} x={PL + i * cw} y={H - 6} fontSize="7" fill={PC.mute}>{hmL(i)}</text> : null)}
    </svg>
  );
}

/* 5. Ranking z linią średniej */
function Ranking({ dane, jednostka }) {
  const W = 700, H = 170, PL = 30, PB = 26, PT = 8;
  const mx = Math.max(...dane.map((d) => d.v)) * 1.1;
  const bw = (W - PL - 10) / dane.length;
  const sr = dane.reduce((a, d) => a + d.v, 0) / dane.length;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / mx);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
      {[0, mx / 2, mx].map((v, i) => (<g key={i}>
        <line x1={PL} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke={PC.line} />
        <text x={PL - 4} y={Y(v) + 3} textAnchor="end" fontSize="7" fill={PC.mute}>{f0(v)}</text></g>))}
      {dane.map((d, i) => (<g key={i}>
        <rect x={PL + i * bw + bw * .18} y={Y(d.v)} width={bw * .64} height={Y(0) - Y(d.v)}
          fill={d.v >= sr ? PC.plan : PC.mute} opacity={d.v >= sr ? .85 : .45} />
        <text x={PL + i * bw + bw / 2} y={Y(d.v) - 3} fontSize="7.5" textAnchor="middle" fill={PC.ink}>{f0(d.v)}</text>
        <text x={PL + i * bw + bw / 2} y={H - 12} fontSize="8" textAnchor="middle" fill={PC.mute}>{d.n}</text>
      </g>))}
      <line x1={PL} x2={W - 8} y1={Y(sr)} y2={Y(sr)} stroke={PC.bad} strokeWidth="1.4" strokeDasharray="4 3" />
      <text x={W - 10} y={Y(sr) - 4} fontSize="7.5" textAnchor="end" fill={PC.bad}>średnia {f0(sr)} {jednostka}</text>
    </svg>
  );
}

/* 6. Pierścień — struktura wg pory dnia */
function Piers({ czesci }) {
  const W = 320, H = 170, cx = 85, cy = 85, R = 62, r = 36;
  const tot = czesci.reduce((a, c) => a + c.v, 0);
  let kat = -Math.PI / 2;
  const luk = (a0, a1, rr) => [cx + rr * Math.cos(a0), cy + rr * Math.sin(a0), cx + rr * Math.cos(a1), cy + rr * Math.sin(a1)];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 340 }}>
      {czesci.map((c, i) => {
        const a0 = kat, a1 = kat + (c.v / tot) * Math.PI * 2; kat = a1;
        const [x1, y1, x2, y2] = luk(a0, a1, R), [x3, y3, x4, y4] = luk(a1, a0, r);
        const big = a1 - a0 > Math.PI ? 1 : 0;
        const mid = (a0 + a1) / 2, lx = cx + (R + 10) * Math.cos(mid), ly = cy + (R + 10) * Math.sin(mid);
        return (<g key={i}>
          <path d={`M ${x1} ${y1} A ${R} ${R} 0 ${big} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${big} 0 ${x4} ${y4} Z`} fill={c.kol} />
          {c.v / tot > 0.06 && <text x={lx} y={ly} fontSize="7.5" textAnchor={Math.cos(mid) > 0 ? "start" : "end"} fill={PC.mute}>
            {Math.round(c.v / tot * 100)}%</text>}
        </g>);
      })}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fill={PC.ink} fontFamily="ui-monospace,monospace">100%</text>
      {czesci.map((c, i) => (<g key={i}>
        <rect x={190} y={30 + i * 20} width={9} height={9} rx="2" fill={c.kol} />
        <text x={204} y={38 + i * 20} fontSize="8.5" fill={PC.mute}>{c.n}</text>
      </g>))}
    </svg>
  );
}

/* 7. Słupki + linia procentowa (Horas Teóricas vs Pagadas) */
function SlupkiLinia({ dane }) {
  const W = 720, H = 190, PL = 30, PR = 34, PB = 24, PT = 10;
  const mx = Math.max(...dane.flatMap((d) => [d.a, d.b])) * 1.15;
  const bw = (W - PL - PR) / dane.length;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / mx);
  const YP = (p) => PT + (H - PT - PB) * (1 - (p - 60) / 80);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560 }}>
      {[0, mx / 2, mx].map((v, i) => (<g key={i}>
        <line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke={PC.line} />
        <text x={PL - 4} y={Y(v) + 3} textAnchor="end" fontSize="7" fill={PC.mute}>{f0(v)}</text></g>))}
      {[80, 100, 120].map((p) => (
        <text key={p} x={W - PR + 4} y={YP(p) + 3} fontSize="7" fill={PC.cel}>{p}%</text>))}
      {dane.map((d, i) => (<g key={i}>
        <rect x={PL + i * bw + bw * .14} y={Y(d.a)} width={bw * .34} height={Y(0) - Y(d.a)} fill={PC.cel} opacity=".55" />
        <rect x={PL + i * bw + bw * .5} y={Y(d.b)} width={bw * .34} height={Y(0) - Y(d.b)} fill={PC.plan} opacity=".8" />
        <text x={PL + i * bw + bw / 2} y={H - 10} fontSize="8" textAnchor="middle" fill={PC.mute}>{d.n}</text>
      </g>))}
      <polyline points={dane.map((d, i) => `${PL + i * bw + bw / 2},${YP(d.b / d.a * 100)}`).join(" ")}
        fill="none" stroke={PC.bad} strokeWidth="1.6" />
      {dane.map((d, i) => <circle key={i} cx={PL + i * bw + bw / 2} cy={YP(d.b / d.a * 100)} r="2.4" fill={PC.bad} />)}
    </svg>
  );
}

/* 8. Histogram załogi wg przedziałów godzin */
function Histogram({ kubelki }) {
  const W = 700, H = 165, PL = 26, PB = 26, PT = 10;
  const mx = Math.max(...kubelki.map((k) => k.n)) * 1.2;
  const bw = (W - PL - 10) / kubelki.length;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / mx);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
      {[0, Math.round(mx / 2), Math.round(mx)].map((v, i) => (<g key={i}>
        <line x1={PL} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke={PC.line} />
        <text x={PL - 4} y={Y(v) + 3} textAnchor="end" fontSize="7" fill={PC.mute}>{v}</text></g>))}
      {kubelki.map((k, i) => (<g key={i}>
        <rect x={PL + i * bw + bw * .2} y={Y(k.n)} width={bw * .6} height={Y(0) - Y(k.n)} fill={PC.plan} opacity=".75" />
        <text x={PL + i * bw + bw / 2} y={Y(k.n) - 3} fontSize="8" textAnchor="middle" fill={PC.ink}>{k.n}</text>
        <text x={PL + i * bw + bw / 2} y={H - 10} fontSize="7.5" textAnchor="middle" fill={PC.mute}>{k.l}</text>
      </g>))}
    </svg>
  );
}

/* =================================================================== */
function Karta({ tytul, podtytul, prawo, children }) {
  return (<div className="rounded-lg p-3 mt-2" style={{ background: PC.card, border: `1px solid ${PC.line}`, borderLeft: `3px solid ${PC.bad}` }}>
    <div className="flex flex-wrap items-baseline gap-2 mb-2">
      <span className="text-sm font-medium">{tytul}</span>
      {podtytul && <span className="text-xs" style={{ color: PC.mute }}>{podtytul}</span>}
      {prawo && <span className="ml-auto text-xs">{prawo}</span>}
    </div>
    {children}
  </div>);
}


