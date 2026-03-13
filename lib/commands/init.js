/**
 * Module: commands/init
 * Purpose: First-run wizard — guided setup for Aitri Hub with ANSI presentation.
 * Dependencies: node:fs, node:path, node:readline, store/projects, constants
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { writeProjects, inferName, classifyAndValidate, projectId, hubDir, ensureDir } from '../store/projects.js';
import { SCHEMA_VERSION, MAX_PROJECTS } from '../constants.js';

// ── ANSI palette (matches Aitri original) ────────────────────────────────────
const steel = '\x1b[38;5;75m';
const fire  = '\x1b[38;5;208m';
const ember = '\x1b[38;5;166m';
const green = '\x1b[38;5;114m';
const dim   = '\x1b[2m';
const bold  = '\x1b[1m';
const reset = '\x1b[0m';
const cyan  = '\x1b[38;5;87m';
const gray  = '\x1b[38;5;245m';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, a => resolve(a.trim())));
}

function hr(char = '─', width = 56) {
  return gray + char.repeat(width) + reset;
}

function step(n, total, label) {
  return `${gray}[${reset}${steel}${n}${gray}/${total}${reset}${gray}]${reset} ${bold}${label}${reset}`;
}

function ok(msg)   { return `${green}✓${reset} ${msg}`; }
function info(msg) { return `${cyan}ℹ${reset} ${dim}${msg}${reset}`; }
function warn(msg) { return `${fire}⚠${reset} ${msg}`; }

function scanFolder(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) return [];
  try {
    return fs.readdirSync(folderPath)
      .map(child => path.join(folderPath, child))
      .filter(p => {
        try { return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, '.aitri')); }
        catch { return false; }
      })
      .map(p => ({ location: p, name: path.basename(p) }));
  } catch { return []; }
}

// ── Banner ────────────────────────────────────────────────────────────────────

function printBanner() {
  console.clear();
  console.log(`
${steel}   █████╗ ██╗████████╗██████╗ ██╗${reset}
${steel}  ██╔══██╗██║╚══██╔══╝██╔══██╗██║${reset}
${fire}  ███████║██║   ██║   ██████╔╝██║${reset}
${ember}  ██╔══██║██║   ██║   ██╔══██╗██║${reset}
${fire}  ██║  ██║██║   ██║   ██║  ██║██║${reset}
${steel}  ╚═╝  ╚═╝╚═╝   ╚═╝   ╚═╝  ╚═╝╚═╝${reset}

${steel}  ╔══════════════════════════════════════╗${reset}
${steel}  ║${reset}  ${fire}${bold}HUB${reset}  ${dim}— Project Monitoring Dashboard${reset}   ${steel}║${reset}
${steel}  ╚══════════════════════════════════════╝${reset}

${dim}  Monitor all your Aitri projects from one place.${reset}
${dim}  CLI dashboard + web interface at localhost:3000.${reset}
`);
}

// ── Wizard steps ──────────────────────────────────────────────────────────────

async function stepWelcome(rl) {
  console.log(hr());
  console.log(`  ${step(1, 4, 'Welcome')}  ${gray}— first-time setup${reset}`);
  console.log(hr());
  console.log('');

  const existing = fs.existsSync(path.join(hubDir(), 'projects.json'));
  if (existing) {
    console.log(`  ${warn('Existing configuration found at')} ${dim}${hubDir()}/projects.json${reset}`);
    console.log('');
    const overwrite = await ask(rl, `  Overwrite existing config? ${gray}(y/N)${reset} `);
    if (overwrite.toLowerCase() !== 'y') {
      console.log('');
      console.log(`  ${info('Setup cancelled — existing config preserved.')}`);
      console.log('');
      return false;
    }
  } else {
    console.log(`  ${info(`Configuration will be saved to ${hubDir()}`)}`);
  }

  console.log('');
  return true;
}

async function stepProjects(rl) {
  console.log(hr());
  console.log(`  ${step(2, 4, 'Register Projects')}`);
  console.log(hr());
  console.log('');
  console.log(`  ${dim}How would you like to add projects?${reset}`);
  console.log('');
  console.log(`  ${steel}[s]${reset} ${bold}Scan folder${reset}   ${dim}— auto-detect all Aitri projects in a directory${reset}`);
  console.log(`  ${steel}[i]${reset} ${bold}Individual${reset}     ${dim}— enter project paths one by one${reset}`);
  console.log('');

  const mode = await ask(rl, `  Choice ${gray}[s/i]${reset} `);
  const entries = [];

  if (!mode || mode.toLowerCase().startsWith('s')) {
    console.log('');
    let folder = '';
    while (true) {
      folder = await ask(rl, `  ${steel}›${reset} Folder to scan: `);
      if (!folder) { console.log(`  ${warn('Path cannot be empty.')}`); continue; }
      const resolved = folder.startsWith('~')
        ? path.join(process.env.HOME ?? '', folder.slice(1))
        : path.resolve(folder);
      const found = scanFolder(resolved);
      if (found.length === 0) {
        console.log(`  ${warn(`No Aitri projects found in ${resolved}`)}`);
        console.log(`  ${dim}(Looking for subdirectories with a .aitri file)${reset}`);
        continue;
      }
      console.log('');
      console.log(`  ${ok(`Found ${found.length} Aitri project(s):`)}`)
      console.log('');
      found.forEach((p, i) => {
        console.log(`    ${steel}${i + 1}.${reset} ${bold}${p.name}${reset}  ${dim}${p.location}${reset}`);
      });
      console.log('');
      const confirm = await ask(rl, `  Add all ${found.length} project(s)? ${gray}(Y/n)${reset} `);
      if (confirm.toLowerCase() === 'n') {
        console.log(`  ${info('Scan cancelled.')}`);
        break;
      }
      for (const p of found.slice(0, MAX_PROJECTS)) {
        entries.push({ id: projectId(p.location), name: p.name, location: p.location, type: 'local', addedAt: new Date().toISOString() });
      }
      // Offer SCAN_DIR hint
      console.log('');
      console.log(`  ${info('Tip: set AITRI_HUB_SCAN_DIR to auto-discover new projects without re-running setup:')}`);
      console.log(`  ${dim}export AITRI_HUB_SCAN_DIR=${resolved}${reset}`);
      break;
    }
  } else {
    console.log('');
    let adding = true;
    while (adding && entries.length < MAX_PROJECTS) {
      const location = await ask(rl, `  ${steel}›${reset} Project path or URL: `);
      if (!location) { console.log(`  ${warn('Cannot be empty.')}`); continue; }
      const { type, valid, reason } = classifyAndValidate(location);
      if (!valid) { console.log(`  ${warn(reason)}`); continue; }
      const defaultName = inferName(location);
      const rawName = await ask(rl, `  ${steel}›${reset} Display name ${gray}[${defaultName}]${reset}: `);
      const name = rawName || defaultName;
      entries.push({ id: projectId(location), name: name.slice(0, 40).trim(), location, type, addedAt: new Date().toISOString() });
      console.log(`  ${ok(`Added: ${bold}${name}${reset}`)}`);
      console.log('');
      if (entries.length >= MAX_PROJECTS) break;
      const more = await ask(rl, `  Add another project? ${gray}(y/N)${reset} `);
      if (more.toLowerCase() !== 'y') adding = false;
    }
  }

  return entries;
}

async function stepInterface(rl) {
  console.log('');
  console.log(hr());
  console.log(`  ${step(3, 4, 'Default Interface')}`);
  console.log(hr());
  console.log('');
  console.log(`  ${steel}[c]${reset} ${bold}CLI${reset}  ${dim}— terminal dashboard (aitri-hub monitor)${reset}`);
  console.log(`  ${steel}[w]${reset} ${bold}Web${reset}  ${dim}— browser dashboard at localhost:3000 (aitri-hub web)${reset}`);
  console.log('');

  while (true) {
    const raw = await ask(rl, `  Choice ${gray}[c/w]${reset} `);
    const val = raw.toLowerCase();
    if (!raw || val === 'c' || val === 'cli') return 'cli';
    if (val === 'w' || val === 'web') return 'web';
    console.log(`  ${warn("Enter 'c' for CLI or 'w' for web.")}`);
  }
}

function stepSummary(entries, iface) {
  console.log('');
  console.log(hr());
  console.log(`  ${step(4, 4, 'Summary')}`);
  console.log(hr());
  console.log('');
  console.log(`  ${bold}Projects registered:${reset}  ${steel}${entries.length}${reset}`);
  entries.forEach(e => {
    console.log(`    ${green}●${reset} ${bold}${e.name}${reset}  ${dim}${e.location}${reset}`);
  });
  console.log('');
  console.log(`  ${bold}Default interface:${reset}   ${steel}${iface}${reset}`);
  console.log(`  ${bold}Config saved to:${reset}     ${dim}${hubDir()}/projects.json${reset}`);
}

function printNextSteps(iface) {
  console.log('');
  console.log(hr('═'));
  console.log('');
  console.log(`  ${fire}${bold}Setup complete.${reset} Here's what to do next:`);
  console.log('');

  if (iface === 'web') {
    console.log(`  ${steel}1.${reset} ${bold}aitri-hub monitor${reset}  ${dim}— start collecting data (keep running)${reset}`);
    console.log(`  ${steel}2.${reset} ${bold}aitri-hub web${reset}       ${dim}— open dashboard at localhost:3000${reset}`);
  } else {
    console.log(`  ${steel}1.${reset} ${bold}aitri-hub monitor${reset}  ${dim}— start the live CLI dashboard${reset}`);
    console.log(`  ${steel}2.${reset} ${bold}aitri-hub web${reset}       ${dim}— optional: web dashboard at localhost:3000${reset}`);
  }

  console.log('');
  console.log(`  ${dim}Add projects anytime:  aitri-hub setup${reset}`);
  console.log(`  ${dim}Auto-scan folder:      export AITRI_HUB_SCAN_DIR=/your/projects${reset}`);
  console.log('');
  console.log(hr('═'));
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Run the first-run wizard.
 * @returns {Promise<void>}
 */
export async function cmdInit() {
  printBanner();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    ensureDir();

    const proceed = await stepWelcome(rl);
    if (!proceed) return;

    const entries = await stepProjects(rl);

    if (entries.length === 0) {
      console.log('');
      console.log(`  ${warn('No projects added. Run')} ${bold}aitri-hub init${reset} ${warn('again when ready.')}`);
      console.log('');
      return;
    }

    const iface = await stepInterface(rl);

    stepSummary(entries, iface);

    console.log('');
    const confirm = await ask(rl, `  Save configuration? ${gray}(Y/n)${reset} `);
    if (confirm.toLowerCase() === 'n') {
      console.log(`  ${info('Aborted — nothing saved.')}`);
      console.log('');
      return;
    }

    writeProjects({ version: SCHEMA_VERSION, defaultInterface: iface, projects: entries });

    printNextSteps(iface);

  } finally {
    rl.close();
  }
}
