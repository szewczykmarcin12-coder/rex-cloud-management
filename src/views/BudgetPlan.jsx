import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { f0 } from '../lib/demandEngine.js';
import { colors, godzZ, jestInstruktor, months, wtAct, wtDur } from '../lib/domain.js';
import { Btn, Header, Sekcja } from '../ui/primitives.jsx';
// ── Prognozy i estymacja → Budżet i koszty ──
// ===================== PLAN BUDŻETU (kalkulator COL) =====================
const BP_POZ = ['RGM', 'ASM', 'SM', 'JSM', 'CREW'];
const BP_NORMY = [160, 160, 176, 168, 160, 168, 184, 160, 176, 176, 160, 160];
const bpMgr = (p) => p !== 'CREW';
const bpKat = (e) => (e.pozycja === 'RGM' || e.pozycja === 'ASM') ? 'kier' : (e.pozycja === 'SM' || e.pozycja === 'JSM') ? 'mgr' : (e.instruktor ? 'instr' : 'prac');
const BP_KAT = { prac: { label: 'Pracownicy', color: '#5A3542' }, instr: { label: 'Instruktorzy', color: '#B86D82' }, mgr: { label: 'Mgr (SM/JSM)', color: '#5A3542' }, kier: { label: 'Kierownictwo (RGM/ASM)', color: '#2B171E' } };
const zl = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bpDefSettings = { zusRate: 0.1948, zusPPK: 0.2098, nocnyBonus: 0.2, minWage: 4806, normy: [...BP_NORMY] };

const bpKoszt = (e, nom, s) => {
  if (e.umowa === 'UZ') {
    const base = (e.stawka || 0) * (e.godziny || 0);
    const bhp = (e.godziny || 0) * (e.pozycja === 'RGM' ? 1.5 : 2);
    const premia = e.premia || 0;
    const zus = e.zusUZ ? base * s.zusRate : 0;
    return { base, ppk: 0, bhp, urlop: 0, nocne: 0, chorobowe: 0, premia, zus, pfron: 0, total: base + bhp + premia + zus, worked: e.godziny || 0 };
  }
  const worked = Math.max(0, (e.godziny || 0) - (e.urlopH || 0) - (e.dniZLA || 0) * 8);
  const base = (e.stawka || 0) * worked / nom;
  const ppk = e.ppk ? (e.stawka || 0) * 0.015 : 0;
  const bhp = e.bhp || 0;
  const urlop = (e.urlopH || 0) * ((e.stawka || 0) / nom) * 1.05;
  const nocne = (e.nocneH || 0) * (s.minWage / nom) * s.nocnyBonus;
  const zlaRate = (e.stawka || 0) * (1 - 0.1371);
  const chorobowe = (e.dniZLA || 0) ? (zlaRate / 30) * (e.dniZLA || 0) * 0.8 : 0;
  const premia = e.premia || 0;
  const zus = (base + premia + urlop + nocne) * (e.ppk ? s.zusPPK : s.zusRate);
  const pfron = e.pfron || 0;
  return { base, ppk, bhp, urlop, nocne, chorobowe, premia, zus, pfron, total: base + ppk + bhp + premia + urlop + nocne + chorobowe + zus + pfron, worked };
};

