# Design: `enforce-code-discipline` Skill

**Date:** 2026-05-15
**Status:** Approved

---

## Problem

The existing guardrail stack (`setup-guardrails`) enforces formatting, import order, type safety, architecture boundaries, and secret scanning. It does not enforce:

- File and function size limits (LLMs create bloated files and long functions)
- Cognitive complexity (LLMs write deeply nested, hard-to-follow logic)
- Naming consistency (LLMs use inconsistent casing and file naming)
- Code idioms (LLMs use legacy CJS patterns, index-based loops, `.forEach`)
- Duplicate code (LLMs copy-paste instead of extracting)
- Test coverage (LLMs skip tests unless forced by a hard gate)
- Documentation coverage for public APIs

The result: code that compiles and passes current checks but is architecturally messy, hard to maintain, and hard to reason about.

---

## Solution

A new companion skill: `skills/enforce-code-discipline/SKILL.md`

This skill extends an existing guardrail installation with a second enforcement layer targeting LLM coding discipline specifically. It is invoked after `setup-guardrails` and appends to (never overwrites) the existing `eslint.config.js`.

---

## Architecture

### New Skill

`skills/enforce-code-discipline/SKILL.md`

Agent-executable steps:
1. Detect project context (reads existing `eslint.config.js`, `vitest.config.ts`, `package.json`)
2. Assess greenfield vs retrofit (same logic as `setup-guardrails` Step 1e)
3. Install three new plugins: `eslint-plugin-unicorn`, `eslint-plugin-sonarjs`, `eslint-plugin-jsdoc`
4. Append a discipline config block to `eslint.config.js`
5. Update `vitest.config.ts` to add coverage thresholds
6. Run verification commit

### Existing Files Modified

| File | Change |
|---|---|
| `skills/setup-guardrails/SKILL.md` | Add `enforce-code-discipline` to Related Skills section |
| `README.md` | Add new row to skills table |
| `reference/single-package/eslint.config.js` | Add discipline block |
| `reference/monorepo/eslint.config.js` | Add discipline block |
| `reference/single-package/vitest.config.ts` | Add coverage thresholds |

### New Reference Files

| File | Purpose |
|---|---|
| `reference/single-package/eslint.config.js` | Updated with discipline rules |
| `reference/monorepo/eslint.config.js` | Updated with discipline rules |

---

## Rule Set

### Domain 1: Complexity & Size (built-in ESLint)

| Rule | Threshold | Rationale |
|---|---|---|
| `max-lines` | 300 | Forces decomposition — LLMs pad files |
| `max-lines-per-function` | 40 | Functions over 40 lines are doing too much |
| `max-params` | 4 | >4 params signals missing options object |
| `max-depth` | 4 | Nesting past 4 is callback soup |
| `max-classes-per-file` | 1 | One class per file, always |
| `no-magic-numbers` | exceptions: -1, 0, 1, 2 | Force named constants |
| `no-nested-ternary` | error | LLMs chain ternaries; prefer if/else |

### Domain 2: Code Quality (eslint-plugin-sonarjs)

| Rule | Threshold | Rationale |
|---|---|---|
| `sonarjs/cognitive-complexity` | 15 | Catches real unreadability better than cyclomatic |
| `sonarjs/no-duplicate-string` | 3 | Extract repeated strings to constants |
| `sonarjs/no-identical-functions` | — | Catches LLM copy-paste |
| `sonarjs/no-collapsible-if` | — | `if (a) { if (b) }` → `if (a && b)` |
| `sonarjs/no-gratuitous-expressions` | — | Always-true/false conditions |
| `sonarjs/no-redundant-jump` | — | Unnecessary return/break/continue |
| `sonarjs/prefer-immediate-return` | — | `const x = f(); return x;` → `return f();` |

### Domain 3: Naming & Idioms

**`@typescript-eslint/naming-convention`:**
- Variables, parameters, properties → `camelCase`
- Classes, interfaces, type aliases → `PascalCase`
- Top-level `const` that are truly constants → `UPPER_CASE`
- Functions and methods → `camelCase`

**eslint-plugin-unicorn (10 rules, not all 100+):**

| Rule | Rationale |
|---|---|
| `unicorn/filename-case` (kebab-case) | Consistent file naming LLMs get wrong |
| `unicorn/no-array-for-each` | Prefer `for...of` — debuggable, breakable |
| `unicorn/no-for-loop` | Prefer `for...of` over index-based loops |
| `unicorn/explicit-length-check` | `arr.length > 0` not `arr.length` in boolean context |
| `unicorn/no-useless-undefined` | `return undefined` is noise |
| `unicorn/no-array-push-push` | Merge consecutive `.push()` calls |
| `unicorn/no-lonely-if` | `else { if (...) }` → `else if` |
| `unicorn/prefer-string-slice` | `.slice()` not `.substring()` |
| `unicorn/no-process-exit` | Throw instead of calling `process.exit()` directly |
| `unicorn/prefer-module` | ESM idioms, not CJS leftovers |

