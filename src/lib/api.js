// ── Klient API i sesja Studio (wspólne dla wszystkich widoków) ──
export const API_BASE = String(import.meta.env.VITE_API_BASE || 'https://rex-cloud-backend.vercel.app/api').replace(/\/$/, '');
export const HUB_URL = String(import.meta.env.VITE_HUB_URL || 'https://rex-cloud-app.vercel.app');

export const store = {
  get: (k, d = null) => { try { const v = localStorage.getItem('rex_admin_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('rex_admin_' + k, JSON.stringify(v)); } catch {} },
  del: (k) => { try { localStorage.removeItem('rex_admin_' + k); } catch {} }
};

export const api = async (path, method = 'GET', body = null) => {
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

