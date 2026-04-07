# 🛡️ agentic-guardrail-ts

**Automated guardrails for AI-assisted TypeScript development.**

A set of agent-readable skills and pre-configured tools that enforce code quality, architecture boundaries, and dependency hygiene — via a self-correcting feedback loop that runs on every `git commit`.

> AI coding agents are fast but imprecise. They generate code that compiles but violates your architecture, leaks `any` through the type system, leaves dead exports behind, and forgets to `await` promises. This repo gives your agent **skills** to set up 13 guardrail tools and **use them** to catch and fix its own mistakes in seconds.

---

## How It Works

```
Agent generates code
    ↓
git commit → Lefthook runs 7 checks in parallel (~3s)
    ↓
┌─ Prettier ────── auto-fixes formatting               ✓
├─ Knip ────────── detects unused export                ✗
├─ Syncpack ────── checks dependency versions           ✓
├─ ESLint ──────── catches import from wrong tier       ✗
├─ TypeScript ──── finds type error                     ✗
├─ Vitest ──────── runs related tests                   ✓
└─ Commitlint ──── validates commit message             ✓
    ↓
Commit REJECTED — agent reads errors, fixes, retries
    ↓
All checks pass → PR → CI runs full pipeline → merge ✓
```

**The key insight:** AI agents respect git hooks. When a commit fails, the agent sees the error output, fixes the issues, and retries automatically. No human intervention needed.

---

## Installation

### Tell your AI agent

**Claude Code / Cursor / Copilot / Codex / Gemini:**

> Fetch and follow the instructions from
> `https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/skills/setup-guardrails/SKILL.md`
> to set up TypeScript guardrails in this project.

That's it. The agent reads the skill, detects your project type, fetches all configs, installs dependencies, and sets up git hooks.

### Manual (non-agentic)

```bash
bash <(curl -sL https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/scripts/init.sh)
```

See [docs/getting-started.md](docs/getting-started.md) for step-by-step instructions.

---

## Skills

