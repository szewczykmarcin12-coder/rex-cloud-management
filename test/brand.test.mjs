import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stationStyle, STATION_FAMILIES, stationTone, STATION_ACCENT as STATION_ACCENT_TEST } from '../src/lib/stations.js';

// Regresja marki Atmosphere (audyt 12.10): jeden system kolorów, brak różowo-beżowych pozostałości,
// brak nazw ORDO / WorkRhythm i angielskich etykiet w interfejsie, brak atrap, poprawne gradienty.
// fileURLToPath: na Windows URL.pathname daje „/C:/…” i „%20” — taka ścieżka nie otwiera plików
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HUB = fileURLToPath(new URL('../../rex-cloud-app/', import.meta.url));
const walk = (dir, exts, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (!/node_modules|dist|fixtures/.test(f)) walk(p, exts, out); } else if (exts.some((e) => f.endsWith(e))) out.push(p); } return out; };
const src = (p) => readFileSync(p, 'utf-8');
const warm = (hex) => { const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16); return r - b >= 3 && r > g; };
const BRAND = new Set(['F3BF9F', 'F0DFA3', 'F8F1D2', 'C9B45E', 'FBF4E5', '886929', 'FAE9ED', 'A94455', 'FBF1DC', 'E9E4F4', '9C92BC', 'BDB2E5', '8B7FAE', '5C5124', '3E3760', 'D9A066', '407362', 'E8F3EE', 'A5D8C5', '7FBFA6', '9CCBF0', 'BAC9DC', 'FFF2E8']);

