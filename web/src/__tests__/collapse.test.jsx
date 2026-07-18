/**
 * UI enhancement guard — expand/collapse of content-section groups:
 * JSON reader nodes, Artifacts phase folders, and Test-Case FR groups.
 * (Not a spec TC — a regression guard for the collapsible affordance.)
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { JsonView } from '../lib/jsonView.jsx';
import ArtifactsExplorer from '../components/ArtifactsExplorer.jsx';
import QaTestCases from '../components/QaTestCases.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('collapsible content groups', () => {
  it('JSON view: a nested object collapses and expands', () => {
    render(<JsonView data={{ meta: { a: 1, b: 2 } }} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /meta/i }));
    expect(screen.queryByText('1')).not.toBeInTheDocument(); // collapsed
    fireEvent.click(screen.getByRole('button', { name: /meta/i }));
    expect(screen.getByText('1')).toBeInTheDocument(); // expanded again
  });

  it('Artifacts: a phase folder collapses its files', () => {
    const tree = [{ phase: 1, label: 'Requirements', status: 'approved', glyph: '✓',
      files: [{ technicalName: '01_REQUIREMENTS.json', kind: 'json', status: 'approved', size: 10, mtime: Date.now() }] }];
    render(<ArtifactsExplorer id="p1" tree={tree} scope="product" />);
    expect(screen.getByTestId('artifact-file')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('artifact-folder-toggle'));
    expect(screen.queryByTestId('artifact-file')).not.toBeInTheDocument();
  });

  it('Test Cases: an FR group collapses its rows', () => {
    const testCases = { available: true, cases: [
      { id: 'TC-1', title: 't', automation: 'manual', status: 'pending', requirement_id: 'FR-1' },
    ] };
    render(<QaTestCases id="p1" testCases={testCases} />);
    expect(screen.getByTestId('tc-row')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('qa-group-toggle'));
    expect(screen.queryByTestId('tc-row')).not.toBeInTheDocument();
  });
});
