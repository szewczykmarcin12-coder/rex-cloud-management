import { unzipSync, zipSync, strToU8, strFromU8 } from 'fflate';

// ═══════════════════════════════════════════════════════════════════════════════
//  Eksport do systemu docelowego (GO) — ORYGINALNY plik GO jako szablon.
//  Nie budujemy nowego skoroszytu. Kopiujemy /go-template.xlsx (oryginał z GO: 221 wierszy,
//  A1:AEN221, 31 scaleń, 7040 formuł, style i puste komórki techniczne) i chirurgicznie
//  podmieniamy WYŁĄCZNIE: nagłówki dat w wierszu 1 (B1, D1, …), nazwiska w A2:A221 oraz pary
//  godzin w B:BK. Wszystko poza tym (BL:AEN, formuły, style, scalenia, szerokości kolumn,
//  calcChain, printerSettings) pochodzi bit w bit z oryginału.
//  Wartości zapisujemy tak jak GO w swoim pliku: jako tekst w Shared Strings ze stylem
//  komórki szablonu (s=13 dla godzin, s=16 dla nazwisk) — identycznie z oryginałem.
// ═══════════════════════════════════════════════════════════════════════════════

const KOL_MAX_DANE = 63;                 // BK = 63 (1-based): A + 31 par
const OSTATNI_WIERSZ = 221;
const colIdx = (letters) => { let n = 0; for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
const colLet = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const escXml = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescXml = (t) => String(t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const timeMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (min) => `${pad2(Math.floor(((min % 1440) + 1440) % 1440 / 60))}:${pad2(min % 60)}`;

// ── Shared strings: odczyt + dopisywanie ──
function czytajSst(xml) {
  const lista = [];
  const re = /<x:si>([\s\S]*?)<\/x:si>/g; let m;
  while ((m = re.exec(xml))) { const t = /<x:t[^>]*>([\s\S]*?)<\/x:t>/.exec(m[1]); lista.push(t ? unescXml(t[1]) : ''); }
  const mapa = new Map(); lista.forEach((s, i) => { if (!mapa.has(s)) mapa.set(s, i); });
  return { lista, mapa };
}
function zapiszSst(xml, sst) {
  const body = sst.lista.map((s) => `<x:si><x:t${/^\s|\s$/.test(s) ? ' xml:space="preserve"' : ''}>${escXml(s)}</x:t></x:si>`).join('');
  const naglowek = xml.slice(0, xml.indexOf('>') + 1);                       // <?xml …?>
  const sstOpen = /<x:sst[^>]*>/.exec(xml)[0].replace(/count="\d+"/, `count="${sst.lista.length}"`).replace(/uniqueCount="\d+"/, `uniqueCount="${sst.lista.length}"`);
  return naglowek + sstOpen + body + '</x:sst>';
}
const idxStr = (sst, s) => { if (sst.mapa.has(s)) return sst.mapa.get(s); sst.lista.push(s); sst.mapa.set(s, sst.lista.length - 1); return sst.lista.length - 1; };

// ── Chirurgia wiersza: podmiana komórek A..BK, reszta wiersza bez zmian ──
function ustawWiersz(sheetXml, r, komorki) {
  // komorki: tablica { col:1..63, s, val(idx | null) }
  const re = new RegExp(`(<x:row r="${r}"[^>]*>)([\\s\\S]*?)(</x:row>)`);
  const m = re.exec(sheetXml);
  const nowe = komorki.map((k) => k.val == null ? `<x:c r="${colLet(k.col)}${r}" s="${k.s}" t="s" />` : `<x:c r="${colLet(k.col)}${r}" s="${k.s}" t="s"><x:v>${k.val}</x:v></x:c>`).join('');
  if (!m) {
    // wiersz nie istnieje (nie powinno się zdarzyć w szablonie 221 wierszy) — wstaw przed kolejnym wierszem lub na koniec sheetData
    const wiersz = `<x:row r="${r}">${nowe}</x:row>`;
    const nast = new RegExp(`<x:row r="(${Array.from({ length: OSTATNI_WIERSZ - r }, (_, i) => r + 1 + i).join('|')})"`).exec(sheetXml);
    const pos = nast ? nast.index : sheetXml.indexOf('</x:sheetData>');
    return sheetXml.slice(0, pos) + wiersz + sheetXml.slice(pos);
  }
  // usuń istniejące komórki kolumn 1..63, zachowaj BL+ (formuły, style)
  const reszta = m[2].replace(/<x:c r="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/x:c>)/g, (cell, letters) => (colIdx(letters) <= KOL_MAX_DANE ? '' : cell));
  return sheetXml.slice(0, m.index) + m[1] + nowe + reszta + m[3] + sheetXml.slice(m.index + m[0].length);
}

// ── style komórek A i B..BK odczytane z wiersza 2 szablonu (nie zgadujemy numerów stylów) ──
function styleZWiersza2(sheetXml) {
  const m = /<x:row r="2"[^>]*>([\s\S]*?)<\/x:row>/.exec(sheetXml);
  const st = {};
  if (m) { const re = /<x:c r="([A-Z]+)2" s="(\d+)"/g; let c; while ((c = re.exec(m[1]))) st[colIdx(c[1])] = c[2]; }
  return { A: st[1] || '16', czas: st[2] || '13' };
}

// ── główna funkcja ──
export async function exportGO(shifts, accounts, monthKey, opcje = {}) {
  const { templateUrl = '/go-template.xlsx' } = opcje;
  const resp = await fetch(templateUrl, { cache: 'no-store' });
  if (!resp.ok) throw new Error('Brak pliku szablonu GO (public/go-template.xlsx)');
  const zip = unzipSync(new Uint8Array(await resp.arrayBuffer()));
  const sheetPath = 'xl/worksheets/sheet1.xml', sstPath = 'xl/sharedStrings.xml';
  if (!zip[sheetPath] || !zip[sstPath]) throw new Error('Szablon GO ma nieoczekiwaną strukturę');
  let sheet = strFromU8(zip[sheetPath]);
  const sst = czytajSst(strFromU8(zip[sstPath]));
  const style = styleZWiersza2(sheet);

  // dane: scalanie zmian dnia (min start – max koniec), pełny skład kont + nazwy z grafiku
  const [Y, M] = monthKey.split('-').map(Number);
  const nDni = new Date(Y, M, 0).getDate();
  const daty = Array.from({ length: nDni }, (_, i) => `${Y}-${pad2(M)}-${pad2(i + 1)}`);
  const poId = new Map((accounts || []).map((a) => [a.id, a]));
  const poNaz = new Map((accounts || []).flatMap((a) => [a.grafikName, a.name, ...(a.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a])));
  const mies = (shifts || []).filter((s2) => (s2.date || '').startsWith(monthKey) && s2.rola !== 'instruktor');
  const etykieta = (s2) => { const k = poId.get(s2.accountId) || poNaz.get(String(s2.name || '').toUpperCase().trim()); return (k && k.name ? k.name : s2.name || '').toUpperCase().trim(); };
  const mapa = {}; let scalone = 0;
  mies.forEach((s2) => {
    const os = etykieta(s2); if (!os) return;
    (mapa[os] = mapa[os] || {});
    const sMin = timeMin(s2.start); let eMin = timeMin(s2.end); if (eMin <= sMin) eMin += 1440;
    const stary = mapa[os][s2.date];
    if (!stary) mapa[os][s2.date] = { s: sMin, e: eMin }; else { scalone++; stary.s = Math.min(stary.s, sMin); stary.e = Math.max(stary.e, eMin); }
  });
  const osoby = [...new Set([...(accounts || []).filter((a) => a.aktywny !== false).map((a) => String(a.name || '').toUpperCase().trim()), ...Object.keys(mapa)])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pl'));
  if (osoby.length > OSTATNI_WIERSZ - 1) throw new Error(`Szablon GO mieści ${OSTATNI_WIERSZ - 1} osób, skład ma ${osoby.length}`);

  // wiersz 1: A1 rok, nagłówki DD/MM w B1, D1, … (31 par); dni poza miesiącem — komórka bez wartości
  const naglowek = [{ col: 1, s: (/<x:c r="A1" s="(\d+)"/.exec(sheet) || [])[1] || '17', val: idxStr(sst, String(Y)) }];
  for (let d = 0; d < 31; d++) {
    const c1 = 2 + d * 2;
    const st1 = (new RegExp(`<x:c r="${colLet(c1)}1" s="(\\d+)"`).exec(sheet) || [])[1] || '16';
    const st2 = (new RegExp(`<x:c r="${colLet(c1 + 1)}1" s="(\\d+)"`).exec(sheet) || [])[1] || '11';
    naglowek.push({ col: c1, s: st1, val: d < nDni ? idxStr(sst, `${daty[d].slice(8)}/${daty[d].slice(5, 7)}`) : null });
    naglowek.push({ col: c1 + 1, s: st2, val: null });
  }
  sheet = ustawWiersz(sheet, 1, naglowek);

  // wiersze 2..221: osoby, potem czyszczenie
  for (let r = 2; r <= OSTATNI_WIERSZ; r++) {
    const os = osoby[r - 2];
    if (!os) { sheet = ustawWiersz(sheet, r, []); continue; }     // wiersz bez osoby: jak w oryginale GO — bez komórek A..BK
    const kom = [{ col: 1, s: style.A, val: idxStr(sst, os) }];
    for (let d = 0; d < 31; d++) {
      const z = d < nDni ? (mapa[os] || {})[daty[d]] : null;
      kom.push({ col: 2 + d * 2, s: style.czas, val: z ? idxStr(sst, hhmm(z.s)) : null });
      kom.push({ col: 3 + d * 2, s: style.czas, val: z ? idxStr(sst, hhmm(z.e)) : null });
    }
    sheet = ustawWiersz(sheet, r, kom);
  }

  zip[sheetPath] = strToU8(sheet);
  zip[sstPath] = strToU8(zapiszSst(strFromU8(zip[sstPath]), sst));
  // calcChain zostaje; workbook ma fullCalcOnLoad — formuły przeliczą się po otwarciu
  const out = zipSync(zip, { level: 6 });
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `Układ poziomy - plan_${monthKey}-01_${monthKey}-${pad2(nDni)}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return { osoby: osoby.length, zmian: Object.values(mapa).reduce((a2, v) => a2 + Object.keys(v).length, 0), scalone, szablon: 'GO' };
}
