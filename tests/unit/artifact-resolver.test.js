/**
 * Tests: collector/aitri-reader — resolveArtifact + LEGACY_ALIASES
 * Covers: TC-041e, TC-041f (TC-041h is integration-level, see fallback tests)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveArtifact, LEGACY_ALIASES } from '../../lib/collector/aitri-reader.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-hub-resolver-'));
}

describe('TC-041e: resolveArtifact — both names present → new name wins', () => {
  let dir;
  before(() => {
    dir = tmpDir();
    fs.writeFileSync(path.join(dir, '04_BUILD_REPORT.json'), '{"files":["new.js"]}');
    fs.writeFileSync(path.join(dir, '04_IMPLEMENTATION_MANIFEST.json'), '{"files":["old.js"]}');
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('resolves to the canonical (new) name and its content', () => {
    const p = resolveArtifact(dir, '04_BUILD_REPORT.json');
    assert.ok(p.endsWith('04_BUILD_REPORT.json'));
    assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).files[0], 'new.js');
  });
  it('legacy-only dir resolves through the alias', () => {
    const legacyDir = tmpDir();
    fs.writeFileSync(path.join(legacyDir, '05_PROOF_OF_COMPLIANCE.json'), '{"requirement_compliance":[]}');
    const p = resolveArtifact(legacyDir, '05_TRACEABILITY.json');
    assert.ok(p.endsWith('05_PROOF_OF_COMPLIANCE.json'));
    fs.rmSync(legacyDir, { recursive: true, force: true });
  });
  it('alias table covers exactly the two rc.41 renames', () => {
    assert.deepEqual(Object.keys(LEGACY_ALIASES).sort(), [
      '04_BUILD_REPORT.json',
      '05_TRACEABILITY.json',
    ]);
  });
});

describe('TC-041f: resolveArtifact — neither name present degrades as today', () => {
  it('returns the canonical path (missing) so callers keep their degradation path', () => {
    const dir = tmpDir();
    const p = resolveArtifact(dir, '05_TRACEABILITY.json');
    assert.ok(p.endsWith('05_TRACEABILITY.json'));
    assert.equal(fs.existsSync(p), false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
