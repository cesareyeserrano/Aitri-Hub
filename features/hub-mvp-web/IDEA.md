## Feature
Rebuild Aitri Hub as a full-web MVP: single-page home with project cards, web-based admin panel for project configuration, and removal of all CLI-only surfaces.

## Problem / Why
The current Hub is a proof of concept with too many surfaces and scattered concerns:
1. **7-tab UI** with Alerts, Coverage, Velocity, Activity, All Projects, and Graph tabs adds cognitive overhead and is hard to scale. Most of the value is in the project cards on the Overview tab.
2. **Project registration is CLI-only** (`aitri-hub setup`). This blocks non-technical users and makes Hub impossible to use without a terminal.
3. **CLI monitor** (`aitri-hub monitor`) is a redundant surface now that the web dashboard exists. Maintaining both adds complexity with no additional value.
4. **Light mode** is unused and untested. It adds dead CSS weight and a UI control that serves no audience.
5. **Project cards** show a lot of data but without a clear hierarchy — the most critical indicators (pipeline health, blocking alerts, test status) do not stand out from lower-priority metadata.

## Target Users
Developers and team leads using Aitri Hub as their primary pipeline monitoring tool. They want one place to see pipeline status at a glance and configure their projects — no terminal required.

## New Behavior

### Home (single view — no tabs)
- Remove all tab navigation. The app renders one view: the project card grid.
- Keep the header (title, status counts, clock, refresh button).
- Keep the stat tiles row (projects, healthy, warning, blocking, pipeline %).
- Keep the triage section (blocking alerts above the grid).
- Keep folder grouping.
- Remove the phase distribution and health score panel rows from the overview (health score moves onto the card).
- Remove light mode toggle from Header and `[data-theme="light"]` block from CSS.

### Project Cards — redesigned indicator hierarchy
Priority 1 (always visible, top of card):
- Project name + status badge (HEALTHY / WARNING / ERROR)
- Pipeline progress bar: `X/5 phases approved`
- Health score grade (A/B/C/D/F with color)

Priority 2 (key metrics, always visible):
- Tests: `passed/total (%)` with progress bar — if available
- Blocking alerts count — red badge, only shown when > 0
- Last commit age (stale indicator if > 72h)

Priority 3 (context, visible but secondary):
- Active branch
- Active features count (if any)
- Last pipeline event + age

Priority 4 (collapsed by default, expandable):
- Compliance badge
- FR requirements summary
- Velocity (commits/7d)
- Bug count
- Time in current phase

### Admin Panel (`/admin` route)
- New web route: `http://localhost:3000/admin`
- Lists all registered projects from `~/.aitri-hub/projects.json`
- Add project: form with name, local path or GitHub/GitLab URL, type (local/remote)
- Edit project: change name, path/URL
- Remove project: with confirmation dialog
- Changes write to `~/.aitri-hub/projects.json` via a local API endpoint served by the Hub web process
- No authentication (localhost-only tool)

### CLI deprecation
- `aitri-hub setup` — prints deprecation notice pointing to `http://localhost:3000/admin`, exits without prompts
- `aitri-hub monitor` — prints deprecation notice pointing to `http://localhost:3000`, exits
- `aitri-hub web` — unchanged; starts the web server (now also serves the admin API)

## Success Criteria
- Given the app loads, then only the home (project card grid) is visible — no tab navigation
- Given a project has blocking alerts, then the alert count is visually prominent on the card (red badge, above secondary metrics)
- Given a user visits `/admin`, then they can add, edit, and remove projects without using a terminal
- Given a user adds a project via the admin panel, then the next collection cycle picks it up and shows it in the dashboard
- Given `aitri-hub setup` is run in a terminal, then a deprecation notice is printed and the process exits immediately (no prompts)
- Given the app loads, then there is no light/dark mode toggle in the header
- Given viewport width ≥768px, then the card grid is readable with no horizontal scroll

## Out of Scope
- Authentication or multi-user access (still localhost-only)
- Removing the `aitri-hub web` binary or Docker setup
- Removing the collector/monitor process — it still runs behind the scenes, just no CLI dashboard surface
- Graph, Coverage, Velocity, Activity tabs as standalone views (data stays on the card)
- Mobile layout (below 768px)
