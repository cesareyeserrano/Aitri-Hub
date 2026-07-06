## Feature
Bring the Hub's Aitri-integration layer (collectors, readers, version logic, compat
manifest) up to the Aitri v2.0.0-rc.159 contract.

## Problem / Why
The Hub's readers were last reviewed at the 2.0.0-alpha.3 era (compat manifest,
2026-04-24). Since then Aitri Core published ~60 integration-contract entries, 9 of
them breaking. Concretely verified in the code (2026-07-05):

1. **Pre-release semver truncated** — the integration-layer version regexes accept
   stable `X.Y.Z` only and silently drop `-rc.N`/`-alpha.N`, so `2.0.0-rc.159` reads
   as `2.0.0`. Version compare, the snapshot eligibility gate, and the review
   baseline all miscompute against the rc channel the ecosystem actually runs.
   (Already a P2 in BACKLOG.md.)
2. **Fallback readers use pre-rc.41 artifact names** — `aitri-reader.js` ARTIFACT_MAP
   and the compliance reader read `04_IMPLEMENTATION_MANIFEST.json` /
   `05_PROOF_OF_COMPLIANCE.json`; renamed rc.41 to `04_BUILD_REPORT.json` /
   `05_TRACEABILITY.json`. The fallback path exists to serve OLD CLIs, so readers
   must accept both names (new first, old fallback), not just swap.
3. **`.aitri`/`.aitri.local` split (rc.51) not modeled** — per-machine fields
   (`lastSession`, `reconcileState`, `sessionContext`) moved to gitignored
   `.aitri.local`; the fallback reader reads them from `.aitri` only. Remote clones
   never have `.aitri.local`; readers must merge when present, tolerate absence.
4. **Contained layout (rc.76 `layoutRoot`) unhandled** — directory scan and fallback
   readers assume the flat layout.
5. **New machine surfaces not consumed** — `status --json` `bugs.parseErrors`
   (corrupt BUGS.json currently indistinguishable from zero bugs), `resultsBinding`
   (results not bound to a real verify run), `quality_gates` results;
   `validate --json` now has a contract doc (VALIDATE_JSON.md).
6. **Baselines are fossils** — `reviewedUpTo` at alpha.3 era, `FALLBACK_BASELINE
   '0.1.80'`, snapshot floor `'0.1.77'` — all predating the 2.0.0-rc channel.

Every future Hub view (QA Workspace, overview restyle — see
`idea_context/UI_UX_SPEC_V2.md`) reads through this layer; it must be correct first.

## Target Users
Existing Hub users (the QA/PM/PO/BA roles monitoring Aitri projects) on projects
managed with current Aitri (2.0.0-rc channel). Also protects users with legacy
0.1.x projects, which the fallback path must keep serving.

## New Behavior
- The system must parse and compare full semver including pre-release tags
  (`2.0.0-rc.159` > `2.0.0-rc.15` > `2.0.0-alpha.3`; numeric rc/alpha ordering, not
  lexicographic) everywhere a version is compared or displayed.
- The system must read `04_BUILD_REPORT.json` and `05_TRACEABILITY.json` in the
  fallback path, falling back to the pre-rc.41 names when the new names are absent.
- The system must merge `.aitri.local` into the fallback state view when the file
  exists and degrade gracefully (no error, fields absent) when it does not.
- The system must discover and read projects using the contained layout
  (`.aitri#layoutRoot`) in both the directory scan and the fallback readers.
- The system must surface `bugs.parseErrors` from `status --json` as a per-project
  warning (corrupt BUGS.json must be distinguishable from zero bugs).
- The system must surface `resultsBinding` absence/staleness as a per-project
  indicator when the snapshot provides it.
- The system must record the integration review baseline as a full pre-release
  version (e.g. `2.0.0-rc.159`) in `integration-compat.json`, and the review of the
  rc.1→rc.159 CHANGELOG (including its 9 breaking entries) must be performed and
  recorded as part of this feature.

## Success Criteria
- Given a project on Aitri 2.0.0-rc.159, when the Hub collects it via the snapshot
  path, then version displays/compares show the full rc tag and no spurious
  version-mismatch or integration alerts fire after `integration review 2.0.0-rc.159`.
- Given a legacy project (pre-rc.41 artifact names, old CLI), when collected via
  the fallback path, then pipeline/tests/compliance/drift render exactly as before
  (no regression).
- Given a post-rc.41 project WITHOUT a working `aitri` CLI (fallback path), when
  collected, then compliance and drift read the new artifact names correctly.
- Given a project whose BUGS.json is corrupt, when collected, then the dashboard
  shows a parse-error warning, not "0 bugs".
- Given a remote (GitHub) project with no `.aitri.local`, when collected, then no
  error and no fabricated lastSession appears.

## Touch Points
Modifies existing modules (no new commands): `lib/collector/aitri-reader.js`
(ARTIFACT_MAP, state fields), `lib/collector/compliance-reader.js`,
`lib/collector/snapshot-reader.js` (projection of new fields),
`lib/collector/index.js` (eligibility gate), `lib/utils/scan.js` (contained layout),
`lib/integration/` version regexes + `lib/store/compat-manifest.js` +
`lib/constants.js` (baselines), `lib/alerts/engine.js` (new alert rules),
`web/src` ProjectCard/alert surfaces for the two new indicators (display only —
[ASSUMPTION] minimal display of parseErrors/resultsBinding belongs here rather than
waiting for the UI layers, because invisible data has no consumer; confirmed
direction with owner 2026-07-05, exact placement is implementer's call).

## Must Not Break (Regression Boundary)
- Snapshot-first collection: a snapshot-eligible project must still be collected
  via `aitri status --json`, never demoted to fallback (FR-017 semantics).
- Legacy fallback rendering: a pre-rc.41 project renders pipeline, tests, bugs,
  compliance, and drift identically to today.
- Localhost-only admin API and project registry CRUD keep working unchanged.
- Remote project sync (clone/pull cache, poller backoff) keeps working unchanged.
- Dashboard write cycle: `dashboard.json` keeps its shape — all additions to the
  Hub's own output are additive (Hub has its own downstream consumer: the SPA).

## Out of Scope
- All new UI views (overview restyle, QA Workspace tabs) — Layers 1–2, separate
  features per `idea_context/UI_UX_SPEC_V2.md`.
- GitHub API metrics (velocity/PRs), dependency scanning, runtime monitoring — cut
  from v1 by owner decision (2026-07-05).
- `coverage_map`/`ac_coverage`/`validate --json` full rendering — consumed by the
  QA Workspace feature; this feature only ensures the data layer can read them.
