# Getting started

## 1. Install the skills

Pick one.

**Paste into any agent.** The agent installs the skills into the project and reads the setup skill straight from disk, so it works without restarting the session:

```text
Set up guardrails in this project. Run `npx skills add Avinava/agentic-guardrail-ts -y`,
then read .agents/skills/setup-guardrails/SKILL.md in full and follow it.
```

`npx skills add` writes the five skills to `.agents/skills/` (read by Codex, Gemini CLI, Cursor and others) links them into `.claude/skills/` for Claude Code, and records the source in `skills-lock.json`. Commit all three so teammates' agents get the same skills, or add them to `.gitignore`.

**Claude Code plugin.** Installs once for your user, in every project:

```text
/plugin marketplace add Avinava/agentic-guardrail-ts
/plugin install agentic-guardrail-ts@agentic-guardrail-ts
```

Update later with `/plugin marketplace update agentic-guardrail-ts`.

**Without the skills CLI.** Have the agent download the skill instead of fetching it as a web page. Web-fetch tools often summarize pages, and the skill is mostly exact config files:

```text
Download https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/skills/setup-guardrails/SKILL.md
with curl into a temp file, read all of it, and follow it to set up guardrails in this project.
```

## 2. Before you run it

- Commit or stash your work. The skill edits many files.
- Install gitleaks (`brew install gitleaks`, or a release binary).
- Use Node 22.12 or newer.
- Monorepos need a `packageManager` field in the root `package.json` (turbo requires it).

## 3. Run setup

Ask the agent: "set up guardrails". The `setup-guardrails` skill works in phases:

1. **Audit.** It detects single package or monorepo, the package manager, workspace layout, DI framework and existing tooling (including a v2 setup).
2. **Gap report.** It lists what is present and correct, present but outdated, and missing. It stops here for your confirmation.
3. **Apply.** It writes the configs, merges `package.json` scripts and devDependencies, maps your directories to layers or tiers, and installs.
4. **Verify.** It runs the gate. On an existing codebase it records current findings with `baseline --init` and sets coverage floors to measured values.

Then run the `guardrails-loop` skill (setup offers it) to install `AGENTS.md` and the agent hooks.

## 4. Commit the result

```bash
git add -A
git commit -m "chore: adopt guardrails"
```

The commit itself goes through the new hooks. That is the first real test.

## Other stacks

The gate is not TypeScript-only. Python, Mule, Salesforce, shell, Docker, SQL, Rust, Dart and C++ are opt-in [packs](./packs.md), and cspell, jscpd, ast-grep, ls-lint, markdownlint, lychee, editorconfig-checker and actionlint are opt-in core tools. Ask the agent to enable the ones you want; `node scripts/guardrails.mjs packs` shows what a repo has and what is on.

## Daily commands

| Command | What it does |
| --- | --- |
| `node scripts/guardrails.mjs check` | Oxlint, dependency-cruiser, Knip and disable checks, compared to the baseline |
| `node scripts/guardrails.mjs check --changed` | The same, limited to files changed since `HEAD` |
| `node scripts/guardrails.mjs verify` | The pre-push gate: format check, typecheck, lint, tests with coverage. CI adds a baseline-tightness check and secret scans |
| `node scripts/guardrails.mjs baseline --tighten` | Lock in fixed findings and raise coverage floors |
| `node scripts/guardrails.mjs packs` | Which stacks the repo has and which tools are on |

Package scripts wrap these: `lint`, `lint:tighten`, `verify`, `typecheck`, `test:coverage`.

## Next

- Existing codebase: [Retrofit](./retrofit.md)
- Coming from v2: [Migrating from v2](./migrating-from-v2.md)
- Monorepo: [Monorepo setup](./monorepo-setup.md)
- When something fails: [Troubleshooting](./troubleshooting.md)
