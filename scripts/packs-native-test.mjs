#!/usr/bin/env node
// packs-native-test.mjs: the rust, dart and cpp packs against fake tools.
//
//   node --test scripts/packs-native-test.mjs

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  baselineFile,
  calls,
  fake,
  g,
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

  it('keys cargo-fmt, clippy, cargo-deny and cargo-machete findings', () => {
    assert.deepEqual(recordedCounts(), {
      'cargo-deny:policy|deny.toml': 1,
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

describe('dart pack', () => {
  beforeEach(() => {
    put('analysis_options.yaml', 'include: package:flutter_lints/flutter.yaml\n');
    put('pubspec.yaml', 'name: app\ndependencies:\n  flutter:\n    sdk: flutter\n');
    put('lib/main.dart', 'void main() {}\n');
    put('coverage/lcov.info', 'LF:10\nLH:9\n');
    fake('flutter-test', { stdout: 'All tests passed!\n', status: 0 });
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
      stdout:
        `ERROR|COMPILE_TIME_ERROR|UNDEFINED_METHOD|${state.dir}/lib/main.dart|3|5|4|Undefined method\n`,
      status: 3,
    });
    const counts = recordedCounts();
    assert.equal(counts['dart-analyze:undefined_method|lib/main.dart'], 1);
  });

  it('ratchets Flutter test coverage upward from lcov.info', () => {
    fake('dart-format', { stdout: '', status: 0 });
    fake('flutter-analyze', { stdout: 'No issues found!\n', status: 0 });
    fake('flutter-test', { stdout: 'All tests passed!\n', status: 0 });
    put('coverage/lcov.info', 'SF:lib/main.dart\nLF:10\nLH:8\nend_of_record\n');
    g(['baseline', '--init']);
    assert.equal(baselineFile().metrics['flutter-coverage'], 80);
    put('coverage/lcov.info', 'SF:lib/main.dart\nLF:10\nLH:7\nend_of_record\n');
    assert.match(g(['check']).out, /flutter-coverage 70% is below the baseline 80%/);
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
    const counts = recordedCounts();
    assert.equal(counts['clang-format:format|src/main.cpp'], 1);
    assert.equal(counts['pio-check:cppcheck.nullPointer|src/main.cpp'], 1);
  });

  it('runs pio check on full checks only', () => {
    g(['check', '--files', 'src/main.cpp']);
    assert.deepEqual(calls('pio'), []);
  });

  it('is off for pio check without check_tool in platformio.ini', () => {
    put('platformio.ini', '[env:uno]\nboard = uno\n');
    g(['check']);
    assert.deepEqual(calls('pio'), []);
  });
});
