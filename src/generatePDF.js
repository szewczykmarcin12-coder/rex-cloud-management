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
  'PREP':[141,110,99],'DOSTAWA':[92,107,192],'SZKOLENIA':[38,166,154],'TRAINING':[38,166,154],'INSTRUKTOR':[0,121,107],'MANAGER':[8,37,103],'MGR FUNKCYJNE':[69,90,100]
};
const kolor = (s) => KOLORY[(s||'').toUpperCase()] || [57,81,133];

const NAVY = [8,37,103], NAVY2 = [33,59,118], STAL = [57,81,133], LIGHT = [232,237,245];
const PEACH = [253,167,133], INK = [30,37,50], GREY = [120,130,145];

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

// ── Render jednego dnia ──────────────────────────────────────────────
function renderDzien(doc, shifts, dateStr, location, dodatkiMgr = 0) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 8;
  const d = new Date(dateStr);

  const dzienne = shifts.filter(s => s.date === dateStr);
  const sumaGodz = dzienne.reduce((a,s)=>a+godzZmiany(s),0) + dodatkiMgr;

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
  doc.text(`Zmian: ${dzienne.length}      Roboczogodzin: ${sumaGodz.toFixed(1)} h`, W - M, 15.5, { align:'right' });

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
    const gsum = ludzie.reduce((a,s)=>a+godzZmiany(s),0);
    doc.setFontSize(7.4);
    doc.text(`${ludzie.length} os. · ${gsum.toFixed(1)}h`, x + colW - 2.5, yy + headH - 2, { align:'right' });
    // wiersze
    let ry = yy + headH;
    ludzie.sort((a,b)=>(a.start||'').localeCompare(b.start||''));
    ludzie.forEach((s, i) => {
      if (i % 2 === 1) { doc.setFillColor(245,247,250); doc.rect(x, ry, colW, rowH, 'F'); }
      doc.setTextColor(...INK); doc.setFont('Lib','normal'); doc.setFontSize(8);
      // przy szkoleniu dopisz rolę i parę (uczeń → instruktor / instruktor → uczeń)
      const r = rolaSzk(s);
      let nmTxt = s.name;
      if (r === 'training') nmTxt = `${s.name}  (szkol.${s.partner ? ', instr.: ' + s.partner : ''})`;
      else if (r === 'instruktor') nmTxt = `${s.name}  (instruktor${s.partner ? ', szkoli: ' + s.partner : ''})`;
      const nm = nmTxt.length > 40 ? nmTxt.slice(0,39)+'…' : nmTxt;
      doc.text(nm, x + 2.5, ry + rowH - 1.5);
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
  const gCrew = dzienne.filter(s=>!jestMgrPdf(s.station)&&!jestUczen(s)&&!jestSzkStacja(s)).reduce((a,s)=>a+godzZmiany(s),0);
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
    doc.setDrawColor(...(mocny ? STAL : [198,208,224]));
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
  doc.text(`REX Cloud · wygenerowano ${new Date().toLocaleString('pl-PL')}`, M, H - 3);
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
