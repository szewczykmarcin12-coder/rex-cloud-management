import { describe, it, expect } from 'vitest';
import { miesiacePoprzednie, zakresOkresu, agregujMiesiace, podsumujOkres, zamkniecieKart, csvOkresu, dostepneMiesiace } from '../src/analytics/period.js';

const konta = { a1: { id: 'a1', name: 'ALA', funkcja: 'CREW', umowa: 'UZ', stawka: 30 }, m1: { id: 'm1', name: 'MGR', funkcja: 'ASM', umowa: 'UOP', stawka: 8000 } };
const kontoZ = (x) => konta[x.accountId] || null;
const shifts = [
  { date: '2026-09-01', accountId: 'a1', hours: 8, station: 'FRYTKI' },
  { date: '2026-09-02', accountId: 'a1', hours: 6, station: 'FRYTKI' },
  { date: '2026-09-02', accountId: 'm1', hours: 8, station: 'MANAGER' },
  { date: '2026-09-03', accountId: 'zz', name: 'BEZ KONTA', hours: 4, station: 'FRYTKI' },
  { date: '2026-09-03', accountId: 'a1', hours: 2, station: 'FRYTKI', rola: 'instruktor' },   // adnotacja pary — nie liczy się
  { date: '2026-03-15', accountId: 'a1', hours: 8, station: 'FRYTKI' },
  { date: '2025-08-20', accountId: 'a1', hours: 8, station: 'FRYTKI' },                         // poza oknem 12 mies.
];
const sales = { '2026-09-01': 10000, '2026-09-02': 12000, '2026-03-15': 5000, '2025-08-20': 9000 };

describe('okres analityki', () => {
  it('12 miesięcy kalendarzowych kończy się na najnowszym miesiącu z danymi i obejmuje puste miesiące', () => {
    expect(miesiacePoprzednie('2026-09', 12)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(miesiacePoprzednie('2026-01', 3)).toEqual(['2025-11', '2025-12', '2026-01']);
    const r12 = zakresOkresu({ tryb: 'r12', shifts, sales });
    expect(r12.length).toBe(12); expect(r12[11]).toBe('2026-09'); expect(r12[0]).toBe('2025-10');
    expect(zakresOkresu({ tryb: 'miesiac', miesiac: '2026-03', shifts, sales })).toEqual(['2026-03']);
    expect(dostepneMiesiace(shifts, sales)).toEqual(['2025-08', '2026-03', '2026-09']);
  });

  it('filtr okresu obejmuje agregaty, KPI, kompletność i CSV — dane spoza okresu nie wchodzą', () => {
    const months = zakresOkresu({ tryb: 'r12', shifts, sales });
    const agreg = agregujMiesiace({ shifts, sales, months, kontoZ });
    expect(agreg.length).toBe(12);
    const wrz = Object.fromEntries(agreg)['2026-09'];
    expect(wrz.h).toBe(26); expect(wrz.crew).toBe(18); expect(wrz.mgr).toBe(8); expect(wrz.zmian).toBe(4); expect(wrz.bezStawki).toBe(1); expect(wrz.dni).toBe(3);
    expect(wrz.koszt).toBeCloseTo(14 * 30 + 8000 / 160 * 8, 5);
    const pod = podsumujOkres(agreg);
    expect(pod.sprzedaz).toBe(27000);                    // 2025-08 poza oknem
    expect(pod.h).toBe(34); expect(pod.mieszDane).toBe(2);
    expect(pod.col).toBeCloseTo(pod.koszt / 27000 * 100, 9);
    const zk = zamkniecieKart({ shifts, completed: { '2026-09-01': true, '2025-08-20': true, '2026-12-24': true }, months });
    expect(zk).toEqual({ dniZmian: 4, dniComp: 1, pct: 25 });
    const csv = csvOkresu(agreg).split('\n');
    expect(csv.length).toBe(13); expect(csv[12].startsWith('2026-09;22000;')).toBe(true); expect(csv[1]).toBe('2025-10;0;0;0.0;;0;0');
  });

  it('wartości zerowe: brak sprzedaży i brak grafiku nie dają NaN ani fałszywej pewności', () => {
    const months = ['2026-01'];
    const agreg = agregujMiesiace({ shifts: [], sales: {}, months, kontoZ });
    const pod = podsumujOkres(agreg);
    expect(pod.col).toBeNull(); expect(pod.splh).toBeNull(); expect(pod.h).toBe(0); expect(pod.mieszDane).toBe(0);
    expect(zamkniecieKart({ shifts: [], completed: {}, months })).toEqual({ dniZmian: 0, dniComp: 0, pct: 0 });
    const tylkoGodziny = podsumujOkres(agregujMiesiace({ shifts: [{ date: '2026-01-05', accountId: 'a1', hours: 8 }], sales: {}, months, kontoZ }));
    expect(tylkoGodziny.col).toBeNull(); expect(tylkoGodziny.splh).toBeNull(); expect(tylkoGodziny.mieszBezSprz).toBe(1);
    expect(zakresOkresu({ tryb: 'r12', shifts: [], sales: {} }).length).toBe(12);
  });
});
