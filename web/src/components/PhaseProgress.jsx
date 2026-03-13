/**
 * Module: web/src/components/PhaseProgress
 * Purpose: Render a phase progress section with animated progress bar.
 * @aitri-trace FR-ID: FR-006, TC-ID: TC-006h
 */

import React from 'react';
import ProgressBar from './ProgressBar.jsx';

const TOTAL_PHASES = 5;

/**
 * @param {{ aitriState: object | null }} props
 * @returns {JSX.Element}
 */
export default function PhaseProgress({ aitriState }) {
  if (!aitriState) {
    return (
      <div className="phase-section" data-testid="phase-progress">
        <div className="phase-section__label">
          <span className="phase-section__text">Phase</span>
          <span className="phase-section__value field__value--dim">N/A</span>
        </div>
        <ProgressBar value={0} max={TOTAL_PHASES} label="Phase progress" />
      </div>
    );
  }

  const currentPhase  = aitriState.currentPhase ?? 0;
  const approved      = aitriState.approvedPhases?.length ?? 0;
  const verifyPassed  = aitriState.verifyPassed === true;

  return (
    <div className="phase-section" data-testid="phase-progress">
      <div className="phase-section__label">
        <span className="phase-section__text">Phase Progress</span>
        <span className="phase-section__value">
          Phase {currentPhase} of {TOTAL_PHASES}
          {verifyPassed ? ' ✓' : ''}
        </span>
      </div>
      <ProgressBar
        value={approved}
        max={TOTAL_PHASES}
        label={`${approved} of ${TOTAL_PHASES} phases approved`}
      />
    </div>
  );
}
