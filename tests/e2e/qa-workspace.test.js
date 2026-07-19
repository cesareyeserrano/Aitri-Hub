/**
 * Tests: QA Workspace navigation + tabs (browser page tests)
 * Covers: TC-050h, TC-050e, TC-050f, TC-051h, TC-051e, TC-053h, TC-055h,
 *         TC-056h, TC-057f, TC-058f, TC-059e
 *
 * Strategy mirrors snapshot-card.test.js: page.route stubs dashboard.json AND
 * the on-demand /api/project/:id endpoints, so the tests are hermetic and
 * exercise the SPA wiring without file-system state.
 */

import { test, expect } from '@playwright/test';

// SUPERSEDED by the v0.3.0 Project Detail redesign (FR-012): the tab-based DetailView
// (verdict chip, scope-selector, detail-degradation banner, Summary/Traceability tabs)
// was replaced by the single-page fixed-sidebar shell (Overview/Health/Artifacts/
// Sessions/Alerts + QA sections). These assertions target the retired tab UI, so they
// are skipped rather than deleted (kept for history). The redesigned detail + QA
// workspace are covered by tests/e2e/{dev-triage,qa-execution}.test.js and the
// web/src/__tests__/{detailNav,qa,artifacts}.test.jsx suites. Retire when the old
// tab components are removed.
test.beforeEach(() => {
  test.skip(true, 'Superseded by the v0.3.0 Project Detail redesign (FR-012) — see dev-triage.test.js + qa-execution.test.js');
});

const BASE = `http://localhost:${process.env.AITRI_HUB_PORT ?? 3099}`;

function card(overrides = {}) {
  return {
    id: 'demo',
    name: 'demo-project',
    type: 'local',
    status: 'healthy',
    aitriState: { approvedPhases: [1, 2, 3], completedPhases: [1, 2, 3], driftPhases: [], aitriVersion: '2.0.0-rc.159' },
    testSummary: { available: true, passed: 3, total: 3 },
    alerts: [],
    nextActions: [],
    ...overrides,
  };
}

function detailPayload(overrides = {}) {
  return {
    detailVersion: 1,
    project: { id: 'demo', name: 'demo-project', type: 'local', aitriVersion: '2.0.0-rc.159', artifactsDir: 'spec', status: 'healthy', healthScore: null },
    scopes: ['product', 'f1'],
    scope: 'product',
    testCases: {
      available: true, resultsPresent: true,
      summary: { passed: 2, failed: 1, pending: 1, skipped: 0, manual: 1 },
      cases: [
        { id: 'TC-1h', title: 'happy', automation: 'auto', scenario: 'happy_path', status: 'passed', requirement_id: 'FR-1' },
        { id: 'TC-2f', title: 'neg', automation: 'auto', scenario: 'negative', status: 'failed', requirement_id: 'FR-1' },
        { id: 'TC-3m', title: 'man', automation: 'manual', manual_reason: 'device', scenario: 'edge_case', status: 'pending', requirement_id: 'FR-2' },
      ],
    },
    traceability: {
      available: true, derivedByHub: false, auditFreshness: 'fresh', coverageMap: null,
      frs: [
        { id: 'FR-1', title: 'covered', priority: 'MUST', covered: true, tcs: [{ id: 'TC-1h', status: 'passed' }] },
        { id: 'FR-2', title: 'uncovered', priority: 'MUST', covered: false, tcs: [] },
      ],
    },
    bugs: { available: false, parseError: true },
    artifacts: {
      chain: [{ name: '02_SYSTEM_DESIGN.md', present: true, kind: 'md' }],
      contents: { '02_SYSTEM_DESIGN.md': { kind: 'md', raw: '## Design\n\n<script>window.__pwned=1</script>\n\nbody' } },
    },
    phases: { currentPhase: 4, approvedPhases: [1, 2, 3], completedPhases: [1, 2, 3], driftPhases: [] },
    features: [{ name: 'f1', currentPhase: 3, approvedPhases: [1, 2] }],
    degradation: overrides.degradation ?? null,
    ...overrides,
  };
}

async function setup(page, { cards = [card()], detail = detailPayload(), detailStatus = 200 } = {}) {
  await page.route('**/data/dashboard.json', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: cards }) }));
  await page.route('**/api/project/*/detail*', r =>
    r.fulfill({ status: detailStatus, contentType: 'application/json',
      body: JSON.stringify(detailStatus === 200 ? detail : { error: 'project_not_found' }) }));
  await page.route('**/api/project/*/validate*', r =>
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ available: true, fetchedAt: 1, report: { project: 'demo', allValid: false, deployable: false, deployableReasons: [{ type: 'fr_coverage', message: 'FR-2 refunds uncovered' }], artifacts: [] } }) }));
}

