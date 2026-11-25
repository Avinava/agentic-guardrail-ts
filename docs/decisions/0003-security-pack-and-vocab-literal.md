# 0003: Security pack, generated vocab check, own Semgrep rules

Status: accepted (2026-11-25)

## Context

The packs of 3.1.0 cover quality but not security: no dependency advisories, no workflow audit, no code-pattern scan. Separately, the `no-vocab-literal` ast-grep rule needed its regex filled in by hand from the vocab module. A new vocab value silently escaped the rule until someone edited the file.

## Decision

1. A `security` pack with three tools, each opt-in through its own file: osv-scanner (lockfiles, push), semgrep (push) and zizmor (commit and push). All three run offline of any account: zizmor with `--offline`, semgrep with `--metrics=off` and only local rules. osv-scanner needs the network for the OSV database, so it is a push-stage tool and its failure to reach the network fails the gate.
2. Semgrep runs only rules written for this pack, under the repo's MIT licence. The Semgrep registry rules are under the Semgrep Rules License, which is not open source, so they are never vendored or fetched.
3. `vocab-literal` replaces the `no-vocab-literal` ast-grep rule. It is a `scan` tool in JS that reads the vocab module (TypeScript `as const` object or `enum`, Python `StrEnum`) named in `guardrails/vocab.json`, so the list cannot drift. ast-grep cannot do this: its rules are static. The old rule is deleted with no shim, so this is a major version (4.0.0), with a migration step in `setup-guardrails` and `guardrails-doctor`.
4. Token drift is an opt-in ast-grep rule pair (TypeScript and Tsx) that bans colour literals outside the tokens file. CSS is skipped: the gate has no stylelint tool, and adding one only for this is out of scope.

## Consequences

- A repo that upgrades without migrating keeps running the old rule (ast-grep still reads `rules/`), but nothing ships it any more.
- Findings for the same literal move to new baseline keys, so the migration ends with a reviewed `baseline --reset`.
- `vocab-literal` reads source with each language's own parser: the project's `typescript` package for TS and JS, and `python3`'s `ast` module for Python. Two reviews found edge cases in a hand-written tokenizer, so none is kept. The cost is two runtime requirements for the tool: the `typescript` package (already a devDependency of every install) and `python3`, needed only when a Python module is configured. A missing parser, or a file that does not parse, fails the gate; TypeScript's recovering parser still yields literals from a file with a syntax error.
- osv-scanner can fail a push for an advisory published after the last commit. The documented way out is an `[[IgnoredVulns]]` entry with a reason and an end date.
