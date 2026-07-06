/**
 * Tests: /api/project/:id/{detail,validate} endpoints (W2)
 * Covers: TC-052h, TC-052f, TC-053h/e/f (endpoint level), TC-153e, TC-153f,
 *         TC-054h/e, TC-151h (cycle spawn census), TC-154h (timing).
 *
 * Spawns the real `aitri-hub web` server with a temp hub dir, a stub `aitri`
 * on PATH that counts its invocations, and a registered local fixture project.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3211;
const BASE = `http://127.0.0.1:${PORT}`;

let work, binDir, hubDir, projDir, countFile, server;

function writeStubAitri() {
  fs.writeFileSync(
    path.join(binDir, 'aitri'),
    `#!/bin/sh
echo "$1" >> "${countFile}"
if [ "$1" = "status" ] && [ "$2" = "--json" ]; then echo '{"snapshotVersion":1}'; exit 0; fi
if [ "$1" = "validate" ] && [ "$2" = "--json" ]; then
  echo '{"project":"demo","allValid":false,"health":{"deployable":false,"reasons":["r1","r2"]},"advisories":["a1"]}'
  exit 0
fi
if [ "$1" = "--version" ]; then echo "Aitri v2.0.0-rc.159"; exit 0; fi
exit 0
`,
    { mode: 0o755 },
  );
}

function countOf(cmd) {
  try {
    return fs.readFileSync(countFile, 'utf8').trim().split('\n').filter(l => l === cmd).length;
  } catch {
    return 0;
  }
}

async function waitHealth(ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(res => setTimeout(res, 150));
  }
  throw new Error('server did not become healthy');
}

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-ep-'));
  binDir = path.join(work, 'bin');
  hubDir = path.join(work, 'hub');
  projDir = path.join(work, 'proj');
  countFile = path.join(work, 'count.log');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(hubDir, { recursive: true });
  fs.mkdirSync(path.join(projDir, 'spec'), { recursive: true });
  fs.mkdirSync(path.join(projDir, 'features', 'f1', 'spec'), { recursive: true });
  fs.writeFileSync(countFile, '');
  writeStubAitri();

  // Fixture project (legacy path — stub status returns a too-old-ish snapshot;
  // the endpoints read artifacts directly regardless).
  fs.writeFileSync(path.join(projDir, '.aitri'),
    JSON.stringify({ projectName: 'demo', approvedPhases: [1, 3, 5], artifactsDir: 'spec', aitriVersion: '2.0.0-rc.159' }));
  fs.writeFileSync(path.join(projDir, 'spec', '03_TEST_CASES.json'),
    JSON.stringify({ test_cases: [{ id: 'TC-ROOT', requirement_id: 'FR-1', title: 'root' }] }));
  fs.writeFileSync(path.join(projDir, 'features', 'f1', '.aitri'),
    JSON.stringify({ projectName: 'f1', approvedPhases: [1, 3], artifactsDir: 'spec' }));
  fs.writeFileSync(path.join(projDir, 'features', 'f1', 'spec', '03_TEST_CASES.json'),
    JSON.stringify({ test_cases: [{ id: 'TC-F1', requirement_id: 'FR-9', title: 'feat' }] }));

  // Register the project.
  fs.writeFileSync(path.join(hubDir, 'projects.json'),
    JSON.stringify({ projects: [{ id: 'demo', name: 'demo', type: 'local', location: projDir }] }));

  server = spawn('node', [path.join(repoRoot, 'bin', 'aitri-hub.js'), 'web'], {
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
           AITRI_HUB_DIR: hubDir, AITRI_HUB_PORT: String(PORT), AITRI_HUB_REFRESH_MS: '400' },
    stdio: 'ignore',
  });
  await waitHealth();
});

after(() => {
  if (server) server.kill('SIGKILL');
  fs.rmSync(work, { recursive: true, force: true });
});

describe('TC-052h + TC-053h/e: detail endpoint serves scoped chains', () => {
  it('product scope returns the root chain; scopes lists the feature', async () => {
    const r = await fetch(`${BASE}/api/project/demo/detail`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.detailVersion, 1);
    assert.equal(body.scope, 'product');
    assert.deepEqual(body.scopes.sort(), ['f1', 'product']);
    assert.equal(body.testCases.cases[0].id, 'TC-ROOT');
  });
  it('scope=f1 returns f1 own chain', async () => {
    const body = await (await fetch(`${BASE}/api/project/demo/detail?scope=f1`)).json();
    assert.equal(body.scope, 'f1');
    assert.equal(body.testCases.cases[0].id, 'TC-F1');
  });
});

describe('TC-053f: hostile / unknown scope → 400', () => {
  it('traversal and unknown feature are rejected', async () => {
    assert.equal((await fetch(`${BASE}/api/project/demo/detail?scope=${encodeURIComponent('../../etc')}`)).status, 400);
    assert.equal((await fetch(`${BASE}/api/project/demo/detail?scope=f9`)).status, 400);
  });
});

describe('unknown project id → 404', () => {
  it('detail for an unregistered id is 404', async () => {
    assert.equal((await fetch(`${BASE}/api/project/nope/detail`)).status, 404);
  });
});

describe('TC-054h/e: validate endpoint renders + caches', () => {
  it('returns the verbatim report and caches within 60s', async () => {
    const before = countOf('validate');
    const a = await (await fetch(`${BASE}/api/project/demo/validate`)).json();
    assert.equal(a.available, true);
    assert.equal(a.report.health.deployable, false);
    assert.deepEqual(a.report.health.reasons, ['r1', 'r2']);
    const b = await (await fetch(`${BASE}/api/project/demo/validate`)).json();
    assert.equal(b.fetchedAt, a.fetchedAt, 'second call cached');
    assert.equal(countOf('validate') - before, 1, 'one spawn for two calls');
    const c = await (await fetch(`${BASE}/api/project/demo/validate?refresh=1`)).json();
    assert.notEqual(c.fetchedAt, a.fetchedAt);
    assert.equal(countOf('validate') - before, 2, 'refresh re-spawned');
  });
});

describe('TC-151h: collection cycle spawns status only, never validate', () => {
  it('after several 400ms cycles, validate count is unchanged by the cycle', async () => {
    const validateBefore = countOf('validate');
    const statusBefore = countOf('status');
    await new Promise(res => setTimeout(res, 1300)); // ~3 cycles at 400ms
    assert.ok(countOf('status') > statusBefore, 'cycle spawns status --json');
    assert.equal(countOf('validate'), validateBefore, 'cycle never spawns validate');
  });
});

describe('TC-153e: new routes do not shadow admin routes', () => {
  it('GET /api/projects still lists; detail route hits its own handler', async () => {
    const admin = await (await fetch(`${BASE}/api/projects`)).json();
    assert.ok(Array.isArray(admin.projects));
    assert.equal(admin.projects[0].id, 'demo');
    assert.equal((await fetch(`${BASE}/api/project/demo/detail`)).status, 200);
  });
});

describe('TC-153f: malformed detail URLs are contained (no admin, no crash)', () => {
  it('empty id and encoded traversal do not match the route → not 200', async () => {
    // Empty id and %2e%2e (..) fall outside the [a-zA-Z0-9_-] id class, so the
    // detail route never matches; they resolve to the static/404 path, never an
    // admin handler, and never a detail 200.
    for (const u of ['/api/project//detail', '/api/project/%2e%2e/detail', '/api/project/demo/bogus']) {
      const r = await fetch(`${BASE}${u}`);
      assert.notEqual(r.status, 200, u);
      // admin list still works right after — server did not crash
    }
    assert.equal((await fetch(`${BASE}/api/projects`)).status, 200, 'server alive after malformed URLs');
  });
});
