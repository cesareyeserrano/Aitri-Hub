/**
 * Tests: NFR-043 regression — remote sync unchanged (contract-catchup-rc159)
 * Covers: TC-143h, TC-143e, TC-143f
 *
 * TC-143h exercises the real clone→pull cycle against a local bare repo (the
 * same surface as the pre-existing TC-008h/e). TC-143e/f pin the poller's
 * throttle-skip and 429-backoff decisions via the test-only state injector —
 * both paths return before any network call by design.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectOne } from '../../lib/collector/index.js';
import {
  checkRemoteChanged,
  _setPollerState,
  _resetPollerState,
} from '../../lib/collector/github-poller.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-143-'));
}

function createFakeRemote(bareDir) {
  const workDir = bareDir + '-work';
  fs.mkdirSync(workDir, { recursive: true });
  execSync('git init', { cwd: workDir, stdio: 'ignore' });
  execSync('git config user.email "test@aitri-hub.test"', { cwd: workDir, stdio: 'ignore' });
  execSync('git config user.name "Aitri Test"', { cwd: workDir, stdio: 'ignore' });
  fs.writeFileSync(
    path.join(workDir, '.aitri'),
    JSON.stringify({ projectName: 'remote-143', currentPhase: 1, approvedPhases: [1] }),
  );
  execSync('git add .', { cwd: workDir, stdio: 'ignore' });
  execSync('git commit -m "initial"', { cwd: workDir, stdio: 'ignore' });
  execSync(`git clone --bare "${workDir}" "${bareDir}"`, { stdio: 'ignore' });
  fs.rmSync(workDir, { recursive: true, force: true });
}

describe('TC-143h: remote clone/pull cycle unchanged', () => {
  let hubHome;
  let bare;
  let saved;

  before(() => {
    hubHome = tmpDir();
    bare = tmpDir() + '-bare.git';
    saved = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = hubHome;
    createFakeRemote(bare);
  });
  after(() => {
    if (saved === undefined) delete process.env.AITRI_HUB_DIR;
    else process.env.AITRI_HUB_DIR = saved;
    fs.rmSync(hubHome, { recursive: true, force: true });
    fs.rmSync(bare, { recursive: true, force: true });
  });

  it('cycle 1 clones into the cache; cycle 2 pulls without re-cloning', async () => {
    const project = { id: 'r143', name: 'remote-143', type: 'remote', location: bare };
    const first = await collectOne(project);
    assert.equal(first.collectionError, null);
    const cacheRoot = path.join(hubHome, 'cache');
    const clone = fs.readdirSync(cacheRoot).find(d => d.includes('r143'));
    assert.ok(clone, 'clone directory exists after cycle 1');
    const gitDirStat = fs.statSync(path.join(cacheRoot, clone, '.git'));

    const second = await collectOne(project);
    assert.equal(second.collectionError, null);
    const gitDirStat2 = fs.statSync(path.join(cacheRoot, clone, '.git'));
    assert.equal(
      gitDirStat.birthtimeMs,
      gitDirStat2.birthtimeMs,
      'cycle 2 reused the clone (no re-create)',
    );
  });
});

describe('TC-143e: poller skip — no pull when checked too recently', () => {
  it('throttled project returns changed=false with zero network calls', async () => {
    const id = 'p143e';
    _setPollerState(id, { lastCheckedAt: Date.now(), lastUpdatedAt: '2026-07-01T00:00:00.000Z' });
    const res = await checkRemoteChanged(id, 'https://github.com/example/repo');
    assert.deepEqual(res, { changed: false, rateLimited: false, firstRun: false });
    _resetPollerState(id);
  });
});

describe('TC-143f: 429 backoff preserved — no retry inside the window', () => {
  it('project in backoff returns rateLimited=true without fetching', async () => {
    const id = 'p143f';
    _setPollerState(id, { lastCheckedAt: Date.now() - 1000, backoffUntil: Date.now() + 60_000 });
    const res = await checkRemoteChanged(id, 'https://github.com/example/repo');
    assert.equal(res.changed, false);
    assert.equal(res.rateLimited, true);
    _resetPollerState(id);
  });
});
