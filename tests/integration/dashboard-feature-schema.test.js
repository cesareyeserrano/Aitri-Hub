/**
 * Tests: store/dashboard — feature pipeline schema extension
 * Covers: TC-014h, TC-014h2, TC-014e1, TC-014e2, TC-014f
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Override hubDir to use tmpDir for tests
process.env.AITRI_HUB_DIR_OVERRIDE = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-dash-schema-'));

const { writeDashboard, dashboardFilePath } = await import('../../lib/store/dashboard.js');

after(() => {
  const dir = process.env.AITRI_HUB_DIR_OVERRIDE;
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

// ── TC-014h: featurePipelines and aggregatedTcTotal written correctly ─────────
describe('TC-014h: writeDashboard — writes featurePipelines and aggregatedTcTotal', () => {
  it('round-trips featurePipelines and aggregatedTcTotal', () => {
    const data = {
      schemaVersion: '1',
      collectedAt: new Date().toISOString(),
      integrationAlert: null,
      meta: { detectedAitriVersion: '0.1.76' },
      projects: [
        {
          name: 'my-project',
          location: '/tmp/my-project',
          testSummary: { total: 30, passed: 30, failed: 0, skipped: 0, available: true },
          featurePipelines: [
            {
              name: 'feat-a',
              tcCount: 61,
              approvedPhases: [1, 2],
              currentPhase: 3,
              totalPhases: 5,
              verifyStatus: null,
            },
          ],
          aggregatedTcTotal: 91,
        },
      ],
    };
    writeDashboard(data);
    const parsed = JSON.parse(fs.readFileSync(dashboardFilePath(), 'utf8'));
    assert.equal(parsed.projects[0].aggregatedTcTotal, 91);
    assert.equal(parsed.projects[0].featurePipelines.length, 1);
    assert.equal(parsed.projects[0].featurePipelines[0].name, 'feat-a');
    assert.equal(parsed.projects[0].featurePipelines[0].tcCount, 61);
  });
});

// ── TC-014h2: top-level integrationAlert written correctly ────────────────────
describe('TC-014h2: writeDashboard — integrationAlert at top level', () => {
  it('integrationAlert with severity=warning is present after write', () => {
    const data = {
      schemaVersion: '1',
      collectedAt: new Date().toISOString(),
      integrationAlert: {
        severity: 'warning',
        message: 'Aitri 0.1.77 detected — Hub integration not reviewed past 0.1.76',
        changelogUrl:
          'https://github.com/cesareyeserrano/Aitri/blob/main/docs/integrations/CHANGELOG.md',
      },
      meta: { detectedAitriVersion: '0.1.77' },
      projects: [],
    };
    writeDashboard(data);
    const parsed = JSON.parse(fs.readFileSync(dashboardFilePath(), 'utf8'));
    assert.equal(parsed.integrationAlert.severity, 'warning');
    assert.ok(parsed.integrationAlert.message.includes('0.1.77'));
    assert.ok(
      typeof parsed.integrationAlert.changelogUrl === 'string' &&
        parsed.integrationAlert.changelogUrl.length > 0,
    );
  });
});

// ── TC-014e1: empty featurePipelines and matching aggregatedTcTotal ───────────
describe('TC-014e1: writeDashboard — no features', () => {
  it('featurePipelines=[] and aggregatedTcTotal equals main count', () => {
    const data = {
      schemaVersion: '1',
      collectedAt: new Date().toISOString(),
      integrationAlert: null,
      meta: { detectedAitriVersion: null },
      projects: [
        {
          name: 'no-feat-project',
          testSummary: { total: 15, passed: 15, failed: 0, skipped: 0, available: true },
          featurePipelines: [],
          aggregatedTcTotal: 15,
        },
      ],
    };
    writeDashboard(data);
    const parsed = JSON.parse(fs.readFileSync(dashboardFilePath(), 'utf8'));
    assert.ok(Array.isArray(parsed.projects[0].featurePipelines));
    assert.equal(parsed.projects[0].featurePipelines.length, 0);
    assert.equal(parsed.projects[0].aggregatedTcTotal, 15);
  });
});

// ── TC-014e2: backward compatibility with existing fields ─────────────────────
describe('TC-014e2: writeDashboard — existing fields unaffected by new fields', () => {
  it('name, status, gitMeta, alerts survive alongside featurePipelines', () => {
    const data = {
      schemaVersion: '1',
      collectedAt: new Date().toISOString(),
      integrationAlert: null,
      meta: { detectedAitriVersion: '0.1.76' },
      projects: [
        {
          name: 'compat-project',
          status: 'healthy',
          location: '/tmp/compat',
          gitMeta: { branch: 'main', lastCommitAgeHours: 2 },
          alerts: [],
          featurePipelines: [],
          aggregatedTcTotal: 0,
        },
      ],
    };
    writeDashboard(data);
    const parsed = JSON.parse(fs.readFileSync(dashboardFilePath(), 'utf8'));
    const p = parsed.projects[0];
    assert.equal(p.name, 'compat-project');
    assert.equal(p.status, 'healthy');
    assert.equal(p.gitMeta.branch, 'main');
    assert.deepEqual(p.alerts, []);
    // New fields also present
    assert.deepEqual(p.featurePipelines, []);
    assert.equal(p.aggregatedTcTotal, 0);
  });
});

// ── TC-014f: file is valid JSON after write ───────────────────────────────────
describe('TC-014f: writeDashboard — output is always valid JSON', () => {
  it('JSON.parse does not throw after write with complex data', () => {
    const data = {
      schemaVersion: '1',
      collectedAt: new Date().toISOString(),
      integrationAlert: {
        severity: 'warning',
        message: 'test',
        changelogUrl: 'http://example.com',
      },
      meta: { detectedAitriVersion: '0.2.0' },
      projects: Array.from({ length: 5 }, (_, i) => ({
        name: `proj-${i}`,
        featurePipelines: [
          {
            name: 'f',
            tcCount: i,
            approvedPhases: [1],
            currentPhase: 2,
            totalPhases: 5,
            verifyStatus: null,
          },
        ],
        aggregatedTcTotal: i + 5,
      })),
    };
    writeDashboard(data);
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(dashboardFilePath(), 'utf8')));
  });
});
