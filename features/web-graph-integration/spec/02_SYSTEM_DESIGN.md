# System Architecture — web-graph-integration
## Aitri Hub: CLI Removal + Artifact Graph Tab

---

## Executive Summary

This feature makes two scoped changes to the existing Aitri Hub codebase:

1. **CLI monitor removal** — Delete `lib/commands/monitor.js` and `lib/renderer/cli.js`. Replace the `monitor` dispatch entry in `bin/aitri-hub.js` with a one-line redirect stub. Zero impact on `web` or `setup` commands; the collection loop already lives inside `cmdWeb`.

2. **Artifact Graph tab** — Extend the collector with a new `readSpecArtifacts` reader that reads `spec/01_REQUIREMENTS.json` and `spec/03_TEST_CASES.json` per local project and includes the parsed data in each project's `dashboard.json` entry under a `specArtifacts` field. The React frontend gets a new `GraphTab` component that reads this data from the existing polling response, normalizes it into Cytoscape elements, and renders an interactive DAG. Cytoscape.js 3.x + cytoscape-dagre are added as npm devDependencies, bundled by Vite.

**No new servers, no new endpoints, no new API routes, no Docker changes.**

| Layer | Technology | Version | Reason |
|-------|-----------|---------|--------|
| CLI runtime | Node.js ESM | ≥18.0.0 | Unchanged — matches existing project |
| Frontend | React | 18.3.x | Unchanged — existing SPA |
| Build | Vite | 5.x | Unchanged — existing bundler |
| Graph engine | Cytoscape.js | 3.29.x | Industry-standard graph rendering; dagre plugin provides hierarchical layout |
| Layout algorithm | cytoscape-dagre | 2.5.x | Directed Acyclic Graph hierarchical layout; wraps dagre.js |
| Data channel | dashboard.json (existing) | — | Zero new endpoints; reuses 5s polling already in place |

---

## System Architecture

```
bin/aitri-hub.js
├── setup   → lib/commands/setup.js        (unchanged)
├── web     → lib/commands/web.js          (unchanged)
└── monitor → [STUB] prints redirect msg, exits 0   ← FR-010

lib/commands/web.js
  ├── runCollectionCycle() every 5s
  │   └── collectAll(projects)             (lib/collector/index.js)
  │       ├── readAitriState()             (unchanged)
  │       ├── readGitMeta()                (unchanged)
  │       ├── readTestSummary()            (unchanged)
  │       ├── readRequirementsSummary()    (unchanged)
  │       ├── readComplianceSummary()      (unchanged)
  │       ├── readSpecQuality()            (unchanged)
  │       ├── readExternalSignals()        (unchanged)
  │       └── readSpecArtifacts()          ← NEW — FR-012
  │           reads spec/01_REQUIREMENTS.json
  │           reads spec/03_TEST_CASES.json
  │           returns { status, requirements, testCases, error }
  └── writeDashboard(data)                 (unchanged — schema extended)

~/.aitri-hub/dashboard.json
  projects[n].specArtifacts: {             ← NEW FIELD
    status: "loaded"|"missing"|"error"|"remote",
    requirements: { functional_requirements:[] } | null,
    testCases: { test_cases:[] } | null,
    error: string | null
  }

web/ (React + Vite)
├── web/package.json                       ← adds cytoscape, cytoscape-dagre devDeps
├── src/App.jsx                            ← adds "Graph" as tab 7
├── src/components/GraphTab.jsx            ← NEW — FR-011, FR-013, FR-014, FR-015, FR-016
├── src/lib/graphNormalizer.js             ← NEW — translates specArtifacts → Cytoscape elements
└── src/components/GraphLegend.jsx         ← NEW — FR-014 legend panel

DELETED:
├── lib/commands/monitor.js                ← FR-010
└── lib/renderer/cli.js                    ← FR-010
```

---

## Data Model

### dashboard.json — extended project entry

Each project entry in `dashboard.json` gains one new top-level field: `specArtifacts`.

