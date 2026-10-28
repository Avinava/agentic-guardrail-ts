# Troubleshooting

For tool interactions, also see [Known conflicts](./known-conflicts.md).

## Git hooks do not run

Commits go through with no checks.

```bash
git config --get core.hooksPath          # should print nothing
git config --unset core.hooksPath        # if it printed something (often left by husky)
node scripts/guardrails.mjs exec lefthook install
```

The `prepare` script runs `lefthook install` on every install.

## `<tool> is not installed`

`guardrails.mjs` runs binaries from `node_modules/.bin` at the git root. Install devDependencies. On Yarn Berry, see [Yarn Plug'n'Play](./known-conflicts.md#yarn-plugnplay).

## Check is clean but a tool never ran

Some steps are skipped without a message:

- Knip, when it is not installed.
- dependency-cruiser, when there is no `.dependency-cruiser.*` config.
- Any `verify` step whose package script (`format:check`, `typecheck`, `lint`, `test:coverage`) is missing.

Run `guardrails-doctor` to find what is missing.

## `guardrails: <tool> failed (exit N)`

The tool crashed or its config is invalid, so it printed no findings. Run it directly to see the full error, for example `node scripts/guardrails.mjs exec depcruise --validate .dependency-cruiser.mjs src`.

## `guardrails: verify failed at "<step>"`

Run that package script on its own (`npm run typecheck`, `pnpm run test:coverage`, ...) and fix what it reports.

## `gitleaks: command not found`

gitleaks is a separate binary. Install it with `brew install gitleaks` or from its releases page. The npm package named `gitleaks` is not the official one.

## Check fails on code you did not touch

On a full `check`, every file counts. If a finding is in a file you did not change, someone else added it, or the baseline lost the entry (for example after a rename). Don't fix or suppress it in an unrelated change. Raise it with whoever owns the baseline.

## Findings reappear after a rename

See [Baseline keys and file renames](./known-conflicts.md#baseline-keys-and-file-renames).

## `baseline exists. Use --tighten, or --reset after human review.`

`--init` only works once. After that, use `--tighten` to record improvements. `--reset` accepts the current state, including new findings, so it needs human review.

## `cannot tighten, N key(s) grew`

Some counts are above the baseline. Run `check`, fix the new findings, then tighten.

## CI fails on `check --strict-baseline`

Findings were fixed but the baseline was not tightened. Run `node scripts/guardrails.mjs baseline --tighten` and commit `guardrails.baseline.json` (and `vitest.config.ts` if the coverage floors moved).

## `coverage run failed; thresholds unchanged`

`baseline --tighten` already wrote the tightened `guardrails.baseline.json`, then the coverage run failed. Fix the failing tests and run `--tighten` again to raise the coverage floors.

## Coverage fails after tightening

`--tighten` raised the thresholds to what was measured. A later change that drops coverage fails, which is the point. Add tests. Don't lower the thresholds.

## Typecheck reports TS 6 errors or `tsc6`

`tsc` should be TypeScript 7 from `@typescript/native`. See [Known conflicts](./known-conflicts.md#two-tsc-binaries).

## Oxlint type-aware rules do nothing

`oxlint-tsgolint` must be installed, and the file must be part of a tsconfig `include`. Files outside every tsconfig get no type information.

## Knip reports false positives

Add the entry file, or add the package to `ignoreDependencies` with a comment. See [Known conflicts](./known-conflicts.md#knip-and-dynamic-loading).

## syncpack complains about `workspace:*` or `*`

The pin must match the package manager: `workspace:*` for pnpm, Yarn Berry and Bun, `*` for npm and Yarn 1. pnpm catalogs need their own group. See [Package managers](./package-managers.md).

## turbo fails with a package manager error

See [turbo and `packageManager`](./known-conflicts.md#turbo-and-packagemanager).

## Agent hooks do not fire

- **Claude Code:** hooks load at session start. Restart the session after the skill writes `.claude/settings.json`. Run `/hooks` to see what is registered.
- **Codex:** check that your Codex version supports hooks, that `.codex/hooks.json` is at the repo root, and that you trusted the project's hooks (run `/hooks` in Codex).
- Both run `node scripts/guardrails.mjs`, so Node must be on the agent's PATH.

## The stop hook keeps blocking

The hook blocks once, then lets the agent stop if it fires again in the same turn (`stop_hook_active`). If the agent cannot get clean, the failure is real: read the reason, or let the commit hook catch it and fix it by hand.

## The post-edit hook is slow

It runs type-aware Oxlint on the edited file only. If it is slow, the tsconfig probably includes too much (for example `node_modules` or `dist`). Narrow `include`.

## CI fails but local passes

1. Different Node version. CI reads `.nvmrc`.
2. Lockfile out of date. Install and commit the lockfile.
3. `--strict-baseline` (see above). Local `check` only prints a note.
4. Knip runs on full checks only: pre-commit skips it, pre-push `verify` runs it. Run `node scripts/guardrails.mjs check` locally.
5. CI scans the whole git history for secrets. Pre-commit only scans staged changes.
6. CI runs commitlint on every commit in the PR, not only the last one.
7. Monorepos: `lint` also runs `syncpack lint`.

## Do not bypass

`--no-verify`, `LEFTHOOK=0` and editing the baseline hide problems instead of fixing them. If a rule is wrong for your codebase, change the rule in a reviewed commit with the reason in the config.
