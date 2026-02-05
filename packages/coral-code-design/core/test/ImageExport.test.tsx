/**
 * Tests for Image Export (PNG/SVG)
 *
 * Issue #30: CCD-REQ-009 PNG/SVG Image Export
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { useImageExport } from '../src/hooks/useImageExport';
import { ImageExportDialog } from '../src/components/ImageExportDialog';

// ============================================================================
// useImageExport Hook Tests
// ============================================================================

describe('useImageExport', () => {
  describe('export options', () => {
    it('should have default options', () => {
      const { result } = renderHook(() => useImageExport());

      expect(result.current.options.format).toBe('png');
      expect(result.current.options.scale).toBe(2);
      expect(result.current.options.includeBackground).toBe(true);
    });

    it('should update format option', () => {
      const { result } = renderHook(() => useImageExport());

      act(() => {
        result.current.setOptions({ format: 'svg' });
      });

      expect(result.current.options.format).toBe('svg');
    });

    it('should update scale option', () => {
      const { result } = renderHook(() => useImageExport());

      act(() => {
        result.current.setOptions({ scale: 3 });
      });

      expect(result.current.options.scale).toBe(3);
    });

    it('should update background option', () => {
      const { result } = renderHook(() => useImageExport());

      act(() => {
        result.current.setOptions({ includeBackground: false });
      });

      expect(result.current.options.includeBackground).toBe(false);
    });

    it('should merge options', () => {
      const { result } = renderHook(() => useImageExport());

      act(() => {
        result.current.setOptions({ format: 'svg', scale: 4 });
      });

      expect(result.current.options.format).toBe('svg');
      expect(result.current.options.scale).toBe(4);
      expect(result.current.options.includeBackground).toBe(true); // unchanged
    });
  });

  describe('initial state', () => {
    it('should not be exporting initially', () => {
      const { result } = renderHook(() => useImageExport());

      expect(result.current.isExporting).toBe(false);
    });

    it('should have no error initially', () => {
      const { result } = renderHook(() => useImageExport());

      expect(result.current.error).toBeNull();
    });
  });

  describe('export functions', () => {
    it('should provide exportToDataUrl function', () => {
      const { result } = renderHook(() => useImageExport());

      expect(result.current.exportToDataUrl).toBeDefined();
      expect(typeof result.current.exportToDataUrl).toBe('function');
    });

    it('should provide download function', () => {
      const { result } = renderHook(() => useImageExport());

      expect(result.current.download).toBeDefined();
      expect(typeof result.current.download).toBe('function');
    });

    it('should provide copyToClipboard function', () => {
      const { result } = renderHook(() => useImageExport());

      expect(result.current.copyToClipboard).toBeDefined();
      expect(typeof result.current.copyToClipboard).toBe('function');
    });
  });
});

// ============================================================================
// ImageExportDialog Component Tests
// ============================================================================

describe('ImageExportDialog', () => {
  describe('rendering', () => {
    it('should not render when closed', () => {
      const { container } = render(
        <ImageExportDialog
          isOpen={false}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });

    it('should render when open', () => {
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should render format selector', () => {
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      expect(screen.getByLabelText(/format/i)).toBeInTheDocument();
    });

    it('should render scale selector', () => {
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      expect(screen.getByLabelText(/scale/i)).toBeInTheDocument();
    });

    it('should render background toggle', () => {
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      expect(screen.getByLabelText(/background/i)).toBeInTheDocument();
    });

    it('should render download button', () => {
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    });

    it('should render cancel button', () => {
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });

    it('should render clipboard button', () => {
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      expect(screen.getByRole('button', { name: /clipboard/i })).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('should call onClose when cancel is clicked', () => {
      const onClose = vi.fn();
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={onClose}
          onExport={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(onClose).toHaveBeenCalled();
    });

    it('should call onExport with options when download is clicked', () => {
      const onExport = vi.fn();
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={onExport}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: /download/i }));

      expect(onExport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: expect.any(String),
          scale: expect.any(Number),
          includeBackground: expect.any(Boolean),
        })
      );
    });

    it('should change format when selector changes', () => {
      const onExport = vi.fn();
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={onExport}
        />
      );

      fireEvent.change(screen.getByLabelText(/format/i), { target: { value: 'svg' } });
      fireEvent.click(screen.getByRole('button', { name: /download/i }));

      expect(onExport).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'svg' })
      );
    });

    it('should change scale when selector changes', () => {
      const onExport = vi.fn();
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={onExport}
        />
      );

      fireEvent.change(screen.getByLabelText(/scale/i), { target: { value: '3' } });
      fireEvent.click(screen.getByRole('button', { name: /download/i }));

      expect(onExport).toHaveBeenCalledWith(
        expect.objectContaining({ scale: 3 })
      );
    });

    it('should toggle background when checkbox changes', () => {
      const onExport = vi.fn();
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={onExport}
        />
      );

      fireEvent.click(screen.getByLabelText(/background/i));
      fireEvent.click(screen.getByRole('button', { name: /download/i }));

      expect(onExport).toHaveBeenCalledWith(
        expect.objectContaining({ includeBackground: false })
      );
    });
  });

  describe('format options', () => {
    it('should have PNG option', () => {
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      const formatSelect = screen.getByLabelText(/format/i) as HTMLSelectElement;
      const options = Array.from(formatSelect.options).map(o => o.value);
      expect(options).toContain('png');
    });

    it('should have SVG option', () => {
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      const formatSelect = screen.getByLabelText(/format/i) as HTMLSelectElement;
      const options = Array.from(formatSelect.options).map(o => o.value);
      expect(options).toContain('svg');
    });
  });

  describe('scale options', () => {
    it('should have multiple scale options', () => {
      render(
        <ImageExportDialog
          isOpen={true}
          onClose={vi.fn()}
          onExport={vi.fn()}
        />
      );

      const scaleSelect = screen.getByLabelText(/scale/i) as HTMLSelectElement;
      expect(scaleSelect.options.length).toBeGreaterThanOrEqual(3);
    });
  });
});
