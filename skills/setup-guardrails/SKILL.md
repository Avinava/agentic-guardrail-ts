---
name: setup-guardrails
description: >
  Set up a self-correcting guardrail stack in any TypeScript project.
  Detects project type, generates all configs inline, installs dependencies,
  and configures pre-commit hooks. No cloning or template copying required.
---

## Overview

Install a self-correcting guardrail stack into a TypeScript project. After setup, every `git commit` runs quality checks in parallel (~3s) and rejects bad code. You (the agent) see the errors, fix them, and retry.

**What this skill installs:**
- Lefthook (parallel pre-commit hooks)
- Prettier + lint-staged (auto-formatting)
- ESLint + TypeScript strict (code quality)
- Commitlint (conventional commits)
- Vitest (test runner)
- Knip (dead code detection)
- ESLint boundaries plugin (architecture enforcement — monorepo only)
- Syncpack (dependency version consistency — monorepo only)
- Turborepo (cached parallel builds — monorepo only)

**What this skill does NOT do:**
- It does NOT create agent instruction files (CLAUDE.md, GEMINI.md, etc.)
- It does NOT copy template files — all configs are generated based on YOUR project

## Prerequisites

- Node.js 20+ installed
- A TypeScript project with a `package.json`
- Git initialized (`git init`)

---

## Step 1: Analyze the Target Project

Read the project's `package.json` and file system to detect:

### 1a. Project type

**Monorepo** if ANY of these are true:
- `workspaces` field exists in `package.json`
- `turbo.json` exists at root
- `packages/` or `apps/` directory exists

**Single package** otherwise.

### 1b. Package manager

Check which lockfile exists:
- `pnpm-lock.yaml` → pnpm (use `pnpm add -D`)
- `yarn.lock` → yarn (use `yarn add -D`)
- `package-lock.json` or none → npm (use `npm install -D`)

### 1c. Org scope

Look at the `name` field in `package.json`:
- If it starts with `@something/`, the org scope is `@something`
- If no scope detected and this is a monorepo, ask the user
- If single package with no scope, use `@myorg` as a fallback (only matters if they add workspaces later)

### 1d. Existing packages (monorepo only)

List the directories under `packages/` and `apps/`. These become the tier assignments in ESLint config. Ask the user how to classify them (see Step 4).

---

## Step 2: Write Foundation Configs

Create these files in the project root. **Skip any file that already exists** — warn the user instead.

### `.editorconfig`
```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[{Makefile,*.mk}]
indent_style = tab
```

### `.nvmrc`
```
22
```

### `.prettierrc`
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### `.prettierignore`
```
dist
node_modules
coverage
*.min.js
```

---

## Step 3: Write Pre-Commit Hook Config

### `lefthook.yml`

**For single-package projects:**
```yaml
pre-commit:
  parallel: true
  jobs:
    - name: prettier
      run: npx lint-staged

    - name: lint-unused
      run: npx knip

    - name: lint
      glob: "*.{ts,tsx}"
      run: npx eslint {staged_files}

    - name: typecheck
      run: npx tsc --noEmit

    - name: test-related
      glob: "src/**/*.ts"
      run: npx vitest related {staged_files} --run --passWithNoTests

commit-msg:
  jobs:
    - name: commitlint
      run: npx commitlint --edit {1}
```

**For monorepo projects:**
```yaml
pre-commit:
  parallel: true
  jobs:
    - name: prettier
      run: npx lint-staged

    - name: lint-unused
      run: npx knip

    - name: lint-deps
      run: npx syncpack lint

    - name: lint
      glob: "*.{ts,tsx}"
      run: npx eslint {staged_files}

    - name: typecheck
      glob: "packages/*/src/**/*.ts"
      run: bash scripts/typecheck-staged.sh

    - name: test-related
      glob: "packages/*/src/**/*.ts"
      run: npx vitest related {staged_files} --run --passWithNoTests

commit-msg:
  jobs:
    - name: commitlint
      run: npx commitlint --edit {1}
```

### `commitlint.config.ts`

Generate the scope list from the actual packages detected in Step 1d:

```typescript
import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', [
      // ← INSERT actual package names detected from packages/ and apps/
      'deps',
      'ci',
      'release',
    ]],
    'scope-empty': [1, 'never'],
    'body-max-line-length': [0, 'always', Infinity],
  },
};

export default config;
```

---

## Step 4: Write Linting & Type-Checking Configs

### `eslint.config.js`

