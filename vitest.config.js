import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [...configDefaults.exclude, 'archi-mcp/**'],
    setupFiles: ['./tests/infrastructure/setup.js'],
    testTimeout: 120000, // 120s timeout (accounts for rate limit throttling in full suite)
    hookTimeout: 30000,  // 30s — afterEach cleanup needs time when server is rate-limited
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Sequential execution — integration tests share model state
      },
    },
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
