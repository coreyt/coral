/**
 * Whisper Backend
 *
 * On-device speech recognition using @huggingface/transformers Whisper model
 * running inside a Web Worker. Audio never leaves the machine.
 *
 * Pipeline: MediaRecorder → Blob → AudioContext.decodeAudioData →
 *           OfflineAudioContext (resample 16kHz mono) → Float32Array → Worker
 *
 * Part of issue #49: Voice Input for AI Chat.
 */

import type { SpeechBackend, WhisperWorkerResponse } from './types';

const WHISPER_MODEL = 'onnx-community/whisper-tiny.en';

export class WhisperBackend implements SpeechBackend {
  private _createWorker: () => Worker;
  private _worker: Worker | null = null;
  private _recorder: MediaRecorder | null = null;
  private _stream: MediaStream | null = null;
  private _chunks: Blob[] = [];

  onResult: ((transcript: string, isFinal: boolean) => void) | null = null;
  onError: ((error: string) => void) | null = null;
  onEnd: (() => void) | null = null;
  onProgress: ((progress: number) => void) | null = null;
  onModelReady: (() => void) | null = null;

  constructor(createWorker: () => Worker) {
    this._createWorker = createWorker;
  }

  get isAvailable(): boolean {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  start(): void {
    if (!this.isAvailable) return;

    // Create worker and load model
    this._worker = this._createWorker();
    this._worker.onmessage = (event: MessageEvent<WhisperWorkerResponse>) => {
      this._handleWorkerMessage(event.data);
    };
    this._worker.onerror = () => {
      this.onError?.('Worker error');
    };

    // Request microphone and start recording
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this._stream = stream;
        this._chunks = [];
        this._recorder = new MediaRecorder(stream);

        this._recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this._chunks.push(event.data);
          }
        };

        this._recorder.onstop = () => {
          this._processAudio();
        };

        this._recorder.start();

        // Send load message to worker
        this._worker!.postMessage({ type: 'load', model: WHISPER_MODEL });
      })
      .catch((err) => {
        this.onError?.(err instanceof Error ? err.message : 'Microphone access denied');
        this.onEnd?.();
      });
  }

  stop(): void {
    // Stop recording (triggers ondataavailable + onstop)
    if (this._recorder && this._recorder.state === 'recording') {
      this._recorder.stop();
    }

    // Stop microphone
    if (this._stream) {
      for (const track of this._stream.getTracks()) {
        track.stop();
      }
      this._stream = null;
    }
  }

  private _handleWorkerMessage(data: WhisperWorkerResponse): void {
    switch (data.type) {
      case 'progress':
        this.onProgress?.(data.progress);
        break;
      case 'ready':
        this.onModelReady?.();
        break;
      case 'result':
        this.onResult?.(data.text, true);
        this.onEnd?.();
        break;
      case 'error':
        this.onError?.(data.message);
        this.onEnd?.();
        break;
    }
  }

  private async _processAudio(): Promise<void> {
    if (this._chunks.length === 0 || !this._worker) {
      this.onEnd?.();
      return;
    }

    try {
      const blob = new Blob(this._chunks, { type: 'audio/webm' });
      const arrayBuffer = await blob.arrayBuffer();

      // Decode audio
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtx.close();

      // Resample to 16kHz mono
      const resampled = await this._resampleTo16kHz(audioBuffer);

      // Send to worker for transcription
      this._worker.postMessage(
        { type: 'transcribe', audio: resampled },
        [resampled.buffer],
      );
    } catch (err) {
      this.onError?.(err instanceof Error ? err.message : 'Audio processing failed');
      this.onEnd?.();
    }
  }

  private async _resampleTo16kHz(audioBuffer: AudioBuffer): Promise<Float32Array> {
    const targetSampleRate = 16000;

    if (audioBuffer.sampleRate === targetSampleRate && audioBuffer.numberOfChannels === 1) {
      return audioBuffer.getChannelData(0);
    }

    const targetLength = Math.round(audioBuffer.duration * targetSampleRate);
    const offlineCtx = new OfflineAudioContext(1, targetLength, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    return rendered.getChannelData(0);
  }
}
