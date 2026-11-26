#!/usr/bin/env node
// packs-security-test.mjs: the security pack (osv-scanner, semgrep, zizmor).
// Fake-output tests prove the wiring and the parsers; the "real binary" blocks run the actual
// tools on small fixtures and skip themselves when a binary (or, for osv-scanner, the network)
// is missing.
//
//   node --test scripts/packs-security-test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { calls, fake, g, put, recordedCounts, setup, state, teardown } from './pack-harness.mjs';

const REPO = join(import.meta.dirname, '..');
const TEMPLATES = join(REPO, 'templates', 'packs', 'security');

beforeEach(setup);
afterEach(teardown);

const onPath = (name) => spawnSync('which', [name]).status === 0;

// Puts a real binary in front of a fake one for the rest of the test.
const useReal = (name) => rmSync(join(state.dir, '.path', name), { force: true });

describe('osv-scanner (fake output)', () => {
  const report = {
    results: [
      {
        source: { path: `${'/abs/repo'}/package-lock.json`, type: 'lockfile' },
        packages: [
          {
            package: { name: 'minimist', version: '1.2.0', ecosystem: 'npm' },
            vulnerabilities: [
              { id: 'GHSA-vh95-rmgr-6w4m', summary: 'Prototype Pollution in minimist' },
              { id: 'GHSA-xvch-5gv4-984h', details: 'Prototype Pollution\nmore text' },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    put('osv-scanner.toml', '# on\n');
    put('package-lock.json', '{}\n');
    report.results[0].source.path = join(state.dir, 'package-lock.json');
    fake('osv-scanner', { stdout: JSON.stringify(report), status: 1 });
  });

  it('keys osv-scanner:<advisory>|<lockfile> and passes every lockfile with -L', () => {
    put('services/api/uv.lock', '');
    assert.deepEqual(recordedCounts(), {
      'osv-scanner:GHSA-vh95-rmgr-6w4m|package-lock.json': 1,
      'osv-scanner:GHSA-xvch-5gv4-984h|package-lock.json': 1,
    });
    assert.deepEqual(calls('osv-scanner').at(-1), [
      'scan',
      'source',
      '--format',
      'json',
      '--config',
      'osv-scanner.toml',
      '-L',
      'package-lock.json',
      '-L',
      'services/api/uv.lock',
    ]);
  });

  it('is a push-stage tool: hooks and --files never run it', () => {
    g(['check', '--files', 'package-lock.json', 'src/a.ts']);
    assert.deepEqual(calls('osv-scanner'), []);
    g(['check']);
    assert.equal(calls('osv-scanner').length, 1);
  });

  it('is off without osv-scanner.toml, and silent without a lockfile', () => {
    rmSync(join(state.dir, 'osv-scanner.toml'));
    assert.equal(g(['check']).status, 0);
    put('osv-scanner.toml', '# on\n');
    rmSync(join(state.dir, 'package-lock.json'));
    assert.equal(g(['check']).status, 0);
    assert.deepEqual(calls('osv-scanner'), []);
  });

  it('fails on a tool error or unreadable output, never a pass', () => {
    fake('osv-scanner', { stdout: '', stderr: 'network down', status: 127 });
    let r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /osv-scanner failed \(exit 127\)/);
    fake('osv-scanner', { stdout: 'Error: format changed', status: 1 });
    r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /osv-scanner printed no JSON/);
  });
});

describe('semgrep (fake output)', () => {
  beforeEach(() => {
    cpSync(join(TEMPLATES, '.semgrep'), join(state.dir, '.semgrep'), { recursive: true });
    fake('semgrep', {
      stdout: JSON.stringify({
        results: [
          {
            check_id: 'semgrep.js-eval',
            path: 'src/a.ts',
            start: { line: 3 },
            extra: { message: 'eval() runs strings as code.' },
          },
        ],
        errors: [],
      }),
      status: 1,
    });
  });

  it('keys semgrep:<rule>|file, sends no metrics and uses only the local rules', () => {
    assert.match(g(['check']).out, /src\/a\.ts:3 {2}semgrep js-eval/);
    assert.deepEqual(recordedCounts(), { 'semgrep:js-eval|src/a.ts': 1 });
    const args = calls('semgrep').at(-1);
    assert.deepEqual(args.slice(0, 7), [
      'scan',
      '--metrics=off',
      '--disable-version-check',
      '--quiet',
      '--json',
      '--error',
      '--config',
    ]);
    assert.deepEqual(args.slice(7), ['.semgrep', '.']);
    assert.equal(
      args.some((a) => /^(p|r)\//.test(a) || a === 'auto'),
      false,
    );
  });

  it('runs on a full check only', () => {
    g(['check', '--files', 'src/a.ts']);
    assert.deepEqual(calls('semgrep'), []);
  });

  it('fails on a fatal error (exit 2) and on output it cannot read', () => {
    fake('semgrep', { stdout: '', stderr: 'invalid rule', status: 2 });
    assert.match(g(['check']).out, /semgrep failed \(exit 2\)/);
    fake('semgrep', { stdout: 'not json', status: 1 });
    assert.match(g(['check']).out, /semgrep printed no JSON/);
  });

  it('is off without .semgrep/rules.yml', () => {
    rmSync(join(state.dir, '.semgrep'), { recursive: true });
    assert.equal(g(['check']).status, 0);
    assert.deepEqual(calls('semgrep'), []);
  });
});

describe('zizmor (fake output)', () => {
  const finding = (extra = {}) => ({
    ident: 'template-injection',
    desc: 'code injection via template expansion',
    ignored: false,
    locations: [
      {
        symbolic: {
          key: { Local: { verbatim_path: '.github/workflows/ci.yml' } },
          annotation: 'github.event.pull_request.title may expand into attacker-controllable code',
          kind: 'Primary',
        },
        concrete: { location: { start_point: { row: 8, column: 6 } } },
      },
    ],
    ...extra,
  });

  beforeEach(() => {
    put('.github/zizmor.yml', 'rules: {}\n');
    put('.github/workflows/ci.yml', 'name: ci\n');
    fake('zizmor', {
      stdout: JSON.stringify([finding(), finding({ ident: 'artipacked', ignored: true })]),
      status: 14,
    });
  });

  it('keys zizmor:<audit>|workflow with a 1-based line and drops ignored findings', () => {
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /\.github\/workflows\/ci\.yml:9 {2}zizmor template-injection/);
    assert.deepEqual(recordedCounts(), { 'zizmor:template-injection|.github/workflows/ci.yml': 1 });
    assert.deepEqual(calls('zizmor').at(-1), [
      '--offline',
      '--format',
      'json-v1',
      '--no-progress',
      '--config',
      '.github/zizmor.yml',
      '.github/workflows/ci.yml',
    ]);
  });

  it('runs on commit for changed workflows only', () => {
    g(['check', '--files', 'src/a.ts']);
    assert.deepEqual(calls('zizmor'), []);
    g(['check', '--files', '.github/workflows/ci.yml']);
    assert.equal(calls('zizmor').at(-1).at(-1), '.github/workflows/ci.yml');
  });

  it('exit 0 is clean; exit 1 (a tool failure) blocks', () => {
    fake('zizmor', { stdout: '[]', status: 0 });
    assert.equal(g(['check']).status, 0);
    fake('zizmor', { stdout: '', stderr: 'fatal: no audit was performed', status: 1 });
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /zizmor failed \(exit 1\)/);
  });

  it('is off without a zizmor config', () => {
    rmSync(join(state.dir, '.github/zizmor.yml'));
    assert.equal(g(['check']).status, 0);
    assert.deepEqual(calls('zizmor'), []);
  });
});

describe('security pack detection', () => {
  it('lists the pack when a lockfile, workflow or .semgrep folder exists', () => {
    put('.github/workflows/ci.yml', 'name: ci\n');
    put('pnpm-lock.yaml', '');
    const r = g(['packs']);
    assert.match(r.out, /security/);
  });
});

describe('real binaries', () => {
  const realIt = (bin, name, fn) =>
    it(name, { skip: !onPath(bin) && `${bin} is not installed` }, fn);
  const template = (name) => readFileSync(join(TEMPLATES, name), 'utf8');

  realIt('semgrep', 'semgrep finds the pack rules and nothing else', () => {
    useReal('semgrep');
    cpSync(join(TEMPLATES, '.semgrep'), join(state.dir, '.semgrep'), { recursive: true });
    rmSync(join(state.dir, 'src/a.ts'));
    put('src/clean.ts', 'export const ok = 1;\n');
    assert.equal(g(['check']).status, 0);
    put(
      'src/bad.ts',
      [
        "import cp from 'child_process';",
        'export function run(x: string) {',
        '  eval(x);',
        '  cp.exec(`ls ${x}`);',
        "  cp.exec('ls');",
        '}',
        '',
      ].join('\n'),
    );
    put('src/bad.py', 'import subprocess\nsubprocess.run("ls", shell=True)\n');
    assert.deepEqual(recordedCounts(), {
      'semgrep:js-eval|src/bad.ts': 1,
      'semgrep:js-child-process-shell|src/bad.ts': 1,
      'semgrep:py-shell-true|src/bad.py': 1,
    });
    assert.equal(g(['check']).status, 0);
  });

  realIt('semgrep', 'semgrep sees every exec import shape and shell=True form', () => {
    useReal('semgrep');
    cpSync(join(TEMPLATES, '.semgrep'), join(state.dir, '.semgrep'), { recursive: true });
    rmSync(join(state.dir, 'src/a.ts'));
    put('src/imp.ts', "import { exec } from 'child_process';\nexec(cmd);\n");
    put('src/mod.ts', "import cp from 'child_process';\ncp.exec(cmd);\n");
    put('src/req.ts', "require('child_process').exec(cmd);\n");
    put('src/own.ts', "import { exec } from './mine';\nexec(cmd);\nconst m = /x/.exec(s);\n");
    put('src/lit.ts', "import { exec } from 'child_process';\nexec('ls');\n");
    put('src/node.ts', 'const { exec } = require("node:child_process");\nexec(cmd);\n');
    put(
      'src/sh.py',
      [
        'from subprocess import run, PIPE, STDOUT',
        'run(cmd, shell=True, stdout=PIPE, stderr=STDOUT)',
        'import subprocess',
        'subprocess.call(x, shell=True)',
        '',
      ].join('\n'),
    );
    put('src/alias.py', 'from subprocess import run as execute\nexecute(cmd, shell=True)\n');
    put(
      'src/paren.py',
      'from subprocess import (\n    Popen,\n    PIPE,\n)\nPopen(cmd, shell=True, stdout=PIPE)\n',
    );
    put('src/other.py', 'from mylib import run\nrun(cmd, shell=True)\n');
    put(
      'src/yml.py',
      [
        'import yaml',
        'yaml.load(d, Loader=yaml.SafeLoader)',
        'yaml.load(d, yaml.CSafeLoader)',
        'yaml.load(d)',
        '',
      ].join('\n'),
    );
    assert.deepEqual(recordedCounts(), {
      'semgrep:js-child-process-shell|src/imp.ts': 1,
      'semgrep:js-child-process-shell|src/mod.ts': 1,
      'semgrep:js-child-process-shell|src/req.ts': 1,
      'semgrep:js-child-process-shell|src/node.ts': 1,
      'semgrep:py-shell-true|src/sh.py': 2,
      'semgrep:py-shell-true|src/alias.py': 1,
      'semgrep:py-shell-true|src/paren.py': 1,
      'semgrep:py-unsafe-deserialize|src/yml.py': 1,
    });
  });

  realIt('semgrep', 'semgrep sees aliased exec, HTML sinks, shell helpers and named hashes', () => {
    useReal('semgrep');
    cpSync(join(TEMPLATES, '.semgrep'), join(state.dir, '.semgrep'), { recursive: true });
    rmSync(join(state.dir, 'src/a.ts'));
    put('src/esm.ts', "import { exec as run } from 'node:child_process';\nrun(cmd);\nrun('ls');\n");
    put('src/sync.ts', "import { execSync as sh } from 'child_process';\nsh(cmd);\n");
    put('src/cjs.js', "const { exec: run } = require('child_process');\nrun(cmd);\n");
    put('src/own.ts', "import { exec as run } from './mine';\nrun(cmd);\n");
    put(
      'src/html.ts',
      "el.insertAdjacentHTML('beforeend', x);\nel.insertAdjacentHTML('beforeend', '<br>');\n",
    );
    put(
      'src/sh.py',
      'import subprocess\nsubprocess.getoutput(x)\nsubprocess.getstatusoutput(x)\n',
    );
    put(
      'src/weak.py',
      [
        'import hashlib',
        'hashlib.new("md5", x)',
        'hashlib.new("SHA1", x)',
        'hashlib.new("sha-1")',
        'hashlib.sha1(x)',
        'hashlib.new("sha256", x)',
        'hashlib.sha1(x, usedforsecurity=False)',
        'hashlib.md5(usedforsecurity=False)',
        'hashlib.new("md5", x, usedforsecurity=False)',
        '',
      ].join('\n'),
    );
    assert.deepEqual(recordedCounts(), {
      'semgrep:js-child-process-shell|src/cjs.js': 1,
      'semgrep:js-child-process-shell|src/esm.ts': 1,
      'semgrep:js-child-process-shell|src/sync.ts': 1,
      'semgrep:js-html-injection|src/html.ts': 1,
      'semgrep:py-shell-true|src/sh.py': 2,
      'semgrep:py-weak-hash|src/weak.py': 4,
    });
  });

  realIt('zizmor', 'zizmor audits a risky workflow and accepts the template config', () => {
    useReal('zizmor');
    put('.github/zizmor.yml', template('zizmor.yml'));
    put(
      '.github/workflows/ci.yml',
      [
        'name: ci',
        'on:',
        '  pull_request_target:',
        'jobs:',
        '  b:',
        '    runs-on: ubuntu-latest',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '      - run: echo "${{ github.event.pull_request.title }}"',
        '',
      ].join('\n'),
    );
    const counts = recordedCounts();
    assert.equal(counts['zizmor:template-injection|.github/workflows/ci.yml'], 1);
    assert.equal(counts['zizmor:dangerous-triggers|.github/workflows/ci.yml'], 1);
    assert.equal(counts['zizmor:unpinned-uses|.github/workflows/ci.yml'], 1);
    assert.equal(g(['check']).status, 0);
    // The commit stage runs it on a changed workflow, and a finding there blocks.
    rmSync(join(state.dir, 'guardrails.baseline.json'));
    assert.equal(g(['check', '--files', '.github/workflows/ci.yml']).status, 1);
  });

  realIt('osv-scanner', 'osv-scanner reports a known advisory (needs network)', (t) => {
    useReal('osv-scanner');
    put('osv-scanner.toml', template('osv-scanner.toml'));
    put(
      'package-lock.json',
      JSON.stringify({
        name: 'x',
        version: '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {
          '': { name: 'x', version: '1.0.0', dependencies: { minimist: '1.2.0' } },
          'node_modules/minimist': {
            version: '1.2.0',
            resolved: 'https://registry.npmjs.org/minimist/-/minimist-1.2.0.tgz',
          },
        },
      }),
    );
    const args = ['scan', 'source', '--format', 'json', '-L', 'package-lock.json'];
    const probe = spawnSync('osv-scanner', args, { cwd: state.dir, encoding: 'utf8' });
    if (probe.status === 127) return t.skip('osv-scanner could not reach the OSV database');
    const counts = recordedCounts();
    assert.ok(
      counts['osv-scanner:GHSA-vh95-rmgr-6w4m|package-lock.json'] >= 1,
      JSON.stringify(counts),
    );
    assert.equal(g(['check']).status, 0);
  });
});
