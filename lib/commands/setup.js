/**
 * Module: commands/setup
 * Purpose: Deprecated CLI setup — directs users to the web admin panel.
 *
 * @aitri-trace FR-ID: FR-017, US-ID: US-017, AC-ID: AC-021, TC-ID: TC-017h
 */

/**
 * Deprecated setup command.
 * Prints a notice directing the user to the web admin panel and exits 0.
 * No interactive prompts, no file writes.
 *
 * @returns {void}
 */
export function cmdSetup() {
  console.log('aitri-hub setup has moved to the web admin panel.');
  console.log('Open http://localhost:3000/admin to register and manage projects.');
  console.log("Run 'aitri-hub web' first if the server is not already running.");
  process.exit(0);
}
