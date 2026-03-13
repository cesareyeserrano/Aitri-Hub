/**
 * Module: web/src/components/ProjectsTable
 * Purpose: Compact table — monospace code style with comment-prefixed headers.
 * @aitri-trace FR-ID: FR-006
 */

import React from 'react';

const TOTAL_PHASES = 5;

/**
 * Format commit age in hours to human-readable string.
 * @param {number | null | undefined} hours
 * @returns {string}
 */
function formatAge(hours) {
  if (hours === null || hours === undefined) return 'N/A';
  if (hours < 1)   return `${Math.round(hours * 60)}m ago`;
  if (hours < 48)  return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Return a CSS variable color string based on commit age.
 * @param {number | null | undefined} hours
 * @returns {string}
 */
function ageColor(hours) {
  if (hours === null || hours === undefined) return 'var(--text-muted)';
  if (hours < 24)  return 'var(--syn-green)';
  if (hours <= 72) return 'var(--syn-yellow)';
  return 'var(--syn-red)';
}

/**
 * @param {{ projects: object[] }} props
 * @returns {JSX.Element}
 */
export default function ProjectsTable({ projects }) {
  if (projects.length === 0) {
    return (
      <div className="empty-state">
        <p>// no projects to display.</p>
      </div>
    );
  }

  return (
    <div className="projects-table-wrap">
      <table className="projects-table">
        <thead>
          <tr>
            <th>NAME</th>
            <th>STATUS</th>
            <th>PHASE</th>
            <th>TESTS</th>
            <th>COMMIT</th>
            <th>ALERTS</th>
          </tr>
        </thead>
        <tbody>
          {projects.map(project => {
            const {
              id, name, status, aitriState, gitMeta, testSummary, alerts,
            } = project;

            const approved    = aitriState?.approvedPhases?.length ?? 0;
            const currentPh   = aitriState?.currentPhase ?? '—';
            const testsAvail  = testSummary?.available;
            const testStr     = testsAvail
              ? `${testSummary.passed}/${testSummary.total}`
              : 'N/A';
            const hasFailures = (testSummary?.failed ?? 0) > 0;
            const alertCount  = alerts?.length ?? 0;

            return (
              <tr key={id} data-testid="project-row">
                <td className="projects-table__name">{name}</td>
                <td>
                  <span className={`status-badge status-badge--${status}`}>
                    {status === 'unreadable' ? 'UNREADABLE' : status.toUpperCase()}
                  </span>
                </td>
                <td className="projects-table__dim">
                  {aitriState
                    ? `${currentPh}/${TOTAL_PHASES}  (${approved} approved)`
                    : 'N/A'}
                </td>
                <td
                  className="projects-table__mono"
                  style={{ color: hasFailures ? 'var(--syn-red)' : undefined }}
                >
                  {testStr}
                </td>
                <td
                  className="projects-table__mono"
                  style={{ color: ageColor(gitMeta?.lastCommitAgeHours) }}
                >
                  {formatAge(gitMeta?.lastCommitAgeHours)}
                </td>
                <td>
                  {alertCount === 0 ? (
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                      —
                    </span>
                  ) : (
                    <span
                      style={{
                        color: alerts.some(a => a.severity === 'error')
                          ? 'var(--syn-red)'
                          : 'var(--syn-yellow)',
                        fontWeight: 500,
                        fontSize: '12px',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {alertCount}
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
