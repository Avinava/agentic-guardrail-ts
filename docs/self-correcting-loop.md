# The Self-Correcting Loop

How AI agents automatically fix their own mistakes through automated guardrails.

## The Key Insight

AI coding agents like Claude Code, Cursor, and Codex **respect git hooks**. When a commit fails, the agent sees the error output, diagnoses the problem, fixes it, and retries. This creates a self-correcting loop — the agent essentially reviews its own work.

## How It Works

```
Agent generates code
    ↓
Agent runs: git commit -m "feat(auth): add login endpoint"
    ↓
Lefthook triggers pre-commit hooks (parallel, ~3s)
    ↓
┌─ Prettier auto-fixes formatting                           ✓
├─ Knip detects unused export in old file                    ✗
├─ Syncpack checks dependency versions                       ✓
├─ ESLint catches import from wrong tier                     ✗
├─ TypeScript finds type error                               ✗
└─ Vitest runs related tests                                 ✓
    ↓
Commit REJECTED — agent sees error output:
  "Unused export 'OldHelper' in packages/helpers/src/utils.ts"
  "Import @your-org/orchestrator not allowed from tier 2"
  "Type 'string' is not assignable to type 'number'"
    ↓
Agent fixes all three issues
    ↓
Agent retries commit → all hooks pass ✓
    ↓
PR opened → CI runs full pipeline
    ↓
All checks pass → ready for human review
```

## Why This Matters

Without automated enforcement, these issues accumulate silently. Code review catches some, but reviewers fatigue quickly when AI generates high volumes of changes.

The self-correcting loop means:
- **Instant feedback** — 3 seconds, not hours waiting for review
- **Learning by doing** — agents internalize project rules through repeated correction
- **Human review quality** — reviewers see clean code, focus on logic not style
- **No accumulation** — problems caught at commit time, not after 10 more changes

## Two Enforcement Layers

| Layer | When | What | Speed | Purpose |
|-------|------|------|-------|---------|
| **Pre-commit** | Every commit | Staged files only | ~3s | Instant feedback for agent self-correction |
| **CI Pipeline** | Every PR | Full project | ~3 min | Safety net for bypassed hooks (`--no-verify`) |

Pre-commit hooks run on *staged files only* for speed. CI runs *everything* for completeness.

## Agent Compatibility

| Agent | Respects Git Hooks? | Self-Corrects? |
|-------|-------------------|----------------|
| Claude Code | ✅ Yes | ✅ Yes — reads errors, fixes, retries |
| Cursor | ✅ Yes | ✅ Yes — shows errors in UI |
| GitHub Copilot CLI | ✅ Yes | ✅ Yes |
| Gemini CLI | ✅ Yes | ✅ Yes |
| Codex | ✅ Yes | ✅ Yes |

## Bypassing Hooks (When Needed)

For large refactors or migrations, you may need to temporarily skip hooks:

```bash
git commit --no-verify -m "chore: large migration"
```

CI will still catch everything. For individual developers, create a `lefthook-local.yml` (gitignored) with overrides.
