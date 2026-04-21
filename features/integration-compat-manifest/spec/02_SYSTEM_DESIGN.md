# System Design — integration-compat-manifest

## Executive Summary

This feature replaces a compile-time ES-module constant (`INTEGRATION_LAST_REVIEWED` in `lib/constants.js`) with a user-data-directory JSON manifest (`~/.aitri-hub/integration-compat.json`) that the collector re-reads every cycle and a new CLI subcommand (`aitri-hub integration review <version>`) that writes. The review command computes a SHA-256 over the CHANGELOG.md section for the named version, storing it in the manifest as provenance against later tampering. No runtime dependencies are added; the feature uses only Node built-ins (`fs`, `path`, `crypto`, `child_process`).

**Technology decisions (all inherited from parent, one new module pattern):**

| Layer                | Technology                    | Version | Reason                                                                                                                                             |
|----------------------|-------------------------------|---------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| CLI runtime          | Node.js ESM (zero deps)       | ≥18     | Inherited from parent; the parent's zero-dependency constraint (`constraints[1]`) applies verbatim.                                                |
| Hashing              | `crypto.createHash('sha256')` | builtin | Built-in hash primitive; meets FR-032 without adding a dependency.                                                                                 |
| JSON I/O             | `fs` + atomic temp-rename     | builtin | Reuses the `.dashboard.json.tmp → rename` pattern in `lib/store/dashboard.js` for safety against partial writes.                                   |
| CHANGELOG resolution | `child_process.execSync`      | builtin | Call `aitri --changelog-path` (if supported by the installed CLI) and fall back to documented node_modules path resolution.                        |
| CLI arg parser       | inline switch in `bin/`       | —       | Parent already uses this pattern; no argparse library.                                                                                             |

**Architectural constraints honored:**
- **Zero new runtime dependencies** (parent `constraints[1]`).
- **All persistence under `${AITRI_HUB_DIR}`** — the manifest lives at `${AITRI_HUB_DIR}/integration-compat.json`; no writes to project directories.
- **The existing `INTEGRATION_LAST_REVIEWED` export in `lib/constants.js` remains** (parent `constraints[4]`) — it is repurposed as the underlying value of the fallback baseline (FR-034).
- **No network I/O** in v1 (`no_go_zone[1]`).

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  HOST MACHINE                                                                    │
│                                                                                  │
│  ┌─────────────────────────┐       ┌───────────────────────────────────────────┐ │
│  │  CLI PROCESS #1         │       │  ${AITRI_HUB_DIR}/ (default ~/.aitri-hub) │ │
│  │  aitri-hub web          │       │  ├── projects.json           (existing)   │ │
│  │  ├── collectAll() tick  │──────▶│  ├── dashboard.json          (existing)   │ │
│  │  │     reads manifest   │◀──────│  ├── integration-compat.json (NEW)        │ │
│  │  │     reads CHANGELOG  │       │  └── logs/aitri-hub.log      (existing)   │ │
│  │  └── writes dashboard   │       └───────────────────────────────────────────┘ │
│  └─────────────────────────┘                      ▲                              │
│                                                   │ atomic write                 │
│  ┌─────────────────────────┐                      │                              │
│  │  CLI PROCESS #2 (one-   │──────────────────────┘                              │
│  │  shot, short-lived)     │                                                     │
│  │  aitri-hub integration  │                                                     │
│  │  review <version>       │                                                     │
│  │  ├── resolves CHANGELOG │                                                     │
│  │  ├── hashes section     │                                                     │
│  │  └── writes manifest    │                                                     │
│  └─────────────────────────┘                                                     │
│                                                                                  │
│  Aitri CLI (installed globally) ─── docs/integrations/CHANGELOG.md               │
│  └──────────────────▲────────────────────────────▲───────────────────────────── │
│                     │                            │                               │
│                     │ child_process:             │ direct fs read for            │
│                     │   aitri --changelog-path   │ hashing the named section     │
│                     │                            │                               │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (new vs. changed)

