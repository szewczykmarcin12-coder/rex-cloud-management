// ═══════════════════════════════════════════════════════════════════════════════
//  Raporty POS (Oracle Simphony / R&A) → dane dla silników prognozy ORDO.
//  • „Sales Day by Day” — dzień po dniu: sprzedaż brutto po rabatach, VAT, netto (bez VAT), paragony, średni rachunek.
//  • „Daily Operations” — agregat okresu: sumy, typy zamówień, kanały, rozkład sprzedaży i paragonów na 15 minut.
//  Podstawa sprzedaży w ORDO = NETTO (Sales Net VAT) — tak jak „Planowana sprzedaż netto” w Prognozie miesiąca
//  i jak liczy się COL. Brutto po rabatach zapisujemy obok (salesGross), żeby nic nie przepadło.
//  Moduł bez Reacta — testowany w Node na kopiach prawdziwych raportów (test/pos-reports.test.mjs).
// ═══════════════════════════════════════════════════════════════════════════════
import * as XLSX from 'xlsx';

const pad2 = (n) => String(n).padStart(2, '0');
const txt = (v) => String(v == null ? '' : v).trim();
const low = (v) => txt(v).toLowerCase();
const num = (v) => { if (v == null || v === '') return null; if (typeof v === 'number') return Number.isFinite(v) ? v : null; const n = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const r2 = (v) => Math.round((v || 0) * 100) / 100;

// data z komórki: Date (cellDates), liczba seryjna Excela albo tekst M/D/YYYY, D.M.YYYY, YYYY-MM-DD
export function toISODate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
  const s = txt(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return `${m[3]}-${pad2(m[1])}-${pad2(m[2])}`;          // US M/D/YYYY (format raportów R&A)
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
  return null;
}
const dowISO = (ds) => { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };   // 0 = Nd
const mondayOf = (ds) => { const [y, m, d] = ds.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d)); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const kolejneDni = (from, to) => { const out = []; const [y, m, d] = from.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d)); while (true) { const k = x.toISOString().slice(0, 10); if (k > to) break; out.push(k); x.setUTCDate(x.getUTCDate() + 1); } return out; };

