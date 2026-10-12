import { stationStyle as stationStyleFn } from './stations.js';
// ── Wspólne definicje dziedzinowe: paleta, stanowiska, czas pracy, miesiące, koszt godzin ──
export const colors = {
  // Atmosphere: grafit na treści, błękit na interakcji, jasne powierzchnie
  primary: { darkest: '#292D32', dark: '#3F4A55', medium: '#2674B8', light: '#65717C', bg: '#E8F0F7', bgLight: '#F7F8FA' },
  accent: { dark: '#292D32', medium: '#2674B8', light: '#79A2C0', bg: '#E8F0F7' }
};

// Kolory stanowisk: JEDNO źródło w lib/stations.js (pastelowe rodziny Brand Kitu, tekst grafitowy).
// stationColor() zwraca kolor TEKSTU/akcentu czytelny na bieli (ink rodziny); tła brać z stationFill(), kropki z stationAccent().
export { stationStyle, stationFill, stationAccent, stationInk, stationTone, stationFamily, STATION_FAMILIES, FAMILY_LEGEND } from './stations.js';
export const stationColors = Object.fromEntries(['MANAGER', 'MGR FUNKCYJNE', 'KONTROLER', 'KANAPKI / WRAPY', 'PANIEROWANIE', 'SMAŻENIE', 'FRYTKI', 'ZMYWAK', 'PREP', 'DOSTAWA', 'DISPATCHER', 'PHU', 'DESERY / NAPOJE', 'WSPARCIE WIECZORNE / FLEX', 'SZKOLENIA'].map((k) => [k, stationStyleFn(k).ink]));
const stationInkFn = (s) => stationStyleFn(s).ink;
export const stationColor = (s) => stationInkFn(s);
export const godzZ = (s) => (s.hours != null ? s.hours : 0);
const jestMgr = (st) => ['MANAGER', 'MGR FUNKCYJNE'].includes((st || '').toUpperCase());
export const MGR_FUNKCJE = new Set(['RGM', 'ASM', 'SM', 'JSM']);
// zmiana managerska: po stanowisku albo po funkcji konta (kierownik na stanowisku crew nadal jest managerem na zmianie)
export const jestZmianaMgr = (x, konto) => jestMgr(x && x.station) || !!(konto && MGR_FUNKCJE.has(String(konto.funkcja || '').toUpperCase()));
// Rola szkoleniowa: nowy model (s.rola) albo stary (station 'training'/'instruktor')
const rolaSzk = (s) => {
  const r = (s.rola || '').toLowerCase();
  if (r === 'instruktor' || r === 'training') return r;
  const st = (s.station || '').toLowerCase();
  if (st === 'instruktor' || st === 'training') return st;
  return null;
};
export const jestInstruktor = (s) => rolaSzk(s) === 'instruktor';
const jestUczen = (s) => rolaSzk(s) === 'training';
const jestSzkStacja = (s) => (s.station || '').toUpperCase() === 'SZKOLENIA' && !s.rola;
const jestSzkolenie = (s) => !!rolaSzk(s) || jestSzkStacja(s);
// Pozycja do wyświetlenia (stare dane training/instruktor pokazują "Szkolenie")
export const etykietaStacji = (s) => {
  const st = (s.station || '').toLowerCase();
  if (st === 'training' || st === 'instruktor') return 'Szkolenie';
  return s.station;
};
// Znacznik szkolenia obok pozycji
export const paraOpis = (s) => {
  const r = rolaSzk(s);
  if (!r) return null;
  const kto = s.partner ? `: ${s.partner}` : '';
  return r === 'instruktor' ? `Szkolenie · szkoli${kto}` : `Szkolenie · instr.${kto}`;
};

