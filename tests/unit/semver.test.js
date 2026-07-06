/**
 * Tests: utils/semver
 * Covers: TC-040h, TC-040e, TC-040f
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSemver, compareSemver, gteSemver } from '../../lib/utils/semver.js';

describe('TC-040h: compareSemver — rc counters compare numerically', () => {
  it('2.0.0-rc.159 > 2.0.0-rc.15 (numeric, not lexicographic)', () => {
    assert.ok(compareSemver('2.0.0-rc.159', '2.0.0-rc.15') > 0);
  });
  it('antisymmetry: 2.0.0-rc.15 < 2.0.0-rc.159', () => {
    assert.ok(compareSemver('2.0.0-rc.15', '2.0.0-rc.159') < 0);
  });
  it('equal versions compare 0 and gte holds', () => {
    assert.equal(compareSemver('2.0.0-rc.159', '2.0.0-rc.159'), 0);
    assert.ok(gteSemver('2.0.0-rc.159', '2.0.0-rc.159'));
  });
});

describe('TC-040e: compareSemver — pre-release precedence vs stable and across tags', () => {
  it('2.0.0-rc.159 < 2.0.0 (pre-release precedes its stable release)', () => {
    assert.ok(compareSemver('2.0.0-rc.159', '2.0.0') < 0);
  });
  it('2.0.0-alpha.27 < 2.0.0-rc.1 (alpha < rc alphanumerically)', () => {
    assert.ok(compareSemver('2.0.0-alpha.27', '2.0.0-rc.1') < 0);
  });
  it('core version dominates: 0.1.80 < 2.0.0-rc.15', () => {
    assert.ok(compareSemver('0.1.80', '2.0.0-rc.15') < 0);
    assert.ok(gteSemver('2.0.0-rc.15', '0.1.77'));
  });
  it('numeric identifier < alphanumeric; longer pre wins on equal prefix; build metadata ignored', () => {
    assert.ok(compareSemver('1.0.0-1', '1.0.0-alpha') < 0);
    assert.ok(compareSemver('1.0.0-alpha', '1.0.0-alpha.1') < 0);
    assert.equal(compareSemver('2.0.0-rc.1+build.99', '2.0.0-rc.1'), 0);
  });
  it('leading v tolerated and raw keeps the full tag', () => {
    assert.equal(parseSemver('v2.0.0-rc.159').raw, '2.0.0-rc.159');
    assert.equal(compareSemver('v2.0.0-rc.159', '2.0.0-rc.159'), 0);
  });
});

describe('TC-040f: junk input is rejected, caller degrades', () => {
  it('parseSemver returns null on junk', () => {
    assert.equal(parseSemver('git-deadbeef'), null);
    assert.equal(parseSemver('2.0.0-rc.159 extra words'), null);
    assert.equal(parseSemver(''), null);
    assert.equal(parseSemver(null), null);
    assert.equal(parseSemver(undefined), null);
    assert.equal(parseSemver('2.0'), null);
  });
  it('compareSemver throws TypeError on unparseable input — never a fabricated result', () => {
    assert.throws(() => compareSemver('git-deadbeef', '1.0.0'), TypeError);
    assert.throws(() => compareSemver('1.0.0', 'git-deadbeef'), TypeError);
  });
});
