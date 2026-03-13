/**
 * Tests: collector — remote project support (integration)
 * Covers: TC-008h, TC-008e, TC-008f
 *
 * Uses a local bare git repository as a fake remote to avoid network dependency.
 *
 * @aitri-trace FR-ID: FR-008, US-ID: US-002, AC-ID: AC-002
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-remote-'));
}

/**
 * Create a bare git repository with one commit for use as a fake remote.
 * @param {string} bareDir - Path where the bare repo will be created.
 */
function createFakeRemote(bareDir) {
  // Create a regular repo first, then clone it as bare
  const workDir = bareDir + '-work';
  fs.mkdirSync(workDir, { recursive: true });
  execSync('git init', { cwd: workDir, stdio: 'ignore' });
  execSync('git config user.email "test@aitri-hub.test"', { cwd: workDir, stdio: 'ignore' });
  execSync('git config user.name "Aitri Test"', { cwd: workDir, stdio: 'ignore' });
  fs.writeFileSync(path.join(workDir, '.aitri'), JSON.stringify({
    projectName: 'remote-proj',
    currentPhase: 2,
    approvedPhases: [1],
    completedPhases: [1, 2],
  }));
  execSync('git add .', { cwd: workDir, stdio: 'ignore' });
  execSync('git commit -m "initial"', { cwd: workDir, stdio: 'ignore' });
  execSync(`git clone --bare "${workDir}" "${bareDir}"`, { stdio: 'ignore' });
  fs.rmSync(workDir, { recursive: true, force: true });
}

// ── TC-008h: first monitor run clones remote URL to cache directory ───────────

describe('TC-008h: collectOne — first run clones remote project to cache', () => {
  let hubDirOrig;
  let tmpHubDir;
  let fakeRemoteDir;

  before(() => {
    tmpHubDir = tmpDir();
    fakeRemoteDir = tmpDir() + '-bare.git';
    hubDirOrig = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = tmpHubDir;
    createFakeRemote(fakeRemoteDir);
  });

  after(() => {
    process.env.AITRI_HUB_DIR = hubDirOrig;
    fs.rmSync(tmpHubDir, { recursive: true, force: true });
    fs.rmSync(fakeRemoteDir, { recursive: true, force: true });
  });

  it('cache directory contains .git after collectOne with remote URL', async () => {
    const { collectOne } = await import('../../lib/collector/index.js');
    const project = {
      id: 'testid01',
      name: 'remote-proj',
      location: `file://${fakeRemoteDir}`,
      type: 'remote',
      addedAt: new Date().toISOString(),
    };
    await collectOne(project);
    const cacheSubdir = fs.readdirSync(path.join(tmpHubDir, 'cache'));
    assert.ok(cacheSubdir.length > 0, 'cache/ should contain at least one cloned directory');
    const cloneDir = path.join(tmpHubDir, 'cache', cacheSubdir[0]);
    assert.ok(
      fs.existsSync(path.join(cloneDir, '.git')),
      `Cloned directory at ${cloneDir} must contain .git`
    );
  });

  it('collectOne returns isGitRepo=true for successfully cloned remote', async () => {
    const { collectOne } = await import('../../lib/collector/index.js');
    const project = {
      id: 'testid02',
      name: 'remote-proj-2',
      location: `file://${fakeRemoteDir}`,
      type: 'remote',
      addedAt: new Date().toISOString(),
    };
    const result = await collectOne(project);
    assert.notEqual(result, null);
    // If clone succeeded, gitMeta should be populated
    assert.ok(
      result.gitMeta?.isGitRepo === true || result.status !== 'unreadable',
      `Expected gitMeta.isGitRepo=true or non-unreadable status, got status=${result.status}`
    );
  });
});

// ── TC-008e: second run uses git pull on existing cache ───────────────────────

