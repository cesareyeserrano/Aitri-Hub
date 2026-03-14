/**
 * Tests: collector/aitri-reader
 * Covers: TC-002h, TC-002e, TC-002f
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAitriState } from '../../lib/collector/aitri-reader.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-reader-'));
}

// ── TC-002h: valid .aitri extracts all fields correctly ───────────────────────

describe('TC-002h: readAitriState — valid .aitri extracts all fields', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'finance-app',
      currentPhase: 4,
      approvedPhases: [1, 2, 3],
      completedPhases: [1, 2, 3, 4],
      verifyPassed: true,
      verifySummary: { passed: 28, failed: 0, skipped: 2, total: 30 },
      artifactHashes: { '1': 'abc123', '2': 'def456', '3': 'ghi789' },
      rejections: {},
    }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns currentPhase=4', () => {
    const result = readAitriState(dir);
    assert.notEqual(result, null);
    assert.equal(result.currentPhase, 4);
  });

  it('returns approvedPhases=[1,2,3]', () => {
    const result = readAitriState(dir);
    assert.deepEqual(result.approvedPhases, [1, 2, 3]);
  });

  it('returns completedPhases=[1,2,3,4]', () => {
    const result = readAitriState(dir);
    assert.deepEqual(result.completedPhases, [1, 2, 3, 4]);
  });

  it('returns verifyPassed=true', () => {
    const result = readAitriState(dir);
    assert.equal(result.verifyPassed, true);
  });

  it('returns verifySummary.passed=28', () => {
    const result = readAitriState(dir);
    assert.equal(result.verifySummary.passed, 28);
  });

  it('returns verifySummary.failed=0', () => {
    const result = readAitriState(dir);
    assert.equal(result.verifySummary.failed, 0);
  });

  it('returns hasDrift=false when all approved phases have hashes', () => {
    const result = readAitriState(dir);
    assert.equal(result.hasDrift, false);
  });

  it('returns lastRejection=null when rejections is empty', () => {
    const result = readAitriState(dir);
    assert.equal(result.lastRejection, null);
  });
});

// ── TC-002e: .aitri with rejection entry extracts lastRejection ──────────────

describe('TC-002e: readAitriState — rejection entry extracted correctly', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      currentPhase: 2,
      approvedPhases: [1],
      completedPhases: [1, 2],
      rejections: {
        '2': { at: '2026-03-10T12:00:00Z', feedback: 'Missing API docs' },
      },
    }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns lastRejection.feedback = "Missing API docs"', () => {
    const result = readAitriState(dir);
    assert.notEqual(result, null);
    assert.equal(result.lastRejection.feedback, 'Missing API docs');
  });

  it('returns lastRejection.at = "2026-03-10T12:00:00Z"', () => {
    const result = readAitriState(dir);
    assert.equal(result.lastRejection.at, '2026-03-10T12:00:00Z');
  });

  it('returns lastRejection.phase = 2', () => {
    const result = readAitriState(dir);
    assert.equal(result.lastRejection.phase, 2);
  });
});

// ── TC-002f: malformed JSON returns null without throwing ─────────────────────

describe('TC-002f: readAitriState — malformed JSON returns null', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), '{ "currentPhase": 2, INVALID JSON');
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not throw on malformed JSON', () => {
    assert.doesNotThrow(() => readAitriState(dir));
  });

  it('returns null for malformed JSON', () => {
    const result = readAitriState(dir);
    assert.equal(result, null);
  });
});

// ── Extra: missing .aitri file returns null ───────────────────────────────────

describe('readAitriState — missing .aitri returns null', () => {
  let dir;

  before(() => { dir = tmpDir(); });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null when .aitri does not exist', () => {
    const result = readAitriState(dir);
    assert.equal(result, null);
  });

  it('does not throw when .aitri does not exist', () => {
    assert.doesNotThrow(() => readAitriState(dir));
  });
});

// ── Extra: .aitri as directory (Aitri v0.1.39+) reads config.json ─────────────

describe('readAitriState — .aitri as directory reads .aitri/config.json', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.aitri'));
    fs.writeFileSync(path.join(dir, '.aitri', 'config.json'), JSON.stringify({
      projectName: 'dir-project',
      currentPhase: 2,
      approvedPhases: [1],
      completedPhases: [1, 2],
      artifactsDir: 'artifacts',
    }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not throw when .aitri is a directory', () => {
    assert.doesNotThrow(() => readAitriState(dir));
  });

  it('returns state from .aitri/config.json', () => {
    const result = readAitriState(dir);
    assert.notEqual(result, null);
    assert.equal(result.projectName, 'dir-project');
    assert.equal(result.currentPhase, 2);
  });

  it('returns artifactsDir from config', () => {
    const result = readAitriState(dir);
    assert.equal(result.artifactsDir, 'artifacts');
  });
});

// ── Extra: events array is read correctly ─────────────────────────────────────

describe('readAitriState — events array is read correctly', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      currentPhase: 3,
      approvedPhases: [1, 2],
      completedPhases: [1, 2, 3],
      events: [
        { at: '2026-03-10T10:00:00Z', event: 'completed', phase: 1 },
        { at: '2026-03-10T11:00:00Z', event: 'approved',  phase: 1 },
        { at: '2026-03-11T09:00:00Z', event: 'completed', phase: 2 },
        { at: '2026-03-11T10:00:00Z', event: 'approved',  phase: 2 },
        { at: '2026-03-12T08:00:00Z', event: 'rejected',  phase: 3, feedback: 'missing edge cases' },
        { at: '2026-03-13T09:00:00Z', event: 'completed', phase: 3 },
      ],
    }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns events array with 6 entries', () => {
    const result = readAitriState(dir);
    assert.equal(result.events.length, 6);
  });

  it('last event is completed phase 3', () => {
    const result = readAitriState(dir);
    const last = result.events[result.events.length - 1];
    assert.equal(last.event, 'completed');
    assert.equal(last.phase, 3);
  });

  it('rejected event includes feedback', () => {
    const result = readAitriState(dir);
    const rejected = result.events.find(e => e.event === 'rejected');
    assert.equal(rejected.feedback, 'missing edge cases');
  });
});

// ── Extra: events defaults to empty array when missing ────────────────────────

describe('readAitriState — events defaults to [] when absent', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      currentPhase: 1, approvedPhases: [], completedPhases: [],
    }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns empty events array', () => {
    const result = readAitriState(dir);
    assert.deepEqual(result.events, []);
  });
});

// ── Extra: artifactsDir defaults to "spec" when missing from config ───────────

describe('readAitriState — artifactsDir defaults to "spec"', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      projectName: 'no-artifacts-dir',
      currentPhase: 1,
      approvedPhases: [],
      completedPhases: [],
    }));
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns artifactsDir="spec" when field is absent', () => {
    const result = readAitriState(dir);
    assert.equal(result.artifactsDir, 'spec');
  });
});
