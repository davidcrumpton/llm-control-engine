/// vitest.config.ts
/// -----------------------------------------------------------
/// Vitest configuration for the LLM Control Engine project.
///
/// - Aliases: '@/' maps to './src' for clean imports.
/// - Globals: describe/it/expect available without imports.
/// - Coverage: v8 provider, 80/75/80/80 thresholds.
/// - Mocks: auto-reset and restore between tests.
/// -----------------------------------------------------------

import { defineConfig } from 'vitest/config'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
