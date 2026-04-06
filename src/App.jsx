import { useState, useEffect, useCallback, useMemo } from 'react';
import { Cloud, Lock, Home, Calendar, Users, Building2, Clock, Settings, Plus, Pencil, Trash2, X, Check, RefreshCw, LogOut, Inbox, LayoutGrid, ChevronLeft, ChevronRight, Bell, AlertCircle, Eye, EyeOff, UserPlus, Key } from 'lucide-react';

// ===================== CONFIG =====================
const API_BASE = 'https://rex-cloud-backend.vercel.app/api';
// Change this to your deployed backend URL ^

const STORAGE = 'rex_admin_';

const colors = {
  primary: { darkest: '#082567', dark: '#213b76', medium: '#395185', light: '#526695', bg: '#e8edf5', bgLight: '#f1f4f9' },
  accent: { dark: '#FDA785', medium: '#FFBF99', light: '#FBCEB1', bg: '#FFF5EE' }
};

const positionColors = { 'KIT': '#7CB342', 'CAS': '#00A3E0', 'SUP': '#E74C3C', 'RUN': '#9C27B0', 'SIN': '#FDA785', 'LOB': '#64748B', 'TRA': '#6B7280', 'MGR': '#1E3A8A' };
const positionNames = { 'KIT': 'Kuchnia', 'CAS': 'Kasa', 'SUP': 'Wsparcie', 'RUN': 'Runner', 'SIN': 'Sink', 'LOB': 'Lobby', 'TRA': 'Training', 'MGR': 'Manager' };

const jobPositions = [
  { id: 'crew', name: 'Crew', color: '#7CB342' },
  { id: 'expert', name: 'Expert / Instructor', color: '#00A3E0' },
  { id: 'jsm', name: 'Junior Shift Manager', color: '#9C27B0' },
  { id: 'fm', name: 'Facility Manager', color: '#FDA785' },
  { id: 'pm', name: 'Product Manager', color: '#E74C3C' },
  { id: 'am', name: 'Assistant Manager', color: '#1E3A8A' },
  { id: 'gm', name: 'General Manager', color: '#082567' }
];

const requestTypes = {
  'work': { label: 'Pracuj', color: '#7CB342', icon: '✅' },
  'no_work': { label: 'Nie pracuj', color: '#E74C3C', icon: '❌' },
  'no_early': { label: 'Nie pracuj wcześniej', color: '#FDA785', icon: '🌅' },
  'no_late': { label: 'Nie pracuj później niż', color: '#395185', icon: '🌙' },
  'hours': { label: 'Praca w godzinach', color: '#9C27B0', icon: '⏰' }
};

const requestStatuses = {
  'pending': { label: 'Oczekujący', color: '#FDA785' },
  'approved': { label: 'Zatwierdzony', color: '#7CB342' },
  'rejected': { label: 'Odrzucony', color: '#E74C3C' }
};

const months = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const dayNamesFull = ['NIEDZ', 'PON', 'WT', 'ŚR', 'CZW', 'PT', 'SOB'];
const DEFAULT_LOCATION = 'Popeyes PLK Kraków Galeria Krakowska';

const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem(STORAGE + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(STORAGE + k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(STORAGE + k); } catch {} }
};

