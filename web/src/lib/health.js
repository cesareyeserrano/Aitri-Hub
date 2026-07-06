/**
 * Module: web/src/lib/health
 * Purpose: Shared health-score + grade derivation. Single source so the overview
 *          card (ProjectCard) and the QA-Workspace Summary tab show the SAME
 *          value for the same collected record (FR-054 AC-1).
 */

/**
 * Derive a 0–100 health score from a collected project record.
 * @param {object} project - A dashboard.json project record.
 * @returns {number}
 */
export function healthScore(project) {
  const approved = project.aitriState?.approvedPhases?.length ?? 0;
  const pipeline = Math.min(40, approved * 8);
  const ts = project.testSummary;
  const testPts = ts?.available && ts.total > 0 ? Math.round((ts.passed / ts.total) * 30) : 0;
  const hasBlocking = (project.alerts ?? []).some(a => a.severity === 'blocking');
  const blockPts = hasBlocking ? 0 : 20;
  const cs = project.complianceSummary;
  const compPts = cs?.available
    ? cs.overallStatus === 'compliant'
      ? 10
      : cs.overallStatus === 'partial'
        ? 5
        : 0
    : 0;
  return Math.min(100, pipeline + testPts + blockPts + compPts);
}

/**
 * Map a score to a letter grade + color token.
 * @param {number} score
 * @returns {{label:string, color:string}}
 */
export function scoreGrade(score) {
  if (score >= 90) return { label: 'A', color: 'var(--syn-green)' };
  if (score >= 75) return { label: 'B', color: 'var(--syn-teal)' };
  if (score >= 55) return { label: 'C', color: 'var(--syn-yellow)' };
  if (score >= 35) return { label: 'D', color: 'var(--syn-orange)' };
  return { label: 'F', color: 'var(--syn-red)' };
}
