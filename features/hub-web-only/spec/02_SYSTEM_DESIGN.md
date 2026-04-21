# System Architecture — hub-web-only

## Executive Summary

This feature is **reductive**: its architecture is defined by what is removed, not by what is added. No new modules, no new endpoints, no new dependencies. The post-feature system is a strict subset of today's:

```
                     ┌──────────────────────────────────────────────┐
                     │  bin/aitri-hub.js                            │
                     │  (CLI dispatcher — 4 recognised inputs)      │
                     └────────────────┬─────────────────────────────┘
                                      │ argv[2]
                    ┌─────────────────┴──────────────────┐
                    │                                    │
                    ▼                                    ▼
        ┌────────────────────┐              ┌──────────────────────┐
        │ cmdWeb             │              │ cmdIntegrationReview │
        │ lib/commands/web   │              │ lib/commands/…       │
        └────────────────────┘              └──────────────────────┘
```

**Everything else in `lib/commands/` is deleted** — `init.js`, `setup.js`, `monitor.js` and any stub scaffolding. The rest of the system (`lib/collector/*`, `lib/alerts/*`, `lib/store/*`, `web/src/*`, the `/api/projects` routes inside `cmdWeb`) is already correct for a web-only product and is **explicitly out of scope** for this feature (see no_go_zone in 01_REQUIREMENTS.json).

**Technology decisions (unchanged from the parent project):**

| Layer | Technology | Version | Reason |
|---|---|---|---|
| CLI runtime | Node.js (ESM, zero npm deps) | ≥18.0.0 | Inherited from parent project — zero-dependency invariant preserved |
| HTTP server | `node:http` (built-in) | built-in | Already chosen by the parent feature `hub-mvp-web`; this feature does not touch it |
| Web frontend | React | 18.3.x | Already present in `web/` — no change |
| Bundler | Vite | 5.x | Already present — no change |
| Persistence | Local JSON files in `~/.aitri-hub/` | — | No format change; see no_go_zone |

