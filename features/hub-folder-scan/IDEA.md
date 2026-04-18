## Feature
When a user registers a directory (e.g. `/Projects`) as a project location in the admin panel, the hub automatically scans its immediate children and registers each valid sub-project individually instead of (or in addition to) the parent folder.

## Problem / Why
Users organize multiple projects under a single parent folder (e.g. `/Projects/aitri`, `/Projects/aitri-hub`). Currently they must add each child manually one by one. Adding the parent folder doesn't help — the collector reads it as a single project and finds no meaningful data. This makes onboarding a workspace of N projects require N separate admin actions.

## Target Users
Any developer with multiple projects under a common parent directory.

## New Behavior
- The system must detect when a registered location contains sub-directories that each look like a project (has `.aitri` folder, `package.json`, or `aitri.json`).
- The system must offer to register each valid child as its own project entry when the parent is added via the admin panel.
- Alternatively (simpler mode): when type is set to "folder" (new type), the collector auto-discovers children and aggregates them without requiring individual registration.
- Sub-projects discovered this way show up as individual cards on the home view.
- If a child directory does not look like a project (no package.json, no .aitri, no aitri.json), it is skipped.

## Success Criteria
- Given: user adds `/Projects` as a location with type "folder"
- When: the collector runs
- Then: each immediate child of `/Projects` that has a `package.json` or `.aitri` directory appears as its own project card in the dashboard
- And: the parent `/Projects` itself does not appear as a card

## Out of Scope
- Recursive scanning (only immediate children, depth=1)
- Auto-watching for new subdirectories (only scanned on collector cycle)
- Remote folder types (folder scan is local only)
