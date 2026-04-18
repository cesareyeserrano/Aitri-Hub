# System Architecture — snapshot-adoption

## Executive Summary

This feature replaces 5 of Hub's per-project artifact-parsing collectors with a single `snapshot-reader.js` that consumes Aitri Core's canonical `aitri status --json` output (Aitri ≥v0.1.77, ProjectSnapshot v1+). The collector cycle, store, alerts engine, and the 5 unrelated readers (git, app-version, spec-quality, external-signals, feature) remain untouched.

**Stack (unchanged from Hub baseline):**
- Runtime: Node.js ≥18 (ESM, zero npm runtime deps for the collector)
- Spawn: `node:child_process.spawn` (async, with timeout)
- Parse: `JSON.parse` on stdout buffer
- Web: existing React renderer (`web/src/components/ProjectCard.jsx`)
- CLI: existing `aitri-hub monitor` text renderer
- Persistence: existing `~/.aitri-hub/dashboard.json` (atomic write — no schema bump beyond additive fields)
- Logging: existing `~/.aitri-hub/logs/aitri-hub.log` append target

**Significant decisions (full ADRs in Risk Analysis section):**
- ADR-01: Spawn `aitri` once per cycle per project (not a long-lived daemon) — chose spawn for simplicity, no IPC.
- ADR-02: Demote 5 legacy collectors to fallback-only (not delete) — chose demote because FR-017 requires the legacy path on snapshot failure.
- ADR-03: Snapshot timeout = 3000ms with kill — chose hard kill over polling for predictable cycle latency.
- ADR-04: `snapshotVersion >= 1` accept-only check (no enforcement of higher floor) — chose forward-compat over strictness.

---

## System Architecture

```
                       ┌─────────────────────────────────────────────────┐
                       │         lib/collector/index.js                  │
                       │  collectOne(project)                            │
                       │                                                 │
                       │   ┌──────────────────────────────────────────┐ │
                       │   │  if project.type === 'local':            │ │
                       │   │    snapshot = trySnapshot(projectDir)    │ │
                       │   │    if snapshot.ok:                       │ │
                       │   │      project data ← projectFromSnapshot()│ │
                       │   │    else:                                 │ │
                       │   │      project data ← legacyCollect()      │ │
                       │   │      project.degradationReason ← reason  │ │
                       │   └──────────────────────────────────────────┘ │
                       └────────┬─────────────────────────┬──────────────┘
                                │                         │
                                │ snapshot path           │ legacy path (fallback)
                                ▼                         ▼
                ┌────────────────────────────┐    ┌─────────────────────────────┐
                │  snapshot-reader.js (NEW)  │    │  aitri-reader.js            │
                │                            │    │  requirements-reader.js     │
                │  spawn('aitri',            │    │  compliance-reader.js       │
                │        ['status','--json'],│    │  test-reader.js             │
                │        { cwd, timeout:3000})│   │  bugs-reader.js             │
                │                            │    │  (DEMOTED — fallback only)  │
                │  → JSON.parse(stdout)      │    └─────────────────────────────┘
                │  → projectFromSnapshot()   │
                │  → returns { ok, data,     │    ┌─────────────────────────────┐
                │              snapshot,     │    │  Unchanged readers:         │
                │              reason }      │    │   git-reader.js             │
                └────────────────────────────┘    │   app-version-reader.js     │
                                                  │   spec-quality-reader.js    │
                                                  │   external-signals-reader.js│
                                                  │   feature-reader.js         │
                                                  │  (always invoked)           │
                                                  └─────────────────────────────┘

                                ▼
                ┌────────────────────────────────────────┐
                │  Project record (extended fields):     │
                │   aitriState, testSummary,             │
                │   complianceSummary, requirementsSummary│
                │   bugsSummary,                         │
                │   nextActions[], health{}, audit{},    │
                │   normalize{}, lastSession?,           │
                │   degradationReason?                   │
                └────────────────────────────────────────┘
                                ▼
                    ┌──────────────────────────┐         ┌──────────────────────────┐
                    │   Web: ProjectCard.jsx   │         │  CLI: aitri-hub monitor  │
                    │   - NEXT ACTION row      │         │  - same data, plain text │
                    │   - DEPLOY HEALTH section│         │                          │
                    │   - QUALITY indicators   │         │                          │
                    │   - BLOCKERS normalize   │         │                          │
                    │   - lastSession line     │         │                          │
                    │   - degradation warning  │         │                          │
                    └──────────────────────────┘         └──────────────────────────┘
```