function arkusz(buffer) {
  const dane = buffer instanceof ArrayBuffer || (buffer && buffer.constructor && buffer.constructor.name === 'ArrayBuffer') ? new Uint8Array(buffer) : buffer;
  const wb = XLSX.read(dane, { type: typeof Buffer !== 'undefined' && Buffer.isBuffer(dane) ? 'buffer' : 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
}
function metaRaportu(rows) {
  const meta = { period: null, from: null, to: null, location: null };
  for (const r of rows.slice(0, 12)) {
    const k = low(r && r[0]);
    if (k === 'business dates') { meta.period = txt(r[1]); const m = meta.period.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/); if (m) { meta.from = toISODate(m[1]); meta.to = toISODate(m[2]); } }
    if (k === 'locations') meta.location = txt(r[1]);
  }
  return meta;
}

// ── 1. Sales Day by Day ──
export function parseSalesDayByDay(buffer) {
  const rows = arkusz(buffer);
  const meta = metaRaportu(rows);
  const days = {}; let tabel = 0; const warnings = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || [];
    const hdr = r.map(low);
    const cDate = hdr.findIndex((h) => h === 'business date' || h.includes('business date'));
    if (cDate < 0) continue;
    tabel++;
    const col = (...wzorce) => hdr.findIndex((h) => wzorce.some((w) => (w instanceof RegExp ? w.test(h) : h.includes(w))));
    const cNet = col(/sales net vat/, /net vat/, /sales net/), cGross = col(/gross sales/), cVat = col(/vat amount/, /^vat$/), cChecks = col(/checks count/, /check count/, /checks$/), cAvg = col(/average check/, /avg check/, /average spend/), cNetSales = col(/^net sales$/);
    for (let j = i + 1; j < rows.length; j++) {
      const q = rows[j]; if (!q) continue;
      if (low(q[cDate]).includes('business date')) break;
      const ds = toISODate(q[cDate]); if (!ds) { if (q.some((c) => c != null && c !== '')) continue; else break; }
      const d = days[ds] || (days[ds] = {});
      if (cNet >= 0 && num(q[cNet]) != null) d.net = num(q[cNet]);
      if (cGross >= 0 && num(q[cGross]) != null) d.gross = num(q[cGross]);
      if (cVat >= 0 && num(q[cVat]) != null) d.vat = num(q[cVat]);
      if (cChecks >= 0 && num(q[cChecks]) != null) d.checks = Math.round(num(q[cChecks]));
      if (cAvg >= 0 && num(q[cAvg]) != null) d.avgCheck = num(q[cAvg]);
      // „Net Sales” w tabeli paragonów to w R&A sprzedaż brutto po rabatach (równa Gross Sales after Discount) — tylko jako zapas
      if (cNetSales >= 0 && d.gross == null && num(q[cNetSales]) != null) d.grossFallback = num(q[cNetSales]);
    }
  }
  const daty = Object.keys(days).sort();
  if (!daty.length) throw new Error('W pliku nie ma tabeli „Business Date” — to nie jest raport Sales Day by Day');
  // brutto z zapasu, netto z brutto − VAT gdy brak kolumny netto
  let netZBrutto = 0;
  daty.forEach((ds) => { const d = days[ds]; if (d.gross == null && d.grossFallback != null) d.gross = d.grossFallback; delete d.grossFallback; if (d.net == null && d.gross != null && d.vat != null) { d.net = d.gross - d.vat; netZBrutto++; } });
  const bezNetto = daty.filter((ds) => days[ds].net == null);
  if (bezNetto.length === daty.length) warnings.push('Raport nie zawiera sprzedaży netto (Sales Net VAT) — zaimportowana zostanie tylko sprzedaż brutto po rabatach; prognoza i COL używają netto.');
  if (netZBrutto) warnings.push(`${netZBrutto} dni: netto wyliczone jako brutto − VAT.`);
  const from = meta.from || daty[0], to = meta.to || daty[daty.length - 1];
  const braki = kolejneDni(from, to).filter((ds) => !days[ds] || days[ds].net == null && days[ds].gross == null);
  if (braki.length) warnings.push(`Brak ${braki.length} dni w zakresie raportu (${braki.slice(0, 5).join(', ')}${braki.length > 5 ? '…' : ''}).`);
  const sales = {}, salesGross = {}, checks = {}, avgCheck = {};
  daty.forEach((ds) => { const d = days[ds]; if (d.net != null) sales[ds] = r2(d.net); if (d.gross != null) salesGross[ds] = r2(d.gross); if (d.checks != null) checks[ds] = d.checks; if (d.avgCheck != null) avgCheck[ds] = r2(d.avgCheck); });
  // podsumowania: suma, tygodnie (pon–nd), dni tygodnia (średnia netto)
  const sum = (o) => Object.values(o).reduce((a, v) => a + v, 0);
  const tygodnie = {};
  daty.forEach((ds) => { const k = mondayOf(ds); const t = tygodnie[k] || (tygodnie[k] = { weekStart: k, net: 0, gross: 0, checks: 0, days: 0 }); t.net += sales[ds] || 0; t.gross += salesGross[ds] || 0; t.checks += checks[ds] || 0; t.days++; });
  const dowAk = Array.from({ length: 7 }, () => ({ net: 0, n: 0, checks: 0 }));
  daty.forEach((ds) => { if (sales[ds] == null) return; const w = dowISO(ds); dowAk[w].net += sales[ds]; dowAk[w].n++; dowAk[w].checks += checks[ds] || 0; });
  const dow = dowAk.map((x) => ({ net: x.n ? r2(x.net / x.n) : null, checks: x.n ? Math.round(x.checks / x.n) : null, n: x.n }));
  return {
    typ: 'sales-day-by-day', location: meta.location, period: meta.period, from, to, n: daty.length, tabel, braki, warnings,
    basis: Object.keys(sales).length ? 'net' : 'gross', sales, salesGross, checks, avgCheck,
    totals: { net: r2(sum(sales)), gross: r2(sum(salesGross)), checks: sum(checks), avgCheck: sum(checks) ? r2(sum(sales) / sum(checks)) : null, /* AGC jak w POS: netto / paragony */ vat: r2(sum(salesGross) - sum(sales)) },
    weeks: Object.values(tygodnie).sort((a, b) => a.weekStart.localeCompare(b.weekStart)).map((t) => ({ ...t, net: r2(t.net), gross: r2(t.gross) })),
    dow,
  };
}

