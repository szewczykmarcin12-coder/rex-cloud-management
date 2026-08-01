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
export function parseGrafik(arrayBuffer) {
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
