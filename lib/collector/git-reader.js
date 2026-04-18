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

/** Filenames that indicate a committed secret/env file. */
const SENSITIVE_FILES = ['.env', '.env.local', '.env.production', '.env.staging', '.env.development'];

/** Patterns in commit messages that suggest a hardcoded secret. */
const SECRET_PATTERNS = [
  /password\s*[=:]/i,
  /api[_-]?key\s*[=:]/i,
  /secret\s*[=:]/i,
  /token\s*[=:]/i,
  /private[_-]?key\s*[=:]/i,
  /access[_-]?key\s*[=:]/i,
];

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
 * Detect whether recent commits (last 20) all target the default branch directly
 * with no evidence of feature branches or merge commits.
 * Returns true when no branching pattern is detected.
 * @param {string} projectDir
 * @param {string} branch
 * @returns {boolean}
 */
function detectNoBranchPattern(projectDir, branch) {
  // Check for merge commits in last 30 commits — presence means PRs/branches exist.
  const merges = gitExec('log -30 --merges --oneline', projectDir);
  if (merges && merges.length > 0) return false;
  // Check if any remote branch other than the default exists.
  const branches = gitExec('branch -r --no-color', projectDir);
  if (!branches) return false;
  const otherBranches = branches.split('\n')
    .map(b => b.trim())
    .filter(b => b && !b.includes('HEAD') && !b.endsWith(`/${branch}`));
  return otherBranches.length === 0;
}

/**
 * Check whether any sensitive env file appears in the full git history.
 * Returns the filename if found, null otherwise.
 * @param {string} projectDir
 * @returns {string | null}
 */
function detectEnvFileCommitted(projectDir) {
  for (const file of SENSITIVE_FILES) {
    const result = gitExec(`log --all --full-history --oneline -- ${file}`, projectDir);
    if (result && result.length > 0) return file;
  }
  return null;
}

/**
 * Scan recent commit messages (last 20) for secret-like patterns.
 * Returns the offending message snippet or null if clean.
 * @param {string} projectDir
 * @returns {string | null}
 */
function detectSecretInCommits(projectDir) {
  const log = gitExec('log -20 --format=%s', projectDir);
  if (!log) return null;
  for (const line of log.split('\n').filter(Boolean)) {
    if (SECRET_PATTERNS.some(re => re.test(line))) {
      return line.slice(0, 60);
    }
  }
  return null;
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

  // Unpushed commits — null means no tracking branch (distinct from 0 = all pushed).
  const unpushedRaw = gitExec('rev-list @{u}..HEAD --count', projectDir, timeout);
  const unpushedCommits = unpushedRaw !== null ? parseInt(unpushedRaw, 10) || 0 : null;

  // Uncommitted files — count of tracked files with staged or unstaged changes.
  const statusRaw = gitExec('status --porcelain', projectDir, timeout);
  const uncommittedFiles = statusRaw !== null
    ? (statusRaw === '' ? 0 : statusRaw.split('\n').filter(Boolean).length)
    : null;

  return {
    isGitRepo: true,
    lastCommitAt: lastCommitDate.toISOString(),
    lastCommitAgeHours: Math.round(ageHours * 10) / 10,
    commitVelocity7d: velocity,
    branch,
    unpushedCommits,
    uncommittedFiles,
    // Git practice signals
    noBranchPattern:  detectNoBranchPattern(projectDir, branch),
    envFileCommitted: detectEnvFileCommitted(projectDir),
    secretInCommit:   detectSecretInCommits(projectDir),
  };
}
