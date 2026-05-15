# Changelog

All notable changes to this project will be documented in this file.

## [2.2.0] - 2026-05-15

### Added
- **`enforce-code-discipline` skill** — companion skill to `setup-guardrails` that extends any TypeScript project with LLM discipline rules
  - Complexity & size limits (`max-lines: 300`, `max-lines-per-function: 40`, `max-params: 4`, `max-depth: 4`, `max-classes-per-file: 1`, `no-magic-numbers`, `no-nested-ternary`)
  - Code quality via `eslint-plugin-sonarjs` (cognitive complexity ≤15, duplicate string detection, identical function detection, collapsible-if, gratuitous expressions, redundant jumps, prefer-immediate-return)
  - Naming conventions via `@typescript-eslint/naming-convention` (camelCase variables/functions, PascalCase types, UPPER_CASE constants, UPPER_CASE enum members)
  - ESM idioms via `eslint-plugin-unicorn` (10 selective rules: filename-case, no-array-for-each, no-for-loop, explicit-length-check, no-useless-undefined, no-array-push-push, no-lonely-if, prefer-string-slice, no-process-exit, prefer-module)
  - Documentation coverage via `eslint-plugin-jsdoc` (wave-gated: starts at `warn`, flip to `error` in Wave 4)
  - Test coverage thresholds in Vitest (lines: 80%, branches: 75%, functions: 80%, statements: 80%)
  - Greenfield and retrofit modes with full wave-sequencing guide (Wave 1: auto-fixable, Wave 2: complexity & structural, Wave 3: naming & literals, Wave 4: documentation)
- Reference configs updated: `reference/single-package/eslint.config.js`, `reference/monorepo/eslint.config.js`, `reference/single-package/vitest.config.ts`
- Three new `devDependencies` in reference `package.json` files: `eslint-plugin-unicorn`, `eslint-plugin-sonarjs`, `eslint-plugin-jsdoc`

### Changed
- `skills/setup-guardrails/SKILL.md`: added `enforce-code-discipline` to Related Skills
- README skills table: added `enforce-code-discipline` row

## [2.1.0] - 2026-04-26

### Added
- `import-x/default` and `import-x/named` ESLint rules — catches stale default/named import mismatches that ESM rejects at runtime
- `@typescript-eslint/no-non-null-assertion` — prevents `!` operator that lies to the compiler about nullability
- `@typescript-eslint/consistent-type-assertions` with `objectLiteralTypeAssertions: 'never'` — prevents `{} as Foo` shortcuts
- `no-restricted-syntax` for `TSAsExpression > TSAsExpression` — catches double-cast anti-pattern (`as unknown as T`)
- **Retrofit mode** for `setup-guardrails` — detects brownfield codebases (Step 1e), warns users about expected violations, generates configs with conditional severity (warn/error), and includes a warning budget header for tracking progress
- **Wave Sequencing guide** — step-by-step instructions for driving each rule category to zero violations in existing codebases
- **Paper-trail convention** for `eslint-disable` comments — every escape hatch must include the specific rule, a reason, and a tracking reference (added to `enforce-architecture` skill)
- **`reference/tech-debt.md`** — template for the append-only tech-debt ledger pattern
- **`reference/retrofit-rollout.md`** — worked example with wave-by-wave walkthrough, timeline expectations, and common pitfalls
- **`docs/known-conflicts.md`** — catalog of cross-tool conflicts (Prettier × tables, Knip × dynamic registries, etc.) and their resolutions
- **`scripts/docs-check.mjs`** — brownfield-aware stale path reference detector with `--warn-only`, `--create-baseline`, and `--strict` modes
- Enriched `.prettierignore` template with `*.min.css`, `.turbo/`, and column-alignment guidance
- `docs-check` step added to framework CI (`.github/workflows/ci.yml`)
- "If Your Project Isn't Greenfield" section in Getting Started guide
- Warning-budget anti-pattern documentation in troubleshooting guide
- Expanded ESLint documentation in tool-reference.md (import correctness + custom anti-pattern tables)

### Changed
- `setup-guardrails` skill ESLint templates updated with all new rules (both single-package and monorepo)
- `enforce-architecture` skill: added "Escape Hatches and Paper Trails" section
- `self-correcting-loop` skill: updated false-positive guidance with paper-trail reference
- README: expanded tools table (14 tools), skills table (retrofit mode), documentation table, project structure, and philosophy section
- CONTRIBUTING: added paper-trail rule, docs-check testing step, known-conflicts reference
- Reference CI template: added optional docs-check step

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
