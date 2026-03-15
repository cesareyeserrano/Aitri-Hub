# Aitri Hub — System Architecture

## Executive Summary

Aitri Hub is a local-only, read-only monitoring tool with two surfaces: a CLI terminal dashboard
and a React web dashboard served via Docker. It has no persistent backend server — only the CLI
collector process runs on demand, writing aggregated state to a single JSON file that both surfaces
consume.

**Technology decisions (justified):**

| Layer              | Technology                          | Version  | Reason                                                              |
|--------------------|-------------------------------------|----------|---------------------------------------------------------------------|
| CLI runtime        | Node.js (ESM, zero npm deps)        | ≥18.0.0  | Matches Aitri's zero-dependency design; built-in fs/child_process/http sufficient |
| Web frontend       | React                               | 18.3.x   | Required by technology_preferences; ecosystem fit for dashboard cards |
| Web bundler        | Vite                                | 5.x      | Fast dev build, minimal config, produces optimized static bundle    |
| Web server         | nginx                               | 1.27-alpine | Lightweight static file server in Docker; serves React build + dashboard.json via volume |
| Containerization   | Docker + Docker Compose             | 27.x / 2.x | Single-command start required by FR-006; isolates web environment  |
| Data exchange      | JSON file (`dashboard.json`)        | —        | Filesystem-native; zero IPC complexity; decouples CLI and web       |
| Git integration    | `child_process.execSync`            | built-in | No external git lib needed; `git log` and `git rev-parse` are sufficient |

**Key architectural constraints honored:**
- Zero npm runtime dependencies for CLI (FR-001 constraint, mirrors Aitri philosophy)
- All data under `~/.aitri-hub/` — no writes to project directories
- No cloud, no external APIs, no authentication
- `aitri-hub web` / `docker compose up` starts web dashboard in one command

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  HOST MACHINE                                                                │
│                                                                              │
│  ┌─────────────────────────┐      ┌──────────────────────────────────────┐  │
│  │  CLI PROCESS            │      │  ~/.aitri-hub/                       │  │
│  │  (Node.js, zero deps)   │      │  ├── projects.json  (config)         │  │
│  │                         │      │  ├── dashboard.json (aggregated data) │  │
│  │  bin/aitri-hub.js       │─────▶│  ├── cache/         (remote clones)  │  │
│  │  ├── setup              │ R/W  │  └── logs/          (error log)      │  │
│  │  ├── monitor ──────────────────▶ reads dashboard.json every 5s        │  │
│  │  └── web                │      └──────────────────────────────────────┘  │
│  │                         │                        │                        │
│  │  lib/                   │                        │ volume mount (ro)      │
│  │  ├── collector/         │                        ▼                        │
│  │  │   ├── aitri-reader   │      ┌──────────────────────────────────────┐  │
│  │  │   ├── git-reader     │      │  DOCKER CONTAINER (aitri-hub-web)    │  │
│  │  │   └── test-reader    │      │                                      │  │
│  │  ├── alerts/engine      │      │  nginx:1.27-alpine                   │  │
│  │  ├── renderer/cli       │      │  ├── /app/web/  → React static build │  │
│  │  └── store/             │      │  └── /data/     → ~/.aitri-hub/ (ro) │  │
│  │      ├── projects       │      │                                      │  │
│  │      └── dashboard      │      │  port 3000 → browser                 │  │
│  └─────────────────────────┘      └──────────────────────────────────────┘  │
│                                                  ▲                           │
│                                                  │                           │
│  ┌───────────────────────────────────────────────┘                           │
│  │  PROJECT DIRECTORIES (read-only, not modified)                           │
│  │  /path/to/project-1/                                                     │
│  │  ├── .aitri           ← read by aitri-reader                             │
│  │  └── spec/04_TEST_RESULTS.json  ← read by test-reader                   │
│  │  /path/to/project-2/  ...                                                │
└──────────────────────────────────────────────────────────────────────────────┘

