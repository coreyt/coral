/**
 * Path normalization utilities for Armada integration
 * Requirement: CORAL-REQ-019 - Path Normalization for Armada Integration
 * Issue: #42
 *
 * Armada's /api/symbols endpoint requires absolute file paths.
 * These utilities ensure coral-code-design converts relative paths to absolute
 * before making API calls.
 */

/**
 * Check if a path is absolute
 *
 * @param path - Path to check
 * @returns true if path is absolute, false if relative
 *
 * @example
 * isAbsolutePath('/home/user/project') // true
 * isAbsolutePath('C:\\project') // true
 * isAbsolutePath('packages/viz') // false
 * isAbsolutePath('./src/index.ts') // false
 */
export function isAbsolutePath(path: string): boolean {
  if (!path || path.length === 0) {
    return false;
  }

  // Unix absolute path (starts with /)
  if (path.startsWith('/')) {
    return true;
  }

  // Windows absolute path (C:\\ or C:/)
  // Matches: C:\, D:\, C:/, D:/, etc.
  const windowsAbsoluteRegex = /^[A-Za-z]:[/\\]/;
  if (windowsAbsoluteRegex.test(path)) {
    return true;
  }

  return false;
}

/**
 * Normalize a path to absolute, using workspace root if needed
 *
 * - If path is already absolute, return it with normalized slashes
 * - If path is relative and workspaceRoot is provided, join them
 * - If no workspaceRoot, return path as-is
 * - Always normalizes backslashes to forward slashes
 * - Removes redundant slashes and resolves . and .. references
 *
 * @param path - Path to normalize
 * @param workspaceRoot - Workspace root directory (optional)
 * @returns Normalized absolute path (or original if can't normalize)
 *
 * @example
 * normalizePath('packages/viz', '/home/user/project')
 * // => '/home/user/project/packages/viz'
 *
 * normalizePath('packages\\viz', 'C:\\project')
 * // => 'C:/project/packages/viz'
 *
 * normalizePath('/home/user/project/packages/viz', '/home/user/project')
 * // => '/home/user/project/packages/viz'
 *
 * normalizePath('packages/viz', undefined)
 * // => 'packages/viz'
 */
export function normalizePath(path: string, workspaceRoot?: string): string {
  // If no workspace root or empty root, try to normalize slashes but keep path as-is
  if (!workspaceRoot || workspaceRoot.length === 0) {
    return normalizeSlashes(path);
  }

  // Normalize slashes in both path and root
  const normalizedPath = normalizeSlashes(path);
  const normalizedRoot = normalizeSlashes(workspaceRoot).replace(/\/$/, ''); // Remove trailing slash

  // If path is already absolute, just return it normalized
  if (isAbsolutePath(normalizedPath)) {
    return normalizeDots(normalizedPath);
  }

  // If path is empty or just ".", return workspace root
  if (!normalizedPath || normalizedPath === '.') {
    return normalizedRoot;
  }

  // Remove leading ./ from relative paths
  const cleanPath = normalizedPath.replace(/^\.\//, '');

  // Join workspace root with relative path
  const joined = `${normalizedRoot}/${cleanPath}`;

  // Resolve . and .. references and remove duplicate slashes
  return normalizeDots(joined);
}

/**
 * Normalize backslashes to forward slashes
 * @internal
 */
function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Remove redundant slashes and resolve . and .. references
 * @internal
 */
function normalizeDots(path: string): string {
  // Remove multiple consecutive slashes
  let normalized = path.replace(/\/{2,}/g, '/');

  // Split into segments
  const segments = normalized.split('/');
  const result: string[] = [];

  for (const segment of segments) {
    if (segment === '.' || segment === '') {
      // Skip current directory and empty segments (except for root)
      if (result.length === 0 && segment === '') {
        // Keep leading slash for absolute paths
        result.push(segment);
      }
      continue;
    } else if (segment === '..') {
      // Go up one directory (but don't go above root)
      if (result.length > 0 && result[result.length - 1] !== '' && result[result.length - 1] !== '..') {
        result.pop();
      } else {
        // Can't go up further, keep the ..
        result.push(segment);
      }
    } else {
      result.push(segment);
    }
  }

  return result.join('/');
}
