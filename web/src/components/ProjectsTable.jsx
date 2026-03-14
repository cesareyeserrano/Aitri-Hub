/**
 * Module: web/src/components/ProjectsTable
 * Purpose: Compact table — monospace code style with comment-prefixed headers.
 * @aitri-trace FR-ID: FR-006
 */

import React from 'react';

const TOTAL_PHASES = 5;

function formatAge(hours) {
  if (hours === null || hours === undefined) return 'N/A';
  if (hours < 1)   return `${Math.round(hours * 60)}m ago`;
  if (hours < 48)  return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function ageColor(hours) {
  if (hours === null || hours === undefined) return 'var(--text-muted)';
  if (hours < 24)  return 'var(--syn-green)';
  if (hours <= 72) return 'var(--syn-yellow)';
  return 'var(--syn-red)';
}

const STATUS_ICON = { healthy: '✓', warning: '⚠', error: '✖', unreadable: '?' };

export default function ProjectsTable({ projects }) {
  if (projects.length === 0) {
    return <div className="empty-state"><p>// no projects to display.</p></div>;
  }

  return (
    <div className="projects-table-wrap">
      <table className="projects-table">
        <thead>
          <tr>
            <th>⎇ NAME</th>
            <th>◈ STATUS</th>
            <th>≡ PHASE</th>
            <th>◉ TESTS</th>
            <th>⊙ COMMIT</th>
            <th>⚡ ALERTS</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(project => {
            const { id, name, status, aitriState, gitMeta, testSummary, alerts } = project;

            const approved   = aitriState?.approvedPhases?.length ?? 0;
            const currentPh  = aitriState?.currentPhase ?? null;
            const phasePct   = Math.round((approved / TOTAL_PHASES) * 100);

            const testsAvail = testSummary?.available;
            const passed     = testSummary?.passed ?? 0;
            const total      = testSummary?.total ?? 0;
            const failed     = testSummary?.failed ?? 0;
            const testPct    = total > 0 ? Math.round((passed / total) * 100) : null;

            const alertCount = alerts?.length ?? 0;
            const hasError   = alerts?.some(a => a.severity === 'error');

            return (
              <tr key={id} data-testid="project-row" data-status={status}>
                {/* Name */}
                <td className="projects-table__name">
                  <span style={{ color: 'var(--syn-comment)', marginRight: '4px' }}>
                    {STATUS_ICON[status] ?? '·'}
                  </span>
                  {name}
                  {gitMeta?.branch && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>
                      ⎇ {gitMeta.branch}
                    </div>
                  )}
                </td>

                {/* Status */}
                <td>
                  <span className={`status-badge status-badge--${status}`}>
                    {STATUS_ICON[status]} {status === 'unreadable' ? 'N/A' : status.toUpperCase()}
                  </span>
                </td>

                {/* Phase with mini bar */}
                <td>
                  {aitriState ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="projects-table__dim">
                        {currentPh}/{TOTAL_PHASES}
                        <span style={{ color: 'var(--text-muted)', marginLeft: '6px' }}>({approved} ✓)</span>
                      </span>
                      <div style={{ height: '3px', background: 'var(--surface-raised)', borderRadius: '2px', overflow: 'hidden', width: '80px' }}>
                        <div style={{ height: '100%', width: `${phasePct}%`, background: 'var(--syn-blue)', borderRadius: '2px', transition: 'width .4s ease' }} />
                      </div>
                    </div>
                  ) : (
                    <span className="projects-table__dim">N/A</span>
                  )}
                </td>

                {/* Tests with mini bar */}
                <td>
                  {testsAvail ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="projects-table__mono" style={{ color: failed > 0 ? 'var(--syn-red)' : 'var(--syn-green)' }}>
                        {passed}/{total}
                        {testPct !== null && <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>({testPct}%)</span>}
                      </span>
                      <div style={{ height: '3px', background: 'var(--surface-raised)', borderRadius: '2px', overflow: 'hidden', width: '80px' }}>
                        <div style={{ height: '100%', width: `${testPct ?? 0}%`, background: failed > 0 ? 'var(--syn-red)' : 'var(--syn-green)', borderRadius: '2px', transition: 'width .4s ease' }} />
                      </div>
                    </div>
                  ) : (
                    <span className="projects-table__dim">N/A</span>
                  )}
                </td>

                {/* Commit */}
                <td className="projects-table__mono" style={{ color: ageColor(gitMeta?.lastCommitAgeHours) }}>
                  {formatAge(gitMeta?.lastCommitAgeHours)}
                </td>

                {/* Alerts */}
                <td>
                  {alertCount === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                  ) : (
                    <span className={`alert-badge-mini alert-badge-mini--${hasError ? 'error' : 'warning'}`}>
                      {hasError ? '✖' : '⚠'} {alertCount}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
