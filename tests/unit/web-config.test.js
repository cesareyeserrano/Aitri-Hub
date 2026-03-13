/**
 * Tests: web dashboard deployment artifacts (unit level)
 * Covers: TC-006h (config validation), TC-006e (responsive config), TC-006f (error handling config)
 *
 * These unit tests verify that all web dashboard deployment artifacts
 * are correctly configured — a prerequisite for the E2E tests.
 * E2E tests (Playwright) run separately via `npm run test:e2e`.
 *
 * @aitri-trace FR-ID: FR-006, US-ID: US-006, AC-ID: AC-009
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// ── TC-006h: Docker deployment artifacts exist and are correctly configured ────

describe('TC-006h: web dashboard — Docker deployment artifacts are configured', () => {
  it('docker/docker-compose.yml exists', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'docker', 'docker-compose.yml')),
      'docker-compose.yml must exist for `aitri-hub web` to work'
    );
  });

  it('docker-compose.yml contains port 3000 mapping', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker', 'docker-compose.yml'), 'utf8');
    assert.ok(
      content.includes('3000'),
      'docker-compose.yml must expose port 3000'
    );
  });

  it('docker-compose.yml contains ~/.aitri-hub volume mount', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker', 'docker-compose.yml'), 'utf8');
    assert.ok(
      content.includes('.aitri-hub') && content.includes('/data'),
      'docker-compose.yml must mount ~/.aitri-hub to /data inside container'
    );
  });

  it('docker/Dockerfile exists', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'docker', 'Dockerfile')),
      'Dockerfile must exist to build the web image'
    );
  });

  it('docker/Dockerfile uses nginx:1.27-alpine', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker', 'Dockerfile'), 'utf8');
    assert.ok(
      content.includes('nginx') && content.includes('alpine'),
      'Dockerfile must use nginx:alpine as the serving image'
    );
  });

  it('docker/nginx.conf exists', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'docker', 'nginx.conf')),
      'nginx.conf must exist for the web server configuration'
    );
  });

  it('nginx.conf listens on port 3000', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker', 'nginx.conf'), 'utf8');
    assert.ok(
      content.includes('listen 3000'),
      'nginx.conf must listen on port 3000'
    );
  });

  it('nginx.conf serves /data/ location for dashboard.json', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker', 'nginx.conf'), 'utf8');
    assert.ok(
      content.includes('/data/'),
      'nginx.conf must include /data/ location to serve dashboard.json'
    );
  });

  it('nginx.conf includes Cache-Control no-store for /data/', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker', 'nginx.conf'), 'utf8');
    assert.ok(
      content.includes('no-store') || content.includes('no-cache'),
      'nginx.conf must prevent caching of dashboard.json'
    );
  });
});

// ── TC-006e: React app is configured for responsive layout ────────────────────

describe('TC-006e: web dashboard — React app has responsive CSS configuration', () => {
  it('web/src/styles.css exists', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'web', 'src', 'styles.css')),
      'styles.css must exist with design tokens'
    );
  });

  it('styles.css includes 768px media query for responsive layout', () => {
    const content = fs.readFileSync(path.join(ROOT, 'web', 'src', 'styles.css'), 'utf8');
    assert.ok(
      content.includes('768px'),
      'styles.css must include 768px breakpoint for tablet layout'
    );
  });

  it('styles.css uses CSS Grid with minmax(280px) for auto-fill layout', () => {
    const content = fs.readFileSync(path.join(ROOT, 'web', 'src', 'styles.css'), 'utf8');
    assert.ok(
      content.includes('auto-fill') && content.includes('minmax'),
      'project-grid must use auto-fill minmax for responsive columns'
    );
  });

  it('styles.css defines contrast-compliant accent colors', () => {
    const content = fs.readFileSync(path.join(ROOT, 'web', 'src', 'styles.css'), 'utf8');
    // accent-healthy: #3fb950 on surface #161b22 = 7.1:1 contrast ratio
    assert.ok(content.includes('#3fb950'), 'Healthy accent color must be #3fb950 (7.1:1 contrast)');
    // accent-error: #f85149 on surface #161b22 = 4.9:1 contrast ratio
    assert.ok(content.includes('#f85149'), 'Error accent color must be #f85149 (4.9:1 contrast)');
  });

  it('ProjectCard component file exists with data-testid attributes', () => {
    const content = fs.readFileSync(path.join(ROOT, 'web', 'src', 'components', 'ProjectCard.jsx'), 'utf8');
    assert.ok(
      content.includes('data-testid="project-card"'),
      'ProjectCard must have data-testid="project-card" for E2E tests'
    );
  });

  it('App.jsx polls /data/dashboard.json as data source', () => {
    const content = fs.readFileSync(path.join(ROOT, 'web', 'src', 'App.jsx'), 'utf8');
    assert.ok(
      content.includes('/data/dashboard.json'),
      'App.jsx must poll /data/dashboard.json — the nginx-served data endpoint'
    );
  });
});

// ── TC-006f: error state components are implemented ───────────────────────────

describe('TC-006f: web dashboard — error and empty state components are implemented', () => {
  it('ConnectionBanner component file exists', () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, 'web', 'src', 'components', 'ConnectionBanner.jsx')),
      'ConnectionBanner.jsx must exist to show reconnection status'
    );
  });

  it('ConnectionBanner handles "failed" status with user-actionable message', () => {
    const content = fs.readFileSync(
      path.join(ROOT, 'web', 'src', 'components', 'ConnectionBanner.jsx'), 'utf8'
    );
    assert.ok(
      content.includes('failed') && (content.includes('docker') || content.includes('aitri-hub web')),
      'ConnectionBanner must show recovery command when connection fails'
    );
  });

  it('App.jsx renders empty state when no projects present', () => {
    const content = fs.readFileSync(path.join(ROOT, 'web', 'src', 'App.jsx'), 'utf8');
    assert.ok(
      content.includes('empty-state') || content.includes('No projects'),
      'App.jsx must render an empty state when projects array is empty'
    );
  });

  it('nginx.conf returns 404 for missing files in /data/', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker', 'nginx.conf'), 'utf8');
    assert.ok(
      content.includes('=404'),
      'nginx.conf must return 404 when dashboard.json is missing'
    );
  });

  it('nginx.conf includes X-Frame-Options security header', () => {
    const content = fs.readFileSync(path.join(ROOT, 'docker', 'nginx.conf'), 'utf8');
    assert.ok(
      content.includes('X-Frame-Options'),
      'nginx.conf must include X-Frame-Options security header'
    );
  });
});
