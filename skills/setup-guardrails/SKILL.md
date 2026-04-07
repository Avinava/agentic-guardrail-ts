---
name: setup-guardrails
description: Use when setting up a new TypeScript project or adding guardrails to an existing one. Installs 13 pre-configured tools that enforce code quality and architecture boundaries via pre-commit hooks.
---

## Overview

Install a self-correcting guardrail stack into a TypeScript project. After setup, every `git commit` runs 7 parallel checks (~3s) and rejects bad code automatically. You (the agent) will see the errors, fix them, and retry.

**This skill sets up:**
- Lefthook (parallel pre-commit hooks)
- Prettier + lint-staged (formatting)
- ESLint + boundaries plugin (architecture enforcement)
- TypeScript strict mode (type safety)
- Knip (dead code detection)
- Syncpack (dependency version consistency)
- Commitlint (conventional commits)
- Vitest (test runner)
- Turborepo (cached builds — monorepo only)
- Publint (package export validation — CI only)

## Prerequisites

- Node.js 20+ (check `.nvmrc`)
- A TypeScript project with a `package.json`
- Git initialized

## Step 1: Detect Project Type

Read the target project's `package.json`.

**Monorepo** if ANY of these are true:
- `workspaces` field exists
- `turbo.json` exists at root
- `packages/` directory exists

**Single package** otherwise.

Store the result — it affects which configs to install and how to customize them.

## Step 2: Detect Org Scope

Look at the `name` field in `package.json`:
- If it starts with `@something/`, the org scope is `@something`
- If no scope detected, ask the user: "What's your npm org scope? (e.g. `@acme`)"
- If the user says "none" or skips, use `@myorg` as placeholder

The scope is used in ESLint boundary rules and Syncpack to distinguish internal packages from third-party dependencies. For single-package projects it's only relevant if they later add workspaces.

## Step 3: Detect Package Manager

Check which lockfile exists:
- `pnpm-lock.yaml` → pnpm
- `yarn.lock` → yarn
- `package-lock.json` or none → npm

## Step 4: Fetch and Write Config Files

Fetch each config from this repository and write it to the target project root. Replace `__ORG_SCOPE__` with the detected/provided org scope.

**Base URL:** `https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/configs/`

### All projects (single + monorepo):

| Fetch from | Write to | Notes |
|-----------|---------|-------|
| `.editorconfig` | `.editorconfig` | No substitution needed |
| `.nvmrc` | `.nvmrc` | No substitution needed |
| `.prettierrc` | `.prettierrc` | No substitution needed |
| `.prettierignore` | `.prettierignore` | No substitution needed |
| `.gitignore.template` | `.gitignore` | Merge with existing if present |
| `lefthook.yml` | `lefthook.yml` | No substitution needed |
| `commitlint.config.ts` | `commitlint.config.ts` | Replace `__ORG_SCOPE__` |
| `tsconfig.base.json` | `tsconfig.base.json` | No substitution needed |
| `vitest.config.ts` | `vitest.config.ts` | No substitution needed |
| `eslint.config.js` | `eslint.config.js` | Replace `__ORG_SCOPE__`. **Customize tiers** (see Step 5) |

### Monorepo only:

| Fetch from | Write to | Notes |
|-----------|---------|-------|
| `.syncpackrc.json` | `.syncpackrc.json` | Replace `__ORG_SCOPE__` |
| `knip.json` | `knip.json` | Replace `__ORG_SCOPE__` |
| `turbo.json` | `turbo.json` | No substitution needed |

### Merge strategy for `.gitignore`:
If a `.gitignore` already exists, append any lines from the template that don't already appear. Don't duplicate entries.

## Step 5: Customize ESLint Architecture Tiers

This is the most important customization step. Open the `eslint.config.js` you just wrote.

### For single-package projects:
Remove the entire `boundaries` plugin section. Single packages don't need architecture tiers. Keep everything else (TypeScript strict, no-console, Prettier compat).

### For monorepo projects:
Edit the tier arrays to match the **actual packages** in the project:

```javascript
const tier0 = ['shared-types', 'logger'];      // ← Replace with YOUR leaf packages
const tier1 = ['config', 'helpers'];            // ← Replace with YOUR util packages
const tier2 = ['database', 'external-api'];     // ← Replace with YOUR infra packages
const tier3 = ['domain-logic', 'processing'];   // ← Replace with YOUR domain packages
const tier4 = ['orchestrator'];                 // ← Replace with YOUR orchestration
```

