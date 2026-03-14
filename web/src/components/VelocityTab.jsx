/**
 * Module: web/src/components/VelocityTab
 * Purpose: Git commit velocity — code/stats style with stat cards and bar chart.
 * @aitri-trace FR-ID: FR-006
 */

import React, { useState, useEffect } from 'react';

export default function VelocityTab({ projects }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const rows = projects
    .map(p => ({
      name:      p.name,
      commits:   p.gitMeta?.commitVelocity7d ?? 0,
      branch:    p.gitMeta?.branch ?? null,
      isStalled: (p.gitMeta?.lastCommitAgeHours ?? 0) > 72,
      hasGit:    p.gitMeta?.isGitRepo ?? false,
    }))
    .sort((a, b) => b.commits - a.commits);

  const maxCommits   = Math.max(...rows.map(r => r.commits), 1);
  const totalCommits = rows.reduce((s, r) => s + r.commits, 0);
  const avgPerDay    = totalCommits > 0 ? (totalCommits / 7).toFixed(1) : '0';
  const activeCount  = rows.filter(r => r.commits > 0).length;
  const stalledCount = rows.filter(r => r.isStalled).length;

  return (
    <div className="velocity-tab">

      {/* ── Stat cards ── */}
      <div className="vel-stats">
        <div className="vel-stat">
          <span className="vel-stat__icon">⚡</span>
          <span className="vel-stat__value">{totalCommits}</span>
          <span className="vel-stat__label">// total_commits</span>
          <span className="vel-stat__sub">last 7 days</span>
        </div>
        <div className="vel-stat">
          <span className="vel-stat__icon">⊙</span>
          <span className="vel-stat__value">{avgPerDay}</span>
          <span className="vel-stat__label">// avg_per_day</span>
          <span className="vel-stat__sub">commits / day</span>
        </div>
        <div className="vel-stat">
          <span className="vel-stat__icon" style={{ color: 'var(--syn-green)' }}>◉</span>
          <span className="vel-stat__value" style={{ color: 'var(--syn-green)' }}>{activeCount}</span>
          <span className="vel-stat__label">// active</span>
          <span className="vel-stat__sub">of {rows.length} projects</span>
        </div>
        <div className="vel-stat">
          <span className="vel-stat__icon" style={{ color: stalledCount > 0 ? 'var(--syn-red)' : 'var(--syn-comment)' }}>⏸</span>
          <span className="vel-stat__value" style={{ color: stalledCount > 0 ? 'var(--syn-red)' : 'var(--text-muted)' }}>{stalledCount}</span>
          <span className="vel-stat__label">// stalled</span>
          <span className="vel-stat__sub">&gt;72h no commits</span>
        </div>
      </div>

      {/* ── Bar chart ── */}
      <div className="velocity-chart">
        <div className="velocity-chart__title">⊙ commit velocity · 7d window</div>

        {rows.length === 0 ? (
          <div style={{ color: 'var(--syn-comment)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            // no git data available.
          </div>
        ) : (
          rows.map((row, i) => {
            const pct        = maxCommits > 0 ? (row.commits / maxCommits) * 100 : 0;
            const displayPct = mounted ? pct : 0;
            const isTop      = i === 0 && row.commits > 0;

            return (
              <div key={row.name} className="velocity-bar-row">
                <div className="velocity-bar-row__meta">
                  <span className="velocity-bar-row__name" title={row.name}>
                    {isTop && <span style={{ color: 'var(--syn-teal)', marginRight: '4px' }}>▸</span>}
                    {row.name}
                  </span>
                  {row.branch && (
                    <span className="velocity-bar-row__branch">⎇ {row.branch}</span>
                  )}
                </div>

                <div className="velocity-bar-row__bar-wrap">
                  <div
                    className={`velocity-bar-row__bar-fill ${row.isStalled ? 'velocity-bar-row__bar-fill--stalled' : ''}`}
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
