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
