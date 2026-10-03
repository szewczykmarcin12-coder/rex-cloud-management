import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parseSalesDayByDay, parseDailyOperations, parsePosReport, toISODate } from '../src/import/posReports.js';

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', n));

describe('raporty POS (prawdziwe pliki PLK Kraków Galeria Krakowska, 1.08–30.09.2026)', () => {
  it('Sales Day by Day: 61 dni bez braków, netto / brutto / paragony, sumy zgodne z Daily Operations co do złotówki', () => {
    const s = parseSalesDayByDay(fx('sales-day-by-day.xlsx'));
    expect(s.typ).toBe('sales-day-by-day'); expect(s.from).toBe('2026-08-01'); expect(s.to).toBe('2026-09-30');
    expect(s.n).toBe(61); expect(s.braki).toEqual([]); expect(s.basis).toBe('net');
    expect(Object.keys(s.sales).length).toBe(61); expect(Object.keys(s.checks).length).toBe(61); expect(Object.keys(s.salesGross).length).toBe(61);
    expect(s.sales['2026-08-01']).toBeCloseTo(37833.30, 2); expect(s.salesGross['2026-08-01']).toBe(41075.17); expect(s.checks['2026-08-01']).toBe(835);
    expect(Math.round(s.totals.net)).toBe(1943138); expect(s.totals.checks).toBe(48514); expect(s.totals.avgCheck).toBeCloseTo(40.05, 1);
    expect(s.totals.gross).toBe(2109951.51);
    // trend: pełne tygodnie sierpnia ~239–250 tys., września 191–210 tys.
    const pelne = s.weeks.filter((w) => w.days === 7).map((w) => Math.round(w.net / 1000));
    expect(pelne).toEqual([249, 249, 239, 250, 200, 210, 199, 191]);
    // dzień tygodnia: niedziela i piątek najwyżej, wtorek najniżej
    const [nd, pn, wt, sr, cz, pt, sb] = s.dow.map((d) => d.net);
    expect(nd).toBeGreaterThan(pt); expect(pt).toBeGreaterThan(sb); expect(wt).toBeLessThan(pn); expect(Math.min(nd, pn, wt, sr, cz, pt, sb)).toBe(wt);
    expect(s.location).toContain('Krakow_Galeria');
  });

  it('Daily Operations: sumy, typy zamówień, profil 15-minutowy (96 slotów od 06:00) ze szczytami 14:30 i 20:00, Labor % nieśledzony', () => {
    const d = parseDailyOperations(fx('daily-operations.xlsx'));
    expect(d.typ).toBe('daily-operations'); expect(d.from).toBe('2026-08-01'); expect(d.to).toBe('2026-09-30');
    expect(Math.round(d.totals.net)).toBe(1943138); expect(d.totals.checks).toBe(48514); expect(d.totals.laborTracked).toBe(false);
    expect(d.orderTypes.map((o) => o.name)).toEqual(['Take Out', 'Uber Eats', 'Wolt', 'MO Take Out', 'Dine In']);
    expect(d.orderTypes[0].sharePct).toBeCloseTo(75.18, 1);
    expect(Object.keys(d.slots15).length).toBeGreaterThan(60);
    expect(d.profile96.length).toBe(96); expect(d.profile96[0].time).toBe('06:00'); expect(d.profile96[95].time).toBe('05:45');
    const suma = d.profile96.reduce((a, s) => a + s.sales, 0); expect(suma).toBeCloseTo(1, 3);
    const sumaC = d.profile96.reduce((a, s) => a + s.checks, 0); expect(sumaC).toBeCloseTo(1, 3);
    expect(d.peaks.slice(0, 2)).toEqual(['14:30', '20:00']);
    expect(d.hourly['14']).toBeGreaterThan(0.08); expect(d.hourly['03']).toBe(0);
    expect(d.intraday.slots['14:30'].sales).toBeGreaterThan(40000);
    expect(d.warnings).toEqual([]);
  });

  it('rozpoznaje typ raportu po zawartości i czyta daty w formatach R&A', () => {
    expect(parsePosReport(fx('sales-day-by-day.xlsx')).typ).toBe('sales-day-by-day');
    expect(parsePosReport(fx('daily-operations.xlsx')).typ).toBe('daily-operations');
    expect(toISODate('8/1/2026')).toBe('2026-08-01'); expect(toISODate('30.09.2026')).toBe('2026-09-30'); expect(toISODate(new Date(2026, 8, 30))).toBe('2026-09-30'); expect(toISODate('x')).toBeNull();
  });
});
