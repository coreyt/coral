/**
 * useSettings Hook (CORAL-REQ-009)
 *
 * Manages settings state with two tiers:
 * - Document Settings: Saved with the diagram file
 * - User Preferences: Saved to localStorage
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  type UserPreferences,
  type DocumentSettings,
  type LayoutSettings,
  type LayoutPresetId,
  type SettingsPanelState,
  type DiagramFontSettings,
  DEFAULT_USER_PREFERENCES,
  DEFAULT_LAYOUT_SETTINGS,
  DEFAULT_DIAGRAM_FONT_SETTINGS,
  LAYOUT_PRESETS,
  getLayoutPreset,
  normalizeDiagramFontSettings,
  normalizeLlmMaxRetries,
  normalizeNotificationLevel,
} from '../file/schema.js';

const STORAGE_KEY = 'coral:user-preferences';

/**
 * Options for useSettings hook
 */
export interface UseSettingsOptions {
  /** Initial document settings (from loaded file) */
  initialDocumentSettings?: DocumentSettings;
  /** Initial user preferences (overrides localStorage) */
  initialUserPreferences?: UserPreferences;
  /** Callback when document settings change */
  onDocumentSettingsChange?: (settings: DocumentSettings) => void;
  /** Callback when layout settings change (for triggering reflow) */
  onLayoutChange?: (layout: LayoutSettings) => void;
  /** Identity of the loaded document, including same-value document changes */
  documentKey?: string | number;
}

/**
 * Result returned by useSettings hook
 */
export interface UseSettingsResult {
  /** Current user preferences */
  userPreferences: UserPreferences;
  /** Current document settings */
  documentSettings: DocumentSettings;
  /** Staged, safe requested font settings for the reference editor */
  fontDraft?: DiagramFontSettings;
  /** Currently selected/detected preset */
  selectedPreset: LayoutPresetId;

  /** Update user preferences (merged with existing) */
  updateUserPreferences: (updates: Partial<UserPreferences>) => void;
  /** Reset user preferences to defaults */
  resetUserPreferences: () => void;

  /** Update document settings */
  updateDocumentSettings: (settings: DocumentSettings) => void;
  /** Update the staged font without committing document settings */
  updateFontDraft?: (settings: DiagramFontSettings) => void;

  /** Apply a layout preset */
  applyLayoutPreset: (presetId: LayoutPresetId) => void;

  /** Add a file to recent files list */
  addRecentFile: (filePath: string) => void;
  /** Clear recent files list */
  clearRecentFiles: () => void;

  /** Get combined settings panel state */
  getSettingsPanelState: () => SettingsPanelState;
}

/**
 * Load user preferences from localStorage
 */
function loadUserPreferences(): UserPreferences {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_USER_PREFERENCES;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_USER_PREFERENCES;
    }

    const parsed = JSON.parse(stored);
    // Merge with defaults to handle missing fields
    return { ...DEFAULT_USER_PREFERENCES, ...parsed,
      editorEntityHighlighting: parsed?.editorEntityHighlighting === true,
      notificationLevel: normalizeNotificationLevel(parsed?.notificationLevel),
      llmMaxRetries: normalizeLlmMaxRetries(parsed?.llmMaxRetries) };
  } catch {
    // Invalid JSON or other error - use defaults
    return DEFAULT_USER_PREFERENCES;
  }
}

/**
 * Save user preferences to localStorage
 */
function saveUserPreferences(prefs: UserPreferences): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage full or other error - ignore
  }
}

/**
 * Detect which preset matches the current layout settings
 */
function detectPreset(layout: LayoutSettings): LayoutPresetId {
  if (layout.profile !== undefined) return 'custom';
  // Check each preset (except custom) to see if settings match
  for (const preset of LAYOUT_PRESETS) {
    if (preset.id === 'custom') continue;

    const presetLayout = preset.settings;

    // Compare key fields
    if (
      layout.algorithm === presetLayout.algorithm &&
      layout.direction === presetLayout.direction
    ) {
      return preset.id;
    }
  }

  return 'custom';
}

/**
 * Hook for managing settings with localStorage persistence for user preferences
 */