export const months = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
export const monthsGen = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
export const dniPelne = ['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
// Data lokalna YYYY-MM-DD — NIGDY przez toISOString (UTC cofa dzień w strefach dodatnich!)
export const ymd = (d) => (typeof d === 'string' ? d : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);

// ── Czas pracy (Working Time) — oś od 06:00 ──
const WT_BASE = 360;
const wtToMin = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
const wtClock = (m) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const wtRel = (t) => ((wtToMin(t) - WT_BASE) + 1440) % 1440;
export const wtDur = (a, b) => { let s = wtToMin(a), e = wtToMin(b); if (e <= s) e += 1440; return e - s; };
const wtKeyLegacy = (s) => `${s.name}|${s.date}|${s.station}|${s.start}|${s.end}`;
// DATA-02/COR-03: klucz wykonania po stabilnym sid — edycja godzin/osoby nie osieroca wpisu
export const wtKey = (s) => (s && s.sid ? `sid:${s.sid}` : wtKeyLegacy(s));
export const wtAct = (actuals, s) => (actuals || {})[wtKey(s)] || (actuals || {})[wtKeyLegacy(s)];
export const wtMonday = (ds) => { const d = new Date(ds); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return ymd(d); };
export const wtHours = (min) => (min / 60).toFixed(2).replace('.', ',');
export const WT_TICKS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];

// ── Planowanie godzin (plan miesiąca + ręczne godziny MGR / MGR funkcyjne) ──
export const dniMiesiaca = (ym) => {
  if (!ym) return [];
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= n; d++) out.push(`${ym}-${String(d).padStart(2, '0')}`);
  return out;
};
const sumaDodatkow = (mapaDni) => Object.values(mapaDni || {}).reduce((a, v) => a + (Number(v) || 0), 0);
const sumaManualWszystkie = (planowanie) => Object.values(planowanie || {}).reduce((a, p) => a + sumaDodatkow(p.mgr) + sumaDodatkow(p.mgrFunk), 0);
export const podsumowanieMiesiaca = (shifts, planowanie, ym) => {
  const mShifts = shifts.filter(s => (s.date || '').slice(0, 7) === ym);
  const crew = mShifts.filter(s => !jestMgr(s.station) && !jestSzkolenie(s)).reduce((a, s) => a + godzZ(s), 0);
  const szkol = mShifts.filter(s => jestUczen(s) || jestSzkStacja(s)).reduce((a, s) => a + godzZ(s), 0);
  const mgrSched = mShifts.filter(s => (s.station || '').toUpperCase() === 'MANAGER').reduce((a, s) => a + godzZ(s), 0);
  const funkSched = mShifts.filter(s => (s.station || '').toUpperCase() === 'MGR FUNKCYJNE').reduce((a, s) => a + godzZ(s), 0);
  const p = (planowanie || {})[ym] || {};
  const mgrManual = sumaDodatkow(p.mgr);
  const funkManual = sumaDodatkow(p.mgrFunk);
  const mgr = mgrSched + mgrManual;
  const funk = funkSched + funkManual;
  const total = crew + szkol + mgr + funk;
  const planTotal = Number(p.planTotal) || 0;
  return { crew, szkol, mgrSched, mgrManual, funkSched, funkManual, mgr, funk, total, planTotal, mShifts };
};

// ── Giełda zamian (wyświetlanie) ──
const dfmt = (ds) => { const d = new Date(ds); const dni = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb']; return `${dni[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };
export const opisZmiany = (s) => `${dfmt(s.date)} · ${s.station} · ${s.start}–${s.end} (${s.hours}h)`;
export const statusZamiany = (s) => {
  if (s.status === 'approved') return { txt: `Zatwierdzona — przejmuje: ${s.approvedVolunteerDisplay || s.approvedVolunteer}`, kol: '#2674B8', bg: '#E8F0F7' };
  if (s.status === 'rejected') return { txt: 'Odrzucona', kol: '#A94455', bg: '#FAE9ED' };
  if (s.status === 'cancelled') return { txt: 'Anulowana', kol: '#65717C', bg: '#E4E8EC' };
  return s.volunteers.length ? { txt: `Zgłoszeń: ${s.volunteers.length}`, kol: '#79A2C0', bg: '#E8F0F7' } : { txt: 'Otwarta', kol: colors.primary.medium, bg: colors.primary.bgLight };
};
export const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];