**Components and responsibilities:**

| Component | Path | Responsibility |
|---|---|---|
| `snapshot-reader.js` (NEW) | `lib/collector/snapshot-reader.js` | Spawn `aitri status --json`, parse stdout, project to project-record shape. Pure function over the snapshot — no I/O beyond the spawn. |
| `collector/index.js` (MODIFIED) | `lib/collector/index.js` | Orchestrates per-project collection. Adds snapshot-first / legacy-fallback dispatch in `collectOne` for `type === 'local'` projects. Remote projects unchanged. |
| Legacy 5 readers (DEMOTED) | `lib/collector/{aitri,requirements,compliance,test,bugs}-reader.js` | Invoked exclusively by the FR-017 degradation branch. No code changes; only call-sites change. |
| ProjectCard renderer (MODIFIED) | `web/src/components/ProjectCard.jsx` (web), `lib/commands/monitor.js` (CLI) | Adds 5 new render rows/sections per UX spec. |
| `aitri-version-reader.js` (UNCHANGED) | `lib/collector/aitri-version-reader.js` | Pre-existing — used to decide if snapshot path is even attempted. |

---

## Data Model

This feature does not introduce a new persistence schema. It extends the existing in-memory project record (the object returned by `collectOne`) and the existing `dashboard.json` payload with additive fields.

### Snapshot input (read-only — owned by Aitri Core)

```jsonc
// `aitri status --json` output (per docs/integrations/STATUS_JSON.md)
{
  "snapshotVersion": 1,
  "project": "string",
  "dir": "string",
  "aitriVersion": "string|null",
  "phases": [...],         // legacy
  "features": [...],
  "bugs":    { "total": N, "open": N, "blocking": N },
  "backlog": { "open": N },
  "audit":   { "exists": bool, "stalenessDays": N|null },
  "normalize": { "state": "pending|resolved|null", "method": "git|mtime|null", "baseRef": "string|null", "uncountedFiles": N|null },
  "health": {
    "deployable": bool,
    "deployableReasons": [{ "type": "string", "message": "string" }],
    "staleAudit": bool,
    "blockedByBugs": bool,
    "activeFeatures": N,
    "versionMismatch": bool,
    "driftPresent": [...],
    "staleVerify": [{ "scope": "root|feature:<name>", "days": N }]
  },
  "nextActions": [{ "priority": N, "scope": "string", "command": "string", "reason": "string", "severity": "info|warn|critical" }]
}
```

### Project record (extended — written to `dashboard.json` per project)

Only NEW or RENAMED-USE fields shown. Pre-existing fields (`gitMeta`, `appVersion`, `specQuality`, `externalSignals`, `featurePipelines`, `aggregatedTcTotal`, `cacheStale`, `rateLimited`, `collectionError`, `alerts`, `status`) are unchanged.

```jsonc
{
  // Pre-existing fields populated from snapshot (replaces 5 readers)
  "aitriState":           { /* projected from snapshot.phases[] + .aitri reads */ },
  "testSummary":          { /* projected from snapshot.phases[verify].verifySummary + features */ },
  "complianceSummary":    { /* projected from snapshot.health + nextActions */ },
  "requirementsSummary":  { /* projected from snapshot — counts only; per-FR detail not re-derived */ },
  "bugsSummary":          { /* projected from snapshot.bugs */ },

  // NEW fields exposed to renderer
  "nextActions":          [ /* snapshot.nextActions verbatim */ ],
  "health":               { /* snapshot.health verbatim */ },
  "audit":                { /* snapshot.audit verbatim */ },
  "normalize":            { /* snapshot.normalize verbatim */ },
  "lastSession":          { "event": "string", "agent": "string", "at": "ISO" } | null,

  // NEW field — degradation surface
  "degradationReason":    "not_installed | version_too_old | spawn_failed | parse_failed | timeout" | null,
  "snapshotVersion":      N | null   // null when degraded
}
```

