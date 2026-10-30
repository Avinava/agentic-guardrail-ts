# Tool reference

What each tool does, where it is configured, and when it runs. Why these tools: [decision 0001](./decisions/0001-engine.md).

| Tool | Post-edit hook | Stop hook | Pre-commit | Pre-push / CI |
| --- | --- | --- | --- | --- |
| Oxlint (type-aware) | edited file | changed files | staged files | all |
| Disable check | edited file | changed files | staged files | all |
| dependency-cruiser | | changed files | staged files | all |
| Knip | | | | all |
| `tsc` | | yes | | yes |
| Vitest | | related tests | | with coverage |
| Prettier | | | write staged | check all |
| gitleaks | | | staged | full history (CI) |
| commitlint | | | message | PR range (CI) |
| syncpack (monorepo) | | | | via `lint` script |
| ast-grep (opt-in) | edited file | changed files | staged files | all |
| ls-lint (opt-in) | edited file | changed files | staged files | all |
| cspell (opt-in) | edited file | changed files | staged files | all |
| jscpd (opt-in) | | | | full check only |
| markdownlint-cli2, lychee (opt-in) | | changed docs | staged docs | all (lychee online in CI) |
| ruff (Python pack) | edited file | changed files | staged files | all |
| tach, deptry, vulture (Python pack) | | | | full check only |

## guardrails.mjs

`scripts/guardrails.mjs` is the one entry point. Hooks, package scripts and CI all call it, so behavior is the same under every package manager.

```text
check [--changed | --files a.ts b.ts] [--strict-baseline]
baseline (--init | --tighten | --reset)
verify
format --files a.ts b.ts
exec <bin> [args...]
packs                          detected stacks and which tools are on
ci-jobs                        which CI job owns each pack's ci-stage tools
hook (post-edit | stop)        reads the hook JSON on stdin
```

- `check` collects findings from every active tool of every [pack](./packs.md): Oxlint, dependency-cruiser, Knip (full runs only) and the disable check from the `ts` pack, plus any opt-in tool whose config file exists. Each finding has a key `tool:rule|file`. It fails if any key's count is above the baseline.
- `--strict-baseline` also fails when the baseline is looser than the code (CI uses this). It needs a full check, so it refuses `--changed` and `--files`.
- `verify` runs the `format:check`, `typecheck`, `lint` and `test:coverage` scripts in order, skipping any that are not defined.
- `exec` runs a binary from `node_modules/.bin` (used for commitlint).
- Source directories default to `src`, `packages`, `apps` and `libs`. Override with `"guardrails": { "src": [...] }` in `package.json`.

## Oxlint

Config: `.oxlintrc.json`. Runs with `--type-aware` (via `oxlint-tsgolint`) and `--report-unused-disable-directives`.

- Categories `correctness` and `suspicious` are errors.
- Type safety: `no-explicit-any`, `no-non-null-assertion`, `consistent-type-assertions` (no `{} as Foo`), `no-unsafe-*`, `restrict-template-expressions`, `ban-ts-comment` (`@ts-expect-error` needs a 10+ character reason).
- Promises: `no-floating-promises`, `no-misused-promises`, `await-thenable`.
- Discipline: `max-lines` 400, `max-lines-per-function` 60, `max-params` 4, `max-depth` 3, `complexity` 12, `max-nested-callbacks` 3, `no-console`.
- Style that matters: `eqeqeq`, `no-param-reassign`, `unicorn/filename-case` (kebab), `prefer-node-protocol`, `import/no-duplicates`.
- Tests: `vitest/no-focused-tests`, `vitest/expect-expect`.
- Overrides: tests drop the size limits, `no-explicit-any`, `no-non-null-assertion` and four `no-unsafe-*` rules; plain JS drops `no-unsafe-*`; scripts and config files drop the size limits, `complexity` and `no-console`.

