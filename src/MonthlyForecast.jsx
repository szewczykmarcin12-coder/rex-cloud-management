import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, ChevronUp, Clock3, Lock, RefreshCw, Save, ShieldCheck, SlidersHorizontal, TrendingUp, Unlock, Users } from 'lucide-react';

const C = {
  ink: '#321B23', dark: '#5A3542', mid: '#741334', mute: '#806D74', line: '#E3D8DB', pale: '#F3EFF0',
  ok: '#741334', warn: '#A7465F', bad: '#8E1B3C', blue: '#3A6EA5', violet: '#7A5FB0', teal: '#26A69A', slate: '#5A3542',
};
const CATEGORIES = [
  ['crew', 'Crew', C.blue],
  ['manager', 'MGR', C.ink],
  ['functionalManager', 'MGR funkcyjne', C.violet],
  ['training', 'Szkoleniowe', C.teal],
  ['managerTraining', 'MGR szkoleniowe', C.slate],
];
const DOW = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const money = (v) => Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = (v, digits = 1) => Number(v || 0).toLocaleString('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const nextMonth = () => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const workdays = (month, holidays = []) => {
  if (!/^\d{4}-\d{2}$/.test(month)) return 0;
  const [y, m] = month.split('-').map(Number); const n = new Date(y, m, 0).getDate(); const off = new Set(holidays);
  let count = 0; for (let i = 1; i <= n; i++) { const ds = `${month}-${String(i).padStart(2, '0')}`; const w = new Date(y, m - 1, i).getDay(); if (w >= 1 && w <= 5 && !off.has(ds)) count++; }
  return count;
};
const roleCategory = (a) => ['RGM', 'ASM', 'MANAGER'].includes(String(a.funkcja || '').toUpperCase()) ? 'manager' : ['SM', 'JSM', 'MGR FUNKCYJNE'].includes(String(a.funkcja || '').toUpperCase()) ? 'functionalManager' : 'crew';
const targetFor = (a, month, holidays = []) => Math.round(workdays(month, holidays) * (Number(a.wymiarTygH) || 40) / 5 * 4) / 4;

function Card({ label, value, sub, tone = C.ink, icon: Icon }) {
  return <div className="rounded-xl bg-white border p-4 shadow-sm" style={{ borderColor: C.line }}>
    <div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.mute }}>{label}</span>{Icon && <Icon size={17} style={{ color: tone }} />}</div>
    <div className="text-2xl font-bold mt-1" style={{ color: tone }}>{value}</div>{sub && <div className="text-[11px] mt-1" style={{ color: C.mute }}>{sub}</div>}
  </div>;
}
function Field({ label, value, onChange, suffix, min = 0, step = 1, disabled = false }) {
  return <label className="block"><span className="block text-[11px] font-semibold mb-1" style={{ color: C.mute }}>{label}</span><div className="relative"><input type="number" value={value} min={min} step={step} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 pr-12 text-sm disabled:bg-slate-50" style={{ borderColor: C.line, color: C.ink }} />{suffix && <span className="absolute right-3 top-2 text-xs" style={{ color: C.mute }}>{suffix}</span>}</div></label>;
}
function Notice({ type = 'warn', children }) {
  const style = type === 'bad' ? { bg: '#F5E3E8', fg: C.bad, Icon: AlertTriangle } : type === 'ok' ? { bg: '#F0E4E8', fg: C.ok, Icon: CheckCircle2 } : { bg: '#fff8e6', fg: C.warn, Icon: AlertTriangle };
  const Icon = style.Icon;
  return <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: style.bg, color: style.fg }}><Icon size={15} className="mt-0.5 shrink-0" /><span>{children}</span></div>;
}