// ── 2. Daily Operations ──
const slot24 = (s) => {   // '2:15 PM' → '14:15', '14:30-14:59' → '14:30'
  let m = txt(s).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m) { let h = Number(m[1]) % 12; if (m[3].toUpperCase() === 'PM') h += 12; return `${pad2(h)}:${m[2]}`; }
  m = txt(s).match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (m) return `${m[1]}:${m[2]}`;
  return null;
};
export function parseDailyOperations(buffer) {
  const rows = arkusz(buffer);
  const meta = metaRaportu(rows);
  const totals = {}; const orderTypes = []; const channels = []; const categories = {};
  const slots15 = {}; const half = {};
  const warnings = [];
  const znajdz = (etykieta) => { const r = rows.find((x) => x && low(x[0]) === etykieta); return r ? num(r[1]) : null; };
  totals.net = znajdz('sales net vat'); totals.checks = znajdz('count'); totals.gross = znajdz('gross sales after discounts'); totals.discounts = znajdz('total discounts'); totals.laborPct = znajdz('labor cost %'); totals.cogsPct = znajdz('cost of goods sold %');
  const rChecks = rows.find((x) => x && low(x[0]) === 'checks' && num(x[1]) != null); if (rChecks) { totals.checks = num(rChecks[1]); totals.avgCheck = num(rChecks[2]); }
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i] || []; const k = low(r[0]);
    if (k === 'order type name' || k === 'order channel name') {
      const cel = k === 'order type name' ? orderTypes : channels;
      for (let j = i + 1; j < rows.length; j++) { const q = rows[j] || []; const n = txt(q[0]); if (!n || n === '0' || num(q[0]) === 0 || low(q[0]) === 'total') { if (!n || num(q[0]) === 0) break; else continue; } cel.push({ name: n, net: r2(num(q[1])), sharePct: r2((num(q[2]) || 0) * 100), checks: Math.round(num(q[3]) || 0), avgCheck: r2(num(q[5])) }); }
    }
    if (k === 'day part name') {
      for (let j = i + 1; j < rows.length; j++) {
        const q = rows[j] || []; const n = txt(q[0]); if (!n) break;
        if (low(n) === 'total') continue;
        const s = slot24(n); if (!s) break;
        const rec = { sales: Math.max(0, num(q[1]) || 0), checks: Math.max(0, Math.round(num(q[3]) || 0)) };
        if (/AM|PM/i.test(n)) slots15[s] = rec; else half[s] = rec;
      }
    }
    if (['food', 'beverage', 'misc.', 'premium sales', 'sgr'].includes(k.replace(/\s+$/, '')) && num(r[1]) != null && r.filter((c) => c != null && c !== '').length <= 3) categories[txt(r[0])] = r2(num(r[1]));
  }
  if (!Object.keys(slots15).length && !Object.keys(half).length) throw new Error('W pliku nie ma tabeli „Day Part Name” z rozkładem na kwadranse — to nie jest raport Daily Operations');
  if (!Object.keys(slots15).length) { Object.entries(half).forEach(([s, v]) => { const [h, m] = s.split(':').map(Number); slots15[s] = { sales: v.sales / 2, checks: v.checks / 2 }; slots15[`${pad2(h)}:${pad2(m + 15)}`] = { sales: v.sales / 2, checks: v.checks / 2 }; }); warnings.push('Brak kwadransów — półgodziny podzielone równo na dwa sloty.'); }
  // profil 96 slotów od 06:00 (doba operacyjna 06 → 06), udziały sprzedaży i paragonów
  const sumS = Object.values(slots15).reduce((a, v) => a + v.sales, 0), sumC = Object.values(slots15).reduce((a, v) => a + v.checks, 0);
  const profile96 = Array.from({ length: 96 }, (_, i) => { const min = (6 * 60 + i * 15) % 1440; const key = `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`; const v = slots15[key] || { sales: 0, checks: 0 }; return { time: key, sales: sumS ? v.sales / sumS : 0, checks: sumC ? v.checks / sumC : 0 }; });
  const pokrycie = profile96.reduce((a, s) => a + s.sales, 0);
  if (pokrycie < 0.98) warnings.push(`Profil pokrywa ${Math.round(pokrycie * 100)}% sprzedaży — część kwadransów nie trafiła do osi 06→06.`);
  const szczyt = profile96.slice().sort((a, b) => b.sales - a.sales).slice(0, 3).map((s) => s.time);
  const godzinowo = {}; profile96.forEach((s) => { const h = s.time.slice(0, 2); godzinowo[h] = r2(((godzinowo[h] || 0) + s.sales) * 1e6) / 1e6; });
  return {
    typ: 'daily-operations', location: meta.location, period: meta.period, from: meta.from, to: meta.to, warnings,
    totals: { ...totals, net: r2(totals.net), gross: r2(totals.gross), avgCheck: r2(totals.avgCheck), laborTracked: !!(totals.laborPct && totals.laborPct > 0) },
    orderTypes, channels, categories, slots15, profile96, hourly: godzinowo, peaks: szczyt,
    intraday: { source: 'daily-operations', from: meta.from, to: meta.to, location: meta.location, slots: slots15, totals: { sales: r2(sumS), checks: Math.round(sumC) } },
  };
}

// Rozpoznanie typu po zawartości (ten sam przycisk importu dla obu raportów)
export function parsePosReport(buffer) {
  const rows = arkusz(buffer);
  const maDaty = rows.some((r) => r && r.some((c) => low(c) === 'business date'));
  const maDayPart = rows.some((r) => r && low(r[0]) === 'day part name');
  if (maDaty) return parseSalesDayByDay(buffer);
  if (maDayPart) return parseDailyOperations(buffer);
  throw new Error('Nie rozpoznano raportu: oczekiwano „Sales Day by Day” (tabela Business Date) albo „Daily Operations” (tabela Day Part Name)');
}
