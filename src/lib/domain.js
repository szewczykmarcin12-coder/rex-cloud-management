// ── Wspólne definicje dziedzinowe: paleta, stanowiska, czas pracy, miesiące, koszt godzin ──
export const colors = {
  primary: { darkest: '#3F0B1C', dark: '#741334', medium: '#A7465F', light: '#B86D82', bg: '#F1E4E8', bgLight: '#F7F5F5' },
  accent: { dark: '#3F0B1C', medium: '#741334', light: '#A7465F', bg: '#F1E4E8' }
};

export const stationColors = {
  'PANIEROWANIE': '#7CB342', 'SMAŻENIE': '#B94352', 'KANAPKI / WRAPY': '#00A3E0',
  'KONTROLER': '#2F5D8A', 'WSPARCIE WIECZORNE / FLEX': '#9C27B0', 'DISPATCHER': '#FF7043',
  'PHU': '#00897B', 'DESERY / NAPOJE': '#EC407A', 'FRYTKI': '#FBC02D', 'ZMYWAK': '#71656A',
  'PREP': '#8D6E63', 'DOSTAWA': '#5C6BC0', 'MANAGER': '#2B171E', 'MGR FUNKCYJNE': '#5A3542',
  'SZKOLENIA': '#26A69A', 'TRAINING': '#26A69A', 'INSTRUKTOR': '#5A3542'
};
export const stationColor = (s) => stationColors[(s || '').toUpperCase()] || colors.primary.medium;
export const godzZ = (s) => (s.hours != null ? s.hours : 0);
const jestMgr = (st) => ['MANAGER', 'MGR FUNKCYJNE'].includes((st || '').toUpperCase());
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
  if (s.status === 'approved') return { txt: `Zatwierdzona — przejmuje: ${s.approvedVolunteerDisplay || s.approvedVolunteer}`, kol: '#741334', bg: '#F1E4E8' };
  if (s.status === 'rejected') return { txt: 'Odrzucona', kol: '#B94352', bg: '#F5E3E8' };
  if (s.status === 'cancelled') return { txt: 'Anulowana', kol: '#A38D95', bg: '#EDE3E6' };
  return s.volunteers.length ? { txt: `Zgłoszeń: ${s.volunteers.length}`, kol: '#B86D82', bg: '#F5E9ED' } : { txt: 'Otwarta', kol: colors.primary.medium, bg: colors.primary.bgLight };
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
export const funkcjaLabel = (id) => (FUNKCJE.find((f) => f.id === id) || {}).label || id;

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
