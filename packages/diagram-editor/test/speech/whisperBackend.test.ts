/**
 * WhisperBackend Tests
 *
 * Tests for the on-device Whisper speech recognition backend.
 * Uses mocked Worker and MediaRecorder.
 * Requirement: Issue #49 (Voice Input for AI Chat)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WhisperBackend } from '../../src/speech/whisperBackend';

// ============================================================================
// Mock Worker
// ============================================================================

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  // Helper to simulate worker responses
  simulateMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

// ============================================================================
// Mock MediaRecorder
// ============================================================================

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];

  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(public stream: MediaStream) {
    MockMediaRecorder.instances.push(this);
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
    // Simulate a final data chunk
    this.ondataavailable?.({ data: new Blob(['audio-data'], { type: 'audio/webm' }) });
    this.onstop?.();
  }

  static isTypeSupported() {
    return true;
  }
}

// ============================================================================
// Mock AudioContext / OfflineAudioContext
// ============================================================================

const mockAudioBuffer = {
  numberOfChannels: 1,
  sampleRate: 48000,
  length: 48000,
  duration: 1,
  getChannelData: vi.fn(() => new Float32Array(48000).fill(0.5)),
  copyFromChannel: vi.fn(),
  copyToChannel: vi.fn(),
};

const mockOfflineRenderedBuffer = {
  numberOfChannels: 1,
  sampleRate: 16000,
  length: 16000,
  duration: 1,
  getChannelData: vi.fn(() => new Float32Array(16000).fill(0.3)),
  copyFromChannel: vi.fn(),
  copyToChannel: vi.fn(),
};

class MockAudioContext {
  sampleRate = 48000;
  decodeAudioData = vi.fn().mockResolvedValue(mockAudioBuffer);
  close = vi.fn();
}

class MockOfflineAudioContext {
  destination = {};
  startRendering = vi.fn().mockResolvedValue(mockOfflineRenderedBuffer);
  createBufferSource = vi.fn(() => ({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
  }));
}

// ============================================================================
// Mock navigator.mediaDevices
// ============================================================================

const mockTrack = { stop: vi.fn() };
const mockMediaStream = {
  getTracks: () => [mockTrack],
} as unknown as MediaStream;

describe('WhisperBackend', () => {
  let originalMediaRecorder: unknown;
  let originalAudioContext: unknown;
  let originalOfflineAudioContext: unknown;

  beforeEach(() => {
    MockMediaRecorder.instances = [];
    mockTrack.stop = vi.fn();
    originalMediaRecorder = (globalThis as Record<string, unknown>).MediaRecorder;
    originalAudioContext = (globalThis as Record<string, unknown>).AudioContext;
    originalOfflineAudioContext = (globalThis as Record<string, unknown>).OfflineAudioContext;

    (globalThis as Record<string, unknown>).MediaRecorder = MockMediaRecorder;
    (globalThis as Record<string, unknown>).AudioContext = MockAudioContext;
    (globalThis as Record<string, unknown>).OfflineAudioContext = MockOfflineAudioContext;

    // Mock getUserMedia
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockMediaStream) },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).MediaRecorder = originalMediaRecorder;
    (globalThis as Record<string, unknown>).AudioContext = originalAudioContext;
    (globalThis as Record<string, unknown>).OfflineAudioContext = originalOfflineAudioContext;
  });

  // ============================================================================
  // Availability
  // ============================================================================

  it('reports available when MediaRecorder and getUserMedia exist', () => {
    const backend = new WhisperBackend(() => new MockWorker() as unknown as Worker);
    expect(backend.isAvailable).toBe(true);
  });

  it('reports unavailable when MediaRecorder missing', () => {
    delete (globalThis as Record<string, unknown>).MediaRecorder;
    const backend = new WhisperBackend(() => new MockWorker() as unknown as Worker);
    expect(backend.isAvailable).toBe(false);
  });

  // ============================================================================
  // Worker Lifecycle
  // ============================================================================

  it('creates worker and sends load message on start()', async () => {
    const mockWorker = new MockWorker();
    const backend = new WhisperBackend(() => mockWorker as unknown as Worker);
    backend.start();

    // Wait for getUserMedia promise
    await vi.waitFor(() => {
      expect(mockWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'load' })
      );
    });
  });

  it('forwards progress events from worker', async () => {
    const mockWorker = new MockWorker();
    const backend = new WhisperBackend(() => mockWorker as unknown as Worker);
    const onProgress = vi.fn();
    backend.onProgress = onProgress;
    backend.start();

    await vi.waitFor(() => {
      expect(mockWorker.postMessage).toHaveBeenCalled();
    });

    mockWorker.simulateMessage({ type: 'progress', progress: 0.5 });
    expect(onProgress).toHaveBeenCalledWith(0.5);
  });

  it('fires onModelReady when worker sends ready', async () => {
    const mockWorker = new MockWorker();
    const backend = new WhisperBackend(() => mockWorker as unknown as Worker);
    const onModelReady = vi.fn();
    backend.onModelReady = onModelReady;
    backend.start();

    await vi.waitFor(() => {
      expect(mockWorker.postMessage).toHaveBeenCalled();
    });

    mockWorker.simulateMessage({ type: 'ready' });
    expect(onModelReady).toHaveBeenCalledTimes(1);
  });

  // ============================================================================
  // Transcription Pipeline
  // ============================================================================

  it('starts MediaRecorder after getUserMedia resolves', async () => {
    const mockWorker = new MockWorker();
    const backend = new WhisperBackend(() => mockWorker as unknown as Worker);
    backend.start();

    await vi.waitFor(() => {
      expect(MockMediaRecorder.instances.length).toBe(1);
    });

    expect(MockMediaRecorder.instances[0].state).toBe('recording');
  });

  it('fires onResult when worker returns transcription', async () => {
    const mockWorker = new MockWorker();
    const backend = new WhisperBackend(() => mockWorker as unknown as Worker);
    const onResult = vi.fn();
    backend.onResult = onResult;
    backend.start();

    await vi.waitFor(() => {
      expect(mockWorker.postMessage).toHaveBeenCalled();
    });

    mockWorker.simulateMessage({ type: 'result', text: 'add a service' });
    expect(onResult).toHaveBeenCalledWith('add a service', true);
  });

  it('fires onError when worker returns error', async () => {
    const mockWorker = new MockWorker();
    const backend = new WhisperBackend(() => mockWorker as unknown as Worker);
    const onError = vi.fn();
    backend.onError = onError;
    backend.start();

    await vi.waitFor(() => {
      expect(mockWorker.postMessage).toHaveBeenCalled();
    });

    mockWorker.simulateMessage({ type: 'error', message: 'Model load failed' });
    expect(onError).toHaveBeenCalledWith('Model load failed');
  });

  // ============================================================================
  // Cleanup
  // ============================================================================

  it('stops media tracks on stop()', async () => {
    const mockWorker = new MockWorker();
    const backend = new WhisperBackend(() => mockWorker as unknown as Worker);
    backend.start();

    await vi.waitFor(() => {
      expect(mockWorker.postMessage).toHaveBeenCalled();
    });

    // Simulate ready so we get into recording state
    mockWorker.simulateMessage({ type: 'ready' });

    backend.stop();

    // Media stream tracks should be stopped
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('does not throw when stop() called without start()', () => {
    const mockWorker = new MockWorker();
    const backend = new WhisperBackend(() => mockWorker as unknown as Worker);
    expect(() => backend.stop()).not.toThrow();
  });
});
