---
name: adding-a-package
description: Use when creating a new workspace package in a monorepo. Covers package creation, tier assignment, and all config updates required.
---

## Overview

Adding a new package to a monorepo guarded by this stack requires updating **5 config files** in addition to creating the package itself. Skip any of these and the pre-commit hooks will catch it — but it's faster to do it right the first time.

## Step 1: Create Package Directory

```
packages/new-pkg/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

### `package.json`
```json
{
  "name": "@acme/new-pkg",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

Replace `@acme` with your org scope and `new-pkg` with the actual package name.

### `tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["dist"]
}
```

### `src/index.ts`
```typescript
// @acme/new-pkg — entry point
export {};
```

## Step 2: Assign to Architecture Tier

Decide which tier this package belongs to:

| Tier | Contains | Can Import |
|------|----------|-----------|
| 0 | Pure types, logger, constants | Nothing (leaf) |
| 1 | Config, helpers, utilities | Tier 0 |
| 2 | Database, external APIs, queues | Tier 0-1 |
| 3 | Domain logic, business rules | Tier 0-2 |
| 4 | Orchestration, wiring | Tier 0-3 |
| App | CLI, web server, workers | Anything |

If unsure, ask the user. Getting the tier right now prevents painful refactoring later.

## Step 3: Update `eslint.config.js`

Two changes required:

### 3a: Add to tier array
```javascript
// Before:
const tier2 = ['database', 'external-api'];

// After (if new-pkg is tier 2):
const tier2 = ['database', 'external-api', 'new-pkg'];
```

### 3b: Add to boundaries/elements
```javascript
settings: {
  'boundaries/elements': [
    // ... existing entries ...
    // Add:
    { type: 'new-pkg', pattern: ['packages/new-pkg/*'], mode: 'folder' },
  ],
},
```

## Step 4: Update `knip.json`

Add the new package to the workspaces entry list:

```json
{
  "workspaces": {
    "packages/new-pkg": {
      "entry": ["src/index.ts"],
      "project": ["src/**/*.ts"]
    }
  }
}
```

## Step 5: Update `commitlint.config.ts`

Add the package name to the allowed scopes:

```typescript
// Find the scope-enum rule and add 'new-pkg':
rules: {
  'scope-enum': [2, 'always', [
    // ... existing scopes ...
    'new-pkg',          // ← add
  ]],
}
```

## Step 6: Add as Dependency (if needed)

If other packages will import from this new package, add it as a dependency:

```json
// In the consuming package's package.json:
{
  "dependencies": {
    "@acme/new-pkg": "workspace:*"
  }
}
```

For npm (without workspaces protocol), use `"*"` instead of `"workspace:*"`.

Then add a TypeScript project reference in the consuming package's `tsconfig.json`:

```json
{
  "references": [
    { "path": "../new-pkg" }
  ]
}
```

## Step 7: Verify

```bash
git add -A
git commit -m "feat(new-pkg): scaffold new package"
```

The pre-commit hooks will verify:
- Knip: no unused exports (empty index.ts is fine)
- ESLint: boundary rules are satisfied
- TypeScript: compiles cleanly
- Commitlint: scope is valid

If the commit fails, read the errors and fix them.

## Checklist

- [ ] Package directory created with `package.json`, `tsconfig.json`, `src/index.ts`
- [ ] Tier assigned and documented
- [ ] `eslint.config.js` updated (tier array + boundaries/elements)
- [ ] `knip.json` updated with workspace entry
- [ ] `commitlint.config.ts` updated with new scope
- [ ] Dependencies wired in consuming packages (if applicable)
- [ ] Commit succeeds with pre-commit hooks

## Related Skills

- **enforce-architecture** — Understanding the tier system
- **self-correcting-loop** — Handling commit rejections
