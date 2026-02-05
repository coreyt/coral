/**
 * Tests for path normalization utilities
 * Requirement: CORAL-REQ-019 - Path Normalization for Armada Integration
 * Issue: #42
 */

import { describe, it, expect } from 'vitest';
import { normalizePath, isAbsolutePath } from '../src/utils/pathUtils';

describe('isAbsolutePath', () => {
  describe('Unix paths', () => {
    it('detects absolute Unix paths', () => {
      expect(isAbsolutePath('/home/user/project')).toBe(true);
      expect(isAbsolutePath('/usr/local/bin')).toBe(true);
      expect(isAbsolutePath('/var/www/html/index.html')).toBe(true);
    });

    it('detects relative Unix paths', () => {
      expect(isAbsolutePath('packages/viz/src/index.ts')).toBe(false);
      expect(isAbsolutePath('./src/index.ts')).toBe(false);
      expect(isAbsolutePath('../utils/helper.ts')).toBe(false);
      expect(isAbsolutePath('index.ts')).toBe(false);
    });
  });

  describe('Windows paths', () => {
    it('detects absolute Windows paths', () => {
      expect(isAbsolutePath('C:\\project\\src')).toBe(true);
      expect(isAbsolutePath('D:\\Documents\\file.txt')).toBe(true);
      expect(isAbsolutePath('C:/project/src')).toBe(true);
    });

    it('detects relative Windows paths', () => {
      expect(isAbsolutePath('packages\\viz\\src')).toBe(false);
      expect(isAbsolutePath('.\\src\\index.ts')).toBe(false);
      expect(isAbsolutePath('..\\utils\\helper.ts')).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('handles empty string', () => {
      expect(isAbsolutePath('')).toBe(false);
    });

    it('handles single character paths', () => {
      expect(isAbsolutePath('/')).toBe(true);
      expect(isAbsolutePath('a')).toBe(false);
    });
  });
});

describe('normalizePath', () => {
  describe('Unix paths with workspace root', () => {
    const workspaceRoot = '/home/user/project';

    it('converts relative path to absolute', () => {
      expect(normalizePath('packages/viz/src/index.ts', workspaceRoot))
        .toBe('/home/user/project/packages/viz/src/index.ts');
    });

    it('converts relative path with ./ prefix', () => {
      expect(normalizePath('./packages/viz/src/index.ts', workspaceRoot))
        .toBe('/home/user/project/packages/viz/src/index.ts');
    });

    it('leaves absolute path unchanged', () => {
      expect(normalizePath('/home/user/project/packages/viz/src/index.ts', workspaceRoot))
        .toBe('/home/user/project/packages/viz/src/index.ts');
    });

    it('handles path with parent directory references', () => {
      expect(normalizePath('packages/../packages/viz/src/index.ts', workspaceRoot))
        .toBe('/home/user/project/packages/viz/src/index.ts');
    });

    it('removes trailing slashes from workspace root', () => {
      expect(normalizePath('packages/viz', '/home/user/project/'))
        .toBe('/home/user/project/packages/viz');
    });

    it('handles single filename', () => {
      expect(normalizePath('README.md', workspaceRoot))
        .toBe('/home/user/project/README.md');
    });
  });

  describe('Windows paths with workspace root', () => {
    const workspaceRoot = 'C:\\project';

    it('converts relative path to absolute with forward slashes', () => {
      expect(normalizePath('packages\\viz\\src\\index.ts', workspaceRoot))
        .toBe('C:/project/packages/viz/src/index.ts');
    });

    it('normalizes backslashes to forward slashes in absolute path', () => {
      expect(normalizePath('C:\\project\\packages\\viz', workspaceRoot))
        .toBe('C:/project/packages/viz');
    });

    it('handles mixed slashes', () => {
      expect(normalizePath('packages/viz\\src/index.ts', workspaceRoot))
        .toBe('C:/project/packages/viz/src/index.ts');
    });
  });

  describe('No workspace root', () => {
    it('returns relative path unchanged when no root provided', () => {
      expect(normalizePath('packages/viz/src/index.ts', undefined))
        .toBe('packages/viz/src/index.ts');
    });

    it('returns absolute path unchanged when no root provided', () => {
      expect(normalizePath('/home/user/project/packages/viz', undefined))
        .toBe('/home/user/project/packages/viz');
    });

    it('handles empty string root', () => {
      expect(normalizePath('packages/viz/src/index.ts', ''))
        .toBe('packages/viz/src/index.ts');
    });
  });

  describe('Edge cases', () => {
    it('handles empty path', () => {
      expect(normalizePath('', '/home/user/project'))
        .toBe('/home/user/project');
    });

    it('handles path with only dots', () => {
      expect(normalizePath('.', '/home/user/project'))
        .toBe('/home/user/project');
    });

    it('handles path with only parent reference', () => {
      // '..' should resolve to parent directory
      expect(normalizePath('..', '/home/user/project'))
        .toBe('/home/user');
    });

    it('normalizes multiple consecutive slashes', () => {
      expect(normalizePath('packages//viz///src/index.ts', '/home/user/project'))
        .toBe('/home/user/project/packages/viz/src/index.ts');
    });

    it('preserves path that is just workspace root', () => {
      expect(normalizePath('/home/user/project', '/home/user/project'))
        .toBe('/home/user/project');
    });
  });

  describe('Real-world scenarios', () => {
    it('handles coral-code-design file tree paths', () => {
      const root = '/home/coreyt/projects/coral';
      expect(normalizePath('packages/viz/src/editor/DiagramRenderer.tsx', root))
        .toBe('/home/coreyt/projects/coral/packages/viz/src/editor/DiagramRenderer.tsx');
    });

    it('handles paths from Armada file tree', () => {
      const root = '/home/coreyt/projects/coral';
      const relativePath = 'packages/coral-code-design/core/src/hooks/useSymbolOutline.ts';
      expect(normalizePath(relativePath, root))
        .toBe('/home/coreyt/projects/coral/packages/coral-code-design/core/src/hooks/useSymbolOutline.ts');
    });

    it('handles path normalization for useSymbolOutline', () => {
      const root = '/home/coreyt/projects/coral';
      // User clicks on file in tree - path might be relative
      const clickedPath = 'packages/viz-demo/src/App.tsx';
      const normalized = normalizePath(clickedPath, root);

      // Should match what Armada expects
      expect(normalized).toBe('/home/coreyt/projects/coral/packages/viz-demo/src/App.tsx');
    });
  });
});