| Component                                        | Status  | Responsibility                                                                                                  |
|--------------------------------------------------|---------|-----------------------------------------------------------------------------------------------------------------|
| `lib/store/compat-manifest.js` **(new)**         | NEW     | Read + write the manifest atomically; validate schema; expose `readManifest()` and `writeManifest(obj)`.         |
| `lib/collector/changelog.js` **(new)**           | NEW     | Locate CHANGELOG.md via `aitri --changelog-path` (or fallback), extract a section by version heading, hash body. |
| `lib/collector/integration-guard.js`             | CHANGED | Remove import of `INTEGRATION_LAST_REVIEWED`; accept a `reviewedUpTo` argument so the caller supplies it per cycle; add drift-check branch (FR-036); extend payload with provenance fields (FR-035). |
| `lib/collector/index.js`                         | CHANGED | On every `collectAll()`, call `readManifest()` → pick effective `reviewedUpTo` (manifest or fallback) → call `integration-guard` with it. Populate alert payload with provenance. |
| `lib/commands/integration-review.js` **(new)**   | NEW     | Implement the `aitri-hub integration review <version>` subcommand. Uses `changelog.js` + `compat-manifest.js`.    |
| `bin/aitri-hub.js`                               | CHANGED | Add `integration` subcommand dispatch with `review` action.                                                      |
| `lib/constants.js`                               | CHANGED | `INTEGRATION_LAST_REVIEWED` keeps its name and value **but** is now documented as "the fallback baseline" and re-exported via `FALLBACK_BASELINE` for clarity. Both exports remain to avoid breaking existing imports. |
| `web/src/components/IntegrationAlertBanner.jsx`  | CHANGED | When `integrationAlert.reviewedAt` and `integrationAlert.changelogHash` are non-null, render a second subtext line. Purely additive DOM. |

### Data Flow — Happy Path (clearing a live alert)

1. Developer: `aitri-hub integration review 0.1.82` → CLI Process #2.
2. Process #2 calls `changelog.js.resolvePath()` → `execSync('aitri --changelog-path')`.
3. Process #2 calls `changelog.js.extractSection('0.1.82')` → returns `{ body, hash }` or throws `SectionNotFound`.
4. Process #2 builds the manifest object and calls `compat-manifest.js.writeManifest()` → atomic temp-rename under `${AITRI_HUB_DIR}`.
5. Process #2 prints the 4-line success block and exits 0.
6. Next tick of `aitri-hub web` (≤ `REFRESH_MS`): `collectAll()` calls `compat-manifest.js.readManifest()` → reads the new JSON.
7. `integration-guard` compares `detectedVersion` vs `manifest.reviewedUpTo`. Since they match, it returns `null`.
8. `dashboard.json` is written with `integrationAlert: null`.
9. Browser poll (≤ 5s) picks up the new JSON; React banner unmounts.

### ADR-01 — Manifest file vs. env var vs. settings API

| Option                              | Pros                                                             | Cons                                                                 | Outcome |
|-------------------------------------|------------------------------------------------------------------|----------------------------------------------------------------------|---------|
| **A. JSON manifest under `${AITRI_HUB_DIR}`** (chosen) | Re-readable per cycle; user-inspectable via `cat`; survives upgrades; matches existing Hub persistence (`projects.json`, `dashboard.json`). | One more file to manage; requires schema validation on read.          | ✅ Chosen |
| B. Env var `AITRI_HUB_REVIEWED_UP_TO` | Zero new files; trivial to implement.                            | Requires user to export in shell profile; lost on reboot; cannot hold provenance (hash + timestamp). | ✗ Rejected — fails FR-032/FR-035 (no hash storage). |
| C. Settings API / dbus / IPC         | Decouples storage from filesystem.                               | Adds dependency surface; no existing precedent in Hub.               | ✗ Rejected — violates zero-dep constraint. |

### ADR-02 — CHANGELOG location resolution

