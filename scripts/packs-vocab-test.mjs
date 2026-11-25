#!/usr/bin/env node
// packs-vocab-test.mjs: the core pack's vocab-literal tool. It is JS inside the pack, so these
// tests run it for real on small TypeScript and Python fixtures (only oxlint and friends are fake).
//
//   node --test scripts/packs-vocab-test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  TYPESCRIPT,
  fake,
  g,
  postEdit,
  put,
  recordedCounts,
  setup,
  state,
  teardown,
} from './pack-harness.mjs';

const NO_TS = !TYPESCRIPT && 'typescript is not installed (npm install --no-save typescript)';
const NO_PY = spawnSync('python3', ['--version']).status !== 0 && 'python3 is not installed';

const REPO = join(import.meta.dirname, '..');
const config = (modules, extra = {}) =>
  put('guardrails/vocab.json', JSON.stringify({ modules, ...extra }));

beforeEach(setup);
afterEach(teardown);

describe('vocab-literal, TypeScript', { skip: NO_TS }, () => {
  beforeEach(() => {
    put('src/a.ts', '');
    config(['src/vocab.ts'], { ignore: ['**/generated/**'] });
    put(
      'src/vocab.ts',
      [
        'export const Status = { Active: "active", Closed: "closed", Nested: { Deep: "deep" } } as const;',
        'export enum Role { Admin = "admin", Guest = "guest" }',
        'export const Plain = { NotVocab: "plain" };',
        '',
      ].join('\n'),
    );
  });

  it('flags a raw string equal to a member, outside the vocab module', () => {
    put(
      'src/svc.ts',
      [
        "import { x } from 'active';",
        "export const a = 'active';",
        'export const b = "admin";',
        'export const c = `closed`;',
        "export const d = 'deep';",
        "export const ok = 'plain';",
        'export const tpl = `closed ${a}`;',
        "// the 'active' status",
        '/* "closed" */',
        "export type T = 'guest' | 'other';",
        "const re = /'active'/;",
        "export const after = 'closed';",
        '',
      ].join('\n'),
    );
    const r = g(['check']);
    assert.match(r.out, /src\/svc\.ts:2 {2}vocab-literal Status\.Active/);
    assert.match(r.out, /src\/svc\.ts:12 {2}vocab-literal Status\.Closed/);
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:Status.Active|src/svc.ts': 1,
      'vocab-literal:Role.Admin|src/svc.ts': 1,
      'vocab-literal:Status.Closed|src/svc.ts': 2,
      'vocab-literal:Status.Nested.Deep|src/svc.ts': 1,
      'vocab-literal:Role.Guest|src/svc.ts': 1,
    });
  });

  it('skips the vocab module, tests, ignored paths and imports', () => {
    for (const f of [
      'src/a.test.ts',
      'src/a.spec.tsx',
      'tests/x.ts',
      'src/__tests__/x.ts',
      'src/generated/api.ts',
    ]) {
      put(f, "export const a = 'active';\n");
    }
    put('src/imp.ts', "import 'active';\nexport * from 'closed';\nconst m = require('guest');\n");
    assert.equal(g(['check']).status, 0);
  });

  it('flags TSX, and keeps going after an apostrophe in JSX text', () => {
    put('src/v.tsx', "export const V = () => <p>Don't</p>;\nexport const s = 'active';\n");
    assert.deepEqual(recordedCounts(), { 'vocab-literal:Status.Active|src/v.tsx': 1 });
  });

  it('runs in the edit hook and on --files, and ignores a changed vocab module itself', () => {
    put('src/svc.ts', "export const a = 'active';\n");
    assert.equal(postEdit('src/svc.ts').status, 2);
    assert.equal(g(['check', '--files', 'src/vocab.ts']).status, 0);
  });

  it('fails on a bad config instead of passing', () => {
    put('guardrails/vocab.json', '{"modules": []}');
    assert.match(g(['check']).out, /needs "modules"/);
    config(['src/missing.ts']);
    assert.match(g(['check']).out, /does not exist/);
    put('src/empty.ts', 'export const X = 1;\n');
    config(['src/empty.ts']);
    assert.match(g(['check']).out, /no string members found/);
    put('guardrails/vocab.json', '{oops');
    assert.match(g(['check']).out, /not valid JSON/);
  });

  it('is off without guardrails/vocab.json', () => {
    put('src/svc.ts', "export const a = 'active';\n");
    assert.equal(g(['check']).status, 1);
    rmSync(join(state.dir, 'guardrails/vocab.json'));
    assert.equal(g(['check']).status, 0);
  });
});

