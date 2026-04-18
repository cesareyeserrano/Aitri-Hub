# UX/UI Specification — hub-mvp-web

**Archetype: PRO-TECH/DASHBOARD** — devtools monitoring tool, CLI-adjacent, data-dense, terminal aesthetic. Defaults applied: dark-only (enforced by FR-019), high-density layout, monospace for all data, muted accents (green/cyan/red/yellow), minimal chrome.

**Design revision note:** FR-012 defined an expandable/collapsible card section. This spec supersedes that design decision — all indicators are always visible. FR-012 acceptance criteria must be amended in Phase 2 to reflect a flat card layout. Rationale: the card is a diagnostic tool for a working team; hiding data behind an interaction defeats its purpose.

---

## User Flows

### Flow A — Team morning check (Solo Developer / Portfolio Manager)

**Entry:** User opens `http://localhost:3000`

1. Page loads → header renders with clock and status counts
2. Stat tiles row: total projects, healthy, warning, blocking, pipeline %
3. If blocking alerts exist → triage section above card grid
4. Card grid renders — each card shows full diagnostic without interaction:
   - BLOCKERS section visible only when issues exist (drift, failed verify, rejection, bugs)
   - PIPELINE section: visual bar + phase label + last event
   - QUALITY section: test bar + FR coverage + compliance
   - GIT section: branch + commit age + unpushed/uncommitted counts
   - VERSION section: aitri version + mismatch warning if present
5. Team reads cards → blocked projects identified by red BLOCKERS section at top
6. Healthy projects show green pipeline bar and no BLOCKERS section

**Exit:** Team knows exactly which projects need attention and why.

**Error path:** `dashboard.json` unreachable → ConnectionBanner shows retrying/failed state; cards replaced by skeleton loaders; `[↻]` refresh in header.

---

### Flow B — Register project (Team Lead)

**Entry:** `http://localhost:3000/admin`

1. Admin panel: header `// admin — project registry` + `[← dashboard]` link
2. Project list with name, type badge (LOCAL/REMOTE), path/URL, `[Edit]` `[Remove]` per row
3. User clicks `[+ Add project]` → inline form expands
4. Fields: Name, Type (local/remote select), Path or URL
5. Path validated on blur (not submit) for local type
6. `[Save]` → spinner ≤100ms → success: form collapses, new row appears
7. `[← dashboard]` → home, new project appears after next 5s collection cycle

**Exit:** Project registered via browser, no terminal needed.

**Error paths:**
- Path not found: inline below field — `"Path not found. Check the path and try again."`
- Duplicate name: inline below name — `"A project named '[name]' already exists."`
- API down: banner — `"Could not save — is aitri-hub web running?"`

---

### Flow C — Remove project (Team Lead)

1. User clicks `[Remove]` → confirmation modal:
   `"Remove 'name'? This removes it from the registry. Project files are not affected."`
   Buttons: `[Cancel]` (left) · `[Remove]` (right, red)
2. Confirm → row removed immediately (optimistic), projects.json updated
3. Cancel → modal dismissed, no change

**Error path:** API failure → optimistic removal reversed, entry reappears, error banner.

---

### Flow D — Edit project (Team Lead)

1. `[Edit]` → row becomes inline form with pre-filled values
2. User modifies → inline validation on blur
3. `[Save]` → row reverts to display mode with new values
4. `[Cancel]` → original values restored, no write

---

## Component Inventory

### Screen: Home (`/`)

