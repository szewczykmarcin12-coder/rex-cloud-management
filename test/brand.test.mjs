import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stationStyle, STATION_FAMILIES, stationTone } from '../src/lib/stations.js';

// Regresja marki Atmosphere (audyt 12.10): jeden system kolorów, brak różowo-beżowych pozostałości,
// brak nazw ORDO / WorkRhythm i angielskich etykiet w interfejsie, brak atrap, poprawne gradienty.
const ROOT = new URL('../', import.meta.url).pathname;
const HUB = new URL('../../rex-cloud-app/', import.meta.url).pathname;
const walk = (dir, exts, out = []) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) { if (!/node_modules|dist|fixtures/.test(f)) walk(p, exts, out); } else if (exts.some((e) => f.endsWith(e))) out.push(p); } return out; };
const src = (p) => readFileSync(p, 'utf-8');
const warm = (hex) => { const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16); return r - b >= 5 && r >= g; };
const BRAND = new Set(['F3BF9F', 'F0DFA3', 'F8F1D2', 'C9B45E', 'FBF4E5', '886929', 'FAE9ED', 'A94455', 'FBF1DC', 'E9E4F4', '9C92BC', 'BDB2E5', '8B7FAE', '5C5124', '3E3760', 'D9A066', '407362', 'E8F3EE', 'A5D8C5', '7FBFA6', '9CCBF0', 'BAC9DC', 'FFF2E8']);

