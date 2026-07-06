# Technical Design Document (TRD / SDD) — contract-catchup-rc159

Feature scope: bring the Hub's Aitri-integration layer up to the Aitri v2.0.0-rc.159
contract. No new UI surfaces; data layer + alert rules + at most inline indicators on
existing components. Parent architecture (collector loop → `dashboard.json` → SPA
polling) is unchanged.

## Executive Summary

This feature upgrades the Hub's Aitri-integration layer to the v2.0.0-rc.159 contract: one semver SSoT module replaces five stable-only parse sites, the fallback readers learn the rc.41 artifact names (with legacy aliases), the rc.51 `.aitri.local` split and rc.76 contained layout are modeled, and three new contract surfaces (`bugs.parseErrors`, `resultsBinding`, coverage/quality-gate passthrough) become visible. No new UI views; all dashboard.json changes are additive. The parity gate: a rc.159 project and a legacy pre-rc.41 project both render correctly, the legacy path byte-identical to today.

## System Architecture

```
bin/aitri-hub.js
└─ lib/commands/web.js            collection loop (unchanged)
   └─ lib/collector/index.js      collectOne: snapshot-first gate  ← FR-040 (eligibility compare)
      ├─ snapshot-reader.js       spawn aitri status --json        ← FR-044/045/047 (projection)
      ├─ aitri-reader.js          fallback .aitri + ARTIFACT_MAP   ← FR-041/042/043
      ├─ compliance-reader.js     fallback 05_* reader             ← FR-041/043
      ├─ bugs-reader.js           fallback BUGS.json               ← FR-044
      ├─ aitri-version-reader.js  aitri --version regex            ← FR-040
      └─ integration-guard.js     reviewed-baseline compare        ← FR-040/046
   ├─ lib/utils/scan.js           directory discovery              ← FR-043
   ├─ lib/utils/semver.js         NEW — single semver SSoT         ← FR-040
   ├─ lib/store/compat-manifest.js SEMVER_RE gate                  ← FR-046
   ├─ lib/alerts/engine.js        RULES + version compare          ← FR-040/044/045
   └─ web/src (ProjectCard, BugBadge, alert list)                  ← FR-044/045 inline indicators only
```

All version logic today lives in five independent parse sites, each stable-only:
`aitri-version-reader.js:10` (`/(\d+\.\d+\.\d+)/`), `integration-guard.js:23-24`
(`split('.').map(Number)`), `collector/index.js:48-51` (eligibility), 
`store/compat-manifest.js:18` (`/^\d+\.\d+\.\d+$/`), `alerts/engine.js:31,42`. That
duplication is the root cause of FR-040's bug class and is eliminated, not patched.

### Architecture Decision Records

### ADR-H1 — Semver handling: one hand-rolled SSoT module vs per-site patching
- **Option A — patch each of the five regex sites in place.** Smallest diff; keeps five
  divergent copies — the exact shape that produced this bug (a sixth consumer will
  truncate again). No single place to unit-test precedence.
- **Option B — new `lib/utils/semver.js` (zero-dep, ~60 lines), all five sites refactored
  to import it.** One tested implementation of parse + precedence; slightly larger diff;
  the module becomes a contract other features (QA Workspace) reuse.
- **Decision: B.** The FR demands identical semantics "everywhere a version is compared
  or displayed" — that is a definition of single source of truth. Consequences: five call
  sites change in one release (regression NFRs cover them); future version consumers have
  exactly one import.

API contract (exported, JSDoc-typed):
```js
parseSemver(str)   // → {major, minor, patch, pre: [{tag:'alpha'|'rc'|string, num:number}] | null,
                   //     raw: '2.0.0-rc.159'}  |  null on unparseable input
compareSemver(a,b) // → negative | 0 | positive. Accepts strings or parsed objects.
                   // Precedence per semver.org §11: numeric core; a pre-release
                   // PRECEDES its stable release; pre-release identifiers compare
                   // alphanumerically ('alpha' < 'rc') then numerically (15 < 159).
                   // Throws TypeError if either side is unparseable — callers gate
                   // with parseSemver first (never compare junk silently).
gteSemver(a,b)     // convenience: compareSemver(a,b) >= 0
```
Display rule: everywhere a version is stored or rendered, the **raw full tag** is used;
truncation is deleted, not wrapped.

### ADR-H2 — Dual artifact names in the fallback path: resolver helper vs mapped arrays
- **Option A — change `ARTIFACT_MAP` values to arrays** (`4: ['04_BUILD_REPORT.json',
  '04_IMPLEMENTATION_MANIFEST.json']`) and let each consumer loop. Pushes the
  precedence rule into every consumer; compliance-reader duplicates it anyway.
- **Option B — keep the map single-valued on the NEW names + one shared
  `resolveArtifact(dir, canonicalName)` helper** that knows the legacy alias table and
  returns the first existing path (new name wins when both exist). Consumers ask for the
  canonical name only.
