// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  WORKSPACE_PREFERENCES_KEY,
  applyWorkspacePreferencesUpdate,
  commitWorkspacePreferencesUpdate,
  loadWorkspacePreferences,
  resetWorkspacePreferences,
  saveWorkspacePreferences,
  useWorkspacePreferences,
  type WorkspacePreferences,
} from '../src/workspacePreferences';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
}

const changedPreferences = (): WorkspacePreferences => ({
  version: 1,
  sourceWidthPercent: 41,
  propertiesWidthPx: 400,
  bottomHeightPx: 360,
  inspectorOpen: false,
  bottomCollapsed: true,
  bottomTab: 'activity',
  propertiesTab: 'diagram',
});

describe('workspace preference persistence', () => {
  it('uses the approved versioned key and presentation-only defaults', () => {
    expect(WORKSPACE_PREFERENCES_KEY).toBe('coral.workspace.v1');
    expect(DEFAULT_WORKSPACE_PREFERENCES).toEqual({
      version: 1,
      sourceWidthPercent: 34,
      propertiesWidthPx: 320,
      bottomHeightPx: 220,
      inspectorOpen: false,
      bottomCollapsed: false,
      bottomTab: 'diagnostics',
      propertiesTab: 'selection',
    });
  });

  it('round-trips a valid payload through the one approved key', () => {
    const storage = memoryStorage();
    const preferences = changedPreferences();

    expect(saveWorkspacePreferences(storage, preferences)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith(
      WORKSPACE_PREFERENCES_KEY,
      JSON.stringify(preferences),
    );
    expect(loadWorkspacePreferences(storage)).toEqual(preferences);
  });

  it('falls back safely for unavailable, throwing, malformed, or unknown storage', () => {
    const throwing = {
      getItem: vi.fn(() => { throw new Error('unavailable'); }),
      setItem: vi.fn(),
    };
    expect(loadWorkspacePreferences(null)).toEqual(DEFAULT_WORKSPACE_PREFERENCES);
    expect(loadWorkspacePreferences(throwing)).toEqual(DEFAULT_WORKSPACE_PREFERENCES);

    for (const raw of [
      '{not-json',
      JSON.stringify({ ...changedPreferences(), version: 2 }),
      JSON.stringify({ ...changedPreferences(), sourceWidthPercent: Number.POSITIVE_INFINITY }),
      JSON.stringify({ ...changedPreferences(), sourceWidthPercent: -1 }),
      JSON.stringify({ ...changedPreferences(), propertiesWidthPx: 279 }),
      JSON.stringify({ ...changedPreferences(), propertiesWidthPx: 441 }),
      JSON.stringify({ ...changedPreferences(), bottomHeightPx: 119 }),
      JSON.stringify({ ...changedPreferences(), inspectorOpen: 'yes' }),
      JSON.stringify({ ...changedPreferences(), bottomTab: 'transcript' }),
      JSON.stringify({ ...changedPreferences(), propertiesTab: 'history' }),
      JSON.stringify({ ...changedPreferences(), document: 'must not be retained' }),
    ]) {
      const storage = memoryStorage({ [WORKSPACE_PREFERENCES_KEY]: raw });
      expect(loadWorkspacePreferences(storage)).toEqual(DEFAULT_WORKSPACE_PREFERENCES);
      expect(storage.setItem).not.toHaveBeenCalled();
    }
  });

  it('builds validated updates without mutating current preferences', () => {
    const current = changedPreferences();
    const updated = applyWorkspacePreferencesUpdate(current, {
      sourceWidthPercent: 52,
      bottomTab: 'diagnostics',
    });

    expect(updated).toEqual({
      ...current,
      sourceWidthPercent: 52,
      bottomTab: 'diagnostics',
    });
    expect(updated).not.toBe(current);
    expect(current).toEqual(changedPreferences());
    expect(applyWorkspacePreferencesUpdate(current, { sourceWidthPercent: 101 })).toBeUndefined();
  });

  it('does not advance current in-memory state when a write throws or cannot be verified', () => {
    const current = changedPreferences();
    const throwing = memoryStorage();
    throwing.setItem.mockImplementation(() => { throw new Error('quota'); });

    const thrown = commitWorkspacePreferencesUpdate(
      throwing,
      current,
      { bottomCollapsed: false },
    );
    expect(thrown).toEqual({ ok: false, preferences: current });
    expect(thrown.preferences).toBe(current);

    const unverifiable = memoryStorage();
    unverifiable.getItem.mockReturnValue(null);
    const mismatched = commitWorkspacePreferencesUpdate(
      unverifiable,
      current,
      { bottomCollapsed: false },
    );
    expect(mismatched).toEqual({ ok: false, preferences: current });
    expect(mismatched.preferences).toBe(current);
  });

  it('commits valid updates and resets only the workspace payload', () => {
    const storage = memoryStorage({ unrelated: 'keep' });
    const current = changedPreferences();

    const committed = commitWorkspacePreferencesUpdate(
      storage,
      current,
      { inspectorOpen: true, bottomTab: 'diagnostics' },
    );
    expect(committed).toMatchObject({
      ok: true,
      preferences: { inspectorOpen: true, bottomTab: 'diagnostics' },
    });
    expect(storage.getItem('unrelated')).toBe('keep');

    const reset = resetWorkspacePreferences(storage, committed.preferences);
    expect(reset).toEqual({ ok: true, preferences: DEFAULT_WORKSPACE_PREFERENCES });
    expect(loadWorkspacePreferences(storage)).toEqual(DEFAULT_WORKSPACE_PREFERENCES);
    expect(storage.getItem('unrelated')).toBe('keep');
  });

  it('starts Properties closed even when an earlier session persisted it open', () => {
    const saved = { ...changedPreferences(), inspectorOpen: true };
    const storage = memoryStorage({ [WORKSPACE_PREFERENCES_KEY]: JSON.stringify(saved) });
    const first = renderHook(() => useWorkspacePreferences(storage));
    expect(first.result.current.preferences).toEqual({ ...saved, inspectorOpen: false });
    expect(storage.setItem).not.toHaveBeenCalled();
    act(() => first.result.current.update({ inspectorOpen: true }));
    expect(first.result.current.preferences.inspectorOpen).toBe(true);
    first.unmount();
    const reopened = renderHook(() => useWorkspacePreferences(storage));
    expect(reopened.result.current.preferences).toEqual({ ...saved, inspectorOpen: false });
  });

  it('keeps hook state unchanged when persistence fails', () => {
    const storage = memoryStorage({
      [WORKSPACE_PREFERENCES_KEY]: JSON.stringify(changedPreferences()),
    });
    const { result } = renderHook(() => useWorkspacePreferences(storage));
    const initial = result.current.preferences;
    storage.setItem.mockImplementation(() => { throw new Error('quota'); });

    act(() => result.current.update({ sourceWidthPercent: 50 }));

    expect(result.current.preferences).toBe(initial);
  });

  it('commits a hook update once under React strict mode', () => {
    const storage = memoryStorage();
    const { result } = renderHook(
      () => useWorkspacePreferences(storage),
      { wrapper: StrictMode },
    );

    act(() => result.current.update({ bottomTab: 'diagnostics' }));

    expect(result.current.preferences.bottomTab).toBe('diagnostics');
    expect(storage.setItem).toHaveBeenCalledOnce();
  });
});
