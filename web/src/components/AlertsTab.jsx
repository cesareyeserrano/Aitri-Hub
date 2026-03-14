/**
 * Module: web/src/components/AlertsTab
 * Purpose: Consolidated alerts view — log file / terminal style.
 * @aitri-trace FR-ID: FR-007
 */

import React from 'react';

export default function AlertsTab({ projects }) {
  const allAlerts = projects.flatMap(p =>
    (p.alerts ?? []).map(alert => ({ ...alert, projectName: p.name, status: p.status })),
  );

  const errors   = allAlerts.filter(a => a.severity === 'error');
  const warnings = allAlerts.filter(a => a.severity === 'warning');
  const total    = allAlerts.length;

  if (total === 0) {
    return (
      <div className="alerts-tab">
        <div className="alerts-log-header">
          <span className="alerts-log-header__file">// alerts.log</span>
          <span className="alerts-log-header__sep" />
          <span className="alerts-log-header__meta">0 issues · {new Date().toLocaleTimeString()}</span>
        </div>
        <div className="alerts-empty">
          <span style={{ fontSize: '18px' }}>✓</span>
          <span>no critical issues — all projects look healthy.</span>
        </div>
      </div>
    );
  }

  const errPct  = Math.round((errors.length / total) * 100);
  const warnPct = 100 - errPct;

  return (
    <div className="alerts-tab">
      {/* ── Log header ── */}
      <div className="alerts-log-header">
        <span className="alerts-log-header__file">// alerts.log</span>
        <span className="alerts-log-header__sep" />
        <span className="alerts-log-header__meta">
          {errors.length} error{errors.length !== 1 ? 's' : ''} · {warnings.length} warning{warnings.length !== 1 ? 's' : ''} · {new Date().toLocaleTimeString()}
        </span>
      </div>

      {/* ── Visual summary bar ── */}
      <div className="alerts-summary">
        <div className="alerts-summary__bar">
          {errors.length > 0 && (
            <div className="alerts-summary__bar-seg alerts-summary__bar-seg--error" style={{ flex: errors.length }} />
          )}
          {warnings.length > 0 && (
            <div className="alerts-summary__bar-seg alerts-summary__bar-seg--warn" style={{ flex: warnings.length }} />
          )}
        </div>
        <div className="alerts-summary__stats">
          <span className="alerts-summary__stat alerts-summary__stat--error">
            <span className="alerts-summary__dot alerts-summary__dot--error" />
            ✖ {errors.length} error{errors.length !== 1 ? 's' : ''}
            {total > 0 && <span className="alerts-summary__pct">({errPct}%)</span>}
          </span>
          <span className="alerts-summary__stat alerts-summary__stat--warn">
            <span className="alerts-summary__dot alerts-summary__dot--warn" />
            ⚠ {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
            {total > 0 && <span className="alerts-summary__pct">({warnPct}%)</span>}
          </span>
        </div>
      </div>

      {/* ── Log lines ── */}
      <div className="alerts-log">
        {[...errors, ...warnings].map((alert, i) => (
          <div key={i} className={`alerts-log-row alerts-log-row--${alert.severity}`}>
            <span className="alerts-log-row__ln">{String(i + 1).padStart(3, '0')}</span>
            <span className={`alerts-log-row__chip alerts-log-row__chip--${alert.severity}`}>
              {alert.severity === 'error' ? '✖ ERR' : '⚠ WRN'}
            </span>
            <span className="alerts-log-row__project">{alert.projectName}</span>
            <span className="alerts-log-row__arrow">→</span>
            <span className="alerts-log-row__msg">{alert.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
