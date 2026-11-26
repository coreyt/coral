import { AI_FEATURES_AVAILABLE, ON_DEVICE_MODEL_AVAILABLE } from './releaseFeatures029.js';
import { useCallback, useRef, useState } from 'react';

export const WORKSPACE_PREFERENCES_KEY = 'coral.workspace.v1';

export const BOTTOM_PANEL_TABS = ['diagnostics', 'ai', 'activity'] as const;
export const PROPERTIES_PANEL_TABS = ['selection', 'diagram'] as const;

export type BottomPanelTab = (typeof BOTTOM_PANEL_TABS)[number];
export type PropertiesPanelTab = (typeof PROPERTIES_PANEL_TABS)[number];

export interface WorkspacePreferences {
  readonly version: 1;
  readonly sourceWidthPercent: number;
  readonly propertiesWidthPx: number;
  readonly bottomHeightPx: number;
  readonly inspectorOpen: boolean;
  readonly bottomCollapsed: boolean;
  readonly bottomTab: BottomPanelTab;
  readonly propertiesTab: PropertiesPanelTab;
}

export type WorkspacePreferencesUpdate = Partial<Omit<WorkspacePreferences, 'version'>>;

export interface WorkspacePreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type WorkspacePreferencesCommit =
  | { readonly ok: true; readonly preferences: WorkspacePreferences }
  | { readonly ok: false; readonly preferences: WorkspacePreferences };

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = Object.freeze({
  version: 1,
  sourceWidthPercent: 34,
  propertiesWidthPx: 320,
  bottomHeightPx: 220,
  inspectorOpen: false,
  bottomCollapsed: false,
  bottomTab: 'diagnostics',
  propertiesTab: 'selection',
});

