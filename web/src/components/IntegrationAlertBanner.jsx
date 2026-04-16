/**
 * Module: web/src/components/IntegrationAlertBanner
 * Purpose: Full-width warning banner shown when the installed Aitri CLI version
 *          exceeds INTEGRATION_LAST_REVIEWED. Renders before any project cards.
 * @aitri-trace FR-ID: FR-012, US-ID: US-012, AC-ID: AC-024, TC-ID: TC-012h
 */

import React from 'react';

/**
 * @param {{ alert: { severity: string, message: string, changelogUrl: string } | null }} props
 * @returns {JSX.Element | null}
 */
export default function IntegrationAlertBanner({ alert }) {
  if (!alert) return null;

  return (
    <div
      className="integration-alert-banner"
      data-testid="integration-alert-banner"
      role="alert"
      aria-live="polite"
    >
      <span className="integration-alert-banner__icon" aria-hidden="true">⚠</span>
      <span className="integration-alert-banner__message">{alert.message}</span>
      {alert.changelogUrl && (
        <a
          className="integration-alert-banner__link"
          href={alert.changelogUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View CHANGELOG.md →
        </a>
      )}
    </div>
  );
}
