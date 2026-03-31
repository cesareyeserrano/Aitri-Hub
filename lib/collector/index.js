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
import { evaluateAlerts, deriveStatus } from '../alerts/engine.js';
import { checkRemoteChanged } from './github-poller.js';
import { hubDir } from '../store/projects.js';
import { appendLog } from '../store/dashboard.js';
import { SCHEMA_VERSION, CACHE_DIR, STATUS, GIT_TIMEOUT_MS } from '../constants.js';

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

  // Collect each data type independently — a failure in one does not affect others.
  const aitriState        = readAitriState(projectDir);
  const artifactsDir      = aitriState?.artifactsDir ?? 'spec';
  const gitMeta           = readGitMeta(projectDir);
  const testSummary            = readTestSummary(projectDir, artifactsDir);
  const complianceSummary      = readComplianceSummary(projectDir, artifactsDir);
  const requirementsSummary    = readRequirementsSummary(projectDir, artifactsDir);
  const specQuality            = readSpecQuality(projectDir, artifactsDir);
  const externalSignals        = readExternalSignals(projectDir, artifactsDir);
  const specArtifacts          = readSpecArtifacts(projectDir, aitriState?.artifactsDir ?? '');

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
    aitriState,
    gitMeta,
    testSummary,
    complianceSummary,
    requirementsSummary,
    specQuality,
    externalSignals,
    specArtifacts,
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
export async function collectAll(projects) {
  const results = await Promise.all(projects.map(collectOne));
  return {
    schemaVersion: SCHEMA_VERSION,
    collectedAt: new Date().toISOString(),
    projects: results,
  };
}