describe('vocab-literal, review regressions', { skip: NO_TS || NO_PY }, () => {
  beforeEach(() => put('src/a.ts', ''));

  it('ignores commented-out declarations and braces inside comments', () => {
    put(
      'src/vocab.ts',
      [
        '// export const Legacy = { Old: "retired" } as const;',
        'export const Status = {',
        '  // }',
        '  Active: "active",',
        '  // Closed: "closed",',
        '  /* Hidden: "hidden" } */',
        '} as const;',
        'export enum Role {',
        '  // Admin = "admin",',
        '  Guest = "guest",',
        '}',
        'export const Other = { Foo: "foo" } as const;',
        '',
      ].join('\n'),
    );
    config(['src/vocab.ts']);
    put(
      'src/svc.ts',
      "export const a = ['retired', 'active', 'closed', 'hidden', 'admin', 'guest', 'foo'];\n",
    );
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:Status.Active|src/svc.ts': 1,
      'vocab-literal:Role.Guest|src/svc.ts': 1,
      'vocab-literal:Other.Foo|src/svc.ts': 1,
    });
  });

  it('flags literals inside template substitutions and f-string expressions', () => {
    put('src/vocab.ts', 'export const Status = { Active: "active" } as const;\n');
    put('app/vocab.py', 'from enum import StrEnum\nclass S(StrEnum):\n    ACTIVE = "active"\n');
    config(['src/vocab.ts', 'app/vocab.py']);
    put(
      'src/svc.ts',
      [
        'export const a = `Status: ${"active"}`;',
        'export const b = `x${y ? `${"active"}` : 1}`;',
        'export const c = `just active`;',
        'export const d = `plain ${"other"}`;',
        '',
      ].join('\n'),
    );
    put('app/svc.py', 'a = f"status {\'active\'}"\nb = f"{{active}} {x}"\n');
    const r = g(['check']);
    assert.match(r.out, /src\/svc\.ts:1 {2}vocab-literal Status\.Active/);
    assert.match(r.out, /src\/svc\.ts:2 {2}vocab-literal Status\.Active/);
    assert.match(r.out, /app\/svc\.py:1 {2}vocab-literal S\.ACTIVE/);
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:Status.Active|src/svc.ts': 2,
      'vocab-literal:S.ACTIVE|app/svc.py': 1,
    });
  });

  it('reads JSX text as text and finds a literal after an apostrophe on the same line', () => {
    put('src/vocab.ts', 'export const Status = { Active: "active" } as const;\n');
    config(['src/vocab.ts']);
    put('src/v.tsx', "export const V = () => <p>Don't use 'active', it's old</p>;\n");
    assert.equal(g(['check']).status, 0, 'JSX text is not a string');
    put('src/w.tsx', "export const W = () => <p>Don't</p>; export const s = 'active';\n");
    assert.deepEqual(recordedCounts(), { 'vocab-literal:Status.Active|src/w.tsx': 1 });
  });

  it('ignores locals in Python methods and keeps class-level members', () => {
    put(
      'app/vocab.py',
      [
        'from enum import StrEnum',
        'class Status(StrEnum):',
        '    ACTIVE = "active"',
        '',
        '    def parse(self, raw: str) -> "Status":',
        '        fallback = "unknown"',
        '        return self.ACTIVE',
        '',
        '    CLOSED = "closed"',
        '',
      ].join('\n'),
    );
    config(['app/vocab.py']);
    put('app/svc.py', 'a = "unknown"\nb = "active"\nc = "closed"\n');
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:Status.ACTIVE|app/svc.py': 1,
      'vocab-literal:Status.CLOSED|app/svc.py': 1,
    });
  });

  it('skips docstrings but not triple-quoted values, and keeps docstring text out of the members', () => {
    put(
      'app/vocab.py',
      [
        'from enum import StrEnum',
        'class Status(StrEnum):',
        '    """Lifecycle.',
        '',
        '    LEGACY = "retired"',
        '    """',
        '    ACTIVE = "active"',
        'class Closing(StrEnum):',
        '    """',
        'Use closed when done.',
        '"""',
        '    CLOSED = "closed"',
        '',
      ].join('\n'),
    );
    config(['app/vocab.py']);
    put(
      'app/svc.py',
      ['"""active"""', 'a = "retired"', 'g = """active"""', 'h = "closed"', ''].join('\n'),
    );
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:Status.ACTIVE|app/svc.py': 1,
      'vocab-literal:Closing.CLOSED|app/svc.py': 1,
    });
  });

  it('handles f-strings, triple-quoted f-strings and nested expressions', () => {
    put('app/vocab.py', 'from enum import StrEnum\nclass S(StrEnum):\n    A = "active"\n');
    config(['app/vocab.py']);
    put(
      'app/svc.py',
      [
        'plain = f"""active"""',
        'msg = f"""status {\'active\'}"""',
        "label = f\"{labels['}'] + 'active'}\"",
        'text = f"{x} active"',
        'braces = f"{{active}}"',
        '',
      ].join('\n'),
    );
    assert.deepEqual(recordedCounts(), { 'vocab-literal:S.A|app/svc.py': 3 });
  });

  it('fails the gate on a Python file it cannot parse, instead of skipping literals', () => {
    put('app/vocab.py', 'from enum import StrEnum\nclass S(StrEnum):\n    A = "active"\n');
    config(['app/vocab.py']);
    put('app/svc.py', 'note = """unclosed\ny = "active"\n');
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /python3 could not read/);
  });

  it('flags literals in nested templates, not the fixed text of a template', () => {
    put('src/vocab.ts', 'export const Status = { Active: "active" } as const;\n');
    config(['src/vocab.ts']);
    put(
      'src/svc.ts',
      [
        'export const a = `x${y ? `${"active"}` : 1}`;',
        'export const b = `active${y}`;',
        'export const c = `active`;',
        '',
      ].join('\n'),
    );
    assert.deepEqual(recordedCounts(), { 'vocab-literal:Status.Active|src/svc.ts': 2 });
  });
});

