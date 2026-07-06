/**
 * Tests: NFR-040 — snapshot-first collection is never demoted (FR-017 semantics)
 * Covers: TC-140h, TC-140f
 *
 * A stub `aitri` binary is prepended to PATH. The on-disk artifacts deliberately
 * DISAGREE with the stub snapshot, so "which source won" is observable from the
 * record — no reader instrumentation needed.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectOne } from '../../lib/collector/index.js';

let workDir;
let binDir;
let projectDir;
let savedPath;
let savedHub;

const STUB_SNAPSHOT = {
  snapshotVersion: 1,
  project: 'from-snapshot',
  aitriVersion: '2.0.0-rc.159',
  phases: [
    { key: 1, status: 'approved' },
    { key: 2, status: 'approved' },
    {
      key: 'verify',
      status: 'passed',
      verifySummary: { passed: 9, failed: 0, skipped: 0, total: 9 },
      resultsBinding: 'bound',
    },
  ],
  compliance: { overall_status: 'compliant', levels: { production_ready: 2 }, total: 2 },
  bugs: { total: 0, open: 0, parseErrors: [] },
};

function writeStub(mode) {
  // mode 'ok' → emits the snapshot; mode 'fail' → exits 1.
  const body =
    mode === 'ok'
      ? `#!/bin/sh
if [ "$1" = "status" ] && [ "$2" = "--json" ]; then
  cat <<'JSON'
${JSON.stringify(STUB_SNAPSHOT)}
JSON
  exit 0
fi
if [ "$1" = "--version" ]; then echo "Aitri v2.0.0-rc.159"; exit 0; fi
exit 0
`
      : `#!/bin/sh
if [ "$1" = "--version" ]; then echo "Aitri v2.0.0-rc.159"; exit 0; fi
exit 1
`;
  fs.writeFileSync(path.join(binDir, 'aitri'), body, { mode: 0o755 });
}

before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-first-'));
  binDir = path.join(workDir, 'bin');
  projectDir = path.join(workDir, 'proj');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'spec'), { recursive: true });

  // On-disk state DISAGREES with the stub snapshot on purpose.
  fs.writeFileSync(
    path.join(projectDir, '.aitri'),
    JSON.stringify({
      projectName: 'from-disk',
      currentPhase: 1,
      approvedPhases: [1],
      artifactsDir: 'spec',
      aitriVersion: '2.0.0-rc.159', // eligible
    }),
  );
  fs.writeFileSync(
    path.join(projectDir, 'spec', '05_TRACEABILITY.json'),
    JSON.stringify({
      overall_status: 'draft',
      requirement_compliance: [{ requirement_id: 'FR-001', level: 'partial' }],
    }),
  );

  savedPath = process.env.PATH;
  savedHub = process.env.AITRI_HUB_DIR;
  process.env.PATH = `${binDir}${path.delimiter}${savedPath}`;
  process.env.AITRI_HUB_DIR = path.join(workDir, 'hubhome');
});

after(() => {
  process.env.PATH = savedPath;
  if (savedHub === undefined) delete process.env.AITRI_HUB_DIR;
  else process.env.AITRI_HUB_DIR = savedHub;
  fs.rmSync(workDir, { recursive: true, force: true });
});

const project = () => ({
  id: 'p-first',
  name: 'registered-name',
  type: 'local',
  location: projectDir,
});

describe('TC-140h: eligible project collected via snapshot only', () => {
  it('record reflects the stub snapshot, not the disagreeing disk artifacts', async () => {
    writeStub('ok');
    const record = await collectOne(project());
    assert.equal(record.name, 'from-snapshot', 'projectName must come from the snapshot');
    assert.equal(record.degradationReason, null);
    assert.equal(record.complianceSummary.overallStatus, 'compliant', 'NOT the on-disk draft');
    assert.equal(record.resultsBinding, 'bound', 'binding state carried (additive)');
    assert.equal(
      record.alerts.find(a => a.type === 'results-unbound'),
      undefined,
      "'bound' must not raise the RESULTS_UNBOUND warning",
    );
    assert.deepEqual(record.aitriState.approvedPhases, [1, 2]);
  });
});

describe('TC-140f: snapshot failure degrades visibly; fallback fills in', () => {
  it('degradation marker present AND fallback data populates the record', async () => {
    writeStub('fail');
    const record = await collectOne(project());
    assert.ok(record.degradationReason, 'degradation must be visible');
    assert.equal(record.name, 'from-disk', 'fallback (FR-017) fills pipeline state from disk');
    assert.equal(record.complianceSummary.overallStatus, 'draft', 'fallback compliance from disk');
  });
});