### File constraints

- `dashboard.json` write remains atomic (temp + rename) — pre-existing behavior, unchanged.
- No new files. No new directories. No schema migration needed (additive fields; pre-existing readers of `dashboard.json` ignore unknown fields).

---

## API Design

This feature exposes no HTTP / RPC surface. The contract is internal-module API only. All exports are ES modules.

### `lib/collector/snapshot-reader.js` (NEW)

```js
/**
 * Spawns `aitri status --json` in projectDir and returns a normalized result.
 * No throws — all failures are returned as { ok: false, reason }.
 *
 * @param {string} projectDir   Absolute path to the project directory.
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=3000]  Hard kill if spawn exceeds this duration.
 * @returns {Promise<{ ok: true, snapshot: ProjectSnapshot, durationMs: number }
 *                 | { ok: false, reason: 'not_installed'|'version_too_old'|'spawn_failed'|'parse_failed'|'timeout', detail?: string, durationMs: number }>}
 */
export async function readSnapshot(projectDir, opts);

/**
 * Pure projection from a parsed ProjectSnapshot to the Hub project record shape
 * that the renderer (and existing alerts engine) consumes.
 *
 * @param {ProjectSnapshot} snapshot
 * @returns {{
 *   aitriState: object,
 *   testSummary: object,
 *   complianceSummary: object,
 *   requirementsSummary: object,
 *   bugsSummary: object,
 *   nextActions: object[],
 *   health: object,
 *   audit: object,
 *   normalize: object,
 *   lastSession: { event: string, agent: string, at: string }|null,
 *   snapshotVersion: number
 * }}
 */
export function projectFromSnapshot(snapshot);
```

### `lib/collector/index.js` — modified `collectOne`

Signature unchanged (`async function collectOne(project): Promise<ProjectRecord>`). New internal control flow:

1. If `project.type !== 'local'` OR `aitriVersionTooOld(projectDir)` → take legacy path (existing code), set `degradationReason = 'version_too_old'` if version is the cause.
2. Else → call `readSnapshot(projectDir)`.
   - On `ok`: assign `data = projectFromSnapshot(snapshot)`, also call the unchanged 5 readers (git, app-version, spec-quality, external-signals, feature) and merge.
   - On `!ok`: take legacy path, set `degradationReason = result.reason`, log to `~/.aitri-hub/logs/aitri-hub.log`.

`aitriVersionTooOld(projectDir)` is a thin guard reading `.aitri.aitriVersion` and comparing semver to `0.1.77` — uses existing `aitri-version-reader.js`.

### Renderer API (web ProjectCard)

Existing component receives a `project` prop; this feature reads new fields from the same prop:

```jsx
function ProjectCard({ project }) {
  // existing rendering ...
  return (
    <div className="card">
      {project.degradationReason && <DegradationRow reason={project.degradationReason} />}
      <NextActionRow next={project.nextActions?.[0]} />
      {project.health && !project.health.deployable && <DeployHealthSection health={project.health} />}
      <PipelineSection pipeline={...} lastSession={project.lastSession} />
      <QualitySection
        testSummary={project.testSummary}
        staleVerify={project.health?.staleVerify}
        audit={project.audit}
      />
      <BlockersSection
        existing={...}
        normalize={project.normalize}
      />
      {/* GIT, VERSION sections unchanged */}
    </div>
  );
}
```

CLI renderer mirrors the same logic in plain text using existing `monitor` command's row helpers.

---

## Security Design

This feature does not introduce new attack surface beyond what `aitri status --json` already implies. Specific controls:

