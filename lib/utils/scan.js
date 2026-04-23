/**
 * Module: utils/scan
 * Purpose: Shared directory scanning and project merging utilities.
 *          Eliminates duplication across monitor, web, init, and setup commands.
 * Dependencies: node:fs, node:path, store/projects
 */

import fs from 'node:fs';
import path from 'node:path';
import { projectId, inferName } from '../store/projects.js';

/**
 * Scan a directory for immediate children that contain a .aitri file.
 * Returns full project entries ready for collection.
 *
 * @param {string} dir - Absolute path to the directory to scan.
 * @returns {{ id: string, name: string, location: string, type: 'local', addedAt: string }[]}
 */
export function scanDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .map(child => path.join(dir, child))
      .filter(p => {
        try {
          return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, '.aitri'));
        } catch {
          return false;
        }
      })
      .map(p => ({
        id: projectId(p),
        name: inferName(p),
        location: p,
        type: 'local',
        addedAt: new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

/**
 * Merge registered projects with auto-scanned ones. Deduplicates by project id.
 * Registered projects take precedence over scanned ones.
 *
 * @param {object[]} registered - Projects from projects.json.
 * @param {object[]} scanned - Projects discovered via scanDir.
 * @returns {object[]}
 */
export function mergeProjects(registered, scanned) {
  const seen = new Set(registered.map(p => p.id));
  return [...registered, ...scanned.filter(p => !seen.has(p.id))];
}
