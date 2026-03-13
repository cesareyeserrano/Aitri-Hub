# Project Idea

## Problem
Developers managing multiple Aitri projects have no centralized view of their progress and health.
They must inspect each project individually — opening repos one by one — with no global picture,
no cross-project alerts, and no way to spot stagnant or at-risk pipelines at a glance.

## Target Users
Developers and team leads actively running Aitri pipelines across multiple projects. Ranges from
solo developers wanting a morning overview, to team leads sharing a live dashboard URL with their
team, to companies overseeing a portfolio of Aitri-managed projects.

## Current Pain / Baseline
Checking N projects today means: cd into project → aitri status → cd into next project → repeat.
No unified view, no cross-project alerts, no shared team visibility.

## Business Rules
- System must provide two modes: CLI terminal dashboard (`aitri-hub monitor`) and Web dashboard
  (React, served via Docker at localhost:3000)
- CLI dashboard must auto-refresh every 5 seconds in the terminal
- Web dashboard must be startable with a single command (e.g. `aitri-hub web` or `docker compose up`)
- System must read each project's .aitri state file to extract: phase progress (approvedPhases,
  completedPhases), verify results (verifySummary), rejection history, and artifact drift warnings
- System must read 04_TEST_RESULTS.json (when present) for per-FR test coverage metrics
- System must collect Git metadata: last commit timestamp, commit velocity (commits/week), active branch
- System must surface alerts: no commits > 72h, verify failed, artifact drift detected, vulnerable dependencies
- System must support both local project paths and remote GitHub/GitLab URLs (clone + cache)
- All data must be stored locally under ~/.aitri-hub/ — no cloud, no external services
- Setup must complete via a short interactive session (≤ 5 questions)

## Success Criteria
- Given N registered projects, when user runs `aitri-hub monitor`, then all pipeline states appear
  on one screen in under 5 seconds
- Given a user who prefers a visual interface, when they run `aitri-hub web` (or docker compose up),
  then the dashboard is accessible at localhost:3000 in under 30 seconds
- Given a project with verify failures or artifact drift, when the dashboard refreshes, then a
  visible alert is shown without manual action
- Given a new user, when they run `aitri-hub setup`, then all projects are configured in under 15 minutes

## Out of Scope
- Cloud storage or syncing of any project data (v1)
- Monitoring non-Aitri projects (no .aitri file)
- Triggering aitri commands (run-phase, approve) from the dashboard
- Authentication or multi-user access control (v1)
- Code editing or test execution from the dashboard