const WORKSPACE_PREFERENCE_KEYS = Object.freeze([
  'version',
  'sourceWidthPercent',
  'propertiesWidthPx',
  'bottomHeightPx',
  'inspectorOpen',
  'bottomCollapsed',
  'bottomTab',
  'propertiesTab',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function isKnownValue<const Value extends string>(
  value: unknown,
  knownValues: readonly Value[],
): value is Value {
  return typeof value === 'string' && knownValues.includes(value as Value);
}

/**
 * Return a fresh, exact workspace payload or reject the whole value.
 * Effective viewport clamps are deliberately not part of this persistence layer.
 */
function validatedWorkspacePreferences(value: unknown): WorkspacePreferences | undefined {
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  if (keys.length !== WORKSPACE_PREFERENCE_KEYS.length
    || keys.some((key) => !WORKSPACE_PREFERENCE_KEYS.includes(key))) {
    return undefined;
  }
  if (value.version !== 1
    || !isFiniteInRange(value.sourceWidthPercent, 0, 100)
    || !isFiniteInRange(value.propertiesWidthPx, 280, 440)
    || !isFiniteInRange(value.bottomHeightPx, 120, Number.MAX_SAFE_INTEGER)
    || typeof value.inspectorOpen !== 'boolean'
    || typeof value.bottomCollapsed !== 'boolean'
    || !isKnownValue(value.bottomTab, BOTTOM_PANEL_TABS)
    || !isKnownValue(value.propertiesTab, PROPERTIES_PANEL_TABS)) {
    return undefined;
  }
  return {
    version: 1,
    sourceWidthPercent: value.sourceWidthPercent,
    propertiesWidthPx: value.propertiesWidthPx,
    bottomHeightPx: value.bottomHeightPx,
    inspectorOpen: value.inspectorOpen,
    bottomCollapsed: value.bottomCollapsed,
    // The AI tab exists for provider AI or the on-device model; the bottom panel hides it while neither is on.
    bottomTab: !AI_FEATURES_AVAILABLE && !ON_DEVICE_MODEL_AVAILABLE && value.bottomTab === 'ai' ? 'diagnostics' : value.bottomTab,
    propertiesTab: value.propertiesTab,
  };
}

function freshDefaults(): WorkspacePreferences {
  return { ...DEFAULT_WORKSPACE_PREFERENCES };
}

export function getWorkspacePreferencesStorage(
  read: () => WorkspacePreferencesStorage = () => globalThis.localStorage,
): WorkspacePreferencesStorage | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/** A read never repairs or rewrites corrupt/unavailable storage. */
export function loadWorkspacePreferences(
  storage: WorkspacePreferencesStorage | null | undefined = getWorkspacePreferencesStorage(),
): WorkspacePreferences {
  try {
    if (!storage) return freshDefaults();
    const raw = storage.getItem(WORKSPACE_PREFERENCES_KEY);
    if (raw === null) return freshDefaults();
    return validatedWorkspacePreferences(JSON.parse(raw)) ?? freshDefaults();
  } catch {
    return freshDefaults();
  }
}

/** Persist and verify one exact presentation-only payload. */
export function saveWorkspacePreferences(
  storage: WorkspacePreferencesStorage | null | undefined,
  preferences: unknown,
): boolean {
  const validated = validatedWorkspacePreferences(preferences);
  if (!storage || !validated) return false;
  try {
    const serialized = JSON.stringify(validated);
    storage.setItem(WORKSPACE_PREFERENCES_KEY, serialized);
    return storage.getItem(WORKSPACE_PREFERENCES_KEY) === serialized;
  } catch {
    return false;
  }
}

/** Build a complete candidate without mutating the current snapshot. */
export function applyWorkspacePreferencesUpdate(
  current: WorkspacePreferences,
  update: WorkspacePreferencesUpdate,
): WorkspacePreferences | undefined {
  return validatedWorkspacePreferences({ ...current, ...update, version: 1 });
}

/**
 * Commit-first transition: consumers receive a new in-memory value only after a
 * verified write. Failure returns the identical current snapshot.
 */
export function commitWorkspacePreferencesUpdate(
  storage: WorkspacePreferencesStorage | null | undefined,
  current: WorkspacePreferences,
  update: WorkspacePreferencesUpdate,
): WorkspacePreferencesCommit {
  const candidate = applyWorkspacePreferencesUpdate(current, update);
  if (!candidate || !saveWorkspacePreferences(storage, candidate)) {
    return { ok: false, preferences: current };
  }
  return { ok: true, preferences: candidate };
}

export function resetWorkspacePreferences(
  storage: WorkspacePreferencesStorage | null | undefined,
  current: WorkspacePreferences,
): WorkspacePreferencesCommit {
  if (!saveWorkspacePreferences(storage, DEFAULT_WORKSPACE_PREFERENCES)) {
    return { ok: false, preferences: current };
  }
  return { ok: true, preferences: DEFAULT_WORKSPACE_PREFERENCES };
}

export interface WorkspacePreferencesController {
  readonly preferences: WorkspacePreferences;
  readonly update: (update: WorkspacePreferencesUpdate) => void;
  readonly reset: () => void;
}

/** Private React owner for persisted workspace presentation state. */
export function useWorkspacePreferences(
  storage: WorkspacePreferencesStorage | null | undefined = getWorkspacePreferencesStorage(),
): WorkspacePreferencesController {
  const storageRef = useRef(storage);
  const [preferences, setPreferences] = useState<WorkspacePreferences>(
    // Properties is opt-in for each session; older selections persisted it open.
    () => ({ ...loadWorkspacePreferences(storageRef.current), inspectorOpen: false }),
  );
  const preferencesRef = useRef(preferences);
  const update = useCallback((changes: WorkspacePreferencesUpdate) => {
    const committed = commitWorkspacePreferencesUpdate(
      storageRef.current,
      preferencesRef.current,
      changes,
    );
    if (!committed.ok) return;
    preferencesRef.current = committed.preferences;
    setPreferences(committed.preferences);
  }, []);
  const reset = useCallback(() => {
    const committed = resetWorkspacePreferences(storageRef.current, preferencesRef.current);
    if (!committed.ok) return;
    preferencesRef.current = committed.preferences;
    setPreferences(committed.preferences);
  }, []);
  return { preferences, update, reset };
}
