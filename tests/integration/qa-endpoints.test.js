/**
 * Tests: Epic 4 — QA Workspace write/read endpoints against the real server.
 * Covers: TC-021h (record execution, bound), TC-021e (append + persist),
 *         TC-021f (no result → 400, nothing persisted),
 *         TC-020e (manual status persists + reflects), TC-020f (automated → 409),
 *         TC-NFR-010h (loopback write allowed), TC-022h (bugs), TC-022f (parse error),
 *         TC-023h (project report), TC-023f (empty-scope report).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3213;
const BASE = `http://127.0.0.1:${PORT}`;
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let work, binDir, hubDir, projDir, server;

async function waitFor(pred, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { if (await pred()) return; } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('condition not met');
}

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-qa-ep-'));
  binDir = path.join(work, 'bin');
  hubDir = path.join(work, 'hub');
  projDir = path.join(work, 'proj');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(hubDir, { recursive: true });
  fs.mkdirSync(path.join(projDir, 'spec'), { recursive: true });
  fs.mkdirSync(path.join(projDir, 'features', 'f1', 'spec'), { recursive: true });
  fs.mkdirSync(path.join(projDir, 'features', 'f2', 'spec'), { recursive: true });

  fs.writeFileSync(path.join(binDir, 'aitri'),
    `#!/bin/sh\nif [ "$1" = "status" ] && [ "$2" = "--json" ]; then echo '{"snapshotVersion":1}'; exit 0; fi\nif [ "$1" = "--version" ]; then echo "Aitri v2.1.0"; exit 0; fi\nexit 0\n`,
    { mode: 0o755 });

  fs.writeFileSync(path.join(projDir, '.aitri'),
    JSON.stringify({ projectName: 'demo', artifactsDir: 'spec', approvedPhases: [1, 3], aitriVersion: '2.1.0' }));
  fs.writeFileSync(path.join(projDir, 'spec', '03_TEST_CASES.json'), JSON.stringify({
    test_cases: [
      { id: 'TC-M', title: 'manual case', requirement_id: 'FR-1', automation: 'manual' },
      { id: 'TC-A', title: 'auto case', requirement_id: 'FR-1' },
    ],
  }));
  fs.writeFileSync(path.join(projDir, 'spec', 'BUGS.json'), JSON.stringify({
    bugs: [
      { id: 'BUG-1', description: 'crash', severity: 'high', phase: 4, status: 'open' },
      { id: 'BUG-2', description: 'typo', severity: 'low', phase: 1, status: 'open' },
    ],
  }));
  // feature f1: no artifacts → empty report scope.
  fs.writeFileSync(path.join(projDir, 'features', 'f1', '.aitri'), JSON.stringify({ projectName: 'f1', artifactsDir: 'spec' }));
  // feature f2: corrupt BUGS.json → parse-error surfaced.
  fs.writeFileSync(path.join(projDir, 'features', 'f2', '.aitri'), JSON.stringify({ projectName: 'f2', artifactsDir: 'spec' }));
  fs.writeFileSync(path.join(projDir, 'features', 'f2', 'spec', 'BUGS.json'), '{ this is not json');

  fs.writeFileSync(path.join(hubDir, 'projects.json'),
    JSON.stringify({ projects: [{ id: 'demo', name: 'demo', type: 'local', location: projDir }] }));

  server = spawn('node', [path.join(repoRoot, 'bin', 'aitri-hub.js'), 'web'], {
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
           AITRI_HUB_DIR: hubDir, AITRI_HUB_PORT: String(PORT), AITRI_HUB_REFRESH_MS: '400' },
    stdio: 'ignore',
  });
  await waitFor(async () => (await fetch(`${BASE}/health`)).ok);
  await waitFor(async () => (await fetch(`${BASE}/api/project/demo/detail`)).ok);
});

after(() => {
  if (server) server.kill('SIGKILL');
  fs.rmSync(work, { recursive: true, force: true });
});

describe('FR-021 — record manual executions', () => {
  it('TC-021h: records an execution bound to the current run, appears in history', async () => {
    // @aitri-tc TC-021h
    const r = await fetch(`${BASE}/api/project/demo/testcases/TC-M/executions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: 'passed', notes: 'looks good', environment: 'staging',
        evidence: { mime: 'image/png', base64: PNG_B64 } }),
    });
    assert.equal(r.status, 201);
    const { execution } = await r.json();
    assert.equal(execution.result, 'passed');
    assert.ok('resultsBinding' in execution.binding, 'binding captured');
    assert.ok(execution.evidenceRef, 'evidence stored');
    const hist = await (await fetch(`${BASE}/api/project/demo/executions?tc=TC-M`)).json();
    assert.equal(hist.executions.length, 1);
    assert.equal(hist.executions[0].testCaseId, 'TC-M');
  });

  it('TC-NFR-010h: a loopback QA write is allowed (not 403)', async () => {
    // @aitri-tc TC-NFR-010h
    const r = await fetch(`${BASE}/api/project/demo/testcases/TC-M/executions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: 'blocked', notes: 'from loopback' }),
    });
    assert.equal(r.status, 201);
  });

  it('TC-021e: a second execution appends (additive) and survives re-read', async () => {
    // @aitri-tc TC-021e
    await fetch(`${BASE}/api/project/demo/testcases/TC-M/executions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result: 'failed', notes: 'regressed' }),
    });
    const hist = await (await fetch(`${BASE}/api/project/demo/executions?tc=TC-M`)).json();
    assert.ok(hist.executions.length >= 3, 'all executions retained (append-only)');
    // persisted on disk (survives restart == survives a fresh read of the store file)
    const onDisk = JSON.parse(fs.readFileSync(path.join(hubDir, 'qa', 'demo', 'executions.json'), 'utf8'));
    assert.equal(onDisk.executions.length, hist.executions.length);
  });

  it('TC-021f: an execution with no result is rejected 400 and nothing is persisted', async () => {
    // @aitri-tc TC-021f
    const before = (await (await fetch(`${BASE}/api/project/demo/executions?tc=TC-M`)).json()).executions.length;
    const r = await fetch(`${BASE}/api/project/demo/testcases/TC-M/executions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'no result chosen' }),
    });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).code, 'no_result');
    const after = (await (await fetch(`${BASE}/api/project/demo/executions?tc=TC-M`)).json()).executions.length;
    assert.equal(after, before, 'nothing persisted');
  });
});

describe('FR-020 — manual status edit', () => {
  it('TC-020e: a manual case status edit persists and reflects in the detail', async () => {
    // @aitri-tc TC-020e
    const p = await fetch(`${BASE}/api/project/demo/testcases/TC-M/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'passed' }),
    });
    assert.equal(p.status, 200);
    const detail = await (await fetch(`${BASE}/api/project/demo/detail`)).json();
    const row = detail.testCases.cases.find(c => c.id === 'TC-M');
    assert.equal(row.status, 'passed');
  });

  it('TC-020f: editing an automated case status is blocked (409)', async () => {
    // @aitri-tc TC-020f
    const p = await fetch(`${BASE}/api/project/demo/testcases/TC-A/status`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'passed' }),
    });
    assert.equal(p.status, 409);
    assert.equal((await p.json()).code, 'automated');
  });
});

describe('FR-022 — bugs', () => {
  it('TC-022h: bugs are listed with severity from BUGS.json', async () => {
    // @aitri-tc TC-022h
    const detail = await (await fetch(`${BASE}/api/project/demo/detail`)).json();
    assert.equal(detail.bugs.available, true);
    assert.ok(detail.bugs.bugs.some(b => b.severity === 'high'));
  });

  it('TC-022f: a malformed BUGS.json surfaces a parse error, never a silent zero', async () => {
    // @aitri-tc TC-022f
    const detail = await (await fetch(`${BASE}/api/project/demo/detail?scope=f2`)).json();
    assert.equal(detail.bugs.parseError, true);
  });
});

describe('FR-023 — quality reports', () => {
  it('TC-023h: the project report renders coverage, bugs-by-severity and case counts', async () => {
    // @aitri-tc TC-023h
    const { report } = await (await fetch(`${BASE}/api/project/demo/report?scope=project`)).json();
    assert.equal(report.empty, false);
    assert.ok(report.coverage.total >= 2);
    assert.equal(report.bugsBySeverity.high, 1);
    assert.equal(typeof report.coverage.passed, 'number');
  });

  it('TC-023f: a scope with no data shows an explicit empty report', async () => {
    // @aitri-tc TC-023f
    const { report } = await (await fetch(`${BASE}/api/project/demo/report?scope=feature:f1`)).json();
    assert.equal(report.empty, true);
  });
});
