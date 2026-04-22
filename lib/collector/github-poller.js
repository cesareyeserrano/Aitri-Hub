/**
 * Module: collector/github-poller
 * Purpose: Lightweight GitHub raw-content check — compare .aitri updatedAt
 *          before running a full git pull. Avoids unnecessary network traffic
 *          and respects GitHub rate limits.
 * Dependencies: node:https, constants
 *
 * Only public repos are supported (no token required).
 * Branch resolution: tries 'main' first, then 'master'.
 * Rate limit (429): backs off per project for BACKOFF_MS before retrying.
 */

import https from 'node:https';
import { REMOTE_REFRESH_MS } from '../constants.js';

const BACKOFF_MS = 5 * 60 * 1000; // 5 minutes on 429

/**
 * Per-project poll state.
 * Map<projectId, { lastCheckedAt: number, lastUpdatedAt: string|null, backoffUntil: number, branch: string|null }>
 */
const _state = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a GitHub URL into { owner, repo }.
 * Returns null for non-GitHub or malformed URLs.
 * @param {string} url
 * @returns {{ owner: string, repo: string } | null}
 */
export function parseGitHubUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/github\.com[/:]([^/]+)\/([^/.\s]+?)(?:\.git)?(?:[/#?].*)?$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * Make an HTTPS GET request. Returns { status, body } or throws on network error / timeout.
 * @param {string} url
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<{ status: number, body: string }>}
 */
function httpsGet(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'aitri-hub' } }, res => {
      let body = '';
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

/**
 * Resolve the default branch for a GitHub repo (tries 'main' then 'master').
 * Caches the result in _state for the project lifetime.
 * Returns null if both fail.
 * @param {string} owner
 * @param {string} repo
 * @param {string | null} cached - previously resolved branch (skip probe if set)
 * @returns {Promise<string | null>}
 */
async function resolveBranch(owner, repo, cached) {
  if (cached) return cached;
  for (const branch of ['main', 'master']) {
    try {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/.aitri`;
      const { status } = await httpsGet(url);
      if (status === 200 || status === 429) return branch; // 429 means it exists but we're rate-limited
    } catch {
      /* network error — try next */
    }
  }
  return null;
}

/**
 * Fetch the .aitri file from GitHub raw content and extract updatedAt.
 * Returns { updatedAt: string|null, rateLimited: boolean }.
 * @param {string} owner
 * @param {string} repo
 * @param {string} branch
 * @returns {Promise<{ updatedAt: string|null, rateLimited: boolean }>}
 */
async function fetchUpdatedAt(owner, repo, branch) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/.aitri`;
  try {
    const { status, body } = await httpsGet(url);
    if (status === 429) return { updatedAt: null, rateLimited: true };
    if (status !== 200) return { updatedAt: null, rateLimited: false };
    const parsed = JSON.parse(body);
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    return { updatedAt, rateLimited: false };
  } catch {
    return { updatedAt: null, rateLimited: false };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check whether a remote GitHub project has changed since the last poll.
 *
 * Decision logic:
 *  - If project is currently in backoff (429 received < BACKOFF_MS ago): return { changed: false, rateLimited: true }
 *  - If last check was < REMOTE_REFRESH_MS ago: return { changed: false, rateLimited: false } (too soon)
 *  - Fetch .aitri from GitHub raw content; compare updatedAt with cached value.
 *  - On 429: set backoff, return { changed: false, rateLimited: true }
 *  - On other error / missing updatedAt: treat as unchanged (conservative).
 *  - On updatedAt change (or first check with data): return { changed: true, rateLimited: false }
 *
 * @param {string} projectId  - Unique project ID (used as cache key).
 * @param {string} location   - GitHub repo URL.
 * @returns {Promise<{ changed: boolean, rateLimited: boolean, firstRun: boolean }>}
 */
export async function checkRemoteChanged(projectId, location) {
  const ghRef = parseGitHubUrl(location);
  if (!ghRef) return { changed: false, rateLimited: false, firstRun: false };

  const now = Date.now();
  const entry = _state.get(projectId) ?? {
    lastCheckedAt: 0,
    lastUpdatedAt: null,
    backoffUntil: 0,
    branch: null,
  };
  const firstRun = entry.lastCheckedAt === 0;

  // Backoff: rate-limited recently — don't retry yet.
  if (now < entry.backoffUntil) {
    return { changed: false, rateLimited: true, firstRun };
  }

  // Throttle: checked too recently.
  if (!firstRun && now - entry.lastCheckedAt < REMOTE_REFRESH_MS) {
    return { changed: false, rateLimited: false, firstRun: false };
  }

  // Resolve branch (cached after first success).
  const branch = await resolveBranch(ghRef.owner, ghRef.repo, entry.branch);
  if (!branch) {
    _state.set(projectId, { ...entry, lastCheckedAt: now });
    return { changed: false, rateLimited: false, firstRun };
  }

  // Fetch updatedAt.
  const { updatedAt, rateLimited } = await fetchUpdatedAt(ghRef.owner, ghRef.repo, branch);

  if (rateLimited) {
    _state.set(projectId, { ...entry, lastCheckedAt: now, backoffUntil: now + BACKOFF_MS, branch });
    return { changed: false, rateLimited: true, firstRun };
  }

  const changed = updatedAt !== null && updatedAt !== entry.lastUpdatedAt;
  _state.set(projectId, {
    lastCheckedAt: now,
    lastUpdatedAt: updatedAt ?? entry.lastUpdatedAt,
    backoffUntil: 0,
    branch,
  });

  return { changed: changed || firstRun, rateLimited: false, firstRun };
}

/**
 * Test-only: reset the poller state for a specific project (or all projects).
 * @param {string} [projectId]
 */
export function _resetPollerState(projectId) {
  if (projectId) _state.delete(projectId);
  else _state.clear();
}
