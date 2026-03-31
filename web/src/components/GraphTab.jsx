/**
 * Component: GraphTab
 * Purpose: 7th dashboard tab — renders the spec artifact DAG via Cytoscape.js.
 *          Cytoscape is dynamically imported on first activation to avoid bloating the
 *          initial page load bundle.
 *
 * @aitri-trace FR-ID: FR-015, FR-016, US-ID: US-015, US-016, AC-ID: AC-030, AC-032, TC-ID: TC-015h, TC-016h
 */

import React, { useState, useEffect, useRef } from 'react';
import { normalizeSpecArtifacts } from '../lib/graphNormalizer.js';
import GraphLegend from './GraphLegend.jsx';

/** Map node status → Hub design-token color. */
const STATUS_COLOR = {
  approved: 'var(--syn-green)',
  active:   'var(--syn-orange)',
  drift:    'var(--syn-red)',
  pending:  'var(--syn-comment)',
};

function buildStylesheet() {
  return [
    {
      selector: 'node[kind = "fr"]',
      style: {
        shape:              'rectangle',
        'background-color': ele => STATUS_COLOR[ele.data('status')] ?? STATUS_COLOR.pending,
        'border-color':     'var(--border)',
        'border-width':     1,
        label:              'data(label)',
        color:              '#e6edf3',
        'font-family':      'JetBrains Mono, monospace',
        'font-size':        10,
        'text-valign':      'center',
        'text-halign':      'center',
        width:              80,
        height:             32,
      },
    },
    {
      selector: 'node[kind = "tc"]',
      style: {
        shape:              'diamond',
        'background-color': ele => STATUS_COLOR[ele.data('status')] ?? STATUS_COLOR.pending,
        'border-color':     'var(--border)',
        'border-width':     1,
        label:              'data(label)',
        color:              '#e6edf3',
        'font-family':      'JetBrains Mono, monospace',
        'font-size':        10,
        'text-valign':      'center',
        'text-halign':      'center',
        width:              80,
        height:             48,
      },
    },
    {
      selector: 'edge',
      style: {
        width:                  1,
        'line-color':           'var(--border)',
        'target-arrow-color':   'var(--border)',
        'target-arrow-shape':   'triangle',
        'curve-style':          'bezier',
      },
    },
    {
      selector: 'node:selected',
      style: {
        'border-color': 'var(--syn-blue)',
        'border-width': 2,
      },
    },
  ];
}

/**
 * @param {{ projects: object[] }} props
 * @returns {JSX.Element}
 */
export default function GraphTab({ projects }) {
  const projectsWithGraph = projects.filter(p => p.specArtifacts != null);
  const [selectedId, setSelectedId] = useState(() => projectsWithGraph[0]?.id ?? null);
  const [tooltip, setTooltip]       = useState(null);
  const containerRef = useRef(null);
  const cyRef        = useRef(null);

  // Keep selectedId valid as projects list updates.
  useEffect(() => {
    const ids = projectsWithGraph.map(p => p.id);
    if (!ids.includes(selectedId) && ids.length > 0) {
      setSelectedId(ids[0]);
    }
  }, [projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = projectsWithGraph.find(p => p.id === selectedId) ?? projectsWithGraph[0] ?? null;

  useEffect(() => {
    if (!selected || !containerRef.current) return;
    let cancelled = false;

    async function initCy() {
      const [{ default: Cytoscape }, { default: dagre }] = await Promise.all([
        import('cytoscape'),
        import('cytoscape-dagre'),
      ]);
      if (cancelled) return;

      // Register layout extension — idempotent.
      try { Cytoscape.use(dagre); } catch { /* already registered */ }

      const { nodes, edges } = normalizeSpecArtifacts(
        selected.specArtifacts,
        selected.aitriState,
      );

      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
      if (!containerRef.current || cancelled) return;

      const cy = Cytoscape({
        container:           containerRef.current,
        elements:            [...nodes, ...edges],
        style:               buildStylesheet(),
        layout: {
          name:     'dagre',
          rankDir:  'TB',
          nodeSep:  40,
          rankSep:  60,
          padding:  20,
          animate:  false,
        },
        userZoomingEnabled:  true,
        userPanningEnabled:  true,
        boxSelectionEnabled: false,
        minZoom: 0.3,
        maxZoom: 3,
      });

      cy.on('tap', 'node', evt => {
        const d = evt.target.data();
        setTooltip({ id: d.id, title: d.title, status: d.status, kind: d.kind });
      });
      cy.on('tap', evt => {
        if (evt.target === cy) setTooltip(null);
      });

      cyRef.current = cy;
    }

    initCy().catch(() => { /* load error — show empty canvas */ });

    return () => {
      cancelled = true;
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [selected?.id, selected?.specArtifacts, selected?.aitriState]);

  if (projectsWithGraph.length === 0) {
    return (
      <div className="empty-state">
        <p>No spec artifacts found.</p>
        <p className="empty-state__hint">
          Run <code>aitri feature complete &lt;feature&gt; 1</code> and <code>aitri feature complete &lt;feature&gt; 3</code> to generate artifacts.
        </p>
      </div>
    );
  }

  return (
    <div className="graph-tab">
      {/* Project selector — only shown when multiple projects have graph data */}
      {projectsWithGraph.length > 1 && (
        <div className="graph-tab__selector">
          <label htmlFor="graph-project-select" className="graph-tab__selector-label">
            Project
          </label>
          <select
            id="graph-project-select"
            className="graph-tab__select"
            value={selectedId ?? ''}
            onChange={e => setSelectedId(e.target.value)}
          >
            {projectsWithGraph.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      <GraphLegend />

      {/* Tap-to-select tooltip */}
      {tooltip && (
        <div className="graph-tooltip" role="status" aria-live="polite">
          <span className="graph-tooltip__id">{tooltip.id}</span>
          {tooltip.title && (
            <span className="graph-tooltip__title">{tooltip.title}</span>
          )}
          <span className={`graph-tooltip__status graph-tooltip__status--${tooltip.status}`}>
            {tooltip.status}
          </span>
        </div>
      )}

      {/* Cytoscape mount point */}
      <div
        ref={containerRef}
        className="graph-tab__canvas"
        aria-label={`Spec artifact graph for ${selected?.name ?? 'project'}`}
      />
    </div>
  );
}
