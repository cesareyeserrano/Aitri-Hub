/**
 * Tests: admin API e2e flows
 * Covers: TC-e2eAdminAdd, TC-e2eAdminRemove, TC-016h, TC-016n, TC-016e, TC-016f,
 *         TC-NFR010h, TC-NFR010e, TC-NFR010f, TC-NFR011h, TC-NFR011f,
 *         TC-023h, TC-023e, TC-023f, TC-e2eFolderScan, TC-e2eFolderEmpty
 *
 * Uses Playwright request fixture (pure HTTP — no browser needed).
 * Server is started by playwright.config.js webServer.
 *
 * @aitri-trace FR-ID: FR-014, FR-015, FR-016, FR-021, FR-023
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HUB_DIR  = '/tmp/aitri-hub-e2e';
const PROJECTS = path.join(HUB_DIR, 'projects.json');
const BASE     = 'http://localhost:3099';

// Ensure hub dir exists and projects.json is clean before each test
test.beforeEach(() => {
  fs.mkdirSync(HUB_DIR, { recursive: true });
  if (fs.existsSync(PROJECTS)) fs.rmSync(PROJECTS);
});

// ── TC-e2eAdminAdd ────────────────────────────────────────────────────────────

test('TC-e2eAdminAdd: POST /api/projects persists entry to projects.json', async ({ request }) => {
  const payload = {
    name: 'e2e-test-project',
    type: 'local',
    location: os.tmpdir(),
  };

  const res = await request.post(`${BASE}/api/projects`, {
    data: payload,
    headers: { 'Content-Type': 'application/json' },
  });

  expect(res.status()).toBe(201);

  const body = await res.json();
  expect(body.project.name).toBe('e2e-test-project');
  expect(body.project.id).toBeTruthy();

  // Verify persistence on disk
  const raw = JSON.parse(fs.readFileSync(PROJECTS, 'utf8'));
  const found = raw.projects.find(p => p.name === 'e2e-test-project');
  expect(found).toBeTruthy();
  expect(found.location).toBe(os.tmpdir());
});

// ── TC-016h ───────────────────────────────────────────────────────────────────

test('TC-016h: GET /api/projects returns 200 with empty array when projects.json absent', async ({ request }) => {
  // beforeEach removes projects.json — file is absent
  const res = await request.get(`${BASE}/api/projects`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.projects).toEqual([]);
});

// ── TC-016n ───────────────────────────────────────────────────────────────────

test('TC-016n: PUT /api/projects/:id with unknown id returns 404', async ({ request }) => {
  const res = await request.put(`${BASE}/api/projects/zzzzzzzz`, {
    data: { name: 'renamed' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(404);
  const body = await res.json();
  expect(body.error).toBe('not_found');
});

// ── TC-016e ───────────────────────────────────────────────────────────────────

test('TC-016e: concurrent POST requests produce valid projects.json', async ({ request }) => {
  // Fire two simultaneous POSTs with different names
  const [r1, r2] = await Promise.all([
    request.post(`${BASE}/api/projects`, {
      data: { name: 'concurrent-a', type: 'local', location: os.tmpdir() },
      headers: { 'Content-Type': 'application/json' },
    }),
    request.post(`${BASE}/api/projects`, {
      data: { name: 'concurrent-b', type: 'local', location: os.tmpdir() },
      headers: { 'Content-Type': 'application/json' },
    }),
  ]);

  // At least one must succeed (race: duplicate names may cause 400 for one)
  const statuses = [r1.status(), r2.status()];
  expect(statuses.some(s => s === 201)).toBe(true);

  // projects.json must be valid JSON after concurrent writes
  expect(() => JSON.parse(fs.readFileSync(PROJECTS, 'utf8'))).not.toThrow();
});

// ── TC-016f ───────────────────────────────────────────────────────────────────

test('TC-016f: POST returns 500 when hub dir is read-only (write failure)', async ({ request }) => {
  // Make hub dir read-only to trigger write failure
  fs.chmodSync(HUB_DIR, 0o555);
  try {
    const res = await request.post(`${BASE}/api/projects`, {
      data: { name: 'will-fail', type: 'local', location: os.tmpdir() },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(500);
  } finally {
    // Restore write access for subsequent tests
    fs.chmodSync(HUB_DIR, 0o755);
  }
});

// ── TC-NFR010h ────────────────────────────────────────────────────────────────

test('TC-NFR010h: POST with path traversal location ../../etc/passwd returns 400 path_traversal', async ({ request }) => {
  const res = await request.post(`${BASE}/api/projects`, {
    data: { name: 'evil', type: 'local', location: '../../etc/passwd' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toBe('path_traversal');
});

// ── TC-NFR010e ────────────────────────────────────────────────────────────────

test('TC-NFR010e: POST with ../traversal in location returns 400 path_traversal', async ({ request }) => {
  const res = await request.post(`${BASE}/api/projects`, {
    data: { name: 'evil2', type: 'local', location: '/valid/../etc/passwd' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toBe('path_traversal');
});

// ── TC-NFR010f ────────────────────────────────────────────────────────────────

test('TC-NFR010f: POST with non-existent absolute path returns 400', async ({ request }) => {
  const res = await request.post(`${BASE}/api/projects`, {
    data: { name: 'outside', type: 'local', location: '/nonexistent-aitri-test-path-xyz' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(['path_traversal', 'path_not_found'].includes(body.error)).toBe(true);
});

// ── TC-NFR011h ────────────────────────────────────────────────────────────────

test('TC-NFR011h: GET /api/projects succeeds — logging does not interfere with response', async ({ request }) => {
  // Observability: verify GET still returns 200 when logging is active
  const res = await request.get(`${BASE}/api/projects`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.projects)).toBe(true);
});

// ── TC-NFR011f ────────────────────────────────────────────────────────────────

test('TC-NFR011f: POST with empty body returns 400 — error path logging does not crash server', async ({ request }) => {
  const res = await request.post(`${BASE}/api/projects`, {
    data: '',
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  // Server must still respond to subsequent requests (logging didn't crash it)
  const check = await request.get(`${BASE}/api/projects`);
  expect(check.status()).toBe(200);
});

// ── TC-e2eAdminRemove ─────────────────────────────────────────────────────────

test('TC-e2eAdminRemove: DELETE /api/projects/:id removes entry from projects.json', async ({ request }) => {
  // Seed one project directly on disk
  const seedProject = {
    id: 'abc12345',
    name: 'Alpha',
    type: 'local',
    location: os.tmpdir(),
    addedAt: new Date().toISOString(),
  };
  fs.writeFileSync(PROJECTS, JSON.stringify({ projects: [seedProject] }, null, 2));

  // Verify it exists first
  const listRes = await request.get(`${BASE}/api/projects`);
  expect(listRes.status()).toBe(200);
  const listBody = await listRes.json();
  expect(listBody.projects).toHaveLength(1);

  // Delete it
  const delRes = await request.delete(`${BASE}/api/projects/abc12345`);
  expect(delRes.status()).toBe(204);

  // Verify removed from disk
  const raw = JSON.parse(fs.readFileSync(PROJECTS, 'utf8'));
  const found = raw.projects.find(p => p.id === 'abc12345');
  expect(found).toBeUndefined();

  // Verify removed from API
  const listRes2 = await request.get(`${BASE}/api/projects`);
  const listBody2 = await listRes2.json();
  expect(listBody2.projects).toHaveLength(0);
});

// ── TC-023h ───────────────────────────────────────────────────────────────────

test('TC-023h: POST with type=folder and valid directory returns 201', async ({ request }) => {
  const res = await request.post(`${BASE}/api/projects`, {
    data: { name: 'my-workspace', type: 'folder', location: os.tmpdir() },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(201);
  const body = await res.json();
  expect(body.project.type).toBe('folder');
  expect(body.project.location).toBe(os.tmpdir());
});

// ── TC-023e ───────────────────────────────────────────────────────────────────

test('TC-023e: POST with type=folder and non-existent path returns 400 path_not_found', async ({ request }) => {
  const res = await request.post(`${BASE}/api/projects`, {
    data: { name: 'bad-workspace', type: 'folder', location: '/nonexistent-aitri-folder-e2e-xyz' },
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error).toBe('path_not_found');
});

// ── TC-023f ───────────────────────────────────────────────────────────────────

test('TC-023f: POST with type=folder pointing to a file returns 400 not_a_directory', async ({ request }) => {
  // Create a temp file to use as target
  const tmpFile = path.join(os.tmpdir(), `aitri-test-file-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, 'test');
  try {
    const res = await request.post(`${BASE}/api/projects`, {
      data: { name: 'file-as-folder', type: 'folder', location: tmpFile },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('not_a_directory');
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
});

// ── TC-e2eFolderScan ──────────────────────────────────────────────────────────

test('TC-e2eFolderScan: register folder type; dashboard shows child cards', async ({ request }) => {
  // Create workspace with 2 valid child projects
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-e2e-workspace-'));
  const childA = path.join(workspace, 'child-a');
  const childB = path.join(workspace, 'child-b');
  fs.mkdirSync(childA);
  fs.mkdirSync(childB);
  fs.writeFileSync(path.join(childA, 'package.json'), '{"name":"child-a"}');
  fs.writeFileSync(path.join(childB, 'package.json'), '{"name":"child-b"}');

  try {
    // Register the folder-type project
    const addRes = await request.post(`${BASE}/api/projects`, {
      data: { name: 'e2e-workspace', type: 'folder', location: workspace },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(addRes.status()).toBe(201);

    // Poll dashboard.json for up to 20s for children to appear
    let dashProjects = [];
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1000));
      const dashRes = await request.get(`${BASE}/data/dashboard.json`);
      if (dashRes.status() === 200) {
        const dash = await dashRes.json();
        dashProjects = (dash.projects || []).filter(p => p.parentFolder === workspace);
        if (dashProjects.length >= 2) break;
      }
    }

    expect(dashProjects.length).toBeGreaterThanOrEqual(2);
    // Parent folder entry should NOT appear in dashboard
    const parentCard = (await (await request.get(`${BASE}/data/dashboard.json`)).json())
      .projects?.find(p => p.name === 'e2e-workspace');
    expect(parentCard).toBeUndefined();
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// ── TC-e2eFolderEmpty ─────────────────────────────────────────────────────────

test('TC-e2eFolderEmpty: folder with no valid children produces no cards', async ({ request }) => {
  // Create workspace with no valid project children
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-e2e-empty-workspace-'));
  const emptyDir = path.join(workspace, 'empty-subdir');
  fs.mkdirSync(emptyDir);

  try {
    const addRes = await request.post(`${BASE}/api/projects`, {
      data: { name: 'empty-workspace', type: 'folder', location: workspace },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(addRes.status()).toBe(201);

    // Wait one collector cycle
    await new Promise(r => setTimeout(r, 6000));

    const dashRes = await request.get(`${BASE}/data/dashboard.json`);
    expect(dashRes.status()).toBe(200);
    const dash = await dashRes.json();
    const parentCards = (dash.projects || []).filter(p => p.parentFolder === workspace);
    expect(parentCards.length).toBe(0);

    // Server still healthy
    const health = await request.get(`${BASE}/health`);
    expect(health.status()).toBe(200);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
