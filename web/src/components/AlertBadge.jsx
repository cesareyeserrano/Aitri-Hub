/**
 * Module: web/src/components/AlertBadge
 * Purpose: Render inline alert badges at the bottom of a ProjectCard.
 * @aitri-trace FR-ID: FR-007, TC-ID: TC-007h
 */

import React from 'react';

/**
 * @param {{ alerts: Alert[] }} props
 * @returns {JSX.Element}
 */
export default function AlertBadge({ alerts }) {
  if (!alerts || alerts.length === 0) {
    return (
      <div className="card__alerts" data-testid="alert-badge-none">
        <span className="card__no-alerts">✓ No alerts</span>
      </div>
    );
  }

  return (
    <div className="card__alerts" data-testid="alert-list">
      {alerts.map((alert, i) => (
        <span
          key={i}
          className={`alert-badge-mini alert-badge-mini--${alert.severity}`}
          data-testid={`alert-item-${alert.type}`}
          title={alert.message}
        >
          {alert.severity === 'error' ? '✖' : '⚠'} {alert.message}
        </span>
      ))}
    </div>
  );
}
