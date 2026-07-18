# UX / Design Spec — Aitri Hub v0.3.0 Redesign

**Archetype:** PRO-TECH/DASHBOARD — reason: a devtools monitoring surface for Aitri pipelines (data-dense, dark-first, monospace for data/IDs, muted semantic accents). Archetype defaults are used ONLY where the provided design is silent.

**Provided design (source of truth — transcribed here, not re-invented):**
- **`web/src/styles.css` (the LIVE Hub) — the authoritative design system.** Its header records the owner's decision verbatim: *"Palette: original GitHub-Dark (owner preference, reverted from the slate experiment)."* This supersedes the slate palette in `UI_UX_SPEC_V2.md` — the owner already tried slate and reverted. The redesign therefore **keeps and elevates the GitHub-Dark terminal system**, it does not repaint it.
- `feature_context/aitri-hub-jarvis-health.jsx` — authority for the Monitor bento urgency-sizing, the 5 health dimensions, and the Sessions timeline **interaction/layout** (NOT its synthwave colors — those are superseded by the live GitHub-Dark palette).
- `feature_context/aitri-hub-final.jsx` — authority for the nested Artifacts tree explorer interaction/layout.
- `idea_context/UI_UX_SPEC_V2.md` — authority for the **QA Workspace** structure and data contracts. Its slate palette is SUPERSEDED (see above); its Inter + JetBrains Mono hybrid typography still holds (and matches the live CSS).
- `feature_context/aitri-hub-ui-discovery (1).md` — the PRD/discovery that scopes all of the above.

**Design intent:** the owner's brief is to raise the existing Hub from MVP to professional quality — so this redesign's visual job is **higher craft within the established GitHub-Dark terminal language** (consistent rhythm, tighter hierarchy, the same system applied to the NEW surfaces — detail sidebar, artifact reader, QA workspace), NOT a new aesthetic. Slate/generic-dashboard and glow/HUD looks are explicitly out.

**Medium:** Desktop-first responsive web (the product is `aitri-hub web` at `localhost:3000`). Per `01_REQUIREMENTS.json` no_go_zone, mobile/tablet are NOT design targets — small viewports degrade to a single column without breaking, but are not optimized. Breakpoints below are therefore desktop-anchored (≥1200 / 768–1200 / <768), not the 375-first web default; this is a provided-requirement override of the mobile-first standard.

**Accessibility:** WCAG 2.1 AA. Body/text contrast ≥4.5:1, large text & UI components ≥3:1. Status is NEVER conveyed by color alone — every status carries an icon + text label. `prefers-reduced-motion` suppresses all non-essential animation.

**Performance budget:** each detail section renders ≤2s for a project with ≤20 artifacts; the Monitor renders all cards ≤2s for up to 20 projects (inherited from parent FR-006); action feedback ≤100ms.

---

## User Flows

Two top-level screens with a single-page state machine (`view: "monitor" | "detail"`, `selectedProjectId`, `activeSection`). No router; the browser Back button pops `detail → monitor` (History API `pushState`). Data comes only from `~/.aitri-hub/dashboard.json` (+ the QA execution store); the UI never reads project files directly.

### Flow M1 — Dev: triage the most urgent project (Monitor → Detail → Health)
- **Entry:** open `localhost:3000`.
- **Steps:** (1) Monitor renders the bento grid, worst-first; the single CRITICAL project is the largest card, top-left, with an alert glow + slow pulse. (2) Dev reads its one-line top issue on the card without opening it. (3) Dev clicks the card's detail CTA → Project Detail opens on Overview. (4) Dev clicks **Health** in the sidebar (badge shows the issue count) → the 5 dimension panels render; the failing dimension is CRITICAL with the issue text + remediation command. (5) Dev copies the remediation command.
- **Exit:** browser Back → Monitor, with the prior filter preserved.
- **Error path:** if the snapshot read failed this cycle, the grid keeps last-known cards and shows a `snapshot stale` banner in the topbar (never a blank grid). If the clicked project vanished from a newer snapshot, Detail shows a `Project not found — it may have been removed` state with a "Back to Monitor" action.

### Flow M2 — Product: read an artifact in product language (Monitor → Detail → Artifacts)
- **Entry:** Monitor card detail CTA.
- **Steps:** (1) Detail opens; Product clicks **Artifacts**. (2) The tree renders grouped by phase; each file shows its product name (e.g. "PRD — Product Requirements") with the technical filename as secondary text. (3) Product clicks a file → the reader renders Markdown formatted / JSON as a structured projection / embedded images inline. (4) Product reads; if the artifact was rejected, the reader shows the rejection feedback and the approve/reject actions.
- **Exit:** click the file again to close the reader (toggle), or Back to Monitor.
- **Error path:** an unresolved/oversized image renders as a placeholder with alt text while the rest of the document still renders. A file whose name is not in the mapping falls back to the raw filename (no blank label).

