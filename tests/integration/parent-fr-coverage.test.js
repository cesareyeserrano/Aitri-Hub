/**
 * Parent-level FR coverage for FR-001 (browser admin UI) and FR-005 (browser empty state).
 * Covers the 6 TCs retired from the CLI behavior and rewritten for the web-only reality.
 *
 * @aitri-feature parent-fr-coverage
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = new URL('../..', import.meta.url).pathname;

function readBundleJs() {
  const distDir = join(REPO_ROOT, 'docker/web-dist/assets');
  const jsFile = readdirSync(distDir).find(f => f.endsWith('.js'));
  return readFileSync(join(distDir, jsFile), 'utf8');
}

// ─ FR-001 (browser admin UI) ────────────────────────────────────────────────

/** @aitri-tc TC-001h FR-001 */
test('TC-001h: admin API add-project path persists a local entry to projects.json', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hub-fr001h-'));
  try {
    const projDir = join(dir, 'proj-a');
    mkdirSync(projDir);
    process.env.AITRI_HUB_DIR = dir;
    const { writeProjects, readProjects } = await import('../../lib/store/projects.js');
    writeProjects({
      version: 1,
      projects: [
        {
          id: 'a',
          name: 'proj-a',
          type: 'local',
          location: projDir,
          addedAt: new Date().toISOString(),
        },
      ],
    });
    const result = readProjects();
    assert.equal(result.projects.length, 1);
    assert.equal(result.projects[0].location, projDir);
    assert.equal(result.projects[0].type, 'local');
  } finally {
    delete process.env.AITRI_HUB_DIR;
    rmSync(dir, { recursive: true, force: true });
  }
});

/** @aitri-tc TC-001e FR-001 */
test('TC-001e: folder scan helper returns only children with a .aitri/ directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hub-fr001e-'));
  try {
    mkdirSync(join(root, 'childA'));
    mkdirSync(join(root, 'childA', '.aitri'));
    mkdirSync(join(root, 'childB'));
    mkdirSync(join(root, 'childB', '.aitri'));
    mkdirSync(join(root, 'childC'));
    writeFileSync(join(root, 'childC', 'README.md'), 'just docs');

    const { scanFolder } = await import('../../lib/utils/scan.js');
    const found = scanFolder(root);
    const names = found.map(c => c.name).sort();
    assert.deepEqual(names, ['childA', 'childB']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

/** @aitri-tc TC-001f FR-001 */
test('TC-001f: admin API source enforces loopback-only guard on /api/* routes', () => {
  const src = readFileSync(join(REPO_ROOT, 'lib/commands/web.js'), 'utf8');
  assert.ok(/127\.0\.0\.1/.test(src), 'web.js must reference 127.0.0.1 loopback check');
  assert.ok(/::1/.test(src), 'web.js must reference ::1 loopback check');
  assert.ok(/403/.test(src), 'web.js must return 403 for non-loopback peers');
});

// ─ FR-005 (browser empty state) ─────────────────────────────────────────────

/** @aitri-tc TC-005h FR-005 */
test('TC-005h: bundled SPA ships onboarding title, CTA and /admin target', () => {
  const js = readBundleJs();
  assert.ok(js.includes('No projects yet'), 'bundle missing onboarding title');
  assert.ok(js.includes('Add your first project'), 'bundle missing CTA label');
  assert.ok(js.includes('/admin'), 'bundle missing /admin target');
});

/** @aitri-tc TC-005e FR-005 */
test('TC-005e: bundled SPA contains no references to removed CLI commands', () => {
  const js = readBundleJs();
  for (const t of ['aitri-hub setup', 'aitri-hub monitor', 'aitri-hub init']) {
    assert.ok(!js.includes(t), `forbidden string in bundle: ${t}`);
  }
});

/** @aitri-tc TC-005f FR-005 */
test('TC-005f: HomeView source renders empty-state onboarding panel when projects is empty', () => {
  const src = readFileSync(join(REPO_ROOT, 'web/src/components/HomeView.jsx'), 'utf8');
  assert.ok(/projects\.length\s*===\s*0/.test(src), 'HomeView must branch on empty projects array');
  assert.ok(src.includes('No projects yet'), 'HomeView must render onboarding title');
  assert.ok(src.includes('Add your first project'), 'HomeView must render CTA label');
  assert.ok(src.includes('/admin'), 'HomeView must link to /admin');
  assert.ok(src.includes('What counts as a project?'), 'HomeView must include disclosure');
});
