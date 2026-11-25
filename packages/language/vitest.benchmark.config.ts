import { defineConfig } from 'vitest/config';
import { benchmarkEnvironment } from '../../scripts/performance-policy.mjs';

// Emit nonmeasurement warnings before workers and test reporting begin.
benchmarkEnvironment();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/performance.test.ts', 'test/*-performance.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    retry: 0,
    coverage: { enabled: false },
  },
});
