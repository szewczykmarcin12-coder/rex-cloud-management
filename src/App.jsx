import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Cloud, Lock, Upload, Printer, Calendar, Users, LayoutGrid, RefreshCw, LogOut, Check, X, AlertCircle, FileSpreadsheet, Trash2, ChevronLeft, ChevronRight, Home, Settings, Download, Clock } from 'lucide-react';
import { parseGrafik } from './parseGrafik.js';
import { parseExportCSV } from './parseExport.js';
import { generateDayPDF, generateRangePDF } from './generatePDF.js';

const API_BASE = 'https://rex-cloud-backend.vercel.app/api';
// ^ Zmień na URL swojego backendu po wdrożeniu

const colors = {
  primary: { darkest: '#082567', dark: '#213b76', medium: '#395185', light: '#526695', bg: '#e8edf5', bgLight: '#f1f4f9' },
  accent: { dark: '#FDA785', medium: '#FFBF99', light: '#FBCEB1', bg: '#FFF5EE' }
};

const stationColors = {
  'PANIEROWANIE': '#7CB342', 'SMAŻENIE': '#E74C3C', 'KANAPKI / WRAPY': '#00A3E0',
  'KONTROLER': '#1E3A8A', 'WSPARCIE WIECZORNE / FLEX': '#9C27B0', 'DISPATCHER': '#FF7043',
  'PHU': '#00897B', 'DESERY / NAPOJE': '#EC407A', 'FRYTKI': '#FBC02D', 'ZMYWAK': '#64748B',
  'PREP': '#8D6E63', 'DOSTAWA': '#5C6BC0', 'MANAGER': '#082567', 'MGR FUNKCYJNE': '#455A64',
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
const ymd = (d) => (typeof d === 'string' ? d : d.toISOString().split('T')[0]);

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

const Header = ({ title, subtitle, children }) => (<div className="bg-white/90 backdrop-blur-xl border-b px-8 py-5 flex items-center justify-between sticky top-0 z-10" style={{ borderColor: colors.primary.bg }}><div><h1 className="text-2xl font-bold" style={{ color: colors.primary.darkest }}>{title}</h1>{subtitle && <p className="text-sm mt-0.5" style={{ color: colors.primary.light }}>{subtitle}</p>}</div><div className="flex items-center gap-3">{children}</div></div>);

// ===================== LOGIN =====================

const Login = ({ onLogin }) => {
  const [tryb, setTryb] = useState('pin'); // 'pin' | 'asm'
  const [pin, setPin] = useState('');
  const [login, setLogin] = useState('');
  const [haslo, setHaslo] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const body = tryb === 'asm' ? { login, password: haslo } : { pin };
      const r = await api('/admin-auth', 'POST', body);
      if (r.success) { store.set('admin_session', { at: Date.now(), role: r.role }); onLogin(r.role); }
      else setErr(r.error || 'Błąd logowania');
    } catch { setErr('Błąd połączenia z serwerem'); }
    setLoading(false);
  };
  const zakl = (id, txt) => (
    <button type="button" onClick={() => { setTryb(id); setErr(''); }} className="flex-1 py-2 rounded-lg text-sm font-medium transition-all" style={{ backgroundColor: tryb === id ? colors.primary.medium : 'transparent', color: tryb === id ? 'white' : colors.primary.light }}>{txt}</button>
  );
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: `linear-gradient(to bottom, #051845, ${colors.primary.darkest})` }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-12"><div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.primary.medium }}><Cloud className="w-8 h-8 text-white" /></div><div><span className="text-white text-3xl font-light">REX</span><span className="text-3xl font-light ml-2" style={{ color: colors.primary.bg }}>Cloud</span></div></div>
        <div className="bg-white rounded-2xl p-8">
          <div className="flex items-center justify-center gap-2 mb-2"><Lock className="w-5 h-5" style={{ color: colors.primary.medium }} /><h2 className="text-2xl font-semibold" style={{ color: colors.primary.darkest }}>Panel Administratora</h2></div>
          <p className="text-center text-sm mb-5" style={{ color: colors.primary.light }}>{tryb === 'asm' ? 'ASM — pełny dostęp' : 'Kierownik zmiany — wydruk grafiku'}</p>
          <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ backgroundColor: colors.primary.bgLight }}>{zakl('pin', 'Kierownik (PIN)')}{zakl('asm', 'ASM')}</div>
          {err && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{err}</div>}
          <form onSubmit={submit} className="space-y-4">
            {tryb === 'pin' ? (
              <div><label className="block text-sm mb-1" style={{ color: colors.primary.light }}>PIN kierownika</label><input type="password" value={pin} onChange={e => setPin(e.target.value)} className="w-full px-4 py-3 rounded-xl border focus:outline-none text-center text-2xl tracking-widest" style={{ borderColor: colors.primary.bg }} placeholder="••••••" maxLength={6} inputMode="numeric" disabled={loading} autoFocus /></div>
            ) : (
              <>
                <div><label className="block text-sm mb-1" style={{ color: colors.primary.light }}>Login ASM</label><input type="text" value={login} onChange={e => setLogin(e.target.value)} className="w-full px-4 py-3 rounded-xl border focus:outline-none" style={{ borderColor: colors.primary.bg }} placeholder="login" disabled={loading} autoFocus /></div>
                <div><label className="block text-sm mb-1" style={{ color: colors.primary.light }}>Hasło ASM</label><input type="password" value={haslo} onChange={e => setHaslo(e.target.value)} className="w-full px-4 py-3 rounded-xl border focus:outline-none" style={{ borderColor: colors.primary.bg }} placeholder="hasło" disabled={loading} /></div>
              </>
            )}
            <button type="submit" disabled={loading} className="w-full text-white font-semibold py-3 rounded-xl" style={{ backgroundColor: loading ? colors.primary.light : colors.primary.medium }}>{loading ? 'Sprawdzam...' : 'Zaloguj się'}</button>
          </form>
        </div>
      </div>
    </div>
  );

};

// ===================== SIDEBAR =====================

