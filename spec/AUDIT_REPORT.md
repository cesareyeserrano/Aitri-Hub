# AITRI-HUB — Audit Report

Auditor: on-demand technical review
Date: 2026-05-22
Scope: `bin/`, `lib/`, `web/src/`, Docker/nginx config, package manifests, CI, and tests.

Checks performed: read CLI/server entry points, collector/store modules, alert engine, admin API,
React dashboard/admin components, Docker/nginx deployment path, package manifests, and CI workflow.
Ran `npm run lint`, root `npm audit --audit-level=critical`, web `npm audit --audit-level=critical`,
and dependency tree inspection for flagged web packages.

---

### Findings → Bugs

**[BUG-1]** `[severity: high]` — Remote cache path collides for repositories with the same basename
- File: `lib/collector/index.js:100`
- Problem: `resolveProjectDir()` derives the remote clone cache directory from only the final URL segment (`repo` from `org/repo.git`). Two different remotes such as `github.com/acme/api.git` and `github.com/other/api.git` both resolve to `~/.aitri-hub/cache/api`. The second registration reuses or pulls the first repository cache, so the dashboard can show Git/Aitri/test data for the wrong project.
- Suggested: `aitri bug add --title "Remote cache directory collides for repositories with the same basename" --severity high --description "lib/collector/index.js:100 derives cache paths from only the remote basename. Include the project id or a hash of the full remote URL in the cache directory to prevent cross-project cache reuse."`

**[BUG-2]** `[severity: medium]` — Folder-scanned child projects have no stable `id`
- File: `lib/collector/folder-scanner.js:48`
- Problem: `scanFolder()` returns synthetic child project stubs with `name`, `location`, `type`, and `parentFolder`, but no `id`. `collectAll()` forwards those stubs to `collectOne()` and later prunes poller state with `expanded.map(p => p.id).filter(Boolean)`, so folder children never participate in id-based lifecycle handling. The React dashboard also renders cards with `key={project.id}` in `web/src/components/HomeView.jsx:175`, which becomes `undefined` for every folder child and causes unstable/repeated keys.
- Suggested: `aitri bug add --title "Folder-scanned child projects are emitted without project ids" --severity medium --description "lib/collector/folder-scanner.js:48 returns child stubs without id. Add id: projectId(childPath) so collected dashboard records, poller pruning, and React list keys are stable."`

**[BUG-3]** `[severity: medium]` — Docker/nginx serves HTML instead of dashboard JSON when `dashboard.json` is missing
- File: `docker/nginx.conf:24`
- Problem: the Docker path serves `/data/` through nginx with `try_files $uri =404`, then the server-wide `error_page 404 /index.html` at `docker/nginx.conf:34` rewrites missing data requests to the SPA document. On a fresh Docker deployment with no `/data/dashboard.json`, the frontend fetch for `/data/dashboard.json` receives HTML/404 instead of the empty dashboard JSON returned by the Node server path, so the browser-first empty state can fail in Docker.
- Suggested: `aitri bug add --title "Docker /data/dashboard.json missing path returns SPA HTML instead of empty dashboard JSON" --severity medium --description "docker/nginx.conf:24 falls through to the global 404 error_page. Add an exact /data/dashboard.json fallback that returns an empty JSON dashboard, or keep /data/ 404s from being rewritten to index.html."`

**[BUG-4]** `[severity: low]` — Admin API accepts invalid project types and remote locations
- File: `lib/commands/web.js:152`
- Problem: `validateLocation()` only special-cases `type !== 'remote'`; it does not whitelist `local|remote|folder`, and it does not validate remote URL shape. A localhost client can POST `{"type":"remote","location":"not-a-url"}` and get a persisted project that fails later during `git clone`, or POST an arbitrary nonstandard type backed by an existing path, which is stored but collected through the wrong path logic.
- Suggested: `aitri bug add --title "Admin API should reject invalid project types and malformed remote locations" --severity low --description "lib/commands/web.js:152 validates local paths but does not enforce allowed type values or remote URL syntax. Reject types outside local|remote|folder and require remote URLs to match the existing validateRemoteUrl/classification rules."`

### Findings → Backlog

**[BL-1]** `[priority: P1]` — Remove or upgrade vulnerable unused graph dependencies in the web package
- File: `web/package.json`
- Problem: `npm audit` in `web/` reports one high and three moderate vulnerabilities: `lodash` through `cytoscape-dagre`, plus `vite`/`esbuild` and `postcss`. `rg` found no imports of `cytoscape` or `cytoscape-dagre` in `web/src`, so the graph dependencies appear unused while keeping vulnerable transitive packages in the install. Remove unused graph packages, then run `npm audit fix` or upgrade Vite/PostCSS to patched versions.
- Suggested: `aitri backlog add --title "Remove unused graph dependencies and resolve web npm audit findings" --priority P1 --problem "web/package.json includes unused cytoscape/cytoscape-dagre and npm audit reports high/moderate vulnerabilities via lodash, vite/esbuild, and postcss. Remove unused packages and update the remaining dependency tree."`

