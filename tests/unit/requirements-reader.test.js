/**
 * Tests: collector/requirements-reader
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readRequirementsSummary } from '../../lib/collector/requirements-reader.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-req-'));
}

const SAMPLE_REQUIREMENTS = {
  project_name: 'my-app',
  functional_requirements: [
    { id: 'FR-001', priority: 'MUST',   title: 'User login'      },
    { id: 'FR-002', priority: 'MUST',   title: 'User signup'     },
    { id: 'FR-003', priority: 'SHOULD', title: 'Dark mode'       },
    { id: 'FR-004', priority: 'COULD',  title: 'Export CSV'      },
    { id: 'FR-005', priority: 'MUST',   title: 'Password reset'  },
  ],
  user_stories: [],
  non_functional_requirements: [],
};

// ── happy path ────────────────────────────────────────────────────────────────

describe('readRequirementsSummary — valid artifact', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(
      path.join(dir, 'spec', '01_REQUIREMENTS.json'),
      JSON.stringify(SAMPLE_REQUIREMENTS)
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns available=true', () => {
    assert.equal(readRequirementsSummary(dir).available, true);
  });

  it('returns total=5', () => {
    assert.equal(readRequirementsSummary(dir).total, 5);
  });

  it('returns MUST=3', () => {
    assert.equal(readRequirementsSummary(dir).priority.MUST, 3);
  });

  it('returns SHOULD=1', () => {
    assert.equal(readRequirementsSummary(dir).priority.SHOULD, 1);
  });

  it('returns COULD=1', () => {
    assert.equal(readRequirementsSummary(dir).priority.COULD, 1);
  });

  it('returns projectName="my-app"', () => {
    assert.equal(readRequirementsSummary(dir).projectName, 'my-app');
  });
});

// ── custom artifactsDir ───────────────────────────────────────────────────────

describe('readRequirementsSummary — custom artifactsDir', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'artifacts'));
    fs.writeFileSync(
      path.join(dir, 'artifacts', '01_REQUIREMENTS.json'),
      JSON.stringify(SAMPLE_REQUIREMENTS)
    );
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null with default "spec"', () => {
    assert.equal(readRequirementsSummary(dir), null);
  });

  it('returns summary with correct artifactsDir', () => {
    const result = readRequirementsSummary(dir, 'artifacts');
    assert.notEqual(result, null);
    assert.equal(result.total, 5);
  });
});

// ── absent / malformed ────────────────────────────────────────────────────────

describe('readRequirementsSummary — absent file returns null', () => {
  let dir;
  before(() => { dir = tmpDir(); });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null', () => assert.equal(readRequirementsSummary(dir), null));
  it('does not throw', () => assert.doesNotThrow(() => readRequirementsSummary(dir)));
});

describe('readRequirementsSummary — malformed JSON returns null', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), '{{{');
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('returns null', () => assert.equal(readRequirementsSummary(dir), null));
});
