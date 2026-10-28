import { defineConfig } from 'vitest/config';

// Coverage floors only move up. `guardrails.mjs baseline --tighten` runs coverage with
// GUARDRAILS_RATCHET=1, which lets Vitest raise the thresholds below to what is measured.
const ratchet = process.env['GUARDRAILS_RATCHET'] === '1';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      reporter: ['text-summary', 'lcov'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80,
        autoUpdate: ratchet ? (next: number): number => Math.floor(next) : false,
      },
    },
  },
});
