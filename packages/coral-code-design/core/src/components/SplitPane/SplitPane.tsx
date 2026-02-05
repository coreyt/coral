/**
 * SplitPane Component
 *
 * Resizable split container for side-by-side diagram views.
 * Issue #22: CCD-REQ-002 Multi-Diagram View
 */

import { useState, useCallback, useRef, useEffect, Children, type ReactNode } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface SplitPaneProps {
  /** Split direction */
  direction: 'horizontal' | 'vertical';
  /** Sizes of panes as percentages */
  sizes: number[];
  /** Callback when panes are resized */
  onResize: (sizes: number[]) => void;
  /** Minimum pane size in pixels */
  minSize?: number;
  /** Child panes */
  children: ReactNode;
  /** Additional class name */
  className?: string;
}

// ============================================================================
// Styles
// ============================================================================

const styles = {
  container: {
    display: 'flex',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  pane: {
    overflow: 'auto',
    minWidth: 0,
    minHeight: 0,
  },
  divider: {
    flexShrink: 0,
    backgroundColor: 'var(--theme-border, #e0e0e0)',
    cursor: 'col-resize',
    transition: 'background-color 0.15s',
    zIndex: 10,
  },
  dividerHorizontal: {
    width: '4px',
    height: '100%',
  },
  dividerVertical: {
    width: '100%',
    height: '4px',
    cursor: 'row-resize',
  },
  dividerActive: {
    backgroundColor: 'var(--theme-primary, #1976d2)',
  },
};

// ============================================================================
// Component
// ============================================================================

export function SplitPane({
  direction,
  sizes,
  onResize,
  minSize = 100,
  children,
  className,
}: SplitPaneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const childArray = Children.toArray(children);

  const handleMouseDown = useCallback(
    (index: number) => (event: React.MouseEvent) => {
      event.preventDefault();
      setIsDragging(true);
      setActiveIndex(index);
    },
    []
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!isDragging || activeIndex === -1 || !containerRef.current) return;

      const container = containerRef.current.getBoundingClientRect();
      const isHorizontal = direction === 'horizontal';
      const totalSize = isHorizontal ? container.width : container.height;
      const position = isHorizontal
        ? event.clientX - container.left
        : event.clientY - container.top;

      // Calculate new sizes
      const newSizes = [...sizes];
      const totalBefore = sizes.slice(0, activeIndex + 1).reduce((a, b) => a + b, 0);
      const positionPercent = (position / totalSize) * 100;

      // Ensure minimum sizes
      const minPercent = (minSize / totalSize) * 100;

      if (positionPercent < minPercent) return;
      if (positionPercent > 100 - minPercent) return;

      // Adjust sizes
      const diff = positionPercent - totalBefore;
      newSizes[activeIndex] = sizes[activeIndex] + diff;
      newSizes[activeIndex + 1] = sizes[activeIndex + 1] - diff;

      // Clamp to min sizes
      if (newSizes[activeIndex] < minPercent) {
        newSizes[activeIndex] = minPercent;
        newSizes[activeIndex + 1] = sizes[activeIndex] + sizes[activeIndex + 1] - minPercent;
      }
      if (newSizes[activeIndex + 1] < minPercent) {
        newSizes[activeIndex + 1] = minPercent;
        newSizes[activeIndex] = sizes[activeIndex] + sizes[activeIndex + 1] - minPercent;
      }

      onResize(newSizes);
    },
    [isDragging, activeIndex, direction, sizes, minSize, onResize]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setActiveIndex(-1);
  }, []);

  const handleKeyDown = useCallback(
    (index: number) => (event: React.KeyboardEvent) => {
      const step = 1; // 1% per keypress
      let delta = 0;

      if (direction === 'horizontal') {
        if (event.key === 'ArrowRight') delta = step;
        else if (event.key === 'ArrowLeft') delta = -step;
      } else {
        if (event.key === 'ArrowDown') delta = step;
        else if (event.key === 'ArrowUp') delta = -step;
      }

      if (delta !== 0) {
        event.preventDefault();
        const newSizes = [...sizes];
        newSizes[index] = Math.max(5, Math.min(95, sizes[index] + delta));
        newSizes[index + 1] = Math.max(5, Math.min(95, sizes[index + 1] - delta));
        onResize(newSizes);
      }
    },
    [direction, sizes, onResize]
  );

  // Attach global mouse handlers
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const containerStyle = {
    ...styles.container,
    flexDirection: direction === 'horizontal' ? 'row' as const : 'column' as const,
  };

  return (
    <div ref={containerRef} style={containerStyle} className={className}>
      {childArray.map((child, index) => (
        <div key={index}>
          <div
            style={{
              ...styles.pane,
              [direction === 'horizontal' ? 'width' : 'height']: `${sizes[index]}%`,
              flex: `0 0 ${sizes[index]}%`,
            }}
          >
            {child}
          </div>
          {index < childArray.length - 1 && (
            <div
              role="separator"
              aria-orientation={direction === 'horizontal' ? 'vertical' : 'horizontal'}
              aria-valuenow={Math.round(sizes[index])}
              aria-valuemin={0}
              aria-valuemax={100}
              tabIndex={0}
              style={{
                ...styles.divider,
                ...(direction === 'horizontal'
                  ? styles.dividerHorizontal
                  : styles.dividerVertical),
                ...(isDragging && activeIndex === index ? styles.dividerActive : {}),
              }}
              onMouseDown={handleMouseDown(index)}
              onKeyDown={handleKeyDown(index)}
            />
          )}
        </div>
      ))}
    </div>
  );
}