const api = async (path, method = 'GET', body = null) => {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${API_BASE}${path}`, opts);
  return r.json();
};

// ===================== UI COMPONENTS =====================

const Btn = ({ children, variant = 'primary', size = 'md', icon: Icon, onClick, disabled, loading, className = '' }) => {
  const vars = { primary: { bg: `linear-gradient(135deg, ${colors.primary.medium}, ${colors.primary.dark})`, text: 'white', shadow: '0 4px 14px rgba(8,37,103,0.3)' }, secondary: { bg: colors.primary.bg, text: colors.primary.dark, shadow: 'none' }, danger: { bg: 'linear-gradient(135deg, #E74C3C, #c0392b)', text: 'white', shadow: '0 4px 14px rgba(231,76,60,0.3)' }, ghost: { bg: 'transparent', text: colors.primary.light, shadow: 'none' }, success: { bg: 'linear-gradient(135deg, #7CB342, #558B2F)', text: 'white', shadow: '0 4px 14px rgba(124,179,66,0.3)' }, accent: { bg: `linear-gradient(135deg, ${colors.accent.dark}, ${colors.accent.medium})`, text: 'white', shadow: '0 4px 14px rgba(253,167,133,0.4)' } };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3' };
  const v = vars[variant] || vars.primary;
  return <button onClick={onClick} disabled={disabled || loading} className={`${sizes[size]} rounded-xl font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${className}`} style={{ background: v.bg, color: v.text, boxShadow: v.shadow }}>{loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : Icon && <Icon className="w-4 h-4" />}{children}</button>;
};

const Input = ({ label, type = 'text', value, onChange, placeholder, disabled, ...p }) => (<div className="w-full">{label && <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: colors.primary.light }}>{label}</label>}<input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none transition-all bg-white" style={{ borderColor: colors.primary.bg }} {...p} /></div>);

const Select = ({ label, value, onChange, options, placeholder }) => (<div className="w-full">{label && <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: colors.primary.light }}>{label}</label>}<select value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none transition-all bg-white" style={{ borderColor: colors.primary.bg }}>{placeholder && <option value="">{placeholder}</option>}{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>);

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => { if (!isOpen) return null; const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' }; return (<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}><div className={`bg-white rounded-2xl w-full ${sizes[size]} max-h-[90vh] overflow-hidden flex flex-col shadow-2xl`} onClick={e => e.stopPropagation()}><div className="px-6 py-4 border-b flex items-center justify-between" style={{ background: `linear-gradient(to right, ${colors.primary.bgLight}, white)` }}><h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>{title}</h3><button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors"><X className="w-5 h-5" /></button></div><div className="flex-1 overflow-y-auto p-6">{children}</div></div></div>); };

const Confirm = ({ isOpen, onClose, onConfirm, title, message, danger }) => (<Modal isOpen={isOpen} onClose={onClose} title={title} size="sm"><div className="space-y-4"><p style={{ color: colors.primary.light }}>{message}</p><div className="flex justify-end gap-3 pt-4 border-t"><Btn variant="secondary" onClick={onClose}>Anuluj</Btn><Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>Potwierdź</Btn></div></div></Modal>);

const Toast = ({ message, type, onClose }) => { useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]); const bgColors = { success: '#7CB342', error: '#E74C3C', info: colors.primary.medium }; return (<div className="fixed bottom-4 right-4 px-6 py-3 rounded-xl text-white shadow-lg z-50 flex items-center gap-2 animate-slideIn" style={{ backgroundColor: bgColors[type] || bgColors.info }}>{type === 'success' ? <Check className="w-5 h-5" /> : type === 'error' ? <X className="w-5 h-5" /> : <Bell className="w-5 h-5" />}{message}</div>); };

const Header = ({ title, subtitle, children }) => (<div className="bg-white/90 backdrop-blur-xl border-b px-8 py-5 flex items-center justify-between sticky top-0 z-10" style={{ borderColor: colors.primary.bg }}><div><h1 className="text-2xl font-bold" style={{ color: colors.primary.darkest }}>{title}</h1>{subtitle && <p className="text-sm mt-0.5" style={{ color: colors.primary.light }}>{subtitle}</p>}</div><div className="flex items-center gap-3">{children}</div></div>);

const Badge = ({ children, color, size = 'md' }) => { const sizes = { sm: 'px-2 py-0.5 text-xs', md: 'px-3 py-1 text-xs' }; return <span className={`${sizes[size]} rounded-full font-semibold inline-flex items-center gap-1`} style={{ backgroundColor: color + '20', color }}>{children}</span>; };

const StatCard = ({ label, value, icon: Icon, color }) => (<div className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow" style={{ borderLeft: `4px solid ${color}` }}><div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '15', color }}><Icon className="w-5 h-5" /></div><p className="text-3xl font-bold mt-3" style={{ color: colors.primary.darkest }}>{value}</p><p className="text-sm mt-1" style={{ color: colors.primary.light }}>{label}</p></div>);

// ===================== DATA HOOK =====================

const useData = () => {
  const [employees, setEmployees] = useState([]);
  const [requests, setRequests] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const show = (m, t = 'success') => setToast({ message: m, type: t });

  const syncAll = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, shiftsRes, reqRes] = await Promise.all([
        api('/users'), api('/shifts'), api('/requests')
      ]);
      if (usersRes.success) setEmployees(usersRes.users);
      if (shiftsRes.success) setShifts(shiftsRes.shifts);
      if (reqRes.success) setRequests(reqRes.requests);
      show('Zsynchronizowano z bazą danych');
    } catch (e) { show('Błąd synchronizacji: ' + e.message, 'error'); }
    setLoading(false);
  }, []);

  const saveShifts = useCallback(async (newShifts) => {
    setLoading(true);
    try {
      const r = await api('/shifts', 'PUT', { shifts: newShifts });
      if (r.success) { setShifts(newShifts); show('Grafik zapisany'); return true; }
      show('Błąd: ' + r.error, 'error'); return false;
    } catch { show('Błąd zapisu', 'error'); return false; }
    finally { setLoading(false); }
  }, []);

  const addShift = useCallback(async (shift) => {
    setLoading(true);
    try {
      const r = await api('/shifts', 'POST', { shift });
      if (r.success) { setShifts(prev => [...prev.filter(s => !(s.date === shift.date && s.userId === shift.userId)), r.shift]); show('Zmiana dodana'); return true; }
      show('Błąd: ' + r.error, 'error'); return false;
    } catch { show('Błąd', 'error'); return false; }
    finally { setLoading(false); }
  }, []);

  const deleteShift = useCallback(async (shiftId) => {
    setLoading(true);
    try {
      const r = await api('/shifts', 'DELETE', { shiftId });
      if (r.success) { setShifts(prev => prev.filter(s => s.id !== shiftId)); show('Zmiana usunięta'); return true; }
      show('Błąd', 'error'); return false;
    } catch { show('Błąd', 'error'); return false; }
    finally { setLoading(false); }
  }, []);

  const createUser = useCallback(async (userData) => {
    setLoading(true);
    try {
      const r = await api('/users', 'POST', userData);
      if (r.success) { setEmployees(prev => [...prev, r.user]); show(`Użytkownik ${r.user.name} utworzony`); return true; }
      show('Błąd: ' + r.error, 'error'); return false;
    } catch { show('Błąd tworzenia użytkownika', 'error'); return false; }
    finally { setLoading(false); }
  }, []);

  const updateUser = useCallback(async (userData) => {
    setLoading(true);
    try {
      const r = await api('/users', 'PUT', userData);
      if (r.success) { setEmployees(prev => prev.map(e => e.id === userData.id ? { ...e, ...r.user } : e)); show('Zaktualizowano'); return true; }
      show('Błąd: ' + r.error, 'error'); return false;
    } catch { show('Błąd', 'error'); return false; }
    finally { setLoading(false); }
  }, []);

  const removeUser = useCallback(async (id) => {
    setLoading(true);
    try {
      const r = await api('/users', 'DELETE', { id });
      if (r.success) { setEmployees(prev => prev.filter(e => e.id !== id)); show('Usunięto'); return true; }
      show('Błąd', 'error'); return false;
    } catch { show('Błąd', 'error'); return false; }
    finally { setLoading(false); }
  }, []);

  const updateRequestStatus = useCallback(async (requestId, status) => {
    setLoading(true);
    try {
      const r = await api('/requests', 'PUT', { requestId, updates: { status } });
      if (r.success) { setRequests(prev => prev.map(req => req.id === requestId ? { ...req, status } : req)); show(status === 'approved' ? 'Zatwierdzono' : 'Odrzucono'); return true; }
      show('Błąd', 'error'); return false;
    } catch { show('Błąd', 'error'); return false; }
    finally { setLoading(false); }
  }, []);

  const deleteRequest = useCallback(async (requestId) => {
    setLoading(true);
    try {
      const r = await api('/requests', 'DELETE', { requestId });
      if (r.success) { setRequests(prev => prev.filter(req => req.id !== requestId)); show('Usunięto'); return true; }
      show('Błąd', 'error'); return false;
    } catch { show('Błąd', 'error'); return false; }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { syncAll(); }, []);

  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending').length, [requests]);

  return { employees, setEmployees, requests, shifts, setShifts, loading, toast, setToast, show, sync: syncAll, saveShifts, addShift, deleteShift, createUser, updateUser, removeUser, pendingRequests, updateRequestStatus, deleteRequest };
};

// ===================== LOGIN =====================

const Login = ({ onLogin }) => {
  const [login, setLogin] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const r = await api('/auth', 'POST', { login, pin, role: 'admin' });
      if (r.success) { store.set('user', r.user); onLogin(r.user); }
      else setErr(r.error || 'Błąd logowania');
    } catch { setErr('Błąd połączenia z serwerem'); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: `linear-gradient(to bottom, #051845, ${colors.primary.darkest})` }}>
      <div className="w-full max-w-sm animate-fadeIn">
        <div className="flex items-center justify-center gap-3 mb-12">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.primary.medium }}><Cloud className="w-8 h-8 text-white" /></div>
          <div><span className="text-white text-3xl font-light">REX</span><span className="text-3xl font-light ml-2" style={{ color: colors.primary.bg }}>Cloud</span></div>
        </div>
        <div className="bg-white rounded-2xl p-8">
          <div className="flex items-center justify-center gap-2 mb-2"><Lock className="w-5 h-5" style={{ color: colors.primary.medium }} /><h2 className="text-2xl font-semibold" style={{ color: colors.primary.darkest }}>Panel Administracyjny</h2></div>
          <p className="text-center text-sm mb-6" style={{ color: colors.primary.light }}>Zaloguj się jako administrator</p>
          {err && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{err}</div>}
          <form onSubmit={submit} className="space-y-4">
            <div><label className="block text-sm mb-1" style={{ color: colors.primary.light }}>Login</label><input type="text" value={login} onChange={e => setLogin(e.target.value)} className="w-full px-4 py-3 rounded-xl border focus:outline-none" style={{ borderColor: colors.primary.bg }} placeholder="admin" disabled={loading} /></div>
            <div><label className="block text-sm mb-1" style={{ color: colors.primary.light }}>PIN</label><input type="password" value={pin} onChange={e => setPin(e.target.value)} className="w-full px-4 py-3 rounded-xl border focus:outline-none" style={{ borderColor: colors.primary.bg }} placeholder="1234" maxLength={8} disabled={loading} /></div>
            <button type="submit" disabled={loading} className="w-full text-white font-semibold py-3 rounded-xl transition-colors" style={{ backgroundColor: loading ? colors.primary.light : colors.primary.medium }}>{loading ? 'Logowanie...' : 'Zaloguj się'}</button>
          </form>
          <p className="text-xs text-center mt-4" style={{ color: colors.primary.light }}>Baza danych: Vercel KV</p>
        </div>
      </div>
    </div>
  );
};

