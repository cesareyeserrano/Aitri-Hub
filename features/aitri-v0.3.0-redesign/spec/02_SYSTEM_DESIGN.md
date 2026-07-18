# Technical Design Document (TRD / SDD) — Aitri Hub v0.3.0 Redesign

> This design extends the **existing, running** Aitri Hub — it is not greenfield. All new work is additive to the real modules verified in-repo: `lib/collector/{index.js,detail-reader.js,spec-reader.js}`, `lib/store`, `lib/alerts`, `lib/commands/web.js`; `web/src/lib/{detailApi,adminApi,markdown,navigate,health}.js`, `web/src/{views,components}`. The regression NFRs (NFR-006/007/008) require the collector and `dashboard.json` contract to keep working unchanged.
>
> **v2 of this TRD** — the first draft mis-transcribed the snapshot shape and invented a `lib/artifacts` module + `/api/dashboard` endpoint + a `verifyRunId` field that do not exist. An adversarial pass caught it; this version is grounded in the actual collector output (`lib/collector/index.js:340-376`) and the shipped on-demand reader (`lib/collector/detail-reader.js`, served at `/api/project/:id/detail`).

## Executive Summary

Aitri Hub v0.3.0 redesigns the presentation layer of the local monitoring dashboard and adds an in-Hub QA workspace, on the existing stack: a **zero-runtime-dependency Node.js ≥18 HTTP server** (`lib/commands/web.js`) that serves a **React 18 + Vite 5** SPA and reads/writes JSON state under `~/.aitri-hub/`. The redesign:

1. Rebuilds the **Monitor** as a signal-first bento grid (urgency-sized cards) and the **Project Detail** as a single-page, fixed-sidebar view (Overview, Health, Artifacts, Sessions, Alerts) — reusing `navigate.js` (History-API single-page nav) and `health.js` (issue derivation).
2. Adds an **Artifact reader** (Markdown/JSON/images) by **extending the existing confined reader** in `detail-reader.js` (which already parses `03_TEST_CASES.json`, `04_TEST_RESULTS.json`, `01_REQUIREMENTS.json`, `BUGS.json` with `..`/symlink-escape rejection and a 1 MB cap) — not a new module, and never a direct project-file read from the SPA.
3. Adds a **QA workspace** (Test Cases, manual Execution recording with evidence, Bugs, on-demand Reports) — reads reuse the existing detail endpoint; writes are new endpoints backed by a new **QA execution store** under `~/.aitri-hub/qa/`.

**Design-system note (reconciliation):** `01_REQUIREMENTS.json` `constraints` names a "slate dark palette"; this is **superseded**. The approved `01_UX_SPEC.md` and the live `web/src/styles.css` fix the design system as **GitHub-Dark (owner preference, reverted from slate)**. Implementation MUST use the GitHub-Dark tokens + terminal conventions, not slate (ADR-07).

**Guardrail:** data-ingestion parity — the collector's `dashboard.json` output is unchanged; new detail fields are **additive** (the collector already uses the additive-key pattern, e.g. `resultsBinding`/`qualitySurfaces` at `index.js:369-372`), and QA state lives entirely under `~/.aitri-hub/qa/`.

## System Architecture

**Runtime topology (single node, localhost-only):**

```
Browser (React 18 SPA, Vite-bundled, served by Node)
  │  HTTP (127.0.0.1:3000 only)
  ▼
Node HTTP server ── lib/commands/web.js  (zero runtime deps; loopback peer guard)
  ├─ Static handler ................ serves docker/web-dist (SPA) + /data/dashboard.json  [EXISTING]
  ├─ GET  /api/project/:id/detail .. readDetail() — testcases, FRs, bugs, artifacts       [EXISTING; EXTEND]
  ├─ GET  /api/project/:id/artifact?path=  artifact CONTENT (md/json/image)               [NEW handler, existing confinement]
  ├─ GET  /api/project/:id/executions[?tc=]  read QA store                                 [NEW]
  ├─ POST /api/project/:id/testcases/:tc/executions  record run + evidence                 [NEW, write]
  ├─ PATCH /api/project/:id/testcases/:tc/status     manual status                         [NEW, write]
  ├─ GET  /api/project/:id/report?scope=..           on-demand report projection           [NEW]
  ├─ (plural) /api/projects ........ admin CRUD for projects.json                          [EXISTING, unchanged]
  └─ GET  /health .................. liveness (→ JSON, see NFR-013)                         [EXISTING; adjust body]
  │
  ├─ lib/collector/index.js ....... project → dashboard.json ingestion                     [EXISTING, FROZEN]
  ├─ lib/collector/detail-reader.js  on-demand per-project reader (confined)               [EXISTING; EXTEND for artifact tree+content]
  ├─ lib/alerts/ .................. alert engine                                            [EXISTING, unchanged]
  └─ lib/store/  ................. atomic JSON I/O under ~/.aitri-hub/  + NEW qa/ sub-store [EXISTING; +qa]
```