export function useSettings(
  options: UseSettingsOptions = {},
): UseSettingsResult & Required<Pick<UseSettingsResult, 'fontDraft' | 'updateFontDraft'>> {
  const {
    initialDocumentSettings,
    initialUserPreferences,
    onDocumentSettingsChange,
    onLayoutChange,
    documentKey,
  } = options;

  // User preferences state (persisted to localStorage)
  const [userPreferences, setUserPreferences] = useState<UserPreferences>(() => {
    if (initialUserPreferences) {
      return { ...DEFAULT_USER_PREFERENCES, ...initialUserPreferences,
        editorEntityHighlighting: initialUserPreferences.editorEntityHighlighting === true,
        notificationLevel: normalizeNotificationLevel(initialUserPreferences.notificationLevel),
        llmMaxRetries: normalizeLlmMaxRetries(initialUserPreferences.llmMaxRetries) };
    }
    return loadUserPreferences();
  });
  const userPreferencesChangedRef = useRef(false);

  // Document settings state (NOT persisted - saved with document)
  const [documentSettings, setDocumentSettings] = useState<DocumentSettings>(() => {
    if (initialDocumentSettings) {
      return initialDocumentSettings;
    }
    return {
      notation: userPreferences.defaultNotation,
      layout: DEFAULT_LAYOUT_SETTINGS,
      font: { default: { ...DEFAULT_DIAGRAM_FONT_SETTINGS.default } },
    };
  });

  const [fontDraft, setFontDraft] = useState<DiagramFontSettings>(() =>
    normalizeDiagramFontSettings(initialDocumentSettings?.font)
  );

  useEffect(() => {
    setFontDraft(normalizeDiagramFontSettings(documentSettings.font));
  }, [documentKey, documentSettings.font]);

  // Detect current preset based on layout settings
  const selectedPreset = useMemo(
    () => detectPreset(documentSettings.layout),
    [documentSettings.layout]
  );

  // Persist user preferences to localStorage when they change
  useEffect(() => {
    if (initialUserPreferences && !userPreferencesChangedRef.current) return;
    saveUserPreferences(userPreferences);
  }, [initialUserPreferences, userPreferences]);

  // Update user preferences
  const updateUserPreferences = useCallback((updates: Partial<UserPreferences>) => {
    userPreferencesChangedRef.current = true;
    setUserPreferences((prev) => ({ ...prev, ...updates,
      ...(Object.prototype.hasOwnProperty.call(updates, 'notificationLevel')
        ? { notificationLevel: normalizeNotificationLevel(updates.notificationLevel) } : {}),
      ...(Object.prototype.hasOwnProperty.call(updates, 'llmMaxRetries')
        ? { llmMaxRetries: normalizeLlmMaxRetries(updates.llmMaxRetries) } : {}) }));
  }, []);

  // Reset user preferences to defaults
  const resetUserPreferences = useCallback(() => {
    userPreferencesChangedRef.current = true;
    setUserPreferences(DEFAULT_USER_PREFERENCES);
  }, []);

  // Update document settings
  const updateDocumentSettings = useCallback(
    (settings: DocumentSettings) => {
      setDocumentSettings(settings);
      onDocumentSettingsChange?.(settings);
    },
    [onDocumentSettingsChange]
  );

  // Apply a layout preset
  const applyLayoutPreset = useCallback(
    (presetId: LayoutPresetId) => {
      const preset = getLayoutPreset(presetId);
      if (!preset) return;

      const newSettings: DocumentSettings = {
        ...documentSettings,
        layout: { ...preset.settings },
      };

      setDocumentSettings(newSettings);
      onDocumentSettingsChange?.(newSettings);
      onLayoutChange?.(preset.settings);
    },
    [documentSettings, onDocumentSettingsChange, onLayoutChange]
  );

  // Add file to recent files
  const addRecentFile = useCallback((filePath: string) => {
    userPreferencesChangedRef.current = true;
    setUserPreferences((prev) => {
      // Remove if already exists
      const filtered = prev.recentFiles.filter((f) => f !== filePath);
      // Add to front
      const updated = [filePath, ...filtered];
      // Limit to max
      const limited = updated.slice(0, prev.maxRecentFiles);
      return { ...prev, recentFiles: limited };
    });
  }, []);

  // Clear recent files
  const clearRecentFiles = useCallback(() => {
    userPreferencesChangedRef.current = true;
    setUserPreferences((prev) => ({ ...prev, recentFiles: [] }));
  }, []);

  // Get combined settings panel state
  const getSettingsPanelState = useCallback((): SettingsPanelState => {
    return {
      document: documentSettings,
      user: userPreferences,
      selectedPreset,
    };
  }, [documentSettings, userPreferences, selectedPreset]);

  return {
    userPreferences,
    documentSettings,
    fontDraft,
    selectedPreset,
    updateUserPreferences,
    resetUserPreferences,
    updateDocumentSettings,
    updateFontDraft: setFontDraft,
    applyLayoutPreset,
    addRecentFile,
    clearRecentFiles,
    getSettingsPanelState,
  };
}
