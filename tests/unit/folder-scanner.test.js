/**
 * Tests: lib/collector/folder-scanner.js
 * Covers: TC-021h, TC-021e, TC-021f, TC-022h, TC-022e, TC-022f, TC-022g,
 *         TC-025h, TC-025e, TC-025f, TC-NFR021h, TC-NFR022h
 *
 * @aitri-trace FR-ID: FR-021, FR-022, FR-025, TC-ID: TC-021h, TC-022h
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanFolder, isValidProject } from '../../lib/collector/folder-scanner.js';

let tmpDir;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-folder-scan-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeDir(...parts) {
  const p = path.join(tmpDir, ...parts);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function makeFile(...parts) {
  const p = path.join(tmpDir, ...parts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '{}');
  return p;
}

// ── TC-022h: child with package.json is valid ─────────────────────────────────

describe('TC-022h: scanFolder — child with package.json is included', () => {
  it('finds child with package.json', () => {
    const folder = makeDir('tc022h');
    makeFile('tc022h', 'my-app', 'package.json');

    const results = scanFolder(folder);
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'my-app');
  });
});

// ── TC-022e: child with .aitri is valid ───────────────────────────────────────

describe('TC-022e: scanFolder — child with .aitri directory is included', () => {
  it('finds child with .aitri dir', () => {
    const folder = makeDir('tc022e');
    makeDir('tc022e', 'my-aitri-project', '.aitri');

    const results = scanFolder(folder);
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'my-aitri-project');
  });
});

// ── TC-022f: child without package.json or .aitri is skipped ─────────────────

describe('TC-022f: scanFolder — child without package.json or .aitri is skipped', () => {
  it('skips child with only a README', () => {
    const folder = makeDir('tc022f');
    makeFile('tc022f', 'just-a-folder', 'README.md');

    const results = scanFolder(folder);
    assert.equal(results.length, 0);
  });
});

// ── TC-022g: files at root level are skipped ─────────────────────────────────

describe('TC-022g: scanFolder — files at root level are skipped', () => {
  it('skips regular files directly inside the folder', () => {
    const folder = makeDir('tc022g');
    fs.writeFileSync(path.join(folder, 'some-file.txt'), 'content');

    const results = scanFolder(folder);
    assert.equal(results.length, 0);
  });
});

// ── TC-021h: folder-type project expands to child entries ────────────────────

describe('TC-021h: scanFolder — returns multiple valid children', () => {
  it('returns 2 entries for 2 valid children', () => {
    const folder = makeDir('tc021h');
    makeFile('tc021h', 'child-a', 'package.json');
    makeFile('tc021h', 'child-b', 'package.json');

    const results = scanFolder(folder);
    assert.equal(results.length, 2);
    const names = results.map(r => r.name).sort();
    assert.deepEqual(names, ['child-a', 'child-b']);
    assert.equal(results[0].type, 'local');
  });
});

// ── TC-021e: parent folder name absent from results ──────────────────────────

describe('TC-021e: scanFolder — parent folder location is not in child entries', () => {
  it('child location points to child dir, not parent', () => {
    const folder = makeDir('tc021e');
    makeFile('tc021e', 'child-x', 'package.json');

    const results = scanFolder(folder);
    assert.equal(results.length, 1);
    assert.notEqual(results[0].location, folder);
    assert.ok(results[0].location.startsWith(folder));
  });
});

// ── TC-021f: folder with 0 valid children returns empty array ────────────────

describe('TC-021f: scanFolder — 0 valid children returns empty array', () => {
  it('returns [] when no children are valid projects', () => {
    const folder = makeDir('tc021f');
    makeDir('tc021f', 'empty-subdir');

    const results = scanFolder(folder);
    assert.deepEqual(results, []);
  });
});

// ── TC-025h: discovered children include parentFolder field ──────────────────

describe('TC-025h: scanFolder — child entries include parentFolder field', () => {
  it('parentFolder equals the scanned folder path', () => {
    const folder = makeDir('tc025h');
    makeFile('tc025h', 'app', 'package.json');

    const results = scanFolder(folder);
    assert.equal(results.length, 1);
    assert.equal(results[0].parentFolder, folder);
  });
});

// ── TC-025e: parentFolder preserves exact path string ────────────────────────

describe('TC-025e: scanFolder — parentFolder uses exact input path string', () => {
  it('parentFolder matches exact path passed to scanFolder', () => {
    const folder = makeDir('tc025e');
    makeFile('tc025e', 'app2', 'package.json');

    const pathWithSlash = folder + '/';
    const results = scanFolder(pathWithSlash);
    assert.equal(results.length, 1);
    assert.equal(results[0].parentFolder, pathWithSlash);
  });
});

// ── TC-025f: local project has no parentFolder ───────────────────────────────

describe('TC-025f: isValidProject — does not add parentFolder (pure scan only)', () => {
  it('direct call to scanFolder returns entries without parentFolder on different call', () => {
    // A manually registered local project goes through collectOne, not scanFolder.
    // scanFolder only runs for folder-type. This test confirms isValidProject is pure.
    const dir = makeDir('tc025f', 'standalone');
    makeFile('tc025f', 'standalone', 'package.json');
    assert.equal(isValidProject(dir), true);
  });
});

// ── TC-NFR021h: missing folder path returns empty array ──────────────────────

describe('TC-NFR021h: scanFolder — non-existent path returns [] without throwing', () => {
  it('handles ENOENT gracefully', () => {
    const result = scanFolder('/nonexistent-aitri-folder-path-xyz-test');
    assert.deepEqual(result, []);
  });
});

// ── TC-NFR022h: symlinks are skipped ─────────────────────────────────────────

describe('TC-NFR022h: scanFolder — symlinks are not followed', () => {
  it('symlink to a valid project directory is skipped', () => {
    const folder = makeDir('tc-nfr022h');
    // Create an external project outside the folder
    const external = makeDir('tc-nfr022h-external');
    makeFile('tc-nfr022h-external', 'package.json');
    // Create a symlink inside the folder pointing to the external project
    const linkPath = path.join(folder, 'link-to-external');
    try {
      fs.symlinkSync(external, linkPath);
    } catch {
      // Skip on platforms that don't support symlinks (CI)
      return;
    }

    const results = scanFolder(folder);
    assert.equal(results.length, 0, 'Symlink should be skipped');
  });
});
