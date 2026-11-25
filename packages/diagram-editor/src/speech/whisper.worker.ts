/**
 * Whisper Web Worker
 *
 * Loads the Whisper model via @huggingface/transformers and transcribes
 * Float32Array audio data. Runs entirely on-device.
 *
 * Protocol:
 *   Main → Worker: { type: 'load', model } | { type: 'transcribe', audio }
 *   Worker → Main: { type: 'progress', progress } | { type: 'ready' }
 *                  | { type: 'result', text } | { type: 'error', message }
 *
 * Part of issue #49: Voice Input for AI Chat.
 */

import type { WhisperWorkerRequest, WhisperWorkerResponse } from './types';

let pipeline: unknown = null;

function post(msg: WhisperWorkerResponse) {
  self.postMessage(msg);
}

async function loadModel(model: string) {
  try {
    // Dynamic import — only loaded when worker is created
    const { env, pipeline: createPipeline } = await import('@huggingface/transformers');

    // Transformers 4.2 cannot prove that its internally selected resource set
    // was durably cached: a failed browser-cache write only warns and pipeline
    // construction may still report ready. Keep local inference honestly
    // online-required until a complete, verified Coral-owned adapter exists.
    env.useBrowserCache = false;
    env.useCustomCache = false;
    env.customCache = null;
    env.useWasmCache = false;

    pipeline = await createPipeline('automatic-speech-recognition', model, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: (progress: Record<string, unknown>) => {
        if (typeof progress.progress === 'number') {
          post({ type: 'progress', progress: progress.progress / 100 });
        }
      },
    });

    post({ type: 'ready' });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : 'Failed to load model' });
  }
}

async function transcribe(audio: Float32Array) {
  if (!pipeline) {
    post({ type: 'error', message: 'Model not loaded' });
    return;
  }

  try {
    const result = await (pipeline as (input: Float32Array) => Promise<{ text: string }>)(audio);
    const text = (result.text || '').trim();
    post({ type: 'result', text });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : 'Transcription failed' });
  }
}

self.onmessage = (event: MessageEvent<WhisperWorkerRequest>) => {
  const { data } = event;

  switch (data.type) {
    case 'load':
      loadModel(data.model);
      break;
    case 'transcribe':
      transcribe(data.audio);
      break;
  }
};
