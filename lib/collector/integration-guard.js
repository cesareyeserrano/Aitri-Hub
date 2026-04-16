/**
 * Module: collector/integration-guard
 * Purpose: Evaluate Aitri Core / Hub integration version alignment.
 *          Generates a warning alert when the installed CLI version exceeds
 *          the last-reviewed version constant.
 * Dependencies: lib/constants
 */

import { INTEGRATION_LAST_REVIEWED } from '../constants.js';

const CHANGELOG_URL =
  'https://github.com/cesareyeserrano/Aitri/blob/main/docs/integrations/CHANGELOG.md';

/**
 * Compare two semver strings (major.minor.patch only).
 * Returns true if a > b, false otherwise.
 * Handles optional 'v' prefix and extra whitespace.
 *
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
function semverGt(a, b) {
  if (!a || !b) return false;
  const pa = a.replace(/^v/, '').trim().split('.').map(Number);
  const pb = b.replace(/^v/, '').trim().split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false; // equal
}

/**
 * Evaluate integration version alignment.
 * Returns an alert object when action is required, null when Hub is aligned.
 *
 * @aitri-trace FR-ID: FR-010, US-ID: US-010, AC-ID: AC-020, TC-ID: TC-010h
 *
 * @param {string | null} detectedVersion  Semver from detectAitriVersion(), or null.
 * @returns {{ severity: 'warning', message: string, changelogUrl: string } | null}
 */
export function evaluateIntegrationAlert(detectedVersion) {
  if (detectedVersion === null || detectedVersion === undefined) {
    return {
      severity: 'warning',
      message: 'Aitri CLI version undetectable — integration status unknown',
      changelogUrl: CHANGELOG_URL,
    };
  }

  if (semverGt(detectedVersion, INTEGRATION_LAST_REVIEWED)) {
    return {
      severity: 'warning',
      message: `Aitri ${detectedVersion} detected — Hub integration not reviewed past ${INTEGRATION_LAST_REVIEWED}`,
      changelogUrl: CHANGELOG_URL,
    };
  }

  return null;
}

// Export for testing
export { semverGt };