| Concern | Control |
|---|---|
| Command injection via `projectDir` | `child_process.spawn` (NOT `exec` / `execSync` with shell). Argv array form: `spawn('aitri', ['status', '--json'], { cwd: projectDir, shell: false })`. Project paths are never interpolated into a command string. |
| Untrusted JSON output | `JSON.parse` is wrapped in try/catch. Any parse error → `reason: 'parse_failed'`. No `eval`, no `Function()`, no dynamic require. |
| Path traversal | `projectDir` is taken from the registered project record (already validated at registration time per existing FR-001). Snapshot reader does not accept paths from user input at runtime. |
| Privilege escalation | Spawn inherits the Hub process user — no setuid, no `sudo`, no shell. |
| Resource exhaustion (slow CLI) | 3000ms hard timeout via `AbortController` or `child.kill('SIGKILL')` after timer; cycle proceeds. |
| Output size DoS | Bound stdout buffer at 1 MiB; on overflow → `reason: 'parse_failed'` with detail `output_too_large`. (Sanity-check: typical `status --json` output is <50 KiB even on large projects.) |
| Auth | None — Hub is single-user single-host (per existing NFR-005). Snapshot data never leaves localhost. |
| Logging PII | Failure logs include project NAME and reason — no file contents, no environment dumps. |

---

## Performance & Scalability

| Constraint | Approach |
|---|---|
| NFR-006: ≤500ms p95 per project | `aitri status --json` is observed to complete in ~50–200ms on populated projects. JSON parse and projection are <5ms. Headroom is comfortable. |
| NFR-001 (existing): 20 projects in ≤5s | Snapshot collection runs inside existing `Promise.all(expanded.map(collectOne))` — already parallel. 20 × 200ms wall-clock with parallelism ≈ ~250–500ms (bounded by CPU and process spawn cost, not serial CLI). |
| NFR-009: 3000ms spawn timeout | Hard kill via `AbortController.signal` passed to `spawn`. Cycle never blocks beyond timeout. |
| Caching | None added by this feature — every cycle re-spawns. Acceptable because Aitri is single-machine and cheap to invoke. Caching is a follow-up if measurements show CPU pressure on hosts with >50 local projects. |
| Concurrency cap | None added; relies on existing `Promise.all`. If `expanded.length > N` (e.g. 100), Node may exhaust file descriptors via parallel spawns. Documented as a follow-up risk; not addressed in this feature because the existing collector already had the same risk and Hub's typical user count is <20 projects. |

---

## Deployment Architecture

No deployment topology change. Hub continues to ship as:

| Surface | Distribution |
|---|---|
| CLI (`aitri-hub monitor`) | Same npm package; new file `lib/collector/snapshot-reader.js` packaged via existing `package.json` `files` array (must include `lib/**`). |
| Web | Existing Docker container (`docker compose up`) — React build picks up new `ProjectCard.jsx` as part of normal frontend build. |
| Runtime dependency | The `aitri` binary on PATH (NEW soft requirement — degrades gracefully if missing). Documented in `README.md` and surfaced at runtime via FR-017 warning row. |
| Environment vars | None added. |
| CI | Existing test suite runs `npm test`; new test files (`test/collector/snapshot-reader.test.js`, integration tests for fallback) run under the same pipeline. |

---

## Risk Analysis

### ADR-01 — Per-cycle spawn vs long-lived `aitri` daemon

**Context:** Hub collects every 5 seconds. Spawning `aitri status --json` per project per cycle has process-startup cost. A daemon (`aitri serve`) could push updates over IPC.

| Option | Trade-off |
|---|---|
| **A. Spawn per cycle (chosen)** | Simple. Zero IPC. Stateless. Each cycle gets fresh data. Cost: ~50ms per spawn × N projects per cycle. Acceptable at N ≤ 20. |
| B. Long-lived `aitri serve` daemon | Lower per-cycle latency. But: requires Aitri Core to ship a daemon, lifecycle management (start/stop/crash recovery) on Hub side, IPC protocol contract (a second integration surface), and breaks the "Aitri is a CLI" mental model. Out of scope for this feature. |

