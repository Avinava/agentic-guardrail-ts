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
- ESLint + TypeScript strict + import ordering (code quality)
- Gitleaks (secret scanning — prevents hardcoded API keys)
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

### 1e. Assess existing codebase health

**⚠ IMPORTANT: Do this BEFORE generating any configs.**

Run a quick health check to classify this as greenfield or retrofit:

1. Check for existing lint configs (`.eslintrc*`, `eslint.config.*`, `.prettierrc*`)
2. Check for existing TypeScript config strictness — is `strict: true` present?
3. If an ESLint config exists, run: `npx eslint 'src/**/*.ts' --no-error-on-unmatched-pattern 2>&1 | tail -5`
4. Count type-safety escapes: `grep -r '@ts-ignore\|@ts-expect-error' src/ | wc -l`

**Classification:**
- **Greenfield:** No existing lint config, or existing config with <10 violations → proceed normally (all rules at `error`)
- **Retrofit:** Existing codebase with >10 violations or non-strict TypeScript → use Wave mode

**If retrofit, WARN the user before proceeding:**

> "This is an existing codebase with [N] lint violations and [M] type issues.
> I'll install guardrails in **Wave mode** — rules start at `warn` so your
> existing workflow isn't disrupted. You'll then drive each rule category to
> zero violations via focused refactoring, and flip warn→error one category
> at a time.
>
> **What to expect:**
> - Pre-commit hooks will run but won't block commits initially (warnings, not errors)
> - A warning budget header in `eslint.config.js` tracks progress toward zero
> - Each rule category gets its own cleanup wave
> - Total adoption timeline: days to weeks depending on codebase size
>
> **The key principle: Tools become gates only when their baseline is exit-0.**
> A rule moves to `error` only when you have zero violations. Never use
> `--max-warnings=N` — it decays over time and erodes trust in the tool."

**Get user confirmation** before generating configs. They should understand:
- This is a progressive adoption, not a big-bang flip
- Some rules (formatting, import ordering) can be auto-fixed immediately
- Others (type safety, architecture boundaries) require manual refactoring

**If retrofit mode:** When generating `eslint.config.js` in Step 4, set these rules to `warn` instead of `error`:
- `import-x/default`, `import-x/named`
- `@typescript-eslint/no-non-null-assertion`
- `@typescript-eslint/consistent-type-assertions`
- `no-restricted-syntax` (double-cast)
- `boundaries/dependencies` (if monorepo)

