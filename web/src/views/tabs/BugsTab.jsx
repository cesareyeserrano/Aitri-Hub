/**
 * Module: web/src/views/tabs/BugsTab
 * Purpose: Bug table with blocking pinning and the absent / empty / corrupt
 *          trichotomy (FR-057).
 *
 * @aitri-trace FR-ID: FR-057, US-ID: US-057, AC-ID: AC-0571, AC-0572, TC-ID: TC-057h, TC-057e, TC-057f
 */

import React from 'react';
import EmptyState from '../../components/EmptyState.jsx';

const SEV_COLOR = {
  critical: 'var(--syn-red)',
  high: 'var(--syn-orange)',
  medium: 'var(--syn-yellow)',
  low: 'var(--text-dim)',
};

export default function BugsTab({ bugs }) {
  // Corrupt: file exists but unreadable — NEVER shown as zero bugs (FR-057).
  if (bugs?.parseError) {
    return (
      <div className="bugs-parse-error" data-testid="bugs-parse-error" role="alert">
        ⚠ BUGS.json could not be read for this scope — bugs are <strong>NOT counted</strong>.
        Fix the file before relying on the deploy verdict.
      </div>
    );
  }
  // Absent: no BUGS.json at all — distinct from a valid-empty file.
  if (!bugs?.available) {
    return (
      <EmptyState
        artifact="BUGS.json"
        command="aitri bug add"
        note="No bugs have been recorded for this scope."
      />
    );
  }
  // Valid empty
  if (bugs.bugs.length === 0) {
    return (
      <div className="bugs-empty" data-testid="bugs-empty">
        ✓ No bugs recorded for this scope.
      </div>
    );
  }

  return (
    <table className="data-table" data-testid="bugs-table">
      <thead>
        <tr><th>ID</th><th>title</th><th>severity</th><th>status</th><th>resolution</th><th>TC</th><th>files</th></tr>
      </thead>
      <tbody>
        {bugs.bugs.map(b => (
          <tr key={b.id} data-testid="bug-row" data-blocking={b.blocking ? 'true' : 'false'}
              className={b.blocking ? 'row-blocking' : ''}>
            <td className="mono">{b.id}</td>
            <td>{b.title}</td>
            <td style={{ color: SEV_COLOR[b.severity] ?? 'var(--text-dim)' }}>
              {b.blocking ? '● ' : ''}{b.severity}
            </td>
            <td>{b.status}</td>
            <td>{b.resolution ?? <span className="dim">—</span>}</td>
            <td className="mono">{b.tc_id ?? ''}</td>
            <td className="mono dim">{Array.isArray(b.files_changed) ? b.files_changed.join(', ') : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
