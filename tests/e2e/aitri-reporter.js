/**
 * Minimal Playwright reporter that outputs TC-xxx markers in aitri-parseable format.
 * Uses node:test-compatible symbols so parseRunnerOutput detects them from npm test output.
 * Format: ✔ TC-xxx: description  (pass)   — U+2714 heavy check mark
 *         ✖ TC-xxx: description  (fail)   — U+2716 heavy multiplication x
 */
export default class AitriReporter {
  onTestEnd(test, result) {
    // A skipped test is NOT a failure \u2014 emit no TC marker for it. Otherwise a TC id
    // that a skipped (e.g. superseded) e2e shares with a passing test elsewhere
    // (vitest/node) would be falsely reported as failed and override the real pass.
    if (result.status === 'skipped') return;
    const icon = result.status === 'passed' ? '\u2714' : '\u2716';
    console.log(`${icon} ${test.title}`);
  }

  onEnd(result) {
    const { passed, failed } = result;
    console.log(`\nPassed: ${passed ?? 0}  Failed: ${failed ?? 0}`);
  }
}
