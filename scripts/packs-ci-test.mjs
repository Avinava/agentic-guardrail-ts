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
    writes: [
      {
        prefix: '--cov-report=json:',
        content: { totals: { percent_covered: percent, num_statements: 10 } },
      },
    ],
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
    assert.match(
      r.out,
      /deferred: pytest-cov \(set GUARDRAILS_CI=1 to run them, with GUARDRAILS_PACKS=<pack> to limit the run; CI runs them\)/,
    );
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
    fake('flutter-test', {
      stdout: 'ok',
      files: { 'coverage/lcov.info': 'SF:lib/main.dart\nLF:10\nLH:9\nend_of_record\n' },
    });
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
          content: { statistics: { total: { percentage: 9, sources: 3 } }, duplicates: [] },
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
    assert.match(r.out, /packs not run here \(GUARDRAILS_PACKS\): .*shell/);
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

describe('selections that run nothing', () => {
  it('an empty GUARDRAILS_PACKS is an error', () => {
    assert.match(g(['check'], { GUARDRAILS_PACKS: ',' }).out, /GUARDRAILS_PACKS names no pack/);
  });

  it('under strict, a selected pack with no configured tool fails (its config was removed)', () => {
    const r = ci(['check', '--strict-baseline'], { GUARDRAILS_PACKS: 'python' });
    assert.equal(r.status, 1);
    assert.match(r.out, /pack python is selected by GUARDRAILS_PACKS but has no configured tool/);
  });

  it('without strict, the same selection is not an error', () => {
    assert.equal(g(['check'], { GUARDRAILS_PACKS: 'python' }).status, 0);
  });

  it('names the packs a job does not run, and never fails for them', () => {
    put('.shellcheckrc', 'shell=bash\n');
    put('a.sh', 'echo hi\n');
    fake('shellcheck', { stdout: '{"comments":[]}' });
    fake('shfmt', { stdout: '' });
    const r = g(['check', '--strict-baseline'], { GUARDRAILS_PACKS: 'ts' });
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /packs not run here \(GUARDRAILS_PACKS\): shell/);
  });
});

describe('GUARDRAILS_CI_PACKS', () => {
  it('rejects an unknown pack name', () => {
    assert.match(
      g(['check'], { GUARDRAILS_CI_PACKS: 'python,nope' }).out,
      /GUARDRAILS_CI_PACKS names unknown pack\(s\): nope/,
    );
  });

  it('cannot claim a pack that GUARDRAILS_PACKS excludes, and warns that its tools will not run', () => {
    put('pyproject.toml', '[tool.coverage.run]\nsource = ["src"]\n');
    coverage(90);
    const r = g(['check'], {
      CI: 'true',
      GUARDRAILS_PACKS: 'core,ts',
      GUARDRAILS_CI_PACKS: 'python',
    });
    assert.equal(r.status, 0, r.out);
    assert.match(
      r.out,
      /warning: GUARDRAILS_CI_PACKS names python but GUARDRAILS_PACKS excludes it/,
    );
    assert.deepEqual(
      calls('uv').filter((a) => a[1] === 'pytest'),
      [],
    );
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

describe('--init without a baseline', () => {
  it('says it wrote one, never "unchanged"', () => {
    put('platformio.ini', '[env:uno]\ncheck_tool = cppcheck\n');
    fake('pio', { stdout: '[]' });
    const r = g(['baseline', '--init']);
    assert.match(r.out, /baseline written/);
    assert.doesNotMatch(r.out, /unchanged/);
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

// The workflow a multi-stack repo gets: the base ci.yml plus each pack's job fragment. The engine
// does not read CI files, so this test is the protection against a pack nobody (or two jobs) run.
describe('generated CI workflow', () => {
  const envValue = (text, name) =>
    [...text.matchAll(new RegExp(`^\\s*${name}:\\s*['"]?([\\w,-]+)['"]?\\s*$`, 'gm'))].at(-1)?.[1];
  const all = PACKS.map((p) => p.id);
  // The packs whose ci-stage tools a job owns: GUARDRAILS_CI_PACKS, else GUARDRAILS_PACKS, else all.
  const owned = (text) => {
    const ci = envValue(text, 'GUARDRAILS_CI_PACKS');
    if (ci) return ci === 'none' ? [] : ci.split(',');
    const packs = envValue(text, 'GUARDRAILS_PACKS');
    return packs ? packs.split(',') : all;
  };
  const jobs = {
    verify: readFileSync(join(REPO, 'templates/ci/ci.yml'), 'utf8').split('\n  secrets:')[0],
  };
  for (const pack of ['python', 'mule', 'salesforce', 'rust', 'dart', 'cpp']) {
    jobs[pack] = readFileSync(join(REPO, `templates/packs/${pack}/ci.yml`), 'utf8');
  }

  it('every ci-stage pack is owned by exactly one job, and never by the base job', () => {
    const ciPacks = PACKS.filter((p) => p.tools.some((t) => t.stages.includes('ci'))).map(
      (p) => p.id,
    );
    assert.ok(ciPacks.length >= 5);
    for (const pack of ciPacks) {
      const owners = Object.entries(jobs)
        .filter(([, text]) => owned(text).includes(pack))
        .map(([name]) => name);
      assert.deepEqual(owners, [pack], `${pack} ci tools run in: ${owners.join(', ')}`);
    }
    assert.deepEqual(owned(jobs.verify), []);
  });

  it('the base job does not promise enforcement the gate does not do', () => {
    assert.doesNotMatch(jobs.verify, /fails if an enabled pack/);
  });
});

describe('ci-stage tools left to other jobs are named', () => {
  it('prints one line when the ci stage is on but GUARDRAILS_CI_PACKS excludes the pack', () => {
    put('pyproject.toml', '[tool.coverage.run]\nsource = ["src"]\n');
    coverage(90);
    const r = g(['check'], { CI: 'true', GUARDRAILS_CI_PACKS: 'none' });
    assert.equal(r.status, 0, r.out);
    assert.match(
      r.out,
      /ci-stage tools left to other jobs: pytest-cov \(GUARDRAILS_CI_PACKS=none\)/,
    );
  });
});

describe('a tighten that only records the tools list says so', () => {
  it('does not claim nothing changed', () => {
    put('platformio.ini', '[env:uno]\ncheck_tool = cppcheck\n');
    fake('pio', { stdout: '[]' });
    ci(['baseline', '--init']);
    put('pyproject.toml', '[tool.ruff]\nline-length = 100\n');
    fake('ruff', { stdout: '[]' });
    fake('ruff-format', { stdout: '' });
    const r = g(['baseline', '--tighten']);
    assert.match(r.out, /only the active-tools list was recorded/);
    assert.doesNotMatch(r.out, /baseline unchanged/);
  });
});

describe('tools newly active after an upgrade', () => {
  it('names them until a baseline command acknowledges them', () => {
    put('guardrails.baseline.json', JSON.stringify({ version: 1, counts: {} }));
    put('pyproject.toml', '[tool.ruff]\nline-length = 100\n');
    fake('ruff', { stdout: '[]' });
    fake('ruff-format', { stdout: '' });
    assert.match(
      g(['check']).out,
      /tools newly active since the baseline was written: ruff, ruff-format/,
    );
    g(['baseline', '--tighten']);
    assert.doesNotMatch(g(['check']).out, /newly active/);
  });

  it('says nothing for a project with no baseline yet', () => {
    put('pyproject.toml', '[tool.ruff]\nline-length = 100\n');
    fake('ruff', { stdout: '[]' });
    fake('ruff-format', { stdout: '' });
    assert.doesNotMatch(g(['check']).out, /newly active/);
  });
});
