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
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        projectName: 'finance-app',
        currentPhase: 4,
        approvedPhases: [1, 2, 3],
        completedPhases: [1, 2, 3, 4],
        verifyPassed: true,
        verifySummary: { passed: 28, failed: 0, skipped: 2, total: 30 },
        artifactHashes: { 1: 'abc123', 2: 'def456', 3: 'ghi789' },
        rejections: {},
      }),
    );
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
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1, 2],
        rejections: {
          2: { at: '2026-03-10T12:00:00Z', feedback: 'Missing API docs' },
        },
      }),
    );
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

  before(() => {
    dir = tmpDir();
  });
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
    fs.writeFileSync(
      path.join(dir, '.aitri', 'config.json'),
      JSON.stringify({
        projectName: 'dir-project',
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1, 2],
        artifactsDir: 'artifacts',
      }),
    );
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
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 3,
        approvedPhases: [1, 2],
        completedPhases: [1, 2, 3],
        events: [
          { at: '2026-03-10T10:00:00Z', event: 'completed', phase: 1 },
          { at: '2026-03-10T11:00:00Z', event: 'approved', phase: 1 },
          { at: '2026-03-11T09:00:00Z', event: 'completed', phase: 2 },
          { at: '2026-03-11T10:00:00Z', event: 'approved', phase: 2 },
          {
            at: '2026-03-12T08:00:00Z',
            event: 'rejected',
            phase: 3,
            feedback: 'missing edge cases',
          },
          { at: '2026-03-13T09:00:00Z', event: 'completed', phase: 3 },
        ],
      }),
    );
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
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 1,
        approvedPhases: [],
        completedPhases: [],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns empty events array', () => {
    const result = readAitriState(dir);
    assert.deepEqual(result.events, []);
  });
});

// ── Extra: feature sub-pipeline detection ─────────────────────────────────────

describe('readAitriState — features[] contains sub-pipeline state', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 3,
        approvedPhases: [1, 2],
        completedPhases: [1, 2, 3],
      }),
    );
    // Two feature sub-pipelines
    fs.mkdirSync(path.join(dir, 'features', 'auth'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'features', 'auth', '.aitri'),
      JSON.stringify({
        projectName: 'auth',
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1, 2],
      }),
    );
    fs.mkdirSync(path.join(dir, 'features', 'billing'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'features', 'billing', '.aitri'),
      JSON.stringify({
        projectName: 'billing',
        currentPhase: 1,
        approvedPhases: [],
        completedPhases: [1],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns features array with 2 entries', () => {
    const result = readAitriState(dir);
    assert.equal(result.features.length, 2);
  });

  it('features are sorted by name', () => {
    const result = readAitriState(dir);
    assert.equal(result.features[0].name, 'auth');
    assert.equal(result.features[1].name, 'billing');
  });

  it('auth feature has currentPhase=2 and approvedPhases=[1]', () => {
    const result = readAitriState(dir);
    const auth = result.features.find(f => f.name === 'auth');
    assert.equal(auth.currentPhase, 2);
    assert.deepEqual(auth.approvedPhases, [1]);
  });
});

describe('readAitriState — features[] is empty when features/ does not exist', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 1,
        approvedPhases: [],
        completedPhases: [],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns features=[] when no features/ directory', () => {
    const result = readAitriState(dir);
    assert.deepEqual(result.features, []);
  });
});

describe('readAitriState — features/ subdirs without .aitri are ignored', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 1,
        approvedPhases: [],
        completedPhases: [],
      }),
    );
    // A features/ dir with one valid and one invalid entry
    fs.mkdirSync(path.join(dir, 'features', 'valid-feature'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'features', 'valid-feature', '.aitri'),
      JSON.stringify({
        currentPhase: 1,
        approvedPhases: [],
        completedPhases: [],
      }),
    );
    fs.mkdirSync(path.join(dir, 'features', 'empty-dir'), { recursive: true });
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns only the feature with a .aitri file', () => {
    const result = readAitriState(dir);
    assert.equal(result.features.length, 1);
    assert.equal(result.features[0].name, 'valid-feature');
  });
});

// ── FR-011: artifactsDir defaults to '' (not 'spec') per integration contract ─

describe('TC-011f: readAitriState — artifactsDir defaults to "" when field absent', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        projectName: 'adopted-project',
        currentPhase: 1,
        approvedPhases: [],
        completedPhases: [],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns artifactsDir="" (empty string) when field is absent — NOT "spec"', () => {
    const result = readAitriState(dir);
    assert.equal(result.artifactsDir, '');
    assert.notEqual(result.artifactsDir, 'spec');
  });
});

describe('TC-011h: readAitriState — artifactsDir "spec" preserved when explicit', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        projectName: 'hub',
        artifactsDir: 'spec',
        currentPhase: 1,
        approvedPhases: [],
        completedPhases: [],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns artifactsDir="spec" when explicitly set', () => {
    const result = readAitriState(dir);
    assert.equal(result.artifactsDir, 'spec');
  });

  it('returns projectName="hub"', () => {
    const result = readAitriState(dir);
    assert.equal(result.projectName, 'hub');
  });
});