const Sidebar = ({ page, setPage, logout, role, pendingSwaps = 0 }) => {
  const pelne = [
    { id: 'dashboard', label: 'Strona domowa', icon: Home },
    { id: 'import', label: 'Import z Excel', icon: Upload },
    { id: 'wt', label: 'Grafik', icon: LayoutGrid },
    { id: 'print', label: 'Drukuj grafik', icon: Printer },
    { id: 'plan', label: 'Plan budżetu', icon: FileSpreadsheet },
    { id: 'forecast', label: 'Optymalizacja', icon: Clock },
    { id: 'emps', label: 'Pracownicy', icon: Users },
    { id: 'swaps', label: 'Zamiany', icon: RefreshCw, badge: pendingSwaps },
    { id: 'settings', label: 'Ustawienia', icon: Settings }
  ];
  const menu = role === 'asm' ? pelne : pelne.filter(m => ['dashboard', 'wt', 'print'].includes(m.id));
  return (
    <div className="w-72 h-screen flex flex-col" style={{ background: `linear-gradient(180deg, ${colors.primary.darkest} 0%, ${colors.primary.dark} 100%)` }}>
      <div className="p-6 border-b border-white/10"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.primary.medium }}><Cloud className="w-6 h-6 text-white" /></div><div><span className="text-white text-xl font-light">REX</span><span className="text-xl font-light ml-1" style={{ color: colors.primary.bg }}>Cloud</span><p className="text-xs text-white/50">{role === 'asm' ? 'ASM · pełny dostęp' : 'Kierownik zmiany · wydruk'}</p></div></div></div>
      <nav className="flex-1 p-3 space-y-1">{menu.map(m => (<button key={m.id} onClick={() => setPage(m.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${page === m.id ? 'bg-white/15 text-white shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}><m.icon className="w-5 h-5" /><span className="font-medium">{m.label}</span>{m.badge > 0 && <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#E74C3C' }}>{m.badge}</span>}</button>))}</nav>
      <div className="p-4 border-t border-white/10"><button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-400 hover:bg-white/5 transition-all"><LogOut className="w-5 h-5" /><span className="font-medium">Wyloguj się</span></button></div>
    </div>
  );
};

// ===================== DASHBOARD =====================

const Dashboard = ({ data, setPage }) => {
  // Instruktor (osoba szkoląca) liczony do CREW; uczeń do szkoleniowych. Obie osoby liczone.
  const gCrew = data.shifts.filter(s => !jestMgr(s.station) && !jestSzkolenie(s)).reduce((a, s) => a + godzZ(s), 0);
  const gSzk = data.shifts.filter(s => jestUczen(s) || jestSzkStacja(s)).reduce((a, s) => a + godzZ(s), 0);
  const gMgrSched = data.shifts.filter(s => jestMgr(s.station)).reduce((a, s) => a + godzZ(s), 0);
  const gManual = sumaManualWszystkie(data.planowanie); // ręczne godziny MGR + funkcyjne (wszystkie miesiące)
  const gMgr = gMgrSched + gManual;
  const stats = [
    { label: 'Zmiany (wszystkie miesiące)', val: data.shifts.length, icon: Calendar, color: colors.primary.medium },
    { label: 'Pracownicy', val: data.roster.length, icon: Users, color: '#9C27B0' },
    { label: 'Załadowane miesiące', val: (data.months || []).length, icon: LayoutGrid, color: colors.accent.dark }
  ];
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Strona domowa" subtitle="Przegląd systemu REX Cloud" />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="grid grid-cols-3 gap-6">{stats.map((s, i) => <StatCard key={i} label={s.label} value={s.val} icon={s.icon} color={s.color} />)}</div>

        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: '4px solid #26A69A' }}>
          <div className="flex items-center gap-2 mb-4"><Clock className="w-5 h-5" style={{ color: '#26A69A' }} /><h3 className="text-lg font-semibold" style={{ color: colors.primary.darkest }}>Wyliczone godziny (wszystkie miesiące)</h3></div>
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
  const [weekStart, setWeekStart] = useState(() => { const d = data.meta.firstDate ? new Date(data.meta.firstDate) : new Date(today); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().split('T')[0]; });

  const weekDates = useMemo(() => { const arr = []; const start = new Date(weekStart); for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); arr.push(d.toISOString().split('T')[0]); } return arr; }, [weekStart]);
  const changeWeek = (dir) => { const d = new Date(weekStart); d.setDate(d.getDate() + dir * 7); setWeekStart(d.toISOString().split('T')[0]); };
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
              const isToday = ds === today.toISOString().split('T')[0];
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
  const [singleDate, setSingleDate] = useState(data.meta.firstDate || new Date().toISOString().split('T')[0]);
  const [rangeStart, setRangeStart] = useState(data.meta.firstDate || new Date().toISOString().split('T')[0]);
  const [rangeEnd, setRangeEnd] = useState(data.meta.firstDate || new Date().toISOString().split('T')[0]);
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

        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl" style={{ borderLeft: `4px solid #082567` }}>
          <h3 className="text-lg font-bold mb-1" style={{ color: colors.primary.darkest }}>Login i hasło ASM</h3>
          <p className="text-sm mb-4" style={{ color: colors.primary.light }}>Pełny dostęp (układanie i import grafiku, plan godzin). Zmienić może wyłącznie ASM, podając obecne hasło.</p>
          <div className="space-y-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Login ASM</label><input type="text" value={asmLogin} onChange={e => setAsmLogin(e.target.value)} placeholder="login" className={inp} style={{ borderColor: colors.primary.bg }} /></div>
            <input type="password" value={asmNew} onChange={e => setAsmNew(e.target.value)} placeholder="Nowe hasło ASM (min. 6 znaków, puste = bez zmiany)" className={inp} style={{ borderColor: colors.primary.bg }} />
            <input type="password" value={asmNew2} onChange={e => setAsmNew2(e.target.value)} placeholder="Powtórz nowe hasło" className={inp} style={{ borderColor: colors.primary.bg }} />
            <input type="password" value={asmCur} onChange={e => setAsmCur(e.target.value)} placeholder="Obecne hasło ASM (wymagane)" className={inp} style={{ borderColor: '#082567' }} />
            <Btn onClick={changeAsm}>Zapisz poświadczenia ASM</Btn>
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

