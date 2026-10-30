#!/usr/bin/env node
// packs-python-test.mjs: the python pack against fake tools (every tool runs through `uv run`).
//
//   node --test scripts/packs-python-test.mjs

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  baselineFile,
  calls,
  fake,
  g,
  ci,
  postEdit,
  put,
  recordedCounts,
  setup,
  state,
  teardown,
} from './pack-harness.mjs';

const full = () => {
  put(
    'pyproject.toml',
    [
      '[project]\nname = "acme"\n',
      '[tool.ruff]\nline-length = 100\n',
      '[tool.pyright]\ninclude = ["src"]\n',
      '[tool.deptry]\n',
      '[tool.vulture]\nmin_confidence = 60\n',
      '[tool.coverage.run]\nsource = ["src"]\n',
    ].join('\n'),
  );
  put('tach.toml', 'source_roots = ["src"]\n');
  put('src/acme/core/service.py', 'import yaml\n');
  fake('ruff-format', { stdout: '', status: 0 });
  fake('pytest', {
    writes: [{ prefix: '--cov-report=json:', content: { totals: { percent_covered: 90 } } }],
  });
  fake('ruff', {
    stdout: JSON.stringify([
      {
        code: 'F401',
        filename: join(state.dir, 'src/acme/core/service.py'),
        location: { row: 1 },
        message: 'unused',
      },
    ]),
    status: 1,
  });
  fake('pyright', {
    stdout: JSON.stringify({
      generalDiagnostics: [
        {
          file: join(state.dir, 'src/acme/core/service.py'),
          severity: 'error',
          message: 'Type "int" is not assignable to "str"',
          rule: 'reportAssignmentType',
          range: { start: { line: 4 } },
        },
        {
          file: 'x.py',
          severity: 'information',
          message: 'skipped',
          range: { start: { line: 0 } },
        },
      ],
    }),
    status: 1,
  });
  fake('tach', {
    stdout: JSON.stringify([
      {
        Located: {
          file_path: 'src/acme/core/bad.py',
          line_number: 1,
          details: {
            Code: {
              UndeclaredDependency: { usage_module: 'acme.core', definition_module: 'acme.api' },
            },
          },
        },
      },
    ]),
    status: 1,
  });
  fake('deptry', {
    status: 1,
    writes: [
      {
        flag: '--json-output',
        content: [
          {
            error: { code: 'DEP001', message: 'yaml missing' },
            location: { file: 'src/acme/core/service.py', line: 1 },
          },
        ],
      },
    ],
  });
  fake('vulture', {
    stdout:
      "src/acme/core/service.py:1: unused import 'yaml' (90% confidence)\nsrc/acme/core/service.py:3: unused function 'unused_fn' (60% confidence)\n",
    status: 3,
  });
};

beforeEach(setup);
afterEach(teardown);

describe('python pack', () => {
  beforeEach(full);

  it('keys each tool tool:rule|file and runs it through uv run', () => {
    assert.deepEqual(recordedCounts(), {
      'deptry:DEP001|src/acme/core/service.py': 1,
      'pyright:reportAssignmentType|src/acme/core/service.py': 1,
      'ruff:F401|src/acme/core/service.py': 1,
      'tach:UndeclaredDependency|src/acme/core/bad.py': 1,
      'vulture:unused-function|src/acme/core/service.py': 1,
    });
    for (const tool of ['ruff', 'pyright', 'tach', 'deptry', 'vulture']) {
      assert.ok(
        calls('uv').some((a) => a[0] === 'run' && a[1] === tool),
        tool,
      );
    }
  });

  it('runs only ruff on a scoped check, on the given files', () => {
    fake('ruff-format', { stdout: '', status: 0 });
    const r = g(['check', '--files', 'src/acme/core/service.py']);
    assert.equal(r.status, 1);
    assert.match(r.out, /ruff F401/);
    assert.doesNotMatch(r.out, /tach|deptry|vulture/);
    assert.deepEqual(
      calls('uv')
        .find((a) => a[1] === 'ruff')
        .slice(-1),
      ['src/acme/core/service.py'],
    );
  });

  it('checks formatting on commit but not in the edit hook', () => {
    fake('ruff', { stdout: '[]' });
    fake('ruff-format', { stdout: 'Would reformat: src/acme/core/service.py\n', status: 1 });
    const r = g(['check', '--files', 'src/acme/core/service.py']);
    assert.equal(r.status, 1);
    assert.match(r.out, /ruff-format format/);
    assert.equal(postEdit('src/acme/core/service.py').status, 0);
  });
});

