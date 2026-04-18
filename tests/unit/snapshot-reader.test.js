/**
 * Tests: collector/snapshot-reader
 * Covers: TC-010h, TC-010f, TC-010e1, TC-011h, TC-016h, TC-016e1
 *
 * @aitri-trace FR-ID: FR-010, FR-011, FR-016
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readSnapshot,
  projectFromSnapshot,
  formatRelativeTime,
  formatLastSessionLine,
} from '../../lib/collector/snapshot-reader.js';

function tmpDir(prefix = 'snapshot-reader-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeChildMock({ stdout = '', stderr = '', code = 0, neverClose = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child._killed = true; return true; };
  child._killed = false;
  setImmediate(() => {
    if (stdout) child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    if (!neverClose) {
      setImmediate(() => child.emit('close', code));
    }
  });
  return child;
}

function captureSpawn(impl) {
  const calls = [];
  const fn = (...args) => { calls.push(args); return impl(...args); };
  return { fn, calls };
}

// ── TC-010h: spawns aitri status --json with cwd, parses stdout ─────────────

describe('TC-010h: readSnapshot — spawns aitri status --json and parses stdout', () => {
  it('TC-010h: passes cwd=projectDir, shell=false, command=aitri, args=[status,--json]', async () => {
    const projectDir = tmpDir('aitri-fixture-001-');
    const snapshot = {
      snapshotVersion: 1,
      project: 'demo',
      nextActions: [{ priority: 1, command: 'aitri verify-run', reason: 'Phase 4 approved', severity: 'warn' }],
      health: { deployable: false, deployableReasons: [{ type: 'verify_not_passed', message: 'verify has not run' }] },
    };
    const { fn: spawnFn, calls } = captureSpawn(() => makeChildMock({ stdout: JSON.stringify(snapshot), code: 0 }));
    const result = await readSnapshot(projectDir, { spawnFn });

    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'aitri');
    assert.deepEqual(calls[0][1], ['status', '--json']);
    assert.equal(calls[0][2].cwd, projectDir);
    assert.equal(calls[0][2].shell, false);

    assert.equal(result.ok, true);
    assert.equal(result.snapshot.snapshotVersion, 1);
    assert.equal(result.snapshot.project, 'demo');
    assert.ok(result.durationMs >= 0);

    fs.rmSync(projectDir, { recursive: true, force: true });
  });
});

// ── TC-010f: spawn exits non-zero → reason='spawn_failed' ───────────────────

describe('TC-010f: readSnapshot — exit code 1 returns spawn_failed', () => {
  it('TC-010f: returns ok:false reason=spawn_failed, detail contains stderr', async () => {
    const projectDir = tmpDir('aitri-fixture-002-');
    const { fn: spawnFn } = captureSpawn(() => makeChildMock({ stdout: '', stderr: 'not an aitri project', code: 1 }));
    const result = await readSnapshot(projectDir, { spawnFn });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'spawn_failed');
    assert.ok(String(result.detail).includes('not an aitri project'));
    assert.ok(result.durationMs >= 0);
    fs.rmSync(projectDir, { recursive: true, force: true });
  });
});

// ── TC-010e1: hung child → SIGKILL after timeout, reason='timeout' ──────────

describe('TC-010e1: readSnapshot — hung spawn is SIGKILLed at timeoutMs', () => {
  it('TC-010e1: kills child once and returns reason=timeout with durationMs in [timeout, timeout+1000)', async () => {
    const projectDir = tmpDir('aitri-fixture-003-');
    let child;
    const spawnFn = () => { child = makeChildMock({ neverClose: true }); return child; };
    const result = await readSnapshot(projectDir, { spawnFn, timeoutMs: 100 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'timeout');
    assert.equal(child._killed, true);
    assert.ok(result.durationMs >= 100, `expected >=100, got ${result.durationMs}`);
    assert.ok(result.durationMs < 1100, `expected <1100, got ${result.durationMs}`);
    fs.rmSync(projectDir, { recursive: true, force: true });
  });
});

// ── TC-011h: projectFromSnapshot equivalence with legacy aitriState ─────────

describe('TC-011h: projectFromSnapshot — aitriState equivalent to legacy reader', () => {
  it('TC-011h: approvedPhases, currentPhase, verifyPassed, verifySummary match legacy shape', () => {
    const snapshot = {
      snapshotVersion: 1,
      project: 'demo',
      phases: [
        { key: 1, status: 'approved' },
        { key: 2, status: 'approved' },
        { key: 3, status: 'approved' },
        { key: 4, status: 'completed' },
        { key: 5, status: 'not_started' },
        { key: 'verify', verifyPassed: false, verifySummary: { passed: 0, failed: 0, total: 0 } },
      ],
      driftPhases: [],
    };
    const projected = projectFromSnapshot(snapshot);
    const sortedApproved = [...projected.aitriState.approvedPhases].sort();
    assert.deepEqual(sortedApproved, [1, 2, 3]);
    assert.equal(projected.aitriState.currentPhase, 4);
    assert.equal(projected.aitriState.verifyPassed, false);
    assert.deepEqual(projected.aitriState.verifySummary, { passed: 0, failed: 0, total: 0 });
  });
});

// ── TC-016h: formatLastSessionLine — verbose 'N days ago' shape ─────────────

describe('TC-016h: formatLastSessionLine — verbose relative time', () => {
  it("TC-016h: returns 'last: phase 3 approved by claude · 2 days ago' for delta=2d", () => {
    const lastSession = { event: 'phase 3 approved', agent: 'claude', at: '2026-04-15T14:00:00Z' };
    const out = formatLastSessionLine(lastSession, '2026-04-17T14:00:00Z');
    assert.equal(out, 'last: phase 3 approved by claude · 2 days ago');
  });

  it('TC-016h: returns null when lastSession is missing required fields', () => {
    assert.equal(formatLastSessionLine(null), null);
    assert.equal(formatLastSessionLine({ event: 'x', agent: 'y' }), null);
  });
});

// ── TC-016e1: formatRelativeTime — bucket boundaries ────────────────────────

describe('TC-016e1: formatRelativeTime — relative-time bucket boundaries', () => {
  const now = new Date('2026-04-17T14:00:00Z');
  const minus = (deltaMs) => new Date(now.getTime() - deltaMs).toISOString();

  const cases = [
    { delta: 59_000,                expect: 'just now'     },
    { delta: 60_000,                expect: '1m ago'       },
    { delta: 59 * 60_000,           expect: '59m ago'      },
    { delta: 60 * 60_000,           expect: '1h ago'       },
    { delta: 23 * 3_600_000,        expect: '23h ago'      },
    { delta: 24 * 3_600_000,        expect: '1d ago'       },
    { delta: 6  * 86_400_000,       expect: '6d ago'       },
    { delta: 7  * 86_400_000,       expect: 'Apr 10, 2026' },
  ];

  for (const c of cases) {
    it(`TC-016e1: delta=${c.delta}ms → '${c.expect}'`, () => {
      assert.equal(formatRelativeTime(minus(c.delta), now), c.expect);
    });
  }
});

// ── Defensive normalization — projectFromSnapshot tolerates missing fields ──

describe('projectFromSnapshot — defensive normalization on partial snapshots', () => {
  it('returns safe defaults for empty snapshot', () => {
    const projected = projectFromSnapshot({ snapshotVersion: 1, project: 'x' });
    assert.deepEqual(projected.nextActions, []);
    assert.deepEqual(projected.health, {});
    assert.deepEqual(projected.audit, { exists: false, stalenessDays: null });
    assert.equal(projected.testSummary, null);
    assert.equal(projected.bugsSummary, null);
  });
});
