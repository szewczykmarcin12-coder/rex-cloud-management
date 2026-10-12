// @vitest-environment jsdom
// Scenariusze powłoki Studio w jsdom (bez prawdziwej przeglądarki): API zastąpione lokalnymi danymi testowymi.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within, act } from '@testing-library/react';
import App from '../src/App.jsx';
import { MODULES, hashFor, visibleModules } from '../src/navigation.js';
import fs from 'fs';
import path from 'path';

const DANE = {
  '/schedule': { success: true, shifts: [{ sid: 's1', date: '2026-09-07', name: 'ALA TEST', accountId: 'a1', station: 'FRYTKI', start: '10:00', end: '18:00', hours: 8 }, { sid: 's2', date: '2026-09-08', name: 'ALA TEST', accountId: 'a1', station: 'FRYTKI', start: '10:00', end: '18:00', hours: 8 }], roster: [], meta: { firstDate: '2026-09-01', lastDate: '2026-09-30' }, months: [{ key: '2026-09', label: 'Wrzesień 2026', shifts: 2 }] },
  '/planning': { success: true, planowanie: {} }, '/swaps': { success: true, swaps: [] },
  '/timesheets': { success: true, actuals: {}, completed: { '2026-09-07': true }, weekStatus: {} },
  '/accounts': { success: true, accounts: [{ id: 'a1', name: 'ALA TEST', funkcja: 'CREW', umowa: 'UZ', stawka: 30, aktywny: true, login: 'ala' }] },
  '/budget': { success: true, data: { employees: [], settings: null, sprzedaz: {}, transakcje: {}, dniS: {} } },
  '/sales': { success: true, sales: { '2026-09-07': 12000, '2026-09-08': 9000 }, checks: {}, params: null, meta: null, braki: [], hourly: {}, hourlyProfile: null, hourlyDays: 0 },
  '/org': { success: true, unit: { code: 'PLK 201043', name: 'Galeria Krakowska' } }, '/templates': { success: true, templates: [] }, '/absences': { success: true, absences: [] },
  '/availability': { success: true, pending: 0, requests: [], window: null }, '/audit': { success: true, entries: [] }, '/kpi': { success: true, snapshots: [], cronSkonfigurowany: false },
  '/forecast': { success: true, days: [], backtest: { dni: 28, mape: 8.5, wape: 8.6, model: 'hybryda' }, modele: { wybrany: 'hybryda', mediana: { dni: 28, mape: 12.8, wape: 12.7 }, hybryda: { dni: 28, mape: 8.5, wape: 8.6 } }, dane: { ostatniDzien: '2026-09-30', dniOdOstatniego: 13, nastepnyImport: '2026-10-20', przeterminowane: true, rytm: 'wtorek, ostatnie 8 tygodni' } }, '/autoplan': { success: true, proposals: [], model: null }, '/compliance': { success: true, violations: [], summary: {} },
  '/monthly-forecast': { success: true, exists: false, plan: null, months: [] },
  '/work-model': { success: true, slownik: [{ kod: 'MANAGER', krytyczne: true }, { kod: 'KONTROLER', krytyczne: true }, { kod: 'KANAPKI / WRAPY', krytyczne: true }, { kod: 'PANIEROWANIE', krytyczne: true }], model: { version: 2, status: 'propozycja', przekazanieMin: 0, mgrOperacyjnyUdzial: 0.7, zrodlo: { plik: 'plan_2026-10 (wzorzec)', od: '2026-10-01', do: '2026-10-31', zmian: 459 }, uwagi: [{ typ: 'luka-uzupelniona', opis: 'PANIEROWANIE Pt: w ≥ 50 % dni brak obsady 16:00–18:00 — w propozycji uzupełnione, potwierdź.' }],
    stanowiska: { MANAGER: { krytyczne: true }, PANIEROWANIE: { krytyczne: true }, KONTROLER: { krytyczne: true } },
    biblioteka: [{ id: 't1', station: 'MANAGER', start: '06:00', end: '16:00', dni: [0, 1, 2, 3, 4, 5, 6], liczba: 1, typ: 'podstawowa', rola: 'otwarcie', flexMin: 60, godzin: 10 }, { id: 't2', station: 'PANIEROWANIE', start: '06:00', end: '16:00', dni: [0, 1, 2, 3, 4, 5, 6], liczba: 1, typ: 'podstawowa', rola: 'otwarcie', flexMin: 60, godzin: 10 }, { id: 't3', station: 'PANIEROWANIE', start: '18:00', end: '02:00', dni: [5], liczba: 1, typ: 'podstawowa', rola: 'zamkniecie', flexMin: 60, godzin: 8 }, { id: 't4', station: 'KONTROLER', start: '12:00', end: '15:00', dni: [1], liczba: 1, typ: 'dodatkowa', rola: 'srodek', flexMin: 60, godzin: 3 }] } },
  '/qualifications': { success: true, matrix: { a1: { KONTROLER: { poziom: 2, zatwierdzone: true, zrodlo: 'manager' }, PANIEROWANIE: { poziom: 2, zatwierdzone: false, zrodlo: 'historia', zmian: 7 } } }, poziomy: { 0: 'brak', 1: 'w szkoleniu', 2: 'samodzielny', 3: 'trener' }, slownik: ['MANAGER', 'KONTROLER', 'KANAPKI / WRAPY', 'PANIEROWANIE'], stan: { osob: 1, zDanymi: 1, bezDanych: [], tryb: 'macierz', pula: { KONTROLER: { samodzielni: 1, wSzkoleniu: 0, propozycje: 0 }, PANIEROWANIE: { samodzielni: 0, wSzkoleniu: 0, propozycje: 1 }, MANAGER: { samodzielni: 0, wSzkoleniu: 0, propozycje: 0 }, 'KANAPKI / WRAPY': { samodzielni: 0, wSzkoleniu: 0, propozycje: 0 } }, stanowiskaBezPuli: ['PANIEROWANIE', 'MANAGER', 'KANAPKI / WRAPY'] } },
  '/schedule-audit': { success: true, month: '2026-09', gotowy: false, streszczenie: 'Grafik niekompletny — 1 problemów krytycznych (Przerwa w obsadzie stanowiska: 1).', podsumowanie: { krytyczne: 1, wazne: 1, info: 0, perKod: { LUKA_STANOWISKA: 1, DUPLIKAT_ZMIANY: 1 }, blokujace: 1 }, perDate: { '2026-09-15': 1 }, problemy: [{ kod: 'LUKA_STANOWISKA', waga: 'krytyczna', nazwa: 'Przerwa w obsadzie stanowiska', date: '2026-09-15', od: '15:00', do: '18:00', station: 'KANAPKI / WRAPY', opis: '2026-09-15, KANAPKI / WRAPY 15:00–18:00: przerwa między zmianami na tym stanowisku.', naprawa: 'Sprawdź wcześniejszy start zmiany zamykającej.' }, { kod: 'DUPLIKAT_ZMIANY', waga: 'wazna', nazwa: 'Powielona zmiana kierownicza', date: '2026-09-22', od: '18:00', do: '02:00', station: 'MANAGER', opis: '2026-09-22: 2 osoby MANAGER 18:00–02:00.', naprawa: 'Potwierdź potrzebę.' }] },
  '/month-plan': { success: true, month: '2026-10', plan: null, params: { splh: 420, mpt: 4, podloga: 3, indirectPct: 0.12, colTargetPct: 20, yoyWeight: 0.3 }, miesiace: [{ month: '2026-10', status: null }], grafik: { godziny: 0, zmian: 0, dni: 0 },
    events: [{ id: 'e1', name: 'Kampania kanapkowa', typ: 'promo', from: '2026-10-06', to: '2026-10-19', upliftPct: 8, by: 'Marta ASM' }],
    sezon: { idx: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), { factor: i === 8 ? 0.937 : 1, zrodlo: i === 8 ? 'learned' : 'default', n: i === 8 ? 1 : 0 }])), miesiecyHistorii: 2 },
    kalibracja: [{ month: '2026-09', proposal: null, plan: null, status: null, actual: 849285, dniZDanymi: 30, dni: 30, kompletny: true, odchPlanPct: null, odchPropPct: null }],
    proposal: { ok: true, month: '2026-10', asOf: '2026-10-03', ostatniDzien: '2026-09-30', sales: 811259, transactions: 21269, agc: 38.15, low: 723970, high: 898548, pasmoPct: 10.76, poziomTyg: 200087, trendTygPct: -4, tygodniHistorii: 8, tygodniDoPrzodu: 1, dniWMiesiacu: 31, sklad: { Nd: 4, Pn: 4, Wt: 4, Sr: 4, Cz: 5, Pt: 5, Sb: 5 }, udzialDow: [16.6, 14.8, 13.4, 14, 14.3, 13.9, 13], yoy: { dostepne: false }, tygodnie: [{ start: '2026-08-03', end: '2026-08-09', sales: 248616, checks: 6100 }, { start: '2026-09-21', end: '2026-09-27', sales: 191441, checks: 5000 }], sezon: { factor: 1.07, idxCel: { factor: 1, zrodlo: 'default' }, idxBaza: { factor: 0.937, zrodlo: 'learned', n: 1 }, idxRatio: 1.07 }, zdarzenia: ['Kampania kanapkowa'], wplywZdarzen: 28000, powody: ['Sezon: indeks 10/12 (start QSR-galeria) 1 vs miesiąc bazowy 0.937 → ×1.07 (danych rok wcześniej brak — indeks nauczy się z Twoich zamkniętych miesięcy).'], dni: [] } }, '/terminals': { success: true, terminals: [] }, '/health': { success: true },
};
let awarie = new Set();     // ścieżki, które mają zwrócić błąd
const zapytania = [];
function mockFetch() {
  global.fetch = vi.fn(async (url) => {
    const u = String(url); const path = u.replace(/^.*\/api/, '').split('?')[0];
    zapytania.push(path);
    if ([...awarie].some((a) => path.startsWith(a))) return { status: 500, ok: false, json: async () => ({ success: false, error: 'Awaria testowa' }) };
    const klucz = Object.keys(DANE).find((k) => path === k || path.startsWith(k + '/')) || Object.keys(DANE).find((k) => path.startsWith(k));
    return { status: 200, ok: true, json: async () => (klucz ? DANE[klucz] : { success: true }) };
  });
}
const zaloguj = (role = 'asm') => { localStorage.setItem('rex_admin_admin_session', JSON.stringify({ role, userName: role === 'asm' ? 'Marta ASM' : 'Kuba Kierownik' })); localStorage.setItem('rex_admin_admin_token', JSON.stringify('tok')); };
const aktywnaZakladka = () => { const bar = document.querySelector('.module-bar-tabs'); return bar ? (bar.querySelector('button.active') || {}).textContent : null; };
const bledyKonsoli = [];

