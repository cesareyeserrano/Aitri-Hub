/**
 * Tests: Epic 4 — QA security controls (NFR-010).
 * Covers: TC-NFR-010f (non-loopback rejected), TC-LOOP-010h (::1 allowed),
 *         TC-NFR-010e (evidence ref traversal rejected),
 *         TC-EVID-021f (magic-byte spoof rejected),
 *         TC-EVID-022f (client filename ignored; server-generated name),
 *         TC-SEC-021f (oversized/disallowed evidence rejected),
 *         TC-SVG-021f (SVG script sanitised).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isLoopbackAddr } from '../../lib/commands/loopback.js';
import { validateEvidence, sanitizeSvg, MAX_EVIDENCE_BYTES } from '../../lib/store/evidence.js';
import { writeEvidence, resolveEvidence } from '../../lib/store/qa.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let hub;
before(() => {
  hub = fs.mkdtempSync(path.join(os.tmpdir(), 'aitri-qa-sec-'));
  process.env.AITRI_HUB_DIR = hub;
});
after(() => { fs.rmSync(hub, { recursive: true, force: true }); });

describe('NFR-010 — loopback trust boundary', () => {
  it('TC-NFR-010f: a non-loopback peer is not trusted', () => {
    // @aitri-tc TC-NFR-010f
    assert.equal(isLoopbackAddr('203.0.113.5'), false);
    assert.equal(isLoopbackAddr('10.0.0.2'), false);
    assert.equal(isLoopbackAddr(undefined), false);
  });
  it('TC-LOOP-010h: IPv6 loopback (::1) and IPv4-mapped are trusted', () => {
    // @aitri-tc TC-LOOP-010h
    assert.equal(isLoopbackAddr('::1'), true);
    assert.equal(isLoopbackAddr('127.0.0.1'), true);
    assert.equal(isLoopbackAddr('::ffff:127.0.0.1'), true);
  });
});

describe('NFR-010 — evidence validation + confinement', () => {
  it('TC-EVID-021f: a magic-byte spoof (png MIME, non-png bytes) is rejected', () => {
    // @aitri-tc TC-EVID-021f
    const v = validateEvidence({ mime: 'image/png', base64: Buffer.from('not a png at all').toString('base64') });
    assert.equal(v.ok, false);
    assert.equal(v.code, 415);
  });

  it('TC-SEC-021f: a disallowed type and an oversized payload are rejected before persistence', () => {
    // @aitri-tc TC-SEC-021f
    const bad = validateEvidence({ mime: 'application/pdf', base64: PNG.toString('base64') });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, 415);
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_EVIDENCE_BYTES + 1)]);
    const big = validateEvidence({ mime: 'image/png', base64: huge.toString('base64') });
    assert.equal(big.ok, false);
    assert.equal(big.code, 413);
  });

  it('TC-SVG-021f: SVG evidence with an embedded script is sanitised', () => {
    // @aitri-tc TC-SVG-021f
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onload="evil()" /></svg>';
    const v = validateEvidence({ mime: 'image/svg+xml', base64: Buffer.from(svg).toString('base64') });
    assert.equal(v.ok, true);
    const out = v.buffer.toString('utf8');
    assert.ok(!/<script/i.test(out), 'script stripped');
    assert.ok(!/onload=/i.test(out), 'event handler stripped');
    // direct sanitiser check
    assert.ok(!/<script/i.test(sanitizeSvg(Buffer.from(svg)).toString('utf8')));
  });

  it('TC-EVID-022f: the stored evidence name is server-generated (client filename ignored)', () => {
    // @aitri-tc TC-EVID-022f
    const ref = writeEvidence('demo', PNG, 'png');
    assert.match(ref, /^[0-9a-f-]{36}\.png$/i);
    assert.ok(!ref.includes('/') && !ref.includes('..'));
    // a hostile ref cannot escape the evidence dir
    assert.equal(resolveEvidence('demo', '../../../../etc/passwd'), null);
    assert.equal(resolveEvidence('demo', 'sub/dir/x.png'), null);
  });

  it('TC-NFR-010e: an evidence reference escaping the allow-root is rejected', () => {
    // @aitri-tc TC-NFR-010e
    assert.equal(resolveEvidence('demo', '../evil.png'), null);
    assert.equal(resolveEvidence('demo', '/etc/passwd'), null);
    // a real stored file resolves fine
    const ref = writeEvidence('demo', PNG, 'png');
    assert.ok(resolveEvidence('demo', ref));
  });
});
