/**
 * Module: collector/spec-reader
 * Purpose: Read spec artifacts (FRs, TCs) from an Aitri project's spec directory.
 *          Strips verbose fields (description, acceptance_criteria) to keep dashboard.json lean.
 * Dependencies: node:fs, node:path
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Read spec artifacts for a project — FRs from 01_REQUIREMENTS.json and TCs from
 * 03_TEST_CASES.json. Returns null if neither file can be read.
 *
 * @aitri-trace FR-ID: FR-014, US-ID: US-014, AC-ID: AC-028, TC-ID: TC-014h, TC-014f, TC-014e
 *
 * @param {string} projectDir   - Absolute path to the project root.
 * @param {string} artifactsDir - aitriState.artifactsDir value ('' or 'spec').
 * @returns {{ frs: object[], tcs: object[] } | null}
 */
export function readSpecArtifacts(projectDir, artifactsDir) {
  const base = artifactsDir
    ? path.join(projectDir, artifactsDir)
    : projectDir;

  let frs = null;
  try {
    const raw    = fs.readFileSync(path.join(base, '01_REQUIREMENTS.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const items  = parsed.functional_requirements ?? [];
    frs = items.map(fr => ({
      id:       fr.id,
      title:    fr.title ?? '',
      priority: fr.priority ?? null,
      phase:    fr.phase   ?? '1',
    }));
  } catch { /* file absent or malformed — leave frs null */ }

  let tcs = null;
  try {
    const raw    = fs.readFileSync(path.join(base, '03_TEST_CASES.json'), 'utf8');
    const parsed = JSON.parse(raw);
    const items  = parsed.test_cases ?? [];
    tcs = items.map(tc => ({
      id:     tc.id,
      title:  tc.title ?? '',
      fr_ids: Array.isArray(tc.fr_ids) ? tc.fr_ids : [],
      phase:  tc.phase ?? '3',
    }));
  } catch { /* file absent or malformed — leave tcs null */ }

  if (frs === null && tcs === null) return null;
  return { frs: frs ?? [], tcs: tcs ?? [] };
}
