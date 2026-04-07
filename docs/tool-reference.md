# Tool Reference

Deep dive on each of the 13 guardrail tools: what they do, why they matter for AI agents, and how to configure them.

---

## Summary Table

| # | Tool | What It Catches | Layer | Speed |
|---|------|----------------|-------|-------|
| 1 | **Lefthook** | Orchestrates all tools | Pre-commit | ~3s parallel |
| 2 | **Prettier** | Formatting inconsistencies | Pre-commit | Instant (auto-fix) |
| 3 | **ESLint + Boundaries** | Architecture violations, `any` leaks, floating promises | Pre-commit + CI | ~2s |
| 4 | **TypeScript** | Type errors | Pre-commit + CI | ~3s (targeted) |
| 5 | **Knip** | Unused code, files, deps | Pre-commit + CI | ~2s |
| 6 | **Syncpack** | Version mismatches | Pre-commit + CI | ~1s |
| 7 | **Publint** | Broken package exports | CI only | ~1s |
| 8 | **Commitlint** | Bad commit messages | Pre-commit | Instant |
| 9 | **Vitest** | Regressions in changed code | Pre-commit + CI | ~2s (related) |
| 10 | **Turborepo** | Slow rebuilds | Build time | ~29ms cached |
| 11 | **Import Ordering** | Inconsistent imports | Pre-commit | ~1s |
| 12 | **Security Scanning** | Vulnerable dependencies | CI only | ~3s |
| 13 | **Agent Instructions** | Agent lacks project context | Agent startup | N/A |

---

## 1. Lefthook — Hook Orchestrator

**What:** Runs all validation tools in parallel before every commit. If any tool fails, the commit is rejected.

**Why for AI agents:** AI agents respect git hooks. Failed commits trigger self-correction.

**Key concepts:**
- `parallel: true` — All jobs run concurrently. Total time ≈ slowest job (~3s)
- `glob` — Job only runs if staged files match the pattern
- `{staged_files}` — Placeholder that expands to staged file list

**Why over Husky:** Lefthook is a Go binary with native parallel execution. Husky runs hooks sequentially via shell scripts. With 6+ parallel jobs, the difference is meaningful.

**Config:** See [configs/lefthook.yml](../configs/lefthook.yml)

---

## 2. Prettier + lint-staged — Formatting

**What:** Enforces consistent formatting. Runs via lint-staged to only format staged files.

**Why for AI agents:** AI models generate inconsistent formatting — different indentation, quote styles, trailing commas. Prettier normalizes everything.

**Interaction with ESLint:** Install `eslint-config-prettier` to disable ESLint formatting rules. Prettier is the sole formatter.

**Config:** See [configs/.prettierrc](../configs/.prettierrc) and [configs/.prettierignore](../configs/.prettierignore)

---

## 3. ESLint + Boundaries — Architecture Enforcement

**What:** Prevents packages from importing across architectural boundaries using a tiered dependency hierarchy. Also enforces TypeScript strict rules.

**Why for AI agents:** This is the **single most impactful guardrail**. AI agents have no understanding of your architecture. The boundaries plugin stops illegal imports with a clear error message.

**TypeScript rules included (via `strictTypeChecked`):**

| Rule | What It Catches |
|------|----------------|
| `no-floating-promises` | Forgetting to `await` a promise |
| `no-misused-promises` | Passing async where sync expected |
| `no-unsafe-assignment` | Assigning `any` to typed variable |
| `no-explicit-any` | Using `any` instead of proper types |

**Config:** See [configs/eslint.config.js](../configs/eslint.config.js)
**Guide:** See [Architecture Tiers](./architecture-tiers.md)

---

## 4. TypeScript Strict Mode

**What:** `tsc --noEmit` checks types without producing output. Pre-commit only typechecks packages with staged changes.

**Why for AI agents:** AI agents generate code with subtle type errors — wrong generics, missing properties, incompatible returns.

