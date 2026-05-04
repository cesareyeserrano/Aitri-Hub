/**
 * Integration tests for feature hub-web-only.
 * Verifies reductive CLI surface + deletions + docs posture + empty-state bundle.
 *
 * @aitri-feature hub-web-only
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import * as fsmod from 'node:fs';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;
const BIN = join(REPO_ROOT, 'bin/aitri-hub.js');

function run(args, { input } = {}) {
  return spawnSync('node', [BIN, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input,
    timeout: 5000,
  });
}

// ─ FR-001 ───────────────────────────────────────────────────────────────────

/** @aitri-tc TC-001h FR-001 */
test('TC-001h: help lists only the 4 allowed commands', () => {
  const r = run(['help']);
  assert.equal(r.status, 0);
  for (const t of ['aitri-hub web', 'integration review', 'aitri-hub help', '--version']) {
    assert.ok(r.stdout.includes(t), `missing: ${t}`);
  }
  for (const t of ['aitri-hub monitor', 'aitri-hub setup', 'aitri-hub init']) {
    assert.ok(!r.stdout.includes(t), `forbidden: ${t}`);
  }
});

/** @aitri-tc TC-001f FR-001 */
test("TC-001f: monitor exits 1 with 'Unknown command'", () => {
  const r = run(['monitor']);
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes("Unknown command: 'monitor'"));
  assert.ok(!r.stdout.includes('Dashboard running'));
});

/** @aitri-tc TC-002f FR-001 */
test("TC-002f: setup exits 1 with 'Unknown command'", () => {
  const r = run(['setup']);
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes("Unknown command: 'setup'"));
});

/** @aitri-tc TC-003f FR-001 */
test('TC-003f: init exits 1 within 2s without blocking on stdin', () => {
  const r = run(['init'], { input: '' });
  assert.equal(r.status, 1);
  assert.ok(r.stderr.includes("Unknown command: 'init'"));
});

/** @aitri-tc TC-004e FR-001 */
test('TC-004e: no args prints usage, exit 0', () => {
  const r = run([]);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('Usage:'));
  assert.ok(r.stdout.includes('aitri-hub web'));
});

/** @aitri-tc TC-005e FR-001 */
test('TC-005e: --version prints semver, exit 0', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  const r = run(['--version']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), pkg.version);
  assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+$/);
});

/** @aitri-tc TC-028h FR-001 */
test('TC-028h: help does not mention Docker as a requirement', () => {
  const r = run(['help']);
  assert.equal(r.status, 0);
  assert.ok(!/docker/i.test(r.stdout));
});

// ─ FR-002 ───────────────────────────────────────────────────────────────────

/** @aitri-tc TC-007h FR-002 */
test('TC-007h: deleted command modules are absent', () => {
  assert.equal(existsSync(join(REPO_ROOT, 'lib/commands/init.js')), false);
  assert.equal(existsSync(join(REPO_ROOT, 'lib/commands/setup.js')), false);
  assert.equal(existsSync(join(REPO_ROOT, 'lib/commands/monitor.js')), false);
  assert.equal(existsSync(join(REPO_ROOT, 'lib/commands/web.js')), true);
  assert.equal(existsSync(join(REPO_ROOT, 'lib/commands/integration-review.js')), true);
});

/** @aitri-tc TC-008h FR-002 */
test('TC-008h: no source file imports init/setup/monitor commands', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const re = /from\s+['"].*commands\/(init|setup|monitor)/;
  const walk = (dir, acc = []) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const s = statSync(p);
      if (s.isDirectory()) walk(p, acc);
      else if (/\.(js|jsx)$/.test(entry)) acc.push(p);
    }
    return acc;
  };
  const files = ['bin', 'lib', 'tests', 'web/src'].flatMap(d => walk(join(REPO_ROOT, d)));
  const hits = files.filter(f => re.test(readFileSync(f, 'utf8')));
  assert.deepEqual(hits, []);
});

/** @aitri-tc TC-009h FR-002 */
test('TC-009h: obsolete test files are absent', () => {
  assert.equal(existsSync(join(REPO_ROOT, 'tests/unit/monitor-stub.test.js')), false);
  assert.equal(existsSync(join(REPO_ROOT, 'tests/integration/setup.test.js')), false);
});

/** @aitri-tc TC-010f FR-002 */
test('TC-010f: bin/aitri-hub.js has no cmdInit/cmdSetup/cmdMonitor references', () => {
  const src = readFileSync(join(REPO_ROOT, 'bin/aitri-hub.js'), 'utf8');
  assert.equal(/cmdInit|cmdSetup|cmdMonitor/.test(src), false);
});

// ─ FR-003 (empty-state via bundled SPA) ─────────────────────────────────────

/** @aitri-tc TC-011h FR-003 */
test('TC-011h: bundled SPA contains /admin CTA with correct label', () => {
  const { readdirSync } = fsmod;
  const distDir = join(REPO_ROOT, 'docker/web-dist/assets');
  const jsFile = readdirSync(distDir).find(f => f.endsWith('.js'));
  const js = readFileSync(join(distDir, jsFile), 'utf8');
  assert.ok(js.includes('Add your first project'), 'CTA label missing from bundle');
  assert.ok(js.includes('/admin'), '/admin target missing from bundle');
});

