/**
 * Tests: alerts/engine — open-bugs alert rules
 *
 * @aitri-trace TC-ID: TC-018h, TC-018f, TC-018e
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAlerts } from '../../lib/alerts/engine.js';

/** Minimal project stub with only the fields alert rules need. */
function makeProject(bugsSummary) {
  return {
    aitriState: {
      currentPhase:    1,
      approvedPhases:  [],
      completedPhases: [],
      verifyPassed:    false,
      hasDrift:        false,
      driftPhases:     [],
      lastRejection:   null,
      aitriVersion:    null,
      updatedAt:       null,
      createdAt:       null,
      events:          [],
      features:        [],
      lastSession:     null,
    },
    gitMeta:            null,
    testSummary:        null,
    complianceSummary:  null,
    requirementsSummary:null,
    specQuality:        null,
    externalSignals:    null,
    specArtifacts:      null,
    cacheStale:         false,
    rateLimited:        false,
    bugsSummary,
  };
}

// TC-018h — blocking alert for open critical+high bugs
describe('TC-018h: evaluateAlerts — open-bugs blocking', () => {
  // @aitri-tc TC-018h
  it('TC-018h: generates one blocking alert when critical>0 || high>0', () => {
    // @aitri-tc TC-018h
    const data = makeProject({ open: 2, fixed: 0, verified: 0, closed: 0,
                               critical: 1, high: 1, medium: 0, low: 0, openIds: [] });
    const alerts = evaluateAlerts(data);
    const bugAlerts = alerts.filter(a => a.type === 'open-bugs');
    assert.equal(bugAlerts.length, 1);
    assert.equal(bugAlerts[0].severity, 'blocking');
    assert.ok(bugAlerts[0].message.includes('critical'));
    assert.ok(bugAlerts[0].message.includes('high'));
  });
});

// TC-018f — warning alert for medium/low-only bugs
describe('TC-018f: evaluateAlerts — open-bugs warning', () => {
  // @aitri-tc TC-018f
  it('TC-018f: generates one warning alert when only medium/low bugs open', () => {
    // @aitri-tc TC-018f
    const data = makeProject({ open: 2, fixed: 0, verified: 0, closed: 0,
                               critical: 0, high: 0, medium: 1, low: 1, openIds: [] });
    const alerts = evaluateAlerts(data);
    const bugAlerts = alerts.filter(a => a.type === 'open-bugs');
    assert.equal(bugAlerts.length, 1);
    assert.equal(bugAlerts[0].severity, 'warning');
  });
});

// TC-018e — no bug alert when bugsSummary is null
describe('TC-018e: evaluateAlerts — open-bugs null bugsSummary', () => {
  // @aitri-tc TC-018e
  it('TC-018e: generates zero bug-related alerts when bugsSummary is null', () => {
    // @aitri-tc TC-018e
    const data = makeProject(null);
    const alerts = evaluateAlerts(data);
    const bugAlerts = alerts.filter(a => a.type === 'open-bugs');
    assert.equal(bugAlerts.length, 0);
  });

  it('TC-018e: generates zero bug-related alerts when open===0', () => {
    // @aitri-tc TC-018e
    const data = makeProject({ open: 0, fixed: 2, verified: 0, closed: 0,
                               critical: 0, high: 0, medium: 0, low: 0, openIds: [] });
    const alerts = evaluateAlerts(data);
    const bugAlerts = alerts.filter(a => a.type === 'open-bugs');
    assert.equal(bugAlerts.length, 0);
  });
});
