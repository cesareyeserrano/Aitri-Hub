/**
 * Module: collector/validate-runner
 * Purpose: Run `aitri validate --json` ON DEMAND for one project (never in the
 *          collection cycle), with a fixed argv (no shell), a hard timeout, a
 *          60s per-project result cache, and in-flight deduplication so a burst
 *          of tab switches / concurrent requests spawns at most one process.
 * Dependencies: node:child_process (execFile)
 *
 * VALIDATE_JSON.md scopes the command to single-machine (local) consumers, so
 * remote projects short-circuit to a degraded payload — the panel explains that
 * the deploy verdict applies to local projects.
 */

import { execFile } from 'node:child_process';

const TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 60_000;
const MAX_STDOUT_BYTES = 4 * 1024 * 1024;

/** projectId → { fetchedAt, result }. */
const _cache = new Map();
/** projectId → Promise (in-flight dedup). */
const _inflight = new Map();

/** Injected for tests; defaults to a real timestamp via performance-free Date. */
let _now = () => Date.now();

/**
 * Spawn `aitri validate --json` with a fixed argv. No project-derived string
 * ever reaches the argv — only the cwd is project-specific (NFR-052).
 *
 * @aitri-trace FR-ID: FR-052, NFR-052, US-ID: US-052, AC-ID: AC-0521, TC-ID: TC-152h, TC-154f
 * @param {string} projectDir - cwd for the spawn.
 * @returns {Promise<{available:boolean, report?:object, reason?:string}>}
 */
function spawnValidate(projectDir) {
  return new Promise(resolve => {
    execFile(
      'aitri',
      ['validate', '--json'],
      { cwd: projectDir, timeout: TIMEOUT_MS, maxBuffer: MAX_STDOUT_BYTES, shell: false },
      (err, stdout) => {
        if (err && (err.killed || err.signal)) {
          resolve({ available: false, reason: `validate timed out after ${TIMEOUT_MS}ms` });
          return;
        }
        if (err && err.code === 'ENOENT') {
          resolve({ available: false, reason: 'aitri CLI not found on PATH' });
          return;
        }
        // validate --json (no --ci) exits 0 even when not deployable; a non-zero
        // exit here means the dir is not an Aitri project or the CLI crashed.
        let report;
        try {
          report = JSON.parse(stdout);
        } catch {
          resolve({ available: false, reason: 'validate produced unreadable output' });
          return;
        }
        resolve({ available: true, report });
      },
    );
  });
}

/**
 * Get the deploy-readiness report for a project, honoring the cache and
 * dedup. Never throws.
 *
 * @aitri-trace FR-ID: FR-054, US-ID: US-054, AC-ID: AC-0542, TC-ID: TC-054e, TC-151f
 * @param {{id:string,type:string}} project - Registry entry (type gates remote).
 * @param {string} projectDir - Resolved local dir.
 * @param {{refresh?:boolean}} [opts]
 * @returns {Promise<{available:boolean, report?:object, reason?:string, fetchedAt:number}>}
 */
export async function runValidate(project, projectDir, opts = {}) {
  if (project.type === 'remote') {
    return { available: false, reason: 'remote-project', fetchedAt: _now() };
  }
  const key = project.id;
  const now = _now();

  // refresh bypasses the 60s CACHE, but NEVER the in-flight dedup — otherwise a
  // burst of ?refresh=1 (fast clicks or a scripted loopback caller) amplifies
  // into one spawn per request, breaking the process budget (NFR-051). An
  // in-flight spawn is already fresh, so joining it satisfies refresh intent.
  if (!opts.refresh) {
    const cached = _cache.get(key);
    if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
      return { ...cached.result, fetchedAt: cached.fetchedAt };
    }
  }
  const pending = _inflight.get(key);
  if (pending) return pending;

  const promise = spawnValidate(projectDir).then(result => {
    const fetchedAt = _now();
    _cache.set(key, { fetchedAt, result });
    _inflight.delete(key);
    return { ...result, fetchedAt };
  });
  _inflight.set(key, promise);
  return promise;
}

/** Test-only: clear cache + in-flight and (optionally) inject a clock. */
export function _resetValidateRunner(nowFn) {
  _cache.clear();
  _inflight.clear();
  _now = nowFn ?? (() => Date.now());
}
