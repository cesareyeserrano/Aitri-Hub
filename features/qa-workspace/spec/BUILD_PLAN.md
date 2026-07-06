# BUILD_PLAN — qa-workspace

Working file (plan-first protocol). Dependency order: data layer → server surface →
SPA shell → tabs → closure. Every test title carries its TC id from day one.

## Cluster W1 — Server data layer — `done`
- FRs: FR-052 (partial: reader), FR-053 (scopes), FR-059 (per-section degradation)
- Build: `lib/collector/detail-reader.js` (readDetail: whitelist-only reads via
  resolveArtifact/layoutBase; per-section available:false; 1 MiB cap; scopes
  discovery) + `lib/collector/validate-runner.js` (execFile fixed argv, 30s
  timeout, 60s cache, in-flight dedup).
- TCs: TC-053h/e/f (reader level), TC-059f, TC-152h/e, TC-154f, TC-151f (dedup).
- Rationale: everything else consumes these; hostile-input tests land with the code.

## Cluster W2 — Endpoints on web.js — `done`
- FRs: FR-052 complete; NFR-052/053 partial
- Build: routes GET /api/project/:id/detail + /validate behind the loopback
  guard; id/scope validation (404/400); wire reader + runner.
- TCs: TC-052h/e/f, TC-053h/e/f (endpoint level), TC-153e/f, TC-154h (timing),
  TC-151h/e (spawn census).
- Rationale: server contract frozen before any SPA code.

## Cluster W3 — SPA shell — `done`
- FRs: FR-050, FR-051, FR-053 (UI half)
- Build: useRoute '/project/:id' + pushState nav; DetailView + header strip +
  scope selector + detailApi.js (loading/error states); card click navigation.
- TCs: TC-050h/e/f, TC-051h/e/f, TC-150f (route parser pins).
- Rationale: navigable skeleton with real data before tabs.

## Cluster W4 — Tabs — `done`
- FRs: FR-054, FR-055, FR-056, FR-057, FR-058, FR-059 (UI half)
- Build: SummaryTab (health score + phases + feature table + VerdictPanel async),
  TestCasesTab (join, filters, counts, manual banner), TraceabilityTab
  (uncovered-MUST pinning, coverage_map, freshness, 'computed by Hub' label),
  BugsTab (blocking band, 3-state absent/empty/corrupt), ArtifactsTab +
  `web/src/lib/markdown.jsx` (React-element renderer) + PRD projection + raw
  toggles + empty states everywhere.
- TCs: TC-054h/e/f, TC-055h/e/f, TC-056h/e/f, TC-057h/e/f, TC-058h/e/f,
  TC-059h/e, TC-154e, TC-152f (no dangerouslySetInnerHTML pin).
- Rationale: the visible layer, built on a frozen contract.

## Cluster W5 — Regression closure + manifest — `done`
- Run existing suites with unmodified assertions (TC-150h, TC-153h); dashboard
  type-inventory diff (TC-150e); full test:all; rebuild SPA bundle; manifest
  04_BUILD_REPORT.json (runner feature-dir-relative from day one, quality_gates
  lint + web-tests); adversarial pass on the full diff BEFORE reporting done.
- Rationale: closure gate; nothing new lands here.

## Progress notes
- (W1 done) detail-reader.js (whitelist-only reads, per-section degradation, scope validation, TC/traceability/bugs builders, 1MiB cap) + validate-runner.js (execFile fixed argv, 30s timeout, 60s cache, in-flight dedup, remote short-circuit). resolveProjectDir exported from index.js. 17/17 unit green. Fixed: tests wrote BUGS.json to root; contract is <artifactsDir>/BUGS.json — reader was right, tests corrected.
- (W2 done) web.js: GET /api/project/:id/{detail,validate} registered BEFORE /api/projects (singular prefix, no collision); loopback guard, 404 unknown id, 400 hostile scope, method/refresh handling; resolves entry from projects.json then dashboard record. 10 integration + 2 guard-unit green: real server spawn, scope routing, verbatim validate + 60s cache + refresh, cycle spawn census (status yes / validate never), admin coexistence, malformed-URL containment. TC-052f guard pinned via source-drift mirror (loopback fetch can't spoof non-loopback, same as TC-142f). Full node suite 432 green. CHECKPOINT W2→W3: server contract frozen + tested.
- (W3 done) navigate.js (useRoute+parseRoute+navigate, /project/:id), health.js extracted (shared w/ ProjectCard, FR-054), detailApi.js; App.jsx routes project; ProjectCard clickable (role=link, keyboard). SPA builds.
- (W4 done) markdown.jsx (React-element renderer, XSS-inert by construction), 5 tabs (Summary+VerdictPanel async, TestCases filters/counts/manual-banner, Traceability uncovered-MUST-pin/coverage_map/freshness/derived-by-hub, Bugs absent/empty/corrupt trichotomy, Artifacts chain+PRD+raw-toggle), EmptyState. 33 vitest + 9 browser e2e green (incl. live XSS probe window.__pwned undefined). Fixed: markdown.jsx JSDoc had a stray */ closing the comment; TraceabilityTab now sorts defensively (pin regardless of input order).
- (W5 done) full suites green: 436 node + 34 web + 54 e2e; lint 0 errors; SPA rebuilt; manifest written (runner+gates feature-dir-relative). ADVERSARIAL PASS caught 4 real issues, ALL fixed pre-commit: (1) SHIP-BLOCKER readProjects() unguarded in the detail route → server crash on missing/corrupt projects.json (wrapped in try/catch, degrades to dashboard-record fallback); (2) symlinked feature dir escapes root — real remote-repo vector (confineToRoot realpath guard → 400); (3) artifactsDir traversal (../../outside) exposes raw out-of-root files (same guard → 400); (4) refresh=1 spawn amplification — I caught this independently before the pass; fix = refresh bypasses cache but NOT in-flight dedup. Nits fixed: results status 'manual' now consistent across row/summary/filter. Accepted debt: FR-056 audit-freshness hash (fail-safe direction, advisory). Clean vectors confirmed by the adversary: markdown XSS inert, no ReDoS, healthScore no drift, zero validates in cycle, endpoint wiring + loopback guard correct, fr_coverage/coverageAudit fields real.
