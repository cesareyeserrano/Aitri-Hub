/**
 * Tests: collector/feature-reader
 * Covers: TC-011h, TC-011h2, TC-011e1, TC-011e2, TC-011f, TC-011f2,
 *         TC-NFR010, TC-NFR011
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFeaturePipelines } from '../../lib/collector/feature-reader.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hub-feature-reader-'));
}

function writeAitri(dir, data) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(data));
}

function writeTestResults(dir, summary) {
  const specDir = path.join(dir, 'spec');
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, '04_TEST_RESULTS.json'), JSON.stringify({ summary }));
}

// ── TC-011h: single valid feature ─────────────────────────────────────────────
describe('TC-011h: readFeaturePipelines — single valid feature', () => {
  let projectDir;
  before(() => {
    projectDir = tmpDir();
    const featDir = path.join(projectDir, 'features', 'auth');
    writeAitri(featDir, { approvedPhases: [1, 2], currentPhase: 3, verifyPassed: false });
    writeTestResults(featDir, { passed: 30, failed: 0, skipped: 0, total: 61 });
  });
  after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  it('featurePipelines has length 1', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 30);
    assert.equal(featurePipelines.length, 1);
  });

  it('feature name is "auth"', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 30);
    assert.equal(featurePipelines[0].name, 'auth');
  });

  it('tcCount is 61', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 30);
    assert.equal(featurePipelines[0].tcCount, 61);
  });

  it('aggregatedTcTotal is 91 (30 + 61)', () => {
    const { aggregatedTcTotal } = readFeaturePipelines(projectDir, 30);
    assert.equal(aggregatedTcTotal, 91);
  });

  it('approvedPhases extracted correctly', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 30);
    assert.deepEqual(featurePipelines[0].approvedPhases, [1, 2]);
  });

  it('currentPhase is 3', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 30);
    assert.equal(featurePipelines[0].currentPhase, 3);
  });
});

// ── TC-011h2: two features aggregated correctly ───────────────────────────────
describe('TC-011h2: readFeaturePipelines — two features, correct aggregation', () => {
  let projectDir;
  before(() => {
    projectDir = tmpDir();
    const authDir = path.join(projectDir, 'features', 'auth');
    writeAitri(authDir, { approvedPhases: [1, 2, 3], currentPhase: 4 });
    writeTestResults(authDir, { passed: 58, failed: 3, skipped: 0, total: 61 });

    const payDir = path.join(projectDir, 'features', 'payments');
    writeAitri(payDir, { approvedPhases: [1, 2], currentPhase: 3 });
    writeTestResults(payDir, { passed: 20, failed: 0, skipped: 0, total: 20 });
  });
  after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  it('featurePipelines has length 2', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 30);
    assert.equal(featurePipelines.length, 2);
  });

  it('aggregatedTcTotal is 111 (30 + 61 + 20)', () => {
    const { aggregatedTcTotal } = readFeaturePipelines(projectDir, 30);
    assert.equal(aggregatedTcTotal, 111);
  });

  it('both feature names are present', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 30);
    const names = featurePipelines.map(f => f.name).sort();
    assert.deepEqual(names, ['auth', 'payments']);
  });
});

// ── TC-011e1: no features/ dir ────────────────────────────────────────────────
describe('TC-011e1: readFeaturePipelines — absent features/ directory', () => {
  let projectDir;
  before(() => {
    projectDir = tmpDir();
  });
  after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  it('returns empty featurePipelines array', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 30);
    assert.deepEqual(featurePipelines, []);
  });

  it('returns aggregatedTcTotal equal to mainTcTotal', () => {
    const { aggregatedTcTotal } = readFeaturePipelines(projectDir, 30);
    assert.equal(aggregatedTcTotal, 30);
  });

  it('does not throw', () => {
    assert.doesNotThrow(() => readFeaturePipelines(projectDir, 30));
  });
});

// ── TC-011e2: feature missing 04_TEST_RESULTS.json ───────────────────────────
describe('TC-011e2: readFeaturePipelines — feature without test results', () => {
  let projectDir;
  before(() => {
    projectDir = tmpDir();
    const featDir = path.join(projectDir, 'features', 'no-tests');
    writeAitri(featDir, { approvedPhases: [1], currentPhase: 2 });
    // Intentionally no 04_TEST_RESULTS.json
  });
  after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  it('tcCount is 0', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 30);
    assert.equal(featurePipelines[0].tcCount, 0);
  });

  it('aggregatedTcTotal equals mainTcTotal (30 + 0)', () => {
    const { aggregatedTcTotal } = readFeaturePipelines(projectDir, 30);
    assert.equal(aggregatedTcTotal, 30);
  });
});

// ── TC-011f: invalid dir (no .aitri) skipped ─────────────────────────────────
describe('TC-011f: readFeaturePipelines — dir without .aitri is skipped', () => {
  let projectDir;
  before(() => {
    projectDir = tmpDir();
    // Valid feature
    const validDir = path.join(projectDir, 'features', 'valid-feat');
    writeAitri(validDir, { approvedPhases: [1, 2, 3], currentPhase: 4 });
    // Invalid: no .aitri
    fs.mkdirSync(path.join(projectDir, 'features', 'invalid-dir'), { recursive: true });
  });
  after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  it('only valid-feat is in featurePipelines (invalid-dir skipped)', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 10);
    assert.equal(featurePipelines.length, 1);
    assert.equal(featurePipelines[0].name, 'valid-feat');
  });

  it('does not throw', () => {
    assert.doesNotThrow(() => readFeaturePipelines(projectDir, 10));
  });
});

// ── TC-011f2: malformed .aitri is skipped gracefully ─────────────────────────
describe('TC-011f2: readFeaturePipelines — malformed .aitri skipped', () => {
  let projectDir;
  before(() => {
    projectDir = tmpDir();
    const brokenDir = path.join(projectDir, 'features', 'broken');
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, '.aitri'), '{invalid json}');
  });
  after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  it('returns empty featurePipelines (broken feature skipped)', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 5);
    assert.equal(featurePipelines.length, 0);
  });

  it('aggregatedTcTotal equals mainTcTotal', () => {
    const { aggregatedTcTotal } = readFeaturePipelines(projectDir, 5);
    assert.equal(aggregatedTcTotal, 5);
  });

  it('does not throw', () => {
    assert.doesNotThrow(() => readFeaturePipelines(projectDir, 5));
  });
});

// ── TC-NFR010: performance — 10 features within 5000ms ───────────────────────
describe('TC-NFR010: readFeaturePipelines — 10 features completes in ≤5000ms', () => {
  let projectDir;
  before(() => {
    projectDir = tmpDir();
    for (let i = 1; i <= 10; i++) {
      const featDir = path.join(projectDir, 'features', `feature-${i}`);
      writeAitri(featDir, { approvedPhases: [1, 2], currentPhase: 3 });
      writeTestResults(featDir, { passed: 10, failed: 0, skipped: 0, total: 10 });
    }
  });
  after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  it('completes within 5000ms and returns 10 features', () => {
    const start = Date.now();
    const { featurePipelines, aggregatedTcTotal } = readFeaturePipelines(projectDir, 30);
    const elapsed = Date.now() - start;
    assert.equal(featurePipelines.length, 10);
    assert.equal(aggregatedTcTotal, 130); // 30 + 10*10
    assert.ok(elapsed < 5000, `should complete in <5000ms, took ${elapsed}ms`);
  });
});

// ── TC-NFR011: reliability — malformed among valid features ──────────────────
describe('TC-NFR011: readFeaturePipelines — malformed feature does not affect valid ones', () => {
  let projectDir;
  before(() => {
    projectDir = tmpDir();
    // ok1
    const ok1 = path.join(projectDir, 'features', 'ok1');
    writeAitri(ok1, { approvedPhases: [1], currentPhase: 2 });
    writeTestResults(ok1, { passed: 10, failed: 0, skipped: 0, total: 10 });
    // broken
    const broken = path.join(projectDir, 'features', 'broken');
    fs.mkdirSync(broken, { recursive: true });
    fs.writeFileSync(path.join(broken, '.aitri'), 'not-json');
    // ok2
    const ok2 = path.join(projectDir, 'features', 'ok2');
    writeAitri(ok2, { approvedPhases: [1, 2], currentPhase: 3 });
    writeTestResults(ok2, { passed: 20, failed: 0, skipped: 0, total: 20 });
  });
  after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  it('returns 2 valid features (ok1, ok2) and skips broken', () => {
    const { featurePipelines } = readFeaturePipelines(projectDir, 5);
    assert.equal(featurePipelines.length, 2);
    const names = featurePipelines.map(f => f.name).sort();
    assert.deepEqual(names, ['ok1', 'ok2']);
  });

  it('aggregatedTcTotal is 35 (5 + 10 + 20)', () => {
    const { aggregatedTcTotal } = readFeaturePipelines(projectDir, 5);
    assert.equal(aggregatedTcTotal, 35);
  });

  it('does not throw', () => {
    assert.doesNotThrow(() => readFeaturePipelines(projectDir, 5));
  });
});
