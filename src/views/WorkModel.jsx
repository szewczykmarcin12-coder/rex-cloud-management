import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ClipboardList, FileSpreadsheet, Plus, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { api } from '../lib/api.js';
import { MHead, MMetric } from '../ui/primitives.jsx';
import { parseGrafik } from '../parseGrafik.js';
import { stationFill, stationAccent } from '../lib/domain.js';

// ── Planowanie → Model pracy: zatwierdzona biblioteka zmian operacyjnych + słownik stanowisk ──
// Obsada PODSTAWOWA (otwarcie / środek / zamknięcie / zadania / kierownik) per dzień tygodnia jest źródłem
// wymagań dla autoplanu i audytu grafiku. Obsada DODATKOWA odpowiada na prognozę. Propozycja z istniejącego
// grafiku wymaga zatwierdzenia — grafik źródłowy nie jest wzorcem bezbłędnych przypisań.
const DNI = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb'];
const KOLEJ = [1, 2, 3, 4, 5, 6, 0];
const ROLE = { otwarcie: 'otwarcie', srodek: 'środek dnia', zamkniecie: 'zamknięcie', zadanie: 'zadanie' };
const mn = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const opMin = (t) => { let x = mn(t) - 360; if (x < 0) x += 1440; return x; };
const durH = (a, b) => { let d = mn(b) - mn(a); if (d <= 0) d += 1440; return d / 60; };

