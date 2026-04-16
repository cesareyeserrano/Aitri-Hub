/**
 * Tests for FeatureSummarySection component
 * @aitri-trace FR-ID: FR-012, US-ID: US-012, AC-ID: AC-025
 */

import { it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FeatureSummarySection from '../components/FeatureSummarySection.jsx';

const SAMPLE_FEATURES = [
  {
    name: 'integration-last-reviewed-gate',
    approvedPhases: [1, 2, 3, 4, 5],
    currentPhase: 5,
    totalPhases: 5,
    tcCount: 30,
    verifyStatus: { passed: true, summary: null },
  },
  {
    name: 'another-feature',
    approvedPhases: [1, 2],
    currentPhase: 2,
    totalPhases: 5,
    tcCount: 12,
    verifyStatus: null,
  },
];

// @aitri-tc TC-012h2
it('TC-012h2: FeatureSummarySection renders toggle button and section when featurePipelines is non-empty', () => {
  render(<FeatureSummarySection featurePipelines={SAMPLE_FEATURES} />);

  const section = screen.getByTestId('feature-summary-section');
  expect(section).toBeInTheDocument();

  const toggle = screen.getByRole('button', { name: /features/i });
  expect(toggle).toBeInTheDocument();
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

it('TC-012h2: FeatureSummarySection expands to show feature entries with phase data when toggled', () => {
  render(<FeatureSummarySection featurePipelines={SAMPLE_FEATURES} />);

  const toggle = screen.getByRole('button', { name: /features/i });
  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('integration-last-reviewed-gate')).toBeInTheDocument();
  expect(screen.getByText('another-feature')).toBeInTheDocument();
  expect(screen.getByText('5/5 phases')).toBeInTheDocument();
  expect(screen.getByText('2/5 phases')).toBeInTheDocument();
});

// @aitri-tc TC-012f
it('TC-012f: FeatureSummarySection is absent when featurePipelines is empty array', () => {
  const { container } = render(<FeatureSummarySection featurePipelines={[]} />);
  expect(container).toBeEmptyDOMElement();
});

it('TC-012f: FeatureSummarySection is absent when featurePipelines is undefined', () => {
  const { container } = render(<FeatureSummarySection />);
  expect(container).toBeEmptyDOMElement();
});

it('TC-012f: FeatureSummarySection is absent when featurePipelines is null', () => {
  const { container } = render(<FeatureSummarySection featurePipelines={null} />);
  expect(container).toBeEmptyDOMElement();
});

// @aitri-tc TC-NFR012
it('TC-NFR012: FeatureSummarySection is collapsed by default (feature list items not visible)', () => {
  render(<FeatureSummarySection featurePipelines={SAMPLE_FEATURES} />);
  expect(screen.queryByText('integration-last-reviewed-gate')).not.toBeInTheDocument();
});
