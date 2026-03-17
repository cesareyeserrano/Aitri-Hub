# Deployment — integration_update

## Overview

This feature is a **library patch** — no new services, containers, or infrastructure.
Deployment consists of merging the changes to `main` and allowing the existing CI/CD pipeline to ship them.

---

## Prerequisites

- Node.js ≥ 18.0.0
- npm (for dependency install)
- `aitri` CLI ≥ v0.1.58 (on developer machines, for `aitri --version` probe)

---

## Development Setup

```bash
# From the project root
npm install
npm test          # All 189 tests must pass before merging
```

---

## Production Deployment

This feature ships as part of the `aitri-hub` npm package. No separate deployment step:

1. Merge PR to `main`.
2. GitHub Actions CI runs automatically (`push` to `main`):
   - Runs `npm test` on Node 18 and 20.
   - Builds the React web app.
   - Runs Playwright E2E tests.
3. Publish via existing release process (`npm publish`).

```bash
# Verify tests pass before merging
npm test

# Existing Docker workflow unchanged — no new build steps
docker compose -f docker/docker-compose.yml up --build -d
```

---

## Health Checks

No new health endpoints introduced. Existing checks apply:
- CLI: `node bin/aitri-hub.js monitor` exits 0 on startup.
- Web: `GET http://localhost:3000/health` → 200 OK (nginx).

---

## Rollback Procedure

This feature modifies only `lib/collector/aitri-reader.js`, `lib/alerts/engine.js`, and `lib/constants.js`.

To roll back:
```bash
git revert <merge-commit-sha>
npm test   # verify revert is clean
```

No database migrations, no data format changes, no schema changes to `~/.aitri-hub/` files.

**Breaking change:** `artifactsDir` default changed from `'spec'` to `''` for projects without an explicit `artifactsDir` in `.aitri`. This is correct per the integration contract. Rollback restores the old (incorrect) behavior.

---

## Environment Variables

No new environment variables introduced by this feature.
See `.env.example` for existing project env vars.
