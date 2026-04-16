# System Design — integration-last-reviewed-gate

## Executive Summary

This feature adds two capabilities to the existing Aitri Hub Node.js + React system with zero new runtime dependencies, following the project's zero-dep CLI constraint and React-only web constraint.

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| CLI runtime | Node.js ESM | ≥18.0.0 | Inherited — no change |
| CLI version detection | `child_process.execFileSync` | built-in | Zero-dep; `aitri --version` stdout parse is sufficient |
| Semver comparison | Inline split/compare utility | N/A | Zero-dep constraint prohibits `semver` npm package; three-part integer comparison covers all cases in this project |
| Feature reader | New ESM module `lib/collector/feature-reader.js` | N/A | Separation of concerns — existing aitri-reader handles main `.aitri`; feature scanning is a distinct concern |
| Integration guard | `INTEGRATION_LAST_REVIEWED` constant in `lib/constants.js` | N/A | Single source of truth; existing constants module is the correct home |
| Dashboard schema | Extend existing `lib/store/dashboard.js` data shape | N/A | Additive fields only — backward compatible |
| Web frontend | React 18.3.x | 18.3.x | Inherited — no change |
| New React components | `IntegrationAlertBanner`, `FeatureSummarySection` | N/A | Functional components using existing CSS design tokens |

---

## System Architecture

No new processes, services, or external integrations are introduced. All changes are additive modifications to existing modules within the single CLI process and the React frontend.

