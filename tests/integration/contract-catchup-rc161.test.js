/**
 * Tests: contract-catchup-rc161 — lastSession sourcing (FR-060) + regression pins (NFR-056)
 * Covers: TC-060h, TC-060e, TC-060f, TC-056h, TC-056e, TC-056f, TC-058e
 *
 * Technique (snapshot-first.test.js precedent): a stub `aitri` binary on PATH
 * emits controlled rc.161 / pre-rc.161 payloads, and a POISON `.aitri.local`
 * on disk makes "did the collector read the file?" observable from the record
 * — if the poison value ever surfaces, the inline read ran.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectOne } from '../../lib/collector/index.js';

let workDir;
let binDir;
let projectDir;
let savedPath;
let savedHub;

const BASE_SNAPSHOT = {
  snapshotVersion: 1,
  project: 'rc161-proj',
  aitriVersion: '2.0.0-rc.161',
  phases: [{ key: 1, status: 'approved' }],
  bugs: { total: 0, open: 0, parseErrors: [] },
};

function writeStub(snapshot) {
  const body = `#!/bin/sh
if [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  cat <<'JSON'
${JSON.stringify(snapshot)}
JSON
  exit 0
fi
if [ "$1" = "--version" ]; then echo "Aitri v2.0.0-rc.161"; exit 0; fi
exit 0
`;
  fs.writeFileSync(path.join(binDir, 'aitri'), body, { mode: 0o755 });
}

function writePoisonLocal() {
  fs.writeFileSync(
    path.join(projectDir, '.aitri.local'),
    JSON.stringify({
      lastSession: { event: 'POISON-EVENT', agent: 'POISON-AGENT', at: '1999-01-01T00:00:00.000Z' },
    }),
  );
}

before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-rc161-'));
  binDir = path.join(workDir, 'bin');
  projectDir = path.join(workDir, 'proj');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'spec'), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, '.aitri'),
    JSON.stringify({
      projectName: 'rc161-proj',
      currentPhase: 1,
      approvedPhases: [1],
      artifactsDir: 'spec',
      aitriVersion: '2.0.0-rc.161',
    }),
  );

  savedPath = process.env.PATH;
  savedHub = process.env.AITRI_HUB_DIR;
  process.env.PATH = `${binDir}${path.delimiter}${savedPath}`;
  process.env.AITRI_HUB_DIR = path.join(workDir, 'hubhome');
});

after(() => {
  process.env.PATH = savedPath;
  if (savedHub === undefined) delete process.env.AITRI_HUB_DIR;
  else process.env.AITRI_HUB_DIR = savedHub;
  fs.rmSync(workDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Each test decides its own .aitri.local; start clean.
  fs.rmSync(path.join(projectDir, '.aitri.local'), { force: true });
});

const project = () => ({
  id: 'p-rc161',
  name: 'rc161-proj',
  type: 'local',
  location: projectDir,
});

describe('TC-060h: snapshot lastSession wins; .aitri.local never read', () => {
  it('carries the snapshot session verbatim while a poison .aitri.local sits on disk', async () => {
    writePoisonLocal();
    writeStub({
      ...BASE_SNAPSHOT,
      lastSession: { event: 'approve 1', agent: 'claude', at: '2026-07-07T10:00:00.000Z' },
    });
    const record = await collectOne(project());
    assert.equal(record.lastSession.event, 'approve 1', 'snapshot value must win');
    assert.equal(record.lastSession.agent, 'claude');
    assert.equal(record.lastSession.at, '2026-07-07T10:00:00.000Z');
    assert.doesNotMatch(JSON.stringify(record), /POISON/, 'poison must never surface anywhere');
  });
});

describe('TC-060e: lastSession key present but null — trusted, no fallback', () => {
  it('keeps null and ignores the poison file (key-presence proves the rc.161 contract)', async () => {
    writePoisonLocal();
    writeStub({ ...BASE_SNAPSHOT, lastSession: null });
    const record = await collectOne(project());
    assert.equal(record.lastSession, null, 'null means "no session yet", not "fall back"');
    assert.doesNotMatch(JSON.stringify(record), /POISON/);
  });
});

describe('TC-060f: payload without the lastSession key — legacy fallback still populates', () => {
  it('reads .aitri.local exactly as before for pre-rc.161 CLIs', async () => {
    fs.writeFileSync(
      path.join(projectDir, '.aitri.local'),
      JSON.stringify({
        lastSession: { event: 'checkpoint', agent: 'claude', at: '2026-07-06T09:00:00.000Z' },
      }),
    );
    writeStub(BASE_SNAPSHOT); // no lastSession key at all
    const record = await collectOne(project());
    assert.equal(record.lastSession.event, 'checkpoint', 'fallback must run on key-absent payloads');
    assert.equal(record.lastSession.at, '2026-07-06T09:00:00.000Z');
  });
});

const GOLDEN_PRE_RC161 = {
  lastSession: { event: 'checkpoint', agent: 'claude', at: '2026-07-06T09:00:00.000Z' },
  hasQualitySurfaces: false,
};

async function collectPreRc161Shape() {
  fs.writeFileSync(
    path.join(projectDir, '.aitri.local'),
    JSON.stringify({
      lastSession: { event: 'checkpoint', agent: 'claude', at: '2026-07-06T09:00:00.000Z' },
    }),
  );
  writeStub(BASE_SNAPSHOT);
  const record = await collectOne(project());
  return {
    lastSession: record.lastSession,
    hasQualitySurfaces: 'qualitySurfaces' in record,
  };
}

describe('TC-056h: pre-rc.161 payload → record deep-equals the golden pre-change shape', () => {
  it('fallback lastSession + no qualitySurfaces key (NFR-056)', async () => {
    const actual = await collectPreRc161Shape();
    assert.deepEqual(actual, GOLDEN_PRE_RC161, 'pre-rc.161 record shape must be unchanged');
  });
});

describe('TC-056f: the golden comparison is not vacuous (mutation guard)', () => {
  it('a mutated copy fails the same deep-equal', async () => {
    const actual = await collectPreRc161Shape();
    const mutated = { ...actual, hasQualitySurfaces: true };
    assert.throws(() => assert.deepEqual(mutated, GOLDEN_PRE_RC161), 'pin must bite');
  });
});

describe('TC-057h: sub-floor project takes the legacy path — no qualitySurfaces ever', () => {
  it('a project below the snapshot floor produces a record without the new key', async () => {
    const legacyDir = path.join(workDir, 'legacy-proj');
    fs.mkdirSync(path.join(legacyDir, 'spec'), { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, '.aitri'),
      JSON.stringify({
        projectName: 'legacy-proj',
        currentPhase: 1,
        approvedPhases: [1],
        artifactsDir: 'spec',
        aitriVersion: '0.1.70', // below SNAPSHOT_MIN_AITRI_VERSION (0.1.77)
      }),
    );
    const record = await collectOne({ id: 'p-legacy', name: 'legacy-proj', type: 'local', location: legacyDir });
    assert.equal('qualitySurfaces' in record, false, 'legacy path never sets the new key');
  });
});

describe('TC-057e: legacy path sources lastSession from the legacy reader, unchanged', () => {
  it('a sub-floor project with .aitri.local keeps its pre-feature lastSession sourcing', async () => {
    const legacyDir = path.join(workDir, 'legacy-session-proj');
    fs.mkdirSync(path.join(legacyDir, 'spec'), { recursive: true });
    fs.writeFileSync(
      path.join(legacyDir, '.aitri'),
      JSON.stringify({
        projectName: 'legacy-session-proj',
        currentPhase: 1,
        approvedPhases: [],
        artifactsDir: 'spec',
        aitriVersion: '0.1.70',
      }),
    );
    fs.writeFileSync(
      path.join(legacyDir, '.aitri.local'),
      JSON.stringify({ lastSession: { event: 'complete 1', agent: 'codex', at: '2026-07-01T08:00:00.000Z' } }),
    );
    const record = await collectOne({ id: 'p-legacy-s', name: 'legacy-session-proj', type: 'local', location: legacyDir });
    assert.equal(record.lastSession?.event, 'complete 1', 'legacy sourcing untouched');
  });
});

describe('TC-057f: corrupted .aitri on the legacy path degrades exactly as before', () => {
  it('no crash; the record surfaces the unreadable state as pre-feature', async () => {
    const badDir = path.join(workDir, 'bad-proj');
    fs.mkdirSync(badDir, { recursive: true });
    fs.writeFileSync(path.join(badDir, '.aitri'), '{ definitely not json');
    const record = await collectOne({ id: 'p-bad', name: 'bad-proj', type: 'local', location: badDir });
    assert.ok(record, 'collectOne must not throw on a malformed legacy .aitri');
    assert.equal('qualitySurfaces' in record, false);
    assert.equal(record.aitriState, null, 'unreadable state degrades as before');
  });
});

describe('TC-058h: bugs.parseErrors consumption unchanged (rc.158 pin)', () => {
  it('a payload with parseErrors["root"] surfaces the flag exactly as before this feature', async () => {
    writeStub({ ...BASE_SNAPSHOT, lastSession: null, bugs: { total: 0, open: 0, parseErrors: ['root'] } });
    const record = await collectOne(project());
    assert.ok(
      JSON.stringify(record.bugsSummary).includes('root'),
      'parseErrors must keep reaching the record',
    );
  });
});

describe('TC-056e: pre-rc.161 payload with NO .aitri.local at all', () => {
  it('lastSession null via the fallback finding nothing; still no qualitySurfaces key', async () => {
    writeStub(BASE_SNAPSHOT);
    const record = await collectOne(project());
    assert.equal(record.lastSession, null);
    assert.equal('qualitySurfaces' in record, false);
  });
});

describe('TC-058e: parseErrors consumption coexists with the rc.161 surfaces', () => {
  it('both the parseErrors flag and qualitySurfaces reach the record', async () => {
    writeStub({
      ...BASE_SNAPSHOT,
      lastSession: null,
      bugs: { total: 0, open: 0, parseErrors: ['root'] },
      tests: {
        totals: { passed: 1, failed: 0, skipped: 0, total: 1 },
        perPipeline: [
          {
            scope: 'root',
            passed: 1,
            failed: 0,
            total: 1,
            ran: true,
            quality_gates: [{ name: 'lint', status: 'pass', required: true }],
            ac_coverage: null,
          },
        ],
      },
    });
    const record = await collectOne(project());
    assert.deepEqual(record.qualitySurfaces.perPipeline, [
      { scope: 'root', quality_gates: [{ name: 'lint', status: 'pass', required: true }] },
    ]);
    assert.ok(
      record.bugsSummary && JSON.stringify(record.bugsSummary).includes('root'),
      'parseErrors consumption unchanged alongside the new keys',
    );
  });
});