function defaultsFor(accounts, month) {
  const days = workdays(month);
  const target = (category) => (accounts || []).filter((a) => a.umowa === 'UOP' && roleCategory(a) === category).reduce((n, a) => n + targetFor(a, month), 0);
  const median = (xs, fallback) => { const a = xs.filter((x) => Number.isFinite(x) && x > 0).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : fallback; };
  const rate = (category, fallback) => median((accounts || []).filter((a) => roleCategory(a) === category).map((a) => a.umowa === 'UOP' ? Number(a.stawka || 0) * 1.1948 / Math.max(1, targetFor(a, month)) : Number(a.stawka || 0) * (a.zus ? 1.1948 : 1) + 2), fallback);
  return {
    monthlySales: 0, monthlyTransactions: 0, scenario: 'BASE', employeeHours: {},
    settings: {
      historyWeeks: 8, targetSplh: 420, targetMpt: 4, indirectPct: 0.12, colTargetPct: 20, employerRate: 0.1948, managerToleranceHours: 10, holidays: [],
      fixedHours: { manager: Math.round(target('manager') * 4) / 4, functionalManager: Math.round(target('functionalManager') * 4) / 4, training: 0, managerTraining: 0 },
      rates: { crew: +rate('crew', 36).toFixed(2), manager: +rate('manager', 54).toFixed(2), functionalManager: +rate('functionalManager', 47).toFixed(2), training: +rate('crew', 36).toFixed(2), managerTraining: +rate('functionalManager', 50).toFixed(2) },
    },
    _workdays: days,
  };
}

function HourlyProfile({ day }) {
  const rows = useMemo(() => {
    if (!day || !Array.isArray(day.slots)) return [];
    return Array.from({ length: 24 }, (_, hour) => {
      const slots = day.slots.slice(hour * 4, hour * 4 + 4);
      return { time: slots[0] && slots[0].time, sales: slots.reduce((a, x) => a + x.sales, 0), checks: slots.reduce((a, x) => a + x.transactions, 0), required: Math.max(...slots.map((x) => x.requiredPeople), 0), planned: Math.max(...slots.map((x) => x.plannedPeople), 0) };
    });
  }, [day]);
  const max = Math.max(1, ...rows.map((x) => Math.max(x.required, x.planned)));
  return <div className="rounded-xl border bg-white p-4" style={{ borderColor: C.line }}>
    <div className="flex items-center gap-2 mb-3"><Clock3 size={17} style={{ color: C.dark }} /><h3 className="font-bold text-sm" style={{ color: C.ink }}>Profil 15-minutowy · {day.date}</h3><span className="text-[11px]" style={{ color: C.mute }}>96 slotów, podgląd zagregowany do godzin</span></div>
    <div className="grid grid-cols-6 md:grid-cols-12 xl:grid-cols-24 gap-1.5">{rows.map((r) => <div key={r.time} className="min-w-0"><div className="h-20 rounded-md relative overflow-hidden" style={{ backgroundColor: C.pale }}><div className="absolute bottom-0 left-0 w-1/2" style={{ height: `${r.required / max * 100}%`, backgroundColor: C.blue }} /><div className="absolute bottom-0 right-0 w-1/2" style={{ height: `${r.planned / max * 100}%`, backgroundColor: C.teal }} /></div><div className="text-[9px] text-center mt-1" style={{ color: C.mute }}>{r.time}</div><div className="text-[9px] text-center font-semibold" style={{ color: C.ink }}>{number(r.required)} / {number(r.planned)}</div></div>)}</div>
    <div className="flex gap-4 mt-3 text-[10px]" style={{ color: C.mute }}><span><i className="inline-block w-2 h-2 mr-1" style={{ backgroundColor: C.blue }} />wymagana obsada</span><span><i className="inline-block w-2 h-2 mr-1" style={{ backgroundColor: C.teal }} />planowana obsada</span></div>
  </div>;
}

