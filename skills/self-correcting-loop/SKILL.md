---
name: self-correcting-loop
description: Use on every commit. The pre-commit hooks run 8 checks in parallel. If any fail, read ALL errors, fix them in one pass, and retry.
---

## Overview

This project uses Lefthook to run 8 quality checks **in parallel** on every `git commit`. The total pipeline takes ~3 seconds. If any check fails, the commit is rejected and you see the errors.

**This is not a blocker — it's a feedback loop.** Read the errors, fix them, retry. The goal is to catch issues in seconds, not minutes.

## CRITICAL: Never Bypass Hooks

**NEVER use `git commit --no-verify` or `git commit -n`.**

The pre-commit hooks exist to catch YOUR mistakes. If hooks keep failing, fix the root cause — don't skip the check. The ONLY exception is if the user **explicitly** tells you to skip.

Bypassing hooks defeats the entire purpose of the guardrail stack. If you skip hooks, broken code enters the repository and becomes someone else's problem.

## Test Integrity Rules

**NEVER modify a test just to make it pass.**

- If a test fails, the CODE is wrong, not the test
- The ONLY reason to change a test is if the **requirements** changed
- If requirements changed, explain WHY the test expectation changed in the commit message
- Ask the user before modifying any test file
- Never delete, skip, or comment out tests without explicit user approval

Tests verify that YOUR code is correct. Changing tests to match your bugs is fraud, not engineering.

## The Pipeline

Every `git commit` triggers:

```
┌─ Prettier ────── auto-fixes formatting               (auto-fix)
├─ Knip ────────── detects unused exports/files         (manual fix)
├─ Syncpack ────── dependency version consistency       (manual fix)
├─ ESLint ──────── architecture + TypeScript rules      (manual fix)
├─ TypeScript ──── type errors in staged packages       (manual fix)
├─ Vitest ──────── runs tests related to changed files  (manual fix)
├─ Gitleaks ────── detects hardcoded secrets/API keys   (manual fix)
└─ Commitlint ──── validates commit message format      (rephrase)
```

All 8 run simultaneously. You get all errors at once, not one at a time.

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
2. Identify every failure (Prettier, Knip, ESLint, TypeScript, Vitest, Gitleaks, etc.)
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

```
error  Import order violation  import-x/order
```
**Fix:** Reorder imports: builtins (node:*) → external (npm packages) → internal (@scope/*) → relative (./). Add blank lines between groups.

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
**Fix:** Your change broke an existing test. Fix the **code**, not the test. See "Test Integrity Rules" above.

### Gitleaks (Secrets)
```
Finding:     API_KEY = "sk-abc123..."
Secret:      sk-abc123...
RuleID:      generic-api-key
File:        src/config.ts
```
**Fix:** Remove the hardcoded secret immediately. Use environment variables instead:
```typescript
// BAD:  const key = "sk-abc123...";
// GOOD: const key = process.env.API_KEY;
```
If the secret was already committed to history, alert the user — they need to rotate the credential.

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
- ESLint: add `// eslint-disable-next-line rule-name` with a comment explaining why, a tracking reference, and a `tech-debt.md` cross-link if it represents known debt (see the `enforce-architecture` skill § "Escape Hatches and Paper Trails")
- Knip: add the entry to `knip.json` ignore list
- Ask the user before suppressing — they may prefer to fix the root cause

### "Prettier keeps reformatting my files"
That's intentional. Prettier runs via lint-staged and auto-fixes. Just stage the reformatted files and commit again.

### "Tests fail but my changes are correct"
The tests verify intended behavior. If the test expectations are genuinely outdated, explain why to the user and get their approval before changing any test. See "Test Integrity Rules" above.

### "I need to commit without running hooks"
**NO.** See "CRITICAL: Never Bypass Hooks" above. Fix the errors. That's the whole point.

### "Gitleaks flagged a test fixture or mock value"
If the secret is genuinely a test fixture (not a real credential), add it to `.gitleaksignore`:
```
<fingerprint from gitleaks output>
```
Ask the user to confirm it's not a real secret before ignoring.

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

## Agent Permission Configuration

For additional safety, configure your agent to explicitly deny hook bypassing:

### Claude Code
```json
// .claude/settings.json
{
  "permissions": {
    "deny": ["Bash(git commit*--no-verify*)", "Bash(git commit*-n *)"]
  }
}
```

### Cursor / Copilot
Add to your project's agent rules file:
```
NEVER use git commit --no-verify or git commit -n.
Always let pre-commit hooks run.
```

## Related Skills

- **enforce-architecture** — Fixing boundary violation errors
- **setup-guardrails** — Initial hook setup
