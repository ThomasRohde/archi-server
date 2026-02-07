import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/infrastructure/setup.js'],
    testTimeout: 120000, // 120s timeout (accounts for rate limit throttling in full suite)
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['scripts/lib/**/*.js'],
      exclude: [
        'scripts/lib/vendor/**',
        'scripts/lib/core/swtImports.js'
      ]
    },
    sequence: {
      concurrent: false // Run tests sequentially to avoid model conflicts
    }
  }
});
