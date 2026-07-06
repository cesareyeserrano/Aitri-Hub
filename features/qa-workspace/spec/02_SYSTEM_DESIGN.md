# Technical Design Document (TRD / SDD) — qa-workspace

## Executive Summary

Adds a per-project QA Workspace: client route `/project/:id` in the existing SPA
(no router library — the in-house `useRoute` is extended), fed by two new
read-only, localhost-only endpoints on the existing `web.js` server: a **detail**
endpoint that parses the selected scope's artifact chain on demand through the
rc.159 readers (`resolveArtifact`/`layoutBase`), and a **validate** endpoint that
runs `aitri validate --json` on demand (never in the 5s cycle) with a 60s cache.
Five read-only tabs (Summary, Test Cases, Traceability, Bugs, Artifacts) render
the evidence Aitri already produces. Markdown renders through a minimal in-repo
renderer that emits React elements (never `dangerouslySetInnerHTML`) — XSS-safe
by construction, zero new dependencies. The overview page, collection cycle,
dashboard.json schema and admin panel are untouched.

## System Architecture

```
web/src/App.jsx            useRoute extended: '/', '/admin', '/project/:id'
└─ views/DetailView.jsx    header strip + scope selector + tab switch
   ├─ tabs/SummaryTab.jsx      health score + phases + feature table + VerdictPanel
   ├─ tabs/TestCasesTab.jsx    TC table + filters + counts + manual banner
   ├─ tabs/TraceabilityTab.jsx FR rows + uncovered-MUST pinning + coverage_map
   ├─ tabs/BugsTab.jsx         bug table + blocking band + parse-error state
   ├─ tabs/ArtifactsTab.jsx    chain list + MarkdownView + PrdView + RawToggle
   └─ lib/detailApi.js         fetch wrappers + loading/error states

lib/commands/web.js        + routes: GET /api/project/:id/detail?scope=...
                                     GET /api/project/:id/validate
                           (same remoteAddress loopback guard as /api/projects)
lib/collector/detail-reader.js  NEW — readDetail(projectEntry, scope):
                           parses 01/03/04/04r/05 + BUGS.json + md artifacts of
                           the scope via resolveArtifact/layoutBase; whitelist-only
lib/collector/validate-runner.js NEW — runValidate(projectDir): execFile
                           spawn + timeout + per-project 60s cache + in-flight dedup
web/src/lib/markdown.jsx   NEW — minimal md → React elements renderer
```

Data flow: the overview keeps polling `dashboard.json` (unchanged). Opening
`/project/:id` fetches the detail payload once per scope selection; the verdict
panel lazily calls the validate endpoint on first open / explicit refresh.

### Architecture Decision Records

#### ADR-Q1 — Detail data path: on-demand endpoints vs fat dashboard.json
- **Option A — enrich dashboard.json** with full per-project artifact contents.
  Zero new endpoints, but the 5s payload grows unboundedly (a 200-TC project ×
  20 projects), every consumer pays for detail nobody opened, and NFR-050's
  additive guarantee gets risky on every iteration.
- **Option B — two on-demand read-only endpoints** on the existing server;
  dashboard.json stays lean. Costs a small amount of new server surface (guarded
  identically to `/api/projects`).
- **Decision: B.** Detail is navigation-driven by nature; the polling contract
  stays untouched. Consequence: the SPA has two data sources (poll + fetch),
  isolated in `detailApi.js`.

Route shape (fixed here, per Phase-1 deferral): `GET /api/project/:id/detail?scope=<name>`
(`scope` omitted = product) and `GET /api/project/:id/validate`. `:id` must match
a registered project id; `scope` must match `^[A-Za-z0-9._-]+$` AND exist in the
project's features list.

#### ADR-Q2 — Markdown rendering: in-repo React renderer vs library
- **Option A — `marked` (+ sanitizer) in web/.** Full CommonMark, but two new
  runtime dependencies and an HTML-string pipeline that forces
  `dangerouslySetInnerHTML` + a sanitizer we must keep current.
- **Option B — minimal in-repo renderer** (headings, paragraphs, bold/italic,
  inline code, fenced code blocks, lists, links, blockquotes, tables-optional)
  that outputs **React elements**. React escapes all text nodes; raw HTML in the
  source renders as inert text. Covers what Aitri's own templates emit.
- **Decision: B.** FR-058 AC-4 (script content renders inert) holds by
  construction, zero deps (no_go_zone line honored). Consequence: exotic
  markdown (nested tables, footnotes) renders as plain text — acceptable for
  Aitri-produced artifacts; revisit via ADR if a real artifact reads badly.

#### ADR-Q3 — Routing: extend useRoute vs react-router
- **Option A — react-router.** Standard, but a new runtime dependency for one
  additional parameterized route.
