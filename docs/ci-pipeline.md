# CI pipeline

The template `.github/workflows/ci.yml` runs the same gate as `git push`, so a green push means a green PR. It has two jobs.

## verify

1. Checkout with full history (`fetch-depth: 0`).
2. Set up the package manager and Node from `.nvmrc`, with the lockfile cache.
3. Install with the frozen lockfile.
4. `node scripts/guardrails.mjs verify`: format check, typecheck, full guardrails check (including Knip), tests with coverage thresholds.
5. `node scripts/guardrails.mjs check --strict-baseline`: fails if findings were fixed but `baseline --tighten` was not committed. This keeps the baseline honest.
6. On pull requests, commitlint over the PR's commit range.

## secrets

Installs a pinned gitleaks release and scans the full git history with `--redact`. Pre-commit only sees staged changes; this catches anything that got past it.

## Package manager

The template is written for pnpm. For other managers:

| Manager | Change |
| --- | --- |
| npm | Remove `pnpm/action-setup`. `cache: npm`. `npm ci` |
| Yarn 1 | Remove `pnpm/action-setup`. `cache: yarn`. `yarn install --frozen-lockfile` |
| Yarn Berry | Remove `pnpm/action-setup`. Run `corepack enable` first. `cache: yarn`. `yarn install --immutable` |
| Bun | Replace the pnpm step with `oven-sh/setup-bun` (pinned by SHA). Drop the `cache` line. `bun install --frozen-lockfile` |

The skill makes these edits for you. See [Package managers](./package-managers.md).

## Security defaults

- `permissions: contents: read`.
- Actions pinned by commit SHA, with the version in a comment. Let Renovate or Dependabot update the pins.
- `concurrency` cancels superseded runs on the same ref.
- Timeouts on every job.

## Make it required

In the branch protection or ruleset for `main`, require both `verify` and `secrets`. Without that, CI is advice.

## Monorepo caching

`verify` calls the root scripts, and the monorepo `typecheck` runs through turbo. To share the turbo cache across runs, add turbo remote caching or cache `.turbo/` with `actions/cache`. Neither is in the template, so the default works with no secrets.
