---
name: guardrails-doctor
description: >
  Read-only health check of an installed guardrail stack: tool versions behind the
  templates or npm, configs that drifted from the templates, a v2 (ESLint/husky) setup
  that needs migrating, a loose or stale ratchet baseline, missing agent hooks, and
  AGENTS.md commands that no longer exist. Use for "check our guardrails", "are our
  guardrails up to date", periodic audits, or before upgrading.
---

# Guardrails doctor

**Read only.** Run the checks, then write one report. Don't change files unless the user then asks
you to apply the suggested wave.
- If a check needs a tool that isn't installed, write that down and move on.
- Use the detected package manager's runner for anything not routed through
  `scripts/guardrails.mjs`.

## Checks

### 1. Setup generation

| Signal | Verdict |
| --- | --- |
| `eslint-plugin-boundaries`, `lint-staged`, `.husky/`, or a `lefthook.yml` with a `lint-deps` or `npx eslint` job | **v2 setup.** Recommend the [v2 to v3 migration](https://github.com/Avinava/agentic-guardrail-ts/blob/main/docs/migrating-from-v2.md) and skip the detailed checks below that assume v3. |
| `scripts/guardrails.mjs` present | v3 |
| Neither | Not installed. Recommend `setup-guardrails`. |

### 2. Versions

- **Template drift.** Compare `devDependencies` in the root `package.json` with the template ranges
  embedded in `setup-guardrails`.
- **npm drift.** Look up the current releases with `npm view <pkg> version` for the stack packages:
  - oxlint, oxlint-tsgolint
  - `@typescript/native` (`typescript@latest`), `@typescript/typescript6`
  - dependency-cruiser, knip, vitest, vite, prettier, lefthook, `@commitlint/cli`
  - monorepo only: turbo, syncpack
- **Flag:**
  - a major version behind
  - `typescript` not aliased to `@typescript/typescript6`. dependency-cruiser needs the TS 6 API
    until TypeScript 7.1 ships one.
  - Node: `.nvmrc` below 22, or `engines` that allow an end-of-life Node release
  - GitHub Actions not pinned by SHA, or pinned to older versions than the CI template embedded in
    `setup-guardrails`

### 3. Config drift

- **`scripts/guardrails.mjs` and `scripts/guardrails-packs.mjs`** should match the templates byte
  for byte. Any difference is drift, because the files are managed and should never be
  hand-edited. Show the diff summary. A repo with only `guardrails.mjs` predates packs: offer the
  upgrade (both files), which changes nothing until a pack's config file is added.
- **Packs.** Run `node scripts/guardrails.mjs packs`. Report stacks that are detected but have no
  tool on (for example `mule: detected` with every tool `off`) as an offer, not a defect: packs
  are opt-in. Report a tool that is `on` but whose binary is missing.
- **Other configs** may be tailored on purpose. Report only what is missing:
  - `.oxlintrc.json` without `typescript/no-floating-promises` or `unicorn/no-abusive-eslint-disable`
  - `lefthook.yml` without the `guardrails`, `secrets` or `commitlint` jobs
  - `package.json` without the `verify` or `prepare` scripts
  - `vitest.config.ts` without coverage thresholds
  - `.dependency-cruiser.mjs` without `no-circular`
  - a CI workflow that doesn't run `verify` and `check --strict-baseline`
- **Hooks are installed.** The file at `git rev-parse --git-path hooks/pre-commit` should mention
  lefthook (this also works in worktrees). If it doesn't, tell the
  user to run `node scripts/guardrails.mjs exec lefthook install`.

### 4. Baseline health

1. Run `node scripts/guardrails.mjs check --strict-baseline`:
   - A failure with new findings means the main branch is red. Report it first.
   - A failure about `--tighten` means improvements weren't locked in.
2. Summarise `guardrails.baseline.json`:
   - total findings, the top 10 rules by count, and the top 10 files by count
   - how old the file is (`git log -1 --format=%cr -- guardrails.baseline.json`)
3. Flag growth: `git log -p --follow -- guardrails.baseline.json`. Any commit where a count went
   **up** means someone ran `--reset`, re-ran `--init` or edited the file by hand. Name the commit and
   ask whether a human approved it.
4. Coverage: compare the thresholds in `vitest.config.ts` with a fresh `test:coverage` run. Floors
   more than 2 points below the measured value mean nobody has tightened them.

### 5. Agent loop

- **AGENTS.md:**
  - It has the `guardrails:start` / `guardrails:end` block, matching the `guardrails-loop`
    template.
  - Every `node scripts/...` command and package script it mentions exists.
- **Instruction files:** `CLAUDE.md` (and `GEMINI.md` if present) import `@AGENTS.md` and don't
  contradict it.
- **Claude Code:** `.claude/settings.json` has the PostToolUse and Stop hooks and the
  `permissions.deny` entries from the template.
- **Codex:** `.codex/hooks.json` exists if the team uses Codex.

### 6. Escape hatches

- Count the disables: `rg -n "(eslint|oxlint)-disable" --glob '!node_modules' | wc -l`.
- List any disable without ` -- ` (a reason). These would already fail the gate in changed files.
- List `@ts-expect-error` comments with very short descriptions.

## Report format

```
GUARDRAILS DOCTOR  <repo>  <date>
Generation: v3 | v2 (migrate) | none
Status: healthy | drifting | broken

BROKEN (fix now)
- <e.g. main fails check: 3 findings above baseline>
DRIFT
- <package>: <installed> -> <template> / <npm latest>
- scripts/guardrails.mjs differs from template (<n> lines)
BASELINE
- <total> findings; top rules: <rule n, ...>; last tightened <when>
- <stale | grew in <commit> | coverage floors behind by <n> points>
AGENT LOOP
- <missing hooks / AGENTS.md block outdated / CLAUDE.md does not import AGENTS.md>
ESCAPE HATCHES
- <n> disables, <m> without reason

SUGGESTED WAVE
1. <smallest set of changes that fixes BROKEN, then DRIFT>
2. <next debt wave: highest-count cheap rule>
```

After the report, offer to apply the suggested wave. For the files it touches, use
`setup-guardrails`, and `guardrails-loop` for the agent files.
