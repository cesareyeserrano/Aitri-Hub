/**
 * Tests: alerts/engine
 * Covers: TC-007h, TC-007e, TC-007f, TC-003e, TC-004e
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAlerts, deriveStatus } from '../../lib/alerts/engine.js';

function makeData(overrides = {}) {
  return {
    aitriState: { verifyPassed: true, verifySummary: { failed: 0 }, hasDrift: false },
    gitMeta: { isGitRepo: true, lastCommitAgeHours: 1.0 },
    testSummary: { available: true, failed: 0 },
    cacheStale: false,
    ...overrides,
  };
}

// ── TC-007h: healthy project → no alerts ──────────────────────────────────────

describe('TC-007h: evaluateAlerts — healthy project returns empty array', () => {
  it('returns [] for project with all conditions OK', () => {
    const result = evaluateAlerts(makeData());
    assert.equal(result.length, 0);
    assert.deepEqual(result, []);
  });
});

// ── TC-007e: multiple concurrent alert conditions ─────────────────────────────

describe('TC-007e: evaluateAlerts — 4 concurrent alerts returned', () => {
  const data = makeData({
    aitriState: { verifyPassed: false, verifySummary: { failed: 1 }, hasDrift: true },
    gitMeta: { isGitRepo: true, lastCommitAgeHours: 90.0 },
    testSummary: { available: true, failed: 3 },
  });

  it('returns 4 alerts total', () => {
    const result = evaluateAlerts(data);
    assert.equal(result.length, 4);
  });

  it('includes stale alert', () => {
    const result = evaluateAlerts(data);
    assert.ok(result.some(a => a.type === 'stale'));
  });

  it('includes verify-failed alert', () => {
    const result = evaluateAlerts(data);
    assert.ok(result.some(a => a.type === 'verify-failed'));
  });

  it('includes drift alert', () => {
    const result = evaluateAlerts(data);
    assert.ok(result.some(a => a.type === 'drift'));
  });

  it('includes tests-failing alert', () => {
    const result = evaluateAlerts(data);
    assert.ok(result.some(a => a.type === 'tests-failing'));
  });
});

// ── TC-007f: verifyPassed=false → verify-failed alert ────────────────────────

describe('TC-007f: evaluateAlerts — verifyPassed=false generates verify-failed alert', () => {
  const data = makeData({
    aitriState: { verifyPassed: false, verifySummary: { failed: 1 }, hasDrift: false },
  });

  it('returns exactly 1 alert', () => {
    const result = evaluateAlerts(data);
    assert.equal(result.length, 1);
  });

  it('alert type is verify-failed', () => {
    const result = evaluateAlerts(data);
    assert.equal(result[0].type, 'verify-failed');
  });

  it('alert severity is error', () => {
    const result = evaluateAlerts(data);
    assert.equal(result[0].severity, 'error');
  });

  it('alert message is "Verify failed"', () => {
    const result = evaluateAlerts(data);
    assert.equal(result[0].message, 'Verify failed');
  });
});

// ── TC-003e: commit exactly 73h ago → stale alert ────────────────────────────

describe('TC-003e: evaluateAlerts — 73h stale commit generates stale alert', () => {
  const data = makeData({
    gitMeta: { isGitRepo: true, lastCommitAgeHours: 73.0 },
  });

  it('returns exactly 1 alert', () => {
    const result = evaluateAlerts(data);
    assert.equal(result.length, 1);
  });

  it('alert type is stale', () => {
    const result = evaluateAlerts(data);
    assert.equal(result[0].type, 'stale');
  });

  it('alert message contains hours count', () => {
    const result = evaluateAlerts(data);
    assert.ok(result[0].message.includes('73h'), `Expected message to contain '73h', got: ${result[0].message}`);
  });

  it('alert severity is warning', () => {
    const result = evaluateAlerts(data);
    assert.equal(result[0].severity, 'warning');
  });
});

// ── TC-004e: failed > 0 → tests-failing alert ────────────────────────────────

describe('TC-004e: evaluateAlerts — testSummary.failed=2 generates tests-failing alert', () => {
  const data = makeData({
    testSummary: { available: true, failed: 2, passed: 28, total: 30 },
  });

  it('returns exactly 1 alert', () => {
    const result = evaluateAlerts(data);
    assert.equal(result.length, 1);
  });

  it('alert type is tests-failing', () => {
    const result = evaluateAlerts(data);
    assert.equal(result[0].type, 'tests-failing');
  });

  it('alert message contains failure count "2"', () => {
    const result = evaluateAlerts(data);
    assert.ok(result[0].message.includes('2'), `Expected message to contain '2', got: ${result[0].message}`);
  });
});

// ── deriveStatus ──────────────────────────────────────────────────────────────

describe('deriveStatus()', () => {
  it('returns "healthy" for empty alerts array', () => {
    assert.equal(deriveStatus([]), 'healthy');
  });

  it('returns "warning" for array with only warning-severity alerts', () => {
    assert.equal(deriveStatus([{ severity: 'warning', type: 'stale', message: 'x' }]), 'warning');
  });

  it('returns "error" for array with at least one error-severity alert', () => {
    assert.equal(deriveStatus([
      { severity: 'warning', type: 'stale', message: 'x' },
      { severity: 'error', type: 'verify-failed', message: 'y' },
    ]), 'error');
  });
});
