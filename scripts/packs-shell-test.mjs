#!/usr/bin/env node
// packs-shell-test.mjs: the shell, docker and sql packs against fake tools.
//
//   node --test scripts/packs-shell-test.mjs

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
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

describe('shell pack', () => {
  beforeEach(() => {
    put('.shellcheckrc', 'shell=bash\n');
    put('scripts/deploy.sh', '#!/bin/bash\necho $1\n');
    fake('shellcheck', {
      stdout: JSON.stringify({
        comments: [
          {
            file: 'scripts/deploy.sh',
            line: 2,
            code: 2086,
            message: 'Double quote to prevent globbing',
          },
        ],
      }),
      status: 1,
    });
    fake('shfmt', { stdout: 'scripts/deploy.sh\n', status: 1 });
  });

  it('keys shellcheck:SCxxxx and shfmt:format findings', () => {
    assert.deepEqual(recordedCounts(), {
      'shellcheck:SC2086|scripts/deploy.sh': 1,
      'shfmt:format|scripts/deploy.sh': 1,
    });
  });

  it('runs shellcheck in the edit hook and shfmt only on commit', () => {
    assert.equal(postEdit('scripts/deploy.sh').status, 2);
    assert.deepEqual(calls('shfmt'), []);
    g(['check', '--files', 'scripts/deploy.sh']);
    assert.deepEqual(calls('shfmt').at(-1), ['-l', 'scripts/deploy.sh']);
  });

  it('is off without .shellcheckrc', () => {
    rmSync(join(state.dir, '.shellcheckrc'));
    assert.equal(g(['check']).status, 0);
    assert.deepEqual(calls('shellcheck'), []);
  });
});

describe('docker pack', () => {
  beforeEach(() => {
    put('.hadolint.yaml', 'failure-threshold: warning\n');
    put('Dockerfile', 'FROM node:latest\n');
    put('docker-compose.yml', 'services: {}\n');
    fake('hadolint', {
      stdout: JSON.stringify([
        { code: 'DL3007', file: 'Dockerfile', line: 1, level: 'warning', message: 'Using latest' },
      ]),
      status: 1,
    });
    fake('docker', { stderr: 'service "web" has neither an image nor a build context', status: 1 });
  });

  it('keys hadolint:<DLxxxx> and compose-config:invalid findings', () => {
    assert.deepEqual(recordedCounts(), {
      'compose-config:invalid|docker-compose.yml': 1,
      'hadolint:DL3007|Dockerfile': 1,
    });
    assert.deepEqual(calls('docker').at(-1), [
      'compose',
      '-f',
      'docker-compose.yml',
      'config',
      '--quiet',
    ]);
  });

  it('checks compose files one at a time', () => {
    put('deploy/compose.prod.yaml', 'services: {}\n');
    g(['check']);
    const files = calls('docker').map((a) => a[2]);
    assert.deepEqual(files.toSorted(), ['deploy/compose.prod.yaml', 'docker-compose.yml']);
  });
});

describe('sql pack', () => {
  it('keys sqlfluff:<rule> findings and lints the given files', () => {
    put('.sqlfluff', '[sqlfluff]\ndialect = postgres\n');
    put('db/001-init.sql', 'select 1\n');
    fake('sqlfluff', {
      stdout: JSON.stringify([
        {
          filepath: 'db/001-init.sql',
          violations: [
            { code: 'CP01', start_line_no: 1, description: 'Keywords must be upper case' },
          ],
        },
      ]),
      status: 1,
    });
    assert.deepEqual(recordedCounts(), { 'sqlfluff:CP01|db/001-init.sql': 1 });
    g(['check', '--files', 'db/001-init.sql']);
    assert.deepEqual(calls('sqlfluff').at(-1).slice(-1), ['db/001-init.sql']);
  });
});
