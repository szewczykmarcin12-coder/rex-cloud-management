import { jsPDF } from 'jspdf';
import { LIB_SANS_REGULAR, LIB_SANS_BOLD } from './fonts.js';

// ── Nazwy / kolejność ────────────────────────────────────────────────
const dniPl = ['Niedziela','Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota'];
const mcPl  = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];

const KOLEJNOSC = ['PANIEROWANIE','SMAŻENIE','KANAPKI / WRAPY','KONTROLER','WSPARCIE WIECZORNE / FLEX',
  'DISPATCHER','PHU','DESERY / NAPOJE','FRYTKI','ZMYWAK','PREP','DOSTAWA','SZKOLENIA','TRAINING','INSTRUKTOR','MANAGER','MGR FUNKCYJNE'];
const rank = (s) => { const i = KOLEJNOSC.indexOf((s||'').toUpperCase()); return i === -1 ? 99 : i; };

const KOLORY = {
  'PANIEROWANIE':[124,179,66],'SMAŻENIE':[231,76,60],'KANAPKI / WRAPY':[0,163,224],
  'KONTROLER':[30,58,138],'WSPARCIE WIECZORNE / FLEX':[156,39,176],'DISPATCHER':[255,112,67],
  'PHU':[0,137,123],'DESERY / NAPOJE':[236,64,122],'FRYTKI':[245,176,0],'ZMYWAK':[100,116,139],
  'PREP':[141,110,99],'DOSTAWA':[92,107,192],'SZKOLENIA':[38,166,154],'TRAINING':[38,166,154],'INSTRUKTOR':[0,121,107],'MANAGER':[16,24,21],'MGR FUNKCYJNE':[69,90,100]
};
const kolor = (s) => KOLORY[(s||'').toUpperCase()] || [89,128,124];

const NAVY = [16,24,21], NAVY2 = [38,52,48], STAL = [89,128,124], LIGHT = [234,239,237];   // onyks + butelkowa zieleń
const PEACH = [89,128,124], INK = [24,30,28], GREY = [118,130,126];   // akcent = szałwia (brzoskwinia usunięta)

const UWAGI = [
  'Wbicia i wybicia kartą o planowanych godzinach rozpoczęcia i zakończenia.',
  'Zakaz korzystania z kodów QR innych osób.',
  'Min. % wbić kartą miesięcznie = 95%.',
  'Reakcja na wskazania kalkulatora MPT.',
  'Wszelkie zamiany po akceptacji ASM lub RGM.',
  'Dokładne wbijanie godzin do RMS.'
];

const godzZmiany = (s) => {
  if (s.hours != null && !isNaN(s.hours)) return s.hours;
  if (!s.start || !s.end) return 0;
  const [sh,sm] = s.start.split(':').map(Number), [eh,em] = s.end.split(':').map(Number);
  let h = eh - sh + (em - sm) / 60; if (h < 0) h += 24; return Math.round(h*100)/100;
};

// Rola szkoleniowa: nowy model (s.rola) albo stary (station 'training'/'instruktor')
const rolaSzk = (s) => {
  const r = (s.rola || '').toLowerCase();
  if (r === 'instruktor' || r === 'training') return r;
  const st = (s.station || '').toLowerCase();
  if (st === 'instruktor' || st === 'training') return st;
  return null;
};
const jestInstr = (s) => rolaSzk(s) === 'instruktor';
const jestUczen = (s) => rolaSzk(s) === 'training';
const jestSzkStacja = (s) => (s.station || '').toUpperCase() === 'SZKOLENIA' && !s.rola;
const jestSzkolenie = (s) => !!rolaSzk(s) || jestSzkStacja(s);
const jestMgrPdf = (st) => ['MANAGER', 'MGR FUNKCYJNE'].includes((st || '').toUpperCase());

function fonty(doc) {
  doc.addFileToVFS('LibSans.ttf', LIB_SANS_REGULAR);
  doc.addFont('LibSans.ttf', 'Lib', 'normal');
  doc.addFileToVFS('LibSansB.ttf', LIB_SANS_BOLD);
  doc.addFont('LibSansB.ttf', 'Lib', 'bold');
  doc.setFont('Lib', 'normal');
}