const ForecastPlan = ({ data }) => {
  const [tab, setTab] = useState("miesiac");
  const hydrated = useRef(false);
  const [mIdx, setMIdx] = useState(6);
  const [yrSel, setYrSel] = useState(null);
  const [splh, setSplh] = useState(420);
  const [podloga, setPodloga] = useState(3);
  const [tryb, setTryb] = useState("silnik");
  const [wl, setWl] = useState(() => Object.fromEntries(SZAB.map((t) => [t.n, true])));
  const [dzien, setDzien] = useState(12);
  const [realSales, setRealSales] = useState({});
  const [realChecks, setRealChecks] = useState({});
  const [importInfo, setImportInfo] = useState(null);
  const [limitMies, setLimitMies] = useState(4700);
  const [mgrDoba, setMgrDoba] = useState(32);
  const [szkol, setSzkol] = useState(162);
  const fileRef = useRef(null);

  useEffect(() => {
    if (hydrated.current || !data.salesData) return;
    const sd = data.salesData;
    if (sd.sales && Object.keys(sd.sales).length) {
      setRealSales(sd.sales); setRealChecks(sd.checks || {});
      const ks = Object.keys(sd.sales).sort(); const last = new Date(ks[ks.length - 1]);
      setMIdx(last.getMonth()); setYrSel(last.getFullYear());
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
      setMIdx(last.getMonth()); setYrSel(last.getFullYear());
      setImportInfo({ n: keys.length, from: secFrom, to: secTo, checks: Object.keys(checks).length });
      data.saveSales({ sales, checks });
      data.show(`Zaimportowano ${keys.length} dni sprzedaży${Object.keys(checks).length ? " + paragony" : ""}`);
    } catch (e) { data.show("Błąd importu: " + e.message, "error"); }
  };

  const yrShifts = useMemo(() => { const ys = data.shifts.map((s) => +s.date.slice(0, 4)).filter(Boolean); return ys.length ? Math.max(...ys) : new Date().getFullYear(); }, [data.shifts]);
  const year = yrSel || yrShifts;
  const wdAvg = useMemo(() => { const acc = Array.from({ length: 7 }, () => ({ s: 0, n: 0 })); Object.entries(realSales).forEach(([ds, v]) => { const dw = new Date(ds).getDay(); acc[dw].s += v; acc[dw].n++; }); return acc.map((a) => (a.n ? a.s / a.n : null)); }, [realSales]);
  const hasReal = wdAvg.some((x) => x != null);

  const R = useMemo(() => {
    const dim = new Date(year, mIdx + 1, 0).getDate();
    const dni = Array.from({ length: dim }, (_, k) => {
      const d = k + 1, ds = ymd(new Date(year, mIdx, d));
      const js = new Date(ds).getDay(), dow = (js + 6) % 7; // 0=Pon
      const sprzedaz = realSales[ds] != null ? realSales[ds] : (wdAvg[js] != null ? wdAvg[js] : 35000);
      const checks = realChecks[ds] || 0;
      const akt = data.shifts.filter((s) => s.date === ds && !jestInstruktor(s)).reduce((a, s) => a + godzZ(s), 0);
      const dem = optZapotrzebowanie(sprzedaz, splh, podloga, tryb, dow);
      const kc = optZapotrzebowanie(sprzedaz, splh, podloga, "krzywa", dow);
      const { out, cover } = optKsztaltuj(dem, wl);
      const he = out.reduce((a, c) => a + c.len, 0) / 2;
      return { d, ds, dow, sprzedaz, checks, akt, dem, kc, cover, shifts: out, he,
        splhA: akt ? sprzedaz / akt : 0, splhE: he ? sprzedaz / he : 0,
        mptA: checks ? (akt * 60) / checks : 0, mptE: checks ? (he * 60) / checks : 0 };
    });
    const sumS = dni.reduce((a, x) => a + x.sprzedaz, 0), sumA = dni.reduce((a, x) => a + x.akt, 0);
    const sumE = dni.reduce((a, x) => a + x.he, 0), sumC = dni.reduce((a, x) => a + x.checks, 0);
    const byDow = [...Array(7)].map((_, i) => { const g = dni.filter((x) => x.dow === i); return { dow: i, n: g.length, s: g.length ? g.reduce((a, x) => a + x.sprzedaz, 0) / g.length : 0, a: g.length ? g.reduce((a, x) => a + x.akt, 0) / g.length : 0, e: g.length ? g.reduce((a, x) => a + x.he, 0) / g.length : 0 }; });
    return { dni, dim, sumS, sumA, sumE, sumC, byDow, splhA: sumA ? sumS / sumA : 0, splhE: sumE ? sumS / sumE : 0, mgr: mgrDoba * dim };
  }, [year, mIdx, realSales, realChecks, wdAvg, splh, podloga, tryb, wl, data.shifts, mgrDoba]);

  const D = R.dni[Math.min(dzien, R.dim) - 1] || R.dni[0];
  const roz = R.sumE - R.sumA;
  const przesun = R.dni.reduce((a, x) => a + Math.abs(x.he - x.akt), 0);
  const razem = R.sumE + R.mgr + szkol;

  const TABS = [["miesiac", "Miesiąc"], ["dzien", "Dzień"], ["zaloga", "Załoga"], ["dane", "Dane"], ["param", "Parametry"]];

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <OptKpi label="Godziny crew — grafik" value={f0(R.sumA) + " h"} sub={`SPLH ${f0(R.splhA)} zł/rbh`} />
          <OptKpi label="Godziny crew — silnik" value={f0(R.sumE) + " h"} sub={`SPLH ${f0(R.splhE)} zł/rbh`} tone={roz < 0 ? OC.ok : OC.warn} />
          <OptKpi label="Różnica" value={`${roz >= 0 ? "+" : "−"}${f0(Math.abs(roz))} h`} tone={roz < 0 ? OC.ok : OC.warn} sub={`${R.sumA ? (roz / R.sumA * 100).toFixed(1).replace(".", ",") : 0}% · przesunięcie ${f0(przesun)} h`} />
          <OptKpi label="Limit miesiąca" value={`${f0(limitMies)} h`} sub={`crew ${f0(R.sumE)} + mgr ${f0(R.mgr)} + szkol. ${szkol} = ${f0(razem)}`} tone={razem > limitMies ? OC.bad : OC.ok} />
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

        {tab === "zaloga" && (
          <Sekcja kolor="#082567" tytul="Załoga — godziny z grafiku w miesiącu">
            {(() => { const map = {}; data.shifts.filter((s) => (s.date || "").slice(0, 7) === `${year}-${String(mIdx + 1).padStart(2, "0")}` && !jestInstruktor(s)).forEach((s) => { map[s.name] = (map[s.name] || 0) + godzZ(s); });
              const arr = Object.entries(map).sort((a, b) => b[1] - a[1]); const max = Math.max(1, ...arr.map((x) => x[1]));
              return arr.length === 0 ? <p className="text-slate-400 text-sm">Brak grafiku w tym miesiącu.</p> : (
                <div className="space-y-1.5">{arr.map(([n, h]) => (
                  <div key={n}><div className="flex justify-between text-xs mb-0.5"><span style={{ color: colors.primary.dark }}>{n}</span><b style={{ color: colors.primary.darkest }}>{fH1(h)}</b></div>
                    <div className="h-2.5 rounded" style={{ backgroundColor: colors.primary.bgLight }}><div className="h-2.5 rounded" style={{ width: `${h / max * 100}%`, backgroundColor: h > 200 ? OC.warn : colors.primary.medium }} /></div></div>))}
                  <p className="text-xs text-slate-400 mt-2">Suma: {fH1(arr.reduce((a, x) => a + x[1], 0))} · osób: {arr.length}</p>
                </div>); })()}
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



// ===================== PLAN BUDŻETU (kalkulator COL) =====================
const BP_POZ = ['RGM', 'ASM', 'SM', 'JSM', 'CREW'];
const BP_NORMY = [160, 160, 176, 168, 160, 168, 184, 160, 176, 176, 160, 160];
const bpMgr = (p) => p !== 'CREW';
const bpKat = (e) => (e.pozycja === 'RGM' || e.pozycja === 'ASM') ? 'kier' : (e.pozycja === 'SM' || e.pozycja === 'JSM') ? 'mgr' : (e.instruktor ? 'instr' : 'prac');
const BP_KAT = { prac: { label: 'Pracownicy', color: '#3A6EA5' }, instr: { label: 'Instruktorzy', color: '#F5B000' }, mgr: { label: 'Mgr (SM/JSM)', color: '#7A5FB0' }, kier: { label: 'Kierownictwo (RGM/ASM)', color: '#082567' } };
const zl = (n) => (Math.round((n || 0) * 100) / 100).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bpDefSettings = { zusRate: 0.1948, zusPPK: 0.2098, nocnyBonus: 0.2, minWage: 4806, normy: [...BP_NORMY] };
const bpSeed = [
  { id: 'e1', name: 'Piotr Reszka', pozycja: 'RGM', umowa: 'UOP', stawka: 9000, godziny: 160, premia: 0, bhp: 180, urlopH: 40, dniZLA: 0, nocneH: 50, ppk: true, pfron: 150.79, zusUZ: false, instruktor: false },
  { id: 'e2', name: 'Anna Piekarska', pozycja: 'CREW', umowa: 'UOP', stawka: 5100, godziny: 160, premia: 300, bhp: 320, urlopH: 0, dniZLA: 0, nocneH: 20, ppk: false, pfron: 150.79, zusUZ: false, instruktor: true },
  { id: 'e3', name: 'Marcin Szewczyk', pozycja: 'ASM', umowa: 'UZ', stawka: 38, godziny: 160, premia: 1125, bhp: 0, urlopH: 0, dniZLA: 0, nocneH: 0, ppk: false, pfron: 0, zusUZ: false, instruktor: false },
  { id: 'e4', name: 'Kacper Zieliński', pozycja: 'CREW', umowa: 'UZ', stawka: 30.5, godziny: 130, premia: 0, bhp: 0, urlopH: 0, dniZLA: 0, nocneH: 0, ppk: false, pfron: 0, zusUZ: true, instruktor: false },
];
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

const BudgetPlan = ({ data }) => {
  const b = data.budget;
  const [tab, setTab] = useState('budzet');
  const [emps, setEmps] = useState(bpSeed);
  const [settings, setSettings] = useState(bpDefSettings);
  const [mIdx, setMIdx] = useState(new Date().getMonth());
  const [sprzedaz, setSprzedaz] = useState({});
  const [transakcje, setTransakcje] = useState({});
  const [dniS, setDniS] = useState({});
  const [openRow, setOpenRow] = useState(null);
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !b) return;
    if (b.employees && b.employees.length) { setEmps(b.employees); if (b.settings) setSettings(b.settings); setSprzedaz(b.sprzedaz || {}); setTransakcje(b.transakcje || {}); setDniS(b.dniS || {}); }
    hydrated.current = true;
  }, [b]);
  useEffect(() => { if (!hydrated.current) return; data.saveBudget({ employees: emps, settings, sprzedaz, transakcje, dniS }); }, [emps, settings, sprzedaz, transakcje, dniS]);

  const nom = settings.normy[mIdx] || 160;
  const getGodz = (e) => (e.godzBy && e.godzBy[mIdx] != null) ? e.godzBy[mIdx] : e.godziny;
  const koszty = emps.map((e) => ({ e, k: bpKoszt({ ...e, godziny: getGodz(e) }, nom, settings) }));
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const col = sum(koszty, (x) => x.k.total);
  const godzTotal = sum(koszty, (x) => x.k.worked);
  const sale = sprzedaz[mIdx] || 0, tr = transakcje[mIdx] || 0, dni = dniS[mIdx] || 0;
  const colPct = sale ? col / sale : 0;
  const agc = tr ? sale / tr : 0, splh = godzTotal ? sale / godzTotal : 0, mpt = tr ? godzTotal * 60 / tr : 0;
  const linia = (f) => sum(koszty, (x) => f(x.k));
  const kats = ['prac', 'instr', 'mgr', 'kier'].map((key) => { const g = koszty.filter((x) => bpKat(x.e) === key); return { key, label: BP_KAT[key].label, color: BP_KAT[key].color, value: sum(g, (x) => x.k.total), n: g.length }; });

  const setE = (id, patch) => setEmps((arr) => arr.map((e) => e.id === id ? { ...e, ...patch } : e));
  const setGodz = (e, v) => setE(e.id, { godzBy: { ...(e.godzBy || {}), [mIdx]: Number(v) || 0 } });
  const addE = () => { const id = 'e' + Date.now(); setEmps((arr) => [...arr, { id, name: 'Nowy pracownik', pozycja: 'CREW', umowa: 'UZ', stawka: 30, godziny: 160, premia: 0, bhp: 0, urlopH: 0, dniZLA: 0, nocneH: 0, ppk: false, pfron: 0, zusUZ: false, instruktor: false }]); setOpenRow(id); };
  const delE = (id) => setEmps((arr) => arr.filter((e) => e.id !== id));
  const setNorma = (i, v) => setSettings((s) => { const n = [...s.normy]; n[i] = Number(v) || 0; return { ...s, normy: n }; });

  const year = useMemo(() => { const ys = data.shifts.map((s) => +s.date.slice(0, 4)).filter(Boolean); return ys.length ? Math.max(...ys) : new Date().getFullYear(); }, [data.shifts]);
  const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
  const planDaily = Array.from({ length: daysInMonth }, (_, i) => { const ds = `${year}-${String(mIdx + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`; return data.shifts.filter((s) => s.date === ds && !jestInstruktor(s)).reduce((a, s) => a + godzZ(s), 0); });
  const actualDaily = planDaily.map((h, i) => { if (!h) return 0; const d = ((i * 37 + 13) % 11) - 5; return Math.max(0, +(h * (1 + d / 100)).toFixed(1)); });
  const avgHourly = godzTotal ? col / godzTotal : 0;
  const colDaily = planDaily.map((h) => +(h * avgHourly).toFixed(0));
  const dayLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));

  const Stat = ({ v, l, sub, dark }) => (<div className="rounded-xl p-3 text-center shadow-sm border" style={{ backgroundColor: dark ? colors.primary.darkest : 'white', borderColor: colors.primary.bg }}><p className="text-xl font-bold" style={{ color: dark ? 'white' : colors.primary.darkest }}>{v}</p><p className="text-[11px]" style={{ color: dark ? 'rgba(255,255,255,.7)' : colors.primary.light }}>{l}</p>{sub && <p className="text-[10px]" style={{ color: dark ? 'rgba(255,255,255,.5)' : '#94a3b8' }}>{sub}</p>}</div>);
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
            <div className="rounded-xl p-4 text-center shadow-sm md:col-span-2" style={{ backgroundColor: colors.primary.darkest }}><p className="text-3xl font-bold text-white">{zl(col)} zł</p><p className="text-xs text-white/70">COL — koszt pracy (total)</p></div>
            <div className="rounded-xl p-4 text-center shadow-sm" style={{ backgroundColor: colPct > 0.2 ? '#E74C3C' : '#2E9E5B' }}><p className="text-3xl font-bold text-white">{(colPct * 100).toFixed(2)}%</p><p className="text-xs text-white/80">COL % (koszt / sprzedaż)</p></div>
            <Stat v={`${godzTotal.toFixed(0)} h`} l="Godziny total" sub={`${dni ? (godzTotal / dni).toFixed(1) : 0} h/dzień`} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat v={zl(agc)} l="AGC" sub="sprzedaż / transakcje" />
            <Stat v={zl(splh)} l="SPLH" sub="sprzedaż / godziny" />
            <Stat v={mpt.toFixed(2)} l="MPT (min)" sub="godziny×60 / transakcje" />
            <Stat v={`${nom} h`} l="Etat (norma m-ca)" />
          </div>
          <Sekcja kolor="#082567" tytul="COL wg kategorii"><BPBars items={kats.map((k) => ({ label: k.label, value: k.value, n: k.n, color: k.color }))} /></Sekcja>
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
                  <div className="flex-1 min-w-0"><input value={e.name} onChange={(ev) => setE(e.id, { name: ev.target.value })} className="font-semibold text-sm w-full bg-transparent focus:outline-none" style={{ color: colors.primary.darkest }} /><p className="text-[11px]" style={{ color: colors.primary.light }}>{e.pozycja} · {e.umowa} · {getGodz(e)} h{e.instruktor ? ' · instruktor' : ''}</p></div>
                  <div className="text-right shrink-0"><p className="text-[10px]" style={{ color: colors.primary.light }}>Koszt {months[mIdx]}</p><p className="font-bold" style={{ color: colors.primary.darkest }}>{zl(k.total)} zł</p></div>
                  <button onClick={() => setOpenRow(open ? null : e.id)} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1 shrink-0" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Szczegóły <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} /></button>
                  <button onClick={() => delE(e.id)} className="text-red-400 shrink-0"><Trash2 size={15} /></button>
                </div>
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t" style={{ borderColor: colors.primary.bg, backgroundColor: '#fbfcfe' }}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                      <Fld label="Stanowisko"><select value={e.pozycja} onChange={(ev) => setE(e.id, { pozycja: ev.target.value })} className="w-full px-2 py-1 rounded border text-sm" style={{ borderColor: colors.primary.bg }}>{BP_POZ.map((p) => <option key={p}>{p}</option>)}</select></Fld>
                      <Fld label="Typ umowy"><select value={e.umowa} onChange={(ev) => setE(e.id, { umowa: ev.target.value })} className="w-full px-2 py-1 rounded border text-sm" style={{ borderColor: colors.primary.bg }}><option>UOP</option><option>UZ</option></select></Fld>
                      <Fld label={e.umowa === 'UOP' ? 'Wynagr. mies. (zł)' : 'Stawka (zł/h)'}>{numIn(e.stawka, (v) => setE(e.id, { stawka: Number(v) || 0 }))}</Fld>
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
                      {e.umowa === 'UZ' && <label className="flex items-center gap-2 text-sm" style={{ color: colors.primary.dark }}><input type="checkbox" checked={e.zusUZ} onChange={(ev) => setE(e.id, { zusUZ: ev.target.checked })} />ZUS od zlecenia (19,48%)</label>}
                      {e.pozycja === 'CREW' && <label className="flex items-center gap-2 text-sm" style={{ color: colors.primary.dark }}><input type="checkbox" checked={e.instruktor} onChange={(ev) => setE(e.id, { instruktor: ev.target.checked })} />Instruktor</label>}
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
          <Btn variant="secondary" onClick={addE}>+ Dodaj pozycję</Btn>
        </>)}

        {tab === 'analiza' && (<>
          <p className="text-sm" style={{ color: colors.primary.light }}>Analityka dla: <b style={{ color: colors.primary.dark }}>{months[mIdx]} {year}</b> — dane dzienne z grafiku.</p>
          <Sekcja kolor={colors.primary.medium} tytul="Grafik: godziny plan vs wykonanie (dni miesiąca)"><BPLine labels={dayLabels} unit="h" series={[{ name: 'Plan', color: colors.primary.bg, data: planDaily, fill: true }, { name: 'Wykonanie', color: colors.primary.medium, data: actualDaily }]} /></Sekcja>
          <Sekcja kolor="#082567" tytul="Cost of Labour — dzienny koszt pracy (plan)"><BPLine labels={dayLabels} unit="" series={[{ name: 'Koszt dzienny (zł)', color: '#082567', data: colDaily, fill: true }]} /><p className="text-xs text-slate-400 mt-2">Szacunek: godziny planowane danego dnia × średni koszt godziny ({zl(avgHourly)} zł/h).</p></Sekcja>
          <Sekcja kolor="#455A64" tytul="Cost of Labour — udział kategorii"><BPBars items={kats.map((k) => ({ label: k.label, value: k.value, n: k.n, color: k.color }))} /></Sekcja>
        </>)}

        {tab === 'ust' && (
          <div className="grid md:grid-cols-2 gap-4">
            <Sekcja kolor="#082567" tytul="Składki i stawki">
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
const emptyForm = { name: '', funkcja: 'CREW', umowa: 'UZ', stawka: 30, zus: false };

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
          <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Funkcja</label><select value={f.funkcja} onChange={(e) => set({ funkcja: e.target.value })} className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}>{FUNKCJE.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>Typ umowy</label><select value={f.umowa} onChange={(e) => set({ umowa: e.target.value })} className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }}><option value="UOP">UOP (etat)</option><option value="UZ">UZ (zlecenie)</option></select></div>
            <div><label className="block text-xs mb-1" style={{ color: colors.primary.light }}>{f.umowa === 'UOP' ? 'Wynagr. mies. (zł)' : 'Stawka (zł/h)'}</label><input type="number" value={f.stawka} onChange={(e) => set({ stawka: Number(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg border" style={{ borderColor: colors.primary.bg }} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm" style={{ color: colors.primary.dark }}><input type="checkbox" checked={f.zus} onChange={(e) => set({ zus: e.target.checked })} />Pracownik oskładkowany (ZUS){f.umowa === 'UOP' ? ' — dla UOP zawsze' : ''}</label>
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
    if (form.id) { await data.updateAccount(form.id, f); data.show('Zapisano zmiany'); }
    else { const c = await data.addAccount(f); if (c) setCred(c); }
    setForm(null);
  };
  const reset = async (e) => { const c = await data.resetAccountPassword(e.id); if (c) setCred(c); };
  const del = (e) => { if (confirm(`Usunąć konto: ${e.name} (${e.login})?`)) data.deleteAccount(e.id); };
  const filtered = emps.filter((e) => (e.name + ' ' + e.login).toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Pracownicy" subtitle="Konta pracowników — funkcje, stawki, dane logowania">
        <button onClick={() => setForm({ ...emptyForm })} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: colors.primary.medium }}>+ Dodaj pracownika</button>
      </Header>
      <div className="flex-1 p-8 space-y-4 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="flex items-center gap-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Szukaj: imię lub login…" className="px-3 py-2 rounded-lg border text-sm w-72" style={{ borderColor: colors.primary.bg }} /><span className="text-sm text-slate-400">{filtered.length} z {emps.length} kont</span></div>
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden" style={{ borderColor: colors.primary.bg }}>
          <div className="grid grid-cols-[1.4fr_1.4fr_90px_90px_80px_1fr_150px] gap-2 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: `linear-gradient(180deg, ${colors.primary.dark}, ${colors.primary.darkest})`, color: 'white' }}><span>Pracownik</span><span>Funkcja</span><span>Umowa</span><span className="text-right">Stawka</span><span className="text-center">ZUS</span><span>Login</span><span className="text-right">Akcje</span></div>
          {filtered.length === 0 ? <div className="p-8 text-center text-slate-400">Brak kont. Kliknij „Dodaj pracownika".</div> : filtered.map((e, i) => (
            <div key={e.id} className="grid grid-cols-[1.4fr_1.4fr_90px_90px_80px_1fr_150px] gap-2 px-4 py-2.5 items-center border-t text-sm" style={{ borderColor: '#eef2f7', backgroundColor: i % 2 ? '#f8fafc' : 'white' }}>
              <span className="font-semibold truncate" style={{ color: colors.primary.darkest }}>{e.name}</span>
              <span style={{ color: colors.primary.dark }}>{funkcjaLabel(e.funkcja)}</span>
              <span><span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>{e.umowa}</span></span>
              <span className="text-right font-medium" style={{ color: colors.primary.darkest }}>{e.umowa === 'UOP' ? `${zl(e.stawka)}` : `${zl(e.stawka)}/h`}</span>
              <span className="text-center">{e.zus ? <Check size={16} style={{ color: '#2E9E5B' }} className="inline" /> : <span className="text-slate-300">—</span>}</span>
              <span className="font-mono font-semibold" style={{ color: colors.primary.dark }}>{e.login}</span>
              <span className="flex items-center justify-end gap-1">
                <button onClick={() => setForm({ id: e.id, name: e.name, funkcja: e.funkcja, umowa: e.umowa, stawka: e.stawka, zus: e.zus })} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}>Edytuj</button>
                <button onClick={() => reset(e)} className="text-xs px-2 py-1 rounded-lg flex items-center gap-1" style={{ backgroundColor: colors.primary.bgLight, color: colors.primary.dark }}><Lock size={12} />PIN</button>
                <button onClick={() => del(e)} className="text-red-400 p-1"><Trash2 size={15} /></button>
              </span>
            </div>
          ))}
        </div>
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
  const domyslnyYm = (data.months && data.months[0]?.key) || (data.meta.firstDate || '').slice(0, 7) || new Date().toISOString().slice(0, 7);
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

        <Sekcja kolor="#082567" tytul="Godziny MGR (ręcznie)" ikona={Clock}>
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

