/**
 * Playwright config — Aitri Hub E2E tests
 * Starts the web server automatically before tests.
 */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list'], ['./tests/e2e/aitri-reporter.js']],

  use: {
    baseURL: 'http://localhost:3099',
  },

  webServer: {
    command: 'AITRI_HUB_PORT=3099 AITRI_HUB_DIR=/tmp/aitri-hub-e2e node bin/aitri-hub.js web',
    url: 'http://localhost:3099/health',
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },

  projects: [
    {
      name: 'api',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