BROWSER
  └── http://localhost:3000
       ├── GET /           → React SPA (index.html)
       └── GET /data/dashboard.json  → nginx serves mounted file (every 5s poll)
```

### Component Responsibilities

| Component                   | Responsibility                                                               |
|-----------------------------|------------------------------------------------------------------------------|
| `bin/aitri-hub.js`          | CLI entry point; routes subcommands (setup, monitor, web)                   |
| `lib/commands/setup.js`     | Interactive TTY interview; validates paths; writes projects.json            |
| `lib/commands/monitor.js`   | Collection loop (5s interval); writes dashboard.json; renders CLI table     |
| `lib/commands/web.js`       | Validates Docker availability; runs `docker compose up`                     |
| `lib/collector/index.js`    | Orchestrates parallel collection for all registered projects                |
| `lib/collector/aitri-reader.js` | Reads + parses `.aitri` JSON; extracts pipeline state and drift flags   |
| `lib/collector/git-reader.js`   | Executes `git log`, `git rev-parse` via child_process; returns gitMeta  |
| `lib/collector/test-reader.js`  | Reads `spec/04_TEST_RESULTS.json`; returns testSummary or null          |
| `lib/alerts/engine.js`      | Pure function: evaluates alert rules against collected ProjectData          |
| `lib/renderer/cli.js`       | Pure function: renders dashboard table string from DashboardData            |
| `lib/store/projects.js`     | Read/write `~/.aitri-hub/projects.json` with atomic write                  |
| `lib/store/dashboard.js`    | Atomic write of `~/.aitri-hub/dashboard.json`                              |
| `nginx` (Docker)            | Serves React static build + dashboard.json file via read-only volume mount  |
| React SPA                   | Polls `/data/dashboard.json` every 5s; renders project cards               |

---

## Contrato de integración con Aitri

**IMPORTANTE:** Aitri Hub lee datos de proyectos directamente desde el filesystem de cada proyecto.
El schema canónico de `.aitri` (campos, tipos, defaults, cómo calcular drift) está documentado en:

```
<aitri-install>/docs/HUB_INTEGRATION.md
```

O en el repositorio de Aitri: `docs/HUB_INTEGRATION.md`

**Regla:** Antes de modificar cualquier reader (`aitri-reader.js`, `test-reader.js`, `compliance-reader.js`) o cualquier alert rule que dependa de datos de `.aitri`, consultar ese documento primero.
Si el schema de Aitri cambió pero `HUB_INTEGRATION.md` no fue actualizado, reportar el gap como bug en Aitri antes de asumir el nuevo schema.

El contrato especifica:
- Schema completo de `.aitri` con tipos y defaults para backward compat
- Cómo detectar drift (requiere calcular sha256 de artifacts — no hay campo `hasDrift` en `.aitri`)
- Cómo resolver la ruta de artifacts según `artifactsDir` (`"spec"` vs `""`)
- Schema de `~/.aitri-hub/projects.json` (campos escritos por Aitri al registrar proyectos)

---

## Data Model

### `~/.aitri-hub/projects.json`

Written by `setup`, read by `monitor` and `web`.

```json
{
  "version": "1",
  "defaultInterface": "cli",
  "projects": [
    {
      "id": "a3f8c1d2",
      "name": "finance-app",
      "location": "/home/user/projects/finance",
      "type": "local",
      "addedAt": "2026-03-13T10:00:00Z"
    },
    {
      "id": "b9e4f7a1",
      "name": "ecommerce",
      "location": "https://github.com/team/ecommerce",
      "type": "remote",
      "addedAt": "2026-03-13T10:01:00Z"
    }
  ]
}
```

**Field constraints:**
- `id`: 8-char hex string (first 8 chars of SHA-256 of `location`)
- `name`: string, max 40 chars, no path separators
- `location`: absolute filesystem path (type=local) or https URL (type=remote)
- `type`: enum `"local" | "remote"`
- `version`: schema version; current = `"1"`

---

### `~/.aitri-hub/dashboard.json`

Written atomically by `monitor` after each collection cycle. Read by React via nginx.

```json
{
  "schemaVersion": "1",
  "collectedAt": "2026-03-13T10:30:00Z",
  "projects": [
    {
      "id": "a3f8c1d2",
      "name": "finance-app",
      "location": "/home/user/projects/finance",
      "type": "local",
      "status": "healthy",
      "aitriState": {
        "currentPhase": 4,
        "approvedPhases": [1, 2, 3],
        "completedPhases": [1, 2, 3, 4],
        "verifyPassed": true,
        "verifySummary": {
          "passed": 28,
          "failed": 0,
          "skipped": 2,
          "total": 30
        },
        "hasDrift": false,
        "lastRejection": null
      },
      "gitMeta": {
        "isGitRepo": true,
        "lastCommitAt": "2026-03-13T08:00:00Z",
        "lastCommitAgeHours": 2.5,
        "commitVelocity7d": 23,
        "branch": "main"
      },
      "testSummary": {
        "available": true,
        "passed": 28,
        "failed": 0,
        "skipped": 2,
        "total": 30,
        "frCoverage": [
          { "frId": "FR-001", "status": "covered" }
        ]
      },
      "alerts": [
        { "type": "stale", "message": "No commits in 78h", "severity": "warning" }
      ],
      "collectionError": null
    }
  ]
}
```

**Field constraints:**
- `status`: enum `"healthy" | "warning" | "error" | "unreadable"`
- `aitriState`: null when `.aitri` is missing or malformed
- `gitMeta`: null when project is not a git repository
- `testSummary`: null when `04_TEST_RESULTS.json` is absent
- `collectionError`: string describing read failure, or null
- `alerts[].severity`: enum `"warning" | "error"`
- `alerts[].type`: enum `"stale" | "verify-failed" | "drift" | "tests-failing" | "cache-stale"`

---

### `~/.aitri-hub/cache/<repo-slug>/` (FR-008, remote projects)

Local clone of a remote repository. Managed by `git-reader.js`:
- Created on first monitor run via `git clone <url>`
- Updated via `git pull` on subsequent runs
- `<repo-slug>` = last path segment of URL, sanitized (alphanumeric + dash)

---

## API Design

### Internal JS Module API (CLI — exported function signatures)

#### `lib/collector/index.js`

```js
/**
 * Collect data for all registered projects in parallel.
 * @param {ProjectEntry[]} projects  — from projects.json
 * @returns {Promise<ProjectData[]>} — one entry per project, errors captured in collectionError
 */
