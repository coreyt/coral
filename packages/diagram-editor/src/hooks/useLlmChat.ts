/**
 * useLlmChat Hook
 *
 * Single source of truth for LLM chat interactions. Manages:
 * - Multi-turn conversation history (sliding-window token budget)
 * - UI chat entries
 * - API key persistence
 * - Intent classification and generation
 */

import { AI_FEATURES_AVAILABLE } from '../releaseFeatures029.js';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { generate } from '../llm/generate';
import { getProviders } from '../llm/providers';
import { classifyIntent } from '../llm/classify';
import {
  createConversation,
  addMessage,
  getMessages,
  clearConversation,
} from '../llm/conversation';
import type { GenerateRequest, LLMIntent, LLMProviderId, OutputFormat } from '../llm/types';
import type { ChatEntry, ChatEntryKind, DiagnosticEntry } from '../BottomPanel';
import type { GraphIR } from '../printer';
import { printCoralDSLWithDiagnostics } from '../printer';
import { captureSpatialGeometry, recognizeSpatialRequest } from '../llm/spatial';
import {
  captureCredentialPersistenceSnapshot,
  getCredentialStorage,
  reconcileCredentialPersistence,
  transitionCredentialPersistence,
  CREDENTIAL_PERSISTENCE_ERROR,
  type CredentialPersistenceSnapshot,
} from '../llm/credentialPersistence';
import { DEFAULT_USER_PREFERENCES, type UserPreferences } from '@coral-viz/viz';

export interface UseLlmChatOptions {
  llmProvider: LLMProviderId;
  llmModel: string;
  llmSaveApiKey: boolean;
  llmSavedApiKey?: string;
  userPreferences?: UserPreferences;
  credentialPersistenceSnapshot?: CredentialPersistenceSnapshot;
  onCredentialPreferencesCommitted?: (preferences: UserPreferences) => void;
  llmMaxRetries: number;
  telemetry?: GenerateRequest['telemetry'];
  /** `false` means stale or aborted; a rejection carries any other reason. */
  onDslGenerated: (
    dsl: string,
    format: OutputFormat,
    graph?: GraphIR,
    expectedRevision?: number,
    signal?: AbortSignal,
    operationKind?: 'fix' | 'generation',
  ) => boolean | void | DslRejection | Promise<boolean | void | DslRejection>;
  onConversationMessage?: (message: { role: 'user' | 'assistant'; content: string }) => void;
}

/** A generated candidate that was not applied for a reason other than staleness. */
export interface DslRejection {
  applied: false;
  reason: 'source-errors' | 'layout-blocked';
  message: string;
}

type CommitOutcome = { committed: true } | { committed: false; rejection?: DslRejection };

const STALE_RESULT_TEXT = 'The diagram changed while generation was running. The stale result was not applied.';

function rejectionEntry(outcome: Extract<CommitOutcome, { committed: false }>) {
  return outcome.rejection
    ? { kind: 'error' as const, text: `The generated diagram was not applied: ${outcome.rejection.message}`,
      diagnosticCode: `ai.candidate.${outcome.rejection.reason}` }
    : { kind: 'error' as const, text: STALE_RESULT_TEXT, diagnosticCode: 'spatial.stale' };
}

export interface SubmitContext {
  nodes: Node[];
  edges: Edge[];
  dsl: string;
  dslType: string;
  diagnostics: DiagnosticEntry[];
  notation?: string;
  graph?: GraphIR;
  revision?: number;
}

type PendingAction =
  | {
      kind: 'convert-to-coral';
      prompt: string;
      context: SubmitContext;
      spatial: NonNullable<GenerateRequest['spatial']>;
    }
  | {
      kind: 'retry-candidate';
      prompt: string;
      context: SubmitContext;
    };

