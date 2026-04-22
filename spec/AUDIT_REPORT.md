# AITRI-HUB — Audit Report

Auditor: on-demand technical review
Date: 2026-04-22
Scope: all code under `bin/`, `lib/`, `web/src/`, `docker/`, and top-level manifests.

All eight known bugs (BG-001..BG-008) are already in `spec/BUGS.json` with status
`verified`; they are not duplicated below.

---

## Findings → Bugs

**[BUG-1]** `[severity: medium]` — SPA fallback silently serves `index.html` for unknown `/api/*` requests
- File: `lib/commands/web.js:376-389`
- Problem: the route table only matches `/api/projects` explicitly. Any other API-shaped path (e.g. `/api/foo`, `/api/projects/123/extra`) falls through to the static-asset branch and the SPA fallback returns `index.html` with HTTP 200 and `Content-Type: text/html`. API clients that expect JSON (or a 404) will misparse an HTML body as a successful response, hiding misrouted calls and breaking future API expansion.
- Suggested: `aitri bug add --title "Admin API SPA fallback masks /api/* misses as HTTP 200 index.html" --severity medium --description "lib/commands/web.js:376 — SPA fallback matches before a /api/* not-found handler. Add a dedicated /api/* branch that returns 404 application/json when no earlier /api/projects route claims the request."`

**[BUG-2]** `[severity: medium]` — `github-poller` reads unbounded HTTP response body
- File: `lib/collector/github-poller.js:45-55` (`httpsGet`) and `:86-98` (`fetchUpdatedAt`)
- Problem: the callback concatenates every `data` chunk into a string (`body += chunk`) with no size limit. A registered remote pointing at a public repo whose `.aitri` has been replaced with a multi-megabyte payload will be fully buffered into memory, then handed to `JSON.parse`. Since the collector loop runs every `REFRESH_MS` (5 s default), repeated pulls can exhaust memory or block the event loop on a single hostile project. Timeout only bounds wall-clock, not bytes.
- Suggested: `aitri bug add --title "github-poller httpsGet has no response-size limit" --severity medium --description "lib/collector/github-poller.js:45-55 — enforce a hard byte cap (e.g. 64 KiB for .aitri) by counting chunk lengths and destroying the request on overflow; reject rather than JSON.parse oversize bodies."`

**[BUG-3]** `[severity: low]` — Dead imports and orphaned `scanFolder` in `lib/utils/scan.js`
- File: `lib/commands/web.js:13,15` and `lib/utils/scan.js:45-56`
- Problem: `import crypto from 'node:crypto'` and `inferName` are imported in `web.js` but never referenced (verified by grep). A second `scanFolder` is exported from `lib/utils/scan.js`, but the only `scanFolder` actually used by the collector is in `lib/collector/folder-scanner.js`. The orphaned export produces two functions with the same name and different semantics, inviting the wrong one to be picked up in future edits.
- Suggested: `aitri bug add --title "Remove unused crypto/inferName imports and orphaned scanFolder in utils/scan.js" --severity low --description "lib/commands/web.js:13,15 drops unused imports; lib/utils/scan.js:45-56 delete the duplicate scanFolder (the live implementation lives at lib/collector/folder-scanner.js)."`

**[BUG-4]** `[severity: low]` — `AITRI_HUB_SCAN_DIR` splits on `,` so paths with commas are silently truncated
- File: `lib/commands/web.js:57-61`
- Problem: `process.env.AITRI_HUB_SCAN_DIR.split(',')` assumes no commas in directory paths. A legitimate macOS path like `/Users/x/Projects,old/aitri` is silently broken into two entries, neither of which exists, and no warning is logged. Since scan dirs are user-supplied env input, the failure mode is "projects silently disappear from the dashboard."
- Suggested: `aitri bug add --title "AITRI_HUB_SCAN_DIR split(',') loses directory paths that contain commas" --severity low --description "lib/commands/web.js:57 — switch to a path-list separator that cannot appear in POSIX paths (path.delimiter / null byte), or document the restriction and log when a split entry does not resolve."`

---

## Findings → Backlog

**[BL-1]** `[priority: P2]` — Drop Node 18 from engines and CI matrix
- File: `package.json` (`engines.node`), `.github/workflows/ci.yml:16`
- Problem: Node 18 reached end-of-life on 2025-04-30; as of today it is ~12 months past EOL and receives no security patches. `package.json` still declares `"node": ">=18.0.0"` and CI tests against `[18, 20]`, so any regression that only surfaces on a supported LTS (20 / 22) may be masked by a passing 18 job. Raise the floor to `>=20.0.0` and drop the 18 CI leg.
- Suggested: `aitri backlog add --title "Raise Node floor to >=20.0.0, drop Node 18 from CI matrix" --priority P2 --problem "Node 18 EOL 2025-04-30 — package.json and .github/workflows/ci.yml still target it. Update engines and remove '18' from the CI matrix; keep 20 + add 22."`