test('TC-050h: view-project button navigates to /project/:id', async ({ page }) => {
  await setup(page);
  await page.goto(BASE);
  await page.locator('[data-testid="view-project-btn"]').first().click();
  await expect(page).toHaveURL(/\/project\/demo$/);
  await expect(page.locator('[data-testid="detail-view"]')).toBeVisible();
});

test('TC-051h: header strip renders name and full-tag version', async ({ page }) => {
  await setup(page);
  await page.goto(`${BASE}/project/demo`);
  await expect(page.locator('[data-testid="detail-name"]')).toHaveText('demo-project');
  await expect(page.locator('[data-testid="detail-version"]')).toHaveText('2.0.0-rc.159');
});

test('TC-051e: verdict chip is neutral until the Summary verdict runs', async ({ page }) => {
  await setup(page);
  await page.goto(`${BASE}/project/demo`);
  // Land on a non-Summary tab: the chip must not fabricate a verdict.
  await page.locator('[data-testid="tab-btn"][data-tab="Bugs"]').click();
  await expect(page.locator('[data-testid="verdict-chip"]')).toHaveText('not checked');
});

test('TC-051f: header stays stable across tab switches (no flicker/refetch)', async ({ page }) => {
  let detailCalls = 0;
  await page.route('**/api/project/*/detail*', r => { detailCalls += 1; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detailPayload()) }); });
  await setup(page); // sets dashboard + validate routes; detail route above wins (registered first)
  await page.goto(`${BASE}/project/demo`);
  await expect(page.locator('[data-testid="detail-name"]')).toHaveText('demo-project');
  const callsAfterLoad = detailCalls;
  await page.locator('[data-testid="tab-btn"][data-tab="Bugs"]').click();
  await page.locator('[data-testid="tab-btn"][data-tab="Traceability"]').click();
  await expect(page.locator('[data-testid="detail-name"]')).toHaveText('demo-project'); // header intact
  expect(detailCalls).toBe(callsAfterLoad); // tab switches on the same scope do not refetch
});

