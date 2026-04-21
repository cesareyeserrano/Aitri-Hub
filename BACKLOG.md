# Aitri Hub — Backlog

> Open items only. Closed items go in CHANGELOG.md.
> Priority: P1 (critical) / P2 (important) / P3 (nice to have)

> **Posture note (feature `hub-web-only`, 2026-04-21):** Aitri Hub is a **web-only** tool.
> The `init`, `setup`, and `monitor` CLI commands have been removed. All project registration
> happens in the browser at `/admin`. Historical backlog entries below may mention those
> removed commands — read them as history, not as current interfaces.

---

## Open

- [x] P2 — **External signals contract (`spec/06_EXTERNAL_SIGNALS.json`)** *(implemented)* — Hub can't run static analysis, security scans, or dependency audits directly. External tools (ESLint, npm audit, GitLeaks, Snyk, etc.) should be able to write their findings into a standardized file that Hub reads and surfaces as alerts.

  Schema proposal:
  ```json
  {
    "generatedAt": "ISO8601",
    "signals": [
      {
        "tool": "eslint",
        "type": "code-quality",
        "severity": "warning",
        "message": "15 lint errors in src/",
        "command": "npm run lint"
      }
    ]
  }
  ```

  Files:
  - `lib/collector/external-signals-reader.js` — reads `spec/06_EXTERNAL_SIGNALS.json`, validates schema, returns signals[]
  - `lib/alerts/engine.js` — pass signals through as-is into the alerts array (tool owns severity)
  - `docs/integrations/ARTIFACTS.md` — document schema for tool authors

  Decisions:
  - Hub never knows about specific tools — it just reads signals and passes them through
  - `severity` in the file maps to Hub's BLOCKING/WARNING/INFO
  - File is optional — if absent, no signals (no crash)
  - Tools write this file; it is NOT written by Aitri Core

  Acceptance:
  - Write a `spec/06_EXTERNAL_SIGNALS.json` manually with 1 warning → appears in Hub alerts tab
  - File absent → no alert, no crash
  - Invalid JSON → no alert, no crash

- [x] P2 — **Self-managed project registry** *(implemented)* — Since Aitri v0.1.64, `aitri init` no longer auto-registers projects in Hub. New users won't know they need to run `aitri-hub setup` manually.

  Problem: First-time Hub users initialize an Aitri project and expect it to appear in Hub automatically. It no longer does. Without clear onboarding guidance, Hub appears broken.

  Files:
  - `lib/commands/init.js` — update welcome message to direct users to `aitri-hub setup`
  - `lib/commands/setup.js` — add optional `scan` flow: walk a directory tree, find `.aitri` files, offer to register each one
  - `README.md` — already updated (v0.1.64); verify setup instructions are prominent enough

  Behavior:
  - `aitri-hub setup` remains the canonical registration path (unchanged)
  - New: `aitri-hub setup --scan <dir>` walks `<dir>` recursively, finds directories with `.aitri`, lists them, and lets user select which to register
  - `aitri-hub init` (first-run wizard) mentions that projects must be registered via `setup`
  - No changes to `aitri-reader.js` — reader is already correct

  Decisions:
  - Hub owns `~/.aitri-hub/projects.json` entirely. Aitri Core does not touch it.
  - No auto-discovery on monitor startup — explicit registration keeps the registry clean.

  Acceptance:
  - `aitri init` on a new project does NOT add an entry to `~/.aitri-hub/projects.json`
  - `aitri-hub setup --scan ~/projects` finds all Aitri projects and offers to register them
  - `aitri-hub monitor` shows registered projects correctly

