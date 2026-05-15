// commitlint.config.ts — Monorepo variant
// Replace the scope-enum array with your ACTUAL package names from packages/ and apps/.
// Example: packages/api, packages/auth, apps/web → scopes: 'api', 'auth', 'web'
import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // ← REPLACE with actual package names detected from packages/ and apps/
    'scope-enum': [2, 'always', [
      'deps',
      'ci',
      'release',
    ]],
    'scope-empty': [1, 'never'],
    'body-max-line-length': [0, 'always', Infinity],
  },
};

export default config;