export async function collectAll(projects: ProjectEntry[]): Promise<ProjectData[]>

/**
 * Collect data for a single project.
 * Never throws — errors are caught and returned in collectionError field.
 */
export async function collectOne(project: ProjectEntry): Promise<ProjectData>
```

#### `lib/collector/aitri-reader.js`

```js
/**
 * Read and parse .aitri state file.
 * @param {string} projectDir  — absolute path to project root
 * @returns {AitriState | null}  — null if missing or malformed
 */
export function readAitriState(projectDir: string): AitriState | null
```

#### `lib/collector/git-reader.js`

```js
/**
 * Collect git metadata for a project.
 * @param {string} projectDir
 * @param {object} options  — { timeoutMs: 5000 }
 * @returns {GitMeta | null}  — null if not a git repo or git unavailable
 */
export function readGitMeta(projectDir: string, options?: { timeoutMs: number }): GitMeta | null
```

#### `lib/collector/test-reader.js`

```js
/**
 * Read spec/04_TEST_RESULTS.json from a project directory.
 * @param {string} projectDir
 * @returns {TestSummary | null}  — null if file absent
 */
export function readTestSummary(projectDir: string): TestSummary | null
```

#### `lib/alerts/engine.js`

```js
/**
 * Pure function: evaluate alert rules against collected project data.
 * @param {ProjectData} data
 * @returns {Alert[]}
 */
