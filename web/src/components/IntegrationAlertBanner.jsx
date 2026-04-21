/**
 * Module: web/src/components/IntegrationAlertBanner
 * Purpose: Full-width warning banner shown when the installed Aitri CLI version
 *          exceeds the reviewed baseline. Renders provenance subtext when
 *          both reviewedAt and changelogHash are present (FR-035).
 * @aitri-trace FR-ID: FR-035, US-ID: US-032, AC-ID: AC-033, TC-ID: TC-035f
 */

import React from 'react';

function formatReviewedAt(iso) {
  if (typeof iso !== 'string') return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
       + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

export default function IntegrationAlertBanner({ alert }) {
  if (!alert) return null;

  const formattedDate = formatReviewedAt(alert.reviewedAt);
  const hashPrefix = typeof alert.changelogHash === 'string' && alert.changelogHash.length >= 12
    ? alert.changelogHash.slice(0, 12)
    : null;
  const showProvenance = formattedDate !== null && hashPrefix !== null;

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
      {showProvenance && (
        <span
          className="integration-alert-banner__provenance"
          data-testid="integration-alert-provenance"
        >
          last reviewed {formattedDate} · hash {hashPrefix}…
        </span>
      )}
    </div>
  );
}
