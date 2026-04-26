// eslint.config.js — Single package (no architecture boundaries)
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },

  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },

  // Import organization: builtins → external → internal → relative
  {
    files: ['src/**/*.ts'],
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

  // Runtime safety — prevent type lies that bypass the compiler
  {
    files: ['src/**/*.ts'],
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

  // Ban console.log
  {
    files: ['src/**/*.ts'],
    ignores: ['**/__tests__/**'],
    rules: {
      'no-console': 'error',
    },
  },

  eslintConfigPrettier,
);
