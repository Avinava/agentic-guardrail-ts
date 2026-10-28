#!/usr/bin/env node
// fixture-test.mjs: apply the templates to each fixture in a temp dir, install, and prove
// the gate passes clean code, catches seeded violations, ratchets, and drives agent hooks.
//
//   node scripts/fixture-test.mjs [fixture-name ...] [--keep]

import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..');
const FIXTURES = join(REPO, 'test', 'fixtures');
const args = process.argv.slice(2);
const keep = args.includes('--keep');
const only = args.filter((a) => !a.startsWith('--'));

const INSTALL = {
  npm: ['npm', ['install', '--no-audit', '--no-fund', '--loglevel=error']],
  pnpm: ['pnpm', ['install', '--reporter=silent']],
  yarn: ['yarn', ['install', '--silent']],
};

function sh(cwd, cmd, cmdArgs, input) {
  const r = spawnSync(cmd, cmdArgs, { cwd, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

function mergePackageJson(dir, template) {
  const file = join(dir, 'package.json');
  const own = JSON.parse(readFileSync(file, 'utf8'));
  const tpl = JSON.parse(readFileSync(template, 'utf8'));
  const merged = { ...tpl, ...own };
  for (const key of ['scripts', 'devDependencies', 'engines'])
    merged[key] = { ...tpl[key], ...own[key] };
  writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
}

function applyTemplates(dir, variant) {
  for (const layer of ['shared', variant, 'agent']) {
    const src = join(REPO, 'templates', layer);
    if (!existsSync(src)) continue;
    for (const entry of readdirSync(src)) {
      if (entry === 'package.json') continue;
      const target = entry === 'gitignore.txt' ? '.gitignore' : entry;
      cpSync(join(src, entry), join(dir, target), { recursive: true });
    }
    if (existsSync(join(src, 'package.json'))) mergePackageJson(dir, join(src, 'package.json'));
  }
}

class Fixture {
  constructor(name) {
    this.name = name;
    this.src = join(FIXTURES, name);
    this.expected = JSON.parse(readFileSync(join(this.src, 'expected.json'), 'utf8'));
    this.dir = mkdtempSync(join(tmpdir(), `guardrails-${name}-`));
    this.failures = [];
  }

  g(cmdArgs, input) {
    return sh(this.dir, 'node', ['scripts/guardrails.mjs', ...cmdArgs], input);
  }

  assert(ok, label, detail = '') {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
    if (!ok) this.failures.push(`${label}\n${detail.slice(-4000)}`);
  }

  setup() {
    cpSync(join(this.src, 'base'), this.dir, { recursive: true });
    applyTemplates(this.dir, this.expected.variant);
    this.tailor();
    this.setPackageManagerField();
    this.setCoverageFloor();
    sh(this.dir, 'git', ['init', '-q', '-b', 'main']);
    sh(this.dir, 'git', ['config', 'user.email', 'fixture@example.com']);
    sh(this.dir, 'git', ['config', 'user.name', 'fixture']);
    const [cmd, cmdArgs] = INSTALL[this.expected.packageManager];
    const r = sh(this.dir, cmd, cmdArgs);
    this.assert(r.status === 0, `${cmd} install`, r.out);
    sh(this.dir, 'git', ['add', '-A']);
    sh(this.dir, 'git', ['commit', '-q', '--no-verify', '-m', 'chore: fixture base']);
  }

  // The edits the setup skill makes to fit templates to a project (tiers, protocols).
  tailor() {
    for (const { file, from, to } of this.expected.tailor ?? []) {
      const path = join(this.dir, file);
      const text = readFileSync(path, 'utf8');
      if (!text.includes(from)) throw new Error(`tailor: "${from}" not found in ${file}`);
      writeFileSync(path, text.replace(from, to));
    }
  }

  // Like the setup skill: record the package manager actually in use (turbo requires it).
  setPackageManagerField() {
    const pm = this.expected.packageManager;
    const file = join(this.dir, 'package.json');
    const pkg = JSON.parse(readFileSync(file, 'utf8'));
    if (pkg.packageManager || pm === 'npm') return;
    pkg.packageManager = `${pm}@${sh(this.dir, pm, ['--version']).out.trim()}`;
    writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  // Undo one seeded violation: put back the base version of the file, or delete it.
  restore(file) {
    const base = join(this.src, 'base', file);
    if (existsSync(base)) cpSync(base, join(this.dir, file));
    else rmSync(join(this.dir, file), { force: true });
  }

  // A retrofit sets coverage floors at the measured baseline; the fixture says what that is.
  setCoverageFloor() {
    const floor = this.expected.coverageFloor;
    if (floor === undefined) return;
    for (const file of ['vitest.config.ts', ...(this.expected.vitestConfigs ?? [])]) {
      const path = join(this.dir, file);
      if (!existsSync(path)) continue;
      const text = readFileSync(path, 'utf8');
      writeFileSync(
        path,
        text.replaceAll(/(lines|branches|functions|statements): \d+/g, `$1: ${floor}`),
      );
    }
  }

  clean() {
    const pm = this.expected.packageManager;
    for (const script of ['format:check', 'typecheck', 'test']) {
      const r = sh(this.dir, pm, ['run', script]);
      this.assert(r.status === 0, `clean: ${script}`, r.out);
    }
    if (this.expected.retrofit) {
      let r = this.g(['check']);
      this.assert(r.status === 1, 'retrofit: existing debt is reported', r.out);
      r = this.g(['baseline', '--init']);
      this.assert(r.status === 0, 'retrofit: baseline --init records the debt', r.out);
    }
    const r = this.g(['check']);
    this.assert(r.status === 0, 'clean: guardrails check', r.out);
  }

  violations() {
    cpSync(join(this.src, 'violations'), this.dir, { recursive: true });
    if (this.expected.reinstallAfterViolations) {
      const [cmd, cmdArgs] = INSTALL[this.expected.packageManager];
      sh(this.dir, cmd, cmdArgs);
    }
    const r = this.g(['check']);
    this.assert(r.status === 1, 'violations: check fails', r.out);
    for (const key of this.expected.violations) {
      const [toolRule, file] = key.split('|');
      const rule = toolRule.slice(toolRule.indexOf(':') + 1);
      this.assert(
        r.out.split('\n').some((line) => line.includes(file) && line.includes(rule)),
        `violations: reports ${key}`,
        r.out,
      );
    }
  }

  ratchet() {
    // A retrofit already has a baseline; accepting the seeded violations is a human reset.
    const accept = this.expected.retrofit ? '--reset' : '--init';
    let r = this.g(['baseline', accept]);
    this.assert(r.status === 0, `ratchet: baseline ${accept}`, r.out);
    r = this.g(['baseline', '--init']);
    this.assert(r.status === 1, 'ratchet: second --init refused', r.out);
    r = this.g(['check']);
    this.assert(r.status === 0, 'ratchet: known findings pass', r.out);
    const extra = this.expected.extraViolation;
    writeFileSync(join(this.dir, extra.file), extra.content);
    r = this.g(['check']);
    this.assert(r.status === 1 && r.out.includes(extra.file), 'ratchet: new finding fails', r.out);
    r = this.g(['check', '--files', extra.file]);
    this.assert(r.status === 1, 'ratchet: scoped --files check fails', r.out);
    r = this.g(['check', '--changed', '--strict-baseline']);
    this.assert(r.status === 1, 'ratchet: --strict-baseline refuses a scoped check', r.out);
    rmSync(join(this.dir, extra.file));
    for (const file of this.expected.fix) this.restore(file);
    r = this.g(['check', '--strict-baseline']);
    this.assert(
      r.status === 1 && r.out.includes('--tighten'),
      'ratchet: stale baseline flagged',
      r.out,
    );
    r = this.g(['baseline', '--tighten']);
    this.assert(r.status === 0, 'ratchet: baseline --tighten', r.out);
    r = this.g(['check', '--strict-baseline']);
    this.assert(r.status === 0, 'ratchet: tightened baseline passes', r.out);
  }

  hooks() {
    const extra = this.expected.extraViolation;
    writeFileSync(join(this.dir, extra.file), extra.content);
    const edit = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: join(this.dir, extra.file) },
    });
    let r = this.g(['hook', 'post-edit'], edit);
    this.assert(
      r.status === 2 && r.out.includes(extra.file),
      'hooks: post-edit blocks new finding',
      r.out,
    );
    const patch = JSON.stringify({
      tool_name: 'apply_patch',
      tool_input: { command: `*** Begin Patch\n*** Add File: ${extra.file}\n+x\n*** End Patch` },
    });
    r = this.g(['hook', 'post-edit'], patch);
    this.assert(r.status === 2, 'hooks: post-edit parses apply_patch', r.out);
    r = this.g(['hook', 'stop'], JSON.stringify({ stop_hook_active: true }));
    this.assert(r.status === 0 && r.out.trim() === '', 'hooks: stop respects loop guard', r.out);
    r = this.g(['hook', 'stop'], JSON.stringify({ stop_hook_active: false }));
    const blocked = r.status === 0 && r.out.includes('"decision":"block"');
    this.assert(blocked, 'hooks: stop blocks on gate failure', r.out);
    rmSync(join(this.dir, extra.file));
    r = this.g(['hook', 'stop'], JSON.stringify({ stop_hook_active: false }));
    this.assert(
      r.status === 0 && !r.out.includes('"decision"'),
      'hooks: stop passes when clean',
      r.out,
    );
    this.deletionAndBrokenTool();
  }

  deletionAndBrokenTool() {
    const imported = join(this.dir, this.expected.importedFile);
    const source = readFileSync(imported, 'utf8');
    rmSync(imported);
    let r = this.g(['hook', 'stop'], JSON.stringify({ stop_hook_active: false }));
    const blocked = r.status === 0 && r.out.includes('"decision":"block"');
    this.assert(blocked, 'hooks: stop blocks a deletion that breaks importers', r.out);
    writeFileSync(imported, source);
    const rc = join(this.dir, '.oxlintrc.json');
    const config = readFileSync(rc, 'utf8');
    writeFileSync(rc, '{ not json');
    const extra = this.expected.extraViolation;
    writeFileSync(join(this.dir, extra.file), extra.content);
    const edit = JSON.stringify({ tool_input: { file_path: join(this.dir, extra.file) } });
    r = this.g(['hook', 'post-edit'], edit);
    this.assert(
      r.status === 2 && r.out.includes('could not run'),
      'hooks: post-edit blocks when a tool is broken',
      r.out,
    );
    writeFileSync(rc, config);
    rmSync(join(this.dir, extra.file));
  }

  gitHooks() {
    const extra = this.expected.extraViolation;
    // Stage a violation, then fix it only in the working tree: the staged content must fail.
    writeFileSync(join(this.dir, extra.file), extra.content);
    sh(this.dir, 'git', ['add', extra.file]);
    writeFileSync(join(this.dir, extra.file), 'export const a = 1;\n');
    let r = sh(this.dir, 'git', ['commit', '-q', '-m', 'chore: partial']);
    this.assert(r.status !== 0, 'git: pre-commit checks staged content, not the worktree', r.out);
    sh(this.dir, 'git', ['rm', '-q', '--cached', extra.file]);
    rmSync(join(this.dir, extra.file));
    sh(this.dir, 'git', ['add', '-A']);
    r = sh(this.dir, 'git', ['commit', '-q', '-m', 'not a conventional message']);
    this.assert(r.status !== 0, 'git: commitlint rejects bad message', r.out);
    r = sh(this.dir, 'git', ['commit', '-q', '-m', 'chore: adopt guardrails baseline']);
    this.assert(r.status === 0, 'git: conventional commit passes', r.out);
  }

  runAll() {
    console.log(`\n${this.name} (${this.dir})`);
    this.setup();
    if (this.failures.length === 0) {
      this.clean();
      this.violations();
      this.ratchet();
      this.hooks();
      this.gitHooks();
    }
    if (!keep) rmSync(this.dir, { recursive: true, force: true });
    return this.failures;
  }
}

const names = readdirSync(FIXTURES).filter((n) => only.length === 0 || only.includes(n));
const failures = names.flatMap((n) => new Fixture(n).runAll().map((f) => `${n}: ${f}`));
if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):\n\n${failures.join('\n\n')}`);
  process.exitCode = 1;
} else {
  console.log(`\nall ${names.length} fixture(s) passed`);
}