// ===================== SIDEBAR =====================

const Sidebar = ({ page, setPage, user, logout, pendingRequests }) => {
  const menu = [
    { id: 'dashboard', label: 'Strona domowa', icon: Home },
    { id: 'scheduler', label: 'Grafik', icon: LayoutGrid },
    { id: 'requests', label: 'Wnioski', icon: Inbox, badge: pendingRequests },
    { id: 'shifts', label: 'Zmiany', icon: Calendar },
    { id: 'employees', label: 'Użytkownicy', icon: Users },
    { id: 'time', label: 'Przepracowany czas', icon: Clock },
    { id: 'evidence', label: 'Ewidencja', icon: Building2 },
    { id: 'settings', label: 'Ustawienia', icon: Settings }
  ];

  return (
    <div className="w-72 h-screen flex flex-col" style={{ background: `linear-gradient(180deg, ${colors.primary.darkest} 0%, ${colors.primary.dark} 100%)` }}>
      <div className="p-6 border-b border-white/10"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: colors.primary.medium }}><Cloud className="w-6 h-6 text-white" /></div><div><span className="text-white text-xl font-light">REX</span><span className="text-xl font-light ml-1" style={{ color: colors.primary.bg }}>Cloud</span></div></div></div>
      <div className="p-4 border-b border-white/10 flex items-center gap-3"><div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold" style={{ backgroundColor: colors.primary.medium }}>A</div><div><p className="text-white text-sm font-semibold">{user?.name}</p><p className="text-xs" style={{ color: colors.primary.bg }}>Administrator</p></div></div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menu.map(m => (
          <button key={m.id} onClick={() => setPage(m.id)} className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all ${page === m.id ? 'bg-white/15 text-white shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
            <div className="flex items-center gap-3"><m.icon className="w-5 h-5" /><span className="font-medium">{m.label}</span></div>
            {m.badge > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white animate-pulse" style={{ backgroundColor: colors.accent.dark }}>{m.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10"><button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-400 hover:bg-white/5 hover:text-red-300 transition-all"><LogOut className="w-5 h-5" /><span className="font-medium">Wyloguj się</span></button></div>
    </div>
  );
};

// ===================== DASHBOARD =====================

const Dashboard = ({ data, setPage }) => {
  const pendingReqs = data.requests.filter(r => r.status === 'pending').length;
  const stats = [
    { label: 'Zmiany w grafiku', val: data.shifts.length, icon: Calendar, color: colors.primary.medium },
    { label: 'Użytkownicy', val: data.employees.length, icon: Users, color: '#9C27B0' },
    { label: 'Oczekujące wnioski', val: pendingReqs, icon: Inbox, color: colors.accent.dark },
    { label: 'Zatwierdzone', val: data.requests.filter(r => r.status === 'approved').length, icon: Check, color: '#7CB342' }
  ];

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Strona domowa" subtitle="Przegląd systemu REX Cloud" />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="grid grid-cols-4 gap-6">{stats.map((s, i) => <StatCard key={i} label={s.label} value={s.val} icon={s.icon} color={s.color} />)}</div>
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${colors.accent.dark}` }}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-lg font-semibold" style={{ color: colors.primary.darkest }}>Oczekujące wnioski</h3><Btn variant="ghost" size="sm" onClick={() => setPage('requests')}>Zobacz</Btn></div>
            {data.requests.filter(r => r.status === 'pending').slice(0, 5).map(r => {
              const emp = data.employees.find(e => e.id === r.employeeId);
              const type = requestTypes[r.type] || requestTypes.work;
              return (<div key={r.id} className="flex items-center justify-between p-3 rounded-xl mb-2" style={{ backgroundColor: colors.primary.bg }}><div className="flex items-center gap-3"><span className="text-xl">{type.icon}</span><div><p className="font-semibold text-sm" style={{ color: colors.primary.darkest }}>{emp?.name || r.employeeName || 'Nieznany'}</p><p className="text-xs" style={{ color: colors.primary.light }}>{type.label} • {r.date}</p></div></div><Badge color={requestStatuses.pending.color}>{requestStatuses.pending.label}</Badge></div>);
            })}
            {pendingReqs === 0 && <p className="text-center py-4" style={{ color: colors.primary.light }}>Brak oczekujących wniosków</p>}
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${colors.primary.medium}` }}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: colors.primary.darkest }}>Szybkie akcje</h3>
            <div className="flex flex-wrap gap-3">
              <Btn icon={LayoutGrid} onClick={() => setPage('scheduler')}>Grafik</Btn>
              <Btn variant="accent" icon={Inbox} onClick={() => setPage('requests')}>Wnioski {pendingReqs > 0 && `(${pendingReqs})`}</Btn>
              <Btn variant="secondary" icon={UserPlus} onClick={() => setPage('employees')}>Dodaj użytkownika</Btn>
              <Btn variant="secondary" icon={RefreshCw} onClick={data.sync} loading={data.loading}>Synchronizuj</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===================== EMPLOYEES / USER MANAGEMENT =====================

