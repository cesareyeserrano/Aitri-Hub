import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { readBugsSummary } from '../../lib/collector/bugs-reader.js';
import { projectFromSnapshot } from '../../lib/collector/snapshot-reader.js';

function withTempProject(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-bug-summary-e2e-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('TC-E2E-001h Collector-facing snapshot projection produces dashboard-ready summary', async () => {
  // @aitri-tc TC-E2E-001h
  const project = projectFromSnapshot({
    snapshotVersion: 1,
    project: 'AITRI-HUB',
    phases: [],
    bugs: {
      total: 12,
      open: 0,
      blocking: 0,
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      openIds: [],
    },
  });

  expect(project.bugsSummary.total).toBe(12);
  expect(project.bugsSummary.resolved).toBe(12);
  expect(project.bugsSummary.open).toBe(0);
});

test('TC-E2E-005h Legacy fallback flow BUGS json summary remains available', async () => {
  // @aitri-tc TC-E2E-005h
  withTempProject(dir => {
    fs.writeFileSync(
      path.join(dir, 'BUGS.json'),
      JSON.stringify({ bugs: [{ id: 'BG-LEGACY', status: 'open', severity: 'high' }] })
    );

    const summary = readBugsSummary(dir, '');
    expect(summary.open).toBe(1);
    expect(summary.high).toBe(1);
    expect(summary.openIds).toEqual(['BG-LEGACY']);
  });
});
