import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Cloud, Lock, Upload, Printer, Calendar, Users, LayoutGrid, RefreshCw, LogOut, Check, X, AlertCircle, FileSpreadsheet, Trash2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, Home, Settings, Download, Clock, AlertTriangle, CalendarCheck2, Clock3, ExternalLink, Filter, MessageSquare, Search, Smartphone, UserCheck, Coffee, CreditCard, LogIn, Monitor, Wifi, CheckCircle2, Bell, LayoutDashboard, TrendingUp, Activity, BookOpen, TimerReset, Smartphone as SmartphoneIcon, MoreHorizontal, Sparkles, Menu, Eye, EyeOff, ShieldCheck, ArrowRight, Zap, ArrowLeftRight, Gauge, CircleDollarSign, Bot } from 'lucide-react';
import { NSLOT as V4_NSLOT, slotLabel as v4SlotLabel, addCoverage as v4AddCoverage } from './planning/timeSlots.js';
import { coverageSummary as v4Coverage, upsample48to96 as v4Up96 } from './planning/coverageEngine.js';
import { parseGrafik, exportPoziomy } from './parseGrafik.js';
import { parseExportCSV } from './parseExport.js';
import { generateDayPDF, generateRangePDF } from './generatePDF.js';
import { DailyRosterPrint } from './DailyRosterPrint.jsx';
import MonthlyForecast from './MonthlyForecast.jsx';

const API_BASE = String(import.meta.env.VITE_API_BASE || 'https://rex-cloud-backend.vercel.app/api').replace(/\/$/, '');

const colors = {
  primary: { darkest: '#3F0B1C', dark: '#741334', medium: '#A7465F', light: '#B86D82', bg: '#F1E4E8', bgLight: '#F7F5F5' },
  accent: { dark: '#3F0B1C', medium: '#741334', light: '#A7465F', bg: '#F1E4E8' }
};

const stationColors = {
  'PANIEROWANIE': '#7CB342', 'SMAŻENIE': '#B94352', 'KANAPKI / WRAPY': '#00A3E0',
  'KONTROLER': '#2F5D8A', 'WSPARCIE WIECZORNE / FLEX': '#9C27B0', 'DISPATCHER': '#FF7043',
  'PHU': '#00897B', 'DESERY / NAPOJE': '#EC407A', 'FRYTKI': '#FBC02D', 'ZMYWAK': '#71656A',
  'PREP': '#8D6E63', 'DOSTAWA': '#5C6BC0', 'MANAGER': '#2B171E', 'MGR FUNKCYJNE': '#5A3542',
  'SZKOLENIA': '#26A69A', 'TRAINING': '#26A69A', 'INSTRUKTOR': '#5A3542'
};
const stationColor = (s) => stationColors[(s || '').toUpperCase()] || colors.primary.medium;
const godzZ = (s) => (s.hours != null ? s.hours : 0);
const jestMgr = (st) => ['MANAGER', 'MGR FUNKCYJNE'].includes((st || '').toUpperCase());
// Rola szkoleniowa: nowy model (s.rola) albo stary (station 'training'/'instruktor')
const rolaSzk = (s) => {
  const r = (s.rola || '').toLowerCase();
  if (r === 'instruktor' || r === 'training') return r;
  const st = (s.station || '').toLowerCase();
  if (st === 'instruktor' || st === 'training') return st;
  return null;
};
const jestInstruktor = (s) => rolaSzk(s) === 'instruktor';
const jestUczen = (s) => rolaSzk(s) === 'training';
const jestSzkStacja = (s) => (s.station || '').toUpperCase() === 'SZKOLENIA' && !s.rola;
const jestSzkolenie = (s) => !!rolaSzk(s) || jestSzkStacja(s);
// Pozycja do wyświetlenia (stare dane training/instruktor pokazują "Szkolenie")
const etykietaStacji = (s) => {
  const st = (s.station || '').toLowerCase();
  if (st === 'training' || st === 'instruktor') return 'Szkolenie';
  return s.station;
};
// Znacznik szkolenia obok pozycji
const paraOpis = (s) => {
  const r = rolaSzk(s);
  if (!r) return null;
  const kto = s.partner ? `: ${s.partner}` : '';
  return r === 'instruktor' ? `Szkolenie · szkoli${kto}` : `Szkolenie · instr.${kto}`;
};

const months = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const monthsGen = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
const dniPelne = ['niedziela','poniedziałek','wtorek','środa','czwartek','piątek','sobota'];
// Data lokalna YYYY-MM-DD — NIGDY przez toISOString (UTC cofa dzień w strefach dodatnich!)
const ymd = (d) => (typeof d === 'string' ? d : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);

// ── Czas pracy (Working Time) — oś od 06:00 ──
const WT_BASE = 360;
const wtToMin = (t) => { const [h, m] = (t || '0:0').split(':').map(Number); return h * 60 + m; };
const wtClock = (m) => { m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const wtRel = (t) => ((wtToMin(t) - WT_BASE) + 1440) % 1440;
const wtDur = (a, b) => { let s = wtToMin(a), e = wtToMin(b); if (e <= s) e += 1440; return e - s; };
const wtKeyLegacy = (s) => `${s.name}|${s.date}|${s.station}|${s.start}|${s.end}`;
// DATA-02/COR-03: klucz wykonania po stabilnym sid — edycja godzin/osoby nie osieroca wpisu
const wtKey = (s) => (s && s.sid ? `sid:${s.sid}` : wtKeyLegacy(s));
const wtAct = (actuals, s) => (actuals || {})[wtKey(s)] || (actuals || {})[wtKeyLegacy(s)];
const wtMonday = (ds) => { const d = new Date(ds); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return ymd(d); };
const wtHours = (min) => (min / 60).toFixed(2).replace('.', ',');
const WT_TICKS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];

// ── Planowanie godzin (plan miesiąca + ręczne godziny MGR / MGR funkcyjne) ──
const dniMiesiaca = (ym) => {
  if (!ym) return [];
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  const out = [];
  for (let d = 1; d <= n; d++) out.push(`${ym}-${String(d).padStart(2, '0')}`);
  return out;
};
const sumaDodatkow = (mapaDni) => Object.values(mapaDni || {}).reduce((a, v) => a + (Number(v) || 0), 0);
const sumaManualWszystkie = (planowanie) => Object.values(planowanie || {}).reduce((a, p) => a + sumaDodatkow(p.mgr) + sumaDodatkow(p.mgrFunk), 0);
const podsumowanieMiesiaca = (shifts, planowanie, ym) => {
  const mShifts = shifts.filter(s => (s.date || '').slice(0, 7) === ym);
  const crew = mShifts.filter(s => !jestMgr(s.station) && !jestSzkolenie(s)).reduce((a, s) => a + godzZ(s), 0);
  const szkol = mShifts.filter(s => jestUczen(s) || jestSzkStacja(s)).reduce((a, s) => a + godzZ(s), 0);
  const mgrSched = mShifts.filter(s => (s.station || '').toUpperCase() === 'MANAGER').reduce((a, s) => a + godzZ(s), 0);
  const funkSched = mShifts.filter(s => (s.station || '').toUpperCase() === 'MGR FUNKCYJNE').reduce((a, s) => a + godzZ(s), 0);
  const p = (planowanie || {})[ym] || {};
  const mgrManual = sumaDodatkow(p.mgr);
  const funkManual = sumaDodatkow(p.mgrFunk);
  const mgr = mgrSched + mgrManual;
  const funk = funkSched + funkManual;
  const total = crew + szkol + mgr + funk;
  const planTotal = Number(p.planTotal) || 0;
  return { crew, szkol, mgrSched, mgrManual, funkSched, funkManual, mgr, funk, total, planTotal, mShifts };
};

// ── Giełda zamian (wyświetlanie) ──
const dfmt = (ds) => { const d = new Date(ds); const dni = ['nd', 'pn', 'wt', 'śr', 'cz', 'pt', 'sb']; return `${dni[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`; };
const opisZmiany = (s) => `${dfmt(s.date)} · ${s.station} · ${s.start}–${s.end} (${s.hours}h)`;
const statusZamiany = (s) => {
  if (s.status === 'approved') return { txt: `Zatwierdzona — przejmuje: ${s.approvedVolunteerDisplay || s.approvedVolunteer}`, kol: '#741334', bg: '#F1E4E8' };
  if (s.status === 'rejected') return { txt: 'Odrzucona', kol: '#B94352', bg: '#F5E3E8' };
  if (s.status === 'cancelled') return { txt: 'Anulowana', kol: '#A38D95', bg: '#EDE3E6' };
  return s.volunteers.length ? { txt: `Zgłoszeń: ${s.volunteers.length}`, kol: '#B86D82', bg: '#F5E9ED' } : { txt: 'Otwarta', kol: colors.primary.medium, bg: colors.primary.bgLight };
};
const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];

const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem('rex_admin_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('rex_admin_' + k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem('rex_admin_' + k); } catch {} }
};

const api = async (path, method = 'GET', body = null) => {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  const tok = store.get('admin_token');
  if (tok) opts.headers.Authorization = `Bearer ${tok}`;               // SEC-01: sesja przy każdym wywołaniu
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API_BASE}${path}`, opts);
  const j = await r.json().catch(() => ({ success: false, error: 'Nieprawidłowa odpowiedź serwera' }));
  if (r.status === 401 && tok) {                                       // sesja wygasła → pełne wylogowanie
    store.del('admin_token'); store.del('admin_session');
    try { location.reload(); } catch {}
  }
  return j;
};

// ===================== UI =====================

const Btn = ({ children, variant = 'primary', icon: Icon, onClick, disabled, loading, className = '' }) => {
  const vars = {
    primary: { bg: colors.primary.dark, text: 'white' },
    secondary: { bg: colors.primary.bg, text: colors.primary.dark },
    danger: { bg: '#B94352', text: 'white' },
    ghost: { bg: 'transparent', text: colors.primary.light },
    accent: { bg: colors.accent.medium, text: 'white' },
    success: { bg: '#A7465F', text: 'white' }
  };
  const v = vars[variant] || vars.primary;
  return <button onClick={onClick} disabled={disabled || loading} className={`px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm ${className}`} style={{ background: v.bg, color: v.text }}>{loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4" />}{children}</button>;
};

const Toast = ({ message, type, onClose }) => { useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]); const bg = { success: '#741334', error: '#B94352', info: '#5A3542' }[type] || colors.primary.medium; return <div className="fixed bottom-4 right-4 px-6 py-3 rounded-xl text-white shadow-lg z-50 flex items-center gap-2" style={{ backgroundColor: bg }}>{type === 'success' ? <Check className="w-5 h-5" /> : type === 'error' ? <X className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}{message}</div>; };

const StatCard = ({ label, value, icon: Icon, color }) => (
  <article className="metric-card">
    <span className="metric-icon" style={{ color, background: `${color}1a` }}><Icon size={18} /></span>
    <div className="metric-copy"><span>{String(label).toUpperCase()}</span><strong>{value}</strong><small>ORDO Workforce Studio</small></div>
    <span className="metric-progress"><i style={{ width: '62%' }} /></span>
  </article>
);

const Header = ({ title, subtitle, children }) => (
  <div className="page-wrap" style={{ paddingTop: 24, paddingBottom: 0 }}>
    <div className="page-heading" style={{ marginBottom: 6 }}>
      <div>
        <div className="eyebrow"><span className="status-pulse" /> ORDO WORKFORCE STUDIO</div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="heading-actions">{children}</div>}
    </div>
  </div>);

// ===================== LOGIN =====================

const Login = ({ onLogin }) => {
  const [login, setLogin] = useState('');
  const [haslo, setHaslo] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [reset, setReset] = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setInfo(''); setLoading(true);
    try {
      if (reset) {
        const r = await api('/admin-auth', 'POST', { action: 'reset-request', login });
        if (r.success) { setInfo(r.message || 'Zgłoszenie wysłane do ASM.'); setReset(false); }
        else setErr(r.error || 'Błąd zgłoszenia');
      } else {
        const r = await api('/admin-auth', 'POST', { login, password: haslo });
        if (r.success) {
          const un = r.userName || login.trim() || 'ASM';
          try { if (window.PasswordCredential && navigator.credentials) { navigator.credentials.store(new window.PasswordCredential({ id: login.trim(), password: haslo, name: un })); } } catch {}
          if (r.token) store.set('admin_token', r.token);
          store.set('admin_session', { at: Date.now(), role: r.role, userName: un });
          try { location.reload(); } catch { onLogin(r.role, un); }
        }
        else setErr(r.error || 'Błąd logowania');
      }
    } catch (e2) { setErr((e2 && e2.message) || 'Błąd połączenia z serwerem'); }
    setLoading(false);
  };
  const [zapamietaj, setZapamietaj] = useState(true);
  const [pokazH, setPokazH] = useState(false);
  return (
    <div className="stl-screen">
      <div className="stl-card">
        <div className="stl-left">
          <form onSubmit={submit}>
            <span className="stl-eyebrow"><Lock size={12} /> DOSTĘP MANAGERSKI</span>
            <h1>{reset ? 'Reset hasła' : 'Zaloguj się do panelu'}</h1>
            <p className="stl-sub">{reset ? 'Podaj identyfikator — ASM otrzyma zgłoszenie i przekaże Ci tymczasowy PIN.' : 'Użyj firmowego adresu e-mail lub identyfikatora menedżera.'}</p>
            {err && <div className="stl-alert err">{err}</div>}
            {info && <div className="stl-alert ok">{info}</div>}
            <label className="stl-label">Identyfikator lub e-mail</label>
            <div className="stl-field">
              <UserCheck size={17} />
              <input type="text" name="username" id="username" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Wpisz identyfikator" disabled={loading} autoFocus />
            </div>
            {!reset && (<>
              <label className="stl-label">Hasło</label>
              <div className="stl-field">
                <Lock size={17} />
                <input type={pokazH ? 'text' : 'password'} name="password" id="current-password" autoComplete="current-password" value={haslo} onChange={(e) => setHaslo(e.target.value)} placeholder="Wpisz hasło" disabled={loading} />
                <button type="button" className="stl-eye" aria-label="Pokaż hasło" onClick={() => setPokazH((v) => !v)}>{pokazH ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </>)}
            <div className="stl-row">
              <label className="stl-check"><input type="checkbox" checked={zapamietaj} onChange={(e) => setZapamietaj(e.target.checked)} /><span>Pozostań zalogowany</span></label>
              <button type="button" className="stl-link" onClick={() => { setReset(!reset); setErr(''); setInfo(''); }}>{reset ? 'Wróć do logowania' : 'Nie pamiętam hasła'}</button>
            </div>
            <button type="submit" className="stl-submit" disabled={loading || !login.trim()}>
              {loading ? 'Chwila…' : reset ? 'Wyślij zgłoszenie resetu' : <>Zaloguj się <ArrowRight size={16} /></>}
            </button>
            <p className="stl-note"><ShieldCheck size={13} /> Dostęp jest chroniony i rejestrowany w dzienniku bezpieczeństwa.</p>
            <p className="stl-foot">ORDO Workforce Studio • {new Date().getFullYear()}</p>
          </form>
        </div>
        <div className="stl-right">
          <div className="stl-brand"><b>ORDO</b><span>WORKFORCE STUDIO</span></div>
          <div className="stl-hero">
            <span className="stl-hero-eyebrow">ZARZĄDZANIE ZESPOŁEM</span>
            <h2>Planowanie pod pełną kontrolą.</h2>
            <p>Jedno uporządkowane środowisko do podejmowania decyzji managerskich.</p>
            <div className="stl-feats">
              <div><i><Calendar size={15} /></i><span>Grafiki i obsada</span><Check size={14} /></div>
              <div><i><Clock3 size={15} /></i><span>Czas pracy i zgodność</span><Check size={14} /></div>
              <div><i><TrendingUp size={15} /></i><span>Koszty i prognozy</span><Check size={14} /></div>
            </div>
          </div>
          <p className="stl-right-foot"><ShieldCheck size={13} /> Autoryzowany dostęp do danych organizacji</p>
        </div>
      </div>
    </div>
  );
};

const HUB_URL = String(import.meta.env.VITE_HUB_URL || 'https://rex-cloud-app.vercel.app');
const MHead = ({ kicker, title, copy, children }) => (
  <div className="module-heading"><div><span>{kicker}</span><h1>{title}</h1><p>{copy}</p></div>{children && <div className="module-actions">{children}</div>}</div>
);
const MMetric = ({ label, value, helper, tone = 'blue', icon: Icon }) => (
  <article className="mini-metric"><div className={`mini-metric-icon ${tone}`}><Icon size={18} /></div><span>{label}</span><strong>{value}</strong><small>{helper}</small></article>
);

// ═════════ OBSADA LIVE (Live Command) — wzorzec ORDO na danych z Employee Hub ═════════
const ObsadaLive = ({ data, setPage }) => {
  const dzis = ymd(new Date());
  const LH = Array.from({ length: 18 }, (_, i) => (8 + i) % 24);       // 08:00–01:00
  const [events, setEvents] = useState([]);
  const [syncAt, setSyncAt] = useState(null);
  const [widokSt, setWidokSt] = useState('stations');
  const terazH = Math.min(17, Math.max(0, (new Date().getHours() < 2 ? new Date().getHours() + 24 : new Date().getHours()) - 8));
  const [hSel, setHSel] = useState(terazH);
  const zaladuj = useCallback(async () => { try { const r = await api('/clock'); if (r && r.success) { setEvents(r.events || []); setSyncAt(new Date()); } } catch {} }, []);
  useEffect(() => { zaladuj(); const t = setInterval(zaladuj, 15000); return () => clearInterval(t); }, [zaladuj]);

  const konta = data.accounts || [];
  const poId = new Map(konta.map((a) => [a.id, a]));
  const poNaz = new Map(konta.flatMap((a) => [a.grafikName, a.name, ...(a.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a])));
  const kontoZ = (x) => poId.get(x.accountId) || poNaz.get(String(x.name || '').toUpperCase().trim()) || null;
  const pelne = (x) => { const k = kontoZ(x); return (k && k.name ? k.name : (x.name || '')); };
  const mnL = (t) => { const [h2, m2] = String(t || '0:0').split(':').map(Number); return h2 * 60 + m2; };
  const zm = (data.shifts || []).filter((x) => x.date === dzis && !jestInstruktor(x));

  // popyt z silnika
  const sp = (((data.salesData || {}).sales) || {})[dzis] || 0;
  const { dir, ind } = optRozbicie(sp, 420, 3, sp ? 'sprzedaz' : 'krzywa', new Date(dzis).getDay());
  const needG = LH.map((h) => { const i0 = (h < 6 ? h + 24 : h) - 6; return Math.ceil(Math.max(dir[i0 * 2] || 0, ind[i0 * 2] || 0, dir[i0 * 2 + 1] || 0, ind[i0 * 2 + 1] || 0)); });
  const kryje = (x, h) => { let a2 = mnL(x.start), b2 = mnL(x.end); if (b2 <= a2) b2 += 1440; let c = h * 60 + 30; if (c < a2 && c + 1440 < b2 + 1) c += 1440; if (h < 6) c = (h + 24) * 60 + 30; return a2 <= c && c < b2; };
  const planG = LH.map((h) => zm.filter((x) => kryje(x, h)).length);

  // stan z odbić Employee Hub (ostatnie zdarzenie na osobę)
  const ostatnie = useMemo(() => { const m = new Map(); (events || []).forEach((e) => { const c = m.get(e.accountId); if (!c || e.at > c.at) m.set(e.accountId, e); }); return m; }, [events]);
  const stanO = (e) => e.type === 'clock_out' ? 'done' : e.type === 'break_start' ? 'break' : 'working';
  const pracuje = [...ostatnie.values()].filter((e) => stanO(e) === 'working');
  const naPrzerwie = [...ostatnie.values()].filter((e) => stanO(e) === 'break');
  const aktG = LH.map((h) => { const s0 = (h < 6 ? h + 24 : h) * 60, s1 = s0 + 60; let n = 0; ostatnie.forEach((last, accId) => { const wej = (events || []).filter((e) => e.accountId === accId && e.type === 'clock_in').map((e) => e.at); const wyj = (events || []).filter((e) => e.accountId === accId && e.type === 'clock_out').map((e) => e.at); if (!wej.length) return; const d0 = new Date(dzis + 'T00:00:00').getTime(); const a2 = Math.min(...wej), b2 = wyj.length ? Math.max(...wyj) : Date.now(); if (a2 - d0 < s1 * 60000 && b2 - d0 > s0 * 60000) n++; }); return n; });

  const bilans = aktG[hSel] - needG[hSel];
  const maxN = Math.max(4, ...needG, ...planG, ...aktG);
  const fmtG = (n) => n.toLocaleString('pl-PL');

  // COL do teraz: koszt przepracowanych godzin / czesc planu sprzedazy
  const terazMin = new Date().getHours() * 60 + new Date().getMinutes();
  let kosztDo = 0, hDo = 0;
  zm.forEach((x) => { const a2 = mnL(x.start); let b2 = mnL(x.end); if (b2 <= a2) b2 += 1440; const kon = Math.min(b2, terazMin < a2 ? a2 : terazMin); const g = Math.max(0, (kon - a2) / 60); hDo += g; kosztDo += kosztGodzin(kontoZ(x), g); });
  const frakcja = Math.min(1, Math.max(0.05, (terazMin - 360) / 1200));
  const colTeraz = sp ? (kosztDo / (sp * frakcja) * 100) : null;

  // asystent: pierwsza przyszla luka
  const luka = LH.map((h, i) => ({ h, i, def: needG[i] - planG[i] })).filter((x) => x.i >= terazH && x.def > 0)[0] || null;

  // stacje operacyjne o wybranej godzinie
  const naGodzinie = zm.filter((x) => kryje(x, LH[hSel]));
  const grupySt = {};
  naGodzinie.forEach((x) => { const st2 = (x.station || 'OBSADA').toUpperCase(); (grupySt[st2] = grupySt[st2] || []).push(x); });
  const imie = (x) => String(pelne(x)).split(/\s+/)[0];

  const OPIS_EV = { clock_in: 'rozpoczyna zmianę', clock_out: 'kończy zmianę', break_start: 'wychodzi na przerwę', break_end: 'wraca z przerwy' };
  const TON_EV = { clock_in: 'green', clock_out: 'warn', break_start: 'blue', break_end: 'green' };
  const osEv = [...(events || [])].sort((a2, b2) => b2.at - a2.at).slice(0, 6);
  const hhmm = (ts) => new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const nazwaEv = (e) => { const k = poId.get(e.accountId); return k ? k.name : (e.name || 'Pracownik'); };

  // przerwy: zmiany >= 6 h, sugerowana w polowie
  const przerwy = zm.filter((x) => godzZ(x) >= 6).map((x) => { const a2 = mnL(x.start); let b2 = mnL(x.end); if (b2 <= a2) b2 += 1440; const c = Math.round((a2 + (b2 - a2) / 2) / 30) * 30; return { t: `${String(Math.floor(c / 60) % 24).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`, name: pelne(x), dur: godzZ(x) >= 8 ? '30 min' : '20 min', c }; }).sort((a2, b2) => a2.c - b2.c).slice(0, 6);

  return (
    <div className="page-wrap module-view live-view">
      <MHead kicker={`LIVE COMMAND • ${new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' }).toUpperCase()} • ${new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`} title="Obsada w ciągu dnia" copy="Porównuj plan, realne odbicia i popyt co 15 minut. Reaguj zanim luka wpłynie na service.">
        <button className="secondary-action" onClick={zaladuj}><RefreshCw size={16} /> Odśwież{syncAt ? ` • ${syncAt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}` : ''}</button>
        <button className="primary-action" onClick={() => setPage('swaps')}><Smartphone size={16} /> Wyślij do zmiany</button>
      </MHead>
      <section className="live-kpis">
        <MMetric icon={Users} label="Obecni / potrzeba" value={`${pracuje.length + naPrzerwie.length} / ${needG[terazH] || 0}`} helper={pracuje.length + naPrzerwie.length < (needG[terazH] || 0) ? `${pracuje.length + naPrzerwie.length - needG[terazH]} osoba teraz` : 'obsada wystarczająca'} tone={pracuje.length + naPrzerwie.length < (needG[terazH] || 0) ? 'coral' : 'mint'} />
        <MMetric icon={Activity} label="Na przerwie" value={`${naPrzerwie.length}`} helper={naPrzerwie.length ? 'monitoruj powroty' : 'wszyscy na stanowiskach'} tone="blue" />
        <MMetric icon={Gauge} label="Godziny do teraz" value={`${hDo.toFixed(1).replace('.', ',')} h`} helper="z planu dnia" tone="violet" />
        <MMetric icon={CircleDollarSign} label="COL do teraz" value={colTeraz != null ? `${colTeraz.toFixed(1).replace('.', ',')}%` : '—'} helper={sp ? `plan sprzedaży ${fmtG(Math.round(sp))} zł` : 'brak planu sprzedaży'} tone="mint" />
      </section>

      <section className="live-main-grid">
        <article className="panel live-curve-panel">
          <div className="panel-title"><div><span>KRZYWA DNIA</span><h2>Popyt i aktywni pracownicy</h2></div><div className="live-clock"><i /> {String(LH[hSel]).padStart(2, '0')}:00</div></div>
          <div className="live-curve">
            {needG.map((need, i) => (
              <button key={i} className={i === hSel ? 'active' : ''} onClick={() => setHSel(i)}>
                <span className="need-bar" style={{ height: `${Math.max(need, 1) / maxN * 100}%` }}><i style={{ height: `${need ? Math.min(planG[i] / Math.max(need, 1), 1.15) * 100 : 0}%` }} /><b style={{ height: `${need ? Math.min(aktG[i] / Math.max(need, 1), 1.15) * 100 : 0}%` }} /></span>
                <small>{i % 2 === 0 ? String(LH[i]).padStart(2, '0') : ''}</small>
              </button>
            ))}
          </div>
          <div className="live-slider"><span>08:00</span><input type="range" min="0" max="17" value={hSel} onChange={(e) => setHSel(Number(e.target.value))} /><span>01:00</span></div>
          <div className="live-hour-detail">
            <div><span>Prognoza sprzedaży</span><strong>{sp ? `${fmtG(Math.round(sp * (needG[hSel] || 1) / Math.max(1, needG.reduce((a2, x) => a2 + x, 0))))} zł` : '—'}</strong></div>
            <div><span>Godzina</span><strong>{String(LH[hSel]).padStart(2, '0')}:00</strong></div>
            <div><span>Plan</span><strong>{planG[hSel]} osób</strong></div>
            <div><span>Realnie</span><strong>{aktG[hSel]} osób</strong></div>
            <div className={bilans < 0 ? 'bad' : 'good'}><span>Bilans</span><strong>{bilans > 0 ? '+' : ''}{bilans}</strong></div>
          </div>
        </article>

        <article className="panel live-reco-panel">
          <div className="panel-title"><div><span>ASYSTENT ZMIANY</span><h2>Najlepsza decyzja</h2></div><Bot size={21} /></div>
          <div className="reco-confidence"><span>Pewność rekomendacji</span><strong>{luka ? '88%' : '95%'}</strong><i><b /></i></div>
          <div className="reco-card">
            <div className="reco-icon"><ArrowLeftRight size={20} /></div>
            <strong>{luka ? `Wzmocnij obsadę o ${String(luka.h).padStart(2, '0')}:00` : 'Obsada zgodna z planem'}</strong>
            <p>{luka ? `Brakuje ${luka.def} ${luka.def === 1 ? 'osoby' : 'osób'} względem popytu. Przesuń zmianę lub dodaj krótką zmianę w siatce dnia.` : 'Silnik nie widzi luk względem popytu do końca doby. Monitoruję odbicia z Employee Hub.'}</p>
            <div className="reco-impact"><span><i className="positive" />Pokrycie <b>{luka ? `+${luka.def} os.` : 'stabilne'}</b></span><span><i className="positive" />Koszt <b>{luka ? 'wg stawki' : 'bez zmian'}</b></span><span><i className="positive" />Popyt <b>{needG[luka ? luka.i : hSel]} os.</b></span></div>
            <button onClick={() => setPage('wt')}><Zap size={16} /> Otwórz siatkę dnia</button>
          </div>
          <button className="reco-alternative" onClick={() => setPage('forecast')}><span>Zobacz plan i popyt</span><ChevronDown size={16} /></button>
        </article>
      </section>

      <article className="panel station-panel">
        <div className="panel-title"><div><span>ROZMIESZCZENIE • {String(LH[hSel]).padStart(2, '0')}:00</span><h2>Stacje operacyjne</h2></div><div className="segmented"><button className={widokSt === 'stations' ? 'active' : ''} onClick={() => setWidokSt('stations')}>Stacje</button><button className={widokSt === 'people' ? 'active' : ''} onClick={() => setWidokSt('people')}>Osoby</button></div></div>
        <div className="station-grid">
          {widokSt === 'stations'
            ? Object.keys(grupySt).sort().map((st2) => { const os = grupySt[st2]; return (
                <article className="station-card mint" key={st2}>
                  <div className="station-top"><span>{st2}</span><em>{os.length}/{os.length}</em></div>
                  <div className="station-people"><div className="mini-avatars">{os.slice(0, 2).map((x, i) => <i key={i}>{imie(x)[0]}</i>)}{os.length > 2 && <i>+</i>}</div><strong>{os.map(imie).join(', ')}</strong></div>
                  <div className="station-state"><CheckCircle2 size={14} /> Obsada pełna</div>
                </article>
              ); })
            : naGodzinie.map((x, i) => (
                <article className="station-card mint" key={i}>
                  <div className="station-top"><span>{(x.station || 'OBSADA').toUpperCase()}</span><em>{x.start}–{x.end}</em></div>
                  <div className="station-people"><div className="mini-avatars"><i>{String(pelne(x)).split(/\s+/).map((c) => c[0]).join('').slice(0, 2)}</i></div><strong>{pelne(x)}</strong></div>
                  <div className="station-state"><CheckCircle2 size={14} /> {ostatnie.size && [...ostatnie.entries()].some(([id, e]) => { const k = poId.get(id); return k && k.name === pelne(x) && stanO(e) === 'working'; }) ? 'Na stanowisku' : 'Wg planu'}</div>
                </article>
              ))}
          {bilans < 0 && widokSt === 'stations' && (
            <article className="station-card coral"><div className="station-top"><span>LUKA OBSADY</span><em>{aktG[hSel]}/{needG[hSel]}</em></div><div className="station-people"><strong>Popyt wyższy niż obsada</strong></div><div className="station-state"><AlertTriangle size={14} /> Brakuje {needG[hSel] - aktG[hSel]}</div></article>
          )}
          {!naGodzinie.length && <article className="station-card"><div className="station-top"><span>BRAK ZMIAN</span></div><div className="station-people"><strong>Nikt nie jest zaplanowany o tej godzinie</strong></div></article>}
        </div>
      </article>

      <section className="live-bottom-grid">
        <article className="panel alerts-timeline">
          <div className="panel-title"><div><span>ZDARZENIA</span><h2>Oś zmiany</h2></div><button className="quiet-link" onClick={() => setPage('wt')}>Pełna historia</button></div>
          {osEv.length ? osEv.map((e, i) => <div className="timeline-item" key={i}><strong>{hhmm(e.at)}</strong><i className={TON_EV[e.type] || 'blue'} /><span>{nazwaEv(e)} {OPIS_EV[e.type] || e.type}</span></div>) : <div className="timeline-item"><strong>—</strong><i className="blue" /><span>Brak odbić z Employee Hub dzisiaj</span></div>}
        </article>
        <article className="panel break-board">
          <div className="panel-title"><div><span>PRZERWY</span><h2>Sugerowany plan</h2></div><span className="break-safe"><ShieldCheck size={14} /> {przerwy.length ? 'bez ryzyka' : 'brak długich zmian'}</span></div>
          {przerwy.map((x, i) => <div className="break-row" key={i}><strong>{x.t}</strong><span>{x.name}</span><em>{x.dur}</em></div>)}
        </article>
      </section>
    </div>
  );
};

// ═════════ DYSPOZYCYJNOŚĆ — kolejka decyzji wg wzorca ORDO (realne endpointy) ═════════
const KolejkaWn = ({ title, kicker, icon: Icon, items, onSelect }) => (
  <article className="panel request-queue">
    <div className="panel-title"><div><span>{kicker}</span><h2>{title}</h2></div><Icon size={19} /></div>
    <div className="request-list">
      {items.map((it) => (
        <button key={it.id} onClick={() => onSelect(it)}>
          <i>{String(it.name).split(/\s|→/).filter(Boolean).slice(0, 2).map((c) => c[0]).join('')}</i>
          <span><strong>{it.name}</strong><small>{it.meta}</small><em>{it.detail}</em></span>
          <b className={`request-status ${it.status}`}>{it.conflict && it.status === 'pending' ? 'Konflikt' : it.status === 'pending' ? 'Do decyzji' : it.status === 'approved' ? 'Zatwierdzone' : 'Odrzucone'}</b>
          <ChevronRight size={16} />
        </button>
      ))}
      {!items.length && <div className="dialog-empty" style={{ padding: 14 }}>Brak zgłoszeń.</div>}
    </div>
  </article>
);

const RequestsAdmin = ({ data, setPage }) => {
  const [reqs, setReqs] = useState([]);
  const [absencje, setAbsencje] = useState([]);
  const [okno, setOkno] = useState(null);
  const [pub, setPub] = useState(null);
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const mc = new Date().toISOString().slice(0, 7);
  const zaladuj = useCallback(() => {
    api('/availability?reqs=1').then((r) => { if (r && r.success) setReqs(r.requests || []); }).catch(() => {});
    api('/absences').then((r) => { if (r && r.success) setAbsencje(r.absences || []); }).catch(() => {});
    api('/availability?window=1').then((r) => { if (r && r.success) setOkno(r.okno); }).catch(() => {});
    api(`/schedule?action=pubinfo&pubmonth=${mc}`).then((r) => { if (r && r.success) setPub(r); }).catch(() => {});
  }, []);
  useEffect(zaladuj, [zaladuj]);

  const dPL = (d) => d ? new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00')) : '';
  const DY_OP = { available: 'Dostępny cały dzień', unavailable: 'Niedostępny cały dzień', from_time: 'Dostępny od', until_time: 'Dostępny do', specific_shift: 'Preferowana zmiana' };
  const avItems = reqs.map((r) => ({ id: `av-${r.id}`, rid: r.id, kind: 'availability', name: r.name, meta: dPL(r.date), detail: `${DY_OP[r.type] || r.type}${r.type === 'from_time' ? ` ${r.startTime}` : r.type === 'until_time' ? ` ${r.endTime}` : r.type === 'specific_shift' ? ` ${r.startTime}–${r.endTime}` : ''}`, status: r.status, conflict: !!r.conflict })).sort((a2, b2) => (a2.status === 'pending' ? 0 : 1) - (b2.status === 'pending' ? 0 : 1)).slice(0, 6);
  const AB_OP = { urlop: 'Urlop wypoczynkowy', uz: 'Urlop na żądanie', l4: 'Zwolnienie (L4)', inne: 'Inna absencja' };
  const abItems = absencje.map((a2) => ({ id: `ab-${a2.id}`, rid: a2.id, kind: 'absence', name: a2.name, meta: `${a2.from} – ${a2.to}`, detail: `${AB_OP[a2.type] || a2.type}${a2.reason ? ` • „${a2.reason}"` : ''}`, status: a2.status === 'open' ? 'pending' : a2.status })).sort((a2, b2) => (a2.status === 'pending' ? 0 : 1) - (b2.status === 'pending' ? 0 : 1)).slice(0, 6);
  const swItems = (data.swaps || []).map((x) => ({ id: `sw-${x.id}`, rid: x.id, kind: 'swap', name: x.volunteers && x.volunteers.length ? `${x.requester} → ${x.volunteers[0]}` : x.requester, meta: `${dPL(x.date)} • ${x.start}–${x.end}`, detail: `${x.station || 'Zmiana'}${x.volunteers && x.volunteers.length ? ' • jest ochotnik — decyzja w Zamianach' : ' • czeka na ochotnika'}`, status: x.status === 'open' ? 'pending' : 'approved' })).sort((a2, b2) => (a2.status === 'pending' ? 0 : 1) - (b2.status === 'pending' ? 0 : 1)).slice(0, 5);

  const pending = avItems.concat(abItems, swItems).filter((x) => x.status === 'pending').length;
  const konflikty = avItems.filter((x) => x.conflict && x.status === 'pending').length;
  const zaakcept = avItems.concat(abItems).filter((x) => x.status === 'approved').length;

  const decyzja = async (status) => {
    if (!sel) return; setBusy(true);
    let r;
    if (sel.kind === 'availability') r = await api('/availability?action=decide', 'POST', { id: sel.rid, status, managerNote: '' });
    else if (sel.kind === 'absence') r = await api('/absences', 'PUT', { id: sel.rid, action: status === 'approved' ? 'approve' : 'reject' });
    setBusy(false);
    if (r && r.success) { data.show(status === 'approved' ? 'Decyzja zatwierdzona i przekazana do grafiku' : 'Wniosek odrzucony z zapisem w historii'); setSel(null); zaladuj(); }
    else data.show((r && r.error) || 'Błąd zapisu decyzji', 'error');
  };
  const przelaczOkno = async () => {
    if (!okno) return;
    const r = await api('/availability?action=window', 'POST', { open: !okno.otwarte });
    if (r.success) { setOkno(r.okno); data.show(r.okno.otwarte ? 'Okno dyspozycji otwarte' : 'Okno dyspozycji zamknięte'); }
    else data.show(r.error || 'Błąd', 'error');
  };
  const publikuj = async () => {
    setBusy(true);
    const r = await api('/schedule?action=publish', 'POST', { month: mc });
    setBusy(false);
    if (r.success) { data.show(`Opublikowano ${mc} — wersja ${r.wersjaPub}. Pracownicy widzą grafik w Employee Hub.`); zaladuj(); }
    else data.show(r.error || 'Błąd publikacji', 'error');
  };
  const opublikowany = !!(pub && pub.opublikowany);
  const krokIdx = opublikowany ? 2 : 0;
  const KROKI = [['Wersja robocza', 'Edycja przez managerów'], ['Wstępny', 'Widoczny do potwierdzenia'], ['Opublikowany', 'Obowiązujący dla zespołu'], ['Zakończony', 'Zamknięty do rozliczenia']];

  // pokrycie dostępnością: następny tydzień (pon–nd)
  const pon = (() => { const d = new Date(); d.setDate(d.getDate() + (8 - ((d.getDay() + 6) % 7 + 1))); return d; })();
  const kontaN = Math.max(1, (data.accounts || []).length);
  const pokrycie = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(pon); d.setDate(pon.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const niedost = reqs.filter((r) => r.date === iso && r.type === 'unavailable' && r.status !== 'rejected').length;
    return { d: ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'][i], v: Math.max(0, Math.round((kontaN - niedost) / kontaN * 100)) };
  });
  const mcNazwa = new Intl.DateTimeFormat('pl-PL', { month: 'long' }).format(new Date());

  return (
    <div className="flex-1 overflow-y-auto"><div className="page-wrap module-view requests-view" style={{ width: '100%' }}>
      <MHead kicker="WORKFORCE • DYSPOZYCYJNOŚĆ" title="Dyspozycyjność" copy="Jedna kolejka decyzji dla dostępności, absencji i zamian — powiązana bezpośrednio z grafikiem dziennym.">
        <button className="secondary-action" onClick={przelaczOkno}><CalendarCheck2 size={16} /> {okno && okno.otwarte ? 'Zamknij okno' : 'Otwórz okno'}</button>
        <button className="primary-action" disabled={busy} onClick={publikuj}><CheckCircle2 size={16} /> {opublikowany ? 'Opublikuj nową wersję' : 'Opublikuj grafik'}</button>
      </MHead>
      <section className="request-kpis">
        <MMetric icon={Clock3} label="Do decyzji" value={`${pending} zgłoszeń`} helper="w jednej kolejce" tone={pending ? 'coral' : 'mint'} />
        <MMetric icon={AlertTriangle} label="Konflikty z grafikiem" value={`${konflikty} ${konflikty === 1 ? 'pozycja' : 'pozycje'}`} helper={konflikty ? 'wymagają korekty' : 'brak kolizji'} tone={konflikty ? 'violet' : 'mint'} />
        <MMetric icon={UserCheck} label="Zaakceptowane" value={`${zaakcept} ${zaakcept === 1 ? 'pozycja' : 'pozycje'}`} helper="w widocznej kolejce" tone="blue" />
        <MMetric icon={Calendar} label="Okno dyspozycji" value={okno ? (okno.otwarte ? 'Otwarte' : 'Zamknięte') : '—'} helper={okno ? `${okno.targetMonth || ''} • termin: 20.` : 'ładowanie'} tone="mint" />
      </section>
      <section className="requests-layout">
        <div className="request-columns">
          <KolejkaWn title="Dyspozycyjność" kicker="PREFERENCJE PRACOWNIKÓW" icon={CalendarCheck2} items={avItems} onSelect={setSel} />
          <KolejkaWn title="Absencje i urlopy" kicker="SALDA I KOLIZJE" icon={Coffee} items={abItems} onSelect={setSel} />
          <KolejkaWn title="Giełda zamian" kicker="KWALIFIKACJE I ODPOCZYNEK" icon={ArrowLeftRight} items={swItems} onSelect={(it) => setPage('swaps')} />
        </div>
        <aside className="request-side">
          <article className="panel publication-panel">
            <div className="panel-title"><div><span>OBIEG GRAFIKU</span><h2>Publikacja {mcNazwa}</h2></div><CheckCircle2 size={19} /></div>
            <div className="publication-steps">
              {KROKI.map(([nazwa, ops], i) => (
                <div key={nazwa} className={i < krokIdx ? 'done' : i === krokIdx ? 'current' : ''}><i>{i < krokIdx ? <Check size={13} /> : i + 1}</i><span><strong>{nazwa}{i === 2 && opublikowany && pub.wersjaPub ? ` (v${pub.wersjaPub})` : ''}</strong><small>{ops}</small></span></div>
              ))}
            </div>
            <button className="full-secondary" disabled={busy} onClick={publikuj}>Przejdź do kolejnego etapu <ChevronRight size={16} /></button>
          </article>
          <article className="panel availability-map">
            <div className="panel-title"><div><span>NASTĘPNY TYDZIEŃ</span><h2>Pokrycie dostępnością</h2></div><Gauge size={19} /></div>
            {pokrycie.map((x) => <div className="availability-coverage" key={x.d}><span>{x.d}</span><i><b style={{ width: `${x.v}%` }} /></i><strong>{x.v}%</strong></div>)}
            <div className="request-note"><ShieldCheck size={16} /><span>Publikacja blokuje zmiany niezgodne z zatwierdzoną dyspozycyjnością i absencjami.</span></div>
          </article>
        </aside>
      </section>
      {sel && (
        <DialogS title={sel.name} kicker={sel.kind === 'availability' ? 'DYSPOZYCYJNOŚĆ' : 'WNIOSEK O NIEOBECNOŚĆ'} description={`${sel.meta} • ${sel.detail}`} onClose={() => setSel(null)}
          actions={sel.status === 'pending' ? <><button onClick={() => decyzja('rejected')} disabled={busy}><X size={15} /> Odrzuć</button><button className="dialog-primary" disabled={busy} onClick={() => decyzja('approved')}><Check size={15} /> Zatwierdź</button></> : <button className="dialog-primary" onClick={() => setSel(null)}>Gotowe</button>}>
          <div className="dialog-stat-grid"><div className="dialog-stat"><span>Status</span><strong>{sel.status === 'pending' ? 'Do decyzji' : sel.status === 'approved' ? 'Zatwierdzone' : 'Odrzucone'}</strong></div><div className="dialog-stat"><span>Konflikt</span><strong>{sel.conflict ? 'Tak' : 'Nie'}</strong></div><div className="dialog-stat"><span>Typ</span><strong>{sel.kind === 'availability' ? 'Dyspozycja' : 'Absencja'}</strong></div></div>
          <div className="dialog-notice"><ShieldCheck size={16} /><span>System sprawdził kolizje z opublikowanym grafikiem. Decyzja trafi do dziennika audytu.</span></div>
        </DialogS>
      )}
    </div></div>
  );
};

// ═════════ ANALITYKA PRACY — wzorzec ORDO na realnych agregatach ═════════
const AnalyticsPage = ({ data, setPage }) => {
  const konta = data.accounts || [];
  const poIdA = new Map(konta.map((a2) => [a2.id, a2]));
  const poNazA = new Map(konta.flatMap((a2) => [a2.grafikName, a2.name, ...(a2.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a2])));
  const kontoZA = (x) => poIdA.get(x.accountId) || poNazA.get(String(x.name || '').toUpperCase().trim()) || null;
  const MGRA = new Set(['RGM', 'ASM']);
  const FUNKA = new Set(['SM', 'JSM']);

  const agreg = useMemo(() => {
    const m = new Map();
    (data.shifts || []).filter((x) => x.date && !jestInstruktor(x)).forEach((x) => {
      const k = x.date.slice(0, 7);
      const o = m.get(k) || { h: 0, koszt: 0, crew: 0, mgr: 0, funk: 0, szkol: 0 };
      const g = godzZ(x); const kt = kontoZA(x);
      o.h += g; o.koszt += kosztGodzin(kt, g);
      if (x.rola === 'training') o.szkol += g;
      else if (kt && MGRA.has(kt.funkcja)) o.mgr += g;
      else if (kt && FUNKA.has(kt.funkcja)) o.funk += g;
      else o.crew += g;
      m.set(k, o);
    });
    Object.entries(((data.salesData || {}).sales) || {}).forEach(([d, v]) => {
      const k = String(d).slice(0, 7);
      const o = m.get(k) || { h: 0, koszt: 0, crew: 0, mgr: 0, funk: 0, szkol: 0 };
      o.sprzedaz = (o.sprzedaz || 0) + (Number(v) || 0);
      m.set(k, o);
    });
    return [...m.entries()].sort((a2, b2) => a2[0].localeCompare(b2[0])).slice(-12);
  }, [data.shifts, data.salesData, konta]);

  const sumS = agreg.reduce((a2, [, o]) => a2 + (o.sprzedaz || 0), 0);
  const sumK = agreg.reduce((a2, [, o]) => a2 + o.koszt, 0);
  const sumH = agreg.reduce((a2, [, o]) => a2 + o.h, 0);
  const colR = sumS ? (sumK / sumS * 100) : null;
  const splh = sumH ? sumS / sumH : null;
  const maxS = Math.max(1, ...agreg.map(([, o]) => o.sprzedaz || 0));
  const colD = agreg.map(([, o]) => o.sprzedaz ? o.koszt / o.sprzedaz * 100 : null);
  const colMin = Math.min(...colD.filter((v) => v != null), 15), colMax = Math.max(...colD.filter((v) => v != null), 30);
  const mcL = (k) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'][Number(k.slice(5, 7)) - 1];
  const fmtA = (n) => Math.round(n).toLocaleString('pl-PL');

  const dniComp = Object.entries(((data.ts || {}).completed) || {}).filter(([, v]) => v).length;
  const dniZmian = new Set((data.shifts || []).map((x) => x.date)).size;
  const zgodnosc = dniZmian ? Math.min(100, Math.round(dniComp / dniZmian * 100)) : 0;

  const crewS = agreg.reduce((a2, [, o]) => a2 + o.crew, 0), mgrS = agreg.reduce((a2, [, o]) => a2 + o.mgr, 0), funkS = agreg.reduce((a2, [, o]) => a2 + o.funk, 0), szkS = agreg.reduce((a2, [, o]) => a2 + o.szkol, 0);
  const tot = Math.max(1, crewS + mgrS + funkS + szkS);
  const pc = (v) => `${Math.round(v / tot * 100)}%`;
  const donut = `conic-gradient(#741334 0 ${crewS / tot * 360}deg, #5A3542 ${crewS / tot * 360}deg ${(crewS + mgrS) / tot * 360}deg, #A7465F ${(crewS + mgrS) / tot * 360}deg ${(crewS + mgrS + funkS) / tot * 360}deg, #B86D82 ${(crewS + mgrS + funkS) / tot * 360}deg 360deg)`;

  // wnioski heurystyczne z danych
  const dow = Array.from({ length: 7 }, () => ({ h: 0, s: 0 }));
  (data.shifts || []).filter((x) => x.date && !jestInstruktor(x)).forEach((x) => { const d = new Date(x.date + 'T12:00:00').getDay(); dow[(d + 6) % 7].h += godzZ(x); });
  Object.entries(((data.salesData || {}).sales) || {}).forEach(([d, v]) => { const i = (new Date(d + 'T12:00:00').getDay() + 6) % 7; dow[i].s += Number(v) || 0; });
  const dniN = ['poniedziałki', 'wtorki', 'środy', 'czwartki', 'piątki', 'soboty', 'niedziele'];
  const najdrozszy = dow.map((o, i) => ({ i, r: o.s ? o.h / o.s * 1000 : 0 })).filter((x) => x.r).sort((a2, b2) => b2.r - a2.r)[0];
  const wnioski = [
    najdrozszy ? [`Przejrzyj obsadę w ${dniN[najdrozszy.i]}`, `najwyższy stosunek godzin do sprzedaży`, `Potencjał: obniżenie COL`, 'save'] : ['Uzupełnij dane sprzedaży', 'import w Planowaniu i popycie', 'Odblokuje analizę COL', 'save'],
    [`Szkolenia: ${szkS.toFixed(0)} h w okresie`, szkS ? 'sprawdź rozliczenie par instruktor–uczeń' : 'brak godzin szkoleniowych', `${pc(szkS)} wszystkich godzin`, 'skill'],
    [zgodnosc < 100 ? 'Domknij karty czasu' : 'Karty czasu domknięte', `${dniComp}/${dniZmian} dni oznaczonych Completed`, `Zgodność: ${zgodnosc}%`, 'forecast'],
  ];

  const eksport = () => {
    const rows = ['Miesiąc;Sprzedaż;Koszt;Godziny;COL %', ...agreg.map(([k, o]) => `${k};${Math.round(o.sprzedaz || 0)};${Math.round(o.koszt)};${o.h.toFixed(1)};${o.sprzedaz ? (o.koszt / o.sprzedaz * 100).toFixed(1) : ''}`)];
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(blob); const a2 = document.createElement('a'); a2.href = u; a2.download = 'analityka-pracy-r12.csv'; a2.click(); URL.revokeObjectURL(u);
  };

  return (
    <div className="flex-1 overflow-y-auto"><div className="page-wrap module-view analytics-view" style={{ width: '100%' }}>
      <MHead kicker="OPERATIONAL INSIGHTS • R12" title="Analityka pracy" copy="Jeden obraz kosztu, produktywności, zgodności, jakości prognozy i doświadczenia pracowników.">
        <button className="secondary-action" onClick={() => setPage('forecast')}><Calendar size={16} /> Planowanie i popyt</button>
        <button className="primary-action" onClick={eksport}><Download size={16} /> Eksport raportu</button>
      </MHead>
      <section className="analytics-kpis">
        <MMetric icon={CircleDollarSign} label="COL R12" value={colR != null ? `${colR.toFixed(1).replace('.', ',')}%` : '—'} helper={colR != null ? 'koszt / sprzedaż' : 'brak danych sprzedaży'} tone="mint" />
        <MMetric icon={Gauge} label="SPLH" value={splh != null ? `${Math.round(splh)} zł` : '—'} helper="sprzedaż / roboczogodzina" tone="blue" />
        <MMetric icon={Clock3} label="Godziny (okres)" value={`${fmtA(sumH)} h`} helper={`${agreg.length} mies. z danymi`} tone="violet" />
        <MMetric icon={ShieldCheck} label="Zgodność grafików" value={`${zgodnosc}%`} helper={`${dniComp}/${dniZmian} dni Completed`} tone="mint" />
      </section>
      <section className="analytics-grid">
        <article className="panel performance-chart">
          <div className="panel-title"><div><span>SPRZEDAŻ VS COST OF LABOUR</span><h2>Wzrost przy malejącym udziale kosztu</h2></div><div className="forecast-legend"><span><i className="sales-key" />Sprzedaż tys.</span><span><i className="hours-key" />COL %</span></div></div>
          <div className="dual-chart">
            {agreg.map(([k, o], i) => (
              <div key={k} title={`${k}: ${fmtA(o.sprzedaz || 0)} zł • COL ${colD[i] != null ? colD[i].toFixed(1) : '—'}%`}>
                <i style={{ height: `${(o.sprzedaz || 0) / maxS * 100}%` }} />
                {colD[i] != null && <b style={{ bottom: `${((colD[i] - colMin) / Math.max(1, colMax - colMin)) * 80 + 8}%` }} />}
                {i % 2 === 0 && <span>{mcL(k)}</span>}
              </div>
            ))}
          </div>
          <div className="chart-callout"><TrendingUp size={17} /><span>{sumS ? `Sprzedaż ${fmtA(sumS)} zł w okresie, COL ${colR.toFixed(1).replace('.', ',')}%.` : 'Zaimportuj sprzedaż, aby zobaczyć pełny obraz COL.'}</span></div>
        </article>
        <article className="panel insights-panel">
          <div className="panel-title"><div><span>WNIOSKI</span><h2>Co warto zrobić</h2></div><Sparkles size={20} /></div>
          {wnioski.map(([title, detail, impact, tone]) => <button className="insight-item" key={title} onClick={() => setPage(tone === 'save' ? 'forecast' : tone === 'skill' ? 'wt' : 'wt')}><i className={tone}><Sparkles size={16} /></i><div><strong>{title}</strong><span>{detail}</span><em>{impact}</em></div><ChevronRight size={17} /></button>)}
        </article>
        <article className="panel category-cost-panel">
          <div className="panel-title"><div><span>KOSZT WEDŁUG GRUP</span><h2>Struktura roboczogodzin</h2></div><strong>{fmtA(sumK)} zł</strong></div>
          <div className="donut-layout">
            <div className="cost-donut" style={{ background: donut }}><div><strong>{fmtA(sumH)} h</strong><span>total</span></div></div>
            <div>{[['Crew', pc(crewS), '#741334'], ['Manager', pc(mgrS), '#5A3542'], ['Mgr funkcyjny', pc(funkS), '#A7465F'], ['Szkolenia', pc(szkS), '#B86D82']].map(([label, value, color]) => <div className="donut-key" key={label}><span><i style={{ background: color }} />{label}</span><strong>{value}</strong></div>)}</div>
          </div>
        </article>
        <article className="panel forecast-quality-panel">
          <div className="panel-title"><div><span>JAKOŚĆ DANYCH</span><h2>Kompletność okresu</h2></div><em>{zgodnosc}%</em></div>
          {[['Dni z grafikiem', `${dniZmian}`, 100], ['Dni ze sprzedażą', `${Object.keys(((data.salesData || {}).sales) || {}).length}`, dniZmian ? Math.min(100, Object.keys(((data.salesData || {}).sales) || {}).length / dniZmian * 100) : 0], ['Dni Completed', `${dniComp}`, zgodnosc], ['Zmiany z kontem', `${Math.round((data.shifts || []).filter((x) => x.accountId).length / Math.max(1, (data.shifts || []).length) * 100)}%`, (data.shifts || []).filter((x) => x.accountId).length / Math.max(1, (data.shifts || []).length) * 100]].map(([label, value, score]) => (
            <div className="quality-row" key={String(label)}><span>{label}</span><div><i style={{ width: `${score}%` }} /></div><strong>{value}</strong></div>
          ))}
        </article>
      </section>
    </div></div>
  );
};

const Sidebar = ({ page, setPage, logout, role, pendingSwaps = 0, wrTab, setWrTab, bumpWr, userName, mini, setMini, open, onClose }) => {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'main' },
    { id: 'forecast', label: 'Planowanie i popyt', icon: TrendingUp, section: 'main' },
    { id: 'live', label: 'Obsada LIVE', icon: Activity, live: true, section: 'main' },
    { id: 'wr-schedule', page: 'wt', wr: 'schedule', label: 'Schedule', icon: Calendar, section: 'workforce' },
    { id: 'wr-actual', page: 'wt', wr: 'actual', label: 'Actual', icon: Activity, section: 'workforce' },
    { id: 'wr-blueprints', page: 'wt', wr: 'blueprints', label: 'Blueprints', icon: BookOpen, section: 'workforce' },
    { id: 'wr-cycles', page: 'wt', wr: 'cycles', label: 'ShiftCycles', icon: TimerReset, section: 'workforce' },
    { id: 'wr-tna', page: 'wt', wr: 'tna', label: 'Time & Attendance', icon: Clock3, live: true, section: 'workforce' },
    { id: 'dyspo', label: 'Dyspozycyjność', icon: CalendarCheck2, section: 'workforce' },
    { id: 'emps', label: 'Pracownicy i konta', icon: Users, section: 'team' },
    { id: 'analytics', label: 'Analityka', icon: TrendingUp, section: 'tools' },
    { id: 'swaps', label: 'Zamiany i wnioski', icon: RefreshCw, badge: pendingSwaps || null, section: 'team' },
    { id: 'import', label: 'Import / eksport godzin', icon: Upload, section: 'tools' },
  ];
  const sections = [['main', 'GŁÓWNE'], ['workforce', 'WORKFORCE'], ['team', 'ZESPÓŁ'], ['tools', 'NARZĘDZIA']];
  const widoczne = role === 'asm' ? null : ['dashboard', 'wt'];
  const klik = (m) => { if (m.page === 'wt') { setPage('wt'); setWrTab(m.wr); bumpWr(); } else setPage(m.id); };
  const aktywny = (m) => page === (m.page || m.id) && (!m.wr || wrTab === m.wr);
  return (
    <aside className={'sidebar' + (mini ? ' mini' : '') + (open ? ' open' : '')}>
      <div className="sidebar-head">
        <div className="brand-lockup">
          <b style={{ color: '#FBF5F7', fontSize: mini ? 12 : 21, letterSpacing: '.28em', fontWeight: 800 }}>ORDO</b>
          {!mini && <span>Workforce Studio</span>}
        </div>
        <button className="sidebar-collapse" type="button" title={mini ? 'Rozwiń menu' : 'Zwiń menu do ikon'} onClick={() => setMini(!mini)}>{mini ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}</button>
        <button className="sidebar-close" type="button" aria-label="Zamknij menu" onClick={onClose}><X size={18} /></button>
      </div>
      <button className="unit-switcher" type="button">
        <div className="unit-avatar">PL</div>
        {!mini && <><div><span>Restauracja</span><strong>PLK 201043 · Galeria Krakowska</strong></div><ChevronDown size={16} /></>}
      </button>
      <nav aria-label="Nawigacja główna">
        {sections.map(([sid, slabel]) => {
          const grupa = items.filter((m) => m.section === sid && (!widoczne || widoczne.includes(m.page || m.id)));
          if (!grupa.length) return null;
          return (
            <div className="nav-section" key={sid}>
              {!mini && <p>{slabel}</p>}
              {grupa.map((m) => { const Icon = m.icon; return (
                <button key={m.id} title={m.label} className={aktywny(m) ? 'active' : ''} onClick={() => { klik(m); onClose && onClose(); }}>
                  <Icon size={18} />{!mini && <span>{m.label}</span>}{m.live && <i className="live-dot" />}{m.badge ? <b>{m.badge}</b> : null}
                </button>
              ); })}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <a className="employee-app-link" href={HUB_URL} target="_blank" rel="noreferrer" title="ORDO Employee Hub"><SmartphoneIcon size={18} />{!mini && <><span>ORDO Employee Hub</span><ChevronRight size={16} /></>}</a>
        {role === 'asm' && <button title="Ustawienia" onClick={() => { setPage('settings'); onClose && onClose(); }}><Settings size={18} />{!mini && <span>Ustawienia</span>}</button>}
        <button title="Wyloguj się" onClick={logout}><LogOut size={18} />{!mini && <span>Wyloguj się</span>}</button>
        <div className="user-card"><div className="avatar">{(userName || 'ORDO').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()}</div>{!mini && <><div><strong>{userName || 'Kierownik zmiany'}</strong><span>{role === 'asm' ? 'General Manager' : 'Kierownik zmiany'}</span></div><MoreHorizontal size={18} /></>}</div>
      </div>
    </aside>
  );
};

const MetricCard = ({ icon: Icon, label, value, helper, tone, progress }) => (
  <article className="metric-card">
    <span className={`metric-icon ${tone}`}><Icon size={18} /></span>
    <div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>
    <span className="metric-progress"><i style={{ width: `${Math.max(4, Math.min(100, progress || 0))}%` }} /></span>
  </article>
);

// Dashboard 1:1 ze wzorca ORDO: popyt kontra zespół, ryzyka, na zmianie teraz, puls operacyjny
const Dashboard = ({ data, setPage, userName }) => {
  const dzis = ymd(new Date());
  const [clockDzis, setClockDzis] = useState(null);
  const [fcDzis, setFcDzis] = useState(null);
  const [cur, setCur] = useState(() => { const h = new Date().getHours(); const i = (h - 8 + 24) % 24; return i >= 0 && i < 18 ? i : 6; });
  useEffect(() => {
    api('/clock').then((r) => { if (r && r.success) setClockDzis(r.events || []); }).catch(() => {});
    api(`/forecast?from=${dzis}&days=1`).then((r) => { if (r && r.success && r.days && r.days[0]) setFcDzis(r.days[0].forecast); }).catch(() => {});
  }, []);

  const HOURS = ['08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '00', '01'];
  const hodOp = (h) => ((h - 6 + 24) % 24);              // godzina → indeks doby operacyjnej 06:00+
  const dzienne = data.shifts.filter((x) => x.date === dzis && !jestInstruktor(x));
  const konta = data.accounts || [];
  const kontoZm = (x) => (x.accountId && konta.find((a) => a.id === x.accountId)) || null;

  // popyt / plan / rzeczywista per godzina (08→01)
  const sprzedazDzis = fcDzis || (((data.salesData || {}).sales || {})[dzis]) || 0;
  const { dir, ind } = optRozbicie(sprzedazDzis, 420, 3, sprzedazDzis ? 'sprzedaz' : 'krzywa', new Date(dzis + 'T12:00:00').getDay());
  const req96 = v4Up96(dir.map((v, i) => Math.max(v, ind[i])));
  const sch96 = new Float64Array(V4_NSLOT);
  dzienne.forEach((x) => v4AddCoverage(sch96, x.start, x.end));
  const przyH = (arr) => HOURS.map((h) => { const i0 = hodOp(Number(h)) * 4; let m = 0; for (let k = i0; k < i0 + 4 && k < arr.length; k++) m = Math.max(m, arr[k]); return Math.round(m); });
  const demand = przyH(req96);
  const planned = przyH(sch96);
  // rzeczywista obsada z odbić: stan każdego konta w połowie godziny
  const evs = (clockDzis || []).slice().sort((a, b) => a.at - b.at);
  const actual = HOURS.map((h) => {
    const t = new Date(dzis + 'T12:00:00'); t.setHours(Number(h), 30, 0, 0); if (Number(h) < 6) t.setDate(t.getDate() + 1);
    if (t.getTime() > Date.now()) return null;
    const st = {}; evs.filter((e) => e.at <= t.getTime()).forEach((e) => { st[e.accountId] = e.type; });
    return Object.values(st).filter((x) => x === 'clock_in' || x === 'break_end' || x === 'break_start').length;
  });
  const maxY = Math.max(4, ...demand, ...planned, ...actual.filter((x) => x != null));
  const nowIdx = (() => { const h = new Date().getHours(); const i = HOURS.findIndex((x) => Number(x) === h); return i; })();
  const yOf = (v) => 92 - (v / maxY) * 78;
  const pkt = (arr) => arr.map((v, i) => v == null ? null : `${((i + 0.5) / HOURS.length * 100).toFixed(2)},${yOf(v).toFixed(2)}`).filter(Boolean).join(' ');

  // KPI
  const planH = dzienne.reduce((a, x) => a + godzZ(x), 0);
  const kosztDzis = dzienne.reduce((a, x) => a + kosztGodzin(kontoZm(x), godzZ(x)), 0);
  const cv = v4Coverage(req96, sch96);
  const colDzis = sprzedazDzis ? kosztDzis / sprzedazDzis * 100 : 0;

  // ryzyka realne
  const lukaIdx = HOURS.findIndex((h, i) => planned[i] < demand[i]);
  const terazMs = Date.now();
  const wbici = new Set(evs.filter((e) => e.type === 'clock_in').map((e) => e.accountId));
  const spoznieni = dzienne.filter((x) => { if (!x.accountId || wbici.has(x.accountId)) return false; const t = new Date(dzis + 'T12:00:00'); const [hh, mm] = x.start.split(':').map(Number); t.setHours(hh, mm + 10, 0, 0); return t.getTime() < terazMs; });
  const rozpoczete = dzienne.filter((x) => { const t = new Date(dzis + 'T12:00:00'); const [hh, mm] = x.start.split(':').map(Number); t.setHours(hh, mm, 0, 0); return t.getTime() < terazMs && x.accountId; });
  const naCzas = rozpoczete.filter((x) => wbici.has(x.accountId)).length;
  const ryzyka = (lukaIdx >= 0 ? 1 : 0) + (spoznieni.length ? 1 : 0);

  // na zmianie teraz
  const stanKont = {}; evs.forEach((e) => { stanKont[e.accountId] = e; });
  const naZmianie = Object.values(stanKont).filter((e) => e.type !== 'clock_out').map((e) => {
    const k = konta.find((a) => a.id === e.accountId) || {};
    const z = dzienne.find((x) => x.accountId === e.accountId);
    return { initials: String(k.name || e.name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(), name: k.name || e.name, role: k.funkcja || 'CREW', shift: z ? `${z.start}–${z.end}` : '—', przerwa: e.type === 'break_start' };
  });

  // puls operacyjny
  const fPokrycie = Math.round(cv.coveragePct);
  const fKoszt = sprzedazDzis ? Math.max(0, Math.min(100, Math.round(100 - Math.max(0, colDzis - 20) * 6))) : 100;
  const fCzas = rozpoczete.length ? Math.round(naCzas / rozpoczete.length * 100) : 100;
  const score = Math.round(fPokrycie * 0.4 + fKoszt * 0.3 + fCzas * 0.3);
  const KOLORY_AV = ['blue', 'mint', 'violet', 'coral'];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <Header title={`Dzień dobry, ${(userName || 'Manager').split(' ')[0]}`} subtitle={`${dniPelne[new Date().getDay()]}, ${new Date().getDate()} ${monthsGen[new Date().getMonth()]} · PLK 201043 · Galeria Krakowska`}>
        <button className="date-button" onClick={() => setPage('forecast')}><TrendingUp size={15} /><span>Planowanie i popyt</span></button>
        <button className="primary-button" onClick={() => setPage('wt')}><Calendar size={15} /> Otwórz grafik</button>
      </Header>
      <div className="page-wrap" style={{ paddingTop: 10 }}>
        <section className="metrics-grid">
          <MetricCard icon={TrendingUp} label="SPRZEDAŻ · PROGNOZA DZIŚ" value={sprzedazDzis ? `${Math.round(sprzedazDzis).toLocaleString('pl-PL')} zł` : '—'} helper={fcDzis ? 'prognoza ORDO Forecast' : 'brak danych prognozy'} tone="blue" progress={72} />
          <MetricCard icon={Clock} label="PLAN GODZIN DZIŚ" value={`${planH.toFixed(1).replace('.', ',')} h`} helper={`${dzienne.length} zmian · ${new Set(dzienne.map((x) => x.name)).size} osób`} tone="mint" progress={Math.min(100, planH / 1.6)} />
          <MetricCard icon={Activity} label="POKRYCIE POPYTU" value={`${fPokrycie}%`} helper={lukaIdx >= 0 ? `luka o ${HOURS[lukaIdx]}:00` : 'bez luk obsadowych'} tone="violet" progress={fPokrycie} />
          <MetricCard icon={CreditCard} label="COST OF LABOUR" value={sprzedazDzis ? `${colDzis.toFixed(1).replace('.', ',')}%` : '—'} helper={`koszt ${Math.round(kosztDzis).toLocaleString('pl-PL')} zł · target ≤ 20%`} tone="coral" progress={sprzedazDzis ? Math.min(100, colDzis * 4) : 10} />
        </section>

        <section className="dashboard-grid">
          <article className="panel staffing-panel">
            <div className="panel-head">
              <div><span className="section-kicker">OBSADA GODZINOWA</span><h2>Popyt kontra zespół</h2></div>
              <div className="legend"><span><i className="legend-bar" />Potrzeba</span><span><i className="legend-plan" />Plan</span><span><i className="legend-actual" />Rzeczywista</span></div>
            </div>
            <div className="staffing-chart">
              <div className="chart-grid"><span style={{ bottom: '6%' }}>0</span><span style={{ bottom: '48%' }}>{Math.round(maxY / 2)}</span><span style={{ bottom: '88%' }}>{maxY}</span></div>
              <div className="chart-bars">{HOURS.map((h, i) => <div key={h} className={`demand-bar ${i === cur ? 'current' : ''}`}><i style={{ height: `${demand[i] / maxY * 84}%` }} /><small>{h}</small></div>)}</div>
              <svg className="chart-lines" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline className="planned-line" points={pkt(planned)} /><polyline className="actual-line" points={pkt(actual)} /></svg>
              {nowIdx >= 0 && <span className="now-line" style={{ left: `${(nowIdx + 0.5) / HOURS.length * 100}%` }}><span>TERAZ</span></span>}
            </div>
            <div className="chart-control"><span>08:00</span><input type="range" min="0" max={HOURS.length - 1} value={cur} onChange={(e) => setCur(Number(e.target.value))} aria-label="Godzina podglądu" /><span>01:00</span></div>
            <div className="chart-summary">
              <div><span>Godzina</span><strong>{HOURS[cur]}:00</strong></div>
              <div><span>Rzeczywista</span><strong>{actual[cur] == null ? '—' : `${actual[cur]} os.`}</strong></div>
              <div><span>Potrzeba</span><strong>{demand[cur]} os.</strong></div>
              <div><span>Zaplanowano</span><strong>{planned[cur]} os.</strong></div>
              <div className={planned[cur] < demand[cur] ? 'danger-stat' : 'good-stat'}><span>Różnica</span><strong>{planned[cur] - demand[cur] > 0 ? '+' : ''}{planned[cur] - demand[cur]}</strong></div>
            </div>
          </article>

          <article className="panel alert-panel">
            <div className="panel-head"><div><span className="section-kicker">DO DECYZJI</span><h2>Ryzyka zmiany</h2></div><button className="more-button" onClick={() => setPage('swaps')} aria-label="Wnioski"><MoreHorizontal size={20} /></button></div>
            <div className="risk-score"><div><AlertTriangle size={22} /></div><section><strong>{ryzyka} aktywne ryzyka</strong><span>{lukaIdx >= 0 ? 'luka wpływa na obsługę gości' : 'obsada zgodna z popytem'}</span></section><b>{ryzyka >= 2 ? 'ŚREDNIE' : ryzyka === 1 ? 'NISKIE' : 'BRAK'}</b></div>
            <div className="risk-list">
              {lukaIdx >= 0 && <button onClick={() => setPage('wt')}><i className="risk-red"><Users size={16} /></i><div><strong>Luka obsady</strong><span>{HOURS[lukaIdx]}:00 · −{demand[lukaIdx] - planned[lukaIdx]} os.</span></div><ChevronRight size={17} /></button>}
              {spoznieni.slice(0, 1).map((x) => { const k = kontoZm(x); return <button key={x.sid} onClick={() => setPage('wt')}><i className="risk-amber"><TimerReset size={16} /></i><div><strong>Brak odbicia po starcie</strong><span>{(k && k.name) || x.name} · plan {x.start}</span></div><ChevronRight size={17} /></button>; })}
              <button onClick={() => setPage('wt')}><i className="risk-green"><Check size={16} /></i><div><strong>Odbicia zgodne z planem</strong><span>{naCzas} z {rozpoczete.length || 0} rozpoczętych zmian</span></div><ChevronRight size={17} /></button>
            </div>
            <button className="text-button" onClick={() => setPage('settings')}>Dziennik audytu i reguły <ChevronRight size={16} /></button>
          </article>

          <article className="panel duty-panel">
            <div className="panel-head"><div><span className="section-kicker">ZESPÓŁ</span><h2>Na zmianie teraz</h2></div><button className="quiet-button" onClick={() => setPage('emps')}>Pokaż {konta.length} osób</button></div>
            <div className="duty-table">
              {naZmianie.slice(0, 5).map((person, i) => (
                <div className="duty-row" key={i}><div className={`person-avatar ${KOLORY_AV[i % 4]}`}>{person.initials}</div><div className="person-main"><strong>{person.name}</strong><span>{person.role}</span></div><div className="person-shift"><strong>{person.shift}</strong><span className={person.przerwa ? 'break-status' : 'online-status'}>{person.przerwa ? 'Przerwa' : 'Na zmianie'}</span></div><button onClick={() => setPage('emps')} aria-label={`Więcej: ${person.name}`}><MoreHorizontal size={18} /></button></div>
              ))}
              {!naZmianie.length && <div className="duty-row"><div className="person-avatar blue">—</div><div className="person-main"><strong>Nikt nie jest wbity</strong><span>Odbicia pojawią się tutaj na żywo (Employee Hub / terminal)</span></div></div>}
            </div>
          </article>

          <article className="panel pulse-panel">
            <div className="panel-head"><div><span className="section-kicker">DZISIAJ</span><h2>Puls operacyjny</h2></div><div className="score-chip"><Sparkles size={14} /> {score} / 100</div></div>
            <div className="pulse-ring"><div><strong>{score}</strong><span>{score >= 85 ? 'dobrze' : score >= 70 ? 'uwaga' : 'reaguj'}</span></div></div>
            <div className="pulse-factors">
              <div><span><i className="dot mint" />Plan kosztów</span><strong>{fKoszt}%</strong></div>
              <div><span><i className="dot blue" />Pokrycie popytu</span><strong>{fPokrycie}%</strong></div>
              <div><span><i className="dot coral" />Zgodność czasu</span><strong>{fCzas}%</strong></div>
              <div><span><i className="dot violet" />Gotowość stacji</span><strong>100%</strong></div>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
};

// Prosta tabela XLSX: kolumny Nazwisko | Data | Od | Do | [Godziny] | [Stanowisko] (nagłówek opcjonalny).
// Format zapasowy dla plików typu „godziny MGR" — gdy plik nie jest matrycą poziomą.
function parseProstaTabela(buffer) {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  const naDate = (v) => {
    if (v == null) return null;
    if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d && d.y ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
    const t = String(v).trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  };
  const naCzas = (v) => {
    if (v == null) return null;
    if (v instanceof Date) return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`;
    if (typeof v === 'number') { const mi = Math.round((v % 1) * 1440); return `${String(Math.floor(mi / 60) % 24).padStart(2, '0')}:${String(mi % 60).padStart(2, '0')}`; }
    const m = String(v).match(/(\d{1,2})[:.](\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
  };
  const shifts = [];
  rows.forEach((r) => {
    if (!r || r.length < 4) return;
    const name = String(r[0] || '').trim();
    const date = naDate(r[1]); const start = naCzas(r[2]); const end = naCzas(r[3]);
    if (!name || !date || !start || !end || /nazwisko|pracownik/i.test(name)) return;
    const hours = r[4] != null && !isNaN(parseFloat(String(r[4]).replace(',', '.'))) ? parseFloat(String(r[4]).replace(',', '.')) : null;
    const station = String(r[5] || '').trim().toUpperCase();
    shifts.push({ date, name: name.toUpperCase(), start, end, hours: hours != null ? hours : (() => { const [a, b] = [start, end].map((t) => { const [h2, m2] = t.split(':').map(Number); return h2 * 60 + m2; }); let d2 = b - a; if (d2 <= 0) d2 += 1440; return Math.round(d2 / 6) / 10; })(), station });
  });
  if (!shifts.length) throw new Error('Nie rozpoznano formatu pliku (ani matryca pozioma, ani tabela Nazwisko|Data|Od|Do).');
  const daty = shifts.map((x) => x.date).sort();
  const [y, mm] = daty[0].split('-').map(Number);
  return { shifts, roster: [...new Set(shifts.map((x) => x.name))].sort(), meta: { year: y, month: mm - 1, monthName: ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'][mm - 1], shiftCount: shifts.length, employeeCount: new Set(shifts.map((x) => x.name)).size, firstDate: daty[0], lastDate: daty[daty.length - 1], prostaTabela: true } };
}

const STACJE_IMPORT = [...Object.keys(stationColors)];

const ImportPage = ({ data, setPage }) => {
  const [preview, setPreview] = useState(null);
  const [expM, setExpM] = useState(() => { const m = (data.months || []); return m.length ? m[m.length - 1].key : ''; });
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [stOverride, setStOverride] = useState({});     // nadpisane stanowiska per wiersz
  const [stAll, setStAll] = useState('MANAGER');
  const fileRef = useRef();
  const stacjaWiersza = (sx, i) => stOverride[i] || sx.station || 'MANAGER';
  const zEfektywnymiStacjami = () => preview.shifts.map((sx, i) => ({ ...sx, station: stacjaWiersza(sx, i) }));

  const [sladAud, setSladAud] = useState([]);
  useEffect(() => { api('/audit?limit=8').then((r) => { if (r && r.success) setSladAud(r.entries || []); }).catch(() => {}); }, []);
  const AUD_OP = { 'auth.login': 'Logowanie do panelu', 'schedule.add': 'Dodanie zmiany', 'schedule.update': 'Edycja zmiany', 'schedule.remove': 'Usunięcie zmiany', 'schedule.publish': 'Publikacja grafiku', 'schedule.import': 'Import grafiku', 'timesheet.write': 'Zapis wykonania', 'swap.approve': 'Zamiana zatwierdzona', 'absence.approve': 'Absencja zatwierdzona', 'account.create': 'Nowe konto', 'account.update': 'Edycja konta', 'account.reset-password': 'Reset PIN' };
  const mcNow = new Date().toISOString().slice(0, 7);
  const dniZGraf = new Set((data.shifts || []).filter((x) => x.date && x.date.slice(0, 7) === mcNow).map((x) => x.date));
  const complMc = Object.entries(((data.ts || {}).completed) || {}).filter(([d, v]) => v && d.slice(0, 7) === mcNow).length;
  const szkolMc = (data.shifts || []).filter((x) => x.date && x.date.slice(0, 7) === mcNow && (x.rola === 'training' || x.szkoli)).length;
  const gotowoscR = dniZGraf.size ? Math.round((Math.min(1, complMc / dniZGraf.size) * 70 + 30)) : 0;
  const pobierzCSV = (nazwa, rows) => { const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }); const u = URL.createObjectURL(blob); const a2 = document.createElement('a'); a2.href = u; a2.download = nazwa; a2.click(); URL.revokeObjectURL(u); };
  const obsadaDzienna = () => {
    const dzis2 = new Date().toISOString().slice(0, 10);
    const zm2 = (data.shifts || []).filter((x) => x.date === dzis2 && !jestInstruktor(x)).sort((a2, b2) => String(a2.start).localeCompare(b2.start));
    pobierzCSV(`ordo-obsada-${dzis2}.csv`, ['Godziny;Pracownik;Stanowisko', ...zm2.map((x) => `${x.start}–${x.end};${x.name};${x.station || ''}`)]);
    data.show('Pobrano zestawienie dziennej obsady');
  };
  const planSzkolen = () => {
    const zm2 = (data.shifts || []).filter((x) => x.date && x.date.slice(0, 7) === mcNow && (x.rola === 'training' || x.szkoli));
    pobierzCSV(`ordo-szkolenia-${mcNow}.csv`, ['Data;Pracownik;Rola;Partner;Stanowisko;Godziny', ...zm2.map((x) => `${x.date};${x.name};${x.szkoli ? 'instruktor' : 'uczeń'};${x.partnerSzk || x.partner || ''};${x.station || ''};${x.start}–${x.end}`)]);
    data.show('Pobrano plan szkoleń');
  };

  const handleFile = async (file) => {
    if (!file) return;
    setError(''); setParsing(true); setPreview(null);
    try {
      let result;
      if (file.name.toLowerCase().endsWith('.csv')) result = parseExportCSV(await file.text());
      else {
        const buf = await file.arrayBuffer();
        try { result = parseGrafik(buf); if (!result.shifts || !result.shifts.length) throw new Error('pusto'); }
        catch { result = parseProstaTabela(buf); }
      }
      setStOverride({}); setStAll('MANAGER');
      setPreview(result);
    } catch (e) {
      setError(e.message || 'Błąd odczytu pliku');
    }
    setParsing(false);
  };

  const confirmImport = async () => {
    if (!preview) return;
    await data.importSchedule({ ...preview, shifts: zEfektywnymiStacjami() });
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };
  // DOPISANIE godzin (np. MGR) do istniejącego grafiku — nic nie zastępuje
  const confirmDopisz = async () => {
    if (!preview) return;
    const ok = await data.addHoursBulk(zEfektywnymiStacjami());
    if (ok) { setPreview(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 overflow-y-auto"><div className="page-wrap module-view reports-view" style={{ width: '100%' }}>
      <MHead kicker="ORDO WORKFORCE STUDIO • NARZĘDZIA" title="Import / eksport godzin" copy="Raporty godzin, dzienna obsada, szkolenia oraz pełna historia zmian operacyjnych.">
        <button className="secondary-action" onClick={() => fileRef.current && fileRef.current.click()}><Upload size={16} /> Import danych</button>
        <button className="primary-action" onClick={() => { if (!expM) return; const r = exportPoziomy(data.shifts, data.accounts, expM); data.show(`Wyeksportowano ${r.osoby} osób (${r.zmian} dni ze zmianami)`, 'success'); }}><Download size={16} /> Eksport payroll</button>
      </MHead>
      <section className="report-cards">
        <button className="panel report-card" onClick={obsadaDzienna}><i><Printer size={21} /></i><span><small>OPERACJE</small><strong>Obsada dzienna</strong><em>Zmiany, stanowiska, obecność i miejsce na notatki kierownika.</em></span><Download size={18} /></button>
        <button className="panel report-card" onClick={planSzkolen}><i><CalendarCheck2 size={21} /></i><span><small>ROZWÓJ</small><strong>Plan szkoleń</strong><em>Instruktor, uczestnik, stanowisko i godziny szkoleniowe.</em></span><Download size={18} /></button>
        <button className="panel report-card" onClick={() => setPage && setPage('settings')}><i><Clock size={21} /></i><span><small>ZGODNOŚĆ</small><strong>Dziennik audytu</strong><em>Publikacje, korekty, decyzje i operacje wrażliwe.</em></span><ChevronRight size={18} /></button>
      </section>
      <section className="reports-grid">
        <article className="panel report-summary">
          <div className="panel-title"><div><span>GOTOWOŚĆ ROZLICZENIA</span><h2>{new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date())}</h2></div><strong>{gotowoscR}%</strong></div>
          {[['Dni z grafikiem', `${dniZGraf.size}`, dniZGraf.size ? 100 : 0], ['Karty czasu zatwierdzone', `${complMc} / ${dniZGraf.size}`, dniZGraf.size ? complMc / dniZGraf.size * 100 : 0], ['Wpisy szkoleniowe', `${szkolMc}`, szkolMc ? 100 : 0], ['Eksport payroll', 'z zamkniętych tygodni', 100]].map(([label, value, progress]) => (
            <div className="report-progress" key={String(label)}><span><strong>{label}</strong><small>{value}</small></span><i><b style={{ width: `${progress}%` }} /></i></div>
          ))}
          <div className="request-note"><ShieldCheck size={16} /><span>Eksport payroll zostanie oznaczony wersją i znacznikiem osoby generującej.</span></div>
        </article>
        <article className="panel audit-preview">
          <div className="panel-title"><div><span>OSTATNIE OPERACJE</span><h2>Ślad zmian</h2></div><button className="quiet-link" onClick={() => setPage && setPage('settings')}>Pełny dziennik</button></div>
          {sladAud.slice(0, 4).map((w, i) => <div className="audit-row" key={i}><i>{new Date(w.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</i><span><strong>{AUD_OP[w.action] || w.action}</strong><small>{w.actor || 'System'} • {w.action}{w.target ? ` • ${w.target}` : ''}</small></span><CheckCircle2 size={16} /></div>)}
          {!sladAud.length && <div className="audit-row"><i>—</i><span><strong>Brak wpisów</strong><small>dziennik audytu jest pusty</small></span></div>}
        </article>
      </section>
      <div className="space-y-6" style={{ marginTop: 16 }}>
        <div className="bg-white rounded-2xl p-8 shadow-sm">
          <div className="border-2 border-dashed rounded-2xl p-10 text-center transition-colors" style={{ borderColor: colors.primary.bg }}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}>
            <FileSpreadsheet className="w-16 h-16 mx-auto mb-4" style={{ color: colors.primary.medium }} />
            <p className="font-semibold mb-1" style={{ color: colors.primary.darkest }}>Import: przeciągnij plik w formacie poziomym</p>
            <p className="text-sm mb-4" style={{ color: colors.primary.light }}>grafik_planowany_import_poziomy_RRRR_M.xlsx — dokładnie taki, jaki generuje sekcja Eksport poniżej</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
            <div className="flex justify-center"><Btn icon={Upload} loading={parsing} onClick={() => fileRef.current?.click()}>Wybierz plik</Btn></div>
          </div>
          {error && <div className="mt-4 bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-2"><AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" /><span className="text-sm">{error}</span></div>}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #741334' }}>
          <h3 className="text-lg font-semibold mb-1" style={{ color: colors.primary.darkest }}>Eksport grafiku (format poziomy)</h3>
          <p className="text-xs mb-4" style={{ color: colors.primary.light }}>Zapisuje wybrany miesiąc do pliku w tym samym formacie, który przyjmuje import: wiersz na osobę, para kolumn start/koniec na każdy dzień. Przy kilku zmianach jednego dnia eksportowana jest pierwsza wg godziny startu; wpisy instruktorskie są pomijane.</p>
          <div className="flex items-center gap-3 flex-wrap">
            <select value={expM} onChange={(e) => setExpM(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>
              {(data.months || []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
            <Btn icon={Download} onClick={() => { if (!expM) return; const r = exportPoziomy(data.shifts, data.accounts, expM); data.show(`Wyeksportowano ${r.osoby} osób (${r.zmian} dni ze zmianami)`, 'success'); }}>Pobierz XLSX</Btn>
          </div>
          {(data.months || []).length === 0 && <p className="text-xs mt-3" style={{ color: colors.primary.light }}>Brak miesięcy w systemie — najpierw ułóż grafik w WorkRhythm albo zaimportuj plik.</p>}
        </div>

        {preview && (
          <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #741334' }}>
            <div className="flex items-center gap-2 mb-4"><Check className="w-6 h-6" style={{ color: '#741334' }} /><h3 className="text-lg font-semibold" style={{ color: colors.primary.darkest }}>Plik odczytany poprawnie</h3></div>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.primary.bg }}><p className="text-2xl font-bold" style={{ color: colors.primary.dark }}>{preview.meta.shiftCount}</p><p className="text-sm" style={{ color: colors.primary.light }}>Zmian</p></div>
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.accent.bg }}><p className="text-2xl font-bold" style={{ color: colors.accent.dark }}>{preview.meta.employeeCount}</p><p className="text-sm" style={{ color: colors.accent.dark }}>Pracowników</p></div>
              <div className="p-4 rounded-xl" style={{ backgroundColor: '#F1E4E8' }}><p className="text-lg font-bold" style={{ color: '#741334' }}>{preview.meta.monthName} {preview.meta.year}</p><p className="text-sm" style={{ color: '#7CB342' }}>Miesiąc</p></div>
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.primary.bgLight }}><p className="text-sm font-bold" style={{ color: colors.primary.dark }}>{preview.meta.firstDate} → {preview.meta.lastDate}</p><p className="text-sm" style={{ color: colors.primary.light }}>Zakres</p></div>
            </div>
            <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.accent.bg }}><div className="flex items-start gap-2"><AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: colors.accent.dark }} /><span className="text-sm" style={{ color: colors.accent.dark }}><strong>„Dodaj godziny do grafiku"</strong> dopisze zmiany do już istniejących (duplikaty osoba+data+godziny są pomijane). <strong>„Zastąp miesiąc"</strong> nadpisze cały miesiąc z pliku.</span></div></div>
            <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 mb-4" style={{ backgroundColor: colors.primary.bgLight }}>
              <span className="text-sm font-semibold" style={{ color: colors.primary.darkest }}>Stanowisko dla importowanych godzin:</span>
              <select value={stAll} onChange={(e) => setStAll(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>
                {STACJE_IMPORT.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
              <button onClick={() => setStOverride(Object.fromEntries(preview.shifts.map((_, i) => [i, stAll])))} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: colors.primary.medium }}>Zastosuj dla wszystkich</button>
              {Object.keys(stOverride).length > 0 && <button onClick={() => setStOverride({})} className="text-xs font-medium" style={{ color: '#B94352' }}>wyczyść nadpisania</button>}
              <span className="text-xs" style={{ color: colors.primary.light }}>Możesz też ustawić stanowisko pojedynczo w tabeli poniżej.</span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border" style={{ borderColor: colors.primary.bg }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0"><tr style={{ backgroundColor: colors.primary.bg }}><th className="text-left px-4 py-2 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Data</th><th className="text-left px-4 py-2 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Pracownik</th><th className="text-left px-4 py-2 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Godziny</th><th className="text-left px-4 py-2 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Stanowisko</th></tr></thead>
                <tbody>{preview.shifts.slice(0, 100).map((s, i) => (<tr key={i} className="border-b" style={{ borderColor: colors.primary.bgLight }}><td className="px-4 py-1.5">{s.date}</td><td className="px-4 py-1.5 font-medium">{s.name}</td><td className="px-4 py-1.5">{s.start}–{s.end} ({s.hours}h)</td><td className="px-4 py-1.5">
                  <select value={stacjaWiersza(s, i)} onChange={(e) => setStOverride((o) => ({ ...o, [i]: e.target.value }))} className="text-xs px-2 py-1 rounded-lg border font-medium" style={{ borderColor: colors.primary.bg, color: stationColor(stacjaWiersza(s, i)) }}>
                    {[...new Set([stacjaWiersza(s, i), ...STACJE_IMPORT])].map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </td></tr>))}</tbody>
              </table>
              {preview.shifts.length > 100 && <p className="text-center py-2 text-xs" style={{ color: colors.primary.light }}>... i {preview.shifts.length - 100} więcej (nadpisanie „Zastosuj dla wszystkich" obejmuje też te wiersze)</p>}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Btn variant="secondary" onClick={() => setPreview(null)}>Anuluj</Btn>
              <Btn icon={Plus} onClick={confirmDopisz} loading={data.loading}>Dodaj godziny do grafiku (dopisz)</Btn>
              <Btn variant="success" icon={Check} onClick={confirmImport} loading={data.loading}>Zastąp miesiąc</Btn>
            </div>
          </div>
        )}
      </div>
      </div></div>
    </div>
  );
};

// ===================== SCHEDULE VIEW =====================

const SchedulePage = ({ data }) => {
  const today = new Date();
  const [weekStart, setWeekStart] = useState(() => { const d = data.meta.firstDate ? new Date(data.meta.firstDate) : new Date(today); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); });

  const weekDates = useMemo(() => { const arr = []; const start = new Date(weekStart); for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); arr.push(ymd(d)); } return arr; }, [weekStart]);
  const changeWeek = (dir) => { const d = new Date(weekStart); d.setDate(d.getDate() + dir * 7); setWeekStart(ymd(d)); };
  const label = () => { const s = new Date(weekStart); const e = new Date(weekStart); e.setDate(e.getDate() + 6); return `${s.getDate()} ${months[s.getMonth()].slice(0,3)} – ${e.getDate()} ${months[e.getMonth()].slice(0,3)} ${e.getFullYear()}`; };

  const shiftsByDate = (ds) => data.shifts.filter(s => s.date === ds).sort((a,b) => (a.start||'').localeCompare(b.start||''));

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Grafik" subtitle="Podgląd zaimportowanego grafiku">
        <div className="flex items-center gap-2 rounded-xl p-1" style={{ backgroundColor: colors.primary.bg }}>
          <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-white rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
          <span className="px-4 font-semibold text-sm min-w-[220px] text-center" style={{ color: colors.primary.dark }}>{label()}</span>
          <button onClick={() => changeWeek(1)} className="p-2 hover:bg-white rounded-lg"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <Btn variant="secondary" icon={RefreshCw} onClick={data.sync} loading={data.loading}>Odśwież</Btn>
      </Header>
      <div className="flex-1 p-6 overflow-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        {data.shifts.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm"><Calendar className="w-16 h-16 mx-auto mb-4" style={{ color: colors.primary.light }} /><p style={{ color: colors.primary.light }}>Brak grafiku. Zaimportuj plik Excel.</p></div>
        ) : (
          <div className="grid grid-cols-7 gap-3">
            {weekDates.map(ds => {
              const d = new Date(ds);
              const list = shiftsByDate(ds);
              const isToday = ds === ymd(today);
              const totalH = list.reduce((a, s) => a + (s.hours || 0), 0);
              return (
                <div key={ds} className="bg-white rounded-2xl shadow-sm overflow-hidden flex flex-col" style={isToday ? { boxShadow: `0 0 0 2px ${colors.accent.dark}` } : {}}>
                  <div className="p-3 text-center border-b" style={{ backgroundColor: isToday ? colors.accent.bg : colors.primary.bg }}>
                    <p className="text-xs font-semibold" style={{ color: colors.primary.light }}>{dayNames[d.getDay()]}</p>
                    <p className="text-lg font-bold" style={{ color: isToday ? colors.accent.dark : colors.primary.darkest }}>{d.getDate()}</p>
                    <p className="text-[10px]" style={{ color: colors.primary.light }}>{list.length} zmian · {totalH.toFixed(0)}h</p>
                  </div>
                  <div className="p-2 space-y-1.5 flex-1 min-h-[200px]">
                    {list.map((s, i) => (
                      <div key={i} className="rounded-lg p-1.5 text-[11px]" style={{ backgroundColor: stationColor(s.station) + '12', borderLeft: `3px solid ${stationColor(s.station)}` }}>
                        <p className="font-bold truncate" style={{ color: colors.primary.darkest }}>{s.name}</p>
                        <p style={{ color: colors.primary.light }}>{s.start}–{s.end}</p>
                        <p className="truncate" style={{ color: stationColor(s.station) }}>{etykietaStacji(s)}</p>
                        {paraOpis(s) && <p className="truncate italic" style={{ color: '#5A3542' }}>{paraOpis(s)}</p>}
                      </div>
                    ))}
                    {list.length === 0 && <p className="text-center text-xs py-4" style={{ color: colors.primary.light }}>—</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ===================== PRINT =====================

const PrintPage = ({ data }) => {
  const [mode, setMode] = useState('day'); // 'day' | 'range'
  const [singleDate, setSingleDate] = useState(data.meta.firstDate || ymd(new Date()));
  const [rangeStart, setRangeStart] = useState(data.meta.firstDate || ymd(new Date()));
  const [rangeEnd, setRangeEnd] = useState(data.meta.firstDate || ymd(new Date()));
  const [busy, setBusy] = useState(false);

  const doPrint = (open) => {
    setBusy(true);
    try {
      let doc;
      let fname;
      if (mode === 'day') {
        const pl = data.planowanie[singleDate.slice(0, 7)] || {};
        const dod = (Number((pl.mgr || {})[singleDate]) || 0) + (Number((pl.mgrFunk || {})[singleDate]) || 0);
        doc = generateDayPDF(data.shifts, singleDate, undefined, dod);
        fname = `grafik_${singleDate}.pdf`;
      } else {
        if (new Date(rangeEnd) < new Date(rangeStart)) { data.show('Data końcowa przed początkową', 'error'); setBusy(false); return; }
        doc = generateRangePDF(data.shifts, rangeStart, rangeEnd, undefined, data.planowanie);
        fname = `grafik_${rangeStart}_${rangeEnd}.pdf`;
      }
      if (open) {
        doc.output('dataurlnewwindow');
      } else {
        doc.save(fname);
      }
    } catch (e) {
      data.show('Błąd generowania PDF: ' + e.message, 'error');
    }
    setBusy(false);
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Drukuj grafik" subtitle="Generuj PDF A4 poziomo z miejscem na notatki kierownika" />
      <div className="flex-1 p-8 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        {data.shifts.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm"><Printer className="w-16 h-16 mx-auto mb-4" style={{ color: colors.primary.light }} /><p style={{ color: colors.primary.light }}>Brak grafiku do wydruku. Zaimportuj plik Excel.</p></div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold mb-4" style={{ color: colors.primary.darkest }}>Wybierz zakres</h3>
              <div className="flex gap-3 mb-6">
                <button onClick={() => setMode('day')} className="flex-1 py-3 rounded-xl font-medium transition-all" style={mode === 'day' ? { background: colors.primary.dark, color: 'white' } : { backgroundColor: colors.primary.bg, color: colors.primary.dark }}>Jeden dzień</button>
                <button onClick={() => setMode('range')} className="flex-1 py-3 rounded-xl font-medium transition-all" style={mode === 'range' ? { background: colors.primary.dark, color: 'white' } : { backgroundColor: colors.primary.bg, color: colors.primary.dark }}>Zakres dni</button>
              </div>
              {mode === 'day' ? (
                <div><label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: colors.primary.light }}>Data</label><input type="date" value={singleDate} min={data.meta.firstDate} max={data.meta.lastDate} onChange={e => setSingleDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none" style={{ borderColor: colors.primary.bg }} /></div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: colors.primary.light }}>Od</label><input type="date" value={rangeStart} min={data.meta.firstDate} max={data.meta.lastDate} onChange={e => setRangeStart(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none" style={{ borderColor: colors.primary.bg }} /></div>
                  <div><label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: colors.primary.light }}>Do</label><input type="date" value={rangeEnd} min={rangeStart} max={data.meta.lastDate} onChange={e => setRangeEnd(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none" style={{ borderColor: colors.primary.bg }} /></div>
                </div>
              )}
              <div className="flex gap-3 mt-6">
                <Btn variant="accent" icon={Printer} onClick={() => doPrint(true)} loading={busy}>Podgląd / Drukuj</Btn>
                <Btn variant="secondary" icon={Download} onClick={() => doPrint(false)} loading={busy}>Pobierz PDF</Btn>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${colors.accent.dark}` }}>
              <h4 className="font-semibold mb-2" style={{ color: colors.primary.darkest }}>Format wydruku</h4>
              <ul className="text-sm space-y-1" style={{ color: colors.primary.light }}>
                <li>• A4 w orientacji poziomej</li>
                <li>• Tabela zmian po lewej (stanowisko, pracownik, godziny, obecność)</li>
                <li>• Kolumna „Notatki kierownika zmiany" po prawej — puste linie do ręcznych zapisków</li>
                <li>• Zakres dni = jeden dzień na stronę</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===================== SETTINGS =====================

// ── WFM-01: publikacja grafiku — snapshot dla pracowników, wersje i potwierdzenia ──
const PublishCard = ({ data }) => {
  const [ym, setYm] = useState('');
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const m = data.months || []; if (m.length && !ym) setYm(m[m.length - 1].key); }, [data.months]);
  const zaladuj = (k) => { if (!k) return; api(`/schedule?action=pubinfo&pubmonth=${k}`).then((r) => { if (r && r.success) setInfo(r); }).catch(() => {}); };
  useEffect(() => { zaladuj(ym); }, [ym]);
  const publikuj = async () => {
    if (!ym) return;
    if (info && info.opublikowany && !confirm(`Publikujesz nową wersję (${info.wersjaPub + 1}) — potwierdzenia pracowników wyzerują się. Kontynuować?`)) return;
    setBusy(true);
    const r = await api('/schedule?action=publish', 'POST', { month: ym });
    setBusy(false);
    if (r.success) { data.show(`Opublikowano ${ym} — wersja ${r.wersjaPub} (${r.zmian} zmian)`); zaladuj(ym); }
    else data.show(r.error || 'Błąd publikacji', 'error');
  };
  const rozn = info && info.roznice;
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border mb-3" style={{ borderColor: colors.primary.bg }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold" style={{ color: colors.primary.darkest }}>Publikacja grafiku</span>
        <select value={ym} onChange={(e) => setYm(e.target.value)} className="px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>
          {(data.months || []).map((m) => <option key={m.key} value={m.key}>{m.key}</option>)}
        </select>
        {info && (info.opublikowany
          ? <span className="text-xs" style={{ color: colors.primary.medium }}>wersja <b>{info.wersjaPub}</b> · {new Date(info.at).toLocaleString('pl-PL')} · {info.by} · potwierdziło <b>{(info.potwierdzenia || []).length}/{info.osobOczekiwane}</b> osób</span>
          : <span className="text-xs font-medium" style={{ color: '#A7465F' }}>nieopublikowany — pracownicy nie widzą tego miesiąca po pierwszej publikacji systemu</span>)}
        {rozn && rozn.razem > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F1E4E8', color: '#A7465F' }}>zmiany od publikacji: +{rozn.dodane} / ±{rozn.zmienione} / −{rozn.usuniete}</span>}
        {rozn && rozn.razem === 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>zgodny z publikacją</span>}
        <button disabled={busy || !ym} onClick={publikuj} className="ml-auto px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: colors.primary.darkest }}>
          {busy ? 'Publikuję…' : info && info.opublikowany ? (rozn && rozn.razem > 0 ? 'Opublikuj nową wersję' : 'Opublikuj ponownie') : 'Opublikuj miesiąc'}
        </button>
      </div>
    </div>
  );
};

// ── WFM-03: wnioski o urlop / absencje — decyzje kierownika ──
const AbsencesAdmin = ({ data }) => {
  const [lista, setLista] = useState(null);
  const zaladuj = () => { api('/absences').then((r) => { if (r && r.success) setLista(r.absences || []); }).catch(() => {}); };
  useEffect(zaladuj, []);
  const decyzja = async (a, akcja) => {
    const r = await api('/absences', 'PUT', { id: a.id, action: akcja });
    if (r.success) { zaladuj(); data.show(akcja === 'approve' ? `Zatwierdzono: ${a.name} ${a.from}–${a.to}` : 'Wniosek odrzucony'); }
    else data.show(r.error || 'Błąd', 'error');
  };
  const TY = { urlop: 'Urlop wypocz.', uz: 'Na żądanie', l4: 'L4', inne: 'Inna' };
  const otwarte = (lista || []).filter((a) => a.status === 'open');
  const rozpatrzone = (lista || []).filter((a) => a.status !== 'open').slice(0, 8);
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #A7465F' }}>
      <h3 className="text-lg font-semibold mb-1" style={{ color: colors.primary.darkest }}>Wnioski o urlop / absencje ({otwarte.length})</h3>
      <p className="text-xs mb-4" style={{ color: colors.primary.light }}>Zatwierdzona absencja blokuje planowanie zmian w tym zakresie (WFM-05).</p>
      {lista === null ? <p className="text-sm text-slate-400">Ładowanie…</p> : otwarte.length === 0 ? <p className="text-sm" style={{ color: colors.primary.light }}>Brak wniosków do rozpatrzenia.</p> : (
        <div className="space-y-2 mb-3">
          {otwarte.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl p-3" style={{ backgroundColor: colors.primary.bgLight }}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold" style={{ color: colors.primary.darkest }}>{a.name} <span className="font-normal text-xs" style={{ color: colors.primary.medium }}>· {TY[a.type] || a.type}</span></p>
                <p className="text-xs" style={{ color: colors.primary.light }}>{a.from} → {a.to}{a.reason ? ` · „${a.reason}"` : ''}</p>
              </div>
              <button onClick={() => decyzja(a, 'approve')} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#741334' }}>Zatwierdź</button>
              <button onClick={() => decyzja(a, 'reject')} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>Odrzuć</button>
            </div>
          ))}
        </div>
      )}
      {rozpatrzone.length > 0 && (
        <div className="pt-2 border-t" style={{ borderColor: '#EDE3E6' }}>
          {rozpatrzone.map((a) => (
            <p key={a.id} className="text-[11.5px] py-0.5" style={{ color: colors.primary.light }}>
              {a.name} · {TY[a.type] || a.type} {a.from}→{a.to} — <b style={{ color: a.status === 'approved' ? '#741334' : a.status === 'rejected' ? '#B94352' : '#A38D95' }}>{a.status === 'approved' ? 'zatwierdzony' : a.status === 'rejected' ? 'odrzucony' : 'wycofany'}</b>{a.decidedBy ? ` (${a.decidedBy})` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

// ═════════ REX WorkRhythm Modules v1.0.0 — Dyspozycyjność (panel) ═════════
const CLOCK_APP_URL = 'https://rex-clock.vercel.app';
const DY_TYPY = {
  available: { short: 'Dostępny', label: 'Mogę pracować' },
  unavailable: { short: 'Niedost.', label: 'Nie mogę pracować' },
  from_time: { short: 'Od', label: 'Mogę pracować od godziny' },
  until_time: { short: 'Do', label: 'Mogę pracować do godziny' },
  specific_shift: { short: 'Zmiana', label: 'Preferowana konkretna zmiana' },
};
const dyAddDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const dyStartOfWeek = (iso) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const dyTime = (r) => r.type === 'from_time' ? `od ${r.startTime}` : r.type === 'until_time' ? `do ${r.endTime}` : r.type === 'specific_shift' ? `${r.startTime}–${r.endTime}` : 'cały dzień';
const dyInicjaly = (n) => String(n || '?').split(' ').map((x) => x[0]).join('').slice(0, 2);
const dyData = (d) => new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00'));
const dyKlasa = (t) => t === 'available' ? 'available' : t === 'unavailable' ? 'unavailable' : 'limited';

const DyspoAdmin = ({ data, setPage }) => {
  const [weekStart, setWeekStart] = useState(dyStartOfWeek(new Date().toISOString().slice(0, 10)));
  const [reqs, setReqs] = useState([]);
  const [selId, setSelId] = useState(null);
  const [filtr, setFiltr] = useState('pending');
  const [q, setQ] = useState('');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [okno, setOkno] = useState(null);
  const weekEnd = dyAddDays(weekStart, 6);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const date = dyAddDays(weekStart, i); const d = new Date(date + 'T12:00:00'); return { date, label: new Intl.DateTimeFormat('pl-PL', { weekday: 'short' }).format(d).replace('.', '').toUpperCase(), day: String(d.getDate()) }; }), [weekStart]);
  // FIX: lista i KPI obejmują WSZYSTKIE zgłoszenia (nie tylko widoczny tydzień) — siatka filtruje lokalnie
  const zaladuj = useCallback(() => {
    api('/availability?reqs=1').then((r) => {
      if (!r || !r.success) return;
      setReqs(r.requests || []);
      setSelId((cur) => cur && (r.requests || []).some((x) => x.id === cur) ? cur : ((r.requests || [])[0] || {}).id || null);
    }).catch(() => {});
    api('/availability?window=1').then((r) => { if (r && r.success) setOkno(r.okno); }).catch(() => {});
  }, []);
  useEffect(zaladuj, [zaladuj]);
  // start: pokaż tydzień miesiąca, na który zbieramy dyspozycje
  useEffect(() => { if (okno && okno.targetMonth) setWeekStart((w) => w === dyStartOfWeek(new Date().toISOString().slice(0, 10)) ? dyStartOfWeek(`${okno.targetMonth}-01`) : w); }, [okno && okno.targetMonth]);
  const przelaczOkno = async () => {
    if (!okno) return;
    const r = await api('/availability?action=window', 'POST', { open: !okno.otwarte });
    if (r.success) { setOkno(r.okno); data.show(r.okno.otwarte ? 'Okno dyspozycji otwarte' : 'Okno dyspozycji zamknięte'); }
    else data.show(r.error || 'Błąd', 'error');
  };
  const mcNazwa = (ym) => { const [y, m] = String(ym || '').split('-').map(Number); return y ? new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1)) : ''; };
  const sel = reqs.find((x) => x.id === selId) || null;
  useEffect(() => { setNota((sel && sel.managerNote) || ''); }, [selId]);
  const osoby = useMemo(() => { const m = new Map(); reqs.forEach((r) => m.set(r.accountId, { id: r.accountId, name: r.name, login: r.login })); return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'pl')); }, [reqs]);
  const widoczne = useMemo(() => { const n = q.trim().toLocaleLowerCase('pl'); return reqs.filter((r) => (filtr === 'all' || (filtr === 'conflict' ? r.conflict : r.status === filtr)) && (!n || r.name.toLocaleLowerCase('pl').includes(n))); }, [filtr, q, reqs]);
  const licz = { pending: reqs.filter((r) => r.status === 'pending').length, approved: reqs.filter((r) => r.status === 'approved').length, conflict: reqs.filter((r) => r.conflict).length, osoby: new Set(reqs.map((r) => r.accountId)).size };
  const decyzja = async (status) => {
    if (!sel) return; setBusy(true);
    const r = await api('/availability?action=decide', 'POST', { id: sel.id, status, managerNote: nota });
    setBusy(false);
    if (r.success) { setReqs((xs) => xs.map((x) => x.id === r.request.id ? r.request : x)); data.show(status === 'approved' ? 'Dyspozycja zaakceptowana' : 'Dyspozycja odrzucona'); }
    else data.show(r.error || 'Nie udało się zapisać decyzji', 'error');
  };
  const weekLabel = `${new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' }).format(new Date(weekStart + 'T12:00:00'))}–${new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(weekEnd + 'T12:00:00'))}`;
  const naDzien = (aid, date) => reqs.find((r) => r.accountId === aid && (r.date === date || (r.recurrence === 'weekly' && r.date <= date && (!r.repeatUntil || r.repeatUntil >= date) && new Date(r.date + 'T12:00:00').getDay() === new Date(date + 'T12:00:00').getDay())));
  return (
    <div className="flex-1 overflow-y-auto p-8" style={{ backgroundColor: '#F7F5F5' }}>
      <div className="rex-av-admin">
        <header className="rex-av-heading">
          <div><span>WORKRHYTHM · DYSPOZYCYJNOŚĆ</span><h1>Dyspozycyjność zespołu</h1><p>Preferencje pracowników, decyzje managera i konflikty z grafikiem.</p></div>
          <div><button className="rex-av-btn secondary" onClick={zaladuj}><RefreshCw size={16} /> Odśwież</button><button className="rex-av-btn primary" onClick={() => setPage('wt')}><CalendarCheck2 size={16} /> Otwórz w Schedule</button></div>
        </header>
        {okno && (
          <div className="rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" style={{ backgroundColor: okno.otwarte ? '#F1E4E8' : '#F5E3E8', border: `1px solid ${okno.otwarte ? '#E3DCDD' : '#E0B9C4'}`, color: okno.otwarte ? '#741334' : '#B94352' }}>
            <strong>Okno dyspozycji na {mcNazwa(okno.targetMonth)}: {okno.otwarte ? 'OTWARTE' : 'ZAMKNIĘTE'}</strong>
            <span>{okno.otwarte ? `pracownicy składają do 20.${okno.deadline.slice(5, 7)}.${okno.deadline.slice(0, 4)}` : 'termin (20. dzień miesiąca) minął — otworzyć może wyłącznie ASM'}</span>
            {okno.reczne && <span className="text-xs">ręcznie {okno.reczne.open ? 'otwarte' : 'zamknięte'} przez {okno.reczne.by}</span>}
            <button onClick={przelaczOkno} className="ml-auto px-3 py-1.5 rounded-lg text-sm font-bold text-white" style={{ backgroundColor: okno.otwarte ? '#B94352' : '#741334' }}>{okno.otwarte ? 'Zamknij okno' : 'Otwórz okno (ASM)'}</button>
          </div>
        )}
        <section className="rex-av-kpis">
          <article><span className="amber"><Clock3 /></span><div><small>DO DECYZJI</small><strong>{licz.pending}</strong><em>zgłoszeń</em></div></article>
          <article><span className="green"><UserCheck /></span><div><small>ZAAKCEPTOWANE</small><strong>{licz.approved}</strong><em>w tym tygodniu</em></div></article>
          <article><span className="red"><AlertTriangle /></span><div><small>KONFLIKTY</small><strong>{licz.conflict}</strong><em>z grafikiem</em></div></article>
          <article><span className="teal"><Users /></span><div><small>PRACOWNICY</small><strong>{licz.osoby}</strong><em>ze zgłoszeniami</em></div></article>
        </section>
        <section className="rex-av-toolbar">
          <div className="rex-av-tabs">
            {[['pending', `Do decyzji · ${licz.pending}`], ['all', 'Wszystkie'], ['conflict', `Konflikty · ${licz.conflict}`], ['approved', 'Zaakceptowane']].map(([id, label]) => <button key={id} className={filtr === id ? 'active' : ''} onClick={() => setFiltr(id)}>{label}</button>)}
          </div>
          <div className="rex-av-tools">
            <label><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj pracownika..." /></label>
            <button aria-label="Filtry"><Filter size={16} /></button>
            <div><button onClick={() => setWeekStart(dyAddDays(weekStart, -7))}><ChevronLeft size={16} /></button><strong>{weekLabel}</strong><button onClick={() => setWeekStart(dyAddDays(weekStart, 7))}><ChevronRight size={16} /></button></div>
          </div>
        </section>
        <div className="rex-av-layout">
          <main>
            <section className="rex-av-week-grid">
              <div className="rex-av-grid-head"><div>PRACOWNIK</div>{days.map((d) => <div key={d.date}><span>{d.label}</span><strong>{d.day}</strong></div>)}</div>
              {osoby.map((o) => <div className="rex-av-grid-row" key={o.id}>
                <div className="rex-av-person"><span>{dyInicjaly(o.name)}</span><div><strong>{o.name}</strong><small>{o.login}</small></div></div>
                {days.map((d) => { const it = naDzien(o.id, d.date); return <button key={d.date} className={`rex-av-cell ${it ? `${dyKlasa(it.type)} ${it.status}` : 'empty'} ${it && it.conflict ? 'conflict' : ''}`} onClick={() => it && setSelId(it.id)} disabled={!it}>
                  {it ? <><span>{DY_TYPY[it.type].short}</span><strong>{dyTime(it)}</strong>{it.recurrence === 'weekly' && <Repeat2Icon />}{it.conflict && <AlertTriangle size={10} />}</> : <i>—</i>}
                </button>; })}
              </div>)}
              {!osoby.length && <div className="rex-av-empty">Brak zgłoszeń w wybranym tygodniu.</div>}
              <div className="rex-av-legend"><span><i className="available" /> Dostępny</span><span><i className="limited" /> Ograniczenie</span><span><i className="unavailable" /> Niedostępny</span><span><i className="pending" /> Oczekuje</span><span><AlertTriangle size={11} /> Konflikt</span></div>
            </section>
            <section className="rex-av-queue">
              <header><div><strong>Lista zgłoszeń</strong><span>{widoczne.length} pozycji</span></div><small>aktualizacja po decyzji</small></header>
              {widoczne.map((r) => <button key={r.id} className={sel && sel.id === r.id ? 'active' : ''} onClick={() => setSelId(r.id)}>
                <span className="rex-av-avatar">{dyInicjaly(r.name)}</span>
                <span><strong>{r.name}</strong><small>{DY_TYPY[r.type].label} · {dyTime(r)}</small></span>
                <time>{new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(new Date(r.date + 'T12:00:00'))}</time>
                {r.conflict && <em className="conflict"><AlertTriangle size={11} /> konflikt</em>}
                <b className={r.status}>{r.status === 'pending' ? 'Do decyzji' : r.status === 'approved' ? 'Zaakceptowana' : 'Odrzucona'}</b>
              </button>)}
            </section>
          </main>
          <aside className="rex-av-review">
            {sel ? <>
              <header><div><span>{dyInicjaly(sel.name)}</span><div><small>ZGŁOSZENIE #{String(sel.id).slice(-4).toUpperCase()}</small><strong>{sel.name}</strong><em>{sel.login} · PLK 201043</em></div></div><b className={sel.status}>{sel.status === 'pending' ? 'Do decyzji' : sel.status === 'approved' ? 'Zaakceptowana' : 'Odrzucona'}</b></header>
              {sel.conflict && <div className="rex-av-warning"><AlertTriangle size={16} /><div><strong>Konflikt z opublikowanym grafikiem</strong><span>Decyzja może wymagać korekty grafiku.</span></div></div>}
              <div className="rex-av-review-grid"><span><small>DATA</small><strong>{dyData(sel.date)}</strong></span><span><small>TYP</small><strong>{DY_TYPY[sel.type].label}</strong></span><span><small>GODZINY</small><strong>{dyTime(sel)}</strong></span><span><small>POWTARZALNOŚĆ</small><strong>{sel.recurrence === 'weekly' ? `Co tydzień do ${sel.repeatUntil}` : 'Tylko ten dzień'}</strong></span></div>
              <div className="rex-av-note"><MessageSquare size={15} /><div><small>KOMENTARZ PRACOWNIKA</small><p>{sel.note || 'Brak komentarza.'}</p></div></div>
              <label className="rex-av-manager-note"><span>Notatka managera</span><textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcjonalna informacja dla pracownika..." /></label>
              <div className="rex-av-actions"><button className="reject" disabled={busy} onClick={() => decyzja('rejected')}><X size={15} /> Odrzuć</button><button className="approve" disabled={busy} onClick={() => decyzja('approved')}><Check size={15} /> Akceptuj</button></div>
              <button className="rex-av-schedule-link" onClick={() => setPage('wt')}><CalendarCheck2 size={14} /> Pokaż w grafiku</button>
            </> : <div className="rex-av-empty">Wybierz zgłoszenie z listy.</div>}
          </aside>
        </div>
      </div>
    </div>
  );
};
const Repeat2Icon = () => <RefreshCw size={10} />;

// ═════════ REX WorkRhythm Modules v1.0.0 — Time & Attendance (live) ═════════
const TA_NAZWY = { clock_in: 'Wejście', break_start: 'Start przerwy', break_end: 'Koniec przerwy', clock_out: 'Wyjście' };
const taTone = (t) => t === 'clock_in' ? 'in' : t === 'clock_out' ? 'out' : 'break';
const taCzas = (ts) => new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Warsaw' }).format(new Date(ts));
const TaLive = ({ data }) => {
  // ── Time & Attendance 1:1 wg wzorca ORDO — realne odbicia z Employee Hub ──
  const [events, setEvents] = useState([]);
  const [syncAt, setSyncAt] = useState(null);
  const [day, setDay] = useState(ymd(new Date()));
  const [filtr, setFiltr] = useState('all');
  const [q, setQ] = useState('');
  const zaladuj = useCallback(async () => { try { const r = await api('/clock'); if (r && r.success) { setEvents(r.events || []); setSyncAt(new Date()); } } catch {} }, []);
  useEffect(() => { zaladuj(); const t = setInterval(zaladuj, 10000); return () => clearInterval(t); }, [zaladuj]);

  const konta = data.accounts || [];
  const poId = new Map(konta.map((a2) => [a2.id, a2]));
  const poNaz = new Map(konta.flatMap((a2) => [a2.grafikName, a2.name, ...(a2.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a2])));
  const kontoZ = (x) => poId.get(x.accountId) || poNaz.get(String(x.name || '').toUpperCase().trim()) || null;
  const mn2 = (t) => { const [h2, m2] = String(t || '0:0').split(':').map(Number); return h2 * 60 + m2; };
  const hhmm = (ts) => new Date(ts).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  const dziś = ymd(new Date());
  const d0 = new Date(day + 'T00:00:00').getTime(), d1 = d0 + 86400000;
  const evD = events.filter((e) => e.at >= d0 && e.at < d1);
  const planD = (data.shifts || []).filter((x) => x.date === day && !jestInstruktor(x));
  const terazTs = Date.now();
  const terazMin2 = new Date().getHours() * 60 + new Date().getMinutes();

  // wiersz per osoba: plan + odbicia + status
  const wierszeTA = useMemo(() => {
    const mapa = new Map();
    planD.forEach((x) => {
      const k = kontoZ(x); const key = k ? k.id : String(x.name || '').toUpperCase();
      const o = mapa.get(key) || { key, name: k ? k.name : (x.name || '—'), rola: (x.station || '').toUpperCase(), acc: k, plany: [], ev: [] };
      o.plany.push(x); mapa.set(key, o);
    });
    evD.forEach((e) => {
      const k = poId.get(e.accountId); const key = k ? k.id : `ev-${e.accountId}`;
      const o = mapa.get(key) || { key, name: k ? k.name : 'Poza grafikiem', rola: 'BEZ PLANU', acc: k, plany: [], ev: [] };
      o.ev.push(e); mapa.set(key, o);
    });
    return [...mapa.values()].map((o) => {
      o.ev.sort((x2, y2) => x2.at - y2.at);
      const wej = o.ev.filter((e) => e.type === 'clock_in');
      const wyj = o.ev.filter((e) => e.type === 'clock_out');
      const przer = o.ev.filter((e) => e.type === 'break_start').length;
      const pl = o.plany.slice().sort((x2, y2) => mn2(x2.start) - mn2(y2.start))[0] || null;
      const inTs = wej.length ? wej[0].at : null;
      const outTs = wyj.length ? wyj[wyj.length - 1].at : null;
      let pracaMs = 0;
      let otwarte = null;
      o.ev.forEach((e) => {
        if (e.type === 'clock_in' || e.type === 'break_end') { if (otwarte == null) otwarte = e.at; }
        if (e.type === 'break_start' || e.type === 'clock_out') { if (otwarte != null) { pracaMs += e.at - otwarte; otwarte = null; } }
      });
      if (otwarte != null && day === dziś) pracaMs += terazTs - otwarte;
      const pracaMin = Math.round(pracaMs / 60000);
      const last = o.ev[o.ev.length - 1] || null;
      const naZmianie = last && last.type !== 'clock_out';
      let planKon = pl ? mn2(pl.end) : null; if (pl && planKon <= mn2(pl.start)) planKon += 1440;
      const spozn = pl && inTs != null ? Math.round((inTs - d0) / 60000) - mn2(pl.start) : null;
      let status, klasa;
      if (!o.ev.length) {
        if (pl && day === dziś && terazMin2 > mn2(pl.start) + 15 && terazMin2 < planKon) { status = 'Brak wejścia'; klasa = 'status-warning'; }
        else if (pl && day < dziś) { status = 'Brak odbić'; klasa = 'status-warning'; }
        else { status = 'Przed zmianą'; klasa = 'status-active'; }
      } else if (naZmianie) {
        if (pl && day === dziś && terazMin2 > planKon + 15) { status = 'Brak wyjścia'; klasa = 'status-warning'; }
        else if (day < dziś) { status = 'Brak wyjścia'; klasa = 'status-warning'; }
        else { status = last.type === 'break_start' ? 'Na przerwie' : 'Na zmianie'; klasa = 'status-active'; }
      } else if (spozn != null && spozn > 5) { status = 'Spóźnienie'; klasa = 'status-warning'; }
      else { status = 'Zatwierdzone'; klasa = 'status-ready'; }
      const fDur = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
      return {
        ...o, pl, przer, pracaMin,
        planLbl: o.plany.length ? o.plany.map((x2) => `${x2.start}–${x2.end}`).join(' / ') : '—',
        inLbl: inTs ? hhmm(inTs) : '—', outLbl: outTs ? hhmm(outTs) : '—',
        lacznie: o.ev.length ? fDur(pracaMin) : '—',
        roznica: spozn == null ? '—' : `${spozn > 0 ? '+' : '−'}${fDur(Math.abs(spozn))}`,
        spozn, status, klasa, naZmianie,
        ini: String(o.name).split(/\s+/).map((c) => c[0]).join('').slice(0, 2).toUpperCase(),
      };
    }).sort((x2, y2) => x2.name.localeCompare(y2.name, 'pl'));
  }, [evD.length, planD.length, day, syncAt]);

  const wyjatki = wierszeTA.filter((w) => w.klasa === 'status-warning').length;
  const obecni = wierszeTA.filter((w) => w.naZmianie).length;
  const zaplTeraz = planD.filter((x) => { const a2 = mn2(x.start); let b2 = mn2(x.end); if (b2 <= a2) b2 += 1440; return a2 <= terazMin2 && terazMin2 < b2; }).length;
  const zrealH = wierszeTA.reduce((a2, w) => a2 + w.pracaMin, 0) / 60;
  const planH = planD.reduce((a2, x) => a2 + godzZ(x), 0);
  let kosztRz = 0; wierszeTA.forEach((w) => { kosztRz += kosztGodzin(w.acc, w.pracaMin / 60); });
  const fH2 = (h) => `${h.toFixed(1).replace('.', ',')} h`;

  const widoczneTA = wierszeTA.filter((w) => {
    const n = q.trim().toLocaleLowerCase('pl');
    const okF = filtr === 'all' || (filtr === 'issues' ? w.klasa === 'status-warning' : filtr === 'active' ? w.klasa === 'status-active' : w.klasa === 'status-ready');
    return okF && (!n || w.name.toLocaleLowerCase('pl').includes(n));
  });

  const dzien = (n) => { const d2 = new Date(day + 'T12:00:00'); d2.setDate(d2.getDate() + n); setDay(d2.toISOString().slice(0, 10)); };
  const dayLbl = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(day + 'T12:00:00'));
  const completedD = ((data.ts || {}).completed || {})[day];
  const zamknij = () => { if (wyjatki > 0) return data.show(`Najpierw rozwiąż ${wyjatki} wyjątki (korekty w widoku dnia → Wykonanie)`, 'error'); data.tsSetCompletedWeek([day], !completedD); };
  const raport = () => {
    const rows = ['Pracownik;Plan;Wejście;Wyjście;Łącznie;Różnica;Status', ...wierszeTA.map((w) => `${w.name};${w.planLbl};${w.inLbl};${w.outLbl};${w.lacznie};${w.roznica};${w.status}`)];
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(blob); const a2 = document.createElement('a'); a2.href = u; a2.download = `czas-pracy-${day}.csv`; a2.click(); URL.revokeObjectURL(u);
  };
  const wejsc = wierszeTA.filter((w) => w.inLbl !== '—').length;
  const przerwLacz = wierszeTA.reduce((a2, w) => a2 + w.przer, 0);
  const gotowosc = wierszeTA.length ? Math.round(((wejsc / Math.max(1, wierszeTA.length)) * 50) + (wyjatki === 0 ? 40 : Math.max(0, 40 - wyjatki * 10)) + (completedD ? 10 : 0)) : 0;

  return (
    <div className="module-view time-view">
      <MHead kicker={`WORKFORCE • ${dayLbl.toUpperCase()}`} title="Time & Attendance" copy="Odbicia, przerwy, korekty oraz różnice między grafikiem a rzeczywistym czasem pracy.">
        <button className="secondary-action" onClick={raport}><Download size={16} /> Raport</button>
        <button className="primary-action" onClick={zamknij}><Lock size={16} /> {completedD ? 'Dzień zamknięty' : 'Zamknij dzień'}</button>
      </MHead>
      <section className="time-kpis">
        <MMetric icon={UserCheck} label="Obecni teraz" value={`${obecni} osób`} helper={`${zaplTeraz} zaplanowanych`} tone={obecni < zaplTeraz ? 'coral' : 'mint'} />
        <MMetric icon={Clock3} label="Godziny zrealizowane" value={fH2(zrealH)} helper={`${fH2(planH)} plan`} tone="blue" />
        <MMetric icon={AlertTriangle} label="Wyjątki" value={`${wyjatki} ${wyjatki === 1 ? 'otwarty' : 'otwarte'}`} helper={wyjatki ? 'wymagają weryfikacji' : 'wszystko zgodne'} tone={wyjatki ? 'coral' : 'mint'} />
        <MMetric icon={CircleDollarSign} label="Koszt rzeczywisty" value={`${Math.round(kosztRz).toLocaleString('pl-PL')} zł`} helper="wg stawek kont" tone="violet" />
      </section>
      <section className="time-layout">
        <article className="panel timesheet-panel">
          <div className="scheduler-toolbar">
            <div className="week-control"><button onClick={() => dzien(-1)}><ChevronLeft size={17} /></button><strong>{dayLbl}</strong><button onClick={() => dzien(1)}><ChevronRight size={17} /></button>{day !== dziś && <button className="today-chip" onClick={() => setDay(dziś)}>Dzisiaj</button>}</div>
            <div>
              <select className="tool-button" value={filtr} onChange={(e) => setFiltr(e.target.value)}><option value="all">Wszystkie</option><option value="issues">Wyjątki</option><option value="active">Na zmianie</option><option value="approved">Zatwierdzone</option></select>
              <span className="tool-button" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj" style={{ border: 0, outline: 0, background: 'transparent', width: 90, font: 'inherit', color: 'inherit' }} /></span>
            </div>
          </div>
          <div className="attendance-table">
            <div className="attendance-head"><span>Pracownik</span><span>Plan</span><span>Wejście</span><span>Wyjście</span><span>Łącznie</span><span>Różnica</span><span>Status</span><span /></div>
            {widoczneTA.map((w) => (
              <div className="attendance-row" key={w.key}>
                <span className="attendance-person"><i>{w.ini}</i><span><strong>{w.name}</strong><small>{w.rola || '—'}</small></span></span>
                <span>{w.planLbl}</span><span>{w.inLbl}</span><span>{w.outLbl}</span>
                <span><strong>{w.lacznie}</strong></span>
                <span className={w.spozn != null && w.spozn > 5 ? 'diff-bad' : ''}>{w.roznica}</span>
                <span><em className={w.klasa}>{w.status}</em></span>
                <span>{w.klasa === 'status-warning' ? <button className="fix-button" onClick={() => data.show('Korektę zapiszesz w Schedule → widok dnia → Wykonanie', 'info')}>Skoryguj</button> : <button className="row-more" aria-label={`Szczegóły ${w.name}`} onClick={() => data.show(`${w.name}: ${w.przer} przerw, ${w.lacznie} przepracowane`, 'info')}><MoreHorizontal size={17} /></button>}</span>
              </div>
            ))}
            {!widoczneTA.length && <div className="attendance-row"><span className="attendance-person"><i>—</i><span><strong>Brak kart czasu</strong><small>zmień dzień lub filtr</small></span></span></div>}
          </div>
        </article>
        <aside className="time-side">
          <article className="panel attendance-source-panel">
            <div className="panel-title"><div><span>ŹRÓDŁO ZDARZEŃ</span><h2>ORDO Employee Hub</h2></div><Smartphone size={19} /></div>
            <div className="mobile-source-row"><i><Smartphone size={15} /></i><span><strong>Wejścia mobilne</strong><small>{syncAt ? `sync ${syncAt.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}` : 'oczekiwanie na sync'}</small></span><b>{wejsc}/{wierszeTA.filter((w) => w.plany.length).length || wejsc}</b></div>
            <div className="mobile-source-row"><i><Coffee size={15} /></i><span><strong>Przerwy w aplikacji</strong><small>{przerwLacz} {przerwLacz === 1 ? 'zdarzenie' : 'zdarzeń'} dziś</small></span><b>{przerwLacz}</b></div>
            <div className="mobile-source-info"><AlertCircle size={15} /> Rejestracja czasu odbywa się wyłącznie w aplikacji pracownika.</div>
          </article>
          <article className="panel closing-panel">
            <div className="panel-title"><div><span>ROZLICZENIE</span><h2>Gotowość dnia</h2></div><strong>{gotowosc}%</strong></div>
            <div className="closing-progress"><i style={{ width: `${gotowosc}%` }} /></div>
            {[['Odbicia zebrane', `${wejsc}/${wierszeTA.filter((w) => w.plany.length).length || wejsc}`, wejsc >= (wierszeTA.filter((w) => w.plany.length).length || 1)], ['Przerwy sprawdzone', `${przerwLacz}`, true], ['Wyjątki rozwiązane', wyjatki ? `${wyjatki} otwarte` : 'gotowe', wyjatki === 0], ['Akceptacja managera', completedD ? 'gotowe' : 'oczekuje', !!completedD]].map(([label, value, ok]) => (
              <div className="closing-row" key={String(label)}><i className={ok ? 'ok' : 'pending'}>{ok ? <Check size={13} /> : <Clock3 size={13} />}</i><span>{label}</span><strong>{value}</strong></div>
            ))}
          </article>
        </aside>
      </section>
    </div>
  );
};
const DialogS = ({ title, kicker, description, onClose, children, actions, size = 'medium' }) => {
  useEffect(() => {
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const onKey = (ev) => { if (ev.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}>
      <section className={`app-dialog dialog-${size}`} role="dialog" aria-modal="true">
        <header className="dialog-header"><div>{kicker && <span>{kicker}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div><button onClick={onClose} aria-label="Zamknij"><X size={19} /></button></header>
        <div className="dialog-body">{children}</div>
        {actions && <footer className="dialog-actions">{actions}</footer>}
      </section>
    </div>
  );
};

// ── WFM-02: dostępność — akceptacja propozycji pracowników ──
const DNI_KROTKIE = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const opisDnia = (w) => !w || w.tryb === 'pelna' ? 'cały dzień' : w.tryb === 'brak' ? '—' : `${w.od}–${w.do}`;
const AvailabilityAdmin = ({ data }) => {
  const [lista, setLista] = useState(null);
  const zaladuj = () => { api('/availability').then((r) => { if (r && r.success) setLista(r.list || []); }).catch(() => {}); };
  useEffect(zaladuj, []);
  const decyzja = async (rec, akcja) => {
    const r = await api('/availability', 'POST', { accountId: rec.accountId, action: akcja });
    if (r.success) { zaladuj(); data.show(akcja === 'approve' ? `Dostępność ${rec.name} zatwierdzona` : 'Propozycja odrzucona'); }
    else data.show(r.error || 'Błąd', 'error');
  };
  const oczekujace = (lista || []).filter((x) => x.pending);
  if (!oczekujace.length) return null;
  const kolejnosc = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #741334' }}>
      <h3 className="text-lg font-semibold mb-1" style={{ color: colors.primary.darkest }}>Propozycje dostępności ({oczekujace.length})</h3>
      <p className="text-xs mb-4" style={{ color: colors.primary.light }}>Po zatwierdzeniu planer blokuje dni „niedostępny" i ostrzega poza oknem godzin (WFM-02/05).</p>
      <div className="space-y-3">
        {oczekujace.map((rec) => (
          <div key={rec.accountId} className="rounded-xl p-3" style={{ backgroundColor: colors.primary.bgLight }}>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-semibold flex-1" style={{ color: colors.primary.darkest }}>{rec.name}</p>
              <button onClick={() => decyzja(rec, 'approve')} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#741334' }}>Zatwierdź</button>
              <button onClick={() => decyzja(rec, 'reject')} className="px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>Odrzuć</button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {kolejnosc.map((d) => { const nowy = (rec.pending.wzor || {})[d]; const stary = (rec.wzor || {})[d]; const zmiana = JSON.stringify(nowy) !== JSON.stringify(stary); return (
                <span key={d} className="text-[11.5px]" style={{ color: zmiana ? '#A7465F' : colors.primary.light, fontWeight: zmiana ? 700 : 400 }}>{DNI_KROTKIE[d]}: {opisDnia(nowy)}</span>
              ); })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Dziennik audytu (DATA-04): niezmienny zapis operacji wrażliwych ──
const AuditCard = () => {
  const [wpisy, setWpisy] = useState(null);
  const [filtr, setFiltr] = useState('');
  const zaladuj = (f) => { api(`/audit?limit=100${f ? `&action=${encodeURIComponent(f)}` : ''}`).then((r) => { if (r && r.success) setWpisy(r.entries || []); }).catch(() => {}); };
  useEffect(() => { zaladuj(''); }, []);
  const opis = { 'auth.login': 'logowanie', 'auth.login-failed': 'nieudane logowanie', 'schedule.add': 'dodanie zmiany', 'schedule.update': 'edycja zmiany', 'schedule.remove': 'usunięcie zmiany', 'schedule.import': 'import grafiku', 'swap.approve': 'zamiana zatwierdzona', 'swap.reject': 'zamiana odrzucona', 'timesheet.write': 'zapis wykonania', 'account.create': 'nowe konto', 'account.update': 'edycja konta', 'account.delete': 'usunięcie konta', 'account.reset-password': 'reset hasła', 'terminal.add': 'nowy terminal', 'template.apply': 'użycie szablonu' };
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold" style={{ color: colors.primary.darkest }}>Dziennik audytu</h3>
        <select value={filtr} onChange={(e) => { setFiltr(e.target.value); zaladuj(e.target.value); }} className="px-2 py-1 rounded-lg border text-xs" style={{ borderColor: colors.primary.bg }}>
          <option value="">wszystkie operacje</option>
          <option value="auth.">logowania</option>
          <option value="schedule.">grafik</option>
          <option value="swap.">zamiany</option>
          <option value="timesheet.">wykonanie</option>
          <option value="account.">konta</option>
          <option value="terminal.">terminale</option>
        </select>
      </div>
      <p className="text-xs mb-3" style={{ color: colors.primary.light }}>Zapis niezmienny (append-only) — kto, co i kiedy; wartości przed/po dostępne w API (/api/audit).</p>
      {wpisy === null ? <p className="text-sm text-slate-400">Ładowanie…</p> : wpisy.length === 0 ? <p className="text-sm text-slate-400">Brak wpisów.</p> : (
        <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
          {wpisy.map((w, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-lg text-[12px]" style={{ backgroundColor: i % 2 ? '#fff' : colors.primary.bgLight }}>
              <span className="shrink-0 tabular-nums" style={{ color: colors.primary.light }}>{new Date(w.at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="font-semibold shrink-0" style={{ color: w.action === 'auth.login-failed' ? '#B94352' : colors.primary.darkest }}>{opis[w.action] || w.action}</span>
              <span className="truncate" style={{ color: colors.primary.medium }}>{w.actor}{w.role ? ` (${w.role})` : ''}{w.target ? ` → ${w.target}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Rejestr terminali REX Clock (SEC-04): odbicia tylko z urządzeń dodanych przez ASM ──
const TerminalsCard = ({ data }) => {
  const [terms, setTerms] = useState(null);
  const [tid, setTid] = useState('');
  const [tname, setTname] = useState('');
  useEffect(() => { api('/clock?action=terminals').then((r) => { if (r && r.success) setTerms(r.terminals || []); }).catch(() => {}); }, []);
  const dodaj = async () => {
    if (!tid.trim()) return data.show('Podaj identyfikator terminala', 'error');
    const r = await api('/clock?action=terminal-add', 'POST', { id: tid.trim(), name: tname.trim() });
    if (r.success) { setTerms(r.terminals); setTid(''); setTname(''); data.show('Terminal zarejestrowany', 'success'); } else data.show(r.error || 'Błąd', 'error');
  };
  const przelacz = async (t) => { const r = await api('/clock?action=terminal-toggle', 'POST', { id: t.id }); if (r.success) setTerms(r.terminals); else data.show(r.error || 'Błąd', 'error'); };
  const usun = async (t) => { if (!confirm(`Usunąć terminal ${t.id}? Urządzenie straci możliwość odbijania.`)) return; const r = await api('/clock?action=terminal-del', 'POST', { id: t.id }); if (r.success) setTerms(r.terminals); else data.show(r.error || 'Błąd', 'error'); };
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl">
      <h3 className="font-bold mb-1" style={{ color: colors.primary.darkest }}>Terminale REX Clock</h3>
      <p className="text-xs mb-4" style={{ color: colors.primary.light }}>Odbicia przyjmowane są wyłącznie z zarejestrowanych, aktywnych terminali (identyfikator z adresu urządzenia: ?terminal=…).</p>
      {terms === null ? <p className="text-sm text-slate-400">Ładowanie…</p> : terms.length === 0 ? <p className="text-sm mb-3" style={{ color: '#A7465F' }}>Brak terminali — REX Clock nie przyjmie żadnych odbić, dopóki nie dodasz urządzenia.</p> : (
        <div className="space-y-2 mb-4">
          {terms.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ backgroundColor: colors.primary.bgLight }}>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate" style={{ color: colors.primary.darkest }}>{t.id}</p><p className="text-[11px] truncate" style={{ color: colors.primary.light }}>{t.name}{t.lastSeen ? ` · ostatnio: ${new Date(t.lastSeen).toLocaleString('pl-PL')}` : ' · jeszcze nie użyty'}</p></div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: t.active === false ? '#F5E3E8' : '#F1E4E8', color: t.active === false ? '#B94352' : '#741334' }}>{t.active === false ? 'wycofany' : 'aktywny'}</span>
              <button onClick={() => przelacz(t)} className="text-xs font-medium" style={{ color: colors.primary.medium }}>{t.active === false ? 'przywróć' : 'wycofaj'}</button>
              <button onClick={() => usun(t)} className="text-red-300 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={tid} onChange={(e) => setTid(e.target.value)} placeholder="ID (np. K003-POS-01)" className="flex-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} />
        <input value={tname} onChange={(e) => setTname(e.target.value)} placeholder="Opis (np. POS przy kuchni)" className="flex-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} />
        <button onClick={dodaj} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: colors.primary.medium }}>Dodaj</button>
      </div>
    </div>
  );
};

const SettingsPage = ({ data }) => {
  const [linked, setLinked] = useState([]);
  const [linkLogin, setLinkLogin] = useState('');
  const [linkPass, setLinkPass] = useState('');
  const [linkRola, setLinkRola] = useState('asm');
  const [resetReqs, setResetReqs] = useState([]);
  useEffect(() => { api('/admin-auth', 'GET').then((r) => { if (r && r.success) { setLinked(r.linked || []); setResetReqs(r.resetReqs || []); } }).catch(() => {}); }, []);
  const zresetujHaslo = async (rq) => {
    const konto = (data.accounts || []).find((a) => String(a.login || '').toUpperCase() === rq.login);
    if (!konto) return data.show('Nie znaleziono konta ' + rq.login, 'error');
    if (!confirm(`Zresetować hasło konta ${rq.login} (${rq.name || konto.name})?`)) return;
    try {
      const r = await api('/accounts?action=reset', 'POST', { id: konto.id });
      if (!r.success) return data.show(r.error || 'Błąd resetu', 'error');
      await api('/admin-auth', 'POST', { action: 'reset-done', login: rq.login });
      setResetReqs((v) => v.filter((x) => x.login !== rq.login));
      alert(`Tymczasowe hasło dla ${r.login}: ${r.haslo}\nPrzekaż je pracownikowi — przy pierwszym logowaniu ustawi własne.`);
      data.show('Hasło zresetowane', 'success');
    } catch (e) { data.show((e && e.message) || 'Błąd', 'error'); }
  };
  const zamknijReq = async (rq) => {
    try { await api('/admin-auth', 'POST', { action: 'reset-done', login: rq.login }); setResetReqs((v) => v.filter((x) => x.login !== rq.login)); } catch {}
  };
  const powiaz = async () => {
    if (!linkLogin.trim() || !linkPass) return data.show('Podaj login konta i hasło ASM', 'error');
    try { const r = await api('/admin-auth', 'POST', { action: 'link', accountLogin: linkLogin.trim(), asmPassword: linkPass, role: linkRola });
      if (r.success) { setLinked(r.linked); setLinkLogin(''); setLinkPass(''); data.show('Konto powiązane z rolą ASM', 'success'); } else data.show(r.error || 'Błąd', 'error');
    } catch (e) { data.show((e && e.message) || 'Błąd', 'error'); }
  };
  const zdejmij = async (l) => {
    const pw = prompt(`Odpinasz ${l} od roli ASM. Podaj obecne hasło ASM:`);
    if (pw == null) return;
    try { const r = await api('/admin-auth', 'POST', { action: 'unlink', accountLogin: l, asmPassword: pw });
      if (r.success) { setLinked(r.linked); data.show('Konto odpięte', 'success'); } else data.show(r.error || 'Błąd', 'error');
    } catch (e) { data.show((e && e.message) || 'Błąd', 'error'); }
  };
  const clearSchedule = async () => {
    if (!confirm('Usunąć cały grafik z systemu? Pracownicy nie zobaczą żadnych zmian.')) return;
    await data.clearSchedule();
  };
  const inp = "w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none";
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Ustawienia" subtitle="Dostęp i konfiguracja panelu" />
      <div className="flex-1 p-8 space-y-6 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>

        <TerminalsCard data={data} />

        <AuditCard />

        {resetReqs.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl" style={{ borderLeft: `4px solid #A7465F` }}>
            <h3 className="font-bold mb-1" style={{ color: colors.primary.darkest }}>Zgłoszenia resetu hasła <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white ml-1" style={{ backgroundColor: '#d87b52' }}>{resetReqs.length}</span></h3>
            <p className="text-xs mb-4" style={{ color: colors.primary.light }}>Zgłoszone z ekranu logowania. Reset generuje tymczasowe hasło do przekazania — pracownik ustawi własne przy pierwszym logowaniu.</p>
            <div className="space-y-2">
              {resetReqs.map((rq) => (
                <div key={rq.login} className="flex items-center gap-3 px-3 py-2 rounded-lg flex-wrap" style={{ backgroundColor: '#fff2e8' }}>
                  <div className="min-w-0 flex-1"><p className="text-sm font-mono font-bold" style={{ color: colors.primary.darkest }}>{rq.login}</p><p className="text-[11px]" style={{ color: colors.primary.light }}>{rq.name || '—'} · {new Date(rq.at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p></div>
                  <button onClick={() => zresetujHaslo(rq)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: '#2B171E' }}>Resetuj hasło</button>
                  <button onClick={() => zamknijReq(rq)} className="text-xs font-semibold" style={{ color: '#B94352' }}>Odrzuć</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl" style={{ borderLeft: `4px solid #741334` }}>
          <h3 className="font-bold mb-1" style={{ color: colors.primary.darkest }}>Uprawnienia panelu — automatyczne z funkcji + nadpisania</h3>
          <p className="text-xs mb-4" style={{ color: colors.primary.light }}>Rola panelu wynika AUTOMATYCZNIE z funkcji konta: Zastępca kierownika (ASM) i Kierownik restauracji (RGM) mają pełny dostęp, Kierownik zmiany (SM) i Młodszy kierownik (JSM) — grafik i wydruk. Poniższe powiązania to NADPISANIA dla wyjątków (np. wspólne konto kierowników z funkcją CREW). Logowanie zawsze tym samym loginem i PIN-em/hasłem co do aplikacji pracownika; zapasowy login ASM nadal działa.</p>
          <div className="space-y-2">
            {(linked || []).map((l) => (
              <div key={l.login || l} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: colors.primary.bgLight }}>
                <span className="text-sm font-mono font-semibold" style={{ color: colors.primary.darkest }}>{l.login || l}</span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: (l.role || 'asm') === 'asm' ? '#2B171E' : '#741334', color: 'white' }}>{(l.role || 'asm') === 'asm' ? 'ASM' : 'Kierownik zmiany'}</span>
                <button onClick={() => zdejmij(l.login || l)} className="text-xs font-semibold" style={{ color: '#B94352' }}>Odepnij</button>
              </div>
            ))}
            {(linked || []).length === 0 && <p className="text-xs" style={{ color: colors.primary.light }}>Brak powiązanych kont.</p>}
            <input value={linkLogin} onChange={(e) => setLinkLogin(e.target.value)} placeholder="Login konta pracowniczego (np. PLPLK201043)" className={inp} />
            <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: colors.primary.bgLight }}>{[['asm', 'ASM — pełny dostęp'], ['kierownik', 'Kierownik zmiany — grafik i wydruk']].map(([id, l]) => (
              <button key={id} type="button" onClick={() => setLinkRola(id)} className="flex-1 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: linkRola === id ? colors.primary.medium : 'transparent', color: linkRola === id ? 'white' : colors.primary.light }}>{l}</button>
            ))}</div>
            <input type="password" value={linkPass} onChange={(e) => setLinkPass(e.target.value)} placeholder="Obecne hasło ASM (wymagane)" className={inp} style={{ borderColor: '#2B171E' }} />
            <Btn onClick={powiaz}>Powiąż konto z rolą ASM</Btn>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl" style={{ borderLeft: `4px solid #B94352` }}>
          <h3 className="text-lg font-bold mb-2" style={{ color: colors.primary.darkest }}>Strefa zagrożenia</h3>
          <p className="text-sm mb-4" style={{ color: colors.primary.light }}>Usuń cały grafik z bazy danych.</p>
          <Btn variant="danger" icon={Trash2} onClick={clearSchedule} loading={data.loading}>Wyczyść grafik</Btn>
        </div>
        <p className="text-center text-sm" style={{ color: colors.primary.light }}>REX Cloud Admin v3.0 — Vercel KV</p>
      </div>
    </div>
  );
};

// ===================== PLAN GODZIN =====================

const Sekcja = ({ children, kolor, tytul, ikona: Ik }) => (
  <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${kolor}` }}>
    <div className="flex items-center gap-2 mb-4">{Ik && <Ik className="w-5 h-5" style={{ color: kolor }} />}<h3 className="text-lg font-semibold" style={{ color: colors.primary.darkest }}>{tytul}</h3></div>
    {children}
  </div>
);

const toISOdate = (v) => { if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`; const s = String(v); const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; const d = new Date(v); return isNaN(d) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// ===================== OPTYMALIZACJA (silnik MAPAL-style, sloty 30 min) =====================
const OC = { cel: "#741334", silnik: "#A7465F", obsada: "#5A3542", ok: "#5A3542", warn: "#A7465F", bad: "#B94352" };
const S0 = 6, NS = 48;                       // doba operacyjna 06:00 → 06:00
const sl = (h) => (h - S0) * 2;
const hmS = (i) => { const t = (S0 * 60 + i * 30) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const D3 = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];
const PIK = [13, 14, 15, 16, 17, 18, 19, 20];

// profil godzinowy sprzedaży (udział doby) — z historii micros
const ZLH = { 7: 433, 8: 640, 9: 935, 10: 1231, 11: 1805, 12: 2350, 13: 2714, 14: 2706, 15: 2614, 16: 2530, 17: 2553, 18: 2447, 19: 2647, 20: 2417, 21: 1962, 22: 1378, 23: 901 };
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
const SZAB = [
  { n: "OTWARCIE 06–16", od: 6, do: 16, kol: "#5A3542" }, { n: "OTWARCIE 06–15", od: 6, do: 15, kol: "#5A3542" },
  { n: "KONTROLER I 07–15", od: 7, do: 15, kol: "#A7465F" }, { n: "DOSTAWA 07–12", od: 7, do: 12, kol: "#A7465F" },
  { n: "DOSTAWA+SMAŻ 07–17", od: 7, do: 17, kol: "#A7465F" }, { n: "DOSTAWA 07–15", od: 7, do: 15, kol: "#A7465F" },
  { n: "SMAŻENIE I 10–18", od: 10, do: 18, kol: "#B5482F" }, { n: "ŚRODEK 11–21", od: 11, do: 21, kol: "#A7465F" },
  { n: "ŚRODEK 12–22", od: 12, do: 22, kol: "#A7465F" }, { n: "FLEX SZCZYT 12–20", od: 12, do: 20, kol: "#C0392B" },
  { n: "ZAMKNIĘCIE 15–01", od: 15, do: 25, kol: "#741334" }, { n: "WSPARCIE WIECZ 16–24", od: 16, do: 24, kol: "#5A3542" },
  { n: "ZAMKNIĘCIE 16–01", od: 16, do: 25, kol: "#741334" }, { n: "ZAMKNIĘCIE 17–02", od: 17, do: 26, kol: "#741334" },
  { n: "PREP 18–24", od: 18, do: 24, kol: "#8A8880" }, { n: "ZMYWAK 22–06", od: 22, do: 30, kol: "#4A4A48" },
];

function optZapotrzebowanie(sprzedaz, splh, podloga, tryb, dow) {
  const dem = new Array(NS).fill(0);
  [[6, 7], [24, 25], [25, 26]].forEach(([a, b]) => { const n = KC[a] ? KC[a][dow] : 1; for (let i = sl(a); i < sl(b); i++) dem[i] = Math.max(dem[i], n); });
  for (let h = 7; h <= 23; h++) {
    const n = tryb === "krzywa" ? KC[h][dow] : Math.max(podloga, Math.round((sprzedaz * PROF[h]) / splh));
    for (const i of [sl(h), sl(h) + 1]) dem[i] = Math.max(dem[i], n);
  }
  return dem;
}
function optRozbicie(sprzedaz, splh, podloga, tryb, dow) {
  const dir = new Array(NS).fill(0), ind = new Array(NS).fill(0);
  [[6, 7], [24, 25], [25, 26]].forEach(([a, b]) => { const n = KC[a] ? KC[a][dow] : 1; for (let i = sl(a); i < sl(b); i++) ind[i] = Math.max(ind[i], n); });
  for (let h = 7; h <= 23; h++) {
    const n = tryb === 'krzywa' ? KC[h][dow] : Math.max(podloga, Math.round((sprzedaz * PROF[h]) / splh));
    for (const i of [sl(h), sl(h) + 1]) dir[i] = n;
  }
  return { dir, ind };
}

function optKsztaltuj(dem, wlaczone) {
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
const f0 = (v) => Math.round(v).toLocaleString("pl-PL");
const fH1 = (v) => `${v.toFixed(1).replace(".", ",")} h`;

const OptKpi = ({ label, value, sub, tone }) => (
  <div className="rounded-xl p-3 bg-white shadow-sm border" style={{ borderColor: colors.primary.bg }}>
    <div className="text-[11px]" style={{ color: colors.primary.light }}>{label}</div>
    <div className="font-mono text-lg mt-0.5" style={{ color: tone || colors.primary.darkest }}>{value}</div>
    {sub && <div className="text-[10px]" style={{ color: "#A38D95" }}>{sub}</div>}
  </div>
);
const OptSuw = ({ label, value, min, max, step, unit, onChange }) => (
  <div>
    <div className="flex items-baseline justify-between"><span className="text-xs font-medium" style={{ color: colors.primary.dark }}>{label}</span><span className="font-mono text-xs" style={{ color: OC.silnik }}>{value.toLocaleString("pl-PL")} {unit}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: OC.silnik }} />
  </div>
);

const OptWidokDnia = ({ dem, kc, cover, shifts }) => {
  const W = 780, PL = 116, cw = (W - PL - 4) / NS;
  const rows = [{ l: "Krzywa celu", a: kc, c: OC.cel }, { l: "Zapotrzebowanie", a: dem, c: OC.silnik }, { l: "Obsada z szablonów", a: cover, c: OC.obsada }];
  const diff = cover.map((c, i) => c - dem[i]);
  const H = 22 * (rows.length + 2) + 12, gH = Math.max(26, shifts.length * 15 + 6);
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 700 }}>
        {[...Array(NS)].map((_, i) => { const h = S0 + Math.floor(i / 2); return PIK.includes(h) ? <rect key={i} x={PL + i * cw} y={0} width={cw} height={8} fill={OC.bad} opacity=".7" /> : null; })}
        <text x={2} y={7} fontSize="7.5" fill="#A38D95">Szczyt 13–20</text>
        {[...Array(NS)].map((_, i) => i % 4 === 0 ? <text key={i} x={PL + i * cw} y={18} fontSize="7" fill="#A38D95">{hmS(i).slice(0, 2)}</text> : null)}
        {rows.map((r, ri) => (<g key={ri}>
          <text x={2} y={22 * (ri + 1) + 17} fontSize="8.5" fill={r.c}>{r.l}</text>
          {r.a.map((v, i) => (<g key={i}>
            <rect x={PL + i * cw} y={22 * (ri + 1) + 7} width={cw - .3} height={13} fill={r.c} opacity={v > 0 ? Math.min(.1 + v * .1, .85) : .04} />
            <text x={PL + i * cw + cw / 2} y={22 * (ri + 1) + 17} fontSize="6.5" textAnchor="middle" fill={v > 3 ? "#fff" : "#A38D95"}>{v > 0 ? v : ""}</text>
          </g>))}
        </g>))}
        <text x={2} y={22 * (rows.length + 1) + 17} fontSize="8.5" fill={colors.primary.darkest}>Różnica</text>
        {diff.map((v, i) => { if (dem[i] === 0 && v === 0) return null; const h = S0 + Math.floor(i / 2), kryt = v < 0 && PIK.includes(h);
          return (<g key={i}>
            <rect x={PL + i * cw} y={22 * (rows.length + 1) + 7} width={cw - .3} height={13} fill={v === 0 ? OC.ok : v > 0 ? OC.warn : kryt ? OC.bad : "#E5A5A0"} opacity={v === 0 ? .18 : .75} />
            <text x={PL + i * cw + cw / 2} y={22 * (rows.length + 1) + 17} fontSize="6.5" textAnchor="middle" fill={v === 0 ? OC.ok : "#fff"}>{v === 0 ? "✓" : v > 0 ? `+${v}` : v}</text>
          </g>); })}
      </svg>
      <svg viewBox={`0 0 ${W} ${gH}`} className="w-full" style={{ minWidth: 700 }}>
        {shifts.map((c, i) => (<g key={i}>
          <rect x={PL + c.s * cw} y={2 + i * 15} width={c.len * cw - 1} height={12} rx="2" fill={c.t.kol} />
          <text x={PL + c.s * cw + 3} y={11 + i * 15} fontSize="7.5" fill="#fff">{c.len * cw > 70 ? c.t.n : ""}</text>
        </g>))}
      </svg>
    </div>
  );
};

// ── P4: jakość prognozy — backtest MAPE/WAPE + korekty dnia z uzasadnieniem ──
const ForecastQuality = ({ data }) => {
  const [dane, setDane] = useState(null);
  const [edytuj, setEdytuj] = useState(null);   // { date, value, reason }
  const zaladuj = () => { api('/forecast?days=14').then((r) => { if (r && r.success) setDane(r); }).catch(() => {}); };
  useEffect(zaladuj, []);
  const zapisz = async () => {
    if (!edytuj) return;
    const r = await api('/forecast?action=override', 'POST', edytuj);
    if (r.success) { setEdytuj(null); zaladuj(); data.show(edytuj.value == null || edytuj.value === '' ? 'Korekta usunięta' : `Korekta ${edytuj.date} zapisana`); }
    else data.show(r.error || 'Błąd korekty', 'error');
  };
  const bt = dane && dane.backtest;
  const DK = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border mb-3" style={{ borderColor: colors.primary.bg }}>
      <div className="flex flex-wrap items-center gap-4 mb-3">
        <span className="text-sm font-bold" style={{ color: colors.primary.darkest }}>Jakość prognozy (baseline sezonowy)</span>
        {bt && bt.dni > 0 ? (<>
          <span className="text-xs" style={{ color: colors.primary.medium }}>MAPE <b style={{ color: bt.mape > 15 ? '#B94352' : '#741334' }}>{String(bt.mape).replace('.', ',')}%</b></span>
          <span className="text-xs" style={{ color: colors.primary.medium }}>WAPE <b style={{ color: bt.wape > 12 ? '#B94352' : '#741334' }}>{String(bt.wape).replace('.', ',')}%</b></span>
          <span className="text-xs text-slate-400">backtest: {bt.dni} zakończonych dni · prognoza liczona tylko z danych sprzed dnia</span>
        </>) : <span className="text-xs" style={{ color: '#A7465F' }}>za mało historii sprzedaży do pomiaru błędu — importuj dane dzienne</span>}
      </div>
      {dane && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {dane.days.map((d) => (
            <button key={d.date} onClick={() => setEdytuj({ date: d.date, value: d.override ? d.override.value : (d.baseline ?? ''), reason: d.override ? d.override.reason : '' })}
              className="shrink-0 w-[92px] rounded-lg border px-2 py-1.5 text-left hover:shadow-sm"
              style={{ borderColor: d.override ? '#A7465F' : colors.primary.bg, backgroundColor: d.override ? '#F1E4E8' : 'white' }}>
              <p className="text-[10px] font-bold" style={{ color: colors.primary.light }}>{DK[d.dow]} {d.date.slice(8)}.{d.date.slice(5, 7)}</p>
              <p className="text-[13px] font-bold" style={{ color: colors.primary.darkest }}>{d.forecast != null ? d.forecast.toLocaleString('pl-PL') : '—'}</p>
              <p className="text-[9.5px] truncate" style={{ color: d.override ? '#A7465F' : colors.primary.light }}>{d.override ? `korekta: ${d.override.reason}` : (d.baseline != null ? 'baseline' : 'brak historii')}</p>
            </button>
          ))}
        </div>
      )}
      {edytuj && (
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg p-3" style={{ backgroundColor: colors.primary.bgLight }}>
          <span className="text-sm font-semibold" style={{ color: colors.primary.darkest }}>Korekta {edytuj.date}:</span>
          <div><label className="block text-[10px]" style={{ color: colors.primary.light }}>Prognoza (zł)</label><input type="number" value={edytuj.value} onChange={(e) => setEdytuj((x) => ({ ...x, value: e.target.value }))} className="w-28 px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
          <div className="flex-1 min-w-[180px]"><label className="block text-[10px]" style={{ color: colors.primary.light }}>Uzasadnienie (wymagane)</label><input value={edytuj.reason} onChange={(e) => setEdytuj((x) => ({ ...x, reason: e.target.value }))} placeholder="np. promocja, mecz, święto" className="w-full px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
          <button onClick={zapisz} className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: colors.primary.medium }}>Zapisz</button>
          <button onClick={() => { setEdytuj((x) => ({ ...x, value: '' })); }} className="px-3 py-1.5 rounded-lg text-sm" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>Usuń korektę</button>
          <button onClick={() => setEdytuj(null)} className="px-3 py-1.5 rounded-lg text-sm" style={{ backgroundColor: 'white', color: colors.primary.dark }}>Anuluj</button>
        </div>
      )}
    </div>
  );
};

const ForecastPlan = ({ data, setPage }) => {
  const [tab, setTab] = useState("miesiac");
  const hydrated = useRef(false);
  const [mIdx, setMIdx] = useState(new Date().getMonth());   // zawsze bieżący miesiąc na start
  const [yrSel, setYrSel] = useState(new Date().getFullYear());
  const [splh, setSplh] = useState(420);
  const [podloga, setPodloga] = useState(3);
  const [tryb, setTryb] = useState("silnik");
  const [wl, setWl] = useState(() => Object.fromEntries(SZAB.map((t) => [t.n, true])));
  const [dzien, setDzien] = useState(12);
  const [realSales, setRealSales] = useState({});
  const [realChecks, setRealChecks] = useState({});
  const [importInfo, setImportInfo] = useState(null);
  const [korekta, setKorekta] = useState(0);      // ręczna korekta prognozy w %
  const [oknoTyg, setOknoTyg] = useState(8);      // ile tygodni historii bierzemy pod uwagę
  const [limitMies, setLimitMies] = useState(4700);
  const [mgrDoba, setMgrDoba] = useState(32);
  const [szkol, setSzkol] = useState(162);
  const fileRef = useRef(null);

  useEffect(() => {
    if (hydrated.current || !data.salesData) return;
    const sd = data.salesData;
    if (sd.sales && Object.keys(sd.sales).length) {
      setRealSales(sd.sales); setRealChecks(sd.checks || {});
      const ks = Object.keys(sd.sales).sort();
      setImportInfo({ n: ks.length, from: ks[0], to: ks[ks.length - 1], checks: Object.keys(sd.checks || {}).length });
    }
    if (sd.params) { const p = sd.params; if (p.splh) setSplh(p.splh); if (p.podloga) setPodloga(p.podloga); if (p.tryb) setTryb(p.tryb); if (p.limitMies) setLimitMies(p.limitMies); if (p.mgrDoba) setMgrDoba(p.mgrDoba); if (p.szkol != null) setSzkol(p.szkol); if (p.wl) setWl((w) => ({ ...w, ...p.wl })); }
    hydrated.current = true;
  }, [data.salesData]);

  useEffect(() => { if (!hydrated.current) return; data.saveSales({ params: { splh, podloga, tryb, limitMies, mgrDoba, szkol, wl } }); }, [splh, podloga, tryb, limitMies, mgrDoba, szkol, wl]);

  const onImport = async (file) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      const sales = {}, checks = {};
      let secFrom = null, secTo = null;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || [];
        if (!r.some((c) => String(c).trim().toLowerCase() === "business date")) continue;
        const hdr = r.map((c) => String(c || "").toLowerCase());
        const cDate = hdr.findIndex((h) => h.includes("business date"));
        const cGross = hdr.findIndex((h) => h.includes("gross sales"));
        const cChecks = hdr.findIndex((h) => h.includes("checks count"));
        for (let j = i + 1; j < rows.length; j++) {
          const q = rows[j]; if (!q) continue;
          if (String(q[cDate]).trim().toLowerCase() === "business date") break;
          const ds = toISOdate(q[cDate]); if (!ds) continue;
          if (cGross >= 0 && !isNaN(Number(q[cGross]))) sales[ds] = Number(q[cGross]);
          if (cChecks >= 0 && !isNaN(Number(q[cChecks]))) checks[ds] = Number(q[cChecks]);
          if (!secFrom || ds < secFrom) secFrom = ds;
          if (!secTo || ds > secTo) secTo = ds;
        }
      }
      const keys = Object.keys(sales);
      if (!keys.length) { data.show("Nie znaleziono danych sprzedaży w pliku", "error"); return; }
      setRealSales((p) => ({ ...p, ...sales })); setRealChecks((p) => ({ ...p, ...checks }));
      keys.sort(); const last = new Date(keys[keys.length - 1]);
      setImportInfo({ n: keys.length, from: secFrom, to: secTo, checks: Object.keys(checks).length });
      data.saveSales({ sales, checks });
      data.show(`Zaimportowano ${keys.length} dni sprzedaży${Object.keys(checks).length ? " + paragony" : ""}`);
    } catch (e) { data.show("Błąd importu: " + e.message, "error"); }
  };

  const yrShifts = useMemo(() => { const ys = data.shifts.map((s) => +s.date.slice(0, 4)).filter(Boolean); return ys.length ? Math.max(...ys) : new Date().getFullYear(); }, [data.shifts]);
  const year = yrSel || yrShifts;
  // ── SILNIK ESTYMACJI: profil dnia tygodnia z okna historii + trend tygodniowy ──
  const PRED = useMemo(() => {
    const daty = Object.keys(realSales).sort();
    if (!daty.length) return null;
    const ostatnia = daty[daty.length - 1];
    const granica = new Date(ostatnia); granica.setDate(granica.getDate() - oknoTyg * 7);
    const okno = daty.filter((d) => new Date(d) >= granica);
    const uzyte = okno.length ? okno : daty;

    // średnie wg dnia tygodnia w oknie
    const acc = Array.from({ length: 7 }, () => ({ s: 0, n: 0 }));
    uzyte.forEach((d) => { const dw = new Date(d).getDay(); acc[dw].s += realSales[d]; acc[dw].n++; });
    const wd = acc.map((a) => (a.n ? a.s / a.n : null));

    // trend: regresja liniowa na tygodniowych sumach
    const tyg = {};
    uzyte.forEach((d) => { const x = new Date(d); const pon = new Date(x); pon.setDate(x.getDate() - ((x.getDay() + 6) % 7)); const k = ymd(pon); tyg[k] = (tyg[k] || 0) + realSales[d]; });
    const klucze = Object.keys(tyg).sort();
    const pelne = klucze.length > 2 ? klucze.slice(0, -1) : klucze;   // ostatni tydzień bywa niepełny
    let trend = 0, pewnosc = 0;
    if (pelne.length >= 3) {
      const ys = pelne.map((k) => tyg[k]); const n = ys.length;
      const sx = (n - 1) * n / 2, sxx = (n - 1) * n * (2 * n - 1) / 6;
      const sy = ys.reduce((a, b) => a + b, 0), sxy = ys.reduce((a, y, i) => a + i * y, 0);
      const m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
      const sr = sy / n;
      // Im mniej pełnych tygodni, tym ostrożniej ekstrapolujemy trend (tłumienie).
      pewnosc = Math.max(0, Math.min(1, (n - 2) / 6));
      if (sr > 0 && isFinite(m)) trend = Math.max(-0.03, Math.min(0.03, (m / sr) * pewnosc));
    }
    return { wd, trend, pewnosc, pelneTyg: pelne.length, ostatnia, tygodni: klucze.length, dni: uzyte.length, od: uzyte[0], do: ostatnia };
  }, [realSales, oknoTyg]);

  const estymuj = (ds) => {
    if (!PRED) return null;
    const dw = new Date(ds).getDay();
    const baza = PRED.wd[dw] != null ? PRED.wd[dw] : PRED.wd.filter((x) => x != null).reduce((a, b, _, arr) => a + b / arr.length, 0);
    if (!baza) return null;
    const tygRoznica = (new Date(ds) - new Date(PRED.ostatnia)) / (7 * 864e5);
    return baza * (1 + PRED.trend * tygRoznica) * (1 + korekta / 100);
  };

  const wdAvg = useMemo(() => { const acc = Array.from({ length: 7 }, () => ({ s: 0, n: 0 })); Object.entries(realSales).forEach(([ds, v]) => { const dw = new Date(ds).getDay(); acc[dw].s += v; acc[dw].n++; }); return acc.map((a) => (a.n ? a.s / a.n : null)); }, [realSales]);
  const hasReal = wdAvg.some((x) => x != null);

  const R = useMemo(() => {
    const dim = new Date(year, mIdx + 1, 0).getDate();
    const dni = Array.from({ length: dim }, (_, k) => {
      const d = k + 1, ds = ymd(new Date(year, mIdx, d));
      const js = new Date(ds).getDay(), dow = (js + 6) % 7; // 0=Pon
      const realna = realSales[ds];
      const est = realna == null ? estymuj(ds) : null;
      const sprzedaz = realna != null ? realna : (est != null ? est : 35000);
      const jestEst = realna == null;
      const checks = realChecks[ds] || 0;
      const akt = data.shifts.filter((s) => s.date === ds && !jestInstruktor(s)).reduce((a, s) => a + godzZ(s), 0);
      const dem = optZapotrzebowanie(sprzedaz, splh, podloga, tryb, dow);
      const kc = optZapotrzebowanie(sprzedaz, splh, podloga, "krzywa", dow);
      const { out, cover } = optKsztaltuj(dem, wl);
      const he = out.reduce((a, c) => a + c.len, 0) / 2;
      const { dir, ind } = optRozbicie(sprzedaz, splh, podloga, tryb, dow);
      // pokrycie wynikające z REALNEGO grafiku (do porównania z obsadą idealną — jak Defecto/Exceso w MAPAL)
      const coverAkt = new Array(NS).fill(0);
      data.shifts.filter((x) => x.date === ds && !jestInstruktor(x)).forEach((x) => {
        const a = wtRel(x.start); const dl = Math.round(wtDur(x.start, x.end) / 30);
        for (let i = 0; i < dl; i++) { const p = Math.floor(a / 30) + i; if (p >= 0 && p < NS) coverAkt[p]++; }
      });
      let excA = 0, dDirA = 0, dIndA = 0;
      for (let i = 0; i < NS; i++) {
        const r = coverAkt[i] - dem[i];
        if (r > 0) excA += r;
        else if (r < 0) { const t = dir[i] + ind[i] || 1; dDirA += (-r) * (dir[i] / t); dIndA += (-r) * (ind[i] / t); }
      }
      let exc = 0, dDir = 0, dInd = 0;
      for (let i = 0; i < NS; i++) {
        const r = cover[i] - dem[i];
        if (r > 0) exc += r;
        else if (r < 0) { const t = dir[i] + ind[i] || 1; dDir += (-r) * (dir[i] / t); dInd += (-r) * (ind[i] / t); }
      }
      const ideal = dem.reduce((a, b) => a + b, 0) / 2;
      return { d, ds, dow, sprzedaz, jestEst, checks, akt, dem, kc, cover, dir, ind, shifts: out, he, ideal, coverAkt, exc: exc / 2, dDir: dDir / 2, dInd: dInd / 2, excA: excA / 2, dDirA: dDirA / 2, dIndA: dIndA / 2,
        splhA: akt ? sprzedaz / akt : 0, splhE: he ? sprzedaz / he : 0,
        mptA: checks ? (akt * 60) / checks : 0, mptE: checks ? (he * 60) / checks : 0 };
    });
    const sumS = dni.reduce((a, x) => a + x.sprzedaz, 0), sumA = dni.reduce((a, x) => a + x.akt, 0);
    const sumE = dni.reduce((a, x) => a + x.he, 0), sumC = dni.reduce((a, x) => a + x.checks, 0);
    const zalogaMap = {};
    data.shifts.filter((x) => String(x.date || '').startsWith(`${year}-${String(mIdx + 1).padStart(2, '0')}`) && !jestInstruktor(x)).forEach((x) => { const k = String(x.name || '').toUpperCase().trim(); zalogaMap[k] = (zalogaMap[k] || 0) + godzZ(x); });
    const byDow = [...Array(7)].map((_, i) => { const g = dni.filter((x) => x.dow === i); return { dow: i, n: g.length, s: g.length ? g.reduce((a, x) => a + x.sprzedaz, 0) / g.length : 0, a: g.length ? g.reduce((a, x) => a + x.akt, 0) / g.length : 0, e: g.length ? g.reduce((a, x) => a + x.he, 0) / g.length : 0 }; });
    return { dni, dim, sumS, sumA, sumE, sumC, byDow, zalogaMap, splhA: sumA ? sumS / sumA : 0, splhE: sumE ? sumS / sumE : 0, mgr: mgrDoba * dim };
  }, [year, mIdx, realSales, realChecks, wdAvg, PRED, korekta, splh, podloga, tryb, wl, data.shifts, mgrDoba]);

  const D = R.dni[Math.min(dzien, R.dim) - 1] || R.dni[0];
  const roz = R.sumE - R.sumA;
  const przesun = R.dni.reduce((a, x) => a + Math.abs(x.he - x.akt), 0);
  const razem = R.sumE + R.mgr + szkol;

  const TABS = [["miesiac", "Miesiąc"], ["dzien", "Dzień"], ["pulpit", "Pulpit"], ["prognoza", "Prognoza"], ["zaloga", "Załoga"], ["dane", "Dane"], ["param", "Parametry"]];
  const kosztMies = useMemo(() => {
    const poId = new Map((data.accounts || []).map((a) => [a.id, a]));
    const poNazwie = new Map((data.accounts || []).flatMap((a) => [a.grafikName, ...(a.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a])));
    const pre = `${year}-${String(mIdx + 1).padStart(2, '0')}`;
    return data.shifts.filter((x) => String(x.date || '').startsWith(pre) && !jestInstruktor(x)).reduce((a, x) => {
      const k = (x.accountId && poId.get(x.accountId)) || poNazwie.get(String(x.name || '').toUpperCase().trim());
      return a + kosztGodzin(k, godzZ(x));
    }, 0);
  }, [data.shifts, data.accounts, year, mIdx]);
  const dniEst = R.dni.filter((x) => x.jestEst).length;
  const sumaEst = R.dni.filter((x) => x.jestEst).reduce((a, x) => a + x.sprzedaz, 0);

  return (
    <div>
      <Header title="Optymalizacja" subtitle="Silnik obsady: sprzedaż → zapotrzebowanie w slotach 30 min → szablony zmian → godziny i COL">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-white/80">Miesiąc</span>
          <select value={mIdx} onChange={(e) => setMIdx(Number(e.target.value))} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ color: colors.primary.darkest }}>{months.map((m, i) => <option key={i} value={i}>{m}</option>)}</select>
        </div>
      </Header>
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#F7F5F5", color: colors.primary.dark }}>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files[0] && onImport(e.target.files[0])} />
          <button onClick={() => fileRef.current && fileRef.current.click()} className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2" style={{ backgroundColor: colors.primary.medium }}><Upload size={15} />Importuj sprzedaż (Excel)</button>
          {importInfo ? <span className="text-sm">Wczytano <b>{importInfo.n}</b> dni ({importInfo.from} → {importInfo.to}){importInfo.checks ? `, paragony: ${importInfo.checks} dni` : ""}.</span> : <span className="text-sm">Wgraj raport „Sales Day by Day". Bez importu silnik używa średnich dni tygodnia.</span>}
          {hasReal && <button onClick={() => { setRealSales({}); setRealChecks({}); setImportInfo(null); data.clearSales(); }} className="ml-auto text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: "white", color: colors.primary.dark }}>Wyczyść</button>}
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <button onClick={() => setPage && setPage('wt')} className="px-3 py-1.5 rounded-full font-medium" style={{ backgroundColor: 'white', color: colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>← Siatka grafiku (planowanie)</button>
          <button onClick={() => setPage && setPage('plan')} className="px-3 py-1.5 rounded-full font-medium" style={{ backgroundColor: 'white', color: colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>Budżet i koszty pracy (COL) →</button>
        </div>
        {dniEst > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#F1E4E8", color: "#A7465F" }}>
            <span className="text-sm"><b>Prognoza</b> — {dniEst} z {R.dim} dni tego miesiąca nie ma jeszcze danych sprzedaży, więc są <b>estymowane</b>{PRED ? ` na podstawie ${PRED.dni} dni historii (${PRED.od} → ${PRED.do})` : ""}.</span>
            <button onClick={() => setTab("prognoza")} className="ml-auto text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: colors.primary.medium }}>Ustawienia prognozy</button>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <OptKpi label="Godziny crew — grafik" value={f0(R.sumA) + " h"} sub={`SPLH ${f0(R.splhA)} zł/rbh`} />
          <OptKpi label="Godziny crew — silnik" value={f0(R.sumE) + " h"} sub={`SPLH ${f0(R.splhE)} zł/rbh`} tone={roz < 0 ? OC.ok : OC.warn} />
          <OptKpi label="Różnica" value={`${roz >= 0 ? "+" : "−"}${f0(Math.abs(roz))} h`} tone={roz < 0 ? OC.ok : OC.warn} sub={`${R.sumA ? (roz / R.sumA * 100).toFixed(1).replace(".", ",") : 0}% · przesunięcie ${f0(przesun)} h`} />
          <OptKpi label="Limit miesiąca" value={`${f0(limitMies)} h`} sub={`crew ${f0(R.sumE)} + mgr ${f0(R.mgr)} + szkol. ${szkol} = ${f0(razem)}`} tone={razem > limitMies ? OC.bad : OC.ok} />
          <OptKpi label="Koszt pracy — grafik (szac.)" value={`${f0(kosztMies)} zł`} sub={`${R.sumS ? (kosztMies / R.sumS * 100).toFixed(1).replace('.', ',') : 0}% sprzedaży · pełny COL w module Budżet`} tone={R.sumS && kosztMies / R.sumS > 0.2 ? OC.warn : undefined} />
        </div>

        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: colors.primary.bgLight }}>
          {TABS.map(([id, l]) => <button key={id} onClick={() => setTab(id)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: tab === id ? colors.primary.medium : "transparent", color: tab === id ? "white" : colors.primary.dark }}>{l}</button>)}
        </div>

        {tab === "miesiac" && (
          <Sekcja kolor={colors.primary.medium} tytul={`Dzień po dniu — ${months[mIdx]} ${year}`}>
            <div className="overflow-x-auto"><div className="min-w-[760px]">
              <div className="grid grid-cols-[54px_1fr_1fr_1fr_1fr_1fr_86px] gap-2 px-2 py-2 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}>
                <span>Dzień</span><span className="text-right">Sprzedaż</span><span className="text-right">Grafik h</span><span className="text-right">Silnik h</span><span className="text-right">Δ h</span><span className="text-right">SPLH silnik</span><span className="text-center">Status</span>
              </div>
              {R.dni.map((x) => { const d = x.he - x.akt, over = d > 1.5, under = d < -1.5; return (
                <div key={x.d} className="grid grid-cols-[54px_1fr_1fr_1fr_1fr_1fr_86px] gap-2 px-2 py-1.5 text-sm items-center border-b cursor-pointer hover:bg-slate-50" style={{ borderColor: "#EDE3E6" }} onClick={() => { setDzien(x.d); setTab("dzien"); }}>
                  <span style={{ color: colors.primary.dark }}>{D3[x.dow]} {x.d}</span>
                  <span className="text-right" style={{ color: colors.primary.darkest }}>{f0(x.sprzedaz)}</span>
                  <span className="text-right" style={{ color: colors.primary.dark }}>{fH1(x.akt)}</span>
                  <span className="text-right font-medium" style={{ color: OC.silnik }}>{fH1(x.he)}</span>
                  <span className="text-right font-medium" style={{ color: over ? OC.warn : under ? OC.ok : "#A38D95" }}>{d >= 0 ? "+" : ""}{d.toFixed(1)}</span>
                  <span className="text-right" style={{ color: colors.primary.dark }}>{f0(x.splhE)}</span>
                  <span className="text-center"><span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: over ? "#F1E4E8" : under ? "#F1E4E8" : "#EDE3E6", color: over ? OC.warn : under ? OC.ok : "#71656A" }}>{over ? "dołóż" : under ? "oszczędność" : "OK"}</span></span>
                </div>); })}
            </div></div>
          </Sekcja>
        )}

        {tab === "dzien" && D && (<>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm" style={{ color: colors.primary.light }}>Dzień:</span>
            <select value={dzien} onChange={(e) => setDzien(Number(e.target.value))} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>{R.dni.map((x) => <option key={x.d} value={x.d}>{D3[x.dow]} {x.d} · {f0(x.sprzedaz)} zł</option>)}</select>
            <div className="flex gap-1 ml-auto">{[["silnik", "Silnik (ze sprzedaży)"], ["krzywa", "Krzywa celu"]].map(([id, l]) => <button key={id} onClick={() => setTryb(id)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: tryb === id ? OC.silnik : "white", color: tryb === id ? "white" : colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>{l}</button>)}</div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <OptKpi label="Sprzedaż" value={`${f0(D.sprzedaz)} zł`} sub={D.checks ? `${f0(D.checks)} paragonów` : "—"} />
            <OptKpi label="Grafik / Silnik" value={`${fH1(D.akt)} / ${fH1(D.he)}`} sub={`Δ ${(D.he - D.akt).toFixed(1)} h`} tone={D.he < D.akt ? OC.ok : OC.warn} />
            <OptKpi label="SPLH silnika" value={f0(D.splhE)} sub={`grafik ${f0(D.splhA)}`} />
            <OptKpi label="MPT silnika" value={D.mptE ? D.mptE.toFixed(2) : "—"} sub={D.mptA ? `grafik ${D.mptA.toFixed(2)}` : "brak paragonów"} />
          </div>
          <Sekcja kolor={OC.silnik} tytul="Zapotrzebowanie vs obsada (sloty 30 min)"><OptWidokDnia dem={D.dem} kc={D.kc} cover={D.cover} shifts={D.shifts} /></Sekcja>
          <Sekcja kolor={OC.obsada} tytul={`Proponowane zmiany (${D.shifts.length}) — ${fH1(D.he)}`}>
            <div className="flex flex-wrap gap-2">{D.shifts.map((c, i) => <span key={i} className="text-xs px-2.5 py-1 rounded-lg text-white font-medium" style={{ backgroundColor: c.t.kol }}>{c.t.n}</span>)}</div>
          </Sekcja>
        </>)}

        {tab === "pulpit" && (<>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <OptKpi label="Niedobór pracy bezpośredniej" value={`${f1(R.dni.reduce((a, x) => a + x.dDirA, 0))} h`} tone={PC.dir} sub="grafik vs obsada idealna" />
            <OptKpi label="Niedobór pracy pośredniej" value={`${f1(R.dni.reduce((a, x) => a + x.dIndA, 0))} h`} tone={PC.ind} sub="prep i sprzątanie" />
            <OptKpi label="Nadmiar obsady" value={`${f1(R.dni.reduce((a, x) => a + x.excA, 0))} h`} tone={PC.plan} sub="godziny ponad krzywą" />
            <OptKpi label="Obsada idealna" value={`${f0(R.dni.reduce((a, x) => a + x.ideal, 0))} h`} sub="suma zapotrzebowania" />
          </div>

          <Karta tytul="Rozbieżność miesiąca" podtytul="grafik vs obsada idealna">
            <div className="flex flex-wrap justify-around gap-2">
              <Zegar label="Niedobór pracy bezpośredniej" wartosc={R.dni.reduce((a, x) => a + x.dDirA, 0)} max={300} kolor={PC.dir} />
              <Zegar label="Niedobór pracy pośredniej" wartosc={R.dni.reduce((a, x) => a + x.dIndA, 0)} max={300} kolor={PC.ind} />
              <Zegar label="Nadmiar obsady" wartosc={R.dni.reduce((a, x) => a + x.excA, 0)} max={600} kolor={PC.plan} />
            </div>
            <div className="text-xs text-center mt-1" style={{ color: PC.mute }}>Zsumowane w jedną liczbę te trzy wskaźniki znoszą się nawzajem — dlatego trzymamy je osobno.</div>
          </Karta>

          <Karta tytul="Niedobór i nadmiar" podtytul="wg dni tygodnia, w godzinach"
            prawo={<span style={{ color: PC.mute }}><span style={{ color: PC.dir }}>■</span> bezpośrednia <span style={{ color: PC.ind }}>■</span> pośrednia <span style={{ color: PC.plan }}>■</span> nadmiar</span>}>
            <Rozbieznosc procent={false} grupy={[...Array(7)].map((_, i) => {
              const g = R.dni.filter((x) => x.dow === i);
              const dDir = g.reduce((a, x) => a + x.dDirA, 0), dInd = g.reduce((a, x) => a + x.dIndA, 0);
              const exc = g.reduce((a, x) => a + x.excA, 0), ideal = g.reduce((a, x) => a + x.ideal, 0) || 1;
              return { nazwa: D3[i], def: dDir + dInd, dDir, dInd, exc, pDef: (dDir + dInd) / ideal * 100, pDir: dDir / ideal * 100, pInd: dInd / ideal * 100, pExc: exc / ideal * 100 };
            })} />
          </Karta>

          <Karta tytul="Ewolucja sprzedaży narastająco" podtytul="odchylenie od średniej dziennej, skumulowane"
            prawo={<span style={{ color: PC.mute }}>{months[mIdx]} {year} · {f0(R.sumS)} zł</span>}>
            <Ewolucja dni={R.dni} />
          </Karta>

          <Karta tytul={`Przebieg dnia — ${DNI_PELNE[D.dow]} ${D.d}`} podtytul={`${f0(D.sprzedaz)} zł${D.checks ? ` · ${f0(D.checks)} transakcji` : ''}`}>
            <div className="flex gap-1 flex-wrap mb-2">
              {R.dni.map((x) => (
                <button key={x.d} onClick={() => setDzien(x.d)} className="px-1.5 py-0.5 rounded font-mono" style={{ fontSize: 10, background: x.d === dzien ? PC.ink : PC.bg, color: x.d === dzien ? '#fff' : x.dow >= 5 ? PC.bad : PC.mute, border: `1px solid ${x.d === dzien ? PC.ink : PC.line}` }}>{x.d}</button>))}
            </div>
            <Sroddzienny D={D} nakladka="brak" />
            <div className="flex gap-4 text-xs mt-1" style={{ color: PC.mute }}>
              <span className="flex items-center gap-1"><span className="w-3 h-2 inline-block" style={{ background: PC.ind }} />praca pośrednia</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 inline-block" style={{ background: PC.dir }} />praca bezpośrednia</span>
              <span className="flex items-center gap-1"><span className="w-3 inline-block" style={{ height: 2, background: PC.plan }} />obsada zaplanowana</span>
            </div>
          </Karta>

          <div className="grid md:grid-cols-2 gap-2">
            <Karta tytul="Ranking dni tygodnia" podtytul="SPLH z grafiku">
              <Ranking jednostka="zł/rbh" dane={[...Array(7)].map((_, i) => { const g = R.dni.filter((x) => x.dow === i); const sh = g.reduce((a, x) => a + x.akt, 0); return { n: D3[i], v: sh ? g.reduce((a, x) => a + x.sprzedaz, 0) / sh : 0 }; })} />
            </Karta>
            <Karta tytul="Struktura sprzedaży wg pory dnia" podtytul="z profilu godzinowego">
              <Piers czesci={[
                { n: 'Poranek 07–11', v: [7, 8, 9, 10].reduce((a, h) => a + ZLH[h], 0), kol: '#DFC9D1' },
                { n: 'Lunch 11–15', v: [11, 12, 13, 14].reduce((a, h) => a + ZLH[h], 0), kol: PC.accent },
                { n: 'Popołudnie 15–19', v: [15, 16, 17, 18].reduce((a, h) => a + ZLH[h], 0), kol: PC.plan },
                { n: 'Wieczór 19–23', v: [19, 20, 21, 22, 23].reduce((a, h) => a + ZLH[h], 0), kol: PC.cel },
              ]} />
            </Karta>
          </div>

          <Karta tytul="Godziny idealne vs zaplanowane" podtytul="średnia na dzień tygodnia, linia = wykonanie w %"
            prawo={<span style={{ color: PC.mute }}><span style={{ color: PC.cel }}>■</span> idealne <span style={{ color: PC.plan }}>■</span> w grafiku <span style={{ color: PC.bad }}>—</span> %</span>}>
            <SlupkiLinia dane={[...Array(7)].map((_, i) => { const g = R.dni.filter((x) => x.dow === i) ; const n = g.length || 1; return { n: D3[i], a: g.reduce((x, y) => x + y.ideal, 0) / n, b: g.reduce((x, y) => x + y.akt, 0) / n }; })} />
          </Karta>

          <Karta tytul="Rozkład załogi wg godzin miesiąca" podtytul={`${Object.keys(R.zalogaMap).length} osób`}>
            <Histogram kubelki={(() => { const h = Object.values(R.zalogaMap); return [
              { l: '<40 h', n: h.filter((x) => x < 40).length },
              { l: '40–80', n: h.filter((x) => x >= 40 && x < 80).length },
              { l: '80–120', n: h.filter((x) => x >= 80 && x < 120).length },
              { l: '120–160', n: h.filter((x) => x >= 120 && x < 160).length },
              { l: '160–200', n: h.filter((x) => x >= 160 && x < 200).length },
              { l: '200+', n: h.filter((x) => x >= 200).length }]; })()} />
          </Karta>
        </>)}

        {tab === "prognoza" && (<>
          <ForecastQuality data={data} />
          {!PRED ? (
            <Sekcja kolor="#A7465F" tytul="Brak historii sprzedaży">
              <p className="text-sm" style={{ color: colors.primary.dark }}>Aby prognozować kolejny miesiąc, zaimportuj najpierw raport „Sales Day by Day" z co najmniej kilku tygodni. Im dłuższa historia, tym stabilniejszy profil dni tygodnia i trend.</p>
            </Sekcja>
          ) : (<>
            <Sekcja kolor={colors.primary.medium} tytul="Podstawa prognozy">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <OptKpi label="Dni historii" value={f0(PRED.dni)} sub={`${PRED.od} → ${PRED.do}`} />
                <OptKpi label="Tygodnie w próbie" value={f0(PRED.tygodni)} />
                <OptKpi label="Trend tygodniowy" value={`${PRED.trend >= 0 ? "+" : ""}${(PRED.trend * 100).toFixed(2).replace(".", ",")}%`} tone={PRED.trend >= 0 ? OC.ok : OC.warn} sub={`pewność ${Math.round(PRED.pewnosc * 100)}% · ${PRED.pelneTyg} pełnych tyg.`} />
                <OptKpi label="Dni estymowane" value={`${f0(dniEst)} / ${R.dim}`} sub={dniEst ? `${f0(sumaEst)} zł prognozy` : "miesiąc ma pełne dane"} />
              </div>
            </Sekcja>

            <Sekcja kolor="#2B171E" tytul="Sterowanie prognozą">
              <div className="grid md:grid-cols-2 gap-6">
                <OptSuw label="Okno historii" value={oknoTyg} min={2} max={26} step={1} unit="tyg." onChange={setOknoTyg} />
                <OptSuw label="Ręczna korekta (np. wydarzenie, remont)" value={korekta} min={-30} max={30} step={1} unit="%" onChange={setKorekta} />
              </div>
              <p className="text-xs text-slate-400 mt-3">Krótsze okno szybciej reaguje na zmiany (nowe menu, sezon), dłuższe jest stabilniejsze. Korekta przesuwa całą prognozę w górę lub w dół.</p>
            </Sekcja>

            <Sekcja kolor="#5A3542" tytul="Średnia sprzedaż wg dnia tygodnia (z okna historii)">
              <BPBars unit="zł" items={[1, 2, 3, 4, 5, 6, 0].map((js) => ({ label: D3[(js + 6) % 7], value: PRED.wd[js] || 0, n: 0, color: (js === 0 || js === 5 || js === 6) ? OC.silnik : colors.primary.medium }))} />
            </Sekcja>

            <Sekcja kolor={OC.silnik} tytul={`Prognoza dzienna — ${months[mIdx]} ${year}`}>
              <BPLine labels={R.dni.map((x) => String(x.d))} unit="" series={[{ name: "Sprzedaż (dane + prognoza)", color: OC.silnik, data: R.dni.map((x) => x.sprzedaz), fill: true }]} />
              <div className="overflow-x-auto mt-3"><div className="min-w-[560px]">
                <div className="grid grid-cols-[70px_1fr_1fr_1fr_90px] gap-2 px-2 py-1.5 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}><span>Dzień</span><span className="text-right">Sprzedaż zł</span><span className="text-right">Rekom. h</span><span className="text-right">Plan h</span><span className="text-center">Źródło</span></div>
                {R.dni.map((x) => (
                  <div key={x.d} className="grid grid-cols-[70px_1fr_1fr_1fr_90px] gap-2 px-2 py-1.5 text-sm items-center border-b" style={{ borderColor: "#EDE3E6" }}>
                    <span style={{ color: colors.primary.dark }}>{D3[x.dow]} {x.d}</span>
                    <span className="text-right" style={{ color: colors.primary.darkest }}>{f0(x.sprzedaz)}</span>
                    <span className="text-right font-medium" style={{ color: OC.silnik }}>{fH1(x.he)}</span>
                    <span className="text-right" style={{ color: colors.primary.dark }}>{fH1(x.akt)}</span>
                    <span className="text-center"><span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: x.jestEst ? "#F1E4E8" : "#F1E4E8", color: x.jestEst ? "#A7465F" : "#5A3542" }}>{x.jestEst ? "prognoza" : "dane"}</span></span>
                  </div>
                ))}
              </div></div>
            </Sekcja>
          </>)}
        </>)}

        {tab === "zaloga" && (
          <Sekcja kolor="#2B171E" tytul={`Załoga — godziny pracowników w miesiącu (${months[mIdx]} ${year})`}>
            {(() => {
              const pre = `${year}-${String(mIdx + 1).padStart(2, "0")}`;
              const mies = data.shifts.filter((s) => (s.date || "").slice(0, 7) === pre && !jestInstruktor(s));
              // godziny po IDENTYFIKATORZE KONTA; zapasowo po nazwie w grafiku / aliasach
              const poId = {}, poNazwie = {};
              mies.forEach((s) => {
                if (s.accountId) poId[s.accountId] = (poId[s.accountId] || 0) + godzZ(s);
                else { const k = String(s.name || "").toUpperCase().trim(); poNazwie[k] = (poNazwie[k] || 0) + godzZ(s); }
              });
              const wiersze = (data.accounts || []).map((a) => {
                const klucze = [a.grafikName, ...(a.aliasy || [])].filter(Boolean).map((x) => String(x).toUpperCase().trim());
                const h = (poId[a.id] || 0) + klucze.reduce((x, k) => x + (poNazwie[k] || 0), 0);
                const zmian = mies.filter((s) => s.accountId === a.id || klucze.includes(String(s.name || "").toUpperCase().trim())).length;
                return { id: a.id, name: a.name, funkcja: a.funkcja, instruktor: a.instruktor, grafik: a.grafikName, h, zmian, koszt: kosztGodzin(a, h) };
              }).sort((a, b) => b.h - a.h || a.name.localeCompare(b.name));
              const przypisaneNazwy = new Set((data.accounts || []).flatMap((a) => [a.grafikName, ...(a.aliasy || [])].filter(Boolean).map((x) => String(x).toUpperCase().trim())));
              const bezKonta = Object.entries(poNazwie).filter(([k]) => !przypisaneNazwy.has(k)).sort((a, b) => b[1] - a[1]);
              const max = Math.max(1, ...wiersze.map((x) => x.h));
              const sumaH = wiersze.reduce((a, x) => a + x.h, 0);
              if (!mies.length) return <p className="text-slate-400 text-sm">Brak grafiku w tym miesiącu.</p>;
              return (<>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <OptKpi label="Pracowników ze zmianami" value={f0(wiersze.filter((x) => x.h > 0).length)} sub={`z ${wiersze.length} kont`} />
                  <OptKpi label="Godziny przypisane" value={`${f0(sumaH)} h`} />
                  <OptKpi label="Koszt (szac.)" value={`${f0(wiersze.reduce((a, x) => a + x.koszt, 0))} zł`} />
                  <OptKpi label="Bez konta" value={f0(bezKonta.length)} sub={bezKonta.length ? `${f0(bezKonta.reduce((a, x) => a + x[1], 0))} h poza rozliczeniem` : "wszystko przypisane"} tone={bezKonta.length ? OC.warn : OC.ok} />
                </div>
                <div className="space-y-1.5">
                  {wiersze.filter((x) => x.h > 0).map((w) => (
                    <div key={w.id}>
                      <div className="flex items-center justify-between text-xs mb-0.5 gap-2">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className="font-medium truncate" style={{ color: colors.primary.darkest }}>{w.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{funkcjaLabel(w.funkcja)}</span>
                          {w.instruktor && <span className="shrink-0">🎓</span>}
                        </span>
                        <span className="shrink-0"><b style={{ color: colors.primary.darkest }}>{fH1(w.h)}</b><span className="text-slate-400"> · {w.zmian} zm. · {f0(w.koszt)} zł</span></span>
                      </div>
                      <div className="h-2.5 rounded" style={{ backgroundColor: colors.primary.bgLight }}><div className="h-2.5 rounded" style={{ width: `${w.h / max * 100}%`, backgroundColor: w.h > 200 ? OC.warn : colors.primary.medium }} /></div>
                    </div>
                  ))}
                  <p className="text-xs text-slate-400 mt-2">Suma: {fH1(sumaH)} · pracowników ze zmianami: {wiersze.filter((x) => x.h > 0).length}</p>
                  {wiersze.some((x) => x.h === 0) && <p className="text-xs text-slate-300">Bez zmian w tym miesiącu: {wiersze.filter((x) => x.h === 0).map((x) => x.name).join(", ")}</p>}
                </div>
                {bezKonta.length > 0 && (
                  <div className="mt-4 rounded-xl p-3" style={{ backgroundColor: "#F5E9ED" }}>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: "#A7465F" }}>Zmiany bez konta — nie liczą się do pracowników powyżej. Uzupełnij „Nazwę w grafiku" lub alias w module Pracownicy i kliknij „Przypisz zmiany do kont".</p>
                    <div className="flex flex-wrap gap-1.5">{bezKonta.map(([k, h]) => <span key={k} className="text-xs px-2 py-1 rounded-lg font-mono" style={{ backgroundColor: "white", color: "#A7465F" }}>{k} <span className="opacity-60">{fH1(h)}</span></span>)}</div>
                  </div>
                )}
              </>);
            })()}
          </Sekcja>
        )}

        {tab === "dane" && (<>
          {(() => { const sd = data.salesData || {}; const braki = sd.braki || []; const meta = sd.meta; return (
            <div className="rounded-xl p-3 mb-3 text-xs flex flex-wrap items-center gap-x-5 gap-y-1" style={{ backgroundColor: braki.length ? '#F1E4E8' : '#F1E4E8', color: braki.length ? '#A7465F' : '#741334' }}>
              <b>Jakość danych sprzedaży (P4):</b>
              {meta ? <span>import v{meta.wersja} · {new Date(meta.importedAt).toLocaleString('pl-PL')} · {meta.source} · {meta.importedBy}</span> : <span>brak zarejestrowanych importów</span>}
              {braki.length ? <span>braki w ostatnich 30 dniach: <b>{braki.length}</b> ({braki.slice(0, 5).join(', ')}{braki.length > 5 ? '…' : ''})</span> : <span>komplet danych za ostatnie 30 dni</span>}
            </div>
          ); })()}
          <Sekcja kolor={colors.primary.medium} tytul="Średnie wg dnia tygodnia">
            <div className="overflow-x-auto"><div className="min-w-[520px]">
              <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] gap-2 px-2 py-2 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}><span>Dzień</span><span className="text-right">Śr. sprzedaż</span><span className="text-right">Śr. grafik h</span><span className="text-right">Śr. silnik h</span><span className="text-right">Δ h</span></div>
              {R.byDow.map((b) => (<div key={b.dow} className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] gap-2 px-2 py-1.5 text-sm border-b" style={{ borderColor: "#EDE3E6" }}>
                <span style={{ color: colors.primary.dark }}>{D3[b.dow]}</span><span className="text-right">{f0(b.s)} zł</span><span className="text-right">{fH1(b.a)}</span><span className="text-right" style={{ color: OC.silnik }}>{fH1(b.e)}</span>
                <span className="text-right font-medium" style={{ color: b.e - b.a > 0 ? OC.warn : OC.ok }}>{(b.e - b.a) >= 0 ? "+" : ""}{(b.e - b.a).toFixed(1)}</span></div>))}
            </div></div>
          </Sekcja>
          <Sekcja kolor="#5A3542" tytul="Profil godzinowy sprzedaży (udział doby)">
            <div className="flex items-end gap-1 h-32">{Object.entries(ZLH).map(([h, v]) => (<div key={h} className="flex-1 flex flex-col items-center justify-end">
              <div className="w-full rounded-t" style={{ height: `${v / Math.max(...Object.values(ZLH)) * 100}%`, backgroundColor: PIK.includes(+h) ? OC.silnik : colors.primary.bg }} />
              <span className="text-[9px] mt-1" style={{ color: colors.primary.light }}>{h}</span></div>))}</div>
            <p className="text-xs text-slate-400 mt-2">Rozkład z historii micros — steruje podziałem dziennej sprzedaży na sloty. Docelowo: zasilany realnym eksportem godzinowym.</p>
          </Sekcja>
        </>)}

        {tab === "param" && (
          <div className="grid md:grid-cols-2 gap-4">
            <Sekcja kolor={OC.silnik} tytul="Parametry silnika">
              <div className="space-y-4">
                <OptSuw label="Docelowy SPLH" value={splh} min={280} max={600} step={10} unit="zł/rbh" onChange={setSplh} />
                <OptSuw label="Podłoga obsady (min. osób)" value={podloga} min={1} max={5} step={1} unit="os." onChange={setPodloga} />
                <OptSuw label="Limit godzin / miesiąc" value={limitMies} min={3000} max={6000} step={50} unit="h" onChange={setLimitMies} />
                <OptSuw label="Godziny MGR / doba" value={mgrDoba} min={16} max={48} step={1} unit="h" onChange={setMgrDoba} />
                <OptSuw label="Godziny szkoleniowe / m-c" value={szkol} min={0} max={400} step={2} unit="h" onChange={setSzkol} />
                <div><p className="text-xs font-medium mb-1" style={{ color: colors.primary.dark }}>Tryb zapotrzebowania</p>
                  <div className="flex gap-1">{[["silnik", "Ze sprzedaży (SPLH)"], ["krzywa", "Krzywa celu (KC)"]].map(([id, l]) => <button key={id} onClick={() => setTryb(id)} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: tryb === id ? OC.silnik : "white", color: tryb === id ? "white" : colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>{l}</button>)}</div></div>
              </div>
            </Sekcja>
            <Sekcja kolor={OC.obsada} tytul="Szablony zmian (włącz/wyłącz)">
              <div className="space-y-1">{SZAB.map((t) => (
                <label key={t.n} className="flex items-center gap-2 text-sm py-1 cursor-pointer">
                  <input type="checkbox" checked={!!wl[t.n]} onChange={(e) => setWl((p) => ({ ...p, [t.n]: e.target.checked }))} />
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: t.kol }} />
                  <span style={{ color: colors.primary.dark }}>{t.n}</span>
                  <span className="ml-auto text-xs text-slate-400">{t.do - t.od} h</span>
                </label>))}</div>
            </Sekcja>
          </div>
        )}
      </div>
    </div>
  );
};




// ===================== PULPIT WSKAŹNIKÓW (wykresy wzorowane na GIR/MAPAL) =====================
const PC = { bg: '#F5F4F0', card: '#FFFFFF', line: '#DEDCD5', ink: '#1C1E21', mute: '#8C8A83', accent: '#A7465F', cel: '#741334', plan: '#5A3542', dir: '#B5482F', ind: '#A7465F', bad: '#B94352', ok: '#5A3542' };
const DNI_PELNE = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela'];
const f1 = (v) => (v || 0).toFixed(1).replace('.', ',');
const hmL = (i) => String(Math.floor(((S0 * 60 + i * 30) % 1440) / 60)).padStart(2, '0');

/* 1. Ewolucja — wariancja narastająca, pole zielone nad zerem / czerwone pod */
function Ewolucja({ dni }) {
  const W = 720, H = 190, PL = 34, PB = 22, PT = 8;
  const plan = dni.reduce((a, x) => a + x.sprzedaz, 0) / 31;
  let cs = 0, cp = 0;
  const pts = dni.map((x, i) => {
    cs += x.sprzedaz; cp += plan;
    return { i, v: ((cs - cp) / cp) * 100, d: x.d };
  });
  const mx = Math.max(3, ...pts.map((p) => Math.abs(p.v))) * 1.15;
  const X = (i) => PL + (i * (W - PL - 8)) / 30;
  const Y = (v) => PT + ((H - PT - PB) / 2) * (1 - v / mx);
  const y0 = Y(0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560 }}>
      {[-mx, -mx / 2, 0, mx / 2, mx].map((v, i) => (<g key={i}>
        <line x1={PL} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? PC.mute : PC.line} />
        <text x={PL - 4} y={Y(v) + 3} textAnchor="end" fontSize="7.5" fill={PC.mute}>{v.toFixed(0)}%</text></g>))}
      {pts.slice(1).map((p, k) => {
        const a = pts[k], dodatnie = (a.v + p.v) / 2 >= 0;
        return <polygon key={k} points={`${X(a.i)},${y0} ${X(a.i)},${Y(a.v)} ${X(p.i)},${Y(p.v)} ${X(p.i)},${y0}`}
          fill={dodatnie ? PC.ok : PC.bad} opacity=".28" />;
      })}
      <polyline points={pts.map((p) => `${X(p.i)},${Y(p.v)}`).join(" ")} fill="none" stroke={PC.ink} strokeWidth="1.6" />
      {pts.map((p, i) => i % 5 === 0 || i === 30 ? (
        <g key={i}><circle cx={X(p.i)} cy={Y(p.v)} r="2.4" fill={p.v >= 0 ? PC.ok : PC.bad} />
          <text x={X(p.i)} y={H - 6} fontSize="7" textAnchor="middle" fill={PC.mute}>{p.d}</text></g>) : null)}
      <text x={W - 8} y={Y(pts[30].v) - 6} fontSize="9" textAnchor="end" fill={pts[30].v >= 0 ? PC.ok : PC.bad}>
        {pts[30].v >= 0 ? "+" : ""}{f1(pts[30].v)}%</text>
    </svg>
  );
}

/* 2. Zegar półkolisty */
function Zegar({ label, wartosc, max, kolor }) {
  const W = 160, H = 96, cx = 80, cy = 80, r = 58;
  const frac = Math.max(0, Math.min(1, wartosc / max));
  const pol = (a) => [cx + r * Math.cos(Math.PI * (1 - a)), cy - r * Math.sin(Math.PI * (1 - a))];
  const [x1, y1] = pol(0), [x2, y2] = pol(frac);
  const [bx, by] = pol(1);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 150 }}>
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${bx} ${by}`} fill="none" stroke={PC.line} strokeWidth="11" />
        <path d={`M ${x1} ${y1} A ${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x2} ${y2}`} fill="none" stroke={kolor} strokeWidth="11" strokeLinecap="round" />
        <text x={cx} y={cy - 12} textAnchor="middle" fontSize="20" fill={PC.ink} fontFamily="ui-monospace,monospace">{f1(wartosc)}</text>
        <text x={cx} y={cy + 2} textAnchor="middle" fontSize="8" fill={PC.mute}>godzin</text>
        <text x={12} y={cy + 10} fontSize="7" fill={PC.mute}>0</text>
        <text x={W - 12} y={cy + 10} fontSize="7" textAnchor="end" fill={PC.mute}>{max}</text>
      </svg>
      <div className="text-xs text-center" style={{ color: PC.mute }}>{label}</div>
    </div>
  );
}

/* 3. Rozbieżność — słupki rozchodzące się od zera */
function Rozbieznosc({ grupy, procent }) {
  const W = 700, rowH = 30, PL = 46, H = grupy.length * rowH + 22;
  const mx = Math.max(...grupy.map((g) => Math.max(procent ? g.pDef : g.def, procent ? g.pExc : g.exc))) * 1.1 || 1;
  const mid = PL + (W - PL - 16) / 2, half = (W - PL - 20) / 2;
  const sc = (v) => (v / mx) * half;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 540 }}>
      <line x1={mid} x2={mid} y1={0} y2={H - 16} stroke={PC.mute} strokeWidth=".8" />
      {grupy.map((g, i) => {
        const y = i * rowH + 6;
        const dDir = sc(procent ? g.pDir : g.dDir), dInd = sc(procent ? g.pInd : g.dInd), e = sc(procent ? g.pExc : g.exc);
        const jed = procent ? "%" : "h";
        return (<g key={i}>
          <text x={2} y={y + 13} fontSize="9" fill={PC.mute}>{g.nazwa}</text>
          <rect x={mid - dDir - dInd} y={y} width={dInd} height={17} fill={PC.ind} />
          <rect x={mid - dDir} y={y} width={dDir} height={17} fill={PC.dir} />
          <rect x={mid} y={y} width={e} height={17} fill={PC.plan} opacity=".8" />
          {dDir + dInd > 3 && <text x={mid - dDir - dInd - 4} y={y + 12} fontSize="8" textAnchor="end" fill={PC.bad}>
            −{f1(procent ? g.pDef : g.def)}{jed}</text>}
          {e > 3 && <text x={mid + e + 4} y={y + 12} fontSize="8" fill={PC.plan}>+{f1(procent ? g.pExc : g.exc)}{jed}</text>}
        </g>);
      })}
      <text x={PL} y={H - 3} fontSize="7.5" fill={PC.mute}>niedobór</text>
      <text x={W - 8} y={H - 3} fontSize="7.5" textAnchor="end" fill={PC.mute}>nadmiar</text>
    </svg>
  );
}

/* 4. Wykres śróddzienny — słupki pośrednia/bezpośrednia + linia obsady + nakładki */
function Sroddzienny({ D, nakladka }) {
  const W = 720, H = 210, PL = 26, PB = 20, PT = 8;
  const cw = (W - PL - 8) / NS;
  const mxY = Math.max(...D.dem, ...D.cover) + 1;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / mxY);
  const sprz = new Array(NS).fill(0);
  for (let h = 7; h <= 23; h++) { const v = ZLH[h] / 2; sprz[sl(h)] = v; sprz[sl(h) + 1] = v; }
  const trans = sprz.map((v) => v / 44.38);
  const nak = nakladka === "sprzedaz" ? sprz : nakladka === "transakcje" ? trans : null;
  const mxN = nak ? Math.max(...nak) * 1.15 : 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 620 }}>
      {[...Array(mxY + 1)].map((_, v) => v % 2 === 0 ? (<g key={v}>
        <line x1={PL} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke={PC.line} />
        <text x={PL - 4} y={Y(v) + 3} textAnchor="end" fontSize="7" fill={PC.mute}>{v}</text></g>) : null)}
      {D.dir.map((v, i) => v > 0 ? <rect key={`d${i}`} x={PL + i * cw + .5} y={Y(v)} width={cw - 1} height={Y(0) - Y(v)} fill={PC.dir} /> : null)}
      {D.ind.map((v, i) => v > 0 ? <rect key={`i${i}`} x={PL + i * cw + .5} y={Y(v)} width={cw - 1} height={Y(0) - Y(v)} fill={PC.ind} opacity=".95" /> : null)}
      <polyline points={D.cover.flatMap((v, i) => [`${PL + i * cw},${Y(v)}`, `${PL + (i + 1) * cw},${Y(v)}`]).join(" ")}
        fill="none" stroke={PC.plan} strokeWidth="1.8" />
      {D.cover.map((v, i) => i % 2 === 0 && v > 0 ? <circle key={i} cx={PL + i * cw + cw} cy={Y(v)} r="1.7" fill={PC.plan} /> : null)}
      {nak && <polyline points={nak.map((v, i) => `${PL + i * cw + cw / 2},${PT + (H - PT - PB) * (1 - v / mxN)}`).join(" ")}
        fill="none" stroke={PC.cel} strokeWidth="1.3" strokeDasharray="3 2" />}
      {[...Array(NS)].map((_, i) => i % 4 === 0 ? <text key={i} x={PL + i * cw} y={H - 6} fontSize="7" fill={PC.mute}>{hmL(i)}</text> : null)}
    </svg>
  );
}

/* 5. Ranking z linią średniej */
function Ranking({ dane, jednostka }) {
  const W = 700, H = 170, PL = 30, PB = 26, PT = 8;
  const mx = Math.max(...dane.map((d) => d.v)) * 1.1;
  const bw = (W - PL - 10) / dane.length;
  const sr = dane.reduce((a, d) => a + d.v, 0) / dane.length;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / mx);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
      {[0, mx / 2, mx].map((v, i) => (<g key={i}>
        <line x1={PL} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke={PC.line} />
        <text x={PL - 4} y={Y(v) + 3} textAnchor="end" fontSize="7" fill={PC.mute}>{f0(v)}</text></g>))}
      {dane.map((d, i) => (<g key={i}>
        <rect x={PL + i * bw + bw * .18} y={Y(d.v)} width={bw * .64} height={Y(0) - Y(d.v)}
          fill={d.v >= sr ? PC.plan : PC.mute} opacity={d.v >= sr ? .85 : .45} />
        <text x={PL + i * bw + bw / 2} y={Y(d.v) - 3} fontSize="7.5" textAnchor="middle" fill={PC.ink}>{f0(d.v)}</text>
        <text x={PL + i * bw + bw / 2} y={H - 12} fontSize="8" textAnchor="middle" fill={PC.mute}>{d.n}</text>
      </g>))}
      <line x1={PL} x2={W - 8} y1={Y(sr)} y2={Y(sr)} stroke={PC.bad} strokeWidth="1.4" strokeDasharray="4 3" />
      <text x={W - 10} y={Y(sr) - 4} fontSize="7.5" textAnchor="end" fill={PC.bad}>średnia {f0(sr)} {jednostka}</text>
    </svg>
  );
}

/* 6. Pierścień — struktura wg pory dnia */
function Piers({ czesci }) {
  const W = 320, H = 170, cx = 85, cy = 85, R = 62, r = 36;
  const tot = czesci.reduce((a, c) => a + c.v, 0);
  let kat = -Math.PI / 2;
  const luk = (a0, a1, rr) => [cx + rr * Math.cos(a0), cy + rr * Math.sin(a0), cx + rr * Math.cos(a1), cy + rr * Math.sin(a1)];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxWidth: 340 }}>
      {czesci.map((c, i) => {
        const a0 = kat, a1 = kat + (c.v / tot) * Math.PI * 2; kat = a1;
        const [x1, y1, x2, y2] = luk(a0, a1, R), [x3, y3, x4, y4] = luk(a1, a0, r);
        const big = a1 - a0 > Math.PI ? 1 : 0;
        const mid = (a0 + a1) / 2, lx = cx + (R + 10) * Math.cos(mid), ly = cy + (R + 10) * Math.sin(mid);
        return (<g key={i}>
          <path d={`M ${x1} ${y1} A ${R} ${R} 0 ${big} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${big} 0 ${x4} ${y4} Z`} fill={c.kol} />
          {c.v / tot > 0.06 && <text x={lx} y={ly} fontSize="7.5" textAnchor={Math.cos(mid) > 0 ? "start" : "end"} fill={PC.mute}>
            {Math.round(c.v / tot * 100)}%</text>}
        </g>);
      })}
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="11" fill={PC.ink} fontFamily="ui-monospace,monospace">100%</text>
      {czesci.map((c, i) => (<g key={i}>
        <rect x={190} y={30 + i * 20} width={9} height={9} rx="2" fill={c.kol} />
        <text x={204} y={38 + i * 20} fontSize="8.5" fill={PC.mute}>{c.n}</text>
      </g>))}
    </svg>
  );
}

/* 7. Słupki + linia procentowa (Horas Teóricas vs Pagadas) */
function SlupkiLinia({ dane }) {
  const W = 720, H = 190, PL = 30, PR = 34, PB = 24, PT = 10;
  const mx = Math.max(...dane.flatMap((d) => [d.a, d.b])) * 1.15;
  const bw = (W - PL - PR) / dane.length;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / mx);
  const YP = (p) => PT + (H - PT - PB) * (1 - (p - 60) / 80);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560 }}>
      {[0, mx / 2, mx].map((v, i) => (<g key={i}>
        <line x1={PL} x2={W - PR} y1={Y(v)} y2={Y(v)} stroke={PC.line} />
        <text x={PL - 4} y={Y(v) + 3} textAnchor="end" fontSize="7" fill={PC.mute}>{f0(v)}</text></g>))}
      {[80, 100, 120].map((p) => (
        <text key={p} x={W - PR + 4} y={YP(p) + 3} fontSize="7" fill={PC.cel}>{p}%</text>))}
      {dane.map((d, i) => (<g key={i}>
        <rect x={PL + i * bw + bw * .14} y={Y(d.a)} width={bw * .34} height={Y(0) - Y(d.a)} fill={PC.cel} opacity=".55" />
        <rect x={PL + i * bw + bw * .5} y={Y(d.b)} width={bw * .34} height={Y(0) - Y(d.b)} fill={PC.plan} opacity=".8" />
        <text x={PL + i * bw + bw / 2} y={H - 10} fontSize="8" textAnchor="middle" fill={PC.mute}>{d.n}</text>
      </g>))}
      <polyline points={dane.map((d, i) => `${PL + i * bw + bw / 2},${YP(d.b / d.a * 100)}`).join(" ")}
        fill="none" stroke={PC.bad} strokeWidth="1.6" />
      {dane.map((d, i) => <circle key={i} cx={PL + i * bw + bw / 2} cy={YP(d.b / d.a * 100)} r="2.4" fill={PC.bad} />)}
    </svg>
  );
}

/* 8. Histogram załogi wg przedziałów godzin */
function Histogram({ kubelki }) {
  const W = 700, H = 165, PL = 26, PB = 26, PT = 10;
  const mx = Math.max(...kubelki.map((k) => k.n)) * 1.2;
  const bw = (W - PL - 10) / kubelki.length;
  const Y = (v) => PT + (H - PT - PB) * (1 - v / mx);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480 }}>
      {[0, Math.round(mx / 2), Math.round(mx)].map((v, i) => (<g key={i}>
        <line x1={PL} x2={W - 8} y1={Y(v)} y2={Y(v)} stroke={PC.line} />
        <text x={PL - 4} y={Y(v) + 3} textAnchor="end" fontSize="7" fill={PC.mute}>{v}</text></g>))}
      {kubelki.map((k, i) => (<g key={i}>
        <rect x={PL + i * bw + bw * .2} y={Y(k.n)} width={bw * .6} height={Y(0) - Y(k.n)} fill={PC.plan} opacity=".75" />
        <text x={PL + i * bw + bw / 2} y={Y(k.n) - 3} fontSize="8" textAnchor="middle" fill={PC.ink}>{k.n}</text>
        <text x={PL + i * bw + bw / 2} y={H - 10} fontSize="7.5" textAnchor="middle" fill={PC.mute}>{k.l}</text>
      </g>))}
    </svg>
  );
}

/* =================================================================== */
function Karta({ tytul, podtytul, prawo, children }) {
  return (<div className="rounded-lg p-3 mt-2" style={{ background: PC.card, border: `1px solid ${PC.line}`, borderLeft: `3px solid ${PC.bad}` }}>
    <div className="flex flex-wrap items-baseline gap-2 mb-2">
      <span className="text-sm font-medium">{tytul}</span>
      {podtytul && <span className="text-xs" style={{ color: PC.mute }}>{podtytul}</span>}
      {prawo && <span className="ml-auto text-xs">{prawo}</span>}
    </div>
    {children}
  </div>);
}


// ===================== PLAN BUDŻETU (kalkulator COL) =====================
const BP_POZ = ['RGM', 'ASM', 'SM', 'JSM', 'CREW'];
const BP_NORMY = [160, 160, 176, 168, 160, 168, 184, 160, 176, 176, 160, 160];
const bpMgr = (p) => p !== 'CREW';
const bpKat = (e) => (e.pozycja === 'RGM' || e.pozycja === 'ASM') ? 'kier' : (e.pozycja === 'SM' || e.pozycja === 'JSM') ? 'mgr' : (e.instruktor ? 'instr' : 'prac');
const BP_KAT = { prac: { label: 'Pracownicy', color: '#5A3542' }, instr: { label: 'Instruktorzy', color: '#B86D82' }, mgr: { label: 'Mgr (SM/JSM)', color: '#5A3542' }, kier: { label: 'Kierownictwo (RGM/ASM)', color: '#2B171E' } };
const zl = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bpDefSettings = { zusRate: 0.1948, zusPPK: 0.2098, nocnyBonus: 0.2, minWage: 4806, normy: [...BP_NORMY] };

const bpKoszt = (e, nom, s) => {
  if (e.umowa === 'UZ') {
    const base = (e.stawka || 0) * (e.godziny || 0);
    const bhp = (e.godziny || 0) * (e.pozycja === 'RGM' ? 1.5 : 2);
    const premia = e.premia || 0;
    const zus = e.zusUZ ? base * s.zusRate : 0;
    return { base, ppk: 0, bhp, urlop: 0, nocne: 0, chorobowe: 0, premia, zus, pfron: 0, total: base + bhp + premia + zus, worked: e.godziny || 0 };
  }
  const worked = Math.max(0, (e.godziny || 0) - (e.urlopH || 0) - (e.dniZLA || 0) * 8);
  const base = (e.stawka || 0) * worked / nom;
  const ppk = e.ppk ? (e.stawka || 0) * 0.015 : 0;
  const bhp = e.bhp || 0;
  const urlop = (e.urlopH || 0) * ((e.stawka || 0) / nom) * 1.05;
  const nocne = (e.nocneH || 0) * (s.minWage / nom) * s.nocnyBonus;
  const zlaRate = (e.stawka || 0) * (1 - 0.1371);
  const chorobowe = (e.dniZLA || 0) ? (zlaRate / 30) * (e.dniZLA || 0) * 0.8 : 0;
  const premia = e.premia || 0;
  const zus = (base + premia + urlop + nocne) * (e.ppk ? s.zusPPK : s.zusRate);
  const pfron = e.pfron || 0;
  return { base, ppk, bhp, urlop, nocne, chorobowe, premia, zus, pfron, total: base + ppk + bhp + premia + urlop + nocne + chorobowe + zus + pfron, worked };
};

const BPLine = ({ series, labels, height = 200, unit = '' }) => {
  const vals = series.flatMap((s) => s.data);
  const max = Math.max(1, ...vals);
  const W = 680, H = height, P = { l: 42, r: 12, t: 12, b: 26 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const n = labels.length || 1;
  const X = (i) => P.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const Y = (v) => P.t + ih - (v / max) * ih;
  const step = Math.max(1, Math.ceil(n / 12));
  return (
    <div>
      <div className="flex gap-4 mb-1">{series.map((s, i) => <span key={i} className="flex items-center gap-1 text-[11px]" style={{ color: colors.primary.dark }}><span className="w-3 h-2 rounded" style={{ backgroundColor: s.color }} />{s.name}</span>)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {Array.from({ length: 5 }).map((_, t) => { const v = max * t / 4; const y = Y(v); return (<g key={t}><line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#EDE3E6" /><text x={P.l - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#A38D95">{Math.round(v)}{unit}</text></g>); })}
        {labels.map((l, i) => (i % step === 0) ? <text key={i} x={X(i)} y={H - 9} textAnchor="middle" fontSize="9" fill="#A38D95">{l}</text> : null)}
        {series.map((s, si) => (<g key={si}>{s.fill && <polygon fill={s.color} fillOpacity="0.08" points={`${X(0)},${Y(0)} ` + s.data.map((v, i) => `${X(i)},${Y(v)}`).join(' ') + ` ${X(n - 1)},${Y(0)}`} />}<polyline fill="none" stroke={s.color} strokeWidth="2" points={s.data.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} /></g>))}
      </svg>
    </div>
  );
};
const BPBars = ({ items, unit = 'zł' }) => {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (<div className="space-y-2">{items.map((it, i) => (<div key={i}><div className="flex justify-between text-xs mb-0.5"><span style={{ color: colors.primary.dark }}>{it.label} <span className="text-slate-400">· {it.n} os.</span></span><b style={{ color: colors.primary.darkest }}>{zl(it.value)} {unit}</b></div><div className="h-3 rounded" style={{ backgroundColor: colors.primary.bgLight }}><div className="h-3 rounded" style={{ width: `${it.value / max * 100}%`, backgroundColor: it.color }} /></div></div>))}</div>);
};

const BP_KOSZT_DOMYSLNE = { godziny: 160, premia: 0, bhp: 0, urlopH: 0, dniZLA: 0, nocneH: 0, ppk: false, pfron: 0, godzBy: {} };

const BudgetPlan = ({ data, setPage }) => {
  const b = data.budget;
  const [tab, setTab] = useState('budzet');
  const [koszParam, setKoszParam] = useState({});      // parametry kosztowe per id konta
  const [settings, setSettings] = useState(bpDefSettings);
  const [mIdx, setMIdx] = useState(new Date().getMonth());
  const [sprzedaz, setSprzedaz] = useState({});
  const [transakcje, setTransakcje] = useState({});
  const [dniS, setDniS] = useState({});
  const [openRow, setOpenRow] = useState(null);
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !b) return;
    setKoszParam(b.koszParam || {});
    if (b.settings) setSettings(b.settings);
    setSprzedaz(b.sprzedaz || {}); setTransakcje(b.transakcje || {}); setDniS(b.dniS || {});
    hydrated.current = true;
  }, [b]);
  useEffect(() => { if (!hydrated.current) return; data.saveBudget({ koszParam, settings, sprzedaz, transakcje, dniS }); }, [koszParam, settings, sprzedaz, transakcje, dniS]);

  // Pracownicy pochodzą z modułu „Pracownicy" (konta). Tutaj dokładamy tylko parametry kosztowe.
  const emps = useMemo(() => (data.accounts || []).map((a) => ({
    ...BP_KOSZT_DOMYSLNE, ...(koszParam[a.id] || {}),
    id: a.id, name: a.name, grafikName: a.grafikName, aliasy: a.aliasy || [], pozycja: a.funkcja, umowa: a.umowa, stawka: a.stawka,
    zusUZ: !!a.zus, instruktor: !!a.instruktor,
  })), [data.accounts, koszParam]);

  const nom = settings.normy[mIdx] || 160;
  const rokBud = useMemo(() => { const ys = data.shifts.map((x) => +String(x.date).slice(0, 4)).filter(Boolean); return ys.length ? Math.max(...ys) : new Date().getFullYear(); }, [data.shifts]);
  const mPre = `${rokBud}-${String(mIdx + 1).padStart(2, '0')}`;

  // Godziny FAKTYCZNE — z grafiku danego miesiąca (bez wierszy instruktorskich, zgodnie z regułą liczenia)
  // Godziny z grafiku — po IDENTYFIKATORZE KONTA (przypisanym przy imporcie), z zapasowym dopasowaniem po nazwie
  const godzGrafik = useMemo(() => {
    const m = { poId: {}, poNazwie: {} };
    data.shifts.filter((x) => String(x.date || '').startsWith(mPre) && !jestInstruktor(x)).forEach((x) => {
      if (x.accountId) m.poId[x.accountId] = (m.poId[x.accountId] || 0) + godzZ(x);
      else { const k = String(x.name || '').toUpperCase().trim(); m.poNazwie[k] = (m.poNazwie[k] || 0) + godzZ(x); }
    });
    return m;
  }, [data.shifts, mPre]);
  const grafikJest = Object.keys(godzGrafik.poId).length > 0 || Object.keys(godzGrafik.poNazwie).length > 0;
  const kluczeOsoby = (e) => [e.grafikName || String(e.name || '').trim().split(/\s+/).pop(), ...(e.aliasy || [])].filter(Boolean).map((x) => String(x).toUpperCase().trim());
  const godzAktOf = (e) => (godzGrafik.poId[e.id] || 0) + kluczeOsoby(e).reduce((a, k) => a + (godzGrafik.poNazwie[k] || 0), 0);
  // Godziny PLANOWANE — ręcznie ustawione w budżecie; bez ustawienia startują od grafiku (a gdy brak grafiku — od normy)
  const getGodz = (e) => (e.godzBy && e.godzBy[mIdx] != null) ? e.godzBy[mIdx] : (grafikJest ? godzAktOf(e) : (e.godziny || 0));

  const koszty = emps.map((e) => ({ e, k: bpKoszt({ ...e, godziny: getGodz(e) }, nom, settings) }));
  const kosztyAkt = emps.map((e) => ({ e, k: bpKoszt({ ...e, godziny: godzAktOf(e) }, nom, settings) }));
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const col = sum(koszty, (x) => x.k.total);
  const godzTotal = sum(koszty, (x) => x.k.worked);
  const colAkt = sum(kosztyAkt, (x) => x.k.total);
  const godzAktTotal = sum(kosztyAkt, (x) => x.k.worked);
  const sale = sprzedaz[mIdx] || 0, tr = transakcje[mIdx] || 0, dni = dniS[mIdx] || 0;
  const colPct = sale ? col / sale : 0;
  const agc = tr ? sale / tr : 0, splh = godzTotal ? sale / godzTotal : 0, mpt = tr ? godzTotal * 60 / tr : 0;
  const linia = (f) => sum(koszty, (x) => f(x.k));
  const kats = ['prac', 'instr', 'mgr', 'kier'].map((key) => { const g = koszty.filter((x) => bpKat(x.e) === key); return { key, label: BP_KAT[key].label, color: BP_KAT[key].color, value: sum(g, (x) => x.k.total), n: g.length }; });

  const setE = (id, patch) => setKoszParam((p) => ({ ...p, [id]: { ...BP_KOSZT_DOMYSLNE, ...(p[id] || {}), ...patch } }));
  const setGodz = (e, v) => setE(e.id, { godzBy: { ...(e.godzBy || {}), [mIdx]: Number(v) || 0 } });
  const setNorma = (i, v) => setSettings((s) => { const n = [...s.normy]; n[i] = Number(v) || 0; return { ...s, normy: n }; });

  const year = useMemo(() => { const ys = data.shifts.map((s) => +s.date.slice(0, 4)).filter(Boolean); return ys.length ? Math.max(...ys) : new Date().getFullYear(); }, [data.shifts]);
  const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
  const planDaily = Array.from({ length: daysInMonth }, (_, i) => { const ds = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`; return data.shifts.filter((s) => s.date === ds && !jestInstruktor(s)).reduce((a, s) => a + godzZ(s), 0); });
  // P0-2 (audyt P4): wykonanie WYŁĄCZNIE z realnych danych ts:data (odbicia/korekty);
  // dzień bez wykonania = 0 — żadnych wartości syntetycznych z planu.
  const actualDaily = Array.from({ length: daysInMonth }, (_, i) => {
    const ds = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
    let min = 0;
    data.shifts.filter((x) => x.date === ds && !jestInstruktor(x)).forEach((x) => {
      const a = wtAct(((data.ts || {}).actuals) || {}, x);
      if (!a) return;
      const przerwy = (a.breaks || []).filter((b) => b.platna === false).reduce((acc, b) => acc + wtDur(b.start != null ? b.start : b.od, b.end != null ? b.end : b.do), 0);
      min += Math.max(wtDur(a.start, a.end) - przerwy, 0);
    });
    return +(min / 60).toFixed(1);
  });
  const avgHourly = godzTotal ? col / godzTotal : 0;
  const colDaily = planDaily.map((h) => +(h * avgHourly).toFixed(0));
  const dayLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));

  // ── Wskaźniki w stylu GIRnet Workforce ──
  const mKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;
  const sprzedazMies = (y, m) => { const sd = (data.salesData && data.salesData.sales) || {}; const pre = mKey(y, m); return Object.entries(sd).filter(([d]) => d.startsWith(pre)).reduce((a, [, v]) => a + v, 0); };
  const godzinyMies = (y, m) => { const pre = mKey(y, m); return data.shifts.filter((x) => (x.date || '').startsWith(pre) && !jestInstruktor(x)).reduce((a, x) => a + godzZ(x), 0); };
  const poprz = mIdx === 0 ? { y: year - 1, m: 11 } : { y: year, m: mIdx - 1 };
  const sBiez = sprzedazMies(year, mIdx), sPoprz = sprzedazMies(poprz.y, poprz.m);
  const hBiez = godzinyMies(year, mIdx), hPoprz = godzinyMies(poprz.y, poprz.m);
  const splhBiez = hBiez ? sBiez / hBiez : 0, splhPoprz = hPoprz ? sPoprz / hPoprz : 0;
  const varPct = splhPoprz ? ((splhBiez - splhPoprz) / splhPoprz) * 100 : 0;

  // godziny kontraktowe: stałe (UOP) vs zmienne (UZ)
  const hStale = koszty.filter((x) => x.e.umowa === 'UOP').reduce((a, x) => a + x.k.worked, 0);
  const hZmienne = koszty.filter((x) => x.e.umowa === 'UZ').reduce((a, x) => a + x.k.worked, 0);
  const hRazem = hStale + hZmienne;

  // zgodność kontraktowa: teoretyczne vs zaplanowane + nadmiar/niedobór
  const teorII = (e) => e.umowa === 'UOP' ? Math.max(0, nom - (e.urlopH || 0) - (e.dniZLA || 0) * 8) : getGodz(e);
  const zgodnosc = emps.map((e) => { const teor = teorII(e); const plan = getGodz(e); const d = plan - teor; return { name: e.name, umowa: e.umowa, teor, plan, nadmiar: Math.max(0, d), niedobor: Math.max(0, -d) }; });
  const sumNadmiar = zgodnosc.reduce((a, x) => a + x.nadmiar, 0);
  const sumNiedobor = zgodnosc.reduce((a, x) => a + x.niedobor, 0);

  // absencja (urlop + ZLA) w godzinach
  const hUrlop = emps.reduce((a, e) => a + (e.urlopH || 0), 0);
  const hZLA = emps.reduce((a, e) => a + (e.dniZLA || 0) * 8, 0);
  const absPct = hRazem + hUrlop + hZLA ? ((hUrlop + hZLA) / (hRazem + hUrlop + hZLA)) * 100 : 0;

  const Stat = ({ v, l, sub, dark }) => (<div className="rounded-xl p-3 text-center shadow-sm border" style={{ backgroundColor: dark ? colors.primary.darkest : 'white', borderColor: colors.primary.bg }}><p className="text-xl font-bold" style={{ color: dark ? 'white' : colors.primary.darkest }}>{v}</p><p className="text-[11px]" style={{ color: dark ? 'rgba(255,255,255,.7)' : colors.primary.light }}>{l}</p>{sub && <p className="text-[10px]" style={{ color: dark ? 'rgba(255,255,255,.5)' : '#A38D95' }}>{sub}</p>}</div>);
  // Kafelek z podwójną wartością: u góry faktyczne (z grafiku), pod spodem planowane (z budżetu)
  const Dwa = ({ akt, plan, label, kolor }) => {
    const roz = (parseFloat(String(akt).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0) - (parseFloat(String(plan).replace(/[^\d,.-]/g, '').replace(',', '.')) || 0);
    return (
      <div className="rounded-xl p-3 shadow-sm border" style={{ backgroundColor: kolor || 'white', borderColor: colors.primary.bg }}>
        <p className="text-[11px] mb-1" style={{ color: kolor ? 'rgba(255,255,255,.75)' : colors.primary.light }}>{label}</p>
        <p className="text-xl font-bold leading-tight" style={{ color: kolor ? 'white' : colors.primary.darkest }}>{akt} <span className="text-[10px] font-medium opacity-70">aktualne</span></p>
        <p className="text-sm font-semibold leading-tight mt-0.5" style={{ color: kolor ? 'rgba(255,255,255,.85)' : colors.primary.light }}>{plan} <span className="text-[10px] font-medium opacity-70">planowane</span></p>
      </div>
    );
  };
  const numIn = (val, on, w = 'w-full') => <input type="number" value={val} onChange={(e) => on(e.target.value)} className={`${w} px-2 py-1 rounded border text-sm`} style={{ borderColor: colors.primary.bg }} />;
  const Fld = ({ label, children }) => (<div><label className="block text-[11px] mb-0.5" style={{ color: colors.primary.light }}>{label}</label>{children}</div>);

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Plan budżetu" subtitle="Kalkulator COL — pracownicy, składki ZUS, koszty, budżet i analityka miesiąca">
        <span className="text-xs font-medium" style={{ color: colors.primary.light }}>Miesiąc</span>
        <select value={mIdx} onChange={(e) => setMIdx(Number(e.target.value))} className="px-3 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: colors.primary.bg, color: colors.primary.darkest }}>{months.map((m, i) => <option key={i} value={i}>{m} · norma {settings.normy[i]}h</option>)}</select>
      </Header>
      <div className="flex-1 p-8 space-y-5 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: 'white' }}>
          {[['budzet', 'Budżet miesiąca'], ['prac', 'Pracownicy'], ['analiza', 'Analityka'], ['ust', 'Ustawienia ZUS']].map(([id, l]) => (
            <button key={id} onClick={() => setTab(id)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: tab === id ? colors.primary.medium : 'transparent', color: tab === id ? 'white' : colors.primary.dark }}>{l}</button>
          ))}
        </div>

        {tab === 'budzet' && (<>
          <div className="flex flex-wrap items-end gap-3 bg-white rounded-xl p-4 shadow-sm border" style={{ borderColor: colors.primary.bg }}>
            <Fld label="Sprzedaż (zł)">{numIn(sale, (v) => setSprzedaz((p) => ({ ...p, [mIdx]: Number(v) || 0 })), 'w-36')}</Fld>
            <Fld label="Transakcje">{numIn(tr, (v) => setTransakcje((p) => ({ ...p, [mIdx]: Number(v) || 0 })), 'w-28')}</Fld>
            <Fld label="Dni sprzedaży">{numIn(dni, (v) => setDniS((p) => ({ ...p, [mIdx]: Number(v) || 0 })), 'w-24')}</Fld>
            <span className="text-xs text-slate-400 ml-auto self-center">Wskaźniki dla: <b style={{ color: colors.primary.dark }}>{months[mIdx]}</b></span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Dwa label="COL — koszt pracy (total)" akt={`${zl(colAkt)} zł`} plan={`${zl(col)} zł`} kolor={colors.primary.darkest} />
            <Dwa label="COL % (koszt / sprzedaż)" akt={`${(sale ? colAkt / sale * 100 : 0).toFixed(2)}%`} plan={`${(colPct * 100).toFixed(2)}%`} kolor={(sale ? colAkt / sale : 0) > 0.2 ? '#B94352' : '#741334'} />
            <Dwa label="Godziny total" akt={`${godzAktTotal.toFixed(0)} h`} plan={`${godzTotal.toFixed(0)} h`} />
            <Dwa label="Godziny na dzień" akt={`${dni ? (godzAktTotal / dni).toFixed(1) : 0} h`} plan={`${dni ? (godzTotal / dni).toFixed(1) : 0} h`} />
          </div>
          <p className="text-xs text-slate-400 -mt-2">„Aktualne" = godziny z grafiku {months[mIdx]} {rokBud}{grafikJest ? '' : ' (brak grafiku dla tego miesiąca)'}. „Planowane" = wartości ustawione w zakładce Pracownicy.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat v={zl(agc)} l="AGC" sub="sprzedaż / transakcje" />
            <Stat v={zl(splh)} l="SPLH" sub="sprzedaż / godziny" />
            <Stat v={mpt.toFixed(2)} l="MPT (min)" sub="godziny×60 / transakcje" />
            <Stat v={`${nom} h`} l="Etat (norma m-ca)" />
          </div>
          <Sekcja kolor="#2B171E" tytul="COL wg kategorii"><BPBars items={kats.map((k) => ({ label: k.label, value: k.value, n: k.n, color: k.color }))} /></Sekcja>
          <Sekcja kolor="#5A3542" tytul="Podgląd kosztów (rozbicie P&amp;L)">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {[['Płace podstawowe', linia((k) => k.base)], ['Premie', linia((k) => k.premia)], ['Nadgodziny/nocne', linia((k) => k.nocne)], ['Wynagr. urlopowe', linia((k) => k.urlop)], ['Wynagr. chorobowe', linia((k) => k.chorobowe)], ['Ekwiwalent BHP', linia((k) => k.bhp)], ['Koszt PPK', linia((k) => k.ppk)], ['ZUS pracodawcy', linia((k) => k.zus)], ['PFRON', linia((k) => k.pfron)]].map(([l, v]) => (
                <div key={l} className="flex justify-between rounded-lg px-3 py-2" style={{ backgroundColor: colors.primary.bgLight }}><span style={{ color: colors.primary.dark }}>{l}</span><b style={{ color: colors.primary.darkest }}>{zl(v)}</b></div>
              ))}
            </div>
          </Sekcja>
        </>)}

        {tab === 'prac' && (<>
          <div className="bg-white rounded-xl p-3 shadow-sm border text-xs flex flex-wrap gap-x-5 gap-y-1" style={{ borderColor: colors.primary.bg }}>
            <span style={{ color: colors.primary.light }}>Legenda:</span><span><b>Stawka</b> — UOP: mies.; UZ: zł/h</span><span><b>Godziny</b> — w {months[mIdx]}</span><span><b>ZLA</b> — dni zwolnienia</span><span><b>PPK</b> — w PPK</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BP_KAT.prac.color }} />Prac.</span><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BP_KAT.instr.color }} />Instr.</span><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BP_KAT.mgr.color }} />Mgr</span><span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: BP_KAT.kier.color }} />Kier.</span>
          </div>
          <div className="space-y-2">
            {koszty.map(({ e, k }) => { const open = openRow === e.id; const kat = bpKat(e); return (
              <div key={e.id} className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: colors.primary.bg }}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: BP_KAT[kat].color }} title={BP_KAT[kat].label} />
                  <div className="flex-1 min-w-0"><p className="font-semibold text-sm truncate" style={{ color: colors.primary.darkest }}>{e.name}</p><p className="text-[11px]" style={{ color: colors.primary.light }}>{e.pozycja} · {e.umowa} · grafik {godzAktOf(e).toFixed(0)} h / plan {Number(getGodz(e)).toFixed(0)} h{e.instruktor ? ' · instruktor' : ''}</p></div>
                  <div className="text-right shrink-0"><p className="text-[10px]" style={{ color: colors.primary.light }}>Koszt {months[mIdx]}</p><p className="font-bold" style={{ color: colors.primary.darkest }}>{zl(bpKoszt({ ...e, godziny: godzAktOf(e) }, nom, settings).total)} zł</p><p className="text-[10px]" style={{ color: colors.primary.light }}>plan {zl(k.total)} zł</p></div>
                  <button onClick={() => setOpenRow(open ? null : e.id)} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 shrink-0" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Szczegóły <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} /></button>

                </div>
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: colors.primary.bg, backgroundColor: '#fbfcfe' }}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                      <Fld label="Stanowisko"><div className="px-2 py-1 rounded text-sm" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{e.pozycja}{e.instruktor ? ' · instruktor' : ''}</div></Fld>
                      <Fld label="Typ umowy"><div className="px-2 py-1 rounded text-sm" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{e.umowa}</div></Fld>
                      <Fld label={e.umowa === 'UOP' ? 'Wynagr. mies. (zł)' : 'Stawka (zł/h)'}><div className="px-2 py-1 rounded text-sm" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{zl(e.stawka)}</div></Fld>
                      <Fld label={`Godziny (${months[mIdx]})`}>{numIn(getGodz(e), (v) => setGodz(e, v))}</Fld>
                      <Fld label="Premia (zł)">{numIn(e.premia, (v) => setE(e.id, { premia: Number(v) || 0 }))}</Fld>
                      {e.umowa === 'UOP' && <Fld label="Ekwiwalent BHP (zł)">{numIn(e.bhp, (v) => setE(e.id, { bhp: Number(v) || 0 }))}</Fld>}
                      {e.umowa === 'UOP' && <Fld label="Godziny urlopu">{numIn(e.urlopH, (v) => setE(e.id, { urlopH: Number(v) || 0 }))}</Fld>}
                      {e.umowa === 'UOP' && <Fld label="Dni ZLA (chorobowe)">{numIn(e.dniZLA, (v) => setE(e.id, { dniZLA: Number(v) || 0 }))}</Fld>}
                      {e.umowa === 'UOP' && <Fld label="Godziny nocne">{numIn(e.nocneH, (v) => setE(e.id, { nocneH: Number(v) || 0 }))}</Fld>}
                      {e.umowa === 'UOP' && <Fld label="PFRON (zł)">{numIn(e.pfron, (v) => setE(e.id, { pfron: Number(v) || 0 }))}</Fld>}
                    </div>
                    <div className="flex flex-wrap gap-4 mt-3">
                      {e.umowa === 'UOP' && <label className="flex items-center gap-2 text-sm" style={{ color: colors.primary.dark }}><input type="checkbox" checked={e.ppk} onChange={(ev) => setE(e.id, { ppk: ev.target.checked })} />PPK (+1,5%, ZUS 20,98%)</label>}
                      {e.umowa === 'UZ' && <span className="text-sm" style={{ color: colors.primary.light }}>ZUS od zlecenia: <b style={{ color: colors.primary.dark }}>{e.zusUZ ? 'tak' : 'nie'}</b> <span className="text-xs">(ustawiane w module Pracownicy)</span></span>}
                    </div>
                    <div className="mt-3 rounded-lg p-3" style={{ backgroundColor: colors.primary.bgLight }}>
                      <p className="text-[11px] font-semibold uppercase mb-2" style={{ color: colors.primary.light }}>Rozbicie kosztu pracodawcy</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-sm">
                        {[['Płaca podstawowa', k.base], ['Premia', k.premia], ['Wynagr. urlopowe', k.urlop], ['Dodatek nocny', k.nocne], ['Wynagr. chorobowe', k.chorobowe], ['Ekwiwalent BHP', k.bhp], ['Koszt PPK', k.ppk], ['ZUS pracodawcy', k.zus], ['PFRON', k.pfron]].filter(([, v]) => v).map(([l, v]) => <div key={l} className="flex justify-between"><span style={{ color: colors.primary.dark }}>{l}</span><span style={{ color: colors.primary.darkest }}>{zl(v)}</span></div>)}
                        <div className="flex justify-between col-span-2 md:col-span-3 border-t pt-1 mt-1" style={{ borderColor: colors.primary.bg }}><b style={{ color: colors.primary.darkest }}>Koszt całkowity</b><b style={{ color: colors.primary.darkest }}>{zl(k.total)} zł</b></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ); })}
          </div>
          {emps.length === 0 && <div className="bg-white rounded-xl p-6 text-center border" style={{ borderColor: colors.primary.bg }}><p className="text-slate-500 mb-3">Brak pracowników. Konta zakładasz w module „Pracownicy" — trafiają tu automatycznie.</p><Btn variant="secondary" onClick={() => setPage && setPage('emps')}>Przejdź do modułu Pracownicy</Btn></div>}
          <div className="flex items-center gap-3"><Btn variant="secondary" onClick={() => setPage && setPage('emps')}>Zarządzaj pracownikami</Btn><Btn variant="secondary" onClick={() => setPage && setPage('forecast')}>Optymalizacja i prognoza</Btn><span className="text-xs text-slate-400">Imię, stanowisko, umowa, stawka i ZUS pochodzą z modułu Pracownicy. Tutaj ustawiasz tylko dane kosztowe (godziny, premia, BHP, urlop, ZLA, nocne, PPK, PFRON).</span></div>
        </>)}

        {tab === 'analiza' && (<>
          <p className="text-sm" style={{ color: colors.primary.light }}>Analityka dla: <b style={{ color: colors.primary.dark }}>{months[mIdx]} {year}</b> — dane dzienne z grafiku.</p>
          <Sekcja kolor={colors.primary.medium} tytul="Grafik: godziny plan vs wykonanie z odbić (dni miesiąca)"><BPLine labels={dayLabels} unit="h" series={[{ name: 'Plan', color: colors.primary.bg, data: planDaily, fill: true }, { name: 'Wykonanie', color: colors.primary.medium, data: actualDaily }]} /></Sekcja>
          <Sekcja kolor="#2B171E" tytul="Cost of Labour — dzienny koszt pracy (plan)"><BPLine labels={dayLabels} unit="" series={[{ name: 'Koszt dzienny (zł)', color: '#2B171E', data: colDaily, fill: true }]} /><p className="text-xs text-slate-400 mt-2">Szacunek: godziny planowane danego dnia × średni koszt godziny ({zl(avgHourly)} zł/h).</p></Sekcja>
          <Sekcja kolor="#5A3542" tytul="Cost of Labour — udział kategorii"><BPBars items={kats.map((k) => ({ label: k.label, value: k.value, n: k.n, color: k.color }))} /></Sekcja>

          <Sekcja kolor="#5A3542" tytul="Produktywność (SPLH) — okres vs poprzedni">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat v={`${f0(splhBiez)}`} l={`SPLH — ${months[mIdx]}`} sub={`${f0(sBiez)} zł / ${f0(hBiez)} h`} />
              <Stat v={`${f0(splhPoprz)}`} l={`SPLH — ${months[poprz.m]}`} sub={`${f0(sPoprz)} zł / ${f0(hPoprz)} h`} />
              <div className="rounded-xl p-3 text-center shadow-sm" style={{ backgroundColor: varPct >= 0 ? '#5A3542' : '#B94352' }}><p className="text-xl font-bold text-white">{varPct >= 0 ? '+' : ''}{varPct.toFixed(1).replace('.', ',')}%</p><p className="text-[11px] text-white/80">Zmiana r/r okresu</p></div>
              <Stat v={`${f0(hRazem ? sBiez / hRazem : 0)}`} l="SPLH wg planu budżetu" sub={`${f0(hRazem)} h w planie`} />
            </div>
            {!sBiez && <p className="text-xs text-slate-400 mt-2">Brak danych sprzedaży dla tego miesiąca — zaimportuj raport w module Optymalizacja.</p>}
          </Sekcja>

          <Sekcja kolor="#5A3542" tytul="Godziny kontraktowe — stałe vs zmienne">
            <BPBars unit="h" items={[
              { label: 'Stałe (UOP)', value: hStale, n: koszty.filter((x) => x.e.umowa === 'UOP').length, color: '#5A3542' },
              { label: 'Zmienne (UZ)', value: hZmienne, n: koszty.filter((x) => x.e.umowa === 'UZ').length, color: '#A7465F' },
            ]} />
            <p className="text-xs text-slate-400 mt-2">Udział godzin stałych: <b style={{ color: colors.primary.dark }}>{hRazem ? (hStale / hRazem * 100).toFixed(1).replace('.', ',') : 0}%</b> — wyższy udział to mniejsza elastyczność obsady, ale i niższy koszt krańcowy godziny.</p>
          </Sekcja>

          <Sekcja kolor="#A7465F" tytul="Zgodność kontraktowa — godziny teoretyczne vs zaplanowane">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Stat v={`${f0(zgodnosc.reduce((a, x) => a + x.teor, 0))} h`} l="Teoretyczne (z umów)" />
              <div className="rounded-xl p-3 text-center shadow-sm border" style={{ borderColor: colors.primary.bg }}><p className="text-xl font-bold" style={{ color: '#A7465F' }}>{f0(sumNadmiar)} h</p><p className="text-[11px]" style={{ color: colors.primary.light }}>Nadmiar (Exceso)</p></div>
              <div className="rounded-xl p-3 text-center shadow-sm border" style={{ borderColor: colors.primary.bg }}><p className="text-xl font-bold" style={{ color: '#B94352' }}>{f0(sumNiedobor)} h</p><p className="text-[11px]" style={{ color: colors.primary.light }}>Niedobór (Defecto)</p></div>
            </div>
            <div className="overflow-x-auto"><div className="min-w-[560px]">
              <div className="grid grid-cols-[1.6fr_70px_1fr_1fr_1fr_1fr] gap-2 px-2 py-1.5 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}><span>Pracownik</span><span>Umowa</span><span className="text-right">Teoret.</span><span className="text-right">Plan</span><span className="text-right">Nadmiar</span><span className="text-right">Niedobór</span></div>
              {zgodnosc.map((z, i) => (
                <div key={i} className="grid grid-cols-[1.6fr_70px_1fr_1fr_1fr_1fr] gap-2 px-2 py-1.5 text-sm border-b" style={{ borderColor: '#EDE3E6' }}>
                  <span className="truncate" style={{ color: colors.primary.dark }}>{z.name}</span>
                  <span className="text-xs" style={{ color: colors.primary.light }}>{z.umowa}</span>
                  <span className="text-right">{z.teor.toFixed(0)}</span>
                  <span className="text-right">{z.plan.toFixed(0)}</span>
                  <span className="text-right font-medium" style={{ color: z.nadmiar ? '#A7465F' : '#C7B4BB' }}>{z.nadmiar ? z.nadmiar.toFixed(0) : '—'}</span>
                  <span className="text-right font-medium" style={{ color: z.niedobor ? '#B94352' : '#C7B4BB' }}>{z.niedobor ? z.niedobor.toFixed(0) : '—'}</span>
                </div>
              ))}
            </div></div>
          </Sekcja>

          <Sekcja kolor="#5A3542" tytul="Absencja">
            <div className="grid grid-cols-3 gap-3">
              <Stat v={`${f0(hUrlop)} h`} l="Urlopy" />
              <Stat v={`${f0(hZLA)} h`} l="Chorobowe (ZLA)" sub={`${emps.reduce((a, e) => a + (e.dniZLA || 0), 0)} dni`} />
              <div className="rounded-xl p-3 text-center shadow-sm" style={{ backgroundColor: absPct > 8 ? '#B94352' : '#5A3542' }}><p className="text-xl font-bold text-white">{absPct.toFixed(1).replace('.', ',')}%</p><p className="text-[11px] text-white/80">Wskaźnik absencji</p></div>
            </div>
          </Sekcja>
        </>)}

        {tab === 'ust' && (
          <div className="grid md:grid-cols-2 gap-4">
            <Sekcja kolor="#2B171E" tytul="Składki i stawki">
              <div className="space-y-3">
                {[['ZUS pracodawcy (%)', settings.zusRate * 100, (v) => setSettings((s) => ({ ...s, zusRate: (Number(v) || 0) / 100 }))], ['ZUS z PPK (%)', settings.zusPPK * 100, (v) => setSettings((s) => ({ ...s, zusPPK: (Number(v) || 0) / 100 }))], ['Dodatek nocny (%)', settings.nocnyBonus * 100, (v) => setSettings((s) => ({ ...s, nocnyBonus: (Number(v) || 0) / 100 }))], ['Płaca minimalna (zł)', settings.minWage, (v) => setSettings((s) => ({ ...s, minWage: Number(v) || 0 }))]].map(([l, val, on]) => (
                  <div key={l} className="flex items-center justify-between gap-3"><span className="text-sm" style={{ color: colors.primary.dark }}>{l}</span>{numIn(val, on, 'w-32')}</div>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: colors.primary.light }}>Domyślnie ZUS 19,48%; z PPK 20,98%.</p>
            </Sekcja>
            <Sekcja kolor={colors.primary.medium} tytul="Normy godzin (etat) w miesiącach">
              <div className="grid grid-cols-2 gap-2">{months.map((m, i) => (<div key={i} className="flex items-center justify-between gap-2"><span className="text-sm" style={{ color: colors.primary.dark }}>{m}</span>{numIn(settings.normy[i], (v) => setNorma(i, v), 'w-20')}</div>))}</div>
            </Sekcja>
          </div>
        )}
      </div>
    </div>
  );
};

// ===================== PRACOWNICY (konta użytkowników) =====================
const FUNKCJE = [
  { id: 'CREW', label: 'Pracownik restauracji' },
  { id: 'REST', label: 'Konto restauracji (login + PIN, bez umowy)' },
  { id: 'JSM', label: 'Młodszy kierownik zmiany' },
  { id: 'SM', label: 'Kierownik zmiany' },
  { id: 'ASM', label: 'Zastępca kierownika' },
  { id: 'RGM', label: 'Kierownik restauracji' },
];
const funkcjaLabel = (id) => (FUNKCJE.find((f) => f.id === id) || {}).label || id;
const emptyForm = { name: '', funkcja: 'CREW', umowa: 'UZ', stawka: 30, zus: false, instruktor: false, grafikName: '', aliasy: '', wymiarTygH: '', maxDobaH: '', stanowiska: '' };

const CopyField = ({ label, value }) => {
  const [ok, setOk] = useState(false);
  const copy = () => { try { navigator.clipboard.writeText(value); } catch (e) {} setOk(true); setTimeout(() => setOk(false), 1500); };
  return (<div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ backgroundColor: colors.primary.bgLight }}><div><p className="text-[11px]" style={{ color: colors.primary.light }}>{label}</p><p className="font-mono font-bold text-lg" style={{ color: colors.primary.darkest }}>{value}</p></div><button onClick={copy} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: ok ? '#741334' : colors.primary.medium }}>{ok ? 'Skopiowano' : 'Kopiuj'}</button></div>);
};

const EmpForm = ({ init, onSave, onClose }) => {
  const [f, setF] = useState(init);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const rest = f.funkcja === 'REST';
  const valid = rest ? (init.id || (String(f.login || '').trim().length >= 3 && String(f.pin || '').trim().length >= 4)) : f.name.trim().split(/\s+/).length >= 2;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>{init.id ? 'Edytuj pracownika' : 'Nowy pracownik'}</h3><button onClick={onClose}><X size={20} className="text-slate-400" /></button></div>
        <div className="space-y-3">
          {!rest && (<>
          <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Imię i nazwisko</label><input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="np. Jan Kowalski" className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: valid || !f.name ? colors.primary.bg : '#B94352' }} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Nazwa w grafiku</label>
              <input value={f.grafikName} onChange={(e) => set({ grafikName: e.target.value })} placeholder={f.name.trim().split(/\s+/).pop() || 'nazwisko'} className="w-full px-3 py-2 rounded-lg border font-mono text-sm" style={{ borderColor: colors.primary.bg }} />
              <p className="text-[10px] text-slate-400 mt-0.5">Dokładnie tak, jak osoba jest wpisana w matrycy (np. MATI KOLSKI)</p></div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Inne zapisy (aliasy)</label>
              <input value={f.aliasy} onChange={(e) => set({ aliasy: e.target.value })} placeholder="np. MATI KOSKI, KOSKI" className="w-full px-3 py-2 rounded-lg border font-mono text-sm" style={{ borderColor: colors.primary.bg }} />
              <p className="text-[10px] text-slate-400 mt-0.5">Literówki i warianty, oddzielone przecinkiem</p></div>
          </div>
          </>)}
          <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Funkcja</label><select value={f.funkcja} onChange={(e) => set({ funkcja: e.target.value })} className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}>{FUNKCJE.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
          {rest && (
            <div className="rounded-lg p-3 space-y-3" style={{ backgroundColor: colors.primary.bgLight }}>
              <p className="text-[11px]" style={{ color: colors.primary.light }}>Konto restauracji: bez imienia i nazwiska, umowy i stawki. Nazwa konta = login. Uprawnienia kierownika zmiany w panelu (grafik + wydruk); logowanie loginem i PIN-em — tu i w aplikacji pracownika.</p>
              {!init.id && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Login</label><input value={f.login || ''} onChange={(e) => set({ login: e.target.value.toUpperCase() })} placeholder="PLPLK201043" className="w-full px-3 py-2 rounded-lg border font-mono" style={{ borderColor: colors.primary.bg }} /></div>
                  <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>PIN (min. 4 cyfry)</label><input value={f.pin || ''} onChange={(e) => set({ pin: e.target.value })} maxLength={8} inputMode="numeric" className="w-full px-3 py-2 rounded-lg border tracking-widest font-mono" style={{ borderColor: colors.primary.bg }} placeholder="••••••" /></div>
                </div>
              )}
            </div>
          )}
          {!rest && (<>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Typ umowy</label><select value={f.umowa} onChange={(e) => set({ umowa: e.target.value })} className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}><option value="UOP">UOP (etat)</option><option value="UZ">UZ (zlecenie)</option></select></div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>{f.umowa === 'UOP' ? 'Wynagr. mies. (zł)' : 'Stawka (zł/h)'}</label><input type="number" value={f.stawka} onChange={(e) => set({ stawka: Number(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: colors.primary.dark }}><input type="checkbox" checked={f.zus} onChange={(e) => set({ zus: e.target.checked })} />Pracownik oskładkowany (ZUS){f.umowa === 'UOP' ? ' — dla UOP zawsze' : ''}</label>
          <div className="rounded-lg p-3 space-y-3" style={{ backgroundColor: colors.primary.bgLight }}>
            <p className="text-[11px] font-semibold" style={{ color: colors.primary.dark }}>Reguły pracy (WFM-04) — planer ostrzega przy przekroczeniu</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Wymiar tygodniowy (h)</label><input type="number" value={f.wymiarTygH ?? ''} onChange={(e) => set({ wymiarTygH: e.target.value })} placeholder="np. 40 (puste = brak)" className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
              <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Maks. na dobę (h)</label><input type="number" value={f.maxDobaH ?? ''} onChange={(e) => set({ maxDobaH: e.target.value })} placeholder="np. 12" className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
            </div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Dozwolone stanowiska (po przecinku; puste = wszystkie)</label><input value={f.stanowiska || ''} onChange={(e) => set({ stanowiska: e.target.value })} placeholder="np. FRYTKI, PREP, ZMYWAK" className="w-full px-3 py-2 rounded-lg border font-mono text-sm" style={{ borderColor: colors.primary.bg }} /></div>
          </div>
          </>)}
          {f.funkcja === 'CREW' && <label className="flex items-center gap-2 text-sm" style={{ color: colors.primary.dark }}><input type="checkbox" checked={!!f.instruktor} onChange={(e) => set({ instruktor: e.target.checked })} />Instruktor (szkoli innych pracowników)</label>}
        </div>
        <div className="flex justify-end gap-2 mt-5"><button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Anuluj</button><button disabled={!valid} onClick={() => onSave(f)} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40" style={{ backgroundColor: colors.primary.medium }}>{init.id ? 'Zapisz' : 'Dodaj i utwórz konto'}</button></div>
      </div>
    </div>
  );
};

const AdminEmployees = ({ data }) => {
  const emps = data.accounts || [];
  const [form, setForm] = useState(null);
  const [cred, setCred] = useState(null);
  const [q, setQ] = useState('');

  const save = async (f) => {
    const payload = { ...f, grafikName: (f.grafikName || '').trim(), aliasy: String(f.aliasy || '').split(',').map((x) => x.trim()).filter(Boolean), stanowiska: String(f.stanowiska || '').split(',').map((x) => x.trim()).filter(Boolean) };
    if (f.funkcja === 'REST' && !String(payload.name || '').trim()) payload.name = String(payload.login || '').trim().toUpperCase();
    if (form.id) { await data.updateAccount(form.id, payload); data.show('Zapisano zmiany'); }
    else { const c = await data.addAccount(payload); if (c) { if (c.haslo) setCred(c); else data.show(`Konto ${c.login} utworzone — loguje się własnym PIN-em`, 'success'); } }
    setForm(null);
  };
  const reset = async (e) => { const c = await data.resetAccountPassword(e.id); if (c) setCred(c); };
  const del = (e) => { if (confirm(`Usunąć konto: ${e.name} (${e.login})?`)) data.deleteAccount(e.id); };
  const [filtrT, setFiltrT] = useState('Wszyscy');
  const filtered = emps.filter((e) => (e.name + ' ' + e.login).toLowerCase().includes(q.toLowerCase()));

  // ── metryki zespołu wg wzorca ──
  const MGRF_T = new Set(['RGM', 'ASM', 'SM', 'JSM']);
  const mcT = new Date().toISOString().slice(0, 7);
  const planM = useMemo(() => {
    const m = new Map();
    (data.shifts || []).filter((x) => x.date && x.date.slice(0, 7) === mcT && !jestInstruktor(x)).forEach((x) => {
      const k = emps.find((e2) => e2.id === x.accountId) || emps.find((e2) => [e2.grafikName, e2.name, ...(e2.aliasy || [])].filter(Boolean).some((n) => String(n).toUpperCase().trim() === String(x.name || '').toUpperCase().trim()));
      if (k) m.set(k.id, (m.get(k.id) || 0) + godzZ(x));
    });
    return m;
  }, [data.shifts, emps]);
  const celM = (e) => e.wymiarTygH ? Math.round(e.wymiarTygH * 4.33) : (e.umowa === 'UOP' ? 168 : 0);
  const bilansM = (e) => { const c = celM(e); return c ? Math.round((planM.get(e.id) || 0) - c) : null; };
  const alertyT = emps.filter((e) => { const b = bilansM(e); return b != null && Math.abs(b) > 5; });
  const mgrCount = emps.filter((e) => MGRF_T.has(e.funkcja)).length;
  const uopy = emps.filter((e) => e.umowa === 'UOP');
  const instrT = emps.filter((e) => e.instruktor).length;

  const widT = filtered.filter((e) => filtrT === 'Wszyscy' || (filtrT === 'UOP' ? e.umowa === 'UOP' : filtrT === 'Zlecenie' ? e.umowa !== 'UOP' : alertyT.includes(e)));
  const eksportT = () => {
    const rows = ['Pracownik;Funkcja;Umowa;Plan miesiąca;Cel;Bilans;Login', ...emps.map((e) => `${e.name};${funkcjaLabel(e.funkcja)};${e.umowa};${(planM.get(e.id) || 0).toFixed(1)};${celM(e) || ''};${bilansM(e) ?? ''};${e.login}`)];
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const u = URL.createObjectURL(blob); const a2 = document.createElement('a'); a2.href = u; a2.download = 'zespol-i-konta.csv'; a2.click(); URL.revokeObjectURL(u);
  };
  const edytuj = (e) => setForm({ id: e.id, name: e.name, funkcja: e.funkcja, umowa: e.umowa, stawka: e.stawka, zus: e.zus, instruktor: !!e.instruktor, grafikName: e.grafikName || '', aliasy: (e.aliasy || []).join(', '), wymiarTygH: e.wymiarTygH || '', maxDobaH: e.maxDobaH || '', stanowiska: (e.stanowiska || []).join(', ') });

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="page-wrap module-view team-view" style={{ width: '100%' }}>
        <MHead kicker={`ZESPÓŁ • ${emps.length} AKTYWNYCH`} title="Pracownicy i konta" copy="Godziny umowne, kwalifikacje, dostępność, koszty i gotowość do obsady stanowisk.">
          <button className="secondary-action" onClick={() => data.przypiszZmiany()}><RefreshCw size={16} /> Przypisz zmiany</button>
          <button className="secondary-action" onClick={eksportT}><Download size={16} /> Eksport</button>
          <button className="primary-action" onClick={() => setForm({ ...emptyForm })}><Users size={16} /> Dodaj osobę</button>
        </MHead>
        <section className="team-summary">
          <MMetric icon={Users} label="Aktywni" value={`${emps.length} ${emps.length === 1 ? 'osoba' : emps.length < 5 ? 'osoby' : 'osób'}`} helper={`${emps.length - mgrCount} crew • ${mgrCount} managerów`} tone="blue" />
          <MMetric icon={CreditCard} label="UOP" value={`${uopy.length} osób`} helper={`${uopy.reduce((a2, e) => a2 + celM(e), 0).toLocaleString('pl-PL')} h do zapewnienia`} tone="violet" />
          <MMetric icon={CheckCircle2} label="Instruktorzy" value={`${instrT} ${instrT === 1 ? 'osoba' : instrT < 5 ? 'osoby' : 'osób'}`} helper={emps.length ? `${Math.round(instrT / emps.length * 100)}% zespołu` : '—'} tone="mint" />
          <MMetric icon={AlertTriangle} label="Ryzyko godzin" value={`${alertyT.length} ${alertyT.length === 1 ? 'osoba' : alertyT.length < 5 ? 'osoby' : 'osób'}`} helper="bilans poza ±5 h" tone={alertyT.length ? 'coral' : 'mint'} />
        </section>
        <article className="panel team-panel">
          <div className="team-toolbar">
            <div className="filter-tabs">{['Wszyscy', 'UOP', 'Zlecenie', 'Alerty'].map((it) => <button key={it} className={filtrT === it ? 'active' : ''} onClick={() => setFiltrT(it)}>{it}{it === 'Alerty' && alertyT.length > 0 && <b>{alertyT.length}</b>}</button>)}</div>
            <div className="team-search"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj po nazwisku lub loginie" /></div>
          </div>
          <div className="team-table">
            <div className="team-head"><span>Pracownik</span><span>Umowa</span><span>Plan miesiąca</span><span>Bilans</span><span>Kwalifikacje</span><span>Gotowość</span><span /></div>
            {widT.map((e) => { const plan = planM.get(e.id) || 0; const cel = celM(e); const bil = bilansM(e); return (
              <div className="team-row" key={e.id}>
                <span className="team-person"><i>{String(e.name || '?').split(/\s+/).map((c) => c[0]).join('').slice(0, 2).toUpperCase()}</i><span><strong>{e.name}</strong><small>{funkcjaLabel(e.funkcja)}{e.instruktor ? ' • instruktor' : ''}</small></span></span>
                <span><strong>{e.umowa || '—'}</strong><small>{e.umowa === 'UOP' ? `${e.wymiarTygH || 40} h` : 'elastyczna'}</small></span>
                <span className="hours-cell"><div><b style={{ width: `${cel ? Math.min(100, plan / cel * 100) : plan ? 100 : 0}%` }} /></div><strong>{plan.toFixed(0)} / {cel || '—'} h</strong></span>
                <span className={bil != null && Math.abs(bil) > 5 ? 'balance-alert' : 'balance-ok'}>{bil == null ? '—' : `${bil > 0 ? '+' : ''}${bil} h`}</span>
                <span className="skill-list">{(e.stanowiska && e.stanowiska.length ? e.stanowiska : [funkcjaLabel(e.funkcja)]).slice(0, 3).map((sk) => <em key={sk}>{sk}</em>)}</span>
                <span><em className="status-ready">{e.login}</em></span>
                <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button className="fix-button" onClick={() => edytuj(e)}>Edytuj</button>
                  <button className="fix-button" title="Reset PIN" onClick={() => reset(e)}><Lock size={11} /> PIN</button>
                  <button className="row-more" aria-label={`Usuń ${e.name}`} onClick={() => del(e)}><Trash2 size={15} /></button>
                </span>
              </div>
            ); })}
            {!widT.length && <div className="dialog-empty" style={{ padding: 20 }}>Brak osób spełniających kryteria.</div>}
          </div>
        </article>
        {(() => {
          const wGrafiku = {};
          (data.shifts || []).filter((x) => !x.accountId).forEach((x) => { const k = String(x.name || '').toUpperCase().trim(); if (k) wGrafiku[k] = (wGrafiku[k] || 0) + godzZ(x); });
          const osierocone = Object.entries(wGrafiku).sort((a2, b2) => b2[1] - a2[1]);
          if (!osierocone.length) return null;
          return (
            <article className="panel" style={{ marginTop: 14, padding: 16 }}>
              <div className="flex items-center gap-2 mb-2"><AlertCircle size={16} style={{ color: '#A7465F' }} /><h3 className="font-semibold text-sm" style={{ color: '#2B171E' }}>Nazwy z grafiku bez konta ({osierocone.length})</h3></div>
              <p className="text-xs mb-3" style={{ color: '#71656A' }}>Te zmiany nie są przypisane do żadnego konta — ich godziny nie wliczą się do kosztów. Dopisz nazwę jako „Nazwa w grafiku" albo alias przy właściwym pracowniku (Edytuj), a potem kliknij „Przypisz zmiany".</p>
              <div className="flex flex-wrap gap-1.5">{osierocone.map(([k, h]) => <span key={k} className="text-xs px-2 py-1 rounded-lg font-mono" style={{ backgroundColor: '#F1E4E8', color: '#A7465F' }}>{k} <span className="opacity-60">{h.toFixed(0)} h</span></span>)}</div>
            </article>
          );
        })()}
        <p className="text-xs mt-3" style={{ color: '#A38D95' }}>Login nadawany automatycznie (3 litery imienia + 3 nazwiska + numer). PIN startowy (4 cyfry) generowany przy utworzeniu — pracownik zmienia go przy pierwszym logowaniu. „PIN" resetuje i pokazuje nowy PIN startowy.</p>
      </div>

      {form && <EmpForm init={form} onSave={save} onClose={() => setForm(null)} />}
      {cred && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCred(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-1"><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F1E4E8' }}><Check size={20} style={{ color: '#741334' }} /></div><h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>Konto gotowe</h3></div>
            <p className="text-sm mb-4" style={{ color: colors.primary.light }}>Dane logowania dla: <b style={{ color: colors.primary.dark }}>{cred.name}</b>. Przekaż je pracownikowi — PIN zmieni przy pierwszym logowaniu.</p>
            <div className="space-y-2"><CopyField label="Login" value={cred.login} /><CopyField label="PIN startowy" value={cred.haslo} /></div>
            <div className="mt-4 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: '#F5E9ED', color: '#A7465F' }}>Zapisz lub skopiuj PIN teraz — nie będzie później widoczny (przechowywany jako hash).</div>
            <button onClick={() => setCred(null)} className="w-full mt-4 py-2.5 rounded-lg text-white font-semibold" style={{ backgroundColor: colors.primary.medium }}>Gotowe</button>
          </div>
        </div>
      )}
    </div>
  );
};

const PlanPage = ({ data }) => {
  const domyslnyYm = (data.months && data.months[0]?.key) || (data.meta.firstDate || '').slice(0, 7) || ymd(new Date()).slice(0, 7);
  const [ym, setYm] = useState(domyslnyYm);
  const dni = dniMiesiaca(ym);
  const [mgrH, setMgrH] = useState(8);
  const [mgrDate, setMgrDate] = useState(dni[0] || '');
  const [funkH, setFunkH] = useState(8);
  const [funkDate, setFunkDate] = useState(dni[0] || '');
  const [wd, setWd] = useState([]);
  const [planLocal, setPlanLocal] = useState('');
  useEffect(() => { const d = dniMiesiaca(ym); setMgrDate(d[0] || ''); setFunkDate(d[0] || ''); }, [ym]);

  const p = podsumowanieMiesiaca(data.shifts, data.planowanie, ym);
  useEffect(() => { setPlanLocal(p.planTotal ? String(p.planTotal) : ''); }, [ym, p.planTotal]);
  const nadmiar = p.planTotal > 0 ? p.total - p.planTotal : 0;
  const pct = p.planTotal > 0 ? Math.min(100, (p.total / p.planTotal) * 100) : 0;
  const kolorStanu = p.planTotal === 0 ? colors.primary.light : nadmiar > 0 ? '#B94352' : (p.total >= p.planTotal * 0.95 ? '#B86D82' : '#741334');
  const topDni = (() => {
    const g = {};
    p.mShifts.forEach(s => { g[s.date] = (g[s.date] || 0) + godzZ(s); });
    return Object.entries(g).sort((a, b) => b[1] - a[1]).slice(0, 3);
  })();
  const [y, m] = ym.split('-').map(Number);
  const label = `${months[m - 1]} ${y}`;
  const dniTyg = [['Pn', 1], ['Wt', 2], ['Śr', 3], ['Cz', 4], ['Pt', 5], ['So', 6], ['Nd', 0]];

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Plan godzin" subtitle="Plan miesiąca, ręczne godziny MGR i monitoring przekroczeń" />
      <div className="flex-1 p-8 space-y-6 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium" style={{ color: colors.primary.dark }}>Miesiąc:</span>
          <select value={ym} onChange={e => setYm(e.target.value)} className="px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}>
            {(data.months && data.months.length ? data.months : [{ key: ym, label }]).map(mm => <option key={mm.key} value={mm.key}>{mm.label || mm.key}</option>)}
          </select>
        </div>

        <Sekcja kolor={kolorStanu} tytul={`Plan total — ${label}`} ikona={LayoutGrid}>
          <div className="flex flex-wrap items-end gap-4 mb-4">
            <div>
              <label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Plan total godzin (miesiąc)</label>
              <input type="number" value={planLocal} onChange={e => setPlanLocal(e.target.value)} onBlur={() => data.setPlanTotal(ym, planLocal)} placeholder="np. 1800" className="w-40 px-3 py-2 rounded-lg border text-lg font-semibold" style={{ borderColor: colors.primary.bg }} />
            </div>
            <div className="flex-1 min-w-[220px]">
              <div className="flex justify-between text-sm mb-1"><span style={{ color: colors.primary.dark }}>Zaplanowano: <b>{p.total.toFixed(1)} h</b></span><span style={{ color: colors.primary.light }}>{p.planTotal ? `z ${p.planTotal} h` : 'brak planu'}</span></div>
              <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: colors.primary.bg }}>
                <div style={{ width: `${pct}%`, height: '100%', backgroundColor: kolorStanu, transition: 'width .3s' }} />
              </div>
            </div>
          </div>
          {p.planTotal > 0 && (nadmiar > 0
            ? <div className="rounded-xl p-4" style={{ backgroundColor: '#F5E3E8' }}>
                <p className="font-semibold mb-1" style={{ color: '#B94352' }}>Przekroczenie planu o {nadmiar.toFixed(1)} h</p>
                <p className="text-sm mb-2" style={{ color: colors.primary.dark }}>Sugerowane ścięcie: <b>{nadmiar.toFixed(1)} h</b>. Dni z największą liczbą godzin (kandydaci do redukcji):</p>
                <div className="flex flex-wrap gap-2">{topDni.map(([d, h]) => <span key={d} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: 'white', color: colors.primary.dark }}>{d.slice(5)} — {h.toFixed(1)} h</span>)}</div>
              </div>
            : <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>W ramach planu — pozostało {(p.planTotal - p.total).toFixed(1)} h.</div>)}
          <div className="grid grid-cols-4 gap-3 mt-4 text-center text-sm">
            <div className="rounded-lg p-2" style={{ backgroundColor: colors.primary.bg }}><b>{p.crew.toFixed(1)}</b><br />CREW</div>
            <div className="rounded-lg p-2" style={{ backgroundColor: '#F1E4E8' }}><b>{p.szkol.toFixed(1)}</b><br />Szkoleniowe</div>
            <div className="rounded-lg p-2" style={{ backgroundColor: colors.primary.bgLight }}><b>{p.mgr.toFixed(1)}</b><br />MGR{p.mgrManual ? ` (+${p.mgrManual})` : ''}</div>
            <div className="rounded-lg p-2" style={{ backgroundColor: colors.primary.bgLight }}><b>{p.funk.toFixed(1)}</b><br />MGR funkc.{p.funkManual ? ` (+${p.funkManual})` : ''}</div>
          </div>
        </Sekcja>

        <Sekcja kolor="#2B171E" tytul="Godziny MGR (ręcznie)" ikona={Clock}>
          <p className="text-sm mb-3" style={{ color: colors.primary.light }}>Dodaj godziny managera do sumy RAZEM — w wybrany dzień albo w każdy dzień miesiąca. Ręcznie dodane: <b>{p.mgrManual.toFixed(1)} h</b> ({Object.keys((data.planowanie[ym] || {}).mgr || {}).length} dni).</p>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Godziny</label><input type="number" value={mgrH} onChange={e => setMgrH(e.target.value)} className="w-24 px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Dzień</label><select value={mgrDate} onChange={e => setMgrDate(e.target.value)} className="px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}>{dni.map(d => <option key={d} value={d}>{d.slice(5)}</option>)}</select></div>
            <Btn variant="secondary" onClick={() => data.applyGodziny(ym, 'mgr', 'day', mgrH, mgrDate)}>Zastosuj w ten dzień</Btn>
            <Btn onClick={() => data.applyGodziny(ym, 'mgr', 'month', mgrH)}>Przenieś na cały miesiąc</Btn>
            <Btn variant="secondary" onClick={() => data.clearGodziny(ym, 'mgr')}>Wyczyść</Btn>
          </div>
        </Sekcja>

        <Sekcja kolor="#5A3542" tytul="Godziny MGR funkcyjne (ręcznie)" ikona={Clock}>
          <p className="text-sm mb-3" style={{ color: colors.primary.light }}>Jak wyżej, dodatkowo „wg schematu" — np. 8 h w każdy poniedziałek. Ręcznie dodane: <b>{p.funkManual.toFixed(1)} h</b> ({Object.keys((data.planowanie[ym] || {}).mgrFunk || {}).length} dni).</p>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Godziny</label><input type="number" value={funkH} onChange={e => setFunkH(e.target.value)} className="w-24 px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Dzień</label><select value={funkDate} onChange={e => setFunkDate(e.target.value)} className="px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}>{dni.map(d => <option key={d} value={d}>{d.slice(5)}</option>)}</select></div>
            <Btn variant="secondary" onClick={() => data.applyGodziny(ym, 'mgrFunk', 'day', funkH, funkDate)}>Ten dzień</Btn>
            <Btn onClick={() => data.applyGodziny(ym, 'mgrFunk', 'month', funkH)}>Cały miesiąc</Btn>
            <Btn variant="secondary" onClick={() => data.clearGodziny(ym, 'mgrFunk')}>Wyczyść</Btn>
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor: colors.primary.bgLight }}>
            <p className="text-xs mb-2" style={{ color: colors.primary.dark }}>Schemat — wybierz dni tygodnia, potem „Wg schematu":</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {dniTyg.map(([lbl, val]) => {
                const on = wd.includes(val);
                return <button key={val} onClick={() => setWd(w => on ? w.filter(x => x !== val) : [...w, val])} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ backgroundColor: on ? colors.primary.medium : 'white', color: on ? 'white' : colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>{lbl}</button>;
              })}
            </div>
            <Btn onClick={() => { if (!wd.length) { data.show('Zaznacz dni tygodnia', 'error'); return; } data.applyGodziny(ym, 'mgrFunk', 'schemat', funkH, null, wd); }}>Wg schematu ({wd.length} dni tyg.)</Btn>
          </div>
        </Sekcja>
      </div>
    </div>
  );
};

// ===================== GIEŁDA ZAMIAN =====================

const AdminSwaps = ({ data }) => {
  const doAkceptacji = data.swaps.filter(s => s.status === 'open' && s.volunteers.length > 0);
  const oczekujace = data.swaps.filter(s => s.status === 'open' && s.volunteers.length === 0);
  const historia = data.swaps.filter(s => ['approved', 'rejected', 'cancelled'].includes(s.status)).sort((a, b) => b.createdAt - a.createdAt);
  const [wyb, setWyb] = useState({});
  const chosen = (s) => wyb[s.id] || s.volunteers[0];

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Zamiany i wnioski" subtitle="Zamiany zmian oraz wnioski urlopowe pracowników — decyzje kierownika" />
      <div className="flex-1 p-8 space-y-6 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="flex items-center justify-between">
          <div />
          <Btn variant="secondary" icon={RefreshCw} onClick={data.refreshSwaps}>Odśwież</Btn>
        </div>

        <AbsencesAdmin data={data} />

        <AvailabilityAdmin data={data} />

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #B86D82' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: colors.primary.darkest }}>Do akceptacji ({doAkceptacji.length})</h3>
          {doAkceptacji.length === 0 ? <p className="text-sm" style={{ color: colors.primary.light }}>Brak zamian czekających na akceptację.</p> : (
            <div className="space-y-3">
              {doAkceptacji.map(s => (
                <div key={s.id} className="rounded-xl p-4" style={{ backgroundColor: colors.primary.bgLight }}>
                  <p className="text-sm" style={{ color: colors.primary.dark }}><b style={{ color: colors.primary.darkest }}>{s.requesterDisplay || s.requester}</b> oddaje zmianę: {opisZmiany(s.shift)}</p>
                  {s.note && <p className="text-xs italic mt-0.5" style={{ color: colors.primary.light }}>„{s.note}"</p>}
                  <p className="text-xs mt-3 mb-1" style={{ color: colors.primary.light }}>Zgłoszeni — wybierz, kto przejmie:</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {s.volunteers.map(v => { const on = chosen(s) === v; const etyk = ((s.volunteersDisplay || []).find(x => x.alias === v) || {}).display || v; return (
                      <button key={v} onClick={() => setWyb(w => ({ ...w, [s.id]: v }))} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ backgroundColor: on ? colors.primary.medium : 'white', color: on ? 'white' : colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>{etyk}</button>
                    ); })}
                  </div>
                  <div className="flex gap-2">
                    <Btn onClick={() => data.approveSwap(s.id, chosen(s))}>Zatwierdź → {chosen(s)}</Btn>
                    <Btn variant="secondary" onClick={() => data.rejectSwap(s.id)}>Odrzuć</Btn>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {oczekujace.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${colors.primary.medium}` }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: colors.primary.darkest }}>Otwarte — czekają na chętnych ({oczekujace.length})</h3>
            <div className="space-y-2">
              {oczekujace.map(s => (
                <div key={s.id} className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: colors.primary.bgLight }}>
                  <p className="text-sm" style={{ color: colors.primary.dark }}><b>{s.requesterDisplay || s.requester}</b> — {opisZmiany(s.shift)}</p>
                  <span className="text-xs" style={{ color: colors.primary.light }}>brak zgłoszeń</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #A38D95' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: colors.primary.darkest }}>Historia ({historia.length})</h3>
          {historia.length === 0 ? <p className="text-sm" style={{ color: colors.primary.light }}>Brak zakończonych zamian.</p> : (
            <div className="space-y-2">
              {historia.map(s => { const st = statusZamiany(s); return (
                <div key={s.id} className="rounded-xl p-3" style={{ backgroundColor: st.bg }}>
                  <p className="text-xs" style={{ color: colors.primary.dark }}><b>{s.requesterDisplay || s.requester}</b> — {opisZmiany(s.shift)}</p>
                  <p className="text-xs mt-0.5 font-medium" style={{ color: st.kol }}>{st.txt}</p>
                </div>
              ); })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===================== GRAFIK / CZAS PRACY (Working Time) =====================

const WTBar = ({ start, end, color, breaks }) => {
  const left = (wtRel(start) / 1440) * 100;
  const width = (wtDur(start, end) / 1440) * 100;
  return (
    <div className="absolute top-0 h-full rounded" style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%`, backgroundColor: color }}>
      {(breaks || []).map((b, i) => { const bl = ((wtRel(b.start) - wtRel(start) + 1440) % 1440) / wtDur(start, end) * 100; const bw = wtDur(b.start, b.end) / wtDur(start, end) * 100; return <div key={i} className="absolute top-0 h-full" style={{ left: `${bl}%`, width: `${Math.max(bw, 1)}%`, backgroundColor: b.platna === false ? '#B94352' : '#B86D82' }} title={`${b.type} ${b.start}-${b.end}`} />; })}
    </div>
  );
};
const WTGrid = () => (<>{WT_TICKS.map((h) => <div key={h} className="absolute top-0 bottom-0 border-l" style={{ left: `${((h - 6) * 60 / 1440) * 100}%`, borderColor: '#EDE3E6' }} />)}</>);

const WTBreaks = ({ actual, onSave, locked, onClose }) => {
  const breaks = actual.breaks || [];
  const upd = (list) => { if (locked) return; onSave(list); };
  const add = () => upd([...breaks, { type: 'CivilBreak', platna: false, start: '16:00', end: '16:30' }]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>Przerwy</h3><button onClick={onClose}><X size={20} className="text-slate-400" /></button></div>
        <p className="text-xs mb-3" style={{ color: colors.primary.light }}>Przerwy tylko dla UOP. Spóźnienie zmienia przerwę płatną na niepłatną.</p>
        <div className="space-y-2 mb-4">
          {breaks.length === 0 ? <p className="text-sm text-slate-400">Brak przerw.</p> : breaks.map((b, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg p-2" style={{ backgroundColor: colors.primary.bgLight }}>
              <select disabled={locked} value={b.platna ? 'p' : 'n'} onChange={(e) => { const l = [...breaks]; l[i] = { ...b, platna: e.target.value === 'p' }; upd(l); }} className="px-2 py-1 rounded border text-xs" style={{ borderColor: colors.primary.bg }}><option value="n">Niepłatna</option><option value="p">Płatna</option></select>
              <input disabled={locked} value={b.start} onChange={(e) => { const l = [...breaks]; l[i] = { ...b, start: e.target.value }; upd(l); }} className="w-16 px-2 py-1 rounded border text-xs text-center" style={{ borderColor: colors.primary.bg }} />
              <span className="text-slate-400">–</span>
              <input disabled={locked} value={b.end} onChange={(e) => { const l = [...breaks]; l[i] = { ...b, end: e.target.value }; upd(l); }} className="w-16 px-2 py-1 rounded border text-xs text-center" style={{ borderColor: colors.primary.bg }} />
              <span className="text-xs text-slate-500">{wtDur(b.start, b.end)} min</span>
              <button disabled={locked} onClick={() => upd(breaks.filter((_, j) => j !== i))} className="ml-auto text-xs text-red-500 disabled:opacity-40">Usuń</button>
            </div>
          ))}
        </div>
        <div className="flex justify-between"><button onClick={add} disabled={locked} className="text-sm px-3 py-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>+ Dodaj przerwę</button><button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-white font-medium" style={{ backgroundColor: colors.primary.medium }}>Gotowe</button></div>
      </div>
    </div>
  );
};




// ===================== SHIFTCYCLES — cykle rotacyjne (rota) na bazie Blueprints =====================
// ═════════ WORKRHYTHM · SHIFTCYCLES — rotacje cykliczne wg wzorca ═════════
const ROT_ZESPOLY = [
  { id: 'A', nazwa: 'Zespół A', kat: 'Kuchnia', kol: '#F1E4E8', ram: '#DFC9D1', tekst: '#741334' },
  { id: 'B', nazwa: 'Zespół B', kat: 'Front', kol: '#EFEDEE', ram: '#D6D1D3', tekst: '#3A3438' },
  { id: 'C', nazwa: 'Zespół C', kat: 'Dispatch', kol: '#F7EDF1', ram: '#E4CDD6', tekst: '#A7465F' },
  { id: 'y', nazwa: 'Liderzy', kat: 'Manager', kol: '#5A3542', ram: '#472934', tekst: '#F5ECEF' },
];
const RotacjeWzor = ({ data, naGrafik }) => {
  const [tplId, setTplId] = useState('');
  const [det, setDet] = useState(null);
  const [startTyg, setStartTyg] = useState('');
  const [ileCykli, setIleCykli] = useState(4);
  const [aktCykl, setAktCykl] = useState(0);
  const [robi, setRobi] = useState(false);
  const [wynik, setWynik] = useState(null);
  const nastepnyPon = () => { const d = new Date(); const off = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + off); return ymd(d); };
  useEffect(() => { setStartTyg(nastepnyPon()); }, []);
  useEffect(() => { const l = data.templates || []; if (!tplId && l.length) setTplId(l[0].id); }, [data.templates]);
  useEffect(() => { if (!tplId) { setDet(null); return; } let ok = true; data.templateDetail(tplId).then((t) => { if (ok) { setDet(t); setWynik(null); } }); return () => { ok = false; }; }, [tplId]);

  // podział slotów na zespoły wg dominującej kategorii
  const zespoly = useMemo(() => {
    if (!det) return [];
    const przydzial = { A: [], B: [], C: [], y: [] };
    det.sloty.forEach((sl) => {
      const liczby = {}; sl.shifts.forEach((sh) => { const k = BP_KATEGORIA(sh.station); liczby[k] = (liczby[k] || 0) + 1; });
      const dominanta = Object.entries(liczby).sort((a, b) => b[1] - a[1])[0];
      const kat = dominanta ? dominanta[0] : 'Inne';
      const z = ROT_ZESPOLY.find((x) => x.kat === kat) || ROT_ZESPOLY[2];
      przydzial[z.id].push(sl);
    });
    return ROT_ZESPOLY.map((z) => {
      const sloty = przydzial[z.id];
      // wzorzec dnia: najczęstszy przedział start–end wśród slotów zespołu
      const wzorzec = bpDowKol.map((dw) => {
        const zm = sloty.flatMap((sl) => sl.shifts.filter((sh) => sh.dow === dw));
        if (!zm.length) return null;
        const liczby = {}; zm.forEach((sh) => { const k = `${sh.start}–${sh.end}`; liczby[k] = (liczby[k] || 0) + 1; });
        const [zakres] = Object.entries(liczby).sort((a, b) => b[1] - a[1])[0];
        return { zakres, etykieta: bpEtykietaPory(zakres.split('–')[0]), n: zm.length };
      });
      const h = sloty.reduce((a, sl) => a + sl.shifts.reduce((x, y) => x + y.hours, 0), 0);
      return { ...z, sloty, wzorzec, h, osob: sloty.length };
    }).filter((z) => z.sloty.length);
  }, [det]);

  const cykle = useMemo(() => Array.from({ length: ileCykli }, (_, i) => { const d = new Date(startTyg || nastepnyPon()); d.setDate(d.getDate() + i * 7); const s2 = ymd(d); const e = new Date(d); e.setDate(e.getDate() + 6); return { start: s2, label: `${s2.slice(8)}.${s2.slice(5, 7)}–${ymd(e).slice(8)}.${ymd(e).slice(5, 7)}` }; }), [startTyg, ileCykli]);

  // KPI + konflikty (absencje zatwierdzone osób z podpowiedzi w zakresie cyklu)
  const peak = useMemo(() => det ? bpPeakCoverage(det.sloty) : null, [det]);
  const sumaH = zespoly.reduce((a, z) => a + z.h, 0);
  const weekendyOff = useMemo(() => { if (!det) return 0; const wolne = det.sloty.filter((sl) => !sl.shifts.some((sh) => sh.dow === 0 || sh.dow === 6)).length; return det.sloty.length ? Math.round(wolne / det.sloty.length * (ileCykli * 2)) : 0; }, [det, ileCykli]);
  const konflikty = useMemo(() => {
    if (!det || !cykle.length) return 0;
    const od = cykle[0].start; const koniec = new Date(cykle[cykle.length - 1].start); koniec.setDate(koniec.getDate() + 6); const do2 = ymd(koniec);
    const idKonta = det.sloty.map((sl) => sl.hintAccountId).filter(Boolean);
    return (data.absences || []).filter((a) => a.status === 'approved' && idKonta.includes(a.accountId) && a.from <= do2 && od <= a.to).length;
  }, [det, cykle, data.absences]);

  const aktywuj = async () => {
    if (!det || !startTyg) return;
    const przypisania = {};
    det.sloty.forEach((sl) => { if (sl.hint) { const konto = (data.accounts || []).find((a) => sl.hintAccountId ? a.id === sl.hintAccountId : [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((n) => String(n).toUpperCase().trim() === String(sl.hint).toUpperCase().trim())); przypisania[sl.id] = { name: sl.hint, accountId: konto ? konto.id : undefined }; } });
    if (!Object.keys(przypisania).length) return data.show('Szablon nie ma podpowiedzi osób — użyj Blueprints i przypisz ręcznie', 'error');
    if (!confirm(`Aktywować rotację: ${ileCykli} cykli od ${startTyg}? Zmiany trafią do grafiku (duplikaty pomijane przy publikacji ręcznie).`)) return;
    setRobi(true); let ok = 0;
    for (const c of cykle) { const r = await data.applyTemplate(det.id, c.start, przypisania); if (r) ok++; }
    setRobi(false); setWynik({ ok });
  };
  const duplikuj = async () => { if (!det) return; const r = await api('/templates?action=duplicate', 'POST', { id: det.id }); if (r.success) { data.show(`Utworzono kopię cyklu: ${r.template.name}`); data.sync(); } };

  return (
    <div>
      <div className="module-heading">
        <div>
          <span>WORKFORCE • CYKLE ZMIAN</span>
          <h1>ShiftCycles</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.primary.light }}>Powtarzalne wzorce zmian zespołów z kontrolą pokrycia i regeneracji.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={naGrafik} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold flex items-center gap-2" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}><Calendar size={15} /> Wróć do grafiku</button>
          <button onClick={duplikuj} disabled={!det} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold flex items-center gap-2 disabled:opacity-50" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}>Duplikuj cykl</button>
          <button onClick={aktywuj} disabled={!det || robi} className="px-4 h-10 rounded-xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: colors.primary.darkest }}><Check size={15} /> {robi ? 'Aktywuję…' : 'Aktywuj ShiftCycles'}</button>
        </div>
      </div>
      {/* pasek rotacji */}
      <div className="bg-white rounded-2xl border px-5 py-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ borderColor: '#E3DCDD' }}>
        <span className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: '#EDE3E6', color: colors.primary.dark }}><RefreshCw size={18} /></span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold flex items-center gap-2" style={{ color: colors.primary.darkest }}>{ileCykli}-tygodniowa rotacja PLK 201043 <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-md" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>{wynik ? 'AKTYWOWANA' : 'ACTIVE DRAFT'}</span></p>
          <p className="text-[11.5px]" style={{ color: colors.primary.light }}>Start {startTyg} · {det ? det.sloty.length : 0} osób · {zespoly.length} zespoły{zespoly.some((z) => z.id === 'y') ? ' + liderzy' : ''}</p>
        </div>
        <span className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-1">
          {[['Śr. coverage', peak != null ? `${peak}%` : '—'], ['Godziny / cykl', `${Math.round(sumaH * ileCykli).toLocaleString('pl-PL')} h`], ['Weekendy OFF', `${weekendyOff} / osobę`], ['Konflikty', konflikty]].map(([l, v], i) => (
            <span key={i} className="text-center"><p className="text-[9.5px] font-semibold" style={{ color: colors.primary.light }}>{l}</p><p className="text-[16px] font-bold" style={{ color: i === 3 && konflikty > 0 ? '#B94352' : colors.primary.darkest }}>{v}</p></span>
          ))}
        </span>
        <span className="flex items-center gap-2 text-xs w-full lg:w-auto">
          <select value={tplId} onChange={(e) => setTplId(e.target.value)} className="px-3 h-9 rounded-xl border text-sm" style={{ borderColor: '#E3DCDD' }}>{(data.templates || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <input type="date" value={startTyg} onChange={(e) => { const d = new Date(e.target.value); const pon = new Date(d); pon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setStartTyg(ymd(pon)); }} className="px-3 h-9 rounded-xl border text-sm" style={{ borderColor: '#E3DCDD' }} />
          <select value={ileCykli} onChange={(e) => { setIleCykli(+e.target.value); setAktCykl(0); }} className="px-3 h-9 rounded-xl border text-sm" style={{ borderColor: '#E3DCDD' }}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} cykle</option>)}</select>
        </span>
      </div>
      {wynik && <div className="rounded-2xl border px-4 py-3 mb-4 text-sm font-semibold" style={{ borderColor: '#E3DCDD', backgroundColor: '#F1E4E8', color: '#741334' }}>Rotacja aktywowana: {wynik.ok}/{ileCykli} cykli trafiło do grafiku. Pamiętaj o publikacji miesięcy w Planowaniu obsady.</div>}
      {/* zakładki cykli */}
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: `repeat(${Math.min(ileCykli, 4)}, minmax(0, 1fr))` }}>
        {cykle.map((c, i) => (
          <button key={c.start} onClick={() => setAktCykl(i)} className="rounded-2xl border px-4 py-3 text-left" style={{ borderColor: aktCykl === i ? colors.primary.darkest : '#E3DCDD', backgroundColor: 'white', boxShadow: aktCykl === i ? `0 0 0 1px ${colors.primary.darkest}` : 'none' }}>
            <p className="flex items-center gap-2 text-[13px] font-bold" style={{ color: colors.primary.darkest }}><span className="w-6 h-6 rounded-lg flex items-center justify-center text-[11px] text-white" style={{ backgroundColor: aktCykl === i ? colors.primary.darkest : '#C7B4BB' }}>{i + 1}</span> Cykl {i + 1} · {c.label}</p>
            <p className="text-[10.5px] mt-1 ml-8" style={{ color: colors.primary.light }}>{i === 0 ? 'Preliminary' : 'Draft'}</p>
          </button>
        ))}
      </div>
      {/* siatka zespołów */}
      <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E3DCDD' }}>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 900 }}>
            <thead><tr className="border-b" style={{ borderColor: '#EDE3E6', backgroundColor: '#F7F1F3' }}>
              <th className="text-left px-4 py-2.5 text-[10.5px] font-extrabold" style={{ color: colors.primary.light }}>ZESPÓŁ / WZORZEC</th>
              {bpDowKol.map((dw, i) => { const d = new Date(cykle[aktCykl] ? cykle[aktCykl].start : startTyg); d.setDate(d.getDate() + i); return <th key={dw} className="px-2 py-2.5 text-center"><p className="text-[12px] font-bold" style={{ color: colors.primary.darkest }}>{bpDni3[dw]}</p><p className="text-[9.5px]" style={{ color: colors.primary.light }}>{ymd(d).slice(8)} {['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'][d.getMonth()]}</p></th>; })}
              <th className="px-3 py-2.5 text-center text-[10.5px] font-extrabold" style={{ color: colors.primary.light }}>H / TYDZ.</th>
            </tr></thead>
            <tbody>
              {zespoly.map((z) => (
                <tr key={z.id} className="border-b last:border-0" style={{ borderColor: '#F7F5F5' }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold" style={{ backgroundColor: z.kol, color: z.tekst, border: `1px solid ${z.ram}` }}>{z.id}</span>
                      <div><p className="text-[13px] font-bold" style={{ color: colors.primary.darkest }}>{z.nazwa}</p><p className="text-[10.5px]" style={{ color: colors.primary.light }}>{z.osob} osób · {z.kat}</p></div>
                    </div>
                  </td>
                  {z.wzorzec.map((w, i) => (
                    <td key={i} className="px-1.5 py-2.5 text-center">
                      {w ? <div className="rounded-xl border px-2 py-2" style={{ backgroundColor: z.kol, borderColor: z.ram }}><p className="text-[12px] font-bold" style={{ color: z.tekst }}>{w.zakres}</p><p className="text-[9.5px]" style={{ color: z.tekst }}>{w.etykieta}{w.n > 1 ? ` · ${w.n} os.` : ''}</p></div>
                        : <div className="rounded-xl border px-2 py-2" style={{ backgroundColor: '#F7F1F3', borderColor: '#EDE3E6' }}><p className="text-[12px] font-bold" style={{ color: '#C7B4BB' }}>OFF</p><p className="text-[9.5px]" style={{ color: '#C7B4BB' }}>Regeneracja</p></div>}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-center"><p className="text-[14px] font-bold" style={{ color: colors.primary.darkest }}>{Math.round(z.h)} h</p><p className="text-[9.5px]" style={{ color: z.osob && z.h / z.osob > 48 ? '#B94352' : '#741334' }}>{z.osob && z.h / z.osob > 48 ? `−${Math.round(z.h / z.osob - 48)} h` : 'w limicie'}</p></td>
                </tr>
              ))}
              {!zespoly.length && <tr><td colSpan={9} className="text-center py-8 text-sm" style={{ color: colors.primary.light }}>Wybierz Blueprint, aby zbudować rotację.</td></tr>}
            </tbody>
          </table>
        </div>
        {det && (
          <div className="px-5 py-4 border-t" style={{ borderColor: '#EDE3E6' }}>
            <p className="text-[12px] font-bold mb-0.5" style={{ color: colors.primary.darkest }}>Obsada vs idealna</p>
            <p className="text-[10.5px] mb-2" style={{ color: colors.primary.light }}>agregacja zespołów dla wybranego cyklu (vs krzywa obsady)</p>
            <div className="flex items-end gap-6">
              {bpDowKol.map((dw) => {
                const { dir, ind } = optRozbicie(0, 420, 3, 'krzywa', dw);
                const req = dir.reduce((a, v, i) => a + Math.max(v, ind[i]), 0) / 2;
                const sch = det.sloty.reduce((a, sl) => a + sl.shifts.filter((sh) => sh.dow === dw).reduce((x, y) => x + y.hours, 0), 0);
                const pct = req ? Math.min(120, Math.round(sch / req * 100)) : 100;
                return <div key={dw} className="flex flex-col items-center gap-1"><div className="w-9 rounded-md" style={{ height: `${Math.max(10, pct * 0.55)}px`, backgroundColor: pct < 90 ? '#B94352' : pct > 110 ? '#B86D82' : '#B86D82' }} /><p className="text-[10.5px] font-bold" style={{ color: colors.primary.darkest }}>{pct}%</p><p className="text-[9.5px]" style={{ color: colors.primary.light }}>{bpDni3[dw]}</p></div>;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ShiftCycles = ({ data }) => {
  const [tplId, setTplId] = useState('');
  const [det, setDet] = useState(null);
  const [startTyg, setStartTyg] = useState('');
  const [ileTyg, setIleTyg] = useState(4);
  const [przyp, setPrzyp] = useState({});
  const [robi, setRobi] = useState(false);
  const [wynik, setWynik] = useState(null);

  const nastepnyPon = () => { const d = new Date(); const off = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + off); return ymd(d); };
  useEffect(() => { setStartTyg(nastepnyPon()); }, []);
  const wybierz = async (id) => {
    setTplId(id); setDet(null); setWynik(null);
    if (!id) return;
    const t = await data.templateDetail(id);
    if (t) { setDet(t); const p = {}; t.sloty.forEach((sl) => { p[sl.id] = sl.hint || ''; }); setPrzyp(p); }
  };
  const uruchom = async () => {
    if (!det || !startTyg) return;
    const przypisania = {};
    Object.entries(przyp).forEach(([k, v]) => { if (String(v).trim()) { const konto = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((n) => String(n).toUpperCase().trim() === String(v).trim().toUpperCase())); przypisania[k] = { name: String(v).trim(), accountId: konto ? konto.id : undefined }; } });
    if (!Object.keys(przypisania).length) return data.show('Przypisz co najmniej jedną osobę', 'error');
    setRobi(true); let ok = 0;
    for (let i = 0; i < ileTyg; i++) {
      const d = new Date(startTyg); d.setDate(d.getDate() + i * 7);
      const r = await data.applyTemplate(det.id, ymd(d), przypisania);
      if (r) ok++;
    }
    setRobi(false);
    setWynik({ ok, start: startTyg });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: colors.primary.light }}>ShiftCycles — powtarzalny rytm pracy: wybierz Blueprint, osoby i liczbę tygodni, a system ułoży cykl na kolejne tygodnie (grafik + wykonanie, z przypisaniem do kont).</p>
      <div className="bg-white rounded-xl shadow-sm border p-5 space-y-4" style={{ borderColor: colors.primary.bg }}>
        <div className="grid md:grid-cols-3 gap-4">
          <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Blueprint (wzorcowy tydzień)</label>
            <select value={tplId} onChange={(e) => wybierz(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>
              <option value="">— wybierz —</option>
              {(data.templates || []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.sloty} slotów, {Number(t.godzin).toFixed(0)} h)</option>)}
            </select></div>
          <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Pierwszy tydzień (poniedziałek)</label>
            <input type="date" value={startTyg} onChange={(e) => { const d = new Date(e.target.value); const pon = new Date(d); pon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setStartTyg(ymd(pon)); }} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
          <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Długość cyklu</label>
            <select value={ileTyg} onChange={(e) => setIleTyg(+e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>{[1, 2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'tydzień' : 'tygodnie/tygodni'}</option>)}</select></div>
        </div>

        {det && (
          <div className="space-y-2">
            <p className="text-xs font-semibold" style={{ color: colors.primary.dark }}>Obsada cyklu (puste pole = slot pominięty):</p>
            {det.sloty.map((sl) => (
              <div key={sl.id} className="grid grid-cols-[1fr_1fr] gap-3 items-center px-3 py-2 rounded-lg" style={{ backgroundColor: colors.primary.bgLight }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: colors.primary.darkest }}>{sl.label}</p>
                  <p className="text-[11px]" style={{ color: colors.primary.light }}>{sl.shifts.length} zmian/tydz. · {sl.shifts.reduce((a, x) => a + x.hours, 0).toFixed(0)} h · {sl.shifts.map((x) => `${D3[(x.dow + 6) % 7]} ${x.start}`).join(', ')}</p>
                </div>
                <input list="sc-lista-kont" value={przyp[sl.id] || ''} onChange={(e) => setPrzyp((pv) => ({ ...pv, [sl.id]: e.target.value }))} placeholder={`ostatnio: ${sl.hint || '—'}`} className="px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: colors.primary.bg }} />
              </div>
            ))}
            <datalist id="sc-lista-kont">{(data.accounts || []).map((a) => <option key={a.id} value={a.grafikName || a.name}>{a.name}</option>)}</datalist>
            <div className="flex items-center gap-3 pt-1">
              <button disabled={robi} onClick={uruchom} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: colors.primary.medium }}>{robi ? 'Układam cykl…' : `Zastosuj cykl na ${ileTyg} tyg.`}</button>
              <span className="text-xs" style={{ color: colors.primary.light }}>Tygodnie: {Array.from({ length: ileTyg }, (_, i) => { const d = new Date(startTyg); d.setDate(d.getDate() + i * 7); return `${ymd(d).slice(8)}.${ymd(d).slice(5, 7)}`; }).join(' · ')}</span>
            </div>
            {wynik && <p className="text-sm font-medium" style={{ color: '#5A3542' }}>✓ Cykl ułożony: {wynik.ok}/{ileTyg} tygodni od {wynik.start}. Sprawdź w Schedule.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

// ===================== SZABLONY TYGODNIOWE (Plantillas de Turnos Semanales) =====================
// ── wspólne dla Blueprints/ShiftCycles ──
const BP_KATEGORIA = (st) => { const x = String(st || '').toUpperCase();
  if (x === 'MANAGER' || x === 'MGR FUNKCYJNE') return 'Manager';
  if (['SMAŻENIE', 'PANIEROWANIE', 'PREP', 'FRYTKI', 'ZMYWAK'].includes(x)) return 'Kuchnia';
  if (['KANAPKI / WRAPY', 'DESERY / NAPOJE', 'KONTROLER', 'PHU', 'WSPARCIE WIECZORNE / FLEX', 'SZKOLENIA', 'TRAINING'].includes(x)) return 'Front';
  if (['DISPATCHER', 'DOSTAWA'].includes(x)) return 'Dispatch';
  return 'Inne'; };
const BP_KAT_KOLEJNOSC = ['Manager', 'Kuchnia', 'Front', 'Dispatch', 'Inne'];
const bpDowKol = [1, 2, 3, 4, 5, 6, 0];
const bpDni3 = ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'];
// pokrycie szablonu vs krzywa obsady (48 slotów/dzień) → średni %
function bpPeakCoverage(sloty) {
  let suma = 0, n = 0;
  for (const dow of bpDowKol) {
    const { dir, ind } = optRozbicie(0, 420, 3, 'krzywa', dow);
    const req = dir.map((v, i) => Math.max(v, ind[i]));
    const sch = new Array(req.length).fill(0);
    sloty.forEach((sl) => sl.shifts.filter((sh) => sh.dow === dow).forEach((sh) => { const a = Math.max(0, Math.round((sh.start ? (parseInt(sh.start) - 6 + 24) % 24 : 0) * 2)); const [h1, m1] = String(sh.start || '6:0').split(':').map(Number); const [h2, m2] = String(sh.end || '6:0').split(':').map(Number); let x = ((h1 - 6 + 24) % 24) * 2 + (m1 >= 30 ? 1 : 0), y = ((h2 - 6 + 24) % 24) * 2 + (m2 >= 30 ? 1 : 0); if (y <= x) y += 48; for (let i = x; i < Math.min(y, 48); i++) sch[i]++; }));
    req.forEach((r2, i) => { if (r2 > 0) { suma += Math.min(sch[i] / r2, 1); n++; } });
  }
  return n ? Math.round(suma / n * 100) : 100;
}
const bpEtykietaPory = (start) => { const h = parseInt(start); return h < 10 ? 'Opening' : h < 14 ? 'Lunch' : h < 17 ? 'Mid' : 'Closing'; };

// ═════════ WORKRHYTHM · BLUEPRINTS — szablony tygodniowe wg wzorca ═════════
const BlueprintyWzor = ({ data, weeks, naGrafik }) => {
  const [selId, setSelId] = useState('');
  const [det, setDet] = useState(null);
  const [tplName, setTplName] = useState('');
  const [saveFor, setSaveFor] = useState(weeks.length ? weeks[weeks.length - 1].start : '');
  const [saving, setSaving] = useState(false);
  const [applyT, setApplyT] = useState(null);
  const [applyWeek, setApplyWeek] = useState('');
  const [przyp, setPrzyp] = useState({});
  const [applying, setApplying] = useState(false);
  const lista = data.templates || [];
  useEffect(() => { if (!selId && lista.length) setSelId(lista[0].id); }, [lista.length]);
  useEffect(() => { if (!selId) { setDet(null); return; } let ok = true; data.templateDetail(selId).then((t) => { if (ok) setDet(t); }); return () => { ok = false; }; }, [selId]);
  const nastepnyPon = () => { const d = new Date(); const off = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + off); return ymd(d); };
  const otworzApply = () => { if (!det) return; setApplyT(det); setApplyWeek(nastepnyPon()); const p = {}; det.sloty.forEach((sl) => { p[sl.id] = sl.hint || ''; }); setPrzyp(p); };
  const wyslijApply = async () => {
    const przypisania = {};
    Object.entries(przyp).forEach(([k, v]) => { if (String(v).trim()) { const konto = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((n) => String(n).toUpperCase().trim() === String(v).trim().toUpperCase())); przypisania[k] = { name: String(v).trim(), accountId: konto ? konto.id : undefined }; } });
    setApplying(true);
    const ok = await data.applyTemplate(applyT.id, applyWeek, przypisania);
    setApplying(false);
    if (ok) setApplyT(null);
  };
  const przelaczFav = async (t) => { const r = await api('/templates?action=fav', 'POST', { id: t.id }); if (r.success) data.sync(); };
  const duplikuj = async (t) => { const r = await api('/templates?action=duplicate', 'POST', { id: t.id }); if (r.success) { data.show(`Utworzono kopię: ${r.template.name}`); data.sync(); } else data.show(r.error || 'Błąd', 'error'); };
  const usun = async (t) => { if (confirm(`Usunąć szablon „${t.name}"?`)) await data.deleteTemplate(t.id); };
  const zapisz = async () => { if (!tplName.trim() || !saveFor) return data.show('Podaj nazwę i tydzień źródłowy', 'error'); setSaving(true); const ok = await data.saveTemplate(saveFor, tplName.trim(), ''); setSaving(false); if (ok) setTplName(''); };
  const sel = lista.find((t) => t.id === selId);
  const maxDniH = det ? Math.max(1, ...(sel ? sel.dniH || [] : [])) : 1;
  // agregacje szczegółu
  const zmianKat = useMemo(() => {
    if (!det) return {};
    const m = {};
    det.sloty.forEach((sl) => sl.shifts.forEach((sh) => { const k = `${BP_KATEGORIA(sh.station)}|${sh.dow}`; m[k] = (m[k] || 0) + 1; }));
    return m;
  }, [det]);
  const otwarteDni = useMemo(() => { const m = {}; if (det) det.sloty.filter((sl) => !sl.hintAccountId).forEach((sl) => sl.shifts.forEach((sh) => { m[sh.dow] = (m[sh.dow] || 0) + 1; })); return m; }, [det]);
  const statSum = det ? det.sloty.reduce((a, sl) => a + sl.shifts.reduce((x, y) => x + y.hours, 0), 0) : 0;
  const statPrzerwy = det ? det.sloty.reduce((a, sl) => a + sl.shifts.filter((sh) => sh.hours >= 6).length, 0) : 0;
  const statOtwarte = det ? det.sloty.filter((sl) => !sl.hintAccountId).length : 0;
  const peak = useMemo(() => det ? bpPeakCoverage(det.sloty) : null, [det]);
  return (
    <div>
      <div className="module-heading">
        <div>
          <span>WORKFORCE • MATRYCE ZMIAN</span>
          <h1>Blueprints</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.primary.light }}>Gotowe układy zmian, godzin i obsady do wielokrotnego użycia.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={naGrafik} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold flex items-center gap-2" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}><Calendar size={15} /> Wróć do grafiku</button>
          <button onClick={otworzApply} disabled={!det} className="px-4 h-10 rounded-xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: colors.primary.darkest }}><Check size={15} /> Zastosuj do tygodnia</button>
        </div>
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)' }}>
        {/* biblioteka */}
        <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E3DCDD' }}>
          <div className="flex items-center justify-between mb-1"><p className="text-[15px] font-bold" style={{ color: colors.primary.darkest }}>Biblioteka Blueprints</p></div>
          <p className="text-[11px] mb-3" style={{ color: colors.primary.light }}>{lista.length} szablonów · pełne tygodnie</p>
          <div className="space-y-3">
            {[...lista].sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0)).map((t) => (
              <button key={t.id} onClick={() => setSelId(t.id)} className="w-full text-left rounded-2xl border p-3.5 transition-shadow hover:shadow-sm" style={{ borderColor: selId === t.id ? colors.primary.medium : '#e8edef', boxShadow: selId === t.id ? '0 0 0 1px ' + colors.primary.medium : 'none' }}>
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="w-9 h-9 rounded-xl border-2 border-dashed flex items-center justify-center shrink-0" style={{ borderColor: '#C7B4BB', color: colors.primary.medium }}><LayoutGrid size={16} /></span>
                  <div className="min-w-0 flex-1"><p className="text-[13.5px] font-bold truncate" style={{ color: colors.primary.darkest }}>{t.name}</p><p className="text-[10.5px] truncate" style={{ color: colors.primary.light }}>{t.notes || (t.fav ? 'Ulubiony' : `${t.sloty} slotów`)}</p></div>
                  {t.fav && <span title="Ulubiony" style={{ color: '#741334' }}>★</span>}
                </div>
                <div className="flex items-end gap-1.5 mb-2" style={{ height: 44 }}>
                  {bpDowKol.map((dw) => <div key={dw} className="flex-1 flex flex-col items-center gap-1"><div className="w-full rounded-md" style={{ height: `${Math.max(8, ((t.dniH || [])[dw] || 0) / Math.max(1, ...(t.dniH || [1])) * 36)}px`, backgroundColor: '#B86D82' }} /><span className="text-[8.5px]" style={{ color: colors.primary.light }}>{bpDni3[dw].slice(0, 2)}</span></div>)}
                </div>
                <div className="flex items-center gap-4 pt-2 border-t text-[11px]" style={{ borderColor: '#EDE3E6', color: colors.primary.dark }}>
                  <span className="flex items-center gap-1"><Clock size={11} /> {Number(t.godzin).toFixed(1).replace('.', ',')} h</span>
                  <span className="flex items-center gap-1"><Users size={11} /> {t.sloty} osób</span>
                  <ChevronRight size={13} className="ml-auto" style={{ color: colors.primary.light }} />
                </div>
              </button>
            ))}
            {!lista.length && <p className="text-sm text-center py-4" style={{ color: colors.primary.light }}>Brak szablonów — zapisz pierwszy poniżej.</p>}
          </div>
          <div className="mt-4 rounded-2xl border-2 border-dashed p-4" style={{ borderColor: '#d5dde0' }}>
            <p className="text-[13px] font-bold flex items-center gap-2" style={{ color: colors.primary.darkest }}><Plus size={15} /> Zapisz aktualny grafik jako Blueprint</p>
            <p className="text-[11px] mt-0.5 mb-3" style={{ color: colors.primary.light }}>Zachowaj obsadę, godziny, pozycje i przerwy.</p>
            <select value={saveFor} onChange={(e) => setSaveFor(e.target.value)} className="w-full mb-2 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>
              {weeks.map((w) => { const e2 = new Date(w.start); e2.setDate(e2.getDate() + 6); return <option key={w.start} value={w.start}>{w.start.slice(8)}.{w.start.slice(5, 7)} – {ymd(e2).slice(8)}.{ymd(e2).slice(5, 7)}.{w.start.slice(0, 4)}</option>; })}
            </select>
            <div className="flex gap-2">
              <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Nazwa nowego szablonu" className="flex-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} />
              <button disabled={saving} onClick={zapisz} className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: colors.primary.darkest }}>Zapisz</button>
            </div>
          </div>
        </div>
        {/* szczegół */}
        <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E3DCDD' }}>
          {det && sel ? (<>
            <div className="px-5 py-4 flex items-center gap-3 border-b" style={{ borderColor: '#EDE3E6' }}>
              <span className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}><FileSpreadsheet size={19} /></span>
              <div><p className="text-[16px] font-bold" style={{ color: colors.primary.darkest }}>{det.name}</p><p className="text-[11.5px]" style={{ color: colors.primary.light }}>{Number(statSum).toFixed(1).replace('.', ',')} h · {det.sloty.length} osób{det.zrodloTydzien ? ` · źródło: tydzień ${det.zrodloTydzien}` : ''}</p></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 760 }}>
                <thead><tr className="border-b" style={{ borderColor: '#EDE3E6', backgroundColor: '#F7F1F3' }}>
                  <th className="text-left px-4 py-2.5 text-[10.5px] font-extrabold" style={{ color: colors.primary.light }}></th>
                  {bpDowKol.map((dw) => <th key={dw} className="px-2 py-2.5 text-center"><p className="text-[12px] font-bold" style={{ color: colors.primary.darkest }}>{bpDni3[dw]}</p></th>)}
                </tr></thead>
                <tbody>
                  {BP_KAT_KOLEJNOSC.filter((kat) => bpDowKol.some((dw) => zmianKat[`${kat}|${dw}`])).map((kat) => (
                    <tr key={kat} className="border-b" style={{ borderColor: '#F7F5F5' }}>
                      <td className="px-4 py-3 text-[11px] font-bold whitespace-nowrap" style={{ color: colors.primary.dark }}>{kat}</td>
                      {bpDowKol.map((dw) => { const n = zmianKat[`${kat}|${dw}`] || 0; return <td key={dw} className="px-2 py-3 text-center">{n ? <span className="inline-block px-3 py-1.5 rounded-lg text-[11px] font-semibold" style={{ backgroundColor: '#e6efec', color: colors.primary.dark }}>{n} zmian</span> : <span className="text-slate-300">—</span>}</td>; })}
                    </tr>
                  ))}
                  {Object.keys(otwarteDni).length > 0 && (
                    <tr className="border-b" style={{ borderColor: '#F7F5F5' }}>
                      <td className="px-4 py-3 text-[11px] font-bold whitespace-nowrap" style={{ color: '#A7465F' }}>Open Shift</td>
                      {bpDowKol.map((dw) => { const n = otwarteDni[dw] || 0; return <td key={dw} className="px-2 py-3 text-center">{n ? <span className="inline-block px-3 py-1.5 rounded-lg text-[11px] font-semibold border-2 border-dashed" style={{ borderColor: '#C7A9B3', color: '#A7465F' }}>{n} open</span> : <span className="text-slate-300">—</span>}</td>; })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-4 border-t" style={{ borderColor: '#EDE3E6' }}>
              {[['Planowane godziny', `${Number(statSum).toFixed(1).replace('.', ',')} h`], ['Peak coverage', peak != null ? `${peak}%` : '—'], ['Przerwy (należne)', statPrzerwy], ['Otwarte zmiany', statOtwarte]].map(([l, v], i) => (
                <div key={i} className="px-4 py-3 text-center border-r last:border-0" style={{ borderColor: '#EDE3E6' }}><p className="text-[10px] font-semibold" style={{ color: colors.primary.light }}>{l}</p><p className="text-[17px] font-bold" style={{ color: colors.primary.darkest }}>{v}</p></div>
              ))}
            </div>
            <div className="px-5 py-3 flex flex-wrap justify-end gap-2 border-t" style={{ borderColor: '#EDE3E6' }}>
              <button onClick={() => przelaczFav(sel)} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold" style={{ borderColor: '#E3DCDD', color: '#741334' }}>{sel.fav ? '★ Usuń z ulubionych' : '☆ Dodaj do ulubionych'}</button>
              <button onClick={() => duplikuj(sel)} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}>Duplikuj</button>
              <button onClick={() => usun(sel)} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold" style={{ borderColor: '#E0B9C4', color: '#B94352' }}>Usuń</button>
              <button onClick={otworzApply} className="px-5 h-10 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: colors.primary.darkest }}>Zastosuj</button>
            </div>
          </>) : <div className="p-10 text-center text-sm" style={{ color: colors.primary.light }}>{lista.length ? 'Wybierz szablon z biblioteki.' : 'Zapisz pierwszy Blueprint z istniejącego tygodnia grafiku.'}</div>}
        </div>
      </div>
      {/* modal zastosowania */}
      {applyT && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setApplyT(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1"><h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>Zastosuj „{applyT.name}"</h3><button onClick={() => setApplyT(null)}><X size={20} className="text-slate-400" /></button></div>
            <p className="text-xs mb-4" style={{ color: colors.primary.light }}>Przypisz osoby do slotów (puste pole = slot pominięty). Zmiany trafią do grafiku.</p>
            <div className="flex items-center gap-3 mb-4">
              <label className="text-sm font-semibold" style={{ color: colors.primary.dark }}>Tydzień docelowy (pon.):</label>
              <input type="date" value={applyWeek} onChange={(e) => { const d = new Date(e.target.value); const pon = new Date(d); pon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setApplyWeek(ymd(pon)); }} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} />
            </div>
            <div className="grid md:grid-cols-2 gap-2 mb-5">
              {applyT.sloty.map((sl) => (
                <div key={sl.id} className="rounded-xl border p-2.5" style={{ borderColor: '#EDE3E6' }}>
                  <p className="text-[11px] font-bold mb-1" style={{ color: colors.primary.dark }}>{sl.label} <span className="font-normal" style={{ color: colors.primary.light }}>· {sl.shifts.length} zmian · {sl.shifts.reduce((a, x) => a + x.hours, 0).toFixed(0)} h</span></p>
                  <input list="bp-konta" value={przyp[sl.id] || ''} onChange={(e) => setPrzyp((p2) => ({ ...p2, [sl.id]: e.target.value }))} placeholder={sl.hint ? `ostatnio: ${sl.hint}` : 'nazwisko…'} className="w-full px-2.5 py-1.5 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} />
                </div>
              ))}
              <datalist id="bp-konta">{(data.accounts || []).map((a) => <option key={a.id} value={a.grafikName || a.name}>{a.name}</option>)}</datalist>
            </div>
            <div className="flex justify-end gap-2"><button onClick={() => setApplyT(null)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Anuluj</button><button disabled={applying} onClick={wyslijApply} className="px-5 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: colors.primary.darkest }}>{applying ? 'Stosuję…' : 'Zastosuj do tygodnia'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
};

const WTTemplates = ({ data, weeks }) => {
  const [saveFor, setSaveFor] = useState(weeks.length ? weeks[weeks.length - 1].start : '');
  const [tplName, setTplName] = useState('');
  const [tplNotes, setTplNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [applyT, setApplyT] = useState(null);       // pełny szablon do przypisania
  const [applyWeek, setApplyWeek] = useState('');
  const [przyp, setPrzyp] = useState({});           // slotId -> nazwa
  const [applying, setApplying] = useState(false);

  const nastepnyPon = () => { const d = new Date(); const off = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + off); return ymd(d); };
  const otworzApply = async (t) => {
    const det = await data.templateDetail(t.id);
    if (!det) return;
    setApplyT(det); setApplyWeek(nastepnyPon());
    const p = {}; det.sloty.forEach((sl) => { p[sl.id] = sl.hint || ''; }); setPrzyp(p);
  };
  const wyslij = async () => {
    if (!applyT) return;
    const przypisania = {};
    Object.entries(przyp).forEach(([k, v]) => { if (String(v).trim()) { const konto = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((n) => String(n).toUpperCase().trim() === String(v).trim().toUpperCase())); przypisania[k] = { name: String(v).trim(), accountId: konto ? konto.id : undefined }; } });
    setApplying(true);
    const ok = await data.applyTemplate(applyT.id, applyWeek, przypisania);
    setApplying(false);
    if (ok) setApplyT(null);
  };

  return (
    <div className="mt-3 bg-white rounded-xl shadow-sm border" style={{ borderColor: colors.primary.bg }}>
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: colors.primary.darkest }}>
        <span className="text-sm font-semibold text-white">Szablony tygodniowe (Plantillas)</span>
        <span className="text-xs text-white/70">zapisz wzorcowy tydzień i nakładaj go na kolejne</span>
      </div>
      <div className="p-4 space-y-4">
        {(data.templates || []).length > 0 && (
          <div className="space-y-1.5">
            {data.templates.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg" style={{ backgroundColor: colors.primary.bgLight }}>
                <span className="font-semibold text-sm" style={{ color: colors.primary.darkest }}>{t.name}</span>
                {t.notes && <span className="text-xs" style={{ color: colors.primary.light }}>{t.notes}</span>}
                <span className="text-xs" style={{ color: colors.primary.light }}>{t.sloty} slotów · {t.zmian} zmian · {Number(t.godzin).toFixed(0)} h/tydz.</span>
                <span className="ml-auto flex gap-2">
                  <button onClick={() => otworzApply(t)} className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white" style={{ backgroundColor: colors.primary.medium }}>Zastosuj</button>
                  <button onClick={() => window.confirm(`Usunąć szablon „${t.name}"?`) && data.deleteTemplate(t.id)} className="text-xs px-2 py-1.5 rounded-lg" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>Usuń</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 pt-1 border-t" style={{ borderColor: '#EDE3E6' }}>
          <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Tydzień źródłowy</label>
            <select value={saveFor} onChange={(e) => setSaveFor(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>
              {weeks.map((w) => { const e2 = new Date(w.start); e2.setDate(e2.getDate() + 6); return <option key={w.start} value={w.start}>{w.start.slice(8)}.{w.start.slice(5, 7)} – {ymd(e2).slice(8)}.{ymd(e2).slice(5, 7)}</option>; })}
            </select></div>
          <div className="flex-1 min-w-[160px]"><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Nazwa szablonu</label>
            <input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="np. Tydzień standardowy" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
          <div className="flex-1 min-w-[160px]"><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Uwagi (opcjonalnie)</label>
            <input value={tplNotes} onChange={(e) => setTplNotes(e.target.value)} placeholder="np. obsada wakacyjna" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
          <button disabled={saving || !tplName.trim() || !saveFor} onClick={async () => { setSaving(true); const ok = await data.saveTemplate(saveFor, tplName.trim(), tplNotes.trim()); setSaving(false); if (ok) { setTplName(''); setTplNotes(''); } }}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: colors.primary.medium }}>{saving ? 'Zapisuję…' : 'Zapisz tydzień jako szablon'}</button>
        </div>
      </div>

      {applyT && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,.45)' }} onClick={() => !applying && setApplyT(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold" style={{ color: colors.primary.darkest }}>Zastosuj szablon — {applyT.name}</h3>
              <button onClick={() => setApplyT(null)} className="text-slate-400"><X size={18} /></button>
            </div>
            <p className="text-sm mb-4" style={{ color: colors.primary.light }}>Przypisz osoby do slotów (puste pole = slot pominięty). Zmiany trafią do grafiku i wykonania.</p>
            <div className="mb-4"><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Tydzień docelowy (poniedziałek)</label>
              <input type="date" value={applyWeek} onChange={(e) => { const d = new Date(e.target.value); const pon = new Date(d); pon.setDate(d.getDate() - ((d.getDay() + 6) % 7)); setApplyWeek(ymd(pon)); }} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
            <div className="space-y-2">
              {applyT.sloty.map((sl) => (
                <div key={sl.id} className="grid grid-cols-[1fr_1fr] gap-3 items-center px-3 py-2 rounded-lg" style={{ backgroundColor: colors.primary.bgLight }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: colors.primary.darkest }}>{sl.label}</p>
                    <p className="text-[11px]" style={{ color: colors.primary.light }}>{sl.shifts.length} zmian · {sl.shifts.reduce((a, x) => a + x.hours, 0).toFixed(0)} h · {sl.shifts.map((x) => `${D3[(x.dow + 6) % 7]} ${x.start}`).join(', ')}</p>
                  </div>
                  <input list="tpl-lista-kont" value={przyp[sl.id] || ''} onChange={(e) => setPrzyp((p) => ({ ...p, [sl.id]: e.target.value }))} placeholder={`ostatnio: ${sl.hint || '—'}`} className="px-3 py-2 rounded-lg border text-sm font-mono" style={{ borderColor: colors.primary.bg }} />
                </div>
              ))}
              <datalist id="tpl-lista-kont">{(data.accounts || []).map((a) => <option key={a.id} value={a.grafikName || a.name}>{a.name}</option>)}</datalist>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button disabled={applying} onClick={() => setApplyT(null)} className="px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Anuluj</button>
              <button disabled={applying} onClick={wyslij} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: colors.primary.medium }}>{applying ? 'Stosuję…' : 'Zastosuj szablon'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// Wspólne scalanie par praca+instruktor (doba operacyjna 06→06)
const scalParyPlan = (arr) => {
  const zwykle = [], instr = [];
  arr.forEach((x) => (jestInstruktor(x) ? instr : zwykle).push(x));
  const out = zwykle.map((x) => ({ ...x }));
  instr.forEach((i) => {
    // FIX: wiersz instruktorski łączy się wyłącznie ze zmianą TEJ SAMEJ osoby
    // (wcześniej: tylko data+nakładanie godzin — przy dwóch szkoleniach dnia pary się mieszały)
    const taOsoba = (x) => (i.accountId && x.accountId) ? x.accountId === i.accountId : String(x.name).toUpperCase().trim() === String(i.name).toUpperCase().trim();
    const para = out.find((x) => taOsoba(x) && x.date === i.date && plnMin(x.start) < plnMin(i.end) + (plnMin(i.end) <= plnMin(i.start) ? 1440 : 0) && plnMin(i.start) < plnMin(x.end) + (plnMin(x.end) <= plnMin(x.start) ? 1440 : 0));
    if (para) { para.szkoli = true; para.partnerSzk = i.partner || i.uczen || null; para.paraInstr = { date: i.date, name: i.name, start: i.start, end: i.end }; }
    else out.push({ ...i, szkoli: true });
  });
  return out;
};
// Szacunkowy koszt godzin wg konta (UZ: stawka/h; UOP: wynagrodzenie mies. / 160 h)
const kosztGodzin = (konto, h) => !konto ? 0 : (konto.umowa === 'UOP' ? (konto.stawka / 160) * h : konto.stawka * h);


// ===================== PLANOWANIE: OPTYMALIZACJA + BUDŻET w jednym module =====================
// ═════════ Planowanie obsady — integracja: prognoza (/forecast) → popyt 15 min (silnik 48/96)
// → obsada z grafiku → KPI/koszty kont → heatmapa i Gantt → Smart Scheduler → publikacja ═════════
const POB_MIN = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const pobOp = (t) => { let x = POB_MIN(t) - 360; if (x < 0) x += 1440; return x; };
const pobHH = (min) => { const m = ((min + 360) % 1440 + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const pobH1 = (v) => `${(Math.round(v * 10) / 10).toFixed(1).replace('.', ',')} h`;
const pobTydzien = (d) => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dn = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - dn + 3); const p1 = new Date(Date.UTC(x.getUTCFullYear(), 0, 4)); return 1 + Math.round(((x - p1) / 86400000 - 3 + ((p1.getUTCDay() + 6) % 7)) / 7); };

const PlanObsada = ({ data, setPage }) => {
  const dzisIso = ymd(new Date());
  const [weekStart, setWeekStart] = useState(wtMonday(dzisIso));
  const [day, setDay] = useState(dzisIso);
  const [scenariusz, setScenariusz] = useState('bazowy');
  const [fcDni, setFcDni] = useState({});
  const [pubInfo, setPubInfo] = useState({});
  const [porownaj, setPorownaj] = useState(false);
  const [slotSel, setSlotSel] = useState(null);
  const [rekomOn, setRekomOn] = useState(true);
  const [propozycje, setPropozycje] = useState(null);
  const [modal, setModal] = useState(null);          // { date, start, end, station, osoba }
  const [dyspo, setDyspo] = useState([]);
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return ymd(d); }), [weekStart]);
  useEffect(() => { if (!days.includes(day)) setDay(days.includes(dzisIso) ? dzisIso : days[0]); }, [weekStart]);

  // dane zewnętrzne modułu: prognoza sprzedaży, stan publikacji, zatwierdzone dyspozycje
  useEffect(() => {
    api(`/forecast?from=${weekStart}&days=7`).then((r) => { if (r && r.success) { const m = {}; (r.days || []).forEach((x) => { m[x.date] = x.forecast; }); setFcDni(m); } }).catch(() => {});
    api('/availability?reqs=1').then((r) => { if (r && r.success) setDyspo((r.requests || []).filter((x) => x.status === 'approved')); }).catch(() => {});
  }, [weekStart]);
  const mieszki = useMemo(() => [...new Set(days.map((d) => d.slice(0, 7)))], [days]);
  const zaladujPub = useCallback(() => { mieszki.forEach((ym) => { api(`/schedule?action=pubinfo&pubmonth=${ym}`).then((r) => { if (r && r.success) setPubInfo((x) => ({ ...x, [ym]: r })); }).catch(() => {}); }); }, [mieszki]);
  useEffect(zaladujPub, [zaladujPub]);

  const params = (data.salesData && data.salesData.params) || {};
  const splh = params.splh || 420, podloga = params.podloga || 3;
  const mnoznik = scenariusz === 'oszczedny' ? 0.9 : scenariusz === 'bezpieczny' ? 1.1 : 1;

  // silnik dnia: wymagane (48→96) i zaplanowane (96) + podsumowanie slotowe
  const silnikDnia = useCallback((d) => {
    const dow = new Date(d + 'T12:00:00').getDay();
    const sprzedaz = fcDni[d] || 0;
    const tryb = sprzedaz > 0 ? 'silnik' : 'krzywa';
    const { dir, ind } = optRozbicie(sprzedaz, splh, podloga, tryb, dow);
    const req48 = dir.map((v, i) => Math.max(v, ind[i]) * mnoznik);
    const req96 = v4Up96(req48);
    const sch96 = new Float64Array(V4_NSLOT);
    const zmiany = data.shifts.filter((x) => x.date === d && !jestInstruktor(x));
    zmiany.forEach((x) => v4AddCoverage(sch96, x.start, x.end));
    return { req48, req96, sch96, zmiany, pods: v4Coverage(req96, sch96), tryb };
  }, [data.shifts, fcDni, splh, podloga, mnoznik]);

  const dniS = useMemo(() => { const m = {}; days.forEach((d) => { m[d] = silnikDnia(d); }); return m; }, [days, silnikDnia]);
  const D = dniS[day] || silnikDnia(day);

  // KPI tygodnia
  const kontoZm = (x) => (x.accountId && (data.accounts || []).find((a) => a.id === x.accountId)) || null;
  const kpi = useMemo(() => {
    let plan = 0, req = 0, exc = 0, def = 0, koszt = 0, sprzedaz = 0;
    days.forEach((d) => { const S = dniS[d]; if (!S) return; plan += S.zmiany.reduce((a, x) => a + godzZ(x), 0); req += S.pods.requiredH; exc += S.pods.excessH; def += S.pods.deficitH; S.zmiany.forEach((x) => { koszt += kosztGodzin(kontoZm(x), godzZ(x)); }); sprzedaz += fcDni[d] || 0; });
    const score = Math.max(5, Math.min(100, Math.round(100 - Math.min(45, def * 4) - Math.min(30, exc * 1.5))));
    return { plan, req, exc, def, koszt, sprzedaz, splhP: plan ? sprzedaz / plan : 0, colP: sprzedaz ? koszt / sprzedaz * 100 : 0, score };
  }, [days, dniS, fcDni, data.accounts]);

  // konflikty zmian z absencjami / dyspozycjami (zatwierdzonymi)
  const dyObow = (r, d) => r.date === d || (r.recurrence === 'weekly' && r.date <= d && (!r.repeatUntil || r.repeatUntil >= d) && new Date(r.date + 'T12:00:00').getDay() === new Date(d + 'T12:00:00').getDay());
  const konfliktZmiany = (x) => {
    if (!x.accountId) return null;
    const ab = (data.absences || []).find((a) => a.accountId === x.accountId && a.status === 'approved' && a.from <= x.date && x.date <= a.to);
    if (ab) return `absencja (${ab.type}) ${ab.from}–${ab.to}`;
    const dy = dyspo.find((r) => r.accountId === x.accountId && dyObow(r, x.date));
    if (dy) {
      if (dy.type === 'unavailable') return 'dyspozycja: nie może pracować';
      if (dy.type === 'from_time' && POB_MIN(x.start) < POB_MIN(dy.startTime)) return `dyspozycja: może od ${dy.startTime}`;
      if (dy.type === 'until_time' && POB_MIN(x.end) > POB_MIN(dy.endTime)) return `dyspozycja: może do ${dy.endTime}`;
      if (dy.type === 'specific_shift' && (POB_MIN(x.start) < POB_MIN(dy.startTime) || POB_MIN(x.end) > POB_MIN(dy.endTime))) return `dyspozycja: preferuje ${dy.startTime}–${dy.endTime}`;
    }
    return null;
  };

  // zakresy niedoboru/nadmiaru (na siatce 96)
  const zakresy = (warunek) => {
    const out = []; let a = -1;
    for (let i = 0; i < V4_NSLOT; i++) {
      const ok = warunek(D.pods.perSlot[i]);
      if (ok && a < 0) a = i;
      if ((!ok || i === V4_NSLOT - 1) && a >= 0) { const b = ok ? i + 1 : i; if (b - a >= 2) out.push({ od: a, do: b, h: D.pods.perSlot.slice(a, b).reduce((x, y) => x + (warunek === undefined ? 0 : Math.abs(y.req - y.sch)), 0) / 4 }); a = -1; }
    }
    return out;
  };
  const niedobory = useMemo(() => zakresy((sl2) => sl2.def > 0.4).sort((a, b) => b.h - a.h), [D]);
  const nadmiary = useMemo(() => zakresy((sl2) => sl2.req > 0 && sl2.exc > 0.6).sort((a, b) => b.h - a.h), [D]);
  const konflikty = useMemo(() => D.zmiany.map((x) => ({ x, k: konfliktZmiany(x) })).filter((z) => z.k), [D, dyspo, data.absences]);

  // optymalizator: dokładanie szablonów na rezydualny niedobór (istniejący silnik optKsztaltuj)
  const uruchomOptymalizator = () => {
    const rez = D.req48.map((v, i) => Math.max(0, v - (D.sch96[i * 2] + D.sch96[i * 2 + 1]) / 2));
    const wl = Object.fromEntries(SZAB.map((t) => [t.n, true]));
    const { out } = optKsztaltuj(rez, wl);
    setPropozycje(out.map((c) => ({ n: c.t.n, od: `${String(c.t.od % 24).padStart(2, '0')}:00`, do: `${String(c.t.do % 24).padStart(2, '0')}:00`, h: c.t.do - c.t.od })));
  };

  // publikacja + status
  const wszystkieOpublikowane = mieszki.every((ym) => pubInfo[ym] && pubInfo[ym].opublikowany && pubInfo[ym].roznice && pubInfo[ym].roznice.razem === 0);
  const opublikuj = async () => {
    if (!confirm(`Opublikować grafik (${mieszki.join(', ')})? Pracownicy zobaczą nową wersję, potwierdzenia wyzerują się.`)) return;
    setBusy(true);
    for (const ym of mieszki) { const r = await api('/schedule?action=publish', 'POST', { month: ym }); if (r.success) data.show(`Opublikowano ${ym} — wersja ${r.wersjaPub}`); else if (!String(r.error || '').includes('żadnych zmian')) data.show(r.error || 'Błąd publikacji', 'error'); }
    setBusy(false); zaladujPub();
  };

  // gantt: wiersze per osoba
  const wiersze = useMemo(() => {
    const m = new Map();
    D.zmiany.forEach((x) => { const k = kontoZm(x); const id = x.accountId || `n:${x.name}`; if (!m.has(id)) m.set(id, { id, name: (k && k.name) || x.name, rola: (k && k.funkcja) || '—', zm: [] }); m.get(id).zm.push(x); });
    return [...m.values()].sort((a, b) => POB_MIN(a.zm[0].start) - POB_MIN(b.zm[0].start) || a.name.localeCompare(b.name, 'pl'));
  }, [D]);
  const otwarte = niedobory.slice(0, 3).map((z) => ({ od: pobHH(z.od * 15), do: pobHH(z.do * 15), h: (z.do - z.od) / 4 }));

  const zapiszModal = async () => {
    if (!modal || !modal.osoba || !modal.osoba.trim()) return data.show('Podaj pracownika', 'error');
    const konto = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((n) => String(n).toUpperCase().trim() === modal.osoba.trim().toUpperCase()));
    setBusy(true);
    const ok = await data.addShiftManual({ date: modal.date, name: modal.osoba.trim(), station: modal.station, start: modal.start, end: modal.end, accountId: konto ? konto.id : undefined });
    setBusy(false); if (ok) setModal(null);
  };
  const skroc = async (z) => {
    const nowyKoniec = pobHH(z.zakres.od * 15);
    if (!confirm(`Skrócić zmianę ${z.osoba} do ${nowyKoniec}? (nadmiar ${pobH1(z.zakres.h)})`)) return;
    await data.updateShiftManual({ sid: z.x.sid, date: z.x.date, name: z.x.name, start: z.x.start, end: z.x.end }, { end: nowyKoniec });
  };
  // dopasuj zmianę do skrócenia: kończy się wewnątrz największego nadmiaru
  const doSkrocenia = useMemo(() => {
    for (const zak of nadmiary) {
      const kand = D.zmiany.filter((x) => { const e = pobOp(x.end) / 15; return e > zak.od && e <= zak.do + 1 && (pobOp(x.end) - pobOp(x.start)) / 60 - (zak.do - zak.od) / 4 >= 3; })
        .sort((a, b) => pobOp(b.end) - pobOp(a.end))[0];
      if (kand) { const k = kontoZm(kand); return { x: kand, osoba: (k && k.name) || kand.name, zakres: zak }; }
    }
    return null;
  }, [nadmiary, D]);

  const stacje = useMemo(() => [...new Set(['MANAGER', 'MGR FUNKCYJNE', ...data.shifts.map((x) => x.station)])].filter(Boolean), [data.shifts]);
  const maxY = Math.max(4, ...D.req96, ...D.sch96);
  const dayLabel = (d) => { const dt = new Date(d + 'T12:00:00'); return { dn: ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'][dt.getDay()], nr: `${dt.getDate()} ${['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'][dt.getMonth()]}` }; };
  const KPI_KARTA = ({ label, val, sub, kol }) => (
    <div className="bg-white rounded-2xl border p-4 min-w-0" style={{ borderColor: '#E3DCDD' }}>
      <p className="text-[11px] font-semibold" style={{ color: colors.primary.light }}>{label}</p>
      <p className="text-[22px] font-bold mt-1 leading-none" style={{ color: kol || colors.primary.darkest }}>{val}</p>
      <p className="text-[10.5px] mt-1.5 truncate" style={{ color: '#71656A' }}>{sub}</p>
    </div>
  );
  const tydzienLabel = `${days[0].slice(8)}–${days[6].slice(8)} ${['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'][new Date(days[6] + 'T12:00:00').getMonth()]} ${days[6].slice(0, 4)}`;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-8" style={{ backgroundColor: '#F7F5F5' }}>
      {/* nagłówek */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <p className="text-[11px] font-extrabold tracking-[0.14em]" style={{ color: '#741334' }}>WORKRHYTHM PLANNING · TYDZIEŃ {pobTydzien(new Date(weekStart))}</p>
          <h1 className="text-[30px] font-bold mt-1" style={{ color: colors.primary.darkest, letterSpacing: '-.03em' }}>Planowanie obsady</h1>
          <p className="text-sm mt-0.5" style={{ color: colors.primary.light }}>Układaj grafik w oparciu o popyt, kompetencje i koszt pracy.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage('import')} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold flex items-center gap-2" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}><Upload size={15} /> Importuj</button>
          <button onClick={() => setPorownaj((v) => !v)} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold flex items-center gap-2" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}><RefreshCw size={15} /> Porównaj</button>
          <button onClick={opublikuj} disabled={busy} className="px-4 h-10 rounded-xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: colors.primary.darkest }}><CheckCircle2 size={15} /> Opublikuj grafik</button>
        </div>
      </div>

      {/* pasek tygodnia + scenariusz */}
      <div className="bg-white rounded-2xl border px-4 py-3 mb-4 flex flex-wrap items-center gap-3" style={{ borderColor: '#E3DCDD' }}>
        <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(ymd(d)); }} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: '#E3DCDD' }}><ChevronLeft size={16} /></button>
        <span className="flex items-center gap-2 text-[15px] font-bold" style={{ color: colors.primary.darkest }}><Calendar size={16} style={{ color: colors.primary.medium }} /> {tydzienLabel}</span>
        <button onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(ymd(d)); }} className="w-9 h-9 rounded-full border flex items-center justify-center" style={{ borderColor: '#E3DCDD' }}><ChevronRight size={16} /></button>
        <button onClick={() => { setWeekStart(wtMonday(dzisIso)); setDay(dzisIso); }} className="px-3 h-9 rounded-xl border text-sm font-semibold" style={{ borderColor: '#E3DCDD', color: colors.primary.dark }}>Dzisiaj</button>
        <span className="ml-auto flex items-center gap-2 text-xs" style={{ color: colors.primary.light }}>
          Scenariusz
          <select value={scenariusz} onChange={(e) => setScenariusz(e.target.value)} className="px-3 h-9 rounded-xl border text-sm font-semibold" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}>
            <option value="bazowy">Bazowy · zbalansowany</option>
            <option value="oszczedny">Oszczędny · −10% popytu</option>
            <option value="bezpieczny">Bezpieczny · +10% popytu</option>
          </select>
          <span className="px-3 h-9 rounded-xl border text-xs font-bold flex items-center gap-1.5" style={{ borderColor: '#E3DCDD', color: wszystkieOpublikowane ? '#741334' : '#A7465F', backgroundColor: wszystkieOpublikowane ? '#F1E4E8' : '#fff6e4' }}>
            <i className="w-2 h-2 rounded-full" style={{ backgroundColor: wszystkieOpublikowane ? '#741334' : '#B86D82' }} />{wszystkieOpublikowane ? 'Published' : 'Preliminary'}
          </span>
        </span>
      </div>
      {porownaj && (
        <div className="bg-white rounded-2xl border px-4 py-3 mb-4 text-sm flex flex-wrap gap-x-6 gap-y-1" style={{ borderColor: '#E3DCDD', color: colors.primary.dark }}>
          {mieszki.map((ym) => { const pi = pubInfo[ym]; return <span key={ym}><b>{ym}</b>: {pi ? (pi.opublikowany ? `v${pi.wersjaPub} · potwierdzenia ${(pi.potwierdzenia || []).length}/${pi.osobOczekiwane}${pi.roznice ? ` · zmiany od publikacji +${pi.roznice.dodane}/±${pi.roznice.zmienione}/−${pi.roznice.usuniete}` : ''}` : 'nieopublikowany') : '…'}</span>; })}
        </div>
      )}

      {/* KPI */}
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <KPI_KARTA label="Plan Hours" val={pobH1(kpi.plan)} sub={`${kpi.plan - kpi.req >= 0 ? '+' : ''}${pobH1(kpi.plan - kpi.req)} vs Required`} />
        <KPI_KARTA label="Required Hours" val={pobH1(kpi.req)} sub="prognoza slotowa" />
        <KPI_KARTA label="Excess" val={pobH1(kpi.exc)} sub={`${kpi.plan ? (kpi.exc / kpi.plan * 100).toFixed(1).replace('.', ',') : 0}% godzin`} kol="#A7465F" />
        <KPI_KARTA label="Deficit" val={pobH1(kpi.def)} sub={`${niedobory.length} krytyczne sloty (dzień)`} kol="#B94352" />
        <KPI_KARTA label="SPLH" val={kpi.splhP ? Math.round(kpi.splhP).toLocaleString('pl-PL') : '—'} sub={`cel ${splh}`} />
        <KPI_KARTA label="COL" val={kpi.colP ? `${kpi.colP.toFixed(1).replace('.', ',')}%` : '—'} sub="target ≤ 20%" kol={kpi.colP > 20 ? '#B94352' : '#741334'} />
        <KPI_KARTA label="Labor Cost" val={`${Math.round(kpi.koszt).toLocaleString('pl-PL')} zł`} sub="wg stawek kont" />
        <KPI_KARTA label="Schedule Score" val={kpi.score} sub={kpi.score >= 85 ? 'Dobry plan' : kpi.score >= 70 ? 'Do poprawy' : 'Wymaga zmian'} kol={kpi.score >= 85 ? '#741334' : kpi.score >= 70 ? '#A7465F' : '#B94352'} />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: rekomOn ? 'minmax(0, 1fr) 320px' : 'minmax(0, 1fr)' }}>
        <div className="min-w-0 space-y-4">
          {/* wykres Demand vs Coverage */}
          <div className="bg-white rounded-2xl border p-5" style={{ borderColor: '#E3DCDD' }}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <div><p className="text-[15px] font-bold" style={{ color: colors.primary.darkest }}>Demand vs Coverage</p><p className="text-[11px]" style={{ color: colors.primary.light }}>wymagana i zaplanowana obsada · interwał 15 min · {day} {D.tryb === 'krzywa' ? '· krzywa (brak prognozy sprzedaży)' : ''}</p></div>
              <span className="flex items-center gap-4 text-[11px]" style={{ color: colors.primary.dark }}>
                <span className="flex items-center gap-1.5"><i className="w-4 h-0.5" style={{ backgroundColor: '#5A3542' }} /> Required</span>
                <span className="flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed" style={{ borderColor: '#A7465F' }} /> Scheduled</span>
                <button onClick={() => setPage('optymalizacja')} className="px-3 h-8 rounded-lg border text-xs font-bold" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}>Parametry popytu</button>
              </span>
            </div>
            <svg viewBox="0 0 970 190" className="w-full" style={{ height: 180 }}>
              {[0, 0.5, 1].map((f) => <line key={f} x1="30" x2="960" y1={165 - f * 150} y2={165 - f * 150} stroke="#EDE3E6" />)}
              {[0, 0.5, 1].map((f) => <text key={f} x="24" y={168 - f * 150} fontSize="9" fill="#A38D95" textAnchor="end">{Math.round(maxY * f)}</text>)}
              <polygon points={`30,165 ${[...D.req96].map((v, i) => `${30 + i * 9.7},${165 - v / maxY * 150}`).join(' ')} 960,165`} fill="rgba(116,19,52,.12)" />
              <polyline points={[...D.req96].map((v, i) => `${30 + i * 9.7},${165 - v / maxY * 150}`).join(' ')} fill="none" stroke="#5A3542" strokeWidth="2" />
              <polyline points={[...D.sch96].map((v, i) => `${30 + i * 9.7},${165 - v / maxY * 150}`).join(' ')} fill="none" stroke="#A7465F" strokeWidth="2" strokeDasharray="5 4" />
              {[0, 12, 24, 36, 48, 60, 72, 84, 95].map((i) => <text key={i} x={30 + i * 9.7} y="182" fontSize="9" fill="#A38D95" textAnchor="middle">{pobHH(i * 15)}</text>)}
            </svg>
            {/* heatmapa pokrycia */}
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[12px] font-bold" style={{ color: colors.primary.darkest }}>Coverage heatmap <span className="font-normal text-[10.5px]" style={{ color: colors.primary.light }}>· kliknij slot, aby zobaczyć szczegóły</span></p>
                <span className="flex items-center gap-3 text-[10.5px]" style={{ color: colors.primary.dark }}><span className="flex items-center gap-1"><i className="w-3 h-2.5 rounded" style={{ backgroundColor: '#A7465F' }} /> Pokrycie</span><span className="flex items-center gap-1"><i className="w-3 h-2.5 rounded" style={{ backgroundColor: '#B86D82' }} /> Nadmiar</span><span className="flex items-center gap-1"><i className="w-3 h-2.5 rounded" style={{ backgroundColor: '#B94352' }} /> Niedobór</span></span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 24 }, (_, h) => {
                  let req = 0, sch = 0; for (let i = h * 4; i < h * 4 + 4; i++) { req += D.pods.perSlot[i].req; sch += D.pods.perSlot[i].sch; }
                  const st2 = req - sch > 1 ? '#B94352' : sch - req > 2 && req > 0 ? '#B86D82' : '#A7465F';
                  return <button key={h} onClick={() => setSlotSel({ h, req: req / 4, sch: sch / 4 })} className="flex-1 h-5 rounded" title={`${pobHH(h * 60)}–${pobHH(h * 60 + 60)}`} style={{ backgroundColor: st2, outline: slotSel && slotSel.h === h ? `2px solid ${colors.primary.darkest}` : 'none' }} />;
                })}
              </div>
              {slotSel && <p className="text-[11.5px] mt-1.5" style={{ color: colors.primary.dark }}>Slot <b>{pobHH(slotSel.h * 60)}–{pobHH(slotSel.h * 60 + 60)}</b>: wymagane <b>{slotSel.req.toFixed(1).replace('.', ',')}</b> · plan <b>{slotSel.sch.toFixed(1).replace('.', ',')}</b> · {slotSel.req > slotSel.sch ? <span style={{ color: '#B94352' }}>niedobór {(slotSel.req - slotSel.sch).toFixed(1).replace('.', ',')}</span> : <span style={{ color: '#741334' }}>OK</span>} · na zmianie: {D.zmiany.filter((x) => { const a = pobOp(x.start), b = pobOp(x.end) <= a ? pobOp(x.end) + 1440 : pobOp(x.end); return a < (slotSel.h + 1) * 60 && b > slotSel.h * 60; }).map((x) => (kontoZm(x) || { name: x.name }).name.split(' ')[0]).join(', ') || '—'}</p>}
            </div>
          </div>

          {/* zakładki dni */}
          <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: '#E3DCDD' }}>
            <div className="flex items-center border-b" style={{ borderColor: '#EDE3E6' }}>
              {days.map((d) => { const L = dayLabel(d); const S = dniS[d]; const zle = S && S.pods.deficitH > 0.5; return (
                <button key={d} onClick={() => { setDay(d); setSlotSel(null); setPropozycje(null); }} className="relative flex-1 px-2 py-2.5 text-center border-r last:border-0" style={{ borderColor: '#EDE3E6', backgroundColor: day === d ? '#F7F5F5' : 'white', borderBottom: day === d ? `3px solid ${colors.primary.darkest}` : '3px solid transparent' }}>
                  {zle && <i className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#B94352' }} />}
                  <p className="text-[11px] font-semibold" style={{ color: colors.primary.light }}>{L.dn}</p>
                  <p className="text-[13px] font-bold" style={{ color: colors.primary.darkest }}>{L.nr}</p>
                </button>
              ); })}
              <div className="px-4 text-[11.5px] whitespace-nowrap hidden xl:block" style={{ color: colors.primary.light }}>
                Required <b style={{ color: colors.primary.darkest }}>{pobH1(D.pods.requiredH)}</b> · Plan <b style={{ color: colors.primary.darkest }}>{pobH1(D.pods.scheduledH)}</b> · Coverage <b style={{ color: D.pods.coveragePct >= 95 ? '#741334' : '#A7465F' }}>{Math.round(D.pods.coveragePct)}%</b>
              </div>
            </div>
            <div className="px-4 py-3 flex flex-wrap items-center gap-2 border-b" style={{ borderColor: '#EDE3E6' }}>
              <button onClick={() => setModal({ date: day, start: '08:00', end: '16:00', station: stacje[0], osoba: '' })} className="px-4 h-10 rounded-xl text-sm font-bold text-white flex items-center gap-2" style={{ backgroundColor: colors.primary.darkest }}><Plus size={15} /> Dodaj zmianę</button>
              <button onClick={() => { setPage('wt'); }} className="px-4 h-10 rounded-xl border bg-white text-sm font-bold flex items-center gap-2" style={{ borderColor: '#E3DCDD', color: colors.primary.darkest }}><FileSpreadsheet size={15} /> Szablon dnia</button>
              <button onClick={() => setRekomOn((v) => !v)} className="ml-auto px-4 h-10 rounded-xl text-sm font-bold flex items-center gap-2" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>{rekomOn ? 'Ukryj rekomendacje' : 'Pokaż rekomendacje'}</button>
            </div>
            {/* gantt */}
            <div className="overflow-x-auto">
              <div style={{ minWidth: 860 }}>
                <div className="flex border-b" style={{ borderColor: '#EDE3E6' }}>
                  <div className="w-56 shrink-0 px-4 py-2 text-[10.5px] font-extrabold tracking-wide" style={{ color: colors.primary.light }}>PRACOWNIK / ROLA</div>
                  <div className="relative flex-1 h-7">{Array.from({ length: 12 }, (_, i) => <span key={i} className="absolute top-1.5 text-[9.5px]" style={{ left: `${i * 2 / 24 * 100}%`, color: '#A38D95' }}>{pobHH(i * 120)}</span>)}</div>
                </div>
                {wiersze.map((w) => (
                  <div key={w.id} className="flex items-stretch border-b last:border-0" style={{ borderColor: '#F7F5F5' }}>
                    <div className="w-56 shrink-0 px-4 py-3 flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>{w.name.split(' ').map((x) => x[0]).join('').slice(0, 2)}</span>
                      <div className="min-w-0"><p className="text-[13px] font-bold truncate" style={{ color: colors.primary.darkest }}>{w.name}</p><p className="text-[10.5px] truncate" style={{ color: colors.primary.light }}>{w.rola}{w.zm[0] ? ` · ${w.zm[0].station}` : ''}</p></div>
                      {w.zm.some((x) => konfliktZmiany(x)) && <AlertTriangle size={14} className="shrink-0" style={{ color: '#B94352' }} title={w.zm.map((x) => konfliktZmiany(x)).filter(Boolean).join('; ')} />}
                    </div>
                    <div className="relative flex-1 py-3" style={{ backgroundImage: 'repeating-#F7F5F5' }}>
                      {w.zm.map((x, i) => { const a = pobOp(x.start); let b = pobOp(x.end); if (b <= a) b += 1440; const kfl = konfliktZmiany(x); return (
                        <div key={i} title={`${x.start}–${x.end} · ${x.station}${kfl ? ` · ⚠ ${kfl}` : ''}`} className="absolute h-8 rounded-lg border flex items-center px-2 text-[11px] font-semibold truncate cursor-default" style={{ left: `${a / 1440 * 100}%`, width: `${Math.min(b - a, 1440 - a) / 1440 * 100}%`, top: 8, backgroundColor: kfl ? '#F5E3E8' : stationColor(x.station) + '22', borderColor: kfl ? '#E0B9C4' : stationColor(x.station) + '55', color: kfl ? '#B94352' : colors.primary.darkest, borderLeft: `3px solid ${kfl ? '#B94352' : stationColor(x.station)}` }}>{x.start}–{x.end} · {x.station}{kfl && <AlertTriangle size={11} className="ml-1 shrink-0" />}</div>
                      ); })}
                    </div>
                  </div>
                ))}
                {otwarte.map((o, i) => (
                  <div key={i} className="flex items-stretch border-b last:border-0" style={{ borderColor: '#F7F5F5' }}>
                    <div className="w-56 shrink-0 px-4 py-3 flex items-center gap-2.5">
                      <button onClick={() => setModal({ date: day, start: o.od, end: o.do, station: stacje[0], osoba: '' })} className="w-9 h-9 rounded-full border-2 border-dashed flex items-center justify-center shrink-0" style={{ borderColor: '#C7B4BB', color: '#71656A' }}><Plus size={15} /></button>
                      <div><p className="text-[13px] font-bold" style={{ color: colors.primary.dark }}>Otwarta zmiana</p><p className="text-[10.5px]" style={{ color: '#B94352' }}>niedobór {pobH1(o.h)}</p></div>
                      <AlertTriangle size={14} style={{ color: '#B94352' }} />
                    </div>
                    <div className="relative flex-1 py-3">
                      <button onClick={() => setModal({ date: day, start: o.od, end: o.do, station: stacje[0], osoba: '' })} className="absolute h-8 rounded-lg border-2 border-dashed flex items-center px-2 text-[11px] font-semibold" style={{ left: `${pobOp(o.od) / 1440 * 100}%`, width: `${((pobOp(o.do) <= pobOp(o.od) ? pobOp(o.do) + 1440 : pobOp(o.do)) - pobOp(o.od)) / 1440 * 100}%`, top: 8, borderColor: '#C7A9B3', color: '#A7465F', backgroundImage: 'repeating-#F5ECEF' }}>{o.od}–{o.do} · Nieprzypisana</button>
                    </div>
                  </div>
                ))}
                {!wiersze.length && !otwarte.length && <p className="text-center py-8 text-sm" style={{ color: colors.primary.light }}>Brak zmian i niedoborów w tym dniu.</p>}
              </div>
            </div>
          </div>
        </div>

        {/* Smart Scheduler */}
        {rekomOn && (
          <aside className="space-y-3">
            <div className="bg-white rounded-2xl border p-4" style={{ borderColor: '#E3DCDD' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-extrabold tracking-[0.12em]" style={{ color: '#741334' }}>⚡ SMART SCHEDULER</p>
                <button onClick={() => setRekomOn(false)} className="w-7 h-7 rounded-lg border flex items-center justify-center" style={{ borderColor: '#E3DCDD' }}><X size={13} /></button>
              </div>
              <p className="text-[16px] font-bold mb-3" style={{ color: colors.primary.darkest }}>Rekomendacje zmian</p>
              <div className="rounded-xl p-3 flex items-center gap-3 mb-3" style={{ backgroundColor: '#F7F5F5' }}>
                <svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="none" stroke="#E3DCDD" strokeWidth="5" /><circle cx="23" cy="23" r="19" fill="none" stroke={kpi.score >= 85 ? '#741334' : kpi.score >= 70 ? '#B86D82' : '#B94352'} strokeWidth="5" strokeDasharray={`${kpi.score / 100 * 119} 119`} strokeLinecap="round" transform="rotate(-90 23 23)" /><text x="23" y="27" fontSize="12" fontWeight="800" textAnchor="middle" fill="#2B171E">{kpi.score}</text></svg>
                <div><p className="text-[13px] font-bold" style={{ color: colors.primary.darkest }}>{kpi.score >= 85 ? 'Dobry plan' : kpi.score >= 70 ? 'Plan do poprawy' : 'Plan wymaga zmian'}</p><p className="text-[11px]" style={{ color: colors.primary.light }}>{(niedobory.length ? 1 : 0) + (doSkrocenia ? 1 : 0) + konflikty.length} sugestie mogą poprawić wynik</p></div>
              </div>
              <div className="space-y-3">
                {niedobory.slice(0, 2).map((z, i) => (
                  <div key={i} className="border rounded-xl p-3" style={{ borderColor: '#E9D6DC' }}>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>{pobHH(z.od * 15)}–{pobHH(z.do * 15)}</span>
                    <p className="text-[13px] font-bold mt-1.5" style={{ color: colors.primary.darkest }}>Uzupełnij niedobór obsady</p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: colors.primary.light }}>Dodaj zmianę pokrywającą ten zakres albo wydłuż sąsiednią.</p>
                    <div className="flex gap-1.5 mt-1.5"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded border" style={{ borderColor: '#eee', color: colors.primary.dark }}>Deficit −{pobH1((z.do - z.od) / 4)}</span></div>
                    <button onClick={() => setModal({ date: day, start: pobHH(z.od * 15), end: pobHH(z.do * 15), station: stacje[0], osoba: '' })} className="text-[12px] font-bold mt-2" style={{ color: '#741334' }}>Dodaj zmianę →</button>
                  </div>
                ))}
                {doSkrocenia && (
                  <div className="border rounded-xl p-3" style={{ borderColor: '#E3DCDD' }}>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#F1E4E8', color: '#A7465F' }}>{pobHH(doSkrocenia.zakres.od * 15)}–{pobHH(doSkrocenia.zakres.do * 15)}</span>
                    <p className="text-[13px] font-bold mt-1.5" style={{ color: colors.primary.darkest }}>Usuń nadmiar obsady</p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: colors.primary.light }}>Skróć zmianę {doSkrocenia.osoba} do {pobHH(doSkrocenia.zakres.od * 15)} — pokrycie pozostanie pełne.</p>
                    <div className="flex gap-1.5 mt-1.5"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded border" style={{ borderColor: '#eee', color: colors.primary.dark }}>Koszt −{Math.round(kosztGodzin(kontoZm(doSkrocenia.x), doSkrocenia.zakres.h))} zł</span><span className="text-[10px] font-bold px-1.5 py-0.5 rounded border" style={{ borderColor: '#eee', color: colors.primary.dark }}>Excess −{pobH1(doSkrocenia.zakres.h)}</span></div>
                    <button onClick={() => skroc(doSkrocenia)} className="text-[12px] font-bold mt-2" style={{ color: '#741334' }}>Zastosuj →</button>
                  </div>
                )}
                {konflikty.slice(0, 2).map((z, i) => (
                  <div key={`k${i}`} className="border rounded-xl p-3" style={{ borderColor: '#E9D6DC' }}>
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>{z.x.start}–{z.x.end}</span>
                    <p className="text-[13px] font-bold mt-1.5" style={{ color: colors.primary.darkest }}>Konflikt: {(kontoZm(z.x) || { name: z.x.name }).name}</p>
                    <p className="text-[11.5px] mt-0.5" style={{ color: colors.primary.light }}>{z.k}.</p>
                    <button onClick={() => setPage('dyspo')} className="text-[12px] font-bold mt-2" style={{ color: '#741334' }}>Otwórz dyspozycje →</button>
                  </div>
                ))}
                {!niedobory.length && !doSkrocenia && !konflikty.length && <p className="text-[12px] text-center py-2" style={{ color: colors.primary.light }}>Brak sugestii — plan wygląda dobrze. ✓</p>}
              </div>
              <button onClick={uruchomOptymalizator} className="w-full mt-3 h-11 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2" style={{ backgroundColor: colors.primary.darkest }}><LayoutGrid size={15} /> Uruchom optymalizator</button>
              {propozycje && (
                <div className="mt-3 border-t pt-3" style={{ borderColor: '#EDE3E6' }}>
                  <p className="text-[12px] font-bold mb-2" style={{ color: colors.primary.darkest }}>Propozycje ({propozycje.length}) · {pobH1(propozycje.reduce((a, x) => a + x.h, 0))}</p>
                  {propozycje.length === 0 && <p className="text-[11.5px]" style={{ color: colors.primary.light }}>Popyt jest pokryty — nic nie trzeba dokładać.</p>}
                  {propozycje.map((pr, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor: '#F7F5F5' }}>
                      <span className="text-[11.5px] flex-1" style={{ color: colors.primary.dark }}><b>{pr.od}–{pr.do}</b> · {pr.n}</span>
                      <button onClick={() => setModal({ date: day, start: pr.od, end: pr.do, station: stacje[0], osoba: '' })} className="text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>Użyj</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* modal Dodaj zmianę */}
      {modal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>Dodaj zmianę · {modal.date}</h3><button onClick={() => setModal(null)}><X size={20} className="text-slate-400" /></button></div>
            <div className="space-y-3">
              <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Pracownik</label>
                <input list="pob-konta" value={modal.osoba} onChange={(e) => setModal((m) => ({ ...m, osoba: e.target.value }))} placeholder="wpisz nazwisko…" className="w-full px-3 py-2.5 rounded-lg border" style={{ borderColor: colors.primary.bg }} autoFocus />
                <datalist id="pob-konta">{(data.accounts || []).map((a) => <option key={a.id} value={a.grafikName || a.name}>{a.name}</option>)}</datalist></div>
              <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Stanowisko</label>
                <select value={modal.station} onChange={(e) => setModal((m) => ({ ...m, station: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border" style={{ borderColor: colors.primary.bg }}>{stacje.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Od</label><input type="time" value={modal.start} onChange={(e) => setModal((m) => ({ ...m, start: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
                <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Do</label><input type="time" value={modal.end} onChange={(e) => setModal((m) => ({ ...m, end: e.target.value }))} className="w-full px-3 py-2.5 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
              </div>
              <p className="text-[11px]" style={{ color: colors.primary.light }}>Planer sprawdzi absencje, dyspozycje, nakładanie i reguły umów (blokady/ostrzeżenia).</p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Anuluj</button>
              <button disabled={busy} onClick={zapiszModal} className="px-4 py-2 rounded-lg text-sm font-bold text-white disabled:opacity-50" style={{ backgroundColor: colors.primary.darkest }}>Dodaj do grafiku</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PlanFinanse = ({ data, setPage }) => {
  const [sek, setSek] = useState('forecast-col');
  const nav = (id) => { if (id === 'plan') setSek('budzet'); else if (id === 'forecast') setSek('forecast-col'); else if (id === 'optymalizacja') setSek('opty'); else setPage(id); };
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-8 pt-5 flex gap-1 bg-white border-b" style={{ borderColor: colors.primary.bg }}>
        {[['forecast-col', 'Forecast miesiąca / COL'], ['obsada', 'Planowanie obsady'], ['opty', 'Optymalizacja dzienna'], ['budzet', 'Rozliczenie kosztów']].map(([k, l]) => (
          <button key={k} onClick={() => setSek(k)} className="px-5 py-2.5 rounded-t-xl text-sm font-semibold" style={{ backgroundColor: sek === k ? colors.primary.bgLight : 'transparent', color: sek === k ? colors.primary.darkest : colors.primary.light, borderBottom: sek === k ? `3px solid ${colors.primary.medium}` : '3px solid transparent' }}>{l}</button>
        ))}
      </div>
      {sek === 'forecast-col' ? <MonthlyForecast api={api} data={data} /> : sek === 'obsada' ? <PlanObsada data={data} setPage={nav} /> : sek === 'opty' ? <ForecastPlan data={data} setPage={nav} /> : <BudgetPlan data={data} setPage={nav} />}
    </div>
  );
};

// ===================== SIATKA TYGODNIA (planowanie jak MAPAL Scheduler) =====================
const WeekPlanner = ({ data, days, locked, onDzien, onBack }) => {
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [qOsoba, setQOsoba] = useState('');
  const [grupa, setGrupa] = useState('Wszyscy pracownicy');
  const konta = data.accounts || [];
  const zmianyTyg = useMemo(() => data.shifts.filter((x) => days.includes(x.date)), [data.shifts, days]);
  const stacje = [...new Set(['MANAGER', 'MGR FUNKCYJNE', ...data.shifts.map((x) => x.station)])].filter(Boolean);
  const sprzedazMap = ((data.salesData || {}).sales) || {};

  const wiersze = useMemo(() => {
    const zKont = konta.map((a) => {
      const moje = scalParyPlan(zmianyTyg.filter((x) => x.accountId === a.id));
      return { key: `a:${a.id}`, id: a.id, konto: a, label: a.name, grafik: a.grafikName || a.name, funkcja: a.funkcja, moje };
    });
    const bezKonta = [...new Set(zmianyTyg.filter((x) => !x.accountId).map((x) => String(x.name).toUpperCase()))]
      .map((n) => ({ key: `n:${n}`, id: null, konto: null, label: n, grafik: n, funkcja: null, moje: scalParyPlan(zmianyTyg.filter((x) => !x.accountId && String(x.name).toUpperCase() === n)) }));
    const rows = [...zKont, ...bezKonta].map((w) => ({ ...w, sumaH: w.moje.reduce((a, x) => a + godzZ(x), 0) }));
    rows.sort((a, b) => (b.sumaH - a.sumaH) || a.label.localeCompare(b.label));
    return rows;
  }, [konta, zmianyTyg]);

  const sumaTygH = wiersze.reduce((a, w) => a + w.sumaH, 0);
  const sumaKoszt = wiersze.reduce((a, w) => a + kosztGodzin(w.konto, w.sumaH), 0);
  const sprzedazTyg = days.reduce((a, d) => a + (sprzedazMap[d] || 0), 0);
  const sumaDniaH = (d) => wiersze.reduce((a, w) => a + w.moje.filter((x) => x.date === d).reduce((x2, y) => x2 + godzZ(y), 0), 0);

  const klikPusta = (w, d) => { if (locked) return; setModal({ tryb: 'nowa', osoba: w.grafik, accountId: w.id, station: 'MANAGER', start: '08:00', end: '16:00', date: d }); };
  const klikChip = (w, x, e) => { e.stopPropagation(); if (locked) return; setModal({ tryb: 'edycja', osoba: x.name, accountId: x.accountId || w.id, station: x.station, start: x.start, end: x.end, date: x.date, szkoli: !!x.szkoli, szkoliChk: !!x.szkoli, uczenSel: x.partnerSzk || '', paraInstr: x.paraInstr || null, ident: { sid: x.sid, date: x.date, name: x.name, start: x.start, end: x.end } }); };
  const zapisz = async () => {
    if (!modal) return; setSaving(true);
    let ok;
    if (modal.tryb === 'nowa') ok = await data.addShiftManual({ date: modal.date, name: modal.osoba, station: modal.station, start: modal.start, end: modal.end, accountId: modal.accountId || undefined });
    else {
      ok = await data.updateShiftManual(modal.ident, { station: modal.station, start: modal.start, end: modal.end });
      if (ok && modal.paraInstr) await data.updateShiftManual(modal.paraInstr, { start: modal.start, end: modal.end });
      if (ok && modal.tryb === 'edycja') {
        const bylo = !!modal.szkoli, jest = !!modal.szkoliChk;
        const uczen = String(modal.uczenSel || '').trim();
        if (jest && !uczen) { data.show('Wybierz ucznia dla instruktora', 'error'); ok = false; }
        else if (jest !== bylo || (jest && uczen)) {
          ok = await data.ustawSzkolenie({ date: modal.ident.date, instruktor: { sid: modal.ident.sid, name: modal.osoba }, uczen: jest ? uczen : null });
        }
      }
    }
    setSaving(false); if (ok) setModal(null);
  };
  const usun = async () => {
    if (!modal || modal.tryb !== 'edycja') return; setSaving(true);
    const ok = await data.removeShiftManual(modal.ident);
    if (ok && modal.paraInstr) await data.removeShiftManual(modal.paraInstr);
    setSaving(false); if (ok) setModal(null);
  };

  const gridCols = '190px repeat(7, minmax(108px, 1fr)) 118px';
  const KIER = new Set(['RGM', 'ASM', 'SM', 'JSM']);
  const stTyg = ((data.ts || {}).weekStatus || {})[days[0]] || {};
  const doneTyg = days.every((d) => ((data.ts || {}).completed || {})[d]);
  const toneZm = (st2) => { const S = String(st2 || '').toUpperCase(); if (S.includes('KONTROLER')) return 'outline'; const k = BP_KATEGORIA(st2); return k === 'Manager' ? 'deep' : k === 'Kuchnia' ? 'soft' : 'mid'; };
  const dniKr = ['PON', 'WT', 'ŚR', 'CZW', 'PT', 'SOB', 'ND'];
  const widoczniW = wiersze.filter((w) => {
    const q = qOsoba.toLowerCase();
    const jestKier = KIER.has(w.funkcja);
    const okG = grupa === 'Wszyscy pracownicy' || (grupa === 'Kierownictwo' && jestKier) || (grupa === 'Crew' && !jestKier);
    return okG && (!q || String(w.label).toLowerCase().includes(q));
  });
  const osobDnia = (d) => new Set(zmianyTyg.filter((x) => x.date === d && !jestInstruktor(x)).map((x) => x.accountId || x.name)).size;
  const tglCompleted = () => { if (locked) return data.show('Tydzień zamknięty', 'error'); data.tsSetCompletedWeek(days, !doneTyg); };
  const tglReviewed = () => { if (locked) return data.show('Tydzień zamknięty', 'error'); if (!doneTyg) return data.show('Najpierw wszystkie dni Completed', 'error'); data.tsSetWeek(days[0], { ...stTyg, reviewed: !stTyg.reviewed }); };
  const tglClosed = () => { if (stTyg.closed) { data.tsReopenWeek(days[0]); return; } if (!doneTyg) return data.show('Najpierw wszystkie dni Completed', 'error'); data.tsCloseWeek(days[0]); };
  return (
    <section className="panel weekly-rota-panel">
      <header className="weekly-rota-toolbar">
        <div className="weekly-rota-title">{onBack && <button onClick={onBack} aria-label="Wróć do listy tygodni"><ChevronLeft size={17} /></button>}<span><small>TYDZIEŃ GRAFIKOWY</small><strong>{days[0].slice(8)}.{days[0].slice(5, 7)} – {days[6].slice(8)}.{days[6].slice(5, 7)}.{days[6].slice(0, 4)}</strong><em>{f0(sumaTygH)} h · koszt {f0(sumaKoszt)} zł{sprzedazTyg ? ` · sprzedaż ${f0(sprzedazTyg)} zł` : ''}</em></span></div>
        <div className="weekly-status-flow" aria-label="Status grafiku tygodniowego">
          <button className={doneTyg ? 'done' : ''} onClick={tglCompleted}><i>{doneTyg ? <Check size={13} /> : '1'}</i><span><strong>Completed</strong><small>gotowy do review</small></span></button>
          <b />
          <button className={stTyg.reviewed ? 'done' : ''} onClick={tglReviewed}><i>{stTyg.reviewed ? <Check size={13} /> : '2'}</i><span><strong>Reviewed</strong><small>zatwierdzony</small></span></button>
          <b />
          <button className={stTyg.closed ? 'done closed' : ''} onClick={tglClosed}><i>{stTyg.closed ? <Lock size={12} /> : '3'}</i><span><strong>Closed</strong><small>edycja zablokowana</small></span></button>
        </div>
      </header>

      <div className="weekly-grid-toolbar">
        <div><label><Search size={14} /><input value={qOsoba} onChange={(e) => setQOsoba(e.target.value)} placeholder="Szukaj pracownika" /></label><label><Filter size={14} /><select value={grupa} onChange={(e) => setGrupa(e.target.value)}><option>Wszyscy pracownicy</option><option>Kierownictwo</option><option>Crew</option></select></label></div>
        <span><LayoutGrid size={14} /> Przesuwaj dni w lewo i prawo — pracownicy pozostają przypięci</span>
      </div>

      {wiersze.length === 0 ? (
        <div className="weekly-empty-state"><i><CalendarCheck2 size={23} /></i><span><strong>Ten tydzień nie ma jeszcze grafiku</strong><small>Rozpocznij od Blueprints, importu albo dodaj pierwszą zmianę klikając WOLNE w wierszu pracownika poniżej — lub w widoku dnia.</small></span></div>
      ) : (
        <div className="weekly-grid-scroll">
          <div className="weekly-shift-grid">
            <div className="weekly-employee-head"><span>PRACOWNIK</span><small>{widoczniW.length} osób • plan tygodnia</small></div>
            {days.map((d, i) => { const sp = sprzedazMap[d]; return (
              <button className={`weekly-day-head ${i >= 5 ? 'weekend' : ''}`} onClick={() => onDzien && onDzien(d)} key={d}>
                <span>{dniKr[i]}</span><strong>{d.slice(8)}.{d.slice(5, 7)}</strong><small>{sp ? `${Math.round(sp / 1000)} tys. zł` : '—'}</small><em>Otwórz dzień <ChevronRight size={10} /></em>
              </button>
            ); })}
            <div className="weekly-total-head"><span>TYDZIEŃ</span><small>plan / umowa</small></div>

            {widoczniW.map((w) => (
              <div className="weekly-row-fragment" key={w.key || w.id}>
                <div className="weekly-employee-cell"><i>{String(w.label).split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()}</i><span><strong>{w.label}</strong><small>{w.funkcja || 'bez konta'}{w.konto && w.konto.umowa ? ` • ${w.konto.umowa}` : ''}</small></span></div>
                {days.map((d) => { const zs = w.moje.filter((x) => x.date === d); return (
                  <div className="weekly-shift-cell" key={d}>
                    {zs.length ? zs.map((x, xi) => (
                      <button key={xi} className={`weekly-shift-pill weekly-${toneZm(x.station)}`} title={`${x.station} · ${godzZ(x)} h${x.szkoli ? ` · szkoli${x.partnerSzk ? ': ' + x.partnerSzk : ''}` : ''}${x.dodana ? ' · ręczna' : ''}`} onClick={(e) => klikChip(w, x, e)}>
                        <strong>{x.start}–{x.end}</strong><span>{x.szkoli ? `🎓 ${x.station}` : x.station}</span>
                      </button>
                    )) : (
                      <button className="weekly-day-off" style={{ cursor: locked || !w.grafik ? 'default' : 'pointer', border: 0, background: 'transparent', width: '100%' }} onClick={() => !locked && w.grafik && klikPusta(w, d)}>WOLNE</button>
                    )}
                  </div>
                ); })}
                <div className={`weekly-hours-cell ${w.konto && w.konto.wymiarTygH && Math.abs(w.sumaH - w.konto.wymiarTygH) > 1 ? 'alert' : ''}`}><strong>{w.sumaH.toFixed(1).replace('.', ',')} h</strong><small>/ {w.konto && w.konto.wymiarTygH ? `${w.konto.wymiarTygH} h` : '—'}</small></div>
              </div>
            ))}

            <div className="weekly-total-label"><strong>OBSADA I GODZINY</strong><small>kliknij dzień, aby przejść do siatki Gantta</small></div>
            {days.map((d) => <button className="weekly-day-total" onClick={() => onDzien && onDzien(d)} key={d}><strong>{sumaDniaH(d).toFixed(0)} h</strong><small>{osobDnia(d)} osób</small></button>)}
            <div className="weekly-grand-total"><strong>{f0(sumaTygH)} h</strong><small>{f0(sumaKoszt)} zł</small></div>
          </div>
        </div>
      )}
      <footer className="weekly-rota-footer">
        <div><span><i className="weekly-key" />Kierownictwo</span><span><i className="weekly-key mid" />Operacje / sala</span><span><i className="weekly-key soft" />Produkcja / kuchnia</span><span><i className="weekly-key outline" />Kontrola</span><span><i className="weekly-key off" />Wolne</span></div>
        <button onClick={() => onDzien && onDzien(days[0])}><LayoutGrid size={14} /> Otwórz poniedziałek w widoku dziennym <ChevronRight size={14} /></button>
      </footer>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,.45)' }} onClick={() => !saving && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold" style={{ color: colors.primary.darkest }}>{modal.tryb === 'nowa' ? 'Nowa zmiana' : 'Edytuj zmianę'}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400"><X size={18} /></button>
            </div>
            <p className="text-sm mb-4" style={{ color: colors.primary.light }}>{modal.osoba} · {dniPelne[new Date(modal.date).getDay()]}, {modal.date}{modal.szkoli ? ' · 🎓 szkoli' : ''}</p>
            <div className="space-y-3">
              <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Stanowisko</label>
                <select value={modal.station} onChange={(e) => setModal({ ...modal, station: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>{stacje.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Początek</label><input type="time" step="900" value={modal.start} onChange={(e) => setModal({ ...modal, start: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
                <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Koniec</label><input type="time" step="900" value={modal.end} onChange={(e) => setModal({ ...modal, end: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
              </div>
              <p className="text-xs" style={{ color: colors.primary.light }}>Czas trwania: <b style={{ color: colors.primary.darkest }}>{(() => { let a = plnMin(modal.start), b = plnMin(modal.end); if (b <= a) b += 1440; return ((b - a) / 60).toFixed(2).replace('.', ','); })()} h</b>{plnMin(modal.end) <= plnMin(modal.start) ? ' (przez północ)' : ''}</p>
              {modal.tryb === 'edycja' && (
                <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: colors.primary.bgLight }}>
                  <label className="flex items-center gap-2 text-sm font-medium" style={{ color: colors.primary.dark }}>
                    <input type="checkbox" checked={!!modal.szkoliChk} onChange={(e) => setModal({ ...modal, szkoliChk: e.target.checked })} />
                    Instruktor — szkoli tego dnia
                  </label>
                  {modal.szkoliChk && (
                    <div>
                      <label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Uczeń (osoba szkolona)</label>
                      <select value={modal.uczenSel || ''} onChange={(e) => setModal({ ...modal, uczenSel: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>
                        <option value="">— wybierz ucznia —</option>
                        {[...new Set(data.shifts.filter((x) => x.date === (modal.ident ? modal.ident.date : day) && !jestInstruktor(x) && String(x.name).toUpperCase() !== String(modal.osoba).toUpperCase()).map((x) => x.name))].sort().map((n) => { const k = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((al) => String(al).toUpperCase() === String(n).toUpperCase())); return <option key={n} value={n}>{(k && k.name) || n}</option>; })}
                      </select>
                      <p className="text-[10px] mt-1" style={{ color: colors.primary.light }}>Uczeń dostanie oznaczenie szkolenia, a instruktor równoległy wiersz INSTRUKTOR na godziny ucznia.</p>
                    </div>
                  )}
                  {modal.szkoli && !modal.szkoliChk && <p className="text-[10.5px] font-medium" style={{ color: '#B94352' }}>Odznaczone — zapis rozepnie parę szkoleniową.</p>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-5">
              {modal.tryb === 'edycja' && <button disabled={saving} onClick={usun} className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>Usuń zmianę</button>}
              <div className="ml-auto flex gap-2">
                <button disabled={saving} onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Anuluj</button>
                <button disabled={saving} onClick={zapisz} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: colors.primary.medium }}>{saving ? 'Zapisuję…' : 'Zatwierdź'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

// ===================== PLANER DNIA (styl MAPAL Scheduler 2.0) =====================
// Wiersze = pracownicy, oś = doba operacyjna 06:00→06:00. Klik w pusty obszar dodaje
// zmianę (start = kliknięta godzina), klik w pasek otwiera edycję. Wszystko zapisuje
// się przez backend (add/update/remove) i od razu tworzy wpisy wykonania.
const PLN_H0 = 6, PLN_HN = 30;                              // 06 → 06 następnego dnia
const plnMin = (t) => { const [h, m] = String(t).split(':').map(Number); let x = h * 60 + (m || 0); if (x < PLN_H0 * 60) x += 1440; return x; };
const plnPct = (t) => ((plnMin(t) - PLN_H0 * 60) / ((PLN_HN - PLN_H0) * 60)) * 100;
const plnClock = (min) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const DayPlanner = ({ data, day, locked, szukaj = '', stacjaF = '' }) => {
  const [modal, setModal] = useState(null);   // {tryb:'nowa'|'edycja', osoba, accountId, station, start, end, ident}
  const [saving, setSaving] = useState(false);

  const zmianyDnia = data.shifts.filter((x) => x.date === day);
  const konta = data.accounts || [];
  const [drag, setDrag] = useState(null);   // { key, a, b } — przeciąganie po pustym tle wiersza

  // Zapotrzebowanie (krzywa celu KC + prace pośrednie) vs obsada z planu — pasmo jak "Personal Ideal / Proyectado"
  const dowDnia = new Date(day).getDay();
  const sprzedazDnia = (((data.salesData || {}).sales) || {})[day] || 0;
  const { dir: demDir, ind: demInd } = optRozbicie(sprzedazDnia, 420, 3, sprzedazDnia ? 'sprzedaz' : 'krzywa', dowDnia);
  const demand = demDir.map((v, i) => Math.max(v, demInd[i]));
  const coverPlan = useMemo(() => {
    const c = new Array(NS).fill(0);
    zmianyDnia.filter((x) => !jestInstruktor(x)).forEach((x) => {
      const a = Math.floor(wtRel(x.start) / 30); const dl = Math.round(wtDur(x.start, x.end) / 30);
      for (let i = 0; i < dl; i++) { const p = a + i; if (p >= 0 && p < NS) c[p]++; }
    });
    return c;
  }, [zmianyDnia]);
  const [slotSel, setSlotSel] = useState(null);

  // ── Silnik v4.0: 96 slotów po 15 min (planning/) ──
  const sch96 = new Float64Array(V4_NSLOT);
  zmianyDnia.filter((x) => !jestInstruktor(x)).forEach((x) => v4AddCoverage(sch96, x.start, x.end));
  const cov96 = v4Coverage(v4Up96(demand), sch96);
  const poIdK = new Map(konta.map((a) => [a.id, a]));
  const poNazwieK = new Map(konta.flatMap((a) => [a.grafikName, ...(a.aliasy || [])].filter(Boolean).map((nn) => [String(nn).toUpperCase().trim(), a])));
  let planHDnia = 0, kosztDnia = 0;
  zmianyDnia.filter((x) => !jestInstruktor(x)).forEach((x) => { const g = godzZ(x); planHDnia += g; kosztDnia += kosztGodzin(poIdK.get(x.accountId) || poNazwieK.get(String(x.name || '').toUpperCase().trim()), g); });
  const slotSwieci = (x, i) => { let a = plnMin(x.start), b = plnMin(x.end); if (b <= a) b += 1440; const s0 = 360 + i * 15; return a < s0 + 15 && b > s0; };
  const stacje = [...new Set(['MANAGER', 'MGR FUNKCYJNE', ...data.shifts.map((x) => x.station)])].filter(Boolean);

  // Para praca+instruktor (te same/nachodzące godziny) = JEDEN pasek ze znacznikiem szkolenia.
  // Wiersz instruktorski to duplikat wyświetleniowy — nie liczymy go do godzin.
  const scalDlaWiersza = (arr) => {
    const zwykle = [], instr = [];
    arr.forEach((x) => (jestInstruktor(x) ? instr : zwykle).push(x));
    const out = zwykle.map((x) => ({ ...x }));
    instr.forEach((i) => {
      const para = out.find((x) => x.date === i.date && plnMin(x.start) < plnMin(i.end) + (plnMin(i.end) <= plnMin(i.start) ? 1440 : 0) && plnMin(i.start) < plnMin(x.end) + (plnMin(x.end) <= plnMin(x.start) ? 1440 : 0));
      if (para) { para.szkoli = true; para.partnerSzk = i.partner || i.uczen || null; para.paraInstr = { date: i.date, name: i.name, start: i.start, end: i.end }; }
      else out.push({ ...i, szkoli: true });
    });
    return out;
  };

  // wiersze: wszystkie konta + osoby z grafiku bez konta
  const wiersze = useMemo(() => {
    const zKont = konta.map((a) => ({ key: `a:${a.id}`, id: a.id, label: a.name, grafik: a.grafikName || a.name, funkcja: a.funkcja, moje: scalDlaWiersza(zmianyDnia.filter((x) => x.accountId === a.id)) }));
    const znane = new Set(zmianyDnia.filter((x) => x.accountId).map((x) => x.accountId));
    const bezKonta = [...new Set(zmianyDnia.filter((x) => !x.accountId).map((x) => String(x.name).toUpperCase()))]
      .map((n) => ({ key: `n:${n}`, id: null, label: n, grafik: n, funkcja: null, moje: scalDlaWiersza(zmianyDnia.filter((x) => !x.accountId && String(x.name).toUpperCase() === n)) }));
    const rows = [...zKont, ...bezKonta];
    rows.sort((a, b) => (b.moje.length - a.moje.length) || a.label.localeCompare(b.label));
    return rows;
  }, [konta, zmianyDnia]);

  const godzinyOsi = Array.from({ length: PLN_HN - PLN_H0 }, (_, i) => PLN_H0 + i);

  const slotZ = (e) => {
    const box = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - box.left) / box.width, 0), 1);
    return Math.round(frac * 40);          // slot co 30 min na osi 06→02 (0..40)
  };
  const dragStart = (w, e) => { if (locked || e.button !== 0) return; const a = slotZ(e); setDrag({ key: w.key, w, a, b: a + 1 }); };
  const dragMove = (w, e) => { if (!drag || drag.key !== w.key) return; const b = slotZ(e); setDrag((d) => ({ ...d, b })); };
  const dragEnd = (w, e) => {
    if (!drag || drag.key !== w.key) { setDrag(null); return; }
    const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b);
    const minA = PLN_H0 * 60 + a * 30;
    const minB = PLN_H0 * 60 + Math.max(b, a + 1) * 30;
    const przeciagniete = Math.abs(drag.b - drag.a) >= 1;
    setDrag(null);
    setModal({ tryb: 'nowa', osoba: w.grafik, accountId: w.id, station: 'MANAGER',
      start: plnClock(minA), end: plnClock(przeciagniete ? minB : Math.min(minA + 480, PLN_HN * 60)) });
  };
  const klikPasek = (w, x, e) => {
    e.stopPropagation();
    if (locked) return;
    setModal({ tryb: 'edycja', osoba: x.name, accountId: x.accountId || w.id, station: x.station, start: x.start, end: x.end, szkoli: !!x.szkoli, szkoliChk: !!x.szkoli, uczenSel: x.partnerSzk || '', paraInstr: x.paraInstr || null, ident: { sid: x.sid, date: x.date, name: x.name, start: x.start, end: x.end } });
  };
  const zapisz = async () => {
    if (!modal) return;
    setSaving(true);
    let ok;
    if (modal.tryb === 'nowa') ok = await data.addShiftManual({ date: day, name: modal.osoba, station: modal.station, start: modal.start, end: modal.end, accountId: modal.accountId || undefined });
    else {
      ok = await data.updateShiftManual(modal.ident, { station: modal.station, start: modal.start, end: modal.end });
      if (ok && modal.paraInstr) await data.updateShiftManual(modal.paraInstr, { start: modal.start, end: modal.end });   // wiersz szkoleniowy trzyma te same godziny
      // rola instruktora + przypisanie ucznia
      if (ok && modal.tryb === 'edycja') {
        const bylo = !!modal.szkoli, jest = !!modal.szkoliChk;
        const uczen = String(modal.uczenSel || '').trim();
        const zmianaPary = jest !== bylo || (jest && uczen.toUpperCase() !== String(modal.partnerSzkOrg || modal.uczenSel || '').toUpperCase());
        if (jest && !uczen) { data.show('Wybierz ucznia dla instruktora', 'error'); ok = false; }
        else if (jest !== bylo || (jest && uczen)) {
          ok = await data.ustawSzkolenie({ date: modal.ident.date || day, instruktor: { sid: modal.ident.sid, name: modal.osoba }, uczen: jest ? uczen : null });
        }
      }
    }
    setSaving(false);
    if (ok) setModal(null);
  };
  const usun = async () => {
    if (!modal || modal.tryb !== 'edycja') return;
    setSaving(true);
    const ok = await data.removeShiftManual(modal.ident);
    if (ok && modal.paraInstr) await data.removeShiftManual(modal.paraInstr);   // usuń też sparowany wiersz szkoleniowy
    setSaving(false);
    if (ok) setModal(null);
  };

  const sumaDnia = zmianyDnia.filter((x) => !jestInstruktor(x)).reduce((a, x) => a + godzZ(x), 0);

  // ── dzienny Gantt wg wzorca ORDO (oś 06:00–02:00) ──
  const G_H = Array.from({ length: 20 }, (_, i) => (6 + i) % 24);
  const G_MIN = 1200;                                          // 20 h w minutach
  const naGodz = (arr48) => Array.from({ length: 20 }, (_, i) => Math.max(arr48[i * 2] || 0, arr48[i * 2 + 1] || 0));
  const gInd = naGodz(demInd), gDir = naGodz(demDir), gNeed = naGodz(demand), gStaff = naGodz(coverPlan);
  const gMax = Math.max(4, ...gNeed, ...gStaff);
  const gPts = (vals) => vals.map((v, i) => `${(i / 19) * 1000},${72 - (v / gMax) * 58}`).join(' ');
  const gPos = (t) => { let x = plnMin(t) - 360; return Math.max(0, Math.min(x, G_MIN)); };
  const gBar = (x) => { let a2 = plnMin(x.start), b2 = plnMin(x.end); if (b2 <= a2) b2 += 1440; a2 -= 360; b2 -= 360; a2 = Math.max(0, a2); b2 = Math.min(b2, G_MIN); return { left: `${a2 / G_MIN * 100}%`, width: `${Math.max(b2 - a2, 20) / G_MIN * 100}%` }; };
  const gTone = (st2) => { const S = String(st2 || '').toUpperCase(); if (S.includes('KONTROLER')) return 'outline'; const k = BP_KATEGORIA(st2); return k === 'Manager' ? 'deep' : k === 'Kuchnia' ? 'soft' : 'mid'; };
  const wierszeG = wiersze.filter((w) => (!szukaj || String(w.label).toLowerCase().includes(szukaj.toLowerCase())) && (!stacjaF || w.moje.some((x) => String(x.station || '').toUpperCase() === String(stacjaF).toUpperCase())));
  const dzisG = day === ymd(new Date());
  const terazMinG = (() => { const n = new Date(); let x = n.getHours() * 60 + n.getMinutes() - 360; if (x < 0) x += 1440; return x; })();
  const slotCls = (i) => { const sl2 = cov96.perSlot[i] || { req: 0, sch: 0 }; if (sl2.req > 0 && sl2.sch >= sl2.req) return 'filled'; if (sl2.sch > 0) return sl2.req > 0 ? 'partial' : 'filled'; return ''; };
  return (
    <div>
      <article className="panel daily-gantt-panel">
        <div className="daily-gantt-scroll">
          <div className="daily-gantt-board" style={{ minWidth: 1460, gridTemplateColumns: '260px 1200px' }}>
            <div className="gantt-left gantt-header-left"><span>PRACOWNIK</span><small>{wierszeG.filter((w) => w.moje.length).length} osób • widok dzienny</small></div>
            <div className="gantt-hour-header">{G_H.map((h) => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}</div>

            <div className="gantt-left gantt-summary-label"><span>Praca pośrednia</span><span>Praca bezpośrednia</span><strong>Personel idealny</strong><strong>Obsada w planie</strong></div>
            <div className="gantt-summary-values">
              {gInd.map((v, i) => <span key={`i${i}`}>{v || ''}</span>)}
              {gDir.map((v, i) => <span key={`d${i}`}>{v || ''}</span>)}
              {gNeed.map((v, i) => <strong key={`n${i}`}>{v || ''}</strong>)}
              {gStaff.map((v, i) => <b key={`s${i}`} style={{ color: v < gNeed[i] ? '#B94352' : undefined }}>{v || ''}</b>)}
            </div>

            <div className="gantt-left gantt-coverage-label"><strong>POKRYCIE CO 15 MIN</strong><small>kliknij slot, aby podświetlić osoby</small></div>
            <div className="gantt-quarter-strip">{Array.from({ length: 80 }, (_, i) => <button key={i} aria-label={`Slot ${i + 1}`} className={slotCls(i)} style={slotSel === i ? { outline: '2px solid #2B171E', outlineOffset: 1 } : undefined} onClick={() => setSlotSel(slotSel === i ? null : i)} />)}</div>

            <div className="gantt-left gantt-curve-label"><strong>ZAPOTRZEBOWANIE VS PLAN</strong><small><i /> wymagane <i /> w planie</small></div>
            <div className="gantt-curve-track">
              <svg viewBox="0 0 1000 80" preserveAspectRatio="none" aria-label="Zapotrzebowanie vs plan">
                <polyline className="gantt-need-line" points={gPts(gNeed)} />
                <polyline className="gantt-plan-line" points={gPts(gStaff)} />
              </svg>
            </div>

            {wierszeG.map((w) => (
              <div className="gantt-row-fragment" key={w.key}>
                <div className="gantt-left gantt-person"><i>{String(w.label).split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()}</i><span><strong>{w.label}</strong><small>{w.funkcja || 'bez konta'} • {w.moje.reduce((a2, x) => a2 + godzZ(x), 0).toFixed(1).replace('.', ',')} h</small></span>{w.moje.some((x) => x.szkoli) && <em>szkoli</em>}</div>
                <div className="gantt-person-track" style={{ cursor: locked ? 'default' : 'crosshair' }}
                  onMouseDown={(e) => { if (e.target === e.currentTarget) dragStart(w, e); }}
                  onMouseMove={(e) => dragMove(w, e)}
                  onMouseUp={(e) => dragEnd(w, e)}>
                  <div className="gantt-track-grid" aria-hidden="true">{G_H.map((h) => <span key={h} />)}</div>
                  {dzisG && terazMinG <= G_MIN && <i className="gantt-now-line" style={{ left: `${terazMinG / G_MIN * 100}%` }} />}
                  {drag && drag.key === w.key && (() => { const a2 = Math.min(drag.a, drag.b) * 30, b2 = Math.max(drag.a, drag.b, Math.min(drag.a, drag.b) + 1) * 30; return <span style={{ position: 'absolute', top: 6, bottom: 6, left: `${a2 / G_MIN * 100}%`, width: `${(b2 - a2) / G_MIN * 100}%`, borderRadius: 8, border: '2px dashed #741334', background: 'rgba(116,19,52,.12)', pointerEvents: 'none' }} />; })()}
                  {w.moje.map((x, xi) => { const swieci = slotSel != null && slotSwieci(x, slotSel); return (
                    <button key={xi} className={`gantt-shift gantt-${gTone(x.station)}`} style={{ ...gBar(x), ...(swieci ? { outline: '2px solid #2B171E', outlineOffset: 1 } : {}), ...(slotSel != null && !swieci ? { opacity: .35 } : {}) }} title={`${x.station} ${x.start}–${x.end}${x.szkoli ? ` · szkoli${x.partnerSzk ? ': ' + x.partnerSzk : ''}` : ''}${x.dodana ? ' · ręczna' : ''}`} onClick={(e) => klikPasek(w, x, e)}>
                      <strong>{x.szkoli ? `🎓 ${x.station}` : x.station}</strong><span>{x.start}–{x.end}</span>
                    </button>
                  ); })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="gantt-kpi-bar">
          <span><i /> KOSZT (SZAC.) <strong>{Math.round(kosztDnia).toLocaleString('pl-PL')} zł</strong></span>
          <span><i /> KOSZT / SPRZEDAŻ <strong>{sprzedazDnia ? `${(kosztDnia / sprzedazDnia * 100).toFixed(1).replace('.', ',')}%` : '—'}</strong></span>
          <span><i /> GODZINY <strong>{sumaDnia.toFixed(1).replace('.', ',')} h</strong></span>
          <span><i /> NADMIAR (H) <strong>{cov96.excessH.toFixed(1).replace('.', ',')}</strong></span>
          <span><i /> NIEDOBÓR (H) <strong>{cov96.deficitH.toFixed(1).replace('.', ',')}</strong></span>
        </div>
        <p style={{ margin: '8px 14px 12px', color: '#71656A', fontSize: 10.5 }}>Klik na pasku = edycja zmiany (godziny, stanowisko, instruktor). Przeciągnij po pustym torze wiersza, aby dodać zmianę.{locked ? ' Tydzień zamknięty — tylko podgląd.' : ''}</p>
      </article>
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(15,23,42,.45)' }} onClick={() => !saving && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold" style={{ color: colors.primary.darkest }}>{modal.tryb === 'nowa' ? 'Nowa zmiana' : 'Edytuj zmianę'}</h3>
              <button onClick={() => setModal(null)} className="text-slate-400"><X size={18} /></button>
            </div>
            <p className="text-sm mb-4" style={{ color: colors.primary.light }}>{modal.osoba} · {dniPelne[new Date(day).getDay()]}, {day}</p>
            <div className="space-y-3">
              <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Stanowisko (aktywność)</label>
                <select value={modal.station} onChange={(e) => setModal({ ...modal, station: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>{stacje.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Początek</label><input type="time" step="900" value={modal.start} onChange={(e) => setModal({ ...modal, start: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
                <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Koniec</label><input type="time" step="900" value={modal.end} onChange={(e) => setModal({ ...modal, end: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
              </div>
              <p className="text-xs" style={{ color: colors.primary.light }}>Czas trwania: <b style={{ color: colors.primary.darkest }}>{(() => { let a = plnMin(modal.start), b = plnMin(modal.end); if (b <= a) b += 1440; return ((b - a) / 60).toFixed(2).replace('.', ','); })()} h</b>{plnMin(modal.end) <= plnMin(modal.start) ? ' (przez północ)' : ''}</p>
              {modal.tryb === 'edycja' && (
                <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: colors.primary.bgLight }}>
                  <label className="flex items-center gap-2 text-sm font-medium" style={{ color: colors.primary.dark }}>
                    <input type="checkbox" checked={!!modal.szkoliChk} onChange={(e) => setModal({ ...modal, szkoliChk: e.target.checked })} />
                    Instruktor — szkoli tego dnia
                  </label>
                  {modal.szkoliChk && (
                    <div>
                      <label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Uczeń (osoba szkolona)</label>
                      <select value={modal.uczenSel || ''} onChange={(e) => setModal({ ...modal, uczenSel: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>
                        <option value="">— wybierz ucznia —</option>
                        {[...new Set(data.shifts.filter((x) => x.date === (modal.ident ? modal.ident.date : day) && !jestInstruktor(x) && String(x.name).toUpperCase() !== String(modal.osoba).toUpperCase()).map((x) => x.name))].sort().map((n) => { const k = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((al) => String(al).toUpperCase() === String(n).toUpperCase())); return <option key={n} value={n}>{(k && k.name) || n}</option>; })}
                      </select>
                      <p className="text-[10px] mt-1" style={{ color: colors.primary.light }}>Uczeń dostanie oznaczenie szkolenia, a instruktor równoległy wiersz INSTRUKTOR na godziny ucznia.</p>
                    </div>
                  )}
                  {modal.szkoli && !modal.szkoliChk && <p className="text-[10.5px] font-medium" style={{ color: '#B94352' }}>Odznaczone — zapis rozepnie parę szkoleniową.</p>}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 mt-5">
              {modal.tryb === 'edycja' && <button disabled={saving} onClick={usun} className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: '#F5E3E8', color: '#B94352' }}>Usuń zmianę</button>}
              <div className="ml-auto flex gap-2">
                <button disabled={saving} onClick={() => setModal(null)} className="px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Anuluj</button>
                <button disabled={saving} onClick={zapisz} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: colors.primary.medium }}>{saving ? 'Zapisuję…' : 'Zatwierdź'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const WorkingTime = ({ data, canEdit, wrTab, setWrTab, wrNonce }) => {
  const ts = data.ts || { actuals: {}, completed: {}, weekStatus: {} };
  const [view, setView] = useState('list');
  const [weekStart, setWeekStart] = useState(null);
  const [day, setDay] = useState(null);
  const [fStation, setFStation] = useState('');
  const [order, setOrder] = useState('entry');
  const [brkFor, setBrkFor] = useState(null);
  const [zakresTyg, setZakresTyg] = useState('siatka');   // 'siatka' (cały tydzień) | 'dzien'
  const [printOpen, setPrintOpen] = useState(false);
  const [rosterData, setRosterData] = useState(null);
  const [fokus, setFokus] = useState(false);                 // pełny ekran do układania grafiku (bez sidebara)
  const [szukajOs, setSzukajOs] = useState('');
  const [stacjaF, setStacjaF] = useState('');
  useEffect(() => { if (!fokus) return; const h = (e) => { if (e.key === 'Escape') setFokus(false); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [fokus]);
  const idzDzien = (n) => { const d2 = new Date(day + 'T12:00:00'); d2.setDate(d2.getDate() + n); const iso = ymd(d2); setDay(iso); setWeekStart(wtMonday(iso)); };
  const zbudujRoster = (d) => {
    const MGRF = new Set(['SM', 'JSM', 'ASM', 'RGM']);
    const poIdR = new Map((data.accounts || []).map((a) => [a.id, a]));
    const poNazR = new Map((data.accounts || []).flatMap((a) => [a.grafikName, a.name, ...(a.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a])));
    const kontoZ = (x) => poIdR.get(x.accountId) || poNazR.get(String(x.name || '').toUpperCase().trim()) || null;
    const pelne = (x) => { const k = kontoZ(x); return (k && k.name ? k.name : (x.name || '')).toUpperCase(); };
    // pełne nazwisko z aliasu (partner pary szkoleniowej)
    const pelneN = (n) => { if (!n) return ''; const k = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((al) => String(al).toUpperCase().trim() === String(n).toUpperCase().trim())); return (k && k.name ? k.name : n).toUpperCase(); };
    const nazwisko = (x) => { const cz = pelne(x).split(/\s+/); return cz[cz.length - 1]; };
    const fH = (h) => `${h.toFixed(1).replace('.', ',')} h`;
    const dzienne = data.shifts.filter((x) => x.date === d);
    const scalone = scalParyPlan(dzienne);
    // wpisy instruktorskie to adnotacje pary (instruktor ma wlasna zwykla zmiane) — nie licza sie do godzin
    const bezInstr = dzienne.filter((x) => !jestInstruktor(x));
    const planH = bezInstr.reduce((a, x) => a + godzZ(x), 0);
    const mgrH = bezInstr.filter((x) => { const k = kontoZ(x); return k && MGRF.has(k.funkcja); }).reduce((a, x) => a + godzZ(x), 0);
    // szkolenia = godziny UCZNIOW (jak we wzorcu: sekcja SZKOLENIA sumuje zmiany szkolonych)
    const szkH = bezInstr.filter((x) => x.rola === 'training').reduce((a, x) => a + godzZ(x), 0);
    const szkOs = new Set(bezInstr.filter((x) => x.rola === 'training').map(pelne)).size;
    const mgrZm = bezInstr.filter((x) => { const k = kontoZ(x); return k && MGRF.has(k.funkcja); });
    const mn = (t) => { const [h2, m2] = String(t || '0:0').split(':').map(Number); return h2 * 60 + m2; };
    const kEnd = (x) => { let e = mn(x.end); if (e <= mn(x.start)) e += 1440; return e; };
    const otw = mgrZm.slice().sort((a, b) => mn(a.start) - mn(b.start))[0];
    const zam = mgrZm.slice().sort((a, b) => kEnd(b) - kEnd(a))[0];
    // silnik: pokrycie godzinowe
    const sp = (((data.salesData || {}).sales) || {})[d] || 0;
    const { dir, ind } = optRozbicie(sp, 420, 3, sp ? 'sprzedaz' : 'krzywa', new Date(d).getDay());
    const req96 = v4Up96(dir.map((v, i2) => Math.max(v, ind[i2])));
    const sch96 = new Float64Array(V4_NSLOT);
    dzienne.filter((x) => !jestInstruktor(x)).forEach((x) => v4AddCoverage(sch96, x.start, x.end));
    const cv = v4Coverage(req96, sch96);
    const coverage = Array.from({ length: 24 }, (_, gi) => { const g = (6 + gi) % 24; let idl = 0, pl = 0; for (let k = gi * 4; k < gi * 4 + 4; k++) { idl = Math.max(idl, req96[k]); pl = Math.max(pl, sch96[k]); } return { label: String(g).padStart(2, '0'), required: Math.ceil(idl), scheduled: Math.round(pl) }; });
    const zle = cv.perSlot.filter((x) => x.def > 0.01).length;
    // stacje
    const TONE = { 'PANIEROWANIE': 'lime', 'SMAŻENIE': 'red', 'KANAPKI / WRAPY': 'cyan', 'KONTROLER': 'navy', 'WSPARCIE WIECZORNE / FLEX': 'coral', 'DISPATCHER': 'coral', 'PHU': 'teal', 'DESERY / NAPOJE': 'indigo', 'FRYTKI': 'lime', 'ZMYWAK': 'slate', 'DOSTAWA': 'indigo', 'SZKOLENIA': 'teal', 'OBSADA': 'teal' };
    const grupy = {};
    scalone.forEach((x) => { const st = (x.station || '').toUpperCase() || 'OBSADA'; (grupy[st] = grupy[st] || []).push(x); });
    const stations = Object.keys(grupy).sort((a, b) => (a === 'OBSADA' ? -1 : b === 'OBSADA' ? 1 : a.localeCompare(b))).map((g) => {
      const wpisy = grupy[g].slice().sort((a, b) => mn(a.start) - mn(b.start));
      const hGr = wpisy.reduce((a, x) => a + godzZ(x), 0);
      return {
        id: g.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: g === 'OBSADA' ? 'Obsada' : g, code: g.slice(0, 3), tone: TONE[g] || 'teal', hours: fH(hGr),
        people: wpisy.map((x, i2) => { const k = kontoZ(x); return {
          id: `${g}-${i2}`, name: pelne(x), time: `${x.start}–${x.end}`, hours: `${godzZ(x).toFixed(0)} h`,
          badge: k && MGRF.has(k.funkcja) ? 'Manager' : (x.szkoli || (k && k.instruktor) ? 'Trener' : undefined),
          // instruktor → „szkoli: UCZEŃ"; uczeń → „instr.: INSTRUKTOR" (wcześniej: własne nazwisko z wiersza technicznego)
          detail: x.szkoli ? `szkoli: ${pelneN(x.partnerSzk) || '—'}` : (x.rola === 'training' && x.partner ? `instr.: ${pelneN(x.partner)}` : undefined),
        }; }),
      };
    });
    // ── karta wzorca: wiersze per osoba z segmentami na osi 06→02 ──
    const FUNK = { RGM: 'General Manager', ASM: 'Zastępca kierownika', SM: 'Kierownik zmiany', JSM: 'Mł. kierownik zmiany' };
    const osobyM = new Map();
    scalone.filter((x) => !jestInstruktor(x)).forEach((x) => {
      const key = pelne(x);
      const k = kontoZ(x);
      const o = osobyM.get(key) || { name: key, initials: key.split(/\s+/).map((c) => c[0]).join('').slice(0, 2), job: (k && (FUNK[k.funkcja] || 'Pracownik restauracji')) || 'Pracownik restauracji', h: 0, segments: [] };
      let sa = mn(x.start) / 60, sb = mn(x.end) / 60;
      if (sa < 6) sa += 24;
      if (sb <= sa) sb += 24;
      const S2 = String(x.station || '').toUpperCase();
      const tone2 = S2.includes('KONTROLER') ? 'outline' : BP_KATEGORIA(x.station) === 'Manager' ? 'deep' : BP_KATEGORIA(x.station) === 'Kuchnia' ? 'soft' : 'mid';
      o.segments.push({ start: sa, end: Math.min(sb, 26), tone: tone2, role: (x.station || 'OBSADA').toUpperCase() + (x.szkoli ? ' 🎓' : ''), time: `${x.start}–${x.end}` });
      o.h += godzZ(x);
      osobyM.set(key, o);
    });
    const people = [...osobyM.values()]
      .map((o) => ({ ...o, hours: fH(o.h), przerwa: o.h >= 6 ? '30 min' : '—', segments: o.segments.sort((a, b) => a.start - b.start) }))
      // sortowanie wydruku: od najwcześniejszych zmian (ranki → środki → zetki)
      .sort((a, b) => (a.segments[0].start - b.segments[0].start) || (a.segments[0].end - b.segments[0].end) || a.name.localeCompare(b.name, 'pl'));
    const needHours = [], planHours = [];
    for (let gi = 0; gi < 20; gi++) { let nn = 0, pp = 0; for (let k2 = gi * 4; k2 < gi * 4 + 4; k2++) { nn = Math.max(nn, req96[k2]); pp = Math.max(pp, sch96[k2]); } needHours.push(Math.ceil(nn)); planHours.push(Math.round(pp)); }
    let kosztW = 0;
    bezInstr.forEach((x) => { kosztW += kosztGodzin(kontoZ(x), godzZ(x)); });
    const d0 = new Date(d + 'T12:00:00');
    const dniP = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
    const mcP = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
    const teraz = new Date();
    return {
      dateLabel: `${dniP[d0.getDay()]}, ${d0.getDate()} ${mcP[d0.getMonth()]} ${d0.getFullYear()}`,
      operationalDayLabel: 'Doba operacyjna 06:00–06:00', versionLabel: 'Wersja opublikowana',
      restaurantName: 'Popeyes Kraków', restaurantDetail: 'Galeria Krakowska', locationCode: 'PLK 201043',
      shiftCount: bezInstr.length, employeeCount: new Set(bezInstr.map(pelne)).size,
      plannedHours: fH(planH), coveragePercent: Math.round(cv.coveragePct),
      coverageAttentionLabel: zle ? `${zle} ${zle === 1 ? 'slot' : zle < 5 ? 'sloty' : 'slotów'} do kontroli` : 'Bez uwag',
      managerHours: fH(mgrH), trainingHours: fH(szkH), trainingPeopleLabel: szkOs ? `${szkOs} ${szkOs === 1 ? 'osoba' : szkOs < 5 ? 'osoby' : 'osób'}` : '—',
      openingManager: otw ? nazwisko(otw) : '—', closingManager: zam ? nazwisko(zam) : '—',
      stations, coverage, people, needHours, planHours, koszt: kosztW, sprzedaz: sp,
      hoursSummary: [
        { id: 'crew', label: 'CREW', planned: fH(planH - mgrH - szkH) },
        { id: 'mgr', label: 'MANAGER', planned: fH(mgrH) },
        { id: 'szk', label: 'SZKOLENIA', planned: fH(szkH) },
        { id: 'razem', label: 'RAZEM', planned: fH(planH) },
      ],
      priorities: ['Wbicia i wybicia kartą zgodnie z planem.', 'Reakcja na wskaźnik kalkulatora MPT.', 'Każda zamiana wymaga akceptacji ASM lub RGM.'],
      generatedAt: `Wygenerowano ${String(teraz.getDate()).padStart(2, '0')}.${String(teraz.getMonth() + 1).padStart(2, '0')}.${teraz.getFullYear()} · ${String(teraz.getHours()).padStart(2, '0')}:${String(teraz.getMinutes()).padStart(2, '0')}`,
      documentLabel: 'Dokument operacyjny · PLK 201043 · strona 1/1',
    };
  };
  const otworzWydruk = (d) => { setPrintOpen(false); setRosterData(zbudujRoster(d)); };
  const zmienTydzien = (dni) => { const d = new Date(weekStart); d.setDate(d.getDate() + dni); const nowy = ymd(d); setWeekStart(nowy); setDay(nowy); };
  const [trybDnia, setTrybDnia] = useState('plan');   // 'plan' (siatka Gantta) | 'wykonanie' (timesheet)
  const [addOpen, setAddOpen] = useState(false);
  const [addOsoba, setAddOsoba] = useState('');
  const [addStacja, setAddStacja] = useState('MANAGER');
  const [addOd, setAddOd] = useState('08:00');
  const [addDo, setAddDo] = useState('16:00');
  const [addSaving, setAddSaving] = useState(false);

  const wsOf = (ws) => ts.weekStatus[ws] || { reviewed: false, closed: false };
  const locked = (weekStart ? wsOf(weekStart).closed : false) || !canEdit;

  const weeks = useMemo(() => {
    const map = {};
    data.shifts.forEach((s) => { const m = wtMonday(s.date); (map[m] = map[m] || new Set()).add(s.date); });
    return Object.keys(map).sort().map((m) => ({ start: m, days: [...map[m]].sort() }));
  }, [data.shifts]);
  const weekDone = (w) => w.days.length > 0 && w.days.every((d) => ts.completed[d]);
  const curWeek = () => weeks.find((w) => w.start === weekStart) || { days: [] };

  const hasAct = (s) => !!wtAct(ts.actuals, s);                       // R-04: wykonanie istnieje tylko z odbić/korekty
  // Actual pokazuje pełne imię i nazwisko z KONTA (nazwa z grafiku to alias techniczny)
  const pelnaNazwa = (s) => { const k = s.accountId && (data.accounts || []).find((a) => a.id === s.accountId); return (k && k.name) || s.name; };
  const act = (s) => wtAct(ts.actuals, s) || { start: s.start, end: s.end, breaks: [] };
  const setAct = (s, patch) => { if (locked) return data.show('Tydzień zamknięty — tylko podgląd', 'error'); data.tsPutActual(wtKey(s), { ...act(s), ...patch, source: 'manual' }); };
  const unpaid = (a) => (a.breaks || []).filter((b) => b.platna === false).reduce((x, b) => x + wtDur(b.start, b.end), 0);
  const actualNet = (s) => hasAct(s) ? wtDur(act(s).start, act(s).end) - unpaid(act(s)) : 0;
  const dayShifts = (d) => data.shifts.filter((s) => s.date === d && !jestInstruktor(s));

  const weekDays = weekStart ? Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return ymd(d); }) : [];

  const kpiTyg = useMemo(() => {
    const zt = data.shifts.filter((x) => weekDays.includes(x.date) && !jestInstruktor(x));
    const poId = new Map((data.accounts || []).map((a) => [a.id, a]));
    const poNazwie = new Map((data.accounts || []).flatMap((a) => [a.grafikName, ...(a.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a])));
    let h = 0, koszt = 0;
    zt.forEach((x) => { const g = godzZ(x); h += g; const k = (x.accountId && poId.get(x.accountId)) || poNazwie.get(String(x.name || '').toUpperCase().trim()); koszt += kosztGodzin(k, g); });
    const sales = ((data.salesData || {}).sales) || {};
    const sprzedaz = weekDays.reduce((a, d) => a + (sales[d] || 0), 0);
    // v4.0: nadmiar/niedobór liczone PER SLOT 15 min (spójnie z widokiem dnia), potem sumowane po dniach
    let exceso = 0, defecto = 0;
    weekDays.forEach((d) => {
      const dw = new Date(d).getDay();
      const sp = sales[d] || 0;
      const { dir, ind } = optRozbicie(sp, 420, 3, sp ? 'sprzedaz' : 'krzywa', dw);
      const req96 = v4Up96(dir.map((v, i) => Math.max(v, ind[i])));
      const s96 = new Float64Array(V4_NSLOT);
      zt.filter((x) => x.date === d).forEach((x) => v4AddCoverage(s96, x.start, x.end));
      const cs = v4Coverage(req96, s96);
      exceso += cs.excessH; defecto += cs.deficitH;
    });
    return { h, koszt, sprzedaz, exceso, defecto };
  }, [data.shifts, data.accounts, data.salesData, weekDays]);

  useEffect(() => { if (wrNonce) setView('list'); }, [wrNonce]);   // klik w menu WorkRhythm wraca do listy zakładki
  // WFM-10: eksport payroll — wyłącznie zamknięte tygodnie (audytowany na backendzie)
  const pobierzPayroll = async (weekStart) => {
    try {
      const tok = store.get('admin_token');
      const rf = await fetch(`${API_BASE}/timesheets?action=payroll&week=${weekStart}&format=csv`, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
      if (!rf.ok) { const j = await rf.json().catch(() => ({})); return data.show(j.error || 'Eksport nieudany', 'error'); }
      const blob = await rf.blob();
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `payroll_${weekStart}.csv`; a.click(); URL.revokeObjectURL(a.href);
      data.show(`Payroll ${weekStart} pobrany (CSV)`);
    } catch { data.show('Eksport nieudany', 'error'); }
  };

  const openWeek = (w, tryb) => {
    setWeekStart(w.start); setDay(w.days[0]); setView('week');
    if (tryb === 'wykonanie') { setZakresTyg('dzien'); setTrybDnia('wykonanie'); }
    else { setZakresTyg('siatka'); }
  };

  const stacje = [...new Set(dayShifts(day || '').map((s) => s.station))];
  let rows = dayShifts(day || '');
  if (fStation) rows = rows.filter((s) => s.station === fStation);
  rows = [...rows];
  if (order === 'az') rows.sort((a, b) => a.name.localeCompare(b.name));
  else if (order === 'diff') rows.sort((a, b) => Math.abs(actualNet(b) - wtDur(b.start, b.end)) - Math.abs(actualNet(a) - wtDur(a.start, a.end)));

  // Wiersze instruktorskie to duplikaty (osoba ma równolegle swoją zmianę) — nie liczą się do godzin
  const rowsGodz = rows.filter((s) => !jestInstruktor(s));
  const plannedMin = rowsGodz.reduce((x, s) => x + wtDur(s.start, s.end), 0);
  const rowsAct = rowsGodz.filter(hasAct);                            // R-04: KPI tylko z realnych odbić
  const actualMin = rowsAct.reduce((x, s) => x + actualNet(s), 0);
  const plannedActMin = rowsAct.reduce((x, s) => x + wtDur(s.start, s.end), 0);
  const eff = plannedActMin ? Math.round((actualMin / plannedActMin) * 100) : 0;

  // R-03/TNA-01: wykonanie budowane AUTOMATYCZNIE z odbić REX Clock (projekcja event store).
  // Zasady: wpisy source:'clock' są odświeżane, ręczne korekty (source:'manual' lub starsze) NIGDY nie są nadpisywane.
  const [projDnia, setProjDnia] = useState([]);
  // hub Schedule wg wzorca ORDO
  const [rotaQuery, setRotaQuery] = useState('');
  const [rotaStatus, setRotaStatus] = useState('Wszystkie statusy');
  const [rotaMenu, setRotaMenu] = useState(null);
  const [nowyOpen, setNowyOpen] = useState(false);
  const [nowyData, setNowyData] = useState('');
  const [nowyTpl, setNowyTpl] = useState('');
  useEffect(() => { setProjDnia([]); }, [day]);
  const synchronizujOdbicia = useCallback(async (cichy) => {
    if (locked) return;
    const r = await api(`/clock?action=projection&date=${day}`);
    if (!r || !r.success) { if (!cichy) data.show((r && r.error) || 'Nie udało się pobrać odbić', 'error'); return; }
    const proj = r.projection || [];
    setProjDnia(proj);                                                 // wyjątki „praca bez planu" w widoku
    const map = {}; let n = 0, niepelne = 0, chronione = 0;
    dayShifts(day).forEach((s) => {
      const pr = proj.find((x) => s.accountId && x.accountId === s.accountId);
      if (!pr || !pr.in) return;
      if (!pr.out) { niepelne++; return; }                             // brak wybicia → wyjątek, nie wykonanie
      const istnieje = wtAct(ts.actuals, s);
      if (istnieje && istnieje.source !== 'clock') { chronione++; return; }   // ręczna korekta ma pierwszeństwo
      const nowy = { start: pr.in, end: pr.out, breaks: (pr.breaks || []).map((b) => ({ platna: !!b.paid, start: b.start, end: b.end })), source: 'clock' };
      if (istnieje && istnieje.start === nowy.start && istnieje.end === nowy.end && JSON.stringify(istnieje.breaks || []) === JSON.stringify(nowy.breaks)) return;
      map[wtKey(s)] = nowy; n++;
    });
    if (n) data.tsPutActualsBulk(map);
    if (!cichy) {
      if (n) data.show(`Odbicia z REX Clock: ${n}${niepelne ? ` · ${niepelne} bez wybicia` : ''}${chronione ? ` · ${chronione} z ręczną korektą (bez zmian)` : ''}`);
      else data.show(niepelne || chronione ? `Bez zmian${niepelne ? ` · ${niepelne} bez wybicia` : ''}${chronione ? ` · ${chronione} ręcznych` : ''}` : 'Brak odbić z REX Clock dla tego dnia', 'error');
    }
  }, [day, locked, ts, data]);
  // auto-sync: przy wejściu w Wykonanie i co 60 s, dopóki widok otwarty
  useEffect(() => {
    if (trybDnia !== 'wykonanie' || locked) return;
    synchronizujOdbicia(true);
    const t = setInterval(() => synchronizujOdbicia(true), 60000);
    return () => clearInterval(t);
  }, [trybDnia, day, locked, synchronizujOdbicia]);

  const dateLabel = (d) => { const dt = new Date(d); return `${dniPelne[dt.getDay()]}, ${dt.getDate()} ${monthsGen[dt.getMonth()]} ${dt.getFullYear()}`; };

  if (view === 'list') {
    const wcLabel = 'PLK 201043 · Kraków Galeria Krakowska';
    const range = (w) => { const e = new Date(w.start); e.setDate(e.getDate() + 6); return `${w.start.slice(8)}.${w.start.slice(5, 7)} – ${ymd(e).slice(8)}.${ymd(e).slice(5, 7)}.${w.start.slice(0, 4)}`; };
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}><div className="page-wrap module-view workforce-view" style={{ width: '100%' }}>
          
          
          
          {wrTab === 'tna' && <TaLive data={data} />}
          
          
          {['schedule', 'actual'].includes(wrTab) && (() => {
            const stageOf = (w) => { const st = wsOf(w.start); if (st.closed) return 'Closed'; if (st.reviewed) return 'Reviewed'; if (weekDone(w)) return 'Completed'; return 'In progress'; };
            const godzTyg = (w) => data.shifts.filter((x) => w.days.includes(x.date) && !jestInstruktor(x)).reduce((a, x) => a + godzZ(x), 0);
            const kosztTyg = (w) => data.shifts.filter((x) => w.days.includes(x.date) && !jestInstruktor(x)).reduce((a, x) => a + kosztGodzin((x.accountId && (data.accounts || []).find((a2) => a2.id === x.accountId)) || null, godzZ(x)), 0);
            const widoczneRoty = weeks.filter((w) => {
              const q = rotaQuery.toLowerCase();
              const stg = stageOf(w);
              const okS = rotaStatus === 'Wszystkie statusy' || (rotaStatus === 'Do ułożenia' && stg === 'In progress') || rotaStatus === stg;
              return okS && (!q || range(w).toLowerCase().includes(q));
            });
            const toggleCompletedTydzien = (w) => { if (!canEdit) return; const st = wsOf(w.start); if (st.closed) return data.show('Tydzień zamknięty — najpierw otwórz (ASM)', 'error'); data.tsSetCompletedWeek(w.days, !weekDone(w)); };
            const toggleReviewedTydzien = (w) => { if (!canEdit) return; const st = wsOf(w.start); if (st.closed) return data.show('Tydzień zamknięty', 'error'); if (!weekDone(w)) return data.show('Najpierw wszystkie dni Completed', 'error'); data.tsSetWeek(w.start, { ...st, reviewed: !st.reviewed }); };
            const toggleClosedTydzien = (w) => { if (!canEdit) return; const st = wsOf(w.start); if (st.closed) { data.tsReopenWeek(w.start); return; } if (!weekDone(w)) return data.show('Najpierw wszystkie dni Completed', 'error'); data.tsCloseWeek(w.start); };
            const utworzTydzien = async () => {
              if (!nowyData) return data.show('Wybierz tydzień', 'error');
              const pon = wtMonday(nowyData);
              if (nowyTpl) {
                const det = await data.templateDetail(nowyTpl);
                if (det) {
                  const przypisania = {};
                  det.sloty.forEach((sl) => { if (sl.hint) przypisania[sl.id] = { name: sl.hint, accountId: sl.hintAccountId || undefined }; });
                  if (Object.keys(przypisania).length) await data.applyTemplate(nowyTpl, pon, przypisania);
                  else data.show('Blueprint nie ma podpowiedzi osób — otwieram pusty tydzień', 'error');
                }
              }
              setNowyOpen(false);
              setWeekStart(pon); setDay(pon); setView('week');
            };
            return (<>
            <div className="module-heading" style={{ marginTop: 4 }}>
              <div>
                <span>WORKFORCE • {wrTab === 'schedule' ? 'SCHEDULING • WEEKLY ROTAS' : wrTab === 'actual' ? 'WORKING TIME • ACTUAL' : 'TIME & ATTENDANCE'}</span>
                <h1>{wrTab === 'schedule' ? 'Schedule' : wrTab === 'actual' ? 'Actual' : 'Time & Attendance'}</h1>
                <p>{wrTab === 'schedule' ? 'Wybierz tydzień, sprawdź etap akceptacji i przejdź do grafiku tygodniowego lub dziennej siatki.' : wrTab === 'actual' ? 'Wykonanie zmian: odbicia z Employee Hub i terminala, przerwy oraz korekty kierownika.' : 'Karty czasu, wyjątki i zamknięcie tygodnia (Closed blokowane na serwerze).'}</p>
              </div>
              <div className="module-actions">
                <button className="secondary-action" onClick={() => { data.sync(); data.show('Lista tygodni została odświeżona.'); }}><RefreshCw size={16} /> Odśwież</button>
                {wrTab === 'schedule' && canEdit && <button className="primary-action" onClick={() => { setNowyData((() => { if (weeks.length) { const d = new Date(weeks[weeks.length - 1].start); d.setDate(d.getDate() + 7); return ymd(d); } const d = new Date(); const off = (8 - d.getDay()) % 7 || 7; d.setDate(d.getDate() + off); return ymd(d); })()); setNowyTpl(''); setNowyOpen(true); }}><Plus size={16} /> Nowy grafik</button>}
              </div>
            </div>

            <section className="panel rota-list-panel">
              <div className="rota-list-toolbar">
                <div className="rota-location-select"><span>WORK CENTER</span><label><LayoutGrid size={15} /><select aria-label="Centrum pracy"><option>PLK 201043 · Galeria Krakowska</option></select><ChevronDown size={14} /></label></div>
                <div className="rota-list-summary"><span><b>{weeks.filter((w) => stageOf(w) === 'In progress').length}</b> do ułożenia</span><span><b>{weeks.filter((w) => stageOf(w) === 'Reviewed').length}</b> do zamknięcia</span><span><b>{weeks.filter((w) => stageOf(w) === 'Closed').length}</b> closed</span></div>
                <div className="rota-list-filters"><label><Search size={14} /><input value={rotaQuery} onChange={(e) => setRotaQuery(e.target.value)} placeholder="Szukaj tygodnia" /></label><label><Filter size={14} /><select value={rotaStatus} onChange={(e) => setRotaStatus(e.target.value)}><option>Wszystkie statusy</option><option>Do ułożenia</option><option>Completed</option><option>Reviewed</option><option>Closed</option></select></label></div>
              </div>

              <div className="rota-list-table" role="table">
                <div className="rota-list-head" role="row"><span>TYDZIEŃ</span><span>STAN PLANU</span><span>COMPLETED</span><span>REVIEWED</span><span>CLOSED</span><span>GODZINY</span><span>KOSZT</span><span>OPCJE</span><span aria-hidden="true" /></div>
                {widoczneRoty.map((w) => { const st = wsOf(w.start); const stg = stageOf(w); return (
                  <div className={`rota-list-row ${rotaMenu === w.start ? 'menu-active' : ''}`} role="row" key={w.start}>
                    <button className="rota-week-cell" onClick={() => openWeek(w, wrTab === 'schedule' ? 'siatka' : 'wykonanie')}><Calendar size={17} /><span><strong>{range(w)}</strong><small>{w.days.length} dni ze zmianami</small></span></button>
                    <span className={`rota-stage stage-${stg.toLowerCase().replace(' ', '-')}`}><i />{stg}</span>
                    <button className={`rota-status-cell ${weekDone(w) ? 'done' : ''}`} title="Completed dla całego tygodnia" onClick={() => toggleCompletedTydzien(w)}>{weekDone(w) ? <Check size={15} /> : <span>—</span>}</button>
                    <button className={`rota-status-cell ${st.reviewed ? 'done' : ''}`} title="Reviewed" onClick={() => toggleReviewedTydzien(w)}>{st.reviewed ? <Check size={15} /> : <span>—</span>}</button>
                    <button className={`rota-status-cell ${st.closed ? 'closed' : ''}`} title={st.closed ? 'Otwórz ponownie (ASM, z powodem)' : 'Zamknij tydzień'} onClick={() => toggleClosedTydzien(w)}>{st.closed ? <Lock size={14} /> : <span>—</span>}</button>
                    <strong className="rota-number">{godzTyg(w).toFixed(1).replace('.', ',')} h</strong>
                    <strong className="rota-number">{Math.round(kosztTyg(w)).toLocaleString('pl-PL')} zł</strong>
                    <div className="rota-options-cell"><button aria-label="Opcje" onClick={() => setRotaMenu((v) => v === w.start ? null : w.start)}><MoreHorizontal size={17} /></button>{rotaMenu === w.start && <div className="rota-action-menu">
                      <button onClick={() => { setRotaMenu(null); openWeek(w, 'siatka'); }}><Calendar size={14} /> Podgląd tygodnia</button>
                      <button onClick={() => { setRotaMenu(null); openWeek(w, 'wykonanie'); }}><Clock size={14} /> Wykonanie (Actual)</button>
                      {st.closed && canEdit && <button onClick={() => { setRotaMenu(null); pobierzPayroll(w.start); }}><Download size={14} /> Payroll CSV</button>}
                      {st.closed ? <button onClick={() => { setRotaMenu(null); toggleClosedTydzien(w); }}><Lock size={14} /> Otwórz ponownie</button> : null}
                    </div>}</div>
                    <button className={`rota-open-button ${w.days.length ? 'has-data' : ''}`} onClick={() => openWeek(w, wrTab === 'schedule' ? 'siatka' : 'wykonanie')}><ChevronRight size={18} /></button>
                  </div>
                ); })}
                {widoczneRoty.length === 0 && <div className="rota-list-empty"><Search size={18} /><span><strong>Brak tygodni dla wybranych filtrów</strong><small>Zmień status, wyszukiwaną datę albo utwórz nowy grafik.</small></span></div>}
              </div>
              <footer className="rota-list-footer"><span>Wyświetlono {widoczneRoty.length} z {weeks.length} tygodni</span><small>Completed = gotowy do review • Reviewed = zatwierdzony • Closed = zamknięty i zablokowany na serwerze</small></footer>
            </section>

            {nowyOpen && <DialogS title="Nowy grafik tygodniowy" kicker="WORKFORCE • WEEKLY ROTAS" description="Wybierz tydzień i punkt startowy planowania." onClose={() => setNowyOpen(false)} actions={<><button onClick={() => setNowyOpen(false)}>Anuluj</button><button className="dialog-primary" onClick={utworzTydzien}><Plus size={15} /> Utwórz i otwórz</button></>}>
              <div className="dialog-form-grid">
                <label className="dialog-field">Tydzień (poniedziałek)<input type="date" value={nowyData} onChange={(e) => setNowyData(wtMonday(e.target.value))} /></label>
                <label className="dialog-field">Punkt startowy<select value={nowyTpl} onChange={(e) => setNowyTpl(e.target.value)}><option value="">Pusty grafik</option>{(data.templates || []).map((t) => <option key={t.id} value={t.id}>Blueprint: {t.name}</option>)}</select></label>
              </div>
              <div className="dialog-notice" style={{ marginTop: 14 }}><Check size={16} /><span>Dyspozycyjność, absencje, nakładanie i reguły umów są sprawdzane przy każdym zapisie zmiany.</span></div>
            </DialogS>}
            </>);
          })()}
          {wrTab === 'schedule' && canEdit && <div style={{ marginTop: 16 }}><PublishCard data={data} /></div>}
          {wrTab === 'blueprints' && canEdit && <BlueprintyWzor data={data} weeks={weeks} naGrafik={() => setWrTab('schedule')} />}
          {wrTab === 'cycles' && canEdit && <RotacjeWzor data={data} naGrafik={() => setWrTab('schedule')} />}
          {!canEdit && <p className="text-xs text-slate-400 mt-3">Widok kierownika zmiany — podgląd. Zamykanie i korekty wykonuje ASM.</p>}
        </div></div>
      </div>
    );
  }

  const sprzDnia = ((data.salesData || {}).sales || {})[day];
  const parDnia = ((data.salesData || {}).checks || {})[day];
  const wszystkieStacje = [...new Set(['MANAGER', 'MGR FUNKCYJNE', ...data.shifts.map((x) => x.station)])].filter(Boolean);
  const openStartRel = rows.length ? Math.min(...rows.map((s) => wtRel(s.start))) : 0;
  const openEndRel = rows.length ? Math.max(...rows.map((s) => wtRel(s.start) + wtDur(s.start, s.end))) : 0;
  const st = weekStart ? wsOf(weekStart) : { reviewed: false, closed: false };
  const chip = (on, txt, kol) => <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: on ? kol.bg : '#EDE3E6', color: on ? kol.fg : '#A38D95' }}>{txt}</span>;
  return (
    <div className={'flex-1 flex flex-col min-h-0 workforce-view module-view' + (fokus ? ' gantt-fullscreen' : '')}>
      {fokus ? (
        <header className="gantt-focus-header">
          <div className="gantt-focus-brand"><b style={{ color: '#741334', fontSize: 19, letterSpacing: '.2em', fontWeight: 850 }}>ORDO</b><span>WORKFORCE STUDIO</span></div>
          <div className="gantt-focus-context"><span>WORKFORCE • SCHEDULE • {weekDays[0].slice(8)}.{weekDays[0].slice(5, 7)}–{weekDays[6].slice(8)}.{weekDays[6].slice(5, 7)} {weekDays[6].slice(0, 4)}</span><strong>{zakresTyg === 'dzien' ? 'Grafik dzienny' : 'Grafik tygodniowy'}</strong><small>{zakresTyg === 'dzien' ? dateLabel(day) : 'Pełny ekran do układania grafiku'} • Kraków, Pawia</small></div>
          <div className="gantt-focus-tools" aria-label="Narzędzia grafiku">
            <button onClick={() => otworzWydruk(day)} title="Wydruk dnia"><Printer size={16} /><span>Wydruk</span></button>
            {zakresTyg === 'dzien' && <button disabled={locked} onClick={() => { data.tsToggleCompleted(day); data.show(!ts.completed[day] ? 'Dzień oznaczony jako Completed' : 'Zdjęto status Completed'); }}><Check size={16} /><span>{ts.completed[day] ? 'Completed' : 'Zamknij dzień'}</span></button>}
            <button disabled={data.loading} onClick={() => data.sync()}><RefreshCw size={16} /><span>{data.loading ? 'Zapisuję…' : 'Zapisz'}</span></button>
            <button className="focus-exit" onClick={() => setFokus(false)} title="Zamknij pełny ekran (Esc)"><X size={17} /><span>Zamknij</span></button>
          </div>
        </header>
      ) : (
        <div className="shrink-0" style={{ padding: '16px 26px 0' }}>
          <div className="module-heading" style={{ marginBottom: 10 }}>
            <div>
              <span>WORKFORCE • SCHEDULE • {weekDays[0].slice(8)}.{weekDays[0].slice(5, 7)}–{weekDays[6].slice(8)}.{weekDays[6].slice(5, 7)} {weekDays[6].slice(0, 4)}</span>
              <h1>{zakresTyg === 'dzien' ? 'Grafik dzienny' : 'Grafik tygodniowy'}</h1>
              <p>{zakresTyg === 'dzien' ? dateLabel(day) : 'Podgląd zmian całego zespołu — przewijaj dni poziomo, kolumna pracowników pozostaje na miejscu.'}{locked ? ' • tydzień zamknięty (tylko podgląd)' : ''}</p>
            </div>
            <div className="module-actions">
              <button className="secondary-action" onClick={() => setView('list')}><ChevronLeft size={16} /> Lista tygodni</button>
              <button className="secondary-action" title="Pełny ekran do układania grafiku (Esc aby wyjść)" onClick={() => setFokus(true)}><Monitor size={16} /> Pełny ekran</button>
              <button className="secondary-action" onClick={() => (zakresTyg === 'dzien' ? otworzWydruk(day) : setPrintOpen((v) => !v))}><Printer size={16} /> {zakresTyg === 'dzien' ? 'Drukuj ten dzień' : 'Wydruk dnia'}</button>
              {zakresTyg === 'dzien' && <button className={ts.completed[day] ? 'secondary-action' : 'primary-action'} disabled={locked} onClick={() => { data.tsToggleCompleted(day); data.show(!ts.completed[day] ? 'Dzień oznaczony jako Completed' : 'Zdjęto status Completed'); }}><Check size={16} /> {ts.completed[day] ? 'Completed' : 'Zamknij dzień'}</button>}
              <button className="primary-action" onClick={() => data.sync()} disabled={data.loading}><RefreshCw size={16} /> {data.loading ? 'Zapisuję…' : 'Zapisz / odśwież'}</button>
            </div>
          </div>
        </div>
      )}
      {(zakresTyg === 'dzien' || fokus) && (
        <div className="shrink-0" style={fokus ? { padding: '9px 12px 0' } : { padding: '0 26px' }}>
          <article className="panel daily-gantt-toolbar" style={{ marginBottom: fokus ? 0 : 12 }}>
            <div className="week-control">
              {zakresTyg === 'dzien' ? (<>
                <button onClick={() => idzDzien(-1)} aria-label="Poprzedni dzień"><ChevronLeft size={17} /></button>
                <strong>{dateLabel(day)}</strong>
                <button onClick={() => idzDzien(1)} aria-label="Następny dzień"><ChevronRight size={17} /></button>
                <button className="today-chip" onClick={() => setDay(weekDays[0])}>Początek tygodnia</button>
              </>) : (<>
                <button onClick={() => zmienTydzien(-7)} aria-label="Poprzedni tydzień"><ChevronLeft size={17} /></button>
                <strong>{weekDays[0].slice(8)}.{weekDays[0].slice(5, 7)} – {weekDays[6].slice(8)}.{weekDays[6].slice(5, 7)}.{weekDays[6].slice(0, 4)}</strong>
                <button onClick={() => zmienTydzien(7)} aria-label="Następny tydzień"><ChevronRight size={17} /></button>
              </>)}
            </div>
            <div className="gantt-filters">
              {zakresTyg === 'dzien' && <label><Search size={14} /><input value={szukajOs} onChange={(e) => setSzukajOs(e.target.value)} placeholder="Szukaj osoby" /></label>}
              {zakresTyg === 'dzien' && <label><Filter size={14} /><select value={stacjaF} onChange={(e) => setStacjaF(e.target.value)}><option value="">Wszystkie stanowiska</option>{wszystkieStacje.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>}
              {locked && <span style={{ color: '#B94352', fontSize: 11, fontWeight: 700 }}>🔒 tylko podgląd</span>}
              {fokus && <span className="gantt-focus-hint"><kbd>ESC</kbd> wyjście z widoku</span>}
            </div>
          </article>
        </div>
      )}

      {printOpen && !fokus && (
        <div className="shrink-0 px-5 py-2 flex items-center gap-2 flex-wrap border-b" style={{ backgroundColor: 'white', borderColor: colors.primary.bg }}>
          <span className="text-[11px] font-semibold" style={{ color: colors.primary.light }}>Grafik obsady (PDF) — wybierz dzień:</span>
          {weekDays.map((d, i) => (
            <button key={d} onClick={() => otworzWydruk(d)} className="px-2.5 py-1 rounded-md text-[11px] font-bold border" style={{ borderColor: colors.primary.bg, color: i >= 5 ? '#B94352' : colors.primary.dark }}>{['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'][i]} {new Date(d).getDate()}</button>
          ))}
        </div>
      )}

      {rosterData && <DailyRosterPrint open data={rosterData} onClose={() => setRosterData(null)} />}

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4" style={{ backgroundColor: colors.primary.bgLight }}>
        {zakresTyg === 'siatka' && <WeekPlanner data={data} days={weekDays} locked={locked || !canEdit} onDzien={(d) => { setDay(d); setZakresTyg('dzien'); }} onBack={() => setView('list')} />}

        {zakresTyg === 'dzien' && (<>
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border w-fit" style={{ borderColor: colors.primary.bg }}>
          {[['plan', 'Planowanie'], ['wykonanie', 'Wykonanie (Working Time)']].map(([k, l]) => (
            <button key={k} onClick={() => setTrybDnia(k)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: trybDnia === k ? colors.primary.medium : 'transparent', color: trybDnia === k ? 'white' : colors.primary.dark }}>{l}</button>
          ))}
        </div>

        {trybDnia === 'plan' && <DayPlanner data={data} day={day} locked={locked} szukaj={szukajOs} stacjaF={stacjaF} />}


        {trybDnia === 'wykonanie' && canEdit && !locked && (
          <div className="bg-white rounded-xl shadow-sm border" style={{ borderColor: colors.primary.bg }}>
            <button onClick={() => setAddOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold" style={{ color: colors.primary.darkest }}>
              <span className="flex items-center gap-2"><Plus size={16} style={{ color: colors.primary.medium }} />Dodaj zmianę — {dateLabel(day)}</span>
              {addOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {addOpen && (
              <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: '#EDE3E6' }}>
                <div className="grid md:grid-cols-4 gap-3 pt-3">
                  <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Pracownik</label>
                    <input list="wt-lista-kont" value={addOsoba} onChange={(e) => setAddOsoba(e.target.value)} placeholder="wpisz nazwisko…" className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} />
                    <datalist id="wt-lista-kont">{(data.accounts || []).map((a) => <option key={a.id} value={a.grafikName || a.name}>{a.name}</option>)}</datalist>
                  </div>
                  <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Stanowisko</label>
                    <select value={addStacja} onChange={(e) => setAddStacja(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}>{wszystkieStacje.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                  </div>
                  <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Od</label><input type="time" value={addOd} onChange={(e) => setAddOd(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
                  <div><label className="block text-[11px] mb-1" style={{ color: colors.primary.light }}>Do</label><input type="time" value={addDo} onChange={(e) => setAddDo(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} /></div>
                </div>
                <div>
                  <p className="text-[11px] mb-1.5" style={{ color: colors.primary.light }}>Szablony zmian (z arkusza SZABLONY):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SZAB.map(([a, b], i) => { const g = (h) => `${String(h % 24).padStart(2, '0')}:00`; const on = addOd === g(a) && addDo === g(b); return (
                      <button key={i} onClick={() => { setAddOd(g(a)); setAddDo(g(b)); }} className="px-2.5 py-1 rounded-lg text-xs font-mono" style={{ backgroundColor: on ? colors.primary.medium : colors.primary.bgLight, color: on ? 'white' : colors.primary.dark }}>{g(a)}–{g(b)}{b > 24 ? ' 🌙' : ''}</button>
                    ); })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button disabled={addSaving} onClick={async () => {
                    if (!addOsoba.trim()) return data.show('Podaj pracownika', 'error');
                    const konto = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((n) => String(n).toUpperCase().trim() === addOsoba.trim().toUpperCase()));
                    setAddSaving(true);
                    const ok = await data.addShiftManual({ date: day, name: addOsoba.trim(), station: addStacja, start: addOd, end: addDo, accountId: konto ? konto.id : undefined });
                    setAddSaving(false);
                    if (ok) setAddOsoba('');
                  }} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: colors.primary.medium }}>{addSaving ? 'Dodaję…' : 'Dodaj do grafiku'}</button>
                  <span className="text-xs" style={{ color: colors.primary.light }}>Zmiana trafia do grafiku. Wykonanie powstanie z odbić REX Clock lub ręcznej korekty. {(() => { const k = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((n) => String(n).toUpperCase().trim() === addOsoba.trim().toUpperCase())); return addOsoba.trim() ? (k ? `Konto: ${k.name}` : '⚠ brak konta o tej nazwie — zmiana zapisze się bez przypisania') : ''; })()}</span>
                </div>
              </div>
            )}
          </div>
        )}
        {trybDnia === 'wykonanie' && (<>
        <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl p-3 shadow-sm border" style={{ borderColor: colors.primary.bg }}>
          <span className="text-xs font-medium" style={{ color: colors.primary.light }}>Filtr / kolejność:</span>
          <select value={fStation} onChange={(e) => setFStation(e.target.value)} className="px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}><option value="">Wszystkie stanowiska</option>{stacje.map((s2) => <option key={s2} value={s2}>{s2}</option>)}</select>
          <select value={order} onChange={(e) => setOrder(e.target.value)} className="px-2 py-1.5 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }}><option value="entry">Kolejność wpisu</option><option value="az">Alfabetycznie</option><option value="diff">Wg różnicy</option></select>
          <span className="ml-auto flex items-center gap-2"><span className="text-[10.5px] font-medium" style={{ color: '#741334' }}>● auto-sync z REX Clock co 60 s</span><button disabled={locked} onClick={() => synchronizujOdbicia(false)} className="text-sm px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-40" style={{ backgroundColor: colors.primary.medium }}>Synchronizuj teraz</button></span>
        </div>
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto border" style={{ borderColor: colors.primary.bg }}>
          <div className="min-w-[820px]">
            <div className="flex items-stretch" style={{ backgroundColor: '#EDE3E6', borderBottom: `1px solid ${colors.primary.bg}` }}>
              <div className="w-64 shrink-0 px-3 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: colors.primary.dark }}>Pracownik</div>
              <div className="relative flex-1 h-8"><WTGrid />{WT_TICKS.map((h) => <span key={h} className="absolute top-1 text-[10px] font-medium text-slate-400" style={{ left: `calc(${((h - 6) * 60 / 1440) * 100}% + 2px)` }}>{String(h % 24).padStart(2, '0')}</span>)}{rows.length > 0 && <div className="absolute bottom-1 h-2 rounded" style={{ left: `${openStartRel / 1440 * 100}%`, width: `${(openEndRel - openStartRel) / 1440 * 100}%`, backgroundColor: '#741334' }} title="Public Opening Hours" />}</div>
              <div className="w-24 shrink-0 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-center" style={{ color: colors.primary.dark }}>Wykonanie</div>
            </div>
            <div className="flex items-center gap-4 px-3 py-1.5 text-[10px]" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: '#741334' }} />Public Opening Hours</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: colors.primary.bg }} />Plan (Shift)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: colors.primary.medium }} />Wykonanie (Actual)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: '#B94352' }} />Przerwa niepłatna</span>
            </div>
            {rows.length === 0 ? <p className="text-center text-slate-400 py-8">Brak zmian w tym dniu.</p> : rows.map((s, i) => {
              const a = act(s); const ma = hasAct(s); const dMin = ma ? actualNet(s) - wtDur(s.start, s.end) : 0; const tol = Math.abs(dMin) <= 5;
              return (
                <div key={i} className="flex items-stretch border-b last:border-0" style={{ borderColor: '#EDE3E6' }}>
                  <div className="w-64 shrink-0 px-3 py-2">
                    <p title={`W grafiku: ${s.name}`} className="text-sm font-semibold truncate flex items-center gap-1.5" style={{ color: colors.primary.darkest }}>{pelnaNazwa(s)}{s.dodana && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#F1E4E8', color: '#A7465F' }}>ręczna</span>}{s.dodana && !locked && <button title="Usuń zmianę" onClick={() => data.removeShiftManual({ sid: s.sid, date: s.date, name: s.name, start: s.start, end: s.end })} className="text-red-300 hover:text-red-500"><Trash2 size={13} /></button>}</p>
                    <div className="flex items-center justify-between mt-0.5"><span className="text-[11px]" style={{ color: stationColor(s.station) }}>{etykietaStacji(s)}</span>{ma ? <span className="text-[11px] font-medium" style={{ color: tol ? '#741334' : '#B94352' }}>{dMin >= 0 ? '+' : ''}{dMin}m</span> : <span className="text-[11px] font-medium" style={{ color: '#A7465F' }}>brak odbić</span>}</div>
                    <div className="flex gap-3 mt-1 text-[11px] text-slate-500"><span>Shift <b style={{ color: colors.primary.dark }}>{wtHours(wtDur(s.start, s.end))}</b></span><span>Actual <b style={{ color: colors.primary.dark }}>{ma ? wtHours(actualNet(s)) : '—'}</b></span></div>
                  </div>
                  <div className="relative flex-1 py-2"><WTGrid />
                    <div className="relative h-3.5 mb-1 rounded" style={{ backgroundColor: '#F7F1F3' }}><WTBar start={s.start} end={s.end} color={colors.primary.bg} /><div className="absolute inset-0 flex items-center pl-1 text-[9px] font-medium" style={{ color: colors.primary.dark }}>Shift {s.start}–{s.end}</div></div>
                    <div className="relative h-3.5 rounded" style={{ backgroundColor: '#F7F1F3' }}>{ma ? <><WTBar start={a.start} end={a.end} color={colors.primary.medium} breaks={a.breaks} /><div className="absolute inset-0 flex items-center pl-1 text-[9px] font-medium text-white/90">Actual {a.start}–{a.end}</div></> : <div className="absolute inset-0 flex items-center pl-1 text-[9px] font-medium" style={{ color: '#A7465F' }}>Brak odbić — wykonanie nie zostało utworzone</div>}</div>
                  </div>
                  <div className="w-24 shrink-0 px-2 py-2 flex flex-col items-center justify-center gap-1">
                    <div className="flex items-center gap-0.5"><input value={a.start} disabled={locked} onChange={(e) => setAct(s, { start: e.target.value })} className="w-11 px-1 py-0.5 rounded border text-[11px] text-center disabled:bg-slate-50" style={{ borderColor: colors.primary.bg }} /><input value={a.end} disabled={locked} onChange={(e) => setAct(s, { end: e.target.value })} className="w-11 px-1 py-0.5 rounded border text-[11px] text-center disabled:bg-slate-50" style={{ borderColor: colors.primary.bg }} /></div>
                    <button disabled={locked} onClick={() => setBrkFor(s)} className="text-[11px] px-2 py-0.5 rounded-lg disabled:opacity-40" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Przerwy{a.breaks.length ? ` (${a.breaks.length})` : ''}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {(() => {
          // A-12: odbicie bez zaplanowanej zmiany = jawny wyjątek, nie niewidzialna praca
          const planId = new Set(dayShifts(day).map((x) => x.accountId).filter(Boolean));
          const planNazwy = new Set(dayShifts(day).map((x) => String(x.name || '').toUpperCase().trim()));
          const bezPlanu = (projDnia || []).filter((pr) => pr.in && !(pr.accountId && planId.has(pr.accountId)) && !planNazwy.has(String(pr.name || '').toUpperCase().trim()));
          if (!bezPlanu.length) return null;
          return (
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: '#E3DCDD', borderLeftWidth: 4, borderLeftColor: '#A7465F' }}>
              <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b" style={{ borderColor: '#E3DCDD', backgroundColor: '#F7F1F3' }}>
                <p className="text-sm font-bold" style={{ color: '#A7465F' }}>Praca bez planu ({bezPlanu.length})</p>
                <p className="text-[11px]" style={{ color: colors.primary.light }}>Odbicia z REX Clock bez zaplanowanej zmiany — dodaj do grafiku, aby weszły do rozliczenia.</p>
              </div>
              {bezPlanu.map((pr) => { const konto = (data.accounts || []).find((a) => a.id === pr.accountId); return (
                <div key={pr.accountId || pr.name} className="px-4 py-2.5 flex flex-wrap items-center gap-3 border-b last:border-0" style={{ borderColor: '#faf3ea' }}>
                  <p className="text-sm font-semibold" style={{ color: colors.primary.darkest }}>{(konto && konto.name) || pr.name}</p>
                  <span className="text-xs font-mono font-semibold" style={{ color: colors.primary.dark }}>{pr.in}–{pr.out || '…'}</span>
                  {pr.out
                    ? <span className="text-xs" style={{ color: colors.primary.medium }}>{Math.round((pr.workedMin || 0) / 6) / 10} h netto{(pr.breaks || []).length ? ` · przerwy: ${pr.breaks.length}` : ''}</span>
                    : <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F1E4E8', color: '#741334' }}>teraz w pracy</span>}
                  {(pr.anomalies || []).filter((a2) => !a2.includes('brak wyjścia')).length > 0 && <span className="text-[11px]" style={{ color: '#B94352' }}>{pr.anomalies.filter((a2) => !a2.includes('brak wyjścia')).join(' · ')}</span>}
                  {canEdit && !locked && pr.out && (
                    <span className="ml-auto flex items-center gap-2">
                      <select defaultValue={wszystkieStacje[0]} id={`bp-st-${pr.accountId}`} className="px-2 py-1 rounded-lg border text-xs" style={{ borderColor: colors.primary.bg }}>{wszystkieStacje.map((x) => <option key={x} value={x}>{x}</option>)}</select>
                      <button onClick={async () => { const el = document.getElementById(`bp-st-${pr.accountId}`); const ok = await data.addShiftManual({ date: day, name: (konto && konto.grafikName) || pr.name, station: (el && el.value) || wszystkieStacje[0], start: pr.in, end: pr.out, accountId: pr.accountId || undefined }); if (ok) synchronizujOdbicia(true); }} className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold" style={{ backgroundColor: '#A7465F' }}>Dodaj do grafiku</button>
                    </span>
                  )}
                  {!pr.out && <span className="ml-auto text-[11px]" style={{ color: colors.primary.light }}>dodasz do grafiku po wybiciu</span>}
                </div>
              ); })}
            </div>
          );
        })()}
        <p className="text-xs text-slate-400">Górny pasek = plan (Shift), dolny = wykonanie (Actual); czerwony segment = przerwa niepłatna. Korekty nanoś po zakończeniu zmiany pracownika. Tolerancja 5 min (micros ↔ girnet).</p>
        </>)}
        </>)}
      </div>

      <div className="px-5 py-1.5 flex flex-wrap items-center gap-x-6 gap-y-1 border-t bg-white shrink-0" style={{ borderColor: colors.primary.bg }}>
          {[
            { l: 'Koszt (szac.)', v: `${f0(kpiTyg.koszt)} zł`, k: '#5A3542' },
            { l: 'Koszt / sprzedaż', v: kpiTyg.sprzedaz ? `${(kpiTyg.koszt / kpiTyg.sprzedaz * 100).toFixed(2).replace('.', ',')}%` : '—', k: kpiTyg.sprzedaz && kpiTyg.koszt / kpiTyg.sprzedaz > 0.2 ? '#B94352' : '#5A3542' },
            { l: 'Godziny', v: `${kpiTyg.h.toFixed(1).replace('.', ',')} h`, k: colors.primary.medium },
            { l: 'Nadmiar (h)', v: kpiTyg.exceso.toFixed(1).replace('.', ','), k: '#5A3542' },
            { l: 'Niedobór (h)', v: kpiTyg.defecto.toFixed(1).replace('.', ','), k: '#B94352' },
            { l: 'Sprzedaż / rbh', v: kpiTyg.sprzedaz && kpiTyg.h ? f0(kpiTyg.sprzedaz / kpiTyg.h) : '—', k: '#A7465F' },
          ].map((x, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: x.k }} />
              <span className="text-[9px] uppercase font-semibold" style={{ color: colors.primary.light }}>{x.l}</span>
              <span className="text-[12.5px] font-bold" style={{ color: colors.primary.darkest }}>{x.v}</span>
            </div>
          ))}
          <span className="ml-auto text-[10px]" style={{ color: colors.primary.light }}>{weekDays[0].slice(8)}.{weekDays[0].slice(5, 7)}–{weekDays[6].slice(8)}.{weekDays[6].slice(5, 7)} · vs zapotrzebowanie{Object.keys(((data.salesData || {}).sales) || {}).some((d) => weekDays.includes(d)) ? ' ze sprzedaży' : ' z krzywej'}</span>
      </div>
      {brkFor && <WTBreaks actual={act(brkFor)} locked={locked} onSave={(breaks) => data.tsPutActual(wtKey(brkFor), { ...act(brkFor), breaks })} onClose={() => setBrkFor(null)} />}
    </div>
  );
};

// ===================== DATA HOOK =====================

const useData = () => {
  const [shifts, setShifts] = useState([]);
  const [roster, setRoster] = useState([]);
  const [meta, setMeta] = useState({});
  const [months, setMonths] = useState([]);
  const monthsRef = useRef([]);
  useEffect(() => { monthsRef.current = months; }, [months]);
  const [planowanie, setPlanowanie] = useState({});
  const planRef = useRef({});
  useEffect(() => { planRef.current = planowanie; }, [planowanie]);
  const [swaps, setSwaps] = useState([]);
  const [ts, setTs] = useState({ actuals: {}, completed: {}, weekStatus: {} });
  const tsRef = useRef({ actuals: {}, completed: {}, weekStatus: {} });
  useEffect(() => { tsRef.current = ts; }, [ts]);
  const [accounts, setAccounts] = useState([]);
  const [budget, setBudget] = useState(null);
  const [salesData, setSalesData] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [availPending, setAvailPending] = useState(0);
  const [lastSync, setLastSync] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const show = (m, t = 'success') => setToast({ message: m, type: t });

  const sync = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/schedule');
      if (r.success) { setShifts(r.shifts || []); setRoster(r.roster || []); setMeta(r.meta || {}); setMonths(r.months || []); }
      const rp = await api('/planning');
      if (rp.success) setPlanowanie(rp.planowanie || {});
      const rs = await api('/swaps');
      if (rs.success) setSwaps(rs.swaps || []);
      const rt = await api('/timesheets');
      if (rt.success) setTs({ actuals: rt.actuals || {}, completed: rt.completed || {}, weekStatus: rt.weekStatus || {} });
      const ra = await api('/accounts');
      if (ra.success) setAccounts(ra.accounts || []);
      const rb = await api('/budget');
      if (rb.success) setBudget(rb.data || { employees: [], settings: null, sprzedaz: {}, transakcje: {}, dniS: {} });
      const rsl = await api('/sales');
      if (rsl.success) setSalesData({ sales: rsl.sales || {}, checks: rsl.checks || {}, params: rsl.params || null, meta: rsl.meta || null, braki: rsl.braki || [] });
      const rtpl = await api('/templates');
      if (rtpl.success) setTemplates(rtpl.templates || []);
      const rab = await api('/absences');
      if (rab.success) setAbsences(rab.absences || []);
      const rav = await api('/availability');
      if (rav.success) setAvailPending(rav.pending || 0);
    } catch { show('Błąd synchronizacji', 'error'); }
    setLastSync(new Date());
    setLoading(false);
  }, []);

  const importSchedule = useCallback(async (parsed) => {
    setLoading(true);
    try {
      const r = await api('/schedule', 'PUT', { shifts: parsed.shifts, roster: parsed.roster, meta: parsed.meta });
      if (r.success) {
        const brak = Object.keys(r.nieprzypisane || {}).length;
        show(brak
          ? `Zaimportowano ${parsed.shifts.length} zmian — przypisano do kont ${r.przypisane}, bez konta: ${Object.keys(r.nieprzypisane).slice(0, 3).join(', ')}${brak > 3 ? ` i ${brak - 3} więcej` : ''}`
          : `Zaimportowano ${parsed.shifts.length} zmian (${parsed.meta.monthName || r.month}) — wszystkie przypisane do kont`,
          brak ? 'error' : 'success');
        await sync();
      }
      else show('Błąd importu: ' + r.error, 'error');
    } catch { show('Błąd zapisu do bazy', 'error'); }
    setLoading(false);
  }, [sync]);

  const deleteMonth = useCallback(async (ym, label) => {
    setLoading(true);
    try {
      const r = await api(`/schedule?month=${encodeURIComponent(ym)}`, 'DELETE');
      if (r.success) { show(`Usunięto grafik: ${label || ym}`); await sync(); }
    } catch { show('Błąd', 'error'); }
    setLoading(false);
  }, [sync]);

  const clearSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/schedule', 'DELETE');
      if (r.success) { setShifts([]); setRoster([]); setMeta({}); setMonths([]); show('Wszystkie grafiki wyczyszczone'); }
    } catch { show('Błąd', 'error'); }
    setLoading(false);
  }, []);

  useEffect(() => { sync(); }, [sync]);

  // ── Akcje planowania (zapisują cały obiekt planu do backendu) ──
  const persistPlan = useCallback(async (next) => {
    planRef.current = next;
    setPlanowanie(next);
    try { await api('/planning', 'PUT', { planowanie: next }); } catch { show('Błąd zapisu planu', 'error'); }
  }, []);
  const setPlanTotal = useCallback((ym, val) => {
    const cur = planRef.current;
    persistPlan({ ...cur, [ym]: { ...(cur[ym] || {}), planTotal: Number(val) || 0 } });
  }, [persistPlan]);
  const applyGodziny = useCallback((ym, kind, mode, hours, date, weekdays) => {
    const h = Number(hours) || 0;
    let dates = [];
    if (mode === 'day' && date) dates = [date];
    else if (mode === 'month') dates = dniMiesiaca(ym);
    else if (mode === 'schemat') dates = dniMiesiaca(ym).filter(d => { const [Y, M, D] = d.split('-').map(Number); return (weekdays || []).includes(new Date(Y, M - 1, D).getDay()); });
    if (!dates.length) { show('Wybierz dzień lub dni', 'error'); return; }
    const cur = planRef.current;
    const mies = { ...(cur[ym] || {}) };
    const mapa = { ...(mies[kind] || {}) };
    dates.forEach(d => { if (h > 0) mapa[d] = h; else delete mapa[d]; });
    mies[kind] = mapa;
    persistPlan({ ...cur, [ym]: mies });
    show(`${kind === 'mgr' ? 'MGR' : 'MGR funkcyjne'}: ${h}h ${mode === 'month' ? 'na cały miesiąc' : mode === 'schemat' ? 'wg schematu' : 'w wybrany dzień'} (${dates.length} dni)`);
  }, [persistPlan]);
  const clearGodziny = useCallback((ym, kind) => {
    const cur = planRef.current;
    persistPlan({ ...cur, [ym]: { ...(cur[ym] || {}), [kind]: {} } });
    show('Wyczyszczono ręczne godziny');
  }, [persistPlan]);

  const refreshSwaps = useCallback(async () => {
    try { const rs = await api('/swaps'); if (rs.success) setSwaps(rs.swaps || []); } catch {}
  }, []);
  const approveSwap = useCallback(async (id, volunteer) => {
    const r = await api('/swaps', 'PUT', { id, action: 'approve', volunteer });
    if (r.success) { show(`Zamiana zatwierdzona — zmianę przejmuje ${r.swap.approvedVolunteer}`); await sync(); }
    else show(r.error || 'Błąd zatwierdzania', 'error');
  }, [sync]);
  const rejectSwap = useCallback(async (id) => {
    const r = await api('/swaps', 'PUT', { id, action: 'reject' });
    if (r.success) { show('Zamiana odrzucona'); await refreshSwaps(); }
    else show(r.error || 'Błąd', 'error');
  }, [refreshSwaps]);

  const persistTs = useCallback(async (next) => {
    tsRef.current = next; setTs(next);
    try { await api('/timesheets', 'PUT', { data: next }); } catch { show('Błąd zapisu czasu pracy', 'error'); }
  }, []);
  const tsPutActual = useCallback((key, actualObj) => { const cur = tsRef.current; persistTs({ ...cur, actuals: { ...cur.actuals, [key]: actualObj } }); }, [persistTs]);
  const tsPutActualsBulk = useCallback((map) => { const cur = tsRef.current; persistTs({ ...cur, actuals: { ...cur.actuals, ...map } }); }, [persistTs]);
  const tsToggleCompleted = useCallback((date) => { const cur = tsRef.current; persistTs({ ...cur, completed: { ...cur.completed, [date]: !cur.completed[date] } }); }, [persistTs]);
  const tsSetCompletedWeek = useCallback((dates, val) => { const cur = tsRef.current; const c = { ...cur.completed }; dates.forEach((d) => { c[d] = val; }); persistTs({ ...cur, completed: c }); }, [persistTs]);
  const tsSetWeek = useCallback((ws, statusObj) => { const cur = tsRef.current; persistTs({ ...cur, weekStatus: { ...cur.weekStatus, [ws]: statusObj } }); }, [persistTs]);
  // P4-02: CLOSED zmienia wyłącznie serwer (akcje z audytem); PUT odrzuca zmiany flagi
  const tsCloseWeek = useCallback(async (ws) => {
    const r = await api('/timesheets?action=close-week', 'POST', { week: ws });
    if (r.success) { const cur = tsRef.current; const next = { ...cur, weekStatus: { ...cur.weekStatus, [ws]: r.weekStatus } }; tsRef.current = next; setTs(next); show('Tydzień zamknięty (podpis: ' + (r.weekStatus.closedBy || '—') + ')'); }
    else show(r.error || 'Nie udało się zamknąć tygodnia', 'error');
    return r.success;
  }, []);
  const tsReopenWeek = useCallback(async (ws) => {
    const powod = prompt('Ponowne otwarcie zamkniętego tygodnia wymaga powodu (trafi do audytu):');
    if (powod == null || !powod.trim()) return false;
    const r = await api('/timesheets?action=reopen-week', 'POST', { week: ws, reason: powod.trim() });
    if (r.success) { const cur = tsRef.current; const next = { ...cur, weekStatus: { ...cur.weekStatus, [ws]: r.weekStatus } }; tsRef.current = next; setTs(next); show('Tydzień otwarty ponownie'); }
    else show(r.error || 'Nie udało się otworzyć tygodnia', 'error');
    return r.success;
  }, []);

  // Dodanie osoby do grafiku z poziomu planowania — od razu tworzy też wpis wykonania (Actual)
  // DATA-03: wysyłamy znaną wersję miesiąca; 409 = ktoś edytował równolegle → odśwież
  const wersjaMiesiaca = (date) => { const m = monthsRef.current.find((x) => x.key === String(date || '').slice(0, 7)); return m ? m.version : undefined; };
  // Import dopisujący (np. godziny MGR): dodaje do istniejącego grafiku, duplikaty pomijane
  const addHoursBulk = useCallback(async (shifts) => {
    const r = await api('/schedule?action=add-bulk', 'POST', { shifts });
    if (!r.success) { show(r.error || 'Nie udało się dopisać godzin', 'error'); return false; }
    await sync();
    const nie = Object.keys(r.nieprzypisane || {});
    show(`Dopisano ${r.dodane} zmian (${r.miesiace.join(', ')})${r.pominiete ? ` · ${r.pominiete} duplikatów pominięto` : ''}${nie.length ? ` · bez konta: ${nie.slice(0, 3).join(', ')}${nie.length > 3 ? '…' : ''}` : ''}`, nie.length ? 'error' : 'success');
    return true;
  }, [sync]);
  const ustawSzkolenie = useCallback(async (payload) => {
    const r = await api('/schedule?action=szkolenie', 'POST', payload);
    if (!r.success) { show(r.error || 'Nie udało się zapisać szkolenia', 'error'); return false; }
    await sync();
    show(r.uczen ? `Szkolenie: ${r.instruktor} szkoli ${r.uczen}` : `Rozpięto parę szkoleniową (${r.instruktor})`);
    return true;
  }, [sync]);
  const addShiftManual = useCallback(async (payload) => {
    const r = await api('/schedule?action=add', 'POST', { ...payload, expectedVersion: wersjaMiesiaca(payload.date) });
    if (!r.success) { if (r.konflikt) await sync(); show(r.error || 'Nie udało się dodać zmiany', 'error'); return false; }
    const sh = r.shift;
    await sync();                                        // COR-02: wykonanie powstaje wyłącznie z odbić / korekty
    if (r.warnings && r.warnings.length) show(`Dodano z ostrzeżeniem: ${r.warnings[0]}`, 'error');
    else show(`Dodano: ${sh.name} ${sh.start}–${sh.end} (grafik)`);
    return true;
  }, [sync]);

  const updateShiftManual = useCallback(async (ident, nowe) => {
    const r = await api('/schedule?action=update', 'POST', { ...ident, nowe, expectedVersion: wersjaMiesiaca(ident.date) });
    if (!r.success) { if (r.konflikt) await sync(); show(r.error || 'Nie udało się zapisać zmiany', 'error'); return false; }
    await sync();
    if (r.warnings && r.warnings.length) show(`Zapisano z ostrzeżeniem: ${r.warnings[0]}`, 'error');
    else show(`Zapisano: ${r.shift.name} ${r.shift.start}–${r.shift.end}`);
    return true;
  }, [sync]);

  const removeShiftManual = useCallback(async (payload) => {
    const r = await api('/schedule?action=remove', 'POST', { ...payload, expectedVersion: wersjaMiesiaca(payload.date) });
    if (!r.success) { if (r.konflikt) await sync(); show(r.error || 'Nie udało się usunąć', 'error'); return false; }
    await sync();
    show('Usunięto zmianę');
    return true;
  }, [sync]);

  // ── Szablony tygodniowe (Plantillas) ──
  const saveTemplate = useCallback(async (weekStart, name, notes) => {
    const r = await api('/templates?action=save', 'POST', { weekStart, name, notes });
    if (!r.success) { show(r.error || 'Nie udało się zapisać szablonu', 'error'); return false; }
    const rt = await api('/templates'); if (rt.success) setTemplates(rt.templates || []);
    show(`Szablon „${r.template.name}" zapisany (${r.template.sloty} slotów, ${r.template.zmian} zmian)`);
    return true;
  }, []);
  const templateDetail = useCallback(async (id) => {
    const r = await api('/templates?action=detail', 'POST', { id });
    return r.success ? r.template : null;
  }, []);
  const applyTemplate = useCallback(async (id, weekStart, przypisania) => {
    const r = await api('/templates?action=apply', 'POST', { id, weekStart, przypisania });
    if (!r.success) { show(r.error || 'Nie udało się zastosować szablonu', 'error'); return false; }
    await sync();                                        // COR-02: bez automatycznego Actual z planu
    show(`Zastosowano szablon: ${r.dodane.length} zmian (grafik)`);
    return true;
  }, [sync]);
  const deleteTemplate = useCallback(async (id) => {
    const r = await api(`/templates?id=${encodeURIComponent(id)}`, 'DELETE');
    if (!r.success) { show(r.error || 'Nie udało się usunąć', 'error'); return; }
    const rt = await api('/templates'); if (rt.success) setTemplates(rt.templates || []);
    show('Szablon usunięty');
  }, []);

  const przypiszZmiany = useCallback(async () => {
    const r = await api('/schedule?action=przypisz', 'POST', {});
    if (!r.success) { show(r.error || 'Nie udało się przypisać', 'error'); return; }
    await sync();
    const brak = Object.keys(r.nieprzypisane || {}).length;
    show(brak ? `Przypisano ${r.przypisane} z ${r.razem} zmian — ${brak} nazw bez konta` : `Przypisano wszystkie zmiany (${r.przypisane})`);
  }, [sync]);

  const refreshAccounts = useCallback(async () => { const r = await api('/accounts'); if (r.success) setAccounts(r.accounts || []); }, []);
  const addAccount = useCallback(async (f) => { const r = await api('/accounts', 'POST', f); if (r.success) { await refreshAccounts(); return { name: r.name, login: r.login, haslo: r.haslo }; } show(r.error || 'Błąd', 'error'); return null; }, [refreshAccounts]);
  const updateAccount = useCallback(async (id, patch) => { const r = await api('/accounts?id=' + id, 'PUT', patch); if (r.success) await refreshAccounts(); else show(r.error || 'Błąd', 'error'); }, [refreshAccounts]);
  const resetAccountPassword = useCallback(async (id) => { const r = await api('/accounts?action=reset&id=' + id, 'POST', {}); if (r.success) { await refreshAccounts(); return { name: r.name, login: r.login, haslo: r.haslo }; } show(r.error || 'Błąd', 'error'); return null; }, [refreshAccounts]);
  const deleteAccount = useCallback(async (id) => { const r = await api('/accounts?id=' + id, 'DELETE'); if (r.success) await refreshAccounts(); }, [refreshAccounts]);

  const saveSales = useCallback(async (patch) => {
    setSalesData((cur) => {
      const base = cur || { sales: {}, checks: {}, params: null };
      return { sales: { ...base.sales, ...(patch.sales || {}) }, checks: { ...base.checks, ...(patch.checks || {}) }, params: patch.params != null ? patch.params : base.params };
    });
    try { await api('/sales', 'PUT', patch); } catch { show('Błąd zapisu danych sprzedaży', 'error'); }
  }, []);
  const clearSales = useCallback(async () => { setSalesData({ sales: {}, checks: {}, params: null }); try { await api('/sales', 'DELETE'); } catch {} }, []);

  const saveBudget = useCallback(async (obj) => { setBudget(obj); try { await api('/budget', 'PUT', { data: obj }); } catch { show('Błąd zapisu budżetu', 'error'); } }, []);

  return { shifts, roster, meta, months, planowanie, swaps, ts, accounts, budget, salesData, loading, toast, setToast, show, sync, importSchedule, deleteMonth, clearSchedule, setPlanTotal, applyGodziny, clearGodziny, refreshSwaps, approveSwap, rejectSwap, tsPutActual, tsPutActualsBulk, tsToggleCompleted, tsSetWeek, addShiftManual, updateShiftManual, removeShiftManual, addAccount, updateAccount, resetAccountPassword, deleteAccount, saveBudget, saveSales, clearSales, przypiszZmiany, lastSync, templates, saveTemplate, templateDetail, applyTemplate, deleteTemplate, absences, availPending, tsCloseWeek, tsReopenWeek, addHoursBulk, ustawSzkolenie, tsSetCompletedWeek };
};

// ===================== MAIN =====================

export default function App() {
  const sesja = store.get('admin_session');
  const [authed, setAuthed] = useState(() => !!sesja);
  const [role, setRole] = useState(() => (sesja && sesja.role) || 'kierownik');
  const [userName, setUserName] = useState(() => (sesja && sesja.userName) || '');
  const [page, setPage] = useState('dashboard');
  const [wrTab, setWrTab] = useState('schedule');
  const [wrNonce, setWrNonce] = useState(0);
  const data = useData();
  const logout = () => { store.del('admin_session'); store.del('admin_token'); setAuthed(false); setRole('kierownik'); setUserName(''); setPage('dashboard'); };
  const onLogin = (r, un) => { setRole(r); setUserName(un || ''); setAuthed(true); setPage('dashboard'); };

  if (!authed) return <Login onLogin={onLogin} />;

  const pages = {
    dashboard: <Dashboard data={data} setPage={setPage} userName={userName} />,
    import: <ImportPage data={data} setPage={setPage} />,
    wt: <WorkingTime data={data} canEdit={role === 'asm'} wrTab={wrTab} setWrTab={setWrTab} wrNonce={wrNonce} />,
    print: <PrintPage data={data} />,
    forecast: <PlanFinanse data={data} setPage={setPage} />,
    live: <ObsadaLive data={data} setPage={setPage} />,
    plan: <PlanFinanse data={data} setPage={setPage} />,
    dyspo: <RequestsAdmin data={data} setPage={setPage} />,
    emps: <AdminEmployees data={data} />,
    analytics: <AnalyticsPage data={data} setPage={setPage} />,
    swaps: <AdminSwaps data={data} />,
    settings: <SettingsPage data={data} />
  };
  // Kierownik zmiany: strona domowa, grafik i wydruk. ASM: wszystko.
  const dozwolone = role === 'asm' ? Object.keys(pages) : ['dashboard', 'wt'];
  const widok = dozwolone.includes(page) ? page : 'dashboard';
  const pendingSwaps = data.swaps.filter(s => s.status === 'open' && s.volunteers.length > 0).length + (data.absences || []).filter(a => a.status === 'open').length + (data.availPending || 0);

  const [navMini, setNavMini] = useState(() => { try { return localStorage.getItem('ordoNavMini') === '1'; } catch { return false; } });
  const setMini = (v) => { setNavMini(v); try { localStorage.setItem('ordoNavMini', v ? '1' : '0'); } catch {} };
  const [navOpen, setNavOpen] = useState(false);
  const TYTULY = { dashboard: 'Dashboard', live: 'Obsada LIVE', forecast: 'Planowanie i popyt', plan: 'Planowanie i popyt', wt: 'WorkRhythm', dyspo: 'Dyspozycyjność', emps: 'Pracownicy i konta', analytics: 'Analityka', swaps: 'Zamiany i wnioski', import: 'Import / eksport godzin', print: 'Wydruk', settings: 'Ustawienia' };
  return (
    <main className="app-shell">
      <Sidebar page={widok} setPage={setPage} logout={logout} role={role} pendingSwaps={pendingSwaps} wrTab={wrTab} setWrTab={setWrTab} bumpWr={() => setWrNonce((n) => n + 1)} userName={userName} mini={navMini} setMini={setMini} open={navOpen} onClose={() => setNavOpen(false)} />
      <section className={'workspace' + (navMini ? ' mini' : '')} style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <header className="topbar" style={{ flexShrink: 0 }}>
          <button className="menu-button" aria-label="Otwórz menu" onClick={() => setNavOpen(true)}><Menu size={18} /></button>
          <div className="search"><Search size={18} /><input aria-label="Szukaj" placeholder="Szukaj pracownika, zmiany lub raportu…" onKeyDown={(e) => { if (e.key !== 'Enter') return; const q = e.target.value.toLowerCase().trim(); if (!q) return; const cele = { dashboard: 'dashboard', plan: 'forecast', popyt: 'forecast', live: 'live', obsad: 'live', prognoza: 'forecast', grafik: 'wt', schedule: 'wt', actual: 'wt', dyspo: 'dyspo', pracown: 'emps', konta: 'emps', zamian: 'swaps', wnios: 'swaps', import: 'import', analit: 'analytics', raport: 'analytics', ustaw: 'settings', audyt: 'settings' }; const hit = Object.keys(cele).find((k) => q.includes(k)); if (hit) setPage(cele[hit]); e.target.value = ''; }} /><kbd>Enter</kbd></div>
          <div className="top-actions">
            <button className="icon-button" title="Zamiany i wnioski" onClick={() => setPage('swaps')}><MessageSquare size={18} /></button>
            <button className="icon-button notification" title="Oczekujące decyzje" onClick={() => setPage('swaps')}><Bell size={18} />{pendingSwaps > 0 && <i />}</button>
            <div className="top-avatar">{(userName || 'ORDO').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()}</div>
          </div>
        </header>
        <div className={widok === 'wt' ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'flex-1 min-h-0 overflow-y-auto'}>{pages[widok] || pages.print}</div>
      </section>
      {navOpen && <button className="scrim" aria-label="Zamknij menu" onClick={() => setNavOpen(false)} />}
      {data.toast && <Toast message={data.toast.message} type={data.toast.type} onClose={() => data.setToast(null)} />}
    </main>
  );
}
