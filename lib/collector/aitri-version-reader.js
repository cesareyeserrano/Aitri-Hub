/**
 * Module: collector/aitri-version-reader
 * Purpose: Detect the installed Aitri CLI version by running `aitri --version`.
 * Dependencies: node:child_process, store/dashboard (appendLog)
 */

import { execFileSync } from 'node:child_process';
import { appendLog } from '../store/dashboard.js';
import { parseSemver } from '../utils/semver.js';

/**
 * Full-tag capture (FR-040): pre-release suffixes (-rc.N, -alpha.N) are part of
 * the version — truncating them made 2.0.0-rc.159 read as 2.0.0. The captured
 * candidate is validated with parseSemver; junk degrades to null (TC-040f).
 * @aitri-trace FR-ID: FR-040, US-ID: US-040, AC-ID: AC-0401, AC-0402, TC-ID: TC-040f
 */
const VERSION_REGEX = /v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)/;
const EXEC_TIMEOUT_MS = 3_000;

/**
 * Detect the installed Aitri CLI version.
 * Runs `aitri --version`, extracts the first semver match, and returns it.
 * Returns null (never throws) if the CLI is absent, times out, or produces
 * unparseable output.
 *
 * @aitri-trace FR-ID: FR-013, US-ID: US-013, AC-ID: AC-026, TC-ID: TC-013h
 *
 * @returns {string | null}  Semver string e.g. '0.1.77', or null on failure.
 */
export function detectAitriVersion() {
  let stdout;
  try {
    stdout = execFileSync('aitri', ['--version'], {
      timeout: EXEC_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    appendLog(
      `WARN detectAitriVersion: Aitri CLI version undetectable — ${err.code ?? err.message}`,
    );
    return null;
  }

  const match = VERSION_REGEX.exec(stdout ?? '');
  const parsed = match ? parseSemver(match[1]) : null;
  if (!parsed) {
    appendLog(
      `WARN detectAitriVersion: Aitri CLI version undetectable — no semver in output: ${String(stdout).slice(0, 80)}`,
    );
    return null;
  }

  return parsed.raw;
}
