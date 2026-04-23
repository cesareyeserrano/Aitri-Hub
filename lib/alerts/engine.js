/**
 * Module: alerts/engine
 * Purpose: Pure rule-registry — evaluate alert rules against collected project
 *          data. Each rule is a standalone function in the RULES array; adding
 *          or removing a rule is a local edit instead of touching a monolithic
 *          function body.
 * Dependencies: constants, node:child_process
 */

import { execFileSync } from 'node:child_process';
import { ALERT_TYPE, SEVERITY, STALE_HOURS } from '../constants.js';

// ── Installed Aitri CLI version — TTL-cached ─────────────────────────────────

/**
 * undefined = not yet fetched; null = unavailable; string = version.
 * Cache is refreshed once per CACHE_TTL_MS so a CLI upgrade is picked up by a
 * long-running aitri-hub web without requiring a process restart.
 */
let _installedAitriVersion = undefined;
let _installedAitriVersionAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getInstalledAitriVersion() {
  const now = Date.now();
  if (_installedAitriVersion !== undefined && now - _installedAitriVersionAt < CACHE_TTL_MS) {
    return _installedAitriVersion;
  }
  try {
    const out = execFileSync('aitri', ['--version'], { encoding: 'utf8', timeout: 3000 });
    const match = out.match(/v?(\d+\.\d+\.\d+)/);
    _installedAitriVersion = match ? match[1] : null;
  } catch {
    _installedAitriVersion = null;
  }
  _installedAitriVersionAt = now;
  return _installedAitriVersion;
}

/** Returns true if semver `a` is strictly less than semver `b`. */
function isVersionLessThan(a, b) {
  const parse = v => v.split('.').map(Number);
  const [aMaj, aMin, aPat] = parse(a);
  const [bMaj, bMin, bPat] = parse(b);
  if (aMaj !== bMaj) return aMaj < bMaj;
  if (aMin !== bMin) return aMin < bMin;
  return aPat < bPat;
}

/** Test-only: reset the installed-version cache. */
export function _resetVersionCache() {
  _installedAitriVersion = undefined;
  _installedAitriVersionAt = 0;
}

/** Test-only: pre-set the installed-version cache (stamps now so the TTL holds). */
export function _setVersionCache(version) {
  _installedAitriVersion = version;
  _installedAitriVersionAt = Date.now();
}

/**
 * @typedef {{ type: string, message: string, severity: string, command: string|null,
 *             tool?: string, signalType?: string }} Alert
 * @typedef {(data: object) => Alert | Alert[] | null} AlertRule
 */

// ── Rules ─────────────────────────────────────────────────────────────────────

const ruleStale = data => {
  const g = data.gitMeta;
  if (
    !(g?.isGitRepo === true && g.lastCommitAgeHours !== null && g.lastCommitAgeHours > STALE_HOURS)
  ) {
    return null;
  }
  return {
    type: ALERT_TYPE.STALE,
    message: `No commits in ${Math.round(g.lastCommitAgeHours)}h`,
    severity: SEVERITY.WARNING,
    command: null,
  };
};

const ruleVerifyFailed = data => {
  const s = data.aitriState;
  if (!s) return null;
  const failed = s.verifyPassed === false || (s.verifySummary && s.verifySummary.failed > 0);
  if (!failed) return null;
  return {
    type: ALERT_TYPE.VERIFY_FAILED,
    message: 'Verify failed',
    severity: SEVERITY.BLOCKING,
    command: 'aitri verify-run',
  };
};

const ruleDrift = data => {
  if (data.aitriState?.hasDrift !== true) return null;
  const driftPhases = data.aitriState.driftPhases ?? [];
  const phase = driftPhases.length > 0 ? driftPhases[0] : null;
  return {
    type: ALERT_TYPE.DRIFT,
    message: 'Artifact drift detected',
    severity: SEVERITY.BLOCKING,
    command: phase !== null ? `aitri run-phase ${phase}` : 'aitri run-phase <phase>',
  };
};

const ruleTestsFailing = data => {
  if (!(data.testSummary?.available === true && data.testSummary.failed > 0)) return null;
  return {
    type: ALERT_TYPE.TESTS_FAILING,
    message: `Tests failing (${data.testSummary.failed})`,
    severity: SEVERITY.BLOCKING,
    command: 'aitri verify-run',
  };
};

const ruleCacheStale = data => {
  if (!(data.cacheStale === true && !data.rateLimited)) return null;
  return {
    type: ALERT_TYPE.CACHE_STALE,
    message: 'Cache stale (pull failed)',
    severity: SEVERITY.WARNING,
    command: null,
  };
};

const ruleRateLimited = data => {
  if (data.rateLimited !== true) return null;
  return {
    type: ALERT_TYPE.RATE_LIMITED,
    message: 'GitHub rate-limited — data may be stale (retry in ~5 min)',
    severity: SEVERITY.WARNING,
    command: null,
  };
};

