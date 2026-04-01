/**
 * Tests: collector/bugs-reader
 *
 * @aitri-trace TC-ID: TC-017h, TC-017f, TC-017e
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readBugsSummary } from '../../lib/collector/bugs-reader.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-bugs-reader-'));
}

const SAMPLE_BUGS = {
  bugs: [
    { id: 'BG-001', status: 'open',   severity: 'critical' },
    { id: 'BG-002', status: 'open',   severity: 'high'     },
    { id: 'BG-003', status: 'open',   severity: 'medium'   },
    { id: 'BG-004', status: 'fixed',  severity: 'low'      },
    { id: 'BG-005', status: 'closed', severity: 'high'     },
  ],
};

// TC-017h — happy path
describe('TC-017h: readBugsSummary — valid BUGS.json', () => {
  // @aitri-tc TC-017h
  let dir;
  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'BUGS.json'), JSON.stringify(SAMPLE_BUGS));
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('TC-017h: returns correct counts for each status and severity bucket', () => {
    // @aitri-tc TC-017h
    const result = readBugsSummary(dir, '');
    assert.ok(result !== null, 'should not return null');
    assert.equal(result.open,     3);
    assert.equal(result.fixed,    1);
    assert.equal(result.verified, 0);
    assert.equal(result.closed,   1);
    assert.equal(result.critical, 1);
    assert.equal(result.high,     1);
    assert.equal(result.medium,   1);
    assert.equal(result.low,      0);
    assert.deepEqual(result.openIds, ['BG-001', 'BG-002', 'BG-003']);
  });
});

// TC-017f — absent file
describe('TC-017f: readBugsSummary — absent BUGS.json', () => {
  // @aitri-tc TC-017f
  let dir;
  before(() => { dir = tmpDir(); });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('TC-017f: returns null without throwing', () => {
    // @aitri-tc TC-017f
    const result = readBugsSummary(dir, '');
    assert.equal(result, null);
  });
});

// TC-017e — malformed JSON
describe('TC-017e: readBugsSummary — malformed BUGS.json', () => {
  // @aitri-tc TC-017e
  let dir;
  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, 'BUGS.json'), '{ broken json [');
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('TC-017e: returns null without throwing', () => {
    // @aitri-tc TC-017e
    const result = readBugsSummary(dir, '');
    assert.equal(result, null);
  });
});

// artifactsDir subpath resolution (TC-017h variant)
describe('TC-017h: readBugsSummary — artifactsDir=spec', () => {
  // @aitri-tc TC-017h
  let dir;
  before(() => {
    dir = tmpDir();
    const specDir = path.join(dir, 'spec');
    fs.mkdirSync(specDir);
    fs.writeFileSync(path.join(specDir, 'BUGS.json'), JSON.stringify({
      bugs: [{ id: 'BG-001', status: 'open', severity: 'low' }],
    }));
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('TC-017h: finds BUGS.json inside artifactsDir', () => {
    // @aitri-tc TC-017h
    const result = readBugsSummary(dir, 'spec');
    assert.ok(result !== null);
    assert.equal(result.open, 1);
    assert.equal(result.low,  1);
  });
});
