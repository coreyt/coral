/**
 * TextEditor - DSL text editor component
 *
 * A code editor for Coral DSL, Mermaid, and DOT syntax with
 * inline error display and syntax highlighting.
 */

import React, { useCallback, useRef, useEffect, useMemo } from 'react';
import type { ParseError } from './hooks/useBidirectionalSync.js';

/**
 * Supported syntax languages
 */
export type SyntaxLanguage = 'coral' | 'mermaid' | 'dot' | 'plain';

/**
 * TextEditor props
 */
export interface TextEditorProps {
  /** Current text content */
  value: string;
  /** Callback when text changes */
  onChange: (value: string) => void;
  /** Syntax language for highlighting */
  language?: SyntaxLanguage;
  /** Parse errors to display inline */
  errors?: ParseError[];
  /** Placeholder text */
  placeholder?: string;
  /** Read-only mode */
  readOnly?: boolean;
  /** CSS class name */
  className?: string;
  /** Inline styles */
  style?: React.CSSProperties;
  /** Line numbers */
  showLineNumbers?: boolean;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** Tab size */
  tabSize?: number;
  /** Minimum height */
  minHeight?: string;
}

/**
 * Get line and column from text offset
 */
function getPositionFromOffset(text: string, offset: number): { line: number; column: number } {
  const lines = text.slice(0, offset).split('\n');
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

/**
 * Get offset from line and column
 */
function getOffsetFromPosition(text: string, line: number, column: number): number {
  const lines = text.split('\n');
  let offset = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for newline
  }
  return offset + column - 1;
}

/**
 * Default styles for the editor
 */
const defaultStyles: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
  fontSize: '14px',
  lineHeight: '1.5',
  padding: '12px',
  border: '1px solid #e0e0e0',
  borderRadius: '4px',
  outline: 'none',
  resize: 'vertical',
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: '#fafafa',
};

/**
 * Error marker styles
 */
const errorMarkerStyles: React.CSSProperties = {
  position: 'absolute',
  backgroundColor: 'rgba(255, 0, 0, 0.1)',
  borderBottom: '2px wavy red',
  pointerEvents: 'none',
};

/**
 * Error tooltip styles
 */
const errorTooltipStyles: React.CSSProperties = {
  position: 'absolute',
  backgroundColor: '#ffebee',
  color: '#c62828',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '12px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  zIndex: 1000,
  maxWidth: '300px',
  whiteSpace: 'pre-wrap',
};

/**
 * Line number gutter styles
 */
const lineNumberStyles: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: '40px',
  backgroundColor: '#f5f5f5',
  borderRight: '1px solid #e0e0e0',
  textAlign: 'right',
  paddingRight: '8px',
  paddingTop: '12px',
  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
  fontSize: '12px',
  color: '#999',
  userSelect: 'none',
  lineHeight: '1.5',
};

/**
 * TextEditor component
 *
 * Provides a code editing experience for diagram DSLs with:
 * - Syntax-aware editing
 * - Inline error display
 * - Optional line numbers
 * - Keyboard shortcuts (Tab indentation)
 */
export const TextEditor: React.FC<TextEditorProps> = ({
  value,
  onChange,
  language = 'coral',
  errors = [],
  placeholder = 'Enter diagram code...',
  readOnly = false,
  className,
  style,
  showLineNumbers = true,
  autoFocus = false,
  tabSize = 2,
  minHeight = '200px',
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate line numbers
  const lineCount = useMemo(() => value.split('\n').length, [value]);
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1),
    [lineCount]
  );

  // Handle text changes
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Handle tab key for indentation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = e.currentTarget;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const spaces = ' '.repeat(tabSize);

        // Insert spaces at cursor
        const newValue = value.slice(0, start) + spaces + value.slice(end);
        onChange(newValue);

        // Move cursor after inserted spaces
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + tabSize;
        });
      }
    },
    [value, onChange, tabSize]
  );

  // Auto-focus
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  // Find errors for display
  const displayErrors = useMemo(() => {
    return errors.map((error) => ({
      ...error,
      // Ensure we have line/column
      line: error.line || 1,
      column: error.column || 1,
    }));
  }, [errors]);

  // Group errors by line for inline display
  const errorsByLine = useMemo(() => {
    const byLine = new Map<number, ParseError[]>();
    for (const error of displayErrors) {
      const existing = byLine.get(error.line) || [];
      existing.push(error);
      byLine.set(error.line, existing);
    }
    return byLine;
  }, [displayErrors]);

  // Compute textarea styles with line number offset
  const textareaStyles = useMemo(
    (): React.CSSProperties => ({
      ...defaultStyles,
      ...style,
      minHeight,
      paddingLeft: showLineNumbers ? '52px' : '12px',
    }),
    [style, minHeight, showLineNumbers]
  );

  return (
    <div
      ref={containerRef}
      className={`coral-text-editor ${className || ''}`}
      style={{
        position: 'relative',
        width: '100%',
      }}
    >
      {/* Line numbers gutter */}
      {showLineNumbers && (
        <div
          className="coral-text-editor-line-numbers"
          style={{
            ...lineNumberStyles,
            minHeight,
          }}
        >
          {lineNumbers.map((num) => (
            <div
              key={num}
              style={{
                height: '21px', // Match line height
                color: errorsByLine.has(num) ? '#c62828' : '#999',
                fontWeight: errorsByLine.has(num) ? 'bold' : 'normal',
              }}
            >
              {num}
            </div>
          ))}
        </div>
      )}

      {/* Main textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        data-language={language}
        style={textareaStyles}
      />

      {/* Error summary panel */}
      {displayErrors.length > 0 && (
        <div
          className="coral-text-editor-errors"
          style={{
            marginTop: '8px',
            padding: '8px 12px',
            backgroundColor: '#ffebee',
            borderRadius: '4px',
            fontSize: '13px',
          }}
        >
          <div style={{ color: '#c62828', fontWeight: 500, marginBottom: '4px' }}>
            {displayErrors.length} error{displayErrors.length !== 1 ? 's' : ''}
          </div>
          {displayErrors.slice(0, 5).map((error, i) => (
            <div
              key={i}
              style={{
                color: '#b71c1c',
                marginTop: '4px',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              Line {error.line}, Col {error.column}: {error.message}
            </div>
          ))}
          {displayErrors.length > 5 && (
            <div style={{ color: '#999', marginTop: '4px', fontSize: '12px' }}>
              ...and {displayErrors.length - 5} more
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TextEditor;
