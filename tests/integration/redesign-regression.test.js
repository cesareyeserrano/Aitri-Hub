/**
 * Tests: Epic 5 — v0.3.0 redesign regression guardrails (NFR-006/007/008).
 * The redesign must NOT change the frozen collector / dashboard.json contract.
 * Covers: TC-NFR-006h (field census), TC-NFR-006e (parity across projects),
 *         TC-NFR-006f (one project throwing does not abort the run),
 *         TC-NFR-007h (dashboard.json parity vs golden baseline),
 *         TC-NFR-007e (new detail data does not leak into the snapshot),
 *         TC-NFR-008h (valid .aitri + results extract as baseline),
 *         TC-NFR-008e (unknown extra .aitri key ignored, fields still extracted),
 *         TC-NFR-008f (malformed .aitri → unreadable, no crash).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectOne } from '../../lib/collector/index.js';
import { readAitriState } from '../../lib/collector/aitri-reader.js';
import { readComplianceSummary } from '../../lib/collector/compliance-reader.js';
import { readBugsSummary } from '../../lib/collector/bugs-reader.js';
import { readTestSummary } from '../../lib/collector/test-reader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, '..', 'fixtures', 'legacy-golden', 'project');
const golden = JSON.parse(fs.readFileSync(path.join(here, '..', 'fixtures', 'legacy-golden', 'golden.json'), 'utf8'));

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
  for (const k of Object.keys(expected)) diffs.push(...subsetDiff(expected[k], actual[k], prefix ? `${prefix}.${k}` : k));
  return diffs;
}

function collectReaders(dir) {
  return {
    state: readAitriState(dir),
    compliance: readComplianceSummary(dir, 'spec'),
    bugs: readBugsSummary(dir),
    tests: readTestSummary(dir, 'spec'),
  };
}

const CENSUS = ['id', 'name', 'aitriState', 'gitMeta', 'testSummary', 'health', 'alerts', 'status', 'specArtifacts'];

describe('NFR-006 — collector data unchanged', () => {
  it('TC-NFR-006h: a collected project exposes the same field census the redesign consumes', async () => {
    // @aitri-tc TC-NFR-006h
    const rec = await collectOne({ id: 'golden', name: 'golden', type: 'local', location: fixtureDir });
    for (const key of CENSUS) assert.ok(key in rec, `missing snapshot field: ${key}`);
    assert.ok(Array.isArray(rec.alerts));
    assert.ok(rec.aitriState && Array.isArray(rec.aitriState.approvedPhases));
  });

  it('TC-NFR-006e: a second project collects the same field set (parity across projects)', async () => {
    // @aitri-tc TC-NFR-006e
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-reg-'));
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ projectName: 'p2', approvedPhases: [1, 2], artifactsDir: 'spec' }));
    const rec = await collectOne({ id: 'p2', name: 'p2', type: 'local', location: dir });
    for (const key of CENSUS) assert.ok(key in rec, `missing field: ${key}`);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('TC-NFR-006f: one unreadable project degrades without aborting the run', async () => {
    // @aitri-tc TC-NFR-006f
    // collectOne never throws — a broken location yields a degraded record so a
    // Promise.all over the project set (collectAll) can never reject.
    const rec = await collectOne({ id: 'broken', name: 'broken', type: 'local', location: path.join(os.tmpdir(), 'no-such-dir-xyz-123') });
    assert.ok(rec, 'record returned, not thrown');
    assert.ok(rec.status === 'unreadable' || rec.collectionError, 'degraded honestly');
  });
});

describe('NFR-007 — dashboard.json contract frozen', () => {
  it('TC-NFR-007h: reader output matches the golden baseline (subset parity)', () => {
    // @aitri-tc TC-NFR-007h
    const diffs = subsetDiff(golden, collectReaders(fixtureDir));
    assert.deepEqual(diffs, [], `golden parity broken:\n${diffs.join('\n')}`);
  });

  it('TC-NFR-007e: the redesign detail data (artifact tree) never leaks into the snapshot', async () => {
    // @aitri-tc TC-NFR-007e
    const rec = await collectOne({ id: 'golden', name: 'golden', type: 'local', location: fixtureDir });
    assert.ok(!('tree' in rec), 'no artifact tree in the frozen snapshot');
    assert.ok(!('artifacts' in rec), 'artifacts tree is a detail-reader output, not a snapshot field');
    // specArtifacts stays the lean id-list shape (not a per-file tree).
    if (rec.specArtifacts) assert.ok(!Array.isArray(rec.specArtifacts.tree));
  });
});

describe('NFR-008 — ingestion parity + resilience', () => {
  it('TC-NFR-008h: valid .aitri + test results extract identically to baseline', () => {
    // @aitri-tc TC-NFR-008h
    const cur = collectReaders(fixtureDir);
    assert.deepEqual(subsetDiff(golden.state, cur.state), []);
    assert.deepEqual(subsetDiff(golden.tests, cur.tests), []);
  });

  it('TC-NFR-008e: an unknown extra .aitri key is ignored; known fields still extract', () => {
    // @aitri-tc TC-NFR-008e
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-reg-fwd-'));
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'fwd', approvedPhases: [1, 2, 3], artifactsDir: 'spec',
      someFutureKey: { nested: true }, anotherNewField: 42, // forward-compat noise
    }));
    const state = readAitriState(dir);
    assert.equal(state.projectName, 'fwd');
    assert.deepEqual(state.approvedPhases, [1, 2, 3]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('TC-NFR-008f: a malformed .aitri yields unreadable (null) without throwing', () => {
    // @aitri-tc TC-NFR-008f
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-reg-bad-'));
    fs.writeFileSync(path.join(dir, '.aitri'), '{ this is : not json ]');
    assert.doesNotThrow(() => readAitriState(dir));
    assert.equal(readAitriState(dir), null);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
