---
name: setup-guardrails
description: >
  Audit and install a self-correcting guardrail stack in any TypeScript project.
  Four-phase workflow: understand the guardrail system from this repo, inventory
  the target project, generate a gap analysis, then apply changes — creating missing
  configs and merging missing sections into existing ones.
---

## Overview

Install or update a self-correcting guardrail stack in a TypeScript project. After setup,
every `git commit` runs quality checks in parallel (~3s) and rejects bad code. You (the agent)
see the errors, fix them, and retry.

**Four-phase workflow:**
1. **Understand** — read this repo's reference configs to know what "correct" looks like
2. **Inventory** — inspect the target project's current state (configs, deps, code health)
3. **Gap analysis** — compare current vs. desired; present a structured report; get confirmation
4. **Apply** — create missing files, merge missing sections into outdated ones, install missing deps

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

---

## Skill Selection Guide

**This skill is always the starting point.** Run it once per project to install the toolchain. After setup, you have several optional skills to extend the stack:

| Goal | Skill | When |
|------|-------|------|
| Install the full guardrail stack | **setup-guardrails** (this skill) | Any new or existing TypeScript project — run first |
| Add LLM discipline rules (complexity, naming, coverage gates) | **enforce-code-discipline** | After `setup-guardrails` — essential for AI-heavy projects |
| Deep-dive on architecture tier rules | **enforce-architecture** | When debugging boundary violations or onboarding to tier rules |
| Handle a rejected commit | **self-correcting-loop** | When `git commit` fails after guardrails are installed |
| Add a new workspace package | **adding-a-package** | In a monorepo, after the root stack is set up |

**Typical setup sequence for an AI-assisted project:**

```
setup-guardrails          ← installs toolchain and pre-commit hooks (this skill)
    └─ enforce-code-discipline   ← adds LLM-specific rules and coverage gates
         └─ enforce-architecture  ← (monorepo only) deep-dives on tier boundaries
```

> **Not sure whether you need `enforce-code-discipline`?**
> If human engineers are the primary authors, `setup-guardrails` alone is sufficient.
> If LLMs frequently write or refactor code in this project, add `enforce-code-discipline` next —
> it catches complexity creep, naming drift, and coverage regressions that type-checking alone misses.

See [docs/tool-reference.md](../../docs/tool-reference.md) for a deep dive on each guardrail tool and why it was chosen over alternatives.

---

## Prerequisites

- Node.js 20+ installed
- A TypeScript project with a `package.json`
- Git initialized (`git init`)

---

## Phase 0: Understand the Guardrail System

**Do this before reading the target project.** Phase 0 builds your mental model of what
"correct" looks like, so you can do accurate gap analysis in Phase 2.

> **Important:** The reference files show the **complete end-state** after BOTH
> `setup-guardrails` AND `enforce-code-discipline` have run. Discipline-specific sections
> (unicorn, sonarjs, jsdoc, complexity limits, coverage thresholds) are added by
> `enforce-code-discipline`, not by this skill. In Phase 2, use the inline content in THIS
> file — not the reference files — as your source of truth for what this skill installs.

### 0a. Quick project type detection

Read the target project's `package.json` before fetching anything:
- **Monorepo** if: `workspaces` field exists, or `turbo.json` / `packages/` / `apps/` directory present
- **Single-package** otherwise

This determines which reference directory to fetch next.

### 0b. Fetch reference configs from GitHub

Fetch and read each file fully using raw GitHub URLs.

**Single-package** — from `https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/reference/single-package/`:
- `eslint.config.js`
- `lefthook.yml`
- `tsconfig.json`
- `vitest.config.ts`
- `commitlint.config.ts`
- `package.json`

**Monorepo** — from `https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/reference/monorepo/`:
- `eslint.config.js`
- `lefthook.yml`
- `tsconfig.base.json`
- `knip.json`
- `turbo.json`
- `.syncpackrc.json`
- `commitlint.config.ts`
- `vitest.config.ts`
- `package.json`

