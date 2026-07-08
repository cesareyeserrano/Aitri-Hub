/**
 * Module: collector/snapshot-reader
 * Purpose: Spawn `aitri status --json` per project and project the canonical
 *          ProjectSnapshot into the Hub project record shape consumed by the
 *          renderer and alerts engine.
 * Dependencies: node:child_process, node:path
 *
 * @aitri-trace FR-ID: FR-010, FR-011, FR-012, FR-013, FR-014, FR-015, FR-016, FR-017
 *              US-ID: US-009, US-010, US-011, US-012, US-013, US-014, US-015, US-016
 *              TC-ID: TC-010h, TC-010f, TC-010e1, TC-011h, TC-016h, TC-016e1
 */

import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 3000;
const MAX_STDOUT_BYTES = 1024 * 1024; // 1 MiB
const MIN_SNAPSHOT_VERSION = 1;

/**
 * Spawn `aitri status --json` in projectDir and return a normalized result.
 * Never throws — every failure mode returns { ok: false, reason }.
 *
 * @aitri-trace FR-ID: FR-010, US-ID: US-009, AC-ID: AC-015, TC-ID: TC-010h, TC-010f, TC-010e1
 *
 * @param {string} projectDir   Absolute path to the project directory.
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=3000]
 * @param {(cmd:string,args:string[],opts:object)=>any} [opts.spawnFn]  Injection point for tests.
 * @returns {Promise<object>}
 */
export function readSnapshot(projectDir, opts = {}) {
  const timeoutMs =
    Number.isInteger(opts.timeoutMs) && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const spawnFn = typeof opts.spawnFn === 'function' ? opts.spawnFn : spawn;
  const start = Date.now();

  return new Promise(resolve => {
    let resolved = false;
    const finish = result => {
      if (resolved) return;
      resolved = true;
      result.durationMs = Date.now() - start;
      resolve(result);
    };

    let child;
    try {
      child = spawnFn('aitri', ['status', '--json'], {
        cwd: projectDir,
        shell: false,
      });
    } catch (err) {
      finish({ ok: false, reason: 'spawn_failed', detail: err?.message ?? String(err) });
      return;
    }

    if (!child || typeof child.on !== 'function') {
      finish({ ok: false, reason: 'spawn_failed', detail: 'spawn returned no child' });
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutBytes = 0;
    let overflowed = false;

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already exited */
      }
      finish({ ok: false, reason: 'timeout' });
    }, timeoutMs);

    if (child.stdout && typeof child.stdout.on === 'function') {
      child.stdout.on('data', chunk => {
        if (overflowed) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        stdoutBytes += buf.length;
        if (stdoutBytes > MAX_STDOUT_BYTES) {
          overflowed = true;
          try {
            child.kill('SIGKILL');
          } catch {
            /* */
          }
          clearTimeout(timer);
          finish({ ok: false, reason: 'parse_failed', detail: 'output_too_large' });
          return;
        }
        stdoutChunks.push(buf);
      });
    }
    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', chunk => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        stderrChunks.push(buf);
      });
    }

    child.on('error', err => {
      clearTimeout(timer);
      const code = err?.code === 'ENOENT' ? 'not_installed' : 'spawn_failed';
      finish({ ok: false, reason: code, detail: err?.message ?? String(err) });
    });

    child.on('close', code => {
      clearTimeout(timer);
      if (resolved) return;
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();

      if (code !== 0) {
        finish({ ok: false, reason: 'spawn_failed', detail: stderr || `exit ${code}` });
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (err) {
        finish({ ok: false, reason: 'parse_failed', detail: err?.message ?? 'invalid JSON' });
        return;
      }

      if (!parsed || typeof parsed !== 'object') {
        finish({ ok: false, reason: 'parse_failed', detail: 'snapshot is not an object' });
        return;
      }
      const sv = parsed.snapshotVersion;
      if (!Number.isInteger(sv) || sv < MIN_SNAPSHOT_VERSION) {
        finish({ ok: false, reason: 'version_too_old', detail: `snapshotVersion=${sv}` });
        return;
      }

      finish({ ok: true, snapshot: parsed });
    });
  });
}

