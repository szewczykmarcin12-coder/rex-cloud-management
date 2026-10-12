import React, { useEffect, useMemo, useState } from 'react';
import { Check, GraduationCap, History, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { MHead, MMetric } from '../ui/primitives.jsx';
import { stationAccent, MGR_FUNKCJE } from '../lib/domain.js';

// ── Zespół → Kwalifikacje: macierz stanowisko × osoba, oddzielona od historii pracy ──
// Poziomy: 0 brak • 1 w szkoleniu (tylko pod nadzorem samodzielnego) • 2 samodzielny • 3 trener.
// Wpisy „z historii” to propozycje (szare, przerywane) — nie są uprawnieniem, dopóki manager ich nie zatwierdzi.
const POZ = { 0: { s: '—', t: 'brak', bg: '#EDF0F3', c: '#9DA4AA' }, 1: { s: '1', t: 'w szkoleniu', bg: '#FBF1DC', c: '#886929' }, 2: { s: '2', t: 'samodzielny', bg: '#E8F0F7', c: '#2674B8' }, 3: { s: '3', t: 'trener', bg: '#E8F3EE', c: '#407362' } };
const KOLEJNOSC = ['MANAGER', 'MGR FUNKCYJNE', 'KONTROLER', 'KANAPKI / WRAPY', 'PANIEROWANIE', 'SMAŻENIE', 'FRYTKI', 'PREP', 'ZMYWAK', 'DOSTAWA', 'DISPATCHER', 'WSPARCIE WIECZORNE / FLEX', 'PHU', 'DESERY / NAPOJE'];

export const QualificationsView = ({ data, setPage }) => {
  const [matrix, setMatrix] = useState({});
  const [stan, setStan] = useState(null);
  const [slownik, setSlownik] = useState([]);
  const [modelSt, setModelSt] = useState([]);
  const [busy, setBusy] = useState(false);
  const [filtr, setFiltr] = useState('');
  const [tylkoCrew, setTylkoCrew] = useState(false);
  const zaladuj = () => {
    api('/qualifications').then((r) => { if (r && r.success && r.stan) { setMatrix(r.matrix || {}); setStan(r.stan); setSlownik(r.slownik || []); } }).catch(() => {});
    api('/work-model').then((r) => { if (r && r.success && r.model) setModelSt([...new Set((r.model.biblioteka || []).map((t) => t.station))]); }).catch(() => {});
  };
  useEffect(() => { zaladuj(); }, []);
  const konta = (data.accounts || []).filter((a) => a.aktywny !== false && (!tylkoCrew || !MGR_FUNKCJE.has(String(a.funkcja || '').toUpperCase())) && (!filtr || a.name.toLowerCase().includes(filtr.toLowerCase()))).sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const stacje = useMemo(() => { const s = new Set([...modelSt, ...slownik]); return [...s].sort((a, b) => (KOLEJNOSC.indexOf(a) + 1 || 99) - (KOLEJNOSC.indexOf(b) + 1 || 99) || a.localeCompare(b)); }, [modelSt, slownik]);
  const wpis = (a, st) => { const w = (matrix[a.id] || {})[st]; if (w) return w; if (Array.isArray(a.stanowiska) && a.stanowiska.length) return { poziom: a.stanowiska.map((x) => x.toUpperCase()).includes(st) ? 2 : 0, zatwierdzone: true, zrodlo: 'konto' }; return null; };
  const ustaw = async (a, st, poziom) => {
    setMatrix((m) => ({ ...m, [a.id]: { ...(m[a.id] || {}), [st]: { poziom, zatwierdzone: true, zrodlo: 'manager' } } }));
    const r = await api('/qualifications', 'PUT', { accountId: a.id, station: st, poziom });
    if (!(r && r.success)) data.show((r && r.error) || 'Błąd zapisu', 'error'); else { setMatrix(r.matrix); api('/qualifications').then((x) => x && x.success && setStan(x.stan)).catch(() => {}); }
  };
  const cykl = (a, st) => { const w = wpis(a, st); const cur = w && w.zatwierdzone ? Number(w.poziom) || 0 : (w ? Number(w.poziom) || 0 : 0); ustaw(a, st, w && !w.zatwierdzone ? cur : (cur + 1) % 4); };
  const zaproponuj = async () => { setBusy(true); const r = await api('/qualifications?action=propose', 'POST', {}); setBusy(false); if (r && r.success) { setMatrix(r.matrix); data.show(`Dodano ${r.dodane} propozycji z historii (≥ 3 zmiany na stanowisku w 6 mies.). Zatwierdź je kliknięciem albo zbiorczo.`); zaladuj(); } else data.show((r && r.error) || 'Błąd', 'error'); };
  const zatwierdzWszystkie = async () => { if (!confirm('Zatwierdzić wszystkie propozycje z historii jako poziom „samodzielny”? Częstotliwość pracy nie potwierdza umiejętności — sprawdź wątpliwe osoby ręcznie.')) return; setBusy(true); const r = await api('/qualifications?action=approve-proposals', 'POST', {}); setBusy(false); if (r && r.success) { setMatrix(r.matrix); data.show(`Zatwierdzono ${r.zatwierdzone} wpisów.`); zaladuj(); } };
  const propozycji = Object.values(matrix).reduce((n, m) => n + Object.values(m).filter((w) => !w.zatwierdzone).length, 0);
  const bezDanych = (data.accounts || []).filter((a) => a.aktywny !== false && !(Array.isArray(a.stanowiska) && a.stanowiska.length) && !Object.values(matrix[a.id] || {}).some((w) => w.zatwierdzone));
  return (
    <div className="flex-1 min-h-0 overflow-y-auto"><div className="page-wrap module-view forecast-view" style={{ width: '100%' }}>
      <MHead kicker="ZESPÓŁ • KWALIFIKACJE" title="Macierz kwalifikacji" copy="Kto może samodzielnie stać na którym stanowisku. Autoplan bierze kandydatów wyłącznie stąd; częstotliwość pracy w historii jest tylko podpowiedzią do zatwierdzenia. Osoba bez wpisu na stanowisku nie jest „trochę kwalifikowana” — jest widocznym brakiem danych.">
        <button className="secondary-action" disabled={busy} onClick={zaproponuj}><History size={16} /> Zaproponuj z historii</button>
        <button className="primary-action" disabled={busy || !propozycji} onClick={zatwierdzWszystkie}><Check size={16} /> Zatwierdź propozycje ({propozycji})</button>
      </MHead>
      <section className="forecast-kpis">
        <MMetric icon={Users} label="Osoby z macierzą" value={stan ? `${stan.zDanymi} / ${stan.osob}` : '—'} helper={stan ? (stan.tryb === 'macierz' ? 'komplet — autoplan w trybie macierzy' : stan.tryb === 'macierz-czesciowa' ? `${stan.bezDanych.length} osób bez danych (dla nich tylko historia)` : 'brak macierzy — autoplan planuje „z historii” i oznacza to w statusie') : '—'} tone={stan && stan.tryb === 'macierz' ? 'mint' : 'coral'} />
        <MMetric icon={GraduationCap} label="Propozycje do zatwierdzenia" value={propozycji} helper="z historii zmian (≥ 3 zmiany)" tone={propozycji ? 'violet' : 'mint'} />
        <MMetric icon={GraduationCap} label="Stanowiska bez puli" value={stan ? stan.stanowiskaBezPuli.filter((s) => stacje.includes(s)).length : '—'} helper={stan && stan.stanowiskaBezPuli.length ? stan.stanowiskaBezPuli.filter((s) => stacje.includes(s)).slice(0, 4).join(', ') : 'każde stanowisko ma samodzielnych'} tone={stan && stan.stanowiskaBezPuli.filter((s) => stacje.includes(s)).length ? 'coral' : 'mint'} />
        <MMetric icon={Users} label="Stanowiska w modelu" value={modelSt.length || '—'} helper={modelSt.length ? 'kolumny z modelu pracy + słownik' : 'brak modelu pracy — tylko słownik'} tone="blue" />
      </section>
      <article className="panel" style={{ padding: 14, marginTop: 12 }}>
        <div className="panel-title"><div><span>MACIERZ</span><h2>Kliknij komórkę: brak → w szkoleniu → samodzielny → trener</h2></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input placeholder="Szukaj osoby…" value={filtr} onChange={(e) => setFiltr(e.target.value)} style={{ fontSize: 12, border: '1px solid #DCE3E9', borderRadius: 8, padding: '6px 10px' }} /><label style={{ fontSize: 12, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={tylkoCrew} onChange={(e) => setTylkoCrew(e.target.checked)} />tylko CREW</label></div>
        </div>
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#65717C', margin: '4px 0 8px', flexWrap: 'wrap' }}>{Object.entries(POZ).map(([k, v]) => <span key={k} style={{ display: 'flex', gap: 4, alignItems: 'center' }}><i style={{ width: 16, height: 16, borderRadius: 4, background: v.bg, color: v.c, fontWeight: 800, fontSize: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{v.s}</i>{v.t}</span>)}<span style={{ display: 'flex', gap: 4, alignItems: 'center' }}><i style={{ width: 16, height: 16, borderRadius: 4, border: '1px dashed #9DA4AA', display: 'inline-block' }} />propozycja z historii (kliknij = zatwierdź)</span></div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `200px repeat(${stacje.length}, minmax(64px, 1fr))`, gap: 2, minWidth: 200 + stacje.length * 66, fontSize: 11 }}>
            <span />{stacje.map((st) => { const p = stan && stan.pula[st]; return <span key={st} title={st} style={{ textAlign: 'center', fontWeight: 700, lineHeight: 1.2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, paddingBottom: 4 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: stationAccent(st) }} /><small style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>{st.replace(' / ', '/')}</small>{p && <small style={{ color: p.samodzielni ? '#65717C' : '#A94455', fontWeight: 600 }}>{p.samodzielni} sam.</small>}</span>; })}
            {konta.map((a) => (
              <React.Fragment key={a.id}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}<small style={{ color: '#65717C', fontWeight: 500 }}>{a.funkcja}</small>{bezDanych.includes(a) && <small style={{ color: '#A94455', fontWeight: 700 }} title="brak zatwierdzonych kwalifikacji">brak danych</small>}</span>
                {stacje.map((st) => { const w = wpis(a, st); const poz = w ? Number(w.poziom) || 0 : 0; const prop = w && !w.zatwierdzone; const v = POZ[poz]; return (
                  <button key={st} onClick={() => cykl(a, st)} title={`${a.name} • ${st}: ${w ? v.t : 'brak danych'}${w && w.zrodlo ? ` (${w.zrodlo}${w.zmian ? `, ${w.zmian} zmian` : ''})` : ''}${prop ? ' — kliknij, aby zatwierdzić' : ''}`} style={{ height: 26, borderRadius: 6, border: prop ? '1px dashed #9DA4AA' : '1px solid transparent', background: w ? (prop ? '#fff' : v.bg) : '#FAFBFC', color: prop ? '#65717C' : v.c, fontWeight: 800, cursor: 'pointer', fontSize: 11 }}>{w ? (prop ? `${v.s}?` : v.s) : '·'}</button>
                ); })}
              </React.Fragment>
            ))}
          </div>
        </div>
        {!konta.length && <div className="dialog-empty" style={{ padding: 20 }}>Brak kont pracowników do wyświetlenia.</div>}
      </article>
      <div className="model-note" style={{ marginTop: 12 }}><GraduationCap size={16} /><div><strong>Jak to działa w autoplanie</strong><span>Kandydat na stanowisko = zatwierdzony poziom ≥ 2 (poziom 1 tylko gdy na tym stanowisku równolegle pracuje ktoś samodzielny). Osoba z macierzą, ale bez wpisu na stanowisku, nie jest kandydatem. Osoba bez żadnych danych w macierzy jest planowana z historii i oznaczana „kwalifikacja niepotwierdzona” — widać to w statusie propozycji. Cele godzin (minimum / cel / maksimum) ustawisz w <button className="underline font-semibold" onClick={() => setPage('pracownicy')}>Pracownikach</button>.</span></div></div>
    </div></div>
  );
};
