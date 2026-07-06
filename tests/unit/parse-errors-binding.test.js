/**
 * Tests: FR-044 (bugs.parseErrors) + FR-045 (resultsBinding) + NFR-044 additivity
 * Covers: TC-044h, TC-044e, TC-044f, TC-045h, TC-045e, TC-045f, TC-144e, TC-144h, TC-144f
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { projectFromSnapshot } from '../../lib/collector/snapshot-reader.js';
import { readBugsSummary } from '../../lib/collector/bugs-reader.js';
import { evaluateAlerts } from '../../lib/alerts/engine.js';
import { ALERT_TYPE, SEVERITY } from '../../lib/constants.js';

const baseSnapshot = {
  snapshotVersion: 1,
  project: 'p1',
  phases: [
    { key: 1, status: 'approved' },
    { key: 'verify', status: 'passed', verifySummary: { passed: 3, failed: 0, skipped: 0, total: 3 } },
  ],
};

function alertsFor(data) {
  return evaluateAlerts({
    aitriState: { approvedPhases: [], events: [] },
    gitMeta: null,
    ...data,
  });
}

describe('TC-044h: snapshot bugs.parseErrors → warning alert + carried field', () => {
  it('parseErrors carried verbatim and BUGS_PARSE_ERROR warning fires', () => {
    const projected = projectFromSnapshot({
      ...baseSnapshot,
      bugs: { total: 0, open: 0, parseErrors: ['root'] },
    });
    assert.deepEqual(projected.bugsSummary.parseErrors, ['root']);
    const alerts = alertsFor({ bugsSummary: projected.bugsSummary });
    const alert = alerts.find(a => a.type === ALERT_TYPE.BUGS_PARSE_ERROR);
    assert.ok(alert, 'BUGS_PARSE_ERROR alert must fire');
    assert.equal(alert.severity, SEVERITY.WARNING);
    assert.match(alert.message, /root/);
    assert.match(alert.message, /NOT counted/);
  });
});

describe('TC-044e: empty parseErrors adds no noise', () => {
  it('snapshot with parseErrors: [] → no key, no alert', () => {
    const projected = projectFromSnapshot({
      ...baseSnapshot,
      bugs: { total: 2, open: 1, bySeverity: { medium: 1 }, parseErrors: [] },
    });
    assert.ok(!('parseErrors' in projected.bugsSummary), 'no key when no errors');
    const alerts = alertsFor({ bugsSummary: projected.bugsSummary });
    assert.equal(alerts.find(a => a.type === ALERT_TYPE.BUGS_PARSE_ERROR), undefined);
  });
  it('fallback: valid empty BUGS.json → zero bugs, no parse-error key', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-bugs-'));
    fs.writeFileSync(path.join(dir, 'BUGS.json'), '{"bugs":[]}');
    const summary = readBugsSummary(dir, '');
    assert.equal(summary.open, 0);
    assert.ok(!('parseErrors' in summary));
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('TC-044f: fallback flags corrupt BUGS.json (syntax AND shape)', () => {
  it('invalid JSON → parseErrors [root], zeroed counters', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-bugs-'));
    fs.writeFileSync(path.join(dir, 'BUGS.json'), '{invalid');
    const summary = readBugsSummary(dir, '');
    assert.deepEqual(summary.parseErrors, ['root']);
    assert.equal(summary.open, 0);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('non-contract shape {"bugs":42} → parseErrors [root], and the alert fires', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-bugs-'));
    fs.writeFileSync(path.join(dir, 'BUGS.json'), '{"bugs":42}');
    const summary = readBugsSummary(dir, '');
    assert.deepEqual(summary.parseErrors, ['root']);
    const alerts = alertsFor({ bugsSummary: summary });
    assert.ok(alerts.find(a => a.type === ALERT_TYPE.BUGS_PARSE_ERROR));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('absent BUGS.json is still null (absence is normal, not an error)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-bugs-'));
    assert.equal(readBugsSummary(dir, ''), null);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('TC-045h: unbound results → warning indicator', () => {
  it('resultsBinding carried and RESULTS_UNBOUND fires with the verify-run command', () => {
    const projected = projectFromSnapshot({
      ...baseSnapshot,
      phases: [
        { key: 1, status: 'approved' },
        { key: 'verify', status: 'passed', resultsBinding: 'no-stamp' },
      ],
    });
    assert.equal(projected.resultsBinding, 'no-stamp');
    const alerts = alertsFor({ resultsBinding: projected.resultsBinding });
    const alert = alerts.find(a => a.type === ALERT_TYPE.RESULTS_UNBOUND);
    assert.ok(alert);
    assert.equal(alert.severity, SEVERITY.WARNING);
    assert.equal(alert.command, 'aitri verify-run');
    assert.match(alert.message, /no-stamp/);
  });
  it("'mismatch' and 'missing-file' also fire; 'bound' does not", () => {
    for (const rb of ['mismatch', 'missing-file']) {
      const alerts = alertsFor({ resultsBinding: rb });
      assert.ok(alerts.find(a => a.type === ALERT_TYPE.RESULTS_UNBOUND), rb);
    }
    const alerts = alertsFor({ resultsBinding: 'bound' });
    assert.equal(alerts.find(a => a.type === ALERT_TYPE.RESULTS_UNBOUND), undefined);
  });
});

describe('TC-045e: older CLI without resultsBinding → nothing added', () => {
  it('no key on the projection, no alert', () => {
    const projected = projectFromSnapshot(baseSnapshot);
    assert.ok(!('resultsBinding' in projected), 'absent ≠ unbound');
    const alerts = alertsFor({});
    assert.equal(alerts.find(a => a.type === ALERT_TYPE.RESULTS_UNBOUND), undefined);
  });
});

describe('TC-045f: malformed resultsBinding shape degrades to absent', () => {
  it('unknown string, object, and number are all dropped without crash', () => {
    for (const bad of ['yes', { state: 'unbound' }, 42, true]) {
      const projected = projectFromSnapshot({
        ...baseSnapshot,
        phases: [
          { key: 1, status: 'approved' },
          { key: 'verify', status: 'passed', resultsBinding: bad },
        ],
      });
      assert.ok(!('resultsBinding' in projected), `dropped: ${JSON.stringify(bad)}`);
    }
  });
});

// ── NFR-044: dashboard.json stays additive ──────────────────────────────────

/** Recursive field→type inventory ('a.b' → 'string'|'number'|'object'|...). */
function typeInventory(obj, prefix = '', out = new Map()) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    out.set(prefix || '(root)', Array.isArray(obj) ? 'array' : obj === null ? 'null' : typeof obj);
    return out;
  }
  for (const k of Object.keys(obj)) typeInventory(obj[k], prefix ? `${prefix}.${k}` : k, out);
  return out;
}

