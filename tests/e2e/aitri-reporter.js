/**
 * Minimal Playwright reporter that outputs TC-xxx markers in aitri-parseable format.
 * Uses node:test-compatible symbols so parseRunnerOutput detects them from npm test output.
 * Format: ✔ TC-xxx: description  (pass)   — U+2714 heavy check mark
 *         ✖ TC-xxx: description  (fail)   — U+2716 heavy multiplication x
 */
export default class AitriReporter {
  onTestEnd(test, result) {
    const title = test.title;
    const icon  = result.status === 'passed' ? '\u2714' : '\u2716';
    console.log(`${icon} ${title}`);
  }

  onEnd(result) {
    const { passed, failed } = result;
    console.log(`\nPassed: ${passed ?? 0}  Failed: ${failed ?? 0}`);
  }
}