```jsonc
{
  "schemaVersion": "1",
  "collectedAt": "ISO8601",
  "projects": [
    {
      // --- existing fields (unchanged) ---
      "name": "string",
      "location": "/absolute/path or https://github.com/...",
      "phases": { "current": 4, "approved": [1,2,3], "completed": [1,2,3] },
      "verifyStatus": { "passed": true, "summary": { "passed":24, "failed":0 } },
      "gitMeta": { "branch": "main", "lastCommitAge": 3600, "velocity": 12 },
      "testSummary": { "passed": 24, "failed": 0, "total": 24 },
      "alerts": [{ "type": "string", "message": "string", "severity": "blocking|warning|info" }],
      "healthScore": 90,

      // --- NEW field ---
      "specArtifacts": {
        "status": "loaded",       // "loaded" | "missing" | "error" | "remote"
        "requirements": {          // null when status != "loaded"
          "functional_requirements": [
            {
              "id": "FR-001",
              "title": "string",
              "priority": "MUST|SHOULD|NICE",
              "type": "UX|persistence|security|reporting|logic"
              // description omitted to keep dashboard.json compact
            }
          ]
        },
        "testCases": {             // null when status != "loaded" or file absent
          "test_cases": [
            {
              "id": "TC-001",
              "requirement_id": "FR-001",   // edge source for graph
              "title": "string",
              "status": "pending|passing|failing"
            }
          ]
        },
        "error": null              // populated when status == "error"; message string
      }
    }
  ]
}
```

**Size constraint**: `readSpecArtifacts` strips `description`, `acceptance_criteria`, and `user_stories` fields from requirements before writing to dashboard.json. Only `id`, `title`, `priority`, `type` per FR are kept. For TC: `id`, `requirement_id`, `title`, `status`. A project with 50 FRs + 150 TCs adds ≈ 15–20KB to dashboard.json — acceptable given the existing file is already ~5–50KB per project.

**`artifactsDir` handling**: The spec file path is NOT always `spec/`. The `aitriState.artifactsDir` field (from `.aitri`, populated by `aitri-reader.js` into `dashboard.json`) must be used to construct the path:
```js
const specDir = path.join(project.location, project.aitriState?.artifactsDir ?? 'spec');
const reqPath = path.join(specDir, '01_REQUIREMENTS.json');
const tcPath  = path.join(specDir, '03_TEST_CASES.json');
```
For projects initialized before v0.1.20, `artifactsDir` may be `""` — meaning spec files live at the project root. The empty string case must be handled (path.join with `""` resolves correctly to the project root).

**Coordination with `requirements-reader.js`**: The existing `requirements-reader.js` already reads `01_REQUIREMENTS.json` for FR coverage statistics. `readSpecArtifacts` reads the same file but extracts the full FR list (id, title, priority, type). To avoid reading the file twice per cycle, `readSpecArtifacts` is called after `aitri-reader.js` has populated `aitriState` (which provides `artifactsDir`), and the result is appended as `specArtifacts` to the project entry without replacing `requirementsSummary`.

### graphNormalizer.js — internal data contract

```js
// Input
normalizeSpecArtifacts(specArtifacts: SpecArtifacts, aitriState: AitriState): CytoscapeElements
// aitriState comes from the project entry in dashboard.json (populated by aitri-reader.js)
// Required fields: aitriState.hasDrift (boolean), aitriState.approvedPhases (array), aitriState.completedPhases (array)

// Output
{
  nodes: [
    { data: { id: "FR-001", label: "FR-001", type: "fr", status: "approved", title: "..." } },
    { data: { id: "TC-001", label: "TC-001", type: "tc", status: "passing", parentFr: "FR-001" } }
  ],
  edges: [
    { data: { id: "FR-001--TC-001", source: "FR-001", target: "TC-001" } }
  ]
}
```

**status mapping** (FR node):
Uses `aitriState` from the project entry in `dashboard.json` (populated by `aitri-reader.js`).
Source of truth: `docs/integrations/ARTIFACTS.md` — "Node hierarchy for graph consumers".

| condition (checked in order) | status |
|---|---|
| phase `"1"` is in `aitriState.driftPhases[]` | `"drift"` |
| `"1"` is in `aitriState.approvedPhases` | `"approved"` |
| `aitriState.currentPhase === 1` | `"in_progress"` |
| otherwise | `"pending"` |

Note: drift is **phase-specific** — check `driftPhases.map(String).includes('1')`, not the generic `hasDrift` boolean. `driftPhases[]` may be absent in projects created before v0.1.58 — default to `[]`.

**status mapping** (TC node):
Phase-derived, same source of truth as FR nodes:

