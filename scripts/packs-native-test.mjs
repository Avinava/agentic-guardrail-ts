#!/usr/bin/env node
// packs-native-test.mjs: the rust, dart and cpp packs against fake tools.
//
//   node --test scripts/packs-native-test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  state,
  teardown,
} from './pack-harness.mjs';

beforeEach(setup);
afterEach(teardown);

describe('rust pack', () => {
  const diag = (code, line) =>
    JSON.stringify({
      reason: 'compiler-message',
      message: {
        message: `${code} hit`,
        code: { code },
        spans: [{ is_primary: true, file_name: 'src/lib.rs', line_start: line }],
      },
    });

  beforeEach(() => {
    put(
      'Cargo.toml',
      '[package]\nname = "acme"\n\n[package.metadata.cargo-machete]\nignored = []\n',
    );
    put('rustfmt.toml', 'edition = "2024"\n');
    put('clippy.toml', '');
    put('deny.toml', '[advisories]\nversion = 2\n');
    put('src/lib.rs', 'pub fn f() {}\n');
    fake('cargo-fmt', { stdout: `Diff in ${state.dir}/src/lib.rs:1:\n`, status: 1 });
    fake('cargo-clippy', {
      stdout: `${diag('clippy::needless_return', 4)}\n{"reason":"build-finished","success":false}\n`,
      status: 101,
    });
    fake('cargo-deny', { stderr: 'error[unmaintained]: crate is unmaintained', status: 1 });
    fake('cargo-machete', {
      stdout:
        'Analyzing dependencies of crates in this directory...\nacme -- ./Cargo.toml:\n\tserde\n\trand\n',
      status: 1,
    });
  });

  it('a failing cargo-deny policy is never baselined, so it keeps failing', () => {
    const r = g(['baseline', '--init']);
    assert.equal(r.status, 1);
    assert.match(r.out, /cannot baseline while a tool is failing as a whole/);
    assert.match(r.out, /cargo-deny policy/);
    assert.equal(g(['check']).status, 1);
  });

  it('keys cargo-fmt, clippy and cargo-machete findings', () => {
    fake('cargo-deny', { status: 0 });
    assert.deepEqual(recordedCounts(), {
      'cargo-fmt:format|src/lib.rs': 1,
      'cargo-machete:unused-dependency|Cargo.toml': 2,
      'clippy:clippy::needless_return|src/lib.rs': 1,
    });
  });

  it('formats on commit and runs the crate-wide tools only on full checks', () => {
    fake('cargo-fmt', { stdout: 'Diff in src/lib.rs:1:\n', status: 1 });
    const r = g(['check', '--files', 'src/lib.rs']);
    assert.match(r.out, /cargo-fmt format/);
    assert.deepEqual(
      calls('cargo')
        .map((a) => a[0])
        .toSorted(),
      ['clippy', 'fmt'],
    );
  });

  it('does not treat a failed build as clean', () => {
    fake('cargo-fmt', { stdout: '', status: 0 });
    fake('cargo-clippy', { stderr: 'error: could not find Cargo.toml', status: 2 });
    assert.match(g(['check']).out, /clippy failed \(exit 2\)/);
  });
});

// flutter test writes coverage/lcov.info itself; the engine deletes any old one first.
const lcov = (hit, text = null) =>
  fake('flutter-test', {
    stdout: 'All tests passed!\n',
    files: { 'coverage/lcov.info': text ?? `SF:lib/main.dart\nLF:10\nLH:${hit}\nend_of_record\n` },
  });

