// ═══════════════════════════════════════════════════════════════════════════════
//  Katalog nawigacji ORDO Workforce Studio — jedno źródło prawdy dla:
//  menu bocznego (obszary), poziomego paska (moduły), wyszukiwarki, adresów #/obszar/modul,
//  starszych skrótów (plan, forecast, schedule, actual, …) i widoczności według roli.
//  Plik nie importuje Reacta ani ikon — jest testowalny w Node (test/navigation.test.mjs).
// ═══════════════════════════════════════════════════════════════════════════════

export const AREAS = [
  { id: 'centrum', label: 'Centrum pracy', icon: 'LayoutDashboard', hint: 'Rozpoczęcie dnia i przejście do bieżących zadań' },
  { id: 'prognozy', label: 'Prognozy i estymacja', icon: 'TrendingUp', hint: 'Przewidywanie sprzedaży, dobór godzin i wycena planu' },
  { id: 'planowanie', label: 'Planowanie', icon: 'Calendar', hint: 'Przełożenie założeń na konkretne zmiany pracowników' },
  { id: 'realizacja', label: 'Realizacja', icon: 'Activity', hint: 'Kontrola dnia, odbić, korekt i zamknięć' },
  { id: 'analizy', label: 'Analizy i raporty', icon: 'Gauge', hint: 'Ocena wyniku i przygotowanie raportów' },
  { id: 'zespol', label: 'Zespół', icon: 'Users', hint: 'Dostępność zespołu i decyzje o wnioskach' },
  { id: 'administracja', label: 'Administracja', icon: 'Settings', hint: 'Wymiana danych i konfiguracja' },
];

