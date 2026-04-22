/**
 * Module: store/projects
 * Purpose: Read and write ~/.aitri-hub/projects.json with atomic writes.
 * Dependencies: node:fs, node:path, node:os, node:crypto
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { PROJECTS_FILE } from '../constants.js';

/**
 * Resolve the base Aitri Hub directory.
 * @returns {string} Absolute path to ~/.aitri-hub (or AITRI_HUB_DIR override).
 */
export function hubDir() {
  return process.env.AITRI_HUB_DIR
    ? path.resolve(process.env.AITRI_HUB_DIR)
    : path.join(os.homedir(), '.aitri-hub');
}

/**
 * Ensure the base directory and subdirectories exist.
 * Creates ~/.aitri-hub/, ~/.aitri-hub/cache/, ~/.aitri-hub/logs/ if absent.
 * @returns {void}
 */
export function ensureDir() {
  const base = hubDir();
  for (const sub of ['', 'cache', 'logs']) {
    const dir = sub ? path.join(base, sub) : base;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Resolve path to projects.json.
 * @returns {string}
 */
export function projectsFilePath() {
  return path.join(hubDir(), PROJECTS_FILE);
}

/**
 * Read projects.json.
 * @throws {Error} If the file does not exist or contains invalid JSON.
 * @returns {{ version: string, defaultInterface: string, projects: ProjectEntry[] }}
 */
export function readProjects() {
  const filePath = projectsFilePath();
  if (!fs.existsSync(filePath)) {
    throw new Error(`projects.json not found at ${filePath}. Run 'aitri-hub setup' first.`);
  }
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read ${filePath}: ${err.message}`, { cause: err });
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`projects.json is not valid JSON. Delete it and re-run 'aitri-hub setup'.`);
  }
}

/**
 * Write projects.json atomically (temp file + rename).
 * @param {{ version: string, defaultInterface: string, projects: ProjectEntry[] }} config
 * @returns {void}
 */
export function writeProjects(config) {
  ensureDir();
  const filePath = projectsFilePath();
  const tmpPath = filePath + '.tmp';
  const content = JSON.stringify(config, null, 2);
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      fs.rmSync(tmpPath, { force: true });
    } catch {}
    throw new Error(`Failed to write projects.json: ${err.message}`, { cause: err });
  }
}

/**
 * Generate a deterministic 8-char project ID from its location string.
 * @param {string} location
 * @returns {string}
 */
export function projectId(location) {
  return crypto.createHash('sha256').update(location).digest('hex').slice(0, 8);
}

/**
 * Sanitize a project name: strip path separators and special shell chars, max 40 chars.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeName(name) {
  return (
    name
      // eslint-disable-next-line no-control-regex
      .replace(/[<>/\\:*?"|\x00-\x1f]/g, '')
      .slice(0, 40)
      .trim()
  );
}

/**
 * Infer a display name from a local path or remote URL.
 * @param {string} location
 * @returns {string}
 */
export function inferName(location) {
  const stripped = location.replace(/\.git$/, '').replace(/\/$/, '');
  return sanitizeName(path.basename(stripped));
}

/**
 * Validate a local project path: must be absolute and must exist on disk.
 * @param {string} location
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateLocalPath(location) {
  if (!path.isAbsolute(location)) {
    return { valid: false, reason: 'Path must be absolute (start with /).' };
  }
  if (location.split(path.sep).some(seg => seg === '..')) {
    return { valid: false, reason: 'Path must not contain ".." segments.' };
  }
  if (!fs.existsSync(location)) {
    return { valid: false, reason: `Path not found. Enter an existing directory.` };
  }
  return { valid: true };
}

/**
 * Validate a remote URL: must start with http:// or https:// or git:// or file://.
 * @param {string} url
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateRemoteUrl(url) {
  if (!/^(https?|git|file):\/\/.+/.test(url)) {
    return {
      valid: false,
      reason: 'Remote location must start with https://, http://, git://, or file://.',
    };
  }
  return { valid: true };
}

/**
 * Determine project type and validate accordingly.
 * @param {string} location
 * @returns {{ type: 'local'|'remote', valid: boolean, reason?: string }}
 */
export function classifyAndValidate(location) {
  const isRemote = /^(https?|git|file):\/\//.test(location);
  if (isRemote) {
    const v = validateRemoteUrl(location);
    return { type: 'remote', ...v };
  }
  const v = validateLocalPath(location);
  return { type: 'local', ...v };
}
