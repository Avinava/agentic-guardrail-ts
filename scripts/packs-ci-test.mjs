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

// A one-job workflow that runs guardrails.mjs; `env` lines go in the job's env block.
const workflow = (jobs) => {
  const body = Object.entries(jobs)
    .map(
      ([name, env]) =>
        `  ${name}:\n    env:\n${env.map((e) => `      ${e}`).join('\n')}\n    steps:\n      - run: node scripts/guardrails.mjs check --strict-baseline`,
    )
    .join('\n');
  put('.github/workflows/ci.yml', `name: CI\njobs:\n${body}\n`);
};

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
    assert.deepEqual(
      calls('uv').filter((a) => a[1] === 'pytest'),
      [],
    );
  });

  it('prints what was deferred on a local check', () => {
    const r = g(['check']);
    assert.equal(r.status, 0);
    assert.match(r.out, /deferred: pytest-cov \(set GUARDRAILS_CI=1 or run in CI\)/);
  });

  it('--strict-baseline fails while a ci tool is deferred', () => {
    workflow({ python: ['GUARDRAILS_PACKS: python'] });
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
    workflow({ verify: ['GUARDRAILS_CI_PACKS: none'], core: ['GUARDRAILS_PACKS: core'] });
    put('sgconfig.yml', 'ruleDirs: []\n');
    put('.shellcheckrc', 'shell=bash\n');
    put('a.sh', '#!/bin/sh\n');
    fake('ast-grep', { stdout: '' });
    fake('shellcheck', { stdout: '{"comments":[]}' });
    const r = g(['check'], { GUARDRAILS_PACKS: 'core' });
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(calls('shellcheck'), []);
    assert.match(r.out, /pack shell is not run here \(GUARDRAILS_PACKS\): run by verify/);
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

describe('strict mode checks that a CI job owns every ci-stage pack', () => {
  beforeEach(() => {
    put('pyproject.toml', '[tool.coverage.run]\nsource = ["src"]\n');
    coverage(90);
    ci(['baseline', '--init']);
  });

  it('a configured pack that no job selects fails, naming the pack', () => {
    workflow({ verify: ['GUARDRAILS_CI_PACKS: none'] });
    const r = ci(['check', '--strict-baseline']);
    assert.equal(r.status, 1);
    assert.match(r.out, /pack python has ci-stage tools \(pytest-cov\) but no CI job selects it/);
  });

  it('passes when exactly one job selects it', () => {
    workflow({ verify: ['GUARDRAILS_CI_PACKS: none'], python: ['GUARDRAILS_PACKS: python'] });
    assert.equal(ci(['check', '--strict-baseline']).status, 0);
  });

  it('fails when two jobs would run the same expensive tools', () => {
    workflow({ a: ['GUARDRAILS_PACKS: python'], b: [] });
    const r = ci(['check', '--strict-baseline']);
    assert.equal(r.status, 1);
    assert.match(r.out, /would run 2 times, in: a \(.*\), b \(/);
  });

  it('fails when there is no CI workflow at all', () => {
    const r = ci(['check', '--strict-baseline']);
    assert.equal(r.status, 1);
    assert.match(r.out, /no CI job running guardrails\.mjs was found/);
  });

  it('reads GitLab jobs too', () => {
    put(
      '.gitlab-ci.yml',
      'stages: [test]\nverify:\n  variables:\n    GUARDRAILS_CI_PACKS: none\n  script:\n    - node scripts/guardrails.mjs check\npython:\n  variables:\n    GUARDRAILS_PACKS: python\n  script:\n    - node scripts/guardrails.mjs check --strict-baseline\n',
    );
    assert.equal(ci(['check', '--strict-baseline']).status, 0);
  });

  it('ci-jobs prints the same verdict', () => {
    workflow({ verify: ['GUARDRAILS_CI_PACKS: none'] });
    assert.equal(g(['ci-jobs']).status, 1);
    workflow({ verify: ['GUARDRAILS_CI_PACKS: none'], python: ['GUARDRAILS_PACKS: python'] });
    assert.equal(g(['ci-jobs']).status, 0);
  });
});

describe('selections that run nothing', () => {
  it('an empty GUARDRAILS_PACKS is an error', () => {
    assert.match(g(['check'], { GUARDRAILS_PACKS: ',' }).out, /GUARDRAILS_PACKS names no pack/);
  });

  it('under strict, a selected pack with no configured tool fails (its config was removed)', () => {
    workflow({ python: ['GUARDRAILS_PACKS: python'] });
    const r = ci(['check', '--strict-baseline'], { GUARDRAILS_PACKS: 'python' });
    assert.equal(r.status, 1);
    assert.match(r.out, /pack python is selected by GUARDRAILS_PACKS but has no configured tool/);
  });

  it('a pack left out of this job that no job runs fails under strict', () => {
    put('.shellcheckrc', 'shell=bash\n');
    put('a.sh', 'echo hi\n');
    fake('shellcheck', { stdout: '{"comments":[]}' });
    fake('shfmt', { stdout: '' });
    workflow({ ts: ['GUARDRAILS_PACKS: ts'] });
    const r = g(['check', '--strict-baseline'], { GUARDRAILS_PACKS: 'ts' });
    assert.equal(r.status, 1);
    assert.match(r.out, /pack shell is not run here.*no CI job selects it/);
    assert.match(r.out, /pack shell is configured but no CI job runs it/);
  });
});

describe('fix commands name the ci stage and pack', () => {
  const pio = (defects) => fake('pio', { stdout: JSON.stringify([{ tool: 'cppcheck', defects }]) });
  const defect = {
    id: 'nullPointer',
    severity: 'high',
    file: 'src/main.cpp',
    line: 7,
    message: 'm',
  };

  beforeEach(() => {
    put('platformio.ini', '[env:uno]\ncheck_tool = cppcheck\n');
    put('src/main.cpp', 'int main(){}\n');
    pio([defect]);
    workflow({ verify: ['GUARDRAILS_CI_PACKS: none'], cpp: ['GUARDRAILS_PACKS: cpp'] });
    ci(['baseline', '--init']);
  });

  it('a stale ci-stage key points at the CI-stage command for its pack', () => {
    pio([]);
    const r = ci(['check', '--strict-baseline']);
    assert.equal(r.status, 1);
    assert.match(
      r.out,
      /Run: GUARDRAILS_CI=1 GUARDRAILS_PACKS=cpp node scripts\/guardrails\.mjs baseline --tighten/,
    );
  });

  it('a local tighten that could not touch ci-stage tools says so instead of "tightened"', () => {
    const r = g(['baseline', '--tighten']);
    assert.match(r.out, /baseline unchanged: pio-check did not run here/);
    assert.match(
      r.out,
      /GUARDRAILS_CI=1 GUARDRAILS_PACKS=cpp node scripts\/guardrails\.mjs baseline --tighten/,
    );
    assert.doesNotMatch(r.out, /baseline tightened/);
  });

  it('an unrecorded ci metric under strict names the ci command', () => {
    put('pyproject.toml', '[tool.coverage.run]\nsource = ["src"]\n');
    coverage(90);
    workflow({
      verify: ['GUARDRAILS_CI_PACKS: none'],
      cpp: ['GUARDRAILS_PACKS: cpp'],
      py: ['GUARDRAILS_PACKS: python'],
    });
    const r = ci(['check', '--strict-baseline']);
    assert.match(
      r.out,
      /python-coverage is not recorded. Run: GUARDRAILS_CI=1 GUARDRAILS_PACKS=python node/,
    );
  });
});

describe('pre-push never runs the ci stage', () => {
  it('verify ignores a CI variable exported on the machine', () => {
    put('pyproject.toml', '[tool.coverage.run]\nsource = ["src"]\n');
    coverage(90);
    g(['verify'], { CI: 'true' });
    g(['verify'], { GUARDRAILS_CI: '1' });
    assert.deepEqual(
      calls('uv').filter((a) => a[1] === 'pytest'),
      [],
    );
  });
});

// The workflow a multi-stack repo gets: the base ci.yml plus each pack's job fragment.
describe('generated CI workflow', () => {
  const stacks = ['python', 'mule', 'salesforce', 'dart', 'cpp'];
  const configure = () => {
    put('pyproject.toml', '[tool.coverage.run]\nsource = ["src"]\n');
    put('pom.xml', '<project><artifactId>munit-maven-plugin</artifactId></project>\n');
    put('guardrails/apex-coverage.json', '{"targetOrg":"ci-scratch"}\n');
    put('.mulelintrc.json', '{}\n');
    put('analysis_options.yaml', 'include: x\n');
    put('platformio.ini', '[env:uno]\ncheck_tool = cppcheck\n');
  };
  const generate = (packs) => {
    const base = readFileSync(join(REPO, 'templates/ci/ci.yml'), 'utf8');
    const jobs = packs.map((p) => readFileSync(join(REPO, `templates/packs/${p}/ci.yml`), 'utf8'));
    put('.github/workflows/ci.yml', `${base.trimEnd()}\n${jobs.join('\n')}`);
  };

  it('every pack with ci-stage tools is owned by exactly one job, never the base job', () => {
    configure();
    generate(stacks);
    const r = g(['ci-jobs']);
    assert.equal(r.status, 0, r.out);
    const owners = (pack) =>
      r.out.split('\n').filter((l) => new RegExp(`ci-stage tools of [^;]*\\b${pack}\\b`).test(l));
    for (const pack of stacks) assert.equal(owners(pack).length, 1, `${pack}: ${owners(pack)}`);
    assert.match(r.out, / verify: runs [^;]*; ci-stage tools of no pack/);
  });

  it('dropping a pack job is caught', () => {
    configure();
    generate(stacks.filter((p) => p !== 'salesforce'));
    const r = g(['ci-jobs']);
    assert.equal(r.status, 1);
    assert.match(
      r.out,
      /pack salesforce has ci-stage tools \(apex-coverage\) but no CI job selects it/,
    );
  });
});
