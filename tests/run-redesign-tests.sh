#!/bin/sh
# Redesign test_runner — runs BOTH the node:test suites and the web (Vitest) suite so
# aitri's verify-run detects TC-xxx markers from both in one captured stdout. aitri runs
# test_runner as a single program (no shell), so the node+vitest chain must live in a
# script (same reason smoke.sh exists). The Playwright e2e TCs are auto-detected by aitri
# separately. Exits non-zero if either suite fails.
#
# @aitri-trace feature: aitri-v0.3.0-redesign
set -u
cd "$(dirname "$0")/.."

node --test \
  tests/unit/qa-security.test.js \
  tests/integration/redesign-regression.test.js \
  tests/integration/artifact-content.test.js \
  tests/integration/qa-endpoints.test.js
rc_node=$?

npm --prefix web test
rc_web=$?

[ "$rc_node" -eq 0 ] && [ "$rc_web" -eq 0 ]
