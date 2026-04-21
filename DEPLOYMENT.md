# Aitri Hub — Deployment Guide

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18.0.0 | Required |
| Git | ≥ 2.30 | Remote project sync |
| Docker | ≥ 24.0 | Optional — packaged deployment only |
| Docker Compose | ≥ 2.20 | Optional — packaged deployment only |

## Environment Variables

All variables are optional — defaults shown below.

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `AITRI_HUB_DIR` | string | optional | `~/.aitri-hub` | State, cache, and log directory |
| `AITRI_HUB_PORT` | number | optional | `3000` | Dashboard port (bound to 127.0.0.1) |
| `AITRI_HUB_REFRESH_MS` | number | optional | `5000` | Collector refresh interval (ms) |
| `AITRI_HUB_GIT_TIMEOUT_MS` | number | optional | `5000` | Git exec timeout (ms) |
| `AITRI_HUB_MAX_PROJECTS` | number | optional | `50` | Maximum registered projects |
| `AITRI_HUB_STALE_HOURS` | number | optional | `72` | Stale commit threshold (hours) |

Copy `.env.example` to `.env` and set values as needed.

## Development Setup

```bash
npm install
aitri-hub web
```

Open [http://localhost:3000](http://localhost:3000). Register projects from the `/admin` page — no terminal wizard is required.

## Production Deploy (Node.js)

```bash
npm install -g aitri-hub@<version>
aitri-hub web
```

The single process serves the UI and runs the collector. Use a supervisor (systemd, launchd, pm2) to keep it running:

```ini
# /etc/systemd/system/aitri-hub.service
[Service]
ExecStart=/usr/local/bin/aitri-hub web
Restart=on-failure
Environment=AITRI_HUB_PORT=3000
User=aitri
```

## Health Check Endpoint

The server exposes:

```
GET http://localhost:3000/health
→ 200 OK  "ok\n"
```

## Rollback Procedure

```bash
npm install -g aitri-hub@<previous-version>
aitri-hub --version
```

The `~/.aitri-hub/` data directory is never touched by an install — rollback is safe and data is preserved.

## Data Persistence

| Path | Purpose | Modified by |
|---|---|---|
| `~/.aitri-hub/projects.json` | Registered project list | `/api/projects` (admin UI) |
| `~/.aitri-hub/dashboard.json` | Latest collected metrics | `aitri-hub web` (collector) |
| `~/.aitri-hub/cache/` | Cloned remote project repos | `aitri-hub web` (collector) |
| `~/.aitri-hub/logs/aitri-hub.log` | Error log | `aitri-hub web` (collector) |

## Security Notes

- The HTTP server binds to `127.0.0.1` only — it is not reachable from other hosts.
- `/api/*` routes enforce a loopback-peer check (`127.0.0.1` or `::1`); any other peer receives `403`.
- No authentication is implemented — the dashboard is intended for local use only. Do not expose port 3000 to untrusted networks via tunnels, reverse proxies, or VPNs without adding your own auth layer.
- No data is transmitted outside the local machine (except `git pull` for remote-registered projects).
- `dashboard.json` is served with `Cache-Control: no-store` to prevent stale reads.

---

## Optional: Docker deployment

Docker is **not** the recommended deployment path — it exists for users who prefer container-packaged workloads. The Node.js process is self-sufficient and does not require Docker or nginx.

> **Note:** First build takes 2–3 minutes (npm ci + vite build inside Docker). Subsequent runs use cached layers.

### First run

```bash
docker compose up --build -d
docker compose ps
open http://localhost:3000
```

### Subsequent runs

```bash
docker compose up -d
docker compose down
docker compose logs -f web
```

### Production image

```bash
docker build -t aitri-hub-web:1.0.0 .
docker compose up -d
```

### Docker rollback

```bash
docker compose down
docker build -t aitri-hub-web:previous .
# Edit docker-compose.yml to use aitri-hub-web:previous
docker compose up -d
```

The Docker container mounts `~/.aitri-hub/` as **read-only** (`/data:ro`). It serves the pre-built SPA via nginx and relies on a separate Node process (or a sidecar) to run the collector that writes `dashboard.json`. Most users should prefer the plain `aitri-hub web` path above.
