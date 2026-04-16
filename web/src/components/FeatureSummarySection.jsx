/**
 * Module: web/src/components/FeatureSummarySection
 * Purpose: Collapsible list of feature sub-pipeline entries for a project card.
 *          Shows phase progress and verify status per feature. Collapsed by default.
 * @aitri-trace FR-ID: FR-012, US-ID: US-012, AC-ID: AC-025, TC-ID: TC-012f2
 */

import React, { useState } from 'react';

/**
 * Render a compact phase progress string: "3/5 phases"
 * @param {number[]} approvedPhases
 * @param {number} totalPhases
 * @returns {string}
 */
function phaseLabel(approvedPhases, totalPhases) {
  const approved = Array.isArray(approvedPhases) ? approvedPhases.length : 0;
  return `${approved}/${totalPhases} phases`;
}

/**
 * @param {{ featurePipelines: FeaturePipelineEntry[] }} props
 * @returns {JSX.Element | null}
 */
export default function FeatureSummarySection({ featurePipelines }) {
  const [expanded, setExpanded] = useState(false);

  if (!Array.isArray(featurePipelines) || featurePipelines.length === 0) return null;

  const count = featurePipelines.length;

  return (
    <div
      className="feature-summary"
      data-testid="feature-summary-section"
    >
      <button
        className="feature-summary__toggle"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        aria-controls="feature-summary-list"
        type="button"
      >
        <span className="feature-summary__chevron" aria-hidden="true">
          {expanded ? '▼' : '▶'}
        </span>
        <span>Features ({count})</span>
      </button>

      {expanded && (
        <ul
          id="feature-summary-list"
          className="feature-summary__list"
          role="list"
        >
          {featurePipelines.map(feature => (
            <li key={feature.name} className="feature-summary__item">
              <span className="feature-summary__name">{feature.name}</span>
              <span className="feature-summary__phases">
                {phaseLabel(feature.approvedPhases, feature.totalPhases ?? 5)}
              </span>
              <span className="feature-summary__verify">
                {feature.verifyStatus?.passed === true
                  ? <span className="color--healthy">✓ verified</span>
                  : feature.verifyStatus?.passed === false
                    ? <span className="color--error">✗ failed</span>
                    : <span className="color--dim">— not verified</span>
                }
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