const Employees = ({ data }) => {
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [filter, setFilter] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [form, setForm] = useState({ name: '', login: '', pin: '', email: '', position: 'crew', hourlyRate: 27.70 });

  const filtered = data.employees.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()));

  const openAdd = () => { setEdit(null); setForm({ name: '', login: '', pin: '', email: '', position: 'crew', hourlyRate: 27.70 }); setShowPin(false); setModal(true); };
  const openEdit = e => { setEdit(e); setForm({ ...e, pin: '' }); setShowPin(false); setModal(true); };

  const handleSave = async () => {
    if (!form.name) { data.show('Wypełnij imię i nazwisko', 'error'); return; }
    if (edit) {
      const updateData = { id: edit.id, name: form.name, email: form.email, position: form.position, hourlyRate: parseFloat(form.hourlyRate) || 0 };
      if (form.pin) updateData.pin = form.pin;
      await data.updateUser(updateData);
    } else {
      if (!form.login || !form.pin) { data.show('Login i PIN wymagane dla nowego użytkownika', 'error'); return; }
      await data.createUser({ name: form.name, login: form.login, pin: form.pin, email: form.email, position: form.position, hourlyRate: parseFloat(form.hourlyRate) || 0 });
    }
    setModal(false);
  };

  const handleDel = async (e) => { await data.removeUser(e.id); setDel(null); };

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Użytkownicy" subtitle="Zarządzanie kontami pracowników">
        <Input placeholder="Szukaj..." value={filter} onChange={setFilter} />
        <Btn icon={UserPlus} onClick={openAdd}>Dodaj użytkownika</Btn>
      </Header>
      <div className="flex-1 p-8 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm"><Users className="w-16 h-16 mx-auto mb-4" style={{ color: colors.primary.light }} /><p style={{ color: colors.primary.light }}>{data.employees.length === 0 ? 'Brak użytkowników. Dodaj pierwszego!' : 'Nie znaleziono'}</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(e => {
              const pos = jobPositions.find(j => j.id === e.position);
              return (
                <div key={e.id} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all" style={{ borderLeft: `4px solid ${pos?.color || colors.primary.medium}` }}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: pos?.color || colors.primary.medium }}>{e.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                      <div>
                        <p className="font-bold" style={{ color: colors.primary.darkest }}>{e.name}</p>
                        <p className="text-sm" style={{ color: colors.primary.light }}>{pos?.name || e.position}</p>
                      </div>
                    </div>
                    <Badge color={pos?.color || colors.primary.medium}>{pos?.name?.split(' ')[0] || e.position}</Badge>
                  </div>
                  <div className="mt-3 p-3 rounded-xl" style={{ backgroundColor: colors.primary.bg }}>
                    <div className="flex items-center gap-2 text-sm"><Key className="w-4 h-4" style={{ color: colors.primary.light }} /><span style={{ color: colors.primary.dark }}>Login: <strong>{e.login}</strong></span></div>
                    {e.email && <p className="text-xs mt-1" style={{ color: colors.primary.light }}>{e.email}</p>}
                  </div>
                  <div className="mt-3 pt-3 border-t flex items-center justify-between" style={{ borderColor: colors.primary.bg }}>
                    <span className="text-sm" style={{ color: colors.primary.light }}>Stawka: {e.hourlyRate || 0} zł/h</span>
                    <div className="flex gap-2"><Btn variant="ghost" size="sm" icon={Pencil} onClick={() => openEdit(e)} /><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setDel(e)} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <Modal isOpen={modal} onClose={() => setModal(false)} title={edit ? 'Edytuj użytkownika' : 'Nowy użytkownik'}>
        <div className="space-y-4">
          <Input label="Imię i nazwisko *" value={form.name} onChange={v => setForm({ ...form, name: v })} />
          {!edit && <Input label="Login (do logowania w aplikacji) *" value={form.login} onChange={v => setForm({ ...form, login: v })} placeholder="np. jan.kowalski" />}
          {edit && <div className="p-3 rounded-xl" style={{ backgroundColor: colors.primary.bg }}><p className="text-sm"><strong>Login:</strong> {edit.login}</p></div>}
          <div>
            <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: colors.primary.light }}>{edit ? 'Nowy PIN (zostaw puste aby nie zmieniać)' : 'PIN (do logowania) *'}</label>
            <div className="relative">
              <input type={showPin ? 'text' : 'password'} value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none bg-white pr-12" style={{ borderColor: colors.primary.bg }} placeholder={edit ? '••••' : 'np. 1234'} maxLength={8} />
              <button type="button" onClick={() => setShowPin(!showPin)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">{showPin ? <EyeOff className="w-4 h-4" style={{ color: colors.primary.light }} /> : <Eye className="w-4 h-4" style={{ color: colors.primary.light }} />}</button>
            </div>
          </div>
          <Input label="Email" value={form.email} onChange={v => setForm({ ...form, email: v })} placeholder="opcjonalnie" />
          <Select label="Pozycja" value={form.position} onChange={v => setForm({ ...form, position: v })} options={jobPositions.map(p => ({ value: p.id, label: p.name }))} />
          <Input label="Stawka godzinowa (zł)" type="number" step="0.01" value={form.hourlyRate} onChange={v => setForm({ ...form, hourlyRate: v })} />
          <div className="flex justify-end gap-3 pt-4 border-t"><Btn variant="secondary" onClick={() => setModal(false)}>Anuluj</Btn><Btn onClick={handleSave} loading={data.loading}>{edit ? 'Zapisz' : 'Utwórz konto'}</Btn></div>
        </div>
      </Modal>
      <Confirm isOpen={!!del} onClose={() => setDel(null)} onConfirm={() => handleDel(del)} title="Usuń użytkownika" message={`Usunąć konto "${del?.name}" (login: ${del?.login})?`} danger />
    </div>
  );
};

