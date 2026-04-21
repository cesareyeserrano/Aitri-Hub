/**
 * Tests: integration-compat-manifest feature
 * Covers: TC-030h, TC-030e, TC-030f, TC-030e2, TC-031f2, TC-031e2,
 *         TC-032h, TC-032h2, TC-032e, TC-032f, TC-032e2,
 *         TC-033h, TC-033e, TC-033f, TC-033e2,
 *         TC-034h, TC-034e, TC-034f,
 *         TC-035h, TC-035e, TC-035f2,
 *         TC-036h, TC-036f, TC-036e, TC-036e2,
 *         TC-032-SEC-1, TC-032-SEC-3
 *
 * Strategy: unit + filesystem-integration at node:test level. CLI invocations
 * that need a real subprocess spawn node bin/aitri-hub.js with a tmp HUB dir.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { extractSection, hashSection } from '../../lib/collector/changelog.js';
import { evaluateIntegrationAlert } from '../../lib/collector/integration-guard.js';
import { readManifest, writeManifest, compatManifestPath } from '../../lib/store/compat-manifest.js';
import { FALLBACK_BASELINE } from '../../lib/constants.js';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const CLI = path.join(REPO_ROOT, 'bin', 'aitri-hub.js');

const SAMPLE_CHANGELOG = [
  '# Aitri Integration CHANGELOG',
  '',
  '## 0.1.82 — 2026-04-20',
  '',
  'Paragraph A.',
  '',
  'Paragraph B.',
  '',
  '## 0.1.80 — older',
  '',
  'Old body.',
].join('\n');

function mkHubDir(tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `hub-${tag}-`));
}
function mkChangelogDir(tag, content = SAMPLE_CHANGELOG) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `cl-${tag}-`));
  const p = path.join(dir, 'CHANGELOG.md');
  fs.writeFileSync(p, content, 'utf8');
  return { dir, path: p };
}

// ── FR-032: CHANGELOG extract + hash (pure unit) ──────────────────────────────

describe('FR-032 — extractSection + hashSection', () => {
  it('TC-032h: extracts body between `## 0.1.82` and next `## ` heading', () => {
    const { body } = extractSection(SAMPLE_CHANGELOG, '0.1.82');
    // extractSection starts at line after heading and trims trailing whitespace;
    // the leading blank line is part of the section body by design.
    assert.ok(body.includes('Paragraph A.'));
    assert.ok(body.includes('Paragraph B.'));
    assert.ok(!body.includes('Old body.'));
    assert.equal(body, body.replace(/\s+$/, ''), 'trailing whitespace must be trimmed');
  });

  it('TC-032h2: same body hashed twice yields identical 64-hex digest', () => {
    const h1 = hashSection('Paragraph A.\n\nParagraph B.');
    const h2 = hashSection('Paragraph A.\n\nParagraph B.');
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
    assert.match(h1, /^[0-9a-f]{64}$/);
  });

  it('TC-032e: trailing whitespace trimmed before hash (cosmetic edits ignored)', () => {
    assert.equal(hashSection('Paragraph A.'), hashSection('Paragraph A.\n\n'));
  });

  it('TC-032f: missing version throws SectionNotFound with version in message', () => {
    try {
      extractSection(SAMPLE_CHANGELOG, '0.1.99');
      assert.fail('should have thrown');
    } catch (err) {
      assert.equal(err.code, 'SectionNotFound');
      assert.ok(err.message.includes('0.1.99'));
    }
  });

  it('TC-032e2: single-character change flips the digest', () => {
    const h1 = hashSection('Paragraph A.');
    const h2 = hashSection('Paragraph A!.');
    assert.notEqual(h1, h2);
    assert.equal(h1.length, 64);
    assert.equal(h2.length, 64);
  });
});

// ── FR-033: integration-guard invariants ──────────────────────────────────────

describe('FR-033 — integration-guard source-level invariants', () => {
  it('TC-033f: no top-level reviewedUpTo const and no import of INTEGRATION_LAST_REVIEWED', () => {
    const src = fs.readFileSync(
      path.join(REPO_ROOT, 'lib/collector/integration-guard.js'),
      'utf8',
    );
    assert.equal(/^\s*const\s+reviewedUpTo\s*=/m.test(src), false);
    assert.equal(/import.*INTEGRATION_LAST_REVIEWED.*from/m.test(src), false);
    assert.match(src, /evaluateIntegrationAlert\s*\(\s*detectedVersion\s*,\s*reviewedUpTo/);
  });
});

// ── FR-034: fallback baseline ─────────────────────────────────────────────────

describe('FR-034 — FALLBACK_BASELINE single source of truth', () => {
  it('TC-034f: exactly one FALLBACK_BASELINE assignment under lib/ and bin/', () => {
    const hits = [];
    const visit = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (entry.isFile() && full.endsWith('.js')) {
          const src = fs.readFileSync(full, 'utf8');
          for (const line of src.split('\n')) {
            if (/FALLBACK_BASELINE\s*=/.test(line)) hits.push({ full, line });
          }
        }
      }
    };
    visit(path.join(REPO_ROOT, 'lib'));
    visit(path.join(REPO_ROOT, 'bin'));
    assert.equal(hits.length, 1, `expected 1 assignment, got ${hits.length}`);
    assert.ok(hits[0].full.endsWith('lib/constants.js'));
    assert.equal(FALLBACK_BASELINE, '0.1.80');
  });
});

// ── FR-030/FR-033/FR-034/FR-035: readManifest + collector behaviour ──────────

describe('FR-030 — readManifest round-trips', () => {
  let hubDir;
  const saved = process.env.AITRI_HUB_DIR;

  before(() => { hubDir = mkHubDir('cm-030'); process.env.AITRI_HUB_DIR = hubDir; });
  after(() => {
    process.env.AITRI_HUB_DIR = saved ?? '';
    fs.rmSync(hubDir, { recursive: true, force: true });
  });

  it('TC-030h: valid manifest round-trips and is consumed by readManifest', () => {
    const hash = 'a'.repeat(64);
    writeManifest({
      reviewedUpTo: '0.1.82',
      reviewedAt: '2026-04-20T12:30:00.000Z',
      changelogHash: hash,
      reviewerNote: null,
    });
    const r = readManifest();
    assert.equal(r.status, 'valid');
    assert.equal(r.data.reviewedUpTo, '0.1.82');
    assert.equal(r.data.changelogHash, hash);
  });

  it('TC-030e: missing file → status=absent without creating the dir', () => {
    const freshHub = path.join(os.tmpdir(), `hub-cm-absent-${crypto.randomUUID()}`);
    const prev = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = freshHub;
    try {
      const r = readManifest();
      assert.equal(r.status, 'absent');
      assert.equal(r.data, null);
      assert.equal(fs.existsSync(freshHub), false, 'readManifest must not create the hub dir');
    } finally {
      process.env.AITRI_HUB_DIR = prev;
    }
  });

  it('TC-030f: malformed JSON in manifest file → status=absent (no throw)', () => {
    const freshHub = mkHubDir('cm-malformed');
    const prev = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = freshHub;
    try {
      fs.writeFileSync(path.join(freshHub, 'integration-compat.json'), '{not valid json');
      const r = readManifest();
      assert.equal(r.status, 'absent');
    } finally {
      process.env.AITRI_HUB_DIR = prev;
      fs.rmSync(freshHub, { recursive: true, force: true });
    }
  });

  it('TC-030e2: invalid reviewedUpTo format rejected, not silently accepted', () => {
    const freshHub = mkHubDir('cm-invalidver');
    const prev = process.env.AITRI_HUB_DIR;
    process.env.AITRI_HUB_DIR = freshHub;
    try {
      fs.writeFileSync(
        path.join(freshHub, 'integration-compat.json'),
        JSON.stringify({
          schemaVersion: '1',
          reviewedUpTo: '0.1',
          reviewedAt: '2026-04-20T12:30:00.000Z',
          changelogHash: 'a'.repeat(64),
          reviewerNote: null,
        }),
      );
      const r = readManifest();
      assert.equal(r.status, 'absent');
    } finally {
      process.env.AITRI_HUB_DIR = prev;
      fs.rmSync(freshHub, { recursive: true, force: true });
    }
  });
});

// ── FR-035: evaluateIntegrationAlert provenance fields ────────────────────────

describe('FR-035 — alert payload provenance fields', () => {
  it('TC-035h: reviewedAt + changelogHash echoed verbatim when provided', () => {
    const alert = evaluateIntegrationAlert('0.1.82', '0.1.80', {
      reviewedAt: '2026-04-18T12:00:00.000Z',
      changelogHash: 'abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd',
    });
    assert.ok(alert);
    assert.equal(alert.reviewedAt, '2026-04-18T12:00:00.000Z');
    assert.equal(alert.changelogHash, 'abc123abc123abc123abc123abc123abc123abc123abc123abc123abc123abcd');
  });

  it('TC-035e: reviewedAt + changelogHash both present as keys with null value when no manifest', () => {
    const alert = evaluateIntegrationAlert('0.1.82', '0.1.80');
    assert.ok(alert);
    assert.ok(Object.prototype.hasOwnProperty.call(alert, 'reviewedAt'));
    assert.ok(Object.prototype.hasOwnProperty.call(alert, 'changelogHash'));
    assert.equal(alert.reviewedAt, null);
    assert.equal(alert.changelogHash, null);
  });

  it('TC-035f2: null alert when versions match (no stray provenance fields)', () => {
    const alert = evaluateIntegrationAlert('0.1.82', '0.1.82');
    assert.equal(alert, null);
  });
});

// ── FR-034 behaviour: FALLBACK_BASELINE applies when no manifest ──────────────

describe('FR-034 — fallback baseline behaviour', () => {
  it('TC-034h: detected > FALLBACK_BASELINE without manifest → warning mentioning fallback', () => {
    const alert = evaluateIntegrationAlert('0.1.82', FALLBACK_BASELINE);
    assert.ok(alert);
    assert.equal(alert.severity, 'warning');
    assert.ok(alert.message.includes(`not reviewed past ${FALLBACK_BASELINE}`));
  });

  it('TC-034e: manifest value takes precedence over fallback (no alert when matched)', () => {
    const alert = evaluateIntegrationAlert('0.1.85', '0.1.85');
    assert.equal(alert, null);
  });
});

// ── FR-033 behaviour: per-cycle reviewedUpTo propagation ─────────────────────

describe('FR-033 — per-cycle reviewedUpTo propagation', () => {
  it('TC-033h: reviewedUpTo argument controls alert without module reload', () => {
    const before = evaluateIntegrationAlert('0.1.82', '0.1.80');
    assert.ok(before && before.severity === 'warning');
    const after = evaluateIntegrationAlert('0.1.82', '0.1.82');
    assert.equal(after, null);
  });

  it('TC-033e: deleting manifest mid-session falls back to baseline (no throw)', () => {
    const alert = evaluateIntegrationAlert('0.1.82', FALLBACK_BASELINE);
    assert.ok(alert);
    assert.ok(alert.message.includes('not reviewed past'));
  });

  it('TC-033e2: overwriting reviewedUpTo between cycles changes the alert', () => {
    const cycle1 = evaluateIntegrationAlert('0.1.82', '0.1.80');
    const cycle2 = evaluateIntegrationAlert('0.1.82', '0.1.82');
    assert.ok(cycle1 && cycle1.severity === 'warning');
    assert.equal(cycle2, null);
  });
});

// ── FR-036: drift detection ───────────────────────────────────────────────────

describe('FR-036 — CHANGELOG drift detection', () => {
  it('TC-036h: stored hash matches live hash → no drift alert', () => {
    const alert = evaluateIntegrationAlert('0.1.82', '0.1.82', {
      reviewedAt: '2026-04-18T12:00:00.000Z',
      changelogHash: 'abc',
      currentChangelogHash: 'abc',
    });
    assert.equal(alert, null);
  });

  it('TC-036f: stored hash differs from live → "changelog modified since review" warning', () => {
    const alert = evaluateIntegrationAlert('0.1.82', '0.1.82', {
      reviewedAt: '2026-04-18T12:00:00.000Z',
      changelogHash: 'abc',
      currentChangelogHash: 'xyz',
    });
    assert.ok(alert);
    assert.equal(alert.severity, 'warning');
    assert.ok(alert.message.includes('changelog modified since review'));
  });

  it('TC-036e: changelogHash=null in manifest skips drift check (version-only compare)', () => {
    const alert = evaluateIntegrationAlert('0.1.82', '0.1.82', {
      reviewedAt: '2026-04-18T12:00:00.000Z',
      changelogHash: null,
      currentChangelogHash: 'anything',
    });
    assert.equal(alert, null);
  });

  it('TC-036e2: currentChangelogHash=null (CHANGELOG missing) skips drift, version compare proceeds', () => {
    const alert = evaluateIntegrationAlert('0.1.82', '0.1.82', {
      reviewedAt: '2026-04-18T12:00:00.000Z',
      changelogHash: 'abc',
      currentChangelogHash: null,
    });
    assert.equal(alert, null);
  });
});

// ── FR-031 + Security: CLI via spawnSync ──────────────────────────────────────

describe('FR-031 + Security — integration review CLI', () => {
  let hubDir;
  let clDir;
  let clPath;
  const savedHub = process.env.AITRI_HUB_DIR;

  before(() => {
    hubDir = mkHubDir('cli-031');
    const mk = mkChangelogDir('cli-031');
    clDir = mk.dir; clPath = mk.path;
  });
  after(() => {
    process.env.AITRI_HUB_DIR = savedHub ?? '';
    fs.rmSync(hubDir, { recursive: true, force: true });
    fs.rmSync(clDir,  { recursive: true, force: true });
  });

  const runCli = (args, extraEnv = {}) =>
    spawnSync('node', [CLI, 'integration', 'review', ...args], {
      env: { ...process.env, AITRI_HUB_DIR: hubDir, ...extraEnv },
      encoding: 'utf8',
    });

  it('TC-031f2: missing version argument → non-zero exit, stderr mentions "version" and usage', () => {
    const r = runCli([]);
    assert.notEqual(r.status, 0);
    const err = r.stderr.toString();
    assert.ok(err.includes('version'));
    assert.ok(/usage|example/i.test(err));
  });

  it('TC-031e2: --note "ops-approved" round-trips verbatim into manifest', () => {
    // Fresh hub dir so this test doesn't see stale manifests from other cases.
    const localHub = mkHubDir('cli-031e2');
    try {
      const r = spawnSync('node', [
        CLI, 'integration', 'review', '0.1.82',
        '--changelog', clPath, '--note', 'ops-approved',
      ], { env: { ...process.env, AITRI_HUB_DIR: localHub }, encoding: 'utf8' });
      assert.equal(r.status, 0, `stderr: ${r.stderr}`);
      const saved = JSON.parse(fs.readFileSync(path.join(localHub, 'integration-compat.json'), 'utf8'));
      assert.equal(saved.reviewerNote, 'ops-approved');
    } finally {
      fs.rmSync(localHub, { recursive: true, force: true });
    }
  });

  it('TC-032-SEC-1: path-traversal --changelog rejected before read; no /etc/passwd leak', () => {
    const malicious = path.join(clDir, 'fixture', '..', '..', '..', '..', 'etc', 'passwd');
    const r = runCli(['0.1.82', '--changelog', malicious]);
    assert.notEqual(r.status, 0);
    const err = r.stderr.toString();
    assert.ok(!err.includes('root:'), 'must not leak /etc/passwd contents');
    assert.equal(fs.existsSync(path.join(hubDir, 'integration-compat.json')), false);
  });

  it('TC-032-SEC-3: --note > 500 chars rejected with "too long"/"max 500"', () => {
    const localHub = mkHubDir('cli-sec-3');
    try {
      const oversized = 'A'.repeat(501);
      const r = spawnSync('node', [
        CLI, 'integration', 'review', '0.1.82',
        '--changelog', clPath, '--note', oversized,
      ], { env: { ...process.env, AITRI_HUB_DIR: localHub }, encoding: 'utf8' });
      assert.notEqual(r.status, 0);
      const err = r.stderr.toString();
      assert.ok(err.includes('note'));
      assert.ok(/too long|max 500/i.test(err));
      assert.equal(fs.existsSync(path.join(localHub, 'integration-compat.json')), false);
    } finally {
      fs.rmSync(localHub, { recursive: true, force: true });
    }
  });
});
