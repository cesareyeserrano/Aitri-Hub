/**
 * Tests: alerts/engine
 * Covers: TC-007h, TC-007e, TC-007f, TC-003e, TC-004e, TC-014h, TC-014f, TC-014e, TC-014e2
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAlerts, deriveStatus, _resetVersionCache, _setVersionCache } from '../../lib/alerts/engine.js';

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

// ── FR-014: VERSION_MISMATCH alert ────────────────────────────────────────────

describe('TC-014h: evaluateAlerts — VERSION_MISMATCH alert when project version differs from CLI', () => {
  beforeEach(() => _setVersionCache('0.1.63'));

  it('returns alert with type "version-mismatch" when project=0.1.01 and CLI=0.1.63', () => {
    const data = makeData({ aitriState: { aitriVersion: '0.1.01', verifyPassed: true, hasDrift: false, verifySummary: null } });
    const result = evaluateAlerts(data);
    assert.ok(result.some(a => a.type === 'version-mismatch'));
  });

  it('alert severity is "warning"', () => {
    const data = makeData({ aitriState: { aitriVersion: '0.1.01', verifyPassed: true, hasDrift: false, verifySummary: null } });
    const alert = evaluateAlerts(data).find(a => a.type === 'version-mismatch');
    assert.equal(alert.severity, 'warning');
  });

  it('alert message contains both versions', () => {
    const data = makeData({ aitriState: { aitriVersion: '0.1.01', verifyPassed: true, hasDrift: false, verifySummary: null } });
    const alert = evaluateAlerts(data).find(a => a.type === 'version-mismatch');
    assert.ok(alert.message.includes('0.1.01'), `Expected message to contain '0.1.01', got: ${alert.message}`);
    assert.ok(alert.message.includes('0.1.63'), `Expected message to contain '0.1.63', got: ${alert.message}`);
  });
});

describe('TC-014f: evaluateAlerts — no VERSION_MISMATCH when aitriVersion is null', () => {
  beforeEach(() => _setVersionCache('0.1.63'));

  it('returns no version-mismatch alert when aitriVersion is null', () => {
    const data = makeData({ aitriState: { aitriVersion: null, verifyPassed: true, hasDrift: false, verifySummary: null } });
    const result = evaluateAlerts(data);
    assert.equal(result.filter(a => a.type === 'version-mismatch').length, 0);
  });

  it('returns no version-mismatch alert when aitriState is null', () => {
    const data = makeData({ aitriState: null });
    const result = evaluateAlerts(data);
    assert.equal(result.filter(a => a.type === 'version-mismatch').length, 0);
  });
});

describe('TC-014e: evaluateAlerts — no VERSION_MISMATCH when CLI version unavailable (null cache)', () => {
  beforeEach(() => _setVersionCache(null));

  it('does not throw when installed version is null', () => {
    const data = makeData({ aitriState: { aitriVersion: '0.1.50', verifyPassed: true, hasDrift: false, verifySummary: null } });
    assert.doesNotThrow(() => evaluateAlerts(data));
  });

  it('returns no version-mismatch alert when CLI version is null', () => {
    const data = makeData({ aitriState: { aitriVersion: '0.1.50', verifyPassed: true, hasDrift: false, verifySummary: null } });
    const result = evaluateAlerts(data);
    assert.equal(result.filter(a => a.type === 'version-mismatch').length, 0);
  });
});

describe('TC-014e2: evaluateAlerts — no VERSION_MISMATCH when versions match', () => {
  beforeEach(() => _setVersionCache('0.1.63'));

  it('returns no version-mismatch alert when project version equals CLI version', () => {
    const data = makeData({ aitriState: { aitriVersion: '0.1.63', verifyPassed: true, hasDrift: false, verifySummary: null } });
    const result = evaluateAlerts(data);
    assert.equal(result.filter(a => a.type === 'version-mismatch').length, 0);
  });
});

describe('TC-014e3: evaluateAlerts — cached version reused across 20 calls', () => {
  beforeEach(() => _setVersionCache('0.1.63'));

  it('returns consistent VERSION_MISMATCH alerts for 20 projects without re-probing CLI', () => {
    // All 20 calls should use the cached '0.1.63' and produce alerts for version '0.1.01'
    for (let i = 0; i < 20; i++) {
      const data = makeData({ aitriState: { aitriVersion: '0.1.01', verifyPassed: true, hasDrift: false, verifySummary: null } });
      const result = evaluateAlerts(data);
      assert.ok(result.some(a => a.type === 'version-mismatch'), `Call ${i + 1}: expected version-mismatch alert`);
    }
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
