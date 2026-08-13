import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Cloud, Lock, Upload, Printer, Calendar, Users, LayoutGrid, RefreshCw, LogOut, Check, X, AlertCircle, FileSpreadsheet, Trash2, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, Home, Settings, Download, Clock } from 'lucide-react';
import { NSLOT as V4_NSLOT, slotLabel as v4SlotLabel, addCoverage as v4AddCoverage } from './planning/timeSlots.js';
import { coverageSummary as v4Coverage, upsample48to96 as v4Up96 } from './planning/coverageEngine.js';
import { parseGrafik } from './parseGrafik.js';
import { parseExportCSV } from './parseExport.js';
import { generateDayPDF, generateRangePDF } from './generatePDF.js';

const API_BASE = 'https://rex-cloud-backend.vercel.app/api';
// ^ Zmień na URL swojego backendu po wdrożeniu

const colors = {
  primary: { darkest: '#12423f', dark: '#315f5b', medium: '#59807c', light: '#96aaa9', bg: '#dfe6e5', bgLight: '#f4f7f6' },
  accent: { dark: '#101815', medium: '#2A3B37', light: '#59807c', bg: '#EDF1EF' }
};

const stationColors = {
  'PANIEROWANIE': '#7CB342', 'SMAŻENIE': '#E74C3C', 'KANAPKI / WRAPY': '#00A3E0',
  'KONTROLER': '#2F5D8A', 'WSPARCIE WIECZORNE / FLEX': '#9C27B0', 'DISPATCHER': '#FF7043',
  'PHU': '#00897B', 'DESERY / NAPOJE': '#EC407A', 'FRYTKI': '#FBC02D', 'ZMYWAK': '#64748B',
  'PREP': '#8D6E63', 'DOSTAWA': '#5C6BC0', 'MANAGER': '#12423f', 'MGR FUNKCYJNE': '#455A64',
  'SZKOLENIA': '#26A69A', 'TRAINING': '#26A69A', 'INSTRUKTOR': '#00796B'
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
const wtKey = (s) => `${s.name}|${s.date}|${s.station}|${s.start}|${s.end}`;
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
  if (s.status === 'approved') return { txt: `Zatwierdzona — przejęła: ${s.approvedVolunteer}`, kol: '#2E9E5B', bg: '#e9f7ef' };
  if (s.status === 'rejected') return { txt: 'Odrzucona', kol: '#E74C3C', bg: '#fdecea' };
  if (s.status === 'cancelled') return { txt: 'Anulowana', kol: '#94a3b8', bg: '#f1f5f9' };
  return s.volunteers.length ? { txt: `Zgłoszeń: ${s.volunteers.length}`, kol: '#F5B000', bg: '#fff8e6' } : { txt: 'Otwarta', kol: colors.primary.medium, bg: colors.primary.bgLight };
};
const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];

const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem('rex_admin_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('rex_admin_' + k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem('rex_admin_' + k); } catch {} }
};

const api = async (path, method = 'GET', body = null) => {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API_BASE}${path}`, opts);
  return r.json();
};

// ===================== UI =====================

const Btn = ({ children, variant = 'primary', icon: Icon, onClick, disabled, loading, className = '' }) => {
  const vars = {
    primary: { bg: `linear-gradient(135deg, ${colors.primary.medium}, ${colors.primary.dark})`, text: 'white' },
    secondary: { bg: colors.primary.bg, text: colors.primary.dark },
    danger: { bg: 'linear-gradient(135deg, #E74C3C, #c0392b)', text: 'white' },
    ghost: { bg: 'transparent', text: colors.primary.light },
    accent: { bg: `linear-gradient(135deg, ${colors.accent.dark}, ${colors.accent.medium})`, text: 'white' },
    success: { bg: 'linear-gradient(135deg, #7CB342, #558B2F)', text: 'white' }
  };
  const v = vars[variant] || vars.primary;
  return <button onClick={onClick} disabled={disabled || loading} className={`px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed text-sm ${className}`} style={{ background: v.bg, color: v.text }}>{loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4" />}{children}</button>;
};

const Toast = ({ message, type, onClose }) => { useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]); const bg = { success: '#7CB342', error: '#E74C3C', info: colors.primary.medium }[type] || colors.primary.medium; return <div className="fixed bottom-4 right-4 px-6 py-3 rounded-xl text-white shadow-lg z-50 flex items-center gap-2" style={{ backgroundColor: bg }}>{type === 'success' ? <Check className="w-5 h-5" /> : type === 'error' ? <X className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}{message}</div>; };

const StatCard = ({ label, value, icon: Icon, color }) => (<div className="bg-white rounded-2xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${color}` }}><div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '15', color }}><Icon className="w-5 h-5" /></div><p className="text-3xl font-bold mt-3" style={{ color: colors.primary.darkest }}>{value}</p><p className="text-sm mt-1" style={{ color: colors.primary.light }}>{label}</p></div>);

const Header = ({ title, subtitle, children }) => (
  <div className="border-b px-6 sticky top-0 z-10 flex items-center justify-between shrink-0" style={{ height: 62, backgroundColor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(14px)', borderColor: '#dfe6e5' }}>
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px]"><span style={{ color: '#8a9997' }}>REX Cloud</span><ChevronRight size={11} style={{ color: '#b3bebf' }} /><strong className="font-semibold" style={{ color: '#344c49' }}>{title}</strong></div>
      {subtitle && <p className="text-[11px] mt-0.5 truncate" style={{ color: '#71817f' }}>{subtitle}</p>}
    </div>
    <div className="flex items-center gap-2.5 shrink-0">{children}</div>
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
        if (r.success) { const un = r.userName || login.trim() || 'ASM'; store.set('admin_session', { at: Date.now(), role: r.role, userName: un }); onLogin(r.role, un); }
        else setErr(r.error || 'Błąd logowania');
      }
    } catch (e2) { setErr((e2 && e2.message) || 'Błąd połączenia z serwerem'); }
    setLoading(false);
  };
  const pole = "w-full pl-11 pr-4 py-3.5 rounded-lg border bg-white text-[15px] focus:outline-none focus:ring-2";
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: '#f0f2f2' }}>
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: '#12423f' }}><Cloud className="w-7 h-7 text-white" /></div>
          <span className="text-[26px] font-bold tracking-[0.35em]" style={{ color: '#12423f' }}>REX</span>
        </div>
        {err && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{err}</div>}
        {info && <div className="p-3 rounded-lg mb-4 text-sm" style={{ backgroundColor: '#e8f2ef', color: '#12655B' }}>{info}</div>}
        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <Users className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#b3bebf' }} />
            <input type="text" value={login} onChange={(e) => setLogin(e.target.value)} className={pole} style={{ borderColor: '#dfe6e5', color: '#162523' }} placeholder="Login" disabled={loading} autoFocus />
          </div>
          {!reset && (
            <div className="relative">
              <Lock className="w-[18px] h-[18px] absolute left-4 top-1/2 -translate-y-1/2" style={{ color: '#b3bebf' }} />
              <input type="password" value={haslo} onChange={(e) => setHaslo(e.target.value)} className={pole} style={{ borderColor: '#dfe6e5', color: '#162523' }} placeholder="PIN / hasło" disabled={loading} />
            </div>
          )}
          <button type="button" onClick={() => { setReset(!reset); setErr(''); setInfo(''); }} className="text-[13.5px] font-medium" style={{ color: '#315f5b' }}>
            {reset ? '← Wróć do logowania' : 'Nie pamiętasz hasła?'}
          </button>
          <button type="submit" disabled={loading || !login.trim()} className="w-full text-white font-semibold py-3.5 rounded-lg text-[15px] disabled:opacity-50" style={{ backgroundColor: '#12423f' }}>
            {loading ? 'Chwila…' : reset ? 'Wyślij zgłoszenie resetu do ASM' : 'Zaloguj się'}
          </button>
          {reset && <p className="text-[12px] text-center" style={{ color: '#71817f' }}>ASM zobaczy Twoje zgłoszenie w panelu, zresetuje hasło i przekaże Ci tymczasowy PIN. Przy pierwszym logowaniu w aplikacji pracownika ustawisz własny.</p>}
        </form>
      </div>
    </div>
  );
};

