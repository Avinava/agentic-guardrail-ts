#!/usr/bin/env node
// packs-mule-test.mjs: the mule pack against fake tools (mule-lint, Maven).
//
//   node --test scripts/packs-mule-test.mjs

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
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

beforeEach(() => {
  setup();
  put('.mulelintrc.json', '{"extends":"mule-lint:recommended"}\n');
  put('mule-artifact.json', '{"minMuleVersion":"4.4.0"}\n');
  put('src/main/mule/orders-api.xml', '<mule/>\n');
  fake('mule-lint', { stdout: '[]' });
  fake('mule-lint-format', { stdout: '' });
});
afterEach(teardown);

describe('mule-lint', () => {
  const finding = (ruleId, severity) => ({
    ruleId,
    severity,
    line: 3,
    message: `${ruleId} hit`,
    filePath: join(state.dir, 'src/main/mule/orders-api.xml'),
    relativePath: 'src/main/mule/orders-api.xml',
  });

  it('counts errors and warnings, not info, keyed mule-lint:<rule>|file', () => {
    fake('mule-lint', {
      stdout: JSON.stringify([
        finding('MULE-003', 'error'),
        finding('MULE-006', 'warning'),
        finding('MULE-601', 'info'),
      ]),
      status: 1,
    });
    assert.deepEqual(recordedCounts(), {
      'mule-lint:MULE-003|src/main/mule/orders-api.xml': 1,
      'mule-lint:MULE-006|src/main/mule/orders-api.xml': 1,
    });
    assert.deepEqual(calls('mule-lint')[0].slice(0, 3), ['.', '--config', '.mulelintrc.json']);
  });

  it('scans every Mule application in a monorepo', () => {
    put('apps/billing/mule-artifact.json', '{}\n');
    g(['check']);
    const dirs = calls('mule-lint')
      .filter((a) => a[0] !== 'format')
      .map((a) => a[0]);
    assert.deepEqual(dirs.toSorted(), ['.', 'apps/billing']);
  });

  it('runs in the edit hook when a Mule file changes, not for unrelated files', () => {
    fake('mule-lint', { stdout: JSON.stringify([finding('MULE-003', 'error')]), status: 1 });
    assert.equal(postEdit('src/main/mule/orders-api.xml').status, 2);
    const before = calls('mule-lint').length;
    postEdit('src/a.ts');
    assert.equal(calls('mule-lint').length, before);
  });

  it('fails loudly when mule-lint crashes', () => {
    fake('mule-lint', { stderr: 'boom', status: 2 });
    assert.match(g(['check']).out, /mule-lint failed \(exit 2\)/);
  });
});

describe('mule-format', () => {
  it('reports XML that needs formatting; no DataWeave formatter exists', () => {
    fake('mule-lint-format', {
      stdout: '  ✗ src/main/mule/orders-api.xml (needs formatting)\n\n1 file(s) scanned\n',
      status: 1,
    });
    const counts = recordedCounts();
    assert.equal(counts['mule-format:format|src/main/mule/orders-api.xml'], 1);
  });
});

describe('mule-secrets', () => {
  it('flags plain secrets, allows placeholders and encrypted values', () => {
    put(
      'src/main/resources/config.properties',
      [
        'db.password=hunter2',
        'db.user=svc',
        'api.token=${secure::api.token}',
        'client.secret=![abcDEF==]',
        'oauth.clientSecret: "plain"',
      ].join('\n'),
    );
    const r = g(['check', '--files', 'src/main/resources/config.properties']);
    assert.equal(r.status, 1);
    assert.match(r.out, /config\.properties:1 {2}mule-secrets plain-secret/);
    assert.doesNotMatch(r.out, /properties:2|properties:3|properties:4/);
    assert.deepEqual(recordedCounts(), {
      'mule-secrets:plain-secret|src/main/resources/config.properties': 2,
    });
  });
});

describe('munit', () => {
  it('runs Maven on full checks only and gates on its exit code', () => {
    put('pom.xml', '<project><artifactId>munit-maven-plugin</artifactId></project>\n');
    fake('mvn', { stdout: 'COVERAGE FAILED', status: 1 });
    ci(['check', '--files', 'src/main/mule/orders-api.xml']);
    assert.deepEqual(calls('mvn'), []);
    const r = ci(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /munit tests-or-coverage-failed/);
    assert.deepEqual(calls('mvn').at(-1), ['-B', '-ntp', '-q', '-f', 'pom.xml', 'test']);
  });

  it('is off when the pom does not configure the MUnit plugin', () => {
    put('pom.xml', '<project/>\n');
    ci(['check']);
    assert.deepEqual(calls('mvn'), []);
  });
});

describe('mule pack, review fixes', () => {
  it('mule-format with exit 1 and output it cannot read is a failure', () => {
    fake('mule-lint-format', { stdout: 'formatting check failed\n', status: 1 });
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /mule-format failed with output it could not read \(exit 1\)/);
  });

  it('a failing MUnit run cannot be baselined, so it keeps failing', () => {
    put('pom.xml', '<project><artifactId>munit-maven-plugin</artifactId></project>\n');
    fake('mvn', { stdout: 'COVERAGE FAILED', status: 1 });
    const r = ci(['baseline', '--init']);
    assert.equal(r.status, 1);
    assert.match(r.out, /cannot baseline while a tool is failing as a whole/);
    assert.equal(ci(['check']).status, 1);
  });

  it('MUnit does not run on a local full check (pre-push)', () => {
    put('pom.xml', '<project><artifactId>munit-maven-plugin</artifactId></project>\n');
    g(['check']);
    assert.deepEqual(calls('mvn'), []);
  });
});

describe('directories that look like options', () => {
  it('passes a Mule application directory named -legacy as ./-legacy', () => {
    put('-legacy/mule-artifact.json', '{}\n');
    put('-legacy/src/main/mule/a.xml', '<mule/>\n');
    fake('mule-lint-format', { stdout: '' });
    g(['check']);
    const dirs = calls('mule-lint').map((a) => (a[0] === 'format' ? a[2] : a[0]));
    assert.ok(dirs.includes('./-legacy'), JSON.stringify(dirs));
    assert.ok(!dirs.includes('-legacy'));
  });
});
