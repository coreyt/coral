/**
 * Model download, verification and storage for the on-device editing model
 * (R-066 AC-2, AC-3; coralsmol integration plan W-9 and W-12).
 *
 * Coral owns the download and the cache. Each manifest file is fetched once
 * with no referrer and no credentials, streamed into the origin private file
 * system (OPFS), then read back and checked against the manifest's byte count
 * and SHA-256. A verified marker is written only after every file verifies.
 * Any failure deletes the partial files; a new attempt starts over.
 */
import { FROZEN_CONTRACT } from './contract';
import { sha256Hex } from './translator';
import bundledManifest from './model-manifest.json';

export interface ModelFile { path: string; bytes: number; sha256: string }
export interface ModelManifest {
  schema: string;
  modelId: string;
  licence: string;
  source: { host: string; repository: string | null; revision: string | null };
  files: ModelFile[];
  totalBytes: number;
  contract: { format: string; plan: string; sha256: string };
  tokenCaps: { input: number; output: number };
}

export const MODEL_MANIFEST: ModelManifest = bundledManifest;
export const MODEL_DIRECTORY = 'coral-on-device-model';
const MARKER = 'verified.json';
/** One lock covers the download and model use, so one tab at a time holds either. */
const MODEL_LOCK = 'coral-on-device-model';

export type ModelStoreErrorCode = 'unpublished' | 'contract-mismatch' | 'download' | 'size' | 'hash' | 'storage' | 'cancelled';
export class ModelStoreError extends Error {
  constructor(readonly code: ModelStoreErrorCode, message: string) { super(message); }
}

/** OPFS file name for a manifest path; the worker uses the same mapping. */
export const storedName = (path: string) => path.split('/').join('--');

/** The identity a verified marker records: the file set and the contract. */
const manifestIdentity = (manifest: ModelManifest) =>
  sha256Hex(JSON.stringify({ modelId: manifest.modelId, files: manifest.files, contract: manifest.contract }));

const contractMatches = async (manifest: ModelManifest) => (await sha256Hex(FROZEN_CONTRACT)) === manifest.contract.sha256;

/** The pinned host URL prefix, or null while the manifest is unpublished. */
export function publishedBaseUrl(manifest: ModelManifest): string | null {
  const { host, repository, revision } = manifest.source;
  return repository && revision ? `https://${host}/${repository}/resolve/${revision}/` : null;
}

type Root = () => Promise<FileSystemDirectoryHandle>;
const opfsRoot: Root = () => navigator.storage.getDirectory();

/** Deletes the model directory; a failure (for example files still open) is a storage error. */
async function removeDirectory(root: FileSystemDirectoryHandle) {
  try { await root.removeEntry(MODEL_DIRECTORY, { recursive: true }); } catch (error) {
    if ((error as DOMException)?.name === 'NotFoundError') return;
    throw new ModelStoreError('storage', `Could not delete the stored model: ${(error as Error).message}`);
  }
}

export interface DownloadOptions {
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}
/** Internal and test-only inputs; the product always uses the pinned host and OPFS. */
export interface DownloadOverrides { baseUrl?: string; fetch?: typeof fetch; root?: Root }

const cancelled = () => new ModelStoreError('cancelled', 'Download cancelled');

