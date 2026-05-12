import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { evaluateAlerts } from '../../../lib/alerts/engine.js';
import { readBugsSummary } from '../../../lib/collector/bugs-reader.js';
import { projectFromSnapshot } from '../../../lib/collector/snapshot-reader.js';

const OPEN_BUGS = 'open-bugs';

function snapshotWithBugs(bugs) {
  return {
    snapshotVersion: 1,
    project: 'AITRI-HUB',
    phases: [],
    bugs,
  };
}

function projectForAlerts(bugsSummary) {
  return {
    aitriState: {
      currentPhase: null,
      approvedPhases: [],
      completedPhases: [],
      verifyPassed: true,
      hasDrift: false,
      driftPhases: [],
      lastRejection: null,
      aitriVersion: null,
      updatedAt: null,
      createdAt: null,
      events: [],
      features: [],
      lastSession: null,
    },
    gitMeta: null,
    testSummary: null,
    complianceSummary: null,
    specQuality: null,
    externalSignals: null,
    bugsSummary,
  };
}

function withTempProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bug-summary-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('TC-001h Snapshot bugs preserves 12 total and zero active bugs', () => {
  // @aitri-tc TC-001h
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 12,
      open: 0,
      blocking: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      openIds: [],
    })
  );

  assert.deepEqual(project.bugsSummary, {
    total: 12,
    open: 0,
    resolved: 12,
    blocking: 0,
    bySeverityActive: { critical: 0, high: 0, medium: 0, low: 0 },
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    openIds: [],
  });
});

test('TC-001e Snapshot bugs preserves active severity buckets and IDs', () => {
  // @aitri-tc TC-001e
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 5,
      open: 2,
      blocking: 1,
      bySeverity: { critical: 0, high: 1, medium: 1, low: 0 },
      openIds: ['BG-1', 'BG-2'],
    })
  );

  assert.equal(project.bugsSummary.total, 5);
  assert.equal(project.bugsSummary.open, 2);
  assert.equal(project.bugsSummary.blocking, 1);
  assert.equal(project.bugsSummary.bySeverityActive.high, 1);
  assert.equal(project.bugsSummary.bySeverityActive.medium, 1);
  assert.deepEqual(project.bugsSummary.openIds, ['BG-1', 'BG-2']);
});

test('TC-001f Snapshot bugs missing bugs object returns null summary', () => {
  // @aitri-tc TC-001f
  const project = projectFromSnapshot({ snapshotVersion: 1, project: 'NO-BUGS', phases: [] });

  assert.equal(project.bugsSummary, null);
});

test('TC-002h Resolved bugs total 5 minus open 2 equals 3', () => {
  // @aitri-tc TC-002h
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 5,
      open: 2,
      blocking: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      openIds: ['BG-1', 'BG-2'],
    })
  );

  assert.equal(project.bugsSummary.resolved, 3);
});

test('TC-002e Resolved bugs total 12 minus open 0 equals 12', () => {
  // @aitri-tc TC-002e
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 12,
      open: 0,
      blocking: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      openIds: [],
    })
  );

  assert.equal(project.bugsSummary.resolved, 12);
});

test('TC-002f Resolved bugs open greater than total clamps to zero', () => {
  // @aitri-tc TC-002f
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 1,
      open: 3,
      blocking: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      openIds: ['BG-1', 'BG-2', 'BG-3'],
    })
  );

  assert.equal(project.bugsSummary.resolved, 0);
});

test('TC-003h Active high bug compatibility alias triggers blocking alert', () => {
  // @aitri-tc TC-003h
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 1,
      open: 1,
      blocking: 1,
      bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
      openIds: ['BG-9'],
    })
  );

  const alert = evaluateAlerts(projectForAlerts(project.bugsSummary)).find(a => a.type === OPEN_BUGS);
  assert.equal(alert?.severity, 'blocking');
});

