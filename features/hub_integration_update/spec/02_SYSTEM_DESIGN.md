# System Architecture — hub_integration_update

## Executive Summary

Two targeted additions to the existing Hub collector + frontend stack:

1. **BUGS.json reader** — new `lib/collector/bugs-reader.js` reads `<artifactsDir>/BUGS.json` per project. Returns a compact summary (counts by status and severity). Integrated into `collectOne()` alongside existing readers. Two new alert rules added to the alerts engine.

2. **`lastSession` exposure** — one-line addition to `readAitriState()` in `lib/collector/aitri-reader.js` to pass through the `lastSession` field. The Activity tab frontend renders it with agent color-coding.

No new servers. No new endpoints. No schema version bump. No Docker changes.

| Layer | Component | Change |
|---|---|---|
| Collector | `lib/collector/bugs-reader.js` | NEW — reads BUGS.json |
| Collector | `lib/collector/aitri-reader.js` | MODIFIED — expose `lastSession` |
| Collector | `lib/collector/index.js` | MODIFIED — call `readBugsSummary`, add to data object |
| Alerts | `lib/alerts/engine.js` | MODIFIED — 2 new alert rules (open-bugs blocking/warning) |
| Frontend | `web/src/components/BugBadge.jsx` | NEW — bug count pill for project cards |
| Frontend | `web/src/components/ProjectCard.jsx` | MODIFIED — render BugBadge |
| Frontend | `web/src/components/LastSessionRow.jsx` | NEW — lastSession row for Activity tab |
| Frontend | `web/src/components/ActivityTab.jsx` | MODIFIED — render LastSessionRow per project |

---

## System Architecture

```
lib/collector/index.js — collectOne(project)
  ├── readAitriState()          ← +lastSession field (FR-019)
  ├── readGitMeta()             (unchanged)
  ├── readTestSummary()         (unchanged)
  ├── readComplianceSummary()   (unchanged)
  ├── readRequirementsSummary() (unchanged)
  ├── readSpecQuality()         (unchanged)
  ├── readExternalSignals()     (unchanged)
  ├── readSpecArtifacts()       (unchanged)
  └── readBugsSummary()         ← NEW (FR-017)
        reads <artifactsDir>/BUGS.json
        returns { open, fixed, verified, closed,
                  critical, high, medium, low, openIds[] }
        returns null on absent/malformed

  ↓
evaluateAlerts(data)  ← +2 rules: open-bugs-blocking, open-bugs-warning (FR-018)
  ↓
dashboard.json  ← each project gains: bugsSummary, aitriState.lastSession

web/src/App.jsx — polls dashboard.json every 5s (unchanged)
  ├── OverviewTab → ProjectCard → BugBadge (FR-021)
  └── ActivityTab → LastSessionRow per project (FR-020)
```

---

## Data Model

### dashboard.json — new fields per project entry

```jsonc
{
  // existing fields unchanged …
  "bugsSummary": {              // null when BUGS.json absent or malformed
    "open":     3,
    "fixed":    1,
    "verified": 2,
    "closed":   5,
    "critical": 1,
    "high":     2,
    "medium":   0,
    "low":      0,
    "openIds":  ["BG-001", "BG-003", "BG-004"]
  },
  "aitriState": {
    // existing fields …
    "lastSession": {            // null when field absent in .aitri (pre-v0.1.70)
      "at":           "2026-03-31T22:00:00Z",
      "agent":        "claude",
      "event":        "complete requirements",
      "files_touched": ["src/auth.js"]   // may be absent → null
    }
  }
}
```

### bugs-reader.js — internal return type

```js
// null | {
//   open: number, fixed: number, verified: number, closed: number,
//   critical: number, high: number, medium: number, low: number,
//   openIds: string[]
// }
```

---

## ADR-001: bugs-reader implementation strategy

**Decision:** synchronous `fs.readFileSync` + `JSON.parse`, returning null on any error.

**Options evaluated:**

| Option | Pros | Cons |
|---|---|---|
| A — sync readFileSync (chosen) | Zero async overhead; consistent with all existing readers; simple error boundary | Blocks event loop for large files — acceptable since BUGS.json is bounded (<200 bugs = <50KB) |
| B — async fs.promises.readFile | Non-blocking | Requires collectOne() to become fully async; all other readers are sync; unnecessary complexity for file sizes in scope |

**Failure blast radius:** if BUGS.json is malformed or missing, `readBugsSummary` returns null. `collectOne` catches this via the null check in `evaluateAlerts`. No other project fields are affected.

---

## ADR-002: lastSession field exposure strategy

**Decision:** pass-through the raw `lastSession` object from parsed `.aitri`, normalizing only `files_touched` to null when absent.

**Options evaluated:**

| Option | Pros | Cons |
|---|---|---|
| A — pass-through raw object (chosen) | Zero transformation cost; preserves all fields Aitri writes; future-proof when Aitri adds new subfields | Consumers must handle unknown subfields defensively |
| B — selective field extraction | Strict contract — only known fields exposed | Requires updating Hub on every Aitri CHANGELOG entry; more brittle |

**Normalization rules:**
- `lastSession` absent → `null`
- `lastSession.files_touched` absent → `null` (not undefined)
- `lastSession.at`, `agent`, `event` preserved as strings, no coercion

---

## ADR-003: alert type key for bug alerts

**Decision:** alert type `"open-bugs"` for both blocking and warning variants, differentiated by `severity`.

**Options evaluated:**

