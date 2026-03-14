/**
 * Module: commands/setup
 * Purpose: Interactive CLI setup — register projects and write projects.json.
 * Dependencies: node:fs, node:readline, store/projects, constants
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  writeProjects, inferName, classifyAndValidate, projectId, hubDir, ensureDir,
} from '../store/projects.js';
import { SCHEMA_VERSION, MAX_PROJECTS, MAX_PROJECT_NAME_LENGTH } from '../constants.js';

/**
 * Prompt the user for a single line of input (async).
 * @param {readline.Interface} rl
 * @param {string} question
 * @returns {Promise<string>}
 */
function ask(rl, question) {
  return new Promise(resolve => rl.question(question, answer => resolve(answer.trim())));
}

/**
 * Scan a folder for immediate children that contain a .aitri file.
 * @param {string} folderPath
 * @returns {{ location: string, name: string }[]}
 */
function scanFolder(folderPath) {
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) return [];
  return fs.readdirSync(folderPath)
    .map(child => path.join(folderPath, child))
    .filter(p => {
      try { return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, '.aitri')); }
      catch { return false; }
    })
    .map(p => ({ location: p, name: path.basename(p) }));
}

/**
 * Prompt for a project count (1–MAX_PROJECTS). Re-prompts on invalid input.
 * @param {readline.Interface} rl
 * @returns {Promise<number>}
 */
async function askProjectCount(rl) {
  while (true) {
    const raw = await ask(rl, `How many projects do you want to register? [1] `);
    const n = raw === '' ? 1 : parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PROJECTS) {
      console.log(`  Please enter a number between 1 and ${MAX_PROJECTS}.`);
      continue;
    }
    return n;
  }
}

/**
 * Prompt for a project location (path or URL). Re-prompts on validation failure.
 * @param {readline.Interface} rl
 * @param {number} index - 1-based project index (for display).
 * @returns {Promise<{ location: string, type: 'local'|'remote' }>}
 */
async function askLocation(rl, index) {
  while (true) {
    const location = await ask(rl, `Project ${index} — path or URL: `);
    if (!location) {
      console.log('  Location cannot be empty.');
      continue;
    }
    const { type, valid, reason } = classifyAndValidate(location);
    if (!valid) {
      console.log(`  ${reason}`);
      continue;
    }
    return { location, type };
  }
}

/**
 * Prompt for the default interface (cli or web).
 * @param {readline.Interface} rl
 * @returns {Promise<string>}
 */
async function askInterface(rl) {
  while (true) {
    const raw = await ask(rl, `Default interface (cli / web)? [cli] `);
    const value = raw === '' ? 'cli' : raw.toLowerCase();
    if (value === 'cli' || value === 'web') return value;
    console.log(`  Enter 'cli' or 'web'.`);
  }
}

/**
 * Run the interactive setup command.
 * Writes ~/.aitri-hub/projects.json on confirmation.
 *
 * @aitri-trace FR-ID: FR-001, US-ID: US-001, AC-ID: AC-001, TC-ID: TC-001h
 *
 * @param {{ dir?: string }} [options] - options.dir overrides hubDir() for testing.
 * @returns {Promise<void>}
 */
export async function cmdSetup(options = {}) {
  ensureDir();

  const existingPath = (options.dir
    ? require('path').join(options.dir, 'projects.json')
    : null);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('\n── Aitri Hub Setup ───────────────────────────────────────');

    const mode = await ask(rl, 'Add projects individually or scan a folder? (individual / scan) [individual] ');
    const entries = [];

    const scanDirs = [];

    if (mode.toLowerCase().startsWith('s')) {
      while (true) {
        const folder = await ask(rl, 'Folder to scan (leave empty to finish): ');
        if (!folder) break;
        const resolved = folder.startsWith('~')
          ? path.join(process.env.HOME ?? '', folder.slice(1))
          : path.resolve(folder);
        const found = scanFolder(resolved);
        if (found.length === 0) {
          console.log(`  No Aitri projects found in ${resolved} (no subdirectory with .aitri).`);
          continue;
        }
        console.log(`\nFound ${found.length} Aitri project(s) in ${path.basename(resolved)}/:`);
        found.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}`));
        console.log('');
        const confirm = await ask(rl, `Add this folder? (Y/n) `);
        if (confirm.toLowerCase() !== 'n') {
          scanDirs.push(resolved);
          console.log(`  ✓ Added scan dir: ${resolved}`);
        }
      }
    } else {
      const count = await askProjectCount(rl);
      for (let i = 1; i <= count; i++) {
        const { location, type } = await askLocation(rl, i);
        const defaultName = inferName(location);
        const rawName = await ask(rl, `Display name for project ${i} [${defaultName}]: `);
        const name = rawName === '' ? defaultName : rawName.slice(0, MAX_PROJECT_NAME_LENGTH).trim();
        entries.push({ id: projectId(location), name, location, type, addedAt: new Date().toISOString() });
      }
    }

    const iface = await askInterface(rl);

    // Summary and confirmation.
    console.log('\nConfiguration to save:');
    for (const e of entries) {
      console.log(`  ${e.name} (${e.type}) → ${e.location}`);
    }
    console.log(`  Default interface: ${iface}`);
    console.log('');

    const confirm = await ask(rl, 'Save configuration? (Y/n) ');
    if (confirm.toLowerCase() === 'n') {
      console.log('Aborted — nothing saved.');
      return;
    }

    writeProjects({
      version: SCHEMA_VERSION,
      defaultInterface: iface,
      scanDirs: scanDirs.length > 0 ? scanDirs : undefined,
      projects: entries,
    });

    console.log(`\n✓ Configuration saved to ${hubDir()}/projects.json`);
    console.log("  Run 'aitri-hub monitor' for CLI dashboard or 'aitri-hub web' for web dashboard.\n");
  } finally {
    rl.close();
  }
}
