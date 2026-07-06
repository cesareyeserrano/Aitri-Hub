# Audit Report — qa-workspace

### Requirements Coverage

_Audit date: 2026-07-06. Sources: the feature seed (now absorbed into `01_REQUIREMENTS.json#original_brief`), `idea_context/UI_UX_SPEC_V2.md` § "Layer 2 — QA Workspace" (cited by the seed as the full spec), `01_REQUIREMENTS.json` (FR-050..059, NFR-050..055, no_go_zone, coverage_map). No `00_DISCOVERY.md` exists for this feature. Needs re-derived independently before diffing against the agent-declared coverage_map._

**Verdict: 28 needs traced, 27 covered, 1 gap.**

#### Gaps

**[GAP-1]** `PARTIAL` — Summary tab health score.
- Source: `idea_context/UI_UX_SPEC_V2.md` § Layer 2, Tab 1 — Summary: "Health score + phase-by-phase progress (per-phase status: approved / completed / drifted)." The seed cites this section as the feature's full spec ("Full spec: `idea_context/UI_UX_SPEC_V2.md`, section 'Layer 2 — QA Workspace'").
- Status: PARTIAL — FR-054 covers the phase-by-phase progress, the deploy-verdict panel, and the per-feature indicator table, but no FR or AC mentions a health score on the Summary tab. It is also absent from the coverage_map (dropped need, not a recorded disposition) and from the no_go_zone. Note: a health-score presentation exists on the overview page today (`web/src/styles.css` "Overview insights: phase distribution + health scores"), which may explain the omission — but the spec places it on the per-project Summary tab, and nothing records the decision to drop it there.
- Action: re-open Phase 1 to add it to FR-054 (or a new FR), OR record an explicit out-of-scope/deferred decision ("per-project health score deferred; overview health score suffices for v1") in the no_go_zone or coverage_map.

#### Traced needs (evidence of coverage)

Seed = the absorbed brief (`01_REQUIREMENTS.json#original_brief`); Spec = UI_UX_SPEC_V2.md § Layer 2.

| # | Need (source) | Status | FR/NFR |
|---|---|---|---|
| 1 | Card click opens per-project detail view, route `/project/:id` (Seed: New Behavior; Spec) | COVERED | FR-050 |
| 2 | Header strip: name, status, deploy verdict, aitri version, artifactsDir (Seed; Spec) | COVERED | FR-051 |
| 3 | Scope selector `Product \| <feature>…`, tabs re-render from that scope's own chain under `features/<name>/` (Seed; Spec) | COVERED | FR-053 |
| 4 | Summary: per-phase pipeline status approved/completed/drifted (Seed; Spec Tab 1) | COVERED | FR-054 |
| 5 | Summary: health score (Spec Tab 1 only) | **PARTIAL** | — (GAP-1) |
| 6 | Summary: deploy verdict from `aitri validate --json` — verdict, blocking reasons, advisories, each with suggested command, per VALIDATE_JSON.md (Seed; Spec) | COVERED | FR-054 |
| 7 | Summary: per-feature indicator table (phase, verify, tests, bugs per feature) (Seed; Spec) | COVERED | FR-054, FR-053 |
| 8 | `validate --json` on-demand on Summary open + manual refresh + short cache; never in the 5s cycle (Seed) | COVERED | FR-054, FR-052 |
| 9 | Test Cases table: TC id, title, automation + manual_reason, latest status, evidence reference, downgraded_from trail, linked FR/AC ids (Seed; Spec Tab 2) | COVERED | FR-055 |
| 10 | TC filters by status/automation/linked FR + counts strip (Seed; Spec) | COVERED | FR-055 |
| 11 | Pending manual TCs called out prominently — they block coverage (Seed; Spec) | COVERED | FR-055 |
| 12 | Traceability: one row per FR (id, title, priority) with TCs and latest results, from 05_TRACEABILITY + fr_coverage (Seed; Spec Tab 3) | COVERED | FR-056 |
| 13 | Uncovered MUST FRs pinned top in red, priority visible (Seed; Seed success criterion 2; Spec) | COVERED | FR-056 |
| 14 | ac_coverage per FR where present (Seed; Spec) | COVERED | FR-056 |
| 15 | coverage_map (intent coverage) rendered with audit-freshness stamp (Seed; Spec: `coverageAuditReqHash` match/stale) | COVERED | FR-056 |
| 16 | Bugs table: id, title, severity, status, blocking, resolution, files_changed, linked TC (Seed; Spec Tab 4) | COVERED | FR-057 |
| 17 | Blocking bugs pinned with red band (Seed; Spec) | COVERED | FR-057 |
| 18 | BUGS.json parse errors surfaced inline — never "0 bugs" over a corrupt file (Seed; Spec) | COVERED | FR-057 |
| 19 | Artifacts tab: markdown artifacts rendered as markdown (Seed; Spec Tab 5) | COVERED | FR-058 |
| 20 | 01_REQUIREMENTS.json as human PRD projection + collapsible raw view; other JSON summary + raw (Seed; Spec) | COVERED | FR-058 |
| 21 | Artifact chain presence/absence listing (implied Seed empty-state; Spec reading view) | COVERED | FR-058 |
| 22 | Every tab: explanatory empty/degraded state naming the producing aitri command — never a blank panel (Seed; Seed success criterion 5; Spec) | COVERED | FR-059 |
| 23 | Snapshot degraded → banner naming required CLI version (Spec empty/degraded block) | COVERED | FR-059 AC-3 |
| 24 | Overview page renders exactly as today: cards, triage, tiles, 5s polling (Seed: Must Not Break) | COVERED | NFR-050 |
| 25 | Process budget: zero per-cycle processes added; dashboard.json additive-only (Seed: Must Not Break) | COVERED | NFR-051, NFR-050 |
| 26 | Localhost-only guard: every new endpoint 403s non-loopback (Seed: Must Not Break) | COVERED | FR-052, NFR-052 |
| 27 | Path safety: reads confined to project root, whitelisted artifact names, no path from URL input (Seed: Must Not Break) | COVERED | FR-052, NFR-052 |
| 28 | Admin panel CRUD unchanged (Seed: Must Not Break) | COVERED | NFR-053 |