| Component | States | Behavior | Heuristics |
|---|---|---|---|
| **Header** | default, loading | Title `// aitri-hub vX.Y.Z`, status pills, clock (1s tick), `[↻]` refresh. No theme toggle. Loading: counts show `…` | H1, H8 |
| **ConnectionBanner** | hidden, retrying, failed, restored | Hidden=connected. Retrying=yellow. Failed=red + `[Retry]`. Restored=green 2s then hides | H1, H9 |
| **StatTiles** | default, loading | 5 tiles: projects (white), healthy (green), warning (yellow), blocking (red bold if >0), pipeline% (teal). Loading: `—` | H1, H8 |
| **TriageSection** | hidden, visible | Hidden when 0 blocking. Visible: red-surface panel, `✖ blocking — fix before continuing`, rows of `project → message [command]` | H1, H9 |
| **ProjectCard** | healthy, warning, error, unreadable, loading | See card spec below. Staggered fade-in 50ms/card | H1, H8 |
| **SkeletonCard** | loading | 3 skeletons on first load. Animated shimmer on name, bar, rows | H1 |
| **EmptyState** | visible | 0 projects: `"No projects registered."` + `"→ Go to /admin"` link | H6, H10 |

---

### ProjectCard — full spec

The card is a **diagnostic panel**. It reads top-to-bottom: "Is it blocked? → Where is it? → Is the work good? → Is git clean? → Is the version right?"

**Card structure:**

```
┌─────────────────────────────────────────────────┐
│ HEADER                                          │
│ // project-name              ✖ ERROR     [F]     │
│    v1.2.3                                       │
├─────────────────────────────────────────────────┤
│ BLOCKERS  (only when issues exist)              │
│  ✖ drift — phase 2 spec modified post-approval │
│  ✖ verify failed · 3 tests failing             │
│  ⚠ phase 3 rejected · feedback pending         │
│  ✖ 2 critical bugs open                        │
├─────────────────────────────────────────────────┤
│ PIPELINE                                        │
│  ████████████░░░░  3/5  Phase 4 Implementation  │
│  ◎ approved phase 3 · 2h ago                   │
│  ⟳ claude · complete tests · 1h ago            │
├─────────────────────────────────────────────────┤
│ QUALITY                                         │
│  ◉ tests    ████████████░░  27/30 (90%) ⚠      │
│  ◈ coverage 9/9 FRs covered ✓                  │
│  ◆ spec     ⚠ 2 placeholders unresolved        │
│  ◇ comply   ✓ COMPLIANT · 9/9 production_ready │
├─────────────────────────────────────────────────┤
│ GIT                                             │
│  ⎇ main · 3h ago                               │
│  ↑ 3 commits not pushed                        │  ← only if >0
│  ~ 5 files uncommitted                         │  ← only if >0
├─────────────────────────────────────────────────┤
│ VERSION                                         │
│  aitri v0.1.76 ✓                               │
│  ⚠ mismatch — project init'd with v0.1.74      │  ← only if mismatch
└─────────────────────────────────────────────────┘
```

**Card sub-components:**

