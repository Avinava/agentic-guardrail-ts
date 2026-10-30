// pack-harness.mjs: shared setup for the pack unit tests (scripts/packs-*-test.mjs).
//
// Every external tool is replaced by a fake that prints canned output, so the tests need no
// installs and no network. They prove the engine wiring (detection by config file, finding keys,
// scoping, stages, ratchets). They do not prove a real tool behaves; docs/packs.md says which
// tools were also run for real.

import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const SCRIPTS = join(import.meta.dirname, '..', 'templates', 'shared', 'scripts');

// Tools found in node_modules/.bin, and tools found on PATH.
const NODE_BINS = [
  'oxlint',
  'ast-grep',
  'ls-lint',
  'cspell',
  'jscpd',
  'markdownlint-cli2',
  'editorconfig-checker',
  'mule-lint',
  'prettier',
];
const PATH_BINS = [
  'lychee',
  'uv',
  'actionlint',
  'mvn',
  'sf',
  'shellcheck',
  'shfmt',
  'hadolint',
  'docker',
  'sqlfluff',
  'cargo',
  'cargo-machete',
  'dart',
  'flutter',
  'clang-format',
  'pio',
];

// A fake binary. Which canned spec answers a call:
//   uv run <tool> <sub> ...  -> <tool>-<sub>.json when it exists, else <tool>.json
//   <name> <sub> ...   -> <name>-<sub>.json when it exists, else <name>.json
// A spec is { stdout, stderr, status, writes: [{ flag, join?, content }] }; `writes` creates the
// files the real tool would write to a flag's value. Every call is logged to <name>.args.
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const [name, ...argv] = process.argv.slice(2);
const dir = process.env.FAKE_DIR;
fs.appendFileSync(path.join(dir, name + '.args'), JSON.stringify(argv) + '\\n');
const spec = (key) => path.join(dir, key + '.json');
let file = spec(name);
if (name === 'uv') file = fs.existsSync(spec(argv[1] + '-' + argv[2])) ? spec(argv[1] + '-' + argv[2]) : spec(argv[1]);
else if (fs.existsSync(spec(name + '-' + argv[0]))) file = spec(name + '-' + argv[0]);
const canned = JSON.parse(fs.readFileSync(file, 'utf8'));
for (const w of canned.writes ?? []) {
  // A flag's value is the next argument, or the rest of an argument that starts with the prefix.
  const arg = w.prefix ? argv.find((a) => a.startsWith(w.prefix)) : null;
  const base = arg ? arg.slice(w.prefix.length) : argv[argv.indexOf(w.flag) + 1];
  fs.mkdirSync(w.join ? base : path.dirname(base), { recursive: true });
  fs.writeFileSync(w.join ? path.join(base, w.join) : base, JSON.stringify(w.content));
}
process.stdout.write(canned.stdout ?? '');
process.stderr.write(canned.stderr ?? '');
process.exitCode = canned.status ?? 0;
`;

export const state = { dir: '', fakeDir: '' };

export function fake(name, spec) {
  writeFileSync(join(state.fakeDir, `${name}.json`), JSON.stringify(spec));
}

export function calls(name) {
  const file = join(state.fakeDir, `${name}.args`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
}

export function put(file, text = '') {
  mkdirSync(dirname(join(state.dir, file)), { recursive: true });
  writeFileSync(join(state.dir, file), text);
}

function installFakes(binDir, names) {
  mkdirSync(binDir, { recursive: true });
  for (const name of names) {
    const exe = join(binDir, name);
    writeFileSync(
      exe,
      `#!/bin/sh\nexec node "${join(state.fakeDir, 'fake.cjs')}" "${name}" "$@"\n`,
    );
    chmodSync(exe, 0o755);
  }
}

function envFor(extra = {}) {
  const path = `${join(state.dir, '.path')}:${process.env.PATH}`;
  return { ...process.env, FAKE_DIR: state.fakeDir, PATH: path, ...extra };
}

export function setup() {
  state.dir = mkdtempSync(join(tmpdir(), 'guardrails-packs-'));
  state.fakeDir = join(state.dir, '.fake');
  mkdirSync(state.fakeDir);
  writeFileSync(join(state.fakeDir, 'fake.cjs'), FAKE);
  const git = (...a) => spawnSync('git', a, { cwd: state.dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  put('package.json', '{"name":"fixture"}\n');
  put('.oxlintrc.json', '{}\n');
  put('src/a.ts', "export const a = 'active';\n");
  mkdirSync(join(state.dir, 'scripts'));
  for (const f of ['guardrails.mjs', 'guardrails-packs.mjs']) {
    cpSync(join(SCRIPTS, f), join(state.dir, 'scripts', f));
  }
  installFakes(join(state.dir, 'node_modules', '.bin'), NODE_BINS);
  installFakes(join(state.dir, '.path'), PATH_BINS);
  fake('oxlint', { stdout: '{"diagnostics":[]}' });
  git('add', '-A');
}

export function teardown() {
  rmSync(state.dir, { recursive: true, force: true });
}

// Runs scripts/guardrails.mjs in the fixture repo.
export function g(args, env = {}, input = '') {
  const r = spawnSync('node', ['scripts/guardrails.mjs', ...args], {
    cwd: state.dir,
    encoding: 'utf8',
    input,
    env: envFor(env),
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, stdout: r.stdout, stderr: r.stderr };
}

// Runs the post-edit hook as an agent would, editing `file`.
export function postEdit(file) {
  const payload = JSON.stringify({ tool_input: { file_path: join(state.dir, file) } });
  return g(['hook', 'post-edit'], {}, payload);
}

export function baselineFile() {
  return JSON.parse(readFileSync(join(state.dir, 'guardrails.baseline.json'), 'utf8'));
}

// Inits a baseline and returns the recorded counts.
export function recordedCounts() {
  const r = g(['baseline', '--init']);
  if (r.status !== 0) throw new Error(`baseline --init failed:\n${r.out}`);
  return baselineFile().counts;
}
