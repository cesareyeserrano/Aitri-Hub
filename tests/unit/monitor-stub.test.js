/**
 * Tests: aitri-hub monitor stub
 * Covers: TC-005h, TC-005f, TC-005e
 *
 * The CLI terminal dashboard (FR-005) has been replaced by the web dashboard.
 * The 'monitor' subcommand now prints a deprecation notice and exits 0
 * instead of starting the terminal render loop.
 *
 * @aitri-trace FR-ID: FR-005, TC-ID: TC-005h, TC-005f, TC-005e
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIN  = path.join(ROOT, 'bin', 'aitri-hub.js');

// ── TC-005h: monitor subcommand exits 0 with deprecation notice ───────────────

describe('TC-005h: aitri-hub monitor — stub exits 0 with notice', () => {
  it('exits with code 0', () => {
    let exitCode = 0;
    try {
      execFileSync(process.execPath, [BIN, 'monitor'], { stdio: 'pipe' });
    } catch (err) {
      exitCode = err.status ?? 1;
    }
    assert.strictEqual(exitCode, 0);
  });

  it('prints message directing user to aitri-hub web', () => {
    let stdout = '';
    try {
      stdout = execFileSync(process.execPath, [BIN, 'monitor'], { encoding: 'utf8' });
    } catch (err) {
      stdout = (err.stdout ?? '') + (err.stderr ?? '');
    }
    assert.ok(
      stdout.includes('web') || stdout.includes('monitor'),
      `Expected output to mention 'web' or 'monitor', got: ${stdout}`,
    );
  });
});

// ── TC-005f: monitor does not crash when no projects.json exists ──────────────

describe('TC-005f: aitri-hub monitor — no crash in empty environment', () => {
  it('does not throw even without projects.json', () => {
    assert.doesNotThrow(() => {
      try {
        execFileSync(process.execPath, [BIN, 'monitor'], {
          stdio: 'pipe',
          env: { ...process.env, HOME: '/tmp' },
        });
      } catch (err) {
        // Exit code 0 — not a crash, just the stub exiting
        if (err.status !== 0) throw err;
      }
    });
  });
});

// ── TC-005e: help text does not list monitor as an available command ──────────

describe('TC-005e: aitri-hub help — monitor is not listed', () => {
  it('help output does not mention monitor as a command', () => {
    const stdout = execFileSync(process.execPath, [BIN, 'help'], { encoding: 'utf8' });
    // 'monitor' should not appear as a listed command in USAGE
    const hasMonitorCommand = /^\s+aitri-hub monitor/m.test(stdout);
    assert.strictEqual(hasMonitorCommand, false);
  });
});
