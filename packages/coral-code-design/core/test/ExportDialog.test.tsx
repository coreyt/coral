/**
 * Tests for ExportDialog component
 *
 * Issue #24: CCD-REQ-009 Export Dialog UI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportDialog } from '../src/components/ExportDialog';
import type { GraphIR, AnnotationStore } from '../src/types';

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

// Mock GraphIR
const mockGraphIR: GraphIR = {
  nodes: [
    { id: 'node1', label: 'Service A', type: 'service' },
    { id: 'node2', label: 'Database B', type: 'database' },
  ],
  edges: [
    { source: 'node1', target: 'node2', type: 'uses' },
  ],
};

// Mock AnnotationStore
const mockAnnotations: AnnotationStore = {
  version: '1.0.0',
  nodes: {
    node1: { symbolId: 'node1', note: 'Main service', tags: ['core'] },
  },
  edges: {},
  groups: [],
  tags: [{ id: 'core', name: 'Core', color: '#ff0000' }],
  orphaned: [],
};

describe('ExportDialog', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: mockClipboard });
    mockClipboard.writeText.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rendering', () => {
    it('should render when open', () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/export/i)).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      render(
        <ExportDialog
          isOpen={false}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should render format selector', () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });
  });

  describe('format selection', () => {
    it('should show Coral DSL format option', () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      const select = screen.getByRole('combobox');
      expect(select).toBeInTheDocument();

      // Check that the options exist
      const options = screen.getAllByRole('option');
      const optionTexts = options.map(opt => opt.textContent);
      expect(optionTexts).toContain('Coral DSL');
    });

    it('should show JSON format option', () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      const options = screen.getAllByRole('option');
      const optionTexts = options.map(opt => opt.textContent);
      expect(optionTexts).toContain('JSON');
    });

    it('should show Markdown format option', () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      const options = screen.getAllByRole('option');
      const optionTexts = options.map(opt => opt.textContent);
      expect(optionTexts).toContain('Markdown');
    });
  });

  describe('preview', () => {
    it('should show preview for Coral DSL', async () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      // Select Coral DSL format
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'coral-dsl' } });

      // Wait for preview to load
      await waitFor(() => {
        const preview = screen.getByTestId('export-preview');
        expect(preview.textContent).toContain('service');
      });
    });

    it('should show preview for JSON', async () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'json' } });

      await waitFor(() => {
        const preview = screen.getByTestId('export-preview');
        expect(preview.textContent).toContain('"nodes"');
      });
    });

    it('should show preview for Markdown', async () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'markdown' } });

      await waitFor(() => {
        const preview = screen.getByTestId('export-preview');
        expect(preview.textContent).toContain('# Diagram Documentation');
      });
    });
  });

  describe('copy to clipboard', () => {
    it('should copy content to clipboard', async () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      // Select format
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'json' } });

      // Wait for preview
      await waitFor(() => {
        expect(screen.getByTestId('export-preview')).toBeInTheDocument();
      });

      // Click copy button
      const copyButton = screen.getByRole('button', { name: /copy/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(mockClipboard.writeText).toHaveBeenCalled();
      });
    });

    it('should show success message after copying', async () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'json' } });

      await waitFor(() => {
        expect(screen.getByTestId('export-preview')).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: /copy/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText(/copied/i)).toBeInTheDocument();
      });
    });
  });

  describe('download', () => {
    it('should have download button', () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    });

    it('should trigger download when download button clicked', async () => {
      // Mock URL.createObjectURL and URL.revokeObjectURL
      const mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
      const mockRevokeObjectURL = vi.fn();
      global.URL.createObjectURL = mockCreateObjectURL;
      global.URL.revokeObjectURL = mockRevokeObjectURL;

      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'json' } });

      await waitFor(() => {
        expect(screen.getByTestId('export-preview')).toBeInTheDocument();
      });

      const downloadButton = screen.getByRole('button', { name: /download/i });
      fireEvent.click(downloadButton);

      await waitFor(() => {
        expect(mockCreateObjectURL).toHaveBeenCalled();
      });
    });
  });

  describe('close', () => {
    it('should call onClose when close button clicked', () => {
      const onClose = vi.fn();
      render(
        <ExportDialog
          isOpen={true}
          onClose={onClose}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when escape key pressed', () => {
      const onClose = vi.fn();
      render(
        <ExportDialog
          isOpen={true}
          onClose={onClose}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should show error message when export fails', async () => {
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Clipboard access denied'));

      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'json' } });

      await waitFor(() => {
        expect(screen.getByTestId('export-preview')).toBeInTheDocument();
      });

      const copyButton = screen.getByRole('button', { name: /copy/i });
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument();
      });
    });
  });

  describe('accessibility', () => {
    it('should have accessible dialog role', () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      expect(screen.getByRole('dialog')).toHaveAccessibleName();
    });

    it('should focus format selector on open', async () => {
      render(
        <ExportDialog
          isOpen={true}
          onClose={vi.fn()}
          graphIR={mockGraphIR}
          annotations={mockAnnotations}
        />
      );

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByRole('combobox'));
      });
    });
  });
});
