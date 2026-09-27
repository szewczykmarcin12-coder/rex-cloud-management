// ═══════════════════════════════════════════════════════════════════════════════
//  Analizy — okres i agregaty (czyste funkcje, testowane w Node).
//  Okres to zawsze lista miesięcy kalendarzowych: jeden wybrany miesiąc albo 12 kolejnych
//  miesięcy kończących się na najnowszym miesiącu z danymi. Miesiące bez danych są w wyniku
//  z zerami — wykres i CSV pokazują ciągły okres, a nie „12 ostatnich miesięcy, w których coś było”.
// ═══════════════════════════════════════════════════════════════════════════════
import { godzZ, jestInstruktor, kosztGodzin } from '../lib/domain.js';

const pad2 = (n) => String(n).padStart(2, '0');
export const kluczMiesiaca = (d) => (typeof d === 'string' ? d.slice(0, 7) : `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);

// n kolejnych miesięcy kalendarzowych kończących się na `ostatni` (YYYY-MM), rosnąco
export function miesiacePoprzednie(ostatni, n = 12) {
  if (!ostatni || !/^\d{4}-\d{2}$/.test(ostatni)) return [];
  const [y, m] = ostatni.split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); out.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`); }
  return out;
}

// posortowane miesiące, w których jest jakikolwiek grafik albo sprzedaż
export function dostepneMiesiace(shifts, sales) {
  const s = new Set();
  (shifts || []).forEach((x) => { if (x && x.date) s.add(String(x.date).slice(0, 7)); });
  Object.keys(sales || {}).forEach((d) => s.add(String(d).slice(0, 7)));
  return [...s].filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
}
export const najnowszyMiesiac = (shifts, sales) => { const m = dostepneMiesiace(shifts, sales); return m.length ? m[m.length - 1] : null; };

// tryb: 'miesiac' (jeden) | 'r12' (12 miesięcy kalendarzowych do najnowszego z danymi)
export function zakresOkresu({ tryb, miesiac, shifts, sales }) {
  if (tryb === 'r12') { const k = najnowszyMiesiac(shifts, sales) || kluczMiesiaca(new Date()); return miesiacePoprzednie(k, 12); }
  return [miesiac || najnowszyMiesiac(shifts, sales) || kluczMiesiaca(new Date())];
}
export const etykietaOkresu = (months) => !months.length ? '—' : months.length === 1 ? months[0] : `${months[0]} – ${months[months.length - 1]} (${months.length} mies.)`;

// Agregat per miesiąc: godziny wg grup, koszt (szacunek), sprzedaż, braki danych do kosztu.
// kontoZ(shift) → konto lub null. Wynik: tablica [klucz, o] dokładnie dla podanych miesięcy (zera, gdy pusto).
export function agregujMiesiace({ shifts, sales, months, kontoZ, mgrFunkcje = ['RGM', 'ASM'], funkFunkcje = ['SM', 'JSM'] }) {
  const zbior = new Set(months);
  const pusty = () => ({ h: 0, koszt: 0, crew: 0, mgr: 0, funk: 0, szkol: 0, sprzedaz: 0, zmian: 0, bezStawki: 0, dni: new Set() });
  const m = new Map(months.map((k) => [k, pusty()]));
  const MGRA = new Set(mgrFunkcje), FUNKA = new Set(funkFunkcje);
  (shifts || []).forEach((x) => {
    if (!x || !x.date || jestInstruktor(x)) return;
    const k = String(x.date).slice(0, 7); if (!zbior.has(k)) return;
    const o = m.get(k); const g = godzZ(x); const kt = kontoZ ? kontoZ(x) : null;
    o.h += g; o.koszt += kosztGodzin(kt, g); o.zmian += 1; o.dni.add(x.date);
    if (!kt || !(Number(kt.stawka) > 0)) o.bezStawki += 1;
    if (x.rola === 'training') o.szkol += g;
    else if (kt && MGRA.has(kt.funkcja)) o.mgr += g;
    else if (kt && FUNKA.has(kt.funkcja)) o.funk += g;
    else o.crew += g;
  });
  Object.entries(sales || {}).forEach(([d, v]) => { const k = String(d).slice(0, 7); if (zbior.has(k)) m.get(k).sprzedaz += Number(v) || 0; });
  return months.map((k) => { const o = m.get(k); return [k, { ...o, dni: o.dni.size }]; });
}

// Podsumowanie okresu na podstawie agregatów
export function podsumujOkres(agreg) {
  const sum = (f) => agreg.reduce((a, [, o]) => a + (o[f] || 0), 0);
  const sprzedaz = sum('sprzedaz'), koszt = sum('koszt'), h = sum('h');
  const mieszSprz = agreg.filter(([, o]) => o.sprzedaz > 0).length, mieszDane = agreg.filter(([, o]) => o.h > 0 || o.sprzedaz > 0).length;
  return {
    sprzedaz, koszt, h, crew: sum('crew'), mgr: sum('mgr'), funk: sum('funk'), szkol: sum('szkol'), zmian: sum('zmian'), bezStawki: sum('bezStawki'),
    col: sprzedaz > 0 ? koszt / sprzedaz * 100 : null, splh: h > 0 && sprzedaz > 0 ? sprzedaz / h : null,
    mieszSprz, mieszDane, mieszBezSprz: agreg.filter(([, o]) => o.h > 0 && !(o.sprzedaz > 0)).length,
  };
}

// Zamknięcie kart czasu: tylko dni należące do grafiku okresu; Completed liczone wśród tych dni.
export function zamkniecieKart({ shifts, completed, months }) {
  const zbior = new Set(months);
  const dni = new Set((shifts || []).filter((x) => x && x.date && zbior.has(String(x.date).slice(0, 7))).map((x) => x.date));
  const zamkniete = [...dni].filter((d) => completed && completed[d]).length;
  return { dniZmian: dni.size, dniComp: zamkniete, pct: dni.size ? Math.min(100, Math.round(zamkniete / dni.size * 100)) : 0 };
}

// Godziny i sprzedaż per dzień tygodnia w okresie (0 = poniedziałek)
export function profilTygodnia({ shifts, sales, months }) {
  const zbior = new Set(months);
  const dow = Array.from({ length: 7 }, () => ({ h: 0, s: 0 }));
  const idx = (d) => (new Date(d + 'T12:00:00').getDay() + 6) % 7;
  (shifts || []).filter((x) => x && x.date && !jestInstruktor(x) && zbior.has(String(x.date).slice(0, 7))).forEach((x) => { dow[idx(x.date)].h += godzZ(x); });
  Object.entries(sales || {}).forEach(([d, v]) => { if (zbior.has(String(d).slice(0, 7))) dow[idx(d)].s += Number(v) || 0; });
  return dow;
}

// CSV raportu: jeden wiersz na miesiąc okresu (także zerowy)
export function csvOkresu(agreg) {
  const w = (n) => String(Math.round(n || 0));
  return ['Miesiąc;Sprzedaż;Koszt (szacunek);Godziny;COL %;Zmiany;Zmiany bez stawki', ...agreg.map(([k, o]) => `${k};${w(o.sprzedaz)};${w(o.koszt)};${(o.h || 0).toFixed(1)};${o.sprzedaz > 0 ? (o.koszt / o.sprzedaz * 100).toFixed(1) : ''};${o.zmian || 0};${o.bezStawki || 0}`)].join('\n');
}
