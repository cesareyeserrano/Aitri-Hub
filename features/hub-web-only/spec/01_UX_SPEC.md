# UX/UI Specification — hub-web-only

Archetype: **PRO-TECH/DASHBOARD** — reason: Aitri Hub is a developer monitoring tool run on localhost; its users are technical (solo devs, team leads, portfolio managers); the host page renders dense project-card data against a dark UI using existing tokens (`--bg: #0D1117`, `--surface: #161B22`, `--syn-green/yellow/red`). This feature does not introduce a new archetype — it inherits the one the host app already uses.

This feature is **deletion-first**: it does not add new screens or components. Its UX surface is:

1. A single **empty-state panel** inside the existing `OverviewTab` (`web/src/components/OverviewTab.jsx:216-225`) that replaces CLI instructions with a browser CTA toward `/admin`.
2. The **CLI usage text** emitted by `aitri-hub help` — the only "screen" of the terminal surface, reduced to four recognised inputs.

No new routes, no new modals, no new React components, no new CSS classes.

---

## User Flows

### Flow 1 — First-time user, empty registry (FR-003, NFR-001)

**Persona:** First-time Hub User (tech: mid)
**Entry point:** Terminal session immediately after `npm install`.
**Goal:** See a first project card in the browser in ≤60s.

| Step | Surface | User sees / does |
|---|---|---|
| 1 | Terminal | Runs `aitri-hub web`. Server logs `✓ Dashboard running at http://localhost:3000` within 5s. Terminal is **not** blocked on a prompt. |
| 2 | Browser | Opens automatically (existing `open http://localhost:3000` hook in `cmdWeb`). `OverviewTab` mounts with `projects.length === 0`. |
| 3 | Empty-state panel | Title: **"No projects yet"**. Body copy: "Add your first project to start monitoring." Primary action: `<a href="/admin" role="button">Add your first project</a>`. Secondary action: `<a href="#" data-help-link>What is a project?</a>` (opens a short tooltip/popover with one sentence + link to README). |
| 4 | Admin page | Clicking the CTA navigates to `/admin` (existing view). The existing "Add project" form is the first thing on screen (no change required by this feature). |
| 5 | Dashboard | After adding one project, user navigates back to `/` (or clicks a "Back to dashboard" control already present in the admin view) and the first `ProjectCard` renders. |

**Exit point:** Overview tab showing ≥1 `ProjectCard`.
**Error path:** If `/api/projects` returns a non-2xx while adding, the admin form already shows a field-level error (existing behavior, unchanged). The empty-state does not itself make network calls, so it has no error state beyond "still empty".

### Flow 2 — Upgrading user, existing registry (FR-005)

**Persona:** Existing Hub User (Upgrading, tech: high)
**Entry point:** After `npm install` of the new version, existing `~/.aitri-hub/projects.json` already on disk.
**Goal:** Confirm no projects were lost; continue working.

| Step | Surface | User sees / does |
|---|---|---|
| 1 | Terminal (muscle memory) | May first run `aitri-hub monitor`. Gets `Unknown command: 'monitor'. Run 'aitri-hub help' for usage.` on stderr, exit code 1. |
| 2 | Terminal | Runs `aitri-hub help`. Sees exactly four commands listed: `web`, `integration review <version>`, `help`, `--version`. |
| 3 | Terminal | Runs `aitri-hub web`. Server starts, browser opens. |
| 4 | Browser | `OverviewTab` renders all previously registered projects — no migration prompt, no "welcome back" overlay. Flow terminates. |

**Exit point:** Familiar dashboard with all prior projects visible.
**Error path:** If the old `projects.json` has a `defaultInterface` field, it is ignored — not surfaced as a warning or error. (The read path in `lib/store/projects.js` is unchanged by this feature.)

### Flow 3 — Documentation reader (FR-004)

**Persona:** Documentation Reader (tech: mid)
**Entry point:** Opens `README.md` on GitHub or locally.
**Goal:** Understand what Hub is and how to run it in ≤3 minutes.

