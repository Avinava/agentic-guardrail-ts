# Architecture Tiers

How to design your dependency hierarchy and enforce it with `eslint-plugin-boundaries`.

## The Problem

AI coding agents have **no understanding of your architecture**. When asked to "add a feature to package X," an agent will happily import from a higher-tier orchestration package — creating a circular dependency. The boundaries plugin stops this with a clear error message the agent can act on.

## How Tiers Work

```
                    ┌─────────────┐
    Tier 5 (apps)   │  cli / web  │  ← can import ANYTHING
                    └──────┬──────┘
                           │
    Tier 4 (orchestration) │ orchestrator  ← can import tier 0–3
                           │
    Tier 3 (domain)        │ domain-logic, processing  ← can import tier 0–2
                           │
    Tier 2 (infra)         │ database, external-api  ← can import tier 0–1
                           │
    Tier 1 (utils)         │ config, helpers  ← can import tier 0
                           │
    Tier 0 (leaf)          │ shared-types, logger  ← NO workspace imports
                    ───────┴──────────
```

**One rule governs everything:** A tier can import from any LOWER tier, never from its own tier or higher.

## Designing Your Tiers

### Step 1: Identify Leaf Packages

Leaf packages have **no workspace dependencies**. They are pure utilities that everything else can use:
- Type definitions
- Logging
- Constants
- Pure utility functions

These are **Tier 0**.

### Step 2: Work Upward

For each remaining package, ask: "What workspace packages does this depend on?"

- If it only depends on Tier 0 → it's Tier 1
- If it depends on Tier 0 + Tier 1 → it's Tier 2
- Continue until you reach your apps

### Step 3: Validate No Circular Dependencies

Draw your dependency graph. If package A depends on package B and B depends on A, they must be in the same package or one must be split.

### Step 4: Map to ESLint Config

```js
// eslint.config.js
const SCOPE = '@your-org';

const tier0 = ['shared-types', 'logger'];
const tier1 = ['config', 'helpers'];
const tier2 = ['database', 'external-api'];
const tier3 = ['domain-logic', 'processing'];
const tier4 = ['orchestrator'];
```

Then configure the boundary rules:
- Tier 0: disallow ALL `@your-org/*` imports
- Tier 1: disallow `@your-org/{tier1, tier2, tier3, tier4}` imports
- Tier 2: disallow `@your-org/{tier2, tier3, tier4}` imports
- And so on...
- Apps (top tier): no restrictions

## Real-World Example

### Before Guardrails
```
packages/database/src/client.ts:
  import { formatLog } from '@acme/orchestrator';  // ← WRONG! Tier 2 importing Tier 4
```

### What the Agent Sees
```
error  Import @acme/orchestrator is not allowed from packages/database (tier 2).
       @acme/orchestrator is tier 4. A package can only import from lower tiers.
       boundaries/dependencies
```

### After the Agent Self-Corrects
```
packages/database/src/client.ts:
  import { formatLog } from '@acme/logger';  // ← Correct! Tier 2 importing Tier 0
```

## For Single-Package Projects

If you don't have a monorepo, you can still use boundaries to enforce module isolation within a single package:

```js
{
  'boundaries/elements': [
    { type: 'domain', pattern: ['src/domain/*'], mode: 'folder' },
    { type: 'infra', pattern: ['src/infra/*'], mode: 'folder' },
    { type: 'api', pattern: ['src/api/*'], mode: 'folder' },
  ]
}
```

Rule: `domain/` should never import from `api/` or `infra/`.

## Further Reading

- [eslint-plugin-boundaries docs](https://github.com/javierbrea/eslint-plugin-boundaries)
- [Tool Reference](./tool-reference.md) — full ESLint config
- [Monorepo Setup](./monorepo-setup.md) — workspace configuration
