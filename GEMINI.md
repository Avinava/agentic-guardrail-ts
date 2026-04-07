# GEMINI.md — Instructions for contributing to agentic-guardrail-ts
# This file is read by Gemini CLI when working on THIS repo.

## What This Repo Is
A configuration scaffolding tool for AI-assisted TypeScript development.
NOT an npm library — users clone/curl this repo and run `scripts/init.sh`.

## Structure
- `configs/` — Ready-to-copy config files with `__ORG_SCOPE__` placeholders
- `scripts/` — init.sh (scaffolding), typecheck-staged.sh, publint-all.sh
- `agents/` — Instruction file templates for Claude, Cursor, Codex, Gemini
- `docs/` — Documentation (getting-started, monorepo-setup, tool-reference, etc.)
- `examples/` — Working examples (single-package, monorepo)

## Rules
- Config files in `configs/` use `__ORG_SCOPE__` as placeholder — `init.sh` replaces it
- All shell scripts must pass `shellcheck`
- All JSON must be valid (no trailing commas, no comments)
- Documentation should cross-link using relative paths
- Keep docs concise — this is reference material, not a novel

## Testing Changes
1. Run `bash scripts/init.sh` in a fresh temp directory
2. Verify all config files are created with correct substitutions
3. Verify `npm install` succeeds with the generated configs
