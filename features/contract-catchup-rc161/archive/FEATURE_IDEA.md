<!-- Ground truth: user-directed 2026-07-07 ("dale a todo" — consume the rc.161
     contract). Problem/Why sourced from this repo's own recorded debt, not
     inferred: index.js lastSession inline-read comment + FR-047 technical_debt
     in features/contract-catchup-rc159/spec/04_BUILD_REPORT.json. -->

## Feature
Consume the Aitri v2.0.0-rc.161 `status --json` additions (`lastSession`, per-pipeline `quality_gates`/`ac_coverage`) and retire the two workarounds that existed only because those fields were missing.

## Problem / Why
Core shipped rc.161 today with the surfaces this Hub filed as HUB-CATCHUP-0705. Until the Hub consumes them: (a) the collector keeps reading `.aitri.local` directly on the snapshot path — the acknowledged SCHEMA.md deviation recorded in lib/collector/index.js; (b) FR-047 of contract-catchup-rc159 stays open as technical_debt ("blocked on Core exposing quality_gates/ac_coverage"), so QA-facing views cannot ever render gate results from the record.

## Target Users
Existing Hub users (QA/PM personas reading dashboard.json-backed views). No new user types.

## New Behavior
The system must...
- Prefer the snapshot's top-level `lastSession` when the key is present in `aitri status --json` output, without falling back to `.aitri.local` for that project.
- Keep the `.aitri.local` inline fallback ONLY when the snapshot payload lacks the `lastSession` key (pre-rc.161 CLI).
- Carry `tests.perPipeline[].quality_gates` (name/status/required + optional threshold/measured) into the project record when present, additive and absent-tolerant.
- Carry `tests.perPipeline[].ac_coverage` into the project record unchanged when present, additive and absent-tolerant.
- Add no field to the record when the snapshot lacks these surfaces (`null` or absent → no key), and never interpret `null` as "old Aitri version" (the artifact fields predate rc.161; only the projection is new).

## Success Criteria
- Given a snapshot payload with `lastSession: {at, agent, event}`, when the collector projects it, then the record's lastSession matches the snapshot and no `.aitri.local` read occurs for that project.
- Given a snapshot payload without the `lastSession` key (older CLI), when the collector runs, then the existing inline fallback still populates lastSession as before.
- Given a snapshot whose root perPipeline entry carries `quality_gates` with a failed required gate, when projected, then the record preserves gate name, status and required flag.
- Given a snapshot whose perPipeline entries have `quality_gates: null` and `ac_coverage: null`, when projected, then the record carries no quality_gates/ac_coverage keys.
- The three TC-047h/e/f test cases skipped in contract-catchup-rc159 (or their equivalents here) run and pass.
- After review, `~/.aitri-hub/integration-compat.json` `reviewedUpTo` = `2.0.0-rc.161`.

## Touch Points
- MODIFIES `lib/collector/snapshot-reader.js` (`projectFromSnapshot`) — new field projection.
- MODIFIES `lib/collector/index.js` — lastSession preference order (snapshot key wins; inline `.aitri.local` read becomes the pre-rc.161 fallback only).
- MODIFIES `~/.aitri-hub/integration-compat.json` (data, not code) — reviewedUpTo bump after review.
- Existing FRs: completes the intent of FR-047 (contract-catchup-rc159, shipped as technical_debt); touches FR-016 (lastSession rendering) data source only.

## Must Not Break (Regression Boundary)
- Snapshot-path collection for projects on pre-rc.161 CLIs keeps producing the same record (lastSession via inline fallback; no quality_gates/ac_coverage keys).
- The legacy/fallback reader path (`aitri-reader.js`, snapshot-ineligible projects) remains byte-identical in behavior.
- QA Workspace detail tabs (detail-reader.js) keep reading artifacts directly — no change to on-demand reads.
- The `bugs.parseErrors` consumption (rc.158) and the version-gap integration alert keep working unchanged.
- dashboard.json records for projects WITHOUT the new fields keep their exact current shape (additive-only guarantee).

## Out of Scope
- No new UI sections — rendering quality_gates/ac_coverage in QA Workspace tabs is a separate feature (same boundary FR-047 drew).
- No coverage-audit freshness consumption (Core deliberately did not ship it; the Traceability tab re-hash stays, deferred until a real project mis-reports).
- No `validate --json` changes (rc.160's `allValid` fix is corrective upstream; the Deploy Verdict card already reads top-level `deployable`).
