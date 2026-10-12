// ── Atmosphere: JEDNO przypisanie stanowisk do pastelowych rodzin kolorów ──
// Używane przez Studio (grafik, siatka dnia, autoplan, model pracy, kwalifikacje), podgląd wydruku,
// generator PDF (wartości RGB poniżej) i Employee Hub (kopia: rex-cloud-app/src/stations.js — trzymać identyczną).
// Zasada: tło = pastel rodziny, tekst = grafit (#292D32), etykieta stanowiska zawsze widoczna;
// akcent (kropka, obrys, legenda) rozróżnia stanowiska wewnątrz rodziny. Czerwień nie jest kolorem stanowiska.
export const STATION_FAMILIES = {
  lead:       { nazwa: 'Kierownik',          tone: 'deep',    fill: '#E9E4F4', accent: '#9C92BC', ink: '#3E3760' },
  operations: { nazwa: 'Front / obsługa',    tone: 'mid',     fill: '#DCEBF5', accent: '#79A2C0', ink: '#2B4A5F' },
  production: { nazwa: 'Kuchnia',            tone: 'soft',    fill: '#F8F1D2', accent: '#C9B45E', ink: '#5C5124' },
  control:    { nazwa: 'Wsparcie / zadania', tone: 'outline', fill: '#E4E8F2', accent: '#8C9AC0', ink: '#37415E' },
  training:   { nazwa: 'Szkolenia',          tone: 'mid',     fill: '#E8F3EE', accent: '#7FBFA6', ink: '#407362' },
  other:      { nazwa: 'Pozostałe',          tone: 'outline', fill: '#EDF0F3', accent: '#9DA4AA', ink: '#3F4A55' },
};
export const STATION_FAMILY = {
  'MANAGER': 'lead', 'MGR FUNKCYJNE': 'lead',
  'KONTROLER': 'operations', 'DISPATCHER': 'operations', 'PHU': 'operations', 'DESERY / NAPOJE': 'operations',
  'KANAPKI / WRAPY': 'production', 'PANIEROWANIE': 'production', 'SMAŻENIE': 'production', 'FRYTKI': 'production',
  'ZMYWAK': 'control', 'PREP': 'control', 'DOSTAWA': 'control', 'WSPARCIE WIECZORNE / FLEX': 'control',
  'SZKOLENIA': 'training', 'TRAINING': 'training', 'INSTRUKTOR': 'training',
};
// akcent = akcent RODZINY (lawenda / błękit / piasek / stal / mięta). Stanowiska w rodzinie rozróżnia etykieta, nie kolor —
// mniej barw na ekranie, żadna spoza tokenów --at-station-*.
export const STATION_ACCENT = {};
const norm = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
export const stationFamily = (st) => STATION_FAMILY[norm(st)] || 'other';
export const stationStyle = (st) => { const f = STATION_FAMILIES[stationFamily(st)]; return { family: stationFamily(st), tone: f.tone, fill: f.fill, accent: STATION_ACCENT[norm(st)] || f.accent, ink: f.ink, text: '#292D32' }; };
export const stationTone = (st) => stationStyle(st).tone;          // klasa gantt-/weekly-/print-shift-: deep | mid | soft | outline
export const stationFill = (st) => stationStyle(st).fill;
export const stationAccent = (st) => stationStyle(st).accent;
export const stationInk = (st) => stationStyle(st).ink;
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const stationRgb = (st) => { const s = stationStyle(st); return { fill: rgb(s.fill), accent: rgb(s.accent), ink: rgb(s.ink), text: rgb(s.text) }; };
export const FAMILY_LEGEND = Object.entries(STATION_FAMILIES).filter(([k]) => k !== 'other' && k !== 'training').map(([k, f]) => ({ key: k, tone: f.tone, label: f.nazwa, fill: f.fill, accent: f.accent }));
