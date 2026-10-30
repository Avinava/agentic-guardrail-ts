# Known conflicts

Tool interactions that surprise people, and what to do about them.

## TypeScript 7 and tools that need the TS API

**Symptom:** dependency-cruiser, Knip or a JS lint plugin fails to load, or complains about TypeScript 7.

**Why:** TS 7 is native and has no programmatic API. Tools that import `typescript` need TS 6.

**Resolution:** keep both aliases. `typescript` is `npm:@typescript/typescript6@^6` (binary `tsc6`), `@typescript/native` is `npm:typescript@^7` (binary `tsc`). Do not "fix" `typescript` back to `^7`. See [decision 0001](./decisions/0001-engine.md).

## Two `tsc` binaries

**Symptom:** `tsc --version` prints 6.x.

**Why:** something else in the tree installed a real `typescript` package that owns the `tsc` binary, or an old lockfile still resolves `typescript` to a non-aliased version.

**Resolution:** check `node_modules/.bin/tsc` points into the TS 7 package. Remove stray `typescript` entries from workspace packages and reinstall.

## Oxlint JS plugins and sonarjs

**Symptom:** enabling `eslint-plugin-sonarjs` through Oxlint's JS plugins fails to load.

**Why:** JS plugins are alpha, and sonarjs needs the TS API.

**Resolution:** it works only with the TS 6 alias in place. typescript-eslint's `naming-convention` does not load even then. The native `complexity`, `max-depth` and `max-lines-per-function` rules are the default.

## max-params and DI constructors

**Symptom:** every injected service class fails `max-params`.

**Why:** Oxlint counts constructor parameters and has no exemption option.

