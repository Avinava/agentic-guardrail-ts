#!/usr/bin/env node
// packs-ci-test.mjs: the ci stage, pack selection and the CI workflow templates.
//
//   node --test scripts/packs-ci-test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  baselineFile,
  calls,
  ci,
  fake,
  g,
  put,
  recordedCounts,
  setup,
  state,
  teardown,
} from './pack-harness.mjs';

const REPO = join(import.meta.dirname, '..');
const { PACKS } = await import(join(REPO, 'templates/shared/scripts/guardrails-packs.mjs'));

beforeEach(setup);
afterEach(teardown);

const coverage = (percent, status = 0) =>
  fake('pytest', {
    stdout: status === 0 ? '1 passed' : 'FAILED',
    status,
    writes: [{ prefix: '--cov-report=json:', content: { totals: { percent_covered: percent } } }],
  });

describe('the ci stage is never silently skipped', () => {
  beforeEach(() => {
    put('pyproject.toml', '[tool.coverage.run]\nsource = ["src"]\n');
    coverage(90);
  });

  it('turns on with the standard CI variable, not only GUARDRAILS_CI=1', () => {
    assert.equal(g(['baseline', '--init'], { CI: 'true' }).status, 0);
    assert.equal(baselineFile().metrics['python-coverage'], 90);
    assert.equal(calls('uv').filter((a) => a[1] === 'pytest').length, 1);
  });

  it('GUARDRAILS_CI=0 forces it off even in CI', () => {
    g(['check'], { CI: 'true', GUARDRAILS_CI: '0' });
    assert.deepEqual(calls('pytest'), []);
  });

  it('prints what was deferred on a local check', () => {
    const r = g(['check']);
    assert.equal(r.status, 0);
    assert.match(r.out, /deferred: pytest-cov \(set GUARDRAILS_CI=1 or run in CI\)/);
  });

  it('--strict-baseline fails while a ci tool is deferred', () => {
    ci(['baseline', '--init']);
    const r = g(['check', '--strict-baseline']);
    assert.equal(r.status, 1);
    assert.match(r.out, /cannot pass with deferred: pytest-cov/);
    assert.equal(ci(['check', '--strict-baseline']).status, 0);
  });
});

describe('ci-stage findings are carried over locally', () => {
  beforeEach(() => {
    put('platformio.ini', '[env:uno]\ncheck_tool = cppcheck\n');
    fake('pio', {
      stdout: JSON.stringify([
        {
          tool: 'cppcheck',
          defects: [
            { id: 'nullPointer', severity: 'high', file: 'src/main.cpp', line: 7, message: 'm' },
          ],
        },
      ]),
    });
    put('src/main.cpp', 'int main(){}\n');
  });

  it('a local tighten or reset keeps them, and a local check does not call them stale', () => {
    const key = 'pio-check:cppcheck.nullPointer|src/main.cpp';
    assert.equal(recordedCounts({ GUARDRAILS_CI: '1' })[key], 1);
    assert.doesNotMatch(g(['check']).out, /improved/);
    g(['baseline', '--tighten']);
    assert.equal(baselineFile().counts[key], 1);
    g(['baseline', '--reset']);
    assert.equal(baselineFile().counts[key], 1);
  });
});

