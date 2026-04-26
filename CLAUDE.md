# CLAUDE.md — Contributing to agentic-guardrail-ts

Read [CONTRIBUTING.md](CONTRIBUTING.md) for all project guidelines.

## Critical Context

This repo is a **scaffolding tool** — it provides skills and configs that agents use
to set up guardrails in OTHER projects.

**DO NOT:**
- Copy files from `reference/` into this repo's root
- Create agent instruction templates (AGENTS.md, .cursorrules, etc.) in this repo
- Add `__ORG_SCOPE__` placeholders — skills detect the target project's actual scope

**DO:**
- Keep skills self-contained (all config content inline)
- Test changes by running `init.sh` in a fresh temp directory
- Ensure all shell scripts pass `shellcheck`
- Run `node scripts/docs-check.mjs` after doc changes
- Follow the paper-trail convention for any `eslint-disable` (see `enforce-architecture` skill)
- Check [docs/known-conflicts.md](docs/known-conflicts.md) when tools interact unexpectedly