const Sidebar = ({ page, setPage, logout, role, pendingSwaps = 0, wrTab, setWrTab, bumpWr, userName }) => {
  const [zwiniety, setZwiniety] = useState(false);
  const SEKCJE = [
    { naglowek: 'Główne', items: [
      { id: 'dashboard', label: 'Dashboard', icon: Home },
      { id: 'forecast', label: 'Planowanie i popyt', icon: Clock },
    ] },
    { naglowek: 'WorkRhythm', items: [
      { id: 'wr-schedule', page: 'wt', wr: 'schedule', label: 'Schedule', icon: Calendar },
      { id: 'wr-actual', page: 'wt', wr: 'actual', label: 'Actual', icon: Clock },
      { id: 'wr-blueprints', page: 'wt', wr: 'blueprints', label: 'Blueprints', icon: FileSpreadsheet },
      { id: 'wr-cycles', page: 'wt', wr: 'cycles', label: 'ShiftCycles', icon: RefreshCw },
      { id: 'wr-tna', page: 'wt', wr: 'tna', label: 'Time & Attendance', icon: Check },
    ] },
    { naglowek: 'Zespół', items: [
      { id: 'emps', label: 'Pracownicy i konta', icon: Users },
      { id: 'swaps', label: 'Giełda zamian', icon: RefreshCw, badge: pendingSwaps },
    ] },
    { naglowek: 'Narzędzia', items: [
      { id: 'import', label: 'Import z Excel', icon: Upload },
      { id: 'print', label: 'Wydruk grafiku', icon: Printer },
    ] },
    { naglowek: 'System', items: [ { id: 'settings', label: 'Ustawienia', icon: Settings } ] },
  ];
  const widoczne = role === 'asm' ? null : ['dashboard', 'wt', 'print'];
  const sekcje = SEKCJE
    .map((g) => ({ ...g, items: g.items.filter((m) => !widoczne || widoczne.includes(m.page || m.id)) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="relative h-screen flex flex-col shrink-0 transition-all duration-200" style={{ width: zwiniety ? 72 : 248, background: `linear-gradient(180deg, #12423f 0%, #0d3431 100%)` }}>
      {/* zwijanie — okrągły przycisk na krawędzi */}
      <button onClick={() => setZwiniety((v) => !v)} title={zwiniety ? 'Rozwiń menu' : 'Zwiń menu'}
        className="absolute -right-3 top-16 z-40 w-6 h-6 rounded-full flex items-center justify-center bg-white shadow-md border"
        style={{ borderColor: colors.primary.bg, color: colors.primary.dark }}>
        {zwiniety ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>

      {/* logo */}
      <div className={`flex items-center gap-3 px-4 pt-5 pb-4 ${zwiniety ? 'justify-center px-0' : ''}`}>
        <div className="w-[37px] h-[37px] rounded-[11px] flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.16)' }}><Cloud className="w-[20px] h-[20px] text-white" /></div>
        {!zwiniety && <div className="leading-tight"><p className="text-white text-lg"><b className="font-bold">REX</b> <span className="font-light">Cloud</span></p><p className="text-[9px] font-bold tracking-[0.3em] text-white/40">WORKRHYTHM</p></div>}
      </div>

      {/* restauracja */}
      {!zwiniety && (
        <div className="mx-3 mb-2 px-3 py-2.5 rounded-xl flex items-center gap-2.5" style={{ backgroundColor: 'rgba(255,255,255,.07)' }}>
          <div className="w-[31px] h-[31px] rounded-[9px] flex items-center justify-center text-[10px] font-extrabold shrink-0" style={{ backgroundColor: '#fff', color: '#12423f' }}>PL</div>
          <div className="leading-tight min-w-0"><p className="text-[9px] font-bold tracking-wider text-white/40 uppercase">Restauracja</p><p className="text-[13px] font-semibold text-white truncate">PLK 201043 · Galeria Krakowska</p></div>
        </div>
      )}

      {/* nawigacja */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2 space-y-3">
        {sekcje.map((g) => (
          <div key={g.naglowek}>
            {!zwiniety && <p className="px-2 pt-3 pb-1 text-[8.5px] font-bold uppercase" style={{ letterSpacing: '1.25px', color: '#779a97' }}>{g.naglowek}</p>}
            {zwiniety && <div className="my-2 mx-3 border-t border-white/10" />}
            <div className="space-y-0.5">
              {g.items.map((m) => {
                const aktywny = page === (m.page || m.id) && (!m.wr || wrTab === m.wr);
                return (
                  <button key={m.id} title={zwiniety ? m.label : undefined}
                    onClick={() => { if (m.wr) { setWrTab && setWrTab(m.wr); bumpWr && bumpWr(); } setPage(m.page || m.id); }}
                    className={`w-full flex items-center gap-2.5 text-left transition-all ${zwiniety ? 'justify-center px-0' : 'px-3'}`} 
                    style={{ height: 41, borderRadius: 9, fontSize: 12.5, color: aktywny ? '#fff' : '#a9c0be', backgroundColor: aktywny ? 'rgba(255,255,255,.12)' : 'transparent', boxShadow: aktywny ? 'inset 3px 0 0 #b8d0cd' : 'none' }}
                    onMouseEnter={(e) => { if (!aktywny) { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = '#fff'; } }}
                    onMouseLeave={(e) => { if (!aktywny) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#a9c0be'; } }}>
                    <m.icon className="w-[18px] h-[18px] shrink-0" />
                    {!zwiniety && <span className="text-[13.5px] font-medium truncate">{m.label}</span>}
                    {m.badge > 0 && !zwiniety && <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: '#d87b52' }}>{m.badge}</span>}
                    {m.badge > 0 && zwiniety && <span className="absolute translate-x-3 -translate-y-2 w-2 h-2 rounded-full" style={{ backgroundColor: '#d87b52' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* użytkownik */}
      <div className={`mx-3 mt-0 px-2 pt-3 pb-2 flex items-center gap-2.5 ${zwiniety ? 'justify-center px-0' : ''}`} style={{ borderTop: '1px solid rgba(255,255,255,.08)' }}>
        <div className="w-[31px] h-[31px] rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0" style={{ backgroundColor: '#d4e1df', color: '#12423f' }}>{(userName || (role === 'asm' ? 'AS' : 'PL')).split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</div>
        {!zwiniety && (<>
          <div className="leading-tight min-w-0 flex-1"><p className="text-[13px] font-semibold text-white truncate">{userName || (role === 'asm' ? 'ASM' : 'PLK 201043')}</p><p className="text-[10px] text-white/45">{role === 'asm' ? 'ASM · pełny dostęp' : 'Kierownik zmiany'}</p></div>
          <button onClick={logout} title="Wyloguj się" className="text-red-300 hover:text-red-400 shrink-0"><LogOut className="w-[17px] h-[17px]" /></button>
        </>)}
      </div>
      {zwiniety && <button onClick={logout} title="Wyloguj się" className="mb-3 mx-auto text-red-300 hover:text-red-400"><LogOut className="w-[17px] h-[17px]" /></button>}
    </div>
  );
};

const Dashboard = ({ data, setPage, userName }) => {
  const [mkeyS, setMkeyS] = useState(null);
  const [resetReqsN, setResetReqsN] = useState(0);
  useEffect(() => { api('/admin-auth', 'GET').then((r) => { if (r && r.success) setResetReqsN((r.resetReqs || []).length); }).catch(() => {}); }, []);
  const msc = data.months || [];
  const mkey = mkeyS || (msc.length ? msc[msc.length - 1].key : null);
  const mShifts = mkey ? data.shifts.filter(s => (s.date || '').slice(0, 7) === mkey) : data.shifts;
  const mLabel = (msc.find(m => m.key === mkey) || {}).label || '—';
  // Instruktor (osoba szkoląca) liczony do CREW; uczeń do szkoleniowych. Obie osoby liczone.
  const gCrew = mShifts.filter(s => !jestMgr(s.station) && !jestSzkolenie(s)).reduce((a, s) => a + godzZ(s), 0);
  const gSzk = mShifts.filter(s => jestUczen(s) || jestSzkStacja(s)).reduce((a, s) => a + godzZ(s), 0);
  const gMgrSched = mShifts.filter(s => jestMgr(s.station)).reduce((a, s) => a + godzZ(s), 0);
  const plMies = (data.planowanie || {})[mkey] || {};
  const gManual = sumaDodatkow(plMies.mgr) + sumaDodatkow(plMies.mgrFunk);   // ręczne godziny MGR + funkcyjne (ten miesiąc)
  const gMgr = gMgrSched + gManual;

  // Struktura załogi — z modułu Pracownicy (konta)
  const acc = data.accounts || [];
  const ile = (f) => acc.filter(a => a.funkcja === f).length;
  const nCrew = ile('CREW'), nInstr = acc.filter(a => a.funkcja === 'CREW' && a.instruktor).length;
  const zaloga = [
    { label: 'Pracownicy restauracji', val: nCrew, sub: `w tym instruktorów: ${nInstr}`, color: '#3A6EA5' },
    { label: 'Młodsi kierownicy zmiany', val: ile('JSM'), color: '#7A5FB0' },
    { label: 'Kierownicy zmiany', val: ile('SM'), color: '#5C4B8A' },
    { label: 'Zastępcy kierownika', val: ile('ASM'), color: '#2F6FB5' },
    { label: 'Kierownik restauracji', val: ile('RGM'), color: '#12423f' },
  ];
  // Wykresy z Pulpitu — na danych bieżącego miesiąca
  const sales = ((data.salesData || {}).sales) || {};
  const dniWyk = useMemo(() => {
    if (!mkey) return [];
    const [y, m] = mkey.split('-').map(Number);
    const dim = new Date(y, m, 0).getDate();
    return Array.from({ length: dim }, (_, i) => {
      const ds = `${mkey}-${String(i + 1).padStart(2, '0')}`;
      return { d: i + 1, ds, dow: new Date(ds).getDay(), sprzedaz: sales[ds] || 0 };
    }).filter((x) => x.sprzedaz > 0);
  }, [mkey, data.salesData]);
  const zalogaMapD = useMemo(() => {
    const m = {};
    mShifts.filter((x) => !jestInstruktor(x)).forEach((x) => { const k = String(x.name || '').toUpperCase().trim(); m[k] = (m[k] || 0) + godzZ(x); });
    return m;
  }, [mShifts]);
  const rankingDni = [...Array(7)].map((_, i) => {
    const g = mShifts.filter((x) => new Date(x.date).getDay() === i && !jestInstruktor(x));
    const h = g.reduce((a, x) => a + godzZ(x), 0);
    const sp = dniWyk.filter((x) => x.dow === i).reduce((a, x) => a + x.sprzedaz, 0);
    return { n: ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'][i], v: h ? sp / h : 0 };
  });

  // Dzien dobry - realne dane biezacego tygodnia i dnia (silnik 15 min)
  const dzisD = new Date();
  const dzis = ymd(dzisD);
  const ponD = new Date(dzisD); ponD.setDate(dzisD.getDate() - ((dzisD.getDay() + 6) % 7));
  const tydzien = Array.from({ length: 7 }, (_, i) => { const d = new Date(ponD); d.setDate(ponD.getDate() + i); return ymd(d); });
  const salesAll = ((data.salesData || {}).sales) || {};
  const ztyg = data.shifts.filter((x) => tydzien.includes(x.date) && !jestInstruktor(x));
  const poIdA = new Map((data.accounts || []).map((a) => [a.id, a]));
  const poNazA = new Map((data.accounts || []).flatMap((a) => [a.grafikName, ...(a.aliasy || [])].filter(Boolean).map((n) => [String(n).toUpperCase().trim(), a])));
  let planTygH = 0, kosztTyg = 0;
  ztyg.forEach((x) => { const g = godzZ(x); planTygH += g; kosztTyg += kosztGodzin(poIdA.get(x.accountId) || poNazA.get(String(x.name || '').toUpperCase().trim()), g); });
  const sprzedazTyg = tydzien.reduce((a, d) => a + (salesAll[d] || 0), 0);
  let defTyg = 0;
  const PORY = [['06-10', 0, 16], ['10-14', 16, 32], ['14-18', 32, 48], ['18-22', 48, 64], ['22-02', 64, 80], ['02-06', 80, 96]];
  const heatTyg = [];
  tydzien.forEach((d) => {
    const sp = salesAll[d] || 0;
    const { dir, ind } = optRozbicie(sp, 420, 3, sp ? 'sprzedaz' : 'krzywa', new Date(d).getDay());
    const req96 = v4Up96(dir.map((v, i) => Math.max(v, ind[i])));
    const s96 = new Float64Array(V4_NSLOT);
    ztyg.filter((x) => x.date === d).forEach((x) => v4AddCoverage(s96, x.start, x.end));
    const cs = v4Coverage(req96, s96);
    defTyg += cs.deficitH;
    heatTyg.push(PORY.map(([, a, b]) => { let rq = 0, sc = 0; for (let i = a; i < b; i++) { rq += req96[i]; sc += s96[i]; } return { rq, sc }; }));
  });
  const completedDni = tydzien.filter((d) => (data.ts.completed || {})[d]).length;
  const spDzis = salesAll[dzis] || 0;
  const { dir: dD, ind: iD } = optRozbicie(spDzis, 420, 3, spDzis ? 'sprzedaz' : 'krzywa', dzisD.getDay());
  const req96D = v4Up96(dD.map((v, i) => Math.max(v, iD[i])));
  const sch96D = new Float64Array(V4_NSLOT);
  data.shifts.filter((x) => x.date === dzis && !jestInstruktor(x)).forEach((x) => v4AddCoverage(sch96D, x.start, x.end));
  const covD = v4Coverage(req96D, sch96D);
  let okno = null, a0 = -1, maxDef = 0;
  covD.perSlot.forEach((sl2, i) => {
    if (sl2.def > 0.01) { if (a0 < 0) a0 = i; maxDef = Math.max(maxDef, sl2.def); }
    else if (a0 >= 0) { if (!okno || i - a0 > okno.b - okno.a) okno = { a: a0, b: i, n: maxDef }; a0 = -1; maxDef = 0; }
  });
  if (a0 >= 0 && (!okno || V4_NSLOT - a0 > okno.b - okno.a)) okno = { a: a0, b: V4_NSLOT, n: maxDef };
  const otwarteZamiany = (data.swaps || []).filter((x) => x.status === 'open').length;
  const preM = dzis.slice(0, 7);
  const znaneNazwy = new Set((data.accounts || []).flatMap((a) => [a.grafikName, ...(a.aliasy || [])].filter(Boolean).map((n) => String(n).toUpperCase().trim())));
  const bezKontaN = new Set(data.shifts.filter((x) => (x.date || '').startsWith(preM) && !x.accountId && !znaneNazwy.has(String(x.name || '').toUpperCase().trim())).map((x) => String(x.name).toUpperCase())).size;
  const dniDoZamkniecia = tydzien.filter((d) => d < dzis && !(data.ts.completed || {})[d] && data.shifts.some((x) => x.date === d)).length;
  const zadania = [
    okno && { ik: '!', txt: `Uzupełnij obsadę dziś ${v4SlotLabel(okno.a)}-${v4SlotLabel(Math.min(okno.b, V4_NSLOT - 1))} (brakuje ${Math.ceil(okno.n)} os.)`, tag: 'Planowanie', go: 'wt', pilne: true },
    otwarteZamiany > 0 && { ik: 'Z', txt: `Rozpatrz ${otwarteZamiany} zgłoszeń na giełdzie zamian`, tag: 'Zespół', go: 'swaps' },
    bezKontaN > 0 && { ik: 'K', txt: `Przypisz ${bezKontaN} nazw z grafiku do kont`, tag: 'Pracownicy', go: 'emps' },
    dniDoZamkniecia > 0 && { ik: 'T', txt: `Oznacz ${dniDoZamkniecia} minione dni jako Completed`, tag: 'Time & Attendance', go: 'wt' },
    resetReqsN > 0 && { ik: 'H', txt: `${resetReqsN} ${resetReqsN === 1 ? 'zgłoszenie resetu hasła' : 'zgłoszenia resetu hasła'}`, tag: 'Ustawienia', go: 'settings', pilne: true },
  ].filter(Boolean);

  const stats = [
    { label: 'Zmiany (wszystkie miesiące)', val: data.shifts.length, icon: Calendar, color: colors.primary.medium },
    { label: 'Konta pracowników', val: acc.length, icon: Users, color: '#9C27B0' },
    { label: 'Załadowane miesiące', val: msc.length, icon: LayoutGrid, color: colors.accent.dark }
  ];
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Dashboard" subtitle="Przegląd systemu REX Cloud · WorkRhythm" />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: '#59807c' }}>{dniPelne[dzisD.getDay()].toUpperCase()}, {dzisD.getDate()} {['STYCZNIA','LUTEGO','MARCA','KWIETNIA','MAJA','CZERWCA','LIPCA','SIERPNIA','WRZESNIA','PAZDZIERNIKA','LISTOPADA','GRUDNIA'][dzisD.getMonth()]}</p>
            <h1 className="text-[26px] font-bold mt-1" style={{ color: '#162523' }}>Dzień dobry, {(userName || 'PLK 201043').split(' ')[0]}</h1>
            <p className="text-[13px] mt-0.5" style={{ color: '#71817f' }}>PLK 201043 · Galeria Krakowska · najważniejsze informacje na dziś.</p>
          </div>
          <button onClick={() => setPage && setPage('wt')} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white flex items-center gap-2" style={{ backgroundColor: '#12423f', boxShadow: '0 8px 20px rgba(18,66,63,.18)' }}><Calendar size={15} /> Otwórz grafik</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          {[
            ['Sprzedaż tygodnia', sprzedazTyg ? f0(sprzedazTyg) + ' zł' : '—', sprzedazTyg ? tydzien.filter((d) => salesAll[d]).length + ' / 7 dni z danymi' : 'brak importu', null],
            ['Plan Hours', planTygH.toFixed(1).replace('.', ',') + ' h', 'bieżący tydzień', null],
            ['Koszt pracy', f0(kosztTyg) + ' zł', 'szacunek wg stawek', null],
            ['Coverage dziś', covD.coveragePct.toFixed(1).replace('.', ',') + '%', 'cel >= 95%', covD.coveragePct >= 95 ? 'ok' : 'zle'],
            ['SPLH', sprzedazTyg && planTygH ? f0(sprzedazTyg / planTygH) : '—', 'cel >= 420 zł/rbh', sprzedazTyg && planTygH && sprzedazTyg / planTygH >= 420 ? 'ok' : null],
            ['COL', sprzedazTyg ? (kosztTyg / sprzedazTyg * 100).toFixed(1).replace('.', ',') + '%' : '—', 'target <= 20%', sprzedazTyg && kosztTyg / sprzedazTyg <= 0.2 ? 'ok' : sprzedazTyg ? 'zle' : null],
            ['Deficit tyg.', defTyg.toFixed(2).replace('.', ',') + ' h', 'silnik 15 min', defTyg > 0.01 ? 'zle' : 'ok'],
            ['Completed', completedDni + ' / 7', 'dni zamknięte', null],
          ].map(([l, v, h, ton], i) => (
            <div key={i} className="rounded-xl px-3 py-2.5 border" style={{ borderColor: '#dfe6e5', boxShadow: '0 1px 2px rgba(18,66,63,.04)', backgroundColor: ton === 'zle' ? '#fff0ed' : 'white' }}>
              <p className="text-[9px] font-semibold uppercase" style={{ color: '#8a9997' }}>{l}</p>
              <p className="text-[16px] font-bold mt-0.5" style={{ color: ton === 'zle' ? '#bd4f45' : ton === 'ok' ? '#12423f' : '#162523' }}>{v}</p>
              <p className="text-[9px]" style={{ color: '#96aaa9' }}>{h}</p>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
          <div className="rounded-2xl p-6 flex items-center gap-6 text-white" style={{ background: 'linear-gradient(120deg, #12423f, #315f5b)', boxShadow: '0 8px 24px rgba(18,66,63,.18)' }}>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold tracking-[0.15em]" style={{ color: '#b8d0cd' }}>OPERACJA NA DZIŚ</p>
              <h2 className="text-[20px] font-bold mt-2 leading-snug">{okno ? 'Obsada dnia wymaga decyzji.' : covD.requiredH > 0 ? 'Obsada dnia domknięta.' : 'Brak grafiku na dziś.'}</h2>
              <p className="text-[12.5px] mt-1.5" style={{ color: '#d8e5e3' }}>
                {okno ? 'Między ' + v4SlotLabel(okno.a) + ' a ' + v4SlotLabel(Math.min(okno.b, V4_NSLOT - 1)) + ' brakuje ' + Math.ceil(okno.n) + ' os. — łączny niedobór dnia ' + covD.deficitH.toFixed(2).replace('.', ',') + ' h.'
                  : covD.requiredH > 0 ? 'Pokrycie ' + covD.coveragePct.toFixed(0) + '% bez niedoborów wg silnika 15-minutowego' + (covD.excessH > 0.5 ? '; zapas ' + covD.excessH.toFixed(1).replace('.', ',') + ' h do ewentualnego przycięcia' : '') + '.'
                  : 'Dodaj zmiany w Schedule albo nałóż Blueprint na ten tydzień.'}
              </p>
              <button onClick={() => setPage && setPage('wt')} className="mt-3 text-[12px] font-semibold flex items-center gap-1.5 px-3 py-2 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,.14)' }}>{okno ? 'Rozwiąż niedobór' : 'Sprawdź plan dnia'} <ChevronRight size={13} /></button>
            </div>
            <div className="text-center shrink-0 px-4">
              <p className="text-[10px]" style={{ color: '#b8d0cd' }}>Pokrycie dziś</p>
              <p className="text-[42px] font-bold leading-none mt-1">{covD.coveragePct.toFixed(0)}<span className="text-[16px] font-medium" style={{ color: '#b8d0cd' }}>%</span></p>
            </div>
          </div>
          <div className="rounded-2xl bg-white border p-5" style={{ borderColor: '#dfe6e5', boxShadow: '0 8px 24px rgba(18,66,63,.045)' }}>
            <h2 className="text-[15px] font-bold" style={{ color: '#162523' }}>Do zrobienia</h2>
            <p className="text-[11px] mb-3" style={{ color: '#71817f' }}>{zadania.length ? zadania.length + (zadania.length === 1 ? ' zadanie wymaga uwagi' : ' zadania wymagają uwagi') : 'wszystko na bieżąco'}</p>
            <div className="space-y-1.5">
              {zadania.map((z, i) => (
                <button key={i} onClick={() => setPage && setPage(z.go)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-slate-50 border" style={{ borderColor: '#eef2f1' }}>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0" style={{ backgroundColor: z.pilne ? '#fff0ed' : '#e8f2ef', color: z.pilne ? '#bd4f45' : '#347363' }}>{z.ik}</span>
                  <span className="min-w-0 flex-1"><span className="block text-[12.5px] font-semibold truncate" style={{ color: '#162523' }}>{z.txt}</span><span className="block text-[10px]" style={{ color: '#96aaa9' }}>{z.tag}</span></span>
                  <ChevronRight size={15} style={{ color: '#b3bebf' }} />
                </button>
              ))}
              {zadania.length === 0 && <p className="text-[12px] py-4 text-center" style={{ color: '#96aaa9' }}>Brak zaległości — grafik, konta i zamiany są ogarnięte.</p>}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white border p-5" style={{ borderColor: '#dfe6e5', boxShadow: '0 8px 24px rgba(18,66,63,.045)' }}>
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div><h2 className="text-[15px] font-bold" style={{ color: '#162523' }}>Coverage heatmap</h2><p className="text-[11px]" style={{ color: '#71817f' }}>bieżący tydzień × pory dnia · silnik 15 min</p></div>
            <div className="flex gap-3 text-[10px]" style={{ color: '#71817f' }}><span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#e8f2ef' }} /> pokrycie</span><span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#fff2e8' }} /> nadmiar</span><span className="flex items-center gap-1"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#fff0ed' }} /> niedobór</span></div>
          </div>
          <div className="mt-3 grid" style={{ gridTemplateColumns: '44px repeat(6, 1fr)', gap: 4 }}>
            <span />
            {PORY.map(([l]) => <span key={l} className="text-[10px] text-center font-semibold" style={{ color: '#8a9997' }}>{l}</span>)}
            {heatTyg.map((row, di) => (<React.Fragment key={di}>
              <span className="text-[11px] font-bold flex items-center" style={{ color: tydzien[di] === dzis ? '#12423f' : '#71817f' }}>{['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'][di]}</span>
              {row.map((c, pi) => {
                const pct = c.rq > 0 ? (c.sc / c.rq) * 100 : null;
                const pusty = c.rq === 0 && c.sc === 0;
                const kol = pusty ? '#f4f7f6' : pct === null ? '#fff2e8' : pct < 95 ? '#fff0ed' : pct > 112 ? '#fff2e8' : '#e8f2ef';
                const tk = pusty ? '#b3bebf' : pct === null ? '#a46135' : pct < 95 ? '#bd4f45' : pct > 112 ? '#a46135' : '#347363';
                return <span key={pi} className="rounded-lg text-[11px] font-bold text-center py-2" title={`${['Pn','Wt','Śr','Cz','Pt','So','Nd'][di]} ${PORY[pi][0]} — plan ${(c.sc * 0.25).toFixed(1)} h / potrzeba ${(c.rq * 0.25).toFixed(1)} h`} style={{ backgroundColor: kol, color: tk }}>{pusty ? '—' : pct === null ? 'zapas' : Math.round(pct) + '%'}</span>;
              })}
            </React.Fragment>))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6">{stats.map((s, i) => <StatCard key={i} label={s.label} value={s.val} icon={s.icon} color={s.color} />)}</div>

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #3A6EA5' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><Users className="w-5 h-5" style={{ color: '#3A6EA5' }} /><h3 className="text-lg font-semibold" style={{ color: colors.primary.darkest }}>Struktura załogi</h3></div>
            <button onClick={() => setPage('emps')} className="text-sm px-3 py-1.5 rounded-lg" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Zarządzaj</button>
          </div>
          {acc.length === 0 ? <p className="text-slate-400 text-sm">Brak kont. Dodaj pracowników w module „Pracownicy".</p> : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {zaloga.map((z, i) => (
                <div key={i} className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.primary.bgLight }}>
                  <p className="text-2xl font-bold" style={{ color: z.color }}>{z.val}</p>
                  <p className="text-xs" style={{ color: colors.primary.dark }}>{z.label}</p>
                  {z.sub && <p className="text-[11px] mt-0.5" style={{ color: '#B26A00' }}>{z.sub}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          {dniWyk.length > 1 && (
            <Karta tytul="Ewolucja sprzedaży narastająco" podtytul={`${mLabel} · odchylenie od średniej dziennej`}>
              <Ewolucja dni={dniWyk} />
            </Karta>
          )}
          <Karta tytul="Ranking dni tygodnia" podtytul="SPLH z grafiku (zł/rbh)">
            <Ranking jednostka="zł/rbh" dane={rankingDni} />
          </Karta>
          <Karta tytul="Rozkład załogi wg godzin miesiąca" podtytul={`${Object.keys(zalogaMapD).length} osób · ${mLabel}`}>
            <Histogram kubelki={(() => { const h = Object.values(zalogaMapD); return [
              { l: '<40 h', n: h.filter((x) => x < 40).length },
              { l: '40–80', n: h.filter((x) => x >= 40 && x < 80).length },
              { l: '80–120', n: h.filter((x) => x >= 80 && x < 120).length },
              { l: '120–160', n: h.filter((x) => x >= 120 && x < 160).length },
              { l: '160+', n: h.filter((x) => x >= 160).length }]; })()} />
          </Karta>
          {dniWyk.length === 0 && <div className="rounded-xl p-6 text-sm text-slate-400 bg-white border" style={{ borderColor: colors.primary.bg }}>Zaimportuj sprzedaż w module Planowanie, aby zobaczyć tu również ewolucję sprzedaży i pełny SPLH.</div>}
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #26A69A' }}>
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2"><Clock className="w-5 h-5" style={{ color: '#26A69A' }} /><h3 className="text-lg font-semibold" style={{ color: colors.primary.darkest }}>Wyliczone godziny — {mLabel}</h3></div>
            {msc.length > 0 && <select value={mkey || ''} onChange={(e) => setMkeyS(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg, color: colors.primary.darkest }}>{msc.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select>}
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.primary.bg }}><p className="text-2xl font-bold" style={{ color: colors.primary.dark }}>{gCrew.toFixed(1)}</p><p className="text-sm" style={{ color: colors.primary.light }}>Godziny CREW</p></div>
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: '#e0f2f1' }}><p className="text-2xl font-bold" style={{ color: '#00796B' }}>{gSzk.toFixed(1)}</p><p className="text-sm" style={{ color: '#00897B' }}>Godziny szkoleniowe</p></div>
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.primary.bgLight }}><p className="text-2xl font-bold" style={{ color: colors.primary.darkest }}>{gMgr.toFixed(1)}</p><p className="text-sm" style={{ color: colors.primary.light }}>Godziny MANAGER{gManual ? ` (+${gManual.toFixed(0)} ręcznie)` : ''}</p></div>
            <div className="rounded-xl p-4 text-center" style={{ backgroundColor: colors.accent.bg }}><p className="text-2xl font-bold" style={{ color: colors.accent.dark }}>{(gCrew + gSzk + gMgr).toFixed(1)}</p><p className="text-sm" style={{ color: colors.accent.dark }}>RAZEM</p></div>
          </div>
        </div>

        {(data.months || []).length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${colors.primary.medium}` }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: colors.primary.darkest }}>Grafiki w systemie</h3>
            <div className="space-y-2">
              {data.months.map((m) => {
                const [y, mo] = m.key.split('-').map(Number);
                const label = `${months[mo - 1]} ${y}`;
                const mShifts = data.shifts.filter(s => (s.date || '').slice(0, 7) === m.key);
                const mH = mShifts.filter(s => !jestInstruktor(s)).reduce((a, s) => a + godzZ(s), 0);
                return (
                  <div key={m.key} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: colors.primary.bgLight }}>
                    <div className="flex items-center gap-3"><Calendar className="w-5 h-5" style={{ color: colors.primary.medium }} /><div><p className="font-semibold" style={{ color: colors.primary.darkest }}>{label}</p><p className="text-xs" style={{ color: colors.primary.light }}>{m.count} zmian · {mH.toFixed(1)} h</p></div></div>
                    <button onClick={() => { if (confirm(`Usunąć grafik: ${label}?`)) data.deleteMonth(m.key, label); }} className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Usuń ten miesiąc"><Trash2 className="w-4 h-4" /></button>
                  </div>
                );
              })}
            </div>
            <p className="text-xs mt-3" style={{ color: colors.primary.light }}>Import kolejnego miesiąca dodaje go tutaj — nie kasuje pozostałych.</p>
          </div>
        )}

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${colors.accent.dark}` }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: colors.primary.darkest }}>Szybkie akcje</h3>
          <div className="flex flex-wrap gap-3">
            <Btn icon={Upload} onClick={() => setPage('import')}>Importuj grafik z Excel</Btn>
            <Btn variant="accent" icon={Printer} onClick={() => setPage('print')}>Drukuj grafik</Btn>
            <Btn variant="secondary" icon={LayoutGrid} onClick={() => setPage('wt')}>Podgląd grafiku</Btn>
            <Btn variant="secondary" icon={RefreshCw} onClick={data.sync} loading={data.loading}>Odśwież</Btn>
          </div>
        </div>
        {data.shifts.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
            <FileSpreadsheet className="w-16 h-16 mx-auto mb-4" style={{ color: colors.primary.light }} />
            <p className="font-semibold mb-1" style={{ color: colors.primary.darkest }}>Brak grafiku w systemie</p>
            <p className="text-sm mb-4" style={{ color: colors.primary.light }}>Zaimportuj matrycę Excel, aby pracownicy widzieli swoje zmiany.</p>
            <div className="flex justify-center"><Btn icon={Upload} onClick={() => setPage('import')}>Importuj teraz</Btn></div>
          </div>
        )}
      </div>
    </div>
  );
};

// ===================== IMPORT =====================

const ImportPage = ({ data }) => {
  const [preview, setPreview] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const handleFile = async (file) => {
    if (!file) return;
    setError(''); setParsing(true); setPreview(null);
    try {
      const result = file.name.toLowerCase().endsWith('.csv')
        ? parseExportCSV(await file.text())
        : parseGrafik(await file.arrayBuffer());
      setPreview(result);
    } catch (e) {
      setError(e.message || 'Błąd odczytu pliku');
    }
    setParsing(false);
  };

  const confirmImport = async () => {
    if (!preview) return;
    await data.importSchedule(preview);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Import z Excel" subtitle="Wczytaj matrycę grafiku (GRAFIK_CREW.xlsx)" />
      <div className="flex-1 p-8 space-y-6 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="bg-white rounded-2xl p-8 shadow-sm">
          <div className="border-2 border-dashed rounded-2xl p-10 text-center transition-colors" style={{ borderColor: colors.primary.bg }}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}>
            <FileSpreadsheet className="w-16 h-16 mx-auto mb-4" style={{ color: colors.primary.medium }} />
            <p className="font-semibold mb-1" style={{ color: colors.primary.darkest }}>Przeciągnij plik Excel tutaj</p>
            <p className="text-sm mb-4" style={{ color: colors.primary.light }}>plik .xlsx (matryca) lub .csv (z przycisku „Eksportuj grafik")</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.csv" className="hidden" onChange={e => handleFile(e.target.files[0])} />
            <div className="flex justify-center"><Btn icon={Upload} loading={parsing} onClick={() => fileRef.current?.click()}>Wybierz plik</Btn></div>
          </div>
          {error && <div className="mt-4 bg-red-50 text-red-600 p-4 rounded-xl flex items-start gap-2"><AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" /><span className="text-sm">{error}</span></div>}
        </div>

        {preview && (
          <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid #7CB342` }}>
            <div className="flex items-center gap-2 mb-4"><Check className="w-6 h-6" style={{ color: '#7CB342' }} /><h3 className="text-lg font-semibold" style={{ color: colors.primary.darkest }}>Plik odczytany poprawnie</h3></div>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.primary.bg }}><p className="text-2xl font-bold" style={{ color: colors.primary.dark }}>{preview.meta.shiftCount}</p><p className="text-sm" style={{ color: colors.primary.light }}>Zmian</p></div>
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.accent.bg }}><p className="text-2xl font-bold" style={{ color: colors.accent.dark }}>{preview.meta.employeeCount}</p><p className="text-sm" style={{ color: colors.accent.dark }}>Pracowników</p></div>
              <div className="p-4 rounded-xl" style={{ backgroundColor: '#f0fdf4' }}><p className="text-lg font-bold" style={{ color: '#558B2F' }}>{preview.meta.monthName} {preview.meta.year}</p><p className="text-sm" style={{ color: '#7CB342' }}>Miesiąc</p></div>
              <div className="p-4 rounded-xl" style={{ backgroundColor: colors.primary.bgLight }}><p className="text-sm font-bold" style={{ color: colors.primary.dark }}>{preview.meta.firstDate} → {preview.meta.lastDate}</p><p className="text-sm" style={{ color: colors.primary.light }}>Zakres</p></div>
            </div>
            <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: colors.accent.bg }}><div className="flex items-start gap-2"><AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: colors.accent.dark }} /><span className="text-sm" style={{ color: colors.accent.dark }}>Import <strong>zastąpi</strong> poprzedni grafik w systemie. Pracownicy zobaczą nowe zmiany po zalogowaniu.</span></div></div>
            <div className="max-h-64 overflow-y-auto rounded-xl border" style={{ borderColor: colors.primary.bg }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0"><tr style={{ backgroundColor: colors.primary.bg }}><th className="text-left px-4 py-2 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Data</th><th className="text-left px-4 py-2 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Pracownik</th><th className="text-left px-4 py-2 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Godziny</th><th className="text-left px-4 py-2 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Stanowisko</th></tr></thead>
                <tbody>{preview.shifts.slice(0, 50).map((s, i) => (<tr key={i} className="border-b" style={{ borderColor: colors.primary.bgLight }}><td className="px-4 py-1.5">{s.date}</td><td className="px-4 py-1.5 font-medium">{s.name}</td><td className="px-4 py-1.5">{s.start}–{s.end} ({s.hours}h)</td><td className="px-4 py-1.5"><span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: stationColor(s.station) + '20', color: stationColor(s.station) }}>{s.station}</span></td></tr>))}</tbody>
              </table>
              {preview.shifts.length > 50 && <p className="text-center py-2 text-xs" style={{ color: colors.primary.light }}>... i {preview.shifts.length - 50} więcej</p>}
            </div>
            <div className="flex justify-end gap-3 mt-6"><Btn variant="secondary" onClick={() => setPreview(null)}>Anuluj</Btn><Btn variant="success" icon={Check} onClick={confirmImport} loading={data.loading}>Zatwierdź import</Btn></div>
          </div>
        )}
      </div>
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
                        {paraOpis(s) && <p className="truncate italic" style={{ color: '#00796B' }}>{paraOpis(s)}</p>}
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
                <button onClick={() => setMode('day')} className="flex-1 py-3 rounded-xl font-medium transition-all" style={mode === 'day' ? { background: `linear-gradient(135deg, ${colors.primary.medium}, ${colors.primary.dark})`, color: 'white' } : { backgroundColor: colors.primary.bg, color: colors.primary.dark }}>Jeden dzień</button>
                <button onClick={() => setMode('range')} className="flex-1 py-3 rounded-xl font-medium transition-all" style={mode === 'range' ? { background: `linear-gradient(135deg, ${colors.primary.medium}, ${colors.primary.dark})`, color: 'white' } : { backgroundColor: colors.primary.bg, color: colors.primary.dark }}>Zakres dni</button>
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
  // Zmiana PIN kierownika zmiany — wymaga hasła ASM
  const [pinNew, setPinNew] = useState('');
  const [pinNew2, setPinNew2] = useState('');
  const [pinAsmPass, setPinAsmPass] = useState('');
  // Zmiana poświadczeń ASM — wymaga obecnego hasła ASM
  const [asmLogin, setAsmLogin] = useState('');
  const [asmCur, setAsmCur] = useState('');
  const [asmNew, setAsmNew] = useState('');
  const [asmNew2, setAsmNew2] = useState('');
  useEffect(() => { api('/admin-auth').then(r => { if (r.success && r.asmLogin) setAsmLogin(r.asmLogin); }).catch(() => {}); }, []);

  const changePin = async () => {
    if (!pinAsmPass) { data.show('Podaj hasło ASM', 'error'); return; }
    if (!/^\d{6}$/.test(pinNew)) { data.show('PIN musi mieć dokładnie 6 cyfr', 'error'); return; }
    if (pinNew !== pinNew2) { data.show('Nowe PINy się różnią', 'error'); return; }
    const r = await api('/admin-auth', 'PUT', { newPin: pinNew, asmPassword: pinAsmPass });
    if (r.success) { data.show('PIN kierownika zmieniony'); setPinNew(''); setPinNew2(''); setPinAsmPass(''); }
    else data.show(r.error || 'Błąd', 'error');
  };
  const changeAsm = async () => {
    if (!asmCur) { data.show('Podaj obecne hasło ASM', 'error'); return; }
    if (asmNew && asmNew.length < 6) { data.show('Nowe hasło min. 6 znaków', 'error'); return; }
    if (asmNew !== asmNew2) { data.show('Nowe hasła się różnią', 'error'); return; }
    if (!asmNew && !asmLogin.trim()) { data.show('Nic do zmiany', 'error'); return; }
    const body = { currentPassword: asmCur };
    if (asmLogin.trim()) body.newLogin = asmLogin.trim();
    if (asmNew) body.newPassword = asmNew;
    const r = await api('/admin-auth', 'PUT', body);
    if (r.success) { data.show('Poświadczenia ASM zaktualizowane'); setAsmCur(''); setAsmNew(''); setAsmNew2(''); }
    else data.show(r.error || 'Błąd', 'error');
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
        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl" style={{ borderLeft: `4px solid ${colors.primary.medium}` }}>
          <h3 className="text-lg font-bold mb-1" style={{ color: colors.primary.darkest }}>PIN kierownika zmiany</h3>
          <p className="text-sm mb-4" style={{ color: colors.primary.light }}>Kierownicy zmiany logują się PIN-em i mają dostęp tylko do wydruku grafiku. Zmiana wymaga hasła ASM.</p>
          <div className="space-y-3">
            <input type="password" value={pinNew} onChange={e => setPinNew(e.target.value)} placeholder="Nowy PIN (6 cyfr)" maxLength={6} inputMode="numeric" className={inp + " tracking-widest"} style={{ borderColor: colors.primary.bg }} />
            <input type="password" value={pinNew2} onChange={e => setPinNew2(e.target.value)} placeholder="Powtórz nowy PIN" maxLength={6} inputMode="numeric" className={inp + " tracking-widest"} style={{ borderColor: colors.primary.bg }} />
            <input type="password" value={pinAsmPass} onChange={e => setPinAsmPass(e.target.value)} placeholder="Hasło ASM (potwierdzenie)" className={inp} style={{ borderColor: colors.primary.bg }} />
            <Btn onClick={changePin}>Zapisz PIN kierownika</Btn>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl" style={{ borderLeft: `4px solid #12423f` }}>
          <h3 className="text-lg font-bold mb-1" style={{ color: colors.primary.darkest }}>Login i hasło ASM</h3>
          <p className="text-sm mb-4" style={{ color: colors.primary.light }}>Pełny dostęp (układanie i import grafiku, plan godzin). Zmienić może wyłącznie ASM, podając obecne hasło.</p>
          <div className="space-y-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Login ASM</label><input type="text" value={asmLogin} onChange={e => setAsmLogin(e.target.value)} placeholder="login" className={inp} style={{ borderColor: colors.primary.bg }} /></div>
            <input type="password" value={asmNew} onChange={e => setAsmNew(e.target.value)} placeholder="Nowe hasło ASM (min. 6 znaków, puste = bez zmiany)" className={inp} style={{ borderColor: colors.primary.bg }} />
            <input type="password" value={asmNew2} onChange={e => setAsmNew2(e.target.value)} placeholder="Powtórz nowe hasło" className={inp} style={{ borderColor: colors.primary.bg }} />
            <input type="password" value={asmCur} onChange={e => setAsmCur(e.target.value)} placeholder="Obecne hasło ASM (wymagane)" className={inp} style={{ borderColor: '#12423f' }} />
            <Btn onClick={changeAsm}>Zapisz poświadczenia ASM</Btn>
          </div>
        </div>

        {resetReqs.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl" style={{ borderLeft: `4px solid #d67943` }}>
            <h3 className="font-bold mb-1" style={{ color: colors.primary.darkest }}>Zgłoszenia resetu hasła <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white ml-1" style={{ backgroundColor: '#d87b52' }}>{resetReqs.length}</span></h3>
            <p className="text-xs mb-4" style={{ color: colors.primary.light }}>Zgłoszone z ekranu logowania. Reset generuje tymczasowe hasło do przekazania — pracownik ustawi własne przy pierwszym logowaniu.</p>
            <div className="space-y-2">
              {resetReqs.map((rq) => (
                <div key={rq.login} className="flex items-center gap-3 px-3 py-2 rounded-lg flex-wrap" style={{ backgroundColor: '#fff2e8' }}>
                  <div className="min-w-0 flex-1"><p className="text-sm font-mono font-bold" style={{ color: colors.primary.darkest }}>{rq.login}</p><p className="text-[11px]" style={{ color: colors.primary.light }}>{rq.name || '—'} · {new Date(rq.at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p></div>
                  <button onClick={() => zresetujHaslo(rq)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: '#12423f' }}>Resetuj hasło</button>
                  <button onClick={() => zamknijReq(rq)} className="text-xs font-semibold" style={{ color: '#bd4f45' }}>Odrzuć</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl" style={{ borderLeft: `4px solid #59807c` }}>
          <h3 className="font-bold mb-1" style={{ color: colors.primary.darkest }}>Jeden profil — uprawnienia panelu per konto</h3>
          <p className="text-xs mb-4" style={{ color: colors.primary.light }}>Konto pracownicze z przypisaną rolą loguje się do panelu tym samym loginem i PIN-em/hasłem co do aplikacji pracownika. Poziom dostępu (ASM lub kierownik zmiany) wynika z roli konta. Zapasowy login ASM nadal działa.</p>
          <div className="space-y-2">
            {(linked || []).map((l) => (
              <div key={l.login || l} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ backgroundColor: colors.primary.bgLight }}>
                <span className="text-sm font-mono font-semibold" style={{ color: colors.primary.darkest }}>{l.login || l}</span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full" style={{ backgroundColor: (l.role || 'asm') === 'asm' ? '#12423f' : '#59807c', color: 'white' }}>{(l.role || 'asm') === 'asm' ? 'ASM' : 'Kierownik zmiany'}</span>
                <button onClick={() => zdejmij(l.login || l)} className="text-xs font-semibold" style={{ color: '#bd4f45' }}>Odepnij</button>
              </div>
            ))}
            {(linked || []).length === 0 && <p className="text-xs" style={{ color: colors.primary.light }}>Brak powiązanych kont.</p>}
            <input value={linkLogin} onChange={(e) => setLinkLogin(e.target.value)} placeholder="Login konta pracowniczego (np. PLPLK201043)" className={inp} />
            <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: colors.primary.bgLight }}>{[['asm', 'ASM — pełny dostęp'], ['kierownik', 'Kierownik zmiany — grafik i wydruk']].map(([id, l]) => (
              <button key={id} type="button" onClick={() => setLinkRola(id)} className="flex-1 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: linkRola === id ? colors.primary.medium : 'transparent', color: linkRola === id ? 'white' : colors.primary.light }}>{l}</button>
            ))}</div>
            <input type="password" value={linkPass} onChange={(e) => setLinkPass(e.target.value)} placeholder="Obecne hasło ASM (wymagane)" className={inp} style={{ borderColor: '#12423f' }} />
            <Btn onClick={powiaz}>Powiąż konto z rolą ASM</Btn>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl" style={{ borderLeft: `4px solid #E74C3C` }}>
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
const OC = { cel: "#5C4B8A", silnik: "#E2571E", obsada: "#12655B", ok: "#12655B", warn: "#D08700", bad: "#B7362A" };
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
  { n: "OTWARCIE 06–16", od: 6, do: 16, kol: "#2F6FB5" }, { n: "OTWARCIE 06–15", od: 6, do: 15, kol: "#2F6FB5" },
  { n: "KONTROLER I 07–15", od: 7, do: 15, kol: "#3D8AC7" }, { n: "DOSTAWA 07–12", od: 7, do: 12, kol: "#6B8E23" },
  { n: "DOSTAWA+SMAŻ 07–17", od: 7, do: 17, kol: "#6B8E23" }, { n: "DOSTAWA 07–15", od: 7, do: 15, kol: "#6B8E23" },
  { n: "SMAŻENIE I 10–18", od: 10, do: 18, kol: "#B5482F" }, { n: "ŚRODEK 11–21", od: 11, do: 21, kol: "#E2571E" },
  { n: "ŚRODEK 12–22", od: 12, do: 22, kol: "#E2571E" }, { n: "FLEX SZCZYT 12–20", od: 12, do: 20, kol: "#C0392B" },
  { n: "ZAMKNIĘCIE 15–01", od: 15, do: 25, kol: "#5C4B8A" }, { n: "WSPARCIE WIECZ 16–24", od: 16, do: 24, kol: "#7C3AED" },
  { n: "ZAMKNIĘCIE 16–01", od: 16, do: 25, kol: "#5C4B8A" }, { n: "ZAMKNIĘCIE 17–02", od: 17, do: 26, kol: "#5C4B8A" },
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
    {sub && <div className="text-[10px]" style={{ color: "#94a3b8" }}>{sub}</div>}
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
        <text x={2} y={7} fontSize="7.5" fill="#94a3b8">Szczyt 13–20</text>
        {[...Array(NS)].map((_, i) => i % 4 === 0 ? <text key={i} x={PL + i * cw} y={18} fontSize="7" fill="#94a3b8">{hmS(i).slice(0, 2)}</text> : null)}
        {rows.map((r, ri) => (<g key={ri}>
          <text x={2} y={22 * (ri + 1) + 17} fontSize="8.5" fill={r.c}>{r.l}</text>
          {r.a.map((v, i) => (<g key={i}>
            <rect x={PL + i * cw} y={22 * (ri + 1) + 7} width={cw - .3} height={13} fill={r.c} opacity={v > 0 ? Math.min(.1 + v * .1, .85) : .04} />
            <text x={PL + i * cw + cw / 2} y={22 * (ri + 1) + 17} fontSize="6.5" textAnchor="middle" fill={v > 3 ? "#fff" : "#94a3b8"}>{v > 0 ? v : ""}</text>
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
        <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#eef4ff", color: colors.primary.dark }}>
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
          <div className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ backgroundColor: "#fff4e0", color: "#8a6d1a" }}>
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
                <div key={x.d} className="grid grid-cols-[54px_1fr_1fr_1fr_1fr_1fr_86px] gap-2 px-2 py-1.5 text-sm items-center border-b cursor-pointer hover:bg-slate-50" style={{ borderColor: "#f1f5f9" }} onClick={() => { setDzien(x.d); setTab("dzien"); }}>
                  <span style={{ color: colors.primary.dark }}>{D3[x.dow]} {x.d}</span>
                  <span className="text-right" style={{ color: colors.primary.darkest }}>{f0(x.sprzedaz)}</span>
                  <span className="text-right" style={{ color: colors.primary.dark }}>{fH1(x.akt)}</span>
                  <span className="text-right font-medium" style={{ color: OC.silnik }}>{fH1(x.he)}</span>
                  <span className="text-right font-medium" style={{ color: over ? OC.warn : under ? OC.ok : "#94a3b8" }}>{d >= 0 ? "+" : ""}{d.toFixed(1)}</span>
                  <span className="text-right" style={{ color: colors.primary.dark }}>{f0(x.splhE)}</span>
                  <span className="text-center"><span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: over ? "#fff4e0" : under ? "#e9f7ef" : "#f1f5f9", color: over ? OC.warn : under ? OC.ok : "#64748b" }}>{over ? "dołóż" : under ? "oszczędność" : "OK"}</span></span>
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
                { n: 'Poranek 07–11', v: [7, 8, 9, 10].reduce((a, h) => a + ZLH[h], 0), kol: '#A8CBA0' },
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
          {!PRED ? (
            <Sekcja kolor="#D08700" tytul="Brak historii sprzedaży">
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

            <Sekcja kolor="#12423f" tytul="Sterowanie prognozą">
              <div className="grid md:grid-cols-2 gap-6">
                <OptSuw label="Okno historii" value={oknoTyg} min={2} max={26} step={1} unit="tyg." onChange={setOknoTyg} />
                <OptSuw label="Ręczna korekta (np. wydarzenie, remont)" value={korekta} min={-30} max={30} step={1} unit="%" onChange={setKorekta} />
              </div>
              <p className="text-xs text-slate-400 mt-3">Krótsze okno szybciej reaguje na zmiany (nowe menu, sezon), dłuższe jest stabilniejsze. Korekta przesuwa całą prognozę w górę lub w dół.</p>
            </Sekcja>

            <Sekcja kolor="#455A64" tytul="Średnia sprzedaż wg dnia tygodnia (z okna historii)">
              <BPBars unit="zł" items={[1, 2, 3, 4, 5, 6, 0].map((js) => ({ label: D3[(js + 6) % 7], value: PRED.wd[js] || 0, n: 0, color: (js === 0 || js === 5 || js === 6) ? OC.silnik : colors.primary.medium }))} />
            </Sekcja>

            <Sekcja kolor={OC.silnik} tytul={`Prognoza dzienna — ${months[mIdx]} ${year}`}>
              <BPLine labels={R.dni.map((x) => String(x.d))} unit="" series={[{ name: "Sprzedaż (dane + prognoza)", color: OC.silnik, data: R.dni.map((x) => x.sprzedaz), fill: true }]} />
              <div className="overflow-x-auto mt-3"><div className="min-w-[560px]">
                <div className="grid grid-cols-[70px_1fr_1fr_1fr_90px] gap-2 px-2 py-1.5 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}><span>Dzień</span><span className="text-right">Sprzedaż zł</span><span className="text-right">Rekom. h</span><span className="text-right">Plan h</span><span className="text-center">Źródło</span></div>
                {R.dni.map((x) => (
                  <div key={x.d} className="grid grid-cols-[70px_1fr_1fr_1fr_90px] gap-2 px-2 py-1.5 text-sm items-center border-b" style={{ borderColor: "#f1f5f9" }}>
                    <span style={{ color: colors.primary.dark }}>{D3[x.dow]} {x.d}</span>
                    <span className="text-right" style={{ color: colors.primary.darkest }}>{f0(x.sprzedaz)}</span>
                    <span className="text-right font-medium" style={{ color: OC.silnik }}>{fH1(x.he)}</span>
                    <span className="text-right" style={{ color: colors.primary.dark }}>{fH1(x.akt)}</span>
                    <span className="text-center"><span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: x.jestEst ? "#fff4e0" : "#e9f7ef", color: x.jestEst ? "#B26A00" : "#12655B" }}>{x.jestEst ? "prognoza" : "dane"}</span></span>
                  </div>
                ))}
              </div></div>
            </Sekcja>
          </>)}
        </>)}

        {tab === "zaloga" && (
          <Sekcja kolor="#12423f" tytul={`Załoga — godziny pracowników w miesiącu (${months[mIdx]} ${year})`}>
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
                  <div className="mt-4 rounded-xl p-3" style={{ backgroundColor: "#fff8e6" }}>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: "#8a6d1a" }}>Zmiany bez konta — nie liczą się do pracowników powyżej. Uzupełnij „Nazwę w grafiku" lub alias w module Pracownicy i kliknij „Przypisz zmiany do kont".</p>
                    <div className="flex flex-wrap gap-1.5">{bezKonta.map(([k, h]) => <span key={k} className="text-xs px-2 py-1 rounded-lg font-mono" style={{ backgroundColor: "white", color: "#8a6d1a" }}>{k} <span className="opacity-60">{fH1(h)}</span></span>)}</div>
                  </div>
                )}
              </>);
            })()}
          </Sekcja>
        )}

        {tab === "dane" && (<>
          <Sekcja kolor={colors.primary.medium} tytul="Średnie wg dnia tygodnia">
            <div className="overflow-x-auto"><div className="min-w-[520px]">
              <div className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] gap-2 px-2 py-2 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}><span>Dzień</span><span className="text-right">Śr. sprzedaż</span><span className="text-right">Śr. grafik h</span><span className="text-right">Śr. silnik h</span><span className="text-right">Δ h</span></div>
              {R.byDow.map((b) => (<div key={b.dow} className="grid grid-cols-[80px_1fr_1fr_1fr_1fr] gap-2 px-2 py-1.5 text-sm border-b" style={{ borderColor: "#f1f5f9" }}>
                <span style={{ color: colors.primary.dark }}>{D3[b.dow]}</span><span className="text-right">{f0(b.s)} zł</span><span className="text-right">{fH1(b.a)}</span><span className="text-right" style={{ color: OC.silnik }}>{fH1(b.e)}</span>
                <span className="text-right font-medium" style={{ color: b.e - b.a > 0 ? OC.warn : OC.ok }}>{(b.e - b.a) >= 0 ? "+" : ""}{(b.e - b.a).toFixed(1)}</span></div>))}
            </div></div>
          </Sekcja>
          <Sekcja kolor="#455A64" tytul="Profil godzinowy sprzedaży (udział doby)">
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
const PC = { bg: '#F5F4F0', card: '#FFFFFF', line: '#DEDCD5', ink: '#1C1E21', mute: '#8C8A83', accent: '#E2571E', cel: '#5C4B8A', plan: '#2F6FB5', dir: '#B5482F', ind: '#6B8E23', bad: '#B7362A', ok: '#12655B' };
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
const BP_KAT = { prac: { label: 'Pracownicy', color: '#3A6EA5' }, instr: { label: 'Instruktorzy', color: '#F5B000' }, mgr: { label: 'Mgr (SM/JSM)', color: '#7A5FB0' }, kier: { label: 'Kierownictwo (RGM/ASM)', color: '#12423f' } };
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
        {Array.from({ length: 5 }).map((_, t) => { const v = max * t / 4; const y = Y(v); return (<g key={t}><line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="#eef2f7" /><text x={P.l - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">{Math.round(v)}{unit}</text></g>); })}
        {labels.map((l, i) => (i % step === 0) ? <text key={i} x={X(i)} y={H - 9} textAnchor="middle" fontSize="9" fill="#94a3b8">{l}</text> : null)}
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
  const actualDaily = planDaily.map((h, i) => { if (!h) return 0; const d = ((i * 37 + 13) % 11) - 5; return Math.max(0, +(h * (1 + d / 100)).toFixed(1)); });
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

  const Stat = ({ v, l, sub, dark }) => (<div className="rounded-xl p-3 text-center shadow-sm border" style={{ backgroundColor: dark ? colors.primary.darkest : 'white', borderColor: colors.primary.bg }}><p className="text-xl font-bold" style={{ color: dark ? 'white' : colors.primary.darkest }}>{v}</p><p className="text-[11px]" style={{ color: dark ? 'rgba(255,255,255,.7)' : colors.primary.light }}>{l}</p>{sub && <p className="text-[10px]" style={{ color: dark ? 'rgba(255,255,255,.5)' : '#94a3b8' }}>{sub}</p>}</div>);
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
            <Dwa label="COL % (koszt / sprzedaż)" akt={`${(sale ? colAkt / sale * 100 : 0).toFixed(2)}%`} plan={`${(colPct * 100).toFixed(2)}%`} kolor={(sale ? colAkt / sale : 0) > 0.2 ? '#E74C3C' : '#2E9E5B'} />
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
          <Sekcja kolor="#12423f" tytul="COL wg kategorii"><BPBars items={kats.map((k) => ({ label: k.label, value: k.value, n: k.n, color: k.color }))} /></Sekcja>
          <Sekcja kolor="#455A64" tytul="Podgląd kosztów (rozbicie P&amp;L)">
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
          <Sekcja kolor={colors.primary.medium} tytul="Grafik: godziny plan vs wykonanie (dni miesiąca)"><BPLine labels={dayLabels} unit="h" series={[{ name: 'Plan', color: colors.primary.bg, data: planDaily, fill: true }, { name: 'Wykonanie', color: colors.primary.medium, data: actualDaily }]} /></Sekcja>
          <Sekcja kolor="#12423f" tytul="Cost of Labour — dzienny koszt pracy (plan)"><BPLine labels={dayLabels} unit="" series={[{ name: 'Koszt dzienny (zł)', color: '#12423f', data: colDaily, fill: true }]} /><p className="text-xs text-slate-400 mt-2">Szacunek: godziny planowane danego dnia × średni koszt godziny ({zl(avgHourly)} zł/h).</p></Sekcja>
          <Sekcja kolor="#455A64" tytul="Cost of Labour — udział kategorii"><BPBars items={kats.map((k) => ({ label: k.label, value: k.value, n: k.n, color: k.color }))} /></Sekcja>

          <Sekcja kolor="#12655B" tytul="Produktywność (SPLH) — okres vs poprzedni">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat v={`${f0(splhBiez)}`} l={`SPLH — ${months[mIdx]}`} sub={`${f0(sBiez)} zł / ${f0(hBiez)} h`} />
              <Stat v={`${f0(splhPoprz)}`} l={`SPLH — ${months[poprz.m]}`} sub={`${f0(sPoprz)} zł / ${f0(hPoprz)} h`} />
              <div className="rounded-xl p-3 text-center shadow-sm" style={{ backgroundColor: varPct >= 0 ? '#12655B' : '#B7362A' }}><p className="text-xl font-bold text-white">{varPct >= 0 ? '+' : ''}{varPct.toFixed(1).replace('.', ',')}%</p><p className="text-[11px] text-white/80">Zmiana r/r okresu</p></div>
              <Stat v={`${f0(hRazem ? sBiez / hRazem : 0)}`} l="SPLH wg planu budżetu" sub={`${f0(hRazem)} h w planie`} />
            </div>
            {!sBiez && <p className="text-xs text-slate-400 mt-2">Brak danych sprzedaży dla tego miesiąca — zaimportuj raport w module Optymalizacja.</p>}
          </Sekcja>

          <Sekcja kolor="#2F6FB5" tytul="Godziny kontraktowe — stałe vs zmienne">
            <BPBars unit="h" items={[
              { label: 'Stałe (UOP)', value: hStale, n: koszty.filter((x) => x.e.umowa === 'UOP').length, color: '#2F6FB5' },
              { label: 'Zmienne (UZ)', value: hZmienne, n: koszty.filter((x) => x.e.umowa === 'UZ').length, color: '#E2571E' },
            ]} />
            <p className="text-xs text-slate-400 mt-2">Udział godzin stałych: <b style={{ color: colors.primary.dark }}>{hRazem ? (hStale / hRazem * 100).toFixed(1).replace('.', ',') : 0}%</b> — wyższy udział to mniejsza elastyczność obsady, ale i niższy koszt krańcowy godziny.</p>
          </Sekcja>

          <Sekcja kolor="#D08700" tytul="Zgodność kontraktowa — godziny teoretyczne vs zaplanowane">
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Stat v={`${f0(zgodnosc.reduce((a, x) => a + x.teor, 0))} h`} l="Teoretyczne (z umów)" />
              <div className="rounded-xl p-3 text-center shadow-sm border" style={{ borderColor: colors.primary.bg }}><p className="text-xl font-bold" style={{ color: '#D08700' }}>{f0(sumNadmiar)} h</p><p className="text-[11px]" style={{ color: colors.primary.light }}>Nadmiar (Exceso)</p></div>
              <div className="rounded-xl p-3 text-center shadow-sm border" style={{ borderColor: colors.primary.bg }}><p className="text-xl font-bold" style={{ color: '#B7362A' }}>{f0(sumNiedobor)} h</p><p className="text-[11px]" style={{ color: colors.primary.light }}>Niedobór (Defecto)</p></div>
            </div>
            <div className="overflow-x-auto"><div className="min-w-[560px]">
              <div className="grid grid-cols-[1.6fr_70px_1fr_1fr_1fr_1fr] gap-2 px-2 py-1.5 text-[11px] font-bold uppercase" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}><span>Pracownik</span><span>Umowa</span><span className="text-right">Teoret.</span><span className="text-right">Plan</span><span className="text-right">Nadmiar</span><span className="text-right">Niedobór</span></div>
              {zgodnosc.map((z, i) => (
                <div key={i} className="grid grid-cols-[1.6fr_70px_1fr_1fr_1fr_1fr] gap-2 px-2 py-1.5 text-sm border-b" style={{ borderColor: '#f1f5f9' }}>
                  <span className="truncate" style={{ color: colors.primary.dark }}>{z.name}</span>
                  <span className="text-xs" style={{ color: colors.primary.light }}>{z.umowa}</span>
                  <span className="text-right">{z.teor.toFixed(0)}</span>
                  <span className="text-right">{z.plan.toFixed(0)}</span>
                  <span className="text-right font-medium" style={{ color: z.nadmiar ? '#D08700' : '#cbd5e1' }}>{z.nadmiar ? z.nadmiar.toFixed(0) : '—'}</span>
                  <span className="text-right font-medium" style={{ color: z.niedobor ? '#B7362A' : '#cbd5e1' }}>{z.niedobor ? z.niedobor.toFixed(0) : '—'}</span>
                </div>
              ))}
            </div></div>
          </Sekcja>

          <Sekcja kolor="#7A5FB0" tytul="Absencja">
            <div className="grid grid-cols-3 gap-3">
              <Stat v={`${f0(hUrlop)} h`} l="Urlopy" />
              <Stat v={`${f0(hZLA)} h`} l="Chorobowe (ZLA)" sub={`${emps.reduce((a, e) => a + (e.dniZLA || 0), 0)} dni`} />
              <div className="rounded-xl p-3 text-center shadow-sm" style={{ backgroundColor: absPct > 8 ? '#B7362A' : '#7A5FB0' }}><p className="text-xl font-bold text-white">{absPct.toFixed(1).replace('.', ',')}%</p><p className="text-[11px] text-white/80">Wskaźnik absencji</p></div>
            </div>
          </Sekcja>
        </>)}

        {tab === 'ust' && (
          <div className="grid md:grid-cols-2 gap-4">
            <Sekcja kolor="#12423f" tytul="Składki i stawki">
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
  { id: 'JSM', label: 'Młodszy kierownik zmiany' },
  { id: 'SM', label: 'Kierownik zmiany' },
  { id: 'ASM', label: 'Zastępca kierownika' },
  { id: 'RGM', label: 'Kierownik restauracji' },
];
const funkcjaLabel = (id) => (FUNKCJE.find((f) => f.id === id) || {}).label || id;
const emptyForm = { name: '', funkcja: 'CREW', umowa: 'UZ', stawka: 30, zus: false, instruktor: false, grafikName: '', aliasy: '' };

const CopyField = ({ label, value }) => {
  const [ok, setOk] = useState(false);
  const copy = () => { try { navigator.clipboard.writeText(value); } catch (e) {} setOk(true); setTimeout(() => setOk(false), 1500); };
  return (<div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ backgroundColor: colors.primary.bgLight }}><div><p className="text-[11px]" style={{ color: colors.primary.light }}>{label}</p><p className="font-mono font-bold text-lg" style={{ color: colors.primary.darkest }}>{value}</p></div><button onClick={copy} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: ok ? '#2E9E5B' : colors.primary.medium }}>{ok ? 'Skopiowano' : 'Kopiuj'}</button></div>);
};

