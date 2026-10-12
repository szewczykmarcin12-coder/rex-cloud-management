// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseDyspoPoziome } from '../src/App.jsx';
import { ocenOknoDyspozycji } from '../src/lib/domain.js';

const arkusz = (rows) => { const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Dyspo'); return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }); };

describe('import dyspozycji (audyt 11.10)', () => {
  it('osoba z całkowicie pustym wierszem jest na liście osób (reguła „pusty dzień = niedostępny” obejmuje też ją)', () => {
    const buf = arkusz([[2026, '01/10', null, '02/10', null], ['ANNA PEŁNA', '10:00', '20:00', '00:00', '23:59'], ['BARTEK PUSTY', null, null, null, null], ['CELINA DO', '00:00', '23:30', null, null]]);
    const p = parseDyspoPoziome(buf);
    expect(p.osoby).toEqual(['ANNA PEŁNA', 'BARTEK PUSTY', 'CELINA DO']);
    expect(p.dniPliku).toEqual(['2026-10-01', '2026-10-02']);
    expect(p.items.filter((x) => x.name === 'BARTEK PUSTY')).toEqual([]);
  });
  it('„00:00–23:30” to dostępność DO 23:30, nie cały dzień; „00:00–23:59” to cały dzień', () => {
    const buf = arkusz([[2026, '01/10', null], ['CELINA DO', '00:00', '23:30'], ['ANNA PEŁNA', '00:00', '23:59'], ['DAREK OD', '14:00', '23:59']]);
    const p = parseDyspoPoziome(buf);
    expect(p.items.find((x) => x.name === 'CELINA DO')).toMatchObject({ type: 'until_time', endTime: '23:30' });
    expect(p.items.find((x) => x.name === 'ANNA PEŁNA')).toMatchObject({ type: 'available' });
    expect(p.items.find((x) => x.name === 'DAREK OD')).toMatchObject({ type: 'from_time', startTime: '14:00' });
  });
  it('okno dyspozycji przez północ liczone w dobie 06→06 (ta sama logika co backend)', () => {
    expect(ocenOknoDyspozycji({ type: 'specific_shift', startTime: '22:00', endTime: '02:00' }, '22:00', '02:00')).toBeNull();
    expect(ocenOknoDyspozycji({ type: 'specific_shift', startTime: '22:00', endTime: '02:00' }, '21:00', '02:00')).toMatchObject({ kod: 'okno' });
    expect(ocenOknoDyspozycji({ type: 'until_time', endTime: '23:30' }, '16:00', '23:45')).toMatchObject({ kod: 'do' });
    expect(ocenOknoDyspozycji({ type: 'until_time', endTime: '02:00' }, '18:00', '01:30')).toBeNull();
    expect(ocenOknoDyspozycji({ type: 'unavailable' }, '08:00', '16:00')).toMatchObject({ kod: 'niedostepny' });
  });
});
