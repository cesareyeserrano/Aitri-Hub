/**
 * Module: web/src/components/AlertsTab
 * Purpose: Health report — issues grouped by severity (BLOCKING / WARNING / INFO).
 *          Each issue shows the affected project and the command to resolve it.
 * @aitri-trace FR-ID: FR-007
 */

import React from 'react';

// ── Issue row ──────────────────────────────────────────────────────────────────

function IssueRow({ alert, index }) {
  return (
    <div className={`health-issue health-issue--${alert.severity}`}>
      <span className="health-issue__ln">{String(index + 1).padStart(2, '0')}</span>
      <span className="health-issue__project">{alert.projectName}</span>
      <span className="health-issue__arrow">→</span>
      <span className="health-issue__msg">{alert.message}</span>
      {alert.command && (
        <code className="health-issue__cmd">{alert.command}</code>
      )}
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────

function IssueSection({ severity, label, glyph, issues, offset }) {
  if (issues.length === 0) return null;
  return (
    <div className={`health-section health-section--${severity}`}>
      <div className="health-section__header">
        <span className={`health-section__glyph health-section__glyph--${severity}`}>{glyph}</span>
        <span className="health-section__label">{label}</span>
        <span className="health-section__count">{issues.length}</span>
      </div>
      <div className="health-section__rows">
        {issues.map((a, i) => (
          <IssueRow key={i} alert={a} index={offset + i} />
        ))}
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function AlertsTab({ projects }) {
  const allAlerts = projects.flatMap(p =>
    (p.alerts ?? []).map(alert => ({ ...alert, projectName: p.name })),
  );

  const blocking = allAlerts.filter(a => a.severity === 'blocking');
  const warnings = allAlerts.filter(a => a.severity === 'warning');
  const info     = allAlerts.filter(a => a.severity === 'info');
  const total    = allAlerts.length;

  const now = new Date().toLocaleTimeString();

  return (
    <div className="alerts-tab">
      {/* ── Header ── */}
      <div className="alerts-log-header">
        <span className="alerts-log-header__file">// health_report</span>
        <span className="alerts-log-header__sep" />
        <span className="alerts-log-header__meta">
          {blocking.length > 0 && <>{blocking.length} blocking · </>}
          {warnings.length} warning{warnings.length !== 1 ? 's' : ''} · {info.length} info · {now}
        </span>
      </div>

      {/* ── Score bar ── */}
      {total > 0 && (
        <div className="health-score-bar">
          {blocking.length > 0 && (
            <div
              className="health-score-bar__seg health-score-bar__seg--blocking"
              style={{ flex: blocking.length }}
              title={`${blocking.length} blocking`}
            />
          )}
          {warnings.length > 0 && (
            <div
              className="health-score-bar__seg health-score-bar__seg--warning"
              style={{ flex: warnings.length }}
              title={`${warnings.length} warnings`}
            />
          )}
          {info.length > 0 && (
            <div
              className="health-score-bar__seg health-score-bar__seg--info"
              style={{ flex: info.length }}
              title={`${info.length} info`}
            />
          )}
        </div>
      )}

      {/* ── All clear ── */}
      {total === 0 && (
        <div className="alerts-empty">
          <span style={{ fontSize: '18px' }}>✓</span>
          <span>no issues — all projects look healthy.</span>
        </div>
      )}

      {/* ── Issue sections ── */}
      <div className="health-report">
        <IssueSection
          severity="blocking"
          label="BLOCKING"
          glyph="✖"
          issues={blocking}
          offset={0}
        />
        <IssueSection
          severity="warning"
          label="WARNING"
          glyph="⚠"
          issues={warnings}
          offset={blocking.length}
        />
        <IssueSection
          severity="info"
          label="INFO"
          glyph="·"
          issues={info}
          offset={blocking.length + warnings.length}
        />
      </div>
    </div>
  );
}