// ── Szkolenia: scalanie pary praca+instruktor do jednego wiersza ──
const norm = (n) => String(n || '').trim().toUpperCase().replace(/\s+/g, ' ');
const pdfMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const pdfNachodza = (a, b) => {
  let a1 = pdfMin(a.start), a2 = pdfMin(a.end); if (a2 <= a1) a2 += 1440;
  let b1 = pdfMin(b.start), b2 = pdfMin(b.end); if (b2 <= b1) b2 += 1440;
  return a1 < b2 && b1 < a2;
};
// Wiersz instruktorski nachodzący na zwykłą zmianę tej samej osoby = duplikat:
// zwykła zmiana dostaje flagę szkoli (czapeczka), duplikat znika z wydruku.
function scalPary(dzienne) {
  const zwykle = [], instr = [];
  dzienne.forEach((s) => (jestInstr(s) ? instr : zwykle).push(s));
  const out = zwykle.map((s) => ({ ...s }));
  instr.forEach((i) => {
    const para = out.find((s) => norm(s.name) === norm(i.name) && pdfNachodza(s, i));
    if (para) { para.szkoli = true; para.partnerSzk = i.partner || null; }
    else out.push({ ...i, szkoli: true });          // instruktor bez zwykłej zmiany — zostaje raz
  });
  return out;
}
// Czapeczka akademicka rysowana wektorowo (czcionka PDF nie ma emoji)
function rysujCzapke(doc, x, y, kol = [0, 121, 107]) {
  const w = 3.0, h = 1.15;                          // romb (denko czapki)
  doc.setFillColor(...kol);
  doc.triangle(x, y, x + w / 2, y - h, x + w, y, 'F');
  doc.triangle(x, y, x + w / 2, y + h, x + w, y, 'F');
  doc.setDrawColor(...kol); doc.setLineWidth(0.35);
  doc.line(x + w * 0.78, y + h * 0.35, x + w * 0.78, y + h + 0.75);   // frędzel
  doc.setFillColor(...kol);
  doc.circle(x + w * 0.78, y + h + 0.95, 0.28, 'F');
}

