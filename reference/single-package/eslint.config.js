// eslint.config.js — Single package (no architecture boundaries)
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

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