Also fetch `docs/known-conflicts.md`:
`https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/docs/known-conflicts.md`

> If a fetch fails (no network access), continue using the inline templates in this skill
> as your sole reference for what each config should contain.

### 0c. What to take away from the reference files

After reading, you should understand:
- What pre-commit jobs a complete `lefthook.yml` has (including `secrets` and, for monorepo, `lint-deps`)
- What TypeScript flags are required (`isolatedModules`, `verbatimModuleSyntax`, `incremental`, `erasableSyntaxOnly`)
- Which ESLint rules belong to THIS skill (import-x rules, runtime safety, boundaries for monorepo) vs. `enforce-code-discipline` (unicorn, sonarjs, jsdoc, complexity limits)
- What devDependencies the reference `package.json` lists
- Any known tool conflicts (from `docs/known-conflicts.md`) — especially the ESLint Config Prettier ordering constraint

You are now ready to inspect the target project.

---

## Phase 1: Inventory the Target Project

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

List the directories under `packages/` and `apps/`. These become the tier assignments in ESLint config. Ask the user how to classify them (see Phase 3).

### 1e. Config file inventory

For each file below, record: (a) does it exist? (b) if it exists, is it outdated?

**"Outdated" = file exists but is missing these literal strings:**

| File | Outdated if file exists but is MISSING any of these strings |
|------|-------------------------------------------------------------|
| `lefthook.yml` | `name: secrets` |
| `lefthook.yml` (monorepo) | also: `name: lint-deps` |
| `eslint.config.js` | `'import-x/named'`, `'import-x/default'`, `no-non-null-assertion`, `TSAsExpression > TSAsExpression` |
| `eslint.config.js` (monorepo) | also: `eslint-plugin-boundaries` |
| `tsconfig.json` / `tsconfig.base.json` | `"isolatedModules"`, `"verbatimModuleSyntax"`, `"incremental"`, `"erasableSyntaxOnly"` |
| `package.json` scripts | `"lint:unused"`, `"prettier:check"`, `"prettier:fix"`, `"prepare"` |
| `.gitignore` | `*.tsbuildinfo` |
| `commitlint.config.ts` | _(no outdated check — treat as present or missing only)_ |
| `vitest.config.ts` | _(no outdated check)_ |
| `knip.json` (monorepo) | _(no outdated check)_ |
| `.syncpackrc.json` (monorepo) | _(no outdated check)_ |
| `turbo.json` (monorepo) | _(no outdated check)_ |
| `scripts/typecheck-staged.sh` (monorepo) | _(exists AND is executable?)_ |
| `.editorconfig` | _(no outdated check)_ |
| `.nvmrc` | _(no outdated check)_ |
| `.prettierrc` | _(no outdated check)_ |
| `.prettierignore` | _(no outdated check)_ |

### 1f. devDependency audit

Read the target project's `package.json`. For each package below, record whether it is already in `devDependencies`. Phase 3 will install ONLY the missing ones.

**All projects:**
`lefthook`, `prettier`, `lint-staged`, `eslint`, `typescript`, `vitest`, `knip`,
`@commitlint/cli`, `@commitlint/config-conventional`, `typescript-eslint`,
`eslint-config-prettier`, `eslint-plugin-import-x`, `publint`

**Monorepo only (in addition to above):**
`eslint-plugin-boundaries`, `syncpack`, `turbo`

### 1g. Assess existing codebase health

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

**If retrofit mode:** When generating `eslint.config.js` in Phase 3, set these rules to `warn` instead of `error`:
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

## Phase 2: Gap Analysis

Using the Phase 1 inventory, compile this report and present it to the user before making any changes:

