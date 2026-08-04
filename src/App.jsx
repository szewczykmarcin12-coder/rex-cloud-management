import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
    { id: 'schedule', label: 'Grafik', icon: LayoutGrid },
    { id: 'print', label: 'Drukuj grafik', icon: Printer },
    { id: 'plan', label: 'Plan godzin', icon: Clock },
    { id: 'swaps', label: 'Zamiany', icon: RefreshCw, badge: pendingSwaps },
    { id: 'settings', label: 'Ustawienia', icon: Settings }
  ];
  const menu = role === 'asm' ? pelne : pelne.filter(m => ['dashboard', 'schedule', 'print'].includes(m.id));
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
            <Btn variant="secondary" icon={LayoutGrid} onClick={() => setPage('schedule')}>Podgląd grafiku</Btn>
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

  return { shifts, roster, meta, months, planowanie, swaps, loading, toast, setToast, show, sync, importSchedule, deleteMonth, clearSchedule, setPlanTotal, applyGodziny, clearGodziny, refreshSwaps, approveSwap, rejectSwap };
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
    schedule: <SchedulePage data={data} />,
    print: <PrintPage data={data} />,
    plan: <PlanPage data={data} />,
    swaps: <AdminSwaps data={data} />,
    settings: <SettingsPage data={data} />
  };
  // Kierownik zmiany: strona domowa, grafik i wydruk. ASM: wszystko.
  const dozwolone = role === 'asm' ? Object.keys(pages) : ['dashboard', 'schedule', 'print'];
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
