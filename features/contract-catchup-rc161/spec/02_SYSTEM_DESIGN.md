# Technical Design Document (TRD / SDD) — contract-catchup-rc161

## 1. Executive Summary

Node.js 18+ (existing Hub stack, zero runtime dependencies — unchanged). This feature is a pure ingestion-layer change: `lib/collector/snapshot-reader.js` gains projection of two new `status --json` surfaces (per-pipeline `quality_gates` / `ac_coverage`, Aitri v2.0.0-rc.161), and `lib/collector/index.js` re-orders its `lastSession` sourcing so the sanctioned snapshot field wins over the `.aitri.local` inline read. No new modules, no new processes, no UI change.

Key finding from code inspection: `projectFromSnapshot` (snapshot-reader.js:178-186) ALREADY projects `s.lastSession` — the projection was built ready in the qa-workspace era and has been receiving `undefined` (→ `null`) because Core did not emit the field until rc.161. FR-060 therefore changes only the fallback CONDITION in index.js, not the projection.

## 2. System Architecture

```
aitri status --json (CLI, rc.161+)
        │  spawn, per collection cycle (unchanged)
        ▼
readSnapshot (snapshot-reader.js)          [unchanged]
        │  parsed payload
        ▼
projectFromSnapshot (snapshot-reader.js)   [MODIFIED: + projectQualitySurfaces]
        │  project record fields
        ▼
collectOne (index.js)                      [MODIFIED: lastSession fallback gated
        │                                   on key-presence in the payload]
        ▼
dashboard.json record                      [additive keys only]
```

Component responsibilities:
- `readSnapshot` — spawn + parse `aitri status --json`. Unchanged.
- `projectFromSnapshot` — pure projection payload → record. Gains one helper, `projectQualitySurfaces(s)`, mirroring the existing `projectAggregatedTestSummary` pattern (snapshot-reader.js:287-299): defensive, absent-tolerant, returns `null` when there is nothing to carry.
- `collectOne` — orchestration. The `.aitri.local` inline read (index.js:267-278) becomes reachable ONLY when the parsed payload lacks the `lastSession` key.

## 3. Data Model

New record field (additive, key absent when empty — matching the `resultsBinding` precedent at snapshot-reader.js:216-238):

```jsonc
"qualitySurfaces": {
  "perPipeline": [
    {
      "scope": "root",                      // "root" | "feature:<name>"
      "quality_gates": [                    // present only when non-null in the snapshot
        { "name": "lint", "status": "fail", "required": true },
        { "name": "coverage", "status": "pass", "required": true, "threshold": 80, "measured": 92 }
      ],
      "ac_coverage": [                      // present only when non-null in the snapshot; pass-through
        { "ac_id": "AC-001", "fr_id": "FR-001", "tests_passing": 2, "tests_failing": 0,
          "tests_skipped": 0, "tests_manual": 0, "status": "covered" }
      ]
    }
  ]
}
```

Rules:
- A perPipeline entry is included only if it carries at least one non-null surface; `qualitySurfaces` is omitted from the record entirely when no entry qualifies. Old CLIs and gate-less projects therefore produce byte-identical records (NFR-056 guardrail).
- `quality_gates` entries are shape-narrowed defensively (string name/status or null, boolean required, numeric threshold/measured when present) — same posture as every other projection in this file. `ac_coverage` passes through as-is per FR-062 (Core already projects it compactly; re-narrowing per-field would risk dropping future additive Core fields).
- `lastSession` record shape is unchanged (`{event, agent, at}` — index.js:281-285); only its source order changes.

## 4. API Design

No HTTP surface changes. Internal contract (integration points):

- Input contract: `aitri status --json` per Aitri `docs/integrations/STATUS_JSON.md` v2.0.0-rc.161 — `lastSession` top-level (`object | null`, key may be absent on older CLIs); `tests.perPipeline[].quality_gates` / `ac_coverage` (`array | null`, keys may be absent on older CLIs).
- Output contract: the dashboard.json project record gains the optional `qualitySurfaces` key (shape above). Web/API layers that serve records pass it through untouched (no server change needed — records are served whole).
- `projectQualitySurfaces(s) -> object | null` — new exported helper (exported for direct unit testing, like `projectFromSnapshot`).

## 5. Security Design

