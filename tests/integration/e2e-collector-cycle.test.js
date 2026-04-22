/**
 * Tests: e2e collector cycle — integration gate + feature aggregation
 * Covers: TC-E2E-001, TC-E2E-002
 *
 * Note on TC-E2E-001 version stubbing: node:test (Node 18+) does not support
 * mock.module() for ESM. Instead, TC-E2E-001 verifies the full data flow by
 * driving evaluateIntegrationAlert('0.1.99', '0.1.80') directly (guaranteed to produce
 * a warning) and confirming that writeDashboard + collectAll correctly embed
 * and persist the integrationAlert at the top level of dashboard.json.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── Fixture helpers ───────────────────────────────────────────────────────────

/**
 * Write a minimal .aitri file into projectDir.
 */
function writeAitri(projectDir, state) {
  fs.writeFileSync(
    path.join(projectDir, '.aitri'),
    JSON.stringify({
      projectName: 'e2e-proj',
      currentPhase: 4,
      approvedPhases: [1, 2, 3],
      completedPhases: [1, 2, 3, 4],
      artifactsDir: 'spec',
      verifyPassed: true,
      verifySummary: { passed: 30, failed: 0, skipped: 0 },
      ...state,
    }),
  );
}

/**
 * Write a 04_TEST_RESULTS.json for a project or feature.
 */
function writeTestResults(dir, artifactsDir, summary) {
  const specDir = path.join(dir, artifactsDir);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(
    path.join(specDir, '04_TEST_RESULTS.json'),
    JSON.stringify({ summary, fr_coverage: [] }),
  );
}

// ── TC-E2E-001 ────────────────────────────────────────────────────────────────
// Full collector cycle with version mismatch produces integrationAlert in
// dashboard.json and collectAll() result.