### Flow Q1 — QA: record a manual test execution (Detail → QA Test Cases → Execution)
- **Entry:** Detail sidebar → **Test Cases** (QA section).
- **Steps:** (1) The case list renders grouped by phase/feature with filters (phase/feature/status/type). (2) QA filters to `type = manual`, selects a case → the case detail opens with its execution history. (3) QA clicks **Record execution** → the execution form appears (inline panel): result (passed/failed/blocked — required), notes, environment, evidence upload. (4) QA fills result, attaches a PNG screenshot, submits. (5) The execution is appended to the case history, bound to the current verify-run id; the case status updates.
- **Exit:** close the form; the new execution is at the top of the history.
- **Error path (H5/H9):** submit with no result → inline field error "Select a result before saving" and nothing persists. Evidence of a disallowed type or >5MB → inline error "Only PNG/JPG/GIF/WebP/SVG up to 5MB" before any upload. Attempting to edit an **automated** case's status → the control is disabled with a hint "Automated status comes from test runs."

### Flow Q2 — QA: triage bugs and print a report (Detail → Bugs → Reports)
- **Entry:** Detail sidebar → **Bugs**.
- **Steps:** (1) Bugs list renders from `BUGS.json` with severity/status/feature filters. (2) QA opens a bug → detail with repro steps, evidence, status history. (3) QA switches to **Reports**, picks Project-summary → it renders on-demand from the current snapshot. (4) QA invokes browser print → a print-optimized layout (no nav chrome) prints to PDF.
- **Exit:** close report / Back to Monitor.
- **Error path:** `BUGS.json` missing → explicit empty state "No bugs reported for this project"; `BUGS.json` unparseable → a WARN banner "Bug file could not be read" (never a silent "0 bugs"). A report scope with no data → an explicit empty-report state, not a broken layout.

### Flow E1 — First run: no projects registered
- **Entry:** `localhost:3000` with an empty `projects.json`.
- **Steps:** the redesigned Monitor renders the existing onboarding empty state (parent FR-005): "No projects yet" + primary CTA "Add your first project" → `/admin`. The redesigned grid never shows a broken/blank layout.
- **Exit:** `/admin` (existing admin UI, unchanged by this feature).

---

## Component Inventory

States legend: **D** default · **L** loading · **E** error · **∅** empty · **X** disabled. Loading = a skeleton/shimmer unless noted; the app polls, so "loading" is mostly the first paint before the first snapshot.

### Screen: Monitor (Home)

| Component | States (D/L/E/∅/X) | Behavior | Nielsen |
|---|---|---|---|
| Topbar | D: logo + "AITRI HUB / MISSION CONTROL", radial NOMINAL-n/total, per-state counts, sync ticker, clock. L: counts show `—`. E: `snapshot stale` chip when a refresh read failed. ∅: counts all 0 with "No projects". X: n/a | Ticker counts down to next refresh; on stale read keeps last data + chip | H1 (status visible), H8 |
| Filter bar (ALL/CRITICAL/AT RISK/NOMINAL) | D: ALL active. L: disabled until first snapshot. E: n/a. ∅: filters disabled. X: a filter with 0 matches is dimmed but clickable (shows empty grid msg) | Selecting a filter narrows the grid; count `{n} PROJECTS · {m} ISSUES` updates | H4, H7 |
| Bento grid | D: cards laid out worst-first. L: 6 skeleton cards. E: keeps last cards + stale banner. ∅: onboarding empty state (FR-005). X: n/a | 4-col ≥1200 / 2-col 768–1200 / 1-col <768; CRITICAL spans 2 cols; re-sort + re-size on refresh | H1, H8 |
| Project card — CardLarge (CRITICAL) | D: alert glow + pulse (≤1500ms), health badge, name, segmented pipeline, 6 signal tiles, top-issue line, detail CTA. L: skeleton. E: card shows `unreadable` state if project data failed to parse. ∅: n/a (a card always has a project). X: n/a | Pulse suppressed under prefers-reduced-motion; whole card is the click target to Detail | H1, H2 (readable name), H6 |
| Project card — CardMedium (AT RISK) / CardSmall (NOMINAL) | same state set; CardSmall shows 4 tiles (TST/DFT/SIG/REJ) instead of 6 | size encodes urgency; label+icon carry state, not color alone | H8 |
| Health badge | D: NOMINAL/AT RISK/CRITICAL text + icon + color. others inherit card | icon+label ensures non-color encoding | A11y, H4 |
| Segmented pipeline bar | D: 5 segments, N filled by approved phases. ∅: 0 filled = "not started" | no phase text on the card (space); tooltip on hover | H8 |
| Signal tile (×6) | D: value + semantic color. ∅/L: `N/A` when the datum is absent (e.g. no verify run) — never a misleading 0. E: `N/A`. X: n/a | each tile thresholds its own green/amber/red | H1, error-prevention |
| Top-issue line | D: highest-severity issue text. ∅: "All systems nominal" | one line; truncates with ellipsis + title | H8 |

