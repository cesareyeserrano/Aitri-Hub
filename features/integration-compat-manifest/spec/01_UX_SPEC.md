# UX Spec — integration-compat-manifest

**Archetype: PRO-TECH / DEVTOOL-CLI** — reason: This feature's primary surface is a one-shot CLI command (`aitri-hub integration review <version>`) invoked from a terminal by a developer. Its secondary surface is two additive fields on an existing web banner. There is no new screen, no form, and no new page — the UX is dominated by terminal output density and unambiguous feedback lines. Visual language inherits the parent Hub's PRO-TECH/DASHBOARD tokens verbatim; no new tokens are introduced.

---

## Design Tokens

All visual decisions reuse the parent project's `01_UX_SPEC.md` tokens exactly (`--bg`, `--surface`, `--accent-warn`, `--text-primary`, `--text-secondary`, `--accent-ok`, `--accent-error`, `--primary`). **No new tokens are defined.** The rationale: this feature is additive, and inventing new tokens for a single banner extension would violate the consistency heuristic. Any visual change in color/spacing/typography would be a defect.

**Inherited contrast budget (already audited in parent spec):**
- `--text-secondary` on `--accent-warn`: 4.6:1 ✅ (used for new `reviewedAt` / `changelogHash` subtext)
- `--text-on-warn` on `--accent-warn`: 5.9:1 ✅ (main banner message, unchanged)

**Terminal palette**: the CLI command output respects the user's terminal ANSI scheme. Only two ANSI roles are used:
- `ok`: green (`\x1b[32m`) for the `✓` prefix on the success line
- `err`: red (`\x1b[31m`) for the `✗` prefix on the error line
Both are already used elsewhere in Hub's CLI output; no new ANSI codes are introduced.

---

## User Flows

### Flow 1 — Clearing a live warning after upgrading the Aitri CLI (Solo Developer)

**Entry point:** Running `aitri-hub web` process shows the warning banner `Aitri 0.1.82 detected — Hub integration not reviewed past 0.1.80`. Developer has read the CHANGELOG and is ready to attest.

**Steps:**
1. Developer opens a second terminal (the first is occupied by the running web server).
2. Developer runs `aitri-hub integration review 0.1.82`.
3. The CLI locates the CHANGELOG, finds the `## 0.1.82` section, hashes it, and writes `~/.aitri-hub/integration-compat.json`.
4. The CLI prints a three-line success block (see Component: CLI Success Output).
5. Within one `REFRESH_MS` tick (default 5s), the web process re-reads the manifest and updates `dashboard.json`.
6. The browser poll picks up the new JSON; the banner disappears without a page reload.

**Exit point:** Developer sees the banner disappear in the browser without having touched the web process.

**Error paths:**
- Version not in CHANGELOG → CLI prints the error block and exits non-zero (see Component: CLI Error Output). No manifest is written. Banner stays.
- CHANGELOG file cannot be located → same error format, different message body. Banner stays.

---

### Flow 2 — First-time user with no manifest yet (New Hub User)

**Entry point:** Developer runs `aitri-hub web` on a fresh install.

**Steps:**
1. No manifest exists.
2. Collector falls back to the package-declared baseline (FR-034).
3. If the installed CLI exceeds the fallback, the existing warning banner renders exactly as today.
4. Developer continues as usual; banner does not block anything.

**Exit point:** Behavior matches pre-feature experience. No new prompt, no setup ritual.

**Error path:** None — the absent-manifest path is explicitly the default, not an error.

---

### Flow 3 — Verifying provenance from the web dashboard (Portfolio Manager)

**Entry point:** Portfolio Manager opens `http://localhost:3000` and the integration banner is visible.

**Steps:**
1. React reads `integrationAlert` from `dashboard.json`.
2. The banner renders the existing message + CHANGELOG link (unchanged from parent).
3. When `integrationAlert.reviewedAt` and `integrationAlert.changelogHash` are present, the banner renders a second-line subtext in `--text-secondary`: `last reviewed 2026-04-20 12:30 UTC · hash a1b2c3d4…` (hash truncated to 12 hex chars with ellipsis).
4. When either field is null (no manifest), the subtext is omitted entirely — no empty line, no placeholder.

