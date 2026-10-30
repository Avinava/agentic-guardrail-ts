---
name: setup-guardrails
description: >
  Audit a TypeScript project and install tool-enforced guardrails for coding agents:
  Oxlint (type-aware), TypeScript 7 typecheck, dependency-cruiser architecture rules,
  Knip dead code, Vitest coverage floors, lefthook git hooks, gitleaks, commitlint, CI,
  and agent hooks that lint every edit. Existing debt is recorded in a ratchet baseline
  so only new problems block. Use for "set up guardrails", "add linting/hooks for agents",
  "harden this repo for AI coding", or upgrading a v2 guardrail setup.
---

# Setup guardrails

You are installing a guardrail stack in **the user's project** (the target), not in this
skill's repo. Every config below is a template: fit it to the target, then write it.

## What gets installed

| Concern | Tool | Runs in |
| --- | --- | --- |
| Lint, including type-aware rules | Oxlint + oxlint-tsgolint | edit hook, stop hook, pre-commit, pre-push, CI |
| Typecheck | `tsc` from TypeScript 7 (`@typescript/native`) | stop hook, pre-push, CI |
| Architecture (layers or tiers, cycles) | dependency-cruiser | stop hook, pre-commit, pre-push, CI |
| Dead code and unused dependencies | Knip | pre-push, CI |
| Bare `eslint-disable` / `oxlint-disable` | `scripts/guardrails.mjs` | everywhere |
| Formatting | Prettier | pre-commit, CI |
| Tests and coverage floors | Vitest 5 | stop hook (related tests), pre-push, CI |
| Secrets | gitleaks | pre-commit, CI |
| Commit messages | commitlint | commit-msg, CI |
| Dependency versions (monorepo) | syncpack | pre-push, CI |
| Task orchestration (monorepo) | turbo | typecheck, build |
| Agent instructions and hooks | AGENTS.md, Claude Code and Codex hooks | every agent session |

Everything runs through one generated script, `scripts/guardrails.mjs`. It works the same under
npm, pnpm, yarn and bun, and it owns the **ratchet**: every finding is an error, existing ones are
counted per rule and per file in `guardrails.baseline.json`, and a gate fails only when a count
goes up.

## Skill map

| Goal | Skill |
| --- | --- |
| Install or upgrade the stack | `setup-guardrails` (this one) |
| AGENTS.md, agent hooks, handling a rejected change | `guardrails-loop` |
| Layer and tier rules, fixing an architecture violation | `enforce-architecture` |
| Add a workspace package to a monorepo | `adding-a-package` |
| Check an installed stack for drift, stale versions or a loose baseline | `guardrails-doctor` |

If the other skills aren't installed (you got this file from a URL), download each one the same way
from `https://raw.githubusercontent.com/Avinava/agentic-guardrail-ts/main/skills/<name>/SKILL.md`
and read it in full. Don't use a summarizing web-fetch tool: the templates must be copied exactly.

## Prerequisites

- Node.js 22.12 or newer (24 recommended), git initialised, a `package.json`.
- `gitleaks` on PATH for the pre-commit secret scan (`brew install gitleaks`, or a release binary).
  If the user can't install it, tell them the `secrets` hook job will fail until they do. Do not
  remove the job.

---

## Phase 1: Detect

Read; don't change anything yet. Record each answer for the gap report.

1. **Layout.** It's a **monorepo** if there is a `workspaces` field, a `pnpm-workspace.yaml`, or
   `packages/` or `apps/` with their own `package.json`. Otherwise it's a **single package**. List the
   workspace directories.
