# System Design — integration_update

## Executive Summary

This feature is a targeted correctness patch to two existing modules:
- `lib/collector/aitri-reader.js` — fix field extraction, defaults, and drift detection logic
- `lib/alerts/engine.js` — add VERSION_MISMATCH alert rule
- `lib/constants.js` — add ALERT_TYPE.VERSION_MISMATCH constant (no new file required)

No new modules, no new files, no new dependencies. All changes use Node.js built-ins already imported or available: `node:fs`, `node:path`, `node:crypto`, `node:child_process`.

**Technology decisions (justified):**

| Component | Technology | Version | Reason |
|-----------|-----------|---------|--------|
| Hash computation | `node:crypto` `createHash('sha256')` | built-in Node ≥18 | Zero-dependency constraint; sufficient for file integrity check |
| CLI version probe | `node:child_process` `execFileSync` | built-in Node ≥18 | Synchronous, simple, already used in git-reader.js; wrapped in try/catch for safety |
| All other logic | Node.js ESM | ≥18.0.0 | Matches existing codebase constraints |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│  lib/collector/aitri-reader.js  (MODIFIED)                              │
│                                                                         │
│  readStateFile(stateDir)           ← unchanged (file/dir detection)    │
│  readFeatures(projectDir)          ← unchanged                         │
│                                                                         │
│  ARTIFACT_MAP (new constant)       ← phase key → artifact filename     │
│  computeFileHash(filePath)         ← new helper: sha256 of file        │
│                                                                         │
│  detectDrift(parsed, projectDir)   ← MODIFIED signature + logic        │
│    1. Fast path: driftPhases[]     ← new: check config.driftPhases     │
│    2. Hash check: per approved phase with stored hash                  │
│       - skip phases with no stored hash (not "drifted")                │
│       - read artifact file → sha256 → compare                          │
│                                                                         │
│  readAitriState(projectDir)        ← MODIFIED return shape             │
│    + aitriVersion: string | null                                        │
│    + updatedAt:    string | null                                        │
│    + createdAt:    string | null                                        │
│    + artifactsDir: '' when absent/empty (not 'spec')                   │
│    + projectName:  path.basename(projectDir) when absent               │
│    + passes projectDir to detectDrift                                   │
└─────────────────────────────────────────────────────────────────────────┘
                        │
                        │ aitriState passed to
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  lib/alerts/engine.js  (MODIFIED)                                       │
│                                                                         │
│  getInstalledAitriVersion()        ← new: execFileSync once, cached    │
│    - module-level cache (null | string)                                 │
│    - called lazily on first evaluateAlerts invocation                  │
│    - try/catch: returns null on any error (ENOENT, timeout, parse)     │
│                                                                         │
│  evaluateAlerts(data)              ← MODIFIED: adds Rule 7             │
│    Rule 7: VERSION_MISMATCH                                             │
│      if data.aitriState?.aitriVersion !== null                         │
│      && installedVersion !== null                                       │
│      && data.aitriState.aitriVersion !== installedVersion              │
│      → push VERSION_MISMATCH warning alert                              │
└─────────────────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  lib/constants.js  (MODIFIED)                                           │
│                                                                         │
│  ALERT_TYPE.VERSION_MISMATCH = 'version-mismatch'  ← new constant     │
└─────────────────────────────────────────────────────────────────────────┘
```

**Component responsibilities:**

| Component | Change | Responsibility |
|-----------|--------|----------------|
| `aitri-reader.js` | Modified | Parse .aitri, apply correct defaults, detect drift using driftPhases fast path + dynamic sha256 hash check |
| `alerts/engine.js` | Modified | Evaluate VERSION_MISMATCH rule; cache installed CLI version at module scope |
| `constants.js` | Modified | Add ALERT_TYPE.VERSION_MISMATCH |
| `ARTIFACT_MAP` | New constant in aitri-reader.js | Map phase key strings to artifact filenames per integration contract |

---

## Data Model

### readAitriState return object (updated shape)

```js
{
  // Existing fields (unchanged)
  currentPhase:    number,          // .aitri.currentPhase ?? 0
  approvedPhases:  Array,           // .aitri.approvedPhases ?? []
  completedPhases: Array,           // .aitri.completedPhases ?? []
  verifyPassed:    boolean,         // .aitri.verifyPassed === true
  verifySummary:   object | null,   // .aitri.verifySummary ?? null
  hasDrift:        boolean,         // detectDrift(parsed, projectDir)
  lastRejection:   object | null,   // extractLastRejection(parsed.rejections)
  events:          Array,           // .aitri.events (last 20)
  features:        Array,           // readFeatures(projectDir)

  // MODIFIED fields
  projectName:     string,          // .aitri.projectName ?? path.basename(projectDir)
  artifactsDir:    string,          // typeof === 'string' && length > 0 ? value : ''

  // NEW fields (FR-010)
  aitriVersion:    string | null,   // typeof === 'string' ? value : null
  updatedAt:       string | null,   // typeof === 'string' ? value : null
  createdAt:       string | null,   // typeof === 'string' ? value : null
}
```

### ARTIFACT_MAP constant

```js
const ARTIFACT_MAP = Object.freeze({
  'discovery': '00_DISCOVERY.md',
  'ux':        '01_UX_SPEC.md',
  '1':         '01_REQUIREMENTS.json',
  '2':         '02_SYSTEM_DESIGN.md',
  '3':         '03_TEST_CASES.json',
  '4':         '04_IMPLEMENTATION_MANIFEST.json',
  '4r':        '04_CODE_REVIEW.md',
  '5':         '05_PROOF_OF_COMPLIANCE.json',
});
```

Source: Aitri ↔ Hub Integration Contract v0.1.63, section "Mapa de phases → artifacts".

### VERSION_MISMATCH alert shape

```js
{
  type:     'version-mismatch',   // ALERT_TYPE.VERSION_MISMATCH
  message:  'Aitri version mismatch: project 0.1.50, CLI 0.1.63',
  severity: 'warning',            // SEVERITY.WARNING
}
```

---

## API Design

This feature modifies internal JS module APIs only (no HTTP endpoints).

### `readAitriState(projectDir: string): AitriState | null`

**Module:** `lib/collector/aitri-reader.js`
**Change:** Returns three new fields; two existing fields have corrected defaults.

```
Input:  projectDir — absolute path to project root
Output: AitriState object (see Data Model) or null if .aitri is absent/malformed
Errors: never throws — all errors caught internally, returns null
```

### `detectDrift(parsed: object, projectDir: string): boolean`

**Module:** `lib/collector/aitri-reader.js`
**Change:** Signature gains `projectDir` parameter; logic rewritten per contract.

```
Input:  parsed     — raw parsed .aitri JSON object
        projectDir — absolute path (needed to resolve artifact files for hash check)
