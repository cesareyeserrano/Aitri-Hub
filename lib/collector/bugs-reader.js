/**
 * Module: collector/bugs-reader
 * Purpose: Read and summarize BUGS.json per project per the Aitri Integration Contract v0.1.67+.
 * Dependencies: node:fs, node:path
 *
 * @aitri-trace FR-ID: FR-017, US-ID: US-017, AC-ID: AC-033, AC-034, TC-ID: TC-017h, TC-017f, TC-017e
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Read and summarize BUGS.json for a project.
 * Returns a compact count object or null when the file is absent or malformed.
 *
 * @param {string} projectDir   - Absolute path to the project root.
 * @param {string} artifactsDir - Subdirectory for spec artifacts ('' or 'spec').
 * @returns {{ open: number, fixed: number, verified: number, closed: number,
 *             critical: number, high: number, medium: number, low: number,
 *             openIds: string[] } | null}
 */
export function readBugsSummary(projectDir, artifactsDir) {
  const base = artifactsDir ? path.join(projectDir, artifactsDir) : projectDir;
  const bugsPath = path.join(base, 'BUGS.json');

  let raw;
  try {
    raw = fs.readFileSync(bugsPath, 'utf8');
  } catch {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const bugs = parsed?.bugs;
  if (!Array.isArray(bugs)) return null;

  const summary = {
    open: 0,
    fixed: 0,
    verified: 0,
    closed: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    openIds: [],
  };

  for (const b of bugs) {
    if (!b || typeof b !== 'object') continue;
    const status = (b.status ?? '').toLowerCase();
    const severity = (b.severity ?? '').toLowerCase();

    if (status === 'open') {
      summary.open++;
      summary.openIds.push(b.id ?? '');
    } else if (status === 'fixed') summary.fixed++;
    else if (status === 'verified') summary.verified++;
    else if (status === 'closed') summary.closed++;

    if (status === 'open') {
      if (severity === 'critical') summary.critical++;
      else if (severity === 'high') summary.high++;
      else if (severity === 'medium') summary.medium++;
      else if (severity === 'low') summary.low++;
    }
  }

  return summary;
}
