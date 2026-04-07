# Troubleshooting

Common issues and their solutions.

---

## Pre-Commit Hooks Not Running

**Symptom:** Commits go through without any checks.

**Fix:**
```bash
npx lefthook install
```

If that doesn't work, check that `.git/hooks/pre-commit` exists and is executable:
```bash
ls -la .git/hooks/pre-commit
```

---

## "Port 8081 already in use" / Lefthook Stale Processes

**Symptom:** Multiple Node.js processes from aborted hook runs.

**Fix:**
```bash
pkill -f "npx eslint"
pkill -f "npx vitest"
```

---

## ESLint "Cannot find module" for Boundaries Plugin

**Symptom:** `Error: Cannot find module 'eslint-plugin-boundaries'`

**Fix:** Install the dependency:
```bash
npm install -D eslint-plugin-boundaries
```

If using pnpm, ensure it's not hoisted incorrectly:
```bash
pnpm install -D eslint-plugin-boundaries
```

---

## TypeScript "Cannot find project reference"

**Symptom:** `error TS6053: File 'packages/some-pkg/tsconfig.json' not found`

**Fix:** Ensure the referenced package has a `tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

---

## Knip Reports False Positives

**Symptom:** Knip flags dependencies or exports that ARE used (just not statically importable).

**Fix:** Add to `knip.json`:
```json
{
  "workspaces": {
    "packages/my-pkg": {
      "ignoreDependencies": ["the-dynamic-dep"]
    }
  }
}
```

Common false positives:
- `pino-pretty` (loaded dynamically by pino)
- CSS-in-JS packages (`@emotion/react`, `styled-components`)
- Vite/webpack plugins referenced in config files
- PostCSS plugins

---

## Syncpack Version Mismatch with pnpm

**Symptom:** Syncpack complains about `workspace:*` vs `*`.

**Fix:** Update `.syncpackrc.json`:
```json
{
  "versionGroups": [{
    "pinVersion": "workspace:*"
  }]
}
```

---

## Commitlint Rejects Valid Scope

**Symptom:** `scope must be one of [shared-types, config, ...]`

**Fix:** Add the new scope to `commitlint.config.ts`:
```ts
'scope-enum': [2, 'always', [
  'shared-types', 'config', 'your-new-package',
  'deps', 'ci', 'release',
]]
```

---

## Prettier and ESLint Conflict

**Symptom:** ESLint auto-fix changes formatting that Prettier then changes back.

**Fix:** Ensure `eslint-config-prettier` is the LAST item in your ESLint config:
```js
export default tseslint.config(
  ...otherConfigs,
  eslintConfigPrettier,  // ← must be last
);
```

---

## CI Fails But Local Passes

**Symptom:** All hooks pass locally, CI fails.

**Possible causes:**
1. **Different Node.js version** — Check `.nvmrc` matches CI
2. **Missing lockfile** — Run `npm install` and commit `package-lock.json`
3. **Publint needs build** — CI runs publint after build; locally you may have stale `dist/`
4. **Cache pollution** — Delete `.turbo/` and `node_modules/`, reinstall

---

## Bypassing Hooks Temporarily

For large migrations or generated code:

```bash
# Skip all hooks for one commit
git commit --no-verify -m "chore: large migration"

# Or create lefthook-local.yml (gitignored) for persistent overrides
```

CI will still catch everything. Use `--no-verify` sparingly.

---

## AI Agent Ignores CLAUDE.md / .cursorrules

**Symptom:** Agent doesn't follow the rules in your instruction file.

**Possible causes:**
1. File not in project root
2. File not named correctly (`CLAUDE.md` for Claude Code, `.cursorrules` for Cursor)
3. Agent session started before file was created — restart the session
4. File is too long — keep critical rules at the top

**Tip:** The automated hooks enforce rules regardless. The instruction file is guidance; the hooks are enforcement.