const ruleCompliancePartial = data => {
  const c = data.complianceSummary;
  if (!(c?.available === true && c.overallStatus !== 'compliant')) return null;
  return {
    type: ALERT_TYPE.COMPLIANCE_PARTIAL,
    message: `Compliance ${c.overallStatus}`,
    severity: SEVERITY.BLOCKING,
    command: 'aitri run-phase 5',
  };
};

// Only fires when the project is behind the installed CLI (project < CLI).
const ruleVersionMismatch = data => {
  const projectVersion = data.aitriState?.aitriVersion ?? null;
  const installedVersion = getInstalledAitriVersion();
  if (projectVersion === null || installedVersion === null) return null;
  if (!isVersionLessThan(projectVersion, installedVersion)) return null;
  return {
    type: ALERT_TYPE.VERSION_MISMATCH,
    message: `Aitri version mismatch: project ${projectVersion}, CLI ${installedVersion}`,
    severity: SEVERITY.WARNING,
    command: 'aitri adopt --upgrade',
  };
};

// Events use `event`; legacy snapshots used `type`.
const ruleRejectionRecent = data => {
  const events = data.aitriState?.events ?? [];
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = events.find(e => {
    const kind = e.event ?? e.type;
    if (kind !== 'rejected') return false;
    const ts = new Date(e.at ?? e.timestamp ?? 0).getTime();
    return ts > sevenDaysAgo;
  });
  if (!recent) return null;
  const phase = recent.phase ?? recent.phaseId ?? null;
  return {
    type: ALERT_TYPE.REJECTION_RECENT,
    message: phase !== null ? `Phase ${phase} rejected recently` : 'Phase rejected recently',
    severity: SEVERITY.WARNING,
    command: 'aitri status',
  };
};

// Stalled for >14d in the current phase. Skipped when the pipeline is complete.
const rulePhaseStalled = data => {
  const currentPhase = data.aitriState?.currentPhase ?? null;
  const approved = data.aitriState?.approvedPhases ?? [];
  if (currentPhase === null || approved.length >= 5) return null;

  const priorEvents = (data.aitriState?.events ?? [])
    .filter(e => {
      const p = e.phase ?? e.phaseId ?? null;
      return p !== null && Number(p) < currentPhase;
    })
    .map(e => new Date(e.at ?? e.timestamp ?? 0).getTime())
    .filter(t => t > 0)
    .sort((a, b) => b - a);

  const enteredAt =
    priorEvents.length > 0 ? priorEvents[0] : new Date(data.aitriState?.createdAt ?? 0).getTime();
  const daysInPhase = enteredAt > 0 ? (Date.now() - enteredAt) / (24 * 60 * 60 * 1000) : null;
  if (daysInPhase === null || daysInPhase <= 14) return null;
  return {
    type: ALERT_TYPE.PHASE_STALLED,
    message: `Phase ${currentPhase} stalled — ${Math.round(daysInPhase)}d with no progress`,
    severity: SEVERITY.WARNING,
    command: `aitri run-phase ${currentPhase}`,
  };
};

const ruleEnvFileCommitted = data => {
  if (!data.gitMeta?.envFileCommitted) return null;
  return {
    type: ALERT_TYPE.ENV_FILE_COMMITTED,
    message: `Sensitive file committed: ${data.gitMeta.envFileCommitted}`,
    severity: SEVERITY.BLOCKING,
    command: 'git filter-repo or BFG to remove from history',
  };
};

const ruleSecretInCommit = data => {
  if (!data.gitMeta?.secretInCommit) return null;
  return {
    type: ALERT_TYPE.SECRET_IN_COMMIT,
    message: `Possible secret in commit message: "${data.gitMeta.secretInCommit}"`,
    severity: SEVERITY.BLOCKING,
    command: 'git log -20 --format="%s"',
  };
};

const ruleNoBranchPattern = data => {
  const g = data.gitMeta;
  if (!(g?.noBranchPattern === true && (g.commitVelocity7d ?? 0) > 0)) return null;
  return {
    type: ALERT_TYPE.NO_BRANCH_PATTERN,
    message: 'All commits go directly to main — no branches or PRs detected',
    severity: SEVERITY.WARNING,
    command: null,
  };
};

const ruleFrCoverageGap = data => {
  const ts = data.testSummary;
  if (!(ts?.available === true && Array.isArray(ts.frCoverage))) return null;
  const uncovered = ts.frCoverage.filter(fr => fr.status === 'missing' || fr.status === 'none');
  if (uncovered.length === 0) return null;
  const ids = uncovered
    .slice(0, 3)
    .map(fr => fr.frId)
    .join(', ');
  const more = uncovered.length > 3 ? ` +${uncovered.length - 3} more` : '';
  return {
    type: ALERT_TYPE.FR_COVERAGE_GAP,
    message: `${uncovered.length} FR(s) have no test coverage: ${ids}${more}`,
    severity: SEVERITY.WARNING,
    command: 'aitri run-phase 3',
  };
};