// view: który komponent renderuje moduł; wr: zakładka WorkingTime (grafik/wykonanie/obecność/szablony/cykle)
// roles: kto widzi moduł. legacy: dawne identyfikatory stron i skróty (#/plan, #/forecast, zakładki PlanFinanse).
export const MODULES = [
  { id: 'pulpit', area: 'centrum', label: 'Pulpit', icon: 'LayoutDashboard', view: 'dashboard', roles: ['asm', 'kierownik'],
    desc: 'Dzisiejsza obsada, oczekujące decyzje i skróty do najczęstszych zadań.',
    legacy: ['dashboard', 'home', 'start'], aliases: ['dashboard', 'start', 'strona główna', 'dziś'] },

  { id: 'prognoza-miesiaca', area: 'prognozy', label: 'Prognoza miesiąca', icon: 'TrendingUp', view: 'monthly-forecast', roles: ['asm'],
    desc: 'Miesięczny plan sprzedaży i transakcji, rozkład na dni, role, godziny, limit COL, korekty i blokada wersji.',
    legacy: ['forecast', 'forecast-col', 'aop'], aliases: ['forecast', 'AOP', 'COL', 'plan miesiąca', 'prognoza', 'sprzedaż planowana', 'wersja prognozy'] },
  { id: 'model-popytu', area: 'prognozy', label: 'Model popytu', icon: 'Zap', view: 'demand-model', roles: ['asm'],
    desc: 'Historia sprzedaży, sezonowość, krzywa dnia, parametry SPLH i symulacja szablonów zmian.',
    legacy: ['optymalizacja', 'opty', 'popyt', 'demand'], aliases: ['popyt', 'optymalizacja dzienna', 'SPLH', 'krzywa dnia', 'sezonowość', 'import sprzedaży', 'symulacja'] },
  { id: 'budzet', area: 'prognozy', label: 'Budżet i koszty', icon: 'CircleDollarSign', view: 'budget', roles: ['asm'],
    desc: 'Stawki, narzuty, parametry kosztowe, scenariusz budżetu i porównania z planem.',
    legacy: ['plan', 'budzet', 'budget', 'koszty'], aliases: ['budżet', 'koszty', 'rozliczenie kosztów', 'stawki', 'ZUS', 'narzuty', 'scenariusz'] },

  { id: 'grafik', area: 'planowanie', label: 'Grafik', icon: 'Calendar', view: 'wt', wr: 'schedule', roles: ['asm', 'kierownik'],
    desc: 'Tygodnie, siatka dnia, publikacja z bramką reguł czasu pracy. Dawniej: Schedule.',
    legacy: ['wt', 'schedule', 'wr-schedule', 'scheduling', 'rota'], aliases: ['schedule', 'grafik tygodniowy', 'siatka dnia', 'publikacja', 'zmiany', 'rota', 'tydzień'] },
  { id: 'obsada', area: 'planowanie', label: 'Zapotrzebowanie i obsada', icon: 'LayoutGrid', view: 'staffing', roles: ['asm'],
    desc: 'Porównanie popytu z grafikiem, luki pokrycia, propozycje i ręczne dopisywanie zmian.',
    legacy: ['obsada', 'staffing', 'planowanie-obsady'], aliases: ['obsada', 'zapotrzebowanie', 'pokrycie', 'luki', 'planowanie obsady', 'coverage'] },
  { id: 'autoplan', area: 'planowanie', label: 'Automatyczne układanie', icon: 'Bot', view: 'autoplan', roles: ['asm'],
    desc: 'Propozycja zmian z AOP, historii, wymaganych stanowisk i dostępności. Zastosowanie uzupełnia wersję roboczą; publikacja osobno.',
    legacy: ['autoplan', 'auto'], aliases: ['autoplan', 'automat', 'AOP', 'propozycja grafiku', 'algorytm', 'ułóż grafik'] },
  { id: 'szablony', area: 'planowanie', label: 'Szablony', icon: 'BookOpen', view: 'wt', wr: 'blueprints', roles: ['asm'],
    desc: 'Wzorce tygodnia i dnia do szybkiego wypełnienia grafiku. Dawniej: Blueprints.',
    legacy: ['blueprints', 'wr-blueprints', 'wzorce'], aliases: ['blueprints', 'wzorce', 'szablon tygodnia', 'templates'] },
  { id: 'cykle', area: 'planowanie', label: 'Cykle i rotacje', icon: 'TimerReset', view: 'wt', wr: 'cycles', roles: ['asm'],
    desc: 'Powtarzalne rotacje zmian dla osób i grup. Dawniej: ShiftCycles.',
    legacy: ['cycles', 'wr-cycles', 'shiftcycles', 'rotacje'], aliases: ['shiftcycles', 'rotacje', 'cykle zmian', 'powtarzalne'] },
  { id: 'limity', area: 'planowanie', label: 'Limity godzin', icon: 'Clock3', view: 'limits', roles: ['asm'],
    desc: 'Plan godzin miesiąca, ręczne godziny MGR i MGR funkcyjnych, porównanie z grafikiem.',
    legacy: ['limity', 'limits', 'planowanie-godzin'], aliases: ['limity', 'godziny miesiąca', 'plan godzin', 'MGR', 'nadgodziny'] },

  { id: 'obsada-live', area: 'realizacja', label: 'Obsada na żywo', icon: 'Activity', view: 'live', live: true, roles: ['asm'],
    desc: 'Kto jest teraz na zmianie, kto się spóźnia, pokrycie bieżącej godziny.',
    legacy: ['live', 'obsada-live'], aliases: ['live', 'teraz', 'na żywo', 'kto pracuje', 'obsada dnia'] },
  { id: 'wykonanie', area: 'realizacja', label: 'Wykonanie i karty czasu', icon: 'CheckCircle2', view: 'wt', wr: 'actual', roles: ['asm', 'kierownik'],
    desc: 'Odbicia, korekty, przerwy i zamknięcia dni. Dawniej: Actual.',
    legacy: ['actual', 'wr-actual', 'working-time', 'karty'], aliases: ['actual', 'karty czasu', 'wykonanie', 'odbicia', 'korekty', 'zamknięcie dnia', 'completed'] },
  { id: 'obecnosc', area: 'realizacja', label: 'Rejestr obecności', icon: 'Clock', view: 'wt', wr: 'tna', live: true, roles: ['asm', 'kierownik'],
    desc: 'Terminale, odbicia na żywo i lista obecnych. Dawniej: Time & Attendance.',
    legacy: ['tna', 'wr-tna', 'time-attendance', 'attendance'], aliases: ['time & attendance', 'T&A', 'obecność', 'terminal', 'odbicia', 'RCP'] },

  { id: 'wyniki', area: 'analizy', label: 'Wyniki i produktywność', icon: 'Gauge', view: 'analytics', roles: ['asm'],
    desc: 'COL, SPLH, struktura godzin, kompletność danych i snapshoty dzienne — na wybrany miesiąc lub 12 miesięcy.',
    legacy: ['analytics', 'analityka', 'raporty'], aliases: ['analityka', 'raport', 'COL', 'SPLH', 'produktywność', 'KPI', 'wyniki', 'koszt pracy'] },
  { id: 'trafnosc-prognozy', area: 'analizy', label: 'Trafność prognozy', icon: 'ShieldCheck', view: 'forecast-quality', roles: ['asm'],
    desc: 'Porównanie prognozy sprzedaży z wykonaniem: błąd, odchylenie, dni poza tolerancją.',
    legacy: ['forecast-quality', 'jakosc-prognozy'], aliases: ['trafność', 'jakość prognozy', 'błąd prognozy', 'MAPE', 'odchylenie'] },
  { id: 'wydruki', area: 'analizy', label: 'Wydruki i PDF', icon: 'Printer', view: 'print', roles: ['asm'],
    desc: 'Karta dnia A4, zakres dni do PDF, matryca zmian.',
    legacy: ['print', 'wydruk', 'pdf'], aliases: ['wydruk', 'PDF', 'drukuj', 'karta dnia', 'matryca'] },

  { id: 'pracownicy', area: 'zespol', label: 'Pracownicy', icon: 'Users', view: 'employees', roles: ['asm'],
    desc: 'Konta, umowy, stawki, aliasy z grafiku, PIN-y i uprawnienia.',
    legacy: ['emps', 'employees', 'konta'], aliases: ['pracownicy', 'konta', 'umowy', 'stawki', 'PIN', 'aliasy', 'zespół'] },
  { id: 'dyspozycje', area: 'zespol', label: 'Dyspozycyjność i wnioski', icon: 'CalendarCheck2', view: 'availability', roles: ['asm'],
    desc: 'Dyspozycje pracowników, okno zgłoszeń, zbiorcza akceptacja, kto z crew nie podał dyspozycji.',
    legacy: ['dyspo', 'availability', 'dyspozycyjnosc'], aliases: ['dyspozycje', 'dyspozycyjność', 'dostępność', 'okno dyspozycji', 'wnioski'] },
  { id: 'zamiany', area: 'zespol', label: 'Zamiany i nieobecności', icon: 'RefreshCw', view: 'swaps', badge: 'pending', roles: ['asm'],
    desc: 'Giełda zamian, urlopy i nieobecności do decyzji.',
    legacy: ['swaps', 'zamiany', 'absences', 'nieobecnosci'], aliases: ['zamiany', 'giełda', 'nieobecności', 'urlop', 'L4', 'wnioski', 'decyzje'] },

  { id: 'import-eksport', area: 'administracja', label: 'Import i eksport', icon: 'Upload', view: 'import', roles: ['asm'],
    desc: 'Import grafików i sprzedaży, eksport do systemu docelowego (GO), dyspozycje w układzie poziomym.',
    legacy: ['import', 'export', 'eksport'], aliases: ['import', 'eksport', 'XLSX', 'GO', 'układ poziomy', 'CSV', 'sprzedaż godzinowa'] },
  { id: 'ustawienia', area: 'administracja', label: 'Ustawienia i audyt', icon: 'Settings', view: 'settings', roles: ['asm'],
    desc: 'Jednostka, terminale, okno dyspozycji, dziennik audytu.',
    legacy: ['settings', 'ustawienia', 'audyt', 'audit'], aliases: ['ustawienia', 'audyt', 'dziennik', 'terminale', 'jednostka', 'konfiguracja'] },
];

