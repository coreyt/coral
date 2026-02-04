import { defineConfig } from 'vitest/config';

// Tests with known memory issues during teardown
// See dev/vitest-memory-issue.md for details
const MEMORY_ISSUE_TESTS = [
  'test/useFileTree.test.ts',
];

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // Skip memory-intensive tests in CI to avoid false failures
    exclude: process.env.CI ? MEMORY_ISSUE_TESTS : [],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
    },
  },
});
