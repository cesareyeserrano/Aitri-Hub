## Feature
QA Workspace: a per-project detail view (route `/project/:id`) with QA-grade
drill-down — test cases, FR→TC traceability, bugs, rendered artifacts, and the
deploy verdict — scoped by a Product | feature selector.

## Problem / Why
The Hub today is a monitoring card grid: every QA-relevant number is an
AGGREGATE (tests 89/92, bugs 3, coverage 14/16 FRs). The primary target users —
QA testers and QA auditors — cannot answer their actual working questions from
it: WHICH test case failed and with what evidence, WHICH MUST requirement lacks
a passing test, WHAT is the resolution trail of a blocking bug, WHAT does the
requirement actually say. Aitri already produces every one of those answers
(03_TEST_CASES.json, 04_TEST_RESULTS.json, 05_TRACEABILITY.json, BUGS.json,
`validate --json`, and the markdown artifact chain) — the Hub summarizes it
into counters and throws the detail away. This layer is the product's core
value for its declared target (owner vision 2026-07-05: "enviar todo el informe
y artefactos de QA que el equipo de QAs necesite para su gestión") and the #1
design priority carried from Core's close-out: make the pipeline's value
VISIBLE, not just monitored. Full spec: `idea_context/UI_UX_SPEC_V2.md`,
section "Layer 2 — QA Workspace".

## Target Users
Primary: QA testers and QA auditors reviewing an Aitri project's evidence for
sign-off. Secondary: BA / PO / PM reading the spec chain (PRD, UX spec, system
design, audit reports) without opening an editor; developers tracing an
uncovered requirement. All roles confirmed by the owner (2026-07-05).

## New Behavior
- The system must open a per-project detail view when a project card is clicked
  (route `/project/:id`), with a header strip: project name, status, deploy
  verdict, aitri version, artifactsDir.
- The system must provide a scope selector `Product | <feature>…` — each
  feature is a full pipeline with its own artifact chain under
  `features/<name>/`; selecting a scope re-renders the data tabs from that
  scope's chain.
- Tab Summary: per-phase pipeline status (approved/completed/drifted), the
  deploy verdict rendered from `aitri validate --json` (verdict, blocking
  reasons, advisories, each with its suggested command), and the per-feature
  indicator table (phase, verify, tests, bugs per feature).
- Tab Test Cases: table from 03_TEST_CASES.json × 04_TEST_RESULTS.json — TC id,
  title, automation (auto/manual + manual_reason), latest status
  (pass/fail/pending/skipped), evidence reference, downgraded_from trail,
  linked FR/AC ids; filters by status/automation/linked FR; counts strip;
  pending manual TCs called out prominently (they block coverage).
- Tab Traceability: one row per FR (id, title, priority) with its TCs and each
  TC's latest result, from 05_TRACEABILITY.json + fr_coverage; uncovered MUST
  FRs pinned top in red; ac_coverage per FR where present; intent coverage
  (coverage_map) rendered with its audit-freshness stamp.
- Tab Bugs: table from BUGS.json — id, title, severity, status, blocking flag,
  resolution, files_changed, linked TC; blocking bugs pinned with a red band;
  parse errors surfaced inline (never "0 bugs" over a corrupt file).
- Tab Artifacts: rendered reading view of the chain — markdown artifacts
  (00_DISCOVERY, 01_UX_SPEC, 02_SYSTEM_DESIGN, 04_CODE_REVIEW, AUDIT_REPORT)
  rendered as markdown; JSON artifacts (01_REQUIREMENTS as a PRD table) get a
  human projection plus a collapsible raw view.
- Every tab must have an explanatory empty/degraded state naming the aitri
  command that produces the missing artifact — never a blank panel.
- `validate --json` runs ON-DEMAND when the Summary tab is opened (never in the
  5s collection cycle — process-budget decision recorded in
  contract-catchup-rc159's no_go_zone resolving audit GAP-1). [ASSUMPTION:
  on-open with a manual refresh button and a short cache is the right cadence —
  implementer's call within phase 2.]

## Success Criteria
- Given a project with a failing TC, when the QA auditor opens Test Cases, then
  the failing TC's id, title and latest status are visible and filterable
  within 2 clicks from the overview card.
- Given a MUST FR with no passing test, when Traceability opens, then that FR
  appears pinned at the top marked uncovered (red), with its priority visible.
- Given a project with a blocking bug carrying a resolution, when Bugs opens,
  then the bug's severity, status, resolution text and linked TC are readable
  without leaving the Hub.
- Given a feature sub-pipeline selected in the scope selector, when any data
  tab renders, then its content comes from `features/<name>/`'s own artifact
  chain (verifiable with distinct fixture data per scope).
- Given a project whose artifacts are absent (e.g. Phase 3 not run), when the
  corresponding tab opens, then an empty state names the artifact and the aitri
  command that produces it (no blank panel, no crash).
- Given the Summary tab, when it opens on a validate-capable project, then the
  deploy verdict and its blocking reasons render from `aitri validate --json`
  per the VALIDATE_JSON.md contract.

## Touch Points
Modifies: `web/src/App.jsx` (routing — currently a ~30-line useRoute handling
`/` and `/admin` only), `ProjectCard.jsx` (card click → navigate). Adds: detail
view components (tabs), a data source for per-project detail — [ASSUMPTION:
the 5s dashboard.json stays lean; detail data is served on demand by new
localhost-only read endpoints on the existing web.js server (e.g.
/api/project/:id/detail), same 127.0.0.1 guard — architecture decision for
phase 2, including how `validate --json` is invoked on demand]. Server:
`lib/commands/web.js` (new read-only routes), possibly a new
`lib/collector/detail-reader.js` reading through the rc.159 readers
(resolveArtifact/layoutBase from contract-catchup-rc159).

## Must Not Break (Regression Boundary)
- The overview page (`/`) renders exactly as today: cards, triage, header
  tiles, 5s polling of dashboard.json.
- The collection cycle's process budget: one `aitri status --json` per eligible
  project per cycle — the QA Workspace adds NO per-cycle process (validate runs
  on-demand only, per user navigation).
- Localhost-only guard: every new endpoint refuses non-loopback requests with
  403, same as /api/projects (web.js remoteAddress guard).
- dashboard.json shape stays additive (the SPA overview is its consumer).
- Admin panel (`/admin`) CRUD unchanged.
- Path safety: all per-project file reads stay confined to the project root
  (reuse layoutBase/resolveArtifact; no path built from URL input without
  whitelisting to the known artifact names).

## Out of Scope
- The visual restyle (slate palette, Inter typography, light tokens) — Layer 1
  of UI_UX_SPEC_V2.md, separate feature; the workspace ships in the current
  theme.
- Editing anything: the workspace is read-only; no bug state changes, no TC
  verification, no aitri command execution beyond read-only `status --json` /
  `--version` / on-demand `validate --json`.
- The Cytoscape FR→TC graph (built, unwired) — lands as a secondary
  visualization AFTER the table-based Traceability tab proves itself; not in
  this feature's v1.
- GitHub API metrics, dependency scanning, runtime monitoring (owner cut,
  2026-07-05).
- quality_gates / ac_coverage from the snapshot where Core does not yet expose
  them (HUB-CATCHUP-0705 feedback pending); the tabs read artifacts directly on
  demand, which does not depend on that.
