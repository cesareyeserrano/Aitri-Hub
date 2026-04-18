# Deployment — hub-mvp-web

## Overview

This feature ships as part of `aitri-hub` v0.1.6. It adds an admin CRUD API at `/api/projects`, replaces the 7-tab UI with a single-view home + `/admin` panel, and deprecates the CLI `setup` and `monitor` commands. No new processes, no new ports — the admin API is served by the same Node.js process as `aitri-hub web`.

---

## Prerequisites

- Node.js ≥ 18.0.0
- npm ≥ 8.0.0
- Existing `aitri-hub` project directory at `~/.aitri-hub/`

---

## Dev Setup

```bash
# Install dependencies
npm install

# Build the React SPA
npm run build

# Run all tests
npm test

# Start the web server (port 3000)
AITRI_HUB_DIR=~/.aitri-hub node bin/aitri-hub.js web
```

Open [http://localhost:3000](http://localhost:3000) for the dashboard.
Open [http://localhost:3000/admin](http://localhost:3000/admin) to manage projects.

---

## Production Deploy

### Docker (recommended)

```bash
# Build image
docker build -f docker/Dockerfile -t aitri-hub:latest .

# Run with docker-compose
docker-compose -f docker/docker-compose.yml up -d
```

Environment variables are injected via `.env` (copy from `.env.example`):

```bash
cp .env.example .env
# Edit .env to set AITRI_HUB_PORT if needed
docker-compose -f docker/docker-compose.yml up -d
```

### Direct Node.js

```bash
AITRI_HUB_PORT=3000 AITRI_HUB_DIR=~/.aitri-hub node bin/aitri-hub.js web
```

---

## Health Check

```
GET /health
→ 200 OK  (plain text "ok")
```

The health endpoint is used by Docker and Playwright to confirm the server is up.

---

## Admin API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List all registered projects |
| POST | `/api/projects` | Add a project |
| PUT | `/api/projects/:id` | Edit a project |
| DELETE | `/api/projects/:id` | Remove a project |

All admin API endpoints accept only localhost connections (`127.0.0.1`, `::1`). Remote connections receive `403 Forbidden`.

---

## Rollback

If the deployment causes issues, rollback to the previous version:

```bash
# Via npm (if installed globally)
npm install -g aitri-hub@<previous-version>

# Via Docker
docker-compose -f docker/docker-compose.yml stop
docker run -d -p 3000:3000 -v ~/.aitri-hub:/data aitri-hub:<previous-tag>
```

The `projects.json` file in `~/.aitri-hub/` is preserved across versions. Rollback does not affect project registration data.

---

## File Layout

```
~/.aitri-hub/
├── projects.json      ← managed by admin API (created on first project add)
└── dashboard.json     ← written every 5s by the collector loop (read-only from browser)
```

---

## Deprecated CLI Commands

| Command | Status | Replacement |
|---------|--------|-------------|
| `aitri-hub setup` | Deprecated | Use http://localhost:3000/admin |
| `aitri-hub monitor` | Deprecated | Use http://localhost:3000 |

Both commands still execute (exit 0) but print a deprecation notice pointing to the web UI.
