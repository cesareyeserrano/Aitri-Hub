## Feature
Add an `INTEGRATION_LAST_REVIEWED` gate and feature sub-pipeline aggregation to Aitri Hub, per Aitri Core rule #6.

## Problem / Why
1. Hub has no guard to signal when Aitri Core evolves beyond what Hub was designed for — users can see stale or incomplete data silently.
2. Hub only reads the root `.aitri` file; it ignores `features/*/` sub-pipelines entirely. This causes incorrect TC counts and missing phase progress (observed: 30 TCs shown vs 91 actual — 30 main + 61 feature TCs).

## Target Users
Existing Aitri Hub users who run projects with one or more feature sub-pipelines.

## New Behavior
- The system must define a constant `INTEGRATION_LAST_REVIEWED = '0.1.76'` in Hub's config.
- The system must compare the installed Aitri CLI version against `INTEGRATION_LAST_REVIEWED` on startup and on each collection cycle.
- The system must surface a visible warning alert (CLI and web) before rendering any project data when the CLI version exceeds `INTEGRATION_LAST_REVIEWED`.
- The alert must include the message: "Aitri {version} detected — Hub integration not reviewed past {INTEGRATION_LAST_REVIEWED}" and link to `docs/integrations/CHANGELOG.md`.
- The system must scan `features/*/` inside each registered project directory and read each feature's `.aitri` state file.
- The system must aggregate feature pipeline data (phase progress, TC count, verify status) and include it in the project entry surfaced by both CLI and web dashboards.
- Feature pipeline data must be displayed alongside (not replacing) the main pipeline data.

## Success Criteria
- Given CLI version > `INTEGRATION_LAST_REVIEWED`, when Hub starts, then a warning alert appears before any project card/row is rendered.
- Given CLI version <= `INTEGRATION_LAST_REVIEWED`, when Hub starts, then no integration alert is shown.
- Given a project with `features/my-feature/` containing a valid `.aitri`, when the collector runs, then feature phase progress and TC count are included in the project's dashboard entry.
- Given a project with no `features/` directory, when the collector runs, then no error occurs and main pipeline data is unaffected.
- Total TC count shown in Hub matches sum of main + all feature TCs.

## Out of Scope
- Modifying or writing to any feature `.aitri` file (read-only).
- Surfacing feature-level git metadata (commits, branches) separately.
- Automatic bumping of `INTEGRATION_LAST_REVIEWED` — that is a manual developer action.
