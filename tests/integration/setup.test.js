/**
 * Tests: commands/setup (integration — reads/writes real files)
 * Covers: TC-001h, TC-001e, TC-001f
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  writeProjects, readProjects, classifyAndValidate, inferName, projectId,
} from '../../lib/store/projects.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-setup-'));
}

// ── TC-001h: valid setup writes projects.json with 2 entries ─────────────────

describe('TC-001h: writeProjects + readProjects — 2 valid local projects', () => {
  let hubDirOrig;
  let tmpHubDir;
  let proj1;
  let proj2;

  before(() => {
    tmpHubDir = tmpDir();
    proj1 = tmpDir();
    proj2 = tmpDir();
    hubDirOrig = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = tmpHubDir;
  });

  after(() => {
    process.env.AITRI_HUB_DIR = hubDirOrig;
    fs.rmSync(tmpHubDir, { recursive: true, force: true });
    fs.rmSync(proj1, { recursive: true, force: true });
    fs.rmSync(proj2, { recursive: true, force: true });
  });

  it('writeProjects creates projects.json', () => {
    writeProjects({
      version: '1',
      defaultInterface: 'cli',
      projects: [
        { id: projectId(proj1), name: 'proj-a', location: proj1, type: 'local', addedAt: new Date().toISOString() },
        { id: projectId(proj2), name: 'proj-b', location: proj2, type: 'local', addedAt: new Date().toISOString() },
      ],
    });
    assert.ok(fs.existsSync(path.join(tmpHubDir, 'projects.json')));
  });

  it('readProjects returns 2 entries', () => {
    const config = readProjects();
    assert.equal(config.projects.length, 2);
  });

  it('readProjects first entry has correct location', () => {
    const config = readProjects();
    assert.equal(config.projects[0].location, proj1);
  });

  it('readProjects second entry has correct location', () => {
    const config = readProjects();
    assert.equal(config.projects[1].location, proj2);
  });

  it('readProjects returns version "1"', () => {
    const config = readProjects();
    assert.equal(config.version, '1');
  });

  it('readProjects returns defaultInterface "cli"', () => {
    const config = readProjects();
    assert.equal(config.defaultInterface, 'cli');
  });
});

// ── TC-001f: invalid local path fails validation ──────────────────────────────

describe('TC-001f: classifyAndValidate — non-existent path returns valid=false', () => {
  it('returns valid=false for path that does not exist', () => {
    const result = classifyAndValidate('/tmp/does-not-exist-aitri-hub-xyz-999');
    assert.equal(result.valid, false);
    assert.ok(
      result.reason.toLowerCase().includes('not found') ||
      result.reason.toLowerCase().includes('exist'),
      `Expected error about path not found, got: ${result.reason}`
    );
  });

  it('returns type "local" for absolute path', () => {
    const result = classifyAndValidate('/tmp/does-not-exist-aitri-hub-xyz-999');
    assert.equal(result.type, 'local');
  });
});

// ── TC-001e: overwrite detection via writeProjects + readProjects ─────────────

describe('TC-001e: writeProjects — preserves existing data until explicitly overwritten', () => {
  let hubDirOrig;
  let tmpHubDir;
  let existingProj;

  before(() => {
    tmpHubDir = tmpDir();
    existingProj = tmpDir();
    hubDirOrig = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = tmpHubDir;
    writeProjects({
      version: '1',
      defaultInterface: 'cli',
      projects: [
        { id: projectId(existingProj), name: 'existing', location: existingProj, type: 'local', addedAt: new Date().toISOString() },
      ],
    });
  });

  after(() => {
    process.env.AITRI_HUB_DIR = hubDirOrig;
    fs.rmSync(tmpHubDir, { recursive: true, force: true });
    fs.rmSync(existingProj, { recursive: true, force: true });
  });

  it('existing entry still present after NOT calling writeProjects again', () => {
    const config = readProjects();
    assert.equal(config.projects.length, 1);
    assert.equal(config.projects[0].name, 'existing');
  });
});

// ── inferName and projectId helpers ──────────────────────────────────────────

describe('TC-001g: inferName() — infers display name from path and URL', () => {
  it('infers name from local path last segment', () => {
    assert.equal(inferName('/home/user/projects/finance-app'), 'finance-app');
  });

  it('infers name from GitHub URL', () => {
    assert.equal(inferName('https://github.com/team/ecommerce'), 'ecommerce');
  });

  it('strips .git suffix from URL', () => {
    assert.equal(inferName('https://github.com/team/ecommerce.git'), 'ecommerce');
  });
});

describe('TC-001i: projectId() — generates deterministic 8-char hex ID', () => {
  it('returns an 8-character hex string', () => {
    const id = projectId('/home/user/projects/test');
    assert.equal(id.length, 8);
    assert.match(id, /^[0-9a-f]{8}$/);
  });

  it('is deterministic — same input always returns same id', () => {
    const id1 = projectId('/home/user/projects/test');
    const id2 = projectId('/home/user/projects/test');
    assert.equal(id1, id2);
  });

  it('different locations produce different ids', () => {
    const id1 = projectId('/home/user/projects/a');
    const id2 = projectId('/home/user/projects/b');
    assert.notEqual(id1, id2);
  });
});
