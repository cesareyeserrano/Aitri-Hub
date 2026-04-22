/**
 * Module: store/compat-manifest
 * Purpose: Read and write ~/.aitri-hub/integration-compat.json atomically.
 *          Surfaces the integration-review state to the collector (FR-030).
 * Dependencies: node:fs, node:path, store/projects, store/dashboard
 */

import fs from 'node:fs';
import path from 'node:path';
import { hubDir, ensureDir } from './projects.js';
import { appendLog } from './dashboard.js';
import {
  SCHEMA_VERSION,
  INTEGRATION_COMPAT_FILE,
  INTEGRATION_COMPAT_TMP_FILE,
} from '../constants.js';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const HEX64_RE = /^[0-9a-f]{64}$/;

/**
 * Resolve the absolute path to integration-compat.json.
 * @returns {string}
 */
export function compatManifestPath() {
  return path.join(hubDir(), INTEGRATION_COMPAT_FILE);
}

function isValidIsoUtc(s) {
  if (typeof s !== 'string') return false;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString() === s || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(s);
}

function validate(obj) {
  if (!obj || typeof obj !== 'object') return 'manifest is not an object';
  if (obj.schemaVersion !== SCHEMA_VERSION && obj.schemaVersion !== '1') {
    return `unknown schemaVersion ${JSON.stringify(obj.schemaVersion)}`;
  }
  if (typeof obj.reviewedUpTo !== 'string' || !SEMVER_RE.test(obj.reviewedUpTo)) {
    return `reviewedUpTo is invalid (expected MAJOR.MINOR.PATCH, got ${JSON.stringify(obj.reviewedUpTo)})`;
  }
  if (!isValidIsoUtc(obj.reviewedAt)) {
    return `reviewedAt is not a valid ISO-8601 UTC timestamp`;
  }
  if (typeof obj.changelogHash !== 'string' && obj.changelogHash !== null) {
    return `changelogHash must be a string or null`;
  }
  if (typeof obj.changelogHash === 'string' && !HEX64_RE.test(obj.changelogHash)) {
    return `changelogHash must be 64 lowercase hex chars`;
  }
  if (obj.reviewerNote !== null && typeof obj.reviewerNote !== 'string') {
    return `reviewerNote must be a string or null`;
  }
  return null;
}

/**
 * Read the integration-compat manifest.
 * Never throws — malformed or missing files return { status: 'absent', data: null }.
 * Does NOT create the data directory (FR-030 AC-5).
 *
 * @aitri-trace FR-ID: FR-030, US-ID: US-033, AC-ID: AC-034, TC-ID: TC-030h
 *
 * @returns {{ status: 'valid' | 'absent', data: object | null }}
 */
export function readManifest() {
  const filePath = compatManifestPath();
  if (!fs.existsSync(filePath)) {
    return { status: 'absent', data: null };
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    appendLog(
      `WARN integration-compat.json unreadable (${err.code ?? 'UNKNOWN'}) — treating as absent`,
    );
    return { status: 'absent', data: null };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    appendLog(`WARN integration-compat.json malformed JSON — treating as absent`);
    return { status: 'absent', data: null };
  }
  const err = validate(parsed);
  if (err) {
    appendLog(`WARN integration-compat.json invalid (${err}) — treating as absent`);
    return { status: 'absent', data: null };
  }
  return { status: 'valid', data: parsed };
}

/**
 * Write the manifest atomically (temp-file + rename).
 * Ensures AITRI_HUB_DIR exists before writing.
 *
 * @aitri-trace FR-ID: FR-030, US-ID: US-030, AC-ID: AC-030, TC-ID: TC-031h
 *
 * @param {{ reviewedUpTo: string, reviewedAt: string, changelogHash: string, reviewerNote: string | null }} manifest
 * @returns {void}
 */
export function writeManifest(manifest) {
  const full = {
    schemaVersion: '1',
    reviewedUpTo: manifest.reviewedUpTo,
    reviewedAt: manifest.reviewedAt,
    changelogHash: manifest.changelogHash,
    reviewerNote: manifest.reviewerNote ?? null,
  };
  const err = validate(full);
  if (err) {
    throw new Error(`Cannot write manifest: ${err}`);
  }
  ensureDir();
  const finalPath = compatManifestPath();
  const tmpPath = path.join(hubDir(), INTEGRATION_COMPAT_TMP_FILE);
  const content = JSON.stringify(full, null, 2) + '\n';
  try {
    fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmpPath, finalPath);
  } catch (e) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw new Error(`Failed to write integration-compat.json: ${e.message}`, { cause: e });
  }
}
