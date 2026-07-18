/**
 * Epic 3 — Artifacts explorer (FR-015 UI). Unit TCs for ArtifactsExplorer.
 * TC-015f: explorer with no selection shows the reader empty state.
 * TC-015e: re-selecting an open file toggles the reader closed.
 * (Tree grouping/glyph = TC-015h and content/JSON/traversal = the TC-016, JSON and
 *  PATH cases are covered at the endpoint level in tests/integration/artifact-content.test.js.)
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import ArtifactsExplorer from '../components/ArtifactsExplorer.jsx';

const TREE = [
  { phase: 1, label: 'Requirements', status: 'approved', glyph: '✓',
    files: [{ technicalName: '01_REQUIREMENTS.json', kind: 'json', status: 'approved', size: 120, mtime: Date.now() }] },
  { phase: 2, label: 'Architecture', status: 'empty', glyph: '∅', files: [] },
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('FR-015 — Artifacts explorer', () => {
  it('TC-015f: explorer with nothing selected shows the reader empty state', () => {
    // @aitri-tc TC-015f
    render(<ArtifactsExplorer id="p1" tree={TREE} scope="product" />);
    expect(screen.getByTestId('reader-empty')).toHaveTextContent(/select a file to read/i);
    // The empty phase renders an explicit empty row, not omitted (AC-015-4).
    expect(screen.getByTestId('artifact-empty-phase')).toBeInTheDocument();
    // Product name is the primary label, technical name the secondary (FR-019).
    expect(screen.getByText('PRD — Product Requirements')).toBeInTheDocument();
    expect(screen.getByText('01_REQUIREMENTS.json')).toBeInTheDocument();
  });

  it('TC-015e: re-selecting an open file toggles the reader closed', async () => {
    // @aitri-tc TC-015e
    global.fetch = vi.fn(() => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ kind: 'json', parsed: { a: 1 }, meta: {} }),
    }));
    render(<ArtifactsExplorer id="p1" tree={TREE} scope="product" />);

    const file = screen.getByTestId('artifact-file');
    fireEvent.click(file);
    await waitFor(() => expect(screen.getByTestId('json-view')).toBeInTheDocument());
    expect(screen.queryByTestId('reader-empty')).not.toBeInTheDocument();

    // Click the same file again → reader closes (toggle), nothing active.
    fireEvent.click(file);
    await waitFor(() => expect(screen.getByTestId('reader-empty')).toBeInTheDocument());
    expect(screen.queryByTestId('json-view')).not.toBeInTheDocument();
    expect(file.className).not.toMatch(/active/);
  });
});
