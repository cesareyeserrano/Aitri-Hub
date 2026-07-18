/**
 * Epic 1 — Monitor redesign (bento). Unit TCs for web/src/lib/monitor.js.
 * Covers FR-010, FR-011, FR-024.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMonitorLayout,
  applyFilter,
  filterBarCount,
  buildCardModel,
  pickTopIssue,
  applyRefresh,
} from '../lib/monitor.js';

describe('FR-010 — Monitor bento layout, order, filter', () => {
  it('TC-010h: CRITICAL card spans 2 columns and sorts first', () => {
    const projects = [
      { id: 'd', health: 'healthy' },
      { id: 'b', health: 'at_risk' },
      { id: 'a', health: 'critical' },
      { id: 'c', health: 'at_risk' },
      { id: 'e', health: 'healthy' },
    ];
    const layout = buildMonitorLayout(projects);
    expect(layout[0].id).toBe('a');
    expect(layout[0].gridColumnSpan).toBe(2);
    // healthy cards are last
    expect(layout[layout.length - 1].urgency).toBe('healthy');
    expect(layout[layout.length - 2].urgency).toBe('healthy');
  });

  it('TC-010e: card shrinks to span 1 and moves to end when health drops CRITICAL→NOMINAL', () => {
    const next = [
      { id: 'a', health: 'healthy' },
      { id: 'b', health: 'critical' },
      { id: 'c', health: 'at_risk' },
    ];
    const layout = buildMonitorLayout(next);
    const a = layout.find((p) => p.id === 'a');
    expect(a.gridColumnSpan).toBe(1);
    expect(layout[layout.length - 1].id).toBe('a'); // healthy group is last
  });

  it('TC-010f: CRITICAL filter with zero critical projects yields empty result + count 0', () => {
    const projects = [
      { id: 'a', health: 'healthy' },
      { id: 'b', health: 'healthy' },
    ];
    expect(applyFilter(projects, 'CRITICAL')).toEqual([]);
    expect(filterBarCount(projects, 'CRITICAL')).toBe(0);
  });
});

describe('FR-011 — signal-first card model', () => {
  it('TC-011h: card renders 6 tiles and pipeline filled to approved count', () => {
    const project = { id: 'p', aitriState: { approvedPhases: [1, 2, 3] } };
    const model = buildCardModel(project);
    expect(model.tiles).toHaveLength(6);
    expect(model.tiles.map((t) => t.key)).toEqual([
      'Tests', 'Drift', 'Verify', 'Pending', 'Signals', 'Rejections',
    ]);
    expect(model.pipeline).toEqual({ filled: 3, total: 5 });
  });

  it('TC-011e: top-issue line shows highest-severity alert message', () => {
    const project = {
      id: 'p',
      aitriState: {},
      alerts: [
        { type: 'stale', severity: 'warning', message: 'drift' },
        { type: 'verify', severity: 'blocking', message: 'verify failed' },
      ],
    };
    expect(buildCardModel(project).topIssue).toBe('verify failed');
    // picker accepts both real {severity,message} and legacy {level,msg}
    expect(pickTopIssue([{ severity: 'warning', message: 'w' }, { severity: 'blocking', message: 'c' }])).toBe('c');
    expect(pickTopIssue([{ level: 'warn', msg: 'w' }, { level: 'critical', msg: 'c' }])).toBe('c');
  });

  it('TC-011f: tile shows N/A (not 0) when datum is absent', () => {
    const project = { id: 'p', aitriState: {}, testSummary: null };
    const tests = buildCardModel(project).tiles.find((t) => t.key === 'Tests');
    expect(tests.value).toBe('N/A');
    expect(tests.value).not.toBe('0');
  });
});

describe('FR-024 — refresh handling', () => {
  it('TC-024h: successful refresh adopts the new snapshot (not stale) and re-sorts', () => {
    const prev = { projects: [{ id: 'a', health: 'healthy' }, { id: 'b', health: 'critical' }] };
    const result = { ok: true, projects: [{ id: 'a', health: 'critical' }, { id: 'b', health: 'healthy' }] };
    const applied = applyRefresh(prev, result);
    expect(applied.stale).toBe(false);
    const layout = buildMonitorLayout(applied.projects);
    expect(layout[0].id).toBe('a'); // a is now critical → first
  });

  it('TC-024e: no manual refresh control — applyRefresh has no side effects, pure', () => {
    // Behavioral proxy for "refresh is timer-only": applyRefresh is a pure reducer, no fetch/DOM.
    const prev = { projects: [{ id: 'a' }] };
    const out = applyRefresh(prev, { ok: true, projects: [{ id: 'a' }] });
    expect(out).toEqual({ projects: [{ id: 'a' }], stale: false });
    // calling twice yields the same result (no hidden state)
    expect(applyRefresh(prev, { ok: true, projects: [{ id: 'a' }] })).toEqual(out);
  });

  it('TC-024f: failed/stale read keeps last data and flags stale (grid not blanked)', () => {
    const prev = { projects: [{ id: 'a', health: 'healthy' }, { id: 'b', health: 'critical' }] };
    const applied = applyRefresh(prev, { ok: false, error: 'network' });
    expect(applied.projects).toEqual(prev.projects); // last data retained
    expect(applied.stale).toBe(true);
    expect(applied.projects.length).toBeGreaterThan(0); // not blank
  });
});
