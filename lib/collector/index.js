/**
 * Module: collector/index
 * Purpose: Orchestrate parallel data collection for all registered projects.
 * Dependencies: collector/aitri-reader, collector/git-reader, collector/test-reader,
 *               alerts/engine, store/projects, node:fs, node:path, constants
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readAitriState } from './aitri-reader.js';
import { readGitMeta } from './git-reader.js';
import { readTestSummary } from './test-reader.js';
import { readComplianceSummary } from './compliance-reader.js';
import { readRequirementsSummary } from './requirements-reader.js';
import { readSpecQuality } from './spec-quality-reader.js';
import { readExternalSignals } from './external-signals-reader.js';
import { readSpecArtifacts } from './spec-reader.js';
import { readBugsSummary } from './bugs-reader.js';
import { evaluateAlerts, deriveStatus } from '../alerts/engine.js';
import { checkRemoteChanged } from './github-poller.js';
import { detectAitriVersion } from './aitri-version-reader.js';
import { evaluateIntegrationAlert } from './integration-guard.js';
import { readManifest } from '../store/compat-manifest.js';
import { readAndHashSection } from './changelog.js';
import { readFeaturePipelines } from './feature-reader.js';
import { readAppVersion } from './app-version-reader.js';
import { scanFolder } from './folder-scanner.js';
import { readSnapshot, projectFromSnapshot } from './snapshot-reader.js';
import { hubDir } from '../store/projects.js';
import { appendLog, appendStructuredLog } from '../store/dashboard.js';
import {
  SCHEMA_VERSION,
  CACHE_DIR,
  STATUS,
  GIT_TIMEOUT_MS,
  FALLBACK_BASELINE,
} from '../constants.js';

const SNAPSHOT_MIN_AITRI_VERSION = '0.1.77';

/**
 * Compare two semver-like strings ("a.b.c"). Returns -1, 0, 1.
 * Non-numeric segments are treated as 0.
 */
