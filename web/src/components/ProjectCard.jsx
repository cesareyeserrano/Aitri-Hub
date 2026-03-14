/**
 * Module: web/src/components/ProjectCard
 * Purpose: Display all collected metrics for one project — code block / file panel style.
 * @aitri-trace FR-ID: FR-006, US-ID: US-006, AC-ID: AC-010, TC-ID: TC-006h
 */

import React from 'react';
import PhaseProgress from './PhaseProgress.jsx';
import AlertBadge from './AlertBadge.jsx';
import ProgressBar from './ProgressBar.jsx';

/**
 * Format commit age in hours to human-readable string.
 * @param {number | null | undefined} hours
 * @returns {string}
 */
function formatAge(hours) {
  if (hours === null || hours === undefined) return 'N/A';
  if (hours < 1)   return `${Math.round(hours * 60)}m ago`;
  if (hours < 48)  return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/**
 * Return a CSS color modifier class based on commit age in hours.
 * @param {number | null | undefined} hours
 * @returns {string}
 */
function ageColorClass(hours) {
  if (hours === null || hours === undefined) return 'color--dim';
  if (hours < 24)  return 'color--healthy';
  if (hours <= 72) return 'color--warning';
  return 'color--error';
}

/**
 * Format test summary for display.
 * @param {object | null} ts
 * @returns {{ label: string, pct: number, indicator: string }}
 */
function formatTests(ts) {
  if (!ts || !ts.available) return { label: 'N/A', pct: 0, indicator: '' };
  const { passed, total, failed } = ts;
  const pct       = total > 0 ? Math.round((passed / total) * 100) : 0;
  const label     = `${passed}/${total} (${pct}%)`;
  const indicator = failed > 0 ? '✗' : total === 0 ? '' : '✓';
  return { label, pct, indicator, failed, total, passed };
}

/**
 * @param {{ project: object, animationDelay?: number }} props
 * @returns {JSX.Element}
 */
const EVENT_COLOR = {
  approved:  'var(--syn-green)',
  completed: 'var(--syn-teal)',
  rejected:  'var(--syn-red)',
};

function lastEventLabel(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  const ev = events[events.length - 1];
  if (!ev || !ev.at) return null;
  const diff = Date.now() - new Date(ev.at).getTime();
  const m = Math.floor(diff / 60_000);
  const age = m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
  return { label: ev.event, phase: ev.phase, age, color: EVENT_COLOR[ev.event] ?? 'var(--syn-comment)' };
}

export default function ProjectCard({ project, animationDelay = 0 }) {
  const {
    name,
    status,
    aitriState,
    gitMeta,
    testSummary,
    alerts,
    collectionError,
  } = project;

  const isStalled        = (gitMeta?.lastCommitAgeHours ?? 0) > 72;
  const tests            = formatTests(testSummary);
  const lastEvent        = lastEventLabel(aitriState?.events);
  const complianceSummary = project.complianceSummary ?? null;

  return (
    <div
      className="card"
      data-status={status}
      data-testid="project-card"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* ── Card header: // project-name ────────── */}
      <div className="card__header">
        <span className="card__name" title={name}>{name}</span>
        <div className="card__header-right">
          <span
            className={`status-badge status-badge--${status}`}
            data-testid="status-badge"
          >
            {status === 'healthy' ? '✓ ' : status === 'warning' ? '⚠ ' : status === 'error' ? '✖ ' : '? '}
            {status === 'unreadable' ? 'UNREADABLE' : status.toUpperCase()}
          </span>
          {isStalled && (
            <span className="stalled-badge">STALLED</span>
          )}
        </div>
      </div>

      <hr className="card__divider" />

      {/* ── Unreadable state ──────────────────────── */}
      {status === 'unreadable' ? (
        <div
          className="field__value field__value--dim"
          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '12px' }}
        >
          <span style={{ color: 'var(--syn-comment)' }}>// </span>
          {collectionError ?? '.aitri not found or malformed'}
        </div>
      ) : (
        <>
          {/* ── Phase progress ────────────────────── */}
          <PhaseProgress aitriState={aitriState ?? null} />

          {/* ── Compliance badge (Phase 5 only) ───── */}
          {complianceSummary?.available && (() => {
            const s = complianceSummary.overallStatus;
            const cfg = s === 'compliant'
              ? { color: 'var(--syn-green)',   icon: '✓', label: 'COMPLIANT' }
              : s === 'partial'
              ? { color: 'var(--syn-yellow)',  icon: '⚠', label: 'PARTIAL'   }
              : { color: 'var(--syn-comment)', icon: '·', label: 'DRAFT'     };
            return (
              <div className="compliance-badge" style={{ borderColor: cfg.color }}>
                <span style={{ color: cfg.color }}>{cfg.icon}</span>
                <span className="compliance-badge__label" style={{ color: cfg.color }}>
                  {cfg.label}
                </span>
                <span className="compliance-badge__detail">
                  {complianceSummary.levels.production_ready}/{complianceSummary.total} production_ready
                </span>
              </div>
            );
          })()}

          <hr className="card__divider" />

          {/* ── Metrics ──────────────────────────── */}
          <div className="card__fields">

            {/* Tests */}
            <div className="metric-row">
              <span className="metric-row__icon">◉</span>
              <span className="metric-row__label">tests</span>
              <span
                className={`metric-row__value ${
                  tests.failed > 0 ? 'color--error' : tests.label === 'N/A' ? 'color--dim' : ''
                }`}
              >
                {tests.label}
              </span>
              {tests.indicator && (
                <span
                  className={`metric-row__indicator ${
                    tests.failed > 0 ? 'color--error' : 'color--healthy'
                  }`}
                >
                  {tests.indicator}
                </span>
              )}
            </div>
            {testSummary?.available && (testSummary.total ?? 0) > 0 && (
              <div style={{ paddingLeft: '22px', paddingBottom: '2px' }}>
                <ProgressBar value={testSummary.passed} max={testSummary.total} label="Test progress" />
              </div>
            )}

            {/* Last commit */}
            <div className="metric-row">
              <span className="metric-row__icon">⊙</span>
              <span className="metric-row__label">commit</span>
              <span
                className={`metric-row__value ${ageColorClass(gitMeta?.lastCommitAgeHours)}`}
              >
                {formatAge(gitMeta?.lastCommitAgeHours)}
                {!isStalled && gitMeta?.branch && (
                  <span style={{ display: 'block', color: 'var(--syn-comment)', fontSize: '11px' }}>
                    {gitMeta.branch}
                  </span>
                )}
              </span>
            </div>

            {/* Branch */}
            <div className="metric-row">
              <span className="metric-row__icon">⎇</span>
              <span className="metric-row__label">branch</span>
              <span className="metric-row__value color--info">
                {gitMeta?.branch ?? 'N/A'}
              </span>
            </div>

            {/* Velocity */}
            <div className="metric-row">
              <span className="metric-row__icon">⚡</span>
              <span className="metric-row__label">velocity</span>
              <span className="metric-row__value" style={{ color: 'var(--syn-teal)' }}>
                {gitMeta?.commitVelocity7d != null
                  ? `${gitMeta.commitVelocity7d} commits/7d`
                  : 'N/A'}
              </span>
            </div>
          </div>

          {/* ── Last pipeline event ───────────────── */}
          {lastEvent && (
            <div className="metric-row" style={{ marginTop: '2px' }}>
              <span className="metric-row__icon" style={{ color: lastEvent.color }}>◎</span>
              <span className="metric-row__label">last event</span>
              <span className="metric-row__value metric-row__last-event">
                <span style={{ color: lastEvent.color }}>{lastEvent.label}</span>
                {' '}phase {lastEvent.phase} · {lastEvent.age}
              </span>
            </div>
          )}

          {/* ── Alerts footer ─────────────────────── */}
          <AlertBadge alerts={alerts} />
        </>
      )}
    </div>
  );
}