// ===================== SCHEDULER =====================

const Scheduler = ({ data }) => {
  const today = new Date();
  const [weekStart, setWeekStart] = useState(() => { const d = new Date(today); d.setDate(d.getDate() - d.getDay() + 1); return d.toISOString().split('T')[0]; });
  const [selectedCell, setSelectedCell] = useState(null);
  const [shiftModal, setShiftModal] = useState(false);
  const [shiftForm, setShiftForm] = useState({ startTime: '09:00', endTime: '17:00', position: 'KIT' });

  const weekDates = useMemo(() => { const dates = []; const start = new Date(weekStart); for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); dates.push(d.toISOString().split('T')[0]); } return dates; }, [weekStart]);
  const getWeekLabel = () => { const start = new Date(weekStart); const end = new Date(weekStart); end.setDate(end.getDate() + 6); return `${start.getDate()} ${months[start.getMonth()].slice(0, 3)} - ${end.getDate()} ${months[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`; };
  const changeWeek = (dir) => { const d = new Date(weekStart); d.setDate(d.getDate() + (dir * 7)); setWeekStart(d.toISOString().split('T')[0]); };

  const getEmployeeShift = (empId, date) => data.shifts.find(s => s.date === date && s.userId === empId);
  const getEmployeeRequest = (empId, date) => data.requests.find(r => r.employeeId === empId && r.status !== 'rejected' && date >= r.date && (!r.endDate || date <= r.endDate));

  const handleCellClick = (emp, date) => { setSelectedCell({ emp, date }); const existing = getEmployeeShift(emp.id, date); if (existing) setShiftForm({ startTime: existing.startTime, endTime: existing.endTime, position: existing.position }); else setShiftForm({ startTime: '09:00', endTime: '17:00', position: 'KIT' }); setShiftModal(true); };

  const handleAssignShift = async () => {
    if (!selectedCell) return;
    const { emp, date } = selectedCell;
    const d = new Date(date);
    const shift = { date, userId: emp.id, employeeName: emp.name, dayName: dayNamesFull[d.getDay()], dayNum: d.getDate(), startTime: shiftForm.startTime, endTime: shiftForm.endTime, position: shiftForm.position, location: DEFAULT_LOCATION };
    if (await data.addShift(shift)) { setShiftModal(false); setSelectedCell(null); }
  };

  const handleRemoveShift = async () => {
    if (!selectedCell) return;
    const existing = getEmployeeShift(selectedCell.emp.id, selectedCell.date);
    if (existing && await data.deleteShift(existing.id)) { setShiftModal(false); setSelectedCell(null); }
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Grafik tygodniowy" subtitle="Układanie zmian pracowników">
        <div className="flex items-center gap-2 rounded-xl p-1" style={{ backgroundColor: colors.primary.bg }}>
          <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-white rounded-lg"><ChevronLeft className="w-5 h-5" /></button>
          <span className="px-4 font-semibold text-sm min-w-[200px] text-center" style={{ color: colors.primary.dark }}>{getWeekLabel()}</span>
          <button onClick={() => changeWeek(1)} className="p-2 hover:bg-white rounded-lg"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <Btn variant="secondary" icon={RefreshCw} onClick={data.sync} loading={data.loading}>Odśwież</Btn>
      </Header>
      <div className="flex-1 p-4 overflow-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden min-w-[1000px]">
          <div className="grid-schedule border-b-2" style={{ backgroundColor: colors.primary.bg, borderColor: colors.primary.medium }}>
            <div className="cell-schedule p-3 font-bold text-sm flex items-center" style={{ color: colors.primary.dark }}>Pracownik</div>
            {weekDates.map(date => { const d = new Date(date); const todayStr = today.toISOString().split('T')[0]; const isToday = date === todayStr; const isWeekend = d.getDay() === 0 || d.getDay() === 6; return (<div key={date} className={`cell-schedule p-3 text-center ${isWeekend ? 'bg-orange-50' : ''} ${isToday ? 'bg-yellow-100' : ''}`}><div className="font-bold text-sm" style={{ color: colors.primary.dark }}>{dayNames[d.getDay()]}</div><div className="text-lg font-bold" style={{ color: isToday ? colors.accent.dark : colors.primary.darkest }}>{d.getDate()}</div><div className="text-xs" style={{ color: colors.primary.light }}>{months[d.getMonth()].slice(0, 3)}</div></div>); })}
          </div>
          {data.employees.length === 0 ? (<div className="p-12 text-center" style={{ color: colors.primary.light }}><Users className="w-16 h-16 mx-auto mb-4 opacity-30" /><p>Brak użytkowników. Dodaj pracowników aby układać grafik.</p></div>) : (
            data.employees.map(emp => {
              const pos = jobPositions.find(j => j.id === emp.position);
              return (
                <div key={emp.id} className="grid-schedule hover:bg-slate-50/50">
                  <div className="cell-schedule p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: pos?.color || colors.primary.medium }}>{emp.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div>
                    <div><p className="font-semibold text-sm truncate max-w-[120px]" style={{ color: colors.primary.darkest }}>{emp.name}</p><p className="text-xs" style={{ color: colors.primary.light }}>{pos?.name || emp.position}</p></div>
                  </div>
                  {weekDates.map(date => {
                    const shift = getEmployeeShift(emp.id, date);
                    const request = getEmployeeRequest(emp.id, date);
                    const isToday = date === today.toISOString().split('T')[0];
                    return (
                      <div key={`${emp.id}-${date}`} onClick={() => handleCellClick(emp, date)} className={`cell-schedule p-2 cursor-pointer transition-all hover:bg-blue-50 relative ${isToday ? 'bg-yellow-50' : ''}`}>
                        {request && <div className="absolute top-1 right-1"><span className="text-xs">{requestTypes[request.type]?.icon}</span></div>}
                        {shift ? (<div className="h-full flex flex-col justify-center"><div className="px-2 py-1 rounded-lg text-center text-xs font-bold text-white" style={{ backgroundColor: positionColors[shift.position] }}>{shift.startTime}-{shift.endTime}</div><div className="text-[10px] text-center mt-1" style={{ color: colors.primary.light }}>{positionNames[shift.position]}</div></div>) : (<div className="h-full flex items-center justify-center" style={{ color: colors.primary.light }}><Plus className="w-4 h-4 opacity-30" /></div>)}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
      <Modal isOpen={shiftModal} onClose={() => setShiftModal(false)} title={`Zmiana - ${selectedCell?.emp?.name}`}>
        {selectedCell && (<div className="space-y-4">
          <div className="p-4 rounded-xl" style={{ backgroundColor: colors.primary.bg }}><p className="text-sm"><strong>Data:</strong> {selectedCell.date}</p><p className="text-sm mt-1"><strong>Pracownik:</strong> {selectedCell.emp.name}</p>{getEmployeeRequest(selectedCell.emp.id, selectedCell.date) && (<p className="text-sm mt-2" style={{ color: colors.accent.dark }}><strong>⚠️ Wniosek:</strong> {requestTypes[getEmployeeRequest(selectedCell.emp.id, selectedCell.date).type]?.label}</p>)}</div>
          <div className="grid grid-cols-2 gap-4"><Input label="Od godziny" type="time" value={shiftForm.startTime} onChange={v => setShiftForm({ ...shiftForm, startTime: v })} /><Input label="Do godziny" type="time" value={shiftForm.endTime} onChange={v => setShiftForm({ ...shiftForm, endTime: v })} /></div>
          <Select label="Pozycja na zmianie" value={shiftForm.position} onChange={v => setShiftForm({ ...shiftForm, position: v })} options={Object.entries(positionNames).map(([k, v]) => ({ value: k, label: `${k} - ${v}` }))} />
          <div className="flex justify-between pt-4 border-t">{getEmployeeShift(selectedCell.emp.id, selectedCell.date) && (<Btn variant="danger" onClick={handleRemoveShift} loading={data.loading}>Usuń zmianę</Btn>)}<div className="flex gap-3 ml-auto"><Btn variant="secondary" onClick={() => setShiftModal(false)}>Anuluj</Btn><Btn onClick={handleAssignShift} loading={data.loading}>Zapisz zmianę</Btn></div></div>
        </div>)}
      </Modal>
    </div>
  );
};

// ===================== REQUESTS =====================

const Requests = ({ data }) => {
  const [filter, setFilter] = useState({ status: '' });
  const [delConfirm, setDelConfirm] = useState(null);

  const filtered = data.requests.filter(r => !filter.status || r.status === filter.status).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Wnioski pracowników" subtitle="Zarządzanie wnioskami o zmiany i urlopy">
        <Select value={filter.status} onChange={v => setFilter({ status: v })} options={[{ value: '', label: 'Wszystkie statusy' }, ...Object.entries(requestStatuses).map(([k, v]) => ({ value: k, label: v.label }))]} />
        <Btn variant="secondary" icon={RefreshCw} onClick={data.sync} loading={data.loading}>Odśwież</Btn>
      </Header>
      <div className="flex-1 p-8 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        {filtered.length === 0 ? (<div className="bg-white rounded-2xl p-12 text-center shadow-sm"><AlertCircle className="w-16 h-16 mx-auto mb-4" style={{ color: colors.primary.light }} /><p style={{ color: colors.primary.light }}>Brak wniosków</p></div>) : (
          <div className="space-y-4">{filtered.map(r => {
            const emp = data.employees.find(e => e.id === r.employeeId);
            const type = requestTypes[r.type] || requestTypes.work;
            const status = requestStatuses[r.status];
            return (
              <div key={r.id} className="bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow" style={{ borderLeft: `4px solid ${type.color}` }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: type.color + '15' }}>{type.icon}</div>
                    <div>
                      <p className="font-bold text-lg" style={{ color: colors.primary.darkest }}>{emp?.name || r.employeeName || 'Nieznany'}</p>
                      <p className="text-sm font-medium" style={{ color: type.color }}>{type.label}</p>
                      <p className="text-sm mt-1" style={{ color: colors.primary.light }}>{r.date}{r.timeFrom && ` | ${r.timeFrom}`}{r.timeTo && ` - ${r.timeTo}`}{r.position && ` | ${positionNames[r.position]}`}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge color={status.color}>{status.label}</Badge>
                    {r.status === 'pending' && (<><Btn variant="success" size="sm" icon={Check} onClick={() => data.updateRequestStatus(r.id, 'approved')} loading={data.loading}>Zatwierdź</Btn><Btn variant="danger" size="sm" icon={X} onClick={() => data.updateRequestStatus(r.id, 'rejected')} loading={data.loading}>Odrzuć</Btn></>)}
                    <Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setDelConfirm(r)} />
                  </div>
                </div>
              </div>
            );
          })}</div>
        )}
      </div>
      <Confirm isOpen={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={async () => { await data.deleteRequest(delConfirm.id); setDelConfirm(null); }} title="Usuń wniosek" message="Usunąć ten wniosek?" danger />
    </div>
  );
};

// ===================== SHIFTS LIST =====================

const Shifts = ({ data }) => {
  const [filter, setFilter] = useState({ date: '', position: '', employee: '' });
  const [delConfirm, setDelConfirm] = useState(null);

  const filtered = data.shifts.filter(s => {
    if (filter.date && !s.date.includes(filter.date)) return false;
    if (filter.position && s.position !== filter.position) return false;
    if (filter.employee && !s.employeeName?.toLowerCase().includes(filter.employee.toLowerCase())) return false;
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Zmiany" subtitle="Lista wszystkich zmian w bazie danych">
        <Input type="date" value={filter.date} onChange={v => setFilter({ ...filter, date: v })} />
        <Input placeholder="Pracownik..." value={filter.employee} onChange={v => setFilter({ ...filter, employee: v })} />
        <Select value={filter.position} onChange={v => setFilter({ ...filter, position: v })} options={[{ value: '', label: 'Wszystkie' }, ...Object.keys(positionNames).map(c => ({ value: c, label: c + ' - ' + positionNames[c] }))]} />
        <Btn variant="secondary" icon={RefreshCw} onClick={data.sync} loading={data.loading}>Odśwież</Btn>
      </Header>
      <div className="flex-1 p-8 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {filtered.length === 0 ? (<div className="text-center py-12"><Calendar className="w-16 h-16 mx-auto mb-4" style={{ color: colors.primary.light }} /><p style={{ color: colors.primary.light }}>Brak zmian</p></div>) : (
            <table className="w-full"><thead><tr style={{ backgroundColor: colors.primary.bg }}><th className="text-left px-6 py-4 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Data</th><th className="text-left px-6 py-4 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Godziny</th><th className="text-left px-6 py-4 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Pozycja</th><th className="text-left px-6 py-4 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Pracownik</th><th className="text-center px-6 py-4 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Akcje</th></tr></thead>
            <tbody>{filtered.map((s, i) => (<tr key={s.id || i} className="border-b hover:bg-slate-50" style={{ borderColor: colors.primary.bg }}><td className="px-6 py-4"><p className="font-semibold" style={{ color: colors.primary.darkest }}>{s.date}</p><p className="text-xs" style={{ color: colors.primary.light }}>{s.dayName}</p></td><td className="px-6 py-4 font-medium" style={{ color: colors.primary.dark }}>{s.startTime} - {s.endTime}</td><td className="px-6 py-4"><Badge color={positionColors[s.position]}>{s.position} - {positionNames[s.position]}</Badge></td><td className="px-6 py-4" style={{ color: colors.primary.darkest }}>{s.employeeName || 'Nieprzypisany'}</td><td className="px-6 py-4"><div className="flex justify-center"><Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setDelConfirm(s)} /></div></td></tr>))}</tbody></table>
          )}
        </div>
      </div>
      <Confirm isOpen={!!delConfirm} onClose={() => setDelConfirm(null)} onConfirm={async () => { await data.deleteShift(delConfirm.id); setDelConfirm(null); }} title="Usuń zmianę" message={`Usunąć zmianę ${delConfirm?.date} ${delConfirm?.startTime}-${delConfirm?.endTime}?`} danger />
    </div>
  );
};

// ===================== TIME =====================

const Time = ({ data }) => {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const calcH = (st, et) => { const [sh, sm] = st.split(':').map(Number), [eh, em] = et.split(':').map(Number); let h = eh - sh + (em - sm) / 60; return h < 0 ? h + 24 : h; };
  const mShifts = data.shifts.filter(s => { const d = new Date(s.date); return d.getMonth() === month && d.getFullYear() === year; });
  const empStats = data.employees.map(e => { const s = mShifts.filter(x => x.userId === e.id); const h = s.reduce((a, x) => a + calcH(x.startTime, x.endTime), 0); return { ...e, shiftsCount: s.length, totalHours: h }; });
  const totalH = mShifts.reduce((a, s) => a + calcH(s.startTime, s.endTime), 0);

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Przepracowany czas" subtitle="Ewidencja godzin pracy"><Select value={month.toString()} onChange={v => setMonth(+v)} options={months.map((m, i) => ({ value: i.toString(), label: m }))} /><Select value={year.toString()} onChange={v => setYear(+v)} options={[2024, 2025, 2026, 2027].map(y => ({ value: y.toString(), label: y.toString() }))} /></Header>
      <div className="flex-1 p-8 space-y-6 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="grid grid-cols-3 gap-6"><StatCard label="Suma godzin" value={`${totalH.toFixed(1)}h`} icon={Clock} color={colors.primary.medium} /><StatCard label="Liczba zmian" value={mShifts.length} icon={Calendar} color={colors.accent.dark} /><StatCard label="Aktywni" value={empStats.filter(e => e.shiftsCount > 0).length} icon={Users} color="#9C27B0" /></div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b" style={{ backgroundColor: colors.primary.bg }}><h3 className="font-bold text-lg" style={{ color: colors.primary.darkest }}>{months[month]} {year}</h3></div>
          {empStats.length === 0 ? <p className="text-center py-12" style={{ color: colors.primary.light }}>Brak użytkowników</p> :
            <table className="w-full"><thead><tr className="border-b" style={{ borderColor: colors.primary.bg }}><th className="text-left px-6 py-4 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Pracownik</th><th className="text-center px-6 py-4 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Zmian</th><th className="text-center px-6 py-4 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Godziny</th><th className="text-center px-6 py-4 text-xs font-semibold uppercase" style={{ color: colors.primary.light }}>Zarobek</th></tr></thead>
            <tbody>{empStats.map(e => { const pos = jobPositions.find(j => j.id === e.position); return (<tr key={e.id} className="border-b hover:bg-slate-50" style={{ borderColor: colors.primary.bg }}><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: pos?.color || colors.primary.medium }}>{e.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div><div><p className="font-semibold" style={{ color: colors.primary.darkest }}>{e.name}</p><p className="text-xs" style={{ color: colors.primary.light }}>{pos?.name}</p></div></div></td><td className="px-6 py-4 text-center font-medium">{e.shiftsCount}</td><td className="px-6 py-4 text-center font-bold text-lg" style={{ color: colors.primary.medium }}>{e.totalHours.toFixed(1)}h</td><td className="px-6 py-4 text-center font-bold" style={{ color: '#7CB342' }}>{(e.totalHours * (e.hourlyRate || 0)).toFixed(2)} zł</td></tr>); })}</tbody></table>}
        </div>
      </div>
    </div>
  );
};

