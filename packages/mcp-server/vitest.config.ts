import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.ts'],
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
