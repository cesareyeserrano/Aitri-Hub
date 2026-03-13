# Aitri Hub — Deployment Guide

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18.0.0 | CLI only |
| Docker | ≥ 24.0 | Web dashboard |
| Docker Compose | ≥ 2.20 | Web dashboard |
| Git | ≥ 2.30 | Remote project sync |

## Environment Variables

All variables are optional — defaults shown below.

| Variable | Type | Required | Default | Description |
|---|---|---|---|---|
| `AITRI_HUB_DIR` | string | optional | `~/.aitri-hub` | State, cache, and log directory |
| `AITRI_HUB_PORT` | number | optional | `3000` | Web dashboard port |
| `AITRI_HUB_REFRESH_MS` | number | optional | `5000` | CLI monitor refresh interval (ms) |
| `AITRI_HUB_GIT_TIMEOUT_MS` | number | optional | `5000` | Git exec timeout (ms) |
| `AITRI_HUB_MAX_PROJECTS` | number | optional | `50` | Maximum registered projects |
| `AITRI_HUB_STALE_HOURS` | number | optional | `72` | Stale commit threshold (hours) |

Copy `.env.example` to `.env` and set values as needed.

## Development Setup

```bash
# 1. Install CLI dependencies
npm install

# 2. Register your projects
node bin/aitri-hub.js setup

# 3. Run the CLI monitor
node bin/aitri-hub.js monitor
```

## Web Dashboard — First Run (Docker)

> **Note:** First build takes 2–3 minutes (npm ci + vite build inside Docker). Subsequent runs use cached layers and start in under 30 seconds.

```bash
# 1. Build and start the web dashboard
docker compose up --build -d

# 2. Verify the container is healthy
docker compose ps

# 3. Open the dashboard
open http://localhost:3000
```

## Web Dashboard — Subsequent Runs

```bash
# Start (uses cached image)
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs -f web
```

## Production Deploy

```bash
# Build image with explicit tag
docker build -t aitri-hub-web:1.0.0 .

# Run with explicit image tag
docker compose up -d
```

## Health Check Endpoint

The nginx server exposes a health check at:

```
GET http://localhost:3000/health
→ 200 OK  "ok\n"
```

Docker Compose polls this endpoint every 10 seconds. The container is marked `healthy` after 3 consecutive successes.

## Rollback Procedure

### CLI rollback
```bash
# Install a previous version
npm install -g aitri-hub@<previous-version>

# Verify
aitri-hub --version
```

### Web dashboard rollback
```bash
# Stop current container
docker compose down

# Pull or build the previous image
docker build -t aitri-hub-web:previous .

# Edit docker-compose.yml to use aitri-hub-web:previous
# Then restart
docker compose up -d
```

The `~/.aitri-hub/` data directory is never modified by Docker — rollback is safe and data is preserved.

## Data Persistence

| Path | Purpose | Modified by |
|---|---|---|
| `~/.aitri-hub/projects.json` | Registered project list | `aitri-hub setup` (CLI) |
| `~/.aitri-hub/dashboard.json` | Latest collected metrics | `aitri-hub monitor` (CLI) |
| `~/.aitri-hub/cache/` | Cloned remote project repos | `aitri-hub monitor` (CLI) |
| `~/.aitri-hub/logs/aitri-hub.log` | Error log | `aitri-hub monitor` (CLI) |

The Docker container mounts `~/.aitri-hub/` as **read-only** (`/data:ro`). No container process can modify your data.

## Security Notes

- The Docker container runs as the non-root `nginx` user.
- No data is transmitted outside the local machine (except `git pull` for remote-registered projects).
- The web dashboard enforces `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and a strict `Content-Security-Policy`.
- `dashboard.json` is served with `Cache-Control: no-store` to prevent stale reads.
- No authentication is implemented — the web dashboard is intended for local use only. Do not expose port 3000 to untrusted networks.