describe('vocab-literal, Python', { skip: NO_PY || NO_TS }, () => {
  beforeEach(() => {
    put('src/a.ts', '');
    config(['app/vocab.py']);
    put(
      'app/vocab.py',
      [
        'from enum import Enum, StrEnum',
        '',
        'class Status(StrEnum):',
        '    ACTIVE = "active"',
        '    CLOSED = "closed"  # trailing comment',
        '',
        'class Role(str, Enum):',
        '    ADMIN = "admin"',
        '',
        'class Color(Enum):',
        '    RED = "red"',
        '',
        'LIMIT = "limit"',
        '',
      ].join('\n'),
    );
  });

  it('flags plain string literals only', () => {
    put(
      'app/svc.py',
      [
        '"""Docstring about active."""',
        'a = "active"',
        "b = 'admin'",
        'c = f"closed"',
        'd = b"active"',
        'e = "red"',
        'f = "limit"',
        '# "closed" in a comment',
        "g = '''active'''",
        'h = "closed"',
        '',
      ].join('\n'),
    );
    put('app/test_svc.py', 'a = "active"\n');
    put('tests/helpers.py', 'a = "active"\n');
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:Status.ACTIVE|app/svc.py': 2,
      'vocab-literal:Role.ADMIN|app/svc.py': 1,
      'vocab-literal:Status.CLOSED|app/svc.py': 2,
    });
  });

  it('keeps TypeScript and Python tables apart', () => {
    put('src/a.ts', "export const a = 'active';\n");
    assert.equal(g(['check']).status, 0);
  });
});

describe('migration from the v3 no-vocab-literal rule', () => {
  it('the templates and skills no longer ship the old rule', () => {
    assert.equal(
      existsSync(join(REPO, 'templates/packs/core/ast-grep/rules/no-vocab-literal.yml')),
      false,
    );
    for (const skill of readdirSync(join(REPO, 'skills'))) {
      const file = join(REPO, 'skills', skill, 'SKILL.md');
      if (!existsSync(file)) continue;
      assert.doesNotMatch(
        readFileSync(file, 'utf8'),
        /tmpl:templates\/packs\/core\/ast-grep\/rules\/no-vocab-literal/,
      );
    }
    assert.ok(existsSync(join(REPO, 'templates/packs/core/vocab/vocab.json')));
  });

  it(
    'removing the old rule and writing the config swaps the baseline keys',
    { skip: NO_TS },
    () => {
      // A v3 repo: the old rule found the literal, and the baseline recorded it.
      put('sgconfig.yml', 'ruleDirs:\n  - rules\n');
      put('rules/no-vocab-literal.yml', 'id: no-vocab-literal\n');
      put('src/vocab.ts', 'export const Status = { Active: "active" } as const;\n');
      put('src/svc.ts', "export const a = 'active';\n");
      fake('ast-grep', {
        stdout: `${JSON.stringify({ ruleId: 'no-vocab-literal', file: 'src/svc.ts', message: 'm', range: { start: { line: 0 } } })}\n`,
        status: 1,
      });
      assert.deepEqual(recordedCounts(), { 'ast-grep:no-vocab-literal|src/svc.ts': 1 });

      // The migration the skills describe: delete the old rule, write the config.
      g(['check']);
      fake('ast-grep', { stdout: '' });
      config(['src/vocab.ts']);
      const stale = g(['check', '--strict-baseline']);
      assert.equal(stale.status, 1, 'the same literal is now a new finding under a new key');
      assert.match(stale.out, /vocab-literal Status\.Active/);

      // The debt moved, it did not grow: a human reviews it and resets the baseline.
      assert.equal(g(['baseline', '--reset']).status, 0, 'reset');
      assert.equal(g(['check', '--strict-baseline']).status, 0);
    },
  );
});
