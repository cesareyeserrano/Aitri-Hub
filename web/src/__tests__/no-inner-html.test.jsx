/**
 * Tests: XSS invariant — no dangerouslySetInnerHTML in the QA-Workspace feature.
 * @aitri-trace FR-ID: NFR-052, US-ID: US-052, AC-ID: AC-0521, TC-ID: TC-152f
 *
 * ADR-Q2 chose a React-element markdown renderer precisely so raw HTML never
 * reaches the DOM. This pins the invariant so a future refactor cannot quietly
 * reintroduce dangerouslySetInnerHTML in the feature's source.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FEATURE_FILES = [
  'lib/markdown.jsx',
  'lib/detailApi.js',
  'lib/navigate.js',
  'lib/health.js',
  'views/DetailView.jsx',
  'views/tabs/SummaryTab.jsx',
  'views/tabs/TestCasesTab.jsx',
  'views/tabs/TraceabilityTab.jsx',
  'views/tabs/BugsTab.jsx',
  'views/tabs/ArtifactsTab.jsx',
  'components/EmptyState.jsx',
];

describe('TC-152f: no dangerouslySetInnerHTML in the feature source', () => {
  it('none of the QA-Workspace files use dangerouslySetInnerHTML', () => {
    // Match ACTUAL usage (JSX prop / object key), not a prose mention in a
    // comment — the renderer's header documents that it deliberately avoids it.
    const usageRe = /dangerouslySetInnerHTML\s*[=:]/;
    const offenders = FEATURE_FILES.filter(f =>
      usageRe.test(fs.readFileSync(path.join(srcRoot, f), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
