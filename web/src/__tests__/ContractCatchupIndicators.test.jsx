/**
 * Tests for the contract-catchup rc.159 inline indicators:
 * BugBadge unknown state (FR-044) + results-unbound line (FR-045).
 * @aitri-trace FR-ID: FR-044, FR-045, US-ID: US-044, US-045, AC-ID: AC-0441, AC-0451
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BugBadge from '../components/BugBadge.jsx';
import ProjectCard from '../components/ProjectCard.jsx';

const baseProject = {
  name: 'p1',
  status: 'healthy',
  aitriState: {
    currentPhase: 5,
    approvedPhases: [1, 2, 3, 4, 5],
    completedPhases: [1, 2, 3, 4, 5],
    verifyPassed: true,
    driftPhases: [],
    events: [],
    features: [],
    artifactsDir: 'spec',
    aitriVersion: '2.0.0-rc.159',
    projectName: 'p1',
  },
  gitMeta: null,
  alerts: [],
  collectionError: null,
  appVersion: null,
  nextActions: [],
  health: {},
  audit: { exists: true, stalenessDays: 1 },
  normalize: {},
  lastSession: null,
  degradationReason: null,
  testSummary: { available: true, passed: 9, failed: 0, skipped: 0, total: 9 },
};

// @aitri-tc TC-044h (UI half)
it('TC-044h-ui: BugBadge renders the unknown "?" pill when parseErrors present', () => {
  render(<BugBadge bugsSummary={{ open: 0, parseErrors: ['root'] }} />);
  const pill = screen.getByText('? bugs');
  expect(pill).toBeInTheDocument();
  expect(pill).toHaveAttribute('title', expect.stringContaining('NOT counted'));
});

// @aitri-tc TC-044e (UI half)
it('TC-044e-ui: BugBadge renders nothing for zero bugs without parseErrors', () => {
  const { container } = render(<BugBadge bugsSummary={{ open: 0 }} />);
  expect(container.firstChild).toBeNull();
});

// @aitri-tc TC-045h (UI half)
it('TC-045h-ui: ProjectCard shows the results-unbound warning line', () => {
  render(<ProjectCard project={{ ...baseProject, resultsBinding: 'no-stamp' }} />);
  const indicator = screen.getByTestId('results-unbound-indicator');
  expect(indicator).toBeInTheDocument();
  expect(indicator).toHaveTextContent(/not bound to a verify run/i);
});

// @aitri-tc TC-045e (UI half)
it('TC-045e-ui: no indicator when resultsBinding is absent or bound', () => {
  const { rerender } = render(<ProjectCard project={baseProject} />);
  expect(screen.queryByTestId('results-unbound-indicator')).toBeNull();
  rerender(<ProjectCard project={{ ...baseProject, resultsBinding: 'bound' }} />);
  expect(screen.queryByTestId('results-unbound-indicator')).toBeNull();
});
