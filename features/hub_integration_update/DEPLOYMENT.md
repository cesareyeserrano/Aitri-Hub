# Deployment — hub_integration_update

## What changed
- `lib/collector/bugs-reader.js` (new) — reads BUGS.json per project
- `lib/collector/aitri-reader.js` — adds `lastSession` to readAitriState return
- `lib/collector/index.js` — calls readBugsSummary, adds bugsSummary to project data
- `lib/alerts/engine.js` — two new alert rules: open-bugs blocking + warning
- `lib/constants.js` — adds `OPEN_BUGS` alert type
- `web/src/components/BugBadge.jsx` (new) — bug count badge for ProjectCard
- `web/src/components/LastSessionRow.jsx` (new) — lastSession row for ActivityTab
- `web/src/components/ProjectCard.jsx` — imports and renders BugBadge
- `web/src/components/ActivityTab.jsx` — imports and renders LastSessionRow

**No new services, no new endpoints, no Docker changes, no environment variables.**

## Prerequisites
- Node.js ≥18 (same as existing Hub requirement)
- No new npm packages required

## Dev setup
```bash
# No additional setup required. Hub dev server picks up changes automatically.
cd web && npm run dev
```

## Production deployment
The rebuilt web dist is already committed to `docker/web-dist/`. Redeploy using the existing Hub Docker setup:
```bash
cd web && npm run build    # rebuilds dist with BugBadge + LastSessionRow
docker compose up -d --build   # from docker/ directory
```

## Health check
No new health check endpoints. Existing Hub health check at `/` (nginx) remains unchanged.

## Rollback
Revert the 8 changed source files and rebuild the web dist:
```bash
git revert HEAD   # or git checkout <prior-sha> -- <file>
cd web && npm run build
docker compose up -d --build
```

## Verification after deploy
1. Open Hub → Overview tab — project with BUGS.json should show bug badge
2. Open Hub → Activity tab — project with lastSession in .aitri should show session row
3. Open Hub → Alerts tab — project with open critical/high bugs should show blocking alert
4. Project with no BUGS.json should show no badge and no bug alert (no regression)
