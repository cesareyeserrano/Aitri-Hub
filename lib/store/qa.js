/**
 * Module: store/qa
 * Purpose: QA-Workspace persistence under ~/.aitri-hub/qa/<projectId>/ — append-only
 *          manual-test executions (executions.json), manual status overrides
 *          (status.json) and validated evidence files (evidence/<uuid>.<ext>). All
 *          writes are atomic (temp+rename). Nothing is ever written to project dirs.
 * Dependencies: node:fs, node:path, node:crypto, store/projects
 *
 * @aitri-trace FR-ID: FR-021, US-ID: US-021, AC-ID: AC-021-1, AC-021-2, TC-ID: TC-021h, TC-021e
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hubDir } from './projects.js';

/** Project ids come from a route matched to [A-Za-z0-9_-]+, but validate defensively. */
const ID_RE = /^[A-Za-z0-9_-]+$/;

function assertId(projectId) {
  if (typeof projectId !== 'string' || !ID_RE.test(projectId)) {
    throw new Error('invalid project id');
  }
}

/** Base QA directory for a project. */
export function qaDir(projectId) {
  assertId(projectId);
  return path.join(hubDir(), 'qa', projectId);
}
function evidenceDir(projectId) { return path.join(qaDir(projectId), 'evidence'); }
function executionsPath(projectId) { return path.join(qaDir(projectId), 'executions.json'); }
function statusPath(projectId) { return path.join(qaDir(projectId), 'status.json'); }

function ensureQaDir(projectId) {
  fs.mkdirSync(evidenceDir(projectId), { recursive: true });
}

/** Atomic JSON write (temp+rename) — no partial reads. */
function writeJsonAtomic(finalPath, data) {
  const tmp = `${finalPath}.tmp-${crypto.randomBytes(4).toString('hex')}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, finalPath);
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return fallback;
  }
}

/**
 * A stable fingerprint of the current verify run for execution binding (ADR-08).
 * There is no run id in the snapshot — only resultsBinding (enum) — so the stamp is
 * a hash of the verify counts. null when no run exists.
 * @param {object|null} record
 * @returns {string|null}
 */
export function runStampOf(record) {
  const vs = record?.aitriState?.verifySummary ?? record?.testSummary ?? null;
  if (!vs || (vs.available === false)) return null;
  const key = `${vs.passed ?? 0}:${vs.failed ?? 0}:${vs.skipped ?? 0}:${vs.total ?? 0}`;
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
}

/** The binding captured on an execution: honest even when unbound (no-stamp). */
export function bindingOf(record) {
  return {
    resultsBinding: record?.resultsBinding ?? 'no-stamp',
    runStamp: runStampOf(record),
  };
}

/**
 * Read executions for a project (optionally filtered to one test case).
 * @param {string} projectId
 * @param {string} [testCaseId]
 * @returns {{ executions: object[] }}
 */
export function readExecutions(projectId, testCaseId) {
  const store = readJsonSafe(executionsPath(projectId), { executions: [] });
  let executions = Array.isArray(store.executions) ? store.executions : [];
  if (testCaseId) executions = executions.filter(e => e.testCaseId === testCaseId);
  return { executions };
}

/**
 * Append one execution (append-only — never overwrites prior history).
 * @param {string} projectId
 * @param {object} execution
 * @returns {object} the stored execution (with id + at)
 */
export function appendExecution(projectId, execution) {
  ensureQaDir(projectId);
  const store = readJsonSafe(executionsPath(projectId), { executions: [] });
  const executions = Array.isArray(store.executions) ? store.executions : [];
  const stored = {
    id: crypto.randomUUID(),
    at: execution.at,
    ...execution,
  };
  executions.push(stored);
  writeJsonAtomic(executionsPath(projectId), { executions });
  return stored;
}

/** Read manual status overrides. */
export function readStatusOverrides(projectId) {
  const store = readJsonSafe(statusPath(projectId), { overrides: {} });
  return store.overrides && typeof store.overrides === 'object' ? store.overrides : {};
}

/**
 * Set a manual status override for one test case.
 * @param {string} projectId
 * @param {string} testCaseId
 * @param {string} status
 */
export function setStatusOverride(projectId, testCaseId, status) {
  ensureQaDir(projectId);
  const overrides = readStatusOverrides(projectId);
  overrides[testCaseId] = status;
  writeJsonAtomic(statusPath(projectId), { overrides });
  return overrides;
}

/**
 * Persist a validated evidence buffer under a server-generated filename. The
 * client filename is NEVER used for the stored path (path-injection guard).
 * @param {string} projectId
 * @param {Buffer} buffer - Already type/size/magic validated.
 * @param {string} ext - Extension WITHOUT the dot (png|jpg|gif|webp|svg).
 * @returns {string} the stored evidence reference (relative filename)
 */
export function writeEvidence(projectId, buffer, ext) {
  ensureQaDir(projectId);
  const name = `${crypto.randomUUID()}.${ext}`;
  const dest = path.join(evidenceDir(projectId), name);
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, buffer);
  fs.renameSync(tmp, dest);
  return name;
}

/**
 * Resolve an evidence reference to an absolute path, confined to the project's
 * evidence dir (rejects any traversal in the reference).
 * @param {string} projectId
 * @param {string} ref
 * @returns {string|null} absolute path or null when it escapes / is absent
 */
export function resolveEvidence(projectId, ref) {
  if (typeof ref !== 'string' || ref === '' || path.isAbsolute(ref)) return null;
  const dir = evidenceDir(projectId);
  const resolved = path.resolve(dir, ref);
  if (resolved !== path.join(dir, path.basename(ref))) return null; // no subpaths/traversal
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}
