#!/usr/bin/env bash
# Validate all packages with publint — auto-discovers workspace packages.
# Publint checks that package.json exports/main/types point to real files.
set -euo pipefail
fail=0
for pkg in packages/*/; do
  if [ -f "$pkg/package.json" ]; then
    echo "Checking $pkg..."
    npx publint "$pkg" || fail=1
  fi
done
exit $fail