// Szacunkowy koszt godzin wg konta (UZ: stawka/h; UOP: wynagrodzenie mies. / 160 h)
export const kosztGodzin = (konto, h) => !konto ? 0 : (konto.umowa === 'UOP' ? (konto.stawka / 160) * h : konto.stawka * h);

// ── Funkcje (stanowiska w strukturze) ──
export const FUNKCJE = [
  { id: 'CREW', label: 'Pracownik restauracji' },
  { id: 'REST', label: 'Konto restauracji (login + PIN, bez umowy)' },
  { id: 'JSM', label: 'Młodszy kierownik zmiany' },
  { id: 'SM', label: 'Kierownik zmiany' },
  { id: 'ASM', label: 'Zastępca kierownika' },
  { id: 'RGM', label: 'Kierownik restauracji' },
];
export const funkcjaLabel = (id) => (FUNKCJE.find((f) => f.id === id) || {}).label || (!id || /^unknown$/i.test(String(id)) ? 'brak danych o funkcji' : id);
// typ umowy do wyświetlenia — wartości techniczne (UNKNOWN, puste) pokazujemy jako czytelny brak danych
export const umowaLabel = (u) => { const k = String(u || '').toUpperCase(); return k === 'UOP' ? 'UoP' : k === 'UZ' ? 'zlecenie' : k === 'B2B' ? 'B2B' : !k || k === 'UNKNOWN' ? 'brak danych o umowie' : u; };

// Wspólne scalanie par praca+instruktor (doba operacyjna 06→06)
const PLN_H0_DOBA = 6;   // doba operacyjna 06 → 06
const plnMin = (t) => { const [h, m] = String(t).split(':').map(Number); let x = h * 60 + (m || 0); if (x < PLN_H0_DOBA * 60) x += 1440; return x; };
export const scalParyPlan = (arr) => {
  const zwykle = [], instr = [];
  arr.forEach((x) => (jestInstruktor(x) ? instr : zwykle).push(x));
  const out = zwykle.map((x) => ({ ...x }));
  instr.forEach((i) => {
    // FIX: wiersz instruktorski łączy się wyłącznie ze zmianą TEJ SAMEJ osoby
    // (wcześniej: tylko data+nakładanie godzin — przy dwóch szkoleniach dnia pary się mieszały)
    const taOsoba = (x) => (i.accountId && x.accountId) ? x.accountId === i.accountId : String(x.name).toUpperCase().trim() === String(i.name).toUpperCase().trim();
    const para = out.find((x) => taOsoba(x) && x.date === i.date && plnMin(x.start) < plnMin(i.end) + (plnMin(i.end) <= plnMin(i.start) ? 1440 : 0) && plnMin(i.start) < plnMin(x.end) + (plnMin(x.end) <= plnMin(x.start) ? 1440 : 0));
    if (para) { para.szkoli = true; para.partnerSzk = i.partner || i.uczen || null; para.paraInstr = { date: i.date, name: i.name, start: i.start, end: i.end }; }
    else out.push({ ...i, szkoli: true });
  });
  return out;
};

// ── Okno dyspozycji (identyczna logika jak backend lib/availability.js ocenOknoDyspozycji): doba 06→06, przedziały przez północ ──
const opMinD = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); let x = (h || 0) * 60 + (m || 0) - 360; if (x < 0) x += 1440; return x; };
export function ocenOknoDyspozycji(rq, start, end) {
  if (!rq) return null;
  if (rq.type === 'unavailable') return { kod: 'niedostepny' };
  if (rq.type === 'available') return null;
  const s = opMinD(start); let e = opMinD(end); if (e <= s) e += 1440;
  if (rq.type === 'from_time') return s < opMinD(rq.startTime) ? { kod: 'od' } : null;
  if (rq.type === 'until_time') { let we = opMinD(rq.endTime); if (we === 0) we = 1440; return e > we ? { kod: 'do' } : null; }
  if (rq.type === 'specific_shift') { const ws = opMinD(rq.startTime); let we = opMinD(rq.endTime); if (we <= ws) we += 1440; return (s < ws || e > we) ? { kod: 'okno' } : null; }
  return null;
}
