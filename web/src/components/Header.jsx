/**
 * Module: web/src/components/Header
 * Purpose: Page header — terminal title bar style. Dark mode only.
 *
 * @aitri-trace FR-ID: FR-019, US-ID: US-019, AC-ID: AC-023, TC-ID: TC-019h
 */

import React, { useState, useEffect } from 'react';

/* global __APP_VERSION__ */
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

function formatClock(date) {
  if (!date) return '--:--:--';
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatRelativeTime(date) {
  if (!date) return '—';
  const diffMs  = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1)  return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  return `${diffH}h ago`;
}

/**
 * @param {{
 *   loading: boolean,
 *   healthy: number,
 *   warning: number,
 *   error: number,
 *   projects: object[],
 *   lastUpdated: Date|null,
 *   onRefresh: () => void,
 *   isAdmin?: boolean,
 * }} props
 * @returns {JSX.Element}
 */
export default function Header({
  loading,
  healthy,
  warning,
  error,
  projects = [],
  lastUpdated,
  onRefresh,
  isAdmin = false,
}) {
  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 1_000);
    return () => clearInterval(id);
  }, []);

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="header">
      <div className="header__top">
        <div className="header__left">
          <div className="header__title">
            <span className="header__title-prefix">//</span>
            <span className="header__title-name">aitri-hub</span>
            <span className="header__version">v{VERSION}</span>
          </div>

          {!isAdmin && (
            <div className="header__subtitle">
              <span className="header__subtitle-key">status:</span>
              <span className="header__subtitle-brace">&nbsp;{'{'}&nbsp;</span>
              {loading ? (
                <span style={{ color: 'var(--syn-comment)' }}>loading…</span>
              ) : (
                <>
                  <span className="pill pill--healthy" data-testid="pill-healthy">
                    ✓ healthy:&nbsp;<strong>{healthy}</strong>
                  </span>
                  <span className="header__subtitle-sep">,&nbsp;</span>
                  <span className="pill pill--warning" data-testid="pill-warning">
                    ⚠ warning:&nbsp;<strong>{warning}</strong>
                  </span>
                  <span className="header__subtitle-sep">,&nbsp;</span>
                  <span className="pill pill--error" data-testid="pill-error">
                    ✖ error:&nbsp;<strong>{error}</strong>
                  </span>
                </>
              )}
              <span className="header__subtitle-brace">&nbsp;{'}'}</span>
            </div>
          )}

          {isAdmin && (
            <div className="header__subtitle">
              <span style={{ color: 'var(--syn-comment)' }}>// admin panel</span>
            </div>
          )}
        </div>

        <div className="header__right">
          <span className="header__timestamp" aria-label="Current time">
            {clock}
          </span>
          {lastUpdated && !isAdmin && (
            <span className="header__timestamp" aria-label="Last data refresh time">
              · {formatRelativeTime(lastUpdated)}
            </span>
          )}
          {!isAdmin && (
            <button
              className="icon-btn"
              onClick={onRefresh}
              title="Refresh data now"
              aria-label="Refresh dashboard data"
            >
              [↻]
            </button>
          )}
          {!isAdmin ? (
            <a
              href="/admin"
              className="icon-btn"
              title="Open admin panel"
              aria-label="Open admin panel"
              onClick={e => {
                e.preventDefault();
                window.history.pushState({}, '', '/admin');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              [⚙]
            </a>
          ) : (
            <a
              href="/"
              className="icon-btn"
              title="Back to dashboard"
              aria-label="Back to dashboard"
              onClick={e => {
                e.preventDefault();
                window.history.pushState({}, '', '/');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              [←]
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
