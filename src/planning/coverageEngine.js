// REX Cloud v4.0 — Required vs Scheduled per slot (Epic B).
// KLUCZOWA ZASADA: Excess i Deficit liczone OSOBNO per slot, dopiero potem sumowane.

import { NSLOT, SLOT_MIN } from './timeSlots.js';

// demand liczony u nas w siatce 30-min (48) → rozciągnięcie do 96 slotów
export function upsample48to96(arr48) {
  const out = new Float64Array(NSLOT);
  for (let i = 0; i < NSLOT; i++) out[i] = arr48[Math.floor(i / 2)] || 0;
  return out;
}

// required[96], scheduled[96] → KPI slotowe + dane per slot
export function coverageSummary(required, scheduled) {
  const perSlot = new Array(NSLOT);
  let exc = 0, def = 0, covSum = 0, covN = 0;
  for (let i = 0; i < NSLOT; i++) {
    const req = required[i] || 0, sch = scheduled[i] || 0;
    const e = Math.max(sch - req, 0), d = Math.max(req - sch, 0);
    exc += e; def += d;
    if (req > 0) { covSum += Math.min(sch / req, 1); covN++; }
    perSlot[i] = { req, sch, exc: e, def: d };
  }
  const H = SLOT_MIN / 60;
  return {
    excessH: exc * H,                          // Σ nadmiaru slotowego × 0,25 h
    deficitH: def * H,                         // Σ niedoboru slotowego × 0,25 h
    requiredH: required.reduce((a, v) => a + v, 0) * H,
    scheduledH: scheduled.reduce((a, v) => a + v, 0) * H,
    coveragePct: covN ? (covSum / covN) * 100 : 100,
    perSlot,
  };
}