**For single-package projects** (no architecture boundaries):

```javascript
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },

  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },

  {
    files: ['src/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-console': 'error',
    },
  },

  eslintConfigPrettier,
);
```

**For monorepo projects** (with architecture boundary enforcement):

Generate the tier arrays from the actual packages detected in Step 1d. Ask the user to classify each package into a tier:

- **Tier 0 (leaf):** No workspace dependencies (types, logger, constants)
- **Tier 1:** Only depends on tier 0 (config, helpers, utilities)
- **Tier 2:** Wraps external services (database, API clients)
- **Tier 3:** Business/domain logic
- **Tier 4:** Orchestration (wires together multiple domain + infra packages)
- **App tier:** Deployable applications (no restrictions)

```javascript
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import eslintConfigPrettier from 'eslint-config-prettier';

// ── Replace with actual scope and packages ──
const SCOPE = 'DETECTED_SCOPE';  // ← from Step 1c

const tier0 = [/* actual tier 0 package names */];
const tier1 = [/* actual tier 1 package names */];
const tier2 = [/* actual tier 2 package names */];
const tier3 = [/* actual tier 3 package names */];
const tier4 = [/* actual tier 4 package names */];

const modules = (names) => names.map((n) => `${SCOPE}/${n}`);

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },

  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true },
    },
  },

  // ── Architecture boundaries ──
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    ignores: ['**/__tests__/**', '**/__mocks__/**'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        // ← Generate one entry per package:
        // { type: 'pkg-name', pattern: ['packages/pkg-name/*'], mode: 'folder' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          rules: [
            // Tier 0: no workspace imports
            {
              from: { type: tier0 },
              disallow: { dependency: { module: `${SCOPE}/*` } },
            },
            // Tier 1: only tier 0
            {
              from: { type: tier1 },
              disallow: {
                dependency: {
                  module: modules([...tier1, ...tier2, ...tier3, ...tier4]),
                },
              },
            },
            // Tier 2: only tier 0-1
            {
              from: { type: tier2 },
              disallow: {
                dependency: {
                  module: modules([...tier2, ...tier3, ...tier4]),
                },
              },
            },
            // Tier 3: only tier 0-2
            {
              from: { type: tier3 },
              disallow: {
                dependency: {
                  module: modules([...tier3, ...tier4]),
                },
              },
            },
            // Tier 4: only tier 0-3
            {
              from: { type: tier4 },
              disallow: {
                dependency: { module: modules([...tier4]) },
              },
            },
          ],
        },
      ],
    },
  },

  // ── Ban console.log ──
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['**/logger/src/**', '**/__tests__/**'],
    rules: { 'no-console': 'error' },
  },

  eslintConfigPrettier,
);
```

### `tsconfig.base.json` (monorepo only)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "exclude": ["node_modules", "**/dist/**"]
}
```

For single-package projects, write a `tsconfig.json` instead (with `outDir` and `rootDir`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

If a `tsconfig.json` already exists, do NOT overwrite it. Only create `tsconfig.base.json` for monorepos if it doesn't exist.

---

## Step 5: Write Code Health Configs (Monorepo Only)

Skip this entire step for single-package projects.

### `knip.json`

Generate workspace entries from the actual packages detected in Step 1d:

```json
{
  "workspaces": {
    "packages/*": {
      "entry": ["src/index.ts"],
      "project": ["src/**/*.ts"]
    }
  }
}
```

### `.syncpackrc.json`

Use the detected org scope from Step 1c:

```json
{
  "semverGroups": [
    {
      "label": "Internal workspace packages use exact versions",
      "packages": ["DETECTED_SCOPE/**"],
      "dependencies": ["DETECTED_SCOPE/**"],
      "dependencyTypes": ["prod", "dev"],
      "pinVersion": "*"
    }
  ],
  "versionGroups": [
    {
      "label": "All third-party deps should use the same version",
      "packages": ["**"],
      "dependencies": ["**"],
      "dependencyTypes": ["prod", "dev"]
    }
  ]
}
```

Replace `DETECTED_SCOPE` with the actual scope. For pnpm/yarn, change `"pinVersion": "*"` to `"pinVersion": "workspace:*"`.

### `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "lint": {
      "dependsOn": [],
      "outputs": []
    }
  }
}
```

---

## Step 6: Write Test Config

### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
```

For monorepos, update the `include` pattern:
```typescript
include: ['packages/*/src/**/*.test.ts'],
```

---

