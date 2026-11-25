/**
 * useSpeechRecognition Hook
 *
 * React hook that manages speech recognition state and lifecycle.
 * Supports mode switching between 'local' (Whisper), 'browser' (Web Speech API), and 'off'.
 *
 * Part of issue #49: Voice Input for AI Chat.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { SpeechBackend, SpeechRecognitionMode } from '../speech/types';
import { WebSpeechBackend } from '../speech/webSpeechBackend';
import { WhisperBackend } from '../speech/whisperBackend';

export interface UseSpeechRecognitionOptions {
  mode: SpeechRecognitionMode;
  /** Override backend creation (for testing) */
  createBackend?: (mode: SpeechRecognitionMode) => SpeechBackend | null;
}

export interface UseSpeechRecognitionResult {
  isAvailable: boolean;
  isListening: boolean;
  isModelLoading: boolean;
  modelLoadProgress: number;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  startListening(): void;
  stopListening(): void;
  resetTranscript(): void;
}

function defaultCreateBackend(mode: SpeechRecognitionMode): SpeechBackend | null {
  switch (mode) {
    case 'browser':
      return new WebSpeechBackend();
    case 'local':
      return new WhisperBackend(
        () => new Worker(new URL('../speech/whisper.worker.ts', import.meta.url), { type: 'module' }),
      );
    case 'off':
      return null;
  }
}

export function useSpeechRecognition({
  mode,
  createBackend = defaultCreateBackend,
}: UseSpeechRecognitionOptions): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [modelLoadProgress, setModelLoadProgress] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const backendRef = useRef<SpeechBackend | null>(null);
  const isListeningRef = useRef(false);

  // Create backend based on mode
  const backend = mode === 'off' ? null : createBackend(mode);
  backendRef.current = backend;

  const isAvailable = mode !== 'off' && (backend?.isAvailable ?? false);

  const stopListening = useCallback(() => {
    if (backendRef.current) {
      backendRef.current.stop();
    }
    setIsListening(false);
    isListeningRef.current = false;
  }, []);

  const startListening = useCallback(() => {
    const b = backendRef.current;
    if (!b || !b.isAvailable) return;

    setError(null);
    setInterimTranscript('');

    b.onResult = (text: string, isFinal: boolean) => {
      if (isFinal) {
        setTranscript((prev) => (prev ? prev + text : text));
        setInterimTranscript('');
      } else {
        setInterimTranscript(text);
      }
    };

    b.onError = (err: string) => {
      setError(err);
    };

    b.onEnd = () => {
      setIsListening(false);
      isListeningRef.current = false;
    };

    // Whisper-specific callbacks
    if ('onProgress' in b) {
      (b as WhisperBackend).onProgress = (progress: number) => {
        setModelLoadProgress(progress);
      };
      (b as WhisperBackend).onModelReady = () => {
        setIsModelLoading(false);
      };
      setIsModelLoading(true);
      setModelLoadProgress(0);
    }

    b.start();
    setIsListening(true);
    isListeningRef.current = true;
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isListeningRef.current) {
        stopListening();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [stopListening]);

  // Stop on mode change
  useEffect(() => {
    if (mode === 'off' && isListeningRef.current) {
      stopListening();
    }
  }, [mode, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isListeningRef.current && backendRef.current) {
        backendRef.current.stop();
      }
    };
  }, []);

  return {
    isAvailable,
    isListening,
    isModelLoading,
    modelLoadProgress,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
