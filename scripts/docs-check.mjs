#!/usr/bin/env node
// docs-check.mjs: fail when a markdown file names a repo path that does not exist.
//
//   node scripts/docs-check.mjs
//
// Scans docs/, skills/, templates/ and the root markdown files. Fenced code, inline code, URLs
// and template markers are skipped. Put <!-- docs-check-ignore --> on or above a line that names
// a hypothetical path on purpose.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SCAN_DIRS = ['docs', 'skills', 'templates'];
const ROOT_FILES = ['README.md', 'CONTRIBUTING.md', 'AGENTS.md'];

// Relative links, or paths rooted at a top-level repo directory. Extensions longest-first.
const PATH_PATTERN =
  /(?:\.\.\/|\.\/|\b(?:docs|skills|scripts|templates|test)\/)[\w/.-]+\.(?:json|yaml|tsx|jsx|mjs|cjs|ts|js|md|yml)/g;
// Markdown link targets that are not URLs or in-page anchors: [text](target#anchor).
const LINK_PATTERN = /\]\((?![a-z][\w+.-]*:|#)([^)\s#]+)/gi;
const IGNORE = /<!--\s*docs-check-ignore\s*-->/;
const TEMPLATE_MARKER = /<!-- \/?tmpl/;

function markdownFiles(dir) {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

function brokenRefs(file) {
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
  const broken = [];
  let fenced = false;
  for (const [i, line] of lines.entries()) {
    if (/^(`{3,}|~{3,})/.test(line.trim())) {
      fenced = !fenced;
      continue;
    }
    if (fenced || TEMPLATE_MARKER.test(line) || IGNORE.test(line)) continue;
    if (i > 0 && IGNORE.test(lines[i - 1])) continue;
    const prose = line.replaceAll(/`[^`]+`/g, '');
    const refs = new Map();
    for (const match of prose.matchAll(PATH_PATTERN)) {
      if (/https?:\/\/\S*$/.test(prose.slice(0, match.index))) continue;
      const ref = match[0];
      refs.set(ref, ref.startsWith('.') ? join(dirname(file), ref) : ref);
    }
    for (const [, target] of prose.matchAll(LINK_PATTERN)) {
      refs.set(target, target.startsWith('/') ? target.slice(1) : join(dirname(file), target));
    }
    for (const [ref, resolved] of refs) {
      if (!existsSync(join(ROOT, resolved))) broken.push(`  ${file}:${i + 1}  ${ref} (not found)`);
    }
  }
  return broken;
}

const files = [
  ...SCAN_DIRS.flatMap(markdownFiles),
  ...ROOT_FILES.filter((f) => existsSync(join(ROOT, f))),
];
const broken = files.flatMap(brokenRefs);
if (broken.length > 0) {
  console.error(`docs-check: ${broken.length} broken path reference(s)\n\n${broken.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`docs-check: ${files.length} files, no broken path references`);
}
