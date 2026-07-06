/**
 * Tests for the QA Workspace tab components + markdown renderer.
 * @aitri-trace FR-ID: FR-054, FR-055, FR-056, FR-057, FR-058, FR-059
 *   TC: TC-055h, TC-055f, TC-056h, TC-057h, TC-057e, TC-057f, TC-058h, TC-058f, TC-059h
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { renderMarkdown } from '../lib/markdown.jsx';
import TestCasesTab from '../views/tabs/TestCasesTab.jsx';
import TraceabilityTab from '../views/tabs/TraceabilityTab.jsx';
import BugsTab from '../views/tabs/BugsTab.jsx';
import ArtifactsTab from '../views/tabs/ArtifactsTab.jsx';

// ── Markdown renderer (FR-058 AC-4 / TC-058f: inert by construction) ─────────

describe('renderMarkdown', () => {
  it('TC-058f: script/html content renders inert (no injection)', () => {
    window.__pwned = undefined;
    render(<div>{renderMarkdown('# Title\n\n<script>window.__pwned=1</script>\n\ntext')}</div>);
    expect(window.__pwned).toBeUndefined();
    // The literal tag text is present as escaped content, not an executed node.
    expect(screen.getByText(/window\.__pwned=1/)).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });
  it('TC-058h: headings, lists and fenced code format', () => {
    const { container } = render(<div>{renderMarkdown('## Heading\n\n- a\n- b\n\n```\ncode\n```')}</div>);
    expect(container.querySelector('h3')).toHaveTextContent('Heading');
    expect(container.querySelectorAll('.md-ul li')).toHaveLength(2);
    expect(container.querySelector('.md-pre')).toHaveTextContent('code');
  });
  it('rejects non-http link protocols (renders as text)', () => {
    render(<div>{renderMarkdown('[x](javascript:alert(1))')}</div>);
    expect(document.querySelector('a')).toBeNull();
  });
});

// ── Test Cases tab (FR-055) ──────────────────────────────────────────────────

const tcFixture = {
  available: true,
  resultsPresent: true,
  summary: { passed: 3, failed: 1, pending: 1, skipped: 0, manual: 1 },
  cases: [
    { id: 'TC-1h', title: 'a', automation: 'auto', scenario: 'happy_path', status: 'passed', requirement_id: 'FR-1' },
    { id: 'TC-2f', title: 'b', automation: 'auto', scenario: 'negative', status: 'failed', requirement_id: 'FR-1' },
    { id: 'TC-3e', title: 'c', automation: 'manual', manual_reason: 'device', scenario: 'edge_case', status: 'pending', requirement_id: 'FR-2' },
  ],
};

describe('TestCasesTab', () => {
  it('TC-055h: counts strip + manual-pending banner', () => {
    render(<TestCasesTab testCases={tcFixture} />);
    expect(screen.getByTestId('tc-counts')).toHaveTextContent('3 passed');
    expect(screen.getByTestId('manual-pending-banner')).toHaveTextContent('TC-3e');
    expect(screen.getAllByTestId('tc-row')).toHaveLength(3);
  });
  it('TC-055e: status filter narrows the set', () => {
    render(<TestCasesTab testCases={tcFixture} />);
    fireEvent.change(screen.getByTestId('filter-status'), { target: { value: 'failed' } });
    const rows = screen.getAllByTestId('tc-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('TC-2f');
  });
  it('TC-055f: unavailable → empty state names the command', () => {
    render(<TestCasesTab testCases={{ available: false, reason: '03_TEST_CASES.json' }} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('aitri run-phase 3');
  });
});

// ── Traceability tab (FR-056) ────────────────────────────────────────────────

describe('TraceabilityTab', () => {
  it('TC-056h: uncovered MUST pinned first with red marker; derived-by-hub note', () => {
    render(<TraceabilityTab traceability={{
      available: true, derivedByHub: true, auditFreshness: 'stale',
      coverageMap: [{ need: 'x', disposition: 'FR-1' }],
      frs: [
        { id: 'FR-1', title: 'covered', priority: 'MUST', covered: true, tcs: [{ id: 'TC-1h', status: 'passed' }] },
        { id: 'FR-2', title: 'uncovered', priority: 'MUST', covered: false, tcs: [] },
      ],
    }} />);
    const rows = screen.getAllByTestId('trace-row');
    expect(rows[0]).toHaveAttribute('data-uncovered', 'true');
    expect(rows[0]).toHaveTextContent('FR-2');
    expect(screen.getByTestId('derived-by-hub')).toBeInTheDocument();
    expect(screen.getByTestId('audit-freshness')).toHaveTextContent('stale');
    expect(screen.getByTestId('coverage-map')).toBeInTheDocument();
  });
  it('TC-056f: absent → empty state', () => {
    render(<TraceabilityTab traceability={{ available: false }} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('05_TRACEABILITY.json');
  });
});

// ── Bugs tab (FR-057 trichotomy) ─────────────────────────────────────────────

describe('BugsTab', () => {
  it('TC-057h: blocking bug pinned with red band + resolution', () => {
    render(<BugsTab bugs={{ available: true, parseError: false, bugs: [
      { id: 'B2', title: 'crit', severity: 'critical', status: 'open', blocking: true, resolution: 'fixed', tc_id: 'TC-9' },
    ] }} />);
    const row = screen.getByTestId('bug-row');
    expect(row).toHaveAttribute('data-blocking', 'true');
    expect(row).toHaveTextContent('fixed');
  });
  it('TC-057e: absent vs empty are distinct', () => {
    const { rerender } = render(<BugsTab bugs={{ available: false, parseError: false }} />);
    expect(screen.getByTestId('empty-state')).toHaveTextContent('aitri bug add');
    rerender(<BugsTab bugs={{ available: true, parseError: false, bugs: [] }} />);
    expect(screen.getByTestId('bugs-empty')).toBeInTheDocument();
  });
  it('TC-057f: corrupt → parse-error state, never zero bugs', () => {
    render(<BugsTab bugs={{ available: false, parseError: true }} />);
    expect(screen.getByTestId('bugs-parse-error')).toHaveTextContent('NOT counted');
  });
});

// ── Artifacts tab (FR-058) ───────────────────────────────────────────────────

describe('ArtifactsTab', () => {
  const artifacts = {
    chain: [
      { name: '00_DISCOVERY.md', present: false, kind: 'md' },
      { name: '02_SYSTEM_DESIGN.md', present: true, kind: 'md' },
      { name: '01_REQUIREMENTS.json', present: true, kind: 'json' },
    ],
    contents: {
      '02_SYSTEM_DESIGN.md': { kind: 'md', raw: '## Design\n\n- one\n- two' },
      '01_REQUIREMENTS.json': { kind: 'json', parsed: {
        functional_requirements: [{ id: 'FR-1', title: 'do', priority: 'MUST', acceptance_criteria: ['x'] }],
        user_personas: [{ role: 'QA', goal: 'audit' }], no_go_zone: ['no writes'],
      } },
    },
  };
  it('TC-058h: markdown formatted; PRD table; absence marked', () => {
    const { container } = render(<ArtifactsTab artifacts={artifacts} />);
    // default active = first present = 02_SYSTEM_DESIGN.md → formatted
    expect(container.querySelector('.md h3')).toHaveTextContent('Design');
    // absence marked in the chain list
    const discovery = screen.getAllByTestId('chain-item').find(b => b.textContent.includes('00_DISCOVERY.md'));
    expect(discovery).toHaveAttribute('data-present', 'false');
    // switch to the PRD and see a table + collapsed raw
    fireEvent.click(screen.getAllByTestId('chain-item').find(b => b.textContent.includes('01_REQUIREMENTS.json')));
    expect(screen.getByTestId('prd-view')).toHaveTextContent('FR-1');
    expect(screen.queryByTestId('raw-json')).toBeNull(); // collapsed by default
  });
});