| Option                                          | Pros                                                 | Cons                                                                 | Outcome |
|-------------------------------------------------|------------------------------------------------------|----------------------------------------------------------------------|---------|
| **A. `aitri --changelog-path` + fallback to `require.resolve('aitri/package.json')` + `/../../docs/integrations/CHANGELOG.md`** (chosen) | Works with any install method (global npm, nvm, pnpm); works when Aitri exposes a future flag; user can override with `--changelog <path>`. | Two-layer resolution adds ~15 LOC.                                   | ✅ Chosen |
| B. Hardcoded path `/usr/local/lib/node_modules/aitri/...` | Trivial.                                             | Breaks on nvm, Windows, non-root installs; unusable in practice.     | ✗ Rejected. |
| C. Require user to pass `--changelog` always    | No resolution complexity.                            | Poor UX for the common case; hostile to FR-031 happy path.          | ✗ Rejected. |

### ADR-03 — Hash-on-write or hash-on-every-read

| Option                                            | Pros                                       | Cons                                                                 | Outcome |
|---------------------------------------------------|--------------------------------------------|----------------------------------------------------------------------|---------|
| **A. Hash once at review time; re-hash once per cycle for drift check (FR-036)** (chosen) | Enables drift detection (a motivating requirement). | Small CPU cost per cycle (~2ms for a 4 KB section) — well under NFR-030's 20ms budget. | ✅ Chosen |
| B. Hash only at review time                         | Lower CPU.                                 | Cannot detect CHANGELOG tampering after review — kills FR-036.       | ✗ Rejected. |

---

## Data Model

### `integration-compat.json` (new — feature FR-030)

**Location:** `${AITRI_HUB_DIR}/integration-compat.json` (default `~/.aitri-hub/integration-compat.json`).

**Schema (v1):**

```json
{
  "schemaVersion": "1",
  "reviewedUpTo":  "0.1.82",
  "reviewedAt":    "2026-04-20T12:30:00.000Z",
  "changelogHash": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  "reviewerNote":  null
}
```

| Field           | Type                    | Required | Notes                                                                          |
|-----------------|-------------------------|----------|--------------------------------------------------------------------------------|
| `schemaVersion` | string enum `"1"`       | yes      | Gate for future schema evolution; readers reject unknown values with WARN log. |
| `reviewedUpTo`  | string `MAJOR.MINOR.PATCH` | yes   | Semver pattern enforced via regex `^\d+\.\d+\.\d+$`.                           |
| `reviewedAt`    | ISO-8601 UTC string     | yes      | Always written as UTC with `.toISOString()`.                                   |
| `changelogHash` | 64-char lowercase hex   | yes      | SHA-256 of the trimmed body of the CHANGELOG section.                         |
| `reviewerNote`  | string or null          | no       | Optional user-supplied memo via `--note`; null by default.                    |

**Invariant:** If the file exists it MUST contain all five keys. Partial writes are prevented by the atomic temp-rename write; a file that passes `JSON.parse` but fails schema validation is treated as absent (with WARN log).

**Fallback file state:** Absent. No default file is created on Hub install. The collector's fallback path handles this.

### Extended `integrationAlert` payload in `dashboard.json` (FR-035)

The top-level `integrationAlert` field (already defined by the parent `integration-last-reviewed-gate` feature) gains two additive optional fields:

```json
{
  "integrationAlert": {
    "severity":      "warning",
    "message":       "Aitri 0.1.82 detected — Hub integration not reviewed past 0.1.80",
    "changelogUrl":  "https://github.com/cesareyeserrano/Aitri/blob/main/docs/integrations/CHANGELOG.md",
    "reviewedAt":    "2026-04-18T12:00:00.000Z",
    "changelogHash": "a1b2c3d4...a1b2"
  }
}
```

Both new fields are `null` when no manifest exists. When manifest exists both are populated (guarantee: both-or-neither, enforced by collector).

### Drift-alert shape variation (FR-036)

When CHANGELOG drift is detected, the alert's `severity` is `"warning"` and `message` contains the substring `"changelog modified since review"`. All other fields follow the shape above. No new top-level fields are introduced.

---

## API Design

This feature has no network API. The two interface surfaces are:

### 1. CLI Subcommand (new)

```
aitri-hub integration review <version> [--changelog <path>] [--note <string>]
```

**Arguments:**
- `<version>` (positional, required) — semver string `MAJOR.MINOR.PATCH`.
- `--changelog <path>` (optional) — override the CHANGELOG resolution path.
- `--note <string>` (optional) — reviewer note stored verbatim in `reviewerNote`.

