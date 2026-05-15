# enforce-code-discipline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `enforce-code-discipline` companion skill that extends the existing guardrail stack with LLM discipline rules — complexity limits, code quality checks, naming conventions, ESM idioms, documentation coverage, and test coverage thresholds.

**Architecture:** A new skill file (`skills/enforce-code-discipline/SKILL.md`) contains all agent-executable steps. Three ESLint plugins are added (`eslint-plugin-unicorn`, `eslint-plugin-sonarjs`, `eslint-plugin-jsdoc`). Reference configs are updated to match. No existing skill content is modified except adding a cross-link.

**Tech Stack:** ESLint flat config, eslint-plugin-unicorn, eslint-plugin-sonarjs, eslint-plugin-jsdoc, @typescript-eslint/eslint-plugin, Vitest coverage/v8

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `skills/enforce-code-discipline/SKILL.md` | New agent-executable skill |
| Modify | `reference/single-package/eslint.config.js` | Add discipline block (single-pkg reference) |
| Modify | `reference/monorepo/eslint.config.js` | Add discipline block (monorepo reference) |
| Modify | `reference/single-package/vitest.config.ts` | Add coverage thresholds |
| Modify | `skills/setup-guardrails/SKILL.md` | Add cross-link in Related Skills |
| Modify | `README.md` | Add row to skills table |

---

## Task 1: Create the `enforce-code-discipline` Skill

**Files:**
- Create: `skills/enforce-code-discipline/SKILL.md`

- [ ] **Step 1.1: Create the skill file**

Create `skills/enforce-code-discipline/SKILL.md` with this exact content:

````markdown
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
  // sonarjs/cognitive-complexity        ?      Wave 1
  // max-lines                           ?      Wave 1
  // max-lines-per-function              ?      Wave 1
  // max-depth                           ?      Wave 1
  // naming-convention                   ?      Wave 2
  // sonarjs/no-duplicate-string         ?      Wave 2
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

For monorepos, `include` should be `['packages/*/src/**/*.test.ts']`.

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
- Pre-commit hooks run without errors (warnings expected and tracked)
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
````

- [ ] **Step 1.2: Verify the skill file was created**

```bash
wc -l skills/enforce-code-discipline/SKILL.md
```

Expected: a number greater than 150 (the file is substantial).

- [ ] **Step 1.3: Commit**

```bash
git add skills/enforce-code-discipline/SKILL.md
git commit -m "feat(skills): add enforce-code-discipline skill"
```

---

## Task 2: Update Single-Package Reference ESLint Config

**Files:**
- Modify: `reference/single-package/eslint.config.js`

Current file has these imports and ends with `eslintConfigPrettier` as the last entry.

- [ ] **Step 2.1: Add plugin imports**

Open `reference/single-package/eslint.config.js`. After the existing import lines (after `import importX from 'eslint-plugin-import-x';`), add:

```js
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
import jsdoc from 'eslint-plugin-jsdoc';
```

- [ ] **Step 2.2: Append discipline block before `eslintConfigPrettier`**

Find this line at the bottom of the config:

```js
  eslintConfigPrettier,
);
```

Replace it with:

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

  eslintConfigPrettier,
);
```

- [ ] **Step 2.3: Verify valid JS**

```bash
node --input-type=module < reference/single-package/eslint.config.js 2>&1 | head -5
```

Expected: no output (no syntax errors). Ignore "cannot find module" errors — the plugins won't be installed in this repo.

- [ ] **Step 2.4: Commit**

```bash
git add reference/single-package/eslint.config.js
git commit -m "feat(reference): add discipline block to single-package eslint config"
```

---

## Task 3: Update Monorepo Reference ESLint Config

**Files:**
- Modify: `reference/monorepo/eslint.config.js`

- [ ] **Step 3.1: Add plugin imports**

Open `reference/monorepo/eslint.config.js`. After `import eslintConfigPrettier from 'eslint-config-prettier';`, add:

```js
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
import jsdoc from 'eslint-plugin-jsdoc';
```

- [ ] **Step 3.2: Append discipline block before `eslintConfigPrettier`**

Find this at the bottom:

```js
  // ── Disable Prettier-conflicting rules ──
  eslintConfigPrettier,
);
```

Replace it with:

```js
  // ── Complexity & size limits ──────────────────────────────────
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
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
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
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
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
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
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
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
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
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

  // ── Disable Prettier-conflicting rules ──
  eslintConfigPrettier,
);
```

- [ ] **Step 3.3: Commit**

```bash
git add reference/monorepo/eslint.config.js
git commit -m "feat(reference): add discipline block to monorepo eslint config"
```

---

## Task 4: Update Reference Vitest Config

**Files:**
- Modify: `reference/single-package/vitest.config.ts`

Current content:
```ts
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

- [ ] **Step 4.1: Add coverage thresholds**

Replace the entire file with:

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

- [ ] **Step 4.2: Commit**

```bash
git add reference/single-package/vitest.config.ts
git commit -m "feat(reference): add coverage thresholds to vitest config"
```

---

## Task 5: Cross-Link in `setup-guardrails` Skill

**Files:**
- Modify: `skills/setup-guardrails/SKILL.md`

