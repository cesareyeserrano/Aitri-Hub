/**
 * Tests: BG-015 — Traceability auditFreshness must not overstate 'fresh'
 *
 * Pre-rc.154 Core stamped coverageAuditLastAt WITHOUT coverageAuditReqHash;
 * with no hash the freshness is unverifiable and must read 'unknown' — the
 * old derivation fell through to 'fresh' (found in the 5-real-project reader
 * validation, HUB-READER-VALIDATION-0706).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readDetail } from '../../lib/collector/detail-reader.js';

const REQ = JSON.stringify({
  project_name: 'F',
  functional_requirements: [
    { id: 'FR-001', title: 'Login', priority: 'MUST', acceptance_criteria: ['x'] },
  ],
});

let workDir;

function seedProject(stateExtras) {
  const dir = fs.mkdtempSync(path.join(workDir, 'proj-'));
  fs.mkdirSync(path.join(dir, 'spec'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'spec', '01_REQUIREMENTS.json'), REQ);
  fs.writeFileSync(
    path.join(dir, '.aitri'),
    JSON.stringify({
      projectName: 'F',
      artifactsDir: 'spec',
      approvedPhases: [1],
      completedPhases: [1],
      ...stateExtras,
    }),
  );
  return dir;
}

function freshnessOf(dir) {
  const detail = readDetail({ id: 'p', name: 'F' }, dir, 'product', {});
  assert.equal(detail.ok, true, 'readDetail must succeed');
  return detail.payload.traceability.auditFreshness;
}

before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-freshness-'));
});

after(() => fs.rmSync(workDir, { recursive: true, force: true }));

describe('BG-015: auditFreshness derivation', () => {
  it("'unknown' when the audit ran but no hash stamp exists (pre-rc.154)", () => {
    const dir = seedProject({ coverageAuditLastAt: '2026-06-01T00:00:00.000Z' });
    assert.equal(freshnessOf(dir), 'unknown', "unverifiable must never read 'fresh'");
  });

  it("'fresh' when the stamp matches the current requirements bytes", () => {
    const hash = crypto.createHash('sha256').update(REQ).digest('hex');
    const dir = seedProject({
      coverageAuditLastAt: '2026-06-01T00:00:00.000Z',
      coverageAuditReqHash: hash,
    });
    assert.equal(freshnessOf(dir), 'fresh');
  });

  it("'stale' when the stamp differs from the current requirements bytes", () => {
    const dir = seedProject({
      coverageAuditLastAt: '2026-06-01T00:00:00.000Z',
      coverageAuditReqHash: '0'.repeat(64),
    });
    assert.equal(freshnessOf(dir), 'stale');
  });

  it("'not-run' when no audit timestamp exists at all", () => {
    const dir = seedProject({});
    assert.equal(freshnessOf(dir), 'not-run');
  });
});
