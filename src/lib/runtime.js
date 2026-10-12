// ── Stan jednostki (work center) i profil godzinowy sprzedaży — wspólny dla App i modułów ──
// Obiekt jest mutowany w miejscu (setUnit / setProfDow), więc wszystkie moduły widzą tę samą konfigurację.
export const UNIT = { code: 'PLK 201043', name: 'Galeria Krakowska', city: 'Kraków', brand: 'Popeyes', region: 'Małopolska', openFrom: '06:00', openTo: '02:00' };
export const setUnit = (u) => { Object.assign(UNIT, u || {}); return UNIT; };
export const unitLabel = () => `${UNIT.code} · ${UNIT.name}`;
// profil godzinowy sprzedaży per dzień tygodnia (z importu godzinowego) — zastępuje syntetyczną krzywą
export const RT = { profDow: null };
export const setProfDow = (p) => { RT.profDow = p || null; };
export const getProfDow = () => RT.profDow;
// wspólne parametry planowania (params:planning z /api/month-plan?params=1): SPLH, MPT, podłoga, managerów na zmianie
export const PLAN_PARAMS = { splh: 420, mpt: 4, podloga: 3, indirectPct: 0.12, colTargetPct: 20, yoyWeight: 0.3, mgrNaZmianie: 1 };
export const setPlanParams = (p) => { Object.assign(PLAN_PARAMS, p || {}); return PLAN_PARAMS; };
// wymóg managera dla bieżącej jednostki (godziny otwarcia z /api/org)
export const mgrReqOpts = () => ({ openFrom: UNIT.openFrom || '06:00', openTo: UNIT.openTo || '02:00', mgrNaZmianie: Number(PLAN_PARAMS.mgrNaZmianie) || 1 });
