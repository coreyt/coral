/**
 * useSpeechRecognition Hook Tests
 *
 * Tests for the React hook that manages speech recognition state and lifecycle.
 * Requirement: Issue #49 (Voice Input for AI Chat)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechRecognition } from '../../src/hooks/useSpeechRecognition';
import type { SpeechBackend } from '../../src/speech/types';

// ============================================================================
// Mock Backend Factory
// ============================================================================

function createMockBackend(available = true): SpeechBackend & { triggerResult: (t: string, f: boolean) => void; triggerEnd: () => void; triggerError: (e: string) => void } {
  const backend: SpeechBackend & { triggerResult: (t: string, f: boolean) => void; triggerEnd: () => void; triggerError: (e: string) => void } = {
    isAvailable: available,
    start: vi.fn(() => {
      // Simulate async start
    }),
    stop: vi.fn(() => {
      // Triggers onEnd when called
    }),
    onResult: null,
    onError: null,
    onEnd: null,
    triggerResult(transcript: string, isFinal: boolean) {
      this.onResult?.(transcript, isFinal);
    },
    triggerEnd() {
      this.onEnd?.();
    },
    triggerError(error: string) {
      this.onError?.(error);
    },
  };
  return backend;
}

describe('useSpeechRecognition', () => {
  // ============================================================================
  // Mode = 'off'
  // ============================================================================

  it('returns unavailable when mode is off', () => {
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'off' })
    );
    expect(result.current.isAvailable).toBe(false);
    expect(result.current.isListening).toBe(false);
  });

  // ============================================================================
  // Availability
  // ============================================================================

  it('returns available when backend is available', () => {
    const backend = createMockBackend(true);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );
    expect(result.current.isAvailable).toBe(true);
  });

  it('returns unavailable when backend is not available', () => {
    const backend = createMockBackend(false);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );
    expect(result.current.isAvailable).toBe(false);
  });

  // ============================================================================
  // Start / Stop Listening
  // ============================================================================

  it('starts listening when startListening is called', () => {
    const backend = createMockBackend(true);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      result.current.startListening();
    });

    expect(result.current.isListening).toBe(true);
    expect(backend.start).toHaveBeenCalledTimes(1);
  });

  it('stops listening when stopListening is called', () => {
    const backend = createMockBackend(true);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      result.current.startListening();
    });
    act(() => {
      result.current.stopListening();
    });

    expect(result.current.isListening).toBe(false);
    expect(backend.stop).toHaveBeenCalledTimes(1);
  });

  it('stops listening when backend fires onEnd', () => {
    const backend = createMockBackend(true);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      result.current.startListening();
    });
    act(() => {
      backend.triggerEnd();
    });

    expect(result.current.isListening).toBe(false);
  });

  // ============================================================================
  // Transcript Accumulation
  // ============================================================================

  it('accumulates final transcripts', () => {
    const backend = createMockBackend(true);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      result.current.startListening();
    });
    act(() => {
      backend.triggerResult('hello ', true);
    });
    act(() => {
      backend.triggerResult('world', true);
    });

    expect(result.current.transcript).toBe('hello world');
  });

  it('tracks interim transcript separately', () => {
    const backend = createMockBackend(true);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      result.current.startListening();
    });
    act(() => {
      backend.triggerResult('hel', false);
    });

    expect(result.current.interimTranscript).toBe('hel');
    expect(result.current.transcript).toBe('');
  });

  it('clears interim on final result', () => {
    const backend = createMockBackend(true);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      result.current.startListening();
    });
    act(() => {
      backend.triggerResult('hel', false);
    });
    act(() => {
      backend.triggerResult('hello', true);
    });

    expect(result.current.interimTranscript).toBe('');
    expect(result.current.transcript).toBe('hello');
  });

  // ============================================================================
  // Reset Transcript
  // ============================================================================

  it('resets transcript on resetTranscript()', () => {
    const backend = createMockBackend(true);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      result.current.startListening();
    });
    act(() => {
      backend.triggerResult('hello', true);
    });
    act(() => {
      result.current.resetTranscript();
    });

    expect(result.current.transcript).toBe('');
  });

  // ============================================================================
  // Error Handling
  // ============================================================================

  it('sets error state on backend error', () => {
    const backend = createMockBackend(true);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      result.current.startListening();
    });
    act(() => {
      backend.triggerError('network');
    });

    expect(result.current.error).toBe('network');
  });

  // ============================================================================
  // Escape Key
  // ============================================================================

  it('stops listening on Escape key', () => {
    const backend = createMockBackend(true);
    const { result } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      result.current.startListening();
    });

    expect(result.current.isListening).toBe(true);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(backend.stop).toHaveBeenCalled();
  });

  it('does not react to Escape when not listening', () => {
    const backend = createMockBackend(true);
    renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(backend.stop).not.toHaveBeenCalled();
  });

  // ============================================================================
  // Mode Switching
  // ============================================================================

  it('stops listening when mode changes', () => {
    const backend = createMockBackend(true);
    const { result, rerender } = renderHook(
      ({ mode }: { mode: 'browser' | 'off' }) =>
        useSpeechRecognition({ mode, createBackend: () => backend }),
      { initialProps: { mode: 'browser' as const } }
    );

    act(() => {
      result.current.startListening();
    });
    expect(result.current.isListening).toBe(true);

    rerender({ mode: 'off' });
    expect(result.current.isAvailable).toBe(false);
    expect(result.current.isListening).toBe(false);
  });

  // ============================================================================
  // Cleanup on Unmount
  // ============================================================================

  it('stops backend on unmount while listening', () => {
    const backend = createMockBackend(true);
    const { result, unmount } = renderHook(() =>
      useSpeechRecognition({ mode: 'browser', createBackend: () => backend })
    );

    act(() => {
      result.current.startListening();
    });

    unmount();
    expect(backend.stop).toHaveBeenCalled();
  });
});
