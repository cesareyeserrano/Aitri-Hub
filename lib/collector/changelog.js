/**
 * Module: collector/changelog
 * Purpose: Locate docs/integrations/CHANGELOG.md for the installed Aitri CLI,
 *          extract a versioned section by heading, and hash its body (FR-032).
 * Dependencies: node:fs, node:path, node:crypto, node:child_process, node:module
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const CHANGELOG_REL = 'docs/integrations/CHANGELOG.md';

/**
 * Create a typed error so callers can distinguish error classes.
 */
function err(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/**
 * Resolve an absolute, symlink-resolved CHANGELOG path.
 *   1. Explicit --changelog path (if provided).
 *   2. `aitri --changelog-path` output (future CLI flag; tolerated if absent).
 *   3. require.resolve('aitri/package.json') + '/docs/integrations/CHANGELOG.md'.
 *
 * The returned path is processed through fs.realpathSync so downstream reads
 * cannot be redirected via symlinks. Callers that need to guard against
 * symlink escapes must compare the returned path against their allowed roots.
 *
 * @aitri-trace FR-ID: FR-031, US-ID: US-030, AC-ID: AC-030, TC-ID: TC-031h
 *
 * @param {{ override?: string | null }} [opts]
 * @returns {string} absolute, real path to the CHANGELOG file
 * @throws Error with code 'ChangelogNotFound' when all strategies fail
 */
export function resolveChangelogPath(opts = {}) {
  const candidates = [];
  if (opts.override) candidates.push(opts.override);

  try {
    const out = execFileSync('aitri', ['--changelog-path'], {
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (out) candidates.push(out);
  } catch {
    /* flag not supported — ignore */
  }

  try {
    const require = createRequire(import.meta.url);
    const pkgPath = require.resolve('aitri/package.json');
    candidates.push(path.join(path.dirname(pkgPath), CHANGELOG_REL));
  } catch {
    /* aitri not installed locally — fall through */
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const abs = path.isAbsolute(candidate) ? candidate : path.resolve(candidate);
    if (!fs.existsSync(abs)) continue;
    try {
      return fs.realpathSync(abs);
    } catch {
      /* unreadable — try next */
    }
  }
  throw err(
    'ChangelogNotFound',
    `CHANGELOG.md not found. Tried: ${candidates.filter(Boolean).join(', ') || '(no candidates)'}`,
  );
}

/**
 * Extract the body of the section identified by a `## <version>` heading.
 * The body starts on the line after the heading and ends at the character
 * before the next `## ` heading (or EOF). Trailing whitespace is trimmed
 * from the returned body so cosmetic edits do not change the hash.
 *
 * @aitri-trace FR-ID: FR-032, US-ID: US-034, AC-ID: AC-036, TC-ID: TC-032h
 *
 * @param {string} changelog - Full CHANGELOG.md contents.
 * @param {string} version - MAJOR.MINOR.PATCH version string.
 * @returns {{ body: string }}
 * @throws Error with code 'SectionNotFound' when the version heading is absent
 */
export function extractSection(changelog, version) {
  if (typeof changelog !== 'string') throw err('InvalidArg', 'changelog must be a string');
  if (typeof version !== 'string' || !version)
    throw err('InvalidArg', 'version must be a non-empty string');

  const lines = changelog.split('\n');
  const headingRe = new RegExp(`^##\\s+v?${version.replace(/\./g, '\\.')}(?:\\s|$)`);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) {
    throw err('SectionNotFound', `CHANGELOG section for version ${version} not found`);
  }
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const body = lines.slice(start, end).join('\n').replace(/\s+$/, '');
  return { body };
}

/**
 * Compute SHA-256 over the trimmed section body.
 * Trailing whitespace is stripped before hashing so a cosmetic blank line
 * does not change the digest (FR-032 AC-5).
 *
 * @aitri-trace FR-ID: FR-032, US-ID: US-034, AC-ID: AC-037, TC-ID: TC-032h2
 *
 * @param {string} body
 * @returns {string} 64-char lowercase hex SHA-256
 */
export function hashSection(body) {
  if (typeof body !== 'string') throw err('InvalidArg', 'body must be a string');
  const trimmed = body.replace(/\s+$/, '');
  return crypto.createHash('sha256').update(trimmed, 'utf8').digest('hex');
}

/**
 * Convenience: resolve + read + extract + hash in one call.
 * Used by both the review command (FR-031) and the drift check (FR-036).
 *
 * @param {string} version
 * @param {{ override?: string | null }} [opts]
 * @returns {{ path: string, body: string, hash: string }}
 */
export function readAndHashSection(version, opts = {}) {
  const filePath = resolveChangelogPath(opts);
  const raw = fs.readFileSync(filePath, 'utf8');
  const { body } = extractSection(raw, version);
  return { path: filePath, body, hash: hashSection(body) };
}
