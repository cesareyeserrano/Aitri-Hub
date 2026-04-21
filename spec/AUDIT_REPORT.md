# AUDIT REPORT — AITRI-HUB

**Date:** 2026-04-20
**Auditor:** Senior Technical Auditor (on-demand review)
**Scope:** CLI runtime (`bin/`, `lib/`), web frontend (`web/src/`), Docker/nginx (`docker/`), package config
**Method:** Direct code read across 5 dimensions (Code Quality, Architecture, Logic, Security, Stack). Findings verified at file:line before inclusion.

**Pipeline state at audit time:** Phase 1–5 ✅ approved · Verify 27/27 · 7 feature sub-pipelines passing.

---

## Findings → Bugs

**[BUG-1]** `[severity: high]` — Web server binds to `0.0.0.0`, violating NFR-005 (local-only)
- File: `lib/commands/web.js:379`
- Problem: `server.listen(port, () => {...})` is called without a host argument. Node's HTTP server defaults to `0.0.0.0`, so the dashboard is reachable from any host on the LAN — not just `localhost`. NFR-005 explicitly states *"No project data is transmitted outside the local machine."* Anyone on the same Wi-Fi can fetch `dashboard.json`, list projects via `GET /api/projects`, and mutate them via `POST /api/projects`.
- Suggested: `aitri bug add --title "web server binds to 0.0.0.0 (violates NFR-005)" --severity high --fr FR-006`

**[BUG-2]** `[severity: medium]` — Unbounded request body in `POST /api/projects`
- File: `lib/commands/web.js:167-216`
- Problem: `req.on('data', chunk => { body += chunk; })` accumulates the request body with no max-size check. A client can send an arbitrarily large payload, forcing unbounded string concatenation and eventual process-memory exhaustion. Combined with BUG-1, this is reachable from LAN. The server never calls `req.destroy()` on oversized input.
- Suggested: `aitri bug add --title "POST /api/projects has no request size limit" --severity medium --fr FR-006`

**[BUG-3]** `[severity: medium]` — Dockerfile missing `USER` and `HEALTHCHECK` directives
- File: `docker/Dockerfile:10-16`
- Problem: Phase 5 approval checklist requires *"non-root user, HEALTHCHECK"*, but the final stage has neither. nginx runs as root inside the container, and Docker/Compose cannot detect an unhealthy web surface. This is a compliance regression against the pipeline's own deploy gate.
- Suggested: `aitri bug add --title "Dockerfile missing USER and HEALTHCHECK (fails phase-5 checklist)" --severity medium --fr FR-006`

---

## Findings → Backlog

**[BL-1]** `[priority: P2]` — Symlink-aware path-traversal check for `/data/`
- File: `lib/commands/web.js:306-315`
- Problem: Path-traversal guard uses `filePath.startsWith(dataDir + path.sep)` on the `path.join` result. A symlink inside `~/.aitri-hub/` pointing outside the directory bypasses this check at read time because `fs.readFileSync` follows symlinks. Low likelihood locally, but non-zero (badly-configured cache clone, user mistake).
- Suggested: `aitri backlog add --title "resolve realpath before /data path-traversal check" --priority P2 --problem "startsWith check does not catch symlink escapes from ~/.aitri-hub/"`

**[BL-2]** `[priority: P2]` — Env-var config parsed with no validation
- File: `lib/constants.js:8-13`
- Problem: `parseInt(process.env.AITRI_HUB_REFRESH_MS ?? '5000', 10)` silently produces `NaN` for invalid input (`AITRI_HUB_REFRESH_MS=abc`). `NaN` propagates into `setInterval(runCollectionCycle, NaN)` which Node treats as 1 ms, spinning the collection loop at max rate. Same hazard on `MAX_PROJECTS`, `GIT_TIMEOUT_MS`, `STALE_HOURS`, `WEB_PORT`, `REMOTE_REFRESH_MS`.
- Suggested: `aitri backlog add --title "validate numeric env vars at boot" --priority P2 --problem "parseInt → NaN silently breaks intervals/timeouts; add Number.isFinite guards and fall back to defaults"`

