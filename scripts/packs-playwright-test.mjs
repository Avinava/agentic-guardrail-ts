#!/usr/bin/env node
// packs-playwright-test.mjs: the playwright pack.
// The rules are ast-grep rules, so their tests run the real binary (from PATH or this checkout's
// node_modules) and skip when there is none. The failure tests use the fake binary.
//
//   node --test scripts/packs-playwright-test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { delimiter, join } from 'node:path';
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

const REPO = join(import.meta.dirname, '..');
const CONFIG = 'guardrails/playwright.json';
const TEMPLATE = join(REPO, 'templates', 'packs', 'playwright', CONFIG);
const FIXTURES = join(import.meta.dirname, 'fixtures', 'playwright');

const AST_GREP = [join(REPO, 'node_modules', '.bin'), ...process.env.PATH.split(delimiter)]
  .map((dir) => join(dir, 'ast-grep'))
  .find((file) => existsSync(file) && spawnSync(file, ['--version']).status === 0);
const skip = !AST_GREP && 'ast-grep is not installed';

const BAD = "test.only('x', async ({ page }) => {\n  await page.waitForTimeout(1);\n});\n";

beforeEach(() => {
  setup();
  cpSync(TEMPLATE, join(state.dir, CONFIG), { recursive: true });
});
afterEach(teardown);

function useReal() {
  const link = join(state.dir, 'node_modules', '.bin', 'ast-grep');
  rmSync(link);
  symlinkSync(AST_GREP, link);
}

const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8');

// `line rule` for every `// want:` marker of a fixture.
const wanted = (text) =>
  text
    .split('\n')
    .flatMap((line, i) =>
      (/\/\/ want: ([\w -]+)$/.exec(line)?.[1].split(' ') ?? []).map((rule) => `${i + 1} ${rule}`),
    )
    .toSorted();

const reported = (out, file) =>
  [...out.matchAll(/^ {2}(.+?):(\d+) {2}playwright ([\w-]+) /gm)]
    .filter((m) => m[1] === file)
    .map((m) => `${m[2]} ${m[3]}`)
    .toSorted();

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('rules (real ast-grep)', { skip }, () => {
  beforeEach(useReal);

  for (const ext of ['ts', 'tsx', 'js']) {
    it(`reports exactly the marked lines of the banned fixture as .${ext}`, () => {
      // The one TypeScript-only construct in the fixture is the `<void>` type argument.
      const text = fixture('banned.spec.ts').replace(ext === 'js' ? '<void>' : '', '');
      put(`e2e/banned.spec.${ext}`, text);
      const r = g(['check']);
      assert.equal(r.status, 1);
      assert.deepEqual(reported(r.out, `e2e/banned.spec.${ext}`), wanted(text));
    });

    it(`accepts the allowed fixture as .${ext}`, () => {
      put(`e2e/allowed.spec.${ext}`, fixture('allowed.spec.ts'));
      const r = g(['check']);
      assert.equal(r.status, 0, r.out);
    });
  }

  it('covers .mts, .cts, .mjs, .cjs and .jsx', () => {
    const files = ['mts', 'cts', 'mjs', 'cjs', 'jsx'].map((ext) => `e2e/a.${ext}`);
    for (const file of files) put(file, BAD);
    const counts = recordedCounts();
    for (const file of files) {
      assert.equal(counts[`playwright:focused-test|${file}`], 1, file);
      assert.equal(counts[`playwright:fixed-wait|${file}`], 1, file);
    }
  });

  it('reports findings under every form of ast-grep-ignore, and the comment itself', () => {
    put(
      'e2e/a.spec.ts',
      [
        '// ast-grep-ignore',
        "test.only('a', async () => {});",
        '// ast-grep-ignore: skip_TypeScript',
        "test.skip('b', async () => {});",
        "test.only('c', async () => {}); /* ast-grep-ignore */",
        '// ast-grep-ignore: no-banned-identifier',
        "test.only('d', async () => {});",
        '',
      ].join('\n'),
    );
    assert.deepEqual(recordedCounts(), {
      'playwright:focused-test|e2e/a.spec.ts': 3,
      'playwright:skip|e2e/a.spec.ts': 1,
      'playwright:suppression|e2e/a.spec.ts': 3,
    });
  });

  it('a baselined suppression comment cannot hide a later .only or fixed wait', () => {
    const spec = (body) => `// ast-grep-ignore\n${body}\n`;
    put('e2e/a.spec.ts', spec('const legacy = 1;'));
    assert.deepEqual(recordedCounts(), { 'playwright:suppression|e2e/a.spec.ts': 1 });
    put(
      'e2e/a.spec.ts',
      spec("test.only('pays', async ({ page }) => {\n  await page.waitForTimeout(1000);\n});"),
    );
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.deepEqual(reported(r.out, 'e2e/a.spec.ts'), ['2 focused-test', '3 fixed-wait']);
    assert.equal(postEdit('e2e/a.spec.ts').status, 2);
  });

  it('reads suppression comments only from real comments, and leaves the source file alone', () => {
    const text = [
      "const a = '// ast-grep-ignore';",
      'const b = `/* ast-grep-ignore */`;',
      '// see the ast-grep-ignore docs',
      '',
    ].join('\n');
    put('e2e/a.spec.ts', text);
    assert.equal(g(['check']).status, 0);
    assert.equal(readFileSync(join(state.dir, 'e2e/a.spec.ts'), 'utf8'), text);
  });

  it('keeps a quarantine live through its date and expires it the next day', () => {
    const spec = (date) =>
      `test('x', { tag: '@quarantine-${date}' }, async ({ isMobile }) => {\n  test.skip(isMobile);\n});\n`;
    put('e2e/today.spec.ts', spec(day(0)));
    put('e2e/past.spec.ts', spec(day(-1)));
    assert.deepEqual(recordedCounts(), {
      'playwright:skip|e2e/past.spec.ts': 1,
      'playwright:stale-quarantine|e2e/past.spec.ts': 1,
    });
  });
});

