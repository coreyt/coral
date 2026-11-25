export const TRANSCRIPT_DEFAULT_RETENTION_DAYS = 30;
export const TRANSCRIPT_MAX_MESSAGES = 1_000;
export const TRANSCRIPT_MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
export const TRANSCRIPT_MAX_ARCHIVES = 100;
export const TRANSCRIPT_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const DAY_MS = 86_400_000;

export interface TranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface TranscriptArchive {
  schemaVersion: 1;
  archiveId: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  openedAt: number;
  lastObservedWallNow: number;
  expiresAt: number | null;
  messages: TranscriptMessage[];
  identityClaims: string[];
}

export class ArchiveConflictError extends Error { override name = 'ArchiveConflictError'; }
export class ArchiveLimitError extends Error { override name = 'ArchiveLimitError'; }
export class ArchiveCorruptionError extends Error { override name = 'ArchiveCorruptionError'; }

export function validateTranscriptArchive(value: unknown): TranscriptArchive {
  const archive = value as Partial<TranscriptArchive> | null;
  if (!archive || archive.schemaVersion !== 1 || typeof archive.archiveId !== 'string'
    || archive.archiveId.length === 0 || !Number.isInteger(archive.revision) || archive.revision! < 0
    || !Number.isFinite(archive.createdAt) || !Number.isFinite(archive.updatedAt)
    || !Number.isFinite(archive.openedAt) || !Number.isFinite(archive.lastObservedWallNow)
    || !(archive.expiresAt === null || Number.isFinite(archive.expiresAt))
    || !Array.isArray(archive.messages)
    || !Array.isArray(archive.identityClaims)
    || !archive.identityClaims.every((claim) => typeof claim === 'string')
    || !archive.messages.every((message) => message && typeof message.id === 'string'
      && (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string' && Number.isFinite(message.createdAt))) {
    throw new ArchiveCorruptionError('Transcript archive is corrupt or unsupported');
  }
  return archive as TranscriptArchive;
}

export function createTranscriptArchive(archiveId: string, now: number, retentionDays = TRANSCRIPT_DEFAULT_RETENTION_DAYS): TranscriptArchive {
  return {
    schemaVersion: 1, archiveId, revision: 0, createdAt: now, updatedAt: now,
    openedAt: now, lastObservedWallNow: now,
    expiresAt: retentionDays === 0 ? null : now + retentionDays * DAY_MS,
    messages: [], identityClaims: [],
  };
}

export function openTranscriptArchive(
  archive: TranscriptArchive,
  wallNow: number,
  retentionDays: number,
): { status: 'expired' } | { status: 'open'; archive: TranscriptArchive } {
  const effectiveNow = Math.max(wallNow, archive.lastObservedWallNow);
  if (archive.expiresAt !== null && archive.expiresAt <= effectiveNow) return { status: 'expired' };
  return { status: 'open', archive: {
    ...archive, revision: archive.revision + 1, openedAt: effectiveNow,
    updatedAt: effectiveNow, lastObservedWallNow: effectiveNow,
    expiresAt: retentionDays === 0 ? null : effectiveNow + retentionDays * DAY_MS,
  } };
}

/** Recalculate from the last successful open without reviving an expired record. */
export function recalculateTranscriptRetention(
  archive: TranscriptArchive,
  wallNow: number,
  retentionDays: number,
): { status: 'expired' } | { status: 'open'; archive: TranscriptArchive } {
  const effectiveNow = Math.max(wallNow, archive.lastObservedWallNow);
  if (archive.expiresAt !== null && archive.expiresAt <= effectiveNow) return { status: 'expired' };
  const expiresAt = retentionDays === 0 ? null : archive.openedAt + retentionDays * DAY_MS;
  if (expiresAt !== null && expiresAt <= effectiveNow) return { status: 'expired' };
  return { status: 'open', archive: {
    ...archive,
    revision: archive.revision + 1,
    updatedAt: effectiveNow,
    lastObservedWallNow: effectiveNow,
    expiresAt,
  } };
}

export function updateTranscriptArchive(
  archive: TranscriptArchive,
  expectedRevision: number,
  message: TranscriptMessage,
): TranscriptArchive {
  if (archive.revision !== expectedRevision) throw new ArchiveConflictError('Transcript changed in another tab');
  const messages = [...archive.messages, message];
  if (messages.length > TRANSCRIPT_MAX_MESSAGES
    || new TextEncoder().encode(JSON.stringify(messages)).byteLength > TRANSCRIPT_MAX_ARCHIVE_BYTES) {
    throw new ArchiveLimitError('Transcript archive limit reached');
  }
  return { ...archive, revision: archive.revision + 1, updatedAt: message.createdAt, messages };
}

export interface TranscriptArchiveStore {
  get(archiveId: string): Promise<TranscriptArchive | undefined>;
  put(archive: TranscriptArchive, expectedRevision: number | null): Promise<void>;
  delete(archiveId: string): Promise<void>;
  clear(): Promise<void>;
  list(): Promise<TranscriptArchive[]>;
}

/** Expiry-first maintenance used at startup and before showing association choices. */
export async function purgeExpiredTranscriptArchives(
  store: TranscriptArchiveStore,
  wallNow: number,
): Promise<TranscriptArchive[]> {
  const archives = await store.list();
  const live: TranscriptArchive[] = [];
  for (const archive of archives) {
    const effectiveNow = Math.max(wallNow, archive.lastObservedWallNow);
    if (archive.expiresAt !== null && archive.expiresAt <= effectiveNow) {
      await store.delete(archive.archiveId);
    } else {
      live.push(archive);
    }
  }
  return live;
}

/** Browser adapter. Revision comparison and write occur in one IndexedDB transaction. */
export function createIndexedDbTranscriptStore(indexedDB: IDBFactory = globalThis.indexedDB): TranscriptArchiveStore {
  const database = openDatabase(indexedDB);
  const transact = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> => {
    const db = await database;
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('archives', mode);
      const store = tx.objectStore('archives');
      let value: T;
      operation(store, (next) => { value = next; }, reject);
      tx.oncomplete = () => resolve(value!);
      tx.onerror = () => reject(tx.error ?? new Error('Transcript storage failed'));
      tx.onabort = () => reject(tx.error ?? new Error('Transcript storage aborted'));
    });
  };
  return {
    get: (id) => transact('readonly', (store, done, fail) => request(store.get(id), (value) => {
      try { done(value === undefined ? undefined : validateTranscriptArchive(value)); } catch (error) { fail(error); }
    }, fail)),
    list: () => transact('readonly', (store, done, fail) => request(store.getAll(), (values) => {
      try { done(values.map(validateTranscriptArchive)); } catch (error) { fail(error); }
    }, fail)),
    delete: (id) => transact('readwrite', (store, done, fail) => request(store.delete(id), () => done(undefined), fail)),
    clear: () => transact('readwrite', (store, done, fail) => request(store.clear(), () => done(undefined), fail)),
    put: (archive, expectedRevision) => transact('readwrite', (store, done, fail) => {
      request<TranscriptArchive | undefined>(store.get(archive.archiveId), (current) => {
        const actual = current?.revision ?? null;
        if (actual !== expectedRevision) { fail(new ArchiveConflictError('Transcript changed in another tab')); return; }
        request<TranscriptArchive[]>(store.getAll(), (archives) => {
          try {
            const others = archives.filter((item) => item.archiveId !== archive.archiveId)
              .map(validateTranscriptArchive);
            if (others.length + 1 > TRANSCRIPT_MAX_ARCHIVES) {
              throw new ArchiveLimitError('Transcript archive count limit reached');
            }
            const totalBytes = new TextEncoder().encode(JSON.stringify([...others, archive])).byteLength;
            if (totalBytes > TRANSCRIPT_MAX_TOTAL_BYTES) {
              throw new ArchiveLimitError('Transcript total storage limit reached');
            }
            request(store.put(archive), () => done(undefined), fail);
          } catch (error) { fail(error); }
        }, fail);
      }, fail);
    }),
  };
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open('coral-transcripts', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('archives', { keyPath: 'archiveId' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error ?? new Error('Transcript storage unavailable'));
  });
}

function request<T>(value: IDBRequest<T>, done: (result: T) => void, fail: (error: unknown) => void) {
  value.onsuccess = () => done(value.result);
  value.onerror = () => fail(value.error ?? new Error('Transcript storage failed'));
}
