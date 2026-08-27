import * as XLSX from 'xlsx';

// Day-block start columns (0-indexed): A=0, E=4, I=8, M=12, Q=16, U=20, Y=24
const DAY_START_COLS = [0, 4, 8, 12, 16, 20, 24];
const WEEK_SHEETS = ['Tydzień 1', 'Tydzień 2', 'Tydzień 3', 'Tydzień 4', 'Tydzień 5', 'Tydzień 6'];

// Rows below these section labels are summary/plan rows -> skip
const STOP_SECTIONS = new Set([
  'PLAN CREW', 'PLAN SZKOLENIA', 'PLAN MGRS', 'PLAN MGR FUNKCJA',
  'TOTAL BEZ SZKOLEŃ', 'TOTAL HOURS', 'TRANS PLAN', 'SPRZEDAŻ PLAN (ZŁ)',
  'MPT TOTAL PLAN', 'ZŁ / RBH', 'SIATKA OBSADY — MASZ / POTRZEBA', 'KONTROLA'
]);

function cellRef(row, col) {
  return XLSX.utils.encode_cell({ r: row, c: col });
}

function getCell(ws, row, col) {
  const c = ws[cellRef(row, col)];
  return c ? c.v : null;
}

// Convert Excel serial date or JS date to YYYY-MM-DD
function toDateStr(val) {
  if (val == null) return null;
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  }
  if (typeof val === 'number') {
    const d = XLSX.SSF.parse_date_code(val);
    if (d && d.y) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  return null;
}

