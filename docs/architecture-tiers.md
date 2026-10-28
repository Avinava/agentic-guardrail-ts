# Architecture tiers and layers

Agents do not know your architecture. Asked to add a feature, they import whatever is closest, including from code that should depend on them. dependency-cruiser turns the intended direction into a rule that fails with the file and the rule name.

One rule covers both cases: **code may import from lower levels only.**

## Single package: layers

`.dependency-cruiser.mjs` lists directories lowest first:

```js
const LAYERS = [
  'src/shared',
  'src/domain',
  'src/application',
  'src/infrastructure',
  'src/interface',
];
```

`src/domain` may import `src/shared`. It may not import `src/application`, `src/infrastructure` or `src/interface`. Each generated rule is named after the layer it protects (`layer-domain`). The skill maps this list to the directories your project actually has.

## Monorepo: tiers

`TIERS` lists workspace directories lowest first. Globs are allowed.

```js
const TIERS = [
  ['packages/types', 'packages/logger'], // tier 0: no workspace dependencies
  ['packages/config'],                   // tier 1
  ['packages/billing', 'packages/ledger'], // tier 2
  ['apps/*'],                            // apps
];
```

A package may import packages in lower tiers only. It may not import a package in its own tier, which also means one app never imports another. Rules are named `tier-0`, `tier-1`, and so on.

## Designing tiers

1. **Find the leaves.** Packages with no workspace dependencies (types, logging, constants, pure utilities) are tier 0.
2. **Work upward.** A package that depends only on tier 0 is tier 1. One that depends on tier 1 is tier 2. Continue to the apps.
3. **Resolve cycles.** If two packages need each other, they belong together, or the shared part moves into a lower package.
4. **Keep tiers wide and few.** Three to five tiers is typical. Same-tier imports are forbidden, so put packages in the same tier only when they are true peers.

Layers in a single package follow the same steps with directories.

## What the agent sees

```text
guardrails: 1 new finding(s) above the baseline (0 known)
  packages/ledger/src/post.ts:0  depcruise tier-2  imports packages/billing/src/index.ts
```

`packages/ledger` and `packages/billing` are both tier 2. The fix is to move the shared type or function down to a tier 0 or tier 1 package, or to pass it in from the app that already depends on both.

## Other rules

| Rule | Variant | Catches |
| --- | --- | --- |
| `no-circular` | both | Import cycles |
| `not-to-unresolvable` | both | Imports that do not resolve |
| `no-non-package-json` | both | Packages imported but not declared (phantom deps) |
| `not-to-dev-dep` | single | Production code importing a devDependency |
| `not-to-test` | single | Production code importing test files |
| `no-relative-cross-package` | monorepo | `../../other-package/src/x` instead of the package name |

## Existing violations

On an existing codebase, current violations go into the baseline like any other finding. Fix them by cluster: most violations come from a few package pairs. See [Retrofit](./retrofit.md#wave-3-architecture).

## Changing the map

Adding a directory or package, or moving one between tiers, is an edit to `LAYERS` or `TIERS`. Use the `enforce-architecture` skill for reviews and changes, and the `adding-a-package` skill for new workspace packages. Raising a package's tier to make an import legal is a design change: a human should approve it.
