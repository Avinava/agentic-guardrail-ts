# Migrating from v2

v3 replaces the ESLint-based stack. The short version: run the `setup-guardrails` skill on a clean branch. It detects a v2 setup and does the steps below. This page explains what changes, so you can review the result or do it by hand.

## Why v3

- TypeScript 7 is native and has no API. typescript-eslint cannot load it.
- ESLint 9 reached end of life. Oxlint runs type-aware rules on TS 7 today.
- Warn-only waves let debt drift. One ratchet over every finding does not.
- Agent hooks now catch problems at edit time, not just at commit.

Details: [decision 0001](./decisions/0001-engine.md).

## What maps to what

| v2 | v3 |
| --- | --- |
| ESLint + typescript-eslint | Oxlint + oxlint-tsgolint (`.oxlintrc.json`) |
| `eslint.config.js` | `.oxlintrc.json` |
| eslint-plugin-boundaries | dependency-cruiser (`.dependency-cruiser.mjs`) |
| eslint-plugin-sonarjs | Native `complexity`, `max-depth`, `max-lines-per-function`. sonarjs is optional |
| eslint-plugin-unicorn | Oxlint's built-in `unicorn` rules |
| `@typescript-eslint/naming-convention` | Dropped. `unicorn/filename-case` stays |
| `import-x/order` | Dropped. No Oxlint equivalent |
| `import-x/default`, `import-x/named` | `tsc` catches wrong import shapes for typed modules |
| `no-restricted-syntax` (double cast) | Dropped. `consistent-type-assertions` still blocks `{} as Foo` |
| eslint-plugin-jsdoc | Dropped |
| eslint-config-prettier | Not needed. Oxlint has no formatting rules |
| `typescript` 5.x | `@typescript/native` (TS 7, runs `tsc`) plus `typescript` aliased to TS 6 |
| husky + lint-staged | lefthook 2 calling `guardrails.mjs format` and `check --files` |
| `scripts/typecheck-staged.sh` | Stop hook and pre-push `verify` |
| `scripts/publint-all.sh` | Removed from the defaults. Run publint in your release pipeline if you publish |
| Warn-only rules, warning budget header | `guardrails.baseline.json` and `baseline --tighten` |
| `commitlint.config.ts` | `commitlint.config.mjs` |
| `.prettierrc` | `.prettierrc.json` |
| `CLAUDE.md`, `.cursorrules` with rules | `AGENTS.md` managed block; `CLAUDE.md` is `@AGENTS.md` |
| `self-correcting-loop` skill | `guardrails-loop` skill |
| `enforce-code-discipline` skill | A wave inside `setup-guardrails` |
| `init.sh` | The skills (plugin, `npx skills add`, or raw URL) |
| Vitest 3 or 4 | Vitest 5, with `vite` listed explicitly |

## Step by step

### 1. Branch

```bash
git switch -c chore/guardrails-v3
```

Start from a clean tree.

### 2. Remove the ESLint stack

Uninstall with your package manager (`npm uninstall`, `pnpm remove`, `yarn remove`, `bun remove`):

```text
eslint @eslint/js typescript-eslint eslint-config-prettier
eslint-plugin-boundaries eslint-plugin-import-x eslint-import-resolver-typescript
eslint-plugin-sonarjs eslint-plugin-unicorn eslint-plugin-jsdoc
```

Delete `eslint.config.js` and any `.eslintignore`. Move ignore patterns you still need into `ignorePatterns` in `.oxlintrc.json`.

### 3. Remove husky and lint-staged

```bash
git config --unset core.hooksPath
rm -rf .husky
```

Uninstall `husky` and `lint-staged`. Remove the `lint-staged` key and the `"prepare": "husky"` script from `package.json`.

### 4. Remove v2 helpers

Delete `scripts/typecheck-staged.sh`, `scripts/publint-all.sh` and the warning budget header. Remove v2 rules from `CLAUDE.md` and `.cursorrules`; `AGENTS.md` replaces them.

### 5. Apply the v3 templates

Run the `setup-guardrails` skill, or apply by hand: the shared templates, then `single` or `monorepo`, then merge `package.json` scripts and devDependencies. Replace the `typescript` devDependency with the two aliases:

```json
{
  "@typescript/native": "npm:typescript@^7.0.2",
  "typescript": "npm:@typescript/typescript6@^6.0.2"
}
```

Map your v2 boundaries elements to `LAYERS` or `TIERS` in `.dependency-cruiser.mjs`. Tier order usually carries over directly.

Install, then check `node_modules/.bin/tsc --version` prints 7.x.

### 6. Rewrite disable comments

Oxlint uses different rule names (`typescript/no-explicit-any`, not `@typescript-eslint/no-explicit-any`), and `--report-unused-disable-directives` reports disables that no longer match anything. Every disable must name the rule and give a reason:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- untyped vendor callback, see docs/tech-debt.md#vendor-hooks
```

Disables for rules that no longer exist (naming, import order, sonarjs, jsdoc) can be deleted.

### 7. Get format and typecheck clean

```bash
npm run format
npm run typecheck
```

Expect some new errors after moving from TS 5 (changed defaults and removed options). Fix them: type errors are not baselined.

### 8. Record the baseline

```bash
node scripts/guardrails.mjs baseline --init
```

Your v2 warning counts become baseline entries. Set coverage floors to measured values (see [Retrofit](./retrofit.md#day-one)).

### 9. Install the agent loop

Run the `guardrails-loop` skill. It writes the `AGENTS.md` block, `CLAUDE.md`, `.claude/settings.json` and `.codex/hooks.json`.

### 10. Replace CI

Replace your workflow with the v3 template, adjusted for your package manager. See [CI pipeline](./ci-pipeline.md).

### 11. Commit and verify

```bash
git add -A
git commit -m "chore: migrate guardrails to v3"
git push
```

The commit runs the new lefthook hooks, the push runs `verify`. Afterwards, run the `guardrails-doctor` skill to confirm nothing drifted from the templates.

## Rules you may miss

- **naming-convention:** gone by design. See [Retrofit](./retrofit.md#external-api-field-names).
- **import order:** let it go, or use a Prettier import-sorting plugin.
- **sonarjs cognitive complexity:** available through Oxlint's alpha JS plugins with the TS 6 alias. See [Known conflicts](./known-conflicts.md#oxlint-js-plugins-and-sonarjs).