const EmpForm = ({ init, onSave, onClose }) => {
  const [f, setF] = useState(init);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const valid = f.name.trim().split(/\s+/).length >= 2;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl w-full max-w-lg p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>{init.id ? 'Edytuj pracownika' : 'Nowy pracownik'}</h3><button onClick={onClose}><X size={20} className="text-slate-400" /></button></div>
        <div className="space-y-3">
          <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Imię i nazwisko</label><input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="np. Jan Kowalski" className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: valid || !f.name ? colors.primary.bg : '#E74C3C' }} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Nazwa w grafiku</label>
              <input value={f.grafikName} onChange={(e) => set({ grafikName: e.target.value })} placeholder={f.name.trim().split(/\s+/).pop() || 'nazwisko'} className="w-full px-3 py-2 rounded-lg border font-mono text-sm" style={{ borderColor: colors.primary.bg }} />
              <p className="text-[10px] text-slate-400 mt-0.5">Dokładnie tak, jak osoba jest wpisana w matrycy (np. MATI KOLSKI)</p></div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Inne zapisy (aliasy)</label>
              <input value={f.aliasy} onChange={(e) => set({ aliasy: e.target.value })} placeholder="np. MATI KOSKI, KOSKI" className="w-full px-3 py-2 rounded-lg border font-mono text-sm" style={{ borderColor: colors.primary.bg }} />
              <p className="text-[10px] text-slate-400 mt-0.5">Literówki i warianty, oddzielone przecinkiem</p></div>
          </div>
          <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Funkcja</label><select value={f.funkcja} onChange={(e) => set({ funkcja: e.target.value })} className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}>{FUNKCJE.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Typ umowy</label><select value={f.umowa} onChange={(e) => set({ umowa: e.target.value })} className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}><option value="UOP">UOP (etat)</option><option value="UZ">UZ (zlecenie)</option></select></div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>{f.umowa === 'UOP' ? 'Wynagr. mies. (zł)' : 'Stawka (zł/h)'}</label><input type="number" value={f.stawka} onChange={(e) => set({ stawka: Number(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: colors.primary.dark }}><input type="checkbox" checked={f.zus} onChange={(e) => set({ zus: e.target.checked })} />Pracownik oskładkowany (ZUS){f.umowa === 'UOP' ? ' — dla UOP zawsze' : ''}</label>
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
    const payload = { ...f, grafikName: (f.grafikName || '').trim(), aliasy: String(f.aliasy || '').split(',').map((x) => x.trim()).filter(Boolean) };
    if (form.id) { await data.updateAccount(form.id, payload); data.show('Zapisano zmiany'); }
    else { const c = await data.addAccount(payload); if (c) setCred(c); }
    setForm(null);
  };
  const reset = async (e) => { const c = await data.resetAccountPassword(e.id); if (c) setCred(c); };
  const del = (e) => { if (confirm(`Usunąć konto: ${e.name} (${e.login})?`)) data.deleteAccount(e.id); };
  const filtered = emps.filter((e) => (e.name + ' ' + e.login).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Pracownicy" subtitle="Konta pracowników — funkcje, stawki, dane logowania">
        <button onClick={() => data.przypiszZmiany()} className="px-3 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: 'white', color: colors.primary.darkest }}>Przypisz zmiany do kont</button>
        <button onClick={() => setForm({ ...emptyForm })} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: colors.primary.medium }}>+ Dodaj pracownika</button>
      </Header>
      <div className="flex-1 p-8 space-y-4 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="flex items-center gap-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj: imię lub login…" className="px-3 py-2 rounded-lg border text-sm w-72" style={{ borderColor: colors.primary.bg }} /><span className="text-sm text-slate-400">{filtered.length} z {emps.length} kont</span></div>
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: colors.primary.bg }}>
          <div className="grid grid-cols-[1.4fr_1.4fr_90px_90px_80px_1fr_150px] gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: `linear-gradient(180deg, ${colors.primary.dark}, ${colors.primary.darkest})`, color: 'white' }}><span>Pracownik</span><span>Funkcja</span><span>Umowa</span><span className="text-right">Stawka</span><span className="text-center">ZUS</span><span>Login</span><span className="text-right">Akcje</span></div>
          {filtered.length === 0 ? <div className="p-8 text-center text-slate-400">Brak kont. Kliknij „Dodaj pracownika".</div> : filtered.map((e, i) => (
            <div key={e.id} className="grid grid-cols-[1.4fr_1.4fr_90px_90px_80px_1fr_150px] gap-2 px-4 py-2.5 items-center border-t text-sm" style={{ borderColor: '#eef2f7', backgroundColor: i % 2 ? '#f8fafc' : 'white' }}>
              <span className="truncate"><span className="font-semibold" style={{ color: colors.primary.darkest }}>{e.name}</span>{e.grafikName && <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{e.grafikName}</span>}</span>
              <span style={{ color: colors.primary.dark }}>{funkcjaLabel(e.funkcja)}{e.instruktor && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: '#fff4e0', color: '#B26A00' }}>instruktor</span>}</span>
              <span><span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{e.umowa}</span></span>
              <span className="text-right font-medium" style={{ color: colors.primary.darkest }}>{e.umowa === 'UOP' ? `${zl(e.stawka)}` : `${zl(e.stawka)}/h`}</span>
              <span className="text-center">{e.zus ? <Check size={16} style={{ color: '#2E9E5B' }} className="inline" /> : <span className="text-slate-300">—</span>}</span>
              <span className="font-mono font-semibold" style={{ color: colors.primary.dark }}>{e.login}</span>
              <span className="flex items-center justify-end gap-1">
                <button onClick={() => setForm({ id: e.id, name: e.name, funkcja: e.funkcja, umowa: e.umowa, stawka: e.stawka, zus: e.zus, instruktor: !!e.instruktor, grafikName: e.grafikName || '', aliasy: (e.aliasy || []).join(', ') })} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Edytuj</button>
                <button onClick={() => reset(e)} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}><Lock size={12} />PIN</button>
                <button onClick={() => del(e)} className="text-red-400 p-1"><Trash2 size={15} /></button>
              </span>
            </div>
          ))}
        </div>
        {(() => {
          const wGrafiku = {};
          (data.shifts || []).filter((x) => !x.accountId).forEach((x) => { const k = String(x.name || '').toUpperCase().trim(); if (k) wGrafiku[k] = (wGrafiku[k] || 0) + godzZ(x); });
          const osierocone = Object.entries(wGrafiku).sort((a, b) => b[1] - a[1]);
          if (!osierocone.length) return null;
          return (
            <div className="bg-white rounded-xl shadow-sm border p-4" style={{ borderColor: '#f0c000' }}>
              <div className="flex items-center gap-2 mb-2"><AlertCircle size={16} style={{ color: '#B26A00' }} /><h3 className="font-semibold text-sm" style={{ color: colors.primary.darkest }}>Nazwy z grafiku bez konta ({osierocone.length})</h3></div>
              <p className="text-xs mb-3" style={{ color: colors.primary.light }}>Te zmiany nie są przypisane do żadnego konta — ich godziny nie wliczą się do kosztów. Dopisz nazwę jako „Nazwa w grafiku" albo alias przy właściwym pracowniku (Edytuj), a potem kliknij „Przypisz zmiany do kont".</p>
              <Btn variant="secondary" onClick={() => data.przypiszZmiany()}>Przypisz zmiany do kont</Btn>
              <div className="h-2" />
              <div className="flex flex-wrap gap-1.5">
                {osierocone.map(([k, h]) => <span key={k} className="text-xs px-2 py-1 rounded-lg font-mono" style={{ backgroundColor: '#fff8e6', color: '#8a6d1a' }}>{k} <span className="opacity-60">{h.toFixed(0)} h</span></span>)}
              </div>
            </div>
          );
        })()}
        <p className="text-xs text-slate-400">Login nadawany automatycznie (3 litery imienia + 3 nazwiska + numer). PIN startowy (4 cyfry) generowany przy utworzeniu — pracownik zmienia go przy pierwszym logowaniu. „PIN" resetuje i pokazuje nowy PIN startowy.</p>
      </div>

      {form && <EmpForm init={form} onSave={save} onClose={() => setForm(null)} />}
      {cred && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCred(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center gap-2 mb-1"><div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e9f7ef' }}><Check size={20} style={{ color: '#2E9E5B' }} /></div><h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>Konto gotowe</h3></div>
            <p className="text-sm mb-4" style={{ color: colors.primary.light }}>Dane logowania dla: <b style={{ color: colors.primary.dark }}>{cred.name}</b>. Przekaż je pracownikowi — PIN zmieni przy pierwszym logowaniu.</p>
            <div className="space-y-2"><CopyField label="Login" value={cred.login} /><CopyField label="PIN startowy" value={cred.haslo} /></div>
            <div className="mt-4 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: '#fff8e6', color: '#8a6d1a' }}>Zapisz lub skopiuj PIN teraz — nie będzie później widoczny (przechowywany jako hash).</div>
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
  const kolorStanu = p.planTotal === 0 ? colors.primary.light : nadmiar > 0 ? '#E74C3C' : (p.total >= p.planTotal * 0.95 ? '#F5B000' : '#2E9E5B');
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
            ? <div className="rounded-xl p-4" style={{ backgroundColor: '#fdecea' }}>
                <p className="font-semibold mb-1" style={{ color: '#E74C3C' }}>Przekroczenie planu o {nadmiar.toFixed(1)} h</p>
                <p className="text-sm mb-2" style={{ color: colors.primary.dark }}>Sugerowane ścięcie: <b>{nadmiar.toFixed(1)} h</b>. Dni z największą liczbą godzin (kandydaci do redukcji):</p>
                <div className="flex flex-wrap gap-2">{topDni.map(([d, h]) => <span key={d} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: 'white', color: colors.primary.dark }}>{d.slice(5)} — {h.toFixed(1)} h</span>)}</div>
              </div>
            : <div className="rounded-xl p-3 text-sm" style={{ backgroundColor: '#e9f7ef', color: '#2E9E5B' }}>W ramach planu — pozostało {(p.planTotal - p.total).toFixed(1)} h.</div>)}
          <div className="grid grid-cols-4 gap-3 mt-4 text-center text-sm">
            <div className="rounded-lg p-2" style={{ backgroundColor: colors.primary.bg }}><b>{p.crew.toFixed(1)}</b><br />CREW</div>
            <div className="rounded-lg p-2" style={{ backgroundColor: '#e0f2f1' }}><b>{p.szkol.toFixed(1)}</b><br />Szkoleniowe</div>
            <div className="rounded-lg p-2" style={{ backgroundColor: colors.primary.bgLight }}><b>{p.mgr.toFixed(1)}</b><br />MGR{p.mgrManual ? ` (+${p.mgrManual})` : ''}</div>
            <div className="rounded-lg p-2" style={{ backgroundColor: colors.primary.bgLight }}><b>{p.funk.toFixed(1)}</b><br />MGR funkc.{p.funkManual ? ` (+${p.funkManual})` : ''}</div>
          </div>
        </Sekcja>

        <Sekcja kolor="#12423f" tytul="Godziny MGR (ręcznie)" ikona={Clock}>
          <p className="text-sm mb-3" style={{ color: colors.primary.light }}>Dodaj godziny managera do sumy RAZEM — w wybrany dzień albo w każdy dzień miesiąca. Ręcznie dodane: <b>{p.mgrManual.toFixed(1)} h</b> ({Object.keys((data.planowanie[ym] || {}).mgr || {}).length} dni).</p>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Godziny</label><input type="number" value={mgrH} onChange={e => setMgrH(e.target.value)} className="w-24 px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Dzień</label><select value={mgrDate} onChange={e => setMgrDate(e.target.value)} className="px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}>{dni.map(d => <option key={d} value={d}>{d.slice(5)}</option>)}</select></div>
            <Btn variant="secondary" onClick={() => data.applyGodziny(ym, 'mgr', 'day', mgrH, mgrDate)}>Zastosuj w ten dzień</Btn>
            <Btn onClick={() => data.applyGodziny(ym, 'mgr', 'month', mgrH)}>Przenieś na cały miesiąc</Btn>
            <Btn variant="secondary" onClick={() => data.clearGodziny(ym, 'mgr')}>Wyczyść</Btn>
          </div>
        </Sekcja>

        <Sekcja kolor="#455A64" tytul="Godziny MGR funkcyjne (ręcznie)" ikona={Clock}>
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
      <Header title="Giełda zamian" subtitle="Prośby o zamianę od pracowników — akceptacja przenosi zmianę na grafik" />
      <div className="flex-1 p-8 space-y-6 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="flex items-center justify-between">
          <div />
          <Btn variant="secondary" icon={RefreshCw} onClick={data.refreshSwaps}>Odśwież</Btn>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #F5B000' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: colors.primary.darkest }}>Do akceptacji ({doAkceptacji.length})</h3>
          {doAkceptacji.length === 0 ? <p className="text-sm" style={{ color: colors.primary.light }}>Brak zamian czekających na akceptację.</p> : (
            <div className="space-y-3">
              {doAkceptacji.map(s => (
                <div key={s.id} className="rounded-xl p-4" style={{ backgroundColor: colors.primary.bgLight }}>
                  <p className="text-sm" style={{ color: colors.primary.dark }}><b style={{ color: colors.primary.darkest }}>{s.requester}</b> oddaje zmianę: {opisZmiany(s.shift)}</p>
                  {s.note && <p className="text-xs italic mt-0.5" style={{ color: colors.primary.light }}>„{s.note}"</p>}
                  <p className="text-xs mt-3 mb-1" style={{ color: colors.primary.light }}>Zgłoszeni — wybierz, kto przejmie:</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {s.volunteers.map(v => { const on = chosen(s) === v; return (
                      <button key={v} onClick={() => setWyb(w => ({ ...w, [s.id]: v }))} className="px-3 py-1.5 rounded-lg text-sm font-medium" style={{ backgroundColor: on ? colors.primary.medium : 'white', color: on ? 'white' : colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}>{v}</button>
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
                  <p className="text-sm" style={{ color: colors.primary.dark }}><b>{s.requester}</b> — {opisZmiany(s.shift)}</p>
                  <span className="text-xs" style={{ color: colors.primary.light }}>brak zgłoszeń</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #94a3b8' }}>
          <h3 className="text-lg font-semibold mb-4" style={{ color: colors.primary.darkest }}>Historia ({historia.length})</h3>
          {historia.length === 0 ? <p className="text-sm" style={{ color: colors.primary.light }}>Brak zakończonych zamian.</p> : (
            <div className="space-y-2">
              {historia.map(s => { const st = statusZamiany(s); return (
                <div key={s.id} className="rounded-xl p-3" style={{ backgroundColor: st.bg }}>
                  <p className="text-xs" style={{ color: colors.primary.dark }}><b>{s.requester}</b> — {opisZmiany(s.shift)}</p>
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
      {(breaks || []).map((b, i) => { const bl = ((wtRel(b.start) - wtRel(start) + 1440) % 1440) / wtDur(start, end) * 100; const bw = wtDur(b.start, b.end) / wtDur(start, end) * 100; return <div key={i} className="absolute top-0 h-full" style={{ left: `${bl}%`, width: `${Math.max(bw, 1)}%`, backgroundColor: b.platna === false ? '#E74C3C' : '#F5B000' }} title={`${b.type} ${b.start}-${b.end}`} />; })}
    </div>
  );
};
const WTGrid = () => (<>{WT_TICKS.map((h) => <div key={h} className="absolute top-0 bottom-0 border-l" style={{ left: `${((h - 6) * 60 / 1440) * 100}%`, borderColor: '#eef2f7' }} />)}</>);

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
            {wynik && <p className="text-sm font-medium" style={{ color: '#12655B' }}>✓ Cykl ułożony: {wynik.ok}/{ileTyg} tygodni od {wynik.start}. Sprawdź w Schedule.</p>}
          </div>
        )}
      </div>
    </div>
  );
};

// ===================== SZABLONY TYGODNIOWE (Plantillas de Turnos Semanales) =====================
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
      <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: `linear-gradient(180deg, ${colors.primary.dark}, ${colors.primary.darkest})` }}>
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
                  <button onClick={() => window.confirm(`Usunąć szablon „${t.name}"?`) && data.deleteTemplate(t.id)} className="text-xs px-2 py-1.5 rounded-lg" style={{ backgroundColor: '#fdecea', color: '#E74C3C' }}>Usuń</button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 pt-1 border-t" style={{ borderColor: '#eef2f7' }}>
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
    const para = out.find((x) => x.date === i.date && plnMin(x.start) < plnMin(i.end) + (plnMin(i.end) <= plnMin(i.start) ? 1440 : 0) && plnMin(i.start) < plnMin(x.end) + (plnMin(x.end) <= plnMin(x.start) ? 1440 : 0));
    if (para) { para.szkoli = true; para.partnerSzk = i.partner || i.uczen || null; para.paraInstr = { date: i.date, name: i.name, start: i.start, end: i.end }; }
    else out.push({ ...i, szkoli: true });
  });
  return out;
};
// Szacunkowy koszt godzin wg konta (UZ: stawka/h; UOP: wynagrodzenie mies. / 160 h)
const kosztGodzin = (konto, h) => !konto ? 0 : (konto.umowa === 'UOP' ? (konto.stawka / 160) * h : konto.stawka * h);


// ===================== PLANOWANIE: OPTYMALIZACJA + BUDŻET w jednym module =====================
const PlanFinanse = ({ data, setPage }) => {
  const [sek, setSek] = useState('opty');
  const nav = (id) => { if (id === 'plan') setSek('budzet'); else if (id === 'forecast') setSek('opty'); else setPage(id); };
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-8 pt-5 flex gap-1 bg-white border-b" style={{ borderColor: colors.primary.bg }}>
        {[['opty', 'Optymalizacja i prognoza'], ['budzet', 'Budżet i koszty pracy (COL)']].map(([k, l]) => (
          <button key={k} onClick={() => setSek(k)} className="px-5 py-2.5 rounded-t-xl text-sm font-semibold" style={{ backgroundColor: sek === k ? colors.primary.bgLight : 'transparent', color: sek === k ? colors.primary.darkest : colors.primary.light, borderBottom: sek === k ? `3px solid ${colors.primary.medium}` : '3px solid transparent' }}>{l}</button>
        ))}
      </div>
      {sek === 'opty' ? <ForecastPlan data={data} setPage={nav} /> : <BudgetPlan data={data} setPage={nav} />}
    </div>
  );
};

// ===================== SIATKA TYGODNIA (planowanie jak MAPAL Scheduler) =====================
const WeekPlanner = ({ data, days, locked, onDzien }) => {
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
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
  const klikChip = (w, x, e) => { e.stopPropagation(); if (locked) return; setModal({ tryb: 'edycja', osoba: x.name, accountId: x.accountId || w.id, station: x.station, start: x.start, end: x.end, date: x.date, szkoli: !!x.szkoli, paraInstr: x.paraInstr || null, ident: { date: x.date, name: x.name, start: x.start, end: x.end } }); };
  const zapisz = async () => {
    if (!modal) return; setSaving(true);
    let ok;
    if (modal.tryb === 'nowa') ok = await data.addShiftManual({ date: modal.date, name: modal.osoba, station: modal.station, start: modal.start, end: modal.end, accountId: modal.accountId || undefined });
    else {
      ok = await data.updateShiftManual(modal.ident, { station: modal.station, start: modal.start, end: modal.end });
      if (ok && modal.paraInstr) await data.updateShiftManual(modal.paraInstr, { start: modal.start, end: modal.end });
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
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: colors.primary.bg }}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2.5" style={{ background: `linear-gradient(180deg, ${colors.primary.dark}, ${colors.primary.darkest})` }}>
        <span className="text-sm font-semibold text-white">Siatka tygodnia</span>
        <span className="text-xs text-white/80">Godziny: <b className="text-white">{f0(sumaTygH)} h</b></span>
        <span className="text-xs text-white/80">Koszt pracy (szac.): <b className="text-white">{f0(sumaKoszt)} zł</b></span>
        {sprzedazTyg > 0 && <><span className="text-xs text-white/80">Sprzedaż: <b className="text-white">{f0(sprzedazTyg)} zł</b></span>
        <span className="text-xs text-white/80">SPLH: <b className="text-white" style={{ color: sumaTygH && sprzedazTyg / sumaTygH >= 420 ? '#7CE0A3' : undefined }}>{sumaTygH ? f0(sprzedazTyg / sumaTygH) : '—'}</b></span></>}
        <span className="ml-auto text-[11px] text-white/60">kliknij pustą komórkę = nowa zmiana · kliknij zmianę = edycja</span>
      </div>
      <div className="overflow-x-auto"><div style={{ minWidth: 1120 }}>
        <div className="grid" style={{ gridTemplateColumns: gridCols, borderBottom: `2px solid ${colors.primary.bg}` }}>
          <div className="px-3 py-2 text-[11px] font-bold uppercase" style={{ color: colors.primary.dark }}>Pracownik</div>
          {days.map((d) => { const dt = new Date(d); return (
            <button key={d} onClick={() => onDzien && onDzien(d)} title="Otwórz widok dnia" className="px-1 py-2 text-center border-l hover:bg-slate-50" style={{ borderColor: '#f1f5f9' }}>
              <span className="block text-[11px] font-bold" style={{ color: [0, 6].includes(dt.getDay()) ? '#B7362A' : colors.primary.dark }}>{['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'][dt.getDay()]} {dt.getDate()}</span>
            </button>
          ); })}
          <div className="px-2 py-2 text-[11px] font-bold uppercase text-right border-l" style={{ color: colors.primary.dark, borderColor: '#f1f5f9' }}>Σ tydzień</div>
        </div>
        <div className="max-h-[560px] overflow-y-auto">
          {wiersze.map((w) => (
            <div key={w.key} className="grid border-b last:border-0" style={{ gridTemplateColumns: gridCols, borderColor: '#f1f5f9', backgroundColor: w.sumaH === 0 ? '#fbfcfe' : 'white' }}>
              <div className="px-3 py-1.5 flex flex-col justify-center min-h-[46px]">
                <p className="text-[12.5px] font-semibold truncate" style={{ color: w.sumaH ? colors.primary.darkest : '#94a3b8' }}>{w.label}</p>
                <p className="text-[10px]" style={{ color: colors.primary.light }}>{w.funkcja ? funkcjaLabel(w.funkcja) : '⚠ brak konta'}</p>
              </div>
              {days.map((d) => {
                const cel = w.moje.filter((x) => x.date === d).sort((a, b) => a.start.localeCompare(b.start));
                return (
                  <div key={d} onClick={() => cel.length === 0 && klikPusta(w, d)} className={`border-l px-1 py-1 flex flex-col gap-1 justify-center ${cel.length === 0 && !locked ? 'cursor-pointer hover:bg-slate-50' : ''}`} style={{ borderColor: '#f1f5f9' }}>
                    {cel.map((x, i) => { const kol = stationColor(x.station); return (
                      <button key={i} onClick={(e) => klikChip(w, x, e)} className="rounded-md px-1.5 py-0.5 text-left hover:brightness-95" style={{ backgroundColor: `${kol}1d`, borderLeft: `3px solid ${kol}` }} title={`${x.station} ${x.start}–${x.end}${x.szkoli ? ` · szkoli${x.partnerSzk ? ': ' + x.partnerSzk : ''}` : ''}`}>
                        <span className="block text-[9.5px] font-bold leading-tight truncate" style={{ color: kol }}>{etykietaStacji(x)}{x.szkoli ? ' 🎓' : ''}</span>
                        <span className="block text-[10px] leading-tight" style={{ color: colors.primary.dark }}>{x.start}–{x.end}</span>
                      </button>
                    ); })}
                    {cel.length === 0 && !locked && <span className="text-center text-slate-200 text-lg leading-none select-none">+</span>}
                  </div>
                );
              })}
              <div className="border-l px-2 py-1.5 flex flex-col justify-center items-end" style={{ borderColor: '#f1f5f9' }}>
                <span className="text-[12.5px] font-bold" style={{ color: w.sumaH ? colors.primary.darkest : '#cbd5e1' }}>{w.sumaH.toFixed(1).replace('.', ',')} h</span>
                {w.konto && w.sumaH > 0 && <span className="text-[10px]" style={{ color: colors.primary.light }}>{f0(kosztGodzin(w.konto, w.sumaH))} zł</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="grid border-t-2" style={{ gridTemplateColumns: gridCols, borderColor: colors.primary.bg, backgroundColor: colors.primary.bgLight }}>
          <div className="px-3 py-2 text-[11px] font-bold" style={{ color: colors.primary.dark }}>Σ godzin dnia</div>
          {days.map((d) => { const idealH = (() => { const dw = new Date(d).getDay(); const { dir, ind } = optRozbicie(0, 420, 3, 'krzywa', dw); return dir.reduce((a, v, i) => a + Math.max(v, ind[i]), 0) / 2; })(); const h = sumaDniaH(d); const kol = h < idealH * 0.95 ? '#B7362A' : h > idealH * 1.1 ? '#2F6FB5' : '#12655B'; return (
            <div key={d} className="px-1 py-1.5 text-center border-l" style={{ borderColor: '#eef2f7' }}>
              <span className="block text-[12px] font-bold leading-tight" style={{ color: kol }}>{h.toFixed(1).replace('.', ',')}</span>
              <span className="block text-[9px] leading-tight" style={{ color: colors.primary.light }}>potrzeba {idealH.toFixed(0)}</span>
            </div>
          ); })}
          <div className="px-2 py-2 text-right text-[12px] font-bold border-l" style={{ color: colors.primary.darkest, borderColor: '#eef2f7' }}>{sumaTygH.toFixed(1).replace('.', ',')} h</div>
        </div>
      </div></div>

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
            </div>
            <div className="flex items-center gap-2 mt-5">
              {modal.tryb === 'edycja' && <button disabled={saving} onClick={usun} className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: '#fdecea', color: '#E74C3C' }}>Usuń zmianę</button>}
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

// ===================== PLANER DNIA (styl MAPAL Scheduler 2.0) =====================
// Wiersze = pracownicy, oś = doba operacyjna 06:00→06:00. Klik w pusty obszar dodaje
// zmianę (start = kliknięta godzina), klik w pasek otwiera edycję. Wszystko zapisuje
// się przez backend (add/update/remove) i od razu tworzy wpisy wykonania.
const PLN_H0 = 6, PLN_HN = 30;                              // 06 → 06 następnego dnia
const plnMin = (t) => { const [h, m] = String(t).split(':').map(Number); let x = h * 60 + (m || 0); if (x < PLN_H0 * 60) x += 1440; return x; };
const plnPct = (t) => ((plnMin(t) - PLN_H0 * 60) / ((PLN_HN - PLN_H0) * 60)) * 100;
const plnClock = (min) => `${String(Math.floor((min % 1440) / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

const DayPlanner = ({ data, day, locked }) => {
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
    return Math.round(frac * (PLN_HN - PLN_H0) * 2);          // slot co 30 min (0..48)
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
    setModal({ tryb: 'edycja', osoba: x.name, accountId: x.accountId || w.id, station: x.station, start: x.start, end: x.end, szkoli: !!x.szkoli, paraInstr: x.paraInstr || null, ident: { date: x.date, name: x.name, start: x.start, end: x.end } });
  };
  const zapisz = async () => {
    if (!modal) return;
    setSaving(true);
    let ok;
    if (modal.tryb === 'nowa') ok = await data.addShiftManual({ date: day, name: modal.osoba, station: modal.station, start: modal.start, end: modal.end, accountId: modal.accountId || undefined });
    else {
      ok = await data.updateShiftManual(modal.ident, { station: modal.station, start: modal.start, end: modal.end });
      if (ok && modal.paraInstr) await data.updateShiftManual(modal.paraInstr, { start: modal.start, end: modal.end });   // wiersz szkoleniowy trzyma te same godziny
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

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: colors.primary.bg }}>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: `linear-gradient(180deg, ${colors.primary.dark}, ${colors.primary.darkest})` }}>
        <span className="text-sm font-semibold text-white">Planowanie zmian — siatka dnia</span>
        <span className="text-xs text-white/70">kliknij pusty obszar lub przeciągnij = nowa zmiana · kliknij pasek = edycja</span>
      </div>
      <div className="px-4 py-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 border-b bg-white" style={{ borderColor: colors.primary.bg }}>
        {[
          ['Plan (h)', planHDnia.toFixed(2).replace('.', ','), colors.primary.darkest],
          ['Wymagane (h)', cov96.requiredH.toFixed(2).replace('.', ','), colors.primary.darkest],
          ['Nadmiar', cov96.excessH.toFixed(2).replace('.', ','), cov96.excessH > 0.01 ? '#B26A00' : '#94a3b8'],
          ['Niedobór', cov96.deficitH.toFixed(2).replace('.', ','), cov96.deficitH > 0.01 ? '#B7362A' : '#94a3b8'],
          ['Pokrycie', `${cov96.coveragePct.toFixed(0)}%`, cov96.coveragePct >= 95 ? '#12655B' : '#B7362A'],
          ['SPLH', sprzedazDnia && planHDnia ? f0(sprzedazDnia / planHDnia) : '—', sprzedazDnia && planHDnia && sprzedazDnia / planHDnia >= 420 ? '#12655B' : colors.primary.dark],
          ['Koszt', `${f0(kosztDnia)} zł`, colors.primary.dark],
          ['COL', sprzedazDnia ? `${(kosztDnia / sprzedazDnia * 100).toFixed(1).replace('.', ',')}%` : '—', sprzedazDnia && kosztDnia / sprzedazDnia > 0.2 ? '#B7362A' : colors.primary.dark],
        ].map(([l, v, k], i) => (
          <span key={i} className="flex items-baseline gap-1.5"><span className="text-[9px] uppercase font-semibold" style={{ color: colors.primary.light }}>{l}</span><span className="text-[13px] font-bold" style={{ color: k }}>{v}</span></span>
        ))}
        <span className="ml-auto text-[9px]" style={{ color: colors.primary.light }}>silnik 15 min · Excess/Deficit per slot</span>
      </div>
      <div className="overflow-x-auto"><div className="min-w-[1080px]">
        <div className="flex" style={{ borderBottom: `1px solid ${colors.primary.bg}` }}>
          <div className="w-56 shrink-0 px-3 py-1.5 text-[11px] font-bold uppercase" style={{ color: colors.primary.dark }}>Pracownik</div>
          <div className="flex-1 flex">
            {godzinyOsi.map((h) => <div key={h} className="flex-1 text-center text-[10px] py-1.5 font-medium" style={{ color: h >= 13 && h < 20 ? '#B26A00' : colors.primary.light, borderLeft: '1px solid #f1f5f9', backgroundColor: h >= 13 && h < 20 ? '#fffaf0' : undefined }}>{String(h % 24).padStart(2, '0')}</div>)}
          </div>
        </div>
        <div style={{ borderBottom: `2px solid ${colors.primary.bg}`, backgroundColor: '#fbfcfe' }}>
          {[
            { l: 'Praca pośrednia', arr: demInd, typ: 'n' },
            { l: 'Praca bezpośrednia', arr: demDir, typ: 'n' },
            { l: 'Personal Ideal', arr: demand, typ: 'b' },
            { l: 'Obsada w planie', arr: coverPlan, typ: 'p' },
          ].map((rw, ri) => (
            <div key={ri} className="flex" style={{ borderTop: ri ? '1px solid #eef2f7' : 'none' }}>
              <div className="w-56 shrink-0 px-3 flex items-center justify-between">
                <span className={`text-[10px] ${rw.typ === 'n' ? '' : 'font-bold'}`} style={{ color: rw.typ === 'n' ? colors.primary.light : colors.primary.dark }}>{rw.l}</span>
                {ri === 3 && <span className="text-[9px]" style={{ color: colors.primary.light }}>{sprzedazDnia ? 'wg sprzedaży · SPLH 420' : 'wg krzywej celu'}</span>}
              </div>
              <div className="flex-1 flex">
                {godzinyOsi.map((h) => {
                  const i1 = sl(h), v = Math.max(rw.arr[i1] || 0, rw.arr[i1 + 1] || 0);
                  let bg, kol = colors.primary.dark;
                  if (rw.typ === 'p') { const need = Math.max(demand[i1] || 0, demand[i1 + 1] || 0); kol = v < need ? '#B7362A' : v > need ? '#2F6FB5' : '#12655B'; bg = v < need ? '#fbe9e7' : v > need ? '#e8f1fb' : '#e9f7ef'; }
                  return <div key={h} className="flex-1 text-center border-l" style={{ borderColor: '#f1f5f9', backgroundColor: bg }} title={`${String(h % 24).padStart(2, '0')}:00 — ${rw.l}: ${v}`}><span className={`block text-[9px] leading-4 ${rw.typ === 'n' ? '' : 'font-bold'}`} style={{ color: rw.typ === 'n' ? '#94a3b8' : kol }}>{v || ''}</span></div>;
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center" style={{ borderBottom: '1px solid #eef2f7', backgroundColor: '#fbfcfe' }}>
          <div className="w-56 shrink-0 px-3 py-1"><p className="text-[10px] font-bold uppercase" style={{ color: colors.primary.dark }}>Pokrycie co 15 min</p><p className="text-[9px]" style={{ color: colors.primary.light }}>{slotSel != null ? `${v4SlotLabel(slotSel)} — podświetlono pracujących · kliknij ponownie, by wyczyścić` : 'kliknij slot, aby podświetlić osoby'}</p></div>
          <div className="flex-1 flex py-1.5 pr-1">
            {cov96.perSlot.map((sl2, i) => {
              const kol = sl2.def > 0.01 ? '#B7362A' : sl2.exc > 0.01 ? '#E8A13A' : sl2.req > 0 ? '#2E9E5B' : '#e2e8f0';
              return <button key={i} onClick={() => setSlotSel(slotSel === i ? null : i)} className="flex-1 mx-px rounded-sm" style={{ height: 12, backgroundColor: kol, outline: slotSel === i ? `2px solid ${colors.primary.darkest}` : 'none' }} title={`${v4SlotLabel(i)} — potrzeba ${sl2.req.toFixed(1)}, plan ${sl2.sch.toFixed(1)}, Δ ${(sl2.sch - sl2.req).toFixed(1)}`} />;
            })}
          </div>
        </div>
        <div className="flex" style={{ borderBottom: `2px solid ${colors.primary.bg}`, backgroundColor: 'white' }}>
          <div className="w-56 shrink-0 px-3 py-1 flex flex-col justify-center"><p className="text-[10px] font-bold uppercase" style={{ color: colors.primary.dark }}>Zapotrzebowanie vs plan</p><p className="text-[9px]" style={{ color: colors.primary.light }}><span style={{ color: colors.primary.darkest }}>■ wymagane</span> · <span style={{ color: '#E2571E' }}>■ w planie</span></p></div>
          <div className="flex-1 pr-1">
            {(() => {
              const mx = Math.max(1, ...cov96.perSlot.map((q) => Math.max(q.req, q.sch)));
              const pt = (v, i) => `${(i / (V4_NSLOT - 1)) * 960},${56 - (v / mx) * 50}`;
              return (
                <svg viewBox="0 0 960 60" preserveAspectRatio="none" className="w-full" style={{ height: 60 }}>
                  {[0, 16, 32, 48, 64, 80].map((g) => <line key={g} x1={(g / 95) * 960} y1="4" x2={(g / 95) * 960} y2="56" stroke="#eef2f7" strokeWidth="1" />)}
                  <polyline points={cov96.perSlot.map((q, i) => pt(q.req, i)).join(' ')} fill="none" stroke={colors.primary.darkest} strokeWidth="1.6" />
                  <polyline points={cov96.perSlot.map((q, i) => pt(q.sch, i)).join(' ')} fill="none" stroke="#E2571E" strokeWidth="1.6" />
                </svg>
              );
            })()}
          </div>
        </div>
        <div className="max-h-[520px] overflow-y-auto">
          {wiersze.map((w) => (
            <div key={w.key} className="flex items-stretch border-b last:border-0" style={{ borderColor: '#f1f5f9', backgroundColor: slotSel != null && w.moje.some((x) => slotSwieci(x, slotSel)) ? '#fff8e1' : undefined }}>
              <div className="w-56 shrink-0 px-3 py-2 flex flex-col justify-center">
                <p className="text-[13px] font-semibold truncate" style={{ color: colors.primary.darkest }}>{w.label}</p>
                <p className="text-[10px]" style={{ color: colors.primary.light }}>{w.funkcja ? funkcjaLabel(w.funkcja) : '⚠ brak konta'}{w.moje.length ? ` · ${w.moje.reduce((a, x) => a + godzZ(x), 0).toFixed(1).replace('.', ',')} h` : ''}</p>
              </div>
              <div className="relative flex-1 cursor-crosshair select-none" style={{ minHeight: 44 }}
                onMouseDown={(e) => dragStart(w, e)} onMouseMove={(e) => dragMove(w, e)} onMouseUp={(e) => dragEnd(w, e)}
                title={locked ? '' : 'Kliknij lub przeciągnij, aby dodać zmianę'}>
                {drag && drag.key === w.key && (() => { const a = Math.min(drag.a, drag.b), b = Math.max(drag.a, drag.b, a + 1); return (
                  <div className="absolute rounded-md pointer-events-none flex items-center justify-center" style={{ left: `${a / (2 * (PLN_HN - PLN_H0)) * 100}%`, width: `${(b - a) / (2 * (PLN_HN - PLN_H0)) * 100}%`, top: 5, bottom: 5, backgroundColor: 'rgba(226,87,30,.18)', border: '2px dashed #E2571E' }}>
                    <span className="text-[10px] font-bold" style={{ color: '#B7440F' }}>{plnClock(PLN_H0 * 60 + a * 30)}–{plnClock(PLN_H0 * 60 + b * 30)}</span>
                  </div>
                ); })()}
                {godzinyOsi.map((h, i) => <div key={h} className="absolute top-0 bottom-0" style={{ left: `${(i / godzinyOsi.length) * 100}%`, width: 1, backgroundColor: h >= 13 && h < 20 ? '#f5e6c8' : '#f1f5f9' }} />)}
                {w.moje.map((x, i) => {
                  const L = plnPct(x.start); const Wd = Math.max(plnPct(x.end) - L, 2);
                  const kol = stationColor(x.station);
                  return (
                    <button key={i} onClick={(e) => klikPasek(w, x, e)} className="absolute rounded-md text-left px-1.5 overflow-hidden shadow-sm hover:brightness-95"
                      style={{ left: `${L}%`, width: `${Wd}%`, top: 7, bottom: 7, backgroundColor: `${kol}22`, borderLeft: `3px solid ${kol}` }}
                      title={`${x.station} ${x.start}–${x.end}${x.szkoli ? ` · szkoli${x.partnerSzk ? ': ' + x.partnerSzk : ''}` : ''}${x.dodana ? ' (ręczna)' : ''} — kliknij, aby edytować`}>
                      <span className="block text-[10px] font-bold leading-tight truncate" style={{ color: kol }}>{etykietaStacji ? etykietaStacji(x) : x.station}{x.szkoli ? ' 🎓' : ''}</span>
                      <span className="block text-[10px] leading-tight" style={{ color: colors.primary.dark }}>{x.start}–{x.end}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {wiersze.length === 0 && <p className="text-center text-slate-400 py-8 text-sm">Brak kont i zmian. Dodaj pracowników w module Pracownicy.</p>}
        </div>
      </div></div>

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
            </div>
            <div className="flex items-center gap-2 mt-5">
              {modal.tryb === 'edycja' && <button disabled={saving} onClick={usun} className="px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: '#fdecea', color: '#E74C3C' }}>Usuń zmianę</button>}
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

  const act = (s) => ts.actuals[wtKey(s)] || { start: s.start, end: s.end, breaks: [] };
  const setAct = (s, patch) => { if (locked) return data.show('Tydzień zamknięty — tylko podgląd', 'error'); data.tsPutActual(wtKey(s), { ...act(s), ...patch }); };
  const unpaid = (a) => (a.breaks || []).filter((b) => b.platna === false).reduce((x, b) => x + wtDur(b.start, b.end), 0);
  const actualNet = (s) => wtDur(act(s).start, act(s).end) - unpaid(act(s));
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
  const actualMin = rowsGodz.reduce((x, s) => x + actualNet(s), 0);
  const eff = plannedMin ? Math.round((actualMin / plannedMin) * 100) : 0;

  const simulate = () => {
    if (locked) return;
    const map = {};
    dayShifts(day).forEach((s) => {
      const seed = [...wtKey(s)].reduce((a, c) => a + c.charCodeAt(0), 0);
      const ds = (seed % 13) - 4, de = ((seed >> 2) % 15) - 3;
      map[wtKey(s)] = { start: wtClock(wtToMin(s.start) + ds), end: wtClock(wtToMin(s.end) + de), breaks: (ts.actuals[wtKey(s)]?.breaks) || [] };
    });
    data.tsPutActualsBulk(map);
    data.show('Wbicia zasymulowane');
  };

  const dateLabel = (d) => { const dt = new Date(d); return `${dniPelne[dt.getDay()]}, ${dt.getDate()} ${monthsGen[dt.getMonth()]} ${dt.getFullYear()}`; };

  if (view === 'list') {
    const wcLabel = 'PLK 201043 · Kraków Galeria Krakowska';
    const range = (w) => { const e = new Date(w.start); e.setDate(e.getDate() + 6); return `${w.start.slice(8)}.${w.start.slice(5, 7)} – ${ymd(e).slice(8)}.${ymd(e).slice(5, 7)}.${w.start.slice(0, 4)}`; };
    return (
      <div className="flex-1 flex flex-col">
        <Header title="WorkRhythm" subtitle="Schedule · Actual · Blueprints · ShiftCycles · Time & Attendance" />
        <div className="px-8 pt-3 flex gap-1 bg-white border-b" style={{ borderColor: colors.primary.bg }}>
          {[['schedule', 'Schedule'], ['actual', 'Actual'], ['blueprints', 'Blueprints'], ['cycles', 'ShiftCycles'], ['tna', 'Time & Attendance']].map(([k, l]) => (
            <button key={k} onClick={() => setWrTab(k)} className="px-4 py-2 rounded-t-lg text-sm font-semibold" style={{ backgroundColor: wrTab === k ? colors.primary.bgLight : 'transparent', color: wrTab === k ? colors.primary.darkest : colors.primary.light, borderBottom: wrTab === k ? `3px solid ${colors.primary.medium}` : '3px solid transparent' }}>{l}</button>
          ))}
        </div>
        <div className="flex-1 p-8 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
          {wrTab === 'schedule' && <p className="text-xs mb-3" style={{ color: colors.primary.light }}>Planowanie obsady — kliknij tydzień, aby otworzyć siatkę planowania.</p>}
          {wrTab === 'actual' && <p className="text-xs mb-3" style={{ color: colors.primary.light }}>Wykonanie (Working Time) — kliknij tydzień, aby rozliczyć wbicia, przerwy i korekty.</p>}
          {wrTab === 'tna' && <p className="text-xs mb-3" style={{ color: colors.primary.light }}>Time & Attendance — statusy tygodni: oznaczaj dni jako Completed, potem Reviewed i Closed (blokada edycji).</p>}
          <div className="flex items-center gap-2 mb-3"><span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: colors.primary.light }}>Work Center</span><div className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border" style={{ borderColor: colors.primary.bg, color: colors.primary.darkest }}>{wcLabel}</div></div>
          {['schedule', 'actual', 'tna'].includes(wrTab) && (<>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border" style={{ borderColor: colors.primary.bg }}>
            <div className="grid grid-cols-[1fr_110px_110px_110px_56px] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: `linear-gradient(180deg, ${colors.primary.dark}, ${colors.primary.darkest})`, color: 'white' }}><span>Week</span><span className="text-center">Completed</span><span className="text-center">Reviewed</span><span className="text-center">Closed</span><span /></div>
            {weeks.length === 0 ? <div className="p-8 text-center text-slate-400">Brak grafiku. Zaimportuj miesiąc.</div> : weeks.map((w, idx) => {
              const done = weekDone(w); const st = wsOf(w.start);
              const toggleReviewed = (e) => { e.stopPropagation(); if (!canEdit) return; if (!done) return data.show('Najpierw zamknij wszystkie dni (Completed)', 'error'); data.tsSetWeek(w.start, { ...st, reviewed: !st.reviewed }); };
              const toggleClosed = (e) => { e.stopPropagation(); if (!canEdit) return; if (st.closed) { data.tsSetWeek(w.start, { ...st, closed: false }); data.show('Tydzień otwarty ponownie'); return; } if (!done) return data.show('Najpierw wszystkie dni Completed', 'error'); data.tsSetWeek(w.start, { reviewed: true, closed: true }); data.show('Tydzień zamknięty'); };
              return (
                <div key={w.start} className="grid grid-cols-[1fr_110px_110px_110px_56px] px-4 py-2.5 items-center border-t text-sm" style={{ borderColor: '#eef2f7', backgroundColor: idx % 2 ? '#f8fafc' : 'white' }}>
                  <button onClick={() => openWeek(w, wrTab === 'schedule' ? 'siatka' : 'wykonanie')} className="text-left font-medium hover:underline" style={{ color: colors.primary.darkest }}>{range(w)}<span className="text-xs text-slate-400 ml-2">({w.days.length} dni)</span></button>
                  <span className="flex justify-center">{done ? <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e9f7ef' }}><Check size={15} style={{ color: '#2E9E5B' }} /></span> : <span className="text-slate-300">…</span>}</span>
                  <span className="flex justify-center"><button onClick={toggleReviewed} title="Reviewed" className="w-6 h-6 rounded-full flex items-center justify-center border" style={{ borderColor: st.reviewed ? '#2E9E5B' : colors.primary.bg, backgroundColor: st.reviewed ? '#e9f7ef' : 'white' }}>{st.reviewed && <Check size={14} style={{ color: '#2E9E5B' }} />}</button></span>
                  <span className="flex justify-center"><button onClick={toggleClosed} title="Closed" className="w-6 h-6 rounded-full flex items-center justify-center border" style={{ borderColor: st.closed ? '#E74C3C' : colors.primary.bg, backgroundColor: st.closed ? '#fdecea' : 'white' }}>{st.closed && <Check size={14} style={{ color: '#E74C3C' }} />}</button></span>
                  <span className="flex justify-center"><button onClick={() => openWeek(w, wrTab === 'schedule' ? 'siatka' : 'wykonanie')} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: colors.primary.medium }}><ChevronRight size={16} /></button></span>
                </div>
              );
            })}
            <div className="px-4 py-2 text-[11px] text-slate-400 flex items-center justify-between border-t" style={{ borderColor: '#eef2f7' }}><span>Rekordów: {weeks.length}</span><span>REX Cloud · Time &amp; Attendance</span></div>
          </div>
          {canEdit && (
            <div className="mt-3 bg-white rounded-xl shadow-sm border p-4 flex flex-wrap items-center gap-3" style={{ borderColor: colors.primary.bg }}>
              <span className="text-sm font-medium" style={{ color: colors.primary.darkest }}>Otwórz dowolny dzień:</span>
              <input type="date" id="wt-nowa-data" className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: colors.primary.bg }} defaultValue={ymd(new Date())} />
              <button onClick={() => { const v = document.getElementById('wt-nowa-data').value; if (!v) return; setWeekStart(wtMonday(v)); setDay(v); setView('week'); }} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: colors.primary.medium }}>Otwórz</button>
              <span className="text-xs text-slate-400">Także dzień bez zmian — możesz od razu dodać tam pierwszą zmianę (np. managera na nowy miesiąc).</span>
            </div>
          )}
          </>)}
          {wrTab === 'blueprints' && canEdit && (<>
            <p className="text-xs mb-3" style={{ color: colors.primary.light }}>Blueprints — wzorcowe tygodnie z generycznymi slotami. Zapisz najlepszy tydzień i nakładaj go na kolejne z przypisaniem osób.</p>
            <WTTemplates data={data} weeks={weeks} />
          </>)}
          {wrTab === 'cycles' && canEdit && <ShiftCycles data={data} />}
          {!canEdit && <p className="text-xs text-slate-400 mt-3">Widok kierownika zmiany — podgląd. Zamykanie i korekty wykonuje ASM.</p>}
        </div>
      </div>
    );
  }

  const sprzDnia = ((data.salesData || {}).sales || {})[day];
  const parDnia = ((data.salesData || {}).checks || {})[day];
  const wszystkieStacje = [...new Set(['MANAGER', 'MGR FUNKCYJNE', ...data.shifts.map((x) => x.station)])].filter(Boolean);
  const openStartRel = rows.length ? Math.min(...rows.map((s) => wtRel(s.start))) : 0;
  const openEndRel = rows.length ? Math.max(...rows.map((s) => wtRel(s.start) + wtDur(s.start, s.end))) : 0;
  const st = weekStart ? wsOf(weekStart) : { reviewed: false, closed: false };
  const chip = (on, txt, kol) => <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: on ? kol.bg : '#f1f5f9', color: on ? kol.fg : '#94a3b8' }}>{txt}</span>;
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Header title="WorkRhythm" subtitle={dateLabel(day)}>
        {chip(weekDone(curWeek()), 'Completed', { bg: '#e9f7ef', fg: '#2E9E5B' })}
        {chip(st.reviewed, 'Reviewed', { bg: '#e9f7ef', fg: '#2E9E5B' })}
        {chip(st.closed, 'Closed', { bg: '#fdecea', fg: '#E74C3C' })}
        <button disabled={locked} onClick={() => { data.tsToggleCompleted(day); data.show(!ts.completed[day] ? 'Dzień oznaczony jako Completed' : 'Zdjęto status Completed'); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: ts.completed[day] ? '#2E9E5B' : 'white', color: ts.completed[day] ? 'white' : colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}><Check size={15} />{ts.completed[day] ? 'Completed' : 'Zamknij dzień'}</button>
      </Header>
      <div className="px-5 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b bg-white shadow-sm shrink-0" style={{ borderColor: colors.primary.bg }}>
          <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm shrink-0" style={{ color: colors.primary.medium }}><ChevronLeft size={16} />Tygodnie</button>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => zmienTydzien(-7)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100" style={{ color: colors.primary.dark }}><ChevronLeft size={15} /></button>
            <span className="text-sm font-semibold" style={{ color: colors.primary.darkest }}>{weekDays[0].slice(8)}.{weekDays[0].slice(5, 7)} – {weekDays[6].slice(8)}.{weekDays[6].slice(5, 7)}</span>
            <button onClick={() => zmienTydzien(7)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-slate-100" style={{ color: colors.primary.dark }}><ChevronRight size={15} /></button>
          </div>
          <div className="flex gap-0.5">
            {weekDays.map((d, i) => { const akt = zakresTyg === 'dzien' && day === d; return (
              <button key={d} onClick={() => { setDay(d); setZakresTyg('dzien'); }} className="px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1" style={{ backgroundColor: akt ? colors.primary.medium : 'transparent', color: akt ? 'white' : i >= 5 ? '#B7362A' : colors.primary.dark, border: `1px solid ${akt ? colors.primary.medium : colors.primary.bg}` }}>{ts.completed[d] && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: akt ? 'white' : '#2E9E5B' }} />}{['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'][i]} {new Date(d).getDate()}<span className="font-normal opacity-60">{dayShifts(d).length}</span></button>
            ); })}
            <button onClick={() => setZakresTyg('siatka')} className="ml-1 px-2.5 py-1 rounded-md text-[11px] font-bold" style={{ backgroundColor: zakresTyg === 'siatka' ? colors.primary.medium : 'transparent', color: zakresTyg === 'siatka' ? 'white' : colors.primary.dark, border: `1px solid ${zakresTyg === 'siatka' ? colors.primary.medium : colors.primary.bg}` }}>Tydzień</button>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {locked && <span className="text-[11px] px-2 py-1 rounded-md font-semibold" style={{ backgroundColor: '#fdecea', color: '#E74C3C' }}>🔒 tylko podgląd</span>}
            <span className="text-[11px]" style={{ color: colors.primary.light }}>{data.loading ? 'Zapisuję…' : `Zapis automatyczny${data.lastSync ? ` · ${String(data.lastSync.getHours()).padStart(2, '0')}:${String(data.lastSync.getMinutes()).padStart(2, '0')}` : ''}`}</span>
            <button onClick={() => data.sync()} disabled={data.loading} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: colors.primary.medium }}>Zapisz / odśwież</button>
          </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4" style={{ backgroundColor: colors.primary.bgLight }}>
        {zakresTyg === 'siatka' && <WeekPlanner data={data} days={weekDays} locked={locked || !canEdit} onDzien={(d) => { setDay(d); setZakresTyg('dzien'); }} />}

        {zakresTyg === 'dzien' && (<>
        <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border w-fit" style={{ borderColor: colors.primary.bg }}>
          {[['plan', 'Planowanie'], ['wykonanie', 'Wykonanie (Working Time)']].map(([k, l]) => (
            <button key={k} onClick={() => setTrybDnia(k)} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: trybDnia === k ? colors.primary.medium : 'transparent', color: trybDnia === k ? 'white' : colors.primary.dark }}>{l}</button>
          ))}
        </div>

        {trybDnia === 'plan' && <DayPlanner data={data} day={day} locked={locked} />}


        {trybDnia === 'wykonanie' && canEdit && !locked && (
          <div className="bg-white rounded-xl shadow-sm border" style={{ borderColor: colors.primary.bg }}>
            <button onClick={() => setAddOpen((v) => !v)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold" style={{ color: colors.primary.darkest }}>
              <span className="flex items-center gap-2"><Plus size={16} style={{ color: colors.primary.medium }} />Dodaj zmianę — {dateLabel(day)}</span>
              {addOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {addOpen && (
              <div className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: '#eef2f7' }}>
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
                  <span className="text-xs" style={{ color: colors.primary.light }}>Zmiana trafia do grafiku i od razu do wykonania (Actual). {(() => { const k = (data.accounts || []).find((a) => [a.grafikName, ...(a.aliasy || []), a.name].filter(Boolean).some((n) => String(n).toUpperCase().trim() === addOsoba.trim().toUpperCase())); return addOsoba.trim() ? (k ? `Konto: ${k.name}` : '⚠ brak konta o tej nazwie — zmiana zapisze się bez przypisania') : ''; })()}</span>
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
          <button disabled={locked} onClick={simulate} className="ml-auto text-sm px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-40" style={{ backgroundColor: colors.primary.medium }}>Symuluj wbicia</button>
        </div>
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto border" style={{ borderColor: colors.primary.bg }}>
          <div className="min-w-[820px]">
            <div className="flex items-stretch" style={{ backgroundColor: '#f1f5f9', borderBottom: `1px solid ${colors.primary.bg}` }}>
              <div className="w-64 shrink-0 px-3 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: colors.primary.dark }}>Pracownik</div>
              <div className="relative flex-1 h-8"><WTGrid />{WT_TICKS.map((h) => <span key={h} className="absolute top-1 text-[10px] font-medium text-slate-400" style={{ left: `calc(${((h - 6) * 60 / 1440) * 100}% + 2px)` }}>{String(h % 24).padStart(2, '0')}</span>)}{rows.length > 0 && <div className="absolute bottom-1 h-2 rounded" style={{ left: `${openStartRel / 1440 * 100}%`, width: `${(openEndRel - openStartRel) / 1440 * 100}%`, backgroundColor: '#2E9E5B' }} title="Public Opening Hours" />}</div>
              <div className="w-24 shrink-0 px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-center" style={{ color: colors.primary.dark }}>Wykonanie</div>
            </div>
            <div className="flex items-center gap-4 px-3 py-1.5 text-[10px]" style={{ color: colors.primary.light, borderBottom: `1px solid ${colors.primary.bg}` }}>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: '#2E9E5B' }} />Public Opening Hours</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: colors.primary.bg }} />Plan (Shift)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: colors.primary.medium }} />Wykonanie (Actual)</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded" style={{ backgroundColor: '#E74C3C' }} />Przerwa niepłatna</span>
            </div>
            {rows.length === 0 ? <p className="text-center text-slate-400 py-8">Brak zmian w tym dniu.</p> : rows.map((s, i) => {
              const a = act(s); const dMin = actualNet(s) - wtDur(s.start, s.end); const tol = Math.abs(dMin) <= 5;
              return (
                <div key={i} className="flex items-stretch border-b last:border-0" style={{ borderColor: '#eef2f7' }}>
                  <div className="w-64 shrink-0 px-3 py-2">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5" style={{ color: colors.primary.darkest }}>{s.name}{s.dodana && <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#fff4e0', color: '#B26A00' }}>ręczna</span>}{s.dodana && !locked && <button title="Usuń zmianę" onClick={() => data.removeShiftManual({ date: s.date, name: s.name, start: s.start, end: s.end })} className="text-red-300 hover:text-red-500"><Trash2 size={13} /></button>}</p>
                    <div className="flex items-center justify-between mt-0.5"><span className="text-[11px]" style={{ color: stationColor(s.station) }}>{etykietaStacji(s)}</span><span className="text-[11px] font-medium" style={{ color: tol ? '#2E9E5B' : '#E74C3C' }}>{dMin >= 0 ? '+' : ''}{dMin}m</span></div>
                    <div className="flex gap-3 mt-1 text-[11px] text-slate-500"><span>Shift <b style={{ color: colors.primary.dark }}>{wtHours(wtDur(s.start, s.end))}</b></span><span>Actual <b style={{ color: colors.primary.dark }}>{wtHours(actualNet(s))}</b></span></div>
                  </div>
                  <div className="relative flex-1 py-2"><WTGrid />
                    <div className="relative h-3.5 mb-1 rounded" style={{ backgroundColor: '#f8fafc' }}><WTBar start={s.start} end={s.end} color={colors.primary.bg} /><div className="absolute inset-0 flex items-center pl-1 text-[9px] font-medium" style={{ color: colors.primary.dark }}>Shift {s.start}–{s.end}</div></div>
                    <div className="relative h-3.5 rounded" style={{ backgroundColor: '#f8fafc' }}><WTBar start={a.start} end={a.end} color={colors.primary.medium} breaks={a.breaks} /><div className="absolute inset-0 flex items-center pl-1 text-[9px] font-medium text-white/90">Actual {a.start}–{a.end}</div></div>
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
        <p className="text-xs text-slate-400">Górny pasek = plan (Shift), dolny = wykonanie (Actual); czerwony segment = przerwa niepłatna. Korekty nanoś po zakończeniu zmiany pracownika. Tolerancja 5 min (micros ↔ girnet).</p>
        </>)}
        </>)}
      </div>

      <div className="px-5 py-1.5 flex flex-wrap items-center gap-x-6 gap-y-1 border-t bg-white shrink-0" style={{ borderColor: colors.primary.bg }}>
          {[
            { l: 'Koszt (szac.)', v: `${f0(kpiTyg.koszt)} zł`, k: '#12655B' },
            { l: 'Koszt / sprzedaż', v: kpiTyg.sprzedaz ? `${(kpiTyg.koszt / kpiTyg.sprzedaz * 100).toFixed(2).replace('.', ',')}%` : '—', k: kpiTyg.sprzedaz && kpiTyg.koszt / kpiTyg.sprzedaz > 0.2 ? '#B7362A' : '#12655B' },
            { l: 'Godziny', v: `${kpiTyg.h.toFixed(1).replace('.', ',')} h`, k: colors.primary.medium },
            { l: 'Nadmiar (h)', v: kpiTyg.exceso.toFixed(1).replace('.', ','), k: '#2F6FB5' },
            { l: 'Niedobór (h)', v: kpiTyg.defecto.toFixed(1).replace('.', ','), k: '#B7362A' },
            { l: 'Sprzedaż / rbh', v: kpiTyg.sprzedaz && kpiTyg.h ? f0(kpiTyg.sprzedaz / kpiTyg.h) : '—', k: '#D08700' },
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
      if (rsl.success) setSalesData({ sales: rsl.sales || {}, checks: rsl.checks || {}, params: rsl.params || null });
      const rtpl = await api('/templates');
      if (rtpl.success) setTemplates(rtpl.templates || []);
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
  const tsSetWeek = useCallback((ws, statusObj) => { const cur = tsRef.current; persistTs({ ...cur, weekStatus: { ...cur.weekStatus, [ws]: statusObj } }); }, [persistTs]);

  // Dodanie osoby do grafiku z poziomu planowania — od razu tworzy też wpis wykonania (Actual)
  const addShiftManual = useCallback(async (payload) => {
    const r = await api('/schedule?action=add', 'POST', payload);
    if (!r.success) { show(r.error || 'Nie udało się dodać zmiany', 'error'); return false; }
    const sh = r.shift;
    await tsPutActual(wtKey(sh), { start: sh.start, end: sh.end, breaks: [] });
    await sync();
    show(`Dodano: ${sh.name} ${sh.start}–${sh.end} (grafik + wykonanie)`);
    return true;
  }, [sync, tsPutActual]);

  const updateShiftManual = useCallback(async (ident, nowe) => {
    const r = await api('/schedule?action=update', 'POST', { ...ident, nowe });
    if (!r.success) { show(r.error || 'Nie udało się zapisać zmiany', 'error'); return false; }
    await sync();
    show(`Zapisano: ${r.shift.name} ${r.shift.start}–${r.shift.end}`);
    return true;
  }, [sync]);

  const removeShiftManual = useCallback(async (payload) => {
    const r = await api('/schedule?action=remove', 'POST', payload);
    if (!r.success) { show(r.error || 'Nie udało się usunąć', 'error'); return false; }
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
    const mapAct = {};
    (r.dodane || []).forEach((sh) => { mapAct[wtKey(sh)] = { start: sh.start, end: sh.end, breaks: [] }; });
    await tsPutActualsBulk(mapAct);
    await sync();
    show(`Zastosowano szablon: ${r.dodane.length} zmian (grafik + wykonanie)`);
    return true;
  }, [sync, tsPutActualsBulk]);
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

  return { shifts, roster, meta, months, planowanie, swaps, ts, accounts, budget, salesData, loading, toast, setToast, show, sync, importSchedule, deleteMonth, clearSchedule, setPlanTotal, applyGodziny, clearGodziny, refreshSwaps, approveSwap, rejectSwap, tsPutActual, tsPutActualsBulk, tsToggleCompleted, tsSetWeek, addShiftManual, updateShiftManual, removeShiftManual, addAccount, updateAccount, resetAccountPassword, deleteAccount, saveBudget, saveSales, clearSales, przypiszZmiany, lastSync, templates, saveTemplate, templateDetail, applyTemplate, deleteTemplate };
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
  const logout = () => { store.del('admin_session'); setAuthed(false); setRole('kierownik'); setUserName(''); setPage('dashboard'); };
  const onLogin = (r, un) => { setRole(r); setUserName(un || ''); setAuthed(true); setPage('dashboard'); };

  if (!authed) return <Login onLogin={onLogin} />;

  const pages = {
    dashboard: <Dashboard data={data} setPage={setPage} userName={userName} />,
    import: <ImportPage data={data} />,
    wt: <WorkingTime data={data} canEdit={role === 'asm'} wrTab={wrTab} setWrTab={setWrTab} wrNonce={wrNonce} />,
    print: <PrintPage data={data} />,
    forecast: <PlanFinanse data={data} setPage={setPage} />,
    plan: <PlanFinanse data={data} setPage={setPage} />,
    emps: <AdminEmployees data={data} />,
    swaps: <AdminSwaps data={data} />,
    settings: <SettingsPage data={data} />
  };
  // Kierownik zmiany: strona domowa, grafik i wydruk. ASM: wszystko.
  const dozwolone = role === 'asm' ? Object.keys(pages) : ['dashboard', 'wt', 'print'];
  const widok = dozwolone.includes(page) ? page : 'dashboard';
  const pendingSwaps = data.swaps.filter(s => s.status === 'open' && s.volunteers.length > 0).length;

  return (
    <div className="flex h-screen" style={{ backgroundColor: colors.primary.bgLight }}>
      <Sidebar page={widok} setPage={setPage} logout={logout} role={role} pendingSwaps={pendingSwaps} wrTab={wrTab} setWrTab={setWrTab} bumpWr={() => setWrNonce((n) => n + 1)} userName={userName} />
      <div className="flex-1 flex flex-col overflow-hidden"><div className={widok === 'wt' ? "flex-1 min-h-0 flex flex-col overflow-hidden" : "flex-1 overflow-y-auto"}>{pages[widok] || pages.print}</div></div>
      {data.toast && <Toast message={data.toast.message} type={data.toast.type} onClose={() => data.setToast(null)} />}
    </div>
  );
}
