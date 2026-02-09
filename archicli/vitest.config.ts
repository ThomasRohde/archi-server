import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 300_000,   // 5 min — stress tests are slow
    hookTimeout: 120_000,   // 2 min — cleanup can be lengthy
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,   // Sequential execution — tests share model state
      },
    },
    include: ['__tests__/**/*.test.ts'],
    reporters: ['verbose'],
  },
});
