/**
 * Module: commands/monitor
 * Purpose: CLI dashboard — collection loop with 5-second auto-refresh.
 * Dependencies: collector/index, renderer/cli, store/projects, store/dashboard, constants
 */

import fs from 'node:fs';
import path from 'node:path';
import { collectAll } from '../collector/index.js';
import { renderDashboard } from '../renderer/cli.js';
import { readProjects, projectId, inferName } from '../store/projects.js';
import { writeDashboard, appendLog } from '../store/dashboard.js';
import { REFRESH_MS, ANSI } from '../constants.js';

/**
 * Scan a directory for immediate children that contain a .aitri file.
 * @param {string} dir
 * @returns {ProjectEntry[]}
 */
function scanDir(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .map(child => path.join(dir, child))
      .filter(p => {
        try { return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, '.aitri')); }
        catch { return false; }
      })
      .map(p => ({
        id: projectId(p),
        name: inferName(p),
        location: p,
        type: 'local',
        addedAt: new Date().toISOString(),
      }));
  } catch { return []; }
}

/**
 * Merge registered projects with auto-scanned ones (deduplicate by id).
 * @param {ProjectEntry[]} registered
 * @param {ProjectEntry[]} scanned
 * @returns {ProjectEntry[]}
 */
function mergeProjects(registered, scanned) {
  const seen = new Set(registered.map(p => p.id));
  const novel = scanned.filter(p => !seen.has(p.id));
  return [...registered, ...novel];
}

/**
 * Run the CLI monitor.
 * Reads projects.json, starts a collection + render loop every REFRESH_MS.
 * If AITRI_HUB_SCAN_DIR is set, auto-discovers new projects each cycle.
 * Installs SIGINT handler to restore terminal state on Ctrl+C.
 *
 * @aitri-trace FR-ID: FR-005, US-ID: US-005, AC-ID: AC-007, TC-ID: TC-005h
 *
 * @param {{ singleCycle?: boolean, _output?: string[] }} [options]
 *   singleCycle: if true, run one cycle and return (used in tests).
 *   _output: if provided, push rendered strings here instead of writing to stdout.
 * @returns {Promise<void>}
 */
export async function cmdMonitor(options = {}) {
  // Read registered projects — if none configured, start with empty list
  let registered = [];
  try {
    const config = readProjects();
    registered = config.projects ?? [];
  } catch {
    // No projects.json yet — monitor still starts, shows empty dashboard
  }

  // Scan dirs: from config (persistent) + env var override (comma-separated)
  const configScanDirs = [];
  try {
    const cfg = readProjects();
    if (Array.isArray(cfg.scanDirs)) configScanDirs.push(...cfg.scanDirs);
  } catch { /* ignore */ }
  const envScanDirs = process.env.AITRI_HUB_SCAN_DIR
    ? process.env.AITRI_HUB_SCAN_DIR.split(',').map(d => path.resolve(d.trim())).filter(Boolean)
    : [];
  const scanDirPaths = [...new Set([...configScanDirs, ...envScanDirs])];

  const write = (s) => {
    if (options._output) options._output.push(s);
    else process.stdout.write(s);
  };

  if (!options.singleCycle) write(ANSI.HIDE_CURSOR);

  if (!options.singleCycle) {
    process.on('SIGINT', () => {
      process.stdout.write(ANSI.SHOW_CURSOR + '\n');
      process.exit(0);
    });
  }

  const cycle = async () => {
    // Re-read projects.json each cycle so newly added projects appear without restart
    try {
      const config = readProjects();
      registered = config.projects ?? [];
    } catch { /* keep last known list */ }

    const scanned = scanDirPaths.flatMap(dir =>
      scanDir(dir).map(p => ({ ...p, group: path.basename(dir) }))
    );
    const projects = mergeProjects(registered, scanned);

    let data;
    try {
      data = await collectAll(projects);
    } catch (err) {
      appendLog(`collectAll error: ${err.message}`);
      return;
    }
    try {
      writeDashboard(data);
    } catch (err) {
      appendLog(`writeDashboard error: ${err.message}`);
    }
    const width = process.stdout.columns ?? 80;
    write(renderDashboard(data, width));
  };

  await cycle();

  if (options.singleCycle) return;

  const timer = setInterval(cycle, REFRESH_MS);

  await new Promise(() => {});
  clearInterval(timer);
}
