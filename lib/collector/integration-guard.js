/**
 * Module: collector/integration-guard
 * Purpose: Evaluate Aitri Core / Hub integration version alignment.
 *          Receives reviewedUpTo from the caller on every cycle (FR-033) so
 *          the value is never cached at module import time.
 * Dependencies: utils/semver (FR-040 SSoT comparator)
 */

import { parseSemver, compareSemver } from '../utils/semver.js';

const CHANGELOG_URL =
  'https://github.com/cesareyeserrano/Aitri/blob/main/docs/integrations/CHANGELOG.md';

/**
 * Compare two semver strings with full pre-release precedence (FR-040).
 * Returns true if a > b, false otherwise — including when either side is
 * absent or unparseable (matches the pre-change null behavior: no fabricated
 * comparison on junk).
 *
 * @aitri-trace FR-ID: FR-040, FR-046, US-ID: US-046, AC-ID: AC-0461, TC-ID: TC-046e
 * @param {string | null | undefined} a
 * @param {string | null | undefined} b
 * @returns {boolean}
 */
function semverGt(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return false;
  return compareSemver(pa, pb) > 0;
}

/**
 * Evaluate integration version alignment and optional CHANGELOG drift.
 * Returns an alert object when action is required, null when Hub is aligned.
 *
 * Provenance fields (reviewedAt, changelogHash) are always present on the
 * payload — they are null when no manifest was supplied. Callers downstream
 * rely on the both-or-neither invariant (FR-035 AC-3).
 *
 * @aitri-trace FR-ID: FR-033, US-ID: US-035, AC-ID: AC-038, TC-ID: TC-033h
 *
 * @param {string | null} detectedVersion  Semver from detectAitriVersion(), or null.
 * @param {string} reviewedUpTo            Effective baseline (manifest value or fallback).
 * @param {object} [opts]
 * @param {string | null} [opts.reviewedAt=null]       ISO-8601 UTC timestamp or null.
 * @param {string | null} [opts.changelogHash=null]    Stored SHA-256 from manifest or null.
 * @param {string | null} [opts.currentChangelogHash=null]  Live SHA-256 of CHANGELOG section, or null
 *                                                          when CHANGELOG could not be located (drift check skipped).
 * @returns {object | null}
 */
export function evaluateIntegrationAlert(detectedVersion, reviewedUpTo, opts = {}) {
  const reviewedAt = opts.reviewedAt ?? null;
  const changelogHash = opts.changelogHash ?? null;
  const currentHash = opts.currentChangelogHash ?? null;

  if (detectedVersion === null || detectedVersion === undefined) {
    return {
      severity: 'warning',
      message: 'Aitri CLI version undetectable — integration status unknown',
      changelogUrl: CHANGELOG_URL,
      reviewedAt,
      changelogHash,
    };
  }

  // FR-036: drift takes precedence — if the CHANGELOG moved since the review,
  // we warn regardless of whether the version otherwise lines up.
  if (changelogHash !== null && currentHash !== null && changelogHash !== currentHash) {
    return {
      severity: 'warning',
      message: `Aitri ${detectedVersion} — changelog modified since review (reviewed ${reviewedUpTo})`,
      changelogUrl: CHANGELOG_URL,
      reviewedAt,
      changelogHash,
    };
  }

  if (semverGt(detectedVersion, reviewedUpTo)) {
    return {
      severity: 'warning',
      message: `Aitri ${detectedVersion} detected — Hub integration not reviewed past ${reviewedUpTo}`,
      changelogUrl: CHANGELOG_URL,
      reviewedAt,
      changelogHash,
    };
  }

  return null;
}

export { semverGt };
