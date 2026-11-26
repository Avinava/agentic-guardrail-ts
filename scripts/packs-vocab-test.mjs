#!/usr/bin/env node
// packs-vocab-test.mjs: the core pack's vocab-literal tool. It is JS inside the pack, so these
// tests run it for real on small TypeScript and Python fixtures (only oxlint and friends are fake).
//
//   node --test scripts/packs-vocab-test.mjs

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
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
    config(['src/vocab.ts'], { excludeMembers: 'Status.*' });
    assert.match(g(['check']).out, /"excludeMembers" is a list/);
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

  it('names members by scope: no function-local or non-exported helpers, namespaces qualified', () => {
    put(
      'src/vocab.ts',
      [
        'function draft() {',
        '  const Tmp = { Active: "active", Other: "other" } as const;',
        '  return Tmp.Active;',
        '}',
        'const Hidden = { Secret: "secret" } as const;',
        'export const Status = { Active: "active" } as const;',
        'export namespace Domain {',
        '  export enum Level { High = "high" }',
        '  enum Private { Low = "low" }',
        '  export namespace Inner { export const Kind = { A: "kind-a" } as const; }',
        '}',
        'export namespace Outer.Deep { export enum E { X = "deep-x" } }',
        'const Renamed = { R: "renamed" } as const;',
        'export { Renamed as Public };',
        '',
      ].join('\n'),
    );
    config(['src/vocab.ts']);
    put(
      'src/svc.ts',
      [
        'export const v = ["active", "other", "secret", "high", "low", "kind-a", "deep-x", "renamed"];',
        '',
      ].join('\n'),
    );
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:Status.Active|src/svc.ts': 1,
      'vocab-literal:Domain.Level.High|src/svc.ts': 1,
      'vocab-literal:Domain.Inner.Kind.A|src/svc.ts': 1,
      'vocab-literal:Outer.Deep.E.X|src/svc.ts': 1,
      'vocab-literal:Public.R|src/svc.ts': 1,
    });
  });

  it('unwraps parenthesised and asserted enum initialisers', () => {
    put(
      'src/vocab.ts',
      'export enum Role { Admin = ("admin"), Guest = "guest" as const, Own = ("own") }\n',
    );
    config(['src/vocab.ts']);
    put('src/svc.ts', 'export const v = ["admin", "guest", "own"];\n');
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:Role.Admin|src/svc.ts': 1,
      'vocab-literal:Role.Guest|src/svc.ts': 1,
      'vocab-literal:Role.Own|src/svc.ts': 1,
    });
  });

  it('Python: module-level classes only, nested names qualified, aliased StrEnum resolved', () => {
    put(
      'app/vocab.py',
      [
        'from enum import StrEnum as S, Enum as E',
        'import enum as e',
        'def draft():',
        '    class Tmp(S):',
        '        OTHER = "other"',
        'class Status(S):',
        '    ACTIVE = "active"',
        'class Kind(str, E):',
        '    K = "kind"',
        'class Third(e.StrEnum):',
        '    T = "third"',
        'class Outer:',
        '    class Inner(S):',
        '        I = "inner"',
        'class _Private(S):',
        '    P = "private"',
        'class Dup(S):',
        '    ACTIVE = "active"',
        '',
      ].join('\n'),
    );
    config(['app/vocab.py']);
    put('app/svc.py', 'v = ["other", "active", "kind", "third", "inner", "private"]\n');
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:Status.ACTIVE|app/svc.py': 1,
      'vocab-literal:Kind.K|app/svc.py': 1,
      'vocab-literal:Third.T|app/svc.py': 1,
      'vocab-literal:Outer.Inner.I|app/svc.py': 1,
    });
  });

  it('Python: __all__ limits the exported classes', () => {
    put(
      'app/vocab.py',
      [
        'from enum import StrEnum',
        '__all__ = ["Status"]',
        'class Status(StrEnum):',
        '    A = "active"',
        'class Helper(StrEnum):',
        '    H = "helper"',
        '',
      ].join('\n'),
    );
    config(['app/vocab.py']);
    put('app/svc.py', 'v = ["active", "helper"]\n');
    assert.deepEqual(recordedCounts(), { 'vocab-literal:Status.A|app/svc.py': 1 });
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

describe('vocab-literal, property names and keys', { skip: NO_TS || NO_PY }, () => {
  beforeEach(() => put('src/a.ts', ''));

  it('TypeScript: a key is not a value', () => {
    put('src/vocab.ts', 'export const Status = { Ready: "ready" } as const;\n');
    config(['src/vocab.ts']);
    put(
      'src/keys.ts',
      [
        'export type U = T["ready"] | T[("ready" | "other")];',
        'export const o = { "ready": 1, ["ready"]: 2 };',
        'export interface I { "ready": string; "ready"(): void }',
        'export class C { "ready" = 1 }',
        'export enum E { "ready" = 1 }',
        'export const a = obj["ready"];',
        'const { "ready": renamed } = obj;',
        '',
      ].join('\n'),
    );
    assert.equal(g(['check']).status, 0);
    put(
      'src/values.ts',
      'export const v = { key: "ready" };\nexport type V = "ready";\nexport const w = f(["ready"])[0];\n',
    );
    assert.deepEqual(recordedCounts(), { 'vocab-literal:Status.Ready|src/values.ts': 3 });
  });

  it('Python: a key is not a value', () => {
    put('app/vocab.py', 'from enum import StrEnum\nclass S(StrEnum):\n    READY = "ready"\n');
    config(['app/vocab.py']);
    put(
      'app/keys.py',
      'a = {"ready": 1}\nb = d["ready"]\nc = d.get("ready")\ne = d.pop("ready", None)\nd["ready"] = 2\n',
    );
    assert.equal(g(['check']).status, 0);
    put(
      'app/values.py',
      'a = {"k": "ready"}\nb = d.get("k", "ready")\nc: Literal["ready"]\ne = d[f("ready")]\nget("ready")\n',
    );
    assert.deepEqual(recordedCounts(), { 'vocab-literal:S.READY|app/values.py': 5 });
  });
});

describe('vocab-literal, lists, auto() and excluded members', { skip: NO_TS || NO_PY }, () => {
  beforeEach(() => put('src/a.ts', ''));

  it('reads as const string arrays; a named member wins over a list entry', () => {
    put(
      'src/vocab.ts',
      [
        'export const ALL = ["alpha", "open"] as const;',
        'export const Status = { Open: "open" } as const;',
        'export const KINDS = ["beta"] as const satisfies readonly string[];',
        'export const Loose = ["loose"];',
        '',
      ].join('\n'),
    );
    config(['src/vocab.ts']);
    put('src/svc.ts', 'export const v = ["alpha", "open", "beta", "loose"];\n');
    assert.match(g(['check']).out, /"alpha" is an entry of ALL/);
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:ALL.alpha|src/svc.ts': 1,
      'vocab-literal:Status.Open|src/svc.ts': 1,
      'vocab-literal:KINDS.beta|src/svc.ts': 1,
    });
  });

  it('accepts a module that holds only arrays', () => {
    put('src/vocab.ts', 'export const KINDS = ["alpha"] as const;\n');
    config(['src/vocab.ts']);
    put('src/svc.ts', 'export const y = "alpha";\n');
    assert.deepEqual(recordedCounts(), { 'vocab-literal:KINDS.alpha|src/svc.ts': 1 });
  });

  it('Python: auto() in a StrEnum is the lower-cased name', () => {
    put(
      'app/vocab.py',
      [
        'import enum',
        'from enum import Enum, StrEnum, auto as a',
        'class S(StrEnum):',
        '    Alpha = a()',
        '    BETA = enum.auto()',
        'class Custom(StrEnum):',
        '    def _generate_next_value_(name, start, count, last_values):',
        '        return name',
        '    GAMMA = a()',
        'class N(str, Enum):',
        '    DELTA = a()',
        '    E = "e"',
        '',
      ].join('\n'),
    );
    config(['app/vocab.py']);
    put('app/svc.py', 'v = ["alpha", "beta", "gamma", "delta"]\n');
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:S.Alpha|app/svc.py': 1,
      'vocab-literal:S.BETA|app/svc.py': 1,
    });
  });

  it('excludeMembers drops members by name, nested ones too', () => {
    put(
      'src/vocab.ts',
      [
        'export const words = { item: "item", deep: { title: "Title" } } as const;',
        'export const Status = { Open: "open", Item: "item" } as const;',
        '',
      ].join('\n'),
    );
    config(['src/vocab.ts'], { excludeMembers: ['words.*'] });
    put('src/svc.ts', 'export const v = ["item", "Title", "open"];\n');
    assert.deepEqual(recordedCounts(), {
      'vocab-literal:Status.Item|src/svc.ts': 1,
      'vocab-literal:Status.Open|src/svc.ts': 1,
    });
  });
});