export function evaluateAlerts(data: ProjectData): Alert[]
```

**Alert rules evaluated in order:**
1. `gitMeta.lastCommitAgeHours > 72` → `{ type: "stale", message: "No commits in Xh", severity: "warning" }`
2. `aitriState.verifyPassed === false || aitriState.verifySummary?.failed > 0` → `{ type: "verify-failed", severity: "error" }`
3. `aitriState.hasDrift === true` → `{ type: "drift", message: "Artifact drift detected", severity: "warning" }`
4. `testSummary.failed > 0` → `{ type: "tests-failing", message: "Tests failing (N)", severity: "error" }`

#### `lib/renderer/cli.js`

```js
/**
 * Pure function: render full dashboard as a terminal string.
 * @param {DashboardData} data
 * @param {number} terminalWidth  — process.stdout.columns, default 80
 * @returns {string}  — ANSI-formatted string, clears screen before content
 */
export function renderDashboard(data: DashboardData, terminalWidth?: number): string
```

#### `lib/store/projects.js`

```js
export function readProjects(): ProjectsConfig           // throws if file missing
export function writeProjects(config: ProjectsConfig): void  // atomic write
export function ensureDir(): void                        // creates ~/.aitri-hub/ if absent
```

#### `lib/store/dashboard.js`

```js
/**
 * Atomic write: write to temp file then fs.renameSync to final path.
 * @param {DashboardData} data
 */
export function writeDashboard(data: DashboardData): void
```

---

### HTTP API (nginx — Docker container)

The Docker container serves two resources via nginx:

#### `GET /`
- **Response:** `200 text/html` — React SPA `index.html`
- **Source:** `/app/web/index.html` (static React build inside container)

#### `GET /data/dashboard.json`
- **Response:** `200 application/json` — current `dashboard.json` content
- **Source:** nginx serves `/data/dashboard.json` from read-only volume mount of `~/.aitri-hub/`
- **Error — file missing:** nginx returns `404`; React shows empty state
- **Error — file malformed:** nginx returns raw file; React catches JSON.parse error, shows error banner
- **Cache-Control:** `no-store` (nginx config) — ensures browser always fetches fresh copy

#### nginx configuration (embedded in Docker image):

```nginx
server {
  listen 3000;
  root /app/web;
  index index.html;

  # Serve React SPA
  location / {
    try_files $uri $uri/ /index.html;
    add_header X-Frame-Options "DENY";
    add_header X-Content-Type-Options "nosniff";
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'";
  }

  # Serve dashboard.json from mounted volume
  location /data/ {
    alias /data/;
    add_header Cache-Control "no-store";
    add_header Access-Control-Allow-Origin "http://localhost:3000";
    try_files $uri =404;
  }
}
```

---

## Security Design

### Input Validation

| Input                              | Validation                                                                      |
|------------------------------------|---------------------------------------------------------------------------------|
| Project path (setup)               | `fs.existsSync()` check; must be absolute path; reject if contains `..`        |
| Project name (setup)               | Max 40 chars; strip `<>/\:*?"` characters                                       |
| Remote URL (setup)                 | Must match `^https?://` regex; accepted as-is (no DNS lookup at setup time)    |
| `--depth` flag (if present)        | Enum validation against allowed values                                          |
| dashboard.json (React parse)       | `try/catch` around `JSON.parse`; malformed → error banner, no crash            |

### Path Traversal Prevention

`aitri-reader.js` and `test-reader.js` construct file paths as:
```js
path.join(projectDir, '.aitri')       // never user-controlled sub-path
path.join(projectDir, 'spec', '04_TEST_RESULTS.json')
```
`projectDir` is validated at setup time to be an absolute path with no `..` segments.

### No Authentication (per no_go_zone)

Authentication is explicitly out of scope. The web dashboard is localhost-only. The nginx CSP
header prevents inline script injection from a malicious dashboard.json.

### Docker Security

