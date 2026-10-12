import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Check, CircleDollarSign, Clock3, Plus, RefreshCw, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { MHead, MMetric } from '../ui/primitives.jsx';
import { stationFill, stationAccent } from '../lib/domain.js';

// ── Planowanie → Automatyczne układanie (v2: stanowisko-najpierw) ──
// 1. obsada podstawowa z zatwierdzonego modelu pracy → 2. obsada dodatkowa z prognozy → 3. wykonalność przed
// → 4. przypisanie całego okresu z macierzy kwalifikacji i dyspozycji → 5. naprawa luk → 6. audyt kompletności.
const DNI = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const fmt = (n) => Math.round(n || 0).toLocaleString('pl-PL');
const H48 = Array.from({ length: 48 }, (_, i) => i);

export const AutoplanAOP = ({ data, setPage }) => {
  const dzisA = new Date();
  const nastMc = new Date(dzisA.getFullYear(), dzisA.getMonth() + 1, 1);
  const ymdL = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [from, setFrom] = useState(ymdL(nastMc));
  const [to, setTo] = useState(ymdL(new Date(nastMc.getFullYear(), nastMc.getMonth() + 1, 0)));
  const [aop, setAop] = useState({ totalHours: '', sales: '', transactions: '' });
  const [splh, setSplh] = useState(420);
  const [interp, setInterp] = useState('koniec-dnia');
  const [wym, setWym] = useState([]);
  const [busy, setBusy] = useState(false);
  const [prop, setProp] = useState(null);
  const [wyk, setWyk] = useState(null);
  const [historia, setHistoria] = useState([]);
  const [widok, setWidok] = useState('luki');
  const [dzienMapy, setDzienMapy] = useState(null);
  const [mplan, setMplan] = useState(null);
  const [model, setModel] = useState(null);
  const [kwal, setKwal] = useState(null);
  useEffect(() => { const m = String(from).slice(0, 7); api(`/month-plan?month=${m}`).then((r) => { if (r && r.success) { setMplan(r.plan && r.plan.status === 'APPROVED' ? r.plan : null); if (r.params && r.params.splh) setSplh(r.params.splh); if (r.params && r.params.interpretacja2359) setInterp(r.params.interpretacja2359); } }).catch(() => {}); }, [from]);
  const zaladuj = () => {
    api('/autoplan').then((r) => { if (r && r.success) setHistoria(r.proposals || []); }).catch(() => {});
    api('/work-model').then((r) => { if (r && r.success && r.model) setModel(r.model); }).catch(() => {});
    api('/qualifications').then((r) => { if (r && r.success && r.stan) setKwal(r.stan); }).catch(() => {});
  };
  useEffect(() => { zaladuj(); }, []);
  const modelOk = model && model.status === 'zatwierdzony' && (model.biblioteka || []).length > 0;
  const stacje = [...new Set(['MANAGER', 'KANAPKI / WRAPY', 'KONTROLER', 'PANIEROWANIE', 'SMAŻENIE', 'FRYTKI', 'PREP', 'ZMYWAK', ...(data.shifts || []).map((x) => x.station)])].filter(Boolean);
  const body = () => ({ from, to, aop: { totalHours: Number(aop.totalHours) || 0, sales: Number(aop.sales) || 0, transactions: Number(aop.transactions) || 0 }, wymagania: wym.filter((w) => w.station && w.start && w.end), splh: Number(splh) || 420, interpretacja2359: interp });
  const sprawdz = async () => {
    setBusy(true); const r = await api('/autoplan?action=feasibility', 'POST', body()); setBusy(false);
    if (r && r.success) { setWyk(r); data.show(r.wykonalnosc.ok ? `Wykonalne: ${r.podstawowych} instancji obsady podstawowej, brak problemów krytycznych.` : `Problemy wykonalności: ${r.wykonalnosc.problemy.filter((p) => p.waga === 'krytyczna').length} krytycznych — patrz panel.`, r.wykonalnosc.ok ? 'success' : 'error'); }
    else data.show((r && r.error) || 'Błąd sprawdzania', 'error');
  };
  const generuj = async () => {
    if (!modelOk && !wym.length) return data.show('Zatwierdź Model pracy (Planowanie → Model pracy) albo dodaj wymagane zmiany poniżej.', 'error');
    if (!mplan && !aop.totalHours) return data.show('Zatwierdź Plan miesiąca albo podaj limit godzin zespołu.', 'error');
    setBusy(true);
    const r = await api('/autoplan?action=generate', 'POST', { ...body(), seed: Date.now() % 100000 });
    setBusy(false);
    if (r && r.success) { setProp(r.proposal); setWyk(null); setWidok(r.proposal.luki && r.proposal.luki.length ? 'luki' : 'mapa'); setDzienMapy(r.proposal.okres.from); data.show(r.proposal.statusy.kompletna ? `Propozycja kompletna: ${r.proposal.podsumowanie.obsadzone} zmian, ${fmt(r.proposal.podsumowanie.godzinyRazem)} h.` : `Propozycja NIEKOMPLETNA: ${r.proposal.luki.length} luk obsady podstawowej, ${r.proposal.audyt.podsumowanie.krytyczne} problemów krytycznych — patrz „Luki”.`, r.proposal.statusy.kompletna ? 'success' : 'error'); zaladuj(); }
    else data.show((r && r.error) || 'Błąd generowania', 'error');
  };
  const zastosuj = async () => {
    if (!prop) return;
    const niekompletna = !(prop.statusy && prop.statusy.kompletna);
    if (!confirm(`Dopisać ${prop.podsumowanie.obsadzone} zmian do grafiku ${prop.okres.from} – ${prop.okres.to} jako wersję roboczą?${niekompletna ? `\n\nUWAGA: propozycja jest NIEKOMPLETNA (${prop.luki.length} luk obsady podstawowej, ${prop.audyt.podsumowanie.krytyczne} problemów krytycznych). Zmiany zostaną oznaczone jako niekompletny draft — publikacja będzie zablokowana do uzupełnienia; eksport roboczy pozostaje możliwy.` : ''}\n\nIstniejące zmiany (np. zaimportowany grafik kierowników) zostają — pokryły już ${prop.podsumowanie.pokryteIstniejacymi} szablonów.`)) return;
    setBusy(true);
    const r = await api('/autoplan?action=apply', 'POST', { id: prop.id });
    if (r && r.success) { const ok = await data.addHoursBulk(r.shifts); if (ok) { data.show(r.kompletna ? `Grafik roboczy uzupełniony (${r.zmian} zmian). Sprawdź go w Grafiku i opublikuj.` : `Dopisano ${r.zmian} zmian jako NIEKOMPLETNY draft. Uzupełnij luki w Grafiku przed publikacją.`, r.kompletna ? 'success' : 'error'); setProp({ ...prop, applied: true }); } }
    else data.show((r && r.error) || 'Błąd zastosowania', 'error');
    setBusy(false); zaladuj();
  };
  const ps = prop && prop.podsumowanie;
  const st = prop && prop.statusy;
  const pole = (k, label, suffix, ph) => <label className="input-label">{label}<div className="number-input"><input type="number" value={aop[k]} placeholder={ph} onChange={(e) => setAop((a) => ({ ...a, [k]: e.target.value }))} /><span>{suffix}</span></div></label>;
  const dniMapy = prop && prop.mapa ? Object.keys(prop.mapa).sort() : [];
  const mapaDnia = prop && prop.mapa && dzienMapy ? prop.mapa[dzienMapy] : null;
  const problemyDnia = prop && dzienMapy ? (prop.audyt.problemy || []).filter((p) => p.date === dzienMapy) : [];
  const kolorStatus = (v, ok, warn) => (v === ok ? '#292D32' : v === warn ? '#886929' : '#A94455');
  const wykPanel = wyk ? wyk.wykonalnosc : prop ? prop.wykonalnosc : null;
  const osoby = useMemo(() => prop ? Object.entries(prop.godzOsob).sort((a, b) => b[1].godz - a[1].godz) : [], [prop]);
  return (
    <div className="flex-1 min-h-0 overflow-y-auto"><div className="page-wrap module-view forecast-view" style={{ width: '100%' }}>
      <MHead kicker="PLANOWANIE • AUTOMATYCZNE UKŁADANIE" title="Ułóż grafik: najpierw stanowiska, potem ludzie" copy="Obsada podstawowa (otwarcie, środek, zamknięcie, zadania, kierownik) pochodzi z zatwierdzonego modelu pracy, obsada dodatkowa z prognozy sprzedaży. Ludzie są dobierani z macierzy kwalifikacji i dyspozycji w jednym budżecie godzin zespołu; luka krytyczna oznacza grafik niekompletny — nie do publikacji.">
        <button className="secondary-action" onClick={() => setPage('grafik')}><Calendar size={16} /> Grafik</button>
        <button className="secondary-action" disabled={busy} onClick={sprawdz}><ShieldCheck size={16} /> Sprawdź wykonalność</button>
        <button className="primary-action" disabled={busy} onClick={generuj}><Sparkles size={16} /> {busy ? 'Liczę…' : 'Wygeneruj propozycję'}</button>
      </MHead>
      <section className="forecast-layout">
        <aside className="forecast-controls panel">
          <div className="panel-title"><div><span>ZAŁOŻENIA</span><h2>Okres i budżet zespołu</h2></div><Sparkles size={19} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <label className="input-label">Od<div className="number-input"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div></label>
            <label className="input-label">Do<div className="number-input"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div></label>
          </div>
          {modelOk ? <div className="model-note" style={{ marginBottom: 8 }}><Check size={16} /><div><strong>Model pracy v{model.version} — zatwierdzony</strong><span>{model.biblioteka.filter((t) => t.typ === 'podstawowa').length} szablonów podstawowych, {model.biblioteka.filter((t) => t.typ === 'dodatkowa').length} dodatkowych. Obsada podstawowa każdego dnia wynika z modelu; pola „wymagane zmiany” poniżej są dodatkiem jednorazowym.</span></div></div>
            : <div className="dialog-notice" style={{ marginBottom: 8 }}><AlertTriangle size={16} /><span><b>Brak zatwierdzonego modelu pracy.</b> Bez niego silnik zna tylko wymagania z tego formularza i prognozę — nie zapewni otwarć, zamknięć ani kierownika. <button className="underline font-semibold" onClick={() => setPage('model-pracy')}>Zbuduj i zatwierdź model</button>.</span></div>}
          {kwal && kwal.tryb !== 'macierz' && <div className="dialog-notice" style={{ marginBottom: 8 }}><AlertTriangle size={16} /><span>{kwal.tryb === 'brak' ? 'Brak macierzy kwalifikacji — kandydaci będą dobierani z historii i oznaczeni „niepotwierdzeni”.' : `${kwal.bezDanych.length} osób bez macierzy kwalifikacji — dla nich tylko historia.`} <button className="underline font-semibold" onClick={() => setPage('kwalifikacje')}>Uzupełnij macierz</button>.</span></div>}
          {mplan ? <div className="model-note" style={{ marginBottom: 8 }}><Check size={16} /><div><strong>Z Planu miesiąca v{mplan.version} ({String(from).slice(0, 7)})</strong><span>{fmt(mplan.sales)} zł • {fmt(mplan.transactions)} trx{mplan.hoursAop != null ? ` • limit ${mplan.hoursAop} h AOP (cały zespół: crew + kierownicy)` : ''} — proporcjonalnie do dni okresu. Pola poniżej nadpisują plan tylko na tę propozycję.</span></div></div>
            : <div className="model-note" style={{ marginBottom: 8 }}><Sparkles size={16} /><div><strong>Brak zatwierdzonego Planu miesiąca</strong><span>Wpisz liczby ręcznie albo <button className="underline font-semibold" onClick={() => setPage('plan-miesiaca')}>zatwierdź plan</button>.</span></div></div>}
          {pole('totalHours', mplan ? 'Limit godzin zespołu (nadpisanie)' : 'Limit godzin zespołu (AOP, crew + kierownicy)', 'h', mplan ? 'z planu' : 'np. 4200')}
          {pole('sales', mplan ? 'Sprzedaż (nadpisanie)' : 'Prognoza sprzedaży okresu', 'PLN', mplan ? 'z planu' : 'np. 930000')}
          {pole('transactions', mplan ? 'Transakcje (nadpisanie)' : 'Prognoza transakcji', 'trx', mplan ? 'z planu' : 'np. 23500')}
          <label className="input-label">SPLH docelowe (obsada dodatkowa)<div className="number-input"><input type="number" value={splh} onChange={(e) => setSplh(e.target.value)} /><span>zł/h</span></div></label>
          <label className="input-label">Dyspozycja „do 23:59” oznacza<div className="number-input"><select value={interp} onChange={(e) => setInterp(e.target.value)} style={{ border: 0, background: 'transparent', width: '100%', fontSize: 12 }}><option value="koniec-dnia">koniec dnia (zmiana po północy = poza oknem)</option><option value="do-zamkniecia">do zamknięcia (zmiana może sięgać 02:00)</option></select></div></label>
          <div className="control-divider" />
          <label className="input-label">Dodatkowe wymagane zmiany (jednorazowo, poza modelem)</label>
          <div style={{ display: 'grid', gap: 6 }}>
            {wym.map((w, i) => (
              <div key={i} className="panel" style={{ padding: 8, display: 'grid', gridTemplateColumns: '1fr 64px 64px 24px', gap: 6, alignItems: 'center' }}>
                <select value={w.station} onChange={(e) => setWym((l) => l.map((x, j) => j === i ? { ...x, station: e.target.value } : x))} style={{ fontSize: 11, border: '1px solid #DCE3E9', borderRadius: 8, padding: '6px 6px' }}>{stacje.map((s) => <option key={s}>{s}</option>)}</select>
                <input type="time" value={w.start} onChange={(e) => setWym((l) => l.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} style={{ fontSize: 11, border: '1px solid #DCE3E9', borderRadius: 8, padding: '4px' }} />
                <input type="time" value={w.end} onChange={(e) => setWym((l) => l.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} style={{ fontSize: 11, border: '1px solid #DCE3E9', borderRadius: 8, padding: '4px' }} />
                <button onClick={() => setWym((l) => l.filter((_, j) => j !== i))} title="Usuń" style={{ border: 0, background: 'transparent', color: '#A94455', cursor: 'pointer' }}><X size={14} /></button>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 3 }}>{[1, 2, 3, 4, 5, 6, 0].map((dw) => <button key={dw} onClick={() => setWym((l) => l.map((x, j) => j === i ? { ...x, dni: x.dni.includes(dw) ? x.dni.filter((y) => y !== dw) : [...x.dni, dw] } : x))} style={{ flex: 1, fontSize: 11, fontWeight: 800, padding: '3px 0', borderRadius: 6, border: '1px solid #DCE3E9', background: !w.dni.length || w.dni.includes(dw) ? '#E8F0F7' : '#fff', color: !w.dni.length || w.dni.includes(dw) ? '#2674B8' : '#65717C', cursor: 'pointer' }}>{DNI[dw]}</button>)}</div>
              </div>
            ))}
            <button className="secondary-action" onClick={() => setWym((l) => [...l, { station: stacje[0], start: '14:00', end: '22:00', dni: [] }])}><Plus size={14} /> Dodaj wymaganą zmianę</button>
          </div>
          <details className="model-note" style={{ display: 'block' }}>
            <summary style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', listStyle: 'none' }}><Sparkles size={16} /><strong>Jak powstaje propozycja</strong><span style={{ marginLeft: 'auto', fontSize: 11, opacity: .75 }}>szczegóły ▾</span></summary>
            <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.5 }}>
              <p style={{ margin: '0 0 4px' }}><b>1. Obsada podstawowa:</b> instancje szablonów z modelu pracy dla każdego dnia (otwarcie, środek, zamknięcie, zadania, MANAGER). Istniejące zmiany w grafiku — np. zaimportowany grafik kierowników — pokrywają szablony i wchodzą do budżetu.</p>
              <p style={{ margin: '0 0 4px' }}><b>2. Obsada dodatkowa:</b> prognoza sprzedaży → osoby co 15 min (SPLH) minus obsada podstawowa (godzina kierownika liczona udziałem operacyjnym) → bloki 4–8 h w granicach jednego limitu godzin zespołu. Limit jest granicą, nie celem.</p>
              <p style={{ margin: '0 0 4px' }}><b>3. Wykonalność przed:</b> dla każdej instancji pula kandydatów (macierz kwalifikacji, dyspozycja, absencja, limity godzin). Stanowisko bez puli i instancja bez kandydata są raportowane zanim cokolwiek się przypisze.</p>
              <p style={{ margin: '0 0 4px' }}><b>4. Przypisanie całego okresu:</b> najpierw podstawowe i krytyczne, w kolejności „najmniej kandydatów”; twarde reguły identyczne z zapisem grafiku (okno dyspozycji w dobie 06→06, pusty dzień = niedostępność, 12 h w bloku, 11 h odpoczynku, max godzin osoby); punktacja: poziom kwalifikacji, cel godzin, nawyki, ciągłość, oszczędzanie rzadkich specjalistów.</p>
              <p style={{ margin: '0 0 4px' }}><b>5. Naprawa luk:</b> przesunięcie w granicach elastyczności szablonu, podział na dwa dyżury, wydłużenie sąsiada (do 12 h), zamiana z obsadą dodatkową. Każda pozostała luka ma powód i podpowiedź.</p>
              <p style={{ margin: 0 }}><b>6. Kompletność po:</b> audyt ciągłości stanowisk co 15 min, kierownika, czasu pracy i dyspozycji + silnik prawa pracy. Luka krytyczna = status „niekompletny”.</p>
            </div>
          </details>
          <button className="generate-button" disabled={busy} onClick={generuj}><Sparkles size={17} /> {busy ? 'Liczę…' : 'Przelicz i wygeneruj propozycję'}</button>
        </aside>

        <div className="forecast-main">
          <section className="forecast-kpis">
            <MMetric icon={Users} label="Obsada podstawowa" value={ps ? `${ps.podstawowychObsadzonych} / ${ps.podstawowych}` : '—'} helper={ps ? (prop.luki.length ? `${prop.luki.length} luk — patrz zakładka Luki` : `komplet • ${ps.dodatkowych} zmian dodatkowych z prognozy`) : 'wygeneruj propozycję'} tone={ps && prop.luki.length ? 'coral' : 'mint'} />
            <MMetric icon={Clock3} label="Godziny zespołu" value={ps ? `${fmt(ps.godzinyRazem)} h` : '—'} helper={ps ? `${ps.limitH ? `limit ${fmt(ps.limitH)} h (${ps.wykorzystanieLimituPct} %)` : 'bez limitu'} • crew ${fmt(ps.godzinyCrew)} h • kier. ${fmt(ps.godzinyMgrOperacyjne)} h oper. + ${fmt(ps.godzinyMgrAdministracyjne)} h adm.` : '—'} tone={st && st.budzet === 'przekroczony' ? 'coral' : 'violet'} />
            <MMetric icon={CircleDollarSign} label="Koszt / MPT" value={!ps ? '—' : ps.kosztSzac == null ? 'brak danych' : `${fmt(ps.kosztSzac)} zł`} helper={!ps ? '—' : ps.kosztSzac == null ? `${(ps.bezStawki || []).length} osób bez stawki • ${ps.pokrycieStawekPct} % godzin ze stawką${ps.mpt ? ` • MPT ${ps.mpt}` : ''}` : `${ps.colSzac != null ? `COL ${ps.colSzac.toFixed(1).replace('.', ',')} %` : ''}${ps.mpt ? ` • MPT ${ps.mpt}` : ''}`} tone={ps && ps.kosztSzac == null ? 'coral' : 'blue'} />
            <MMetric icon={ShieldCheck} label="Jakość operacyjna" value={ps ? `${ps.audyt.krytyczne} kryt. • ${ps.audyt.wazne} do decyzji` : '—'} helper={ps ? `KP: ${ps.naruszenia.block} blokad, ${ps.naruszenia.warn} uwag • ${ps.napraw} napraw silnika` : '—'} tone={ps && (ps.audyt.krytyczne || ps.naruszenia.block) ? 'coral' : 'mint'} />
          </section>
          {st && (
            <div className="dialog-stat-grid" style={{ marginTop: 10, gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="dialog-stat"><span>Wynik</span><strong style={{ color: st.kompletna ? '#407362' : '#A94455' }}>{st.kompletna ? 'KOMPLETNY — do publikacji' : 'NIEKOMPLETNY — eksport roboczy'}</strong></div>
              <div className="dialog-stat"><span>Wykonalność</span><strong style={{ color: kolorStatus(st.wykonalnosc, 'ok', 'x') }}>{st.wykonalnosc === 'ok' ? 'ok' : `${prop.wykonalnosc.problemy.filter((p) => p.waga === 'krytyczna').length} problemów`}</strong></div>
              <div className="dialog-stat"><span>Obsada</span><strong style={{ color: kolorStatus(st.obsada, 'pelna', 'x') }}>{st.obsada === 'pelna' ? 'pełna' : `częściowa (${ps.pokrycieWymagan} %)`}</strong></div>
              <div className="dialog-stat"><span>Operacyjnie</span><strong style={{ color: kolorStatus(st.operacyjnie, 'ok', 'do decyzji') }}>{st.operacyjnie}</strong></div>
              <div className="dialog-stat"><span>Budżet</span><strong style={{ color: kolorStatus(st.budzet, 'ok', 'brak limitu') }}>{st.budzet === 'ok' ? 'w limicie' : st.budzet}</strong></div>
              <div className="dialog-stat"><span>Kwalifikacje</span><strong style={{ color: kolorStatus(st.kwalifikacje, 'potwierdzone', 'x'), fontSize: 12 }}>{st.kwalifikacje} • {st.dane.kwalifikacje}</strong></div>
              <div className="dialog-stat"><span>Model pracy / stawki</span><strong style={{ fontSize: 12, color: st.dane.stawki === 'ok' ? '#292D32' : '#886929' }}>{st.dane.modelPracy} • {st.dane.stawki === 'ok' ? 'stawki ok' : st.dane.stawki}</strong></div>
              <div className="dialog-stat"><span>Reguły KP</span><strong style={{ color: kolorStatus(st.reguly, 'ok', 'ostrzezenia') }}>{st.reguly === 'ok' ? 'bez uwag' : st.reguly === 'blokady' ? `${ps.naruszenia.block} blokad` : `${ps.naruszenia.warn} ostrzeżeń`}</strong></div>
            </div>
          )}
          {wykPanel && (wykPanel.problemy || []).length > 0 && (
            <article className="panel" style={{ padding: 14, marginTop: 10 }}>
              <div className="panel-title"><div><span>WYKONALNOŚĆ {wyk ? 'PRZED GENEROWANIEM' : ''}</span><h2>{wykPanel.ok ? 'Bez problemów krytycznych' : `${wykPanel.problemy.filter((p) => p.waga === 'krytyczna').length} problemów krytycznych`}</h2></div><small style={{ color: '#65717C' }}>{wykPanel.instancjiBezKandydata} instancji bez kandydata • tryb kwalifikacji: {wykPanel.trybKwalifikacji}</small></div>
              <div className="dialog-list" style={{ marginTop: 8 }}>{wykPanel.problemy.slice(0, 30).map((p, i) => <div key={i}><i style={p.waga === 'krytyczna' ? { color: '#fff', background: '#A94455' } : undefined}>{p.waga === 'krytyczna' ? '!' : 'i'}</i><span><strong>{p.station || p.typ}{p.date ? ` • ${p.date}` : ''}</strong><small>{p.opis}{p.naprawa ? ` → ${p.naprawa}` : ''}</small></span><em>{p.waga}</em></div>)}</div>
              {wykPanel.puleStanowisk && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{Object.entries(wykPanel.puleStanowisk).map(([s2, p]) => <span key={s2} className="status-pill" style={{ fontSize: 11, padding: '3px 8px', borderRadius: 8, background: p.potwierdzeni ? '#E8F0F7' : '#FAE9ED', color: p.potwierdzeni ? '#407362' : '#A94455' }}><i style={{ width: 8, height: 8, borderRadius: 2, background: stationAccent(s2), display: 'inline-block', marginRight: 4 }} />{s2}: {p.potwierdzeni} potw.{p.zHistorii ? ` + ${p.zHistorii} hist.` : ''} / max {p.maxRownoczesnie} naraz • {p.godzinOkres} h</span>)}</div>}
            </article>
          )}
          {ps && ps.deficytStanowisk && Object.keys(ps.deficytStanowisk).length > 0 && (
            <div className="dialog-notice" style={{ marginTop: 10 }}><AlertTriangle size={16} /><span><b>Deficyt stanowiskowy:</b> {Object.entries(ps.deficytStanowisk).map(([s2, d]) => `${s2}: ${[d.nieobsadzoneH ? `${d.nieobsadzoneH} h bez osoby` : '', d.bezKwalifikacjiH ? `${d.bezKwalifikacjiH} h osobą bez historii` : '', d.niepotwierdzoneH ? `${d.niepotwierdzoneH} h kwalifikacja niepotwierdzona` : ''].filter(Boolean).join(', ')} (${d.dni} dni)`).join(' • ')}.</span></div>
          )}

          {!prop ? (
            <article className="panel" style={{ padding: 24 }}>
              <div className="panel-title"><div><span>KOLEJNOŚĆ</span><h2>Od modelu pracy do kompletnego grafiku</h2></div></div>
              <ol style={{ margin: '8px 0 0 18px', color: '#65717C', fontSize: 12.5, lineHeight: 1.7 }}>
                <li><b>Model pracy</b> — zatwierdzona biblioteka zmian (otwarcie, środek, zamknięcie, zadania, MANAGER) per dzień tygodnia. {modelOk ? <em className="status-ready">zatwierdzony v{model.version}</em> : <em className="status-warning">brak</em>}</li>
                <li><b>Macierz kwalifikacji</b> — kto może samodzielnie stać na którym stanowisku. {kwal ? <em className={kwal.tryb === 'macierz' ? 'status-ready' : 'status-warning'}>{kwal.tryb === 'macierz' ? 'komplet' : kwal.tryb === 'brak' ? 'brak' : `${kwal.bezDanych.length} osób bez danych`}</em> : null}</li>
                <li><b>Dyspozycje i cele godzin</b> — puste pole = niedostępność; minimum / cel / maksimum w Pracownikach.</li>
                <li><b>Sprawdź wykonalność</b> — pule kandydatów per stanowisko, instancje bez kandydata, budżet vs obsada podstawowa.</li>
                <li><b>Wygeneruj</b> — wynik z mapą godzina × stanowisko, lukami z wyjaśnieniem i statusem kompletności. Zastosowanie dopisuje zmiany do wersji roboczej; publikacja ma bramkę kompletności.</li>
              </ol>
            </article>
          ) : (
            <article className="panel" style={{ padding: 18 }}>
              <div className="panel-title"><div><span>PROPOZYCJA {prop.id.toUpperCase()} • {prop.okres.from} – {prop.okres.to}</span><h2>Wynik silnika</h2></div>
                <div className="filter-tabs">{[['luki', `Luki (${prop.luki.length})`], ['mapa', 'Mapa godzina × stanowisko'], ['dni', 'Dni'], ['zmiany', 'Zmiany'], ['osoby', 'Osoby'], ['kp', 'Audyt i KP']].map(([k, l]) => <button key={k} className={widok === k ? 'active' : ''} onClick={() => setWidok(k)}>{l}</button>)}</div>
              </div>
              {widok === 'luki' && (prop.luki.length ? <div className="dialog-list" style={{ marginTop: 8 }}>{prop.luki.map((l, i) => <div key={i}><i style={l.krytyczne ? { color: '#fff', background: '#A94455' } : undefined}>!</i><span><strong>{DNI[new Date(l.date + 'T12:00:00').getDay()]} {l.date.slice(8)}.{l.date.slice(5, 7)} • {l.station} {l.start}–{l.end}</strong><small>{l.wyjasnienie}</small></span><em>{l.krytyczne ? 'krytyczna' : 'podstawowa'}</em></div>)}</div> : <div className="dialog-empty" style={{ padding: 20 }}>Wszystkie instancje obsady podstawowej są obsadzone.{(prop.audyt.problemy || []).some((p) => p.waga !== 'info') ? ' Sprawdź zakładkę „Audyt i KP” — są uwagi do decyzji.' : ''}</div>)}
              {widok === 'mapa' && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>{dniMapy.map((d) => { const n = (prop.audyt.perDate || {})[d] || 0; return <button key={d} onClick={() => setDzienMapy(d)} style={{ fontSize: 11, fontWeight: 700, padding: '3px 7px', borderRadius: 6, border: '1px solid ' + (dzienMapy === d ? '#2674B8' : '#DCE3E9'), background: dzienMapy === d ? '#E8F0F7' : n ? '#FAE9ED' : '#fff', color: n ? '#A94455' : '#3F4A55', cursor: 'pointer' }}>{DNI[new Date(d + 'T12:00:00').getDay()]} {d.slice(8)}{n ? ` !${n}` : ''}</button>; })}</div>
                  {mapaDnia ? (
                    <div style={{ overflowX: 'auto' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '150px repeat(48, minmax(13px, 1fr))', gap: 1, fontSize: 10, minWidth: 820 }}>
                        <span />{H48.map((i) => <span key={i} style={{ textAlign: 'center', color: '#65717C', fontWeight: i % 2 ? 400 : 700 }}>{i % 2 ? '' : String((6 + i / 2) % 24).padStart(2, '0')}</span>)}
                        <span style={{ fontWeight: 700, fontSize: 11 }}>Kierownik</span>{mapaDnia.mgr.map((v, i) => <span key={i} style={{ height: 18, borderRadius: 2, textAlign: 'center', lineHeight: '18px', fontWeight: 700, background: v ? '#292D32' : mapaDnia.razem[i] ? '#FAE9ED' : '#EDF0F3', color: v ? '#fff' : mapaDnia.razem[i] ? '#A94455' : 'transparent' }}>{v || (mapaDnia.razem[i] ? '!' : '')}</span>)}
                        {Object.entries(mapaDnia.stanowiska).sort((a, b) => a[0].localeCompare(b[0])).map(([s2, m]) => (
                          <React.Fragment key={s2}>
                            <span style={{ fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><i style={{ width: 8, height: 8, borderRadius: 2, background: stationAccent(s2), flex: 'none' }} />{s2}</span>
                            {H48.map((i) => { const o = m.obsada[i], r = m.wymagane[i]; const brak = r > o; const nadm = o > r && r > 0; return <span key={i} title={`${s2} ${String((6 + Math.floor(i / 2)) % 24).padStart(2, '0')}:${i % 2 ? '30' : '00'} — jest ${o}, wymagane ${r}`} style={{ height: 18, borderRadius: 2, textAlign: 'center', lineHeight: '18px', fontWeight: 700, background: brak ? '#A94455' : o ? stationFill(s2) : '#EDF0F3', color: brak ? '#fff' : o ? '#292D32' : 'transparent', boxShadow: o && !brak ? `inset 0 -2px 0 ${stationAccent(s2)}` : 'none', opacity: 1, outline: nadm ? '1px solid #886929' : 'none' }}>{brak ? `${o}/${r}` : o || ''}</span>; })}
                          </React.Fragment>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#65717C', marginTop: 6 }}><span><i style={{ display: 'inline-block', width: 10, height: 10, background: '#A94455', borderRadius: 2, marginRight: 4 }} />brak obsady (jest/wymagane)</span><span><i style={{ display: 'inline-block', width: 10, height: 10, outline: '1px solid #886929', borderRadius: 2, marginRight: 4 }} />więcej niż wymaga model</span><span>! — zespół pracuje bez kierownika</span></div>
                      {problemyDnia.length > 0 && <div className="dialog-list" style={{ marginTop: 10 }}>{problemyDnia.map((p, i) => <div key={i}><i style={p.waga === 'krytyczna' ? { color: '#fff', background: '#A94455' } : undefined}>{p.waga === 'krytyczna' ? '!' : 'i'}</i><span><strong>{p.nazwa}</strong><small>{p.opis}{p.naprawa ? ` → ${p.naprawa}` : ''}</small></span><em>{p.waga}</em></div>)}</div>}
                    </div>
                  ) : <div className="dialog-empty" style={{ padding: 20 }}>Wybierz dzień.</div>}
                </div>
              )}
              {widok === 'dni' && <div className="data-table forecast-table" style={{ marginTop: 8 }}>
                <div className="table-header"><span>Dzień</span><span>Sprzedaż</span><span>Trx</span><span>Podstawowa h</span><span>Dodatkowa h</span><span>Deficyt popytu</span><span>Szczyt os.</span><span>Problemy</span></div>
                {prop.perDzien.map((d) => <div className="table-row" key={d.date}><span><b>{DNI[d.dow]}, {d.date.slice(8)}.{d.date.slice(5, 7)}</b></span><span><strong>{fmt(d.sales)} zł</strong></span><span>{d.trx}</span><span>{d.podstawowaH} h</span><span>{d.dodatkowaH} h ({d.dodatkowych})</span><span className={d.deficytPopytuH > 4 ? 'table-danger' : 'table-good'}>{d.deficytPopytuH} h</span><span>{d.szczyt}</span><span className={(prop.audyt.perDate || {})[d.date] ? 'table-danger' : 'table-good'}>{(prop.audyt.perDate || {})[d.date] || 0} kryt.</span></div>)}
              </div>}
              {widok === 'zmiany' && <div className="data-table forecast-table" style={{ marginTop: 8 }}>
                <div className="table-header"><span>Dzień</span><span>Godziny</span><span>Stanowisko</span><span>Osoba</span><span>Typ / źródło</span><span>Kwalifikacja</span><span>Naprawa</span><span>Status</span></div>
                {prop.przypisania.map((z, i) => <div className="table-row" key={i}><span><b>{DNI[new Date(z.date + 'T12:00:00').getDay()]} {z.date.slice(8)}.{z.date.slice(5, 7)}</b></span><span>{z.start}–{z.end}</span><span>{z.station}</span><span><strong>{z.display || '—'}</strong></span><span>{z.typ}{z.rola ? ` • ${z.rola}` : ''}</span><span>{z.accountId ? (z.kwalifikacjaZrodlo === 'historia' ? 'z historii (niepotw.)' : z.bezHistoriiStanowiska ? 'BRAK' : z.wSzkoleniu ? 'w szkoleniu' : z.kwalifikacjaZrodlo || '—') : '—'}</span><span>{z.naprawa || ''}</span><span><em className={z.nieobsadzona ? 'status-warning' : 'status-ready'}>{z.nieobsadzona ? 'luka' : 'obsadzona'}</em></span></div>)}
              </div>}
              {widok === 'osoby' && <div className="data-table forecast-table" style={{ marginTop: 8 }}>
                <div className="table-header"><span>Osoba</span><span>Godziny</span><span>Cel / max</span><span>Odchylenie</span><span>Dni • weekendy</span><span>Otwarcia / zamknięcia</span><span>Wyjaśnienie</span><span>Wypełnienie</span></div>
                {osoby.map(([id, o]) => <div className="table-row" key={id}><span><b>{o.name}</b></span><span>{o.godz} h</span><span>{o.cel != null ? `${o.cel} h` : '—'}{o.max != null ? ` / ${o.max} h` : ''}<small style={{ color: '#65717C' }}> ({o.zrodloCelu})</small></span><span className={o.odchylenie != null && Math.abs(o.odchylenie) > 8 ? 'table-danger' : ''}>{o.odchylenie != null ? `${o.odchylenie > 0 ? '+' : ''}${o.odchylenie} h` : '—'}</span><span>{o.dni} • {o.weekendy}</span><span>{o.otwarcia} / {o.zamkniecia}</span><span style={{ fontSize: 11 }}>{o.wyjasnienie || ''}</span><span><i className="coverage-bar"><b style={{ width: `${o.cel ? Math.min(100, o.godz / o.cel * 100) : o.max ? Math.min(100, o.godz / o.max * 100) : 0}%` }} /></i>{o.cel ? `${Math.round(o.godz / o.cel * 100)}%` : o.max ? `${Math.round(o.godz / o.max * 100)}% max` : '—'}</span></div>)}
              </div>}
              {widok === 'kp' && (
                <div style={{ marginTop: 8 }}>
                  {(prop.audyt.problemy || []).filter((p) => p.waga !== 'info').length ? <div className="dialog-list">{prop.audyt.problemy.filter((p) => p.waga !== 'info').map((p, i) => <div key={i}><i style={p.waga === 'krytyczna' ? { color: '#fff', background: '#A94455' } : undefined}>{p.waga === 'krytyczna' ? '!' : 'i'}</i><span><strong>{p.nazwa} • {p.date}{p.od ? ` ${p.od}–${p.do}` : ''}</strong><small>{p.opis}{p.naprawa ? ` → ${p.naprawa}` : ''}</small></span><em>{p.waga}</em></div>)}</div> : <div className="dialog-empty" style={{ padding: 16 }}>Audyt operacyjny: brak problemów krytycznych i do decyzji.{(prop.audyt.problemy || []).length ? ` (${prop.audyt.problemy.length} informacji, np. brak deklaracji dyspozycji)` : ''}</div>}
                  {prop.naruszenia.length ? <div className="dialog-list" style={{ marginTop: 10 }}>{prop.naruszenia.map((v, i) => <div key={i}><i style={v.level === 'block' ? { color: '#fff', background: '#A94455' } : undefined}>{v.level === 'block' ? '!' : 'i'}</i><span><strong>{v.name} • {v.date}</strong><small>{v.rule}: {v.message}</small></span><em>{v.level === 'block' ? 'blokada' : 'uwaga'}</em></div>)}</div> : <div className="dialog-empty" style={{ padding: 16, marginTop: 8 }}>Brak naruszeń prawa pracy w propozycji.</div>}
                </div>
              )}
              <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#65717C', marginRight: 'auto' }}>Każde przeliczenie losuje inny porządek remisów; założenia i model pozostają te same.</span>
                <button className="secondary-action" disabled={busy} onClick={generuj}><RefreshCw size={15} /> Przelicz ponownie</button>
                <button className="primary-action" disabled={busy || prop.applied} onClick={zastosuj}><Check size={15} /> {prop.applied ? 'Zastosowano' : st && st.kompletna ? 'Zastosuj do grafiku roboczego' : 'Zastosuj jako niekompletny draft'}</button>
              </div>
            </article>
          )}
        </div>
      </section>
      {historia.length > 0 && <article className="panel" style={{ marginTop: 14, padding: 16 }}>
        <div className="panel-title"><div><span>HISTORIA</span><h2>Ostatnie propozycje</h2></div></div>
        <div className="data-table forecast-table" style={{ marginTop: 8 }}><div className="table-header"><span>ID</span><span>Okres</span><span>Autor</span><span>Podstawowa</span><span>Godziny</span><span>Kompletność</span><span /><span>Status</span></div>
          {historia.map((h) => <div className="table-row" key={h.id} style={{ cursor: 'pointer' }} onClick={() => api(`/autoplan?id=${h.id}`).then((r) => { if (r && r.proposal) { setProp(r.proposal); setDzienMapy(r.proposal.okres.from); } })}><span><b>{h.id}</b></span><span>{h.okres.from} – {h.okres.to}</span><span>{h.by}</span><span>{h.podsumowanie.podstawowychObsadzonych != null ? `${h.podsumowanie.podstawowychObsadzonych}/${h.podsumowanie.podstawowych}` : `${h.podsumowanie.obsadzone}/${h.podsumowanie.zmian}`}</span><span>{fmt(h.podsumowanie.godzinyRazem != null ? h.podsumowanie.godzinyRazem : h.podsumowanie.godzinyCrew)} h</span><span><em className={h.statusy && h.statusy.kompletna ? 'status-ready' : 'status-warning'}>{h.statusy ? (h.statusy.kompletna ? 'kompletna' : 'niekompletna') : '—'}</em></span><span /><span><em className={h.applied ? 'status-ready' : 'status-active'}>{h.applied ? 'zastosowana' : 'robocza'}</em></span></div>)}
        </div>
      </article>}
    </div></div>
  );
};
