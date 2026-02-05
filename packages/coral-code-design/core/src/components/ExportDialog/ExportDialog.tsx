/**
 * ExportDialog Component
 *
 * Dialog for exporting diagrams to various formats.
 * Issue #24: CCD-REQ-009 Export Dialog UI
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useExport, type ExportFormat } from '../../hooks/useExport';
import type { GraphIR, AnnotationStore } from '../../types';

// ============================================================================
// Types
// ============================================================================

export interface ExportDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback when dialog closes */
  onClose: () => void;
  /** GraphIR to export */
  graphIR: GraphIR;
  /** Annotations for markdown export */
  annotations: AnnotationStore;
  /** Default format */
  defaultFormat?: ExportFormat;
  /** Default filename (without extension) */
  defaultFilename?: string;
}

interface FormatOption {
  value: ExportFormat;
  label: string;
  extension: string;
  mimeType: string;
}

// ============================================================================
// Constants
// ============================================================================

const FORMAT_OPTIONS: FormatOption[] = [
  { value: 'coral-dsl', label: 'Coral DSL', extension: '.coral', mimeType: 'text/plain' },
  { value: 'json', label: 'JSON', extension: '.json', mimeType: 'application/json' },
  { value: 'markdown', label: 'Markdown', extension: '.md', mimeType: 'text/markdown' },
  { value: 'svg', label: 'SVG (coming soon)', extension: '.svg', mimeType: 'image/svg+xml' },
  { value: 'png', label: 'PNG (coming soon)', extension: '.png', mimeType: 'image/png' },
];

// ============================================================================
// Styles
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  dialog: {
    backgroundColor: 'var(--theme-bg-primary, #fff)',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.24)',
    width: '600px',
    maxWidth: '90vw',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderBottom: '1px solid var(--theme-border, #e0e0e0)',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--theme-text-primary, #333)',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '4px 8px',
    color: 'var(--theme-text-secondary, #666)',
    borderRadius: '4px',
  },
  body: {
    padding: '20px',
    flex: 1,
    overflow: 'auto',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--theme-text-primary, #333)',
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '6px',
    backgroundColor: 'var(--theme-bg-primary, #fff)',
    color: 'var(--theme-text-primary, #333)',
  },
  preview: {
    fontFamily: 'monospace',
    fontSize: '12px',
    backgroundColor: 'var(--theme-bg-secondary, #f5f5f5)',
    border: '1px solid var(--theme-border, #ddd)',
    borderRadius: '6px',
    padding: '12px',
    height: '200px',
    overflow: 'auto',
    whiteSpace: 'pre-wrap' as const,
    color: 'var(--theme-text-primary, #333)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    borderTop: '1px solid var(--theme-border, #e0e0e0)',
    gap: '12px',
  },
  message: {
    fontSize: '13px',
    flex: 1,
  },
  success: {
    color: 'var(--theme-success, #2e7d32)',
  },
  error: {
    color: 'var(--theme-error, #d32f2f)',
  },
  buttonGroup: {
    display: 'flex',
    gap: '8px',
  },
  button: {
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  buttonPrimary: {
    backgroundColor: 'var(--theme-primary, #1976d2)',
    color: '#fff',
  },
  buttonSecondary: {
    backgroundColor: 'var(--theme-bg-secondary, #f0f0f0)',
    color: 'var(--theme-text-primary, #333)',
    border: '1px solid var(--theme-border, #ddd)',
  },
};

// ============================================================================
// Component
// ============================================================================

export function ExportDialog({
  isOpen,
  onClose,
  graphIR,
  annotations,
  defaultFormat = 'coral-dsl',
  defaultFilename = 'diagram',
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>(defaultFormat);
  const [preview, setPreview] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  const {
    exportToCoralDSL,
    exportToJSON,
    exportToMarkdown,
    copyToClipboard,
    downloadFile,
    isExporting,
  } = useExport();

  // Generate preview when format changes
  useEffect(() => {
    if (!isOpen) return;

    const generatePreview = async () => {
      try {
        let content = '';
        switch (format) {
          case 'coral-dsl':
            content = await exportToCoralDSL(graphIR);
            break;
          case 'json':
            content = await exportToJSON(graphIR);
            break;
          case 'markdown':
            content = await exportToMarkdown(graphIR, annotations);
            break;
          default:
            content = '// This format is not yet supported for preview';
        }
        setPreview(content);
        setMessage(null);
      } catch (error) {
        setPreview('');
        setMessage({ type: 'error', text: 'Failed to generate preview' });
      }
    };

    generatePreview();
  }, [format, graphIR, annotations, isOpen, exportToCoralDSL, exportToJSON, exportToMarkdown]);

  // Focus select on open
  useEffect(() => {
    if (isOpen && selectRef.current) {
      selectRef.current.focus();
    }
  }, [isOpen]);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(preview);
      setMessage({ type: 'success', text: 'Copied to clipboard!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to copy. Error accessing clipboard.' });
    }
  }, [preview, copyToClipboard]);

  const handleDownload = useCallback(async () => {
    const formatOption = FORMAT_OPTIONS.find((f) => f.value === format);
    if (!formatOption) return;

    try {
      const filename = `${defaultFilename}${formatOption.extension}`;
      await downloadFile(preview, filename, formatOption.mimeType);
      setMessage({ type: 'success', text: `Downloaded ${filename}` });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to download file' });
    }
  }, [format, preview, defaultFilename, downloadFile]);

  if (!isOpen) {
    return null;
  }

  const isImageFormat = format === 'png' || format === 'svg';

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Export Diagram"
        aria-modal="true"
        style={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Export Diagram</h2>
          <button
            type="button"
            aria-label="Close"
            style={styles.closeButton}
            onClick={onClose}
          >
            \u2715
          </button>
        </div>

        {/* Body */}
        <div style={styles.body}>
          {/* Format selector */}
          <div style={styles.formGroup}>
            <label htmlFor="export-format" style={styles.label}>
              Format
            </label>
            <select
              id="export-format"
              ref={selectRef}
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              style={styles.select}
            >
              {FORMAT_OPTIONS.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.value === 'png' || option.value === 'svg'}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Preview */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Preview</label>
            <div data-testid="export-preview" style={styles.preview}>
              {isImageFormat
                ? 'Image export is not yet supported. Please use Coral DSL, JSON, or Markdown.'
                : preview || 'Loading...'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          <div
            style={{
              ...styles.message,
              ...(message?.type === 'success' ? styles.success : {}),
              ...(message?.type === 'error' ? styles.error : {}),
            }}
          >
            {message?.text || ''}
          </div>
          <div style={styles.buttonGroup}>
            <button
              type="button"
              style={{ ...styles.button, ...styles.buttonSecondary }}
              onClick={handleCopy}
              disabled={isExporting || isImageFormat || !preview}
            >
              Copy
            </button>
            <button
              type="button"
              style={{ ...styles.button, ...styles.buttonPrimary }}
              onClick={handleDownload}
              disabled={isExporting || isImageFormat || !preview}
            >
              Download
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