// ── Render jednego dnia ──────────────────────────────────────────────
function renderDzien(doc, shifts, dateStr, location, dodatkiMgr = 0) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 8;
  const d = new Date(dateStr);

  const surowe = shifts.filter(s => s.date === dateStr);
  const sumaGodz = surowe.filter(s=>!jestInstr(s)).reduce((a,s)=>a+godzZmiany(s),0) + dodatkiMgr;
  const dzienne = scalPary(surowe);

  // ── NAGŁÓWEK ──
  doc.setFillColor(...NAVY); doc.rect(0,0,W,21,'F');
  doc.setFillColor(...PEACH); doc.rect(0,21,W,1.2,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('Lib','bold'); doc.setFontSize(17);
  doc.text('GRAFIK DZIENNY', M, 9.5);
  doc.setFont('Lib','normal'); doc.setFontSize(10.5);
  doc.text(`${dniPl[d.getDay()]}, ${d.getDate()} ${mcPl[d.getMonth()]} ${d.getFullYear()}`, M, 16.5);
  // prawa strona nagłówka
  doc.setFont('Lib','bold'); doc.setFontSize(9.5);
  doc.text(location, W - M, 8.5, { align:'right' });
  doc.setFont('Lib','normal'); doc.setFontSize(9);
  doc.setTextColor(...PEACH);
  doc.text(`Zmian: ${surowe.length}      Roboczogodzin: ${sumaGodz.toFixed(1)} h`, W - M, 15.5, { align:'right' });

  // ── UKŁAD ──
  const bodyTop = 27, bodyBot = H - 8;
  const sideW = 88, gap = 5;
  const leftW = W - 2*M - sideW - gap;
  const colGap = 5, colW = (leftW - colGap) / 2;
  const leftX = M, sideX = M + leftW + gap;
  const colX = [leftX, leftX + colW + colGap];

  // grupuj wg stanowiska (tylko te obecne danego dnia)
  const grupy = {};
  dzienne.forEach(s => { const st = s.station || 'INNE'; (grupy[st] = grupy[st] || []).push(s); });
  const stanowiska = Object.keys(grupy).sort((a,b)=>rank(a)-rank(b));

  const headH = 6.4, rowH = 5.15, pad = 1.4, blkGap = 3.2;
  let ci = 0, y = bodyTop;

  const rysujBlok = (x, yy, st, ludzie) => {
    const kol = kolor(st);
    // pasek stanowiska
    doc.setFillColor(...kol); doc.roundedRect(x, yy, colW, headH, 1, 1, 'F');
    doc.setTextColor(255,255,255); doc.setFont('Lib','bold'); doc.setFontSize(8.3);
    doc.text(st, x + 2.5, yy + headH - 2);
    const gsum = ludzie.filter(s=>!jestInstr(s)).reduce((a,s)=>a+godzZmiany(s),0);
    const samiInstr = ludzie.length > 0 && ludzie.every(s=>jestInstr(s));
    doc.setFontSize(7.4);
    doc.text(samiInstr ? `szkoli` : `${gsum.toFixed(1)}h`, x + colW - 2.5, yy + headH - 2, { align:'right' });
    // wiersze
    let ry = yy + headH;
    ludzie.sort((a,b)=>(a.start||'').localeCompare(b.start||''));
    ludzie.forEach((s, i) => {
      if (i % 2 === 1) { doc.setFillColor(245,247,250); doc.rect(x, ry, colW, rowH, 'F'); }
      doc.setTextColor(...INK); doc.setFont('Lib','normal'); doc.setFontSize(8);
      // Uczeń: nazwisko + instruktor w nawiasie. Szkolący: nazwisko + czapeczka (bez dublowania tekstu).
      const r = rolaSzk(s);
      let nmTxt = s.name;
      if (r === 'training') nmTxt = `${s.name}  (instr.: ${s.partner || '—'})`;
      const nm = nmTxt.length > 40 ? nmTxt.slice(0,39)+'…' : nmTxt;
      doc.text(nm, x + 2.5, ry + rowH - 1.5);
      if (s.szkoli) {
        const wTxt = doc.getTextWidth(nm);
        rysujCzapke(doc, x + 2.5 + wTxt + 1.6, ry + rowH - 2.9);
      }
      doc.setFontSize(7.9);
      const gh = godzZmiany(s);
      doc.text(`${s.start||''} – ${s.end||''}`, x + colW - 16, ry + rowH - 1.5, { align:'right' });
      doc.setFont('Lib','bold'); doc.setTextColor(...STAL);
      doc.text(`${gh}h`, x + colW - 2.5, ry + rowH - 1.5, { align:'right' });
      ry += rowH;
    });
    // ramka
    doc.setDrawColor(...kol); doc.setLineWidth(0.25);
    doc.roundedRect(x, yy, colW, headH + ludzie.length*rowH, 1, 1, 'S');
  };

  stanowiska.forEach(st => {
    const ludzie = grupy[st];
    const h = headH + ludzie.length*rowH;
    if (y + h > bodyBot && ci === 0) { ci = 1; y = bodyTop; }
    rysujBlok(colX[ci], y, st, ludzie);
    y += h + blkGap;
  });

  // ── PRAWY PANEL ──
  let sy = bodyTop;
  const sInner = sideW - 6;

  // Podsumowanie godzin — instruktor do CREW, uczeń do szkoleniowych (obie osoby liczone)
  const gCrew = dzienne.filter(s=>!jestMgrPdf(s.station)&&!jestSzkolenie(s)).reduce((a,s)=>a+godzZmiany(s),0);
  const gMgr  = dzienne.filter(s=>jestMgrPdf(s.station)).reduce((a,s)=>a+godzZmiany(s),0) + dodatkiMgr;
  const gSzk  = dzienne.filter(s=>jestUczen(s)||jestSzkStacja(s)).reduce((a,s)=>a+godzZmiany(s),0);

  const naglowekBoxu = (x,yy,w,txt) => {
    doc.setFillColor(...NAVY); doc.roundedRect(x,yy,w,6.6,1,1,'F');
    doc.rect(x,yy+3,w,3.6,'F');
    doc.setTextColor(255,255,255); doc.setFont('Lib','bold'); doc.setFontSize(8.6);
    doc.text(txt, x + w/2, yy + 4.6, { align:'center' });
  };

  // box 1 — godziny: PLAN vs REALIZACJA (realizację wpisuje kierownik ręcznie)
  const rowH1 = 6.4;
  const box1H = 6.6 + 5.2 + 4 * rowH1 + 3.5;
  doc.setFillColor(255,255,255); doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
  doc.roundedRect(sideX, sy, sideW, box1H, 1.5, 1.5, 'FD');
  naglowekBoxu(sideX, sy, sideW, 'PODSUMOWANIE GODZIN');

  const labelX = sideX + 4;
  const planR  = sideX + sideW * 0.62;         // prawy brzeg kolumny Plan
  const realL  = sideX + sideW * 0.66;         // lewy brzeg kolumny Realizacja
  const realR  = sideX + sideW - 4;

  // nagłówki kolumn
  let hy = sy + 6.6 + 4.6;
  doc.setFont('Lib','bold'); doc.setFontSize(7.4); doc.setTextColor(...STAL);
  doc.text('Plan', planR, hy, { align:'right' });
  doc.text('Realizacja', (realL + realR) / 2, hy, { align:'center' });
  doc.setDrawColor(...LIGHT); doc.setLineWidth(0.3);
  doc.line(sideX + 3, hy + 1.8, sideX + sideW - 3, hy + 1.8);
  // pionowy separator Plan | Realizacja
  doc.setDrawColor(235,239,246); doc.setLineWidth(0.2);
  doc.line(realL - 1.5, hy + 2, sideX + sideW - 3, hy + 2 + 0);

  let ry = hy + 1.8 + rowH1;
  const wierszG = (label, val, mocny) => {
    const baseline = ry - 2;
    doc.setFont('Lib', mocny ? 'bold' : 'normal'); doc.setFontSize(8.6);
    doc.setTextColor(...(mocny ? NAVY : INK));
    doc.text(label, labelX, baseline);
    doc.setFont('Lib','bold'); doc.setTextColor(...(mocny ? NAVY : STAL));
    doc.text(`${val.toFixed(1)} h`, planR, baseline, { align:'right' });
    // pole realizacji — linia do wpisania ręcznego
    doc.setDrawColor(...(mocny ? STAL : [203,212,208]));
    doc.setLineWidth(mocny ? 0.45 : 0.3);
    doc.line(realL, baseline + 0.6, realR, baseline + 0.6);
    ry += rowH1;
  };
  wierszG('Godziny CREW', gCrew);
  wierszG('Godziny MANAGER', gMgr);
  wierszG('Godziny SZKOLENIA', gSzk);
  // linia oddzielająca RAZEM
  doc.setDrawColor(...STAL); doc.setLineWidth(0.35);
  doc.line(sideX + 3, ry - rowH1 + 0.6, sideX + sideW - 3, ry - rowH1 + 0.6);
  wierszG('RAZEM', gCrew + gMgr + gSzk, true);
  sy += box1H + 4;

  // box 2 — UWAGI
  doc.setFont('Lib','normal'); doc.setFontSize(7.6);
  let uwagiLinie = [];
  UWAGI.forEach((u,i) => {
    const linie = doc.splitTextToSize(`${i+1}. ${u}`, sInner);
    uwagiLinie.push(linie);
  });
  const uwagiH = 6.6 + 3 + uwagiLinie.reduce((a,l)=>a + l.length*3.7 + 1.6, 0) + 2;
  doc.setFillColor(255,255,255); doc.setDrawColor(...LIGHT);
  doc.roundedRect(sideX, sy, sideW, uwagiH, 1.5, 1.5, 'FD');
  naglowekBoxu(sideX, sy, sideW, 'UWAGI');
  let uy = sy + 6.6 + 4.5;
  doc.setTextColor(...INK);
  uwagiLinie.forEach(linie => {
    doc.setFont('Lib','normal'); doc.setFontSize(7.6);
    linie.forEach(ln => { doc.text(ln, sideX + 4, uy); uy += 3.7; });
    uy += 1.6;
  });
  sy += uwagiH + 4;

  // box 3 — podpis
  const podpisH = Math.max(20, bodyBot - sy);
  doc.setFillColor(255,255,255); doc.setDrawColor(...LIGHT);
  doc.roundedRect(sideX, sy, sideW, podpisH, 1.5, 1.5, 'FD');
  naglowekBoxu(sideX, sy, sideW, 'KIEROWNIK ZAMYKAJĄCY');
  doc.setTextColor(...GREY); doc.setFont('Lib','normal'); doc.setFontSize(8);
  doc.text('Podpis:', sideX + 4, sy + 6.6 + 7);
  doc.setDrawColor(...STAL); doc.setLineWidth(0.3);
  doc.line(sideX + 20, sy + 6.6 + 7, sideX + sideW - 4, sy + 6.6 + 7);

  // ── STOPKA ──
  doc.setTextColor(...GREY); doc.setFont('Lib','normal'); doc.setFontSize(6.8);
  doc.text(`ORDO Workforce Studio · wygenerowano ${new Date().toLocaleString('pl-PL')}`, M, H - 3);
  doc.text('A4 · orientacja pozioma', W - M, H - 3, { align:'right' });
}