beforeEach(() => { localStorage.clear(); awarie = new Set(); zapytania.length = 0; mockFetch(); location.hash = ''; bledyKonsoli.length = 0; vi.spyOn(console, 'error').mockImplementation((...a) => { const t = a.map(String).join(' '); if (!/act\(|Not implemented|jsdom/.test(t)) bledyKonsoli.push(t); }); window.scrollTo = () => {}; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('powłoka Studio', () => {
  it('1. otwiera każdy moduł ASM z adresu #/obszar/modul; pasek modułów pokazuje aktywne narzędzie; brak błędów renderowania', async () => {
    zaloguj('asm'); location.hash = '#/centrum/pulpit';
    render(<App />);
    await waitFor(() => expect(document.querySelector('.module-bar')).toBeTruthy());
    for (const m of visibleModules('asm')) {
      await act(async () => { location.hash = hashFor(m.id); window.dispatchEvent(new HashChangeEvent('hashchange')); });
      await waitFor(() => expect(aktywnaZakladka()).toContain(m.label));
      expect(document.querySelector('.module-bar-desc').textContent).toBe(m.desc);
    }
    expect(bledyKonsoli).toEqual([]);
  });

  it('2. wyszukiwarka: „actual” → Wykonanie i karty czasu (nie ogólny grafik), strzałki/Enter/Escape, adres się zmienia', async () => {
    zaloguj('asm'); render(<App />);
    const input = await screen.findByLabelText('Szukaj modułu');
    fireEvent.change(input, { target: { value: 'actual' } });
    await waitFor(() => expect(document.querySelector('.search-results button.active strong').textContent).toBe('Wykonanie i karty czasu'));
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(aktywnaZakladka()).toContain('Wykonanie i karty czasu'));
    expect(location.hash).toBe('#/realizacja/wykonanie');
    fireEvent.change(input, { target: { value: 'budzet' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'ArrowUp' }); fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(location.hash).toBe('#/prognozy/koszty-pracy'));
    fireEvent.change(input, { target: { value: 'xxx' } }); fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
  });

  it('3. historia i odświeżenie: stary skrót #/plan otwiera Budżet i koszty, a wstecz wraca do poprzedniego modułu', async () => {
    zaloguj('asm'); location.hash = '#/plan';
    render(<App />);
    await waitFor(() => expect(aktywnaZakladka()).toContain('Koszty pracy'));
    await waitFor(() => expect(location.hash).toBe('#/prognozy/koszty-pracy'));      // adres znormalizowany bez nowego wpisu
    fireEvent.click(within(document.querySelector('aside nav')).getByText('Planowanie').closest('button'));   // obszar → pierwszy moduł: Grafik
    await waitFor(() => expect(location.hash).toBe('#/planowanie/grafik'));
    await act(async () => { location.hash = '#/prognozy/koszty-pracy'; window.dispatchEvent(new PopStateEvent('popstate')); });
    await waitFor(() => expect(aktywnaZakladka()).toContain('Koszty pracy'));
  });

  it('4. ograniczona rola: kierownik zmiany widzi 3 obszary i 4 moduły; adres do budżetu spada na pulpit', async () => {
    zaloguj('kierownik'); location.hash = '#/prognozy/koszty-pracy';
    render(<App />);
    await waitFor(() => expect(document.querySelector('.module-bar')).toBeTruthy());
    expect(location.hash).toBe('#/centrum/pulpit');
    const nav = document.querySelector('aside nav');
    const obszary = within(nav).getAllByRole('button').filter((b) => !b.classList.contains('nav-sub')).map((b) => b.textContent);
    expect(obszary).toEqual(['Centrum pracy', 'Planowanie', 'Realizacja']);
    expect(screen.queryByTitle('Ustawienia i audyt')).toBeNull();
    expect(document.querySelector('.top-actions .notification')).toBeNull();
  });

  it('5. logowanie i wylogowanie: bez sesji ekran logowania; po wylogowaniu sesja usunięta i logowanie wraca', async () => {
    const { unmount } = render(<App />);
    expect(document.querySelector('.module-bar')).toBeNull();
    expect(document.querySelector('input[type="password"], input[autocomplete="current-password"], .stl-login, form')).toBeTruthy();
    unmount(); cleanup();
    zaloguj('asm'); render(<App />);
    await waitFor(() => expect(document.querySelector('.module-bar')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Wyloguj się'));
    await waitFor(() => expect(document.querySelector('.module-bar')).toBeNull());
    expect(localStorage.getItem('rex_admin_admin_session')).toBeNull();
  });

  it('6. telefon: przycisk menu otwiera i zamyka menu boczne (klasa open + scrim)', async () => {
    zaloguj('asm'); render(<App />);
    await waitFor(() => expect(document.querySelector('.module-bar')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Otwórz menu'));
    expect(document.querySelector('aside.sidebar.open')).toBeTruthy();
    fireEvent.click(document.querySelector('.scrim'));
    await waitFor(() => expect(document.querySelector('aside.sidebar.open')).toBeNull());
  });

  it('8. Import POS: Sales Day by Day → podgląd (61 dni, netto) → PUT /sales z basis=net; Daily Operations → profil śróddzienny', async () => {
    zaloguj('asm'); location.hash = '#/administracja/import-eksport';
    render(<App />);
    await waitFor(() => expect(aktywnaZakladka()).toContain('Import i eksport'));
    const input = document.querySelector('input[type="file"][accept=".xlsx,.xlsm,.xls"]');
    const plik = (n) => { const buf = fs.readFileSync(path.join(__dirname, 'fixtures', n)); const f = new File([buf], n, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); f.arrayBuffer = async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); return f; };
    await act(async () => { fireEvent.change(input, { target: { files: [plik('sales-day-by-day.xlsx')] } }); });
    await screen.findByText('Import sprzedaży dziennej z POS');
    expect(screen.getByText('61 / 0')).toBeTruthy();
    expect(screen.getByText(/1 943 138 zł/)).toBeTruthy();
    zapytania.length = 0; const ciala = [];
    const fetchOrig = global.fetch; global.fetch = vi.fn(async (url, opts) => { if (String(url).includes('/sales') && opts && opts.method === 'PUT') ciala.push(JSON.parse(opts.body)); return fetchOrig(url, opts); });
    fireEvent.click(screen.getByText('Importuj 61 dni'));
    await waitFor(() => expect(ciala.length).toBe(1));
    expect(ciala[0].basis).toBe('net'); expect(Object.keys(ciala[0].sales).length).toBe(61); expect(Math.round(ciala[0].sales['2026-08-01'])).toBe(37833); expect(ciala[0].salesGross['2026-08-01']).toBe(41075.17); expect(ciala[0].checks['2026-09-30']).toBe(760);
    await waitFor(() => expect(screen.queryByText('Import sprzedaży dziennej z POS')).toBeNull());
    await act(async () => { fireEvent.change(input, { target: { files: [plik('daily-operations.xlsx')] } }); });
    await screen.findByText('Import profilu śróddziennego z POS');
    expect(screen.getByText('14:30 • 20:00')).toBeTruthy();
    fireEvent.click(screen.getByText('Importuj profil'));
    await waitFor(() => expect(ciala.length).toBe(2));
    expect(ciala[1].intraday.slots['14:30'].sales).toBeGreaterThan(40000); expect(ciala[1].intraday.from).toBe('2026-08-01');
  });

  it('9. Rytm wtorkowy: zaległe dane POS widoczne na Pulpicie z przyciskiem importu; Trafność prognozy pokazuje wybrany model i oba MAPE', async () => {
    DANE['/sales'].swiezosc = { ostatniDzien: '2026-09-30', dniOdOstatniego: 13, nastepnyImport: '2026-10-20', przeterminowane: true, basis: 'net' };
    zaloguj('asm'); location.hash = '#/centrum/pulpit';
    render(<App />);
    await waitFor(() => expect(screen.getByText(/Import wtorkowy zaległy/)).toBeTruthy());
    fireEvent.click(screen.getByText('Import POS'));
    await waitFor(() => expect(location.hash).toBe('#/administracja/import-eksport'));
    expect(screen.getByText('ZALEGŁY')).toBeTruthy();
    await act(async () => { location.hash = '#/analizy/trafnosc-prognozy'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await waitFor(() => expect(screen.getByText(/hybryda \(poziom 7 dni × udział dnia\)/)).toBeTruthy());
    expect(screen.getByText(/hybryda 8,5% vs mediana 12,8%/)).toBeTruthy();
    expect(screen.getByText(/ZALEGŁY — prognoza opiera się na starym poziomie/)).toBeTruthy();
    delete DANE['/sales'].swiezosc;
  });

  it('10. Plan miesiąca: propozycja z historii, korekta > 3 % wymaga uzasadnienia, zapis i zatwierdzenie; P5 pokazuje źródło', async () => {
    zaloguj('asm'); location.hash = '#/prognozy/plan-miesiaca';
    render(<App />);
    await waitFor(() => expect(aktywnaZakladka()).toContain('Plan miesiąca'));
    await screen.findByText('811 259 zł');
    expect(screen.getByText(/−4 %\/tydz\.|-4 %\/tydz\./)).toBeTruthy();
    expect(screen.getByText('Kampania kanapkowa')).toBeTruthy();                         // kalendarz zdarzeń
    expect(screen.getByText('wyuczony (1)')).toBeTruthy();                                // indeks sezonowy uczy się z wykonania
    expect(screen.getByText('849 285 zł')).toBeTruthy();                                  // kalibracja: wykonanie września
    const pola = document.querySelectorAll('aside.forecast-controls input[type="number"]');
    fireEvent.change(pola[0], { target: { value: '700000' } });
    expect(screen.getByText(/względem propozycji — wymaga uzasadnienia/)).toBeTruthy();
    const zapisz = screen.getByText('Zapisz plan roboczy').closest('button');
    expect(zapisz.disabled).toBe(true);
    fireEvent.change(pola[2], { target: { value: '4700' } });                       // godziny AOP = limit
    fireEvent.change(document.querySelector('aside.forecast-controls input[type="text"]'), { target: { value: 'remont galerii' } });
    expect(zapisz.disabled).toBe(false);
    const ciala = []; const fetchOrig = global.fetch;
    global.fetch = vi.fn(async (url, opts) => { if (String(url).includes('/month-plan?action=save')) { ciala.push(JSON.parse(opts.body)); return { status: 200, ok: true, json: async () => ({ success: true, plan: { month: '2026-10', version: 1, status: 'DRAFT', sales: 700000, transactions: 21269, hoursAop: 4700, source: 'manual', reason: 'remont galerii', history: [] } }) }; } return fetchOrig(url, opts); });
    fireEvent.click(zapisz);
    await waitFor(() => expect(ciala.length).toBe(1));
    expect(ciala[0].month).toMatch(/^\d{4}-\d{2}$/); expect(ciala[0]).toMatchObject({ sales: 700000, hoursAop: 4700, source: 'manual', reason: 'remont galerii', expectedVersion: 0 });
    expect(ciala[0].proposal.sales).toBe(811259);
    // P5 bez zatwierdzonego planu ostrzega; z zatwierdzonym — blokuje pola i pokazuje źródło
    await act(async () => { location.hash = '#/prognozy/prognoza-miesiaca'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await screen.findByText('Brak zatwierdzonego Planu miesiąca');
    DANE['/month-plan'] = { ...DANE['/month-plan'], plan: { month: '2026-10', version: 2, status: 'APPROVED', sales: 700000, transactions: 21269, hoursAop: 4700, source: 'manual', history: [] } };
    await act(async () => { location.hash = '#/prognozy/plan-miesiaca'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await act(async () => { location.hash = '#/prognozy/prognoza-miesiaca'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await screen.findByText('Z Planu miesiąca v2');
    expect(screen.getByText(/limit 4700 h AOP/)).toBeTruthy();
    DANE['/month-plan'].plan = null;
  });

  it('11. P0: Model pracy (propozycja do zatwierdzenia, luka PANIEROWANIE Pt widoczna w podglądzie), Kwalifikacje (propozycja z historii ≠ uprawnienie), Autoplan ostrzega bez zatwierdzonego modelu, Grafik pokazuje audyt miesiąca', async () => {
    zaloguj('asm'); location.hash = '#/planowanie/model-pracy';
    render(<App />);
    await waitFor(() => expect(aktywnaZakladka()).toContain('Model pracy'));
    await screen.findByText('propozycja v2 — wymaga zatwierdzenia');
    expect(screen.getByText(/PANIEROWANIE Pt: w ≥ 50 % dni brak obsady 16:00–18:00/)).toBeTruthy();   // uwaga z wyprowadzenia
    const zatw = screen.getByText('Zatwierdź model').closest('button'); expect(zatw.disabled).toBe(false);
    // podgląd piątku: PANIEROWANIE 06–16 i 18–02 → luka 16–18 oznaczona „!”
    fireEvent.click(document.querySelector('.filter-tabs button:nth-child(5)'));
    await waitFor(() => expect(document.querySelectorAll('.forecast-main span[title*="PANIEROWANIE 17:00"]').length).toBe(1));
    expect(document.querySelector('.forecast-main span[title*="PANIEROWANIE 17:00"]').textContent).toBe('!');
    // kwalifikacje
    await act(async () => { location.hash = '#/zespol/kwalifikacje'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await waitFor(() => expect(aktywnaZakladka()).toContain('Kwalifikacje'));
    await screen.findByText('Zatwierdź propozycje (1)');
    const komorki = [...document.querySelectorAll('button[title*="ALA TEST • PANIEROWANIE"]')];
    expect(komorki.length).toBe(1); expect(komorki[0].textContent).toBe('2?');                         // propozycja z historii, niezatwierdzona
    expect(document.querySelector('button[title*="ALA TEST • KONTROLER"]').textContent).toBe('2');
    // autoplan bez zatwierdzonego modelu
    await act(async () => { location.hash = '#/planowanie/autoplan'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await waitFor(() => expect(aktywnaZakladka()).toContain('Automatyczne układanie'));
    await screen.findByText('Brak zatwierdzonego modelu pracy.');
    expect(screen.getAllByText('Sprawdź wykonalność').length).toBeGreaterThan(0);
    // grafik: pasek publikacji pokazuje audyt
    await act(async () => { location.hash = '#/planowanie/grafik'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await waitFor(() => expect(aktywnaZakladka()).toContain('Grafik'));
    const chip = await screen.findByText(/audyt: 1 luk krytycznych • 1 do decyzji/);
    fireEvent.click(chip);
    await screen.findByText(/KANAPKI \/ WRAPY 15:00–18:00: przerwa między zmianami/);
    expect(bledyKonsoli).toEqual([]);
  });

  it('7. Analizy: KPI i CSV z tego samego okresu; awaria KPI dziennych i prognozy pokazuje błąd z ponowieniem', async () => {
    awarie = new Set(['/kpi', '/forecast']);
    zaloguj('asm'); location.hash = '#/analizy/wyniki';
    render(<App />);
    await waitFor(() => expect(aktywnaZakladka()).toContain('Wyniki i produktywność'));
    await waitFor(() => expect(screen.getByText(/Nie udało się pobrać KPI dziennych/)).toBeTruthy());
    expect(screen.getByText('Ponów')).toBeTruthy();
    // filtr miesiąca: dni z grafikiem w okresie = 2, zamknięte 1 → 50 %
    fireEvent.click(screen.getByText('Miesiąc'));
    const pomoc = await screen.findByText('1/2 dni grafiku w okresie');
    expect(pomoc.closest('article, div').textContent).toContain('50%');
    // CSV: przechwycony blob zawiera tylko wybrany miesiąc
    let csv = '';
    global.URL.createObjectURL = vi.fn((blob) => { csv = blob; return 'blob:x'; }); global.URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = vi.fn();
    fireEvent.click(screen.getByText('Eksport CSV'));
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    const blobText = (b) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsText(b); });
    const tekst = await blobText(csv);
    const wiersze = tekst.trim().split('\n');
    expect(wiersze.length).toBe(2); expect(wiersze[1].startsWith('2026-09;21000;')).toBe(true);
    // 12 miesięcy → 13 wierszy
    fireEvent.click(screen.getByText('12 miesięcy')); fireEvent.click(screen.getByText('Eksport CSV'));
    expect((await blobText(csv)).trim().split('\n').length).toBe(13);
    // trafność prognozy: awaria widoczna z ponowieniem
    await act(async () => { location.hash = '#/analizy/trafnosc-prognozy'; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await waitFor(() => expect(screen.getByText(/nie udało się pobrać prognozy/)).toBeTruthy());
    awarie = new Set(['/kpi']);
    fireEvent.click(screen.getByText('ponów'));
    await waitFor(() => expect(screen.queryByText(/nie udało się pobrać prognozy/)).toBeNull());
  });
});
