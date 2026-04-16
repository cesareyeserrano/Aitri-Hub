# Deployment — integration-last-reviewed-gate

This feature is an additive change to the Aitri Hub CLI and React web dashboard.
It has no standalone service, binary, or container of its own — it ships as part of
the parent `aitri-hub` npm package and the existing Docker web image.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | ≥18.0.0 | Runtime for CLI |
| npm | ≥9.0.0 | Package manager |
| Docker | ≥27.0 | Required for web dashboard only |
| Docker Compose | ≥2.0 | Required for web dashboard only |
| Aitri CLI | any | `aitri --version` used for integration gate |

---

## Development Setup

```bash
# Install all dependencies (root + web)
npm install
npm --prefix web install

# Run all tests (CLI unit/integration + React component)
npm run test:feature

# Start web dashboard in dev mode (hot reload)
npm --prefix web run dev
```

---

## Production Deployment

This feature ships with the parent project. No additional steps beyond the
standard Aitri Hub deployment:

```bash
# 1. Build the React web bundle
npm --prefix web run build
# Output goes to docker/web-dist/

# 2. Build and start the Docker container
docker compose up --build -d

# Web dashboard available at http://localhost:3000
```

### What this feature adds at runtime

| Component | Where | Behaviour |
|-----------|-------|-----------|
| `INTEGRATION_LAST_REVIEWED` constant | `lib/constants.js` | Static — loaded at CLI startup |
| `detectAitriVersion()` | `lib/collector/aitri-version-reader.js` | Runs `aitri --version` once per collection cycle |
| `evaluateIntegrationAlert()` | `lib/collector/integration-guard.js` | Pure function — no I/O |
| `readFeaturePipelines()` | `lib/collector/feature-reader.js` | Reads `features/*/` on each collection cycle |
| `integrationAlert` in `dashboard.json` | `~/.aitri-hub/dashboard.json` | Written per cycle; null when no mismatch |
| `IntegrationAlertBanner` | React web dashboard | Visible when `integrationAlert != null` |
| `FeatureSummarySection` | React web dashboard — per project card | Visible when `featurePipelines.length > 0` |

---

## Environment Variables

This feature introduces no new environment variables.

The existing `AITRI_HUB_DIR_OVERRIDE` (test-only) is unchanged.

| Variable | Type | Required | Default | Example |
|----------|------|----------|---------|---------|
| `AITRI_HUB_DIR_OVERRIDE` | string | No (test use only) | `~/.aitri-hub` | `/tmp/hub-test-abc` |

---

## Health Checks

The feature has no HTTP endpoints of its own. Health is verified through the
parent project's existing health check:

```
GET http://localhost:3000/data/dashboard.json
```

A `200 OK` response with valid JSON containing `integrationAlert` (null or object)
and `projects[*].featurePipelines` (array) confirms the feature is active.

---

## Updating INTEGRATION_LAST_REVIEWED

When a new version of the Aitri CLI is released:

1. Read `docs/integrations/CHANGELOG.md` in the Aitri repo.
2. Verify that no breaking changes affect Hub integration.
3. Bump `INTEGRATION_LAST_REVIEWED` in `lib/constants.js`:
   ```js
   export const INTEGRATION_LAST_REVIEWED = '0.x.xx'; // new version
   ```
4. Run `npm run test:feature` to confirm all tests pass.
5. Rebuild and redeploy the web bundle.

**Never automate this bump** — it requires a human review of the changelog.

---

## Rollback

If this feature must be reverted:

```bash
# Revert to the commit before feature integration
git revert <merge-commit-sha>

# Rebuild and redeploy
npm --prefix web run build
docker compose up --build -d
```

The `dashboard.json` schema change is backward compatible — existing consumers
that do not read `integrationAlert` or `featurePipelines` are unaffected.

---

## Known Limitations (Technical Debt)

| FR | Issue | Severity | Effort |
|----|-------|----------|--------|
| FR-012 | CLI alert line not rendered — `aitri-hub monitor` is a stub | medium | low |
| FR-013 | ENOENT path for `detectAitriVersion` tested via interface contract, not full mock (Node 18 ESM limitation) | low | low |
