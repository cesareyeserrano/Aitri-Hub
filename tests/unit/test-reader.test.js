/**
 * Tests: collector/test-reader
 * Covers: TC-004h, TC-004f
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readTestSummary } from '../../lib/collector/test-reader.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-test-reader-'));
}

// ── TC-004h: valid 04_TEST_RESULTS.json returns correct summary ───────────────

describe('TC-004h: readTestSummary — valid file returns correct summary', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(
      path.join(dir, 'spec', '04_TEST_RESULTS.json'),
      JSON.stringify({
        summary: { passed: 28, failed: 0, skipped: 2, total: 30 },
        fr_coverage: [
          { fr_id: 'FR-001', status: 'covered' },
          { fr_id: 'FR-002', status: 'partial' },
        ],
        results: [],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns available=true', () => {
    const result = readTestSummary(dir);
    assert.notEqual(result, null);
    assert.equal(result.available, true);
  });

  it('returns passed=28', () => {
    assert.equal(readTestSummary(dir).passed, 28);
  });

  it('returns failed=0', () => {
    assert.equal(readTestSummary(dir).failed, 0);
  });

  it('returns total=30', () => {
    assert.equal(readTestSummary(dir).total, 30);
  });

  it('returns frCoverage with 2 entries', () => {
    const result = readTestSummary(dir);
    assert.equal(result.frCoverage.length, 2);
  });

  it('frCoverage[0].frId = "FR-001"', () => {
    const result = readTestSummary(dir);
    assert.equal(result.frCoverage[0].frId, 'FR-001');
  });

  it('frCoverage[0].status = "covered"', () => {
    const result = readTestSummary(dir);
    assert.equal(result.frCoverage[0].status, 'covered');
  });
});

// ── TC-004f: absent file returns null without throwing ────────────────────────

describe('TC-004f: readTestSummary — absent file returns null', () => {
  let dir;

  before(() => {
    dir = tmpDir();
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not throw when file absent', () => {
    assert.doesNotThrow(() => readTestSummary(dir));
  });

  it('returns null when file absent', () => {
    const result = readTestSummary(dir);
    assert.equal(result, null);
  });
});

// ── Extra: malformed JSON returns null ────────────────────────────────────────

describe('readTestSummary — malformed JSON returns null', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'), 'NOT JSON {{{');
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null for malformed JSON', () => {
    assert.equal(readTestSummary(dir), null);
  });
});

// ── Extra: custom artifactsDir reads from correct path ───────────────────────

describe('readTestSummary — respects custom artifactsDir', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'artifacts'));
    fs.writeFileSync(
      path.join(dir, 'artifacts', '04_TEST_RESULTS.json'),
      JSON.stringify({
        summary: { passed: 5, failed: 1, skipped: 0, total: 6 },
        fr_coverage: [{ fr_id: 'FR-001', status: 'partial' }],
        results: [],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null when using default "spec" dir (file is in artifacts/)', () => {
    assert.equal(readTestSummary(dir), null);
  });

  it('returns summary when using correct custom artifactsDir', () => {
    const result = readTestSummary(dir, 'artifacts');
    assert.notEqual(result, null);
    assert.equal(result.passed, 5);
    assert.equal(result.failed, 1);
  });

  it('frCoverage frId maps correctly from custom dir', () => {
    const result = readTestSummary(dir, 'artifacts');
    assert.equal(result.frCoverage[0].frId, 'FR-001');
  });
});
