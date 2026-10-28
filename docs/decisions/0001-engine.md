# 0001: Lint and typecheck engine for v3

Status: accepted (2026-10-28)

## Context

- **TypeScript 7.0** (native) is `typescript@latest`. It has no programmatic API.
- **typescript-eslint 8.72.1** declares `typescript >=4.8.4 <6.1.0` and throws `typescript-eslint does not support TS 7.0` at load time.
- **ESLint 9** reached end of life on 2026-08-06. ESLint 10 is current.
- **Oxlint 1.90** with `oxlint-tsgolint` 7.0 runs type-aware rules on TS 7. It has 872 rules, 61 of them type-aware.

## What the spike verified

| Check | Result |
|---|---|
| `oxlint --type-aware` with `typescript@7.0.2` | Works: `no-floating-promises`, `no-unsafe-*`, `switch-exhaustiveness-check` |
| `oxlint --type-check` | Works but is labelled experimental. Not used as the authoritative typecheck. |
| Discipline rules native in Oxlint | `max-lines`, `max-lines-per-function`, `max-params`, `max-depth`, `complexity`, `max-nested-callbacks`, `no-console`, `unicorn/filename-case`, `unicorn/no-useless-undefined`, `unicorn/no-abusive-eslint-disable`, `import/no-duplicates`, `vitest/no-focused-tests` |
| Missing in Oxlint | `@typescript-eslint/naming-convention`, `import/order`, `no-restricted-syntax`, sonarjs rules |
| JS plugins (alpha) with `typescript` resolving to 7 | `eslint-plugin-sonarjs` and `@typescript-eslint/eslint-plugin` both fail to load |
| JS plugins with the `typescript` → `@typescript/typescript6` alias | `sonarjs/cognitive-complexity` works. typescript-eslint `naming-convention` still does not. |
| `max-params` and constructors | Constructors are counted, and there is no exemption option |
| dependency-cruiser 18.7 | Layer rules, `--baseline` / `--ignore-known` and `--baseline-mode shrink-only` all work |
| Vitest 5 `coverage.thresholds.autoUpdate` | Accepts `boolean` or `(next, prev) => number` |
| Knip 6 `--reporter json` | `{ issues: [{ file, exports: [], files: [], dependencies: [], ... }] }` |
| gitleaks 8.30 | `gitleaks git --pre-commit --staged`. The npm `gitleaks` package is not official. |

## Decision

1. **Oxlint is the linter.** `oxlint --type-aware` runs in the post-edit hook, pre-commit and CI. There is no typed ESLint.
2. **`tsc` (TS 7) is the typechecker.** It runs `tsc --noEmit` per package (through turbo in monorepos). Oxlint's `--type-check` is not trusted yet.
3. **dependency-cruiser replaces eslint-plugin-boundaries** for architecture rules. It needs no TS-API peer, its JS config generates tier rules. Its findings feed the shared `guardrails.baseline.json` (its own baseline is not used; see 7).
4. **sonarjs is optional.** Turning it on needs the TS 6 alias (`"typescript": "npm:@typescript/typescript6@^6"` plus `"@typescript/native": "npm:typescript@^7"`) and an alpha Oxlint feature. The native `complexity`, `max-depth` and `max-lines-per-function` rules cover the default case.
5. **`naming-convention` is dropped from the defaults.** In real use it needed many exemptions (external API fields, globals, mocks), and Oxlint can't run it. `unicorn/filename-case` stays.
6. **`max-params` is set to `off`** when a decorator-based DI container is detected (NestJS, InversifyJS, tsyringe, Angular), with the reason written in the config. Otherwise it is 4.
7. **One ratchet for everything.** Every finding (Oxlint, dependency-cruiser, Knip, bare disables) is an error. Existing findings are recorded per rule and per file in `guardrails.baseline.json`, and the gate fails only on counts above the baseline. There are no long-lived warnings.

## When to revisit

- typescript-eslint ships TS 7.1 support (issue #10940). Then naming-convention could return as an optional ESLint layer without the alias.
- Oxlint JS plugins leave alpha. Then sonarjs could become a default.
- Oxlint `--type-check` stops being labelled experimental. Then it could replace `tsc` in the stop hook.
