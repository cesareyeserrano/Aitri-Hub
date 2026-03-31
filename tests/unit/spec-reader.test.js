/**
 * Tests: collector/spec-reader
 *
 * @aitri-trace TC-ID: TC-014h, TC-014f, TC-014e
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readSpecArtifacts } from '../../lib/collector/spec-reader.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-spec-reader-'));
}

const SAMPLE_REQS = {
  functional_requirements: [
    { id: 'FR-010', title: 'Graph tab exists', priority: 'MUST', phase: '1' },
    { id: 'FR-011', title: 'Project name shown', priority: 'MUST', phase: '1' },
  ],
};

const SAMPLE_TCS = {
  test_cases: [
    { id: 'TC-010h', title: 'Graph renders nodes', fr_ids: ['FR-010'], phase: '3' },
    { id: 'TC-011h', title: 'Project selector shows', fr_ids: ['FR-011'], phase: '3' },
    { id: 'TC-010f', title: 'Empty state renders', fr_ids: ['FR-010'], phase: '3' },
  ],
};

// ── TC-014h: reads FRs and TCs from spec/ directory ───────────────────────────

describe('TC-014h: readSpecArtifacts — reads from artifactsDir="spec"', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    const specDir = path.join(dir, 'spec');
    fs.mkdirSync(specDir);
    fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), JSON.stringify(SAMPLE_REQS));
    fs.writeFileSync(path.join(specDir, '03_TEST_CASES.json'), JSON.stringify(SAMPLE_TCS));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns frs and tcs arrays', () => {
    const result = readSpecArtifacts(dir, 'spec');
    assert.ok(result !== null);
    assert.strictEqual(result.frs.length, 2);
    assert.strictEqual(result.tcs.length, 3);
  });

  it('strips description and acceptance_criteria', () => {
    const result = readSpecArtifacts(dir, 'spec');
    for (const fr of result.frs) {
      assert.ok(!('description' in fr));
      assert.ok(!('acceptance_criteria' in fr));
    }
  });

  it('includes id, title, priority, phase on FRs', () => {
    const result = readSpecArtifacts(dir, 'spec');
    const fr = result.frs[0];
    assert.strictEqual(fr.id, 'FR-010');
    assert.strictEqual(fr.title, 'Graph tab exists');
    assert.strictEqual(fr.priority, 'MUST');
    assert.strictEqual(fr.phase, '1');
  });

  it('includes fr_ids on TCs', () => {
    const result = readSpecArtifacts(dir, 'spec');
    const tc = result.tcs[0];
    assert.deepStrictEqual(tc.fr_ids, ['FR-010']);
  });
});

// ── TC-014f: reads from project root when artifactsDir is "" ──────────────────

describe('TC-014f: readSpecArtifacts — reads from project root when artifactsDir=""', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, '01_REQUIREMENTS.json'), JSON.stringify(SAMPLE_REQS));
    fs.writeFileSync(path.join(dir, '03_TEST_CASES.json'), JSON.stringify(SAMPLE_TCS));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns artifacts from project root', () => {
    const result = readSpecArtifacts(dir, '');
    assert.ok(result !== null);
    assert.strictEqual(result.frs.length, 2);
    assert.strictEqual(result.tcs.length, 3);
  });
});

// ── TC-014e: returns null when no spec files exist ────────────────────────────

describe('TC-014e: readSpecArtifacts — returns null when no spec files exist', () => {
  let dir;

  before(() => { dir = tmpDir(); });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null when neither requirements nor test-cases file is present', () => {
    const result = readSpecArtifacts(dir, 'spec');
    assert.strictEqual(result, null);
  });

  it('returns partial result when only FRs exist', () => {
    const specDir = path.join(dir, 'spec');
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, '01_REQUIREMENTS.json'), JSON.stringify(SAMPLE_REQS));
    const result = readSpecArtifacts(dir, 'spec');
    assert.ok(result !== null);
    assert.strictEqual(result.frs.length, 2);
    assert.deepStrictEqual(result.tcs, []);
  });
});
