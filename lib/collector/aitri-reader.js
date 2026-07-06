/**
 * Module: collector/aitri-reader
 * Purpose: Read and parse the .aitri state file from an Aitri project directory.
 * Dependencies: node:fs, node:path, node:crypto
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const AITRI_FILE = '.aitri';
const FEATURES_DIR = 'features';
const FEATURES_CAP = 10;

/**
 * Artifact filename map per the Aitri ↔ Hub Integration Contract v2.0.0-rc.159.
 * Maps phase key (as string) to its CANONICAL (post-rc.41) artifact filename;
 * pre-rc.41 names are reached through LEGACY_ALIASES via resolveArtifact.
 * Used by detectDrift for dynamic hash check.
 */
const ARTIFACT_MAP = Object.freeze({
  discovery: '00_DISCOVERY.md',
  ux: '01_UX_SPEC.md',
  1: '01_REQUIREMENTS.json',
  2: '02_SYSTEM_DESIGN.md',
  3: '03_TEST_CASES.json',
  4: '04_BUILD_REPORT.json',
  '4r': '04_CODE_REVIEW.md',
  5: '05_TRACEABILITY.json',
});

/**
 * Pre-rc.41 filenames for artifacts renamed by Aitri ADR-042. The fallback path
 * serves old CLIs by design, so reads try the canonical (new) name first and
 * fall back to the legacy name; the new name wins when both exist.
 * Exported for tests (TRD ADR-H2).
 */
export const LEGACY_ALIASES = Object.freeze({
  '04_BUILD_REPORT.json': '04_IMPLEMENTATION_MANIFEST.json',
  '05_TRACEABILITY.json': '05_PROOF_OF_COMPLIANCE.json',
});

/**
 * Resolve an artifact path trying the canonical name first, then its pre-rc.41
 * legacy alias. Returns the first existing absolute path, or the canonical path
 * when neither exists (callers keep their existing missing-file degradation).
 *
 * @aitri-trace FR-ID: FR-041, US-ID: US-041, AC-ID: AC-0411, TC-ID: TC-041h, TC-041e, TC-041f
 * @param {string} baseDir       - Directory holding the artifacts (project root + artifactsDir).
 * @param {string} canonicalName - Post-rc.41 artifact filename (e.g. "05_TRACEABILITY.json").
 * @returns {string} Absolute path to read.
 */
export function resolveArtifact(baseDir, canonicalName) {
  const canonical = path.join(baseDir, canonicalName);
  if (fs.existsSync(canonical)) return canonical;
  const alias = LEGACY_ALIASES[canonicalName];
  if (alias) {
    const legacy = path.join(baseDir, alias);
    if (fs.existsSync(legacy)) return legacy;
  }
  return canonical;
}

/**
 * Resolve the base directory Aitri-owned files live under, honoring the rc.76
 * contained layout (.aitri#layoutRoot) with strict confinement to the project
 * root (NFR-045): absolute paths, `..` traversal, and symlinks escaping the
 * root are all rejected — the field is then ignored with a warning, and the
 * project reads as flat. A dangling (not-yet-created) layoutRoot must not
 * throw: the realpath check applies to the deepest EXISTING ancestor.
 *
 * @aitri-trace FR-ID: FR-043, US-ID: US-043, AC-ID: AC-0431, AC-0432, TC-ID: TC-043e, TC-043f, TC-145h, TC-145e, TC-145f
 * @param {string} projectDir - Absolute path to the project root.
 * @param {object} parsed     - Raw parsed .aitri JSON (reads parsed.layoutRoot).
 * @returns {string} Confined base directory (projectDir when layoutRoot is absent/rejected).
 */
