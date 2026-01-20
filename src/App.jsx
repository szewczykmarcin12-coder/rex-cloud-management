import { useState, useEffect, useCallback, useMemo } from 'react';

const API_URL = 'https://rex-cloud-backend.vercel.app/api/calendar';
const STORAGE = 'rex_admin_v2_';

const colors = {
  primary: { darkest: '#0f172a', dark: '#1e293b', medium: '#334155', light: '#64748b', bg: '#f1f5f9', bgLight: '#f8fafc' },
  accent: { orange: '#f97316', green: '#22c55e', red: '#ef4444', blue: '#3b82f6', purple: '#8b5cf6', yellow: '#eab308', pink: '#ec4899' }
};

const posColors = { 'KIT': '#059669', 'CAS': '#2563eb', 'SUP': '#dc2626', 'RUN': '#7c3aed', 'SIN': '#f97316', 'LOB': '#64748b', 'TRN': '#eab308', 'MGR': '#ec4899' };
const posNames = { 'KIT': 'Kuchnia', 'CAS': 'Kasa', 'SUP': 'Wsparcie', 'RUN': 'Runner', 'SIN': 'Sink', 'LOB': 'Lobby', 'TRN': 'Szkolenie', 'MGR': 'Manager' };

const requestTypes = {
  'OFF': { label: 'Dzień wolny', color: '#ef4444', icon: '🏖️' },
  'VACATION': { label: 'Urlop', color: '#f97316', icon: '✈️' },
  'SICK': { label: 'L4 / Choroba', color: '#8b5cf6', icon: '🏥' },
  'PREFER_MORNING': { label: 'Prośba: rano', color: '#22c55e', icon: '🌅' },
  'PREFER_EVENING': { label: 'Prośba: wieczór', color: '#3b82f6', icon: '🌙' },
  'SWAP': { label: 'Zamiana zmiany', color: '#ec4899', icon: '🔄' },
  'TRAINING': { label: 'Szkolenie', color: '#06b6d4', icon: '📚' },
  'OTHER': { label: 'Inne', color: '#64748b', icon: '📝' }
};

const requestStatuses = {
  'PENDING': { label: 'Oczekujący', color: '#f97316', bg: '#fff7ed' },
  'APPROVED': { label: 'Zatwierdzony', color: '#22c55e', bg: '#f0fdf4' },
  'REJECTED': { label: 'Odrzucony', color: '#ef4444', bg: '#fef2f2' }
};

const shiftTypes = {
  'OFF': { label: 'OFF', color: '#ef4444', textColor: 'white', display: 'OFF' },
  'FULL': { label: 'Pełny dzień', color: '#22c55e', textColor: 'white', display: 'FULL' },
  'MORNING': { label: 'Rano (6-14)', color: '#3b82f6', textColor: 'white', display: '6-14' },
  'DAY': { label: 'Dzień (10-18)', color: '#8b5cf6', textColor: 'white', display: '10-18' },
  'EVENING': { label: 'Wieczór (14-22)', color: '#f97316', textColor: 'white', display: '14-22' },
  'NIGHT': { label: 'Noc (18-02)', color: '#1e293b', textColor: 'white', display: '18-02' },
  'TRAINING': { label: 'Szkolenie', color: '#eab308', textColor: 'black', display: 'TRN' },
  'CUSTOM': { label: 'Niestandardowe', color: '#64748b', textColor: 'white', display: '...' }
};

const months = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
const dayNames = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'];
const dayNamesFull = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem(STORAGE + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(STORAGE + k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem(STORAGE + k); } catch {} }
};

