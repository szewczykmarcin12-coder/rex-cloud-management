// ── Stan jednostki (work center) i profil godzinowy sprzedaży — wspólny dla App i modułów ──
// Obiekt jest mutowany w miejscu (setUnit / setProfDow), więc wszystkie moduły widzą tę samą konfigurację.
export const UNIT = { code: 'PLK 201043', name: 'Galeria Krakowska', city: 'Kraków', brand: 'Popeyes', region: 'Małopolska', openFrom: '06:00', openTo: '02:00' };
export const setUnit = (u) => { Object.assign(UNIT, u || {}); return UNIT; };
export const unitLabel = () => `${UNIT.code} · ${UNIT.name}`;
// profil godzinowy sprzedaży per dzień tygodnia (z importu godzinowego) — zastępuje syntetyczną krzywą
export const RT = { profDow: null };
export const setProfDow = (p) => { RT.profDow = p || null; };
export const getProfDow = () => RT.profDow;