describe('dart pack', () => {
  beforeEach(() => {
    put('analysis_options.yaml', 'include: package:flutter_lints/flutter.yaml\n');
    put('pubspec.yaml', 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n');
    put('lib/main.dart', 'void main() {}\n');
    lcov(9);
    fake('dart-format', {
      stdout: 'Changed lib/main.dart\nFormatted 1 file (1 changed)\n',
      status: 1,
    });
    fake('flutter-analyze', {
      stdout: '  error • The method is undefined • lib/main.dart:3:5 • undefined_method\n',
      status: 1,
    });
  });

  it('uses flutter analyze in a Flutter package and dart format everywhere', () => {
    assert.deepEqual(recordedCounts(), {
      'dart-analyze:undefined_method|lib/main.dart': 1,
      'dart-format:format|lib/main.dart': 1,
    });
  });

  it('parses dart analyze machine output in a plain Dart package', () => {
    put('pubspec.yaml', 'name: app\n');
    fake('dart-analyze', {
      stdout: `ERROR|COMPILE_TIME_ERROR|UNDEFINED_METHOD|${state.dir}/lib/main.dart|3|5|4|Undefined method\n`,
      status: 3,
    });
    const counts = recordedCounts();
    assert.equal(counts['dart-analyze:undefined_method|lib/main.dart'], 1);
  });

  it('ratchets Flutter test coverage upward from lcov.info', () => {
    fake('dart-format', { stdout: '', status: 0 });
    fake('flutter-analyze', { stdout: 'No issues found!\n', status: 0 });
    lcov(8);
    ci(['baseline', '--init']);
    assert.equal(baselineFile().metrics['flutter-coverage'], 80);
    lcov(7);
    assert.match(ci(['check']).out, /flutter-coverage 70% is below the baseline 80%/);
  });
});

describe('cpp pack', () => {
  beforeEach(() => {
    put('.clang-format', 'BasedOnStyle: LLVM\n');
    put('platformio.ini', '[env:uno]\nboard = uno\ncheck_tool = cppcheck\n');
    put('src/main.cpp', 'int main(){return 0;}\n');
    fake('clang-format', {
      stderr:
        'src/main.cpp:1:11: error: code should be clang-formatted [-Wclang-format-violations]\n',
      status: 1,
    });
    fake('pio', {
      stdout: JSON.stringify([
        {
          env: 'uno',
          tool: 'cppcheck',
          defects: [
            {
              id: 'nullPointer',
              severity: 'high',
              file: 'src/main.cpp',
              line: 7,
              message: 'Null pointer',
            },
          ],
        },
      ]),
    });
  });

  it('keys clang-format:format and pio-check findings', () => {
    const counts = recordedCounts({ GUARDRAILS_CI: '1' });
    assert.equal(counts['clang-format:format|src/main.cpp'], 1);
    assert.equal(counts['pio-check:cppcheck.nullPointer|src/main.cpp'], 1);
  });

  it('runs pio check on a CI full check only: not scoped, not on pre-push', () => {
    ci(['check', '--files', 'src/main.cpp']);
    assert.deepEqual(calls('pio'), []);
    g(['check']);
    assert.deepEqual(calls('pio'), []);
  });

  it('is off for pio check without check_tool in platformio.ini', () => {
    put('platformio.ini', '[env:uno]\nboard = uno\n');
    ci(['check']);
    assert.deepEqual(calls('pio'), []);
  });
});

describe('flutter coverage fails closed', () => {
  beforeEach(() => {
    put('analysis_options.yaml', 'include: x\n');
    put('pubspec.yaml', 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n');
    fake('flutter-analyze', { stdout: 'No issues found!\n' });
    fake('dart-format', { stdout: '' });
  });

  for (const [name, text] of [
    ['an empty report', ''],
    ['a report with no lines', 'SF:lib/main.dart\nLF:0\nLH:0\nend_of_record\n'],
    ['a truncated report', 'SF:lib/main.dart\nLF:10\nLH:9\n'],
    [
      'a report cut off after its first record',
      'SF:lib/a.dart\nLF:10\nLH:9\nend_of_record\nSF:lib/b.dart\nLF:10\nLH:9\n',
    ],
    [
      'a report with an unclosed record before the end',
      'SF:lib/a.dart\nLF:10\nLH:9\nSF:lib/b.dart\nLF:1\nLH:1\nend_of_record\n',
    ],
  ]) {
    it(`${name} is a failure, never 100%`, () => {
      lcov(0, text);
      const r = ci(['baseline', '--init']);
      assert.equal(r.status, 1);
      assert.match(r.out, /no usable coverage\/lcov\.info/);
    });
  }

  it('a stale report left by an earlier run is not read when this run writes none', () => {
    put('coverage/lcov.info', 'SF:lib/main.dart\nLF:10\nLH:10\nend_of_record\n');
    fake('flutter-test', { stdout: 'ok', status: 0 });
    assert.match(ci(['baseline', '--init']).out, /no usable coverage\/lcov\.info/);
  });
});

// Real `cargo clippy --message-format json -- -D warnings` output from a scratch crate (clippy 1.93).
const real = (name) => readFileSync(join(import.meta.dirname, 'fixtures', 'clippy', name), 'utf8');
// rustc's closing summary; cargo here does not forward it, older toolchains do.
const summary = (text) =>
  JSON.stringify({
    reason: 'compiler-message',
    message: { level: 'error', code: null, spans: [], message: text },
  });

describe('clippy: a broken build is not lint debt', () => {
  const compileError = JSON.stringify({
    reason: 'compiler-message',
    message: {
      level: 'error',
      message: 'mismatched types',
      code: { code: 'E0308' },
      spans: [{ is_primary: true, file_name: 'src/lib.rs', line_start: 3 }],
    },
  });

  beforeEach(() => {
    put('Cargo.toml', '[package]\nname = "acme"\n');
    put('clippy.toml', '');
    put('src/lib.rs', 'pub fn f() {}\n');
    fake('cargo-clippy', { stdout: `${compileError}\n`, status: 101 });
  });

  it('is an always-finding: the check fails and a baseline refuses it', () => {
    const r = g(['check']);
    assert.equal(r.status, 1);
    assert.match(r.out, /clippy E0308/);
    const b = g(['baseline', '--init']);
    assert.equal(b.status, 1);
    assert.match(b.out, /cannot baseline while a tool is failing as a whole/);
    assert.equal(g(['check']).status, 1);
  });

  it('a code-less error with no span (a summary) is never a finding, but the failed run still fails', () => {
    const noCode = JSON.stringify({
      reason: 'compiler-message',
      message: { level: 'error', message: 'expected item', code: null, spans: [] },
    });
    fake('cargo-clippy', { stdout: `${noCode}\n`, status: 101 });
    assert.match(g(['check']).out, /clippy failed with output it could not read \(exit 101\)/);
  });
});

describe('clippy against real output', () => {
  beforeEach(() => {
    put('Cargo.toml', '[package]\nname = "acme"\n');
    put('clippy.toml', '');
    put('src/lib.rs', 'pub fn f() {}\n');
  });

  it("a lint plus rustc's summary is a baselineable lint finding, not a compile error", () => {
    fake('cargo-clippy', {
      stdout: `${real('lint.jsonl')}${summary('aborting due to 1 previous error')}\n${summary('could not compile \`acme\` (lib) due to 1 previous error')}\n`,
      status: 101,
    });
    assert.deepEqual(recordedCounts(), { 'clippy:clippy::needless_return|src/lib.rs': 1 });
    assert.equal(g(['check']).status, 0);
  });

  it('a real syntax error is a compile error that always fails', () => {
    fake('cargo-clippy', { stdout: real('syntax-error.jsonl'), status: 101 });
    const r = g(['baseline', '--init']);
    assert.equal(r.status, 1);
    assert.match(r.out, /cannot baseline while a tool is failing as a whole/);
    assert.match(r.out, /clippy compile-error .*unclosed delimiter/);
  });

  it('a real type error is a compile error that always fails', () => {
    fake('cargo-clippy', { stdout: real('type-error.jsonl'), status: 101 });
    assert.equal(g(['baseline', '--init']).status, 1);
    assert.match(g(['check']).out, /clippy E0308 .*mismatched types/);
  });
});