| condition (checked in order) | status |
|---|---|
| phase `"3"` is in `aitriState.driftPhases[]` | `"drift"` |
| `"3"` is in `aitriState.approvedPhases` | `"approved"` |
| `aitriState.currentPhase === 3` | `"in_progress"` |
| otherwise | `"pending"` |

Note: TC node status is derived from pipeline phase state, NOT from the `status` field in `03_TEST_CASES.json` individual test case entries. This matches the canonical contract in `ARTIFACTS.md`.

---

## API Design

This feature adds **no new HTTP endpoints**. The frontend consumes the existing `/data/dashboard.json` endpoint (GET, served by `web.js`). The spec artifacts are delivered inline.

### Internal module API

```js
// lib/collector/spec-reader.js
export async function readSpecArtifacts(project: Project): Promise<SpecArtifacts>
// project.location must be a local absolute path; remote URLs return { status: "remote" }
// Returns: { status: "loaded"|"missing"|"error"|"remote", requirements, testCases, error }
// Never throws — all errors are caught and returned as { status: "error", error: message }

// web/src/lib/graphNormalizer.js
export function normalizeSpecArtifacts(specArtifacts: SpecArtifacts): CytoscapeElements
// Pure function — no side effects, no async, no external calls
// Returns { nodes: [], edges: [] } for any non-"loaded" status

// web/src/components/GraphTab.jsx  (React component)
// Props: { projects: Project[] }   — receives full dashboard.json projects array
// Internal state: { selectedProject, collapseMap: Map<frId, boolean> }
// Reads specArtifacts from projects[selected].specArtifacts — no fetch, no async
```

---

## Security Design

**Input validation — `readSpecArtifacts`:**
- `project.location` is validated as an absolute local path using `path.isAbsolute()`. Remote URLs (`http://`, `https://`) return `{ status: "remote" }` without any filesystem access.
- Spec file paths are constructed as `path.join(project.location, 'spec', '01_REQUIREMENTS.json')` and resolved with `path.resolve()`. The resolved path is checked to start with `project.location` before reading — prevents path traversal if `project.location` itself contains `..` segments.
- File reads use `fs.readFile` with a 1MB size guard. Files exceeding 1MB return `{ status: "error", error: "spec file exceeds 1MB limit" }`.
- `JSON.parse` is wrapped in try/catch — malformed JSON returns `{ status: "error" }`.

**Frontend — no new attack surface:**
- No new endpoints are added to `web.js`. The existing `/data/` route already has path traversal protection (`filePath.startsWith(dataDir)`).
- `dashboard.json` is written server-side by the trusted collector. The frontend only reads it — no user-supplied data flows back to the filesystem.
- Cytoscape renders to a `<canvas>` element — no innerHTML, no dangerouslySetInnerHTML, no XSS vector from spec file content. Node labels are set via Cytoscape's `data()` API which escapes content.

**CSP headers** (existing, unchanged): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`.

---

## Performance & Scalability

**Collection cycle impact (FR-012, NFR-006):**
- `readSpecArtifacts` runs synchronously per project using `fs.readFileSync`. For 20 projects with spec files present, 2 file reads each = 40 file reads. On an SSD, 40 small file reads complete in < 50ms total — within the existing NFR-001 5s budget.
- Fields stripped before writing (description, acceptance_criteria, user_stories) reduce per-project payload to ~15–20KB max.

**Graph rendering (NFR-006 — ≤2s for 50 FRs + 150 TCs):**
- Cytoscape.js with dagre layout for 200 nodes is well within the library's documented performance envelope (tested to 5000+ nodes).
- `normalizeSpecArtifacts` is a pure synchronous function — no async overhead.
- Cytoscape instance is created once per project selection and destroyed on project change (`cy.destroy()`). React `useEffect` cleanup handles this.
- `fit()` is called after `layout.run()` completes via the `layoutstop` event — not on a timer.

**dashboard.json growth:**
- Baseline: ~5–50KB per project without spec artifacts.
- With spec artifacts (stripped): ~15–20KB additional per project.
- For 20 projects: ~300–400KB max total. HTTP GET with `no-cache` headers, served from localhost — negligible latency.

---

## Deployment Architecture

**No changes to deployment** — the feature ships as a code change to the existing single-process Node.js server + Vite-built React SPA.

```
Before:                          After:
  npm install (CLI)                npm install (CLI) — unchanged
  npm install (web/)               npm install (web/) — adds cytoscape, cytoscape-dagre
  npm run build (web/)             npm run build (web/) — bundle includes Cytoscape
  aitri-hub web                    aitri-hub web
