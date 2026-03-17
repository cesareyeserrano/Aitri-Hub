/**
 * Module: alerts/engine
 * Purpose: Pure function — evaluate alert rules against collected project data.
 * Dependencies: constants, node:child_process
 */

import { execFileSync } from 'node:child_process';
import { ALERT_TYPE, SEVERITY, STALE_HOURS } from '../constants.js';

/**
 * Module-level cache for the installed Aitri CLI version.
 * undefined = not yet fetched; null = unavailable; string = version.
 * Set to undefined by default so the first call triggers the subprocess.
 */
let _installedAitriVersion = undefined;

/**
 * Probe the installed Aitri CLI version once per process lifetime.
 * Result is cached at module scope — subsequent calls return the cached value.
 * Returns null on any error (CLI not installed, timeout, parse failure).
 *
 * @aitri-trace FR-ID: FR-014, US-ID: US-014, AC-ID: AC-028, TC-ID: TC-014e, TC-014e2
 *
 * @returns {string | null}
 */
function getInstalledAitriVersion() {
  if (_installedAitriVersion !== undefined) return _installedAitriVersion;
  try {
    const out = execFileSync('aitri', ['--version'], { encoding: 'utf8', timeout: 3000 });
    const match = out.match(/v?(\d+\.\d+\.\d+)/);
    _installedAitriVersion = match ? match[1] : null;
  } catch {
    _installedAitriVersion = null;
  }
  return _installedAitriVersion;
}

/**
 * Test-only: reset the installed version cache so the next call re-probes the CLI.
 * Do NOT call in production code.
 */
export function _resetVersionCache() {
  _installedAitriVersion = undefined;
}

/**
 * Test-only: pre-set the installed version cache to a specific value.
 * Use null to simulate "CLI not installed". Do NOT call in production code.
 *
 * @param {string | null} version
 */
export function _setVersionCache(version) {
  _installedAitriVersion = version;
}

/**
 * Evaluate all alert rules for a single project's collected data.
 * This is a pure function: same input always produces same output.
 * Returns an empty array for healthy projects.
 *
 * @aitri-trace FR-ID: FR-007, FR-014, US-ID: US-007, US-014, AC-ID: AC-011, AC-027, TC-ID: TC-007h, TC-014h
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

  // Rule 7: VERSION_MISMATCH — project was initialized with a different Aitri version.
  // Only fires when both the project version and the installed CLI version are known and differ.
  const projectVersion   = data.aitriState?.aitriVersion ?? null;
  const installedVersion = getInstalledAitriVersion();
  if (
    projectVersion   !== null &&
    installedVersion !== null &&
    projectVersion   !== installedVersion
  ) {
    alerts.push({
      type:     ALERT_TYPE.VERSION_MISMATCH,
      message:  `Aitri version mismatch: project ${projectVersion}, CLI ${installedVersion}`,
      severity: SEVERITY.WARNING,
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