## Step 7: Write Helper Scripts (Monorepo Only)

Skip this step for single-package projects.

### `scripts/typecheck-staged.sh`

```bash
#!/usr/bin/env bash
# Type-check only the packages that have staged changes.
set -euo pipefail

STAGED=$(git diff --cached --name-only --diff-filter=d | grep -oP 'packages/[^/]+' | sort -u)
if [ -z "$STAGED" ]; then
  echo "No packages with staged changes — skipping typecheck."
  exit 0
fi

for pkg in $STAGED; do
  if [ -f "$pkg/tsconfig.json" ]; then
    echo "Type-checking $pkg..."
    npx tsc -b "$pkg" --noEmit
  fi
done
```

Make it executable: `chmod +x scripts/typecheck-staged.sh`

### `scripts/publint-all.sh`

```bash
#!/usr/bin/env bash
# Run publint against every workspace package that has a dist/ folder.
set -euo pipefail

EXIT_CODE=0
for pkg in packages/*/; do
  if [ -d "$pkg/dist" ]; then
    echo "publint: $pkg"
    npx publint "$pkg" || EXIT_CODE=1
  fi
done

exit $EXIT_CODE
```

Make it executable: `chmod +x scripts/publint-all.sh`

---

## Step 8: Update package.json

### 8a. Add lint-staged config

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,mjs,cjs,json,md,css,html,yml,yaml}": "prettier --write"
  }
}
```

### 8b. Add npm scripts

**Single package:**
```json
{
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint 'src/**/*.ts'",
    "lint:unused": "knip",
    "prettier:check": "prettier --check '**/*.{ts,js,json,md,yml}'",
    "prettier:fix": "prettier --write '**/*.{ts,js,json,md,yml}'",
    "prepare": "lefthook install"
  }
}
```

**Monorepo:**
```json
{
  "scripts": {
    "build": "turbo run build",
    "typecheck": "turbo run typecheck",
    "test": "vitest run",
    "lint": "eslint 'packages/*/src/**/*.ts'",
    "lint:unused": "knip",
    "lint:deps": "syncpack lint",
    "lint:packages": "bash scripts/publint-all.sh",
    "prettier:check": "prettier --check '**/*.{ts,js,json,md,yml}'",
    "prettier:fix": "prettier --write '**/*.{ts,js,json,md,yml}'",
    "prepare": "lefthook install"
  }
}
```

Merge with existing scripts — do NOT overwrite scripts that already exist unless the user confirms.

---

## Step 9: Install devDependencies

### All projects:
```bash
npm install -D lefthook prettier lint-staged eslint typescript vitest knip @commitlint/cli @commitlint/config-conventional typescript-eslint eslint-config-prettier publint
```

### Monorepo only — add these:
```bash
npm install -D eslint-plugin-boundaries syncpack turbo
```

Adapt for detected package manager:
- pnpm: `pnpm add -D ...`
- yarn: `yarn add -D ...`

---

## Step 10: Initialize Git Hooks

```bash
npx lefthook install
```

This creates `.git/hooks/` symlinks that make pre-commit checks fire automatically.

---

## Step 11: Merge or Create `.gitignore`

If `.gitignore` exists, append any missing entries. If it doesn't exist, create it:

```
node_modules/
dist/
coverage/
*.tsbuildinfo
.turbo/
.env
.env.local
```

---

## Step 12: Verify Setup

Run a verification commit:

```bash
git add -A
git commit --allow-empty -m "chore: verify guardrail setup"
```

If the commit succeeds, setup is complete. If it fails, read the errors and fix them — **this is the self-correcting loop in action.**

---

## Verification Checklist

- [ ] `lefthook.yml` exists and `npx lefthook install` succeeded
- [ ] `eslint.config.js` exists with correct config for project type
- [ ] `.prettierrc` exists
- [ ] `commitlint.config.ts` exists with actual package scopes
- [ ] `vitest.config.ts` exists
- [ ] `git commit --allow-empty` passes without hook errors
- [ ] Lockfile updated with new devDependencies
- [ ] For monorepo: `tsconfig.base.json`, `knip.json`, `.syncpackrc.json`, `turbo.json` exist
- [ ] For monorepo: `scripts/typecheck-staged.sh` exists and is executable

## Related Skills

- **enforce-architecture** — Understanding and working within the tiered dependency rules
- **self-correcting-loop** — How to handle commit rejections efficiently
- **adding-a-package** — Adding a new workspace package (monorepo)