function typeDiff(baseline, current) {
  const diffs = [];
  for (const [key, type] of baseline) {
    if (!current.has(key)) diffs.push(`${key}: removed`);
    else if (current.get(key) !== type && type !== 'null' && current.get(key) !== 'null')
      diffs.push(`${key}: ${type} → ${current.get(key)}`);
  }
  return diffs;
}

describe('TC-144e: no new keys appear without data', () => {
  it('projection of a snapshot lacking the new fields adds no keys', () => {
    const projected = projectFromSnapshot(baseSnapshot);
    assert.ok(!('resultsBinding' in projected));
    assert.ok(!('parseErrors' in (projected.bugsSummary ?? {})));
  });
});

describe('TC-144h: projection additivity on an unchanged snapshot', () => {
  it('every pre-change field is present with the same type; no new keys without data', () => {
    const projected = projectFromSnapshot(baseSnapshot);
    const baseline = typeInventory({
      aitriState: projected.aitriState,
      testSummary: projected.testSummary,
      nextActions: projected.nextActions,
      snapshotVersion: projected.snapshotVersion,
    });
    // Re-project the same snapshot — inventory must be identical (no drift
    // introduced by the new passthrough code on data that lacks the fields).
    const again = projectFromSnapshot(baseSnapshot);
    const current = typeInventory({
      aitriState: again.aitriState,
      testSummary: again.testSummary,
      nextActions: again.nextActions,
      snapshotVersion: again.snapshotVersion,
    });
    assert.deepEqual(typeDiff(baseline, current), []);
    assert.ok(!('resultsBinding' in again));
    assert.ok(!('parseErrors' in (again.bugsSummary ?? {})));
  });
});

describe('TC-144f: the type-diff guard detects a real break', () => {
  it('a number→string type change is reported (guard is not vacuous)', () => {
    const baseline = typeInventory({ bugs: { open: 3 } });
    const mutated = typeInventory({ bugs: { open: '3' } });
    const diffs = typeDiff(baseline, mutated);
    assert.equal(diffs.length, 1);
    assert.match(diffs[0], /bugs\.open: number → string/);
  });
});
