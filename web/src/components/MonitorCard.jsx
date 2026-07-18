/**
 * Module: web/src/components/MonitorCard
 * Purpose: v0.3.0 signal-first Monitor card — health badge, segmented pipeline,
 *          6 signal tiles, single top-issue line, detail CTA. Urgency drives size
 *          (CRITICAL cards span 2 grid columns via the layout's gridColumnSpan).
 *          GitHub-Dark tokens only. Renders from buildCardModel().
 *
 * @aitri-trace FR-ID: FR-011, US-ID: US-011, AC-ID: AC-011-1, TC-ID: TC-011h
 */

import React from 'react';
import { buildCardModel } from '../lib/monitor.js';
import { navigate } from '../lib/navigate.js';

const URGENCY_META = Object.freeze({
  critical: { label: 'CRITICAL', glyph: '✕', cls: 'error' },
  at_risk: { label: 'AT RISK', glyph: '⚠', cls: 'warning' },
  healthy: { label: 'NOMINAL', glyph: '✓', cls: 'healthy' },
});

/** Semantic colour class for a tile value (green/amber/red/dim), never colour alone — value text carries it. */
function tileTone(key, value) {
  if (value === 'N/A') return 'color--dim';
  if (value === 'FAIL' || (key === 'Drift' && value === 'YES')) return 'color--error';
  if (key === 'Rejections' && value !== '0') return 'color--warning';
  if (key === 'Pending' && value !== '0') return 'color--warning';
  if (value === 'PASS' || (key === 'Drift' && value === 'NO')) return 'color--healthy';
  return 'color--info';
}

/**
 * @param {{ project: object, span: number, animationDelay?: number }} props
 */
export default function MonitorCard({ project, span = 1, animationDelay = 0 }) {
  const m = buildCardModel(project);
  const meta = URGENCY_META[m.urgency] ?? URGENCY_META.healthy;
  const segments = Array.from({ length: m.pipeline.total }, (_, i) => i < m.pipeline.filled);

  return (
    <div
      className="card mcard"
      data-status={meta.cls}
      data-testid="monitor-card"
      data-urgency={m.urgency}
      data-id={m.id}
      style={{ gridColumn: span === 2 ? 'span 2' : 'span 1', animationDelay: `${animationDelay}ms` }}
    >
      <div className="card__header">
        <div className="card__header-left">
          <span className="card__name">{m.name}</span>
        </div>
        <span className={`status-badge status-badge--${meta.cls}`}>
          {meta.glyph} {meta.label}
        </span>
      </div>

      <div className="phase-bar mcard__pipeline">
        {segments.map((on, i) => (
          <span key={i} className={`phase-segment ${on ? 'phase-segment--approved' : ''}`} />
        ))}
      </div>

      <div className="mcard__tiles">
        {m.tiles.map((t) => (
          <div key={t.key} className="mcard__tile">
            <span className="mcard__tile-label">{t.key}</span>
            <span className={`mcard__tile-value ${tileTone(t.key, t.value)}`}>{t.value}</span>
          </div>
        ))}
      </div>

      <div className="mcard__issue">
        {m.topIssue ? (
          <span className="color--error">{meta.glyph} {m.topIssue}</span>
        ) : (
          <span className="color--dim">// all systems nominal</span>
        )}
      </div>

      <button
        className="mcard__cta"
        data-testid="card-cta"
        onClick={() => navigate(`/project/${encodeURIComponent(m.id)}`)}
      >
        open detail →
      </button>
    </div>
  );
}