describe('a metric whose tool stopped applying', () => {
  it('names a --reset that can remove it, and the reset drops it', () => {
    put('analysis_options.yaml', 'include: x\n');
    put('pubspec.yaml', 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n');
    put('coverage/lcov.info', 'LF:10\nLH:9\n');
    fake('flutter-test', { stdout: 'ok', status: 0 });
    fake('flutter-analyze', { stdout: 'No issues found!\n' });
    fake('dart-format', { stdout: '' });
    ci(['baseline', '--init']);
    assert.equal(baselineFile().metrics['flutter-coverage'], 90);
    put('pubspec.yaml', 'name: app\n');
    fake('dart-analyze', { stdout: '' });
    const r = ci(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /GUARDRAILS_CI=1 node scripts\/guardrails\.mjs baseline --reset/);
    ci(['baseline', '--reset']);
    assert.equal(baselineFile().metrics, undefined);
  });
});

describe('an invalid stored metric', () => {
  beforeEach(() => {
    put('.jscpd.json', '{"path":["src"]}\n');
    fake('jscpd', {
      writes: [
        {
          flag: '--output',
          join: 'jscpd-report.json',
          content: { statistics: { total: { percentage: 9 } }, duplicates: [] },
        },
      ],
    });
    put(
      'guardrails.baseline.json',
      JSON.stringify({ version: 1, counts: {}, metrics: { duplication: null } }),
    );
  });

  it('fails the check instead of reading as "unrecorded"', () => {
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /duplication has an invalid stored value \(null\)/);
  });

  it('tighten says the stored value was invalid and records the reading explicitly', () => {
    const r = g(['baseline', '--tighten']);
    assert.match(r.out, /stored duplication was invalid/);
    assert.equal(baselineFile().metrics.duplication, 9);
  });
});

describe('pack selection', () => {
  it('rejects an unknown pack name', () => {
    assert.match(g(['check'], { GUARDRAILS_PACKS: 'core,nope' }).out, /unknown pack\(s\): nope/);
  });

  it('runs only the selected packs and says which it left to other jobs', () => {
    put('sgconfig.yml', 'ruleDirs: []\n');
    put('.shellcheckrc', 'shell=bash\n');
    put('a.sh', '#!/bin/sh\n');
    fake('ast-grep', { stdout: '' });
    fake('shellcheck', { stdout: '{"comments":[]}' });
    const r = g(['check'], { GUARDRAILS_PACKS: 'core' });
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(calls('shellcheck'), []);
    assert.match(r.out, /packs left to other jobs \(GUARDRAILS_PACKS\): .*shell/);
  });

  it("does not report another job's baseline entries as stale", () => {
    put('.shellcheckrc', 'shell=bash\n');
    put('a.sh', 'echo $1\n');
    fake('shellcheck', {
      stdout: JSON.stringify({ comments: [{ file: 'a.sh', line: 1, code: 2086, message: 'm' }] }),
      status: 1,
    });
    fake('shfmt', { stdout: '' });
    g(['baseline', '--init']);
    assert.doesNotMatch(g(['check'], { GUARDRAILS_PACKS: 'ts' }).out, /improved/);
    g(['baseline', '--tighten'], { GUARDRAILS_PACKS: 'ts' });
    assert.equal(baselineFile().counts['shellcheck:SC2086|a.sh'], 1);
  });
});

// The workflow set a multi-stack repo gets: the base ci.yml plus each pack's ci.yml job.
describe('CI templates', () => {
  const packsOf = (text) => {
    const m = /GUARDRAILS_PACKS:\s*([\w,\s]+)$/m.exec(text);
    return m ? m[1].split(',').map((s) => s.trim()) : PACKS.map((p) => p.id);
  };
  const jobs = {
    verify: readFileSync(join(REPO, 'templates/ci/ci.yml'), 'utf8').split('\n  secrets:')[0],
  };
  for (const pack of ['python', 'mule', 'salesforce', 'rust', 'dart', 'cpp']) {
    jobs[pack] = readFileSync(join(REPO, `templates/packs/${pack}/ci.yml`), 'utf8');
  }

  it('every ci-stage tool is selected by exactly one job, never by the base job', () => {
    const ciPacks = new Set(
      PACKS.filter((p) => p.tools.some((t) => t.stages.includes('ci'))).map((p) => p.id),
    );
    assert.ok(ciPacks.size >= 5);
    const selected = Object.fromEntries(
      Object.entries(jobs).map(([name, text]) => [name, packsOf(text)]),
    );
    for (const pack of ciPacks) {
      const owners = Object.entries(selected)
        .filter(([, packs]) => packs.includes(pack))
        .map(([n]) => n);
      assert.deepEqual(owners, [pack], `${pack} ci tools run in: ${owners.join(', ')}`);
    }
    assert.ok(!selected.verify.some((p) => ciPacks.has(p)));
  });
});
