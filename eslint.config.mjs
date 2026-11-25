import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/build/**', '**/coverage/**', '**/node_modules/**', '**/playwright-report/**',
    'dev/experiments/**', 'docs/public/api/**',
    'packages/tree-sitter-coral/src/**', 'packages/tree-sitter-coral/**/*.js'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-case-declarations': 'off',
      'no-empty': 'off',
      'no-irregular-whitespace': 'off',
      'no-undef': 'off',
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