No new inputs, no new file reads, no auth surface. The change strictly REMOVES a filesystem read for rc.161+ projects: `.aitri.local` (per-machine, gitignored) is no longer opened when the snapshot payload carries the `lastSession` key (NFR-059). The fallback read keeps its existing try/catch + BOM-strip + shape guard (index.js:269-278). Projection remains defensive against malformed snapshot values (type-narrowing on every carried field), so a hostile/corrupt payload cannot inject non-string/non-boolean values into the record's narrowed fields; `ac_coverage` pass-through is bounded by the snapshot size the collector already accepts.

## 6. Performance & Scalability

The collection cycle already spawns `status --json` and parses it; the added projection is O(pipelines × gates + ACs) over already-parsed JSON — negligible against the spawn cost. Record size grows by the carried surfaces only when they exist (tens of KB worst-case on AC-heavy projects, within the existing dashboard.json budget — same order as the events slice already stored). No caching changes.

## 7. Deployment Architecture

No deployment change: same single Node process, same collector cycle, same dashboard.json store. Ship = merge + restart Hub. The `~/.aitri-hub/integration-compat.json` `reviewedUpTo` bump to `2.0.0-rc.161` (FR-063) is a one-time data edit at ship time, performed after this TRD's review of the rc.160/rc.161 `— additive` CHANGELOG entries; the manifest reader is untouched.

## 8. Risk Analysis

- Risk 1 — Fallback regression for pre-rc.161 projects (lastSession disappears from cards). Mitigation: the fallback branch is gated on key-ABSENCE, not truthiness, and NFR-056 pins the old path with tests. Blast radius if wrong: stale/missing "last session" display on old-CLI project cards; no data loss (source files untouched).
- Risk 2 — `lastSession: null` misread as "fall back" (re-introducing the deviation). Mitigation: FR-060 AC-3 is a dedicated test — key present + null → null, no file read.
- Risk 3 — Record bloat or consumer breakage from new keys. Mitigation: `qualitySurfaces` omitted when empty (additive-only constraint); existing record consumers enumerate known fields, verified by the untouched web test suite.
- Failure blast radius (critical component: collector cycle): a thrown projection error degrades that project's record for the cycle exactly as today (collectOne's existing error handling); the new helper is pure and type-narrowed, with no I/O to fail.

## 9. Technical Risk Flags

None detected — Node.js built-ins only; the change follows two in-file precedents (`projectAggregatedTestSummary` for the projection, `resultsBinding` for the additive-key rule) and removes one filesystem access.

## ADRs

### ADR-1 — How the lastSession fallback is gated
- Option A: gate on `'lastSession' in parsedSnapshot` (key-presence). Pros: exactly encodes "the CLI speaks the rc.161 contract"; trusts a genuine `null`; zero version parsing. Cons: needs the parsed payload (not just the projected record) visible at the fallback site.
- Option B: gate on a semver compare of `aitriVersion >= 2.0.0-rc.161`. Pros: explicit about intent. Cons: duplicates version logic for something the payload itself already proves; breaks on backports/forks; the existing semver comparator would gain another call site to maintain.
- Decision: **Option A** — key-presence. The payload is self-describing; version inference is strictly weaker evidence than the key itself. Consequence: `collectOne` must receive (or close over) the parsed snapshot object alongside the projection — a local plumbing change inside `snapshot-reader.js`'s return value (`{ record, raw }` or equivalent), not a contract change.

### ADR-2 — Where the quality surfaces live in the record
- Option A: new top-level `qualitySurfaces.perPipeline[]` (scope-keyed, only non-empty entries). Pros: additive-only guarantee trivially satisfied (key omitted when empty); mirrors how the CLI groups the data; one place for future QA views to read. Cons: one more top-level record key.
- Option B: merge into the existing `testSummary`/`aggregatedTestSummary` objects. Pros: fewer top-level keys. Cons: those summaries are root-scoped scalars today — merging per-pipeline arrays into them changes the shape of EXISTING fields, violating the additive-only constraint and NFR-056's byte-identical guardrail.
- Decision: **Option A** — new optional key, omitted when empty. Consequence: display features must look in one new place, which is the FR-047 boundary working as intended (data reaches the record; rendering is a later feature).

## Traceability Checklist
- FR-060 → §2/§4 fallback gating + ADR-1. FR-061/FR-062 → §3 data model + ADR-2. FR-063 → §7. FR-064 → §4 exported helper + NFR pins in §8.
- Every ADR has ≥2 options with explicit trade-offs.
- no_go_zone respected: no UI sections designed, no coverage-audit freshness consumption, no detail-reader.js changes, no validate --json changes.
