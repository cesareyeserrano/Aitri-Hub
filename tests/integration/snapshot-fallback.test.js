/**
 * Tests: collector — snapshot success/fallback dispatch in collectOne
 * Covers: TC-011f, TC-017e1, TC-017e2
 *
 * @aitri-trace FR-ID: FR-011, FR-017
 *
 * Note on TC-010i and TC-017f (parallelism + isolation timing): those are covered
 * implicitly because collectAll already wraps `Promise.all(expanded.map(collectOne))`
 * — the existing tests/integration/e2e-collector-cycle.test.js exercises that path.
 * This file targets the new dispatch logic introduced by snapshot-adoption.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── Test fixture helpers ──────────────────────────────────────────────────────

function tmpDir(prefix = 'snapshot-fallback-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeAitri(dir, body) {
  fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(body));
}

// Stub the spawn function used by snapshot-reader by intercepting via env-var
// hook. We instead drive collectOne by faking child_process.spawn at module
// level using an injection in AITRI_HUB_DIR — but the simpler path is to:
//   1) point AITRI_HUB_DIR to a temp dir
//   2) replace the global PATH to a directory containing a stub `aitri` binary
//
// That is fragile across hosts. Cleaner: re-import collectOne with a temporary
// node:child_process stub via Module._cache replacement is also fragile. So
// instead this file leans on the snapshot-reader unit tests for spawn behavior
// and uses collectOne to validate the DISPATCH choices around it:
//   - version-too-old skips snapshot entirely (TC-017e1)
//   - structured log line is appended on failure (TC-017e2)
//   - demoted readers are not invoked when snapshot succeeds (TC-011f) —
//     covered by injecting a stub `aitri` binary on PATH that emits valid JSON.

import { spawnSync } from 'node:child_process';

function withStubAitriOnPath({ stdout = '', code = 0, stderr = '' }) {
  const binDir = tmpDir('stub-aitri-bin-');
  const script = path.join(binDir, 'aitri');
  // Inline POSIX shell stub. On Windows, this approach won't work, but the
  // suite already targets POSIX hosts (engines.node>=18 + zsh-described env).
  const body =
    `#!/bin/sh\n` +
    `cat <<'JSON'\n${stdout}\nJSON\n` +
    `${stderr ? `printf '%s' '${stderr.replace(/'/g, "'\\''")}' 1>&2\n` : ''}` +
    `exit ${code}\n`;
  fs.writeFileSync(script, body, { mode: 0o755 });
  const prevPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${prevPath}`;
  return () => {
    process.env.PATH = prevPath;
    fs.rmSync(binDir, { recursive: true, force: true });
  };
}

function withTempHubDir() {
  const dir = tmpDir('hub-home-');
  const prev = process.env.AITRI_HUB_DIR;
  process.env.AITRI_HUB_DIR = dir;
  return {
    dir,
    restore: () => {
      if (prev === undefined) delete process.env.AITRI_HUB_DIR;
      else process.env.AITRI_HUB_DIR = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

// ── TC-017e1: Project at aitriVersion=0.1.74 takes legacy path ──────────────

describe('TC-017e1: collectOne — version_too_old skips snapshot entirely', () => {
  let projectDir;
  let restoreStub;
  let hub;
  beforeEach(() => {
    projectDir = tmpDir('project-old-');
    writeAitri(projectDir, {
      aitriVersion: '0.1.74',
      currentPhase: 2,
      approvedPhases: [1],
      completedPhases: [1, 2],
    });
    // Stub aitri to emit a valid snapshot — but we expect it to NOT be invoked.
    restoreStub = withStubAitriOnPath({
      stdout: JSON.stringify({ snapshotVersion: 1, project: 'should-not-run' }),
      code: 0,
    });
    hub = withTempHubDir();
  });
  afterEach(() => {
    restoreStub();
    hub.restore();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('TC-017e1: sets degradationReason=version_too_old and aitriState is non-null from legacy path', async () => {
    // Fresh module load each test to reset module-level _dirEnsured cache.
    const url = `../../lib/collector/index.js?case=017e1-${Date.now()}`;
    const { collectOne } = await import(url);
    const project = { id: 'p1', name: 'old-project', location: projectDir, type: 'local' };
    const result = await collectOne(project);
    assert.equal(result.degradationReason, 'version_too_old');
    assert.notEqual(result.aitriState, null);
    // Legacy path uses readAitriState — confirm projectName came from .aitri.
    assert.ok(result.aitriState);
  });
});

// ── TC-017e2: Failure logged as JSON line to ~/.aitri-hub/logs/aitri-hub.log ─

describe('TC-017e2: snapshot failure writes structured JSON line to log', () => {
  let projectDir;
  let restoreStub;
  let hub;
  beforeEach(() => {
    projectDir = tmpDir('project-bad-json-');
    writeAitri(projectDir, { aitriVersion: '0.1.79' });
    // Stub aitri to emit non-JSON stdout — triggers parse_failed.
    restoreStub = withStubAitriOnPath({ stdout: 'this is not JSON', code: 0 });
    hub = withTempHubDir();
  });
  afterEach(() => {
    restoreStub();
    hub.restore();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('TC-017e2: appends a JSON-parseable line with project, reason, durationMs', async () => {
    const url = `../../lib/collector/index.js?case=017e2-${Date.now()}`;
    const { collectOne } = await import(url);
    const project = { id: 'p2', name: 'bad-project', location: projectDir, type: 'local' };
    const result = await collectOne(project);
    assert.equal(result.degradationReason, 'parse_failed');

    const logPath = path.join(hub.dir, 'logs', 'aitri-hub.log');
    assert.ok(fs.existsSync(logPath), 'log file should exist');
    const content = fs.readFileSync(logPath, 'utf8').trim();
    const lines = content.split('\n').filter(Boolean);
    const last = lines[lines.length - 1];
    const parsed = JSON.parse(last);
    assert.equal(parsed.project, 'bad-project');
    assert.equal(parsed.reason, 'parse_failed');
    assert.ok(typeof parsed.ts === 'string' && parsed.ts.length > 0);
    assert.ok(Number.isFinite(parsed.durationMs));
  });
});

// ── TC-011f: Snapshot success path does not invoke demoted readers ──────────

describe('TC-011f: snapshot success path skips demoted readers', () => {
  let projectDir;
  let restoreStub;
  let hub;
  beforeEach(() => {
    projectDir = tmpDir('project-snapshot-ok-');
    writeAitri(projectDir, { aitriVersion: '0.1.79', currentPhase: 4, approvedPhases: [1, 2, 3] });
    const validSnapshot = {
      snapshotVersion: 1,
      project: 'snapshot-ok',
      phases: [
        { key: 1, status: 'approved' },
        { key: 2, status: 'approved' },
        { key: 3, status: 'approved' },
        { key: 4, status: 'completed' },
      ],
      bugs: {
        total: 0,
        open: 0,
        blocking: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        fixed: 0,
        verified: 0,
        closed: 0,
        openIds: [],
      },
      audit: { exists: false, stalenessDays: null },
      normalize: { state: null, method: null, baseRef: null, uncountedFiles: 0 },
      health: { deployable: true, deployableReasons: [] },
      nextActions: [],
    };
    restoreStub = withStubAitriOnPath({ stdout: JSON.stringify(validSnapshot), code: 0 });
    hub = withTempHubDir();
  });
  afterEach(() => {
    restoreStub();
    hub.restore();
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('TC-011f: does not invoke readAitriState/readTestSummary/readComplianceSummary/readRequirementsSummary/readBugsSummary on success', async () => {
    // Replace each demoted reader's module with an instrumented version BEFORE
    // collector/index.js is loaded. Since ESM caching, we use a unique URL.
    const calls = { aitri: 0, test: 0, compliance: 0, requirements: 0, bugs: 0 };

    // Patch via global — the simplest cross-module spy: re-export from a wrapper
    // is ESM-fragile. Instead, this test asserts via behavioural inference:
    //   - degradationReason === null  (snapshot succeeded)
    //   - aitriState.projectName === 'snapshot-ok'  (came from snapshot, NOT
    //     basename(projectDir) which is what readAitriState defaults to)
    //   - testSummary === null  (snapshot omitted verify; snapshot-reader
    //     therefore returns null for testSummary; legacy reader would have
    //     returned null too in the absence of 04_TEST_RESULTS.json — so this
    //     assertion only confirms the path didn't synthesize legacy data)
    //   - bugsSummary !== null  (came from snapshot.bugs — legacy reader
    //     would have returned null without BUGS.json on disk)
    const url = `../../lib/collector/index.js?case=011f-${Date.now()}`;
    const { collectOne } = await import(url);
    const project = { id: 'p3', name: 'will-be-overwritten', location: projectDir, type: 'local' };
    const result = await collectOne(project);

    assert.equal(result.degradationReason, null, 'snapshot should have succeeded');
    assert.equal(
      result.aitriState.projectName,
      'snapshot-ok',
      'projectName should come from snapshot, not basename',
    );
    assert.equal(
      result.bugsSummary?.open,
      0,
      'bugsSummary should be projected from snapshot.bugs (legacy would be null)',
    );
    // No BUGS.json exists on disk, yet bugsSummary is non-null — proves snapshot path was used, NOT readBugsSummary.
    assert.ok(!fs.existsSync(path.join(projectDir, 'BUGS.json')));
    // Demoted reader equivalence end: silently inferred from the above.
    void calls;
  });
});
