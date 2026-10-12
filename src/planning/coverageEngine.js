// REX Cloud v4.0 — Required vs Scheduled per slot (Epic B).
// KLUCZOWA ZASADA: Excess i Deficit liczone OSOBNO per slot, dopiero potem sumowane.

import { NSLOT, SLOT_MIN, shiftSlotCoverage } from './timeSlots.js';

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

// ═══════════════════════════════════════════════════════════════════════════════
//  v13: obsada = CREW (popyt ze sprzedaży ÷ SPLH, podłoga) + MGR (wymóg obecności managera, nie popyt).
//  Dotąd managerowie wchodzili do „planu” i byli porównywani z popytem crew → fałszywy nadmiar godzin,
//  których nie da się zdjąć. Teraz: wymagane = popyt crew + manager na zmianie w godzinach otwarcia;
//  nadmiar liczony tylko dla crew; MGR raportowany osobno (brak managera = niedobór, drugi manager = informacja).
// ═══════════════════════════════════════════════════════════════════════════════
const opMinLocal = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); let x = h * 60 + (m || 0) - 6 * 60; if (x < 0) x += 1440; return x; };

// wymóg managera per slot: `mgrNaZmianie` osób od (otwarcie − bufor) do (zamknięcie + bufor)
export function mgrRequirement96({ openFrom = '06:00', openTo = '02:00', mgrNaZmianie = 1, buforMin = 30 } = {}) {
  const req = new Float64Array(NSLOT);
  let a = opMinLocal(openFrom) - buforMin, b = opMinLocal(openTo) + buforMin;
  if (b <= a) b += 1440;
  a = Math.max(0, a); b = Math.min(b, NSLOT * SLOT_MIN);
  for (let i = 0; i < NSLOT; i++) { const s0 = i * SLOT_MIN; if (s0 >= a && s0 < b) req[i] = mgrNaZmianie; }
  return req;
}

// zmiany → dwie siatki: crew96 i mgr96 (isMgr(x) decyduje; instruktorzy odfiltrowani wcześniej)
export function splitSchedule96(shifts, isMgr) {
  const crew = new Float64Array(NSLOT), mgr = new Float64Array(NSLOT);
  (shifts || []).forEach((x) => {
    const cov = shiftSlotCoverage(x.start, x.end);
    const cel = isMgr(x) ? mgr : crew;
    for (let i = 0; i < NSLOT; i++) cel[i] += cov[i];
  });
  return { crew96: crew, mgr96: mgr };
}

// KPI z rozdziałem crew / mgr; pola zgodne z coverageSummary (excessH, deficitH, coveragePct, perSlot…)
export function coverageSplit(reqCrew96, crew96, mgr96, mgrReq96) {
  const perSlot = new Array(NSLOT);
  let excC = 0, defC = 0, defM = 0, extraM = 0, covSum = 0, covN = 0;
  const req96 = new Float64Array(NSLOT), sch96 = new Float64Array(NSLOT);
  for (let i = 0; i < NSLOT; i++) {
    const rc = reqCrew96[i] || 0, sc = crew96[i] || 0, rm = mgrReq96 ? (mgrReq96[i] || 0) : 0, sm = mgr96 ? (mgr96[i] || 0) : 0;
    const eC = Math.max(sc - rc, 0), dC = Math.max(rc - sc, 0), dM = Math.max(rm - sm, 0), xM = Math.max(sm - rm, 0);
    excC += eC; defC += dC; defM += dM; extraM += xM;
    const req = rc + rm, sch = sc + sm;
    req96[i] = req; sch96[i] = sch;
    if (req > 0) { covSum += Math.min(sch / req, 1); covN++; }
    perSlot[i] = { req, sch, reqCrew: rc, schCrew: sc, reqMgr: rm, schMgr: sm, exc: eC, def: dC + dM, defMgr: dM, extraMgr: xM };
  }
  const H = SLOT_MIN / 60;
  return {
    excessH: excC * H,                 // nadmiar TYLKO crew — godzin MGR nie da się „zdjąć”
    deficitH: (defC + defM) * H,       // niedobór crew + brak managera
    deficitCrewH: defC * H, deficitMgrH: defM * H, extraMgrH: extraM * H,
    requiredH: req96.reduce((a, v) => a + v, 0) * H, scheduledH: sch96.reduce((a, v) => a + v, 0) * H,
    requiredCrewH: reqCrew96.reduce((a, v) => a + v, 0) * H, scheduledCrewH: crew96.reduce((a, v) => a + v, 0) * H,
    requiredMgrH: mgrReq96 ? mgrReq96.reduce((a, v) => a + v, 0) * H : 0, scheduledMgrH: mgr96 ? mgr96.reduce((a, v) => a + v, 0) * H : 0,
    coveragePct: covN ? (covSum / covN) * 100 : 100,
    req96, sch96, perSlot,
  };
}