2. **Package manager.** Check the lockfile: `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn (run
   `yarn -v`: 1.x is classic, otherwise berry), `bun.lock` or `bun.lockb` → bun, anything else → npm.
   - Never switch package managers or create a second lockfile.
   - Record whether `packageManager` is set in the root `package.json`. turbo 2.11 refuses to run
     without it.
3. **Existing tooling.** Look for:
   - `eslint.config.*` or `.eslintrc*`, and list its plugins
   - `biome.json`, `.oxlintrc.json`, `.prettierrc*`
   - husky (`.husky/`) or lint-staged config
   - `lefthook.yml`, jest config, `vitest.config.*`
   - `tsconfig*.json` and its `strict` setting
   - CI workflows under `.github/workflows/`
   - An existing v2 install from this repo: `eslint-plugin-boundaries` plus `lefthook.yml` with a
     `lint-deps` job. If found, follow [Migrating from v2](https://github.com/Avinava/agentic-guardrail-ts/blob/main/docs/migrating-from-v2.md) as you
     apply.
4. **Frameworks.** Check the dependencies:
   - React or Next.js: add Oxlint plugins `react`, `jsx-a11y`, `nextjs`, and set `filename-case`
     to allow PascalCase components.
   - Vue: `vue`.
   - Decorator DI (`@nestjs/*`, `inversify`, `tsyringe`, `@angular/core`): set `max-params` to off
     (see Wave 2).
5. **Conventions.**
   - The dominant file-name case in `src/`: kebab, camel or Pascal.
   - The source directories that act as layers, e.g. `domain/`, `application/`, `infrastructure/`,
     `ui/`.
   - Whether code uses `enum`, `namespace` or parameter properties. `erasableSyntaxOnly` rejects
     them, so leave the flag out if they are present.
6. **Mode.**
   - It's **greenfield** if there is little or no code, or a quick look finds nothing a strict setup
     would flag.
   - Otherwise it's **retrofit**: don't try to make an existing codebase clean in one go. The
     baseline records the debt, and later waves burn it down. See
     [Retrofit](https://github.com/Avinava/agentic-guardrail-ts/blob/main/docs/retrofit.md).

## Phase 2: Gap report and checkpoint

Present this, then wait for the user's answer:

```
GUARDRAILS PLAN
Layout:          single package | monorepo (<n> workspaces)
Package manager: <pm> <version>   packageManager field: present | will add
Mode:            greenfield | retrofit
Replacing:       <ESLint/typescript-eslint, husky, lint-staged, jest... or "nothing">
Keeping:         <tools the project keeps, e.g. ESLint for <plugin> (hybrid)>

FILES  create: <list>   merge: <list>   unchanged: <list>
DEPS   add: <list>   remove (only with your OK): <list>
ARCHITECTURE  <proposed layers or tiers, lowest first>
RULE CHOICES  filename case: <case>; max-params: 4 | off (DI); plugins: <list>
AGENT FILES   AGENTS.md (create | append managed block), CLAUDE.md, .claude/settings.json, .codex/hooks.json

Reply YES to apply, or name items to change or skip.
```

Ask separately only when you can't infer the answer:
- **Tiers or layers.** Propose them from the import graph. In a monorepo, a package with no
  workspace dependencies is tier 0.
- **Removing an existing linter or hook tool.** Always ask before you remove one.

## Phase 3: Apply in waves

Apply the waves in order. After each wave, run its check before moving on. Merge into existing
files instead of overwriting them:
- **JSON:** add missing keys and keep the user's values.
- **YAML:** add missing jobs.
- **Ignore files:** append missing lines.
- **Fully managed files** (`scripts/guardrails.mjs`, the AGENTS.md managed block): replace them as
  a whole.

### Wave 1: Foundation

- Write `.editorconfig`, `.nvmrc`, `.prettierrc.json`, `.prettierignore`, and merge the
  `.gitignore` lines. Don't add a `.prettierrc.json` if an equivalent Prettier config exists.
- Merge `package.json`: `type`, `engines`, the `scripts`, and the `devDependencies` from the
  template for this layout.
  - **TypeScript aliases.** Keep both alias entries exactly: `typescript` points to
    `@typescript/typescript6` (the API that tools like dependency-cruiser load) and
    `@typescript/native` points to TypeScript 7 (the `tsc` binary).
  - **`vite`.** List it explicitly. Vitest 5 has it as a peer, and Yarn 1 does not install peers.
  - **`packageManager`.** Set it to the detected manager and version if it's missing.
  - **Removals.** Remove replaced tools' dependencies only if the user agreed. When removing husky,
    also run `git config --unset core.hooksPath`, or lefthook's hooks never run.
  - **Yarn berry:** set `nodeLinker: node-modules` in `.yarnrc.yml`. `guardrails.mjs` runs tools
    from `node_modules/.bin`, which Plug'n'Play doesn't create.
- Write the tsconfig:
  - **Single package:** `tsconfig.json` (typecheck: `src`, `test`, root `*.config.ts`) plus
    `tsconfig.build.json` (emit).
  - **Monorepo:** `tsconfig.base.json`, a root `tsconfig.json` for root config files, and one
    `tsconfig.json` per workspace that extends the base (see `adding-a-package`).
  - **Merging into an existing tsconfig:** keep `paths`, `jsx` and `lib` additions. Drop `baseUrl`
    (deprecated in TS 6 and removed in 7) by rewriting `paths` relative to the tsconfig.
- **Monorepo:** each workspace's `package.json` exports a `source` condition pointing to
  `src/index.ts`. TypeScript (`customConditions`), Vitest and dependency-cruiser then resolve
  sibling packages to source, so typecheck and tests need no build first. Workspace dependencies
  use the protocol the package manager supports:
  - `workspace:*` for pnpm, yarn berry and bun.
  - `*` for npm and yarn 1. Change `pinVersion` in `.syncpackrc.json` to match.
- Write `scripts/guardrails.mjs` (every later wave runs it), `lefthook.yml` and
  `commitlint.config.mjs`. Writing `lefthook.yml` now means the `prepare` script installs the real
  hooks instead of a sample config.
- Install dependencies with the detected package manager.
- **Check:** run `typecheck`. In retrofit mode, every flag the code doesn't satisfy yet can wait:
  1. Leave `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature` and
     `exactOptionalPropertyTypes` out for now.
  2. Add each one back later in its own wave. **Typecheck must pass. It is never baselined.**
  3. If the code fails `strict` itself, stop and report to the user. Don't weaken `strict`.

### Wave 2: Lint

- Write `.oxlintrc.json` and tailor it:
  - **`unicorn/filename-case`:** the detected case. Use `{ "cases": { "kebabCase": true,
    "pascalCase": true } }` when React components are PascalCase.
  - **`eslint/max-params`:** `"off"` when decorator DI was detected. Oxlint counts constructor
    parameters and has no exemption. `.oxlintrc.json` accepts comments, so add a `// why`
    comment next to it.
  - **`plugins`:** add the framework plugins found in Phase 1.
- **Replacing ESLint** (with the user's OK): delete the ESLint config and its dependencies. Rename
  `// eslint-disable` comments to `// oxlint-disable` with the same rule names. Oxlint honours both
  spellings, so this can wait.
- **Hybrid** (the project needs an ESLint plugin Oxlint lacks, e.g. a framework or custom local
  rule):
  1. Keep ESLint 10 with only those plugins and no type-aware parsing.
  2. Add `eslint-plugin-oxlint` last in the config to turn off overlapping rules.
  3. Set `"lint": "node scripts/guardrails.mjs check && eslint ."`.
- **Check:** `node scripts/guardrails.mjs check`. In greenfield mode, fix everything it reports. In
  retrofit mode, look at the counts and wait for Wave 6. Ignore `knip` findings until Wave 4
  writes `knip.json`.

### Wave 3: Architecture

- Write `.dependency-cruiser.mjs` for the layout. Replace the `LAYERS` (single package) or `TIERS`
  (monorepo) arrays with the structure the user confirmed, lowest first.
- **Check:** `node scripts/guardrails.mjs check` lists `depcruise` findings. Read every one:
  - **A real upward import** is debt (retrofit) or must be fixed (greenfield).
  - **A false positive** means the layers are wrong. Fix the array, not the code.

### Wave 4: Dead code and dependency hygiene

- Write `knip.json` for the layout. Set `entry` to the real entry points (`src/index.ts`, `src/main.ts`, framework
  entry files; Knip's plugins detect Next.js, Vite and others automatically).
- **Monorepo:** write `turbo.json` and `.syncpackrc.json`. Run `syncpack lint` and fix version
  mismatches with `syncpack fix`.
- **Check:** look for false positives in Knip's findings:
  - Fix the config (`entry`, `ignoreDependencies`, `ignoreBinaries`).
  - Don't delete code you don't understand. Leave it in the baseline.

### Wave 5: Tests

- **No test runner yet:** write `vitest.config.ts`.
- **Jest exists:** ask before migrating. If kept, point the `test` and `test:coverage` scripts at
  Jest and skip the Vitest coverage ratchet.
- Coverage thresholds:
  - **Greenfield:** keep 80 / 75 / 80 / 80.
  - **Retrofit:** run `test:coverage` once, then set each threshold to the measured value rounded
    down. Floors only go up from here.
- **Check:** `test` and `test:coverage` pass.

### Wave 6: Gates

- Confirm the git hooks are installed: `node scripts/guardrails.mjs exec lefthook install`.
- Write `.github/workflows/ci.yml`. Edit the package manager lines, which are marked in comments:
  - **pnpm, npm, yarn 1:** as marked.
  - **yarn berry:** `yarn install --immutable`.
  - **bun:** replace the pnpm setup step with `oven-sh/setup-bun` (pin it by SHA), drop the
    setup-node cache, and use `bun install --frozen-lockfile`.
  For GitLab or other CI, translate it: the gate is `node scripts/guardrails.mjs verify` plus
  `check --strict-baseline`.
- **Baseline:**
  - **Greenfield:** fix findings until `node scripts/guardrails.mjs check` is clean. Don't create a
    baseline.
  - **Retrofit:** after the user approves recording the current debt, run
    `node scripts/guardrails.mjs baseline --init`. Show the per-rule totals:
    `node -e "const c=require('./guardrails.baseline.json').counts;const t={};for(const[k,n]of Object.entries(c)){const r=k.split('|')[0];t[r]=(t[r]||0)+n}console.table(t)"`
- **Check:** `node scripts/guardrails.mjs verify` passes.

### Wave 7: Agent loop

Follow the `guardrails-loop` skill, Part A. It writes `AGENTS.md`, `CLAUDE.md`,
`.claude/settings.json` and `.codex/hooks.json`, and verifies the hooks.

## Phase 4: Verify and report

Run each check and report what actually happened:

1. `node scripts/guardrails.mjs verify` exits 0.
2. Make a scratch file in a source directory with a function that takes 6 parameters and has an un-awaited
   promise. Then:
   - `node scripts/guardrails.mjs check --changed` fails and names both rules.
   - Delete the file.
3. `echo "bad message" | node scripts/guardrails.mjs exec commitlint` exits non-zero.
4. `node scripts/guardrails.mjs check --strict-baseline` passes.

Then summarise:
- the files written and the dependencies added or removed
- the mode, and in retrofit mode the baseline totals per rule
- the coverage floors
- the follow-ups the user owns: install gitleaks, trust the Codex hooks with `/hooks`, review
  the tiers
- the next debt waves (see below)

## Retrofit: burning down the baseline

- **Pick one rule per wave**, highest count first among the ones that are cheap to fix:
  1. Auto-fixable ones: `node scripts/guardrails.mjs exec oxlint --type-aware --fix`. Review the
     diff.
  2. Type safety: `no-unsafe-*`, `no-non-null-assertion`.
  3. Size and complexity.
  4. Architecture.
- **After each wave**, run `baseline --tighten` and commit the new baseline with the fix.
- **Strict tsconfig flags held back in Wave 1** each get their own wave.
- **Don't raise a limit** to make a count go away. If a rule doesn't fit, change it with the user.

---

## Templates

These are the canonical files. They are rendered from the agentic-guardrail-ts repo's
`templates/` directory and tested end to end there. Fit them to the target as described above.

### Shared (both layouts)

<!-- tmpl:templates/shared/scripts/guardrails.mjs -->
```js
#!/usr/bin/env node
// guardrails.mjs: one entry point for the gate, the ratchet and agent hooks.
// Generated by agentic-guardrail-ts. Edit the rule configs, not this file.
//
//   node scripts/guardrails.mjs check [--changed | --files a.ts b.ts] [--strict-baseline]
//   node scripts/guardrails.mjs baseline (--init | --tighten | --reset)
//   node scripts/guardrails.mjs verify
//   node scripts/guardrails.mjs format --files a.ts b.ts
//   node scripts/guardrails.mjs exec <bin> [args...]
//   node scripts/guardrails.mjs packs                      detected stacks and enabled tools
//   node scripts/guardrails.mjs hook (post-edit | stop)   reads hook JSON on stdin
//
// The engine is language-agnostic. Every tool comes from a pack declared in guardrails-packs.mjs
// (see docs/packs.md for the contract). A tool is just an external command: the engine runs it,
// checks the exit code, parses the output into findings and keys them `tool:rule|file`. A tool
// switches on when its config file exists, so a pack you did not set up costs nothing.

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { PACKS } from './guardrails-packs.mjs';

const ROOT = gitRoot() ?? process.cwd();
const BASELINE = join(ROOT, 'guardrails.baseline.json');
const LINT_EXT = /\.(?:[cm]?[jt]sx?)$/;
const MAX_REASON = 6000;
// Metric values are rounded to 2 decimals; this absorbs float noise when comparing.
const EPSILON = 0.005;

function gitRoot() {
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 ? realpathSync(r.stdout.trim()) : null;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    // node_modules/.bin shims and package managers are .cmd files on Windows.
    shell: process.platform === 'win32',
    maxBuffer: 256 * 1024 * 1024,
    ...opts,
  });
  if (r.error?.code === 'ENOENT') throw new Error(`${cmd} is not installed or not on PATH.`);
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  return r;
}

function bin(name) {
  const p = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? `${name}.cmd` : name);
  return existsSync(p) ? p : null;
}

function needBin(name) {
  const p = bin(name);
  if (!p) throw new Error(`${name} is not installed. Install devDependencies first.`);
  return p;
}

function packageManager() {
  const locks = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
  ];
  return locks.find(([f]) => existsSync(join(ROOT, f)))?.[1] ?? 'npm';
}

// Repos without Node (Python, Mule, Rust, ...) have no package.json: that is fine.
function pkg() {
  const file = join(ROOT, 'package.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
}

function sourceDirs() {
  const configured = pkg().guardrails?.src;
  if (Array.isArray(configured)) return configured;
  return ['src', 'packages', 'apps', 'libs'].filter((d) => existsSync(join(ROOT, d)));
}

// Resolve symlinks (e.g. /var -> /private/var on macOS) so hook paths match the git root.
function rel(file) {
  const abs = isAbsolute(file) ? file : join(ROOT, file);
  return relative(ROOT, existsSync(abs) ? realpathSync(abs) : abs)
    .split('\\')
    .join('/');
}

// NUL-separated so paths git would quote (spaces, non-ASCII) come through verbatim.
function gitFiles(args) {
  return run('git', [...args, '-z'])
    .stdout.split('\0')
    .filter(Boolean);
}

function finding(tool, rule, { file, line = 0, message }) {
  return { key: `${tool}:${rule}|${file}`, tool, rule, file, line, message };
}

// A tool that crashed prints no JSON; fail loudly instead of reporting "clean".
function toolJson(tool, r, text = r.stdout) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `${tool} failed (exit ${r.status}):\n${(r.stderr || r.stdout).trim().slice(-2000)}`,
    );
  }
}

// ── Packs: which tools are on, and which files they cover ──

function matchesOptIn(o) {
  if (typeof o === 'string') return existsSync(join(ROOT, o));
  const file = join(ROOT, o.file);
  return existsSync(file) && o.has.test(readFileSync(file, 'utf8'));
}

let active = null;

// A tool is on when any of its optIn entries matches: a config file that exists (a string), or
// exists and matches a pattern ({ file, has }). optIn === null means always on (no pack uses it).
function activeTools() {
  active ??= PACKS.flatMap((p) => p.tools.map((t) => ({ ...t, pack: p.id }))).filter(
    (t) => t.optIn === null || t.optIn.some(matchesOptIn),
  );
  return active;
}

// File types the gate tracks: JS/TS always, plus whatever the active tools declare.
function trackedExt() {
  const parts = [LINT_EXT, ...activeTools().flatMap((t) => [t.exts, t.track])].filter(Boolean);
  return new RegExp(parts.map((r) => `(?:${r.source})`).join('|'));
}

function sourcePaths(files, ext = trackedExt()) {
  return [...new Set(files.map(rel))].filter(
    (f) => ext.test(f) && !f.startsWith('..') && !f.includes('node_modules/'),
  );
}

// JS/TS files that exist (the Oxlint, dependency-cruiser and disable-check scope).
function lintable(files) {
  return sourcePaths(files, LINT_EXT).filter((f) => existsSync(join(ROOT, f)));
}

// Every tracked file that exists: the scope of a scoped run across all tools.
function scopedFiles(files) {
  return sourcePaths(files).filter((f) => existsSync(join(ROOT, f)));
}

// All tracked and untracked files a tool covers, for tools that take no project root.
function projectFiles(ext = LINT_EXT) {
  const untracked = gitFiles(['ls-files', '--others', '--exclude-standard']);
  return sourcePaths([...gitFiles(['ls-files']), ...untracked], ext).filter((f) =>
    existsSync(join(ROOT, f)),
  );
}

// Changed source paths since HEAD, including deleted ones.
function changedPaths() {
  const diff = gitFiles(['diff', '--name-only', 'HEAD']);
  return sourcePaths([...diff, ...gitFiles(['ls-files', '--others', '--exclude-standard'])]);
}

function changedFiles() {
  return scopedFiles(changedPaths());
}

const HELPERS = {
  ROOT,
  active: (id) => activeTools().some((t) => t.id === id),
  exists: (p) => existsSync(isAbsolute(p) ? p : join(ROOT, p)),
  read: (p) => readFileSync(isAbsolute(p) ? p : join(ROOT, p), 'utf8'),
  run,
  bin,
  needBin,
  rel,
  finding,
  toolJson,
  gitFiles,
  sourceDirs,
  projectFiles,
  lintable,
};

// Runs one tool and returns its findings. `files` is null for a whole-project run.
function runTool(tool, files) {
  const dir = mkdtempSync(join(tmpdir(), 'guardrails-tool-'));
  const ctx = {
    files,
    h: HELPERS,
    online: process.env.GUARDRAILS_ONLINE === '1',
    tmp: (name) => join(dir, name),
  };
  try {
    return toFindings(tool, runRaw(tool, files, ctx));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Tools return plain { rule, file, line, message }; the engine adds the tool id and the key.
function toFindings(tool, list) {
  return list.map((f) =>
    finding(tool.id, f.rule, { file: rel(f.file), line: f.line, message: f.message }),
  );
}

function runRaw(tool, files, ctx) {
  if (tool.scan) return tool.scan(ctx);
  // perFile tools take one file per command (docker compose config, for example).
  const each = (files ?? projectFiles(tool.exts)).map((f) => ({ ...ctx, files: [f] }));
  const jobs = tool.perFile ? each : [ctx];
  return jobs.flatMap((job) => {
    const spec = tool.run(job);
    if (!spec) return [];
    const r = run(spec.cmd, spec.args, spec.opts);
    const failed = (why) => {
      const text = (r.stderr || r.stdout).trim().slice(-2000);
      throw new Error(`${tool.id} ${why} (exit ${r.status}):\n${text}`);
    };
    if (!(tool.ok ?? [0, 1]).includes(r.status)) failed('failed');
    const out = tool.parse({ stdout: r.stdout, stderr: r.stderr, status: r.status }, job);
    // A failing exit with nothing parsed means the output format changed. Never read that as clean.
    if (r.status !== 0 && out.length === 0 && !(tool.quiet ?? []).includes(r.status)) {
      failed('failed with output it could not read');
    }
    return out;
  });
}

// stage: 'edit' (post-edit hook), 'commit' (pre-commit, --files, --changed, stop hook). A full
// run (files === null) is the 'push' stage: pre-push and CI.
function collect(files, stage = 'commit') {
  const all = files ? scopedFiles(files) : null;
  const found = [];
  for (const tool of activeTools()) {
    if (tool.metric || !tool.stages.includes(all ? stage : 'push')) continue;
    const own = all ? all.filter((f) => !tool.exts || tool.exts.test(f)) : null;
    // A whole-project tool still skips a scoped run that touches none of its file types.
    if (own && own.length === 0 && (tool.exts || !tool.whole)) continue;
    found.push(...runTool(tool, tool.whole ? null : own));
  }
  return found;
}

// ── Metrics: ratchets on a number, not on per-file counts (docs/packs.md#metric-ratchets) ──

function measureMetrics() {
  return activeTools()
    .filter((t) => t.metric && t.stages.includes('push'))
    .map((t) => {
      const dir = mkdtempSync(join(tmpdir(), 'guardrails-metric-'));
      const ctx = { files: null, h: HELPERS, online: false, tmp: (name) => join(dir, name) };
      try {
        // A measure returns null when it does not apply here (a Dart package that is not Flutter).
        const result = t.measure(ctx);
        if (!result) return null;
        const { value, detail = [] } = result;
        return { ...t.metric, value: Math.round(value * 100) / 100, detail };
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    })
    .filter(Boolean);
}

// Returns the problems to print. `recorded` is null when the metric was never baselined; only
// `baseline --tighten`, --init or --reset records it.
function compareMetric(m, recorded, strict) {
  if (recorded === null) {
    return strict
      ? [`${m.name} is not recorded. Run: node scripts/guardrails.mjs baseline --tighten`]
      : [];
  }
  const worse =
    m.direction === 'down' ? m.value > recorded + EPSILON : m.value < recorded - EPSILON;
  const better =
    m.direction === 'down' ? m.value < recorded - EPSILON : m.value > recorded + EPSILON;
  const detail = m.detail.length > 0 ? `\n  ${m.detail.join('\n  ')}` : '';
  if (worse) {
    const word = m.direction === 'down' ? 'above' : 'below';
    return [
      `${m.name} ${m.value}${m.unit} is ${word} the baseline ${recorded}${m.unit}. ${m.advice}${detail}\n${NEXT}`,
    ];
  }
  if (strict && better) {
    return [
      `${m.name} improved to ${m.value}${m.unit} (baseline ${recorded}${m.unit}). Run: node scripts/guardrails.mjs baseline --tighten`,
    ];
  }
  return [];
}

// ── Ratchet ──

function readBaselineFile() {
  return existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
}

function readBaseline() {
  return readBaselineFile().counts ?? {};
}

function readMetrics() {
  return readBaselineFile().metrics ?? {};
}

function writeBaseline(counts, metrics = {}) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  const sorted = Object.fromEntries(entries.toSorted(([a], [b]) => a.localeCompare(b)));
  const body = { version: 1, counts: sorted };
  if (Object.keys(metrics).length > 0) body.metrics = metrics;
  writeFileSync(BASELINE, `${JSON.stringify(body, null, 2)}\n`);
  return Object.keys(sorted).length;
}

function tally(findings) {
  const counts = {};
  for (const f of findings) counts[f.key] = (counts[f.key] ?? 0) + 1;
  return counts;
}

function compare(findings, baseline, scope) {
  const counts = tally(findings);
  const inScope = (key) => !scope || scope.has(key.slice(key.indexOf('|') + 1));
  const grown = new Set(
    Object.keys(counts).filter((k) => inScope(k) && counts[k] > (baseline[k] ?? 0)),
  );
  const fresh = findings.filter((f) => grown.has(f.key));
  const stale = scope ? [] : Object.keys(baseline).filter((k) => (counts[k] ?? 0) < baseline[k]);
  return { fresh, stale, counts };
}

function format(findings) {
  return findings
    .toSorted((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    .map((f) => `  ${f.file}:${f.line}  ${f.tool} ${f.rule}  ${f.message}`)
    .join('\n');
}

const NEXT =
  'Fix the code. Do not edit guardrails.baseline.json, raise limits, add bare disables or bypass hooks. ' +
  'A justified disable names the rule and gives a reason: // oxlint-disable-next-line <rule> -- <why>, <tracking ref>';

function report(fresh, baseline) {
  const known = Object.values(baseline).reduce((a, b) => a + b, 0);
  return `guardrails: ${fresh.length} new finding(s) above the baseline (${known} known)\n${format(fresh)}\n${NEXT}`;
}

// ── Commands ──

function check(argv) {
  const files = argv.includes('--changed')
    ? changedFiles()
    : argv.includes('--files')
      ? argv.slice(argv.indexOf('--files') + 1)
      : null;
  const scope = files ? new Set(scopedFiles(files)) : null;
  const strict = argv.includes('--strict-baseline');
  if (scope && strict) {
    console.error('guardrails: --strict-baseline needs a full check (no --changed or --files)');
    return 1;
  }
  const baseline = readBaseline();
  const { fresh, stale } = compare(collect(files), baseline, scope);
  if (fresh.length > 0) {
    console.error(report(fresh, baseline));
    return 1;
  }
  // Metrics (duplication, coverage floors) run on full checks only: pre-push and CI.
  const recorded = readMetrics();
  const problems = scope
    ? []
    : measureMetrics().flatMap((m) => compareMetric(m, recorded[m.name] ?? null, strict));
  if (problems.length > 0) {
    console.error(`guardrails: ${problems.join('\n')}`);
    return 1;
  }
  console.log(`guardrails: clean${scope ? ` (${scope.size} file(s))` : ''}`);
  if (stale.length > 0) {
    const msg = `guardrails: ${stale.length} baseline entr(ies) improved. Run: node scripts/guardrails.mjs baseline --tighten`;
    if (strict) {
      console.error(msg);
      return 1;
    }
    console.log(msg);
  }
  return 0;
}

// Metrics only move the right way. Returns the values to record, or null when one regressed. A
// first recording is allowed: enabling a tool is itself a reviewed config change.
function tightenMetrics() {
  const old = readMetrics();
  const next = {};
  for (const m of measureMetrics()) {
    const was = old[m.name] ?? null;
    const regressed =
      was !== null && (m.direction === 'down' ? m.value > was + EPSILON : m.value < was - EPSILON);
    if (regressed) {
      console.error(
        `guardrails: cannot tighten, ${m.name} went from ${was}${m.unit} to ${m.value}${m.unit}.`,
      );
      return null;
    }
    const pick = m.direction === 'down' ? Math.min : Math.max;
    next[m.name] = was === null ? m.value : pick(was, m.value);
  }
  return next;
}

function baselineCmd(argv) {
  const counts = tally(collect(null));
  if (argv.includes('--tighten')) {
    const old = readBaseline();
    const grown = Object.keys(counts).filter((k) => counts[k] > (old[k] ?? 0));
    if (grown.length > 0) {
      console.error(
        `guardrails: cannot tighten, ${grown.length} key(s) grew. Run check and fix them first.`,
      );
      return 1;
    }
    const metrics = tightenMetrics();
    if (metrics === null) return 1;
    console.log(`guardrails: baseline tightened (${writeBaseline(counts, metrics)} keys)`);
    return ratchetCoverage();
  }
  if (argv.includes('--init') && existsSync(BASELINE)) {
    console.error('guardrails: baseline exists. Use --tighten, or --reset after human review.');
    return 1;
  }
  if (!argv.includes('--init') && !argv.includes('--reset')) {
    console.error('guardrails: pass --init, --tighten or --reset');
    return 1;
  }
  const metrics = Object.fromEntries(measureMetrics().map((m) => [m.name, m.value]));
  console.log(`guardrails: baseline written (${writeBaseline(counts, metrics)} keys)`);
  return 0;
}

// Prints the stacks found from manifests (a monorepo can have several) and each pack's tools.
function packs() {
  const files = projectFiles(/.*/);
  const on = new Set(activeTools().map((t) => `${t.pack}/${t.id}`));
  for (const p of PACKS) {
    const hits = files.filter((f) => p.detect.some((re) => re.test(f)));
    const state =
      p.detect.length === 0
        ? 'always'
        : hits.length > 0
          ? `detected (${hits.length})`
          : 'not found';
    console.log(`${p.id}: ${state}`);
    for (const t of p.tools) {
      console.log(`  ${on.has(`${p.id}/${t.id}`) ? 'on ' : 'off'} ${t.id}`);
    }
  }
  return 0;
}

