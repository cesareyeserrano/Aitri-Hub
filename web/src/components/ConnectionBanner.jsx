/**
 * Module: web/src/components/ConnectionBanner
 * Purpose: Show connection status when polling fails or recovers — terminal error line style.
 * @aitri-trace FR-ID: FR-006, TC-ID: TC-006f
 */

import React from 'react';

/**
 * @param {{ status: 'connected'|'retrying'|'failed'|'restored' }} props
 * @returns {JSX.Element | null}
 */
export default function ConnectionBanner({ status }) {
  if (status === 'connected') return null;

  const config = {
    retrying: {
      cls: 'banner--retrying',
      level: '[WARN]',
      msg: "reconnecting to dashboard data… (retrying every 5s)",
    },
    failed: {
      cls: 'banner--failed',
      level: '[ERROR]',
      msg: "dashboard unavailable — is 'aitri-hub web' running? check 'docker compose logs'.",
    },
    restored: {
      cls: 'banner--restored',
      level: '[INFO]',
      msg: "connection restored.",
    },
  };

  const { cls, level, msg } = config[status] ?? config.retrying;

  return (
    <div className={`banner ${cls}`} role="status" data-testid="connection-banner">
      <span style={{ opacity: 0.7 }}>{level}&nbsp;</span>
      {msg}
    </div>
  );
}
