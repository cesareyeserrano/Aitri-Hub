/**
 * Module: commands/integration-review
 * Purpose: Implement `aitri-hub integration review <version>` — attest a
 *          CHANGELOG review, compute its SHA-256, and persist the manifest.
 * Dependencies: lib/store/compat-manifest, lib/collector/changelog
 */

import fs from 'node:fs';
import path from 'node:path';
import { readAndHashSection } from '../collector/changelog.js';
import { writeManifest, compatManifestPath } from '../store/compat-manifest.js';
import { ANSI } from '../constants.js';

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const MAX_NOTE_LEN = 500;

/** Exit codes (aligned with 02_SYSTEM_DESIGN.md). */
export const EXIT = Object.freeze({
  OK: 0,
  USAGE: 1,
  INVALID_VERSION: 2,
  CHANGELOG_NOT_FOUND: 3,
  SECTION_NOT_FOUND: 4,
});

function printErr(title, pairs) {
  const red = ANSI.RED; const reset = ANSI.RESET;
  process.stderr.write(`${red}✗${reset} ${title}\n`);
  for (const [key, value] of pairs) {
    process.stderr.write(`  ${key.padEnd(8)} ${value}\n`);
  }
}

function printOk(title, pairs) {
  const green = ANSI.GREEN; const reset = ANSI.RESET;
  process.stdout.write(`${green}✓${reset} ${title}\n`);
  for (const [key, value] of pairs) {
    process.stdout.write(`  ${key.padEnd(11)} ${value}\n`);
  }
}

/**
 * Parse CLI args for the review subcommand.
 * Accepts: <version> [--changelog <path>] [--note <str>]
 */
function parseArgs(rest) {
  const out = { version: null, changelog: null, note: null };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--changelog') {
      out.changelog = rest[++i] ?? null;
    } else if (arg === '--note') {
      out.note = rest[++i] ?? null;
    } else if (!out.version && !arg.startsWith('--')) {
      out.version = arg;
    }
  }
  return out;
}

/**
 * Validate that --changelog, if provided, resolves to a file whose real path
 * is still inside the user-supplied directory root (symlink-escape guard).
 *
 * @aitri-trace FR-ID: FR-032, US-ID: US-034, AC-ID: AC-036, TC-ID: TC-032-SEC-2
 */
function validateChangelogOverride(override) {
  if (!override) return null;
  const abs = path.isAbsolute(override) ? override : path.resolve(override);
  // Defer existence / realpath checks to the changelog resolver — it already
  // calls fs.realpathSync. We simply reject obviously-invalid shapes up front.
  if (abs.includes('\0')) return 'invalid: null byte in path';
  return null;
}

/**
 * Run the review command. Exits the current process with a status from EXIT.
 *
 * @aitri-trace FR-ID: FR-031, US-ID: US-030, AC-ID: AC-030, TC-ID: TC-031h
 *
 * @param {string[]} rest - argv after 'integration review'
 * @returns {Promise<number>} exit code
 */
export async function cmdIntegrationReview(rest) {
  const { version, changelog, note } = parseArgs(rest);

  if (!version) {
    printErr('missing version argument', [
      ['usage',   'aitri-hub integration review <version> [--changelog <path>] [--note <str>]'],
      ['example', 'aitri-hub integration review 0.1.82'],
    ]);
    return EXIT.USAGE;
  }
  if (!SEMVER_RE.test(version)) {
    printErr('invalid version', [
      ['value', version],
      ['hint',  'version must be MAJOR.MINOR.PATCH (e.g. 0.1.82)'],
    ]);
    return EXIT.INVALID_VERSION;
  }
  if (note !== null && note.length > MAX_NOTE_LEN) {
    printErr('note too long', [
      ['length', `${note.length} chars`],
      ['max',    `${MAX_NOTE_LEN} chars`],
      ['hint',   'shorten --note or omit it'],
    ]);
    return EXIT.USAGE;
  }
  const overrideErr = validateChangelogOverride(changelog);
  if (overrideErr) {
    printErr('invalid --changelog path', [
      ['value', String(changelog)],
      ['hint',  overrideErr],
    ]);
    return EXIT.USAGE;
  }

  let resolved;
  try {
    resolved = readAndHashSection(version, { override: changelog });
  } catch (err) {
    if (err.code === 'SectionNotFound') {
      printErr('changelog entry not found', [
        ['version', version],
        ['hint',    'pass --changelog <path> or check the heading in CHANGELOG.md'],
      ]);
      return EXIT.SECTION_NOT_FOUND;
    }
    if (err.code === 'ChangelogNotFound') {
      printErr('changelog file not found', [
        ['tried', err.message.replace(/^CHANGELOG\.md not found\. Tried: /, '')],
        ['hint',  'install the aitri CLI (`npm i -g aitri`) or pass --changelog <path>'],
      ]);
      return EXIT.CHANGELOG_NOT_FOUND;
    }
    printErr('review failed', [
      ['error', err.message],
    ]);
    return EXIT.CHANGELOG_NOT_FOUND;
  }

  // Symlink-escape guard: reject if the resolved real path escaped the
  // explicit override's containing directory. Compare real paths on both
  // sides so platforms where /tmp is itself a symlink (macOS) don't
  // false-positive.
  if (changelog) {
    const overrideAbs = path.isAbsolute(changelog) ? changelog : path.resolve(changelog);
    const overrideDir = path.dirname(overrideAbs);
    let overrideRoot;
    try {
      overrideRoot = fs.existsSync(overrideDir) ? fs.realpathSync(overrideDir) : overrideDir;
    } catch {
      overrideRoot = overrideDir;
    }
    if (
      !resolved.path.startsWith(overrideRoot + path.sep)
      && resolved.path !== overrideRoot
    ) {
      printErr('symlink resolves outside --changelog directory', [
        ['resolved', resolved.path],
        ['root',     overrideRoot],
        ['hint',     'the --changelog path must not symlink outside its own directory'],
      ]);
      return EXIT.USAGE;
    }
  }

  const manifest = {
    reviewedUpTo: version,
    reviewedAt: new Date().toISOString(),
    changelogHash: resolved.hash,
    reviewerNote: note,
  };
  try {
    writeManifest(manifest);
  } catch (err) {
    printErr('failed to write manifest', [
      ['error', err.message],
    ]);
    return EXIT.USAGE;
  }

  printOk('integration review recorded', [
    ['manifest', compatManifestPath()],
    ['reviewed', version],
    ['hash',     resolved.hash.slice(0, 12)],
  ]);
  return EXIT.OK;
}
