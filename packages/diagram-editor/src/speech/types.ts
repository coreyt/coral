/**
 * Speech Recognition Types
 *
 * Strategy pattern interface for pluggable speech recognition backends.
 * Part of issue #49: Voice Input for AI Chat.
 */

/**
 * Speech recognition mode stored in UserPreferences.
 * - 'local': On-device Whisper via Web Worker (default)
 * - 'browser': Native Web Speech API (Chrome/Edge, sends audio to cloud)
 * - 'off': Disabled
 */
export type SpeechRecognitionMode = 'local' | 'browser' | 'off';

/**
 * Common interface for speech recognition backends.
 * Implementations: WebSpeechBackend, WhisperBackend.
 */
export interface SpeechBackend {
  /** Whether this backend is available in the current browser */
  readonly isAvailable: boolean;

  /** Start listening for speech */
  start(): void;

  /** Stop listening for speech */
  stop(): void;

  /** Called with transcription results */
  onResult: ((transcript: string, isFinal: boolean) => void) | null;

  /** Called on error */
  onError: ((error: string) => void) | null;

  /** Called when recognition session ends */
  onEnd: (() => void) | null;
}

/**
 * Whisper Worker message types (Main → Worker)
 */
export type WhisperWorkerRequest =
  | { type: 'load'; model: string }
  | { type: 'transcribe'; audio: Float32Array };

/**
 * Whisper Worker message types (Worker → Main)
 */
export type WhisperWorkerResponse =
  | { type: 'progress'; progress: number }
  | { type: 'ready' }
  | { type: 'result'; text: string }
  | { type: 'error'; message: string };
