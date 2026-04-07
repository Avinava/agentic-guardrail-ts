# Monorepo Setup

Complete guide for setting up guardrails in a TypeScript monorepo with workspaces.

## Prerequisites

- Completed the [Getting Started](./getting-started.md) guide, OR
- Used the [setup-guardrails](../skills/setup-guardrails/SKILL.md) skill (agent-first), OR
- Run the `init.sh` script and chose **Monorepo** as the project type

## Workspace Configuration

### npm

```json
// root package.json
{
  "workspaces": ["packages/*", "apps/*"]
}
```

### pnpm

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "apps/*"
```

### yarn

```json
// root package.json
{
  "workspaces": ["packages/*", "apps/*"]
}
```

## Package Structure

Every package needs a properly configured `package.json`:

```json
{
  "name": "@your-org/shared-types",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit"
  }
}
```

And a `tsconfig.json` that extends the base:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "references": [
    { "path": "../shared-types" }
  ]
}
```

## Root package.json Scripts

```json
{
  "name": "@your-org/monorepo",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint 'packages/*/src/**/*.ts' 'apps/*/src/**/*.ts'",
    "lint:unused": "knip",
    "lint:deps": "syncpack lint",
    "lint:packages": "bash scripts/publint-all.sh",
    "lint:boundaries": "eslint --config eslint.config.js 'packages/*/src/**/*.ts'",
    "prettier:check": "prettier --check '**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,css,html,yml,yaml}'",
    "prettier:fix": "prettier --write '**/*.{ts,tsx,js,jsx,mjs,cjs,json,md,css,html,yml,yaml}'",
    "prepare": "lefthook install"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,mjs,cjs,json,md,css,html,yml,yaml}": "prettier --write"
  }
}
```

## Customizing Knip for Your Workspaces

Add one entry per package to `knip.json`:

```json
{
  "workspaces": {
    ".": {
      "entry": ["scripts/*.{js,mjs,ts}"],
      "project": ["scripts/**/*.{js,cjs,mjs,ts}"]
    },
    "packages/shared-types": {},
    "packages/config": {},
    "packages/logger": {
      "ignoreDependencies": ["pino-pretty"]
    },
    "packages/database": {},
    "apps/cli": {
      "entry": ["src/commands/**/*.ts", "bin/*.js"]
    },
    "apps/web": {
      "project": ["src/**/*.{ts,tsx,js,jsx}"],
      "ignoreDependencies": ["@emotion/react"]
    }
  }
}
```

Empty `{}` entries use Knip's auto-detection (100+ framework plugins).

## Common AI Agent Mistakes in Monorepos

| Mistake | Guardrail That Catches It |
|---------|--------------------------|
| Import from wrong tier | ESLint + boundaries |
| Unused export after refactor | Knip |
| Version mismatch in deps | Syncpack |
| Broken package.json exports | Publint |
| Inconsistent formatting | Prettier |
| console.log instead of logger | ESLint no-console |
| Floating promise | TypeScript-ESLint strict |
| Wrong commit scope | Commitlint |

## Next Steps

- [Architecture Tiers](./architecture-tiers.md) — how to design your dependency hierarchy
- [Tool Reference](./tool-reference.md) — deep dive on each tool's configuration
- [CI Pipeline](./ci-pipeline.md) — GitHub Actions setup
