# Aitri Hub — UI/UX Specification v2 (validated)

**Supersedes** `UI_UX_VISUAL_REQUIREMENTS.md` (v1 draft). This version is validated against
(a) what the Hub already ships (v0.1.6), (b) the data Aitri actually produces at v2.0.0-rc.158,
and (c) the product vision: **primary target = QA testers and QA auditors**, extending Aitri's
value to BA / PO / PM roles. Every widget below is mapped to a real data field — nothing is
specified that the data layer cannot serve.

**Scope decisions (owner-confirmed 2026-07-05):**
- **v1 uses Aitri-produced data only.** No GitHub API metrics, no dependency scanning, no
  runtime monitoring (see Annex A — cut list).
- **Dark theme only in v1.** Color tokens are structured so a light theme can be added later
  without refactoring. No light mode work now.
- **Typography hybrid:** Inter for headings/body; JetBrains Mono retained for machine data
  (hashes, FR/TC/BUG ids, versions, commands). Professional slate palette replaces the
  synthwave theme.

---

## Layered build plan

| Layer | What | Status |
|---|---|---|
| **0 — Foundation** | Integration-contract catch-up to Aitri v2.0.0-rc.158 (artifact renames, `.aitri`/`.aitri.local` split, pre-release semver, snapshot floor, new surfaces: `validate --json`, `resultsBinding`, `bugs.parseErrors`, `coverage_map`, `ac_coverage`, `quality_gates`). No UI — but every view below reads through it. | **Prerequisite** |
| **1 — Overview restyle** | The existing one-page dashboard, restyled to the visual system below; small metric additions. | Mostly built, needs restyle |
| **2 — QA Workspace** | Per-project detail view with QA-grade drill-down: test cases, traceability, bugs, artifacts, deploy verdict. | **New — the core product value** |

---

## Visual system

### Palette (dark, slate)

```
Background:        #0F172A   Card background:  #1E293B
Card border:       #334155   Text primary:     #F1F5F9
Text secondary:    #94A3B8
Success/healthy:   #10B981   Warning:          #F59E0B
Critical:          #EF4444   Info:             #3B82F6
Stalled/muted:     #6B7280
```

Usage rules:
- Cards carry a 4px top border in their status color.
- Status text in full color (`HEALTHY` green, `WARNING` amber, `BLOCKED` red, `STALLED` gray).
- All colors defined as CSS custom properties (`--color-*`) on `:root` — the future light
  theme is a second token set, not a rewrite.
- Contrast: all text ≥ WCAG AA against its background; status is never conveyed by color
  alone (always icon + label).

### Typography

```
Headings:      Inter 700, letter-spacing -0.5px    (h1 28px · section 18px · card title 16px)
Body:          Inter 400, line-height 1.5           (labels 12px · values 16px bold · help 11px)
Machine data:  JetBrains Mono 400                   (ids, hashes, versions, commands, JSON)
```

### Layout & spacing

- Card: ~350px wide, 8px radius, 20px padding, soft shadow; grid gap 20px.
- Grid: 4 columns >1200px · 2 columns 768–1200px · 1 column <768px.
- Sections separated by 30px; page margins 40px desktop / 20px mobile.

### Motion

- Page load: cards fade-in + slide-up 200ms, 50ms stagger.
- Data refresh: number/color transitions 200–300ms; progress bars 500ms.
- Hover (desktop): shadow + border highlight + translateY(-2px), cursor pointer.
- No animation blocks reading; respect `prefers-reduced-motion`.

---

## Layer 1 — Overview (one-page dashboard)

Goal unchanged from v1 draft: **instant health of all projects on one page**. This layer
already exists (HomeView + ProjectCard); the work is restyle + the deltas marked **NEW**.

### Header (always visible)

| Element | Data source |
|---|---|
| Logo + Hub version | build-injected `__APP_VERSION__` |
| Last updated (relative) | `dashboard.json` `generatedAt` |
| Status summary: 🟢 n HEALTHY · 🟡 n WARNING · 🔴 n BLOCKED | `deriveStatus()` per project |
| Total projects | registry |
| Refresh button | existing |
| **NEW** Deployable count (`n/N deployable`) | `health.deployable` per project |

