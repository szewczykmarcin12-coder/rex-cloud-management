import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { colors } from '../lib/domain.js';
import { MHead } from '../ui/primitives.jsx';
import { ShieldCheck, Zap } from 'lucide-react';
// ── Analizy i raporty → Trafność prognozy ──
export const ForecastQuality = ({ data }) => {
  const [dane, setDane] = useState(null);
  const [edytuj, setEdytuj] = useState(null);   // { date, value, reason }
  const [blad, setBlad] = useState(null);       // błąd pobrania prognozy — widoczny, z ponowieniem
  const zaladuj = () => { setBlad(null); api('/forecast?days=14').then((r) => { if (r && r.success) setDane(r); else setBlad((r && r.error) || 'Serwer nie zwrócił prognozy'); }).catch((e) => setBlad(e && e.message ? e.message : 'Brak połączenia z API')); };
  useEffect(zaladuj, []);
  const zapisz = async () => {
    if (!edytuj) return;
    const r = await api('/forecast?action=override', 'POST', edytuj);
    if (r.success) { setEdytuj(null); zaladuj(); data.show(edytuj.value == null || edytuj.value === '' ? 'Korekta usunięta' : `Korekta ${edytuj.date} zapisana`); }
    else data.show(r.error || 'Błąd korekty', 'error');
  };
  const bt = dane && dane.backtest;
  const DK = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border mb-3" style={{ borderColor: colors.primary.bg }}>
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <span className="text-sm font-bold" style={{ color: colors.primary.darkest }}>Jakość prognozy (baseline sezonowy)</span>
        {bt && bt.dni > 0 ? (<>
          <span className="text-xs" style={{ color: colors.primary.medium }}>MAPE <b style={{ color: bt.mape > 15 ? '#B94352' : '#741334' }}>{String(bt.mape).replace('.', ',')}%</b></span>
          <span className="text-xs" style={{ color: colors.primary.medium }}>WAPE <b style={{ color: bt.wape > 12 ? '#B94352' : '#741334' }}>{String(bt.wape).replace('.', ',')}%</b></span>
          <span className="text-xs text-slate-400">backtest: {bt.dni} zakończonych dni · prognoza liczona tylko z danych sprzed dnia</span>
          {dane.modele && <span className="text-xs" style={{ color: colors.primary.dark }} title="Silnik liczy oba modele na ostatnich 28 zamkniętych dniach i używa tego z niższym MAPE. Hybryda: poziom z ostatnich 7 dni × udział dnia tygodnia (szybko łapie zmianę sezonu). Mediana: mediana 8 tygodni tego samego dnia tygodnia × trend (odporna na pojedyncze promocje).">model: <b>{dane.modele.wybrany === 'hybryda' ? 'hybryda (poziom 7 dni × udział dnia)' : 'mediana dnia tygodnia × trend'}</b> · hybryda {dane.modele.hybryda.mape != null ? `${String(dane.modele.hybryda.mape).replace('.', ',')}%` : '—'} vs mediana {dane.modele.mediana.mape != null ? `${String(dane.modele.mediana.mape).replace('.', ',')}%` : '—'}</span>}
        </>) : blad ? <span className="text-xs" style={{ color: '#B94352' }}>nie udało się pobrać prognozy: {blad} <button type="button" className="underline font-semibold" onClick={zaladuj}>ponów</button></span> : <span className="text-xs" style={{ color: '#A7465F' }}>za mało historii sprzedaży do pomiaru błędu — importuj dane dzienne</span>}
      </div>
      {dane && dane.dane && (
        <p className="text-xs mb-2" style={{ color: dane.dane.przeterminowane ? '#B94352' : '#6e5a62' }}>
          {dane.dane.ostatniDzien ? `Historia POS do ${dane.dane.ostatniDzien} (${dane.dane.dniOdOstatniego} dni temu) • rytm: import we wtorek z ostatnich 8 tygodni • następny: ${dane.dane.nastepnyImport}` : 'Brak historii POS — prognoza dzienna nie ma na czym się oprzeć.'}{dane.dane.przeterminowane ? ' • ZALEGŁY — prognoza opiera się na starym poziomie sprzedaży.' : ''}
        </p>
      )}
      {dane && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {dane.days.map((d) => (
            <button key={d.date} onClick={() => setEdytuj({ date: d.date, value: d.override ? d.override.value : (d.baseline ?? ''), reason: d.override ? d.override.reason : '' })}
              className="shrink-0 w-[92px] rounded-lg border px-2 py-1.5 text-left hover:shadow-sm"
              style={{ borderColor: d.override ? '#A7465F' : colors.primary.bg, backgroundColor: d.override ? '#F1E4E8' : 'white' }}>
              <p className="text-[10px] font-bold" style={{ color: colors.primary.light }}>{DK[d.dow]} {d.date.slice(8)}.{d.date.slice(5, 7)}</p>
              <p className="text-[13px] font-bold" style={{ color: colors.primary.darkest }}>{d.forecast != null ? d.forecast.toLocaleString('pl-PL') : '—'}</p>
              <p className="text-[9.5px] truncate" style={{ color: d.override ? '#A7465F' : colors.primary.light }}>{d.override ? `korekta: ${d.override.reason}` : (d.baseline != null ? 'baseline' : 'brak historii')}</p>
            </button>
          ))}
        </div>
      )}
      {edytuj && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg p-3" style={{ backgroundColor: colors.primary.bgLight }}>
          <span className="text-sm font-semibold" style={{ color: colors.primary.darkest }}>Korekta {edytuj.date}:</span>
          <div><label className="block text-[10px]" style={{ color: colors.primary.light }}>Prognoza (zł)</label><input type="number" value={edytuj.value} onChange={(e) => setEdytuj((x) => ({ ...x, value: e.target.value }))} className="w-28 px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
          <div className="flex-1 min-w-[180px]"><label className="block text-[10px]" style={{ color: colors.primary.light }}>Uzasadnienie (wymagane)</label><input value={edytuj.reason} onChange={(e) => setEdytuj((x) => ({ ...x, reason: e.target.value }))} placeholder="np. promocja, mecz, święto" className="w-full px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
          <button onClick={zapisz} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: colors.primary.medium }}>Zapisz</button>
          <button onClick={() => { setEdytuj((x) => ({ ...x, value: '' })); }} className="px-3 py-1.5 rounded-lg text-sm" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>Usuń korektę</button>
          <button onClick={() => setEdytuj(null)} className="px-3 py-1.5 rounded-lg text-sm" style={{ backgroundColor: 'white', color: colors.primary.dark }}>Anuluj</button>
        </div>
      )}
    </div>
  );
};