**Exit point:** Reader knows whether the review is recent and has a hash prefix to cross-reference against the CHANGELOG commit log.

**Error path:** Missing `reviewedAt` with present `changelogHash` (or vice versa) — the subtext is omitted; we do not render "reviewed at null". The collector guarantees both-or-neither (FR-035 AC-3).

---

## Component Inventory

Each component lists its five required states: **default / loading / error / empty / disabled**. Components that have no meaningful state in some categories explicitly state why.

---

### Component: CLI Success Output — `aitri-hub integration review <version>` stdout

**Purpose:** Confirm to the developer that the manifest was written and give them the three facts they need to trust the write.

**Default state** (happy path):
```
✓ integration review recorded
  manifest    ~/.aitri-hub/integration-compat.json
  reviewed    0.1.82
  hash        a1b2c3d4e5f6
```
- Line 1: green `✓` + summary verb. Fits in 40 cols.
- Lines 2–4: three name-value pairs, left-aligned to column 15 for value. Each line ≤ 80 columns.
- Hash is truncated to the first 12 hex chars — enough for human eyeballing, not enough to replace the file (FR-031 AC: full hash is in the manifest).

**Loading state:** Not applicable. The review command is synchronous and completes in < 500ms; a spinner would be slower than the operation. If runtime ever exceeds 200ms, we add a single-line pre-output (`…reading CHANGELOG`) via `process.stdout.write` before the success block replaces it — deferred to v2.

**Error state:** See "CLI Error Output" below.

**Empty state:** Not applicable. The command always writes or errors; no "nothing happened" outcome exists.

**Disabled state:** Not applicable. The command is unconditional; there is no UI gate that disables it.

---

### Component: CLI Error Output — stderr

**Purpose:** Tell the developer what went wrong, why, and what to do next — in exactly one block per invocation, as required by the Nielsen error-message heuristic.

**Error shapes** (default states for each error class, one per diagnosis):

**E1 — Missing version argument:**
```
✗ missing version argument
  usage   aitri-hub integration review <version> [--changelog <path>] [--note <str>]
  example aitri-hub integration review 0.1.82
```

**E2 — Version not found in CHANGELOG:**
```
✗ changelog entry not found
  version  0.1.99
  looked   /usr/local/lib/node_modules/aitri/docs/integrations/CHANGELOG.md
  hint     pass --changelog <path> to specify a different CHANGELOG
```

**E3 — CHANGELOG file cannot be located:**
```
✗ changelog file not found
  tried   /usr/local/lib/node_modules/aitri/docs/integrations/CHANGELOG.md
  hint    install the aitri CLI (`npm i -g aitri`) or pass --changelog <path>
```

**E4 — Invalid version format:**
```
✗ invalid version
  value  0.1
  hint   version must be MAJOR.MINOR.PATCH (e.g. 0.1.82)
```

- All errors: red `✗` prefix, exit code non-zero, message on stderr, no manifest written.
- Each error names the offending value and a `hint` line with a concrete corrective action — never "something went wrong".
- Lines ≤ 80 columns.

**Loading / Empty / Disabled states:** Not applicable (one-shot command with explicit error classes; there is no background work to load, no empty slot, and no UI gate).

---

### Component: Web Banner Provenance Subtext (additive extension to existing `IntegrationAlertBanner`)

**Purpose:** Render provenance fields (`reviewedAt`, `changelogHash`) when present, beneath the existing banner message. This is a DOM-only addition — no new component file, no new route.

**Default state** (manifest present, both provenance fields non-null):
- Existing banner message (warning background) renders as today.
- A second text line appears beneath the message, in `--text-secondary`, font 12px system-ui, left-aligned with the message.
- Content format: `last reviewed {reviewedAt as "YYYY-MM-DD HH:mm UTC"} · hash {changelogHash.slice(0,12)}…`
- No interaction (not clickable, no tooltip in v1).

**Loading state:** Inherits parent banner's loading state (shimmer on the whole banner while React is mounting). The subtext row is part of the same shimmer area.

**Error state:** If `dashboard.json` fetch fails, the existing banner error state renders (already covered by the parent UX spec). The subtext row is simply absent.