describe('Atmosphere — jeden system kolorów', () => {
  it('tokeny ładują się jako pierwsze w obu aplikacjach, a zmienne semantyczne wskazują na tokeny (sukces ≠ ostrzeżenie ≠ błąd ≠ akcja)', () => {
    expect(src(join(ROOT, 'src/main.jsx')).indexOf("atmosphere-tokens.css")).toBeLessThan(src(join(ROOT, 'src/main.jsx')).indexOf('ordo-studio.css'));
    expect(src(join(HUB, 'src/main.jsx')).indexOf("atmosphere-tokens.css")).toBeLessThan(src(join(HUB, 'src/main.jsx')).indexOf('ordo-hub.css'));
    for (const f of [join(ROOT, 'src/ordo-studio.css'), join(HUB, 'src/ordo-hub.css')]) {
      const s = src(f);
      expect(s).toMatch(/--mint: var\(--at-status-success-text\)/);
      expect(s).toMatch(/--coral: var\(--at-status-danger-text\)/);
      expect(s).toMatch(/--amber: var\(--at-status-warning-text\)/);
      expect(s).toMatch(/--blue: var\(--at-brand-primary\)/);
      expect(s).not.toMatch(/--mint: #65717C|--coral: #2674B8|--gold-soft: #f3e8eb/i);
    }
    const tok = src(join(ROOT, 'src/atmosphere-tokens.css'));
    expect(tok).toContain('--at-brand-primary: #2674B8');
    expect(src(join(HUB, 'src/atmosphere-tokens.css'))).toBe(tok);
  });
  it('żadnych różowo-beżowych kolorów poza paletą Brand Kitu (CSS i komponenty obu aplikacji)', () => {
    const files = [...walk(join(ROOT, 'src'), ['.css', '.jsx', '.js']), ...walk(join(HUB, 'src'), ['.css', '.jsx', '.js'])];
    const zle = [];
    for (const f of files) { for (const m of src(f).matchAll(/#([0-9a-fA-F]{6})\b/g)) { const h = m[1].toUpperCase(); if (warm(h) && !BRAND.has(h)) zle.push(`${f.split(/[\\/]src[\\/]/)[1]}: #${h}`); } }
    expect(zle.slice(0, 20)).toEqual([]);
  });
  it('„OK” i „ostrzeżenie” nie dzielą tego samego błękitu; sukces jest zielony, ostrzeżenie bursztynowe, błąd czerwony', () => {
    const mf = src(join(ROOT, 'src/MonthlyForecast.jsx'));
    expect(mf).toMatch(/ok: '#407362', warn: '#886929', bad: '#A94455'/);
    const ov = src(join(ROOT, 'src/ordo-overrides.css'));
    expect(ov).toMatch(/\.metric-icon\.mint[^{]*\{ color: var\(--at-status-success-text\)/);
    expect(ov).toMatch(/\.metric-icon\.amber[^{]*\{ color: var\(--at-status-warning-text\)/);
    expect(ov).toMatch(/\.metric-icon\.coral[^{]*\{ color: var\(--at-status-danger-text\)/);
    expect(src(join(ROOT, 'src/ui/primitives.jsx'))).toMatch(/success: '#407362'/);
  });
  it('stanowiska: jedno przypisanie do pastelowych rodzin (Studio, Hub, PDF, wydruk) z grafitowym tekstem', () => {
    expect(src(join(HUB, 'src/stations.js'))).toBe(src(join(ROOT, 'src/lib/stations.js')));
    expect(stationStyle('PANIEROWANIE').fill).toBe(STATION_FAMILIES.production.fill);
    expect(stationStyle('MANAGER').tone).toBe('deep'); expect(stationTone('KONTROLER')).toBe('mid'); expect(stationTone('PREP')).toBe('outline'); expect(stationTone('SMAŻENIE')).toBe('soft');
    expect(stationStyle('KANAPKI / WRAPY').text).toBe('#292D32');
    expect(src(join(ROOT, 'src/generatePDF.js'))).toContain("import { stationRgb } from './lib/stations.js'");
    expect(src(join(ROOT, 'src/generatePDF.js'))).not.toMatch(/const KOLORY = \{/);
    const ov = src(join(ROOT, 'src/ordo-overrides.css'));
    expect(ov).toMatch(/\.opv3 \.deep \{ color: #3E3760; border-color: var\(--at-station-lead-accent\); background: var\(--at-station-lead-fill\); \}/);
    expect(src(join(ROOT, 'src/App.jsx'))).toMatch(/const toneZm = \(st2\) => stationTone\(st2\)/);
  });
});

describe('Atmosphere — nazewnictwo, atrapy, uszkodzone style', () => {
  const ui = [...walk(join(ROOT, 'src'), ['.jsx']), join(ROOT, 'src/generatePDF.js'), join(ROOT, 'src/navigation.js'), join(HUB, 'src/main.jsx')];
  const bezKomentarzy = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  it('brak „ORDO” i „WorkRhythm” w tekstach widocznych dla użytkownika oraz w nazwach pobieranych plików', () => {
    const zle = [];
    for (const f of ui) { const s = bezKomentarzy(src(f)); for (const m of s.matchAll(/(ORDO Forecast|liczy ORDO|odbić ORDO|WORKRHYTHM PLANNING|WORKRHYTHM · |`ordo-(?!print)[a-z]|'ordo-[a-z]+-\$)/g)) zle.push(`${f.split(/[\\/]src[\\/]/)[1]}: ${m[1]}`); }
    expect(zle).toEqual([]);
  });
  it('etykiety modułu obsady po polsku (Godziny wymagane, Niedobór, Ocena grafiku, Zapotrzebowanie a obsada)', () => {
    const s = src(join(ROOT, 'src/views/Staffing.jsx'));
    for (const t of ['Godziny wymagane', 'Niedobór', 'Ocena grafiku', 'Zapotrzebowanie a obsada', 'Mapa pokrycia']) expect(s).toContain(t);
    for (const t of ['"Required Hours"', '"Deficit"', '"Schedule Score"', 'Demand vs Coverage', "'Published'", "'Preliminary'"]) expect(s).not.toContain(t);
  });
  it('brak pasków z wartością na stałe (72 %, 62 %) i stałej „Gotowości stacji 100%”; puls bez danych pokazuje „brak danych”', () => {
    const app = src(join(ROOT, 'src/App.jsx'));
    expect(app).not.toMatch(/progress=\{\s*\d+\s*\}/);
    expect(src(join(ROOT, 'src/ui/primitives.jsx'))).not.toContain("width: '62%'");
    expect(app).not.toContain('Gotowość stacji');
    expect(app).toMatch(/score == null \? 'brak danych'/);
    expect(src(join(ROOT, 'src/views/Analytics.jsx'))).not.toContain('Wzrost przy malejącym udziale kosztu');
  });
  it('żadnych uszkodzonych definicji gradientów (repeating-#…) w komponentach i arkuszach', () => {
    const files = [...walk(join(ROOT, 'src'), ['.css', '.jsx']), ...walk(join(HUB, 'src'), ['.css', '.jsx'])];
    const zle = files.filter((f) => /repeating-#|linear-#|radial-#/.test(src(f))).map((f) => f.split(/[\\/]src[\\/]/)[1]);
    expect(zle).toEqual([]);
  });
  it('etapy tygodnia po polsku (W układaniu / Ukończony / Zatwierdzony / Zamknięty), okno dyspozycji w błękicie, chip zgodności z pastelowym tłem', () => {
    const app = src(join(ROOT, 'src/App.jsx'));
    expect(app).toContain("STAGE_PL = { 'In progress': 'W układaniu', Completed: 'Ukończony', Reviewed: 'Zatwierdzony', Closed: 'Zamknięty' }");
    expect(app).toContain('<span>UKOŃCZONY</span><span>ZATWIERDZONY</span><span>ZAMKNIĘTY</span>');
    expect(app).not.toMatch(/<strong>Completed<\/strong>|<strong>Reviewed<\/strong>|<strong>Closed<\/strong>/);
    expect(src(join(ROOT, 'src/ordo-views.css'))).toMatch(/\.dyspo-tag\.win \{ color:#2B4A5F;background:#DCEBF5/);
    expect(app).toMatch(/background: '#FAE9ED', color: '#A94455' \} : zgod\.summary\.warn/);
  });
  it('wydruk dnia: strefa bezpieczeństwa 5 mm (treść 287 × 200 mm), jedna strona', () => {
    const ov = src(join(ROOT, 'src/ordo-overrides.css'));
    expect(ov).toMatch(/@page \{ size: A4 landscape; margin: 5mm; \}/);
    expect(ov).toMatch(/\.ordo-print-page, \.ordo-print-page\.opv3 \{ width: 287mm !important; height: 200mm !important/);
  });
  it('statusy wynikają z danych: 0 % / brak danych nie są zielone, pusty grafik „nieoceniony”, wydruk bez klasy „outline” i ze statusem publikacji w nagłówku', () => {
    const an = src(join(ROOT, 'src/views/Analytics.jsx')); const app = src(join(ROOT, 'src/App.jsx')); const st = src(join(ROOT, 'src/views/Staffing.jsx')); const pr = src(join(ROOT, 'src/DailyRosterPrint.jsx'));
    expect(an).toMatch(/tone=\{!dniZmian \? 'blue' : zgodnosc >= 100 \? 'mint' : zgodnosc >= 80 \? 'amber' : 'coral'\}/);
    expect(an).toMatch(/\{dniZmian \? `\$\{zgodnosc\}%` : 'brak danych'\}/);
    expect(app).toMatch(/akcja: !\(sw && sw\.ostatniDzien\) \? 'Zaimportuj'/);
    expect(app).toMatch(/!dzienne\.length && popytH > 0 \? 'WYSOKIE'/);
    expect(st).toMatch(/const score = plan <= 0 \? null/);
    expect(st).toContain("val={kpi.score == null ? 'nieoceniony'");
    expect(pr).not.toMatch(/opv3-(chip|bar) \$\{s\.tone \|\| 'mid'\}/);
    expect(pr).not.toMatch(/WORKFORCE|DOKUMENT DNIA|<span>LOKAL<\/span>|opv3-status/);   // wydruk bez zbędnych napisów nad danymi
    expect(src(join(ROOT, 'src/ordo-overrides.css'))).not.toMatch(/\.opv3 \.outline|\.opv3-bar\.outline/);
    expect(src(join(ROOT, 'src/lib/domain.js'))).toMatch(/umowaLabel = /);
  });
  it('dyspozycje w jednej semantyce (dostępny zieleń, niedostępny neutralny, częściowo bursztyn, okno błękit); akcenty stanowisk tylko z rodzin', () => {
    const ov = src(join(ROOT, 'src/ordo-overrides.css'));
    expect(ov).toMatch(/\.dyspo-tag\.win, \.dy-kal-day\.win \{ color: var\(--at-brand-primary\)/);
    expect(ov).toMatch(/\.dyspo-tag\.no, \.dy-kal-day\.no \{ color: var\(--at-ui-text-secondary\); background: var\(--at-ui-disabled-bg\)/);
    expect(Object.keys(STATION_ACCENT_TEST).length).toBe(0);
    expect(new Set(['MANAGER', 'KONTROLER', 'KANAPKI / WRAPY', 'PREP', 'SZKOLENIA'].map((st) => stationStyle(st).accent)).size).toBe(5);
    expect(src(join(ROOT, 'src/views/WorkModel.jsx'))).toContain('className="wm-dict-toggles"');
  });
  it('stacje na żywo, tabela zespołu i pola dat: stacja obsadzona = błękit (nie sukces), przyciski drugorzędne bez bordo, login neutralny, kolumna akcji stała', () => {
    const ov = src(join(ROOT, 'src/ordo-overrides.css')); const app = src(join(ROOT, 'src/App.jsx'));
    expect(ov).toMatch(/\.station-card\.mint \{ border-top-color: var\(--at-brand-primary\)/);
    expect(ov).toMatch(/\.mini-avatars i \{ color: var\(--at-brand-primary\)/);
    expect(ov).toMatch(/\.fix-button \{ color: var\(--at-ui-text\); border: 1px solid var\(--at-ui-input-border\)/);
    expect(ov).toMatch(/\.team-head, \.team-row \{ grid-template-columns: minmax\(180px, 1\.4fr\) \.8fr 1fr \.55fr minmax\(150px, 1\.3fr\) \.75fr 168px/);
    expect(ov).toMatch(/\.number-input input \{ min-width: 0; width: 100%/);
    expect(app).not.toContain('Obsada pełna');
    expect(app).toContain('<span>Login</span><span>Akcje</span>');
  });
  it('nagłówek i treść w tej samej kolumnie (Zamiany, Wydruki, Ustawienia), kicker modułu zamiast „ATMOSPHERE STUDIO” z kropką; świeże dane POS znikają same', () => {
    const app = src(join(ROOT, 'src/App.jsx'));
    expect(app).not.toMatch(/className="flex-1 p-8/);
    expect(app).toContain('<Header kicker="ZESPÓŁ • ZAMIANY I NIEOBECNOŚCI"');
    expect(src(join(ROOT, 'src/ui/primitives.jsx'))).not.toContain('<span className="status-pulse" />');
    expect(app).toMatch(/setTimeout\(\(\) => setWidoczny\(false\), 6000\)/);
    expect(app).not.toMatch(/background: stale \? undefined : '#f3f7f4'/);
  });
  it('logo Studio w menu ma pełną szerokość (nie 168 px), a hierarchia nagłówków jest jedna (24 px h1 modułu)', () => {
    const ov = src(join(ROOT, 'src/ordo-overrides.css'));
    expect(ov).not.toMatch(/\.brand-logo \{ width: 168px/);
    expect(ov).toMatch(/\.brand-lockup \.brand-logo \{ width: 100%; max-width: 218px/);
    expect(ov).toMatch(/\.module-heading h1, \.page-heading h1[^{]*\{ font-size: 24px !important/);
    expect(src(join(ROOT, 'src/views/Staffing.jsx'))).not.toContain('text-[30px]');
  });
});
