## Feature
Close integration gaps between AITRI-HUB and the official Aitri Integration Contract v0.1.70.

## Problem / Why
Two fields/artifacts specified in the Aitri integration contract are not read by Hub:
1. `BUGS.json` (v0.1.67+) — first-class bug artifact with lifecycle and blocking rules. Hub generates no alerts for open critical/high bugs.
2. `lastSession` (v0.1.70+) — session checkpoint in `.aitri` with agent, event, and context. Hub ignores it.

## Target Users
Developers monitoring Aitri projects via the Hub dashboard — they miss bug status and last-agent-session info.

## New Behavior
- Hub must read `<artifactsDir>/BUGS.json` per project and expose a bug summary (counts by status and severity)
- Open bugs with severity `critical` or `high` must generate a blocking alert
- Hub must expose `lastSession` from `.aitri` (agent, event, at, files_touched)
- The Activity tab must display last session info per project

## Success Criteria
- Given a project with an open critical bug, when Hub collects, then a blocking alert appears in the Alerts tab
- Given a project with `lastSession` in `.aitri`, when the Activity tab is viewed, then last agent, event, and timestamp are shown
- Given a project with no BUGS.json, Hub does not crash and shows no bug alerts

## Out of Scope
- Graph node hierarchy changes (US/AC nodes) — deferred to separate feature
- BUGS.json editing from Hub — Hub is read-only
- `04_CODE_REVIEW.md` integration