**New dependencies introduced:** zero. **New files created:** zero (only the feature's own `spec/` artifacts). **Files deleted:** three source modules + two test files. **Files edited:** `bin/aitri-hub.js`, `web/src/components/OverviewTab.jsx`, `README.md`, `DEPLOYMENT.md`, `IDEA.md`, `BACKLOG.md`.

## System Architecture

### Post-feature component map

```
┌────────────────────────────────────────────────────────────────────────────┐
│                     HOST MACHINE (localhost only)                          │
│                                                                            │
│  ┌──────────────────────────┐                                              │
│  │  bin/aitri-hub.js        │  argv parser + subcommand router            │
│  │  ─────────────────────   │  Inputs: `web`, `integration review <ver>`, │
│  │  USAGE constant          │          `help`/`--help`/`-h`,              │
│  │  switch(subcommand)      │          `version`/`--version`              │
│  │                          │  Default branch: stderr "Unknown command",  │
│  │                          │  process.exitCode = 1                       │
│  └───────────┬──────────────┘                                              │
│              │                                                             │
│              ├──── `web` ────────────────────────────────────┐            │
│              │                                                │            │
│              └──── `integration review` ──┐                   │            │
│                                           │                   │            │
│  ┌────────────────────────────────────┐  │  ┌────────────────▼─────────┐ │
│  │  lib/commands/integration-review   │  │  │  lib/commands/web        │ │
│  │  (UNCHANGED by this feature)       │  │  │  (UNCHANGED by this      │ │
│  │  — reads CHANGELOG, writes         │  │  │   feature except empty   │ │
│  │    ~/.aitri-hub/integration-       │  │  │   state is now handled   │ │
│  │    compat.json                     │  │  │   upstream in React)     │ │
│  └────────────────────────────────────┘  │  │                          │ │
│                                           │  │  • http.createServer     │ │
│                                           │  │  • collector loop        │ │
│                                           │  │  • GET/POST/PUT/DELETE   │ │
│                                           │  │    /api/projects         │ │
│                                           │  │  • GET /data/*           │ │
│                                           │  │  • GET /health           │ │
│                                           │  │  • SPA fallback          │ │
│                                           │  └──────────┬───────────────┘ │
│                                           │             │                 │
│  ┌────────────────────────────────────┐  │             │  serves         │
│  │  ~/.aitri-hub/                     │◀─┘             ▼                 │
│  │  ├── projects.json    (unchanged)  │     ┌──────────────────────┐    │
│  │  ├── dashboard.json   (unchanged)  │◀────│ docker/web-dist/     │    │
│  │  ├── integration-compat.json       │     │ (built React SPA —   │    │
│  │  ├── cache/           (unchanged)  │     │  empty-state edited  │    │
│  │  └── logs/aitri-hub.log            │     │  in OverviewTab.jsx) │    │
│  └────────────────────────────────────┘     └──────────────────────┘    │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Components (post-feature)

| # | Component | Responsibility | Change in this feature |
|---|---|---|---|
| C1 | `bin/aitri-hub.js` | Parse `process.argv`, route to a command module, emit `Unknown command` for unknown inputs | **Edited** — imports reduced from 5 to 2 (`cmdWeb`, `cmdIntegrationReview`); `USAGE` constant rewritten; `switch` cases for `init`/`setup`/`monitor` removed; default branch unchanged |
| C2 | `lib/commands/init.js` | — | **Deleted** |
| C3 | `lib/commands/setup.js` | — | **Deleted** |
| C4 | `lib/commands/monitor.js` | — | **Deleted** |
| C5 | `lib/commands/web.js` | Start HTTP server + collector loop; serve SPA + `/api/projects` + `/data/*` + `/health` | **Unchanged** (verified by tests passing with zero edits to this file) |
| C6 | `lib/commands/integration-review.js` | Record CHANGELOG review into `integration-compat.json` | **Unchanged** |
| C7 | `lib/collector/*`, `lib/alerts/*`, `lib/store/*`, `lib/utils/scan.js` | Data collection, alert evaluation, project registry I/O | **Unchanged** — `scan.js` is still used by `cmdWeb` for the `AITRI_HUB_SCAN_DIR` env-var path |
| C8 | `web/src/components/OverviewTab.jsx` (lines 216-225) | Render empty-state when `projects.length === 0` | **Edited** — CLI-instruction text replaced with `/admin` CTA per UX spec |
| C9 | `web/src/styles.css` | Token and layout styles | **Possibly edited** — only if the empty-state panel requires new style rules that cannot be expressed with existing tokens (see UX spec "Design Tokens") |
| C10 | `tests/unit/monitor-stub.test.js`, `tests/integration/setup.test.js` | — | **Deleted** |
| C11 | `README.md`, `DEPLOYMENT.md`, `IDEA.md`, `BACKLOG.md` | User-facing documentation | **Rewritten** per FR-004 |

## Data Model

This feature **writes no new data and reads no new data**. It is strictly about code and documentation. For completeness, the on-disk schema of the files it depends on (all unchanged):

### `~/.aitri-hub/projects.json` (read-path for FR-005)

Produced historically by the now-deleted `init.js` wizard and `setup.js`; also written by the `/api/projects` POST/PUT/DELETE routes in `cmdWeb` (unchanged). The post-feature read path in `lib/store/projects.js` must accept both legacy and current shapes.

```jsonc
{
  "version": 1,                      // legacy field — optional; read code must tolerate absence
  "defaultInterface": "cli" | "web", // LEGACY ONLY — written by the deleted init.js wizard;
                                     // the post-feature code MUST NOT read this field. It is
                                     // not surfaced in any UI. Presence is silently ignored.
  "scanDirs": ["/abs/path", ...],    // optional — written by `/api/projects` scan flows
  "projects": [
    {
      "id": "sha1-of-location",      // stable identifier
      "name": "display name",
      "type": "local" | "remote" | "folder",
      "location": "/abs/path or https://github.com/...",
      "addedAt": "ISO8601"
    }
  ]
}
```

**Compatibility guarantee (FR-005 / AC-009):** a `projects.json` produced by any released version of the deleted wizard (v0.1.x) must be readable by the post-feature server with zero code changes in `lib/store/projects.js`. The current read path (`readProjects()`) already returns `{ projects: [...] }` and ignores extra fields — verified by inspection.

### `~/.aitri-hub/dashboard.json`

Unchanged. Written by the collector loop in `cmdWeb`.

### `~/.aitri-hub/integration-compat.json`

Unchanged. Written by `cmdIntegrationReview`.

## API Design

### Internal Node module API (post-feature `bin/aitri-hub.js`)

The dispatcher module owns two named imports and one internal constant.

```js
// bin/aitri-hub.js (post-feature)

import { cmdWeb } from '../lib/commands/web.js';
import { cmdIntegrationReview } from '../lib/commands/integration-review.js';

const USAGE = `
Aitri Hub — Local web dashboard for Aitri-managed projects.

Usage:
  aitri-hub web                               Start the dashboard at http://localhost:3000
  aitri-hub integration review <version>      Record an Aitri CHANGELOG review
  aitri-hub help                              Show this message
  aitri-hub --version                         Print version and exit

Data lives in ~/.aitri-hub/. See README.md for details.
`;

async function main() { /* switch on subcommand; default → Unknown command + exit 1 */ }
```

**Recognised subcommand tokens** (string equality, no aliases beyond those listed):

| Input token | Action | Exit code |
|---|---|---|
| *(none)*, `help`, `--help`, `-h` | Print `USAGE` to stdout | 0 |
| `--version`, `version` | Print `pkg.version` to stdout | 0 |
| `web` | Call `await cmdWeb()`; handler manages its own exit | 0 on SIGINT |
| `integration`, with `rest[0] === 'review'` | Call `await cmdIntegrationReview(rest.slice(1))`; use returned code | 0-4 per EXIT enum |
| `integration`, any other shape | stderr "Unknown 'integration' action: ..." | 1 |
| *anything else* | stderr `Unknown command: '<name>'. Run 'aitri-hub help' for usage.` | 1 |

**Exported function signatures (unchanged from today):**

```js
// lib/commands/web.js
export async function cmdWeb(): Promise<void>;

