/**
 * Module: web/src/views/MonitorView
 * Purpose: v0.3.0 Monitor (home) — urgency-weighted bento grid with worst-first order,
 *          health filter bar (ALL / CRITICAL / AT RISK / NOMINAL), and signal-first cards.
 *          Consumes the existing /data/dashboard.json projects; renders via monitor.js.
 *          Falls back to the onboarding empty state when there are no projects.
 *
 * @aitri-trace FR-ID: FR-010, US-ID: US-010, AC-ID: AC-010-1, TC-ID: TC-010h
 */

import React, { useState } from 'react';
import MonitorCard from '../components/MonitorCard.jsx';
import { navigate, readMonitorFilter, writeMonitorFilter } from '../lib/navigate.js';
import { buildMonitorLayout, applyFilter, filterBarCount } from '../lib/monitor.js';

const FILTERS = ['ALL', 'CRITICAL', 'AT RISK', 'NOMINAL'];

/** Onboarding empty state (FR-005) — never a broken/blank grid. */
function Onboarding() {
  return (
    <div className="empty-state empty-state--onboarding">
      <h2 className="empty-state__title">No projects yet</h2>
      <p className="empty-state__body">
        Add your first project to start monitoring its pipeline, Git activity, and test health.
      </p>
      <a
        className="empty-state__cta"
        href="/admin"
        onClick={(e) => {
          e.preventDefault();
          navigate('/admin');
        }}
      >
        Add your first project
      </a>
    </div>
  );
}

/**
 * @param {{ projects: object[], loading: boolean, stale?: boolean }} props
 * @aitri-trace FR-ID: FR-010, US-ID: US-010, AC-ID: AC-010-2, TC-ID: TC-010f
 */
export default function MonitorView({ projects, loading, stale = false }) {
  // Filter is seeded from (and mirrored to) the URL so browser-back from a Detail
  // view restores the prior filter (FR-012 AC-012-1 / TC-012e).
  const [filter, setFilterState] = useState(() => readMonitorFilter());
  const setFilter = (f) => {
    setFilterState(f);
    writeMonitorFilter(f);
  };

  if (loading) {
    return (
      <div className="bento-grid">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card mcard" data-status="loading" />
        ))}
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return <Onboarding />;
  }

  const filtered = applyFilter(projects, filter);
  const layout = buildMonitorLayout(filtered);

  return (
    <div className="monitor">
      <div className="monitor__filterbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'filter-btn--active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f}
            {f !== 'ALL' && <span className="filter-btn__count"> {filterBarCount(projects, f)}</span>}
          </button>
        ))}
        <span className="monitor__filter-summary">
          {layout.length} PROJECTS{stale ? ' · // snapshot stale' : ''}
        </span>
      </div>

      {layout.length === 0 ? (
        <div className="empty-state">// no projects match “{filter}”</div>
      ) : (
        <div className="bento-grid">
          {layout.map((p, i) => (
            <MonitorCard key={p.id} project={p} span={p.gridColumnSpan} animationDelay={i * 50} />
          ))}
        </div>
      )}
    </div>
  );
}
