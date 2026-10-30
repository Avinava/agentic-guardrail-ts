#!/usr/bin/env node
// packs-core-test.mjs: tests for the engine, the ts pack and the core pack, against fake tools.
//
//   node --test scripts/packs-core-test.mjs

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  baselineFile,
  calls,
  fake,
  g,
  postEdit,
  put,
  recordedCounts,
  setup,
  state,
  teardown,
} from './pack-harness.mjs';

beforeEach(setup);
afterEach(teardown);

describe('engine', () => {
  it('costs nothing without config files', () => {
    put('docs/a.md', '# hi\n');
    put('src/x.py', 'x = 1\n');
    const r = g(['check', '--files', 'docs/a.md', 'src/x.py', 'src/a.ts']);
    assert.equal(r.status, 0, r.out);
    for (const tool of ['ast-grep', 'ls-lint', 'cspell', 'markdownlint-cli2', 'lychee', 'uv']) {
      assert.deepEqual(calls(tool), [], tool);
    }
  });

  it('runs without a package.json (non-Node repos)', () => {
    rmSync(join(state.dir, 'package.json'));
    put('sgconfig.yml', 'ruleDirs: []\n');
    fake('ast-grep', { stdout: '' });
    assert.equal(g(['check', '--files', 'src/a.ts']).status, 0);
  });

  it('packs lists detected stacks and which tools are on', () => {
    put('sgconfig.yml', 'ruleDirs: []\n');
    const r = g(['packs']);
    assert.match(r.out, /^ts: detected/m);
    assert.match(r.out, /^core: always/m);
    assert.match(r.out, /on {2}ast-grep/);
    assert.match(r.out, /off cspell/);
  });
});

describe('ts pack', () => {
  it('keys oxlint findings tool:rule|file and ratchets them', () => {
    fake('oxlint', {
      stdout: JSON.stringify({
        diagnostics: [
          { code: 'eslint(eqeqeq)', filename: join(state.dir, 'src/a.ts'), message: 'use ===' },
        ],
      }),
      status: 1,
    });
    assert.equal(g(['check']).status, 1);
    assert.deepEqual(recordedCounts(), { 'oxlint:eslint(eqeqeq)|src/a.ts': 1 });
    assert.equal(g(['check', '--strict-baseline']).status, 0);
  });

  it('flags a bare disable comment without calling a tool', () => {
    put('src/b.ts', '// oxlint-disable-next-line no-console\nconsole.log(1);\n');
    const r = g(['check', '--files', 'src/b.ts']);
    assert.equal(r.status, 1);
    assert.match(r.out, /disable-needs-rule-and-reason/);
  });

  it('runs knip on full checks only', () => {
    put('node_modules/.bin/knip', '#!/bin/sh\necho \'{"issues":[]}\'\n');
    g(['check', '--files', 'src/a.ts']);
    assert.deepEqual(calls('knip'), []);
  });
});

describe('ast-grep', () => {
  const diag = (ruleId, line) =>
    JSON.stringify({
      ruleId,
      file: 'src/a.ts',
      message: `${ruleId} hit`,
      range: { start: { line } },
    });

  beforeEach(() => {
    put('sgconfig.yml', 'ruleDirs:\n  - rules\n');
    fake('ast-grep', {
      stdout: `${diag('no-vocab-literal', 0)}\n${diag('no-banned-identifier', 1)}\n`,
      stderr: 'Error: 2 error(s) found in code.\n',
      status: 1,
    });
  });

  it('keys findings ast-grep:<rule-id>|file and reports 1-based lines', () => {
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /src\/a\.ts:1 {2}ast-grep no-vocab-literal/);
    assert.match(r.out, /src\/a\.ts:2 {2}ast-grep no-banned-identifier/);
    assert.deepEqual(recordedCounts(), {
      'ast-grep:no-banned-identifier|src/a.ts': 1,
      'ast-grep:no-vocab-literal|src/a.ts': 1,
    });
    assert.equal(g(['check']).status, 0);
  });

  it('scans only the given files and runs from the post-edit hook', () => {
    g(['check', '--files', 'src/a.ts']);
    assert.deepEqual(calls('ast-grep').at(-1), ['scan', '--json=stream', 'src/a.ts']);
    const r = postEdit('src/a.ts');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /ast-grep no-vocab-literal/);
  });

  it('fails loudly when the tool crashes', () => {
    fake('ast-grep', { stdout: '', stderr: 'boom', status: 2 });
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /ast-grep failed \(exit 2\)/);
  });
});

