/**
 * Epic 2 — Detail navigation integration (jsdom).
 * TC-012e: browser-back returns to Monitor preserving the prior filter.
 * TC-012f: a removed/unknown project id renders the not-found panel (no crash).
 * Exercises the real App + navigate.js (History API) + MonitorView + DetailView.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import App from '../App.jsx';

function mockFetch(projects) {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    if (u.includes('/data/dashboard.json')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ projects }) });
    }
    // On-demand detail endpoint (only hit by artifact/QA sections; harmless default).
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ project: {}, artifacts: {}, testCases: {}, bugs: {} }) });
  });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FR-012 — Detail navigation', () => {
  it('TC-012e: browser Back returns to Monitor with the prior filter preserved', async () => {
    // @aitri-tc TC-012e
    mockFetch([
      { id: 'a', name: 'Alpha', status: 'error', aitriState: {} },   // → CRITICAL
      { id: 'b', name: 'Bravo', status: 'healthy', aitriState: {} },  // → NOMINAL
    ]);

    render(<App />);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());

    // Apply the CRITICAL filter — it is mirrored into the URL and hides NOMINAL cards.
    fireEvent.click(screen.getByRole('button', { name: /CRITICAL/i }));
    expect(window.location.search).toBe('?filter=CRITICAL');
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();

    // Open Alpha's detail (History pushState — no full reload).
    fireEvent.click(screen.getByRole('button', { name: /open detail/i }));
    await waitFor(() => expect(screen.getByTestId('detail-view')).toBeInTheDocument());
    expect(window.location.pathname).toBe('/project/a');

    // Browser Back → Monitor. jsdom traverses session history and fires popstate.
    window.history.back();

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    // Monitor is back (detail gone) and the CRITICAL filter is still applied.
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());
    expect(screen.queryByTestId('detail-view')).not.toBeInTheDocument();
    expect(window.location.search).toBe('?filter=CRITICAL');
    expect(screen.queryByText('Bravo')).not.toBeInTheDocument();
  });

  it('TC-012f: detail for a removed project id shows the not-found panel, no crash', async () => {
    // @aitri-tc TC-012f
    mockFetch([{ id: 'a', name: 'Alpha', status: 'healthy', aitriState: {} }]);
    window.history.replaceState({}, '', '/project/ghost');

    render(<App />);

    await waitFor(() => expect(screen.getByTestId('detail-notfound')).toBeInTheDocument());
    expect(screen.getByText(/project not found/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to monitor/i })).toBeInTheDocument();
  });
});