**Routing note (grounded):** the singular `/api/project/:id/...` prefix is registered **before** the plural `/api/projects` admin block (as the code already does for `detail`, `web.js:120-121`), so the new QA read/write routes never collide with the admin `405` catch. New routes follow the **singular** convention.

**Component responsibilities:**
- **HTTP server** — routing, loopback guard, static serving, request logging (must cover *every* branch — see NFR-011). One responsibility per handler.
- **Collector (`index.js`)** — project→snapshot ingestion. **Frozen** (regression boundary); new detail data comes from the detail reader, not the snapshot.
- **Detail reader (`detail-reader.js`, EXTEND)** — already returns test cases, FRs, bugs with path confinement; extend to also emit a **per-file artifact tree** (path, status, size, mtime) and to serve **artifact content** for the reader. Its existing `resolveArtifact` confinement is the security control (no new attack surface class).
- **QA store (`lib/store/qa`, NEW)** — append-only executions + evidence files under `~/.aitri-hub/qa/<projectId>/`, atomic temp+rename (existing store pattern).
- **Frontend** — `web/src/views` (Monitor bento, Detail shell + sections, QaWorkspace), `web/src/lib` (extend `detailApi.js`; reuse `navigate.js`, `markdown.jsx`, `health.js`).

## Data Model

Entities (JSON; no relational DB). **Field names below are the REAL emitted shape** (`lib/collector/index.js:340-376`), corrected from the first draft.

1. **ProjectSnapshot record** [EXISTING, in `dashboard.json`, one per project] — actual fields:
   `{ id, name, location, type, group, appVersion, aitriState, gitMeta, testSummary, aggregatedTestSummary, complianceSummary, requirementsSummary, specQuality, externalSignals, specArtifacts, bugsSummary, featurePipelines, nextActions, health, audit, normalize, lastSession, degradationReason, snapshotVersion, resultsBinding?, qualitySurfaces?, cacheStale, rateLimited, collectionError }`.
   - Pipeline state is nested in **`aitriState`** (`approvedPhases[]`, `currentPhase`, `events[]`, `rejections{}`, `verifySummary`, `artifactsDir`) — `health.js:14` reads `project.aitriState.approvedPhases`.
   - Tests: **`testSummary`** (`{passed,failed,skipped,total}`) — NOT `verifySummary` at top level.
   - **`externalSignals`** is `{ available, signals[] }` (`alerts/engine.js`), not a flat array.
   - **`specArtifacts`** is `{ frs:[{id,title,priority,phase}], tcs:[...] }` (`spec-reader.js:19-55`) — a lean id list, **not** a per-file tree. (This is why the Artifacts tree sources from the detail reader, not the snapshot — see FR-015.)
   - **`resultsBinding`** is present only when stamped; enum `'bound'|'mismatch'|'no-stamp'|'missing-file'` (`snapshot-reader.js:217`). This is the verify-binding signal (there is no `verifyRunId`).
   - Contract **frozen** by NFR-007; the redesign only reads it and adds new detail fields via the detail reader.