describe('ls-lint', () => {
  beforeEach(() => {
    put('.ls-lint.yml', 'ls:\n  src:\n    .dir: kebab-case\n');
    fake('ls-lint', {
      stderr:
        '{"src/Bad_Dir":{".dir":["kebabcase"]},"src/ok/Bad_File.ts":{".ts":["kebabcase"]},"src/ok":{".spec.ts":["exists:0 (found 2)"]}}',
      status: 1,
    });
  });

  it('keys findings by extension and rule; a banned extension counts per file', () => {
    assert.deepEqual(recordedCounts(), {
      'ls-lint:dir-kebabcase|src/Bad_Dir': 1,
      'ls-lint:spec.ts-exists:0|src/ok': 2,
      'ls-lint:ts-kebabcase|src/ok/Bad_File.ts': 1,
    });
  });

  it('a scoped run only reports the files in scope', () => {
    assert.equal(g(['check', '--files', 'src/a.ts']).status, 0);
  });
});

describe('cspell', () => {
  beforeEach(() => {
    put('cspell.json', '{"version":"0.2"}\n');
    put('docs/a.md', '# hi\n');
    fake('cspell', {
      stdout:
        'src/a.ts:1:14 - Forbidden word (utilize)\ndocs/a.md:3:2 - Unknown word (recieve) fix: (receive)\n',
      status: 1,
    });
  });

  it('flags forbidden and unknown words in code and docs', () => {
    assert.deepEqual(recordedCounts(), {
      'cspell:forbidden-word|src/a.ts': 1,
      'cspell:unknown-word|docs/a.md': 1,
    });
  });

  it('passes the changed docs and code to cspell', () => {
    g(['check', '--files', 'docs/a.md', 'src/a.ts']);
    assert.deepEqual(calls('cspell').at(-1).slice(-2), ['docs/a.md', 'src/a.ts']);
  });
});

describe('markdownlint and lychee', () => {
  beforeEach(() => {
    put('.markdownlint-cli2.jsonc', '{"config":{"default":true}}\n');
    put('lychee.toml', 'max_retries = 2\n');
    put('docs/a.md', '# hi\n');
    fake('markdownlint-cli2', {
      stderr: 'docs/a.md:7 error MD022/blanks-around-headings Headings should be surrounded\n',
      status: 1,
    });
    fake('lychee', {
      stdout: JSON.stringify({
        error_map: {
          'docs/a.md': [
            { url: 'file:///x/missing.md', status: { text: 'File not found' }, span: { line: 3 } },
          ],
        },
        timeout_map: {
          'docs/a.md': [{ url: 'https://slow.example', status: { text: 'Timeout' } }],
        },
      }),
      status: 2,
    });
  });

  it('keys markdownlint:MDxxx and lychee:broken-link; timeouts are not findings', () => {
    assert.deepEqual(recordedCounts(), {
      'lychee:broken-link|docs/a.md': 1,
      'markdownlint:MD022|docs/a.md': 1,
    });
  });

  it('runs lychee offline unless GUARDRAILS_ONLINE=1', () => {
    g(['check', '--files', 'docs/a.md']);
    assert.ok(calls('lychee').at(-1).includes('--offline'));
    g(['check', '--files', 'docs/a.md'], { GUARDRAILS_ONLINE: '1' });
    assert.ok(!calls('lychee').at(-1).includes('--offline'));
  });

  it('does not run the link checker from the edit hook', () => {
    postEdit('docs/a.md');
    assert.deepEqual(calls('lychee'), []);
  });
});

describe('jscpd percentage ratchet', () => {
  const report = (percentage) => ({
    statistics: { total: { percentage } },
    duplicates: [
      { lines: 11, firstFile: { name: 'a.ts', start: 1 }, secondFile: { name: 'b.ts', start: 1 } },
    ],
  });
  const measure = (percentage) =>
    fake('jscpd', {
      writes: [{ flag: '--output', join: 'jscpd-report.json', content: report(percentage) }],
    });

  beforeEach(() => put('.jscpd.json', '{"path":["src"]}\n'));

  it('records the percentage and fails only when it grows', () => {
    measure(4.1);
    assert.equal(g(['baseline', '--init']).status, 0);
    assert.equal(baselineFile().metrics.duplication, 4.1);
    assert.equal(g(['check']).status, 0);
    measure(5.3);
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /duplication 5\.3% is above the baseline 4\.1%/);
    assert.match(r.out, /a\.ts:1 = b\.ts:1 \(11 lines\)/);
  });

  it('refuses to tighten upward, tightens down, and flags a stale value in strict mode', () => {
    measure(4.1);
    g(['baseline', '--init']);
    measure(5.3);
    assert.equal(g(['baseline', '--tighten']).status, 1);
    assert.equal(baselineFile().metrics.duplication, 4.1);
    measure(2.5);
    assert.equal(g(['check']).status, 0);
    assert.equal(g(['check', '--strict-baseline']).status, 1);
    assert.equal(g(['baseline', '--tighten']).status, 0);
    assert.equal(baselineFile().metrics.duplication, 2.5);
    assert.equal(g(['check', '--strict-baseline']).status, 0);
  });

  it('never runs on scoped checks or hooks', () => {
    measure(9);
    g(['check', '--files', 'src/a.ts']);
    postEdit('src/a.ts');
    assert.deepEqual(calls('jscpd'), []);
  });

  it('is off without .jscpd.json', () => {
    rmSync(join(state.dir, '.jscpd.json'));
    g(['baseline', '--init']);
    assert.equal(baselineFile().metrics, undefined);
  });
});

