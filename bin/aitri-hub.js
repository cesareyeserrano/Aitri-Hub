#!/usr/bin/env node
/**
 * Module: bin/aitri-hub
 * Purpose: CLI entry point — parse subcommand and dispatch to command handlers.
 * Dependencies: lib/commands/*
 */

import { cmdInit } from '../lib/commands/init.js';
import { cmdSetup } from '../lib/commands/setup.js';
import { cmdWeb } from '../lib/commands/web.js';

const USAGE = `
Aitri Hub — Centralized monitoring dashboard for Aitri projects.

Usage:
  aitri-hub init      First-time setup wizard
  aitri-hub setup     Add or update registered projects
  aitri-hub web       Start the web dashboard at localhost:3000
  aitri-hub help      Show this message

Options:
  --version   Print version and exit
`;

async function main() {
  const [, , subcommand, ...rest] = process.argv;

  if (!subcommand || subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    console.log(USAGE.trim());
    return;
  }

  if (subcommand === '--version' || subcommand === 'version') {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const pkg = require('../package.json');
    console.log(pkg.version);
    return;
  }

  switch (subcommand) {
    case 'init':
      await cmdInit();
      break;
    case 'setup': {
      const scanIdx = rest.indexOf('--scan');
      const scanDir = scanIdx !== -1 ? rest[scanIdx + 1] : undefined;
      await cmdSetup({ scanDir });
      break;
    }
    case 'monitor':
      console.log("aitri-hub monitor has been removed — run 'aitri-hub web' to open the dashboard.");
      process.exitCode = 0;
      break;
    case 'web':
      await cmdWeb();
      break;
    default:
      console.error(`Unknown command: '${subcommand}'. Run 'aitri-hub help' for usage.`);
      process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exitCode = 1;
});
