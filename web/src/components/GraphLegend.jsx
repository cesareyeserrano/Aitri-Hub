/**
 * Component: GraphLegend
 * Purpose: Chip strip mapping node color → status, shape → artifact kind.
 *
 * @aitri-trace FR-ID: FR-016, US-ID: US-016, AC-ID: AC-032, TC-ID: TC-016h
 */

import React from 'react';

const STATUS_ITEMS = [
  { status: 'approved', label: 'Approved' },
  { status: 'active',   label: 'In progress' },
  { status: 'drift',    label: 'Drift' },
  { status: 'pending',  label: 'Pending' },
];

/**
 * @returns {JSX.Element}
 */
export default function GraphLegend() {
  return (
    <div className="graph-legend" role="list" aria-label="Graph legend">
      {STATUS_ITEMS.map(({ status, label }) => (
        <span
          key={status}
          className={`graph-legend__item graph-legend__item--${status}`}
          role="listitem"
        >
          <span className="graph-legend__dot" aria-hidden="true" />
          {label}
        </span>
      ))}
      <span className="graph-legend__item" role="listitem">
        <span className="graph-legend__shape graph-legend__shape--rect" aria-hidden="true" />
        FR
      </span>
      <span className="graph-legend__item" role="listitem">
        <span className="graph-legend__shape graph-legend__shape--diamond" aria-hidden="true" />
        TC
      </span>
    </div>
  );
}
