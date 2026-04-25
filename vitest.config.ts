/// vitest.config.ts
/// -----------------------------------------------------------
/// Vitest configuration for the LLM Control Engine project.
///
/// - Aliases: '@/' maps to './src' for clean imports.
/// - Globals: describe/it/expect available without imports.
/// - Coverage: v8 provider, 80/75/80/80 thresholds.
/// - Mocks: auto-reset and restore between tests.
/// -----------------------------------------------------------

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/*.d.ts'],
      reporter: ['text', 'lcov', 'json-summary'],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    mockReset: true,
    restoreMocks: true,
  },
});