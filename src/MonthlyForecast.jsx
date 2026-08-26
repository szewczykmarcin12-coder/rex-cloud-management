import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Check, ChevronDown, ChevronUp, ChevronRight, Clock3, Lock, RefreshCw, Save, ShieldCheck, SlidersHorizontal, TrendingUp, Unlock, Users, Download, Target, Calendar, Sparkles, Gauge, CircleDollarSign, Wallet } from 'lucide-react';

const MHd = ({ kicker, title, copy, children }) => (
  <div className="module-heading"><div><span>{kicker}</span><h1>{title}</h1><p>{copy}</p></div>{children && <div className="module-actions">{children}</div>}</div>
);
const MMt = ({ label, value, helper, tone = 'blue', icon: Icon }) => (
  <article className="mini-metric"><div className={`mini-metric-icon ${tone}`}><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small>{helper}</small></article>
);
const SCEN_F = { BASE: [1, 1], GROWTH: [1.08, 1.06], EVENT: [1.045, 1.05] };

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
      const [fS, fT] = SCEN_F[form.scenario] || SCEN_F.BASE;
      const r = await api('/monthly-forecast?action=generate', 'POST', { month, monthlySales: Math.round(Number(form.monthlySales) * fS), monthlyTransactions: Math.round(Number(form.monthlyTransactions) * fT), scenario: form.scenario, settings: form.settings, employeeHours: form.employeeHours || {}, expectedVersion: plan ? plan.version : 0, keepOverrides: true });
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

  const mcLabel = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(month + '-01T12:00:00'));
  const locked = plan && plan.status === 'LOCKED';
  const t = plan && plan.totals;
  const maxSales = plan ? Math.max(1, ...plan.days.map((d) => d.sales)) : 1;
  const maxH = plan ? Math.max(1, ...plan.days.map((d) => d.hours.total)) : 1;
  const eksport = () => {
    if (!plan) return;
    const rows = ['Dzień;Sprzedaż;Transakcje;Godziny;Koszt;COL %', ...plan.days.map((d) => `${d.date};${d.sales};${d.transactions};${d.hours.total.toFixed(2)};${d.cost.toFixed(2)};${d.colPct.toFixed(2)}`)];
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(blob); const el = document.createElement('a'); el.href = u; el.download = `prognoza-${month}.csv`; el.click(); URL.revokeObjectURL(u);
  };
  const uopSuma = t ? CATEGORIES.reduce((n, [c]) => n + (t.contractHoursByCategory[c] || 0), 0) : 0;
  const MIX_KOLOR = { crew: '#741334', manager: '#5A3542', functionalManager: '#A7465F', training: '#B86D82', managerTraining: '#8E1B3C' };

  return <div className="flex-1 min-h-0 overflow-y-auto">
    <div className="page-wrap module-view forecast-view" style={{ width: '100%' }}>
      <MHd kicker={`PLAN MIESIĘCZNY • ${mcLabel.toUpperCase()}${plan ? ` • ${locked ? 'ZABLOKOWANY' : 'ROBOCZY'} v${plan.version}` : ''}`} title="Planowanie i popyt" copy="Rozłóż plan sprzedaży i transakcji na dni oraz przełóż popyt na godziny, role i limit COL.">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="secondary-action" style={{ font: 'inherit' }} />
        <button className="secondary-action" onClick={eksport} disabled={!plan}><Download size={16} /> Eksport</button>
        {plan && (locked
          ? <button className="secondary-action" onClick={unlock} disabled={busy}><Unlock size={16} /> Odblokuj</button>
          : <button className="primary-action" onClick={lock} disabled={busy || !plan.valid}><Lock size={16} /> Zapisz wersję i zablokuj</button>)}
      </MHd>

      {error && <Notice type="bad">{error}</Notice>}

      <section className="forecast-layout">
        <aside className="forecast-controls panel">
          <div className="panel-title"><div><span>ZAŁOŻENIA</span><h2>Budżet wejściowy</h2></div><SlidersHorizontal size={19} /></div>
          <label className="input-label">Planowana sprzedaż netto<div className="number-input"><input type="number" value={form.monthlySales} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, monthlySales: e.target.value }))} /><span>PLN</span></div></label>
          <label className="input-label">Planowane transakcje<div className="number-input"><input type="number" value={form.monthlyTransactions} disabled={locked} onChange={(e) => setForm((f) => ({ ...f, monthlyTransactions: e.target.value }))} /><span>trx</span></div></label>
          <label className="input-label">Docelowy Cost of Labour<div className="number-input"><input type="number" step="0.1" value={form.settings.colTargetPct} disabled={locked} onChange={(e) => setSetting('colTargetPct', Number(e.target.value) || 0)} /><span>%</span></div></label>
          <div className="control-divider" />
          <label className="input-label">Scenariusz popytu</label>
          <div className="scenario-list">
            <button className={form.scenario === 'BASE' ? 'active' : ''} disabled={locked} onClick={() => setForm((f) => ({ ...f, scenario: 'BASE' }))}><i><Target size={16} /></i><div><strong>Bazowy</strong><span>trend i sezonowość</span></div><Check size={15} /></button>
            <button className={form.scenario === 'GROWTH' ? 'active' : ''} disabled={locked} onClick={() => setForm((f) => ({ ...f, scenario: 'GROWTH' }))}><i><TrendingUp size={16} /></i><div><strong>Wzrost +8%</strong><span>kampania produktowa</span></div><Check size={15} /></button>
            <button className={form.scenario === 'EVENT' ? 'active' : ''} disabled={locked} onClick={() => setForm((f) => ({ ...f, scenario: 'EVENT' }))}><i><Calendar size={16} /></i><div><strong>Eventy lokalne</strong><span>+4,5% wieczory szczytowe</span></div><Check size={15} /></button>
          </div>
          <div className="model-note"><Sparkles size={16} /><div><strong>Model hybrydowy</strong><span>historia POS {form.settings.historyWeeks} tyg., kalendarz, święta i korekty managera</span></div></div>
          <button className="generate-button" disabled={busy || locked || Number(form.monthlySales) <= 0} onClick={generate}><BarChart3 size={17} /> {busy ? 'Przeliczam…' : plan ? 'Przelicz i wygeneruj plan' : 'Generuj plan'}</button>
        </aside>

        <div className="forecast-main">
          <section className="forecast-kpis">
            <MMt icon={CircleDollarSign} label="Sprzedaż" value={t ? `${Math.round(t.sales).toLocaleString('pl-PL')} zł` : '—'} helper={t ? `${Math.round(t.sales / plan.days.length).toLocaleString('pl-PL')} zł / dzień` : 'wygeneruj plan'} tone="blue" />
            <MMt icon={Wallet} label="Budżet COL" value={t ? `${Math.round(t.targetCost).toLocaleString('pl-PL')} zł` : '—'} helper={t ? `${number(form.settings.colTargetPct)}% sprzedaży • bufor ${Math.round(t.headroom).toLocaleString('pl-PL')} zł` : '—'} tone={t && t.headroom < 0 ? 'coral' : 'mint'} />
            <MMt icon={Clock3} label="Godziny total" value={t ? `${number(t.hours.total)} h` : '—'} helper={t ? `${number(t.hours.total / plan.days.length)} h / dzień` : '—'} tone="violet" />
            <MMt icon={Gauge} label="SPLH" value={t ? `${number(t.splh)} zł` : '—'} helper={t ? `cel ${form.settings.targetSplh} zł/h • MPT ${number(t.mpt, 2)} min` : 'sprzedaż / roboczogodz.'} tone="mint" />
          </section>

          <article className="panel month-curve-panel">
            <div className="panel-title"><div><span>ROZKŁAD {plan ? plan.days.length : 30} DNI</span><h2>Prognoza sprzedaży i godzin</h2></div><div className="forecast-legend"><span><i className="sales-key" />Sprzedaż</span><span><i className="hours-key" />Godziny idealne</span></div></div>
            {plan ? (
              <div className="month-bars">
                {plan.days.map((d) => (
                  <div key={d.date} className={d.source === 'MANAGER_OVERRIDE' ? 'event-day' : ''} title={`${d.date}: ${money(d.sales)} zł • ${number(d.hours.total)} h • COL ${number(d.colPct, 1)}%`} onClick={() => setSelectedDay(d.date)} style={{ cursor: 'pointer' }}>
                    <i style={{ height: `${Math.max(16, d.sales / maxSales * 100)}%` }}><b style={{ height: `${d.hours.total / maxH * 72}%` }} /></i>
                    {Number(d.date.slice(8)) % 3 === 1 && <span>{d.date.slice(8)}.{d.date.slice(5, 7)}</span>}
                    {d.source === 'MANAGER_OVERRIDE' && <em>korekta</em>}
                  </div>
                ))}
              </div>
            ) : <div className="dialog-empty" style={{ padding: 30 }}>Ustaw założenia po lewej i kliknij „Generuj plan" — rozkład dni powstanie z historii POS.</div>}
            {plan && <div className="forecast-explain"><Sparkles size={17} /><span>Rozkład historyczny ({plan.historyQuality.confidence === 'LOW' ? 'niska pewność' : 'dobra pewność'}: {plan.historyQuality.salesDays} dni sprzedaży, {plan.historyQuality.transactionDays} dni ruchu). Minima UOP {plan.valid ? 'zapewnione' : 'niezapewnione'}.</span><button onClick={() => setAdvanced((x) => !x)}>Parametry</button></div>}
          </article>

          <div className="forecast-bottom-grid">
            <article className="panel hours-mix-panel">
              <div className="panel-title"><div><span>STRUKTURA PLANU</span><h2>Godziny według grup</h2></div><strong>{t ? `${number(t.hours.total, 0)} h` : '—'}</strong></div>
              {CATEGORIES.map(([c, label]) => (
                <div className="mix-row" key={c}><span><i style={{ background: MIX_KOLOR[c] }} />{label === 'MGR' ? 'Manager' : label}</span><div><b style={{ width: t ? `${(t.hours[c] || 0) / Math.max(1, t.hours.total) * 100}%` : 0, background: MIX_KOLOR[c] }} /></div><strong>{t ? `${number(t.hours[c], 0)} h` : '—'}</strong></div>
              ))}
              <div className="contract-guard"><ShieldCheck size={17} /><div><strong>UOP: {t ? `${number(uopSuma, 0)} h minimum` : '—'}</strong><span>Managerowie: etat ± {form.settings.managerToleranceHours} h • crew: nominał</span></div><b>{plan ? (plan.valid ? 'ZGODNE' : 'UWAGI') : '—'}</b></div>
            </article>

            <article className="panel plan-checks-panel">
              <div className="panel-title"><div><span>KONTROLA PLANU</span><h2>Warunki brzegowe</h2></div><CheckCircle2 size={20} /></div>
              {[
                ['Godziny kontraktowe UOP', plan ? (plan.valid ? '100%' : 'sprawdź') : '—', plan ? plan.valid : true],
                ['Stała obsada managerów', `${number(Number(form.settings.fixedHours.manager) + Number(form.settings.fixedHours.functionalManager), 0)} h`, true],
                ['Limit COL', t ? `${number(t.colPct, 2)}% / ${number(form.settings.colTargetPct)}%` : `${number(form.settings.colTargetPct)}%`, t ? t.headroom >= 0 : true],
                ['SPLH vs cel', t ? `${number(t.splh)} / ${form.settings.targetSplh} zł` : '—', t ? t.splh >= form.settings.targetSplh : true],
                ['Kontrola grafiku', plan && plan.compliance ? (plan.compliance.ok ? 'ZGODNY' : 'PRZEKROCZENIE') : 'brak grafiku', plan && plan.compliance ? plan.compliance.ok : true],
              ].map(([label, value, ok]) => (
                <div className="check-row" key={String(label)}><i className={ok ? 'ok' : 'warn'}>{ok ? <Check size={14} /> : <AlertTriangle size={14} />}</i><span>{label}</span><strong>{value}</strong></div>
              ))}
              <button className="full-secondary" onClick={() => setAdvanced((x) => !x)}>Otwórz reguły optymalizacji <ChevronRight size={16} /></button>
            </article>
          </div>
        </div>
      </section>

      {advanced && <article className="panel" style={{ marginTop: 14, padding: 18 }}>
        <div className="panel-title"><div><span>REGUŁY OPTYMALIZACJI</span><h2>Parametry zaawansowane</h2></div><SlidersHorizontal size={18} /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3" style={{ marginTop: 10 }}>
          <Field label="Docelowy SPLH" value={form.settings.targetSplh} onChange={(v) => setSetting('targetSplh', Number(v) || 0)} suffix="zł/h" disabled={locked} />
          <Field label="Docelowy MPT" value={form.settings.targetMpt} onChange={(v) => setSetting('targetMpt', Number(v) || 0)} suffix="min" step="0.1" disabled={locked} />
          <Field label="Godziny MGR" value={form.settings.fixedHours.manager} onChange={(v) => setFixed('manager', v)} suffix="h" step="0.25" disabled={locked} />
          <Field label="MGR funkcyjne" value={form.settings.fixedHours.functionalManager} onChange={(v) => setFixed('functionalManager', v)} suffix="h" step="0.25" disabled={locked} />
          <Field label="Godziny szkoleniowe" value={form.settings.fixedHours.training} onChange={(v) => setFixed('training', v)} suffix="h" step="0.25" disabled={locked} />
          <Field label="MGR szkoleniowe" value={form.settings.fixedHours.managerTraining} onChange={(v) => setFixed('managerTraining', v)} suffix="h" step="0.25" disabled={locked} />
          <Field label="Okno historii" value={form.settings.historyWeeks} onChange={(v) => setSetting('historyWeeks', Number(v) || 0)} suffix="tyg." disabled={locked} />
          <Field label="Tolerancja MGR" value={form.settings.managerToleranceHours} onChange={(v) => setSetting('managerToleranceHours', Number(v) || 0)} suffix="± h" step="1" disabled={locked} />
        </div>
        <div style={{ marginTop: 12 }}><div className="text-[11px] font-bold uppercase mb-2" style={{ color: C.mute }}>Pełny koszt godziny według kategorii</div><div className="grid grid-cols-2 md:grid-cols-5 gap-3">{CATEGORIES.map(([c, label]) => <Field key={c} label={label} value={form.settings.rates[c]} onChange={(v) => setRate(c, v)} suffix="zł/h" step="0.01" disabled={locked} />)}</div></div>
        <label className="block mt-3"><span className="block text-[11px] font-semibold mb-1" style={{ color: C.mute }}>Święta / dni obniżające nominał</span><input value={(form.settings.holidays || []).join(', ')} disabled={locked} onChange={(e) => setSetting('holidays', e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder={`${month}-01, ${month}-15`} className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.line }} /></label>
      </article>}

      {plan && <>
        {(plan.errors || []).map((x, i) => <div key={`e${i}`} style={{ marginTop: 10 }}><Notice type="bad">{x}</Notice></div>)}
        {(plan.warnings || []).map((x, i) => <div key={`w${i}`} style={{ marginTop: 10 }}><Notice>{x}</Notice></div>)}

        <article className="panel day-plan-panel" style={{ marginTop: 14 }}>
          <div className="panel-title"><div><span>PLAN DZIEŃ PO DNIU</span><h2>{mcLabel.charAt(0).toUpperCase() + mcLabel.slice(1)}</h2></div><span className="table-filter" style={{ cursor: 'default' }}>klik = profil 96 slotów • Koryguj = przypięcie dnia</span></div>
          <div className="data-table forecast-table">
            <div className="table-header"><span>Dzień</span><span>Sprzedaż</span><span>Transakcje</span><span>Godz. total</span><span>Koszt</span><span>Pokrycie</span><span>COL</span><span>Status</span></div>
            {plan.days.map((d) => (
              <div className="table-row" key={d.date} onClick={() => setSelectedDay(d.date)} style={{ cursor: 'pointer', background: selectedDay === d.date ? '#F7F1F3' : undefined }}>
                <span><b>{DOW[d.dow]}, {d.date.slice(8)}.{d.date.slice(5, 7)}</b>{d.source === 'MANAGER_OVERRIDE' && <small style={{ color: C.warn }}>korekta managera</small>}</span>
                <span><strong>{Math.round(d.sales).toLocaleString('pl-PL')} zł</strong></span>
                <span>{d.transactions}</span>
                <span>{number(d.hours.total)} h</span>
                <span>{Math.round(d.cost).toLocaleString('pl-PL')} zł</span>
                <span><i className="coverage-bar"><b style={{ width: `${Math.min(100, d.colPct / Math.max(0.1, form.settings.colTargetPct) * 100)}%` }} /></i>{number(d.colPct, 1)}%</span>
                <span className={d.colPct > form.settings.colTargetPct ? 'table-danger' : 'table-good'}>{number(d.colPct, 1)}%</span>
                <span><em className={d.colPct > form.settings.colTargetPct ? 'status-warning' : 'status-ready'} onClick={(e) => { e.stopPropagation(); setEdit({ date: d.date, sales: d.sales, transactions: d.transactions, hours: { ...d.hours }, reason: d.overrideReason || '' }); }} style={{ cursor: 'pointer' }}>{locked ? 'Podgląd' : 'Koryguj'}</em></span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel" style={{ marginTop: 14, overflow: 'hidden' }}>
          <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2" style={{ borderColor: C.line }}><Users size={17} style={{ color: C.dark }} /><h3 className="font-bold text-sm" style={{ color: C.ink }}>Gwarancja godzin UOP</h3><span className="text-[11px]" style={{ color: C.mute }}>MGR: etat ± {form.settings.managerToleranceHours} h; crew: dokładny nominał. Nominał można nadpisać i przeliczyć plan.</span></div>
          {!contractRows.length ? <div className="p-5 text-sm" style={{ color: C.mute }}>Brak pracowników UOP w module Pracownicy.</div> : <div className="overflow-x-auto"><div className="min-w-[760px]"><div className="grid grid-cols-[1.5fr_1fr_100px_100px_100px_150px] px-4 py-2 text-[10px] font-bold uppercase" style={{ backgroundColor: C.pale, color: C.mute }}><span>Pracownik</span><span>Kategoria</span><span className="text-right">Minimum</span><span className="text-right">Plan</span><span className="text-right">Maksimum</span><span className="text-right">Nominał do silnika</span></div>{contractRows.map((r) => <div key={r.accountId} className="grid grid-cols-[1.5fr_1fr_100px_100px_100px_150px] items-center px-4 py-2 border-t text-sm" style={{ borderColor: '#F3EFF0' }}><span className="font-semibold" style={{ color: C.ink }}>{r.name}</span><span style={{ color: C.mute }}>{CATEGORIES.find(([c]) => c === r.category)?.[1] || r.category}</span><span className="text-right">{number(r.minHours)} h</span><span className="text-right font-bold" style={{ color: r.plannedHours < r.minHours || r.plannedHours > r.maxHours ? C.bad : C.ok }}>{number(r.plannedHours)} h</span><span className="text-right">{number(r.maxHours)} h</span><span className="text-right"><input type="number" step="0.25" disabled={locked} value={form.employeeHours[r.accountId] ?? r.targetHours} onChange={(e) => setForm((f) => ({ ...f, employeeHours: { ...f.employeeHours, [r.accountId]: Number(e.target.value) || 0 } }))} className="w-24 rounded border px-2 py-1 text-right disabled:bg-slate-50" style={{ borderColor: C.line }} /></span></div>)}</div></div>}
        </article>

        {selected && <div style={{ marginTop: 14 }}><HourlyProfile day={selected} /></div>}
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
