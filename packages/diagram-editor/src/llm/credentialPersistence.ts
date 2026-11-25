import {
  DEFAULT_USER_PREFERENCES,
  normalizeLlmMaxRetries,
  type UserPreferences,
} from '@coral-viz/viz';

const PREFERENCES_KEY = 'coral:user-preferences';
const API_KEY = 'coral-llm-api-key';

export const CREDENTIAL_PERSISTENCE_ERROR =
  'Unable to update saved API-key settings in this browser.';
export const CREDENTIAL_PERSISTENCE_CONFLICT =
  'Saved API-key settings conflict in this browser.';

export interface CredentialPersistenceSnapshot {
  initialPreferences: UserPreferences;
  legacyPreferenceKey: string;
  standaloneKey: string;
  valid: boolean;
}

export type CredentialPersistenceResult =
  | { ok: true; key: string; preferences: UserPreferences }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getCredentialStorage(
  read: () => Storage = () => globalThis.localStorage,
): Storage | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/** Read the two legacy locations without mutating storage during render. */
export function captureCredentialPersistenceSnapshot(
  storage: Storage | null | undefined = getCredentialStorage(),
): CredentialPersistenceSnapshot {
  try {
    if (!storage) throw new Error('storage unavailable');
    const rawPreferences = storage.getItem(PREFERENCES_KEY);
    const parsed = rawPreferences === null ? {} : JSON.parse(rawPreferences);
    if (!isRecord(parsed)) throw new Error('invalid preferences');
    const legacyPreferenceKey = typeof parsed.llmSavedApiKey === 'string'
      ? parsed.llmSavedApiKey : '';
    return {
      initialPreferences: {
        ...DEFAULT_USER_PREFERENCES,
        ...parsed,
        editorEntityHighlighting: parsed.editorEntityHighlighting === true,
        llmMaxRetries: normalizeLlmMaxRetries(parsed.llmMaxRetries),
        llmSaveApiKey: parsed.llmSaveApiKey === true,
        llmSavedApiKey: '',
      },
      legacyPreferenceKey,
      standaloneKey: storage.getItem(API_KEY) ?? '',
      valid: true,
    };
  } catch {
    return {
      initialPreferences: { ...DEFAULT_USER_PREFERENCES },
      legacyPreferenceKey: '',
      standaloneKey: '',
      valid: false,
    };
  }
}

function writePreferences(storage: Storage, preferences: UserPreferences): boolean {
  const serialized = JSON.stringify(preferences);
  storage.setItem(PREFERENCES_KEY, serialized);
  return storage.getItem(PREFERENCES_KEY) === serialized;
}

function writeStandalone(storage: Storage, key: string): boolean {
  if (key) storage.setItem(API_KEY, key);
  else storage.removeItem(API_KEY);
  return storage.getItem(API_KEY) === (key || null);
}

function desiredPreferences(
  preferences: UserPreferences,
  enabled: boolean,
): UserPreferences {
  return { ...preferences, llmSaveApiKey: enabled, llmSavedApiKey: '' };
}

export function transitionCredentialPersistence(
  storage: Storage,
  currentPreferences: UserPreferences,
  key: string,
  enabled: boolean,
): CredentialPersistenceResult {
  const preferences = desiredPreferences(currentPreferences, enabled);
  try {
    if (enabled) {
      if (!writeStandalone(storage, key)) throw new Error('standalone verification');
      if (!writePreferences(storage, preferences)) throw new Error('preference verification');
    } else {
      if (!writePreferences(storage, preferences)) throw new Error('preference verification');
      if (!writeStandalone(storage, '')) throw new Error('standalone verification');
    }
    return { ok: true, key, preferences };
  } catch {
    return { ok: false, error: CREDENTIAL_PERSISTENCE_ERROR };
  }
}

export function reconcileCredentialPersistence(
  storage: Storage,
  snapshot: CredentialPersistenceSnapshot,
): CredentialPersistenceResult {
  if (!snapshot.valid) return { ok: false, error: CREDENTIAL_PERSISTENCE_ERROR };
  const { legacyPreferenceKey, standaloneKey, initialPreferences } = snapshot;
  if (initialPreferences.llmSaveApiKey
    && legacyPreferenceKey && standaloneKey && legacyPreferenceKey !== standaloneKey) {
    return { ok: false, error: CREDENTIAL_PERSISTENCE_CONFLICT };
  }
  const key = initialPreferences.llmSaveApiKey
    ? (standaloneKey || legacyPreferenceKey) : '';
  return transitionCredentialPersistence(
    storage, initialPreferences, key, initialPreferences.llmSaveApiKey,
  );
}