**Exit codes:**
- `0` — manifest written successfully (or idempotent re-write).
- `1` — missing/invalid argument (E1, E4).
- `2` — CHANGELOG section not found (E2).
- `3` — CHANGELOG file not resolvable (E3).
- `4` — write failure (filesystem error, permission denied).

**Output contract:** See UX spec components "CLI Success Output" and "CLI Error Output" for exact line formats. The architect guarantees stdout/stderr separation: success → stdout, errors → stderr.

### 2. Internal module API (new)

**`lib/store/compat-manifest.js`:**

```js
export function readManifest(dataDir) {
  // Returns { manifest: {...} | null, reason: 'ok'|'absent'|'malformed'|'invalid-schema' }
}

export function writeManifest(dataDir, manifestObj) {
  // Atomic write via .integration-compat.json.tmp + rename
  // Throws on filesystem error; caller emits exit code 4
}
```

**`lib/collector/changelog.js`:**

```js
export function resolveChangelogPath(override = null) {
  // Returns absolute path or null
}

export function extractSection(changelogText, version) {
  // Returns { body: string, startLine: number } or throws SectionNotFound
}

export function hashSection(body) {
  // Returns 64-char lowercase hex (sha256 of body.trim())
}
```

All three are pure functions (aside from the single `child_process.execSync` in `resolveChangelogPath`) and individually unit-testable.

**`lib/collector/integration-guard.js` (changed):**

```js
// BEFORE
export function evaluateIntegrationAlert(detectedVersion) { ... }

// AFTER
export function evaluateIntegrationAlert(detectedVersion, reviewedUpTo, opts = {}) {
  // opts = { reviewedAt, changelogHash, driftDetected }
  // Returns { severity, message, changelogUrl, reviewedAt, changelogHash } | null
}
```

Breaking change to the internal signature — all existing callers are in `lib/collector/index.js` and will be updated in the same commit.

---

## Security Design

### Attack surfaces introduced

| Surface                              | Threat                                                                                                           | Mitigation                                                                                                                                |
|--------------------------------------|------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| Manifest file read                   | A malicious symlink at `${AITRI_HUB_DIR}/integration-compat.json` could point to `/etc/passwd`; a naive reader might surface its content. | Use `fs.realpathSync()` on both `${AITRI_HUB_DIR}` and the manifest file; reject any path that escapes the data directory. See NFR-032 AC. |
| Manifest file write                  | A pre-existing symlink at the manifest path could cause the atomic-rename to write outside the data dir.         | Before writing the temp file, stat the parent directory and the target path; if either is a symlink resolving outside `${AITRI_HUB_DIR}`, refuse and log WARN. |
| `--changelog <path>` argument        | User-controlled path read by the review command — low risk (user runs their own command with their own path), but could still panic on weird inputs. | Wrap read in try/catch; treat any resolution error as E3 (changelog file not found). No directory listing, no glob expansion.              |
| `--note <string>`                    | User-supplied string written to JSON — JSON-injection via quotes/newlines.                                        | Write via `JSON.stringify()` which escapes all special characters. Reviewer note length cap at 200 chars to limit manifest bloat.          |
| `aitri --changelog-path` invocation  | Spawning `aitri` executes whatever is on PATH — if PATH is compromised, we execute attacker code.                | Inherit PATH from the existing `aitri` invocations in Hub (`version-detector.js`); no new trust boundary. Document as "same trust as any Hub CLI invocation". |

**Authentication / authorization:** Not applicable — Hub is single-user local-only (parent NFR-005).

**Secrets:** None. The manifest contains only versions, timestamps, and a CHANGELOG hash. No credentials are ever stored.

**Input validation at boundaries:**
- Manifest JSON → schema-validated on read (FR-030 AC-4).
- `<version>` argument → regex `^\d+\.\d+\.\d+$` before any filesystem operation.
- `--changelog <path>` → resolved via `path.resolve()`, symlink-checked, read or rejected.

---

## Performance & Scalability

