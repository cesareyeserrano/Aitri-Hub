/**
 * Tests: collector/git-reader
 * Covers: TC-003h, TC-003f
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { readGitMeta } from '../../lib/collector/git-reader.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-git-'));
}

function initGitRepo(dir) {
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@aitri-hub.test"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Aitri Test"', { cwd: dir, stdio: 'ignore' });
  fs.writeFileSync(path.join(dir, 'README.md'), '# test');
  execSync('git add .', { cwd: dir, stdio: 'ignore' });
  execSync('git commit -m "initial commit"', { cwd: dir, stdio: 'ignore' });
}

// ── TC-003h: active repo returns correct metadata ─────────────────────────────

describe('TC-003h: readGitMeta — active git repo returns correct metadata', () => {
  let dir;

  before(() => {
    dir = tmpDir();
    initGitRepo(dir);
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('isGitRepo=true', () => {
    const result = readGitMeta(dir);
    assert.notEqual(result, null);
    assert.equal(result.isGitRepo, true);
  });

  it('lastCommitAt is a valid ISO 8601 string', () => {
    const result = readGitMeta(dir);
    assert.notEqual(result.lastCommitAt, null);
    const d = new Date(result.lastCommitAt);
    assert.ok(!isNaN(d.getTime()), `Expected valid ISO date, got: ${result.lastCommitAt}`);
  });

  it('lastCommitAgeHours is a non-negative number', () => {
    const result = readGitMeta(dir);
    assert.ok(
      typeof result.lastCommitAgeHours === 'number',
      'lastCommitAgeHours should be a number',
    );
    assert.ok(result.lastCommitAgeHours >= 0, 'lastCommitAgeHours should be >= 0');
  });

  it('branch is a non-empty string', () => {
    const result = readGitMeta(dir);
    assert.ok(typeof result.branch === 'string' && result.branch.length > 0);
  });

  it('commitVelocity7d is a non-negative integer', () => {
    const result = readGitMeta(dir);
    assert.ok(Number.isInteger(result.commitVelocity7d), 'commitVelocity7d should be integer');
    assert.ok(result.commitVelocity7d >= 0);
  });

  it('lastCommitAgeHours is close to 0 for a just-created commit', () => {
    const result = readGitMeta(dir);
    // Commit was just made — should be < 0.1 hours (< 6 minutes)
    assert.ok(
      result.lastCommitAgeHours < 0.1,
      `Expected age < 0.1h, got: ${result.lastCommitAgeHours}`,
    );
  });
});

// ── TC-003f: non-git directory returns null without throwing ─────────────────

describe('TC-003f: readGitMeta — non-git directory returns null', () => {
  let dir;

  before(() => {
    dir = tmpDir();
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('does not throw for non-git directory', () => {
    assert.doesNotThrow(() => readGitMeta(dir));
  });

  it('returns null for non-git directory', () => {
    const result = readGitMeta(dir);
    assert.equal(result, null);
  });
});
