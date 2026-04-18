# System Design — hub-folder-scan

## Executive Summary

This feature adds a `folder` project type to Aitri Hub. When a user registers a directory with `type='folder'`, the collector resolves its valid immediate children at each cycle and exposes them as individual project entries in `dashboard.json`. The admin API gains one new validation path (`not_a_directory`). The React form gains a new type option and conditional helper text. No new processes, no new files, no new dependencies.

---

## System Architecture

### Change surface

```
ADMIN PANEL (browser)
  └── AdminAddForm — new 'folder' option in type select + helper text

ADMIN API (lib/commands/web.js)
  └── POST /api/projects — new validation branch for type='folder'
        validateLocation(location, 'folder') → checks fs.statSync isDirectory()

COLLECTOR (lib/collector/index.js)
  └── collectAll() — new branch: if project.type === 'folder'
        scanFolder(location) → returns synthetic project entries for valid children
        each child entry: { id, name, type:'local', location: childPath, parentFolder: location }
        parent entry itself is NOT emitted to dashboard.json

LIB/COLLECTOR/FOLDER-SCANNER.JS (new file)
  └── scanFolder(folderPath)
        → fs.readdirSync(folderPath, { withFileTypes: true })
        → filter: isDirectory() && !isSymbolicLink() (no symlink follow)
        → filter: isValidProject(childPath)   — checks package.json OR .aitri/
        → map: synthetic project stub { name: dirName, location: childPath, parentFolder }

REACT (web/src/components/AdminAddForm.jsx)
  └── type select: add 'folder' option
  └── conditional helper text when type === 'folder'
  └── location label: 'Folder path' when type === 'folder'
```

No new npm dependencies. No new ports. No new processes.

---

## Data Model

### projects.json — no schema change
A folder entry is stored like any other project:
```json
{ "id": "abc12345", "name": "My Workspace", "type": "folder", "location": "/Users/you/Projects", "addedAt": "..." }
```

### dashboard.json — synthetic child entries
Children emitted by `scanFolder` appear in the `projects` array as regular project entries:
```json
{
  "name": "aitri-hub",
  "location": "/Users/you/Projects/aitri-hub",
  "type": "local",
  "parentFolder": "/Users/you/Projects",
  ...
}
```
The parent folder entry (`name: "My Workspace"`) is **not** present in `dashboard.json`.

---

## API Design

### POST /api/projects — extended validation for type='folder'

**New validation branch** in `validateLocation(location, type)`:

```
type === 'folder':
  1. if location.includes('..') → { error: 'path_traversal' }   (existing check)
  2. if !path.isAbsolute(location) → { error: 'location_required' }
  3. if !fs.existsSync(location) → { error: 'path_not_found' }
  4. if !fs.statSync(location).isDirectory() → { error: 'not_a_directory' }
  5. else → null (valid)
```

No other endpoint changes.

---

## ADR-01 — Where to put folder scanning logic

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A — New file lib/collector/folder-scanner.js** ✅ | Pure function exported, imported by index.js | Testable in isolation; single responsibility | One extra file |
| B — Inline in lib/collector/index.js | No new file | Simpler | index.js already complex; harder to unit-test scan logic |

**Chosen: Option A.** The scan logic (readdirSync + validity filter) is independently testable and has a clear single responsibility.

---

## ADR-02 — How to represent children in dashboard.json

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A — Flat entries with parentFolder field** ✅ | Each child appears as a regular project entry; parentFolder is metadata | No frontend changes; HomeView renders cards identically | parentFolder is invisible to user (no UI for it yet) |
| B — Nested structure: folder entry contains children array | Parent entry has `children: [...]` | Explicit grouping | Requires frontend changes to render; breaks existing card component |

**Chosen: Option A.** Frontend requires zero changes. Cards render identically. parentFolder field is available for future UI features.

---

## ADR-03 — Symlink handling

| Option | Description | Pros | Cons |
|---|---|---|---|
| **A — Skip symlinks entirely** ✅ | `withFileTypes.isSymbolicLink()` → skip | Safe; no traversal outside registered dir | Legitimate symlinked projects inside the folder are not discovered |
| B — Follow symlinks with realpath check | Resolve symlink, check if within registered dir | Discovers symlinked projects | More complex; edge cases with circular links |

**Chosen: Option A.** Security constraint in NFR-022. Simpler code. Symlink projects can still be registered manually.

---

## Security Design

- Path traversal: existing `..` check in `validateLocation` applies to folder type too
- Symlinks: skipped at scan time using `withFileTypes` `isSymbolicLink()` check
- Folder scan reads only directory names — no file contents read during scan itself
- Admin API still localhost-only (existing check unchanged)

---

## Performance & Scalability

- `readdirSync` on a directory with ≤50 children: ~1–5ms on local SSD (well within ≤500ms NFR)
- Collector calls `scanFolder` synchronously; no parallelism needed at this scale
- If folderPath is missing: `try/catch` around `readdirSync` → returns `[]` in ≤1ms

---

## Deployment Architecture

No deployment changes. Same Node.js process. Same port. Same Docker image.

The new file `lib/collector/folder-scanner.js` ships with the existing package.

---

## Risk Analysis

| Risk | Severity | Mitigation |
|---|---|---|
| Folder with 500+ children slows collector | Medium | NFR-020 target is ≤50; warn in logs if >100 children found |
| User registers /home or / as folder path | High | No depth restriction prevents abuse; mitigated by: valid children must have package.json or .aitri, so /home typically yields 0–2 entries |
| Folder removed between registration and collection | Low | try/catch on readdirSync → returns [] gracefully |

---

## Technical Risk Flags

- [RISK: MEDIUM] No cap on children count — a folder with 500 subdirectories (each with package.json) would generate 500 collector cycles per tick. Mitigation: log a warning when >100 children found; no hard block at this stage.
