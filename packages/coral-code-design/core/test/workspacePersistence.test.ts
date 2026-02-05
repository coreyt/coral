/**
 * Workspace Persistence Tests
 *
 * Tests for saving and loading workspace configuration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FileSystemAdapter } from '../src/providers/WorkspaceProvider';
import type { Workspace, NamedLayout, AnnotationStore } from '../src/types';

// Mock file system adapter
function createMockFileSystem(): FileSystemAdapter & {
  files: Map<string, string>;
  dirs: Set<string>;
} {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  return {
    files,
    dirs,
    async readFile(path: string): Promise<string> {
      const content = files.get(path);
      if (!content) throw new Error(`File not found: ${path}`);
      return content;
    },
    async writeFile(path: string, content: string): Promise<void> {
      files.set(path, content);
    },
    async exists(path: string): Promise<boolean> {
      return files.has(path) || dirs.has(path);
    },
    async mkdir(path: string): Promise<void> {
      dirs.add(path);
    },
    async readDir(path: string): Promise<string[]> {
      const entries: string[] = [];
      for (const filePath of files.keys()) {
        if (filePath.startsWith(path + '/')) {
          const relative = filePath.slice(path.length + 1);
          const firstSegment = relative.split('/')[0];
          if (!entries.includes(firstSegment)) {
            entries.push(firstSegment);
          }
        }
      }
      return entries;
    },
  };
}

// Helper to create test workspace
function createTestWorkspace(): Workspace {
  return {
    id: 'test-workspace-id',
    name: 'Test Workspace',
    rootPath: '/test/project',
    armadaConnection: {
      serverUrl: 'http://localhost:8765',
      mode: 'call-graph',
    },
    openDiagrams: [
      { id: 'diagram-1', name: 'Module Graph', type: 'module-graph', scope: {} },
    ],
    activeLayout: {
      mode: 'tabs',
      panes: [],
      linkedSelection: true,
      linkedNavigation: false,
      scopeLinking: {
        enabled: false,
        mode: 'manual',
        primaryPane: '',
        linkedPanes: [],
      },
    },
    annotations: {
      version: '1.0.0',
      nodes: {},
      edges: {},
      groups: [],
      tags: [],
      orphaned: [],
    },
    settings: {
      defaultNotation: 'code',
      defaultDiagramType: 'module-graph',
      autoRefresh: false,
      refreshInterval: 30000,
    },
  };
}

// Import the persistence utilities (to be implemented)
import {
  saveWorkspaceConfig,
  loadWorkspaceConfig,
  saveLayout,
  loadLayouts,
  saveAnnotations,
  loadAnnotations,
} from '../src/persistence/workspacePersistence';

describe('Workspace Persistence', () => {
  let fs: ReturnType<typeof createMockFileSystem>;

  beforeEach(() => {
    fs = createMockFileSystem();
  });

  describe('saveWorkspaceConfig', () => {
    it('should save workspace config to .coral-code-design/workspace.json', async () => {
      const workspace = createTestWorkspace();

      await saveWorkspaceConfig(fs, workspace);

      expect(fs.files.has('/test/project/.coral-code-design/workspace.json')).toBe(true);

      const saved = JSON.parse(
        fs.files.get('/test/project/.coral-code-design/workspace.json')!
      );
      expect(saved.id).toBe('test-workspace-id');
      expect(saved.name).toBe('Test Workspace');
    });

    it('should create .coral-code-design directory if it does not exist', async () => {
      const workspace = createTestWorkspace();

      await saveWorkspaceConfig(fs, workspace);

      expect(fs.dirs.has('/test/project/.coral-code-design')).toBe(true);
    });

    it('should exclude transient state from saved config', async () => {
      const workspace = createTestWorkspace();

      await saveWorkspaceConfig(fs, workspace);

      const saved = JSON.parse(
        fs.files.get('/test/project/.coral-code-design/workspace.json')!
      );

      // These should be present
      expect(saved.id).toBeDefined();
      expect(saved.openDiagrams).toBeDefined();
      expect(saved.settings).toBeDefined();

      // schemaVersion should be added
      expect(saved.schemaVersion).toBe('1.0.0');
    });
  });

  describe('loadWorkspaceConfig', () => {
    it('should load workspace config from .coral-code-design/workspace.json', async () => {
      const workspace = createTestWorkspace();
      fs.files.set(
        '/test/project/.coral-code-design/workspace.json',
        JSON.stringify({ ...workspace, schemaVersion: '1.0.0' })
      );

      const loaded = await loadWorkspaceConfig(fs, '/test/project');

      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe('test-workspace-id');
      expect(loaded!.name).toBe('Test Workspace');
    });

    it('should return null if config does not exist', async () => {
      const loaded = await loadWorkspaceConfig(fs, '/test/project');

      expect(loaded).toBeNull();
    });

    it('should handle corrupted config gracefully', async () => {
      fs.files.set(
        '/test/project/.coral-code-design/workspace.json',
        'not valid json'
      );

      const loaded = await loadWorkspaceConfig(fs, '/test/project');

      expect(loaded).toBeNull();
    });
  });

  describe('Layout Persistence', () => {
    const testLayout: NamedLayout = {
      id: 'layout-1',
      name: 'My Layout',
      description: 'Test layout',
      createdAt: '2026-02-01T00:00:00Z',
      modifiedAt: '2026-02-01T00:00:00Z',
      config: {
        mode: 'split-h',
        panes: [],
        linkedSelection: true,
        linkedNavigation: false,
        scopeLinking: {
          enabled: false,
          mode: 'manual',
          primaryPane: '',
          linkedPanes: [],
        },
      },
      diagrams: [],
    };

    it('should save layout to .coral-code-design/layouts/<id>.json', async () => {
      await saveLayout(fs, '/test/project', testLayout);

      expect(
        fs.files.has('/test/project/.coral-code-design/layouts/layout-1.json')
      ).toBe(true);
    });

    it('should load all layouts from .coral-code-design/layouts/', async () => {
      fs.dirs.add('/test/project/.coral-code-design');
      fs.dirs.add('/test/project/.coral-code-design/layouts');
      fs.files.set(
        '/test/project/.coral-code-design/layouts/layout-1.json',
        JSON.stringify(testLayout)
      );
      fs.files.set(
        '/test/project/.coral-code-design/layouts/layout-2.json',
        JSON.stringify({ ...testLayout, id: 'layout-2', name: 'Layout 2' })
      );

      const layouts = await loadLayouts(fs, '/test/project');

      expect(layouts).toHaveLength(2);
      expect(layouts.map(l => l.id).sort()).toEqual(['layout-1', 'layout-2']);
    });

    it('should return empty array if layouts directory does not exist', async () => {
      const layouts = await loadLayouts(fs, '/test/project');

      expect(layouts).toEqual([]);
    });
  });

  describe('Annotation Persistence', () => {
    const testAnnotations: AnnotationStore = {
      version: '1.0.0',
      nodes: {
        'symbol-1': {
          symbolId: 'symbol-1',
          note: 'Test note',
          color: '#ff0000',
          tags: ['important'],
        },
      },
      edges: {},
      groups: [],
      tags: [{ id: 'important', name: 'Important', color: '#ff0000' }],
      orphaned: [],
    };

    it('should save annotations to .coral-code-design/annotations.json', async () => {
      await saveAnnotations(fs, '/test/project', testAnnotations);

      expect(
        fs.files.has('/test/project/.coral-code-design/annotations.json')
      ).toBe(true);
    });

    it('should load annotations from .coral-code-design/annotations.json', async () => {
      fs.files.set(
        '/test/project/.coral-code-design/annotations.json',
        JSON.stringify(testAnnotations)
      );

      const loaded = await loadAnnotations(fs, '/test/project');

      expect(loaded).not.toBeNull();
      expect(loaded!.nodes['symbol-1'].note).toBe('Test note');
    });

    it('should return null if annotations file does not exist', async () => {
      const loaded = await loadAnnotations(fs, '/test/project');

      expect(loaded).toBeNull();
    });
  });
});
