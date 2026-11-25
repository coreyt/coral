/**
 * Opt-in on-device editing model (R-066). The P4 user interface composes
 * these parts; P2 adds no user interface.
 *
 * ON_DEVICE_MODEL_AVAILABLE (releaseFeatures029.ts) removes the whole
 * feature from a build. It stays off until P5 records inclusion
 * (ARCHITECTURE.md, "On-device editing model"). Product modules reach this
 * directory only by dynamic import behind it.
 */
import { ON_DEVICE_MODEL_AVAILABLE } from '../releaseFeatures029';
import { OnDeviceModelClient, type ClientOptions, type ExchangeResult } from './client';
import {
  MODEL_DIRECTORY, MODEL_MANIFEST, downloadModel, removeModel, storageEstimate, storedBytes, storedModelState, withModelLock,
  type DownloadOptions, type DownloadOverrides, type ModelManifest,
} from './storage';
import { listGpus, loadGpuChoice, type GpuOption } from './gpu';
import type { ChatMessage } from './translator';

export { ON_DEVICE_MODEL_AVAILABLE };

export type CapabilityResult = { ok: true } | { ok: false; reason: 'no-webgpu' | 'fallback-adapter' | 'no-opfs' | 'no-locks' };

/**
 * Capability probe: WebGPU with a real (non-fallback) adapter, OPFS and Web
 * Locks. Synchronous OPFS access exists only in workers, so the model worker
 * reports `opfs-sync-unavailable` itself.
 */
export async function probeCapability(nav: Navigator = navigator): Promise<CapabilityResult> {
  if (!nav.storage?.getDirectory || typeof Worker === 'undefined') return { ok: false, reason: 'no-opfs' };
  if (!nav.locks) return { ok: false, reason: 'no-locks' };
  const adapter = await nav.gpu?.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
  if (!adapter) return { ok: false, reason: 'no-webgpu' };
  if (adapter.info?.isFallbackAdapter) return { ok: false, reason: 'fallback-adapter' };
  return { ok: true };
}

export interface OnDeviceModel {
  manifest: ModelManifest;
  probe(): Promise<CapabilityResult>;
  estimate(): ReturnType<typeof storageEstimate>;
  stored(): ReturnType<typeof storedModelState>;
  /** The GPUs this browser offers the model, for Preferences. */
  gpus(): Promise<GpuOption[]>;
  /** Bytes the stored model occupies, for Preferences. */
  storedBytes(): Promise<number>;
  /** `busy` while this tab is already using the model; `in-use` when another tab is. */
  download(options?: DownloadOptions): Promise<void | 'busy' | 'in-use'>;
  remove(): Promise<void | 'busy' | 'in-use'>;
  run(messages: ChatMessage[]): Promise<ExchangeResult | 'in-use'>;
  /** **Stop**: cancels the exchange, including one still waiting to start its worker. */
  stop(): void;
}

/** The product entry point; refuses while the build-time constant is off. */
export function createOnDeviceModel(): OnDeviceModel {
  if (!ON_DEVICE_MODEL_AVAILABLE) throw new Error('The on-device editing model is not in this build');
  return composeOnDeviceModel();
}

/**
 * Composition behind createOnDeviceModel, exposed for tests and the
 * acceptance harness, which alone may override the model host.
 */
export function composeOnDeviceModel(options: Partial<ClientOptions> & DownloadOverrides & { manifest?: ModelManifest } = {}): OnDeviceModel {
  const { baseUrl, fetch, root, manifest = MODEL_MANIFEST, ...clientOptions } = options;
  const client = new OnDeviceModelClient({ directory: MODEL_DIRECTORY, files: manifest.files, tokenCaps: manifest.tokenCaps,
    gpu: () => loadGpuChoice(), ...clientOptions });
  let busy = false;
  let stops = 0;
  // Same-tab re-entry is `busy`; only another tab holding the Web Lock is `in-use`.
  const exclusive = async <T>(task: () => Promise<T>): Promise<T | 'busy' | 'in-use'> => {
    if (busy) return 'busy';
    busy = true;
    try { return await withModelLock(task); } finally { busy = false; }
  };
  return {
    manifest,
    probe: () => probeCapability(),
    gpus: () => listGpus(),
    estimate: () => storageEstimate(manifest, undefined, root),
    stored: () => storedModelState(manifest, root),
    storedBytes: () => storedBytes(root),
    download: downloadOptions => exclusive(() => downloadModel(manifest, { ...downloadOptions, baseUrl, fetch, root })),
    remove: () => exclusive(() => removeModel(root)),
    run: async messages => {
      const ticket = stops;
      const result = await exclusive(async (): Promise<ExchangeResult> => {
        const state = await storedModelState(manifest, root);
        if (stops !== ticket) return { status: 'cancelled' };
        if (state !== 'ready') return { status: 'error', code: 'not-ready', message: 'The model is not downloaded and verified' };
        return client.run(messages);
      });
      return result === 'busy' ? { status: 'busy' } : result;
    },
    stop: () => { stops++; client.stop(); },
  };
}

export { compactMessages, handleTable, translate, TranslateError } from './translator';
export { compactSnapshot, coralPlan, TRAINED_TYPES, type CompactResult } from './eligibility';
export type { CompactSnapshot } from '../llm/plan/snapshot';
export type { PlanResponse } from '../llm/plan/decode';
export type { ExchangeResult } from './client';
export { gpuName, loadGpuChoice, saveGpuChoice, selectedGpu, type GpuChoice, type GpuOption } from './gpu';