export function layoutBase(projectDir, parsed) {
  // Normalize first: a registered path with a trailing slash must not fail the
  // lexical containment check below (adversarial finding, 2026-07-05).
  projectDir = path.resolve(projectDir);
  const layoutRoot = parsed?.layoutRoot;
  if (typeof layoutRoot !== 'string' || layoutRoot === '') return projectDir;

  const reject = reason => {
    console.warn(
      `[aitri-hub] layoutRoot "${layoutRoot}" in ${projectDir} rejected (${reason}) — reading as flat layout`,
    );
    return projectDir;
  };

  if (path.isAbsolute(layoutRoot)) return reject('absolute path');

  const resolved = path.resolve(projectDir, layoutRoot);
  let rootReal;
  try {
    rootReal = fs.realpathSync(projectDir);
  } catch {
    return reject('project root unresolvable');
  }
  // Lexical containment first: catches plain `..` traversal cheaply.
  if (resolved !== projectDir && !resolved.startsWith(projectDir + path.sep)) {
    return reject('escapes project root');
  }
  // Symlink containment: realpath of the deepest existing ancestor of `resolved`
  // must stay inside the real project root (dangling dirs must not throw).
  let probe = resolved;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  try {
    const probeReal = fs.realpathSync(probe);
    if (probeReal !== rootReal && !probeReal.startsWith(rootReal + path.sep)) {
      return reject('symlink escapes project root');
    }
  } catch {
    return reject('unresolvable path');
  }
  return resolved;
}

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
  } catch {
    return null;
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
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
  try {
    entries = fs.readdirSync(featuresDir);
  } catch {
    return [];
  }
  const features = [];
  for (const entry of entries) {
    if (features.length >= FEATURES_CAP) break;
    const featureDir = path.join(featuresDir, entry);
    try {
      if (!fs.statSync(featureDir).isDirectory()) continue;
    } catch {
      continue;
    }
    const parsed = readStateFile(featureDir);
    if (!parsed) continue;
    features.push({
      name: entry,
      currentPhase: parsed.currentPhase ?? 0,
      approvedPhases: Array.isArray(parsed.approvedPhases) ? parsed.approvedPhases : [],
      completedPhases: Array.isArray(parsed.completedPhases) ? parsed.completedPhases : [],
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
  // artifactsDir is PROJECT-ROOT-relative and already includes the contained
  // layout ("aitri/product/spec" per SCHEMA.md) — never re-prefix layoutRoot.
  const base =
    typeof parsed.artifactsDir === 'string' && parsed.artifactsDir ? parsed.artifactsDir : '';

  for (const phase of approvedStrs) {
    const storedHash = hashes[phase];
    if (!storedHash) continue; // No hash = approved before v0.1.51 = not drift.

    const artifactFile = ARTIFACT_MAP[phase];
    if (!artifactFile) continue; // Unknown phase key — skip.

    const fullPath = resolveArtifact(base ? path.join(projectDir, base) : projectDir, artifactFile);

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

  // rc.51 state split (FR-042): per-machine fields live in gitignored .aitri.local.
  // Merge them over the shared view when present; absence (every remote clone) is
  // normal; a malformed file is ignored with a warning — never an error.
  /** @aitri-trace FR-ID: FR-042, US-ID: US-042, AC-ID: AC-0421, AC-0422, TC-ID: TC-042h, TC-042e, TC-042f */
  const localPath = path.join(projectDir, '.aitri.local');
  if (fs.existsSync(localPath)) {
    try {
      const local = JSON.parse(fs.readFileSync(localPath, 'utf8').replace(/^\uFEFF/, ''));
      if (local && typeof local === 'object') {
        for (const k of ['lastSession', 'reconcileState', 'sessionContext']) {
          if (local[k] !== undefined) parsed[k] = local[k];
        }
      }
    } catch {
      console.warn(`[aitri-hub] malformed .aitri.local in ${projectDir} — ignored`);
    }
  }

  const base = layoutBase(projectDir, parsed);

  return {
    currentPhase: parsed.currentPhase ?? 0,
    approvedPhases: Array.isArray(parsed.approvedPhases) ? parsed.approvedPhases : [],
    completedPhases: Array.isArray(parsed.completedPhases) ? parsed.completedPhases : [],
    verifyPassed: parsed.verifyPassed === true,
    verifySummary: parsed.verifySummary ?? null,
    hasDrift: detectDrift(parsed, projectDir),
    driftPhases: Array.isArray(parsed.driftPhases) ? parsed.driftPhases.map(String) : [],
    lastRejection: extractLastRejection(parsed.rejections),
    // FR-011: projectName defaults to directory basename — not null.
    projectName:
      typeof parsed.projectName === 'string' ? parsed.projectName : path.basename(projectDir),
    // FR-011: artifactsDir defaults to '' (empty) — not 'spec'. 'spec' only when explicit.
    artifactsDir:
      typeof parsed.artifactsDir === 'string' && parsed.artifactsDir ? parsed.artifactsDir : '',
    // FR-010: new fields — null when absent or wrong type.
    aitriVersion: typeof parsed.aitriVersion === 'string' ? parsed.aitriVersion : null,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
    events: Array.isArray(parsed.events) ? parsed.events.slice(-20) : [],
    features: readFeatures(base),
    // FR-043 (additive): absolute confined base dir Aitri-owned files live under.
    // Equals projectDir for flat projects; projectDir/<layoutRoot> for contained ones.
    layoutBase: base,
    // FR-019: expose lastSession from .aitri (v0.1.70+). null when absent (pre-v0.1.70).
    lastSession:
      parsed.lastSession != null
        ? {
            at: typeof parsed.lastSession.at === 'string' ? parsed.lastSession.at : null,
            agent: typeof parsed.lastSession.agent === 'string' ? parsed.lastSession.agent : null,
            event: typeof parsed.lastSession.event === 'string' ? parsed.lastSession.event : null,
            files_touched: Array.isArray(parsed.lastSession.files_touched)
              ? parsed.lastSession.files_touched
              : null,
          }
        : null,
  };
}
