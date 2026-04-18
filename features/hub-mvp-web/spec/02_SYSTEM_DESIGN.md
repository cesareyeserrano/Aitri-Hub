# System Design — hub-mvp-web

## Executive Summary

This feature extends the existing Aitri Hub Node.js web server with three targeted changes: (1) admin API routes added to the existing `http.createServer` in `web.js` for projects.json CRUD, replacing the CLI setup workflow; (2) React SPA refactored to a single-view home with a minimal 2-route URL router, removing all tab navigation; (3) ProjectCard redesigned into 5 always-visible named sections (BLOCKERS, PIPELINE, QUALITY, GIT, VERSION). CLI `setup` and `monitor` commands are replaced with deprecation notices. No new processes, no Docker changes, no new CLI dependencies.

---

## System Architecture

Aitri Hub runs as a single Node.js process (`aitri-hub web`) that:
1. Serves the React SPA and dashboard data over HTTP
2. Runs a collection loop every 5s writing `dashboard.json`
3. **New:** Handles `/api/projects` CRUD routes in the same server

No new processes. No Docker changes. No new runtime dependencies on the CLI side.

```
BROWSER
  └── http://localhost:3000
       ├── GET /              → React SPA (index.html) — HomeView or AdminPanel (client routing)
       ├── GET /data/dashboard.json → collection output (read-only)
       ├── GET  /api/projects → read projects.json
       ├── POST /api/projects → add project entry
       ├── PUT  /api/projects/:id → edit project entry
       └── DELETE /api/projects/:id → remove project entry

NODE.JS PROCESS (aitri-hub web)
  ├── http.createServer — port 3000, bound 127.0.0.1
  │   ├── /health           → 200 ok
  │   ├── /data/*           → serve ~/.aitri-hub/ (existing)
  │   ├── /api/projects*    → NEW: projects.json CRUD
  │   └── /*                → serve docker/web-dist/ SPA (existing)
  └── setInterval(collectAll, 5000) → writes dashboard.json (existing)

~/.aitri-hub/
  ├── projects.json   ← read + written by admin API
  └── dashboard.json  ← written by collector, read by browser
```

---

## ADR-01 — Admin API integration point

**Decision:** Where does the admin API server live?

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A — Add routes to existing server** ✅ | `/api/projects*` handled inside the current `http.createServer` in `web.js` | Zero new processes; shares port 3000; no CORS; no process management | `web.js` grows in size |
| B — Separate Node.js process on port 3001 | Spawn a second `http.createServer` on 3001 | Clean separation | CORS headers needed; two processes to manage; React must hardcode a second port |

**Chosen: Option A.** The server is already structured as a conditional router (`if pathname === '/health'`, etc.). Adding `/api/projects` is a natural extension. Single port, single process, no CORS.

---

## ADR-02 — Client-side routing for `/admin`

**Decision:** How does the React app route between `/` (home) and `/admin`?

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A — Minimal URL router (custom)** ✅ | `useState` on `window.location.pathname` + `popstate` listener; `<a href="/admin">` links use `history.pushState` | Zero new npm dependency; ~15 lines; sufficient for 2 routes | No dynamic params, no nested routes — acceptable for this scope |
| B — React Router v6 | Add `react-router-dom` (~50KB) | Full-featured, declarative | Adds a dependency for 2 static routes; overkill |

**Chosen: Option A.** Two static routes (`/` and `/admin`) do not justify a routing library. The existing SPA fallback in `web.js` (`try_files` equivalent) already serves `index.html` for all paths.

---

## ADR-03 — Path validation for local project paths

**Decision:** How to prevent directory traversal in admin API?

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A — Resolve + existence check** ✅ | `path.resolve(input)` then verify with `fs.existsSync` for local type; reject if input contains `..` before resolving | Defense-in-depth; catches encoded traversal | Slightly more code |
| B — Blocklist `..` in raw string | `input.includes('..')` → reject | Simple | Bypassable with URL encoding or symlinks |

**Chosen: Option A.** Reject if raw input contains `..` AND verify resolved path exists. Both checks, not one.

---

## ADR-04 — projects.json write strategy

**Decision:** How to write projects.json without corruption?

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A — Atomic temp+rename** ✅ | Write to `.projects.json.tmp`, then `fs.renameSync` to `projects.json` | Crash-safe; already the pattern for `dashboard.json` | Minimal overhead |
| B — Direct overwrite | `fs.writeFileSync('projects.json', ...)` | Simpler | Corrupts file if process dies mid-write |

**Chosen: Option A.** Same pattern already used by `store/dashboard.js`. Consistent and safe.

---

## Component Map

### Files modified

