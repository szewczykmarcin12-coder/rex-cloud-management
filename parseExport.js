// Parser pliku eksportu (CSV) wygenerowanego przez makro "EksportujGrafik"
// w matrycy Excel. Kolumny: Nazwisko,Data,Od,Do,Godziny,Stanowisko
// Dane są już czyste (jedna zmiana = jeden wiersz), więc nie ma tu logiki matrycy.

const monthNames = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];

const calcHours = (start, end) => {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let h = eh - sh + (em - sm) / 60;
  if (h < 0) h += 24;
  return Math.round(h * 100) / 100;
};

export function parseExportCSV(text) {
  // usuń BOM (ADODB.Stream zapisuje UTF-8 z BOM) i białe znaki
  text = text.replace(/^\uFEFF/, '').trim();
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (lines.length === 0) throw new Error('Plik eksportu jest pusty.');

  // pomiń wiersz nagłówka jeśli obecny
  const first = lines[0].toLowerCase();
  const startIdx = (first.includes('nazwisko') || first.includes('data')) ? 1 : 0;

  const shifts = [];
  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 2) continue;
    const name = (parts[0] || '').trim();
    const date = (parts[1] || '').trim();
    const start = (parts[2] || '').trim();
    const end = (parts[3] || '').trim();
    const hoursRaw = (parts[4] || '').trim();
    const station = (parts[5] || '').trim();
    const partner = (parts[6] || '').trim(); // kolumna "Para" (druga osoba)
    const rola = (parts[7] || '').trim().toLowerCase(); // kolumna "Rola": instruktor / training
    if (!name || !date) continue;
    let hours = hoursRaw ? parseFloat(hoursRaw.replace(',', '.')) : null;
    if (hours == null || isNaN(hours)) hours = calcHours(start, end);

    // "instruktor; uczeń" w polu nazwiska → dwa powiązane wiersze; stanowisko = pozycja
    if (name.includes(';')) {
      const [instrRaw, uczRaw] = name.split(';');
      const instr = (instrRaw || '').trim().toUpperCase();
      const ucz = (uczRaw || '').trim().toUpperCase();
      const pozycja = station || 'SZKOLENIA';
      if (instr) shifts.push({ name: instr, date, start, end, hours, station: pozycja, rola: 'instruktor', partner: ucz || undefined });
      if (ucz) shifts.push({ name: ucz, date, start, end, hours, station: pozycja, rola: 'training', partner: instr || undefined });
      continue;
    }

    const shift = { name: name.toUpperCase(), date, start, end, hours, station };
    if (partner) shift.partner = partner.toUpperCase();
    if (rola === 'instruktor' || rola === 'training') shift.rola = rola;
    shifts.push(shift);
  }

  if (shifts.length === 0) throw new Error('Nie znaleziono zmian w pliku eksportu. Sprawdź, czy plik pochodzi z przycisku „Eksportuj grafik".');

  const shiftNames = [...new Set(shifts.map((s) => s.name))];
  const roster = [...shiftNames].sort();
  const dates = shifts.map((s) => s.date).sort();
  const fd = new Date(dates[0]);
  const meta = {
    month: fd.getMonth(), year: fd.getFullYear(), monthName: monthNames[fd.getMonth()],
    firstDate: dates[0], lastDate: dates[dates.length - 1],
    shiftCount: shifts.length, employeeCount: shiftNames.length,
  };
  return { shifts, roster, meta };
}
