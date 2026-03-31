# UX Specification — web-graph-integration
## Aitri Hub: CLI Removal + Artifact Graph Tab

**Archetype: PRO-TECH/DASHBOARD** — reason: developer monitoring tool for Aitri pipelines; high-density data display, terminal/code-editor aesthetic, dark-first, muted accents. Users are high-tech developers who value information density over decorative UI.

---

## Design Tokens

All tokens reference Hub's **existing** CSS custom properties — no new tokens are introduced. The Graph tab uses the same token set as every other Hub tab.

| Role | Dark value | Light value | CSS var |
|------|-----------|-------------|---------|
| Background | `#0D1117` | `#FFFFFF` | `--bg` |
| Surface | `#161B22` | `#F6F8FA` | `--surface` |
| Surface raised | `#2D333B` | `#D0D7DE` | `--surface-raised` |
| Border | `#30363D` | `#D0D7DE` | `--border` |
| Text primary | `#E6EDF3` | `#24292F` | `--text` |
| Text secondary | `#8B949E` | `#57606A` | `--text-dim` |
| Approved (green) | `#3fb950` | `#1A7F37` | `--syn-green` |
| In-progress (blue) | `#79C0FF` | `#0969DA` | `--syn-blue` |
| Pending (gray) | `#6E7681` | `#6E7781` | `--syn-comment` |
| Drift (orange) | `#FFA657` | `#BC4C00` | `--syn-orange` |
| Error | `#f85149` | `#CF222E` | `--syn-red` |
| Font | JetBrains Mono, Courier New | same | `--font-mono` |

**Node status colors use Hub's existing semantic tokens** — not the raw hex values from FR-014. Mapping:
- Approved → `--syn-green` (matches `--accent-healthy`)
- In-progress → `--syn-blue` (matches `--accent-info`)
- Pending → `--syn-comment` (matches `--accent-stalled`)
- Drift → `--syn-orange` (matches `--accent-warning`)

**Graph canvas background**: `--bg` in dark mode, `--surface` in light mode. All node colors maintain ≥4.5:1 contrast against these backgrounds.

**Type scale** (existing Hub scale, no changes):
- Labels / node text: 11px, `--font-mono`, weight 400
- Tab labels: 12px, `--font-mono`, weight 500
- Empty state heading: 14px, weight 500
- Section headers: 13px, weight 600, `--text-dim`

**Spacing scale**: `--space-1` (4px) through `--space-8` (32px) — no new values.

---

## User Flows

### Flow 1 — Open Graph Tab (first time, single project)
**Persona**: Solo Developer  
**Entry**: User is on any Hub tab (e.g. Overview), clicks "Graph" tab  
**Steps**:
1. Tab bar highlights "Graph" tab (active state)
2. Graph panel mounts; project auto-selected (only 1 project registered)
3. Loading spinner shows on canvas area ("Loading artifacts…")
4. Spec data arrives from `dashboard.json` (already polled)
5. Cytoscape renders FR nodes (top tier) + TC nodes (bottom tier) with edges
6. Fit-to-screen applied automatically on first render
7. Legend visible bottom-right of canvas

**Exit**: User navigates to another tab — graph selection state is preserved in React state  
**Error path**: If spec data is malformed → error banner replaces canvas: "Could not parse artifacts for [project name]. Check spec/01_REQUIREMENTS.json."

---

### Flow 2 — Switch project in Graph tab
**Persona**: Team Lead  
**Entry**: Graph tab is active, user clicks project selector dropdown  
**Steps**:
1. Dropdown opens, lists all registered projects (names from `dashboard.json`)
2. User selects a different project
3. Loading spinner shows on canvas ("Loading artifacts…")
4. Previous graph fades out; new graph renders
5. Fit-to-screen applied automatically

**Exit**: Graph renders for selected project  
**Error path**: If selected project has no spec/ → empty state panel: "No artifacts found for [project name]." with note "Aitri spec files (01_REQUIREMENTS.json) not detected at [path]."

