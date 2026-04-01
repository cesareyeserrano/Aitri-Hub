/**
 * Module: collector/aitri-reader
 * Purpose: Read and parse the .aitri state file from an Aitri project directory.
 * Dependencies: node:fs, node:path, node:crypto
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const AITRI_FILE    = '.aitri';
const FEATURES_DIR  = 'features';
const FEATURES_CAP  = 10;

/**
 * Artifact filename map per the Aitri ↔ Hub Integration Contract v0.1.63.
 * Maps phase key (as string) to its artifact filename.
 * Used by detectDrift for dynamic hash check.
 */
const ARTIFACT_MAP = Object.freeze({
  'discovery': '00_DISCOVERY.md',
  'ux':        '01_UX_SPEC.md',
  '1':         '01_REQUIREMENTS.json',
  '2':         '02_SYSTEM_DESIGN.md',
  '3':         '03_TEST_CASES.json',
  '4':         '04_IMPLEMENTATION_MANIFEST.json',
  '4r':        '04_CODE_REVIEW.md',
  '5':         '05_PROOF_OF_COMPLIANCE.json',
});

/**
 * Read pipeline state from a single .aitri file (file or directory form).
 * Returns null if absent, unreadable, or malformed.
 *
 * @param {string} stateDir - Directory that contains the .aitri entry.
 * @returns {object | null}
 */
function readStateFile(stateDir) {
  let filePath = path.join(stateDir, AITRI_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'config.json');
      if (!fs.existsSync(filePath)) return null;
    }
  } catch { return null; }
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
  try { return JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { return null; }
}

/**
 * Scan {projectDir}/features/ for sub-pipelines created by `aitri feature`.
 * Each subdirectory that contains a .aitri file is treated as a feature pipeline.
 * Returns up to FEATURES_CAP entries sorted by name.
 *
 * @param {string} projectDir
 * @returns {Array<{name: string, currentPhase: number, approvedPhases: number[], completedPhases: number[]}>}
 */