describe('python coverage floor', () => {
  const cov = (percent) =>
    fake('pytest', {
      writes: [{ prefix: '--cov-report=json:', content: { totals: { percent_covered: percent } } }],
    });

  beforeEach(() => put('pyproject.toml', '[tool.coverage.run]\nsource = ["src"]\n'));

  it('records the floor and fails when coverage drops', () => {
    cov(82.5);
    assert.equal(ci(['baseline', '--init']).status, 0);
    assert.equal(baselineFile().metrics['python-coverage'], 82.5);
    cov(80);
    const r = ci(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /python-coverage 80% is below the baseline 82\.5%/);
  });

  it('only tightens upward', () => {
    cov(82.5);
    ci(['baseline', '--init']);
    cov(80);
    assert.equal(ci(['baseline', '--tighten']).status, 1);
    cov(90);
    assert.equal(ci(['check', '--strict-baseline']).status, 1);
    assert.equal(ci(['baseline', '--tighten']).status, 0);
    assert.equal(baselineFile().metrics['python-coverage'], 90);
  });
});

describe('python pack, review fixes', () => {
  beforeEach(() => {
    put('pyproject.toml', '[tool.coverage.run]\nsource = ["src"]\n');
    put('tests/test_a.py', 'def test_a():\n    assert True\n');
  });

  const cov = (percent, status = 0) =>
    fake('pytest', {
      stdout: status === 0 ? '1 passed' : 'FAILED tests/test_a.py::test_a',
      status,
      writes: [{ prefix: '--cov-report=json:', content: { totals: { percent_covered: percent } } }],
    });

  it('failing tests fail the gate even though pytest still writes a coverage report', () => {
    cov(95, 1);
    const r = ci(['baseline', '--init']);
    assert.equal(r.status, 1);
    assert.match(r.out, /pytest failed \(exit 1\)/);
    assert.match(r.out, /FAILED tests\/test_a\.py::test_a/);
  });

  it('the test suite runs only when GUARDRAILS_CI=1, and once per run', () => {
    cov(90);
    g(['check']);
    g(['check', '--files', 'tests/test_a.py']);
    assert.deepEqual(calls('pytest'), []);
    ci(['baseline', '--init']);
    assert.equal(calls('uv').filter((a) => a[1] === 'pytest').length, 1);
  });

  it('a local check leaves a CI-recorded coverage floor alone', () => {
    cov(90);
    ci(['baseline', '--init']);
    assert.equal(g(['check']).status, 0);
    assert.equal(g(['baseline', '--tighten']).status, 0);
    assert.equal(baselineFile().metrics['python-coverage'], 90);
  });
});

describe('vulture and ruff overlap', () => {
  it('exit 3 whose only lines are unused imports (owned by ruff) is clean', () => {
    put(
      'pyproject.toml',
      '[tool.ruff]\nline-length = 100\n\n[tool.vulture]\nmin_confidence = 60\n',
    );
    put('src/acme/a.py', 'import yaml\n');
    fake('ruff', { stdout: '[]' });
    fake('ruff-format', { stdout: '' });
    fake('vulture', {
      stdout: "src/acme/a.py:1: unused import 'yaml' (90% confidence)\n",
      status: 3,
    });
    assert.equal(g(['check']).status, 0);
  });

  it('exit 3 with output it cannot read is still a failure', () => {
    put('pyproject.toml', '[tool.vulture]\nmin_confidence = 60\n');
    fake('vulture', { stdout: 'something new\n', status: 3 });
    assert.match(g(['check']).out, /vulture found dead code but printed nothing readable/);
  });
});