describe('editorconfig-checker', () => {
  it('keys findings by the problem found', () => {
    put('.ecrc', '{}\n');
    put('docs/a.md', '# hi\n');
    fake('editorconfig-checker', {
      stdout:
        'docs/a.md:0:0: error: final newline expected\ndocs/a.md:1:0: error: trailing whitespace\n\n2 errors found\n',
      status: 1,
    });
    assert.deepEqual(recordedCounts(), {
      'editorconfig-checker:final-newline-expected|docs/a.md': 1,
      'editorconfig-checker:trailing-whitespace|docs/a.md': 1,
    });
  });
});

describe('actionlint', () => {
  beforeEach(() => {
    put('.github/actionlint.yaml', 'self-hosted-runner:\n  labels: []\n');
    put('.github/workflows/ci.yml', 'name: CI\n');
    fake('actionlint', {
      stdout: JSON.stringify([
        {
          message: 'unknown key',
          filepath: '.github/workflows/ci.yml',
          line: 3,
          column: 1,
          kind: 'syntax-check',
        },
      ]),
      status: 1,
    });
  });

  it('keys workflow findings by actionlint rule kind', () => {
    assert.deepEqual(recordedCounts(), { 'actionlint:syntax-check|.github/workflows/ci.yml': 1 });
  });

  it('only checks workflow files when scoped', () => {
    g(['check', '--files', 'src/a.ts']);
    assert.deepEqual(calls('actionlint'), []);
    g(['check', '--files', '.github/workflows/ci.yml']);
    assert.deepEqual(calls('actionlint').at(-1).slice(-1), ['.github/workflows/ci.yml']);
  });
});

describe('verify without package scripts', () => {
  it('runs the check itself in a repo that has no lint script', () => {
    put('sgconfig.yml', 'ruleDirs: []\n');
    fake('ast-grep', {
      stdout: JSON.stringify({
        ruleId: 'r',
        file: 'src/a.ts',
        message: 'm',
        range: { start: { line: 0 } },
      }),
      status: 1,
    });
    const r = g(['verify']);
    assert.equal(r.status, 1);
    assert.match(r.out, /ast-grep r/);
  });
});

describe('metric readings are validated', () => {
  const measure = (statistics) =>
    fake('jscpd', {
      writes: [
        { flag: '--output', join: 'jscpd-report.json', content: { statistics, duplicates: [] } },
      ],
    });

  beforeEach(() => put('.jscpd.json', '{"path":["src"]}\n'));

  it('a missing reading fails the check and cannot erase the stored ratchet', () => {
    measure({ total: { percentage: 4.1 } });
    g(['baseline', '--init']);
    measure({ total: {} });
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /duplication reading is missing or not a number/);
    assert.equal(g(['baseline', '--tighten']).status, 1);
    assert.equal(baselineFile().metrics.duplication, 4.1);
  });

  it('a recorded metric that nothing measures fails instead of being skipped', () => {
    measure({ total: { percentage: 4.1 } });
    g(['baseline', '--init']);
    rmSync(join(state.dir, '.jscpd.json'));
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /duplication is recorded in the baseline but was not measured/);
  });

  it('tighten never drops a stored metric that was not measured', () => {
    measure({ total: { percentage: 4.1 } });
    g(['baseline', '--init']);
    rmSync(join(state.dir, '.jscpd.json'));
    g(['baseline', '--tighten']);
    assert.equal(baselineFile().metrics.duplication, 4.1);
  });
});

