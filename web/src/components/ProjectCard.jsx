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

  const isStalled = (gitMeta?.lastCommitAgeHours ?? 0) > 72;
  const tests     = formatTests(testSummary);

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

          <hr className="card__divider" />

          {/* ── Metrics ──────────────────────────── */}
          <div className="card__fields">

            {/* Tests */}
            <div className="metric-row">
              <span className="metric-row__icon" />
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

            {/* Last commit */}
            <div className="metric-row">
              <span className="metric-row__icon" />
              <span className="metric-row__label">commit</span>
              <span
                className={`metric-row__value ${ageColorClass(gitMeta?.lastCommitAgeHours)}`}
              >
                {formatAge(gitMeta?.lastCommitAgeHours)}
                {gitMeta?.branch ? <span style={{ color: 'var(--syn-comment)' }}> · {gitMeta.branch}</span> : null}
              </span>
            </div>

            {/* Branch */}
            <div className="metric-row">
              <span className="metric-row__icon" />
              <span className="metric-row__label">branch</span>
              <span className="metric-row__value color--info">
                {gitMeta?.branch ?? 'N/A'}
              </span>
            </div>

            {/* Velocity */}
            <div className="metric-row">
              <span className="metric-row__icon" />
              <span className="metric-row__label">velocity</span>
              <span className="metric-row__value" style={{ color: 'var(--syn-teal)' }}>
                {gitMeta?.commitVelocity7d != null
                  ? `${gitMeta.commitVelocity7d} commits/7d`
                  : 'N/A'}
              </span>
            </div>
          </div>

          {/* ── Alerts footer ─────────────────────── */}
          <AlertBadge alerts={alerts} />
        </>
      )}
    </div>
  );
}
