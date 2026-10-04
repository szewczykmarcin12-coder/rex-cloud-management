import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { parseSalesDayByDay } from '../import/posReports.js';
import { D3, NS, OC, PIK, S0, SZAB, ZLH, f0, fH1, hmS, optKsztaltuj, optRozbicie, optZapotrzebowanie, sl, toISOdate } from '../lib/demandEngine.js';
import { colors, funkcjaLabel, godzZ, jestInstruktor, kosztGodzin, months, wtDur, wtRel, ymd } from '../lib/domain.js';
import { Header, Sekcja } from '../ui/primitives.jsx';
import { BPBars, BPLine } from './BudgetPlan.jsx';
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

  const TABS = [["miesiac", "Miesiąc"], ["dzien", "Dzień"], ["prognoza", "Dni bez danych (estymacja silnika)"], ["param", "Parametry i szablony"]];
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
          {importInfo ? <span className="text-sm">Historia POS: <b>{importInfo.n}</b> dni ({importInfo.from} → {importInfo.to}){importInfo.checks ? `, paragony: ${importInfo.checks} dni` : ""} • podstawa: <b>{(data.salesData && data.salesData.meta && data.salesData.meta.basis === 'gross') ? 'brutto' : 'netto'}</b>{data.salesData && data.salesData.intraday ? ` • profil dnia z POS ${data.salesData.intraday.from}–${data.salesData.intraday.to}` : ' • profil dnia: założenie QSR'}.</span> : <span className="text-sm">Brak historii sprzedaży — silnik używa średnich dni tygodnia z profilu standardowego.</span>}
          <button onClick={() => setPage && setPage('import-eksport')} className="ml-auto text-xs px-3 py-1.5 rounded-lg font-semibold text-white flex items-center gap-2" style={{ backgroundColor: colors.primary.medium }}><Upload size={13} /> Import POS (Administracja)</button>
          <button onClick={() => setPage && setPage('plan-miesiaca')} className="text-xs px-3 py-1.5 rounded-lg font-semibold" style={{ backgroundColor: 'white', color: colors.primary.dark }}>Plan miesiąca →</button>
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

        {tab === "prognoza" && (<>
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