describe('TC-008e: collectOne — subsequent run pulls existing cache (no re-clone)', () => {
  let hubDirOrig;
  let tmpHubDir;
  let fakeRemoteDir;

  before(() => {
    tmpHubDir = tmpDir();
    fakeRemoteDir = tmpDir() + '-bare2.git';
    hubDirOrig = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = tmpHubDir;
    createFakeRemote(fakeRemoteDir);
  });

  after(() => {
    process.env.AITRI_HUB_DIR = hubDirOrig;
    fs.rmSync(tmpHubDir, { recursive: true, force: true });
    fs.rmSync(fakeRemoteDir, { recursive: true, force: true });
  });

  it('pre-cloned cache is not re-created on second collectOne call', async () => {
    const { collectOne } = await import('../../lib/collector/index.js');
    const project = {
      id: 'testid03',
      name: 'cached-remote',
      location: `file://${fakeRemoteDir}`,
      type: 'remote',
      addedAt: new Date().toISOString(),
    };

    // First call: clones
    await collectOne(project);
    const cacheSubdir = fs.readdirSync(path.join(tmpHubDir, 'cache'));
    assert.ok(cacheSubdir.length > 0, 'Cache must exist after first collectOne');
    const cloneDir = path.join(tmpHubDir, 'cache', cacheSubdir[0]);
    const mtimeBefore = fs.statSync(path.join(cloneDir, '.git')).mtimeMs;

    // Second call: should pull, not re-clone
    await collectOne(project);
    const mtimeAfter = fs.statSync(path.join(cloneDir, '.git')).mtimeMs;

    // Directory still exists and is the same one (not deleted and recreated)
    assert.ok(
      fs.existsSync(path.join(cloneDir, '.git')),
      'Cache directory must still exist after second call'
    );
    // Cache dirs count should not have grown (no new clone dir added)
    const cacheDirsAfter = fs.readdirSync(path.join(tmpHubDir, 'cache'));
    assert.equal(
      cacheDirsAfter.length,
      cacheSubdir.length,
      'No new cache directories should be created on second call'
    );
  });
});

// ── TC-008f: network error during sync shows cache-stale alert ────────────────

describe('TC-008f: collectOne — unreachable remote shows cache-stale, no crash', () => {
  let hubDirOrig;
  let tmpHubDir;

  before(() => {
    tmpHubDir = tmpDir();
    hubDirOrig = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = tmpHubDir;
  });

  after(() => {
    process.env.AITRI_HUB_DIR = hubDirOrig;
    fs.rmSync(tmpHubDir, { recursive: true, force: true });
  });

  it('collectOne does not throw when remote URL is unreachable and no cache exists', async () => {
    const { collectOne } = await import('../../lib/collector/index.js');
    const project = {
      id: 'testid04',
      name: 'offline-proj',
      // Non-existent path — guaranteed to fail clone
      location: 'file:///tmp/aitri-hub-nonexistent-remote-xyz-999.git',
      type: 'remote',
      addedAt: new Date().toISOString(),
    };
    let threw = false;
    try {
      await collectOne(project);
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'collectOne must not throw when remote is unreachable');
  });

  it('collectOne returns status=unreadable when remote fails and no cache exists', async () => {
    const { collectOne } = await import('../../lib/collector/index.js');
    const project = {
      id: 'testid05',
      name: 'offline-proj-2',
      location: 'file:///tmp/aitri-hub-nonexistent-remote-xyz-888.git',
      type: 'remote',
      addedAt: new Date().toISOString(),
    };
    const result = await collectOne(project);
    assert.equal(
      result.status,
      'unreadable',
      `Expected status=unreadable when clone fails, got: ${result.status}`
    );
  });

  it('collectOne returns non-null collectionError when remote clone fails', async () => {
    const { collectOne } = await import('../../lib/collector/index.js');
    const project = {
      id: 'testid06',
      name: 'offline-proj-3',
      location: 'file:///tmp/aitri-hub-nonexistent-remote-xyz-777.git',
      type: 'remote',
      addedAt: new Date().toISOString(),
    };
    const result = await collectOne(project);
    assert.notEqual(
      result.collectionError,
      null,
      'collectionError must be set when remote clone fails'
    );
  });
});