2. **ArtifactNode** [NEW, from extended detail reader, not persisted] — `{ phase, technicalName, productName, status, size, mtime }` for the tree (FR-015).
3. **ArtifactContent** [NEW, transient] — `{ projectId, path, kind:"markdown"|"json"|"image"|"other", content?|dataUri?, meta:{size,mtime,status} }` (FR-016).
4. **TestCaseRow** [EXISTING via `detail-reader.js:112-158`, joins `03_TEST_CASES.json`+`04_TEST_RESULTS.json`] — `{ id, phase, feature|null, description, type, status }`. Redesign adds client filters + manual override.
5. **Execution** [NEW, persisted `~/.aitri-hub/qa/<projectId>/executions.json`] — `{ id, testCaseId, binding:{ resultsBinding, runStamp }, result:"passed"|"failed"|"blocked", notes, environment, evidenceRef?, at }`. **Append-only.** `runStamp` = the verify-results stamp the collector already derives for `resultsBinding` (the stable per-run identity; NOT an invented id).
6. **Evidence** [NEW, file `~/.aitri-hub/qa/<projectId>/evidence/<uuid>.<ext>`] — validated image.
7. **Bug** [EXISTING via `detail-reader.js:263-282`] — `{ available, parseError, bugs[] }`, each `{ id, description, severity, phase, status, ... }`. `parseError:true` on malformed `BUGS.json` (never silent zero — FR-022).
8. **Report** [NEW, transient on-demand projection] — computed from snapshot + detail + executions for a scope; never persisted (FR-023).
9. **NameMap** [NEW, static constant module] — fixed technical→product mapping (FR-019).

**Consistency model:** reads are eventual (SPA polls `/data/dashboard.json`, detail on open). Writes (executions, manual status) are file-level strongly consistent via atomic temp+rename; **append-only** executions avoid lost-update under the single-user, low-concurrency assumption.

## API Design

All `/api/*` are **loopback-only** (peer `127.0.0.1`/`::1`, else `403`) and versionless. Errors use the existing `{ error, code }` style. Reads for the monitor come from the **static** `/data/dashboard.json` (SPA `App.jsx:20`, `DASHBOARD_URL='/data/dashboard.json'`) — there is no `/api/dashboard`.

| Method | Path | Req | 200/201 | Errors |
|---|---|---|---|---|
| GET (static) | `/data/dashboard.json` | — | snapshot JSON | 500 |
| GET | `/api/project/:id/detail?scope=` | query | `{ ok, testCases, frs, bugs, ... }` (existing `readDetail`) | 400 bad scope · 404 unreadable |
| GET | `/api/project/:id/artifact?path=<rel>` | query `path` | `{ kind, content?|dataUri?, meta }` | 400 · 403 outside confinement · 404 · 413 >1MB |
| GET | `/api/project/:id/executions[?tc=]` | — | `{ executions[] }` | 404 |
| POST | `/api/project/:id/testcases/:tc/executions` | `{ result, notes, environment, evidence?:{filename,base64} }` | `201 { execution }` | 400 no result · 415 bad evidence · 413 too large · 403 non-loopback |
| PATCH | `/api/project/:id/testcases/:tc/status` | `{ status }` | `200 { case }` | 409 automated case · 400 bad status |
| GET | `/api/project/:id/report?scope=project\|feature:<n>\|run:<stamp>` | query | `{ report }` | 404 · 422 empty scope |
| GET | `/health` | — | `200 { status:"ok" }` (change from `text/plain "ok"` for NFR-013) | — |

**Artifact/path confinement (reuses shipped control):** `detail-reader.js` already resolves artifact paths inside the project's artifacts dir and rejects escapes (`:337` "scope escapes project root", `:345` "artifacts directory escapes project root", `MAX_ARTIFACT_BYTES=1MB`). The new `artifact?path=` handler and the extended tree use the **same** `resolveArtifact` confinement — `path` is resolved against the allow-root and re-checked with `fs.realpath`; `..`/absolute/symlink-escape → `403`. Image references in Markdown resolve the same way; data-URIs need no fetch.

**Evidence contract:** accept `image/png|jpeg|gif|webp|svg+xml`, ≤5 MB (decoded), MIME+magic-byte validated server-side; server-generated filename; written only under `~/.aitri-hub/qa/`. SVG is sanitized on ingest or served `Content-Disposition: attachment` with a restrictive CSP (never rendered inline unsanitized).

## Implementation Approach

FR-010: Monitor bento grid — Method: CSS Grid `auto-fill minmax(280px,1fr)`, CRITICAL → `grid-column: span 2`; sort by health rank from `health.js`. I/O: `dashboard.json.projects[]` → sorted/sized cards. Failure: read fail → keep last render + `snapshot stale` banner.

