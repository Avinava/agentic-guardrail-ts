# Packs

The engine, `scripts/guardrails.mjs`, knows nothing about any language. Every tool comes from a **pack** declared in `scripts/guardrails-packs.mjs`. A tool is an external command: the engine runs it, checks the exit code, parses the output into findings and keys each one `tool:rule|file`. Adding a stack is a new pack object plus a template folder, never a change to the engine.

Everything beyond the original TypeScript stack is **opt-in**. A tool switches on only when its config file exists, so installs that predate a pack do not change. Run `node scripts/guardrails.mjs packs` to see which stacks the repo contains and which tools are on.

## Matrix

| Pack | Detect rule | Tools | Default |
| --- | --- | --- | --- |
| `core` | every repo | cspell, jscpd, ast-grep, vocab-literal, ls-lint, markdownlint-cli2, lychee, editorconfig-checker, actionlint (gitleaks, lefthook, commitlint are installed by the base setup) | opt-in per tool |
| `ts` | `package.json`, `tsconfig*.json` | Oxlint, dependency-cruiser, Knip, disable check, Prettier, Vitest floors | on in every v3 install (see [ts](#ts)) |
| `python` | `pyproject.toml`, `uv.lock` | ruff (lint, format), pyright, tach, deptry, vulture, pytest coverage floor | opt-in |
| `mule` | `mule-artifact.json`, `src/main/mule/*.xml` | mule-lint, Mule XML format check, properties secrets, MUnit through Maven | opt-in |
| `salesforce` | `sfdx-project.json`, `*.cls`, `*.trigger` | Code Analyzer (PMD, ESLint, retire-js), prettier-apex, metadata checks, Apex coverage floor | opt-in |
| `shell` | `*.sh`, `*.bash` | shellcheck, shfmt | opt-in |
| `docker` | `Dockerfile*`, `*compose*.yml` | hadolint, `docker compose config` | opt-in |
| `sql` | `*.sql` | sqlfluff | opt-in, **experimental** |
| `rust` | `Cargo.toml` | cargo fmt, clippy, cargo-deny, cargo-machete | opt-in |
| `dart` | `pubspec.yaml`, `*.dart` | dart format, dart or flutter analyze, Flutter coverage floor | opt-in, **experimental** |
| `cpp` | `platformio.ini`, `.clang-format`, `*.cpp` | clang-format, pio check | opt-in, **experimental** |
| `security` | lockfiles, `.github/workflows/*.yml`, `.semgrep/` | osv-scanner, semgrep (own rules), zizmor | opt-in |
| `playwright` | `playwright.config.*` | playwright (e2e hygiene rules on ast-grep) | opt-in |

**Experimental** means no tool of the pack has been run against its real binary: only fake-output unit tests cover it (see [Verified against real tools](#verified-against-real-tools)). The setup skill does not offer experimental packs unless the user asks for them, and they may change without a major version.

More packs are added below as they ship.

## Upgrading from 3.x to 4.0.0 (breaking)

The hand-filled ast-grep rule `rules/no-vocab-literal.yml` is gone, replaced by the `vocab-literal` tool, which reads the vocab module itself. A repo that has the old rule keeps running it (ast-grep runs every file in `rules/`), but it is no longer maintained or shipped. Migrate:

1. Write `guardrails/vocab.json` with the path of the vocab module (see [core](#core)).
2. Delete `rules/no-vocab-literal.yml`. Keep `sgconfig.yml` if other rules remain.
3. Run `node scripts/guardrails.mjs check`. The same literals now fail as `vocab-literal:<Name.Member>|file` and the old `ast-grep:no-vocab-literal|file` keys are stale. Review the list, then run `baseline --reset`. The new tool also checks Python `StrEnum` members and nested members, so the count can be higher.

The `setup-guardrails` and `guardrails-doctor` skills do these steps. Nothing else changes, and the `security` pack is opt-in.

## Upgrading from 3.0.0

Nothing new runs by default, but some tools are switched on by a config file you may already have. After upgrading, these switch on **if the file exists**:

| Tool | Switched on by an existing |
| --- | --- |
| ruff, ruff-format | `[tool.ruff]` in `pyproject.toml`, or `ruff.toml` |
| pyright | `[tool.pyright]` in `pyproject.toml`, or `pyrightconfig.json` |
| deptry, vulture, pytest-cov | `[tool.deptry]`, `[tool.vulture]`, `[tool.coverage*]` in `pyproject.toml` |
| dart-format, dart-analyze, flutter-coverage | `analysis_options.yaml` (every Dart or Flutter project has one) |
| clang-format | `.clang-format` |
| prettier-apex | a `.prettierrc` or `.prettierrc.json` that lists `prettier-plugin-apex` |
| markdownlint, lychee, cspell, ls-lint, ast-grep, jscpd | their own config files (`.markdownlint-cli2.jsonc`, `lychee.toml`, `cspell.json`, `.ls-lint.yml`, `sgconfig.yml`, `.jscpd.json`) |
| hadolint and compose-config, shellcheck and shfmt, sqlfluff | `.hadolint.yaml`, `.shellcheckrc`, `.sqlfluff` |
| cargo-fmt, clippy, cargo-deny | `rustfmt.toml`, `clippy.toml`, `deny.toml` |

The first full `check` after the upgrade prints one line naming every pack tool that is newly active since the baseline was written (`tools newly active since the baseline was written: ...`), and repeats it until a baseline command (`baseline --tighten`) acknowledges them. Findings from a newly active tool fail the gate like any new finding, so run `baseline --tighten` or `--reset` after reviewing them, or remove the config file.

## The pack contract

A pack is `{ id, detect, tools }`. `detect` is a list of patterns on repo paths, so a monorepo with several stacks matches several packs. Detection only suggests packs to the setup skill; whether a tool runs is decided by its own `optIn`.

A tool declares:

| Field | Meaning |
| --- | --- |
| `id` | Finding prefix. Baseline keys are `id:rule\|file`, the same format for every tool. |
| `optIn` | The config files that switch the tool on. A string is a file that must exist. `{ file, has }` also needs the pattern in the file (for example `[tool.ruff]` in `pyproject.toml`). |
| `exts` | Files the tool covers. The hooks use it to run only the tools whose files changed. |
| `track` | File types to start tracking when the tool is on (cspell adds Markdown). |
| `stages` | Where it runs. `edit`: the post-edit hook. `commit`: pre-commit, `check --files`, `check --changed` and the stop hook. `push`: the full check, which is pre-push (through `verify`) and CI. `ci`: a full check in CI, which is on when `GUARDRAILS_CI=1` or the standard `CI` variable is set (GitHub Actions and GitLab both set it); `GUARDRAILS_CI=0` forces it off. Expensive tools (test suites, org runs, toolchain downloads) use `ci`, so they never run on pre-push. A local full check prints `deferred: <tools> (set GUARDRAILS_CI=1 or run in CI)` and `check --strict-baseline` fails while any are deferred, so a CI that forgot the flag cannot print "clean". Recording their numbers needs the same stage: the printed fix is `GUARDRAILS_CI=1 GUARDRAILS_PACKS=<pack> node scripts/guardrails.mjs baseline --tighten`. |
| `whole` | Run on the whole project even in a scoped run; findings are then filtered to the files in scope. For tree-wide tools. |
| `perFile` | One command per file. |
| `ok` | Exit codes that mean the tool ran. Anything else is a tool failure and blocks, never a silent pass. Default `[0, 1]`. A tool whose JSON report is authoritative (Oxlint, dependency-cruiser, Knip) accepts every exit code, as v3 did, and fails only if the report does not parse. |
| `quiet` | Non-zero exits that may legitimately print no finding. Any other non-zero exit with nothing parsed fails (`output it could not read`), for `run` tools and, through `h.settle`, for `scan` tools. |
| `run(ctx)` and `parse(out, ctx)` | The exact command, and how its output becomes `{ rule, file, line, message }`. |
| `scan(ctx)` | Replaces `run` and `parse` for checks done in JS (naming, metadata, tools run in a loop). A finding may set `always: true` for "this whole tool failed" (a test run, a policy, an invalid file): it is never counted in the baseline, so `baseline` refuses to run while one exists and a later failure of the same kind still fails. |
| `metric`, `measure(ctx)` | A number ratchet instead of findings. |

A file name that starts with `-` (for example `--config=x.md`) is passed to tools as `./--config=x.md`, so no tool can read it as an option. Tools that run their own commands (`scan` tools) wrap paths with `h.safe`, which does the same for directories such as a Mule app named `-legacy`.

### CI jobs: cheap checks everywhere, expensive checks once

The default is v3 behaviour: with no environment variables a job runs every enabled pack. Two variables shape a multi-stack pipeline:

- `GUARDRAILS_PACKS=python` limits a job to those packs. A pack's own job (`templates/packs/<pack>/ci.yml`) sets it to its pack, so it needs only that pack's toolchain.
- `GUARDRAILS_CI_PACKS=none` (or a list) limits only the **ci-stage** tools. The base `verify` job in `templates/ci/ci.yml` sets `none`: it keeps running every enabled pack's cheap checks (ruff, shellcheck, clippy, compose config, ...) exactly as in v3, and leaves the expensive ones (test suites, org runs, toolchain downloads) to the pack job. Names are validated like `GUARDRAILS_PACKS`; a pack that `GUARDRAILS_PACKS` excludes cannot be claimed, and the run warns that its ci-stage tools will not run there.

So every expensive tool runs once, in a job that has its toolchain and credentials, and no enabled pack's cheap checks are dropped. The base job therefore needs the toolchain of every enabled pack; each pack's `ci.yml` job has the install steps to copy.

**What protects a pack nobody runs.** The gate does not read CI files: `check` and `check --strict-baseline` never fail because of what is or is not in a workflow. The protection is three things:

1. Setup always generates the pack job for each detected pack that has ci-stage tools. `scripts/packs-ci-test.mjs` checks that in the generated workflow of a five-stack repo every such pack is owned by exactly one job and never by the base job.
2. Whenever ci-stage tools are deferred, `check` prints `deferred: <tools> (set GUARDRAILS_CI=1 to run them, with GUARDRAILS_PACKS=<pack> to limit the run; CI runs them)`, and `--strict-baseline` fails while any are deferred, so a CI step that never turns the stage on cannot print "clean".
3. The doctor skill reads the workflow files by hand when asked. The engine does not: the gate has no CI-file parser, because a heuristic one gave false passes and failures across CI systems.

When the ci stage is on but `GUARDRAILS_CI_PACKS` leaves a pack out, `check` prints `ci-stage tools left to other jobs: <tools> (GUARDRAILS_CI_PACKS=...)`, so a tool that did not run is never silent.

Pre-push never runs the ci stage: `verify` forces `GUARDRAILS_CI=0`, so a `CI` variable exported on a developer machine or in an agent sandbox cannot start a test suite or an org run. CI runs the ci-stage tools in the strict step only, once. Two checks do apply under `--strict-baseline` and have nothing to do with CI files: a selected pack with no configured tool fails (its config was removed), and a pack a job does not run is named in the output (`packs not run here`).

### Metric ratchets

Some things are a ratio, not a count per file. Duplication, test coverage and Apex coverage are one number each. A metric tool declares `direction` (`down` for duplication, `up` for coverage floors). The value is stored in `guardrails.baseline.json` under `metrics`:

- `check` (full only) fails if the number moves the wrong way.
- `check --strict-baseline` also fails if it moved the right way, so the win must be committed.
- `baseline --tighten` moves it the right way only, and records it the first time the tool is enabled (adding its config file is itself a reviewed change).
- A reading must be a finite number. A missing or non-numeric one (a renamed report field) fails the run; it can never become `null` in the baseline.
- A metric stored in the baseline that nothing measured this run (its tool config was removed, or it returned nothing) fails the check instead of being skipped, and `--tighten` carries it over unchanged. Only a human `baseline --reset` drops it. A metric whose tool is merely deferred to CI is left alone locally.
- Metrics from `ci` tools (coverage floors) are measured only in the ci stage. Record them with `GUARDRAILS_CI=1 node scripts/guardrails.mjs baseline --tighten`. A local `--tighten` or `--reset` carries over the stored numbers and the stored finding keys of tools that did not run, and never reports them stale.
- A stored value that is not a finite number (a `null` left by an old bug) fails the check as invalid. `--tighten` prints that the stored value was invalid and records the current reading explicitly; review it.
- To drop a metric whose tool no longer applies, run `GUARDRAILS_CI=1 node scripts/guardrails.mjs baseline --reset` (a local reset keeps metrics whose tool was merely deferred).

Metrics run on full checks only, never in hooks, because they scan the whole project or run the test suite.

### Adding a stack

1. Add a pack object to `scripts/guardrails-packs.mjs` (and to `templates/shared/scripts/guardrails-packs.mjs` in this repo).
2. Add `templates/packs/<id>/` with the config files that switch each tool on.
3. Add a section here, a conflicts note in [Known conflicts](./known-conflicts.md), and `scripts/packs-<id>-test.mjs` with fake tool output.
4. Add the pack to the Wave 8 table in the setup skill.

## core

Language-agnostic tools. Templates: `templates/packs/core/`. Each switches on with its config file.

| Tool | Config (switch) | Findings | Stages |
| --- | --- | --- | --- |
| ast-grep | `sgconfig.yml`, `rules/*.yml` | `ast-grep:<rule-id>\|file` | edit, commit, push |
| vocab-literal | `guardrails/vocab.json` | `vocab-literal:<Name.Member>\|file` | edit, commit, push |
| ls-lint | `.ls-lint.yml` | `ls-lint:<ext>-<rule>\|path` | edit, commit, push |
| cspell | `cspell.json` | `cspell:unknown-word\|file`, `cspell:forbidden-word\|file` | edit, commit, push |
| jscpd | `.jscpd.json` | metric `duplication` (down) | push |
| markdownlint-cli2 | `.markdownlint-cli2.jsonc` | `markdownlint:MDxxx\|file` | commit, push |
| lychee | `lychee.toml` | `lychee:broken-link\|file` | commit, push |
| editorconfig-checker | `.ecrc` | `editorconfig-checker:<problem>\|file` | commit, push |
| actionlint | `.github/actionlint.yaml` | `actionlint:<rule-kind>\|file` | commit, push |

**ast-grep** (npm `@ast-grep/cli`, run as `ast-grep scan --json=stream`; `sg` is a deprecated alias used only as a fallback). Custom structural rules only; Oxlint keeps every rule it has natively. The templates ship `no-banned-identifier` (an example list of vague names) and, under `optional/`, token drift (below). Token drift is opt-in: copy `no-color-literal.yml` and `no-color-literal-tsx.yml` (ast-grep takes one language per rule) into `rules/`. They ban hex, `rgb()`/`rgba()`, `hsl()`/`hsla()` and `oklch()` colour literals in TypeScript outside the files listed under `ignores` (default: `tokens/`, `tokens.ts`, `tokens.tsx`, `*.test.ts(x)`, `*.spec.ts(x)`). Only TS and TSX are covered: there is no CSS check, because the gate has no stylelint tool; add one as a pack tool before banning colours in CSS.

**vocab-literal** (built in; reads source with real parsers). Reads the vocab module(s) listed in `guardrails/vocab.json` and flags a string literal equal to a member, anywhere outside that module, tests (`*.test.*`, `*.spec.*`, `test_*.py`, `tests/`, `__tests__/`) and the `ignore` globs. A TypeScript module is an `as const` object (nested objects, `satisfies` and parentheses included) or an `enum` (string initialisers may be parenthesised or asserted); a Python module is a `StrEnum` or `class X(str, Enum)` (aliased imports such as `from enum import StrEnum as S` resolve), and only assignments directly in the class body are members. Only module-level declarations that a caller can reach are members: in TypeScript an `export`ed declaration, a name in `export { A as B }` or `export default A`, or an exported namespace member, named as written (`Domain.Status.Active`); in Python a top-level class (honouring `__all__` when it is a list of strings, and skipping `_private` names) with nested classes named `Outer.Inner.KEY`. Declarations inside functions or blocks and unexported helpers never become members. When two members share a value, the first in source order wins. TypeScript values flag TS and JS files, Python values flag `.py` files. TypeScript is parsed with the project's own `typescript` package (the TS 6 alias the setup installs), Python with `python3 -I` and its `ast` module, so comments, template and f-string substitutions, triple-quoted strings and JSX text follow each language's grammar. A missing parser fails the gate, and so does a Python file that does not parse. A TypeScript file with a syntax error is still scanned: the compiler's parser recovers and reports the literals it found. What counts: a string or no-substitution template (TS), a `str` constant (Python), a literal inside `${...}` or an f-string `{...}`, an f-string with no substitution, a type-position literal (`'a' | 'b'`), and a triple-quoted value (`g = """active"""`). What does not: module names (`import`, `export ... from`, `require()`, `import()`), comments, JSX text, bytes, Python docstrings (a bare string statement), and the fixed text around a substitution. The rule is the member name (`Status.Active`), so a rename re-keys the baseline. A missing or empty module, or a config that is not valid JSON, fails the gate.

```json
{ "modules": ["src/vocab.ts", "app/vocab.py"], "ignore": ["**/generated/**"] }
```

**ls-lint** (npm `@ls-lint/ls-lint`). Owns folder names, banned extensions (`.spec.ts: exists:0`) and the case of non-code files. It sets no case for `.ts`, `.tsx`, `.js` or `.mjs`: Oxlint `unicorn/filename-case` owns those (see [the split](./known-conflicts.md#ls-lint-and-unicornfilename-case)). It scans the whole tree. A banned extension is reported on its directory, so it is caught on pre-push and CI rather than in the edit hook.

**cspell** (npm `cspell`). Checks code and Markdown. `flagWords` turns a banned synonym into a finding wherever it appears, including comments, strings and docs; cspell splits camelCase, so `whitelistRules` is caught too. Unknown words go in the project dictionary after review, not in bulk. On a retrofit the first run is noisy: `baseline --init` records it.

**jscpd** (npm `jscpd`). Runs on full checks only: pre-push (through `verify`) and CI, never in the edit hook, stop hook or pre-commit, because it scans the whole tree. The result is one number, `metrics.duplication` in the baseline, which can only go down; the failure message lists the five largest clones.

*Why a percentage and not per-file keys.* Duplication is a relation between two or more files, so a per-file count has no honest owner: a clone of `a.ts` in `b.ts` could be charged to either, and extracting a helper moves the charge to a third file. Moves, renames and a change to `minTokens` would rewrite many keys that did not get worse. One percentage is stable under all of that and has one direction that matters. Its weakness is the denominator: adding a lot of clean code lowers the percentage and leaves headroom for new copies. Run `baseline --tighten` after growth to take that headroom back.

**markdownlint-cli2** (npm `markdownlint-cli2`). Prettier owns Markdown formatting, so the template turns off the rules that overlap or fight it: MD013 (line length), MD033 (inline HTML), MD041 (first line heading), MD055 and MD060 (table pipe and column style). MD056 (table column count) stays on because it catches broken tables, which Prettier does not.

**lychee** (Rust binary on PATH: `brew install lychee`). Runs `--offline` (local links and anchors) everywhere except CI. `GUARDRAILS_ONLINE=1`, set by the CI snippet, also checks URLs. Exit 2 is lychee's "links failed" and maps to findings; exit 1 (runtime or config error) fails the gate, as does a report with no `error_map` or exit 2 with no failed link and no timeout (the format changed). Timeouts alone are not findings, so a slow host cannot fail the gate.

**editorconfig-checker** (npm `editorconfig-checker`, a downloaded Go binary). Enforces `.editorconfig` (final newline, indent style, trailing whitespace) on every tracked file type the gate watches.

**actionlint** (Go binary on PATH: `brew install actionlint`). Lints `.github/workflows/*.yml`, including shell embedded in `run:` steps. Not run against the real tool here, see [Verified against real tools](#verified-against-real-tools).

## ts

The original stack, described in the [Tool reference](./tool-reference.md): Oxlint, dependency-cruiser, Knip, the disable check, Prettier, Vitest coverage floors. These tools are declared in the same registry and switch on with the config files every v3 install already has (`.oxlintrc.json`, `.dependency-cruiser.mjs`, `knip.json`), so they run exactly as before, and a repo without those files (a Mule or Python repo) does not need Oxlint installed. To keep v3 behaviour, Oxlint is also on when `oxlint` is a dependency in `package.json` or any Oxlint config name exists (`.oxlintrc.json`, `.oxlintrc.jsonc`, `oxlint.config.ts`), and Knip when `knip` is a dependency or any Knip config exists (`knip.json`, `knip.jsonc`, `.knip.json`, `.knip.jsonc`, `knip.ts`, `knip.js`, `knip.config.ts`). dependency-cruiser exits with the number of errors, so every exit code is accepted as long as its JSON report parses. Prettier and Vitest run through the `format:check` and `test:coverage` package scripts that `verify` calls, not through the finding engine.

## python

Templates: `templates/packs/python/`. Needs `uv`; every tool runs as `uv run <tool>` from the dev dependency group, with `UV_LOCKED=1` in CI. Separate from the TypeScript stack and sharing only the engine and the baseline: a Python part inside a TypeScript repo works, and so does a repo with no `package.json`. **One Python project per repo, at the repo root:** the switches read the root `pyproject.toml` and `uv run` runs from the git root. Nested Python projects (a `pyproject.toml` in a subfolder) are not supported; a repo with several would need one guardrails setup per project.

| Tool | Config (switch) | Findings | Stages |
| --- | --- | --- | --- |
| ruff (lint) | `[tool.ruff]` in `pyproject.toml`, or `ruff.toml` | `ruff:<code>\|file` | edit, commit, push |
| ruff (format) | same | `ruff-format:format\|file` | commit, push |
| pyright | `[tool.pyright]` or `pyrightconfig.json` | `pyright:<rule>\|file` | commit, push (whole project) |
| tach | `tach.toml` | `tach:UndeclaredDependency\|file` | push |
| deptry | `[tool.deptry]` | `deptry:DEP001\|file` | push |
| vulture | `[tool.vulture]` | `vulture:unused-function\|file` | push |
| pytest coverage | `[tool.coverage.*]` | metric `python-coverage` (up) | ci |

pyright is the type checker; mypy is not wired. tach (module boundaries) is the Python counterpart of dependency-cruiser, deptry of Knip's dependency checks, vulture of dead-code detection. Whole-project tools run on full checks because a file-scoped run misses usages elsewhere. The coverage floor needs `pytest-cov` in the dev group.

## mule

Templates: `templates/packs/mule/`. For MuleSoft applications (a `mule-artifact.json`, `pom.xml`, Mule XML, DataWeave, MUnit). A monorepo with several applications is scanned application by application.

| Tool | Config (switch) | Findings | Stages |
| --- | --- | --- | --- |
| mule-lint | `.mulelintrc.json` | `mule-lint:<rule-id>\|file` | edit, commit, push |
| mule-format | `.mulelintrc.json` | `mule-format:format\|file` | commit, push |
| mule-secrets | `.mulelintrc.json` | `mule-secrets:plain-secret\|file` | edit, commit, push |
| munit | `munit-maven-plugin` in `pom.xml` | `munit:tests-or-coverage-failed\|pom.xml` (never baselined) | ci |

**mule-lint** is [`@sfdxy/mule-lint`](https://github.com/Avinava/mule-lint), run as `mule-lint <app> --config .mulelintrc.json --format json`. The profile and per-rule options live in the config (`extends: mule-lint:recommended`; mule-lint does not find the file on its own, so the engine always passes `--config`). Errors and warnings are findings; info findings are advisory and are not counted. Flow and sub-flow naming is rule `MULE-002`, so there is no separate naming check; file names are covered by the ls-lint template in this folder.

**mule-format** runs `mule-lint format --check <app>` (Prettier with Anypoint Studio defaults) on Mule XML. There is no maintained command-line formatter for DataWeave (`.dwl`) files, so those are not format-checked; the mule-lint DW rules check their content.

**mule-secrets** reads `*.properties` and `*.yaml` under `src/main/resources` and `src/test/resources`. A key that looks like a secret (`password`, `secret`, `token`, `api key`, `private key`, `credential`) must hold a `${placeholder}` or an encrypted `![...]` Secure Properties value. gitleaks still scans the diff for real credentials; this check is for the plain values it cannot recognise.

**munit** runs `mvn test` for each `pom.xml` that configures `munit-maven-plugin`, on full checks only. The coverage floor is `requiredApplicationCoverage` in the pom (see `pom-munit-snippet.xml`), so a coverage miss fails `mvn test`. That number is not part of the baseline; raise it in the pom by hand when coverage improves.

## salesforce

Templates: `templates/packs/salesforce/`. For Salesforce DX projects (`sfdx-project.json`, Apex `.cls` and `.trigger`, LWC). Everything uses `sf`, never `sfdx`.

| Tool | Config (switch) | Findings | Stages |
| --- | --- | --- | --- |
| code-analyzer | `code-analyzer.yml` | `code-analyzer:<engine>.<rule>\|file` | commit, push |
| prettier-apex | `.prettierrc` with `prettier-plugin-apex` | `prettier-apex:format\|file` | commit, push |
| sf-metadata | `code-analyzer.yml` | `sf-metadata:missing-meta-xml\|file`, `stale-api-version` | commit, push |
| apex-coverage | `guardrails/apex-coverage.json` | metric `apex-coverage` (up) | ci |

**code-analyzer** is `sf code-analyzer run` (PMD for Apex, ESLint for LWC, retire-js, regex). The engine passes the staged files with `--target` and reads the results file it writes. It takes about ten seconds, so it is not in the edit hook. Rule selection and overrides live in `code-analyzer.yml`.

**prettier-apex** checks `.cls`, `.trigger` and `.apex` files with `prettier --list-different`. LWC JS, HTML and CSS are covered by the base Prettier check.

**sf-metadata** checks that every class and trigger has its `-meta.xml` and that no `apiVersion` is older than `sourceApiVersion` in `sfdx-project.json`.

**apex-coverage** is an "org health and deployed-code coverage" check, not proof that this revision is correct: CI authenticates to the org and runs the tests of the code deployed *there*, not of this checkout. To test a revision, deploy it to a scratch org first (`sf project deploy start`) and point `targetOrg` at that org. It runs `sf apex run test --test-level RunLocalTests --code-coverage --json` against the org named in `guardrails/apex-coverage.json`, fails if any test fails, and ratchets the org-wide coverage upward. It needs an authenticated scratch org or sandbox. Never point it at production; the setup skill confirms the org before writing the file.

## shell

Templates: `templates/packs/shell/`. Both tools switch on with `.shellcheckrc`.

| Tool | Findings | Stages |
| --- | --- | --- |
| shellcheck | `shellcheck:SCxxxx\|file` | edit, commit, push |
| shfmt | `shfmt:format\|file` | commit, push |

shellcheck runs as `shellcheck -f json1`. shfmt runs `shfmt -l` and reads its indent settings from `.editorconfig`. Both cover `*.sh` and `*.bash`; extensionless scripts are not discovered. Install: `brew install shellcheck shfmt`, or `apt-get install shellcheck shfmt` in CI.

## docker

Templates: `templates/packs/docker/`. Both tools switch on with `.hadolint.yaml`.

| Tool | Findings | Stages |
| --- | --- | --- |
| hadolint | `hadolint:<DLxxxx or SCxxxx>\|Dockerfile` | commit, push |
| compose-config | `compose-config:invalid\|compose file` (never baselined) | commit, push |

hadolint runs as `hadolint --format json` on `Dockerfile*` and `*.Dockerfile`. compose-config runs `docker compose -f <file> config --quiet` once per compose file, which validates the schema and variable interpolation and needs no running daemon. Install hadolint with `brew install hadolint` or a release binary; `docker` is already on CI runners.

## sql (experimental)

Templates: `templates/packs/sql/`. Switched on by `.sqlfluff`, which also sets the dialect.

| Tool | Findings | Stages |
| --- | --- | --- |
| sqlfluff | `sqlfluff:<rule code>\|file` | commit, push |

Runs `sqlfluff lint --format json`. Linting only; `sqlfluff fix` is left to a human. Install: `uv tool install sqlfluff` or `pip install sqlfluff`.

## rust

Templates: `templates/packs/rust/`. Each tool has its own switch file.

| Tool | Config (switch) | Findings | Stages |
| --- | --- | --- | --- |
| cargo fmt | `rustfmt.toml` | `cargo-fmt:format\|file` | commit, push |
| clippy | `clippy.toml` | `clippy:<lint>\|file` | commit, push |
| cargo-deny | `deny.toml` | `cargo-deny:policy\|deny.toml` (never baselined) | push |
| cargo-machete | `[package.metadata.cargo-machete]` in `Cargo.toml` | `cargo-machete:unused-dependency\|Cargo.toml` | push |

cargo fmt runs `cargo fmt --check`. clippy runs `cargo clippy --all-targets --message-format json -- -D warnings`, so every warning is an error, keyed by lint name. A clippy run that cannot compile fails the gate instead of passing. cargo-deny runs `cargo deny check` and reports one finding for the whole policy, with the tool's output attached. cargo-machete lists unused dependencies.

## dart (experimental)

Templates: `templates/packs/dart/`. Switched on by `analysis_options.yaml`.

| Tool | Findings | Stages |
| --- | --- | --- |
| dart-format | `dart-format:format\|file` | commit, push |
| dart-analyze | `dart-analyze:<code>\|file` | commit, push |
| flutter-coverage | metric `flutter-coverage` (up) | ci |

dart-format runs `dart format --output=none --set-exit-if-changed`. dart-analyze runs `dart analyze --format=machine` in a plain Dart package and `flutter analyze --no-pub` when `pubspec.yaml` declares `sdk: flutter`. flutter-coverage runs `flutter test --coverage`, reads `coverage/lcov.info` and ratchets the line coverage upward; it does nothing in a non-Flutter package.

## cpp (experimental)

Templates: `templates/packs/cpp/`, for C and C++ including PlatformIO firmware.

| Tool | Config (switch) | Findings | Stages |
| --- | --- | --- | --- |
| clang-format | `.clang-format` | `clang-format:format\|file` | commit, push |
| pio-check | `check_tool` in `platformio.ini` | `pio-check:<tool>.<id>\|file` | ci |

clang-format runs `clang-format --dry-run --Werror`; each misformatted line is one finding. pio-check runs `pio check --skip-packages --json-output` with cppcheck or clang-tidy (`check_tool`). It downloads toolchains, so it is pre-push and CI only.

## security

Templates: `templates/packs/security/`. Each tool is switched on by its own file, so a repo can take one without the others. No tool is installed by npm: install them on PATH and in CI (`ci.yml` has the steps for the base `verify` job; no separate job is needed because nothing here is ci-stage).

| Tool | Config (switch) | Findings | Stages |
| --- | --- | --- | --- |
| osv-scanner | `osv-scanner.toml` | `osv-scanner:<advisory id>\|lockfile` | push |
| semgrep | `.semgrep/rules.yml` | `semgrep:<rule-id>\|file` | push |
| zizmor | `.github/zizmor.yml` (or `zizmor.yml`) | `zizmor:<audit>\|workflow` | commit, push |

**osv-scanner** (`brew install osv-scanner`, or `go install github.com/google/osv-scanner/v2/cmd/osv-scanner@latest`). Runs `osv-scanner scan source --format json --config osv-scanner.toml -L <lockfile>...` on every lockfile it finds (`package-lock.json`, `npm-shrinkwrap.json`, `pnpm-lock.yaml`, `yarn.lock`, `uv.lock`, `poetry.lock`, `Cargo.lock`, `go.mod`, `composer.lock`, `Gemfile.lock`). One finding per advisory per lockfile. It needs network access to the OSV database, so it is pre-push and CI only, and an advisory published tomorrow can fail a push that changed nothing: accept one with `[[IgnoredVulns]]`, a reason and an `ignoreUntil` date in `osv-scanner.toml`. Exit 1 is findings; 127 (for example no network) fails the gate.

**semgrep** (`uv tool install semgrep` or `pipx install semgrep`). Runs only the rules in `.semgrep/`, with `--metrics=off --disable-version-check --quiet --json --error`. It never loads a registry ruleset: the registry rules are under the Semgrep Rules License, which is not an open source licence, so they are not vendored. The shipped `rules.yml` holds ten rules written for this repo (MIT): `eval`, shell-spawning `exec`, HTML sinks, disabled TLS verification and weak hashes for JavaScript and TypeScript; `eval`, `shell=True`, unsafe deserialisation, disabled TLS verification and weak hashes for Python. Add your own rules as more files in `.semgrep/`. It scans the whole repo, so it is pre-push and CI only; CI runs the same full check.

**zizmor** (`brew install zizmor` or `pipx install zizmor`). Audits `.github/workflows/*.yml` offline (`--offline --format json-v1`), so no GitHub token is needed and the online audits are skipped. Exit 10 to 14 means findings (by severity), 0 is clean, 1 is a failure. Findings an ignore rule in the config already accepts are dropped. Overlap with actionlint is intended: actionlint checks syntax and types, zizmor checks for security problems.

## playwright

Templates: `templates/packs/playwright/`. Lint rules for Playwright suites, switched on by `guardrails/playwright.json`. The rules are generated inside `guardrails-packs.mjs` and run by [ast-grep](https://ast-grep.github.io) (npm `@ast-grep/cli`); neither ESLint nor `eslint-plugin-playwright` is used ([decision 0004](./decisions/0004-playwright-pack.md)).

| Tool | Config (switch) | Findings | Stages |
| --- | --- | --- | --- |
| playwright | `guardrails/playwright.json` | `playwright:<rule>\|file` | edit, commit, push |

```json
{ "include": ["**/e2e/**", "**/*.spec.*"], "ignore": [] }
```

Those are also the defaults when a key is left out. Only JavaScript and TypeScript files (`.js`, `.jsx`, `.ts`, `.tsx` and their `.mjs`, `.cjs`, `.mts`, `.cts` forms) are read. If unit tests are also named `*.spec.*`, narrow `include` to the e2e folders.

| Rule | Fails on |
| --- | --- |
| `fixed-wait` | `.waitForTimeout()` on any object; `new Promise` that hands its resolve function to `setTimeout`; importing `setTimeout` from `timers/promises`; `promisify(setTimeout)` |
| `focused-test` | `.only` on `test`, `it`, `describe`, `setup`, `teardown` or a `*Test` alias, or on any object called as `.only('title', fn)` |
| `skip` | `.skip` or `.fixme` (same objects, plus `testInfo`) without a live quarantine tag, unless it is the conditional form |
| `stale-quarantine` | a `@quarantine` tag that has expired or has no valid date, whether or not the test is skipped (a tag excluded with `grepInvert` is a skip too) |
| `conditional-in-test` | `if` or `switch` directly in a test or `test.step` body |
| `suppression` | an `ast-grep-ignore` comment that is bare or names one of these rules |

**Quarantine.** The tag is `@quarantine-YYYY-MM-DD`, in the title or the `tag` option of the test or of a `describe` around it. It is live through that date (UTC) and fails from the next day, with no change to the code. The value must be a literal string: a tag held in a constant is not read. The date has no upper limit, so review new tags.

```ts
test.fixme('pays by card', { tag: '@quarantine-2027-01-31' }, async ({ page }) => {});
```

**Conditional skip.** `test.skip(condition, 'reason')` and `test.fixme(condition, 'reason')` need no tag when there are exactly two arguments, the condition reads at least one name (`browserName !== 'chromium'`, `!process.env.API_URL`, `({ isMobile }) => isMobile`) and the reason is a string or template literal. `test.skip()`, `test.skip(true, '...')` and a condition without a reason fail. A condition that is always true through a name (`const off = true`) is not detected.

**Conditionals.** Only `if` and `switch` whose nearest function is the test body count. Route handlers, `page.evaluate` callbacks, helpers, hooks and ternaries do not, and neither does a type guard that only throws (`if (!box) throw new Error('no box')`).

**Not covered.** There is no "test without assertions" rule: assertions often live in page objects and helpers, and no pattern tells those from a test that checks nothing. `test['only']`, an alias not named `*Test` used as `alias.skip()`, and `timers.setTimeout()` through a default import are not matched. A file with a syntax error is read as far as the parser recovers; the typecheck and Playwright report the error.

**Failing closed.** The gate fails on a missing binary, a config that is not valid, a full run where no file matches `include`, an ast-grep error, and any file ast-grep did not scan (unreadable, not UTF-8 or very large). The project's `sgconfig.yml` does not affect this tool. An exception to a rule goes through the baseline, after review.

## Verified against real tools

Each tool was run through `guardrails.mjs` with the shipped template config where it was installed. Everything else is covered only by the fake-output unit tests in `scripts/packs-*-test.mjs`, which use output copied from real runs where we had it, and from the tool's documentation otherwise.

| Tool | Status |
| --- | --- |
| ast-grep 0.51.0, ls-lint 2.3.2, cspell 10.4.0, jscpd 5.4.2, markdownlint-cli2 0.24.0, lychee 0.24.2, editorconfig-checker 6.2.0 | run for real |
| osv-scanner 2.7.1 (npm lockfile; needs network), semgrep 1.187.0 (the shipped rules on TypeScript and Python), zizmor 1.33.1 (with the template config) | run for real (`scripts/packs-security-test.mjs`, which skips a tool that is not installed) |
| playwright rules (ast-grep 0.51.3) | run for real (`scripts/packs-playwright-test.mjs`, which skips those tests when ast-grep is not installed) |
| vocab-literal, token drift (ast-grep 0.51.3) | run for real (`scripts/packs-vocab-test.mjs`, `scripts/packs-core-test.mjs`) |
| actionlint | not run against the real tool (not installed); fake output from the documented JSON template |
| ruff 0.16.9, pyright 1.1.414, tach 0.35.3, deptry 0.25.1, vulture 2.16, pytest-cov through uv 0.12.21 | run for real (ruff format output changed in 0.16, which the parser handles) |
| mule-lint 2.3.0 (lint and `format --check`), the properties secret check | run for real |
| Maven and MUnit | not run (fake `mvn` only); the coverage floor is enforced by Maven |
| `sf code-analyzer` (Code Analyzer 0.49 engines) and the metadata checks | run for real |
| prettier-apex, `sf apex run test` (needs an org) | not run (fake output only) |
| shellcheck 0.11 | run for real |
| shfmt | not run (not installed; fake output of `shfmt -l`) |
| `docker compose config` | run for real |
| hadolint | not run (not installed; JSON fields from its documented format) |
| sqlfluff | not run (not installed; fake output of `--format json`) |
| `cargo fmt --check`, `cargo clippy` (1.93) | run for real |
| cargo-deny (needs the advisory database), cargo-machete (not installed) | not run (fake output) |
| dart format, dart analyze, flutter analyze, flutter test --coverage | not run (the SDK shim is not configured here; fake output): **experimental** |
| clang-format, `pio check` | not run (clang-format not installed; `pio check` needs a toolchain download; fake output) |
