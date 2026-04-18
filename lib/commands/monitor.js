/**
 * Module: commands/monitor
 * Purpose: Deprecated CLI monitor — directs users to the web dashboard.
 *
 * @aitri-trace FR-ID: FR-018, US-ID: US-018, AC-ID: AC-022, TC-ID: TC-018h
 */

/**
 * Deprecated monitor command.
 * Prints a notice directing the user to the web dashboard and exits 0.
 * No screen clear, no polling loop, terminates within 500ms.
 *
 * @returns {void}
 */
export function cmdMonitor() {
  console.log('aitri-hub monitor has been replaced by the web dashboard.');
  console.log('Open http://localhost:3000 to view the live dashboard.');
  console.log("Run 'aitri-hub web' to start the server.");
  process.exit(0);
}