function runScript(name, env = {}) {
  const pm = packageManager();
  if (!pkg().scripts?.[name]) return { status: 0, skipped: true };
  const opts = { stdio: 'inherit', env: { ...process.env, ...env } };
  return run(pm, ['run', name], opts);
}

// Lets Vitest raise coverage thresholds in vitest.config.ts to the measured values.
function ratchetCoverage() {
  const r = runScript('test:coverage', { GUARDRAILS_RATCHET: '1' });
  if (r.skipped) return 0;
  if (r.status !== 0) console.error('guardrails: coverage run failed; thresholds unchanged');
  return r.status ?? 1;
}

function verify() {
  for (const step of ['format:check', 'typecheck', 'lint', 'test:coverage']) {
    const r = runScript(step);
    if (r.status !== 0) {
      console.error(`guardrails: verify failed at "${step}"`);
      return r.status ?? 1;
    }
  }
  return 0;
}

function formatFiles(argv) {
  const files = argv.slice(argv.indexOf('--files') + 1);
  if (files.length === 0) return 0;
  return (
    run(needBin('prettier'), ['--write', '--ignore-unknown', ...files], { stdio: 'inherit' })
      .status ?? 1
  );
}

function exec(argv) {
  const [name, ...rest] = argv;
  return run(needBin(name), rest, { stdio: 'inherit' }).status ?? 1;
}

