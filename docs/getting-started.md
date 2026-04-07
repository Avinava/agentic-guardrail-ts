# Getting Started

Set up automated guardrails for your TypeScript project in under 10 minutes.

## Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- **Git** initialized in your project
- A `package.json` in your project root

## Agent-First Setup (Recommended)

Tell your AI coding agent:

> Fetch and follow the instructions from
> `https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/skills/setup-guardrails/SKILL.md`
> to set up TypeScript guardrails in this project.

The agent will detect your project type, fetch configs, install dependencies, and set up git hooks — all automatically.

## Manual Setup

```bash
bash <(curl -sL https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/scripts/init.sh)
```

The interactive script will:
1. Detect your existing `package.json` (if present)
2. Ask for project type (single package or monorepo)
3. Ask for package manager (npm / pnpm / yarn)
4. Ask for your npm org scope — auto-detected if possible
5. Copy all config files with your scope substituted
6. Optionally install devDependencies and git hooks

## What Gets Created

```
your-project/
├── .editorconfig          # Editor whitespace/encoding
├── .nvmrc                 # Pinned Node.js version
├── .prettierrc            # Formatting rules
├── .prettierignore        # Files to skip formatting
├── commitlint.config.ts   # Commit message rules
├── eslint.config.js       # ESLint + TypeScript strict + boundaries
├── knip.json              # Dead code detection
├── lefthook.yml           # Pre-commit hook orchestration
├── tsconfig.base.json     # TypeScript strict settings
├── vitest.config.ts       # Test runner + coverage
└── scripts/
    ├── typecheck-staged.sh
    └── publint-all.sh
```

Monorepo projects also get `.syncpackrc.json` and `turbo.json`.

## Add Scripts to package.json

After setup, add these scripts to your `package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "lint": "eslint 'src/**/*.ts'",
    "lint:unused": "knip",
    "lint:deps": "syncpack lint",
    "prettier:check": "prettier --check '**/*.{ts,tsx,js,json,md,yml,yaml}'",
    "prettier:fix": "prettier --write '**/*.{ts,tsx,js,json,md,yml,yaml}'",
    "prepare": "lefthook install"
  },
  "lint-staged": {
    "*.{ts,tsx,js,jsx,mjs,cjs,json,md,css,html,yml,yaml}": "prettier --write"
  }
}
```

## Customize for Your Project

### 1. ESLint Boundaries (eslint.config.js)

For a single package, simplify the boundaries config or remove it entirely. The TypeScript strict rules still apply.

For monorepos, replace the example tier arrays with YOUR actual package names. Look for the `CUSTOMIZE` comments in the file.

### 2. Commitlint Scopes (commitlint.config.ts)

Replace the scope-enum array with scopes relevant to your project:

```ts
'scope-enum': [2, 'always', ['core', 'api', 'ui', 'deps', 'ci', 'release']]
```

### 3. Knip Workspaces (knip.json)

For a single package, simplify to:

```json
{
  "$schema": "https://unpkg.com/knip@latest/schema.json",
  "entry": ["src/index.ts"],
  "project": ["src/**/*.ts"],
  "ignoreExportsUsedInFile": true
}
```

## Verify It Works

Make an intentional mistake and try to commit:

```bash
# Add a console.log (banned by ESLint)
echo 'console.log("oops");' >> src/index.ts
git add .
git commit -m "test: verify guardrails"

# ✗ ESLint will catch console.log
# The commit will be REJECTED with clear error messages
```

Fix the issue and retry — that's the self-correcting loop.

## Next Steps

- [Tool Reference](./tool-reference.md) — deep dive on each of the 13 tools
- [Architecture Tiers](./architecture-tiers.md) — how to design your dependency hierarchy
- [Monorepo Setup](./monorepo-setup.md) — if you have workspaces
- [CI Pipeline](./ci-pipeline.md) — GitHub Actions configuration
- [Troubleshooting](./troubleshooting.md) — common issues

## Skills Reference

For agent-driven workflows, point your agent at:
- [setup-guardrails](../skills/setup-guardrails/SKILL.md) — full installation
- [enforce-architecture](../skills/enforce-architecture/SKILL.md) — tier rules
- [self-correcting-loop](../skills/self-correcting-loop/SKILL.md) — commit feedback loop
- [adding-a-package](../skills/adding-a-package/SKILL.md) — new workspace packages
