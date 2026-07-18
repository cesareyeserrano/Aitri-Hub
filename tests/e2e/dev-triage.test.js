/**
 * Tests: Dev-triage flow (E2E — Playwright) — Monitor → open CRITICAL → Health → Back.
 * Covers: TC-E2E-001h (FR-012).
 *
 * Strategy: inject a per-test dashboard.json fixture via page.route (no fs races on the
 * shared AITRI_HUB_DIR) with one CRITICAL and one NOMINAL project. Drives the redesigned
 * bento Monitor and single-page Detail shell, asserting browser-Back preserves the filter.
 *
 * @aitri-trace FR-ID: FR-012, US-ID: US-012, AC-ID: AC-012-1, TC-ID: TC-E2E-001h
 */

import { test, expect } from '@playwright/test';

const BASE_URL = `http://localhost:${process.env.AITRI_HUB_PORT ?? 3099}`;

function project(overrides = {}) {
  return {
    id: 'p-crit',
    name: 'alpha-service',
    status: 'warning',
    location: '/tmp/alpha',
    type: 'local',
    aitriState: { projectName: 'alpha-service', approvedPhases: [1, 2], currentPhase: 3, events: [] },
    testSummary: { available: true, passed: 3, failed: 2, skipped: 0, total: 5 },
    health: { deployable: false, deployableReasons: [], versionMismatch: false, driftPresent: [], staleVerify: [] },
    externalSignals: { available: false, signals: [] },
    alerts: [],
    gitMeta: { branch: 'main', unpushedCommits: 0 },
    appVersion: '0.3.0',
    lastSession: null,
    ...overrides,
  };
}

function dashboard(projects) {
  return { generatedAt: new Date().toISOString(), projects, integrationAlert: null, aggregatedTcTotal: 0 };
}

test('TC-E2E-001h: Dev triage — Monitor → CRITICAL filter → open detail → Health → Back preserves filter', async ({ page }) => {
  // @aitri-tc TC-E2E-001h
  const crit = project({
    id: 'p-crit', name: 'alpha-service', status: 'error',
    testSummary: { available: true, passed: 3, failed: 2, skipped: 0, total: 5 }, // failing tests → Health CRITICAL
    alerts: [{ type: 'verify', severity: 'blocking', message: 'verify failing', command: 'aitri verify' }],
  });
  const nominal = project({ id: 'p-ok', name: 'bravo-lib', status: 'healthy', alerts: [] });

  await page.route('**/data/dashboard.json', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard([crit, nominal])) })
  );

  // 1) Monitor renders the bento grid worst-first.
  await page.goto(BASE_URL);
  await page.waitForSelector('[data-testid="monitor-card"]', { timeout: 10_000 });
  expect(await page.locator('[data-testid="monitor-card"]').count()).toBe(2);

  // 2) Apply the CRITICAL filter — only the critical card remains, URL reflects it.
  await page.getByRole('button', { name: /CRITICAL/i }).click();
  await expect(page).toHaveURL(/\?filter=CRITICAL/);
  await expect(page.locator('[data-testid="monitor-card"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="monitor-card"][data-id="p-crit"]')).toBeVisible();

  // 3) Open the critical project's detail.
  await page.locator('[data-testid="monitor-card"][data-id="p-crit"] [data-testid="card-cta"]').click();
  await page.waitForSelector('[data-testid="detail-view"]', { timeout: 10_000 });
  await expect(page).toHaveURL(/\/project\/p-crit/);

  // 4) Navigate to the Health section — the 5 dimension panels render.
  await page.locator('[data-testid="nav-item"][data-section="health"]').click();
  await page.waitForSelector('[data-testid="health-panel"]', { timeout: 10_000 });
  expect(await page.locator('[data-testid="health-panel"]').count()).toBe(5);

  // 5) Browser Back → Monitor with the CRITICAL filter preserved (no full reload).
  await page.goBack();
  await page.waitForSelector('[data-testid="monitor-card"]', { timeout: 10_000 });
  await expect(page).toHaveURL(/\?filter=CRITICAL/);
  await expect(page.locator('[data-testid="monitor-card"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="monitor-card"][data-id="p-crit"]')).toBeVisible();
});
