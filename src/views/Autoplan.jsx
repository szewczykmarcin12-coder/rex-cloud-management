import React, { useEffect, useState } from 'react';
import { Calendar, Check, CircleDollarSign, Clock3, Plus, RefreshCw, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { MHead, MMetric } from '../ui/primitives.jsx';
const SlidersHorizontalIcon = () => <Sparkles size={19} />;
// ── Planowanie → Automatyczne układanie (AOP) ──
// ═════════ AOP AUTOPLAN — układanie grafiku z planu miesięcznego, dyspozycji i historii ═════════
export const AutoplanAOP = ({ data, setPage }) => {
  const dzisA = new Date();
  const nastMc = new Date(dzisA.getFullYear(), dzisA.getMonth() + 1, 1);
  const ymdL = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [from, setFrom] = useState(ymdL(nastMc));
  const [to, setTo] = useState(ymdL(new Date(nastMc.getFullYear(), nastMc.getMonth() + 1, 0)));
  const [aop, setAop] = useState({ crewHoursMax: '', totalHours: '', sales: '', transactions: '' });
  const [splh, setSplh] = useState(420);
  const [wym, setWym] = useState([{ station: 'KANAPKI / WRAPY', start: '06:00', end: '14:00', dni: [] }, { station: 'FRYTKI', start: '10:00', end: '18:00', dni: [] }]);
  const [busy, setBusy] = useState(false);
  const [prop, setProp] = useState(null);
  const [modelInfo, setModelInfo] = useState(null);
  const [historia, setHistoria] = useState([]);
  const [widok, setWidok] = useState('dni');
  const [mplan, setMplan] = useState(null);     // zatwierdzony Plan miesiąca okresu — jedno źródło sprzedaży, transakcji i limitu godzin
  useEffect(() => { const m = String(from).slice(0, 7); api(`/month-plan?month=${m}`).then((r) => { if (r && r.success) { setMplan(r.plan && r.plan.status === 'APPROVED' ? r.plan : null); if (r.params && r.params.splh) setSplh(r.params.splh); } }).catch(() => {}); }, [from]);
  const stacje = [...new Set(['MANAGER', 'KANAPKI / WRAPY', 'FRYTKI', 'PANIEROWANIE', 'SMAŻENIE', 'KONTROLER', 'DISPATCHER', 'PHU', 'DESERY / NAPOJE', 'ZMYWAK', ...(data.shifts || []).map((x) => x.station)])].filter(Boolean);
  const DNI = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
  const zaladuj = () => { api('/autoplan?action=model').then((r) => { if (r && r.success) setModelInfo(r); }).catch(() => {}); api('/autoplan').then((r) => { if (r && r.success) setHistoria(r.proposals || []); }).catch(() => {}); };
  useEffect(zaladuj, []);
  const generuj = async () => {
    if (!mplan && (!aop.crewHoursMax || !aop.sales)) return data.show('Zatwierdź Plan miesiąca albo podaj górną granicę godzin CREW i sprzedaż', 'error');
    setBusy(true);
    const r = await api('/autoplan?action=generate', 'POST', { from, to, aop: { crewHoursMax: Number(aop.crewHoursMax) || 0, totalHours: Number(aop.totalHours) || 0, sales: Number(aop.sales) || 0, transactions: Number(aop.transactions) || 0 }, wymagania: wym.filter((w) => w.station && w.start && w.end), splh: Number(splh) || 420, seed: Date.now() % 100000 });
    setBusy(false);
    if (r && r.success) { setProp(r.proposal); setWidok('dni'); data.show(`Propozycja gotowa: ${r.proposal.podsumowanie.obsadzone}/${r.proposal.podsumowanie.zmian} zmian obsadzonych`); zaladuj(); }
    else data.show((r && r.error) || 'Błąd generowania', 'error');
  };
  const zastosuj = async () => {
    if (!prop) return;
    if (!confirm(`Dopisać ${prop.podsumowanie.obsadzone} zmian do grafiku ${prop.okres.from} – ${prop.okres.to} jako wersję roboczą? Istniejące zmiany (np. MGR) zostają, duplikaty są pomijane.`)) return;
    setBusy(true);
    const r = await api('/autoplan?action=apply', 'POST', { id: prop.id });
    if (r && r.success) { const ok = await data.addHoursBulk(r.shifts); if (ok) { data.show(`Grafik roboczy uzupełniony (${r.zmian} zmian). Sprawdź go w Schedule i opublikuj.`); setProp({ ...prop, applied: true }); } }
    else data.show((r && r.error) || 'Błąd zastosowania', 'error');
    setBusy(false); zaladuj();
  };
  const fmt = (n) => Math.round(n || 0).toLocaleString('pl-PL');
  const ps = prop && prop.podsumowanie;
  const pole = (k, label, suffix, ph) => <label className="input-label">{label}<div className="number-input"><input type="number" value={aop[k]} placeholder={ph} onChange={(e) => setAop((a) => ({ ...a, [k]: e.target.value }))} /><span>{suffix}</span></div></label>;
  const modelRows = modelInfo && modelInfo.model ? Object.entries(modelInfo.model).map(([id, m]) => ({ id, ...m, name: ((data.accounts || []).find((a) => a.id === id) || {}).name || id })).filter((m) => m.grupa === 'crew').sort((a, b) => b.n - a.n) : [];
  return (
    <div className="flex-1 min-h-0 overflow-y-auto"><div className="page-wrap module-view forecast-view" style={{ width: '100%' }}>
      <MHead kicker="PLANOWANIE • AOP AUTOPLAN" title="Ułóż grafik z planu AOP" copy="Podaj miesięczne założenia AOP i wymagane zmiany dnia — silnik rozłoży godziny CREW na dni według sprzedaży, obsadzi je zgodnie z dyspozycjami, prawem pracy i historią stanowisk (kto częściej pracował na stanowisku, ten ma większą szansę je dostać).">
        <button className="secondary-action" onClick={() => setPage('wt')}><Calendar size={16} /> Schedule</button>
        <button className="primary-action" disabled={busy} onClick={generuj}><Sparkles size={16} /> {busy ? 'Liczę…' : 'Wygeneruj propozycję'}</button>
      </MHead>
      <section className="forecast-layout">
        <aside className="forecast-controls panel">
          <div className="panel-title"><div><span>ZAŁOŻENIA AOP</span><h2>Plan miesięczny</h2></div><SlidersHorizontalIcon /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label className="input-label">Od<div className="number-input"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div></label>
            <label className="input-label">Do<div className="number-input"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></label>
          </div>
          {mplan ? <div className="model-note" style={{ marginBottom: 8 }}><Check size={16} /><div><strong>Z Planu miesiąca v{mplan.version} ({String(from).slice(0, 7)})</strong><span>{Math.round(mplan.sales).toLocaleString('pl-PL')} zł • {Math.round(mplan.transactions).toLocaleString('pl-PL')} trx{mplan.hoursAop != null ? ` • limit ${mplan.crewHours != null ? `${mplan.crewHours} h CREW` : `${mplan.hoursAop} h AOP`}` : ''} — proporcjonalnie do dni okresu. Pola poniżej nadpisują plan tylko na tę propozycję.</span></div></div>
            : <div className="model-note" style={{ marginBottom: 8 }}><Sparkles size={16} /><div><strong>Brak zatwierdzonego Planu miesiąca</strong><span>Wpisz liczby ręcznie albo <button className="underline font-semibold" onClick={() => setPage('plan-miesiaca')}>zatwierdź plan</button> — wtedy autoplan, P5 i obsada liczą to samo.</span></div></div>}
          {pole('crewHoursMax', mplan ? 'Górna granica godzin CREW (nadpisanie)' : 'Górna granica godzin CREW', 'h', mplan ? 'z planu' : 'np. 1450')}
          {pole('sales', mplan ? 'Sprzedaż (nadpisanie)' : 'Estymowana sprzedaż miesiąca', 'PLN', mplan ? 'z planu' : 'np. 1420000')}
          {pole('transactions', mplan ? 'Transakcje (nadpisanie)' : 'Estymowane transakcje', 'trx', mplan ? 'z planu' : 'np. 29800')}
          <label className="input-label">SPLH docelowe (sprzedaż / roboczogodzina)<div className="number-input"><input type="number" value={splh} onChange={(e) => setSplh(e.target.value)} /><span>zł/h</span></div></label>
          <div className="control-divider" />
          <label className="input-label">Wymagane zmiany w dobie (szablon)</label>
          <div style={{ display: 'grid', gap: 6 }}>
            {wym.map((w, i) => (
              <div key={i} className="panel" style={{ padding: 8, display: 'grid', gridTemplateColumns: '1fr 64px 64px 24px', gap: 6, alignItems: 'center' }}>
                <select value={w.station} onChange={(e) => setWym((l) => l.map((x, j) => j === i ? { ...x, station: e.target.value } : x))} style={{ fontSize: 11, border: '1px solid #E3DCDD', borderRadius: 8, padding: '6px 6px' }}>{stacje.map((st) => <option key={st}>{st}</option>)}</select>
                <input type="time" value={w.start} onChange={(e) => setWym((l) => l.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} style={{ fontSize: 11, border: '1px solid #E3DCDD', borderRadius: 8, padding: '4px' }} />
                <input type="time" value={w.end} onChange={(e) => setWym((l) => l.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} style={{ fontSize: 11, border: '1px solid #E3DCDD', borderRadius: 8, padding: '4px' }} />
                <button onClick={() => setWym((l) => l.filter((_, j) => j !== i))} title="Usuń" style={{ border: 0, background: 'transparent', color: '#B94352', cursor: 'pointer' }}><X size={14} /></button>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 3 }}>{[1, 2, 3, 4, 5, 6, 0].map((dw) => <button key={dw} onClick={() => setWym((l) => l.map((x, j) => j === i ? { ...x, dni: x.dni.includes(dw) ? x.dni.filter((y) => y !== dw) : [...x.dni, dw] } : x))} style={{ flex: 1, fontSize: 11, fontWeight: 800, padding: '3px 0', borderRadius: 6, border: '1px solid #E3DCDD', background: !w.dni.length || w.dni.includes(dw) ? '#E9E4F4' : '#fff', color: !w.dni.length || w.dni.includes(dw) ? '#3E3760' : '#A38D95', cursor: 'pointer' }} title={w.dni.length ? '' : 'codziennie'}>{DNI[dw]}</button>)}</div>
              </div>
            ))}
            <button className="secondary-action" onClick={() => setWym((l) => [...l, { station: stacje[0], start: '14:00', end: '22:00', dni: [] }])}><Plus size={14} /> Dodaj wymaganą zmianę</button>
          </div>
          <details className="model-note" style={{ display: 'block' }}>
            <summary style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', listStyle: 'none' }}><Sparkles size={16} /><strong>Jak powstaje propozycja</strong><span style={{ marginLeft: 'auto', fontSize: 11, opacity: .75 }}>{modelInfo ? `${modelInfo.historiaZmian} zmian w historii • ` : ''}szczegóły ▾</span></summary>
            <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 4px' }}><b>Wejście:</b> zatwierdzona prognoza miesiąca (sprzedaż, transakcje, limit godzin CREW), zatwierdzone dyspozycje i nieobecności, istniejące zmiany MGR (nie są ruszane), wymagane zmiany z listy poniżej, historia grafików do 6 miesięcy.</p>
              <p style={{ margin: '0 0 4px' }}><b>Zapotrzebowanie:</b> sprzedaż miesiąca rozkładana jest na dni proporcjonalnie do historii POS; w dobie — według krzywej godzinowej z importu sprzedaży (albo profilu standardowego, jeśli importu brak — wtedy jest to <em>założenie</em>, nie pomiar). Obsada slotu = sprzedaż ÷ SPLH, nie mniej niż podłoga.</p>
              <p style={{ margin: '0 0 4px' }}><b>Przypisanie osób:</b> najpierw twarde reguły (odpoczynek 11 h, ≤12 h/dobę, ≤6 dni z rzędu, dyspozycja, absencja, limit etatu i limit CREW), potem ocena: afiniczność stanowiska z historii (Dirichlet, półokres 2 mies.; nowa osoba dostaje profil grupy), nawyk pory startu i dnia tygodnia, wyrównanie godzin do etatu, jawna deklaracja „dostępny”, kara za długie ciągi dni.</p>
              <p style={{ margin: 0 }}><b>Wynik:</b> propozycja jest zapisywana z pełnymi ocenami. „Zastosuj” dopisuje zmiany do wersji roboczej grafiku; publikacja (i bramka zgodności) pozostaje osobnym krokiem w module Grafik. Ręczne korekty po zastosowaniu są w audycie i służą do dostrajania wag.</p>
            </div>
          </details>
          <button className="generate-button" disabled={busy} onClick={generuj}><Sparkles size={17} /> {busy ? 'Liczę…' : 'Przelicz i wygeneruj propozycję'}</button>
        </aside>

        <div className="forecast-main">
          <section className="forecast-kpis">
            <MMetric icon={Users} label="Obsadzone zmiany" value={ps ? `${ps.obsadzone} / ${ps.zmian}` : '—'} helper={ps ? (ps.nieobsadzone ? `${ps.nieobsadzone} bez osoby — patrz powody` : 'komplet') : 'wygeneruj propozycję'} tone={ps && ps.nieobsadzone ? 'coral' : 'mint'} />
            <MMetric icon={Clock3} label="Godziny CREW" value={ps ? `${fmt(ps.godzinyCrew)} h` : '—'} helper={ps && ps.limitCrew ? `limit AOP ${fmt(ps.limitCrew)} h • MGR w grafiku ${fmt(ps.godzinyMgrIstniejace)} h` : '—'} tone="violet" />
            <MMetric icon={CircleDollarSign} label="Koszt / COL szac." value={ps ? `${fmt(ps.kosztSzac)} zł` : '—'} helper={ps && ps.colSzac != null ? `${ps.colSzac.toFixed(1).replace('.', ',')}% sprzedaży AOP` : '—'} tone="blue" />
            <MMetric icon={ShieldCheck} label="Zgodność" value={ps ? `${ps.naruszenia.block} blok. • ${ps.naruszenia.warn} uwag` : '—'} helper={ps ? `wymagane zmiany: ${ps.pokrycieWymagan}% • śr. afiniczność ${ps.sredniaAfinicznosc}` : '—'} tone={ps && ps.naruszenia.block ? 'coral' : 'mint'} />
          </section>

          {!prop ? (
            <article className="panel" style={{ padding: 24 }}>
              <div className="panel-title"><div><span>JAK TO DZIAŁA</span><h2>Od AOP do gotowego grafiku roboczego</h2></div></div>
              <ol style={{ margin: '8px 0 0 18px', color: '#71656A', fontSize: 12.5, lineHeight: 1.7 }}>
                <li>Sprzedaż AOP rozkładamy na dni według udziału dnia tygodnia z Twojej historii (bez historii: profil QSR).</li>
                <li>Budżet godzin CREW dnia ∝ sprzedaż dnia, z podłogą wynikającą z wymaganych zmian.</li>
                <li>Krzywa doby (profil godzinowy z importu POS lub standardowy) ÷ SPLH daje obsadę co 30 min; wymagane zmiany wchodzą jako twarde, reszta dopełnia popyt blokami 8/6/4 h.</li>
                <li>Osoby: twarde filtry (absencja, dyspozycja, 11 h odpoczynku, 12 h w dobie, 7. dzień, nominał UOP), potem punktacja: 3,0·afiniczność + 1,2·nawyk startu + 0,6·dzień tygodnia + 1,5·fairness godzin + 0,8·jawna dostępność − ciągłość.</li>
                <li>Reperacja lokalna (zamiany stanowisk tej samej pory) i kontrola silnikiem prawa pracy. Wynik to wersja robocza — zastosowanie dopisuje zmiany do Schedule, publikacja pozostaje Twoja.</li>
              </ol>
              {modelRows.length > 0 && <div style={{ marginTop: 16 }}>
                <div className="panel-title"><div><span>MODEL OSÓB (CREW)</span><h2>Skąd silnik wie, kto gdzie pracuje</h2></div></div>
                <div className="data-table forecast-table" style={{ marginTop: 8 }}>
                  <div className="table-header"><span>Osoba</span><span>Waga historii</span><span>Top stanowiska (P)</span><span>Śr. h / mies.</span><span>Ostatnio</span></div>
                  {modelRows.slice(0, 40).map((m) => <div className="table-row" key={m.id}><span><b>{m.name}</b></span><span>{m.n}</span><span>{(m.top || []).map((t) => `${t.st} ${Math.round(t.p * 100)}%`).join(' • ') || '— (prior grupy)'}</span><span>{m.srGodzinMies != null ? `${m.srGodzinMies} h` : '—'}</span><span>{m.ostatniaZmiana || '—'}</span></div>)}
                </div>
              </div>}
            </article>
          ) : (
            <article className="panel" style={{ padding: 18 }}>
              <div className="panel-title"><div><span>PROPOZYCJA {prop.id.toUpperCase()} • {prop.okres.from} – {prop.okres.to}</span><h2>Wynik silnika</h2></div>
                <div className="filter-tabs"><button className={widok === 'dni' ? 'active' : ''} onClick={() => setWidok('dni')}>Dni</button><button className={widok === 'zmiany' ? 'active' : ''} onClick={() => setWidok('zmiany')}>Zmiany</button><button className={widok === 'osoby' ? 'active' : ''} onClick={() => setWidok('osoby')}>Osoby</button><button className={widok === 'kp' ? 'active' : ''} onClick={() => setWidok('kp')}>Zgodność</button></div>
              </div>
              {widok === 'dni' && <div className="data-table forecast-table" style={{ marginTop: 8 }}>
                <div className="table-header"><span>Dzień</span><span>Sprzedaż</span><span>Trx</span><span>Budżet h</span><span>Użyte h</span><span>Deficyt popytu</span><span>Zmian</span><span>Wymagane</span></div>
                {prop.perDzien.map((d) => <div className="table-row" key={d.date}><span><b>{DNI[d.dow]}, {d.date.slice(8)}.{d.date.slice(5, 7)}</b></span><span><strong>{fmt(d.sales)} zł</strong></span><span>{d.trx}</span><span>{d.budzetH} h</span><span>{d.uzyteH} h</span><span className={d.deficytH > 4 ? 'table-danger' : 'table-good'}>{d.deficytH} h</span><span>{d.zmian}</span><span>{d.wymagane}</span></div>)}
              </div>}
              {widok === 'zmiany' && <div className="data-table forecast-table" style={{ marginTop: 8 }}>
                <div className="table-header"><span>Dzień</span><span>Godziny</span><span>Stanowisko</span><span>Osoba</span><span>Źródło</span><span>Afiniczność</span><span>Score</span><span>Status</span></div>
                {prop.przypisania.map((z, i) => <div className="table-row" key={i}><span><b>{DNI[new Date(z.date + 'T12:00:00').getDay()]} {z.date.slice(8)}.{z.date.slice(5, 7)}</b></span><span>{z.start}–{z.end}</span><span>{z.station}</span><span><strong>{z.display || '—'}</strong></span><span>{z.zrodlo}{z.wymagana ? ' • wymagana' : ''}</span><span>{z.afinicznosc != null ? `${Math.round(z.afinicznosc * 100)}%` : '—'}</span><span>{z.score != null ? z.score : '—'}</span><span><em className={z.nieobsadzona ? 'status-warning' : 'status-ready'}>{z.nieobsadzona ? `brak osoby: ${Object.entries(z.powody || {}).map(([k, v]) => `${k} (${v})`).join(', ')}` : 'obsadzona'}</em></span></div>)}
              </div>}
              {widok === 'osoby' && <div className="data-table forecast-table" style={{ marginTop: 8 }}>
                <div className="table-header"><span>Osoba</span><span>Godziny w propozycji</span><span>Nominał (UOP)</span><span>Dni pracy</span><span>Wypełnienie</span></div>
                {Object.entries(prop.godzOsob).sort((a, b) => b[1].godz - a[1].godz).map(([id, o]) => <div className="table-row" key={id}><span><b>{o.name}</b></span><span>{o.godz} h</span><span>{o.nominal != null ? `${o.nominal} h` : '—'}</span><span>{o.dni}</span><span><i className="coverage-bar"><b style={{ width: `${o.nominal ? Math.min(100, o.godz / o.nominal * 100) : (o.godz ? 60 : 0)}%` }} /></i>{o.nominal ? `${Math.round(o.godz / o.nominal * 100)}%` : '—'}</span></div>)}
              </div>}
              {widok === 'kp' && (prop.naruszenia.length ? <div className="dialog-list" style={{ marginTop: 8 }}>{prop.naruszenia.map((v, i) => <div key={i}><i style={v.level === 'block' ? { color: '#fff', background: '#B94352' } : undefined}>{v.level === 'block' ? '!' : 'i'}</i><span><strong>{v.name} • {v.date}</strong><small>{v.rule}: {v.message}</small></span><em>{v.level === 'block' ? 'blokada' : 'uwaga'}</em></div>)}</div> : <div className="dialog-empty" style={{ padding: 20 }}>Brak naruszeń prawa pracy w propozycji.</div>)}
              <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#71656A', marginRight: 'auto' }}>Nie podoba się układ? Zmień założenia lub wygeneruj ponownie — każde przeliczenie losuje inny porządek remisów.</span>
                <button className="secondary-action" disabled={busy} onClick={generuj}><RefreshCw size={15} /> Przelicz ponownie</button>
                <button className="primary-action" disabled={busy || prop.applied} onClick={zastosuj}><Check size={15} /> {prop.applied ? 'Zastosowano' : 'Zastosuj do grafiku roboczego'}</button>
              </div>
            </article>
          )}
        </div>
      </section>
      {historia.length > 0 && <article className="panel" style={{ marginTop: 14, padding: 16 }}>
        <div className="panel-title"><div><span>HISTORIA</span><h2>Ostatnie propozycje</h2></div></div>
        <div className="data-table forecast-table" style={{ marginTop: 8 }}><div className="table-header"><span>ID</span><span>Okres</span><span>Autor</span><span>Obsadzone</span><span>Godziny CREW</span><span>Status</span></div>
          {historia.map((h) => <div className="table-row" key={h.id} style={{ cursor: 'pointer' }} onClick={() => api(`/autoplan?id=${h.id}`).then((r) => { if (r && r.proposal) setProp(r.proposal); })}><span><b>{h.id}</b></span><span>{h.okres.from} – {h.okres.to}</span><span>{h.by}</span><span>{h.podsumowanie.obsadzone}/{h.podsumowanie.zmian}</span><span>{fmt(h.podsumowanie.godzinyCrew)} h</span><span><em className={h.applied ? 'status-ready' : 'status-active'}>{h.applied ? 'zastosowana' : 'robocza'}</em></span></div>)}
        </div>
      </article>}
    </div></div>
  );
};