- **Decision: B.** The precedence rule ("new first, old fallback, new wins on conflict",
  FR-041 AC-3) is stated once and unit-tested once. Consequences: `ARTIFACT_MAP` is
  updated to rc.41 names (`4: '04_BUILD_REPORT.json'`, `5: '05_TRACEABILITY.json'`);
  `detectDrift` and `compliance-reader` route reads through the resolver.

Legacy alias table (module-level in `aitri-reader.js`, exported for tests):
```js
const LEGACY_ALIASES = Object.freeze({
  '04_BUILD_REPORT.json':  '04_IMPLEMENTATION_MANIFEST.json',
  '05_TRACEABILITY.json':  '05_PROOF_OF_COMPLIANCE.json',
});
```

### ADR-H3 — Corrupt-bug-file representation in dashboard.json: dedicated field vs sentinel count
- **Option A — sentinel value** (`bugs.open = -1` or `null` on parse failure). Breaks
  NFR-044 (type change on an existing field) and every SPA consumer of the number.
- **Option B — additive fields:** keep counters at their degraded values but add
  `bugs.parseErrors: string[]` (scopes) and let the SPA render the unknown state from
  `parseErrors.length > 0`. Mirrors the rc.158 Core contract shape exactly.
- **Decision: B.** Additive, contract-mirroring, zero type changes. Consequence: a
  consumer that ignores `parseErrors` still sees the old (degraded) counters — the same
  honest floor Core chose; the alert makes it visible.

### Design per FR

### FR-040 — `lib/utils/semver.js` + five call-site refactors
- `aitri-version-reader.js`: regex widened to capture the full tag
  (`/v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/`); result validated with `parseSemver`;
  unparseable → same `null` path as a missing CLI today (FR-040 AC-5).
- `collector/index.js` eligibility: `gteSemver(projectVersion, SNAPSHOT_MIN_AITRI_VERSION)`;
  a pre-release `2.0.0-rc.15` now correctly ≥ `0.1.77`.
- `integration-guard.js` + `alerts/engine.js`: replace local `split('.')` compares with
  `compareSemver`; VERSION_MISMATCH alert text prints raw tags.
- `store/compat-manifest.js`: `SEMVER_RE` gate replaced by `parseSemver(...) !== null`.
- Floors `SNAPSHOT_MIN_AITRI_VERSION = '0.1.77'` and `FALLBACK_BASELINE = '0.1.80'`
  keep their values (they remain true floors) — only the comparator changes (FR-046).

### FR-041 — rc.41 names in the fallback path
- `ARTIFACT_MAP[4] = '04_BUILD_REPORT.json'`, `ARTIFACT_MAP[5] = '05_TRACEABILITY.json'`.
- `detectDrift` hashes `resolveArtifact(...)` paths; hash keys (phase numbers) unchanged.
- `compliance-reader.js` reads via `resolveArtifact(dir, '05_TRACEABILITY.json')`.
- Parity: a legacy fixture resolves to the old file through the alias and produces the
  byte-identical record (NFR-041 golden test).

### FR-042 — `.aitri.local` merge
In `readAitriState`, after parsing the shared file:
```js
const local = readJsonSilent(path.join(dir, '.aitri.local'));   // null on absent/malformed
if (local) for (const k of ['lastSession','reconcileState','sessionContext'])
  if (local[k] !== undefined) state[k] = local[k];
```
Malformed local → one `console.warn` line, shared view returned (FR-042 AC-4). Absent →
no read error (existsSync guard). Pre-split projects keep reading the legacy in-`.aitri`
copies because the merge only overrides when the local file provides the key.

### FR-043 — contained layout (`layoutRoot`)
- `.aitri` stays at the project root in the contained layout (per Core SCHEMA.md), so
  `scan.js` discovery already matches on `.aitri` presence — scan change is verifying the
  entry is not filtered by the missing flat `spec/` (no such filter exists today; a scan
  regression test pins it).
