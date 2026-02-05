/**
 * Tests for useExport hook
 *
 * Issue #20: CCD-REQ-009 Export and Sharing
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExport } from '../src/hooks/useExport';
import type { GraphIR } from '../src/types';

// Mock clipboard API
const mockClipboard = {
  write: vi.fn(),
  writeText: vi.fn(),
};

// Mock URL methods
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();

beforeAll(() => {
  // Setup clipboard mock
  Object.defineProperty(navigator, 'clipboard', {
    value: mockClipboard,
    writable: true,
    configurable: true,
  });

  // Setup URL mocks
  URL.createObjectURL = mockCreateObjectURL;
  URL.revokeObjectURL = mockRevokeObjectURL;
});

describe('useExport', () => {
  const mockGraphIR: GraphIR = {
    nodes: [
      {
        id: 'node-1',
        type: 'service',
        label: 'AuthService',
        properties: {},
      },
      {
        id: 'node-2',
        type: 'database',
        label: 'UserDB',
        properties: {},
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        type: 'data_flow',
        properties: {},
      },
    ],
    metadata: {
      version: '1.0.0',
      generatedBy: 'test',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClipboard.write.mockResolvedValue(undefined);
    mockClipboard.writeText.mockResolvedValue(undefined);
  });

  describe('export formats', () => {
    it('should list available export formats', () => {
      const { result } = renderHook(() => useExport());

      expect(result.current.availableFormats).toContain('png');
      expect(result.current.availableFormats).toContain('svg');
      expect(result.current.availableFormats).toContain('coral-dsl');
      expect(result.current.availableFormats).toContain('json');
      expect(result.current.availableFormats).toContain('markdown');
    });
  });

  describe('exportToCoralDSL', () => {
    it('should export graph to Coral DSL format', async () => {
      const { result } = renderHook(() => useExport());

      let dslContent: string = '';
      await act(async () => {
        dslContent = await result.current.exportToCoralDSL(mockGraphIR);
      });

      // Should contain node declarations
      expect(dslContent).toContain('service');
      expect(dslContent).toContain('AuthService');
      expect(dslContent).toContain('database');
      expect(dslContent).toContain('UserDB');
      // Should contain edge
      expect(dslContent).toContain('->');
    });
  });

  describe('exportToJSON', () => {
    it('should export graph to JSON format', async () => {
      const { result } = renderHook(() => useExport());

      let jsonContent: string = '';
      await act(async () => {
        jsonContent = await result.current.exportToJSON(mockGraphIR);
      });

      const parsed = JSON.parse(jsonContent);
      expect(parsed.nodes).toHaveLength(2);
      expect(parsed.edges).toHaveLength(1);
    });

    it('should pretty-print JSON by default', async () => {
      const { result } = renderHook(() => useExport());

      let jsonContent: string = '';
      await act(async () => {
        jsonContent = await result.current.exportToJSON(mockGraphIR);
      });

      // Pretty-printed JSON has newlines
      expect(jsonContent).toContain('\n');
    });
  });

  describe('exportToMarkdown', () => {
    it('should export annotations as markdown', async () => {
      const { result } = renderHook(() => useExport());

      const annotations = {
        version: '1.0.0',
        nodes: {
          'node-1': {
            symbolId: 'node-1',
            note: 'Handles authentication',
            tags: ['core', 'auth'],
          },
        },
        edges: {},
        groups: [],
        tags: [
          { id: 'core', name: 'Core', color: '#ff0000' },
          { id: 'auth', name: 'Auth', color: '#00ff00' },
        ],
        orphaned: [],
      };

      let markdown: string = '';
      await act(async () => {
        markdown = await result.current.exportToMarkdown(mockGraphIR, annotations);
      });

      // Should contain headers
      expect(markdown).toContain('# Diagram Documentation');
      // Should contain node info
      expect(markdown).toContain('AuthService');
      expect(markdown).toContain('Handles authentication');
      // Should contain tags
      expect(markdown).toContain('core');
      expect(markdown).toContain('auth');
    });
  });

  describe('copyToClipboard', () => {
    it('should copy text to clipboard', async () => {
      const { result } = renderHook(() => useExport());

      await act(async () => {
        await result.current.copyToClipboard('Test content');
      });

      expect(mockClipboard.writeText).toHaveBeenCalledWith('Test content');
    });
  });

  describe('downloadFile', () => {
    it('should create download link', async () => {
      const { result } = renderHook(() => useExport());

      // Mock document.createElement and click
      const mockLink = {
        href: '',
        download: '',
        click: vi.fn(),
        remove: vi.fn(),
      };
      const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValueOnce(mockLink as any);
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => mockLink as any);

      await act(async () => {
        await result.current.downloadFile('test content', 'test.txt', 'text/plain');
      });

      expect(mockLink.download).toBe('test.txt');
      expect(mockLink.click).toHaveBeenCalled();

      // Restore mocks
      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
    });
  });

  describe('export state', () => {
    it('should track exporting state', async () => {
      const { result } = renderHook(() => useExport());

      expect(result.current.isExporting).toBe(false);

      // During export, isExporting should be true
      // After export completes, it should be false
      await act(async () => {
        await result.current.exportToJSON(mockGraphIR);
      });

      expect(result.current.isExporting).toBe(false);
    });

    it('should track export errors', async () => {
      const { result } = renderHook(() => useExport());

      mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard error'));

      await act(async () => {
        try {
          await result.current.copyToClipboard('test');
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe('Clipboard error');
    });
  });
});