Output: true if drift detected, false otherwise
Errors: never throws — file read errors return false for that phase
```

Algorithm:
```
1. If parsed.driftPhases is an Array and any element (as String) matches
   any element of parsed.approvedPhases (as String) → return true immediately

2. For each phase in parsed.approvedPhases:
   a. storedHash = (parsed.artifactHashes ?? {})[String(phase)]
   b. If storedHash is falsy → skip (no hash = never approved with hash = not drift)
   c. artifactFile = ARTIFACT_MAP[String(phase)]
   d. If no mapping → skip
   e. base = parsed.artifactsDir (raw, before default applied) — use '' if absent/empty
   f. fullPath = base ? path.join(projectDir, base, artifactFile)
                      : path.join(projectDir, artifactFile)
   g. Try: currentHash = computeFileHash(fullPath)
      Catch: continue (file missing = no drift)
   h. If currentHash !== storedHash → return true

3. return false
```

### `computeFileHash(filePath: string): string`

**Module:** `lib/collector/aitri-reader.js` (new private helper)

```
Input:  filePath — absolute path to artifact file
Output: hex sha256 digest of file contents (utf8)
Errors: throws on fs.readFileSync error — caller must catch
```

```js
import crypto from 'node:crypto';
function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}
```

### `getInstalledAitriVersion(): string | null`

**Module:** `lib/alerts/engine.js` (new private helper)

```
Input:  none
Output: version string (e.g. '0.1.63') or null if unavailable
Errors: never throws — execFileSync wrapped in try/catch
Caching: module-level variable; computed once per process lifetime
```

```js
import { execFileSync } from 'node:child_process';
let _cachedInstalledVersion = undefined; // undefined = not yet fetched

