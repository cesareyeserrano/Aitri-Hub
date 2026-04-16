/**
 * Tests for IntegrationAlertBanner component
 * @aitri-trace FR-ID: FR-012, US-ID: US-012, AC-ID: AC-024
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import IntegrationAlertBanner from '../components/IntegrationAlertBanner.jsx';

const ALERT_FIXTURE = {
  severity: 'warning',
  message: 'Aitri CLI v0.1.80 detected. This Hub was last reviewed against v0.1.76.',
  changelogUrl: 'https://example.com/CHANGELOG.md',
};

// @aitri-tc TC-012h3
it('TC-012h3: IntegrationAlertBanner renders banner with message and link when alert is non-null', () => {
  render(<IntegrationAlertBanner alert={ALERT_FIXTURE} />);

  const banner = screen.getByTestId('integration-alert-banner');
  expect(banner).toBeInTheDocument();
  expect(banner).toHaveAttribute('role', 'alert');
  expect(screen.getByText(ALERT_FIXTURE.message)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /view changelog/i })).toBeInTheDocument();
});

// @aitri-tc TC-012e1
it('TC-012e1: IntegrationAlertBanner renders nothing when data has no integrationAlert (null)', () => {
  // Simulates dashboard.json with integrationAlert: null — no CLI alert line rendered
  const { container } = render(<IntegrationAlertBanner alert={null} />);
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

// @aitri-tc TC-012f2
it('TC-012f2: IntegrationAlertBanner is absent when alert prop is null', () => {
  const { container } = render(<IntegrationAlertBanner alert={null} />);
  expect(container).toBeEmptyDOMElement();
});

it('TC-012f2: IntegrationAlertBanner is absent when alert prop is undefined', () => {
  const { container } = render(<IntegrationAlertBanner />);
  expect(container).toBeEmptyDOMElement();
});