```
GUARDRAIL GAP ANALYSIS
======================
Project type:    [single-package | monorepo]
Package manager: [npm | pnpm | yarn]
Mode:            [greenfield | retrofit]

CONFIG FILES
  PRESENT AND CORRECT:   [list files]
  PRESENT BUT OUTDATED:  [list files with specific gap, e.g. "lefthook.yml (missing: secrets job)"]
  MISSING:               [list files]

PACKAGE.JSON SCRIPTS
  PRESENT AND CORRECT:   [list scripts]
  MISSING:               [list scripts]

DEVDEPENDENCIES
  ALREADY INSTALLED:     [list packages]
  MISSING (to install):  [list packages]

[Retrofit only:]
EXISTING VIOLATIONS: [N lint violations, M @ts-ignore occurrences]
STRATEGY: Wave mode — auto-fixable rules at error immediately, others at warn
```

**Then ask:** "Confirm this plan? Reply YES to proceed, or list any items to SKIP."

Wait for user confirmation before proceeding to Phase 3. Record any exclusions.

This single checkpoint replaces the scattered "ask user" prompts in the old workflow — **EXCEPT** still ask separately about:
- **Tier assignments** (monorepo only): after YES, ask how to classify each detected package into tiers (see Phase 3, eslint.config.js section)
- **Enum usage**: ask before writing tsconfig — "Does this project use TypeScript `enum` or `namespace` keywords?"

---

## Phase 3: Apply Changes

**File treatment policy:**
- **MISSING**: Create the file from the inline template in this skill.
- **PRESENT BUT OUTDATED**: Merge the missing sections into the existing file. Do NOT overwrite content that is already correct. Do NOT overwrite unrelated custom content.
- **PRESENT AND CORRECT**: Skip silently. No warning needed.

**Merge instructions by file type:**

**`lefthook.yml` — outdated (missing job):**
Read the existing file. Append the missing job block inside `pre-commit.jobs`, immediately before the `commit-msg` section. Do not modify existing jobs or their order.

**`eslint.config.js` — outdated (missing rule group):**
Read the existing file. Locate the array passed to `tseslint.config(...)`. Find the `eslintConfigPrettier` entry — it MUST remain the last element (see `docs/known-conflicts.md`, "ESLint Config Prettier × ESLint Rules"). Insert the missing config object(s) immediately BEFORE `eslintConfigPrettier`. Do not modify existing config objects. If the file doesn't use `tseslint.config()`, skip the merge and warn the user that the format is non-standard.

**`tsconfig.json` / `tsconfig.base.json` — outdated (missing flags):**
Add the missing key-value pairs to `compilerOptions`. Do not remove or modify existing options.

**`package.json` scripts — outdated (missing scripts):**
Add the missing script entries. Do not overwrite scripts that already exist unless the user confirms.

**`.gitignore` — outdated (missing entries):**
Append the missing entries. Do not remove existing entries.

---

### 3a. Foundation Configs

Create these files in the project root. Apply the file treatment policy (create if missing, skip if present).

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

### 3b. Pre-Commit Hook Config

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

Generate the scope list from the actual packages detected in Phase 1d:

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

### 3c. Linting & Type-Checking Configs

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

Generate the tier arrays from the actual packages detected in Phase 1d. Ask the user to classify each package into a tier:

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
const SCOPE = 'DETECTED_SCOPE';  // ← from Phase 1c

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

If a `tsconfig.json` already exists, apply the merge policy: add any missing flags to `compilerOptions`, do not overwrite existing options.

---

### 3d. Code Health Configs (Monorepo Only)

Skip this entire section for single-package projects.

### `knip.json`

Generate workspace entries from the actual packages detected in Phase 1d:

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

Use the detected org scope from Phase 1c:

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

### 3e. Test Config

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
include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
```

> **Coverage thresholds are intentionally omitted here.** They are set by the `enforce-code-discipline` skill, which baselines them against your current coverage in retrofit mode, or sets hard gates (80% lines/functions/statements, 75% branches) in greenfield mode. Run that skill after this one.

---

### 3f. Helper Scripts (Monorepo Only)

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

### 3g. Update package.json

### 3g-i. Add lint-staged config

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,mjs,cjs,json,md,css,html,yml,yaml}": "prettier --write"
  }
}
```

