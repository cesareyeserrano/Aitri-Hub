## Feature
Replace the hardcoded `INTEGRATION_LAST_REVIEWED` constant in `lib/constants.js` with a user-data-directory manifest file (`~/.aitri-hub/integration-compat.json`) that is re-read on every collection cycle, written only via an explicit `aitri-hub integration review` command, and tied to a hash of the CHANGELOG entry that the reviewer attests to.

## Problem / Why
Today, Hub's Aitri-Core integration gate depends on a hardcoded ES-module constant (`lib/constants.js:30`). This produces three related defects:

1. **Runtime staleness (Capa 1).** The constant is loaded once by Node's ESM import system. When a developer bumps the value, the running `aitri-hub web` process continues to surface the old number until someone restarts it — the dashboard reports `integrationAlert.message` based on in-memory state, not the current source file. Confirmed today: working-tree value `0.1.80`, globally-installed value `0.1.80`, running process alert says `past 0.1.79`.
2. **Review incentive (Capa 2 — root cause).** Bumping the constant is a zero-cost edit. Nothing proves the developer actually read `docs/integrations/CHANGELOG.md` before declaring "reviewed." The gate becomes a rubber stamp: `just bump it to silence the warning`. The alert stops serving its purpose.
3. **Redistribution friction.** Because the reviewed version is a compile-time constant inside the npm package, every review bump requires a package release. Users on older Hub versions cannot "take ownership" of their own review status locally.

BL-001 already captured this. This feature is its execution.

## Target Users
- **Solo developer / Portfolio manager** (existing personas from `spec/01_REQUIREMENTS.json`): they see the alert and want a trustworthy path to clear it that is not "edit source and restart."
- **Hub maintainer**: wants to know reviews are real, not rubber stamps, and that the manifest survives CLI upgrades without code changes.

## New Behavior
- The system must read integration-compat state from `~/.aitri-hub/integration-compat.json` on every collection cycle (not at process boot).
- The system must fall back to a safe default (`reviewedUpTo: null` → warn on any CLI newer than Hub-package's declared baseline) when the manifest is absent.
- The system must provide a new CLI subcommand `aitri-hub integration review <version>` that:
  - Fetches or accepts the local path of `docs/integrations/CHANGELOG.md` for the named version
  - Computes a SHA-256 of the CHANGELOG section between the previous reviewed version and the newly asserted one
  - Writes `{ reviewedUpTo, reviewedAt, changelogHash, reviewerNote }` to the manifest
- The system must refuse to write the manifest if the computed CHANGELOG hash would cover zero characters (i.e. the version string was not found in the CHANGELOG).
- The system must surface, in the integration-alert payload, the timestamp and CHANGELOG hash from the last review so the web UI can render provenance alongside the warning.
- The system must treat the old `INTEGRATION_LAST_REVIEWED` constant as a deprecated hardcoded default used only when no manifest exists; remove it from the public contract once migration lands.
- The system must update `lib/collector/integration-guard.js` so the reference version comes from the re-read manifest, not from the ESM import.
- The system must not require a web-process restart after a review command; the next collection cycle (≤ `REFRESH_MS`) must reflect the new state.

## Success Criteria
- **Given** the running `aitri-hub web` process and Aitri CLI `0.1.82`, **when** a developer runs `aitri-hub integration review 0.1.82` (supplying a valid CHANGELOG entry), **then** within one `REFRESH_MS` tick the dashboard's `integrationAlert` field transitions to `null` with no process restart.
- **Given** no `integration-compat.json` manifest, **when** the collector runs, **then** the alert is generated against a safe default baseline declared inside the Hub package, and the behavior matches today's pre-review state.
- **Given** a manifest was written with a CHANGELOG hash, **when** `docs/integrations/CHANGELOG.md` is subsequently modified for that version, **then** the next collection cycle detects the hash mismatch and re-asserts a warning `integration changelog modified since review`.
- **Given** a user runs `aitri-hub integration review 99.99.99` for a version absent from CHANGELOG, **then** the command exits non-zero with `changelog entry not found` and does not write the manifest.
- **Given** two successive `aitri-hub integration review` calls with the same version, **then** the second is a no-op (idempotent).

## Out of Scope
- Automated fetching of `docs/integrations/CHANGELOG.md` over the network. v1 reads a local copy path supplied by the user or bundled with the Hub package; network fetch is a follow-up.
- Multi-user review workflows (signing, peer approval). This is single-developer attestation only.
- Retroactive migration of the currently-hardcoded `INTEGRATION_LAST_REVIEWED = '0.1.80'` value into the manifest automatically. Users opt in by running the new command; until then, the fallback path applies.
- Changes to the React banner's visual design beyond adding the two new provenance fields (`reviewedAt`, `changelogHash`). UI redesign is not in this feature.
- Changes to how sub-feature pipelines consume the integration gate — they continue to rely on Hub's collector output.
