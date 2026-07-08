/**
 * Tests: contract-catchup-rc161 — quality surfaces projection (FR-061, FR-062)
 * Covers: TC-061h, TC-061e, TC-061f, TC-062h, TC-062e, TC-062f, TC-063h, TC-063e, TC-058f
 *
 * Pure-projection matrix over projectFromSnapshot / projectQualitySurfaces:
 * present-with-data, present-null, absent — per surface, independently.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { projectFromSnapshot, projectQualitySurfaces } from '../../lib/collector/snapshot-reader.js';
import { evaluateIntegrationAlert } from '../../lib/collector/integration-guard.js';

const snapshotWith = perPipeline => ({
  snapshotVersion: 1,
  project: 'p',
  aitriVersion: '2.0.0-rc.161',
  phases: [{ key: 1, status: 'approved' }],
  tests: { totals: { passed: 1, failed: 0, skipped: 0, total: 1 }, perPipeline },
});

const entry = overrides => ({
  scope: 'root',
  passed: 1,
  failed: 0,
  total: 1,
  ran: true,
  quality_gates: null,
  ac_coverage: null,
  ...overrides,
});

describe('TC-061h: quality_gates projected verbatim', () => {
  it('preserves name, status and required', () => {
    const record = projectFromSnapshot(
      snapshotWith([entry({ quality_gates: [{ name: 'lint', status: 'fail', required: true }] })]),
    );
    assert.deepEqual(record.qualitySurfaces.perPipeline, [
      { scope: 'root', quality_gates: [{ name: 'lint', status: 'fail', required: true }] },
    ]);
  });
});

describe('TC-061e: coverage-style gate keeps threshold and measured', () => {
  it('carries the optional numeric fields', () => {
    const record = projectFromSnapshot(
      snapshotWith([
        entry({
          quality_gates: [
            { name: 'coverage', status: 'pass', required: true, threshold: 80, measured: 92 },
          ],
        }),
      ]),
    );
    const gate = record.qualitySurfaces.perPipeline[0].quality_gates[0];
    assert.equal(gate.threshold, 80);
    assert.equal(gate.measured, 92);
  });
});

describe('TC-061f: all-null surfaces → no qualitySurfaces key', () => {
  it('omits the key when every entry is null-null', () => {
    const record = projectFromSnapshot(snapshotWith([entry({})]));
    assert.equal('qualitySurfaces' in record, false, 'no key, not an empty object');
  });

  it('omits the key when tests.perPipeline is absent entirely', () => {
    const record = projectFromSnapshot({
      snapshotVersion: 1,
      project: 'p',
      aitriVersion: '2.0.0-rc.159',
      phases: [{ key: 1, status: 'approved' }],
    });
    assert.equal('qualitySurfaces' in record, false);
  });
});

describe('TC-062h: ac_coverage passes through unchanged', () => {
  it('deep-equals the input array', () => {
    const ac = [
      {
        ac_id: 'AC-001',
        fr_id: 'FR-001',
        tests_passing: 2,
        tests_failing: 0,
        tests_skipped: 0,
        tests_manual: 0,
        status: 'covered',
      },
    ];
    const record = projectFromSnapshot(snapshotWith([entry({ ac_coverage: ac })]));
    assert.deepEqual(record.qualitySurfaces.perPipeline[0].ac_coverage, ac);
  });
});

describe('TC-062e: ac_coverage empty array is preserved, not dropped', () => {
  it('carries [] — present-but-empty stays distinguishable from null', () => {
    const record = projectFromSnapshot(snapshotWith([entry({ ac_coverage: [] })]));
    assert.deepEqual(record.qualitySurfaces.perPipeline[0].ac_coverage, []);
  });
});

describe('TC-062f: per-surface independence — gates without ac_coverage', () => {
  it('the entry carries quality_gates and NO ac_coverage key', () => {
    const record = projectFromSnapshot(
      snapshotWith([entry({ quality_gates: [{ name: 'lint', status: 'pass', required: true }] })]),
    );
    const projected = record.qualitySurfaces.perPipeline[0];
    assert.ok('quality_gates' in projected);
    assert.equal('ac_coverage' in projected, false);
  });
});

describe('projectQualitySurfaces — defensive narrowing', () => {
  it('narrows malformed gate fields instead of carrying them', () => {
    const out = projectQualitySurfaces(
      snapshotWith([
        entry({ quality_gates: [{ name: 42, status: {}, required: 1, threshold: '80' }] }),
      ]),
    );
    assert.deepEqual(out.perPipeline[0].quality_gates, [
      // required: 1 → true (truthy, matching Core's gate semantics — a
      // blocking gate must never read "advisory" here); strings/objects in
      // name/status/threshold are dropped to null/omitted.
      { name: null, status: null, required: true },
    ]);
  });

  it('returns null for a non-object payload', () => {
    assert.equal(projectQualitySurfaces(null), null);
    assert.equal(projectQualitySurfaces({}), null);
  });
});

describe('TC-063h/e + TC-058f: integration alert vs the rc.161 reviewed baseline', () => {
  const REVIEWED = '2.0.0-rc.161';

  it('TC-063h: no alert for a project on the reviewed rc.161', () => {
    const alert = evaluateIntegrationAlert('2.0.0-rc.161', REVIEWED);
    assert.equal(alert, null);
  });

  it('TC-063e: alert still fires beyond the baseline (rc.162)', () => {
    const alert = evaluateIntegrationAlert('2.0.0-rc.162', REVIEWED);
    assert.ok(alert, 'unreviewed version must alert');
  });

  it('TC-058f: alert logic reads versions (+ manifest metadata), never payload keys', () => {
    // evaluateIntegrationAlert takes only version + reviewedUpTo (+ manifest
    // metadata) — snapshot payload contents cannot suppress it by
    // construction; pin the unreviewed case explicitly.
    const alert = evaluateIntegrationAlert('2.0.0-rc.199', REVIEWED);
    assert.ok(alert);
  });

  it('TC-063f: absent/malformed reviewed baseline degrades without throwing', () => {
    // FR-063 is a data edit; the reader's failure modes stay as-is. A missing
    // baseline must produce the pre-existing degraded outcome, never a crash.
    assert.doesNotThrow(() => evaluateIntegrationAlert('2.0.0-rc.161', null));
    assert.doesNotThrow(() => evaluateIntegrationAlert('2.0.0-rc.161', undefined));
  });
});

describe('TC-064: the new projection cases are real, discovered, and close the FR-047 debt', () => {
  const HERE = new URL(import.meta.url).pathname;

  it('TC-064h: this suite carries no skip/todo markers — zero-skip guarantee', () => {
    const src = fsReadSelf();
    assert.doesNotMatch(src, /\bit\.skip\(|\bdescribe\.skip\(|\bit\.todo\(|\btest\.skip\(/,
      'the FR-047 skipped-placeholder pattern must not recur here');
  });

  it('TC-064e: this file sits inside the npm-test unit glob (tests/unit/*.test.js)', () => {
    assert.match(HERE, /\/tests\/unit\/[^/]+\.test\.js$/,
      'outside the glob these cases would silently drop out of CI');
  });

  it('TC-064f: the feature build report re-files no blocked-on-Core debt', () => {
    const reportPath = new URL(
      '../../features/contract-catchup-rc161/spec/04_BUILD_REPORT.json', import.meta.url,
    ).pathname;
    const report = JSON.parse(fsReadFile(reportPath));
    const debt = Array.isArray(report.technical_debt) ? report.technical_debt : [];
    const blocked = debt.filter(d =>
      /quality_gates|ac_coverage|lastSession/i.test(JSON.stringify(d)));
    assert.deepEqual(blocked, [], 'the FR-047 debt closes here instead of moving forward');
  });
});

function fsReadSelf() {
  return fs.readFileSync(new URL(import.meta.url), 'utf8');
}
function fsReadFile(p) {
  return fs.readFileSync(p, 'utf8');
}
