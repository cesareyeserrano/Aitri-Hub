/**
 * Scans immediate children of a registered folder-type project.
 * Returns synthetic project stubs for valid children (depth=1 only).
 * Symlinks are skipped. Children must have package.json or .aitri/ to be valid.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Check if a directory qualifies as a project.
 * Valid: contains package.json file OR .aitri directory.
 * @param {string} dirPath - Absolute path to the candidate directory
 * @returns {boolean}
 */
export function isValidProject(dirPath) {
  try {
    if (fs.existsSync(path.join(dirPath, 'package.json'))) return true;
    if (fs.existsSync(path.join(dirPath, '.aitri'))) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Scan a folder for immediate child project directories.
 * @param {string} folderPath - Absolute path to the registered folder
 * @returns {Array<{name:string, location:string, type:string, parentFolder:string}>}
 */
export function scanFolder(folderPath) {
  let entries;
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    // Skip files and symlinks — directories only, no symlink following
    if (!entry.isDirectory()) continue;
    if (entry.isSymbolicLink()) continue;

    const childPath = path.join(folderPath, entry.name);
    if (!isValidProject(childPath)) continue;

    results.push({
      name: entry.name,
      location: childPath,
      type: 'local',
      parentFolder: folderPath,
    });
  }

  return results;
}
