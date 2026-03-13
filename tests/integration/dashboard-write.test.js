/**
 * Tests: store/dashboard (integration — real file I/O)
 * Covers: TC-009h, TC-009e (integration variant)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-dashwrite-'));
}

function makeDashboard() {
  return {
    schemaVersion: '1',
    collectedAt: new Date().toISOString(),
    projects: [
      {
        id: 'deadbeef',
        name: 'integration-proj',
        location: '/tmp/integration-proj',
        type: 'local',
        status: 'healthy',
        aitriState: { approvedPhases: [1], verifyPassed: false },
        gitMeta: { branch: 'main', lastCommitAgeHours: 1 },
        testSummary: null,
        alerts: [],
        collectionError: null,
      },
    ],
  };
}

// ── Integration: write → read roundtrip is lossless ──────────────────────────

describe('dashboard writeDashboard → readDashboard roundtrip', () => {
  let hubDirOrig;
  let tmpHubDir;

  before(() => {
    tmpHubDir = tmpDir();
    hubDirOrig = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = tmpHubDir;
  });

  after(() => {
    process.env.AITRI_HUB_DIR = hubDirOrig;
    fs.rmSync(tmpHubDir, { recursive: true, force: true });
  });

  it('readDashboard returns null before first write', async () => {
    const { readDashboard } = await import('../../lib/store/dashboard.js');
    assert.equal(readDashboard(), null);
  });

  it('written data matches read data', async () => {
    const { writeDashboard, readDashboard } = await import('../../lib/store/dashboard.js');
    const data = makeDashboard();
    writeDashboard(data);
    const read = readDashboard();
    assert.notEqual(read, null);
    assert.equal(read.schemaVersion, '1');
    assert.equal(read.projects.length, 1);
    assert.equal(read.projects[0].name, 'integration-proj');
    assert.equal(read.projects[0].id, 'deadbeef');
  });

  it('second write overwrites first', async () => {
    const { writeDashboard, readDashboard } = await import('../../lib/store/dashboard.js');
    writeDashboard({ ...makeDashboard(), projects: [] });
    writeDashboard({ ...makeDashboard(), projects: [{ id: 'new', name: 'new-proj', status: 'warning' }] });
    const read = readDashboard();
    assert.equal(read.projects.length, 1);
    assert.equal(read.projects[0].name, 'new-proj');
  });

  it('no .tmp file remains after successful write', async () => {
    const { writeDashboard } = await import('../../lib/store/dashboard.js');
    writeDashboard(makeDashboard());
    const tmpFile = path.join(tmpHubDir, '.dashboard.json.tmp');
    assert.ok(!fs.existsSync(tmpFile), '.tmp file must be cleaned up after rename');
  });

  it('dashboard.json is valid JSON after write', async () => {
    const { writeDashboard } = await import('../../lib/store/dashboard.js');
    writeDashboard(makeDashboard());
    const raw = fs.readFileSync(path.join(tmpHubDir, 'dashboard.json'), 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw), 'dashboard.json must be valid JSON');
  });
});
