// vitest.config.ts — Test runner with coverage ratcheting
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        autoUpdate: true,  // Ratchet: thresholds only go UP, never down
        statements: 50,
        branches: 30,
        functions: 40,
        lines: 50,
      },
    },
  },
});