`max-params` is set to `off` when a decorator-based DI container is detected (NestJS, InversifyJS, tsyringe, Angular), because Oxlint counts constructor parameters with no exemption. See [Retrofit](./retrofit.md#di-constructors-and-max-params).

Not in Oxlint, and not in the defaults: `naming-convention`, `import/order`, `no-restricted-syntax`, sonarjs. sonarjs can be enabled through Oxlint's alpha JS plugins with the TS 6 alias.

## TypeScript

- `@typescript/native` is `npm:typescript@^7`. Its `tsc` binary is what `typecheck` runs.
- `typescript` is `npm:@typescript/typescript6@^6`. Its binary is `tsc6`, so it does not shadow `tsc`. It exists because tools that call the TypeScript API (dependency-cruiser, Knip, JS lint plugins) cannot load TS 7, which has no API.
- Strict flags: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`, `erasableSyntaxOnly`. Module is `nodenext`, target `es2024`.
- If the project uses `enum` or `namespace`, the skill leaves out `erasableSyntaxOnly`.

## dependency-cruiser

Config: `.dependency-cruiser.mjs` (plain JS, so rules are generated from a list).

- Single package: `LAYERS`, lowest first. A layer may import layers below it. Also `no-circular`, `not-to-unresolvable`, `not-to-dev-dep`, `no-non-package-json`, `not-to-test`.
- Monorepo: `TIERS`, lowest first. A package may import lower tiers only, never its own tier or higher. Also `no-circular`, `not-to-unresolvable`, `no-relative-cross-package`, `no-non-package-json`.

See [Architecture tiers](./architecture-tiers.md).

## Knip

Config: `knip.json`. Finds unused files, exports and dependencies. Runs only on full checks (pre-push and CI), because it needs the whole graph. `ignoreDependencies` lists tools that are used by binary or alias, not import (`oxlint`, `@typescript/native`, `vite`, ...). In monorepos it is configured per workspace.

## Vitest

Config: `vitest.config.ts`. Vitest 5 with `@vitest/coverage-v8`. `vite` is listed explicitly because it is a Vitest 5 peer and Yarn 1 does not install peers.

Coverage thresholds start at 80 lines, 75 branches, 80 functions, 80 statements on new projects. A retrofit sets them to measured values. `baseline --tighten` runs `test:coverage` with `GUARDRAILS_RATCHET=1`, which turns on `autoUpdate` and writes the measured (floored) numbers back into the config. Thresholds never go down on their own.

## Prettier

Config: `.prettierrc.json`, `.prettierignore`. Single quotes, trailing commas, width 100, LF. Oxlint has no formatting rules, so there is nothing to reconcile.

## lefthook

Config: `lefthook.yml`. Installed by the `prepare` script.

- `pre-commit` (piped): Prettier writes staged files and re-stages them, then `check --files` on staged files, then gitleaks on staged changes.
- `commit-msg`: commitlint.
- `pre-push`: `verify`.

No husky, no lint-staged. lefthook passes `{staged_files}` directly.

## gitleaks

A Go binary, installed outside npm. Pre-commit scans staged changes with `--redact`. CI scans the full history.

## commitlint

Config: `commitlint.config.mjs`, extending `@commitlint/config-conventional`.

## Monorepo only

- **turbo 2.11:** `turbo.json` defines `build` (depends on `^build`) and `typecheck`. Requires a `packageManager` field.
- **syncpack 15:** `.syncpackrc.json` pins workspace dependencies to `workspace:*` (`*` on npm and Yarn 1) and keeps one version of every other dependency.
- **`source` export condition:** packages export `"source": "./src/index.ts"`. `tsc`, Vitest and dependency-cruiser resolve it, so types are live without a build. See [Monorepo setup](./monorepo-setup.md).

## Agent files

- `AGENTS.md`: a managed block with the gate table, commands and rules. `CLAUDE.md` contains `@AGENTS.md`.
- `.claude/settings.json`: PostToolUse and Stop hooks, plus deny rules for bypasses and baseline edits.
- `.codex/hooks.json`: the same hooks for Codex.

See [Agent loop](./agent-loop.md).

## Packs

Everything above is the `ts` pack. Other stacks (Python, Mule, Salesforce, shell, Docker, SQL, GitHub Actions, Rust, Dart, C++) and the language-agnostic core tools (cspell, jscpd, ast-grep, ls-lint, markdownlint, lychee, editorconfig-checker) are packs: see [Packs](./packs.md) for the contract, the detect rules, what is default-on and what is opt-in.