Also update `settings['boundaries/elements']` to match the actual package paths.

**Rule of thumb for classifying:**
- If it has NO workspace dependencies → tier 0
- If it depends only on tier 0 → tier 1
- If it talks to databases/APIs → tier 2
- If it contains business logic → tier 3
- If it wires everything together → tier 4
- If it's a deployable app → app tier (no restrictions)

If you're unsure, ask the user. Getting the tiers right is critical.

## Step 6: Fetch Helper Scripts

Fetch scripts that the pre-commit hooks depend on:

```
https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/scripts/typecheck-staged.sh
https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/scripts/publint-all.sh
```

Write them to `scripts/` in the target project. Make them executable: `chmod +x scripts/*.sh`.

## Step 7: Create lint-staged Config

Add to `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,md,yml,yaml}": "prettier --write"
  }
}
```

## Step 8: Add npm Scripts

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "lint:unused": "knip",
    "lint:deps": "syncpack lint",
    "prettier:check": "prettier --check .",
    "prettier:fix": "prettier --write ."
  }
}
```

For monorepos using Turborepo, replace `build` with:
```json
"build": "turbo run build"
```

## Step 9: Install devDependencies

### All projects:
```bash
npm install -D lefthook prettier lint-staged eslint typescript vitest @commitlint/cli @commitlint/config-conventional typescript-eslint eslint-config-prettier publint
```

### Monorepo only (add these):
```bash
npm install -D eslint-plugin-boundaries syncpack knip turbo
```

### Single-package (add knip only):
```bash
npm install -D knip
```

Adapt the install command for the detected package manager (pnpm add -D, yarn add -D, etc.).

## Step 10: Initialize Lefthook

```bash
npx lefthook install
```

This creates the `.git/hooks/` symlinks that make the pre-commit checks fire automatically.

## Step 11: Set Up Agent Instructions

Based on the user's AI coding agent, write the appropriate instruction file. Fetch the template from:

```
https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/agents/CLAUDE.md
https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/agents/GEMINI.md
https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/agents/AGENTS.md
https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/agents/.cursorrules
```

Write the appropriate file to the project root. Customize:
- Replace generic architecture tiers with the project's actual tiers
- Replace generic package names with actual package names
- Adjust commands for the detected package manager

If unsure which agent the user uses, write all four.

## Step 12: Verify Setup

Run a verification commit to confirm the hooks work:

```bash
git add -A
git commit --allow-empty -m "chore: verify guardrail setup"
```

If the commit succeeds, the setup is complete. If it fails, read the errors and fix them — **this is the self-correcting loop in action**.

## Verification Checklist

- [ ] `lefthook.yml` exists and `npx lefthook install` succeeded
- [ ] `eslint.config.js` exists with correct org scope
- [ ] `tsconfig.base.json` exists
- [ ] `.prettierrc` exists
- [ ] `commitlint.config.ts` exists
- [ ] `vitest.config.ts` exists
- [ ] `scripts/typecheck-staged.sh` exists and is executable
- [ ] Agent instruction file exists (CLAUDE.md, GEMINI.md, etc.)
- [ ] `git commit --allow-empty` passes without hook errors
- [ ] Package manager lockfile updated with new devDependencies

## What Happens After Setup

Every `git commit` now runs this pipeline in parallel (~3s):

```
┌─ Prettier ────── auto-fixes formatting               ✓/✗
├─ Knip ────────── detects unused exports               ✓/✗
├─ Syncpack ────── checks dependency versions           ✓/✗
├─ ESLint ──────── catches architecture violations      ✓/✗
├─ TypeScript ──── finds type errors                    ✓/✗
├─ Vitest ──────── runs related tests                   ✓/✗
└─ Commitlint ──── validates commit message             ✓/✗
```

If ANY check fails, the commit is rejected. You see the errors, fix them, retry. This is the self-correcting loop — use it on every commit.

## Related Skills

- **enforce-architecture** — Understanding and working within the tiered dependency rules
- **self-correcting-loop** — How to handle commit rejections efficiently
- **adding-a-package** — Adding a new workspace package (monorepo)
- **writing-agent-instructions** — Creating/updating CLAUDE.md, GEMINI.md, etc.
