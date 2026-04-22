/**
 * Module: web/src/components/BugBadge
 * Purpose: Display open bug count pill on a project card.
 *          Blocking (red) for critical/high bugs; warning (yellow) for medium/low only.
 *
 * @aitri-trace FR-ID: FR-021, US-ID: US-021, AC-ID: AC-041, AC-042, TC-ID: TC-021h, TC-021f, TC-021e
 */

import React from 'react';

/**
 * @param {{ bugsSummary: object | null }} props
 * @returns {JSX.Element | null}
 */
export default function BugBadge({ bugsSummary }) {
  if (!bugsSummary || bugsSummary.open === 0) return null;

  const { open, critical, high } = bugsSummary;
  const isBlocking = critical > 0 || high > 0;

  const color = isBlocking ? 'var(--syn-red)' : 'var(--syn-yellow)';
  const icon = isBlocking ? '✖' : '⚠';
  const label = `${open} ${open === 1 ? 'bug' : 'bugs'}`;

  return (
    <span
      className="bug-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        color,
        border: `1px solid ${color}`,
        borderRadius: '3px',
        padding: '1px 5px',
        whiteSpace: 'nowrap',
      }}
      title={isBlocking ? 'Open blocking bugs' : 'Open bugs'}
    >
      {icon} {label}
    </span>
  );
}
