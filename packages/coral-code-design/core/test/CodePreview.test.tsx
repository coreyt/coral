/**
 * Tests for CodePreview component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodePreview, type CodePreviewProps } from '../src/components/CodePreview/CodePreview';

const sampleCode = `import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
    </div>
  );
}`;

function renderCodePreview(props: Partial<CodePreviewProps> = {}) {
  const defaultProps: CodePreviewProps = {
    content: sampleCode,
    startLine: undefined,
    endLine: undefined,
    isLoading: false,
    error: null,
    filename: 'Counter.tsx',
  };

  return render(<CodePreview {...defaultProps} {...props} />);
}

describe('CodePreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty state', () => {
    it('should show placeholder when no content', () => {
      renderCodePreview({ content: null });
      expect(screen.getByText(/select a node/i)).toBeInTheDocument();
    });

    it('should show placeholder when content is empty string', () => {
      renderCodePreview({ content: '' });
      expect(screen.getByText(/select a node/i)).toBeInTheDocument();
    });
  });

  describe('loading state', () => {
    it('should show loading indicator when isLoading is true', () => {
      renderCodePreview({ isLoading: true });
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('should show error message when error prop is provided', () => {
      renderCodePreview({ content: null, error: 'Failed to load file' });
      expect(screen.getByText(/failed to load file/i)).toBeInTheDocument();
    });
  });

  describe('rendering code', () => {
    it('should render code content', () => {
      renderCodePreview();
      // The code has "Counter" in two places, so use queryAllByText
      const counterElements = screen.queryAllByText(/Counter/);
      expect(counterElements.length).toBeGreaterThan(0);
    });

    it('should display line numbers', () => {
      renderCodePreview();
      // Line 1 should be present (unique because it's just "1")
      const lineOne = screen.getByText('1');
      expect(lineOne).toBeInTheDocument();
      // Line 5 should also be present
      const lineFive = screen.getByText('5');
      expect(lineFive).toBeInTheDocument();
    });

    it('should display filename when provided', () => {
      renderCodePreview({ filename: 'Counter.tsx' });
      expect(screen.getByText('Counter.tsx')).toBeInTheDocument();
    });
  });

  describe('line highlighting', () => {
    it('should highlight specified line range', () => {
      renderCodePreview({ startLine: 4, endLine: 6 });

      // Lines 4-6 should have highlight class
      const highlightedLines = document.querySelectorAll('[data-highlighted="true"]');
      expect(highlightedLines.length).toBe(3);
    });

    it('should highlight single line when startLine equals endLine', () => {
      renderCodePreview({ startLine: 3, endLine: 3 });

      const highlightedLines = document.querySelectorAll('[data-highlighted="true"]');
      expect(highlightedLines.length).toBe(1);
    });

    it('should highlight from startLine to end when only startLine is provided', () => {
      renderCodePreview({ startLine: 10 });

      // Should highlight from line 10 to the end
      const highlightedLines = document.querySelectorAll('[data-highlighted="true"]');
      expect(highlightedLines.length).toBeGreaterThan(0);
    });
  });

  describe('accessibility', () => {
    it('should have proper code role', () => {
      renderCodePreview();
      const codeElement = document.querySelector('pre');
      expect(codeElement).toBeInTheDocument();
    });
  });
});
