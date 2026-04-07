---
name: writing-agent-instructions
description: Use when creating or updating AI agent instruction files (CLAUDE.md, GEMINI.md, AGENTS.md, .cursorrules) for a project
---

## Overview

AI coding agents read instruction files at session start. These files give the agent project context — commands, architecture rules, workflow, and constraints. Without them, the agent wastes time rediscovering your project structure on every session.

## Which File for Which Agent

| Agent | File | Format | Auto-Discovered |
|-------|------|--------|----------------|
| Claude Code | `CLAUDE.md` | Markdown with bold emphasis | ✅ At session start |
| Gemini CLI | `GEMINI.md` | Markdown with bold emphasis | ✅ At session start |
| Cursor | `.cursorrules` | Comment-style (`# ...`) | ✅ At session start |
| GitHub Copilot / Codex | `AGENTS.md` | Markdown | ✅ At session start |

Place these files at the **project root** (next to `package.json`).

## What to Include

Every agent instruction file should contain these sections:

### 1. Workflow
The step-by-step process for completing tasks:
```markdown
## Workflow
1. **Analyze**: Understand the requirements and existing code.
2. **Plan**: Describe proposed changes and wait for approval.
3. **Implement**: Make changes and write tests.
4. **Validate**: Run `git commit` — Lefthook checks 7 tools in parallel (~3s).
5. **Refine**: If rejected, read errors, fix all in one pass, retry.
```

### 2. Commands
Available npm scripts:
```markdown
## Commands
- `npm run build` — Build all packages
- `npm run test` — Run test suite (Vitest)
- `npm run lint` — ESLint with architecture boundaries
- `npm run typecheck` — Type-check all packages
- `npm run lint:unused` — Dead code detection (Knip)
- `npm run lint:deps` — Dependency version consistency (Syncpack)
```

### 3. Architecture (monorepo)
```markdown
## Architecture
This is a TypeScript monorepo with tiered dependencies.
A package can NEVER import from its own tier or higher.

- Tier 0: shared-types, logger (leaf — no workspace deps)
- Tier 1: config, helpers (imports tier 0)
- Tier 2: database, external-api (imports tier 0-1)
- Tier 3: domain-logic, processing (imports tier 0-2)
- Tier 4: orchestrator (imports tier 0-3)
- Apps: cli, web, worker (imports anything)
```

Replace the package names with YOUR actual packages.

### 4. Critical Rules
```markdown
## Critical Rules
- NEVER use `console.log` — use the logger package
- NEVER use `any` — use proper types or `unknown`
- ALWAYS `await` promises — no fire-and-forget
- ALWAYS write tests before implementation (TDD)
```

### 5. Commit Format
```markdown
## Commit Format
Conventional Commits: `type(scope): description`
Types: feat, fix, refactor, docs, test, chore
Scopes: package names + deps, ci, release
```

## Platform-Specific Formatting

### Claude Code / Gemini CLI / Codex (Markdown)
Use `**bold**` for emphasis, `##` headings, and bullet lists. These agents parse standard Markdown.

### Cursor (`.cursorrules`)
Use comment-style formatting. Each line starts with `#`:
```
# Critical Rules:
# - NEVER use console.log — use the logger package
# - NEVER use any — use proper types or unknown
```

## Keeping Files in Sync

All four files convey the same information in different formats. When the project changes (new packages, new commands, new rules), update ALL instruction files.

Quick sync checklist:
- [ ] Package added? → Update architecture section in all files
- [ ] Script added/renamed? → Update commands section in all files
- [ ] New rule? → Update critical rules in all files
- [ ] Scope added? → Update commit format scopes in all files

## Fetching Templates

Templates with sensible defaults are available at:
```
https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/agents/CLAUDE.md
https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/agents/GEMINI.md
https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/agents/AGENTS.md
https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/agents/.cursorrules
```

Fetch, customize with your project's packages/tiers/commands, and write to the project root.

## Anti-Patterns

| Don't | Why |
|-------|-----|
| Copy-paste without customizing | Generic tiers/names confuse the agent |
| Include implementation details | These are instructions, not documentation |
| List every ESLint rule | Too verbose — just mention the critical ones |
| Forget to update after adding packages | Agent will use stale architecture info |
| Put project documentation here | Use `docs/` for that — these files are for agent context |

## Related Skills

- **setup-guardrails** — Creates the initial agent instruction files
- **enforce-architecture** — The tier rules that go in the architecture section
