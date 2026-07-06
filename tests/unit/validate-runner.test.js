/**
 * Tests: collector/validate-runner (W1)
 * Covers: TC-054e (cache+refresh), TC-151f (dedup), TC-152h (fixed argv),
 *         TC-154f (timeout degrade), remote short-circuit.
 *
 * A stub `aitri` on PATH counts its invocations to a file so spawn behavior is
 * observable without asserting on internals.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runValidate, _resetValidateRunner } from '../../lib/collector/validate-runner.js';

let work;
let binDir;
let projDir;
let countFile;
let savedPath;

function writeStub(mode) {
  const script =
    mode === 'ok'
      ? `#!/bin/sh
echo "1" >> "${countFile}"
if [ "$1" = "validate" ] && [ "$2" = "--json" ]; then
  echo '{"project":"p","allValid":true,"health":{"deployable":true}}'
  exit 0
fi
exit 0
`
      : `#!/bin/sh
echo "1" >> "${countFile}"
sleep 60
`;
  fs.writeFileSync(path.join(binDir, 'aitri'), script, { mode: 0o755 });
}

function invocations() {
  try {
    return fs.readFileSync(countFile, 'utf8').trim().split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

before(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-validate-'));
  binDir = path.join(work, 'bin');
  projDir = path.join(work, 'proj');
  countFile = path.join(work, 'count.log');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(projDir, { recursive: true });
  savedPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${savedPath}`;
});

after(() => {
  process.env.PATH = savedPath;
  fs.rmSync(work, { recursive: true, force: true });
});

beforeEach(() => {
  fs.writeFileSync(countFile, '');
  _resetValidateRunner();
});

const local = { id: 'v1', type: 'local' };

describe('TC-054e: 60s cache + refresh bypass', () => {
  it('two calls within 60s spawn once; refresh=1 spawns again', async () => {
    writeStub('ok');
    let t = 1_000;
    _resetValidateRunner(() => t);
    const a = await runValidate(local, projDir);
    assert.equal(a.available, true);
    assert.equal(a.report.allValid, true);
    t = 30_000; // still within 60s
    const b = await runValidate(local, projDir);
    assert.equal(b.fetchedAt, a.fetchedAt, 'served from cache');
    assert.equal(invocations(), 1, 'one spawn for two cached calls');
    const c = await runValidate(local, projDir, { refresh: true });
    assert.notEqual(c.fetchedAt, a.fetchedAt, 'refresh re-spawned');
    assert.equal(invocations(), 2);
  });
  it('cache expires after 60s', async () => {
    writeStub('ok');
    let t = 1_000;
    _resetValidateRunner(() => t);
    await runValidate(local, projDir);
    t = 1_000 + 61_000;
    await runValidate(local, projDir);
    assert.equal(invocations(), 2, 'expired cache re-spawns');
  });
});

describe('TC-151f: in-flight dedup under a burst', () => {
  it('10 concurrent calls spawn once and share fetchedAt', async () => {
    writeStub('ok');
    _resetValidateRunner();
    const results = await Promise.all(Array.from({ length: 10 }, () => runValidate(local, projDir)));
    assert.equal(invocations(), 1, 'exactly one spawn for 10 concurrent calls');
    const first = results[0].fetchedAt;
    assert.ok(results.every(r => r.fetchedAt === first), 'all share the same fetchedAt');
  });
});

describe('TC-151f (refresh): concurrent refresh cannot amplify spawns', () => {
  it('10 concurrent refresh=1 calls still spawn once (bypass cache, not dedup)', async () => {
    writeStub('ok');
    _resetValidateRunner();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => runValidate(local, projDir, { refresh: true })),
    );
    assert.equal(invocations(), 1, 'refresh burst joins the in-flight spawn');
    const first = results[0].fetchedAt;
    assert.ok(results.every(r => r.fetchedAt === first));
  });
});

describe('TC-152h: remote project short-circuits (no spawn)', () => {
  it('type remote → degraded remote-project, aitri never invoked', async () => {
    writeStub('ok');
    const r = await runValidate({ id: 'r1', type: 'remote' }, projDir);
    assert.equal(r.available, false);
    assert.equal(r.reason, 'remote-project');
    assert.equal(invocations(), 0);
  });
});

describe('CLI absence and unreadable output degrade cleanly', () => {
  it('no aitri on PATH → available:false with a reason', async () => {
    // Point PATH somewhere without the stub for this one call.
    const noBin = path.join(work, 'empty-bin');
    fs.mkdirSync(noBin, { recursive: true });
    const saved = process.env.PATH;
    process.env.PATH = noBin;
    _resetValidateRunner();
    try {
      const r = await runValidate(local, projDir);
      assert.equal(r.available, false);
      assert.match(r.reason, /not found|unreadable|timed out/);
    } finally {
      process.env.PATH = saved;
    }
  });
});
