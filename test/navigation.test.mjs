import { describe, it, expect } from 'vitest';
import { AREAS, MODULES, resolveLegacy, parseHash, hashFor, searchModules, visibleAreas, visibleModules, modulesOfArea, clampToRole, moduleForWrTab, fold } from '../src/navigation.js';

describe('katalog nawigacji', () => {
  it('ma 7 obszarów, unikalne identyfikatory modułów i każdy moduł w istniejącym obszarze z opisem', () => {
    expect(AREAS.map((a) => a.id)).toEqual(['centrum', 'prognozy', 'planowanie', 'realizacja', 'analizy', 'zespol', 'administracja']);
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODULES) { expect(AREAS.some((a) => a.id === m.area)).toBe(true); expect(m.desc.length).toBeGreaterThan(20); expect(m.roles.length).toBeGreaterThan(0); }
  });

  it('starsze skróty prowadzą do właściwych modułów (plan ≠ forecast, actual ≠ grafik)', () => {
    expect(resolveLegacy('plan')).toBe('budzet');
    expect(resolveLegacy('forecast')).toBe('prognoza-miesiaca');
    expect(resolveLegacy('forecast-col')).toBe('prognoza-miesiaca');
    expect(resolveLegacy('optymalizacja')).toBe('model-popytu');
    expect(resolveLegacy('obsada')).toBe('obsada');
    expect(resolveLegacy('wt')).toBe('grafik');
    expect(resolveLegacy('schedule')).toBe('grafik');
    expect(resolveLegacy('actual')).toBe('wykonanie');
    expect(resolveLegacy('tna')).toBe('obecnosc');
    expect(resolveLegacy('blueprints')).toBe('szablony');
    expect(resolveLegacy('cycles')).toBe('cykle');
    expect(resolveLegacy('dyspo')).toBe('dyspozycje');
    expect(resolveLegacy('emps')).toBe('pracownicy');
    expect(resolveLegacy('swaps')).toBe('zamiany');
    expect(resolveLegacy('analytics')).toBe('wyniki');
    expect(resolveLegacy('nie-ma-takiego')).toBeNull();
    // adresy: nowe, stare i odświeżenie
    expect(parseHash('#/planowanie/grafik')).toBe('grafik');
    expect(parseHash('#/plan')).toBe('budzet');
    expect(parseHash('#/wt')).toBe('grafik');
    expect(parseHash('')).toBeNull();
    expect(hashFor('wykonanie')).toBe('#/realizacja/wykonanie');
    expect(parseHash(hashFor('wykonanie'))).toBe('wykonanie');
    expect(moduleForWrTab('actual')).toBe('wykonanie');
    expect(moduleForWrTab('blueprints')).toBe('szablony');
  });

  it('wyszukiwanie znajduje konkretne narzędzie, także bez polskich znaków', () => {
    expect(searchModules('actual', 'asm')[0].module.id).toBe('wykonanie');
    expect(searchModules('budżet', 'asm')[0].module.id).toBe('budzet');
    expect(searchModules('budzet', 'asm')[0].module.id).toBe('budzet');
    expect(searchModules('dyspozycyjnosc', 'asm')[0].module.id).toBe('dyspozycje');
    expect(searchModules('Time & Attendance', 'asm')[0].module.id).toBe('obecnosc');
    expect(searchModules('grafik', 'asm')[0].module.id).toBe('grafik');
    expect(searchModules('eksport GO', 'asm')[0].module.id).toBe('import-eksport');
    expect(searchModules('xyz-nic', 'asm')).toEqual([]);
    expect(fold('Dyspozycyjność i wnioski')).toBe('dyspozycyjnosc i wnioski');
  });

  it('kierownik zmiany widzi pulpit i widoki operacyjne, nie widzi finansów ani administracji', () => {
    const k = visibleModules('kierownik').map((m) => m.id);
    expect(k).toEqual(['pulpit', 'grafik', 'wykonanie', 'obecnosc']);
    expect(visibleAreas('kierownik').map((a) => a.id)).toEqual(['centrum', 'planowanie', 'realizacja']);
    expect(modulesOfArea('planowanie', 'kierownik').map((m) => m.id)).toEqual(['grafik']);
    expect(clampToRole('budzet', 'kierownik')).toBe('pulpit');
    expect(clampToRole('budzet', 'asm')).toBe('budzet');
    expect(searchModules('budżet', 'kierownik')).toEqual([]);
    expect(visibleModules('asm').length).toBe(MODULES.length);
  });
});
