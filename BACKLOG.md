# Aitri Hub — Backlog

> Open items only. Closed items go in CHANGELOG.md.
> Priority: P1 (critical) / P2 (important) / P3 (nice to have)

---

## Open

- [ ] P2 — **Self-managed project registry** — Since Aitri v0.1.64, `aitri init` no longer auto-registers projects in Hub. New users won't know they need to run `aitri-hub setup` manually.

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

- [ ] P3 — **GitHub remote project polling** — Hub monitors local projects via filesystem poll every 5s. Remote projects (GitHub repos) have no equivalent live monitoring mechanism.

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

---

## Integration Contract

Hub reads `.aitri` schema per the canonical contract:
[`docs/integrations/SCHEMA.md`](https://github.com/cesareyeserrano/aitri/blob/main/docs/integrations/SCHEMA.md)

Update Hub's `aitri-reader.js` whenever the Aitri contract changelog (`docs/integrations/CHANGELOG.md`) records a breaking change.
