import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_USER_PREFERENCES } from '@coral-viz/viz';
import {
  captureCredentialPersistenceSnapshot,
  getCredentialStorage,
  reconcileCredentialPersistence,
  transitionCredentialPersistence,
  CREDENTIAL_PERSISTENCE_ERROR,
  CREDENTIAL_PERSISTENCE_CONFLICT,
} from '../../src/llm/credentialPersistence';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    clear: vi.fn(() => values.clear()),
    get length() { return values.size; },
  } satisfies Storage;
}

const preferences = (updates: Partial<typeof DEFAULT_USER_PREFERENCES> = {}) => ({
  ...DEFAULT_USER_PREFERENCES,
  ...updates,
});

describe('credential persistence adapter', () => {
  it('captures legacy state without mutating storage', () => {
    const storage = memoryStorage({
      'coral:user-preferences': JSON.stringify(preferences({
        llmSaveApiKey: true, llmSavedApiKey: 'legacy-secret',
      })),
    });
    const snapshot = captureCredentialPersistenceSnapshot(storage);
    expect(snapshot.initialPreferences.llmSavedApiKey).toBe('');
    expect(snapshot.legacyPreferenceKey).toBe('legacy-secret');
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('migrates an opted-in legacy key to the standalone owner', () => {
    const storage = memoryStorage({
      'coral:user-preferences': JSON.stringify(preferences({
        llmSaveApiKey: true, llmSavedApiKey: 'legacy-secret',
      })),
    });
    const snapshot = captureCredentialPersistenceSnapshot(storage);
    const result = reconcileCredentialPersistence(storage, snapshot);
    expect(result).toMatchObject({ ok: true, key: 'legacy-secret' });
    expect(storage.getItem('coral-llm-api-key')).toBe('legacy-secret');
    expect(JSON.parse(storage.getItem('coral:user-preferences')!).llmSavedApiKey).toBe('');
  });

  it('retains an opted-in standalone key and scrubs an equal duplicate', () => {
    for (const legacyPreferenceKey of ['', 'one-secret']) {
      const storage = memoryStorage({
        'coral-llm-api-key': 'one-secret',
        'coral:user-preferences': JSON.stringify(preferences({
          llmSaveApiKey: true, llmSavedApiKey: legacyPreferenceKey,
        })),
      });
      expect(reconcileCredentialPersistence(
        storage, captureCredentialPersistenceSnapshot(storage),
      )).toMatchObject({ ok: true, key: 'one-secret' });
      expect(storage.getItem('coral-llm-api-key')).toBe('one-secret');
      expect(JSON.parse(storage.getItem('coral:user-preferences')!).llmSavedApiKey).toBe('');
    }
  });

  it('scrubs both locations without hydrating when persistence is disabled', () => {
    const storage = memoryStorage({
      'coral-llm-api-key': 'standalone-secret',
      'coral:user-preferences': JSON.stringify(preferences({
        llmSaveApiKey: false, llmSavedApiKey: 'legacy-secret',
      })),
    });
    const result = reconcileCredentialPersistence(
      storage, captureCredentialPersistenceSnapshot(storage),
    );
    expect(result).toMatchObject({ ok: true, key: '' });
    expect(storage.getItem('coral-llm-api-key')).toBeNull();
    expect(JSON.parse(storage.getItem('coral:user-preferences')!).llmSavedApiKey).toBe('');
  });

  it('fails closed when two opted-in locations contain different keys', () => {
    const storage = memoryStorage({
      'coral-llm-api-key': 'standalone-secret',
      'coral:user-preferences': JSON.stringify(preferences({
        llmSaveApiKey: true, llmSavedApiKey: 'different-secret',
      })),
    });
    const result = reconcileCredentialPersistence(
      storage, captureCredentialPersistenceSnapshot(storage),
    );
    expect(result).toEqual({ ok: false, error: CREDENTIAL_PERSISTENCE_CONFLICT });
    expect(JSON.stringify(result)).not.toContain('standalone-secret');
    expect(JSON.stringify(result)).not.toContain('different-secret');
  });

  it('writes opted-out preferences before attempting standalone removal', () => {
    const storage = memoryStorage({
      'coral-llm-api-key': 'session-secret',
      'coral:user-preferences': JSON.stringify(preferences({ llmSaveApiKey: true })),
    });
    storage.removeItem.mockImplementationOnce(() => { throw new Error('session-secret'); });
    const result = transitionCredentialPersistence(
      storage, preferences({ llmSaveApiKey: true }), 'session-secret', false,
    );
    expect(result).toEqual({ ok: false, error: CREDENTIAL_PERSISTENCE_ERROR });
    expect(JSON.parse(storage.getItem('coral:user-preferences')!).llmSaveApiKey).toBe(false);
    expect(JSON.stringify(result)).not.toContain('session-secret');
    expect(storage.setItem.mock.invocationCallOrder[0])
      .toBeLessThan(storage.removeItem.mock.invocationCallOrder[0]);
  });

  it('does not report opt-in success when the second preference write fails', () => {
    const storage = memoryStorage();
    const setItem = storage.setItem.getMockImplementation()!;
    storage.setItem.mockImplementation((key: string, value: string) => {
      if (key === 'coral:user-preferences') throw new Error(`leaked ${value}`);
      setItem(key, value);
    });
    const result = transitionCredentialPersistence(
      storage, preferences(), 'session-secret', true,
    );
    expect(result).toEqual({ ok: false, error: CREDENTIAL_PERSISTENCE_ERROR });
    expect(storage.getItem('coral-llm-api-key')).toBe('session-secret');
    expect(JSON.stringify(result)).not.toContain('session-secret');
  });

  it('stops before the second step when the first ordered write fails', () => {
    const optIn = memoryStorage();
    optIn.setItem.mockImplementationOnce(() => { throw new Error('secret'); });
    expect(transitionCredentialPersistence(
      optIn, preferences(), 'session-secret', true,
    )).toEqual({ ok: false, error: CREDENTIAL_PERSISTENCE_ERROR });
    expect(optIn.getItem('coral:user-preferences')).toBeNull();

    const optOut = memoryStorage({ 'coral-llm-api-key': 'session-secret' });
    optOut.setItem.mockImplementationOnce(() => { throw new Error('secret'); });
    expect(transitionCredentialPersistence(
      optOut, preferences({ llmSaveApiKey: true }), 'session-secret', false,
    )).toEqual({ ok: false, error: CREDENTIAL_PERSISTENCE_ERROR });
    expect(optOut.removeItem).not.toHaveBeenCalled();
    expect(optOut.getItem('coral-llm-api-key')).toBe('session-secret');
  });

  it('removes an empty opted-in key and rejects failed removal verification', () => {
    const empty = memoryStorage({ 'coral-llm-api-key': 'old-secret' });
    expect(transitionCredentialPersistence(
      empty, preferences(), '', true,
    )).toMatchObject({ ok: true, key: '' });
    expect(empty.getItem('coral-llm-api-key')).toBeNull();

    const unverifiable = memoryStorage({ 'coral-llm-api-key': 'old-secret' });
    unverifiable.removeItem.mockImplementationOnce(() => undefined);
    expect(transitionCredentialPersistence(
      unverifiable, preferences({ llmSaveApiKey: true }), 'old-secret', false,
    )).toEqual({ ok: false, error: CREDENTIAL_PERSISTENCE_ERROR });
  });

  it('guards unavailable and throwing storage acquisition', () => {
    expect(captureCredentialPersistenceSnapshot(null).valid).toBe(false);
    expect(getCredentialStorage(() => { throw new Error('secret getter'); })).toBeUndefined();
  });

  it('treats malformed preferences and failed read-back verification as failures', () => {
    const malformed = memoryStorage({ 'coral:user-preferences': '{bad' });
    expect(reconcileCredentialPersistence(
      malformed, captureCredentialPersistenceSnapshot(malformed),
    )).toEqual({ ok: false, error: CREDENTIAL_PERSISTENCE_ERROR });

    const unverifiable = memoryStorage();
    unverifiable.getItem.mockImplementation((key: string) =>
      key === 'coral-llm-api-key' ? null : null);
    expect(transitionCredentialPersistence(
      unverifiable, preferences(), 'session-secret', true,
    )).toEqual({ ok: false, error: CREDENTIAL_PERSISTENCE_ERROR });
  });
});
