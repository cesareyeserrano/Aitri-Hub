## Feature
Remove the CLI terminal dashboard from Aitri Hub (web-only mode) and absorb Aitri Graph as a native Artifact Graph tab in the web dashboard.

## Problem / Why
Aitri Hub currently maintains two parallel surfaces (CLI dashboard + web dashboard) that duplicate monitoring logic and create maintenance overhead. The CLI terminal renderer (`monitor` command) adds complexity without adding value over the web dashboard. Separately, Aitri Graph is a standalone tool that visualizes artifact dependencies — functionality that belongs inside Hub where project context already exists.

## Target Users
Developers already using Aitri Hub to monitor projects who want to inspect artifact dependency graphs (requirements → user stories → test cases) without switching to a separate tool.

## New Behavior
- The `aitri-hub monitor` CLI command is removed; the terminal is no longer a primary surface
- `lib/renderer/cli.js` and all ANSI terminal rendering code is deleted
- `aitri-hub setup` and `aitri-hub web` remain as the only CLI commands
- The web dashboard gains a 7th tab: "Graph" — an interactive artifact dependency graph
- The Graph tab renders requirements → user stories → test cases as a collapsible DAG (using Cytoscape.js + dagre layout)
- The Graph tab uses the projects already registered in Hub (no separate registry)
- Users can click any project from the existing project list to load its artifact graph
- Nodes are colored by artifact status (pending / in_progress / approved / drift)
- Users can expand/collapse subtrees by clicking nodes
- The graph reads spec files (01_REQUIREMENTS.json, 03_TEST_CASES.json) from each project's path — already available via dashboard.json

## Success Criteria
- Given `aitri-hub web` is running, when user opens the Graph tab, then the artifact graph for the selected project renders within 2 seconds
- Given a project with approved requirements and test cases, when the graph loads, then FR nodes show green (approved) and linked TC nodes are visible
- Given user clicks a parent FR node, when it is expanded, then child nodes (user stories / TCs) appear; clicking again collapses them
- Given `aitri-hub monitor` is called, the command is no longer recognized (or prints a deprecation notice directing to web)
- Given `aitri-hub setup` is called, it still works correctly (project registration unaffected)

## Out of Scope
- Aitri Graph's standalone server.js and its own project registry are not migrated — only the graph rendering logic
- No editing of artifacts from the graph (read-only visualization)
- No GitHub remote loading in the initial integration (local paths only via dashboard.json)
- No changes to the collector, alerts engine, or store
