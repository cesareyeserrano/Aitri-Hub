/**
 * Module: web/src/lib/qa
 * Purpose: Pure QA-Workspace helpers (FR-020/021) — test-case grouping and
 *          filtering, and File → evidence encoding. No React/I-O in the pure fns
 *          (fileToEvidence uses the browser FileReader), so filters are unit-testable.
 *
 * @aitri-trace FR-ID: FR-020, US-ID: US-020, AC-ID: AC-020-1, AC-020-2, TC-ID: TC-020h
 */

/** 'manual' | 'auto' for a case row. */
export function caseType(c) {
  return c && c.automation === 'manual' ? 'manual' : 'auto';
}

/**
 * Filter cases by type (manual/auto/all), status (all|passed|failed|pending|…) and FR.
 * @param {object[]} cases
 * @param {{ type?:string, status?:string, fr?:string }} filters
 * @returns {object[]}
 */
export function applyCaseFilters(cases, filters = {}) {
  const { type = 'all', status = 'all', fr = 'all' } = filters;
  return (cases || []).filter((c) => {
    if (type !== 'all' && caseType(c) !== type) return false;
    if (status !== 'all' && (c.status ?? 'pending') !== status) return false;
    if (fr !== 'all' && !(c.requirement_id ?? '').split(',').includes(fr)) return false;
    return true;
  });
}

/**
 * Group cases by their requirement id (the closest per-scope grouping the case
 * rows carry; the feature axis is the scope selector). Returns ordered groups.
 * @param {object[]} cases
 * @returns {Array<{ key:string, cases:object[] }>}
 */
export function groupCasesByFr(cases) {
  const map = new Map();
  for (const c of cases || []) {
    const key = (c.requirement_id ?? '').split(',')[0] || 'unassigned';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, cs]) => ({ key, cases: cs }));
}

/** Distinct FR ids present across the cases (for the FR filter). */
export function frOptions(cases) {
  return [...new Set((cases || []).flatMap((c) => (c.requirement_id ? c.requirement_id.split(',') : [])))].sort();
}

/**
 * Read a File into an evidence payload ({ mime, base64, filename }) for upload.
 * @param {File} file
 * @returns {Promise<{ mime:string, base64:string, filename:string }>}
 */
export function fileToEvidence(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('could not read file'));
    reader.onload = () => {
      const res = String(reader.result);
      const base64 = res.includes(',') ? res.slice(res.indexOf(',') + 1) : res;
      resolve({ mime: file.type, base64, filename: file.name });
    };
    reader.readAsDataURL(file);
  });
}

/** Client-side evidence guard mirroring the server (NFR-010) — fail fast before upload. */
export const EVIDENCE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

/** @returns {string|null} an error message when the file is not acceptable, else null. */
export function evidenceError(file) {
  if (!file) return null;
  if (!EVIDENCE_TYPES.includes(file.type)) return 'Only PNG/JPG/GIF/WebP/SVG up to 5MB';
  if (file.size > EVIDENCE_MAX_BYTES) return 'Only PNG/JPG/GIF/WebP/SVG up to 5MB';
  return null;
}