```
┌────────────────────────────────────────────────────────────────────────────┐
│  CLI PROCESS (Node.js ESM)                                                 │
│                                                                            │
│  lib/collector/index.js  (MODIFIED)                                        │
│  ├── aitri-version-reader.js        [NEW] FR-013                           │
│  │   └── execFileSync('aitri', ['--version'])                              │
│  │       → detectedAitriVersion: string | null                             │
│  │                                                                         │
│  ├── integration-guard.js           [NEW] FR-010                           │
│  │   ├── reads INTEGRATION_LAST_REVIEWED from lib/constants.js             │
│  │   ├── compareSemver(detected, reviewed) → boolean                       │
│  │   └── → integrationAlert: { severity, message, changelogUrl } | null   │
│  │                                                                         │
│  ├── feature-reader.js              [NEW] FR-011                           │
│  │   ├── scans projectDir/features/*/                                      │
│  │   ├── reads each features/<name>/.aitri  (via readAitriState)           │
│  │   ├── reads each features/<name>/spec/04_TEST_RESULTS.json              │
│  │   └── → featurePipelines: FeaturePipelineEntry[]                        │
│  │       → aggregatedTcTotal: number                                       │
│  │                                                                         │
│  └── (existing readers: aitri-reader, git-reader, test-reader, …)         │
│                                                                            │
│  lib/constants.js  (MODIFIED)                                              │
│  └── + INTEGRATION_LAST_REVIEWED = '0.1.76'                               │
│                                                                            │
│  lib/store/dashboard.js  (MODIFIED)  FR-014                               │
│  └── DashboardData shape extended:                                         │
│      + integrationAlert field (top-level)                                  │
│      + featurePipelines per project entry                                  │
│      + aggregatedTcTotal per project entry                                 │
│                                                                            │
│  lib/renderer/cli/  (MODIFIED)  FR-012                                     │
│  └── render alert line before project rows                                 │
│      TC column: aggregatedTcTotal + (+N features) indicator                │
│                                                                            │
└──────────────────┬─────────────────────────────────────────────────────────┘
                   │ atomic write
                   ▼
         ~/.aitri-hub/dashboard.json  (SCHEMA EXTENDED)
                   │
                   │ volume mount (read-only)
                   ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  DOCKER CONTAINER — nginx + React (MODIFIED)  FR-012                       │
│                                                                            │
│  src/web/src/components/                                                   │
│  ├── IntegrationAlertBanner.jsx     [NEW]                                  │
│  │   └── rendered when dashboard.integrationAlert != null                  │
│  ├── FeatureSummarySection.jsx      [NEW]                                  │
│  │   └── collapsible; rendered per project when featurePipelines.length>0  │
│  └── ProjectCard.jsx                [MODIFIED]                             │
│      └── TC count reads aggregatedTcTotal                                  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Module Responsibilities

| Module | Change | Responsibility |
|--------|--------|----------------|
| `lib/constants.js` | Add `INTEGRATION_LAST_REVIEWED` | Single source of truth for reviewed version constant |
| `lib/collector/aitri-version-reader.js` | New | Detect installed Aitri CLI version via `execFileSync`; return semver string or null |
| `lib/collector/integration-guard.js` | New | Compare detected version vs. `INTEGRATION_LAST_REVIEWED`; produce `integrationAlert` object or null |
| `lib/collector/feature-reader.js` | New | Scan `features/*/`, read `.aitri` and `04_TEST_RESULTS.json` per feature; return aggregated data |
| `lib/collector/index.js` | Modify | Call new readers; inject `featurePipelines`, `aggregatedTcTotal`, `integrationAlert` into collection result |
| `lib/store/dashboard.js` | Modify | Accept and write extended `DashboardData` shape with new fields |
| `lib/renderer/cli/` | Modify | Render integration alert line before project table; display `aggregatedTcTotal` with feature count indicator |
| `src/web/src/components/IntegrationAlertBanner.jsx` | New | Full-width warning banner; renders from `dashboard.integrationAlert` |
| `src/web/src/components/FeatureSummarySection.jsx` | New | Collapsible feature list per project card; reads `featurePipelines` |
| `src/web/src/components/ProjectCard.jsx` | Modify | TC count reads `aggregatedTcTotal` instead of `testSummary.total` |

---

## Data Model

### `lib/constants.js` — new export

```js
// FR-010 — Aitri Core integration gate
// Bump manually after reviewing docs/integrations/CHANGELOG.md
export const INTEGRATION_LAST_REVIEWED = '0.1.76';
```

### `dashboard.json` — extended schema

Top-level structure (additive, backward compatible with existing array-wrapped or object-wrapped formats):

```jsonc
{
  "schemaVersion": "1",
  "collectedAt": "<ISO-8601 timestamp>",
  "meta": {
    "detectedAitriVersion": "0.1.77"  // string | null  — FR-013
  },
  "integrationAlert": {               // object | null  — FR-010
    "severity": "warning",
    "message": "Aitri 0.1.77 detected — Hub integration not reviewed past 0.1.76",
    "changelogUrl": "https://github.com/cesareyeserrano/Aitri/blob/main/docs/integrations/CHANGELOG.md"
  },
  "projects": [
    {
      // --- existing fields (unchanged) ---
      "name": "string",
      "location": "string",
      "status": "healthy | warning | error | unreadable",
      "phases": { "current": 4, "approved": [1,2,3], "total": 5 },
      "verifyStatus": { "passed": true, "summary": { "passed": 26, "failed": 1, "skipped": 0 } },
      "gitMeta": { "lastCommit": "<ISO>", "branch": "main", "velocity": 12 },
      "testSummary": { "passed": 30, "failed": 0, "total": 30 },
      "alerts": [],
      // --- new fields (FR-011, FR-014) ---
      "featurePipelines": [           // FeaturePipelineEntry[]  — empty array if no features
        {
          "name": "string",           // directory name under features/
          "approvedPhases": [1, 2],   // number[]
          "currentPhase": 3,          // number | null
          "totalPhases": 5,           // number — always 5
          "tcCount": 61,              // number — from feature's 04_TEST_RESULTS.json, or 0
          "verifyStatus": {           // object | null
            "passed": false,
            "summary": { "passed": 0, "failed": 0, "skipped": 0 }
          }
        }
      ],
      "aggregatedTcTotal": 91         // number — testSummary.total + sum(featurePipelines[*].tcCount)
    }
  ]
}
```

### `FeaturePipelineEntry` type contract

| Field | Type | Source | Null when |
|-------|------|--------|-----------|
| `name` | string | directory name | never |
| `approvedPhases` | number[] | feature `.aitri`.approvedPhases | defaults to `[]` |
| `currentPhase` | number\|null | feature `.aitri`.currentPhase | `.aitri` unreadable |
| `totalPhases` | number | constant `5` | never |
| `tcCount` | number | feature `spec/04_TEST_RESULTS.json`.summary.total | `0` if file absent |
| `verifyStatus` | object\|null | feature `.aitri`.verifyPassed / verifySummary | null if absent |

### Semver comparison utility

Inline function in `lib/collector/integration-guard.js` — no external dependency:

```js
// Returns true if versionA > versionB (semver major.minor.patch)
function semverGt(a, b) {
  if (!a || !b) return false;
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false;
  }
  return false; // equal
}
```

---

## API Design

No new HTTP endpoints. The web dashboard reads `dashboard.json` via nginx static file serving at `/data/dashboard.json` — unchanged from the existing contract.

### Internal module API — new exports

#### `lib/collector/aitri-version-reader.js`

```js
/**
 * Detect the installed Aitri CLI version by running `aitri --version`.
 * @returns {string | null}  Semver string (e.g. '0.1.77') or null on failure.
 */
