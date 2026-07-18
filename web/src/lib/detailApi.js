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
 * Fetch one artifact's content for the reader (FR-016).
 * @param {string} id
 * @param {string} relPath - Path relative to the scope's artifact base.
 * @param {string} [scope]
 * @returns {Promise<{ok:true, content:object} | {ok:false, status:number, error:string, code?:string}>}
 */
export async function fetchArtifact(id, relPath, scope) {
  const params = new URLSearchParams({ path: relPath });
  if (scope && scope !== 'product') params.set('scope', scope);
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(id)}/artifact?${params.toString()}`, { cache: 'no-store' });
    if (!res.ok) {
      let body = {};
      try { body = await res.json(); } catch { /* non-JSON error */ }
      return { ok: false, status: res.status, error: body.error ?? `HTTP ${res.status}`, code: body.code };
    }
    return { ok: true, content: await res.json() };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message ?? e) };
  }
}

/**
 * Read QA executions for a project (optionally one test case).
 * @param {string} id
 * @param {string} [testCaseId]
 * @returns {Promise<{ok:true, executions:object[]} | {ok:false, error:string}>}
 */
export async function fetchExecutions(id, testCaseId) {
  const q = testCaseId ? `?tc=${encodeURIComponent(testCaseId)}` : '';
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(id)}/executions${q}`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.json();
    return { ok: true, executions: body.executions ?? [] };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

/**
 * Record a manual execution (result required; optional notes/environment/evidence).
 * @param {string} id
 * @param {string} testCaseId
 * @param {{result:string, notes?:string, environment?:string, evidence?:{mime:string, base64:string}}} body
 * @returns {Promise<{ok:true, execution:object} | {ok:false, status:number, error:string, code?:string}>}
 */
export async function postExecution(id, testCaseId, body) {
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(id)}/testcases/${encodeURIComponent(testCaseId)}/executions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: payload.error ?? `HTTP ${res.status}`, code: payload.code };
    return { ok: true, execution: payload.execution };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message ?? e) };
  }
}

/**
 * Set a manual test case status.
 * @returns {Promise<{ok:true, case:object} | {ok:false, status:number, error:string, code?:string}>}
 */
export async function patchStatus(id, testCaseId, status) {
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(id)}/testcases/${encodeURIComponent(testCaseId)}/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, error: payload.error ?? `HTTP ${res.status}`, code: payload.code };
    return { ok: true, case: payload.case };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message ?? e) };
  }
}

/**
 * Fetch an on-demand quality report.
 * @param {string} id
 * @param {string} scope - 'project' | 'feature:<name>' | 'run:<stamp>'
 * @returns {Promise<{ok:true, report:object} | {ok:false, error:string}>}
 */
export async function fetchReport(id, scope = 'project') {
  try {
    const res = await fetch(`/api/project/${encodeURIComponent(id)}/report?scope=${encodeURIComponent(scope)}`, { cache: 'no-store' });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.json();
    return { ok: true, report: body.report };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
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
