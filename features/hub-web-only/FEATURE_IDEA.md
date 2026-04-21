## Feature
Collapse Aitri Hub to a single web-only surface: the `aitri-hub web` command becomes the only supported entry point, and all project management moves to the localhost admin panel.

## Problem / Why
Hub was originally designed with two surfaces (CLI terminal dashboard + web dashboard) and several CLI subcommands (`init`, `setup`, `monitor`, `integration review`). Over the last releases the web dashboard grew a full admin API (`/api/projects` CRUD, folder scan, integration review UI), and the CLI `monitor` and `setup` were reduced to deprecation stubs (`lib/commands/monitor.js`, `lib/commands/setup.js`). The product is effectively web-only already, but the codebase, requirements, and documentation still describe a dual-surface tool. Users who read the README or run `aitri-hub help` see obsolete CLI commands; the first-run wizard (`lib/commands/init.js`) still asks them to choose between "CLI" and "web" interface; the IDEA and DEPLOYMENT docs still treat Docker + nginx as the primary web deployment even though `cmdWeb` now embeds a Node http server. This feature aligns the artifacts with the actual product direction: **Hub is only the localhost web app**.

## Target Users
Existing Hub users (solo devs and team leads monitoring multiple Aitri projects locally). Same users as today — no new user type. The goal is to make onboarding simpler (one command) and remove the drift between docs and behavior.

## New Behavior
- The system must expose a single CLI binary whose only runnable subcommand is `aitri-hub web` (plus `help` and `--version`).
- The system must remove the `init`, `setup`, and `monitor` subcommands entirely — including their deprecation stubs, their tests, and all references in help text.
- The system must register, update, scan, and remove projects exclusively through the localhost admin UI at `/admin` (backed by the existing `/api/projects` endpoints in `lib/commands/web.js`).
- The system must, on first launch of `aitri-hub web` with an empty registry, present an empty-state UI in the browser that guides the user to add their first project via `/admin` — no terminal wizard, no interactive prompts.
- The system must keep `aitri-hub integration review <version>` as a CLI subcommand for now (out of scope of this feature — tracked separately).
- Documentation (`README.md`, `DEPLOYMENT.md`, `IDEA.md`, env-var tables) must describe Hub as a web-only localhost tool: one install step (`npm install`), one run step (`aitri-hub web`), no Docker requirement in the happy path.
- The parent `IDEA.md` Business Rules and Success Criteria must be rewritten so they no longer reference `aitri-hub monitor` or a CLI dashboard mode.
- The React empty-state in `web/src/components/OverviewTab.jsx` (currently instructing users to run `aitri-hub setup` and `aitri-hub monitor`) must instead point to `/admin`.
- Docker assets (`Dockerfile`, `docker-compose.yml`, `docker/nginx.conf`) are out of the happy path but may stay in-repo as an optional deployment mode; documentation must clearly mark them optional, not primary.

## Success Criteria
- Given a fresh clone of the repo, when a user runs `npm install && aitri-hub web`, then the browser opens at `http://localhost:3000` with a working empty-state admin UI — without any prior CLI setup step.
- Given a user runs `aitri-hub help`, then the output lists only `web`, `integration review`, `help`, and `--version` — with no mention of `init`, `setup`, or `monitor`.
- Given a user runs `aitri-hub monitor` or `aitri-hub setup` or `aitri-hub init`, then the process exits with a non-zero status and an error like `Unknown command` (not a deprecation notice).
- Given a user reads `README.md`, `DEPLOYMENT.md`, or `IDEA.md`, then there are no references to a "CLI dashboard", `aitri-hub monitor`, or `aitri-hub setup` as active product features.
- Given a user with projects already registered in `~/.aitri-hub/projects.json`, when they upgrade to this version and run `aitri-hub web`, then their existing projects still appear in the dashboard without any migration step.
- Given `npm test` runs on the cleaned-up repo, then no test references the removed `monitor`/`setup`/`init` commands, and the suite passes.

## Out of Scope
- Migrating `aitri-hub integration review` to the web UI (keep as CLI for now; separate feature).
- Removing Docker / nginx assets from the repo (kept as optional deployment; only docs are downgraded).
- Authentication, multi-user support, or exposing the web dashboard beyond `127.0.0.1`.
- Any change to the data format of `~/.aitri-hub/projects.json` or `dashboard.json`.
- Any change to the collector logic (`lib/collector/*`) or alerts engine.
- Renaming `docker/web-dist/` → `web/dist/` (cosmetic; can be a follow-up).
