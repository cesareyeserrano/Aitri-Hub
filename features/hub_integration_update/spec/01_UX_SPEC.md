# UX Specification — hub_integration_update

## Archetype
**PRO-TECH / DASHBOARD** — Developer-facing monitoring tool. Dense information, no decorative elements, monospace aesthetic. Users scan for anomalies, not browse for discovery.

## Design Tokens (inherit from Hub global tokens)
```
Background:    #0D1117  (--bg)
Surface:       #161B22  (--surface)
Surface-2:     #21262D  (--surface-2)
Border:        #30363D  (--border)
Text primary:  #E6EDF3  (--text)
Text dim:      #8B949E  (--text-dim)
Green:         #3fb950  (--syn-green)   → approved / healthy
Orange:        #FFA657  (--syn-orange)  → warning / in-progress
Red:           #f85149  (--syn-red)     → blocking / critical
Yellow:        #E3B341  (--syn-yellow)  → warning medium/low
Blue:          #79C0FF  (--syn-blue)    → info / agent:claude
Purple:        #D2A8FF  (--syn-purple)  → agent:codex
Teal:          #39C5CF  (--syn-teal)    → agent:gemini
Comment:       #6E7681  (--syn-comment) → muted / no data
Font:          JetBrains Mono, monospace (--font-mono)
Contrast:      all foreground/background pairs ≥4.5:1 confirmed
```

## Screens & Components

### 1. Project Card — Bug Badge (FR-021)

**Location:** Overview tab → each ProjectCard, inside the existing metrics area.

**States:**
- **default (no bugs):** no badge rendered — card height unchanged
- **warning (medium/low open bugs):** yellow pill badge `⚠ N bugs` using `--syn-yellow`
- **blocking (critical/high open bugs):** red pill badge `✖ N bugs` using `--syn-red`
- **loading:** badge not shown until data resolves
- **null bugsSummary:** no badge — identical to "no bugs" state

**Anatomy:**
```
[ ✖ 2 bugs ]   ← red pill, 10px font, 3px border-radius, inline with other metric chips
[ ⚠ 1 bug  ]   ← yellow pill, same sizing
```

**Responsive:** badge stays inline at all breakpoints ≥375px. At <375px wraps to next line.

---

### 2. Activity Tab — lastSession Rows (FR-020)

**Location:** ActivityTab component → per-project section, above existing pipeline event rows.

**States:**
- **default (lastSession present):** one row per project showing agent badge + event + relative time
- **empty (lastSession null):** no row rendered — no placeholder, no "N/A"
- **loading:** row not rendered until data resolves
- **error:** not applicable (null shown instead)

**Agent color map:**
```
claude   → --syn-blue    (#79C0FF)
codex    → --syn-purple  (#D2A8FF)
gemini   → --syn-teal    (#39C5CF)
opencode → --syn-orange  (#FFA657)
cursor   → --syn-green   (#3fb950)
unknown  → --syn-comment (#6E7681)
```

**Row anatomy:**
```
● [claude]  complete requirements  ·  2h ago
  ↑ agent   ↑ event text           ↑ relative timestamp
  badge     11px, --text-dim       11px, --syn-comment
```

- Agent badge: colored dot (8px) + agent name, 10px, colored per map above
- Separator: `·` (center dot) between event and timestamp
- Row visually distinct from pipeline event rows via left-border accent using agent color

**Responsive:** single-line at ≥768px; wraps to two lines at <768px (agent+event / timestamp).

---

### 3. Alerts Tab — Bug Alerts (FR-018)

No new component. Bug alerts appear as standard alert rows using the existing AlertsTab layout:

- **Blocking alert:** `[open-bugs] Open bugs: 2 critical, 1 high` — rendered with `severity: blocking` (red badge)
- **Warning alert:** `[open-bugs] Open bugs: 3 medium/low` — rendered with `severity: warning` (yellow badge)

Alert type key: `open-bugs`.

---

## User Flows

### Flow 1 — Developer spots a critical bug from Overview tab
1. Developer opens Hub → Overview tab (default)
2. Sees red `✖ 2 bugs` badge on project card → recognizes blocking issue
3. Clicks Alerts tab → sees blocking alert "Open bugs: 2 critical, 1 high"
4. Opens terminal → runs `aitri bug list` to triage

### Flow 2 — Developer checks which agent last worked on a project
1. Developer opens Hub → Activity tab
2. Sees `● [claude] complete requirements · 3h ago` row for a project
3. Understands Claude worked on requirements 3 hours ago
4. Continues their own work knowing the context

### Flow 3 — Project with no BUGS.json (no degradation)
1. Developer opens Hub → Overview tab
2. Sees project card with no bug badge → understands no bugs or no BUGS.json
3. No error, no crash, no empty placeholder

---

## Component Inventory

| Component | File | States | FR |
|---|---|---|---|
| BugBadge | web/src/components/BugBadge.jsx | default (none), warning (yellow), blocking (red) | FR-021 |
| LastSessionRow | web/src/components/LastSessionRow.jsx | default (data present), hidden (null) | FR-020 |
| Alert row (existing) | web/src/components/AlertsTab.jsx | extended with open-bugs alert type | FR-018 |

Each component state:
- **default**: renders normally with data
- **loading**: not rendered (parent handles loading state)
- **error**: null/missing data → renders nothing (no placeholder)
- **empty**: null bugsSummary → no badge; null lastSession → no row
- **disabled**: not applicable (read-only display components)

---

## Nielsen Compliance
1. **Visibility of system status** — bug badge immediately communicates risk on project card
2. **Match between system and the real world** — "critical/high" language matches Aitri's own severity vocabulary
3. **Error prevention** — no badge when null bugsSummary prevents false "0 bugs" display
4. **Recognition over recall** — agent color coding is consistent across all Hub tabs
5. **Aesthetic and minimalist design** — badge only appears when there are open bugs; no persistent "bugs: 0" noise

Nielsen violations found: 0
Nielsen corrections applied: 1 (removed "bugs: 0" label from initial draft — violates minimalist design)

## Responsive Breakpoints
- **375px** (mobile): bug badge wraps below metrics if needed; lastSession row wraps to 2 lines
- **768px** (tablet): single-line lastSession rows; badge inline with metrics
- **1440px** (desktop): no changes from 768px behavior
