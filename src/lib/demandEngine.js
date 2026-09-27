import { getProfDow } from './runtime.js';
// ── Silnik popytu (sloty 30 min): profil doby, krzywa celu, szablony zmian, zapotrzebowanie ──
export const toISOdate = (v) => { if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`; const s = String(v); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; const d = new Date(v); return isNaN(d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// ===================== OPTYMALIZACJA (silnik MAPAL-style, sloty 30 min) =====================
export const OC = { cel: "#741334", silnik: "#A7465F", obsada: "#5A3542", ok: "#5A3542", warn: "#A7465F", bad: "#B94352" };
export const S0 = 6;
export const NS = 48;                       // doba operacyjna 06:00 → 06:00
export const sl = (h) => (h - S0) * 2;
export const hmS = (i) => { const t = (S0 * 60 + i * 30) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
export const D3 = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];
export const PIK = [13, 14, 15, 16, 17, 18, 19, 20];

// profil godzinowy sprzedaży (udział doby) — z historii micros
export const ZLH = { 7: 433, 8: 640, 9: 935, 10: 1231, 11: 1805, 12: 2350, 13: 2714, 14: 2706, 15: 2614, 16: 2530, 17: 2553, 18: 2447, 19: 2647, 20: 2417, 21: 1962, 22: 1378, 23: 901 };
const SUMZ = Object.values(ZLH).reduce((a, b) => a + b, 0);
const PROF = {}; Object.entries(ZLH).forEach(([h, v]) => { PROF[h] = v / SUMZ; });

// macierz obsady docelowej (krzywa celu) wg godziny × dzień tygodnia (0=Pon)
const KC = {
  6: [2,2,2,2,2,2,2], 7: [3,3,3,3,3,3,3], 8: [3,3,3,3,3,3,3], 9: [3,3,3,3,3,3,3],
  10: [3,3,3,3,3,3,3], 11: [4,4,4,4,5,4,5], 12: [5,5,5,5,6,6,6], 13: [6,6,6,6,7,7,7],
  14: [6,6,6,6,7,7,7], 15: [6,6,6,6,7,6,7], 16: [6,6,6,6,6,6,7], 17: [6,6,6,6,7,6,7],
  18: [6,5,6,6,6,6,6], 19: [6,6,6,6,7,6,7], 20: [5,5,6,6,6,6,6], 21: [4,4,5,5,5,5,5],
  22: [3,3,3,3,4,3,4], 23: [3,3,3,3,3,3,3], 24: [3,3,3,3,3,3,3], 25: [1,1,1,1,1,1,1],
};
export const SZAB = [
  { n: "OTWARCIE 06–16", od: 6, do: 16, kol: "#5A3542" }, { n: "OTWARCIE 06–15", od: 6, do: 15, kol: "#5A3542" },
  { n: "KONTROLER I 07–15", od: 7, do: 15, kol: "#A7465F" }, { n: "DOSTAWA 07–12", od: 7, do: 12, kol: "#A7465F" },
  { n: "DOSTAWA+SMAŻ 07–17", od: 7, do: 17, kol: "#A7465F" }, { n: "DOSTAWA 07–15", od: 7, do: 15, kol: "#A7465F" },
  { n: "SMAŻENIE I 10–18", od: 10, do: 18, kol: "#B5482F" }, { n: "ŚRODEK 11–21", od: 11, do: 21, kol: "#A7465F" },
  { n: "ŚRODEK 12–22", od: 12, do: 22, kol: "#A7465F" }, { n: "FLEX SZCZYT 12–20", od: 12, do: 20, kol: "#C0392B" },
  { n: "ZAMKNIĘCIE 15–01", od: 15, do: 25, kol: "#741334" }, { n: "WSPARCIE WIECZ 16–24", od: 16, do: 24, kol: "#5A3542" },
  { n: "ZAMKNIĘCIE 16–01", od: 16, do: 25, kol: "#741334" }, { n: "ZAMKNIĘCIE 17–02", od: 17, do: 26, kol: "#741334" },
  { n: "PREP 18–24", od: 18, do: 24, kol: "#8A8880" }, { n: "ZMYWAK 22–06", od: 22, do: 30, kol: "#4A4A48" },
];

export function optZapotrzebowanie(sprzedaz, splh, podloga, tryb, dow) {
  const dem = new Array(NS).fill(0);
  [[6, 7], [24, 25], [25, 26]].forEach(([a, b]) => { const n = KC[a] ? KC[a][dow] : 1; for (let i = sl(a); i < sl(b); i++) dem[i] = Math.max(dem[i], n); });
  for (let h = 7; h <= 23; h++) {
    const n = tryb === "krzywa" ? KC[h][dow] : Math.max(podloga, Math.round((sprzedaz * PROF[h]) / splh));
    for (const i of [sl(h), sl(h) + 1]) dem[i] = Math.max(dem[i], n);
  }
  return dem;
}
export function optRozbicie(sprzedaz, splh, podloga, tryb, dow) {
  const dir = new Array(NS).fill(0), ind = new Array(NS).fill(0);
  [[6, 7], [24, 25], [25, 26]].forEach(([a, b]) => { const n = KC[a] ? KC[a][dow] : 1; for (let i = sl(a); i < sl(b); i++) ind[i] = Math.max(ind[i], n); });
  for (let h = 7; h <= 23; h++) {
    const hh = String(h).padStart(2, '0');
    const PROF_DOW = getProfDow();
    const pDyn = PROF_DOW && PROF_DOW[dow] && PROF_DOW[dow][hh] != null ? PROF_DOW[dow][hh] : null;
    const n = tryb === 'krzywa' ? KC[h][dow] : Math.max(podloga, Math.round((sprzedaz * (pDyn != null ? pDyn : PROF[h])) / splh));
    for (const i of [sl(h), sl(h) + 1]) dir[i] = n;
  }
  return { dir, ind };
}

export function optKsztaltuj(dem, wlaczone) {
  const cand = SZAB.filter((t) => wlaczone[t.n]).map((t) => ({ t, s: sl(t.od), len: sl(t.do) - sl(t.od) })).filter((c) => c.s >= 0 && c.s + c.len <= NS);
  const cover = new Array(NS).fill(0), out = [];
  if (!cand.length) return { out, cover };
  for (let g = 0; g < 60; g++) {
    if (dem.every((d, i) => cover[i] >= d)) break;
    let best = null, bs = -1;
    for (const c of cand) { let gain = 0; for (let i = c.s; i < c.s + c.len; i++) if (cover[i] < dem[i]) gain++; if (!gain) continue; const sc = gain / c.len; if (sc > bs + 1e-9) { bs = sc; best = c; } }
    if (!best) break;
    for (let i = best.s; i < best.s + best.len; i++) cover[i]++;
    out.push({ ...best });
  }
  for (let k = out.length - 1; k >= 0; k--) { const c = out[k]; let ok = true; for (let i = c.s; i < c.s + c.len; i++) if (cover[i] - 1 < dem[i]) { ok = false; break; } if (ok) { for (let i = c.s; i < c.s + c.len; i++) cover[i]--; out.splice(k, 1); } }
  out.sort((a, b) => a.s - b.s);
  return { out, cover };
}
export const f0 = (v) => Math.round(v).toLocaleString("pl-PL");
export const fH1 = (v) => `${v.toFixed(1).replace(".", ",")} h`;