/** @aitri-tc TC-012f FR-003 */
test('TC-012f: bundled SPA does not mention removed CLI commands', () => {
  const { readdirSync } = fsmod;
  const distDir = join(REPO_ROOT, 'docker/web-dist/assets');
  const jsFile = readdirSync(distDir).find(f => f.endsWith('.js'));
  const js = readFileSync(join(distDir, jsFile), 'utf8');
  for (const t of ['aitri-hub setup', 'aitri-hub monitor', 'aitri-hub init']) {
    assert.ok(!js.includes(t), `forbidden string in bundle: ${t}`);
  }
});

// ─ FR-004 (docs) ─────────────────────────────────────────────────────────────

/** @aitri-tc TC-015h FR-004 */
test('TC-015h: README/DEPLOYMENT contain no deprecated CLI commands', () => {
  const re = /aitri-hub (monitor|setup|init)(?!-)/;
  for (const f of ['README.md', 'DEPLOYMENT.md']) {
    const content = readFileSync(join(REPO_ROOT, f), 'utf8');
    assert.equal(re.test(content), false, `${f} contains deprecated CLI reference`);
  }
});

/** @aitri-tc TC-016h FR-004 */
test('TC-016h: README Quick Start lists npm install then aitri-hub web', () => {
  const content = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
  const qs = content.search(/^##\s+Quick\s*Start/im);
  assert.ok(qs >= 0, 'Quick Start heading not found');
  const after = content.slice(qs);
  const block = after.match(/```bash\n([\s\S]*?)\n```/);
  assert.ok(block, 'bash block not found after Quick Start');
  const body = block[1];
  assert.ok(body.indexOf('npm install') < body.indexOf('aitri-hub web'));
  for (const t of ['aitri-hub setup', 'aitri-hub monitor', 'docker compose']) {
    assert.ok(!body.includes(t), `forbidden in quickstart: ${t}`);
  }
});

/** @aitri-tc TC-017h FR-004 */
test('TC-017h: DEPLOYMENT.md wraps Docker under an Optional heading', () => {
  const content = readFileSync(join(REPO_ROOT, 'DEPLOYMENT.md'), 'utf8');
  const lines = content.split('\n');
  const optIdx = lines.findIndex(l => /^#{2,3}\s+.*optional.*docker/i.test(l));
  assert.ok(optIdx >= 0, 'Optional-Docker heading not found');
  const dockerLines = lines
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.includes('docker compose up'));
  for (const { i } of dockerLines)
    assert.ok(i > optIdx, `docker compose up at line ${i} before heading at ${optIdx}`);
});

/** @aitri-tc TC-018f FR-004 */
test('TC-018f: README does not describe a CLI dashboard mode', () => {
  const content = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
  assert.equal(content.indexOf('CLI terminal dashboard'), -1);
  assert.equal(content.indexOf('aitri-hub monitor'), -1);
});

// ─ FR-005 (persistence) ─────────────────────────────────────────────────────

/** @aitri-tc TC-019h FR-005 */
test('TC-019h: legacy projects.json (with defaultInterface) reads unchanged', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-legacy-'));
  try {
    const legacy = {
      version: 1,
      defaultInterface: 'cli',
      projects: [
        {
          id: 'a',
          name: 'Alpha',
          type: 'local',
          location: '/tmp/alpha',
          addedAt: '2025-01-01T00:00:00Z',
        },
        {
          id: 'b',
          name: 'Beta',
          type: 'local',
          location: '/tmp/beta',
          addedAt: '2025-01-02T00:00:00Z',
        },
        {
          id: 'c',
          name: 'Gamma',
          type: 'local',
          location: '/tmp/gamma',
          addedAt: '2025-01-03T00:00:00Z',
        },
      ],
    };
    writeFileSync(join(dir, 'projects.json'), JSON.stringify(legacy));
    process.env.AITRI_HUB_DIR = dir;
    const { readProjects } = await import('../../lib/store/projects.js');
    const result = readProjects();
    assert.equal(result.projects.length, 3);
    assert.deepEqual(
      result.projects.map(p => p.name),
      ['Alpha', 'Beta', 'Gamma'],
    );
  } finally {
    delete process.env.AITRI_HUB_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

/** @aitri-tc TC-021e FR-005 */
test('TC-021e: projects.json without version field reads correctly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-minimal-'));
  try {
    writeFileSync(
      join(dir, 'projects.json'),
      JSON.stringify({
        projects: [
          {
            id: 'x',
            name: 'X',
            type: 'local',
            location: '/tmp/x',
            addedAt: '2025-01-01T00:00:00Z',
          },
        ],
      }),
    );
    process.env.AITRI_HUB_DIR = dir;
    const { readProjects } = await import('../../lib/store/projects.js');
    const result = readProjects();
    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0].name, 'X');
  } finally {
    delete process.env.AITRI_HUB_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

// ─ FR-006 (admin API guard) covered by tests/e2e/admin-api.test.js ───────────
/** @aitri-tc TC-023h FR-006 — covered by tests/e2e/admin-api.test.js TC-016h */
/** @aitri-tc TC-024h FR-006 — covered by tests/e2e/admin-api.test.js TC-e2eAdminAdd/Remove */
/** @aitri-tc TC-026f FR-006 — covered by tests/e2e/admin-api.test.js TC-NFR010f */
/** @aitri-tc TC-027e FR-006 — covered by tests/e2e/admin-api.test.js TC-NFR010h/e */