| Metric                                               | Budget                                                          | Design compliance                                                                                                                                    |
|------------------------------------------------------|-----------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------|
| Manifest read per collection cycle                   | ≤ 20ms added over baseline (NFR-030)                            | `JSON.parse` of a ~300-byte file on hot-path SSD is ~0.2ms; CHANGELOG re-hash of a ~4 KB section is ~2ms; combined ≈ 2.5ms — well under budget.     |
| `aitri-hub integration review` command total latency | < 500ms (UX spec: no spinner needed)                            | Dominant cost is `execSync('aitri --changelog-path')` (~80ms on macOS). Hashing + write < 5ms. Total expected ≈ 100–150ms.                           |
| `dashboard.json` write size                          | No meaningful increase (current ~10 KB, new fields ≤ 100 bytes) | `reviewedAt` (25 chars) + `changelogHash` (64 chars) + keys/punctuation ≈ 110 bytes per project × 1 (top-level, not per project).                    |
| Manifest file size                                   | < 512 bytes                                                     | Fixed schema, no arrays; the only variable-length field is `reviewerNote` (capped at 200 chars).                                                     |

**Scalability posture:** The feature is per-installation, not per-project. The cost is O(1) per collection cycle regardless of how many projects are registered. No scalability risk.

---

## Deployment Architecture

### Files changed / added

```
lib/
├── constants.js                           [CHANGED: add FALLBACK_BASELINE export; doc-only update to INTEGRATION_LAST_REVIEWED]
├── store/
│   └── compat-manifest.js                 [NEW: readManifest, writeManifest]
├── collector/
│   ├── changelog.js                       [NEW: resolveChangelogPath, extractSection, hashSection]
│   ├── integration-guard.js               [CHANGED: signature update, drift branch, provenance fields]
│   └── index.js                           [CHANGED: call readManifest each cycle, wire drift check]
└── commands/
    └── integration-review.js              [NEW: CLI subcommand handler]

bin/
└── aitri-hub.js                           [CHANGED: add 'integration' subcommand dispatch]

web/src/components/
└── IntegrationAlertBanner.jsx             [CHANGED: render provenance subtext when fields present]

tests/
├── unit/
│   ├── compat-manifest.test.js            [NEW]
│   ├── changelog-extract.test.js          [NEW]
│   ├── changelog-hash.test.js             [NEW]
│   ├── integration-guard.test.js          [CHANGED: new signature + drift cases]
│   └── integration-review-cmd.test.js     [NEW]
├── integration/
│   └── review-to-dashboard.test.js        [NEW: end-to-end review → dashboard.json update]
└── e2e/
    └── banner-provenance.spec.js          [NEW: banner subtext render verification]

docs/
└── integrations/CHANGELOG.md              [CHANGED: add feature entry per parent convention]
```

### No Docker / nginx changes

The feature is CLI + web-bundle only. The Docker image does not change; users do not need to rebuild their container. The web-bundle (`docker/web-dist/`) will include the updated `IntegrationAlertBanner.jsx`; the Dockerfile COPY step picks it up on next build.

### Rollout

1. Ship feature in Hub v0.1.7 (parent package).
2. Users upgrading from v0.1.6 get the new CLI subcommand; no migration required.
3. No manifest is created automatically — users continue to see the fallback-baseline behavior until they run `aitri-hub integration review`.
4. No feature flag is required; the additive design means zero risk to existing installs.

### Rollback

If the feature regresses production behavior, users can delete `~/.aitri-hub/integration-compat.json` — the collector's absent-manifest fallback path restores today's behavior exactly. A Hub-level rollback is a `npm install aitri-hub@0.1.6`.

---

## Risk Analysis

