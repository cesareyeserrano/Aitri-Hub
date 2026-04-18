# Deployment — hub-folder-scan

## Overview

This feature adds the `folder` project type to Aitri Hub. It ships as part of the existing hub process — no new services, ports, or infrastructure are required.

## Prerequisites

- Node.js ≥ 18
- Existing Aitri Hub installation
- Filesystem access to directories registered as folder-type projects

## Dev Setup

```bash
npm install
cd web && npm run build && cd ..
npm test
```

## Production Deploy

This feature ships with the existing hub. No migration steps are required.

1. Deploy updated `lib/collector/folder-scanner.js` and updated `lib/collector/index.js`, `lib/commands/web.js`
2. Deploy updated React build (`web/dist/`)
3. Restart the hub process

For Docker deployments, rebuild the image using the project-root `Dockerfile`:

```bash
docker build -t aitri-hub:latest .
docker-compose up -d
```

## Environment Variables

No new environment variables are introduced by this feature. See project-root `.env.example` for the full list.

## Health Checks

```bash
GET /health         → 200 OK (existing hub health endpoint)
GET /api/projects   → 200 with projects array (includes any folder-type entries)
```

## Rollback

To roll back this feature:
1. Revert `lib/collector/folder-scanner.js` (delete the file)
2. Revert `lib/collector/index.js` (remove scanFolder import and expansion loop)
3. Revert `lib/commands/web.js` (remove `not_a_directory` validation branch)
4. Revert `web/src/components/AdminAddForm.jsx` (remove folder option and helper text)
5. Rebuild React: `cd web && npm run build`
6. Restart hub

Any projects.json entries with `type: "folder"` will remain inert after rollback — the collector will simply skip them (no crash, no output cards).