const parseICS = (ics) => {
  const shifts = [], days = ['NIEDZ', 'PON', 'WT', 'ŚR', 'CZW', 'PT', 'SOB'];
  ics.split('BEGIN:VEVENT').slice(1).forEach((b, i) => {
    const get = f => { const m = b.match(new RegExp(f + '[^:]*:(.+?)(?:\\r?\\n|$)')); return m ? m[1].trim() : null; };
    const ds = get('DTSTART'), de = get('DTEND'), sum = get('SUMMARY'), loc = get('LOCATION') || 'Popeyes PLK', uid = get('UID');
    if (ds && sum) {
      const pd = s => { const c = s.replace('Z', '').replace(/[^0-9T]/g, ''); return new Date(+c.slice(0, 4), +c.slice(4, 6) - 1, +c.slice(6, 8), +c.slice(9, 11) || 0, +c.slice(11, 13) || 0); };
      const st = pd(ds), en = de ? pd(de) : null;
      if (st) {
        const pm = sum.match(/^(KIT|CAS|SUP|RUN|SIN|LOB|TRN|MGR)/i), pos = pm ? pm[1].toUpperCase() : 'KIT';
        shifts.push({ id: uid || 's-' + Date.now() + '-' + i, date: st.getFullYear() + '-' + String(st.getMonth() + 1).padStart(2, '0') + '-' + String(st.getDate()).padStart(2, '0'), dayName: days[st.getDay()], dayNum: st.getDate(), startTime: String(st.getHours()).padStart(2, '0') + ':' + String(st.getMinutes()).padStart(2, '0'), endTime: en ? String(en.getHours()).padStart(2, '0') + ':' + String(en.getMinutes()).padStart(2, '0') : '23:00', position: pos, location: loc.replace(/\\n/g, ' '), employeeName: sum.includes(' - ') ? sum.split(' - ')[0] : null });
      }
    }
  });
  return shifts.sort((a, b) => new Date(a.date) - new Date(b.date));
};

const genICS = (shifts) => {
  const fmt = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + '00';
  const evs = shifts.map(s => { const [sh, sm] = s.startTime.split(':'), [eh, em] = s.endTime.split(':'); const st = new Date(s.date); st.setHours(+sh, +sm); const en = new Date(s.date); en.setHours(+eh, +em); const uid = s.id.includes('@') ? s.id : 's-' + s.id + '@rexcloud.app', sum = s.employeeName ? s.position + ' - ' + s.employeeName : s.position + ' - Popeyes PLK'; return 'BEGIN:VEVENT\nUID:' + uid + '\nDTSTAMP:' + fmt(new Date()) + '\nDTSTART:' + fmt(st) + '\nDTEND:' + fmt(en) + '\nSUMMARY:' + sum + '\nLOCATION:' + (s.location || 'Popeyes PLK') + '\nSTATUS:CONFIRMED\nEND:VEVENT'; }).join('\n');
  return 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//REX Cloud Admin//PL\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\nX-WR-CALNAME:REX Cloud\n' + evs + '\nEND:VCALENDAR';
};

// Icons
const CloudIcon = () => <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>;
const LockIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>;
const DashboardIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>;
const CalendarIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
const UsersIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
const BuildingIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>;
const ClockIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const SettingsIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const PlusIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const EditIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
const TrashIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const XIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
const CheckIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>;
const RefreshIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>;
const LogoutIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
const SpinIcon = () => <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>;
const InboxIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>;
const GridIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
const ChevronLeftIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>;
const ChevronRightIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;
const BellIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
const EyeIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;

// UI Components
const Btn = ({ children, variant = 'primary', size = 'md', icon: Icon, onClick, disabled, loading, className = '' }) => {
  const vars = { primary: { bg: 'linear-gradient(135deg, #3b82f6, #2563eb)', text: 'white', shadow: '0 4px 14px rgba(59,130,246,0.4)' }, secondary: { bg: '#f1f5f9', text: '#334155', shadow: 'none' }, danger: { bg: 'linear-gradient(135deg, #ef4444, #dc2626)', text: 'white', shadow: '0 4px 14px rgba(239,68,68,0.4)' }, ghost: { bg: 'transparent', text: '#64748b', shadow: 'none' }, success: { bg: 'linear-gradient(135deg, #22c55e, #16a34a)', text: 'white', shadow: '0 4px 14px rgba(34,197,94,0.4)' } };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3' };
  const v = vars[variant] || vars.primary;
  return <button onClick={onClick} disabled={disabled || loading} className={`${sizes[size]} rounded-xl font-medium flex items-center justify-center gap-2 transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${className}`} style={{ background: v.bg, color: v.text, boxShadow: v.shadow }}>{loading ? <SpinIcon /> : Icon && <Icon />}{children}</button>;
};