const ruleHighSkipRate = data => {
  const ts = data.testSummary;
  if (ts?.available !== true) return null;
  const { total = 0, passed = 0, failed = 0 } = ts;
  const skipped = total - passed - failed;
  if (!(total > 0 && skipped / total > 0.2)) return null;
  return {
    type: ALERT_TYPE.HIGH_SKIP_RATE,
    message: `${skipped}/${total} tests skipped (${Math.round((skipped / total) * 100)}%)`,
    severity: SEVERITY.WARNING,
    command: 'aitri verify-run',
  };
};

const ruleMissingTestResults = data => {
  const phase4Approved = data.aitriState?.approvedPhases?.includes(4);
  if (!(phase4Approved && data.testSummary?.available !== true)) return null;
  return {
    type: ALERT_TYPE.MISSING_TEST_RESULTS,
    message: 'Phase 4 approved but no test results found (04_TEST_RESULTS.json)',
    severity: SEVERITY.WARNING,
    command: 'aitri verify-run',
  };
};

const ruleSpecPlaceholders = data => {
  if (data.specQuality?.hasPlaceholders !== true) return null;
  return {
    type: ALERT_TYPE.SPEC_PLACEHOLDERS,
    message: `Placeholder content found in: ${data.specQuality.files.join(', ')}`,
    severity: SEVERITY.WARNING,
    command: null,
  };
};

// Open critical/high → BLOCKING. Medium/low only → WARNING. Nothing when zero.
const ruleOpenBugs = data => {
  const b = data.bugsSummary;
  if (!(b && b.open > 0)) return null;
  const { critical = 0, high = 0, medium = 0, low = 0 } = b;
  if (critical > 0 || high > 0) {
    const parts = [];
    if (critical > 0) parts.push(`${critical} critical`);
    if (high > 0) parts.push(`${high} high`);
    return {
      type: ALERT_TYPE.OPEN_BUGS,
      message: `Open bugs: ${parts.join(', ')}`,
      severity: SEVERITY.BLOCKING,
      command: null,
    };
  }
  if (medium > 0 || low > 0) {
    const parts = [];
    if (medium > 0) parts.push(`${medium} medium`);
    if (low > 0) parts.push(`${low} low`);
    return {
      type: ALERT_TYPE.OPEN_BUGS,
      message: `Open bugs: ${parts.join(', ')}`,
      severity: SEVERITY.WARNING,
      command: null,
    };
  }
  return null;
};

// Pass-through: every signal in spec/06_EXTERNAL_SIGNALS.json becomes one alert.
const ruleExternalSignals = data => {
  if (data.externalSignals?.available !== true) return null;
  return data.externalSignals.signals.map(signal => ({
    type: ALERT_TYPE.EXTERNAL_SIGNAL,
    message: `[${signal.tool}] ${signal.message}`,
    severity: signal.severity,
    command: signal.command,
    tool: signal.tool,
    signalType: signal.type,
  }));
};

/**
 * Ordered rule registry. The output order of evaluateAlerts matches this order.
 * Tests depend on this sequence — add new rules at the end unless explicitly
 * placing them in the existing grouping.
 *
 * @type {AlertRule[]}
 */
const RULES = [
  ruleStale,
  ruleVerifyFailed,
  ruleDrift,
  ruleTestsFailing,
  ruleCacheStale,
  ruleRateLimited,
  ruleCompliancePartial,
  ruleVersionMismatch,
  ruleRejectionRecent,
  rulePhaseStalled,
  // Git practice rules
  ruleEnvFileCommitted,
  ruleSecretInCommit,
  ruleNoBranchPattern,
  // Test quality rules
  ruleFrCoverageGap,
  ruleHighSkipRate,
  ruleMissingTestResults,
  // Spec quality rules
  ruleSpecPlaceholders,
  // Bug alerts (FR-018)
  ruleOpenBugs,
  // External signals
  ruleExternalSignals,
];

/**
 * Evaluate all alert rules for a single project's collected data.
 * Pure function — same input always produces same output (given a stable
 * installed CLI version cache).
 *
 * @aitri-trace FR-ID: FR-007, FR-014, US-ID: US-007, US-014, AC-ID: AC-011, AC-027,
 *              TC-ID: TC-007h, TC-014h
 *
 * @param {object} data
 * @returns {Alert[]}
 */
export function evaluateAlerts(data) {
  const out = [];
  for (const rule of RULES) {
    const result = rule(data);
    if (result === null || result === undefined) continue;
    if (Array.isArray(result)) out.push(...result);
    else out.push(result);
  }
  return out;
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