```

**Removed files** (no deployment impact):
- `lib/commands/monitor.js`
- `lib/renderer/cli.js`

**Docker** (existing `docker/` setup): unchanged. The web build is copied to `docker/web-dist/` — the new Cytoscape bundle is automatically included in the next build.

---

## Risk Analysis

### ADR-01: Spec data delivery — collector extension vs new API endpoint

**Context**: The frontend needs `01_REQUIREMENTS.json` and `03_TEST_CASES.json` content per project. Two delivery mechanisms are possible.

**Option A: Extend collector → dashboard.json (chosen)**
- Pro: Zero new endpoints; frontend reuses existing 5s polling; consistent with Hub's architecture
- Pro: No new server logic; no path traversal surface in HTTP layer
- Con: dashboard.json grows; spec content is re-read every 5s even when unchanged

**Option B: New HTTP endpoint `GET /spec?path=<abs>`**
- Pro: On-demand loading; no dashboard.json growth
- Con: Requires path validation in HTTP handler (new attack surface); requires new fetch in React; breaks "no new endpoints" constraint from requirements

**Decision**: Option A — aligns with existing architecture; size impact is acceptable; constraint-compliant.
**Consequences**: dashboard.json grows ~15–20KB per project. The collector runs 2 extra file reads per project per cycle. Both are within stated budgets.

---

### ADR-02: Cytoscape.js packaging — npm devDependency vs vendored .min.js

**Context**: Cytoscape.js and cytoscape-dagre must be available in the React build.

**Option A: npm devDependencies + Vite bundle (chosen)**
- Pro: Standard Vite/npm workflow; tree-shaking possible; version pinned in package.json
- Pro: `npm audit` covers Cytoscape vulnerabilities
- Con: Adds ~450KB to bundle (Cytoscape ~330KB + dagre ~120KB, minified+gzipped ~120KB)

**Option B: Vendored .min.js files in web/vendor/**
- Pro: No build system changes
- Con: Files are untracked by npm audit; upgrade requires manual download; inconsistent with existing Vite build

**Decision**: Option A — Hub already uses Vite; npm is the correct packaging mechanism.
**Consequences**: Web bundle grows by ~120KB gzipped. Localhost serving makes this imperceptible.

---

### ADR-03: Collapse/expand implementation — Cytoscape element removal vs CSS visibility

**Context**: Clicking an FR node must hide/show its descendant TC nodes within ≤200ms.

**Option A: Cytoscape `remove()` / `restore()` (chosen)**
- Pro: Native Cytoscape API; layout does not reflow unaffected nodes on restore
- Pro: Removed elements are stored in a `Map<frId, CollectionSnapshot>` for restore
- Con: `restore()` re-adds elements to their original positions — must store snapshot before removal

**Option B: CSS class toggle (`display: none` equivalent via Cytoscape style)**
- Pro: Simpler implementation
- Con: Hidden nodes still participate in layout bounds — edges to hidden nodes remain visible; dagre does not re-route around hidden nodes

**Decision**: Option A — `remove()`/`restore()` is the correct approach for subtree collapse in Cytoscape. The `≤200ms` requirement is met since no layout recalculation occurs (positions are restored from snapshot).
**Consequences**: Component must maintain a `collapseMap: Map<frId, cytoscape.CollectionReturnValue>` in a ref (not React state — Cytoscape manages its own DOM).

---

### ADR-04: monitor command handling — stub vs complete dispatch removal

**Context**: `aitri-hub monitor` must print a redirect message and exit 0 (FR-010).

**Option A: Stub in dispatch table (chosen)**
```js
case 'monitor':
  console.log("monitor removed — run 'aitri-hub web' to open the dashboard");
  process.exit(0);