// Samodzielny moduł „Trafność prognozy” (Analizy i raporty) — ten sam panel co w Modelu popytu, z własnym nagłówkiem
export const ForecastQualityPage = ({ data, setPage }) => (
  <div className="flex-1 overflow-y-auto"><div className="page-wrap module-view analytics-view" style={{ width: '100%' }}>
    <MHead kicker="ANALIZY I RAPORTY" title="Trafność prognozy" copy="Prognoza bazowa (sezonowa) kontra wykonanie: błąd MAPE/WAPE z backtestu, dni poza tolerancją i ręczne korekty najbliższych 14 dni.">
      <button className="secondary-action" onClick={() => setPage('model-popytu')}><Zap size={16} /> Model popytu</button>
      <button className="secondary-action" onClick={() => setPage('prognoza-miesiaca')}><ShieldCheck size={16} /> Prognoza miesiąca</button>
    </MHead>
    <ForecastQuality data={data} />
    <p className="text-xs" style={{ color: '#8C8A83', marginTop: 8 }}>Prognoza dzienna liczona jest wyłącznie z danych sprzed danego dnia. Plan miesięczny (AOP) i budżet mają osobne wersje — ten moduł mierzy trafność prognozy bazowej, nie zatwierdzonego planu.</p>
  </div></div>
);
