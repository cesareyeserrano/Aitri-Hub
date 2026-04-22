/**
 * Tests: store/dashboard
 * Covers: TC-009h, TC-009e, TC-009f
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-dashboard-'));
}

function makeDashboardData(overrides = {}) {
  return {
    schemaVersion: '1',
    collectedAt: new Date().toISOString(),
    projects: [
      {
        id: 'a1b2c3d4',
        name: 'finance-app',
        location: '/tmp/finance-app',
        type: 'local',
        status: 'healthy',
        aitriState: { approvedPhases: [1, 2, 3], verifyPassed: true },
        gitMeta: { branch: 'main', lastCommitAgeHours: 2 },
        testSummary: null,
        alerts: [],
        collectionError: null,
      },
    ],
    ...overrides,
  };
}

// ── TC-009h: writeDashboard writes valid JSON with correct schema ─────────────

describe('TC-009h: writeDashboard — writes valid JSON dashboard.json', () => {
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

  it('dashboard.json exists after writeDashboard', async () => {
    const { writeDashboard } = await import('../../lib/store/dashboard.js');
    writeDashboard(makeDashboardData());
    assert.ok(fs.existsSync(path.join(tmpHubDir, 'dashboard.json')));
  });

  it('dashboard.json is valid JSON', async () => {
    const { writeDashboard } = await import('../../lib/store/dashboard.js');
    writeDashboard(makeDashboardData());
    const raw = fs.readFileSync(path.join(tmpHubDir, 'dashboard.json'), 'utf8');
    assert.doesNotThrow(() => JSON.parse(raw));
  });

  it('dashboard.json contains project name finance-app', async () => {
    const { writeDashboard } = await import('../../lib/store/dashboard.js');
    writeDashboard(makeDashboardData());
    const parsed = JSON.parse(fs.readFileSync(path.join(tmpHubDir, 'dashboard.json'), 'utf8'));
    assert.equal(parsed.projects[0].name, 'finance-app');
  });

  it('dashboard.json schemaVersion is "1"', async () => {
    const { writeDashboard } = await import('../../lib/store/dashboard.js');
    writeDashboard(makeDashboardData());
    const parsed = JSON.parse(fs.readFileSync(path.join(tmpHubDir, 'dashboard.json'), 'utf8'));
    assert.equal(parsed.schemaVersion, '1');
  });
});

// ── TC-009f: write failure preserves previous dashboard.json ─────────────────

describe('TC-009f: writeDashboard — write failure preserves previous dashboard.json', () => {
  let tmpHubDir;
  let origRenameSync;

  let hubDirOrig;

  before(() => {
    tmpHubDir = tmpDir();
    hubDirOrig = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = tmpHubDir;
  });

  after(() => {
    process.env.AITRI_HUB_DIR = hubDirOrig;
    if (origRenameSync) fs.renameSync = origRenameSync;
    fs.rmSync(tmpHubDir, { recursive: true, force: true });
  });

  it('TC-009f: previous dashboard.json survives when renameSync throws ENOSPC', async () => {
    const { writeDashboard } = await import('../../lib/store/dashboard.js');
    const dashPath = path.join(tmpHubDir, 'dashboard.json');

    // Write a valid previous dashboard
    const prevData = {
      schemaVersion: '1',
      collectedAt: new Date().toISOString(),
      projects: [{ name: 'previous-project' }],
    };
    writeDashboard(prevData);
    assert.ok(fs.existsSync(dashPath), 'initial dashboard.json must exist');

    // Stub renameSync to throw ENOSPC (disk full)
    origRenameSync = fs.renameSync;
    fs.renameSync = () => {
      const err = new Error('ENOSPC: no space left on device');
      err.code = 'ENOSPC';
      throw err;
    };

    // writeDashboard must NOT throw
    assert.doesNotThrow(() =>
      writeDashboard({
        schemaVersion: '1',
        collectedAt: new Date().toISOString(),
        projects: [{ name: 'new-project' }],
      }),
    );

    // Restore renameSync before reading
    fs.renameSync = origRenameSync;
    origRenameSync = null;

    // Previous content must be intact
    const content = JSON.parse(fs.readFileSync(dashPath, 'utf8'));
    assert.equal(
      content.projects[0].name,
      'previous-project',
      'previous dashboard.json must be preserved on write failure',
    );
  });
});

// ── TC-009e: atomic write uses temp file + rename ────────────────────────────

describe('TC-009e: writeDashboard — uses atomic temp+rename pattern', () => {
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

  it('no .tmp file remains after writeDashboard completes', async () => {
    const { writeDashboard } = await import('../../lib/store/dashboard.js');
    writeDashboard(makeDashboardData());
    const tmpFile = path.join(tmpHubDir, '.dashboard.json.tmp');
    assert.ok(!fs.existsSync(tmpFile), 'Temp file should be cleaned up after atomic rename');
  });

  it('dashboard.json is present and not the tmp file', async () => {
    const { writeDashboard } = await import('../../lib/store/dashboard.js');
    writeDashboard(makeDashboardData());
    assert.ok(fs.existsSync(path.join(tmpHubDir, 'dashboard.json')));
  });
});