export function detectAitriVersion(): string | null
```

- Executes `execFileSync('aitri', ['--version'], { timeout: 3000, encoding: 'utf8' })`
- Parses first semver-like pattern from stdout (`/\d+\.\d+\.\d+/`)
- On any error (ENOENT, timeout, parse fail) → logs WARN to `~/.aitri-hub/logs/aitri-hub.log`, returns `null`

#### `lib/collector/integration-guard.js`

```js
/**
 * Evaluate integration version alignment.
 * @param {string | null} detectedVersion
 * @returns {{ severity: 'warning', message: string, changelogUrl: string } | null}
 */
export function evaluateIntegrationAlert(detectedVersion): IntegrationAlert | null
```

- Reads `INTEGRATION_LAST_REVIEWED` from `lib/constants.js`
- If `detectedVersion` is null → returns warning alert "Aitri CLI version undetectable"
- If `semverGt(detected, reviewed)` → returns warning alert with version strings
- Otherwise → returns `null`

#### `lib/collector/feature-reader.js`

```js
/**
 * Scan a project's features/ directory and aggregate feature pipeline data.
 * @param {string} projectDir  Absolute path to the project root.
 * @param {number} mainTcTotal  TC count from the main pipeline's 04_TEST_RESULTS.json.
 * @returns {{ featurePipelines: FeaturePipelineEntry[], aggregatedTcTotal: number }}
 */
export function readFeaturePipelines(projectDir, mainTcTotal):
  { featurePipelines: FeaturePipelineEntry[], aggregatedTcTotal: number }
