# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2025-04-08

### Breaking Changes
- Removed `agents/` directory — agent instruction templates no longer shipped
- Removed `configs/` directory — replaced by `reference/` with complete working examples
- Removed `examples/` directory — merged into `reference/`
- Removed `writing-agent-instructions` skill
- Renamed default branch from `master` to `main` (fixes all raw GitHub URLs)

### Changed
- `setup-guardrails` skill is now fully self-contained — all config content embedded inline
- Skills generate configs based on actual project analysis, not placeholder templates
- `init.sh` simplified — no longer copies agent instruction files
- Skills no longer use `__ORG_SCOPE__` placeholders — detect actual scope from target project

### Added
- `CONTRIBUTING.md` — consolidated contributor guide
- `reference/single-package/` — complete working single-package example
- `reference/monorepo/` — complete working monorepo example
- `reference/ci/ci.yml` — CI workflow template
- CI validates shell scripts (shellcheck), JSON, and stale references

### Removed
- `agents/CLAUDE.md`, `agents/GEMINI.md`, `agents/AGENTS.md`, `agents/.cursorrules`
- `skills/writing-agent-instructions/` skill
- Agent choice prompt in `init.sh`

## [1.0.0] - 2025-04-06

### Added
- Initial release
- 13 guardrail tool configurations
- `scripts/init.sh` — one-command project scaffolding
- Multi-agent instruction templates (Claude Code, Cursor, Codex, Gemini)
- Single-package and monorepo examples
- Comprehensive documentation
- GitHub Actions CI template