/** Downloads and verifies every manifest file; never leaves a partial model. */
export async function downloadModel(manifest: ModelManifest = MODEL_MANIFEST,
  options: DownloadOptions & DownloadOverrides = {}): Promise<void> {
  if (!(await contractMatches(manifest))) throw new ModelStoreError('contract-mismatch', 'The model was trained on a different contract');
  const base = options.baseUrl ?? publishedBaseUrl(manifest);
  if (!base) throw new ModelStoreError('unpublished', 'No published model revision is pinned');
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const root = await (options.root ?? opfsRoot)();
  await removeDirectory(root);
  let loaded = 0;
  try {
    const directory = await root.getDirectoryHandle(MODEL_DIRECTORY, { create: true });
    for (const file of manifest.files) {
      if (options.signal?.aborted) throw cancelled();
      let response: Response;
      try {
        response = await doFetch(new URL(file.path, base).href, { referrerPolicy: 'no-referrer', credentials: 'omit',
          cache: 'no-store', signal: options.signal });
      } catch (error) {
        throw options.signal?.aborted ? cancelled()
          : new ModelStoreError('download', `Could not download ${file.path}: ${(error as Error).message}`);
      }
      if (!response.ok || !response.body) throw new ModelStoreError('download', `Could not download ${file.path}: HTTP ${response.status}`);
      const handle = await directory.getFileHandle(storedName(file.path), { create: true });
      const writable = await handle.createWritable();
      const reader = response.body.getReader();
      let written = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (options.signal?.aborted) throw cancelled();
          written += value.byteLength;
          if (written > file.bytes) throw new ModelStoreError('size', `${file.path} is larger than the manifest states`);
          await writable.write(value);
          loaded += value.byteLength;
          options.onProgress?.(loaded, manifest.totalBytes);
        }
        await writable.close();
      } catch (error) {
        await reader.cancel().catch(() => {});
        await writable.abort().catch(() => {});
        if (error instanceof ModelStoreError) throw error;
        if (options.signal?.aborted) throw cancelled();
        const name = (error as DOMException)?.name;
        throw new ModelStoreError(name === 'QuotaExceededError' ? 'storage' : 'download', `Could not store ${file.path}: ${(error as Error).message}`);
      }
      const stored = await handle.getFile();
      if (stored.size !== file.bytes) throw new ModelStoreError('size', `${file.path} is ${stored.size} bytes, not ${file.bytes}`);
      if ((await sha256Hex(await stored.arrayBuffer())) !== file.sha256) throw new ModelStoreError('hash', `${file.path} failed verification`);
    }
    const marker = await (await directory.getFileHandle(MARKER, { create: true })).createWritable();
    try {
      await marker.write(JSON.stringify({ identity: await manifestIdentity(manifest) }));
      await marker.close();
    } catch (error) {
      await marker.abort().catch(() => {});
      throw new ModelStoreError('storage', `Could not record the verified model: ${(error as Error).message}`);
    }
  } catch (error) {
    // Report what went wrong, never the cleanup; a failed cleanup leaves no marker, so nothing reads as ready.
    await removeDirectory(root).catch(() => {});
    throw error;
  }
}

export type StoredModelState = 'none' | 'ready' | 'other';

/**
 * Checks the verified marker and every stored size against the manifest:
 * `ready` for this manifest, `other` for files from another manifest or an
 * incomplete set (offer removal and a new download), `none` when absent.
 */
export async function storedModelState(manifest: ModelManifest = MODEL_MANIFEST, root: Root = opfsRoot): Promise<StoredModelState> {
  let directory: FileSystemDirectoryHandle;
  try { directory = await (await root()).getDirectoryHandle(MODEL_DIRECTORY); } catch { return 'none'; }
  try {
    const marker = JSON.parse(await (await (await directory.getFileHandle(MARKER)).getFile()).text()) as { identity?: string };
    if (marker.identity !== await manifestIdentity(manifest) || !(await contractMatches(manifest))) return 'other';
    for (const file of manifest.files) {
      if ((await (await directory.getFileHandle(storedName(file.path))).getFile()).size !== file.bytes) return 'other';
    }
    return 'ready';
  } catch { return 'other'; }
}

/** Bytes held by the stored model, whichever manifest wrote it: the size Preferences shows. */
export async function storedBytes(root: Root = opfsRoot): Promise<number> {
  let directory: FileSystemDirectoryHandle;
  try { directory = await (await root()).getDirectoryHandle(MODEL_DIRECTORY); } catch { return 0; }
  let total = 0;
  for await (const handle of (directory as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    if (handle.kind === 'file') total += (await (handle as FileSystemFileHandle).getFile()).size;
  }
  return total;
}

/** **Remove model**: deletes every stored model file and the marker. */
export async function removeModel(root: Root = opfsRoot) {
  await removeDirectory(await root());
}

/**
 * Fails when free quota is below the manifest's total bytes (R-066 AC-2). A
 * download first deletes any stored model, so its bytes count as free.
 */
export async function storageEstimate(manifest: ModelManifest = MODEL_MANIFEST, storage: StorageManager = navigator.storage,
  root: Root = opfsRoot) {
  const { quota = 0, usage = 0 } = await storage.estimate();
  const freeBytes = Math.max(0, quota - usage) + await storedBytes(root);
  return { ok: freeBytes >= manifest.totalBytes, freeBytes, neededBytes: manifest.totalBytes };
}

/**
 * Runs `task` while holding the model lock, or returns `in-use` at once when
 * another tab holds it.
 */
export async function withModelLock<T>(task: () => Promise<T>, locks: LockManager = navigator.locks): Promise<T | 'in-use'> {
  return locks.request(MODEL_LOCK, { ifAvailable: true }, lock => (lock ? task() : 'in-use' as const));
}