describe('vocab-literal, which TypeScript parses', () => {
  const modern = 'exports.version = "7.0.2";\n';
  const vocab = 'export const S = { A: "ready" } as const;\n';

  beforeEach(() => {
    put('src/a.ts', '');
    rmSync(join(state.dir, 'node_modules/typescript'), { force: true });
    put('src/vocab.ts', vocab);
    config(['src/vocab.ts']);
    put('src/svc.ts', 'export const a = "ready";\n');
  });

  it('names the TS 6 alias when typescript has no compiler API', () => {
    put('node_modules/typescript/package.json', '{"name":"typescript","version":"7.0.2"}');
    put('node_modules/typescript/index.js', modern);
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /typescript 7\.0\.2 has no compiler API/);
    assert.match(r.out, /npm:@typescript\/typescript6/);
  });

  it('names the alias when there is no typescript at all', () => {
    assert.match(g(['check']).out, /was not found.*npm:@typescript\/typescript6/);
  });

  it('falls back to @typescript/typescript6', { skip: NO_TS }, () => {
    put('node_modules/typescript/index.js', modern);
    mkdirSync(join(state.dir, 'node_modules/@typescript'), { recursive: true });
    symlinkSync(TYPESCRIPT, join(state.dir, 'node_modules/@typescript/typescript6'));
    assert.match(g(['check']).out, /vocab-literal S\.A/);
  });

  it('finds typescript declared by a workspace member only', { skip: NO_TS }, () => {
    put('packages/core/src/vocab.ts', vocab);
    config(['packages/core/src/vocab.ts']);
    mkdirSync(join(state.dir, 'packages/core/node_modules'), { recursive: true });
    symlinkSync(TYPESCRIPT, join(state.dir, 'packages/core/node_modules/typescript'));
    assert.match(g(['check']).out, /vocab-literal S\.A/);
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
