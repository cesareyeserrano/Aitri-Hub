# Audit Report — contract-catchup-rc159

### Requirements Coverage

_Audit performed 2026-07-05 by a fresh-session Requirements Coverage Auditor. Intent sources: the feature seed (now absorbed into `01_REQUIREMENTS.json#original_brief`) and `01_REQUIREMENTS.json#project_summary`. No `00_DISCOVERY.md` exists for this feature. Needs were re-derived independently from the seed before diffing against the agent-declared `coverage_map`._

**Verdict: 20 needs traced, 19 covered, 1 gap.**

#### Gaps

**[GAP-1]** `PARTIAL` — the data layer must be able to read `coverage_map` / `ac_coverage` / `validate --json` data even though rendering them is out of scope.
- Source: the feature seed (`01_REQUIREMENTS.json#original_brief`) — Out of Scope: "`coverage_map`/`ac_coverage`/`validate --json` full rendering — consumed by the QA Workspace feature; **this feature only ensures the data layer can read them**." Reinforced by Problem item 5: "New machine surfaces not consumed — ... `quality_gates` results; `validate --json` now has a contract doc (VALIDATE_JSON.md)."
- Status: PARTIAL — FR-047 carries `quality_gates` results through the snapshot projection, but no FR covers the data layer reading/carrying `coverage_map`, `ac_coverage`, or `validate --json` output. The agent's coverage map disposes "validate --json / coverage_map / ac_coverage **full rendering**" as out_of_scope — correct for rendering, but the seed's own boundary sentence carves out an in-scope residue ("ensures the data layer can read them") that maps to nothing. `no_go_zone` item 3 restates the boundary ("only ensures the projection can carry what the snapshot already returns") but a no-go entry is a prohibition, not a requirement — nothing obligates the projection to actually carry these surfaces.
- Action: re-open Phase 1 and either (a) add an FR (or widen FR-047) requiring the snapshot projection to carry `coverage_map`/`ac_coverage` (and define whether `validate --json` is invoked at all), OR (b) record an explicit out-of-scope decision stating the QA Workspace feature will add the projection fields itself, superseding the seed's "data layer can read them" clause.
- **Resolution (2026-07-05, pre-approval):** option (a)+(b) combined — FR-047 widened to carry the snapshot-provided coverage surfaces (`ac_coverage`, coverage-audit freshness fields), and `validate --json` invocation recorded as an explicit no_go_zone decision (per-cycle process budget; the QA Workspace feature adds it on-demand). coverage_map entries added for both dispositions.

#### Traced needs (evidence)

| # | Need (from seed) | Disposition |
|---|---|---|
| 1 | Full semver parse/compare/display incl. pre-release tags, numeric ordering, "everywhere a version is compared or displayed" | COVERED — FR-040 |
| 2 | Snapshot eligibility gate and review baseline no longer miscompute against the rc channel (Problem 1) | COVERED — FR-040 + FR-046 |
| 3 | Fallback drift detection (ARTIFACT_MAP) reads `04_BUILD_REPORT.json` with pre-rc.41 fallback | COVERED — FR-041 |
| 4 | Fallback compliance reader reads `05_TRACEABILITY.json` with pre-rc.41 fallback | COVERED — FR-041 |
| 5 | Merge `.aitri.local` when present; degrade gracefully (no error, fields absent, no fabricated lastSession) when absent | COVERED — FR-042 |
| 6 | Contained layout (`layoutRoot`) discovered in the directory scan | COVERED — FR-043 |
| 7 | Contained layout resolved in the fallback readers | COVERED — FR-043 |
| 8 | `bugs.parseErrors` surfaced as per-project warning; corrupt BUGS.json distinguishable from zero bugs | COVERED — FR-044 |
| 9 | `resultsBinding` absence/staleness surfaced as per-project indicator | COVERED — FR-045 |
| 10 | `quality_gates` results consumed (Problem 5) | COVERED — FR-047 (SHOULD) |
| 11 | Data layer can read `coverage_map`/`ac_coverage`/`validate --json` (Out-of-Scope clause residue) | **PARTIAL — GAP-1** |
| 12 | Review baseline recorded as full pre-release version in `integration-compat.json` | COVERED — FR-046 |
| 13 | rc.1→rc.159 CHANGELOG review (incl. 9 breaking entries) performed and recorded as part of this feature | COVERED — FR-046 |
| 14 | Fossil baselines (`FALLBACK_BASELINE '0.1.80'`, snapshot floor `'0.1.77'`) handled by the new comparator (Problem 6) | COVERED — FR-046 |
| 15 | Minimal display of the two new indicators on existing ProjectCard/alert surfaces (Touch Points [ASSUMPTION]) | COVERED — FR-044/FR-045 acceptance criteria (card/pill/alert wording) |
| 16 | Snapshot-first collection never demoted to fallback (FR-017 semantics) | COVERED — NFR-040 |
| 17 | Legacy pre-rc.41 project renders identically to today | COVERED — NFR-041 |
| 18 | Localhost-only admin API and registry CRUD unchanged | COVERED — NFR-042 |
| 19 | Remote sync (clone/pull cache, poller backoff) unchanged | COVERED — NFR-043 |
| 20 | `dashboard.json` shape stays additive for the SPA | COVERED — NFR-044 |

Out-of-scope boundaries respected (not gaps): new UI views/tabs (Layers 1–2); GitHub API metrics, dependency scanning, runtime monitoring (owner cut 2026-07-05); full rendering of `coverage_map`/`ac_coverage`/`validate --json` (rendering only — see GAP-1 for the read-capability residue).

#### Reverse-check — FR/NFR scope with no traceable seed need (questions, not gaps)

- **FR-043 AC-3 + NFR-045** — path-traversal rejection for `layoutRoot`/`artifactsDir` (absolute paths, `../`, symlink escape). The seed never asked for path-confinement security. Defensible hardening for untrusted `.aitri` files, but it is added scope; owner should ratify.
- **FR-046 AC-4** — `integration review` rejecting an unparseable version with a usage error. Command input validation not expressed in the seed.
- **NFR-046** — CI runs the full suite on every push to main. The seed says nothing about CI; this restates parent-project practice as a feature NFR.