---

### Flow 3 — Collapse/expand subtree
**Persona**: Solo Developer  
**Entry**: Graph is rendered with FR nodes and visible TC children  
**Steps**:
1. User hovers over FR node → cursor changes to pointer, node border highlights (`--syn-blue`)
2. User clicks FR node
3. All child TC nodes animate out (opacity 1→0, ≤200ms)
4. FR node badge appears: "(N)" count of hidden children in `--text-dim`
5. User clicks FR node again
6. Child TC nodes animate back in (opacity 0→1, ≤200ms)
7. Badge disappears

**Exit**: Graph reflects collapse/expand state  
**Error path**: N/A — collapse/expand is local state only, no async operation

---

### Flow 4 — Pan and zoom graph
**Persona**: Solo Developer  
**Entry**: Graph is rendered with many nodes  
**Steps**:
1. User scrolls mouse wheel → graph zooms in/out (Cytoscape native)
2. User clicks and drags canvas background → graph pans
3. User clicks "Fit" button → viewport resets to show all nodes

**Exit**: User found the node they were looking for  
**Error path**: N/A — pan/zoom is purely client-side

---

### Flow 5 — Attempt `aitri-hub monitor` after upgrade
**Persona**: Developer using CLI  
**Entry**: Developer runs `aitri-hub monitor` in terminal  
**Steps**:
1. CLI prints: `monitor removed — run 'aitri-hub web' to open the dashboard`
2. Process exits with code 0

**Exit**: Developer runs `aitri-hub web`  
**Error path**: N/A — command is a no-op redirect

---

## Component Inventory

### Screen: Graph Tab Panel

| Component | Default | Loading | Error | Empty | Disabled |
|-----------|---------|---------|-------|-------|----------|
| **Tab button "Graph"** | Inactive: `--text-dim` label, no underline | — | — | — | — |
| **Tab button "Graph" (active)** | `--text` label + `--syn-green` bottom border | — | — | — | — |
| **Project selector dropdown** | Shows selected project name, `--surface-raised` bg, `--border` outline | Shimmer on first mount (≤500ms) | — | Shows "No projects registered" | Hidden if 0 projects |
| **Graph canvas** | Cytoscape DAG, `--bg` background, scrollable | Centered spinner (`--text-dim`) + "Loading artifacts…" | Error banner (see below) | Empty state panel (see below) | — |
| **FR node** | Rounded rect, status color fill, `--text` label, 11px mono | — | — | — | — |
| **FR node (hovered)** | Border: 2px `--syn-blue`, cursor: pointer | — | — | — | — |
| **FR node (collapsed)** | Same as default + badge "(N)" in `--text-dim` at top-right | — | — | — | — |
| **TC node** | Smaller rounded rect, status color fill, `--text-dim` label, 10px mono | — | — | — | — |
| **Edge (FR→TC)** | `--border` color, 1px, directed arrow | — | — | — | — |
| **Legend panel** | Bottom-right, `--surface` bg, `--border` border, 4 color swatches + labels | — | — | — | — |
| **Fit button** | Top-right of canvas, icon + "Fit" label, `--surface-raised` bg | — | — | — | — |
| **Error banner** | `--syn-red` left border, `--surface` bg, error message + project name | — | — | — | — |
| **Empty state panel** | Centered in canvas, `--text-dim` message, project path shown | — | — | — | — |
| **Remote project notice** | Centered in canvas: "Graph not available for remote projects" | — | — | — | — |

---

### Component States — Detailed

#### Graph canvas: Loading
- Full canvas area shows centered spinner (CSS animation, `--text-dim`)
- Text below spinner: "Loading artifacts…" in 12px `--text-dim`
- Appears immediately on project selection (H1: Visibility of system status)

#### Graph canvas: Error
- Canvas replaced by error banner:
  ```
  ⚠ Could not parse artifacts for [project name]
  Check spec/01_REQUIREMENTS.json at [path]
  ```
