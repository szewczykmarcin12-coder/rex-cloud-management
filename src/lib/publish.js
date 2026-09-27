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