### 3g-ii. Add npm scripts

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

Apply the merge policy — add missing scripts, do NOT overwrite scripts that already exist unless the user confirms.

---

### 3h. Install Missing devDependencies

Install ONLY the packages identified as missing in Phase 1f. Do not reinstall packages that are already present.

**All projects (install only what is missing from this list):**
```bash
npm install -D lefthook prettier lint-staged eslint typescript vitest knip @commitlint/cli @commitlint/config-conventional typescript-eslint eslint-config-prettier eslint-plugin-import-x publint
```

**Monorepo only — add these if missing:**
```bash
npm install -D eslint-plugin-boundaries syncpack turbo
```

Adapt for detected package manager:
- pnpm: `pnpm add -D ...`
- yarn: `yarn add -D ...`

---

### 3i. Initialize Git Hooks

```bash
npx lefthook install
```

This creates `.git/hooks/` symlinks that make pre-commit checks fire automatically. This command is idempotent — safe to run even if hooks were already installed.

---

### 3j. Merge or Create `.gitignore`

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

## Phase 4: Verify

### 4a. Run verification commit

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

### 4b. Verification checklist

- [ ] `lefthook.yml` exists with `name: secrets` job
- [ ] For monorepo: `lefthook.yml` has `name: lint-deps` job
- [ ] `npx lefthook install` succeeded (`.git/hooks/` entries created)
- [ ] `eslint.config.js` exists with `import-x/named`, `import-x/default`, `no-non-null-assertion`, `TSAsExpression > TSAsExpression`
- [ ] For monorepo: `eslint.config.js` imports `eslint-plugin-boundaries`
- [ ] `.prettierrc` exists
- [ ] `commitlint.config.ts` exists with actual package scopes
- [ ] `vitest.config.ts` exists with correct `include` pattern
- [ ] `tsconfig` includes `"isolatedModules"`, `"verbatimModuleSyntax"`, `"incremental"` (and `"erasableSyntaxOnly"` if user confirmed no enums)
- [ ] `.editorconfig` exists
- [ ] `.nvmrc` exists
- [ ] `package.json` has `lint:unused`, `prettier:check`, `prettier:fix`, `prepare` scripts
- [ ] `git commit --allow-empty` passes without hook errors
- [ ] Lockfile updated with new devDependencies (including `eslint-plugin-import-x`)
- [ ] For monorepo: `tsconfig.base.json`, `knip.json`, `.syncpackrc.json`, `turbo.json` exist
- [ ] For monorepo: `scripts/typecheck-staged.sh` exists and is executable
- [ ] For retrofit: warning budget header present and honest; no rule at `error` with non-zero violations

### 4c. Adoption summary

After the verification commit succeeds, report:

```
SETUP COMPLETE
==============
Files created:    [N] new files
Files updated:    [Y] existing files with merged sections
Files unchanged:  [Z] already correct
Deps installed:   [W] new packages
```

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

Pick the right skill for your situation:

- **Setting up an AI-assisted project from scratch, or adding guardrails to an existing codebase?**
  → You're in the right place. Complete this skill, then run `enforce-code-discipline`.

- **LLMs frequently write or refactor code in this project?**
  → After setup, run `enforce-code-discipline` to add complexity limits, naming conventions, and coverage gates.
  These rules specifically target the patterns LLMs produce that type-checking alone misses.

- **Monorepo with multiple packages and you need to control which can import which?**
  → After setup, read `enforce-architecture` to understand and configure your tier boundary rules.
  It explains rule intentions, common violations, and how to handle legitimate exceptions.

- **`git commit` was rejected after guardrails were installed?**
  → See `self-correcting-loop` — it walks through reading hook output, fixing the issue, and retrying
  without fighting the tools.

- **Adding a new workspace package to an existing monorepo?**
  → See `adding-a-package` — it wires up the tsconfig, ESLint boundaries entry, and Turborepo task
  for the new package without breaking the existing ones.