export function useLlmChat({
  llmProvider,
  llmModel,
  llmSaveApiKey,
  llmSavedApiKey = '',
  userPreferences,
  credentialPersistenceSnapshot,
  onCredentialPreferencesCommitted,
  llmMaxRetries,
  telemetry,
  onDslGenerated,
  onConversationMessage,
}: UseLlmChatOptions) {
  const [chatEntries, setChatEntries] = useState<ChatEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMutationPending, setIsMutationPending] = useState(false);
  const [bootSnapshot] = useState<CredentialPersistenceSnapshot>(() => {
    if (credentialPersistenceSnapshot) return credentialPersistenceSnapshot;
    const captured = captureCredentialPersistenceSnapshot();
    return {
      ...captured,
      initialPreferences: {
        ...(userPreferences ?? captured.initialPreferences ?? DEFAULT_USER_PREFERENCES),
        llmSaveApiKey,
        llmSavedApiKey: '',
      },
      legacyPreferenceKey: llmSavedApiKey || captured.legacyPreferenceKey,
    };
  });
  const [apiKey, setApiKeyState] = useState('');
  const [apiKeyPersistenceError, setApiKeyPersistenceError] = useState<string>();
  const preferencesRef = useRef<UserPreferences>(bootSnapshot.initialPreferences);
  const apiKeyRef = useRef('');
  const persistenceEnabledRef = useRef(bootSnapshot.initialPreferences.llmSaveApiKey);
  if (userPreferences) {
    preferencesRef.current = { ...userPreferences, llmSavedApiKey: '' };
  }

  const chatIdCounter = useRef(0);
  const conversationRef = useRef(createConversation());
  const pendingActionsRef = useRef(new Map<number, PendingAction>());
  const operationIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const activeActionIdRef = useRef<number | null>(null);

  const cancelRunningAction = useCallback(() => {
    const entryId = activeActionIdRef.current;
    if (entryId === null) return;
    activeActionIdRef.current = null;
    setChatEntries((entries) => entries.map((entry) => entry.id === entryId
      && entry.action?.status === 'running'
      ? { ...entry, action: { ...entry.action, status: 'cancelled' as const } }
      : entry));
  }, []);

  const beginOperation = useCallback((mutating = true) => {
    cancelRunningAction();
    controllerRef.current?.abort();
    const controller = new AbortController();
    const id = ++operationIdRef.current;
    controllerRef.current = controller;
    setIsGenerating(true);
    setIsMutationPending(mutating);
    return { id, controller };
  }, [cancelRunningAction]);

  const abortActive = useCallback((reason: 'stale' | 'user' = 'stale') => {
    const hadActiveOperation = controllerRef.current !== null;
    // Invalidate ownership synchronously before any cancellation UI work or
    // abort listener can settle an awaited provider/commit promise.
    operationIdRef.current += 1;
    cancelRunningAction();
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsGenerating(false);
    setIsMutationPending(false);
    if (hadActiveOperation) {
      const id = ++chatIdCounter.current;
      setChatEntries((entries) => [...entries, {
        id, kind: 'error',
        text: reason === 'user'
          ? 'Generation cancelled. No changes were applied.'
          : STALE_RESULT_TEXT,
        diagnosticCode: reason === 'user' ? 'provider.aborted' : 'spatial.stale',
      }]);
    }
  }, [cancelRunningAction]);

  useEffect(() => () => {
    operationIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => {
    const storage = getCredentialStorage();
    const result = storage
      ? reconcileCredentialPersistence(storage, bootSnapshot)
      : { ok: false as const, error: CREDENTIAL_PERSISTENCE_ERROR };
    if (!result.ok) {
      setApiKeyPersistenceError(result.error);
      return;
    }
    preferencesRef.current = result.preferences;
    persistenceEnabledRef.current = result.preferences.llmSaveApiKey;
    apiKeyRef.current = result.key;
    setApiKeyState(result.key);
    setApiKeyPersistenceError(undefined);
    onCredentialPreferencesCommitted?.(result.preferences);
  }, [bootSnapshot, onCredentialPreferencesCommitted]);

  const providers = useMemo(
    () =>
      getProviders().map((p) => ({
        id: p.id,
        name: p.name,
        models: p.models.map((m) => ({ id: m.id, name: m.name })),
      })),
    [],
  );

  const turnCount = useMemo(() => {
    return conversationRef.current.messages.filter((m) => m.role === 'user').length;
  }, [chatEntries]); // re-derive when chat entries change (proxy for conversation changes)

  const setApiKey = useCallback(
    (key: string) => {
      apiKeyRef.current = key;
      setApiKeyState(key);
      if (persistenceEnabledRef.current) {
        const storage = getCredentialStorage();
        if (!storage) {
          setApiKeyPersistenceError(CREDENTIAL_PERSISTENCE_ERROR);
          return;
        }
        const result = transitionCredentialPersistence(
          storage, preferencesRef.current, key, true,
        );
        if (!result.ok) {
          setApiKeyPersistenceError(result.error);
          return;
        }
        preferencesRef.current = result.preferences;
        setApiKeyPersistenceError(undefined);
        onCredentialPreferencesCommitted?.(result.preferences);
      }
    },
    [onCredentialPreferencesCommitted],
  );

  const setApiKeyPersistence = useCallback((enabled: boolean) => {
    const storage = getCredentialStorage();
    if (!storage) {
      setApiKeyPersistenceError(CREDENTIAL_PERSISTENCE_ERROR);
      return false;
    }
    const result = transitionCredentialPersistence(
      storage, preferencesRef.current, apiKeyRef.current, enabled,
    );
    if (!result.ok) {
      setApiKeyPersistenceError(result.error);
      return false;
    }
    preferencesRef.current = result.preferences;
    persistenceEnabledRef.current = enabled;
    setApiKeyPersistenceError(undefined);
    onCredentialPreferencesCommitted?.(result.preferences);
    return true;
  }, [onCredentialPreferencesCommitted]);

  const addEntry = useCallback(
    (entry: {
      kind: ChatEntryKind;
      text: string;
      explanation?: string;
      diagnosticCode?: string;
      diagnostics?: ChatEntry['diagnostics'];
      action?: ChatEntry['action'];
    }) => {
      const id = ++chatIdCounter.current;
      setChatEntries((prev) => [...prev, { id, ...entry }]);
      return id;
    },
    [],
  );

  const reportTelemetry = useCallback<NonNullable<GenerateRequest['telemetry']>>((event) => {
    if (event.kind === 'delay') {
      addEntry({
        kind: 'info',
        text: `Provider request failed; retrying automatically (${event.attempt + 1} of ${llmMaxRetries}).`,
      });
    }
    telemetry?.(event);
  }, [addEntry, llmMaxRetries, telemetry]);

  const commitResult = useCallback(async (
    dsl: string,
    format: OutputFormat,
    graph: GraphIR | undefined,
    revision: number | undefined,
    signal: AbortSignal,
    operationKind: 'fix' | 'generation',
  ) => {
    const committed = await onDslGenerated(dsl, format, graph, revision, signal, operationKind);
    if (committed === false) return { committed: false } as CommitOutcome;
    if (typeof committed === 'object' && committed !== null && committed.applied === false) {
      return { committed: false, rejection: committed } as CommitOutcome;
    }
    return { committed: true } as CommitOutcome;
  }, [onDslGenerated]);

  const submit = useCallback(
    async (prompt: string, context: SubmitContext) => {
      if (!AI_FEATURES_AVAILABLE) return;
      // Single-flight (R-054 AC-1): the synchronous controller ref, not React
      // state, decides. A repeat start has no side effect at all.
      if (controllerRef.current) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        addEntry({ kind: 'user', text: prompt });
        addEntry({ kind: 'error', text: 'AI providers require a network connection.' });
        return;
      }
      const intent: LLMIntent = classifyIntent(
        prompt,
        context.nodes.length > 0,
        context.diagnostics.length > 0,
      );
      const spatialRecognition = context.graph ? recognizeSpatialRequest(prompt) : undefined;
      const spatialIntent = intent !== 'help' && intent !== 'fix';
      const canRunWithoutKey = spatialIntent && spatialRecognition
        && spatialRecognition.classification !== 'non-spatial'
        && (spatialRecognition.classification !== 'mixed' || context.dslType === 'mermaid');
      if (!apiKey && !canRunWithoutKey) {
        addEntry({ kind: 'user', text: prompt });
        addEntry({ kind: 'error', text: 'Configure an API key in Settings for this AI request.' });
        return;
      }
      let existingDsl: string | undefined;
      if (context.nodes.length > 0 || intent === 'fix') {
        existingDsl = context.dsl;
      }

      const diagnosticsText =
        context.diagnostics.length > 0
          ? context.diagnostics
              .map(
                (e) =>
                  [`${e.severity.toUpperCase()}${e.code ? ` [${e.code}]` : ''}: ${e.sourceLabel} → ${e.targetLabel}: ${e.message}`,
                    ...(e.related ?? []).map((location) => `Related line ${location.position.line}, column ${location.position.column + 1}: ${location.message}`),
                    ...(e.hint ? [`Hint: ${e.hint}`] : [])].join('\n'),
              )
              .join('\n')
          : undefined;

      // Add user message to UI
      addEntry({ kind: 'user', text: prompt });

      // Add user message to conversation history
      conversationRef.current = addMessage(conversationRef.current, {
        role: 'user',
        content: prompt,
      });
      onConversationMessage?.({ role: 'user', content: prompt });

      const operation = beginOperation(intent !== 'help');

      try {
        const spatial = context.graph && spatialIntent
          && spatialRecognition?.classification !== 'non-spatial'
          ? {
              original: structuredClone(context.graph),
              geometry: spatialRecognition?.classification === 'unsupported'
                ? [] : captureSpatialGeometry(context.nodes),
            }
          : undefined;
        const result = await generate({
          prompt,
          existingDsl,
          config: { provider: llmProvider, model: llmModel, apiKey },
          intent,
          diagnostics: diagnosticsText,
          history: getMessages(conversationRef.current),
          notationId: context.notation,
          outputFormat: context.dslType === 'mermaid' ? 'mermaid' : 'coral',
          maxRetries: llmMaxRetries,
          signal: operation.controller.signal,
          telemetry: reportTelemetry,
          ...(spatial ? { spatial } : {}),
          // Retained for released R-025 prompt compatibility. Deterministic
          // spatial decisions use the complete canonical snapshot above.
          layout: {
            nodes: context.nodes.map((n) => ({
              id: n.id,
              label: typeof n.data?.label === 'string' ? n.data.label : undefined,
              x: n.position?.x ?? 0,
              y: n.position?.y ?? 0,
              pinned: n.data?.pinned === true,
            })),
            edges: context.edges.map((edge) => ({
              id: edge.id,
              source: edge.source,
              target: edge.target,
              routingPoints: Array.isArray(edge.data?.routingPoints)
                ? edge.data.routingPoints as Array<{ x: number; y: number }>
                : undefined,
            })),
          },
        });

        if (operationIdRef.current !== operation.id) return;

        if (result.success) {
          if (result.intent === 'help') {
            const explanation = result.explanation || 'No explanation available.';
            addEntry({ kind: 'info', text: '', explanation, diagnostics: result.diagnostics });
            // Add assistant response to conversation history
            conversationRef.current = addMessage(conversationRef.current, {
              role: 'assistant',
              content: explanation,
            });
            onConversationMessage?.({ role: 'assistant', content: explanation });
          } else if (result.intent === 'fix') {
            const explanation = result.explanation || 'Fix applied.';
            const outcome: CommitOutcome = !result.dsl ? { committed: true } : await commitResult(
              result.dsl, result.outputFormat ?? 'coral', result.graph, context.revision,
              operation.controller.signal, 'fix',
            );
            if (operationIdRef.current !== operation.id) return;
            if (!outcome.committed) {
              addEntry(rejectionEntry(outcome));
              return;
            }
            addEntry({ kind: 'info', text: '', explanation, diagnostics: result.diagnostics });
            conversationRef.current = addMessage(conversationRef.current, {
              role: 'assistant',
              content: explanation + (result.dsl ? '\n\n' + result.dsl : ''),
            });
            onConversationMessage?.({
              role: 'assistant',
              content: explanation + (result.dsl ? '\n\n' + result.dsl : ''),
            });
          } else if (result.dsl) {
            const printWarnings = result.diagnostics?.filter((item) => item.severity === 'warning' || item.severity === 'info') ?? [];
            const printMsg = printWarnings.length
              ? `\n\nProjection warnings:\n${printWarnings.map((item) => `- ${item.message}`).join('\n')}`
              : '';
            const outcome = await commitResult(
              result.dsl, result.outputFormat ?? 'coral', result.graph, context.revision,
              operation.controller.signal, 'generation',
            );
            if (operationIdRef.current !== operation.id) return;
            if (!outcome.committed) {
              addEntry(rejectionEntry(outcome));
              return;
            }
            addEntry({ kind: 'assistant', text: `I updated the diagram.${printMsg}`, diagnostics: result.diagnostics });
            conversationRef.current = addMessage(conversationRef.current, {
              role: 'assistant',
              content: result.dsl,
            });
            onConversationMessage?.({ role: 'assistant', content: result.dsl });
          }
        } else if (result.action?.kind === 'convert-to-coral') {
          const id = addEntry({
            kind: 'info',
            text: result.error || 'This spatial edit requires Coral DSL. Convert and continue?',
            diagnosticCode: result.diagnostics?.[0]?.code,
            diagnostics: result.diagnostics,
            action: { kind: 'convert-to-coral', status: 'pending' },
          });
          if (spatial) pendingActionsRef.current.set(id, {
            kind: 'convert-to-coral', prompt: result.action.prompt, context, spatial,
          });
        } else if (result.action?.kind === 'retry-candidate') {
          const id = addEntry({
            kind: 'info',
            text: result.error || 'The candidate was rejected. No changes were applied.',
            diagnosticCode: result.diagnostics?.[0]?.code,
            diagnostics: result.diagnostics,
            action: { kind: 'retry-candidate', status: 'pending' },
          });
          pendingActionsRef.current.set(id, {
            kind: 'retry-candidate', prompt: result.action.prompt, context,
          });
        } else {
          addEntry({
            kind: 'error',
            text: result.error || 'Generation failed',
            diagnosticCode: result.diagnostics?.[0]?.code,
            diagnostics: result.diagnostics,
          });
        }
      } catch (err) {
        if (operationIdRef.current !== operation.id) return;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        addEntry({
          kind: 'error',
          text: msg,
          ...(msg.startsWith('Spatial geometry for')
            ? { diagnosticCode: 'spatial.context.invalid' }
            : {}),
        });
      } finally {
        if (operationIdRef.current === operation.id) {
          controllerRef.current = null;
          setIsGenerating(false);
          setIsMutationPending(false);
        }
      }
    },
    [llmProvider, llmModel, llmMaxRetries, reportTelemetry, apiKey, addEntry, beginOperation,
      commitResult, onConversationMessage],
  );

  const cancelAction = useCallback((entryId: number) => {
    if (!pendingActionsRef.current.delete(entryId)) return;
    setChatEntries((entries) => entries.map((entry) => entry.id === entryId && entry.action
      ? { ...entry, action: { ...entry.action, status: 'cancelled' as const } }
      : entry));
  }, []);

  const confirmAction = useCallback(async (entryId: number, currentContext?: SubmitContext) => {
    if (!AI_FEATURES_AVAILABLE) return;
    // A busy confirmation leaves its pending action untouched (R-054 AC-1).
    if (controllerRef.current) return;
    const pending = pendingActionsRef.current.get(entryId);
    if (!pending) return;
    pendingActionsRef.current.delete(entryId);
    if (pending.kind === 'retry-candidate') {
      // Clicking Retry is the explicit authorization boundary. Consume this
      // one-shot action before starting the independent, cancellable request.
      setChatEntries((entries) => entries.map((entry) => entry.id === entryId && entry.action
        ? { ...entry, action: { ...entry.action, status: 'complete' as const } }
        : entry));
      await submit(pending.prompt, currentContext ?? pending.context);
      return;
    }
    setChatEntries((entries) => entries.map((entry) => entry.id === entryId && entry.action
      ? { ...entry, action: { ...entry.action, status: 'running' as const } }
      : entry));
    const operation = beginOperation();
    activeActionIdRef.current = entryId;
    try {
      const { context, prompt, spatial } = pending;
      const recognition = recognizeSpatialRequest(prompt);
      if (!apiKey && recognition.classification === 'mixed') {
        throw new Error('Configure an API key in Settings to continue this mixed request.');
      }
      const converted = printCoralDSLWithDiagnostics(spatial.original);
      const result = await generate({
        prompt,
        existingDsl: converted.text,
        config: { provider: llmProvider, model: llmModel, apiKey },
        intent: classifyIntent(prompt, context.nodes.length > 0, context.diagnostics.length > 0),
        notationId: context.notation,
        outputFormat: 'coral',
        history: getMessages(conversationRef.current),
        spatial,
        maxRetries: llmMaxRetries,
        signal: operation.controller.signal,
        telemetry: reportTelemetry,
      });
      if (operationIdRef.current !== operation.id) return;
      if (!result.success || !result.dsl) throw new Error(result.error || 'Generation failed');
      const outcome = await commitResult(
        result.dsl, 'coral', result.graph, context.revision, operation.controller.signal, 'generation',
      );
      if (operationIdRef.current !== operation.id) return;
      const committed = outcome.committed;
      if (!outcome.committed) addEntry(rejectionEntry(outcome));
      setChatEntries((entries) => entries.map((entry) => entry.id === entryId && entry.action
        ? { ...entry, action: { ...entry.action, status: committed ? 'complete' as const : 'cancelled' as const } }
        : entry));
      if (committed) {
        conversationRef.current = addMessage(conversationRef.current, {
          role: 'assistant', content: result.dsl,
        });
        onConversationMessage?.({ role: 'assistant', content: result.dsl });
      }
    } catch (err) {
      if (operationIdRef.current !== operation.id) return;
      const message = err instanceof Error ? err.message : 'Conversion failed';
      addEntry({ kind: 'error', text: message });
      setChatEntries((entries) => entries.map((entry) => entry.id === entryId && entry.action
        ? { ...entry, action: { ...entry.action, status: 'cancelled' as const } }
        : entry));
    } finally {
      if (activeActionIdRef.current === entryId) activeActionIdRef.current = null;
      if (operationIdRef.current === operation.id) {
        controllerRef.current = null;
        setIsGenerating(false);
        setIsMutationPending(false);
      }
    }
  }, [apiKey, llmMaxRetries, llmModel, llmProvider, reportTelemetry, addEntry, beginOperation,
    commitResult, onConversationMessage, submit]);

  const askAboutDiagnostic = useCallback(
    (entry: DiagnosticEntry, context: SubmitContext) => {
      if (!AI_FEATURES_AVAILABLE) return;
      const question = `Why is the edge from ${entry.sourceLabel} to ${entry.targetLabel} showing: ${entry.message}?`;
      submit(question, context);
    },
    [submit],
  );

  const clearChat = useCallback(() => {
    abortActive();
    setChatEntries([]);
    pendingActionsRef.current.clear();
    conversationRef.current = clearConversation();
  }, [abortActive]);

  const restoreConversation = useCallback((messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    abortActive();
    pendingActionsRef.current.clear();
    conversationRef.current = messages.reduce(
      (state, message) => addMessage(state, message),
      createConversation(),
    );
    setChatEntries(messages.map((message) => ({
      id: ++chatIdCounter.current,
      kind: message.role === 'user' ? 'user' as const : 'assistant' as const,
      text: message.content,
    })));
  }, [abortActive]);

  return {
    chatEntries,
    isGenerating,
    isMutationPending,
    apiKey,
    apiKeyPersistenceError,
    setApiKeyPersistence,
    hasApiKey: apiKey.length > 0,
    providers,
    turnCount,
    setApiKey,
    addEntry,
    submit,
    confirmAction,
    cancelAction,
    askAboutDiagnostic,
    clearChat,
    restoreConversation,
    abortActive,
  };
}
