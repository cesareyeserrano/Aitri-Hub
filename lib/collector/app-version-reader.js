/**
 * Module: collector/app-version-reader
 * Purpose: Read a project's own application version from package.json or VERSION file.
 * Resolution order: package.json .version → VERSION file → null.
 *
 * @aitri-trace FR-ID: FR-012, US-ID: US-012, AC-ID: AC-013, TC-ID: TC-app-version-h
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Read the application version for a project directory.
 * Returns the version string or null if neither source is found.
 *
 * @param {string} projectDir - Absolute path to the project root.
 * @returns {string | null}
 */
export function readAppVersion(projectDir) {
  // 1. Try package.json .version
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw);
      if (pkg.version && typeof pkg.version === 'string' && pkg.version.trim()) {
        return pkg.version.trim();
      }
    } catch {
      // malformed package.json — fall through to VERSION file
    }
  }

  // 2. Try VERSION file
  const versionPath = path.join(projectDir, 'VERSION');
  if (fs.existsSync(versionPath)) {
    try {
      const content = fs.readFileSync(versionPath, 'utf8').trim();
      if (content) return content;
    } catch {
      // unreadable VERSION file — fall through to null
    }
  }

  return null;
}
