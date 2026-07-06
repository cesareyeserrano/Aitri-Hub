/**
 * Module: web/src/lib/detailApi
 * Purpose: Fetch wrappers for the on-demand QA-Workspace endpoints, with
 *          loading/error shaping. The overview keeps polling dashboard.json;
 *          detail is navigation-driven (ADR-Q1).
 */

/**
 * Fetch the detail payload for a project + scope.
 * @param {string} id
 * @param {string} [scope]
 * @returns {Promise<{ok:true, payload:object} | {ok:false, status:number, error:string}>}
 */
export async function fetchDetail(id, scope) {
  const q = scope && scope !== 'product' ? `?scope=${encodeURIComponent(scope)}` : '';
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(id)}/detail${q}`, { cache: 'no-store' });
    if (!res.ok) {
      let error = `HTTP ${res.status}`;
      try {
        error = (await res.json()).error ?? error;
      } catch {
        /* non-JSON error body */
      }
      return { ok: false, status: res.status, error };
    }
    return { ok: true, payload: await res.json() };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message ?? e) };
  }
}

/**
 * Run the on-demand deploy-readiness check.
 * @param {string} id
 * @param {boolean} [refresh]
 * @returns {Promise<object>} the validate-runner result ({available, report?, reason?, fetchedAt})
 */
export async function fetchValidate(id, refresh = false) {
  const q = refresh ? '?refresh=1' : '';
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(id)}/validate${q}`, { cache: 'no-store' });
    if (!res.ok) return { available: false, reason: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { available: false, reason: String(e?.message ?? e) };
  }
}