- nginx container runs as non-root user (`nginx` user, UID 101)
- Volume mount `~/.aitri-hub/` is read-only (`:ro` flag in docker-compose.yml)
- No privileged mode, no host network mode
- Security headers set by nginx: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'self'`

### ANSI Injection (CLI)

Project names sourced from `projects.json` are sanitized before rendering in the terminal:
strip ANSI escape sequences (`/\x1b\[[0-9;]*m/g`) and truncate to 20 chars.

---

## Performance & Scalability

### Collection Parallelism

`collectAll()` runs `collectOne()` for all projects concurrently via `Promise.all`. Each
`collectOne()` call is independent and CPU-bound (file reads + git exec). For 20 projects on
a modern machine, total collection time is bounded by the slowest single project, not the sum.

**Git exec timeout:** `child_process.execSync` called with `{ timeout: 5000 }`. If git hangs
(e.g. remote fetch for a mounted volume), it is killed after 5 seconds and gitMeta returns null.

### Atomic Write

`writeDashboard()` writes to `~/.aitri-hub/.dashboard.json.tmp` then calls `fs.renameSync()` to
`dashboard.json`. On POSIX systems, rename is atomic — no partial file is ever exposed to readers.

### React Polling

React uses `setInterval` (5000ms) to fetch `/data/dashboard.json`. Each fetch replaces state
via `useState` setter, triggering a reconciled re-render (not a full unmount). Components are
keyed by project `id` to preserve DOM nodes across refreshes.

### Size Bounds

| Resource             | Bound                        | Justification                              |
|----------------------|------------------------------|--------------------------------------------|
| projects.json        | ≤100 entries                 | Enforced at setup (warn if >50)            |
| dashboard.json       | ≤20 active projects          | ~2KB per project → ≤40KB total             |
| Remote cache         | One clone per remote project | `git pull` only; no re-clone if exists     |
| CLI render cycle     | ≤2s for 20 projects          | Parallel collection + sync render          |
| React page load      | ≤2s                          | Static bundle served by nginx from memory  |

### Caching

No in-memory caching in the CLI collector — every 5-second cycle reads fresh from disk. This
ensures the dashboard always reflects current state at the cost of ≤20 file reads per cycle
(negligible on local NVMe/SSD).

---

## Deployment Architecture

### Installation (CLI)

```
npm install -g aitri-hub
# OR
npx aitri-hub setup
```

Package ships: `bin/`, `lib/`, `web/` (pre-built React bundle), `docker-compose.yml`, `nginx.conf`.

### Directory Layout (runtime)

```
~/.aitri-hub/
├── projects.json          ← user config
├── dashboard.json         ← live aggregated data
├── cache/
│   └── <repo-slug>/       ← remote project clones
└── logs/
    └── aitri-hub.log      ← error log (collector failures)
```

### Web Mode — Docker Compose

```yaml
# docker-compose.yml (shipped with aitri-hub package)
services:
  web:
    image: aitri-hub-web:latest
    ports:
      - "3000:3000"
    volumes:
      - "${HOME}/.aitri-hub:/data:ro"
    restart: unless-stopped
```

The `aitri-hub-web` image is built from:
```dockerfile
FROM nginx:1.27-alpine
COPY web/ /app/web/
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 3000
```

**`aitri-hub web` command** (lib/commands/web.js):
1. Check `docker info` exit code — if non-zero, print error and exit
2. Locate `docker-compose.yml` in npm global install dir
3. Run `docker compose up -d`
4. Poll `http://localhost:3000` until HTTP 200 or 30s timeout
5. Print `✓ Dashboard running at http://localhost:3000`

### Environments

| Environment  | How to run                    | Data source                     |
|--------------|-------------------------------|---------------------------------|
| CLI monitor  | `aitri-hub monitor`           | Reads project dirs directly     |
| Web (local)  | `aitri-hub web`               | Reads `~/.aitri-hub/dashboard.json` via Docker volume |
| Web (team)   | Deploy Docker image to server | Mount shared `~/.aitri-hub/` volume; team accesses via server IP |

---

## Risk Analysis

### ADRs

---

**ADR-01: Web serving strategy — data bridge between CLI-written file and React frontend**

Context: React runs inside Docker; dashboard.json lives on the host at ~/.aitri-hub/. We need a
way for the browser to read it.

Option A: **nginx volume mount + static file serving** — Mount ~/.aitri-hub/ into Docker as
read-only volume; nginx serves the directory. React fetches `/data/dashboard.json` directly.
Trade-offs: simple, no backend process; requires nginx to be configured correctly for JSON MIME
type; no transform layer.

Option B: **Node.js HTTP data server inside Docker** — Small Node.js server (built-in http module)
reads dashboard.json from volume and exposes it at /api/dashboard. Requires two processes in
container or multi-stage Docker setup.
Trade-offs: more control (can add validation, error wrapping); adds complexity and a second process.

Decision: **Option A** — nginx volume mount. Dashboard.json is already valid JSON written by the
CLI; no transform needed. nginx is well-tested for static serving. Zero extra processes.

Consequences: React must handle 404 (file not yet written) and malformed JSON gracefully.

---

**ADR-02: CLI refresh mechanism**

Context: CLI monitor must re-render every 5 seconds without user interaction.

Option A: **`setInterval` + `process.stdout.write('\x1b[2J\x1b[H' + rendered)`** — Clear screen
and redraw using ANSI escape codes. Simple, no external lib.
Trade-offs: flicker on slow terminals; cursor must be hidden/restored on SIGINT.

Option B: **readline/curses-style partial update** — Only update changed rows. Requires tracking
previous state and computing diffs.
Trade-offs: no flicker; significantly more complex to implement correctly; out of scope for v1.

Decision: **Option A** — full clear + redraw with ANSI. Acceptable for a developer-focused tool
where 5-second refreshes are infrequent enough that flicker is not disruptive.

Consequences: Must install SIGINT handler to restore cursor and terminal state before exit.

---

**ADR-03: Data exchange format — React frontend data source**

Context: React needs aggregated project data that is updated every 5 seconds.

Option A: **JSON file polling** — CLI writes `dashboard.json`; React fetches it via HTTP every 5s.
Trade-offs: simple; slight staleness (~5s); no persistent connection; works even if CLI is stopped
(last known data remains readable).

Option B: **WebSocket or Server-Sent Events** — CLI pushes updates to a persistent connection.
Trade-offs: real-time updates; requires a running server process; significantly more complex; no
clear benefit over 5-second polling for this use case.

Decision: **Option A** — polling. 5-second staleness is acceptable for a development monitoring
tool. No persistent server required.

Consequences: React must handle the case where the file has not yet been written (404) or the CLI
collector is not running (stale data with old `collectedAt` timestamp).

---

**ADR-04: React build delivery inside Docker**

Context: React SPA must be served from Docker. We need to decide how the build gets into the image.

Option A: **Pre-built bundle shipped with npm package** — `npm pack` includes `web/` directory
(built React bundle). Docker image copies it at `docker build` time. No build step at runtime.
Trade-offs: larger npm package; bundle built at publish time; no node_modules at runtime.

Option B: **Build React inside Docker at image build time** — Dockerfile runs `npm ci && npm run build`.
Trade-offs: reproducible; but requires npm in image and adds 2-3 minutes to `docker build`.

Decision: **Option A** — pre-built bundle. Developer runs `aitri-hub web` and expects instant
start. A 2-minute Docker build is incompatible with FR-006's 30-second startup requirement.

Consequences: React bundle is static; updates require a new npm package version.

---

**ADR-05: Remote project collection (FR-008)**

Context: Remote GitHub/GitLab projects must be readable without asking the user to clone them.

Option A: **git clone to ~/.aitri-hub/cache/** — First run clones; subsequent runs `git pull`.
Trade-offs: works with any git-accessible URL; adds disk usage; git credentials must be pre-configured.

Option B: **GitHub API** — Fetch .aitri and artifact files via GitHub REST API.
Trade-offs: API key required; rate limits (60 req/hour unauthenticated); breaks no_go_zone
constraint (no external API calls to persist data).

Decision: **Option A** — git clone/pull. Option B violates no_go_zone. git credentials are
expected to be pre-configured (SSH key or HTTPS token) by the developer — standard practice.

Consequences: Remote projects require network access and pre-configured git credentials. Collection
failure (network error, auth failure) is caught and shown as "Cache stale" in UI.

---

### Failure Blast Radius

**Component: dashboard.json write**
- Blast radius: CLI monitor renders correctly but web dashboard shows stale or missing data
- User impact: Web cards show last-known data with old `collectedAt`; or empty state on first run
- Recovery: CLI retries write on next 5-second cycle automatically; transient disk errors self-heal

**Component: git executable**
- Blast radius: gitMeta returns null for all projects; stale-commit alerts not generated
- User impact: "Last commit: N/A" in all rows; no stale alerts fired
- Recovery: User installs/fixes git; next collection cycle picks up correctly

**Component: Docker daemon**
- Blast radius: `aitri-hub web` fails; web dashboard unavailable
- User impact: Error message: "Docker not found. Install Docker to use web mode."
- Recovery: User installs Docker or uses CLI monitor instead; no data loss

**Component: Single project .aitri malformed**
- Blast radius: That project shows status "unreadable"; no other projects affected
- User impact: One card/row shows "UNREADABLE — .aitri not found or malformed"
- Recovery: User fixes the project's .aitri file; next collection cycle reads it correctly

---

### Top Risks

| Risk                                      | Probability | Impact  | Mitigation                                               |
|-------------------------------------------|-------------|---------|----------------------------------------------------------|
| git exec hangs on mounted/network volumes | Medium      | High    | 5-second timeout on all execSync calls; null on timeout  |
| docker-compose.yml not found at runtime   | Low         | High    | Ship path resolution relative to npm global install dir  |
| dashboard.json stale when CLI not running | High        | Low     | Show `collectedAt` timestamp in UI so staleness is visible |
| Remote project auth failure               | Medium      | Medium  | Catch git pull errors; show "Cache stale (auth error)"   |

---

### Traceability Checklist

- [x] FR-001 (setup) — `lib/commands/setup.js`, `lib/store/projects.js`, Data Model: projects.json
- [x] FR-002 (aitri state) — `lib/collector/aitri-reader.js`, dashboard.json schema
- [x] FR-003 (git metadata) — `lib/collector/git-reader.js`, ADR-05
- [x] FR-004 (test results) — `lib/collector/test-reader.js`, dashboard.json schema
- [x] FR-005 (CLI dashboard) — `lib/commands/monitor.js`, `lib/renderer/cli.js`, ADR-02
- [x] FR-006 (web dashboard) — Docker Compose, nginx config, ADR-01, ADR-04, Deployment section
- [x] FR-007 (alerts engine) — `lib/alerts/engine.js`, alert rules documented in API Design
- [x] FR-008 (remote projects) — `lib/collector/git-reader.js` (clone/pull), ADR-05
- [x] FR-009 (dashboard.json) — `lib/store/dashboard.js`, atomic write, Data Model
- [x] NFR-001 (performance ≤5s) — `collectAll` parallelism, git timeout, Performance section
- [x] NFR-002 (reliability) — per-project error capture in `collectOne`, blast radius docs
- [x] NFR-003 (usability) — setup ≤5 prompts, empty state guidance in UX spec
- [x] NFR-004 (portability) — Node.js 18+ cross-platform, Docker for web isolation
- [x] NFR-005 (no data exfiltration) — no external API calls; nginx Access-Control-Allow-Origin localhost only
- [x] Every ADR has ≥2 options evaluated (ADR-01 through ADR-05)
- [x] no_go_zone items NOT present: no cloud sync, no auth, no aitri command execution, no non-Aitri monitoring, no code editing, no mobile native build
- [x] Failure blast radius documented for 4 critical components
