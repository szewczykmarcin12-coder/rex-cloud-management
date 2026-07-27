import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Cloud, Lock, Upload, Printer, Calendar, Users, LayoutGrid, RefreshCw, LogOut, Check, X, AlertCircle, FileSpreadsheet, Trash2, ChevronLeft, ChevronRight, Home, Settings, Download } from 'lucide-react';
import { parseGrafik } from './parseGrafik.js';
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
  'PREP': '#8D6E63', 'DOSTAWA': '#5C6BC0', 'MANAGER': '#082567', 'MGR FUNKCYJNE': '#455A64', 'SZKOLENIA': '#26A69A'
};
const stationColor = (s) => stationColors[(s || '').toUpperCase()] || colors.primary.medium;

const months = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
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
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const r = await api('/admin-auth', 'POST', { pin });
      if (r.success) { store.set('admin_session', { at: Date.now() }); onLogin(); }
      else setErr(r.error || 'Nieprawidłowy PIN');
    } catch { setErr('Błąd połączenia z serwerem'); }
    setLoading(false);
  };
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: `linear-gradient(to bottom, #051845, ${colors.primary.darkest})` }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-3 mb-12"><div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.primary.medium }}><Cloud className="w-8 h-8 text-white" /></div><div><span className="text-white text-3xl font-light">REX</span><span className="text-3xl font-light ml-2" style={{ color: colors.primary.bg }}>Cloud</span></div></div>
        <div className="bg-white rounded-2xl p-8">
          <div className="flex items-center justify-center gap-2 mb-2"><Lock className="w-5 h-5" style={{ color: colors.primary.medium }} /><h2 className="text-2xl font-semibold" style={{ color: colors.primary.darkest }}>Panel Administratora</h2></div>
          <p className="text-center text-sm mb-6" style={{ color: colors.primary.light }}>Dostęp tylko dla kierownika</p>
          {err && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{err}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div><label className="block text-sm mb-1" style={{ color: colors.primary.light }}>PIN administratora</label><input type="password" value={pin} onChange={e => setPin(e.target.value)} className="w-full px-4 py-3 rounded-xl border focus:outline-none text-center text-2xl tracking-widest" style={{ borderColor: colors.primary.bg }} placeholder="••••" maxLength={8} disabled={loading} autoFocus /></div>
            <button type="submit" disabled={loading} className="w-full text-white font-semibold py-3 rounded-xl" style={{ backgroundColor: loading ? colors.primary.light : colors.primary.medium }}>{loading ? 'Sprawdzam...' : 'Zaloguj się'}</button>
          </form>
          <p className="text-xs text-center mt-4" style={{ color: colors.primary.light }}>Domyślny PIN: 1234 (zmień w Ustawieniach)</p>
        </div>
      </div>
    </div>
  );
};

// ===================== SIDEBAR =====================