export const DEFAULT_MODULE = 'pulpit';
const byId = new Map(MODULES.map((m) => [m.id, m]));
const byLegacy = new Map(MODULES.flatMap((m) => [[m.id, m], ...(m.legacy || []).map((l) => [l, m])]));

export const getModule = (id) => byId.get(id) || null;
export const getArea = (id) => AREAS.find((a) => a.id === id) || null;
export const modulesOfArea = (areaId, role) => MODULES.filter((m) => m.area === areaId && canSee(m, role));
export const canSee = (m, role) => !!m && (m.roles || []).includes(role || 'kierownik');
export const visibleAreas = (role) => AREAS.filter((a) => modulesOfArea(a.id, role).length > 0);
export const visibleModules = (role) => MODULES.filter((m) => canSee(m, role));

// Starsze skróty i zakładki → identyfikator modułu. Nieznane → null.
export function resolveLegacy(id) {
  if (!id) return null;
  const k = String(id).trim().toLowerCase().replace(/^#?\/?/, '');
  return (byLegacy.get(k) || byLegacy.get(k.split('/').pop()) || null)?.id || null;
}

// Moduł → zakładka WorkingTime i z powrotem (Grafik / Wykonanie / Obecność / Szablony / Cykle)
export const moduleForWrTab = (wr) => (MODULES.find((m) => m.view === 'wt' && m.wr === wr) || {}).id || 'grafik';

// ── Adresy #/obszar/modul ──
export const hashFor = (moduleId) => { const m = byId.get(moduleId); return m ? `#/${m.area}/${m.id}` : `#/`; };
export function parseHash(hash) {
  const h = String(hash || '').replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!h) return null;
  const parts = h.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (byId.has(last)) return last;                 // #/planowanie/grafik lub #/grafik
  return resolveLegacy(last) || resolveLegacy(parts[0]);
}
// Rola nie widzi modułu → pierwszy dozwolony (pulpit)
export const clampToRole = (moduleId, role) => (canSee(byId.get(moduleId), role) ? moduleId : (visibleModules(role)[0] || {}).id || DEFAULT_MODULE);

