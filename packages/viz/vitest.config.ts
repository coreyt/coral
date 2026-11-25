import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@coral-viz/render': path.resolve(import.meta.dirname, '../render/src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['test/*-performance*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      // Report every source file, not only the ones a test happened to import.
      all: true,
      // Enforced release target (R-030). Raising these is welcome; lowering
      // them needs a reason recorded in
      // docs/contribute/reference/coverage-baseline.md.
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});