**Decision:** A — spawn per cycle. Daemon is a follow-up only if measurements show pain.

**Consequences:** Hub remains coupled to the CLI binary, not to a long-running service. If the binary is missing, FR-017 degradation kicks in cleanly.

### ADR-02 — Demote 5 legacy collectors to fallback-only

**Context:** FR-011 mandates demotion (not deletion); FR-017 requires the legacy path as the snapshot-failure fallback. The earlier FR-011 vs FR-017 conflict (line-count metric vs fallback retention) was resolved upstream in P1 — NFR-007 now scopes the ≥400-line reduction to the snapshot-active code path of `lib/collector/`, explicitly excluding the 5 demoted reader files.

| Option | Trade-off |
|---|---|
| **A. Demote (chosen)** | Satisfies both FR-011 and FR-017 — fallback path is real, not a stub. Demoted readers continue to exist on disk and are invoked only by the FR-017 degradation branch. NFR-007 (revised) measures only the snapshot-active call sites, which collapse from ~5 reader invocations + ~30 lines of aggregation in collector/index.js to a single snapshot-reader call. |
| B. Delete and re-render legacy data inline in fallback | Would maximize raw line-count reduction. But: degraded mode would render strictly less data (no test summary, no compliance), making the FR-017 "limited report" promise nearly empty. Rejected on UX grounds, not on metric grounds. |

**Decision:** A — demote.

**Consequences:** Demoted reader files remain on disk and are imported only inside the FR-017 fallback branch in `collector/index.js`. Future deletion (once telemetry confirms snapshot success rate ≥99%) is filed as a follow-up feature, not blocked by this design.

### ADR-03 — Spawn timeout strategy

**Context:** A hung `aitri` invocation must not block the cycle.

