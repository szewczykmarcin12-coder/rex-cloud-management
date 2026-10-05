import { api } from './api.js';
// ── Publikacja miesiąca z bramką zgodności: 409 compliance → dialog (ComplianceGate w App) → publikacja z uzasadnieniem ──
let __complianceHandler = null;
export const setComplianceHandler = (fn) => { __complianceHandler = fn; };
export const publikujMiesiac = async (ym) => {
  const r = await api('/schedule?action=publish', 'POST', { month: ym });
  if (r && !r.success && r.compliance && Array.isArray(r.violations) && __complianceHandler) {
    return new Promise((resolve) => __complianceHandler({
      ym, violations: r.violations, summary: r.summary || {}, error: r.error,
      retry: async (reason) => resolve(await api('/schedule?action=publish', 'POST', { month: ym, force: true, reason })),
      cancel: () => resolve(r),
    }));
  }
  return r;
};

// ── Zmiana mimo dyspozycji „nie mogę”: 409 { dyspozycja:true } → dialog (DyspoGate w App) → ponowienie z mimoDyspozycji ──
let __dyspoHandler = null;
export const setDyspoHandler = (fn) => { __dyspoHandler = fn; };
export const potwierdzDyspozycje = (info) => new Promise((resolve) => { if (!__dyspoHandler) return resolve(null); __dyspoHandler({ ...info, resolve }); });
