# Deployment — hub-bug-summary-snapshot

## Scope

This feature is a data projection fix in `lib/collector/snapshot-reader.js`. It ships with the existing Aitri Hub web server and does not add services, ports, storage schemas, secrets, or user input paths.

## Environment Variables

| Name | Type | Required | Example | Purpose |
| --- | --- | --- | --- | --- |
| `AITRI_HUB_DIR` | Absolute path | Optional | `/data` | Directory containing `projects.json`, `dashboard.json`, cache, and logs. |
| `AITRI_HUB_PORT` | Integer TCP port | Optional | `3000` | Web server port. |
| `AITRI_HUB_REFRESH_MS` | Integer milliseconds | Optional | `5000` | Dashboard collection refresh interval. |
| `AITRI_HUB_SCAN_DIR` | Absolute path list | Optional | `/workspace/projects` | Additional directories to scan for projects. |
| `AITRI_HUB_DATA_DIR` | Host path | Optional | `./data` | docker-compose host volume mounted to `/data`. |

No secrets are required by this feature.

## Local Verification

From the repository root:

```bash
aitri feature verify-run hub-bug-summary-snapshot
aitri feature verify-complete hub-bug-summary-snapshot
```

The feature runner executes:

```bash
cd features/hub-bug-summary-snapshot
./run-tests.sh
```

## Container Build

```bash
docker compose -f features/hub-bug-summary-snapshot/docker-compose.yml build
```

## Run

```bash
mkdir -p features/hub-bug-summary-snapshot/data
docker compose -f features/hub-bug-summary-snapshot/docker-compose.yml up
```

## Health Check

```bash
curl -fsS http://127.0.0.1:${AITRI_HUB_PORT:-3000}/health
```

Expected response:

```text
ok
```

## Rollback

Revert the feature commit or redeploy the previous image tag. No data migration is required because the feature changes only the in-memory projection from Aitri snapshot data to Hub dashboard data.

## CI/CD Notes

The existing `.github/workflows/ci.yml` triggers on push and pull request to `main`, installs dependencies with `npm ci`, runs root tests, and runs the declared Playwright E2E runner. It does not currently run this feature's exact `./run-tests.sh` command, so CI/CD compliance is partial for the feature-specific runner.
