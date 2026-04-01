/**
 * Tests: hub_integration_update — end-to-end integration tests for collectOne
 * Verifies bugsSummary flows from BUGS.json through collectOne into the data object.
 *
 * @aitri-trace TC-ID: TC-017i, TC-018i
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectOne } from '../../lib/collector/index.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-bugs-e2e-'));
}

const SAMPLE_AITRI = {
  currentPhase:    1,
  approvedPhases:  [],
  completedPhases: [],
  artifactsDir:    '',
  projectName:     'e2e-test-project',
};

// TC-017i — collectOne includes bugsSummary in project data
describe('TC-017i: collectOne — bugsSummary in project data', () => {
  // @aitri-tc TC-017i
  let dir;
  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(SAMPLE_AITRI));
    fs.writeFileSync(path.join(dir, 'BUGS.json'), JSON.stringify({
      bugs: [{ id: 'BG-001', status: 'open', severity: 'critical' }],
    }));
    // Minimal git repo so git-reader doesn't fail
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('TC-017i: collected data includes bugsSummary with correct counts', async () => {
    // @aitri-tc TC-017i
    const project = { id: 'e2e-001', name: 'e2e-test', location: dir, type: 'local' };
    const data = await collectOne(project);
    assert.ok(data.bugsSummary !== null, 'bugsSummary should not be null');
    assert.equal(data.bugsSummary.open,     1, 'open count should be 1');
    assert.equal(data.bugsSummary.critical, 1, 'critical count should be 1');
  });
});

// TC-018i — blocking bug alert appears in collected data alerts array
describe('TC-018i: collectOne — blocking bug alert in alerts array', () => {
  // @aitri-tc TC-018i
  let dir;
  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(SAMPLE_AITRI));
    fs.writeFileSync(path.join(dir, 'BUGS.json'), JSON.stringify({
      bugs: [{ id: 'BG-001', status: 'open', severity: 'critical' }],
    }));
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('TC-018i: project.alerts contains one blocking open-bugs alert', async () => {
    // @aitri-tc TC-018i
    const project = { id: 'e2e-002', name: 'e2e-test', location: dir, type: 'local' };
    const data = await collectOne(project);
    const bugAlerts = (data.alerts ?? []).filter(a => a.type === 'open-bugs');
    assert.equal(bugAlerts.length, 1, 'exactly one open-bugs alert expected');
    assert.equal(bugAlerts[0].severity, 'blocking', 'alert severity should be blocking');
  });
});