FR-011: Card signals — Method: derive 6 tiles + segmented pipeline (from `aitriState.approvedPhases`) + top issue (from `health`); null datum → `N/A`. I/O: record → card VM. Failure: `aitriState===null` → `unreadable` card (existing status).

FR-012: Detail shell + nav — Method: single-page state via `navigate.js` (History API); sidebar badges from `health.js` counts; filter kept in URL state. I/O: `selectedId` → detail; `popstate` → monitor w/ filter. Failure: id absent → `project not found` panel.

FR-013: Overview — Method: render `aitriState` phases + metric tiles + gauge from **`testSummary`** (not `verifySummary`); `testSummary==null` → "no run yet". I/O: record → overview. Failure: self-evident.

FR-014: Health 5 dimensions — Method: group `health.issues` by fixed dimension order; worst level → badge; attach remediation. I/O: `record.health` → 5 panels. Failure: empty dim → "all checks passing".

FR-015: Artifacts tree — Method: source from the **extended detail reader** (per-file `{phase,status,size,mtime,names}`), NOT `specArtifacts` (which is a lean id list). Group by phase; folder glyph = worst child. I/O: `GET /api/project/:id/detail` (artifacts) → tree. Failure: reader error → "could not load"; empty phase → explicit empty row.

FR-016: Artifact reader — Method: `GET /api/project/:id/artifact?path=`; Markdown via extended `web/src/lib/markdown.jsx`; JSON via structured projection; images inline via endpoint. I/O: `(id,path)` → DOM. Failure: unresolved/oversized image → alt-text placeholder, rest renders; 4xx → inline "could not load".

FR-017: Sessions — Method: render `aitriState.events[]` reversed + `lastSession`. Failure: empty → empty state. (Self-evident from Data Model.)

FR-018: Alerts — Method: concat `health.issues` + `externalSignals.signals`; count = sum (matches sidebar). I/O: record → cards. Failure: none → all-clear state.

FR-019: Name translation — Method: static `NameMap` lookup; feature artifacts prefixed by feature name; unmapped → raw filename. I/O: name(+feature?) → productName. Failure: unmapped → raw (no throw).

FR-020: QA Test Cases — Method: reuse `readDetail` test-case rows (already joins 03_TEST_CASES+04_TEST_RESULTS); client filters phase/feature/status/type. I/O: `/api/project/:id/detail` → cases. Failure: parse fail → `available:false/error` surfaced; missing → empty state.

FR-021: Manual execution — Method: POST; validate result present + evidence type/size; write evidence file then append Execution (atomic) with `binding={resultsBinding, runStamp}` from the current snapshot. I/O: `{result,notes,environment,evidence?}` → `201`. Failure: no result → 400 (nothing persisted); bad evidence → 415/413; write fail → 500, no partial append.

FR-022: Bugs — Method: reuse `readDetail` bugs (`{available,parseError,bugs}`); client filters severity/status/feature. I/O: `/api/project/:id/detail` → bugs. Failure: missing → empty; `parseError:true` → warning (never silent 0).

FR-023 (SHOULD): Reports — on-demand projection (snapshot+detail+executions), print via CSS `@media print`. Failure: empty scope → empty-report state.

FR-024 (SHOULD): Refresh — `setInterval` poll of `/data/dashboard.json`; ticker; stale read → keep last + indicator; no manual control.

## Security Design

- **Trust boundary:** server binds `127.0.0.1`; every `/api/*` re-checks peer address → `403` otherwise. No auth (single local user, no_go_zone) — the loopback guard IS the boundary. [NFR-010]
- **Path traversal:** the artifact reader/tree reuse the **already-shipped** `detail-reader.js` confinement (allow-root + realpath containment, `..`/symlink-escape rejection, 1 MB cap). No new confinement code class; the new `artifact?path=` handler calls the same `resolveArtifact`. [NFR-010]
- **Evidence upload:** MIME+magic-byte + ≤5 MB validation before write; server-generated filename; write only under `~/.aitri-hub/qa/`; SVG sanitized or served non-inline with CSP. [NFR-010]
- **Read-only project files:** all writes go to `~/.aitri-hub/`; project dirs never written (inherits parent constraint). [NFR-007/008]
- **Semi-trusted input:** every parser (`detail-reader.js`, QA store) is try/catch with surfaced error, never a crash. [NFR-008]
- No secrets, no PII, no network egress beyond existing remote-project `git pull`.

