/**
 * Web Speech API Backend
 *
 * Wraps the native SpeechRecognition / webkitSpeechRecognition API.
 * Streams interim and final transcripts. Audio is sent to browser vendor cloud.
 * Part of issue #49: Voice Input for AI Chat.
 */

import type { SpeechBackend } from './types';

// Type declarations for the Web Speech API
interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
}

interface SpeechRecognitionResultList {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  readonly error: string;
}

interface NativeSpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => NativeSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  const g = globalThis as Record<string, unknown>;
  return (g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null) as SpeechRecognitionConstructor | null;
}

export class WebSpeechBackend implements SpeechBackend {
  /** @internal exposed for tests */
  _recognition: NativeSpeechRecognition | null = null;

  onResult: ((transcript: string, isFinal: boolean) => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onEnd: (() => void) | null = null;

  get isAvailable(): boolean {
    return getSpeechRecognitionCtor() !== null;
  }

  start(): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    // Create a fresh instance each session
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        this.onResult?.(transcript, result.isFinal);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // Filter benign errors
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      this.onError?.(event.error);
    };

    recognition.onend = () => {
      this.onEnd?.();
    };

    this._recognition = recognition;
    recognition.start();
  }

  stop(): void {
    if (this._recognition) {
      this._recognition.stop();
      this._recognition = null;
    }
  }
}