**[BL-2]** `[priority: P2]` — Web dependency tree is invalid after Vitest/Vite resolution
- File: `web/package-lock.json`
- Problem: `npm ls lodash vite esbuild postcss` exits with `ELSPROBLEMS` because `vitest@4.1.4` pulls `vite@8.0.8`, whose peer tree expects `esbuild "^0.27.0 || ^0.28.0"`, but the installed tree dedupes `esbuild@0.21.5`. The test command may still run, but the lockfile is internally inconsistent and package-manager diagnostics fail.
- Suggested: `aitri backlog add --title "Repair invalid web package-lock dependency tree" --priority P2 --problem "web/package-lock.json produces npm ls ELSPROBLEMS: vite@8.0.8 from vitest expects esbuild ^0.27/^0.28 but esbuild@0.21.5 is deduped. Regenerate/upgrade the web lockfile so npm ls exits cleanly."`

**[BL-3]** `[priority: P2]` — Docker build still uses Node 18 while the package requires Node 20+
- File: `Dockerfile:2`
- Problem: the root `package.json` declares `"node": ">=20.0.0"`, CI tests Node 20/22, but the Docker builder stage is `node:18-alpine`. That means Docker builds exercise an unsupported runtime and can mask Node 20+ assumptions or produce dependency install warnings/failures as packages advance.
- Suggested: `aitri backlog add --title "Update Docker builder image to Node 20 or 22" --priority P2 --problem "Dockerfile:2 uses node:18-alpine while package.json requires Node >=20 and CI targets 20/22. Move the builder stage to node:20-alpine or node:22-alpine."`

**[BL-4]** `[priority: P3]` — Lint passes with 13 warnings for unused symbols
- File: `tests/integration/dashboard-feature-schema.test.js`
- Problem: `npm run lint` exits 0 but reports 13 `no-unused-vars` warnings across tests and frontend components, including unused imports in test files and unused props/locals in `web/src/components/Header.jsx` and `web/src/components/ProjectCard.jsx`. These warnings lower signal in CI and make new warnings easier to miss.
- Suggested: `aitri backlog add --title "Clean up existing ESLint no-unused-vars warnings" --priority P3 --problem "npm run lint reports 13 warnings for unused symbols across tests and web components. Remove unused imports/locals or prefix intentional unused args with _ so lint output is clean."`

### Observations

**[OBS-1]** — `git-reader.js` still uses shell-mode `execSync`
- Context: `lib/collector/git-reader.js:39`
- Concern: `gitExec()` constructs `execSync(\`git ${cmd}\`)`, so any future caller that passes user-controlled arguments would inherit shell interpretation. Current callers pass hardcoded git subcommands, generated ISO timestamps, fixed sensitive filenames, or values returned by git itself, so I did not find a reachable injection path in the current code.
- Why deferred: no current user-controlled input reaches `cmd`; switching to `execFileSync` with argument arrays would be hardening rather than a direct bug fix.

**[OBS-2]** — Docker is now a static-read-only deployment path while the main app is the Node server
- Context: `DEPLOYMENT.md:129`, `docker/nginx.conf`
- Concern: the documented Docker container serves the SPA and mounted `/data` only; it does not expose the Node admin API or run the collector. This is described as a secondary path that relies on a separate Node process or sidecar, but it increases the chance that Docker users expect `/admin` registration to work when it cannot persist anything from nginx.
- Why deferred: this is a product/deployment positioning decision unless Docker is intended to be feature-equivalent with `aitri-hub web`.

**[OBS-3]** — Dependency audit found no critical vulnerabilities in the root package
- Context: `package.json`, `web/package.json`
- Concern: root `npm audit --audit-level=critical` returned `found 0 vulnerabilities`. The web audit did not find critical issues but did find high/moderate issues captured as BL-1.
- Why deferred: the root package has no action from the critical audit; web dependency work is already classified as backlog.

### Human Review — Before running audit plan
- [x] Every Bug entry has a specific file and line reference
- [x] Every Backlog item has a specific problem description (not generic advice)
- [x] Known open bugs are not duplicated in Findings → Bugs
- [x] Observations are genuinely non-actionable right now
- [x] Security findings name specific files and the attack surface they expose