describe('lychee exit handling', () => {
  beforeEach(() => {
    put('lychee.toml', 'max_retries = 2\n');
    put('docs/a.md', '# hi\n');
  });

  it('exit 2 with a report that lists no failed link is a failure, not a pass', () => {
    fake('lychee', { stdout: JSON.stringify({ error_map: {}, timeout_map: {} }), status: 2 });
    assert.match(g(['check']).out, /lychee exited 2 but its report lists no failed link/);
  });

  it('a report without error_map (a renamed field) is a failure', () => {
    fake('lychee', { stdout: JSON.stringify({ errors: { 'docs/a.md': [] } }), status: 2 });
    assert.match(g(['check']).out, /no error_map/);
  });

  it('exit 1 (a runtime or config error) is a failure', () => {
    fake('lychee', { stderr: 'bad config', status: 1 });
    assert.match(g(['check']).out, /lychee failed \(exit 1\)/);
  });

  it('timeouts alone do not fail the gate', () => {
    fake('lychee', {
      stdout: JSON.stringify({
        error_map: {},
        timeout_map: { 'docs/a.md': [{ url: 'https://slow' }] },
      }),
      status: 2,
    });
    assert.equal(g(['check']).status, 0);
  });
});

describe('v3 installs keep their checks', () => {
  const knipHit = JSON.stringify({ issues: [{ file: 'src/a.ts', files: [{ name: 'src/a.ts' }] }] });

  it('runs Knip for every supported config name and for a knip devDependency', () => {
    fake('knip', { stdout: knipHit, status: 1 });
    const variants = [
      ['knip.json', '{}'],
      ['knip.jsonc', '{}'],
      ['.knip.json', '{}'],
      ['knip.ts', 'export default {};'],
      ['package.json', '{"name":"x","devDependencies":{"knip":"^6.0.0"}}'],
    ];
    for (const [file, text] of variants) {
      const before = calls('knip').length;
      put(file, text);
      assert.equal(g(['check']).status, 1, file);
      assert.ok(calls('knip').length > before, `${file} did not run knip`);
      rmSync(join(state.dir, file));
      put('package.json', '{"name":"fixture"}\n');
    }
  });

  it('runs Oxlint for other config names and for an oxlint devDependency', () => {
    rmSync(join(state.dir, '.oxlintrc.json'));
    const variants = [
      ['.oxlintrc.jsonc', '{}'],
      ['oxlint.config.ts', 'export default {};'],
      ['package.json', '{"name":"x","devDependencies":{"oxlint":"^1.0.0"}}'],
    ];
    for (const [file, text] of variants) {
      const before = calls('oxlint').length;
      put(file, text);
      g(['check', '--files', 'src/a.ts']);
      assert.ok(calls('oxlint').length > before, `${file} did not run oxlint`);
      rmSync(join(state.dir, file));
      put('package.json', '{"name":"fixture"}\n');
    }
  });

  it('treats any dependency-cruiser exit code with a JSON report as findings', () => {
    put('.dependency-cruiser.mjs', 'export default {};\n');
    const violation = (rule) => ({ rule: { name: rule }, from: 'src/a.ts', to: 'src/b.ts' });
    fake('depcruise', {
      stdout: JSON.stringify({
        summary: {
          violations: [violation('no-circular'), violation('layer-domain'), violation('x')],
        },
      }),
      status: 3,
    });
    assert.deepEqual(recordedCounts(), {
      'depcruise:layer-domain|src/a.ts': 1,
      'depcruise:no-circular|src/a.ts': 1,
      'depcruise:x|src/a.ts': 1,
    });
  });
});

describe('keys and arguments', () => {
  it('scopes findings whose rule contains a pipe (an ls-lint regex)', () => {
    put('.ls-lint.yml', 'ls: {}\n');
    put('src/x.ts', 'export {};\n');
    fake('ls-lint', {
      stderr: '{"src/x.ts":{".ts":["regex:(a|b)"]}}',
      status: 1,
    });
    const r = g(['check', '--files', 'src/x.ts']);
    assert.equal(r.status, 1);
    assert.match(r.out, /ls-lint ts-regex:\(a\|b\)/);
    assert.equal(g(['check', '--files', 'src/a.ts']).status, 0);
  });

  it('never lets a file name be read as an option', () => {
    put('cspell.json', '{}\n');
    put('--config=x.md', '# hi\n');
    fake('cspell', { stdout: '', status: 0 });
    g(['check', '--files', '--config=x.md']);
    const args = calls('cspell').at(-1);
    assert.ok(args.includes('./--config=x.md'), JSON.stringify(args));
    assert.ok(!args.includes('--config=x.md'));
  });
});
