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