// ── Agent hooks (Claude Code and Codex share the payload shape we use) ──

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function editedFiles(input) {
  const ti = input.tool_input ?? {};
  const files = [ti.file_path, ti.path, ...(ti.edits ?? []).map((e) => e.file_path)].filter(
    Boolean,
  );
  const patch = typeof ti.command === 'string' ? ti.command : (ti.input ?? '');
  for (const m of String(patch).matchAll(/^\*\*\* (?:Add|Update) File: (.+)$/gm))
    files.push(m[1].trim());
  return scopedFiles(files);
}

// Only tools that declare the 'edit' stage run here: the fast ones.
function postEdit(input) {
  const files = editedFiles(input);
  if (files.length === 0) return 0;
  const { fresh } = compare(collect(files, 'edit'), readBaseline(), new Set(files));
  if (fresh.length === 0) return 0;
  console.error(report(fresh, readBaseline()));
  return 2;
}

function blockStop(reason) {
  const text = `Guardrail gate failed for your changes. ${reason}`.slice(0, MAX_REASON);
  console.log(JSON.stringify({ decision: 'block', reason: text }));
  return 0;
}

// Deleting a file can break its importers, so deletions alone still run typecheck.
function stop(input) {
  if (input.stop_hook_active || changedPaths().length === 0) return 0;
  const files = changedFiles();
  const problems = [];
  const tc = pkg().scripts?.typecheck ? run(packageManager(), ['run', 'typecheck']) : { status: 0 };
  if (tc.status !== 0) problems.push(`typecheck failed:\n${(tc.stdout + tc.stderr).trim()}`);
  const { fresh } = compare(collect(files), readBaseline(), new Set(files));
  if (fresh.length > 0) problems.push(report(fresh, readBaseline()));
  const code = lintable(files);
  const vitest = code.length > 0 ? bin('vitest') : null;
  if (vitest) {
    const t = run(vitest, ['related', '--run', '--passWithNoTests', ...code]);
    if (t.status !== 0)
      problems.push(`tests failed:\n${(t.stdout + t.stderr).trim().slice(-3000)}`);
  }
  return problems.length === 0 ? 0 : blockStop(problems.join('\n\n'));
}

// A broken tool must still reach the agent as a blocking result, not a silent exit 1.
function hook([kind]) {
  const input = readStdin();
  const handlers = { 'post-edit': postEdit, stop };
  if (!handlers[kind]) {
    console.error(`guardrails: unknown hook "${kind}"`);
    return 1;
  }
  try {
    return handlers[kind](input);
  } catch (error) {
    const reason = `The guardrails hook could not run: ${error.message}. Fix the tooling or tell the user; do not skip the gate.`;
    if (kind === 'post-edit') {
      console.error(reason);
      return 2;
    }
    return input.stop_hook_active ? 0 : blockStop(reason);
  }
}

const COMMANDS = { check, baseline: baselineCmd, verify, format: formatFiles, exec, packs, hook };
const [command, ...argv] = process.argv.slice(2);
try {
  const fn = COMMANDS[command];
  if (!fn) {
    console.error(`usage: guardrails.mjs <${Object.keys(COMMANDS).join('|')}>`);
    process.exitCode = 1;
  } else {
    process.exitCode = fn(argv);
  }
} catch (error) {
  console.error(`guardrails: ${error.message}`);
  process.exitCode = 1;
}
```
<!-- /tmpl -->

<!-- tmpl:templates/shared/scripts/guardrails-packs.mjs -->
```js
// guardrails-packs.mjs: the pack registry. Generated by agentic-guardrail-ts.
// The engine (guardrails.mjs) is language-agnostic; everything stack-specific is declared here.
// See docs/packs.md for the contract. Adding a stack means adding a pack object below.
//
// A pack:    { id, detect: [RegExp on repo paths], tools: [tool] }
// A tool:
//   id        finding prefix; keys are `id:rule|file`
//   optIn     [config file | { file, has: RegExp }]: the tool is on when any of them matches
//   exts      files the tool covers (RegExp), so the hooks can scope it; omit for all tracked files
//   track     extra file types to start tracking when the tool is on (does not filter)
//   stages    where it runs: 'edit' (post-edit hook), 'commit' (pre-commit, --files, --changed and
//             the stop hook), 'push' (full check: pre-push and CI)
//   whole     true: always runs on the whole project; findings are then filtered to the scope
//   perFile   true: one command per file
//   ok        exit codes that mean "ran" (default [0, 1]); anything else is a tool failure
//   run(ctx)  returns { cmd, args } (null skips); ctx = { files, online, tmp(name), h }
//   parse(out, ctx)  out = { stdout, stderr, status }; returns [{ rule, file, line, message }]
//   scan(ctx) replaces run+parse for checks done in JS
//   metric + measure(ctx)  a number ratchet instead of findings: { name, direction, unit, advice }

const TS_EXT = /\.[cm]?[jt]sx?$/;
const MD_EXT = /\.mdx?$/;

// ── Parsing helpers ──

const tail = (s) => s.trim().slice(-2000);

// Colour codes some tools print even when piped.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

// One finding per output line that matches `re`; `make(match)` returns { rule, file, line, message }.
const lines =
  (re, make, from = 'stdout') =>
  (out) =>
    out[from].split('\n').flatMap((l) => {
      const m = re.exec(l.replaceAll(ANSI, ''));
      return m ? [make(m)] : [];
    });

