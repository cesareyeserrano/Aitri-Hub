/**
 * Module: web/src/lib/names
 * Purpose: Fixed technical→product artifact name mapping (FR-019). Feature artifacts
 *          inherit the mapping prefixed by the feature name. Unmapped names fall back
 *          to the raw filename. The mapping is fixed in v1 (not user-configurable).
 *
 * @aitri-trace FR-ID: FR-019, US-ID: US-019, AC-ID: AC-019-1, TC-ID: TC-019h
 */

export const NAME_MAP = Object.freeze({
  '01_REQUIREMENTS.json': 'PRD — Product Requirements',
  '02_SYSTEM_DESIGN.md': 'TRD — Technical Design',
  '03_TEST_CASES.json': 'QA Plan — Test Cases',
  '04_IMPLEMENTATION_MANIFEST.json': 'Implementation Manifest',
  '05_PROOF_OF_COMPLIANCE.json': 'Release Compliance',
  '06_EXTERNAL_SIGNALS.json': 'External Signals',
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