describe('TC-011e: readAitriState — projectName defaults to path.basename(projectDir) when absent', () => {
  let dir;

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'finance-tracker-'));
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 1,
        approvedPhases: [],
        completedPhases: [],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns projectName equal to path.basename of projectDir when field absent', () => {
    const result = readAitriState(dir);
    assert.equal(result.projectName, path.basename(dir));
  });
});

// ── FR-010: aitriVersion, updatedAt, createdAt ────────────────────────────────

describe('TC-010h: readAitriState — returns aitriVersion, updatedAt, createdAt when present', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        projectName: 'test',
        aitriVersion: '0.1.63',
        updatedAt: '2026-03-17T23:00:00.000Z',
        createdAt: '2025-11-01T14:00:00.000Z',
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns aitriVersion="0.1.63"', () => {
    const result = readAitriState(dir);
    assert.equal(result.aitriVersion, '0.1.63');
  });

  it('returns updatedAt="2026-03-17T23:00:00.000Z"', () => {
    const result = readAitriState(dir);
    assert.equal(result.updatedAt, '2026-03-17T23:00:00.000Z');
  });

  it('returns createdAt="2025-11-01T14:00:00.000Z"', () => {
    const result = readAitriState(dir);
    assert.equal(result.createdAt, '2025-11-01T14:00:00.000Z');
  });
});

describe('TC-010f: readAitriState — returns null for aitriVersion, updatedAt, createdAt when absent', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        projectName: 'legacy-project',
        currentPhase: 3,
        approvedPhases: [1, 2],
        completedPhases: [1, 2],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns aitriVersion=null when field absent', () => {
    const result = readAitriState(dir);
    assert.equal(result.aitriVersion, null);
  });

  it('returns updatedAt=null when field absent', () => {
    const result = readAitriState(dir);
    assert.equal(result.updatedAt, null);
  });

  it('returns createdAt=null when field absent', () => {
    const result = readAitriState(dir);
    assert.equal(result.createdAt, null);
  });

  it('does not throw', () => {
    assert.doesNotThrow(() => readAitriState(dir));
  });
});

describe('TC-010e: readAitriState — returns aitriVersion=null when field is a number', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        aitriVersion: 163,
        currentPhase: 1,
        approvedPhases: [],
        completedPhases: [],
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns aitriVersion=null when value is number 163 (not string)', () => {
    const result = readAitriState(dir);
    assert.equal(result.aitriVersion, null);
  });
});

// ── FR-012: driftPhases fast path ─────────────────────────────────────────────

describe('TC-012h: detectDrift — driftPhases fast path returns hasDrift=true', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 3,
        approvedPhases: [1, 2],
        completedPhases: [1, 2],
        driftPhases: ['2'],
        artifactHashes: {},
      }),
    );
    // No artifact files — proves fast path doesn't need them
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns hasDrift=true from driftPhases fast path without reading artifact files', () => {
    const result = readAitriState(dir);
    assert.equal(result.hasDrift, true);
  });
});

describe('TC-012f: detectDrift — empty driftPhases[] does not trigger drift', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1],
        driftPhases: [],
        artifactHashes: {},
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns hasDrift=false when driftPhases is empty and no stored hashes', () => {
    const result = readAitriState(dir);
    assert.equal(result.hasDrift, false);
  });
});

describe('TC-012e: detectDrift — absent driftPhases (pre-v0.1.58) falls through without throwing', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1],
        artifactHashes: {},
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not throw when driftPhases field is absent', () => {
    assert.doesNotThrow(() => readAitriState(dir));
  });

  it('returns hasDrift=false (no hashes, no artifact files)', () => {
    const result = readAitriState(dir);
    assert.equal(result.hasDrift, false);
  });
});

// ── FR-013: dynamic sha256 hash check ─────────────────────────────────────────

import crypto from 'node:crypto';

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe('TC-013h: detectDrift — hasDrift=false when artifact matches stored hash', () => {
  let dir;
  const content = '{"project_name":"test"}';

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), content);
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1],
        artifactsDir: 'spec',
        artifactHashes: { 1: sha256(content) },
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns hasDrift=false when artifact content matches stored sha256', () => {
    const result = readAitriState(dir);
    assert.equal(result.hasDrift, false);
  });
});

describe('TC-013f: detectDrift — hasDrift=true when artifact differs from stored hash', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), '{"project_name":"modified"}');
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1],
        artifactsDir: 'spec',
        artifactHashes: { 1: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns hasDrift=true when current sha256 differs from stored hash', () => {
    const result = readAitriState(dir);
    assert.equal(result.hasDrift, true);
  });
});

describe('TC-013e: detectDrift — approved phase with no stored hash is NOT counted as drifted', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1],
        artifactHashes: {},
      }),
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns hasDrift=false when phase 1 approved but artifactHashes is empty', () => {
    const result = readAitriState(dir);
    assert.equal(result.hasDrift, false);
  });
});

describe('TC-013e2: detectDrift — artifact file missing on disk returns hasDrift=false without throwing', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1],
        artifactsDir: 'spec',
        artifactHashes: { 1: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
      }),
    );
    // spec/01_REQUIREMENTS.json intentionally NOT created
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not throw when artifact file is missing', () => {
    assert.doesNotThrow(() => readAitriState(dir));
  });

  it('returns hasDrift=false when artifact file does not exist on disk', () => {
    const result = readAitriState(dir);
    assert.equal(result.hasDrift, false);
  });
});