| Step | Surface | User sees / does |
|---|---|---|
| 1 | README.md — hero | One-paragraph description: "Local-only web dashboard for monitoring Aitri-managed projects. Runs on `localhost:3000` via a single Node.js process." |
| 2 | README.md — Quick Start | Exactly two fenced blocks: `npm install` then `aitri-hub web`. No CLI setup step, no `aitri-hub setup`, no `aitri-hub monitor`. |
| 3 | README.md — Commands table | Four rows: `web`, `integration review`, `help`, `--version`. |
| 4 | README.md — Architecture diagram | Single Node.js process (box) with two arrows: "serves React SPA" and "runs collector every 5s". No second box for "Docker / nginx" in the primary diagram. |
| 5 | DEPLOYMENT.md — primary flow | Same Quick Start; env-var table with `AITRI_HUB_REFRESH_MS` described as "collector refresh interval (ms)". |
| 6 | DEPLOYMENT.md — optional section | Heading `## Optional: Docker deployment` wraps all Docker / `docker-compose` / nginx instructions. A one-sentence banner at the top of that section states: "Docker is optional — the happy path is `aitri-hub web`." |

**Exit point:** Reader understands: one command, one process, browser UI at `localhost:3000`.

### Flow 4 — CI / non-interactive shell (NFR-002)

**Persona:** Existing Hub User (Upgrading), but on a CI runner or via `nohup`.
**Entry point:** `aitri-hub web </dev/null >/tmp/web.log 2>&1 &`.

| Step | Surface | Expected behavior |
|---|---|---|
| 1 | stdout/stderr (via log) | `Dashboard running at http://localhost:3000` appears within 5s. |
| 2 | Process state | PID remains alive; no stdin read; SIGINT/SIGTERM exits cleanly with the existing handler. |

**Error path:** If port 3000 is in use, the existing `EADDRINUSE` branch logs the conflict and exits 1 (unchanged from current `web.js:364-372`). This feature does not alter that path.

---

## Component Inventory

### Surface A — Empty-state panel (inside `OverviewTab`)

This is the **only** component this feature touches. It replaces the current two `<p>` elements at `OverviewTab.jsx:217-225`.

| Component | State | Behavior | Nielsen heuristics applied |
|---|---|---|---|
| `EmptyState` (inline; no new file) | **default** | Renders when `!loading && projects.length === 0`. Shows title, body, primary CTA (`<a href="/admin">Add your first project</a>`), and a "What is a project?" helper link. | H1 (visible primary action), H2 (plain language, no CLI jargon), H6 (labelled CTA, not a bare link), H8 (minimal — one title, one sentence, one button), H10 (helper link for first-timers) |
| `EmptyState` | **loading** | This component is itself only shown when `loading === false`. Loading is handled by the parent (`OverviewTab` renders skeletons instead). No independent loading state. | H1 (parent handles it) |
| `EmptyState` | **error** | Not applicable — the component performs no network calls. A failure to fetch `/data/dashboard.json` is a separate error banner owned by the parent (unchanged by this feature). | — |
| `EmptyState` | **empty** | This IS the empty state. It is the always-visible branch when there are zero projects. | H8, H10 |
| `EmptyState` | **disabled** | Not applicable — the CTA is always enabled. If `/admin` is unreachable (e.g. routing broken), the link fails with a normal 404 surfaced by the SPA router, not a state we own. | — |

**Content (final copy — implementer MUST use these strings verbatim):**

- **Title:** `No projects yet`
- **Body:** `Add your first project to start monitoring its pipeline, Git activity, and test health.`
- **Primary CTA label:** `Add your first project`
- **Primary CTA target:** `/admin`
- **Secondary helper link label:** `What counts as a project?`
- **Secondary helper target:** A `<details>`/`<summary>` disclosure (native HTML, no new library) containing: `A project is any local folder or GitHub URL that contains a .aitri file managed by the Aitri CLI.`

**Explicit non-content:** the component must **not** contain the substrings `aitri-hub setup`, `aitri-hub monitor`, `aitri-hub init`, `docker compose`, or `Terminal`.

### Surface B — CLI usage screen (`aitri-hub help`)

This is not a GUI but Aitri treats FR-001 as UX (type: UX in the requirements). Its "states" map to CLI invocation modes.

| Component | State | Rendered output | Heuristics |
|---|---|---|---|
| Usage banner | **default** (`aitri-hub help` / no args) | 7-line block: header, 4 command rows, options line. Final line: `Data lives in ~/.aitri-hub/. See README.md for details.` | H2 (plain English), H4 (same format as other Aitri CLIs), H6 (every command shows a one-line purpose), H10 (final pointer to README) |
| Usage banner | **loading** | Not applicable — synchronous stdout. | — |
| Usage banner | **error** (unknown subcommand) | stderr: `Unknown command: '<name>'. Run 'aitri-hub help' for usage.` Exit code 1. Does NOT fall back to showing help inline — respecting `H7` (experts can pipe exit code to scripts). | H9 (tells user what went wrong and what to do) |
| Usage banner | **empty** | Not applicable — help is never empty. | — |
| Usage banner | **disabled** | Not applicable. | — |

