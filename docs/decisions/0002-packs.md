# 0002: Language-agnostic engine with per-stack packs

Status: accepted (2026-10-30)

## Context

The v3 engine was written for TypeScript: `guardrails.mjs` called Oxlint, dependency-cruiser and Knip directly. The same people also maintain Python, Mule, Salesforce, shell, SQL, Docker, Rust, Dart and C++ repositories, and GitHub Actions workflows live in nearly every repo. Adding each stack by editing the engine would turn it into a pile of special cases.

## Decision

1. The engine only runs external commands, checks their exit codes, parses their output into findings and keys each one `tool:rule|file`. It knows no language.
2. Every tool is declared in `scripts/guardrails-packs.mjs` under a pack, with one uniform contract: how it is switched on, which files it covers, which stage it runs at (`edit`, `commit`, `push`), the exact command and the parser. See [Packs](../packs.md).
3. A tool switches on when its config file exists. Nothing new is on by default, and the TypeScript tools switch on with the files every v3 install already has, so existing installs behave as before.
4. Numbers that are a ratio, not a per-file count (duplication, coverage), are *metrics* stored under `metrics` in the same baseline file, and they only move the right way.
5. A tool that exits non-zero with nothing it can parse is a failure, never a pass. A changed output format therefore breaks loudly instead of turning the gate green (this caught ruff 0.16 changing `ruff format --check` output).

6. Expensive (`ci`-stage) tools run once, in the job that owns their pack: `GUARDRAILS_PACKS` limits a job to packs and `GUARDRAILS_CI_PACKS` limits only the expensive tools. The base job keeps every pack's cheap checks, as in v3.
7. The gate never reads CI files. Reading workflow YAML heuristically gave false passes and false failures across CI systems, so `ci-jobs` is an advisory (GitHub Actions and GitLab only, always exit 0). A pack nobody runs is guarded by generating its job in setup, by the always-printed `deferred: ...` line, and by the doctor advisory.

## Consequences

- Adding a stack is a pack object, a template folder, a docs section and a test with fake tool output.
- The baseline format is unchanged; `metrics` is an optional extra key.
- `guardrails-packs.mjs` ships next to `guardrails.mjs` and is managed the same way.
- Tools that are not on npm (lychee, actionlint, shellcheck, hadolint, cargo, sf, uv) must be installed by the user or CI; the engine reports a missing binary by name.
- Some tools could only be tested against fake output here; `docs/packs.md` lists which.
