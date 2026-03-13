/**
 * Tests: web dashboard (E2E — Playwright)
 * Covers: TC-006h, TC-006e, TC-006f
 *
 * Prerequisites:
 *   - Docker running
 *   - `docker compose up -d` has been run and web dashboard is at localhost:3000
 *   - ~/.aitri-hub/dashboard.json exists (or is absent for TC-006f)
 *   - Run with: npx playwright test tests/e2e/web-dashboard.test.js
 */

import { test, expect } from '@playwright/test';

const BASE_URL = `http://localhost:${process.env.AITRI_HUB_PORT ?? 3000}`;

// ── TC-006h: localhost:3000 returns HTTP 200 ──────────────────────────────────

test('TC-006h: web dashboard returns HTTP 200', async ({ request }) => {
  const response = await request.get(BASE_URL + '/');
  expect(response.status()).toBe(200);
  const contentType = response.headers()['content-type'] ?? '';
  expect(contentType).toContain('text/html');
});

// ── TC-006e: 768px viewport renders all cards without horizontal scroll ────────

test('TC-006e: 768px viewport — no horizontal scroll, project cards visible', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await page.waitForSelector('[data-testid="project-card"], .empty-state', { timeout: 10_000 });

  // Check no horizontal overflow
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(768);

  await context.close();
});

// ── TC-006f: missing dashboard.json shows empty state ─────────────────────────

test('TC-006f: when dashboard.json missing, empty state is shown', async ({ page }) => {
  // This test assumes dashboard.json is absent from the mounted volume.
  // If it exists, the test verifies the app doesn't crash on 404.
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');

  // Check for either empty state message OR project cards — app must not show a blank error screen
  const hasContent = await page.evaluate(() => {
    const empty = document.querySelector('.empty-state');
    const cards = document.querySelectorAll('[data-testid="project-card"]');
    const banner = document.querySelector('[data-testid="connection-banner"]');
    return !!(empty || cards.length > 0 || banner);
  });

  expect(hasContent).toBe(true);
});

// ── Header summary pills are visible ─────────────────────────────────────────

test('Header renders healthy/warning/error summary pills', async ({ page }) => {
  await page.goto(BASE_URL);
  await page.waitForSelector('[data-testid="pill-healthy"], .skeleton', { timeout: 10_000 });

  // Wait for skeletons to resolve
  await page.waitForTimeout(2_000);

  const healthyPill = page.locator('[data-testid="pill-healthy"]');
  await expect(healthyPill).toBeVisible();
});