test('TC-003e Active medium bug compatibility alias triggers warning alert', () => {
  // @aitri-tc TC-003e
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 1,
      open: 1,
      blocking: 0,
      bySeverity: { critical: 0, high: 0, medium: 1, low: 0 },
      openIds: ['BG-10'],
    })
  );

  const alert = evaluateAlerts(projectForAlerts(project.bugsSummary)).find(a => a.type === OPEN_BUGS);
  assert.equal(alert?.severity, 'warning');
});

test('TC-003f No active bugs aliases remain zero and no bug alert appears', () => {
  // @aitri-tc TC-003f
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 12,
      open: 0,
      blocking: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      openIds: [],
    })
  );

  assert.equal(project.bugsSummary.high, 0);
  assert.equal(project.bugsSummary.critical, 0);
  assert.equal(
    evaluateAlerts(projectForAlerts(project.bugsSummary)).some(a => a.type === OPEN_BUGS),
    false
  );
});

test('TC-004h Snapshot history exposes resolved without requiring verified', () => {
  // @aitri-tc TC-004h
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 12,
      open: 0,
      blocking: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      openIds: [],
    })
  );

  assert.equal(project.bugsSummary.resolved, 12);
  assert.equal(Object.hasOwn(project.bugsSummary, 'verified'), false);
});

test('TC-004e Snapshot history fixed and closed are not fabricated', () => {
  // @aitri-tc TC-004e
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 7,
      open: 2,
      blocking: 0,
      bySeverity: { critical: 0, high: 0, medium: 2, low: 0 },
      openIds: ['BG-2', 'BG-3'],
    })
  );

  assert.equal(project.bugsSummary.resolved, 5);
  assert.equal(Object.hasOwn(project.bugsSummary, 'fixed'), false);
  assert.equal(Object.hasOwn(project.bugsSummary, 'closed'), false);
});

test('TC-004f Snapshot history invalid historical fields are ignored', () => {
  // @aitri-tc TC-004f
  const project = projectFromSnapshot(
    snapshotWithBugs({
      total: 4,
      open: 1,
      verified: 99,
      fixed: 88,
      closed: 77,
      blocking: 0,
      bySeverity: { critical: 0, high: 0, medium: 1, low: 0 },
      openIds: ['BG-4'],
    })
  );

  assert.equal(project.bugsSummary.resolved, 3);
  assert.equal(Object.hasOwn(project.bugsSummary, 'verified'), false);
  assert.equal(Object.hasOwn(project.bugsSummary, 'fixed'), false);
  assert.equal(Object.hasOwn(project.bugsSummary, 'closed'), false);
});

test('TC-005h Legacy BUGS json existing status breakdown remains intact', () => {
  // @aitri-tc TC-005h
  withTempProject(dir => {
    fs.writeFileSync(
      path.join(dir, 'BUGS.json'),
      JSON.stringify({
        bugs: [
          { id: 'BG-1', status: 'open', severity: 'critical' },
          { id: 'BG-2', status: 'verified', severity: 'medium' },
        ],
      })
    );

    const summary = readBugsSummary(dir, '');
    assert.equal(summary.open, 1);
    assert.equal(summary.critical, 1);
    assert.equal(summary.verified, 1);
    assert.deepEqual(summary.openIds, ['BG-1']);
  });
});

test('TC-005e Legacy BUGS json artifactsDir spec still works', () => {
  // @aitri-tc TC-005e
  withTempProject(dir => {
    fs.mkdirSync(path.join(dir, 'spec'));
    fs.writeFileSync(
      path.join(dir, 'spec', 'BUGS.json'),
      JSON.stringify({ bugs: [{ id: 'BG-3', status: 'open', severity: 'low' }] })
    );

    const summary = readBugsSummary(dir, 'spec');
    assert.equal(summary.open, 1);
    assert.equal(summary.low, 1);
    assert.deepEqual(summary.openIds, ['BG-3']);
  });
});

test('TC-005f Legacy BUGS json absent file returns null', () => {
  // @aitri-tc TC-005f
  withTempProject(dir => {
    assert.equal(readBugsSummary(dir, ''), null);
  });
});