- **Option B — extend the existing ~30-line `useRoute`** with `/project/:id`
  parsing + `history.pushState` navigation and popstate handling (already
  present for `/admin`).
- **Decision: B.** One route does not justify a dependency. Consequence: no
  nested routing; tabs are component state, not URL segments (deep-linking to a
  tab is out of scope; revisit if QA users ask for shareable tab links).

#### ADR-Q4 — validate execution: spawn policy
- **Option A — spawn per request.** Simple; tab-switch storms spawn repeatedly.
- **Option B — `execFile('aitri', ['validate', '--json'], {cwd, timeout})` with
  a per-project 60s result cache and in-flight deduplication** (concurrent
  requests await the same promise). No shell, fixed argv (NFR-052).
- **Decision: B.** Matches the owner-accepted cadence (on-open + refresh, 60s
  cache). `?refresh=1` bypasses the cache (the refresh button). Timeout 30s;
  on timeout/absent CLI the endpoint returns a degraded payload
  `{ available:false, reason }` — the panel renders it, never fabricates.
  **Local projects only:** VALIDATE_JSON.md scopes the command to single-machine
  consumers; for `type:'remote'` projects the endpoint returns
  `{ available:false, reason:'remote-project' }` and the panel explains that the
  verdict applies to local projects (artifact tabs still work from the clone).

## Data Model

Detail payload (new, versioned additively — `detailVersion: 1`):

```jsonc
{
  "detailVersion": 1,
  "project": { "id", "name", "type", "location", "aitriVersion", "artifactsDir",
               "status", "healthScore" },          // from the last collected record
  "scopes": ["product", "f1", "f2"],               // product + features (layoutBase)
  "scope": "product",                              // the one served
  "testCases": { "available": bool, "cases": [ /* 03 × 04 join: id, title,
      automation, manual_reason?, scenario, status, evidence?, downgraded_from?,
      requirement_id, ac_id? */ ], "summary": { passed, failed, pending, skipped, manual } },
  "traceability": { "available": bool, "frs": [ /* id, title, priority, covered,
      tcs: [{id, status}], ac_coverage? */ ], "coverageMap": [ {need, disposition} ]?,
      "auditFreshness": "fresh" | "stale" | "not-run" },
  "bugs": { "available": bool, "parseError": bool, "bugs": [ /* id, title, severity,
      status, blocking, resolution?, files_changed?, tc_id? */ ] },
  "artifacts": { "chain": [ { "name", "present", "kind": "md" | "json" } ],
      "contents": { "<name>": "raw string (md) | parsed object (json)" } },
  "phases": [ /* per-phase status from the collected record */ ],
  "features": [ /* per-feature indicator row: name, phase, verify, tests, bugs */ ],
  "degradation": { "reason": string } | null
}
```

Validate payload: the `aitri validate --json` output passed through **verbatim**
under `{ available: true, report: <verbatim>, fetchedAt }` — the Hub renders the
documented contract (VALIDATE_JSON.md) and never re-derives the verdict.
Size guard: artifact contents are capped at 1 MiB per file (larger → entry
served as `{ present: true, truncated: true }` with the first 1 MiB).

dashboard.json: **no changes** (NFR-050). All new payloads live on the new
endpoints only.

## API Design

| Endpoint | Method | Input validation | Response |
|---|---|---|---|
| `/api/project/:id/detail` | GET | `:id` ∈ registered ids (else 404); `scope` matches `^[A-Za-z0-9._-]+$` AND ∈ discovered features (else 400); no other URL-derived paths | 200 detail payload; 403 non-loopback |
| `/api/project/:id/validate` | GET | `:id` as above; `refresh=1` optional | 200 `{available, report?, reason?, fetchedAt}`; 403 non-loopback |

Internal contracts:

| Contract | Signature | Notes |
|---|---|---|
| `readDetail(projectEntry, scope)` | → detail payload | all reads via `resolveArtifact(base, <whitelisted name>)`; base = project root + artifactsDir (product) or `layoutBase/features/<scope>/<featArtifactsDir>` (feature); never throws — per-section `available:false` |
| `runValidate(projectDir, {refresh})` | → `{available, report?, reason?}` | execFile fixed argv, 30s timeout, 60s cache, in-flight dedup, 1 MiB stdout cap |
| `markdown.jsx render(src)` | → React element tree | pure; no HTML pass-through |

Artifact whitelist (the ONLY filenames detail-reader opens): the ARTIFACT_MAP
names + their LEGACY_ALIASES + `BUGS.json`, `BACKLOG.json`, `AUDIT_REPORT.md`,
`04_TEST_RESULTS.json`.

## Security Design