function semverCmp(a, b) {
  const pa = String(a)
    .split('.')
    .map(n => Number.parseInt(n, 10) || 0);
  const pb = String(b)
    .split('.')
    .map(n => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Lightweight raw read of the .aitri JSON (file or directory form) for the
 * preflight version check and the lastSession field. Does NOT invoke any of the
 * demoted readers — keeps the snapshot success path free of legacy reader calls.
 *
 * @param {string} projectDir
 * @returns {object|null}  Parsed JSON or null on miss/error.
 */
function readAitriRaw(projectDir) {
  let filePath = path.join(projectDir, '.aitri');
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
 * Resolve the local filesystem path for a project.
 * For remote projects, uses the cached clone path.
 *
 * @param {ProjectEntry} project
 * @returns {string}
 */
function resolveProjectDir(project) {
  if (project.type === 'local') return project.location;
  const slug = project.location
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .split('/')
    .pop()
    .replace(/[^a-z0-9-]/gi, '-');
  return path.join(hubDir(), CACHE_DIR, slug);
}

/**
 * Clone or pull a remote project into the local cache.
 * For GitHub projects: checks updatedAt via raw content before pulling.
 * Only pulls when a change is detected or on first run (no local clone yet).
 * Returns { ok: boolean, stale: boolean, rateLimited: boolean }.
 *
 * @aitri-trace FR-ID: FR-008, US-ID: US-002, AC-ID: AC-002, TC-ID: TC-008h
 *
 * @param {ProjectEntry} project
 * @param {string} cacheDir - Absolute path to the cache directory for this project.
 * @returns {Promise<{ ok: boolean, stale: boolean, rateLimited: boolean }>}
 */
async function syncRemoteProject(project, cacheDir) {
  const isCloned = fs.existsSync(path.join(cacheDir, '.git'));

  // For GitHub projects: use lightweight poller to decide whether a pull is needed.
  // Skip the poll check on first run (no local clone) — must clone unconditionally.
  const isGitHub = project.location.includes('github.com');
  if (isGitHub && isCloned) {
    const { changed, rateLimited } = await checkRemoteChanged(project.id, project.location);
    if (rateLimited) {
      // GitHub rate-limited us — use cached clone, mark as stale so UI can show warning.
      return { ok: true, stale: true, rateLimited: true };
    }
    if (!changed) {
      // No change detected — skip pull, serve from cached clone.
      return { ok: true, stale: false, rateLimited: false };
    }
    // Fall through to git pull below.
  }

  try {
    if (!isCloned) {
      fs.mkdirSync(cacheDir, { recursive: true });
      // Use execFileSync with argument array — no shell interpolation, no injection risk.
      execFileSync('git', ['clone', project.location, cacheDir], {
        timeout: GIT_TIMEOUT_MS * 6, // cloning can take longer
        stdio: 'ignore',
      });
    } else {
      execFileSync('git', ['pull', '--ff-only'], {
        cwd: cacheDir,
        timeout: GIT_TIMEOUT_MS,
        stdio: 'ignore',
      });
    }
    return { ok: true, stale: false, rateLimited: false };
  } catch (err) {
    appendLog(`Remote sync failed for ${project.name}: ${err.message}`);
    return { ok: isCloned, stale: true, rateLimited: false };
  }
}

/**
 * Collect data for a single project. Never throws — all errors are captured
 * in the returned ProjectData.collectionError field.
 *
 * @aitri-trace FR-ID: FR-002, FR-003, FR-004, TC-ID: TC-002h, TC-003h, TC-004h
 *
 * @param {ProjectEntry} project
 * @returns {Promise<ProjectData>}
 */
export async function collectOne(project) {
  let projectDir = resolveProjectDir(project);
  let cacheStale = false;
  let collectionError = null;

  // For remote projects: sync the local cache first.
  let rateLimited = false;
  if (project.type === 'remote') {
    const sync = await syncRemoteProject(project, projectDir);
    if (!sync.ok) {
      return {
        id: project.id,
        name: project.name,
        location: project.location,
        type: project.type,
        status: STATUS.UNREADABLE,
        aitriState: null,
        gitMeta: null,
        testSummary: null,
        alerts: [],
        cacheStale: false,
        rateLimited: false,
        collectionError: 'Remote clone failed and no local cache available.',
      };
    }
    cacheStale = sync.stale;
    rateLimited = sync.rateLimited ?? false;
  }

  // Collectors that always run (independent of snapshot path).
  const gitMeta = readGitMeta(projectDir);
  const appVersion = readAppVersion(projectDir);

  // Decide snapshot eligibility from .aitri.aitriVersion BEFORE any spawn — and
  // BEFORE invoking the demoted readers. Lightweight inline read so the snapshot
  // success path never touches readAitriState/readTestSummary/etc (FR-011).
  const aitriRaw = readAitriRaw(projectDir);
  const detectedVer = typeof aitriRaw?.aitriVersion === 'string' ? aitriRaw.aitriVersion : null;
  // Missing aitriVersion → treat as too-old. The snapshot contract was added
  // in v0.1.77; pre-version-field projects are pre-v0.1.70 and legacy-only.
  const versionTooOld =
    detectedVer === null || semverCmp(detectedVer, SNAPSHOT_MIN_AITRI_VERSION) < 0;
  const snapshotEligible = project.type === 'local' && !versionTooOld;

  let aitriState = null;
  let testSummary = null;
  let aggregatedTestSummary = null;
  let complianceSummary = null;
  let requirementsSummary = null;
  let bugsSummary = null;
  let nextActions = [];
  let health = {};
  let audit = { exists: false, stalenessDays: null };
  let normalize = { state: null, method: null, baseRef: null, uncountedFiles: null };
  let lastSession = null;
  // Show 'version_too_old' only when the version is actually detected and below
  // the floor. Missing version (legacy projects) takes the legacy path silently.
  let degradationReason = detectedVer !== null && versionTooOld ? 'version_too_old' : null;
  let snapshotVersion = null;

  if (snapshotEligible) {
    const result = await readSnapshot(projectDir);
    if (result.ok) {
      const projected = projectFromSnapshot(result.snapshot);
      aitriState = projected.aitriState ?? aitriState;
      testSummary = projected.testSummary;
      aggregatedTestSummary = projected.aggregatedTestSummary;
      complianceSummary = projected.complianceSummary;
      requirementsSummary = projected.requirementsSummary;
      bugsSummary = projected.bugsSummary;
      nextActions = projected.nextActions;
      health = projected.health;
      audit = projected.audit;
      normalize = projected.normalize;
      lastSession = projected.lastSession;
      snapshotVersion = projected.snapshotVersion;
      // Snapshot does not yet expose lastSession; pull it from .aitri inline so
      // the snapshot path can still render FR-016 without invoking readAitriState.
      if (
        lastSession === null &&
        aitriRaw?.lastSession &&
        typeof aitriRaw.lastSession === 'object'
      ) {
        lastSession = {
          event: typeof aitriRaw.lastSession.event === 'string' ? aitriRaw.lastSession.event : null,
          agent: typeof aitriRaw.lastSession.agent === 'string' ? aitriRaw.lastSession.agent : null,
          at: typeof aitriRaw.lastSession.at === 'string' ? aitriRaw.lastSession.at : null,
        };
      }
    } else {
      degradationReason = result.reason;
      appendStructuredLog({
        project: project.name,
        reason: result.reason,
        durationMs: result.durationMs,
        ...(result.detail ? { detail: result.detail } : {}),
      });
    }
  }

  // Legacy / fallback path: invoked when snapshot is ineligible OR snapshot failed.
  // Demoted readers; they remain on disk (FR-017) but are only called here.
  if (degradationReason !== null || !snapshotEligible) {
    const artifactsDir = aitriState?.artifactsDir ?? 'spec';
    if (!aitriState) {
      aitriState = readAitriState(projectDir);
    }
    testSummary = testSummary ?? readTestSummary(projectDir, artifactsDir);
    complianceSummary = complianceSummary ?? readComplianceSummary(projectDir, artifactsDir);
    requirementsSummary = requirementsSummary ?? readRequirementsSummary(projectDir, artifactsDir);
    bugsSummary = bugsSummary ?? readBugsSummary(projectDir, aitriState?.artifactsDir ?? '');
    if (lastSession === null && aitriState?.lastSession) lastSession = aitriState.lastSession;
  }

  // Always-run unchanged readers (independent of snapshot path).
  const artifactsDir = aitriState?.artifactsDir ?? 'spec';
  const mainTcTotal = testSummary?.total ?? 0;
  const { featurePipelines, aggregatedTcTotal } = readFeaturePipelines(projectDir, mainTcTotal);
  const specQuality = readSpecQuality(projectDir, artifactsDir);
  const externalSignals = readExternalSignals(projectDir, artifactsDir);
  const specArtifacts = readSpecArtifacts(projectDir, aitriState?.artifactsDir ?? '');

  if (aitriState === null) {
    collectionError = '.aitri file not found or malformed.';
  }

  const data = {
    id: project.id,
    // Prefer projectName from .aitri — source of truth over whatever was registered.
    name: aitriState?.projectName ?? project.name,
    location: project.location,
    type: project.type,
    group: project.group ?? null,
    ...(project.parentFolder !== undefined ? { parentFolder: project.parentFolder } : {}),
    appVersion,
    aitriState,
    gitMeta,
    testSummary,
    aggregatedTestSummary,
    complianceSummary,
    requirementsSummary,
    specQuality,
    externalSignals,
    specArtifacts,
    bugsSummary,
    featurePipelines,
    aggregatedTcTotal,
    nextActions,
    health,
    audit,
    normalize,
    lastSession,
    degradationReason,
    snapshotVersion,
    cacheStale,
    rateLimited,
    collectionError,
  };

  const alerts = evaluateAlerts(data);
  const status = aitriState === null ? STATUS.UNREADABLE : deriveStatus(alerts);

  return { ...data, alerts, status };
}

/**
 * Collect data for all registered projects in parallel.
 *
 * @aitri-trace FR-ID: FR-002, FR-003, FR-004, FR-007, FR-009
 *
 * @param {ProjectEntry[]} projects
 * @returns {Promise<DashboardData>}
 */
/**
 * Collect data for all registered projects in parallel.
 * Also runs integration version gate and embeds result at the dashboard level.
 *
 * @aitri-trace FR-ID: FR-002, FR-003, FR-004, FR-007, FR-009, FR-010, FR-013
 *
 * @param {ProjectEntry[]} projects
 * @returns {Promise<DashboardData>}
 */
export async function collectAll(projects) {
  const detectedAitriVersion = detectAitriVersion();

  // FR-033: re-read the manifest on every cycle so review commands take effect
  // without a process restart. The function never throws; malformed files
  // degrade to 'absent' with a WARN log.
  const manifest = readManifest();
  const effectiveReviewedUpTo =
    manifest.status === 'valid' ? manifest.data.reviewedUpTo : FALLBACK_BASELINE;
  const manifestReviewedAt = manifest.status === 'valid' ? manifest.data.reviewedAt : null;
  const manifestChangelogHash = manifest.status === 'valid' ? manifest.data.changelogHash : null;

  // FR-036: compute the live CHANGELOG hash only when the manifest already
  // stores one (drift check is opt-in). Failure to locate the CHANGELOG is
  // logged but does not break the cycle — we simply skip the drift check.
  let currentChangelogHash = null;
  if (manifestChangelogHash !== null) {
    try {
      currentChangelogHash = readAndHashSection(effectiveReviewedUpTo).hash;
    } catch (err) {
      appendLog(`WARN changelog not located for drift check (${err.code ?? 'UNKNOWN'}) — skipping`);
    }
  }

  const integrationAlert = evaluateIntegrationAlert(detectedAitriVersion, effectiveReviewedUpTo, {
    reviewedAt: manifestReviewedAt,
    changelogHash: manifestChangelogHash,
    currentChangelogHash,
  });

  // Expand folder-type projects into individual child stubs before collecting
  const expanded = [];
  for (const project of projects) {
    if (project.type === 'folder') {
      const children = scanFolder(project.location);
      expanded.push(...children);
    } else {
      expanded.push(project);
    }
  }

  const results = await Promise.all(expanded.map(collectOne));
  return {
    schemaVersion: SCHEMA_VERSION,
    collectedAt: new Date().toISOString(),
    meta: { detectedAitriVersion },
    integrationAlert,
    projects: results,
  };
}