const Input = ({ label, type = 'text', value, onChange, placeholder, disabled, ...p }) => (<div className="w-full">{label && <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: colors.primary.light }}>{label}</label>}<input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white" style={{ borderColor: '#e2e8f0' }} {...p} /></div>);

const Select = ({ label, value, onChange, options, placeholder }) => (<div className="w-full">{label && <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: colors.primary.light }}>{label}</label>}<select value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all bg-white" style={{ borderColor: '#e2e8f0' }}>{placeholder && <option value="">{placeholder}</option>}{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>);

const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => { if (!isOpen) return null; const sizes = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' }; return <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}><div className={`bg-white rounded-2xl w-full ${sizes[size]} max-h-[90vh] overflow-hidden flex flex-col shadow-2xl`} onClick={e => e.stopPropagation()}><div className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-slate-50 to-white"><h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>{title}</h3><button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors"><XIcon /></button></div><div className="flex-1 overflow-y-auto p-6">{children}</div></div></div>; };

const Confirm = ({ isOpen, onClose, onConfirm, title, message, danger }) => (<Modal isOpen={isOpen} onClose={onClose} title={title} size="sm"><div className="space-y-4"><p style={{ color: colors.primary.light }}>{message}</p><div className="flex justify-end gap-3 pt-4 border-t"><Btn variant="secondary" onClick={onClose}>Anuluj</Btn><Btn variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>Potwierdź</Btn></div></div></Modal>);

const Toast = ({ message, type, onClose }) => { useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]); const bgColors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6' }; return <div className="fixed bottom-4 right-4 px-6 py-3 rounded-xl text-white shadow-lg z-50 flex items-center gap-2 animate-slideIn" style={{ backgroundColor: bgColors[type] || bgColors.info }}>{type === 'success' ? <CheckIcon /> : type === 'error' ? <XIcon /> : <BellIcon />}{message}</div>; };

const Header = ({ title, subtitle, children }) => (<div className="bg-white/80 backdrop-blur-xl border-b px-8 py-5 flex items-center justify-between sticky top-0 z-10"><div><h1 className="text-2xl font-bold" style={{ color: colors.primary.darkest }}>{title}</h1>{subtitle && <p className="text-sm mt-0.5" style={{ color: colors.primary.light }}>{subtitle}</p>}</div><div className="flex items-center gap-3">{children}</div></div>);

const Badge = ({ children, color, size = 'md' }) => { const sizes = { sm: 'px-2 py-0.5 text-xs', md: 'px-3 py-1 text-xs' }; return <span className={`${sizes[size]} rounded-full font-semibold inline-flex items-center gap-1`} style={{ backgroundColor: color + '20', color }}>{children}</span>; };

const StatCard = ({ label, value, icon: Icon, color }) => (<div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"><div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '15', color }}><Icon /></div><p className="text-3xl font-bold mt-3" style={{ color: colors.primary.darkest }}>{value}</p><p className="text-sm mt-1" style={{ color: colors.primary.light }}>{label}</p></div>);

// Data Hook
const useData = () => {
  const [employees, setEmployees] = useState(() => store.get('employees', []));
  const [centers, setCenters] = useState(() => store.get('centers', []));
  const [templates, setTemplates] = useState(() => store.get('templates', []));
  const [requests, setRequests] = useState(() => store.get('requests', []));
  const [shifts, setShifts] = useState([]);
  const [sha, setSha] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const show = (m, t = 'success') => setToast({ message: m, type: t });

  const sync = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(API_URL);
      const d = await r.json();
      if (d.success && d.content) { setShifts(parseICS(d.content)); setSha(d.sha); show('Zsynchronizowano'); }
    } catch { show('Błąd synchronizacji', 'error'); }
    setLoading(false);
  }, []);

  const save = useCallback(async (newShifts) => {
    if (!sha) { show('Brak SHA - synchronizuj najpierw', 'error'); return false; }
    setLoading(true);
    try {
      const r = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: genICS(newShifts), sha, message: 'Update from Admin' }) });
      const d = await r.json();
      if (d.success) { setSha(d.sha); setShifts(newShifts); show('Zapisano'); return true; }
      show('Błąd: ' + d.error, 'error'); return false;
    } catch { show('Błąd', 'error'); return false; } finally { setLoading(false); }
  }, [sha]);

  useEffect(() => { store.set('employees', employees); }, [employees]);
  useEffect(() => { store.set('centers', centers); }, [centers]);
  useEffect(() => { store.set('templates', templates); }, [templates]);
  useEffect(() => { store.set('requests', requests); }, [requests]);
  useEffect(() => { sync(); }, []);

  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'PENDING').length, [requests]);

  return { employees, setEmployees, centers, setCenters, templates, setTemplates, requests, setRequests, shifts, setShifts, loading, toast, setToast, show, sync, save, sha, pendingRequests };
};

