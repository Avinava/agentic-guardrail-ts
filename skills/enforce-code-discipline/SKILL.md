---
name: enforce-code-discipline
description: >
  Extend an existing guardrail installation with LLM discipline rules:
  complexity limits, cognitive complexity, naming conventions, ESM idioms,
  documentation coverage, and test coverage thresholds.
  Run after setup-guardrails.
---

## Overview

Extend your TypeScript project's guardrail stack with a discipline layer that
forces LLMs to write code that is architecturally correct, consistent, and
easy to maintain.

**What this skill adds:**
- Complexity & size limits (`max-lines`, `max-lines-per-function`, `max-params`, `max-depth`)
- Code quality checks (cognitive complexity, duplicate code, dead branches)
- Naming conventions (camelCase / PascalCase / UPPER_CASE enforcement)
- ESM idioms (unicorn plugin — `no-array-for-each`, `filename-case`, etc.)
- Documentation coverage for public APIs (jsdoc — always wave-gated)
- Test coverage thresholds (hard gates in Vitest)

**Prerequisites:** `setup-guardrails` skill already applied to this project.
`eslint.config.js` and `vitest.config.ts` must exist at the project root.

---

## Step 1: Detect Project Context

Read these files:

- `package.json` — detect package manager (lockfile: `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm)
- `eslint.config.js` — verify guardrails are installed; identify whether this is single-package or monorepo (monorepo configs have a `boundaries` plugin import)
- `vitest.config.ts` — read current test config to know what to preserve

### 1a. Detect project type

**Monorepo** if `eslint.config.js` imports `eslint-plugin-boundaries` OR `packages/` directory exists.
**Single package** otherwise.

### 1b. Assess greenfield vs retrofit

Run:
```bash
npx eslint 'src/**/*.ts' --no-error-on-unmatched-pattern 2>&1 | tail -10
```

For monorepos:
```bash
npx eslint 'packages/*/src/**/*.ts' --no-error-on-unmatched-pattern 2>&1 | tail -10
```

- **Greenfield (<10 violations):** new rules at `error` (except jsdoc — always `warn`)
- **Retrofit (≥10 violations):** new rules at `warn` with a warning budget header

### 1c. Detect existing `src/` structure

Run:
```bash
ls src/ 2>/dev/null || echo "(no src/ directory)"
```

For monorepos:
```bash
ls packages/ 2>/dev/null
```

Note the top-level directory names — you will list them in a comment block in the ESLint config.

---

## Step 2: Install Plugins

```bash
npm install -D eslint-plugin-unicorn eslint-plugin-sonarjs eslint-plugin-jsdoc
```

Adapt for detected package manager:
- pnpm: `pnpm add -D eslint-plugin-unicorn eslint-plugin-sonarjs eslint-plugin-jsdoc`
- yarn: `yarn add -D eslint-plugin-unicorn eslint-plugin-sonarjs eslint-plugin-jsdoc`

---

## Step 3: Add Imports to `eslint.config.js`

**Do NOT rewrite the file.** Open `eslint.config.js` and add these three imports after the existing import statements, before the `export default` line:

```js
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
import jsdoc from 'eslint-plugin-jsdoc';
```

---

## Step 4: Append Discipline Block to `eslint.config.js`

Find the `eslintConfigPrettier` entry at the bottom of the `tseslint.config(...)` call.
Insert the discipline blocks **before** `eslintConfigPrettier` (it must always be last).

First, add the detected structure comment. Replace `[detected dirs]` with the actual
directory names from Step 1c:

```js
  // ── Project structure (detected) ─────────────────────────────
  // src/[detected dirs]
  // ─────────────────────────────────────────────────────────────
  // To enforce structure beyond naming conventions, use the
  // enforce-architecture skill.
```

Then append the discipline config blocks.

### Greenfield mode (all `error` except jsdoc)

**For single-package projects** (file glob: `src/**/*.ts`):

```js
  // ── Complexity & size limits ──────────────────────────────────
  {
    files: ['src/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', { max: 4 }],
      'max-depth': ['error', { max: 4 }],
      'max-classes-per-file': ['error', { max: 1 }],
      'no-magic-numbers': ['error', { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true, ignoreDefaultValues: true }],
      'no-nested-ternary': 'error',
    },
  },

  // ── Code quality (sonarjs) ────────────────────────────────────
  {
    files: ['src/**/*.ts'],
    plugins: { sonarjs },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-gratuitous-expressions': 'error',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/prefer-immediate-return': 'error',
    },
  },

  // ── Naming conventions ────────────────────────────────────────
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'parameter', format: ['camelCase'] },
        { selector: 'property', format: ['camelCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
      ],
    },
  },

  // ── ESM idioms (unicorn — selective) ─────────────────────────
  {
    files: ['src/**/*.ts'],
    plugins: { unicorn },
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'unicorn/no-array-for-each': 'error',
      'unicorn/no-for-loop': 'error',
      'unicorn/explicit-length-check': 'error',
      'unicorn/no-useless-undefined': 'error',
      'unicorn/no-array-push-push': 'error',
      'unicorn/no-lonely-if': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/no-process-exit': 'error',
      'unicorn/prefer-module': 'error',
    },
  },

  // ── Documentation (always warn — drive to zero, then flip to error) ──
  {
    files: ['src/**/*.ts'],
    ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': ['warn', {
        publicOnly: true,
        require: { FunctionDeclaration: true, ClassDeclaration: true },
      }],
      'jsdoc/require-param': 'warn',
      'jsdoc/require-returns': 'warn',
      'jsdoc/check-param-names': 'warn',
    },
  },