- New helper in `aitri-reader.js`: `layoutBase(dir, state)`:
  ```js
  // returns dir when layoutRoot is absent; dir/layoutRoot when it is a safe
  // relative segment; dir + warning when it is unsafe.
  const resolved = path.resolve(dir, state.layoutRoot);
  const rootReal = fs.realpathSync(dir);
  if (!path.isAbsolute(state.layoutRoot) && (resolved === rootReal || resolved.startsWith(rootReal + path.sep))
      && fs.realpathSync.native(existing prefix of resolved).startsWith(rootReal + path.sep)) → accept
  else → console.warn, treat as absent   // NFR-045: absolute, ../ and symlink escape all rejected
  ```
  (Implementation detail: realpath check applies to the deepest existing ancestor of the
  resolved path, so a dangling layoutRoot doesn't throw.)
- All fallback artifact/feature paths (`artifactsDir`, `features/`) resolve under
  `layoutBase(...)`. Flat projects: `layoutBase` returns `dir` — code path identical.

### FR-044 — corrupt BUGS.json visibility
- Snapshot path: `projectFromSnapshot` copies `snapshot.bugs.parseErrors` (when a
  non-empty array) into the record.
- Fallback path: `bugs-reader.js` returns `{ parseErrors: [scopeLabel] }` when the file
  exists but JSON.parse fails OR the shape violates the contract (`bugs` not an array) —
  today both collapse to empty.
- `alerts/engine.js` new RULE `BUGS_PARSE_ERROR` (severity: warning):
  `record.bugs?.parseErrors?.length > 0` → message
  `BUGS.json unreadable in <scopes> — bugs are NOT counted`, suggested command
  `aitri bug list` in the project.
- SPA: `BugBadge` renders an `unknown` (warning-colored `?`) state when `parseErrors`
  present — the only UI delta, on an existing component (no_go_zone respected).

### FR-045 — unbound results indicator
- `projectFromSnapshot` copies the snapshot's `resultsBinding` state into the record when
  the field is present; absent field → nothing copied (older CLIs, FR-045 AC-3).
- `alerts/engine.js` new RULE `RESULTS_UNBOUND` (severity: warning) when the carried
  state says unbound/stale: message `test results not bound to a verify run`, command
  `aitri verify-run`.
- SPA: warning line in the existing Tests section of `ProjectCard` (existing surface).

### FR-046 — integration review on full pre-release versions
- `integration review <v>`: `parseSemver` gate; unparseable → usage error, exit ≠ 0,
  manifest untouched (AC-4). Stores the raw full tag in `reviewedUpTo`.
- `integration-guard.js`: baseline compare via `compareSemver`; the changelog-hash drift
  check is version-agnostic and unchanged.
- Shipping ritual (not code): perform the rc.1→rc.159 CHANGELOG review; record outcome in
  `reviewerNote`; run `integration review 2.0.0-rc.159`. Tracked as a Phase-5 checklist
  item so `verify-complete` evidence includes it.

### FR-047 — projection carries coverage surfaces
`projectFromSnapshot` additionally copies, each guarded by presence: quality-gate results
(name + pass/fail), `ac_coverage`, and the coverage/requirements-audit freshness fields
documented in rc.159 STATUS_JSON.md. Additive fields on the record; no UI consumer in
this feature.

## Data Model

### dashboard.json contract additions (all additive — NFR-044)

| Field | Type | Present when |
|---|---|---|
| `bugs.parseErrors` | `string[]` | ≥1 scope's BUGS.json unreadable |
| `resultsBinding` | `object` (as snapshot provides) | snapshot ≥ rc.148 provides it |
| `qualityGates` | `array` (name, pass/fail) | snapshot provides it |
| `acCoverage` | as snapshot provides | snapshot provides it |
| `coverageAudit` | freshness fields as snapshot provides | snapshot provides it |
| `aitriVersion` / `cliVersion` | string — now full pre-release tag | always (format change is additive: field existed, value gains its real suffix; SPA renders strings verbatim) |

No existing field changes type or meaning. The SPA is the first consumer; its tests
extend for the two indicator states.

## Performance & Scalability

- Process budget unchanged: one `aitri status --json` spawn per eligible project per cycle; zero new spawns (FR-046's review command is operator-invoked). Guardrail: collection for 20 projects stays within the parent ≤2s render budget — new work is pure in-process parsing (semver compare is O(len), resolver adds ≤1 existsSync per artifact read).
- `.aitri.local` adds one existsSync + one small JSON parse per fallback project per cycle; contained-layout adds one realpath per project. Both negligible against the existing per-cycle file reads.
- Scale ceiling unchanged (single-node, local filesystem, 5s polling).

## Deployment Architecture

Unchanged: `aitri-hub web` serves the SPA from `docker/web-dist`; data lives in `~/.aitri-hub/`. Ship = bump Hub `package.json` version, rebuild the SPA bundle (`npm run build` via the existing buildIfNeeded path), run the shipping ritual for FR-046 (CHANGELOG review + `integration review 2.0.0-rc.159`). Docker path unaffected (serves prebuilt SPA + dashboard.json). No migration of `~/.aitri-hub/` state: `projects.json`/`dashboard.json` schemas are additive; `integration-compat.json` gains a pre-release-capable `reviewedUpTo` value, tolerated by old readers as an opaque string.

## Risk Analysis

### Failure modes & blast radius

| Component | Failure | Blast radius | Containment |
|---|---|---|---|
| `semver.js` wrong precedence | mis-ordered compares | alerts storm or silent eligibility demotion across ALL projects | exhaustive unit vectors (AC set of FR-040) run in CI before any consumer refactor lands; five call sites migrate in one commit with regression suite green |
| `resolveArtifact` wrong precedence | fallback reads stale legacy file when both exist | wrong compliance/drift for one project | FR-041 AC-3 unit test; deterministic order, no caching |
| `.aitri.local` reader throws | fallback collection fails for local projects | project card degrades | readJsonSilent never throws; malformed → warn + skip |
| `layoutBase` confinement bug | reads outside project root from a hostile clone | file disclosure into dashboard.json (localhost-only, but real) | NFR-045 tests: absolute, `../`, symlink; deepest-existing-ancestor realpath check |
| Alert rule crash | `deriveStatus` throws | whole dashboard cycle fails | RULES already run per-rule; new rules follow the same guarded pattern (pure predicate on the record) |
| Snapshot projection copies unexpected shapes | dashboard.json bloat/garbage for one field | SPA ignores unknown fields | copy is presence-guarded and shape-checked (arrays/objects only, size-capped by the existing 1 MiB stdout cap) |

## API Design

No HTTP API changes (admin API untouched). The integration points are internal module contracts:

| Contract | Signature | Consumers |
|---|---|---|
| `lib/utils/semver.js` | `parseSemver(str)` / `compareSemver(a,b)` / `gteSemver(a,b)` — full spec in ADR-H1 | aitri-version-reader, integration-guard, collector/index (eligibility), compat-manifest, alerts/engine |
| `resolveArtifact(dir, canonicalName)` | returns first existing path: canonical, then `LEGACY_ALIASES[canonicalName]`; canonical wins when both exist | aitri-reader (detectDrift), compliance-reader |
| `layoutBase(dir, state)` | returns confined artifact base dir (ADR + NFR-045 rules in Design per FR / FR-043) | all fallback path resolution |
| `projectFromSnapshot(snapshot)` | additive passthrough of `bugs.parseErrors`, `resultsBinding`, quality gates, `ac_coverage`, coverage-audit freshness — each presence-guarded | dashboard record |
| `aitri-hub integration review <version>` | CLI: version must satisfy `parseSemver`; stores raw full tag in `reviewedUpTo`; unparseable → usage error, exit ≠ 0, manifest untouched | operator |

## Security Design
- Only new input surface: `.aitri`-declared paths from potentially untrusted clones —
  confined by `layoutBase` (NFR-045). No new endpoints, no auth change, admin API
  untouched (NFR-042). No new process spawns (constraint honored; FR-046's review command
  is operator-invoked, not per-cycle).

### Test strategy hooks (for Phase 3)
- Unit: semver vectors (incl. junk input), resolveArtifact precedence, local-merge
  matrix (present/absent/malformed/legacy), layoutBase confinement trio, bugs-reader
  corrupt shapes, alert rules on/off.
- Golden fixture: legacy pre-rc.41 flat project — record equality (NFR-041).
- Integration: snapshot-eligible fixture never touches fallback readers (NFR-040);
  contained-layout fixture end-to-end (FR-043 AC-1).
- Existing suites unmodified-assertions: admin-api e2e (NFR-042), remote sync (NFR-043).

### Traceability checklist
- FR-040 → §2 ADR-H1, §3. FR-041 → ADR-H2, §3. FR-042 → §3. FR-043 → §3 + §6.
- FR-044 → ADR-H3, §3, §4. FR-045 → §3, §4. FR-046 → §3. FR-047 → §3, §4.
- NFR-040/041/042/043/044/045/046 → §5, §7, §4.
- no_go_zone check: no new UI views (only inline states on existing components); no
  GitHub/deps/runtime monitoring; no validate --json in the cycle; no Core changes; no
  new aitri invocations. ✔
- Every ADR has ≥2 options. ✔

## Technical Risk Flags

- **Five-call-site semver migration in one release** — highest-risk refactor of the feature; mitigated by migrating in a single commit gated on the full regression suite + golden fixture (NFR-041) and exhaustive comparator vectors landing FIRST.
- **Semver precedence subtleties** (build metadata `+`, multi-identifier pre-releases like `rc.1.2`) — comparator implements semver.org §11 for the identifier shapes Aitri actually emits (`alpha.N`, `rc.N`); anything else parses but compares alphanumerically per spec; junk input throws at compare and is gated at parse. Documented in the module header.
- **Realpath confinement on dangling layoutRoot** — deepest-existing-ancestor check avoids throwing on not-yet-created dirs; unit-tested with the NFR-045 trio.
- **Snapshot shape variance across rc versions** — passthrough fields are presence-guarded and shape-checked; an unexpected shape degrades to field-absent, never to a crash (same posture as the existing projection).
- **Golden fixture brittleness** (NFR-041 byte-parity) — timestamps excluded from comparison; fixture pinned in-repo so CI is deterministic.