**[BL-2]** `[priority: P2]` — Installed-CLI version cache in alerts engine never refreshes
- File: `lib/alerts/engine.js:15-36`
- Problem: `getInstalledAitriVersion()` calls `aitri --version` once per process lifetime and caches the result in `_installedAitriVersion`. `aitri-hub web` is intended to run for hours/days. If the user upgrades the Aitri CLI while the server is running, the `VERSION_MISMATCH` rule continues to compare against the stale pre-upgrade version, producing false positives until the user restarts the dashboard. Add a TTL (e.g. 5 min) or invalidate on SIGHUP.
- Suggested: `aitri backlog add --title "Refresh Aitri CLI version cache in alerts engine on a TTL" --priority P2 --problem "lib/alerts/engine.js:15-36 caches installed CLI version for process lifetime. Long-running aitri-hub web stays stale after a CLI upgrade. Add a 5-minute TTL or expose _resetVersionCache on a signal."`

**[BL-3]** `[priority: P3]` — `validateLocation` rejects any path containing `..`, including legitimate ones
- File: `lib/commands/web.js:138-151`
- Problem: the guard `location.includes('..')` is a substring test, so paths like `/Users/name/some..folder/app` (valid directory names that happen to contain two dots) are rejected as `path_traversal`. The correct defence is realpath-based containment, which is what BL-007 proposes for `/data/`. This guard should be converted the same way to avoid false rejections during project registration.
- Suggested: `aitri backlog add --title "Replace substring '..' check in validateLocation with realpath containment" --priority P3 --problem "lib/commands/web.js:140 — location.includes('..') rejects legitimate directory names. Use fs.realpathSync + startsWith(allowedRoot) or path.resolve-based segment check instead."`

**[BL-4]** `[priority: P3]` — Per-project state map in `github-poller` has no eviction
- File: `lib/collector/github-poller.js:22` (`_state` Map)
- Problem: `_state` grows each time a new `projectId` is seen and never shrinks. When a project is removed from `projects.json`, its entry persists for the process lifetime. Memory impact is trivial per-entry, but the lack of any eviction policy or ceiling is brittle for a long-running process and makes it harder to reason about state lifecycle.
- Suggested: `aitri backlog add --title "Add eviction/ceiling to github-poller _state Map" --priority P3 --problem "lib/collector/github-poller.js:22 _state has no cap and no eviction on project removal. Prune entries that no longer appear in the current projects list, or cap at N and evict LRU."`

---

## Observations

**[OBS-1]** — `git-reader.js` uses shell-mode `execSync` with string interpolation
- Context: `lib/collector/git-reader.js:36-48` (`gitExec`)
- Concern: every git call is executed via `execSync(\`git ${cmd}\`, { cwd })` — shell interpretation is active. All current callers interpolate either hardcoded strings or values that come from trusted sources (ISO timestamps, fixed `SENSITIVE_FILES`, current branch name returned by git itself), so there is no reachable injection today. The concern is latent: the next maintainer that adds a caller which passes user-controlled data (e.g. a branch from `.aitri` config, a filename from an artifact) inherits a shell-escape vector for free.
- Why deferred: no user-controlled string currently reaches the command, so there is nothing to fix *now*. Hardening (switch to `execFileSync` with arg arrays) would be a broader refactor not tied to a specific defect.

**[OBS-2]** — `evaluateAlerts` is a 300-line monolith with 18+ rules sharing one function body
- Context: `lib/alerts/engine.js:87-389`
- Concern: each rule mutates a shared `alerts` array with its own severity / command literals. Cross-rule interactions (e.g. `OPEN_BUGS` suppression, dedup, or severity promotion) would be hard to express without refactoring. Hot-spot for future change — any rule addition has to read the full function.
- Why deferred: already captured as BL-010 in the existing backlog; no net-new action needed here.

**[OBS-3]** — Hardcoded `SNAPSHOT_MIN_AITRI_VERSION = '0.1.77'` and `FALLBACK_BASELINE = '0.1.80'`
- Context: `lib/collector/index.js:34`, `lib/constants.js` (`FALLBACK_BASELINE`)
- Concern: these thresholds are source constants bumped by hand. As Aitri CLI versions roll over, they become stale quickly. The compat manifest feature (BL-001) already retired the `INTEGRATION_LAST_REVIEWED` constant — a similar migration for the snapshot floor would remove one more moving target, but the current value is still meaningful.
- Why deferred: no defect — constant is correct today; removing it is a design change, not a fix.

---

## Human Review — Before running audit plan
- [x] Every Bug entry has a specific file and line reference
- [x] Every Backlog item has a specific problem description (not generic advice)
- [x] Known open bugs (BG-001..BG-008 in `spec/BUGS.json`, all verified) are not duplicated in Findings → Bugs
- [x] Observations are genuinely non-actionable right now (OBS-1 latent, OBS-2 already in backlog as BL-010, OBS-3 is a design call)
- [x] Security findings (BUG-2 unbounded HTTPS body, OBS-1 shell-mode git exec) name specific files and attack surfaces