#### Skeptical pass — excluded as declared out-of-scope (not gaps)

- Visual restyle (slate/Inter/light tokens) — Seed Out of Scope; no_go_zone item 1.
- Any editing/writes from the workspace — Seed Out of Scope; no_go_zone item 2.
- Cytoscape FR→TC graph (Spec Tab 3 "optional graph view") — Seed Out of Scope explicitly defers it; no_go_zone item 4. The spec itself marks it secondary/optional, so its no_go_zone disposition is consistent, not a mis-disposition.
- GitHub API metrics, dependency scanning, runtime monitoring — Seed Out of Scope (owner cut 2026-07-05); no_go_zone item 5; Spec Annex A.
- quality_gates / ac_coverage from the snapshot (HUB-CATCHUP-0705 pending) — Seed Out of Scope; tabs read artifacts directly, which FR-055/056 honor.
- Spec "Alert levels" and Annex tables sit outside the "Layer 2 — QA Workspace" section (separate `##` headings) — not part of this feature's cited intent.

#### Reverse-check — FR/NFR content with no directly traceable client need (questions, not gaps)

1. **FR-050 not-found state and ≤200ms navigation** — the seed only asks that card click opens the detail view; the not-found route and latency numbers are agent-added (defensive/quantified). Reasonable, but confirm the owner accepts them as MUST-level acceptance criteria.
2. **FR-052 as a MUST requirement** — the seed marks the on-demand-endpoint architecture as an [ASSUMPTION] / "architecture decision for phase 2". FR-052 promotes that assumption to a Phase-1 MUST with a specific URL shape (`/api/project/:id/detail`, `/validate`). The security properties trace cleanly to the Must-Not-Break section; the endpoint architecture itself is pre-decided a phase early — confirm this is intended.
3. **FR-054 60s server-side cache** — the seed says "short cache … implementer's call within phase 2"; the AC pins 60s contractually. Constraints list says "owner-accepted assumption"; if that acceptance is real, this is fine.
4. **NFR-054 (≤500ms for ≤200 TCs / ≤10 features) and NFR-055 (CI on every push)** — no seed line expresses these numbers/policy; they derive from parent-project norms. Sensible, but they are agent-introduced scope.

#### Coverage_map diff (audit step 4)

- (a) Dropped need: "Health score" (Spec Tab 1) is absent from the coverage_map, the FRs, and the no_go_zone → GAP-1 above.
- (b) Wrongly excluded: none — all three out_of_scope map entries match the seed's declared Out of Scope.
- (c) Hollow coverage: none — each map entry's FR genuinely contains the stated need (verified against FR descriptions/ACs).

**Resolution (2026-07-06, pre-approval):** GAP-1 fixed — health score added to FR-054 (title, description, AC-1) + coverage_map entry. Reverse-check 2 addressed: FR-052 reworded so the route shape stays a phase-2 ADR (behavioral requirement unchanged). Reverse-checks 1/3/4 stand as agent-added hardening/norms for owner ratification at approve.
