/**
 * Tests: web graph tab components (static analysis / file-based)
 * Covers: TC-010h, TC-016h
 *
 * @aitri-trace FR-ID: FR-010, FR-016, TC-ID: TC-010h, TC-016h
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WEB  = path.join(ROOT, 'web', 'src');

// ── TC-010h: Graph tab is registered in App.jsx as 7th tab ───────────────────

describe('TC-010h: App.jsx — graph.ts tab exists as 7th tab', () => {
  let appSrc;

  it('App.jsx contains GRAPH tab identifier', () => {
    appSrc = fs.readFileSync(path.join(WEB, 'App.jsx'), 'utf8');
    assert.ok(appSrc.includes("GRAPH:     'graph'"), 'GRAPH tab identifier missing from TABS constant');
  });

  it('App.jsx imports GraphTab component', () => {
    assert.ok(appSrc.includes("import GraphTab from './components/GraphTab.jsx'"), 'GraphTab import missing');
  });

  it('App.jsx renders graph.ts tab button', () => {
    assert.ok(appSrc.includes('graph.ts'), 'graph.ts tab button label missing');
  });

  it('App.jsx renders GraphTab panel', () => {
    assert.ok(appSrc.includes('<GraphTab'), 'GraphTab panel missing from main render');
  });
});

// ── TC-016h: GraphLegend component renders all status and shape items ─────────

describe('TC-016h: GraphLegend.jsx — renders all legend items', () => {
  let src;

  it('GraphLegend.jsx file exists', () => {
    const filePath = path.join(WEB, 'components', 'GraphLegend.jsx');
    assert.ok(fs.existsSync(filePath), 'GraphLegend.jsx does not exist');
    src = fs.readFileSync(filePath, 'utf8');
  });

  it('legend includes approved status', () => {
    assert.ok(src.includes('approved'), 'approved status missing from legend');
  });

  it('legend includes active status', () => {
    assert.ok(src.includes('active'), 'active status missing from legend');
  });

  it('legend includes drift status', () => {
    assert.ok(src.includes('drift'), 'drift status missing from legend');
  });

  it('legend includes pending status', () => {
    assert.ok(src.includes('pending'), 'pending status missing from legend');
  });

  it('legend includes FR shape item', () => {
    assert.ok(src.includes('FR'), 'FR shape item missing from legend');
  });

  it('legend includes TC shape item', () => {
    assert.ok(src.includes('TC'), 'TC shape item missing from legend');
  });

  it('uses aria-label for accessibility', () => {
    assert.ok(src.includes('aria-label'), 'aria-label missing from GraphLegend');
  });
});

// ── GraphTab.jsx structural checks ────────────────────────────────────────────

describe('GraphTab.jsx — structural requirements', () => {
  let src;

  it('GraphTab.jsx file exists', () => {
    const filePath = path.join(WEB, 'components', 'GraphTab.jsx');
    assert.ok(fs.existsSync(filePath), 'GraphTab.jsx does not exist');
    src = fs.readFileSync(filePath, 'utf8');
  });

  it('uses dynamic import for cytoscape (lazy load)', () => {
    assert.ok(src.includes("import('cytoscape')"), 'Cytoscape must be dynamically imported');
  });

  it('uses dynamic import for cytoscape-dagre', () => {
    assert.ok(src.includes("import('cytoscape-dagre')"), 'cytoscape-dagre must be dynamically imported');
  });

  it('renders empty state when no spec artifacts', () => {
    assert.ok(src.includes('empty-state'), 'empty-state missing from GraphTab');
  });

  it('graphNormalizer.js exists', () => {
    const filePath = path.join(WEB, 'lib', 'graphNormalizer.js');
    assert.ok(fs.existsSync(filePath), 'graphNormalizer.js does not exist');
  });
});
