## Feature
Adapt Aitri Hub's snapshot bug projection to the current `aitri status --json` bug summary shape.

## Problem / Why
Hub currently projects snapshot bugs as if Aitri emitted historical status fields (`fixed`, `verified`, `closed`) and top-level severity fields (`critical`, `high`, `medium`, `low`). Aitri Core currently emits `bugs.total`, `bugs.open`, `bugs.blocking`, `bugs.bySeverity`, and `bugs.openIds`.

As a result, Hub correctly shows no open bugs when `bugs.open = 0`, but it drops the historical total. For example, AITRI-HUB has 12 registered bugs, all verified, and Aitri emits `bugs.total = 12`, but Hub's `bugsSummary` in `dashboard.json` shows only zeroed historical fields.

## Target Users
Hub users reviewing project health who need to distinguish "no bugs registered" from "bugs exist historically, but none are open."

## New Behavior
- Hub must preserve the current Aitri snapshot bug summary fields in its projected `bugsSummary`.
- Hub must expose `total`, `open`, `resolved`, `blocking`, `bySeverityActive`, and `openIds` for snapshot-derived bug data.
- `resolved` must equal `max(total - open, 0)`.
- Active severity counts must come from `bugs.bySeverity` and must not be presented as historical severity counts.
- Existing open-bug alert behavior must continue to work for critical/high active bugs.

## Success Criteria
- Given a snapshot with `bugs.total = 12`, `bugs.open = 0`, `bugs.blocking = 0`, and empty active severities, when Hub projects the snapshot, then `bugsSummary.total = 12`, `bugsSummary.open = 0`, `bugsSummary.resolved = 12`, and `bugsSummary.blocking = 0`.
- Given a snapshot with `bugs.total = 5`, `bugs.open = 2`, `bugs.blocking = 1`, `bugs.bySeverity.high = 1`, and `bugs.openIds = ["BG-1", "BG-2"]`, when Hub projects the snapshot, then `bugsSummary.open = 2`, `bugsSummary.resolved = 3`, `bugsSummary.bySeverityActive.high = 1`, and `bugsSummary.openIds` preserves both IDs.
- Given existing consumers that check `bugsSummary.open`, `critical`, `high`, `medium`, or `low`, when the new projection is used, then open-bug blocking/warning alert behavior remains compatible.

## Out of Scope
- No Aitri Core changes.
- No redesign of Aitri Core `aggregateBugs`.
- No historical severity or status breakdown beyond `total`, `open`, and derived `resolved`.
- No new bug-management UI.
