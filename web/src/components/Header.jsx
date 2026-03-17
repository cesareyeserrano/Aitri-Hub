/**
 * Module: web/src/components/Header
 * Purpose: Page header — terminal title bar style with code comment syntax.
 * @aitri-trace FR-ID: FR-006, TC-ID: TC-006h
 */

import React, { useState, useEffect, useCallback } from 'react';

/* global __APP_VERSION__ */
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/**
 * Format a Date into HH:MM:SS clock string.
 * @param {Date|null} date
 * @returns {string}
 */
function formatClock(date) {
  if (!date) return '--:--:--';
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Format a Date object into a human-readable "X min ago" / "X h ago" string.
 * @param {Date|null} date
 * @returns {string}
 */
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
}) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('aitri-theme') ?? 'dark';
    } catch {
      return 'dark';
    }
  });

  const [clock, setClock] = useState(() => formatClock(new Date()));

  // Apply theme to html element on mount + whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('aitri-theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Tick clock every second
  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 1_000);
    return () => clearInterval(id);
  }, []);

  // Rerender relative timestamp every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="header">
      <div className="header__top">
        {/* Left: // aitri-hub  v0.1.0 */}
        <div className="header__left">
          <div className="header__title">
            <span className="header__title-prefix">//</span>
            <span className="header__title-name">aitri-hub</span>
            <span className="header__version">v{VERSION}</span>
          </div>

          {/* status: { healthy: N, warning: N, error: N } */}
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
        </div>

        {/* Right: timestamp + controls */}
        <div className="header__right">
          <span className="header__timestamp" aria-label="Current time">
            {clock}
          </span>
          {lastUpdated && (
            <span className="header__timestamp" aria-label="Last data refresh time">
              · {formatRelativeTime(lastUpdated)}
            </span>
          )}
          <button
            className="icon-btn"
            onClick={onRefresh}
            title="Refresh data now"
            aria-label="Refresh dashboard data"
          >
            [↻]
          </button>
          <button
            className="icon-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            aria-label="Toggle color theme"
          >
            {theme === 'dark' ? '[◑]' : '[◐]'}
          </button>
        </div>
      </div>
    </header>
  );
}
