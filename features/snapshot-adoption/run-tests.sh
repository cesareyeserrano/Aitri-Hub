#!/bin/sh
# Test runner for snapshot-adoption verify-run.
# Combines unit + integration (node --test) with E2E (Playwright).
set -e
cd "$(dirname "$0")/../.."
node --test tests/unit/snapshot-reader.test.js tests/integration/snapshot-fallback.test.js
npx playwright test tests/e2e/snapshot-card.test.js
