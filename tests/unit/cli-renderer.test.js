/**
 * Tests: renderer/cli
 * Covers: TC-005e, TC-005f (unit portions)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderDashboard } from '../../lib/renderer/cli.js';

function makeData(projects = []) {
  return {
    schemaVersion: '1',
    collectedAt: new Date().toISOString(),
    projects,
  };
}

function makeProject(overrides = {}) {
  return {
    id: 'a1b2c3d4',
    name: 'my-app',
    location: '/tmp/my-app',
    type: 'local',
    status: 'healthy',
    aitriState: { approvedPhases: [1, 2, 3], verifyPassed: true, verifySummary: { failed: 0 } },
    gitMeta: { isGitRepo: true, lastCommitAgeHours: 2, branch: 'main' },
    testSummary: { available: true, passed: 10, failed: 0, total: 10 },
    alerts: [],
    collectionError: null,
    ...overrides,
  };
}

// ── TC-005e: 60-column terminal hides ALERTS column header ────────────────────

describe('TC-005e: renderDashboard — 60-column terminal hides ALERTS column', () => {
  const data = makeData([makeProject({
    status: 'warning',
    alerts: [{ type: 'stale', message: 'No commits in 80h', severity: 'warning' }],
  })]);

  it('does not include standalone ALERTS column header at width=60', () => {
    const output = renderDashboard(data, 60);
    // Remove ANSI codes before checking
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    // Should NOT have ALERTS as a column header in the table row
    assert.ok(!plain.includes('  ALERTS'), `Expected no ALERTS column header, got:\n${plain}`);
  });

  it('includes project name in output at width=60', () => {
    const output = renderDashboard(data, 60);
    const plain = output.replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(plain.includes('MY-APP'), `Expected project name in output, got:\n${plain}`);
  });
});

// ── Full-width mode renders card with all key sections ────────────────────────

describe('renderDashboard — full-width mode (80 cols) renders card content', () => {
  const data = makeData([makeProject()]);

  it('includes project name (uppercased) in card output', () => {
    const plain = renderDashboard(data, 80).replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(plain.includes('MY-APP'));
  });

  it('includes status label in card output', () => {
    const plain = renderDashboard(data, 80).replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(plain.includes('HEALTHY'));
  });

  it('includes phase progress in card output', () => {
    const plain = renderDashboard(data, 80).replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(plain.includes('Phase'));
  });

  it('includes tests row in card output', () => {
    const plain = renderDashboard(data, 80).replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(plain.includes('Tests:'));
  });

  it('includes commit row in card output', () => {
    const plain = renderDashboard(data, 80).replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(plain.includes('Commit:'));
  });

  it('includes AITRI HUB header', () => {
    const plain = renderDashboard(data, 80).replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(plain.includes('AITRI HUB'));
  });
});

// ── Empty projects shows setup message ───────────────────────────────────────

describe('renderDashboard — empty projects shows setup guidance', () => {
  it('contains setup instruction when no projects', () => {
    const data = makeData([]);
    const plain = renderDashboard(data, 80).replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(
      plain.includes('aitri-hub setup') || plain.includes('No projects'),
      `Expected setup hint, got:\n${plain}`
    );
  });
});

// ── AITRI HUB header always present ──────────────────────────────────────────

describe('renderDashboard — header always present', () => {
  it('contains AITRI HUB title', () => {
    const data = makeData([makeProject()]);
    const plain = renderDashboard(data, 80).replace(/\x1b\[[0-9;]*m/g, '');
    assert.ok(plain.includes('AITRI HUB'));
  });
});
