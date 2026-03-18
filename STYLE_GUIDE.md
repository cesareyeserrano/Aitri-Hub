# Aitri Ecosystem — Visual Style Guide

**Owner:** Aitri Hub
**Applies to:** Hub, Graph, and any future Aitri subproduct with a UI.
**Philosophy:** Code-editor / terminal aesthetic. Every screen should feel like a well-structured file open in an IDE — not a SaaS dashboard.

---

## Design principles

1. **Monospace everywhere** — all text uses a monospace font. No exceptions.
2. **Code metaphors in UI** — labels look like comments (`// label`), badges look like type annotations (`[STATUS]`), prompts look like shell output (`> message`).
3. **Minimal decoration** — sharp corners (2–4px radius), flat backgrounds, thin borders. No gradients, no shadows unless communicating elevation.
4. **Color carries meaning** — each color maps to a semantic state (healthy, warning, error, info). Do not use colors decoratively.
5. **Dark-first** — dark theme is the canonical design. Light theme is a supported variant, not an afterthought.

---

## Color palette

### Dark theme (canonical)

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#0D1117` | Page background |
| `--surface` | `#161B22` | Cards, panels |
| `--surface-2` | `#21262D` | Inputs, table headers, secondary surfaces |
| `--surface-raised` | `#2D333B` | Hover states, raised elements |
| `--border` | `#30363D` | All borders |
| `--text` | `#E6EDF3` | Primary text |
| `--text-dim` | `#8B949E` | Secondary text, values |
| `--text-muted` | `#484F58` | Placeholders, disabled, timestamps |

### Syntax / semantic colors

| Token | Dark hex | Light hex | Semantic use |
|---|---|---|---|
| `--syn-green` | `#3FB950` | `#1A7F37` | Healthy, success, approved |
| `--syn-blue` | `#79C0FF` | `#0969DA` | Project names, info, active tabs, links |
| `--syn-purple` | `#D2A8FF` | `#8250DF` | Folder/group headers |
| `--syn-orange` | `#FFA657` | `#BC4C00` | Progress bars (mid-range) |
| `--syn-red` | `#F85149` | `#CF222E` | Error, rejected, stalled |
| `--syn-yellow` | `#E3B341` | `#9A6700` | Warning, drift |
| `--syn-teal` | `#39C5CF` | `#0969DA` | Velocity, metrics, neutral accent |
| `--syn-comment` | `#6E7681` | `#6E7781` | Labels, `//` prefixes, timestamps, dim UI |

### Status semantic mapping

| State | Color token | Applies to |
|---|---|---|
| `healthy` | `--syn-green` | No alerts, all phases passing |
| `warning` | `--syn-yellow` | Drift detected, stale commits |
| `error` | `--syn-red` | Failed verify, rejected phase |
| `stalled` | `--syn-comment` | Unreadable project, no recent activity |
| `info` | `--syn-blue` | Neutral info, current phase |

---

## Typography

| Role | Font | Size | Weight |
|---|---|---|---|
| Body / UI | JetBrains Mono, Courier New, monospace | 13px | 400 |
| Labels, metadata | same | 12px | 400 |
| Small badges, timestamps | same | 10–11px | 400–600 |
| Metric values (large) | same | 20–28px | 700 |
| Section headings | same | 11–12px | 400–600 |

**Rule:** only one font family across the entire UI. Hierarchy is expressed through size, weight, and color — not font switches.

---

## CLI ANSI palette

For terminal output (ANSI 256-color):

| Name | ANSI code | Approximate hex | Use |
|---|---|---|---|
| `steel` | 38;5;75 | `#5F87FF` | Primary accent, phase names |
| `fire` | 38;5;208 | `#FF8700` | Warnings, highlights |
| `ember` | 38;5;166 | `#D75F00` | Secondary warning |
| `green` | 38;5;114 | `#87D787` | Success, completion |
| `cyan` | 38;5;87 | `#5FFFD7` | Info, tips |
| `gray` | 38;5;245 | `#8A8A8A` | Dim text, separators |
| `dim` | `\x1b[2m` | — | Muted text (brightness modifier) |
| `bold` | `\x1b[1m` | — | Emphasis |
| `reset` | `\x1b[0m` | — | Always reset after each colored segment |

---

## UI patterns

### Label prefix — code comment style
Labels and section headings use `//` as a prefix, styled in `--syn-comment`.
```
// phase_progress:   ████░░  3/5
// last_commit:      2h ago
```

### Status badges — type annotation style
Brackets wrap the status text: `[HEALTHY]`, `[WARN]`, `[ERROR]`.
```css
.status-badge::before { content: '['; }
.status-badge::after  { content: ']'; }
```

### Shell prompt prefix — terminal banner style
Banners and connection status messages use `>` as prefix.
```
> reconnecting to dashboard…
```

### Folder / group headers
Use `▸` as the leading glyph, styled in `--syn-purple`.

### Card left accent
Cards have a 3px left border in the status color, not a full colored background. This keeps the surface neutral and lets the accent communicate state without overwhelming the layout.

### Border radius
- `2px` — badges, chips, small elements
- `3–4px` — cards, panels, inputs
- Never use values above 4px. No pill shapes (`border-radius: 9999px`) except in loading spinners.

### Spacing scale
| Token | Value |
|---|---|
| `--space-1` | 4px |
| `--space-2` | 8px |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-5` | 20px |
| `--space-6` | 24px |
| `--space-8` | 32px |

---

## Animations

- **Card fade-in:** `opacity 0 → 1 + translateY(10px → 0)`, 0.3s ease — on mount only.
- **Stalled pulse:** `opacity 1 → 0.55 → 1`, 2s ease-in-out infinite — only on `[STALLED]` badge.
- **Skeleton shimmer:** horizontal gradient sweep, 1.4s infinite — loading states only.
- **Progress bars:** `width` transition 0.5s ease, `background-color` 0.3s ease.

No scroll animations, no parallax, no entrance animations beyond card fade-in.

---

## What NOT to do

- No sans-serif or display fonts
- No `border-radius` above 4px
- No full-color card backgrounds (use left-border accent only)
- No colored text for decorative purposes — color = semantic state
- No gradients except the skeleton shimmer and the folder-group-header divider line
- No shadow (`box-shadow`) except the subtle status glow on card hover
- No icons beyond emoji and ASCII glyphs (`▸`, `●`, `✓`, `⚠`) — no icon libraries

---

## Applying this guide in a new subproduct

1. Import or replicate the CSS custom properties from `web/src/styles.css` in this repo.
2. Use the ANSI palette constants from `lib/commands/init.js` for CLI output.
3. Apply status colors strictly by semantic state — never choose a color because it "looks good".
4. When in doubt, match how Hub renders the same element.

If a pattern is not covered here, look at Hub's implementation first, then ask before introducing a new pattern — consistency across subproducts is more valuable than a perfect local design decision.
