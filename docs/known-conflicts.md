# Known conflicts

Tool interactions that surprise people, and what to do about them.

## TypeScript 7 and tools that need the TS API

**Symptom:** dependency-cruiser, Knip or a JS lint plugin fails to load, or complains about TypeScript 7.

**Why:** TS 7 is native and has no programmatic API. Tools that import `typescript` need TS 6.

**Resolution:** keep both aliases. `typescript` is `npm:@typescript/typescript6@^6` (binary `tsc6`), `@typescript/native` is `npm:typescript@^7` (binary `tsc`). Do not "fix" `typescript` back to `^7`. See [decision 0001](./decisions/0001-engine.md).

## Two `tsc` binaries

**Symptom:** `tsc --version` prints 6.x.

**Why:** something else in the tree installed a real `typescript` package that owns the `tsc` binary, or an old lockfile still resolves `typescript` to a non-aliased version.

**Resolution:** check `node_modules/.bin/tsc` points into the TS 7 package. Remove stray `typescript` entries from workspace packages and reinstall.

## Oxlint JS plugins and sonarjs

**Symptom:** enabling `eslint-plugin-sonarjs` through Oxlint's JS plugins fails to load.

**Why:** JS plugins are alpha, and sonarjs needs the TS API.

**Resolution:** it works only with the TS 6 alias in place. typescript-eslint's `naming-convention` does not load even then. The native `complexity`, `max-depth` and `max-lines-per-function` rules are the default.

## max-params and DI constructors

**Symptom:** every injected service class fails `max-params`.

**Why:** Oxlint counts constructor parameters and has no exemption option.

**Resolution:** when a decorator-based DI container is detected, the skill sets `max-params` to `off` with the reason in the config. Otherwise, see [Retrofit](./retrofit.md#di-constructors-and-max-params).

## unicorn/filename-case and framework file names

**Symptom:** files whose names a framework dictates (route segments like `[id].ts`, generated clients) fail kebab-case.

**Resolution:** add an `overrides` entry in `.oxlintrc.json` for those paths that turns the rule off, with a comment naming the framework convention. Do not rename the whole codebase's convention.

## Knip and dynamic loading

**Symptom:** Knip reports files or dependencies as unused when they are loaded by string (plugin registries, route maps, config-referenced plugins, transports loaded by a logger).

**Resolution:** add the registry file to `entry`, or the package to `ignoreDependencies`, with a comment naming the loader. Prefer `entry`: it keeps checking what the registry imports.

## Knip and aliased or binary-only tools

**Symptom:** Knip reports `oxlint`, `oxlint-tsgolint`, `@typescript/native`, `vite` or `@commitlint/cli` as unused.

**Resolution:** they are in `ignoreDependencies` in the template. Keep them there when you edit `knip.json`.

## dependency-cruiser and the `source` condition

**Symptom:** in a monorepo, imports between packages show as `not-to-unresolvable`, or resolve to `dist/` and miss tier violations.

**Resolution:** keep `source` first in `enhancedResolveOptions.conditionNames`, and give every package a `"source"` export. See [Monorepo setup](./monorepo-setup.md#the-source-condition).

## dependency-cruiser and path aliases

**Symptom:** imports using `paths` aliases (`@/billing/x`) are unresolvable.

**Resolution:** point `options.tsConfig.fileName` at the tsconfig that declares the `paths`.

## Baseline keys and file renames

**Symptom:** after moving or renaming a file, its old findings fail as new.

**Why:** baseline keys are `tool:rule|file`. A new path is a new key.

**Resolution:** fix the findings while you move the file (best), or have a human run `baseline --reset` in a reviewed commit that only renames.

## Vitest 5 and Yarn 1

**Symptom:** Vitest fails to start because `vite` is missing.

**Resolution:** `vite` is a peer of Vitest 5, and Yarn 1 does not install peers. The templates list it explicitly. Keep it.

## turbo and `packageManager`

**Symptom:** turbo 2 refuses to run with a message about the package manager.

**Resolution:** add `"packageManager": "<name>@<version>"` to the root `package.json`.

## lefthook and leftover husky config

**Symptom:** `lefthook install` warns about `core.hooksPath`, or hooks never run.

**Resolution:** husky sets `core.hooksPath`. Run `git config --unset core.hooksPath`, then `lefthook install`. See [Migrating from v2](./migrating-from-v2.md).

## Yarn Plug'n'Play

**Symptom:** `guardrails: oxlint is not installed`.

**Resolution:** `guardrails.mjs` runs tools from `node_modules/.bin`. Set `nodeLinker: node-modules` in `.yarnrc.yml`.

## Prettier and generated files

**Symptom:** Prettier rewrites a generated file (column-aligned tables, generated clients) on every commit, and the generator rewrites it back.

**Resolution:** add the file to `.prettierignore` with a comment naming the generator.
