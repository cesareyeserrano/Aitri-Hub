/**
 * Tests: collector/detail-reader (W1)
 * Covers: TC-053h, TC-053e, TC-053f (reader level), TC-059f, TC-152e,
 *         plus the test-cases/traceability/bugs builders behind FR-055/056/057.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDetail } from '../../lib/collector/detail-reader.js';

let dir;
const entry = () => ({ id: 'p1', name: 'p1', type: 'local', location: dir });

function writeProject(spec = {}, opts = {}) {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-detail-'));
  fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.aitri'),
    JSON.stringify({
      projectName: 'p1',
      approvedPhases: opts.approvedPhases ?? [1, 3, 5],
      artifactsDir: 'spec',
      aitriVersion: '2.0.0-rc.159',
      ...(opts.stateExtra ?? {}),
    }),
  );
  for (const [name, content] of Object.entries(spec)) {
    fs.writeFileSync(path.join(dir, 'spec', name), content);
  }
}

afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

describe('TC-053e: featureless project implies product scope', () => {
  it('scopes = [product]; product payload built from the root chain', () => {
    writeProject({
      '05_TRACEABILITY.json': JSON.stringify({ overall_status: 'compliant', requirement_compliance: [] }),
    });
    const r = readDetail(entry(), dir, undefined, null);
    assert.equal(r.ok, true);
    assert.deepEqual(r.payload.scopes, ['product']);
    assert.equal(r.payload.scope, 'product');
  });
});

describe('TC-053f: unknown / hostile feature scope rejected', () => {
  it('unknown feature name → 400, no payload', () => {
    writeProject({});
    const r = readDetail(entry(), dir, 'f9', null);
    assert.equal(r.ok, false);
    assert.equal(r.code, 400);
  });
  it('TC-052e: path-traversal scope → 400 (regex rejects the separator)', () => {
    writeProject({});
    for (const bad of ['../../etc', '..', 'a/b', 'x\0y']) {
      const r = readDetail(entry(), dir, bad, null);
      assert.equal(r.ok, false, bad);
      assert.equal(r.code, 400, bad);
    }
  });
});

describe('TC-053h: feature scope reads that feature own chain', () => {
  it('scope=f1 serves f1 TC ids; product serves the root chain', () => {
    writeProject({
      '03_TEST_CASES.json': JSON.stringify({ test_cases: [{ id: 'TC-ROOT1', requirement_id: 'FR-1' }] }),
    });
    const featSpec = path.join(dir, 'features', 'f1', 'spec');
    fs.mkdirSync(featSpec, { recursive: true });
    fs.writeFileSync(path.join(dir, 'features', 'f1', '.aitri'),
      JSON.stringify({ projectName: 'f1', approvedPhases: [1, 3], artifactsDir: 'spec' }));
    fs.writeFileSync(path.join(featSpec, '03_TEST_CASES.json'),
      JSON.stringify({ test_cases: [{ id: 'TC-F1A', requirement_id: 'FR-9' }] }));

    const prod = readDetail(entry(), dir, 'product', null);
    assert.deepEqual(prod.payload.scopes.sort(), ['f1', 'product']);
    assert.equal(prod.payload.testCases.cases[0].id, 'TC-ROOT1');

    const feat = readDetail(entry(), dir, 'f1', null);
    assert.equal(feat.payload.scope, 'f1');
    assert.equal(feat.payload.testCases.cases[0].id, 'TC-F1A');
  });
});

describe('FR-055 builder: TC join, statuses, manual', () => {
  it('joins results, counts, and marks manual pending', () => {
    writeProject({
      '03_TEST_CASES.json': JSON.stringify({
        test_cases: [
          { id: 'TC-1h', requirement_id: 'FR-1', automation: 'auto', scenario: 'happy_path', title: 'a' },
          { id: 'TC-2f', requirement_id: 'FR-1', automation: 'auto', scenario: 'negative', title: 'b' },
          { id: 'TC-3e', requirement_id: 'FR-1', automation: 'manual', manual_reason: 'needs a device', title: 'c' },
        ],
      }),
      '04_TEST_RESULTS.json': JSON.stringify({
        results: [{ tc_id: 'TC-1h', status: 'pass' }, { tc_id: 'TC-2f', status: 'fail' }],
      }),
    });
    const r = readDetail(entry(), dir, 'product', null);
    const tc = r.payload.testCases;
    assert.equal(tc.available, true);
    assert.deepEqual(tc.summary, { passed: 1, failed: 1, pending: 1, skipped: 0, manual: 1 });
    const manual = tc.cases.find(c => c.id === 'TC-3e');
    assert.equal(manual.automation, 'manual');
    assert.equal(manual.manual_reason, 'needs a device');
    assert.equal(manual.status, 'pending');
  });
  it('TC-055f: results absent → all pending, available with a reason marker', () => {
    writeProject({ '03_TEST_CASES.json': JSON.stringify({ test_cases: [{ id: 'TC-1h', requirement_id: 'FR-1' }] }) });
    const r = readDetail(entry(), dir, 'product', null);
    assert.equal(r.payload.testCases.cases[0].status, 'pending');
    assert.equal(r.payload.testCases.resultsPresent, false);
  });
});

describe('FR-056 builder: uncovered MUST pinned + Hub-derived label', () => {
  it('pins the uncovered MUST first and flags derivedByHub when no fr_coverage', () => {
    writeProject({
      '01_REQUIREMENTS.json': JSON.stringify({
        functional_requirements: [
          { id: 'FR-1', title: 'covered', priority: 'MUST' },
          { id: 'FR-2', title: 'uncovered', priority: 'MUST' },
        ],
        coverage_map: [{ need: 'x', disposition: 'FR-1' }],
      }),
      '03_TEST_CASES.json': JSON.stringify({ test_cases: [{ id: 'TC-1h', requirement_id: 'FR-1' }] }),
      '04_TEST_RESULTS.json': JSON.stringify({ results: [{ tc_id: 'TC-1h', status: 'pass' }] }),
    });
    const r = readDetail(entry(), dir, 'product', null);
    const tr = r.payload.traceability;
    assert.equal(tr.available, true);
    assert.equal(tr.frs[0].id, 'FR-2', 'uncovered MUST pinned first');
    assert.equal(tr.frs[0].covered, false);
    assert.equal(tr.derivedByHub, true, 'no fr_coverage in results → Hub-derived');
    assert.ok(Array.isArray(tr.coverageMap));
  });
});

describe('FR-057 builder: absent / empty / corrupt trichotomy', () => {
  it('TC-057e absent vs empty; TC-057f corrupt', () => {
    writeProject({});
    const absent = readDetail(entry(), dir, 'product', null).payload.bugs;
    assert.deepEqual(absent, { available: false, parseError: false });

    fs.writeFileSync(path.join(dir, 'spec', 'BUGS.json'), JSON.stringify({ bugs: [] }));
    const empty = readDetail(entry(), dir, 'product', null).payload.bugs;
    assert.equal(empty.available, true);
    assert.deepEqual(empty.bugs, []);

    fs.writeFileSync(path.join(dir, 'spec', 'BUGS.json'), '{invalid');
    const corrupt = readDetail(entry(), dir, 'product', null).payload.bugs;
    assert.deepEqual(corrupt, { available: false, parseError: true });
  });
  it('TC-057h blocking bug pinned with resolution', () => {
    writeProject({});
    fs.writeFileSync(path.join(dir, 'spec', 'BUGS.json'), JSON.stringify({
      bugs: [
        { id: 'B1', title: 'low', severity: 'low', status: 'open' },
        { id: 'B2', title: 'crit', severity: 'critical', status: 'open', resolution: 'fixed in x', tc_id: 'TC-9', files_changed: ['a.js'] },
      ],
    }));
    const bugs = readDetail(entry(), dir, 'product', null).payload.bugs;
    assert.equal(bugs.bugs[0].id, 'B2', 'blocking pinned first');
    assert.equal(bugs.bugs[0].blocking, true);
    assert.equal(bugs.bugs[0].resolution, 'fixed in x');
    assert.equal(bugs.bugs[0].tc_id, 'TC-9');
  });
});

describe('TC-059f: malformed artifact degrades only its section', () => {
  it('malformed 03 → testCases unavailable; valid bugs still render', () => {
    writeProject({ '03_TEST_CASES.json': '{bad json' });
    fs.writeFileSync(path.join(dir, 'spec', 'BUGS.json'), JSON.stringify({ bugs: [{ id: 'B1', severity: 'low', status: 'open' }] }));
    const r = readDetail(entry(), dir, 'product', null);
    assert.equal(r.payload.testCases.available, false);
    assert.equal(r.payload.testCases.error, '03_TEST_CASES.json');
    assert.equal(r.payload.bugs.available, true);
    assert.equal(r.payload.bugs.bugs.length, 1);
  });
});

describe('TC-152e: whitelist — non-artifact files are never read', () => {
  it('secrets.env / .git are not opened and never appear in the payload', () => {
    writeProject({
      '01_REQUIREMENTS.json': JSON.stringify({ functional_requirements: [] }),
      '02_SYSTEM_DESIGN.md': '# design\n',
    });
    fs.writeFileSync(path.join(dir, 'spec', 'secrets.env'), 'TOKEN=abc');
    fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.git', 'config'), '[core]');

    const opened = [];
    const realRead = fs.readFileSync;
    fs.readFileSync = (p, ...rest) => {
      if (typeof p === 'string') opened.push(path.basename(p));
      return realRead(p, ...rest);
    };
    try {
      const r = readDetail(entry(), dir, 'product', null);
      assert.equal(r.ok, true);
      assert.ok(!opened.includes('secrets.env'), 'secrets.env must never be read');
      assert.ok(!opened.includes('config'), '.git/config must never be read');
      assert.ok(!('secrets.env' in r.payload.artifacts.contents));
    } finally {
      fs.readFileSync = realRead;
    }
  });
});

describe('unreadable project → 404', () => {
  it('missing .aitri returns not-found', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-detail-'));
    const r = readDetail(entry(), dir, 'product', null);
    assert.equal(r.ok, false);
    assert.equal(r.code, 404);
  });
});

describe('path confinement (adversarial findings #2/#3)', () => {
  it('artifactsDir traversal (../../outside) → 400, no out-of-root read', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-detail-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-outside-'));
    fs.writeFileSync(path.join(outside, '01_REQUIREMENTS.json'), JSON.stringify({ functional_requirements: [{ id: 'SECRET' }] }));
    const rel = path.relative(dir, path.join(outside));
    fs.writeFileSync(path.join(dir, '.aitri'),
      JSON.stringify({ projectName: 'p1', approvedPhases: [1], artifactsDir: rel }));
    const r = readDetail(entry(), dir, 'product', null);
    assert.equal(r.ok, false);
    assert.equal(r.code, 400);
    fs.rmSync(outside, { recursive: true, force: true });
  });
  it('symlinked feature dir pointing outside root → scope 400', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-detail-'));
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'),
      JSON.stringify({ projectName: 'p1', approvedPhases: [1], artifactsDir: 'spec' }));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-outside-'));
    fs.mkdirSync(path.join(outside, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(outside, '.aitri'),
      JSON.stringify({ projectName: 'evil', approvedPhases: [1], artifactsDir: 'spec' }));
    fs.writeFileSync(path.join(outside, 'spec', '05_TRACEABILITY.json'),
      JSON.stringify({ overall_status: 'compliant', requirement_compliance: [] }));
    fs.mkdirSync(path.join(dir, 'features'), { recursive: true });
    fs.symlinkSync(outside, path.join(dir, 'features', 'evil'));

    // The symlinked feature is discovered as a scope name, but reading it is
    // refused because its resolved target escapes the project root.
    const r = readDetail(entry(), dir, 'evil', null);
    assert.equal(r.ok, false);
    assert.equal(r.code, 400);
    fs.rmSync(outside, { recursive: true, force: true });
  });
});

describe('nit #5: recorded manual result is pending across row/summary/filter', () => {
  it("results status 'manual' → row status pending, counted in manual+pending", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-detail-'));
    fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({ projectName: 'p1', approvedPhases: [1, 3], artifactsDir: 'spec' }));
    fs.writeFileSync(path.join(dir, 'spec', '03_TEST_CASES.json'),
      JSON.stringify({ test_cases: [{ id: 'TC-Mh', requirement_id: 'FR-1', automation: 'manual' }] }));
    fs.writeFileSync(path.join(dir, 'spec', '04_TEST_RESULTS.json'),
      JSON.stringify({ results: [{ tc_id: 'TC-Mh', status: 'manual' }] }));
    const r = readDetail(entry(), dir, 'product', null);
    assert.equal(r.payload.testCases.cases[0].status, 'pending');
    assert.equal(r.payload.testCases.summary.manual, 1);
    assert.equal(r.payload.testCases.summary.pending, 1);
  });
});
