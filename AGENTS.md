# AGENTS.md: contributing to agentic-guardrail-ts

This repo is a **scaffolding tool**. It ships agent skills (also packaged as a Claude Code plugin)
that install guardrails in OTHER TypeScript projects. Read [CONTRIBUTING.md](CONTRIBUTING.md) for
the full guidelines.

## Layout

- `templates/`: the single source of every config the skills install. Edit configs here.
- `skills/*/SKILL.md`: the product. Template blocks between `<!-- tmpl:... -->` and `<!-- /tmpl -->`
  are generated: never edit them by hand, run `node scripts/render.mjs`.
- `test/fixtures/`: target projects (single npm, pnpm monorepo, yarn 1 retrofit) that the
  templates are applied to and tested against.
- `scripts/`: `render.mjs`, `fixture-test.mjs`, `pack-harness.mjs`, `packs-*-test.mjs`, `docs-check.mjs`.
- `docs/decisions/`: why the stack is what it is. Update or add a decision when you change a tool.

## Rules

- Skills stay self-contained (they must work from a raw URL), which is why templates are rendered
  into them.
- Never add agent instruction files for this repo's users here; the `guardrails-loop` skill writes
  them into target projects from `templates/agent/`.
- No org-scope placeholders: skills detect the target's real scope. Examples use `@acme`.
- Every disable comment in a template needs a paper trail (rule, reason, tracking reference).
- Cross-tool interactions go in [docs/known-conflicts.md](docs/known-conflicts.md).
- Writing: no em dashes, straight quotes, short sentences. No real client, org, person or project
  names anywhere.

## Before you commit

```bash
node scripts/render.mjs --check
node scripts/docs-check.mjs
node --test scripts/packs-*-test.mjs      # opt-in tools against fake output; no installs
node scripts/fixture-test.mjs            # installs real packages; takes a few minutes
claude plugin validate .
```

Before any push, tag or release, run a privacy scan of the outgoing diff.