**Resolution:** when a decorator-based DI container is detected, the skill sets `max-params` to `off` with the reason in the config. Otherwise, see [Retrofit](./retrofit.md#di-constructors-and-max-params).

## unicorn/filename-case and framework file names

**Symptom:** files whose names a framework dictates (route segments like `[id].ts`, generated clients) fail kebab-case.

**Resolution:** add an `overrides` entry in `.oxlintrc.json` for those paths that turns the rule off, with a comment naming the framework convention. Do not rename the whole codebase's convention.

## Knip and dynamic loading

**Symptom:** Knip reports files or dependencies as unused when they are loaded by string (plugin registries, route maps, config-referenced plugins, transports loaded by a logger).

**Resolution:** add the registry file to `entry`, or the package to `ignoreDependencies`, with a comment naming the loader. Prefer `entry`: it keeps checking what the registry imports.

## Knip and aliased or binary-only tools

**Symptom:** Knip reports `oxlint`, `oxlint-tsgolint`, `@typescript/native`, `vite` or `@commitlint/cli` as unused.

**Resolution:** they are in `ignoreDependencies` in the template. Keep them there when you edit `knip.json`.

## dependency-cruiser and the `source` condition

**Symptom:** in a monorepo, imports between packages show as `not-to-unresolvable`, or resolve to `dist/` and miss tier violations.

**Resolution:** keep `source` first in `enhancedResolveOptions.conditionNames`, and give every package a `"source"` export. See [Monorepo setup](./monorepo-setup.md#the-source-condition).

## dependency-cruiser and path aliases

**Symptom:** imports using `paths` aliases (`@/billing/x`) are unresolvable.

**Resolution:** point `options.tsConfig.fileName` at the tsconfig that declares the `paths`.

## Baseline keys and file renames

**Symptom:** after moving or renaming a file, its old findings fail as new.

**Why:** baseline keys are `tool:rule|file`. A new path is a new key.

**Resolution:** fix the findings while you move the file (best), or have a human run `baseline --reset` in a reviewed commit that only renames.

## Vitest 5 and Yarn 1

**Symptom:** Vitest fails to start because `vite` is missing.

**Resolution:** `vite` is a peer of Vitest 5, and Yarn 1 does not install peers. The templates list it explicitly. Keep it.

## turbo and `packageManager`

**Symptom:** turbo 2 refuses to run with a message about the package manager.

**Resolution:** add `"packageManager": "<name>@<version>"` to the root `package.json`.

## lefthook and leftover husky config

**Symptom:** `lefthook install` warns about `core.hooksPath`, or hooks never run.

**Resolution:** husky sets `core.hooksPath`. Run `git config --unset core.hooksPath`, then `lefthook install`. See [Migrating from v2](./migrating-from-v2.md).

## Yarn Plug'n'Play

**Symptom:** `guardrails: oxlint is not installed`.

**Resolution:** `guardrails.mjs` runs tools from `node_modules/.bin`. Set `nodeLinker: node-modules` in `.yarnrc.yml`.

## Prettier and generated files

**Symptom:** Prettier rewrites a generated file (column-aligned tables, generated clients) on every commit, and the generator rewrites it back.

**Resolution:** add the file to `.prettierignore` with a comment naming the generator.

## ast-grep and Oxlint

**Symptom:** a rule exists in both, or an ast-grep rule reports what Oxlint already reports.

**Why:** the two cover different ground on purpose. Oxlint has native rules for the generic cases. ast-grep is for structural rules the project defines (vocabulary literals, banned identifiers).

**Resolution:** do not write an ast-grep rule for anything Oxlint can express, including `no-restricted-syntax`-style patterns it supports. Keep ast-grep rules project-specific. The CLI is `ast-grep`; `sg` is a deprecated alias and also collides with the `sg` command on some Linux distributions.

## ls-lint and `unicorn/filename-case`

**Symptom:** a file name passes one tool and fails the other.

**Why:** both can check case. They disagree when ls-lint says kebab-case and Oxlint is configured for a framework's PascalCase components, or the reverse.

**Resolution:** the split is fixed. Oxlint `unicorn/filename-case` owns the case of JS and TS file names (and its `overrides` handle framework names). ls-lint owns folders, banned extensions and non-code files, and its template sets no case for `.ts`, `.tsx`, `.js` or `.mjs`. When you add a framework override in `.oxlintrc.json`, add no rule for the same files in `.ls-lint.yml`. Folder rules that allow `[id]` style route segments live in ls-lint's `.dir` regex.

## ls-lint and banned extensions in hooks

**Symptom:** a banned extension (`a.spec.ts`) is not reported by the edit hook.

**Why:** ls-lint reports an `exists:0` violation on the directory, not the file, and the hook only counts findings for files in scope.

**Resolution:** none needed. It is caught on pre-push and CI, where the whole tree is checked.

## cspell `flagWords` and ast-grep banned identifiers

**Symptom:** the same banned word is reported twice, or in one tool only.

**Why:** ast-grep matches whole identifiers in code. cspell matches words in comments, strings, docs and sub-words of camelCase identifiers.

**Resolution:** use both on purpose. Put the banned synonym in cspell `flagWords` for text and sub-words, and in the ast-grep list only if you also want an exact-identifier rule. Keep the two lists in step.

## cspell and generated files

**Symptom:** cspell reports thousands of unknown words in a lockfile or the baseline.

**Resolution:** they are in `ignorePaths` in the template. Add generated files there, with a comment in your PR naming the generator.

## jscpd and per-file baseline keys

**Symptom:** you expect a `jscpd:...|file` key in `guardrails.baseline.json` and find a `duplication` percentage instead.

**Why:** duplication has no honest per-file owner. See [jscpd](./tool-reference.md#jscpd).

**Resolution:** none. Do not hand-edit the percentage. After clean code is added, run `baseline --tighten` so the new ratio becomes the floor.

## jscpd and test or generated code

**Symptom:** the duplication percentage is high and the clones are test fixtures or generated clients.

**Resolution:** add them to `ignore` in `.jscpd.json`. Tests are ignored in the template.

## markdownlint and Prettier

**Symptom:** a Markdown file passes `prettier --check` and fails markdownlint, or the two rewrite each other.

**Resolution:** Prettier wins. The template disables MD013, MD033, MD041, MD055 and MD060. If markdownlint raises another formatting rule (spacing, list style), turn that rule off in `.markdownlint-cli2.jsonc` rather than reformatting against Prettier.

## lychee online and offline

**Symptom:** links pass locally and fail in CI, or the reverse.

**Why:** hooks run lychee `--offline` (local files and anchors). CI sets `GUARDRAILS_ONLINE=1` and also checks URLs.

**Resolution:** fix or exclude the URL (`exclude` in `lychee.toml`). Timeouts never fail the gate. lychee 0.24 reads `include_fragments` as a string (`"full"`); older versions took a boolean.

## Knip and the extras' binaries

**Symptom:** Knip reports `@ast-grep/cli`, `@ls-lint/ls-lint`, `cspell`, `jscpd` or `markdownlint-cli2` as unused.

**Resolution:** they run by binary, not import. Add them to `ignoreDependencies` in `knip.json`, like `oxlint`.


## editorconfig-checker and Prettier

**Symptom:** a file passes Prettier and fails editorconfig-checker, or the reverse.

**Why:** both read indentation and line-ending settings, from different files (`.prettierrc.json` and `.editorconfig`).

**Resolution:** keep the two in step. The templates set the same values in both (2 spaces, LF, final newline). Prettier formats; editorconfig-checker covers the file types Prettier skips (shell, Makefiles, YAML in odd places). If they disagree, change `.editorconfig` to match `.prettierrc.json`.

## actionlint and shellcheck

**Symptom:** a shell snippet inside a workflow is reported twice, by actionlint and by shellcheck.

**Why:** actionlint runs shellcheck on `run:` steps when shellcheck is on PATH. The shell pack's shellcheck only checks `.sh` files, not workflow YAML, so they do not overlap on files.

**Resolution:** none. To silence a `run:` finding, use `# shellcheck disable=SCxxxx` inside the step, with a reason.
