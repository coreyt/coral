/**
 * Auto-Recovery Tests
 *
 * Tests for useAutoRecovery hook and RecoveryBanner component.
 * Requirement: CORAL-REQ-016 (Auto-Recovery)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutoRecovery, formatRecoveryTime, type RecoveryData } from '../src/useAutoRecovery';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock beforeunload event
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
const originalAddEventListener = window.addEventListener;
const originalRemoveEventListener = window.removeEventListener;

describe('useAutoRecovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    window.addEventListener = mockAddEventListener;
    window.removeEventListener = mockRemoveEventListener;
  });

  afterEach(() => {
    vi.useRealTimers();
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
  });

  describe('initial state', () => {
    it('should start with no recovery data when localStorage is empty', () => {
      const { result } = renderHook(() => useAutoRecovery());
      const [state] = result.current;

      expect(state.hasRecoveryData).toBe(false);
      expect(state.recoveryData).toBeNull();
      expect(state.isDirty).toBe(false);
      expect(state.lastSaveTime).toBeNull();
    });

    it('should detect recovery data from localStorage', () => {
      const recoveryData: RecoveryData = {
        timestamp: Date.now(),
        documentName: 'Test Diagram',
        dslType: 'coral',
        dsl: 'service "Test"',
        notation: 'flowchart',
        nodePositions: { node1: { x: 100, y: 200 } },
      };
      localStorageMock.setItem('coral-diagram-recovery', JSON.stringify(recoveryData));

      const { result } = renderHook(() => useAutoRecovery());
      const [state] = result.current;

      expect(state.hasRecoveryData).toBe(true);
      expect(state.recoveryData).toEqual(recoveryData);
    });

    it('should ignore stale recovery data (older than 7 days)', () => {
      const staleData: RecoveryData = {
        timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
        documentName: 'Stale Diagram',
        dslType: 'coral',
        dsl: 'service "Test"',
        notation: 'flowchart',
        nodePositions: {},
      };
      localStorageMock.setItem('coral-diagram-recovery', JSON.stringify(staleData));

      const { result } = renderHook(() => useAutoRecovery());
      const [state] = result.current;

      expect(state.hasRecoveryData).toBe(false);
      expect(state.recoveryData).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('coral-diagram-recovery');
    });

    it('should handle corrupted localStorage data gracefully', () => {
      localStorageMock.setItem('coral-diagram-recovery', 'not-valid-json');

      const { result } = renderHook(() => useAutoRecovery());
      const [state] = result.current;

      expect(state.hasRecoveryData).toBe(false);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('coral-diagram-recovery');
    });

  });

  describe('updateRecovery', () => {
    it('should debounce saves to localStorage', async () => {
      const { result } = renderHook(() => useAutoRecovery());
      const [, actions] = result.current;

      act(() => {
        actions.updateRecovery({
          documentName: 'Test',
          dslType: 'coral',
          dsl: 'service "A"',
          notation: 'flowchart',
          nodePositions: {},
        });
      });

      // Should not save immediately
      expect(localStorageMock.setItem).not.toHaveBeenCalled();

      // Advance timer past debounce delay
      act(() => {
        vi.advanceTimersByTime(1100);
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'coral-diagram-recovery',
        expect.any(String)
      );
    });

    it('stores a lossless document snapshot with the editable DSL', () => {
      const { result } = renderHook(() => useAutoRecovery());
      const document = {
        schemaVersion: '1.0.0',
        metadata: { name: 'Canonical', created: '2026-01-01', modified: '2026-01-01' },
        content: {
          format: 'graph-ir' as const,
          graphIR: {
            version: '1.0.0', id: 'g',
            nodes: [{ id: 'n', type: 'service', symbol: 'arch-service', variant: 'api' }],
            edges: [],
          },
        },
        settings: {
          notation: 'architecture',
          layout: { algorithm: 'fixed', direction: 'RIGHT' as const },
          suppressWarningAnnotations: true,
        },
      };

      act(() => result.current[1].updateRecovery({
        documentName: 'Canonical', dslType: 'coral', dsl: 'service "N"',
        notation: 'architecture', nodePositions: { n: { x: 1, y: 2 } }, document,
      }));
      act(() => vi.advanceTimersByTime(1100));

      const stored = JSON.parse(localStorageMock.getItem('coral-diagram-recovery')!);
      expect(stored.document.content.graphIR.nodes[0]).toMatchObject({
        symbol: 'arch-service', variant: 'api',
      });
      expect(stored.document.settings.suppressWarningAnnotations).toBe(true);
    });

    it('should mark state as dirty on update', () => {
      const { result } = renderHook(() => useAutoRecovery());

      act(() => {
        result.current[1].updateRecovery({
          documentName: 'Test',
          dslType: 'coral',
          dsl: 'service "A"',
          notation: 'flowchart',
          nodePositions: {},
        });
      });

      expect(result.current[0].isDirty).toBe(true);
    });

    it('should coalesce multiple rapid updates', () => {
      const { result } = renderHook(() => useAutoRecovery());
      const [, actions] = result.current;

      act(() => {
        actions.updateRecovery({
          documentName: 'Test 1',
          dslType: 'coral',
          dsl: 'service "A"',
          notation: 'flowchart',
          nodePositions: {},
        });
        actions.updateRecovery({
          documentName: 'Test 2',
          dslType: 'coral',
          dsl: 'service "B"',
          notation: 'flowchart',
          nodePositions: {},
        });
        actions.updateRecovery({
          documentName: 'Test 3',
          dslType: 'coral',
          dsl: 'service "C"',
          notation: 'flowchart',
          nodePositions: {},
        });
      });

      act(() => {
        vi.advanceTimersByTime(1100);
      });

      // Should only save once with the last data
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(savedData.documentName).toBe('Test 3');
      expect(savedData.dsl).toBe('service "C"');
    });

    it('bounds recovery latency while continuous updates replace the pending snapshot', () => {
      const { result } = renderHook(() => useAutoRecovery());
      const actions = result.current[1];
      act(() => actions.updateRecovery({
        documentName: 'First', dslType: 'coral', dsl: 'service "A"',
        notation: 'flowchart', nodePositions: {},
      }));
      act(() => vi.advanceTimersByTime(600));
      act(() => actions.updateRecovery({
        documentName: 'Latest', dslType: 'coral', dsl: 'service "B"',
        notation: 'flowchart', nodePositions: {},
      }));
      act(() => vi.advanceTimersByTime(500));
      expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
      const savedData = JSON.parse(localStorageMock.setItem.mock.calls[0][1]);
      expect(savedData.documentName).toBe('Latest');
      expect(savedData.dsl).toBe('service "B"');
    });

    it('records the latest explicit save time in a snapshot pending across markSaved', () => {
      const { result } = renderHook(() => useAutoRecovery());
      act(() => result.current[1].updateRecovery({
        documentName: 'Pending', dslType: 'coral', dsl: 'service "A"',
        notation: 'flowchart', nodePositions: {},
      }));
      vi.advanceTimersByTime(100);
      act(() => result.current[1].markSaved());
      const savedAt = result.current[0].lastSaveTime;
      expect(savedAt).not.toBeNull();
      act(() => vi.advanceTimersByTime(2000));
      const stored = JSON.parse(localStorageMock.getItem('coral-diagram-recovery')!);
      expect(stored.documentName).toBe('Pending');
      expect(stored.lastExplicitSave).toBe(savedAt);
    });

    it('schedules recovery again after an explicit save changes the writer callback', () => {
      const { result } = renderHook(() => useAutoRecovery());
      act(() => result.current[1].updateRecovery({
        documentName: 'Before save', dslType: 'coral', dsl: 'service "A"',
        notation: 'flowchart', nodePositions: {},
      }));
      act(() => result.current[1].markSaved());
      act(() => result.current[1].updateRecovery({
        documentName: 'After save', dslType: 'coral', dsl: 'service "B"',
        notation: 'flowchart', nodePositions: {},
      }));
      act(() => vi.advanceTimersByTime(1100));
      const savedData = JSON.parse(localStorageMock.setItem.mock.calls.at(-1)![1]);
      expect(savedData.documentName).toBe('After save');
      expect(savedData.dsl).toBe('service "B"');
    });

    // CR94-F5: a snapshot that is costly to build (a print-back projection)
    // is built once, when the coalesced write fires, not on every update.
    it('builds a thunk snapshot only for the coalesced write', () => {
      const { result } = renderHook(() => useAutoRecovery());
      const snapshot = (name: string) => vi.fn(() => ({
        documentName: name, dslType: 'coral' as const, dsl: `service "${name}"`,
        notation: 'flowchart', nodePositions: {},
      }));
      const superseded = snapshot('Superseded');
      const latest = snapshot('Latest');
      act(() => {
        result.current[1].updateRecovery(superseded);
        result.current[1].updateRecovery(latest);
      });
      expect(superseded).not.toHaveBeenCalled();
      expect(latest).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1100));
      expect(superseded).not.toHaveBeenCalled();
      expect(latest).toHaveBeenCalledOnce();
      const savedData = JSON.parse(localStorageMock.setItem.mock.calls.at(-1)![1]);
      expect(savedData.documentName).toBe('Latest');
      expect(savedData.dsl).toBe('service "Latest"');
    });
  });

  describe('applyRecovery', () => {
    it('should return recovery data and clear hasRecoveryData flag', () => {
      const recoveryData: RecoveryData = {
        timestamp: Date.now(),
        documentName: 'Test Diagram',
        dslType: 'mermaid',
        dsl: 'flowchart TD',
        notation: 'flowchart',
        nodePositions: { a: { x: 10, y: 20 } },
      };
      localStorageMock.setItem('coral-diagram-recovery', JSON.stringify(recoveryData));

      const { result } = renderHook(() => useAutoRecovery());

      let recovered: RecoveryData | null = null;
      act(() => {
        recovered = result.current[1].applyRecovery();
      });

      expect(recovered).toEqual(recoveryData);
      expect(result.current[0].hasRecoveryData).toBe(false);
    });

    it('should return null when no recovery data exists', () => {
      const { result } = renderHook(() => useAutoRecovery());

      let recovered: RecoveryData | null = null;
      act(() => {
        recovered = result.current[1].applyRecovery();
      });

      expect(recovered).toBeNull();
    });
  });

  describe('discardRecovery', () => {
    it('should clear recovery data from state and localStorage', () => {
      const recoveryData: RecoveryData = {
        timestamp: Date.now(),
        documentName: 'Test',
        dslType: 'coral',
        dsl: 'service "X"',
        notation: 'flowchart',
        nodePositions: {},
      };
      localStorageMock.setItem('coral-diagram-recovery', JSON.stringify(recoveryData));

      const { result } = renderHook(() => useAutoRecovery());

      act(() => {
        result.current[1].discardRecovery();
      });

      expect(result.current[0].hasRecoveryData).toBe(false);
      expect(result.current[0].recoveryData).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('coral-diagram-recovery');
    });
  });

  describe('markSaved', () => {
    it('should update lastSaveTime and clear isDirty', () => {
      const { result } = renderHook(() => useAutoRecovery());

      // First make it dirty
      act(() => {
        result.current[1].updateRecovery({
          documentName: 'Test',
          dslType: 'coral',
          dsl: 'service "A"',
          notation: 'flowchart',
          nodePositions: {},
        });
      });

      expect(result.current[0].isDirty).toBe(true);

      // Save the data first so there's something to update
      act(() => {
        vi.advanceTimersByTime(1100);
      });

      // Now mark as saved
      act(() => {
        result.current[1].markSaved();
      });

      expect(result.current[0].isDirty).toBe(false);
      expect(result.current[0].lastSaveTime).toBeGreaterThan(0);
    });
  });

  describe('clearRecovery', () => {
    it('should clear all state and localStorage', () => {
      const recoveryData: RecoveryData = {
        timestamp: Date.now(),
        documentName: 'Test',
        dslType: 'coral',
        dsl: 'service "X"',
        notation: 'flowchart',
        nodePositions: {},
      };
      localStorageMock.setItem('coral-diagram-recovery', JSON.stringify(recoveryData));

      const { result } = renderHook(() => useAutoRecovery());

      // Make it dirty
      act(() => {
        result.current[1].updateRecovery({
          documentName: 'Test 2',
          dslType: 'coral',
          dsl: 'service "Y"',
          notation: 'flowchart',
          nodePositions: {},
        });
      });

      // Clear everything
      act(() => {
        result.current[1].clearRecovery();
      });

      expect(result.current[0].hasRecoveryData).toBe(false);
      expect(result.current[0].recoveryData).toBeNull();
      expect(result.current[0].isDirty).toBe(false);
    });
  });

  describe('beforeunload warning', () => {
    it('should register beforeunload handler when warnOnExit is true', () => {
      renderHook(() => useAutoRecovery({ warnOnExit: true }));

      expect(mockAddEventListener).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function)
      );
    });

    it('should not register beforeunload handler when warnOnExit is false', () => {
      renderHook(() => useAutoRecovery({ warnOnExit: false }));

      const beforeunloadCalls = mockAddEventListener.mock.calls.filter(
        call => call[0] === 'beforeunload'
      );
      expect(beforeunloadCalls.length).toBe(0);
    });

    it('should cleanup beforeunload handler on unmount', () => {
      const { unmount } = renderHook(() => useAutoRecovery({ warnOnExit: true }));

      unmount();

      expect(mockRemoveEventListener).toHaveBeenCalledWith(
        'beforeunload',
        expect.any(Function)
      );
    });
  });
});

describe('formatRecoveryTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should format "just now" for less than 1 minute', () => {
    const timestamp = Date.now() - 30000; // 30 seconds ago
    expect(formatRecoveryTime(timestamp)).toBe('just now');
  });

  it('should format minutes ago', () => {
    const timestamp = Date.now() - 5 * 60000; // 5 minutes ago
    expect(formatRecoveryTime(timestamp)).toBe('5 minutes ago');
  });

  it('should format singular minute', () => {
    const timestamp = Date.now() - 1 * 60000; // 1 minute ago
    expect(formatRecoveryTime(timestamp)).toBe('1 minute ago');
  });

  it('should format hours ago', () => {
    const timestamp = Date.now() - 3 * 3600000; // 3 hours ago
    expect(formatRecoveryTime(timestamp)).toBe('3 hours ago');
  });

  it('should format singular hour', () => {
    const timestamp = Date.now() - 1 * 3600000; // 1 hour ago
    expect(formatRecoveryTime(timestamp)).toBe('1 hour ago');
  });

  it('should format days ago', () => {
    const timestamp = Date.now() - 2 * 86400000; // 2 days ago
    expect(formatRecoveryTime(timestamp)).toBe('2 days ago');
  });

  it('should format singular day', () => {
    const timestamp = Date.now() - 1 * 86400000; // 1 day ago
    expect(formatRecoveryTime(timestamp)).toBe('1 day ago');
  });

  it('should format as date for more than 7 days', () => {
    const timestamp = Date.now() - 10 * 86400000; // 10 days ago
    const result = formatRecoveryTime(timestamp);
    // Should be a date string, not "X days ago"
    expect(result).not.toContain('days ago');
  });
});
