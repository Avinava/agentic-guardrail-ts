# AGENTS.md — AI Agent Instructions for Codex and Other Agents
# This file is read automatically by OpenAI Codex and similar tools.
# CUSTOMIZE: Replace example package names with YOUR actual packages.

## Workflow
1.  **Analyze**: Understand the requirements and existing code.
2.  **Plan**: Describe your proposed changes and wait for user approval.
3.  **Implement**: Make the changes and write tests.
4.  **Validate (The Loop)**:
    -   Run `git commit` to trigger **Lefthook**.
    -   Lefthook runs Prettier, Knip, Syncpack, ESLint, TypeScript, and Vitest in **parallel (~3s)**.
5.  **Refine**: If the commit fails, read the errors, fix them, and retry.

## Commands
- `npm run build` — Build all packages (Turborepo cached)
- `npm run test` — Run full test suite (Vitest)
- `npm run lint` — ESLint with architecture boundaries
- `npm run typecheck` — Type-check all packages
- `npm run lint:unused` — Find dead code (Knip)
- `npm run lint:deps` — Check dependency version consistency (Syncpack)
- `npm run prettier:check` — Verify formatting
- `npm run prettier:fix` — Auto-fix formatting

## Architecture
This is a TypeScript monorepo with tiered dependencies.
A package can NEVER import from its own tier or higher.

<!-- CUSTOMIZE: Replace these with YOUR actual packages -->
- Tier 0: shared-types, logger (no workspace deps)
- Tier 1: config, helpers (can import tier 0)
- Tier 2: database, external-api (can import tier 0–1)
- Tier 3: domain-logic, processing (can import tier 0–2)
- Tier 4: orchestrator (can import tier 0–3)
- Apps: cli, web, worker (can import anything)

## Critical Rules
- NEVER use console.log — use the logger package
- NEVER use `any` — use proper types or `unknown`
- ALWAYS await promises — no fire-and-forget
- ALWAYS run `npm run build` before committing if you changed package exports
- ALWAYS write tests before implementation (TDD)

## Self-Correcting Loop
Lefthook pre-commit hooks run on every `git commit`:
- Prettier, Knip, Syncpack, ESLint, TypeScript, Vitest, Commitlint
If commit is rejected, read the error, fix it, retry.

## Commit Format
Conventional Commits: `type(scope): description`
Types: feat, fix, refactor, docs, test, chore
Scopes: package names + deps, ci, release

## Adding a New Package
1. Create packages/new-pkg/ with package.json, tsconfig.json, src/index.ts
2. Add to knip.json workspaces
3. Add to eslint.config.js boundary elements and assign to a tier
4. Add to commitlint.config.ts scope-enum
5. Add as a dependency in consuming packages

## Testing
- Tests: packages/*/src/__tests__/
- Runner: Vitest (not Jest)
- Coverage auto-ratchets (only up)
