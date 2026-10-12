import { describe, it, expect } from 'vitest';
import { mgrRequirement96, splitSchedule96, coverageSplit, coverageSummary } from '../src/planning/coverageEngine.js';

const crewReq = new Float64Array(96).fill(0).map((_, i) => (i >= 4 && i < 80 ? 3 : 0));   // 3 osoby crew 07:00–02:00
const isMgr = (x) => x.station === 'MANAGER';

describe('obsada godzinowa: crew z popytu + manager jako wymóg obecności', () => {
  it('stary model liczył managera jako nadmiar; nowy — nie', () => {
    const shifts = [
      { start: '07:00', end: '15:00', station: 'FRYTKI' }, { start: '07:00', end: '15:00', station: 'KANAPKI / WRAPY' }, { start: '07:00', end: '15:00', station: 'KONTROLER' },
      { start: '15:00', end: '02:00', station: 'FRYTKI' }, { start: '15:00', end: '02:00', station: 'KANAPKI / WRAPY' }, { start: '15:00', end: '02:00', station: 'KONTROLER' },
      { start: '06:00', end: '16:00', station: 'MANAGER' }, { start: '16:00', end: '02:30', station: 'MANAGER' },
    ];
    const { crew96, mgr96 } = splitSchedule96(shifts, isMgr);
    const stary = coverageSummary(crewReq, crew96.map((v, i) => v + mgr96[i]));
    const nowy = coverageSplit(crewReq, crew96, mgr96, mgrRequirement96({ openFrom: '06:00', openTo: '02:00', mgrNaZmianie: 1 }));
    expect(stary.excessH).toBeGreaterThan(19);            // ~20,5 h „nadmiaru” — to były godziny managerów
    expect(nowy.excessH).toBe(0);
    expect(nowy.deficitH).toBe(0);
    expect(nowy.deficitMgrH).toBe(0);
    expect(nowy.requiredMgrH).toBeCloseTo(20.5, 5);         // 06:00 (początek doby operacyjnej) → 02:30
    expect(nowy.scheduledMgrH).toBeCloseTo(20.5, 5);
    expect(nowy.coveragePct).toBeGreaterThan(97);
  });

  it('brak managera w godzinach otwarcia to niedobór, drugi manager na przekazaniu zmiany to informacja, nie nadmiar', () => {
    const shifts = [{ start: '07:00', end: '15:00', station: 'FRYTKI' }, { start: '07:00', end: '15:00', station: 'KANAPKI / WRAPY' }, { start: '07:00', end: '15:00', station: 'KONTROLER' },
      { start: '06:00', end: '14:00', station: 'MANAGER' }, { start: '13:00', end: '15:00', station: 'MANAGER' }];
    const req = new Float64Array(96).fill(0).map((_, i) => (i >= 4 && i < 36 ? 3 : 0));    // crew 07–15
    const { crew96, mgr96 } = splitSchedule96(shifts, isMgr);
    const r = coverageSplit(req, crew96, mgr96, mgrRequirement96({ openFrom: '06:00', openTo: '15:00', mgrNaZmianie: 1 }));
    expect(r.excessH).toBe(0);
    expect(r.extraMgrH).toBeCloseTo(1, 5);                   // 13–14 dwóch managerów
    expect(r.deficitMgrH).toBeCloseTo(0.5, 5);               // 15:00–15:30 (bufor po zamknięciu) bez managera
    expect(r.perSlot[30].reqMgr).toBe(1); expect(r.perSlot[30].schMgr).toBe(2);   // 13:30 — dwóch managerów
  });

  it('nadmiar crew nadal wykrywany, a wymóg managera skaluje się z parametrem', () => {
    const shifts = [{ start: '07:00', end: '15:00', station: 'FRYTKI' }, { start: '07:00', end: '15:00', station: 'KANAPKI / WRAPY' }, { start: '07:00', end: '15:00', station: 'KONTROLER' }, { start: '07:00', end: '15:00', station: 'PREP' }];
    const req = new Float64Array(96).fill(0).map((_, i) => (i >= 4 && i < 36 ? 3 : 0));
    const { crew96, mgr96 } = splitSchedule96(shifts, isMgr);
    const r = coverageSplit(req, crew96, mgr96, mgrRequirement96({ openFrom: '06:00', openTo: '15:00', mgrNaZmianie: 2 }));
    expect(r.excessH).toBeCloseTo(8, 5);                     // 4. osoba crew przez 8 h
    expect(r.requiredMgrH).toBeCloseTo(19, 5);                // 2 × 9,5 h (06:00 → 15:30)
    expect(r.deficitMgrH).toBeCloseTo(19, 5);
  });
});