- Both endpoints sit behind the existing remoteAddress loopback guard
  (`web.js:118-124` pattern) — 403 before any read (NFR-052).
- Path confinement: project dir comes from the registry (never the URL); scope
  is regex-validated AND membership-checked against discovered features; every
  file open goes through the whitelist + `resolveArtifact`/`layoutBase`
  (rc.159's confinement, incl. symlink rejection). Fs-instrumented tests assert
  zero out-of-root reads on hostile inputs (FR-052 ACs).
- validate spawn: `execFile`, fixed argv, no shell, cwd = registered project
  dir, 30s timeout — no URL data reaches the argv.
- XSS: markdown renders via React elements (ADR-Q2); JSON artifact projections
  render as data, not HTML. No `dangerouslySetInnerHTML` anywhere in the feature
  (lint-greppable invariant, pinned by a test).
- No new write path of any kind (no_go_zone).

## Performance & Scalability

- Detail reads are local-disk JSON/md parses on demand: ≤500ms for ≤200 TCs /
  ≤10 features (NFR-054, integration-timed). No caching needed at v1 beyond the
  browser's natural per-navigation fetch; revisit only with evidence.
- validate: async, panel shows a loading state; the rest of Summary renders
  immediately (NFR-054). 60s cache + dedup bound the spawn rate to ≤1/min/project
  under any click pattern.
- Collection cycle untouched: zero added spawns (NFR-051, instrumented).
- The SPA bundle grows by the detail components + renderer (~15-25 KB gz
  estimated); no new vendor code (ADR-Q2/Q3).

## Deployment Architecture

Unchanged model: `aitri-hub web` serves SPA + data; Docker path serves the
prebuilt SPA (new endpoints are Node-server-only — the static Docker/nginx path
does not proxy them; the detail view degrades there with the existing
connection-error banner. Recorded as a known limitation of the optional Docker
mode, which already lacks live collection). Ship = rebuild SPA bundle + restart
`aitri-hub web`. No new env vars; no `~/.aitri-hub` schema change.

## Risk Analysis

| Risk | Blast radius | Containment |
|---|---|---|
| Endpoint path bug exposes files outside project roots | file disclosure on localhost | whitelist + registry-only dirs + rc.159 confinement + fs-instrumented hostile tests (FR-052) |
| validate spawn storms (tab switching) | CPU + process churn | 60s cache + in-flight dedup + 30s timeout (ADR-Q4 tests) |
| Markdown renderer gap renders an artifact unreadably | one tab's readability | fallback "view raw" toggle always available; renderer covers Aitri-template constructs |
| Detail payload bloat on pathological projects | slow tab, big JSON | 1 MiB per-artifact cap + truncated flag |
| useRoute extension breaks '/' or '/admin' | whole SPA navigation | NFR-050/053 regression suites + explicit route unit tests |
| Remote projects: users expect a verdict | confusion | explicit `remote-project` degraded state with explanation (ADR-Q4) |

## Technical Risk Flags

- **Two data sources in the SPA** (poll + on-demand fetch) — kept isolated in
  `detailApi.js`; the detail view re-reads the freshest collected record from
  the poll for header/status to avoid split-brain displays.
- **fr_coverage derivation for Traceability** — the tab prefers the results
  file's `fr_coverage` (spine-computed); when absent it derives covered/uncovered
  from the TC join and labels the derivation ("computed by Hub") so QA never
  mistakes it for spine truth.
- **Feature-scope validate** — `aitri validate` is root-scoped; the verdict
  panel is product-scope only (feature scopes show the per-feature verify state
  instead). Stated in the UI to avoid implying a per-feature deploy verdict.
- **Renderer scope creep** — the in-repo markdown renderer is deliberately
  minimal; any future need beyond Aitri-template constructs goes through a new
  ADR, not incremental additions.

### Traceability checklist
- FR-050 → ADR-Q3, System Architecture. FR-051 → DetailView/Data Model. FR-052 →
  API Design, Security Design. FR-053 → detail-reader scopes, Data Model.
  FR-054 → SummaryTab/VerdictPanel, ADR-Q4. FR-055 → TestCasesTab, Data Model.
  FR-056 → TraceabilityTab, Risk Flags (fr_coverage). FR-057 → BugsTab.
  FR-058 → ArtifactsTab, ADR-Q2. FR-059 → per-section `available:false` +
  degraded states. NFR-050/051/053 → unchanged surfaces + Performance.
  NFR-052 → Security Design. NFR-054 → Performance. NFR-055 → existing CI globs.
- no_go_zone check: no restyle, no writes, no per-cycle validate, no graph, no
  GitHub/deps/runtime metrics, no arbitrary file serving, no new runtime dep
  (ADR-Q2/Q3 chose in-repo). ✔  Every ADR has ≥2 options. ✔
