/**
 * Module: collector/test-reader
 * Purpose: Read spec/04_TEST_RESULTS.json from an Aitri project directory.
 * Dependencies: node:fs, node:path
 */

import fs from 'node:fs';
import path from 'node:path';

const TEST_RESULTS_PATH = path.join('spec', '04_TEST_RESULTS.json');

/**
 * Read and parse spec/04_TEST_RESULTS.json from a project directory.
 * Returns null (never throws) if the file is absent or malformed.
 *
 * @aitri-trace FR-ID: FR-004, US-ID: US-004, AC-ID: AC-005, TC-ID: TC-004h
 *
 * @param {string} projectDir - Absolute path to project root.
 * @returns {TestSummary | null}
 */
export function readTestSummary(projectDir) {
  const filePath = path.join(projectDir, TEST_RESULTS_PATH);
  if (!fs.existsSync(filePath)) return null;

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const summary = parsed.summary ?? {};
  const frCoverage = Array.isArray(parsed.fr_coverage)
    ? parsed.fr_coverage.map(entry => ({
        frId: entry.fr_id,
        status: entry.status,
      }))
    : [];

  const toCount = v => (Number.isInteger(v) && v >= 0 ? v : 0);

  return {
    available: true,
    passed: toCount(summary.passed),
    failed: toCount(summary.failed),
    skipped: toCount(summary.skipped),
    total: toCount(summary.total),
    frCoverage,
  };
}
