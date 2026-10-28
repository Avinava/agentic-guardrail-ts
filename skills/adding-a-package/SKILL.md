---
name: adding-a-package
description: >
  Add a new workspace package to a guardrailed TypeScript monorepo so that typecheck, tests,
  dependency-cruiser tiers, Knip and syncpack all pick it up. Use when creating a package or
  app under packages/ or apps/, or when a new package is invisible to the guardrails.
---

# Adding a package

Use this in a monorepo that `setup-guardrails` has already set up. A new package needs four
things:
- a `package.json` with a `source` export condition
- a `tsconfig.json` that extends the base and typechecks source and tests, plus a
  `tsconfig.build.json` that emits `dist` without tests
- an entry in the dependency-cruiser tiers
- a dependency entry in each package that consumes it

Turbo, Vitest, Knip, Oxlint and syncpack find it automatically through the workspace globs.

## Steps

1. **Name and tier.**
   - **Scope:** read it from the root `package.json` or a sibling package, e.g. `@acme`.
   - **Name:** kebab-case.
   - **Tier:** pick one with the `enforce-architecture` table, and confirm it with the user when it
     isn't obvious.
2. **Create the directory.**
   - `packages/<name>` for a library, `apps/<name>` for something deployable.
   - Write the four files below.
   - Replace `@acme/example` with `@<scope>/<name>`.
   - Apps that run on Node can drop `exports` and add a `start` script.
3. **Make it buildable on its own.**
   - **Publishable libraries:** remove `"private": true` and keep `"files": ["dist"]`. Add
     `publint` and `@arethetypeswrong/cli` to the root devDependencies and a package script
     `"lint:pkg": "publint && attw --pack ."`. Run it after `build`.
   - **Internal libraries:** keep `"private": true`. The `source` condition means consumers never
     need it built for typecheck or tests.
4. **Register the tier.**
   - Add the directory to the right `TIERS` entry in `.dependency-cruiser.mjs`.
   - `apps/*` is already covered by its glob.
5. **Wire up the consumers.** Add the package to each consumer's `dependencies` using the repo's
   protocol:
   - `workspace:*` for pnpm, yarn berry and bun.
   - `*` for npm and yarn 1.

   Then reinstall with the repo's package manager.
6. **Add Knip entries only when needed.** Add them only if the package's entry isn't `src/index.ts`
   (apps: `src/main.ts` or `src/index.ts`), which the workspace globs already cover.
7. **Verify:**
   ```bash
   node scripts/guardrails.mjs verify   # includes syncpack lint via the lint script
   ```
   If dependency-cruiser reports `not-to-unresolvable` for the new package, the dependency is
   missing from the consumer, or you haven't reinstalled.

## Templates

`package.json`:

<!-- tmpl:templates/package/package.json -->
```json
{
  "name": "@acme/example",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": {
      "source": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json"
  }
}
```
<!-- /tmpl -->

`tsconfig.json`:

<!-- tmpl:templates/package/tsconfig.json -->
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"]
}
```
<!-- /tmpl -->

`tsconfig.build.json`:

<!-- tmpl:templates/package/tsconfig.build.json -->
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "src",
    "outDir": "dist"
  },
  "exclude": ["src/**/*.test.ts"]
}
```
<!-- /tmpl -->

`src/index.ts`:

<!-- tmpl:templates/package/src/index.ts -->
```ts
export {};
```
<!-- /tmpl -->

## Checklist

- [ ] `package.json` has the `source` export and the `build` and `typecheck` scripts
- [ ] `tsconfig.json` extends `../../tsconfig.base.json` and includes the tests; `tsconfig.build.json` excludes them
- [ ] The directory is listed in `TIERS` (libraries)
- [ ] Consumers declare the dependency with the right protocol, and you reinstalled
- [ ] `verify` passes
