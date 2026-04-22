/**
 * Module: web/src/lib/graphNormalizer
 * Purpose: Convert specArtifacts + aitriState into Cytoscape node/edge arrays.
 *          Pure function — no side effects, no DOM access.
 *
 * @aitri-trace FR-ID: FR-015, US-ID: US-015, AC-ID: AC-030, TC-ID: TC-015h, TC-015f, TC-015e
 */

/**
 * Derive a node's render status from aitriState.
 * Phase-based: FR nodes use phase "1" state, TC nodes use phase "3" state.
 *
 * @param {string} phase       - Aitri phase key governing this artifact type ('1', '3', …).
 * @param {object|null} aitriState
 * @returns {'approved' | 'active' | 'drift' | 'pending'}
 */
function phaseStatus(phase, aitriState) {
  if (!aitriState) return 'pending';
  const phaseStr = String(phase);
  const approved = (aitriState.approvedPhases ?? []).map(String);
  const drift = (aitriState.driftPhases ?? []).map(String);

  if (approved.includes(phaseStr) && drift.includes(phaseStr)) return 'drift';
  if (approved.includes(phaseStr)) return 'approved';
  if (String(aitriState.currentPhase) === phaseStr) return 'active';
  return 'pending';
}

/**
 * Normalize specArtifacts for a single project into Cytoscape element arrays.
 *
 * @param {{ frs: object[], tcs: object[] } | null} specArtifacts
 * @param {object | null} aitriState
 * @returns {{ nodes: object[], edges: object[] }}
 */
export function normalizeSpecArtifacts(specArtifacts, aitriState) {
  if (!specArtifacts) return { nodes: [], edges: [] };

  const nodes = [];
  const edges = [];
  const frIds = new Set((specArtifacts.frs ?? []).map(fr => fr.id));

  for (const fr of specArtifacts.frs ?? []) {
    nodes.push({
      data: {
        id: fr.id,
        label: fr.id,
        title: fr.title,
        kind: 'fr',
        status: phaseStatus('1', aitriState),
        priority: fr.priority ?? null,
      },
    });
  }

  for (const tc of specArtifacts.tcs ?? []) {
    nodes.push({
      data: {
        id: tc.id,
        label: tc.id,
        title: tc.title,
        kind: 'tc',
        status: phaseStatus('3', aitriState),
      },
    });
    for (const frId of tc.fr_ids ?? []) {
      if (!frIds.has(frId)) continue; // skip dangling references
      edges.push({
        data: {
          id: `${tc.id}→${frId}`,
          source: tc.id,
          target: frId,
        },
      });
    }
  }

  return { nodes, edges };
}
