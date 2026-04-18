# UX Spec — snapshot-adoption

**Archetype:** PRO-TECH/DASHBOARD — reason: Aitri Hub is a developer monitoring tool consumed by engineers in a terminal-or-browser dashboard context; high information density, monospace for command/code fragments, dark-first option, muted accents.

This feature does not introduce new screens. It augments the existing **Dashboard → ProjectCard** component with two new sections (NEXT ACTION, DEPLOY HEALTH), three inline indicators (verify staleness, audit staleness, normalize uncountedFiles), and one optional metadata line (lastSession). The Hub's overall layout (header, filter bar, project grid) is out of scope.

---

## Scope statement

| Aspect | This feature | Out of scope |
|---|---|---|
| Screens added | 0 | New views, settings panels |
| Components added | 0 | New cards, modals, drawers |
| Components modified | 1 (ProjectCard) | Header, filter bar, grid layout |
| New row types in ProjectCard | 5 (NEXT ACTION row, DEPLOY HEALTH row, verify-staleness inline, audit-staleness inline, normalize warning row, lastSession line) | Drill-down panels |
| Design tokens | Inherits Hub's existing token set; adds 3 severity-color roles if not already present | Re-themeing |

---

## User Flows

### Flow A — Solo Developer scans morning dashboard for the next action

**Persona:** Hub user — Solo Developer
**Entry:** Opens browser to `http://localhost:3000` or runs `aitri-hub monitor` in terminal.
**Steps:**
1. Dashboard renders all registered ProjectCards.
2. User scans cards top-to-bottom looking for warning/critical severity prefixes in the new NEXT ACTION row.
3. User identifies a card showing `⚠ aitri verify-run — Phase 4 approved — run verify next`.
4. User copies the command from the card, switches to terminal in that project's directory, and runs it.
**Exit:** User has run the indicated command.
**Error path:** If a card shows `Aitri CLI not installed — limited report` (FR-017 degradation), user sees the warning row at the top of the card body and the legacy data still renders below — flow terminates with a clear remediation hint ("install aitri ≥ 0.1.77").

### Flow B — Team Lead spots staleness for standup

**Persona:** Hub user — Team Lead
**Entry:** Opens dashboard before standup meeting.
**Steps:**
1. Dashboard renders.
2. User scans the QUALITY section of each card for `verify stale (Nd)` or `audit stale (Nd)` indicators.
3. User scans the BLOCKERS section of each card for the normalize warning row (`N files changed outside pipeline`).
4. User notes 2 projects with stale verify and 1 project with off-pipeline changes.
**Exit:** User has a written list to bring up in standup.
**Error path:** If a project's snapshot fails (FR-017), the staleness indicators are absent (legacy reader does not have these fields) — the warning row at the card top is the only signal that data may be incomplete.

---

## Component Inventory

### 2.1 NEXT ACTION row (new — FR-012)

| Aspect | Specification |
|---|---|
| Position | Immediately above the existing PIPELINE section, below the card header |
| Default state | Two-line block: line 1 = severity icon + monospace command (`aitri verify-run`); line 2 = reason text (`Phase 4 approved — run verify next`) at 0.875× body size in text-secondary |
| Loading state | Skeleton rectangle of fixed height (≈48px) matching the two-line block; shown during initial collection cycle |
| Empty state | Single line in text-secondary: `No action — project idle` (no icon, no badge) |
| Error state | If snapshot present but `nextActions === undefined`, render empty state. Snapshot-failure is handled by the global card-level warning row (see 2.6), not here. |
| Disabled state | Not applicable — the row is informational, not interactive in this feature |
| Behavior | Command text is selectable (mouse drag) and click-to-copy on web. CLI dashboard renders plain text. No navigation. |
| Severity styling | `critical` → red badge prefix, role `severity-critical`; `warn` → amber badge prefix, role `severity-warn`; `info` → neutral, no badge |
| Long-command behavior | Command longer than card content width breaks to its own line (no horizontal scroll, no ellipsis); reason text wraps below at 0.875× body size |
| Nielsen heuristics applied | H1 (status visibility — user sees the next action without action), H2 (real-world language — uses the same command syntax the user types), H7 (efficiency — primary path is one glance) |

### 2.2 DEPLOY HEALTH section (new — FR-013)

| Aspect | Specification |
|---|---|
| Position | Below NEXT ACTION row, above PIPELINE section |
| Visibility rule | Hidden when `health.deployable === true`. Visible when `health.deployable === false`. |
| Default state | Section header `DEPLOY HEALTH` followed by N rows, one per `health.deployableReasons[]` entry. Each row: stable icon for `type` + `message` text. |
| Loading state | Section is hidden during loading (no skeleton — avoids flicker; user sees it appear when truthful) |
| Empty state | Hidden (when `deployable === true`, no section). |
| Error state | If `health.deployableReasons` is empty but `deployable === false` (contract violation from CLI), render fallback row `Project not deployable — reason unavailable` with `severity-warn` styling. |
| Disabled state | Not applicable |
| Icon mapping | `no_root` 🚫 · `phases_pending` ⏳ · `verify_not_passed` 🧪 · `drift` 🌀 · `normalize_pending` 📂 · `blocking_bugs` 🐛 · `version_mismatch` 🔢 (CLI dashboard uses ASCII equivalents: `X · ... · ! · ~ · F · B · V`) |
| Nielsen heuristics applied | H1 (system status — user sees deploy gate state), H9 (recovery from errors — each reason names the specific blocker so user knows what to address) |

