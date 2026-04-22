/**
 * Tests: hub_integration_update frontend components and aitri-reader lastSession
 * File-based static analysis (no browser automation).
 *
 * @aitri-trace TC-ID: TC-019h, TC-019f, TC-019e, TC-020h, TC-020f, TC-020e, TC-021h, TC-021f, TC-021e
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAitriState } from '../../lib/collector/aitri-reader.js';

const ROOT = new URL('../..', import.meta.url).pathname;

// ── TC-019h: readAitriState returns lastSession fields ──────────────────────
describe('TC-019h: readAitriState — lastSession happy path', () => {
  // @aitri-tc TC-019h
  let dir;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-ls-'));
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      currentPhase: 1,
      approvedPhases: [],
      lastSession: {
        at:            '2026-03-31T00:00:00Z',
        agent:         'claude',
        event:         'complete requirements',
        files_touched: ['src/auth.js'],
      },
    }));
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('TC-019h: lastSession fields are preserved exactly', () => {
    // @aitri-tc TC-019h
    const state = readAitriState(dir);
    assert.ok(state !== null);
    assert.ok(state.lastSession !== null);
    assert.equal(state.lastSession.at,    '2026-03-31T00:00:00Z');
    assert.equal(state.lastSession.agent, 'claude');
    assert.equal(state.lastSession.event, 'complete requirements');
    assert.deepEqual(state.lastSession.files_touched, ['src/auth.js']);
  });
});

// ── TC-019f: lastSession: null when field absent ────────────────────────────
describe('TC-019f: readAitriState — lastSession absent', () => {
  // @aitri-tc TC-019f
  let dir;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-ls-'));
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      currentPhase: 1,
      approvedPhases: [],
    }));
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('TC-019f: lastSession is null and no exception is thrown', () => {
    // @aitri-tc TC-019f
    const state = readAitriState(dir);
    assert.ok(state !== null);
    assert.equal(state.lastSession, null);
  });
});

// ── TC-019e: files_touched absent → null ────────────────────────────────────
describe('TC-019e: readAitriState — lastSession.files_touched absent', () => {
  // @aitri-tc TC-019e
  let dir;
  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-ls-'));
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify({
      currentPhase: 1,
      approvedPhases: [],
      lastSession: { at: '2026-03-31T00:00:00Z', agent: 'claude', event: 'checkpoint' },
    }));
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('TC-019e: files_touched is null (not undefined)', () => {
    // @aitri-tc TC-019e
    const state = readAitriState(dir);
    assert.ok(state !== null);
    assert.ok(state.lastSession !== null);
    assert.equal(state.lastSession.files_touched, null);
  });
});

// TC-020h/f/e: ActivityTab and LastSessionRow removed in hub-mvp-web redesign.
// Components deleted as dead code per 02_SYSTEM_DESIGN.md component map.

// ── TC-021h: BugBadge renders blocking variant ──────────────────────────────
describe('TC-021h: BugBadge — blocking variant', () => {
  // @aitri-tc TC-021h
  it('TC-021h: BugBadge.jsx uses syn-red for blocking state', () => {
    // @aitri-tc TC-021h
    const src = fs.readFileSync(path.join(ROOT, 'web/src/components/BugBadge.jsx'), 'utf8');
    assert.ok(src.includes('--syn-red'), 'blocking badge must use --syn-red');
  });

  it('TC-021h: ProjectCard.jsx renders 5 named card sections', () => {
    // @aitri-tc TC-021h
    // hub-mvp-web redesign: BugBadge removed; card now uses 5 named sections.
    const src = fs.readFileSync(path.join(ROOT, 'web/src/components/ProjectCard.jsx'), 'utf8');
    assert.ok(src.includes('PIPELINE'), 'ProjectCard must include PIPELINE section');
    assert.ok(src.includes('QUALITY'), 'ProjectCard must include QUALITY section');
    assert.ok(src.includes('GIT'), 'ProjectCard must include GIT section');
  });

  it('BG-006: last-event line guards against events with no phase (e.g. normalize-resolved)', () => {
    // normalize-resolved events have no `phase` field. The last-event row must not
    // render the literal string "phase undefined" when phase is null/undefined.
    const src = fs.readFileSync(path.join(ROOT, 'web/src/components/ProjectCard.jsx'), 'utf8');
    assert.ok(
      src.includes('lastEvent.phase != null &&'),
      'ProjectCard must guard the phase segment with `lastEvent.phase != null &&`'
    );
  });
});

// ── TC-021f: BugBadge returns null when bugsSummary is null ─────────────────
describe('TC-021f: BugBadge — null guard', () => {
  // @aitri-tc TC-021f
  it('TC-021f: BugBadge.jsx returns null when bugsSummary is null or open===0', () => {
    // @aitri-tc TC-021f
    const src = fs.readFileSync(path.join(ROOT, 'web/src/components/BugBadge.jsx'), 'utf8');
    assert.ok(
      src.includes('if (!bugsSummary || bugsSummary.open === 0) return null'),
      'BugBadge must have null guard for bugsSummary'
    );
  });
});

// ── TC-021e: BugBadge warning variant uses yellow ───────────────────────────
describe('TC-021e: BugBadge — warning variant', () => {
  // @aitri-tc TC-021e
  it('TC-021e: BugBadge.jsx uses syn-yellow for warning state', () => {
    // @aitri-tc TC-021e
    const src = fs.readFileSync(path.join(ROOT, 'web/src/components/BugBadge.jsx'), 'utf8');
    assert.ok(src.includes('--syn-yellow'), 'warning badge must use --syn-yellow');
  });
});
