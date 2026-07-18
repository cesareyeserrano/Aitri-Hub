/**
 * Epic 4 — QA Workspace frontend.
 * TC-020h: test cases group + the manual type filter narrows the set (count reflects).
 * TC-022e: a bug detail shows description, reproduction steps and status history.
 * TC-023e: the report renders a print-optimized container with a Print control.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import QaTestCases from '../components/QaTestCases.jsx';
import QaBugs from '../components/QaBugs.jsx';
import QaReports from '../components/QaReports.jsx';
import { applyCaseFilters } from '../lib/qa.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const CASES = {
  available: true,
  cases: [
    { id: 'TC-M1', title: 'manual one', automation: 'manual', status: 'pending', requirement_id: 'FR-1' },
    { id: 'TC-M2', title: 'manual two', automation: 'manual', status: 'passed', requirement_id: 'FR-1' },
    { id: 'TC-A1', title: 'auto one', automation: 'auto', status: 'passed', requirement_id: 'FR-2' },
  ],
};

describe('FR-020 — test cases grouping + filter', () => {
  it('TC-020h: the manual type filter narrows the set with the correct count', () => {
    // @aitri-tc TC-020h
    // pure filter
    expect(applyCaseFilters(CASES.cases, { type: 'manual' })).toHaveLength(2);
    expect(applyCaseFilters(CASES.cases, { type: 'auto' })).toHaveLength(1);

    render(<QaTestCases id="p1" testCases={CASES} />);
    expect(screen.getAllByTestId('tc-row')).toHaveLength(3);
    // grouped by requirement id
    expect(screen.getAllByTestId('qa-group').length).toBeGreaterThanOrEqual(2);

    fireEvent.change(screen.getByTestId('filter-type'), { target: { value: 'manual' } });
    const rows = screen.getAllByTestId('tc-row');
    expect(rows).toHaveLength(2);
    rows.forEach((r) => expect(r.getAttribute('data-type')).toBe('manual'));
  });
});

describe('FR-022 — bug detail', () => {
  it('TC-022e: opening a bug shows description, reproduction steps and status history', () => {
    // @aitri-tc TC-022e
    const bugs = {
      available: true,
      bugs: [{
        id: 'BUG-1', description: 'crash on save', severity: 'high', phase: 4, status: 'open',
        reproduction_steps: ['open editor', 'click save'],
        history: [{ at: '2026-07-01', status: 'open' }],
      }],
    };
    render(<QaBugs bugs={bugs} />);
    fireEvent.click(screen.getByTestId('bug-select'));
    const detail = screen.getByTestId('bug-detail');
    expect(within(detail).getByText(/crash on save/)).toBeInTheDocument();
    expect(within(detail).getByText(/reproduction/i)).toBeInTheDocument();
    expect(within(detail).getByText(/click save/)).toBeInTheDocument();
    expect(within(detail).getByText(/status history/i)).toBeInTheDocument();
  });
});

describe('FR-023 — report print view', () => {
  it('TC-023e: the report renders a print-optimized container with a Print control', async () => {
    // @aitri-tc TC-023e
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ report: {
        scope: 'project', empty: false, project: { name: 'demo' },
        coverage: { passed: 5, failed: 1, pending: 2, skipped: 0, total: 8, coveragePct: 63 },
        bugsBySeverity: { critical: 0, high: 1, medium: 0, low: 2 }, bugsTotal: 3, executionsCount: 4,
      } }),
    }));
    render(<QaReports id="p1" scopes={['product']} />);
    await waitFor(() => expect(screen.getByTestId('report-print')).toBeInTheDocument());
    // Print control present; nav chrome (header/sidebar) is hidden by @media print, not rendered here.
    expect(screen.getByTestId('report-print-btn')).toBeInTheDocument();
    expect(within(screen.getByTestId('report-print')).getByTestId('report-coverage')).toBeInTheDocument();
    expect(screen.getByTestId('report-print').querySelector('.d-sidebar')).toBeNull();
  });
});
