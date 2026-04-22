/**
 * Tests: collector/integration-guard
 * Covers: TC-010h, TC-010e1, TC-010e2, TC-010f, TC-010f1
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateIntegrationAlert, semverGt } from '../../lib/collector/integration-guard.js';
import { INTEGRATION_LAST_REVIEWED } from '../../lib/constants.js';

/**
 * Derive a version guaranteed greater than INTEGRATION_LAST_REVIEWED.
 * Decouples tests from the live constant so future bumps don't break them.
 */
function higherThanReviewed() {
  const [maj, min, patch] = INTEGRATION_LAST_REVIEWED.split('.').map(Number);
  return `${maj}.${min}.${patch + 1}`;
}
const HIGHER = higherThanReviewed();

// ── semverGt unit tests ───────────────────────────────────────────────────────
describe('semverGt — inline semver comparison', () => {
  it('returns true when major is greater', () => {
    assert.equal(semverGt('1.0.0', '0.9.9'), true);
  });

  it('returns true when minor is greater (same major)', () => {
    assert.equal(semverGt('0.2.0', '0.1.99'), true);
  });

  it('returns true when patch is greater (same major.minor)', () => {
    assert.equal(semverGt('0.1.77', '0.1.76'), true);
  });

  it('returns false when equal', () => {
    assert.equal(semverGt('0.1.76', '0.1.76'), false);
  });

  it('returns false when a < b', () => {
    assert.equal(semverGt('0.1.70', '0.1.76'), false);
  });

  it('handles v-prefix on both sides', () => {
    assert.equal(semverGt('v0.1.77', 'v0.1.76'), true);
  });

  it('returns false when a is null', () => {
    assert.equal(semverGt(null, '0.1.76'), false);
  });

  it('returns false when b is null', () => {
    assert.equal(semverGt('0.1.77', null), false);
  });
});

// ── TC-010h: alert generated when detected > reviewed ─────────────────────────
describe('TC-010h: evaluateIntegrationAlert — warning when CLI is newer', () => {
  it('returns object with severity=warning', () => {
    const result = evaluateIntegrationAlert(HIGHER, INTEGRATION_LAST_REVIEWED);
    assert.notEqual(result, null);
    assert.equal(result.severity, 'warning');
  });

  it('message contains the detected version', () => {
    const result = evaluateIntegrationAlert(HIGHER, INTEGRATION_LAST_REVIEWED);
    assert.ok(
      result.message.includes(HIGHER),
      `message should include '${HIGHER}': ${result.message}`,
    );
  });

  it('message contains INTEGRATION_LAST_REVIEWED version', () => {
    const result = evaluateIntegrationAlert(HIGHER, INTEGRATION_LAST_REVIEWED);
    assert.ok(
      result.message.includes(INTEGRATION_LAST_REVIEWED),
      `message should include '${INTEGRATION_LAST_REVIEWED}': ${result.message}`,
    );
  });

  it('changelogUrl is a non-empty string', () => {
    const result = evaluateIntegrationAlert(HIGHER, INTEGRATION_LAST_REVIEWED);
    assert.ok(typeof result.changelogUrl === 'string' && result.changelogUrl.length > 0);
  });
});

// ── TC-010e1: null when equal ─────────────────────────────────────────────────
describe('TC-010e1: evaluateIntegrationAlert — null when CLI equals reviewed', () => {
  it('returns null when detected version equals INTEGRATION_LAST_REVIEWED', () => {
    const result = evaluateIntegrationAlert(INTEGRATION_LAST_REVIEWED, INTEGRATION_LAST_REVIEWED);
    assert.equal(result, null);
  });
});

// ── TC-010e2: null when older ─────────────────────────────────────────────────
describe('TC-010e2: evaluateIntegrationAlert — null when CLI is older', () => {
  it('returns null when detected version is older than INTEGRATION_LAST_REVIEWED', () => {
    const result = evaluateIntegrationAlert('0.1.0', INTEGRATION_LAST_REVIEWED);
    assert.equal(result, null);
  });

  it('returns null for very old version 0.0.1', () => {
    const result = evaluateIntegrationAlert('0.0.1', INTEGRATION_LAST_REVIEWED);
    assert.equal(result, null);
  });
});

// ── TC-010f: undetectable warning when null ───────────────────────────────────
describe('TC-010f: evaluateIntegrationAlert — undetectable warning when null', () => {
  it('returns warning object when detectedVersion is null', () => {
    const result = evaluateIntegrationAlert(null, INTEGRATION_LAST_REVIEWED);
    assert.notEqual(result, null);
    assert.equal(result.severity, 'warning');
  });

  it('message contains "undetectable"', () => {
    const result = evaluateIntegrationAlert(null, INTEGRATION_LAST_REVIEWED);
    assert.ok(
      result.message.toLowerCase().includes('undetectable'),
      `message should contain 'undetectable': ${result.message}`,
    );
  });

  it('changelogUrl is non-empty when detectedVersion is null', () => {
    const result = evaluateIntegrationAlert(null, INTEGRATION_LAST_REVIEWED);
    assert.ok(typeof result.changelogUrl === 'string' && result.changelogUrl.length > 0);
  });
});