| Sub-component | States | Behavior |
|---|---|---|
| **Card header** | healthy, warning, error, unreadable | Row 1: name left (monospace, max 28ch, title tooltip for overflow), status badge + health grade right. Row 2: app version `v1.2.3` in `--text-dim` 11px below the name — absent if not found. This keeps the name full-width regardless of length. |
| **BLOCKERS section** | hidden (no issues), visible (≥1 issue) | Absent from DOM when no issues. When visible: section label `BLOCKERS` in red dim, each issue on its own row with icon. Drift=`✖` red. Verify failed=`✖` red. Rejection=`⚠` yellow. Critical bugs=`✖` red. Each row is one plain sentence, no jargon. |
| **PIPELINE progress bar** | 0/5 → 5/5 | Full-width slim bar (6px height). Fill color: 0–2=red, 3–4=yellow, 5=green. Label right of bar: `3/5` + phase name `Phase 4 Implementation`. |
| **Last pipeline event row** | absent, present | `◎ [event] phase [N] · [age]`. Color matches event: approved=green, completed=teal, rejected=red. Absent if no events. |
| **Last session row** | absent, present | `⟳ [agent] · [event] · [age]`. Agent: claude/codex/gemini/opencode/cursor. Absent if no lastSession. |
| **QUALITY — tests row** | available, unavailable, failing | `◉ tests` + slim bar (4px) + `passed/total (%)`. Bar color: 100%=green, ≥80%=teal, ≥60%=yellow, <60%=red. `N/A` dim when unavailable. Failing: value in red, `⚠` indicator. |
| **QUALITY — coverage row** | covered, partial, uncovered, unavailable | `◈ coverage  N/N FRs covered ✓` green / `⚠ N/M FRs partial` yellow / `✗ N FRs uncovered` red. Absent if no requirements data. |
| **QUALITY — spec quality row** | clean, has issues, absent | `◆ spec  ✓` green when clean. `⚠ N placeholders unresolved` yellow when issues. Absent if no spec quality data. |
| **QUALITY — compliance row** | compliant, partial, draft, absent | `◇ comply  ✓ COMPLIANT` green / `⚠ PARTIAL` yellow / `· DRAFT` dim. Shows FR count `N/N production_ready`. Absent if Phase 5 not reached. |
| **GIT — branch + commit row** | fresh, ok, stale | `⎇ [branch] · [age]`. Age color: <24h=green, 24–72h=yellow, >72h=red + `STALLED` badge. |
| **GIT — unpushed commits** | hidden (0), visible (≥1) | `↑ N commits not pushed` in yellow. Absent when 0. |
| **GIT — uncommitted files** | hidden (0), visible (≥1) | `~ N files uncommitted` in yellow. Absent when 0. |
| **VERSION — aitri version** | match, mismatch, unknown | `aitri v0.1.76 ✓` green when current. `⚠ version mismatch — project v0.1.74` yellow when project was initialized with an older version. Absent when unknown. |

**Card states:**

| State | Appearance |
|---|---|
| `healthy` | No BLOCKERS section. Green status badge. Pipeline bar green or yellow. |
| `warning` | No BLOCKERS section but warning-level alerts visible in GIT or VERSION rows. Yellow status badge. |
| `error` | BLOCKERS section present with ≥1 red row. Red status badge. Health grade D or F. |
| `unreadable` | Only header row rendered. Body: `// .aitri not found or malformed` in dim text. |
| `loading` | Skeleton card: animated shimmer on header, bar, 4 rows. |

---

### Screen: Admin Panel (`/admin`)

| Component | States | Behavior | Heuristics |
|---|---|---|---|
| **Admin Header** | default | `// admin — project registry` left. `[← dashboard]` right (React Router, no reload). | H3, H4 |
| **ProjectList** | default, empty, loading | Rows: name, type badge, path/URL (truncated 40ch), `[Edit]` `[Remove]`. | H6, H8 |
| **AddProjectForm** | collapsed, expanded, submitting, error | Collapsed: `[+ Add project]` button. Expanded: Name + Type select + Path/URL + `[Save]` `[Cancel]`. Submitting: button spinner, fields disabled. | H5, H6, H9 |
| **EditForm** | default, submitting, error | Inline in row. Pre-filled. Same validation as Add. `[Save]` `[Cancel]`. | H3, H4 |
| **RemoveConfirmDialog** | hidden, visible | Modal. `"Remove '[name]'? Project files are not affected."` `[Cancel]` + `[Remove]` (red). Focus trap. | H3, H9 |
| **EmptyState (admin)** | visible | `"No projects yet."` — AddProjectForm auto-expanded. | H6, H10 |
| **ErrorBanner** | hidden, visible | API-level errors. Auto-dismiss 5s. `[×]` manual dismiss. Message states what failed and what to check. | H1, H9 |

---

## Nielsen Compliance

### Home (`/`)