### Screen: Project Detail (shell)

| Component | States | Behavior | Nielsen |
|---|---|---|---|
| Sidebar (fixed) | D: name + health, branch + type (local/remote), mini pipeline, section nav w/ count badges, quick stats (issues/rejections/drift/tests). L: skeleton rows. E: "project not found" replaces the whole detail. ∅: badges hidden when 0. X: a section with no data is still listed, marked empty | stays fixed while content scrolls; nav switch swaps content ≤200ms | H3 (freedom), H6 |
| Back control ("‹ Mission Control") | D. others n/a | History back → Monitor, preserves filter | H3 |
| Section nav item | D / active / X (empty section is navigable, shows its own empty state) | badge = section issue count | H1, H4 |
| Content region | D: active section. L: section skeleton. E: section-scoped error card. ∅: section empty state. X: n/a | independent scroll; one section mounted at a time | H8 |
| Project-not-found panel | E-only: icon + "Project not found — it may have been removed" + "Back to Monitor" | shown when selectedId absent from snapshot | H9 |

### Screen sections (in Detail content region)

| Component | States | Behavior | Nielsen |
|---|---|---|---|
| Overview | D: description, phase pipeline (readable labels + state), metric tiles, test-telemetry gauge. L: skeleton. E: error card. ∅ (no verify run): telemetry shows "No run yet". X: n/a | gauge reflects pass ratio; tiles show real values | H1, H2 |
| Health — 5 dimension panels | D: Pipeline/Tests/Code/Artifacts/Version each w/ OK/WARN/CRITICAL badge + issues + remediation. L: skeleton. E: dimension error card. ∅ (no issues): "All checks passing" per panel. X: n/a | fixed order; badge = icon+label+color | H1, H9 |
| Artifacts — tree (left) | D: files grouped by phase, folder roll-up glyph ✓/○/✕, product name + technical name + size + age + status chip. L: skeleton tree. E: "Could not load artifacts". ∅ (phase w/o files): explicit empty/pending row. X: n/a | click file → reader; click again → close (toggle) | H6, H4 |
| Artifacts — reader (right) | D: rendered content + status + actions. L: "Rendering…" ≤2s. E: unresolved image → alt-text placeholder, doc still renders. ∅: "Select a file to read". X: approve/reject shown only when status allows | Markdown formatted; JSON structured projection; images inline (rel path + data-URI; PNG/JPG/SVG/GIF/WebP) | H1, H8, H9 |
| Sessions timeline | D: events newest-first (time, typed icon+label, phase, inline rejection feedback) + last-session context (work desc, files-touched chips, agent). L: skeleton. E: error card. ∅: "No sessions yet". X: n/a | chronological | H1, H2 |
| Alerts | D: cards for health issues (dim label + level) + external signals (tool + severity + msg + `→ command`). L: skeleton. E: error card. ∅: "All systems nominal" confirmation (green ring). X: n/a | count = health issues + signals (matches sidebar badge) | H1, H9 |

### Screen sections (QA Workspace, in Detail)

