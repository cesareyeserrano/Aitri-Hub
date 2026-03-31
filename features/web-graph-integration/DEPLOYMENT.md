# Deployment — web-graph-integration

## Summary

This feature makes two scoped changes to Aitri Hub:
1. Removes the `aitri-hub monitor` CLI command (replaced with a redirect stub).
2. Adds a **Graph** tab (7th tab) to the web dashboard that renders the spec artifact DAG using Cytoscape.js.

**No new servers, no new endpoints, no new Docker containers, no environment variables added.**

The existing deployment path (`docker/`) is unchanged.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 9.0.0 |

---

## Development Setup

```bash
# 1. Install root dependencies
npm install

# 2. Install and build web frontend (bundles Cytoscape.js)
cd web && npm install && npm run build

# 3. Start the web dashboard
node bin/aitri-hub.js web
```

The web dashboard will be available at `http://localhost:3000`.

---

## Production Deploy (Docker — unchanged from prior release)

The existing Docker deployment path is unchanged. Rebuild the image after pulling this feature:

```bash
# From project root
docker compose -f docker/docker-compose.yml up --build -d
```

The `npm run build` step inside the Dockerfile picks up the new Cytoscape chunks automatically.

---

## Health Checks

| Endpoint | Expected Response |
|---|---|
| `GET http://localhost:3000/` | 200 OK — serves `index.html` |
| `GET http://localhost:3000/data/dashboard.json` | 200 OK — valid JSON with `schemaVersion` field |

---

## Rollback

To revert this feature:

```bash
git revert <merge-commit-sha>
cd web && npm install && npm run build
docker compose -f docker/docker-compose.yml up --build -d
```

The `aitri-hub monitor` command will be restored after rollback. No database or state migration required.

---

## Environment Variables

No new environment variables introduced by this feature.
All existing variables documented in `docker/docker-compose.yml` and `.env.example` remain unchanged.

---

## Breaking Changes

| Change | Impact | Migration |
|---|---|---|
| `aitri-hub monitor` removed | Users running `aitri-hub monitor` will see a redirect message | Run `aitri-hub web` instead |
| `lib/renderer/cli.js` deleted | Any scripts importing this module will break | Remove the import; use `aitri-hub web` |
