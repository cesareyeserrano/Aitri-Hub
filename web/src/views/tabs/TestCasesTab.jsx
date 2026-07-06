/**
 * Module: web/src/views/tabs/TestCasesTab
 * Purpose: Per-scope test-case table (03 × 04 join) with filters, counts strip
 *          and the pending-manual callout (FR-055).
 *
 * @aitri-trace FR-ID: FR-055, US-ID: US-055, AC-ID: AC-0551, AC-0552, TC-ID: TC-055h, TC-055e, TC-055f
 */

import React, { useState, useMemo } from 'react';
import EmptyState from '../../components/EmptyState.jsx';

const STATUS_COLOR = {
  passed: 'var(--syn-green)',
  failed: 'var(--syn-red)',
  pending: 'var(--syn-yellow)',
  skipped: 'var(--text-dim)',
};

export default function TestCasesTab({ testCases }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [autoFilter, setAutoFilter] = useState('all');
  const [frFilter, setFrFilter] = useState('all');

  const cases = testCases?.cases ?? [];
  const frIds = useMemo(
    () => [...new Set(cases.flatMap(c => (c.requirement_id ? c.requirement_id.split(',') : [])))].sort(),
    [cases],
  );

  if (!testCases?.available) {
    return (
      <EmptyState
        artifact={testCases?.error ?? testCases?.reason ?? '03_TEST_CASES.json'}
        command="aitri run-phase 3"
        malformed={Boolean(testCases?.error)}
        note="Test cases are defined in Phase 3."
      />
    );
  }

  const pendingManual = cases.filter(c => c.automation === 'manual' && c.status === 'pending');

  const filtered = cases.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (autoFilter !== 'all' && c.automation !== autoFilter) return false;
    if (frFilter !== 'all' && !(c.requirement_id ?? '').split(',').includes(frFilter)) return false;
    return true;
  });

  const s = testCases.summary;
  return (
    <div className="tab-testcases" data-testid="tab-testcases">
      <div className="counts-strip" data-testid="tc-counts">
        <span style={{ color: STATUS_COLOR.passed }}>{s.passed} passed</span>
        <span style={{ color: STATUS_COLOR.failed }}>{s.failed} failed</span>
        <span style={{ color: STATUS_COLOR.pending }}>{s.pending} pending</span>
        <span style={{ color: STATUS_COLOR.skipped }}>{s.skipped} skipped</span>
        <span>{s.manual} manual</span>
        {!testCases.resultsPresent && (
          <span className="hint" title="04_TEST_RESULTS.json absent — statuses are pending">
            (no verify run yet)
          </span>
        )}
      </div>

      {pendingManual.length > 0 && (
        <div className="manual-banner" data-testid="manual-pending-banner" role="alert">
          ⚠ {pendingManual.length} pending manual TC(s) block coverage:{' '}
          {pendingManual.map(c => c.id).join(', ')}
        </div>
      )}

      <div className="filters">
        <label>
          status
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="filter-status">
            <option value="all">all</option>
            <option value="passed">passed</option>
            <option value="failed">failed</option>
            <option value="pending">pending</option>
            <option value="skipped">skipped</option>
          </select>
        </label>
        <label>
          automation
          <select value={autoFilter} onChange={e => setAutoFilter(e.target.value)} data-testid="filter-auto">
            <option value="all">all</option>
            <option value="auto">auto</option>
            <option value="manual">manual</option>
          </select>
        </label>
        <label>
          FR
          <select value={frFilter} onChange={e => setFrFilter(e.target.value)} data-testid="filter-fr">
            <option value="all">all</option>
            {frIds.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </label>
      </div>

      <table className="data-table" data-testid="tc-table">
        <thead>
          <tr>
            <th>TC</th><th>title</th><th>auto</th><th>scenario</th><th>status</th><th>FR</th><th>evidence</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(c => (
            <tr key={c.id} data-testid="tc-row" data-status={c.status}>
              <td className="mono">{c.id}</td>
              <td>{c.title}</td>
              <td title={c.manual_reason ?? ''}>
                {c.automation}
                {c.automation === 'manual' && c.manual_reason ? ' *' : ''}
              </td>
              <td>{c.scenario ?? ''}</td>
              <td style={{ color: STATUS_COLOR[c.status] ?? 'var(--text-dim)' }}>{c.status}</td>
              <td className="mono">{c.requirement_id ?? ''}{c.ac_id ? ` / ${c.ac_id}` : ''}</td>
              <td className="mono dim">
                {c.evidence ?? ''}
                {c.downgraded_from ? ` (was ${c.downgraded_from})` : ''}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={7} className="dim">No test cases match the current filters.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
