/**
 * Module: web/src/lib/names
 * Purpose: Fixed technical→product artifact name mapping (FR-019). Feature artifacts
 *          inherit the mapping prefixed by the feature name. Unmapped names fall back
 *          to the raw filename. The mapping is fixed in v1 (not user-configurable).
 *
 * @aitri-trace FR-ID: FR-019, US-ID: US-019, AC-ID: AC-019-1, TC-ID: TC-019h
 */

export const NAME_MAP = Object.freeze({
  // Canonical FR-019 mapping (the six spec-named artifacts).
  '01_REQUIREMENTS.json': 'PRD — Product Requirements',
  '02_SYSTEM_DESIGN.md': 'TRD — Technical Design',
  '03_TEST_CASES.json': 'QA Plan — Test Cases',
  '04_IMPLEMENTATION_MANIFEST.json': 'Implementation Manifest',
  '05_PROOF_OF_COMPLIANCE.json': 'Release Compliance',
  '06_EXTERNAL_SIGNALS.json': 'External Signals',
  // Extension: the other artifacts Aitri actually emits, so the explorer never
  // shows a raw technical filename for a known artifact. Still a fixed built-in
  // map (not user-configurable); truly-unknown names fall back to the raw name.
  '00_DISCOVERY.md': 'Discovery Brief',
  '01_UX_SPEC.md': 'UX / Design Spec',
  '04_BUILD_REPORT.json': 'Build Report — Implementation',
  '04_CODE_REVIEW.md': 'Code Review',
  '04_TEST_RESULTS.json': 'Test Results',
  '05_TRACEABILITY.json': 'Traceability Matrix',
  'AUDIT_REPORT.md': 'Audit Report',
  'BUGS.json': 'Bug Log',
  'BACKLOG.json': 'Backlog — Plan',
  'BUILD_PLAN.md': 'Build Plan — Epics',
});

/**
 * Product name for an artifact. Feature artifacts get a `<feature> · ` prefix.
 * Unmapped names return the raw filename (never blank, never a throw).
 * @param {string} technicalName
 * @param {{ feature?: string }} [opts]
 * @returns {string}
 * @aitri-trace FR-ID: FR-019, US-ID: US-019, AC-ID: AC-019-1, TC-ID: TC-019h
 */
export function productName(technicalName, opts = {}) {
  if (!technicalName) return '';
  const base = NAME_MAP[technicalName] || technicalName;
  return opts.feature ? `${opts.feature} · ${base}` : base;
}
