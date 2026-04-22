#!/usr/bin/env node
/**
 * Module: bin/aitri-hub
 * Purpose: CLI entry point — parse subcommand and dispatch to command handlers.
 * Dependencies: lib/commands/web.js, lib/commands/integration-review.js
 *
 * @aitri-trace FR-ID: FR-001, US-ID: US-001, AC-ID: AC-001, TC-ID: TC-001h
 */

import { cmdWeb } from '../lib/commands/web.js';
import { cmdIntegrationReview } from '../lib/commands/integration-review.js';

const USAGE = `
Aitri Hub — Local web dashboard for Aitri-managed projects.

Usage:
  aitri-hub web                               Start the dashboard at http://localhost:3000
  aitri-hub integration review <version>      Record an Aitri CHANGELOG review
  aitri-hub help                              Show this message
  aitri-hub --version                         Print version and exit

Data lives in ~/.aitri-hub/. See README.md for details.
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
    case 'web':
      await cmdWeb();
      break;
    case 'integration': {
      const [action, ...actionArgs] = rest;
      if (action === 'review') {
        const code = await cmdIntegrationReview(actionArgs);
        process.exitCode = code;
      } else {
        console.error(
          `Unknown 'integration' action: '${action ?? ''}'. Expected: review.\n` +
            `Usage: aitri-hub integration review <version> [--changelog <path>] [--note <str>]`,
        );
        process.exitCode = 1;
      }
      break;
    }
    default:
      console.error(`Unknown command: '${subcommand}'. Run 'aitri-hub help' for usage.`);
      process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exitCode = 1;
});