/**
 * Pure projection from a parsed ProjectSnapshot to the Hub project record shape
 * the renderer (and alerts engine) consumes. Defensively normalizes missing fields.
 *
 * @aitri-trace FR-ID: FR-011, US-ID: US-010, AC-ID: AC-016, TC-ID: TC-011h
 *
 * @param {object} snapshot
 * @returns {object}
 */
export function projectFromSnapshot(snapshot) {
  const s = snapshot ?? {};
  const phases = Array.isArray(s.phases) ? s.phases : [];

  const isCorePhase = p => Number.isInteger(p.key);
  const approvedPhases = phases
    .filter(p => p.status === 'approved' && isCorePhase(p))
    .map(p => p.key);
  const completedPhases = phases
    .filter(p => (p.status === 'approved' || p.status === 'completed') && isCorePhase(p))
    .map(p => p.key);
  const driftPhases = Array.isArray(s.driftPhases)
    ? s.driftPhases.map(String)
    : Array.isArray(s.health?.driftPresent)
      ? s.health.driftPresent.map(String)
      : [];
  const verifyPhase = phases.find(p => p.key === 'verify') ?? null;
  const currentPhase = pickCurrentPhase(phases);

  // Canonical source is verifyPhase.status === 'passed' (CLI enum from aitri status --json).
  // Legacy boolean paths kept for backwards-compat with snapshots that predate the enum.
  const verifyPassed =
    verifyPhase?.status === 'passed' ||
    verifyPhase?.verifyPassed === true ||
    s.health?.verifyPassed === true;
  const verifySummary = verifyPhase?.verifySummary ?? s.verifySummary ?? null;

  const lastSession =
    s.lastSession && typeof s.lastSession === 'object'
      ? {
          event: typeof s.lastSession.event === 'string' ? s.lastSession.event : null,
          agent: typeof s.lastSession.agent === 'string' ? s.lastSession.agent : null,
          at: typeof s.lastSession.at === 'string' ? s.lastSession.at : null,
        }
      : null;

  const aitriState = {
    currentPhase,
    approvedPhases,
    completedPhases,
    verifyPassed: verifyPassed === true,
    verifySummary,
    hasDrift: driftPhases.length > 0,
    driftPhases,
    lastRejection: null,
    projectName: typeof s.project === 'string' ? s.project : null,
    artifactsDir: typeof s.artifactsDir === 'string' ? s.artifactsDir : '',
    aitriVersion: typeof s.aitriVersion === 'string' ? s.aitriVersion : null,
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : null,
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : null,
    events: Array.isArray(s.events) ? s.events.slice(-20) : [],
    features: projectFeatures(s.features),
    lastSession,
  };

  const testSummary = projectTestSummary(s, verifyPhase);
  const aggregatedTestSummary = projectAggregatedTestSummary(s);
  const qualitySurfaces = projectQualitySurfaces(s);
  const requirementsSummary = projectRequirementsSummary(s);
  const complianceSummary = projectComplianceSummary(s);
  const bugsSummary = projectBugsSummary(s.bugs);

  // FR-045 (rc.148 contract): run-binding state of 04_TEST_RESULTS.json vs the
  // verify stamp. Strict enum whitelist — an unknown or non-string value is
  // dropped, never carried (absent ≠ unbound; TC-045e/f).
  /** @aitri-trace FR-ID: FR-045, US-ID: US-045, AC-ID: AC-0451, AC-0452, TC-ID: TC-045h, TC-045e, TC-045f */
  const RESULTS_BINDING_VALUES = ['bound', 'mismatch', 'no-stamp', 'missing-file'];
  const resultsBinding = RESULTS_BINDING_VALUES.includes(verifyPhase?.resultsBinding)
    ? verifyPhase.resultsBinding
    : null;

  return {
    aitriState,
    testSummary,
    aggregatedTestSummary,
    requirementsSummary,
    complianceSummary,
    bugsSummary,
    nextActions: Array.isArray(s.nextActions) ? s.nextActions : [],
    health: s.health ?? {},
    audit: s.audit ?? { exists: false, stalenessDays: null },
    normalize: s.normalize ?? { state: null, method: null, baseRef: null, uncountedFiles: null },
    lastSession,
    snapshotVersion: s.snapshotVersion ?? null,
    // Additive: key present only when the snapshot provided a valid value
    // (absent ≠ unbound — TC-045e; dashboards diff clean for older CLIs).
    ...(resultsBinding ? { resultsBinding } : {}),
    // Additive (rc.161): omitted entirely when no pipeline carries a surface,
    // so gate-less/old-CLI records keep their exact shape (NFR-056).
    ...(qualitySurfaces ? { qualitySurfaces } : {}),
  };
}