```

**For monorepo projects** (file glob: `packages/*/src/**/*.ts, apps/*/src/**/*.ts`):

Use the same blocks above but replace every `'src/**/*.ts'` glob with
`['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts']`.

### Retrofit mode (all `warn` + warning budget header)

Add this header comment immediately after the structure comment block:

```js
  // ── DISCIPLINE WARNING BUDGET (retrofit mode) ─────────────────
  // These rules are at 'warn' until the violation count reaches 0.
  // Drive each to zero, then flip to 'error' in the same commit.
  //
  // Rule                               Count   Target
  // unicorn/no-lonely-if                ?      Wave 1
  // unicorn/no-array-push-push          ?      Wave 1
  // unicorn/prefer-string-slice         ?      Wave 1
  // sonarjs/prefer-immediate-return     ?      Wave 1
  // sonarjs/no-redundant-jump           ?      Wave 1
  // sonarjs/cognitive-complexity        ?      Wave 2
  // max-lines                           ?      Wave 2
  // max-lines-per-function              ?      Wave 2
  // max-depth                           ?      Wave 2
  // naming-convention                   ?      Wave 3
  // sonarjs/no-duplicate-string         ?      Wave 3
  // no-magic-numbers                    ?      Wave 3
  // jsdoc/*                             ?      Wave 4
  //
  // Last audited: YYYY-MM-DD
  // ─────────────────────────────────────────────────────────────
```

Replace the `?` values by running `npx eslint 'src/**/*.ts' --rule '{"rule-name": "warn"}' 2>&1 | grep -c 'warning'`
for each rule, or by running the full lint pass after appending the config at `warn` and counting warnings.

Then use `'warn'` instead of `'error'` in all five discipline blocks above
(jsdoc stays `'warn'` regardless).

---

## Step 5: Update `vitest.config.ts`

Open `vitest.config.ts`. Find the `coverage` block and add `thresholds`:

### Greenfield — set hard thresholds:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
      },
    },
  },
});
```

For monorepos, `include` should be `['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts']`.

### Retrofit — set thresholds at current baseline:

First run `npx vitest run --coverage 2>&1 | grep -E 'Lines|Branches|Functions|Statements'` to
get current coverage numbers. Use those values as the thresholds with a comment:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov'],
  thresholds: {
    // Baseline detected YYYY-MM-DD — ratchet these up as you add tests
    lines: 52,      // ← replace with actual detected value
    branches: 44,   // ← replace with actual detected value
    functions: 58,  // ← replace with actual detected value
    statements: 52, // ← replace with actual detected value
  },
},
```

---

## Step 6: Verify Setup

```bash
git add -A
git commit --allow-empty -m "chore: verify enforce-code-discipline setup"
```

**Greenfield success criteria:**
- Commit passes all hooks
- No errors from the new discipline rules (zero violations in a fresh project)

**Retrofit success criteria:**
- Pre-commit hooks run without hooks errors (warnings expected and tracked)
- Warning budget header is present and the `?` values have been filled in
- Coverage thresholds are set to actual baseline values

If the empty commit fails, read the errors — they indicate a misconfigured ESLint block
(likely a missing import or a syntax error in the appended config). Fix and retry.

---

## Wave Sequencing (Retrofit Only)

Drive each rule category to zero violations one wave at a time. Do NOT mix waves.

### Wave 1 — auto-fixable (same day)
Run `npx eslint --fix 'src/**/*.ts'` to auto-fix:
- `unicorn/no-lonely-if`
- `unicorn/no-array-push-push`
- `unicorn/prefer-string-slice`
- `sonarjs/prefer-immediate-return`
- `sonarjs/no-redundant-jump`

When count reaches 0 → flip to `error`. Commit: `refactor(lint): flip [rule] warn→error (0 violations)`

### Wave 2 — complexity (1–3 days)
Manually refactor:
- `sonarjs/cognitive-complexity` — break up nested logic into named helper functions
- `max-lines` — split large files at their natural boundaries (one class/one domain concept per file)
- `max-lines-per-function` — extract private helper functions
- `max-depth` — use early returns and guard clauses to reduce nesting

When each reaches 0 → flip to `error`.

### Wave 3 — naming & literals (3–7 days)
- `naming-convention` — rename variables, run `npx eslint --fix` for auto-fixable renames
- `sonarjs/no-duplicate-string` — extract repeated strings to named constants
- `no-magic-numbers` — replace raw numbers with named constants

When each reaches 0 → flip to `error`.

### Wave 4 — documentation (1–2 weeks)
- `jsdoc/require-jsdoc` — add JSDoc to all exported functions and classes
- `jsdoc/require-param` — document all parameters
- `jsdoc/require-returns` — document return values
- `jsdoc/check-param-names` — fix param name mismatches

When all jsdoc rules reach 0 → flip to `error`.

---

## Related Skills

- **setup-guardrails** — Initial guardrail stack installation (run before this skill)
- **enforce-architecture** — Tier-based dependency boundary enforcement
- **self-correcting-loop** — How to handle commit rejections efficiently