test('TC-050e: back returns to an intact overview', async ({ page }) => {
  await setup(page);
  await page.goto(BASE);
  await page.locator('[data-testid="view-project-btn"]').first().click();
  await expect(page.locator('[data-testid="detail-view"]')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${BASE}/?$`));
  await expect(page.locator('[data-testid="project-card"]')).toBeVisible();
});

test('TC-050f: unknown project id renders not-found with a link back', async ({ page }) => {
  await setup(page, { detailStatus: 404 });
  await page.goto(`${BASE}/project/nope`);
  await expect(page.locator('[data-testid="detail-notfound"]')).toBeVisible();
  await page.locator('[data-testid="detail-back"]').click();
  await expect(page).toHaveURL(new RegExp(`${BASE}/?$`));
});

test('TC-053h: scope selector lists Product + features', async ({ page }) => {
  await setup(page);
  await page.goto(`${BASE}/project/demo`);
  await expect(page.locator('[data-testid="scope-selector"]')).toBeVisible();
  await expect(page.locator('[data-testid="scope-btn"]')).toHaveCount(2);
  await expect(page.locator('[data-testid="scope-btn"][data-scope="f1"]')).toBeVisible();
});

test('TC-055h: Test Cases tab shows counts + manual banner', async ({ page }) => {
  await setup(page);
  await page.goto(`${BASE}/project/demo`);
  await page.locator('[data-testid="tab-btn"][data-tab="Test Cases"]').click();
  await expect(page.locator('[data-testid="tc-counts"]')).toContainText('2 passed');
  await expect(page.locator('[data-testid="manual-pending-banner"]')).toContainText('TC-3m');
  await expect(page.locator('[data-testid="tc-row"]')).toHaveCount(3);
});

test('TC-055e: Test Cases filters compose', async ({ page }) => {
  await setup(page);
  await page.goto(`${BASE}/project/demo`);
  await page.locator('[data-testid="tab-btn"][data-tab="Test Cases"]').click();
  await expect(page.locator('[data-testid="tc-row"]')).toHaveCount(3);
  await page.locator('[data-testid="filter-status"]').selectOption('failed');
  const rows = page.locator('[data-testid="tc-row"]');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('TC-2f');
  await page.locator('[data-testid="filter-status"]').selectOption('all');
  await expect(page.locator('[data-testid="tc-row"]')).toHaveCount(3);
});

test('TC-058h: Artifacts render markdown formatted and PRD as a table', async ({ page }) => {
  const detail = detailPayload();
  detail.artifacts = {
    chain: [
      { name: '02_SYSTEM_DESIGN.md', present: true, kind: 'md' },
      { name: '01_REQUIREMENTS.json', present: true, kind: 'json' },
    ],
    contents: {
      '02_SYSTEM_DESIGN.md': { kind: 'md', raw: '## Design\n\n- one\n- two' },
      '01_REQUIREMENTS.json': { kind: 'json', parsed: {
        functional_requirements: [{ id: 'FR-1', title: 'do a thing', priority: 'MUST', acceptance_criteria: ['x happens'] }],
        user_personas: [{ role: 'QA', goal: 'audit' }], no_go_zone: ['no writes'],
      } },
    },
  };
  await setup(page, { detail });
  await page.goto(`${BASE}/project/demo`);
  await page.locator('[data-testid="tab-btn"][data-tab="Artifacts"]').click();
  // Default active artifact is the first present (markdown) → formatted heading + list.
  await expect(page.locator('[data-testid="artifact-content"] .md h3')).toHaveText('Design');
  await expect(page.locator('[data-testid="artifact-content"] .md-ul li')).toHaveCount(2);
  // Switch to the PRD → FR table with id/title/priority; raw collapsed.
  await page.locator('[data-testid="chain-item"]', { hasText: '01_REQUIREMENTS.json' }).click();
  await expect(page.locator('[data-testid="prd-view"]')).toContainText('FR-1');
  await expect(page.locator('[data-testid="prd-view"]')).toContainText('do a thing');
  await expect(page.locator('[data-testid="raw-json"]')).toHaveCount(0);
});

test('TC-056h: Traceability pins the uncovered MUST first', async ({ page }) => {
  await setup(page);
  await page.goto(`${BASE}/project/demo`);
  await page.locator('[data-testid="tab-btn"][data-tab="Traceability"]').click();
  const firstRow = page.locator('[data-testid="trace-row"]').first();
  await expect(firstRow).toHaveAttribute('data-uncovered', 'true');
  await expect(firstRow).toContainText('FR-2');
});

test('TC-054h: Summary verdict renders from the real validate --json shape (deployable + deployableReasons)', async ({ page }) => {
  await setup(page);
  await page.goto(`${BASE}/project/demo`);
  // Summary is the default tab; the verdict panel fetches validate on open.
  await expect(page.locator('[data-testid="verdict-report"]')).toBeVisible();
  await expect(page.locator('[data-testid="verdict-report"]')).toContainText('not deployable');
  await expect(page.locator('[data-testid="verdict-report"]')).toContainText('FR-2 refunds uncovered');
});

test('TC-054e: a deployable project with allValid:false (IDEA.md absorbed) still reads deployable', async ({ page }) => {
  await page.route('**/data/dashboard.json', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [card()] }) }));
  await page.route('**/api/project/*/detail*', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(detailPayload()) }));
  // Real validate --json shape for a COMPLETE project: allValid false (IDEA.md
  // absorbed at approve 1) but deployable TRUE. The verdict must read `deployable`.
  await page.route('**/api/project/*/validate*', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true, fetchedAt: 2, report: { project: 'demo', allValid: false, deployable: true, deployableReasons: [], artifacts: [] } }) }));
  await page.goto(`${BASE}/project/demo`);
  await expect(page.locator('[data-testid="verdict-report"]')).toContainText('deployable');
  await expect(page.locator('[data-testid="verdict-badge"], .verdict-badge')).not.toContainText('not deployable');
});

test('TC-057f: Bugs tab shows the parse-error state, never zero bugs', async ({ page }) => {
  await setup(page);
  await page.goto(`${BASE}/project/demo`);
  await page.locator('[data-testid="tab-btn"][data-tab="Bugs"]').click();
  await expect(page.locator('[data-testid="bugs-parse-error"]')).toContainText('NOT counted');
});

test('TC-058f: Artifacts markdown renders inert (no script execution)', async ({ page }) => {
  await setup(page);
  await page.goto(`${BASE}/project/demo`);
  await page.locator('[data-testid="tab-btn"][data-tab="Artifacts"]').click();
  await expect(page.locator('[data-testid="artifact-content"] .md h3')).toHaveText('Design');
  // The injected script text is inert; the global was never set.
  const pwned = await page.evaluate(() => window.__pwned);
  expect(pwned).toBeUndefined();
});

test('TC-059e: snapshot-degraded project shows the banner', async ({ page }) => {
  await setup(page, { detail: detailPayload({ degradation: { reason: 'version_too_old' } }) });
  await page.goto(`${BASE}/project/demo`);
  await expect(page.locator('[data-testid="detail-degradation"]')).toContainText('version_too_old');
});
