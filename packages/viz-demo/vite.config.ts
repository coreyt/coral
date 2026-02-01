import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@coral/viz': path.resolve(__dirname, '../viz/src'),
      // Force all @xyflow/react imports to use viz-demo's copy (fixes zustand provider error)
      '@xyflow/react': path.resolve(__dirname, 'node_modules/@xyflow/react'),
    },
    dedupe: ['@xyflow/react', 'react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['@xyflow/react'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
