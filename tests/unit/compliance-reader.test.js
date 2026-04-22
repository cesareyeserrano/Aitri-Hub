/**
 * Tests: collector/compliance-reader
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readComplianceSummary } from '../../lib/collector/compliance-reader.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-compliance-'));
}

const COMPLIANT_ARTIFACT = {
  project: 'test-project',
  version: '1.0.0',
  phases_completed: [1, 2, 3, 4, 5],
  overall_status: 'compliant',
  requirement_compliance: [
    { id: 'FR-001', level: 'production_ready' },
    { id: 'FR-002', level: 'production_ready' },
    { id: 'FR-003', level: 'complete' },
  ],
};

const PARTIAL_ARTIFACT = {
  project: 'test-project',
  version: '1.0.0',
  phases_completed: [1, 2, 3, 4, 5],
  overall_status: 'partial',
  requirement_compliance: [
    { id: 'FR-001', level: 'production_ready' },
    { id: 'FR-002', level: 'partial' },
    { id: 'FR-003', level: 'functionally_present' },
  ],
};

// ── compliant artifact ────────────────────────────────────────────────────────

describe('readComplianceSummary — compliant artifact', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(
      path.join(dir, 'spec', '05_PROOF_OF_COMPLIANCE.json'),
      JSON.stringify(COMPLIANT_ARTIFACT),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns available=true', () => {
    assert.equal(readComplianceSummary(dir).available, true);
  });

  it('returns overallStatus="compliant"', () => {
    assert.equal(readComplianceSummary(dir).overallStatus, 'compliant');
  });

  it('returns correct production_ready count', () => {
    assert.equal(readComplianceSummary(dir).levels.production_ready, 2);
  });

  it('returns correct complete count', () => {
    assert.equal(readComplianceSummary(dir).levels.complete, 1);
  });

  it('returns total=3', () => {
    assert.equal(readComplianceSummary(dir).total, 3);
  });
});

// ── partial artifact ──────────────────────────────────────────────────────────

describe('readComplianceSummary — partial artifact', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(
      path.join(dir, 'spec', '05_PROOF_OF_COMPLIANCE.json'),
      JSON.stringify(PARTIAL_ARTIFACT),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns overallStatus="partial"', () => {
    assert.equal(readComplianceSummary(dir).overallStatus, 'partial');
  });

  it('returns production_ready=1', () => {
    assert.equal(readComplianceSummary(dir).levels.production_ready, 1);
  });

  it('returns partial=1', () => {
    assert.equal(readComplianceSummary(dir).levels.partial, 1);
  });
});

// ── custom artifactsDir ───────────────────────────────────────────────────────

describe('readComplianceSummary — respects custom artifactsDir', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'artifacts'));
    fs.writeFileSync(
      path.join(dir, 'artifacts', '05_PROOF_OF_COMPLIANCE.json'),
      JSON.stringify(COMPLIANT_ARTIFACT),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null with default "spec" dir', () => {
    assert.equal(readComplianceSummary(dir), null);
  });

  it('returns summary with correct artifactsDir', () => {
    const result = readComplianceSummary(dir, 'artifacts');
    assert.notEqual(result, null);
    assert.equal(result.overallStatus, 'compliant');
  });
});

// ── absent / malformed ────────────────────────────────────────────────────────

describe('readComplianceSummary — absent file returns null', () => {
  let dir;
  before(() => {
    dir = tmpDir();
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null when file absent', () => {
    assert.equal(readComplianceSummary(dir), null);
  });

  it('does not throw', () => {
    assert.doesNotThrow(() => readComplianceSummary(dir));
  });
});

describe('readComplianceSummary — malformed JSON returns null', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(path.join(dir, 'spec', '05_PROOF_OF_COMPLIANCE.json'), 'NOT JSON {{{');
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null for malformed JSON', () => {
    assert.equal(readComplianceSummary(dir), null);
  });
});
