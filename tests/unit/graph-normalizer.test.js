/**
 * Tests: web/src/lib/graphNormalizer
 *
 * @aitri-trace TC-ID: TC-015h, TC-015f, TC-015e
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpecArtifacts } from '../../web/src/lib/graphNormalizer.js';

const SAMPLE_SPEC = {
  frs: [
    { id: 'FR-010', title: 'Graph tab exists', priority: 'MUST', phase: '1' },
    { id: 'FR-011', title: 'Project selector', priority: 'MUST', phase: '1' },
  ],
  tcs: [
    { id: 'TC-010h', title: 'Graph renders', fr_ids: ['FR-010'], phase: '3' },
    { id: 'TC-011h', title: 'Selector shown', fr_ids: ['FR-010', 'FR-011'], phase: '3' },
  ],
};

const STATE_APPROVED = {
  currentPhase: 4,
  approvedPhases: [1, 2, 3],
  driftPhases: [],
};

const STATE_DRIFT = {
  currentPhase: 2,
  approvedPhases: [1],
  driftPhases: ['1'],
};

const STATE_ACTIVE = {
  currentPhase: 1,
  approvedPhases: [],
  driftPhases: [],
};

// ── TC-015h: normalizeSpecArtifacts produces correct nodes and edges ──────────

describe('TC-015h: normalizeSpecArtifacts — correct node/edge structure', () => {
  it('returns empty when specArtifacts is null', () => {
    const result = normalizeSpecArtifacts(null, STATE_APPROVED);
    assert.deepStrictEqual(result, { nodes: [], edges: [] });
  });

  it('creates one node per FR and one node per TC', () => {
    const { nodes } = normalizeSpecArtifacts(SAMPLE_SPEC, STATE_APPROVED);
    const frNodes = nodes.filter(n => n.data.kind === 'fr');
    const tcNodes = nodes.filter(n => n.data.kind === 'tc');
    assert.strictEqual(frNodes.length, 2);
    assert.strictEqual(tcNodes.length, 2);
  });

  it('creates edges for each TC→FR relationship', () => {
    const { edges } = normalizeSpecArtifacts(SAMPLE_SPEC, STATE_APPROVED);
    // TC-010h → FR-010 (1 edge), TC-011h → FR-010, FR-011 (2 edges) = 3 total
    assert.strictEqual(edges.length, 3);
  });

  it('edge source is TC, target is FR', () => {
    const { edges } = normalizeSpecArtifacts(SAMPLE_SPEC, STATE_APPROVED);
    for (const edge of edges) {
      assert.ok(edge.data.source.startsWith('TC-'));
      assert.ok(edge.data.target.startsWith('FR-'));
    }
  });
});

// ── TC-015f: node status reflects aitriState phase-based logic ────────────────

describe('TC-015f: normalizeSpecArtifacts — phase-based node status', () => {
  it('FR nodes are "approved" when phase 1 is approved with no drift', () => {
    const { nodes } = normalizeSpecArtifacts(SAMPLE_SPEC, STATE_APPROVED);
    for (const n of nodes.filter(n => n.data.kind === 'fr')) {
      assert.strictEqual(n.data.status, 'approved');
    }
  });

  it('TC nodes are "approved" when phase 3 is approved', () => {
    const { nodes } = normalizeSpecArtifacts(SAMPLE_SPEC, STATE_APPROVED);
    for (const n of nodes.filter(n => n.data.kind === 'tc')) {
      assert.strictEqual(n.data.status, 'approved');
    }
  });

  it('FR nodes are "drift" when phase 1 is in driftPhases', () => {
    const { nodes } = normalizeSpecArtifacts(SAMPLE_SPEC, STATE_DRIFT);
    for (const n of nodes.filter(n => n.data.kind === 'fr')) {
      assert.strictEqual(n.data.status, 'drift');
    }
  });

  it('FR nodes are "active" when currentPhase is 1 and not yet approved', () => {
    const { nodes } = normalizeSpecArtifacts(SAMPLE_SPEC, STATE_ACTIVE);
    for (const n of nodes.filter(n => n.data.kind === 'fr')) {
      assert.strictEqual(n.data.status, 'active');
    }
  });
});

// ── TC-015e: edge cases and dangling references ───────────────────────────────

describe('TC-015e: normalizeSpecArtifacts — edge cases', () => {
  it('skips dangling TC→FR references (FR not in spec)', () => {
    const spec = {
      frs: [{ id: 'FR-010', title: 'x', priority: 'MUST', phase: '1' }],
      tcs: [{ id: 'TC-010h', title: 'y', fr_ids: ['FR-010', 'FR-GHOST'], phase: '3' }],
    };
    const { edges } = normalizeSpecArtifacts(spec, STATE_APPROVED);
    assert.strictEqual(edges.length, 1); // only FR-010 edge, not FR-GHOST
  });

  it('handles empty frs and tcs arrays', () => {
    const result = normalizeSpecArtifacts({ frs: [], tcs: [] }, STATE_APPROVED);
    assert.deepStrictEqual(result, { nodes: [], edges: [] });
  });

  it('handles null aitriState — all nodes are "pending"', () => {
    const { nodes } = normalizeSpecArtifacts(SAMPLE_SPEC, null);
    for (const n of nodes) {
      assert.strictEqual(n.data.status, 'pending');
    }
  });
});