export function generateDayPDF(shifts, dateStr, location = 'Popeyes PLK Kraków Galeria Krakowska', dodatkiMgr = 0) {
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  fonty(doc);
  renderDzien(doc, shifts, dateStr, location, dodatkiMgr);
  return doc;
}

// planowanie = { [YYYY-MM]: { mgr:{date:h}, mgrFunk:{date:h} } } — ręczne godziny MGR doliczane per dzień
export function generateRangePDF(shifts, startDate, endDate, location = 'Popeyes PLK Kraków Galeria Krakowska', planowanie = {}) {
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  fonty(doc);
  const start = new Date(startDate), end = new Date(endDate);
  let first = true;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate()+1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const pl = planowanie[ds.slice(0,7)] || {};
    const dod = (Number((pl.mgr||{})[ds]) || 0) + (Number((pl.mgrFunk||{})[ds]) || 0);
    if (!first) doc.addPage('a4','landscape');
    renderDzien(doc, shifts, ds, location, dod);
    first = false;
  }
  return doc;
}


// ══════════════ DAILY ROSTER — wydruk dnia wg wzorca GRAFIK OBSADY ══════════════
// Landscape A4, lewy pionowy pasek tytułowy, KPI, sekcje 01–04.
// Pracownicy ZAWSZE pełnym imieniem i nazwiskiem z KONTA (aliasy tylko do dopasowania).
const TEAL9 = [18, 66, 63], TEAL7 = [49, 95, 91], TEAL5 = [89, 128, 124], LINIA = [223, 230, 229], TLO = [244, 247, 246];
const OK_BG = [232, 242, 239], BAD_BG = [255, 240, 237], WARN_BG = [255, 242, 232];
const OK_TX = [52, 115, 99], BAD_TX = [189, 79, 69], WARN_TX = [164, 97, 53];

