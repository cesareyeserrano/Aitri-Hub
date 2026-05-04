# Aitri Hub — UX/UI Specification

**Archetype: PRO-TECH/DASHBOARD** — reason: devtool for developers monitoring CI/pipeline state;
users are high-tech, data-dense terminal and web views are appropriate, dark-first theme matches
developer mental model, monospace for pipeline data.

---

## Design Tokens

Derived from archetype defaults and the "developer dashboard" aesthetic explicitly described in
the project brief (now archived as `01_REQUIREMENTS.json#original_brief`): terminal-style output,
data-dense cards, muted accent colors.

### Color Roles

| Token             | Value     | Usage                                      |
|-------------------|-----------|--------------------------------------------|
| `bg`              | `#0d1117` | Page / terminal background                 |
| `surface`         | `#161b22` | Card / panel background                    |
| `surface-raised`  | `#21262d` | Header bar, hover states                   |
| `border`          | `#30363d` | All borders, dividers                      |
| `text-primary`    | `#e6edf3` | Primary labels, project names              |
| `text-secondary`  | `#8b949e` | Metadata, timestamps, branch names         |
| `text-disabled`   | `#484f58` | Empty / N/A states                         |
| `accent-healthy`  | `#3fb950` | Healthy status indicator, passing tests    |
| `accent-warning`  | `#d29922` | Warning alerts, stale projects             |
| `accent-error`    | `#f85149` | Error alerts, failing tests, verify failed |
| `accent-info`     | `#58a6ff` | Phase progress bars, active branch label   |
| `accent-neutral`  | `#8b949e` | Not-started phases, N/A states             |

