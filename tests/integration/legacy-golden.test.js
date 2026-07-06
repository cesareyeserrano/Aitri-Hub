/**
 * Tests: legacy golden parity (NFR-041) + fallback rc.41 names (FR-041) +
 *        contained layout end-to-end reading (FR-043)
 * Covers: TC-141h, TC-141e, TC-141f, TC-041h, TC-043h
 *
 * The golden record (tests/fixtures/legacy-golden/golden.json) was captured by
 * running the PRE-CHANGE readers over the committed pre-rc.41 fixture. Parity is
 * subset-deep-equality on the golden's own keys: every golden field must exist
 * with an equal value (new ADDITIVE fields are allowed — NFR-044 semantics; a
 * removed or changed field fails). TC-141f proves the comparison is not vacuous.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAitriState } from '../../lib/collector/aitri-reader.js';
import { readComplianceSummary } from '../../lib/collector/compliance-reader.js';
import { readBugsSummary } from '../../lib/collector/bugs-reader.js';
import { readTestSummary } from '../../lib/collector/test-reader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, '..', 'fixtures', 'legacy-golden', 'project');
const golden = JSON.parse(
  fs.readFileSync(path.join(here, '..', 'fixtures', 'legacy-golden', 'golden.json'), 'utf8'),
);

/**
 * Assert `actual` contains every field of `expected` with an equal value.
 * Returns the list of differing paths instead of throwing when collect=true.
 */
function subsetDiff(expected, actual, prefix = '') {
  const diffs = [];
  if (expected === null || typeof expected !== 'object') {
    if (!Object.is(expected, actual)) diffs.push(`${prefix || '(root)'}: ${JSON.stringify(expected)} !== ${JSON.stringify(actual)}`);
    return diffs;
  }
  if (actual === null || typeof actual !== 'object') {
    diffs.push(`${prefix || '(root)'}: expected object, got ${JSON.stringify(actual)}`);
    return diffs;
  }
  for (const k of Object.keys(expected)) {
    diffs.push(...subsetDiff(expected[k], actual[k], prefix ? `${prefix}.${k}` : k));
  }
  return diffs;
}

function collectCurrent(dir) {
  return {
    state: readAitriState(dir),
    compliance: readComplianceSummary(dir, 'spec'),
    bugs: readBugsSummary(dir),
    tests: readTestSummary(dir, 'spec'),
  };
}

describe('TC-141h: legacy golden fixture — record equality (subset on golden keys)', () => {
  it('pre-rc.41 flat project renders identically to the pre-change readers', () => {
    const current = collectCurrent(fixtureDir);
    const diffs = subsetDiff(golden, current);
    assert.deepEqual(diffs, [], `golden parity broken:\n${diffs.join('\n')}`);
  });
  it('drift verdict unchanged (hashes over the OLD-named files still match)', () => {
    const current = collectCurrent(fixtureDir);
    assert.equal(current.state.hasDrift, false);
  });
});

describe('TC-141e: legacy fixture feature subdirs stay equal', () => {
  it('feature summary section matches golden', () => {
    const current = collectCurrent(fixtureDir);
    assert.deepEqual(current.state.features, golden.state.features);
    assert.equal(current.state.features[0].name, 'f1');
  });
});

describe('TC-141f: the golden comparison detects a real change', () => {
  it('a mutated field produces a named diff (comparison is not vacuous)', () => {
    const current = collectCurrent(fixtureDir);
    current.compliance.overallStatus = 'draft'; // simulate a regression
    const diffs = subsetDiff(golden, current);
    assert.ok(diffs.length >= 1, 'mutation must be detected');
    assert.match(diffs.join('\n'), /compliance\.overallStatus/);
  });
});

describe('TC-041h: fallback reads rc.41 names without aitri CLI', () => {
  it('post-rc.41 project yields compliance + drift over the new-name files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-rc41-'));
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    const trc = JSON.stringify({
      overall_status: 'compliant',
      requirement_compliance: [{ requirement_id: 'FR-001', level: 'production_ready' }],
    });
    fs.writeFileSync(path.join(dir, 'spec', '05_TRACEABILITY.json'), trc);
    fs.writeFileSync(path.join(dir, 'spec', '04_BUILD_REPORT.json'), '{"files_created":[]}');
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({ projectName: 'rc41', approvedPhases: [4, 5], artifactsDir: 'spec' }),
    );
    const compliance = readComplianceSummary(dir, 'spec');
    assert.equal(compliance.overallStatus, 'compliant');
    assert.equal(compliance.levels.production_ready, 1);
    const state = readAitriState(dir);
    assert.equal(state.hasDrift, false); // no stored hashes → no drift, no crash on new names
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('TC-043h: contained-layout project read end-to-end (fallback)', () => {
  it('artifacts and features resolve under layoutRoot', () => {
    // Real rc.76+ contract: artifactsDir is PROJECT-ROOT-relative and already
    // includes layoutRoot ("aitri/product/spec"); features live under
    // <layoutRoot>/features. (Adversarial finding 2026-07-05 — the first
    // version of this test encoded the double-prefix misreading.)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-contained-'));
    fs.mkdirSync(path.join(dir, 'aitri', 'product', 'spec'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'aitri', 'features', 'fx'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        projectName: 'contained1',
        approvedPhases: [1, 5],
        artifactsDir: 'aitri/product/spec',
        layoutRoot: 'aitri',
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'aitri', 'product', 'spec', '05_TRACEABILITY.json'),
      JSON.stringify({
        overall_status: 'partial',
        requirement_compliance: [{ requirement_id: 'FR-001', level: 'partial' }],
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'aitri', 'features', 'fx', '.aitri'),
      JSON.stringify({ projectName: 'fx', currentPhase: 2, approvedPhases: [1] }),
    );
    const state = readAitriState(dir);
    assert.equal(state.layoutBase, path.join(dir, 'aitri'));
    assert.equal(state.features.length, 1);
    assert.equal(state.features[0].name, 'fx');
    // Artifact reads are projectDir + artifactsDir (formula per SCHEMA.md).
    const compliance = readComplianceSummary(dir, 'aitri/product/spec');
    assert.equal(compliance.overallStatus, 'partial');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
