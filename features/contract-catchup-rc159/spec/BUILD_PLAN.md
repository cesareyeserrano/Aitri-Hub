# BUILD_PLAN — contract-catchup-rc159

Working file (ADR-071 plan-first protocol). Clusters ordered by the TRD's risk flag 1:
comparator vectors land green BEFORE any call-site migrates.

## Cluster C1 — Foundation modules (pure, zero call-site changes) — `done`
- FRs: FR-040 (module only), FR-041 (resolver only), FR-043 (layoutBase only), NFR-045
- Build: `lib/utils/semver.js` (parseSemver/compareSemver/gteSemver); `resolveArtifact` +
  `LEGACY_ALIASES` in aitri-reader; `layoutBase` confinement helper.
- TCs: TC-040h/e/f, TC-041e/f, TC-043e/f, TC-145h/e/f
- Rationale: everything downstream imports these; exhaustive vectors green first.

## Cluster C2 — Fallback readers (FR-041/042/043 complete) — `done`
- Build: ARTIFACT_MAP → rc.41 names; compliance-reader via resolver; `.aitri.local`
  merge in readAitriState; layoutBase wired into artifact/feature path resolution;
  scan regression pin. Golden legacy fixture committed (NFR-041).
- TCs: TC-041h, TC-042h/e/f, TC-043h, TC-141h/e/f
- Rationale: fallback correctness before touching version routing (C3) so the golden
  fixture isolates reader changes from comparator changes.

## Cluster C3 — Version call-site migration (FR-040 complete, FR-046) — `done`
- Build: 5 sites (aitri-version-reader, integration-guard, collector/index eligibility,
  compat-manifest, alerts/engine) → semver module, one commit; `integration review`
  full-tag store + parse gate.
- TCs: TC-140e, TC-046h/e/f (+ TC-040 vectors re-run as regression)
- Rationale: highest-risk refactor, done only after C1 vectors + C2 golden are green.

## Cluster C4 — Snapshot projection, alerts, inline indicators (FR-044/045, FR-047 partial, NFR-040/044) — `done`
- Build: projection passthrough (bugs.parseErrors, resultsBinding, quality gates,
  ac_coverage, coverage-audit freshness — presence+shape guarded); alert rules
  BUGS_PARSE_ERROR + RESULTS_UNBOUND; fallback bugs-reader parse-error marker;
  BugBadge unknown state + ProjectCard tests warning line; schema-diff helper.
- TCs: TC-044h/e/f, TC-045h/e/f, TC-047h/e/f, TC-140h/f, TC-144h/e/f
- Rationale: consumes C1/C3 (semver display) and C2 (fallback bugs reader).

## Cluster C5 — Regression closure + shipping ritual — `done`
- Run existing admin-api e2e + remote-sync suites with UNMODIFIED assertions
  (TC-142h/e/f, TC-143h/e/f map to them); full `test:all`; manifest 04_BUILD_REPORT.json
  with quality_gates (lint) + test_runner; perform the rc.1→rc.159 integration CHANGELOG
  review and record it (`integration review 2.0.0-rc.159`) — FR-046 ritual half.
- Rationale: closure gate; nothing new lands here except the manifest and the ritual.

## Progress notes
- (C1 done) semver.js + resolveArtifact/LEGACY_ALIASES + layoutBase landed, additive only (no behavior change yet). 20/20 unit asserts green: TC-040h/e/f, TC-041e/f, TC-043e/f, TC-145h/e/f.
- (C2 done) ARTIFACT_MAP → rc.41 names; compliance-reader via resolveArtifact; .aitri.local merge; layoutBase wired in aitri-reader + collectOne (fallback & always-run readers; artifactsDir now computed AFTER the state read). Golden fixture committed (captured with PRE-change readers); 10/10 new asserts green; existing suite 372 + 16 e2e green.
- (C3 done) 5 call-sites migrated to utils/semver (version-reader full-tag regex, guard, eligibility, manifest gate, engine); integration review accepts pre-release + rejects junk BEFORE writing. 387/387 green; "truncation stays dead" pinned (rc.15 vs rc.159 no false alert).
- (C4 done) projection carries bugs.parseErrors + resultsBinding (strict enum, absent-when-absent); fallback bugs-reader parse-error marker (syntax AND shape); 2 alert rules; BugBadge '?' pill + card unbound line; snapshot-first proven by disagreeing-sources fixture. TC-140f corrected via pipeline feedback (contradicted parent FR-017 — phase 3 needs RE-APPROVAL). FR-047 finding: status --json does NOT expose quality_gates/ac_coverage as of rc.159 → no_go_zone says feedback-to-Core, not workaround → declared as technical_debt + Core feedback item (candidate rc.160 additive).
- (C5 done) Full suite green: 401/401 node (unit+integration incl. 16-test e2e admin-api via npm test), 21/21 web vitest. Lint 0 errors (14 pre-existing warnings). Old TC-017e assertion updated: FR-044 supersedes null-on-malformed (recorded in manifest files_modified). Manifest written with quality_gates (lint, web-tests) + test_runner_timeout_ms. RITUAL DONE: Core integrations CHANGELOG got its rc.159 entry (doc-only commit 8c4a0ab — feature-dir renames are consumer-relevant); `integration review 2.0.0-rc.159` recorded — reviewedUpTo now carries the FULL pre-release tag against the real manifest. PENDING: phase 3 re-approval (TC-140f correction), then complete 4 → verify-run.
- (ADVERSARIAL PASS 2026-07-05 — 2 ship-blockers caught BEFORE commit, both fixed:) (1) contained-layout double-prefix: I misread the contract — artifactsDir is PROJECT-ROOT-relative and already includes layoutRoot ('aitri/product/spec'); my layoutBase+artifactsDir joins broke every reader + masked drift for rc.76+ fallback projects, and my own tests encoded the same misreading (green suite was cover, not evidence). Fixed: artifact reads back to projectDir+artifactsDir; layoutBase now used ONLY for <layoutRoot>/features; fixture/TCs corrected to the real contract. (2) FR-042 vs SCHEMA.md 'never read .aitri.local': resolved by scoping the Core guidance (display-only same-machine reads legitimate — Core commit 0acd079) + snapshot-path inline lastSession now also reads own-machine .aitri.local. Minors fixed: layoutBase path.resolve(projectDir) (trailing-slash rejection), compareSemver validates pre-parsed objects (NaN trap). Residuals accepted: both-names drift false-positive window (hand-copied file case), lenient leading-zero pre-release ids, reconcileState/sessionContext merged but unconsumed (FR text faithful). Core feedback filed (HUB-CATCHUP-0705): expose lastSession + quality_gates/ac_coverage on status --json. All suites re-verified green after fixes: 401 node + 21 web + lint 0 errors.
- (post-verify iteration) verify-complete refused e2e coverage for TC-142h/e/f — correct: their ids never appeared in runner output. Added tests/e2e/admin-regression-142.test.js (TC-142h/e id-mapped wrappers, 2/2 green; DELETE contract is 204 — TC-142e aligned); TC-142f → automation manual (remoteAddress guard unreachable from a loopback harness — lib/commands/web.js:118-124), pending `aitri tc verify` with evidence after re-approvals.