export const WorkModelView = ({ data, setPage }) => {
  const [model, setModel] = useState(null);
  const [slownik, setSlownik] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dow, setDow] = useState(5);
  const [zrodloM, setZrodloM] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const fileRef = useRef(null);
  const zaladuj = () => api('/work-model').then((r) => { if (r && r.success && r.model) { setModel(r.model); setSlownik(r.slownik || []); setDirty(false); } }).catch(() => {});
  useEffect(() => { zaladuj(); }, []);
  const bib = (model && model.biblioteka) || [];
  const stacje = useMemo(() => [...new Set([...bib.map((t) => t.station), ...Object.keys((model && model.stanowiska) || {})])].sort(), [bib, model]);
  const upd = (id, patch) => { setModel((m) => ({ ...m, biblioteka: m.biblioteka.map((t) => (t.id === id ? { ...t, ...patch } : t)) })); setDirty(true); };
  const usun = (id) => { setModel((m) => ({ ...m, biblioteka: m.biblioteka.filter((t) => t.id !== id) })); setDirty(true); };
  const dodaj = (station) => { setModel((m) => ({ ...m, biblioteka: [...m.biblioteka, { id: 'tpl' + Date.now().toString(36), station: station || stacje[0] || 'KONTROLER', start: '12:00', end: '20:00', dni: [0, 1, 2, 3, 4, 5, 6], liczba: 1, typ: 'podstawowa', rola: 'srodek', flexMin: 60, minH: 4, maxH: 10, godzin: 8 }] })); setDirty(true); };
  const updSt = (kod, patch) => { setModel((m) => ({ ...m, stanowiska: { ...(m.stanowiska || {}), [kod]: { ...((m.stanowiska || {})[kod] || {}), ...patch } } })); setDirty(true); };
  const zapisz = async () => {
    setBusy(true);
    const r = await api('/work-model', 'PUT', { biblioteka: model.biblioteka, stanowiska: model.stanowiska, przekazanieMin: model.przekazanieMin, mgrOperacyjnyUdzial: model.mgrOperacyjnyUdzial, mgrNaZmianie: model.mgrNaZmianie });
    setBusy(false);
    if (r && r.success) { setModel(r.model); setDirty(false); data.show(`Model zapisany (v${r.model.version}) — status: propozycja. Zatwierdź, aby autoplan i audyt go używały.`); } else data.show((r && r.error) || 'Błąd zapisu', 'error');
  };
  const zatwierdz = async () => {
    if (dirty) return data.show('Najpierw zapisz zmiany.', 'error');
    if (!confirm(`Zatwierdzić model pracy v${model.version} (${bib.filter((t) => t.typ === 'podstawowa').length} szablonów podstawowych)? Od tej chwili autoplan planuje obsadę podstawową z tego modelu, a audyt i publikacja grafiku sprawdzają ciągłość stanowisk względem niego.`)) return;
    setBusy(true); const r = await api('/work-model?action=approve', 'POST', {}); setBusy(false);
    if (r && r.success) { setModel(r.model); data.show('Model pracy zatwierdzony.'); } else data.show((r && r.error) || 'Błąd', 'error');
  };
  const wyprowadzZBazy = async () => {
    if (!/^\d{4}-\d{2}$/.test(zrodloM)) return;
    if (bib.length && !confirm('Zastąpić bieżącą bibliotekę propozycją wyprowadzoną z grafiku? Dotychczasowe szablony zostaną nadpisane (status wróci do „propozycja”).')) return;
    setBusy(true); const r = await api('/work-model?action=derive', 'POST', { from: `${zrodloM}-01`, to: `${zrodloM}-31`, plik: `grafik ${zrodloM} (baza)` }); setBusy(false);
    if (r && r.success) { setModel(r.model); setDirty(false); data.show(`Propozycja: ${r.model.biblioteka.length} szablonów z ${r.model.zrodlo.zmian} zmian. Przejrzyj uwagi i zatwierdź.`); } else data.show((r && r.error) || 'Błąd', 'error');
  };
  const wyprowadzZPliku = async (file) => {
    if (!file) return;
    try {
      const buf = await file.arrayBuffer(); const p = parseGrafik(buf);
      if (!p.meta.hasStations) return data.show('Ten plik nie ma kolumny stanowisk — użyj eksportu „ze stanowiskami” (3 kolumny na dzień).', 'error');
      if (bib.length && !confirm(`Zastąpić bieżącą bibliotekę propozycją z pliku ${file.name} (${p.shifts.length} zmian)?`)) return;
      setBusy(true); const r = await api('/work-model?action=derive', 'POST', { shifts: p.shifts, plik: file.name }); setBusy(false);
      if (r && r.success) { setModel(r.model); setDirty(false); data.show(`Propozycja z pliku: ${r.model.biblioteka.length} szablonów. Przejrzyj uwagi i zatwierdź.`); } else data.show((r && r.error) || 'Błąd', 'error');
    } catch (e) { setBusy(false); data.show(`Nie udało się odczytać pliku: ${e.message}`, 'error'); }
  };
  // podgląd dnia tygodnia: obsada podstawowa per stanowisko w godzinach 06→06 (48 półgodzin)
  const siatka = useMemo(() => {
    const out = {};
    bib.filter((t) => t.typ === 'podstawowa' && (!t.dni || !t.dni.length || t.dni.includes(dow))).forEach((t) => {
      const n = t.liczbaDow && t.liczbaDow[dow] != null ? t.liczbaDow[dow] : (t.liczba || 1);
      const arr = out[t.station] = out[t.station] || new Array(48).fill(0);
      const a = Math.floor(opMin(t.start) / 30); let e = opMin(t.end); if (e <= opMin(t.start)) e += 1440; const b = Math.min(48, Math.ceil(e / 30));
      for (let i = a; i < b; i++) arr[i] += n;
    });
    return out;
  }, [bib, dow]);
  const godzTyg = (typ) => bib.filter((t) => t.typ === typ).reduce((a, t) => a + durH(t.start, t.end) * (t.liczba || 1) * (t.dni && t.dni.length ? t.dni.length : 7), 0);
  const godzDnia = Object.values(siatka).reduce((a, arr) => a + arr.reduce((x, y) => x + y, 0) / 2, 0);
  if (!model) return <div className="flex-1 min-h-0 overflow-y-auto"><div className="page-wrap module-view"><MHead kicker="PLANOWANIE • MODEL PRACY" title="Model pracy restauracji" copy="Ładowanie…" /></div></div>;
  const statusTxt = model.status === 'zatwierdzony' ? `zatwierdzony v${model.version} • ${model.approvedBy || ''} ${model.approvedAt ? model.approvedAt.slice(0, 10) : ''}` : model.status === 'propozycja' ? `propozycja v${model.version} — wymaga zatwierdzenia` : 'brak — autoplan używa wymagań z formularza';
  return (
    <div className="flex-1 min-h-0 overflow-y-auto"><div className="page-wrap module-view forecast-view" style={{ width: '100%' }}>
      <MHead kicker="PLANOWANIE • MODEL PRACY" title="Model pracy restauracji" copy="Zatwierdzona biblioteka zmian operacyjnych: co musi być obsadzone, kiedy i w ilu osobach — otwarcie, środek dnia, zamknięcie, zadania (PREP, DOSTAWA) i kierownik, osobno dla każdego dnia tygodnia. To obsada podstawowa; obsadę dodatkową autoplan dokłada z prognozy sprzedaży.">
        <button className="secondary-action" disabled={busy || !dirty} onClick={zapisz}><Save size={16} /> Zapisz</button>
        <button className="primary-action" disabled={busy || dirty || !bib.length || model.status === 'zatwierdzony'} onClick={zatwierdz}><Check size={16} /> {model.status === 'zatwierdzony' ? 'Zatwierdzony' : 'Zatwierdź model'}</button>
      </MHead>
      <section className="forecast-kpis">
        <MMetric icon={ClipboardList} label="Status" value={model.status === 'zatwierdzony' ? 'zatwierdzony' : model.status === 'propozycja' ? 'propozycja' : 'brak'} helper={statusTxt} tone={model.status === 'zatwierdzony' ? 'mint' : model.status === 'propozycja' ? 'violet' : 'coral'} />
        <MMetric icon={ClipboardList} label="Szablony podstawowe" value={bib.filter((t) => t.typ === 'podstawowa').length} helper={`${Math.round(godzTyg('podstawowa'))} h / tydzień • ${bib.filter((t) => t.typ === 'dodatkowa').length} dodatkowych (${Math.round(godzTyg('dodatkowa'))} h)`} tone="blue" />
        <MMetric icon={ClipboardList} label="Stanowiska krytyczne" value={stacje.filter((st) => ((model.stanowiska || {})[st] || {}).krytyczne).length} helper="przerwa w obsadzie = luka krytyczna" tone="violet" />
        <MMetric icon={ClipboardList} label="Źródło" value={model.zrodlo ? (model.zrodlo.plik || 'grafik') : '—'} helper={model.zrodlo ? `${model.zrodlo.od} – ${model.zrodlo.do} • ${model.zrodlo.zmian} zmian` : 'wyprowadź z grafiku albo dodaj ręcznie'} tone="blue" />
      </section>

      <section className="forecast-layout">
        <aside className="forecast-controls panel">
          <div className="panel-title"><div><span>PROPOZYCJA</span><h2>Wyprowadź z grafiku</h2></div><RefreshCw size={18} /></div>
          <p style={{ fontSize: 12, color: '#65717C', margin: '0 0 8px', lineHeight: 1.5 }}>Dla każdego stanowiska i dnia tygodnia liczymy, ilu ludzi było na zmianie co 15 min; poziom występujący w ≥ 50 % dni staje się obsadą podstawową, ≥ 25 % — dodatkową. Krótkie przerwy stanowisk krytycznych są uzupełniane i oznaczane do potwierdzenia; zmiany ponad 12 h nie trafiają do szablonów.</p>
          <label className="input-label">Miesiąc z bazy<div className="number-input"><input type="month" value={zrodloM} onChange={(e) => setZrodloM(e.target.value)} /></div></label>
          <button className="secondary-action" disabled={busy} onClick={wyprowadzZBazy} style={{ width: '100%' }}><RefreshCw size={15} /> Wyprowadź z grafiku {zrodloM}</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={(e) => { wyprowadzZPliku(e.target.files && e.target.files[0]); e.target.value = ''; }} />
          <button className="secondary-action" disabled={busy} onClick={() => fileRef.current && fileRef.current.click()} style={{ width: '100%', marginTop: 6 }}><Upload size={15} /> Z pliku XLSX ze stanowiskami</button>
          <div className="control-divider" />
          <div className="panel-title"><div><span>PARAMETRY</span><h2>Reguły obsady</h2></div></div>
          <label className="input-label">Czas przekazania stanowiska (tolerowana przerwa)<div className="number-input"><input type="number" min={0} max={60} value={model.przekazanieMin || 0} onChange={(e) => { setModel((m) => ({ ...m, przekazanieMin: Number(e.target.value) || 0 })); setDirty(true); }} /><span>min</span></div></label>
          <label className="input-label">Udział operacyjny godziny kierownika (w obsadzie produkcyjnej)<div className="number-input"><input type="number" min={0} max={100} value={Math.round((model.mgrOperacyjnyUdzial != null ? model.mgrOperacyjnyUdzial : 0.7) * 100)} onChange={(e) => { setModel((m) => ({ ...m, mgrOperacyjnyUdzial: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 })); setDirty(true); }} /><span>%</span></div></label>
          <div className="control-divider" />
          <div className="panel-title"><div><span>SŁOWNIK</span><h2>Stanowiska</h2></div></div>
          <div className="wm-dict-head"><span>STANOWISKO</span><span title="Przerwa w obsadzie = luka krytyczna">KRYT.</span><span title="Czas administracyjny — nie liczy się jako obsada produkcyjna">ADMIN</span><span title="Zadanie okresowe (np. dostawa), nie stanowisko ciągłe">ZADANIE</span></div>
          <div style={{ display: 'grid', gap: 4 }}>
            {stacje.map((st) => { const d = (model.stanowiska || {})[st] || {}; const sl = slownik.find((x) => x.kod === st); return (
              <div key={st} className="panel wm-dict-row">
                <span><i style={{ width: 8, height: 8, borderRadius: 2, background: stationAccent(st), display: 'inline-block' }} /><b title={st}>{st}</b>{!sl && <em style={{ color: '#886929' }} title="poza słownikiem">?</em>}</span>
                <label title="Przerwa w obsadzie = luka krytyczna"><input type="checkbox" checked={!!d.krytyczne} onChange={(e) => updSt(st, { krytyczne: e.target.checked })} /></label>
                <label title="Czas administracyjny — nie liczy się jako obsada produkcyjna"><input type="checkbox" checked={!!d.admin} onChange={(e) => updSt(st, { admin: e.target.checked })} /></label>
                <label title="Zadanie okresowe (np. dostawa), nie stanowisko ciągłe"><input type="checkbox" checked={!!d.zadanieOkresowe} onChange={(e) => updSt(st, { zadanieOkresowe: e.target.checked })} /></label>
              </div>
            ); })}
          </div>
          {(model.uwagi || []).length > 0 && <div className="dialog-notice" style={{ marginTop: 10, alignItems: 'flex-start' }}><AlertTriangle size={16} /><div style={{ fontSize: 11.5, lineHeight: 1.5 }}><b>Uwagi do propozycji</b><ul style={{ margin: '4px 0 0 14px', padding: 0 }}>{model.uwagi.map((u, i) => <li key={i}>{u.opis}</li>)}</ul></div></div>}
        </aside>

        <div className="forecast-main">
          <article className="panel" style={{ padding: 16 }}>
            <div className="panel-title"><div><span>PODGLĄD DNIA TYGODNIA</span><h2>Obsada podstawowa co 30 min</h2></div>
              <div className="filter-tabs">{KOLEJ.map((d) => <button key={d} className={dow === d ? 'active' : ''} onClick={() => setDow(d)}>{DNI[d]}</button>)}</div>
            </div>
            <p style={{ fontSize: 12, color: '#65717C', margin: '4px 0 8px' }}>{DNI[dow]}: {Math.round(godzDnia)} h obsady podstawowej • {Object.keys(siatka).length} stanowisk. Liczba w komórce = wymagane osoby; przerwa między zmianami tego samego stanowiska jest od razu widoczna.</p>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '150px repeat(48, minmax(13px, 1fr))', gap: 1, fontSize: 10, minWidth: 820 }}>
                <span />{Array.from({ length: 48 }, (_, i) => <span key={i} style={{ textAlign: 'center', color: '#65717C', fontWeight: i % 2 ? 400 : 700 }}>{i % 2 ? '' : String((6 + i / 2) % 24).padStart(2, '0')}</span>)}
                {Object.entries(siatka).sort((a, b) => (a[0] === 'MANAGER' ? -1 : b[0] === 'MANAGER' ? 1 : a[0].localeCompare(b[0]))).map(([st, arr]) => (
                  <React.Fragment key={st}>
                    <span style={{ fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><i style={{ width: 8, height: 8, borderRadius: 2, background: stationAccent(st), flex: 'none' }} />{st}</span>
                    {arr.map((v, i) => { const luka = v === 0 && arr.slice(0, i).some((x) => x > 0) && arr.slice(i).some((x) => x > 0); return <span key={i} title={`${st} ${String((6 + Math.floor(i / 2)) % 24).padStart(2, '0')}:${i % 2 ? '30' : '00'} — ${v} os.`} style={{ height: 18, borderRadius: 2, textAlign: 'center', lineHeight: '18px', fontWeight: 700, background: v ? stationFill(st) : luka ? '#FAE9ED' : '#EDF0F3', color: v ? '#292D32' : luka ? '#A94455' : 'transparent', boxShadow: v ? `inset 0 -2px 0 ${stationAccent(st)}` : 'none', opacity: v ? Math.min(1, 0.7 + v * 0.15) : 1 }}>{v || (luka ? '!' : '')}</span>; })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </article>

          <article className="panel" style={{ padding: 16, marginTop: 12 }}>
            <div className="panel-title"><div><span>BIBLIOTEKA ZMIAN</span><h2>{bib.length} szablonów</h2></div><button className="secondary-action" onClick={() => dodaj()}><Plus size={14} /> Dodaj szablon</button></div>
            {!bib.length && <div className="dialog-empty" style={{ padding: 20 }}>Pusta biblioteka. Wyprowadź propozycję z grafiku (po lewej) albo dodaj szablony ręcznie.</div>}
            {stacje.filter((st) => bib.some((t) => t.station === st)).sort((a, b) => (a === 'MANAGER' ? -1 : b === 'MANAGER' ? 1 : a.localeCompare(b))).map((st) => (
              <div key={st} style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: stationAccent(st) }} /><b style={{ fontSize: 12.5 }}>{st}</b><small style={{ color: '#65717C' }}>{bib.filter((t) => t.station === st).length} szablonów • {Math.round(bib.filter((t) => t.station === st && t.typ === 'podstawowa').reduce((a, t) => a + durH(t.start, t.end) * (t.liczba || 1) * (t.dni && t.dni.length ? t.dni.length : 7), 0))} h/tydz. podstawowej</small><button className="secondary-action" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }} onClick={() => dodaj(st)}><Plus size={12} /> szablon</button></div>
                <div style={{ display: 'grid', gap: 4 }}>
                  {bib.filter((t) => t.station === st).sort((a, b) => mn(a.start) - mn(b.start)).map((t) => (
                    <div key={t.id} className="panel" style={{ padding: '6px 8px', display: 'grid', gridTemplateColumns: '68px 68px 56px 92px 104px 1fr 64px 28px', gap: 6, alignItems: 'center', fontSize: 11, background: t.typ === 'dodatkowa' ? '#FAFBFC' : '#fff' }}>
                      <input type="time" value={t.start} onChange={(e) => upd(t.id, { start: e.target.value })} style={{ fontSize: 11, border: '1px solid #DCE3E9', borderRadius: 8, padding: 4 }} />
                      <input type="time" value={t.end} onChange={(e) => upd(t.id, { end: e.target.value })} style={{ fontSize: 11, border: '1px solid #DCE3E9', borderRadius: 8, padding: 4 }} />
                      <span title="osób równocześnie"><input type="number" min={1} max={6} value={t.liczba || 1} onChange={(e) => upd(t.id, { liczba: Number(e.target.value) || 1, liczbaDow: undefined })} style={{ width: 40, fontSize: 11, border: '1px solid #DCE3E9', borderRadius: 8, padding: 4 }} /> os.</span>
                      <select value={t.typ} onChange={(e) => upd(t.id, { typ: e.target.value })} style={{ fontSize: 11, border: '1px solid #DCE3E9', borderRadius: 8, padding: 4 }}><option value="podstawowa">podstawowa</option><option value="dodatkowa">dodatkowa</option></select>
                      <select value={t.rola || 'srodek'} onChange={(e) => upd(t.id, { rola: e.target.value })} style={{ fontSize: 11, border: '1px solid #DCE3E9', borderRadius: 8, padding: 4 }}>{Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <div style={{ display: 'flex', gap: 2 }}>{KOLEJ.map((dw) => { const on = !t.dni || !t.dni.length || t.dni.includes(dw); return <button key={dw} onClick={() => { const cur = t.dni && t.dni.length ? t.dni : [0, 1, 2, 3, 4, 5, 6]; upd(t.id, { dni: on ? cur.filter((x) => x !== dw) : [...cur, dw].sort() }); }} style={{ flex: 1, fontSize: 10, fontWeight: 800, padding: '3px 0', borderRadius: 6, border: '1px solid #DCE3E9', background: on ? '#E8F0F7' : '#fff', color: on ? '#2674B8' : '#9DA4AA', cursor: 'pointer' }}>{DNI[dw]}{t.liczbaDow && t.liczbaDow[dw] > 1 ? `×${t.liczbaDow[dw]}` : ''}</button>; })}</div>
                      <span title="elastyczność startu przy naprawie luk"><input type="number" min={0} max={240} step={30} value={t.flexMin != null ? t.flexMin : 60} onChange={(e) => upd(t.id, { flexMin: Number(e.target.value) || 0 })} style={{ width: 44, fontSize: 11, border: '1px solid #DCE3E9', borderRadius: 8, padding: 4 }} /> ±min</span>
                      <button onClick={() => usun(t.id)} title="Usuń" style={{ border: 0, background: 'transparent', color: '#A94455', cursor: 'pointer' }}><Trash2 size={14} /></button>
                      {durH(t.start, t.end) > 12 && <span style={{ gridColumn: '1 / -1', color: '#A94455', fontWeight: 700 }}>Szablon dłuższy niż 12 h nie zostanie zapisany.</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </article>
          <div className="model-note" style={{ marginTop: 12 }}><FileSpreadsheet size={16} /><div><strong>Co dalej</strong><span>Po zatwierdzeniu: <button className="underline font-semibold" onClick={() => setPage('kwalifikacje')}>uzupełnij macierz kwalifikacji</button> (kto może stać na którym stanowisku), a następnie <button className="underline font-semibold" onClick={() => setPage('autoplan')}>sprawdź wykonalność i wygeneruj grafik</button>. Audyt grafiku i bramka publikacji sprawdzają ciągłość stanowisk względem tego modelu co 15 min.</span></div></div>
        </div>
      </section>
    </div></div>
  );
};
