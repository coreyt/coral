import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLlmChat, type SubmitContext } from '../src/hooks/useLlmChat.js';
import { DEFAULT_WORKSPACE_PREFERENCES, WORKSPACE_PREFERENCES_KEY,
  loadWorkspacePreferences } from '../src/workspacePreferences.js';

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../src/llm/generate.js', () => ({ generate }));

const context: SubmitContext = {
  nodes: [], edges: [], dsl: '', dslType: 'coral', diagnostics: [],
  graph: { version: '3.0.0', id: 'test', nodes: [
    { id: 'api', type: 'service' }, { id: 'store', type: 'database' },
  ], edges: [] },
};

describe('0.2.9 AI deferral', () => {
  it('defaults to Diagnostics and keeps a saved AI tab, which the on-device panel now uses', () => {
    expect(DEFAULT_WORKSPACE_PREFERENCES.bottomTab).toBe('diagnostics');
    const saved = { ...DEFAULT_WORKSPACE_PREFERENCES, sourceWidthPercent: 47, bottomTab: 'ai' };
    const storage = { getItem: (key: string) => key === WORKSPACE_PREFERENCES_KEY ? JSON.stringify(saved) : null,
      setItem: vi.fn() };
    expect(loadWorkspacePreferences(storage)).toEqual(saved);
  });

  it.each(['create a diagram', 'move store above api'])('refuses %s before generation or a commit', async (prompt) => {
    generate.mockReset().mockResolvedValue({ success: true, dsl: '@graph {}', outputFormat: 'coral', graph: context.graph });
    const commit = vi.fn();
    const { result } = renderHook(() => useLlmChat({ llmProvider: 'anthropic', llmModel: 'fixture',
      llmSaveApiKey: false, llmMaxRetries: 2, onDslGenerated: commit }));
    act(() => result.current.setApiKey('fixture-key'));
    await act(() => result.current.submit(prompt, context));
    expect(generate).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isMutationPending).toBe(false);
  });

  it('refuses diagnostic assistance after restoring transcript messages', async () => {
    generate.mockReset();
    const commit = vi.fn();
    const { result } = renderHook(() => useLlmChat({ llmProvider: 'anthropic', llmModel: 'fixture',
      llmSaveApiKey: false, llmMaxRetries: 2, onDslGenerated: commit }));
    act(() => result.current.setApiKey('fixture-key'));
    act(() => result.current.restoreConversation([{ role: 'assistant', content: 'Archived response' }]));
    await act(async () => {
      result.current.askAboutDiagnostic({ edgeId: 'e', sourceLabel: 'A', targetLabel: 'B',
        severity: 'error', message: 'Invalid edge' }, context);
      // Restored archives contain messages only, with no pending action.
      await result.current.confirmAction(result.current.chatEntries[0]!.id, context);
    });
    expect(generate).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
});