// Login Component
const Login = ({ onLogin }) => {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    await new Promise(r => setTimeout(r, 500));
    if (u === 'admin' && p === 'admin') {
      store.set('user', { name: 'Administrator', role: 'admin' });
      onLogin({ name: 'Administrator', role: 'admin' });
    } else {
      setErr('Nieprawidłowy login lub hasło');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' }}>
      <div className="w-full max-w-md animate-fadeIn">
        <div className="flex items-center justify-center gap-4 mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}><CloudIcon /></div>
          <div><span className="text-white text-4xl font-light tracking-tight">REX</span><span className="text-4xl font-light ml-2 text-blue-400">Cloud</span></div>
        </div>
        <div className="bg-white rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="p-2 rounded-xl bg-slate-100"><LockIcon /></div>
            <h2 className="text-xl font-bold" style={{ color: colors.primary.darkest }}>Panel Administratora</h2>
          </div>
          {err && <div className="bg-red-50 text-red-600 p-3 rounded-xl mb-4 text-sm font-medium">{err}</div>}
          <form onSubmit={submit} className="space-y-4">
            <Input label="Login" value={u} onChange={setU} placeholder="admin" disabled={loading} />
            <Input label="Hasło" type="password" value={p} onChange={setP} placeholder="admin" disabled={loading} />
            <Btn variant="primary" className="w-full" loading={loading} onClick={submit}>Zaloguj się</Btn>
          </form>
          <p className="text-xs text-center mt-6" style={{ color: colors.primary.light }}>REX Cloud v2.0 • Inspirowany GirNET</p>
        </div>
      </div>
    </div>
  );
};