## Performance & Scalability

- Targets: monitor ≤2 s for ≤20 projects; detail section ≤2 s for ≤20 artifacts; feedback ≤100 ms (NFR-009).
- Snapshot: pre-aggregated by the collector; SPA reads one static file. Detail + artifact content fetched lazily (keeps `dashboard.json` lean).
- QA store: per-project append-only file; O(executions per case). No index needed at this scale.
- Ceiling: single-node, single-user, ≤~20 projects (parent guardrail). No horizontal scaling (no_go_zone). Revisit with virtualized lists only past hundreds of projects.

## Deployment Architecture

- **Primary:** `aitri-hub web` starts the Node process; Vite-built SPA served from `docker/web-dist`. Docker optional. No new deployment surface (installability deferred, no_go_zone).
- **Config:** port via existing env; data root `~/.aitri-hub/`; new `~/.aitri-hub/qa/` created on first write (12-factor: config from env, state outside process).
- **Deps:** server stays zero-runtime-dependency; Markdown reuses in-repo `markdown.jsx` (no new npm dep — ADR-05).
- **Observability:** logging must cover **every** request branch (the current server logs only some — NFR-011 gap to close); `/health` → 200 JSON (NFR-013).
- **CI:** existing vitest + playwright on push to main; new endpoints/components add tests (NFR-012).

## Risk Analysis

- **Path traversal on artifact read** — mitigated by reusing the shipped, tested confinement in `detail-reader.js`; new negative tests at Phase 3. Severity: high (contained).
- **Snapshot contract drift** — collector frozen; new detail fields are additive (existing additive-key pattern); golden-snapshot regression test. Severity: medium.
- **Verify-binding semantics** — executions bind to `resultsBinding`+`runStamp` (real), not an invented id; if a project is `no-stamp`, executions record the binding state honestly and group under "unbound". Severity: medium.
- **Design-system regression** (slate) — ADR-07 + review against live `styles.css`. Severity: medium.
- **SVG evidence XSS** — sanitize/CSP/non-inline. Severity: medium.

### ADRs

**ADR-01: Frontend routing** — A: `react-router` (deep-linkable; new dep, more than v1 needs). B: existing `navigate.js` (History API). Decision: **B** — single-page, two views, meets browser-back + filter ACs, zero new deps. Consequences: no deep-links (accepted, no_go_zone).

**ADR-02: Artifact/QA reads — reuse detail-reader vs new module** — A: build a new `lib/artifacts` + parallel plural endpoints (duplicate logic, re-implements confinement, regression risk vs the shipped qa-workspace). B: **extend the shipped `detail-reader.js`** (already reads test cases/FRs/bugs with confinement) + a thin `artifact?path=` content handler on the same control. Decision: **B** — no duplication, inherits tested path-safety, honors NFR-006/008. Consequences: changes are localized to one existing module; the artifact *tree* becomes a detail-reader output (not a snapshot field).

**ADR-03: QA execution persistence** — A: SQLite (queries; new runtime dep, against zero-dep ethos). B: per-project append-only `executions.json` (atomic, existing store). Decision: **B** — matches zero-dep design + low write concurrency. Consequences: linear scans (small N), no query engine.

**ADR-04: Evidence storage** — A: base64 in JSON (self-contained; bloats records). B: files on disk, referenced by id, validated. Decision: **B** — small records, straightforward size/type validation, server-generated names close path-injection. Consequences: two artifacts (record+file) kept consistent by file-first-then-append.

**ADR-05: Markdown/JSON/image rendering** — A: add `markdown-it` (full CommonMark; new dep, bundle weight). B: extend in-repo `web/src/lib/markdown.jsx`. Decision: **B** — a renderer already ships; extending it avoids a dep and keeps control of image-path resolution. Consequences: implement/verify table+image subset (Aitri artifacts use a known subset).

**ADR-06: Bento layout** — A: masonry lib (packing; dep + layout thrash each 5 s). B: native CSS Grid `span 2` + auto-fill. Decision: **B** — declarative, no dep, honors UX breakpoints. Consequences: uniform row heights (matches bento model).

