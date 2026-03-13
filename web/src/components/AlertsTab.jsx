/**
 * Module: web/src/components/AlertsTab
 * Purpose: Consolidated alerts view — log file / terminal style.
 * @aitri-trace FR-ID: FR-007
 */

import React from 'react';

/**
 * @param {{ projects: object[] }} props
 * @returns {JSX.Element}
 */
export default function AlertsTab({ projects }) {
  // Collect all alerts with their parent project name
  const allAlerts = projects.flatMap(p =>
    (p.alerts ?? []).map(alert => ({ ...alert, projectName: p.name })),
  );

  const errors   = allAlerts.filter(a => a.severity === 'error');
  const warnings = allAlerts.filter(a => a.severity === 'warning');

  const timestamp = new Date().toISOString();

  if (allAlerts.length === 0) {
    return (
      <div className="alerts-tab">
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--syn-comment)',
            marginBottom: 'var(--space-3)',
          }}
        >
          // alerts.log
          <span style={{ color: 'var(--text-muted)', marginLeft: '1ch' }}>
            ─────────────────────────────────────────────────────
          </span>
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--syn-comment)',
            marginBottom: 'var(--space-4)',
          }}
        >
          // 0 warnings · 0 errors · {timestamp}
        </div>
        <div className="alerts-empty">
          no critical issues — all projects look healthy.
        </div>
      </div>
    );
  }

  return (
    <div className="alerts-tab">
      {/* Log file header */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--syn-comment)',
          marginBottom: 'var(--space-1)',
        }}
      >
        // alerts.log
        <span style={{ color: 'var(--text-muted)', marginLeft: '1ch' }}>
          ─────────────────────────────────────────────────────
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          color: 'var(--syn-comment)',
          marginBottom: 'var(--space-5)',
        }}
      >
        // {warnings.length} warning{warnings.length !== 1 ? 's' : ''} · {errors.length} error{errors.length !== 1 ? 's' : ''} · {timestamp}
      </div>

      {errors.length > 0 && (
        <div className="alert-group">
          <div className="alert-group__header">
            <span className="alert-group__title alert-group__title--error">[ERROR]</span>
            <span className="alert-group__count alert-group__count--error">
              {errors.length}
            </span>
          </div>
          {errors.map((alert, i) => (
            <div key={i} className="alert-row alert-row--error">
              <span className="alert-row__project">{alert.projectName}</span>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
              <span className="alert-row__message">{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="alert-group">
          <div className="alert-group__header">
            <span className="alert-group__title alert-group__title--warning">[WARN]</span>
            <span className="alert-group__count alert-group__count--warning">
              {warnings.length}
            </span>
          </div>
          {warnings.map((alert, i) => (
            <div key={i} className="alert-row alert-row--warning">
              <span className="alert-row__project">{alert.projectName}</span>
              <span style={{ color: 'var(--text-muted)' }}>→</span>
              <span className="alert-row__message">{alert.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
