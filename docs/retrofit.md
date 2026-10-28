# Retrofit

How to adopt the guardrails on an existing codebase without stopping work.

## The idea

Turn every rule on as an error on day one, record what already fails, and fail only on new findings. Then pay the debt down in waves and lock in each improvement.

This replaces warn-only rules, warning budget headers and `--max-warnings=N`. Those let counts drift up unnoticed. The baseline cannot drift: it is counted per rule and per file, and only humans can loosen it.

## Day one

1. Run the `setup-guardrails` skill. It detects an existing codebase and works in retrofit mode.
2. Get format and typecheck clean first. Prettier is auto-fixable (`node scripts/guardrails.mjs exec prettier --write .`). Type errors are not baselined: `tsc` must pass.
3. Record the debt:

   ```bash
   node scripts/guardrails.mjs baseline --init
   ```

   This writes `guardrails.baseline.json`:

   ```json
   {
     "version": 1,
     "counts": {
       "depcruise:layer-domain|src/billing/invoice.ts": 2,
       "knip:exports|src/shared/format.ts": 3,
       "oxlint:typescript(no-non-null-assertion)|src/ledger/post.ts": 7
     }
   }
   ```

4. Set coverage floors to what you have today. Run `test:coverage` and put the measured numbers (rounded down) in `vitest.config.ts`. A floor of 41 is fine. It will only go up.
5. Commit the configs, the baseline and the floors together.

From now on:

- A new finding fails, even if you fixed a different one elsewhere. Counts do not trade between files or rules.
- Fixing findings makes the baseline stale. CI's `check --strict-baseline` fails until someone runs `baseline --tighten` and commits the result.
- `--tighten` also runs coverage with `GUARDRAILS_RATCHET=1`, which raises the floors to the new measured values.

## Measure first

Look at the baseline before planning waves. Group the keys by rule:

```bash
node -e "const c=require('./guardrails.baseline.json').counts;const t={};for(const[k,n]of Object.entries(c)){const r=k.split('|')[0];t[r]=(t[r]??0)+n}console.table(t)"
```

Most debt sits in a few rules. Sort the file part of the keys the same way to find the directories that carry it. Plan waves around those.

## Waves

Waves no longer flip severities. They are focused clean-up passes. Each wave ends with `baseline --tighten` and a commit. Keep one wave per PR so reviews stay small.

### Wave 1: auto-fixable

`node scripts/guardrails.mjs exec oxlint --type-aware --fix` handles a share of rules (`prefer-node-protocol`, `consistent-type-imports`, `import/no-duplicates` and others). Run it, review the diff, run tests, tighten, commit.

### Wave 2: type safety

Manual judgment. The usual patterns:

```ts
// non-null assertion
const name = user!.name;
// becomes
if (!user) throw new Error('user is required');
const name = user.name;
```

```ts
// object literal assertion
const config = {} as DatabaseConfig;
// becomes
const config: DatabaseConfig = { host: env.DB_HOST ?? 'localhost', port: Number(env.DB_PORT ?? 5432) };
```

```ts
// double cast
const order = payload as unknown as Order;
// becomes: validate at the boundary
const order = OrderSchema.parse(payload);
```

`no-unsafe-*` findings usually trace back to a few untyped sources (JSON parsing, an untyped client, `any` in a shared helper). Type the source and many findings disappear at once.

### Wave 3: architecture

1. List the dependency-cruiser keys. Group by the pair of directories or packages involved.
2. Fix one cluster at a time: move shared types or functions down a tier, or inject the dependency from above.
3. Run tests after each cluster. Don't batch the whole wave.

See [Architecture tiers](./architecture-tiers.md).

### Wave 4: discipline

Size, complexity, depth and parameter limits. Extract functions, replace long parameter lists with an options object, split large files by responsibility. These are the riskiest refactors, so they go last, after types and tests are in better shape.

### Dead code

Knip findings can be fixed in any wave. Delete unused files and exports. Remove unused dependencies from `package.json`.

## DI constructors and max-params

Oxlint counts constructor parameters for `max-params`, with no exemption. Constructor injection in a decorator-based container (NestJS, InversifyJS, tsyringe, Angular) routinely needs more than four.

- If the skill detects one of those containers, it sets `max-params` to `off` and writes the reason in `.oxlintrc.json`.
- Without a container, keep the limit. Replace long parameter lists with an options object:

  ```ts
  // before
  function createInvoice(customerId: string, lines: Line[], currency: string, dueDays: number, note?: string) {}
  // after
  function createInvoice(input: { customerId: string; lines: Line[]; currency: string; dueDays: number; note?: string }) {}
  ```

- A class that needs many collaborators is often doing too much. Splitting it is the real fix.

## External API field names

`naming-convention` is not in the defaults. Real code talks to APIs, databases and queues whose field names are `snake_case`, `SCREAMING_CASE` or worse, and forcing camelCase there only produces exemptions. Keep external names as they are in the types that describe the wire format, and map to your own names in one adapter at the edge if you want:

```ts
interface LedgerApiEntry { entry_id: string; posted_at: string }

function toEntry(raw: LedgerApiEntry): Entry {
  return { id: raw.entry_id, postedAt: new Date(raw.posted_at) };
}
```

`unicorn/filename-case` (kebab-case) still applies to file names.

## Disables and a debt ledger

Some findings cannot be fixed yet. A disable must name the rule and give a reason, or the gate fails (`guardrails disable-needs-rule-and-reason`). By convention the reason ends with a tracking reference:

```ts
// oxlint-disable-next-line typescript/no-explicit-any -- form library generic is polymorphic, see docs/tech-debt.md#form-any-wrapper
```

The tracking reference can be an issue link or an entry in a debt ledger. A simple ledger is an append-only markdown file:

```md
## Active

### form-any-wrapper
- Owner: @billing-team
- Found: 2026-11-02
- Status: open
- Root cause: the form library's return type is generic over any; a typed wrapper does not exist yet.
- Disables: 3 (form-provider.tsx, use-form.ts, form-context.ts)

## Resolved

### legacy-rates-response
- Status: resolved in a1b2c3d
- Root cause: the rates API returned untyped JSON. Now parsed with a schema.
```

Rules for the ledger: add an entry with every new disable, keep the counts current, review open entries regularly, and move resolved entries down instead of deleting them.

## Pitfalls

| Pitfall | Why it hurts | Instead |
| --- | --- | --- |
| Editing the baseline by hand | Hides new debt | Fix the code, then `--tighten` |
| `baseline --reset` to get green | Accepts every new finding | Human-reviewed, rename-only commits |
| Mixing waves in one PR | Hard to review and to bisect | One wave per PR |
| Forgetting to tighten | Fixed debt can come back | CI's `--strict-baseline` forces it |
| Lowering coverage floors | Coverage drifts down | Floors only go up |
| Fixing unrelated findings in a feature PR | Noisy diffs | Leave them to the wave that owns them |

## Rough timeline

| Size | Day one | Paying down |
| --- | --- | --- |
| Under 10k lines | An hour | A few days |
| 10k to 50k lines | Half a day | One to three weeks, a wave per few days |
| Over 50k lines | A day | A wave per week, shared across the team |

The gate protects you from day one. Paying down is optional and can go at any pace.
