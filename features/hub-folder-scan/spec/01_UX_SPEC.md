# UX Spec — hub-folder-scan

## Archetype
**Power User Workspace Manager** — a developer who maintains 10+ projects and values efficiency over configuration. Registers a folder once; expects all children to appear automatically.

---

## Screens Affected

### 1. Add Project Form (/admin) — type dropdown extended
**Change:** Add `folder` as a third option in the type `<select>` alongside `local` and `remote`.

**States:**
- **Default:** Dropdown shows `local` selected (unchanged)
- **folder selected:** Helper text appears below the type field; location label updates to "Folder path"
- **Loading:** Submit button shows spinner (unchanged behavior)
- **Error:** Inline validation error below location field for `path_not_found` or `not_a_directory`
- **Empty:** Location field placeholder reads "e.g. /Users/you/Projects"
- **Disabled:** All fields disabled while a submit is in-flight

**Helper text (folder type only):**
> Scans immediate child directories — each one with `package.json` or `.aitri` appears as its own card.

Layout: helper text sits 4px below the type select, font-size 12px, color `var(--text-secondary)` (#9ca3af). Max-width matches the type select field.

---

### 2. Home View — folder-derived project cards

**Change:** Cards derived from a folder scan look identical to manually-registered cards. No visual distinction is needed (parentFolder is metadata only, not shown in the UI).

**States:** Identical to existing ProjectCard states — covered by hub-mvp-web UX spec.

---

## Design Tokens (inherits from hub-mvp-web)

| Token | Value |
|---|---|
| Background | #111827 |
| Surface | #1f2937 |
| Primary | #6366f1 |
| Accent | #10b981 |
| Error | #ef4444 |
| Text primary | #f9fafb |
| Text secondary | #9ca3af |
| Font | system-ui, -apple-system, sans-serif |

---

## Responsive Behavior

| Breakpoint | Add Project Form |
|---|---|
| 375px | Helper text wraps to 2 lines; no horizontal overflow |
| 768px | Inline single row; helper text on second line |
| 1440px | Form max-width 480px; helper text on second line |

---

## User Flows

### Flow 1 — Register a workspace folder
1. User opens /admin
2. Clicks "Add project"
3. Enters folder name (e.g. "My Workspace")
4. Selects type = **folder**
5. Helper text appears: _"Scans immediate child directories — each one with package.json or .aitri appears as its own card."_
6. Enters location: `/Users/you/Projects`
7. Clicks Submit → 201 response → form clears → project list shows new folder entry
8. Within 5s, dashboard cards appear for each valid child directory

### Flow 2 — Invalid folder path error
1. User selects type = folder, enters `/tmp/notadir.txt` (a file, not a directory)
2. Clicks Submit → 400 response with error `not_a_directory`
3. Inline error shown: "Path is not a directory"
4. User corrects to `/tmp` → submits successfully

---

## Component Inventory

| Component | Change | States |
|---|---|---|
| `AdminAddForm` (type `<select>`) | Add `folder` as third option | default, folder-selected |
| Helper text `<p>` (new, inline) | Shown only when type=folder | visible, hidden |
| Location `<input>` label | Conditionally reads "Folder path" when type=folder | default ("Location"), folder |
| Validation error display | Reuse existing inline error component | new error code `not_a_directory` |

---

## Nielsen Compliance

| # | Heuristic | Applied |
|---|---|---|
| 1 | Visibility of system status | Helper text immediately shows what folder type does before submit |
| 2 | Error prevention | `not_a_directory` error prevents silent failure from adding a file path |
| 3 | Recognition over recall | Helper text visible whenever folder is selected; no need to remember behavior |
| 4 | Consistency and standards | Folder type uses same error display pattern as local/remote |
| 5 | Aesthetic and minimalist design | Helper text appears only for folder selection — no clutter for other types |

Violations found: 0 | Corrected: 0 | Accepted trade-offs: No visual badge on folder-derived cards (adds complexity for marginal value)

---

## Nielsen Heuristics Applied

1. **Visibility of system status** — helper text immediately tells the user what `folder` type does before they submit
2. **Error prevention** — `not_a_directory` error prevents silent failure where user adds a file path
3. **Recognition over recall** — helper text is always visible when `folder` is selected; user doesn't need to remember behavior
4. **Consistency** — `folder` type uses same validation error display pattern as `local` type
5. **Aesthetic and minimalist design** — helper text appears only when `folder` is selected; no clutter for `local`/`remote` users

**Nielsen violations corrected:** 0
**Accepted trade-offs:** No visual badge on folder-derived cards (metadata-only; adds complexity for marginal value)
