/**
 * Tests: integration_update feature — pipeline integration tests
 * Covers: TC-010e2e, TC-014e3e
 *
 * These tests exercise the full collection pipeline from .aitri → readAitriState
 * and from aitriState → evaluateAlerts, verifying that new fields flow correctly
 * through the system end-to-end.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAitriState } from '../../lib/collector/aitri-reader.js';
import { evaluateAlerts, _setVersionCache } from '../../lib/alerts/engine.js';

function tmpDir(suffix = 'aitri-hub-int-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), suffix));
}

// ── TC-010e2e: aitriVersion flows from .aitri through readAitriState ──────────

describe('TC-010e2e: aitriVersion flows from .aitri through readAitriState correctly', () => {
  let projectDir;

  before(() => {
    projectDir = tmpDir('e2e-proj-');
    fs.writeFileSync(
      path.join(projectDir, '.aitri'),
      JSON.stringify({
        projectName: 'e2e-proj',
        aitriVersion: '0.1.50',
        currentPhase: 2,
        approvedPhases: [1],
        completedPhases: [1],
      }),
    );
  });

  after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  it('readAitriState returns aitriVersion="0.1.50" from project .aitri', () => {
    const state = readAitriState(projectDir);
    assert.notEqual(state, null);
    assert.equal(state.aitriVersion, '0.1.50');
  });

  it('readAitriState returns projectName="e2e-proj"', () => {
    const state = readAitriState(projectDir);
    assert.equal(state.projectName, 'e2e-proj');
  });

  it('readAitriState returns artifactsDir="" (contract default) when absent', () => {
    // .aitri has no artifactsDir field — must default to '' per integration contract
    const state = readAitriState(projectDir);
    assert.equal(state.artifactsDir, '');
  });
});

// ── TC-014e3e: VERSION_MISMATCH alert present in evaluateAlerts output ─────────

describe('TC-014e3e: VERSION_MISMATCH alert generated when project aitriVersion differs from cached CLI version', () => {
  let projectDir;

  before(() => {
    projectDir = tmpDir('version-test-');
    fs.writeFileSync(
      path.join(projectDir, '.aitri'),
      JSON.stringify({
        projectName: 'version-test',
        aitriVersion: '0.1.01',
        currentPhase: 1,
        approvedPhases: [],
        completedPhases: [],
      }),
    );
    // Pre-set CLI version cache to a known value to make test deterministic
    _setVersionCache('0.1.99');
  });

  after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  it('evaluateAlerts produces version-mismatch alert when project=0.1.01 and CLI=0.1.99', () => {
    const state = readAitriState(projectDir);
    assert.notEqual(state, null);
    assert.equal(state.aitriVersion, '0.1.01');

    const data = {
      aitriState: state,
      gitMeta: { isGitRepo: false, lastCommitAgeHours: null },
      testSummary: { available: false },
      cacheStale: false,
      complianceSummary: { available: false },
    };

    const alerts = evaluateAlerts(data);
    const versionAlert = alerts.find(a => a.type === 'version-mismatch');
    assert.ok(versionAlert, 'Expected version-mismatch alert to be present');
    assert.equal(versionAlert.severity, 'warning');
    assert.ok(
      versionAlert.message.includes('0.1.01'),
      `Message should contain '0.1.01': ${versionAlert.message}`,
    );
    assert.ok(
      versionAlert.message.includes('0.1.99'),
      `Message should contain '0.1.99': ${versionAlert.message}`,
    );
  });

  it('no version-mismatch alert when aitriVersion matches cached CLI version', () => {
    _setVersionCache('0.1.01'); // match project version
    const state = readAitriState(projectDir);
    const data = {
      aitriState: state,
      gitMeta: { isGitRepo: false, lastCommitAgeHours: null },
      testSummary: { available: false },
      cacheStale: false,
      complianceSummary: { available: false },
    };
    const alerts = evaluateAlerts(data);
    assert.equal(alerts.filter(a => a.type === 'version-mismatch').length, 0);
  });
});