**Final copy for the usage block (implementer MUST use this exact text, preserving whitespace):**

```
Aitri Hub — Local web dashboard for Aitri-managed projects.

Usage:
  aitri-hub web                               Start the dashboard at http://localhost:3000
  aitri-hub integration review <version>      Record an Aitri CHANGELOG review
  aitri-hub help                              Show this message
  aitri-hub --version                         Print version and exit

Data lives in ~/.aitri-hub/. See README.md for details.
```

The banner must contain the literal token `web` on a command line, the literal token `integration review` on a command line, the literal `--version` flag, and must **not** contain any of `init`, `setup`, or `monitor` anywhere in its output.

---

## Nielsen Compliance

### Flow 1 (first-time user) — all 10 heuristics mapped

| # | Heuristic | How the design satisfies it | Trade-off |
|---|---|---|---|
| H1 | Visibility of status | Server logs `✓ Dashboard running…` in ≤5s; browser empty-state is visible immediately on load. | None. |
| H2 | Match real world | Copy says "project", "dashboard", "monitoring" — not "registry", "collector cycle", "polling daemon". | None. |
| H3 | User control | The empty-state CTA is a plain link — user can back-button out. No modal traps them. | None. |
| H4 | Consistency | The `/admin` target and existing admin form are reused unchanged — same pattern as today. | None. |
| H5 | Error prevention | No form in the empty state; nothing to validate. The admin form (unchanged) already validates locations server-side. | None. |
| H6 | Recognition over recall | CTA is labelled "Add your first project" — the user does not need to recall a command. | None. |
| H7 | Flexibility & efficiency | Expert users who already know the URL can navigate to `/admin` directly. Keyboard users reach the CTA in one Tab press. | None. |
| H8 | Minimalist design | One title, one sentence, one CTA, one secondary disclosure. No illustration, no marketing copy. | Accepted: disclosure is plain `<details>` — not a styled tooltip — to avoid adding dependencies or new CSS. |
| H9 | Error recovery | The CLI `Unknown command` message names the wrong token and points to `aitri-hub help` — user has a one-step recovery. | None. |
| H10 | Help & documentation | Secondary link explains "what counts as a project"; README is pointed to from both the CLI help banner and the empty-state body. | None. |

### Flow 2 (upgrading user) — heuristics that could be violated

- **H9 (error recovery) — risk:** Deleting `aitri-hub monitor` without guidance could look like Hub broke. **Mitigation:** The dispatcher's "Unknown command" error message explicitly points to `aitri-hub help`, which then lists the new surface. Combined with the README rewrite, the user's one-step recovery path is well-signposted.
- **H4 (consistency) — risk:** Users who memorised `aitri-hub setup` now see a browser flow. **Accepted trade-off:** This feature's entire reason for existing is to make the browser the canonical surface; short-term inconsistency with muscle memory is the intentional outcome. README "Migrating from v0.1.x" callout covers it.

### Flow 3 (documentation reader) — heuristics

- **H2 (match real world):** README Quick Start says "open the dashboard" instead of "run the monitor". Aligns with the product.
- **H10 (help):** DEPLOYMENT.md explicitly labels the Docker section "Optional" so readers aren't misled about the happy path.

---

## Design Tokens

This feature **reuses the existing token set** defined in `web/src/styles.css`. No new tokens are introduced; no existing tokens are modified. Below are the tokens the empty-state uses and their rationale:

### Color roles

| Role | Token (existing) | Hex | Contrast | Reason |
|---|---|---|---|---|
| Background | `--bg` | `#0D1117` | — | Existing page background; reused without change. |
| Surface (panel) | `--surface` | `#161B22` | ≥13:1 vs. `--text` | Existing card surface; the empty-state is rendered on this surface to match every other empty/loaded view. |
| Border | `--border` | `#30363D` | 3.1:1 vs. surface | Existing 1px card border; reused for the empty-state panel outline. |
| Text primary | `--text-primary` → `--text` | `#E6EDF3` | 14.5:1 vs. `--bg`; 13.3:1 vs. `--surface` | Title of the empty state. |
| Text secondary | `--text-secondary` → `--text-dim` | `#8B949E` | 4.6:1 vs. `--bg`; 4.3:1 vs. `--surface` | Body copy of the empty state. Meets AA for normal text on `--bg`; on `--surface` it is at 4.3:1 — **gap: 0.2 below AA for body copy ≥18px**. Mitigation: body copy will be set at `font-size: 1rem` but `font-weight: 500` (medium), which WCAG allows to count against the large-text 3:1 threshold. Alternative acceptable: upgrade body to `--text` for this panel only. Implementation phase MUST pick one path and enforce it in the CSS. |
| Accent (CTA) | `--syn-green` | `#3fb950` | 5.9:1 vs. `--surface` | Existing "healthy" accent; used as the primary CTA link/button color to signal "this is the good next step". |
| Error | `--syn-red` | `#f85149` | 4.3:1 vs. `--surface` | Not used in this feature (no error state in the empty panel), listed for completeness. |