// ── Wyszukiwanie: bez rozróżniania wielkości liter i znaków diakrytycznych ──
export const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9&\s]/g, ' ').replace(/\s+/g, ' ').trim();
export function searchModules(query, role, limit = 8) {
  const q = fold(query);
  if (!q) return [];
  const slowa = q.split(' ').filter(Boolean);
  const wyniki = [];
  for (const m of visibleModules(role)) {
    const area = getArea(m.area);
    const label = fold(m.label), aliases = (m.aliases || []).map(fold), desc = fold(m.desc), areaL = fold(area ? area.label : '');
    let score = 0;
    if (label === q) score += 100;
    else if (label.startsWith(q)) score += 60;
    else if (label.includes(q)) score += 40;
    if (aliases.some((a) => a === q)) score += 55;
    else if (aliases.some((a) => a.startsWith(q))) score += 35;
    else if (aliases.some((a) => a.includes(q))) score += 25;
    if ((m.legacy || []).some((l) => fold(l) === q)) score += 50;
    // wszystkie słowa zapytania gdzieś występują
    const wszystkie = slowa.every((w) => label.includes(w) || aliases.some((a) => a.includes(w)) || desc.includes(w) || areaL.includes(w));
    if (wszystkie) score += 15 + slowa.length * 3;
    else { const tokeny = [label, ...aliases].flatMap((t) => t.split(' ')); if (slowa.some((w) => w.length >= 3 && tokeny.some((t) => t.startsWith(w)))) score += 8; }   // częściowe: początek słowa, nie środek
    if (score > 0) wyniki.push({ module: m, area, score });
  }
  return wyniki.sort((a, b) => b.score - a.score || a.module.label.localeCompare(b.module.label, 'pl')).slice(0, limit);
}
