/**
 * FileControls - UI component for file operations (CORAL-REQ-008)
 *
 * Provides buttons for:
 * - Save: Download diagram as .coral.json file
 * - Load: Open file picker to load .coral.json file
 * - Export: Export Graph-IR as JSON
 */

import { useRef, useCallback, type CSSProperties, type ChangeEvent } from 'react';
import type { CoralDocument } from '../file/index.js';

/** Props for the FileControls component */
export interface FileControlsProps {
  /** Current document to save */
  document: CoralDocument | null;
  /** Callback when a document is loaded */
  onLoad: (document: CoralDocument) => void;
  /** Callback to get current state as document (for saving) */
  onGetDocument?: () => CoralDocument;
  /** Custom styles for the container */
  style?: CSSProperties;
  /** Custom class name for the container */
  className?: string;
  /** Whether to show keyboard shortcut hints in tooltips */
  showShortcutHints?: boolean;
  /** Disable all controls */
  disabled?: boolean;
  /** Show export button */
  showExport?: boolean;
}

/** Default button styles */
const buttonStyle: CSSProperties = {
  padding: '6px 12px',
  fontSize: '13px',
  fontWeight: 500,
  borderRadius: '4px',
  border: '1px solid #ccc',
  background: '#fff',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  transition: 'all 0.15s ease',
};

const buttonStyleDisabled: CSSProperties = {
  ...buttonStyle,
  opacity: 0.5,
  cursor: 'not-allowed',
};

const buttonStylePrimary: CSSProperties = {
  ...buttonStyle,
  background: '#2e7d32',
  borderColor: '#2e7d32',
  color: '#fff',
};

const containerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

/**
 * Download a file with the given content
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generate filename from document name
 */
function generateFilename(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${sanitized || 'diagram'}.coral.json`;
}

/**
 * FileControls component
 */
export function FileControls({
  document,
  onLoad,
  onGetDocument,
  style,
  className,
  showShortcutHints = true,
  disabled = false,
  showExport = true,
}: FileControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Handle save button click
   */
  const handleSave = useCallback(() => {
    const doc = onGetDocument ? onGetDocument() : document;
    if (!doc) return;

    const json = JSON.stringify(doc, null, 2);
    const filename = generateFilename(doc.metadata.name);
    downloadFile(json, filename, 'application/json');
  }, [document, onGetDocument]);

  /**
   * Handle load button click
   */
  const handleLoadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Handle file input change
   */
  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const doc = JSON.parse(content) as CoralDocument;
          onLoad(doc);
        } catch (error) {
          console.error('Failed to parse file:', error);
          alert(`Failed to load file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      };
      reader.readAsText(file);

      // Reset input so same file can be loaded again
      event.target.value = '';
    },
    [onLoad]
  );

  /**
   * Handle export Graph-IR button click
   */
  const handleExport = useCallback(() => {
    const doc = onGetDocument ? onGetDocument() : document;
    if (!doc?.content.graphIR) return;

    const json = JSON.stringify(doc.content.graphIR, null, 2);
    const filename = `${doc.metadata.name.toLowerCase().replace(/\s+/g, '-')}-graph-ir.json`;
    downloadFile(json, filename, 'application/json');
  }, [document, onGetDocument]);

  const getSaveTitle = () => {
    let title = 'Save diagram as .coral.json file';
    if (showShortcutHints) {
      title += ' (Ctrl+S)';
    }
    return title;
  };

  const getLoadTitle = () => {
    let title = 'Load diagram from .coral.json file';
    if (showShortcutHints) {
      title += ' (Ctrl+O)';
    }
    return title;
  };

  const canSave = Boolean(document || onGetDocument);
  const canExport = Boolean(document?.content.graphIR || onGetDocument);

  return (
    <div style={{ ...containerStyle, ...style }} className={className}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".coral.json,.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={disabled || !canSave}
        title={getSaveTitle()}
        style={disabled || !canSave ? buttonStyleDisabled : buttonStylePrimary}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        Save
      </button>

      {/* Load button */}
      <button
        onClick={handleLoadClick}
        disabled={disabled}
        title={getLoadTitle()}
        style={disabled ? buttonStyleDisabled : buttonStyle}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <polyline points="9 14 12 11 15 14" />
        </svg>
        Load
      </button>

      {/* Export button (optional) */}
      {showExport && (
        <>
          {/* Separator */}
          <div style={{ width: '1px', height: '20px', background: '#ddd' }} />

          <button
            onClick={handleExport}
            disabled={disabled || !canExport}
            title="Export Graph-IR as JSON"
            style={disabled || !canExport ? buttonStyleDisabled : buttonStyle}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export IR
          </button>
        </>
      )}
    </div>
  );
}