const json = (tool, text) => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${tool} printed no JSON:\n${tail(text)}`);
  }
};

// Files for a command, or the whole-project fallback when the run is not scoped.
const targets = (ctx, fallback) => ctx.files ?? fallback;

// ── ts: the TypeScript stack. Each tool is on when its config file exists, which every v3 install has ──

// Every list-valued field of a Knip issue is a finding: unused files, exports, dependencies.
const knipItems = (issue) =>
  Object.entries(issue)
    .filter(([, items]) => Array.isArray(items))
    .flatMap(([type, items]) =>
      items.map((item) => ({
        rule: type,
        file: issue.file,
        line: item.line,
        message: item.name ?? type,
      })),
    );

const ts = {
  id: 'ts',
  detect: [/(^|\/)package\.json$/, /(^|\/)tsconfig[^/]*\.json$/],
  tools: [
    {
      id: 'oxlint',
      optIn: ['.oxlintrc.json'],
      exts: TS_EXT,
      stages: ['edit', 'commit', 'push'],
      run: ({ files, h }) =>
        files?.length === 0
          ? null
          : {
              cmd: h.needBin('oxlint'),
              args: [
                '--type-aware',
                '--report-unused-disable-directives',
                '-f',
                'json',
                ...(files ?? []),
              ],
            },
      parse: (out) =>
        json('oxlint', out.stdout).diagnostics.map((d) => ({
          rule: d.code ?? 'unused-disable-directive',
          file: d.filename,
          line: d.labels?.[0]?.span?.line,
          message: d.message,
        })),
    },
    {
      id: 'depcruise',
      optIn: ['.dependency-cruiser.mjs', '.dependency-cruiser.cjs', '.dependency-cruiser.js'],
      exts: TS_EXT,
      stages: ['commit', 'push'],
      run: ({ files, h }) => {
        const config = [
          '.dependency-cruiser.mjs',
          '.dependency-cruiser.cjs',
          '.dependency-cruiser.js',
        ].find((f) => h.exists(f));
        const dirs = files ?? h.sourceDirs();
        if (!config || dirs.length === 0) return null;
        return {
          cmd: h.needBin('depcruise'),
          args: [...dirs, '-c', config, '-T', 'json', '--no-ignore-known'],
        };
      },
      parse: (out) =>
        json('depcruise', out.stdout).summary.violations.map((v) => ({
          rule: v.rule.name,
          file: v.from,
          message: v.to === v.from ? v.rule.name : `imports ${v.to}`,
        })),
    },
    {
      // Needs the whole graph, so full checks only.
      id: 'knip',
      optIn: ['knip.json'],
      stages: ['push'],
      whole: true,
      run: ({ h }) =>
        h.bin('knip')
          ? { cmd: h.bin('knip'), args: ['--reporter', 'json', '--no-progress'] }
          : null,
      parse: (out) => json('knip', out.stdout).issues.flatMap(knipItems),
    },
    {
      // Every disable comment needs a rule and a reason.
      id: 'guardrails',
      optIn: ['.oxlintrc.json'],
      exts: TS_EXT,
      stages: ['edit', 'commit', 'push'],
      scan: ({ files, h }) => {
        const pattern = /\/[/*]\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?\b([^\n]*)/g;
        const found = [];
        for (const file of files ?? h.projectFiles()) {
          h.read(file)
            .split('\n')
            .forEach((text, i) => {
              for (const m of text.matchAll(pattern)) {
                const [rules, reason] = m[1].replace(/\*\/.*$/, '').split(/\s(?:--|—)\s/);
                if (rules?.trim() && reason?.trim()) continue;
                found.push({
                  rule: 'disable-needs-rule-and-reason',
                  file,
                  line: i + 1,
                  message: 'name the rule and add "-- <reason>"',
                });
              }
            });
        }
        return found;
      },
    },
  ],
};

// ── core: every repo ──

// ls-lint reports { path: { ".ext": ["rule" | "exists:0 (found N)"] } }.
const lsLintEntry = (file, ext, text) => {
  const rule = text.replace(/ \(found \d+\)$/, '');
  const times = Number(/\(found (\d+)\)$/.exec(text)?.[1] ?? 1);
  const entry = {
    rule: `${ext.replace(/^\./, '')}-${rule}`,
    file,
    message: `${ext} name breaks ${rule}`,
  };
  return Array.from({ length: times }, () => entry);
};

const lsLintFindings = ([file, byExt]) =>
  Object.entries(byExt).flatMap(([ext, texts]) =>
    texts.flatMap((text) => lsLintEntry(file, ext, text)),
  );

const core = {
  id: 'core',
  detect: [],
  tools: [
    {
      // Custom structural rules (vocabulary literals, banned identifiers). `sg` is a deprecated alias.
      id: 'ast-grep',
      optIn: ['sgconfig.yml'],
      exts: /\.(?:[cm]?[jt]sx?|py|rs|java|go|kt|swift|c|cc|cpp|h|hpp|cs|rb|php|dart)$/,
      stages: ['edit', 'commit', 'push'],
      run: ({ files, h }) => ({
        cmd: h.bin('ast-grep') ?? h.needBin('sg'),
        args: ['scan', '--json=stream', ...(files ?? [])],
      }),
      parse: (out) =>
        out.stdout
          .split('\n')
          .filter((l) => l.startsWith('{'))
          .map((l) => {
            const d = json('ast-grep', l);
            return {
              rule: d.ruleId,
              file: d.file,
              line: d.range.start.line + 1,
              message: d.message,
            };
          }),
    },
    {
      // Folder and extension naming. Tree rules, so it always runs whole. A banned extension
      // (`exists:0`) is reported on its directory with a count ("found 2"); it is expanded to one
      // finding per file so the key stays stable while the count moves.
      id: 'ls-lint',
      optIn: ['.ls-lint.yml'],
      stages: ['edit', 'commit', 'push'],
      whole: true,
      run: ({ h }) => ({ cmd: h.needBin('ls-lint'), args: ['-error-output-format', 'json'] }),
      parse: (out) =>
        out.status === 0 ? [] : Object.entries(json('ls-lint', out.stderr)).flatMap(lsLintFindings),
    },
    {
      // Spelling and banned synonyms (`flagWords`), in code and docs.
      id: 'cspell',
      optIn: ['cspell.json', '.cspell.json'],
      track: MD_EXT,
      stages: ['edit', 'commit', 'push'],
      run: ({ files, h }) => ({
        cmd: h.needBin('cspell'),
        args: [
          'lint',
          '--no-progress',
          '--no-summary',
          '--no-color',
          '--gitignore',
          '--no-must-find-files',
          ...(files ?? ['**']),
        ],
      }),
      parse: lines(
        /^(.+?):(\d+):\d+ - (Forbidden|Unknown) word \(([^)]+)\)/,
        ([, file, row, kind, word]) => ({
          rule: `${kind.toLowerCase()}-word`,
          file,
          line: +row,
          message: `${kind.toLowerCase()} word "${word}"`,
        }),
      ),
    },
    {
      id: 'markdownlint',
      optIn: ['.markdownlint-cli2.jsonc', '.markdownlint-cli2.yaml'],
      exts: MD_EXT,
      stages: ['commit', 'push'],
      run: ({ files, h }) => {
        const docs = targets({ files }, h.projectFiles(MD_EXT));
        return docs.length === 0
          ? null
          : { cmd: h.needBin('markdownlint-cli2'), args: ['--no-globs', ...docs] };
      },
      parse: lines(
        /^(.+?):(\d+)(?::\d+)? (?:error|warning) (MD\d+)\/\S+ (.*)$/,
        ([, file, row, rule, message]) => ({ rule, file, line: +row, message }),
        'stderr',
      ),
      // markdownlint exits 1 on findings and 2 on a crash; a crash prints no findings.
      ok: [0, 1],
    },
    {
      // Offline in hooks (local links and anchors). GUARDRAILS_ONLINE=1 (CI) checks URLs too.
      // Timeouts are not findings: a slow host must not fail the gate.
      id: 'lychee',
      optIn: ['lychee.toml', '.lychee.toml'],
      exts: MD_EXT,
      stages: ['commit', 'push'],
      ok: [0, 1, 2],
      quiet: [2],
      run: ({ files, online, h }) => {
        const docs = targets({ files }, h.projectFiles(MD_EXT));
        if (docs.length === 0) return null;
        const config = h.exists('lychee.toml') ? 'lychee.toml' : '.lychee.toml';
        const mode = online ? [] : ['--offline'];
        return {
          cmd: 'lychee',
          args: ['--config', config, '--no-progress', '--format', 'json', ...mode, ...docs],
        };
      },
      parse: (out, { h }) =>
        Object.entries(json('lychee', out.stdout).error_map ?? {}).flatMap(([file, errors]) =>
          errors.map((e) => ({
            rule: 'broken-link',
            file,
            line: e.span?.line,
            message: `${e.url.replace(`file://${h.ROOT}/`, '')}: ${e.status?.text ?? 'unreachable'}`,
          })),
        ),
    },
    {
      // Duplication is a relation between files, so it ratchets as one percentage that may only
      // go down. Full checks only.
      id: 'jscpd',
      optIn: ['.jscpd.json'],
      stages: ['push'],
      metric: {
        name: 'duplication',
        direction: 'down',
        unit: '%',
        advice: 'Remove the new copies.',
      },
      measure: ({ tmp, h }) => {
        const r = h.run(h.needBin('jscpd'), [
          '--reporters',
          'json',
          '--output',
          tmp(''),
          '--silent',
        ]);
        if (!h.exists(tmp('jscpd-report.json'))) {
          throw new Error(`jscpd failed (exit ${r.status}):\n${tail(r.stderr || r.stdout)}`);
        }
        const report = json('jscpd', h.read(tmp('jscpd-report.json')));
        const detail = (report.duplicates ?? [])
          .toSorted((a, b) => b.lines - a.lines)
          .slice(0, 5)
          .map(
            (c) =>
              `${c.firstFile.name}:${c.firstFile.start} = ${c.secondFile.name}:${c.secondFile.start} (${c.lines} lines)`,
          );
        return { value: report.statistics.total.percentage, detail };
      },
    },
    {
      // File-level hygiene from .editorconfig (final newline, indent style, trailing space).
      id: 'editorconfig-checker',
      optIn: ['.ecrc'],
      stages: ['commit', 'push'],
      run: ({ files, h }) => ({
        cmd: h.needBin('editorconfig-checker'),
        args: ['-format', 'gcc', '-no-color', ...(files ?? [])],
      }),
      parse: lines(/^(.+?):(\d+):\d+: error: (.*)$/, ([, file, row, message]) => ({
        rule: message.replace(/\d+/g, 'N').replaceAll(/\W+/g, '-').replace(/-$/, ''),
        file,
        line: +row,
        message,
      })),
    },
    {
      // Lints .github/workflows. Needs the actionlint binary on PATH.
      id: 'actionlint',
      optIn: ['.github/actionlint.yaml', '.github/actionlint.yml'],
      exts: /^\.github\/workflows\/.*\.ya?ml$/,
      stages: ['commit', 'push'],
      run: ({ files }) => ({
        cmd: 'actionlint',
        args: ['-format', '{{json .}}', ...(files ?? [])],
      }),
      parse: (out) =>
        json('actionlint', out.stdout || '[]').map((e) => ({
          rule: e.kind ?? e.Kind,
          file: e.filepath ?? e.Filepath,
          line: e.line ?? e.Line,
          message: e.message ?? e.Message,
        })),
    },
  ],
};

// ── python: every tool runs through `uv run` ──

const PY_EXT = /\.py$/;
const uvRun = (...args) => ({ cmd: 'uv', args: ['run', ...args] });
const inPyproject = (section) => ({
  file: 'pyproject.toml',
  has: new RegExp(`^\\[tool\\.${section}`, 'm'),
});

const python = {
  id: 'python',
  detect: [/(^|\/)pyproject\.toml$/, /(^|\/)uv\.lock$/],
  tools: [
    {
      id: 'ruff',
      optIn: [inPyproject('ruff'), 'ruff.toml', '.ruff.toml'],
      exts: PY_EXT,
      stages: ['edit', 'commit', 'push'],
      run: ({ files }) =>
        uvRun('ruff', 'check', '--output-format', 'json', '--no-cache', ...(files ?? ['.'])),
      parse: (out) =>
        json('ruff', out.stdout).map((d) => ({
          rule: d.code ?? 'syntax-error',
          file: d.filename,
          line: d.location?.row,
          message: d.message,
        })),
    },
    {
      id: 'ruff-format',
      optIn: [inPyproject('ruff'), 'ruff.toml', '.ruff.toml'],
      exts: PY_EXT,
      stages: ['commit', 'push'],
      run: ({ files }) => uvRun('ruff', 'format', '--check', '--no-cache', ...(files ?? ['.'])),
      // ruff 0.16 prints `unformatted: File would be reformatted` then ` --> path:line:col`;
      // older versions print `Would reformat: path`.
      parse: lines(/^(?:Would reformat: (.+)|\s+--> (.+?):\d+:\d+)$/, (m) => ({
        rule: 'format',
        file: m[1] ?? m[2],
        message: 'run ruff format',
      })),
    },
    {
      // Whole project: a type error in one file can come from a change in another.
      id: 'pyright',
      optIn: [inPyproject('pyright'), 'pyrightconfig.json'],
      exts: PY_EXT,
      stages: ['commit', 'push'],
      whole: true,
      run: () => uvRun('pyright', '--outputjson'),
      parse: (out) =>
        (json('pyright', out.stdout).generalDiagnostics ?? [])
          .filter((d) => d.severity === 'error' || d.severity === 'warning')
          .map((d) => ({
            rule: d.rule ?? 'pyright',
            file: d.file,
            line: (d.range?.start?.line ?? 0) + 1,
            message: d.message,
          })),
    },
    {
      id: 'tach',
      optIn: ['tach.toml'],
      exts: PY_EXT,
      stages: ['push'],
      whole: true,
      run: () => uvRun('tach', 'check', '--output', 'json'),
      parse: (out) =>
        json('tach', out.stdout).map((d) => {
          const { file_path: file, line_number: line, details } = d.Located ?? d;
          const rule = Object.keys(details?.Code ?? {})[0] ?? 'configuration';
          const { usage_module: from, definition_module: to } = details?.Code?.[rule] ?? {};
          return {
            rule,
            file: file ?? 'tach.toml',
            line,
            message: from && to ? `${from} may not depend on ${to}` : rule,
          };
        }),
    },
    {
      id: 'deptry',
      optIn: [inPyproject('deptry')],
      exts: PY_EXT,
      stages: ['push'],
      whole: true,
      run: ({ tmp, h }) =>
        uvRun(
          'deptry',
          h.exists('src') ? 'src' : '.',
          '--no-ansi',
          '--json-output',
          tmp('deptry.json'),
        ),
      parse: (out, { tmp, h }) => {
        if (!h.exists(tmp('deptry.json')))
          throw new Error(`deptry failed (exit ${out.status}):\n${tail(out.stderr)}`);
        return json('deptry', h.read(tmp('deptry.json'))).map((d) => ({
          rule: d.error.code,
          file: d.location.file,
          line: d.location.line ?? 0,
          message: d.error.message,
        }));
      },
    },
    {
      id: 'vulture',
      optIn: [inPyproject('vulture')],
      exts: PY_EXT,
      stages: ['push'],
      whole: true,
      ok: [0, 3],
      run: () => uvRun('vulture'),
      parse: (out, { h }) =>
        lines(/^(.+?):(\d+): (.+?) \(\d+% confidence\)/, ([, file, row, text]) => ({
          rule: text
            .replace(/'[^']*'/g, '')
            .trim()
            .replaceAll(/\W+/g, '-'),
          file,
          line: +row,
          message: text,
        }))(out)
          // ruff F401 owns unused imports, so vulture does not report them a second time.
          .filter((f) => !(f.rule === 'unused-import' && h.active('ruff'))),
    },
    {
      // Test coverage may only go up. Needs pytest-cov in the dev group.
      id: 'pytest-cov',
      optIn: [inPyproject('coverage')],
      stages: ['push'],
      metric: {
        name: 'python-coverage',
        direction: 'up',
        unit: '%',
        advice: 'Add tests for the new code.',
      },
      measure: ({ tmp, h }) => {
        const r = h.run('uv', [
          'run',
          'pytest',
          '--cov',
          `--cov-report=json:${tmp('cov.json')}`,
          '-q',
        ]);
        if (!h.exists(tmp('cov.json')))
          throw new Error(`pytest failed (exit ${r.status}):\n${tail(r.stdout || r.stderr)}`);
        return { value: json('pytest-cov', h.read(tmp('cov.json'))).totals.percent_covered };
      },
    },
  ],
};

// ── mule: MuleSoft applications (Maven, Mule XML, DataWeave, MUnit) ──

const MULE_FILES =
  /(^|\/)src\/(?:main|test)\/(?:mule|munit|resources)\/.*\.(?:xml|dwl|raml|ya?ml|properties)$/;
const MULE_PROJECT = /(^|\/)mule-artifact\.json$/;
const MULE_CONFIG = '.mulelintrc.json';
const join2 = (dir, file) => (dir === '.' ? file : `${dir}/${file}`);
const dirOf = (file) => file.split('/').slice(0, -1).join('/') || '.';

// Mule applications in the repo: the directories that hold a mule-artifact.json.
const muleProjects = (h) => h.projectFiles(MULE_PROJECT).map(dirOf);

const mule = {
  id: 'mule',
  detect: [MULE_PROJECT, /(^|\/)src\/main\/mule\/.+\.xml$/],
  tools: [
    {
      // mule-lint (@sfdxy/mule-lint), config in .mulelintrc.json (profile via `extends`).
      // Info findings are advisory and are not counted.
      id: 'mule-lint',
      optIn: [MULE_CONFIG],
      exts: MULE_FILES,
      stages: ['edit', 'commit', 'push'],
      whole: true,
      scan: ({ h }) =>
        muleProjects(h).flatMap((dir) => {
          const r = h.run(h.needBin('mule-lint'), [
            dir,
            '--config',
            MULE_CONFIG,
            '--format',
            'json',
          ]);
          if (r.status !== 0 && r.status !== 1) {
            throw new Error(`mule-lint failed (exit ${r.status}):\n${tail(r.stderr || r.stdout)}`);
          }
          return json('mule-lint', r.stdout)
            .filter((d) => d.severity === 'error' || d.severity === 'warning')
            .map((d) => ({
              rule: d.ruleId,
              file: d.filePath ?? join2(dir, d.relativePath),
              line: d.line,
              message: d.message,
            }));
        }),
    },
    {
      // Mule XML formatting. There is no maintained CLI formatter for DataWeave (.dwl) files, so
      // those are not format-checked; mule-lint's DW rules cover their content.
      id: 'mule-format',
      optIn: [MULE_CONFIG],
      exts: MULE_FILES,
      stages: ['commit', 'push'],
      whole: true,
      scan: ({ h }) =>
        muleProjects(h).flatMap((dir) => {
          const r = h.run(h.needBin('mule-lint'), ['format', '--check', dir]);
          if (r.status !== 0 && r.status !== 1) {
            throw new Error(
              `mule-lint format failed (exit ${r.status}):\n${tail(r.stderr || r.stdout)}`,
            );
          }
          return lines(/^\s*✗ (.+?) \(needs formatting\)/, ([, file]) => ({
            rule: 'format',
            file: join2(dir, file),
            message: 'run mule-lint format',
          }))(r);
        }),
    },
    {
      // Plain-text secrets in properties and YAML. Values must be a ${placeholder} or an
      // encrypted ![...] Secure Properties value.
      id: 'mule-secrets',
      optIn: [MULE_CONFIG],
      exts: /(^|\/)src\/(?:main|test)\/resources\/.*\.(?:properties|ya?ml)$/,
      stages: ['edit', 'commit', 'push'],
      scan: ({ files, h }) => {
        const key = /(?:pass(?:word|wd)?|secret|token|api[-_.]?key|private[-_.]?key|credential)/i;
        const found = [];
        const all =
          files ?? h.projectFiles(/(^|\/)src\/(?:main|test)\/resources\/.*\.(?:properties|ya?ml)$/);
        for (const file of all) {
          h.read(file)
            .split('\n')
            .forEach((text, i) => {
              const m = /^\s*([\w.-]+)\s*[=:]\s*(.+?)\s*$/.exec(text);
              if (!m || !key.test(m[1])) return;
              const value = m[2].replace(/^["']|["']$/g, '');
              if (value === '' || value.startsWith('${') || value.startsWith('![')) return;
              found.push({
                rule: 'plain-secret',
                file,
                line: i + 1,
                message: `"${m[1]}" holds a plain value; use \${placeholder} or an encrypted ![...] value`,
              });
            });
        }
        return found;
      },
    },
    {
      // MUnit through Maven. The coverage floor is requiredApplicationCoverage in pom.xml, so a
      // coverage miss fails `mvn test`. Only poms that configure the MUnit plugin run.
      id: 'munit',
      optIn: [{ file: 'pom.xml', has: /munit-maven-plugin/ }],
      stages: ['push'],
      whole: true,
      scan: ({ h }) =>
        h
          .projectFiles(/(^|\/)pom\.xml$/)
          .filter((pom) => /munit-maven-plugin/.test(h.read(pom)))
          .flatMap((pom) => {
            const r = h.run('mvn', ['-B', '-ntp', '-q', '-f', pom, 'test']);
            return r.status === 0
              ? []
              : [
                  {
                    rule: 'tests-or-coverage-failed',
                    file: pom,
                    message: tail(r.stdout || r.stderr),
                  },
                ];
          }),
    },
  ],
};

// ── salesforce: Apex, LWC, metadata (always `sf`, never `sfdx`) ──

const APEX_EXT = /\.(?:cls|trigger|apex)$/;
const SF_CODE = /\.(?:cls|trigger|apex|js|html|cmp|page|component)$/;
const SF_MARKER = ['code-analyzer.yml', 'code-analyzer.yaml'];

// The package directories of sfdx-project.json (force-app by default), or the repo root.
const packageDirs = (h) => {
  if (!h.exists('sfdx-project.json')) return ['.'];
  const paths = (
    json('sfdx-project.json', h.read('sfdx-project.json')).packageDirectories ?? []
  ).map((p) => p.path);
  return paths.length > 0 ? paths : ['.'];
};

const salesforce = {
  id: 'salesforce',
  detect: [/(^|\/)sfdx-project\.json$/, /\.(?:cls|trigger)$/],
  tools: [
    {
      // Salesforce Code Analyzer: PMD for Apex, ESLint for LWC, retire-js, regex rules. About ten
      // seconds a run, so it is a pre-commit and CI check, not an edit hook.
      id: 'code-analyzer',
      optIn: SF_MARKER,
      exts: SF_CODE,
      stages: ['commit', 'push'],
      // The workspace is the package directories of sfdx-project.json, so tooling files such as
      // scripts/ are not analysed as LWC.
      run: ({ files, tmp, h }) => {
        const dirs = packageDirs(h);
        const inside = (files ?? []).filter((f) => dirs.some((d) => f.startsWith(`${d}/`)));
        if (files && inside.length === 0) return null;
        return {
          cmd: 'sf',
          args: [
            'code-analyzer',
            'run',
            ...dirs.flatMap((d) => ['--workspace', d]),
            ...inside.flatMap((f) => ['--target', f]),
            '--output-file',
            tmp('code-analyzer.json'),
          ],
        };
      },
      parse: (out, { tmp, h }) => {
        if (!h.exists(tmp('code-analyzer.json'))) {
          throw new Error(
            `sf code-analyzer wrote no results (exit ${out.status}):\n${tail(out.stderr)}`,
          );
        }
        return json('code-analyzer', h.read(tmp('code-analyzer.json'))).violations.map((v) => {
          const at = v.locations[v.primaryLocationIndex ?? 0];
          return {
            rule: `${v.engine}.${v.rule}`,
            file: at.file,
            line: at.startLine,
            message: v.message,
          };
        });
      },
    },
    {
      // Apex formatting through prettier-plugin-apex. LWC JS, HTML and CSS are covered by the
      // base Prettier check (`format:check`).
      id: 'prettier-apex',
      optIn: [
        { file: '.prettierrc', has: /prettier-plugin-apex/ },
        { file: '.prettierrc.json', has: /prettier-plugin-apex/ },
      ],
      exts: APEX_EXT,
      stages: ['commit', 'push'],
      run: ({ files, h }) => {
        const apex = files ?? h.projectFiles(APEX_EXT);
        return apex.length === 0
          ? null
          : { cmd: h.needBin('prettier'), args: ['--list-different', '--ignore-unknown', ...apex] };
      },
      parse: lines(/^([^[\s].*)$/, ([, file]) => ({
        rule: 'format',
        file,
        message: 'run prettier --write',
      })),
    },
    {
      // Metadata sanity: every class and trigger has its -meta.xml, and no apiVersion is older
      // than sourceApiVersion in sfdx-project.json.
      id: 'sf-metadata',
      optIn: SF_MARKER,
      exts: /\.(?:cls|trigger)$/,
      stages: ['commit', 'push'],
      scan: ({ files, h }) => {
        const project = h.exists('sfdx-project.json')
          ? json('sfdx-project.json', h.read('sfdx-project.json'))
          : {};
        const want = Number.parseFloat(project.sourceApiVersion);
        const code = files ?? h.projectFiles(/\.(?:cls|trigger)$/);
        return code.flatMap((file) => {
          const meta = `${file}-meta.xml`;
          if (!h.exists(meta))
            return [{ rule: 'missing-meta-xml', file, message: `${file} has no ${meta}` }];
          const version = /<apiVersion>([\d.]+)<\/apiVersion>/.exec(h.read(meta))?.[1];
          if (!want || !version || Number.parseFloat(version) >= want) return [];
          const message = `apiVersion ${version} is older than sourceApiVersion ${project.sourceApiVersion}`;
          return [{ rule: 'stale-api-version', file: meta, message }];
        });
      },
    },
    {
      // Apex coverage floor from an org test run (`sf apex run test`). Needs an authenticated
      // test org named in guardrails/apex-coverage.json; never point it at production.
      id: 'apex-coverage',
      optIn: ['guardrails/apex-coverage.json'],
      stages: ['push'],
      metric: {
        name: 'apex-coverage',
        direction: 'up',
        unit: '%',
        advice: 'Add Apex tests for the new code.',
      },
      measure: ({ h }) => {
        const cfg = json('apex-coverage.json', h.read('guardrails/apex-coverage.json'));
        const r = h.run('sf', [
          'apex',
          'run',
          'test',
          '--target-org',
          cfg.targetOrg,
          '--test-level',
          cfg.testLevel ?? 'RunLocalTests',
          '--code-coverage',
          '--wait',
          String(cfg.waitMinutes ?? 60),
          '--json',
        ]);
        const summary = json('sf apex run test', r.stdout).result?.summary;
        if (!summary)
          throw new Error(
            `sf apex run test returned no summary (exit ${r.status}):\n${tail(r.stdout)}`,
          );
        if (summary.outcome !== 'Passed')
          throw new Error(`Apex tests ${summary.outcome}: ${summary.failing} failing`);
        return { value: Number.parseFloat(summary.orgWideCoverage) };
      },
    },
  ],
};

// ── shell ──

const SH_EXT = /\.(?:sh|bash)$/;
const SH_MARKER = ['.shellcheckrc'];

const shell = {
  id: 'shell',
  detect: [SH_EXT, /(^|\/)\.shellcheckrc$/],
  tools: [
    {
      id: 'shellcheck',
      optIn: SH_MARKER,
      exts: SH_EXT,
      stages: ['edit', 'commit', 'push'],
      run: ({ files, h }) => {
        const scripts = files ?? h.projectFiles(SH_EXT);
        return scripts.length === 0
          ? null
          : { cmd: 'shellcheck', args: ['-f', 'json1', ...scripts] };
      },
      parse: (out) =>
        (json('shellcheck', out.stdout).comments ?? []).map((c) => ({
          rule: `SC${c.code}`,
          file: c.file,
          line: c.line,
          message: c.message,
        })),
    },
    {
      // Formatting from .editorconfig (shfmt reads indent settings there).
      id: 'shfmt',
      optIn: SH_MARKER,
      exts: SH_EXT,
      stages: ['commit', 'push'],
      run: ({ files, h }) => {
        const scripts = files ?? h.projectFiles(SH_EXT);
        return scripts.length === 0 ? null : { cmd: 'shfmt', args: ['-l', ...scripts] };
      },
      parse: lines(/^(.+\.(?:sh|bash))$/, ([, file]) => ({
        rule: 'format',
        file,
        message: 'run shfmt -w',
      })),
    },
  ],
};

// ── docker ──

const DOCKERFILE = /(^|\/)(?:Dockerfile[^/]*|[^/]*\.Dockerfile)$/;
const COMPOSE = /(^|\/)(?:docker-)?compose[^/]*\.ya?ml$/;
const DOCKER_MARKER = ['.hadolint.yaml', '.hadolint.yml'];

const docker = {
  id: 'docker',
  detect: [DOCKERFILE, COMPOSE],
  tools: [
    {
      id: 'hadolint',
      optIn: DOCKER_MARKER,
      exts: DOCKERFILE,
      stages: ['commit', 'push'],
      run: ({ files, h }) => {
        const images = files ?? h.projectFiles(DOCKERFILE);
        return images.length === 0
          ? null
          : { cmd: 'hadolint', args: ['--format', 'json', ...images] };
      },
      parse: (out) =>
        json('hadolint', out.stdout || '[]').map((d) => ({
          rule: d.code,
          file: d.file,
          line: d.line,
          message: d.message,
        })),
    },
    {
      // `docker compose config` validates the file and its interpolation; it needs no daemon.
      id: 'compose-config',
      optIn: DOCKER_MARKER,
      exts: COMPOSE,
      stages: ['commit', 'push'],
      perFile: true,
      run: ({ files }) => ({
        cmd: 'docker',
        args: ['compose', '-f', files[0], 'config', '--quiet'],
      }),
      parse: (out, { files }) =>
        out.status === 0
          ? []
          : [{ rule: 'invalid', file: files[0], message: tail(out.stderr || out.stdout) }],
    },
  ],
};

// ── sql ──

const SQL_EXT = /\.sql$/;

const sql = {
  id: 'sql',
  detect: [SQL_EXT, /(^|\/)\.sqlfluff$/],
  tools: [
    {
      // The dialect and rules come from .sqlfluff.
      id: 'sqlfluff',
      optIn: ['.sqlfluff'],
      exts: SQL_EXT,
      stages: ['commit', 'push'],
      run: ({ files }) => ({
        cmd: 'sqlfluff',
        args: ['lint', '--format', 'json', ...(files ?? ['.'])],
      }),
      parse: (out) =>
        json('sqlfluff', out.stdout || '[]').flatMap((f) =>
          f.violations.map((v) => ({
            rule: v.code,
            file: f.filepath,
            line: v.start_line_no ?? v.line_no,
            message: v.description,
          })),
        ),
    },
  ],
};

export const PACKS = [core, ts, python, mule, salesforce, shell, docker, sql];
```
<!-- /tmpl -->

<!-- tmpl:templates/shared/.oxlintrc.json -->
```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "import", "oxc", "vitest"],
  "categories": {
    "correctness": "error",
    "suspicious": "error"
  },
  "env": { "node": true, "es2024": true },
  "ignorePatterns": [
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/.turbo/**",
    "**/.vitest/**",
    "**/*.d.ts"
  ],
  "rules": {
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "typescript/ban-ts-comment": [
      "error",
      { "ts-expect-error": "allow-with-description", "minimumDescriptionLength": 10 }
    ],
    "typescript/consistent-type-imports": "error",
    "typescript/consistent-type-assertions": [
      "error",
      { "assertionStyle": "as", "objectLiteralTypeAssertions": "never" }
    ],
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "typescript/await-thenable": "error",
    "typescript/only-throw-error": "error",
    "typescript/switch-exhaustiveness-check": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/restrict-template-expressions": "error",

    "eslint/max-lines": ["error", { "max": 400, "skipBlankLines": true, "skipComments": true }],
    "eslint/max-lines-per-function": [
      "error",
      { "max": 60, "skipBlankLines": true, "skipComments": true }
    ],
    "eslint/max-params": ["error", { "max": 4 }],
    "eslint/max-depth": ["error", 3],
    "eslint/complexity": ["error", 12],
    "eslint/max-nested-callbacks": ["error", 3],
    "eslint/no-console": "error",
    "eslint/eqeqeq": ["error", "always", { "null": "ignore" }],
    "eslint/no-param-reassign": "error",

    "unicorn/filename-case": ["error", { "case": "kebabCase" }],
    "unicorn/prefer-node-protocol": "error",
    "unicorn/no-useless-undefined": ["error", { "checkArguments": false }],
    "unicorn/throw-new-error": "error",
    "unicorn/no-abusive-eslint-disable": "error",

    "import/no-duplicates": "error",
    "import/no-self-import": "error",

    "vitest/no-focused-tests": "error",
    "vitest/expect-expect": "error"
  },
  "overrides": [
    {
      "files": ["**/*.test.*", "**/*.spec.*", "**/__tests__/**", "**/test/**", "**/tests/**"],
      "rules": {
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
        "eslint/max-nested-callbacks": "off",
        "typescript/no-non-null-assertion": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-explicit-any": "off"
      }
    },
    {
      "files": ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.jsx"],
      "rules": {
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off"
      }
    },
    {
      "files": ["scripts/**", "**/bin/**", "*.config.*", "**/*.config.*"],
      "rules": {
        "eslint/no-console": "off",
        "eslint/max-lines": "off",
        "eslint/max-lines-per-function": "off",
        "eslint/complexity": "off"
      }
    }
  ]
}
```
<!-- /tmpl -->

<!-- tmpl:templates/shared/lefthook.yml -->
```yaml
# lefthook.yml: git hooks. Every command goes through scripts/guardrails.mjs,
# so hooks behave the same under npm, pnpm, yarn and bun.

pre-commit:
  piped: true
  jobs:
    - name: format
      glob: '*.{js,mjs,cjs,jsx,ts,mts,cts,tsx,json,md,yml,yaml,css}'
      run: node scripts/guardrails.mjs format --files {staged_files}
      stage_fixed: true

    - name: guardrails
      glob: '*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'
      run: node scripts/guardrails.mjs check --files {staged_files}

    - name: secrets
      run: gitleaks git --pre-commit --staged --redact --no-banner

pre-push:
  jobs:
    - name: verify
      run: node scripts/guardrails.mjs verify

commit-msg:
  jobs:
    - name: commitlint
      run: node scripts/guardrails.mjs exec commitlint --edit {1}
```
<!-- /tmpl -->

<!-- tmpl:templates/shared/commitlint.config.mjs -->
```js
export default {
  extends: ['@commitlint/config-conventional'],
};
```
<!-- /tmpl -->

<!-- tmpl:templates/shared/.prettierrc.json -->
```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```
<!-- /tmpl -->

`.prettierignore`:

<!-- tmpl:templates/shared/.prettierignore -->
```
dist
build
coverage
node_modules
.turbo
.vitest
*.min.js
*.min.css
pnpm-lock.yaml
guardrails.baseline.json
.dependency-cruiser-known-violations.json
# Add generated or column-aligned files below (see docs/known-conflicts.md)
```
<!-- /tmpl -->

`.gitignore` lines to merge:

<!-- tmpl:templates/shared/gitignore.txt -->
```
node_modules/
dist/
build/
coverage/
.turbo/
.vitest/
*.tsbuildinfo
.env
.env.*
!.env.example
```
<!-- /tmpl -->

<!-- tmpl:templates/shared/.editorconfig -->
```
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[{Makefile,*.mk}]
indent_style = tab
```
<!-- /tmpl -->

`.nvmrc`:

<!-- tmpl:templates/shared/.nvmrc -->
```
24
```
<!-- /tmpl -->

### Single package

<!-- tmpl:templates/single/package.json -->
```json
{
  "type": "module",
  "engines": {
    "node": ">=22.12"
  },
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit",
    "lint": "node scripts/guardrails.mjs check",
    "lint:tighten": "node scripts/guardrails.mjs baseline --tighten",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "verify": "node scripts/guardrails.mjs verify",
    "prepare": "lefthook install"
  },
  "devDependencies": {
    "@commitlint/cli": "^21.2.4",
    "@commitlint/config-conventional": "^21.2.4",
    "@types/node": "^24.0.0",
    "@typescript/native": "npm:typescript@^7.0.2",
    "@vitest/coverage-v8": "^5.0.5",
    "dependency-cruiser": "^18.7.0",
    "knip": "^6.43.0",
    "lefthook": "^2.2.2",
    "oxlint": "^1.90.0",
    "oxlint-tsgolint": "^7.0.2005",
    "prettier": "^3.9.10",
    "typescript": "npm:@typescript/typescript6@^6.0.2",
    "vite": "^8.3.5",
    "vitest": "^5.0.5"
  }
}
```
<!-- /tmpl -->

<!-- tmpl:templates/single/tsconfig.json -->
```json
{
  "compilerOptions": {
    "target": "es2024",
    "lib": ["es2024"],
    "module": "nodenext",
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test", "*.config.ts"]
}
```
<!-- /tmpl -->

<!-- tmpl:templates/single/tsconfig.build.json -->
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["**/*.test.ts", "**/__tests__/**"]
}
```
<!-- /tmpl -->

<!-- tmpl:templates/single/.dependency-cruiser.mjs -->
```js
// Architecture rules for a single package. Layers are listed lowest first:
// a layer may import from layers below it, never from layers above it.
// Adjust LAYERS to the directories this project actually has.
const LAYERS = [
  'src/shared',
  'src/domain',
  'src/application',
  'src/infrastructure',
  'src/interface',
];