```
- Pro: Graceful handling for existing scripts/aliases; exits 0 (not an error)
- Pro: `--help` can be updated to omit `monitor` from the listed commands

**Option B: Throw unrecognized-command error**
- Pro: Cleaner — monitor truly does not exist
- Con: Exits non-zero; breaks scripts that call `aitri-hub monitor` and check exit code

**Decision**: Option A — FR-010 explicitly requires exit code 0 and a redirect message.
**Consequences**: One case branch remains in dispatch. `lib/commands/monitor.js` and `lib/renderer/cli.js` are still deleted.

---

### Failure Blast Radius

**Component: readSpecArtifacts (collector extension)**
- Blast radius: If spec file read fails for project N, `specArtifacts.status` is set to `"error"` with the error message. All other projects in the collection cycle are unaffected.
- User impact: Graph tab shows error state for that project only ("Could not parse artifacts…"). All other Hub tabs show correct data.
- Recovery: Automatic — next collection cycle (5s) retries the read. No manual intervention required.

**Component: Cytoscape initialization (frontend)**
- Blast radius: If `cytoscape()` throws on initialization (e.g. container ref not ready), the error is caught in a React error boundary wrapping `GraphTab`. All other tabs are unaffected.
- User impact: Graph tab shows "Graph rendering failed" error state. Overview, Alerts, Coverage, Velocity, Activity, All tabs are unaffected.
- Recovery: User can navigate away and back to the Graph tab to trigger re-initialization.

**Component: dashboard.json (existing — unchanged)**
- Blast radius: If dashboard.json is temporarily unreadable (atomic write in progress), the frontend retries on next poll (5s). Graph tab shows stale data or loading state.
- User impact: Brief "stale" indicator in connection banner (existing behavior). Graph does not flash or crash.
- Recovery: Automatic on next successful poll.

---

## Technical Risk Flags

**[RISK] dashboard.json size growth on large projects**
Conflict: NFR-006 requires graph to render in ≤2s; FR-012 requires spec content in dashboard.json. A project with 50 FRs × large descriptions could exceed the stripped 20KB estimate if titles are unusually long.
Mitigation: Strip all fields except `id`, `title` (max 200 chars, truncated), `priority`, `type` for FRs; `id`, `requirement_id`, `title`, `status` for TCs. Add a per-project 500KB guard in `readSpecArtifacts` — if stripped content exceeds 500KB, return `{ status: "error", error: "spec too large" }`.
Severity: low

**[RISK] Cytoscape dagre layout time for dense graphs**
Conflict: NFR-006 requires ≤2s render for 50 FRs + 150 TCs. dagre's time complexity is O(V·E) where V=200, E≤150 (one edge per TC). Estimated layout time: ~30–80ms on modern hardware. No risk in normal cases.
Mitigation: If a project has >300 total nodes (FRs + TCs), show a warning in the Graph tab: "Large spec — layout may take a few seconds." No performance cap applied.
Severity: low

**[RISK] Cytoscape bundle size on slow machines**
Conflict: NFR-006 (≤2s render) includes initial bundle parse time on first load. ~120KB gzipped is parsed once on page load, not per-graph render.
Mitigation: Cytoscape is imported as a dynamic import (`import('cytoscape')`) only when the Graph tab is first activated — not on initial page load. This keeps the main bundle unaffected for users who never open the Graph tab.
Severity: low

---

## Traceability Checklist

- [x] FR-010 — stub in dispatch + delete monitor.js + delete cli.js (ADR-04)
- [x] FR-011 — GraphTab added as 7th tab in App.jsx
- [x] FR-012 — readSpecArtifacts reader in collector; specArtifacts field in dashboard.json (ADR-01)
- [x] FR-013 — Cytoscape.js + cytoscape-dagre; GraphTab component (ADR-02, ADR-03)
- [x] FR-014 — graphNormalizer maps status → Hub CSS tokens; GraphLegend component
- [x] FR-015 — collapse/expand via Cytoscape remove()/restore() + collapseMap ref (ADR-03)
- [x] FR-016 — project selector dropdown reads projects from dashboard.json; selection in React state
- [x] NFR-006 — dynamic import of Cytoscape; stripped spec payload; layout time analysis
- [x] NFR-007 — readSpecArtifacts never throws; React error boundary on GraphTab
- [x] NFR-008 — monitor.js/cli.js removal leaves web.js and setup.js untouched
- [x] Every ADR has ≥2 options — ADR-01, ADR-02, ADR-03, ADR-04
- [x] no_go_zone verified: no GitHub remote graph loading, no artifact editing, no Aitri Graph server/registry/CSS, no force-directed layout, no partial monitor retention, no alert engine changes
- [x] Failure blast radius: readSpecArtifacts, Cytoscape init, dashboard.json
