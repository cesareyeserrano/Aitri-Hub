/**
 * Module: collector/index
 * Purpose: Orchestrate parallel data collection for all registered projects.
 * Dependencies: collector/aitri-reader, collector/git-reader, collector/test-reader,
 *               alerts/engine, store/projects, node:fs, node:path, constants
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { readAitriState } from './aitri-reader.js';
import { readGitMeta } from './git-reader.js';
import { readTestSummary } from './test-reader.js';
import { evaluateAlerts, deriveStatus } from '../alerts/engine.js';
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
 * Returns { ok: boolean, stale: boolean }.
 *
 * @aitri-trace FR-ID: FR-008, US-ID: US-002, AC-ID: AC-002, TC-ID: TC-008h
 *
 * @param {ProjectEntry} project
 * @param {string} cacheDir - Absolute path to the cache directory for this project.
 * @returns {{ ok: boolean, stale: boolean }}
 */
function syncRemoteProject(project, cacheDir) {
  const isCloned = fs.existsSync(path.join(cacheDir, '.git'));

  try {
    if (!isCloned) {
      fs.mkdirSync(cacheDir, { recursive: true });
      execSync(`git clone "${project.location}" "${cacheDir}"`, {
        timeout: GIT_TIMEOUT_MS * 6, // cloning can take longer
        stdio: 'ignore',
      });
    } else {
      execSync('git pull --ff-only', {
        cwd: cacheDir,
        timeout: GIT_TIMEOUT_MS,
        stdio: 'ignore',
      });
    }
    return { ok: true, stale: false };
  } catch (err) {
    appendLog(`Remote sync failed for ${project.name}: ${err.message}`);
    return { ok: isCloned, stale: true };
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
  if (project.type === 'remote') {
    const sync = syncRemoteProject(project, projectDir);
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
        collectionError: 'Remote clone failed and no local cache available.',
      };
    }
    cacheStale = sync.stale;
  }

  // Collect each data type independently — a failure in one does not affect others.
  const aitriState = readAitriState(projectDir);
  const gitMeta = readGitMeta(projectDir);
  const testSummary = readTestSummary(projectDir);

  if (aitriState === null && !fs.existsSync(path.join(projectDir, '.aitri'))) {
    collectionError = '.aitri file not found or malformed.';
  }

  const data = {
    id: project.id,
    name: project.name,
    location: project.location,
    type: project.type,
    group: project.group ?? null,
    aitriState,
    gitMeta,
    testSummary,
    cacheStale,
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
