/**
 * Module: web/src/components/LastSessionRow
 * Purpose: Render one row per project showing the last Aitri agent session.
 *          Hidden (returns null) when lastSession is absent.
 *
 * @aitri-trace FR-ID: FR-020, US-ID: US-020, AC-ID: AC-039, AC-040, TC-ID: TC-020h, TC-020f, TC-020e
 */

import React from 'react';

/** Agent → color token map per UX spec. */
const AGENT_COLORS = Object.freeze({
  claude:   '--syn-blue',
  codex:    '--syn-purple',
  gemini:   '--syn-teal',
  opencode: '--syn-orange',
  cursor:   '--syn-green',
  unknown:  '--syn-comment',
});

/**
 * Format an ISO timestamp to relative time string.
 * @param {string} iso
 * @returns {string}
 */
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * @param {{ projectName: string, lastSession: object | null }} props
 * @returns {JSX.Element | null}
 */
export default function LastSessionRow({ projectName, lastSession }) {
  if (!lastSession) return null;

  const { at, agent, event } = lastSession;
  const agentKey   = (agent ?? '').toLowerCase();
  const colorVar   = AGENT_COLORS[agentKey] ?? AGENT_COLORS.unknown;
  const agentColor = `var(${colorVar})`;

  return (
    <div
      className="activity-row activity-row--session"
      style={{ borderLeft: `2px solid ${agentColor}`, paddingLeft: '8px' }}
    >
      <div className="activity-row__spine">
        <span className="activity-row__icon" style={{ color: agentColor }}>●</span>
      </div>

      <div className="activity-row__body">
        <div className="activity-row__top">
          <span
            className="activity-row__event"
            style={{ color: agentColor, fontSize: '10px' }}
          >
            [{agent ?? 'unknown'}]
          </span>
          <span
            className="activity-row__phase"
            style={{ fontSize: '11px', color: 'var(--text-dim)' }}
          >
            {event ?? ''}
          </span>
          <span className="activity-row__project">{projectName}</span>
        </div>

        {at && (
          <div
            className="activity-row__time"
            style={{ fontSize: '11px', color: 'var(--syn-comment)' }}
          >
            {relativeTime(at)}
          </div>
        )}
      </div>
    </div>
  );
}