**Complements Knip:**

| Tool | Catches |
|------|---------|
| TypeScript | Unused *local* variables and parameters |
| Knip | Unused *exports*, *files*, and *dependencies* |

**Config:** See [configs/tsconfig.base.json](../configs/tsconfig.base.json)
**Script:** See [scripts/typecheck-staged.sh](../scripts/typecheck-staged.sh)

---

## 5. Knip — Dead Code Detection

**What:** Finds unused files, exports, dependencies, and unlisted dependencies across the entire project.

**Why for AI agents:** When AI agents refactor, they leave behind unused exports, unreferenced files, and orphan dependencies.

**Key options:**
- `ignoreDependencies` — Runtime-only deps not statically importable
- `ignoreExportsUsedInFile` — Don't flag exports used within their own file
- `exclude: ["enumMembers"]` — Don't flag individual enum values

**Config:** See [configs/knip.json](../configs/knip.json)

---

## 6. Syncpack — Dependency Version Consistency

**What:** Ensures all packages use the same version of shared dependencies.

**Why for AI agents:** Agents might use `^5.0.0` in one package and `^5.1.2` in another.

**Package manager adaption:**
- npm: `"pinVersion": "*"`
- pnpm/yarn: `"pinVersion": "workspace:*"`

**Config:** See [configs/.syncpackrc.json](../configs/.syncpackrc.json)

---

## 7. Publint — Package Export Validation

**What:** Validates that `exports`, `main`, and `types` fields point to files that actually exist.

**Why for AI agents:** Agents frequently modify exports or move files without updating the export map.

**CI only** — requires `dist/` from a build first.

**Script:** See [scripts/publint-all.sh](../scripts/publint-all.sh)

---

## 8. Commitlint — Commit Message Standards

**What:** Validates commit messages follow Conventional Commits format.

**Why for AI agents:** Without enforcement, agents produce inconsistent formats.

**Format:** `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
- Scopes: Your package names + `deps`, `ci`, `release`

**Config:** See [configs/commitlint.config.ts](../configs/commitlint.config.ts)

---

## 9. Vitest — Related Test Execution

**What:** Runs only tests that import changed files, not the full suite.

**Why for AI agents:** Fast feedback — seconds, not minutes.

**Coverage ratcheting:** `autoUpdate: true` means thresholds only go UP, never down.

**Config:** See [configs/vitest.config.ts](../configs/vitest.config.ts)

---

## 10. Turborepo — Cached Parallel Builds

**What:** Builds all packages in dependency order with caching. Second build: ~29ms vs ~14s cold.

**Why for AI agents:** Agents run `npm run build` frequently. Caching keeps feedback tight.

**Monorepo only.** Not needed for single-package projects.

**Config:** See [configs/turbo.json](../configs/turbo.json)

---

## 11. Import Ordering

**What:** Enforces consistent import order: builtins → external → internal → relative.

**Options:**
- **ESLint plugin** (`eslint-plugin-import-x`) — recommended
- **Prettier plugin** (`@trivago/prettier-plugin-sort-imports`) — alternative

Pick one, not both.

---

## 12. Security Scanning

**What:** `npm audit --audit-level=high` in CI catches known vulnerabilities.

**Automated updates:** Use Dependabot or Renovate for automatic dependency update PRs.

---

## 13. Agent Instructions (CLAUDE.md / .cursorrules)

**What:** Direct context for AI coding agents — commands, architecture rules, critical rules.

**Templates:** See [agents/](../agents/) for Claude, Cursor, Codex, and Gemini templates.

---

## DevDependencies Reference

All tools in one install command:

```bash
npm install -D \
  prettier lint-staged lefthook \
  @commitlint/cli @commitlint/config-conventional \
  eslint typescript-eslint eslint-plugin-boundaries eslint-config-prettier \
  knip syncpack publint \
  vitest turbo typescript
```