const layerRules = LAYERS.slice(0, -1).map((layer, i) => ({
  name: `layer-${layer.split('/').pop()}`,
  comment: `${layer} may only import from layers below it`,
  severity: 'error',
  from: { path: `^${layer}/` },
  to: { path: `^(${LAYERS.slice(i + 1).join('|')})/` },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    ...layerRules,
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'not-to-dev-dep',
      comment: 'Production code must not import devDependencies',
      severity: 'error',
      from: { path: '^src/', pathNot: '\\.(test|spec)\\.[cm]?[jt]sx?$' },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'not-to-test',
      severity: 'error',
      from: { pathNot: '\\.(test|spec)\\.[cm]?[jt]sx?$|^test/' },
      to: { path: '\\.(test|spec)\\.[cm]?[jt]sx?$|^test/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|build|coverage)/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
```
<!-- /tmpl -->

<!-- tmpl:templates/single/knip.json -->
```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "entry": ["src/index.ts"],
  "project": ["src/**/*.{ts,tsx}"],
  "ignoreExportsUsedInFile": true,
  "ignoreDependencies": [
    "@commitlint/cli",
    "@typescript/native",
    "oxlint",
    "oxlint-tsgolint",
    "vite"
  ]
}
```
<!-- /tmpl -->

<!-- tmpl:templates/single/vitest.config.ts -->
```ts
import { defineConfig } from 'vitest/config';

// Coverage floors only move up. `guardrails.mjs baseline --tighten` runs coverage with
// GUARDRAILS_RATCHET=1, which lets Vitest raise the thresholds below to what is measured.
const ratchet = process.env['GUARDRAILS_RATCHET'] === '1';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text-summary', 'lcov'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
        autoUpdate: ratchet ? (next: number): number => Math.floor(next) : false,
      },
    },
  },
});
```
<!-- /tmpl -->

### Monorepo

<!-- tmpl:templates/monorepo/package.json -->
```json
{
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=22.12"
  },
  "scripts": {
    "build": "turbo run build",
    "typecheck": "tsc --noEmit && turbo run typecheck",
    "lint": "node scripts/guardrails.mjs check && syncpack lint",
    "lint:tighten": "node scripts/guardrails.mjs baseline --tighten",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "verify": "node scripts/guardrails.mjs verify",
    "prepare": "lefthook install"
  },
  "devDependencies": {
    "@commitlint/cli": "^21.2.4",
    "@commitlint/config-conventional": "^21.2.4",
    "@types/node": "^24.0.0",
    "@typescript/native": "npm:typescript@^7.0.2",
    "@vitest/coverage-v8": "^5.0.5",
    "dependency-cruiser": "^18.7.0",
    "knip": "^6.43.0",
    "lefthook": "^2.2.2",
    "oxlint": "^1.90.0",
    "oxlint-tsgolint": "^7.0.2005",
    "prettier": "^3.9.10",
    "syncpack": "^15.3.3",
    "turbo": "^2.11.10",
    "typescript": "npm:@typescript/typescript6@^6.0.2",
    "vite": "^8.3.5",
    "vitest": "^5.0.5"
  }
}
```
<!-- /tmpl -->

<!-- tmpl:templates/monorepo/tsconfig.base.json -->
```json
{
  "compilerOptions": {
    "target": "es2024",
    "lib": ["es2024"],
    "module": "nodenext",
    "types": ["node"],
    "customConditions": ["source"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "erasableSyntaxOnly": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```
<!-- /tmpl -->

<!-- tmpl:templates/monorepo/tsconfig.json -->
```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["*.config.ts"]
}
```
<!-- /tmpl -->

<!-- tmpl:templates/monorepo/.dependency-cruiser.mjs -->
```js
// Architecture rules for a monorepo. Workspace directories are grouped into tiers, lowest
// first. A package may import from packages in lower tiers only: never from its own tier,
// never from a higher one. Adjust TIERS to this repo's packages (globs allowed: 'apps/*').
const TIERS = [
  ['packages/types'], // tier 0: no workspace dependencies
  ['packages/core'], // tier 1: may import tier 0
  ['apps/*'], // apps: may import any package, never another app
];

const toRegex = (dir) => dir.replaceAll('*', '[^/]+');
const group = (dirs) => `(${dirs.map(toRegex).join('|')})`;

const tierRules = TIERS.map((tier, i) => ({
  name: `tier-${i}`,
  comment: `${tier.join(', ')} may only import from lower tiers`,
  severity: 'error',
  from: { path: `^${group(tier)}/` },
  to: { path: `^${group(TIERS.slice(i).flat())}/`, pathNot: '^$1/' },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    ...tierRules,
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-relative-cross-package',
      comment: 'Import other workspace packages by name, not by relative path',
      severity: 'error',
      from: { path: '^(packages|apps)/([^/]+)/' },
      to: { path: '^(packages|apps)/', pathNot: '^$1/$2/', dependencyTypes: ['local'] },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|build|coverage)/' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['source', 'import', 'require', 'node', 'default', 'types'],
    },
  },
};
```
<!-- /tmpl -->

<!-- tmpl:templates/monorepo/knip.json -->
```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "workspaces": {
    ".": {
      "entry": ["scripts/*.mjs"]
    },
    "packages/*": {
      "entry": ["src/index.ts"],
      "project": ["src/**/*.{ts,tsx}"]
    },
    "apps/*": {
      "entry": ["src/main.ts", "src/index.ts"],
      "project": ["src/**/*.{ts,tsx}"]
    }
  },
  "ignoreExportsUsedInFile": true,
  "ignoreDependencies": [
    "@commitlint/cli",
    "@typescript/native",
    "oxlint",
    "oxlint-tsgolint",
    "vite"
  ]
}
```
<!-- /tmpl -->

<!-- tmpl:templates/monorepo/turbo.json -->
```json
{
  "$schema": "https://turborepo.com/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "outputs": []
    }
  }
}
```
<!-- /tmpl -->

<!-- tmpl:templates/monorepo/.syncpackrc.json -->
```json
{
  "$schema": "./node_modules/syncpack/schema.json",
  "versionGroups": [
    {
      "label": "Workspace packages depend on each other through the workspace protocol",
      "dependencies": ["$LOCAL"],
      "dependencyTypes": ["!local"],
      "pinVersion": "workspace:*"
    },
    {
      "label": "Every other dependency uses one version across the repo",
      "dependencies": ["**"],
      "packages": ["**"]
    }
  ]
}
```
<!-- /tmpl -->

<!-- tmpl:templates/monorepo/vitest.config.ts -->
```ts
import { defineConfig } from 'vitest/config';