| File | Change |
|---|---|
| `lib/commands/web.js` | Add `/api/projects` route handler block before the static file fallback |
| `lib/commands/setup.js` | Replace interactive flow with single `console.log` deprecation notice + `process.exit(0)` |
| `lib/commands/monitor.js` | Replace render loop with single `console.log` deprecation notice + `process.exit(0)` |
| `lib/collector/git-reader.js` | Add `unpushedCommits` and `uncommittedFiles` fields to returned object |
| `lib/collector/index.js` | Add `appVersion` field via new `app-version-reader.js` to each project entry |
| `web/src/App.jsx` | Remove tab state + tab nav; add 2-route URL router; render `HomeView` or `AdminPanel` |
| `web/src/components/Header.jsx` | Remove `theme` state, `toggleTheme`, first `useEffect`, theme toggle button; remove `useCallback` import |
| `web/src/components/ProjectCard.jsx` | Redesign into 5 named sections: BLOCKERS, PIPELINE, QUALITY, GIT, VERSION |
| `web/src/components/OverviewTab.jsx` | Rename to `HomeView.jsx`; remove phase distribution panel and health score list panel |
| `web/src/styles.css` | Remove `[data-theme="light"]` block; change `:root,[data-theme="dark"]` to `:root`; add card section styles |

### Files created

| File | Responsibility |
|---|---|
| `web/src/components/AdminPanel.jsx` | Root admin component — fetches project list, owns add/edit/remove state |
| `web/src/components/AdminProjectList.jsx` | Renders project rows; emits edit/remove events to parent |
| `web/src/components/AdminAddForm.jsx` | Add project form; inline validation; emits submit/cancel to parent |
| `web/src/components/RemoveConfirmDialog.jsx` | Modal confirmation for remove; renders as portal or fixed overlay |
| `web/src/lib/adminApi.js` | Fetch wrappers: `getProjects()`, `addProject(p)`, `updateProject(id,p)`, `removeProject(id)` |
| `web/src/components/HomeView.jsx` | Renamed from OverviewTab; clean export |
| `lib/collector/app-version-reader.js` | Reads project's own version from `package.json` or `VERSION` file; returns `string \| null` |

### Files removed (dead code from removed tabs)

`AlertsTab.jsx`, `VelocityTab.jsx`, `ActivityTab.jsx`, `FRCoverageTab.jsx`, `GraphTab.jsx`, `ProjectsTable.jsx`, `GraphLegend.jsx`, `LastSessionRow.jsx`

---

## API Contract — `/api/projects`

All responses: `Content-Type: application/json`. Server bound to `127.0.0.1:3000`.

### GET /api/projects
```
Response 200:
{ "projects": [ { "id": "a1b2c3d4", "name": "my-app", "type": "local", "location": "/Users/jane/my-app" }, ... ] }
Response 200 (no file): { "projects": [] }
```

### POST /api/projects
```
Request body: { "name": "my-app", "type": "local"|"remote", "location": "/abs/path" | "https://..." }
Response 201: { "project": { "id": "a1b2c3d4", "name": "my-app", "type": "local", "location": "..." } }
Response 400: { "error": "name_required" | "name_duplicate" | "location_required" | "path_traversal" | "path_not_found" }
```

### PUT /api/projects/:id
```
Request body: { "name"?: "...", "location"?: "..." }  (at least one field required)
Response 200: { "project": { ...updated entry } }
Response 400: { "error": "name_required" | "path_traversal" | "path_not_found" }
Response 404: { "error": "not_found" }
```

### DELETE /api/projects/:id
```
Response 204: (no body)
Response 404: { "error": "not_found" }
```

**Logging:** Every request logged to stdout: `[ISO8601] METHOD /path STATUS`

---

## Git Reader — New Fields

Added to the object returned by `readGitMeta(projectDir)`:

| Field | Type | Source command | Value when unavailable |
|---|---|---|---|
| `unpushedCommits` | `number \| null` | `git rev-list @{u}..HEAD --count` | `null` (no tracking branch or not a repo) |
| `uncommittedFiles` | `number \| null` | `git status --porcelain \| wc -l` equivalent | `null` (not a repo) |

Both use the existing `gitExec()` helper. `unpushedCommits` returns `null` (not `0`) when there is no upstream tracking branch — the card does not render the row in that case.

---

## ProjectCard — Section Rendering Logic

```
HEADER          always
BLOCKERS        only if: drift || verifyFailed || recentRejection || criticalBugs > 0 || blockingAlerts > 0
PIPELINE        always (except unreadable)
QUALITY         always (except unreadable)  — rows omitted individually when data absent
GIT             always (except unreadable)  — unpushed/uncommitted rows omitted when 0 or null
VERSION         only if aitriState.aitriVersion is present
```

