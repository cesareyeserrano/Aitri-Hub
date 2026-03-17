/**
 * Module: store/dashboard
 * Purpose: Atomic write of aggregated dashboard state to ~/.aitri-hub/dashboard.json.
 * Dependencies: node:fs, node:path, store/projects
 */

import fs from 'node:fs';
import path from 'node:path';
import { hubDir, ensureDir } from './projects.js';
import { DASHBOARD_FILE, DASHBOARD_TMP_FILE, LOG_FILE } from '../constants.js';

const LOG_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — rotate when exceeded

// Module-level flag: skip repeated ensureDir() calls once dirs are confirmed present.
let _dirEnsured = false;
function ensureDirOnce() {
  if (!_dirEnsured) { ensureDir(); _dirEnsured = true; }
}

/**
 * Resolve path to dashboard.json.
 * @returns {string}
 */
export function dashboardFilePath() {
  return path.join(hubDir(), DASHBOARD_FILE);
}

/**
 * Write dashboard data atomically to ~/.aitri-hub/dashboard.json.
 * Uses temp-file + rename pattern to prevent partial reads.
 * On write failure, logs the error and preserves the previous file content.
 *
 * @param {DashboardData} data - Aggregated project data to persist.
 * @returns {void}
 */
export function writeDashboard(data) {
  ensureDirOnce();
  const finalPath = dashboardFilePath();
  const tmpPath = path.join(hubDir(), DASHBOARD_TMP_FILE);
  const content = JSON.stringify(data, null, 2);

  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, finalPath);
  } catch (err) {
    appendLog(`writeDashboard failed: ${err.code ?? 'UNKNOWN'} — ${err.message}`);
    // Clean up temp file if it was created before the failure
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup — ignore secondary failure
    }
    // Do NOT re-throw: the monitor loop must continue even if a single write fails
  }
}

/**
 * Read and parse dashboard.json. Returns null if the file is absent or malformed.
 * @returns {DashboardData | null}
 */
export function readDashboard() {
  const filePath = dashboardFilePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Append a line to the Aitri Hub log file. Silently ignores write errors.
 * @param {string} message
 * @returns {void}
 */
export function appendLog(message) {
  try {
    ensureDirOnce();
    const logPath = path.join(hubDir(), LOG_FILE);
    // Rotate log file when it exceeds LOG_MAX_BYTES (keep one backup).
    try {
      if (fs.statSync(logPath).size > LOG_MAX_BYTES) {
        fs.renameSync(logPath, logPath + '.1');
      }
    } catch { /* file does not exist yet — that's fine */ }
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`, 'utf8');
  } catch {
    // Log failures must never crash the caller
  }
}
