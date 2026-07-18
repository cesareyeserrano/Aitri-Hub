/**
 * Module: web/src/lib/detail
 * Purpose: Pure derivations for the v0.3.0 Project Detail — sidebar (nav badges +
 *          quick stats), Overview (phases, gauge, metric tiles), Health (5 fixed
 *          dimensions with remediation), Sessions (timeline + context), Alerts
 *          (aggregated). Operates on the real dashboard.json record shape.
 *          No React/I-O — unit-testable.
 */

const PHASE_LABELS = Object.freeze(['Requirements (PRD)', 'UX / Design', 'Architecture (TRD)', 'Test Cases (QA Plan)', 'Implementation']);
export const DIMENSIONS = Object.freeze(['Pipeline', 'Tests', 'Code', 'Artifacts', 'Version']);

function worst(levels) {
  if (levels.includes('CRITICAL')) return 'CRITICAL';
  if (levels.includes('WARN')) return 'WARN';
  return 'OK';
}

/**
 * Five diagnostic dimensions in fixed order, each with a badge and its issues+remediation.
 * @aitri-trace FR-ID: FR-014, US-ID: US-014, AC-ID: AC-014-1, TC-ID: TC-014h
 */
export function buildHealthPanels(project) {
  const st = (project && project.aitriState) || {};
  const git = (project && project.gitMeta) || {};
  const health = (project && project.health) || {};
  const ts = project && project.testSummary;

  const panels = [];

  // Pipeline — completed-not-approved, drift.
  const pipeIssues = [];
  const completed = Array.isArray(st.completedPhases) ? st.completedPhases : [];
  const approved = Array.isArray(st.approvedPhases) ? st.approvedPhases : [];
  const pendingApproval = completed.filter((p) => !approved.includes(p));
  if (pendingApproval.length) pipeIssues.push({ level: 'WARN', message: `phase(s) ${pendingApproval.join(', ')} completed, pending approval`, remediation: 'aitri approve <phase>' });
  const drift = Array.isArray(st.driftPhases) ? st.driftPhases : [];
  if (drift.length) pipeIssues.push({ level: 'CRITICAL', message: `artifact drift in phase(s) ${drift.join(', ')}`, remediation: 'aitri reconcile' });
  panels.push({ dimension: 'Pipeline', badge: worst(pipeIssues.map((i) => i.level)), issues: pipeIssues });

  // Tests — failing, stale, not-run.
  const testIssues = [];
  if (ts && ts.failed > 0) testIssues.push({ level: 'CRITICAL', message: `${ts.failed} test(s) failing`, remediation: 'aitri verify' });
  if (Array.isArray(health.staleVerify) && health.staleVerify.length) testIssues.push({ level: 'WARN', message: 'verify results are stale', remediation: 'aitri verify' });
  if (!ts) testIssues.push({ level: 'WARN', message: 'verify has not been run', remediation: 'aitri verify' });
  panels.push({ dimension: 'Tests', badge: worst(testIssues.map((i) => i.level)), issues: testIssues });

  // Code — unpushed, uncommitted.
  const codeIssues = [];
  if (git.unpushedCommits > 0) codeIssues.push({ level: 'WARN', message: `${git.unpushedCommits} commit(s) not pushed`, remediation: 'git push' });
  if (git.uncommittedFiles > 0) codeIssues.push({ level: 'WARN', message: `${git.uncommittedFiles} file(s) uncommitted`, remediation: 'git commit' });
  panels.push({ dimension: 'Code', badge: worst(codeIssues.map((i) => i.level)), issues: codeIssues });

  // Artifacts — rejections.
  const artIssues = [];
  if (st.lastRejection) {
    const fb = typeof st.lastRejection === 'object' ? st.lastRejection.feedback : st.lastRejection;
    artIssues.push({ level: 'CRITICAL', message: `rejected: ${fb ?? 'see feedback'}`, remediation: 'aitri run-phase <phase>' });
  }
  panels.push({ dimension: 'Artifacts', badge: worst(artIssues.map((i) => i.level)), issues: artIssues });

  // Version — project vs CLI mismatch.
  const verIssues = [];
  if (health.versionMismatch) {
    const proj = project.appVersion ?? st.aitriVersion ?? '?';
    const cli = (Array.isArray(health.deployableReasons) && health.deployableReasons.find((r) => r.type === 'version_mismatch')?.message) || `CLI differs`;
    verIssues.push({ level: 'WARN', message: cli.includes('vs') ? cli : `Project ${proj} vs CLI`, remediation: 'aitri adopt --upgrade' });
  }
  panels.push({ dimension: 'Version', badge: worst(verIssues.map((i) => i.level)), issues: verIssues });

  return panels;
}

