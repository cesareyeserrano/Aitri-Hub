/**
 * Tests: integration review + guard on full pre-release versions (FR-046, FR-040)
 *        and snapshot-eligibility floor under the new comparator (NFR-040).
 * Covers: TC-046h, TC-046e, TC-046f, TC-140e
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let hubHome;
let changelogFixture;
let savedEnv;

before(() => {
  hubHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-review-'));
  savedEnv = process.env.AITRI_HUB_DIR;
  process.env.AITRI_HUB_DIR = hubHome;
  changelogFixture = path.join(hubHome, 'CHANGELOG.md');
  fs.writeFileSync(
    changelogFixture,
    [
      '# Integration changelog (fixture)',
      '',
      '## v2.0.0-rc.159 (2026-07-05) — fixture entry — additive',
      '- fixture body line',
      '',
      '## v2.0.0-rc.158 (2026-07-05) — older entry — additive',
      '- older body',
      '',
    ].join('\n'),
  );
});

after(() => {
  if (savedEnv === undefined) delete process.env.AITRI_HUB_DIR;
  else process.env.AITRI_HUB_DIR = savedEnv;
  fs.rmSync(hubHome, { recursive: true, force: true });
});

describe('TC-046h: review stores the full rc tag and silences the banner', () => {
  it('reviewedUpTo keeps the untruncated pre-release tag; no alert at parity', async () => {
    const { cmdIntegrationReview, EXIT } = await import('../../lib/commands/integration-review.js');
    const code = await cmdIntegrationReview(['2.0.0-rc.159', '--changelog', changelogFixture]);
    assert.equal(code, EXIT.OK);

    const { compatManifestPath } = await import('../../lib/store/compat-manifest.js');
    const manifest = JSON.parse(fs.readFileSync(compatManifestPath(), 'utf8'));
    assert.equal(manifest.reviewedUpTo, '2.0.0-rc.159');

    const { evaluateIntegrationAlert } = await import('../../lib/collector/integration-guard.js');
    const alert = evaluateIntegrationAlert('2.0.0-rc.159', '2.0.0-rc.159', {
      reviewedAt: manifest.reviewedAt,
      changelogHash: manifest.changelogHash,
      currentChangelogHash: manifest.changelogHash,
    });
    assert.equal(alert, null, 'no integrationAlert when CLI == reviewed baseline');
  });
});

describe('TC-046e: a newer unreviewed pre-release re-raises the banner', () => {
  it('rc.160 > rc.159 is detected numerically', async () => {
    const { evaluateIntegrationAlert } = await import('../../lib/collector/integration-guard.js');
    const alert = evaluateIntegrationAlert('2.0.0-rc.160', '2.0.0-rc.159', {});
    assert.ok(alert, 'alert must fire for a newer unreviewed version');
    assert.match(JSON.stringify(alert), /2\.0\.0-rc\.160/);
  });
  it('and the truncation bug stays dead: rc.15 vs rc.159 does NOT alert as newer', async () => {
    const { evaluateIntegrationAlert } = await import('../../lib/collector/integration-guard.js');
    const alert = evaluateIntegrationAlert('2.0.0-rc.15', '2.0.0-rc.159', {});
    assert.equal(alert, null, 'an OLDER pre-release must not read as newer');
  });
});

describe('TC-046f: review rejects an unparseable version, manifest untouched', () => {
  it('exits non-zero with usage and leaves the manifest bytes unchanged', async () => {
    const { cmdIntegrationReview, EXIT } = await import('../../lib/commands/integration-review.js');
    const { compatManifestPath } = await import('../../lib/store/compat-manifest.js');
    const beforeBytes = fs.readFileSync(compatManifestPath(), 'utf8');

    const code = await cmdIntegrationReview(['not-a-version', '--changelog', changelogFixture]);
    assert.notEqual(code, EXIT.OK);
    assert.equal(code, EXIT.INVALID_VERSION);

    const afterBytes = fs.readFileSync(compatManifestPath(), 'utf8');
    assert.equal(afterBytes, beforeBytes, 'manifest must be untouched on invalid input');
  });
});

describe('TC-140e: snapshot-eligibility floor under the new comparator', () => {
  it('0.1.50 < 0.1.77 floor → fallback; pre-release 2.0.0-rc.15 ≥ floor → eligible', async () => {
    const { _eligibility } = await import('../../lib/collector/index.js');
    const { semverCmp, SNAPSHOT_MIN_AITRI_VERSION } = _eligibility;
    assert.equal(SNAPSHOT_MIN_AITRI_VERSION, '0.1.77');
    assert.ok(semverCmp('0.1.50', SNAPSHOT_MIN_AITRI_VERSION) < 0, 'below floor → legacy path');
    assert.ok(semverCmp('2.0.0-rc.15', SNAPSHOT_MIN_AITRI_VERSION) > 0, 'rc channel is eligible');
    assert.ok(semverCmp('junk-version', SNAPSHOT_MIN_AITRI_VERSION) < 0, 'unparseable → too old, never eligible');
  });
});
