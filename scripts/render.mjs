#!/usr/bin/env node
// render.mjs: copy each template into the skills that embed it, so skills stay
// self-contained (they work from a raw URL) while templates/ stays the single source.
//
// In a SKILL.md, a block like this is replaced with the file's current content:
//   <!-- tmpl:templates/shared/.oxlintrc.json -->
//   ...anything...
//   <!-- /tmpl -->
//
//   node scripts/render.mjs           rewrite skills in place
//   node scripts/render.mjs --check   exit 1 if any skill is out of date (CI)

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const REPO = join(import.meta.dirname, '..');
const SKILLS = join(REPO, 'skills');
const BLOCK = /<!-- tmpl:(\S+) -->\n[\s\S]*?<!-- \/tmpl -->/g;
const LANG = {
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.mjs': 'js',
  '.js': 'js',
  '.ts': 'ts',
  '.md': 'markdown',
};

function fence(path) {
  const body = readFileSync(join(REPO, path), 'utf8').trimEnd();
  const longest = Math.max(2, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = '`'.repeat(longest + 1);
  return `<!-- tmpl:${path} -->\n${ticks}${LANG[extname(path)] ?? ''}\n${body}\n${ticks}\n<!-- /tmpl -->`;
}

const check = process.argv.includes('--check');
const stale = [];
const missing = [];

for (const skill of readdirSync(SKILLS)) {
  const file = join(SKILLS, skill, 'SKILL.md');
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  const rendered = text.replaceAll(BLOCK, (_, path) => {
    if (!existsSync(join(REPO, path))) {
      missing.push(`${skill}: ${path}`);
      return _;
    }
    return fence(path);
  });
  if (rendered === text) continue;
  if (check) stale.push(skill);
  else writeFileSync(file, rendered);
}

if (missing.length > 0) {
  console.error(`render: missing templates:\n  ${missing.join('\n  ')}`);
  process.exitCode = 1;
} else if (stale.length > 0) {
  console.error(`render: out of date: ${stale.join(', ')}. Run: node scripts/render.mjs`);
  process.exitCode = 1;
} else {
  console.log(check ? 'render: skills match templates' : 'render: skills updated');
}