const WorkingTime = ({ data, canEdit }) => {
  const ts = data.ts || { actuals: {}, completed: {}, weekStatus: {} };
  const [view, setView] = useState('list');
  const [weekStart, setWeekStart] = useState(null);
  const [day, setDay] = useState(null);
  const [fStation, setFStation] = useState('');
  const [order, setOrder] = useState('entry');
  const [brkFor, setBrkFor] = useState(null);

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
  const openWeek = (w) => { setWeekStart(w.start); setDay(w.days[0]); setView('week'); };

  const stacje = [...new Set(dayShifts(day || '').map((s) => s.station))];
  let rows = dayShifts(day || '');
  if (fStation) rows = rows.filter((s) => s.station === fStation);
  rows = [...rows];
  if (order === 'az') rows.sort((a, b) => a.name.localeCompare(b.name));
  else if (order === 'diff') rows.sort((a, b) => Math.abs(actualNet(b) - wtDur(b.start, b.end)) - Math.abs(actualNet(a) - wtDur(a.start, a.end)));

  const plannedMin = rows.reduce((x, s) => x + wtDur(s.start, s.end), 0);
  const actualMin = rows.reduce((x, s) => x + actualNet(s), 0);
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
    const wcLabel = '107044 · PLK Kraków Galeria Krakowska';
    const range = (w) => { const e = new Date(w.start); e.setDate(e.getDate() + 6); return `${w.start.slice(8)}.${w.start.slice(5, 7)} – ${ymd(e).slice(8)}.${ymd(e).slice(5, 7)}.${w.start.slice(0, 4)}`; };
    return (
      <div className="flex-1 flex flex-col">
        <Header title="Grafik" subtitle="Timesheety tygodniowe — plan vs wykonanie, przerwy, zamykanie tygodni" />
        <div className="flex-1 p-8 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
          <div className="flex items-center gap-2 mb-3"><span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: colors.primary.light }}>Work Center</span><div className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white border" style={{ borderColor: colors.primary.bg, color: colors.primary.darkest }}>{wcLabel}</div></div>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden border" style={{ borderColor: colors.primary.bg }}>
            <div className="grid grid-cols-[1fr_110px_110px_110px_56px] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: `linear-gradient(180deg, ${colors.primary.dark}, ${colors.primary.darkest})`, color: 'white' }}><span>Week</span><span className="text-center">Completed</span><span className="text-center">Reviewed</span><span className="text-center">Closed</span><span /></div>
            {weeks.length === 0 ? <div className="p-8 text-center text-slate-400">Brak grafiku. Zaimportuj miesiąc.</div> : weeks.map((w, idx) => {
              const done = weekDone(w); const st = wsOf(w.start);
              const toggleReviewed = (e) => { e.stopPropagation(); if (!canEdit) return; if (!done) return data.show('Najpierw zamknij wszystkie dni (Completed)', 'error'); data.tsSetWeek(w.start, { ...st, reviewed: !st.reviewed }); };
              const toggleClosed = (e) => { e.stopPropagation(); if (!canEdit) return; if (st.closed) { data.tsSetWeek(w.start, { ...st, closed: false }); data.show('Tydzień otwarty ponownie'); return; } if (!done) return data.show('Najpierw wszystkie dni Completed', 'error'); data.tsSetWeek(w.start, { reviewed: true, closed: true }); data.show('Tydzień zamknięty'); };
              return (
                <div key={w.start} className="grid grid-cols-[1fr_110px_110px_110px_56px] px-4 py-2.5 items-center border-t text-sm" style={{ borderColor: '#eef2f7', backgroundColor: idx % 2 ? '#f8fafc' : 'white' }}>
                  <button onClick={() => openWeek(w)} className="text-left font-medium hover:underline" style={{ color: colors.primary.darkest }}>{range(w)}<span className="text-xs text-slate-400 ml-2">({w.days.length} dni)</span></button>
                  <span className="flex justify-center">{done ? <span className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: '#e9f7ef' }}><Check size={15} style={{ color: '#2E9E5B' }} /></span> : <span className="text-slate-300">…</span>}</span>
                  <span className="flex justify-center"><button onClick={toggleReviewed} title="Reviewed" className="w-6 h-6 rounded-full flex items-center justify-center border" style={{ borderColor: st.reviewed ? '#2E9E5B' : colors.primary.bg, backgroundColor: st.reviewed ? '#e9f7ef' : 'white' }}>{st.reviewed && <Check size={14} style={{ color: '#2E9E5B' }} />}</button></span>
                  <span className="flex justify-center"><button onClick={toggleClosed} title="Closed" className="w-6 h-6 rounded-full flex items-center justify-center border" style={{ borderColor: st.closed ? '#E74C3C' : colors.primary.bg, backgroundColor: st.closed ? '#fdecea' : 'white' }}>{st.closed && <Check size={14} style={{ color: '#E74C3C' }} />}</button></span>
                  <span className="flex justify-center"><button onClick={() => openWeek(w)} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: colors.primary.medium }}><ChevronRight size={16} /></button></span>
                </div>
              );
            })}
            <div className="px-4 py-2 text-[11px] text-slate-400 flex items-center justify-between border-t" style={{ borderColor: '#eef2f7' }}><span>Rekordów: {weeks.length}</span><span>REX Cloud · Time &amp; Attendance</span></div>
          </div>
          {!canEdit && <p className="text-xs text-slate-400 mt-3">Widok kierownika zmiany — podgląd. Zamykanie i korekty wykonuje ASM.</p>}
        </div>
      </div>
    );
  }

  const openStartRel = rows.length ? Math.min(...rows.map((s) => wtRel(s.start))) : 0;
  const openEndRel = rows.length ? Math.max(...rows.map((s) => wtRel(s.start) + wtDur(s.start, s.end))) : 0;
  const st = weekStart ? wsOf(weekStart) : { reviewed: false, closed: false };
  const chip = (on, txt, kol) => <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: on ? kol.bg : '#f1f5f9', color: on ? kol.fg : '#94a3b8' }}>{txt}</span>;
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Grafik" subtitle={dateLabel(day)}>
        {chip(weekDone(curWeek()), 'Completed', { bg: '#e9f7ef', fg: '#2E9E5B' })}
        {chip(st.reviewed, 'Reviewed', { bg: '#e9f7ef', fg: '#2E9E5B' })}
        {chip(st.closed, 'Closed', { bg: '#fdecea', fg: '#E74C3C' })}
        <button disabled={locked} onClick={() => { data.tsToggleCompleted(day); data.show(!ts.completed[day] ? 'Dzień oznaczony jako Completed' : 'Zdjęto status Completed'); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40" style={{ backgroundColor: ts.completed[day] ? '#2E9E5B' : 'white', color: ts.completed[day] ? 'white' : colors.primary.dark, border: `1px solid ${colors.primary.bg}` }}><Check size={15} />{ts.completed[day] ? 'Completed' : 'Zamknij dzień'}</button>
      </Header>
      <div className="flex-1 p-8 space-y-4 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <button onClick={() => setView('list')} className="flex items-center gap-1 text-sm" style={{ color: colors.primary.medium }}><ChevronLeft size={16} />Wróć do tygodni</button>
        {locked && <div className="rounded-lg px-4 py-2 text-sm font-medium" style={{ backgroundColor: '#fdecea', color: '#E74C3C' }}>{canEdit ? 'Tydzień zamknięty (Closed) — widok tylko do podglądu. Odblokuj na liście tygodni, aby edytować.' : 'Widok tylko do podglądu (kierownik zmiany).'}</div>}
        <div className="flex gap-1 flex-wrap">
          {weekDays.map((d) => { const n = dayShifts(d).length; const dt = new Date(d); const nm = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'][dt.getDay()]; const dc = ts.completed[d]; return (
            <button key={d} onClick={() => n && setDay(d)} disabled={n === 0} className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1" style={{ backgroundColor: day === d ? colors.primary.medium : n ? 'white' : colors.primary.bgLight, color: day === d ? 'white' : n ? colors.primary.dark : '#cbd5e1', border: `1px solid ${day === d ? colors.primary.medium : colors.primary.bg}` }}>{dc && <Check size={12} style={{ color: day === d ? 'white' : '#2E9E5B' }} />}{nm} {dt.getDate()}<span className="text-xs opacity-70">({n})</span></button>
          ); })}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl p-3 text-center bg-white shadow-sm border" style={{ borderColor: colors.primary.bg }}><p className="text-2xl font-bold" style={{ color: colors.primary.darkest }}>{wtHours(plannedMin)}</p><p className="text-xs" style={{ color: colors.primary.light }}>Plan (h)</p></div>
          <div className="rounded-xl p-3 text-center bg-white shadow-sm border" style={{ borderColor: colors.primary.bg }}><p className="text-2xl font-bold" style={{ color: colors.primary.darkest }}>{wtHours(actualMin)}</p><p className="text-xs" style={{ color: colors.primary.light }}>Wykonanie (h)</p></div>
          <div className="rounded-xl p-3 text-center bg-white shadow-sm border" style={{ borderColor: colors.primary.bg }}><p className="text-2xl font-bold" style={{ color: (actualMin - plannedMin) > 0 ? '#E74C3C' : '#2E9E5B' }}>{actualMin - plannedMin >= 0 ? '+' : ''}{wtHours(actualMin - plannedMin)}</p><p className="text-xs" style={{ color: colors.primary.light }}>Różnica (h)</p></div>
          <div className="rounded-xl p-3 text-center shadow-sm" style={{ backgroundColor: colors.primary.darkest }}><p className="text-2xl font-bold text-white">{eff}%</p><p className="text-xs text-white/70">Work Efficiency</p></div>
        </div>
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
                    <p className="text-sm font-semibold truncate" style={{ color: colors.primary.darkest }}>{s.name}</p>
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
    } catch { show('Błąd synchronizacji', 'error'); }
    setLoading(false);
  }, []);

  const importSchedule = useCallback(async (parsed) => {
    setLoading(true);
    try {
      const r = await api('/schedule', 'PUT', { shifts: parsed.shifts, roster: parsed.roster, meta: parsed.meta });
      if (r.success) { show(`Zaimportowano ${parsed.shifts.length} zmian (${parsed.meta.monthName || r.month})`); await sync(); }
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

  return { shifts, roster, meta, months, planowanie, swaps, ts, accounts, budget, salesData, loading, toast, setToast, show, sync, importSchedule, deleteMonth, clearSchedule, setPlanTotal, applyGodziny, clearGodziny, refreshSwaps, approveSwap, rejectSwap, tsPutActual, tsPutActualsBulk, tsToggleCompleted, tsSetWeek, addAccount, updateAccount, resetAccountPassword, deleteAccount, saveBudget, saveSales, clearSales };
};

// ===================== MAIN =====================

export default function App() {
  const sesja = store.get('admin_session');
  const [authed, setAuthed] = useState(() => !!sesja);
  const [role, setRole] = useState(() => (sesja && sesja.role) || 'kierownik');
  const [page, setPage] = useState('dashboard');
  const data = useData();
  const logout = () => { store.del('admin_session'); setAuthed(false); setRole('kierownik'); setPage('dashboard'); };
  const onLogin = (r) => { setRole(r); setAuthed(true); setPage('dashboard'); };

  if (!authed) return <Login onLogin={onLogin} />;

  const pages = {
    dashboard: <Dashboard data={data} setPage={setPage} />,
    import: <ImportPage data={data} />,
    wt: <WorkingTime data={data} canEdit={role === 'asm'} />,
    print: <PrintPage data={data} />,
    plan: <BudgetPlan data={data} />,
    forecast: <ForecastPlan data={data} />,
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
      <Sidebar page={widok} setPage={setPage} logout={logout} role={role} pendingSwaps={pendingSwaps} />
      <div className="flex-1 flex flex-col overflow-hidden"><div className="flex-1 overflow-y-auto">{pages[widok] || pages.print}</div></div>
      {data.toast && <Toast message={data.toast.message} type={data.toast.type} onClose={() => data.setToast(null)} />}
    </div>
  );
}