describe('scope (real ast-grep)', { skip }, () => {
  beforeEach(useReal);

  const waits = () =>
    Object.keys(recordedCounts())
      .filter((k) => k.startsWith('playwright:fixed-wait|'))
      .map((k) => k.split('|')[1])
      .toSorted();

  it('defaults to e2e folders and any file that imports Playwright, not unit specs', () => {
    const using = (line) => `${line}\n${BAD}`;
    put('e2e/helper.ts', BAD);
    put('apps/web/e2e/h.ts', BAD);
    put('tests/checkout.test.ts', using("import { test } from '@playwright/test';"));
    put('tests/multi.ts', using("import {\n  expect,\n  test,\n} from '@playwright/test';"));
    put('tests/cjs.js', using("const { test } = require('@playwright/test');"));
    put('tests/dynamic.mjs', using("const pw = await import('playwright/test');"));
    // Through a fixtures module, behind a barrel, with an import cycle and a `.js` specifier.
    put(
      'support/base.ts',
      "import { test as base } from '@playwright/test';\nimport './index.js';\n",
    );
    put('support/index.ts', "export * from './base.js';\n");
    put('tests/via-fixtures.spec.ts', using("import { test } from '../support';"));
    // Unit tests, and mentions that are not imports.
    put('src/unit.spec.ts', using("import { test } from 'vitest';"));
    put('src/globals.test.ts', BAD);
    put('src/mention.spec.ts', using("// import { test } from '@playwright/test';"));
    put('src/text.spec.ts', using("export const pkg = '@playwright/test';"));
    put('src/cycle-a.ts', using("import './cycle-b';"));
    put('src/cycle-b.ts', "import './cycle-a';\nimport './missing';\n");
    assert.deepEqual(waits(), [
      'apps/web/e2e/h.ts',
      'e2e/helper.ts',
      'tests/checkout.test.ts',
      'tests/cjs.js',
      'tests/dynamic.mjs',
      'tests/multi.ts',
      'tests/via-fixtures.spec.ts',
    ]);
    // A scoped run follows the imports of a file that did not change.
    assert.equal(g(['baseline', '--reset']).status, 0);
    put('tests/new.test.ts', using("import { test } from '../support';"));
    assert.equal(postEdit('tests/new.test.ts').status, 2);
  });

  it('leaves a script that imports only browser launchers alone, outside include', () => {
    const using = (line) => `${line}\nawait page.waitForTimeout(1);\n`;
    put('scripts/shots.mjs', using("import { chromium, devices } from '@playwright/test';"));
    put('scripts/cjs.js', using("const { chromium: browser } = require('@playwright/test');"));
    put('scripts/dynamic.mjs', using("const { webkit } = await import('playwright/test');"));
    // `.test(` on another object is not a test call.
    put(
      'scripts/regex.mjs',
      using("import { chromium } from '@playwright/test';\n/x/.test(name);"),
    );
    put('e2e/shots.ts', using("import { chromium } from '@playwright/test';"));
    put('tests/both.ts', using("import { chromium, test } from '@playwright/test';"));
    put('tests/page.ts', using("import type { Page } from '@playwright/test';"));
    put('tests/two.ts', using("import { chromium } from '@playwright/test';\nimport './page';"));
    assert.deepEqual(waits(), ['e2e/shots.ts', 'tests/both.ts', 'tests/page.ts', 'tests/two.ts']);
  });

  it('keeps a file that imports test or expect from anywhere, or calls test()', () => {
    const using = (line) =>
      `import { chromium } from '@playwright/test';\n${line}\nawait page.waitForTimeout(1);\n`;
    put('tests/alias.ts', using("import { test, expect } from '@/e2e/fixtures';"));
    put('tests/renamed.ts', using("import {\n  test as it,\n} from '@acme/fixtures';"));
    put('tests/expect.ts', using("const { expect } = require('#fixtures');"));
    put('tests/default.ts', using("import test from '~/fixtures';"));
    put('tests/calls.ts', using("test('pays', async () => {});"));
    put('tests/chain.ts', using("test.describe('group', () => {});"));
    assert.deepEqual(waits(), [
      'tests/alias.ts',
      'tests/calls.ts',
      'tests/chain.ts',
      'tests/default.ts',
      'tests/expect.ts',
      'tests/renamed.ts',
    ]);
  });

  it('ignore beats an import of Playwright', () => {
    put(CONFIG, '{ "ignore": ["tools/**"] }\n');
    put('tools/scrape.ts', `import { test } from '@playwright/test';\n${BAD}`);
    put('e2e/a.ts', BAD);
    assert.deepEqual(waits(), ['e2e/a.ts']);
  });

  it('follows include and ignore from the config', () => {
    put(CONFIG, '{ "include": ["tests/**"], "ignore": ["tests/legacy/**"] }\n');
    put('tests/a.ts', BAD);
    put('tests/legacy/b.ts', BAD);
    put('e2e/c.spec.ts', BAD);
    assert.deepEqual(Object.keys(recordedCounts()), [
      'playwright:fixed-wait|tests/a.ts',
      'playwright:focused-test|tests/a.ts',
    ]);
  });

  it('scans tracked files that git ignores, hidden folders and names like options', () => {
    put('.gitignore', 'e2e/ignored.spec.ts\n');
    put('e2e/ignored.spec.ts', BAD);
    spawnSync('git', ['add', '-f', 'e2e/ignored.spec.ts'], { cwd: state.dir });
    put('.hidden/e2e/h.spec.ts', BAD);
    put('-x.spec.ts', `import '@playwright/test';\n${BAD}`);
    const counts = recordedCounts();
    for (const file of ['e2e/ignored.spec.ts', '.hidden/e2e/h.spec.ts', '-x.spec.ts']) {
      assert.equal(counts[`playwright:focused-test|${file}`], 1, file);
    }
  });

  it("is not changed by the project's sgconfig.yml", () => {
    // A languageGlobs remap, and a rule folder that holds a broken rule.
    put('sgconfig.yml', 'ruleDirs:\n  - rules\nlanguageGlobs:\n  html: ["*.ts"]\n');
    put('rules/broken.yml', 'nonsense\n');
    put('e2e/a.spec.ts', BAD);
    const r = g(['check', '--files', 'e2e/a.spec.ts'], { GUARDRAILS_PACKS: 'playwright' });
    assert.deepEqual(reported(r.out, 'e2e/a.spec.ts'), ['1 focused-test', '2 fixed-wait']);
  });

  it('accepts an empty file and more files than one batch', () => {
    put('e2e/empty.spec.ts', '');
    for (let i = 0; i < 205; i += 1) put(`e2e/f${i}.spec.ts`, BAD);
    assert.equal(Object.keys(recordedCounts()).length, 410);
  });

  it('runs in the edit hook and on --files, only for e2e files', () => {
    put('e2e/a.spec.ts', BAD);
    put('src/b.ts', BAD);
    assert.equal(postEdit('e2e/a.spec.ts').status, 2);
    assert.equal(postEdit('src/b.ts').status, 0);
    assert.equal(g(['check', '--files', 'src/b.ts']).status, 0);
    assert.equal(g(['check', '--files', 'e2e/a.spec.ts']).status, 1);
  });

  it('ratchets: legacy findings are accepted, a new one fails, a fix must be recorded', () => {
    put('e2e/old.spec.ts', BAD);
    recordedCounts();
    assert.equal(g(['check', '--strict-baseline']).status, 0);
    put('e2e/old.spec.ts', `${BAD}${BAD}`);
    const grown = g(['check']);
    assert.equal(grown.status, 1);
    assert.match(grown.out, /e2e\/old\.spec\.ts:4 {2}playwright focused-test/);
    put('e2e/old.spec.ts', "test('x', async () => {});\n");
    assert.equal(g(['check']).status, 0);
    assert.equal(g(['check', '--strict-baseline']).status, 1);
    assert.equal(g(['baseline', '--tighten']).status, 0);
    assert.deepEqual(baselineFile().counts, {});
  });
});

