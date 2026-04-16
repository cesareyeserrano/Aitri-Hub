# UX Spec — integration-last-reviewed-gate

**Archetype: PRO-TECH/DASHBOARD** — reason: Aitri Hub is a developer monitoring tool (devtools/CLI/dashboard category). Users are high-tech developers running monitoring sessions in a terminal or browser. Density, monospace data rendering, and muted accents are appropriate. Dark-first with warning colors that stand out without being alarming.

---

## Design Tokens

All visual decisions derive from the PRO-TECH/DASHBOARD archetype defaults and the existing Aitri Hub palette.

### Color Roles

| Token              | Value     | Reason                                                                 |
|--------------------|-----------|------------------------------------------------------------------------|
| `--bg`             | `#0d1117` | GitHub-dark base — matches existing Hub web palette; reduces eye fatigue in long monitoring sessions |
| `--surface`        | `#161b22` | Card/panel background — 1 step lighter than bg for elevation            |
| `--surface-raised` | `#21262d` | Hover states, modals, collapsed sections — 2 steps above bg            |
| `--border`         | `#30363d` | Subtle separator — low contrast against surface; not distracting        |
| `--primary`        | `#58a6ff` | Links, active indicators — blue matches GitHub Actions/status idiom      |
| `--accent-ok`      | `#3fb950` | Healthy project badge, verified pass — green = operational              |
| `--accent-warn`    | `#d29922` | Integration alert banner, warning badges — amber = attention needed, not broken |
| `--accent-error`   | `#f85149` | Failing tests, verify failed alerts — red = action required             |
| `--text-primary`   | `#e6edf3` | Main labels, project names — high contrast on bg (contrast: 13.5:1)    |
| `--text-secondary` | `#8b949e` | Metadata, timestamps, phase labels — readable but recessive (contrast: 4.8:1) |
| `--text-on-warn`   | `#0d1117` | Text on warning banner background — dark on amber meets 4.5:1           |

**Contrast audit (WCAG 2.1 AA):**
- `--text-primary` on `--bg`: 13.5:1 ✅
- `--text-primary` on `--surface`: 11.2:1 ✅
- `--text-secondary` on `--bg`: 4.8:1 ✅
- `--text-secondary` on `--surface`: 4.6:1 ✅
- `--text-on-warn` on `--accent-warn`: 5.9:1 ✅
- `--accent-error` on `--surface`: 4.6:1 ✅

### Typography

| Role              | Family                          | Size  | Weight | Reason                                          |
|-------------------|---------------------------------|-------|--------|-------------------------------------------------|
| Data / metrics    | `monospace` (Consolas, JetBrains Mono, system-mono) | 13px | 400 | TC counts, phase numbers, versions are data — monospace aligns columns |
| Labels            | `system-ui, -apple-system, sans-serif` | 14px | 400 | UI labels — sans-serif for readability at small sizes |
| Alert message     | `system-ui, -apple-system, sans-serif` | 14px | 600 | Bold weight ensures alert text is read before project data |
| Feature name      | `monospace` | 12px | 400 | Feature names are code-adjacent identifiers     |
| Section heading   | `system-ui` | 12px | 600 | Small caps-equivalent for card sections         |

### Spacing Scale

| Token   | Value | Usage                              |
|---------|-------|------------------------------------|
| `sp-1`  | 4px   | Icon gap, tight inline spacing     |
| `sp-2`  | 8px   | Intra-component padding            |
| `sp-3`  | 12px  | Card internal padding              |
| `sp-4`  | 16px  | Section separation                 |
| `sp-6`  | 24px  | Card-to-card gap                   |
| `sp-8`  | 32px  | Banner vertical padding            |

---

## User Flows

### Flow 1 — Version mismatch detected on CLI startup (Solo Developer / Team Lead)

**Entry point:** User runs `aitri-hub monitor`

**Steps:**
1. Hub detects CLI version > INTEGRATION_LAST_REVIEWED
2. Before rendering any project row, Hub renders the integration alert line (see Component: CLI Alert Line)
3. Immediately after the alert line, the dashboard renders project rows as normal
4. Dashboard auto-refreshes every 5s; alert re-evaluates on each cycle

**Exit point:** User sees alert, reads action hint ("Review CHANGELOG.md"), then sees all project rows

**Error path:** If CLI version cannot be detected → alert line shows "Aitri CLI version undetectable — integration status unknown" with same warning style; project rows still render

---

### Flow 2 — Version mismatch detected on web dashboard (Team Lead)

**Entry point:** User opens `http://localhost:3000`

**Steps:**
1. React app loads and polls `/data/dashboard.json`
2. `integrationAlert` field is non-null in JSON response
3. Full-width banner renders above project cards grid (see Component: Web Alert Banner)
4. User reads banner, optionally clicks the CHANGELOG link
5. Project cards render below the banner as normal
6. On the next 5s poll, if alert is resolved (version bumped), banner disappears without page reload

