/**
 * Module: web/src/components/ActivityTab
 * Purpose: Cross-project pipeline activity timeline — all events from all projects,
 *          sorted by timestamp descending. Reads aitriState.events (Aitri v0.1.45+).
 */

import React from 'react';

const EVENT_META = {
  approved:  { icon: '✓', colorVar: '--syn-green',  label: 'approved'  },
  completed: { icon: '⊙', colorVar: '--syn-teal',   label: 'completed' },
  rejected:  { icon: '✗', colorVar: '--syn-red',    label: 'rejected'  },
};

/**
 * Format an ISO timestamp to relative time string.
 * @param {string} iso
 * @returns {string}
 */
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Format ISO to absolute date string (e.g. "Mar 13, 14:32").
 * @param {string} iso
 * @returns {string}
 */
function absTime(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/**
 * @param {{ projects: object[] }} props
 * @returns {JSX.Element}
 */
export default function ActivityTab({ projects }) {
  // Flatten all events across projects, tag with project name
  const events = [];
  for (const p of projects) {
    const raw = p.aitriState?.events ?? [];
    for (const ev of raw) {
      if (ev && ev.at && ev.event && ev.phase !== undefined) {
        events.push({ ...ev, projectName: p.name, projectId: p.id });
      }
    }
  }

  // Sort descending by timestamp
  events.sort((a, b) => new Date(b.at) - new Date(a.at));

  const phaseLabel = (phase) =>
    typeof phase === 'number' ? `phase ${phase}` : phase;

  return (
    <div className="activity-tab">
      <div className="activity-tab__header">
        <span className="activity-tab__title">⊙ pipeline activity · all projects</span>
        <span className="activity-tab__count">
          {events.length === 0 ? '// no events yet' : `${events.length} events`}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="activity-empty">
          <span style={{ color: 'var(--syn-comment)' }}>
            // no pipeline events recorded yet.
          </span>
          <span style={{ color: 'var(--syn-comment)', marginTop: '4px' }}>
            // events appear after: aitri complete · aitri approve · aitri reject
          </span>
        </div>
      ) : (
        <div className="activity-feed">
          {events.map((ev, i) => {
            const meta = EVENT_META[ev.event] ?? { icon: '·', colorVar: '--syn-comment', label: ev.event };
            return (
              <div key={`${ev.projectId}-${ev.at}-${i}`} className="activity-row">
                {/* Timeline spine */}
                <div className="activity-row__spine">
                  <span
                    className="activity-row__icon"
                    style={{ color: `var(${meta.colorVar})` }}
                  >
                    {meta.icon}
                  </span>
                  {i < events.length - 1 && <div className="activity-row__line" />}
                </div>

                {/* Content */}
                <div className="activity-row__body">
                  <div className="activity-row__top">
                    <span
                      className="activity-row__event"
                      style={{ color: `var(${meta.colorVar})` }}
                    >
                      {meta.label}
                    </span>
                    <span className="activity-row__phase">
                      {phaseLabel(ev.phase)}
                    </span>
                    <span className="activity-row__project">
                      {ev.projectName}
                    </span>
                  </div>

                  {ev.feedback && (
                    <div className="activity-row__feedback">
                      <span style={{ color: 'var(--syn-comment)' }}>// </span>
                      {ev.feedback}
                    </div>
                  )}

                  <div className="activity-row__time" title={absTime(ev.at)}>
                    {relativeTime(ev.at)} · {absTime(ev.at)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
