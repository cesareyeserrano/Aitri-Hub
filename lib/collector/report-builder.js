/**
 * Module: collector/report-builder
 * Purpose: Project a quality report on demand (FR-023) from the detail payload +
 *          QA executions for a scope (project | feature:<n> | run:<stamp>). Pure —
 *          no I/O; the caller supplies the already-read detail + executions.
 *          Never persisted (reports render live and print via the browser).
 *
 * @aitri-trace FR-ID: FR-023, US-ID: US-023, AC-ID: AC-023-1, TC-ID: TC-023h, TC-023f
 */

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

/** Tally bugs by severity, tolerating unknown/missing severities under 'low'. */
function bugsBySeverity(bugs) {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  const list = Array.isArray(bugs?.bugs) ? bugs.bugs : [];
  for (const b of list) {
    const sev = String(b.severity ?? '').toLowerCase();
    if (SEVERITIES.includes(sev)) out[sev] += 1;
    else out.low += 1;
  }
  return out;
}

/**
 * Build the report projection.
 * @param {object} args
 * @param {object} args.detail - readDetail payload (already scoped by the caller).
 * @param {object[]} [args.executions] - QA executions (filtered by the caller for run scope).
 * @param {string} args.scope - 'project' | 'feature:<name>' | 'run:<stamp>'.
 * @param {object|null} [args.record] - dashboard record (for the project header).
 * @returns {object} the report projection
 */
export function buildReport({ detail, executions = [], scope, record }) {
  const tc = detail?.testCases;
  const available = tc?.available === true;
  const summary = available && tc.summary
    ? {
        passed: tc.summary.passed ?? 0,
        failed: tc.summary.failed ?? 0,
        pending: tc.summary.pending ?? 0,
        skipped: tc.summary.skipped ?? 0,
        manual: tc.summary.manual ?? 0,
        total: Array.isArray(tc.cases) ? tc.cases.length : 0,
      }
    : { passed: 0, failed: 0, pending: 0, skipped: 0, manual: 0, total: 0 };

  const bugs = bugsBySeverity(detail?.bugs);
  const bugTotal = SEVERITIES.reduce((n, s) => n + bugs[s], 0);

  const coveragePct = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : null;
  const empty = summary.total === 0 && bugTotal === 0 && executions.length === 0;

  return {
    scope,
    project: { name: detail?.project?.name ?? record?.name ?? null, status: record?.status ?? detail?.project?.status ?? null },
    coverage: { ...summary, coveragePct },
    bugsBySeverity: bugs,
    bugsTotal: bugTotal,
    executionsCount: executions.length,
    empty,
  };
}