// Sidebar Component
const Sidebar = ({ page, setPage, user, logout, pendingRequests }) => {
  const menu = [
    { id: 'dashboard', label: 'Pulpit', icon: DashboardIcon },
    { id: 'scheduler', label: 'Grafik', icon: GridIcon },
    { id: 'requests', label: 'Wnioski', icon: InboxIcon, badge: pendingRequests },
    { id: 'shifts', label: 'Zmiany', icon: CalendarIcon },
    { id: 'employees', label: 'Pracownicy', icon: UsersIcon },
    { id: 'centers', label: 'Centra', icon: BuildingIcon },
    { id: 'time', label: 'Ewidencja', icon: ClockIcon },
    { id: 'settings', label: 'Ustawienia', icon: SettingsIcon }
  ];

  return (
    <div className="w-64 h-screen flex flex-col" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' }}>
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}><CloudIcon /></div>
          <div><span className="text-white text-xl font-semibold tracking-tight">REX</span><span className="text-xl font-light ml-1 text-blue-400">Cloud</span></div>
        </div>
        <p className="text-xs mt-2 text-slate-400">Panel Administratora v2</p>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {menu.map(m => (
          <button key={m.id} onClick={() => setPage(m.id)} className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all ${page === m.id ? 'bg-white/15 text-white shadow-lg' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
            <div className="flex items-center gap-3"><m.icon /><span className="font-medium">{m.label}</span></div>
            {m.badge > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white animate-pulse">{m.badge}</span>}
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)' }}>A</div>
          <div><p className="text-white text-sm font-semibold">{user?.name}</p><p className="text-xs text-slate-400">{user?.role}</p></div>
        </div>
        <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all"><LogoutIcon /><span className="font-medium">Wyloguj</span></button>
      </div>
    </div>
  );
};

// Dashboard Component
const Dashboard = ({ data, setPage }) => {
  const pendingReqs = data.requests.filter(r => r.status === 'PENDING').length;
  const approvedReqs = data.requests.filter(r => r.status === 'APPROVED').length;
  const stats = [
    { label: 'Zmiany', val: data.shifts.length, icon: CalendarIcon, color: '#3b82f6' },
    { label: 'Pracownicy', val: data.employees.length, icon: UsersIcon, color: '#8b5cf6' },
    { label: 'Oczekujące wnioski', val: pendingReqs, icon: InboxIcon, color: '#f97316' },
    { label: 'Zatwierdzone', val: approvedReqs, icon: CheckIcon, color: '#22c55e' }
  ];
  const recentRequests = data.requests.filter(r => r.status === 'PENDING').slice(0, 5);

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Pulpit" subtitle="Przegląd systemu" />
      <div className="flex-1 p-8 space-y-8 overflow-y-auto">
        <div className="grid grid-cols-4 gap-6">{stats.map((s, i) => <StatCard key={i} label={s.label} value={s.val} icon={s.icon} color={s.color} />)}</div>
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold" style={{ color: colors.primary.darkest }}>Oczekujące wnioski</h3>
              <Btn variant="ghost" size="sm" onClick={() => setPage('requests')}>Zobacz wszystkie</Btn>
            </div>
            {recentRequests.length === 0 ? <p className="text-center py-8 text-slate-400">Brak oczekujących wniosków</p> :
              <div className="space-y-3">{recentRequests.map(r => {
                const emp = data.employees.find(e => e.id === r.employeeId);
                const type = requestTypes[r.type];
                return <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{type?.icon}</span>
                    <div><p className="font-semibold text-sm">{emp?.name || 'Nieznany'}</p><p className="text-xs text-slate-500">{type?.label} • {r.dateFrom}</p></div>
                  </div>
                  <Badge color={requestStatuses.PENDING.color}>{requestStatuses.PENDING.label}</Badge>
                </div>
              })}</div>}
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold mb-4" style={{ color: colors.primary.darkest }}>Szybkie akcje</h3>
            <div className="flex flex-wrap gap-3">
              <Btn icon={GridIcon} onClick={() => setPage('scheduler')}>Otwórz grafik</Btn>
              <Btn variant="secondary" icon={InboxIcon} onClick={() => setPage('requests')}>Wnioski {pendingReqs > 0 && `(${pendingReqs})`}</Btn>
              <Btn variant="secondary" icon={UsersIcon} onClick={() => setPage('employees')}>Pracownicy</Btn>
              <Btn variant="secondary" icon={RefreshIcon} onClick={data.sync} loading={data.loading}>Synchronizuj</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Employees Component
const Employees = ({ data }) => {
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ name: '', code: '', position: 'KIT', hoursContract: 40 });

  const filtered = data.employees.filter(e => e.name.toLowerCase().includes(filter.toLowerCase()) || e.code.toLowerCase().includes(filter.toLowerCase()));

  const openAdd = () => { setEdit(null); setForm({ name: '', code: '', position: 'KIT', hoursContract: 40 }); setModal(true); };
  const openEdit = e => { setEdit(e); setForm({ ...e }); setModal(true); };
  const handleSave = () => {
    if (!form.name || !form.code) { data.show('Wypełnij wymagane pola', 'error'); return; }
    if (edit) { data.setEmployees(p => p.map(e => e.id === edit.id ? { ...e, ...form } : e)); data.show('Zaktualizowano'); }
    else { data.setEmployees(p => [...p, { ...form, id: Date.now() }]); data.show('Dodano pracownika'); }
    setModal(false);
  };
  const handleDel = e => { data.setEmployees(p => p.filter(x => x.id !== e.id)); data.show('Usunięto'); setDel(null); };

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Pracownicy" subtitle="Zarządzanie zespołem">
        <Input placeholder="Szukaj..." value={filter} onChange={setFilter} />
        <Btn icon={PlusIcon} onClick={openAdd}>Dodaj pracownika</Btn>
      </Header>
      <div className="flex-1 p-8 overflow-y-auto">
        {filtered.length === 0 ? <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-100"><p className="text-slate-400">{data.employees.length === 0 ? 'Brak pracowników. Dodaj pierwszego!' : 'Nie znaleziono'}</p></div> :
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(e => <div key={e.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-all">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold" style={{ backgroundColor: posColors[e.position] }}>{e.code?.slice(0, 2)}</div>
                  <div><p className="font-bold">{e.name}</p><p className="text-sm text-slate-500">{e.code}</p></div>
                </div>
                <Badge color={posColors[e.position]}>{e.position}</Badge>
              </div>
              <div className="mt-4 pt-4 border-t flex items-center justify-between">
                <div className="text-sm text-slate-500"><p>{posNames[e.position]}</p><p>{e.hoursContract}h/tyg.</p></div>
                <div className="flex gap-2"><Btn variant="ghost" size="sm" icon={EditIcon} onClick={() => openEdit(e)} /><Btn variant="ghost" size="sm" icon={TrashIcon} onClick={() => setDel(e)} /></div>
              </div>
            </div>)}
          </div>}
      </div>
      <Modal isOpen={modal} onClose={() => setModal(false)} title={edit ? 'Edytuj pracownika' : 'Dodaj pracownika'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Imię i nazwisko *" value={form.name} onChange={v => setForm({ ...form, name: v })} />
            <Input label="Kod *" value={form.code} onChange={v => setForm({ ...form, code: v.toUpperCase() })} maxLength={4} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Stanowisko" value={form.position} onChange={v => setForm({ ...form, position: v })} options={Object.entries(posNames).map(([c, n]) => ({ value: c, label: `${c} - ${n}` }))} />
            <Input label="Godziny/tyg." type="number" value={form.hoursContract} onChange={v => setForm({ ...form, hoursContract: +v || 0 })} />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t"><Btn variant="secondary" onClick={() => setModal(false)}>Anuluj</Btn><Btn onClick={handleSave}>{edit ? 'Zapisz' : 'Dodaj'}</Btn></div>
        </div>
      </Modal>
      <Confirm isOpen={!!del} onClose={() => setDel(null)} onConfirm={() => handleDel(del)} title="Usuń pracownika" message={`Usunąć "${del?.name}"?`} danger />
    </div>
  );
};

// Settings Component
const SettingsPage = ({ data, logout }) => {
  const handleClear = () => {
    if (confirm('Wyczyścić wszystkie dane lokalne?')) {
      store.del('employees'); store.del('centers'); store.del('requests');
      data.setEmployees([]); data.setCenters([]); data.setRequests([]);
      data.show('Wyczyszczono dane');
    }
  };

  const addSampleData = () => {
    if (data.employees.length === 0) {
      data.setEmployees([
        { id: 1, name: 'Anna Kowalska', code: 'AKOW', position: 'CAS', hoursContract: 40 },
        { id: 2, name: 'Jan Nowak', code: 'JNOW', position: 'KIT', hoursContract: 40 },
        { id: 3, name: 'Maria Wiśniewska', code: 'MWIS', position: 'SUP', hoursContract: 30 },
        { id: 4, name: 'Piotr Zieliński', code: 'PZIE', position: 'RUN', hoursContract: 40 },
        { id: 5, name: 'Katarzyna Dąbrowska', code: 'KDAB', position: 'MGR', hoursContract: 40 },
        { id: 6, name: 'Tomasz Lewandowski', code: 'TLEW', position: 'TRN', hoursContract: 20 }
      ]);
    }
    data.setRequests(prev => [
      { id: Date.now() + 1, employeeId: 1, type: 'VACATION', dateFrom: '2025-02-10', dateTo: '2025-02-14', status: 'PENDING', note: 'Urlop zimowy', createdAt: new Date().toISOString() },
      { id: Date.now() + 2, employeeId: 2, type: 'OFF', dateFrom: '2025-02-05', dateTo: '2025-02-05', status: 'APPROVED', note: 'Sprawy rodzinne', createdAt: new Date().toISOString() },
      { id: Date.now() + 3, employeeId: 3, type: 'PREFER_MORNING', dateFrom: '2025-02-03', dateTo: '2025-02-07', status: 'PENDING', note: 'Dziecko do szkoły', createdAt: new Date().toISOString() },
      ...prev
    ]);
    if (data.centers.length === 0) {
      data.setCenters([{ id: 1, name: 'Popeyes PLK Centrum', address: 'ul. Marszałkowska 100, Warszawa', manager: 'Katarzyna Dąbrowska' }]);
    }
    data.show('Dodano dane demo');
  };

  return (
    <div className="flex-1 flex flex-col">
      <Header title="Ustawienia" subtitle="Konfiguracja" />
      <div className="flex-1 p-8 space-y-6 overflow-y-auto">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-4">Synchronizacja</h3>
          <p className="text-sm text-slate-500 mb-4">API: {API_URL}</p>
          <Btn icon={RefreshIcon} onClick={data.sync} loading={data.loading}>Synchronizuj</Btn>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-4">Dane lokalne</h3>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <div className="p-4 rounded-xl bg-blue-50"><p className="text-2xl font-bold text-blue-600">{data.employees.length}</p><p className="text-sm text-blue-700">Pracownicy</p></div>
            <div className="p-4 rounded-xl bg-purple-50"><p className="text-2xl font-bold text-purple-600">{data.centers.length}</p><p className="text-sm text-purple-700">Centra</p></div>
            <div className="p-4 rounded-xl bg-orange-50"><p className="text-2xl font-bold text-orange-600">{data.requests.length}</p><p className="text-sm text-orange-700">Wnioski</p></div>
            <div className="p-4 rounded-xl bg-green-50"><p className="text-2xl font-bold text-green-600">{data.shifts.length}</p><p className="text-sm text-green-700">Zmiany</p></div>
          </div>
          <Btn variant="danger" onClick={handleClear}>Wyczyść dane</Btn>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-4">Demo</h3>
          <Btn variant="secondary" onClick={addSampleData}>Dodaj dane demo</Btn>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold mb-4">Sesja</h3>
          <Btn variant="secondary" icon={LogoutIcon} onClick={logout}>Wyloguj</Btn>
        </div>
        <p className="text-center text-sm text-slate-400">REX Cloud Admin v2.0 © 2025</p>
      </div>
    </div>
  );
};

// Placeholder components for other pages
const Scheduler = ({ data }) => (
  <div className="flex-1 flex flex-col">
    <Header title="Grafik tygodniowy" subtitle="Układanie zmian">
      <Btn variant="secondary" icon={RefreshIcon} onClick={data.sync} loading={data.loading}>Odśwież</Btn>
    </Header>
    <div className="flex-1 p-8"><div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-100"><p className="text-slate-400">Grafik dostępny w pełnej wersji. Obecnie: {data.shifts.length} zmian, {data.employees.length} pracowników.</p></div></div>
  </div>
);

const Requests = ({ data }) => {
  const handleStatus = (req, status) => {
    data.setRequests(prev => prev.map(r => r.id === req.id ? { ...r, status } : r));
    data.show(status === 'APPROVED' ? 'Zatwierdzono' : 'Odrzucono');
  };
  const pending = data.requests.filter(r => r.status === 'PENDING');
  
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Wnioski" subtitle="Zarządzanie wnioskami" />
      <div className="flex-1 p-8 overflow-y-auto">
        {data.requests.length === 0 ? <div className="bg-white rounded-2xl p-12 text-center shadow-sm border"><p className="text-slate-400">Brak wniosków</p></div> :
          <div className="space-y-4">{data.requests.map(r => {
            const emp = data.employees.find(e => e.id === r.employeeId);
            const type = requestTypes[r.type] || requestTypes.OTHER;
            const status = requestStatuses[r.status];
            return <div key={r.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{type.icon}</span>
                  <div>
                    <p className="font-bold">{emp?.name || 'Nieznany'}</p>
                    <p className="text-sm" style={{ color: type.color }}>{type.label}</p>
                    <p className="text-xs text-slate-500">{r.dateFrom}{r.dateTo !== r.dateFrom && ` → ${r.dateTo}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Badge color={status.color}>{status.label}</Badge>
                  {r.status === 'PENDING' && <>
                    <Btn variant="success" size="sm" icon={CheckIcon} onClick={() => handleStatus(r, 'APPROVED')}>OK</Btn>
                    <Btn variant="danger" size="sm" icon={XIcon} onClick={() => handleStatus(r, 'REJECTED')}>Nie</Btn>
                  </>}
                </div>
              </div>
              {r.note && <p className="mt-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-xl">{r.note}</p>}
            </div>
          })}</div>}
      </div>
    </div>
  );
};

const Shifts = ({ data }) => (
  <div className="flex-1 flex flex-col">
    <Header title="Zmiany" subtitle="Lista zmian"><Btn variant="secondary" icon={RefreshIcon} onClick={data.sync} loading={data.loading}>Odśwież</Btn></Header>
    <div className="flex-1 p-8"><div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      {data.shifts.length === 0 ? <p className="text-center py-12 text-slate-400">Brak zmian</p> :
        <table className="w-full"><thead><tr className="bg-slate-50 border-b"><th className="text-left px-6 py-4 text-xs font-semibold uppercase text-slate-500">Data</th><th className="text-left px-6 py-4 text-xs font-semibold uppercase text-slate-500">Godziny</th><th className="text-left px-6 py-4 text-xs font-semibold uppercase text-slate-500">Stanowisko</th><th className="text-left px-6 py-4 text-xs font-semibold uppercase text-slate-500">Pracownik</th></tr></thead>
        <tbody>{data.shifts.slice(0, 20).map((s, i) => <tr key={i} className="border-b hover:bg-slate-50"><td className="px-6 py-4 font-semibold">{s.date}</td><td className="px-6 py-4">{s.startTime}-{s.endTime}</td><td className="px-6 py-4"><Badge color={posColors[s.position]}>{s.position}</Badge></td><td className="px-6 py-4">{s.employeeName || '-'}</td></tr>)}</tbody></table>}
    </div></div>
  </div>
);

const Centers = ({ data }) => (
  <div className="flex-1 flex flex-col">
    <Header title="Centra" subtitle="Lokalizacje" />
    <div className="flex-1 p-8">{data.centers.length === 0 ? <div className="bg-white rounded-2xl p-12 text-center shadow-sm border"><p className="text-slate-400">Brak centrów</p></div> :
      <div className="grid grid-cols-3 gap-4">{data.centers.map(c => <div key={c.id} className="bg-white rounded-2xl p-5 shadow-sm border"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-xl bg-blue-500 flex items-center justify-center text-white"><BuildingIcon /></div><div><p className="font-bold">{c.name}</p>{c.address && <p className="text-sm text-slate-500">{c.address}</p>}</div></div></div>)}</div>}</div>
  </div>
);

const Time = ({ data }) => {
  const calcH = (st, et) => { const [sh, sm] = st.split(':').map(Number), [eh, em] = et.split(':').map(Number); let h = eh - sh + (em - sm) / 60; return h < 0 ? h + 24 : h; };
  const totalH = data.shifts.reduce((a, s) => a + calcH(s.startTime, s.endTime), 0);
  return (
    <div className="flex-1 flex flex-col">
      <Header title="Ewidencja" subtitle="Godziny pracy" />
      <div className="flex-1 p-8 space-y-6">
        <div className="grid grid-cols-3 gap-6">
          <StatCard label="Suma godzin" value={`${totalH.toFixed(1)}h`} icon={ClockIcon} color="#3b82f6" />
          <StatCard label="Zmian" value={data.shifts.length} icon={CalendarIcon} color="#f97316" />
          <StatCard label="Pracowników" value={data.employees.length} icon={UsersIcon} color="#8b5cf6" />
        </div>
      </div>
    </div>
  );
};

// Main App
export default function App() {
  const [user, setUser] = useState(() => store.get('user', null));
  const [page, setPage] = useState('dashboard');
  const data = useData();

  const logout = () => { store.del('user'); setUser(null); setPage('dashboard'); };

  if (!user) return <Login onLogin={setUser} />;

  const pages = {
    dashboard: <Dashboard data={data} setPage={setPage} />,
    scheduler: <Scheduler data={data} />,
    requests: <Requests data={data} />,
    shifts: <Shifts data={data} />,
    employees: <Employees data={data} />,
    centers: <Centers data={data} />,
    time: <Time data={data} />,
    settings: <SettingsPage data={data} logout={logout} />
  };

  return (
    <div className="flex h-screen" style={{ backgroundColor: '#f8fafc' }}>
      <Sidebar page={page} setPage={setPage} user={user} logout={logout} pendingRequests={data.pendingRequests} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">{pages[page] || pages.dashboard}</div>
      </div>
      {data.toast && <Toast message={data.toast.message} type={data.toast.type} onClose={() => data.setToast(null)} />}
    </div>
  );
}
