# Retrofit Rollout — Worked Example

How to adopt the guardrail stack in an existing TypeScript codebase without disrupting your workflow.

## The Third Invariant

**Tools become gates only when their baseline is exit-0.**

A rule moves to `error` only when the codebase has zero violations. Adding a gate over a non-zero baseline forces `--max-warnings=N` workarounds that decay over time. Never use them.

## Before You Start

Run a baseline audit to understand what you're working with:

```bash
# Count existing lint violations
npx eslint 'src/**/*.ts' --no-error-on-unmatched-pattern 2>&1 | grep -c 'error\|warning'

# Count @ts-ignore / @ts-expect-error
grep -r '@ts-ignore\|@ts-expect-error' src/ | wc -l

# Count non-null assertions
grep -r '!\.' src/ --include='*.ts' | grep -v node_modules | wc -l
```

These numbers determine your wave plan.

## The Warning Budget Header

Every retrofit ESLint config starts with a warning budget header:

```js
// ── WARNING BUDGET (retrofit mode) ──────────────────────────
// These rules are at 'warn' until the violation count reaches 0.
// Drive each to zero, then flip to 'error' in the same commit.
//
// Rule                               Count   Target
// import-x/default                   12      Wave 1
// import-x/named                     3       Wave 1
// no-non-null-assertion              47      Wave 2
// consistent-type-assertions         8       Wave 2
// boundaries/dependencies            22      Wave 3
//
// Last audited: 2026-04-26
// ─────────────────────────────────────────────────────────────
```

Update this header after every wave. It's your progress tracker and audit trail.

## Wave-by-Wave Walkthrough

### Wave 1: Auto-fixable Rules (same day)

These rules have auto-fix support. Run once, commit, done.

```bash
# Fix import ordering
npx eslint --fix 'src/**/*.ts' --rule 'import-x/order: error'

# Fix formatting
npx prettier --write .

# Fix duplicate imports
npx eslint --fix 'src/**/*.ts' --rule 'import-x/no-duplicates: error'
```

These should already be at `error` in your config (they're auto-fixable, so baseline is immediately zero).

**Commit:** `refactor(lint): auto-fix import ordering and formatting`

### Wave 2: Import Correctness (1–3 days)

`import-x/default` and `import-x/named` catch stale import shapes. Common causes:

**Default → Named migration:**
```typescript
// BEFORE: module exports a named export, not default
import CacheService from './cache-service';
//       ^^^^^^^^^^^ import-x/default error

// AFTER: use named import
import { CacheService } from './cache-service';
```

**React.lazy with named exports:**
```typescript
// BEFORE: React.lazy expects a default export
const LazyPage = React.lazy(() => import('./pages/Dashboard'));

// AFTER: adapter for named export
const LazyPage = React.lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.Dashboard }))
);
```

**When count reaches zero:**
```bash
# Verify
npx eslint 'src/**/*.ts' --rule 'import-x/default: error' 2>&1 | grep -c 'error'
# Should output: 0

# Flip in eslint.config.js: 'warn' → 'error'
# Update the warning budget header
# Commit in a single commit:
git commit -m "refactor(lint): flip import-x/default warn→error (0 violations)"
```

### Wave 3: Type Safety (3–7 days)

These require manual judgment:

**Non-null assertions (`!`):**
```typescript
// BEFORE
const name = user!.name;

// AFTER: proper null handling
const name = user?.name ?? 'Unknown';
// or
if (!user) throw new Error('User required');
const name = user.name;
```

**Object literal assertions (`{} as Foo`):**
```typescript
// BEFORE
const config = {} as DatabaseConfig;

// AFTER: proper construction
const config: DatabaseConfig = {
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
};
```

**Double-cast (`as unknown as T`):**
```typescript
// BEFORE: bypasses the type system
const result = response as unknown as UserRecord;

// AFTER: validate at runtime
function isUserRecord(data: unknown): data is UserRecord {
  return typeof data === 'object' && data !== null && 'id' in data;
}
if (!isUserRecord(response)) throw new Error('Invalid response shape');
const result = response;
```

### Wave 4: Architecture Boundaries (1–2 weeks, monorepo only)

This is the longest wave. Cross-tier imports require structural refactoring:

1. **Identify violations:** `npx eslint 'packages/*/src/**/*.ts' --rule 'boundaries/dependencies: error'`
2. **Group by pattern:** Most violations cluster around a few cross-tier pairs
3. **Refactor per cluster:**
   - Move shared types to a tier 0 package
   - Move shared utilities to a lower-tier package
   - Use dependency injection for complex cases
4. **Test after each cluster** — don't batch the entire wave

## Common Pitfalls

| Pitfall | Why It's Bad | What to Do Instead |
|---------|-------------|-------------------|
| Using `--max-warnings=N` | Count silently grows; no one notices 200→250 | Use the warning budget header |
| Mixing waves | Hard to track which rule flip caused a regression | Complete one wave before starting the next |
| Force-flipping at non-zero | Pre-commit starts failing on existing code | Only flip when count is genuinely zero |
| Batch-fixing everything at once | Massive PR that's impossible to review | Wave-by-wave, each wave in its own PR |
| Skipping the budget header update | Progress becomes invisible | Update after every wave commit |

## Timeline Expectations

| Codebase Size | Total Retrofit Time | Notes |
|--------------|-------------------|-------|
| Small (<10k LOC) | 1–2 days | Often completable in a single session |
| Medium (10–50k LOC) | 1–2 weeks | Waves 1–2 same day; Waves 3–4 over the week |
| Large (50k+ LOC) | 2–4 weeks | Plan a wave per week; get the team involved |

## Related

- [setup-guardrails skill](../skills/setup-guardrails/SKILL.md) — Step 1e detection + Wave Sequencing section
- [troubleshooting](../docs/troubleshooting.md) — "Setup Produced Hundreds of Warnings" entry
- [getting-started](../docs/getting-started.md) — "If Your Project Isn't Greenfield" section
