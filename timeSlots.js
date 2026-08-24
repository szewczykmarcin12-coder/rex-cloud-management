// REX Cloud v4.0 — silnik czasu: doba operacyjna 06:00→06:00, 96 slotów po 15 min.
// Czyste funkcje, zero Reacta — testowalne w node (plan wdrożenia, Epic A).

export const SLOT_MIN = 15;
export const NSLOT = 96;                       // 06:00 … 05:45
const START = 6 * 60;                          // początek doby operacyjnej (minuty od północy)

// "17:15" → minuty od północy
export const toMin = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

// minuty od początku doby operacyjnej (0..1439); godziny <06:00 należą do "wczoraj+"
export const opMin = (t) => { let x = toMin(t) - START; if (x < 0) x += 1440; return x; };

export const slotLabel = (i) => { const m = START + i * SLOT_MIN; return `${String(Math.floor((m % 1440) / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

// Pokrycie slotów przez zmianę start–end (frakcyjne; przez północ OK).
// Zwraca Float64Array(96): 1.0 = slot w pełni pokryty, 0.33 = 5/15 min itd.
export function shiftSlotCoverage(start, end) {
  const cov = new Float64Array(NSLOT);
  let a = opMin(start), b = opMin(end);
  if (b <= a) b += 1440;                       // przejście przez północ / pełna doba
  b = Math.min(b, NSLOT * SLOT_MIN);           // przycięcie do doby operacyjnej
  for (let i = 0; i < NSLOT; i++) {
    const s0 = i * SLOT_MIN, s1 = s0 + SLOT_MIN;
    const cut = Math.min(b, s1) - Math.max(a, s0);
    if (cut > 0) cov[i] = cut / SLOT_MIN;
  }
  return cov;
}

// Dodaje pokrycie zmiany do istniejącej tablicy obsady (mutuje i zwraca).
export function addCoverage(target, start, end) {
  const c = shiftSlotCoverage(start, end);
  for (let i = 0; i < NSLOT; i++) target[i] += c[i];
  return target;
}

// Suma slotów → godziny (A4: tolerancja zaokrągleń ≤ 0,01 h)
export const slotsToHours = (arr) => { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i]; return s * (SLOT_MIN / 60); };

// Długość zmiany w godzinach (przez północ OK)
export const shiftHours = (start, end) => { let a = toMin(start), b = toMin(end); if (b <= a) b += 1440; return (b - a) / 60; };
