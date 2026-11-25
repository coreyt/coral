/**
 * Tests for useAxisConstrain hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAxisConstrain } from '../src/layout/useAxisConstrain';

// Simulated nodes for the hook
const makeNodes = (positions: Record<string, { x: number; y: number }>) =>
  Object.entries(positions).map(([id, position]) => ({
    id,
    position,
    data: {},
  }));

describe('useAxisConstrain', () => {
  let originalOnNodesChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalOnNodesChange = vi.fn();
  });

  afterEach(() => {
    // Clean up any lingering keyboard state
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
  });

  it('should pass through changes unmodified when Shift is not held', () => {
    const nodes = makeNodes({ a: { x: 100, y: 100 } });
    const { result } = renderHook(() =>
      useAxisConstrain(originalOnNodesChange, nodes),
    );

    const changes = [
      { type: 'position' as const, id: 'a', position: { x: 150, y: 120 }, dragging: true },
    ];

    act(() => result.current.onNodesChange(changes));

    expect(originalOnNodesChange).toHaveBeenCalledWith(changes);
  });

  it('should freeze position below threshold when Shift is held', () => {
    const nodes = makeNodes({ a: { x: 100, y: 100 } });
    const { result } = renderHook(() =>
      useAxisConstrain(originalOnNodesChange, nodes),
    );

    // Hold shift
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    });

    const changes = [
      { type: 'position' as const, id: 'a', position: { x: 102, y: 101 }, dragging: true },
    ];

    act(() => result.current.onNodesChange(changes));

    // Should freeze to start position (below threshold)
    expect(originalOnNodesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        position: { x: 100, y: 100 },
      }),
    ]);
  });

  it('should lock to horizontal axis when deltaX is dominant', () => {
    const nodes = makeNodes({ a: { x: 100, y: 100 } });
    const { result } = renderHook(() =>
      useAxisConstrain(originalOnNodesChange, nodes),
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    });

    // Move beyond threshold horizontally
    act(() => {
      result.current.onNodesChange([
        { type: 'position', id: 'a', position: { x: 110, y: 103 }, dragging: true },
      ]);
    });

    // Should lock to x-axis: x moves freely, y stays at 100
    expect(originalOnNodesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        position: { x: 110, y: 100 },
      }),
    ]);

    // Subsequent moves should stay on x-axis
    originalOnNodesChange.mockClear();
    act(() => {
      result.current.onNodesChange([
        { type: 'position', id: 'a', position: { x: 200, y: 150 }, dragging: true },
      ]);
    });

    expect(originalOnNodesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        position: { x: 200, y: 100 },
      }),
    ]);
  });

  it('should lock to vertical axis when deltaY is dominant', () => {
    const nodes = makeNodes({ a: { x: 100, y: 100 } });
    const { result } = renderHook(() =>
      useAxisConstrain(originalOnNodesChange, nodes),
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    });

    // Move beyond threshold vertically
    act(() => {
      result.current.onNodesChange([
        { type: 'position', id: 'a', position: { x: 102, y: 112 }, dragging: true },
      ]);
    });

    // Should lock to y-axis: y moves freely, x stays at 100
    expect(originalOnNodesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        position: { x: 100, y: 112 },
      }),
    ]);
  });

  it('should reset drag state when drag ends', () => {
    let nodes = makeNodes({ a: { x: 100, y: 100 } });
    const { result, rerender } = renderHook(
      ({ n }) => useAxisConstrain(originalOnNodesChange, n),
      { initialProps: { n: nodes } },
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    });

    // Start drag and lock to x-axis
    act(() => {
      result.current.onNodesChange([
        { type: 'position', id: 'a', position: { x: 120, y: 102 }, dragging: true },
      ]);
    });

    // End drag
    act(() => {
      result.current.onNodesChange([
        { type: 'position', id: 'a', position: { x: 120, y: 100 }, dragging: false },
      ]);
    });

    // Update nodes to reflect final position (as the real app would)
    nodes = makeNodes({ a: { x: 120, y: 100 } });
    rerender({ n: nodes });

    // Start a new drag — should be able to lock to a different axis
    originalOnNodesChange.mockClear();
    act(() => {
      result.current.onNodesChange([
        { type: 'position', id: 'a', position: { x: 121, y: 112 }, dragging: true },
      ]);
    });

    // Now dominant axis is y (deltaY=12 > deltaX=1)
    expect(originalOnNodesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        position: { x: 120, y: 112 },
      }),
    ]);
  });

  it('should not interfere with non-position changes', () => {
    const nodes = makeNodes({ a: { x: 100, y: 100 } });
    const { result } = renderHook(() =>
      useAxisConstrain(originalOnNodesChange, nodes),
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    });

    const changes = [
      { type: 'select' as const, id: 'a', selected: true },
    ];

    act(() => result.current.onNodesChange(changes));

    expect(originalOnNodesChange).toHaveBeenCalledWith(changes);
  });

  it('should reset axis lock when Shift is released mid-drag', () => {
    const nodes = makeNodes({ a: { x: 100, y: 100 } });
    const { result } = renderHook(() =>
      useAxisConstrain(originalOnNodesChange, nodes),
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    });

    // Lock to x-axis
    act(() => {
      result.current.onNodesChange([
        { type: 'position', id: 'a', position: { x: 120, y: 105 }, dragging: true },
      ]);
    });

    // Release Shift
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));
    });

    // Next move should be unconstrained
    originalOnNodesChange.mockClear();
    act(() => {
      result.current.onNodesChange([
        { type: 'position', id: 'a', position: { x: 130, y: 150 }, dragging: true },
      ]);
    });

    expect(originalOnNodesChange).toHaveBeenCalledWith([
      expect.objectContaining({
        position: { x: 130, y: 150 },
      }),
    ]);
  });
});

describe('precision drag boundaries', () => {
  afterEach(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' })));

  it('keeps both nodes independently locked through terminal changes', () => {
    const receive = vi.fn();
    const { result } = renderHook(() => useAxisConstrain(receive,
      makeNodes({ a: { x: 0, y: 0 }, b: { x: 100, y: 100 } })));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })));
    act(() => result.current.onNodesChange([
      { type: 'position', id: 'a', position: { x: 20, y: 3 }, dragging: true },
      { type: 'position', id: 'b', position: { x: 103, y: 120 }, dragging: true },
    ]));
    act(() => result.current.onNodesChange([
      { type: 'position', id: 'a', position: { x: 30, y: 50 }, dragging: false },
      { type: 'position', id: 'b', position: { x: 150, y: 130 }, dragging: false },
    ]));
    expect(receive).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'a', position: { x: 30, y: 0 } }),
      expect.objectContaining({ id: 'b', position: { x: 100, y: 130 } }),
    ]);
  });

  it('clears modifier on blur and leaves programmatic positions unrestricted', () => {
    const receive = vi.fn();
    const { result } = renderHook(() => useAxisConstrain(receive, makeNodes({ a: { x: 0, y: 0 } })));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })));
    const position = { type: 'position' as const, id: 'a', position: { x: 20, y: 3 } };
    act(() => result.current.onNodesChange([position]));
    expect(receive).toHaveBeenLastCalledWith([position]);
    act(() => window.dispatchEvent(new Event('blur')));
    act(() => result.current.onNodesChange([{ ...position, dragging: true }]));
    expect(receive).toHaveBeenLastCalledWith([{ ...position, dragging: true }]);
  });
});


it('allows a fresh axis after cancelled drag boundaries with Shift still held', () => {
  const receive = vi.fn();
  const { result } = renderHook(() => useAxisConstrain(receive, makeNodes({ a: { x: 0, y: 0 } })));
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })));
  act(() => result.current.onNodesChange([{ type: 'position', id: 'a', position: { x: 30, y: 2 }, dragging: true }]));
  // App cancellation clears the old drag through its terminal boundary.
  act(() => result.current.onNodesChange([{ type: 'position', id: 'a', dragging: false }]));
  act(() => result.current.onNodesChange([{ type: 'position', id: 'a', position: { x: 2, y: 30 }, dragging: true }]));
  expect(receive).toHaveBeenLastCalledWith([expect.objectContaining({ position: { x: 0, y: 30 } })]);
  act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' })));
});

describe('accepted threshold and modifier-repress boundaries', () => {
  afterEach(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' })));

  it('freezes at the exact five-unit threshold on both axes', () => {
    const receive = vi.fn();
    const { result } = renderHook(() => useAxisConstrain(receive, makeNodes({ a: { x: 100, y: 200 } })));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })));
    act(() => result.current.onNodesChange([
      { type: 'position', id: 'a', position: { x: 105, y: 205 }, dragging: true },
    ]));
    expect(receive).toHaveBeenLastCalledWith([
      expect.objectContaining({ position: { x: 100, y: 200 } }),
    ]);
  });

  it('chooses horizontal for an equal six-unit delta beyond the threshold', () => {
    const receive = vi.fn();
    const { result } = renderHook(() => useAxisConstrain(receive, makeNodes({ a: { x: 100, y: 200 } })));
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })));
    act(() => result.current.onNodesChange([
      { type: 'position', id: 'a', position: { x: 106, y: 206 }, dragging: true },
    ]));
    expect(receive).toHaveBeenLastCalledWith([
      expect.objectContaining({ position: { x: 106, y: 200 } }),
    ]);
  });

  it('represses Shift within the same gesture using the current moved position as a new origin', () => {
    const receive = vi.fn();
    const { result, rerender } = renderHook(({ nodes }) => useAxisConstrain(receive, nodes), {
      initialProps: { nodes: makeNodes({ a: { x: 100, y: 200 } }) },
    });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })));
    act(() => result.current.onNodesChange([
      { type: 'position', id: 'a', position: { x: 120, y: 203 }, dragging: true },
    ]));
    expect(receive).toHaveBeenLastCalledWith([
      expect.objectContaining({ position: { x: 120, y: 200 } }),
    ]);
    rerender({ nodes: makeNodes({ a: { x: 120, y: 200 } }) });
    act(() => window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' })));
    act(() => result.current.onNodesChange([
      { type: 'position', id: 'a', position: { x: 130, y: 250 }, dragging: true },
    ]));
    expect(receive).toHaveBeenLastCalledWith([
      expect.objectContaining({ position: { x: 130, y: 250 } }),
    ]);
    rerender({ nodes: makeNodes({ a: { x: 130, y: 250 } }) });
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' })));
    act(() => result.current.onNodesChange([
      { type: 'position', id: 'a', position: { x: 132, y: 260 }, dragging: true },
    ]));
    expect(receive).toHaveBeenLastCalledWith([
      expect.objectContaining({ position: { x: 130, y: 260 } }),
    ]);
  });
});