- Left border: 2px `--syn-red`; background: `--surface`; text: `--text`
- No action button (read-only — user must fix the file externally)

#### Graph canvas: Empty
- Canvas replaced by centered panel:
  ```
  No artifacts found
  [project name] has no spec/01_REQUIREMENTS.json
  Path: [absolute path]
  ```
- Text: `--text-dim`, 13px

#### Project selector: Empty (0 projects)
- Selector hidden; canvas shows:
  ```
  No projects registered
  Run 'aitri-hub setup' to register projects
  ```

#### FR node: all states
| State | Visual |
|-------|--------|
| Default | Status-colored fill, `--text` label |
| Hovered | 2px `--syn-blue` border overlay |
| Collapsed | Badge "(N)" + slightly dimmed fill |
| Selected (future) | Not in scope v1 |
| Disabled | N/A — all nodes interactive |

---

## Responsive Behavior

### Graph Tab — 375px (mobile)
- Tab bar scrolls horizontally (existing Hub behavior — all 7 tabs fit in a scrollable row)
- Project selector: full-width dropdown, `--space-4` padding, 44px tap target height
- Graph canvas: full viewport width, full height below selector + legend
- Legend: collapsed to icon-only by default; tap to expand inline
- Fit button: bottom-right FAB (floating action button), 44×44px tap target
- Node labels: hidden if canvas width < 400px; nodes show status color only (tooltip on tap)
- FR node tap: same collapse/expand behavior as click on desktop

### Graph Tab — 768px (tablet)
- Tab bar: all 7 tabs visible without scroll
- Project selector: 280px width, right-aligned to canvas toolbar
- Graph canvas: full remaining width/height
- Legend: always visible, right-aligned below Fit button
- All labels visible on nodes

### Graph Tab — 1440px (desktop)
- Same as 768px with more canvas space
- Toolbar (selector + Fit button) in a single horizontal bar above canvas
- Legend: fixed bottom-right corner of canvas, always visible

---

## Nielsen Compliance

### Graph Tab

| Heuristic | Applied | How |
|-----------|---------|-----|
| H1 Visibility of system status | ✅ | Loading spinner shown immediately on project select; "Loading artifacts…" text |
| H2 Match system to real world | ✅ | Tab labeled "Graph" not "DAG Visualizer"; node labels use FR/TC IDs users already know |
| H3 User control and freedom | ✅ | Collapse is reversible (click again); Fit button always available to reset viewport |
| H4 Consistency and standards | ✅ | Tab follows existing Hub tab pattern; project selector follows existing dropdown style |
| H5 Error prevention | ✅ | Remote projects show notice before load attempt; no action triggers destructive ops |
| H6 Recognition over recall | ✅ | Legend always visible (no need to remember status colors); project name always shown in selector |
| H7 Flexibility and efficiency | ✅ | Auto-select single project; Fit-to-screen on first render; keyboard tab navigation |
| H8 Aesthetic and minimalist design | ✅ | Canvas shows only graph + legend + selector; no sidebar panels in v1 |
| H9 Help recover from errors | ✅ | Error banner names the project + file path; not just "Error" |
| H10 Help and documentation | ✅ | Empty state explains how to get data ("run aitri-hub setup"); error state shows file path |

**Violations found and corrected**:
- H6 violation (initial design): node colors without legend → corrected by requiring persistent legend panel
- H1 violation (initial design): no loading state defined for project switch → corrected by adding loading spinner on every project selection, not just first load
- H9 violation (initial design): empty state without path info → corrected by showing absolute project path so user knows where to look

**Accepted trade-offs**:
- H10: No interactive onboarding tour for Graph tab — acceptable because users are high-tech developers (PRO-TECH archetype) who can read an empty state message
- H7: No keyboard shortcut to fit-to-screen — out of scope v1; button is sufficient