| Heuristic | How satisfied |
|---|---|
| H1 Visibility | Clock ticks 1s. `[updated Xm ago]` in header. ConnectionBanner on failure. Skeletons during load. |
| H2 Match real world | Sections labeled BLOCKERS / PIPELINE / QUALITY / GIT / VERSION — team vocabulary, not UI jargon. |
| H3 User control | Refresh always available. No destructive actions on home. |
| H4 Consistency | All rows use same icon + label + value pattern across all cards. |
| H5 Error prevention | No user input on home. N/A. |
| H6 Recognition | Every row labeled. Status badge text (`HEALTHY` not just color). Grade labeled (`[A]` not just green). Section headers orient the reader. |
| H7 Flexibility | All data visible without interaction. Power user scans 10 cards in seconds. |
| H8 Minimalist | BLOCKERS section absent when no issues (DOM not rendered). Git warning rows absent when clean. Version row absent when unknown. Only signal when there's something to say. |
| H9 Error recovery | ConnectionBanner tells user what's wrong + `[Retry]`. IntegrationAlertBanner links to changelog. |
| H10 Help | EmptyState guides to `/admin`. |

### Admin (`/admin`)

| Heuristic | How satisfied |
|---|---|
| H1 Visibility | Button spinner ≤100ms on save. List updates immediately after any operation. |
| H2 Match real world | Labels: "Name", "Type", "Path or URL" — no technical jargon. |
| H3 User control | Remove requires confirmation. Edit has `[Cancel]`. `[← dashboard]` always visible. |
| H4 Consistency | Add and Edit use identical field layout and validation behavior. |
| H5 Error prevention | Path validated on blur. Type select prevents invalid combinations. |
| H6 Recognition | Type badge (LOCAL/REMOTE) visible on each row — no need to remember what was entered. |
| H7 Flexibility | Add form collapsed by default — clean list for returning users, expands on demand. |
| H8 Minimalist | Only name, type, path. No tags, descriptions, metadata in MVP. |
| H9 Error recovery | Field errors inline next to field. API errors in banner. Both state what failed and what to do. |
| H10 Help | Empty state auto-expands add form. Path field placeholder shows example format. |

---

## Design Tokens

All tokens inherit from the existing `styles.css` `:root` block. No new tokens are introduced. This section is the implementation contract — developer uses exactly these values.

### Color roles

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0D1117` | Page background |
| `--surface` | `#161B22` | Card background, admin rows |
| `--surface-2` | `#21262D` | BLOCKERS section bg, form field bg |
| `--surface-raised` | `#2D333B` | Hover states, dialog bg |
| `--border` | `#30363D` | Card borders, section dividers, input borders |
| `--text` | `#E6EDF3` | Project names, metric values, primary text |
| `--text-dim` | `#8B949E` | Section labels (PIPELINE, QUALITY…), metric keys |
| `--text-muted` | `#484F58` | Skeleton fill, disabled fields |
| `--syn-green` | `#3fb950` | HEALTHY, grade A, passing tests, 5/5 pipeline, ✓ |
| `--syn-yellow` | `#E3B341` | WARNING, grade C, partial coverage, unpushed/uncommitted |
| `--syn-red` | `#f85149` | ERROR, grade F, BLOCKERS rows, failing tests, stale |
| `--syn-teal` | `#39C5CF` | Grade B, pipeline%, teal accents, last event completed |
| `--syn-orange` | `#FFA657` | Grade D, moderate risk |
| `--syn-comment` | `#6E7681` | Section header labels, dim icons, VERSION label |

**New semantic mappings:**