- [x] P3 — **GitHub remote project polling** *(implemented)* — Hub monitors local projects via filesystem poll every 5s. Remote projects (GitHub repos) have no equivalent live monitoring mechanism.

  Problem: Teams working on separate machines use GitHub as the shared source. Hub can register remote projects but cannot detect when the pipeline advances (new approval, drift, etc.) without a manual refresh.

  Files:
  - `lib/collector/aitri-reader.js` — add GitHub fetch path: for `type: "remote"` projects, fetch `.aitri` from `raw.githubusercontent.com/<owner>/<repo>/main/.aitri`; compare `updatedAt` with cached value; if changed, re-fetch relevant artifact files
  - `lib/store/dashboard.js` — cache `updatedAt` per remote project between poll cycles
  - `lib/commands/monitor.js` — use longer poll interval for remote projects (configurable via `AITRI_HUB_REMOTE_REFRESH_MS`, default 60000ms)
  - `lib/constants.js` — add `REMOTE_REFRESH_MS = 60000`

  Behavior:
  - Local projects: unchanged (filesystem poll, `AITRI_HUB_REFRESH_MS` = 5s default)
  - Remote projects: poll GitHub raw content every `AITRI_HUB_REMOTE_REFRESH_MS` (default 60s)
  - Change detected when `updatedAt` in fetched `.aitri` differs from cached value
  - On change: re-fetch `.aitri` + any artifacts needed for alerts (test results, compliance)
  - GitHub rate limit hit (429): back off to 5-minute interval, show warning in dashboard; do not crash
  - Only public repos supported (no OAuth, no token) in this version

  Decisions:
  - Use GitHub raw content (`raw.githubusercontent.com`) — same approach as Aitri Graph. No API token required for public repos.
  - Try `main` branch first, fall back to `master` (same as Graph's `resolveBranch`)
  - Artifact schema contract: `docs/integrations/SCHEMA.md` in Aitri repo

  Acceptance:
  - Register a public GitHub Aitri project in Hub
  - Push an `aitri approve 1` commit to the repo
  - Within 2 poll cycles (≤2 min), Hub's monitor reflects the updated phase state
  - GitHub 429 response: Hub shows a warning but does not crash or remove the project

- [ ] P2 — **CLI upstream version check (`cliUpdateAlert`)** — Hub currently has no way to tell a user that their installed Aitri CLI is behind the latest published version. Only the author notices new releases; every other user silently stays on whatever version they first installed.

  Problem: Hub's existing `VERSION_MISMATCH` rule ([lib/alerts/engine.js:175-191](lib/alerts/engine.js#L175-L191)) compares `project.aitriVersion` (baked into `.aitri` at init) vs the locally installed `aitri --version`. It answers "was this project initialized with an older CLI than I have installed?" — a per-project question. It does NOT answer "is my installed CLI itself outdated compared to the latest published Aitri?". A user can have all projects "in sync with my CLI" while their CLI is N versions behind `main`.

  The existing `integrationAlert` ([lib/collector/integration-guard.js](lib/collector/integration-guard.js)) is a different axis: it warns Hub developers when the installed Aitri exceeds what Hub has reviewed. It does not cover "user's CLI is stale".

  Design (validated with the author 2026-04-21):

  - Add a **dashboard-level** alert (not per-project) alongside `integrationAlert`.
  - Compare `detectAitriVersion()` (already computed once per cycle in `collectAll`) against the `version` field of `package.json` fetched from the Aitri repo on GitHub.
  - Emit `cliUpdateAlert` only when `detected < upstream`. Never when equal or ahead.
  - Failure-silent on any fetch error (offline, 404, 429, timeout) — missing the alert is acceptable; crashing is not.

  Files:
  - `lib/collector/upstream-version-reader.js` *(new)* — fetches `package.json` from configurable upstream URL, parses `.version`, TTL-caches in memory. Reuses `httpsGet` pattern from [lib/collector/github-poller.js](lib/collector/github-poller.js).
  - `lib/collector/upstream-guard.js` *(new)* — pure function `evaluateUpstreamAlert(detectedVersion, upstreamVersion) → alert | null`. Reuses `semverGt`-style compare.
  - `lib/collector/index.js` — in `collectAll`, invoke reader + guard, embed result as `cliUpdateAlert` at dashboard level (next to `integrationAlert`); add `meta.latestAitriVersion` alongside `meta.detectedAitriVersion`.
  - `lib/constants.js` — add:
    - `UPSTREAM_URL_DEFAULT = 'https://raw.githubusercontent.com/cesareyeserrano/Aitri/main/package.json'`
    - `UPSTREAM_URL_FALLBACK = 'https://raw.githubusercontent.com/cesareyeserrano/Aitri/master/package.json'`
    - `UPSTREAM_REFRESH_MS = parseInt(process.env.AITRI_HUB_UPSTREAM_REFRESH_MS ?? '21600000', 10)` *(6 hours)*
    - Env override `AITRI_HUB_UPSTREAM_URL` respected by the reader.
    - New alert type in `ALERT_TYPE`: `CLI_OUTDATED: 'cli-outdated'` *(reserved; may also live only in the dashboard payload without an engine-side entry — decide in Phase 2)*.
  - `tests/unit/upstream-guard.test.js` *(new)* — pure cases: detected < upstream → alert; detected ≥ upstream → null; either null → null.
  - `tests/unit/upstream-version-reader.test.js` *(new)* — stub `https.get`: success, 404, 429, timeout, invalid JSON, missing `version` field. Verify TTL cache prevents re-fetch inside window.
  - `tests/unit/collector-index.test.js` *(update if exists)* — assert `meta.latestAitriVersion` and `cliUpdateAlert` fields appear in dashboard payload.
  - `README.md` — document `AITRI_HUB_UPSTREAM_URL` and `AITRI_HUB_UPSTREAM_REFRESH_MS` env vars.
  - `STYLE_GUIDE.md` — specify rendering of dashboard-level alert banner if not already covered by `integrationAlert` rendering.

  Behavior:
  - Dashboard refresh cycle: reader consults its TTL cache; only hits the network if `Date.now() - lastFetch > UPSTREAM_REFRESH_MS` (default 6h). Poll cycle is unaffected (~5s for local, ~60s for remote).
  - Fetch attempt order: `UPSTREAM_URL_DEFAULT` → on 404 only, fall back to `UPSTREAM_URL_FALLBACK`. On any other failure (timeout, 429, network), set cache to `null` for the full TTL — do NOT retry per cycle.
  - Env override: if `AITRI_HUB_UPSTREAM_URL` is set, it REPLACES the default and disables the fallback (user-controlled URL assumed correct).
  - Severity: `info` if only patch behind; `warning` if minor or major behind. Reasoning: patch-level lag shouldn't nag; minor+ lag indicates material drift worth surfacing.
  - Message shape: `Aitri v<upstream> available (installed: v<detected>)` — action: `git pull && npm i -g .` from the Aitri repo.
  - When `detectAitriVersion()` returns null (CLI not installed): skip the check entirely — existing `integrationAlert` already handles that case.

  Decisions:
  - **Upstream source = raw `package.json` on `main`.** Not GitHub Releases API (60/hr unauth rate limit, requires disciplined release tagging). Not npm (Aitri is not published there). Not a custom domain (overkill).
  - **TTL 6h** balances freshness vs rate limit concern — the poll cycle runs every 5s, so without a TTL this would be thousands of requests/day.
  - **Failure-silent.** Dropping the feature on fetch error returns Hub to the current state — no regression, no crash.
  - **Additive to dashboard schema.** `SCHEMA_VERSION` does NOT bump. New fields are optional; existing consumers ignore them.
  - **Does not replace `VERSION_MISMATCH` per-project rule** — both coexist; they answer different questions (see Problem section).
  - **No changes to Aitri Core.** This is 100% Hub-internal — Aitri's `.aitri` schema, artifact contracts, and `docs/integrations/` are untouched. Confirmed against Aitri's integration maintenance rule: no artifact schema change, no `.aitri` schema change, no new surface from Aitri.
  - **Optional follow-up (NOT in scope of this feature):** add a convention rule #7 to Aitri `docs/integrations/README.md` recommending this pattern for all subproducts (Graph, future tools). Defer until Hub's implementation is proven.

  Risks & mitigations:
  - GitHub URL may change (owner rename, repo rename, branch rename). Mitigated by: (a) constant + env override, (b) main→master fallback chain, (c) failure-silent mode returns Hub to pre-feature state. Publishing to npm or owning a domain is out of scope — the failure mode is non-destructive.
  - Pre-release tags (`0.1.85-beta.1`) not handled by the numeric semver compare. Same limitation as existing `integration-guard.js::semverGt`. Accept as known debt — consistent with existing code.

  Acceptance:
  - Installed Aitri v0.1.70, upstream `main/package.json` reports 0.1.84 → dashboard shows `cliUpdateAlert` with severity `warning`, message references both versions.
  - Installed Aitri v0.1.84, upstream reports 0.1.84 → no alert, `meta.latestAitriVersion = "0.1.84"`.
  - Installed Aitri v0.1.85, upstream reports 0.1.84 → no alert (ahead of upstream is fine).
  - Hub offline → no alert, no crash, dashboard renders normally.
  - Upstream returns 429 → no alert for full TTL window, no retry storm.
  - Env `AITRI_HUB_UPSTREAM_URL` set to a custom URL → reader hits that URL exclusively, skips fallback.
  - `detectAitriVersion()` returns null → no `cliUpdateAlert` emitted.

  Implementation notes:
  - Follow Hub's AGENTS.md: run `aitri feature init cli-upstream-check` in the Hub repo and drive Phases 1-5 through the pipeline.
  - Do NOT modify this backlog entry during implementation — use the feature's own artifacts. Mark as `[x] *(implemented)*` only after Phase 5 approval and move content to CHANGELOG.md.
  - Author verification (2026-04-21): no changes required to Aitri Core repo at `/Users/cesareyeserrano/Documents/PROJECTS/AITRI`.

---

## Integration Contract

Hub reads `.aitri` schema per the canonical contract:
[`docs/integrations/SCHEMA.md`](https://github.com/cesareyeserrano/aitri/blob/main/docs/integrations/SCHEMA.md)

Update Hub's `aitri-reader.js` whenever the Aitri contract changelog (`docs/integrations/CHANGELOG.md`) records a breaking change.
