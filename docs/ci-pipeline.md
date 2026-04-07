# CI Pipeline

GitHub Actions configuration for the final safety net.

## Why CI Matters

Pre-commit hooks are the first line of defense, but they can be bypassed with `git commit --no-verify`. CI is the **final gate** — it runs everything on every push and PR.

## Configuration

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'        # Change to 'pnpm' or 'yarn' if applicable

      - run: npm ci

      # ── Static checks (no build required) ──
      - run: npm run prettier:check
      - run: npm run lint:unused
      - run: npm run lint:deps

      # ── Build (required for publint + downstream checks) ──
      - run: npm run build

      # ── Post-build checks ──
      - run: npm run lint:packages       # publint (needs dist/)
      - run: npm run lint                # ESLint + boundaries
      - run: npm test                    # Full test suite

      # ── Security ──
      - run: npm audit --audit-level=high
```

## Ordering Matters

1. **Static checks first** — Prettier, Knip, Syncpack don't need a build
2. **Build** — Required for publint (validates `dist/` files)
3. **Post-build checks** — ESLint boundaries, tests
4. **Security** — npm audit last (doesn't block other checks)

## Branch Protection

Enable these GitHub settings on your `main` branch:

1. **Settings → Branches → Add rule** for `main`
2. ✅ Require status checks to pass before merging
3. ✅ Require branches to be up to date before merging
4. ✅ Require pull request reviews (optional but recommended)

## Concurrency

The `concurrency` block ensures only one CI run per branch. If you push again while CI is running, the old run is cancelled. This saves minutes on rapidly-iterated PRs.

## For pnpm Users

Replace the setup step:

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 9
- uses: actions/setup-node@v4
  with:
    node-version-file: '.nvmrc'
    cache: 'pnpm'
- run: pnpm install --frozen-lockfile
```

## Automated Dependency Updates

### Dependabot

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

### Renovate

```json
// renovate.json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:recommended"],
  "packageRules": [
    { "matchUpdateTypes": ["minor", "patch"], "automerge": true }
  ]
}
```

Both tools open PRs automatically. Your CI pipeline validates each update.