| Risk                                                                                         | Likelihood | Impact  | Mitigation                                                                                                                                                                                             |
|----------------------------------------------------------------------------------------------|------------|---------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Aitri CLI does not expose `--changelog-path` (feature's ADR-02 depends on it OR a fallback). | Medium     | Medium  | ADR-02 explicitly lists the `require.resolve('aitri/package.json')` fallback; unit test covers the fallback branch; E3 user-facing error explains the situation.                                      |
| `${AITRI_HUB_DIR}` is on a read-only mount (container, restricted environment).              | Low        | Medium  | Review command surfaces a clear E4 exit (write failure); collector continues with fallback-baseline path — no crash.                                                                                    |
| CHANGELOG section heading format drifts (e.g. `### 0.1.82` instead of `## 0.1.82`).          | Low        | Medium  | Extraction regex accepts `^##+ `; tested against all historical heading formats. New formats (e.g. front-matter, `#`) trigger E2 with a clear hint to pass `--changelog`.                              |
| Running `web` process does not pick up manifest changes (the motivating bug repeats).        | Low        | High    | The primary architectural guarantee. Enforced by (a) not importing the manifest at module load and (b) a unit test that asserts `readManifest` is called on every `collectAll()` invocation.            |
| Hash collisions in CHANGELOG drift detection (two different texts hash to the same value).  | Very low   | Low     | SHA-256 collision resistance. Acceptable residual risk.                                                                                                                                                 |
| User edits manifest by hand and breaks schema.                                               | Medium     | Low     | Schema validation on read (FR-030 AC-4) treats it as absent with WARN log; user sees "not reviewed" behavior and can re-run the review command to fix.                                                 |
| Malicious CHANGELOG committed to `aitri` repo (upstream compromise).                         | Low        | Medium  | Out of this feature's scope — inherited trust boundary. Drift detection surfaces post-review tampering within a single installation; upstream compromise is a separate risk tracked by `integration-last-reviewed-gate` itself. |
| Concurrent writes from two simultaneous `integration review` invocations.                    | Very low   | Low     | Atomic temp-rename write means one invocation's result wins; the other's temp file is left behind (cleaned by OS). Idempotency of same-version re-writes means the "loser" likely wrote the same value. |

**Blast radius for critical components:**
- `lib/collector/index.js` — if this crashes, the web dashboard loses all data (not just the integration alert). Mitigation: every new call to manifest / changelog readers is wrapped in try/catch that logs to `aitri-hub.log` and returns the "manifest absent" result.
- `lib/commands/integration-review.js` — if this crashes, the user's CLI invocation fails; no persistent damage. Mitigation: the command does not touch `dashboard.json`, `projects.json`, or any other Hub state.

---

## Technical Risk Flags

- **[RISK-1] `aitri --changelog-path` contract does not yet exist in Aitri Core** — severity: medium. The review command depends on either the flag being added upstream OR the `require.resolve()` fallback succeeding. Mitigation is in place (ADR-02 fallback) but user experience is best when the flag exists. Follow-up: file an Aitri Core backlog item requesting the `--changelog-path` flag. If Aitri Core declines, we permanently rely on the fallback, which is still correct but uglier.

- **[RISK-2] Breaking signature change to `evaluateIntegrationAlert`** — severity: low. The function signature changes from 1 arg to 3 args. All callers are internal to this package, but any downstream consumer importing from `lib/collector/integration-guard.js` would break. Mitigation: search (`grep -r 'evaluateIntegrationAlert' ~/.aitri-hub/` produces no external usage) confirms internal-only. Document in CHANGELOG.md as an internal breaking change.

- **[RISK-3] Silent drift-alert fatigue** — severity: medium. If a maintainer edits CHANGELOG.md for typos after a review, every user who reviewed that version will see the "changelog modified since review" warning until they re-review. This is by design (it IS the feature) but may annoy users over time. Mitigation: document the expected behavior in DEPLOYMENT.md; the `--note` field can be used to record trivial re-reviews quickly.

- **[RISK-4] Cross-platform path handling (Windows/WSL)** — severity: low. The parent project's NFR-004 mandates macOS/Linux/WSL2 support. Manifest path uses `path.join(os.homedir(), '.aitri-hub', 'integration-compat.json')` and `fs.realpathSync` — all Node built-ins, all cross-platform. Mitigation: CI test matrix includes Windows runner (already present in `.github/workflows/ci.yml`).

**Top risks (ranked):**
1. **RISK-1** — dependency on upstream Aitri Core feature; mitigated by fallback.
2. **RISK-3** — post-review drift alert may be perceived as noisy; acceptable trade-off.
3. **RISK-2** — internal signature change; documented and auditable.
