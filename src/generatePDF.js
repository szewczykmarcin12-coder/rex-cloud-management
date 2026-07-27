import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';

// Register autoTable on the jsPDF prototype (works in Vite build and Node alike)
applyPlugin(jsPDF);

const dayNamesFull = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
const monthNames = ['Stycznia','Lutego','Marca','Kwietnia','Maja','Czerwca','Lipca','Sierpnia','Września','Października','Listopada','Grudnia'];

const stationOrder = [
  'PANIEROWANIE', 'SMAŻENIE', 'KANAPKI / WRAPY', 'KONTROLER',
  'WSPARCIE WIECZORNE / FLEX', 'DISPATCHER', 'PHU', 'DESERY / NAPOJE',
  'FRYTKI', 'ZMYWAK', 'PREP', 'DOSTAWA', 'SZKOLENIA', 'MANAGER', 'MGR FUNKCYJNE'
];
const stationRank = (s) => { const i = stationOrder.indexOf((s || '').toUpperCase()); return i === -1 ? 99 : i; };

function renderDay(doc, shifts, dateStr, location) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  const d = new Date(dateStr);
  const dayName = dayNamesFull[d.getDay()];
  const dateLabel = `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;

  const dayShifts = shifts
    .filter(s => s.date === dateStr)
    .sort((a, b) => stationRank(a.station) - stationRank(b.station) || (a.start || '').localeCompare(b.start || ''));

  doc.setFillColor(8, 37, 103);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('GRAFIK DZIENNY', margin, 10);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`${dayName}, ${dateLabel}`, margin, 17);
  doc.setFontSize(9);
  doc.text(location, pageW - margin, 10, { align: 'right' });
  const totalH = dayShifts.reduce((a, s) => a + (s.hours || 0), 0);
  doc.text(`Zmian: ${dayShifts.length}  |  Roboczogodzin: ${totalH.toFixed(1)}h`, pageW - margin, 17, { align: 'right' });

  const notesColW = 70;
  const gap = 4;
  const tableW = pageW - 2 * margin - notesColW - gap;

  const body = dayShifts.map(s => [
    s.station || '—', s.name, s.start || '', s.end || '',
    s.hours != null ? `${s.hours}h` : '', ''
  ]);

  doc.autoTable({
    startY: 26,
    margin: { left: margin, right: margin + notesColW + gap },
    tableWidth: tableW,
    head: [['Stanowisko', 'Pracownik', 'Od', 'Do', 'Godz.', 'Obecność / uwagi']],
    body: body.length ? body : [['—', 'Brak zaplanowanych zmian', '', '', '', '']],
    theme: 'grid',
    headStyles: { fillColor: [57, 81, 133], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, cellPadding: 1.6, minCellHeight: 6.5, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: tableW * 0.24, fontStyle: 'bold' },
      1: { cellWidth: tableW * 0.22 },
      2: { cellWidth: tableW * 0.09, halign: 'center' },
      3: { cellWidth: tableW * 0.09, halign: 'center' },
      4: { cellWidth: tableW * 0.09, halign: 'center' },
      5: { cellWidth: tableW * 0.27 }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0) data.cell.styles.fillColor = [232, 237, 245];
    }
  });

  const notesX = pageW - margin - notesColW;
  const notesY = 26;
  const notesH = pageH - notesY - margin;
  doc.setDrawColor(57, 81, 133);
  doc.setLineWidth(0.4);
  doc.roundedRect(notesX, notesY, notesColW, notesH, 2, 2);
  doc.setFillColor(253, 167, 133);
  doc.roundedRect(notesX, notesY, notesColW, 8, 2, 2, 'F');
  doc.rect(notesX, notesY + 4, notesColW, 4, 'F');
  doc.setTextColor(8, 37, 103);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('NOTATKI KIEROWNIKA ZMIANY', notesX + notesColW / 2, notesY + 5.5, { align: 'center' });
  doc.setDrawColor(200, 210, 225);
  doc.setLineWidth(0.2);
  let ly = notesY + 14;
  while (ly < notesY + notesH - 4) { doc.line(notesX + 3, ly, notesX + notesColW - 3, ly); ly += 7; }

  doc.setTextColor(150, 150, 150);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(`REX Cloud — wygenerowano ${new Date().toLocaleString('pl-PL')}`, margin, pageH - 4);
}

export function generateDayPDF(shifts, dateStr, location = 'Popeyes PLK Kraków Galeria Krakowska') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  renderDay(doc, shifts, dateStr, location);
  return doc;
}

export function generateRangePDF(shifts, startDate, endDate, location = 'Popeyes PLK Kraków Galeria Krakowska') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const start = new Date(startDate);
  const end = new Date(endDate);
  let first = true;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!first) doc.addPage('a4', 'landscape');
    renderDay(doc, shifts, ds, location);
    first = false;
  }
  return doc;
}