function pickCurrentPhase(phases) {
  // First not-yet-approved core phase in numeric order; null if all done.
  const numeric = phases.filter(p => Number.isInteger(p.key)).sort((a, b) => a.key - b.key);
  for (const p of numeric) {
    if (p.status !== 'approved') return p.key;
  }
  return null;
}

function projectFeatures(features) {
  if (!Array.isArray(features)) return [];
  return features.slice(0, 10).map(f => ({
    name: typeof f.name === 'string' ? f.name : '',
    currentPhase: Number.isInteger(f.nextPhase)
      ? f.nextPhase
      : Number.isInteger(f.currentPhase)
        ? f.currentPhase
        : 0,
    approvedPhases: Array.isArray(f.approvedPhases)
      ? f.approvedPhases
      : Number.isInteger(f.approvedCount)
        ? Array.from({ length: f.approvedCount }, (_, i) => i + 1)
        : [],
    completedPhases: Array.isArray(f.completedPhases) ? f.completedPhases : [],
  }));
}

function projectTestSummary(s, verifyPhase) {
  const summary = verifyPhase?.verifySummary ?? null;
  if (!summary) return null;
  const toCount = v => (Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    available: true,
    passed: toCount(summary.passed),
    failed: toCount(summary.failed),
    skipped: toCount(summary.skipped),
    total: toCount(summary.total),
    frCoverage: Array.isArray(summary.fr_coverage)
      ? summary.fr_coverage.map(e => ({ frId: e.fr_id, status: e.status }))
      : [],
  };
}

/**
 * Per-pipeline verify quality surfaces — `tests.perPipeline[].quality_gates` /
 * `ac_coverage`, emitted by `aitri status --json` since v2.0.0-rc.161
 * (HUB-CATCHUP-0705; completes FR-047 of contract-catchup-rc159). Returns
 * null when no pipeline carries either surface, so the record key is omitted
 * and pre-rc.161 records stay byte-identical (NFR-056). `null` in the payload
 * is NOT a version signal — the artifact fields predate rc.161; only Core's
 * projection is new.
 *
 * quality_gates entries are shape-narrowed (same defensive posture as every
 * projection here); ac_coverage passes through unchanged per FR-062 — Core
 * already projects it compactly, and re-narrowing per-field would drop future
 * additive Core fields.
 *
 * @aitri-trace FR-ID: FR-061, FR-062, US-ID: US-061, US-062, AC-ID: AC-0611, AC-0612, AC-0613, AC-0621, AC-0622, TC-ID: TC-061h, TC-061e, TC-061f, TC-062h, TC-062e, TC-062f
 *
 * @param {object} s - parsed snapshot payload
 * @returns {{perPipeline: Array<object>} | null}
 */
export function projectQualitySurfaces(s) {
  const perPipeline = s?.tests?.perPipeline;
  if (!Array.isArray(perPipeline)) return null;

  const entries = [];
  for (const p of perPipeline) {
    if (!p || typeof p !== 'object') continue;
    const scope = typeof p.scope === 'string' ? p.scope : null;

    const gates = Array.isArray(p.quality_gates)
      ? p.quality_gates.map(g => ({
          name: typeof g?.name === 'string' ? g.name : null,
          status: typeof g?.status === 'string' ? g.status : null,
          required: g?.required === true,
          ...(typeof g?.threshold === 'number' ? { threshold: g.threshold } : {}),
          ...(typeof g?.measured === 'number' ? { measured: g.measured } : {}),
        }))
      : null;
    const acCoverage = Array.isArray(p.ac_coverage) ? p.ac_coverage : null;

    if (gates === null && acCoverage === null) continue;
    entries.push({
      scope,
      ...(gates !== null ? { quality_gates: gates } : {}),
      ...(acCoverage !== null ? { ac_coverage: acCoverage } : {}),
    });
  }

  return entries.length > 0 ? { perPipeline: entries } : null;
}

