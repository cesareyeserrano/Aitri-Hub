/**
 * Module: web/src/lib/monitor
 * Purpose: Pure derivations for the v0.3.0 Monitor redesign — urgency ranking,
 *          bento layout (CRITICAL spans 2 columns, worst-first order), signal-first
 *          card model (6 tiles with N/A guards), health filter, and refresh handling.
 *          No React, no I/O — unit-testable. Operates on the REAL dashboard.json
 *          project record shape (aitriState nested, testSummary, externalSignals, health).
 */

/** Urgency ranks — lower sorts first. NOMINAL is named 'healthy' to match the snapshot's status vocabulary. */
export const URGENCY_RANK = Object.freeze({ critical: 0, at_risk: 1, healthy: 2 });

/** Map the snapshot's derived status → urgency rank name. */
function statusToUrgency(status) {
  if (status === 'error' || status === 'unreadable') return 'critical';
  if (status === 'warning') return 'at_risk';
  return 'healthy';
}

/**
 * Urgency of a project. Test fixtures may set `.health` directly (critical|at_risk|healthy);
 * real records carry `.status` (healthy|warning|error|unreadable) which we map.
 * @aitri-trace FR-ID: FR-010, US-ID: US-010, AC-ID: AC-010-1, TC-ID: TC-010h
 */
export function urgencyOf(project) {
  if (project && URGENCY_RANK[project.health] !== undefined) return project.health;
  return statusToUrgency(project && project.status);
}

/**
 * Build the bento layout: worst-first order (critical < at_risk < healthy), stable within a rank,
 * CRITICAL cards span 2 grid columns, all others span 1.
 * @aitri-trace FR-ID: FR-010, US-ID: US-010, AC-ID: AC-010-1, TC-ID: TC-010h
 */
export function buildMonitorLayout(projects) {
  const withRank = (projects || []).map((p, i) => ({
    project: p,
    urgency: urgencyOf(p),
    _i: i,
  }));
  withRank.sort((a, b) => {
    const ra = URGENCY_RANK[a.urgency] ?? 99;
    const rb = URGENCY_RANK[b.urgency] ?? 99;
    return ra !== rb ? ra - rb : a._i - b._i;
  });
  return withRank.map(({ project, urgency }) => ({
    ...project,
    urgency,
    gridColumnSpan: urgency === 'critical' ? 2 : 1,
  }));
}

const FILTER_TO_URGENCY = Object.freeze({
  CRITICAL: 'critical',
  'AT RISK': 'at_risk',
  NOMINAL: 'healthy',
});

/**
 * Narrow projects by health filter. 'ALL' returns all; an unmatched filter returns [].
 * @aitri-trace FR-ID: FR-010, US-ID: US-010, AC-ID: AC-010-2, TC-ID: TC-010f
 */
export function applyFilter(projects, filter) {
  if (!filter || filter === 'ALL') return [...(projects || [])];
  const target = FILTER_TO_URGENCY[filter];
  if (!target) return [];
  return (projects || []).filter((p) => urgencyOf(p) === target);
}

/** Count of projects matching a filter (for the filter-bar count). */
export function filterBarCount(projects, filter) {
  return applyFilter(projects, filter).length;
}

const SEVERITY_ORDER = Object.freeze({ blocking: 0, critical: 0, error: 0, warn: 1, warning: 1, info: 2 });

/**
 * Pick the single highest-severity issue message from a list of alerts/issues.
 * Accepts both the alert shape `{severity, message}` (real dashboard.json) and the
 * legacy `{level, msg}` shape. Critical/blocking outranks warning.
 * @aitri-trace FR-ID: FR-011, US-ID: US-011, AC-ID: AC-011-3, TC-ID: TC-011e
 */
export function pickTopIssue(issues) {
  const list = (issues || []).slice();
  if (list.length === 0) return null;
  const sev = (x) => SEVERITY_ORDER[x.severity ?? x.level] ?? 9;
  list.sort((a, b) => sev(a) - sev(b));
  const top = list[0];
  return top.message ?? top.msg ?? null;
}

/** A tile value or 'N/A' when the underlying datum is absent (never a misleading 0). */
function tileValue(datum, render) {
  return datum === null || datum === undefined ? 'N/A' : render(datum);
}

/**
 * Build the signal-first card view-model: readable name, urgency badge, pipeline fill,
 * exactly 6 signal tiles (Tests, Drift, Verify, Pending, Signals, Rejections), and top issue.
 * @aitri-trace FR-ID: FR-011, US-ID: US-011, AC-ID: AC-011-1, TC-ID: TC-011h
 */
export function buildCardModel(project) {
  const st = (project && project.aitriState) || {};
  const git = (project && project.gitMeta) || {};
  const approved = Array.isArray(st.approvedPhases) ? st.approvedPhases.length : 0;
  const testSummary = project ? project.testSummary : null;
  const signals = project && project.externalSignals ? project.externalSignals : null;
  // Real records carry driftPhases[] (+ hasDrift); rejections come from lastRejection presence.
  const drift = Array.isArray(st.driftPhases) ? st.driftPhases.length : (st.hasDrift != null ? (st.hasDrift ? 1 : 0) : null);
  const rejections = st.lastRejection ? 1 : 0;
  const pending = typeof git.unpushedCommits === 'number' ? git.unpushedCommits : null;

  const tiles = [
    { key: 'Tests', value: tileValue(testSummary, (t) => `${t.passed}/${t.total}`) },
    { key: 'Drift', value: tileValue(drift, (d) => (d > 0 ? 'YES' : 'NO')) },
    { key: 'Verify', value: tileValue(st.verifySummary ?? null, (v) => (v.failed > 0 ? 'FAIL' : 'PASS')) },
    { key: 'Pending', value: tileValue(pending, (n) => String(n)) },
    { key: 'Signals', value: tileValue(signals && signals.available ? signals.signals.length : (signals ? 0 : null), (n) => String(n)) },
    { key: 'Rejections', value: String(rejections) },
  ];

  return {
    id: project && project.id,
    name: (st.projectName || (project && project.name)) ?? '',
    urgency: urgencyOf(project),
    pipeline: { filled: approved, total: 5 },
    tiles,
    // Real issues live in project.alerts ({type,message,severity,command}), not health.
    topIssue: pickTopIssue(project && project.alerts),
  };
}

/**
 * Refresh handling: on a successful read, adopt the new snapshot (not stale). On a failed/stale
 * read, keep the previously-rendered projects and flag stale — never blank the grid.
 * @aitri-trace FR-ID: FR-024, US-ID: US-024, AC-ID: AC-024-2, TC-ID: TC-024f
 */
export function applyRefresh(prev, result) {
  if (result && result.ok) {
    return { projects: result.projects || [], stale: false };
  }
  return { projects: (prev && prev.projects) || [], stale: true };
}
