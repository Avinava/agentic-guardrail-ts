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
import unicorn from 'eslint-plugin-unicorn';
import sonarjs from 'eslint-plugin-sonarjs';
import jsdoc from 'eslint-plugin-jsdoc';

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
      'import-x/default': 'error',
      'import-x/named': 'error',
    },
  },

  // ── Runtime safety — prevent type lies that bypass the compiler ──
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    rules: {
      // Prevent ! operator — lies to the compiler about nullability
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Prevent {} as Foo shortcuts — use proper construction instead
      '@typescript-eslint/consistent-type-assertions': ['error', {
        assertionStyle: 'as',
        objectLiteralTypeAssertions: 'never',
      }],
      // Prevent double-cast (as unknown as T) — bypasses the type system entirely
      'no-restricted-syntax': ['error',
        {
          selector: 'TSAsExpression > TSAsExpression',
          message: 'Double type assertion (as unknown as T) bypasses the type system. Narrow properly or add an eslint-disable with a paper trail (see enforce-architecture skill).',
        },
      ],
    },
  },

  // ── Complexity & size limits ──────────────────────────────────
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', { max: 4 }],
      'max-depth': ['error', { max: 4 }],
      'max-classes-per-file': ['error', { max: 1 }],
      'no-magic-numbers': ['error', { ignore: [-1, 0, 1, 2], ignoreArrayIndexes: true, ignoreDefaultValues: true }],
      'no-nested-ternary': 'error',
    },
  },

  // ── Code quality (sonarjs) ────────────────────────────────────
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    plugins: { sonarjs },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['error', { minDuplicates: 3 }],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-collapsible-if': 'error',
      'sonarjs/no-gratuitous-expressions': 'error',
      'sonarjs/no-redundant-jump': 'error',
      'sonarjs/prefer-immediate-return': 'error',
    },
  },

  // ── Naming conventions ────────────────────────────────────────
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
        { selector: 'function', format: ['camelCase'] },
        { selector: 'parameter', format: ['camelCase'] },
        { selector: 'property', format: ['camelCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
      ],
    },
  },

  // ── ESM idioms (unicorn — selective) ─────────────────────────
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    plugins: { unicorn },
    rules: {
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'unicorn/no-array-for-each': 'error',
      'unicorn/no-for-loop': 'error',
      'unicorn/explicit-length-check': 'error',
      'unicorn/no-useless-undefined': 'error',
      'unicorn/no-array-push-push': 'error',
      'unicorn/no-lonely-if': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/no-process-exit': 'error',
      'unicorn/prefer-module': 'error',
    },
  },

  // ── Documentation (always warn — drive to zero, then flip to error) ──
  {
    files: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
    ignores: ['**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': ['warn', {
        publicOnly: true,
        require: { FunctionDeclaration: true, ClassDeclaration: true },
      }],
      'jsdoc/require-param': 'warn',
      'jsdoc/require-returns': 'warn',
      'jsdoc/check-param-names': 'warn',
    },
  },

  // ── Disable Prettier-conflicting rules ──
  eslintConfigPrettier,
);
