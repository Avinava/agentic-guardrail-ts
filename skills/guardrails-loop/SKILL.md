---
name: guardrails-loop
description: >
  Install and work inside the agent feedback loop of a guardrailed TypeScript repo:
  AGENTS.md, Claude Code and Codex hooks that lint each edit and gate the end of a turn,
  and deny rules against bypassing hooks. Use when setting up agent hooks, when a
  guardrails hook, commit or push rejects your change, or when a gate fails and you
  are tempted to skip it, suppress it, or edit the baseline.
---

# Guardrails loop

Guardrails only work if the agent runs into them while it works, not only at
`git commit`. This skill covers two things:
- **Part A:** installing the loop in a target project.
- **Part B:** what to do when it rejects you.

```
edit file ──> PostToolUse hook ──> oxlint + disable check on that file   (seconds)
end of turn ──> Stop hook ──> typecheck + guardrails on changed files + related tests
git commit ──> lefthook ──> prettier, guardrails on staged files, gitleaks, commitlint
git push / CI ──> verify ──> format, typecheck, full guardrails, tests with coverage
```

All four steps call `scripts/guardrails.mjs`, so the agent hooks and the git hooks never disagree.

## Part A: Install the loop

Requires `scripts/guardrails.mjs` from the `setup-guardrails` skill.

1. **AGENTS.md:**
   - If AGENTS.md doesn't exist, write the template below.
   - If it exists, replace the block between `<!-- guardrails:start` and `<!-- guardrails:end -->`.
   - If it has no such block, append the template.
   - Leave the rest of the file alone.
2. **CLAUDE.md and GEMINI.md.** Point them at AGENTS.md:
   - If CLAUDE.md doesn't exist, create it containing `@AGENTS.md`.
   - If it exists and doesn't import AGENTS.md, add `@AGENTS.md` as its first line. Keep its other
     content but move anything that duplicates AGENTS.md into AGENTS.md.
   - Do the same for `GEMINI.md` if the project has one.
3. **`.claude/settings.json`.** Merge the hooks and `permissions.deny` entries from the template:
   - Keep the existing hooks and permissions.
   - Don't add a hook command that is already present.
4. **`.codex/hooks.json`.** Merge the same way.
   - Codex runs repo hooks only after the user trusts them. Tell the user to run `/hooks` in Codex
     once to review and trust them.
5. **Cursor and other agents:**
   - They read AGENTS.md, which is enough.
   - Cursor's hook output is not shown to the model, so don't rely on Cursor hooks for feedback.
   - Git hooks and CI still apply.
6. **Verify:**
   ```bash
   echo '{"stop_hook_active":true}' | node scripts/guardrails.mjs hook stop   # prints nothing
   echo '{"tool_input":{"file_path":"<an existing source file>"}}' | node scripts/guardrails.mjs hook post-edit; echo $?   # 0 when clean
   ```
   Use a real file: the hook ignores paths that don't exist, so a wrong path proves nothing.
   In Claude Code, `/hooks` lists both hooks.

Hooks belong to the project, not to a user-level plugin, so every teammate's agent gets the same
loop and the hooks never fire in unrelated repos.

### How the hooks talk to the agent

| Hook | Blocks with | Loop guard |
| --- | --- | --- |
| PostToolUse (Claude `Edit\|Write\|MultiEdit`, Codex `apply_patch\|Edit\|Write`) | exit 2, findings on stderr | Only reports findings above the baseline in the edited files |
| Stop | `{"decision":"block","reason":...}` on stdout | Exits 0 when `stop_hook_active` is true, so a second stop always ends the turn |

## Part B: When the loop rejects you

### The rules

1. **Read every finding first.** The output lists file, line, tool, rule ID and message. Fix all of
   them in one pass. Don't fix one, retry, and then fix the next.
2. **Fix the code, never the gate.**
   - Don't edit `guardrails.baseline.json`.
   - Don't run `baseline --init` or `--reset`.
   - Don't raise limits or lower coverage thresholds.
   - Don't add a rule to an ignore list.
   - The deny rules block some of these. AGENTS.md forbids all of them.
3. **Never bypass the hooks.** That means no `--no-verify`, `-n`, `LEFTHOOK=0`,
   `LEFTHOOK_EXCLUDE`, `core.hooksPath`, or deleting a job. The only exception is when the user
   explicitly tells you to skip, for that one action.
4. **Tests define behaviour.**
   - A failing test means the code is wrong.
   - Change a test only when the requirement changed. Say so in the commit message.
   - Never skip, delete or weaken a test to get green.
5. **Disables need a paper trail.** A disable is acceptable only when the code is right and the rule
   can't express that. Write `// oxlint-disable-next-line <rule> -- <reason>, <tracking ref>`.
   Bare disables fail the gate on their own.
6. **Findings in files you didn't touch aren't yours to suppress.**
   - The pre-commit and stop hooks only check your files.
   - If CI reports something unrelated, tell the user instead of editing the baseline.

### Reading the output

```
guardrails: 2 new finding(s) above the baseline (41 known)
  src/domain/invoice.ts:12  oxlint eslint(max-params)  Function 'create' has too many parameters (6). Maximum allowed is 4.
  src/domain/invoice.ts:0  depcruise layer-domain  imports src/infrastructure/db.ts
```

`41 known` is the recorded debt. You only need to clear the 2 new findings. Common fixes:

