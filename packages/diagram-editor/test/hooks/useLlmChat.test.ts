// Future AI internals only; 0.2.9 availability is verified in aiDeferral029.test.ts.
vi.mock('../../src/releaseFeatures029.js', () => ({ AI_FEATURES_AVAILABLE: true }));
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { useLlmChat } from '../../src/hooks/useLlmChat';
import { classifyIntent } from '../../src/llm/classify';
import { DEFAULT_USER_PREFERENCES } from '@coral-viz/viz';

const { mockGenerate } = vi.hoisted(() => ({ mockGenerate: vi.fn() }));
vi.mock('../../src/llm/generate', () => ({ generate: mockGenerate }));

vi.mock('../../src/llm/providers', () => ({
  getProviders: () => [
    { id: 'anthropic', name: 'Anthropic', models: [{ id: 'claude-sonnet-4-5-20250929', name: 'Sonnet' }] },
  ],
}));
vi.mock('../../src/llm/classify', () => ({ classifyIntent: vi.fn().mockReturnValue('generate') }));

describe('useLlmChat', () => {
  const defaultOptions = {
    llmProvider: 'anthropic' as const,
    llmModel: 'claude-sonnet-4-5-20250929',
    llmSaveApiKey: false,
    llmMaxRetries: 2,
    onDslGenerated: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset, not just clear: drop any once-values an earlier test left queued
    // (code review C52-4), then re-seed the module-level defaults.
    mockGenerate.mockReset();
    vi.mocked(classifyIntent).mockReset().mockReturnValue('generate');
    mockGenerate.mockResolvedValue({
      success: true, dsl: 'flowchart TD\nA[A]', outputFormat: 'mermaid',
      intent: 'generate', retries: 0, driftDetected: false,
    });
    try { localStorage.clear(); } catch { /* ignore */ }
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  describe('initial state', () => {
    it('initializes with empty chat entries', () => {
      const { result } = renderHook(() => useLlmChat(defaultOptions));

      expect(result.current.chatEntries).toEqual([]);
    });

    it('initializes with empty API key', () => {
      const { result } = renderHook(() => useLlmChat(defaultOptions));

      expect(result.current.apiKey).toBe('');
    });

    it('provides available providers', () => {
      const { result } = renderHook(() => useLlmChat(defaultOptions));

      expect(result.current.providers).toHaveLength(1);
      expect(result.current.providers[0].id).toBe('anthropic');
    });
  });

  it('refuses provider generation visibly while offline without fetching', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const { result } = renderHook(() => useLlmChat(defaultOptions));
    act(() => result.current.setApiKey('session-key'));

    await act(() => result.current.submit('make a diagram', {
      nodes: [], edges: [], dsl: '', dslType: 'coral', diagnostics: [],
    }));

    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.current.chatEntries.at(-1)).toMatchObject({
      kind: 'error', text: 'AI providers require a network connection.',
    });
  });

  it('restores an associated archive into visible and bounded active conversation state', () => {
    const { result } = renderHook(() => useLlmChat(defaultOptions));
    act(() => result.current.restoreConversation([
      { role: 'user', content: 'Archived question' },
      { role: 'assistant', content: 'Archived answer' },
    ]));
    expect(result.current.chatEntries.map((entry) => [entry.kind, entry.text])).toEqual([
      ['user', 'Archived question'], ['assistant', 'Archived answer'],
    ]);
    act(() => result.current.clearChat());
    expect(result.current.chatEntries).toEqual([]);
  });

  describe('API key management', () => {
    it('setApiKey updates the key', () => {
      const { result } = renderHook(() => useLlmChat(defaultOptions));

      act(() => {
        result.current.setApiKey('sk-test-123');
      });

      expect(result.current.apiKey).toBe('sk-test-123');
    });

    it('saves key to localStorage when llmSaveApiKey is true', () => {
      const { result } = renderHook(() =>
        useLlmChat({ ...defaultOptions, llmSaveApiKey: true })
      );

      act(() => {
        result.current.setApiKey('sk-saved');
      });

      expect(localStorage.getItem('coral-llm-api-key')).toBe('sk-saved');
    });

    it('does not save key to localStorage when llmSaveApiKey is false', () => {
      const { result } = renderHook(() =>
        useLlmChat({ ...defaultOptions, llmSaveApiKey: false })
      );

      act(() => {
        result.current.setApiKey('sk-not-saved');
      });

      expect(localStorage.getItem('coral-llm-api-key')).toBeNull();
    });

    it('keeps the current key for the session but clears both stores on opt-out', async () => {
      const onCredentialPreferencesCommitted = vi.fn();
      const { result } = renderHook(() => useLlmChat({
        ...defaultOptions,
        llmSaveApiKey: true,
        onCredentialPreferencesCommitted,
      }));
      act(() => result.current.setApiKey('session-secret'));
      expect(localStorage.getItem('coral-llm-api-key')).toBe('session-secret');

      act(() => result.current.setApiKeyPersistence(false));

      expect(result.current.apiKey).toBe('session-secret');
      expect(localStorage.getItem('coral-llm-api-key')).toBeNull();
      expect(onCredentialPreferencesCommitted).toHaveBeenLastCalledWith(
        expect.objectContaining({ llmSaveApiKey: false, llmSavedApiKey: '' }),
      );
    });

    it('hydrates an opted-in legacy key only after migration succeeds', async () => {
      localStorage.setItem('coral:user-preferences', JSON.stringify({
        llmSaveApiKey: true, llmSavedApiKey: 'legacy-secret',
      }));
      const { result } = renderHook(() => useLlmChat({
        ...defaultOptions, llmSaveApiKey: true, llmSavedApiKey: 'legacy-secret',
      }));
      await waitFor(() => expect(result.current.apiKey).toBe('legacy-secret'));
      expect(localStorage.getItem('coral-llm-api-key')).toBe('legacy-secret');
      expect(JSON.parse(localStorage.getItem('coral:user-preferences')!).llmSavedApiKey).toBe('');
    });

    it('fails closed with a sanitized alert on conflicting stored keys', async () => {
      localStorage.setItem('coral-llm-api-key', 'standalone-secret');
      localStorage.setItem('coral:user-preferences', JSON.stringify({
        llmSaveApiKey: true, llmSavedApiKey: 'different-secret',
      }));
      const { result } = renderHook(() => useLlmChat({
        ...defaultOptions, llmSaveApiKey: true, llmSavedApiKey: 'different-secret',
      }));
      await waitFor(() => expect(result.current.apiKeyPersistenceError).toBeTruthy());
      expect(result.current.apiKey).toBe('');
      expect(result.current.apiKeyPersistenceError).not.toContain('standalone-secret');
      expect(result.current.apiKeyPersistenceError).not.toContain('different-secret');
    });

    it('preserves newer non-credential preferences during a later toggle', () => {
      const onCredentialPreferencesCommitted = vi.fn();
      const initialPreferences = {
        ...DEFAULT_USER_PREFERENCES, theme: 'light' as const, llmSaveApiKey: false,
      };
      const { result, rerender } = renderHook(
        ({ preferences }) => useLlmChat({
          ...defaultOptions,
          userPreferences: preferences,
          onCredentialPreferencesCommitted,
        }),
        { initialProps: { preferences: initialPreferences } },
      );
      rerender({ preferences: { ...initialPreferences, theme: 'dark' as const } });
      act(() => result.current.setApiKeyPersistence(true));
      expect(JSON.parse(localStorage.getItem('coral:user-preferences')!).theme).toBe('dark');
    });

    it('reconciles safely under StrictMode and orders rapid same-tab changes', async () => {
      localStorage.setItem('coral:user-preferences', JSON.stringify({
        llmSaveApiKey: true, llmSavedApiKey: 'legacy-secret',
      }));
      const onCredentialPreferencesCommitted = vi.fn();
      const { result } = renderHook(() => useLlmChat({
        ...defaultOptions,
        llmSaveApiKey: true,
        llmSavedApiKey: 'legacy-secret',
        onCredentialPreferencesCommitted,
      }), { wrapper: StrictMode });
      await waitFor(() => expect(result.current.apiKey).toBe('legacy-secret'));

      act(() => {
        result.current.setApiKeyPersistence(false);
        result.current.setApiKey('new-session-secret');
        result.current.setApiKeyPersistence(true);
      });
      expect(localStorage.getItem('coral-llm-api-key')).toBe('new-session-secret');
      expect(JSON.parse(localStorage.getItem('coral:user-preferences')!)).toMatchObject({
        llmSaveApiKey: true, llmSavedApiKey: '',
      });
      expect(result.current.apiKeyPersistenceError).toBeUndefined();
    });
  });

  describe('chat entry management', () => {
    it('addEntry adds a chat entry', () => {
      const { result } = renderHook(() => useLlmChat(defaultOptions));

      act(() => {
        result.current.addEntry({ kind: 'user', text: 'Hello' });
      });

      expect(result.current.chatEntries).toHaveLength(1);
      expect(result.current.chatEntries[0].kind).toBe('user');
      expect(result.current.chatEntries[0].text).toBe('Hello');
    });

    it('addEntry assigns incrementing IDs', () => {
      const { result } = renderHook(() => useLlmChat(defaultOptions));

      act(() => {
        result.current.addEntry({ kind: 'user', text: 'First' });
        result.current.addEntry({ kind: 'assistant', text: 'Second' });
      });

      expect(result.current.chatEntries[0].id).toBeLessThan(result.current.chatEntries[1].id);
    });

    it('hasApiKey reflects current API key state', () => {
      const { result } = renderHook(() => useLlmChat(defaultOptions));

      expect(result.current.hasApiKey).toBe(false);

      act(() => {
        result.current.setApiKey('sk-test');
      });

      expect(result.current.hasApiKey).toBe(true);
    });
  });

  it('keeps Mermaid output in Mermaid and sends current routing points', async () => {
    const onDslGenerated = vi.fn();
    const telemetry = vi.fn();
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated, telemetry }));

    await act(async () => {
      result.current.setApiKey('test-key');
    });
    await act(async () => {
      await result.current.submit('move it', {
        nodes: [{ id: 'a', position: { x: 10, y: 20 }, data: { label: 'A' } }],
        edges: [{
          id: 'e', source: 'a', target: 'a',
          data: { routingPoints: [{ x: 30, y: 40 }] },
        }],
        dsl: 'flowchart TD\nA[A]', dslType: 'mermaid', diagnostics: [],
      });
    });

    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({
      outputFormat: 'mermaid',
      maxRetries: 2,
      telemetry: expect.any(Function),
      layout: expect.objectContaining({
        edges: [expect.objectContaining({ routingPoints: [{ x: 30, y: 40 }] })],
      }),
    }));
    expect(onDslGenerated).toHaveBeenCalledWith(
      'flowchart TD\nA[A]', 'mermaid', undefined, undefined, expect.any(AbortSignal), 'generation',
    );
  });

  it('does not commit an exhausted invalid Mermaid result', async () => {
    mockGenerate.mockResolvedValueOnce({
      success: false,
      error: 'Invalid Mermaid output',
      outputFormat: 'mermaid',
      retries: 1,
      driftDetected: false,
      diagnostics: [
        { code: 'parse', message: 'Invalid Mermaid output', attempt: 1, format: 'mermaid' },
      ],
    });
    const onDslGenerated = vi.fn();
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    await act(async () => { result.current.setApiKey('test-key'); });

    await act(async () => {
      await result.current.submit('add a node', {
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { label: 'A' } }],
        edges: [], dsl: 'flowchart TD\nA[A]', dslType: 'mermaid', diagnostics: [],
      });
    });

    expect(onDslGenerated).not.toHaveBeenCalled();
    expect(result.current.chatEntries.at(-1)?.text).toContain('Invalid Mermaid output');
  });

  it('offers explicit Retry and starts a new request only after confirmation', async () => {
    mockGenerate
      .mockResolvedValueOnce({
        success: false,
        error: 'Candidate rejected. No changes were applied. Choose Retry to request a new candidate.',
        outputFormat: 'coral', retries: 0, driftDetected: false,
        diagnostics: [{ code: 'parse', message: 'Invalid output', attempt: 0, format: 'coral' }],
        action: { kind: 'retry-candidate', prompt: 'add a node' },
      })
      .mockResolvedValueOnce({
        success: true, dsl: 'service "A"', outputFormat: 'coral',
        intent: 'generate', retries: 0, driftDetected: false,
      });
    const onDslGenerated = vi.fn();
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    act(() => result.current.setApiKey('test-key'));
    const context = { nodes: [], edges: [], dsl: '', dslType: 'coral', diagnostics: [] };

    await act(async () => { await result.current.submit('add a node', context); });

    const actionEntry = result.current.chatEntries.find((entry) => entry.action?.kind === 'retry-candidate');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(actionEntry?.action?.status).toBe('pending');
    expect(actionEntry?.diagnostics).toEqual([{ code: 'parse', message: 'Invalid output', attempt: 0, format: 'coral' }]);
    expect(onDslGenerated).not.toHaveBeenCalled();

    await act(async () => { await result.current.confirmAction(actionEntry!.id); });

    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(onDslGenerated).toHaveBeenCalledWith(
      'service "A"', 'coral', undefined, undefined, expect.any(AbortSignal), 'generation',
    );
    expect(result.current.chatEntries.find((entry) => entry.id === actionEntry!.id)?.action?.status)
      .toBe('complete');
  });

  // Slice 52 test review T52-7: every chat entry built from a result carries all its diagnostics.
  const twoDiagnostics = [
    { code: 'coral.test.first', message: 'first', severity: 'warning', attempt: 0, format: 'coral' },
    { code: 'coral.test.second', message: 'second', severity: 'info', attempt: 1, format: 'coral' },
  ];
  it.each([
    ['a terminal failure', 'generate', 'error',
      { success: false, error: 'Generation failed badly', outputFormat: 'coral', retries: 1, driftDetected: false }],
    ['a conversion offer', 'generate', 'info',
      { success: false, error: 'Convert first', outputFormat: 'mermaid', retries: 0, driftDetected: false,
        action: { kind: 'convert-to-coral', prompt: 'p' } }],
    ['a help explanation', 'help', 'info',
      { success: true, intent: 'help', explanation: 'Because.', outputFormat: 'coral', retries: 0, driftDetected: false }],
    ['an applied Fix', 'fix', 'info',
      { success: true, intent: 'fix', dsl: 'service "Fixed"', explanation: 'Fixed it.', outputFormat: 'coral', retries: 0, driftDetected: false }],
    ['an applied generation', 'generate', 'assistant',
      { success: true, intent: 'generate', dsl: 'service "A"', outputFormat: 'coral', retries: 0, driftDetected: false }],
  ] as const)('keeps every result diagnostic on %s entry', async (_label, intent, kind, generated) => {
    vi.mocked(classifyIntent).mockReturnValueOnce(intent);
    mockGenerate.mockResolvedValueOnce({ ...generated, diagnostics: twoDiagnostics });
    const onDslGenerated = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    act(() => result.current.setApiKey('test-key'));

    await act(async () => {
      await result.current.submit('do it', { nodes: [], edges: [], dsl: 'service "Before"', dslType: 'coral', diagnostics: [] });
    });

    const entry = result.current.chatEntries.at(-1)!;
    expect(entry.kind).toBe(kind);
    expect(entry.diagnostics).toEqual(twoDiagnostics);
  });

  it('does not append internal semantic lint advice to product chat', async () => {
    mockGenerate.mockResolvedValueOnce({
      success: true, dsl: 'service "A"', outputFormat: 'coral',
      intent: 'generate', retries: 0, driftDetected: false,
      lintWarnings: ['Atypical service relationship'],
    });
    const { result } = renderHook(() => useLlmChat(defaultOptions));
    act(() => result.current.setApiKey('test-key'));

    await act(async () => {
      await result.current.submit('add a node', {
        nodes: [], edges: [], dsl: '', dslType: 'coral', diagnostics: [],
      });
    });

    expect(result.current.chatEntries.at(-1)?.text).toBe('I updated the diagram.');
    expect(result.current.chatEntries.some((entry) => entry.text.includes('Atypical'))).toBe(false);
  });

  it.each([
    ['generation', 'generate', { success: true, dsl: 'service "A"', outputFormat: 'coral',
      intent: 'generate', retries: 0, driftDetected: false }],
    ['Fix', 'fix', { success: true, dsl: 'service "Fixed"', outputFormat: 'coral',
      intent: 'fix', explanation: 'Fixed it.', retries: 0, driftDetected: false }],
  ])('applies a valid %s result without a candidate-approval action', async (_label, intent, generated) => {
    vi.mocked(classifyIntent).mockReturnValueOnce(intent as 'generate' | 'fix');
    mockGenerate.mockResolvedValueOnce(generated);
    const onDslGenerated = vi.fn().mockResolvedValue(true);
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    act(() => result.current.setApiKey('test-key'));

    await act(async () => {
      await result.current.submit('apply this request', {
        nodes: [], edges: [], dsl: 'service "Before"', dslType: 'coral',
        diagnostics: intent === 'fix' ? [{
          edgeId: 'source-error-0', severity: 'error', sourceLabel: 'Source line 1',
          targetLabel: 'Coral DSL', message: 'Unexpected syntax',
        }] : [],
      });
    });

    expect(onDslGenerated).toHaveBeenCalledWith(
      generated.dsl, 'coral', undefined, undefined, expect.any(AbortSignal),
      intent === 'fix' ? 'fix' : 'generation',
    );
    expect(result.current.chatEntries.some((entry) => entry.action?.status === 'pending')).toBe(false);
  });

  it('labels automatic transport replay distinctly from an explicit candidate Retry', async () => {
    mockGenerate.mockImplementationOnce(async (request) => {
      request.telemetry?.({
        kind: 'delay', attempt: 0, strategy: 'initial', delayMs: 0,
        reason: 'provider', elapsedMs: 1,
      });
      return {
        success: true, dsl: 'service "A"', outputFormat: 'coral',
        intent: 'generate', retries: 1, driftDetected: false,
      };
    });
    const telemetry = vi.fn();
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, telemetry }));
    act(() => result.current.setApiKey('test-key'));

    await act(async () => {
      await result.current.submit('add a node', {
        nodes: [], edges: [], dsl: '', dslType: 'coral', diagnostics: [],
      });
    });

    expect(telemetry).toHaveBeenCalledWith(expect.objectContaining({ kind: 'delay' }));
    expect(result.current.chatEntries.some((entry) =>
      entry.text === 'Provider request failed; retrying automatically (1 of 2).')).toBe(true);
  });

  it('sends the captured invalid source for Fix even when the retained canvas is empty', async () => {
    vi.mocked(classifyIntent).mockReturnValueOnce('fix');
    const { result } = renderHook(() => useLlmChat(defaultOptions));
    act(() => result.current.setApiKey('test-key'));
    const invalid = 'service "API" as api\napi -> ???';

    await act(async () => {
      await result.current.submit('Fix the current source error.', {
        nodes: [],
        edges: [],
        dsl: invalid,
        dslType: 'coral',
        diagnostics: [{
          edgeId: 'source-error-0', severity: 'error', sourceLabel: 'Source line 2',
          targetLabel: 'Coral DSL', message: 'Unexpected syntax',
        }],
      });
    });

    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ existingDsl: invalid }));
  });

  // S93-WI-10 / R-054 AC-1: single-flight. A repeat start while a request is
  // active has no side effect and never replaces or aborts the active request.
  it('ignores a same-tick repeat submission without aborting the active request', async () => {
    let finishFirst!: (value: any) => void;
    mockGenerate.mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    const onDslGenerated = vi.fn().mockReturnValue(true);
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    await act(async () => { result.current.setApiKey('key'); });
    const context = { nodes: [], edges: [], dsl: '', dslType: 'coral' as const, diagnostics: [] };
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.submit('first', context);
      second = result.current.submit('second', context);
    });
    await act(async () => { await second; });
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect((mockGenerate.mock.calls[0][0].signal as AbortSignal).aborted).toBe(false);
    expect(result.current.chatEntries.filter((entry) => entry.kind === 'user').map((entry) => entry.text)).toEqual(['first']);
    expect(result.current.isGenerating).toBe(true);
    finishFirst({ success: true, dsl: 'service "First"', outputFormat: 'coral', intent: 'generate', retries: 0, driftDetected: false });
    await act(async () => { await first; });
    expect(onDslGenerated).toHaveBeenCalledOnce();
    expect(onDslGenerated.mock.calls[0][0]).toBe('service "First"');
    expect(result.current.isGenerating).toBe(false);
  });

  it('keeps a pending confirmation intact when confirmed while another request is active', async () => {
    const graph = { version: '3.0.0' as const, id: 'diagram',
      nodes: [{ id: 'a', type: 'service', label: 'A', position: { x: 0, y: 0 } }], edges: [] };
    let finishBusy!: (value: any) => void;
    mockGenerate
      .mockResolvedValueOnce({ success: false, error: 'Convert to Coral first.',
        action: { kind: 'convert-to-coral', prompt: 'move A right' }, intent: 'generate', retries: 0, driftDetected: false })
      .mockImplementationOnce(() => new Promise((resolve) => { finishBusy = resolve; }))
      .mockResolvedValueOnce({ success: true, dsl: 'service "A" at (100, 0)', graph,
        outputFormat: 'coral', intent: 'generate', retries: 0, driftDetected: false });
    const onDslGenerated = vi.fn().mockReturnValue(true);
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    act(() => result.current.setApiKey('key'));
    const context = { nodes: [{ id: 'a', position: { x: 0, y: 0 }, measured: { width: 80, height: 40 }, data: {} }],
      edges: [], dsl: 'flowchart TD\nA[A]', dslType: 'mermaid' as const, diagnostics: [], graph, revision: 3 };
    await act(async () => { await result.current.submit('move A right', context); });
    const actionId = result.current.chatEntries.find((entry) => entry.action)!.id;

    let busy!: Promise<void>;
    act(() => { busy = result.current.submit('something else', { ...context, dslType: 'coral', dsl: 'service "A"' }); });
    await act(async () => { await result.current.confirmAction(actionId); });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.current.chatEntries.find((entry) => entry.id === actionId)?.action?.status).toBe('pending');

    finishBusy({ success: true, dsl: 'service "B"', outputFormat: 'coral', intent: 'generate', retries: 0, driftDetected: false });
    await act(async () => { await busy; });
    await act(async () => { await result.current.confirmAction(actionId); });
    expect(mockGenerate).toHaveBeenCalledTimes(3);
    expect(result.current.chatEntries.find((entry) => entry.id === actionId)?.action?.status).toBe('complete');
  });

  it('lets neither a late cancelled request commit nor unlock the next request', async () => {
    let finishA!: (value: any) => void;
    let finishB!: (value: any) => void;
    mockGenerate
      .mockImplementationOnce(() => new Promise((resolve) => { finishA = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishB = resolve; }));
    const onDslGenerated = vi.fn().mockReturnValue(true);
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    act(() => result.current.setApiKey('key'));
    const context = { nodes: [], edges: [], dsl: '', dslType: 'coral' as const, diagnostics: [] };
    let a!: Promise<void>;
    let b!: Promise<void>;
    act(() => { a = result.current.submit('A', context); });
    act(() => result.current.abortActive('user'));
    act(() => { b = result.current.submit('B', context); });
    finishA({ success: true, dsl: 'service "A"', outputFormat: 'coral', intent: 'generate', retries: 0, driftDetected: false });
    await act(async () => { await a; });
    expect(onDslGenerated).not.toHaveBeenCalled();
    expect(result.current.isGenerating).toBe(true);
    finishB({ success: true, dsl: 'service "B"', outputFormat: 'coral', intent: 'generate', retries: 0, driftDetected: false });
    await act(async () => { await b; });
    expect(onDslGenerated).toHaveBeenCalledOnce();
    expect(onDslGenerated.mock.calls[0][0]).toBe('service "B"');
    expect(result.current.isGenerating).toBe(false);
  });

  // S93-WI-11: only a stale result is described as stale.
  it('reports a non-stale rejection reason instead of staleness', async () => {
    const onDslGenerated = vi.fn().mockReturnValue({
      applied: false, reason: 'layout-blocked', message: 'Diagram update failed: layout quality regressed',
    });
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    act(() => result.current.setApiKey('key'));
    await act(async () => {
      await result.current.submit('change it', { nodes: [], edges: [], dsl: '', dslType: 'coral', diagnostics: [] });
    });
    expect(result.current.chatEntries.at(-1)).toMatchObject({
      kind: 'error',
      text: 'The generated diagram was not applied: Diagram update failed: layout quality regressed',
      diagnosticCode: 'ai.candidate.layout-blocked',
    });
    expect(result.current.chatEntries.some((entry) => entry.text.includes('stale result'))).toBe(false);
  });

  it('labels an explicit user cancellation without applying a late result', async () => {
    let finish!: (value: any) => void;
    mockGenerate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const onDslGenerated = vi.fn();
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    act(() => result.current.setApiKey('key'));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit('generate', {
        nodes: [], edges: [], dsl: '', dslType: 'coral', diagnostics: [],
      });
    });

    act(() => result.current.abortActive('user'));
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.chatEntries.at(-1)).toMatchObject({
      kind: 'error', text: 'Generation cancelled. No changes were applied.',
      diagnosticCode: 'provider.aborted',
    });
    finish({ success: true, dsl: 'service "Late"', outputFormat: 'coral', retries: 0, driftDetected: false });
    await act(async () => { await pending; });
    expect(onDslGenerated).not.toHaveBeenCalled();
  });

  it.each([
    ['generate', { success: true, dsl: 'service "Late"', outputFormat: 'coral',
      intent: 'generate', retries: 0, driftDetected: false }],
    ['fix', { success: true, dsl: 'service "Late"', outputFormat: 'coral',
      intent: 'fix', explanation: 'Fixed it.', retries: 0, driftDetected: false }],
  ])('publishes no %s success when cancelled during an awaited commit', async (label, generated) => {
    mockGenerate.mockResolvedValueOnce(generated);
    let finishCommit!: (value: boolean) => void;
    let commitSignal: AbortSignal | undefined;
    const onDslGenerated = vi.fn((
      _dsl: string, _format: string, _graph: unknown, _revision: unknown, signal?: AbortSignal,
    ) => {
      commitSignal = signal;
      return new Promise<boolean>((resolve) => { finishCommit = resolve; });
    });
    const onConversationMessage = vi.fn();
    const { result } = renderHook(() => useLlmChat({
      ...defaultOptions, onDslGenerated, onConversationMessage,
    }));
    act(() => result.current.setApiKey('key'));
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit('change it', {
        nodes: [], edges: [], dsl: '', dslType: 'coral', diagnostics: [],
      });
    });
    await waitFor(() => expect(onDslGenerated).toHaveBeenCalledOnce());
    expect(onDslGenerated.mock.calls[0][5]).toBe(label === 'fix' ? 'fix' : 'generation');

    act(() => result.current.abortActive('user'));

    expect(commitSignal?.aborted).toBe(true);
    await act(async () => { finishCommit(true); await pending; });
    expect(result.current.chatEntries.some((entry) => entry.kind === 'assistant')).toBe(false);
    expect(result.current.chatEntries.some((entry) => entry.explanation === 'Fixed it.')).toBe(false);
    expect(onConversationMessage).toHaveBeenCalledTimes(1);
    expect(onConversationMessage).toHaveBeenCalledWith({ role: 'user', content: 'change it' });
  });

  it('aborts an active generation when the hook unmounts', async () => {
    let finish!: (value: any) => void;
    mockGenerate.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result, unmount } = renderHook(() => useLlmChat(defaultOptions));
    await act(async () => { result.current.setApiKey('key'); });
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.submit('generate', {
        nodes: [], edges: [], dsl: '', dslType: 'coral', diagnostics: [],
      });
    });
    const signal = mockGenerate.mock.calls[0][0].signal as AbortSignal;

    unmount();
    expect(signal.aborted).toBe(true);
    finish({ success: false, error: 'cancelled', retries: 0, driftDetected: false });
    await pending;
  });

  it('does not contact a provider for a non-local request without a key', async () => {
    const { result } = renderHook(() => useLlmChat(defaultOptions));
    await act(async () => {
      await result.current.submit('explain this diagram', {
        nodes: [], edges: [], dsl: '', dslType: 'coral', diagnostics: [],
      });
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.current.chatEntries.at(-1)?.text).toContain('Configure an API key');
  });

  it('surfaces invalid captured geometry with a stable code before generation', async () => {
    const graph = {
      version: '3.0.0' as const, id: 'diagram',
      nodes: [{ id: 'a', type: 'service' }], edges: [],
    };
    const { result } = renderHook(() => useLlmChat(defaultOptions));
    await act(async () => {
      await result.current.submit('put a at the left side of the diagram', {
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: {} }],
        edges: [], dsl: 'service "A" as a', dslType: 'coral', diagnostics: [], graph,
      });
    });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.current.chatEntries.at(-1)?.diagnosticCode).toBe('spatial.context.invalid');
  });

  it('does not commit a stale generated graph', async () => {
    const graph = {
      version: '3.0.0' as const, id: 'diagram',
      nodes: [{ id: 'a', type: 'service', position: { x: 40, y: 20 } }], edges: [],
    };
    mockGenerate.mockResolvedValueOnce({
      success: true, dsl: 'service "A" at (40, 20)', graph,
      outputFormat: 'coral', intent: 'generate', retries: 0, driftDetected: false,
    });
    const onDslGenerated = vi.fn().mockReturnValue(false);
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));

    await act(async () => {
      await result.current.submit('move A', {
        nodes: [{ id: 'a', position: { x: 0, y: 0 }, measured: { width: 80, height: 40 }, data: {} }],
        edges: [], dsl: 'service "A"', dslType: 'coral', diagnostics: [], graph, revision: 7,
      });
    });

    expect(onDslGenerated).toHaveBeenCalledWith(
      expect.any(String), 'coral', graph, 7, expect.any(AbortSignal), 'generation',
    );
    expect(result.current.chatEntries.at(-1)?.text).toContain('stale result was not applied');
    expect(result.current.chatEntries.at(-1)?.diagnosticCode).toBe('spatial.stale');
  });

  it('requires one-shot confirmation before converting Mermaid spatial edits', async () => {
    const graph = {
      version: '3.0.0' as const, id: 'diagram',
      nodes: [{ id: 'a', type: 'service', label: 'A', position: { x: 0, y: 0 } }], edges: [],
    };
    mockGenerate
      .mockResolvedValueOnce({
        success: false,
        error: 'Convert to Coral first.',
        action: { kind: 'convert-to-coral', prompt: 'move A right' },
        intent: 'generate', retries: 0, driftDetected: false,
      })
      .mockResolvedValueOnce({
        success: true, dsl: 'service "A" at (100, 0)', graph,
        outputFormat: 'coral', intent: 'generate', retries: 0, driftDetected: false,
      });
    const onDslGenerated = vi.fn().mockReturnValue(true);
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    const context = {
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, measured: { width: 80, height: 40 }, data: {} }],
      edges: [], dsl: 'flowchart TD\nA[A]', dslType: 'mermaid', diagnostics: [], graph, revision: 3,
    };

    await act(async () => { await result.current.submit('move A right', context); });
    expect(onDslGenerated).not.toHaveBeenCalled();
    const actionId = result.current.chatEntries.find((entry) => entry.action)?.id;
    expect(actionId).toBeDefined();

    await act(async () => { await result.current.confirmAction(actionId!); });
    await act(async () => { await result.current.confirmAction(actionId!); });
    expect(onDslGenerated).toHaveBeenCalledTimes(1);
    expect(onDslGenerated).toHaveBeenCalledWith(
      expect.any(String), 'coral', graph, 3, expect.any(AbortSignal), 'generation',
    );
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it('keeps the document unchanged when confirmed Mermaid conversion later fails', async () => {
    const graph = {
      version: '3.0.0' as const, id: 'diagram',
      nodes: [
        { id: 'a', type: 'service', position: { x: 0, y: 0 } },
        { id: 'b', type: 'service', position: { x: 100, y: 0 } },
      ], edges: [],
    };
    mockGenerate
      .mockResolvedValueOnce({
        success: false, error: 'Convert first',
        action: { kind: 'convert-to-coral', prompt: 'move b below a; rename b' },
        intent: 'generate', retries: 0, driftDetected: false,
      })
      .mockResolvedValueOnce({
        success: false, error: 'API error: unavailable',
        diagnostics: [{ code: 'provider', message: 'unavailable', attempt: 0, format: 'coral' }],
        retries: 0, driftDetected: false,
      });
    const onDslGenerated = vi.fn();
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    const context = {
      nodes: [
        { id: 'a', position: { x: 0, y: 0 }, measured: { width: 80, height: 40 }, data: {} },
        { id: 'b', position: { x: 100, y: 0 }, measured: { width: 80, height: 40 }, data: {} },
      ],
      edges: [], dsl: 'flowchart LR\na[A] --> b[B]', dslType: 'mermaid', diagnostics: [], graph, revision: 4,
    };
    await act(async () => { await result.current.submit('move b below a; rename b', context); });
    const actionId = result.current.chatEntries.find((entry) => entry.action)?.id;
    act(() => result.current.setApiKey('test-key'));
    await act(async () => { await result.current.confirmAction(actionId!); });

    expect(onDslGenerated).not.toHaveBeenCalled();
    expect(result.current.chatEntries.at(-1)?.text).toContain('unavailable');
  });

  it('aborts a confirmed conversion when the hook unmounts', async () => {
    const graph = {
      version: '3.0.0' as const, id: 'diagram',
      nodes: [{ id: 'a', type: 'service', label: 'A', position: { x: 0, y: 0 } }], edges: [],
    };
    let finish!: (value: any) => void;
    mockGenerate
      .mockResolvedValueOnce({
        success: false, error: 'Convert first',
        action: { kind: 'convert-to-coral', prompt: 'move A right' },
        retries: 0, driftDetected: false,
      })
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { result, unmount } = renderHook(() => useLlmChat(defaultOptions));
    const context = {
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, measured: { width: 80, height: 40 }, data: {} }],
      edges: [], dsl: 'flowchart TD\nA[A]', dslType: 'mermaid', diagnostics: [], graph,
    };
    await act(async () => { await result.current.submit('move A right', context); });
    const actionId = result.current.chatEntries.find((entry) => entry.action)?.id;
    let pending!: Promise<void>;
    act(() => { pending = result.current.confirmAction(actionId!); });
    const signal = mockGenerate.mock.calls[1][0].signal as AbortSignal;

    unmount();
    expect(signal.aborted).toBe(true);
    finish({ success: false, error: 'cancelled', retries: 0, driftDetected: false });
    await pending;
  });

  it('marks a running confirmed conversion cancelled when the user aborts it', async () => {
    const graph = {
      version: '3.0.0' as const, id: 'diagram',
      nodes: [{ id: 'a', type: 'service', label: 'A', position: { x: 0, y: 0 } }], edges: [],
    };
    let finish!: (value: any) => void;
    mockGenerate
      .mockResolvedValueOnce({
        success: false, error: 'Convert first',
        action: { kind: 'convert-to-coral', prompt: 'move A right' },
        retries: 0, driftDetected: false,
      })
      .mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const onDslGenerated = vi.fn();
    const { result } = renderHook(() => useLlmChat({ ...defaultOptions, onDslGenerated }));
    const context = {
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, measured: { width: 80, height: 40 }, data: {} }],
      edges: [], dsl: 'flowchart TD\nA[A]', dslType: 'mermaid', diagnostics: [], graph,
    };
    await act(async () => { await result.current.submit('move A right', context); });
    const actionId = result.current.chatEntries.find((entry) => entry.action)?.id;
    let pending!: Promise<void>;
    act(() => { pending = result.current.confirmAction(actionId!); });
    expect(result.current.chatEntries.find((entry) => entry.id === actionId)?.action?.status)
      .toBe('running');

    act(() => result.current.abortActive('user'));

    expect(result.current.chatEntries.find((entry) => entry.id === actionId)?.action?.status)
      .toBe('cancelled');
    expect(result.current.chatEntries.at(-1)).toMatchObject({
      diagnosticCode: 'provider.aborted',
      text: 'Generation cancelled. No changes were applied.',
    });
    finish({ success: true, dsl: 'service "Late"', graph, outputFormat: 'coral', retries: 0, driftDetected: false });
    await act(async () => { await pending; });
    expect(onDslGenerated).not.toHaveBeenCalled();
  });

  it('publishes no confirmed-conversion success when cancelled during its awaited commit', async () => {
    const graph = {
      version: '3.0.0' as const, id: 'diagram',
      nodes: [{ id: 'a', type: 'service', label: 'A', position: { x: 0, y: 0 } }], edges: [],
    };
    mockGenerate
      .mockResolvedValueOnce({
        success: false, error: 'Convert first',
        action: { kind: 'convert-to-coral', prompt: 'move A right' },
        retries: 0, driftDetected: false,
      })
      .mockResolvedValueOnce({
        success: true, dsl: 'service "A" as a @ (100, 0)', graph,
        outputFormat: 'coral', retries: 0, driftDetected: false,
      });
    let finishCommit!: (value: boolean) => void;
    let commitSignal: AbortSignal | undefined;
    const onDslGenerated = vi.fn((
      _dsl: string, _format: string, _graph: unknown, _revision: unknown, signal?: AbortSignal,
    ) => {
      commitSignal = signal;
      return new Promise<boolean>((resolve) => { finishCommit = resolve; });
    });
    const onConversationMessage = vi.fn();
    const { result } = renderHook(() => useLlmChat({
      ...defaultOptions, onDslGenerated, onConversationMessage,
    }));
    const context = {
      nodes: [{ id: 'a', position: { x: 0, y: 0 }, measured: { width: 80, height: 40 }, data: {} }],
      edges: [], dsl: 'flowchart TD\nA[A]', dslType: 'mermaid', diagnostics: [], graph,
    };
    await act(async () => { await result.current.submit('move A right', context); });
    const actionId = result.current.chatEntries.find((entry) => entry.action)?.id;
    let pending!: Promise<void>;
    act(() => { pending = result.current.confirmAction(actionId!); });
    await waitFor(() => expect(onDslGenerated).toHaveBeenCalledOnce());

    act(() => result.current.abortActive('user'));

    expect(commitSignal?.aborted).toBe(true);
    await act(async () => { finishCommit(true); await pending; });
    expect(result.current.chatEntries.find((entry) => entry.id === actionId)?.action?.status)
      .toBe('cancelled');
    expect(onConversationMessage).toHaveBeenCalledTimes(1);
    expect(onConversationMessage).toHaveBeenCalledWith({ role: 'user', content: 'move A right' });
  });

  // Code review C52-4: a queued once-value left by one test must not leak
  // into the next. These two tests run in order; the first leaves values queued.
  describe('mock isolation', () => {
    it('leaves queued once-values unconsumed', () => {
      vi.mocked(classifyIntent).mockReturnValueOnce('fix');
      mockGenerate.mockResolvedValueOnce({ success: false, error: 'leaked', retries: 0, driftDetected: false });
    });
    it('does not see once-values queued by an earlier test', async () => {
      expect(classifyIntent('anything', { nodes: [], edges: [] } as never)).toBe('generate');
      await expect(mockGenerate()).resolves.toMatchObject({ success: true, dsl: 'flowchart TD\nA[A]' });
    });
  });
});