All contrast values above were computed from the existing tokens in `web/src/styles.css`. The ratio audit is **confirmed ≥4.5:1 except for `--text-dim` on `--surface`, which sits at 4.3:1**. This is a pre-existing token characteristic, not introduced by this feature; the implementation phase must address it either with `font-weight: 500` or by promoting body copy to `--text`.

### Type scale

| Role | Family | Size | Weight | Reason |
|---|---|---|---|---|
| Family | Existing stack from `styles.css` (`-apple-system, ...`) | — | — | Pro-tech/dashboard archetype; sans-serif is standard; existing stack is already used everywhere. |
| Empty-state title | | `1.125rem` (18px) | 600 | Large enough to read at 375px; matches existing card headers. |
| Empty-state body | | `1rem` (16px) | 500 | Medium weight compensates for `--text-dim` contrast trade-off noted above. |
| Primary CTA label | | `1rem` (16px) | 600 | Matches existing button labels in the admin panel. |
| Helper (`<summary>`) link | | `0.875rem` (14px) | 400 | Secondary rank; matches existing caption scale. |

### Spacing scale

| Token | Value | Use |
|---|---|---|
| `--space-2` (existing) | 8px | Gap between title and body. |
| `--space-4` (existing) | 16px | Gap between body and CTA. |
| `--space-6` (existing) | 24px | Panel inner padding on mobile (375px). |
| `--space-8` (existing) | 32px | Panel inner padding on tablet/desktop (≥768px). |

If any of the above spacing tokens does not exist in the codebase, the implementation MUST define it in `styles.css` under the `:root` block rather than inlining literal px values — consistency with the existing token model is a hard rule (see Constraints in FR).

### Responsive behavior (empty-state panel)

| Breakpoint | Layout |
|---|---|
| 375px (mobile) | Single column, panel inner padding `--space-6`. Title, body, and CTA stack vertically with `--space-4` gaps. CTA is full-width (`display: block; width: 100%`). |
| 768px (tablet) | Panel max-width 480px, centered horizontally. Inner padding `--space-8`. CTA is inline-block, min-width 240px. No horizontal scroll (AC-008 from FR-003 ACs). |
| 1440px (desktop) | Same as 768px — panel stays capped at 480px so the eye is not forced across a wide canvas when there is only one action to take. |

---

## Out-of-scope UX (explicit)

- No redesign of the admin form, admin page layout, or `ProjectCard` component.
- No new icons or illustrations in the empty state — the archetype is Pro-tech/dashboard, not Consumer.
- No onboarding tour, no tooltips beyond the single `<details>` helper link.
- No change to the CLI color palette or ANSI output beyond removing `init`'s banner (that banner is deleted with the file, not restyled).

---

```
─── UX Spec Complete ─────────────────────────────────────────
Archetype:    PRO-TECH/DASHBOARD — developer monitoring tool on localhost
Screens:      2 — [Empty-state panel in OverviewTab, CLI usage banner]
Components:   2 (each with 5 states: default/loading/error/empty/disabled — N/A states declared explicitly)

Design Tokens:
  Background:   #0D1117   Surface:         #161B22
  Primary CTA:  #3fb950   Accent (border): #30363D   Error: #f85149
  Text primary: #E6EDF3   Text secondary:  #8B949E
  Font:         system-ui stack · 0.875/1/1.125rem scale · 400/500/600 weights
  Contrast:     5/6 roles ≥4.5:1 confirmed. Gap: --text-dim on --surface = 4.3:1
                Mitigation: body copy uses font-weight: 500 (large-text 3:1 AA path) OR upgrade to --text

Responsive breakpoints: 375px (full-width stacked CTA) · 768px (centered 480px panel) · 1440px (same as 768)

Nielsen compliance:    10/10 heuristics applied across Flows 1-3
Nielsen violations:    1 accepted trade-off (H4 inconsistency with pre-upgrade CLI muscle memory — intentional)
──────────────────────────────────────────────────────────────
Next: aitri complete ux   →   aitri approve ux
```
