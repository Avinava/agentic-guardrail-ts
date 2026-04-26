---
name: enforce-architecture
description: >
  Use when adding imports, creating packages, or reviewing code to ensure
  tiered dependency rules are followed. Read this to understand the tier system.
---

## Overview

This project enforces a **tiered dependency hierarchy** using `eslint-plugin-boundaries`. Every package is assigned to a tier. A package can import from any **lower** tier, but **never** from its own tier or higher.

This prevents circular dependencies, enforces separation of concerns, and makes the codebase navigable.

## The Tiers

```
┌─────────────────────────────────────────────────────────┐
│  Apps (deployable apps)             ← can import anything │
├─────────────────────────────────────────────────────────┤
│  Tier 4: orchestration              ← imports 0-3        │
├─────────────────────────────────────────────────────────┤
│  Tier 3: domain/business logic      ← imports 0-2        │
├─────────────────────────────────────────────────────────┤
│  Tier 2: infrastructure (DB, APIs)  ← imports 0-1        │
├─────────────────────────────────────────────────────────┤
│  Tier 1: config, helpers, utils     ← imports 0 only     │
├─────────────────────────────────────────────────────────┤
│  Tier 0: types, logger, constants   ← NO workspace deps  │
└─────────────────────────────────────────────────────────┘
```

**To see your project's actual tier assignments**, read the `eslint.config.js` file at the project root. The tier arrays (`tier0`, `tier1`, etc.) list which packages belong to each tier.

## Before Writing an Import

**ALWAYS check the tier rules before adding an import statement.**

Ask yourself:
1. What tier is the file I'm editing in?
2. What tier is the package I'm importing from?
3. Is the imported tier **strictly lower** than my tier?

If #3 is NO → **stop**. The import is illegal. Find another way:
- Move shared code to a lower-tier package
- Create a new leaf package at tier 0
- Use dependency injection (pass the dependency as a parameter)
- Ask the user if the tier assignment should change

## When ESLint Catches a Violation

If you see an error like:
```
error  'boundaries/dependencies' - Not allowed to import '@scope/database' from 'helpers'
```

Read carefully — common mistakes:
- Importing from the **same tier** (e.g. tier 1 → tier 1): illegal
- Importing **upward** (e.g. tier 2 → tier 3): illegal
- Test files are excluded from boundary checks — this is intentional

## Classifying a New Package

When creating a new package, assign it to the correct tier:

| If the package... | Assign to |
|-------------------|-----------| 
| Has NO workspace dependencies | Tier 0 |
| Only depends on types/logger | Tier 1 |
| Wraps external services (DB, API, queue) | Tier 2 |
| Contains business/domain logic | Tier 3 |
| Orchestrates multiple domain + infra packages | Tier 4 |
| Is a deployable app (CLI, web server, worker) | App tier |

Then update `eslint.config.js`:
1. Add the package name to the correct tier array
2. Add an entry to `boundaries/elements` with the correct pattern

## Common Violations and Fixes

### "I need types from a higher-tier package"
Extract the types into a tier 0 package (e.g. `shared-types`). Both packages can then import from tier 0.

### "Two packages at the same tier need to share code"
Create a new package at a lower tier and have both import from it.

### "The tier assignment feels wrong"
Discuss with the user. Sometimes a package is misclassified. Reclassifying early is cheap; reclassifying after 50 imports is expensive.

### "Tests need to import across tiers"
Test files (`__tests__/**`) are excluded from boundary checks. This is intentional — tests can import anything.

## Red Flags

| Situation | Problem |
|-----------|---------|
| Tier 0 package has workspace dependencies | Tier 0 must be pure leaf packages |
| More than 8-10 packages in a single tier | Tier is too broad — split it |
| App tier importing directly from tier 0 | Not wrong, but consider if an orchestrator should exist |
| Circular dependency warnings | Architecture violation — restructure needed |

## Escape Hatches and Paper Trails

Sometimes you genuinely need to disable a rule. That's OK — but every escape hatch must leave a paper trail.

Every `eslint-disable` comment MUST include:

1. **The specific rule** being disabled (never bare `// eslint-disable-next-line`)
2. **A reason** explaining why narrowing is impossible
3. **A tracking reference** (issue link, doc section, or `tech-debt.md` entry)

### Examples

```typescript
// GOOD — full paper trail
// eslint-disable-next-line @typescript-eslint/no-explicit-any — UseFormReturn<any>
// is polymorphic by design; see tech-debt.md#rhf-any-wrapper, tracked in #142
const form: UseFormReturn<any> = useForm(config);

// BAD — no context, no trail, future contributor has no idea why
// eslint-disable-next-line
const data = getResponse() as any;

// BAD — has the rule but no reason
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const result: any = parseInput(raw);
```

### Convention

- **No bare disables.** Every `eslint-disable` without a reason is a future mystery.
- **Cross-link to `tech-debt.md`** when the disable represents known debt (see [reference/tech-debt.md](../../reference/tech-debt.md) for the template).
- **Quarterly audit:** search for `eslint-disable` and verify each still has a valid reason + tracking reference. Prune any that no longer apply.

### If You're the Agent

Before adding an `eslint-disable`, ask yourself:
1. Can I fix the code to satisfy the rule instead?
2. If not, can I narrow the disable to a specific rule (not a blanket disable)?
3. Have I documented why this specific case can't be fixed?
4. Have I added a tracking reference so a human can find and evaluate this later?

If the answer to any of 2–4 is no, fix that before committing.

## Related Skills

- **setup-guardrails** — Initial ESLint boundaries setup
- **adding-a-package** — Full checklist for adding packages with tier assignment
