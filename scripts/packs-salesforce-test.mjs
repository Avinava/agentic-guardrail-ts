#!/usr/bin/env node
// packs-salesforce-test.mjs: the salesforce pack against fake tools (sf, prettier).
//
//   node --test scripts/packs-salesforce-test.mjs

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  baselineFile,
  calls,
  fake,
  g,
  ci,
  put,
  recordedCounts,
  setup,
  teardown,
} from './pack-harness.mjs';

beforeEach(() => {
  setup();
  put(
    'sfdx-project.json',
    '{"packageDirectories":[{"path":"force-app"}],"sourceApiVersion":"62.0"}\n',
  );
  put('force-app/main/default/classes/Foo.cls', 'public class Foo {}\n');
  put(
    'force-app/main/default/classes/Foo.cls-meta.xml',
    '<ApexClass><apiVersion>62.0</apiVersion></ApexClass>\n',
  );
});
afterEach(teardown);

describe('code-analyzer', () => {
  beforeEach(() => {
    put('code-analyzer.yml', 'log_level: 3\n');
    fake('sf-code-analyzer', {
      writes: [
        {
          flag: '--output-file',
          content: {
            violations: [
              {
                rule: 'ApexSharingViolations',
                engine: 'pmd',
                severity: 3,
                primaryLocationIndex: 0,
                locations: [{ file: 'force-app/main/default/classes/Foo.cls', startLine: 1 }],
                message: 'Apex classes should declare a sharing model',
              },
            ],
          },
        },
      ],
    });
  });

  it('keys findings code-analyzer:<engine>.<rule>|file', () => {
    assert.deepEqual(recordedCounts(), {
      'code-analyzer:pmd.ApexSharingViolations|force-app/main/default/classes/Foo.cls': 1,
    });
    assert.deepEqual(calls('sf')[0].slice(0, 4), [
      'code-analyzer',
      'run',
      '--workspace',
      'force-app',
    ]);
  });

  it('targets only the staged files, and not from the edit hook', () => {
    g(['check', '--files', 'force-app/main/default/classes/Foo.cls']);
    const args = calls('sf').at(-1);
    assert.deepEqual(args.slice(4, 6), ['--target', 'force-app/main/default/classes/Foo.cls']);
  });
});

describe('prettier-apex', () => {
  it('lists Apex files that differ from the formatted output', () => {
    put('.prettierrc', '{"plugins":["prettier-plugin-apex"]}\n');
    fake('prettier', { stdout: 'force-app/main/default/classes/Foo.cls\n', status: 1 });
    const counts = recordedCounts();
    assert.equal(counts['prettier-apex:format|force-app/main/default/classes/Foo.cls'], 1);
  });
});

describe('sf-metadata', () => {
  beforeEach(() => put('code-analyzer.yml', 'log_level: 3\n'));

  it('is quiet when metadata is consistent', () => {
    fake('sf-code-analyzer', { writes: [{ flag: '--output-file', content: { violations: [] } }] });
    assert.equal(g(['check']).status, 0);
  });

  it('flags a missing -meta.xml and a stale apiVersion', () => {
    fake('sf-code-analyzer', { writes: [{ flag: '--output-file', content: { violations: [] } }] });
    put('force-app/main/default/classes/Bar.cls', 'public class Bar {}\n');
    put(
      'force-app/main/default/triggers/Old.trigger',
      'trigger Old on Account (before insert) {}\n',
    );
    put(
      'force-app/main/default/triggers/Old.trigger-meta.xml',
      '<ApexTrigger><apiVersion>55.0</apiVersion></ApexTrigger>\n',
    );
    assert.deepEqual(recordedCounts(), {
      'sf-metadata:missing-meta-xml|force-app/main/default/classes/Bar.cls': 1,
      'sf-metadata:stale-api-version|force-app/main/default/triggers/Old.trigger-meta.xml': 1,
    });
  });
});

describe('apex-coverage floor', () => {
  const run = (orgWideCoverage, outcome = 'Passed') =>
    fake('sf-apex', {
      stdout: JSON.stringify({
        status: 0,
        result: { summary: { outcome, orgWideCoverage, failing: 0, testsRan: 5 } },
      }),
    });

  beforeEach(() => put('guardrails/apex-coverage.json', '{"targetOrg":"ci-scratch"}\n'));

  it('records the floor and fails below it, using sf with the configured org', () => {
    run('82%');
    ci(['baseline', '--init']);
    assert.equal(baselineFile().metrics['apex-coverage'], 82);
    assert.ok(calls('sf').at(-1).includes('ci-scratch'));
    assert.equal(calls('sf').at(-1)[0], 'apex');
    run('78%');
    assert.match(ci(['check']).out, /apex-coverage 78% is below the baseline 82%/);
  });

  it('fails when the Apex tests themselves fail', () => {
    run('90%', 'Failed');
    assert.match(ci(['baseline', '--init']).out, /Apex tests Failed/);
  });

  it('never runs on scoped checks', () => {
    run('90%');
    ci(['check', '--files', 'force-app/main/default/classes/Foo.cls']);
    assert.deepEqual(calls('sf-apex'), []);
  });
});

describe('apex-coverage runs in CI only', () => {
  it('is not run by a pre-push full check, and is not dropped from the baseline', () => {
    put('guardrails/apex-coverage.json', '{"targetOrg":"ci-scratch"}\n');
    fake('sf-apex', {
      stdout: JSON.stringify({
        result: { summary: { outcome: 'Passed', orgWideCoverage: '82%', testsRan: 5 } },
      }),
    });
    ci(['baseline', '--init']);
    const runs = calls('sf').length;
    assert.equal(g(['check']).status, 0);
    assert.equal(calls('sf').length, runs);
  });

  it('a summary without orgWideCoverage fails instead of recording NaN', () => {
    put('guardrails/apex-coverage.json', '{"targetOrg":"ci-scratch"}\n');
    fake('sf-apex', {
      stdout: JSON.stringify({ result: { summary: { outcome: 'Passed', testsRan: 5 } } }),
    });
    const r = ci(['baseline', '--init']);
    assert.equal(r.status, 1);
    assert.match(r.out, /apex-coverage reading is missing or not a number/);
  });
});

describe('apex coverage zero denominator', () => {
  it('a run with no tests fails instead of recording a number', () => {
    put('guardrails/apex-coverage.json', '{"targetOrg":"ci-scratch"}\n');
    fake('sf-apex', {
      stdout: JSON.stringify({
        result: { summary: { outcome: 'Passed', orgWideCoverage: '0%', testsRan: 0 } },
      }),
    });
    const r = ci(['baseline', '--init']);
    assert.equal(r.status, 1);
    assert.match(r.out, /ran no tests/);
  });
});
