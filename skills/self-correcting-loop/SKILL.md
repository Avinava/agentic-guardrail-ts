---
name: self-correcting-loop
description: Use on every commit. The pre-commit hooks run 7 checks in parallel. If any fail, read ALL errors, fix them in one pass, and retry.
---

## Overview

This project uses Lefthook to run 7 quality checks **in parallel** on every `git commit`. The total pipeline takes ~3 seconds. If any check fails, the commit is rejected and you see the errors.

**This is not a blocker — it's a feedback loop.** Read the errors, fix them, retry. The goal is to catch issues in seconds, not minutes.

## The Pipeline

Every `git commit` triggers:

```
┌─ Prettier ────── auto-fixes formatting               (auto-fix)
├─ Knip ────────── detects unused exports/files         (manual fix)
├─ Syncpack ────── dependency version consistency       (manual fix)
├─ ESLint ──────── architecture + TypeScript rules      (manual fix)
├─ TypeScript ──── type errors in staged packages       (manual fix)
├─ Vitest ──────── runs tests related to changed files  (manual fix)
└─ Commitlint ──── validates commit message format      (rephrase)
```

All 7 run simultaneously. You get all errors at once, not one at a time.

## The Loop

```
1. Make changes
2. git add the changed files
3. git commit -m "type(scope): description"
4. IF rejected → read ALL errors → fix ALL in one pass → goto 2
5. IF accepted → done
```

### Critical: Fix ALL errors in one pass

Do NOT fix one error, commit, see the next error, fix it, commit again. That's slow and generates unnecessary commits.

Instead:
1. Read the entire error output
2. Identify every failure (Prettier, Knip, ESLint, TypeScript, Vitest, etc.)
3. Fix all of them
4. Stage the fixes
5. Commit again

## Reading Error Output

### Prettier
```
✖ prettier found issues in:
  src/utils.ts
  src/config.ts
```
**Fix:** Prettier auto-fixes on commit via lint-staged. If you see this, it means files were reformatted — stage the changes and commit again.

### Knip
```
Unused exports:
  src/helpers.ts: formatDate
  src/types.ts: OldStatus
```
**Fix:** Remove unused exports. If they're intentionally unused (public API), add them to the `entry` array in `knip.json`.

### Syncpack
```
✘ @types/node has mismatched versions:
    ^20.0.0 in packages/api/package.json
    ^18.0.0 in packages/core/package.json
```
**Fix:** Align the versions. Run `npx syncpack fix-mismatches` or manually update the lower version.

### ESLint
```
error  'boundaries/dependencies' - Not allowed to import '@acme/database' from 'helpers'
```
**Fix:** The import violates the architecture tier rules. See the `enforce-architecture` skill.

```
error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
```
**Fix:** Replace `any` with a proper type or `unknown`.

```
error  Floating promise detected  @typescript-eslint/no-floating-promises
```
**Fix:** Add `await` or `void` before the promise.

### TypeScript
```
error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
```
**Fix:** Fix the type error. Don't suppress with `// @ts-ignore` or `as any`.

### Vitest
```
FAIL  packages/core/src/__tests__/parser.test.ts
  ✕ parses valid input correctly
```
**Fix:** Your change broke an existing test. Update the code or the test, but make sure the test reflects intended behavior.

### Commitlint
```
⧗   input: added new feature
✖   subject may not be empty [subject-empty]
✖   type may not be empty [type-empty]
```
**Fix:** Use conventional commit format: `feat(scope): description`, `fix(scope): description`, etc.

## Common Patterns

### "But the error is a false positive"
Probably not. Read it again carefully. If it genuinely is:
- ESLint: add `// eslint-disable-next-line rule-name` with a comment explaining why
- Knip: add the entry to `knip.json` ignore list
- Ask the user before suppressing — they may prefer to fix the root cause

### "Prettier keeps reformatting my files"
That's intentional. Prettier runs via lint-staged and auto-fixes. Just stage the reformatted files and commit again.

### "Tests fail but my changes are correct"
Update the tests to reflect the new behavior. Don't delete tests. Don't skip tests. If a test is genuinely obsolete, remove it and explain why.

### "I need to commit without running hooks"
Use `git commit --no-verify` ONLY if the user explicitly asks. Never do this on your own — the hooks exist for a reason.

## Commit Message Format

Conventional Commits: `type(scope): description`

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
**Scopes:** package names (e.g., `shared-types`, `api`, `config`) + `deps`, `ci`, `release`

Examples:
```
feat(auth): add JWT refresh token flow
fix(database): handle connection timeout gracefully
refactor(helpers): extract date formatting utils
docs(readme): update installation instructions
test(api): add integration tests for user endpoint
chore(deps): upgrade vitest to 3.x
```

## Related Skills

- **enforce-architecture** — Fixing boundary violation errors
- **setup-guardrails** — Initial hook setup
