/**
 * Module: collector/git-reader
 * Purpose: Collect git metadata (last commit, velocity, branch) from a project directory.
 * Dependencies: node:child_process, node:path, constants
 */

import { execSync } from 'node:child_process';
import { GIT_TIMEOUT_MS } from '../constants.js';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;
const SEVEN_DAYS_MS = 7 * MS_PER_DAY;

/**
 * Run a git command in a directory, returning stdout as a trimmed string.
 * Returns null if the command exits non-zero or throws.
 *
 * @param {string} cmd - git subcommand and arguments (e.g. 'log -1 --format=%cI')
 * @param {string} cwd - Working directory for the command.
 * @param {number} [timeoutMs] - Execution timeout in milliseconds.
 * @returns {string | null}
 */
function gitExec(cmd, cwd, timeoutMs = GIT_TIMEOUT_MS) {
  try {
    const result = execSync(`git ${cmd}`, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Count commits made in the last 7 calendar days.
 *
 * @param {string} projectDir
 * @returns {number}
 */
function countRecentCommits(projectDir) {
  const since = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const output = gitExec(`log --oneline --since="${since}"`, projectDir);
  if (output === null) return 0;
  if (output === '') return 0;
  return output.split('\n').filter(Boolean).length;
}

/**
 * Collect git metadata for a project directory.
 * Returns null (never throws) if the directory is not a git repository
 * or if git is unavailable.
 *
 * @aitri-trace FR-ID: FR-003, US-ID: US-003, AC-ID: AC-004, TC-ID: TC-003h
 *
 * @param {string} projectDir - Absolute path to project root.
 * @param {{ timeoutMs?: number }} [options]
 * @returns {GitMeta | null}
 */
export function readGitMeta(projectDir, options = {}) {
  const timeout = options.timeoutMs ?? GIT_TIMEOUT_MS;

  // Verify this is a git repository before attempting further reads.
  const revParse = gitExec('rev-parse --is-inside-work-tree', projectDir, timeout);
  if (revParse !== 'true') return null;

  const lastCommitIso = gitExec('log -1 --format=%cI', projectDir, timeout);
  if (!lastCommitIso) {
    // Repository exists but has no commits.
    return {
      isGitRepo: true,
      lastCommitAt: null,
      lastCommitAgeHours: null,
      commitVelocity7d: 0,
      branch: gitExec('rev-parse --abbrev-ref HEAD', projectDir, timeout) ?? 'unknown',
    };
  }

  const lastCommitDate = new Date(lastCommitIso);
  const ageHours = (Date.now() - lastCommitDate.getTime()) / MS_PER_HOUR;
  const branch = gitExec('rev-parse --abbrev-ref HEAD', projectDir, timeout) ?? 'unknown';
  const velocity = countRecentCommits(projectDir);

  return {
    isGitRepo: true,
    lastCommitAt: lastCommitDate.toISOString(),
    lastCommitAgeHours: Math.round(ageHours * 10) / 10,
    commitVelocity7d: velocity,
    branch,
  };
}
