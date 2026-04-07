#!/usr/bin/env bash
# Type-check only packages with staged changes — runs instances in parallel.
# Used by lefthook pre-commit hook.
set -euo pipefail

packages=$(git diff --cached --name-only --diff-filter=d \
  | grep '^packages/[^/]*/src/' | cut -d/ -f2 | sort -u)

if [ -z "$packages" ]; then exit 0; fi

pids=()
fail=0
for pkg in $packages; do
  tsconfig="packages/$pkg/tsconfig.json"
  if [ -f "$tsconfig" ]; then
    npx tsc --noEmit -p "$tsconfig" &
    pids+=($!)
  fi
done

for pid in "${pids[@]}"; do
  wait "$pid" || fail=1
done
exit $fail