function readFeatures(projectDir) {
  const featuresDir = path.join(projectDir, FEATURES_DIR);
  if (!fs.existsSync(featuresDir)) return [];
  let entries;
  try { entries = fs.readdirSync(featuresDir); } catch { return []; }
  const features = [];
  for (const entry of entries) {
    if (features.length >= FEATURES_CAP) break;
    const featureDir = path.join(featuresDir, entry);
    try {
      if (!fs.statSync(featureDir).isDirectory()) continue;
    } catch { continue; }
    const parsed = readStateFile(featureDir);
    if (!parsed) continue;
    features.push({
      name:             entry,
      currentPhase:     parsed.currentPhase ?? 0,
      approvedPhases:   Array.isArray(parsed.approvedPhases)  ? parsed.approvedPhases  : [],
      completedPhases:  Array.isArray(parsed.completedPhases) ? parsed.completedPhases : [],
    });
  }
  return features.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Compute the sha256 hex digest of a file's utf8 contents.
 * Throws if the file cannot be read — caller must catch.
 *
 * @param {string} filePath - Absolute path to the artifact file.
 * @returns {string} Hex sha256 digest.
 */
function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Detect artifact drift per the Aitri ↔ Hub Integration Contract v0.1.63.
 *
 * Two-step algorithm:
 *   1. Fast path (v0.1.58+): if config.driftPhases[] contains any approved phase key → true.
 *   2. Dynamic hash check: for each approved phase with a stored hash, read the artifact
 *      file from disk, compute sha256, and compare. A phase with NO stored hash is NOT
 *      counted as drifted (it was approved before hashing was introduced in v0.1.51).
 *
 * @aitri-trace FR-ID: FR-012, FR-013, US-ID: US-012, US-013, AC-ID: AC-024, AC-025, AC-026, TC-ID: TC-012h, TC-013h
 *
 * @param {object} parsed     - Raw parsed .aitri JSON object.
 * @param {string} projectDir - Absolute path to the project root directory.
 * @returns {boolean}
 */
function detectDrift(parsed, projectDir) {
  const approved = parsed.approvedPhases ?? [];
  const approvedStrs = approved.map(String);

  // Step 1 — Fast path: driftPhases[] written by Aitri CLI run-phase (v0.1.58+).
  if (Array.isArray(parsed.driftPhases) && parsed.driftPhases.length > 0) {
    const driftSet = new Set(parsed.driftPhases.map(String));
    if (approvedStrs.some(p => driftSet.has(p))) return true;
  }

  // Step 2 — Dynamic hash check: read artifact files, compute sha256, compare.
  const hashes = parsed.artifactHashes ?? {};
  // Use raw artifactsDir from parsed (not the defaulted value) to build paths.
  const base = typeof parsed.artifactsDir === 'string' && parsed.artifactsDir
    ? parsed.artifactsDir
    : '';

  for (const phase of approvedStrs) {
    const storedHash = hashes[phase];
    if (!storedHash) continue; // No hash = approved before v0.1.51 = not drift.

    const artifactFile = ARTIFACT_MAP[phase];
    if (!artifactFile) continue; // Unknown phase key — skip.

    const fullPath = base
      ? path.join(projectDir, base, artifactFile)
      : path.join(projectDir, artifactFile);

    try {
      const currentHash = computeFileHash(fullPath);
      if (currentHash !== storedHash) return true;
    } catch {
      continue; // File missing or unreadable = can't verify = not drift.
    }
  }

  return false;
}

/**
 * Extract the most recent rejection from the rejections map.
 *
 * @param {object} rejections - Map of phase number → { at, feedback }.
 * @returns {{ phase: number, at: string, feedback: string } | null}
 */
function extractLastRejection(rejections) {
  if (!rejections || typeof rejections !== 'object') return null;
  const entries = Object.entries(rejections);
  if (entries.length === 0) return null;
  // Sort by timestamp descending to find the most recent.
  const sorted = entries
    .map(([phase, data]) => ({ phase: Number(phase), at: data.at, feedback: data.feedback }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  return sorted[0] ?? null;
}

/**
 * Read and parse the .aitri state file for a project.
 * Returns null (never throws) if the file is absent, unreadable, or malformed.
 *
 * Applies defaults per the Aitri ↔ Hub Integration Contract v0.1.63:
 *   - artifactsDir: '' (empty string) when absent or empty — NOT 'spec'.
 *     'spec' is only used when explicitly set in .aitri.
 *   - projectName: path.basename(projectDir) when field is absent.
 *   - aitriVersion, updatedAt, createdAt: null when absent or not a string.
 *
 * @aitri-trace FR-ID: FR-010, FR-011, US-ID: US-010, US-011, AC-ID: AC-020, AC-022, TC-ID: TC-010h, TC-011h
 *
 * @param {string} projectDir - Absolute path to the project root directory.
 * @returns {AitriState | null}
 */
export function readAitriState(projectDir) {
  const parsed = readStateFile(projectDir);
  if (typeof parsed !== 'object' || parsed === null) return null;

  return {
    currentPhase:    parsed.currentPhase ?? 0,
    approvedPhases:  Array.isArray(parsed.approvedPhases)  ? parsed.approvedPhases  : [],
    completedPhases: Array.isArray(parsed.completedPhases) ? parsed.completedPhases : [],
    verifyPassed:    parsed.verifyPassed === true,
    verifySummary:   parsed.verifySummary ?? null,
    hasDrift:        detectDrift(parsed, projectDir),
    driftPhases:     Array.isArray(parsed.driftPhases) ? parsed.driftPhases.map(String) : [],
    lastRejection:   extractLastRejection(parsed.rejections),
    // FR-011: projectName defaults to directory basename — not null.
    projectName:     typeof parsed.projectName === 'string' ? parsed.projectName : path.basename(projectDir),
    // FR-011: artifactsDir defaults to '' (empty) — not 'spec'. 'spec' only when explicit.
    artifactsDir:    typeof parsed.artifactsDir === 'string' && parsed.artifactsDir ? parsed.artifactsDir : '',
    // FR-010: new fields — null when absent or wrong type.
    aitriVersion:    typeof parsed.aitriVersion === 'string' ? parsed.aitriVersion : null,
    updatedAt:       typeof parsed.updatedAt    === 'string' ? parsed.updatedAt    : null,
    createdAt:       typeof parsed.createdAt    === 'string' ? parsed.createdAt    : null,
    events:          Array.isArray(parsed.events) ? parsed.events.slice(-20) : [],
    features:        readFeatures(projectDir),
    // FR-019: expose lastSession from .aitri (v0.1.70+). null when absent (pre-v0.1.70).
    lastSession:     parsed.lastSession != null ? {
      at:            typeof parsed.lastSession.at    === 'string' ? parsed.lastSession.at    : null,
      agent:         typeof parsed.lastSession.agent === 'string' ? parsed.lastSession.agent : null,
      event:         typeof parsed.lastSession.event === 'string' ? parsed.lastSession.event : null,
      files_touched: Array.isArray(parsed.lastSession.files_touched) ? parsed.lastSession.files_touched : null,
    } : null,
  };
}