// lib/commands/integration-review.js
export async function cmdIntegrationReview(rest: string[]): Promise<number>;
export const EXIT: Readonly<{ OK:0, USAGE:1, INVALID_VERSION:2, CHANGELOG_NOT_FOUND:3, SECTION_NOT_FOUND:4 }>;
```

### HTTP API (served by `cmdWeb` — unchanged by this feature)

Documented here for traceability to FR-006 ("admin UI is the only registration surface"). No route is added, removed, or modified.

| Method | Path | Purpose | Localhost-only? | Response |
|---|---|---|---|---|
| GET  | `/health` | liveness | no | 200 `ok\n` |
| GET  | `/data/:file` | serve dashboard.json, etc. from `~/.aitri-hub/` | no | 200 JSON / empty dashboard shape / 404 |
| GET  | `/api/projects` | list | **yes** | 200 `{ projects: [...] }` |
| POST | `/api/projects` | create | **yes** | 201 `{ project }` / 400 errors |
| PUT  | `/api/projects/:id` | edit | **yes** | 200 `{ project }` / 400 / 404 |
| DELETE | `/api/projects/:id` | remove | **yes** | 204 / 404 |
| *(SPA fallback)* | any other GET | serve `index.html` | no | 200 HTML |

Non-localhost peers on `/api/projects` receive 403 — preserved per NFR-005.

## Security Design

| Surface | Threat | Control | Unchanged? |
|---|---|---|---|
| HTTP server bind | LAN exposure | `server.listen(port, '127.0.0.1')` — binds loopback only | Yes |
| `/api/projects` | Cross-origin drive-by | `req.socket.remoteAddress` must be `127.0.0.1` / `::1` / `::ffff:127.0.0.1`; else 403 | Yes |
| `/api/projects` POST/PUT | Path traversal in `location` | `validateLocation()` rejects `..` and non-absolute paths for non-remote types; `fs.statSync` verifies target | Yes |
| `/data/:file` | Path traversal | `filePath.startsWith(dataDir + path.sep)` guard | Yes |
| All responses | Clickjacking | `X-Frame-Options: DENY` | Yes |
| All responses | MIME sniffing | `X-Content-Type-Options: nosniff` | Yes |
| CLI `integration review --changelog <path>` | Symlink escape | Realpath check vs. override dir | Yes |
| Removed CLI wizards | N/A — the commands no longer exist, so their attack surface (readline prompts, interactive user input parsed into paths) is **eliminated** | — | **Improved** — smaller attack surface as a side effect of deletion |

**No new security controls are introduced**; none are weakened. The removal of `init`/`setup`/`monitor` strictly reduces the attack surface. The `/api/projects` controls already provide an equivalent registration surface with stronger input validation (explicit whitelist-style checks in `validateLocation()`).

## Performance & Scalability

| Metric | Pre-feature | Post-feature | Mechanism |
|---|---|---|---|
| `aitri-hub help` latency | ~200ms (import chain loads `init.js` + `setup.js` + `monitor.js`) | ≤50ms (two imports only) | Fewer ESM modules loaded on every CLI invocation — incidental benefit, not an FR |
| Server startup time | unchanged — `cmdWeb` path untouched | unchanged | — |
| Collection-cycle time (NFR-003 / parent NFR-001) | ≤5s for 20 projects | ≤5s for 20 projects | No collector code change |
| Empty-state render | ≤2s (parent FR-006) | ≤2s | React component change is a literal string swap + one extra `<a>` element; no new state, no new fetch |

**No caching layer changes, no rate limiting changes, no query changes.** This feature has no performance work beyond "do not regress".

## Deployment Architecture

### Primary (happy path)

```
Developer machine
  ├── npm install                     (dev dependencies: @playwright/test only)
  ├── npm link          (optional)    (or `npx aitri-hub …`)
  └── aitri-hub web                   ── spawns a single Node.js process
                                          binds 127.0.0.1:3000
                                          collects every AITRI_HUB_REFRESH_MS
                                          terminates on SIGINT
