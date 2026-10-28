# Monorepo setup

What the `monorepo` templates add on top of the shared ones. The `setup-guardrails` skill detects workspaces and applies these. Use the `adding-a-package` skill for new packages afterwards.

## Layout

```text
package.json            workspaces, packageManager, root scripts and all tooling devDependencies
pnpm-workspace.yaml     pnpm only
tsconfig.base.json      shared compiler options, customConditions: ["source"]
tsconfig.json           root: only *.config.ts
turbo.json              build and typecheck tasks
.syncpackrc.json        one version per dependency
.dependency-cruiser.mjs tiers
knip.json               per-workspace entries
vitest.config.ts        one root config for all packages
packages/<name>/        libraries
apps/<name>/            deployables
```

## Root package.json

- `packageManager` is required by turbo 2 (for example `"pnpm@<version>"` or `"yarn@1.22.22"`).
- Scripts: `typecheck` runs `tsc --noEmit` for the root configs, then `turbo run typecheck`. `lint` runs `guardrails.mjs check` and `syncpack lint`.
- All guardrail tools are root devDependencies. Packages declare only what they import.

## Packages

Each package exports its TypeScript source under a `source` condition, ahead of the built output:

```json
{
  "name": "@acme/billing",
  "type": "module",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json"
  },
  "dependencies": { "@acme/types": "workspace:*" }
}
```

Two tsconfigs per package, so tests are typechecked but never emitted. `tsconfig.json`
(typecheck, includes tests):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src"]
}
```

`tsconfig.build.json` (emit `dist/`, no tests):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "rootDir": "src", "outDir": "dist" },
  "exclude": ["src/**/*.test.ts"]
}
```

## The `source` condition

`tsconfig.base.json` sets `customConditions: ["source"]`, Vitest sets `resolve.conditions: ["source"]`, and dependency-cruiser lists `source` first in `conditionNames`. All three resolve `@acme/types` to its `src/index.ts`.

The result: types are live across packages without a build, `typecheck` does not depend on `^build`, and tests run against source. Published consumers do not know the `source` condition and get `dist/`.

## turbo

`build` depends on `^build` and caches `dist/**`. `typecheck` has no dependencies, thanks to the `source` condition. Add more tasks as the repo needs them.

## syncpack

Two groups: workspace packages pin to `workspace:*` (`*` on npm and Yarn 1), and every other dependency has one version across the repo. For pnpm catalogs see [Package managers](./package-managers.md#catalogs).

## Knip

`knip.json` sets entries per workspace: `src/index.ts` for packages, `src/main.ts` or `src/index.ts` for apps. Adjust when a package has more entry points (CLI bins, workers).

## Vitest

One root config covers `{packages,apps}/*/src/**/*.test.ts`. Coverage is measured across all packages with one set of thresholds. If packages need different floors, use Vitest projects and give each its own thresholds.

## Tiers

Map packages to tiers in `.dependency-cruiser.mjs`. See [Architecture tiers](./architecture-tiers.md).