/** Total health issues across all dimensions. */
export function healthIssueCount(project) {
  return buildHealthPanels(project).reduce((n, p) => n + p.issues.length, 0);
}

/**
 * Aggregated alerts: project.alerts (issues) + external tool signals.
 * @aitri-trace FR-ID: FR-018, US-ID: US-018, AC-ID: AC-018-1, TC-ID: TC-018h
 */
export function buildAlerts(project) {
  const alerts = Array.isArray(project && project.alerts) ? project.alerts : [];
  const sig = project && project.externalSignals;
  const signals = sig && sig.available && Array.isArray(sig.signals) ? sig.signals : [];
  const cards = [
    ...alerts.map((a) => ({ kind: 'issue', label: a.type, severity: a.severity, message: a.message, command: a.command || null })),
    ...signals.map((s) => ({ kind: 'signal', label: s.tool, severity: s.severity, message: s.message, command: s.command || null })),
  ];
  return { cards, count: cards.length, state: cards.length === 0 ? 'all-clear' : 'has-alerts' };
}

/**
 * Sidebar: section nav with per-section issue badges + quick stats.
 * @aitri-trace FR-ID: FR-012, US-ID: US-012, AC-ID: AC-012-2, TC-ID: TC-012h
 */
export function buildSidebar(project) {
  const st = (project && project.aitriState) || {};
  const git = (project && project.gitMeta) || {};
  const ts = project && project.testSummary;
  const issues = healthIssueCount(project);
  const alerts = buildAlerts(project).count;
  const rejections = st.lastRejection ? 1 : 0;
  const drift = Array.isArray(st.driftPhases) ? st.driftPhases.length : 0;
  const tests = ts ? `${ts.passed}/${ts.total}` : 'N/A';

  return {
    nav: [
      { section: 'overview', badge: 0 },
      { section: 'health', badge: issues },
      { section: 'artifacts', badge: 0 },
      { section: 'sessions', badge: 0 },
      { section: 'alerts', badge: alerts },
    ],
    quickStats: { issues, rejections, drift, tests },
  };
}

/**
 * Overview: phase pipeline (readable labels + state), test-telemetry gauge, metric tiles.
 * @aitri-trace FR-ID: FR-013, US-ID: US-013, AC-ID: AC-013-2, TC-ID: TC-013h
 */
export function buildOverview(project) {
  const st = (project && project.aitriState) || {};
  const git = (project && project.gitMeta) || {};
  const ls = (project && project.lastSession) || {};
  const ts = project && project.testSummary;
  const approved = Array.isArray(st.approvedPhases) ? st.approvedPhases : [];
  const completed = Array.isArray(st.completedPhases) ? st.completedPhases : [];
  const current = st.currentPhase;

  const phases = PHASE_LABELS.map((label, i) => {
    const n = i + 1;
    let state = 'future';
    if (approved.includes(n)) state = 'approved';
    else if (completed.includes(n)) state = 'completed-pending';
    else if (n === current) state = 'active';
    return { n, label, state };
  });

  const telemetry = ts
    ? { passed: ts.passed, failing: ts.failed, skipped: ts.skipped, total: ts.total, state: 'has-run' }
    : { state: 'no-run-yet' };
  const gauge = ts && ts.total > 0 ? { ratio: ts.passed / ts.total } : null;

  const tiles = {
    last_session: ls.at ?? null,
    agent: ls.agent ?? null,
    branch: git.branch ?? null,
    verify: ts ? `${ts.passed} passed` : 'N/A',
    pending_commits: typeof git.unpushedCommits === 'number' ? git.unpushedCommits : null,
    version: project ? project.appVersion ?? null : null,
  };

  return { phases, telemetry, gauge, tiles };
}

/**
 * Sessions: chronological lifecycle timeline (newest-first) + last-session context.
 * @aitri-trace FR-ID: FR-017, US-ID: US-017, AC-ID: AC-017-1, TC-ID: TC-017h
 */
export function buildSessions(project) {
  const st = (project && project.aitriState) || {};
  const events = Array.isArray(st.events) ? st.events : [];
  const ls = (project && project.lastSession) || st.lastSession || null;
  const timeline = events
    .slice()
    .reverse()
    .map((e) => ({ at: e.at, event: e.event, phase: e.phase, feedback: e.feedback ?? null }));
  const context = ls
    ? { description: ls.context ?? ls.description ?? null, files: ls.files_touched ?? [], agent: ls.agent ?? null }
    : null;
  return { timeline, context, state: timeline.length === 0 ? 'empty' : 'has-events' };
}
