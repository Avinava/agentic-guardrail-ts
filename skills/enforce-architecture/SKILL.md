---
name: enforce-architecture
description: >
  Layer and tier rules for a guardrailed TypeScript repo, enforced by dependency-cruiser.
  Use before adding an import across directories or packages, when a `depcruise` finding
  (layer-*, tier-*, no-circular, not-to-dev-dep, no-relative-cross-package) blocks you,
  when classifying a new package, or when changing the layer or tier map.
---

# Enforce architecture

Imports flow **downward only**. dependency-cruiser checks this on every commit, in the stop hook
and in CI. Rules live in `.dependency-cruiser.mjs` at the repo root:
- **Single package:** a `LAYERS` array of source directories, lowest first.
- **Monorepo:** a `TIERS` array of workspace directories, lowest first.

```
apps/*             deployable apps: may import any package, never another app
tier N             may import tiers 0..N-1, never its own tier, never above
...
tier 1             config, helpers, adapters to tier 0
tier 0             types, constants, pure utilities: no workspace dependencies
```

A single package works the same way with directories, for example
`src/shared` < `src/domain` < `src/application` < `src/infrastructure` < `src/interface`.

## Before you write an import

1. Find the layer or tier of the file you are editing and of the module you want, using
   `.dependency-cruiser.mjs`.
2. **The target is strictly lower:** go ahead.
3. **The target is the same tier** (a different package) **or higher:** stop. Use one of these
   instead:
   - **Move the shared code down.** Extract the type, constant or pure function into a lower
     layer or a tier-0 package that both sides can import.
   - **Invert the dependency.** Define an interface in the lower layer and implement it in the
     higher one. Pass the implementation in through the constructor, a parameter or a composition
     root.
   - **Ask whether the classification is wrong.** If a package keeps needing a peer, the tiers may
     be off. Propose a change to the user. Don't edit the arrays yourself to get green.
4. **In a monorepo, import other packages by name** (`@acme/core`), never by relative path into
   another package. `no-relative-cross-package` enforces this. Then add the dependency to the
   importing package's `package.json`.

## Reading a finding

```
packages/types/src/index.ts:0  depcruise tier-0  imports packages/core/src/index.ts
src/domain/pricing.ts:0  depcruise layer-domain  imports src/infrastructure/order-store.ts
packages/core/src/index.ts:0  depcruise no-circular  imports packages/types/src/index.ts
```

| Rule | Meaning | Fix |
| --- | --- | --- |
| `tier-N` / `layer-<name>` | Upward or same-tier import | Move code down, or invert the dependency |
| `no-circular` | A cycle | Extract the shared part. The finding is reported on one file in the cycle. |
| `not-to-unresolvable` | Import doesn't resolve | Fix the path. In a monorepo, add the dependency and reinstall. |
| `not-to-dev-dep` (single package) | Production code imports a devDependency | Move it to `dependencies`, or keep it in tests only |
| `no-non-package-json` | Imported package isn't declared | Add it to the importing package's `package.json` |
| `no-relative-cross-package` (monorepo) | `../../other-package/src/x` | Import by package name |

To see the whole graph:
```bash
node scripts/guardrails.mjs exec depcruise src -c .dependency-cruiser.mjs -T text
```
Use `packages apps` instead of `src` in a monorepo.

## Classifying a new package (monorepo)

| The package... | Tier |
| --- | --- |
| has no workspace dependencies (types, constants, pure utils) | 0 |
| wraps config, logging or tier-0 helpers | 1 |
| talks to external systems (DB, HTTP, queues) | 2 |
| holds domain or business logic | 3 |
| orchestrates domain and infrastructure | 4 |
| is deployable (CLI, server, worker, web app) | `apps/*` |

Add the directory to the right `TIERS` entry in `.dependency-cruiser.mjs`. A tier with more than
8 to 10 packages is too broad: split it.

## Dependency injection and `max-params`

Constructor injection fits this architecture. Oxlint's `max-params` counts constructor
parameters, though, and it has no exemption.
- **Decorator DI container** (NestJS, InversifyJS, tsyringe, Angular): `setup-guardrails` turns
  `max-params` off, with a comment explaining why.
- **No container:** prefer a single `deps` object. It reads better and keeps `max-params` on for
  everything else. Assign it in the body: `erasableSyntaxOnly` rejects parameter properties.

  ```ts
  class OrderService {
    private readonly deps: OrderDeps;
    constructor(deps: OrderDeps) {
      this.deps = deps;
    }
  }
  ```

## Escape hatches leave a paper trail

A disable is a last resort. It's acceptable only when the code is right and the rule can't express
that. Every disable must:
1. name the specific rule,
2. give the reason after ` -- `, and
3. give a tracking reference (an issue, ADR or tech-debt entry).

```ts
// good
// oxlint-disable-next-line typescript/no-explicit-any -- third-party form API is untyped; tracked in #142
const form: FormApi<any> = createForm(config);

// rejected by the gate (guardrails disable-needs-rule-and-reason)
// oxlint-disable-next-line
const data = getResponse() as any;
```

There is no disable comment for architecture findings. A real exception goes through the user:
1. Add a narrowly scoped `pathNot` to the rule.
2. Write a comment in `.dependency-cruiser.mjs` that names the reason and the tracking reference.
3. Review it like any other exception.

Audit the escape hatches regularly:
`rg -n "(eslint|oxlint)-disable" --glob '!node_modules'`. Remove the ones that no longer apply.

## Red flags

- **A tier-0 package with workspace dependencies:** it isn't tier 0.
- **Two packages in the same tier that keep needing each other:** they're one package, or they're
  missing a lower shared package.
- **`no-circular` findings in the baseline:** fix them first. Cycles make every other refactor
  harder.
- **An app importing another app:** extract a package.

Related skills: `setup-guardrails` (installs dependency-cruiser), `adding-a-package` (new
workspace), `guardrails-loop` (responding to a rejected change).