| Component | States | Behavior | Nielsen |
|---|---|---|---|
| Scope selector (Product / feature) | D: Product active. others n/a. X: features with no QA data still listed | re-renders QA tabs scoped to selection | H4 |
| Test Cases list | D: cases grouped by phase/feature (ID, desc, type, status) + filters. L: skeleton rows. E: "Could not read test cases". ∅: "No test cases yet". X: automated case status control disabled | filters: phase/feature/status/type | H5, H6 |
| Manual-status control | D: editable dropdown (manual). X: disabled + hint (automated). E: revert + inline error on write fail | edit persists; optimistic update w/ rollback on error | H3, H5, H9 |
| Execution form (inline panel) | D: result (required) / notes / environment / evidence. L: "Saving…". E: inline field errors. ∅: n/a. X: submit disabled until result chosen | binds to current verify-run; additive to history | H5, H9 |
| Evidence uploader | D: drop/select. L: upload progress. E: type/size rejection inline. ∅: "No evidence attached". X: disabled during save | client-validates type (PNG/JPG/GIF/WebP/SVG) + ≤5MB before upload | H5, H9 |
| Execution history | D: runs newest-first w/ result, run id, env, evidence thumb. ∅: "No executions yet". others inherit | never overwrites; append-only | H1 |
| Bugs list | D: bugs (ID, desc, severity, phase, status) + filters. L: skeleton. E/parse-fail: WARN banner "Bug file could not be read". ∅: "No bugs reported". X: n/a | filters: severity/status/feature | H1, H9 |
| Bug detail | D: full desc, repro steps, evidence, status history. L/E/∅ inherit | read-only (no editing bugs in Hub) | H2 |
| Reports view | D: report (project/feature/release) rendered on-demand + Print button. L: "Generating…". E: "Could not build report". ∅ (no data in scope): empty-report state. X: Print disabled while generating | browser print → print-optimized layout (no chrome) | H1, H7 |

---

## Nielsen Compliance

**Monitor** — H1 sync ticker + per-state counts + stale banner make system status always visible; H2 readable project names, not folder names; H4 the same card grammar (badge/pipeline/tiles) repeats across sizes; H6 signal tiles + icons make state recognizable without recall; H8 size/order carry meaning so the screen isn't noisy. Trade-off: CardSmall drops 2 tiles (space) — accepted; the dropped tiles (Verify/Version) surface in Detail.

**Project Detail shell** — H3 fixed Back + browser Back always available, filter preserved; H4 nav pattern consistent with sidebar apps; H6 count badges surface where attention is needed; H8 one section at a time avoids overload. Trade-off: single-page (no deep-linkable URLs) — accepted per requirements (single-page nav, no routing in v1).

**Artifacts** — H1 "Rendering…" then content ≤2s; H8 tree/reader split keeps focus; H9 unresolved images degrade to alt-text, never crash the doc. Trade-off: reader is read-only except the existing approve/reject/complete actions — matches no_go_zone (no artifact editing).

**Health / Alerts** — H1 status badges; H9 every issue carries a remediation action (what to run) — "actionable by default" principle. Trade-off: remediation is copy-to-run text, not a button that executes (no command execution from Hub, per no_go_zone) — accepted.

**QA Test Cases / Execution** — H5 result required + evidence validated before submit (prevent, not submit-and-fail); H9 errors say what and how to fix; H3 manual edits are reversible (rollback on write error); H6 labels above every field. Trade-off: automated statuses are read-only (edit disabled with hint) — intentional integrity guard.

**QA Bugs / Reports** — H1 parse errors surfaced, never silent zero; H7 print is one click; H2 product-language throughout. Trade-off: no file export — browser print only (no_go_zone).

Heuristics applied across the design: **10/10**. Violations found: 1 (prototypes conveyed some status by color alone) — **corrected** (icon+label added to every status in this spec). Accepted trade-offs: 4 (listed above), each traceable to a no_go_zone/requirement.

---

## Design Tokens

**These tokens transcribe the live GitHub-Dark system in `web/src/styles.css` (owner preference, reverted from slate) and extend it to the redesign's new surfaces.** Do NOT substitute a slate/generic palette — that is the exact look the owner rejected. Dark-only theme (light theme cut in v1). The "elevation" this redesign adds is craft, not new color: consistent `key:` column alignment, tighter Inter/mono hierarchy, and applying this same system to the detail sidebar / artifact reader / QA workspace so nothing drifts.

### Color roles (GitHub Dark — from web/src/styles.css)