export function generateDailyRoster({ dateStr, shifts, accounts, cov, wersja = 'Wersja opublikowana' }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('LibSans.ttf', LIB_SANS_REGULAR); doc.addFont('LibSans.ttf', 'LS', 'normal');
  doc.addFileToVFS('LibSansB.ttf', LIB_SANS_BOLD); doc.addFont('LibSansB.ttf', 'LS', 'bold');
  const F = (b, sz, kol) => { doc.setFont('LS', b ? 'bold' : 'normal'); doc.setFontSize(sz); doc.setTextColor(...(kol || INK)); };
  const W = 297, H = 210;

  // mapy kont: pelne imie i nazwisko po accountId / grafikName / aliasach / name
  const poId = new Map((accounts || []).map((a) => [a.id, a]));
  const poNaz = new Map((accounts || []).flatMap((a) => [a.grafikName, a.name, ...(a.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a])));
  const kontoZ = (sx) => poId.get(sx.accountId) || poNaz.get(String(sx.name || '').toUpperCase().trim()) || null;
  const etyk = (sx) => { const k = kontoZ(sx); return (k && k.name ? k.name : (sx.name || '')).toUpperCase(); };
  const MGR = new Set(['SM', 'JSM', 'ASM', 'RGM']);

  const dzienne = (shifts || []).filter((x) => x.date === dateStr);
  const scalone = scalPary(dzienne);
  const osoby = new Set(dzienne.filter((x) => rolaSzk(x) !== 'instruktor').map(etyk));
  const planH = dzienne.reduce((a, x) => a + godzZmiany(x), 0);
  const mgrH = dzienne.filter((x) => { const k = kontoZ(x); return k && MGR.has(k.funkcja); }).reduce((a, x) => a + godzZmiany(x), 0);
  const szkH = dzienne.filter((x) => rolaSzk(x)).reduce((a, x) => a + godzZmiany(x), 0);
  const szkOsoby = new Set(dzienne.filter((x) => rolaSzk(x) === 'training').map(etyk)).size;
  const crewH = planH - mgrH - szkH;
  // kierownictwo dnia: manager z najwczesniejszym startem / najpozniejszym koncem
  const mgrZm = dzienne.filter((x) => { const k = kontoZ(x); return k && MGR.has(k.funkcja); });
  const minut = (t) => { const [h2, m2] = String(t || '0:0').split(':').map(Number); return h2 * 60 + m2; };
  const kEnd = (x) => { let e = minut(x.end); if (e <= minut(x.start)) e += 1440; return e; };
  const otw = mgrZm.slice().sort((a, b) => minut(a.start) - minut(b.start))[0];
  const zam = mgrZm.slice().sort((a, b) => kEnd(b) - kEnd(a))[0];
  const nazwisko = (sx) => { const e = etyk(sx); const cz = e.split(/\s+/); return cz[cz.length - 1]; };

  const d0 = new Date(dateStr + 'T12:00:00');
  const tytul = `${dniPl[d0.getDay()]}, ${d0.getDate()} ${mcPl[d0.getMonth()]} ${d0.getFullYear()}`;

  // ── lewy pionowy pasek ──
  doc.setFillColor(...TEAL9); doc.rect(0, 0, 32, H, 'F');
  doc.setFillColor(...TEAL7); doc.rect(0, 0, 32, 3, 'F');
  const pion = (txt, x, y, opt) => doc.text(txt, x, y, { angle: 90, ...opt });
  F(0, 6.4, [145, 173, 169]); pion('RESTAURACJA', 10, H - 8);
  F(1, 11, [255, 255, 255]); pion('Popeyes Kraków', 16, H - 8);
  F(0, 7, [175, 197, 194]); pion('Galeria Krakowska · K003', 21.5, H - 8);
  F(0, 6.6, [145, 173, 169]); pion('GRAFIK OBSADY', 9, H - 78, { charSpace: 0.6 });
  F(1, 17, [255, 255, 255]); pion(tytul, 17, H - 78);
  F(0, 7, [183, 212, 208]); pion(`Doba operacyjna 06:00–06:00 · ${wersja}`, 23.5, H - 78);
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.5); doc.circle(16, 14, 5.2, 'S');
  F(1, 8.5, [255, 255, 255]); pion('ORDO', 14.5, 24);
  F(0, 5.4, [145, 173, 169]); pion('WORKFORCE · DAILY ROSTER', 19.5, 24, { charSpace: 0.5 });

  // ── pasek KPI ──
  const X0 = 38, KY = 8, KW = W - X0 - 8;
  const kpi = [
    ['ZMIANY', String(dzienne.length), `${osoby.size} pracowników`],
    ['PLAN GODZIN', `${planH.toFixed(1).replace('.', ',')} h`, 'netto'],
    ['COVERAGE', cov ? `${cov.pct.toFixed(0)}%` : '—', cov ? `${cov.zle} ${cov.zle === 1 ? 'slot' : cov.zle < 5 ? 'sloty' : 'slotów'} do kontroli` : 'brak danych'],
    ['MANAGER', `${mgrH.toFixed(1).replace('.', ',')} h`, 'otwarcie + zamknięcie'],
    ['SZKOLENIA', `${szkH.toFixed(1).replace('.', ',')} h`, `${szkOsoby} ${szkOsoby === 1 ? 'osoba' : szkOsoby < 5 ? 'osoby' : 'osób'}`],
    ['KIEROWNICTWO DNIA', '', ''],
  ];
  const kw = KW / 6;
  kpi.forEach((k, i) => {
    const x = X0 + i * kw;
    if (i) { doc.setDrawColor(...LINIA); doc.setLineWidth(0.25); doc.line(x - 3, KY + 1, x - 3, KY + 15); }
    F(0, 5.6, GREY); doc.text(k[0], x, KY + 3.4, { charSpace: 0.3 });
    if (i === 5) {
      F(1, 7.5, INK); doc.text(`Otwarcie: ${otw ? nazwisko(otw) : '—'}`, x, KY + 8.6);
      doc.text(`Zamknięcie: ${zam ? nazwisko(zam) : '—'}`, x, KY + 13);
    } else {
      F(1, 12.5, INK); doc.text(k[1], x, KY + 10);
      F(0, 5.8, GREY); doc.text(k[2], x, KY + 14.2);
    }
  });
  doc.setDrawColor(...LINIA); doc.setLineWidth(0.3); doc.line(X0, KY + 17.5, W - 8, KY + 17.5);

  // ── sekcja 01: obsada wedlug stanowisk (2 kolumny blokow) ──
  const sekcjaTag = (x, y, nr, tyt, sub) => {
    doc.setFillColor(...TLO); doc.roundedRect(x, y, 7.5, 7.5, 1.4, 1.4, 'F');
    F(1, 7, TEAL5); doc.text(nr, x + 3.75, y + 4.9, { align: 'center' });
    F(1, 9.5, INK); doc.text(tyt, x + 10, y + 3.6);
    F(0, 6.2, GREY); doc.text(sub, x + 10, y + 7.2);
  };
  const L0 = 38, LW2 = 152, kolW = (LW2 - 6) / 2;
  let y01 = KY + 22;
  sekcjaTag(L0, y01, '01', 'Obsada według stanowisk', 'godziny pracy netto · pełne imiona i nazwiska z kont');
  y01 += 11;

  // grupowanie
  const grupy = {};
  scalone.forEach((x) => { const st = (x.station || '').toUpperCase() || 'OBSADA'; (grupy[st] = grupy[st] || []).push(x); });
  const nazwyGrup = Object.keys(grupy).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  let cx = L0, cy = y01, kolNr = 0;
  const dolLimit = H - 14;
  const nowaKolumna = () => { kolNr += 1; cx = L0 + kolNr * (kolW + 6); cy = y01; };
  nazwyGrup.forEach((g) => {
    let wpisy = grupy[g].slice().sort((a, b) => minut(a.start) - minut(b.start));
    const hGr = wpisy.reduce((a, x) => a + godzZmiany(x) + (x.rola === 'training' && x.instrHours ? x.instrHours : 0), 0);
    let czesc = 1;
    while (wpisy.length) {
      const wolne = dolLimit - cy;
      let ile = Math.floor((wolne - 9) / 6.4);
      if (ile < 3 && kolNr < 1) { nowaKolumna(); continue; }
      if (ile < 1 && kolNr >= 1) break;
      ile = Math.max(1, Math.min(ile, wpisy.length));
      rysujBlok(g, wpisy.slice(0, ile), hGr, czesc);
      wpisy = wpisy.slice(ile);
      czesc += 1;
      if (wpisy.length && kolNr < 1) nowaKolumna();
      else if (wpisy.length) break;
    }
  });
  function rysujBlok(g, wpisy, hGr, czesc) {
    const wys = 7 + wpisy.length * 6.4 + 2;
    const kol = kolor(g);
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...LINIA); doc.setLineWidth(0.3);
    doc.roundedRect(cx, cy, kolW, wys, 1.8, 1.8, 'FD');
    doc.setFillColor(...kol); doc.roundedRect(cx, cy, 2, wys, 1, 1, 'F');
    doc.setFillColor(...kol); doc.roundedRect(cx + 4, cy + 2, 10, 4, 1, 1, 'F');
    F(1, 5.4, [255, 255, 255]); doc.text(g.slice(0, 3), cx + 9, cy + 4.8, { align: 'center' });
    F(1, 7.4, INK); doc.text(czesc > 1 ? `${g} (cd.)` : g, cx + 16, cy + 5, { maxWidth: kolW - 34 });
    if (czesc === 1) { F(1, 7.4, TEAL7); doc.text(`${hGr.toFixed(1).replace('.', ',')} h`, cx + kolW - 3, cy + 5, { align: 'right' }); }
    let ry = cy + 8.6;
    wpisy.forEach((x) => {
      const k = kontoZ(x);
      let nm = etyk(x);
      F(1, 6.8, INK); doc.text(nm, cx + 4, ry, { maxWidth: kolW - 52 });
      const wTxt = Math.min(doc.getTextWidth(nm), kolW - 52);
      let bx = cx + 4 + wTxt + 1.5;
      const badge = (t, kb) => { const wB = doc.getTextWidth(t) * 0.5 + 3; doc.setFillColor(...kb); doc.roundedRect(bx, ry - 2.5, wB, 3.2, 0.8, 0.8, 'F'); F(1, 4.6, [255, 255, 255]); doc.text(t, bx + wB / 2, ry - 0.2, { align: 'center' }); bx += wB + 1.2; };
      if (x.rola === 'training' && x.partner) { const ki = poNaz.get(String(x.partner).toUpperCase().trim()); F(0, 5.2, TEAL5); doc.text(`instr.: ${(ki && ki.name ? ki.name : x.partner)}`, bx, ry - 0.1, { maxWidth: kolW - 60 }); }
      else if (k && k.instruktor) badge('Trener', [0, 121, 107]);
      else if (k && MGR.has(k.funkcja)) badge('Manager', TEAL9);
      F(0, 6.6, GREY); doc.text(`${x.start}–${x.end}`, cx + kolW - 16, ry, { align: 'right' });
      F(1, 6.4, INK); doc.text(`${godzZmiany(x).toFixed(0)} h`, cx + kolW - 3, ry, { align: 'right' });
      ry += 6.4;
    });
    cy += wys + 3.5;
  }

  // ── prawa kolumna: sekcje 02–04 ──
  const R0 = L0 + LW2 + 6, RW = W - R0 - 8;
  let ry2 = KY + 22;
  sekcjaTag(R0, ry2, '02', 'Pokrycie godzinowe', 'plan względem obsady idealnej');
  if (cov) { F(1, 13, cov.pct >= 95 ? OK_TX : BAD_TX); doc.text(`${cov.pct.toFixed(0)}%`, R0 + RW, ry2 + 5, { align: 'right' }); }
  ry2 += 11;
  if (cov && cov.rows) {
    const cw = RW / 24;
    F(0, 4.6, GREY); cov.rows.forEach((r2, i) => doc.text(String(r2.g).padStart(2, '0'), R0 + i * cw + cw / 2, ry2 + 2.4, { align: 'center' }));
    const wiersz = (label, klucz, yy) => {
      F(0, 5, GREY); doc.text(label, R0, yy - 1.2);
      cov.rows.forEach((r2, i) => {
        const v = r2[klucz]; const idl = r2.ideal;
        let bg = OK_BG, tx = OK_TX;
        if (klucz === 'plan') { if (v < idl) { bg = BAD_BG; tx = BAD_TX; } else if (v > idl) { bg = WARN_BG; tx = WARN_TX; } }
        else { bg = TLO; tx = [90, 104, 101]; }
        doc.setFillColor(...bg); doc.rect(R0 + i * cw, yy, cw - 0.4, 5, 'F');
        F(1, 5.4, tx); doc.text(String(v), R0 + i * cw + cw / 2, yy + 3.5, { align: 'center' });
      });
    };
    wiersz('Idealna', 'ideal', ry2 + 4.5);
    wiersz('Plan', 'plan', ry2 + 11.5);
    ry2 += 18.5;
    F(0, 5.4, GREY);
    const leg = [['Pokrycie', OK_TX], ['Niedobór', BAD_TX], ['Nadmiar', WARN_TX]];
    let lx = R0;
    leg.forEach(([t, c2]) => { doc.setFillColor(...c2); doc.circle(lx + 1, ry2, 1, 'F'); doc.setTextColor(...GREY); doc.text(t, lx + 3, ry2 + 1); lx += doc.getTextWidth(t) + 9; });
    ry2 += 6;
  } else { F(0, 6.5, GREY); doc.text('Brak danych sprzedaży — pokrycie niedostępne.', R0, ry2 + 3); ry2 += 8; }

  ry2 += 4;
  sekcjaTag(R0, ry2, '03', 'Podsumowanie godzin', 'plan i wykonanie');
  ry2 += 11;
  F(0, 5.4, GREY); doc.text('KATEGORIA', R0, ry2); doc.text('PLAN', R0 + RW * 0.55, ry2, { align: 'right' }); doc.text('REALIZACJA', R0 + RW, ry2, { align: 'right' });
  ry2 += 2;
  const kat = [['CREW', crewH], ['MANAGER', mgrH], ['SZKOLENIA', szkH], ['RAZEM', planH]];
  kat.forEach(([n2, v], i) => {
    ry2 += 6.2;
    const bold = n2 === 'RAZEM';
    if (bold) { doc.setDrawColor(...LINIA); doc.setLineWidth(0.3); doc.line(R0, ry2 - 4.4, R0 + RW, ry2 - 4.4); }
    F(bold ? 1 : 0, 7, INK); doc.text(n2, R0, ry2);
    F(1, 7, INK); doc.text(`${v.toFixed(1).replace('.', ',')} h`, R0 + RW * 0.55, ry2, { align: 'right' });
    doc.setDrawColor(...LINIA); doc.setLineWidth(0.25); doc.line(R0 + RW * 0.68, ry2, R0 + RW, ry2);
  });

  ry2 += 10;
  sekcjaTag(R0, ry2, '04', 'Priorytety zmiany', 'do omówienia na pre-shiftcie');
  ry2 += 10.5;
  const prio = ['Wbicia i wybicia kartą zgodnie z planem.', 'Reakcja na wskaźnik kalkulatora MPT.', 'Każda zamiana wymaga akceptacji ASM lub RGM.'];
  prio.forEach((t) => { doc.setFillColor(...TEAL5); doc.circle(R0 + 1, ry2 - 1, 0.8, 'F'); F(0, 6.6, INK); doc.text(t, R0 + 3.5, ry2, { maxWidth: RW - 4 }); ry2 += 5.4; });
  ry2 += 2;
  F(0, 5.6, GREY); doc.text('Uwagi kierownika', R0, ry2);
  doc.setDrawColor(...LINIA); doc.line(R0 + 24, ry2, R0 + RW, ry2); ry2 += 9;
  F(0, 5.6, GREY); doc.text('KIEROWNIK ZAMYKAJĄCY', R0, ry2);
  F(1, 8, INK); doc.text(zam ? nazwisko(zam) : '—', R0, ry2 + 5);
  F(0, 5.6, GREY); doc.text('Podpis', R0 + RW * 0.5, ry2 + 5);
  doc.setDrawColor(...LINIA); doc.line(R0 + RW * 0.5 + 12, ry2 + 5, R0 + RW, ry2 + 5);

  // stopka
  doc.setDrawColor(...LINIA); doc.setLineWidth(0.3); doc.line(X0, H - 9, W - 8, H - 9);
  F(0, 5.6, GREY);
  doc.text('ORDO Workforce Studio', X0, H - 5);
  const teraz = new Date();
  doc.text(`Wygenerowano ${String(teraz.getDate()).padStart(2, '0')}.${String(teraz.getMonth() + 1).padStart(2, '0')}.${teraz.getFullYear()} · ${String(teraz.getHours()).padStart(2, '0')}:${String(teraz.getMinutes()).padStart(2, '0')}`, X0 + KW / 2, H - 5, { align: 'center' });
  doc.text('Dokument operacyjny · K003 · strona 1/1', W - 8, H - 5, { align: 'right' });

  doc.save(`grafik_${dateStr}.pdf`);
}
