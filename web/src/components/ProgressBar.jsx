/**
 * Module: web/src/components/ProgressBar
 * Purpose: Slim 4px progress bar with threshold-based syntax-highlight coloring.
 * @aitri-trace FR-ID: FR-006
 */

import React, { useState, useEffect } from 'react';

/**
 * Determine CSS modifier class based on percentage value.
 * Thresholds: 0–30% red, 30–60% orange, 60–85% teal, 85–100% green.
 * @param {number} pct  0–100
 * @returns {string}
 */
function colorClass(pct) {
  if (pct < 30) return 'progress-bar-fill--red';
  if (pct < 60) return 'progress-bar-fill--yellow';
  if (pct < 85) return 'progress-bar-fill--light';
  return 'progress-bar-fill--green';
}

/**
 * @param {{
 *   value: number,
 *   max: number,
 *   label?: string,
 *   showLabel?: boolean
 * }} props
 * @returns {JSX.Element}
 */
export default function ProgressBar({ value, max, label, showLabel = false }) {
  const [mounted, setMounted] = useState(false);

  // Animate width from 0 on first render
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const safePct    = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const displayPct = mounted ? safePct : 0;

  return (
    <div>
      <div
        className="progress-bar-wrap"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className={`progress-bar-fill ${colorClass(safePct)}`}
          style={{ width: `${displayPct}%` }}
        />
      </div>
      {showLabel && (
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--syn-comment)',
            marginTop: '3px',
            display: 'block',
          }}
        >
          {label ?? `${value} / ${max}`}
        </span>
      )}
    </div>
  );
}