// Aggregated totals across main + feature pipelines — canonical field emitted
// by `aitri status --json` as s.tests.totals. Returns null when the CLI did
// not emit this block (legacy snapshots); callers should fall back to
// projectTestSummary in that case.
function projectAggregatedTestSummary(s) {
  const totals = s?.tests?.totals ?? null;
  if (!totals || typeof totals !== 'object') return null;
  const toCount = v => (Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    available: true,
    passed: toCount(totals.passed),
    failed: toCount(totals.failed),
    skipped: toCount(totals.skipped),
    total: toCount(totals.total),
  };
}

function projectRequirementsSummary(s) {
  const r = s.requirements ?? null;
  if (!r) return null;
  const priority = { MUST: 0, SHOULD: 0, COULD: 0, WONT: 0 };
  if (r.priority && typeof r.priority === 'object') {
    for (const k of Object.keys(priority)) {
      if (Number.isInteger(r.priority[k])) priority[k] = r.priority[k];
    }
  }
  return {
    available: true,
    total: Number.isInteger(r.total) ? r.total : 0,
    covered: Number.isInteger(r.covered) ? r.covered : null,
    priority,
    projectName: typeof s.project === 'string' ? s.project : null,
  };
}

function projectComplianceSummary(s) {
  const c = s.compliance ?? null;
  if (!c || typeof c !== 'object') return null;
  if (!c.overall_status) return null;
  return {
    available: true,
    overallStatus: c.overall_status,
    levels: c.levels ?? { production_ready: 0, complete: 0, partial: 0, functionally_present: 0 },
    total: Number.isInteger(c.total) ? c.total : 0,
  };
}

/**
 * Project the canonical `bugs` block emitted by `aitri status --json`.
 *
 * @aitri-trace FR-ID: FR-001, FR-002, FR-003, FR-004
 *              US-ID: US-001, US-002, US-003, US-004
 *              AC-ID: AC-001, AC-002, AC-003, AC-004
 *              TC-ID: TC-001h, TC-001e, TC-001f, TC-002h, TC-002e, TC-002f, TC-003h, TC-003e, TC-003f, TC-004h, TC-004e, TC-004f
 */
function projectBugsSummary(bugs) {
  if (!bugs || typeof bugs !== 'object') return null;
  const toCount = v => (Number.isInteger(v) && v >= 0 ? v : 0);
  const total = toCount(bugs.total);
  const open = toCount(bugs.open);
  const bySeverity =
    bugs.bySeverity && typeof bugs.bySeverity === 'object' ? bugs.bySeverity : {};
  const bySeverityActive = {
    critical: toCount(bySeverity.critical),
    high: toCount(bySeverity.high),
    medium: toCount(bySeverity.medium),
    low: toCount(bySeverity.low),
  };

  // FR-044 (rc.158 contract): non-empty parseErrors names the scopes whose
  // BUGS.json exists but is unreadable — those bugs are NOT counted. Additive:
  // the key is present only when there are real errors.
  /** @aitri-trace FR-ID: FR-044, US-ID: US-044, AC-ID: AC-0441, AC-0442, TC-ID: TC-044h, TC-044e */
  const parseErrors = Array.isArray(bugs.parseErrors)
    ? bugs.parseErrors.filter(scope => typeof scope === 'string' && scope !== '')
    : [];

  return {
    total,
    open,
    resolved: Math.max(total - open, 0),
    blocking: toCount(bugs.blocking),
    bySeverityActive,
    critical: bySeverityActive.critical,
    high: bySeverityActive.high,
    medium: bySeverityActive.medium,
    low: bySeverityActive.low,
    openIds: Array.isArray(bugs.openIds) ? bugs.openIds.filter(id => typeof id === 'string') : [],
    ...(parseErrors.length > 0 ? { parseErrors } : {}),
  };
}

// ── Time formatting (FR-016) — re-exported from browser-safe module ──────────

export { formatRelativeTime, formatLastSessionLine } from './relative-time.js';
