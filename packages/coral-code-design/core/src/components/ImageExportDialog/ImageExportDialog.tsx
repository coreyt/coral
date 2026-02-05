/**
 * ImageExportDialog Component
 *
 * Dialog for configuring and executing image export.
 * Issue #30: CCD-REQ-009 PNG/SVG Image Export
 */

import React, { useState, useCallback } from 'react';
import type { ImageExportOptions, ImageFormat } from '../../hooks/useImageExport';

// ============================================================================
// Types
// ============================================================================

export interface ImageExportDialogProps {
  /** Whether dialog is open */
  isOpen: boolean;
  /** Callback to close dialog */
  onClose: () => void;
  /** Callback when export is triggered */
  onExport: (options: ImageExportOptions) => void;
  /** Whether an export is in progress */
  isExporting?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const SCALE_OPTIONS = [
  { value: 1, label: '1x (Standard)' },
  { value: 2, label: '2x (High DPI)' },
  { value: 3, label: '3x (Print Quality)' },
  { value: 4, label: '4x (Maximum)' },
];

const FORMAT_INFO: Record<ImageFormat, { description: string; bestFor: string }> = {
  png: {
    description: 'Raster image with transparency support',
    bestFor: 'Best for: presentations, web, documentation',
  },
  svg: {
    description: 'Vector image that scales without quality loss',
    bestFor: 'Best for: print, editing, high-resolution displays',
  },
};

// ============================================================================
// Styles
// ============================================================================

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  } as React.CSSProperties,
  dialog: {
    width: '100%',
    maxWidth: '400px',
    backgroundColor: 'var(--surface, #ffffff)',
    borderRadius: '12px',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
    overflow: 'hidden',
  } as React.CSSProperties,
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border, #e0e0e0)',
  } as React.CSSProperties,
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: 'var(--text-primary, #1a1a1a)',
  } as React.CSSProperties,
  content: {
    padding: '20px',
  } as React.CSSProperties,
  field: {
    marginBottom: '20px',
  } as React.CSSProperties,
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    fontWeight: 500,
    color: 'var(--text-primary, #1a1a1a)',
  } as React.CSSProperties,
  select: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: '6px',
    backgroundColor: 'var(--surface, #ffffff)',
    color: 'var(--text-primary, #1a1a1a)',
    cursor: 'pointer',
  } as React.CSSProperties,
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: 'var(--text-primary, #1a1a1a)',
    cursor: 'pointer',
  } as React.CSSProperties,
  info: {
    marginTop: '8px',
    padding: '12px',
    backgroundColor: 'var(--surface-variant, #f5f5f5)',
    borderRadius: '6px',
    fontSize: '13px',
    color: 'var(--text-secondary, #666666)',
  } as React.CSSProperties,
  infoDescription: {
    marginBottom: '4px',
  } as React.CSSProperties,
  infoBestFor: {
    fontStyle: 'italic',
  } as React.CSSProperties,
  actions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    marginTop: '24px',
  } as React.CSSProperties,
  actionRow: {
    display: 'flex',
    gap: '8px',
  } as React.CSSProperties,
  button: {
    flex: 1,
    padding: '10px 16px',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  } as React.CSSProperties,
  primaryButton: {
    backgroundColor: 'var(--primary, #1976d2)',
    color: 'white',
  } as React.CSSProperties,
  secondaryButton: {
    backgroundColor: 'var(--surface-variant, #f5f5f5)',
    color: 'var(--text-primary, #1a1a1a)',
  } as React.CSSProperties,
  footer: {
    padding: '12px 20px',
    borderTop: '1px solid var(--border, #e0e0e0)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
  } as React.CSSProperties,
  cancelButton: {
    padding: '8px 16px',
    fontSize: '14px',
    border: '1px solid var(--border, #e0e0e0)',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--text-primary, #1a1a1a)',
    cursor: 'pointer',
  } as React.CSSProperties,
};

// ============================================================================
// Component
// ============================================================================

export function ImageExportDialog({
  isOpen,
  onClose,
  onExport,
  isExporting = false,
}: ImageExportDialogProps): React.ReactElement | null {
  const [format, setFormat] = useState<ImageFormat>('png');
  const [scale, setScale] = useState(2);
  const [includeBackground, setIncludeBackground] = useState(true);
  const [exportAction, setExportAction] = useState<'download' | 'clipboard'>('download');

  const handleExport = useCallback(() => {
    onExport({
      format,
      scale,
      includeBackground,
      backgroundColor: '#ffffff',
    });
  }, [format, scale, includeBackground, onExport]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!isOpen) {
    return null;
  }

  const formatInfo = FORMAT_INFO[format];

  return (
    <div
      style={styles.overlay}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
    >
      <div style={styles.dialog}>
        <div style={styles.header}>
          <h2 id="export-dialog-title" style={styles.title}>
            Export Image
          </h2>
        </div>

        <div style={styles.content}>
          {/* Format */}
          <div style={styles.field}>
            <label htmlFor="export-format" style={styles.label}>
              Format
            </label>
            <select
              id="export-format"
              value={format}
              onChange={(e) => setFormat(e.target.value as ImageFormat)}
              style={styles.select}
            >
              <option value="png">PNG (Raster)</option>
              <option value="svg">SVG (Vector)</option>
            </select>
            <div style={styles.info}>
              <div style={styles.infoDescription}>{formatInfo.description}</div>
              <div style={styles.infoBestFor}>{formatInfo.bestFor}</div>
            </div>
          </div>

          {/* Scale (only for PNG) */}
          {format === 'png' && (
            <div style={styles.field}>
              <label htmlFor="export-scale" style={styles.label}>
                Scale
              </label>
              <select
                id="export-scale"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                style={styles.select}
              >
                {SCALE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Background */}
          <div style={styles.field}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={includeBackground}
                onChange={(e) => setIncludeBackground(e.target.checked)}
                aria-label="Include background"
              />
              Include background
            </label>
          </div>

          {/* Export Actions */}
          <div style={styles.actions}>
            <div style={styles.actionRow}>
              <button
                onClick={() => {
                  setExportAction('download');
                  handleExport();
                }}
                disabled={isExporting}
                style={{ ...styles.button, ...styles.primaryButton }}
              >
                {isExporting ? 'Exporting...' : 'Download'}
              </button>
              <button
                onClick={() => {
                  setExportAction('clipboard');
                  handleExport();
                }}
                disabled={isExporting}
                style={{ ...styles.button, ...styles.secondaryButton }}
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.cancelButton}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