describe('fail closed', () => {
  beforeEach(() => put('e2e/a.spec.ts', "test('x', async () => {});\n"));

  const summary = (scanned, skipped) =>
    `sg: summary|file: scannedFileCount=${scanned},skippedFileCount=${skipped}\n`;
  const fails = (pattern) => {
    const r = g(['check']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, pattern);
  };

  it('passes only when every file was scanned', () => {
    fake('ast-grep', { stderr: summary(1, 0), status: 0 });
    assert.equal(g(['check']).status, 0);
    const args = calls('ast-grep').at(-1);
    assert.deepEqual(args.slice(0, 2), ['scan', '--config']);
    assert.deepEqual(args.slice(3, 6), ['--json=stream', '--inspect', 'summary']);
    // The scanned file is a copy outside the repo.
    assert.equal(args.length, 7);
    assert.match(args[6], /\/copy\/0\.ts$/);
  });

  it('fails on a tool error', () => {
    fake('ast-grep', { stderr: 'Cannot parse rule', status: 8 });
    fails(/ast-grep failed \(exit 8\)/);
  });

  it('fails on a file it could not read, even with exit 0', () => {
    fake('ast-grep', { stderr: `ERROR: e2e/a.spec.ts: denied\n${summary(1, 0)}`, status: 0 });
    fails(/could not read every file/);
    fake('ast-grep', { status: 0 });
    fails(/could not read every file/);
    fake('ast-grep', { stderr: summary(1, 1), status: 0 });
    fails(/skipped files/);
  });

  it('fails on unreadable output', () => {
    fake('ast-grep', { stdout: 'not json\n', stderr: summary(1, 0), status: 0 });
    fails(/ast-grep printed no JSON/);
    fake('ast-grep', { stderr: summary(1, 0), status: 1 });
    fails(/reported errors it did not print/);
  });

  it('fails when the binary is missing', () => {
    rmSync(join(state.dir, 'node_modules', '.bin', 'ast-grep'));
    fails(/sg is not installed/);
  });

  it('fails on a bad config and on globs that match nothing', () => {
    for (const bad of [
      '{',
      '[]',
      '{ "includes": ["e2e/**"] }',
      '{ "include": [] }',
      '{ "include": "e2e/**" }',
      '{ "ignore": [1] }',
    ]) {
      put(CONFIG, bad);
      fails(/guardrails\/playwright\.json/);
    }
    put(CONFIG, '{ "include": ["nowhere/**"] }');
    fails(/no file matches "include"/);
  });

  it('fails on a real unreadable file', { skip: skip || process.getuid?.() === 0 }, () => {
    useReal();
    put('e2e/locked.spec.ts', BAD);
    put('e2e/latin1.spec.ts', '');
    const locked = join(state.dir, 'e2e/locked.spec.ts');
    spawnSync('git', ['add', '-A'], { cwd: state.dir });
    spawnSync('printf "\\377\\376\\n" > e2e/latin1.spec.ts', { shell: true, cwd: state.dir });
    fails(/skipped files/);
    chmodSync(locked, 0o000);
    try {
      assert.equal(g(['check']).status, 1);
    } finally {
      chmodSync(locked, 0o644);
    }
  });

  it('is off without its config, and listed by packs', () => {
    put('playwright.config.ts', 'export default {};\n');
    assert.match(g(['packs']).out, /playwright: detected \(1\)\n {2}on {2}playwright/);
    rmSync(join(state.dir, CONFIG));
    assert.match(g(['packs']).out, /off playwright/);
    assert.equal(g(['check']).status, 0);
    assert.deepEqual(calls('ast-grep'), []);
  });
});