### 2.3 QUALITY section (modified — FR-014)

| Aspect | Specification |
|---|---|
| Position | Unchanged — existing QUALITY section in the card |
| Default state | Existing test-count line (e.g. `Tests: 28/30`) renders unchanged. Two new inline indicators are appended on the same line or wrap below if width is constrained: `verify stale (Nd)` and `audit stale (Nd)` or `audit missing` |
| Loading state | Inherits existing QUALITY loading skeleton |
| Empty state | When neither indicator condition is true, no indicator text is shown — clean state, no decoration ("fresh" is not labeled). Existing test-count line still renders (or shows `Tests: N/A` per existing FR-004) |
| Error state | Indicators are absent on snapshot-failure (degraded mode) — the global warning row signals incompleteness |
| Disabled state | Not applicable |
| Indicator styling | `verify stale` and `audit stale` use `severity-warn` text role (amber). `audit missing` uses `severity-info` text role (neutral) — it is informational, not a problem in itself. |
| Width behavior | At ≥768px viewport, indicator text and number stay on a single line per indicator (no wrap). At <768px (mobile), each indicator wraps to its own line below the test-count line. |
| Nielsen heuristics applied | H1 (status — staleness is a system property surfaced visibly), H8 (minimalist — no chrome when nothing is stale) |

### 2.4 BLOCKERS section — normalize warning row (modified — FR-015)

| Aspect | Specification |
|---|---|
| Position | Inside existing BLOCKERS section, above any other blocker rows |
| Default state | Single row with warning icon + text `N files changed outside pipeline — run: aitri normalize` (singular `1 file changed outside pipeline ...` when N === 1) |
| Loading state | Inherits BLOCKERS section skeleton |
| Empty state | When `normalize.uncountedFiles === 0` or `null`, the row is absent. The BLOCKERS section may still render other content per existing collectors. |
| Error state | Absent on snapshot-failure |
| Disabled state | Not applicable |
| Styling | `severity-warn` (amber) — matches the rest of the BLOCKERS section's warning treatment |
| Coexistence | Renders alongside any `normalize_pending` row in DEPLOY HEALTH section — both are valid and independent (snapshot-time detection vs persisted state) |
| Nielsen heuristics applied | H1 (status — surfaces a hidden state), H5 (error prevention — flags drift before deploy gate fails) |

### 2.5 PIPELINE section — lastSession line (modified — FR-016)

| Aspect | Specification |
|---|---|
| Position | Bottom of existing PIPELINE section, on its own line |
| Default state | One line at 0.75× body size in text-secondary: `last: <event> by <agent> · <relative time>` (example: `last: phase 3 approved by claude · 2 days ago`) |
| Loading state | Inherits PIPELINE skeleton |
| Empty state | Line is absent when `lastSession` is undefined or when snapshot does not include the field (snapshotVersion 1 may not) |
| Error state | Absent on snapshot-failure |
| Disabled state | Not applicable |
| Styling | text-secondary, no icon, no badge — informational, low visual weight |
| Relative-time buckets | `<60s` → `just now` · `<60m` → `Nm ago` · `<24h` → `Nh ago` · `<7d` → `Nd ago` · `≥7d` → absolute date `MMM D, YYYY` |
| Nielsen heuristics applied | H1 (status — recency context), H10 (helps user recall what happened last) |

### 2.6 Card-level warning row — degradation (new — FR-017)

| Aspect | Specification |
|---|---|
| Position | Top of card body, below header, ABOVE NEXT ACTION row |
| Visibility rule | Visible only when snapshot collection failed and the legacy reader path was used for this project |
| Default state | Single line in `severity-warn` styling with one of these messages (one per failure reason): `Aitri CLI not installed — limited report` · `Aitri version too old for full report (need ≥0.1.77)` · `Snapshot unavailable — using legacy reader` · `Snapshot timed out — using legacy reader` |
| Loading state | Hidden during initial load |
| Empty state | Absent on success — happy path shows no warning row |
| Error state | Same as default state — this row IS the error surface |
| Disabled state | Not applicable |
| Styling | `severity-warn` background tint or left-border accent (whichever Hub already uses for warning rows in BLOCKERS) — must not be ignorable but also not block the rest of the card |
| Nielsen heuristics applied | H1 (status — user knows data is degraded), H9 (recovery — message names the specific cause and remediation) |

---

## Nielsen Compliance

The single screen affected is the Dashboard. Per-component mapping above. Screen-level summary:

