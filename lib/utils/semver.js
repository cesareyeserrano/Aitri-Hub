/**
 * Module: utils/semver
 * Purpose: Single source of truth for semantic-version parsing and comparison,
 *          including pre-release tags (2.0.0-alpha.N, 2.0.0-rc.N). Replaces the
 *          five stable-only parse sites that truncated pre-release versions
 *          (TRD ADR-H1, contract-catchup-rc159).
 * Dependencies: none (zero-dep, hand-rolled).
 *
 * Precedence per semver.org §11 for the identifier shapes Aitri emits
 * (alpha.N, rc.N); other identifier shapes parse and compare per the same
 * spec rules (numeric identifiers numerically and lower than alphanumeric;
 * alphanumeric identifiers in ASCII order). Build metadata (+...) is parsed
 * and IGNORED for precedence, per spec.
 */

const SEMVER_RE =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Parse a semver string, tolerating a leading `v`.
 *
 * @aitri-trace FR-ID: FR-040, US-ID: US-040, AC-ID: AC-0402, TC-ID: TC-040f
 * @param {string} str - Candidate version string (e.g. "2.0.0-rc.159").
 * @returns {{major:number, minor:number, patch:number,
 *            pre: Array<{raw:string, num:number|null}>|null, raw:string} | null}
 *          Parsed version, or null when the input is not a semver string.
 */
export function parseSemver(str) {
  if (typeof str !== 'string') return null;
  const m = SEMVER_RE.exec(str.trim());
  if (!m) return null;
  const pre = m[4]
    ? m[4].split('.').map(id => ({ raw: id, num: /^\d+$/.test(id) ? Number(id) : null }))
    : null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre,
    raw: str.trim().replace(/^v/, ''),
  };
}

/**
 * Compare two versions per semver precedence.
 *
 * @aitri-trace FR-ID: FR-040, US-ID: US-040, AC-ID: AC-0401, TC-ID: TC-040h, TC-040e
 * @param {string|object} a - Version string or parseSemver() result.
 * @param {string|object} b - Version string or parseSemver() result.
 * @returns {number} Negative when a < b, 0 when equal precedence, positive when a > b.
 * @throws {TypeError} When either side is unparseable — callers gate with
 *         parseSemver first; junk is never compared silently.
 */
export function compareSemver(a, b) {
  // A pre-parsed object must actually look like a parseSemver() result — an
  // arbitrary object would silently compare as NaN (adversarial finding).
  const isParsed = v =>
    v !== null &&
    typeof v === 'object' &&
    Number.isInteger(v.major) &&
    Number.isInteger(v.minor) &&
    Number.isInteger(v.patch);
  const pa = isParsed(a) ? a : parseSemver(a);
  const pb = isParsed(b) ? b : parseSemver(b);
  if (!pa || !pb) {
    throw new TypeError(
      `compareSemver: unparseable version (${JSON.stringify(!pa ? a : b)}) — gate inputs with parseSemver()`,
    );
  }
  for (const k of ['major', 'minor', 'patch']) {
    if (pa[k] !== pb[k]) return pa[k] - pb[k];
  }
  // Equal core: a pre-release PRECEDES its stable release.
  if (!pa.pre && !pb.pre) return 0;
  if (!pa.pre) return 1;
  if (!pb.pre) return -1;
  // Identifier-by-identifier comparison.
  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i++) {
    const ia = pa.pre[i];
    const ib = pb.pre[i];
    // A larger set of pre-release fields has higher precedence when prefixes equal.
    if (ia === undefined) return -1;
    if (ib === undefined) return 1;
    if (ia.num !== null && ib.num !== null) {
      if (ia.num !== ib.num) return ia.num - ib.num;
    } else if (ia.num !== null) {
      return -1; // numeric identifiers are lower than alphanumeric
    } else if (ib.num !== null) {
      return 1;
    } else if (ia.raw !== ib.raw) {
      return ia.raw < ib.raw ? -1 : 1; // ASCII order: 'alpha' < 'rc'
    }
  }
  return 0;
}

/**
 * Convenience: a >= b under semver precedence.
 *
 * @param {string|object} a - Version string or parsed object.
 * @param {string|object} b - Version string or parsed object.
 * @returns {boolean}
 * @throws {TypeError} Propagated from compareSemver on unparseable input.
 */
export function gteSemver(a, b) {
  return compareSemver(a, b) >= 0;
}
