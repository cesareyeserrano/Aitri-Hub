/**
 * Module: web/src/components/VelocityTab
 * Purpose: Git commit velocity — code/stats style with const block and bar chart.
 * @aitri-trace FR-ID: FR-006
 */

import React, { useState, useEffect } from 'react';

/**
 * @param {{ projects: object[] }} props
 * @returns {JSX.Element}
 */
export default function VelocityTab({ projects }) {
  const [mounted, setMounted] = useState(false);

  // Animate bars from 0 on first render
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Build per-project velocity data
  const rows = projects
    .map(p => ({
      name:      p.name,
      commits:   p.gitMeta?.commitVelocity7d ?? 0,
      isStalled: (p.gitMeta?.lastCommitAgeHours ?? 0) > 72,
    }))
    .sort((a, b) => b.commits - a.commits);

  const maxCommits   = Math.max(...rows.map(r => r.commits), 1);
  const totalCommits = rows.reduce((s, r) => s + r.commits, 0);
  const avgPerDay    = totalCommits > 0 ? (totalCommits / 7).toFixed(1) : '0';
  const mostActive   = rows[0];
  const leastActive  = rows[rows.length - 1];

  /* ── Syntax-highlight comment color helper ── */
  const cmtStyle  = { color: 'var(--syn-comment)' };
  const keyStyle  = { color: 'var(--syn-purple)' };
  const valStyle  = { color: 'var(--syn-teal)' };
  const strStyle  = { color: 'var(--syn-yellow)' };
  const puncStyle = { color: 'var(--text-muted)' };

  return (
    <div className="velocity-tab">
      {/* ── const stats = { … } block ── */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '3px',
          padding: '16px 20px',
          marginBottom: '24px',
          lineHeight: '1.8',
        }}
      >
        {/* // velocity.ts header */}
        <div style={{ ...cmtStyle, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: 'var(--syn-teal)' }}>⚡</span>
          <span>// velocity.ts</span>
          <span style={{ color: 'var(--text-muted)', flex: 1, borderTop: '1px solid var(--border)', marginLeft: '8px' }} />
        </div>
        <div style={{ ...cmtStyle, marginBottom: '12px' }}>
          // commits last 7 days · {projects.length} projects tracked
        </div>

        {/* const stats = { */}
        <div>
          <span style={{ color: 'var(--syn-blue)' }}>const</span>
          {' '}
          <span style={{ color: 'var(--syn-orange)' }}>stats</span>
          {' '}
          <span style={puncStyle}>=</span>
          {' '}
          <span style={puncStyle}>{'{'}</span>
        </div>

        <div style={{ paddingLeft: '24px' }}>
          {/* total */}
          <div>
            <span style={keyStyle}>total</span>
            <span style={puncStyle}>:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
            <span style={valStyle}>{totalCommits}</span>
            <span style={puncStyle}>,</span>
            <span style={{ ...cmtStyle, marginLeft: '16px' }}>// commits</span>
          </div>

          {/* avg_per_day */}
          <div>
            <span style={keyStyle}>avg_per_day</span>
            <span style={puncStyle}>:&nbsp;</span>
            <span style={valStyle}>{avgPerDay}</span>
            <span style={puncStyle}>,</span>
            <span style={{ ...cmtStyle, marginLeft: '16px' }}>// per day</span>
          </div>

          {/* most_active */}
          {mostActive && (
            <div>
              <span style={keyStyle}>most_active</span>
              <span style={puncStyle}>:&nbsp;</span>
              <span style={strStyle}>"{mostActive.name}"</span>
              <span style={puncStyle}>,</span>
            </div>
          )}

          {/* least_active */}
          {leastActive && leastActive !== mostActive && (
            <div>
              <span style={keyStyle}>least_active</span>
              <span style={puncStyle}>:&nbsp;</span>
              <span style={strStyle}>"{leastActive.name}"</span>
              <span style={puncStyle}>,</span>
            </div>
          )}
        </div>

        <div>
          <span style={puncStyle}>{'}'}</span>
        </div>
      </div>

      {/* ── Bar chart panel ── */}
      <div className="velocity-chart">
        <div className="velocity-chart__title">⊙ commit velocity · 7d window</div>

        {rows.length === 0 ? (
          <div style={{ color: 'var(--syn-comment)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            // no git data available.
          </div>
        ) : (
          rows.map(row => {
            const pct        = maxCommits > 0 ? (row.commits / maxCommits) * 100 : 0;
            const displayPct = mounted ? pct : 0;

            return (
              <div key={row.name} className="velocity-bar-row">
                <span className="velocity-bar-row__name" title={row.name}>
                  {row.name}
                </span>

                <div className="velocity-bar-row__bar-wrap">
                  <div
                    className={`velocity-bar-row__bar-fill ${
                      row.isStalled ? 'velocity-bar-row__bar-fill--stalled' : ''
                    }`}
                    style={{ width: `${displayPct}%` }}
                  />
                </div>

                <span className="velocity-bar-row__count">
                  {row.commits > 0 ? `${row.commits}c` : '—'}
                </span>

                {row.isStalled && (
                  <span className="velocity-bar-row__stalled-label">⏸ STALLED</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
