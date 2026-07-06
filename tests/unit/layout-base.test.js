/**
 * Tests: collector/aitri-reader — layoutBase confinement (rc.76 contained layout)
 * Covers: TC-043e, TC-043f, TC-145h, TC-145e, TC-145f
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { layoutBase } from '../../lib/collector/aitri-reader.js';

let dir;
let warnings;
let warnMock;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-layout-'));
  warnings = [];
  warnMock = mock.method(console, 'warn', msg => warnings.push(String(msg)));
});

afterEach(() => {
  warnMock.mock.restore();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('TC-145h: safe relative layoutRoot accepted', () => {
  it('returns dir/aitri with zero warnings', () => {
    fs.mkdirSync(path.join(dir, 'aitri'));
    const base = layoutBase(dir, { layoutRoot: 'aitri' });
    assert.equal(base, path.join(dir, 'aitri'));
    assert.equal(warnings.length, 0);
  });
});

describe('TC-043e: flat project — layoutBase returns dir unchanged', () => {
  it('absent layoutRoot → dir, empty string → dir, no warnings', () => {
    assert.equal(layoutBase(dir, {}), dir);
    assert.equal(layoutBase(dir, { layoutRoot: '' }), dir);
    assert.equal(layoutBase(dir, null), dir);
    assert.equal(warnings.length, 0);
  });
});

describe('TC-145e: dangling layoutRoot does not throw', () => {
  it('not-yet-created child dir resolves without exception', () => {
    const base = layoutBase(dir, { layoutRoot: 'aitri' }); // dir/aitri does NOT exist
    assert.equal(base, path.join(dir, 'aitri'));
    assert.equal(warnings.length, 0);
  });
});

describe('TC-043f: hostile layoutRoot rejected before any read', () => {
  it('layoutRoot "../../etc" is rejected with one warning, returns dir', () => {
    const base = layoutBase(dir, { layoutRoot: '../../etc' });
    assert.equal(base, dir);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /layoutRoot/);
  });
});

describe('TC-145f: absolute and symlink escapes rejected (NFR-045 trio)', () => {
  it('absolute layoutRoot "/etc" is rejected', () => {
    const base = layoutBase(dir, { layoutRoot: '/etc' });
    assert.equal(base, dir);
    assert.equal(warnings.length, 1);
  });
  it('symlink pointing outside the project root is rejected', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-outside-'));
    fs.symlinkSync(outside, path.join(dir, 'link'));
    const base = layoutBase(dir, { layoutRoot: 'link' });
    assert.equal(base, dir);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /symlink/);
    fs.rmSync(outside, { recursive: true, force: true });
  });
});