// Coverage floors only move up. `guardrails.mjs baseline --tighten` runs coverage with
// GUARDRAILS_RATCHET=1, which lets Vitest raise the thresholds below to what is measured.
const ratchet = process.env['GUARDRAILS_RATCHET'] === '1';

export default defineConfig({
  // Resolve workspace packages to their TypeScript source (the "source" export condition).
  resolve: { conditions: ['source'] },
  ssr: { resolve: { conditions: ['source'] } },
  test: {
    include: ['{packages,apps}/*/src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['{packages,apps}/*/src/**/*.{ts,tsx}'],
      reporter: ['text-summary', 'lcov'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
        autoUpdate: ratchet ? (next: number): number => Math.floor(next) : false,
      },
    },
  },
});
```
<!-- /tmpl -->

### CI

<!-- tmpl:templates/ci/ci.yml -->
```yaml
# .github/workflows/ci.yml: the same gate as `git push`, plus a secret scan.
# Actions are pinned by commit SHA; Renovate or Dependabot keeps the pins current.
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0

      # pnpm only: remove this step for npm, yarn or bun.
      - uses: pnpm/action-setup@ea17c68df8912ef543352723c149a84f56e3d413 # v6.1.0

      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version-file: .nvmrc
          cache: pnpm # npm | pnpm | yarn

      - run: pnpm install --frozen-lockfile # npm ci | yarn install --frozen-lockfile

      - name: Verify (format, typecheck, guardrails, tests with coverage)
        run: node scripts/guardrails.mjs verify

      - name: Baseline is tight
        run: node scripts/guardrails.mjs check --strict-baseline

      - name: Commit messages
        if: github.event_name == 'pull_request'
        run: >-
          node scripts/guardrails.mjs exec commitlint
          --from ${{ github.event.pull_request.base.sha }}
          --to ${{ github.event.pull_request.head.sha }}

  secrets:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    env:
      GITLEAKS_VERSION: 8.30.1
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
      - name: Install gitleaks
        run: |
          curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" \
            | sudo tar -xz -C /usr/local/bin gitleaks
      - name: Scan history
        run: gitleaks git --redact --no-banner --log-opts="--all"
```
<!-- /tmpl -->
