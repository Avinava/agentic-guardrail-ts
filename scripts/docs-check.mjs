#!/usr/bin/env node

/**
 * docs-check.mjs — Detect stale path references in documentation.
 *
 * Walks docs/ and skills/ for path-shaped references and checks if they exist.
 * Designed for progressive adoption in brownfield orgs:
 *
 *   --warn-only        Print warnings but exit 0 (default when no baseline exists)
 *   --create-baseline   Snapshot current broken refs to .docs-check-baseline
 *   --strict            Fail on ALL broken refs regardless of baseline
 *
 * Supports <!-- docs-check-ignore --> comment to skip hypothetical paths in prose.
 */

import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, '.docs-check-baseline');
const SCAN_DIRS = ['docs', 'skills'];

// Matches path-shaped references in markdown: src/, packages/, reference/, scripts/, etc.
// Extensions are ordered longest-first to prevent partial matches (e.g., .json before .js)
const PATH_PATTERN = /(?:\.\.\/|\.\/|\bsrc\/|\bpackages\/[^/]+\/src\/|\breference\/|\bscripts\/|\bdocs\/|\bskills\/)[a-zA-Z0-9_/.-]+\.(?:json|yaml|tsx|jsx|mjs|cjs|ts|js|md|sh|yml)/g;

// Matches doc-check-ignore comment (on previous line or same line)
const IGNORE_COMMENT = /<!--\s*docs-check-ignore\s*-->/;

// ── CLI args ──
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const createBaseline = args.includes('--create-baseline');
const warnOnly = args.includes('--warn-only');

/**
 * Recursively collect all .md files under a directory.
 */
function collectMarkdownFiles(dir, files = []) {
  const absDir = join(ROOT, dir);
  if (!existsSync(absDir)) return files;

  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const fullPath = join(absDir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      collectMarkdownFiles(join(dir, entry.name), files);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

/**
 * Check a single markdown file for stale path references.
 * Only checks paths in markdown link syntax and explicit prose — skips fenced code blocks.
 * Returns array of { file, line, ref, resolved } objects.
 */
function checkFile(relPath) {
  const absPath = join(ROOT, relPath);
  const content = readFileSync(absPath, 'utf8');
  const lines = content.split('\n');
  const results = [];
  let inFencedBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track fenced code block state (``` or ~~~)
    if (/^(`{3,}|~{3,})/.test(line.trim())) {
      inFencedBlock = !inFencedBlock;
      continue;
    }
    if (inFencedBlock) continue;

    // Skip lines with docs-check-ignore (current line or previous line)
    if (IGNORE_COMMENT.test(line)) continue;
    if (i > 0 && IGNORE_COMMENT.test(lines[i - 1])) continue;

    // Skip inline code (`...`)
    const lineWithoutInlineCode = line.replace(/`[^`]+`/g, '');

    let match;
    PATH_PATTERN.lastIndex = 0;
    while ((match = PATH_PATTERN.exec(lineWithoutInlineCode)) !== null) {
      const ref = match[0];

      // Skip URLs (http://, https://)
      const before = lineWithoutInlineCode.substring(0, match.index);
      if (/https?:\/\/\S*$/.test(before)) continue;

      // Resolve relative to the file's directory
      const fileDir = dirname(relPath);
      let resolved;
      if (ref.startsWith('./') || ref.startsWith('../')) {
        resolved = join(fileDir, ref);
      } else {
        // Absolute-style reference from project root
        resolved = ref;
      }

      // Check if the path exists
      const absResolved = join(ROOT, resolved);
      if (!existsSync(absResolved)) {
        results.push({
          file: relPath,
          line: i + 1,
          ref,
          resolved,
          key: `${relPath}:${i + 1}:${ref}`,
        });
      }
    }
  }

  return results;
}

// ── Main ──
const mdFiles = [];
for (const dir of SCAN_DIRS) {
  collectMarkdownFiles(dir, mdFiles);
}

// Also check README.md and CONTRIBUTING.md at root
for (const rootFile of ['README.md', 'CONTRIBUTING.md']) {
  if (existsSync(join(ROOT, rootFile))) {
    mdFiles.push(rootFile);
  }
}

const allBroken = [];
for (const file of mdFiles) {
  const broken = checkFile(file);
  allBroken.push(...broken);
}

// ── Baseline handling ──
let baseline = new Set();
if (existsSync(BASELINE_FILE) && !strict) {
  const baselineContent = readFileSync(BASELINE_FILE, 'utf8');
  baseline = new Set(baselineContent.split('\n').filter(Boolean));
}

if (createBaseline) {
  const keys = allBroken.map((b) => b.key);
  writeFileSync(BASELINE_FILE, keys.join('\n') + '\n', 'utf8');
  console.log(`✓ docs-check: baseline created with ${keys.length} known broken refs`);
  console.log(`  File: ${relative(ROOT, BASELINE_FILE)}`);
  console.log(`  Fix references and remove from baseline as you go.`);
  process.exit(0);
}

// ── Classify results ──
const newBroken = allBroken.filter((b) => !baseline.has(b.key));
const baselined = allBroken.filter((b) => baseline.has(b.key));

// ── Determine mode ──
const isWarnMode = warnOnly || (!strict && !existsSync(BASELINE_FILE));

// ── Output ──
if (allBroken.length === 0) {
  console.log('✓ docs-check: no stale path references found');
  process.exit(0);
}

if (isWarnMode) {
  console.log(`⚠ docs-check: found ${allBroken.length} stale path references (warn-only mode)\n`);
  for (const b of allBroken) {
    console.log(`  ${b.file}:${b.line}  →  ${b.ref} (not found)`);
  }
  console.log(`\n  To enforce: run \`node scripts/docs-check.mjs --create-baseline\``);
  console.log(`  Then fix references and remove them from .docs-check-baseline as you go.`);
  console.log(`  See docs/known-conflicts.md for common causes.`);
  process.exit(0);
}

// Strict or baseline mode
if (newBroken.length > 0) {
  console.log(`✗ docs-check: ${newBroken.length} NEW stale path references\n`);
  for (const b of newBroken) {
    console.log(`  ${b.file}:${b.line}  →  ${b.ref} (not found)`);
  }
  if (baselined.length > 0) {
    console.log(`\n  (${baselined.length} additional known broken refs in baseline — fix as time allows)`);
  }
  process.exit(1);
}

// Only baselined issues remain
console.log(`✓ docs-check: no NEW stale path references`);
if (baselined.length > 0) {
  console.log(`  (${baselined.length} known broken refs remaining in baseline — fix as time allows)`);
}
process.exit(0);