**Exit point:** User sees all project data with alert context above

**Error path:** If dashboard.json cannot be fetched → existing loading/error states apply; banner is not rendered (not a new error surface)

---

### Flow 3 — Feature pipeline data visible in CLI row (Solo Developer)

**Entry point:** `aitri-hub monitor` running, a project has ≥1 feature sub-pipeline

**Steps:**
1. Collector scans `features/*/`, aggregates TC count and feature count
2. CLI row renders with aggregated TC count and `(+N features)` indicator in the TC column
3. User reads accurate total at a glance

**Exit point:** User sees correct 91 TCs instead of 30

**Error path:** If a feature `.aitri` is unreadable → that feature is skipped silently; TC count reflects only readable features; no row-level error indicator is added

---

### Flow 4 — Feature pipeline section in web card (Solo Developer / Team Lead)

**Entry point:** Web dashboard loads, project has ≥1 feature

**Steps:**
1. Project card renders with aggregated TC count
2. "Features (N)" collapsed section appears below main pipeline data (collapsed by default)
3. User clicks "Features (N)" to expand
4. Expanded section shows one row per feature: name · phase progress · verify status
5. User clicks again to collapse

**Exit point:** User has full visibility into all feature pipelines without leaving the dashboard

**Error path:** If featurePipelines array is empty or missing → "Features" section is not rendered; card shows only main pipeline data

---

## Component Inventory

### CLI Surface

#### Component: CLI Alert Line (new)

Rendered as a single line above all project rows. Uses ANSI escape codes, consistent with existing CLI rendering patterns.

| State     | Appearance                                                                 | Behavior                          |
|-----------|----------------------------------------------------------------------------|-----------------------------------|
| Default   | `⚠ [INTEGRATION] Aitri 0.1.77 detected — Hub not reviewed past 0.1.76 · See CHANGELOG.md` — amber/yellow ANSI color prefix | Renders once per render cycle, first line |
| Loading   | N/A — alert is synchronously evaluated before first render                 | —                                 |
| Error     | `⚠ [INTEGRATION] Aitri CLI version undetectable — integration status unknown` — same amber style | Collection proceeds; project rows still render |
| Empty     | Not rendered — if no alert condition, line is absent entirely              | No blank line left in its place   |
| Disabled  | N/A — alert cannot be dismissed from CLI                                   | —                                 |

**Nielsen heuristics applied:**
- H1 (Visibility of system status): Alert appears before data — user knows status before reading project rows
- H8 (Aesthetic minimalist): Single line; no multi-line banner in terminal to preserve screen density

**Responsive (terminal width):**
- ≥80 cols: Alert text truncated with `…` if it exceeds available width, preserving `⚠ [INTEGRATION]` prefix
- ≥120 cols: Full message rendered without truncation

---

#### Component: CLI Project Row — TC column (modified)

Existing row format is unchanged except the TC count column.

| State     | Before (current)  | After (this feature)             |
|-----------|-------------------|----------------------------------|
| Default   | `Tests: 30/30`    | `Tests: 91/91 (+2 features)`     |
| No features | `Tests: 30/30`  | `Tests: 30/30` (unchanged)       |
| Tests N/A | `Tests: N/A`      | `Tests: N/A (+2 features)` if features present |
| Error     | `Tests: N/A`      | Same — feature scan errors are silent at row level |
| Empty     | `Tests: N/A`      | Same                             |

**Responsive:** `(+N features)` label is omitted when terminal width < 100 cols to preserve column alignment. Feature count is still reflected in the aggregated total.

---

### Web Surface

#### Component: Web Alert Banner (new)

Full-width banner above the project cards grid. Implemented as a React component conditionally rendered based on `integrationAlert` in dashboard.json.

