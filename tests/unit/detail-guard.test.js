/**
 * Tests: detail endpoints localhost-only guard (W2)
 * Covers: TC-052f
 *
 * The endpoint handler in web.js is not exported (it is a closure over the
 * server). Rather than start a real server (a loopback fetch cannot present a
 * non-loopback source address — the same limitation as TC-142f), this test
 * pins the guard PREDICATE that both admin and the detail routes apply, so a
 * refactor that weakens it fails here.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// The exact predicate used in lib/commands/web.js for both /api/projects and
// /api/project/:id/* — kept in sync by this test (a change to the guard shape
// must update this mirror, which is the point: it forces the decision to be
// deliberate).
function isLoopback(remoteAddr) {
  return remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
}

describe('TC-052f: detail endpoints reject non-loopback sources', () => {
  it('loopback forms accepted; everything else rejected → 403', () => {
    for (const ok of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) {
      assert.equal(isLoopback(ok), true, ok);
    }
    for (const bad of ['10.0.0.5', '192.168.1.20', '0.0.0.0', '::ffff:10.0.0.5', undefined, '']) {
      assert.equal(isLoopback(bad), false, String(bad));
    }
  });
  it('the guard mirror matches the source in web.js (drift check)', () => {
    const src = readWebSource();
    // The literal set must appear in web.js for the detail-route guard.
    assert.match(src, /remoteAddr !== '127\.0\.0\.1' && remoteAddr !== '::1' && remoteAddr !== '::ffff:127\.0\.0\.1'/);
    // And it must be applied inside the detail-route branch.
    assert.match(src, /detailMatch[\s\S]{0,400}remoteAddr/);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
function readWebSource() {
  const p = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'lib', 'commands', 'web.js');
  return fs.readFileSync(p, 'utf8');
}
