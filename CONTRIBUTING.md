# Contributing to agentic-guardrail-ts

## What this repo is

A scaffolding tool. It ships agent skills (also packaged as a Claude Code plugin) that set up guardrails in other TypeScript projects. It is not an npm library, and nothing here runs in the target project except what the skills install.

## Layout

```text
skills/<name>/SKILL.md   the product: instructions agents follow in a target project
templates/               the single source for every config the skills install
  shared/                every project (Oxlint, Prettier, lefthook, guardrails.mjs, ...)
  single/                single-package projects
  monorepo/              workspaces (turbo, syncpack, tier rules)
  agent/                 AGENTS.md, CLAUDE.md, Claude Code and Codex hooks
  ci/                    GitHub Actions workflow
test/fixtures/           small projects the templates are applied to
scripts/fixture-test.mjs end-to-end test of the templates against the fixtures
scripts/render.mjs       copies templates into the skills that embed them
scripts/docs-check.mjs   stale path check for docs and skills
docs/                    user docs; docs/decisions/ holds design decisions
```

## Rules

1. **Templates are the source.** Change a config in `templates/`, then run `node scripts/render.mjs` so every skill that embeds it is updated. Never edit an embedded block in a skill by hand.
2. **Skills stay self-contained.** A skill must work when fetched from its raw URL, so configs are embedded, not linked.
3. **Skills detect, they do not assume.** Read the target's package manager, scope, layout and existing configs. No placeholders like `__ORG_SCOPE__`.
4. **Never copy templates into this repo's root,** and do not add agent instruction files here for target projects.
5. **Every rule is an error.** No warn-only rules. Existing debt goes in the target's baseline.
6. **Disables leave a paper trail:** `// oxlint-disable-next-line <rule> -- <reason>, <tracking ref>`.
7. **Cross-tool interactions** go in [docs/known-conflicts.md](docs/known-conflicts.md).
8. **A change in direction** (engine, tool swap, default flip) gets a short record in `docs/decisions/`.
9. **Docs are short.** Relative links must resolve. Prose style: no em dashes, straight quotes, short sentences. Examples use invented names (`@acme/api`, `packages/billing`).

## Testing changes

```bash
node scripts/fixture-test.mjs                  # all fixtures
node scripts/fixture-test.mjs single-npm --keep  # one fixture, keep the temp dir
node scripts/render.mjs --check                # skills match templates
node scripts/docs-check.mjs                    # no stale paths in docs
claude plugin validate .                       # plugin and marketplace manifests
```

The fixture test needs npm, pnpm, Yarn 1 and gitleaks on your PATH. For each fixture it applies the templates, installs, and asserts:

- the clean project passes format, typecheck, tests and `guardrails.mjs check`
- seeded violations are reported with the expected `tool:rule|file` keys
- the ratchet works: `--init`, a refused second `--init`, new findings fail, `--strict-baseline` flags a stale baseline, `--tighten` fixes it
- the post-edit and stop hooks block and pass correctly, including Codex `apply_patch` payloads, deletions that break importers, and a broken tool config
- pre-commit checks the staged content even when the working tree differs, and commitlint rejects a bad message through lefthook

To add a fixture, create `test/fixtures/<name>/` with `base/`, `violations/` and `expected.json`. Copy the shape of an existing one.

Before a PR, also try the changed skill in a scratch project with a real agent.

## Commits

Conventional Commits: `type(scope): description`. Keep messages short.

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. Scopes: `skills`, `templates`, `scripts`, `docs`, `ci`.
