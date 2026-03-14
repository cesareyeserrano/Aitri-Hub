/**
 * Module: collector/aitri-reader
 * Purpose: Read and parse the .aitri state file from an Aitri project directory.
 * Dependencies: node:fs, node:path
 */

import fs from 'node:fs';
import path from 'node:path';

const AITRI_FILE = '.aitri';

/**
 * Compute drift status: returns true if any artifact hash stored in the .aitri
 * file no longer matches the known hash from before approval.
 * In v1, drift detection reads the artifactHashes map and checks for non-null
 * values — the Aitri CLI itself sets these; we simply surface the field.
 *
 * @param {object} parsed - Parsed .aitri JSON object.
 * @returns {boolean}
 */
function detectDrift(parsed) {
  // artifactHashes is set by the Aitri CLI when an approved artifact is modified.
  // A drift condition is present when the Aitri CLI has detected hash mismatch.
  // In practice, the .aitri file does not store a separate "hasDrift" boolean —
  // we infer it from whether any phase in approvedPhases is missing from artifactHashes.
  const approved = parsed.approvedPhases ?? [];
  const hashes = parsed.artifactHashes ?? {};
  if (approved.length === 0) return false;
  // If an approved phase has no hash recorded, that phase may have drifted.
  return approved.some(phase => !hashes[String(phase)]);
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
 * @aitri-trace FR-ID: FR-002, US-ID: US-002, AC-ID: AC-002, TC-ID: TC-002h
 *
 * @param {string} projectDir - Absolute path to the project root directory.
 * @returns {AitriState | null}
 */
export function readAitriState(projectDir) {
  let filePath = path.join(projectDir, AITRI_FILE);
  if (!fs.existsSync(filePath)) return null;

  // .aitri may be a directory (Aitri v0.1.39+): config lives at .aitri/config.json
  try {
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'config.json');
      if (!fs.existsSync(filePath)) return null;
    }
  } catch {
    return null;
  }

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  let parsed;
  try {
    // Strip BOM if present (some editors add it)
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  return {
    currentPhase: parsed.currentPhase ?? 0,
    approvedPhases: Array.isArray(parsed.approvedPhases) ? parsed.approvedPhases : [],
    completedPhases: Array.isArray(parsed.completedPhases) ? parsed.completedPhases : [],
    verifyPassed: parsed.verifyPassed === true,
    verifySummary: parsed.verifySummary ?? null,
    hasDrift: detectDrift(parsed),
    lastRejection: extractLastRejection(parsed.rejections),
    projectName: typeof parsed.projectName === 'string' ? parsed.projectName : null,
    artifactsDir: typeof parsed.artifactsDir === 'string' && parsed.artifactsDir ? parsed.artifactsDir : 'spec',
    events: Array.isArray(parsed.events) ? parsed.events.slice(-20) : [],
  };
}
