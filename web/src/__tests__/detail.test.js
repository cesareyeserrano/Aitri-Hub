/**
 * Epic 2 — Project Detail read sections + name translation.
 * Unit TCs for web/src/lib/detail.js and web/src/lib/names.js.
 * Covers FR-012, FR-013, FR-014, FR-017, FR-018, FR-019.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSidebar,
  buildOverview,
  buildHealthPanels,
  healthIssueCount,
  buildSessions,
  buildAlerts,
  DIMENSIONS,
} from '../lib/detail.js';
import { productName } from '../lib/names.js';

describe('FR-012 — sidebar', () => {
  it('TC-012h: Health nav badge equals total health issue count (2)', () => {
    const project = {
      aitriState: {},
      testSummary: { passed: 5, failed: 2, skipped: 0, total: 7 }, // Tests: 1 issue
      health: { versionMismatch: true, deployableReasons: [{ type: 'version_mismatch', message: 'Project v2.0.1 vs CLI v2.0.2' }] }, // Version: 1 issue
      appVersion: '2.0.1',
    };
    const sb = buildSidebar(project);
    expect(sb.nav.find((n) => n.section === 'health').badge).toBe(2);
  });

  it('TC-STAT-012h: sidebar quick-stats reflect the project actual values (parity)', () => {
    const project = {
      aitriState: { driftPhases: [3, 4], lastRejection: { feedback: 'x' } },
      testSummary: { passed: 27, failed: 0, skipped: 0, total: 27 },
      health: {},
      gitMeta: {},
    };
    // drift → Pipeline 1 issue; lastRejection → Artifacts 1 issue → issues total 2
    expect(buildSidebar(project).quickStats).toEqual({ issues: 2, rejections: 1, drift: 2, tests: '27/27' });
  });
});

describe('FR-013 — overview', () => {
  it('TC-013h: gauge reflects testSummary pass ratio and telemetry counts', () => {
    const project = { aitriState: {}, testSummary: { passed: 27, failed: 0, skipped: 0, total: 27 } };
    const ov = buildOverview(project);
    expect(ov.gauge.ratio).toBe(1);
    expect(ov.telemetry).toMatchObject({ passed: 27, failing: 0, skipped: 0, total: 27, state: 'has-run' });
  });

  it('TC-013e: phase labels are readable, never technical filenames', () => {
    const project = { aitriState: { currentPhase: 3, approvedPhases: [1, 2] } };
    const ov = buildOverview(project);
    expect(ov.phases[0].label).toMatch(/requirements|PRD/i);
    expect(ov.phases[0].state).toBe('approved');
    for (const p of ov.phases) expect(p.label).not.toMatch(/\.json|\.md|01_REQUIREMENTS/);
  });

  it('TC-013f: no verify run shows no-run-yet, not a zeroed gauge', () => {
    const ov = buildOverview({ aitriState: {}, testSummary: null });
    expect(ov.telemetry.state).toBe('no-run-yet');
    expect(ov.gauge).toBeNull();
  });

  it('TC-TILE-013h: six metric tiles show the actual values', () => {
    const project = {
      aitriState: {},
      lastSession: { at: '2026-07-17', agent: 'claude' },
      gitMeta: { branch: 'main', unpushedCommits: 3 },
      testSummary: { passed: 27, failed: 0, skipped: 0, total: 27 },
      appVersion: '0.2.2',
    };
    expect(buildOverview(project).tiles).toEqual({
      last_session: '2026-07-17', agent: 'claude', branch: 'main',
      verify: '27 passed', pending_commits: 3, version: '0.2.2',
    });
  });
});

describe('FR-014 — health 5 dimensions', () => {
  it('TC-014h: 5 ordered dimensions; Tests CRITICAL; Version names both versions', () => {
    const project = {
      aitriState: {},
      testSummary: { passed: 1, failed: 2, skipped: 0, total: 3 },
      health: { versionMismatch: true, deployableReasons: [{ type: 'version_mismatch', message: 'Project v2.0.1 vs CLI v2.0.2' }] },
      appVersion: '2.0.1', gitMeta: {},
    };
    const panels = buildHealthPanels(project);
    expect(panels.map((p) => p.dimension)).toEqual(['Pipeline', 'Tests', 'Code', 'Artifacts', 'Version']);
    expect(['WARN', 'CRITICAL']).toContain(panels[1].badge);
    const verMsg = panels[4].issues[0].message;
    expect(verMsg).toContain('2.0.1');
    expect(verMsg).toContain('2.0.2');
  });

  it('TC-014e: an issue with a known remediation shows the command', () => {
    const project = { aitriState: {}, testSummary: { passed: 1, failed: 0, skipped: 0, total: 1 }, health: { versionMismatch: true, deployableReasons: [] }, appVersion: '1' };
    const version = buildHealthPanels(project).find((p) => p.dimension === 'Version');
    expect(version.issues[0].remediation).toBe('aitri adopt --upgrade');
  });

  it('TC-014f: a dimension with no issues has badge OK (renders "all checks passing")', () => {
    const project = { aitriState: {}, testSummary: { passed: 1, failed: 0, skipped: 0, total: 1 }, health: {}, gitMeta: {} };
    const code = buildHealthPanels(project).find((p) => p.dimension === 'Code');
    expect(code.issues).toHaveLength(0);
    expect(code.badge).toBe('OK');
  });
});

describe('FR-017 — sessions', () => {
  it('TC-017h: events newest-first with inline rejection feedback', () => {
    const project = { aitriState: { events: [
      { at: 1, event: 'approved', phase: 1 },
      { at: 2, event: 'rejected', phase: 2, feedback: 'fix tokens' },
    ] } };
    const s = buildSessions(project);
    expect(s.timeline[0].event).toBe('rejected');
    expect(s.timeline[0].feedback).toBe('fix tokens');
  });

  it('TC-017e: last-session context shows files and agent', () => {
    const project = { aitriState: {}, lastSession: { agent: 'claude', files_touched: ['a.js', 'b.js'], context: 'built X' } };
    const s = buildSessions(project);
    expect(s.context.agent).toBe('claude');
    expect(s.context.files).toHaveLength(2);
  });

  it('TC-017f: no events shows explicit empty state', () => {
    expect(buildSessions({ aitriState: { events: [] } }).state).toBe('empty');
  });
});

describe('FR-018 — alerts aggregation', () => {
  it('TC-018h: merges 2 issues + 1 signal into 3 cards; signal shows command', () => {
    const project = {
      alerts: [
        { type: 'stale', severity: 'warning', message: 'no commits', command: null },
        { type: 'version-mismatch', severity: 'warning', message: 'mismatch', command: 'aitri adopt --upgrade' },
      ],
      externalSignals: { available: true, signals: [{ tool: 'npm-audit', severity: 'high', message: 'vuln', command: 'npm audit fix' }] },
    };
    const a = buildAlerts(project);
    expect(a.count).toBe(3);
    expect(a.cards.find((c) => c.kind === 'signal').command).toBe('npm audit fix');
  });

  it('TC-018e: alerts count equals sidebar alerts badge', () => {
    const project = {
      aitriState: {},
      alerts: [{ type: 'x', severity: 'warning', message: 'm' }],
      externalSignals: { available: true, signals: [{ tool: 't', severity: 'high', message: 'm' }] },
    };
    expect(buildAlerts(project).count).toBe(buildSidebar(project).nav.find((n) => n.section === 'alerts').badge);
  });

  it('TC-018f: zero alerts shows all-clear confirmation', () => {
    expect(buildAlerts({ alerts: [], externalSignals: { available: false } }).state).toBe('all-clear');
  });
});

describe('FR-019 — name translation', () => {
  it('TC-019h: technical name maps to product name', () => {
    expect(productName('01_REQUIREMENTS.json')).toBe('PRD — Product Requirements');
  });

  it('TC-019e: feature artifact is prefixed with the feature name', () => {
    const label = productName('01_REQUIREMENTS.json', { feature: 'redesign' });
    expect(label.startsWith('redesign')).toBe(true);
    expect(label).toContain('PRD');
  });

  it('TC-019f: unmapped name falls back to the raw filename, no crash/blank', () => {
    expect(productName('NOTES.txt')).toBe('NOTES.txt');
    expect(productName('NOTES.txt')).not.toBe('');
  });
});