| Role | Token / Hex | Reason | Contrast |
|---|---|---|---|
| background | `--bg #0d1117` | GitHub-Dark canvas | base |
| surface | `--surface #161b22` | cards / panels | AA-verified base per CSS header |
| surface-2 | `--surface-2 #21262d` | insets, table headers, code chips, tab bg | — |
| surface-raised | `--surface-raised #2d333b` | hover / elevated rows, tree selection | — |
| border | `--border #30363d` | 1px dividers, card edges | ≥3:1 UI component vs surface |
| text | `--text #e6edf3` | body & headings | on bg ≈ 14:1 ✓ |
| text-dim | `--text-dim #8b949e` | metadata, secondary values | on bg ≈ 6.4:1 ✓ |
| text-muted | `--text-muted #484f58` | line numbers, disabled | large/UI only (≈3:1) |
| syn-blue | `--syn-blue #79c0ff` | project names, links, approved phase, active nav | on surface ≈ 7.9:1 ✓ |
| syn-green (NOMINAL) | `--syn-green #3fb950` | healthy status, pass | ✓ |
| syn-yellow (AT RISK) | `--syn-yellow #e3b341` | warning status | ✓ |
| syn-red (CRITICAL) | `--syn-red #f85149` | error status, fail | ✓ |
| syn-teal | `--syn-teal #39c5cf` | verify phase, info bars, stat accents | ✓ |
| syn-purple | `--syn-purple #d2a8ff` | `▸` folder/group headers | ✓ |
| syn-orange | `--syn-orange #ffa657` | secondary numeric emphasis | ✓ |
| syn-comment | `--syn-comment #6e7681` | the `//` prefix + `key:` labels | large/UI only |
| severity-warn | `#fdb022` | alert/health WARN text (AA 8.07:1 vs surface, per CSS) | ✓ |
| severity-critical | `#f97066` | alert/health CRITICAL text (AA 6.39:1 vs surface) | ✓ |
| severity-info | `#84caff` | alert/health INFO text (AA 7.50:1 vs surface) | ✓ |

**Terminal design language (owner-established conventions — keep and apply consistently):**
- `//` comment prefix (in `syn-comment`) on project names, section/table headers, empty states.
- `[STATUS]` bracket badges — `border: 1px currentColor`, tinted bg at ~8% of the status color, uppercase mono.
- `key:` value rows — mono, label in `syn-comment` with a trailing `:`, aligned value column (min-width label so values line up).
- Cards = code-block panels: 8px radius, `4px` top border in the status color, subtle shadow.
- Section navigation = VS Code file tabs (bottom border on active, `syn-blue`).
- Alerts / health issues = log-file rows: line-number gutter, left status border, `project → message` layout.
- Semantic map: NOMINAL→`syn-green`, AT RISK→`syn-yellow`/`severity-warn`, CRITICAL→`syn-red`/`severity-critical`. Every status also carries a glyph + text label — never color alone.

**Artifact status → color:** approved `syn-green`, pending_approval `syn-yellow`, rejected `syn-red`, in_progress `syn-blue`, pending `text-muted`.

### Typography (matches live CSS)

| Token | Value | Reason |
|---|---|---|
| font-ui | **Inter**, system-ui fallback | UI, prose, headings (tracking −0.01em) |
| font-mono | **JetBrains Mono**, monospace fallback | ALL machine data: ids, versions, hashes, commands, counts, filenames, `//`+`key:` |
| base | 13px / line-height 1.6 | live base; data-dense |
| scale | 10 / 11 / 12 / 13 / 14 / 20 / 28 px | 10–12 mono metadata · 13 body · 14 header title · 20–28 stat values |
| weights | 400 body · 500 labels/nav · 600 names/titles/badges · 700 stat values | limited set |
| mono min size | ≥11px | secondary technical filename min (FR-019) |

### Spacing & radii (live CSS scale)

| Token | Value | Reason |
|---|---|---|
| space scale | 4 / 8 / 12 / 16 / 20 / 24 / 32 px | `--space-1..8`; card padding 16, grid gap 16, section gap 24 |
| radius | 8px cards · 3px panels/chips · 2px badges | live values (tighter than a generic 8px-everywhere) |
| card | min 280px, min-height 260px | live grid `minmax(280px,1fr)` |
| border | 1px edges · 4px top status accent | live |

### Motion (live CSS)

| Token | Value | Reason |
|---|---|---|
| card enter | fade + translateY(10px→0) 300ms | live `cardFadeIn` |
| CRITICAL/stalled pulse | opacity loop ~2s | live `stalledPulse` (attention without glow-HUD) |
| hover | border-color shift + status-tinted shadow, 120–150ms | live; no translate lift (keeps it calm/pro, not bouncy) |
| reduced-motion | suppress pulses + enter animation | A11y requirement |

### Breakpoints (desktop-anchored)

| Range | Monitor grid | Detail |
|---|---|---|
| ≥1200px | 4 columns (CRITICAL spans 2) | sidebar + content two-column |
| 768–1200px | 2 columns | sidebar + content, narrower sidebar |
| <768px (incl. 375px) | 1 column, stacked; **degraded, not a design target** — sidebar collapses above content; must not scroll horizontally or break | same stack |

Note: <768px is explicitly non-optimized per no_go_zone ("desktop web only; small viewports may degrade without breaking"). It is specified here only to guarantee it does not break, satisfying the "every screen states its small-viewport behavior" rule.

---

_Preview: UX_PREVIEW.html generated — a transcription read-back of the provided design system; compare it against `UI_UX_SPEC_V2.md` and the prototypes before approving._