const Sidebar = ({ page, setPage, logout }) => {
  const menu = [
    { id: 'dashboard', label: 'Strona domowa', icon: Home },
    { id: 'import', label: 'Import z Excel', icon: Upload },
    { id: 'schedule', label: 'Grafik', icon: LayoutGrid },
    { id: 'print', label: 'Drukuj grafik', icon: Printer },
    { id: 'settings', label: 'Ustawienia', icon: Settings }
  ];
  return (
    <div className="w-72 h-screen flex flex-col" style={{ background: `linear-gradient(180deg, ${colors.primary.darkest} 0%, ${colors.primary.dark} 100%)` }}>
      <div className="p-6 border-b border-white/10"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.primary.medium }}><Cloud className="w-6 h-6 text-white" /></div><div><span className="text-white text-xl font-light">REX</span><span className="text-xl font-light ml-1" style={{ color: colors.primary.bg }}>Cloud</span><p className="text-xs text-white/50">Panel administratora</p></div></div></div>
      <nav className="flex-1 p-3 space-y-1">{menu.map(m => (<button key={m.id} onClick={() => setPage(m.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${page === m.id ? 'bg-white/15 text-white shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}><m.icon className="w-5 h-5" /><span className="font-medium">{m.label}</span></button>))}</nav>
      <div className="p-4 border-t border-white/10"><button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-400 hover:bg-white/5 transition-all"><LogOut className="w-5 h-5" /><span className="font-medium">Wyloguj się</span></button></div>
    </div>
  );
};

// ===================== DASHBOARD =====================

const Dashboard = ({ data, setPage }) => {
  const stats = [
    { label: 'Zmiany w grafiku', val: data.shifts.length, icon: Calendar, color: colors.primary.medium },
    { label: 'Pracownicy', val: data.roster.length, icon: Users, color: '#9C27B0' },
    { label: 'Zakres grafiku', val: data.meta.firstDate ? `${data.meta.firstDate.slice(5)} — ${data.meta.lastDate.slice(5)}` : '—', icon: LayoutGrid, color: colors.accent.dark }
  ];
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Strona domowa" subtitle="Przegląd systemu REX Cloud" />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="grid grid-cols-3 gap-6">{stats.map((s, i) => <StatCard key={i} label={s.label} value={s.val} icon={s.icon} color={s.color} />)}</div>
        <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${colors.primary.medium}` }}>
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
      const buf = await file.arrayBuffer();
      const result = parseGrafik(buf);
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
            <p className="text-sm mb-4" style={{ color: colors.primary.light }}>lub kliknij, aby wybrać (.xlsx)</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xlsm" className="hidden" onChange={e => handleFile(e.target.files[0])} />
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
                        <p className="truncate" style={{ color: stationColor(s.station) }}>{s.station}</p>
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
        doc = generateDayPDF(data.shifts, singleDate);
        fname = `grafik_${singleDate}.pdf`;
      } else {
        if (new Date(rangeEnd) < new Date(rangeStart)) { data.show('Data końcowa przed początkową', 'error'); setBusy(false); return; }
        doc = generateRangePDF(data.shifts, rangeStart, rangeEnd);
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
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');
  const changePin = async () => {
    if (!cur || !nw) { data.show('Wypełnij pola', 'error'); return; }
    if (nw !== nw2) { data.show('Nowe PINy się różnią', 'error'); return; }
    const r = await api('/admin-auth', 'PUT', { currentPin: cur, newPin: nw });
    if (r.success) { data.show('PIN zmieniony'); setCur(''); setNw(''); setNw2(''); }
    else data.show(r.error || 'Błąd', 'error');
  };
  const clearSchedule = async () => {
    if (!confirm('Usunąć cały grafik z systemu? Pracownicy nie zobaczą żadnych zmian.')) return;
    await data.clearSchedule();
  };
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Ustawienia" subtitle="Konfiguracja panelu" />
      <div className="flex-1 p-8 space-y-6 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="bg-white rounded-2xl p-6 shadow-sm max-w-xl" style={{ borderLeft: `4px solid ${colors.primary.medium}` }}>
          <h3 className="text-lg font-bold mb-4" style={{ color: colors.primary.darkest }}>Zmień PIN administratora</h3>
          <div className="space-y-3">
            <input type="password" value={cur} onChange={e => setCur(e.target.value)} placeholder="Obecny PIN" className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none" style={{ borderColor: colors.primary.bg }} />
            <input type="password" value={nw} onChange={e => setNw(e.target.value)} placeholder="Nowy PIN" className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none" style={{ borderColor: colors.primary.bg }} />
            <input type="password" value={nw2} onChange={e => setNw2(e.target.value)} placeholder="Powtórz nowy PIN" className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none" style={{ borderColor: colors.primary.bg }} />
            <Btn onClick={changePin}>Zapisz nowy PIN</Btn>
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

// ===================== DATA HOOK =====================

const useData = () => {
  const [shifts, setShifts] = useState([]);
  const [roster, setRoster] = useState([]);
  const [meta, setMeta] = useState({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const show = (m, t = 'success') => setToast({ message: m, type: t });

  const sync = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/schedule');
      if (r.success) { setShifts(r.shifts || []); setRoster(r.roster || []); setMeta(r.meta || {}); }
    } catch { show('Błąd synchronizacji', 'error'); }
    setLoading(false);
  }, []);

  const importSchedule = useCallback(async (parsed) => {
    setLoading(true);
    try {
      const r = await api('/schedule', 'PUT', { shifts: parsed.shifts, roster: parsed.roster, meta: parsed.meta });
      if (r.success) { setShifts(parsed.shifts); setRoster(parsed.roster); setMeta(parsed.meta); show(`Zaimportowano ${parsed.shifts.length} zmian`); }
      else show('Błąd importu: ' + r.error, 'error');
    } catch { show('Błąd zapisu do bazy', 'error'); }
    setLoading(false);
  }, []);

  const clearSchedule = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/schedule', 'DELETE');
      if (r.success) { setShifts([]); setRoster([]); setMeta({}); show('Grafik wyczyszczony'); }
    } catch { show('Błąd', 'error'); }
    setLoading(false);
  }, []);

  useEffect(() => { sync(); }, [sync]);

  return { shifts, roster, meta, loading, toast, setToast, show, sync, importSchedule, clearSchedule };
};

// ===================== MAIN =====================

export default function App() {
  const [authed, setAuthed] = useState(() => !!store.get('admin_session'));
  const [page, setPage] = useState('dashboard');
  const data = useData();
  const logout = () => { store.del('admin_session'); setAuthed(false); setPage('dashboard'); };

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const pages = {
    dashboard: <Dashboard data={data} setPage={setPage} />,
    import: <ImportPage data={data} />,
    schedule: <SchedulePage data={data} />,
    print: <PrintPage data={data} />,
    settings: <SettingsPage data={data} />
  };

  return (
    <div className="flex h-screen" style={{ backgroundColor: colors.primary.bgLight }}>
      <Sidebar page={page} setPage={setPage} logout={logout} />
      <div className="flex-1 flex flex-col overflow-hidden"><div className="flex-1 overflow-y-auto">{pages[page] || pages.dashboard}</div></div>
      {data.toast && <Toast message={data.toast.message} type={data.toast.type} onClose={() => data.setToast(null)} />}
    </div>
  );
}