| Heuristic | How this feature satisfies it |
|---|---|
| H1 Visibility of system status | NEXT ACTION, DEPLOY HEALTH, staleness indicators, and lastSession line all surface internal state that previously required CLI invocation. |
| H2 Match system to real world | NEXT ACTION shows the literal `aitri ...` command the user will type. No invented vocabulary. |
| H3 User control / freedom | No destructive actions added — purely informational rows. No undo needed. |
| H4 Consistency | Severity styling (critical/warn/info) and section ordering are consistent with Hub's existing treatment of BLOCKERS. |
| H5 Error prevention | Off-pipeline-changes row flags drift before user attempts to deploy. |
| H6 Recognition over recall | User recognises the next action from the rendered command rather than recalling pipeline state. |
| H7 Flexibility / efficiency | Power users can scan severity icons; new users can read full reason text below the command. |
| H8 Aesthetic / minimalist | Indicators are absent in clean state — no "all good" badges, no decoration when nothing to report. |
| H9 Recovery from errors | DEPLOY HEALTH names each blocker by type with a human message, replacing the legacy generic "N blockers" counter. |
| H10 Help / documentation | Reason text under each NEXT ACTION command serves as inline help. |

**Trade-offs accepted:**
- No interactive drill-down (clicking a deploy reason does not open a detail panel) — explicitly out of scope per FEATURE_IDEA.
- No "all green" badge when project is healthy — minimalist principle wins; absence of warnings is the signal.

---

## Design Tokens

Inherits Hub's existing token set. This feature requires the following severity-role tokens to be defined (if not already):

### Color roles

| Token | Light theme | Dark theme | Reason |
|---|---|---|---|
| `severity-critical` | `#B42318` | `#F97066` | Red — urgent, blocks user. WCAG ≥4.5:1 against background and surface roles. |
| `severity-warn` | `#B54708` | `#FDB022` | Amber — attention but not urgent. WCAG ≥4.5:1 against background and surface. |
| `severity-info` | inherits text-secondary | inherits text-secondary | Neutral — informational only. |
| `text-mono` | inherits text-primary | inherits text-primary | Used inside NEXT ACTION command — same color as primary text but with monospace family. |

### Typography

| Role | Family | Size | Weight | Use |
|---|---|---|---|---|
| Body | inherits Hub default sans-serif | 14px | 400 | All non-command text in new sections |
| Mono | `'JetBrains Mono', 'SF Mono', Menlo, monospace` | 14px | 500 | NEXT ACTION command, deploy-reason `type` label |
| Reason secondary | inherits Hub default sans-serif | 12px (0.875×) | 400 | Reason text under NEXT ACTION command |
| lastSession | inherits Hub default sans-serif | 11px (0.75×) | 400 | lastSession line at bottom of PIPELINE |

### Spacing

| Role | Value | Use |
|---|---|---|
| Row gap | 8px | Vertical gap between rows within a section |
| Section gap | 16px | Vertical gap between sections (NEXT ACTION → PIPELINE → QUALITY ...) |
| Inline indicator gap | 12px | Horizontal gap between QUALITY test-count and inline indicator (verify stale, audit stale) |
| Icon-text gap | 6px | Horizontal gap between severity icon and command/message text |

**Contrast verification:** All severity color tokens declared above have been chosen to meet WCAG 2.1 AA (≥4.5:1 against both light and dark surface roles). Implementation must verify against the actual Hub surface tokens; flag as defect if not.

---

## 5. Responsive Behavior — 375px / 768px / 1440px

| Breakpoint | ProjectCard layout |
|---|---|
| 1440px (desktop) | Card width ~360px, all sections render in single column. NEXT ACTION command and reason on separate lines as defined. QUALITY indicators inline on one line (test count + verify stale + audit stale). |
| 768px (tablet) | Card width ~340px, identical layout to desktop. QUALITY indicators may wrap if combined width exceeds card content area. |
| 375px (mobile) | Card width = viewport - 16px padding. NEXT ACTION command always on its own line (already the rule); QUALITY indicators stack one per line; DEPLOY HEALTH rows stack with icon left, message wrapping to next line if needed. lastSession line wraps if longer than card width. |

CLI dashboard (`aitri-hub monitor`) renders the same data in plain text at terminal widths ≥80 columns; mobile is not applicable in CLI context.

---

## 6. Empty / loading / degraded states — global summary

| State | Card behavior |
|---|---|
| Initial load | NEXT ACTION skeleton (~48px); PIPELINE/QUALITY/GIT/VERSION skeletons unchanged; DEPLOY HEALTH hidden during load (no skeleton — avoids flicker). |
| Snapshot success, project idle | NEXT ACTION shows `No action — project idle`; DEPLOY HEALTH hidden (deployable); QUALITY indicators absent (clean); BLOCKERS section may be empty; lastSession line shows last event if available. |
| Snapshot success, project healthy and deployable | Same as idle but NEXT ACTION may show `aitri validate` (priority-7) with reason "Deployable — run validate". |
| Snapshot success, project blocked | NEXT ACTION shows top blocker command + reason; DEPLOY HEALTH visible with all reasons; relevant indicators visible. |
| Snapshot failure (FR-017 degradation) | Card-level warning row at top (2.6) with specific message; legacy reader output renders below; new sections (NEXT ACTION, DEPLOY HEALTH, indicators) absent. |
