import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { controlledProviderFixturePlugin } from './manual/controlledProviderFixture.ts';
import { onDeviceFixturePlugin } from './manual/onDeviceFixture.ts';

function releaseIdentityPlugin(requireIdentity: boolean): Plugin {
  return {
    name: 'coral-release-identity',
    transformIndexHtml(html) {
      const serialized = process.env.CORAL_RELEASE_IDENTITY;
      if (!serialized) {
        if (requireIdentity) throw new Error('CORAL_RELEASE_IDENTITY is required');
        return html;
      }
      const identity = JSON.parse(serialized) as unknown;
      return html.replace('</head>', `<script>globalThis.__CORAL_RELEASE_IDENTITY__=Object.freeze(${JSON.stringify(identity)})</script>\n  </head>`);
    },
  };
}

export default defineConfig(({ command }) => ({
  base: '/coral/',
  plugins: [
    react(),
    releaseIdentityPlugin(command === 'build'),
    ...(command === 'serve' ? [controlledProviderFixturePlugin(), onDeviceFixturePlugin()] : []),
  ],
  resolve: {
    alias: {
      '@coral-viz/render/artwork-import': path.resolve(import.meta.dirname, '../render/src/artwork/svgIconImport029.ts'),
      '@coral-viz/render/svg-layout': path.resolve(import.meta.dirname, '../render/src/svg/layout.ts'),
      '@coral-viz/language': path.resolve(import.meta.dirname, '../language/src'),
      '@coral-viz/viz': path.resolve(import.meta.dirname, '../viz/src'),
      '@coral-viz/render': path.resolve(import.meta.dirname, '../render/src'),
    },
    dedupe: ['@xyflow/react', 'react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['@xyflow/react'],
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // Timing-only; runs under vitest.benchmark.config.ts (npm run test:performance).
    exclude: ['test/llm/spatial/resolve-performance.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      // Report every source file, not only the ones a test happened to import.
      all: true,
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 75,
        'src/{useEditorController,editorRevision}.ts': {
          statements: 80,
          lines: 80,
          functions: 80,
          branches: 75,
          perFile: true,
        },
      },
    },
  },
}));
