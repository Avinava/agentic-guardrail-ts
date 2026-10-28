# Agent loop

How the guardrails talk to a coding agent, and how the agent should respond. The `guardrails-loop` skill installs this.

## Four layers

| Layer | Trigger | Runs | On failure |
| --- | --- | --- | --- |
| Post-edit hook | Agent edits or writes a file | Oxlint and the disable check on that file | Exit 2. The report goes back to the agent as the tool result |
| Stop hook | Agent tries to finish | `typecheck`, check on changed files, `vitest related` | Returns `{"decision":"block","reason":...}`. The agent keeps working |
| Pre-commit and commit-msg | `git commit` | Prettier, check on staged files, gitleaks, commitlint | Commit is refused |
| Pre-push | `git push` | `verify`: format check, typecheck, full check, tests with coverage | Push is refused |
| CI | PR, push to main | `verify`, `check --strict-baseline`, commitlint over the PR range, gitleaks over history | PR is red |

Fast checks run early. Whole-project checks (Knip, full tests with coverage) run late. Each layer compares against the baseline, so only new findings fail.

## What a rejection looks like

```text
guardrails: 2 new finding(s) above the baseline (31 known)
  src/domain/invoice.ts:0  depcruise layer-domain  imports src/infrastructure/ledger-store.ts
  src/domain/invoice.ts:14  oxlint eslint(max-params)  Function has too many parameters (5). Maximum allowed is 4.
Fix the code. Do not edit guardrails.baseline.json, raise limits, add bare disables or bypass hooks. ...
```

Every line names the file, the tool and the rule.

## How the agent should respond

1. Read the rule ID. Fix the root cause, not the symptom.
2. Fix every reported finding in one pass, then let the hook run again.
3. Architecture errors: move shared code down a layer or tier, or inject the dependency. Do not add an exception.
4. Size and complexity errors: extract functions, use an options object, split the file.
5. A disable is a last resort and needs a paper trail: `// oxlint-disable-next-line <rule> -- <reason>, <tracking ref>`. Bare disables fail the gate.
6. Findings in files the agent did not touch belong to the baseline. Mention them; do not fix or suppress them in the same change.
7. If a rule is wrong for the codebase, stop and ask a human.

Never: `--no-verify`, `LEFTHOOK=0`, changing `core.hooksPath`, editing `guardrails.baseline.json`, running `baseline --init` or `--reset`, raising limits or lowering coverage thresholds.

## Claude Code

`.claude/settings.json` registers:

- `PostToolUse` on `Edit|Write|MultiEdit`: `guardrails.mjs hook post-edit` (60 s timeout).
- `Stop`: `guardrails.mjs hook stop` (600 s timeout).
- `permissions.deny` for the bypasses above and for edits to `guardrails.baseline.json`.

The stop hook runs whenever a source file changed since `HEAD`, deletions included, because deleting a module can break its importers. If a tool itself fails (not installed, invalid config), both hooks still block and pass the error to the agent, so a broken gate is never silent.

The stop hook checks `stop_hook_active` so it never blocks twice in a row. If the second attempt still fails, the agent stops and the next layer (pre-commit) catches it.

## Codex

`.codex/hooks.json` registers the same two hooks. The post-edit matcher covers `apply_patch`, `Edit` and `Write`, and `guardrails.mjs` reads file paths out of `apply_patch` payloads. Codex has no permission deny list, so the `AGENTS.md` rules and the git hooks carry that part.

## Other agents

Agents without hook support (or with hooks you have not configured) still read `AGENTS.md`, and they still hit lefthook and CI. The loop is slower but the gate is the same.

## AGENTS.md

`AGENTS.md` is the single instruction file. The skill writes a managed block between `<!-- guardrails:start -->` and `<!-- guardrails:end -->` and leaves the rest of the file alone. `CLAUDE.md` contains one line, `@AGENTS.md`, so Claude Code reads the same rules. Keep project-specific guidance outside the managed block.

## Related

- [Tool reference](./tool-reference.md)
- [Troubleshooting](./troubleshooting.md#agent-hooks-do-not-fire)
