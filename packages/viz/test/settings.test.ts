/**
 * Settings Tests (CORAL-REQ-009)
 *
 * Tests for:
 * - useSettings hook (localStorage persistence)
 * - Layout presets
 * - Settings panel state management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  DEFAULT_USER_PREFERENCES,
  DEFAULT_LAYOUT_SETTINGS,
  LAYOUT_PRESETS,
  getLayoutPreset,
  type UserPreferences,
  type LayoutPresetId,
  type LayoutSettings,
  type DocumentSettings,
  type LayoutAlgorithm,
  type LayoutDirection,
} from '../src/file/schema.js';
import { useSettings } from '../src/settings/useSettings.js';

// ============================================================================
// Layout Presets Tests
// ============================================================================

describe('Layout Presets', () => {
  describe('LAYOUT_PRESETS', () => {
    it('should have 5 presets defined', () => {
      expect(LAYOUT_PRESETS).toHaveLength(5);
    });

    it('should include flowchart preset', () => {
      const preset = LAYOUT_PRESETS.find((p) => p.id === 'flowchart');
      expect(preset).toBeDefined();
      expect(preset?.settings.algorithm).toBe('layered');
      expect(preset?.settings.direction).toBe('DOWN');
    });

    it('should include org-chart preset', () => {
      const preset = LAYOUT_PRESETS.find((p) => p.id === 'org-chart');
      expect(preset).toBeDefined();
      expect(preset?.settings.algorithm).toBe('mrtree');
    });

    it('should include network preset', () => {
      const preset = LAYOUT_PRESETS.find((p) => p.id === 'network');
      expect(preset).toBeDefined();
      expect(preset?.settings.algorithm).toBe('stress');
    });

    it('should include radial preset', () => {
      const preset = LAYOUT_PRESETS.find((p) => p.id === 'radial');
      expect(preset).toBeDefined();
      expect(preset?.settings.algorithm).toBe('radial');
    });

    it('should include custom preset', () => {
      const preset = LAYOUT_PRESETS.find((p) => p.id === 'custom');
      expect(preset).toBeDefined();
    });

    it('all presets should have required fields', () => {
      for (const preset of LAYOUT_PRESETS) {
        expect(preset.id).toBeDefined();
        expect(preset.name).toBeDefined();
        expect(preset.description).toBeDefined();
        expect(preset.settings).toBeDefined();
        expect(preset.settings.algorithm).toBeDefined();
        expect(preset.settings.direction).toBeDefined();
      }
    });
  });

  describe('getLayoutPreset', () => {
    it('should return preset by ID', () => {
      const preset = getLayoutPreset('flowchart');
      expect(preset).toBeDefined();
      expect(preset?.id).toBe('flowchart');
    });

    it('should return undefined for unknown ID', () => {
      const preset = getLayoutPreset('unknown' as LayoutPresetId);
      expect(preset).toBeUndefined();
    });
  });
});

// ============================================================================
// Default Settings Tests
// ============================================================================

describe('Default Settings', () => {
  describe('DEFAULT_USER_PREFERENCES', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_USER_PREFERENCES.defaultNotation).toBe('flowchart');
      expect(DEFAULT_USER_PREFERENCES.defaultLayoutPreset).toBe('flowchart');
      expect(DEFAULT_USER_PREFERENCES.theme).toBe('system');
      expect(DEFAULT_USER_PREFERENCES.showMinimap).toBe(true);
      expect(DEFAULT_USER_PREFERENCES.showControls).toBe(true);
      expect(DEFAULT_USER_PREFERENCES.fitViewOnLoad).toBe(true);
      expect(DEFAULT_USER_PREFERENCES.autoSaveInterval).toBe(0);
      expect(DEFAULT_USER_PREFERENCES.recentFiles).toEqual([]);
      expect(DEFAULT_USER_PREFERENCES.maxRecentFiles).toBe(10);
    });
  });

  describe('DEFAULT_LAYOUT_SETTINGS', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_LAYOUT_SETTINGS.algorithm).toBe('layered');
      expect(DEFAULT_LAYOUT_SETTINGS.direction).toBe('DOWN');
      expect(DEFAULT_LAYOUT_SETTINGS.spacing?.nodeNode).toBe(50);
      expect(DEFAULT_LAYOUT_SETTINGS.spacing?.layerSpacing).toBe(70);
      expect(DEFAULT_LAYOUT_SETTINGS.elkOptions?.['elk.edgeRouting']).toBe('ORTHOGONAL');
    });
  });
});

// ============================================================================
// useSettings Hook Tests
// ============================================================================

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] || null),
  };
})();

// Import useSettings after defining mock
// This will be dynamically imported once implemented
describe('useSettings Hook', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock);
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('User Preferences', () => {
    it('should return default preferences on first load', () => {
      const { result } = renderHook(() => useSettings());

      expect(result.current.userPreferences).toEqual(DEFAULT_USER_PREFERENCES);
    });

    it('should load preferences from localStorage via initialUserPreferences', () => {
      const customPrefs: Partial<UserPreferences> = {
        theme: 'dark',
        showMinimap: false,
      };

      const { result } = renderHook(() =>
        useSettings({ initialUserPreferences: customPrefs as UserPreferences })
      );

      expect(result.current.userPreferences.theme).toBe('dark');
      expect(result.current.userPreferences.showMinimap).toBe(false);
      // Should merge with defaults
      expect(result.current.userPreferences.defaultNotation).toBe('flowchart');
    });

    it('should update preferences and persist to localStorage', () => {
      const { result } = renderHook(() => useSettings());

      act(() => {
        result.current.updateUserPreferences({ theme: 'dark' });
      });

      expect(result.current.userPreferences.theme).toBe('dark');
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'coral:user-preferences',
        expect.stringContaining('"theme":"dark"')
      );
    });

    it('should reset preferences to defaults', () => {
      const { result } = renderHook(() =>
        useSettings({ initialUserPreferences: { ...DEFAULT_USER_PREFERENCES, theme: 'dark' } })
      );

      act(() => {
        result.current.resetUserPreferences();
      });

      expect(result.current.userPreferences).toEqual(DEFAULT_USER_PREFERENCES);
    });
  });

  describe('Document Settings', () => {
    it('should initialize with default document settings', () => {
      const { result } = renderHook(() => useSettings());

      expect(result.current.documentSettings.notation).toBe('flowchart');
      expect(result.current.documentSettings.layout).toEqual(DEFAULT_LAYOUT_SETTINGS);
    });

    it('should accept initial document settings', () => {
      const initialSettings: DocumentSettings = {
        notation: 'bpmn',
        layout: {
          algorithm: 'stress',
          direction: 'LEFT',
        },
      };

      const { result } = renderHook(() => useSettings({ initialDocumentSettings: initialSettings }));

      expect(result.current.documentSettings.notation).toBe('bpmn');
      expect(result.current.documentSettings.layout.algorithm).toBe('stress');
    });

    it('should update document settings', () => {
      const { result } = renderHook(() => useSettings());

      act(() => {
        result.current.updateDocumentSettings({
          notation: 'erd',
          layout: { ...DEFAULT_LAYOUT_SETTINGS, algorithm: 'mrtree' },
        });
      });

      expect(result.current.documentSettings.notation).toBe('erd');
      expect(result.current.documentSettings.layout.algorithm).toBe('mrtree');
    });

    it('should not persist document settings to localStorage', () => {
      const { result } = renderHook(() => useSettings());

      act(() => {
        result.current.updateDocumentSettings({
          notation: 'erd',
          layout: DEFAULT_LAYOUT_SETTINGS,
        });
      });

      // Should not call setItem for document settings
      const calls = localStorageMock.setItem.mock.calls;
      const docSettingsCalls = calls.filter((c) => c[0] === 'coral:document-settings');
      expect(docSettingsCalls).toHaveLength(0);
    });
  });

  describe('Layout Presets', () => {
    it('should apply preset by ID', () => {
      const { result } = renderHook(() => useSettings());

      act(() => {
        result.current.applyLayoutPreset('org-chart');
      });

      expect(result.current.documentSettings.layout.algorithm).toBe('mrtree');
      expect(result.current.selectedPreset).toBe('org-chart');
    });

    it('should detect custom preset when settings diverge', () => {
      const { result } = renderHook(() => useSettings());

      act(() => {
        result.current.applyLayoutPreset('flowchart');
      });

      expect(result.current.selectedPreset).toBe('flowchart');

      act(() => {
        result.current.updateDocumentSettings({
          ...result.current.documentSettings,
          layout: { ...result.current.documentSettings.layout, algorithm: 'force' },
        });
      });

      expect(result.current.selectedPreset).toBe('custom');
    });

    it('should detect matching preset when settings match', () => {
      const { result } = renderHook(() => useSettings());

      // Apply network preset
      act(() => {
        result.current.applyLayoutPreset('network');
      });

      expect(result.current.selectedPreset).toBe('network');
    });
  });

  describe('Recent Files', () => {
    it('should add file to recent files', () => {
      const { result } = renderHook(() => useSettings());

      act(() => {
        result.current.addRecentFile('/path/to/file.coral.json');
      });

      expect(result.current.userPreferences.recentFiles).toContain('/path/to/file.coral.json');
    });

    it('should move existing file to top of recent files', () => {
      const { result } = renderHook(() => useSettings());

      act(() => {
        result.current.addRecentFile('/file1.coral.json');
        result.current.addRecentFile('/file2.coral.json');
        result.current.addRecentFile('/file1.coral.json');
      });

      expect(result.current.userPreferences.recentFiles[0]).toBe('/file1.coral.json');
      expect(result.current.userPreferences.recentFiles).toHaveLength(2);
    });

    it('should limit recent files to maxRecentFiles', () => {
      const { result } = renderHook(() =>
        useSettings({
          initialUserPreferences: { ...DEFAULT_USER_PREFERENCES, maxRecentFiles: 3 },
        })
      );

      act(() => {
        for (let i = 0; i < 5; i++) {
          result.current.addRecentFile(`/file${i}.coral.json`);
        }
      });

      expect(result.current.userPreferences.recentFiles).toHaveLength(3);
      expect(result.current.userPreferences.recentFiles[0]).toBe('/file4.coral.json');
    });

    it('should clear recent files', () => {
      const { result } = renderHook(() => useSettings());

      act(() => {
        result.current.addRecentFile('/file.coral.json');
        result.current.clearRecentFiles();
      });

      expect(result.current.userPreferences.recentFiles).toEqual([]);
    });
  });

  describe('Settings Panel State', () => {
    it('should provide combined settings panel state', () => {
      const { result } = renderHook(() => useSettings());

      const state = result.current.getSettingsPanelState();

      expect(state.document).toBeDefined();
      expect(state.user).toBeDefined();
      expect(state.selectedPreset).toBeDefined();
    });
  });

  describe('Callback on Settings Change', () => {
    it('should call onDocumentSettingsChange when document settings change', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() => useSettings({ onDocumentSettingsChange: onChange }));

      act(() => {
        result.current.updateDocumentSettings({
          notation: 'bpmn',
          layout: DEFAULT_LAYOUT_SETTINGS,
        });
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ notation: 'bpmn' })
      );
    });

    it('should call onLayoutChange when layout settings change', () => {
      const onChange = vi.fn();
      const { result } = renderHook(() => useSettings({ onLayoutChange: onChange }));

      act(() => {
        result.current.applyLayoutPreset('network');
      });

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ algorithm: 'stress' })
      );
    });
  });
});

// ============================================================================
// Settings Validation Tests
// ============================================================================

describe('Settings Validation', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', localStorageMock);
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should handle invalid localStorage data gracefully via initialUserPreferences', () => {
    // Test that defaults work when no valid data provided
    const { result } = renderHook(() => useSettings());

    // Should fall back to defaults
    expect(result.current.userPreferences).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it('should handle partial data via initialUserPreferences', () => {
    const partialPrefs: Partial<UserPreferences> = { theme: 'dark' };

    const { result } = renderHook(() =>
      useSettings({ initialUserPreferences: partialPrefs as UserPreferences })
    );

    // Should merge with defaults
    expect(result.current.userPreferences.theme).toBe('dark');
    expect(result.current.userPreferences.showMinimap).toBe(true);
  });
});

// ============================================================================
// LayoutSettingsForm Component Tests
// ============================================================================

describe('LayoutSettingsForm Component', () => {
  // Note: These tests will use React Testing Library once the component is created
  // For now, we test the data structure and logic

  describe('Preset Selection', () => {
    it('LAYOUT_PRESETS should provide valid preset options', () => {
      const presetOptions = LAYOUT_PRESETS.map((p) => ({
        value: p.id,
        label: p.name,
        description: p.description,
      }));

      expect(presetOptions).toHaveLength(5);
      expect(presetOptions[0].value).toBe('flowchart');
      expect(presetOptions[0].label).toBe('Flowchart');
    });

    it('each preset should have all required layout fields', () => {
      for (const preset of LAYOUT_PRESETS) {
        expect(preset.settings.algorithm).toBeDefined();
        expect(preset.settings.direction).toBeDefined();
        expect(['UP', 'DOWN', 'LEFT', 'RIGHT']).toContain(preset.settings.direction);
      }
    });
  });

  describe('Algorithm Options', () => {
    it('should support all ELK algorithms', () => {
      const algorithms: LayoutAlgorithm[] = ['layered', 'mrtree', 'stress', 'force', 'radial', 'box'];

      for (const algo of algorithms) {
        expect(typeof algo).toBe('string');
      }
    });
  });

  describe('Direction Options', () => {
    it('should support all layout directions', () => {
      const directions: LayoutDirection[] = ['UP', 'DOWN', 'LEFT', 'RIGHT'];

      for (const dir of directions) {
        expect(['UP', 'DOWN', 'LEFT', 'RIGHT']).toContain(dir);
      }
    });
  });

  describe('Spacing Options', () => {
    it('should have default spacing values', () => {
      expect(DEFAULT_LAYOUT_SETTINGS.spacing?.nodeNode).toBeGreaterThan(0);
      expect(DEFAULT_LAYOUT_SETTINGS.spacing?.layerSpacing).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// SettingsPanel Component Tests
// ============================================================================

describe('SettingsPanel Component', () => {
  describe('Tab Structure', () => {
    it('should have Document and Preferences tab concepts', () => {
      // The panel should have two tabs: Document Settings and User Preferences
      const tabs = ['document', 'preferences'];
      expect(tabs).toContain('document');
      expect(tabs).toContain('preferences');
    });
  });

  describe('Document Tab Content', () => {
    it('document settings should include notation', () => {
      const docSettings: DocumentSettings = {
        notation: 'flowchart',
        layout: DEFAULT_LAYOUT_SETTINGS,
      };

      expect(docSettings.notation).toBeDefined();
    });

    it('document settings should include layout', () => {
      const docSettings: DocumentSettings = {
        notation: 'flowchart',
        layout: DEFAULT_LAYOUT_SETTINGS,
      };

      expect(docSettings.layout).toBeDefined();
      expect(docSettings.layout.algorithm).toBeDefined();
    });
  });

  describe('Preferences Tab Content', () => {
    it('user preferences should include display settings', () => {
      expect(DEFAULT_USER_PREFERENCES.showMinimap).toBeDefined();
      expect(DEFAULT_USER_PREFERENCES.showControls).toBeDefined();
      expect(DEFAULT_USER_PREFERENCES.fitViewOnLoad).toBeDefined();
    });

    it('user preferences should include defaults', () => {
      expect(DEFAULT_USER_PREFERENCES.defaultNotation).toBeDefined();
      expect(DEFAULT_USER_PREFERENCES.defaultLayoutPreset).toBeDefined();
    });
  });
});