| Rule | Fix |
| --- | --- |
| `eslint(max-params)` | Group related parameters into an options object |
| `eslint(max-lines-per-function)`, `eslint(complexity)`, `eslint(max-depth)` | Extract well-named helpers. Use early returns instead of nesting. |
| `typescript(no-floating-promises)` | `await` it, return it, or `void` it deliberately with a comment |
| `typescript(no-unsafe-*)`, `typescript(no-explicit-any)` | Type the value. Parse unknown input with a schema at the boundary. |
| `typescript(no-non-null-assertion)` | Handle the missing case: narrow, throw a clear error, or use a default |
| `depcruise layer-*` / `tier-*` | Move the shared code down a layer, or inject the dependency. See `enforce-architecture`. |
| `depcruise no-circular` | Extract the shared part into a module both sides import |
| `knip files` / `knip exports` | Delete unused code. If it is a public entry point, add it to `entry` in `knip.json` and tell the user. |
| `knip dependencies` | Remove the dependency, or import it where it is actually used |
| `guardrails disable-needs-rule-and-reason` | Name the rule and add `-- <reason>` |
| `unicorn(filename-case)` | Rename the file and update imports |
| typecheck errors | Fix the types. `@ts-ignore` is banned. `@ts-expect-error` needs a description. |
| gitleaks | Remove the secret and read it from the environment. If it was ever committed, tell the user to rotate it. |
| commitlint | Use `type(scope): subject`, e.g. `fix(billing): round totals half-up` |

### After you fix existing debt

When you clear findings that were in the baseline:
1. Run `node scripts/guardrails.mjs baseline --tighten`. It also raises coverage floors.
2. Commit the smaller baseline together with the fix.

Tightening is the one baseline change agents may make: it can only lower counts.

---

## Templates

<!-- tmpl:templates/agent/AGENTS.md -->
```markdown
<!-- guardrails:start (managed by agentic-guardrail-ts; edit the guardrails configs, not this block) -->

## Guardrails

This repo enforces its rules with tools, not reminders. Every gate runs through `scripts/guardrails.mjs`.

| When                              | What runs                                                                        |
| --------------------------------- | -------------------------------------------------------------------------------- |
| After each file edit (agent hook) | Oxlint (type-aware) and the disable check on the edited file                     |
| When the agent stops (agent hook) | typecheck, guardrails check on changed files, related tests                      |
| `git commit` (lefthook)           | Prettier on staged files, guardrails check on staged files, gitleaks, commitlint |
| `git push` (lefthook) and CI      | `verify`: format check, typecheck, full guardrails check, tests with coverage    |

### Commands

- `node scripts/guardrails.mjs check`: lint, architecture, dead code and disable checks, compared to the baseline
- `node scripts/guardrails.mjs check --changed`: the same for files you changed (Knip runs on full checks only)
- `node scripts/guardrails.mjs verify`: the push gate (CI also checks the baseline is tight and scans for secrets)
- `node scripts/guardrails.mjs baseline --tighten`: lock in improvements after you fix existing findings

### Rules for agents

1. **When a gate fails, fix the code.** Read the rule ID, find the root cause, and change the code so the rule passes.
2. **Never bypass the gates.** That means no `--no-verify` or `-n`, `LEFTHOOK=0`, `LEFTHOOK_EXCLUDE`, `core.hooksPath` changes, or skipped jobs.
3. **Never loosen a gate to get green.**
   - Don't edit `guardrails.baseline.json` by hand.
   - Don't run `baseline --init` or `--reset`.
   - Don't raise limits in `.oxlintrc.json`, `.dependency-cruiser.mjs` or `vitest.config.ts`.
   - Don't lower coverage thresholds.
   - If a rule is wrong for this codebase, stop and ask a human.
4. **A disable comment is a last resort, and it must leave a paper trail.** Name the rule, give the reason, and give a tracking reference:
   `// oxlint-disable-next-line eslint/max-params -- DI constructor, see docs/adr/0003.md`
   Bare disables fail the gate.
5. **Respect the architecture.** Imports only go to lower layers or tiers (see `.dependency-cruiser.mjs`). When you need something from a higher layer, move the shared code down or inject it. Do not add an exception.
6. **Test what you change.** New behaviour gets a test. Coverage floors only go up.
7. **Leave unrelated findings alone.** A failure in a file you didn't touch belongs to the baseline owner; mention it to the human instead of fixing or suppressing it.

<!-- guardrails:end -->
```
<!-- /tmpl -->

`CLAUDE.md`:

<!-- tmpl:templates/agent/CLAUDE.md -->
```markdown
@AGENTS.md
```
<!-- /tmpl -->

`.claude/settings.json`:

<!-- tmpl:templates/agent/.claude/settings.json -->
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/scripts/guardrails.mjs\" hook post-edit",
            "timeout": 60
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PROJECT_DIR}/scripts/guardrails.mjs\" hook stop",
            "timeout": 600
          }
        ]
      }
    ]
  },
  "permissions": {
    "deny": [
      "Bash(git * --no-verify*)",
      "Bash(git commit -n*)",
      "Bash(git commit * -n*)",
      "Bash(*LEFTHOOK=0*)",
      "Bash(*LEFTHOOK_EXCLUDE=*)",
      "Bash(* core.hooksPath*)",
      "Bash(* core.hookspath*)",
      "Bash(*guardrails.mjs baseline --init*)",
      "Bash(*guardrails.mjs baseline --reset*)",
      "Edit(guardrails.baseline.json)"
    ]
  }
}
```
<!-- /tmpl -->

`.codex/hooks.json`:

<!-- tmpl:templates/agent/.codex/hooks.json -->
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "^(apply_patch|Edit|Write)$",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$(git rev-parse --show-toplevel)/scripts/guardrails.mjs\" hook post-edit",
            "timeout": 60,
            "statusMessage": "guardrails: linting edited files"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$(git rev-parse --show-toplevel)/scripts/guardrails.mjs\" hook stop",
            "timeout": 600,
            "statusMessage": "guardrails: checking changes"
          }
        ]
      }
    ]
  }
}
```
<!-- /tmpl -->