```

- Reads `features/` with `fs.readdirSync`; silently returns empty if directory absent
- Per subdirectory: calls existing `readAitriState(featureDir)` for phase data
- Per subdirectory: reads `featureDir/spec/04_TEST_RESULTS.json` for TC count
- Directories with no `.aitri` file are skipped silently (logged at DEBUG level)
- `aggregatedTcTotal = mainTcTotal + sum(featurePipelines[*].tcCount)`

---

## Security Design

### Input validation

`feature-reader.js` path construction:
- Feature names (directory entries) are validated against pattern `/^[a-zA-Z0-9_-]+$/` before use in `path.join()`
- Entries failing validation are skipped with a WARN log — prevents path traversal via malformed directory names
- All reads are within the registered project directory — no user-supplied paths accepted at this layer

`aitri-version-reader.js`:
- Uses `execFileSync` with an explicit argument array (not shell string interpolation) — no injection surface
- No user input is passed to the child process

### No new attack surfaces

- No new HTTP endpoints
- No new environment variable reads beyond the existing pattern in `constants.js`
- All new filesystem reads are within registered project directories (already trusted by FR-002)
- `INTEGRATION_LAST_REVIEWED` is a hardcoded compile-time constant — not configurable at runtime

---

## Performance & Scalability

### Feature scanning overhead (NFR-010)

- `readFeaturePipelines` uses synchronous `fs.readdirSync` + `readAitriState` per feature
- For a project with 10 features: ~10 × (JSON parse of `.aitri` + JSON parse of `04_TEST_RESULTS.json`) = ~10ms per project at worst case on SSD
- This is within the existing 5s cycle budget (NFR-010) — even at 20 projects × 10 features = 200 file reads, estimated ≤200ms total

### `aitri --version` call overhead (FR-013)

- `execFileSync` with 3s timeout called **once per collection cycle** at the top of `collector/index.js`, not per project
- Detected version is cached in-memory for the duration of the cycle; no repeated subprocess spawns
- On cold start (first cycle): ~50–100ms; subsequent cycles: same cost

### Dashboard.json write size

- Each project entry grows by `featurePipelines` array + `aggregatedTcTotal` integer
- For 20 projects × 10 features avg: ~2KB additional per cycle — negligible for atomic write via rename

---

## Deployment Architecture

No changes to deployment infrastructure. This feature ships as:
1. Updated Node.js source files in `lib/` (CLI side)
2. Updated React source files in `src/web/src/` (web side)
3. Docker image rebuild required to pick up React changes (existing procedure in DEPLOYMENT.md)

Existing deployment commands remain unchanged:
```sh
npm install
node bin/aitri-hub.js setup
docker compose -f docker/docker-compose.yml up --build -d
```

---

## Risk Analysis

### ADR-05: Semver comparison — inline utility vs. `semver` npm package

**Context:** FR-010 requires comparing two semver strings. The project has a zero-npm-dependency constraint for the CLI.

**Option A: `semver` npm package**
- Pros: battle-tested, handles edge cases (pre-release, build metadata)
- Cons: violates zero-dep constraint; adds ~50KB to node_modules; pre-release versions are not used in this project

**Option B: Inline split/compare (3-tuple integer comparison)**
- Pros: zero deps; sufficient for `major.minor.patch` format used by Aitri CLI
- Cons: does not handle pre-release tags (`0.1.77-beta.1`) — acceptable since Aitri CLI publishes only stable releases

**Decision: Option B** — the zero-dep constraint is non-negotiable; Aitri CLI only publishes stable `X.Y.Z` versions.

**Consequences:** If Aitri CLI ever publishes pre-release tags, the comparison will fail gracefully (null return from version parse → undetectable alert, not a crash).

---

### ADR-06: Feature reader placement — extend `aitri-reader.js` vs. separate module

**Context:** Feature data comes from `.aitri` files, which `aitri-reader.js` already handles for the main pipeline. Could be co-located or separated.

**Option A: Extend `aitri-reader.js`**
- Pros: reuses existing module; fewer files
- Cons: violates single responsibility — `aitri-reader` reads one project's state; feature scanning is a different concern (directory iteration + aggregation)

**Option B: New `feature-reader.js` module**
- Pros: clear SRP; `feature-reader` calls `readAitriState` from `aitri-reader` as a sub-call — proper dependency direction
- Cons: one more file

**Decision: Option B** — SRP and testability outweigh the minor file count increase.

**Consequences:** `feature-reader.js` depends on `aitri-reader.js` for the per-feature state read — existing reader is reused without modification.

---

### ADR-07: `integrationAlert` scope — top-level dashboard field vs. per-project field

**Context:** The integration version mismatch is a system-level condition, not per-project. Should it live at the dashboard root or be duplicated in every project entry?

**Option A: Per-project field**
- Pros: each project entry is self-contained
- Cons: redundant — the same alert object would be duplicated N times (once per project); incorrect semantics (the alert is about the Hub installation, not any individual project)

**Option B: Top-level `integrationAlert` field**
- Pros: correct semantics; single source; React banner reads one field; reduces dashboard.json size
- Cons: web frontend must read both top-level and project-level data (already does this for `collectedAt`)

**Decision: Option B** — semantic accuracy and DRY principle outweigh minor frontend complexity.

**Consequences:** React `App.jsx` passes `dashboard.integrationAlert` to `IntegrationAlertBanner` alongside `dashboard.projects` to `ProjectCard` — two separate props, clean separation.

---

### ADR-08: Feature collapse state — React `useState` vs. `localStorage`

**Context:** The `FeatureSummarySection` is collapsed by default. Should the expanded/collapsed state persist across page reloads?

**Option A: `localStorage` persistence**
- Pros: state survives reload
- Cons: adds localStorage read/write; requires key namespacing per project; monitoring dashboards are typically not customized at this level; UX spec explicitly says "in-session only"

**Option B: React `useState` (in-session only)**
- Pros: simple; no side effects; consistent with UX spec decision; collapsed-by-default on each reload is the correct default for a monitoring dashboard
- Cons: state lost on reload (acceptable per UX spec)

**Decision: Option B** — consistent with UX spec and monitoring dashboard conventions.

**Consequences:** Each page reload starts with all feature sections collapsed — user expands on demand, per session.

---

### Failure Blast Radius

**Component: `aitri --version` subprocess (FR-013)**
- Blast radius: `detectAitriVersion()` returns null → `evaluateIntegrationAlert(null)` generates "version undetectable" warning
- User impact: CLI and web show "Aitri CLI version undetectable" warning instead of version-specific message; all project data still renders normally
- Recovery: automatic on next collection cycle if CLI becomes available; no manual intervention required

**Component: `features/` directory scan (FR-011)**
- Blast radius: if `fs.readdirSync` throws (e.g., permissions error), `readFeaturePipelines` catches the error, logs WARN, returns `{ featurePipelines: [], aggregatedTcTotal: mainTcTotal }` — main pipeline data is unaffected
- User impact: project shows main TC count only; no feature section in CLI or web; no crash
- Recovery: automatic on next cycle if permissions are restored

**Component: Individual feature `.aitri` read failure (FR-011)**
- Blast radius: that specific feature entry is skipped; all other features in the same project still aggregate correctly
- User impact: feature count indicator shows N-1 features; aggregatedTcTotal excludes the failed feature's count; WARN logged
- Recovery: automatic on next cycle

---

## Technical Risk Flags

[RISK] `execFileSync` blocks the Node.js event loop during `aitri --version` execution
Conflict: NFR-010 requires collection cycle ≤5s; Node.js single-threaded; `execFileSync` blocks
Mitigation: 3s timeout on `execFileSync` + called once per cycle (not per project); worst-case blocking is 3s on a hung process, then null return and cycle continues; acceptable within 5s budget for the single call
Severity: low

[RISK] Semver comparison does not handle pre-release tags
Conflict: FR-010 requires correct comparison; inline utility only handles `X.Y.Z`
Mitigation: Aitri CLI publishes only stable releases; `0.1.77-beta.1` format is not used; if pre-release version is detected, the regex `/\d+\.\d+\.\d+/` extracts the numeric part correctly (`0.1.77`) and comparison proceeds normally
Severity: low

---

## Traceability Checklist

- [x] FR-010 addressed: `integration-guard.js` + `INTEGRATION_LAST_REVIEWED` in `constants.js`
- [x] FR-011 addressed: `feature-reader.js` + `collector/index.js` integration
- [x] FR-012 addressed: CLI renderer modification + `IntegrationAlertBanner` + `FeatureSummarySection`
- [x] FR-013 addressed: `aitri-version-reader.js`
- [x] FR-014 addressed: `dashboard.js` schema extension (additive, backward compatible)
- [x] NFR-010 addressed: Performance section — feature scan ≤200ms for 20×10 features
- [x] NFR-011 addressed: Failure blast radius for feature scan; try/catch with WARN log
- [x] NFR-012 addressed: `aitri-version-reader.js` WARN log on detection failure
- [x] ADR-05 through ADR-08: each has ≥2 options evaluated
- [x] no_go_zone honored: no writes to feature `.aitri` files; no recursive scanning; no per-feature git metadata; no auto-bump of constant; no allow/deny config UI
- [x] Failure blast radius: documented for 3 components
- [x] Technical Risk Flags: 2 flags declared (both low severity)