describe('Atmosphere — jeden system kolorów', () => {
  it('tokeny ładują się jako pierwsze w obu aplikacjach, a zmienne semantyczne wskazują na tokeny (sukces ≠ ostrzeżenie ≠ błąd ≠ akcja)', () => {
    expect(src(ROOT + 'src/main.jsx').indexOf("atmosphere-tokens.css")).toBeLessThan(src(ROOT + 'src/main.jsx').indexOf('ordo-studio.css'));
    expect(src(HUB + 'src/main.jsx').indexOf("atmosphere-tokens.css")).toBeLessThan(src(HUB + 'src/main.jsx').indexOf('ordo-hub.css'));
    for (const f of [ROOT + 'src/ordo-studio.css', HUB + 'src/ordo-hub.css']) {
      const s = src(f);
      expect(s).toMatch(/--mint: var\(--at-status-success-text\)/);
      expect(s).toMatch(/--coral: var\(--at-status-danger-text\)/);
      expect(s).toMatch(/--amber: var\(--at-status-warning-text\)/);
      expect(s).toMatch(/--blue: var\(--at-brand-primary\)/);
      expect(s).not.toMatch(/--mint: #65717C|--coral: #2674B8|--gold-soft: #f3e8eb/i);
    }
    const tok = src(ROOT + 'src/atmosphere-tokens.css');
    expect(tok).toContain('--at-brand-primary: #2674B8');
    expect(src(HUB + 'src/atmosphere-tokens.css')).toBe(tok);
  });
  it('żadnych różowo-beżowych kolorów poza paletą Brand Kitu (CSS i komponenty obu aplikacji)', () => {
    const files = [...walk(ROOT + 'src', ['.css', '.jsx', '.js']), ...walk(HUB + 'src', ['.css', '.jsx', '.js'])];
    const zle = [];
    for (const f of files) { for (const m of src(f).matchAll(/#([0-9a-fA-F]{6})\b/g)) { const h = m[1].toUpperCase(); if (warm(h) && !BRAND.has(h)) zle.push(`${f.split('/src/')[1]}: #${h}`); } }
    expect(zle.slice(0, 20)).toEqual([]);
  });
  it('„OK” i „ostrzeżenie” nie dzielą tego samego błękitu; sukces jest zielony, ostrzeżenie bursztynowe, błąd czerwony', () => {
    const mf = src(ROOT + 'src/MonthlyForecast.jsx');
    expect(mf).toMatch(/ok: '#407362', warn: '#886929', bad: '#A94455'/);
    const ov = src(ROOT + 'src/ordo-overrides.css');
    expect(ov).toMatch(/\.metric-icon\.mint[^{]*\{ color: var\(--at-status-success-text\)/);
    expect(ov).toMatch(/\.metric-icon\.amber[^{]*\{ color: var\(--at-status-warning-text\)/);
    expect(ov).toMatch(/\.metric-icon\.coral[^{]*\{ color: var\(--at-status-danger-text\)/);
    expect(src(ROOT + 'src/ui/primitives.jsx')).toMatch(/success: '#407362'/);
  });
  it('stanowiska: jedno przypisanie do pastelowych rodzin (Studio, Hub, PDF, wydruk) z grafitowym tekstem', () => {
    expect(src(HUB + 'src/stations.js')).toBe(src(ROOT + 'src/lib/stations.js'));
    expect(stationStyle('PANIEROWANIE').fill).toBe(STATION_FAMILIES.production.fill);
    expect(stationStyle('MANAGER').tone).toBe('deep'); expect(stationTone('KONTROLER')).toBe('mid'); expect(stationTone('PREP')).toBe('outline'); expect(stationTone('SMAŻENIE')).toBe('soft');
    expect(stationStyle('KANAPKI / WRAPY').text).toBe('#292D32');
    expect(src(ROOT + 'src/generatePDF.js')).toContain("import { stationRgb } from './lib/stations.js'");
    expect(src(ROOT + 'src/generatePDF.js')).not.toMatch(/const KOLORY = \{/);
    const ov = src(ROOT + 'src/ordo-overrides.css');
    expect(ov).toMatch(/\.opv3 \.deep \{ color: #3E3760; border-color: #9C92BC; background: #E9E4F4; \}/);
    expect(src(ROOT + 'src/App.jsx')).toMatch(/const toneZm = \(st2\) => stationTone\(st2\)/);
  });
});

describe('Atmosphere — nazewnictwo, atrapy, uszkodzone style', () => {
  const ui = [...walk(ROOT + 'src', ['.jsx']), ROOT + 'src/generatePDF.js', ROOT + 'src/navigation.js', HUB + 'src/main.jsx'];
  const bezKomentarzy = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  it('brak „ORDO” i „WorkRhythm” w tekstach widocznych dla użytkownika oraz w nazwach pobieranych plików', () => {
    const zle = [];
    for (const f of ui) { const s = bezKomentarzy(src(f)); for (const m of s.matchAll(/(ORDO Forecast|liczy ORDO|odbić ORDO|WORKRHYTHM PLANNING|WORKRHYTHM · |`ordo-(?!print)[a-z]|'ordo-[a-z]+-\$)/g)) zle.push(`${f.split('/src/')[1]}: ${m[1]}`); }
    expect(zle).toEqual([]);
  });
  it('etykiety modułu obsady po polsku (Godziny wymagane, Niedobór, Ocena grafiku, Zapotrzebowanie a obsada)', () => {
    const s = src(ROOT + 'src/views/Staffing.jsx');
    for (const t of ['Godziny wymagane', 'Niedobór', 'Ocena grafiku', 'Zapotrzebowanie a obsada', 'Mapa pokrycia']) expect(s).toContain(t);
    for (const t of ['"Required Hours"', '"Deficit"', '"Schedule Score"', 'Demand vs Coverage', "'Published'", "'Preliminary'"]) expect(s).not.toContain(t);
  });
  it('brak pasków z wartością na stałe (72 %, 62 %) i stałej „Gotowości stacji 100%”; puls bez danych pokazuje „brak danych”', () => {
    const app = src(ROOT + 'src/App.jsx');
    expect(app).not.toMatch(/progress=\{\s*\d+\s*\}/);
    expect(src(ROOT + 'src/ui/primitives.jsx')).not.toContain("width: '62%'");
    expect(app).not.toContain('Gotowość stacji');
    expect(app).toMatch(/score == null \? 'brak danych'/);
    expect(src(ROOT + 'src/views/Analytics.jsx')).not.toContain('Wzrost przy malejącym udziale kosztu');
  });
  it('żadnych uszkodzonych definicji gradientów (repeating-#…) w komponentach i arkuszach', () => {
    const files = [...walk(ROOT + 'src', ['.css', '.jsx']), ...walk(HUB + 'src', ['.css', '.jsx'])];
    const zle = files.filter((f) => /repeating-#|linear-#|radial-#/.test(src(f))).map((f) => f.split('/src/')[1]);
    expect(zle).toEqual([]);
  });
  it('logo Studio w menu ma pełną szerokość (nie 168 px), a hierarchia nagłówków jest jedna (24 px h1 modułu)', () => {
    const ov = src(ROOT + 'src/ordo-overrides.css');
    expect(ov).not.toMatch(/\.brand-logo \{ width: 168px/);
    expect(ov).toMatch(/\.brand-lockup \.brand-logo \{ width: 100%; max-width: 218px/);
    expect(ov).toMatch(/\.module-heading h1, \.page-heading h1[^{]*\{ font-size: 24px !important/);
    expect(src(ROOT + 'src/views/Staffing.jsx')).not.toContain('text-[30px]');
  });
});
