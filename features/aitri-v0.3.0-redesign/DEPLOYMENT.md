# Deployment — Aitri Hub v0.3.0 Redesign

**Deployment model:** long-running **Node.js process** (`aitri-hub web`) that serves the
Vite-built React SPA from `docker/web-dist/` and reads/writes JSON state under
`~/.aitri-hub/`. Per `02_SYSTEM_DESIGN.md` → *Deployment Architecture*, Docker is
**optional** and no new deployment surface is introduced (installability is deferred to
a separate feature). There is therefore **no new Dockerfile** for this feature — the
redesign is additive to the existing, already-running Hub.

The redesign adds **zero runtime dependencies** to the server (Node built-ins only); the
web bundle is built with Vite at release time. All new persisted state lives under
`~/.aitri-hub/qa/` and is created on first write.

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 (CI tests on 20, 22) | server + build |
| npm | ≥ 9 | dependency install |
| Aitri CLI | rc.6+ on `PATH` | `aitri --version`; the Hub reads project `.aitri` state and shells `aitri status --json` |
| OS | macOS / Linux | loopback-only server; desktop web |

No database, message broker, or external service is required. The Hub binds
**127.0.0.1 only** (loopback) — it is a local, single-user dashboard.

---

## 2. Environment variables

All variables have safe defaults; override only when needed. See `.env.example`.

| Name | Type | Required | Default | Example | Purpose |
|---|---|---|---|---|---|
| `AITRI_HUB_DIR` | path | optional | `~/.aitri-hub` | `/var/lib/aitri-hub` | state / cache / logs / `qa/` root |
| `AITRI_HUB_PORT` | integer | optional | `3000` | `8080` | web dashboard port (loopback) |
| `AITRI_HUB_REFRESH_MS` | integer (ms) | optional | `5000` | `10000` | collector / monitor refresh interval |
| `AITRI_HUB_GIT_TIMEOUT_MS` | integer (ms) | optional | `5000` | `8000` | per-project `git` exec timeout |

State outside the process (12-factor): the Hub never writes to project directories —
all evidence and executions are confined to `${AITRI_HUB_DIR}/qa/`.

---

## 3. Dev setup

```sh
# 1. Install server + build deps
npm ci
npm ci --prefix web

# 2. Run the web app in watch mode (Vite dev server on :5173, proxied to the API)
npm run dev --prefix web        # optional — for UI iteration

# 3. Run the real server (serves the built SPA + API on 127.0.0.1:${AITRI_HUB_PORT})
node bin/aitri-hub.js web
# → open http://localhost:3000
```

### Tests

```sh
# Full redesign suite (node + web) — the manifest test_runner
./tests/run-redesign-tests.sh

# Or piecemeal:
npm test                        # node unit + integration (+ admin e2e)
npm --prefix web test           # web unit (Vitest)
npm run test:e2e                # all Playwright e2e
npm run test:e2e:v030           # redesign e2e only (dev-triage + qa-execution)
```

---

## 4. Production deploy

The Hub is a foreground/background Node process — deploy by shipping the repo (or an
`npm pack` tarball) to the target and building the SPA once.

```sh
# On the target host:
git clone <repo> && cd AITRI-HUB          # or unpack the release
npm ci                                     # server deps (zero runtime deps beyond dev tooling)
npm ci --prefix web && npm run build --prefix web   # build docker/web-dist/

# Configure (optional)
export AITRI_HUB_PORT=3000
export AITRI_HUB_DIR="$HOME/.aitri-hub"

# Start (choose a supervisor)
node bin/aitri-hub.js web                  # foreground
# or via launchd/systemd — see the existing com.aitri.hub LaunchAgent for macOS.
```

**macOS (existing pattern):** a `launchd` agent (`~/Library/LaunchAgents/com.aitri.hub.plist`,
`KeepAlive=true`, `RunAtLoad=true`) supervises `aitri-hub web`. Restart after an upgrade:

```sh
launchctl kickstart -k "gui/$(id -u)/com.aitri.hub"
```

> **Note:** the server loads `lib/**` into memory at boot but serves `docker/web-dist/`
> from disk per request. A **frontend-only** change takes effect after `npm run build`
> (hard-reload the browser). A **server/`lib` change requires a process restart.**

**Docker (optional):** an existing `Dockerfile` + `docker-compose.yml` remain valid; this
feature does not change them. `docker compose up -d` serves the same app.

---

## 5. Health checks

| Endpoint | Method | Success | Purpose |
|---|---|---|---|
| `/health` | GET | `200 { "status": "ok" }` (JSON — NFR-013) | liveness |

Every request is logged on one line — `[<ISO timestamp>] <METHOD> <path> <status>` — on
**every** branch (NFR-011). A boot smoke check ships as `smoke.sh`:

```sh
./smoke.sh          # boots the server on a temp hub dir, asserts /health, /,
                    # /data/dashboard.json, /api/projects respond without 5xx
```

Liveness probe example:

```sh
curl -sf http://localhost:${AITRI_HUB_PORT:-3000}/health || echo "DOWN"
```

---

## 6. Rollback

State and code are decoupled — QA executions/evidence under `~/.aitri-hub/qa/` are
append-only and forward-compatible, so a rollback never loses recorded data.

```sh
# 1. Revert the code to the previous release
git checkout <previous-tag-or-commit>

# 2. Rebuild the SPA from the reverted source
npm run build --prefix web

# 3. Restart the process
launchctl kickstart -k "gui/$(id -u)/com.aitri.hub"   # macOS
# or: kill the process and re-run `node bin/aitri-hub.js web`

# 4. Verify
curl -sf http://localhost:${AITRI_HUB_PORT:-3000}/health
```

**Data compatibility on rollback:** the collector / `dashboard.json` contract is frozen
(NFR-006/007/008) and new detail fields are additive, so an older frontend reads a newer
snapshot without error. QA store files (`~/.aitri-hub/qa/**`) are only read by the new
endpoints; an older build simply ignores them. No migration or data cleanup is needed.

---

## 7. CI/CD (NFR-012)

`.github/workflows/ci.yml` runs on **push and pull_request to `main`**:

| Job | Runs |
|---|---|
| `lint` | `npm run lint` + `npm run format:check` |
| `test` (Node 20, 22) | `npm test` — node unit + integration (+ admin e2e) |
| `test-web` | `npm test` in `web/` — Vitest unit suite |
| `build-web` | `npm run build` → uploads `docker/web-dist` |
| `e2e` | boots the server, `npm run test:e2e` (Playwright) |

Together these run the full declared suite (unit + web + e2e) on every push to `main`.
