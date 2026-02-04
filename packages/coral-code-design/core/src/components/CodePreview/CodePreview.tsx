/**
 * CodePreview Component
 *
 * Displays source code with line numbers and highlighting.
 * Used in the Inspector to show code for selected nodes.
 */

import { useRef, useEffect } from 'react';

export interface CodePreviewProps {
  /** Code content to display */
  content: string | null;

  /** Start line to highlight (1-indexed) */
  startLine?: number;

  /** End line to highlight (1-indexed, inclusive) */
  endLine?: number;

  /** Whether code is being loaded */
  isLoading?: boolean;

  /** Error message if load failed */
  error?: string | null;

  /** Filename to display */
  filename?: string;

  /** Language for syntax highlighting (future use) */
  language?: string;
}

export function CodePreview({
  content,
  startLine,
  endLine,
  isLoading = false,
  error = null,
  filename,
  language,
}: CodePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightStartRef = useRef<HTMLDivElement>(null);

  // Scroll to highlighted section when it changes
  useEffect(() => {
    if (highlightStartRef.current && startLine) {
      // scrollIntoView may not be available in all environments (e.g., jsdom)
      highlightStartRef.current.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }
  }, [startLine, content]);

  // Loading state
  if (isLoading) {
    return (
      <div style={styles.container}>
        <div style={styles.centerContent}>
          <div style={{ marginBottom: '8px' }}>⟳</div>
          <div>Loading code...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.centerContent, color: 'var(--error-text, #dc2626)' }}>
          <div style={{ marginBottom: '8px' }}>⚠</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!content) {
    return (
      <div style={styles.container}>
        <div style={styles.centerContent}>
          <div style={{ marginBottom: '8px', fontSize: '24px' }}>📄</div>
          <div>Select a node to view code</div>
        </div>
      </div>
    );
  }

  const lines = content.split('\n');
  const totalLineDigits = String(lines.length).length;

  // Determine which lines to highlight
  const isHighlighted = (lineNum: number): boolean => {
    if (!startLine) return false;
    const end = endLine ?? lines.length;
    return lineNum >= startLine && lineNum <= end;
  };

  return (
    <div style={styles.container} ref={containerRef}>
      {/* Header with filename */}
      {filename && (
        <div style={styles.header}>
          <span style={styles.filename}>{filename}</span>
          {startLine && (
            <span style={styles.lineRange}>
              Lines {startLine}{endLine && endLine !== startLine ? `-${endLine}` : ''}
            </span>
          )}
        </div>
      )}

      {/* Code content */}
      <pre style={styles.pre}>
        <code>
          {lines.map((line, index) => {
            const lineNum = index + 1;
            const highlighted = isHighlighted(lineNum);
            const isHighlightStart = lineNum === startLine;

            return (
              <div
                key={index}
                ref={isHighlightStart ? highlightStartRef : undefined}
                data-line={lineNum}
                data-highlighted={highlighted ? 'true' : 'false'}
                style={{
                  ...styles.line,
                  backgroundColor: highlighted
                    ? 'var(--highlight-bg, rgba(255, 255, 0, 0.15))'
                    : 'transparent',
                }}
              >
                <span
                  style={{
                    ...styles.lineNumber,
                    width: `${totalLineDigits}ch`,
                  }}
                >
                  {lineNum}
                </span>
                <span style={styles.lineContent}>{line || ' '}</span>
              </div>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    fontSize: '12px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    backgroundColor: 'var(--code-bg, #f5f5f5)',
  },
  centerContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--text-muted, #666)',
    textAlign: 'center',
    padding: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 12px',
    borderBottom: '1px solid var(--border-color, #e0e0e0)',
    backgroundColor: 'var(--header-bg, #f0f0f0)',
    fontSize: '11px',
  },
  filename: {
    fontWeight: 600,
    color: 'var(--text-color, #333)',
  },
  lineRange: {
    color: 'var(--text-muted, #666)',
  },
  pre: {
    margin: 0,
    padding: '8px 0',
    overflow: 'auto',
    flex: 1,
  },
  line: {
    display: 'flex',
    lineHeight: '1.5',
    paddingRight: '12px',
  },
  lineNumber: {
    display: 'inline-block',
    textAlign: 'right',
    paddingRight: '12px',
    paddingLeft: '12px',
    color: 'var(--line-number-color, #999)',
    userSelect: 'none',
    flexShrink: 0,
  },
  lineContent: {
    whiteSpace: 'pre',
    tabSize: 2,
  },
};
