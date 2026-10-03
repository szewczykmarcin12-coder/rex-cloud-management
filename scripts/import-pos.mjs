#!/usr/bin/env node
// Import raportów POS do ORDO z terminala (bez klikania w Studio):
//   node scripts/import-pos.mjs --api https://rex-cloud-backend.vercel.app/api --login ASM "Sales Day by Day.xlsx" "Daily Operations.xlsx"
// Hasło pyta interaktywnie (albo zmienna ORDO_PASSWORD). --dry-run: tylko parsuje i pokazuje, co by wysłał.
import fs from 'fs';
import readline from 'readline';
import { parsePosReport } from '../src/import/posReports.js';

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
const pliki = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--api', '--login', '--token'].includes(args[i - 1])));
const API = String(opt('--api', process.env.ORDO_API || 'https://rex-cloud-backend.vercel.app/api')).replace(/\/$/, '');
if (!pliki.length) { console.error('Podaj co najmniej jeden plik XLSX (Sales Day by Day / Daily Operations).'); process.exit(2); }

const raporty = pliki.map((f) => { const r = parsePosReport(fs.readFileSync(f)); console.log(`• ${f}: ${r.typ} ${r.from || '?'} – ${r.to || '?'}${r.typ === 'sales-day-by-day' ? ` • ${r.n} dni, netto ${Math.round(r.totals.net).toLocaleString('pl-PL')} zł, paragony ${r.totals.checks}` : ` • ${Object.keys(r.slots15).length} kwadransów, szczyty ${r.peaks.slice(0, 2).join(', ')}`}${r.warnings.length ? `\n  ! ${r.warnings.join('\n  ! ')}` : ''}`); return r; });
if (flag('--dry-run')) { console.log('Tryb --dry-run: nic nie wysłano.'); process.exit(0); }

const pytaj = (q, ukryj) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); if (ukryj) { process.stdout.write(q); rl.question('', (a) => { rl.close(); process.stdout.write('\n'); res(a); }); rl._writeToOutput = () => {}; } else rl.question(q, (a) => { rl.close(); res(a); }); });
let token = opt('--token', process.env.ORDO_TOKEN);
if (!token) {
  const login = opt('--login', process.env.ORDO_LOGIN) || await pytaj('Login (ASM): ');
  const password = process.env.ORDO_PASSWORD || await pytaj('Hasło: ', true);
  const r = await fetch(`${API}/admin-auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login, password }) }).then((x) => x.json());
  if (!r.success || r.role !== 'asm') { console.error('Logowanie nieudane lub brak roli ASM:', r.error || r.role); process.exit(1); }
  token = r.token; console.log(`Zalogowano jako ${r.userName} (asm).`);
}
const put = (body) => fetch(`${API}/sales`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then((x) => x.json());
for (const r of raporty) {
  const body = r.typ === 'sales-day-by-day' ? { source: 'pos-sales-day-by-day', basis: 'net', sales: r.sales, salesGross: r.salesGross, checks: r.checks } : { source: 'pos-daily-operations', intraday: r.intraday };
  const w = await put(body);
  if (!w.success) { console.error(`✗ ${r.typ}: ${w.error}`); process.exit(1); }
  console.log(`✓ ${r.typ}: zapisane (dni w bazie: ${w.dni}, wersja ${w.meta ? w.meta.wersja : '?'}, profil śróddzienny: ${w.intraday ? 'tak' : 'nie'})`);
}
console.log('Gotowe. Prognoza miesiąca: wygeneruj plan ponownie, aby sloty 15 min użyły zmierzonego profilu.');