**[BL-3]** `[priority: P3]` — No linter / formatter configured
- Problem: Root repo has no `.eslintrc*`, `.prettierrc`, or equivalent config. Code-style drift across contributors is unchecked; CI does not gate on lint. (CI workflow `.github/workflows/ci.yml` runs tests only.)
- Suggested: `aitri backlog add --title "add ESLint + Prettier (lint gate in CI)" --priority P3 --problem "no style enforcement; style drift not detected in CI"`

**[BL-4]** `[priority: P3]` — Alert-engine rule growth handled as one long function
- File: `lib/alerts/engine.js`
- Problem: `evaluateAlerts()` concentrates many rule branches in a single function. While each rule is covered by tests, the rule registry is implicit. Adding/removing a rule means editing the same function that every other rule lives in. Refactoring to a rule-array (`[{ id, evaluate(project) }]`) would isolate changes and allow per-rule metrics.
- Suggested: `aitri backlog add --title "extract alerts engine to rule-registry pattern" --priority P3 --problem "single function aggregates many rules; isolation and testability would improve with a rule array"`

---

## Observations

**[OBS-1]** — Vite `outDir` crosses the build context
- Context: `web/vite.config.js:17` sets `outDir: '../docker/web-dist'`; `docker/Dockerfile:12` copies from `/build/../docker/web-dist`
- Concern: Build works because the Docker builder stage happens to own `/docker/web-dist` as an intermediate directory, but relying on a relative path that jumps outside the source tree is surprising. Renaming or restructuring either side breaks the build silently.
- Why deferred: It works today and is covered by e2e tests; reshaping Vite's outDir and Dockerfile COPY path is a cross-cutting change with no behavior gain.

**[OBS-2]** — `Aitri Core` integration gate coupled to a hardcoded version
- Context: `lib/constants.js:30` pins `INTEGRATION_LAST_REVIEWED = '0.1.80'`; collector uses `SNAPSHOT_MIN_AITRI_VERSION = '0.1.77'` at `lib/collector/index.js:32`
- Concern: Two coupled constants track the upstream Aitri contract. When Aitri Core ships a breaking change to the snapshot schema, both values must be updated in lockstep — the pipeline depends on a human reading `docs/integrations/CHANGELOG.md`.
- Why deferred: The existing `integration-last-reviewed-gate` feature already formalizes this workflow; no further automation is in scope right now.

**[OBS-3]** — `cmdWeb` runs collection in-process with no retry on write failure
- Context: `lib/commands/web.js` runs `runCollectionCycle()` every `REFRESH_MS`; errors are logged but the interval continues
- Concern: If `dashboard.json` write fails (ENOSPC, permissions), the web UI keeps serving a stale file while the loop fails silently each tick. There's no surfaced signal to the user that the data is frozen.
- Why deferred: The existing atomic-write (`.dashboard.json.tmp` + `rename`) prevents partial files; graceful degradation (stale last-known-good) is arguably the correct UX. Surfacing the stale state to the UI is a UX decision, not a clear fix.

**[OBS-4]** — `package.json` version (`0.1.6`) drifted from Aitri pipeline version (`0.1.82`)
- Context: `package.json:3` reports `0.1.6`; `.aitri.aitriVersion` is `0.1.82`
- Concern: Two independent version lanes — one for the Hub product, one for the pipeline tool it was built with. Not wrong, but a reader expecting parity may be confused. Could be documented in README.
- Why deferred: Intentional decoupling; no behavior impact.

---

## Summary

- **3 bugs** (1 high, 2 medium): all in the web-server surface and Docker deploy gate.
- **4 backlog items**: path-traversal hardening, env validation, lint gate, alerts refactor.
- **4 observations**: intentional quirks or non-actionable trade-offs.

**Security posture:** BUG-1 is the material risk. Everything else is local-trust or hardening. Recommend fixing BUG-1 + BUG-2 together — single targeted change to `lib/commands/web.js` (bind to `127.0.0.1`, add body-size cap).

**Next:** run `aitri audit plan` to classify these findings into Aitri-tracked bugs / backlog entries.
