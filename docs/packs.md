# Packs

The engine, `scripts/guardrails.mjs`, knows nothing about any language. Every tool comes from a **pack** declared in `scripts/guardrails-packs.mjs`. A tool is an external command: the engine runs it, checks the exit code, parses the output into findings and keys each one `tool:rule|file`. Adding a stack is a new pack object plus a template folder, never a change to the engine.

Everything beyond the original TypeScript stack is **opt-in**. A tool switches on only when its config file exists, so installs that predate a pack do not change. Run `node scripts/guardrails.mjs packs` to see which stacks the repo contains and which tools are on.

## Matrix

| Pack | Detect rule | Tools | Default |
| --- | --- | --- | --- |
| `core` | every repo | cspell, jscpd, ast-grep, ls-lint, markdownlint-cli2, lychee, editorconfig-checker, actionlint (gitleaks, lefthook, commitlint are installed by the base setup) | opt-in per tool |
| `ts` | `package.json`, `tsconfig*.json` | Oxlint, dependency-cruiser, Knip, disable check, Prettier, Vitest floors | on in every v3 install (switched on by `.oxlintrc.json`, `.dependency-cruiser.mjs`, `knip.json`) |
| `python` | `pyproject.toml`, `uv.lock` | ruff (lint, format), pyright, tach, deptry, vulture, pytest coverage floor | opt-in |
| `mule` | `mule-artifact.json`, `src/main/mule/*.xml` | mule-lint, Mule XML format check, properties secrets, MUnit through Maven | opt-in |

More packs are added below as they ship.

## The pack contract

A pack is `{ id, detect, tools }`. `detect` is a list of patterns on repo paths, so a monorepo with several stacks matches several packs. Detection only suggests packs to the setup skill; whether a tool runs is decided by its own `optIn`.

A tool declares:

| Field | Meaning |
| --- | --- |
| `id` | Finding prefix. Baseline keys are `id:rule\|file`, the same format for every tool. |
| `optIn` | The config files that switch the tool on. A string is a file that must exist. `{ file, has }` also needs the pattern in the file (for example `[tool.ruff]` in `pyproject.toml`). |
| `exts` | Files the tool covers. The hooks use it to run only the tools whose files changed. |
| `track` | File types to start tracking when the tool is on (cspell adds Markdown). |
| `stages` | Where it runs. `edit`: the post-edit hook. `commit`: pre-commit, `check --files`, `check --changed` and the stop hook. `push`: the full check, which is pre-push (through `verify`) and CI. |
| `whole` | Run on the whole project even in a scoped run; findings are then filtered to the files in scope. For tree-wide tools. |
| `perFile` | One command per file. |
| `ok` | Exit codes that mean the tool ran. Anything else is a tool failure and blocks, never a silent pass. Default `[0, 1]`. |
| `run(ctx)` and `parse(out, ctx)` | The exact command, and how its output becomes `{ rule, file, line, message }`. |
| `scan(ctx)` | Replaces `run` and `parse` for checks done in JS (naming, metadata). |
| `metric`, `measure(ctx)` | A number ratchet instead of findings. |

Non-Node tools need nothing special: `run` returns `{ cmd: 'shellcheck', args: [...] }`. Python tools return `{ cmd: 'uv', args: ['run', 'ruff', ...] }`.

### Metric ratchets

Some things are a ratio, not a count per file. Duplication, test coverage and Apex coverage are one number each. A metric tool declares `direction` (`down` for duplication, `up` for coverage floors). The value is stored in `guardrails.baseline.json` under `metrics`:

- `check` (full only) fails if the number moves the wrong way.
- `check --strict-baseline` also fails if it moved the right way, so the win must be committed.
- `baseline --tighten` moves it the right way only, and records it the first time the tool is enabled (adding its config file is itself a reviewed change).

Metrics run at the `push` stage only, never in hooks, because they scan the whole project or run the test suite.

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
| ls-lint | `.ls-lint.yml` | `ls-lint:<ext>-<rule>\|path` | edit, commit, push |
| cspell | `cspell.json` | `cspell:unknown-word\|file`, `cspell:forbidden-word\|file` | edit, commit, push |
| jscpd | `.jscpd.json` | metric `duplication` (down) | push |
| markdownlint-cli2 | `.markdownlint-cli2.jsonc` | `markdownlint:MDxxx\|file` | commit, push |
| lychee | `lychee.toml` | `lychee:broken-link\|file` | commit, push |
| editorconfig-checker | `.ecrc` | `editorconfig-checker:<problem>\|file` | commit, push |
| actionlint | `.github/actionlint.yaml` | `actionlint:<rule-kind>\|file` | commit, push |