**BLOCKERS content sources:**
- `drift`: `aitriState.driftPhases?.length > 0` OR hash mismatch detected
- `verifyFailed`: `aitriState.verifyPassed === false && aitriState.verifySummary != null`
- `recentRejection`: most recent entry in `aitriState.rejections` (any phase)
- `criticalBugs`: `bugsSummary.open > 0 && (bugsSummary.critical > 0 || bugsSummary.high > 0)`
- `blockingAlerts`: `alerts.filter(a => a.severity === 'blocking').length > 0`

**PIPELINE bar color logic:**
```js
const approved = aitriState.approvedPhases?.length ?? 0;
const color = approved === 5 ? 'var(--syn-green)'
            : approved >= 3  ? 'var(--syn-yellow)'
            : 'var(--syn-red)';
```

**QUALITY — test bar color:**
```js
const pct = ts.passed / ts.total * 100;
const color = pct === 100 ? 'var(--syn-green)'
            : pct >= 80   ? 'var(--syn-teal)'
            : pct >= 60   ? 'var(--syn-yellow)'
            : 'var(--syn-red)';
```

---

## URL Router Implementation

Minimal router in `App.jsx` — no new dependency:

```jsx
function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);
  function navigate(to) {
    window.history.pushState({}, '', to);
    setPath(to);
  }
  return { path, navigate };
}
```

`App.jsx` renders `<HomeView>` when `path === '/'`, `<AdminPanel>` when `path === '/admin'`.

---

## Failure Modes

| Component | Failure | Blast radius | Recovery |
|---|---|---|---|
| Admin API — projects.json write | Disk full / permission error | Write fails; existing file unchanged (atomic) | API returns 500; banner shown in UI; user retries |
| Admin API — projects.json read | File missing | Returns `{ projects: [] }` — empty list | User can add projects normally |
| Git reader — unpushed check | No tracking branch | `unpushedCommits = null` — row not rendered | Silent; no crash |
| Git reader — uncommitted check | Not a git repo | `uncommittedFiles = null` — row not rendered | Silent; no crash |
| URL router — direct navigation to `/admin` | Server must serve `index.html` for `/admin` | SPA fallback already in `web.js` catches all non-asset paths | No issue |
| Collector — one project unreadable | Single project fails | Other projects unaffected; unreadable project shows error card | NFR-002 already handles this |

---

## FR Traceability

| FR | Addressed by |
|---|---|
| FR-010 Single-view home | `App.jsx` — remove tab nav; render `HomeView` directly |
| FR-011 Card always-visible indicators | `ProjectCard.jsx` redesign — HEADER + PIPELINE + QUALITY sections |
| FR-012 Card detail (amended: flat) | `ProjectCard.jsx` — GIT + VERSION sections always visible |
| FR-013 Admin panel listing | `AdminPanel.jsx` + GET /api/projects |
| FR-014 Add project | `AdminAddForm.jsx` + POST /api/projects |
| FR-015 Edit/remove project | `AdminProjectList.jsx` + `RemoveConfirmDialog.jsx` + PUT/DELETE /api/projects/:id |
| FR-016 Admin API | `web.js` — new `/api/projects*` route block |
| FR-017 Setup deprecation | `lib/commands/setup.js` — replace body with notice + exit |
| FR-018 Monitor deprecation | `lib/commands/monitor.js` — replace body with notice + exit |
| FR-019 Dark-mode only | `Header.jsx` — remove toggle; `styles.css` — remove light block |
| NFR-010 Path traversal | POST/PUT handlers — reject `..` in raw input + `fs.existsSync` check |
| NFR-011 API observability | Request logger in `/api/projects` handler block |
| NFR-012 Admin 768px | `styles.css` — admin responsive rules |

---

## Data Model

### projects.json (read + written by admin API)
```json
{
  "projects": [
    {
      "id": "a1b2c3d4",
      "name": "my-app",
      "type": "local",
      "location": "/Users/jane/my-app",
      "group": null
    }
  ]
}
```
- `id`: 8-char hex string, generated on add via `PROJECT_ID_LENGTH` constant (already in codebase)
- `type`: `"local"` | `"remote"`
- `location`: absolute filesystem path (local) or HTTPS URL (remote)
- `group`: optional folder label for grouping cards; `null` if not set

### dashboard.json (written by collector, read-only to API)
Unchanged from existing schema. The admin API does not read or write this file.

### Git reader output additions
```js
{
  // existing fields unchanged
  lastCommitAgeHours: number | null,
  branch: string | null,
  commitVelocity7d: number,
  // NEW
  unpushedCommits: number | null,   // null = no tracking branch or not a repo
  uncommittedFiles: number | null,  // null = not a repo
}
```

### App version reader (new: `lib/collector/app-version-reader.js`)

Reads the project's own version — what the team is building.

**Resolution order:**
1. `{projectDir}/package.json` → `.version` field
2. `{projectDir}/VERSION` → trimmed first line
3. Returns `null` if neither exists or both are unreadable