// Convert time value (Excel fraction, Date, or "HH:MM") to "HH:MM"
function toTimeStr(val) {
  if (val == null) return null;
  if (val instanceof Date) {
    // Excel epoch dates for time-only come as 1899/1900 — use hours/minutes
    return `${String(val.getHours()).padStart(2, '0')}:${String(val.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof val === 'number') {
    // Fraction of a day
    let frac = val % 1;
    const totalMin = Math.round(frac * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(val);
  const match = s.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, '0')}:${match[2]}`;
  return null;
}

function calcHours(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let h = eh - sh + (em - sm) / 60;
  if (h < 0) h += 24;
  return Math.round(h * 100) / 100;
}

// Known station/section labels (column A). A column-A string counts as a section
// label only if it's one of these — employee names also live in column A on some
// week sheets, so we must not treat those as labels.
const SECTION_LABELS = new Set([
  'PANIEROWANIE', 'SMAŻENIE', 'KANAPKI / WRAPY', 'KONTROLER',
  'WSPARCIE WIECZORNE / FLEX', 'DISPATCHER', 'PHU', 'DESERY / NAPOJE',
  'FRYTKI', 'ZMYWAK', 'PREP', 'DOSTAWA', 'SZKOLENIA', 'MANAGER', 'MGR FUNKCYJNE'
]);

// Build map: row index -> current section label (from column A).
// A cell is a label only when it matches SECTION_LABELS *and* has no start time
// beside it (column B empty) — that reliably separates headers from names.
function buildSectionMap(ws, maxRow) {
  const sections = {};
  let last = null;
  for (let r = 0; r <= Math.min(maxRow, 72); r++) {
    const v = getCell(ws, r, 0);
    const beside = getCell(ws, r, 1); // column B: start time if this is an employee row
    if (v && typeof v === 'string' && v.trim()) {
      const up = v.trim().toUpperCase();
      if (up === 'SIATKA OBSADY — MASZ / POTRZEBA' || up === 'KONTROLA') break;
      if (SECTION_LABELS.has(up) && beside == null) {
        last = v.trim();
      }
    }
    sections[r] = last;
  }
  return sections;
}

/**
 * Parse the GRAFIK_CREW matrix workbook.
 * Returns { shifts, roster, meta } or throws with a helpful message.
 */
function parseGrafikMatryca(arrayBuffer) {  // stary format matrycy — nieuzywany w UI, zostaje jako zapas
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  const weekSheets = WEEK_SHEETS.filter(s => wb.SheetNames.includes(s));
  if (weekSheets.length === 0) {
    throw new Error('Nie znaleziono arkuszy "Tydzień 1..6". Upewnij się, że to matryca GRAFIK_CREW.');
  }

  const shifts = [];

  for (const sheetName of weekSheets) {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const maxRow = range.e.r;
    const sections = buildSectionMap(ws, maxRow);

    for (const dc of DAY_START_COLS) {
      const dateVal = getCell(ws, 0, dc); // row 1 (0-indexed 0)
      const dateStr = toDateStr(dateVal);
      if (!dateStr) continue;

      for (let r = 1; r <= Math.min(maxRow, 61); r++) {
        const name = getCell(ws, r, dc);
        if (!name || typeof name !== 'string' || !name.trim()) continue;

        const start = toTimeStr(getCell(ws, r, dc + 1));
        if (!start) continue;
        const end = toTimeStr(getCell(ws, r, dc + 2));
        let hours = getCell(ws, r, dc + 3);
        if (typeof hours !== 'number') hours = calcHours(start, end);

        const station = sections[r] || '';
        if (station && STOP_SECTIONS.has(station.toUpperCase())) continue;

        const base = { date: dateStr, start, end: end || '', hours };

        // Format "instruktor; uczeń" → dwa powiązane wiersze.
        // Stanowisko = sekcja, w której wpisano parę (pozycja, np. KANAPKI / WRAPY);
        // rola oznacza instruktora/ucznia. Dzięki temu para trafia do bloku danej pozycji.
        if (name.includes(';')) {
          const [instrRaw, uczRaw] = name.split(';');
          const instr = (instrRaw || '').trim().toUpperCase();
          const ucz = (uczRaw || '').trim().toUpperCase();
          const pozycja = station || 'SZKOLENIA';
          if (instr) shifts.push({ ...base, name: instr, station: pozycja, rola: 'instruktor', partner: ucz || undefined });
          if (ucz) shifts.push({ ...base, name: ucz, station: pozycja, rola: 'training', partner: instr || undefined });
          continue;
        }

        shifts.push({ ...base, name: name.trim().toUpperCase(), station });
      }
    }
  }

  if (shifts.length === 0) {
    throw new Error('Nie znaleziono żadnych zmian w matrycy. Sprawdź czy grafik jest wypełniony.');
  }

  // Roster: prefer ZAŁOGA sheet names, fall back to names found in shifts
  let roster = [];
  if (wb.SheetNames.includes('ZAŁOGA')) {
    const zw = wb.Sheets['ZAŁOGA'];
    const range = XLSX.utils.decode_range(zw['!ref']);
    for (let r = 0; r <= range.e.r; r++) {
      const v = getCell(zw, r, 0);
      if (v && typeof v === 'string' && v.trim() && !v.includes('ZAŁOGA') && !v.toLowerCase().includes('nazwisko')) {
        roster.push(v.trim().toUpperCase());
      }
    }
  }
  // Merge with names actually appearing in shifts
  const shiftNames = [...new Set(shifts.map(s => s.name))];
  roster = [...new Set([...roster, ...shiftNames])].sort();

  // Meta: month/year from first shift date
  const dates = shifts.map(s => s.date).sort();
  const firstDate = new Date(dates[0]);
  const meta = {
    month: firstDate.getMonth(),
    year: firstDate.getFullYear(),
    monthName: ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'][firstDate.getMonth()],
    firstDate: dates[0],
    lastDate: dates[dates.length - 1],
    shiftCount: shifts.length,
    employeeCount: shiftNames.length
  };

  return { shifts, roster, meta };
}


// ============ FORMAT POZIOMY (grafik_planowany_import_poziomy) ============
// Wiersz 1: [rok, 'DD/MM', pusta, 'DD/MM', pusta, ...] — kazdy dzien to PARA kolumn (start / koniec).
// Wiersze 2+: [IMIE NAZWISKO, '08:00','16:00', , , ...]; puste = brak zmiany; koniec < start = zmiana przez polnoc.
export function parseGrafik(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  if (!rows.length) throw new Error('Pusty arkusz');
  const naglowek = rows[0] || [];
  const rok = parseInt(String(naglowek[0]).trim(), 10);
  if (!rok || rok < 2000 || rok > 2100) throw new Error('Komórka A1 musi zawierać rok (np. 2026) — to nie jest plik w formacie poziomym');
  // kolumny dat: para (c, c+1) dla kazdej komorki DD/MM w wierszu 1
  const dni = [];
  for (let c = 1; c < naglowek.length; c++) {
    const v = naglowek[c];
    if (v == null || v === '') continue;
    let d = null, m = null;
    if (typeof v === 'string' && /^\d{1,2}\/\d{1,2}$/.test(v.trim())) { const [dd, mm] = v.trim().split('/').map(Number); d = dd; m = mm; }
    else if (v instanceof Date) { d = v.getDate(); m = v.getMonth() + 1; }
    if (d && m) dni.push({ c, date: `${rok}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
  }
  if (!dni.length) throw new Error('Wiersz 1 nie zawiera dat w formacie DD/MM');
  const shifts = [];
  const osoby = new Set();
  for (let r = 1; r < rows.length; r++) {
    const wiersz = rows[r] || [];
    const surowa = wiersz[0];
    if (surowa == null || String(surowa).trim() === '') continue;
    const name = String(surowa).trim().toUpperCase();
    osoby.add(name);
    for (const { c, date } of dni) {
      const start = toTimeStr(wiersz[c]);
      const end = toTimeStr(wiersz[c + 1]);
      if (!start || !end) continue;
      let hours = (timeMin(end) - timeMin(start)) / 60;
      if (hours <= 0) hours += 24;   // zmiana przez polnoc (22:00 -> 06:00)
      shifts.push({ date, name, station: '', start, end, hours: Math.round(hours * 100) / 100 });
    }
  }
  if (!shifts.length) throw new Error('Nie znaleziono żadnych zmian — sprawdź, czy godziny są w parach kolumn pod datami');
  const roster = [...osoby].sort();
  const dates = shifts.map((s2) => s2.date).sort();
  const firstDate = new Date(dates[0]);
  const meta = {
    month: firstDate.getMonth(), year: firstDate.getFullYear(),
    monthName: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'][firstDate.getMonth()],
    firstDate: dates[0], lastDate: dates[dates.length - 1],
    shiftCount: shifts.length, employeeCount: roster.length, format: 'poziomy',
  };
  return { shifts, roster, meta };
}
function timeMin(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); }

// Eksport grafiku miesiaca — matryca 1:1 z szablonem "Układ poziomy - plan":
// A1 = rok; naglowki DD/MM co 2 kolumny; pary start/koniec jako tekst HH:MM;
// kolumna SUMA [h] + ukryte formuly pomocnicze jak w szablonie.
// Kilka zmian jednej osoby w dniu jest SCALANE do jednego zakresu (min start – max koniec),
// bo import docelowego systemu czyta tylko jedna pare na dzien.
export function exportPoziomy(shifts, accounts, monthKey) {
  const [Y, M] = monthKey.split('-').map(Number);
  const nDni = new Date(Y, M, 0).getDate();
  const daty = Array.from({ length: nDni }, (_, i) => `${Y}-${String(M).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  const poId = new Map((accounts || []).map((a) => [a.id, a]));
  const poNaz = new Map((accounts || []).flatMap((a) => [a.grafikName, a.name, ...(a.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a])));
  const mies = shifts.filter((s2) => (s2.date || '').startsWith(monthKey) && s2.rola !== 'instruktor');
  const etykieta = (s2) => { const k = poId.get(s2.accountId) || poNaz.get(String(s2.name || '').toUpperCase().trim()); return (k && k.name ? k.name : s2.name || '').toUpperCase().trim(); };
  const pad2 = (n) => String(n).padStart(2, '0');
  const hhmm = (min) => `${pad2(Math.floor(((min % 1440) + 1440) % 1440 / 60))}:${pad2(min % 60)}`;

  // scalanie: osoba -> data -> zakres min start .. max koniec (z obsluga zmian przez polnoc)
  const mapa = {};
  let scalone = 0;
  mies.forEach((s2) => {
    const os = etykieta(s2); if (!os) return;
    (mapa[os] = mapa[os] || {});
    const sMin = timeMin(s2.start);
    let eMin = timeMin(s2.end); if (eMin <= sMin) eMin += 1440;
    const stary = mapa[os][s2.date];
    if (!stary) mapa[os][s2.date] = { s: sMin, e: eMin };
    else { scalone++; stary.s = Math.min(stary.s, sMin); stary.e = Math.max(stary.e, eMin); }
  });

  // pelny sklad: wszystkie konta + nazwy z grafiku bez konta (rowniez puste wiersze — jak w szablonie)
  const osoby = [...new Set([
    ...(accounts || []).map((a) => String(a.name || '').toUpperCase().trim()),
    ...Object.keys(mapa),
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pl'));

  // STAŁA geometria szablonu: zawsze 31 par kolumn (B..BK), SUMA [h] w BL, formuły od BM —
  // niezależnie od liczby dni miesiąca (tak czyta import "grafiku optymalnego").
  const SLOTY = 31;
  const naglowek = [String(Y)];
  for (let d = 0; d < SLOTY; d++) naglowek.push(d < nDni ? `${daty[d].slice(8)}/${daty[d].slice(5, 7)}` : null, null);
  naglowek.push('SUMA [h]');
  const aoa = [naglowek];
  osoby.forEach((os) => {
    const w = [os];
    for (let d = 0; d < SLOTY; d++) { const z = d < nDni ? (mapa[os] || {})[daty[d]] : null; w.push(z ? hhmm(z.s) : null, z ? hhmm(z.e) : null); }
    w.push(null);
    aoa.push(w);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // formuly jak w szablonie: SUMA [h] w BL (kol. 64) + pomocnicze pary od BM — zawsze 31 par
  const sumaCol = 1 + SLOTY * 2;                       // 0-based 63 = kolumna BL
  for (let r = 1; r <= osoby.length; r++) {
    const row = r + 1;                                 // 1-based wiersz arkusza
    ws[XLSX.utils.encode_cell({ r, c: sumaCol })] = { t: 'n', f: `IFERROR(IF(COUNT(BM${row}:CM${row})>0,SUM(BM${row}:EA${row}),""),"")`, z: '0.00' };
    for (let d = 0; d < SLOTY; d++) {
      const cS = XLSX.utils.encode_col(1 + d * 2), cE = XLSX.utils.encode_col(2 + d * 2);
      const hc = sumaCol + 1 + d * 2;                  // 0-based 64 = BM
      ws[XLSX.utils.encode_cell({ r, c: hc })] = { t: 'n', f: `IFERROR(IF(${cE}${row}-${cS}${row}>0,(${cE}${row}-${cS}${row})*24,IF(${cS}${row} >0,((24-${cS}${row}*24)+${cE}${row}*24),"")),"")` };
    }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: osoby.length, c: sumaCol + 1 + (SLOTY - 1) * 2 } });
  // format tekstowy jak w szablonie dla wypelnionych komorek tekstowych
  Object.keys(ws).forEach((addr) => { if (addr[0] !== '!' && ws[addr] && ws[addr].t === 's') ws[addr].z = '@'; });
  ws['!cols'] = [{ wch: 24 }, ...Array.from({ length: SLOTY * 2 }, () => ({ wch: 6 })), { wch: 9 }, ...Array.from({ length: SLOTY * 2 }, () => ({ hidden: true }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, `Układ poziomy - plan_${monthKey}-01_${monthKey}-${pad2(nDni)}.xlsx`);
  const zmian = Object.values(mapa).reduce((a, v) => a + Object.keys(v).length, 0);
  return { osoby: osoby.length, zmian, scalone };
}