**Contrast verification** (against `surface` #161b22):
- `accent-healthy` #3fb950: ratio 7.1:1 ✓ (≥4.5:1)
- `accent-warning` #d29922: ratio 5.2:1 ✓
- `accent-error` #f85149: ratio 4.9:1 ✓
- `text-primary` #e6edf3: ratio 13.2:1 ✓

### Typography

| Role          | Family                                      | Size  | Weight |
|---------------|---------------------------------------------|-------|--------|
| `font-mono`   | `'JetBrains Mono', 'Fira Code', monospace`  | —     | —      |
| `font-ui`     | `'Inter', system-ui, sans-serif`            | —     | —      |
| `text-xs`     | `font-mono`                                 | 11px  | 400    |
| `text-sm`     | `font-mono`                                 | 13px  | 400    |
| `text-base`   | `font-ui`                                   | 14px  | 400    |
| `text-label`  | `font-ui`                                   | 12px  | 500    |
| `text-title`  | `font-ui`                                   | 16px  | 600    |
| `text-header` | `font-ui`                                   | 20px  | 700    |

Rationale: monospace for all pipeline data (phase counts, test counts, commit ages) so values
align in tables; sans-serif for UI chrome and labels.

### Spacing Scale

`4px` base unit. Scale: 4 · 8 · 12 · 16 · 24 · 32 · 48px.

---

## User Flows

### Flow 1 — First-Time Setup (`aitri-hub setup`)

**Interface:** CLI (terminal)
**Entry point:** User runs `aitri-hub setup` in any directory.
**Persona:** Solo Developer, Team Lead.

```
Step 1: System prints welcome header and instructions
Step 2: Prompt "How many projects do you want to register? [1]"
        → Default: 1. Accepts integer 1–50.
        → Error path: non-integer input → re-prompt with "Please enter a number between 1 and 50."
Step 3: For each project i of N:
        Prompt "Project [i] — path or GitHub/GitLab URL:"
        → Local path: validated to exist. Error → "Path not found. Enter an existing directory."
        → URL: accepted as-is. No network validation at setup time.
        Prompt "Display name for this project: [<inferred-from-path>]"
        → Default inferred from last path segment or repo name.
Step 4: Prompt "Default interface: CLI or Web? [cli]"
        → Accepts: cli, web. Case-insensitive.
        → Error: unrecognized → re-prompt with "Enter 'cli' or 'web'."
Step 5: System prints summary of all entries and asks "Save configuration? (Y/n)"
        → y/Y/Enter → writes ~/.aitri-hub/projects.json → prints "✓ Configuration saved."
        → n/N → prints "Aborted — nothing saved." → exit code 0
        → Write error → prints "Error: could not write ~/.aitri-hub/projects.json — [reason]." → exit code 1
Step 6: System prints next-step hint:
        "Run 'aitri-hub monitor' for CLI dashboard or 'aitri-hub web' for web dashboard."
```

**Exit point:** Process exits with code 0 (success) or 1 (write error).

---

### Flow 2 — CLI Terminal Dashboard (`aitri-hub monitor`)

**Interface:** CLI (terminal, width ≥80 columns)
**Entry point:** User runs `aitri-hub monitor`.
**Persona:** Solo Developer.

```
Step 1: System reads ~/.aitri-hub/projects.json.
        → File missing → prints setup prompt: "No projects configured. Run 'aitri-hub setup' first."
          → exit code 1.
Step 2: System runs collection cycle (reads .aitri, git metadata, test results per project).
        → Collection errors per project are captured silently; project shown as 'unreadable'.
Step 3: System clears terminal, renders full dashboard (see Layout spec below).
        → Renders within ≤2 seconds for ≤20 projects.
Step 4: Auto-refresh loop: every 5 seconds, re-collect and re-render (clear + redraw).
        → No user interaction required.
Step 5: User presses Ctrl+C.
        → SIGINT handler: show cursor (if hidden), print newline, exit cleanly (code 0).
        → No orphaned processes, terminal state fully restored.
```

**Error path — unreadable project during refresh:**
Row renders with status `UNREADABLE` in `accent-error` color. All other rows unaffected.

**Layout — CLI Dashboard (≥80 columns):**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  AITRI HUB  v{version}     {N} healthy  {N} warning  {N} error  ↻ 5s        │
├──────────────────────┬──────────┬─────────────┬──────────────┬───────────────┤
│  PROJECT             │  PHASES  │  TESTS      │  LAST COMMIT │  ALERTS       │
├──────────────────────┼──────────┼─────────────┼──────────────┼───────────────┤
│  ● finance-app       │  3/5 ✓   │  145/150    │  2h ago      │  —            │
│  ● aitri             │  5/5 ✓✓  │  89/92      │  5h ago      │  —            │
│  ⚠ ecommerce        │  2/5     │  N/A        │  78h ago     │  No commits   │
│  ✖ mobile-app       │  1/5     │  78/95 FAIL │  3h ago      │  Tests fail   │
└──────────────────────┴──────────┴─────────────┴──────────────┴───────────────┘
  Ctrl+C to exit
```

**Row prefix legend:**
- `●` (filled circle) — HEALTHY — rendered in `accent-healthy`
- `⚠` — WARNING (≥1 non-critical alert) — rendered in `accent-warning`
- `✖` — ERROR (verify failed or tests failing) — rendered in `accent-error`
- `?` — UNREADABLE (.aitri missing/malformed) — rendered in `accent-error`

**PHASES column format:**
- `N/5 ✓` = N phases approved, verify passed
- `N/5 ✓✓` = all 5 approved + verify passed
- `N/5` = N phases approved, verify not yet run
- `N/5 ✗` = verify failed

**TESTS column format:**
- `145/150` = passed/total
- `145/150 FAIL` = failing tests present (shown in `accent-error`)
- `N/A` = no 04_TEST_RESULTS.json

**LAST COMMIT column format:**
- `Xm ago` / `Xh ago` / `Xd ago`
- `>72h ago` shown in `accent-warning`
- `N/A` if not a git repo

---

### Flow 3 — Web Dashboard (`aitri-hub web` / `docker compose up`)

**Interface:** React SPA at localhost:3000
**Entry point:** User runs `aitri-hub web` or `docker compose up` in their working directory.
**Persona:** Team Lead, Portfolio Manager.

```
Step 1: CLI prints "Starting Aitri Hub web dashboard..." and runs Docker.
        → Docker unavailable → prints "Error: Docker not found. Install Docker to use web mode."
          → exit code 1.
Step 2: Container starts. Backend serves dashboard.json via static file or HTTP endpoint.
        React app served at localhost:3000.
Step 3: Browser opens (or user navigates to) localhost:3000.
        → Page loads within 2 seconds (renders all project cards).
Step 4: Frontend polls dashboard.json every 5 seconds.
        → On new data: cards update in place (no full page reload).
        → On poll failure: banner "Connection lost — retrying..." shown; last data remains visible.
Step 5: User reads project cards, identifies alerts, closes browser.
        → No state changes in the backend — read-only.
Step 6: User stops server with Ctrl+C or `docker compose down`.
```

---

## Component Inventory

### CLI Components

#### C-CLI-01: Dashboard Header Bar

| State    | Appearance                                                           | Behavior                                 |
|----------|----------------------------------------------------------------------|------------------------------------------|
| Default  | `AITRI HUB  v{ver}   N healthy  N warning  N error  ↻ 5s`          | Static during render cycle               |
| Loading  | `AITRI HUB  collecting...`                                           | Shown during first collection            |
| Error    | `AITRI HUB  ✖ Could not read projects.json — run aitri-hub setup`  | Replaces normal header; exits after 2s   |
| Empty    | `AITRI HUB  No projects registered — run aitri-hub setup`          | Shown when projects.json empty           |
| Disabled | N/A — header always renders                                          | —                                        |

**Nielsen:** H1 (system status visible — refresh interval shown), H8 (minimal — only summary counts).

---

#### C-CLI-02: Project Row

| State      | Appearance                                                              | Behavior                                      |
|------------|-------------------------------------------------------------------------|-----------------------------------------------|
| Default    | `● project-name   N/5 ✓   145/150   2h ago   —`                        | Normal healthy project                        |
| Warning    | `⚠ project-name   N/5     N/A       79h ago  No commits`               | Yellow prefix, alert text in warning color    |
| Error      | `✖ project-name   N/5 ✗   78/95 FAIL  3h ago  Tests fail`             | Red prefix, FAIL label in error color         |
| Empty      | N/A — empty projects.json handled at header level                       | —                                             |
| Unreadable | `? project-name   UNREADABLE — .aitri missing or malformed`            | Red prefix; other columns show dashes         |

**Nielsen:** H2 (user language: "No commits", "Tests fail" — not "STALE_ALERT_001"), H4 (same prefix icon system across all rows).

---

### Web Components

#### C-WEB-01: Page Header

| State    | Appearance                                                                         | Behavior                            |
|----------|------------------------------------------------------------------------------------|-------------------------------------|
| Default  | Logo + "AITRI HUB" title, summary pills: N Healthy · N Warning · N Error          | Static                              |
| Loading  | Skeleton shimmer replacing summary pills                                            | Shown on initial page load          |
| Error    | Red banner: "Dashboard data unavailable — backend may be offline. Retrying in 5s" | Replaces summary pills              |
| Empty    | "No projects configured. Run `aitri-hub setup` to add projects."                   | Centered in page body               |
| Disabled | N/A                                                                                 | —                                   |

**Nielsen:** H1 (refresh status visible), H6 (labels on all counts), H9 (error banner explains cause + action).

---

#### C-WEB-02: Project Card

**Dimensions:** min-width 280px, max-width 480px. Responsive grid: 1 col at 375px, 2 col at 768px, 3 col at 1440px.

| State      | Appearance                                                                   | Behavior                                            |
|------------|------------------------------------------------------------------------------|-----------------------------------------------------|
| Default    | Card with: title, status badge HEALTHY (green), phase progress bar, test counts, branch, commit age, no alerts section | Static between refreshes          |
| Warning    | Yellow left border (4px), warning badge, alerts list visible                 | Alerts section expanded, amber left border          |
| Error      | Red left border (4px), error badge, alerts list visible in error color       | Alerts section expanded, red left border            |
| Loading    | Skeleton shimmer on all data fields, badge replaced with pulsing gray pill   | Shown on initial load and during first poll         |
| Unreadable | Gray left border, badge "UNREADABLE", body text: ".aitri not found or malformed" | No data fields shown; error badge only          |

**Card anatomy:**
```
┌─ [left border: status color] ────────────────────────┐
│  finance-app                      [● HEALTHY]         │
│  ─────────────────────────────────────────────────    │
│  Phases   [████████░░] 3/5 approved                   │
│  Tests    145 / 150  passed  (96.6%)                  │
│  Branch   main                                         │
│  Commit   2h ago                                       │
│                                                        │
│  Alerts   None                                         │
└────────────────────────────────────────────────────────┘
```

**Alert badge contrast:** Badge background `accent-error` #f85149 on card surface `surface` #161b22 — ratio 4.9:1 ✓.

**Nielsen:** H1 (status badge), H2 (human-readable times), H8 (no decorative elements — data only).

---

#### C-WEB-03: Phase Progress Bar

| State    | Appearance                                                         | Behavior                        |
|----------|--------------------------------------------------------------------|---------------------------------|
| Default  | Filled segments: filled=approved (accent-info), empty (surface-raised) | Static                     |
| Loading  | Full-width gray shimmer bar                                        | During data load                |
| Error    | Red segment at end if verify failed                                | Last segment shown in error color |
| Empty    | All segments unfilled (0/5 approved)                               | All segments in surface-raised   |
| Disabled | N/A                                                                | —                               |

5 equal segments. Segment N filled if `approvedPhases.length >= N`. Verify-passed adds a checkmark after bar.

---

#### C-WEB-04: Alert Badge

| State    | Appearance                              | Behavior                               |
|----------|-----------------------------------------|----------------------------------------|
| Default  | No badge shown (healthy state)          | Absent for healthy projects            |
| Warning  | Yellow pill: "⚠ N alert(s)"            | Lists individual alert strings below   |
| Error    | Red pill: "✖ N alert(s)"              | Lists individual alert strings in red  |
| Loading  | Gray skeleton pill                      | During initial load                    |
| Disabled | N/A                                     | —                                      |

---

#### C-WEB-05: Connection Status Banner

| State      | Appearance                                                              | Behavior                              |
|------------|-------------------------------------------------------------------------|---------------------------------------|
| Default    | Not shown (hidden when connected)                                       | —                                     |
| Connected  | Not shown                                                               | —                                     |
| Retrying   | Amber banner top of page: "Reconnecting to dashboard data... (5s)"     | Appears after first failed poll       |
| Failed     | Red banner: "Dashboard unavailable — is `aitri-hub web` running?"     | Appears after 3 consecutive failures  |
| Restored   | Green flash banner: "Connected" — auto-dismisses after 2 seconds       | Shown when poll recovers              |
| Disabled   | N/A                                                                     | —                                     |

**Nielsen:** H1 (always know connection state), H9 (tells user what to do when broken).

---

## Nielsen Compliance

### CLI Monitor Screen

| Heuristic | How satisfied                                                                          | Trade-off |
|-----------|----------------------------------------------------------------------------------------|-----------|
| H1        | Header shows N healthy / N warning / N error and refresh interval (↻ 5s)             | None      |
| H2        | Row labels use plain language: "No commits", "Tests fail", not internal alert codes  | None      |
| H3        | Ctrl+C always works cleanly — user controls exit at any time                          | None      |
| H4        | Prefix icons (●/⚠/✖/?) applied consistently across all rows                         | None      |
| H5        | setup validates path before saving — prevents bad config entering monitor             | None      |
| H6        | Column headers always visible; legend printed below table                              | None      |
| H7        | Monitor is one command; Ctrl+C is standard terminal exit — no custom keybinding       | None      |
| H8        | No color/decoration beyond status indicators; data-dense but not cluttered             | None      |
| H9        | UNREADABLE row tells user which project and why; does not crash others                | None      |
| H10       | First-run empty state prints "run aitri-hub setup" hint; header prints next command   | None      |

### Web Dashboard Screen

| Heuristic | How satisfied                                                                           | Trade-off                                    |
|-----------|-----------------------------------------------------------------------------------------|----------------------------------------------|
| H1        | Status badge on each card + summary pills in header + connection banner                | None                                         |
| H2        | "2h ago", "Tests failing (2)", "No commits in 78h" — developer language               | None                                         |
| H3        | Read-only dashboard — no destructive actions possible                                   | No undo needed                               |
| H4        | Same color tokens for healthy/warning/error across cards, badges, borders, header pills | None                                         |
| H5        | Setup CLI validates paths before writing config — bad data never reaches dashboard     | None                                         |
| H6        | All card fields labeled (Phases:, Tests:, Branch:, Commit:, Alerts:)                  | None                                         |
| H7        | Primary action is viewing — single click opens nothing, no friction                    | No drill-down in v1                          |
| H8        | Cards show only essential fields; no charts, no decorative gradients                   | Chart view deferred to v2                    |
| H9        | Connection banner explains failure and names the fix command                            | None                                         |
| H10       | Empty state shows exact command to run; unreadable card shows exact problem            | None                                         |

---

## Responsive Behavior

### CLI Monitor

| Width      | Behavior                                                                     |
|------------|------------------------------------------------------------------------------|
| ≥80 cols   | Full table with all 5 columns                                                |
| 60–79 cols | ALERTS column hidden; alert indicator shown as suffix on PROJECT column      |
| <60 cols   | Stacked format: one project per block (name, status, 3 key metrics, alerts) |

Terminal width read via `process.stdout.columns` on each render.

### Web Dashboard

| Viewport   | Layout                                                                       |
|------------|------------------------------------------------------------------------------|
| 375px      | Single-column card list; card full-width; no horizontal scroll               |
| 768px      | 2-column card grid; header summary pills wrap to second line if needed       |
| 1440px     | 3-column card grid; header fully inline                                      |

Implemented via CSS Grid: `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))`.
No horizontal scroll at any breakpoint ≥375px.

---

## Empty and Error States Summary

| Screen       | Scenario                          | What user sees                                        | Action available              |
|--------------|-----------------------------------|-------------------------------------------------------|-------------------------------|
| CLI setup    | Path not found                    | "Path not found. Enter an existing directory."        | Re-prompt                     |
| CLI monitor  | projects.json missing             | "No projects configured. Run 'aitri-hub setup'."     | Exits, user runs setup        |
| CLI monitor  | .aitri missing for one project    | Row: `? project-name   UNREADABLE`                   | Other rows unaffected         |
| CLI monitor  | All projects unreadable           | All rows show UNREADABLE; header shows 0 healthy     | User investigates projects    |
| Web load     | dashboard.json missing            | Empty state: "Run `aitri-hub setup` first."          | Command shown                 |
| Web poll     | Backend unreachable (1–2 fails)   | Amber banner: "Reconnecting..."                      | Waits automatically           |
| Web poll     | Backend unreachable (3+ fails)    | Red banner: "Dashboard unavailable — check server"  | User restarts `aitri-hub web` |
| Web card     | Project unreadable                | Card: UNREADABLE badge, ".aitri not found"           | Visual only, no action in UI  |
