# Project Idea

## Problem
Developers managing multiple Aitri projects have no centralized view of their progress and health.
They must inspect each project individually — opening repos one by one — with no global picture,
no cross-project alerts, and no way to spot stagnant or at-risk pipelines at a glance.

## Target Users
Developers and team leads actively running Aitri pipelines across multiple projects. Ranges from
solo developers wanting a morning overview, to team leads sharing a local dashboard with their
team, to companies overseeing a portfolio of Aitri-managed projects.

## Current Pain / Baseline
Checking N projects today means: cd into project → aitri status → cd into next project → repeat.
No unified view, no cross-project alerts, no shared team visibility.

## Business Rules
- System must provide a local web dashboard: a single Node.js process (`aitri-hub web`) that
  serves a React SPA and runs the collector, accessible only at `http://127.0.0.1:3000`
- Dashboard must auto-refresh the collected metrics with a default interval of 5 seconds
- The dashboard must be startable with a single command (`aitri-hub web`) with no interactive setup
- System must read each project's .aitri state file to extract: phase progress (approvedPhases,
  completedPhases), verify results (verifySummary), rejection history, and artifact drift warnings
- System must read 04_TEST_RESULTS.json (when present) for per-FR test coverage metrics
- System must collect Git metadata: last commit timestamp, commit velocity (commits/week), active branch
- System must surface alerts: no commits > 72h, verify failed, artifact drift detected, vulnerable dependencies
- System must support both local project paths and remote GitHub/GitLab URLs (clone + cache)
- All data must be stored locally under `~/.aitri-hub/` — no cloud, no external services
- Project registration (add / edit / remove / folder scan) happens entirely through the `/admin`
  page in the browser — no CLI wizard, no interactive prompts

## Success Criteria
- Given no registered projects, when the user runs `aitri-hub web` and opens `localhost:3000`,
  then the empty-state panel presents a single call-to-action that links to `/admin` within the
  first rendered viewport — no terminal steps are required
- Given a user visits `/admin` for the first time, when they register their first project via
  the web form, then the project appears in the dashboard within one collector refresh cycle
- Given a project with verify failures or artifact drift, when the dashboard refreshes, then a
  visible alert is shown without manual action
- Given N registered projects, when the user opens `localhost:3000`, then all pipeline states
  appear on one screen in under 5 seconds

## Out of Scope
- Cloud storage or syncing of any project data (v1)
- Monitoring non-Aitri projects (no .aitri file)
- Triggering aitri commands (run-phase, approve) from the dashboard
- Authentication or multi-user access control (v1)
- Code editing or test execution from the dashboard
- A terminal-resident dashboard or interactive CLI setup wizard