```js
// Returns: string | null  (e.g. "1.2.3", "0.4.0-beta", null)
export function readAppVersion(projectDir) { ... }
```

Added to `collectOne()` in `lib/collector/index.js` as `appVersion`.

**Card header — app version placement:**
```
// project-name              ✖ ERROR     [F]
   v1.2.3
```
App version (`appVersion`) renders on a second line below the project name, in `--text-dim` 11px.
Absent (not rendered) when `appVersion === null`.
Placing it below keeps the name full-width for long project names.

**Card VERSION section:**
```
VERSION
  aitri  v0.1.76 ✓
  ⚠ mismatch — project init'd with v0.1.74   ← only if mismatch
```
`app` row removed from VERSION — version is now part of project identity in the header.

---

## API Design

See **API Contract** section above for full endpoint specs.

**Admin API request flow:**
```
Browser → POST /api/projects
  → web.js handler
    → validate: name present, no duplicate, location present, no '..' in path
    → if type=local: fs.existsSync(path.resolve(location))
    → read projects.json (or default [])
    → append new entry with generated id
    → atomic write: .projects.json.tmp → projects.json
    → log: [ISO8601] POST /api/projects 201
    → respond 201 with created entry
```

**Error response schema** (consistent across all endpoints):
```json
{ "error": "error_code", "message": "human-readable description" }
```

Error codes: `name_required`, `name_duplicate`, `location_required`, `path_traversal`, `path_not_found`, `not_found`, `internal_error`

---

## Security Design

| Threat | Mitigation |
|---|---|
| Path traversal (e.g. `../../etc/passwd`) | Reject raw input containing `..`; additionally verify `fs.existsSync` on resolved path for local type |
| Unauthorized external access | Server binds to `127.0.0.1` only — OS-level; external hosts cannot reach the API |
| JSON injection via project name/path | Values stored as JSON strings, never executed — no eval, no shell expansion |
| Concurrent writes corrupting projects.json | Atomic temp+rename write — last write wins; no concurrent write lock needed at this scale |
| XSS via project name in React | React escapes all string interpolation by default; no `dangerouslySetInnerHTML` used |

---

## Performance & Scalability

| Concern | Approach |
|---|---|
| Admin API latency | projects.json is a small file (≤50 entries typical); synchronous read+write acceptable; no DB needed |
| Card render for 20 projects | Existing 5s poll unchanged; card redesign adds no async operations; staggered CSS animation (50ms/card) keeps perceived load smooth |
| Git reader new commands | `git rev-list --count` and `git status --porcelain` are fast local operations (≤50ms each); within existing `GIT_TIMEOUT_MS` budget |
| Collection cycle budget | Two new git commands add ≤100ms per project; 20 projects = ≤2s added overhead; stays within NFR-001 (5s total) |

---

## Deployment Architecture

No changes to deployment. The existing `aitri-hub web` command starts the Node.js server. Admin API routes are added to the same server process on the same port. Docker/nginx remain as an alternative deployment option (unchanged).

```
aitri-hub web
  └── Node.js http.createServer :3000 (127.0.0.1)
       ├── /health        (existing)
       ├── /data/*        (existing)
       ├── /api/projects* (NEW — admin CRUD)
       └── /*             (existing — SPA + static)
```

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `git rev-list @{u}..HEAD` fails when no upstream | High (local branches often have no upstream) | Low — returns null, row not rendered | Handle non-zero exit code → return null |
| FR-012 conflict (approved flat vs spec collapsible) | Certain | Medium | FR-012 AC is superseded by UX spec flat design; Phase 3 TCs must test flat layout only |
| Admin panel breaks if web server not running | Certain (expected) | Low — expected behavior | Error banner: "is aitri-hub web running?" |
| React SPA served for `/admin` 404 | Possible on cold start | Low | SPA fallback already in web.js catches all unknown paths → index.html |

---

## Technical Risk Flags

- **FR-012 amendment required:** Phase 1 FR-012 specifies a collapsible section. The UX spec (approved) supersedes this with a flat always-visible layout. Phase 3 test cases must be written against the flat layout. FR-012 acceptance criteria should be treated as amended.
- **`unpushedCommits` null vs 0 distinction:** Implementer must not treat `null` as `0`. `null` means "no tracking branch — cannot determine". `0` means "tracking branch exists, nothing to push." The GIT section row is hidden only when `null`, not when `0`.
- **Removed tab components:** AlertsTab, VelocityTab, ActivityTab, FRCoverageTab, GraphTab, ProjectsTable, GraphLegend, LastSessionRow are dead code after this feature. They can be deleted in Phase 4 to avoid confusion, but their removal is not functional — no existing tests reference them as active routes.