export const BPLine = ({ series, labels, height = 200, unit = '' }) => {
  const vals = series.flatMap((s) => s.data);
  const max = Math.max(1, ...vals);
  const W = 680, H = height, P = { l: 42, r: 12, t: 12, b: 26 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const n = labels.length || 1;
  const X = (i) => P.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => P.t + ih - (v / max) * ih;
  const step = Math.max(1, Math.ceil(n / 12));
  return (
    <div>
      <div className="flex gap-4 mb-1">{series.map((s, i) => <span key={i} className="flex items-center gap-1 text-[11px]" style={{ color: colors.primary.dark }}><span className="w-3 h-2 rounded" style={{ backgroundColor: s.color }} />{s.name}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {Array.from({ length: 5 }).map((_, t) => { const v = max * t / 4; const y = Y(v); return (<g key={t}><line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#EDE3E6" /><text x={P.l - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#A38D95">{Math.round(v)}{unit}</text></g>); })}
        {labels.map((l, i) => (i % step === 0) ? <text key={i} x={X(i)} y={H - 9} textAnchor="middle" fontSize="9" fill="#A38D95">{l}</text> : null)}
        {series.map((s, si) => (<g key={si}>{s.fill && <polygon fill={s.color} fillOpacity="0.08" points={`${X(0)},${Y(0)} ` + s.data.map((v, i) => `${X(i)},${Y(v)}`).join(' ') + ` ${X(n - 1)},${Y(0)}`} />}<polyline fill="none" stroke={s.color} strokeWidth="2" points={s.data.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} /></g>))}
      </svg>
    </div>
  );
};
export const BPBars = ({ items, unit = 'zł' }) => {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (<div className="space-y-2">{items.map((it, i) => (<div key={i}><div className="flex justify-between text-xs mb-0.5"><span style={{ color: colors.primary.dark }}>{it.label} <span className="text-slate-400">· {it.n} os.</span></span><b style={{ color: colors.primary.darkest }}>{zl(it.value)} {unit}</b></div><div className="h-3 rounded" style={{ backgroundColor: colors.primary.bgLight }}><div className="h-3 rounded" style={{ width: `${it.value / max * 100}%`, backgroundColor: it.color }} /></div></div>))}</div>);
};

const BP_KOSZT_DOMYSLNE = { godziny: 160, premia: 0, bhp: 0, urlopH: 0, dniZLA: 0, nocneH: 0, ppk: false, pfron: 0, godzBy: {} };

export const BudgetPlan = ({ data, setPage }) => {
  const b = data.budget;
  const [tab, setTab] = useState('budzet');
  const [koszParam, setKoszParam] = useState({});      // parametry kosztowe per id konta
  const [settings, setSettings] = useState(bpDefSettings);
  const [mIdx, setMIdx] = useState(new Date().getMonth());
  const [sprzedaz, setSprzedaz] = useState({});
  const [transakcje, setTransakcje] = useState({});
  const [dniS, setDniS] = useState({});
  const [openRow, setOpenRow] = useState(null);
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !b) return;
    setKoszParam(b.koszParam || {});
    if (b.settings) setSettings(b.settings);
    setSprzedaz(b.sprzedaz || {}); setTransakcje(b.transakcje || {}); setDniS(b.dniS || {});
    hydrated.current = true;
  }, [b]);
  useEffect(() => { if (!hydrated.current) return; data.saveBudget({ koszParam, settings, sprzedaz, transakcje, dniS }); }, [koszParam, settings, sprzedaz, transakcje, dniS]);

  // Pracownicy pochodzą z modułu „Pracownicy" (konta). Tutaj dokładamy tylko parametry kosztowe.
  const emps = useMemo(() => (data.accounts || []).map((a) => ({
    ...BP_KOSZT_DOMYSLNE, ...(koszParam[a.id] || {}),
    id: a.id, name: a.name, grafikName: a.grafikName, aliasy: a.aliasy || [], pozycja: a.funkcja, umowa: a.umowa, stawka: a.stawka,
    zusUZ: !!a.zus, instruktor: !!a.instruktor,
  })), [data.accounts, koszParam]);

  const nom = settings.normy[mIdx] || 160;
  const rokBud = useMemo(() => { const ys = data.shifts.map((x) => +String(x.date).slice(0, 4)).filter(Boolean); return ys.length ? Math.max(...ys) : new Date().getFullYear(); }, [data.shifts]);
  const mPre = `${rokBud}-${String(mIdx + 1).padStart(2, '0')}`;

  // Godziny FAKTYCZNE — z grafiku danego miesiąca (bez wierszy instruktorskich, zgodnie z regułą liczenia)
  // Godziny z grafiku — po IDENTYFIKATORZE KONTA (przypisanym przy imporcie), z zapasowym dopasowaniem po nazwie
  const godzGrafik = useMemo(() => {
    const m = { poId: {}, poNazwie: {} };
    data.shifts.filter((x) => String(x.date || '').startsWith(mPre) && !jestInstruktor(x)).forEach((x) => {
      if (x.accountId) m.poId[x.accountId] = (m.poId[x.accountId] || 0) + godzZ(x);
      else { const k = String(x.name || '').toUpperCase().trim(); m.poNazwie[k] = (m.poNazwie[k] || 0) + godzZ(x); }
    });
    return m;
  }, [data.shifts, mPre]);
  const grafikJest = Object.keys(godzGrafik.poId).length > 0 || Object.keys(godzGrafik.poNazwie).length > 0;
  const kluczeOsoby = (e) => [e.grafikName || String(e.name || '').trim().split(/\s+/).pop(), ...(e.aliasy || [])].filter(Boolean).map((x) => String(x).toUpperCase().trim());
  const godzAktOf = (e) => (godzGrafik.poId[e.id] || 0) + kluczeOsoby(e).reduce((a, k) => a + (godzGrafik.poNazwie[k] || 0), 0);
  // Godziny PLANOWANE — ręcznie ustawione w budżecie; bez ustawienia startują od grafiku (a gdy brak grafiku — od normy)
  const getGodz = (e) => (e.godzBy && e.godzBy[mIdx] != null) ? e.godzBy[mIdx] : (grafikJest ? godzAktOf(e) : (e.godziny || 0));

  const koszty = emps.map((e) => ({ e, k: bpKoszt({ ...e, godziny: getGodz(e) }, nom, settings) }));
  const kosztyAkt = emps.map((e) => ({ e, k: bpKoszt({ ...e, godziny: godzAktOf(e) }, nom, settings) }));
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const col = sum(koszty, (x) => x.k.total);
  const godzTotal = sum(koszty, (x) => x.k.worked);
  const colAkt = sum(kosztyAkt, (x) => x.k.total);
  const godzAktTotal = sum(kosztyAkt, (x) => x.k.worked);
  const sale = sprzedaz[mIdx] || 0, tr = transakcje[mIdx] || 0, dni = dniS[mIdx] || 0;
  const colPct = sale ? col / sale : 0;
  const agc = tr ? sale / tr : 0, splh = godzTotal ? sale / godzTotal : 0, mpt = tr ? godzTotal * 60 / tr : 0;
  const linia = (f) => sum(koszty, (x) => f(x.k));
  const kats = ['prac', 'instr', 'mgr', 'kier'].map((key) => { const g = koszty.filter((x) => bpKat(x.e) === key); return { key, label: BP_KAT[key].label, color: BP_KAT[key].color, value: sum(g, (x) => x.k.total), n: g.length }; });

  const setE = (id, patch) => setKoszParam((p) => ({ ...p, [id]: { ...BP_KOSZT_DOMYSLNE, ...(p[id] || {}), ...patch } }));
  const setGodz = (e, v) => setE(e.id, { godzBy: { ...(e.godzBy || {}), [mIdx]: Number(v) || 0 } });
  const setNorma = (i, v) => setSettings((s) => { const n = [...s.normy]; n[i] = Number(v) || 0; return { ...s, normy: n }; });

  const year = useMemo(() => { const ys = data.shifts.map((s) => +s.date.slice(0, 4)).filter(Boolean); return ys.length ? Math.max(...ys) : new Date().getFullYear(); }, [data.shifts]);
  const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
  const planDaily = Array.from({ length: daysInMonth }, (_, i) => { const ds = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`; return data.shifts.filter((s) => s.date === ds && !jestInstruktor(s)).reduce((a, s) => a + godzZ(s), 0); });
  // P0-2 (audyt P4): wykonanie WYŁĄCZNIE z realnych danych ts:data (odbicia/korekty);
  // dzień bez wykonania = 0 — żadnych wartości syntetycznych z planu.
  const actualDaily = Array.from({ length: daysInMonth }, (_, i) => {
    const ds = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    let min = 0;
    data.shifts.filter((x) => x.date === ds && !jestInstruktor(x)).forEach((x) => {
      const a = wtAct(((data.ts || {}).actuals) || {}, x);
      if (!a) return;
      const przerwy = (a.breaks || []).filter((b) => b.platna === false).reduce((acc, b) => acc + wtDur(b.start != null ? b.start : b.od, b.end != null ? b.end : b.do), 0);
      min += Math.max(wtDur(a.start, a.end) - przerwy, 0);
    });
    return +(min / 60).toFixed(1);
  });
  const avgHourly = godzTotal ? col / godzTotal : 0;
  const colDaily = planDaily.map((h) => +(h * avgHourly).toFixed(0));
  const dayLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));

  // ── Wskaźniki w stylu GIRnet Workforce ──
  const mKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const sprzedazMies = (y, m) => { const sd = (data.salesData && data.salesData.sales) || {}; const pre = mKey(y, m); return Object.entries(sd).filter(([d]) => d.startsWith(pre)).reduce((a, [, v]) => a + v, 0); };
  const godzinyMies = (y, m) => { const pre = mKey(y, m); return data.shifts.filter((x) => (x.date || '').startsWith(pre) && !jestInstruktor(x)).reduce((a, x) => a + godzZ(x), 0); };
  const poprz = mIdx === 0 ? { y: year - 1, m: 11 } : { y: year, m: mIdx - 1 };
  const sBiez = sprzedazMies(year, mIdx), sPoprz = sprzedazMies(poprz.y, poprz.m);
  const hBiez = godzinyMies(year, mIdx), hPoprz = godzinyMies(poprz.y, poprz.m);
  const splhBiez = hBiez ? sBiez / hBiez : 0, splhPoprz = hPoprz ? sPoprz / hPoprz : 0;
  const varPct = splhPoprz ? ((splhBiez - splhPoprz) / splhPoprz) * 100 : 0;

  // godziny kontraktowe: stałe (UOP) vs zmienne (UZ)
  const hStale = koszty.filter((x) => x.e.umowa === 'UOP').reduce((a, x) => a + x.k.worked, 0);
  const hZmienne = koszty.filter((x) => x.e.umowa === 'UZ').reduce((a, x) => a + x.k.worked, 0);
  const hRazem = hStale + hZmienne;

  // zgodność kontraktowa: teoretyczne vs zaplanowane + nadmiar/niedobór
  const teorII = (e) => e.umowa === 'UOP' ? Math.max(0, nom - (e.urlopH || 0) - (e.dniZLA || 0) * 8) : getGodz(e);
  const zgodnosc = emps.map((e) => { const teor = teorII(e); const plan = getGodz(e); const d = plan - teor; return { name: e.name, umowa: e.umowa, teor, plan, nadmiar: Math.max(0, d), niedobor: Math.max(0, -d) }; });
  const sumNadmiar = zgodnosc.reduce((a, x) => a + x.nadmiar, 0);
  const sumNiedobor = zgodnosc.reduce((a, x) => a + x.niedobor, 0);

  // absencja (urlop + ZLA) w godzinach
  const hUrlop = emps.reduce((a, e) => a + (e.urlopH || 0), 0);
  const hZLA = emps.reduce((a, e) => a + (e.dniZLA || 0) * 8, 0);
  const absPct = hRazem + hUrlop + hZLA ? ((hUrlop + hZLA) / (hRazem + hUrlop + hZLA)) * 100 : 0;

  const Stat = ({ v, l, sub, dark }) => (<div className="rounded-xl p-3 text-center shadow-sm border" style={{ backgroundColor: dark ? colors.primary.darkest : 'white', borderColor: colors.primary.bg }}><p className="text-xl font-bold" style={{ color: dark ? 'white' : colors.primary.darkest }}>{v}</p><p className="text-[11px]" style={{ color: dark ? 'rgba(255,255,255,.7)' : colors.primary.light }}>{l}</p>{sub && <p className="text-[10px]" style={{ color: dark ? 'rgba(255,255,255,.5)' : '#A38D95' }}>{sub}</p>}</div>);
  // Kafelek z podwójną wartością: u góry faktyczne (z grafiku), pod spodem planowane (z budżetu)
  const Dwa = ({ akt, plan, label, kolor }) => {
    const roz = (parseFloat(String(akt).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0) - (parseFloat(String(plan).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0);
    return (
      <div className="rounded-xl p-3 shadow-sm border" style={{ backgroundColor: kolor || 'white', borderColor: colors.primary.bg }}>
        <p className="text-[11px] mb-1" style={{ color: kolor ? 'rgba(255,255,255,.75)' : colors.primary.light }}>{label}</p>
        <p className="text-xl font-bold leading-tight" style={{ color: kolor ? 'white' : colors.primary.darkest }}>{akt} <span className="text-[10px] font-medium opacity-70">aktualne</span></p>
        <p className="text-sm font-semibold leading-tight mt-0.5" style={{ color: kolor ? 'rgba(255,255,255,.85)' : colors.primary.light }}>{plan} <span className="text-[10px] font-medium opacity-70">planowane</span></p>
      </div>
    );
  };
  const numIn = (val, on, w = 'w-full') => <input type="number" value={val} onChange={(e) => on(e.target.value)} className={`${w} px-2 py-1 rounded border text-sm`} style={{ borderColor: colors.primary.bg }} />;
  const Fld = ({ label, children }) => (<div><label className="block text-[11px] mb-0.5" style={{ color: colors.primary.light }}>{label}</label>{children}</div>);

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Plan budżetu" subtitle="Kalkulator COL — pracownicy, składki ZUS, koszty, budżet i analityka miesiąca">
        <span className="text-xs font-medium" style={{ color: colors.primary.light }}>Miesiąc</span>
        <select value={mIdx} onChange={(e) => setMIdx(Number(e.target.value))} className="px-3 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: colors.primary.bg, color: colors.primary.darkest }}>{months.map((m, i) => <option key={i} value={i}>{m} · norma {settings.normy[i]}h</option>)}</select>
      </Header>
      <div className="flex-1 p-8 space-y-5 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'white' }}>
          {[['budzet', 'Budżet miesiąca'], ['prac', 'Pracownicy'], ['analiza', 'Analityka'], ['ust', 'Ustawienia ZUS']].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: tab === id ? colors.primary.medium : 'transparent', color: tab === id ? 'white' : colors.primary.dark }}>{l}</button>
          ))}
        </div>

        {tab === 'budzet' && (<>
          <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl p-4 shadow-sm border" style={{ borderColor: colors.primary.bg }}>
            <Fld label="Sprzedaż (zł)">{numIn(sale, (v) => setSprzedaz((p) => ({ ...p, [mIdx]: Number(v) || 0 })), 'w-36')}</Fld>
            <Fld label="Transakcje">{numIn(tr, (v) => setTransakcje((p) => ({ ...p, [mIdx]: Number(v) || 0 })), 'w-28')}</Fld>
            <Fld label="Dni sprzedaży">{numIn(dni, (v) => setDniS((p) => ({ ...p, [mIdx]: Number(v) || 0 })), 'w-24')}</Fld>
            <span className="text-xs text-slate-400 ml-auto self-center">Wskaźniki dla: <b style={{ color: colors.primary.dark }}>{months[mIdx]}</b></span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Dwa label="COL — koszt pracy (total)" akt={`${zl(colAkt)} zł`} plan={`${zl(col)} zł`} kolor={colors.primary.darkest} />
            <Dwa label="COL % (koszt / sprzedaż)" akt={`${(sale ? colAkt / sale * 100 : 0).toFixed(2)}%`} plan={`${(colPct * 100).toFixed(2)}%`} kolor={(sale ? colAkt / sale : 0) > 0.2 ? '#B94352' : '#741334'} />
            <Dwa label="Godziny total" akt={`${godzAktTotal.toFixed(0)} h`} plan={`${godzTotal.toFixed(0)} h`} />
            <Dwa label="Godziny na dzień" akt={`${dni ? (godzAktTotal / dni).toFixed(1) : 0} h`} plan={`${dni ? (godzTotal / dni).toFixed(1) : 0} h`} />
          </div>
          <p className="text-xs text-slate-400 -mt-2">„Aktualne" = godziny z grafiku {months[mIdx]} {rokBud}{grafikJest ? '' : ' (brak grafiku dla tego miesiąca)'}. „Planowane" = wartości ustawione w zakładce Pracownicy.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat v={zl(agc)} l="AGC" sub="sprzedaż / transakcje" />
            <Stat v={zl(splh)} l="SPLH" sub="sprzedaż / godziny" />
            <Stat v={mpt.toFixed(2)} l="MPT (min)" sub="godziny×60 / transakcje" />
            <Stat v={`${nom} h`} l="Etat (norma m-ca)" />
          </div>
          <Sekcja kolor="#2B171E" tytul="COL wg kategorii"><BPBars items={kats.map((k) => ({ label: k.label, value: k.value, n: k.n, color: k.color }))} /></Sekcja>
          <Sekcja kolor="#5A3542" tytul="Podgląd kosztów (rozbicie P&amp;L)">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {[['Płace podstawowe', linia((k) => k.base)], ['Premie', linia((k) => k.premia)], ['Nadgodziny/nocne', linia((k) => k.nocne)], ['Wynagr. urlopowe', linia((k) => k.urlop)], ['Wynagr. chorobowe', linia((k) => k.chorobowe)], ['Ekwiwalent BHP', linia((k) => k.bhp)], ['Koszt PPK', linia((k) => k.ppk)], ['ZUS pracodawcy', linia((k) => k.zus)], ['PFRON', linia((k) => k.pfron)]].map(([l, v]) => (
                <div key={l} className="flex justify-between rounded-lg px-3 py-2" style={{ backgroundColor: colors.primary.bgLight }}><span style={{ color: colors.primary.dark }}>{l}</span><b style={{ color: colors.primary.darkest }}>{zl(v)}</b></div>
              ))}
            </div>
          </Sekcja>
        </>)}

        {tab === 'prac' && (<>
          <div className="bg-white rounded-xl p-3 shadow-sm border text-xs flex flex-wrap gap-x-5 gap-y-1" style={{ borderColor: colors.primary.bg }}>
            <span style={{ color: colors.primary.light }}>Legenda:</span><span><b>Stawka</b> — UOP: mies.; UZ: zł/h</span><span><b>Godziny</b> — w {months[mIdx]}</span><span><b>ZLA</b> — dni zwolnienia</span><span><b>PPK</b> — w PPK</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BP_KAT.prac.color }} />Prac.</span><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BP_KAT.instr.color }} />Instr.</span><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BP_KAT.mgr.color }} />Mgr</span><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BP_KAT.kier.color }} />Kier.</span>
          </div>
          <div className="space-y-2">
            {koszty.map(({ e, k }) => { const open = openRow === e.id; const kat = bpKat(e); return (
              <div key={e.id} className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: colors.primary.bg }}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: BP_KAT[kat].color }} title={BP_KAT[kat].label} />
                  <div className="flex-1 min-w-0"><p className="font-semibold text-sm truncate" style={{ color: colors.primary.darkest }}>{e.name}</p><p className="text-[11px]" style={{ color: colors.primary.light }}>{e.pozycja} · {e.umowa} · grafik {godzAktOf(e).toFixed(0)} h / plan {Number(getGodz(e)).toFixed(0)} h{e.instruktor ? ' · instruktor' : ''}</p></div>
                  <div className="text-right shrink-0"><p className="text-[10px]" style={{ color: colors.primary.light }}>Koszt {months[mIdx]}</p><p className="font-bold" style={{ color: colors.primary.darkest }}>{zl(bpKoszt({ ...e, godziny: godzAktOf(e) }, nom, settings).total)} zł</p><p className="text-[10px]" style={{ color: colors.primary.light }}>plan {zl(k.total)} zł</p></div>
                  <button onClick={() => setOpenRow(open ? null : e.id)} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 shrink-0" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Szczegóły <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} /></button>

                </div>
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: colors.primary.bg, backgroundColor: '#fbfcfe' }}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                      <Fld label="Stanowisko"><div className="px-2 py-1 rounded text-sm" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{e.pozycja}{e.instruktor ? ' · instruktor' : ''}</div></Fld>
                      <Fld label="Typ umowy"><div className="px-2 py-1 rounded text-sm" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{e.umowa}</div></Fld>
                      <Fld label={e.umowa === 'UOP' ? 'Wynagr. mies. (zł)' : 'Stawka (zł/h)'}><div className="px-2 py-1 rounded text-sm" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{zl(e.stawka)}</div></Fld>
                      <Fld label={`Godziny (${months[mIdx]})`}>{numIn(getGodz(e), (v) => setGodz(e, v))}</Fld>
                      <Fld label="Premia (zł)">{numIn(e.premia, (v) => setE(e.id, { premia: Number(v) || 0 }))}</Fld>
                      {e.umowa === 'UOP' && <Fld label="Ekwiwalent BHP (zł)">{numIn(e.bhp, (v) => setE(e.id, { bhp: Number(v) || 0 }))}</Fld>}
                      {e.umowa === 'UOP' && <Fld label="Godziny urlopu">{numIn(e.urlopH, (v) => setE(e.id, { urlopH: Number(v) || 0 }))}</Fld>}
                      {e.umowa === 'UOP' && <Fld label="Dni ZLA (chorobowe)">{numIn(e.dniZLA, (v) => setE(e.id, { dniZLA: Number(v) || 0 }))}</Fld>}
                      {e.umowa === 'UOP' && <Fld label="Godziny nocne">{numIn(e.nocneH, (v) => setE(e.id, { nocneH: Number(v) || 0 }))}</Fld>}
                      {e.umowa === 'UOP' && <Fld label="PFRON (zł)">{numIn(e.pfron, (v) => setE(e.id, { pfron: Number(v) || 0 }))}</Fld>}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3">
                      {e.umowa === 'UOP' && <label className="flex items-center gap-2 text-sm" style={{ color: colors.primary.dark }}><input type="checkbox" checked={e.ppk} onChange={(ev) => setE(e.id, { ppk: ev.target.checked })} />PPK (+1,5%, ZUS 20,98%)</label>}
                      {e.umowa === 'UZ' && <span className="text-sm" style={{ color: colors.primary.light }}>ZUS od zlecenia: <b style={{ color: colors.primary.dark }}>{e.zusUZ ? 'tak' : 'nie'}</b> <span className="text-xs">(ustawiane w module Pracownicy)</span></span>}
                    </div>
                    <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: colors.primary.bgLight }}>
                      <p className="text-[11px] font-semibold uppercase mb-2" style={{ color: colors.primary.light }}>Rozbicie kosztu pracodawcy</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                        {[['Płaca podstawowa', k.base], ['Premia', k.premia], ['Wynagr. urlopowe', k.urlop], ['Dodatek nocny', k.nocne], ['Wynagr. chorobowe', k.chorobowe], ['Ekwiwalent BHP', k.bhp], ['Koszt PPK', k.ppk], ['ZUS pracodawcy', k.zus], ['PFRON', k.pfron]].filter(([, v]) => v).map(([l, v]) => <div key={l} className="flex justify-between"><span style={{ color: colors.primary.dark }}>{l}</span><span style={{ color: colors.primary.darkest }}>{zl(v)}</span></div>)}
                        <div className="flex justify-between col-span-2 md:col-span-3 border-t pt-1 mt-1" style={{ borderColor: colors.primary.bg }}><b style={{ color: colors.primary.darkest }}>Koszt całkowity</b><b style={{ color: colors.primary.darkest }}>{zl(k.total)} zł</b></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ); })}
          </div>
          {emps.length === 0 && <div className="bg-white rounded-xl p-6 text-center border" style={{ borderColor: colors.primary.bg }}><p className="text-slate-500 mb-3">Brak pracowników. Konta zakładasz w module „Pracownicy" — trafiają tu automatycznie.</p><Btn variant="secondary" onClick={() => setPage && setPage('emps')}>Przejdź do modułu Pracownicy</Btn></div>}
          <div className="flex items-center gap-3"><Btn variant="secondary" onClick={() => setPage && setPage('emps')}>Zarządzaj pracownikami</Btn><Btn variant="secondary" onClick={() => setPage && setPage('forecast')}>Optymalizacja i prognoza</Btn><span className="text-xs text-slate-400">Imię, stanowisko, umowa, stawka i ZUS pochodzą z modułu Pracownicy. Tutaj ustawiasz tylko dane kosztowe (godziny, premia, BHP, urlop, ZLA, nocne, PPK, PFRON).</span></div>
        </>)}

        {tab === 'analiza' && (<>
          <p className="text-sm" style={{ color: colors.primary.light }}>Analityka dla: <b style={{ color: colors.primary.dark }}>{months[mIdx]} {year}</b> — dane dzienne z grafiku.</p>
          <Sekcja kolor={colors.primary.medium} tytul="Grafik: godziny plan vs wykonanie z odbić (dni miesiąca)"><BPLine labels={dayLabels} unit="h" series={[{ name: 'Plan', color: colors.primary.bg, data: planDaily, fill: true }, { name: 'Wykonanie', color: colors.primary.medium, data: actualDaily }]} /></Sekcja>
          <Sekcja kolor="#2B171E" tytul="Cost of Labour — dzienny koszt pracy (plan)"><BPLine labels={dayLabels} unit="" series={[{ name: 'Koszt dzienny (zł)', color: '#2B171E', data: colDaily, fill: true }]} /><p className="text-xs text-slate-400 mt-2">Szacunek: godziny planowane danego dnia × średni koszt godziny ({zl(avgHourly)} zł/h).</p></Sekcja>
          <Sekcja kolor="#5A3542" tytul="Cost of Labour — udział kategorii"><BPBars items={kats.map((k) => ({ label: k.label, value: k.value, n: k.n, color: k.color }))} /></Sekcja>

          <Sekcja kolor="#5A3542" tytul="Produktywność (SPLH) — okres vs poprzedni">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat v={`${f0(splhBiez)}`} l={`SPLH — ${months[mIdx]}`} sub={`${f0(sBiez)} zł / ${f0(hBiez)} h`} />
              <Stat v={`${f0(splhPoprz)}`} l={`SPLH — ${months[poprz.m]}`} sub={`${f0(sPoprz)} zł / ${f0(hPoprz)} h`} />
              <div className="rounded-xl p-3 text-center shadow-sm" style={{ backgroundColor: varPct >= 0 ? '#5A3542' : '#B94352' }}><p className="text-xl font-bold text-white">{varPct >= 0 ? '+' : ''}{varPct.toFixed(1).replace('.', ',')}%</p><p className="text-[11px] text-white/80">Zmiana r/r okresu</p></div>
              <Stat v={`${f0(hRazem ? sBiez / hRazem : 0)}`} l="SPLH wg planu budżetu" sub={`${f0(hRazem)} h w planie`} />
            </div>
            {!sBiez && <p className="text-xs text-slate-400 mt-2">Brak danych sprzedaży dla tego miesiąca — zaimportuj raport w module Optymalizacja.</p>}
          </Sekcja>

          <Sekcja kolor="#5A3542" tytul="Godziny kontraktowe — stałe vs zmienne">
            <BPBars unit="h" items={[
              { label: 'Stałe (UOP)', value: hStale, n: koszty.filter((x) => x.e.umowa === 'UOP').length, color: '#5A3542' },
              { label: 'Zmienne (UZ)', value: hZmienne, n: koszty.filter((x) => x.e.umowa === 'UZ').length, color: '#A7465F' },
            ]} />
            <p className="text-xs text-slate-400 mt-2">Udział godzin stałych: <b style={{ color: colors.primary.dark }}>{hRazem ? (hStale / hRazem * 100).toFixed(1).replace('.', ',') : 0}%</b> — wyższy udział to mniejsza elastyczność obsady, ale i niższy koszt krańcowy godziny.</p>
          </Sekcja>

          <Sekcja kolor="#A7465F" tytul="Zgodność kontraktowa — godziny teoretyczne vs zaplanowane">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Stat v={`${f0(zgodnosc.reduce((a, x) => a + x.teor, 0))} h`} l="Teoretyczne (z umów)" />
              <div className="rounded-xl p-3 text-center shadow-sm border" style={{ borderColor: colors.primary.bg }}><p className="text-xl font-bold" style={{ color: '#A7465F' }}>{f0(sumNadmiar)} h</p><p className="text-[11px]" style={{ color: colors.primary.light }}>Nadmiar (Exceso)</p></div>
              <div className="rounded-xl p-3 text-center shadow-sm border" style={{ borderColor: colors.primary.bg }}><p className="text-xl font-bold" style={{ color: '#B94352' }}>{f0(sumNiedobor)} h</p><p className="text-[11px]" style={{ color: colors.primary.light }}>Niedobór (Defecto)</p></div>
            </div>
            <div className="overflow-x-auto"><div className="min-w-[560px]">
              <div className="grid grid-cols-[1.6fr_70px_1fr_1fr_1fr_1fr] gap-2 px-2 py-1.5 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}><span>Pracownik</span><span>Umowa</span><span className="text-right">Teoret.</span><span className="text-right">Plan</span><span className="text-right">Nadmiar</span><span className="text-right">Niedobór</span></div>
              {zgodnosc.map((z, i) => (
                <div key={i} className="grid grid-cols-[1.6fr_70px_1fr_1fr_1fr_1fr] gap-2 px-2 py-1.5 text-sm border-b" style={{ borderColor: '#EDE3E6' }}>
                  <span className="truncate" style={{ color: colors.primary.dark }}>{z.name}</span>
                  <span className="text-xs" style={{ color: colors.primary.light }}>{z.umowa}</span>
                  <span className="text-right">{z.teor.toFixed(0)}</span>
                  <span className="text-right">{z.plan.toFixed(0)}</span>
                  <span className="text-right font-medium" style={{ color: z.nadmiar ? '#A7465F' : '#C7B4BB' }}>{z.nadmiar ? z.nadmiar.toFixed(0) : '—'}</span>
                  <span className="text-right font-medium" style={{ color: z.niedobor ? '#B94352' : '#C7B4BB' }}>{z.niedobor ? z.niedobor.toFixed(0) : '—'}</span>
                </div>
              ))}
            </div></div>
          </Sekcja>

          <Sekcja kolor="#5A3542" tytul="Absencja">
            <div className="grid grid-cols-3 gap-3">
              <Stat v={`${f0(hUrlop)} h`} l="Urlopy" />
              <Stat v={`${f0(hZLA)} h`} l="Chorobowe (ZLA)" sub={`${emps.reduce((a, e) => a + (e.dniZLA || 0), 0)} dni`} />
              <div className="rounded-xl p-3 text-center shadow-sm" style={{ backgroundColor: absPct > 8 ? '#B94352' : '#5A3542' }}><p className="text-xl font-bold text-white">{absPct.toFixed(1).replace('.', ',')}%</p><p className="text-[11px] text-white/80">Wskaźnik absencji</p></div>
            </div>
          </Sekcja>
        </>)}

        {tab === 'ust' && (
          <div className="grid md:grid-cols-2 gap-4">
            <Sekcja kolor="#2B171E" tytul="Składki i stawki">
              <div className="space-y-3">
                {[['ZUS pracodawcy (%)', settings.zusRate * 100, (v) => setSettings((s) => ({ ...s, zusRate: (Number(v) || 0) / 100 }))], ['ZUS z PPK (%)', settings.zusPPK * 100, (v) => setSettings((s) => ({ ...s, zusPPK: (Number(v) || 0) / 100 }))], ['Dodatek nocny (%)', settings.nocnyBonus * 100, (v) => setSettings((s) => ({ ...s, nocnyBonus: (Number(v) || 0) / 100 }))], ['Płaca minimalna (zł)', settings.minWage, (v) => setSettings((s) => ({ ...s, minWage: Number(v) || 0 }))]].map(([l, val, on]) => (
                  <div key={l} className="flex items-center justify-between gap-3"><span className="text-sm" style={{ color: colors.primary.dark }}>{l}</span>{numIn(val, on, 'w-32')}</div>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: colors.primary.light }}>Domyślnie ZUS 19,48%; z PPK 20,98%.</p>
            </Sekcja>
            <Sekcja kolor={colors.primary.medium} tytul="Normy godzin (etat) w miesiącach">
              <div className="grid grid-cols-2 gap-2">{months.map((m, i) => (<div key={i} className="flex items-center justify-between gap-2"><span className="text-sm" style={{ color: colors.primary.dark }}>{m}</span>{numIn(settings.normy[i], (v) => setNorma(i, v), 'w-20')}</div>))}</div>
            </Sekcja>
          </div>
        )}
      </div>
    </div>
  );
};