function getInstalledAitriVersion() {
  if (_cachedInstalledVersion !== undefined) return _cachedInstalledVersion;
  try {
    const out = execFileSync('aitri', ['--version'], { encoding: 'utf8', timeout: 3000 });
    const match = out.match(/v?(\d+\.\d+\.\d+)/);
    _cachedInstalledVersion = match ? match[1] : null;
  } catch {
    _cachedInstalledVersion = null;
  }
  return _cachedInstalledVersion;
}
```

### `evaluateAlerts(data: ProjectData): Alert[]`

**Module:** `lib/alerts/engine.js`
**Change:** Adds Rule 7 (VERSION_MISMATCH) at the end of the existing rule list.

```js
// Rule 7: VERSION_MISMATCH
const projectVersion  = data.aitriState?.aitriVersion ?? null;
const installedVersion = getInstalledAitriVersion();
if (
  projectVersion !== null &&
  installedVersion !== null &&
  projectVersion !== installedVersion
) {
  alerts.push({
    type:     ALERT_TYPE.VERSION_MISMATCH,
    message:  `Aitri version mismatch: project ${projectVersion}, CLI ${installedVersion}`,
    severity: SEVERITY.WARNING,
  });
}
```

---

## Security Design

**Input validation (NFR-014):**
Artifact paths are constructed exclusively via `ARTIFACT_MAP` lookup (fixed whitelist of known filenames) combined with `path.join`. No user-controlled string reaches the filesystem path construction. `path.join` normalizes `..` traversal, and since the artifact name comes from a closed enum, path traversal is structurally impossible.

**Subprocess security (FR-014):**
`execFileSync('aitri', ['--version'], ...)` uses `execFileSync` (not `exec`) which does not invoke a shell. The command and arguments are fixed literals — no user input interpolated. Timeout of 3000ms prevents stall.

**Read-only contract:**
No write operations introduced. `fs.readFileSync` is the only new filesystem operation. The `.aitri` file and artifact files are read-only accesses consistent with the integration contract.

**No new attack surface:**
No new HTTP endpoints, no new IPC, no new network connections.

---

## Performance & Scalability

**sha256 computation (NFR-010):**
Each artifact file is typically 1–50 KB. sha256 of a 50 KB file completes in <1ms on modern hardware. For 20 projects × 5 phases with hashes = 100 file reads maximum per cycle. At 50 KB each, total I/O ≈ 5 MB, well within the 5000ms budget.

**aitri --version caching (FR-014, NFR-011):**
Module-level cache ensures `execFileSync` runs at most once per process lifetime (not per project, not per cycle). 20 projects = 1 subprocess call total.

**Fast path priority (FR-012):**
`driftPhases[]` check requires no file I/O. Projects where the Aitri CLI has already flagged drift skip the hash computation entirely.

**Bounds:**
- Max approved phases per project: 7 (discovery, ux, 1, 2, 3, 4, 5) — fixed, not user-controlled
- ARTIFACT_MAP size: 8 entries — fixed

---

## Deployment Architecture

**Scope:** Internal library patch — no deployment artifact changes.

- No new Docker layers
- No new environment variables
- No changes to `docker-compose.yml`, `Dockerfile`, or `DEPLOYMENT.md`
- Changes ship as part of the existing `npm publish` / `aitri-hub` release cycle

**CI/CD (NFR-012):**
Existing test suite (`npm test`) must be extended with unit tests covering FR-010 through FR-014. CI pipeline runs tests on every push to `main`. No new CI configuration required — tests live in the existing test directory alongside current tests for `aitri-reader.js` and `engine.js`.

---

## Risk Analysis

### ADR-01: aitri --version caching scope

**Context:** VERSION_MISMATCH rule calls `aitri --version` via subprocess. If called per-project, 20 projects = 20 subprocesses per 5s cycle = 4/sec sustained load.

- **Option A: Module-level singleton** — cache in a module-scoped variable; computed once per process lifetime. Simple, zero overhead after first call. Con: stale if user upgrades CLI mid-session (acceptable: user restarts monitor).
- **Option B: Collector-level parameter injection** — orchestrator calls `aitri --version` once, passes result to `evaluateAlerts(data, installedVersion)`. Testable without module state. Con: changes `evaluateAlerts` signature, requires orchestrator changes beyond the 2-file constraint.
- **Option C: Per-cycle cache (TTL)** — re-run every N cycles. Balances freshness vs overhead. Con: added complexity, no requirement for freshness.

**Decision:** Option A (module-level singleton).
**Reason:** Simplest implementation within the 2-file constraint. Zero subprocess overhead after first call. Stale-version risk is negligible (users upgrading CLI mid-session is rare and easy to recover from by restarting monitor).
**Consequences:** `evaluateAlerts` signature unchanged. Module state makes direct unit testing require a cache reset mechanism — expose `_resetInstalledVersionCache()` test-only export or use dynamic import in tests.

---

### ADR-02: sha256 computation placement

**Context:** Dynamic hash check requires reading artifact files and computing sha256. Must live somewhere accessible to `detectDrift`.

- **Option A: Private helper in aitri-reader.js** — `computeFileHash(filePath)` defined in same file. No new modules. Con: mixes I/O helper with business logic in one file.
- **Option B: Shared utility lib/utils/hash.js** — reusable across other readers. Con: creates a new file, violates the constraint "no new files required"; premature generalization (only one caller).
- **Option C: Inline in detectDrift** — no helper extracted, hash logic inline. Con: harder to unit test the hash computation in isolation; only marginal savings.

**Decision:** Option A (private helper in aitri-reader.js).
**Reason:** Stays within the 2-file constraint. Single caller means no benefit to a shared utility now. The helper is small enough (3 lines) to test indirectly through `detectDrift` tests.
**Consequences:** If a future reader needs hash computation, extraction to utils/ is straightforward. No premature abstraction introduced.

---

### ADR-03: ARTIFACT_MAP location

**Context:** The map of phase keys → artifact filenames is needed by `detectDrift`. It must be authoritative and derived from the integration contract.

- **Option A: Module-level constant in aitri-reader.js** — defined at top of the file. Visible only within the reader. Con: not reusable if another module needs it.
- **Option B: Add to constants.js** — globally accessible. Con: constants.js currently contains only primitive values (strings, numbers, frozen objects of those); an object mapping phase keys to filenames is a schema concern, not a pure constant.

**Decision:** Option A (module-level constant in aitri-reader.js).
**Reason:** Only `detectDrift` inside `aitri-reader.js` uses this map. Adding schema knowledge to `constants.js` would mix concerns. If another module needs it in the future, promotion to constants.js is trivial.
**Consequences:** ARTIFACT_MAP is private to aitri-reader. Tests that verify path construction must import readAitriState (the public API) and test via observable outputs.

---

### Failure Blast Radius

**Component: computeFileHash (file read for drift detection)**
- Blast radius: If an artifact file is unreadable (permissions, moved), the hash check for that phase throws internally. `detectDrift` catches the error and continues to the next phase — no drift false-positive.
- User impact: That specific phase is silently skipped in hash check. If `driftPhases[]` is also absent, the phase reports no drift even if it has actually drifted.
- Recovery: Automatic — error is caught per-phase. No user action required. Acceptable degradation: worst case is a missed drift signal, not a false alarm or crash.

**Component: getInstalledAitriVersion (subprocess)**
- Blast radius: If `execFileSync` throws (ENOENT, timeout, non-zero exit), the try/catch sets the cache to `null`. All VERSION_MISMATCH rules for all projects in the cycle evaluate as "version unknown" → no alert emitted.
- User impact: No VERSION_MISMATCH alerts appear (silent degradation). All other alerts function normally. Collection cycle completes on time.
- Recovery: Automatic. If the user installs the CLI later, the cache remains `null` for the process lifetime (module singleton). User must restart `aitri-hub monitor` to pick up the newly installed CLI.

---

### Traceability Checklist

- [x] FR-010 addressed: `readAitriState` returns `aitriVersion`, `updatedAt`, `createdAt`
- [x] FR-011 addressed: `artifactsDir` defaults to `''`; `projectName` defaults to `path.basename(projectDir)`
- [x] FR-012 addressed: `detectDrift` checks `driftPhases[]` as fast path
- [x] FR-013 addressed: `detectDrift` implements dynamic sha256 hash check; missing hash = no drift
- [x] FR-014 addressed: `evaluateAlerts` adds Rule 7 with module-cached `getInstalledAitriVersion()`
- [x] NFR-010 addressed: sha256 fast, capped at 7 phases × file size; driftPhases short-circuits
- [x] NFR-011 addressed: `execFileSync` wrapped in try/catch with 3000ms timeout
- [x] NFR-012 addressed: CI/CD — existing test suite extended; no new CI config
- [x] NFR-013 addressed: Observability N/A — no new process
- [x] NFR-014 addressed: ARTIFACT_MAP whitelist prevents path traversal
- [x] Every ADR has ≥2 options: ADR-01 (3 options), ADR-02 (3 options), ADR-03 (2 options)
- [x] no_go_zone respected: no writes to .aitri, no CLI command execution, no new files, no compliance-reader, VERSION_MISMATCH is warning-only