| Option | Pros | Cons |
|---|---|---|
| A — single type `"open-bugs"` with severity (chosen) | Consistent with existing alert pattern (stale, verify-failed, etc.); AlertsTab groups by severity automatically | Cannot filter specifically on blocking vs. warning bug alerts without checking severity |
| B — two types `"open-bugs-critical"` / `"open-bugs-medium"` | Granular filtering | Inconsistent with existing type vocabulary; AlertsTab would need updates |

**Alert messages:**
- Blocking: `"Open bugs: {critical} critical, {high} high"`
- Warning: `"Open bugs: {medium} medium, {low} low"`

---

## Security Design

No security surface changes. Hub remains read-only. BUGS.json is read from the local filesystem using the same path construction as existing readers — no user-supplied path concatenation, no shell execution.

Path construction:
```js
const base = artifactsDir ? path.join(projectDir, artifactsDir) : projectDir;
const bugsPath = path.join(base, 'BUGS.json');
```

`projectDir` is a registered project path from `projects.json` (set by the user during `aitri-hub setup`). No traversal risk beyond what already exists in the collector.

---

## Performance & Scalability

- `readBugsSummary`: single synchronous file read + JSON.parse + array reduce. ≤10ms for 200-entry BUGS.json.
- `lastSession` exposure: zero I/O — field already read as part of `readStateFile()` call.
- Total collection cycle overhead: ≤10ms per project for BUGS.json. For 20 projects: ≤200ms added to the existing cycle. Within NFR-009 (≤50ms per project).
- Frontend: `BugBadge` is a pure display component — no additional fetch, no state, no effect.

---

## Failure Modes & Error Boundaries

| Failure | Behavior | User impact |
|---|---|---|
| BUGS.json absent | `readBugsSummary` returns null | No bug alerts, no badge — silent |
| BUGS.json malformed JSON | catch → returns null | Same as absent |
| BUGS.json empty `bugs` array | Returns `{ open:0, fixed:0, … }` | No alerts generated (open===0) |
| `.aitri` has no `lastSession` | `readAitriState` returns `lastSession: null` | No lastSession row in Activity tab |
| `lastSession.agent` is unknown string | Passed through as-is | Rendered with `--syn-comment` color (unknown agent fallback) |

---

## API Design

No new HTTP endpoints. All data flows through the existing `dashboard.json` polling contract.

### Internal module API — `readBugsSummary(projectDir, artifactsDir)`

```js
/**
 * @param {string} projectDir   — absolute path to project root
 * @param {string} artifactsDir — '' or 'spec' (from aitriState.artifactsDir)
 * @returns {{ open, fixed, verified, closed, critical, high, medium, low, openIds } | null}
 */
export function readBugsSummary(projectDir, artifactsDir) { … }
```

### Internal module API — `readAitriState()` — extended return

```js
// Existing return, extended with:
{
  // … all existing fields …
  lastSession: {
    at:            string | null,
    agent:         string | null,
    event:         string | null,
    files_touched: string[] | null,
  } | null
}
```

### dashboard.json schema delta

Added to each project entry (no existing field removed or renamed):
```jsonc
{
  "bugsSummary": BugsSummary | null,
  "aitriState": {
    // … existing fields …
    "lastSession": LastSession | null
  }
}
```

---

## Technical Risk Flags

| Flag | Severity | Mitigation |
|---|---|---|
| BUGS.json not in existing integration contract tests | Low | Add unit tests for `readBugsSummary` covering absent, malformed, and valid cases before merge |
| `lastSession` field missing in pre-v0.1.70 `.aitri` files | Low | Defensive null default already in design; backward-compat test required |
| `evaluateAlerts` receives null `bugsSummary` | Low | Guard clause `if (!data.bugsSummary \|\| data.bugsSummary.open === 0) return` at top of new rules |
| ProjectCard layout shift from BugBadge | Low | Badge uses `display: inline-flex` inside existing metric chip row; no height change confirmed in UX spec |

---

## Deployment Architecture

No infrastructure changes. The rebuilt web dist (after `npm run build`) picks up the new components. The existing Docker deployment path is unchanged.

```bash
cd web && npm run build   # rebuilds dist with BugBadge + LastSessionRow
```

---

## Risk Analysis

1. **BUGS.json schema evolution** — Aitri may add new `severity` values. Risk: low. Mitigation: `readBugsSummary` uses explicit field checks (`b.severity === 'critical'` etc.); unknown severities fall into zero counts rather than crashing.

2. **lastSession field structure change** — Aitri may rename subfields. Risk: low (contract is versioned). Mitigation: pass-through strategy means Hub will carry whatever fields exist; UI components check for field presence before rendering.

3. **Large BUGS.json** — A project with 1000+ bugs could add >50ms. Risk: low (unlikely in practice). Mitigation: `readBugsSummary` short-circuits on malformed input; no per-bug UI rendering, only aggregate counts.

---

## Traceability

| FR | Architecture component |
|---|---|
| FR-017 | `lib/collector/bugs-reader.js` → `collectOne` → `bugsSummary` in dashboard.json |
| FR-018 | `lib/alerts/engine.js` — two new rules: `open-bugs` blocking + warning |
| FR-019 | `lib/collector/aitri-reader.js` — `lastSession` in `readAitriState` return |
| FR-020 | `web/src/components/LastSessionRow.jsx` + `ActivityTab.jsx` |
| FR-021 | `web/src/components/BugBadge.jsx` + `ProjectCard.jsx` |

No-go zone confirmed absent:
- No BUGS.json writing ✓
- No bug triage UI ✓
- No CODE_REVIEW.md integration ✓
- No graph changes ✓
- No `lastSession.context` rendering ✓