Rules that ALWAYS start at `error` even on retrofit (they're auto-fixable):
- `import-x/order`, `import-x/no-duplicates`, `no-console`

Add a **warning budget header** at the top of `eslint.config.js`:

```js
// ── WARNING BUDGET (retrofit mode) ──────────────────────────
// These rules are at 'warn' until the violation count reaches 0.
// Drive each to zero, then flip to 'error' in the same commit.
//
// Rule                               Count   Target
// import-x/default                   12      Wave 1
// import-x/named                     3       Wave 1
// no-non-null-assertion              47      Wave 2
// consistent-type-assertions         8       Wave 2
// boundaries/dependencies            22      Wave 3
//
// Last audited: YYYY-MM-DD
// ─────────────────────────────────────────────────────────────
```

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
*.min.css
.turbo/
# Add auto-generated or column-aligned files below (see docs/known-conflicts.md):
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

    - name: secrets
      run: npx gitleaks@latest detect --staged --no-banner

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

    - name: secrets
      run: npx gitleaks@latest detect --staged --no-banner

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
import importX from 'eslint-plugin-import-x';
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

  // Import organization: builtins → external → internal → relative
  {
    files: ['src/**/*.ts'],
    plugins: { 'import-x': importX },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',
      // Catches stale default/named import shapes — ESM rejects these at runtime
      'import-x/default': 'error',
      'import-x/named': 'error',
    },
  },

  // Runtime safety — prevent type lies that bypass the compiler
  {
    files: ['src/**/*.ts'],
    rules: {
      // Prevent ! operator — lies to the compiler about nullability
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Prevent {} as Foo shortcuts — use proper construction instead
      '@typescript-eslint/consistent-type-assertions': ['error', {
        assertionStyle: 'as',
        objectLiteralTypeAssertions: 'never',
      }],
      // Prevent double-cast (as unknown as T) — bypasses the type system entirely
      'no-restricted-syntax': ['error',
        {
          selector: 'TSAsExpression > TSAsExpression',
          message: 'Double type assertion bypasses the type system. Narrow properly or add an eslint-disable with a paper trail.',
        },
      ],
    },
  },

  // Ban console.log
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
import importX from 'eslint-plugin-import-x';
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

  // ── Import organization ──
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    plugins: { 'import-x': importX },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',
      // Catches stale default/named import shapes — ESM rejects these at runtime
      'import-x/default': 'error',
      'import-x/named': 'error',
    },
  },

  // ── Runtime safety — prevent type lies that bypass the compiler ──
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', {
        assertionStyle: 'as',
        objectLiteralTypeAssertions: 'never',
      }],
      'no-restricted-syntax': ['error',
        {
          selector: 'TSAsExpression > TSAsExpression',
          message: 'Double type assertion bypasses the type system. Narrow properly or add an eslint-disable with a paper trail.',
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

### TypeScript Configuration

> **ASK THE USER:** "Does this project use TypeScript `enum` or `namespace` keywords?"
> - If **NO** (recommended): include `"erasableSyntaxOnly": true` — prepares the project for native Node.js TS execution (type stripping)
> - If **YES**: omit `erasableSyntaxOnly` — enums/namespaces require transpilation and are incompatible with type stripping

**`tsconfig.base.json`** (monorepo only):

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
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "incremental": true,
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
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "incremental": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

**New flags explained:**
- `isolatedModules` — ensures each file can be compiled independently (required for esbuild/swc compatibility)
- `erasableSyntaxOnly` — errors on enums/namespaces/parameter properties, enabling native Node.js TS execution
- `incremental` — caches type-check results for faster rebuilds

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
npm install -D lefthook prettier lint-staged eslint typescript vitest knip @commitlint/cli @commitlint/config-conventional typescript-eslint eslint-config-prettier eslint-plugin-import-x publint
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

**Greenfield success criteria:**
- All checks pass with zero warnings and zero errors
- The commit succeeds — setup is complete

**Retrofit success criteria:**
- Pre-commit hooks run without errors (warnings are expected and tracked)
- Warning budget header in `eslint.config.js` is accurate and honest
- No rule was force-flipped to `error` at a non-zero baseline
- Auto-fixable rules (formatting, import ordering) are already at `error`
- User understands the wave sequencing plan (see below)

If the commit fails, read the errors and fix them — **this is the self-correcting loop in action.**

---

## Verification Checklist

- [ ] `lefthook.yml` exists with secrets job and `npx lefthook install` succeeded
- [ ] `eslint.config.js` exists with import ordering, runtime safety rules, and correct config for project type
- [ ] `.prettierrc` exists
- [ ] `commitlint.config.ts` exists with actual package scopes
- [ ] `vitest.config.ts` exists
- [ ] `tsconfig` includes `isolatedModules`, `incremental`, and optionally `erasableSyntaxOnly`
- [ ] `git commit --allow-empty` passes without hook errors
- [ ] Lockfile updated with new devDependencies (including `eslint-plugin-import-x`)
- [ ] For monorepo: `tsconfig.base.json`, `knip.json`, `.syncpackrc.json`, `turbo.json` exist
- [ ] For monorepo: `scripts/typecheck-staged.sh` exists and is executable
- [ ] For retrofit: warning budget header present and honest; no rule at `error` with non-zero violations

## User Confirmation Summary

During setup, you should have asked the user about:
1. **Org scope** (Step 1c) — if not auto-detected in a monorepo
2. **Greenfield or retrofit** (Step 1e) — determines rule severity strategy
3. **Tier assignments** (Step 4) — how to classify packages for architecture enforcement
4. **Enum usage** (Step 4, TypeScript config) — whether to enable `erasableSyntaxOnly`
5. **Existing configs** — any file that already exists should be flagged, not silently overwritten
6. **npm scripts** (Step 8) — existing scripts should be preserved unless user confirms overwrite

If you skipped any of these, go back and ask now.

---

## Wave Sequencing (Retrofit Projects)

After initial setup in retrofit mode, drive each rule category to zero violations one wave at a time. Do NOT mix waves — complete one before starting the next.

### Wave 1: Auto-fixable rules (usually same-day)
- `import-x/order` → run `npx eslint --fix` → already at error
- `import-x/no-duplicates` → run `npx eslint --fix` → already at error
- Prettier issues → run `npx prettier --write .` → already enforced
- Update the warning budget header with post-fix counts

### Wave 2: Import correctness (1–3 days)
- `import-x/default` + `import-x/named` → fix each import mismatch manually
- Common fix: change `import Foo from './bar'` to `import { Foo } from './bar'`
- For React.lazy consumers: use `.then((m) => ({ default: m.NamedExport }))`
- When count reaches 0 → flip to `error` in the same commit
- Commit message: `refactor(lint): flip import-x/default warn→error (0 violations)`

### Wave 3: Type safety (3–7 days)
- `no-non-null-assertion` → replace `!` with proper null checks (`if`, `??`, optional chaining)
- `consistent-type-assertions` → replace `{} as Foo` with proper construction or factory functions
- `no-restricted-syntax` (double-cast) → narrow types properly instead of `as unknown as T`
- When count reaches 0 → flip to `error`

### Wave 4: Architecture boundaries (1–2 weeks, monorepo only)
- `boundaries/dependencies` → refactor cross-tier imports
- Move shared code to lower-tier packages
- Use dependency injection where direct import is impossible
- When count reaches 0 → flip to `error`

### After each wave
1. Update the warning budget header with the new counts
2. Commit the rule flip with a clear message
3. The pre-commit hook now enforces the rule — no regression possible
4. Move to the next wave

See [reference/retrofit-rollout.md](../../reference/retrofit-rollout.md) for a complete worked example.

## Related Skills

- **enforce-architecture** — Understanding and working within the tiered dependency rules
- **self-correcting-loop** — How to handle commit rejections efficiently
- **adding-a-package** — Adding a new workspace package (monorepo)
