# Package managers

The templates work with npm, pnpm, Yarn and Bun. `scripts/guardrails.mjs` picks the package manager from the lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock` or `bun.lockb`, otherwise npm) and runs binaries from `node_modules/.bin`. Hooks and CI call `node scripts/guardrails.mjs`, so they do not depend on `npx` or `pnpm exec`.

The `setup-guardrails` skill detects the package manager and installs with it. It never switches managers or mixes lockfiles.

## Summary

| | npm | pnpm | Yarn 1 | Yarn Berry | Bun |
| --- | --- | --- | --- | --- | --- |
| Workspaces | `workspaces` in `package.json` | `pnpm-workspace.yaml` | `workspaces` | `workspaces` | `workspaces` |
| Internal dep version | `*` | `workspace:*` | `*` | `workspace:*` | `workspace:*` |
| syncpack `pinVersion` | `*` | `workspace:*` | `*` | `workspace:*` | `workspace:*` |
| CI install | `npm ci` | `pnpm install --frozen-lockfile` | `yarn install --frozen-lockfile` | `yarn install --immutable` | `bun install --frozen-lockfile` |
| `setup-node` cache | `npm` | `pnpm` | `yarn` | `yarn` | none |

Monorepos also need a `packageManager` field (for example `"pnpm@<version>"`) because turbo 2 requires it.

## npm

The default. npm 7+ installs peer dependencies, so `vite` would arrive anyway, but the templates list it to keep behavior the same everywhere. npm has no `workspace:` protocol, so the skill sets the syncpack pin to `*`.

## pnpm

- Workspaces live in `pnpm-workspace.yaml`.
- Internal dependencies use `workspace:*`, which is the template default for syncpack.
- pnpm's strict layout makes undeclared imports fail at runtime. dependency-cruiser's `no-non-package-json` catches them earlier.
- CI needs the `pnpm/action-setup` step, which the CI template includes.

### Catalogs

With catalogs, versions live in `pnpm-workspace.yaml` and packages refer to them:

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'
catalog:
  zod: ^4.1.0
  vitest: ^5.0.5
```

```json
{ "dependencies": { "zod": "catalog:" } }
```

Tell syncpack that `catalog:` is the expected specifier for those dependencies, so it does not report them as mismatches. Add a version group before the catch-all group:

```json
{
  "label": "Catalog dependencies are declared once in pnpm-workspace.yaml",
  "dependencies": ["zod", "vitest"],
  "pinVersion": "catalog:"
}
```

Keep tooling devDependencies (Oxlint, Prettier, dependency-cruiser and the rest) in the root `package.json`. Aliased packages (`typescript`, `@typescript/native`) can go in the catalog as `npm:` specifiers if you prefer.

## Yarn 1 (classic)

- No `workspace:` protocol. Internal dependencies use `*`, and the syncpack pin is changed to `*`.
- Yarn 1 does not install peer dependencies. That is why `vite` is listed explicitly for Vitest 5.
- `yarn run <script>` works for every script `verify` calls.

## Yarn Berry (2+)

- Set `nodeLinker: node-modules` in `.yarnrc.yml`. `guardrails.mjs` runs tools from `node_modules/.bin`, and several tools do not support Plug'n'Play.
- Enable Corepack in CI (`corepack enable`) before `setup-node` uses the Yarn cache.
- `workspace:*` works as in pnpm.

## Bun

- Bun reads `workspaces` from `package.json` and supports `workspace:*`.
- `guardrails.mjs` detects `bun.lock` (text) and `bun.lockb` (binary).
- In CI, replace `pnpm/action-setup` and the `setup-node` cache with `oven-sh/setup-bun`, pinned by commit SHA. Keep Node installed: the hooks and `guardrails.mjs` run on Node.

## What does not change

Every config is package-manager agnostic: `.oxlintrc.json`, `.dependency-cruiser.mjs`, `knip.json`, `tsconfig*.json`, `vitest.config.ts`, `lefthook.yml`, `commitlint.config.mjs`, `turbo.json`, the Prettier files and the agent files.
