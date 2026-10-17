#!/bin/bash
# Usage: lab/test.sh <repo> <ref>. Clone, install, lint, typecheck, build, then the repo's unit and browser suites.
set -euo pipefail
git clone -q "https://github.com/royeradames/$1" app
cd app
git checkout -q "$2"
npm ci --no-audit --no-fund --loglevel=error || npm install --no-audit --no-fund --loglevel=error
npm run lint --if-present
npm run typecheck --if-present
npm run build
npx playwright install --with-deps chromium >/dev/null
npm test
npm run test:browser --if-present
npm run test:e2e --if-present
