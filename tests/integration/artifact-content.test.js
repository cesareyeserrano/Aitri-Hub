/**
 * Tests: Epic 3 — Artifacts explorer tree + confined artifact-content endpoint.
 * Covers: TC-015h (per-phase tree + rolled-up glyph),
 *         TC-016h (markdown content + inline image served),
 *         TC-016e (unresolved image → 404, no crash),
 *         TC-016f (path traversal → 403, no file leak),
 *         TC-JSON-016h (JSON returned as parsed projection, not raw dump),
 *         TC-PATH-016f (absolute path → 403),
 *         TC-PATH-017f (URL-encoded traversal → 403 after decode).
 *
 * Spawns the real `aitri-hub web` server against a temp hub dir with a registered
 * fixture project, then drives GET /api/project/:id/{detail,artifact}.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3212;
const BASE = `http://127.0.0.1:${PORT}`;

// 1x1 transparent PNG.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

let work, binDir, hubDir, projDir, server;

async function waitHealth(ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise(res => setTimeout(res, 150));
  }
  throw new Error('server did not become healthy');
}

before(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-art-'));
  binDir = path.join(work, 'bin');
  hubDir = path.join(work, 'hub');
  projDir = path.join(work, 'proj');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(hubDir, { recursive: true });
  fs.mkdirSync(path.join(projDir, 'spec'), { recursive: true });

  // Stub aitri on PATH so the server's status/version spawns succeed.
  fs.writeFileSync(path.join(binDir, 'aitri'),
    `#!/bin/sh\nif [ "$1" = "status" ] && [ "$2" = "--json" ]; then echo '{"snapshotVersion":1}'; exit 0; fi\nif [ "$1" = "--version" ]; then echo "Aitri v2.1.0"; exit 0; fi\nexit 0\n`,
    { mode: 0o755 });

  // .aitri: phase 1 approved; phase 2 rejected (rejections["2"]); artifactsDir=spec.
  fs.writeFileSync(path.join(projDir, '.aitri'), JSON.stringify({
    projectName: 'demo', artifactsDir: 'spec',
    approvedPhases: [1], completedPhases: [1, 2], currentPhase: 3,
    rejections: { 2: { at: '2026-07-01T00:00:00Z', feedback: 'fix the design' } },
    aitriVersion: '2.1.0',
  }));

  const spec = path.join(projDir, 'spec');
  // Phase 1 artifacts (approved).
  fs.writeFileSync(path.join(spec, '00_DISCOVERY.md'), '# Discovery\n\nsome brief.\n');
  fs.writeFileSync(path.join(spec, '01_REQUIREMENTS.json'),
    JSON.stringify({ project_name: 'demo', functional_requirements: [{ id: 'FR-1', title: 't', priority: 'MUST' }] }));
  // Phase 2 artifact (rejected) — markdown with a heading, a table, and an inline image.
  fs.writeFileSync(path.join(spec, '02_SYSTEM_DESIGN.md'),
    '# Design\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n![diagram](diagram.png)\n\n![missing](nope.png)\n');
  fs.writeFileSync(path.join(spec, 'diagram.png'), PNG_1x1);
  // Phase 3 artifact (JSON, for the structured-projection check).
  fs.writeFileSync(path.join(spec, '03_TEST_CASES.json'),
    JSON.stringify({ test_cases: [{ id: 'TC-1', title: 'x', requirement_id: 'FR-1' }] }));

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

describe('FR-015 — artifact tree grouped by phase with rolled-up glyph', () => {
  it('TC-015h: detail groups artifacts by phase; folder glyph = worst child status', async () => {
    // @aitri-tc TC-015h
    const body = await (await fetch(`${BASE}/api/project/demo/detail`)).json();
    const tree = body.artifacts.tree;
    const p1 = tree.find(g => g.phase === 1);
    const p2 = tree.find(g => g.phase === 2);
    assert.equal(p1.status, 'approved');
    assert.equal(p1.glyph, '✓');
    assert.equal(p2.status, 'rejected');
    assert.equal(p2.glyph, '✕');
    // Phase 1 lists its present files by technical name.
    assert.ok(p1.files.some(f => f.technicalName === '01_REQUIREMENTS.json'));
  });
});

describe('FR-016 — artifact content endpoint', () => {
  it('TC-016h: markdown returns formatted source + the referenced image serves inline', async () => {
    // @aitri-tc TC-016h
    const md = await (await fetch(`${BASE}/api/project/demo/artifact?path=02_SYSTEM_DESIGN.md`)).json();
    assert.equal(md.kind, 'markdown');
    assert.match(md.content, /^# Design/m);        // heading
    assert.match(md.content, /\| a \| b \|/);       // table
    assert.match(md.content, /!\[diagram\]\(diagram\.png\)/); // image ref

    const img = await (await fetch(`${BASE}/api/project/demo/artifact?path=diagram.png`)).json();
    assert.equal(img.kind, 'image');
    assert.match(img.dataUri, /^data:image\/png;base64,/);
  });

  it('TC-JSON-016h: JSON artifact returns a parsed projection, not a raw text dump', async () => {
    // @aitri-tc TC-JSON-016h
    const j = await (await fetch(`${BASE}/api/project/demo/artifact?path=03_TEST_CASES.json`)).json();
    assert.equal(j.kind, 'json');
    assert.equal(typeof j.parsed, 'object');
    assert.equal(j.parsed.test_cases[0].id, 'TC-1');
    assert.equal(j.raw, undefined); // not a raw string dump
  });

  it('TC-016e: an unresolved image path returns 404 (reader degrades to alt text, no crash)', async () => {
    // @aitri-tc TC-016e
    const r = await fetch(`${BASE}/api/project/demo/artifact?path=nope.png`);
    assert.equal(r.status, 404);
    const b = await r.json();
    assert.equal(b.code, 'not_found');
  });

  it('TC-016f: path traversal is rejected 403 and leaks no file', async () => {
    // @aitri-tc TC-016f
    const r = await fetch(`${BASE}/api/project/demo/artifact?path=${encodeURIComponent('../../../../etc/passwd')}`);
    assert.equal(r.status, 403);
    const b = await r.json();
    assert.equal(b.code, 'confinement');
    assert.ok(!('root:' in b), 'no /etc/passwd contents leaked');
  });

  it('TC-PATH-016f: an absolute path is rejected 403', async () => {
    // @aitri-tc TC-PATH-016f
    const r = await fetch(`${BASE}/api/project/demo/artifact?path=${encodeURIComponent('/etc/passwd')}`);
    assert.equal(r.status, 403);
    assert.equal((await r.json()).code, 'confinement');
  });

  it('TC-PATH-017f: URL-encoded traversal (%2e%2e) is rejected after decode', async () => {
    // @aitri-tc TC-PATH-017f
    // Send the literal percent-encoded sequence on the wire; the server decodes it to `..`.
    const r = await fetch(`${BASE}/api/project/demo/artifact?path=%2e%2e%2f%2e%2e%2fetc%2fpasswd`);
    assert.equal(r.status, 403);
    assert.equal((await r.json()).code, 'confinement');
  });
});
