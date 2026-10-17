#!/bin/bash
# Usage: lab/test.sh <repo> <ref> [port]. With a port, `npm start -- -p <port>` runs before the browser suites. Clone, install, lint, typecheck, build, then the repo's unit and browser suites.
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
if [ -n "${3:-}" ]; then npm start -- -p "$3" > /tmp/serve.log 2>&1 & for i in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$3/" && break; sleep 1; done; fi
npm run test:browser --if-present
npm run test:e2e --if-present
