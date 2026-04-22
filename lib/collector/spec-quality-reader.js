/**
 * Module: collector/spec-quality-reader
 * Purpose: Detect placeholder content in Aitri spec artifacts.
 * Dependencies: node:fs, node:path
 *
 * Reads spec files as raw text and scans for known placeholder patterns.
 * Returns a summary of what was found — never throws.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Artifact files to scan for placeholders. */
const SPEC_FILES = [
  '01_REQUIREMENTS.json',
  '02_SYSTEM_DESIGN.md',
  '03_TEST_CASES.json',
  '04_IMPLEMENTATION_MANIFEST.json',
  '05_PROOF_OF_COMPLIANCE.json',
];

/** Patterns that indicate placeholder / unfinished content. */
const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /\[PENDING\]/i,
  /\[TO BE DEFINED\]/i,
  /\bPLACEHOLDER\b/i,
  /Lorem ipsum/i,
  /<INSERT/i,
  /FILL IN/i,
];

/**
 * Scan spec artifacts for placeholder patterns.
 * Returns { hasPlaceholders: boolean, files: string[] } where files lists
 * the artifact filenames that contain placeholders.
 *
 * @param {string} projectDir
 * @param {string} artifactsDir - e.g. 'spec' or '' (project root)
 * @returns {{ hasPlaceholders: boolean, files: string[] }}
 */
export function readSpecQuality(projectDir, artifactsDir) {
  const base = artifactsDir ? path.join(projectDir, artifactsDir) : projectDir;

  const filesWithPlaceholders = [];

  for (const filename of SPEC_FILES) {
    const filePath = path.join(base, filename);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (PLACEHOLDER_PATTERNS.some(re => re.test(content))) {
        filesWithPlaceholders.push(filename);
      }
    } catch {
      /* unreadable — skip */
    }
  }

  return {
    hasPlaceholders: filesWithPlaceholders.length > 0,
    files: filesWithPlaceholders,
  };
}
