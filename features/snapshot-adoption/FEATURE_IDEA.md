## Feature
Migrate Hub's project data collection to consume `aitri status --json` (the canonical ProjectSnapshot contract from Aitri Core v0.1.77+) instead of Hub's parallel re-parsing collectors, and surface richer report data in the dashboard.

## Problem / Why
Hub today re-implements parsing of `.aitri` and every artifact (requirements, tests, compliance, bugs) in 15 separate collectors under `lib/collector/`. This duplicates ~600 lines of logic that Aitri Core already aggregates in its unified ProjectSnapshot, and forces Hub's reports to surface only flat counts (3/5 phases, X tests, Y bugs) — none of the drill-down data the snapshot already exposes (per-FR coverage, deployable reasons, next-action with reason, lastSession, audit/verify staleness, normalize off-pipeline detection, debt list, backlog).

The result is shallow project reports: users can't tell *why* a project isn't deployable, *which* FR is uncovered, *what* the next concrete action is, *who* last touched what, or *whether* code changed outside the pipeline — even though all of that already exists in `aitri status --json`.

This is also a schema-drift risk: each Aitri Core release that adds artifact fields requires a parallel Hub change. The snapshot contract is versioned (`snapshotVersion`) and additive — adopting it eliminates Hub's exposure to upstream artifact schema changes.

## Target Users
Existing Hub users — engineers monitoring multiple Aitri-managed projects. They already use the dashboard but currently miss actionable detail.

This feature does not unlock new user types; it makes the existing user experience materially richer.

## New Behavior
The system must:
- Invoke `aitri status --json` once per registered project during each collection cycle and parse the resulting ProjectSnapshot.
- Replace the parsing layer of `lib/collector/aitri-reader.js`, `requirements-reader.js`, `compliance-reader.js`, `test-reader.js`, and `bugs-reader.js` with a single snapshot-derived projection. Keep `git-reader`, `app-version-reader`, `spec-quality-reader`, `external-signals-reader`, and `feature-reader` unchanged (their data is not in the snapshot).
- Render `nextActions[0]` (command + reason) as a "NEXT ACTION" section on each ProjectCard.
- Render `health.deployableReasons[]` as a "DEPLOY HEALTH" section when the project is not deployable, listing each blocking reason explicitly (instead of a generic blocker count).
- Surface verify staleness (`tests.stalenessDays`) and audit staleness (`audit.stalenessDays`) as inline indicators in the QUALITY section.
- Surface `normalize.uncountedFiles > 0` as a warning row in the BLOCKERS section, indicating off-pipeline source changes since last build approval.
- Display `lastSession` (agent + event + relative time) as a single line under the PIPELINE section.
- Degrade gracefully when `aitri status --json` is unavailable (Aitri CLI not installed, project at incompatible Aitri version, snapshot fails to parse): fall back to the legacy collectors and surface a one-line warning on the card.

## Success Criteria
- Given a project at Aitri v0.1.77+ with a populated `.aitri` and artifacts, when the dashboard collects, then the ProjectCard shows NEXT ACTION ("Phase 4 approved — run verify next" → `aitri verify-run`) and the previously-blocking-only BLOCKERS section now also shows specific deploy reasons.
- Given a project where `verify` last ran 18 days ago, when the dashboard renders, then the QUALITY section shows "tests stale (18d)".
- Given a project where 3 source files changed off-pipeline since last build approval, when the dashboard renders, then BLOCKERS shows "3 file(s) changed outside pipeline — run: aitri normalize".
- Given a project at Aitri v0.1.76 or earlier (no `status --json`), when the dashboard collects, then the legacy collector path runs and the card shows a "Aitri version too old for full reports" warning.
- Given the migration is complete, when comparing `lib/collector/` line count before vs after, then the net change is a reduction of at least 400 lines (collectors removed > snapshot-reader added).

## Out of Scope
- Rewriting `git-reader`, `app-version-reader`, `spec-quality-reader`, `external-signals-reader`, or `feature-reader`. The snapshot does not cover their data.
- Visual redesign of ProjectCard beyond the new sections (NEXT ACTION, DEPLOY HEALTH) and the inline staleness/normalize indicators. Existing 5-section layout (BLOCKERS, PIPELINE, QUALITY, GIT, VERSION) stays.
- Drill-down panels for individual FRs, TCs, or bugs. The snapshot exposes the lists, but rendering them as interactive panels is a separate feature.
- Hub server (collector cycle, store, alerts engine) re-architecture. Only data ingest and rendering change.
- Backwards compatibility with Aitri Core older than v0.1.77 (snapshot did not exist before that). Older projects degrade with a warning, not a partial render.