**ADR-07: Design-system source** — A: slate (literal requirements constraint) — the look the owner reverted from. B: GitHub-Dark (live `styles.css` + approved UX spec). Decision: **B** — later approved artifact + owner's in-code decision override the stale wording. Consequences: implement with existing `styles.css` tokens; the "slate" constraint line is superseded.

**ADR-08: Verify binding key** — A: `verifyRunId` (does not exist in the snapshot — the first draft invented it). B: bind to `resultsBinding` (enum) + `runStamp` (the verify-results stamp the collector already derives for `resultsBinding`). Decision: **B** — grounded in real snapshot data; satisfies FR-021's "bound to the current verify-run" with data that actually exists. Consequences: an unstamped project (`no-stamp`) records that state honestly; no user-managed release entity (no_go_zone).

### Failure Blast Radius

Component: Node HTTP server (`lib/commands/web.js`)
Blast radius: entire UI + all APIs down. User impact: `localhost:3000` fails to load / fetches error. Recovery: restart (`aitri-hub web`); SPA retries via existing connection banner.

Component: `dashboard.json` / collector (`index.js`)
Blast radius: monitor + detail lose fresh data. User impact: last-known data + `snapshot stale` indicator (never blank). Recovery: next collection cycle; malformed project → `unreadable` card (NFR-008).

Component: Detail reader (`detail-reader.js`)
Blast radius: artifact reader + tree + QA test-cases/bugs (all share it). User impact: reader "could not load"; test cases/bugs show their `error`/`parseError` — rest of app unaffected. Recovery: per-request, read-only, no state to corrupt.

Component: QA store (`~/.aitri-hub/qa/`)
Blast radius: recording/reading executions + evidence. User impact: failed write → 500, nothing persisted (no partial append); existing history still reads. Recovery: retry; atomic temp+rename guarantees no half-written store.

## Technical Risk Flags

[RISK] FR-021 verify binding has no `verifyRunId` in the snapshot
Conflict: FR-021 requires binding an execution to "the current verify run", but the snapshot has no run id — only `resultsBinding` (enum) and a derived stamp.
Mitigation: ADR-08 — bind to `{resultsBinding, runStamp}` from real collector data; `no-stamp` projects record the unbound state honestly. Accepted with mitigation.
Severity: medium

[RISK] Artifacts tree (FR-015) is not in the lean snapshot (`specArtifacts` = id list only)
Conflict: FR-015 needs per-file status/size/age; `specArtifacts` (`spec-reader.js`) is a stripped FR/TC id list.
Mitigation: source the tree from the extended `detail-reader.js` on demand, not the snapshot — keeps `dashboard.json` frozen (NFR-007). Accepted.
Severity: medium

[RISK] Path traversal via the new artifact content handler
Conflict: FR-016 reads project files by client-supplied `path`; NFR-010 forbids reads outside the allow-list.
Mitigation: reuse the shipped `resolveArtifact` confinement in `detail-reader.js` (allow-root + realpath + reject `..`/absolute/symlink); explicit negative tests at Phase 3.
Severity: high (contained by reusing tested code)

[RISK] SVG evidence script execution
Conflict: NFR-010 allows SVG evidence; inline SVG can carry script.
Mitigation: sanitize on ingest or serve non-inline with restrictive CSP.
Severity: medium

[RISK] NFR-011 "every request logs" is not yet true in the server
Conflict: the current server logs only some branches (`/data`, static fallback, 404 do not log).
Mitigation: the redesign adds `logRequest` to every branch as part of this work; verified structurally.
Severity: low

### Traceability Checklist
- [x] Every FR-010..024 addressed by a real component/flow/endpoint (grounded in verified modules).
- [x] Implementation Approach entry (or explicit self-evident note) for every MUST FR (FR-010..022).
- [x] Every NFR addressed: NFR-006/007/008 (frozen collector + additive fields + golden snapshot), NFR-009 (perf/a11y), NFR-010 (reused confinement + evidence validation), NFR-011 (logging gap closed), NFR-012 (CI), NFR-013 (`/health` → JSON).
- [x] Every ADR has ≥2 options (ADR-01..08).
- [x] no_go_zone items absent (no auth, roles, export, command execution, installability, release entity, manual refresh, slate).
- [x] Failure blast radius for 4 critical components.
- [x] Technical Risk Flags complete (5 flags, mitigations) — including the 3 data-grounding defects the adversarial pass found, now resolved.