**ast-grep** (npm `@ast-grep/cli`, run as `ast-grep scan --json=stream`; `sg` is a deprecated alias used only as a fallback). Custom structural rules only; Oxlint keeps every rule it has natively. The templates ship `no-vocab-literal` (bans a string equal to a member of the vocab or enum module outside a `vocab/` directory, tests and imports; a literal in type position counts too) and `no-banned-identifier` (an example list of vague names). ast-grep rules are static, so the setup skill fills the regex from the module's values; a new vocab value needs a new entry.

**ls-lint** (npm `@ls-lint/ls-lint`). Owns folder names, banned extensions (`.spec.ts: exists:0`) and the case of non-code files. It sets no case for `.ts`, `.tsx`, `.js` or `.mjs`: Oxlint `unicorn/filename-case` owns those (see [the split](./known-conflicts.md#ls-lint-and-unicornfilename-case)). It scans the whole tree. A banned extension is reported on its directory, so it is caught on pre-push and CI rather than in the edit hook.

**cspell** (npm `cspell`). Checks code and Markdown. `flagWords` turns a banned synonym into a finding wherever it appears, including comments, strings and docs; cspell splits camelCase, so `whitelistRules` is caught too. Unknown words go in the project dictionary after review, not in bulk. On a retrofit the first run is noisy: `baseline --init` records it.

**jscpd** (npm `jscpd`). Runs on full checks only: pre-push (through `verify`) and CI, never in the edit hook, stop hook or pre-commit, because it scans the whole tree. The result is one number, `metrics.duplication` in the baseline, which can only go down; the failure message lists the five largest clones.

*Why a percentage and not per-file keys.* Duplication is a relation between two or more files, so a per-file count has no honest owner: a clone of `a.ts` in `b.ts` could be charged to either, and extracting a helper moves the charge to a third file. Moves, renames and a change to `minTokens` would rewrite many keys that did not get worse. One percentage is stable under all of that and has one direction that matters. Its weakness is the denominator: adding a lot of clean code lowers the percentage and leaves headroom for new copies. Run `baseline --tighten` after growth to take that headroom back.

**markdownlint-cli2** (npm `markdownlint-cli2`). Prettier owns Markdown formatting, so the template turns off the rules that overlap or fight it: MD013 (line length), MD033 (inline HTML), MD041 (first line heading), MD055 and MD060 (table pipe and column style). MD056 (table column count) stays on because it catches broken tables, which Prettier does not.

**lychee** (Rust binary on PATH: `brew install lychee`). Runs `--offline` (local links and anchors) everywhere except CI. `GUARDRAILS_ONLINE=1`, set by the CI snippet, also checks URLs. Timeouts are not findings, so a slow host cannot fail the gate.

**editorconfig-checker** (npm `editorconfig-checker`, a downloaded Go binary). Enforces `.editorconfig` (final newline, indent style, trailing whitespace) on every tracked file type the gate watches.

**actionlint** (Go binary on PATH: `brew install actionlint`). Lints `.github/workflows/*.yml`, including shell embedded in `run:` steps. Not run against the real tool here, see [Verified against real tools](#verified-against-real-tools).

## ts

The original stack, described in the [Tool reference](./tool-reference.md): Oxlint, dependency-cruiser, Knip, the disable check, Prettier, Vitest coverage floors. These tools are declared in the same registry and switch on with the config files every v3 install already has (`.oxlintrc.json`, `.dependency-cruiser.mjs`, `knip.json`), so they run exactly as before, and a repo without those files (a Mule or Python repo) does not need Oxlint installed. Prettier and Vitest run through the `format:check` and `test:coverage` package scripts that `verify` calls, not through the finding engine.

## python

Templates: `templates/packs/python/`. Needs `uv`; every tool runs as `uv run <tool>` from the dev dependency group, with `UV_LOCKED=1` in CI. Separate from the TypeScript stack and sharing only the engine and the baseline: a Python part inside a TypeScript repo works, and so does a repo with no `package.json`.

| Tool | Config (switch) | Findings | Stages |
| --- | --- | --- | --- |
| ruff (lint) | `[tool.ruff]` in `pyproject.toml`, or `ruff.toml` | `ruff:<code>\|file` | edit, commit, push |
| ruff (format) | same | `ruff-format:format\|file` | commit, push |
| pyright | `[tool.pyright]` or `pyrightconfig.json` | `pyright:<rule>\|file` | commit, push (whole project) |
| tach | `tach.toml` | `tach:UndeclaredDependency\|file` | push |
| deptry | `[tool.deptry]` | `deptry:DEP001\|file` | push |
| vulture | `[tool.vulture]` | `vulture:unused-function\|file` | push |
| pytest coverage | `[tool.coverage.*]` | metric `python-coverage` (up) | push |

pyright is the type checker; mypy is not wired. tach (module boundaries) is the Python counterpart of dependency-cruiser, deptry of Knip's dependency checks, vulture of dead-code detection. Whole-project tools run on full checks because a file-scoped run misses usages elsewhere. The coverage floor needs `pytest-cov` in the dev group.

## mule

Templates: `templates/packs/mule/`. For MuleSoft applications (a `mule-artifact.json`, `pom.xml`, Mule XML, DataWeave, MUnit). A monorepo with several applications is scanned application by application.

| Tool | Config (switch) | Findings | Stages |
| --- | --- | --- | --- |
| mule-lint | `.mulelintrc.json` | `mule-lint:<rule-id>\|file` | edit, commit, push |
| mule-format | `.mulelintrc.json` | `mule-format:format\|file` | commit, push |
| mule-secrets | `.mulelintrc.json` | `mule-secrets:plain-secret\|file` | edit, commit, push |
| munit | `munit-maven-plugin` in `pom.xml` | `munit:tests-or-coverage-failed\|pom.xml` | push |

**mule-lint** is [`@sfdxy/mule-lint`](https://github.com/Avinava/mule-lint), run as `mule-lint <app> --config .mulelintrc.json --format json`. The profile and per-rule options live in the config (`extends: mule-lint:recommended`; mule-lint does not find the file on its own, so the engine always passes `--config`). Errors and warnings are findings; info findings are advisory and are not counted. Flow and sub-flow naming is rule `MULE-002`, so there is no separate naming check; file names are covered by the ls-lint template in this folder.

**mule-format** runs `mule-lint format --check <app>` (Prettier with Anypoint Studio defaults) on Mule XML. There is no maintained command-line formatter for DataWeave (`.dwl`) files, so those are not format-checked; the mule-lint DW rules check their content.

**mule-secrets** reads `*.properties` and `*.yaml` under `src/main/resources` and `src/test/resources`. A key that looks like a secret (`password`, `secret`, `token`, `api key`, `private key`, `credential`) must hold a `${placeholder}` or an encrypted `![...]` Secure Properties value. gitleaks still scans the diff for real credentials; this check is for the plain values it cannot recognise.

**munit** runs `mvn test` for each `pom.xml` that configures `munit-maven-plugin`, on full checks only. The coverage floor is `requiredApplicationCoverage` in the pom (see `pom-munit-snippet.xml`), so a coverage miss fails `mvn test`. That number is not part of the baseline; raise it in the pom by hand when coverage improves.

## Verified against real tools

Each tool was run through `guardrails.mjs` with the shipped template config where it was installed. Everything else is covered only by the fake-output unit tests in `scripts/packs-*-test.mjs`, which use output copied from real runs where we had it, and from the tool's documentation otherwise.

| Tool | Status |
| --- | --- |
| ast-grep 0.51.0, ls-lint 2.3.2, cspell 10.4.0, jscpd 5.4.2, markdownlint-cli2 0.24.0, lychee 0.24.2, editorconfig-checker 6.2.0 | run for real |
| actionlint | not run against the real tool (not installed); fake output from the documented JSON template |
| ruff 0.16.9, pyright 1.1.414, tach 0.35.3, deptry 0.25.1, vulture 2.16, pytest-cov through uv 0.12.21 | run for real (ruff format output changed in 0.16, which the parser handles) |
| mule-lint 2.3.0 (lint and `format --check`), the properties secret check | run for real |
| Maven and MUnit | not run (fake `mvn` only); the coverage floor is enforced by Maven |
