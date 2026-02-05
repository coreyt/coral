import { defineConfig } from 'vitest/config';

// Tests with known memory issues during teardown
// See dev/vitest-memory-issue.md for details
const MEMORY_ISSUE_TESTS = [
  'test/useFileTree.test.ts',
];

// E2E tests require a running Armada instance
// Run with: ARMADA_URL=http://localhost:8765 npm test -- --testPathPattern=e2e
const E2E_TESTS = [
  'test/e2e/**/*.test.ts',
  'test/e2e/**/*.test.tsx',
];

// Build exclusion list based on environment
function getExclusions(): string[] {
  const exclusions: string[] = [];

  // Always exclude E2E tests unless ARMADA_URL is set
  if (!process.env.ARMADA_URL) {
    exclusions.push(...E2E_TESTS);
  }

  // Skip memory-intensive tests in CI
  if (process.env.CI) {
    exclusions.push(...MEMORY_ISSUE_TESTS);
  }

  return exclusions;
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: getExclusions(),
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['test/**'],
    },
    // Test groups for filtering:
    // - Unit tests: npm test (default, excludes e2e)
    // - Integration tests: npm test -- --testPathPattern=integration
    // - E2E tests: ARMADA_URL=http://localhost:8765 npm test -- --testPathPattern=e2e
  },
});
