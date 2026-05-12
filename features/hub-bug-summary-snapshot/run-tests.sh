#!/usr/bin/env bash
set -euo pipefail

node --test tests/bug-summary-snapshot.test.js

cd ../..
npx playwright test tests/e2e/bug-summary-snapshot.test.js