```

No container, no reverse proxy, no systemd unit assumed in the happy path. `package.json` is untouched by this feature.

### Optional (Docker — demoted from primary)

The existing `Dockerfile` / `docker-compose.yml` / `docker/nginx.conf` **remain in the repo** (per no_go_zone) but are moved under an `Optional: Docker deployment` heading in `DEPLOYMENT.md` (FR-004). No code change is needed to keep the Docker path functional — it still serves `docker/web-dist/` through nginx and expects the host to run the collector separately. Documentation will explicitly note this as a legacy / advanced path.

### CI/CD

No change. `npm test` continues to run `node --test` over unit + integration suites plus the Playwright admin-api e2e. This feature's only CI obligation is that the test deletions (monitor-stub, setup integration) leave the suite green.

## Risk Analysis

### ADR-01: Delete command modules vs. keep deprecation stubs

**Context:** `lib/commands/monitor.js` and `setup.js` are already one-line stubs that print a notice and exit 0. We can either delete them (FR-002 as written) or keep them indefinitely as a user-friendly fallback.

- **Option A — Delete the modules and route to the default "Unknown command" branch.** User sees stderr `Unknown command: 'monitor'. Run 'aitri-hub help' for usage.` and exit code 1.
  - Pros: Smallest codebase; no dead files rotting; exit code 1 is the correct signal for a non-existent command; forces docs/CI to reflect reality; FR-001 AC explicitly requires exit ≠ 0.
  - Cons: Loses the helpful "use web instead" hint for muscle-memory users.
- **Option B — Keep the stubs; route to them; they print a friendly redirection message and exit 0.**
  - Pros: Softer migration; `aitri-hub monitor` still "works" in the sense of not erroring.
  - Cons: Contradicts FR-001 AC ("each exit with a non-zero status code"); creates confusing signal for scripts/CI (exit 0 but the command did nothing); leaves dead code in `lib/`; forever-stub debt.

**Decision:** **Option A — delete**. The PM AC in FR-001 is unambiguous. The discoverability of the new surface is handled by the `Unknown command: ... Run 'aitri-hub help' for usage.` message, which is one key press away from the real surface. The trade-off of losing the "friendlier" hint is accepted in the UX spec's Nielsen analysis (H4 trade-off, Flow 2).

**Consequences:** All `lib/commands/{init,setup,monitor}.js` and their test files are deleted. `bin/aitri-hub.js` default branch handles the signal. No stub debt.

### ADR-02: Dispatcher style — preserve imperative `switch` vs. introduce a command table

**Context:** The current `main()` in `bin/aitri-hub.js` uses an imperative `switch(subcommand)`. With only two real commands remaining, a lookup table (`{ web: cmdWeb, 'integration review': cmdIntegrationReview }`) would also work.

- **Option A — Keep the existing `switch` structure, shrinking it by deleting three cases.** Minimal diff; aligns with the "deletions preferred" technology preference.
- **Option B — Refactor to a command table.** Slightly more elegant for this size; but `integration review` is a two-token subcommand which makes a flat table awkward (either special-case `integration` or include `'integration review'` as a multi-word key requiring pre-join).

**Decision:** **Option A — keep the `switch`**. Smaller diff, no behavioral change risk, passes all FR-001 ACs without touching the special two-token `integration review` parsing. The refactor is a valid future improvement but is explicitly out of scope (see no_go_zone: "No new CLI subcommands are introduced").

**Consequences:** The post-feature dispatcher remains in the same style as today. Test surface unchanged.

### ADR-03: Empty-state — inline JSX vs. new `EmptyState` component

**Context:** The current empty-state lives inline in `OverviewTab.jsx` (lines 216-225). The UX spec defines a small panel with title + body + CTA + disclosure.

- **Option A — Keep it inline.** Replace the current two `<p>` elements with the new markup directly in `OverviewTab.jsx`. No new file.
- **Option B — Extract to `web/src/components/EmptyState.jsx`.** Reusable; testable in isolation.

**Decision:** **Option A — inline**. The component is used in exactly one place; extracting it would be premature abstraction against the CLAUDE.md rule ("Three similar lines is better than a premature abstraction"). If a second empty-state appears in a future feature, that is the moment to extract.

**Consequences:** The only file edit in `web/src/components/` is `OverviewTab.jsx`. No new test file for an EmptyState component.

### ADR-04: Handling the `defaultInterface` field in legacy `projects.json`

**Context:** The deleted `init.js` wizard wrote `defaultInterface: "cli" | "web"` into `projects.json`. After this feature lands, the field has no meaning. We must decide what to do when reading a legacy file.

- **Option A — Ignore the field silently in `lib/store/projects.js`.** The read path already returns `{ projects: [...] }` and doesn't expose `defaultInterface` to callers. No code change required.
- **Option B — Migrate on first read: strip the field and rewrite the file.** Guarantees a clean on-disk state going forward.
- **Option C — Surface a warning on the web UI or in stderr.** Tell the user "your config contains an obsolete field".

**Decision:** **Option A — silent ignore, no rewrite**. FR-005 AC explicitly forbids a migration step; NFR-005 (no new CLI noise) and the UX intent of "zero-migration upgrade" both argue against a warning. The field is harmless; on the next `/api/projects` POST/PUT/DELETE cycle, the file is naturally rewritten by `writeProjectsFile()` (which does not include `defaultInterface` in its output), so the stale field disappears organically the first time the user touches the registry.

**Consequences:** `lib/store/projects.js` is untouched (already ignores extra fields). No migration code. No rollback risk.

### ADR-05: Docker assets — delete vs. retain

**Context:** The Docker/nginx path is no longer the primary deployment. Do we keep or delete?

- **Option A — Delete `Dockerfile`, `docker-compose.yml`, `docker/nginx.conf`.** Simpler repo.
- **Option B — Retain the files; downgrade them to an "Optional" section in DEPLOYMENT.md.**

**Decision:** **Option B — retain**. Already established by the no_go_zone in 01_REQUIREMENTS.json ("No removal of Docker assets"). Some users may have wired `docker compose up` into their workflow; a future feature can remove them cleanly if they prove unused. This feature only changes how they are *documented*.

**Consequences:** No file deletion under `docker/`. DEPLOYMENT.md section reshuffled per FR-004.

### Failure Blast Radius

**Component: `bin/aitri-hub.js` dispatcher**
- **Blast radius:** A syntax error or bad import in the dispatcher makes *every* CLI invocation fail — including `aitri-hub web`. No dashboard can start.
- **User impact:** `aitri-hub …` exits with a Node parse error or `ERR_MODULE_NOT_FOUND`. The web UI cannot be launched.
- **Recovery:** Revert the `bin/aitri-hub.js` edit (`git revert`) or install a prior version via `npm install aitri-hub@<previous>`. The `~/.aitri-hub/` data directory is untouched, so recovery is lossless.
- **Mitigation in this feature:** The dispatcher edit is a pure subtraction (remove 3 import lines, remove 3 switch cases, rewrite USAGE string). Tests cover help output and unknown-command behavior (Phase 3 will add). The existing `tests/e2e/admin-api.test.js` smoke-tests `cmdWeb` end-to-end.

**Component: `~/.aitri-hub/projects.json`**
- **Blast radius:** If a legacy file with `defaultInterface` causes the post-feature code to throw on read, the dashboard appears empty and the admin API may 500 on load.
- **User impact:** Dashboard shows "no projects" even though the file contains entries.
- **Recovery:** User re-adds projects via `/admin`; the file is rewritten without the obsolete field. Worst case: user manually deletes `defaultInterface` from the JSON file.
- **Mitigation in this feature:** Phase 3 adds a test case that reads a synthetic legacy `projects.json` (including `defaultInterface: "cli"`) and asserts that `readProjects()` returns all entries unchanged (FR-005 AC-009). Because `lib/store/projects.js` is not modified, this test locks in a regression guard rather than a new guarantee.

**Component: React empty-state (`OverviewTab.jsx`)**
- **Blast radius:** A typo in the JSX change renders a broken component when `projects.length === 0` — the most common state for first-time users.
- **User impact:** First-time user sees a blank screen or a React error overlay instead of the CTA.
- **Recovery:** Revert the OverviewTab edit; ship a patch. No data loss.
- **Mitigation in this feature:** Phase 3 will add a React rendering test (or Playwright e2e) that mounts `OverviewTab` with `projects=[]` and asserts the presence of the `/admin` CTA and the absence of the deprecated CLI strings (FR-003 ACs).

## Technical Risk Flags

[RISK] Muscle-memory regression for existing users running `aitri-hub monitor`
Conflict: FR-001 AC requires `aitri-hub monitor` to exit non-zero with "Unknown command". This is a deliberate break from the current stub behavior (exit 0 with a friendly redirect in `lib/commands/monitor.js:15-20`).
Mitigation: The "Unknown command" message names the exact next step (`Run 'aitri-hub help' for usage.`). The README rewrite (FR-004) includes a short "Migrating from v0.1.x" callout documenting the removed commands. The Nielsen trade-off is accepted in the UX spec.
Severity: **low** — user can recover in one command; no data loss; no silent corruption.

[RISK] `projects.json` written by a very old wizard has a malformed shape
Conflict: FR-005 requires zero migration. If any released version of `init.js` ever wrote a `projects.json` with `projects` as an object instead of an array (it did not, per inspection of git history on `lib/commands/init.js`), the read path would fail.
Mitigation: `lib/store/projects.js` already normalises to `{ projects: Array.isArray(...) ? ... : [] }`. The feature adds a Phase 3 regression test covering the legacy shape (`{ version, defaultInterface, projects: [...] }`). No code change required.
Severity: **low** — defensive code already present; test adds a guard.

[RISK] Documentation rewrite inconsistency — docs may still contain residual CLI references after the edit pass
Conflict: FR-004 AC-008 requires `grep -nE 'aitri-hub (monitor|setup|init)' README.md DEPLOYMENT.md IDEA.md` to return zero matches. If the implementer misses a reference, the AC fails.
Mitigation: Phase 3 test cases include an explicit `grep` assertion over those three files; Phase 4 implementation must run the same grep before marking the task done. CI gate is cheap (a one-line shell command).
Severity: **low** — mechanical check; fast feedback loop.

[RISK] Orphaned test fixtures or imports referencing deleted modules
Conflict: FR-002 requires `npm test` to pass after deletion. Other tests may import from `lib/commands/monitor.js` or reference the deleted files transitively.
Mitigation: Phase 4 implementation must run `grep -r "from '.*commands/(init|setup|monitor)" tests lib web` and remove any stragglers before completing. Phase 3 will add this as a hard-gate test case.
Severity: **low** — fully mechanical; caught by `node --test` on the first run.

None of the flags are severity medium or higher. The stack is otherwise fully compatible with all FRs and NFRs: Node ≥18 ESM runtime handles string comparisons and file reads (FR-001, FR-005) trivially; React 18 handles the empty-state DOM mutation (FR-003); Markdown text edits (FR-004) have no runtime dimension.

---

## Traceability Checklist

- [x] Every FR-* in 01_REQUIREMENTS.json is addressed:
  - FR-001 (single CLI surface) → C1 dispatcher edit + USAGE constant (see API Design § Internal Node module API)
  - FR-002 (delete modules + tests) → C2/C3/C4/C10 deletions; Risk Flag 4 enforces cleanup
  - FR-003 (empty-state) → C8 edit; ADR-03; UX spec copy is the contract
  - FR-004 (docs rewrite) → C11 edits; Risk Flag 3 enforces the grep check
  - FR-005 (zero-migration) → Data Model § `projects.json`; ADR-04; Blast Radius § 2
  - FR-006 (admin UI is canonical) → API Design § HTTP API; all routes unchanged
- [x] Every NFR-* has a corresponding design decision:
  - NFR-001 (≤60s onboarding) → Deployment Architecture § Primary (single command)
  - NFR-002 (no stdin blocking) → `cmdWeb` unchanged; existing `server.listen` has no stdin dependency
  - NFR-003 (perf no regression) → Performance & Scalability § Metrics table
  - NFR-004 (observability) → `cmdWeb`'s `logRequest()` unchanged
  - NFR-005 (localhost guard) → Security Design § `/api/projects`
- [x] Every ADR (5 total) has ≥2 options
- [x] no_go_zone items from Phase 1 are not present:
  - Integration review NOT moved to web → confirmed (C6 unchanged)
  - Docker assets NOT removed → confirmed (ADR-05 retain)
  - No auth / remote exposure → confirmed (Security Design unchanged)
  - No projects.json format change → confirmed (Data Model, ADR-04)
  - No collector / alerts / admin-API code change → confirmed (Component table)
  - No `docker/web-dist/` rename → confirmed (Deployment Architecture)
  - No new subcommands → confirmed (API Design § recognised tokens — 2 handlers only)
- [x] Failure blast radius documented for 3 critical components (dispatcher, projects.json, empty-state React)
- [x] Technical Risk Flags section complete (4 flags, all severity low)

---

```
─── Phase 2 Complete — System Architecture ───────────────────
Stack:      Node.js ≥18 (ESM, zero deps) · React 18.3 · node:http · local JSON files
            [no new dependencies; stack is strict subset of parent project's]

ADRs (5 decisions):
  - Delete command modules vs. keep stubs                → Delete (Option A)
  - Dispatcher style — switch vs. command table         → Keep switch (Option A)
  - Empty-state — inline JSX vs. new component          → Inline (Option A)
  - Legacy `defaultInterface` field handling            → Silent ignore (Option A)
  - Docker assets — delete vs. retain                   → Retain + demote in docs (Option B)

Data model:  0 new entities — existing projects.json / dashboard.json / integration-compat.json unchanged
API:         2 CLI handlers (cmdWeb, cmdIntegrationReview); 7 HTTP routes (all pre-existing, unchanged)
Security:    Loopback-only bind · /api/projects localhost guard · path-traversal guards
             All controls preserved from parent; CLI attack surface strictly reduced

Technical Risk Flags: 4 flags — all severity low
  - Muscle-memory regression on `aitri-hub monitor`      — severity: low
  - Malformed legacy projects.json (hypothetical)        — severity: low
  - Residual CLI references in docs after rewrite         — severity: low
  - Orphaned test imports of deleted modules              — severity: low

Top risks:
  - None rated medium or higher. The feature is a subtraction against a working product;
    blast radius is bounded by `git revert` + single-version rollback.
──────────────────────────────────────────────────────────────
Next: aitri complete 2   →   aitri approve 2
```
