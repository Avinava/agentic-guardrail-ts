# Adapting for pnpm or Yarn

The default configuration uses npm. Here's what to change for pnpm or yarn.

---

## pnpm

### Workspace Configuration

Create `pnpm-workspace.yaml` at the root (instead of `"workspaces"` in `package.json`):

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

### Syncpack

Update `.syncpackrc.json`:

```json
{
  "versionGroups": [{
    "pinVersion": "workspace:*"
  }]
}
```

### CI Pipeline

```yaml
- uses: pnpm/action-setup@v4
  with:
    version: 9
- uses: actions/setup-node@v4
  with:
    node-version-file: '.nvmrc'
    cache: 'pnpm'
- run: pnpm install --frozen-lockfile
```

Replace `npm run` with `pnpm run` throughout CI.

### Install Command

```bash
pnpm add -D prettier lint-staged lefthook \
  @commitlint/cli @commitlint/config-conventional \
  eslint typescript-eslint eslint-plugin-boundaries eslint-config-prettier \
  knip syncpack publint vitest turbo typescript
```

### Bonus: Strict Mode

pnpm's strict dependency resolution prevents phantom dependencies — where a package accidentally imports something it doesn't declare in its own `package.json`. This is a **free guardrail** worth adopting.

---

## Yarn (v4+)

### Workspace Configuration

Same as npm — use `"workspaces"` in `package.json`:

```json
{
  "workspaces": ["packages/*", "apps/*"]
}
```

### Syncpack

Same as pnpm:

```json
{
  "versionGroups": [{
    "pinVersion": "workspace:*"
  }]
}
```

### CI Pipeline

```yaml
- uses: actions/setup-node@v4
  with:
    node-version-file: '.nvmrc'
    cache: 'yarn'
- run: yarn install --immutable
```

### Install Command

```bash
yarn add -D prettier lint-staged lefthook \
  @commitlint/cli @commitlint/config-conventional \
  eslint typescript-eslint eslint-plugin-boundaries eslint-config-prettier \
  knip syncpack publint vitest turbo typescript
```

### Plug'n'Play (PnP)

If using Yarn PnP, some tools may need special configuration. Create `.yarnrc.yml`:

```yaml
nodeLinker: pnp
```

Note: Some ESLint plugins may not work with PnP. If you encounter issues, switch to `nodeLinker: node-modules`.

---

## What Stays the Same

These files are **package-manager agnostic**:
- `.editorconfig`
- `.prettierrc` / `.prettierignore`
- `eslint.config.js`
- `tsconfig.base.json`
- `knip.json`
- `lefthook.yml`
- `commitlint.config.ts`
- `vitest.config.ts`
- `turbo.json`
- Agent instruction files (CLAUDE.md, .cursorrules, etc.)
