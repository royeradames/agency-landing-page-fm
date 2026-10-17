#!/bin/bash
# Usage: lab/jsize.sh <repo> <ref>. Build with Turbopack and with webpack; report gzip/brotli bytes of module JS on /.
set -euo pipefail
git clone -q "https://github.com/royeradames/$1" app; cd app; git checkout -q "$2"
npm ci --no-audit --no-fund --loglevel=error || npm install --no-audit --no-fund --loglevel=error
measure() {
  f=.next/server/app/index.html; g=0; b=0
  for c in $(grep -o '<script[^>]*src="[^"]*"[^>]*>' $f | grep -v noModule | grep -oE '/_next/static/[^"]+\.js' | sort -u); do p=".next${c#/_next}"; g=$((g+$(gzip -9 -c $p | wc -c))); b=$((b+$(brotli -c -q 11 $p 2>/dev/null | wc -c || echo 0))); done
  echo "$1: module JS gzip $((g/1024)) KB, brotli $((b/1024)) KB, chunks: $(grep -o '<script[^>]*src="[^"]*"[^>]*>' $f | grep -v noModule | wc -l)"
}
npx next build >/dev/null 2>&1 && measure turbopack
rm -rf .next; npx next build --webpack >/dev/null 2>&1 && measure webpack
