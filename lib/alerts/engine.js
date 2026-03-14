/**
 * Module: alerts/engine
 * Purpose: Pure function — evaluate alert rules against collected project data.
 * Dependencies: constants
 */

import { ALERT_TYPE, SEVERITY, STALE_HOURS } from '../constants.js';

/**
 * Evaluate all alert rules for a single project's collected data.
 * This is a pure function: same input always produces same output.
 * Returns an empty array for healthy projects.
 *
 * @aitri-trace FR-ID: FR-007, US-ID: US-007, AC-ID: AC-011, TC-ID: TC-007h
 *
 * @param {ProjectData} data - Collected data for one project.
 * @returns {Alert[]}
 */
export function evaluateAlerts(data) {
  const alerts = [];

  // Rule 1: Stale — no commits beyond threshold.
  if (
    data.gitMeta?.isGitRepo === true &&
    data.gitMeta?.lastCommitAgeHours !== null &&
    data.gitMeta.lastCommitAgeHours > STALE_HOURS
  ) {
    const hours = Math.round(data.gitMeta.lastCommitAgeHours);
    alerts.push({
      type: ALERT_TYPE.STALE,
      message: `No commits in ${hours}h`,
      severity: SEVERITY.WARNING,
    });
  }

  // Rule 2: Verify failed — verifyPassed is explicitly false.
  if (
    data.aitriState &&
    (data.aitriState.verifyPassed === false ||
      (data.aitriState.verifySummary && data.aitriState.verifySummary.failed > 0))
  ) {
    alerts.push({
      type: ALERT_TYPE.VERIFY_FAILED,
      message: 'Verify failed',
      severity: SEVERITY.ERROR,
    });
  }

  // Rule 3: Artifact drift detected.
  if (data.aitriState?.hasDrift === true) {
    alerts.push({
      type: ALERT_TYPE.DRIFT,
      message: 'Artifact drift detected',
      severity: SEVERITY.WARNING,
    });
  }

  // Rule 4: Test failures in 04_TEST_RESULTS.json.
  if (data.testSummary?.available === true && data.testSummary.failed > 0) {
    alerts.push({
      type: ALERT_TYPE.TESTS_FAILING,
      message: `Tests failing (${data.testSummary.failed})`,
      severity: SEVERITY.ERROR,
    });
  }

  // Rule 5: Remote cache stale (set by git-reader on pull failure).
  if (data.cacheStale === true) {
    alerts.push({
      type: ALERT_TYPE.CACHE_STALE,
      message: 'Cache stale (pull failed)',
      severity: SEVERITY.WARNING,
    });
  }

  // Rule 6: Compliance not fully compliant (Phase 5 approved and artifact available).
  if (
    data.complianceSummary?.available === true &&
    data.complianceSummary.overallStatus !== 'compliant'
  ) {
    const status = data.complianceSummary.overallStatus;
    alerts.push({
      type: ALERT_TYPE.COMPLIANCE_PARTIAL,
      message: `Compliance ${status}`,
      severity: status === 'draft' ? SEVERITY.ERROR : SEVERITY.WARNING,
    });
  }

  return alerts;
}

/**
 * Derive the project status string from its alerts array.
 *
 * @param {Alert[]} alerts
 * @returns {'healthy'|'warning'|'error'}
 */
export function deriveStatus(alerts) {
  if (alerts.some(a => a.severity === SEVERITY.ERROR)) return 'error';
  if (alerts.length > 0) return 'warning';
  return 'healthy';
}
