/**
 * Tests: collector/aitri-reader — .aitri.local merge (rc.51 state split)
 * Covers: TC-042h, TC-042e, TC-042f
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readAitriState } from '../../lib/collector/aitri-reader.js';

let dir;
let warnings;
let warnMock;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-local-'));
  warnings = [];
  warnMock = mock.method(console, 'warn', msg => warnings.push(String(msg)));
});

afterEach(() => {
  warnMock.mock.restore();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sharedAitri = { projectName: 'p1', currentPhase: 4, approvedPhases: [1, 2, 3] };

describe('TC-042h: lastSession read from .aitri.local', () => {
  it('merges per-machine fields over the shared view', () => {
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(sharedAitri));
    fs.writeFileSync(
      path.join(dir, '.aitri.local'),
      JSON.stringify({ lastSession: { event: 'verify-run', agent: 'cli', at: '2026-07-01T00:00:00.000Z' } }),
    );
    const state = readAitriState(dir);
    assert.equal(state.lastSession.event, 'verify-run');
    assert.equal(state.lastSession.agent, 'cli');
    assert.equal(warnings.length, 0);
  });
});

describe('TC-042e: remote clone without .aitri.local', () => {
  it('collects with no error and no fabricated lastSession', () => {
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(sharedAitri));
    const state = readAitriState(dir);
    assert.equal(state.lastSession, null);
    assert.equal(state.projectName, 'p1');
    assert.equal(warnings.length, 0);
  });
  it('pre-split legacy project (lastSession inside .aitri) keeps reporting it', () => {
    fs.writeFileSync(
      path.join(dir, '.aitri'),
      JSON.stringify({ ...sharedAitri, lastSession: { event: 'approved', agent: 'legacy', at: '2026-03-01T00:00:00.000Z' } }),
    );
    const state = readAitriState(dir);
    assert.equal(state.lastSession.event, 'approved');
  });
});

describe('TC-042f: malformed .aitri.local ignored with warning', () => {
  it('returns the shared view and warns exactly once', () => {
    fs.writeFileSync(path.join(dir, '.aitri'), JSON.stringify(sharedAitri));
    fs.writeFileSync(path.join(dir, '.aitri.local'), '{invalid');
    const state = readAitriState(dir);
    assert.equal(state.projectName, 'p1');
    assert.equal(state.lastSession, null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /\.aitri\.local/);
  });
});
