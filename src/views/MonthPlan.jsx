import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Calendar, Check, CheckCircle2, Clock3, Lock, Plus, RefreshCw, Sparkles, Trash2, TrendingDown, TrendingUp, Unlock } from 'lucide-react';
import { api } from '../lib/api.js';
import { MHead, MMetric } from '../ui/primitives.jsx';

// ═══════════════════════════════════════════════════════════════════════════════
//  Prognozy i estymacja → Plan miesiąca
//  „Jest 20 września, planuję październik”: propozycja sprzedaży i transakcji w totalu z historii POS,
//  korekta z uzasadnieniem, limit godzin AOP, zatwierdzenie z wersją. Zatwierdzony plan jest JEDYNYM źródłem
//  sprzedaży, transakcji i limitu godzin dla Rozkładu miesiąca (P5), Automatycznego układania i Obsady.
// ═══════════════════════════════════════════════════════════════════════════════
const zl = (n) => n == null ? '—' : `${Math.round(n).toLocaleString('pl-PL')} zł`;
const num = (n) => n == null ? '—' : Math.round(n).toLocaleString('pl-PL');
const MIES = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const mcLabel = (m) => m ? `${MIES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '';
const i_of = (k) => Number(k) - 1;
const nastepnyMiesiac = () => { const d = new Date(); const x = new Date(d.getFullYear(), d.getMonth() + 1, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };

export const MonthPlan = ({ data, setPage }) => {
  const [month, setMonth] = useState(nastepnyMiesiac());
  const [res, setRes] = useState(null);
  const [blad, setBlad] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ sales: '', transactions: '', hoursAop: '', crewHours: '', reason: '' });
  const [paramsEdit, setParamsEdit] = useState(null);
  const [evForm, setEvForm] = useState({ name: '', typ: 'promo', from: '', to: '', upliftPct: '', note: '' });
  const [sezonEdit, setSezonEdit] = useState(null);
  const zapiszZdarzenie = async () => {
    const body = { ...evForm, to: evForm.to || evForm.from, upliftPct: evForm.typ === 'closure' ? -100 : evForm.upliftPct };
    const r = await api('/month-plan?action=event-save', 'POST', body);
    if (r && r.success) { data.show(`Zdarzenie „${r.event.name}” zapisane — propozycja, prognoza dzienna i rozkład P5 już je uwzględniają`); setEvForm({ name: '', typ: 'promo', from: '', to: '', upliftPct: '', note: '' }); zaladuj(); } else data.show((r && r.error) || 'Błąd zapisu zdarzenia', 'error');
  };
  const usunZdarzenie = async (id) => { if (!window.confirm('Usunąć zdarzenie?')) return; const r = await api('/month-plan?action=event-delete', 'POST', { id }); if (r && r.success) zaladuj(); else data.show((r && r.error) || 'Błąd', 'error'); };
  const zapiszSezon = async () => { const r = await api('/month-plan?action=season-save', 'POST', { manual: sezonEdit }); if (r && r.success) { data.show('Indeks sezonowy zapisany'); setSezonEdit(null); zaladuj(); } else data.show((r && r.error) || 'Błąd', 'error'); };
  const zaladuj = (m = month) => { setBlad(null); return api(`/month-plan?month=${m}`).then((r) => { if (r && r.success) { setRes(r); const p = r.plan; const pr = r.proposal; setForm({ sales: p ? p.sales : (pr && pr.ok ? pr.sales : ''), transactions: p ? p.transactions : (pr && pr.ok ? pr.transactions : ''), hoursAop: p && p.hoursAop != null ? p.hoursAop : '', crewHours: p && p.crewHours != null ? p.crewHours : '', reason: '' }); } else setBlad((r && r.error) || 'Nie udało się pobrać planu'); }).catch((e) => setBlad(e && e.message ? e.message : 'Brak połączenia z API')); };
  useEffect(() => { zaladuj(month); }, [month]);
  const plan = res && res.plan, prop = res && res.proposal, grafik = res && res.grafik;
  const approved = plan && plan.status === 'APPROVED';
  const odch = prop && prop.ok && Number(form.sales) > 0 ? (Number(form.sales) / prop.sales - 1) * 100 : null;
  const wymagaPowodu = odch != null && Math.abs(odch) > 3;
  const zapisz = async (source) => {
    setBusy(true);
    const body = { month, sales: Number(source === 'proposal' ? prop.sales : form.sales), transactions: Number(source === 'proposal' ? prop.transactions : form.transactions), hoursAop: form.hoursAop === '' ? null : Number(form.hoursAop), crewHours: form.crewHours === '' ? null : Number(form.crewHours), source, reason: form.reason, proposal: prop && prop.ok ? prop : null, expectedVersion: plan ? plan.version : 0 };
    const r = await api('/month-plan?action=save', 'POST', body);
    setBusy(false);
    if (r && r.success) { data.show(`Plan ${mcLabel(month)} zapisany (v${r.plan.version}, roboczy)`); zaladuj(); } else data.show((r && r.error) || 'Błąd zapisu', 'error');
  };
  const zatwierdz = async () => { setBusy(true); const r = await api('/month-plan?action=approve', 'POST', { month, expectedVersion: plan.version }); setBusy(false); if (r && r.success) { data.show(`Plan ${mcLabel(month)} zatwierdzony — P5, autoplan i obsada używają go od teraz`); zaladuj(); } else data.show((r && r.error) || 'Błąd zatwierdzenia', 'error'); };
  const otworz = async () => { const reason = window.prompt('Powód ponownego otwarcia zatwierdzonego planu (min. 3 znaki):'); if (!reason || reason.trim().length < 3) return; setBusy(true); const r = await api('/month-plan?action=reopen', 'POST', { month, expectedVersion: plan.version, reason }); setBusy(false); if (r && r.success) { data.show('Plan otwarty do edycji'); zaladuj(); } else data.show((r && r.error) || 'Błąd', 'error'); };
  const zapiszParams = async () => { const r = await api('/month-plan?action=params', 'POST', paramsEdit); if (r && r.success) { data.show('Wspólne parametry planowania zapisane — używa ich P5, autoplan i obsada'); setParamsEdit(null); zaladuj(); } else data.show((r && r.error) || 'Błąd', 'error'); };
  const maxTyg = prop && prop.ok ? Math.max(1, ...prop.tygodnie.map((t) => t.sales)) : 1;
  const sklad = prop && prop.ok ? prop.sklad : null;
  const godzLimit = form.hoursAop !== '' ? Number(form.hoursAop) : (plan && plan.hoursAop != null ? plan.hoursAop : null);
  const godzZapl = grafik ? grafik.godziny : 0;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto"><div className="page-wrap module-view forecast-view" style={{ width: '100%' }}>
      <MHead kicker={`PROGNOZY I ESTYMACJA • ${mcLabel(month).toUpperCase()}${plan ? ` • ${approved ? 'ZATWIERDZONY' : 'ROBOCZY'} v${plan.version}` : ' • BRAK PLANU'}`} title="Plan miesiąca" copy="Sprzedaż, transakcje i limit godzin AOP na cały miesiąc — jedno źródło dla rozkładu na dni, automatycznego układania i obsady. Propozycja liczona z historii POS; każda korekta ma uzasadnienie i wersję.">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="secondary-action" style={{ font: 'inherit' }} />
        <button className="secondary-action" onClick={() => zaladuj()} disabled={busy}><RefreshCw size={16} /> Odśwież propozycję</button>
        {plan && (approved ? <button className="secondary-action" onClick={otworz} disabled={busy}><Unlock size={16} /> Otwórz do edycji</button> : <button className="primary-action" onClick={zatwierdz} disabled={busy}><Lock size={16} /> Zatwierdź plan</button>)}
      </MHead>
      {blad && <div className="dialog-notice" style={{ marginBottom: 12 }}><AlertTriangle size={16} /><span>{blad}</span><button className="secondary-action" style={{ marginLeft: 'auto' }} onClick={() => zaladuj()}>Ponów</button></div>}
      {res && res.miesiace && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>{res.miesiace.map((m) => <button key={m.month} className={'secondary-action' + (m.month === month ? ' active' : '')} style={m.month === month ? { borderColor: '#741334', color: '#3f0b1c' } : {}} onClick={() => setMonth(m.month)}>{mcLabel(m.month)}{m.status ? <b style={{ marginLeft: 6, fontSize: 11, color: m.status === 'APPROVED' ? '#2f7a4a' : '#a7465f' }}>{m.status === 'APPROVED' ? '✓' : 'rob.'}</b> : null}</button>)}</div>}

      <section className="analytics-kpis">
        <MMetric icon={TrendingUp} label="Propozycja sprzedaży netto" value={prop && prop.ok ? zl(prop.sales) : '—'} helper={prop && prop.ok ? `pasmo ${zl(prop.low)} – ${zl(prop.high)} (±${String(prop.pasmoPct).replace('.', ',')} %)` : (prop && prop.powody[0]) || 'brak historii'} tone="blue" />
        <MMetric icon={BarChart3} label="Propozycja transakcji" value={prop && prop.ok ? num(prop.transactions) : '—'} helper={prop && prop.ok && prop.agc ? `AGC ${String(prop.agc).replace('.', ',')} zł z ostatnich 4 tyg.` : 'brak paragonów'} tone="violet" />
        <MMetric icon={approved ? CheckCircle2 : Sparkles} label={plan ? `Plan ${approved ? 'zatwierdzony' : 'roboczy'} v${plan.version}` : 'Plan'} value={plan ? zl(plan.sales) : 'nie zapisano'} helper={plan ? `${num(plan.transactions)} trx • ${plan.source === 'proposal' ? 'z propozycji' : 'korekta ręczna'}${plan.reason ? ` • ${plan.reason}` : ''}` : 'przyjmij propozycję albo wpisz własne liczby'} tone="mint" />
        <MMetric icon={Clock3} label="Limit godzin AOP" value={godzLimit != null ? `${num(godzLimit)} h` : '—'} helper={godzLimit != null ? `w grafiku ${num(godzZapl)} h (${grafik ? grafik.dni : 0} dni) • zostaje ${num(godzLimit - godzZapl)} h${plan && plan.crewHours != null ? ` • CREW ${num(plan.crewHours)} h` : ''}` : 'wpisz godziny z AOP — to Twój limit miesiąca'} tone={godzLimit != null && godzZapl > godzLimit ? 'coral' : 'mint'} />
      </section>

      <section className="forecast-layout">
        <aside className="forecast-controls panel">
          <div className="panel-title"><div><span>PLAN MIESIĄCA</span><h2>{approved ? 'Zatwierdzony — tylko podgląd' : 'Liczby do zatwierdzenia'}</h2></div><Sparkles size={19} /></div>
          <label className="input-label">Sprzedaż netto miesiąca<div className="number-input"><input type="number" value={form.sales} disabled={approved} onChange={(e) => setForm((f) => ({ ...f, sales: e.target.value }))} /><span>PLN</span></div></label>
          <label className="input-label">Transakcje miesiąca<div className="number-input"><input type="number" value={form.transactions} disabled={approved} onChange={(e) => setForm((f) => ({ ...f, transactions: e.target.value }))} /><span>trx</span></div></label>
          <div className="control-divider" />
          <label className="input-label">Godziny AOP (limit miesiąca)<div className="number-input"><input type="number" step="0.25" value={form.hoursAop} disabled={approved} placeholder="np. 4 700" onChange={(e) => setForm((f) => ({ ...f, hoursAop: e.target.value }))} /><span>h</span></div></label>
          <label className="input-label">w tym CREW (opcjonalnie)<div className="number-input"><input type="number" step="0.25" value={form.crewHours} disabled={approved} placeholder="puste = limit dotyczy wszystkich" onChange={(e) => setForm((f) => ({ ...f, crewHours: e.target.value }))} /><span>h</span></div></label>
          {odch != null && <p style={{ fontSize: 12, color: wymagaPowodu ? '#B94352' : '#6e5a62', margin: '6px 0' }}>{odch > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {odch > 0 ? '+' : ''}{odch.toFixed(1).replace('.', ',')} % względem propozycji{wymagaPowodu ? ' — wymaga uzasadnienia' : ''}</p>}
          {!approved && <label className="input-label">Uzasadnienie korekty{wymagaPowodu ? ' *' : ''}<div className="number-input"><input type="text" value={form.reason} placeholder="remont, promocja, cel z centrali, zamknięcie…" onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /></div></label>}
          {!approved && <>
            <button className="generate-button" disabled={busy || !(Number(form.sales) > 0) || (wymagaPowodu && form.reason.trim().length < 3)} onClick={() => zapisz('manual')}><Check size={17} /> {busy ? 'Zapisuję…' : plan ? `Zapisz zmiany (v${plan.version + 1})` : 'Zapisz plan roboczy'}</button>
            {prop && prop.ok && <button className="secondary-action" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy} onClick={() => { setForm((f) => ({ ...f, sales: prop.sales, transactions: prop.transactions })); zapisz('proposal'); }}><Sparkles size={15} /> Przyjmij propozycję bez zmian</button>}
          </>}
          <div className="control-divider" />
          <p className="text-xs" style={{ color: '#6e5a62', margin: 0 }}>Dalej: <button className="underline font-semibold" onClick={() => setPage('prognoza-miesiaca')}>rozłóż na dni i policz COL</button> · <button className="underline font-semibold" onClick={() => setPage('autoplan')}>ułóż grafik automatycznie</button>. Oba czytają zatwierdzony plan — nie przepisuj liczb drugi raz.</p>
        </aside>

        <div className="forecast-main">
          <article className="panel" style={{ padding: 18 }}>
            <div className="panel-title"><div><span>SKĄD TA PROPOZYCJA</span><h2>Historia POS → {mcLabel(month)}</h2></div>{prop && prop.ok && <em style={{ fontSize: 12, color: '#6e5a62' }}>dane do {prop.ostatniDzien}</em>}</div>
            {!prop || !prop.ok ? <div className="dialog-empty" style={{ padding: 16 }}>{prop ? prop.powody.join(' ') : 'Ładowanie…'} <button className="underline font-semibold" onClick={() => setPage('import-eksport')}>Import POS</button></div> : (<>
              <div className="dialog-stat-grid">
                <div className="dialog-stat"><span>Poziom tygodnia (śr. 4 ost.)</span><strong>{zl(prop.poziomTyg)}</strong></div>
                <div className="dialog-stat"><span>Trend tygodniowy (tłumiony)</span><strong style={{ color: prop.trendTygPct < 0 ? '#B94352' : '#2f7a4a' }}>{prop.trendTygPct > 0 ? '+' : ''}{String(prop.trendTygPct).replace('.', ',')} %/tydz.</strong></div>
                <div className="dialog-stat"><span>Horyzont</span><strong>+{prop.tygodniDoPrzodu} tyg. • {prop.dniWMiesiacu} dni</strong></div>
                <div className="dialog-stat"><span>Sezon (indeks {Number(month.slice(5, 7))}/12 vs bazowy)</span><strong>×{String(prop.sezon ? prop.sezon.factor : 1).replace('.', ',')}</strong></div>
                <div className="dialog-stat"><span>Zdarzenia w miesiącu</span><strong>{prop.zdarzenia && prop.zdarzenia.length ? `${prop.zdarzenia.length} • ${prop.wplywZdarzen >= 0 ? '+' : ''}${zl(prop.wplywZdarzen)}` : 'brak'}</strong></div>
              </div>
              <p className="dialog-section-title" style={{ marginTop: 12 }}>PEŁNE TYGODNIE HISTORII (NETTO)</p>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${prop.tygodnie.length}, 1fr)`, gap: 6, alignItems: 'end', height: 80 }}>
                {prop.tygodnie.map((t) => <div key={t.start} title={`${t.start} – ${t.end}: ${zl(t.sales)} • ${t.checks} paragonów`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3, height: '100%' }}><small style={{ fontSize: 11, color: '#6e5a62' }}>{Math.round(t.sales / 1000)}k</small><i style={{ width: '100%', height: `${t.sales / maxTyg * 54}px`, background: '#741334', borderRadius: 4 }} /><small style={{ fontSize: 11, color: '#8a7a80' }}>{t.start.slice(5)}</small></div>)}
              </div>
              <p className="dialog-section-title" style={{ marginTop: 12 }}>SKŁAD KALENDARZA × UDZIAŁ DNIA TYGODNIA</p>
              <div className="data-table forecast-table"><div className="table-header"><span>Dzień</span><span>Udział w tygodniu</span><span>Ile razy w {mcLabel(month)}</span><span>Średnia dnia</span></div>
                {[['Pn', 1], ['Wt', 2], ['Sr', 3], ['Cz', 4], ['Pt', 5], ['Sb', 6], ['Nd', 0]].map(([k, i]) => <div className="table-row" key={k}><span><b>{k === 'Sr' ? 'Śr' : k}</b></span><span>{String(prop.udzialDow[i]).replace('.', ',')} %</span><span>{sklad[k]}×</span><span>{zl(prop.poziomTyg * prop.udzialDow[i] / 100)}</span></div>)}
              </div>
              {prop.powody.length > 0 && <div className="dialog-notice" style={{ marginTop: 12 }}><AlertTriangle size={16} /><span>{prop.powody.join(' ')}</span></div>}
            </>)}
          </article>

          <article className="panel" style={{ padding: 18, marginTop: 14 }}>
            <div className="panel-title"><div><span>WSPÓLNE PARAMETRY PLANOWANIA</span><h2>Jeden zestaw dla P5, autoplanu i obsady</h2></div>{res && res.params && !paramsEdit && <button className="secondary-action" onClick={() => setParamsEdit({ ...res.params })}>Edytuj</button>}</div>
            {res && res.params && !paramsEdit && <div className="dialog-stat-grid"><div className="dialog-stat"><span>SPLH docelowe</span><strong>{res.params.splh} zł/h</strong></div><div className="dialog-stat"><span>MPT</span><strong>{String(res.params.mpt).replace('.', ',')} min/trx</strong></div><div className="dialog-stat"><span>Podłoga obsady</span><strong>{res.params.podloga} os.</strong></div><div className="dialog-stat"><span>Koszt pośredni • cel COL • waga YoY</span><strong>{Math.round(res.params.indirectPct * 100)} % • {res.params.colTargetPct} % • {Math.round((res.params.yoyWeight != null ? res.params.yoyWeight : 0.3) * 100)} %</strong></div></div>}
            {paramsEdit && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {[['splh', 'SPLH docelowe (zł/h)', 10], ['mpt', 'MPT (min/trx)', 0.1], ['podloga', 'Podłoga obsady (os.)', 1], ['indirectPct', 'Koszt pośredni (0–1)', 0.01], ['colTargetPct', 'Cel COL (%)', 0.5], ['yoyWeight', 'Waga danych sprzed roku (0–1)', 0.1]].map(([k, l, st]) => <label key={k} className="input-label">{l}<div className="number-input"><input type="number" step={st} value={paramsEdit[k]} onChange={(e) => setParamsEdit((p) => ({ ...p, [k]: e.target.value }))} /></div></label>)}
              <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}><button className="primary-action" onClick={zapiszParams}><Check size={15} /> Zapisz</button><button className="secondary-action" onClick={() => setParamsEdit(null)}>Anuluj</button></div>
            </div>}
          </article>

          <article className="panel" style={{ padding: 18, marginTop: 14 }}>
            <div className="panel-title"><div><span>KALENDARZ ZDARZEŃ</span><h2>Promocje, zamknięcia, eventy — to, co wiesz wcześniej</h2></div><Calendar size={19} /></div>
            <p className="text-xs" style={{ color: '#6e5a62', margin: '0 0 10px' }}>Wpływ w procentach nakłada się na propozycję, prognozę dzienną i rozkład dni P5. Po zamknięciu miesiąca porównaj w kalibracji, ile zdarzenie dało naprawdę — po kilku kampaniach masz własny cennik uplift’ów.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
              <label className="input-label">Nazwa<div className="number-input"><input type="text" value={evForm.name} placeholder="Kampania kanapkowa" onChange={(e) => setEvForm((f) => ({ ...f, name: e.target.value }))} /></div></label>
              <label className="input-label">Typ<div className="number-input"><select value={evForm.typ} onChange={(e) => setEvForm((f) => ({ ...f, typ: e.target.value }))} style={{ width: '100%', border: 0, background: 'transparent', font: 'inherit' }}><option value="promo">promocja</option><option value="event">event w galerii</option><option value="holiday">święto / dzień handlowy</option><option value="closure">zamknięte</option><option value="other">inne</option></select></div></label>
              <label className="input-label">Od<div className="number-input"><input type="date" value={evForm.from} onChange={(e) => setEvForm((f) => ({ ...f, from: e.target.value }))} /></div></label>
              <label className="input-label">Do<div className="number-input"><input type="date" value={evForm.to} onChange={(e) => setEvForm((f) => ({ ...f, to: e.target.value }))} /></div></label>
              <label className="input-label">Wpływ<div className="number-input"><input type="number" step="0.5" value={evForm.typ === 'closure' ? -100 : evForm.upliftPct} disabled={evForm.typ === 'closure'} placeholder="+8" onChange={(e) => setEvForm((f) => ({ ...f, upliftPct: e.target.value }))} /><span>%</span></div></label>
              <button className="primary-action" disabled={!evForm.name || !evForm.from || (evForm.typ !== 'closure' && evForm.upliftPct === '')} onClick={zapiszZdarzenie}><Plus size={15} /> Dodaj</button>
            </div>
            {res && res.events && res.events.length > 0 ? (
              <div className="data-table forecast-table" style={{ marginTop: 10 }}><div className="table-header"><span>Zdarzenie</span><span>Typ</span><span>Od – do</span><span>Wpływ</span><span>Kto</span><span></span></div>
                {res.events.map((e) => <div className="table-row" key={e.id}><span><b>{e.name}</b>{e.note ? <small> {e.note}</small> : null}</span><span>{{ promo: 'promocja', event: 'event', holiday: 'święto', closure: 'zamknięte', other: 'inne' }[e.typ] || e.typ}</span><span>{e.from}{e.to !== e.from ? ` – ${e.to}` : ''}</span><span style={{ color: e.upliftPct < 0 ? '#B94352' : '#2f7a4a', fontWeight: 700 }}>{e.upliftPct > 0 ? '+' : ''}{e.upliftPct} %</span><span>{e.by}</span><span><button className="icon-button" title="Usuń" onClick={() => usunZdarzenie(e.id)}><Trash2 size={14} /></button></span></div>)}
              </div>
            ) : <div className="dialog-empty" style={{ padding: 12, marginTop: 10 }}>Brak zdarzeń. Dodaj to, co wiesz z wyprzedzeniem: promocja ogólnopolska, Black Week, 1 listopada, remont, event w galerii.</div>}
          </article>

          <article className="panel" style={{ padding: 18, marginTop: 14 }}>
            <div className="panel-title"><div><span>INDEKS SEZONOWY</span><h2>Punkt startu dla QSR w galerii, uczy się z Twoich zamkniętych miesięcy</h2></div>{res && res.sezon && !sezonEdit && <button className="secondary-action" onClick={() => setSezonEdit(Object.fromEntries(Object.entries(res.sezon.idx).map(([k, v]) => [k, v.zrodlo === 'manual' ? v.factor : ''])))}>Edytuj ręcznie</button>}</div>
            <p className="text-xs" style={{ color: '#6e5a62', margin: '0 0 10px' }}>Mnożnik miesiąca względem średniej roku. Propozycja używa stosunku indeks miesiąca docelowego ÷ indeks miesiąca bazowego. Źródło: <b>start</b> (branżowy punkt wyjścia), <b>wyuczony</b> (z Twojego wykonania, waga rośnie z liczbą lat), <b>ręczny</b> (Twoja korekta). Dane sprzed roku, gdy się pojawią, są tylko słabym głosem (waga {res && res.params ? Math.round((res.params.yoyWeight != null ? res.params.yoyWeight : 0.3) * 100) : 30} % — w parametrach).</p>
            {res && res.sezon && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6 }}>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((k) => { const v = res.sezon.idx[k]; const aktywny = Number(month.slice(5, 7)) === Number(k); return (
                <div key={k} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 10, background: aktywny ? '#f7eef1' : '#faf8f8', border: `1px solid ${aktywny ? '#741334' : '#eee6e9'}` }}>
                  <small style={{ fontSize: 11, fontWeight: 700, color: '#6e5a62' }}>{MIES[i_of(k)].slice(0, 3).toUpperCase()}</small>
                  {sezonEdit ? <input type="number" step="0.01" min="0.5" max="2" value={sezonEdit[k]} placeholder={String(v.factor)} onChange={(e) => setSezonEdit((p) => ({ ...p, [k]: e.target.value }))} style={{ width: '100%', textAlign: 'center', border: '1px solid #ddd', borderRadius: 6, padding: 2, fontSize: 12 }} />
                    : <div style={{ fontSize: 15, fontWeight: 800, color: v.zrodlo === 'manual' ? '#741334' : '#3f0b1c' }}>{String(v.factor).replace('.', ',')}</div>}
                  <small style={{ fontSize: 11, color: v.zrodlo === 'learned' ? '#2f7a4a' : v.zrodlo === 'manual' ? '#741334' : '#8a7a80' }}>{v.zrodlo === 'learned' ? `wyuczony (${v.n})` : v.zrodlo === 'manual' ? 'ręczny' : 'start'}</small>
                </div>); })}
            </div>}
            {sezonEdit && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="primary-action" onClick={zapiszSezon}><Check size={15} /> Zapisz indeks</button><button className="secondary-action" onClick={() => setSezonEdit(null)}>Anuluj</button><small style={{ alignSelf: 'center', color: '#8a7a80' }}>Puste pole = wróć do wartości wyuczonej/startowej.</small></div>}
          </article>

          {res && res.kalibracja && res.kalibracja.length > 0 && <article className="panel" style={{ padding: 18, marginTop: 14 }}>
            <div className="panel-title"><div><span>KALIBRACJA</span><h2>Propozycja → Twój plan → wykonanie</h2></div></div>
            <div className="data-table forecast-table"><div className="table-header"><span>Miesiąc</span><span>Propozycja</span><span>Plan</span><span>Wykonanie (POS)</span><span>Plan vs wykonanie</span><span>Propozycja vs wykonanie</span><span>Godziny AOP</span></div>
              {res.kalibracja.map((k) => <div className="table-row" key={k.month}><span><b>{mcLabel(k.month)}</b><small>{k.status === 'APPROVED' ? 'zatwierdzony' : k.status === 'DRAFT' ? 'roboczy' : 'bez planu'}{!k.kompletny && k.dniZDanymi ? ` • ${k.dniZDanymi}/${k.dni} dni` : ''}</small></span><span>{zl(k.proposal)}</span><span>{zl(k.plan)}</span><span>{k.actual != null ? zl(k.actual) : '—'}</span><span style={{ color: k.odchPlanPct == null ? '#8a7a80' : Math.abs(k.odchPlanPct) > 5 ? '#B94352' : '#2f7a4a', fontWeight: 700 }}>{k.odchPlanPct != null ? `${k.odchPlanPct > 0 ? '+' : ''}${String(k.odchPlanPct).replace('.', ',')} %` : '—'}</span><span style={{ color: k.odchPropPct == null ? '#8a7a80' : Math.abs(k.odchPropPct) > 5 ? '#B94352' : '#2f7a4a', fontWeight: 700 }}>{k.odchPropPct != null ? `${k.odchPropPct > 0 ? '+' : ''}${String(k.odchPropPct).replace('.', ',')} %` : '—'}</span><span>{k.hoursAop != null ? `${num(k.hoursAop)} h` : '—'}</span></div>)}
            </div>
            <p className="text-xs" style={{ color: '#6e5a62', marginTop: 8 }}>Odchylenie liczone tylko dla miesięcy z kompletnym wykonaniem. To jest jedyna uczciwa odpowiedź na pytanie „czy model jest dobry” — i podstawa do strojenia indeksu i uplift’ów zdarzeń.</p>
          </article>}

          {plan && plan.history && plan.history.length > 0 && <article className="panel" style={{ padding: 18, marginTop: 14 }}>
            <div className="panel-title"><div><span>HISTORIA WERSJI</span><h2>Kto, kiedy, dlaczego</h2></div></div>
            <div className="data-table forecast-table"><div className="table-header"><span>Wersja</span><span>Status</span><span>Sprzedaż</span><span>Transakcje</span><span>Godziny AOP</span><span>Kto / kiedy</span><span>Powód</span></div>
              {plan.history.slice().reverse().map((h) => <div className="table-row" key={h.version}><span><b>v{h.version}</b></span><span>{h.status === 'APPROVED' ? 'zatwierdzony' : 'roboczy'}</span><span>{zl(h.sales)}</span><span>{num(h.transactions)}</span><span>{h.hoursAop != null ? `${num(h.hoursAop)} h` : '—'}</span><span>{h.by} • {String(h.at).slice(0, 16).replace('T', ' ')}</span><span>{h.reason || (h.source === 'proposal' ? 'propozycja' : '—')}</span></div>)}
            </div>
          </article>}
        </div>
      </section>
    </div></div>
  );
};