This repo provides **agent-readable skills** — structured instruction files that AI agents read and execute step-by-step. Like [superpowers](https://github.com/obra/superpowers) provides skills for brainstorming and TDD, we provide skills for guardrails.

| Skill | When to Use |
|-------|------------|
| [**setup-guardrails**](skills/setup-guardrails/SKILL.md) | Setting up a new TS project or adding guardrails to an existing one |
| [**enforce-architecture**](skills/enforce-architecture/SKILL.md) | Adding imports, creating packages, or reviewing code for tier violations |
| [**self-correcting-loop**](skills/self-correcting-loop/SKILL.md) | Every commit — how to read errors, fix all in one pass, retry |
| [**adding-a-package**](skills/adding-a-package/SKILL.md) | Creating a new workspace package (monorepo) |
| [**writing-agent-instructions**](skills/writing-agent-instructions/SKILL.md) | Creating/updating CLAUDE.md, GEMINI.md, .cursorrules, AGENTS.md |

### Using a skill

Point your agent at the raw URL:

```
Fetch and follow: https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/skills/<skill-name>/SKILL.md
```

The agent reads the instructions and executes them in your project.

---

## What's Included

| # | Tool | What It Catches | Layer |
|---|------|----------------|-------|
| 1 | [**Lefthook**](docs/tool-reference.md#1-lefthook--hook-orchestrator) | Orchestrates all checks in parallel | Pre-commit |
| 2 | [**Prettier**](docs/tool-reference.md#2-prettier--lint-staged--formatting) | Formatting inconsistencies | Pre-commit |
| 3 | [**ESLint + Boundaries**](docs/tool-reference.md#3-eslint--boundaries--architecture-enforcement) | Architecture violations, `any` leaks, floating promises | Pre-commit + CI |
| 4 | [**TypeScript**](docs/tool-reference.md#4-typescript-strict-mode) | Type errors, unused variables | Pre-commit + CI |
| 5 | [**Knip**](docs/tool-reference.md#5-knip--dead-code-detection) | Unused files, exports, dependencies | Pre-commit + CI |
| 6 | [**Syncpack**](docs/tool-reference.md#6-syncpack--dependency-version-consistency) | Version mismatches across packages | Pre-commit + CI |
| 7 | [**Publint**](docs/tool-reference.md#7-publint--package-export-validation) | Broken `package.json` exports | CI only |
| 8 | [**Commitlint**](docs/tool-reference.md#8-commitlint--commit-message-standards) | Non-conventional commit messages | Pre-commit |
| 9 | [**Vitest**](docs/tool-reference.md#9-vitest--related-test-execution) | Regressions in changed code | Pre-commit + CI |
| 10 | [**Turborepo**](docs/tool-reference.md#10-turborepo--cached-parallel-builds) | Slow rebuilds (cached parallel builds) | Build time |
| 11 | [**Import Ordering**](docs/tool-reference.md#11-import-ordering) | Inconsistent import order | Pre-commit |
| 12 | [**npm audit**](docs/tool-reference.md#12-security-scanning) | Vulnerable dependencies | CI only |
| 13 | [**Agent Instructions**](docs/tool-reference.md#13-agent-instructions-claudemd--cursorrules) | Agent lacks project context | Agent startup |

---

## Agent Support

| Agent | Instruction File | Auto-Discovered? |
|-------|-----------------|--------------------|
| **Claude Code** | `CLAUDE.md` | ✅ Yes |
| **Cursor** | `.cursorrules` | ✅ Yes |
| **GitHub Copilot / Codex** | `AGENTS.md` | ✅ Yes |
| **Gemini CLI** | `GEMINI.md` | ✅ Yes |

---

## Project Structure

```
agentic-guardrail-ts/
├── skills/                          ← Agent-readable instruction files
│   ├── setup-guardrails/SKILL.md    ← Main installation skill
│   ├── enforce-architecture/SKILL.md
│   ├── self-correcting-loop/SKILL.md
│   ├── adding-a-package/SKILL.md
│   └── writing-agent-instructions/SKILL.md
├── configs/                         ← Ready-to-copy config files
│   ├── eslint.config.js
│   ├── lefthook.yml
│   ├── tsconfig.base.json
│   └── ... (13 files)
├── agents/                          ← Agent instruction templates
│   ├── CLAUDE.md
│   ├── GEMINI.md
│   ├── AGENTS.md
│   └── .cursorrules
├── scripts/
│   ├── init.sh                      ← Manual (non-agentic) setup
│   ├── typecheck-staged.sh
│   └── publint-all.sh
├── docs/                            ← Deep-dive documentation
│   ├── getting-started.md
│   ├── tool-reference.md
│   ├── architecture-tiers.md
│   └── ... (8 files)
└── examples/
    ├── single-package/
    └── monorepo/
```

---

## Documentation

| Guide | Description |
|-------|-------------|
| [**Getting Started**](docs/getting-started.md) | Quick start for single-package projects |
| [**Monorepo Setup**](docs/monorepo-setup.md) | Full monorepo with workspaces |
| [**Tool Reference**](docs/tool-reference.md) | Deep dive on all 13 tools |
| [**Architecture Tiers**](docs/architecture-tiers.md) | How to design your dependency hierarchy |
| [**Self-Correcting Loop**](docs/self-correcting-loop.md) | How AI agents auto-fix their mistakes |
| [**CI Pipeline**](docs/ci-pipeline.md) | GitHub Actions configuration |
| [**Troubleshooting**](docs/troubleshooting.md) | Common issues and fixes |
| [**Adapting for pnpm/yarn**](docs/adapting-for-pnpm.md) | Package manager differences |

---

## Philosophy

- **Agent-first.** Skills are the primary interface — the agent reads instructions and implements them in your project.
- **Self-correcting > blocking.** The goal isn't to prevent mistakes — it's to catch and fix them in 3 seconds.
- **Two enforcement layers.** Pre-commit hooks (fast, staged files) + CI (full, safety net).
- **Convention > configuration.** Opinionated defaults that work out of the box.

---

## Contributing

1. Fork the repo
2. Create a branch
3. Make your changes
4. Ensure shell scripts pass `shellcheck` and JSON is valid
5. Test `init.sh` in a fresh temp directory
6. Submit a PR

See [CLAUDE.md](CLAUDE.md) for contributor guidelines.

---

## License

[MIT](LICENSE)
