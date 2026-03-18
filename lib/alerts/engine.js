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
      type:     ALERT_TYPE.STALE,
      message:  `No commits in ${hours}h`,
      severity: SEVERITY.WARNING,
      command:  null,
    });
  }

  // Rule 2: Verify failed — verifyPassed is explicitly false.
  if (
    data.aitriState &&
    (data.aitriState.verifyPassed === false ||
      (data.aitriState.verifySummary && data.aitriState.verifySummary.failed > 0))
  ) {
    alerts.push({
      type:     ALERT_TYPE.VERIFY_FAILED,
      message:  'Verify failed',
      severity: SEVERITY.BLOCKING,
      command:  'aitri verify-run',
    });
  }

  // Rule 3: Artifact drift detected — artifact was modified after phase approval.
  if (data.aitriState?.hasDrift === true) {
    const driftPhases = data.aitriState.driftPhases ?? [];
    const phase = driftPhases.length > 0 ? driftPhases[0] : null;
    alerts.push({
      type:     ALERT_TYPE.DRIFT,
      message:  'Artifact drift detected',
      severity: SEVERITY.BLOCKING,
      command:  phase !== null ? `aitri run-phase ${phase}` : 'aitri run-phase <phase>',
    });
  }

  // Rule 4: Test failures in 04_TEST_RESULTS.json.
  if (data.testSummary?.available === true && data.testSummary.failed > 0) {
    alerts.push({
      type:     ALERT_TYPE.TESTS_FAILING,
      message:  `Tests failing (${data.testSummary.failed})`,
      severity: SEVERITY.BLOCKING,
      command:  'aitri verify-run',
    });
  }

  // Rule 5: Remote cache stale (set by git-reader on pull failure).
  if (data.cacheStale === true && !data.rateLimited) {
    alerts.push({
      type:     ALERT_TYPE.CACHE_STALE,
      message:  'Cache stale (pull failed)',
      severity: SEVERITY.WARNING,
      command:  null,
    });
  }

  // Rule 5b: GitHub rate-limited — Hub is backing off for up to 5 minutes.
  if (data.rateLimited === true) {
    alerts.push({
      type:     ALERT_TYPE.RATE_LIMITED,
      message:  'GitHub rate-limited — data may be stale (retry in ~5 min)',
      severity: SEVERITY.WARNING,
      command:  null,
    });
  }

  // Rule 6: Compliance not fully compliant (Phase 5 approved and artifact available).
  if (
    data.complianceSummary?.available === true &&
    data.complianceSummary.overallStatus !== 'compliant'
  ) {
    const status = data.complianceSummary.overallStatus;
    alerts.push({
      type:     ALERT_TYPE.COMPLIANCE_PARTIAL,
      message:  `Compliance ${status}`,
      severity: SEVERITY.BLOCKING,
      command:  'aitri run-phase 5',
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
      command:  'aitri adopt --upgrade',
    });
  }

  // Rule 8: REJECTION_RECENT — a phase was rejected in the last 7 days.
  const events = data.aitriState?.events ?? [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentRejection = events.find(e => {
    if (e.type !== 'rejected') return false;
    const ts = new Date(e.timestamp ?? e.at ?? 0).getTime();
    return ts > sevenDaysAgo;
  });
  if (recentRejection) {
    const phase = recentRejection.phase ?? recentRejection.phaseId ?? null;
    alerts.push({
      type:     ALERT_TYPE.REJECTION_RECENT,
      message:  phase !== null ? `Phase ${phase} rejected recently` : 'Phase rejected recently',
      severity: SEVERITY.WARNING,
      command:  'aitri status',
    });
  }

  // ── Git practice rules ──────────────────────────────────────────

  // Rule 9: ENV file in git history — secret exposure risk.
  if (data.gitMeta?.envFileCommitted) {
    alerts.push({
      type:     ALERT_TYPE.ENV_FILE_COMMITTED,
      message:  `Sensitive file committed: ${data.gitMeta.envFileCommitted}`,
      severity: SEVERITY.BLOCKING,
      command:  'git filter-repo or BFG to remove from history',
    });
  }

  // Rule 10: Secret-like pattern in a recent commit message.
  if (data.gitMeta?.secretInCommit) {
    alerts.push({
      type:     ALERT_TYPE.SECRET_IN_COMMIT,
      message:  `Possible secret in commit message: "${data.gitMeta.secretInCommit}"`,
      severity: SEVERITY.BLOCKING,
      command:  'git log -20 --format="%s"',
    });
  }

  // Rule 11: All commits directly to main — no branching/PR pattern detected.
  if (data.gitMeta?.noBranchPattern === true && (data.gitMeta?.commitVelocity7d ?? 0) > 0) {
    alerts.push({
      type:     ALERT_TYPE.NO_BRANCH_PATTERN,
      message:  'All commits go directly to main — no branches or PRs detected',
      severity: SEVERITY.WARNING,
      command:  null,
    });
  }

  // ── Test quality rules ──────────────────────────────────────────

  // Rule 12: MUST FRs with no test coverage.
  if (data.testSummary?.available === true && Array.isArray(data.testSummary.frCoverage)) {
    const uncovered = data.testSummary.frCoverage.filter(
      fr => fr.status === 'missing' || fr.status === 'none'
    );
    if (uncovered.length > 0) {
      const ids = uncovered.slice(0, 3).map(fr => fr.frId).join(', ');
      const more = uncovered.length > 3 ? ` +${uncovered.length - 3} more` : '';
      alerts.push({
        type:     ALERT_TYPE.FR_COVERAGE_GAP,
        message:  `${uncovered.length} FR(s) have no test coverage: ${ids}${more}`,
        severity: SEVERITY.WARNING,
        command:  'aitri run-phase 3',
      });
    }
  }

  // Rule 13: High skip rate — more than 20% of tests skipped.
  if (data.testSummary?.available === true) {
    const { total = 0, passed = 0, failed = 0 } = data.testSummary;
    const skipped = total - passed - failed;
    if (total > 0 && skipped / total > 0.2) {
      alerts.push({
        type:     ALERT_TYPE.HIGH_SKIP_RATE,
        message:  `${skipped}/${total} tests skipped (${Math.round((skipped / total) * 100)}%)`,
        severity: SEVERITY.WARNING,
        command:  'aitri verify-run',
      });
    }
  }

  // Rule 14: Phase 4 approved but no test results file available.
  if (
    data.aitriState?.approvedPhases?.includes(4) &&
    data.testSummary?.available !== true
  ) {
    alerts.push({
      type:     ALERT_TYPE.MISSING_TEST_RESULTS,
      message:  'Phase 4 approved but no test results found (04_TEST_RESULTS.json)',
      severity: SEVERITY.WARNING,
      command:  'aitri verify-run',
    });
  }

  // ── Spec quality rules ──────────────────────────────────────────

  // Rule 15: Placeholder content detected in spec artifacts.
  if (data.specQuality?.hasPlaceholders === true) {
    const files = data.specQuality.files.join(', ');
    alerts.push({
      type:     ALERT_TYPE.SPEC_PLACEHOLDERS,
      message:  `Placeholder content found in: ${files}`,
      severity: SEVERITY.WARNING,
      command:  null,
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
  if (alerts.some(a => a.severity === SEVERITY.BLOCKING)) return 'error';
  if (alerts.some(a => a.severity === SEVERITY.WARNING)) return 'warning';
  return 'healthy';
}