| State     | Appearance                                                                 | Behavior                                      |
|-----------|----------------------------------------------------------------------------|-----------------------------------------------|
| Default   | Full-width bar, background `--accent-warn` (#d29922), text `--text-on-warn`. Icon `⚠` left-aligned. Message + CHANGELOG link right-side. | Sticky-top or above grid; cannot be dismissed (intentional — must not be ignorable) |
| Loading   | Not rendered — banner appears only after dashboard.json is successfully parsed | — |
| Error     | Not rendered — if dashboard.json fails to load, existing error state applies | — |
| Empty     | Not rendered — `integrationAlert` is null → banner is absent, no layout shift | Height is 0 when absent; grid takes full space |
| Disabled  | N/A — no dismiss action exists                                             | — |

**Content structure:**
```
┌──────────────────────────────────────────────────────────────────────┐
│ ⚠  Aitri 0.1.77 detected — Hub integration not reviewed past 0.1.76  │
│    Review before trusting displayed data · [View CHANGELOG.md →]     │
└──────────────────────────────────────────────────────────────────────┘
```

**Nielsen heuristics applied:**
- H1 (Visibility): Banner is first element in viewport — impossible to miss
- H6 (Recognition over recall): Inline link to CHANGELOG — user does not need to remember where to look
- H8 (Minimalist): Two lines max; no additional chrome or decoration

**Responsive:**
- 375px: Banner stacks vertically — message on line 1, link on line 2; full-width; font 13px
- 768px: Single-line banner with message and link inline
- 1440px: Same as 768px; max-width constraint of 1200px centers with grid

---

#### Component: Feature Summary Section (new, inside ProjectCard)

A collapsible section rendered below the main pipeline data block inside each project card.

| State     | Appearance                                                                 | Behavior                                      |
|-----------|----------------------------------------------------------------------------|-----------------------------------------------|
| Collapsed (default) | `▶ Features (2)` — small chevron + count; text-secondary color; 12px | Click/tap toggles to expanded |
| Expanded  | `▼ Features (2)` header + list of feature rows (name · phases · verify) | Click/tap collapses; each feature row is one line |
| Loading   | Not rendered — section appears only when featurePipelines is loaded        | — |
| Error     | Not rendered — if featurePipelines is absent or empty, section is hidden   | Card shows main data only |
| Empty     | Not rendered — `featurePipelines.length === 0` → section absent           | No "Features (0)" shown |

**Expanded feature row format:**
```
  feat-name     ████░░   3/5 phases   ✓ verified
  other-feat    ██░░░░   2/5 phases   — not verified
```

**Nielsen heuristics applied:**
- H7 (Flexibility and efficiency): Collapsed by default — power users can expand; casual users see clean summary
- H8 (Minimalist): Feature detail hidden until requested; no visual noise in default state
- H3 (User control): User controls expanded/collapsed state; preference is not persisted (in-session only)

**Responsive:**
- 375px: Feature rows wrap name to first line, phase progress to second line (stacked layout)
- 768px+: Single-line feature row with columns

---

#### Component: ProjectCard — TC count (modified)

Existing card is unchanged except the TC count display.

| State     | Before (current)     | After (this feature)              |
|-----------|----------------------|-----------------------------------|
| Default   | `Tests 30 / 30`      | `Tests 91 / 91` (aggregated)      |
| No features | `Tests 30 / 30`   | `Tests 30 / 30` (unchanged)       |
| Tests N/A | `Tests N/A`          | `Tests N/A` (unchanged)           |
| Failing   | `Tests 28 / 30 ⚠`    | `Tests 89 / 91 ⚠` (aggregated)   |

---

## Nielsen Compliance

### CLI Dashboard screen

| Heuristic | Requirement | Design Decision | Trade-off |
|-----------|-------------|-----------------|-----------|
| H1 Visibility | User knows system status before reading data | Integration alert renders as first line, before any project row | None |
| H2 Match real world | Use developer vocabulary | "Hub integration not reviewed past" — uses version strings and Aitri terminology familiar to the persona | None |
| H4 Consistency | Warning style consistent with existing alert indicators | Uses same ANSI color approach as existing project-level alert prefixes | None |
| H8 Minimalist | No extra noise when no alert | Alert line is entirely absent when no mismatch — zero layout impact | None |

### Web Dashboard screen

| Heuristic | Requirement | Design Decision | Trade-off |
|-----------|-------------|-----------------|-----------|
| H1 Visibility | Alert visible before any project data | Full-width banner is the topmost element in the main content area | Banner cannot be dismissed — accepted trade-off: this alert is a data reliability signal, not a notification |
| H3 User control | User can access feature detail on demand | Feature section is collapsed by default, user expands it | No persist of collapsed/expanded state — in-session only; acceptable for monitoring use case |
| H6 Recognition | CHANGELOG link is inline | Link rendered directly in banner — no need to know the URL | None |
| H7 Flexibility | Summary visible without interaction | Aggregated TC count in card header visible without expanding features section | Full detail requires one click |
| H8 Minimalist | Feature section hidden by default | No feature rows visible until user expands — default card footprint unchanged | None |

---

## Responsive Behavior Summary

| Component              | 375px                                        | 768px                            | 1440px                          |
|------------------------|----------------------------------------------|----------------------------------|---------------------------------|
| CLI Alert Line         | Truncated to terminal width, prefix preserved | —                                | —                               |
| CLI Project Row        | `(+N features)` omitted if < 100 cols        | —                                | —                               |
| Web Alert Banner       | Stacked: message + link on separate lines    | Inline single-line banner        | Same as 768px, max-width 1200px |
| Feature Summary Section | Feature rows stacked (name + phases on 2 lines) | Single-line feature rows        | Same as 768px                   |
| ProjectCard TC count   | Same rendering, aggregated value              | Same                             | Same                            |