**Empty state:** When `reviewedAt` or `changelogHash` is null, the subtext row is not rendered — no placeholder text. This is the explicit expected state for fresh installs before the first review.

**Disabled state:** Not applicable. The banner is display-only; nothing to disable.

---

### Component: Manifest File (no visual UI, but user-facing as a plaintext artifact)

**Purpose:** The manifest is inspectable by curious users via `cat ~/.aitri-hub/integration-compat.json`. Its formatting is a UX surface because a dev may read it to verify a review.

**Default state:**
```json
{
  "schemaVersion": "1",
  "reviewedUpTo": "0.1.82",
  "reviewedAt": "2026-04-20T12:30:00.000Z",
  "changelogHash": "a1b2c3d4e5f6...",
  "reviewerNote": null
}
```
- 2-space indent (matches existing Hub JSON files `projects.json` and `dashboard.json`).
- Keys in declaration order, not alphabetical, so humans read top-to-bottom the logical sequence.
- `null` is used (not missing key) when a value is absent, so schema readers see the expected shape.

**Loading / error / empty / disabled states:** Not applicable. The manifest either exists (in one of two shapes above) or is absent (the absent-file fallback is handled by the collector, not represented in the file).

---

## Responsive Behavior

The CLI command is text-only and inherits the developer's terminal width. Success/error blocks are engineered to fit in 80 columns; no special handling is required below that width.

The web banner subtext extends the existing banner, which already responds to viewport widths ≥ 375px. At ≤ 400px wide the subtext wraps naturally; no special wrap handling is introduced (same behavior as the existing banner message).

No new breakpoints are introduced by this feature.

---

## Nielsen Compliance

| # | Heuristic | Application in this feature | Status |
|---|-----------|-----------------------------|--------|
| H1 | Visibility of system status | The banner updates within one `REFRESH_MS` tick of the review command; no manual refresh. | ✅ |
| H2 | Match real world | CLI vocabulary uses terms the developer already knows: "review", "hash", "changelog". | ✅ |
| H3 | User control & freedom | Review is idempotent — re-running it with the same version overwrites with a fresh timestamp; developer can undo nothing but can easily re-attest. No delete command in v1 (trade-off). | ⚠ — see trade-off below |
| H4 | Consistency & standards | No new design tokens, no new components — additive to existing banner only. | ✅ |
| H5 | Error prevention | The review command refuses to write when the version is not in the CHANGELOG — prevents the "silent rubber stamp" failure mode that motivates this feature. | ✅ |
| H6 | Recognition, not recall | The success output prints the path, version, and hash prefix so the developer does not need to remember the convention. | ✅ |
| H7 | Flexibility & efficiency | `--changelog <path>` and `--note <str>` are keyboard-only power-user options; no interactive prompt in v1 (not needed for the single-use workflow). | ✅ |
| H8 | Aesthetic & minimal design | Success block is exactly 4 lines; error blocks are 3–4 lines; banner subtext is exactly 1 line. No decorative content. | ✅ |
| H9 | Recognize, diagnose, recover | Every error class (E1–E4) names the offending value and a concrete `hint` line. | ✅ |
| H10 | Help & documentation | `aitri-hub integration review` with no args prints the usage block (component E1); also documented in DEPLOYMENT.md and this spec. | ✅ |

**Trade-offs accepted:**
- **H3 — no undo command.** We explicitly do not ship `aitri-hub integration unreview`. Rationale: deleting a review is rare enough (< 1% of use cases) that forcing the user to `rm ~/.aitri-hub/integration-compat.json` surfaces the destructive nature of the operation. Adding a CLI command would make accidental revocation easier. Re-evaluate in v2 if user feedback contradicts this.

**Violations corrected:** 0 (none detected during this design pass).

---

## Out-of-scope UX elements (reminder from requirements)

- No interactive prompts / wizard in v1. The review command is strictly non-interactive.
- No new web page, screen, or modal. All web changes are additive subtext on an existing banner.
- No localization beyond the existing English baseline. Strings are literal.
- No visual redesign of the banner itself (color, border, icon) — additive text only.