| Option | Trade-off |
|---|---|
| **A. Hard SIGKILL at 3000ms (chosen)** | Predictable upper bound on cycle latency. Simple. May leave orphaned tmp files inside the project — but Aitri Core writes none synchronously. |
| B. SIGTERM + grace + SIGKILL ladder | Allows graceful shutdown. But: adds 1–2s to the worst case (defeating the timeout's purpose) and Aitri Core has no signal-handler graceful shutdown to honor anyway. |

**Decision:** A — SIGKILL at 3000ms via `AbortController` passed to `spawn`.

**Consequences:** Worst-case per-project collection latency is bounded at 3000ms. Cycle never hangs.

### ADR-04 — `snapshotVersion` enforcement floor

**Context:** STATUS_JSON.md guarantees additive-only changes within `snapshotVersion`. We need to decide whether to reject snapshots from a hypothetical future v2 we do not understand.

| Option | Trade-off |
|---|---|
| **A. Accept any `snapshotVersion >= 1` (chosen)** | Forward-compatible — Hub keeps reading known fields, ignores new ones. Resilient to additive Aitri releases. |
| B. Pin to a known set `[1]` and degrade on anything else | Forces a Hub upgrade for every Aitri snapshotVersion bump. Defeats the purpose of additive contract. |

**Decision:** A — `>= 1`. NFR-008 is satisfied by this choice plus defensive optional-chaining in the renderer (`project.health?.deployable`).

**Consequences:** A future breaking `snapshotVersion: 2` will require a Hub change anyway (semantic change), so the floor will need to be revisited. Documented as a known maintenance debt.

### Top 3 risks (beyond the conflict above)

1. **Aitri version detection lag** — `aitri-version-reader.js` reads `.aitri.aitriVersion` which can be stale after `aitri adopt --upgrade`. If Hub thinks the project is at v0.1.74 but it just upgraded to v0.1.79, snapshot path is skipped unnecessarily. Mitigation: trust `.aitri.aitriVersion` as the source — adopters that don't update it are buggy upstream.
2. **Spawn cost on Windows / WSL2** — Process spawn on Windows is ~10× slower than POSIX. NFR-006 may not hold on Windows hosts. Mitigation: documented; if a Windows user reports regression, switch to long-lived daemon (ADR-01 option B). Not addressed proactively.
3. **Snapshot drift between Aitri minor releases** — STATUS_JSON.md is additive but field semantics may shift (e.g. `audit.stalenessDays` definition could change from "since last audit run" to "since last finding update"). Mitigation: Hub renders the field verbatim — any semantic shift is upstream's problem to communicate via CHANGELOG.md.

### Failure Blast Radius

**Component: `aitri` CLI binary on PATH**
- Blast radius: Snapshot collection fails for every local project. Remote (GitHub-URL) projects are unaffected.
- User impact: Every local project card shows the FR-017 warning row at the top; legacy reader output renders below — user still sees phase counts, test counts, bug counts, but no NEXT ACTION, no DEPLOY HEALTH, no staleness, no normalize warning, no lastSession.
- Recovery: Install `aitri` ≥ v0.1.77 and `npm i -g .` from Aitri Core. No Hub restart required — next cycle picks it up automatically.

**Component: `aitri status --json` schema (Aitri Core breaking change)**
- Blast radius: If Aitri Core ships `snapshotVersion: 2` with a removed/renamed field, the projection function throws or returns malformed data; affected fields render as undefined in the UI.
- User impact: Some card sections render empty or stale (last successful cycle's data). No crash because of optional-chaining in the renderer.
- Recovery: Upgrade Hub to a version that handles `snapshotVersion: 2`. Until then, downgrade Aitri to ≤0.1.79 to restore full data.

---

## Technical Risk Flags

[RESOLVED] FR-011 vs FR-017 — net-line-reduction conflict
This conflict was raised during the first Phase 2 pass and resolved upstream in P1: NFR-007 (and FR-011 AC #2) was rewritten to scope the ≥400-line reduction to the snapshot-active code path of `lib/collector/`, explicitly excluding the 5 demoted reader files retained for FR-017 fallback. The architecture as designed now satisfies both FR-011 (demoted, not deleted) and the revised NFR-007 (snapshot-active path collapses to a single reader call). No mitigation needed — recorded here for traceability.
Severity: resolved

[RISK] Process spawn cost on Windows / WSL2
Conflict: NFR-006 (≤500ms p95 per project) assumes POSIX spawn cost (~50ms). On Windows (and WSL2 with cross-FS access), `child_process.spawn` of a Node CLI binary can take 300–800ms per invocation. With 10–20 projects spawning in parallel, file-descriptor and process-table contention can push p95 above 500ms.
Mitigation: Accepted — feature ships without a Windows-specific path. Hub's existing NFR-004 already names Windows WSL2 as a target, but Hub also has no Windows-specific perf SLA today. If a Windows user reports regression versus the legacy path, escalate to ADR-01 option B (long-lived daemon) as a follow-up feature.
Severity: medium

[RISK] No detection of `snapshotVersion` semantic drift between additive minor releases
Conflict: STATUS_JSON.md guarantees additive-only changes within a `snapshotVersion`, but a field's semantic meaning could shift in a CHANGELOG entry without a version bump (example: `audit.stalenessDays` definition change). Hub renders the field verbatim and would silently surface incorrect data.
Mitigation: Document in Hub's `STYLE_GUIDE.md` that any new render of a snapshot field MUST cite the STATUS_JSON.md section it consumes, so future changes flag the dependency. Not solved by code; solved by review discipline.
Severity: low

[RISK] Snapshot success path bypasses Hub-side validation that legacy readers performed
Conflict: Legacy `requirements-reader.js` (and others) silently coerce malformed input. The new snapshot path trusts `aitri status --json` to be well-formed. A bug in Aitri Core that produces a partially-malformed snapshot (e.g. `nextActions: null` instead of `[]`) would surface as runtime errors in the renderer.
Mitigation: `projectFromSnapshot()` defensively normalizes — `nextActions ?? []`, `health ?? {}`, etc. Add a unit test per snapshot-derived field that asserts safe defaults on missing/null input.
Severity: low
