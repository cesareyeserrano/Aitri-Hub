# Deployment — integration-compat-manifest

## Deployment model

Package/npm — no Docker. This feature adds Node ESM modules under `lib/` and a
new subcommand to `bin/aitri-hub.js`. No new runtime dependencies; built-ins only
(`crypto`, `fs`, `path`, `child_process`, `module`).

## Prerequisites

- Node.js ≥18 (ESM + `crypto.createHash`)
- `aitri-hub` installed globally: `npm install -g aitri-hub`
- Optional: `aitri` CLI installed globally (required for CHANGELOG drift detection;
  the Hub falls back to `FALLBACK_BASELINE` if absent)

## Environment variables

| Name | Type | Required | Default | Example |
|---|---|---|---|---|
| `AITRI_HUB_DIR` | string | optional | `~/.aitri-hub` | `/home/user/.aitri-hub` |

No secrets are introduced by this feature.

## Dev setup

```sh
npm install
npm test                       # unit + integration + e2e/admin-api
npm run test:all               # full suite including Playwright
```

## Deploying / updating

```sh
npm install -g aitri-hub       # install or upgrade
aitri-hub web                  # start the Hub web server
```

The `integration-compat.json` manifest is written to `$AITRI_HUB_DIR` on first
`aitri-hub integration review` run. No migration is needed on upgrade.

## New CLI subcommand

```sh
aitri-hub integration review <version> [--changelog <path>] [--note <text>]
```

Exit codes: `0` OK · `1` usage · `2` invalid version · `3` changelog not found ·
`4` section not found.

## Rollback

Delete or ignore `~/.aitri-hub/integration-compat.json`. The collector falls back
to `FALLBACK_BASELINE = '0.1.80'`, matching pre-feature behavior. Downgrading the
package requires no migration.

## Health checks

`aitri-hub web` exposes `GET /api/projects` — HTTP 200 confirms the server is
healthy. No new health-check endpoints are introduced by this feature.

## Filesystem side effects

- `~/.aitri-hub/integration-compat.json` (mode `0600`) — written by
  `aitri-hub integration review`; absent until the user runs the command.
- No other new files on disk.
