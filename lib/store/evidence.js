/**
 * Module: store/evidence
 * Purpose: Validate manual-test evidence uploads before persistence (NFR-010):
 *          type allow-list (PNG/JPG/GIF/WebP/SVG), size cap (≤5 MB decoded),
 *          magic-byte verification (a spoofed MIME/extension is rejected), and SVG
 *          sanitisation (script/handlers stripped) so stored SVG can never execute.
 * Dependencies: none (Node built-ins only).
 *
 * @aitri-trace FR-ID: FR-021, US-ID: US-021, AC-ID: AC-021-5, TC-ID: TC-EVID-021f, TC-SVG-021f, TC-SEC-021f
 */

/** Max decoded evidence size (NFR-010). */
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

/** Accepted MIME → canonical extension. */
const MIME_EXT = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
});

/** Verify the buffer's leading bytes actually match the claimed image type. */
function magicMatches(mime, buf) {
  if (buf.length < 4) return false;
  switch (mime) {
    case 'image/png':
      return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/gif':
      return buf.slice(0, 4).toString('latin1') === 'GIF8';
    case 'image/webp':
      return buf.slice(0, 4).toString('latin1') === 'RIFF' &&
             buf.length >= 12 && buf.slice(8, 12).toString('latin1') === 'WEBP';
    case 'image/svg+xml': {
      const head = buf.slice(0, 512).toString('utf8').trimStart().toLowerCase();
      return head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!doctype svg');
    }
    default:
      return false;
  }
}

/**
 * Strip active content from an SVG so it can never execute inline (NFR-010):
 * <script> blocks, on*= event handlers, and javascript: URIs.
 * @param {Buffer} buf
 * @returns {Buffer}
 */
export function sanitizeSvg(buf) {
  let s = buf.toString('utf8');
  s = s.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  s = s.replace(/<script[^>]*\/>/gi, '');
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  s = s.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
  s = s.replace(/(href|xlink:href)\s*=\s*("|')?\s*javascript:[^"'>\s]*("|')?/gi, '');
  return Buffer.from(s, 'utf8');
}

/**
 * Validate + normalise an evidence attachment.
 * @param {{ mime?:string, base64?:string }} evidence
 * @returns {{ ok:true, ext:string, buffer:Buffer } | { ok:false, code:number, error:string }}
 */
export function validateEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') {
    return { ok: false, code: 400, error: 'evidence must be an object' };
  }
  const mime = String(evidence.mime ?? '').toLowerCase();
  const ext = MIME_EXT[mime];
  if (!ext) {
    return { ok: false, code: 415, error: 'unsupported evidence type — allowed: PNG/JPG/GIF/WebP/SVG' };
  }
  if (typeof evidence.base64 !== 'string' || evidence.base64 === '') {
    return { ok: false, code: 400, error: 'evidence.base64 required' };
  }
  let buffer;
  try {
    buffer = Buffer.from(evidence.base64, 'base64');
  } catch {
    return { ok: false, code: 400, error: 'evidence.base64 is not valid base64' };
  }
  if (buffer.length === 0) {
    return { ok: false, code: 400, error: 'evidence is empty' };
  }
  if (buffer.length > MAX_EVIDENCE_BYTES) {
    return { ok: false, code: 413, error: 'evidence exceeds 5MB' };
  }
  if (!magicMatches(mime, buffer)) {
    return { ok: false, code: 415, error: 'evidence content does not match its declared type' };
  }
  if (mime === 'image/svg+xml') buffer = sanitizeSvg(buffer);
  return { ok: true, ext, buffer };
}