### Domain 4: Documentation (eslint-plugin-jsdoc) — always wave-gated

These start at `warn` even on greenfield projects. Too disruptive to gate from day 1, but visible pressure to add docs:

| Rule | Applies to |
|---|---|
| `jsdoc/require-jsdoc` | Exported functions and classes only |
| `jsdoc/require-param` | Non-trivial functions (>1 param) |
| `jsdoc/require-returns` | Non-void exported functions |
| `jsdoc/check-param-names` | Param names must match signature |

---

## Coverage Thresholds

The skill updates `vitest.config.ts`:

```ts
coverage: {
  provider: 'v8',
  reporter: ['text', 'lcov'],
  thresholds: {
    lines: 80,
    branches: 75,
    functions: 80,
    statements: 80,
  },
}
```

For retrofit mode: thresholds are set to the current baseline values (detected by running `vitest run --coverage` before configuration), then documented in a comment for ratcheting up.

---

## Folder Structure Convention

Folder structure is project-specific — the skill detects the existing layout and works within it rather than prescribing one. Enforcement is indirect:

1. **`unicorn/filename-case`** — all files must use `kebab-case` regardless of structure
2. **`max-classes-per-file: 1`** — prevents mixed-concern dumping into any folder
3. **`knip`** — already enforces that only `index.ts` exports are used externally (barrel discipline)

The skill's Step 1 reads the existing `src/` directory layout and documents it in a comment block at the top of the appended ESLint config:

```js
// ── Project structure (detected) ─────────────────────────────
// src/domain/     ← business logic (detected from existing files)
// src/api/        ← HTTP handlers (detected)
// src/lib/        ← utilities (detected)
// ─────────────────────────────────────────────────────────────
// To enforce structure beyond naming conventions, define an
// eslint-plugin-boundaries config in the enforce-architecture skill.
```

For projects that want hard folder structure enforcement, the `enforce-architecture` skill's tier system is the right tool — and the comment directs agents there.

---

## Greenfield vs Retrofit Behavior

| Behavior | Greenfield | Retrofit |
|---|---|---|
| Complexity rules | `error` | `warn` → `error` when baseline = 0 |
| sonarjs rules | `error` | `warn` → `error` when baseline = 0 |
| unicorn rules | `error` | `warn` → `error` when baseline = 0 |
| naming-convention | `error` | `warn` → `error` when baseline = 0 |
| jsdoc rules | `warn` (always) | `warn` (always) |
| Coverage thresholds | enforced at target values | enforced at detected baseline, ratchet up |

Warning budget header format (retrofit):

```js
// ── DISCIPLINE WARNING BUDGET (retrofit mode) ──────────────
// Rule                               Count   Target
// sonarjs/cognitive-complexity       8       Wave 1
// max-lines                          12      Wave 1
// naming-convention                  34      Wave 2
// sonarjs/no-duplicate-string        6       Wave 2
// jsdoc/require-jsdoc                ∞       Wave 3
//
// Last audited: YYYY-MM-DD
// ─────────────────────────────────────────────────────────────
```

---

## Wave Sequencing

Same pattern as `setup-guardrails` retrofit mode:

- **Wave 1** (auto-fixable, same-day): `unicorn/no-array-for-each`, `unicorn/no-lonely-if`, `unicorn/prefer-string-slice`, `sonarjs/prefer-immediate-return`, `sonarjs/no-redundant-jump`
- **Wave 2** (1–3 days): `sonarjs/cognitive-complexity`, `max-lines`, `max-lines-per-function`, `max-depth`
- **Wave 3** (3–7 days): `naming-convention`, `sonarjs/no-duplicate-string`, `no-magic-numbers`
- **Wave 4** (1–2 weeks): `jsdoc/*` — document public APIs, flip to `error`

---

## Verification Checklist

- [ ] `eslint-plugin-unicorn`, `eslint-plugin-sonarjs`, `eslint-plugin-jsdoc` installed
- [ ] Discipline block appended to `eslint.config.js` (existing config untouched)
- [ ] `vitest.config.ts` updated with coverage thresholds
- [ ] `git commit --allow-empty` passes without hook errors
- [ ] For retrofit: warning budget header present and accurate
- [ ] README updated with new skill row
- [ ] `setup-guardrails` skill lists `enforce-code-discipline` in Related Skills

---

## Dependencies Added

```bash
npm install -D eslint-plugin-unicorn eslint-plugin-sonarjs eslint-plugin-jsdoc
```

No other tooling changes — all enforcement runs through the existing Lefthook pre-commit pipeline.
