import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Cold/warm operation budgets must not compete with other renderer files.
    fileParallelism: false,
    include: ['test/**/*.test.ts'],
    exclude: ['test/performance.test.ts', 'test/*-performance*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.ts'],
      all: true,
    },
  },
});
