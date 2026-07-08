# BUILD_PLAN — contract-catchup-rc161

Working file (not a pipeline artifact). Clusters ordered so each leaves the suite green.

## Cluster 1 — projection (FR-061, FR-062) — status: done
- `lib/collector/snapshot-reader.js`: new exported `projectQualitySurfaces(s)` mirroring the
  `projectAggregatedTestSummary` defensive pattern; wire into `projectFromSnapshot` as
  `...(qualitySurfaces ? { qualitySurfaces } : {})` (the `resultsBinding` additive-key precedent).
- Unit tests: TC-061h/e/f, TC-062h/e/f in the snapshot-reader unit suite.

## Cluster 2 — lastSession preference (FR-060) — status: done
- `lib/collector/index.js`: gate the `.aitri.local` inline fallback on
  `!('lastSession' in result.snapshot)` (ADR-1 Option A; `result.snapshot` is already in scope
  at index.js:246 — no plumbing needed, the TRD consequence is pre-satisfied).
- Integration tests: TC-060h/e/f (poison `.aitri.local` technique) + TC-056h/e/f golden-record pins.

## Cluster 3 — regression pins + manifest (FR-063, FR-064, NFR-057/058) — status: done
- TC-063h/e (evaluateIntegrationAlert vs manifest fixture at rc.161); TC-057/058 map onto the
  existing suites run unmodified (assert zero diffs to those files).
- Ship-time data edit: `~/.aitri-hub/integration-compat.json` reviewedUpTo → 2.0.0-rc.161.

## Cluster 4 — build report + verify — status: done
- 04_BUILD_REPORT.json (files_created/modified, test_runner, technical_debt: [] — TC-064f pins
  that no blocked-on-Core debt is re-filed), complete/approve 4, verify-run, verify-complete.
