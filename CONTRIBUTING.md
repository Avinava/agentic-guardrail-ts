# Contributing to agentic-guardrail-ts

## What This Repo Is

A scaffolding tool for AI-assisted TypeScript development.
**NOT** an npm library — users point their agent at a skill URL or run `scripts/init.sh`.

## Repo Structure

```
skills/             ← Agent-readable instruction files (THE PRODUCT)
reference/          ← Complete working examples (for humans browsing)
scripts/            ← init.sh (scaffolding), helper scripts
docs/               ← Deep-dive documentation
```

## Key Concepts

- **Skills** are self-contained instruction files that AI agents read and execute in target projects
- **Reference examples** are for humans to browse — agents should generate configs, not copy these files
- `__ORG_SCOPE__` is NOT used — skills tell agents to detect the actual scope from the target project
- Configs are embedded inline in skills so they work via raw GitHub URLs

## Rules

1. Skills must be self-contained — no external fetches required
2. Skills must NEVER instruct agents to copy template files into target repos
3. Shell scripts must pass `shellcheck`
4. JSON must be valid (no trailing commas, no comments)
5. Documentation should cross-link using relative paths
6. Keep docs concise — this is reference material, not a novel
7. Every `eslint-disable` in reference configs must include a paper-trail comment (rule + reason + tracking reference)
8. Cross-tool interactions must be documented in [docs/known-conflicts.md](docs/known-conflicts.md)

## Testing Changes

1. Run `bash scripts/init.sh` in a fresh temp directory
2. Verify all config files are created with correct values
3. Verify `npm install` succeeds with the generated configs
4. Point an agent at a skill URL — verify it doesn't pollute the target repo
5. Run `node scripts/docs-check.mjs` to verify no stale path references in docs

## Commit Format

Conventional Commits: `type(scope): description`

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`
Scopes: `skills`, `reference`, `scripts`, `docs`, `ci`