// ===================== EVIDENCE =====================

const Evidence = ({ data }) => {
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const calcH = (st, et) => { const [sh, sm] = st.split(':').map(Number), [eh, em] = et.split(':').map(Number); let h = eh - sh + (em - sm) / 60; return h < 0 ? h + 24 : h; };
  const mShifts = data.shifts.filter(s => { const d = new Date(s.date); return d.getMonth() === month && d.getFullYear() === year; });
  const getDaysInMonth = () => new Date(year, month + 1, 0).getDate();
  const daysArray = Array.from({ length: getDaysInMonth() }, (_, i) => i + 1);

  const empStats = data.employees.map(e => { const s = mShifts.filter(x => x.userId === e.id); const h = s.reduce((a, x) => a + calcH(x.startTime, x.endTime), 0); return { ...e, shifts: s, shiftsCount: s.length, totalHours: h }; });
  const totalH = mShifts.reduce((a, s) => a + calcH(s.startTime, s.endTime), 0);

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Ewidencja" subtitle="Szczegółowa ewidencja godzin">
        <Select value={month.toString()} onChange={v => setMonth(+v)} options={months.map((m, i) => ({ value: i.toString(), label: m }))} />
        <Select value={year.toString()} onChange={v => setYear(+v)} options={[2024, 2025, 2026, 2027].map(y => ({ value: y.toString(), label: y.toString() }))} />
      </Header>
      <div className="flex-1 p-6 overflow-auto" style={{ backgroundColor: colors.primary.bgLight }}>
        <div className="grid grid-cols-3 gap-4 mb-6"><StatCard label="Suma godzin" value={`${totalH.toFixed(1)}h`} icon={Clock} color={colors.primary.medium} /><StatCard label="Zmian" value={mShifts.length} icon={Calendar} color={colors.accent.dark} /><StatCard label="Pracownicy" value={data.employees.length} icon={Users} color="#9C27B0" /></div>
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b" style={{ backgroundColor: colors.primary.bg }}><h3 className="font-bold" style={{ color: colors.primary.darkest }}>{months[month]} {year}</h3></div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ backgroundColor: colors.primary.bgLight }}>
                <th className="text-left px-4 py-3 font-semibold sticky left-0 bg-white z-10 min-w-[180px]" style={{ color: colors.primary.dark }}>Pracownik</th>
                {daysArray.map(day => { const d = new Date(year, month, day); const isWeekend = d.getDay() === 0 || d.getDay() === 6; return <th key={day} className={`px-1 py-2 text-center min-w-[40px] ${isWeekend ? 'bg-orange-50' : ''}`} style={{ color: colors.primary.light }}><div className="text-xs">{dayNames[d.getDay()]}</div><div className="font-bold">{day}</div></th>; })}
                <th className="px-4 py-3 text-center font-semibold" style={{ color: colors.primary.dark }}>Σ Godz.</th>
                <th className="px-4 py-3 text-center font-semibold" style={{ color: colors.primary.dark }}>Zarobek</th>
              </tr></thead>
              <tbody>
                {empStats.map(emp => {
                  const pos = jobPositions.find(j => j.id === emp.position);
                  return (
                    <tr key={emp.id} className="border-b hover:bg-slate-50" style={{ borderColor: colors.primary.bg }}>
                      <td className="px-4 py-3 sticky left-0 bg-white z-10"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: pos?.color || colors.primary.medium }}>{emp.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}</div><p className="font-semibold text-sm" style={{ color: colors.primary.darkest }}>{emp.name}</p></div></td>
                      {daysArray.map(day => {
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const shift = mShifts.find(s => s.date === dateStr && s.userId === emp.id);
                        const d = new Date(year, month, day);
                        const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                        return (<td key={day} className={`px-1 py-2 text-center ${isWeekend ? 'bg-orange-50' : ''}`}>{shift ? (<div className="text-[10px] font-bold px-1 py-0.5 rounded" style={{ backgroundColor: positionColors[shift.position] + '20', color: positionColors[shift.position] }}>{calcH(shift.startTime, shift.endTime).toFixed(1)}h</div>) : <span className="text-slate-200">-</span>}</td>);
                      })}
                      <td className="px-4 py-3 text-center font-bold" style={{ color: colors.primary.medium }}>{emp.totalHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-center font-bold" style={{ color: '#7CB342' }}>{(emp.totalHours * (emp.hourlyRate || 0)).toFixed(2)} zł</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===================== SETTINGS =====================

const SettingsPage = ({ data, logout }) => (
  <div className="flex-1 flex flex-col">
    <Header title="Ustawienia" subtitle="Konfiguracja systemu" />
    <div className="flex-1 p-8 space-y-6 overflow-y-auto" style={{ backgroundColor: colors.primary.bgLight }}>
      <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${colors.primary.medium}` }}>
        <h3 className="text-lg font-bold mb-4" style={{ color: colors.primary.darkest }}>Baza danych: Vercel KV</h3>
        <p className="text-sm mb-4" style={{ color: colors.primary.light }}>API: {API_BASE}</p>
        <Btn icon={RefreshCw} onClick={data.sync} loading={data.loading}>Synchronizuj teraz</Btn>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-sm" style={{ borderLeft: `4px solid ${colors.accent.dark}` }}>
        <h3 className="text-lg font-bold mb-4" style={{ color: colors.primary.darkest }}>Statystyki</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-4 rounded-xl" style={{ backgroundColor: colors.primary.bg }}><p className="text-2xl font-bold" style={{ color: colors.primary.medium }}>{data.employees.length}</p><p className="text-sm" style={{ color: colors.primary.dark }}>Użytkownicy</p></div>
          <div className="p-4 rounded-xl" style={{ backgroundColor: colors.accent.bg }}><p className="text-2xl font-bold" style={{ color: colors.accent.dark }}>{data.requests.length}</p><p className="text-sm" style={{ color: colors.accent.dark }}>Wnioski</p></div>
          <div className="p-4 rounded-xl" style={{ backgroundColor: '#f0fdf4' }}><p className="text-2xl font-bold" style={{ color: '#7CB342' }}>{data.shifts.length}</p><p className="text-sm" style={{ color: '#558B2F' }}>Zmiany</p></div>
        </div>
      </div>
      <div className="bg-white rounded-2xl p-6 shadow-sm"><Btn variant="secondary" icon={LogOut} onClick={logout}>Wyloguj się</Btn></div>
      <p className="text-center text-sm" style={{ color: colors.primary.light }}>REX Cloud Admin v2.0 — Vercel KV</p>
    </div>
  </div>
);

// ===================== MAIN APP =====================

export default function App() {
  const [user, setUser] = useState(() => store.get('user', null));
  const [page, setPage] = useState('dashboard');
  const data = useData();
  const logout = () => { store.del('user'); setUser(null); setPage('dashboard'); };

  if (!user) return <Login onLogin={setUser} />;

  const pages = { dashboard: <Dashboard data={data} setPage={setPage} />, scheduler: <Scheduler data={data} />, requests: <Requests data={data} />, shifts: <Shifts data={data} />, employees: <Employees data={data} />, time: <Time data={data} />, evidence: <Evidence data={data} />, settings: <SettingsPage data={data} logout={logout} /> };

  return (
    <div className="flex h-screen" style={{ backgroundColor: colors.primary.bgLight }}>
      <Sidebar page={page} setPage={setPage} user={user} logout={logout} pendingRequests={data.pendingRequests} />
      <div className="flex-1 flex flex-col overflow-hidden"><div className="flex-1 overflow-y-auto">{pages[page] || pages.dashboard}</div></div>
      {data.toast && <Toast message={data.toast.message} type={data.toast.type} onClose={() => data.setToast(null)} />}
    </div>
  );
}