describe('TC-E2E-001: full collector cycle — integrationAlert in dashboard.json when version mismatch', () => {
  let hubTmpDir;
  let projectDir;
  const savedOverride = process.env.AITRI_HUB_DIR_OVERRIDE;

  before(() => {
    hubTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-e2e-001-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-proj-001-'));
    process.env.AITRI_HUB_DIR_OVERRIDE = hubTmpDir;

    writeAitri(projectDir, {});
    writeTestResults(projectDir, 'spec', { passed: 30, failed: 0, skipped: 0, total: 30 });
  });

  after(() => {
    process.env.AITRI_HUB_DIR_OVERRIDE = savedOverride ?? '';
    fs.rmSync(hubTmpDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('TC-E2E-001: evaluateIntegrationAlert returns warning for version > INTEGRATION_LAST_REVIEWED', async () => {
    const { evaluateIntegrationAlert } = await import('../../lib/collector/integration-guard.js');
    const alert = evaluateIntegrationAlert('0.1.99', '0.1.80');
    assert.ok(alert !== null, 'alert should be non-null when CLI > reviewed version');
    assert.equal(alert.severity, 'warning');
    assert.ok(alert.message.includes('0.1.99'), 'message should contain detected version');
    assert.ok(typeof alert.changelogUrl === 'string' && alert.changelogUrl.length > 0);
  });

  it('TC-E2E-001: writeDashboard persists integrationAlert at top level and it round-trips correctly', async () => {
    const { evaluateIntegrationAlert } = await import('../../lib/collector/integration-guard.js');
    const { writeDashboard, dashboardFilePath } = await import('../../lib/store/dashboard.js');

    const integrationAlert = evaluateIntegrationAlert('0.1.99', '0.1.80');
    assert.ok(integrationAlert !== null);

    const payload = {
      schemaVersion: '1',
      collectedAt: new Date().toISOString(),
      meta: { detectedAitriVersion: '0.1.99' },
      integrationAlert,
      projects: [
        {
          name: 'e2e-proj',
          location: projectDir,
          featurePipelines: [],
          aggregatedTcTotal: 30,
        },
      ],
    };

    writeDashboard(payload);

    const written = JSON.parse(fs.readFileSync(dashboardFilePath(), 'utf8'));
    assert.ok(written.integrationAlert !== null, 'integrationAlert must be present at top level');
    assert.equal(written.integrationAlert.severity, 'warning');
    assert.ok(written.integrationAlert.message.includes('0.1.99'));
    assert.ok(typeof written.integrationAlert.changelogUrl === 'string');
    // Projects array is also present
    assert.equal(written.projects.length, 1);
    assert.equal(written.projects[0].name, 'e2e-proj');
  });

  it('TC-E2E-001: collectAll() result always includes integrationAlert field at top level', async () => {
    const { collectAll } = await import('../../lib/collector/index.js');

    const project = {
      id: 'e2e-001',
      name: 'e2e-proj',
      location: projectDir,
      type: 'local',
    };

    const result = await collectAll([project]);

    assert.ok(
      Object.prototype.hasOwnProperty.call(result, 'integrationAlert'),
      'collectAll result must have integrationAlert property',
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(result, 'meta'),
      'collectAll result must have meta property',
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(result.meta, 'detectedAitriVersion'),
      'meta must include detectedAitriVersion',
    );
    // integrationAlert is null or an alert object — never undefined
    assert.notEqual(result.integrationAlert, undefined);
  });
});

// ── TC-E2E-002 ────────────────────────────────────────────────────────────────
// Full collector cycle with feature sub-pipelines produces correct aggregated
// TC count in dashboard.json.

describe('TC-E2E-002: full collector cycle — aggregatedTcTotal with feature sub-pipelines', () => {
  let hubTmpDir;
  let projectDir;
  const savedOverride = process.env.AITRI_HUB_DIR_OVERRIDE;

  before(() => {
    hubTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-e2e-002-'));
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-proj-002-'));
    process.env.AITRI_HUB_DIR_OVERRIDE = hubTmpDir;

    // Main project: .aitri + spec/04_TEST_RESULTS.json (30 TCs)
    writeAitri(projectDir, {});
    writeTestResults(projectDir, 'spec', { passed: 30, failed: 0, skipped: 0, total: 30 });

    // Feature sub-pipeline: features/feat-a/.aitri + spec/04_TEST_RESULTS.json (61 TCs)
    const featDir = path.join(projectDir, 'features', 'feat-a');
    fs.mkdirSync(featDir, { recursive: true });
    fs.writeFileSync(
      path.join(featDir, '.aitri'),
      JSON.stringify({
        projectName: 'feat-a',
        currentPhase: 4,
        approvedPhases: [1, 2, 3],
        completedPhases: [1, 2, 3],
        artifactsDir: 'spec',
      }),
    );
    writeTestResults(featDir, 'spec', { passed: 58, failed: 3, skipped: 0, total: 61 });
  });

  after(() => {
    process.env.AITRI_HUB_DIR_OVERRIDE = savedOverride ?? '';
    fs.rmSync(hubTmpDir, { recursive: true, force: true });
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('TC-E2E-002: collectAll() aggregatedTcTotal equals main (30) + feature (61) = 91', async () => {
    const { collectAll } = await import('../../lib/collector/index.js');

    const project = {
      id: 'e2e-002',
      name: 'e2e-proj',
      location: projectDir,
      type: 'local',
    };

    const result = await collectAll([project]);
    const p = result.projects[0];

    assert.equal(p.aggregatedTcTotal, 91, 'aggregatedTcTotal must be 30 + 61 = 91');
    assert.equal(p.featurePipelines.length, 1, 'must have exactly 1 feature pipeline');
    assert.equal(p.featurePipelines[0].name, 'feat-a');
    assert.equal(p.featurePipelines[0].tcCount, 61);
    // Main testSummary.total stays 30 — not affected by feature aggregation
    assert.equal(p.testSummary.total, 30, 'main testSummary.total must remain 30');
  });

  it('TC-E2E-002: dashboard.json written by writeDashboard reflects aggregated counts', async () => {
    const { collectAll } = await import('../../lib/collector/index.js');
    const { writeDashboard, dashboardFilePath } = await import('../../lib/store/dashboard.js');

    const project = {
      id: 'e2e-002',
      name: 'e2e-proj',
      location: projectDir,
      type: 'local',
    };

    const dashData = await collectAll([project]);
    writeDashboard(dashData);

    const written = JSON.parse(fs.readFileSync(dashboardFilePath(), 'utf8'));
    const p = written.projects[0];

    assert.equal(p.aggregatedTcTotal, 91);
    assert.equal(p.featurePipelines.length, 1);
    assert.equal(p.featurePipelines[0].name, 'feat-a');
    assert.equal(p.featurePipelines[0].tcCount, 61);
    assert.equal(p.testSummary.total, 30);
  });
});