*(v1 draft's "Team Velocity: PRs this week" is cut — Annex A.)*

### Project card

Keep the current dense card, restyled. Sections top→bottom:

1. **Header** — name, app version, status badge, health grade A–F, blocking count.
2. **Next action** — `nextActions[0]` with severity badge and command (mono).
3. **Deploy health** — deployable yes/no + reasons (`health`).
4. **Pipeline progress** — approved/5 phase bar + current phase name.
   Color ramp: <50% red · 50–79% amber · ≥80% green.
5. **QA metrics** (icon + label + value + state icon):
   - Tests: `passed/total (%)` — ✅ >90% · ⚠️ 70–90% · ❌ <70% (`tests.totals` / `verifySummary`)
   - FR coverage: `covered/total FRs` (`requirements`) — **labelled "FR coverage"**, never "%
     coverage": code-coverage % appears ONLY if the project declares a coverage quality gate,
     as a separate line with its declared threshold.
   - **NEW** Quality gates: `n/m passing` chips (lint, types, security…) from `quality_gates`.
   - Compliance: COMPLIANT / PARTIAL / DRAFT + `production_ready/total`.
   - Bugs: open-bug pill, red if any critical/high (`bugs.bySeverity`).
   - **NEW** Run-binding: small ⚠ "results not bound to a verify run" when `resultsBinding`
     is absent/stale (rc.148 contract).
6. **NEW — Features rollup** — Aitri projects are product + N feature sub-pipelines, each a
   full pipeline with its own artifact chain. The card shows the rollup: `Features: n · x
   verified · y in progress`, badged with the WORST feature status (a red feature must not
   hide behind a green product). Absent when the project has no features.
7. **Activity** — last event + relative time; git branch, uncommitted/unpushed.
   Freshness color: <24h green · 24–72h amber · >72h 🚨 STALLED (gray card border).

Card click → opens the project's **QA Workspace** (Layer 2).

### Triage / alerts section

Keep the existing global triage, restyled to the v1 draft's widget: grouped by severity
(🔴 blocking · 🟡 warning · ℹ️ info), each alert = project + message + suggested command
(mono). Add **`bugs.parseErrors`** surfacing (rc.158): a corrupt `BUGS.json` shows as a
warning alert, never silently as "0 bugs".

---

## Layer 2 — QA Workspace (per-project detail) — NEW

The missing layer in the v1 draft and the reason the product exists for its primary target.
Route: `/project/:id`. Header strip: project name, status, deploy verdict, aitri version,
artifactsDir.

**Scope selector (product + features):** every tab is scoped by a selector —
`Product | feature-a | feature-b | …` — because each feature is a full pipeline with its own
`01_REQUIREMENTS / 03_TEST_CASES / 04_TEST_RESULTS / 05_TRACEABILITY / BUGS.json` chain under
`features/<name>/`. General indicators show at Product scope; selecting a feature re-renders
Test Cases, Traceability, Bugs and Artifacts from that feature's chain. The Summary tab always
shows the product view PLUS the per-feature indicator table (phase, verify, tests, bugs per
feature). Tabs:

### Tab 1 — Summary
- Health score + phase-by-phase progress (per-phase status: approved / completed / drifted).
- Deploy verdict panel: the `aitri validate --json` result rendered — verdict, blocking
  reasons, advisories (incl. stale intent-coverage audit), each with its command.
- Feature sub-pipelines: per-feature phase/verify status (exists today, moves here).

### Tab 2 — Test Cases
- Table from `03_TEST_CASES.json` × `04_TEST_RESULTS.json`: TC id (mono), title, automation
  (auto/manual + `manual_reason`), status (passed/failed/pending/skipped), evidence link,
  `downgraded_from` audit trail, linked FR/AC ids.
- Filters: status, automation, linked FR. Counts strip: passed/failed/pending/manual.
- Manual-TC callout: pending manual TCs listed prominently (they block coverage — rc.109).

### Tab 3 — Traceability (FR → TC → result)
- The traceability matrix from `05_TRACEABILITY.json` + `fr_coverage`: one row per FR
  (id mono, text, priority MUST/SHOULD/COULD), its TCs and each TC's latest result.
- Uncovered MUST FRs highlighted red at top. `ac_coverage` shown per FR where present.
- Intent coverage: `coverage_map` rendered (idea → requirement decomposition) with the
  audit freshness stamp (`coverageAuditReqHash` match / stale).
- Optional graph view (FR→TC, Cytoscape — the built-but-unwired `web-graph-integration`
  feature lands here as a secondary visualization, table remains primary).

### Tab 4 — Bugs
- Table from `BUGS.json`: id, title, severity, status, blocking?, `resolution`,
  `files_changed`, linked TC. Blocking bugs pinned top with red band.
- Parse errors surfaced inline if the file is corrupt.

### Tab 5 — Artifacts
- Rendered reading view of the chain: `00_DISCOVERY.md`, `01_UX_SPEC.md`,
  `01_REQUIREMENTS.json` (rendered as a PRD table, not raw JSON), `02_SYSTEM_DESIGN.md`,
  `04_CODE_REVIEW.md`, `AUDIT_REPORT.md`. Markdown rendered; JSON artifacts get a
  human projection + collapsible raw view (mono).
- This is the BA/PO/PM entry point: the spec chain readable without opening an editor.

**Empty/degraded states (every tab):** artifact missing → explanatory empty state with the
aitri command that produces it; snapshot degraded → banner naming required CLI version;
never render a blank panel.

---

## Alert levels (mapping, not invention)

| Level | Triggers (all from existing data) |
|---|---|
| 🔴 Blocking | failed tests · blocking bugs (critical/high active) · drift on approved phases · verify required-but-missing · unbound results |
| 🟡 Warning | pending manual TCs · stale verify · stale audits · no activity >72h · coverage gate failing · BUGS.json parse errors |
| ℹ️ Info | deployable · all gates passing |

Toasts are cut from v1 (polling model; a client-side diff toast is a cheap later add).

---

## Annex A — cut from v1 (future phases, new data sources required)

Recorded so they are consciously deferred, not lost:

| Item | Why cut | Future path |
|---|---|---|
| Team velocity (commits/day, PRs merged, time-to-merge, LOC) | Aitri doesn't produce it; needs GitHub API + auth/rate limits | Phase "GitHub insights", opt-in |
| Vulnerable dependencies | Aitri neither scans nor should (zero-dep, stack-agnostic); Hub would have to orchestrate per-stack scanners | Only if a real consumer asks; likely via project-declared security quality gate output instead |
| Uptime / response time | Runtime monitoring — outside what Aitri is | Out of product scope |
| Light theme | No demand; token structure keeps it cheap | Add when a consumer asks |
| Toast notifications | Polling model; low value vs. triage section | Client-side diff later |

## Annex B — reference inspirations (from v1 draft)

GitHub Actions dashboard · Datadog · Vercel · Sentry — all dark-first, data-dense,
mono-accented. Confirms the dark-only + hybrid-typography decision.
