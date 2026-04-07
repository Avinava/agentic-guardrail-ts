// commitlint.config.ts
// Enforces Conventional Commits: feat:, fix:, refactor:, docs:, test:, chore:
// CUSTOMIZE: Replace the scope-enum array with YOUR actual package and app names.

export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        // ──── Replace these with your actual package names ────
        // packages
        'shared-types', 'config', 'logger', 'database',
        'domain-logic', 'helpers', 'external-api', 'orchestrator',
        // apps
        'cli', 'web', 'worker',
        // meta scopes
        'deps', 'ci', 'release',
      ],
    ],
  },
};