export default function MonthlyForecast({ api, data }) {
  const accounts = data.accounts || [];
  const [month, setMonth] = useState(nextMonth());
  const [form, setForm] = useState(() => defaultsFor(accounts, nextMonth()));
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [edit, setEdit] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);

  // Konta są dociągane asynchronicznie razem z resztą panelu. Dla nowego miesiąca
  // uzupełniamy domyślne godziny MGR dopiero, gdy lista pracowników jest gotowa.
  useEffect(() => {
    if (!plan && accounts.length) setForm((current) => {
      const next = defaultsFor(accounts, month);
      return { ...next, monthlySales: current.monthlySales, monthlyTransactions: current.monthlyTransactions, scenario: current.scenario || 'BASE' };
    });
  }, [accounts.length, month, plan]);

  const setSetting = (key, value) => setForm((f) => ({ ...f, settings: { ...f.settings, [key]: value } }));
  const setFixed = (key, value) => setForm((f) => ({ ...f, settings: { ...f.settings, fixedHours: { ...f.settings.fixedHours, [key]: Number(value) || 0 } } }));
  const setRate = (key, value) => setForm((f) => ({ ...f, settings: { ...f.settings, rates: { ...f.settings.rates, [key]: Number(value) || 0 } } }));

  const hydrate = (p) => {
    setPlan(p);
    if (p) {
      setForm({ monthlySales: p.input.monthlySales, monthlyTransactions: p.input.monthlyTransactions, scenario: p.scenario || 'BASE', employeeHours: p.input.employeeHours || {}, settings: p.input.settings });
      setSelectedDay((old) => old && p.days.some((d) => d.date === old) ? old : p.days[0]?.date);
    }
  };

  const load = async (target = month) => {
    setBusy(true); setError('');
    try { const r = await api(`/monthly-forecast?month=${target}`); if (!r.success) throw new Error(r.error || 'Nie udało się pobrać Forecast.'); if (r.exists) hydrate(r.plan); else { setPlan(null); setForm(defaultsFor(accounts, target)); setSelectedDay(null); } }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  useEffect(() => { load(month); }, [month]);

  const generate = async () => {
    setBusy(true); setError('');
    try {
      const r = await api('/monthly-forecast?action=generate', 'POST', { month, monthlySales: Number(form.monthlySales), monthlyTransactions: Number(form.monthlyTransactions), scenario: form.scenario, settings: form.settings, employeeHours: form.employeeHours || {}, expectedVersion: plan ? plan.version : 0, keepOverrides: true });
      if (!r.success) throw new Error((r.errors || [r.error]).join(' ')); hydrate(r.plan); data.show('Forecast miesiąca przeliczony i zapisany.');
    } catch (e) { setError(e.message); data.show(e.message, 'error'); } finally { setBusy(false); }
  };
  const lock = async () => {
    setBusy(true); setError('');
    try { const r = await api('/monthly-forecast?action=lock', 'POST', { month, expectedVersion: plan.version }); if (!r.success) throw new Error([r.error, ...(r.errors || r.violations || [])].filter(Boolean).join(' ')); hydrate(r.plan); data.show('Forecast zablokowany — grafik nie przekroczy limitów.'); }
    catch (e) { setError(e.message); data.show(e.message, 'error'); } finally { setBusy(false); }
  };
  const unlock = async () => {
    const reason = prompt('Podaj powód odblokowania Forecast (wpis trafi do audytu):'); if (!reason) return;
    setBusy(true); setError('');
    try { const r = await api('/monthly-forecast?action=unlock', 'POST', { month, expectedVersion: plan.version, reason }); if (!r.success) throw new Error(r.error); hydrate(r.plan); data.show('Forecast odblokowany do korekty.'); }
    catch (e) { setError(e.message); data.show(e.message, 'error'); } finally { setBusy(false); }
  };
  const saveDay = async () => {
    if (!edit || !edit.reason.trim()) { setError('Korekta dnia wymaga uzasadnienia.'); return; }
    setBusy(true); setError('');
    try {
      const patch = { sales: Number(edit.sales), transactions: Number(edit.transactions), hours: Object.fromEntries(CATEGORIES.map(([c]) => [c, Number(edit.hours[c]) || 0])) };
      const r = await api('/monthly-forecast?action=adjust', 'POST', { month, expectedVersion: plan.version, date: edit.date, patch, reason: edit.reason });
      if (!r.success) throw new Error((r.errors || [r.error]).join(' ')); hydrate(r.plan); setEdit(null); data.show(`Korekta ${edit.date} zapisana; pozostałe dni zbilansowano ponownie.`);
    } catch (e) { setError(e.message); data.show(e.message, 'error'); } finally { setBusy(false); }
  };
  const clearDay = async () => {
    const reason = prompt('Podaj powód usunięcia korekty:'); if (!reason) return;
    setBusy(true);
    try { const r = await api('/monthly-forecast?action=clear-adjustment', 'POST', { month, expectedVersion: plan.version, date: edit.date, reason }); if (!r.success) throw new Error(r.error); hydrate(r.plan); setEdit(null); data.show('Korekta usunięta; przywrócono rozkład historyczny.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const selected = plan && plan.days.find((d) => d.date === selectedDay);
  const contractRows = plan ? plan.contracts : accounts.filter((a) => a.umowa === 'UOP').map((a) => ({ accountId: a.id, name: a.name, category: roleCategory(a), targetHours: targetFor(a, month), minHours: targetFor(a, month) - (roleCategory(a) === 'crew' ? 0 : 10), maxHours: targetFor(a, month) + (roleCategory(a) === 'crew' ? 0 : 10), plannedHours: targetFor(a, month) }));

  return <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: C.pale }}>
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b px-6 py-3 bg-white/95 backdrop-blur" style={{ borderColor: C.line }}>
      <div className="mr-auto"><div className="flex items-center gap-2"><TrendingUp size={20} style={{ color: C.dark }} /><h1 className="font-bold" style={{ color: C.ink }}>Forecast miesiąca i Cost of Labour</h1>{plan && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: plan.status === 'LOCKED' ? '#F0E4E8' : '#fff8e6', color: plan.status === 'LOCKED' ? C.ok : C.warn }}>{plan.status === 'LOCKED' ? 'ZABLOKOWANY' : 'ROBOCZY'} · v{plan.version}</span>}</div><p className="text-[11px] mt-0.5" style={{ color: C.mute }}>Sprzedaż i transakcje → rozkład historyczny → godziny → COL → limit grafiku</p></div>
      <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: C.line, color: C.ink }} />
      <button onClick={() => load()} disabled={busy} className="rounded-lg px-3 py-2 text-sm flex items-center gap-2" style={{ backgroundColor: C.pale, color: C.dark }}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} />Odśwież</button>
      {plan && (plan.status === 'LOCKED' ? <button onClick={unlock} disabled={busy} className="rounded-lg px-3 py-2 text-sm font-semibold flex items-center gap-2" style={{ backgroundColor: '#fff8e6', color: C.warn }}><Unlock size={15} />Odblokuj</button> : <button onClick={lock} disabled={busy || !plan.valid} className="rounded-lg px-3 py-2 text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-40" style={{ backgroundColor: C.ok }}><Lock size={15} />Zatwierdź i zablokuj</button>)}
    </div>

    <div className="p-6 space-y-5">
      {error && <Notice type="bad">{error}</Notice>}
      <div className="rounded-xl bg-white border p-4 shadow-sm" style={{ borderColor: C.line }}>
        <div className="flex items-center gap-2 mb-4"><SlidersHorizontal size={17} style={{ color: C.dark }} /><h2 className="font-bold text-sm" style={{ color: C.ink }}>Założenia miesiąca</h2><span className="text-[11px]" style={{ color: C.mute }}>Rozkład dni pochodzi z historii; sumy wpisane poniżej nie zmienią się.</span></div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <Field label="Planowana sprzedaż" value={form.monthlySales} onChange={(v) => setForm((f) => ({ ...f, monthlySales: v }))} suffix="zł" disabled={plan?.status === 'LOCKED'} />
          <Field label="Transakcje" value={form.monthlyTransactions} onChange={(v) => setForm((f) => ({ ...f, monthlyTransactions: v }))} suffix="szt." disabled={plan?.status === 'LOCKED'} />
          <Field label="Docelowy COL" value={form.settings.colTargetPct} onChange={(v) => setSetting('colTargetPct', Number(v) || 0)} suffix="%" step="0.1" disabled={plan?.status === 'LOCKED'} />
          <Field label="Docelowy SPLH" value={form.settings.targetSplh} onChange={(v) => setSetting('targetSplh', Number(v) || 0)} suffix="zł/h" disabled={plan?.status === 'LOCKED'} />
          <Field label="Docelowy MPT" value={form.settings.targetMpt} onChange={(v) => setSetting('targetMpt', Number(v) || 0)} suffix="min" step="0.1" disabled={plan?.status === 'LOCKED'} />
          <Field label="Godziny MGR" value={form.settings.fixedHours.manager} onChange={(v) => setFixed('manager', v)} suffix="h" step="0.25" disabled={plan?.status === 'LOCKED'} />
          <Field label="MGR funkcyjne" value={form.settings.fixedHours.functionalManager} onChange={(v) => setFixed('functionalManager', v)} suffix="h" step="0.25" disabled={plan?.status === 'LOCKED'} />
          <div className="flex items-end"><button onClick={generate} disabled={busy || plan?.status === 'LOCKED' || Number(form.monthlySales) <= 0} className="w-full rounded-lg px-3 py-2 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-40" style={{ backgroundColor: C.dark }}><BarChart3 size={16} />{plan ? 'Przelicz plan' : 'Generuj plan'}</button></div>
        </div>
        <button onClick={() => setAdvanced((x) => !x)} className="mt-3 text-xs font-semibold flex items-center gap-1" style={{ color: C.dark }}>{advanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}Parametry zaawansowane</button>
        {advanced && <div className="mt-3 pt-3 border-t space-y-4" style={{ borderColor: C.line }}>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            <Field label="Okno historii" value={form.settings.historyWeeks} onChange={(v) => setSetting('historyWeeks', Number(v) || 0)} suffix="tyg." disabled={plan?.status === 'LOCKED'} />
            <Field label="Indirect work" value={Number(form.settings.indirectPct || 0) * 100} onChange={(v) => setSetting('indirectPct', (Number(v) || 0) / 100)} suffix="%" step="1" disabled={plan?.status === 'LOCKED'} />
            <Field label="Tolerancja MGR" value={form.settings.managerToleranceHours} onChange={(v) => setSetting('managerToleranceHours', Number(v) || 0)} suffix="± h" step="1" disabled={plan?.status === 'LOCKED'} />
            <Field label="Godziny szkoleniowe" value={form.settings.fixedHours.training} onChange={(v) => setFixed('training', v)} suffix="h" step="0.25" disabled={plan?.status === 'LOCKED'} />
            <Field label="MGR szkoleniowe" value={form.settings.fixedHours.managerTraining} onChange={(v) => setFixed('managerTraining', v)} suffix="h" step="0.25" disabled={plan?.status === 'LOCKED'} />
            <label className="block md:col-span-3"><span className="block text-[11px] font-semibold mb-1" style={{ color: C.mute }}>Święta / dni obniżające nominał</span><input value={(form.settings.holidays || []).join(', ')} disabled={plan?.status === 'LOCKED'} onChange={(e) => setSetting('holidays', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder={`${month}-01, ${month}-15`} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.line }} /></label>
          </div>
          <div><div className="text-[11px] font-bold uppercase mb-2" style={{ color: C.mute }}>Pełny koszt godziny według kategorii</div><div className="grid grid-cols-2 md:grid-cols-5 gap-3">{CATEGORIES.map(([c, label]) => <Field key={c} label={label} value={form.settings.rates[c]} onChange={(v) => setRate(c, v)} suffix="zł/h" step="0.01" disabled={plan?.status === 'LOCKED'} />)}</div></div>
        </div>}
      </div>

      {plan && <>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <Card label="Sprzedaż" value={`${money(plan.totals.sales)} zł`} sub="dokładnie jak plan miesiąca" icon={TrendingUp} />
          <Card label="Transakcje" value={Math.round(plan.totals.transactions).toLocaleString('pl-PL')} sub={`AGC ${money(plan.totals.sales / Math.max(1, plan.totals.transactions))} zł`} icon={BarChart3} />
          <Card label="Godziny total" value={`${number(plan.totals.hours.total)} h`} sub={`popyt ${number(plan.totals.demandHours)} h`} icon={Clock3} />
          <Card label="COL" value={`${money(plan.totals.cost)} zł`} sub={`${number(plan.totals.colPct, 2)}% sprzedaży`} tone={plan.totals.headroom < 0 ? C.bad : C.ok} icon={ShieldCheck} />
          <Card label="Limit kosztu" value={`${money(plan.totals.targetCost)} zł`} sub={`bufor ${money(plan.totals.headroom)} zł`} tone={plan.totals.headroom < 0 ? C.bad : C.dark} icon={Lock} />
          <Card label="SPLH planu" value={`${number(plan.totals.splh)} zł/h`} sub={`cel ${form.settings.targetSplh} zł/h`} tone={plan.totals.splh < form.settings.targetSplh ? C.warn : C.ok} />
          <Card label="MPT planu" value={`${number(plan.totals.mpt, 2)} min`} sub={`cel ${form.settings.targetMpt} min`} tone={plan.totals.mpt > form.settings.targetMpt ? C.warn : C.ok} />
          <Card label="Historia" value={plan.historyQuality.confidence} sub={`${plan.historyQuality.salesDays} dni sales · ${plan.historyQuality.transactionDays} dni traffic`} tone={plan.historyQuality.confidence === 'LOW' ? C.warn : C.ok} />
        </div>

        {(plan.errors || []).map((x, i) => <Notice key={`e${i}`} type="bad">{x}</Notice>)}
        {(plan.warnings || []).map((x, i) => <Notice key={`w${i}`}>{x}</Notice>)}
        {plan.valid && <Notice type="ok">Plan bilansuje sprzedaż i transakcje, zapewnia minima UOP oraz mieści się w ustawionym limicie COL. Po zablokowaniu limity będą egzekwowane również podczas edycji grafiku.</Notice>}

        <div className="grid xl:grid-cols-[1.2fr_1fr] gap-4">
          <div className="rounded-xl bg-white border overflow-hidden" style={{ borderColor: C.line }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: C.line }}><Users size={17} style={{ color: C.dark }} /><h3 className="font-bold text-sm" style={{ color: C.ink }}>Podział godzin i kosztów</h3></div>
            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] px-4 py-2 text-[10px] font-bold uppercase" style={{ backgroundColor: C.pale, color: C.mute }}><span>Kategoria</span><span className="text-right">Godziny</span><span className="text-right">Minimum UOP</span><span className="text-right">Koszt</span></div>
            {CATEGORIES.map(([c, label, color]) => <div key={c} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] px-4 py-2.5 text-sm border-t" style={{ borderColor: '#F3EFF0' }}><span className="font-semibold flex items-center gap-2" style={{ color: C.ink }}><i className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />{label}</span><span className="text-right font-bold" style={{ color }}>{number(plan.totals.hours[c])} h</span><span className="text-right" style={{ color: C.mute }}>{number(plan.totals.contractHoursByCategory[c])} h</span><span className="text-right" style={{ color: C.ink }}>{money(plan.totals.costByCategory[c])} zł</span></div>)}
          </div>
          <div className="rounded-xl bg-white border overflow-hidden" style={{ borderColor: C.line }}>
            <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: C.line }}><ShieldCheck size={17} style={{ color: C.dark }} /><h3 className="font-bold text-sm" style={{ color: C.ink }}>Kontrola grafiku względem planu</h3></div>
            {plan.compliance ? <><div className="grid grid-cols-3 gap-3 p-4"><Card label="Zaplanowano w grafiku" value={`${number(plan.compliance.hours.total)} h`} sub={`zostało ${number(plan.compliance.hoursHeadroom)} h`} /><Card label="Koszt grafiku" value={`${money(plan.compliance.cost)} zł`} sub={`bufor ${money(plan.compliance.costHeadroom)} zł`} tone={plan.compliance.ok ? C.ok : C.bad} /><Card label="Status" value={plan.compliance.ok ? 'ZGODNY' : 'PRZEKROCZENIE'} sub={plan.status === 'LOCKED' ? 'blokada aktywna' : 'kontrola informacyjna'} tone={plan.compliance.ok ? C.ok : C.bad} /></div>{(plan.compliance.violations || []).map((v, i) => <div key={i} className="mx-4 mb-2"><Notice type="bad">{v}</Notice></div>)}</> : <div className="p-6 text-sm" style={{ color: C.mute }}>Brak grafiku dla tego miesiąca. Limit zacznie działać przy dodawaniu zmian.</div>}
          </div>
        </div>

        <div className="rounded-xl bg-white border overflow-hidden" style={{ borderColor: C.line }}>
          <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2" style={{ borderColor: C.line }}><Users size={17} style={{ color: C.dark }} /><h3 className="font-bold text-sm" style={{ color: C.ink }}>Gwarancja godzin UOP</h3><span className="text-[11px]" style={{ color: C.mute }}>MGR: etat ± {form.settings.managerToleranceHours} h; crew: dokładny nominał. Nominał można nadpisać i przeliczyć plan.</span></div>
          {!contractRows.length ? <div className="p-5 text-sm" style={{ color: C.mute }}>Brak pracowników UOP w module Pracownicy.</div> : <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[1.5fr_1fr_100px_100px_100px_150px] px-4 py-2 text-[10px] font-bold uppercase" style={{ backgroundColor: C.pale, color: C.mute }}><span>Pracownik</span><span>Kategoria</span><span className="text-right">Minimum</span><span className="text-right">Plan</span><span className="text-right">Maksimum</span><span className="text-right">Nominał do silnika</span></div>{contractRows.map((r) => <div key={r.accountId} className="grid grid-cols-[1.5fr_1fr_100px_100px_100px_150px] items-center px-4 py-2 border-t text-sm" style={{ borderColor: '#F3EFF0' }}><span className="font-semibold" style={{ color: C.ink }}>{r.name}</span><span style={{ color: C.mute }}>{CATEGORIES.find(([c]) => c === r.category)?.[1] || r.category}</span><span className="text-right">{number(r.minHours)} h</span><span className="text-right font-bold" style={{ color: r.plannedHours < r.minHours || r.plannedHours > r.maxHours ? C.bad : C.ok }}>{number(r.plannedHours)} h</span><span className="text-right">{number(r.maxHours)} h</span><span className="text-right"><input type="number" step="0.25" disabled={plan.status === 'LOCKED'} value={form.employeeHours[r.accountId] ?? r.targetHours} onChange={(e) => setForm((f) => ({ ...f, employeeHours: { ...f.employeeHours, [r.accountId]: Number(e.target.value) || 0 } }))} className="w-24 rounded border px-2 py-1 text-right disabled:bg-slate-50" style={{ borderColor: C.line }} /></span></div>)}</div></div>}
        </div>

        <div className="rounded-xl bg-white border overflow-hidden" style={{ borderColor: C.line }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: C.line }}><BarChart3 size={17} style={{ color: C.dark }} /><h3 className="font-bold text-sm" style={{ color: C.ink }}>Plan dzień po dniu</h3><span className="text-[11px]" style={{ color: C.mute }}>Kliknij dzień, aby podejrzeć 96 slotów. Edycja dnia automatycznie przelicza pozostałą część miesiąca.</span></div>
          <div className="overflow-x-auto"><div className="min-w-[1280px]"><div className="grid grid-cols-[105px_115px_90px_repeat(5,100px)_100px_100px_86px] px-3 py-2 text-[9px] font-bold uppercase" style={{ backgroundColor: C.pale, color: C.mute }}><span>Dzień</span><span className="text-right">Sprzedaż</span><span className="text-right">Trans.</span>{CATEGORIES.map(([, label]) => <span key={label} className="text-right">{label}</span>)}<span className="text-right">Total</span><span className="text-right">COL</span><span /></div>{plan.days.map((d) => <button key={d.date} onClick={() => setSelectedDay(d.date)} className="w-full grid grid-cols-[105px_115px_90px_repeat(5,100px)_100px_100px_86px] items-center px-3 py-2 border-t text-xs text-left hover:bg-slate-50" style={{ borderColor: '#F3EFF0', backgroundColor: selectedDay === d.date ? '#eef7f5' : undefined }}><span className="font-semibold" style={{ color: C.ink }}>{DOW[d.dow]} {d.date.slice(8)}.{d.date.slice(5, 7)}{d.source === 'MANAGER_OVERRIDE' && <i className="ml-1 not-italic text-[9px]" style={{ color: C.warn }}>●</i>}</span><span className="text-right">{money(d.sales)}</span><span className="text-right">{d.transactions}</span>{CATEGORIES.map(([c]) => <span key={c} className="text-right">{number(d.hours[c])}</span>)}<span className="text-right font-bold">{number(d.hours.total)} h</span><span className="text-right" style={{ color: d.colPct > form.settings.colTargetPct ? C.bad : C.ok }}>{money(d.cost)} zł</span><span className="text-right"><span onClick={(e) => { e.stopPropagation(); setEdit({ date: d.date, sales: d.sales, transactions: d.transactions, hours: { ...d.hours }, reason: d.overrideReason || '' }); }} className="inline-block rounded px-2 py-1 font-semibold" style={{ backgroundColor: C.pale, color: C.dark }}>{plan.status === 'LOCKED' ? 'Podgląd' : 'Koryguj'}</span></span></button>)}</div></div>
        </div>
        {selected && <HourlyProfile day={selected} />}
      </>}
    </div>

    {edit && <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"><div className="absolute inset-0 bg-black/50" onClick={() => setEdit(null)} /><div className="relative bg-white rounded-2xl w-full max-w-4xl p-6 shadow-xl">
      <div className="flex items-center gap-2 mb-1"><Save size={19} style={{ color: C.dark }} /><h3 className="font-bold" style={{ color: C.ink }}>Korekta dnia {edit.date}</h3></div><p className="text-xs mb-4" style={{ color: C.mute }}>Zmienione wartości zostaną przypięte. Różnicę silnik rozdzieli między pozostałe nieprzypięte dni, zachowując sumę miesiąca.</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Field label="Sprzedaż" value={edit.sales} onChange={(v) => setEdit((x) => ({ ...x, sales: v }))} suffix="zł" disabled={plan.status === 'LOCKED'} /><Field label="Transakcje" value={edit.transactions} onChange={(v) => setEdit((x) => ({ ...x, transactions: v }))} suffix="szt." disabled={plan.status === 'LOCKED'} />{CATEGORIES.map(([c, label]) => <Field key={c} label={label} value={edit.hours[c]} onChange={(v) => setEdit((x) => ({ ...x, hours: { ...x.hours, [c]: v } }))} suffix="h" step="0.25" disabled={plan.status === 'LOCKED'} />)}</div>
      <label className="block mt-4"><span className="block text-[11px] font-semibold mb-1" style={{ color: C.mute }}>Uzasadnienie korekty — wymagane</span><input value={edit.reason} disabled={plan.status === 'LOCKED'} onChange={(e) => setEdit((x) => ({ ...x, reason: e.target.value }))} placeholder="np. promocja, święto, lokalne wydarzenie, korekta budżetu" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.line }} /></label>
      <div className="flex justify-between gap-2 mt-5"><div>{plan.overrides?.[edit.date] && plan.status !== 'LOCKED' && <button onClick={clearDay} className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: '#F5E3E8', color: C.bad }}>Usuń korektę</button>}</div><div className="flex gap-2"><button onClick={() => setEdit(null)} className="rounded-lg px-4 py-2 text-sm" style={{ backgroundColor: C.pale, color: C.dark }}>Zamknij</button>{plan.status !== 'LOCKED' && <button onClick={saveDay} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ backgroundColor: C.dark }}>Zapisz i przelicz</button>}</div></div>
    </div></div>}
  </div>;
}
