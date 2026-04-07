// eslint.config.js — Monorepo with architecture boundary enforcement
//
// CUSTOMIZE:
//   1. Replace '@example' with your npm org scope
//   2. Replace the tier arrays with YOUR actual package names
//   3. Update boundaries/elements to match your packages/ layout

import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import importX from 'eslint-plugin-import-x';
import eslintConfigPrettier from 'eslint-config-prettier';

// ────────────────────────────────────────────────────────────────
// Architecture tiers — a tier can import from any LOWER tier,
// never from its own tier or higher.
// ────────────────────────────────────────────────────────────────
const SCOPE = '@example';  // ← Replace with your org scope

const tier0 = ['shared-types', 'logger'];           // leaf packages
const tier1 = ['config', 'helpers'];                 // low-level utils
const tier2 = ['database', 'external-api'];          // infrastructure
const tier3 = ['domain-logic', 'processing'];        // business rules
const tier4 = ['orchestrator'];                      // combines domain + infra

const modules = (names) => names.map((n) => `${SCOPE}/${n}`);

export default tseslint.config(
  // ── Global ignores ──
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },

  // ── TypeScript recommended rules ──
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },

  // ── Architecture boundaries ──
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    ignores: ['**/__tests__/**', '**/__mocks__/**'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        // Tier 0 — leaf packages
        { type: 'shared-types', pattern: ['packages/shared-types/*'], mode: 'folder' },
        { type: 'logger',       pattern: ['packages/logger/*'],       mode: 'folder' },
        // Tier 1
        { type: 'config',  pattern: ['packages/config/*'],  mode: 'folder' },
        { type: 'helpers', pattern: ['packages/helpers/*'], mode: 'folder' },
        // Tier 2
        { type: 'database',     pattern: ['packages/database/*'],     mode: 'folder' },
        { type: 'external-api', pattern: ['packages/external-api/*'], mode: 'folder' },
        // Tier 3
        { type: 'domain-logic', pattern: ['packages/domain-logic/*'], mode: 'folder' },
        { type: 'processing',   pattern: ['packages/processing/*'],   mode: 'folder' },
        // Tier 4
        { type: 'orchestrator', pattern: ['packages/orchestrator/*'], mode: 'folder' },
        // Top tier — apps (no restrictions)
        { type: 'app', pattern: ['apps/*'], mode: 'folder' },
      ],
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          rules: [
            // Tier 0: no workspace imports at all
            {
              from: { type: tier0 },
              disallow: { dependency: { module: `${SCOPE}/*` } },
            },
            // Tier 1: can only import tier 0
            {
              from: { type: tier1 },
              disallow: {
                dependency: {
                  module: modules([...tier1, ...tier2, ...tier3, ...tier4]),
                },
              },
            },
            // Tier 2: can import tier 0 + 1
            {
              from: { type: tier2 },
              disallow: {
                dependency: {
                  module: modules([...tier2, ...tier3, ...tier4]),
                },
              },
            },
            // Tier 3: can import tier 0 + 1 + 2
            {
              from: { type: tier3 },
              disallow: {
                dependency: {
                  module: modules([...tier3, ...tier4]),
                },
              },
            },
            // Tier 4: can import tier 0 + 1 + 2 + 3
            {
              from: { type: tier4 },
              disallow: {
                dependency: {
                  module: modules([...tier4]),
                },
              },
            },
            // Top tier (apps): no restrictions — intentionally omitted
          ],
        },
      ],
    },
  },

  // ── Ban console.log — use structured logger instead ──
  {
    files: ['packages/*/src/**/*.ts'],
    ignores: ['**/logger/src/**', '**/__tests__/**'],
    rules: {
      'no-console': 'error',
    },
  },

  // ── Import organization: builtins → external → internal → relative ──
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    plugins: { 'import-x': importX },
    rules: {
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-duplicates': 'error',
    },
  },

  // ── Disable Prettier-conflicting rules ──
  eslintConfigPrettier,
);
