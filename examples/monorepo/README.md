# Monorepo Example

A 3-package TypeScript monorepo demonstrating architecture tier enforcement.

## Package Tiers

```
packages/
├── shared-types/    ← Tier 0 (no workspace deps)
├── helpers/         ← Tier 1 (can import shared-types)
└── domain-logic/    ← Tier 2 (can import shared-types + helpers)
```

## Try It

```bash
# Copy this example
cp -r examples/monorepo /tmp/my-mono-test
cd /tmp/my-mono-test

# Install
npm install
npx lefthook install

# Build
npm run build

# Try an illegal import (domain-logic importing from itself or higher tier)
# Add to packages/helpers/src/index.ts:
#   import { process } from '@example/domain-logic';
# Then: git add . && git commit -m "test: verify boundaries"
# → REJECTED by ESLint boundaries plugin
```

## Key Files

- `eslint.config.js` — Architecture boundaries defining which tiers can import what
- `knip.json` — Workspace entries for each package
- `turbo.json` — Build orchestration with caching
- `lefthook.yml` — Pre-commit hooks
