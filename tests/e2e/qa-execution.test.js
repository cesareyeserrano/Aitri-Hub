/**
 * Tests: Epic 4 — QA execution flow (E2E — Playwright).
 * Covers: TC-E2E-002h (select manual case → record execution with evidence → appears
 *         in history), TC-E2E-003f (submit with no result → inline error, nothing saved).
 *
 * Spawns a dedicated `aitri-hub web` with a temp hub + a seeded fixture project (so
 * the real detail/executions endpoints serve a manual test case), and drives the
 * built SPA against it — isolated from the shared Playwright webServer.
 *
 * @aitri-trace FR-ID: FR-021, US-ID: US-021, AC-ID: AC-021-1, AC-021-3, TC-ID: TC-E2E-002h, TC-E2E-003f
 */

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 3399;
const BASE = `http://127.0.0.1:${PORT}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let work, server, pngPath;

test.beforeAll(async () => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-qa-e2e-'));
  const binDir = path.join(work, 'bin');
  const hubDir = path.join(work, 'hub');
  const projDir = path.join(work, 'proj');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(hubDir, { recursive: true });
  fs.mkdirSync(path.join(projDir, 'spec'), { recursive: true });
  pngPath = path.join(work, 'evidence.png');
  fs.writeFileSync(pngPath, PNG);

  fs.writeFileSync(path.join(binDir, 'aitri'),
    `#!/bin/sh\nif [ "$1" = "status" ] && [ "$2" = "--json" ]; then echo '{"snapshotVersion":1}'; exit 0; fi\nif [ "$1" = "--version" ]; then echo "Aitri v2.1.0"; exit 0; fi\nexit 0\n`,
    { mode: 0o755 });
  fs.writeFileSync(path.join(projDir, '.aitri'),
    JSON.stringify({ projectName: 'qa-demo', artifactsDir: 'spec', approvedPhases: [1, 3], aitriVersion: '2.1.0' }));
  fs.writeFileSync(path.join(projDir, 'spec', '03_TEST_CASES.json'), JSON.stringify({
    test_cases: [{ id: 'TC-MAN', title: 'a manual case', requirement_id: 'FR-1', automation: 'manual' }],
  }));
  fs.writeFileSync(path.join(hubDir, 'projects.json'),
    JSON.stringify({ projects: [{ id: 'qademo', name: 'qa-demo', type: 'local', location: projDir }] }));

  server = spawn('node', [path.join(repoRoot, 'bin', 'aitri-hub.js'), 'web'], {
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
           AITRI_HUB_DIR: hubDir, AITRI_HUB_PORT: String(PORT), AITRI_HUB_REFRESH_MS: '300' },
    stdio: 'ignore',
  });
  // Wait for the project to be collected + served.
  const deadline = Date.now() + 20000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/api/project/qademo/detail`);
      if (r.ok) { const d = await r.json(); if (d.testCases?.cases?.length) break; }
    } catch { /* retry */ }
    if (Date.now() > deadline) throw new Error('fixture not ready');
    await new Promise(res => setTimeout(res, 200));
  }
});

test.afterAll(() => {
  if (server) server.kill('SIGKILL');
  if (work) fs.rmSync(work, { recursive: true, force: true });
});

async function openTestCases(page) {
  await page.goto(`${BASE}/project/qademo`);
  await page.waitForSelector('[data-testid="detail-view"]', { timeout: 15000 });
  await page.locator('[data-testid="nav-item"][data-section="testcases"]').click();
  await page.waitForSelector('[data-testid="section-testcases"]');
  await page.locator('[data-testid="tc-select"]').first().click();
  await page.waitForSelector('[data-testid="exec-form"]');
}

test('TC-E2E-002h: record a manual execution with evidence — appears in history', async ({ page }) => {
  // @aitri-tc TC-E2E-002h
  await openTestCases(page);
  await page.locator('[data-testid="result-btn"][data-result="passed"]').click();
  await page.locator('[data-testid="exec-evidence"]').setInputFiles(pngPath);
  await page.locator('[data-testid="exec-env"]').fill('macOS / Chrome');
  await page.locator('[data-testid="exec-submit"]').click();
  // The execution appears in the case history.
  await page.waitForSelector('[data-testid="exec-item"]', { timeout: 15000 });
  await expect(page.locator('[data-testid="exec-item"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="exec-item"]').first()).toContainText('passed');
});

test('TC-E2E-003f: submitting with no result shows an inline error and saves nothing', async ({ page }) => {
  // @aitri-tc TC-E2E-003f
  await openTestCases(page);
  // Submit without choosing a result.
  await page.locator('[data-testid="exec-submit"]').click();
  await expect(page.locator('[data-testid="exec-error"]')).toContainText(/select a result/i);
  // Nothing persisted for this fresh case (TC-E2E-002h ran on the same case, so assert
  // the store did not gain an entry from THIS invalid submit by checking the API).
  const res = await page.request.get(`${BASE}/api/project/qademo/executions?tc=TC-MAN`);
  const body = await res.json();
  // Only the valid execution from TC-E2E-002h (if that ran first) — never one with no result.
  for (const e of body.executions) expect(['passed', 'failed', 'blocked']).toContain(e.result);
});
