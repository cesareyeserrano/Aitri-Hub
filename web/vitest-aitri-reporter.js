/**
 * Minimal Vitest reporter that prints aitri-parseable TC markers with the TC id
 * ADJACENT to the status glyph — `✔ TC-xxx: name` (pass) / `✖ TC-xxx: name` (fail).
 * Vitest's own verbose line puts the file + describe chain between the glyph and the
 * test name (`✓ src/x.test.js > Suite > TC-010h`), which aitri's stdout parser does
 * not associate with the TC id. This reporter re-emits one clean marker per test so
 * verify-run credits the web unit TCs. Skipped tests emit no marker (not a failure).
 *
 * Supports both the Vitest v4 reporter hook (onTestCaseResult) and the legacy
 * task-tree hook (onFinished) so it works regardless of the runner's dispatch.
 */

function emit(name, state) {
  const m = String(name).match(/TC-[A-Za-z0-9-]+/);
  if (!m) return;
  if (state === 'passed' || state === 'pass') process.stdout.write(`✔ ${m[0]}: ${name}\n`);
  else if (state === 'failed' || state === 'fail') process.stdout.write(`✖ ${m[0]}: ${name}\n`);
}

function walk(tasks) {
  for (const t of tasks || []) {
    if ((t.type === 'test' || t.type === 'custom') && t.result) emit(t.name, t.result.state);
    if (t.tasks) walk(t.tasks);
  }
}

export default class AitriVitestReporter {
  // Vitest v4: one call per finished test case.
  onTestCaseResult(testCase) {
    try {
      const name = testCase.fullName ?? testCase.name ?? '';
      const state = typeof testCase.result === 'function' ? testCase.result()?.state : testCase.result?.state;
      emit(name, state);
    } catch { /* ignore — best-effort marker */ }
  }

  // Legacy fallback: whole task tree at the end.
  onFinished(files = []) {
    for (const f of files) walk(f.tasks ?? []);
  }
}