| Purpose | Token | Contrast check |
|---|---|---|
| Blocking badge bg | `--syn-red` | Text `--bg` (#0D1117) on red (#f85149) = 4.8:1 ✓ |
| BLOCKERS section bg | `--surface-2` with left border `--syn-red` 2px | Visual separation without heavy color |
| Unpushed/uncommitted rows | `--syn-yellow` text on `--surface` bg | 4.6:1 ✓ |
| Pipeline bar — 0–2/5 | `--syn-red` fill | Critical state |
| Pipeline bar — 3–4/5 | `--syn-yellow` fill | In progress |
| Pipeline bar — 5/5 | `--syn-green` fill | Complete |
| Test bar — <60% | `--syn-red` fill | Failing |
| Test bar — 60–79% | `--syn-yellow` fill | Partial |
| Test bar — 80–99% | `--syn-teal` fill | Good |
| Test bar — 100% | `--syn-green` fill | Perfect |
| LOCAL type badge | `--syn-teal` bg | Local = informational |
| REMOTE type badge | `--syn-purple` (`#D2A8FF`) bg | Distinct from local |
| Primary button (Save) | `--syn-green` bg, `--bg` text | Confirm action |
| Destructive button (Remove) | `--syn-red` bg, `--bg` text | Destructive action |
| Secondary button (Cancel) | `--surface-raised` bg, `--text-dim` text | De-emphasized |

### Typography

| Element | Size | Weight | Notes |
|---|---|---|---|
| Card project name | 13px | 600 | Max 28ch, `title` tooltip for full name |
| Health grade `[A]` | 16px | 700 | Largest element — scannable at a glance |
| Status badge | 11px | 600 | Uppercase, compact |
| Section labels (PIPELINE etc.) | 10px | 500 | Uppercase, `--text-muted`, tracking 0.08em |
| Metric row label | 12px | 400 | `--text-dim` |
| Metric row value | 12px | 500 | `--text` |
| BLOCKERS rows | 12px | 400 | `--text` on `--surface-2` |
| Admin form labels | 12px | 500 | Above fields, always visible |
| Admin form inputs | 13px | 400 | Comfortable for path entry |
| Inline error messages | 11px | 400 | `--syn-red`, below field |

All text: `JetBrains Mono` → `Courier New` → monospace (already loaded).

### Spacing

| Usage | Value |
|---|---|
| Card padding | 16px |
| Between metric rows | 6px |
| Between card sections | 10px (section divider line) |
| Between cards | 16px |
| BLOCKERS section padding | 10px 12px |
| BLOCKERS left accent border | 2px solid `--syn-red` |
| Admin row padding | 12px 16px |
| Form field gap | 12px |
| Dialog padding | 24px |

### Layout

| Breakpoint | Card grid | Admin |
|---|---|---|
| 375px | 1 column full-width | Single column, full-width fields |
| 768px | 2 columns | Single column, max-width 640px |
| 1440px | 3–4 columns (`auto-fill`, min 300px) | Max-width 720px, centered |

**Card min-width:** 300px. **Card max-width:** 460px.

### Motion

| Interaction | Duration | Easing |
|---|---|---|
| Card entrance stagger | 50ms delay/card, 200ms fade+translateY(8px) | `ease-out` |
| ConnectionBanner show/hide | 150ms | `ease-in-out` |
| Remove confirm dialog | 120ms | `ease-out` |
| Add form expand | 180ms max-height | `ease-out` |
| Toast auto-dismiss | 5000ms hold + 300ms fade | `ease-in` |

---

## Responsive Behavior

### Home — 375px
- 1-column card grid
- Header: `// aitri-hub` + `[↻]` only (status pills wrap to second line)
- Stat tiles: 2×3 wrap grid
- Cards full width, all sections stack normally

### Home — 768px
- 2-column grid
- Full header inline

### Home — 1440px
- 3–4 column grid (auto-fill min 300px)
- Max-width container centered

### Admin — 375px
- Full-width single column
- Project rows stack: name+badge top, path below, icon buttons for edit/remove
- Form fields full-width

### Admin — 768px+
- Single-column table, full labels visible
- Form expands inline below list

---

## Empty States

| Location | Condition | Message | Action |
|---|---|---|---|
| Home | 0 projects | `"No projects registered."` | `"→ /admin to add your first project"` link |
| Home | API unreachable | `"Dashboard data unavailable."` | `[Retry]` in ConnectionBanner |
| Admin | 0 projects | `"No projects yet."` | AddProjectForm auto-expanded |
| Admin | API fetch fails | `"Could not load projects — check that aitri-hub web is running."` | `[Retry]` button |
