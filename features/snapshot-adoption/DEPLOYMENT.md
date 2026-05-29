# Deployment — snapshot-adoption

## Deployment model

Package/npm — no Docker. This feature adds snapshot-first dispatch to the Hub
collector (`lib/collector/index.js`) and supporting readers. No new runtime
dependencies; built-ins only (`child_process`, `fs`, `path`).

## Prerequisites

- Node.js ≥18
- `aitri-hub` installed globally: `npm install -g aitri-hub`
- `aitri` CLI v0.1.77+ installed globally (required for snapshot path;
  the Hub falls back to legacy readers for older versions)

## Environment variables

| Name | Type | Required | Default | Example |
|---|---|---|---|---|
| `AITRI_HUB_DIR` | string | optional | `~/.aitri-hub` | `/home/user/.aitri-hub` |

No secrets are introduced by this feature.

## Dev setup

```sh
npm install
npm run test:all    # unit + integration + Playwright
```

## Deploying / updating

```sh
npm install -g aitri-hub    # install or upgrade
aitri-hub web               # start the Hub web server
```

No migration required on upgrade. The collector auto-detects the installed
`aitri` version per project and selects snapshot vs. legacy path at runtime.

## Rollback

Downgrade to a prior Hub version — the legacy readers remain in the codebase and
activate automatically for any project running `aitri` <0.1.77. No data migration
needed in either direction.

## Health checks

`GET /api/projects` returns HTTP 200 when the server is healthy. No new endpoints
introduced by this feature.

## Filesystem side effects

- `~/.aitri-hub/logs/aitri-hub.log` — structured JSON failure lines appended on
  snapshot degradation (version_too_old, spawn error). Existing log rotation
  (5 MB cap, single `.1` backup) applies.
- No other new files on disk.
