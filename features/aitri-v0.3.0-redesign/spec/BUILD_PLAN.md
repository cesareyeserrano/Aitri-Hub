# BUILD_PLAN — Aitri Hub v0.3.0 Redesign

Working file (no gate). Implements the approved specs on the existing Hub (Node zero-dep server + React 18/Vite; GitHub-Dark tokens in `web/src/styles.css`). Every TC in `03_TEST_CASES.json` is scheduled in exactly one epic. Build steps run per-epic (skeleton → integration → hardening); an epic is `done` only when its `Makes pass` TCs are green.

Guardrails carried into every epic: collector (`lib/collector/index.js`) stays frozen (NFR-006/007/008); `/api/*` stays loopback-only; GitHub-Dark tokens only (no slate); traces `@aitri-trace` on server/source functions, never in browser-served assets.

---

## Epic 1 — Monitor redesign (bento)   [status: done]
  Delivers:    US-010, US-011, US-024
  FRs:         FR-010, FR-011, FR-024
  Makes pass:  TC-010h, TC-010e, TC-010f, TC-011h, TC-011e, TC-011f, TC-024h, TC-024e, TC-024f
  Build steps: skeleton → persistence/integrations → hardening
  Why here:    Entry surface; consumes the existing static `/data/dashboard.json` — lowest risk, delivers visible value first, establishes the health-rank/tile/name derivations reused everywhere.

## Epic 2 — Project Detail shell + read sections   [status: done — 2026-07-18: shell wired, all 21 Makes-pass TCs green (63/63 web unit incl. TC-012e/f in detailNav.test.jsx; TC-E2E-001h green via Playwright dev-triage.test.js). Filter persisted to URL (navigate.js) so browser-Back restores it. Detail shell = fixed sidebar + Overview/Health/Sessions/Alerts from lib/detail.js; Artifacts/Test Cases/Bugs sections reuse existing tab components as INTERIM (Epic 3 rebuilds Artifacts tree+reader; Epic 4 rebuilds QA). NOTE: redesigned Monitor supersedes the old ProjectCard home → old e2e (snapshot-card/web-dashboard) that wait for data-testid=project-card are superseded — reconcile/retire in Epic 5.]
  Delivers:    US-012, US-013, US-014, US-017, US-018, US-019
  FRs:         FR-012, FR-013, FR-014, FR-017, FR-018, FR-019
  Makes pass:  TC-012h, TC-012e, TC-012f, TC-STAT-012h, TC-013h, TC-013e, TC-013f, TC-TILE-013h, TC-014h, TC-014e, TC-014f, TC-017h, TC-017e, TC-017f, TC-018h, TC-018e, TC-018f, TC-019h, TC-019e, TC-019f, TC-E2E-001h
  Build steps: skeleton → persistence/integrations → hardening
  Why here:    Builds on Epic 1's nav; consumes the existing `/api/project/:id/detail`. No new backend — pure frontend over data that already exists. E2E Dev-triage flow closes Monitor→Detail.

## Epic 3 — Artifacts explorer + reader   [status: done — 2026-07-18: all 9 Makes-pass TCs green. Backend: detail-reader.js extended with a per-phase artifact tree (glyph=worst child status) + new confined GET /api/project/:id/artifact?path= content endpoint (md→raw, json→parsed projection, image→base64 dataUri), reusing confineToRoot (../ + absolute + %2e%2e-decoded + symlink → 403). Frontend: ArtifactsExplorer (tree w/ product names via names.js + technical secondary + size/age + status chip + toggle-close + empty states) + JsonView (human-readable JSON projection) + markdown.jsx extended for inline images (resolver → dataUri, unresolved → alt placeholder). names.js NAME_MAP extended beyond the canonical 6 to cover all emitted artifacts (addresses review feedback #3). Replaced interim ArtifactsTab in DetailView. Also fixed sticky header/sidebar (review feedback #1). TCs: TC-015h/016h/016e/016f/JSON-016h/PATH-016f/PATH-017f (integration, artifact-content.test.js), TC-015e/015f (vitest, artifacts.test.jsx).]
  Delivers:    US-015, US-016
  FRs:         FR-015, FR-016
  Makes pass:  TC-015h, TC-015e, TC-015f, TC-016h, TC-016e, TC-016f, TC-JSON-016h, TC-PATH-016f, TC-PATH-017f
  Build steps: skeleton → persistence/integrations → hardening
  Why here:    First backend work — extend `detail-reader.js` for a per-file artifact tree + a confined `GET /api/project/:id/artifact?path=` content endpoint. Establishes the path-confinement pattern Epic 4 reuses. Frontend reuses `web/src/lib/markdown.jsx`.

## Epic 4 — QA workspace   [status: pending]
  Delivers:    US-020, US-021, US-022, US-023
  FRs:         FR-020, FR-021, FR-022, FR-023
  Makes pass:  TC-020h, TC-020e, TC-020f, TC-021h, TC-021e, TC-021f, TC-SEC-021f, TC-EVID-021f, TC-EVID-022f, TC-SVG-021f, TC-022h, TC-022e, TC-022f, TC-023h, TC-023e, TC-023f, TC-NFR-010h, TC-NFR-010f, TC-NFR-010e, TC-LOOP-010h, TC-E2E-002h, TC-E2E-003f
  Build steps: skeleton → persistence/integrations → hardening
  Why here:    Heaviest slice — new QA store under `~/.aitri-hub/qa/`, execution/status write endpoints, evidence validation (type/size/magic-byte/filename/SVG), report projection. Depends on Epic 3's endpoint + confinement patterns. Carries the NFR-010 security surface.

## Epic 5 — Regression + hardening   [status: pending]
  Delivers:    (no US — regression/observability NFRs)
  FRs:         NFR-006, NFR-007, NFR-008, NFR-011, NFR-013
  Makes pass:  TC-NFR-006h, TC-NFR-006e, TC-NFR-006f, TC-NFR-007h, TC-NFR-007e, TC-NFR-008h, TC-NFR-008e, TC-NFR-008f
  Build steps: skeleton → persistence/integrations → hardening
  Why here:    Locks the guardrail last — golden-snapshot parity tests proving the frozen collector is unchanged, request logging on every server branch (NFR-011), `/health`→JSON (NFR-013), and a `smoke.sh` quality-gate that boots the server and asserts key routes respond. Runs last so it validates the whole assembled build.
