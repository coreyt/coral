import { defineConfig } from 'vitest/config';
import base from './vitest.config.js';
import { benchmarkEnvironment } from '../../scripts/performance-policy.mjs';

benchmarkEnvironment();

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['test/*-performance*.test.ts'],
    exclude: [],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    retry: 0,
    coverage: { enabled: false },
  },
});
