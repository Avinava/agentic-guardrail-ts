import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Add your valid scopes here
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