- [ ] **Step 5.1: Add cross-link to Related Skills section**

Find the Related Skills section at the bottom of `skills/setup-guardrails/SKILL.md`:

```markdown
## Related Skills

- **enforce-architecture** — Understanding and working within the tiered dependency rules
- **self-correcting-loop** — How to handle commit rejections efficiently
- **adding-a-package** — Adding a new workspace package (monorepo)
```

Replace it with:

```markdown
## Related Skills

- **enforce-code-discipline** — Extend with LLM discipline rules: complexity limits, naming conventions, coverage thresholds
- **enforce-architecture** — Understanding and working within the tiered dependency rules
- **self-correcting-loop** — How to handle commit rejections efficiently
- **adding-a-package** — Adding a new workspace package (monorepo)
```

- [ ] **Step 5.2: Commit**

```bash
git add skills/setup-guardrails/SKILL.md
git commit -m "docs(skills): cross-link enforce-code-discipline from setup-guardrails"
```

---

## Task 6: Update README Skills Table

**Files:**
- Modify: `README.md`

- [ ] **Step 6.1: Add new skill row**

Find this table in `README.md`:

```markdown
| Skill | When to Use |
|-------|------------|
| [**setup-guardrails**](skills/setup-guardrails/SKILL.md) | Setting up a new TS project or adding guardrails to an existing one (supports greenfield + retrofit mode) |
| [**enforce-architecture**](skills/enforce-architecture/SKILL.md) | Adding imports, creating packages, reviewing code for tier violations, and managing escape hatches |
| [**self-correcting-loop**](skills/self-correcting-loop/SKILL.md) | Every commit — how to read errors, fix all in one pass, and retry |
| [**adding-a-package**](skills/adding-a-package/SKILL.md) | Creating a new workspace package (monorepo) |
```

Replace it with:

```markdown
| Skill | When to Use |
|-------|------------|
| [**setup-guardrails**](skills/setup-guardrails/SKILL.md) | Setting up a new TS project or adding guardrails to an existing one (supports greenfield + retrofit mode) |
| [**enforce-code-discipline**](skills/enforce-code-discipline/SKILL.md) | After setup-guardrails — add LLM discipline rules: complexity limits, naming conventions, coverage thresholds |
| [**enforce-architecture**](skills/enforce-architecture/SKILL.md) | Adding imports, creating packages, reviewing code for tier violations, and managing escape hatches |
| [**self-correcting-loop**](skills/self-correcting-loop/SKILL.md) | Every commit — how to read errors, fix all in one pass, and retry |
| [**adding-a-package**](skills/adding-a-package/SKILL.md) | Creating a new workspace package (monorepo) |
```

- [ ] **Step 6.2: Commit**

```bash
git add README.md
git commit -m "docs: add enforce-code-discipline to skills table"
```

---

## Task 7: Final Verification

- [ ] **Step 7.1: Run docs-check**

```bash
node scripts/docs-check.mjs
```

Expected: `✓ docs-check: no stale path references found`

If it fails, check that all file paths referenced in the new skill file exist in the repo.
Paths that exist only in target projects (like `eslint.config.js`, `vitest.config.ts`) are fine —
docs-check only flags references to files that should exist in THIS repo.

- [ ] **Step 7.2: Run shellcheck**

```bash
shellcheck scripts/*.sh
```

Expected: no warnings (the new skill adds no shell scripts).

- [ ] **Step 7.3: Validate reference JSON files**

```bash
for f in $(find reference/ -name '*.json'); do
  echo "Validating $f..."
  node -e "JSON.parse(require('fs').readFileSync('$f', 'utf8'))"
done
```

Expected: each file prints its path with no parse errors.

- [ ] **Step 7.4: Verify skill file exists and looks complete**

```bash
grep -c "##" skills/enforce-code-discipline/SKILL.md
```

Expected: 8 or more (the skill has 8 `##` section headers).

- [ ] **Step 7.5: Final commit**

```bash
git add -A
git status
```

Expected: clean working tree (all changes already committed in previous tasks).
If anything is untracked, stage and commit with an appropriate message.

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task that implements it |
|---|---|
| New skill `enforce-code-discipline/SKILL.md` | Task 1 |
| eslint-plugin-unicorn (10 rules) | Tasks 1, 2, 3 |
| eslint-plugin-sonarjs (7 rules) | Tasks 1, 2, 3 |
| eslint-plugin-jsdoc (4 rules, wave-gated) | Tasks 1, 2, 3 |
| @typescript-eslint/naming-convention | Tasks 1, 2, 3 |
| Built-in complexity rules (max-lines etc.) | Tasks 1, 2, 3 |
| Vitest coverage thresholds | Tasks 1, 4 |
| Greenfield vs retrofit detection | Task 1 |
| Wave sequencing guide | Task 1 |
| Folder structure detection + comment | Task 1 |
| setup-guardrails cross-link | Task 5 |
| README update | Task 6 |
| CI/docs-check passes | Task 7 |

**Placeholder scan:** No TBDs, no "implement later", no vague steps. All code blocks are complete. ✓

**Type consistency:** No types defined in earlier tasks referenced in later tasks. This is a content plan, not a code plan. ✓
