import { EXPECTED_RELEASE_VERSION } from '../src/guidanceContent';
import { act, renderHook, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findGraphNotationValueRange, planFileOpen, prepareDocumentReplacement,
  symbolProvidedPorts, useEditorController } from '../src/useEditorController';
import { cloneBundledExample } from './fixtures/graphIrInterchangeExamples';
import { createBlankDocument } from '../src/blankDocument';
import { legacyStartupSource } from './fixtures/legacyStartupSource';
import { bundledSourceExamples028, exampleCatalog } from '../src/exampleSources028';
import { serialize, type CoralNode } from '@coral-viz/viz';
import { layoutSequence, parseInstalledDocument028, projectInstalledSourceToSuccessor028,
  renderSvg, shapeRegistry, stencilFit028, successorCoreValidationInput029, symbolRegistry } from '@coral-viz/render';
import { parseCoralDSL } from '../src/parsers';
import { validateIR } from '@graph-ir/core';
import { HEADER_MANIFEST_028, parseMermaid } from '@coral-viz/language';
import type { GraphIR } from '../src/printer';
import { createTranscriptArchive } from '../src/transcriptArchive';

// Historical interaction tests explicitly start from the former Mermaid
// canvas fixture. Production startup is covered by startupSource and browser
// acceptance tests; this fixture is not an editor default or compatibility mode.
vi.mock('../src/startupSource', async () => ({
  startupSource: (await import('./fixtures/legacyStartupSource')).legacyStartupSource,
}));

describe('portable profile port projection', () => {
  it('does not borrow base-symbol ports for an unknown explicit variant', () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    const graph: GraphIR = { version: '3.0.0', id: 'variant-ports',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service', variant: 'missing' }], edges: [] };
    expect(symbolProvidedPorts(document)(graph.nodes[0]!, graph)).toEqual([]);
    const known: GraphIR = { ...graph, nodes: [{ ...graph.nodes[0]!, variant: 'web' }] };
    expect(symbolProvidedPorts(document)(known.nodes[0]!, known)?.map((port) => port.id))
      .toEqual(['in', 'out', 'data']);
  });

  it('does not borrow document-setting ports for an unavailable saved profile', () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    const graph: GraphIR = { version: '3.0.0', id: 'unknown-profile',
      metadata: { notation: 'not-installed' },
      nodes: [{ id: 'api', type: 'service' }], edges: [] };
    expect(symbolProvidedPorts(document)(graph.nodes[0]!, graph)).toEqual([]);
  });

  it('does not project ports under metadata that contradicts a portable UML profile', () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    const graph: GraphIR = { version: '3.0.0', id: 'contradictory-profile',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service' }], edges: [] };
    expect(symbolProvidedPorts(document)(graph.nodes[0]!, graph)).toEqual([]);
  });

  it('uses a profile-only UML class catalog before the document setting', () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    const graph: GraphIR = { version: '3.0.0', id: 'profile-only',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
      nodes: [{ id: 'Order', type: 'class' }], edges: [] };
    expect(symbolProvidedPorts(document)(graph.nodes[0]!, graph)?.map((port) => port.id))
      .toEqual(['north', 'south', 'east', 'west']);
  });

  it('opens a profile-only UML class document under its portable family, not stale settings', () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    document.content.graphIR = { version: '3.0.0', id: 'profile-only',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
      nodes: [{ id: 'Order', type: 'class', label: 'Order',
        classifier: { kind: 'class', name: 'Order', compartments: [{ id: 'name', kind: 'name' }] } }],
      edges: [] };
    const prepared = prepareDocumentReplacement(document);
    expect(prepared.notation).toBe('uml-class');
    expect(prepared.result.settings.notation).toBe('uml-class');
    expect(prepared.source).toContain('@diagram uml-class\n');
    expect(parseInstalledDocument028(prepared.source).graph?.profile)
      .toEqual({ id: 'uml', kind: 'class', version: '1.0.0' });
  });

  it('keeps a complex GraphIR interchange document authoritative and labels its source preview', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const document = cloneBundledExample('flowchart');
    act(() => result.current.header.onLoad(document));
    await waitFor(() => expect(result.current.editor.dsl).toMatch(/^@graph /));
    await waitFor(() => expect(result.current.editor.editorAnalysis.diagnostics)
      .toContainEqual(expect.objectContaining({
        code: 'coral.graphir.interchange.preview', severity: 'warning',
      })));
    expect(result.current.editor.isDslReadOnly).toBe(true);
    expect(result.current.editor.isDslReadOnlyReason).toMatch(/GraphIR interchange preview/);
    const preview = result.current.editor.dsl;
    act(() => result.current.editor.onDslChange('different process'));
    expect(result.current.editor.dsl).toBe(preview);
    expect(result.current.header.onSave().content).toMatchObject({ format: 'graph-ir',
      graphIR: { id: document.content.graphIR!.id } });
    const firstNode = result.current.canvas.nodes[0]!;
    act(() => result.current.canvas.onNodesChange([{
      id: firstNode.id, type: 'position', position: { x: 321, y: 123 },
    }]));
    await waitFor(() => expect(result.current.editor.dsl).toContain('@ (321, 123)'));
    expect(result.current.editor.isDslReadOnly).toBe(true);
    expect(result.current.header.onSave().content).toMatchObject({ format: 'graph-ir',
      graphIR: { id: document.content.graphIR!.id } });
  });

  it('keeps a verified 0.2.8 projection of GraphIR interchange read-only until conversion', async () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    document.content.graphIR = { version: '3.0.0', id: 'interchange',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service', label: 'API' }], edges: [] };
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad(document));
    await waitFor(() => expect(result.current.editor.dsl).toMatch(/^@diagram architecture\n/));
    expect(result.current.editor.isDslReadOnly).toBe(true);
    expect(result.current.commandPalette.commands.find((command) => command.id === 'export')?.label)
      .toBe('Export Graph-IR');
    expect(result.current.commandPalette.commands.find((command) => command.id === 'check-conformance')?.disabled)
      .toBe(true);
    expect(result.current.canvas.sourceConnectionsEnabled).toBe(false);
    act(() => result.current.canvas.onNodesChange([{
      id: 'api', type: 'position', position: { x: 40, y: 20 },
    }]));
    await waitFor(() => expect(result.current.editor.dsl).toContain('@ (40, 20)'));
    expect(result.current.editor.isDslReadOnly).toBe(true);
    expect(result.current.header.onSave().content).toMatchObject({ format: 'graph-ir',
      graphIR: { id: 'interchange', metadata: { notation: 'architecture' },
        nodes: [{ id: 'api', type: 'service', label: 'API', position: { x: 40, y: 20 } }], edges: [] } });
  });

  it('keeps a GraphIR interchange document graph-owned after a notation change', async () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    document.content.graphIR = { version: '3.0.0', id: 'interchange-notation',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service', label: 'API' }], edges: [] };
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad(document));
    await waitFor(() => expect(result.current.editor.dsl).toContain('@diagram architecture'));
    act(() => result.current.inspector!.onDocumentSettingsChange({
      ...result.current.inspector!.documentSettings, notation: 'flowchart',
    }));
    await waitFor(() => expect(result.current.canvas.notation).toBe('flowchart'));
    expect(result.current.editor.isDslReadOnly).toBe(true);
    expect(result.current.header.onSave().content).toMatchObject({
      format: 'graph-ir', graphIR: { id: 'interchange-notation', metadata: { notation: 'flowchart' } },
    });
  });

  it('recovers a changed GraphIR interchange graph without promoting its text preview', async () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    document.content.graphIR = { version: '3.0.0', id: 'interchange-recovery',
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'api', type: 'service', label: 'API' }], edges: [] };
    const first = renderHook(() => useEditorController());
    await waitFor(() => expect(first.result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => first.result.current.header.onLoad(document));
    await waitFor(() => expect(first.result.current.canvas.nodes.map((node) => node.id)).toEqual(['api']));
    act(() => first.result.current.canvas.onNodesChange([{
      id: 'api', type: 'position', position: { x: 40, y: 20 },
    }]));
    await waitFor(() => expect(first.result.current.editor.dsl).toContain('@ (40, 20)'));
    await waitFor(() => expect(window.localStorage.getItem('coral-diagram-recovery'))
      .toContain('interchange-recovery'));
    first.unmount();

    const second = renderHook(() => useEditorController());
    await waitFor(() => expect(second.result.current.recovery.hasData).toBe(true));
    act(() => second.result.current.recovery.onRecover());
    await waitFor(() => expect(second.result.current.canvas.nodes.map((node) => node.id)).toEqual(['api']));
    expect(second.result.current.editor.dsl).toContain('@ (40, 20)');
    expect(second.result.current.editor.isDslReadOnly).toBe(true);
    expect(second.result.current.header.onSave().content).toMatchObject({
      format: 'graph-ir', graphIR: { id: 'interchange-recovery',
        nodes: [{ id: 'api', position: { x: 40, y: 20 } }] },
    });
  });

  it('opens a simple profile-only UML sequence without replacing its messages', () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'load = client -#> server as "load()"\nreply = server -.-> client as "result"\n';
    const parsed = parseInstalledDocument028(source).graph!;
    document.content.graphIR = { ...parsed, id: 'imported-sequence', metadata: undefined };
    const prepared = prepareDocumentReplacement(document);
    expect(prepared.notation).toBe('uml-sequence');
    expect(prepared.source).toContain('@diagram uml-sequence\n');
    expect(parseInstalledDocument028(prepared.source).graph?.interaction)
      .toEqual(parsed.interaction);
  });

  it('opens a UML sequence with matching metadata and portable profile as 0.2.8 source', () => {
    const document = createBlankDocument();
    document.settings.notation = 'architecture';
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'load = client -#> server as "load()"\nreply = server -.-> client as "result"\n';
    const graph = parseInstalledDocument028(source).graph!;
    document.content.graphIR = { ...graph, id: 'sequence-with-metadata' };
    const prepared = prepareDocumentReplacement(document);
    expect(prepared.source).toContain('@diagram uml-sequence\n');
    expect(parseInstalledDocument028(prepared.source).graph?.interaction)
      .toEqual(graph.interaction);
  });

  it('refuses a graph whose notation contradicts its portable UML profile', () => {
    const document = createBlankDocument();
    document.content.graphIR = { version: '3.0.0', id: 'contradictory',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
      metadata: { notation: 'architecture' },
      nodes: [{ id: 'Order', type: 'class', label: 'Order',
        classifier: { kind: 'class', name: 'Order', compartments: [{ id: 'name', kind: 'name' }] } }],
      edges: [] };
    expect(() => prepareDocumentReplacement(document)).toThrow(/contradicts its portable uml-class profile/i);
  });
});

const transcriptStore = vi.hoisted(() => {
  const records = new Map<string, any>();
  const store = {
    get: vi.fn(async (id: string) => records.get(id)),
    put: vi.fn(async (archive: any) => { records.set(archive.archiveId, archive); }),
    delete: vi.fn(async (id: string) => { records.delete(id); }),
    clear: vi.fn(async () => { records.clear(); }),
    list: vi.fn(async () => [...records.values()]),
  };
  return {
    records,
    store,
    reset() {
      records.clear();
      for (const method of Object.values(store)) method.mockClear();
    },
  };
});

vi.mock('../src/transcriptArchive', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/transcriptArchive')>(),
  createIndexedDbTranscriptStore: () => transcriptStore.store,
}));

const llmChatBridge = vi.hoisted(() => ({ current: null as any, mutationPending: false }));

vi.mock('../src/hooks/useLlmChat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/hooks/useLlmChat')>();
  return {
    ...actual,
    useLlmChat: (options: any) => {
      llmChatBridge.current = options;
      return { ...actual.useLlmChat(options), isMutationPending: llmChatBridge.mutationPending };
    },
  };
});

const portSafetyBridge = vi.hoisted(() => ({ unreportable: false }));
const sourceReaderBridge = vi.hoisted(() => ({ throwOnDraft: false }));

vi.mock('@coral-viz/render', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@coral-viz/render')>();
  return {
    ...actual,
    parseInstalledDocument028: (...args: Parameters<typeof actual.parseInstalledDocument028>) => {
      if (sourceReaderBridge.throwOnDraft && args[0].includes('draft service as "Draft only"')) {
        throw new Error('source reader crashed');
      }
      return actual.parseInstalledDocument028(...args);
    },
  };
});

vi.mock('../src/portSafety', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/portSafety')>();
  return {
    ...actual,
    portSafetyDiagnostics: (...args: Parameters<typeof actual.portSafetyDiagnostics>) => {
      if (portSafetyBridge.unreportable && args[0].length > 0) {
        throw Object.defineProperty(new Error('port check failed'), 'name', {
          get() { throw new Error('failure detail unavailable'); },
        });
      }
      return actual.portSafetyDiagnostics(...args);
    },
  };
});

const layoutHistoryBridge = vi.hoisted(() => ({ omitDiscardRedo: false }));

vi.mock('@coral-viz/viz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@coral-viz/viz')>();
  return {
    ...actual,
    useLayoutHistory: (...args: Parameters<typeof actual.useLayoutHistory>) => {
      const value = actual.useLayoutHistory(...args);
      if (!layoutHistoryBridge.omitDiscardRedo) return value;
      const { discardRedo: _discardRedo, ...withoutOptionalDiscard } = value;
      return withoutOptionalDiscard;
    },
  };
});

const mockLayoutChildren = vi.hoisted(() => {
  const place = (graph: any): any[] => {
    const children = graph.children ?? [];
    const strideX = Math.max(0, ...children.map((node: any) => Number(node.width) || 0)) + 80;
    const strideY = Math.max(0, ...children.map((node: any) => Number(node.height) || 0)) + 80;
    const padding = String(graph.layoutOptions?.['elk.padding'] ?? '');
    const inset = (side: string) => Number(padding.match(new RegExp(`${side}=([\\d.]+)`))?.[1] ?? 0);
    return children.map((child: any, index: number) => ({
      ...child,
      x: child.x ?? inset('left') + index * strideX,
      y: child.y ?? inset('top') + index * strideY,
      ...(child.children ? { children: place(child) } : {}),
    }));
  };
  return place;
});
const layout = vi.hoisted(() => vi.fn(async (graph: any) => ({
  // Interaction tests need feasible candidates even after font-aware sizing.
  children: mockLayoutChildren(graph),
  edges: [],
})));

vi.mock('elkjs/lib/elk.bundled.js', () => ({
  default: class MockELK {
    layout(graph: unknown) { return layout(graph); }
  },
}));

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}


/** Save has side effects (saved state, transcript), so tests call it in act. */
function saveInAct(result: { current: ReturnType<typeof useEditorController> }) {
  let saved!: ReturnType<ReturnType<typeof useEditorController>['header']['onSave']>;
  act(() => { saved = result.current.header.onSave(); });
  return saved;
}

/**
 * End a Slice 94 test quiescent: pending print-backs, layouts, and Reflows
 * finish inside waitFor instead of updating state after the test (TR94-C2-F4).
 * Reflow availability is checked separately: a settled source can still be
 * intentionally unverified and therefore unavailable for manual Reflow.
 */
async function quiesce(result: { current: ReturnType<typeof useEditorController> }) {
  await waitFor(() => {
    expect(result.current.canvas.updateStatus).toBeNull();
    expect(result.current.canvas.isLoading).toBe(false);
    expect(result.current.canvas.isReflowing).toBe(false);
    expect(result.current.canvas.reflowDisabledReason).toBeUndefined();
  }, { timeout: 3000 });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('useEditorController live view model', () => {
  it('opens supported Mermaid classes with full meaning and keeps unsupported members as source', () => {
    const opened = planFileOpen({ name: 'orders.mmd', text: `classDiagram
class Order {
  +UUID id
  +save(): Void
}` });
    expect(opened.kind).toBe('open');
    if (opened.kind === 'open') {
      expect(opened.textOpen).toMatchObject({ format: 'mermaid',
        canonicalInput: { nodes: [expect.objectContaining({
          classifier: expect.objectContaining({ name: 'Order' }),
        })] },
      });
      expect(opened.prepared.source).toBe(`classDiagram
class Order {
  +UUID id
  +save(): Void
}`);
    }
    const unsupported = `classDiagram
class Order {
  note "outside the finite subset"
}`;
    const draft = planFileOpen({ name: 'unsupported.mmd', text: unsupported });
    expect(draft).toMatchObject({ kind: 'open', textOpen: {
      text: unsupported, format: 'mermaid',
      diagnostics: expect.arrayContaining([expect.objectContaining({
        code: 'mermaid.class.member.invalid',
      })]),
      blockWith: expect.any(String),
    } });
  });

  beforeEach(() => {
    window.localStorage.clear();
    layout.mockClear();
    transcriptStore.reset();
    llmChatBridge.current = null;
    llmChatBridge.mutationPending = false;
    portSafetyBridge.unreportable = false;
    sourceReaderBridge.throwOnDraft = false;
    layoutHistoryBridge.omitDiscardRedo = false;
    vi.unstubAllGlobals();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('keeps Mermaid UML source exact through member edits and renders its imported meaning', async () => {
    const mermaid = `classDiagram
class Order {
  +UUID id
  +save(): Void
}`;
    expect(planFileOpen({ name: 'orders.mmd', text: mermaid }).kind).toBe('open');

    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    let accepted = false;
    act(() => { accepted = result.current.header.onOpenFile({ name: 'orders.mmd', text: mermaid }); });
    expect(accepted).toBe(true);
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['Order']));
    const edited = mermaid.replace('+UUID id', '+String id');
    act(() => result.current.editor.onDslChange(edited));
    await quiesce(result);
    expect(result.current.editor.dsl).toBe(edited);

    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(mermaid));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));

    const saved = saveInAct(result);
    expect(saved.content).toEqual({ format: 'dsl', dslType: 'mermaid', text: edited });
    const imported = parseMermaid(edited);
    expect(imported.graph?.nodes[0].classifier?.compartments)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        kind: 'attributes', items: expect.arrayContaining([expect.objectContaining({ name: 'id', type: 'String' })]),
      })]));
    const svg = renderSvg(imported.graph!);
    expect(svg).toContain('data-coral-classifier-name');
    expect(svg).toContain('+ id: String');
  });

  it('owns transcript preference, association, deletion, and clear transitions', async () => {
    const now = 1_900_000_000_000;
    const live = createTranscriptArchive('live', now, 30);
    const expired = { ...createTranscriptArchive('expired', now - 10, 30), expiresAt: now - 1 };
    transcriptStore.records.set(live.archiveId, live);
    transcriptStore.records.set(expired.archiveId, expired);
    vi.spyOn(Date, 'now').mockReturnValue(now);
    vi.stubGlobal('indexedDB', {} as IDBFactory);

    const { result } = renderHook(() => useEditorController());
    act(() => result.current.preferences.onTranscriptPreferencesChange({
      enabled: true,
      retentionDays: 7,
    }));
    await waitFor(() => expect(transcriptStore.store.delete).toHaveBeenCalledWith('expired'));
    await waitFor(() => expect(result.current.preferences.transcriptArchives)
      .toEqual([expect.objectContaining({ id: 'live' })]));

    act(() => result.current.preferences.onAssociateTranscript('live'));
    await waitFor(() => expect(result.current.preferences.associatedTranscriptId).toBe('live'));
    act(() => result.current.preferences.onClearCurrentTranscript());
    expect(result.current.preferences.associatedTranscriptId).toBeNull();

    act(() => result.current.preferences.onAssociateTranscript('live'));
    await waitFor(() => expect(result.current.preferences.associatedTranscriptId).toBe('live'));
    act(() => result.current.preferences.onDeleteAssociatedTranscript());
    await waitFor(() => expect(transcriptStore.store.delete).toHaveBeenCalledWith('live'));

    act(() => result.current.preferences.onTranscriptPreferencesChange({
      enabled: false,
      retentionDays: 7,
    }));
    expect(result.current.preferences.associatedTranscriptId).toBeNull();

    transcriptStore.records.set('remaining', createTranscriptArchive('remaining', now, 30));
    act(() => result.current.preferences.onClearTranscripts());
    await waitFor(() => expect(transcriptStore.store.clear).toHaveBeenCalled());
    expect(result.current.preferences.transcriptArchives).toEqual([]);
  });

  it('archives conversation messages, rolls expired archives, and preserves order', async () => {
    let now = 1_900_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    vi.stubGlobal('indexedDB', {} as IDBFactory);
    const { result } = renderHook(() => useEditorController());
    act(() => result.current.preferences.onTranscriptPreferencesChange({ enabled: true, retentionDays: 1 }));

    act(() => llmChatBridge.current.onConversationMessage({ role: 'user', content: 'first' }));
    await waitFor(() => expect(result.current.preferences.associatedTranscriptId).not.toBeNull());
    const firstId = result.current.preferences.associatedTranscriptId!;
    act(() => llmChatBridge.current.onConversationMessage({ role: 'assistant', content: 'second' }));
    await waitFor(() => expect(transcriptStore.records.get(firstId)?.messages).toHaveLength(2));
    expect(transcriptStore.records.get(firstId)?.messages.map((message: any) => message.content))
      .toEqual(['first', 'second']);

    now += 2 * 86_400_000;
    act(() => llmChatBridge.current.onConversationMessage({ role: 'user', content: 'after expiry' }));
    await waitFor(() => expect(transcriptStore.store.delete).toHaveBeenCalledWith(firstId));
    await waitFor(() => expect(result.current.preferences.associatedTranscriptId).not.toBe(firstId));
    const nextId = result.current.preferences.associatedTranscriptId!;
    expect(transcriptStore.records.get(nextId)?.messages.map((message: any) => message.content))
      .toEqual(['after expiry']);
  });

  it('rolls back a transcript creation superseded by disabling persistence', async () => {
    vi.stubGlobal('indexedDB', {} as IDBFactory);
    let releaseWrite!: () => void;
    const blockedWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    transcriptStore.store.put.mockImplementationOnce(async (archive: any) => {
      await blockedWrite;
      transcriptStore.records.set(archive.archiveId, archive);
    });
    const { result } = renderHook(() => useEditorController());
    act(() => result.current.preferences.onTranscriptPreferencesChange({ enabled: true, retentionDays: 30 }));
    act(() => llmChatBridge.current.onConversationMessage({ role: 'user', content: 'superseded' }));
    await waitFor(() => expect(transcriptStore.store.put).toHaveBeenCalled());
    act(() => result.current.preferences.onTranscriptPreferencesChange({ enabled: false, retentionDays: 30 }));
    releaseWrite();
    await waitFor(() => expect(transcriptStore.store.delete).toHaveBeenCalled());
    expect(result.current.preferences.associatedTranscriptId).toBeNull();
  });

  it('announces transcript storage failures and honors cancellation guards', async () => {
    const confirm = vi.mocked(window.confirm).mockReturnValue(false);
    const { result } = renderHook(() => useEditorController());
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('preference storage denied');
    });
    act(() => result.current.preferences.onTranscriptPreferencesChange({ enabled: true, retentionDays: 30 }));
    expect(result.current.guidanceAnnouncement).toContain('preference storage denied');
    act(() => result.current.preferences.onAssociateTranscript(''));
    act(() => result.current.preferences.onClearTranscripts());
    act(() => result.current.preferences.onDeleteAssociatedTranscript());
    expect(confirm).toHaveBeenCalledOnce();
    storage.mockRestore();

    vi.stubGlobal('indexedDB', {} as IDBFactory);
    transcriptStore.store.get.mockResolvedValueOnce(undefined);
    act(() => result.current.preferences.onAssociateTranscript('missing'));
    await waitFor(() => expect(result.current.guidanceAnnouncement).toContain('no longer exists'));

    confirm.mockReturnValue(true);
    transcriptStore.store.clear.mockRejectedValueOnce('clear denied');
    act(() => result.current.preferences.onClearTranscripts());
    await waitFor(() => expect(result.current.guidanceAnnouncement).toContain('clear denied'));
  });

  it('handles unavailable, expired, and rejected transcript operations', async () => {
    window.localStorage.setItem('coral-transcript-preferences:0.2.5', JSON.stringify({
      enabled: true, retentionDays: 30,
    }));
    const confirm = vi.mocked(window.confirm).mockReturnValue(true);
    const first = renderHook(() => useEditorController());
    act(() => first.result.current.preferences.onTranscriptPreferencesChange({ enabled: true, retentionDays: 30 }));
    act(() => first.result.current.preferences.onAssociateTranscript('without-indexed-db'));
    act(() => first.result.current.preferences.onClearTranscripts());
    expect(confirm).toHaveBeenCalledOnce();

    vi.stubGlobal('indexedDB', {} as IDBFactory);
    transcriptStore.store.list.mockRejectedValueOnce(new Error('retention list denied'));
    act(() => first.result.current.preferences.onTranscriptPreferencesChange({ enabled: true, retentionDays: 7 }));
    await waitFor(() => expect(first.result.current.guidanceAnnouncement).toContain('retention list denied'));

    transcriptStore.store.put.mockRejectedValueOnce(new Error('archive write denied'));
    act(() => llmChatBridge.current.onConversationMessage({ role: 'user', content: 'cannot save' }));
    await waitFor(() => expect(first.result.current.guidanceAnnouncement).toContain('archive write denied'));

    const expired = { ...createTranscriptArchive('expired-choice', 1, 1), expiresAt: 2 };
    transcriptStore.records.set(expired.archiveId, expired);
    act(() => first.result.current.preferences.onAssociateTranscript(expired.archiveId));
    await waitFor(() => expect(first.result.current.guidanceAnnouncement).toContain('expired and was deleted'));

    const live = createTranscriptArchive('delete-fails', Date.now(), 30);
    transcriptStore.records.set(live.archiveId, live);
    act(() => first.result.current.preferences.onAssociateTranscript(live.archiveId));
    await waitFor(() => expect(first.result.current.preferences.associatedTranscriptId).toBe(live.archiveId));
    transcriptStore.store.delete.mockRejectedValueOnce(new Error('delete denied'));
    act(() => first.result.current.preferences.onDeleteAssociatedTranscript());
    await waitFor(() => expect(first.result.current.guidanceAnnouncement).toContain('delete denied'));
    first.unmount();

    transcriptStore.store.list.mockRejectedValueOnce('open denied');
    const second = renderHook(() => useEditorController());
    await waitFor(() => expect(second.result.current.guidanceAnnouncement).toContain('open denied'));
  });

  it('opens Welcome only after recovery settles and remembers a completed visit', async () => {
    const first = renderHook(() => useEditorController());
    await waitFor(() => expect(first.result.current.welcome.isOpen).toBe(true));
    act(() => first.result.current.welcome.onClose());
    expect(window.localStorage.getItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`)).toBe('true');
    first.unmount();
    window.localStorage.removeItem('coral-diagram-recovery');

    const returning = renderHook(() => useEditorController());
    await waitFor(() => expect(returning.result.current.canvas.nodes.length).toBeGreaterThan(0));
    expect(returning.result.current.welcome.isOpen).toBe(false);
  });

  it('keeps content history safe when the compatible layout hook omits discardRedo', async () => {
    layoutHistoryBridge.omitDiscardRedo = true;
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    expect(() => act(() => result.current.editor.onDslChange('service "Fallback history"'))).not.toThrow();
    expect(result.current.editor.dsl).toBe('service "Fallback history"');
  });

  it('offers a linked example explicitly without replacing current work and honors cancellation', async () => {
    window.history.replaceState(null, '', '/?example=order-service&catalog=1.0.0');
    window.localStorage.setItem(`coral-welcome-seen:${EXPECTED_RELEASE_VERSION}`, 'true');
    try {
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.welcome.isOpen).toBe(true));
      expect(result.current.welcome.linkedExample).toMatchObject({ id: 'order-service' });
      expect(result.current.editor.dsl).not.toBe(bundledSourceExamples028.find(e => e.id === 'order-service')!.source);
      act(() => result.current.editor.onDslChange('@diagram architecture\nkept service as "Keep me"\n'));
      await quiesce(result);
      vi.mocked(window.confirm).mockReturnValue(false);
      act(() => result.current.welcome.onExample('order-service'));
      expect(result.current.editor.dsl).toContain('Keep me');
      expect(result.current.welcome.isOpen).toBe(true);
      vi.mocked(window.confirm).mockReturnValue(true);
      act(() => result.current.welcome.onExample('order-service'));
      expect(result.current.editor.dsl).toBe(bundledSourceExamples028.find(e => e.id === 'order-service')!.source);
    } finally { window.history.replaceState(null, '', '/'); }
  });

  it('presents the linked example only once when pending recovery is restored', async () => {
    window.history.replaceState(null, '', '/?example=order-service&catalog=1.0.0');
    const recovered = '@diagram architecture\nrecovered service as "Recovered work"\n';
    window.localStorage.setItem('coral-diagram-recovery', JSON.stringify({
      timestamp: Date.now(), documentName: 'Recovered', dslType: 'coral',
      dsl: recovered, notation: 'architecture', nodePositions: {},
    }));
    try {
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.welcome.hasRecovery).toBe(true));
      await quiesce(result);
      act(() => result.current.welcome.onExample('order-service'));
      await waitFor(() => expect(result.current.welcome.isOpen).toBe(false));
      expect(result.current.recovery.hasData).toBe(true);
      await quiesce(result);
      act(() => result.current.recovery.onRecover());
      await waitFor(() => expect(result.current.editor.dsl).toBe(recovered));
      await quiesce(result);
      expect(result.current.welcome.isOpen).toBe(false);
      const edited = recovered + '// Keep editing after recovery\n';
      act(() => result.current.editor.onDslChange(edited));
      await quiesce(result);
      expect(result.current.editor.dsl).toBe(edited);
      expect(result.current.welcome.isOpen).toBe(false);
      act(() => result.current.commandPalette.commands.find(command => command.id === 'welcome')!.action());
      expect(result.current.welcome.isOpen).toBe(true);
      expect(result.current.welcome.linkedExample?.id).toBe('order-service');
    } finally { window.history.replaceState(null, '', '/'); }
  });

  it.each(['example=unknown&catalog=1.0.0', 'example=architecture', 'example=architecture&catalog=9.9.9', 'catalog=1.0.0', 'example=erd&catalog=1.0.0'])(
    'shows invalid linked selection without mutation: %s', async query => {
      window.history.replaceState(null, '', `/?${query}`);
      try {
        const { result } = renderHook(() => useEditorController());
        await waitFor(() => expect(result.current.welcome.isOpen).toBe(true));
        expect(result.current.welcome.linkedExample).toBeNull();
        expect(result.current.welcome.exampleLinkError).toContain('Your current work is unchanged');
        expect(result.current.editor.dsl).toBe(legacyStartupSource.text);
      } finally { window.history.replaceState(null, '', '/'); }
    });

  it('creates a source-first blank document without opening an authoring dialog', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.welcome.isOpen).toBe(true));
    act(() => result.current.welcome.onBlank(document.body));
    expect(result.current.welcome.isOpen).toBe(false);
    expect(result.current.authoring).toBeNull();
    expect(result.current.header.documentName).toBe('Untitled Diagram');
    expect(result.current.editor.dslType).toBe('coral');
    expect(result.current.editor.dsl).toBe('@diagram flowchart\n');
    expect(parseInstalledDocument028(result.current.editor.dsl).header.header?.conformanceLevel).toBe('typical');
    const saved = result.current.header.onSave();
    expect(saved.content.format).toBe('dsl');
    const savedSource = (saved.content as { text: string }).text;
    expect(savedSource).toContain('@diagram flowchart\n');
    expect(savedSource).toBe('@diagram flowchart\n');
    expect(savedSource).not.toContain('@conformanceLevel');
    expect(parseInstalledDocument028(savedSource).header.header?.conformanceLevel).toBe('typical');
  });

  it.each(bundledSourceExamples028)(
    'opens Welcome source example $id and preserves its edited source through history and reopen', async (example) => {
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.welcome.isOpen).toBe(true));
      await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
      const previousLayout = layout.getMockImplementation();
      if (example.id === 'bpmn') {
        const { default: ELK } = await vi.importActual<typeof import('elkjs/lib/elk.bundled.js')>(
          'elkjs/lib/elk.bundled.js');
        const realLayout = new ELK();
        layout.mockImplementation((graph: any) => realLayout.layout(graph));
      }
      try {
        act(() => result.current.welcome.onExample(example.id));
        await waitFor(() => expect(result.current.editor.dsl).toBe(example.source));
        expect(result.current.editor.dslType).toBe('coral');
        expect(result.current.header.documentName).toBe(example.name);
        expect(saveInAct(result).settings).toMatchObject({
          notation: example.notation, renderStyle028: 'hifi',
          layout: { direction: exampleCatalog.entries.find(entry => entry.id === example.id)!.preview.direction },
        });
        expect(result.current.editor.parseErrors.filter((item) => item.severity === 'error'), example.id).toEqual([]);
        await waitFor(() => expect(result.current.canvas.notation).toBe(example.notation));
        await waitFor(() => expect(result.current.canvas.isLoading, example.id).toBe(false), { timeout: 3000 });
        expect(result.current.editor.parseErrors.filter((item) => item.severity === 'error'), example.id).toEqual([]);
        await waitFor(() => expect(result.current.canvas.nodes.length, JSON.stringify({
          id: example.id,
          status: result.current.canvas.updateStatus,
          errors: result.current.editor.parseErrors,
          announcement: result.current.guidanceAnnouncement,
        })).toBeGreaterThan(0));
        const saved = saveInAct(result);
        expect(saved.content).toMatchObject({ format: 'dsl', dslType: 'coral', text: example.source });
        let reopened = false;
        act(() => { reopened = result.current.header.onOpenFile({
          name: `${example.name}.coral.json`, text: JSON.stringify(saved),
        }); });
        expect(reopened, example.id).toBe(true);
        await waitFor(() => expect(result.current.editor.dsl).toBe(example.source));
        expect(saveInAct(result).content).toMatchObject({ format: 'dsl', dslType: 'coral', text: example.source });

        const edited = `${example.source}// Edited Welcome copy\n`;
        act(() => result.current.editor.onDslChange(edited));
        await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
        await quiesce(result);
        act(() => result.current.canvas.onUndo());
        await waitFor(() => expect(result.current.editor.dsl).toBe(example.source));
        await quiesce(result);
        act(() => result.current.canvas.onRedo());
        await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
        await quiesce(result);
        const editedSave = saveInAct(result);
        expect(editedSave.content).toMatchObject({ format: 'dsl', dslType: 'coral', text: edited });
        act(() => { reopened = result.current.header.onOpenFile({
          name: `${example.name}-edited.coral.json`, text: JSON.stringify(editedSave),
        }); });
        expect(reopened, `${example.id}: ${result.current.guidanceAnnouncement}`).toBe(true);
        await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
        await quiesce(result);
        expect(saveInAct(result).content).toMatchObject({ format: 'dsl', dslType: 'coral', text: edited });
        const expectedGraph = projectInstalledSourceToSuccessor028(edited).graph;
        expect(expectedGraph, example.id).toBeDefined();
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:welcome-export');
        const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        try {
          act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
          expect(result.current.rasterExportError, example.id).toBeNull();
          expect(createObjectUrl, example.id).toHaveBeenCalledOnce();
          const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
          // Portable GraphIR carries documentCatalog, not the internal source
          // projection's userSymbols029 representation.
          const portable = successorCoreValidationInput029(expectedGraph!, { limits: true }).graph;
          expect(exported, example.id).toEqual(JSON.parse(JSON.stringify(portable)));
          if (expectedGraph!.userSymbols029?.length) {
            expect(exported.documentCatalog).toHaveLength(expectedGraph!.userSymbols029.length);
            expect(exported.documentCatalog[0].id).toBe(expectedGraph!.userSymbols029[0]!.symbolId);
            expect(exported.documentCatalog[0].artwork.profile).toEqual({ id: 'coral.svg-artwork', version: '1' });
            expect(exported).not.toHaveProperty('userSymbols029');
          }
        } finally {
          createObjectUrl.mockRestore();
          revokeObjectUrl.mockRestore();
          click.mockRestore();
        }
      } finally {
        if (example.id === 'bpmn' && previousLayout) layout.mockImplementation(previousLayout);
      }
    },
  );

  it('authors and reopens the first graph from a new blank Coral document', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.welcome.isOpen).toBe(true));
    act(() => result.current.welcome.onBlank(document.body));
    const source = '@diagram flowchart\nstart process\nfinish process\n' +
      'start -> finish as "Next"\n';
    act(() => result.current.editor.onDslChange(source));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
      .toEqual(['start', 'finish']));
    await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
    expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
    const saved = result.current.header.onSave();
    expect(saved.content.format).toBe('dsl');
    const savedSource = (saved.content as { text: string }).text;
    expect(savedSource).toContain('start process\nfinish process\n');
    act(() => result.current.header.onOpenFile({ name: 'first.coral.json', text: JSON.stringify(saved) }));
    await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
    await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['edge-1']));
  });

  it('protects dirty work through the normal file-open and Welcome paths', async () => {
    const confirm = vi.mocked(window.confirm).mockReturnValue(false);
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.editor.onDslChange('service "Unsaved"'));
    await waitFor(() => expect(window.localStorage.getItem('coral-diagram-recovery')).not.toBeNull(), { timeout: 2500 });
    const before = result.current.editor.dsl;
    let accepted = true;
    act(() => { accepted = result.current.header.onLoad(cloneBundledExample('code')) as unknown as boolean; });
    expect(accepted).toBe(false);
    expect(result.current.editor.dsl).toBe(before);
    act(() => { accepted = result.current.welcome.onOpenFile({ name: 'sketch.coral.json', text: JSON.stringify(cloneBundledExample('sketch')) }) as boolean; });
    expect(accepted).toBe(false);
    expect(result.current.editor.dsl).toBe(before);
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockReturnValue(true);
  });

  it('prepares every fallible projection before a replacement can commit', () => {
    const project = vi.fn(() => { throw new Error('projection failed'); });
    expect(() => prepareDocumentReplacement(createBlankDocument(), project))
      .toThrow('projection failed');
    expect(project).toHaveBeenCalledOnce();
  });

  it('prepares a real editable Coral definition instead of a load placeholder', () => {
    const prepared = prepareDocumentReplacement(cloneBundledExample('code'));
    expect(prepared.source).not.toContain('Loaded from file');
    expect(prepared.source).toContain('function');
  });

  it('uses the Coral header as notation authority on open and visibly falls back for an unknown header', () => {
    const disagreement = createBlankDocument();
    disagreement.content.graphIR = { ...parseInstalledDocument028('@diagram bpmn\nstart startEvent\nwork task\nstart -> work\n').graph!,
      id: 'header-authority' };
    disagreement.settings.notation = 'flowchart';
    const authoritative = prepareDocumentReplacement(disagreement);
    expect(authoritative.notation).toBe('bpmn');
    expect(authoritative.result.settings.notation).toBe('bpmn');

    const unknown = cloneBundledExample('flowchart');
    unknown.content.graphIR!.metadata = { notation: 'not-installed' };
    unknown.settings.notation = 'architecture';
    const fallback = prepareDocumentReplacement(unknown);
    expect(fallback.notation).toBe('architecture');
    expect(fallback.graph.metadata?.notation).toBe('not-installed');
    expect(fallback.sourceDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ line: 1, message: expect.stringContaining('[coral.source.notation.unknown]') }),
    ]));

    const noHeader = cloneBundledExample('flowchart');
    noHeader.content.graphIR!.metadata = undefined;
    noHeader.settings.notation = 'erd';
    expect(prepareDocumentReplacement(noHeader).notation).toBe('erd');

    const unavailableSetting = cloneBundledExample('flowchart');
    unavailableSetting.content.graphIR!.metadata = undefined;
    unavailableSetting.settings.notation = 'not-installed';
    expect(prepareDocumentReplacement(unavailableSetting).notation).toBe('flowchart');

    const empty = cloneBundledExample('flowchart');
    empty.content.graphIR!.metadata = { notation: '' };
    const emptyPrepared = prepareDocumentReplacement(empty);
    const emptyDiagnostic = emptyPrepared.sourceDiagnostics.find((item) =>
      item.code === 'coral.source.notation.unknown');
    expect(emptyDiagnostic?.range).toBeDefined();
    expect(emptyPrepared.source.slice(
      emptyDiagnostic!.range!.start.offset,
      emptyDiagnostic!.range!.end.offset,
    )).toBe('""');
  });

  it('positions notation diagnostics at the header value with indentation, escapes, and repeated values', () => {
    const value = 'not-"installed';
    const token = JSON.stringify(value);
    const source = `service ${token}\n   @graph {"name":${token},"metadata":{"note":${token},"notation":${token}}}`;
    const range = findGraphNotationValueRange(source);
    expect(range).toBeDefined();
    expect(source.slice(range!.start.offset, range!.end.offset)).toBe(token);
    expect(range!.start.line).toBe(2);
    expect(range!.start.column).toBe(source.split('\n')[1].lastIndexOf(token));
  });

  it('keeps source and editor notation changes synchronized and rejects unknown source notation atomically', async () => {
    const { result } = renderHook(() => useEditorController());
    const architectureSource = '@diagram architecture\napi service\nstore database\napi -> store\n';
    act(() => { result.current.header.onOpenFile({ name: 'architecture.coral', text: architectureSource }); });
    await waitFor(() => expect(result.current.canvas.notation).toBe('architecture'), { timeout: 2500 });
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['api', 'store']));

    const nodesBefore = result.current.canvas.nodes.map((node) => node.id);
    const unknownToken = 'not-installed';
    const unknownSource = architectureSource.replace('@diagram architecture', `@diagram ${unknownToken}`);
    act(() => result.current.editor.onDslChange(unknownSource));
    await waitFor(() => expect(result.current.editor.parseErrors.some((error) =>
      error.code === 'header.diagram.unsupported')).toBe(true), { timeout: 2500 });
    const unknownError = result.current.editor.parseErrors.find((error) =>
      error.code === 'header.diagram.unsupported')!;
    expect(unknownSource.slice(unknownError.range!.start.offset, unknownError.range!.end.offset)).toBe(unknownToken);
    expect(unknownError.range!.start.column).toBe(unknownSource.split('\n')[0].indexOf(unknownToken));
    expect(result.current.canvas.notation).toBe('architecture');
    expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(nodesBefore);
    // R-064 AC-4: a blocked source saves as its exact text (source-draft save),
    // while the applied notation stays the last valid one.
    const draft = result.current.header.onSave();
    expect(draft.settings.notation).toBe('architecture');
    expect(draft.content).toEqual({ format: 'dsl', dslType: 'coral', text: unknownSource });

    const bpmn = result.current.commandPalette.commands.find((command) => command.id === 'notation-bpmn')!;
    act(() => bpmn.action());
    await waitFor(() => expect(result.current.editor.dsl).toContain('@diagram bpmn'));
    // Over a blocked source only the header value changes; it applies as a source edit.
    expect(result.current.editor.dsl).toBe(unknownSource.replace('@diagram not-installed', '@diagram bpmn'));
    await waitFor(() => expect(result.current.canvas.notation).toBe('bpmn'), { timeout: 2500 });
  });

  it('keeps type-only architecture edge appearance profile-bound through source history and reopen', async () => {
    const { result } = renderHook(() => useEditorController());
    const source = '@diagram architecture\napi service\nstore database\napi -> store\n';
    act(() => { result.current.header.onOpenFile({ name: 'connections.coral', text: source }); });
    await waitFor(() => expect(result.current.canvas.edges[0]?.style?.stroke).toBe('#4caf50'));
    expect(result.current.editor.dsl).toBe(source);

    const edited = source.replace('store database', 'store service');
    act(() => result.current.editor.onDslChange(edited));
    await waitFor(() => expect(result.current.canvas.edges[0]?.style?.stroke).toBe('#424242'));
    expect(result.current.editor.dsl).toBe(edited);
    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    await waitFor(() => expect(result.current.canvas.edges[0]?.style?.stroke).toBe('#4caf50'));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    await waitFor(() => expect(result.current.canvas.edges[0]?.style?.stroke).toBe('#424242'));

    const saved = result.current.header.onSave();
    expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
    act(() => { result.current.header.onOpenFile({ name: 'connections.coral.json', text: JSON.stringify(saved) }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    await waitFor(() => expect(result.current.canvas.edges[0]?.style?.stroke).toBe('#424242'));
  });

  it('keeps an authored header and exact source when its new layout fails', async () => {
    const { result } = renderHook(() => useEditorController());
    const original = '@diagram flowchart\na process\nb process\na -> b\n';
    act(() => { result.current.header.onOpenFile({ name: 'original.coral', text: original }); });
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    const callsBefore = layout.mock.calls.length;
    layout.mockRejectedValue(new Error('layout denied'));
    const source = '@diagram architecture\napi service\nstore database\napi -> store\n';
    act(() => result.current.editor.onDslChange(source));
    try {
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore), { timeout: 2500 });
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      const saved = result.current.header.onSave();
      expect(saved.settings.notation).toBe('architecture');
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    } finally {
      layout.mockImplementation(async (graph: any) => ({
        children: mockLayoutChildren(graph),
        edges: [],
      }));
    }
  });

  it('publishes only the superseding graph, header notation, and settings', async () => {
    const { result } = renderHook(() => useEditorController());
    const original = '@diagram flowchart\na process\nb process\na -> b\n';
    act(() => { result.current.header.onOpenFile({ name: 'original.coral', text: original }); });
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));

    let resolveFirst!: (value: any) => void;
    const firstLayout = new Promise<any>((resolve) => { resolveFirst = resolve; });
    layout.mockImplementationOnce(() => firstLayout);
    const calls = layout.mock.calls.length;
    const architecture = '@diagram architecture\nfirst service\nstore database\nfirst -> store\n';
    act(() => result.current.editor.onDslChange(architecture));
    await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(calls), { timeout: 2500 });

    const bpmn = '@diagram bpmn\nsecond task\ndone endEvent\nsecond -> done\n';
    act(() => result.current.editor.onDslChange(bpmn));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['second', 'done']), { timeout: 2500 });
    expect(result.current.canvas.notation).toBe('bpmn');
    expect(result.current.header.onSave().settings.notation).toBe('bpmn');
    expect(result.current.header.onSave().content).toEqual({ format: 'dsl', dslType: 'coral', text: bpmn });

    await act(async () => {
      resolveFirst({ children: [], edges: [] });
      await firstLayout;
    });
    expect(result.current.canvas.notation).toBe('bpmn');
    expect(result.current.header.onSave().settings.notation).toBe('bpmn');
    expect(result.current.header.onSave().content).toEqual({ format: 'dsl', dslType: 'coral', text: bpmn });
    expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['second', 'done']);
  });

  it('opens GraphIR 2 through the named migration without dropping graph-level semantics', () => {
    const legacy = createBlankDocument();
    legacy.content.graphIR = {
      version: '2.0.0', id: 'legacy-class', metadata: { notation: 'uml-class' },
      nodes: [], edges: [],
    } as unknown as GraphIR;

    const prepared = prepareDocumentReplacement(legacy);

    expect(prepared.doc.content.graphIR?.version).toBe('3.0.0');
    expect(prepared.graph).toMatchObject({
      version: '3.0.0',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
    });
    expect(prepared.sourceDiagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('/profile') }),
    ]));
  });

  it('keeps authored Exact positions distinct from persisted view coordinates', () => {
    const viewNode = {
      id: 'n', type: 'service', position: { x: 120, y: 240 },
      data: { nodeType: 'service', label: 'Node' },
    } as CoralNode;
    const authored: GraphIR = {
      version: '3.0.0', id: 'g',
      nodes: [{ id: 'n', type: 'service', label: 'Node', position: { x: 12, y: 24 } }], edges: [],
    };
    const exact = serialize([viewNode], [], { name: 'Exact', graphIR: authored });
    const exactPrepared = prepareDocumentReplacement(exact);
    expect(exactPrepared.graphNodes[0].position).toEqual({ x: 12, y: 24 });
    expect(exactPrepared.nodes[0].position).toEqual({ x: 120, y: 240 });

    const released = serialize([viewNode], [], {
      name: 'Released', graphIR: { ...authored, nodes: [{ id: 'n', type: 'service', label: 'Node' }] },
    });
    expect(released.content.graphIR?.nodes[0].position).toBeUndefined();
    expect(released.nodePositions?.n).toEqual({ x: 120, y: 240 });
    const releasedPrepared = prepareDocumentReplacement(released);
    expect(releasedPrepared.graphNodes[0].position).toBeUndefined();
    expect(releasedPrepared.nodes[0].position).toEqual({ x: 120, y: 240 });
  });

  // S93-WI-03 / R-053 AC-2: Pin from layout-managed captures the displayed
  // parent-local coordinate, Unpin keeps it, and Release clears both at once.
  it('pins a layout-managed node at its displayed position, unpins, and releases atomically', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onLoad(serialize([], [], {
      name: 'Pin capture',
      graphIR: {
        version: '3.0.0', id: 'pin-capture',
        nodes: [{ id: 'g', type: 'group', label: 'Group', children: [{ id: 'c', type: 'service', label: 'Child' }] }],
        edges: [],
      },
    })); });
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id).sort()).toEqual(['c', 'g']));
    await waitFor(() => expect(result.current.canvas.isReflowing).toBe(false));
    const child = () => result.current.canvas.nodes.find((node) => node.id === 'c')!;
    act(() => result.current.canvas.onSelectionChange({ nodes: [child()], edges: [] }));
    // The Inspector's selected-node view carries the authored geometry.
    const selected = () => result.current.inspector!.selectedNode!.data as { authoredPosition?: unknown; pinned?: boolean };
    expect(selected().authoredPosition).toBeUndefined();
    const displayed = { ...child().position };
    expect(child().parentId).toBe('g');

    act(() => result.current.inspector!.onToggleNodePin('c'));
    const pinnedSource = new RegExp(`as c @ \\(${displayed.x}, ${displayed.y}\\) pinned`);
    await waitFor(() => expect(result.current.editor.dsl).toMatch(pinnedSource));
    await waitFor(() => expect(selected()).toMatchObject({ authoredPosition: displayed, pinned: true }));

    act(() => result.current.inspector!.onToggleNodePin('c'));
    await waitFor(() => expect(result.current.editor.dsl).not.toContain('pinned'));
    expect(result.current.editor.dsl).toMatch(new RegExp(`as c @ \\(${displayed.x}, ${displayed.y}\\)`));
    await waitFor(() => expect(selected().pinned).not.toBe(true));
    expect(selected().authoredPosition).toEqual(displayed);

    act(() => result.current.inspector!.onToggleNodePin('c'));
    await waitFor(() => expect(result.current.editor.dsl).toContain('pinned'));
    act(() => result.current.inspector!.onReleaseNodePosition('c'));
    await waitFor(() => expect(result.current.editor.dsl).not.toContain('@ ('));
    expect(result.current.editor.dsl).not.toContain('pinned');
    await waitFor(() => expect(selected().authoredPosition).toBeUndefined());
    expect(selected().pinned).not.toBe(true);

    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.editor.dsl).toMatch(pinnedSource));
    const saved = result.current.header.onSave();
    const savedChild = saved.content.graphIR?.nodes[0].children?.[0];
    expect(savedChild).toMatchObject({ id: 'c', position: displayed, pinned: true });
  });

  // S93-WI-07/08 / R-063 AC-7 / R-064 AC-4: an unsafe port reference never
  // becomes a graph document the same build would refuse to reopen.
  describe('port-reference safety at editor boundaries', () => {
    it('blocks publication, saves the exact draft, and reopens it with its diagnostic', async () => {
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
      const source = '@diagram architecture\napi service\nstore database\n' +
        'e1 = api:out -> store:query [reads]\n';
      act(() => { result.current.header.onOpenFile({ name: 'ports.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id).sort()).toEqual(['api', 'store']));

      const invalid = source.replace('api:out', 'api:missing');
      act(() => result.current.editor.onDslChange(invalid));
      await waitFor(() => expect(result.current.editor.parseErrors.map((item) => item.code))
        .toContain('coral.port.reference.missing'));
      expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['e1']);
      const saved = result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: invalid });

      vi.spyOn(window, 'confirm').mockReturnValue(true);
      act(() => { result.current.header.onLoad(createBlankDocument()); });
      await waitFor(() => expect(result.current.editor.dsl).not.toBe(invalid));
      let reopened = false;
      act(() => { reopened = result.current.header.onOpenFile({ name: 'draft.coral.json', text: JSON.stringify(saved) }) as boolean; });
      expect(reopened).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(invalid));
      await waitFor(() => expect(result.current.editor.parseErrors.map((item) => item.code))
        .toContain('coral.port.reference.missing'));
      expect(result.current.header.onSave().content).toEqual({ format: 'dsl', dslType: 'coral', text: invalid });
    });

    it('preserves a decision-branch label without inventing a port when notation changes', async () => {
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
      const source = '@diagram flowchart\nstart process\nreview decision\ndone process\n' +
        'start -> review\nbranch = review -> done [label: "Yes"]\n';
      act(() => { result.current.header.onOpenFile({ name: 'decision.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.editor.dsl).toContain('[label: "Yes"]');
      act(() => result.current.inspector!.onDocumentSettingsChange({
        ...result.current.inspector!.documentSettings, notation: 'architecture',
      }));
      await waitFor(() => expect(result.current.canvas.notation).toBe('architecture'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.editor.parseErrors.map((item) => item.code))
        .not.toContain('coral.port.reference.missing');
      expect(result.current.editor.dsl).toContain('[label: "Yes"]');
      expect(result.current.editor.dsl).toBe(source.replace('@diagram flowchart', '@diagram architecture'));
      const branch = parseInstalledDocument028(result.current.editor.dsl).graph?.edges.find((edge) => edge.id === 'branch');
      expect(branch?.label).toBe('Yes');
      expect(branch?.sourcePort).toBeUndefined();
      expect(branch?.targetPort).toBeUndefined();
      expect(result.current.header.onSave().content).toEqual({
        format: 'dsl', dslType: 'coral', text: result.current.editor.dsl,
      });
    });

    it('opens a keyed missing port as exact blocked source with a located finding', () => {
      const source = '@diagram architecture\napi service\nstore database\n' +
        'read = api -> store [reads, firstPort: missing, secondPort: query]\n';
      const plan = planFileOpen({ name: 'bad.coral', text: source });
      expect(plan.kind).toBe('open');
      if (plan.kind !== 'open') return;
      expect(plan.prepared.source).toBe(source);
      expect(plan.textOpen?.blockWith).toContain('missing source port missing');
      const failures = plan.textOpen?.diagnostics.filter((item) => item.severity === 'error') ?? [];
      expect(failures.map((item) => item.code)).toEqual(['coral.port.reference.missing']);
      expect(failures[0]?.range?.start.offset).toBe(source.indexOf('missing'));
    });

    it('opens source-selected 0.2.8 Coral as an unblocked editor graph without changing authored source', () => {
      const source = '@diagram architecture\napiGateway service as "API gateway"\n' +
        'auditSink service\ncall = apiGateway -> auditSink [calls] as "Send"\n';
      const plan = planFileOpen({ name: 'new.coral', text: source });
      expect(plan.kind).toBe('open');
      if (plan.kind !== 'open') return;
      expect(plan.prepared.source).toBe(source);
      expect(plan.textOpen?.blockWith).toBeUndefined();
      expect(plan.textOpen?.canonicalInput.nodes.map((node) => node.id)).toEqual(['apiGateway', 'auditSink']);
      expect(plan.textOpen?.canonicalInput.edges[0]).toMatchObject({ id: 'call', label: 'Send' });
    });

    it('refuses a Mermaid-to-Coral switch when installed source cannot preserve the graph', async () => {
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
      const original = result.current.editor.dsl;
      act(() => result.current.editor.onDslTypeChange('coral'));
      expect(result.current.editor.dslType).toBe('mermaid');
      expect(result.current.editor.dsl).toBe(original);
      expect(result.current.guidanceAnnouncement).toMatch(/cannot be converted to 0\.2\.8 Coral without losing meaning/i);
      expect(result.current.header.onSave().content).toEqual({ format: 'dsl', dslType: 'mermaid', text: original });
    });

    it('opens an invalid saved-header port reference with one source-native finding', () => {
      const source = '@diagram architecture\napi service\nstore database\n' +
        'read = api:missing -> store:query [reads]\n';
      const plan = planFileOpen({ name: 'invalid-ports.coral', text: source });
      expect(plan.kind).toBe('open');
      if (plan.kind !== 'open') return;
      expect(plan.textOpen?.blockWith).toContain('missing source port missing');
      const failures = plan.textOpen?.diagnostics.filter((item) => item.severity === 'error') ?? [];
      expect(failures.filter((item) => item.code === 'coral.port.reference.missing')).toHaveLength(1);
      expect(failures.some((item) => item.code === 'coral.editor.port-reference.invalid')).toBe(false);
      expect(failures[0]?.range?.start.offset).toBe(source.indexOf('missing'));
    });

    it('opens a duplicated port field as exact saveable source with complete assignment ranges', () => {
      const source = '@diagram architecture\napi service {\n' +
        '  send port [direction: out, direction: in]\n}\n';
      const plan = planFileOpen({ name: 'duplicate-port.coral', text: source });
      expect(plan.kind).toBe('open');
      if (plan.kind !== 'open') return;
      expect(plan.prepared.source).toBe(source);
      const duplicate = plan.textOpen?.diagnostics.find((item) =>
        item.code === 'coral.syntax.port.direction.duplicate');
      expect(duplicate?.range?.start.offset).toBe(source.indexOf('direction: in'));
      expect(duplicate?.range?.end.offset).toBe(source.indexOf('direction: in') +
        'direction: in'.length);
      expect(duplicate?.related?.[0]?.range?.start.offset)
        .toBe(source.indexOf('direction: out'));
    });

    it('opens a Block source document with its own notation instead of an architecture alias', () => {
      const source = '@diagram block\nproducer block\nconsumer block\n' +
        'transfer = producer -> consumer as "Data"\n';
      const plan = planFileOpen({ name: 'blocks.coral', text: source });
      expect(plan.kind).toBe('open');
      if (plan.kind !== 'open') return;
      expect(plan.prepared.source).toBe(source);
      expect(plan.prepared.notation).toBe('block');
      expect(plan.textOpen?.blockWith).toBeUndefined();
      expect(plan.textOpen?.canonicalInput.nodes.map((node) => node.type)).toEqual(['block', 'block']);
    });

    it.each([
      ['block', '@diagram block\nproducer block\nconsumer block\nproducer -> consumer\n'],
      ['bpmn', '@diagram bpmn\nstart startEvent\nwork task\nstart -> work\n'],
    ] as const)('opens a simple graph-only %s document as source-first Coral', (notation, source) => {
      const graph = parseInstalledDocument028(source).graph!;
      const document = createBlankDocument();
      document.settings.notation = notation;
      document.content.graphIR = { ...graph, id: `imported-${notation}` };
      const plan = planFileOpen({ name: `${notation}.coral.json`, text: JSON.stringify(document) });
      expect(plan.kind).toBe('open');
      if (plan.kind !== 'open') return;
      expect(plan.prepared.source).toContain(`@diagram ${notation}\n`);
      expect(plan.prepared.source).not.toContain('@graph');
      expect(parseInstalledDocument028(plan.prepared.source).graph?.nodes.map((node) => node.type))
        .toEqual(graph.nodes.map((node) => node.type));
    });

    it('preserves an explicit symbol when opening a graph-only BPMN import as Coral source', () => {
      const graph = parseInstalledDocument028('@diagram bpmn\nwork task\n').graph!;
      graph.nodes[0]!.symbol = 'bpmn-task';
      const document = createBlankDocument();
      document.settings.notation = 'bpmn';
      document.content.graphIR = graph;
      const plan = planFileOpen({ name: 'explicit-symbol.coral.json', text: JSON.stringify(document) });
      expect(plan.kind).toBe('open');
      if (plan.kind !== 'open') return;
      expect(plan.prepared.source).toContain('work task [symbol: "bpmn-task"]');
    });

    it('rejects an older GraphIR document whose port direction is incompatible', () => {
      const graph = {
        version: '3.0.0', id: 'legacy-ports', metadata: { notation: 'architecture' },
        nodes: [
          { id: 'primary', type: 'database', symbol: 'arch-database', label: 'Primary' },
          { id: 'replica', type: 'database', symbol: 'arch-database', label: 'Replica' },
        ],
        edges: [{ id: 'copy', source: 'primary', target: 'replica', sourcePort: 'query', targetPort: 'query' }],
      };
      const plan = planFileOpen({ name: 'legacy.json', text: JSON.stringify(graph) });
      expect(plan.kind).toBe('blocked');
      if (plan.kind !== 'blocked') return;
      expect(plan.reasons.map((reason) => reason.message).join('\n'))
        .toContain('Edge "copy" uses source port "query" on node "primary"');
    });

    // Portless nodes stay connectable on the canvas; a connection to them is a
    // port-less edge that saves as a graph document and reopens.
    it('connects a portless container from the canvas without a phantom port', async () => {
      const graph = {
        version: '3.0.0' as const, id: 'portless', metadata: { notation: 'architecture' },
        nodes: [
          { id: 'tier', type: 'group', symbol: 'arch-container', label: 'Tier',
            children: [{ id: 'api', type: 'service', symbol: 'arch-service', label: 'API' }] },
          { id: 'billing', type: 'service', symbol: 'arch-service', label: 'Billing' },
        ],
        edges: [],
      };
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
      act(() => { result.current.header.onLoad(serialize([], [], { name: 'Portless', graphIR: graph })); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id).sort()).toEqual(['api', 'billing', 'tier']));
      // Dragging from the container's port-less handle colours the target's in-port.
      act(() => result.current.canvas.onConnectStart({} as never, { nodeId: 'tier', handleId: null, handleType: 'source' }));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'billing')?.data.dragStates)
        .toMatchObject({ in: 'compatible' }));
      act(() => result.current.canvas.onConnectEnd());
      // Dragging onto the container from a node the notation forbids is marked incompatible.
      act(() => result.current.canvas.onConnectStart({} as never, { nodeId: 'billing', handleId: 'out', handleType: 'source' }));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'tier')?.data.dragStates)
        .toEqual({ '*': 'incompatible' }));
      act(() => result.current.canvas.onConnectEnd());

      act(() => result.current.canvas.onConnect({ source: 'tier', target: 'billing', sourceHandle: null, targetHandle: 'in' }));
      await waitFor(() => expect(result.current.editor.dsl).toMatch(/tier -> billing/));
      expect(result.current.editor.isDslReadOnly).toBe(true);
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(0));
      expect(result.current.editor.isDslReadOnly).toBe(true);
      expect(result.current.header.onSave().content).toMatchObject({
        format: 'graph-ir', graphIR: { id: 'portless', edges: [] },
      });
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
      expect(result.current.editor.isDslReadOnly).toBe(true);
      const saved = result.current.header.onSave();
      expect(saved.content.format).toBe('graph-ir');
      const edge = saved.content.graphIR?.edges.find((candidate) => candidate.source === 'tier');
      expect(edge).toMatchObject({ source: 'tier', target: 'billing', targetPort: 'in' });
      expect(edge?.sourcePort).toBeUndefined();
      expect(validateIR(saved.content.graphIR!).errors).toEqual([]);
      expect(planFileOpen({ name: 'portless.coral.json', text: JSON.stringify(saved) }).kind).toBe('open');
    });

    it('keeps an authored directed custom port list through save and reopen', async () => {
      const graph = {
        version: '3.0.0' as const, id: 'custom-ports', metadata: { notation: 'architecture' },
        nodes: [
          { id: 'primary', type: 'database', symbol: 'arch-database', label: 'Primary', ports: [
            { id: 'replicate', side: 'EAST' as const, properties: { direction: 'out' } },
            { id: 'query', side: 'NORTH' as const, properties: { direction: 'in' } },
          ] },
          { id: 'replica', type: 'database', symbol: 'arch-database', label: 'Replica' },
        ],
        edges: [{ id: 'copy', source: 'primary', target: 'replica', sourcePort: 'replicate', targetPort: 'query' }],
      };
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
      act(() => { result.current.header.onLoad(serialize([], [], { name: 'Custom ports', graphIR: graph })); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id).sort()).toEqual(['primary', 'replica']));
      // Dragging from the replica's input evaluates the authored output port,
      // not the symbol's input-only query port (the verdict is the notation's).
      act(() => result.current.canvas.onConnectStart({} as never, { nodeId: 'replica', handleId: 'query', handleType: 'target' }));
      await waitFor(() => expect(Object.keys(result.current.canvas.nodes.find((node) => node.id === 'primary')?.data.dragStates ?? {}))
        .toEqual(['replicate']));
      act(() => result.current.canvas.onConnectEnd());
      const saved = result.current.header.onSave();
      expect(saved.content.format).toBe('graph-ir');
      expect(saved.content.graphIR?.nodes.find((node) => node.id === 'primary')?.ports).toEqual(graph.nodes[0].ports);
      expect(validateIR(saved.content.graphIR!).errors).toEqual([]);
      const reopened = planFileOpen({ name: 'custom.coral.json', text: JSON.stringify(saved) });
      expect(reopened.kind).toBe('open');
    });
  });

  it('keeps Release stable through undo, redo, save, reopen, and Reflow', async () => {
    const { result } = renderHook(() => useEditorController());
    const opened = serialize([{
      id: 'n', type: 'service', position: { x: 120, y: 240 },
      data: { nodeType: 'service', label: 'Node' },
    } as CoralNode], [], {
      name: 'Release journey',
      graphIR: {
        version: '3.0.0', id: 'release-journey',
        nodes: [{ id: 'n', type: 'service', label: 'Node', position: { x: 12, y: 24 } }], edges: [],
      },
    });
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onLoad(opened); });
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['n']));
    act(() => result.current.canvas.onSelectionChange({ nodes: [result.current.canvas.nodes[0]], edges: [] }));
    act(() => result.current.inspector!.onReleaseNodePosition('n'));
    await waitFor(() => expect(result.current.editor.dsl).not.toContain('@ ('));

    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.editor.dsl).toContain('@ (12, 24)'));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.editor.dsl).not.toContain('@ ('));

    let saved!: ReturnType<typeof result.current.header.onSave>;
    act(() => { saved = result.current.header.onSave(); });
    expect(saved.content.graphIR?.nodes[0].position).toBeUndefined();
    expect(saved.nodePositions?.n).toBeDefined();
    act(() => { result.current.header.onLoad(saved); });
    await waitFor(() => expect(result.current.editor.dsl).not.toContain('@ ('));
    act(() => result.current.canvas.onReflow());
    await waitFor(() => expect(result.current.canvas.isReflowing).toBe(false));
    expect(result.current.header.onSave().content.graphIR?.nodes[0].position).toBeUndefined();
  });

  it('keeps authored exact source coordinates when Reflow moves the resolved display', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Exact Reflow', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'exact-reflow',
        nodes: [
          { id: 'n', type: 'service', label: 'Node', position: { x: 12, y: 24 } },
          { id: 'm', type: 'database', label: 'Other', position: { x: 120, y: 24 } },
          { id: 'group', type: 'group', label: 'Group', children: [
            { id: 'child-exact', type: 'service', label: 'Exact child', position: { x: 10, y: 20 } },
            { id: 'child-auto', type: 'service', label: 'Automatic child' },
          ] },
        ],
        edges: [{ id: 'n-m', source: 'n', target: 'm' }],
      } },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    }); });
    await waitFor(() => expect(result.current.editor.dsl).toContain('@ (12, 24)'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 500)); });

    layout.mockImplementationOnce(async (graph: any) => {
      const move = (child: any, index: number, depth: number): any => ({
        ...child,
        x: 777 + index * 222 + depth * 111,
        y: 888 + depth * 111,
        children: child.children?.map((nested: any, nestedIndex: number) => move(nested, nestedIndex, depth + 1)),
      });
      return {
        ...graph,
        children: (graph.children ?? []).map((child: any, index: number) => move(child, index, 0)),
        edges: graph.edges ?? [],
      };
    });
    act(() => result.current.canvas.onReflow());
    await waitFor(() => expect(result.current.canvas.nodes[0].position).toEqual({ x: 777, y: 888 }));

    expect(result.current.editor.dsl).toContain('@ (12, 24)');
    expect(result.current.header.onSave().content.graphIR?.nodes[0].position).toEqual({ x: 12, y: 24 });
    expect(result.current.canvas.nodes.find((node) => node.id === 'child-exact')?.position).not.toEqual({ x: 10, y: 20 });
    act(() => (result.current.canvas.edges[0].data as any).onWaypointAdd('n-m', { x: 900, y: 950 }));
    await waitFor(() => expect(result.current.editor.dsl).toContain('via'));
    expect(result.current.editor.dsl).toContain('@ (12, 24)');
    const saved = result.current.header.onSave().content.graphIR!;
    expect(saved.nodes[0].position).toEqual({ x: 12, y: 24 });
    const children = saved.nodes.find((node) => node.id === 'group')!.children!;
    expect(children.find((node) => node.id === 'child-exact')?.position).toEqual({ x: 10, y: 20 });
    expect(children.find((node) => node.id === 'child-auto')?.position).toBeUndefined();
  });

  it('refuses immediate Reflow until a pending property edit is committed', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Property Reflow', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'property-reflow',
        nodes: [{ id: 'n', type: 'service', label: 'Node' }], edges: [],
      } },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    }));
    await waitFor(() => expect(result.current.canvas.nodes.map((candidate) => candidate.id)).toEqual(['n']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    const node = result.current.canvas.nodes[0];
    act(() => result.current.canvas.onSelectionChange({ nodes: [node], edges: [] }));
    const callsBeforeEdit = layout.mock.calls.length;
    act(() => result.current.inspector!.onPropertyChange({
      nodeId: node.id, field: 'description', oldValue: undefined, newValue: 'Retained before Reflow',
    }));
    act(() => result.current.canvas.onReflow());
    expect(result.current.canvas.isReflowing).toBe(false);
    expect(layout.mock.calls).toHaveLength(callsBeforeEdit);

    await waitFor(() => expect(result.current.editor.dsl).toContain('Retained before Reflow'));
    expect(result.current.header.onSave().content.graphIR?.nodes
      .find((candidate) => candidate.id === node.id)?.description).toBe('Retained before Reflow');

  });

  it('keeps a superseding visual edit pending when an aborted resolution settles', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Visual supersession', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'visual-supersession',
        nodes: [
          { id: 'a', type: 'service', label: 'Alpha', position: { x: 0, y: 0 } },
          { id: 'b', type: 'database', label: 'Beta', position: { x: 400, y: 0 } },
        ],
        edges: [],
        constraints: [{
          id: 'b-right-of-a', kind: 'relative', strength: 'preferred',
          subject: { kind: 'node', nodeId: 'b' }, relation: 'right-of',
          target: { kind: 'node', nodeId: 'a' }, gap: 10,
        }],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
    }));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    act(() => result.current.canvas.onSelectionChange({
      nodes: [result.current.canvas.nodes.find((node) => node.id === 'a')!], edges: [],
    }));

    let resolveOld!: (value: any) => void;
    let oldRequest: any;
    const oldLayout = new Promise<any>((resolve) => { resolveOld = resolve; });
    layout.mockImplementationOnce((graph: any) => {
      oldRequest = graph;
      return oldLayout;
    });
    const callsBefore = layout.mock.calls.length;
    act(() => result.current.inspector!.onPropertyChange({
      nodeId: 'a', field: 'label', oldValue: 'Alpha', newValue: 'Alpha one',
    }));
    await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));

    act(() => result.current.inspector!.onPropertyChange({
      nodeId: 'a', field: 'description', oldValue: undefined, newValue: 'Second edit survives',
    }));
    await act(async () => {
      resolveOld({
        ...oldRequest,
        children: (oldRequest.children ?? []).map((child: any, index: number) => ({
          ...child, x: index * 300, y: 0,
        })),
        edges: oldRequest.edges ?? [],
      });
      await oldLayout;
    });

    act(() => result.current.canvas.onReflow());
    expect(result.current.guidanceAnnouncement).toBe('Finish the current diagram update before Reflow.');
    expect(layout.mock.calls).toHaveLength(callsBefore + 1);
    await waitFor(() => expect(result.current.editor.dsl).toContain('Second edit survives'));
    expect(result.current.header.onSave().content.graphIR?.nodes
      .find((node) => node.id === 'a')?.description).toBe('Second edit survives');
  });

  it('keeps UML profile and classifier fields editable through source changes', async () => {
    const source = '@diagram uml-class\nn class as "Node" {\n  attributes {\n' +
      '    nameField = private attribute name: String\n  }\n}\n';
    const edited = `${source}other class as "Other"\n`;
    const confirm = vi.mocked(window.confirm).mockReturnValue(false);
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onOpenFile({ name: 'model.coral', text: source }); });
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['n']));
    confirm.mockClear();
    act(() => result.current.editor.onDslChange(edited));
    expect(result.current.editor.dsl).toBe(edited);
    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['n', 'other']));
    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    const saved = result.current.header.onSave();
    expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
    act(() => { result.current.header.onOpenFile({ name: 'model.coral.json', text: JSON.stringify(saved) }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    const projected = projectInstalledSourceToSuccessor028(edited).graph;
    expect(projected?.profile).toEqual({ id: 'uml', kind: 'class', version: '1.0.0' });
    expect(projected?.nodes.find((node) => node.id === 'n')?.classifier).toMatchObject({
      kind: 'class', name: 'Node',
    });
  });

  it('applies structured classifier inspector changes to canonical output', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const document = createBlankDocument();
    document.settings.notation = 'uml-class';
    document.content.graphIR = {
      version: '3.0.0', id: 'uml-editor',
      profile: { id: 'uml', kind: 'class', version: '1.0.0' },
      metadata: { notation: 'uml-class' },
      nodes: [{
        id: 'order', type: 'class', symbol: 'uml-class', label: 'Order',
        classifier: { kind: 'class', name: 'Order', compartments: [{ id: 'name', kind: 'name' }] },
      }], edges: [],
    };
    act(() => result.current.header.onLoad(document));
    await waitFor(() => expect(result.current.canvas.nodes[0]?.id).toBe('order'));
    act(() => result.current.canvas.onSelectionChange({ nodes: [result.current.canvas.nodes[0]], edges: [] }));
    const next = {
      kind: 'interface' as const, name: 'Order', modifiers: ['abstract' as const],
      compartments: [{ id: 'name', kind: 'name' as const }],
    };
    act(() => result.current.inspector!.onPropertyChange({
      nodeId: 'order', field: 'classifier',
      oldValue: { kind: 'class', name: 'Order', compartments: [{ id: 'name', kind: 'name' }] },
      newValue: next,
    }));
    await waitFor(() => expect(result.current.editor.dsl).toContain('interface "Order"'));
    expect(result.current.header.onSave().content.graphIR?.nodes[0]).toMatchObject({
      type: 'interface', symbol: 'uml-interface', classifier: next,
    });
  });

  it('exports the canvas notation catalog semantics rather than theme edge defaults', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onLoad(cloneBundledExample('architecture')); });
    await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('service-database'));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    const canvasEdge = result.current.canvas.edges[0];
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:notation-export');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action({ invoker: null }));
      const svg = await (createObjectUrl.mock.calls[0][0] as Blob).text();
      const shaft = /<g data-coral-edge="service-database">[\s\S]*?<path data-coral-part-id="service-database:shaft"[^>]*>/.exec(svg)?.[0] ?? '';
      expect(shaft).toContain('stroke="#363430"');
      expect(canvasEdge.markerEnd).toBeDefined();
      expect(shaft).toMatch(/marker-end="url\(#coral-instance-[^"]+-coral-marker-[^"]+\)"/);
    } finally {
      click.mockRestore();
      revokeObjectUrl.mockRestore();
      createObjectUrl.mockRestore();
    }
  });

  it('retains the last-good canvas but blocks rendered exports for invalid current source', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const lastGoodCount = result.current.canvas.nodes.length;
    act(() => result.current.editor.onDslChange('not valid coral {'));
    await waitFor(() => expect(result.current.editor.parseErrors.length).toBeGreaterThan(0), { timeout: 1500 });
    act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
    expect(result.current.canvas.nodes).toHaveLength(lastGoodCount);
    expect(result.current.rasterExportError).toContain('current source');
  });

  it('retains all current source errors and grouped related locations on blocked apply', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onOpenFile({ name: 'valid.coral',
      text: '@diagram architecture\na service\nb service\na -> b' }));
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const previous = result.current.canvas.nodes.map((node) => node.id);
    const source = '@diagram architecture\na service\nb service\n' +
      'a -> b [label: "first", label: "second"]\ninvalid first\ninvalid second';
    act(() => result.current.editor.onDslChange(source));
    await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(source));
    const diagnostics = result.current.editor.editorAnalysis.diagnostics;
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({ code: 'coral.syntax.label.duplicate',
      related: [expect.objectContaining({ position: expect.objectContaining({ line: 4 }) })] });
    expect(result.current.editor.parseErrors[0].related).toEqual(diagnostics[0].related);
    expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(previous);
  });

  it('names the error count and the full diagnostics list when export is blocked (Slice 52 FIX-1 D52-4)', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onOpenFile({ name: 'valid.coral',
      text: '@diagram architecture\na service\nb service\na -> b' }));
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const source = '@diagram architecture\na service\nb service\n' +
      'a -> b [label: "first", label: "second"]\ninvalid first\ninvalid second';
    act(() => result.current.editor.onDslChange(source));
    await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(source));
    const first = result.current.editor.editorAnalysis.diagnostics[0];
    expect(result.current.editor.editorAnalysis.diagnostics).toHaveLength(2);
    act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
    expect(result.current.rasterExportError).toBe(
      `Export blocked: 2 errors — first: Line 4: ${first.message}; use Show all diagnostics for the full list`);
  });

  it('names a single blocking error in the singular (Slice 52 test review T52-5)', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onOpenFile({ name: 'valid.coral',
      text: '@diagram architecture\na service\nb service\na -> b' }));
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const source = '@diagram architecture\na service\nb service\na -> b [type: flow, type: calls]';
    act(() => result.current.editor.onDslChange(source));
    await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(source));
    const diagnostics = result.current.editor.editorAnalysis.diagnostics;
    expect(diagnostics).toHaveLength(1);
    act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
    expect(result.current.rasterExportError).toBe(
      `Export blocked: 1 error — first: Line 4: ${diagnostics[0].message}; use Show all diagnostics for the full list`);
  });

  it.each([
    ['a duplicate type', 'api -> db [flow, type: calls]'],
    ['a duplicate label', 'api -> db [label: "First"] as "Second"'],
    ['a duplicate first port', 'api:out -> db [firstPort: out]'],
  ])('blocks a source edit with %s and keeps the previous graph (R-063 AC-5)', async (_name, source) => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onOpenFile({ name: 'valid.coral',
      text: '@diagram architecture\napi service\ndb database\napi -> db' }));
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const previous = result.current.canvas.nodes.map((node) => node.id);
    const draft = `@diagram architecture\napi service\ndb database\n${source}`;
    act(() => result.current.editor.onDslChange(draft));
    await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(draft), { timeout: 1500 });
    const positioned = result.current.editor.editorAnalysis.diagnostics.filter((item) => item.severity === 'error');
    expect(positioned.length).toBeGreaterThan(0);
    expect(positioned.every((item) => item.position?.line === 4)).toBe(true);
    expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(previous);
  });

  // Retained future-AI source-ownership coverage; 0.2.9 exposes no AI Fix control.
  it('refuses AI Fix for authored Coral and restores diagnostics after manual repair Undo', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const valid = '@diagram architecture\napi service as "API"';
    act(() => result.current.header.onOpenFile({ name: 'api.coral', text: valid }));
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    const invalid = `${valid}\napi -> ???`;
    act(() => result.current.editor.onDslChange(invalid));
    await waitFor(() => expect(result.current.editor.parseErrors.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.editor.editorAnalysis.diagnostics.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
    act(() => result.current.preferences.onLlmApiKeyChange('fixture-key'));
    await waitFor(() => expect(result.current.editor.hasApiKey).toBe(true));

    act(() => result.current.editor.onFixSourceError());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.current.editor.dsl).toBe(invalid);
    expect(result.current.guidanceAnnouncement).toContain('Edit this 0.2.8 diagram in Coral source');
    expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: invalid });
    act(() => result.current.editor.onEditSessionEnd());
    act(() => result.current.editor.onDslChange(valid));
    await waitFor(() => expect(result.current.editor.parseErrors).toHaveLength(0));
    await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(valid));
    act(() => result.current.canvas.onUndo());

    expect(result.current.editor.dsl).toBe(invalid);
    expect(result.current.editor.parseErrors.length).toBeGreaterThan(0);
    expect(result.current.editor.editorAnalysis.diagnostics.length).toBeGreaterThan(0);
    act(() => result.current.canvas.onRedo());
    expect(result.current.editor.dsl).toBe(valid);
    expect(result.current.editor.parseErrors).toHaveLength(0);
    expect(result.current.editor.editorAnalysis.diagnostics).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it('does not dispatch authored-source Fix after a newer edit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const corrected = '@diagram architecture\napi service as "API"';
    act(() => result.current.header.onOpenFile({ name: 'api.coral', text: corrected }));
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    const invalid = `${corrected}\napi -> ???`;
    act(() => result.current.editor.onDslChange(invalid));
    await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(invalid));
    expect(result.current.editor.editorAnalysis.diagnostics.length).toBeGreaterThan(0);
    act(() => result.current.preferences.onLlmApiKeyChange('fixture-key'));

    act(() => result.current.editor.onDslChange(corrected));

    expect(result.current.editor.dsl).toBe(corrected);
    expect(result.current.editor.editorAnalysis.source).toBe(invalid);
    act(() => result.current.editor.onFixSourceError());
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects invalid replacements before confirmation with a stable announcement', async () => {
    const confirm = vi.mocked(window.confirm);
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.editor.onDslChange('service "Keep me"'));
    // Settle the dirty source edit first; while it is pending, its update owner
    // refuses Open before validation (covered separately below).
    await waitFor(() => expect(result.current.canvas.mutationsDisabled).toBe(false));
    const before = result.current.editor.dsl;

    let accepted = true;
    act(() => { accepted = result.current.header.onLoad({} as never) as unknown as boolean; });

    expect(accepted).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(result.current.editor.dsl).toBe(before);
    expect(result.current.guidanceAnnouncement).toBe(
      'The selected document is invalid and was not opened. Your current work is unchanged.',
    );
  });

  it('refuses a replacement with the update-owner copy before validation while source is pending', async () => {
    const confirm = vi.mocked(window.confirm);
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.editor.onDslChange('service "Keep me"'));
    const before = result.current.editor.dsl;

    let accepted = true;
    act(() => { accepted = result.current.header.onLoad({} as never) as unknown as boolean; });

    expect(accepted).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    expect(result.current.editor.dsl).toBe(before);
    expect(result.current.guidanceAnnouncement).toBe(
      'Finish the current diagram update before opening another document.',
    );
  });

  it('protects settings-only edits from document replacement', async () => {
    const confirm = vi.mocked(window.confirm).mockReturnValue(false);
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.inspector).not.toBeNull());
    const settings = result.current.inspector!.documentSettings;
    act(() => result.current.inspector!.onDocumentSettingsChange({
      ...settings,
      layout: { ...settings.layout, direction: 'RIGHT' },
    }));

    let accepted = true;
    act(() => { accepted = result.current.header.onLoad(cloneBundledExample('code')) as unknown as boolean; });

    expect(accepted).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(result.current.inspector!.documentSettings.layout.direction).toBe('RIGHT');
  });

  it('keeps modal owners exclusive', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.welcome.isOpen).toBe(true));
    act(() => result.current.header.onHelp());
    expect(result.current.welcome.isOpen).toBe(false);
    expect(result.current.help.isOpen).toBe(true);
    act(() => result.current.header.onAbout());
    expect(result.current.help.isOpen).toBe(false);
    expect(result.current.about.isOpen).toBe(true);
    act(() => result.current.header.onTogglePreferences());
    expect(result.current.about.isOpen).toBe(false);
    expect(result.current.preferences.isOpen).toBe(true);
  });

  it('owns shell toggles and source changes exposed to the view', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));

    act(() => result.current.header.onToggleInspector());
    expect(result.current.inspector).toBeNull();
    act(() => result.current.header.onToggleInspector());
    expect(result.current.inspector).not.toBeNull();

    act(() => result.current.header.onToggleCommandPalette());
    expect(result.current.commandPalette.isOpen).toBe(true);
    act(() => result.current.commandPalette.onClose());
    expect(result.current.commandPalette.isOpen).toBe(false);

    act(() => result.current.header.onTogglePreferences());
    expect(result.current.preferences.isOpen).toBe(true);
    act(() => result.current.preferences.onClose());
    expect(result.current.preferences.isOpen).toBe(false);

    act(() => result.current.header.onToggleOverflowMenu());
    expect(result.current.header.overflowMenuOpen).toBe(true);
    act(() => result.current.editor.onToggleDiagnostics());
    expect(result.current.editor.diagnosticsCollapsed).toBe(true);
    act(() => result.current.editor.onBottomPanelTabChange('activity'));
    expect(result.current.editor.diagnosticsCollapsed).toBe(false);
    expect(result.current.editor.bottomPanelTab).toBe('activity');

    act(() => result.current.editor.onDslChange('service "Direct source"'));
    expect(result.current.editor.dsl).toBe('service "Direct source"');
  });

  it('routes secondary view callbacks through their controller owners', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(1));
    const first = result.current.canvas.nodes[0];
    const edge = result.current.canvas.edges[0];

    act(() => result.current.workspace.onPropertiesWidthChange(360));
    act(() => result.current.workspace.onBottomHeightChange(240));
    act(() => result.current.workspace.onPropertiesTabChange('diagram'));
    act(() => result.current.editor.onDiagnosticHover(edge?.id ?? null));
    act(() => result.current.editor.onDiagnosticHover(null));
    act(() => result.current.editor.onCancelGeneration());
    act(() => result.current.editor.onCancelChatAction(999));
    await act(async () => { await result.current.editor.onFixSourceError(); });

    act(() => result.current.canvas.onSelectionChange({ nodes: [], edges: edge ? [edge] : [] }));
    expect(result.current.inspector?.selectionSummary.kind).toBe('edge');
    act(() => result.current.canvas.onSelectionChange({ nodes: [first], edges: edge ? [edge] : [] }));
    expect(result.current.inspector?.selectionSummary.kind).toBe('mixed');
    act(() => result.current.canvas.onSelectionChange({ nodes: [first], edges: [] }));
    act(() => result.current.canvas.onSelectionChange({
      nodes: [{ ...first, id: 'label-fallback', data: { ...first.data, label: undefined } }], edges: [],
    }));
    act(() => result.current.canvas.onSelectionChange({ nodes: [first], edges: [] }));

    act(() => result.current.inspector!.onPropertyEditSessionStart('description'));
    act(() => result.current.inspector!.onPropertyEditSessionStart('description'));
    act(() => result.current.inspector!.onPropertyChange({
      nodeId: first.id, field: 'description', oldValue: undefined, newValue: 'session change',
    }));
    act(() => result.current.inspector!.onPropertyEditSessionCancel('wrong-field'));
    act(() => result.current.inspector!.onPropertyEditSessionCancel('description'));
    act(() => result.current.inspector!.onPropertyEditSessionStart('label'));
    act(() => result.current.inspector!.onPropertyEditSessionCancel('label'));
    act(() => result.current.inspector!.onPropertyEditSessionStart('label'));
    act(() => result.current.inspector!.onPropertyEditSessionEnd('label'));
    act(() => result.current.inspector!.onToggleNodePin(first.id));

    if (edge) {
      act(() => result.current.canvas.onReconnectStart());
      act(() => result.current.canvas.onReconnectEnd(new MouseEvent('pointerup'), edge));
      act(() => result.current.canvas.onReconnectStart());
      act(() => result.current.canvas.onReconnect(edge, {
        source: edge.source, target: edge.target,
        sourceHandle: edge.sourceHandle ?? null, targetHandle: edge.targetHandle ?? null,
      }));
      act(() => result.current.canvas.onReconnectEnd(new MouseEvent('pointerup'), edge));
    }

    act(() => result.current.commandPalette.commands.find((command) => command.id === 'create-node')!
      .action({ invoker: null }));
    expect(result.current.authoring).not.toBeNull();
    act(() => result.current.authoring!.onCancel());
    expect(result.current.authoring).toBeNull();

    act(() => result.current.header.onHelp());
    act(() => result.current.help.onOpenWelcome());
    expect(result.current.welcome.isOpen).toBe(true);
    act(() => result.current.welcome.onRecover());
    act(() => result.current.welcome.onDiscardRecovery());
    act(() => result.current.header.onHelp());
    act(() => result.current.help.onOpenWelcome());
    act(() => result.current.welcome.onExample('not-a-bundled-example'));
    expect(result.current.guidanceAnnouncement).toContain('unavailable or invalid');
    act(() => result.current.header.onHelp());
    act(() => result.current.help.onClose());
    act(() => result.current.header.onAbout());
    act(() => result.current.about.onClose());

    act(() => result.current.inspector!.onApplyLayout());
    await waitFor(() => expect(result.current.canvas.isReflowing).toBe(false));
    act(() => result.current.workspace.onReset());
  });

  it('rejects every view mutation while an AI transaction is pending', async () => {
    const hook = renderHook(() => useEditorController());
    await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
    const first = hook.result.current.canvas.nodes[0];
    const edge = hook.result.current.canvas.edges[0];
    act(() => hook.result.current.commandPalette.commands.find((command) => command.id === 'create-node')!
      .action({ invoker: null }));
    expect(hook.result.current.authoring).not.toBeNull();

    llmChatBridge.mutationPending = true;
    hook.rerender();
    const originalName = hook.result.current.header.documentName;
    const originalDsl = hook.result.current.editor.dsl;
    act(() => hook.result.current.recovery.onRecover());
    act(() => hook.result.current.recovery.onDiscard());
    act(() => hook.result.current.header.onDocumentNameChange('blocked name'));
    expect(hook.result.current.header.onLoad(createBlankDocument())).toBe(false);
    act(() => hook.result.current.editor.onDslChange('service "blocked"'));
    act(() => hook.result.current.editor.onEditSessionStart());
    act(() => hook.result.current.editor.onDslTypeChange('mermaid'));
    act(() => hook.result.current.canvas.onNodesChange([{
      id: first.id, type: 'position', position: { x: 1, y: 1 },
    }]));
    act(() => hook.result.current.canvas.onNodeDragStart());
    act(() => hook.result.current.canvas.onNodeKeyboardMove(
      'ArrowLeft', false, new KeyboardEvent('keydown', { key: 'ArrowLeft' }),
    ));
    if (edge) {
      act(() => hook.result.current.canvas.onEdgesChange([{ id: edge.id, type: 'remove' }]));
      act(() => hook.result.current.canvas.onReconnect(edge, {
        source: edge.target, target: edge.source, sourceHandle: null, targetHandle: null,
      }));
    }
    act(() => hook.result.current.canvas.onLabelEdit(first.id, 'blocked'));
    act(() => hook.result.current.canvas.onReflow());
    act(() => hook.result.current.canvas.onUndo());
    act(() => hook.result.current.canvas.onRedo());
    act(() => hook.result.current.canvas.onConnect({
      source: first.id, target: first.id, sourceHandle: null, targetHandle: null,
    }));
    act(() => hook.result.current.canvas.onDeleteSelection());
    act(() => hook.result.current.inspector!.onDocumentSettingsChange(
      hook.result.current.inspector!.documentSettings,
    ));
    act(() => hook.result.current.inspector!.onPresetChange('layered'));
    act(() => hook.result.current.inspector!.onApplyLayout());
    act(() => hook.result.current.inspector!.onApplyFont(hook.result.current.inspector!.fontDraft));
    act(() => hook.result.current.inspector!.onPropertyChange({
      nodeId: first.id, field: 'label', oldValue: first.data.label, newValue: 'blocked',
    }));
    act(() => hook.result.current.inspector!.onAddProperty(first.id, 'blocked', 'value'));
    act(() => hook.result.current.inspector!.onRemoveProperty(first.id, 'blocked'));
    act(() => hook.result.current.inspector!.onPropertyEditSessionStart('label'));
    expect(hook.result.current.welcome.onOpenFile({ name: 'blank.coral.json', text: JSON.stringify(createBlankDocument()) })).toBe(false);
    expect(hook.result.current.header.onOpenFile({ name: 'a.coral', text: 'service "A"' })).toBe(false);
    act(() => hook.result.current.welcome.onRecover());
    act(() => hook.result.current.welcome.onDiscardRecovery());
    act(() => hook.result.current.welcome.onBlank(null));
    act(() => hook.result.current.welcome.onExample('code'));
    expect(hook.result.current.authoring!.onSubmitNode({ symbolId: 'flowchart-process', label: 'blocked' }))
      .toMatchObject({ ok: false });
    expect(hook.result.current.authoring!.onSubmitEdge({
      source: first.id, target: first.id,
    })).toMatchObject({ ok: false });
    expect(hook.result.current.header.documentName).toBe(originalName);
    expect(hook.result.current.editor.dsl).toBe(originalDsl);
  });

  it('covers dark-theme commands, shortcuts, connection, and property variants', async () => {
    window.localStorage.setItem('coral:user-preferences', JSON.stringify({ theme: 'dark' }));
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(1));
    expect(result.current.themeName).toBe('dark');
    const first = result.current.canvas.nodes[0];
    const second = result.current.canvas.nodes[1];

    act(() => result.current.canvas.onConnectStart({} as never, {
      nodeId: null, handleId: null, handleType: null,
    }));
    act(() => result.current.canvas.onConnectStart({} as never, {
      nodeId: first.id, handleId: null, handleType: 'target',
    }));
    const connection = {
      source: first.id, target: second.id, sourceHandle: null, targetHandle: null,
    };
    result.current.canvas.isValidConnection(connection);
    act(() => result.current.canvas.onConnect(connection));
    act(() => result.current.canvas.onConnectEnd());

    act(() => result.current.canvas.onSelectionChange({ nodes: [first], edges: [] }));
    act(() => result.current.inspector!.onPropertyEditSessionStart('description'));
    act(() => result.current.inspector!.onPropertyChange({
      nodeId: first.id, field: 'description', oldValue: undefined, newValue: 'first',
    }));
    act(() => result.current.inspector!.onPropertyChange({
      nodeId: first.id, field: 'description', oldValue: 'first', newValue: 'second',
    }));
    act(() => result.current.inspector!.onPropertyEditSessionEnd('wrong'));
    act(() => result.current.inspector!.onPropertyEditSessionEnd('description'));
    act(() => result.current.inspector!.onPropertyChange({
      nodeId: first.id, field: 'property', propertyKey: 'owner', oldValue: undefined, newValue: 'team',
    }));
    act(() => result.current.inspector!.onPropertyChange({
      nodeId: first.id, field: 'label', oldValue: first.data.label, newValue: 'Reprojected label',
    }));
    act(() => result.current.inspector!.onPropertyChange({
      nodeId: 'missing-node', field: 'label', oldValue: undefined, newValue: 'Missing',
    }));

    const key = (value: string, updates: KeyboardEventInit = {}) => new KeyboardEvent('keydown', {
      key: value, ctrlKey: true, bubbles: true, cancelable: true, ...updates,
    });
    act(() => document.dispatchEvent(key(',')));
    expect(result.current.preferences.isOpen).toBe(true);
    act(() => document.dispatchEvent(key(',')));
    expect(result.current.preferences.isOpen).toBe(false);
    act(() => document.dispatchEvent(key('e', { altKey: true })));
    expect(result.current.authoring?.kind).toBe('edge');
    act(() => result.current.authoring!.onCancel());
    act(() => document.dispatchEvent(key('l', { shiftKey: true })));
    await waitFor(() => expect(result.current.canvas.isReflowing).toBe(false));

    for (const id of ['format-mermaid', 'format-coral', 'notation-flowchart', 'notation-bpmn', 'notation-code']) {
      act(() => result.current.commandPalette.commands.find((command) => command.id === id)!.action());
    }
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
  });

  it('publishes valid empty source and reports a failed automatic layout without replacing geometry', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.editor.onDslChange(''));
    await waitFor(() => expect(result.current.canvas.nodes).toEqual([]), { timeout: 2000 });

    act(() => result.current.header.onLoad(cloneBundledExample('code')));
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    const priorIds = result.current.canvas.nodes.map((node) => node.id);
    layout.mockRejectedValueOnce(new Error('layout denied'));
    act(() => result.current.inspector!.onPresetChange('radial'));
    await waitFor(() => expect(result.current.editor.parseErrors.some((error) =>
      error.message.includes('Automatic layout failed'))).toBe(true));
    expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(priorIds);
  });

  it('carries the command-palette invoker through Properties open and clears it for selection opens', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.inspector).not.toBeNull());
    act(() => result.current.header.onToggleInspector());
    expect(result.current.inspector).toBeNull();
    const invoker = document.createElement('button');
    document.body.append(invoker);
    const command = result.current.commandPalette.commands.find((item) => item.id === 'toggle-inspector')!;
    expect(command.transfersFocus).not.toBe(true);
    act(() => command.action({ invoker }));
    expect(result.current.inspector?.restoreFocusTo).toBe(invoker);

    act(() => result.current.canvas.onSelectionChange({ nodes: [result.current.canvas.nodes[0]] }));
    expect(result.current.inspector?.restoreFocusTo).toBeNull();
    invoker.remove();
  });

  it('carries the palette invoker into every successor modal command', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    if (result.current.welcome.isOpen) act(() => result.current.welcome.onClose());
    const invoker = document.createElement('button');
    document.body.append(invoker);

    for (const id of ['preferences', 'welcome', 'help', 'about']) {
      const command = result.current.commandPalette.commands.find((item) => item.id === id)!;
      expect(command.transfersFocus).toBe(true);
      act(() => command.action({ invoker }));
      const successor = id === 'preferences' ? result.current.preferences
        : id === 'welcome' ? result.current.welcome
          : id === 'help' ? result.current.help : result.current.about;
      expect(successor.isOpen).toBe(true);
      expect(successor.restoreFocusTo).toBe(invoker);
    }

    invoker.remove();
  });

  it('exercises selection, connection, property, notation, and gutter boundaries', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(1));
    const first = result.current.canvas.nodes[0];

    act(() => result.current.canvas.onSelectionChange({ nodes: [first] }));
    expect(result.current.inspector?.selectedNode?.id).toBe(first.id);
    act(() => result.current.canvas.onNodesChange([{ id: first.id, type: 'select', selected: true }]));
    await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === first.id)?.selected).toBe(true));
    act(() => result.current.inspector?.onDeselectNode());
    await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === first.id)?.selected).toBe(false));
    expect(result.current.inspector?.selectionSummary.kind).toBe('none');
    act(() => result.current.canvas.onSelectionChange({ nodes: [] }));
    expect(result.current.inspector?.selectedNode).toBeNull();

    expect(result.current.canvas.isValidConnection({
      source: null,
      target: null,
      sourceHandle: null,
      targetHandle: null,
    })).toBe(false);
    act(() => result.current.canvas.onConnect({
      source: null,
      target: null,
      sourceHandle: null,
      targetHandle: null,
    }));
    act(() => result.current.canvas.onConnectStart({} as never, {
      nodeId: first.id,
      handleId: 'out',
      handleType: 'source',
    }));
    act(() => result.current.canvas.onConnectEnd());

    act(() => result.current.inspector?.onAddProperty(first.id, 'owner', 'team'));
    await waitFor(() => expect(result.current.canvas.nodes[0].data.properties?.owner).toBe('team'));
    act(() => result.current.inspector?.onRemoveProperty(first.id, 'owner'));
    await waitFor(() => expect(result.current.canvas.nodes[0].data.properties?.owner).toBeUndefined());
    act(() => result.current.inspector?.onPropertyChange({
      nodeId: first.id,
      field: 'description',
      oldValue: undefined,
      newValue: 'described',
    }));
    await waitFor(() => expect(result.current.canvas.nodes[0].data.description).toBe('described'));

    const architecture = result.current.commandPalette.commands.find(
      (command) => command.id === 'notation-arch',
    )!;
    act(() => architecture.action());
    expect(result.current.canvas.notation).toBe('architecture');

    act(() => result.current.workspace.onSourceWidthChange(45));
    expect(result.current.editorWidthPct).toBe(45);
    expect(JSON.parse(window.localStorage.getItem('coral.workspace.v1') ?? '{}'))
      .toMatchObject({ sourceWidthPercent: 45 });
  });

  it('leaves the live document unchanged when a modern recovery snapshot is malformed', async () => {
    window.localStorage.setItem('coral-diagram-recovery', JSON.stringify({
      timestamp: Date.now(),
      documentName: 'Broken recovery',
      dslType: 'mermaid',
      dsl: 'graph TD\n  broken[Broken recovery text]',
      notation: 'flowchart',
      nodePositions: {},
      document: {},
    }));
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => {
      expect(result.current.canvas.nodes.length).toBeGreaterThan(0);
      expect(result.current.recovery.hasData).toBe(true);
    });
    const beforeDsl = result.current.editor.dsl;
    const beforeNodeIds = result.current.canvas.nodes.map((node) => node.id);

    act(() => result.current.recovery.onRecover());

    expect(alert).not.toHaveBeenCalled();
    expect(result.current.editor.dsl).toBe(beforeDsl);
    expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(beforeNodeIds);
    expect(result.current.recovery.hasData).toBe(true);
    expect(result.current.guidanceAnnouncement).toBe(
      'The selected document is invalid and was not opened. Your current work is unchanged.',
    );
    alert.mockRestore();
  });

  it('keeps modern recovered work dirty, confirm-protected, and recoverable after remount', async () => {
    const recovered = cloneBundledExample('code');
    window.localStorage.setItem('coral-diagram-recovery', JSON.stringify({
      timestamp: Date.now(), documentName: recovered.metadata.name,
      dslType: 'coral', dsl: 'function "Recovered function"', notation: 'code',
      nodePositions: recovered.nodePositions ?? {}, document: recovered,
    }));
    const confirm = vi.mocked(window.confirm).mockReturnValue(true);
    const first = renderHook(() => useEditorController());
    await waitFor(() => expect(first.result.current.recovery.hasData).toBe(true));
    act(() => first.result.current.recovery.onRecover());
    expect(first.result.current.editor.dsl).not.toContain('Recovered function');
    expect(first.result.current.editor.isDslReadOnly).toBe(true);

    confirm.mockReturnValue(false);
    let accepted = true;
    act(() => { accepted = first.result.current.header.onLoad(cloneBundledExample('sketch')) as unknown as boolean; });
    expect(accepted).toBe(false);
    expect(confirm).toHaveBeenCalled();
    first.unmount();

    const restarted = renderHook(() => useEditorController());
    await waitFor(() => expect(restarted.result.current.recovery.hasData).toBe(true));
  });

  it('routes legacy recovery through the same refusal boundary and retains it', async () => {
    window.localStorage.setItem('coral-diagram-recovery', JSON.stringify({
      timestamp: Date.now(), documentName: 'Legacy work', dslType: 'coral',
      dsl: 'service "Legacy"', notation: 'flowchart', nodePositions: {},
    }));
    const confirm = vi.mocked(window.confirm).mockReturnValue(false);
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
    act(() => result.current.editor.onDslChange('service "Current unsaved"'));
    // Settle the unsaved edit first so recovery reaches its confirmation.
    await waitFor(() => expect(result.current.canvas.mutationsDisabled).toBe(false));
    const before = result.current.editor.dsl;

    act(() => result.current.recovery.onRecover());

    expect(confirm).toHaveBeenCalledOnce();
    expect(result.current.editor.dsl).toBe(before);
    expect(result.current.recovery.hasData).toBe(true);
  });

  it('refuses legacy recovery with the update-owner copy while a source edit is pending', async () => {
    window.localStorage.setItem('coral-diagram-recovery', JSON.stringify({
      timestamp: Date.now(), documentName: 'Legacy work', dslType: 'coral',
      dsl: 'service "Legacy"', notation: 'flowchart', nodePositions: {},
    }));
    const confirm = vi.mocked(window.confirm).mockReturnValue(false);
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
    act(() => result.current.editor.onDslChange('service "Current unsaved"'));
    const before = result.current.editor.dsl;

    act(() => result.current.recovery.onRecover());

    expect(confirm).not.toHaveBeenCalled();
    expect(result.current.editor.dsl).toBe(before);
    expect(result.current.recovery.hasData).toBe(true);
    expect(result.current.guidanceAnnouncement).toBe(
      'Finish the current diagram update before opening another document.',
    );
  });

  it('keeps a new GraphIR interchange document authoritative after a settled Coral edit', async () => {
    const { result } = renderHook(() => useEditorController());
    act(() => { result.current.header.onOpenFile({
      name: 'source.coral', text: '@diagram flowchart\nstart process\n',
    }); });
    await waitFor(() => {
      expect(result.current.editor.dslType).toBe('coral');
      expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['start']);
      expect(result.current.canvas.isLoading).toBe(false);
    });
    act(() => result.current.editor.onDslChange('@diagram flowchart\nsettled process\n'));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['settled']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    expect(saveInAct(result).content).toMatchObject({
      format: 'dsl', dslType: 'coral', text: '@diagram flowchart\nsettled process\n',
    });
    let accepted = false;
    act(() => { accepted = result.current.header.onLoad({
        schemaVersion: '1.0.0',
        metadata: {
          name: 'Replacement',
          created: '2026-01-01T00:00:00.000Z',
          modified: '2026-01-01T00:00:00.000Z',
        },
        content: {
          format: 'graph-ir',
          graphIR: {
            version: '3.0.0', id: 'replacement',
            nodes: [{ id: 'replacement', type: 'service', label: 'Replacement' }],
            edges: [],
          },
        },
        settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    }) as unknown as boolean; });
    expect(accepted).toBe(true);
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['replacement']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    expect(result.current.editor.isDslReadOnly).toBe(true);

    act(() => result.current.inspector?.onPropertyChange({
      nodeId: 'replacement',
      field: 'label',
      oldValue: 'Replacement',
      newValue: 'Replacement edited',
    }));
    await waitFor(() => expect(result.current.editor.dsl).toContain('Replacement edited'));
    expect(result.current.editor.dsl).not.toContain('settled process');
    expect(saveInAct(result).content).toMatchObject({
      format: 'graph-ir', graphIR: { id: 'replacement' },
    });
  });

  it('refuses document replacement while a source edit is pending', async () => {
    const { result } = renderHook(() => useEditorController());
    const initial = '@diagram flowchart\nseed process\n';
    act(() => { result.current.header.onOpenFile({ name: 'seed.coral', text: initial }); });
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['seed']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));

    const pending = '@diagram flowchart\npending =';
    act(() => result.current.editor.onDslChange(pending));
    let accepted = true;
    act(() => { accepted = result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Replacement',
        created: '2026-01-01T00:00:00.000Z',
        modified: '2026-01-01T00:00:00.000Z',
      },
      content: {
        format: 'graph-ir',
        graphIR: {
          version: '3.0.0', id: 'replacement',
          nodes: [{ id: 'replacement', type: 'service', label: 'Replacement' }],
          edges: [],
        },
      },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    }) as unknown as boolean; });
    expect(accepted).toBe(false);
    expect(result.current.editor.dsl).toBe(pending);
    expect(result.current.header.onSave().content).toEqual({ format: 'dsl', dslType: 'coral', text: pending });
    expect(result.current.guidanceAnnouncement).toBe(
      'Finish the current diagram update before opening another document.',
    );
  });

  it('does not let an older parse retire a newer text-origin claim', async () => {
    const { result } = renderHook(() => useEditorController());
    const original = '@diagram flowchart\nseed process\n';
    act(() => { result.current.header.onOpenFile({ name: 'seed.coral', text: original }); });
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['seed']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));

    let resolveLayout!: (value: any) => void;
    const pendingLayout = new Promise<any>((resolve) => { resolveLayout = resolve; });
    layout.mockImplementationOnce(() => pendingLayout);
    const callsBeforeEdit = layout.mock.calls.length;
    // Fake timers are stepped one at a time instead of sleeping for nominal
    // debounce lengths (TR94-F13).
    const step = async (until: () => boolean, label: string) => {
      for (let index = 0; index < 100 && !until(); index += 1) {
        await act(async () => { await vi.advanceTimersToNextTimerAsync(); });
      }
      expect({ label, reached: until() }).toEqual({ label, reached: true });
    };
    const firstText = '@diagram flowchart\nseed process\nfirst process\nseed -> first\n';
    const newerText = '@diagram flowchart\nnewer =\n';
    vi.useFakeTimers();
    try {
      act(() => result.current.editor.onDslChange(firstText));
      await step(() => layout.mock.calls.length > callsBeforeEdit, 'first parse lays out');

      act(() => result.current.editor.onDslChange(newerText));
      await act(async () => {
        resolveLayout({ children: [], edges: [] });
        await pendingLayout;
      });
      // The older parse has finished while the newer text is still pending.
      const nodeId = result.current.canvas.nodes[0].id;
      act(() => result.current.inspector?.onPropertyChange({
        nodeId,
        field: 'description',
        oldValue: undefined,
        newValue: 'visual edit during newer parse',
      }));

      await step(() => result.current.editor.parseErrors.length > 0, 'newer text reports its errors');
      // Drain every remaining timer, including any print-back the edit armed.
      for (let index = 0; index < 5; index += 1) {
        await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      }
    } finally {
      vi.useRealTimers();
    }
    expect(result.current.editor.dsl).toBe(newerText);
    expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['seed']);
    expect(result.current.header.onSave().content).toEqual({ format: 'dsl', dslType: 'coral', text: newerText });
  });

  it('creates and deletes a node as complete keyboard content history', async () => {
    const { result } = renderHook(() => useEditorController());
    const source = '@diagram flowchart\n// Keep this comment\nseed process\n';
    act(() => { result.current.header.onOpenFile({ name: 'keyboard.coral', text: source }); });
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['seed']));
    await quiesce(result);
    const beforeCount = result.current.canvas.nodes.length;
    const create = result.current.commandPalette.commands.find((command) => command.id === 'create-node')!;

    act(() => create.action({ invoker: null }));
    expect(result.current.authoring?.kind).toBe('node');
    let submitted!: ReturnType<NonNullable<typeof result.current.authoring>['onSubmitNode']>;
    act(() => {
      submitted = result.current.authoring!.onSubmitNode({
        id: 'keyboardNode', type: 'process', label: 'Keyboard node',
      });
    });
    expect(submitted).toEqual({ ok: true });
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(beforeCount + 1));
    expect(result.current.editor.dsl).toContain('Keyboard node');
    expect(result.current.editor.dsl).toContain('// Keep this comment');
    expect(result.current.canvas.focusRequest).toMatchObject({ kind: 'node', id: 'keyboardNode' });
    expect(result.current.guidanceAnnouncement).toMatch(/created node keyboardNode/i);

    await quiesce(result);
    act(() => result.current.canvas.onNodesChange([{ id: 'keyboardNode', type: 'select', selected: true }]));
    act(() => result.current.canvas.onDeleteSelection());
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(beforeCount));
    expect(result.current.editor.dsl).not.toContain('keyboardNode');
    expect(result.current.editor.dsl).toContain('// Keep this comment');

    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(beforeCount + 1));
    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(beforeCount));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(beforeCount + 1));
    expect(result.current.header.onSave().content).toEqual({
      format: 'dsl', dslType: 'coral', text: result.current.editor.dsl,
    });
  });

  it('lets a later parse replace an authoring success announcement', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'create-node')!
      .action({ invoker: null }));
    act(() => {
      result.current.authoring!.onSubmitNode({ symbolId: 'flowchart-process', label: 'Keyboard node' });
    });
    await waitFor(() => expect(result.current.canvas.statusText).toMatch(/created.*keyboard node/i));

    act(() => result.current.editor.onDslChange('flowchart TD\n    replacement[Replacement]'));
    await waitFor(() => expect(result.current.canvas.statusText).toMatch(/parsed: 1 node/i), { timeout: 2000 });
  });

  it('creates edges through the common policy and keeps failures history-free', async () => {
    const { result } = renderHook(() => useEditorController());
    const source = '@diagram flowchart\n// Keep this comment\nalpha process\nbeta process\n';
    act(() => { result.current.header.onOpenFile({ name: 'edges.coral', text: source }); });
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['alpha', 'beta']));
    await quiesce(result);

    const create = result.current.commandPalette.commands.find((command) => command.id === 'create-edge')!;
    act(() => create.action({ invoker: null }));
    const historyBefore = result.current.canvas.undoCount;
    const failed = result.current.authoring!.onSubmitEdge({
      sourceId: 'alpha', targetId: 'missing',
    });
    expect(failed).toMatchObject({ ok: false, error: expect.stringMatching(/endpoints must be declared/i) });
    expect(result.current.canvas.edges).toHaveLength(0);
    expect(result.current.editor.dsl).toBe(source);
    expect(result.current.canvas.undoCount).toBe(historyBefore);

    let accepted!: { ok: true } | { ok: false; error: string };
    act(() => {
      accepted = result.current.authoring!.onSubmitEdge({
        id: 'alphaBeta', sourceId: 'alpha', targetId: 'beta',
      });
    });
    expect(accepted).toEqual({ ok: true });
    await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
    expect(result.current.editor.dsl).toContain('alphaBeta = alpha -> beta');
    expect(result.current.editor.dsl).toContain('// Keep this comment');
    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.canvas.edges).toHaveLength(0));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['alphaBeta']));
    expect(result.current.header.onSave().content).toEqual({
      format: 'dsl', dslType: 'coral', text: result.current.editor.dsl,
    });
  });

  it('revalidates live endpoints when the document changes under an open edge dialog', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(1));
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'create-edge')!
      .action({ invoker: null }));
    expect(result.current.authoring?.kind).toBe('edge');

    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Replacement', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'replacement',
        nodes: [{ id: 'only', type: 'process', symbol: 'flowchart-process' }],
        edges: [],
      } },
      settings: { notation: 'flowchart', layout: { algorithm: 'layered', direction: 'DOWN' } },
    }));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['only']));
    const undoBefore = result.current.canvas.undoCount;

    const rejected = result.current.authoring!.onSubmitEdge({
      sourceId: 'A', sourcePortId: 'out', targetId: 'B', targetPortId: 'in',
    });

    expect(rejected).toMatchObject({ ok: false, error: expect.stringMatching(/source.*no longer/i) });
    expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['only']);
    expect(result.current.canvas.edges).toHaveLength(0);
    expect(result.current.canvas.undoCount).toBe(undoBefore);
    expect(result.current.authoring?.kind).toBe('edge');
  });

  it('canonicalizes a suffixed inout pointer handle through the common commit policy', async () => {
    const { result } = renderHook(() => useEditorController());
    const source = '@diagram architecture\nnote service {\n  link port [direction: inout]\n}\n' +
      'service service\n';
    act(() => { result.current.header.onOpenFile({ name: 'inout.coral', text: source }); });
    await waitFor(() => {
      expect(result.current.canvas.notation).toBe('architecture');
      expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['note', 'service']);
    });
    await quiesce(result);

    const pointerConnection = {
      source: 'note', sourceHandle: 'link-out', target: 'service', targetHandle: 'in',
    };
    expect(result.current.canvas.isValidConnection(pointerConnection)).toBe(true);
    act(() => result.current.canvas.onConnect(pointerConnection));
    await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));

    const savedEdge = () => {
      const content = result.current.header.onSave().content;
      if (content.format !== 'dsl') throw new Error('Expected editable Coral source');
      expect(content.dslType).toBe('coral');
      return parseCoralDSL(content.text).edges[0];
    };
    expect([savedEdge()]).toEqual([
      expect.objectContaining({
        source: 'note', sourcePort: 'link', target: 'service', targetPort: 'in',
      }),
    ]);
    expect(result.current.editor.dsl).toContain('note:link -> service:in');
    expect(result.current.canvas.edges[0].sourceHandle).toBe('link-out');

    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.canvas.edges).toHaveLength(0));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
    expect(result.current.canvas.edges[0].sourceHandle).toBe('link-out');
    expect(savedEdge()?.sourcePort).toBe('link');
  });

  it('preserves opaque GraphIR port IDs through structural history without editable Coral', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Opaque ports', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'opaque-ports',
        nodes: [
          { id: 'a', type: 'annotation', symbol: 'arch-annotation', ports: [{ id: 'link-out', side: 'EAST' }] },
          { id: 'b', type: 'annotation', symbol: 'arch-annotation', ports: [{ id: 'link-in', side: 'WEST' }] },
        ],
        edges: [{ id: 'opaque', source: 'a', sourcePort: 'link-out', target: 'b', targetPort: 'link-in' }],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
    }));
    await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
    const ports = () => {
      const content = saveInAct(result).content;
      if (content.format !== 'graph-ir') throw new Error('Expected GraphIR interchange');
      expect(content.graphIR.nodes.find((node) => node.id === 'a')?.ports?.map((port) => port.id))
        .toEqual(['link-out']);
      expect(content.graphIR.nodes.find((node) => node.id === 'b')?.ports?.map((port) => port.id))
        .toEqual(['link-in']);
      return content.graphIR.edges[0];
    };
    expect(result.current.editor.isDslReadOnly).toBe(true);
    expect(ports()).toMatchObject({ sourcePort: 'link-out', targetPort: 'link-in' });

    act(() => result.current.commandPalette.commands.find((command) => command.id === 'create-node')!
      .action({ invoker: null }));
    act(() => { result.current.authoring!.onSubmitNode({ symbolId: 'arch-service', label: 'Added' }); });
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
    expect(ports()).toMatchObject({ sourcePort: 'link-out', targetPort: 'link-in' });

    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
    expect(ports()).toMatchObject({ sourcePort: 'link-out', targetPort: 'link-in' });
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
    expect(ports()).toMatchObject({ sourcePort: 'link-out', targetPort: 'link-in' });

    const preview = result.current.editor.dsl;
    act(() => result.current.editor.onDslChange('@diagram architecture\na annotation\n'));
    expect(result.current.editor.dsl).toBe(preview);
    expect(result.current.canvas.edges).toHaveLength(1);
    expect(ports()).toMatchObject({ sourcePort: 'link-out', targetPort: 'link-in' });
  });

  it('restores the conversion diagnostics owned by each structural history entry', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const conversionCount = () => result.current.editor.diagnosticEntries
      .filter((entry) => entry.sourceLabel === 'Source format').length;
    expect(conversionCount()).toBe(0);

    act(() => result.current.commandPalette.commands.find((command) => command.id === 'create-node')!
      .action({ invoker: null }));
    act(() => {
      result.current.authoring!.onSubmitNode({ symbolId: 'flowchart-process', label: 'Lossy node' });
    });
    await waitFor(() => expect(conversionCount()).toBeGreaterThan(0));
    const afterCreate = conversionCount();

    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(conversionCount()).toBe(0));
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(conversionCount()).toBe(afterCreate));
  });

  it('preserves authoritative waypoint identity and type across structural undo/redo', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Waypoints', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'waypoints',
        nodes: [
          { id: 'a', type: 'service', symbol: 'arch-service', position: { x: 0, y: 0 }, ports: [{ id: 'out', side: 'EAST' }] },
          { id: 'b', type: 'database', symbol: 'arch-database', position: { x: 200, y: 0 }, ports: [{ id: 'query', side: 'WEST' }] },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'query' }],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
      edgeRouting: { e: {
        bendPoints: [{ x: 175, y: 150 }], isPinned: true,
        waypoints: [{ id: 'opaque-smooth', x: 175, y: 150, type: 'smooth' }],
      } },
    }));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));

    act(() => result.current.commandPalette.commands.find((command) => command.id === 'create-node')!
      .action({ invoker: null }));
    act(() => {
      result.current.authoring!.onSubmitNode({ symbolId: 'arch-service', label: 'Added' });
    });
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
    expect(result.current.header.onSave().edgeRouting?.e?.waypoints).toEqual([
      { id: 'opaque-smooth', x: 175, y: 150, type: 'smooth' },
    ]);

    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
    expect(result.current.header.onSave().edgeRouting?.e?.waypoints).toEqual([
      { id: 'opaque-smooth', x: 175, y: 150, type: 'smooth' },
    ]);
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
    expect(result.current.header.onSave().edgeRouting?.e?.waypoints).toEqual([
      { id: 'opaque-smooth', x: 175, y: 150, type: 'smooth' },
    ]);
  });

  it('keeps a cancelled waypoint drag clean and publishes a completed drag to recovery', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Waypoint gesture', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'waypoint-gesture',
        nodes: [
          { id: 'a', type: 'service', position: { x: 0, y: 0 } },
          { id: 'b', type: 'database', position: { x: 200, y: 0 } },
          { id: 'c', type: 'queue', position: { x: 400, y: 0 } },
        ],
        edges: [
          { id: 'e', source: 'a', target: 'b' },
          { id: 'unaffected', source: 'b', target: 'c' },
        ],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
      edgeRouting: { e: {
        bendPoints: [{ x: 175, y: 150 }], isPinned: true,
        waypoints: [{ id: 'gesture-point', x: 175, y: 150, type: 'corner' }],
      }, unaffected: { bendPoints: [{ x: 390, y: 150 }], isPinned: true } },
    }));
    await waitFor(() => expect(result.current.canvas.edges[0]?.data?.waypoints).toHaveLength(1));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    const unrelatedRoute = structuredClone(result.current.canvas.edges.find((edge) => edge.id === 'unaffected')?.data?.routedPath);
    expect(unrelatedRoute).toBeDefined();
    act(() => { result.current.header.onSave(); });
    expect(result.current.header.isDirty).toBe(false);
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cancelled-waypoint');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!
      .action({ invoker: null }));
    const baselineSvg = await (createObjectUrl.mock.calls[0][0] as Blob).text();

    const gesture = () => result.current.canvas.edges[0].data as any;
    let cancelledEpoch: number | undefined;
    act(() => { cancelledEpoch = gesture().onWaypointDragStart('e', 'gesture-point'); });
    act(() => gesture().onWaypointDrag('e', 'gesture-point', { x: 200, y: 140 }, cancelledEpoch));
    act(() => gesture().onWaypointDragCancel('e', 'gesture-point', cancelledEpoch));

    expect(gesture().waypoints).toEqual([
      { id: 'gesture-point', x: 175, y: 150, type: 'corner' },
    ]);
    expect(result.current.header.isDirty).toBe(false);
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!
      .action({ invoker: null }));
    expect(result.current.rasterExportError).toBeNull();
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    const cancelledSvg = await (createObjectUrl.mock.calls[1][0] as Blob).text();
    expect(cancelledSvg).toBe(baselineSvg);
    expect(result.current.canvas.edges.find((edge) => edge.id === 'unaffected')?.data?.routedPath).toEqual(unrelatedRoute);

    let noOpEpoch: number | undefined;
    act(() => { noOpEpoch = gesture().onWaypointDragStart('e', 'gesture-point'); });
    act(() => gesture().onWaypointDrag('e', 'gesture-point', { x: 190, y: 180 }, noOpEpoch));
    act(() => gesture().onWaypointDragEnd('e', 'gesture-point', { x: 175, y: 150 }, noOpEpoch));
    expect(gesture().waypoints).toEqual([
      { id: 'gesture-point', x: 175, y: 150, type: 'corner' },
    ]);
    expect(result.current.header.isDirty).toBe(false);
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!
      .action({ invoker: null }));
    expect(createObjectUrl).toHaveBeenCalledTimes(3);
    const noOpSvg = await (createObjectUrl.mock.calls[2][0] as Blob).text();
    expect(noOpSvg).toBe(baselineSvg);
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
    click.mockRestore();

    let completedEpoch: number | undefined;
    act(() => { completedEpoch = gesture().onWaypointDragStart('e', 'gesture-point'); });
    act(() => gesture().onWaypointDrag('e', 'gesture-point', { x: 180, y: 160 }, completedEpoch));
    act(() => gesture().onWaypointDragEnd('e', 'gesture-point', { x: 180, y: 160 }, completedEpoch));

    await waitFor(() => expect(result.current.header.isDirty).toBe(true));
    await waitFor(() => expect(result.current.editor.dsl).toContain('(180, 160)'));
    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(gesture().waypoints).toEqual([
      { id: 'gesture-point', x: 175, y: 150, type: 'corner' },
    ]));
    let restoredEpoch: number | undefined;
    act(() => { restoredEpoch = gesture().onWaypointDragStart('e', 'gesture-point'); });
    expect(restoredEpoch).toEqual(expect.any(Number));
    act(() => gesture().onWaypointDragCancel('e', 'gesture-point', restoredEpoch));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('coral-diagram-recovery') ?? '{}')
      .document?.edgeRouting?.e?.waypoints).toEqual([
      { id: 'gesture-point', x: 175, y: 150, type: 'corner' },
    ]), { timeout: 2500 });
  });

  it('preserves relative route intent when editable absolute waypoints are synchronized', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Mixed route', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'mixed-route',
        nodes: [
          { id: 'a', type: 'service', symbol: 'arch-service', position: { x: 0, y: 0 } },
          { id: 'b', type: 'database', symbol: 'arch-database', position: { x: 200, y: 0 } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b', routeIntent: { waypoints: [
          { id: 'absolute', placement: { kind: 'absolute', position: { x: 170, y: 160 } } },
          { id: 'relative', placement: {
            kind: 'relative', anchor: { kind: 'target' }, offset: { x: -20, y: 10 },
          } },
        ] } }],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
      edgeRouting: { e: {
        bendPoints: [{ x: 170, y: 160 }], isPinned: true,
        waypoints: [{ id: 'absolute', x: 170, y: 160, type: 'corner' }],
      } },
    }));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));

    const edge = result.current.header.onSave().content.graphIR.edges[0];
    expect(edge.routeIntent?.waypoints).toEqual([
      { id: 'absolute', placement: { kind: 'absolute', position: { x: 170, y: 160 } } },
      { id: 'relative', placement: {
        kind: 'relative', anchor: { kind: 'target' }, offset: { x: -20, y: 10 },
      } },
    ]);
    expect(edge.routingPoints).toBeUndefined();

    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:verified-route');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await waitFor(() => expect(result.current.canvas.edges[0]?.data?.routedPath).toBeDefined());
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!.action({ invoker: null }));
    expect(result.current.rasterExportError).toBeNull();
    expect(createObjectUrl).toHaveBeenCalledOnce();

    act(() => result.current.canvas.onNodesChange([{
      id: 'a', type: 'position', position: { x: 40, y: 20 },
    }]));
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!.action({ invoker: null }));
    await waitFor(() => expect(result.current.rasterExportError).toContain('current source'));
    expect(createObjectUrl).toHaveBeenCalledOnce();

    await waitFor(() => expect(result.current.editor.dsl).toContain('@ (40, 20)'));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!.action({ invoker: null }));
    await waitFor(() => expect(result.current.rasterExportError).toBeNull());
    expect(createObjectUrl).toHaveBeenCalledTimes(2);

    act(() => result.current.commandPalette.commands.find((command) => command.id === 'create-node')!
      .action({ invoker: null }));
    act(() => result.current.authoring!.onSubmitNode({ symbolId: 'arch-service', label: 'Added' }));
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!.action({ invoker: null }));
    await waitFor(() => expect(result.current.rasterExportError).toContain('current source'));
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!.action({ invoker: null }));
    await waitFor(() => expect(result.current.rasterExportError).toBeNull());
    expect(createObjectUrl).toHaveBeenCalledTimes(3);

    act(() => result.current.canvas.onSelectionChange({ nodes: [result.current.canvas.nodes[0]], edges: [] }));
    const fontDraft = result.current.inspector!.fontDraft;
    act(() => result.current.inspector!.onApplyFont({
      ...fontDraft,
      default: { ...fontDraft.default, size: (fontDraft.default.size ?? 12) + 1 },
    }));
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!.action({ invoker: null }));
    expect(result.current.rasterExportError).toContain('current source');
    expect(createObjectUrl).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    expect(result.current.canvas.sceneError028).toBeUndefined();
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!.action({ invoker: null }));
    expect(result.current.rasterExportError).toBeNull();
    expect(createObjectUrl).toHaveBeenCalledTimes(4);
    click.mockRestore();
    revokeObjectUrl.mockRestore();
    createObjectUrl.mockRestore();
  });

  it('keeps current authored source stable across unrelated re-renders', async () => {
    const { result } = renderHook(() => useEditorController());
    const typed = '@diagram architecture\nalpha service as "Alpha"\nbeta database as "Beta"\nalpha -> beta\n';
    act(() => { result.current.header.onOpenFile({
      name: 'pair.coral', text: '@diagram architecture\nalpha service\nbeta database\nalpha -> beta\n',
    }); });
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['alpha', 'beta']));
    act(() => result.current.editor.onDslChange(typed));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['alpha', 'beta']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });
    const layouts = layout.mock.calls.length;
    for (let toggle = 0; toggle < 4; toggle += 1) {
      act(() => result.current.header.onToggleCommandPalette());
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    }
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });
    expect(result.current.editor.dsl).toBe(typed);
    expect(layout.mock.calls.length).toBe(layouts);
    expect(saveInAct(result).content).toMatchObject({
      format: 'dsl', dslType: 'coral', text: typed,
    });
  });

  const loadPlainPair = async (result: { current: ReturnType<typeof useEditorController> }) => {
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: { name: 'Pair', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'pair',
        nodes: [
          { id: 'a', type: 'service', symbol: 'arch-service', position: { x: 0, y: 0 } },
          { id: 'b', type: 'database', symbol: 'arch-database', position: { x: 200, y: 0 } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
    }));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });
  };
  const loadViaPair = async (result: { current: ReturnType<typeof useEditorController> }) => {
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: { name: 'Via pair', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'via-pair',
        nodes: [
          { id: 'a', type: 'service', symbol: 'arch-service' },
          { id: 'b', type: 'database', symbol: 'arch-database' },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b', routeIntent: { waypoints: [
          { id: 'w', placement: { kind: 'absolute', position: { x: 180, y: -40 } } },
        ] } }],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
    }));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });
  };
  const measure = (result: { current: ReturnType<typeof useEditorController> }, size: number) => act(() =>
    result.current.canvas.onNodesChange([{ id: 'a', type: 'dimensions', dimensions: { width: size, height: 60 } }]));

  it('schedules no diagram-to-text sync for display-only measurement or selection', async () => {
    const { result } = renderHook(() => useEditorController());
    await loadPlainPair(result);
    const timers = vi.spyOn(window, 'setTimeout');
    try {
      measure(result, 151);
      act(() => result.current.canvas.onNodesChange([{ id: 'b', type: 'select', selected: true }]));
      expect(timers.mock.calls.filter(([, delay]) => delay === 500)).toHaveLength(0);
    } finally {
      timers.mockRestore();
    }
  });

  it('keeps a pending real move on its original debounce while measurement continues', async () => {
    const { result } = renderHook(() => useEditorController());
    await loadPlainPair(result);
    act(() => result.current.canvas.onNodesChange([{ id: 'a', type: 'position', position: { x: 40, y: 20 } }]));
    for (let tick = 1; tick <= 4; tick += 1) {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });
      measure(result, 150 + tick);
    }
    // ~800 ms after the move: synced on the 500 ms schedule, not 500 ms after the last measurement.
    expect(result.current.editor.dsl).toContain('@ (40, 20)');
  });

  it('does not let a skip armed during a text-origin publication swallow a later label edit', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onOpenFile({ name: 'pair.coral',
      text: '@diagram architecture\napi service as "API"\ndb database as "DB"\napi -> db' }));
    await waitFor(() => expect(result.current.editor.dslType).toBe('coral'));
    act(() => result.current.editor.onDslChange('@diagram architecture\napi service as "API"\ndb database as "DB updated"\napi -> db'));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['api', 'db']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });
    act(() => result.current.canvas.onLabelEdit('api', 'API v2'));
    await waitFor(() => expect(result.current.editor.dsl).toContain('api service as "API v2"'), { timeout: 2000 });
  });

  const exportAvailability = (result: { current: ReturnType<typeof useEditorController> }) => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:availability');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!
        .action({ invoker: null }));
      return result.current.rasterExportError;
    } finally {
      click.mockRestore();
      revokeObjectUrl.mockRestore();
      createObjectUrl.mockRestore();
    }
  };

  it('does not relayout again when the drag-end debounce reprints the in-flight projection', async () => {
    const { result } = renderHook(() => useEditorController());
    await loadViaPair(result);
    let resolveSlow!: () => void;
    layout.mockImplementationOnce((graph: any) => new Promise((resolve) => {
      resolveSlow = () => resolve({
        ...graph,
        children: mockLayoutChildren(graph).map((child: any) => ({ ...child, y: 0 })),
        edges: graph.edges ?? [],
      });
    }));
    const layouts = layout.mock.calls.length;
    act(() => result.current.canvas.onNodeDragStart());
    act(() => result.current.canvas.onNodesChange([{ id: 'a', type: 'position', position: { x: 40, y: 20 }, dragging: true }]));
    act(() => result.current.canvas.onNodesChange([{ id: 'a', type: 'position', position: { x: 40, y: 20 }, dragging: false }]));
    await waitFor(() => expect(result.current.editor.dsl).toContain('@ (40, 20)'));
    await waitFor(() => expect(layout.mock.calls.length).toBe(layouts + 1));
    const dsl = result.current.editor.dsl;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });
    expect(layout.mock.calls.length).toBe(layouts + 1);
    expect(result.current.editor.dsl).toBe(dsl);
    await act(async () => { resolveSlow(); await Promise.resolve(); });
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    await waitFor(() => expect(exportAvailability(result)).toBeNull());
  });

  it('resolves a spatial edit that leaves the projection unchanged', async () => {
    const { result } = renderHook(() => useEditorController());
    await loadViaPair(result);
    const node = result.current.canvas.nodes.find((candidate) => candidate.id === 'a')!;
    act(() => result.current.canvas.onNodesChange([{ id: 'a', type: 'position', position: { ...node.position } }]));
    expect(exportAvailability(result)).toContain('current source');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    await waitFor(() => expect(exportAvailability(result)).toBeNull());
  });

  it('publishes a via Reflow without a second source revision when the projection is unchanged', async () => {
    const { result } = renderHook(() => useEditorController());
    await loadViaPair(result);
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:via-reflow');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      const dsl = result.current.editor.dsl;
      const layouts = layout.mock.calls.length;
      act(() => result.current.canvas.onReflow());
      await waitFor(() => expect(result.current.canvas.isReflowing).toBe(false));
      const reflowLayouts = layout.mock.calls.length;
      expect(reflowLayouts).toBeGreaterThan(layouts);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1200)); });
      expect(layout.mock.calls.length).toBe(reflowLayouts);
      expect(result.current.editor.dsl).toBe(dsl);
      act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!
        .action({ invoker: null }));
      expect(result.current.rasterExportError).toBeNull();
      expect(createObjectUrl).toHaveBeenCalledOnce();
    } finally {
      click.mockRestore();
      revokeObjectUrl.mockRestore();
      createObjectUrl.mockRestore();
    }
  });

  it('ignores display-only node measurement with a via waypoint and still syncs real moves', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Via measurement', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'via-measurement',
        nodes: [
          { id: 'a', type: 'service', symbol: 'arch-service', position: { x: 0, y: 0 } },
          { id: 'b', type: 'database', symbol: 'arch-database', position: { x: 200, y: 0 } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b', routeIntent: { waypoints: [
          { id: 'w', placement: { kind: 'absolute', position: { x: 180, y: -40 } } },
        ] } }],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
    }));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 700)); });
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:via-measurement');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const exportSvg = () => act(() => result.current.commandPalette.commands
      .find((command) => command.id === 'export-svg')!.action({ invoker: null }));
    try {
      const dsl = result.current.editor.dsl;
      const layouts = layout.mock.calls.length;
      act(() => result.current.header.onToggleCommandPalette());
      act(() => result.current.header.onToggleCommandPalette());
      act(() => result.current.canvas.onNodesChange([
        { id: 'a', type: 'dimensions', dimensions: { width: 151, height: 61 } },
        { id: 'b', type: 'dimensions', dimensions: { width: 152, height: 62 } },
      ]));
      for (const wait of [0, 700, 700]) {
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, wait)); });
        exportSvg();
        expect(result.current.rasterExportError).toBeNull();
      }
      expect(layout.mock.calls.length).toBe(layouts);
      expect(result.current.editor.dsl).toBe(dsl);
      expect(createObjectUrl).toHaveBeenCalledTimes(3);

      act(() => result.current.canvas.onNodesChange([{ id: 'a', type: 'position', position: { x: 40, y: 20 } }]));
      await waitFor(() => expect(result.current.editor.dsl).toContain('@ (40, 20)'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(layout.mock.calls.length).toBeGreaterThan(layouts);
      exportSvg();
      await waitFor(() => expect(result.current.rasterExportError).toBeNull());
      act(() => result.current.canvas.onLabelEdit('b', 'Renamed store'));
      await waitFor(() => expect(result.current.editor.dsl).toContain('"Renamed store"'));
    } finally {
      click.mockRestore();
      revokeObjectUrl.mockRestore();
      createObjectUrl.mockRestore();
    }
  });

  it('blocks constraint-only export immediately and publishes after automatic reverification', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Constrained', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'constrained',
        nodes: [
          { id: 'a', type: 'service', position: { x: 0, y: 0 } },
          { id: 'b', type: 'database', position: { x: 1000, y: 0 } },
        ],
        edges: [],
        constraints: [{
          id: 'b-right-of-a', kind: 'relative', strength: 'preferred',
          subject: { kind: 'node', nodeId: 'b' }, relation: 'right-of',
          target: { kind: 'node', nodeId: 'a' }, gap: 10,
        }],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
    }));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));

    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:verified-constraint');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const a = result.current.canvas.nodes.find((node) => node.id === 'a')!;
    act(() => result.current.canvas.onSelectionChange({ nodes: [a], edges: [] }));
    act(() => result.current.inspector!.onPropertyChange({
      nodeId: 'a', field: 'label', oldValue: 'a', newValue: 'A much wider label',
    }));
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!.action({ invoker: null }));
    await waitFor(() => expect(result.current.rasterExportError).toContain('current source'));
    expect(createObjectUrl).not.toHaveBeenCalled();

    await waitFor(() => expect(result.current.editor.dsl).toContain('A much wider label'));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!.action({ invoker: null }));
    await waitFor(() => expect(result.current.rasterExportError).toBeNull());
    expect(createObjectUrl).toHaveBeenCalledOnce();
    click.mockRestore();
    revokeObjectUrl.mockRestore();
    createObjectUrl.mockRestore();
  });

  it('keeps pending structural source intact when competing semantic edits arrive', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onLoad({
      schemaVersion: '1.0.0',
      metadata: {
        name: 'Structural lock', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z',
      },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id: 'structural-lock',
        nodes: [
          { id: 'a', type: 'service', label: 'Alpha', position: { x: 0, y: 0 } },
          { id: 'b', type: 'database', label: 'Beta', position: { x: 400, y: 0 } },
        ],
        edges: [{ id: 'a-b', source: 'a', target: 'b' }],
        constraints: [{
          id: 'b-right-of-a', kind: 'relative', strength: 'preferred',
          subject: { kind: 'node', nodeId: 'b' }, relation: 'right-of',
          target: { kind: 'node', nodeId: 'a' }, gap: 10,
        }],
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
    }));
    await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
    await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    const originalSettings = structuredClone(result.current.inspector!.documentSettings);
    const fontDraft = structuredClone(result.current.inspector!.fontDraft);
    const applyFont = result.current.inspector!.onApplyFont;
    const applyPreset = result.current.inspector!.onPresetChange;

    let resolveLayout!: (value: any) => void;
    let requestedGraph: any;
    const pendingLayout = new Promise<any>((resolve) => { resolveLayout = resolve; });
    layout.mockImplementationOnce((graph: any) => {
      requestedGraph = graph;
      return pendingLayout;
    });
    const callsBeforeCreate = layout.mock.calls.length;
    act(() => result.current.commandPalette.commands.find((command) => command.id === 'create-node')!
      .action({ invoker: null }));
    act(() => result.current.authoring!.onSubmitNode({ symbolId: 'arch-service', label: 'Added' }));
    await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBeforeCreate));
    expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);

    const sourceBeforeCompetingEdits = result.current.editor.dsl;
    const undoBeforeCompetingEdits = result.current.canvas.undoCount;
    act(() => result.current.canvas.onNodesChange([{
      id: 'a', type: 'position', position: { x: 99, y: 99 },
    }]));
    act(() => result.current.canvas.onLabelEdit('a', 'Dropped label edit'));
    act(() => result.current.editor.onDslChange('service "Dropped source edit" as dropped'));
    act(() => applyFont({
      ...fontDraft,
      default: { ...fontDraft.default, size: (fontDraft.default.size ?? 12) + 5 },
    }));
    act(() => applyPreset('radial'));
    act(() => result.current.canvas.onReconnect(
      result.current.canvas.edges[0],
      { source: 'b', target: 'a', sourceHandle: null, targetHandle: null },
    ));
    expect(result.current.editor.dsl).toBe(sourceBeforeCompetingEdits);
    expect(result.current.inspector!.documentSettings).toEqual(originalSettings);
    expect(result.current.guidanceAnnouncement).toBe('Updating diagram. Editing is temporarily unavailable.');
    // Refused attempts add no history (AC7): only the structural snapshot exists.
    expect(result.current.canvas.undoCount).toBe(undoBeforeCompetingEdits);

    await act(async () => {
      resolveLayout({
        ...requestedGraph,
        children: (requestedGraph.children ?? []).map((child: any, index: number) => ({
          ...child, x: index * 300, y: 0,
        })),
        edges: requestedGraph.edges ?? [],
      });
      await pendingLayout;
    });
    await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
    // S94-WI-01: the matching structural completion retires both owners, so a
    // fresh waypoint gesture is accepted instead of being permanently locked.
    const resolvedEdge = result.current.canvas.edges.find((edge) => edge.id === 'a-b')!;
    act(() => (resolvedEdge.data as any).onWaypointAdd('a-b', { x: 160, y: 80 }));
    await waitFor(() => expect(result.current.editor.dsl).toContain('via'));
    const saved = saveInAct(result).content.graphIR!;
    expect(saved.nodes.map((node) => node.id)).toEqual(['a', 'b', 'added']);
    expect(saved.nodes.find((node) => node.id === 'a')).toMatchObject({ label: 'Alpha', position: { x: 0, y: 0 } });
    expect(saved.edges).toContainEqual(expect.objectContaining({ id: 'a-b', source: 'a', target: 'b' }));
    await quiesce(result);
  });

  it('keeps source typing writable while refusing canvas mutation and Reflow before debounce', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const node = result.current.canvas.nodes[0];
    const before = { ...node.position };
    act(() => result.current.editor.onDslChange('service "Source owns this update" as source'));
    expect(result.current.editor.isDslReadOnly).toBe(false);
    expect(result.current.canvas.mutationsDisabled).toBe(true);
    // Displayed, not announced: the canvas live region keeps its last outcome.
    expect(result.current.canvas.updateStatus).toEqual({
      kind: 'source-pending', message: 'Updating source. Canvas editing is temporarily unavailable.',
    });
    expect(result.current.canvas.statusText ?? '').not.toMatch(/^Updating/);
    const undoBefore = result.current.canvas.undoCount;
    act(() => result.current.welcome.onAnnouncement(''));
    act(() => result.current.canvas.onNodesChange([{
      id: node.id, type: 'position', position: { x: before.x + 100, y: before.y + 100 }, dragging: false,
    }]));
    expect(result.current.canvas.nodes.find((candidate) => candidate.id === node.id)?.position).toEqual(before);
    // The refused gesture names its reason instead of being silently dropped.
    expect(result.current.guidanceAnnouncement).toBe('Updating source. Canvas editing is temporarily unavailable.');
    expect(result.current.canvas.undoCount).toBe(undoBefore);
    act(() => result.current.canvas.onReflow());
    expect(result.current.guidanceAnnouncement).toBe('Finish the current diagram update before Reflow.');
  });

  describe('Slice 94 adversarial review corrections', () => {
    const STRUCTURAL = 'Updating diagram. Editing is temporarily unavailable.';
    const SOURCE = 'Updating source. Canvas editing is temporarily unavailable.';
    const REFLOW = 'Finish the current diagram update before Reflow.';
    const WAYPOINT = 'Finish the current diagram update before moving a waypoint.';
    const s94Document = (id: string, constrained = false) => ({
      schemaVersion: '1.0.0',
      metadata: { name: id, created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
      content: { format: 'graph-ir', graphIR: {
        version: '3.0.0', id,
        nodes: [
          { id: 'a', type: 'service', label: 'Alpha', position: { x: 0, y: 0 } },
          { id: 'b', type: 'database', label: 'Beta', position: { x: 400, y: 0 } },
        ],
        edges: [{ id: 'e', source: 'a', target: 'b' }],
        ...(constrained ? { constraints: [{
          id: 'b-right-of-a', kind: 'relative', strength: 'preferred',
          subject: { kind: 'node', nodeId: 'b' }, relation: 'right-of',
          target: { kind: 'node', nodeId: 'a' }, gap: 10,
        }] } : {}),
      } },
      settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
      edgeRouting: { e: {
        bendPoints: [{ x: 200, y: 40 }], isPinned: true,
        waypoints: [{ id: 'p', x: 200, y: 40, type: 'corner' }],
      } },
    });
    // Every Slice 94 test ends quiescent: pending print-backs, layouts, and
    // Reflows finish inside waitFor rather than updating after the test.
    let lastResult: { current: ReturnType<typeof useEditorController> } | null = null;
    afterEach(async () => {
      const result = lastResult;
      lastResult = null;
      if (result) await quiesce(result);
    });
    const ready = async (constrained = false) => {
      const hook = renderHook(() => useEditorController());
      lastResult = hook.result;
      await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
      act(() => { hook.result.current.header.onLoad(s94Document('s94-review', constrained) as any); });
      await waitFor(() => expect(hook.result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(hook.result.current.canvas.edges[0]?.data?.waypoints).toHaveLength(1));
      return hook;
    };
    const dragNode = (result: { current: ReturnType<typeof useEditorController> }) => act(() => {
      result.current.canvas.onNodesChange([{ id: 'a', type: 'position', position: { x: 40, y: 40 } }]);
    });
    const holdNextLayout = () => {
      let release!: () => Promise<void>;
      layout.mockImplementationOnce((graph: any) => new Promise((resolve) => {
        release = async () => {
          resolve({
            ...graph,
            children: (graph.children ?? []).map((child: any, index: number) => ({ ...child, x: index * 300, y: 0 })),
            edges: graph.edges ?? [],
          });
        };
      }));
      return () => release();
    };
    const beginHeldStructuralLayout = async (result: { current: ReturnType<typeof useEditorController> }) => {
      const release = holdNextLayout();
      const callsBefore = layout.mock.calls.length;
      act(() => result.current.commandPalette.commands.find((command) => command.id === 'create-node')!
        .action({ invoker: null }));
      act(() => { result.current.authoring!.onSubmitNode({ symbolId: 'arch-service', label: 'Added' }); });
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
      expect(result.current.canvas.mutationsDisabled).toBe(true);
      return release;
    };

    it('DR94-F1: rejected GraphIR preview input does not retire its passive print-back', async () => {
      const { result } = await ready();
      dragNode(result);
      expect(result.current.canvas.reflowDisabled).toBe(true);
      const preview = result.current.editor.dsl;
      act(() => result.current.editor.onDslChange(`${preview}\ngamma service as "Gamma"`));
      expect(result.current.editor.dsl).toBe(preview);
      expect(result.current.guidanceAnnouncement)
        .toBe('GraphIR interchange preview is read-only; the GraphIR document remains authoritative.');
      expect(result.current.canvas.reflowDisabled).toBe(true);
      await quiesce(result);
      expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
      expect(result.current.canvas.reflowDisabled).toBe(false);
      expect(result.current.commandPalette.commands.find((command) => command.id === 'reflow')!.disabled).toBe(false);
      const callsBefore = layout.mock.calls.length;
      act(() => result.current.canvas.onReflow());
      expect(result.current.guidanceAnnouncement).not.toBe(REFLOW);
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
    });

    it('DR94-F1: retires a passive owner when a document replacement preempts its print-back', async () => {
      const { result } = await ready();
      dragNode(result);
      expect(result.current.canvas.reflowDisabled).toBe(true);
      act(() => { result.current.header.onLoad(s94Document('replacement') as any); });
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.reflowDisabled).toBe(false);
      act(() => result.current.canvas.onReflow());
      expect(result.current.guidanceAnnouncement).not.toBe(REFLOW);
      await quiesce(result);
    });

    it('DR94-F1: retires a passive owner when undo restores the accepted publication', async () => {
      const { result } = await ready();
      act(() => result.current.inspector!.onPropertyChange({
        nodeId: 'a', field: 'label', oldValue: 'Alpha', newValue: 'Alpha edited',
      }));
      expect(result.current.canvas.reflowDisabled).toBe(true);
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.reflowDisabled).toBe(false);
    });

    it('rejects a stale font-layout result after a newer font completes', async () => {
      const { result } = await ready();
      act(() => result.current.canvas.onNodesChange([{ id: 'a', type: 'select', selected: true }]));
      const beforeText = result.current.editor.dsl;
      const draft = result.current.inspector!.fontDraft;
      const baseSize = draft.default.size ?? 14;
      const release = holdNextLayout();
      const calls = layout.mock.calls.length;
      act(() => result.current.inspector!.onApplyFont({ ...draft, default: { ...draft.default, size: baseSize + 2 } }));
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(calls));
      expect(result.current.canvas.isLoading).toBe(true);
      act(() => result.current.inspector!.onApplyFont({ ...draft, default: { ...draft.default, size: baseSize + 4 } }));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const accepted = JSON.stringify(result.current.canvas.scene028?.resolved);
      expect(accepted).toBeDefined();
      expect(result.current.canvas.sceneError028).toBeUndefined();
      expect(result.current.canvas.nodes.find((node) => node.id === 'a')?.selected).toBe(true);
      await act(async () => { await release(); });
      await quiesce(result);
      expect(result.current.header.onSave().settings.font?.default.size).toBe(baseSize + 4);
      expect(JSON.stringify(result.current.canvas.scene028?.resolved)).toBe(accepted);
      expect(result.current.editor.dsl).toBe(beforeText);
    });

    it('rejects a stale font-layout result after a newer source is accepted', async () => {
      const { result } = await ready();
      const initial = '@diagram architecture\na service as "Alpha"\nb service as "Beta"\ne = a -> b\n';
      act(() => result.current.header.onOpenFile({ name: 'font-source.coral', text: initial }));
      await waitFor(() => expect(result.current.editor.dsl).toBe(initial));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const draft = result.current.inspector!.fontDraft;
      const release = holdNextLayout();
      const calls = layout.mock.calls.length;
      act(() => result.current.inspector!.onApplyFont({ ...draft, default: { ...draft.default, size: (draft.default.size ?? 14) + 2 } }));
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(calls));
      const source = '@diagram architecture\nfresh service as "Newest source"\n';
      act(() => result.current.editor.onDslChange(source));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['fresh']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      await act(async () => { await release(); });
      await quiesce(result);
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['fresh']);
      expect(result.current.canvas.sceneError028).toBeUndefined();
    });

    it('shows impossible waypoint geometry as a current-scene error and blocks SVG export without losing the document', async () => {
      const { result } = await ready();
      const document = s94Document('impossible-waypoint');
      document.content.graphIR.nodes.push({ id: 'block', type: 'service', label: 'Block', position: { x: 150, y: 0 } });
      act(() => result.current.header.onLoad(document as any));
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
      await waitFor(() => expect(result.current.canvas.sceneError028).toMatch(/waypoint|obstacle/i));
      expect(result.current.canvas.scene028).toBeUndefined();
      expect(result.current.header.onSave().content.graphIR?.nodes).toHaveLength(3);
      act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!.action({ invoker: null }));
      expect(result.current.rasterExportError).toMatch(/waypoint|obstacle/i);
      act(() => result.current.header.onLoad(s94Document('repaired-waypoint') as any));
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.sceneError028).toBeUndefined());
      expect(result.current.canvas.scene028).toBeDefined();
    });

    it('DR94-F1: a cancelled waypoint gesture leaves no rendered passive owner', async () => {
      const { result } = await ready();
      const gesture = () => result.current.canvas.edges[0].data as any;
      let epoch: number | undefined;
      act(() => { epoch = gesture().onWaypointDragStart('e', 'p'); });
      expect(epoch).toEqual(expect.any(Number));
      act(() => gesture().onWaypointDrag('e', 'p', { x: 240, y: 80 }, epoch));
      expect(result.current.canvas.reflowDisabled).toBe(true);
      act(() => gesture().onWaypointDragCancel('e', 'p', epoch));
      expect(result.current.canvas.reflowDisabled).toBe(false);
      act(() => result.current.canvas.onReflow());
      expect(result.current.guidanceAnnouncement).not.toBe(REFLOW);
      await quiesce(result);
    });

    it('DR94-F2: every direct mutation callback announces the structural owner copy', async () => {
      const { result } = await ready(true);
      act(() => result.current.canvas.onSelectionChange({
        nodes: [result.current.canvas.nodes.find((node) => node.id === 'a')!], edges: [],
      }));
      // An accepted Inspector edit leaves an Escape-revertible session open.
      act(() => result.current.inspector!.onPropertyEditSessionStart('label'));
      act(() => result.current.inspector!.onPropertyChange({
        nodeId: 'a', field: 'label', oldValue: 'Alpha', newValue: 'Alpha edited',
      }));
      // A structural Pin keeps the selection, so Escape still targets the session.
      const release = holdNextLayout();
      const callsBefore = layout.mock.calls.length;
      act(() => result.current.inspector!.onToggleNodePin('a'));
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
      expect(result.current.canvas.mutationsDisabled).toBe(true);
      const expectRefusal = (label: string, attempt: () => void, message = STRUCTURAL) => {
        act(() => result.current.welcome.onAnnouncement(''));
        act(attempt);
        expect({ label, announcement: result.current.guidanceAnnouncement })
          .toEqual({ label, announcement: message });
      };
      const dsl = result.current.editor.dsl;
      const undoBefore = result.current.canvas.undoCount;
      expectRefusal('undo', () => result.current.canvas.onUndo());
      expectRefusal('redo', () => result.current.canvas.onRedo());
      expectRefusal('inspector escape', () => result.current.inspector!.onPropertyEditSessionCancel('label'));
      expectRefusal('pin', () => result.current.inspector!.onToggleNodePin('a'));
      expectRefusal('release', () => result.current.inspector!.onReleaseNodePosition('a'));
      expectRefusal('format command', () => result.current.commandPalette.commands
        .find((command) => command.id === 'format-mermaid')!.action({ invoker: null }));
      expectRefusal('document settings', () => result.current.inspector!.onDocumentSettingsChange({
        ...result.current.inspector!.documentSettings, notation: 'flowchart',
      } as any));
      expectRefusal('source', () => result.current.editor.onDslChange('service "Dropped" as dropped'),
        'GraphIR interchange preview is read-only; the GraphIR document remains authoritative.');
      expectRefusal('authoring shortcut', () => {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'n', ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
        }));
      });
      expect(result.current.authoring).toBeNull();
      act(() => result.current.welcome.onAnnouncement(''));
      act(() => result.current.canvas.onReflow());
      expect(result.current.guidanceAnnouncement).toBe(REFLOW);
      expect(result.current.editor.dsl).toBe(dsl);
      // No refused attempt, including refused source input, adds history (AC7).
      expect(result.current.canvas.undoCount).toBe(undoBefore);
      await act(async () => { await release(); });
      await waitFor(() => expect(result.current.canvas.mutationsDisabled).toBe(false));
    });

    it('DR94-F2: Undo cancels a pending authored edit while canvas callbacks keep source authority', async () => {
      const { result } = await ready();
      const sourceLock = 'Edit this 0.2.8 diagram in Coral source; inline node labels, selected connector labels, and semantic-port connections preserve its authored notation.';
      const structureLock = 'Delete or change this 0.2.8 structure in Coral source until a source-owned canvas transaction is available.';
      const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
      act(() => { result.current.header.onOpenFile({ name: 'direct-owner.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const pending = `${source}\ngamma service as "Gamma"`;
      act(() => result.current.editor.onDslChange(pending));
      expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
      act(() => result.current.canvas.onUndo());
      expect(result.current.editor.dsl).toBe(source);
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: source });

      act(() => result.current.editor.onDslChange(pending));
      expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
      const undoBefore = result.current.canvas.undoCount;
      for (const [label, attempt, expected] of [
        ['pin', () => result.current.inspector?.onToggleNodePin('a'), structureLock],
        ['format command', () => result.current.commandPalette.commands
          .find((command) => command.id === 'format-mermaid')!.action({ invoker: null }), sourceLock],
      ] as const) {
        act(() => result.current.welcome.onAnnouncement(''));
        act(() => { attempt(); });
        expect({ label, announcement: result.current.guidanceAnnouncement })
          .toEqual({ label, announcement: expected });
      }
      expect(result.current.editor.dsl).toBe(pending);
      expect(result.current.canvas.undoCount).toBe(undoBefore);
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('gamma'));
    });

    it('DR94-F2: Undo rejects a late layout for the canceled authored edit', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
      act(() => { result.current.header.onOpenFile({ name: 'undo-held.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const release = holdNextLayout();
      const callsBefore = layout.mock.calls.length;
      act(() => result.current.editor.onDslChange(`${source}\ngamma service as "Gamma"`));
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
      expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
      act(() => result.current.canvas.onUndo());
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.canvas.updateStatus).toBeNull();
      await act(async () => { await release(); });
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
      await quiesce(result);
    });

    it('DR94-F2: Redo of a canceled pending authored edit reruns its projection', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
      const edited = `${source}\ngamma service as "Gamma"`;
      act(() => { result.current.header.onOpenFile({ name: 'redo-pending.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.editor.onDslChange(edited));
      expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
      act(() => result.current.canvas.onUndo());
      expect(result.current.editor.dsl).toBe(source);
      act(() => result.current.canvas.onRedo());
      expect(result.current.editor.dsl).toBe(edited);
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('gamma'));
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
      await quiesce(result);
    });

    it('DR94-F2: Redo stays current after the canceled layout completes late', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
      const edited = `${source}\ngamma service as "Gamma"`;
      act(() => { result.current.header.onOpenFile({ name: 'redo-late.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const releaseOld = holdNextLayout();
      const callsBefore = layout.mock.calls.length;
      act(() => result.current.editor.onDslChange(edited));
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
      act(() => result.current.canvas.onUndo());
      expect(result.current.editor.dsl).toBe(source);
      act(() => result.current.canvas.onRedo());
      expect(result.current.editor.dsl).toBe(edited);
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('gamma'));
      await act(async () => { await releaseOld(); });
      expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b', 'gamma']);
      expect(result.current.canvas.updateStatus).toBeNull();
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
      await quiesce(result);
    });

    it('DR94-F2: Undo to an earlier pending source revision restarts its projection', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
      const first = `${source}\ngamma service as "Gamma"`;
      const second = `${first}\ndelta service as "Delta"`;
      act(() => { result.current.header.onOpenFile({ name: 'undo-earlier.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const releaseOld = holdNextLayout();
      const callsBefore = layout.mock.calls.length;
      act(() => result.current.editor.onDslChange(first));
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
      act(() => result.current.editor.onEditSessionEnd());
      act(() => result.current.editor.onDslChange(second));
      expect(result.current.editor.dsl).toBe(second);
      act(() => result.current.canvas.onUndo());
      expect(result.current.editor.dsl).toBe(first);
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('gamma'));
      expect(result.current.canvas.nodes.map((node) => node.id)).not.toContain('delta');
      await act(async () => { await releaseOld(); });
      expect(result.current.editor.dsl).toBe(first);
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: first });
      await quiesce(result);
    });

    it('DR94-F3: passive spatial resolution is a visible passive phase with waypoint refusal copy', async () => {
      const { result } = await ready(true);
      const gesture = () => result.current.canvas.edges[0].data as any;
      const release = holdNextLayout();
      const callsBefore = layout.mock.calls.length;
      // Step timers one at a time into the held resolution phase rather than
      // waiting on the nominal print-back debounce (TR94-F13).
      vi.useFakeTimers();
      let refused: number | undefined = 0;
      try {
        act(() => result.current.inspector!.onPropertyChange({
          nodeId: 'a', field: 'label', oldValue: 'Alpha', newValue: 'Alpha edited',
        }));
        // Debounce phase and held resolution phase refuse a new waypoint gesture visibly.
        act(() => { refused = gesture().onWaypointDragStart('e', 'p'); });
        expect(refused).toBeUndefined();
        expect(result.current.guidanceAnnouncement).toBe(WAYPOINT);
        for (let step = 0; step < 50 && layout.mock.calls.length <= callsBefore; step += 1) {
          await act(async () => { await vi.advanceTimersToNextTimerAsync(); });
        }
      } finally {
        vi.useRealTimers();
      }
      expect(layout.mock.calls.length).toBeGreaterThan(callsBefore);
      expect(result.current.canvas.reflowDisabled).toBe(true);
      expect(result.current.editor.isDslReadOnly).toBe(true);
      expect(result.current.editor.isDslReadOnlyReason).toBe('GraphIR interchange preview');
      act(() => result.current.welcome.onAnnouncement(''));
      act(() => { refused = gesture().onWaypointDragStart('e', 'p'); });
      expect(refused).toBeUndefined();
      expect(result.current.guidanceAnnouncement).toBe(WAYPOINT);
      await act(async () => { await release(); });
      await waitFor(() => expect(result.current.canvas.reflowDisabled).toBe(false));
      let accepted: number | undefined;
      act(() => { accepted = gesture().onWaypointDragStart('e', 'p'); });
      expect(accepted).toEqual(expect.any(Number));
    });

    it('DR94-F4: passive and source updates do not drive the canvas live region', async () => {
      const { result } = await ready();
      const settled = result.current.canvas.statusText;
      dragNode(result);
      expect(result.current.canvas.reflowDisabled).toBe(true);
      expect(result.current.canvas.statusText).toBe(settled);
      expect(result.current.canvas.updateStatus).toBeNull();
      const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
      act(() => { result.current.header.onOpenFile({ name: 'live-region.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.editor.onDslChange(`${source}\ngamma service as "Gamma"`));
      expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
      expect(result.current.canvas.statusText ?? '').not.toMatch(/^Updating/);
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
    });

    it('DR94-F4: structural layout drives the live region with the reserved structural copy', async () => {
      const { result } = await ready(true);
      const release = await beginHeldStructuralLayout(result);
      expect(result.current.canvas.updateStatus).toEqual({ kind: 'structural-layout', message: STRUCTURAL });
      expect(result.current.canvas.statusText).toBe(STRUCTURAL);
      await act(async () => { await release(); });
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
      expect(result.current.canvas.statusText).not.toBe(STRUCTURAL);
    });

    it('DR94-C2-F1: a source-owned label edit inside text-origin settle keeps both authored edits', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
      act(() => { result.current.header.onOpenFile({ name: 'settle-label.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const edited = `${source}\ngamma service as "Gamma"`;
      vi.useFakeTimers();
      try {
        act(() => result.current.editor.onDslChange(edited));
        // Reach the parsed source publication before its text-origin settle
        // timer, then compose the permitted source-owned label transaction.
        for (let step = 0; step < 50 && !result.current.canvas.nodes.some((node) => node.id === 'gamma'); step += 1) {
          await act(async () => { await vi.advanceTimersToNextTimerAsync(); });
        }
        expect(result.current.canvas.nodes.map((node) => node.id)).toContain('gamma');
        act(() => result.current.canvas.onLabelEdit('a', 'Alpha revised'));
        expect(result.current.editor.dsl).toBe(edited.replace('a service as "Alpha"', 'a service as "Alpha revised"'));
        for (let step = 0; step < 5; step += 1) {
          await act(async () => { await vi.runOnlyPendingTimersAsync(); });
        }
      } finally {
        vi.useRealTimers();
      }
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'a')?.data.label).toBe('Alpha revised'));
      expect(result.current.canvas.nodes.map((node) => node.id)).toContain('gamma');
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral',
        text: edited.replace('a service as "Alpha"', 'a service as "Alpha revised"') });
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:c2-f1');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      act(() => result.current.commandPalette.commands.find((command) => command.id === 'export-svg')!
        .action({ invoker: null }));
      expect(result.current.rasterExportError).toBeNull();
      expect(createObjectUrl).toHaveBeenCalledOnce();
      createObjectUrl.mockRestore();
      revokeObjectUrl.mockRestore();
      click.mockRestore();
    });

    it('DR94-C3-F1: a source-owned label edit batched into layout commit keeps both source changes', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
      act(() => { result.current.header.onOpenFile({ name: 'batched-label.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const edited = `${source}\ngamma service as "Gamma"`;
      const release = holdNextLayout();
      const callsBefore = layout.mock.calls.length;
      act(() => result.current.editor.onDslChange(edited));
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore), { timeout: 2000 });
      const canvas = result.current.canvas;
      // Release the layout outside act and drain microtasks only: the source
      // owner retires synchronously while React has not yet committed nodes.
      const actEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
      (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;
      try {
        await release();
        for (let step = 0; step < 200; step += 1) await Promise.resolve();
        expect(result.current.canvas.nodes.map((node) => node.id)).not.toContain('gamma');
        canvas.onLabelEdit('a', 'Alpha revised');
      } finally {
        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = actEnvironment;
      }
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('gamma'));
      await waitFor(() => expect(result.current.editor.dsl)
        .toBe(edited.replace('a service as "Alpha"', 'a service as "Alpha revised"')), { timeout: 2000 });
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'a')?.data.label)
        .toBe('Alpha revised'));
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral',
        text: edited.replace('a service as "Alpha"', 'a service as "Alpha revised"') });
    });

    it('DR94-C3-F3: the format switch names the AI lock instead of dropping the click', async () => {
      const { result, rerender } = await ready();
      llmChatBridge.mutationPending = true;
      rerender();
      act(() => result.current.welcome.onAnnouncement(''));
      act(() => result.current.editor.onDslTypeChange('mermaid'));
      expect(result.current.guidanceAnnouncement).toBe('Wait for the assistant to finish before editing.');
      expect(result.current.editor.dslType).toBe('coral');
    });

    it('DR94-C2-F3: Ctrl+O under the AI mutation lock names the assistant', async () => {
      const { result, rerender } = await ready();
      llmChatBridge.mutationPending = true;
      rerender();
      act(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true }));
      });
      expect(result.current.guidanceAnnouncement).toBe('Wait for the assistant to finish before opening another document.');
    });

    it('DR94-C2-F4: malformed source has no waypoint controls and refuses canvas connections', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
      act(() => { result.current.header.onOpenFile({ name: 'waypoint-source-error.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      act(() => result.current.editor.onDslChange(`${source}\n"Broken`));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      expect(typeof (result.current.canvas.edges[0].data as any).onWaypointAdd).not.toBe('function');
      expect(result.current.canvas.sourceConnectionsEnabled).toBe(false);
      act(() => result.current.canvas.onConnect({ source: 'a', target: 'b',
        sourceHandle: 'out', targetHandle: 'in' }));
      expect(result.current.guidanceAnnouncement)
        .toBe('Fix the source errors before editing the diagram. The canvas is view-only while the source has errors.');
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: `${source}\n"Broken` });
    });

    it('DR94-C2-F7: chat confirmation cannot replace an authored malformed draft', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
      act(() => { result.current.header.onOpenFile({ name: 'chat-source-error.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      act(() => result.current.editor.onDslChange(`${source}\n"Broken`));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      act(() => result.current.welcome.onAnnouncement(''));
      act(() => result.current.editor.onConfirmChatAction(1));
      expect(result.current.guidanceAnnouncement)
        .toBe('Edit this 0.2.8 diagram in Coral source; inline node labels, selected connector labels, and semantic-port connections preserve its authored notation.');
      expect(result.current.editor.dsl).toBe(`${source}\n"Broken`);
      act(() => result.current.editor.onDslChange(`${source}\npending service as "Pending"`));
      act(() => result.current.editor.onConfirmChatAction(1));
      expect(result.current.guidanceAnnouncement)
        .toBe('Edit this 0.2.8 diagram in Coral source; inline node labels, selected connector labels, and semantic-port connections preserve its authored notation.');
      expect(result.current.editor.dsl).toBe(`${source}\npending service as "Pending"`);
    });

    describe('adversarial test review cycle 1', () => {
      const OPEN = 'Finish the current diagram update before opening another document.';
      const AI_REQUEST = 'Finish the current diagram update before requesting AI changes.';
      const AI_APPLY = 'Finish the current diagram update before applying AI changes.';
      const SOURCE_028 = 'Edit this 0.2.8 diagram in Coral source; inline node labels, selected connector labels, and semantic-port connections preserve its authored notation.';
      const REFUSALS: readonly string[] = [STRUCTURAL, SOURCE, SOURCE_028, REFLOW, WAYPOINT, OPEN, AI_REQUEST, AI_APPLY];
      type Hook = { current: ReturnType<typeof useEditorController> };
      type Owner = 'source pending' | 'structural layout';
      const command = (result: Hook, id: string) => result.current.commandPalette.commands
        .find((candidate) => candidate.id === id)!;
      const clearAnnouncement = (result: Hook) => act(() => result.current.welcome.onAnnouncement(''));
      const expectNoRefusal = (result: Hook, label: string) => {
        expect({ label, refused: REFUSALS.includes(result.current.guidanceAnnouncement) })
          .toEqual({ label, refused: false });
      };
      const settleStructural = async (result: Hook, release: () => Promise<void>) => {
        await act(async () => { await release(); });
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        expect(result.current.canvas.mutationsDisabled).toBe(false);
      };
      /** Step fake timers one at a time until `until` holds; no debounce length is assumed. */
      const stepTimersUntil = async (until: () => boolean, label: string) => {
        for (let step = 0; step < 100 && !until(); step += 1) {
          await act(async () => { await vi.advanceTimersToNextTimerAsync(); });
        }
        expect({ label, reached: until() }).toEqual({ label, reached: true });
      };
      /** Claim a live owner: source ownership synchronously, structural with a held layout. */
      const claimOwner = async (result: Hook, owner: Owner) => {
        if (owner === 'structural layout') return beginHeldStructuralLayout(result);
        const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
        act(() => { result.current.header.onOpenFile({ name: 'owner.coral', text: source }); });
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        act(() => result.current.editor.onDslChange(`${source}\npending service as "Pending"`));
        expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
        return undefined;
      };
      const ownerCopy = (owner: Owner) => owner === 'structural layout' ? STRUCTURAL : SOURCE_028;
      const position = (result: Hook, id: string) => ({
        ...result.current.canvas.nodes.find((node) => node.id === id)!.position,
      });

      it('TR94-F1: a structural success leaves a new waypoint drag available at once', async () => {
        const { result } = await ready(true);
        const release = await beginHeldStructuralLayout(result);
        await settleStructural(result, release);
        const gesture = () => result.current.canvas.edges.find((edge) => edge.id === 'e')!.data as any;
        expect(gesture().waypoints).toEqual([expect.objectContaining({ id: 'p' })]);
        // No later edit may run first: its passive print-back would clear a
        // leaked resolution marker and hide the S94-WI-01 defect.
        clearAnnouncement(result);
        let epoch: number | undefined;
        act(() => { epoch = gesture().onWaypointDragStart('e', 'p'); });
        expect(epoch).toEqual(expect.any(Number));
        expect(result.current.guidanceAnnouncement).toBe('');
        act(() => gesture().onWaypointDrag('e', 'p', { x: 260, y: 90 }, epoch));
        act(() => gesture().onWaypointDragEnd('e', 'p', { x: 260, y: 90 }, epoch));
        expect(gesture().waypoints).toEqual([expect.objectContaining({ id: 'p', x: 260, y: 90 })]);
        expect(result.current.guidanceAnnouncement).toBe('');
        await quiesce(result);
      });

      it('TR94-F1: a structural success leaves Reflow available and Reflow lays out', async () => {
        const { result } = await ready(true);
        const release = await beginHeldStructuralLayout(result);
        await settleStructural(result, release);
        expect(result.current.canvas.reflowDisabled).toBe(false);
        expect(command(result, 'reflow').disabled).toBe(false);
        clearAnnouncement(result);
        const callsBefore = layout.mock.calls.length;
        act(() => result.current.canvas.onReflow());
        expect(result.current.guidanceAnnouncement).toBe('');
        expect(result.current.canvas.isReflowing).toBe(true);
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        await waitFor(() => expect(result.current.canvas.isReflowing).toBe(false));
        expect(result.current.guidanceAnnouncement).toBe('');
      });

      it('TR94-F2: Undo, a second structural edit, and explicit source Open are accepted after structural success', async () => {
        const { result } = await ready(true);
        const release = await beginHeldStructuralLayout(result);
        await settleStructural(result, release);
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b', 'added']);

        clearAnnouncement(result);
        const undoBefore = result.current.canvas.undoCount;
        act(() => result.current.canvas.onUndo());
        expectNoRefusal(result, 'undo');
        expect(result.current.canvas.undoCount).toBe(undoBefore - 1);
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));

        clearAnnouncement(result);
        const callsBefore = layout.mock.calls.length;
        act(() => { command(result, 'create-node').action({ invoker: null }); });
        let created: unknown;
        act(() => { created = result.current.authoring!.onSubmitNode({ symbolId: 'arch-service', label: 'Second' }); });
        expect(created).toEqual({ ok: true });
        expectNoRefusal(result, 'second structural edit');
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());

        clearAnnouncement(result);
        const preview = result.current.editor.dsl;
        act(() => result.current.editor.onDslChange(`${preview}\ntyped service as "Typed"`));
        expect(result.current.guidanceAnnouncement)
          .toBe('GraphIR interchange preview is read-only; the GraphIR document remains authoritative.');
        expect(result.current.editor.dsl).toBe(preview);
        expect(saveInAct(result).content.graphIR!.nodes.map((node) => node.id)).toContain('second');

        clearAnnouncement(result);
        const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\ntyped service as "Typed"\na -> b';
        let sourceOpened = false;
        act(() => { sourceOpened = result.current.header.onOpenFile({ name: 'typed-after-structural.coral', text: source }); });
        expect(sourceOpened).toBe(true);
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('typed'));
        expect(result.current.editor.dsl).toBe(source);
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: source });

        clearAnnouncement(result);
        let opened: unknown;
        act(() => { opened = result.current.header.onLoad(s94Document('opened-after-structural') as any); });
        expect(opened).toBe(true);
        expectNoRefusal(result, 'open');
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
        expect(result.current.editor.dsl).not.toContain('Typed');
      });

      it('TR94-F3: an older source layout does not retire a newer source owner', async () => {
        const { result } = await ready();
        const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\ne = a -> b\n';
        act(() => result.current.header.onOpenFile({ name: 'newer-layout.coral', text: source }));
        await waitFor(() => expect(result.current.editor.dsl).toBe(source));
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const base = result.current.editor.dsl;
        const first = `${base}first service as "First"\n`;
        const second = `${base}second service as "Second"\n`;
        const releaseFirst = holdNextLayout();
        const callsBefore = layout.mock.calls.length;
        vi.useFakeTimers();
        try {
          act(() => result.current.editor.onDslChange(first));
          await stepTimersUntil(() => layout.mock.calls.length > callsBefore, 'first source layout requested');
          const releaseSecond = holdNextLayout();
          act(() => result.current.editor.onDslChange(second));
          await act(async () => { await releaseFirst(); });
          // The first revision's finally ran; the second source owner is still live.
          expect(result.current.canvas.mutationsDisabled).toBe(true);
          expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
          const undoBefore = result.current.canvas.undoCount;
          clearAnnouncement(result);
          act(() => result.current.canvas.onLabelEdit('a', 'Blocked'));
          expect(result.current.guidanceAnnouncement).toBe(SOURCE);
          clearAnnouncement(result);
          act(() => { expect(result.current.canvas.onEdgeLabelEdit?.('e', 'Blocked')).toBe(false); });
          expect(result.current.guidanceAnnouncement).toBe(SOURCE);
          clearAnnouncement(result);
          act(() => { expect(result.current.canvas.onEdgeLabelRemove?.('e')).toBe(false); });
          expect(result.current.guidanceAnnouncement).toBe(SOURCE);
          clearAnnouncement(result);
          act(() => result.current.canvas.onConnect({
            source: 'a', target: 'b', sourceHandle: null, targetHandle: null,
          }));
          expect(result.current.guidanceAnnouncement).toBe(SOURCE);
          clearAnnouncement(result);
          act(() => command(result, 'create-node').action({ invoker: null }));
          expect(result.current.guidanceAnnouncement).toBe(SOURCE);
          expect(result.current.authoring).toBeNull();
          expect(result.current.editor.dsl).toBe(second);
          expect(result.current.canvas.undoCount).toBe(undoBefore);
          expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: second });
          await stepTimersUntil(() => layout.mock.calls.length > callsBefore + 1, 'second source layout requested');
          await act(async () => { await releaseSecond(); });
          await stepTimersUntil(() => result.current.canvas.updateStatus === null
            && !result.current.canvas.isLoading, 'second source settles');
        } finally {
          vi.useRealTimers();
        }
        expect(result.current.editor.dsl).toBe(second);
        expect(result.current.canvas.nodes.map((node) => node.id)).toContain('second');
        expect(result.current.canvas.nodes.map((node) => node.id)).not.toContain('first');
      });

      it.each(['source pending', 'structural layout'] as const)(
        'TR94-F4: AI admission refuses candidate application, generic requests, and Fix while %s',
        async (owner) => {
          const fetchSpy = vi.spyOn(globalThis, 'fetch');
          const { result } = await ready(true);
          const release = await claimOwner(result, owner);
          const dsl = result.current.editor.dsl;
          const undoBefore = result.current.canvas.undoCount;
          const chatBefore = result.current.editor.chatEntries.length;
          let outcome: unknown;
          await act(async () => {
            outcome = await llmChatBridge.current.onDslGenerated('service "AI change" as ai', 'coral');
          });
          expect(outcome).toEqual({ applied: false, reason: 'layout-blocked', message: AI_APPLY });
          clearAnnouncement(result);
          await act(async () => { await result.current.editor.onPromptSubmit('Add a cache in front of Beta'); });
          expect(result.current.guidanceAnnouncement).toBe(owner === 'source pending' ? SOURCE_028 : AI_REQUEST);
          clearAnnouncement(result);
          act(() => result.current.editor.onFixSourceError());
          expect(result.current.guidanceAnnouncement).toBe(owner === 'source pending' ? SOURCE_028 : AI_REQUEST);
          expect(result.current.editor.dsl).toBe(dsl);
          expect(result.current.canvas.undoCount).toBe(undoBefore);
          expect(result.current.editor.chatEntries).toHaveLength(chatBefore);
          expect(fetchSpy).not.toHaveBeenCalled();
          if (release) await settleStructural(result, release);
          fetchSpy.mockRestore();
        },
      );

      it.each(['source pending', 'structural layout'] as const)(
        'TR94-F5: a refused gesture keeps its batched selection change while %s',
        async (owner) => {
          const { result } = await ready(true);
          const release = await claimOwner(result, owner);
          const before = position(result, 'a');
          expect(result.current.canvas.nodes.find((node) => node.id === 'a')!.selected ?? false).toBe(false);
          clearAnnouncement(result);
          act(() => result.current.canvas.onNodesChange([
            { id: 'a', type: 'select', selected: true },
            { id: 'a', type: 'position', position: { x: 40, y: 40 }, dragging: false },
          ]));
          expect(result.current.guidanceAnnouncement).toBe(ownerCopy(owner));
          const node = result.current.canvas.nodes.find((candidate) => candidate.id === 'a')!;
          expect(node.selected).toBe(true);
          expect(node.position).toEqual(before);
          if (release) await settleStructural(result, release);
        },
      );

      it.each(['source pending', 'structural layout'] as const)(
        'TR94-F6: palette, Inspector, Ctrl+O, notation, and source follow the %s owner',
        async (owner) => {
          const { result } = await ready(true);
          const release = await claimOwner(result, owner);
          const copy = ownerCopy(owner);
          for (const id of ['create-node', 'reflow', 'open', 'format-mermaid', 'notation-flowchart', 'notation-bpmn']) {
            expect({ id, disabled: command(result, id).disabled }).toEqual({ id, disabled: true });
          }
          // Source history supersedes its own parse; structural layouts still lock it.
          expect(command(result, 'undo').disabled).toBe(owner === 'structural layout');
          for (const id of ['save', 'export-svg', 'help', 'toggle-inspector', 'preferences']) {
            expect({ id, disabled: command(result, id).disabled ?? false }).toEqual({ id, disabled: false });
          }
          expect(result.current.canvas.mutationsDisabled).toBe(true);
          expect(result.current.canvas.mutationDisabledReason).toBe(copy);
          expect(result.current.inspector!.mutationsDisabled).toBe(true);
          expect(result.current.inspector!.mutationDisabledReason).toBe(copy);
          expect(result.current.editor.isDslReadOnly).toBe(owner === 'structural layout');
          expect(result.current.editor.isDslReadOnlyReason)
            .toBe(owner === 'structural layout' ? 'GraphIR interchange preview' : undefined);

          clearAnnouncement(result);
          act(() => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true, cancelable: true }));
          });
          expect(result.current.guidanceAnnouncement).toBe(OPEN);

          const notation = result.current.inspector!.documentSettings.notation;
          const dsl = result.current.editor.dsl;
          clearAnnouncement(result);
          // A disabled palette action cannot be selected during source
          // publication. Structural callbacks also refuse direct invocation.
          if (owner === 'structural layout') {
            act(() => { command(result, 'notation-flowchart').action({ invoker: null }); });
            expect(result.current.guidanceAnnouncement).toBe(copy);
          }
          expect(result.current.inspector!.documentSettings.notation).toBe(notation);
          expect(result.current.editor.dsl).toBe(dsl);

          if (release) await settleStructural(result, release);
          else await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
          for (const id of ['create-node', 'reflow', 'undo', 'open', 'notation-flowchart']) {
            expect({ id, disabled: command(result, id).disabled }).toEqual({ id, disabled: false });
          }
          expect(command(result, 'format-mermaid').disabled).toBe(owner === 'source pending');
          expect(result.current.inspector!.mutationsDisabled).toBe(owner === 'source pending');
          expect(result.current.editor.isDslReadOnly).toBe(owner === 'structural layout');
        },
      );

      it('TR94-F6: palette Reflow follows a passive owner while Open stays available', async () => {
        const { result } = await ready();
        vi.useFakeTimers();
        try {
          dragNode(result);
          expect(result.current.canvas.mutationsDisabled).toBe(false);
          expect(result.current.canvas.reflowDisabled).toBe(true);
          expect(command(result, 'reflow').disabled).toBe(true);
          expect(command(result, 'open').disabled).toBe(false);
          clearAnnouncement(result);
          act(() => { command(result, 'reflow').action({ invoker: null }); });
          expect(result.current.guidanceAnnouncement).toBe(REFLOW);
          await stepTimersUntil(() => !command(result, 'reflow').disabled, 'passive print-back publishes');
        } finally {
          vi.useRealTimers();
        }
        expect(result.current.canvas.reflowDisabled).toBe(false);
      });

      it('TR94-F8: Save keeps the exact pending draft and export stays blocked while source is pending', async () => {
        const { result } = await ready(true);
        const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
        act(() => { result.current.header.onOpenFile({ name: 'pending-save.coral', text: source }); });
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:s94-pending');
        const typed = `${source}\npending service as "Pending"`;
        act(() => result.current.editor.onDslChange(typed));
        let saved!: ReturnType<typeof result.current.header.onSave>;
        act(() => { saved = result.current.header.onSave(); });
        expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: typed });
        expect(result.current.guidanceAnnouncement).toBe('Saved your source text exactly as written; it does not render yet.');
        act(() => { command(result, 'export-svg').action({ invoker: null }); });
        expect(result.current.rasterExportError).toBe('Export is unavailable until the current source has rendered successfully.');
        expect(createObjectUrl).not.toHaveBeenCalled();
        createObjectUrl.mockRestore();
      });

      it('TR94-F8: Save keeps the accepted GraphIR edit and export stays blocked during held layout', async () => {
        const { result } = await ready(true);
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:s94-structural');
        const release = await beginHeldStructuralLayout(result);
        // The old display is retained; the accepted GraphIR input is already
        // document authority, and the Coral text is its read-only preview.
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
        expect(result.current.editor.dsl).toContain('"Added"');
        let saved!: ReturnType<typeof result.current.header.onSave>;
        act(() => { saved = result.current.header.onSave(); });
        expect(saved.content.format).toBe('graph-ir');
        expect(saved.content.graphIR!.nodes.map((node) => node.id)).toContain('added');
        expect(result.current.guidanceAnnouncement).not.toContain('Saved your source text');
        expect(result.current.header.isDirty).toBe(false);
        expect(result.current.header.lastSaveTime).toEqual(expect.any(Number));
        act(() => { command(result, 'export-svg').action({ invoker: null }); });
        expect(result.current.rasterExportError).toBe('Export is unavailable until the current source has rendered successfully.');
        expect(createObjectUrl).not.toHaveBeenCalled();
        await settleStructural(result, release);
        expect(result.current.header.isDirty).toBe(false);
        // The saved graph reopens as the structural edit.
        let reopened = false;
        act(() => { reopened = result.current.header.onOpenFile({ name: 'held.coral.json', text: JSON.stringify(saved) }); });
        expect(reopened).toBe(true);
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b', 'added']));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        expect(result.current.editor.dsl).toContain('"Added"');
        expect(saveInAct(result).content.graphIR!.nodes.map((node) => node.id)).toEqual(['a', 'b', 'added']);
        createObjectUrl.mockRestore();
        await quiesce(result);
      });

      // An AbortError is reachable only through unmount, which bypasses the
      // helper by design (design §7.3); the layout client reports any other
      // rejection as a layout failure, so rejection is the reachable terminal.
      it('TR94-F8: a rejected structural layout retires its owner and leaves one recoverable snapshot', async () => {
        const { result } = await ready(true);
        const dslBefore = result.current.editor.dsl;
        const undoBefore = result.current.canvas.undoCount;
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:s94-failure');
        layout.mockRejectedValueOnce(new Error('Structural layout exploded'));
        const callsBefore = layout.mock.calls.length;
        act(() => { command(result, 'create-node').action({ invoker: null }); });
        act(() => { result.current.authoring!.onSubmitNode({ symbolId: 'arch-service', label: 'Added' }); });
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        expect(result.current.canvas.mutationsDisabled).toBe(false);
        expect(result.current.editor.isDslReadOnly).toBe(true);
        expect(result.current.canvas.isLoading).toBe(false);
        // Blocked-source policy: the failure is listed and the canvas is view-only
        // until repair or Undo, rather than locked by a leftover structural owner.
        expect(result.current.sourceErrorsLocked).toBe(true);
        expect(result.current.editor.parseErrors.map((error) => error.message))
          .toContainEqual(expect.stringContaining('Automatic layout failed; existing geometry was retained.'));
        // The prior accepted display is retained and export is blocked.
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
        act(() => { command(result, 'export-svg').action({ invoker: null }); });
        expect(result.current.rasterExportError).toMatch(/^Export blocked: .*failed: .+/);
        expect(createObjectUrl).not.toHaveBeenCalled();
        // Exactly the one pre-operation snapshot, and Undo restores the prior document.
        expect(result.current.canvas.undoCount).toBe(undoBefore + 1);
        clearAnnouncement(result);
        act(() => result.current.canvas.onUndo());
        expectNoRefusal(result, 'undo after failure');
        expect(result.current.editor.dsl).toBe(dslBefore);
        expect(result.current.canvas.undoCount).toBe(undoBefore);
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
        expect(saveInAct(result).content.graphIR!.nodes.map((node) => node.id)).toEqual(['a', 'b']);
        expect(result.current.sourceErrorsLocked).toBe(false);
        createObjectUrl.mockRestore();
        await quiesce(result);
      });

      // The original App font-rebase invariant held a *text* layout, which is
      // now source-owned, so Font Apply is refused there. Design §14 relies on
      // the same rebase for the in-flight layout no source owner holds: a
      // passive resolution.
      it('TR94-F9: Font Apply rebases a held passive resolution, and passive remeasurement does not cancel it', async () => {
        const { result } = await ready(true);
        const release = holdNextLayout();
        const callsBefore = layout.mock.calls.length;
        const fontDraft = result.current.inspector!.fontDraft;
        const size = (fontDraft.default.size ?? 14) + 8;
        const nodeFontSizes = () => result.current.canvas.nodes.map((node) =>
          (node.data as any)[Symbol.for('@coral-viz/viz/node-view-metadata')]?.font?.size);
        vi.useFakeTimers();
        try {
          act(() => result.current.inspector!.onPropertyChange({
            nodeId: 'a', field: 'label', oldValue: 'Alpha', newValue: 'Alpha edited',
          }));
          await stepTimersUntil(() => layout.mock.calls.length > callsBefore, 'passive resolution requested');
          expect(result.current.canvas.reflowDisabled).toBe(true);
          expect(result.current.canvas.mutationsDisabled).toBe(false);
          clearAnnouncement(result);
          act(() => result.current.inspector!.onApplyFont({ ...fontDraft, default: { ...fontDraft.default, size } }));
          expectNoRefusal(result, 'font apply');
          act(() => result.current.canvas.onNodesChange([{
            id: 'a', type: 'dimensions', dimensions: { width: 120, height: 60 }, resizing: false,
          }]));
          await act(async () => { await release(); });
          await stepTimersUntil(() => layout.mock.calls.length > callsBefore + 1, 'resolution rebased onto the newest font');
          await stepTimersUntil(() => !result.current.canvas.reflowDisabled && !result.current.canvas.isLoading,
            'rebased resolution settles');
        } finally {
          vi.useRealTimers();
        }
        expect(nodeFontSizes()).toEqual([size, size]);
        expect(result.current.editor.dsl).toContain('Alpha edited');
      });

      it('TR94-F11: Undo of an entry captured during a pending print-back leaves Reflow able to lay out', async () => {
        const { result } = await ready();
        act(() => result.current.inspector!.onPropertyChange({
          nodeId: 'a', field: 'label', oldValue: 'Alpha', newValue: 'Alpha one',
        }));
        // A second edit inside the print-back debounce captures the pending
        // envelope (design §14); Undo restores it without a passive owner.
        act(() => result.current.inspector!.onPropertyChange({
          nodeId: 'a', field: 'label', oldValue: 'Alpha one', newValue: 'Alpha two',
        }));
        act(() => result.current.canvas.onUndo());
        expect(result.current.canvas.reflowDisabled).toBe(false);
        expect(command(result, 'reflow').disabled).toBe(false);
        clearAnnouncement(result);
        const callsBefore = layout.mock.calls.length;
        act(() => result.current.canvas.onReflow());
        expect(result.current.guidanceAnnouncement).toBe('');
        expect(result.current.canvas.isReflowing).toBe(true);
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        await waitFor(() => expect(result.current.canvas.isReflowing).toBe(false));
      });

      const SOURCE_ERRORS = 'Fix the source errors before editing the diagram. The canvas is view-only while the source has errors.';

      it('TR94-C2-F5: invalid A and B then valid C publish only C and return source label editing', async () => {
        const { result } = await ready();
        const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\ne = a -> b\n';
        act(() => result.current.header.onOpenFile({ name: 'latest-draft.coral', text: source }));
        await waitFor(() => expect(result.current.editor.dsl).toBe(source));
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const base = result.current.editor.dsl;
        const invalidA = `${base}broken service as "Broken A`;
        const invalidB = `${base}broken service as "Broken B`;
        const valid = `${base}gamma service as "Gamma"\n`;
        vi.useFakeTimers();
        try {
          act(() => result.current.editor.onDslChange(invalidA));
          await stepTimersUntil(() => result.current.sourceErrorsLocked
            && result.current.editor.editorAnalysis.source === invalidA
            && result.current.canvas.updateStatus === null, 'invalid A blocks and retires its owner');
          act(() => result.current.editor.onDslChange(invalidB));
          expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
          await stepTimersUntil(() => result.current.editor.editorAnalysis.source === invalidB
            && result.current.canvas.updateStatus === null, 'invalid B blocks and retires its owner');
          expect(result.current.sourceErrorsLocked).toBe(true);
          const release = holdNextLayout();
          const callsBefore = layout.mock.calls.length;
          act(() => result.current.editor.onDslChange(valid));
          await stepTimersUntil(() => layout.mock.calls.length > callsBefore, 'valid C lays out');
          expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
          await act(async () => { await release(); });
          await stepTimersUntil(() => result.current.canvas.updateStatus === null && !result.current.canvas.isLoading,
            'valid C publishes');
          for (let step = 0; step < 5; step += 1) await act(async () => { await vi.runOnlyPendingTimersAsync(); });
        } finally {
          vi.useRealTimers();
        }
        expect(result.current.editor.dsl).toBe(valid);
        expect(result.current.sourceErrorsLocked).toBe(false);
        expect(result.current.canvas.updateStatus).toBeNull();
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b', 'gamma']);
        act(() => result.current.editor.onEditSessionEnd());
        clearAnnouncement(result);
        act(() => result.current.canvas.onLabelEdit('a', 'Alpha revised'));
        expect(result.current.guidanceAnnouncement).toBe('');
        const edited = valid.replace('a service as "Alpha"', 'a service as "Alpha revised"');
        await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        act(() => result.current.canvas.onUndo());
        await waitFor(() => expect(result.current.editor.dsl).toBe(valid));
        act(() => result.current.canvas.onRedo());
        await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
        let saved!: ReturnType<typeof result.current.header.onSave>;
        act(() => { saved = result.current.header.onSave(); });
        expect((saved.content as { text: string }).text).toBe(edited);
        act(() => result.current.header.onOpenFile({ name: 'latest-draft.coral.json', text: JSON.stringify(saved) }));
        await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
          .toEqual(['a', 'b', 'gamma']));
      });

      it('TR94-C2-F5: invalid source then its repair retires the owner and returns source label editing', async () => {
        const { result } = await ready();
        const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\ne = a -> b\n';
        act(() => result.current.header.onOpenFile({ name: 'repair-draft.coral', text: source }));
        await waitFor(() => expect(result.current.editor.dsl).toBe(source));
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const base = result.current.editor.dsl;
        const invalid = `${base}broken service as "Broken`;
        const repaired = `${base}repaired service as "Repaired"\n`;
        vi.useFakeTimers();
        try {
          act(() => result.current.editor.onDslChange(invalid));
          await stepTimersUntil(() => result.current.sourceErrorsLocked
            && result.current.editor.editorAnalysis.source === invalid
            && result.current.canvas.updateStatus === null, 'invalid source blocks and retires its owner');
          expect(result.current.canvas.updateStatus).toBeNull();
          clearAnnouncement(result);
          act(() => result.current.canvas.onLabelEdit('a', 'Blocked'));
          expect(result.current.guidanceAnnouncement).toBe(SOURCE_ERRORS);
          expect(result.current.editor.dsl).toBe(invalid);
          act(() => result.current.editor.onDslChange(repaired));
          await stepTimersUntil(() => !result.current.sourceErrorsLocked
            && result.current.canvas.updateStatus === null && !result.current.canvas.isLoading,
          'repair publishes');
          for (let step = 0; step < 5; step += 1) await act(async () => { await vi.runOnlyPendingTimersAsync(); });
        } finally {
          vi.useRealTimers();
        }
        expect(result.current.canvas.nodes.map((node) => node.id)).toContain('repaired');
        act(() => result.current.editor.onEditSessionEnd());
        clearAnnouncement(result);
        act(() => result.current.canvas.onLabelEdit('a', 'Alpha revised'));
        expect(result.current.guidanceAnnouncement).toBe('');
        await waitFor(() => expect(result.current.editor.dsl)
          .toBe(repaired.replace('a service as "Alpha"', 'a service as "Alpha revised"')));
      });

      /** Unmount flushes the queued autosave; a new controller recovers it. */
      const recoverInNewController = async (hook: { unmount: () => void }) => {
        hook.unmount();
        const stored = JSON.parse(window.localStorage.getItem('coral-diagram-recovery') ?? 'null');
        expect(stored).not.toBeNull();
        const next = renderHook(() => useEditorController());
        lastResult = next.result;
        await waitFor(() => expect(next.result.current.recovery.hasData).toBe(true));
        act(() => next.result.current.recovery.onRecover());
        return { next, stored };
      };

      it('TR94-C2-F1: a failed GraphIR structural edit recovers its accepted graph, not the retained display', async () => {
        const hook = await ready(true);
        layout.mockRejectedValueOnce(new Error('Structural layout exploded'));
        const callsBefore = layout.mock.calls.length;
        act(() => { command(hook.result, 'create-node').action({ invoker: null }); });
        act(() => { hook.result.current.authoring!.onSubmitNode({ symbolId: 'arch-service', label: 'Added' }); });
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        await waitFor(() => expect(hook.result.current.sourceErrorsLocked).toBe(true));
        expect(hook.result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
        const { next, stored } = await recoverInNewController(hook);
        expect(stored.document.content.format).toBe('graph-ir');
        expect(stored.document.content.graphIR.nodes.map((node: { id: string }) => node.id)).toContain('added');
        const { result } = next;
        // The recovered graph, not the display retained over its failure, is
        // the document: it is laid out again and Save keeps the edit.
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('added'));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        expect(result.current.editor.dsl).toContain('"Added"');
        expect(saveInAct(result).content.graphIR!.nodes.map((node) => node.id)).toContain('added');
        await quiesce(result);
      });

      it('TR94-C2-F1: typed source still owned by a held layout recovers as that source', async () => {
        const hook = await ready();
        const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
        act(() => { hook.result.current.header.onOpenFile({ name: 'current.coral', text: source }); });
        await waitFor(() => expect(hook.result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
        await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
        const draft = `${source}\ngamma service as "Gamma"`;
        holdNextLayout();
        const callsBefore = layout.mock.calls.length;
        vi.useFakeTimers();
        try {
          act(() => hook.result.current.editor.onDslChange(draft));
          await stepTimersUntil(() => layout.mock.calls.length > callsBefore, 'typed source layout requested');
          expect(hook.result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
        } finally {
          vi.useRealTimers();
        }
        const { next, stored } = await recoverInNewController(hook);
        expect(stored.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: draft });
        expect(stored.dsl).toBe(draft);
        const { result } = next;
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('gamma'));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: draft });
        await quiesce(result);
      });

      const PENDING_EXPORT = 'Export is unavailable until the current source has rendered successfully.';
      const draftRecovery = (text: string, overrides: Record<string, unknown> = {}) => ({
        timestamp: Date.now(), documentName: 'Recovered draft', dslType: 'coral', dsl: text,
        notation: 'architecture', nodePositions: {},
        document: {
          schemaVersion: '1.0.0',
          metadata: { name: 'Recovered draft', created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z' },
          content: { format: 'dsl', dslType: 'coral', text },
          settings: { notation: 'architecture', layout: { algorithm: 'layered', direction: 'RIGHT' } },
          ...overrides,
        },
      });
      const DRAFT_TEXT = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\ndraft service as "Draft only"\na -> b';
      const exportBlockedWith = (result: Hook, diagnostic: string | RegExp) => {
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:s94-c3');
        act(() => { command(result, 'export').action({ invoker: null }); });
        act(() => { command(result, 'export-svg').action({ invoker: null }); });
        if (typeof diagnostic === 'string') expect(result.current.rasterExportError).toBe(diagnostic);
        else expect(result.current.rasterExportError).toMatch(diagnostic);
        expect(createObjectUrl).not.toHaveBeenCalled();
        createObjectUrl.mockRestore();
      };

      it.each([
        ['Coral text', { name: 'held.coral', text: DRAFT_TEXT }],
        ['a Coral source draft', { name: 'held.coral.json', text: JSON.stringify(draftRecovery(DRAFT_TEXT).document) }],
      ] as const)('TR94-C3-F1: Save and export stay exact while an opened %s is still laying out', async (_kind, file) => {
        const { result } = await ready();
        const release = holdNextLayout();
        const callsBefore = layout.mock.calls.length;
        let opened = false;
        act(() => { opened = result.current.header.onOpenFile(file); });
        expect(opened).toBe(true);
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        // The opened text is only source until its parse publishes: the shell
        // display cannot stand for it, and canvas mutation is refused.
        expect(result.current.canvas.nodes.map((node) => node.id)).not.toContain('draft');
        expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
        expect(command(result, 'create-node').disabled).toBe(true);
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: DRAFT_TEXT });
        exportBlockedWith(result, PENDING_EXPORT);
        await act(async () => { await release(); });
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b', 'draft']));
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        // Retiring the owner clears only its refusal copy, not this outcome.
        expect(result.current.guidanceAnnouncement).toBe('Saved your source text exactly as written; it does not render yet.');
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: DRAFT_TEXT });
        await quiesce(result);
      });

      it('TR94-C3-F1: a Mermaid import saves exact source while its layout is pending', async () => {
        const { result } = await ready();
        const release = holdNextLayout();
        const callsBefore = layout.mock.calls.length;
        const source = 'graph TD\n  alpha[Alpha] --> beta[Beta]';
        let opened = false;
        act(() => { opened = result.current.header.onOpenFile({ name: 'held.mmd', text: source }); });
        expect(opened).toBe(true);
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        const saved = saveInAct(result);
        expect(saved.content).toEqual({ format: 'dsl', dslType: 'mermaid', text: source });
        expect(result.current.editor.dsl).toBe(source);
        exportBlockedWith(result, PENDING_EXPORT);
        await act(async () => { await release(); });
        await quiesce(result);
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['alpha', 'beta']);
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'mermaid', text: source });
      });

      it('TR94-C3-F1: Save and export stay exact while a recovered source draft is still laying out', async () => {
        window.localStorage.setItem('coral-diagram-recovery', JSON.stringify(draftRecovery(DRAFT_TEXT)));
        const hook = renderHook(() => useEditorController());
        lastResult = hook.result;
        const { result } = hook;
        await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const release = holdNextLayout();
        const callsBefore = layout.mock.calls.length;
        act(() => result.current.recovery.onRecover());
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        expect(result.current.editor.dsl).toBe(DRAFT_TEXT);
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: DRAFT_TEXT });
        exportBlockedWith(result, PENDING_EXPORT);
        await act(async () => { await release(); });
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b', 'draft']));
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: DRAFT_TEXT });
        await quiesce(result);
      });

      const OTHER_TEXT = '@diagram architecture\nother service as "Other"\nstore database as "Store"\nother -> store';
      const openHeldText = async (result: Hook, file: { name: string; text: string }) => {
        const release = holdNextLayout();
        const callsBefore = layout.mock.calls.length;
        let opened = false;
        act(() => { opened = result.current.header.onOpenFile(file); });
        expect(opened).toBe(true);
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
        return release;
      };

      const failDraftLayout = async () => {
        window.localStorage.setItem('coral-diagram-recovery', JSON.stringify(
          draftRecovery(DRAFT_TEXT, { nodePositions: { a: { x: 999, y: 777 } } }),
        ));
        const hook = renderHook(() => useEditorController());
        lastResult = hook.result;
        await waitFor(() => expect(hook.result.current.recovery.hasData).toBe(true));
        await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
        const callsBefore = layout.mock.calls.length;
        layout.mockRejectedValueOnce(new Error('Draft layout exploded'));
        act(() => hook.result.current.recovery.onRecover());
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        await waitFor(() => expect(hook.result.current.sourceErrorsLocked).toBe(true));
        return hook.result;
      };

      it('TR94-C6-F2: a failed source draft refuses AI replacement and keeps exact authored text', async () => {
        const result = await failDraftLayout();
        const undoBefore = result.current.canvas.undoCount;
        let outcome: unknown;
        await act(async () => {
          outcome = await llmChatBridge.current.onDslGenerated(
            '@diagram architecture\na service as "Alpha"\nfresh service as "Fresh"\na -> fresh', 'coral',
          );
        });
        expect(outcome).toEqual({ applied: false, reason: 'layout-blocked', message: AI_APPLY });
        expect(result.current.editor.dsl).toBe(DRAFT_TEXT);
        expect(result.current.canvas.nodes.map((node) => node.id)).not.toContain('fresh');
        expect(result.current.canvas.undoCount).toBe(undoBefore);
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: DRAFT_TEXT });
        await quiesce(result);
      });

      // Design §11/§14: a typed repair of the recovered draft keeps the
      // draft's positions. Recovery positions are keyed by node id, so a typed
      // replacement that reuses an id cannot be told apart from a repair.
      it('TR94-C6-F2: a typed repair after a failed draft layout keeps the draft positions', async () => {
        const result = await failDraftLayout();
        act(() => result.current.editor.onDslChange(`${DRAFT_TEXT}\nrepair service as "Repair"`));
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('repair'));
        await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(false));
        expect(result.current.canvas.nodes.find((node) => node.id === 'a')!.position).toEqual({ x: 999, y: 777 });
        await quiesce(result);
      });

      it.each(['preempted', 'failed'] as const)(
        'TR94-C5-F1: a GraphIR open after a %s draft layout keeps its own positions',
        async (kind) => {
          const withPositions = draftRecovery(DRAFT_TEXT, { nodePositions: { a: { x: 999, y: 777 } } });
          window.localStorage.setItem('coral-diagram-recovery', JSON.stringify(withPositions));
          const hook = renderHook(() => useEditorController());
          lastResult = hook.result;
          const { result } = hook;
          await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
          await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
          const callsBefore = layout.mock.calls.length;
          if (kind === 'preempted') holdNextLayout();
          else layout.mockRejectedValueOnce(new Error('Draft layout exploded'));
          act(() => result.current.recovery.onRecover());
          await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
          if (kind === 'failed') await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
          let replaced = false;
          act(() => { replaced = result.current.header.onLoad(s94Document('opened-over-draft') as any) as unknown as boolean; });
          expect(replaced).toBe(true);
          await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
          await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
          // The opened document's own layout, not the recovered draft's positions.
          expect(result.current.canvas.nodes.find((node) => node.id === 'a')!.position).toEqual({ x: 0, y: 0 });
          await quiesce(result);
        },
      );

      it('TR94-C4-F3: a document replacement preempts a clean text open, and its late layout changes nothing', async () => {
        const { result } = await ready();
        const releaseFirst = await openHeldText(result, { name: 'first.coral', text: DRAFT_TEXT });
        expect(command(result, 'open').disabled).toBe(false);
        const confirm = vi.mocked(window.confirm);
        confirm.mockClear();
        clearAnnouncement(result);
        let replaced = false;
        act(() => { replaced = result.current.header.onLoad(s94Document('preempting') as any) as unknown as boolean; });
        expect(replaced).toBe(true);
        expect(confirm).not.toHaveBeenCalled();
        expectNoRefusal(result, 'open over a clean text open');
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        expect(result.current.canvas.updateStatus).toBeNull();
        // The preempted open's late layout neither publishes nor retires anything.
        await act(async () => { await releaseFirst(); });
        await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
        expect(result.current.editor.dsl).not.toContain('Draft only');
        expect(saveInAct(result).content.graphIR!.nodes.map((node) => node.id)).toEqual(['a', 'b']);
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:s94-c4');
        act(() => { command(result, 'export').action({ invoker: null }); });
        expect(result.current.rasterExportError).toBeNull();
        expect(createObjectUrl).toHaveBeenCalledOnce();
        createObjectUrl.mockRestore();
        await quiesce(result);
      });

      it('TR94-C4-F3: a text open preempting a text open keeps the newer owner until its own layout', async () => {
        const { result } = await ready();
        const releaseFirst = await openHeldText(result, { name: 'first.coral', text: DRAFT_TEXT });
        const releaseSecond = await openHeldText(result, { name: 'second.coral', text: OTHER_TEXT });
        await act(async () => { await releaseFirst(); });
        expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: OTHER_TEXT });
        await act(async () => { await releaseSecond(); });
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['other', 'store']));
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        await quiesce(result);
      });

      it('TR94-C4-F3: preempting a recovered draft still asks, and an edited open is not preempted', async () => {
        window.localStorage.setItem('coral-diagram-recovery', JSON.stringify(draftRecovery(DRAFT_TEXT)));
        const hook = renderHook(() => useEditorController());
        lastResult = hook.result;
        const { result } = hook;
        await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const release = holdNextLayout();
        const callsBefore = layout.mock.calls.length;
        act(() => result.current.recovery.onRecover());
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        // Recovered work is confirm-protected even while its open owns the source.
        const confirm = vi.mocked(window.confirm);
        confirm.mockClear();
        confirm.mockReturnValueOnce(false);
        let replaced = true;
        act(() => { replaced = result.current.header.onLoad(s94Document('preempting') as any) as unknown as boolean; });
        expect(replaced).toBe(false);
        expect(confirm).toHaveBeenCalledOnce();
        expect(result.current.editor.dsl).toBe(DRAFT_TEXT);
        expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
        // Typing into the opened text makes it the user's edit: Open is refused.
        act(() => result.current.editor.onDslChange(`${DRAFT_TEXT}\ntyped service as "Typed"`));
        confirm.mockClear();
        clearAnnouncement(result);
        act(() => { replaced = result.current.header.onLoad(s94Document('preempting') as any) as unknown as boolean; });
        expect(replaced).toBe(false);
        expect(confirm).not.toHaveBeenCalled();
        expect(result.current.guidanceAnnouncement).toBe(OPEN);
        await act(async () => { await release(); });
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('typed'));
        await quiesce(result);
      });

      it.each(['source pending', 'structural layout', 'opened text'] as const)(
        'TR94-C4-F1: a %s owner refuses a prompt before Send and reports it so the composer keeps it',
        async (owner) => {
          const { result } = await ready(true);
          let release: (() => Promise<void>) | undefined;
          if (owner === 'opened text') {
            release = await openHeldText(result, { name: 'held.coral', text: DRAFT_TEXT });
          } else if (owner === 'source pending') {
            act(() => { result.current.header.onOpenFile({ name: 'current.coral', text: DRAFT_TEXT }); });
            await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b', 'draft']));
            await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
            act(() => result.current.editor.onDslChange(`${DRAFT_TEXT}\npending service as "Pending"`));
            expect(result.current.canvas.updateStatus).toEqual({ kind: 'source-pending', message: SOURCE });
          } else release = await beginHeldStructuralLayout(result);
          const sourceOwned = owner !== 'structural layout';
          const refusal = sourceOwned
            ? 'Edit this 0.2.8 diagram in Coral source; inline node labels, selected connector labels, and semantic-port connections preserve its authored notation.'
            : AI_REQUEST;
          expect(result.current.editor.promptDisabledReason).toBe(refusal);
          clearAnnouncement(result);
          let accepted: boolean | void = true;
          act(() => { accepted = result.current.editor.onPromptSubmit('add a cache'); });
          expect(accepted).toBe(false);
          expect(result.current.guidanceAnnouncement).toBe(refusal);
          if (release) await act(async () => { await release(); });
          await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
          expect(result.current.editor.promptDisabledReason).toBe(sourceOwned ? refusal : undefined);
          if (!sourceOwned) expect(result.current.guidanceAnnouncement).toBe('');
          await quiesce(result);
        },
      );

      it('TR94-C4-F6: Save and export before the startup layout lands keep the startup source', async () => {
        const release = holdNextLayout();
        const hook = renderHook(() => useEditorController());
        lastResult = hook.result;
        const { result } = hook;
        await waitFor(() => expect(layout).toHaveBeenCalled());
        expect(result.current.canvas.nodes).toHaveLength(0);
        const startup = result.current.editor.dsl;
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: result.current.editor.dslType, text: startup });
        exportBlockedWith(result, PENDING_EXPORT);
        await act(async () => { await release(); });
        await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'mermaid', text: startup });
        await quiesce(result);
      });

      // Startup claims no owner (design §14): claiming one would also refuse the
      // format switch and AI prompts that existing startup journeys issue. A
      // Reflow that does not run must still leave the startup work clean.
      it('TR94-C5-F4: a Reflow during the startup layout does not run and dirties nothing', async () => {
        const release = holdNextLayout();
        const hook = renderHook(() => useEditorController());
        lastResult = hook.result;
        const { result } = hook;
        await waitFor(() => expect(layout).toHaveBeenCalled());
        const callsBefore = layout.mock.calls.length;
        act(() => result.current.canvas.onReflow());
        expect(result.current.canvas.isReflowing).toBe(false);
        expect(layout.mock.calls.length).toBe(callsBefore);
        await act(async () => { await release(); });
        await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const confirm = vi.mocked(window.confirm);
        confirm.mockClear();
        let replaced = false;
        act(() => { replaced = result.current.header.onLoad(s94Document('after-startup-reflow') as any) as unknown as boolean; });
        expect(replaced).toBe(true);
        expect(confirm).not.toHaveBeenCalled();
        await quiesce(result);
      });

      it('TR94-C6-F3: a no-op Undo or Redo leaves the previous session recovery record intact', async () => {
        const previous = {
          timestamp: Date.now(), documentName: 'Previous session', dslType: 'coral', dsl: 'service "Previous" as previous',
          notation: 'flowchart', nodePositions: {},
        };
        window.localStorage.setItem('coral-diagram-recovery', JSON.stringify(previous));
        const hook = renderHook(() => useEditorController());
        await waitFor(() => expect(hook.result.current.recovery.hasData).toBe(true));
        await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
        await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
        expect(hook.result.current.canvas.canUndo).toBe(false);
        act(() => hook.result.current.canvas.onUndo());
        act(() => hook.result.current.canvas.onRedo());
        // Unmount flushes any queued autosave; nothing ran, so none is queued.
        hook.unmount();
        expect(JSON.parse(window.localStorage.getItem('coral-diagram-recovery')!)).toMatchObject({
          documentName: 'Previous session', dsl: 'service "Previous" as previous',
        });
      });

      it('TR94-C5-F5: a failed authoring submit or an empty Reflow leaves clean work unprotected', async () => {
        const { result } = await ready();
        act(() => { command(result, 'create-edge').action({ invoker: null }); });
        let failed: unknown;
        act(() => { failed = result.current.authoring!.onSubmitEdge({
          sourceId: 'a', sourcePortId: 'out', targetId: 'a', targetPortId: 'in',
        }); });
        expect(failed).toMatchObject({ ok: false });
        act(() => result.current.authoring!.onCancel());
        act(() => { command(result, 'create-node').action({ invoker: null }); });
        act(() => { failed = result.current.authoring!.onSubmitNode({ symbolId: 'not-in-this-notation', label: 'Nope' }); });
        expect(failed).toEqual({ ok: false, error: 'The selected symbol is no longer available in this notation.' });
        act(() => result.current.authoring!.onCancel());
        const confirm = vi.mocked(window.confirm);
        confirm.mockClear();
        let replaced = false;
        act(() => { replaced = result.current.header.onLoad(s94Document('after-failed-submit') as any) as unknown as boolean; });
        expect(replaced).toBe(true);
        expect(confirm).not.toHaveBeenCalled();
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        // A Reflow of an empty document does not run and dirties nothing.
        act(() => { replaced = result.current.header.onLoad(createBlankDocument()) as unknown as boolean; });
        expect(replaced).toBe(true);
        await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(0));
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        act(() => result.current.canvas.onReflow());
        expect(result.current.canvas.isReflowing).toBe(false);
        confirm.mockClear();
        act(() => { replaced = result.current.header.onLoad(s94Document('after-empty-reflow') as any) as unknown as boolean; });
        expect(replaced).toBe(true);
        expect(confirm).not.toHaveBeenCalled();
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        await quiesce(result);
      });

      it('TR94-C4-F4: every refused Welcome open names its own reason', async () => {
        const { result, rerender } = await ready();
        const file = { name: 'welcome.coral', text: OTHER_TEXT };
        act(() => { result.current.header.onOpenFile({ name: 'current.coral', text: DRAFT_TEXT }); });
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b', 'draft']));
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        act(() => result.current.editor.onDslChange(`${DRAFT_TEXT}\npending service as "Pending"`));
        clearAnnouncement(result);
        let accepted = true;
        act(() => { accepted = result.current.welcome.onOpenFile(file) as boolean; });
        expect(accepted).toBe(false);
        expect(result.current.guidanceAnnouncement).toBe(OPEN);
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        llmChatBridge.mutationPending = true;
        rerender();
        clearAnnouncement(result);
        act(() => { accepted = result.current.welcome.onOpenFile(file) as boolean; });
        expect(accepted).toBe(false);
        expect(result.current.guidanceAnnouncement).toBe('Wait for the assistant to finish before opening another document.');
        llmChatBridge.mutationPending = false;
        rerender();
        await quiesce(result);
      });

      it('TR94-C3-F2: draft recovery follows the Open refusal, confirmation, and dirty-state rules', async () => {
        window.localStorage.setItem('coral-diagram-recovery', JSON.stringify(draftRecovery(DRAFT_TEXT)));
        const confirm = vi.mocked(window.confirm);
        const hook = renderHook(() => useEditorController());
        lastResult = hook.result;
        const { result } = hook;
        await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        act(() => result.current.editor.onDslTypeChange('coral'));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));

        // A live source owner refuses it with the Open copy, before confirmation.
        act(() => result.current.editor.onDslChange('service "Current work" as current'));
        const current = result.current.editor.dsl;
        confirm.mockClear();
        clearAnnouncement(result);
        act(() => result.current.recovery.onRecover());
        expect(result.current.guidanceAnnouncement).toBe(OPEN);
        expect(confirm).not.toHaveBeenCalled();
        expect(result.current.editor.dsl).toBe(current);
        expect(result.current.recovery.hasData).toBe(true);
        await waitFor(() => expect(result.current.canvas.mutationsDisabled).toBe(false));

        // Dirty work asks first; cancelling keeps it.
        confirm.mockClear();
        confirm.mockReturnValueOnce(false);
        act(() => result.current.recovery.onRecover());
        expect(confirm).toHaveBeenCalledOnce();
        expect(result.current.guidanceAnnouncement).toBe('Document replacement cancelled. Your current work is unchanged.');
        expect(result.current.editor.dsl).toBe(current);
        expect(result.current.recovery.hasData).toBe(true);

        // Accepting recovers the draft, which is then confirm-protected work.
        confirm.mockClear();
        act(() => result.current.recovery.onRecover());
        expect(confirm).toHaveBeenCalledOnce();
        expect(result.current.guidanceAnnouncement).toBe('Recovered your unsaved work.');
        expect(result.current.editor.dsl).toBe(DRAFT_TEXT);
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b', 'draft']));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        expect(result.current.guidanceAnnouncement).toBe('Recovered your unsaved work.');
        confirm.mockClear();
        confirm.mockReturnValueOnce(false);
        let replaced = true;
        act(() => { replaced = result.current.header.onLoad(s94Document('after-draft-recovery') as any) as unknown as boolean; });
        expect(replaced).toBe(false);
        expect(confirm).toHaveBeenCalledOnce();
        expect(result.current.editor.dsl).toBe(DRAFT_TEXT);
        await quiesce(result);
      });

      it('TR94-C3-F2: an invalid recovered draft is reported and leaves current work unchanged', async () => {
        window.localStorage.setItem('coral-diagram-recovery', JSON.stringify(
          draftRecovery(DRAFT_TEXT, { schemaVersion: 'not-a-version' }),
        ));
        const hook = renderHook(() => useEditorController());
        lastResult = hook.result;
        const { result } = hook;
        await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const before = result.current.editor.dsl;
        const nodeIds = result.current.canvas.nodes.map((node) => node.id);
        clearAnnouncement(result);
        act(() => result.current.recovery.onRecover());
        expect(result.current.guidanceAnnouncement)
          .toBe('The recovery data is invalid and was not opened. Your current work is unchanged.');
        expect(result.current.openFailure).toMatchObject({ fileName: 'Recovered draft', reasons: [expect.anything()] });
        expect(result.current.editor.dsl).toBe(before);
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(nodeIds);
        expect(result.current.recovery.hasData).toBe(true);
        await quiesce(result);
      });

      it('TR94-C3-F3: an autosave inside a pending GraphIR preview recovers its authoritative graph', async () => {
        const hook = await ready();
        vi.useFakeTimers();
        try {
          act(() => hook.result.current.inspector!.onPropertyChange({
            nodeId: 'a', field: 'label', oldValue: 'Alpha', newValue: 'Renamed',
          }));
          expect(hook.result.current.canvas.reflowDisabled).toBe(true);
          expect(hook.result.current.editor.dsl).not.toContain('Renamed');
          // Unmount inside the print-back debounce: the queued autosave flushes.
          hook.unmount();
        } finally {
          vi.useRealTimers();
        }
        const stored = JSON.parse(window.localStorage.getItem('coral-diagram-recovery')!);
        expect(stored.document.content.graphIR.nodes.find((node: any) => node.id === 'a').label).toBe('Renamed');
        const next = renderHook(() => useEditorController());
        lastResult = next.result;
        const { result } = next;
        await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
        act(() => result.current.recovery.onRecover());
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'a')?.data?.label).toBe('Renamed'));
        expect(result.current.editor.dsl).toContain('"Renamed"');
        expect(result.current.editor.dsl).not.toContain('"Alpha"');
        // Generated text is a read-only view of the recovered GraphIR document.
        const preview = result.current.editor.dsl;
        act(() => result.current.editor.onDslChange(`${preview}\ngamma service as "Gamma"`));
        expect(result.current.editor.dsl).toBe(preview);
        expect(saveInAct(result).content.graphIR!.nodes.find((node) => node.id === 'a')!.label).toBe('Renamed');
        await quiesce(result);
      });

      it('TR94-C4-F5: a pending GraphIR preview snapshot keeps the graph that later print-back displays', async () => {
        const rename = (hook: { result: Hook }) => act(() => hook.result.current.inspector!.onPropertyChange({
          nodeId: 'a', field: 'label', oldValue: 'Alpha', newValue: 'Renamed',
        }));
        const snapshotHook = await ready();
        vi.useFakeTimers();
        try {
          rename(snapshotHook);
          snapshotHook.unmount();
        } finally {
          vi.useRealTimers();
        }
        const snapshot = JSON.parse(window.localStorage.getItem('coral-diagram-recovery')!);
        const snapshotGraph = snapshot.document.content.graphIR;
        expect(snapshot.document.content.format).toBe('graph-ir');
        expect(snapshotGraph.nodes.find((node: { id: string }) => node.id === 'a').label).toBe('Renamed');
        const printBackHook = await ready();
        rename(printBackHook);
        await waitFor(() => expect(printBackHook.result.current.editor.dsl).toContain('"Renamed"'));
        const printedGraph = saveInAct(printBackHook.result).content.graphIR!;
        expect(printedGraph.nodes.find((node) => node.id === 'a')?.label).toBe('Renamed');
        expect(snapshotGraph.edges[0].routeIntent).toEqual(printedGraph.edges[0].routeIntent);
        await quiesce(printBackHook.result);
      });

      it('TR94-C3-F4: a reload during a hung structural layout recovers the structural edit', async () => {
        const hook = await ready(true);
        await beginHeldStructuralLayout(hook.result);
        // The held layout never completes; recovery keeps the pending graph.
        const { next, stored } = await recoverInNewController(hook);
        expect(stored.document.content.format).toBe('graph-ir');
        expect(stored.document.content.graphIR.nodes.map((node: { id: string }) => node.id)).toContain('added');
        const { result } = next;
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('added'));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        expect(saveInAct(result).content.graphIR!.nodes.map((node) => node.id)).toContain('added');
        await quiesce(result);
      });

      it('saves an accepted GraphIR structural edit before its layout returns', async () => {
        const { result } = await ready(true);
        const release = await beginHeldStructuralLayout(result);
        const saved = saveInAct(result);
        expect(saved.content.format).toBe('graph-ir');
        expect(saved.content.graphIR!.nodes.map((node) => node.id)).toContain('added');
        expect(result.current.guidanceAnnouncement).not.toContain('Saved your source text');
        await act(async () => { await release(); });
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('added'));
        await quiesce(result);
      });

      it('saves an accepted GraphIR structural edit after its layout fails', async () => {
        const { result } = await ready(true);
        layout.mockRejectedValueOnce(new Error('Structural layout exploded'));
        const callsBefore = layout.mock.calls.length;
        act(() => { command(result, 'create-node').action({ invoker: null }); });
        act(() => { result.current.authoring!.onSubmitNode({ symbolId: 'arch-service', label: 'Added' }); });
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
        const saved = saveInAct(result);
        expect(saved.content.format).toBe('graph-ir');
        expect(saved.content.graphIR!.nodes.map((node) => node.id)).toContain('added');
        expect(result.current.guidanceAnnouncement).not.toContain('Saved your source text');
        await quiesce(result);
      });

      it('TR94-C3-F5: a blocked authored edit, then a syntax error, recovers exact text and fails closed', async () => {
        const hook = await ready(true);
        const source = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
        act(() => { hook.result.current.header.onOpenFile({ name: 'blocked-source.coral', text: source }); });
        await waitFor(() => expect(hook.result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
        await waitFor(() => expect(hook.result.current.canvas.isLoading).toBe(false));
        await waitFor(() => expect(hook.result.current.canvas.updateStatus).toBeNull());
        // Changing connector length requires full layout; an incremental ELK
        // failure instead has a deterministic position fallback.
        const authored = `${source.replace('a -> b', 'a ------> b')}\nadded service as "Added"`;
        layout.mockRejectedValueOnce(new Error('Structural layout exploded'));
        const callsBefore = layout.mock.calls.length;
        act(() => hook.result.current.editor.onDslChange(authored));
        await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
        await waitFor(() => expect(hook.result.current.sourceErrorsLocked).toBe(true));
        expect(hook.result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
        const broken = `${authored}\nbroken service as "Broken`;
        act(() => hook.result.current.editor.onDslChange(broken));
        await waitFor(() => expect(hook.result.current.editor.editorAnalysis.source).toBe(broken));
        expect(hook.result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']);
        const { next, stored } = await recoverInNewController(hook);
        // The saved source is authoritative; the previous in-memory display
        // cannot be reconstructed or claimed for malformed text on reopen.
        expect(stored.document.content).toEqual({ format: 'dsl', dslType: 'coral', text: broken });
        expect(stored.dsl).toBe(broken);
        const { result } = next;
        expect(result.current.editor.dsl).toBe(broken);
        await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual([]);
        expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'coral', text: broken });
        exportBlockedWith(result, /Recovered graph:|Export blocked:/);
        act(() => result.current.editor.onDslChange(authored));
        await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(false));
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b', 'added']));
        await quiesce(result);
      });

      // Adversarial code review cycle 1 (CR94).
      it.each(['source pending', 'structural layout'] as const)(
        'CR94-F1: an aborted or stale AI candidate is reported stale, not owner-refused, while %s',
        async (owner) => {
          const { result } = await ready(true);
          const release = await claimOwner(result, owner);
          const dsl = result.current.editor.dsl;
          const aborted = new AbortController();
          aborted.abort();
          let outcome: unknown;
          await act(async () => {
            outcome = await llmChatBridge.current.onDslGenerated(
              'service "AI change" as ai', 'coral', undefined, undefined, aborted.signal,
            );
          });
          expect(outcome).toBe(false);
          await act(async () => {
            outcome = await llmChatBridge.current.onDslGenerated('service "AI change" as ai', 'coral', undefined, -1);
          });
          expect(outcome).toBe(false);
          // A current candidate is still refused with the owner's apply copy.
          await act(async () => {
            outcome = await llmChatBridge.current.onDslGenerated('service "AI change" as ai', 'coral');
          });
          expect(outcome).toEqual({ applied: false, reason: 'layout-blocked', message: AI_APPLY });
          expect(result.current.editor.dsl).toBe(dsl);
          if (release) await settleStructural(result, release);
        },
      );

      it.each(['source pending', 'structural layout'] as const)(
        'CR94-F2: the canvas gives the Reflow copy for Reflow while %s, and for a passive owner',
        async (owner) => {
          const { result } = await ready(true);
          const release = await claimOwner(result, owner);
          expect(result.current.canvas.mutationDisabledReason).toBe(ownerCopy(owner));
          expect(result.current.canvas.reflowDisabledReason).toBe(REFLOW);
          // The Inspector header chip names the owner compactly (CR94-C2-F1).
          expect(result.current.inspector!.mutationDisabledLabel)
            .toBe(owner === 'structural layout' ? 'Updating diagram' : 'Updating source');
          if (release) await settleStructural(result, release);
          await quiesce(result);
          expect(result.current.canvas.reflowDisabledReason).toBeUndefined();
          expect(result.current.inspector!.mutationDisabledLabel).toBeUndefined();
          dragNode(result);
          if (owner === 'source pending') {
            expect(result.current.canvas.mutationDisabledReason).toBe(SOURCE_028);
            expect(result.current.canvas.reflowDisabled).toBe(false);
          } else {
            expect(result.current.canvas.mutationDisabledReason).toBeUndefined();
            expect(result.current.canvas.reflowDisabled).toBe(true);
            expect(result.current.canvas.reflowDisabledReason).toBe(REFLOW);
          }
          await quiesce(result);
          expect(result.current.canvas.reflowDisabledReason).toBeUndefined();
        },
      );

      it('CR94-C2-F2: a recovery write pending across a replacement keeps the replaced document and its own source', async () => {
        const hook = await ready();
        vi.useFakeTimers();
        try {
          act(() => hook.result.current.inspector!.onPropertyChange({
            nodeId: 'a', field: 'label', oldValue: 'Alpha', newValue: 'Renamed',
          }));
          // Replace the document inside the print-back and recovery debounces.
          let replaced = false;
          act(() => { replaced = hook.result.current.header.onLoad(s94Document('replacement-doc') as any) as unknown as boolean; });
          expect(replaced).toBe(true);
          act(() => { vi.advanceTimersByTime(1100); });
        } finally {
          vi.useRealTimers();
        }
        const stored = JSON.parse(window.localStorage.getItem('coral-diagram-recovery')!);
        expect(stored.document.content.format).toBe('graph-ir');
        expect(stored.document.content.graphIR.id).toBe('s94-review');
        expect(stored.document.content.graphIR.nodes.find((node: { id: string }) => node.id === 'a').label)
          .toBe('Renamed');
        expect(stored.document.content.graphIR.id).not.toBe('replacement-doc');
        await quiesce(hook.result);
      });

      it('CR94-C2-F3: a draft recovery whose plan throws is reported as blocked, like an open', async () => {
        window.localStorage.setItem('coral-diagram-recovery', JSON.stringify(draftRecovery(DRAFT_TEXT)));
        const hook = renderHook(() => useEditorController());
        lastResult = hook.result;
        const { result } = hook;
        await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const before = result.current.editor.dsl;
        clearAnnouncement(result);
        sourceReaderBridge.throwOnDraft = true;
        try {
          act(() => result.current.recovery.onRecover());
        } finally {
          sourceReaderBridge.throwOnDraft = false;
        }
        expect(result.current.guidanceAnnouncement)
          .toBe('The recovery data is invalid and was not opened. Your current work is unchanged.');
        expect(result.current.openFailure).toMatchObject({
          fileName: 'Recovered draft',
          reasons: [expect.objectContaining({ code: 'coral.open.failed', message: 'source reader crashed' })],
        });
        expect(result.current.editor.dsl).toBe(before);
        expect(result.current.recovery.hasData).toBe(true);
        await quiesce(result);
      });

      const sourceLine = (result: Hook, id: string) => result.current.editor.dsl.split('\n')
        .find((line) => line.includes(` as ${id}`)) ?? '';
      const dragTo = (result: Hook, id: string, x: number, y: number) => act(() => {
        result.current.canvas.onNodesChange([{ id, type: 'position', position: { x, y } }]);
      });

      it('CR94-C3-F2: a replacement drops the replaced document\'s exact-position claims', async () => {
        const { result } = await ready();
        dragTo(result, 'a', 40, 40);
        // Replace inside the drag's print-back debounce, with an unpositioned a.
        const replacement = s94Document('replacement-unpositioned');
        replacement.content.graphIR.nodes[0] = { id: 'a', type: 'service', label: 'Alpha2' } as any;
        let replaced = false;
        act(() => { replaced = result.current.header.onLoad(replacement as any) as unknown as boolean; });
        expect(replaced).toBe(true);
        await quiesce(result);
        expect(sourceLine(result, 'a')).not.toContain('@');
        dragTo(result, 'b', 480, 60);
        await waitFor(() => expect(sourceLine(result, 'b')).toContain('@ (480, 60)'));
        await quiesce(result);
        // The user never positioned the replacement's a.
        expect(sourceLine(result, 'a')).toBe('service "Alpha2" as a');
      });

      it('CR94-C3-F2: a graph-owned label edit keeps a dragged node\'s exact position', async () => {
        const { result } = await ready();
        const replacement = s94Document('text-edit-unpositioned');
        replacement.content.graphIR.nodes[0] = { id: 'a', type: 'service', label: 'Alpha2' } as any;
        act(() => { result.current.header.onLoad(replacement as any); });
        await quiesce(result);
        dragTo(result, 'a', 40, 40);
        // The graph owns this edit; its generated preview is read-only.
        expect(result.current.editor.isDslReadOnly).toBe(true);
        act(() => result.current.inspector!.onPropertyChange({
          nodeId: 'a', field: 'label', oldValue: 'Alpha2', newValue: 'Edited',
        }));
        await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'a')?.data.label)
          .toBe('Edited'));
        await quiesce(result);
        dragTo(result, 'b', 480, 60);
        await waitFor(() => expect(sourceLine(result, 'b')).toContain('@ (480, 60)'));
        await quiesce(result);
        expect(saveInAct(result).content).toMatchObject({ format: 'graph-ir', graphIR: {
          nodes: [expect.objectContaining({ id: 'a', label: 'Edited', position: { x: 40, y: 40 } }),
            expect.objectContaining({ id: 'b', position: { x: 480, y: 60 } })],
        } });
      });

      /** A constrained GraphIR document whose ids differ from the review document's. */
      const otherDocument = () => {
        const doc = s94Document('other', true);
        doc.content.graphIR.nodes = [
          { id: 'x', type: 'service', label: 'Xray', position: { x: 0, y: 0 } },
          { id: 'y', type: 'database', label: 'Yankee', position: { x: 400, y: 0 } },
        ];
        doc.content.graphIR.edges = [{ id: 'xy', source: 'x', target: 'y' }];
        (doc.content.graphIR as any).constraints = [{
          id: 'y-right-of-x', kind: 'relative', strength: 'preferred',
          subject: { kind: 'node', nodeId: 'y' }, relation: 'right-of',
          target: { kind: 'node', nodeId: 'x' }, gap: 10,
        }];
        delete (doc as any).edgeRouting;
        return doc;
      };
      const ids = (result: Hook) => result.current.canvas.nodes.map((node) => node.id).sort();

      it.each(['succeeds', 'fails'] as const)(
        'CR94-C4-F1: a drag that preempts an opened document\'s first layout never restores the replaced display, when its resolution %s',
        async (outcome) => {
          const { result } = await ready();
          const releaseOpen = holdNextLayout();
          const callsBefore = layout.mock.calls.length;
          act(() => { result.current.header.onLoad(otherDocument() as any); });
          await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore));
          expect(ids(result)).toEqual(['x', 'y']);
          // The drag aborts the open's layout; its print-back needs resolution.
          const releaseResolution = outcome === 'succeeds' ? holdNextLayout() : null;
          if (outcome === 'fails') layout.mockRejectedValueOnce(new Error('Resolution exploded'));
          const callsAtDrag = layout.mock.calls.length;
          dragTo(result, 'x', 90, 90);
          await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsAtDrag));
          expect(ids(result)).toEqual(['x', 'y']);
          if (releaseResolution) await act(async () => { await releaseResolution(); });
          await act(async () => { await releaseOpen(); });
          if (outcome === 'fails') await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
          else await quiesce(result);
          expect(ids(result)).toEqual(['x', 'y']);
          expect(sourceLine(result, 'x')).toContain('"Xray"');
          expect(sourceLine(result, 'y')).toContain('"Yankee"');
          expect(sourceLine(result, 'a')).toBe('');
          if (outcome === 'fails') {
            // The failed GraphIR resolution blocks export, but its generated
            // preview cannot be typed over to repair or replace the graph.
            const preview = result.current.editor.dsl;
            expect(result.current.editor.isDslReadOnly).toBe(true);
            act(() => result.current.editor.onDslChange(preview.replace('"Xray"', '"Xray2"')));
            expect(result.current.editor.dsl).toBe(preview);
            expect(saveInAct(result).content).toMatchObject({ format: 'graph-ir',
              graphIR: { nodes: [expect.objectContaining({ id: 'x' }), expect.objectContaining({ id: 'y' })] } });
          }
        },
      );

      it('CR94-C4-F2: a replacement ends the replaced document\'s source edit session', async () => {
        const { result } = await ready();
        const firstSource = '@diagram architecture\na service as "Alpha"\nb database as "Beta"\na -> b';
        act(() => { result.current.header.onOpenFile({ name: 'first-session.coral', text: firstSource }); });
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
        act(() => result.current.editor.onDslChange(`${firstSource}\nfirst service as "First"`));
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('first'));
        await quiesce(result);
        // The editor keeps focus across the replacement, so no blur ends the session.
        const opened = '@diagram architecture\nx service as "Replacement"\ny database as "Store"\nx -> y';
        act(() => { result.current.header.onOpenFile({ name: 'session-replacement.coral', text: opened }); });
        await quiesce(result);
        expect(command(result, 'undo').disabled).toBe(true);
        expect(result.current.editor.dsl).toBe(opened);
        act(() => result.current.editor.onDslChange(`${opened}\nsecond service as "Second"`));
        await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toContain('second'));
        await quiesce(result);
        expect(command(result, 'undo').disabled).toBe(false);
        act(() => result.current.canvas.onUndo());
        await waitFor(() => expect(result.current.editor.dsl).toBe(opened));
        expect(result.current.editor.dsl).not.toContain('first service');
        await quiesce(result);
      });

      it('CR94-C5-F1: a replacement ends the replaced document\'s property edit session', async () => {
        const { result } = await ready();
        const renameA = (from: string, to: string) => {
          const a = result.current.canvas.nodes.find((node) => node.id === 'a')!;
          act(() => result.current.canvas.onSelectionChange({ nodes: [a], edges: [] }));
          act(() => result.current.inspector!.onPropertyEditSessionStart('label'));
          act(() => result.current.inspector!.onPropertyChange({ nodeId: 'a', field: 'label', oldValue: from, newValue: to }));
        };
        renameA('Alpha', 'First rename');
        await waitFor(() => expect(result.current.editor.dsl).toContain('"First rename"'));
        await quiesce(result);
        // The Inspector field keeps its session across the replacement.
        act(() => { result.current.header.onLoad(s94Document('property-session-replacement') as any); });
        await quiesce(result);
        const opened = result.current.editor.dsl;
        expect(opened).toContain('"Alpha"');
        expect(command(result, 'undo').disabled).toBe(true);
        renameA('Alpha', 'Second rename');
        await waitFor(() => expect(result.current.editor.dsl).toContain('"Second rename"'));
        await quiesce(result);
        expect(command(result, 'undo').disabled).toBe(false);
        act(() => result.current.canvas.onUndo());
        await waitFor(() => expect(result.current.editor.dsl).toBe(opened));
        expect(result.current.editor.dsl).not.toContain('First rename');
        await quiesce(result);
      });

      it('CR94-F4: a publication blocked without the source-error lock refuses a new waypoint drag visibly', async () => {
        const { result } = await ready(true);
        portSafetyBridge.unreportable = true;
        act(() => { command(result, 'create-node').action({ invoker: null }); });
        act(() => { result.current.authoring!.onSubmitNode({ symbolId: 'arch-service', label: 'Added' }); });
        portSafetyBridge.unreportable = false;
        await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
        exportBlockedWith(result, /failure detail unavailable/);
        expect(result.current.sourceErrorsLocked).toBe(false);
        const gesture = () => result.current.canvas.edges.find((edge) => edge.id === 'e')!.data as any;
        clearAnnouncement(result);
        let epoch: number | undefined;
        act(() => { epoch = gesture().onWaypointDragStart('e', 'p'); });
        expect(epoch).toBeUndefined();
        expect(result.current.guidanceAnnouncement).toBe(WAYPOINT);
        // Undo restores the accepted GraphIR revision; its preview never
        // becomes an editable Coral source to repair a blocked publication.
        expect(result.current.editor.isDslReadOnly).toBe(true);
        act(() => result.current.canvas.onUndo());
        await quiesce(result);
        expect(saveInAct(result).content.format).toBe('graph-ir');
        clearAnnouncement(result);
        act(() => { epoch = gesture().onWaypointDragStart('e', gesture().waypoints[0].id); });
        expect(epoch).toEqual(expect.any(Number));
        expect(result.current.guidanceAnnouncement).toBe('');
        act(() => gesture().onWaypointDragEnd('e', gesture().waypoints[0].id, gesture().waypoints[0], epoch));
      });
    });
  });

  it('uses Ctrl+Y for diagram redo and leaves native text redo alone', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    await quiesce(result);
    const node = result.current.canvas.nodes[0];
    const moved = { x: node.position.x + 123, y: node.position.y + 123 };
    act(() => result.current.canvas.onNodeDragStart());
    act(() => result.current.canvas.onNodesChange([{ id: node.id, type: 'position', position: moved, dragging: true }]));
    act(() => result.current.canvas.onNodesChange([{ id: node.id, type: 'position', position: moved, dragging: false }]));
    await quiesce(result);
    act(() => result.current.canvas.onUndo());
    await quiesce(result);
    expect(result.current.canvas.nodes.find(item => item.id === node.id)!.position).toEqual(node.position);
    const input = document.createElement('textarea');
    document.body.append(input);
    try {
      const native = new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true });
      act(() => input.dispatchEvent(native));
      expect(native.defaultPrevented).toBe(false);
      expect(result.current.canvas.nodes.find(item => item.id === node.id)!.position).toEqual(node.position);
      const redo = new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, cancelable: true });
      act(() => document.dispatchEvent(redo));
      expect(redo.defaultPrevented).toBe(true);
      await quiesce(result);
      expect(result.current.canvas.nodes.find(item => item.id === node.id)!.position).toEqual(moved);
    } finally { input.remove(); }
  });

  it.each(['CON', 'Aux', 'COM1', 'LPT9'])('saves and exports %s using Windows-safe names', async (name) => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    await quiesce(result);
    act(() => result.current.header.onDocumentNameChange(name));
    const filenames: string[] = [];
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:filename');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { filenames.push(this.download); });
    try {
      for (const id of ['save', 'export', 'export-svg', 'export-html']) {
        act(() => result.current.commandPalette.commands.find(command => command.id === id)!.action());
      }
      expect(filenames).toEqual(['coral.json', 'graph-ir.json', 'svg', 'html'].map(extension =>
        `diagram-${name.toLowerCase()}${extension === 'graph-ir.json' ? '-' : '.'}${extension}`));
    } finally { createUrl.mockRestore(); revokeUrl.mockRestore(); click.mockRestore(); }
  });

  it('leaves AltGr and IME input untouched by global shortcuts', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    for (const key of ['n', 'e', 's', 'k', ',']) {
      for (const composing of [false, true]) {
        const event = new KeyboardEvent('keydown', {
          key, ctrlKey: true, altKey: !composing, isComposing: composing, cancelable: true,
        });
        Object.defineProperty(event, 'getModifierState', { value: (modifier: string) => !composing && modifier === 'AltGraph' });
        act(() => document.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
        expect(result.current.authoring).toBeNull();
        expect(result.current.commandPalette.isOpen).toBe(false);
      }
    }
  });

  it('guards authoring shortcuts in native editors and while a modal is open', async () => {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    const nativeEvent = new KeyboardEvent('keydown', {
      key: 'n', ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
    });
    input.dispatchEvent(nativeEvent);
    expect(nativeEvent.defaultPrevented).toBe(false);
    expect(result.current.authoring).toBeNull();

    const shortcut = new KeyboardEvent('keydown', {
      key: 'n', ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
    });
    act(() => document.dispatchEvent(shortcut));
    expect(shortcut.defaultPrevented).toBe(true);
    expect(result.current.authoring?.kind).toBe('node');

    const second = new KeyboardEvent('keydown', {
      key: 'e', ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
    });
    act(() => document.dispatchEvent(second));
    expect(second.defaultPrevented).toBe(false);
    expect(result.current.authoring?.kind).toBe('node');
    input.remove();
  });

  describe('Slice 55 file open (R-064)', () => {
    const acceptanceFixture = (name: string): string => readFileSync(resolve(import.meta.dirname,
      '../../browser/test/fixtures/acceptance028', name), 'utf8');
    const THREE_ERRORS = '@diagram flowchart\na process as "A"\nb process as "B"\na -> b\n' +
      'a -> a [label: "x", label: "y"]\ninvalid\nsecond';
    const exportDiagnostic = (result: { current: ReturnType<typeof useEditorController> }) => {
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
      return result.current.rasterExportError;
    };
    const ready = async () => {
      const hook = renderHook(() => useEditorController());
      await waitFor(() => expect(hook.result.current.canvas.nodes.length).toBeGreaterThan(0));
      return hook;
    };
    it('reruns spatial resolution when an authored proximity tier changes in either direction', async () => {
      const { result } = await ready();
      const near = '@diagram flowchart\nleft process\nright process\n' +
        'flow = left -> right\n';
      const far = near.replace('left -> right', 'left ------> right');
      act(() => { result.current.header.onOpenFile({ name: 'proximity.coral', text: near }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(near));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      layout.mockClear();

      act(() => { result.current.editor.onDslChange(far); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(far));
      await waitFor(() => expect(layout.mock.calls.length, '1→6 must run spatial layout')
        .toBeGreaterThan(0));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      layout.mockClear();

      act(() => { result.current.editor.onDslChange(near); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(near));
      await waitFor(() => expect(layout.mock.calls.length, '6→1 must remove the prior spacing')
        .toBeGreaterThan(0));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
    });
    const errorsOf = (result: { current: ReturnType<typeof useEditorController> }) =>
      result.current.editor.editorAnalysis.diagnostics.filter((item) => item.severity === 'error');
    const restoreLayout = () => layout.mockImplementation(async (graph: any) => ({
      children: mockLayoutChildren(graph),
      edges: [],
    }));

    it.each([
      ['architecture', 'architecture-ports.coral', 'api'],
      ['block', 'block-ports.coral', 'producer'],
      ['flowchart', 'flowchart-draft.coral', 'review'],
      ['bpmn', 'bpmn-event.coral', 'work'],
      ['uml-sequence', 'uml-sequence-flat.coral', 'client'],
      ['uml-class', 'uml-class-named.coral', 'Order'],
    ] as const)('acceptance matrix: %s edits, undoes, saves, exports, and reopens authored source',
      async (profile, filename, nodeId) => {
        const { result } = await ready();
        const source = acceptanceFixture(filename);
        act(() => { result.current.header.onOpenFile({ name: filename, text: source }); });
        await waitFor(() => expect(result.current.editor.dsl).toBe(source));
        await quiesce(result);
        expect(result.current.editor.parseErrors.filter((item) => item.severity === 'error')).toEqual([]);
        act(() => result.current.canvas.onLabelEdit(nodeId, 'Renamed'));
        await waitFor(() => expect(result.current.editor.dsl).toContain(' as "Renamed"'));
        const edited = result.current.editor.dsl;
        expect(edited.replace(' as "Renamed"', '')).toBe(source);
        await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === nodeId)?.data.label)
          .toBe('Renamed'));
        act(() => result.current.canvas.onUndo());
        await waitFor(() => expect(result.current.editor.dsl).toBe(source));
        act(() => result.current.canvas.onRedo());
        await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
        await quiesce(result);
        let saved!: ReturnType<typeof result.current.header.onSave>;
        act(() => { saved = result.current.header.onSave(); });
        expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:acceptance');
        const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        try {
          act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
          expect(result.current.rasterExportError).toBeNull();
          expect(createObjectUrl).toHaveBeenCalledOnce();
          const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
          expect(exported).toMatchObject({ version: '4.0.0' });
        } finally {
          createObjectUrl.mockRestore();
          revokeObjectUrl.mockRestore();
          click.mockRestore();
        }
        act(() => { result.current.header.onOpenFile({ name: `saved-${filename}.json`,
          text: JSON.stringify(saved) }); });
        await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
        expect(result.current.canvas.notation).toBe(profile);
      });

    it.each([
      ['a -> z [firstEnd: zeroOrOne, secondEnd: zeroOrMany]', 'first-to-second',
        'zero-or-one', 'zero-or-many'],
      ['a -- z [secondEnd: zeroOrOne]', 'none', 'none', 'zero-or-one'],
    ] as const)('preserves %s meaning through source-owned save, export, and reopen',
      async (connector, direction, firstEnd, secondEnd) => {
        const { result } = await ready();
        const source = '@diagram architecture\na service\nz service\n' +
          `link = ${connector}\n`;
        act(() => { result.current.header.onOpenFile({ name: 'rare-ends.coral', text: source }); });
        await waitFor(() => expect(result.current.editor.dsl).toBe(source));
        await quiesce(result);
        expect(result.current.editor.parseErrors.filter((item) => item.severity === 'error')).toEqual([]);
        let saved!: ReturnType<typeof result.current.header.onSave>;
        act(() => { saved = result.current.header.onSave(); });
        const pinned = (saved.content as { text: string }).text;
        expect(pinned).toContain(`link = ${connector}`);
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:rare-ends');
        const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        try {
          act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
          expect(result.current.rasterExportError).toBeNull();
          const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
          expect(exported.edges[0]).toMatchObject({ id: 'link', direction,
            firstEnd: { marker: { kind: firstEnd } },
            secondEnd: { marker: { kind: secondEnd } } });
        } finally {
          createObjectUrl.mockRestore();
          revokeObjectUrl.mockRestore();
          click.mockRestore();
        }
        act(() => { result.current.header.onOpenFile({ name: 'rare-ends.json',
          text: JSON.stringify(saved) }); });
        await waitFor(() => expect(result.current.editor.dsl).toBe(pinned));
        expect(parseCoralDSL(result.current.editor.dsl).sourceGraph?.edges[0]).toMatchObject({
          direction, firstEnd: { marker: { kind: firstEnd } },
          secondEnd: { marker: { kind: secondEnd } },
        });
      });

    it('acceptance matrix: an invalid authored port saves as an exact draft and cannot export', async () => {
      const { result } = await ready();
      const invalid = acceptanceFixture('architecture-ports.coral')
        .replace('api:audit', 'api:missing');
      act(() => { result.current.header.onOpenFile({ name: 'invalid-port.coral', text: invalid }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(invalid));
      await waitFor(() => expect(result.current.editor.parseErrors.map((item) => item.code))
        .toContain('coral.port.reference.missing'));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: invalid });
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:invalid-port');
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        expect(createObjectUrl).not.toHaveBeenCalled();
        expect(result.current.rasterExportError).toBeTruthy();
      } finally { createObjectUrl.mockRestore(); }
    });

    it('opens Coral source with errors: exact text, recovered graph, every error, export blocked (AC-2, AC-4)', async () => {
      const { result } = await ready();
      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'broken.coral', text: THREE_ERRORS }); });
      expect(accepted).toBe(true);
      expect(exportDiagnostic(result)).toMatch(/^Recovered graph: 3 errors/);
      expect(result.current.editor.dsl).toBe(THREE_ERRORS);
      expect(result.current.editor.dslType).toBe('coral');
      expect(result.current.header.documentName).toBe('broken');
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(0));
      await waitFor(() => expect(errorsOf(result)).toHaveLength(3));
      expect(errorsOf(result).map((item) => item.code)).toEqual([
        'coral.syntax.label.duplicate',
        'coral.syntax.node.kind-required',
        'coral.syntax.node.kind-required',
      ]);
      expect(errorsOf(result).some((item) => (item.related?.length ?? 0) > 0)).toBe(true);
      expect(exportDiagnostic(result)).toMatch(/^Recovered graph: 3 errors/);
      expect(result.current.openFailure).toBeNull();
      expect(result.current.editor.recoveredGraph).toBe(true);
      act(() => result.current.editor.onDslChange('@diagram flowchart\na process as "A"\nb process as "B"\na -> b'));
      await waitFor(() => expect(result.current.editor.recoveredGraph).toBe(false));
    });

    it('keeps an unresolved connector exact without projecting a partial graph (verification V55-1)', async () => {
      const { result } = await ready();
      const text = '@diagram flowchart\np process as "P"\nq process as "Q"\np -> q\np -> nowhere_ok';
      act(() => { result.current.header.onOpenFile({ name: 'dangling.coral', text }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(0));
      expect(result.current.canvas.edges).toHaveLength(0);
      expect(result.current.editor.parseErrors.map((error) => error.code))
        .toContain('coral.reference.target.unresolved');
      expect(result.current.editor.parseErrors.some((error) => /layout failed/i.test(error.message))).toBe(false);
      expect(result.current.editor.dsl).toBe(text);
      const saved = result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text });
      expect(exportDiagnostic(result)).toMatch(/^Recovered graph: 1 error\b/);
      act(() => { result.current.header.onOpenFile({ name: 'dangling.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(text));
      expect(result.current.editor.parseErrors.map((error) => error.code))
        .toContain('coral.reference.target.unresolved');
    });

    it('opens a file whose every statement failed, blocked, with an empty canvas', async () => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name: 'all-bad.coral', text: 'invalid first\ninvalid second' }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(0));
      await waitFor(() => expect(errorsOf(result)).toHaveLength(2));
      expect(result.current.editor.dsl).toBe('invalid first\ninvalid second');
      expect(exportDiagnostic(result)).toMatch(/^Recovered graph: 2 errors/);
    });

    it('keeps an uninstalled diagram header exact and blocks semantic projection', async () => {
      const { result } = await ready();
      const text = '@diagram not-installed\na process as "A"\nb process as "B"\na -> b';
      act(() => { result.current.header.onOpenFile({ name: 'n.coral', text }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(0));
      expect(result.current.editor.parseErrors.map((error) => error.code))
        .toContain('header.diagram.unsupported');
      expect(result.current.editor.dsl).toBe(text);
      const saved = result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text });
      expect(exportDiagnostic(result)).toMatch(/^Recovered graph: 1 error\b/);
      act(() => { result.current.header.onOpenFile({ name: 'n.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(text));
      expect(result.current.editor.parseErrors.map((error) => error.code))
        .toContain('header.diagram.unsupported');
    });

    it('keeps the source text byte-identical when the canvas is edited over errors (AC-4)', async () => {
      const { result } = await ready();
      const valid = '@diagram flowchart\na process as "A"\nb process as "B"\na -> b';
      act(() => { result.current.header.onOpenFile({ name: 'valid.coral', text: valid }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      act(() => result.current.editor.onDslChange(THREE_ERRORS));
      await waitFor(() => expect(errorsOf(result)).toHaveLength(3));
      const node = result.current.canvas.nodes[0];
      act(() => result.current.canvas.onNodesChange([{ id: node.id, type: 'position', position: { x: 999, y: 999 }, dragging: false }]));
      act(() => result.current.canvas.onLabelEdit(node.id, 'Renamed'));
      act(() => result.current.canvas.onConnect({ source: 'b', target: 'a', sourceHandle: null, targetHandle: null }));
      act(() => result.current.canvas.onDeleteSelection());
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(result.current.editor.dsl).toBe(THREE_ERRORS);
      expect(result.current.guidanceAnnouncement).toMatch(/Fix the source errors/);
    });

    it('refuses canvas edits over typed source with errors instead of printing the last good graph (AC-4)', async () => {
      const { result } = await ready();
      const valid = '@diagram flowchart\na process as "A"\nb process as "B"\na -> b\n';
      act(() => { result.current.header.onOpenFile({ name: 'valid.coral', text: valid }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'b']));
      const typed = valid + 'invalid';
      act(() => result.current.editor.onDslChange(typed));
      await waitFor(() => expect(result.current.editor.editorAnalysis.source).toBe(typed));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      const node = result.current.canvas.nodes[0];
      act(() => result.current.canvas.onNodesChange([{ id: node.id, type: 'position', position: { x: 500, y: 500 }, dragging: false }]));
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(result.current.editor.dsl).toBe(typed);
    });

    it('keeps a headerless draft exact until the author supplies a saved header (e2e C50)', async () => {
      const { result } = await ready();
      const broken = 'service "A" as a\ninvalid line';
      act(() => { result.current.header.onOpenFile({ name: 'broken.coral', text: broken }); });
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      act(() => result.current.inspector!.onDocumentSettingsChange({ ...result.current.inspector!.documentSettings, notation: 'aiml' }));
      expect(result.current.canvas.notation).toBe('aiml');
      expect(result.current.editor.dsl).toBe(broken);
      act(() => result.current.editor.onDslChange('@diagram aiml\nclassifier model as "Classifier"\n' +
        'accelerator gpu as "Accelerator"\nclassifier -> accelerator'));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id).sort()).toEqual(['accelerator', 'classifier']), { timeout: 3000 });
      expect(result.current.canvas.notation).toBe('aiml');
      expect(result.current.header.onSave().settings.notation).toBe('aiml');
    });

    it('edits only the header value when choosing a notation over headed source with errors (e2e C50)', async () => {
      const { result } = await ready();
      const broken = '@diagram flowchart\n\na process as "A"\ninvalid';
      act(() => { result.current.header.onOpenFile({ name: 'broken.coral', text: broken }); });
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      const command = result.current.commandPalette.commands.find((item) => item.id === 'notation-bpmn')!;
      act(() => command.action());
      const edited = broken.replace('@diagram flowchart', '@diagram bpmn');
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const immediate = result.current.header.onSave();
      expect(immediate.settings.notation).toBe('bpmn');
      expect(immediate.content).toEqual({ format: 'dsl', dslType: 'coral', text: edited });
      await waitFor(() => expect(result.current.canvas.notation).toBe('bpmn'), { timeout: 2500 });
      expect(result.current.inspector!.documentSettings.notation).toBe('bpmn');
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      act(() => { result.current.header.onLoad(createBlankDocument()); });
      act(() => { result.current.header.onOpenFile({
        name: 'broken.coral.json', text: JSON.stringify(immediate),
      }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      expect(result.current.canvas.notation).toBe('bpmn');
      expect(result.current.header.onSave().content).toEqual(immediate.content);
    });

    it('applies a manually edited installed header before returning for another source error', async () => {
      const { result } = await ready();
      const flowchart = '@diagram flowchart\n\na process as "A"\ninvalid';
      act(() => { result.current.header.onOpenFile({ name: 'manual.coral', text: flowchart }); });
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      const bpmn = flowchart.replace('@diagram flowchart', '@diagram bpmn');
      act(() => result.current.editor.onDslChange(bpmn));
      expect(result.current.header.onSave().settings.notation).toBe('bpmn');
      await waitFor(() => expect(result.current.canvas.notation).toBe('bpmn'), { timeout: 2500 });
      expect(result.current.inspector!.documentSettings.notation).toBe('bpmn');
    });

    it('reopens a saved user connection on symbol-provided ports (e2e S36)', async () => {
      const { result } = await ready();
      const source = '@diagram flowchart\nsource process\ntarget process\n';
      act(() => { result.current.header.onOpenFile({
        name: 'ports.coral', text: source,
      }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['source', 'target']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onConnect({ source: 'source', target: 'target', sourceHandle: 'out', targetHandle: 'in' }));
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
      const connected = source + 'source:out -> target:in\n';
      await waitFor(() => expect(result.current.editor.dsl).toBe(connected));
      const saved = result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: connected });
      expect(parseInstalledDocument028(connected).graph?.edges[0]).toMatchObject({
        sourcePort: 'out', targetPort: 'in',
      });
      act(() => result.current.editor.onDslChange(source + 'invalid'));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'ports.coral.json', text: JSON.stringify(saved) }); });
      expect(result.current.openFailure).toBeNull();
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
      expect(result.current.canvas.edges[0]).toMatchObject({ sourceHandle: 'out', targetHandle: 'in' });
      expect(result.current.header.onSave().content).toEqual(saved.content);
      expect(result.current.editor.dsl).toBe(connected);
    }, 20000);

    it('reopens the saved default sample, whose decision edges use symbol ports (e2e S36)', async () => {
      const { result } = await ready();
      const saved = result.current.header.onSave();
      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'sample.coral.json', text: JSON.stringify(saved) }); });
      expect(result.current.openFailure).toBeNull();
      expect(accepted).toBe(true);
    });

    it('still refuses an edge port that neither the node nor its symbol provides', async () => {
      const { result } = await ready();
      const doc = createBlankDocument();
      doc.content.graphIR = { version: '3.0.0', id: 'g', nodes: [
        { id: 'a', type: 'process', label: 'A' }, { id: 'b', type: 'process', label: 'B' },
      ], edges: [{ id: 'e', source: 'a', target: 'b', sourcePort: 'bogus', targetPort: 'in' }] } as GraphIR;
      let accepted = true;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'bogus.coral.json', text: JSON.stringify(doc) }); });
      expect(accepted).toBe(false);
      expect(result.current.openFailure!.reasons.map((reason) => reason.message).join(' ')).toContain('Missing source port "bogus"');
      expect(result.current.openFailure!.reasons.map((reason) => reason.message).join(' ')).not.toContain('Missing target port');
    });

    it('saves, recovers, and reopens a dashed Coral edge with its source meaning', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service as "A"\nb service as "B"\na -.-> b\n';
      act(() => { result.current.header.onOpenFile({ name: 'dashed.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const saved = result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
      expect(parseInstalledDocument028(source).graph?.edges[0].style).toEqual({ lineStyle: 'dashed' });
      act(() => result.current.editor.onDslChange(source + 'other service as "Other"\n'));
      await waitFor(() => expect(window.localStorage.getItem('coral-diagram-recovery')).toContain('Other'), { timeout: 3000 });
      const snapshot = JSON.parse(window.localStorage.getItem('coral-diagram-recovery')!);
      expect(snapshot.document.content).toMatchObject({ format: 'dsl', dslType: 'coral',
        text: source + 'other service as "Other"\n' });
      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'dashed.coral.json', text: JSON.stringify(saved) }); });
      expect(result.current.openFailure).toBeNull();
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dashed-source');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        expect(createObjectUrl).toHaveBeenCalledOnce();
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported).toMatchObject({ version: '4.0.0',
          edges: [{ first: { node: 'a' }, second: { node: 'b' },
            style: { lineStyle: 'dashed' } }],
        });
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
    }, 20000);

    it('opens a 0.2.5 file whose edges carry a flat lineStyle, reporting the move (known e2e failures)', async () => {
      const { result } = await ready();
      const doc = createBlankDocument();
      doc.content.graphIR = { version: '2.0.0', id: 'v025', nodes: [
        { id: 'a', type: 'process', label: 'A' }, { id: 'b', type: 'process', label: 'B' },
      ], edges: [{
        id: 'e', source: 'a', target: 'b', sourcePort: 'out', targetPort: 'in', lineStyle: 'dashed',
      }] } as unknown as GraphIR;
      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'v025.coral.json', text: JSON.stringify(doc) }); });
      expect(result.current.openFailure).toBeNull();
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
      expect(result.current.editor.dsl).toContain('dashed');
      expect(result.current.editor.diagnosticEntries.some((entry) => entry.code === 'coral.open.migration.change'
        && /edges\/0\/lineStyle/.test(entry.message))).toBe(true);
      expect(result.current.editor.diagnosticEntries.some((entry) => entry.code === 'coral.open.migration.change'
        && /Materialized .* notation-symbol ports/.test(entry.message))).toBe(true);
      expect(validateIR(result.current.header.onSave().content.graphIR!).valid).toBe(true);
    });

    it('recovers exact legacy text without projecting its retired spelling', async () => {
      const legacyText = 'service "Alpha"\ndatabase "Beta"\nalpha -> beta [dashed]';
      window.localStorage.setItem('coral-diagram-recovery', JSON.stringify({
        timestamp: Date.now(), documentName: 'Recovered', dslType: 'coral',
        dsl: legacyText, notation: 'flowchart',
        nodePositions: { alpha: { x: 777, y: 888 }, beta: { x: 999, y: 444 } },
      }));
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
      act(() => result.current.recovery.onRecover());
      expect(result.current.openFailure).toBeNull();
      await waitFor(() => expect(result.current.editor.dsl).toBe(legacyText));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      expect(result.current.editor.parseErrors.some((error) => error.code === 'header.diagram.required')).toBe(true);
      expect(result.current.canvas.nodes.some((node) => node.id === 'alpha' || node.id === 'beta')).toBe(false);
      expect(result.current.header.onSave().content).toEqual({ format: 'dsl', dslType: 'coral', text: legacyText });
      expect(exportDiagnostic(result)).toMatch(/source|header|diagram/i);
    });

    const typeBrokenOverAcceptedGraph = async () => {
      const hook = await ready();
      const valid = '@diagram flowchart\na process as "A"\nb process as "B"\na -> b';
      act(() => { hook.result.current.header.onOpenFile({ name: 'valid.coral', text: valid }); });
      await waitFor(() => expect(hook.result.current.canvas.nodes).toHaveLength(2));
      act(() => hook.result.current.editor.onDslChange(THREE_ERRORS));
      await waitFor(() => expect(errorsOf(hook.result)).toHaveLength(3));
      return hook;
    };
    const expectTextKept = async (result: { current: ReturnType<typeof useEditorController> }, text = THREE_ERRORS) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(result.current.editor.dsl).toBe(text);
      expect(result.current.header.onSave().content).toEqual({ format: 'dsl', dslType: 'coral', text });
    };

    it('refuses a resize over source with errors (code review C55-2)', async () => {
      const { result } = await typeBrokenOverAcceptedGraph();
      const node = result.current.canvas.nodes[0];
      act(() => result.current.canvas.onNodesChange([{ id: node.id, type: 'dimensions', resizing: true, setAttributes: true, dimensions: { width: 400, height: 300 } }]));
      await expectTextKept(result);
    });

    it('refuses font apply over source with errors (code review C55-1)', async () => {
      const { result } = await typeBrokenOverAcceptedGraph();
      act(() => result.current.inspector!.onApplyFont({ ...result.current.inspector!.fontDraft, size: 22 }));
      await expectTextKept(result);
      expect(exportDiagnostic(result)).toMatch(/^Export blocked: 3 errors/);
    });

    it('refuses a DSL type switch and reflow over source with errors (code review C55-3)', async () => {
      const { result } = await typeBrokenOverAcceptedGraph();
      act(() => result.current.editor.onDslTypeChange('mermaid'));
      act(() => result.current.canvas.onReflow());
      await expectTextKept(result);
      expect(result.current.editor.dslType).toBe('coral');
    });

    it('restores the lock with undo and redo across a source edit (code review C55-3)', async () => {
      const { result } = await typeBrokenOverAcceptedGraph();
      const fixed = '@diagram flowchart\na process as "A"\nb process as "B"\na -> b';
      act(() => result.current.editor.onEditSessionEnd());
      act(() => result.current.editor.onDslChange(fixed));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(false));
      act(() => result.current.editor.onEditSessionStart());
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(THREE_ERRORS));
      expect(result.current.sourceErrorsLocked).toBe(true);
      const node = result.current.canvas.nodes[0];
      act(() => result.current.canvas.onNodesChange([{ id: node.id, type: 'position', position: { x: 999, y: 999 }, dragging: false }]));
      await expectTextKept(result);
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(fixed));
      expect(result.current.sourceErrorsLocked).toBe(false);
    });

    it.each([
      ['a missing node kind', '@diagram flowchart\na process as "A"\ninvalid',
        'coral.syntax.node.kind-required'],
      ['a duplicate node ID', '@diagram flowchart\na process as "A"\na decision as "Duplicate"',
        'coral.identity.node.duplicate'],
      ['an uninstalled header notation', '@diagram not-installed\na process as "A"',
        'header.diagram.unsupported'],
    ])('re-parses recovered source with %s so it stays blocked and saves as text (code review C55-4)', async (_label, typed, code) => {
      const first = await ready();
      act(() => { first.result.current.header.onOpenFile({ name: 'ok.coral',
        text: '@diagram flowchart\na process as "A"' }); });
      await waitFor(() => expect(first.result.current.canvas.nodes.map((node) => node.id)).toEqual(['a']));
      act(() => first.result.current.editor.onDslChange(typed));
      await waitFor(() => expect(window.localStorage.getItem('coral-diagram-recovery')).toContain(JSON.stringify(typed).slice(1, -1)), { timeout: 3000 });
      first.unmount();
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
      act(() => result.current.recovery.onRecover());
      await waitFor(() => expect(result.current.editor.dsl).toBe(typed));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      expect(result.current.editor.parseErrors.map((item) => item.code)).toContain(code);
      await expectTextKept(result, typed);
    });

    it.each([
      ['invalid JSON', 'bad.json', '{ nope', 'coral.open.format.unrecognized'],
      ['unrecognized content', 'image.png', 'PNG\u0000data', 'coral.open.format.unrecognized'],
      ['an invalid document', 'doc.coral.json', JSON.stringify({ schemaVersion: '1.0.0', content: { format: 'graph-ir' } }), 'coral.open.document.invalid'],
    ])('blocks %s, keeps current work, and shows every reason (AC-2)', async (_label, name, text, code) => {
      const { result } = await ready();
      act(() => result.current.editor.onDslChange('service "Keep me"'));
      await waitFor(() => expect(result.current.canvas.mutationsDisabled).toBe(false));
      const before = result.current.editor.dsl;
      const confirm = vi.mocked(window.confirm);
      confirm.mockClear();
      let accepted = true;
      act(() => { accepted = result.current.header.onOpenFile({ name, text }); });
      expect(accepted).toBe(false);
      expect(confirm).not.toHaveBeenCalled();
      expect(result.current.editor.dsl).toBe(before);
      expect(result.current.openFailure?.fileName).toBe(name);
      expect(result.current.openFailure?.reasons.length).toBeGreaterThan(0);
      expect(result.current.openFailure?.reasons.some((reason) => reason.code?.startsWith(code))).toBe(true);
      act(() => result.current.onDismissOpenFailure());
      expect(result.current.openFailure).toBeNull();
    });

    it('opens malformed raw Mermaid as saveable text while refusing semantic export', async () => {
      const { result } = await ready();
      const text = 'gantt\n  title Project';
      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'unfinished.mmd', text }); });
      expect(accepted).toBe(true);
      expect(result.current.editor.dsl).toBe(text);
      expect(result.current.editor.dslType).toBe('mermaid');
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      expect(exportDiagnostic(result)).toMatch(/^Recovered graph:/);
      const saved = saveInAct(result);
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'mermaid', text });
      act(() => { accepted = result.current.header.onOpenFile({
        name: 'unfinished.coral.json', text: JSON.stringify(saved),
      }); });
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(text));
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'mermaid', text });
    });

    it('lists each document validation reason separately', async () => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name: 'doc.coral.json', text: JSON.stringify({ schemaVersion: '1.0.0', content: { format: 'graph-ir' } }) }); });
      expect(result.current.openFailure!.reasons.length).toBeGreaterThanOrEqual(2);
    });

    it('keeps current work when the replace confirmation is cancelled', async () => {
      const { result } = await ready();
      act(() => result.current.editor.onDslChange('service "Unsaved"'));
      await waitFor(() => expect(window.localStorage.getItem('coral-diagram-recovery')).not.toBeNull(), { timeout: 2500 });
      vi.mocked(window.confirm).mockReturnValue(false);
      const before = result.current.editor.dsl;
      let accepted = true;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'x.coral', text: 'service "Other"' }); });
      expect(accepted).toBe(false);
      expect(result.current.editor.dsl).toBe(before);
      expect(result.current.openFailure).toBeNull();
    });

    it('reports each GraphIR migration change attributed to the file (AC-3)', async () => {
      const { result } = await ready();
      const legacy = { version: '2.0.0', id: 'legacy', metadata: { notation: 'uml-class' }, nodes: [{ id: 'a', type: 'service', label: 'A' }], edges: [] };
      act(() => { result.current.header.onOpenFile({ name: 'legacy.json', text: JSON.stringify(legacy) }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a']));
      const notices = result.current.editor.diagnosticEntries.filter((entry) => entry.code?.startsWith('coral.open.migration'));
      expect(notices.length).toBeGreaterThan(0);
      for (const notice of notices) expect(notice.message).toMatch(/^legacy\.json: GraphIR 2\.0\.0 → 3\.0\.0: /);
    });

    it('opens a valid dsl document with its nodes, not an empty graph (AC-3)', async () => {
      const { result } = await ready();
      const doc = createBlankDocument();
      doc.metadata.name = 'Draft';
      doc.content = { format: 'dsl', dslType: 'coral',
        text: '@diagram flowchart\na process as "A"\nb process as "B"\na -> b' };
      act(() => { result.current.header.onOpenFile({ name: 'draft.coral.json', text: JSON.stringify(doc) }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      expect(result.current.canvas.edges).toHaveLength(1);
      expect(result.current.editor.dsl).toBe(doc.content.text);
      expect(result.current.header.documentName).toBe('Draft');
    });

    it('keeps Mermaid, DOT, and PlantUML imports as exact source', async () => {
      const { result } = await ready();
      for (const [name, text, format] of [
        ['a.mmd', 'flowchart LR\n  A[Alpha] --> B[Beta]', 'mermaid'],
        ['a.dot', 'digraph G { a -> b }', 'dot'],
        ['a.puml', '@startuml\n[A] --> [B]\n@enduml', 'plantuml'],
      ] as const) {
        let accepted = false;
        act(() => { accepted = result.current.header.onOpenFile({ name, text }); });
        expect(accepted, name).toBe(true);
        expect(result.current.editor.dslType).toBe(format);
        await waitFor(() => expect(result.current.canvas.nodes, name).toHaveLength(2));
        await quiesce(result);
        expect(result.current.editor.dsl).toBe(text);
        const saved = saveInAct(result);
        expect(saved.content).toEqual({ format: 'dsl', dslType: format, text });
        act(() => { accepted = result.current.header.onOpenFile({
          name: `${name}.coral.json`, text: JSON.stringify(saved),
        }); });
        expect(accepted).toBe(true);
        await waitFor(() => expect(result.current.editor.dsl).toBe(text));
        await quiesce(result);
      }
    });

    it('retains Mermaid UML class meaning while editing and reopening exact source', async () => {
      const { result } = await ready();
      const source = 'classDiagram\nclass Order {\n  +UUID id\n  +save(): Void\n}';
      const edited = source.replace('+UUID id', '+String id');
      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'orders.mmd', text: source }); });
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['Order']));
      await quiesce(result);
      expect(result.current.editor.dsl).toBe(source);
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'mermaid', text: source });
      act(() => result.current.editor.onDslChange(edited));
      await quiesce(result);
      expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['Order']);
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const saved = saveInAct(result);
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'mermaid', text: edited });
      act(() => { accepted = result.current.header.onOpenFile({
        name: 'orders.coral.json', text: JSON.stringify(saved),
      }); });
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await quiesce(result);
    });

    it.each([
      ['Mermaid', 'diagram.mmd', 'flowchart LR\nA[Alpha] --> B[Beta]', 'A'],
      ['DOT', 'diagram.dot', 'digraph G { a -> b }', 'a'],
      ['PlantUML', 'diagram.puml', '@startuml\nA -> B : hi\n@enduml', 'a'],
    ] as const)('keeps raw %s source when a canvas move is attempted', async (_format, name, source, nodeId) => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name, text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.some((node) => node.id === nodeId)).toBe(true));
      await quiesce(result);
      expect(result.current.canvas.mutationsDisabled).toBe(true);
      expect(result.current.inspector?.mutationsDisabled).toBe(true);
      const before = result.current.canvas.nodes.find((node) => node.id === nodeId)!.position;
      act(() => result.current.canvas.onNodesChange([{
        id: nodeId, type: 'position', position: { x: before.x + 80, y: before.y + 20 }, dragging: false,
      }]));
      expect(result.current.canvas.nodes.find((node) => node.id === nodeId)!.position).toEqual(before);
      expect(result.current.editor.dsl).toBe(source);
    });

    it('keeps malformed DOT edits saveable with semantic export blocked', async () => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name: 'connections.dot',
        text: 'digraph G { a -> b }' }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await quiesce(result);
      const malformed = 'digraph G { a -> }';
      act(() => result.current.editor.onDslChange(malformed));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      expect(exportDiagnostic(result)).toMatch(/^Export blocked:/);
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe('digraph G { a -> b }'));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(malformed));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      const saved = saveInAct(result);
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'dot', text: malformed });
      let reopened = false;
      act(() => { reopened = result.current.header.onOpenFile({
        name: 'broken.coral.json', text: JSON.stringify(saved),
      }); });
      expect(reopened).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(malformed));
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'dot', text: malformed });
    });

    it('recovers an unsaved DOT draft without replacing its source language', async () => {
      const first = await ready();
      act(() => { first.result.current.header.onOpenFile({ name: 'connections.dot',
        text: 'digraph G { a -> b }' }); });
      await waitFor(() => expect(first.result.current.editor.dslType).toBe('dot'));
      const draft = 'digraph G { a -> }';
      act(() => first.result.current.editor.onDslChange(draft));
      await waitFor(() => expect(window.localStorage.getItem('coral-diagram-recovery'))
        .toContain(JSON.stringify(draft).slice(1, -1)), { timeout: 3000 });
      first.unmount();
      const { result } = renderHook(() => useEditorController());
      await waitFor(() => expect(result.current.recovery.hasData).toBe(true));
      act(() => result.current.recovery.onRecover());
      await waitFor(() => expect(result.current.editor.dsl).toBe(draft));
      expect(result.current.editor.dslType).toBe('dot');
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'dot', text: draft });
    });

    it('reprojects a PlantUML text edit without rewriting its spelling', async () => {
      const { result } = await ready();
      const original = '@startuml\nA -> B : hi\n@enduml';
      const edited = original.replace(': hi', ': bye');
      act(() => { result.current.header.onOpenFile({ name: 'messages.puml', text: original }); });
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
      await quiesce(result);
      act(() => result.current.editor.onDslChange(edited));
      await waitFor(() => expect(result.current.canvas.edges[0]?.data?.label).toBe('bye'));
      expect(result.current.editor.dsl).toBe(edited);
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(original));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'plantuml', text: edited });
    });

    it('rejects a stale DOT layout after a newer source edit', async () => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name: 'connections.dot',
        text: 'digraph G { a -> b }' }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await quiesce(result);
      let releaseFirst!: () => void;
      layout.mockImplementationOnce((graph: any) => new Promise((resolve) => {
        releaseFirst = () => resolve({
          ...graph,
          children: mockLayoutChildren(graph).map((child: any) => ({ ...child, y: 0 })),
          edges: graph.edges ?? [],
        });
      }));
      const callsBefore = layout.mock.calls.length;
      const first = 'digraph G { first -> stale }';
      const second = 'digraph G { current -> source }';
      act(() => result.current.editor.onDslChange(first));
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore), { timeout: 3000 });
      act(() => result.current.editor.onDslChange(second));
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(callsBefore + 1), { timeout: 3000 });
      await act(async () => releaseFirst());
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.editor.dsl).toBe(second);
      expect(result.current.canvas.nodes.map((node) => node.id).sort()).toEqual(['current', 'source']);
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: 'dot', text: second });
      await quiesce(result);
    });

    it('imports a simple Mermaid sequence into editable source-owned 0.2.8 Coral', async () => {
      const { result } = await ready();
      const imported = 'sequenceDiagram\nparticipant A\nparticipant B\nA->>B: hi\nB-->>A: done';
      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'messages.mmd', text: imported }); });
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toContain('@diagram uml-sequence\n'));
      const source = result.current.editor.dsl;
      expect(source).toContain('msg_1 = A -#> B as "hi"');
      expect(source).toContain('msg_2 = B -.-> A as "done"');
      const saved = saveInAct(result);
      expect(saved.content).toMatchObject({ format: 'dsl', dslType: 'coral', text: source });
      act(() => { accepted = result.current.header.onOpenFile({
        name: 'messages.coral.json', text: JSON.stringify(saved),
      }); });
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    });

    it('imports successive flat Mermaid fragments as source and saves their exact text', async () => {
      const { result } = await ready();
      const imported = 'sequenceDiagram\nparticipant A\nparticipant B\n' +
        'Note over A,B: shared\nA->>B: before\nalt accepted\nA->>B: request\nelse rejected\n' +
        'B-->>A: denied\nend\nA-)B: after\nloop retry\nA->>B: again\nend';
      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'choice.mmd', text: imported }); });
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toContain('alt "accepted" {'));
      const source = result.current.editor.dsl;
      expect(source).toContain('note "shared" on A, B');
      expect(source).toContain('} else "rejected" {');
      expect(source).toContain('loop "retry" {');
      expect(result.current.editor.parseErrors.filter((item) => item.severity === 'error')).toEqual([]);
      const saved = saveInAct(result);
      expect(saved.content).toMatchObject({ format: 'dsl', dslType: 'coral', text: source });
      act(() => { accepted = result.current.header.onOpenFile({
        name: 'choice.coral.json', text: JSON.stringify(saved),
      }); });
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    });

    it.each([
      ['loop', 'loop', 'loop {'],
      ['opt', 'opt cache miss', 'opt "cache miss" {'],
    ])('imports a Mermaid %s as exact source through save and reopen', async (name, head, spelling) => {
      const { result } = await ready();
      const imported = `sequenceDiagram\nparticipant A\nparticipant B\n${head}\nA->>B: try\nend`;
      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: `${name}.mmd`, text: imported }); });
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toContain(spelling));
      const source = result.current.editor.dsl;
      expect(source).toContain('msg_1 = A -#> B as "try"');
      const saved = saveInAct(result);
      expect(saved.content).toMatchObject({ format: 'dsl', dslType: 'coral', text: source });
      act(() => { accepted = result.current.header.onOpenFile({
        name: `${name}.coral.json`, text: JSON.stringify(saved),
      }); });
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    });

    it('warns when a file opens as Coral only because nothing else matched (AC-1)', async () => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name: 'notes.txt', text: 'service "A"' }); });
      await waitFor(() => expect(result.current.editor.diagnosticEntries.some((entry) => entry.code === 'coral.open.format.assumed')).toBe(true));
    });

    it('saves source with errors as a dsl document that reopens to the same text (AC-4)', async () => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name: 'broken.coral', text: THREE_ERRORS }); });
      await waitFor(() => expect(errorsOf(result)).toHaveLength(3));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: THREE_ERRORS });
      act(() => { result.current.header.onOpenFile({ name: 'broken.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(THREE_ERRORS));
      await waitFor(() => expect(errorsOf(result)).toHaveLength(3));
    });

    it('renders, saves, and reopens source-first Block without changing its type word', async () => {
      const { result } = await ready();
      const source = '@diagram block\nproducer block\nconsumer block\n' +
        'transfer = producer -> consumer as "Data"\n';
      act(() => { result.current.header.onOpenFile({ name: 'blocks.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
        .toEqual(['producer', 'consumer']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['transfer']);
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      const saved = result.current.header.onSave();
      expect(saved.content.format).toBe('dsl');
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toContain('@diagram block\n');
      expect(savedSource).toContain('producer block\nconsumer block\n');
      act(() => { result.current.header.onOpenFile({ name: 'blocks.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
        .toEqual(['producer', 'consumer']));
    });

    it.each([
      ['bpmn', '@diagram bpmn\nstart startEvent\nwork task\ndone endEvent\nstart -> work\nwork -> done\n',
        ['startEvent', 'task', 'endEvent'], ['bpmn-start-event', 'bpmn-task', 'bpmn-end-event']],
    ] as const)('reopens source-first %s with its scoped words and no source rewrite', async (notation, source, kinds, symbols) => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name: `${notation}.coral`, text: source }); });
      await waitFor(() => expect(result.current.canvas.notation).toBe(notation));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.data.nodeType)).toEqual([...kinds]));
      expect(result.current.canvas.nodes.map((node) => node.data.symbolId)).toEqual([...symbols]);
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content.format).toBe('dsl');
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toContain(source.slice(source.indexOf('\n') + 1));
      act(() => { result.current.header.onOpenFile({ name: `${notation}.coral.json`, text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.data.nodeType)).toEqual([...kinds]));
      expect(result.current.canvas.nodes.map((node) => node.data.symbolId)).toEqual([...symbols]);
    });

    it('saves and reopens disabled Chen source as exact text without projection', async () => {
      const { result } = await ready();
      const source = '@diagram erd\nCustomer entity\nowns relationship\nlink = Customer -- owns\n';
      act(() => { result.current.header.onOpenFile({ name: 'erd.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      expect(result.current.editor.parseErrors.map((item) => item.code)).toContain('header.diagram.disabled');
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:disabled-erd');
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        expect(createObjectUrl).not.toHaveBeenCalled();
        expect(result.current.rasterExportError).toBeTruthy();
      } finally { createObjectUrl.mockRestore(); }
      act(() => { result.current.header.onOpenFile({ name: 'erd-saved.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    });

    it('keeps a source-authored crow-foot end through editor save and reopen', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\ncustomer service\norder service\n' +
        'orders = customer --{ order [type: relationship]\n';
      act(() => { result.current.header.onOpenFile({ name: 'orders.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['orders']));
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      expect(result.current.editor.dsl).toBe(source);
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content.format).toBe('dsl');
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toContain('orders = customer --{ order [type: relationship]');
      expect(parseInstalledDocument028(savedSource).graph?.edges[0]?.targetEnd?.marker)
        .toEqual({ kind: 'crow-foot', fill: 'unspecified' });
      act(() => { result.current.header.onOpenFile({ name: 'orders.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['orders']));
    });

    it('renders and reopens valid 0.2.8 source without changing authored text on save', async () => {
      const { result } = await ready();
      const source = '// author note\n@diagram architecture\n' +
        'apiGateway = service as "API gateway"\n' +
        'auditSink service as ""\n' +
        'call = apiGateway -> auditSink [type: calls] as "Send"\n';
      act(() => { result.current.header.onOpenFile({ name: 'source.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id).sort())
        .toEqual(['apiGateway', 'auditSink']));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['call']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      expect(result.current.editor.dsl).toBe(source);
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
      expect(result.current.editor.dsl).toBe(source);
      let savedAgain!: ReturnType<typeof result.current.header.onSave>;
      act(() => { savedAgain = result.current.header.onSave(); });
      expect(savedAgain.content).toEqual(saved.content);
      expect(result.current.guidanceAnnouncement).not.toContain('does not render yet');
      act(() => { result.current.canvas.onReflow(); });
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.editor.dsl).toBe(source);
      act(() => { result.current.header.onOpenFile({ name: 'source.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id).sort())
        .toEqual(['apiGateway', 'auditSink']));
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
    });

    it('renders and reopens a source-authored semantic-port edge without losing its endpoint identities', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service\nstore database\n' +
        'read = api:out -> store:query [reads] as "Orders"\n';
      act(() => { result.current.header.onOpenFile({ name: 'ports.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['read']));
      expect(result.current.canvas.edges[0]).toMatchObject({
        source: 'api', target: 'store', sourceHandle: 'out', targetHandle: 'query',
      });
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      act(() => { result.current.canvas.onReflow(); });
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.edges[0]).toMatchObject({
        source: 'api', target: 'store', sourceHandle: 'out', targetHandle: 'query',
      });
      expect(result.current.editor.dsl).toBe(source);
      const saved = result.current.header.onSave();
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toContain('read = api:out -> store:query [reads] as "Orders"');
      act(() => { result.current.header.onOpenFile({ name: 'ports.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      await waitFor(() => expect(result.current.canvas.edges[0]).toMatchObject({
        source: 'api', target: 'store', sourceHandle: 'out', targetHandle: 'query',
      }));
    });

    it.each([
      ['malformed saved-header body', '@diagram architecture\napiGateway service\napiGateway ->\n'],
      ['Unicode-rejected sequence continuation', '@diagram uml-sequence\na participant\nb participant\n' +
        'alt "yes" {\n  first = a -> b\n}\u00a0else "no" {\n  hidden = b -> a\n}\n' +
        'after = a -> b\n'],
      ['rejected sequence opener', '@diagram uml-sequence\na participant\nb participant\n' +
        'alt "bad\\q" {\n  hidden = a -> b\n}\nafter = b -> a\n'],
      ['literal Unicode line separator in a label',
        '@diagram architecture\napi service as "left\u2028right"\n'],
      ['retired headerless declaration', 'service "Alpha"'],
    ])('keeps %s untouched through save and reopen', async (_name, source) => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name: 'draft.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.parseErrors.length).toBeGreaterThan(0));
      if (!source.startsWith('@diagram')) expect(result.current.editor.parseErrors)
        .toContainEqual(expect.objectContaining({ code: 'header.diagram.required' }));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
      expect(result.current.editor.dsl).toBe(source);
      act(() => { result.current.header.onOpenFile({ name: 'draft.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    });

    it('saves a rendered destruction as exact source with lifecycle meaning', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'end = client -> server [destroy] as "close()"\n';
      act(() => { result.current.header.onOpenFile({ name: 'destroy.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      expect(result.current.editor.parseErrors).toEqual([]);
      const saved = result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
      act(() => { result.current.header.onOpenFile({ name: 'destroy.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      expect(result.current.editor.parseErrors).toEqual([]);
      expect(result.current.sequence?.graph.interaction?.messages[0].kind).toBe('destroy');
    });

    it('saves and reopens a strict sequence draft with conflicting authored kind and operator', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\n@conformanceLevel strict\n' +
        'client participant\nserver participant\n' +
        'load = client -#> server [async] as "load()"\n';
      act(() => { result.current.header.onOpenFile({ name: 'sequence.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['load']));
      expect(result.current.editor.dsl).toBe(source);
      act(() => { result.current.editor.onCheckConformance(); });
      expect(result.current.editor.conformanceReport?.evaluatedLevel).toBe('strict');
      expect(result.current.editor.conformanceReport?.findings).toContainEqual(
        expect.objectContaining({ id: 'CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT', severity: 'error' }));
      expect(result.current.editor.conformanceReport?.claimStatus).toBe('failed');
      const saved = result.current.header.onSave();
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toContain('@conformanceLevel strict');
      expect(savedSource).toContain('load = client -#> server [async] as "load()"');
      expect(savedSource).toBe(source);
      act(() => { result.current.header.onOpenFile({ name: 'sequence.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['load']);
    });

    it('checks saved operator direction against catalog ports even when a keyed end hides its arrow', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service\nb service\n' +
        'link = a:in -> b:out [secondEnd: zeroOrOne]';
      act(() => { result.current.header.onOpenFile({ name: 'port-role.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => { result.current.editor.onCheckConformance('none', 'debug'); });
      expect(result.current.editor.conformanceReport?.findings).toContainEqual(expect.objectContaining({
        id: 'coral.port.reference.direction', severity: 'error',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('a:in') + 2,
        }) }),
      }));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(source);
      act(() => { result.current.header.onOpenFile({ name: 'port-role.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    });

    it('renders an installed flowchart io node from 0.2.8 source', async () => {
      const { result } = await ready();
      const source = '@diagram flowchart\ninput io as "Input"\nwork process\ninput -> work [flow]\n';
      act(() => { result.current.header.onOpenFile({ name: 'flow.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
        .toEqual(['input', 'work']));
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      expect(result.current.editor.dsl).toBe(source);
    });

    it('checks 0.2.8 conformance explicitly at the saved or a temporary level without editing source', async () => {
      const { result } = await ready();
      const source = '@diagram bpmn\n@conformanceLevel typical\nreceived event\n';
      act(() => { result.current.header.onOpenFile({ name: 'events.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['received']));
      expect(result.current.commandPalette.commands.find((command) => command.id === 'check-conformance')?.disabled)
        .toBe(false);
      act(() => result.current.editor.onCheckConformance());
      expect(result.current.editor.conformanceReport?.evaluatedLevel).toBe('typical');
      expect(result.current.editor.conformanceReport?.findings).toEqual([]);
      expect(result.current.editor.bottomPanelTab).toBe('diagnostics');
      act(() => result.current.editor.onCheckConformance('strict'));
      expect(result.current.editor.conformanceReport?.evaluatedLevel).toBe('strict');
      expect(result.current.editor.conformanceReport?.findings.map((finding) => finding.id))
        .toContain('BPMN.EVENT.CONCRETE_KIND_REQUIRED');
      expect(result.current.editor.dsl).toBe(source);
      act(() => result.current.editor.onDslChange(source.replace('received event', 'received task')));
      expect(result.current.editor.conformanceReport).toBeNull();
    });

    it('filters notices independently of the complete findings without saving a notice preference in source', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\n@conformanceLevel typical\n' +
        'client participant\nserver participant\n' +
        'client -#> server [async] as "load()"\n';
      act(() => { result.current.header.onOpenFile({ name: 'notices.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
        .toEqual(['client', 'server']));
      act(() => result.current.editor.onCheckConformance());
      expect(result.current.editor.conformanceReport?.findings.map((finding) => finding.id))
        .toContain('CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT');
      expect(result.current.editor.conformanceReport?.notices).toEqual([]);
      act(() => result.current.editor.onCheckConformance(undefined, 'warning'));
      expect(result.current.editor.conformanceReport?.evaluatedLevel).toBe('typical');
      expect(result.current.editor.conformanceReport?.notices.map((finding) => finding.id))
        .toContain('CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT');
      expect(result.current.editor.dsl).toBe(source);
    });

    it('reports a strict BPMN Start Event flow violation at its authored kind without changing the draft', async () => {
      const { result } = await ready();
      const source = '@diagram bpmn\n@conformanceLevel typical\n' +
        'begin startEvent\nwork task\nwork -> begin [sequence]\n';
      act(() => { result.current.header.onOpenFile({ name: 'start-flow.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
        .toEqual(['begin', 'work']));
      act(() => result.current.editor.onCheckConformance('strict'));
      expect(result.current.editor.conformanceReport?.findings).toContainEqual(expect.objectContaining({
        id: 'BPMN.EVENT.TOP_LEVEL.START_INCOMING_SEQUENCE',
        range: expect.objectContaining({ start: expect.objectContaining({
          offset: source.indexOf('startEvent'),
        }) }),
      }));
      expect(result.current.editor.dsl).toBe(source);
    });

    it('reports an authored UML inheritance arrow while leaving editor source and save intact', async () => {
      const { result } = await ready();
      const source = '@diagram uml-class\n@conformanceLevel strict\n' +
        'Child class\nBase class\nChild -> Base [inheritance]\n';
      act(() => { result.current.header.onOpenFile({ name: 'class.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
      act(() => result.current.editor.onCheckConformance());
      expect(result.current.editor.conformanceReport?.findings).toContainEqual(expect.objectContaining({
        id: 'CORAL.UML.CLASS.INHERITANCE.OPEN_TRIANGLE', severity: 'error',
        range: expect.objectContaining({ start: expect.objectContaining({ offset: source.indexOf('->') }) }),
      }));
      const saved = result.current.header.onSave();
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toContain('Child -> Base [inheritance]');
      act(() => { result.current.header.onOpenFile({ name: 'class.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
    });

    it('reopens the saved strict level after a temporary none check without making save a conformance claim', async () => {
      const { result } = await ready();
      const source = '@diagram bpmn\n@conformanceLevel strict\nreceived event\n';
      act(() => { result.current.header.onOpenFile({ name: 'strict.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['received']));
      act(() => result.current.editor.onCheckConformance('none'));
      expect(result.current.editor.conformanceReport?.evaluatedLevel).toBe('none');
      expect(result.current.editor.dsl).toBe(source);
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content.format).toBe('dsl');
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toContain('@conformanceLevel strict\n');
      expect(savedSource).toBe(source);
      act(() => { result.current.header.onOpenFile({ name: 'strict-saved.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      act(() => result.current.editor.onCheckConformance());
      expect(result.current.editor.conformanceReport?.evaluatedLevel).toBe('strict');
      expect(result.current.editor.conformanceReport?.findings.map((finding) => finding.id))
        .toContain('BPMN.EVENT.CONCRETE_KIND_REQUIRED');
    });

    it('keeps a symbol-bound exception through source save and reopen without retargeting it', async () => {
      const { result } = await ready();
      const source = '@diagram flowchart\n@conformanceLevel strict\n' +
        'api process [symbol: "arch-service", conformanceException: "arch-service"]\n';
      act(() => { result.current.header.onOpenFile({ name: 'exception.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['api']));
      act(() => result.current.editor.onCheckConformance());
      expect(result.current.editor.conformanceReport?.findings).toContainEqual(expect.objectContaining({
        id: 'CORAL.SYMBOL.OUT_OF_PROFILE', severity: 'warning',
      }));
      act(() => result.current.editor.onCheckConformance('none'));
      expect(result.current.editor.conformanceReport?.evaluatedLevel).toBe('none');
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toContain('[symbol: "arch-service", conformanceException: "arch-service"]');
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:strict-exception');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        expect(createObjectUrl).toHaveBeenCalledOnce();
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported).toMatchObject({ version: '4.0.0', conformanceLevel: 'strict',
          conformanceExceptions: [{ kind: 'explicit-symbol', nodeId: 'api', symbol: 'arch-service' }],
          nodes: [{ id: 'api', symbol: 'arch-service' }],
        });
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      act(() => { result.current.header.onOpenFile({ name: 'exception.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      act(() => result.current.editor.onCheckConformance());
      expect(result.current.editor.conformanceReport?.exceptions).toContainEqual(expect.objectContaining({
        nodeId: 'api', symbol: 'arch-service',
        affectedRuleIds: ['CORAL.SYMBOL.OUT_OF_PROFILE'],
      }));
    });

    it('withholds a conformance report for invalid 0.2.8 source', async () => {
      const { result } = await ready();
      const source = '@diagram bpmn\nreceived event\nreceived ->\n';
      act(() => { result.current.header.onOpenFile({ name: 'draft.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.parseErrors.length).toBeGreaterThan(0));
      act(() => result.current.editor.onCheckConformance('strict'));
      expect(result.current.editor.conformanceReport).toBeNull();
      expect(result.current.editor.conformanceCheckError).toMatch(/Fix the Coral source/);
      expect(result.current.editor.dsl).toBe(source);
    });

    it('checks reverse-directed sequence source without changing its written endpoints or saved level', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\n@conformanceLevel strict\n' +
        'client participant\nserver participant\n' +
        'reply = client <- server [type: return] as "result"\n';
      act(() => { result.current.header.onOpenFile({ name: 'reverse.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.editor.onCheckConformance());
      expect(result.current.editor.conformanceReport?.evaluatedLevel).toBe('strict');
      expect(result.current.editor.conformanceReport?.findings.map((finding) => finding.id))
        .toContain('CORAL.UML.SEQUENCE.KIND_OPERATOR.CONFLICT');
      expect(result.current.editor.dsl).toBe(source);
      act(() => result.current.editor.onCheckConformance('none'));
      expect(result.current.editor.conformanceReport?.evaluatedLevel).toBe('none');
      expect(result.current.editor.dsl).toBe(source);
    });

    it('saves and reopens a creation-introduced participant without writing an invented declaration', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\nclient participant\n' +
        'spawn = client -.-> worker [create] as "spawn()"\n';
      const plan = planFileOpen({ name: 'creation.coral', text: source });
      expect(plan.kind, JSON.stringify(plan)).toBe('open');
      if (plan.kind !== 'open') return;
      expect(plan.textOpen?.blockWith).toBeUndefined();
      act(() => { result.current.header.onOpenFile({ name: 'creation.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
        .toEqual(['client', 'worker']));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content.format).toBe('dsl');
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toContain('spawn = client -.-> worker [create] as "spawn()"');
      expect(savedSource).not.toContain('worker participant');
      act(() => { result.current.header.onOpenFile({ name: 'creation-saved.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
        .toEqual(['client', 'worker']));
      expect(parseInstalledDocument028(savedSource).graph?.interaction?.messages[0]?.kind).toBe('create');
    });

    it('displays a reverse-directed saved-header sequence without treating the display edge as authored source', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'reply = client <- server [return] as "result"\n';
      const plan = planFileOpen({ name: 'reverse.coral', text: source });
      expect(plan).toMatchObject({ kind: 'open', textOpen: { canonicalInput: { edges: [
        { id: 'reply', source: 'server', target: 'client' },
      ] } } });
      act(() => { result.current.header.onOpenFile({ name: 'reverse.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['reply']));
      expect(result.current.canvas.edges[0]).toMatchObject({ source: 'server', target: 'client' });
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      expect(result.current.editor.dsl).toBe(source);
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toMatchObject({ format: 'dsl', dslType: 'coral' });
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toBe(source);
      expect(savedSource).toContain('reply = client <- server [return] as "result"\n');
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      act(() => { result.current.canvas.onReflow(); });
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.editor.dsl).toBe(savedSource);
      act(() => { result.current.header.onOpenFile({ name: 'reverse-saved.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      await waitFor(() => expect(result.current.canvas.edges[0]).toMatchObject({
        id: 'reply', source: 'server', target: 'client',
      }));
    });

    it('exports the source-owned successor candidate, never the GraphIR 3 display', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\n' +
        'api service [symbol: "arch-service", variant: "gateway"]\nstore database\n' +
        'read = api:out ----> store:query [reads]\n';
      act(() => { result.current.header.onOpenFile({ name: 'ports.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('read'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.nodes.find((node) => node.id === 'api')?.data)
        .toMatchObject({ symbolId: 'arch-service', variant: 'gateway' });
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:source-graph');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const filenames: string[] = [];
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
        filenames.push(this.download);
      });
      try {
        expect(result.current.commandPalette.commands.find((item) => item.id === 'export')?.label)
          .toBe('Export GraphIR 4 candidate');
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        expect(createObjectUrl).toHaveBeenCalledOnce();
        expect(filenames).toEqual(['ports-graph-ir-4-candidate.json']);
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported).toMatchObject({ version: '4.0.0', conformanceLevel: 'typical',
          nodes: [{ id: 'api', type: 'service', symbol: 'arch-service', variant: 'gateway' },
            { id: 'store', type: 'database' }],
          edges: [{ id: 'read', first: { node: 'api', port: 'out' },
            second: { node: 'store', port: 'query' }, direction: 'first-to-second', proximityHint: 4 }],
        });
        expect(exported.nodes[0]).not.toHaveProperty('ports');
        expect(result.current.rasterExportError).toBeNull();
        expect(result.current.header.onSave().content).toMatchObject({
          format: 'dsl', dslType: 'coral', text: expect.stringContaining('api:out ----> store:query'),
        });
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        expect(createObjectUrl).toHaveBeenCalledTimes(2);
        expect(result.current.rasterExportError).toBeNull();
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
    });

    it('exports a saved-header semantic output from the canvas attachment side', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service\nstore database\n' +
        'read = api:out -> store:query [reads]\n';
      act(() => { result.current.header.onOpenFile({ name: 'ports.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('read'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onReflow());
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const api = result.current.canvas.nodes.find((node) => node.id === 'api')!;
      const attachment = api.data.resolvedPortAttachments?.out;
      expect(['NORTH', 'SOUTH', 'EAST', 'WEST']).toContain(attachment);
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:semantic-port');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        expect(result.current.rasterExportError).toBeNull();
        expect(createObjectUrl).toHaveBeenCalledOnce();
        const svg = await (createObjectUrl.mock.calls[0][0] as Blob).text();
        const pathStart = /<g data-coral-edge="read">[\s\S]*?<path data-coral-part-id="read:shaft" d="M([\d.-]+) ([\d.-]+)/.exec(svg);
        expect(pathStart).toBeDefined();
        const [firstX, firstY] = [Number(pathStart![1]), Number(pathStart![2])];
        const minX = Math.min(0, ...result.current.canvas.nodes.map((node) => node.position.x));
        const minY = Math.min(0, ...result.current.canvas.nodes.map((node) => node.position.y));
        const width = api.width ?? api.data.width as number;
        const height = api.height ?? api.data.height as number;
        const shape = shapeRegistry.get(symbolRegistry.get(api.data.symbolId!)!.shape)!;
        const fit = stencilFit028(shape, width, height);
        if (attachment === 'EAST') expect(firstX).toBeCloseTo(api.position.x + fit.offsetX + fit.fittedWidth + 24 - minX, 0);
        if (attachment === 'WEST') expect(firstX).toBeCloseTo(api.position.x + fit.offsetX + 24 - minX, 0);
        if (attachment === 'SOUTH') expect(firstY).toBeCloseTo(api.position.y + fit.offsetY + fit.fittedHeight + 24 - minY, 0);
        if (attachment === 'NORTH') expect(firstY).toBeCloseTo(api.position.y + fit.offsetY + 24 - minY, 0);
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
    });

    it('exports the BPMN Sequence Flow head resolved from source without rewriting its arrow', async () => {
      const { result } = await ready();
      const source = '@diagram bpmn\nreceived event\nwork task\nflow = received -> work\n';
      act(() => { result.current.header.onOpenFile({ name: 'sequence-flow.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('flow'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bpmn-sequence-flow');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        expect(result.current.rasterExportError).toBeNull();
        expect(createObjectUrl).toHaveBeenCalledOnce();
        const svg = await (createObjectUrl.mock.calls[0][0] as Blob).text();
        const marker = /<g data-coral-edge="flow">[\s\S]*?marker-end="url\(#([^)]+)\)"/.exec(svg)?.[1];
        expect(marker).toBeDefined();
        const definition = svg.match(new RegExp(`<marker id="${marker}"[^>]*>([\\s\\S]*?)</marker>`))?.[1];
        expect(definition).toMatch(/<path[^>]*fill="(?!none)[^"]+"/);
        expect(result.current.editor.dsl).toBe(source);
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
    });

    it('keeps node-local authored ports through source open, reflow, save, and reopen', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service {\n  audit port [direction: out, anchor: auto]\n}\nstore database {\n  receive port [direction: in]\n}\nread = api:audit -> store:receive [reads]\n';
      act(() => { result.current.header.onOpenFile({ name: 'authored-ports.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]).toMatchObject({
        id: 'read', sourceHandle: 'audit', targetHandle: 'receive',
      }));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      act(() => result.current.canvas.onReflow());
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.edges[0]?.data?.routedPath).toBeDefined();
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toContain('audit port [direction: out, anchor: auto]');
      act(() => { result.current.header.onOpenFile({ name: 'authored-ports.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.canvas.edges[0]).toMatchObject({
        id: 'read', sourceHandle: 'audit', targetHandle: 'receive',
      }));
      expect(result.current.editor.dsl).toContain('audit port [direction: out, anchor: auto]');
    });

    it('edits a source-owned node label without replacing its symbol, ports, or connector text', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service [symbol: "arch-service"] {\n' +
        '  audit port [direction: out, anchor: auto]\n}\n' +
        'store database\nread = api:audit -> store:query [reads]\n';
      act(() => { result.current.header.onOpenFile({ name: 'source-label.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'api')).toBeDefined());
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onLabelEdit('api', 'API gateway'));
      const edited = source.replace('api service [symbol: "arch-service"] {',
        'api service [symbol: "arch-service"] as "API gateway" {');
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'api')?.data.label)
        .toBe('API gateway'));
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toContain('audit port [direction: out, anchor: auto]');
      act(() => { result.current.header.onOpenFile({ name: 'source-label.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toContain('as "API gateway"'));
      await waitFor(() => expect(result.current.canvas.edges[0])
        .toMatchObject({ id: 'read', sourceHandle: 'audit', targetHandle: 'query' }));
    });

    it('commits a canvas-direct connector label as a source transaction through history and save', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service\nz service\nread = a -> z [reads]  // keep\n';
      act(() => { result.current.header.onOpenFile({ name: 'canvas-edge-label.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('read'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.edgeLabelEditable).toBe(true);
      act(() => { expect(result.current.canvas.onEdgeLabelEdit?.('read', 'Reads orders')).toBe(true); });
      const edited = source.replace('[reads]', '[reads] as "Reads orders"');
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges[0]?.label).toBe('Reads orders'));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(edited);
      act(() => { result.current.header.onOpenFile({ name: 'canvas-edge-label.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.label).toBe('Reads orders'));
    });

    it('removes an explicitly empty connector label through source history and reopen', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service\nz service\n' +
        'read = a -> z [reads] as ""  // keep\n';
      act(() => { result.current.header.onOpenFile({ name: 'empty-edge-label.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('read'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.edges[0]?.label).toBe('');
      act(() => { expect(result.current.canvas.onEdgeLabelRemove?.('read')).toBe(true); });
      const removed = source.replace(' as ""', '');
      await waitFor(() => expect(result.current.editor.dsl).toBe(removed));
      await waitFor(() => expect(result.current.canvas.edges[0]?.label).toBeUndefined());
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(removed));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(removed);
      act(() => { result.current.header.onOpenFile({ name: 'empty-edge-label.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(removed));
      await waitFor(() => expect(result.current.canvas.edges[0]?.label).toBeUndefined());
    });

    it('commits a source-owned connector label through the inspector and preserves it through history and save', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service\nz service\nread = a -> z [reads]  // keep\n';
      act(() => { result.current.header.onOpenFile({ name: 'connector-label.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('read'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onSelectionChange({
        nodes: [], edges: [{ ...result.current.canvas.edges[0]!, selected: true }],
      }));
      expect(result.current.inspector?.edgeLabelEditable).toBe(true);
      act(() => { expect(result.current.inspector?.onEdgeLabelEdit('read', 'Reads orders')).toBe(true); });
      const edited = source.replace('[reads]', '[reads] as "Reads orders"');
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges[0]?.label).toBe('Reads orders'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges[0]?.label).toBe('Reads orders'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toContain('[reads] as "Reads orders"  // keep');
      act(() => { result.current.header.onOpenFile({ name: 'connector-label.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.label).toBe('Reads orders'));
    });

    it('keeps a named UML class inheritance edge through inspector edit, history, and reopen', async () => {
      const { result } = await ready();
      const source = acceptanceFixture('uml-class-named.coral');
      act(() => { result.current.header.onOpenFile({ name: 'uml-class-named.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('inheritance'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onSelectionChange({
        nodes: [], edges: [{ ...result.current.canvas.edges[0]!, selected: true }],
      }));
      act(() => { expect(result.current.inspector?.onEdgeLabelEdit('inheritance', 'generalizes')).toBe(true); });
      const edited = source.replace('[inheritance]', '[inheritance] as "generalizes"');
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges[0]?.label).toBe('generalizes'));
      expect(result.current.canvas.edges[0]?.data?.targetEndpoint)
        .toMatchObject({ marker: { kind: 'triangle', fill: 'open' } });
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges[0]?.label).toBe('generalizes'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(edited);
      act(() => { result.current.header.onOpenFile({ name: 'uml-class-named.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.label).toBe('generalizes'));
      expect(result.current.editor.dsl).toBe(edited);
    });

    it('keeps authored UML class connector ends through font apply, history, and reopen', async () => {
      const { result } = await ready();
      const source = acceptanceFixture('uml-class-named.coral');
      act(() => { result.current.header.onOpenFile({ name: 'uml-class-named.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('inheritance'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const before = result.current.canvas.edges[0]?.data?.targetEndpoint;
      expect(before).toMatchObject({ marker: { kind: 'triangle', fill: 'open' } });
      const draft = result.current.inspector!.fontDraft;
      const originalSavedSize = result.current.header.onSave().settings.font?.default.size;
      const updatedSize = (draft.default.size ?? 12) + 2;
      const currentFontSize = () => result.current.header.onSave().settings.font?.default.size;
      act(() => result.current.inspector!.onApplyFont({ ...draft,
        default: { ...draft.default, size: updatedSize },
      }));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(currentFontSize()).toBe(updatedSize));
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.canvas.edges[0]?.data?.targetEndpoint).toEqual(before);
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(currentFontSize()).toBe(originalSavedSize));
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.canvas.edges[0]?.data?.targetEndpoint).toEqual(before);
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(currentFontSize()).toBe(updatedSize));
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.canvas.edges[0]?.data?.targetEndpoint).toEqual(before);
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(source);
      expect(saved.settings.font.default.size).toBe(updatedSize);
      act(() => { result.current.header.onOpenFile({ name: 'uml-class-named.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('inheritance'));
      await waitFor(() => expect(currentFontSize()).toBe(updatedSize));
      expect(result.current.canvas.edges[0]?.data?.targetEndpoint).toEqual(before);
      expect(result.current.editor.dsl).toBe(source);
    });

    it('edits a saved-header sequence label without allowing legacy whole-graph operations', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'reply = client <- server [return] as "Old"  // keep\n';
      act(() => { result.current.header.onOpenFile({ name: 'sequence-label.coral', text: source }); });
      await waitFor(() => expect(result.current.sequence?.graph.edges[0]?.id).toBe('reply'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      let refused!: ReturnType<NonNullable<typeof result.current.sequence>['onOperation']>;
      act(() => { refused = result.current.sequence!.onOperation({ type: 'updateMessage', id: 'reply', kind: 'sync' }); });
      expect(refused.ok).toBe(false);
      act(() => { refused = result.current.sequence!.onOperation({ type: 'updateMessage', id: 'reply', label: 'Unsafe' }); });
      expect(refused.ok).toBe(false);
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.sequence?.sourceMessageLabelEditable).toBe(true);
      act(() => { expect(result.current.sequence?.onSourceMessageLabelEdit('reply', 'New')).toBe(true); });
      const edited = source.replace('as "Old"', 'as "New"');
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.sequence?.graph.edges[0]?.label).toBe('New'));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toContain('reply = client <- server [return] as "New"  // keep');
      act(() => { result.current.header.onOpenFile({ name: 'sequence-label.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.sequence?.graph.edges[0]?.label).toBe('New'));
      expect(result.current.editor.dsl).toContain('reply = client <- server [return] as "New"  // keep');
    });

    it('records two source-owned inline label commits as separate undoable transactions', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service\nstore database\n';
      act(() => { result.current.header.onOpenFile({ name: 'labels.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onLabelEdit('api', 'API'));
      const first = source.replace('api service', 'api service as "API"');
      await waitFor(() => expect(result.current.editor.dsl).toBe(first));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'api')?.data.label)
        .toBe('API'));
      await waitFor(() => expect(result.current.canvas.historyDisabled).toBe(false));
      expect(result.current.canvas.mutationsDisabled).toBe(true);
      expect(result.current.canvas.canUndo).toBe(true);
      expect(result.current.canvas.undoCount).toBe(1);
      act(() => result.current.canvas.onLabelEdit('store', 'Store'));
      const second = first.replace('store database', 'store database as "Store"');
      await waitFor(() => expect(result.current.editor.dsl).toBe(second));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(first));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    });

    it('does not print a source-owned label edit back through the legacy canvas projection', async () => {
      const { result } = await ready();
      const source = '// Keep authored spacing and this comment.\n@diagram architecture\n' +
        'api service\nstore database\napi  ->  store [reads]\n';
      act(() => { result.current.header.onOpenFile({ name: 'source-owned.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onLabelEdit('api', 'API'));
      const edited = source.replace('api service', 'api service as "API"');
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      // Cover the passive 500 ms diagram-to-text debounce, not just the
      // immediate source transaction.
      await new Promise((resolve) => setTimeout(resolve, 650));
      expect(result.current.editor.dsl).toBe(edited);
    });

    it('creates a source-owned semantic-port edge through the canvas transaction path', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service {\n' +
        '  audit port [direction: out, anchor: auto]\n}\n' +
        'store database {\n  receive port [direction: in]\n}\n';
      act(() => { result.current.header.onOpenFile({ name: 'connect.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.mutationsDisabled).toBe(true);
      expect(result.current.canvas.sourceConnectionsEnabled).toBe(true);
      expect(result.current.canvas.isValidConnection({
        source: 'api', target: 'store', sourceHandle: 'audit', targetHandle: 'receive',
      })).toBe(true);
      expect(result.current.canvas.isValidConnection({
        source: 'api', target: 'store', sourceHandle: 'in', targetHandle: 'receive',
      })).toBe(false);
      act(() => result.current.canvas.onConnect({
        source: 'api', target: 'store', sourceHandle: 'audit', targetHandle: 'receive',
      }));
      const edited = source + 'api:audit -> store:receive\n';
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges[0])
        .toMatchObject({ source: 'api', target: 'store', sourceHandle: 'audit', targetHandle: 'receive' }));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges[0]?.data?.routedPath).toBeDefined());
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new-source-edge');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        expect(result.current.rasterExportError).toBeNull();
        expect(createObjectUrl).toHaveBeenCalledOnce();
        const svg = await (createObjectUrl.mock.calls[0][0] as Blob).text();
        expect(svg).toContain('data-coral-edge="edge-1"');
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      act(() => { result.current.header.onOpenFile({ name: 'connect.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toContain('api:audit -> store:receive'));
    });

    it('creates a flat saved-header sequence message with source-owned history and export', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'request = client -#> server as "load()"\n';
      act(() => { result.current.header.onOpenFile({ name: 'messages.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.sourceConnectionsEnabled).toBe(true);
      expect(result.current.canvas.isValidConnection({ source: 'server', target: 'client' })).toBe(true);
      act(() => result.current.canvas.onConnect({ source: 'server', target: 'client' }));
      const edited = source + 'server -> client\n';
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(2));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:sequence-message');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        expect(createObjectUrl).toHaveBeenCalledOnce();
        const graph = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(graph.interaction.items).toEqual([
          { kind: 'message', id: 'request' }, { kind: 'message', id: 'edge-1' },
        ]);
        expect(graph.interaction.messages[1]).toMatchObject({
          senderParticipantId: 'server', receiverParticipantId: 'client', kind: 'asynchronous',
        });
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      act(() => { result.current.header.onOpenFile({ name: 'messages.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const malformed = edited + 'server -> missing\n';
      act(() => result.current.editor.onDslChange(malformed));
      await waitFor(() => expect(result.current.editor.dsl).toBe(malformed));
      expect(result.current.canvas.sourceConnectionsEnabled).toBe(false);
      expect(result.current.canvas.isValidConnection({ source: 'server', target: 'client' })).toBe(false);
      act(() => result.current.canvas.onConnect({ source: 'server', target: 'client' }));
      expect(result.current.editor.dsl).toBe(malformed);
      let malformedSave!: ReturnType<typeof result.current.header.onSave>;
      act(() => { malformedSave = result.current.header.onSave(); });
      expect((malformedSave.content as { text: string }).text).toBe(malformed);
    });

    it('deletes a top-level saved-header group subtree through exact source', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\nteam group {\n  api service\n}\nstore database\n';
      const edited = '@diagram architecture\nstore database\n';
      act(() => { result.current.header.onOpenFile({ name: 'delete.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onNodesChange([{ id: 'team', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'team')?.selected).toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['store']));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toMatchObject({ format: 'dsl',
        text: edited });
      act(() => { result.current.header.onOpenFile({ name: 'delete.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('keeps group-body comments when a canvas deletion is refused', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\nteam group {\n  // retain\n  api service\n}\n' +
        'store database\n';
      act(() => { result.current.header.onOpenFile({ name: 'commented-group.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onNodesChange([{ id: 'team', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'team')?.selected).toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      expect(result.current.guidanceAnnouncement).toContain('source-node-delete.comment');
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['team', 'team.api', 'store']);
      const saved = saveInAct(result);
      expect((saved.content as { text: string }).text).toBe(source);
      act(() => { result.current.header.onOpenFile({ name: 'commented-group.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    });

    it('deletes a nested saved-header group and descendants through exact source', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\nouter group {\n  inner group {\n' +
        '    api service {\n      send port [direction: out]\n    }\n  }\n' +
        '  peer service\n}\nstore database\nread = outer.inner.api:send -> store:query\n' +
        '// retain\nkeep = outer.peer -> store\n';
      const edited = '@diagram architecture\nouter group {\n  peer service\n}\n' +
        'store database\n// retain\nkeep = outer.peer -> store\n';
      act(() => { result.current.header.onOpenFile({ name: 'nested-group.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id))
        .toEqual(['read', 'keep']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onNodesChange([{ id: 'outer.inner', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'outer.inner')?.selected)
        .toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['keep']));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:nested-group');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported.nodes[0].children.map((node: { id: string }) => node.id)).toEqual(['outer.peer']);
        expect(exported.edges.map((edge: { id: string }) => edge.id)).toEqual(['keep']);
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      const saved = saveInAct(result);
      expect((saved.content as { text: string }).text).toBe(edited);
      act(() => { result.current.header.onOpenFile({ name: 'nested-group.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('deletes a nested saved-header port node and its named connector without reprinting its group', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\nteam group {\n  api service {\n' +
        '    send port [direction: out, anchor: side]\n  }\n  peer service\n}\n' +
        'store database\nread = team.api:send -> store:query\n// retain\nkeep = team.peer -> store\n';
      const edited = '@diagram architecture\nteam group {\n  peer service\n}\n' +
        'store database\n// retain\nkeep = team.peer -> store\n';
      act(() => { result.current.header.onOpenFile({ name: 'nested-delete.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id))
        .toEqual(['read', 'keep']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onNodesChange([{ id: 'team.api', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'team.api')?.selected)
        .toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['keep']));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:nested-leaf-delete');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported.nodes[0].children.map((node: { id: string }) => node.id)).toEqual(['team.peer']);
        expect(exported.edges.map((edge: { id: string }) => edge.id)).toEqual(['keep']);
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(edited);
      act(() => { result.current.header.onOpenFile({ name: 'nested-delete.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('deletes a named saved-header connector through source and retains undo and save', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\n@coralVersion "0.2.8"\napi service\nstore database\n' +
        'read = api -> store [calls]\n// keep\nwrite = store -> api [calls]\n';
      const edited = source.replace('read = api -> store [calls]\n', '');
      act(() => { result.current.header.onOpenFile({ name: 'delete-edge.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onEdgesChange([{ id: 'read', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.edges.find((edge) => edge.id === 'read')?.selected).toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      expect(result.current.guidanceAnnouncement).toMatch(/Deleted.*source-owned/);
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['write']));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:deleted-edge');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported.edges).toMatchObject([{ id: 'write' }]);
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        const svg = await (createObjectUrl.mock.calls[1][0] as Blob).text();
        expect(svg).toContain('data-coral-edge="write"');
        expect(svg).not.toContain('data-coral-edge="read"');
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      act(() => { result.current.header.onOpenFile({ name: 'delete-edge.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('deletes a mixed saved-header selection in one source history entry', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\na service\nb service\nc service\nd service\n' +
        'ab = a -> b\n// keep\nbc = b -> c\ncd = c -> d\n';
      const edited = '@diagram architecture\na service\nc service\nd service\n// keep\n';
      act(() => { result.current.header.onOpenFile({ name: 'mixed-delete.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(3));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onNodesChange([{ id: 'b', type: 'select', selected: true }]));
      act(() => result.current.canvas.onEdgesChange([{ id: 'cd', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'b')?.selected)
        .toBe(true));
      await waitFor(() => expect(result.current.canvas.edges.find((edge) => edge.id === 'cd')?.selected)
        .toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(0));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mixed-delete');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported.nodes.map((node: { id: string }) => node.id)).toEqual(['a', 'c', 'd']);
        expect(exported.edges).toEqual([]);
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        const svg = await (createObjectUrl.mock.calls[1][0] as Blob).text();
        expect(svg).not.toContain('data-coral-edge=');
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(edited);
      act(() => { result.current.header.onOpenFile({ name: 'mixed-delete.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('deletes a flat saved-header sequence message through exact source and history', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'request = client -#> server as "load()"\n// keep\n' +
        'reply = client <- server [return] as "result"\n';
      const edited = source.replace('request = client -#> server as "load()"\n', '');
      act(() => { result.current.header.onOpenFile({ name: 'delete-message.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id))
        .toEqual(['request', 'reply']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onEdgesChange([{ id: 'request', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.edges.find((edge) => edge.id === 'request')?.selected)
        .toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['reply']));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:deleted-message');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported.edges.map((edge: { id: string }) => edge.id)).toEqual(['reply']);
        expect(exported.interaction.items).toEqual([{ kind: 'message', id: 'reply' }]);
        expect(exported.interaction.messages).toMatchObject([{ id: 'reply',
          senderParticipantId: 'server', receiverParticipantId: 'client' }]);
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(edited);
      act(() => { result.current.header.onOpenFile({ name: 'delete-message.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('deletes a named message inside an alt through source, history, export, and reopen', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'choice = alt "yes" {\n  keep = client -> server\n' +
        '  remove = server -> client\n} else "no" {\n' +
        '  fallback = client -.-> server\n}\n';
      const edited = source.replace('  remove = server -> client\n', '');
      act(() => { result.current.header.onOpenFile({ name: 'nested-delete.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)
        .sort()).toEqual(['fallback', 'keep', 'remove']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onEdgesChange([{ id: 'remove', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.edges.find((edge) => edge.id === 'remove')?.selected)
        .toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)
        .sort()).toEqual(['fallback', 'keep']));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:nested-delete');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported.edges.map((edge: { id: string }) => edge.id)).toEqual(['keep', 'fallback']);
        expect(exported.interaction.fragments[0].operands[0].items)
          .toEqual([{ kind: 'message', id: 'keep' }]);
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        const svg = await (createObjectUrl.mock.calls[1][0] as Blob).text();
        expect(svg).toContain('data-coral-sequence-message="keep"');
        expect(svg).toContain('data-coral-sequence-message="fallback"');
        expect(svg).not.toContain('data-coral-sequence-message="remove"');
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(edited);
      act(() => { result.current.header.onOpenFile({ name: 'nested-delete.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('saves an emptied alt operand after deletion and exports its authored frame', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\na participant\nb participant\n' +
        'choice = alt "yes" {\n  only = a -> b\n' +
        '} else "no" {\n  other = b -> a\n}\n';
      const edited = source.replace('  only = a -> b\n', '');
      act(() => { result.current.header.onOpenFile({ name: 'empty-alt.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)
        .sort()).toEqual(['only', 'other']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onEdgesChange([{ id: 'only', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.edges.find((edge) => edge.id === 'only')?.selected)
        .toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).not.toContain('only'));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(edited);
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:empty-alt');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported.interaction.fragments[0].operands[0].items).toEqual([]);
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        expect(createObjectUrl).toHaveBeenCalledTimes(2);
        expect(result.current.rasterExportError).toBeNull();
        const svg = await (createObjectUrl.mock.calls[1][0] as Blob).text();
        expect(svg.includes('data-coral-sequence-fragment="choice"')).toBe(true);
        expect(svg.includes('[yes]')).toBe(true);
        expect(svg.includes('[no]')).toBe(true);
        expect(svg.includes('data-coral-sequence-message="other"')).toBe(true);
        expect(svg.includes('data-coral-sequence-message="only"')).toBe(false);
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      act(() => { result.current.header.onOpenFile({ name: 'empty-alt.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('edits a recursive sequence participant name through source with history and exact save', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\na participant\nb participant\n' +
        'choice = alt "yes" {\n  yes = a -> b\n} else "no" {\n  no = b -> a\n}\n';
      const edited = source.replace('b participant', 'b participant as "Server"');
      act(() => { result.current.header.onOpenFile({ name: 'rename-recursive-participant.coral', text: source }); });
      await waitFor(() => expect(result.current.sequence?.graph.interaction?.fragments).toHaveLength(1));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      let committed = false;
      act(() => { committed = result.current.sequence!.onSourceParticipantLabelEdit('b', 'Server'); });
      expect(committed).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.sequence?.graph.nodes.find((node) => node.id === 'b')?.label)
        .toBe('Server'));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(edited);
      act(() => { result.current.header.onOpenFile({ name: 'rename-recursive-participant.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      expect(result.current.sequence?.graph.interaction?.fragments?.[0]?.operands.map((operand) => operand.messageIds))
        .toEqual([['yes'], ['no']]);
    });

    it('deletes a recursive participant and its named messages as one source transaction', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
        'choice = alt "yes" {\n  removeYes = a -> b\n  keepYes = a -> c\n' +
        '} else "no" {\n  removeNo = b -> a\n  keepNo = c -> a\n}\n';
      const edited = source.replace('b participant\n', '')
        .replace('  removeYes = a -> b\n', '')
        .replace('  removeNo = b -> a\n', '');
      act(() => { result.current.header.onOpenFile({ name: 'delete-recursive-participant.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id))
        .toEqual(['removeYes', 'keepYes', 'removeNo', 'keepNo']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      let deleted = false;
      act(() => { deleted = result.current.sequence!.onSourceParticipantDelete('b'); });
      expect(deleted).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id))
        .toEqual(['keepYes', 'keepNo']));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recursive-participant');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported.nodes.map((node: { id: string }) => node.id)).toEqual(['a', 'c']);
        expect(exported.edges.map((edge: { id: string }) => edge.id)).toEqual(['keepYes', 'keepNo']);
        expect(exported.interaction.fragments[0].operands.map((operand: { items: unknown[] }) => operand.items))
          .toEqual([[{ kind: 'message', id: 'keepYes' }], [{ kind: 'message', id: 'keepNo' }]]);
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(edited);
      act(() => { result.current.header.onOpenFile({ name: 'delete-recursive-participant.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('deletes a flat sequence participant and its named messages as one source edit', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\na participant\nb participant\nc participant\n' +
        'request = a -#> b\n// keep\nreply = b -.-> a\nother = a -> c\n';
      const edited = '@diagram uml-sequence\na participant\nc participant\n' +
        '// keep\nother = a -> c\n';
      act(() => { result.current.header.onOpenFile({ name: 'delete-participant.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onNodesChange([{ id: 'b', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'b')?.selected)
        .toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'c']));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['other']));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:deleted-participant');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        const graph = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(graph.interaction.participantOrder).toEqual(['a', 'c']);
        expect(graph.interaction.items).toEqual([{ kind: 'message', id: 'other' }]);
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(edited);
      act(() => { result.current.header.onOpenFile({ name: 'delete-participant.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('deletes an isolated saved-header leaf node through source with Undo and reopen', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\n@coralVersion "0.2.8"\n' +
        'api service\n// keep\nstore database\n';
      const edited = source.replace('api service\n', '');
      act(() => { result.current.header.onOpenFile({ name: 'delete-node.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onNodesChange([{ id: 'api', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'api')?.selected).toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['store']));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:deleted-node');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported.nodes).toMatchObject([{ id: 'store' }]);
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      act(() => { result.current.header.onOpenFile({ name: 'delete-node.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('deletes a flat node with named incident connectors as one saved-header edit', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\n@coralVersion "0.2.8"\n' +
        'a service\nb service\nc service\ninbound = a -> b\n// keep\n' +
        'outbound = b -> c\nother = c -> a\n';
      const edited = '@diagram architecture\n@coralVersion "0.2.8"\n' +
        'a service\nc service\n// keep\nother = c -> a\n';
      act(() => { result.current.header.onOpenFile({ name: 'delete-connected.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(3));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.canvas.onNodesChange([{ id: 'b', type: 'select', selected: true }]));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'b')?.selected).toBe(true));
      act(() => result.current.canvas.onDeleteSelection());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['a', 'c']));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['other']));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      act(() => { result.current.header.onOpenFile({ name: 'delete-connected.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('renders, exports, saves, and reopens recursive sequence text from one source model', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\na participant\nb participant\n' +
        'choice = alt "yes" {\n  retry = alt "again" {\n    a -> b\n' +
        '  } else "stop" {\n    b -> a\n  }\n} else "no" {\n  b -> a\n}';
      act(() => { result.current.header.onOpenFile({ name: 'recursive.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.editor.parseErrors).toEqual([]));
      await waitFor(() => expect(layoutSequence(result.current.sequence!.graph).fragments
        .map((fragment) => fragment.id)).toEqual(['choice', 'retry']));
      expect(result.current.canvas.sourceConnectionsEnabled).toBe(true);
      expect(result.current.canvas.isValidConnection({ source: 'a', target: 'b' })).toBe(true);
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recursive-model');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        expect(result.current.rasterExportError).toBeNull();
        expect(createObjectUrl).toHaveBeenCalledOnce();
        const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
        expect(exported.interaction.fragments).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: 'choice', kind: 'alt' }),
          expect.objectContaining({ id: 'retry', kind: 'alt' }),
        ]));
        expect(exported.interaction.items).toMatchObject([{ kind: 'fragment', id: 'choice' }]);
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        expect(createObjectUrl).toHaveBeenCalledTimes(2);
        expect(await (createObjectUrl.mock.calls[1][0] as Blob).text())
          .toContain('data-coral-sequence-fragment="retry"');
        expect(result.current.rasterExportError).toBeNull();
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toMatchObject({ format: 'dsl', dslType: 'coral',
        text: expect.stringContaining('choice = alt "yes" {\n  retry = alt "again" {') });
      const afterSaveUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recursive-after-save');
      const afterSaveRevoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const afterSaveClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        expect(afterSaveUrl).toHaveBeenCalledOnce();
      } finally {
        afterSaveUrl.mockRestore();
        afterSaveRevoke.mockRestore();
        afterSaveClick.mockRestore();
      }
      act(() => { result.current.header.onOpenFile({ name: 'recursive.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe((saved.content as { text: string }).text));
      await waitFor(() => expect(layoutSequence(result.current.sequence!.graph).fragments
        .map((fragment) => fragment.id)).toEqual(['choice', 'retry']));
      const reopenedUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recursive-reopened');
      const reopenedRevoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const reopenedClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        expect(reopenedUrl).toHaveBeenCalledOnce();
      } finally {
        reopenedUrl.mockRestore();
        reopenedRevoke.mockRestore();
        reopenedClick.mockRestore();
      }
    });

    it('rejects recursive candidate export after source moves beyond the accepted model', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\na participant\nb participant\n' +
        'choice = alt "yes" {\n  retry = alt "again" {\n    a -> b\n' +
        '  } else "stop" {\n    b -> a\n  }\n} else "no" {\n  b -> a\n}';
      const changed = source + '\na -> missing';
      act(() => { result.current.header.onOpenFile({ name: 'stale-recursive.coral', text: source }); });
      await waitFor(() => expect(layoutSequence(result.current.sequence!.graph).fragments
        .map((fragment) => fragment.id)).toEqual(['choice', 'retry']));
      act(() => result.current.editor.onDslChange(changed));
      await waitFor(() => expect(result.current.editor.dsl).toBe(changed));
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:stale-recursive');
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
        expect(createObjectUrl).not.toHaveBeenCalled();
        expect(result.current.rasterExportError).toMatch(/source-export\.(stale|invalid)/);
        let saved!: ReturnType<typeof result.current.header.onSave>;
        act(() => { saved = result.current.header.onSave(); });
        expect((saved.content as { text: string }).text).toContain('a -> missing');
      } finally {
        createObjectUrl.mockRestore();
      }
    });

    it('creates a saved-header edge from the dialog as one source-owned transaction', async () => {
      const { result } = await ready();
      const source = '// Keep the authored declaration and comment.\n@diagram architecture\n' +
        'api service {\n  audit port [direction: out, anchor: auto]\n}\nstore database\n';
      act(() => { result.current.header.onOpenFile({ name: 'dialog-edge.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const createEdge = result.current.commandPalette.commands.find((item) => item.id === 'create-edge')!;
      expect(createEdge.disabled).toBe(false);
      expect(result.current.commandPalette.commands.find((item) => item.id === 'create-node')?.disabled).toBe(false);
      act(() => createEdge.action({ invoker: null }));
      expect(result.current.authoring?.endpoints.find((endpoint) => endpoint.id === 'api')?.sourcePorts)
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'audit', direction: 'out' })]));
      expect(result.current.authoring?.endpoints.find((endpoint) => endpoint.id === 'store')?.targetPorts)
        .toEqual(expect.arrayContaining([expect.objectContaining({ id: 'query', direction: 'in' })]));
      let created!: { ok: true } | { ok: false; error: string };
      act(() => { created = result.current.authoring!.onSubmitEdge({
        sourceId: 'api', sourcePortId: 'audit', targetId: 'store', targetPortId: 'query',
        label: 'reads Orders',
      }); });
      expect(created).toEqual({ ok: true });
      const edited = source + 'api:audit -> store:query as "reads Orders"\n';
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges[0])
        .toMatchObject({ sourceHandle: 'audit', targetHandle: 'query' }));
      expect(result.current.canvas.edges[0]?.label).toBe('reads Orders');
      expect(result.current.canvas.edges[0]?.selected).toBe(true);
      expect(result.current.canvas.focusRequest).toMatchObject({ kind: 'edge',
        id: result.current.canvas.edges[0]!.id });
      expect(result.current.authoring).toBeNull();
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const saved = saveInAct(result);
      act(() => { result.current.header.onOpenFile({ name: 'dialog-edge.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toContain('api:audit -> store:query as "reads Orders"'));
    });

    it('keeps a named, typed dialog edge in Coral source through undo and save', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service\nstore database\n';
      act(() => { result.current.header.onOpenFile({ name: 'named-edge.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'create-edge')!
        .action({ invoker: null }));
      expect(result.current.authoring?.sourceOwnedEdge028).toBe(true);
      let created!: { ok: true } | { ok: false; error: string };
      act(() => { created = result.current.authoring!.onSubmitEdge({
        id: 'readOrders', type: 'reads', sourceId: 'api', targetId: 'store', label: 'Order IDs',
      }); });
      expect(created).toEqual({ ok: true });
      const edited = source + 'readOrders = api -> store [reads] as "Order IDs"\n';
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.edges[0]?.id).toBe('readOrders'));
      expect(result.current.canvas.edges[0]?.label).toBe('Order IDs');
      expect(result.current.canvas.edges[0]?.selected).toBe(true);
      expect(result.current.canvas.focusRequest).toMatchObject({ kind: 'edge', id: 'readOrders' });
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const saved = saveInAct(result);
      act(() => { result.current.header.onOpenFile({ name: 'named-edge.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl)
        .toContain('readOrders = api -> store [reads] as "Order IDs"'));
      expect(result.current.editor.dsl).toContain('api service\nstore database\n');
    });

    it('creates a top-level sequence message after recursive alternatives through the source dialog', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\na participant\nb participant\n' +
        'choice = alt "yes" {\n  yes = a -> b\n} else "no" {\n  no = b -> a\n}\n';
      const edited = source + 'after = a -#> b [sync] as "Done"\n';
      act(() => { result.current.header.onOpenFile({ name: 'recursive-append.coral', text: source }); });
      await waitFor(() => expect(result.current.sequence?.graph.interaction?.fragments).toHaveLength(1));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const createEdge = result.current.commandPalette.commands.find((item) => item.id === 'create-edge')!;
      expect(createEdge.disabled).toBe(false);
      act(() => createEdge.action({ invoker: null }));
      expect(result.current.authoring?.sourceOwnedEdge028).toBe(true);
      let created!: { ok: true } | { ok: false; error: string };
      act(() => { created = result.current.authoring!.onSubmitEdge({
        id: 'after', type: 'sync', sourceId: 'a', targetId: 'b', label: 'Done',
      }); });
      expect(created).toEqual({ ok: true });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.sequence?.graph.interaction?.messageOrder)
        .toEqual(['yes', 'no', 'after']));
      expect(projectInstalledSourceToSuccessor028(edited).graph?.interaction?.items).toEqual([
        { kind: 'fragment', id: 'choice' }, { kind: 'message', id: 'after' },
      ]);
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const saved = saveInAct(result);
      act(() => { result.current.header.onOpenFile({ name: 'recursive-append.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('inserts a named message after a nested operand message through one source dialog transaction', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\na participant\nb participant\n' +
        'outer = alt "yes" {\n  inner = alt "again" {\n    nested = a -> b\n' +
        '    unchanged = b -> a\n  } else "stop" {\n    stop = a -> b\n  }\n' +
        '} else "no" {\n  rejected = b -> a\n}\n';
      const edited = source.replace('    nested = a -> b\n',
        '    nested = a -> b\n    follow = b -#> a [sync] as "Retry"\n');
      act(() => { result.current.header.onOpenFile({ name: 'positioned-message.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.editor.parseErrors).toEqual([]));
      await waitFor(() => expect(result.current.sequence).toBeTruthy());
      await waitFor(() => expect(layoutSequence(result.current.sequence!.graph).fragments
        .map((fragment) => fragment.id)).toEqual(['outer', 'inner']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.sequence?.sourceMessageInsertEditable).toBe(true);
      act(() => result.current.sequence!.onSourceAddMessageAfter('nested'));
      expect(result.current.authoring?.sourceOwnedEdge028).toBe(true);
      expect(result.current.authoring?.positionedSequenceEdge028).toBe(true);
      let created!: { ok: true } | { ok: false; error: string };
      act(() => { created = result.current.authoring!.onSubmitEdge({
        id: 'follow', type: 'sync', sourceId: 'b', targetId: 'a', label: 'Retry',
      }); });
      expect(created).toEqual({ ok: true });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const interaction = projectInstalledSourceToSuccessor028(edited).graph?.interaction;
      expect(interaction?.fragments?.[1]?.operands[0]?.items).toEqual([
        { kind: 'message', id: 'nested' }, { kind: 'message', id: 'follow' },
        { kind: 'message', id: 'unchanged' },
      ]);
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const saved = saveInAct(result);
      act(() => { result.current.header.onOpenFile({ name: 'positioned-message.coral.json',
        text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      act(() => result.current.sequence!.onSourceAddMessageAfter('nested'));
      const revised = edited.replace('    nested = a -> b\n', '');
      act(() => result.current.editor.onDslChange(revised));
      await waitFor(() => expect(result.current.authoring).toBeNull());
      expect(result.current.editor.dsl).toBe(revised);
      expect(projectInstalledSourceToSuccessor028(revised).graph?.edges.some((edge) => edge.id === 'late'))
        .toBe(false);
    });

    it('authors an explicit BPMN sequence relation that satisfies the strict declaration rule', async () => {
      const { result } = await ready();
      const source = '@diagram bpmn\n@conformanceLevel strict\nstart startEvent\nwork task\n';
      act(() => { result.current.header.onOpenFile({ name: 'bpmn-edge.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'create-edge')!
        .action({ invoker: null }));
      expect(result.current.authoring?.sourceOwnedEdge028).toBe(true);
      let created!: { ok: true } | { ok: false; error: string };
      act(() => { created = result.current.authoring!.onSubmitEdge({
        id: 'toWork', type: 'sequence', sourceId: 'start', targetId: 'work',
      }); });
      expect(created).toEqual({ ok: true });
      await waitFor(() => expect(result.current.editor.dsl)
        .toBe(source + 'toWork = start -> work [sequence]\n'));
      expect(parseInstalledDocument028(result.current.editor.dsl).graph?.edges[0])
        .toMatchObject({ id: 'toWork', type: 'sequence' });
      act(() => result.current.editor.onCheckConformance());
      expect(result.current.editor.conformanceReport?.evaluatedLevel).toBe('strict');
      expect(result.current.editor.conformanceReport?.findings.map((finding) => finding.id))
        .not.toContain('BPMN.CONNECTOR.EXPLICIT_RELATION_REQUIRED');
    });

    it('creates a saved-header ID-first node in a group as one source-owned transaction', async () => {
      const { result } = await ready();
      const source = '// Keep this authored source.\n@diagram architecture\n' +
        'engineering group {\n  api service\n}\n';
      act(() => { result.current.header.onOpenFile({ name: 'dialog-node.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.some((node) => node.id === 'engineering.api')).toBe(true));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const createNode = result.current.commandPalette.commands.find((item) => item.id === 'create-node')!;
      expect(createNode.disabled).toBe(false);
      act(() => createNode.action({ invoker: null }));
      expect(result.current.authoring?.sourceOwnedNode028).toBe(true);
      expect(result.current.authoring?.nodeOptions).toContainEqual({ id: 'service', label: 'service' });
      expect(result.current.authoring?.parentOptions).toContainEqual({ id: 'engineering', label: 'engineering' });
      let created!: { ok: true } | { ok: false; error: string };
      act(() => { created = result.current.authoring!.onSubmitNode({
        id: 'auditSink', type: 'service', label: 'Audit sink', parentId: 'engineering',
      }); });
      expect(created).toEqual({ ok: true });
      const edited = source.replace('  api service\n', '  api service\n  auditSink service as "Audit sink"\n');
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      await waitFor(() => expect(result.current.canvas.nodes.some((node) => node.id === 'engineering.auditSink')).toBe(true));
      await waitFor(() => expect(result.current.canvas.focusRequest)
        .toMatchObject({ kind: 'node', id: 'engineering.auditSink' }));
      expect(result.current.authoring).toBeNull();
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
      const saved = saveInAct(result);
      act(() => { result.current.header.onOpenFile({ name: 'dialog-node.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toContain('auditSink service as "Audit sink"'));
    });

    it('can create the first node in an accepted blank saved-header diagram', async () => {
      const { result } = await ready();
      const source = '@diagram flowchart\n';
      act(() => { result.current.header.onOpenFile({ name: 'blank.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.nodes).toHaveLength(0);
      const createNode = result.current.commandPalette.commands.find((item) => item.id === 'create-node')!;
      expect(createNode.disabled).toBe(false);
      act(() => createNode.action({ invoker: null }));
      expect(result.current.authoring?.sourceOwnedNode028).toBe(true);
      let created!: { ok: true } | { ok: false; error: string };
      act(() => { created = result.current.authoring!.onSubmitNode({ id: 'start', type: 'process' }); });
      expect(created).toEqual({ ok: true });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source + 'start process\n'));
      await waitFor(() => expect(result.current.canvas.nodes.some((node) => node.id === 'start')).toBe(true));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
    });

    it('does not focus a created edge after a newer source revision replaces it', async () => {
      const { result } = await ready();
      const source = '@diagram flowchart\na process\nb process\n';
      act(() => { result.current.header.onOpenFile({ name: 'edge-focus-revision.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'create-edge')!
        .action({ invoker: null }));
      act(() => { expect(result.current.authoring!.onSubmitEdge({
        id: 'stale', sourceId: 'a', targetId: 'b',
      })).toEqual({ ok: true }); });
      act(() => result.current.editor.onDslChange(source + 'current = b -> a\n'));
      await waitFor(() => expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['current']));
      expect(result.current.canvas.focusRequest).toBeNull();
      expect(result.current.canvas.edges[0]?.selected).not.toBe(true);
    });

    it('does not focus a created node after a newer source revision replaces it', async () => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name: 'focus-revision.coral',
        text: '@diagram flowchart\n' }); });
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'create-node')!
        .action({ invoker: null }));
      let created!: { ok: true } | { ok: false; error: string };
      act(() => { created = result.current.authoring!.onSubmitNode({ id: 'stale', type: 'process' }); });
      expect(created).toEqual({ ok: true });
      act(() => result.current.editor.onDslChange('@diagram flowchart\nreplacement process\n'));
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
        .toEqual(['replacement']));
      expect(result.current.canvas.focusRequest).toBeNull();
    });

    it('keeps character-only UML state source authoritative when visual editing is requested', async () => {
      const { result } = await ready();
      const source = '// source remains authoritative\r\n@diagram uml-state\r\n@coralVersion "0.2.8"\r\n' +
        'start initial\r\nIdle state\r\nfinish final\r\na = start -> Idle\r\nb = Idle -> finish\r\n';
      act(() => { result.current.header.onOpenFile({ name: 'state.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      expect(result.current.canvas.nodes).toEqual([]);
      expect(result.current.canvas.edges).toEqual([]);
      act(() => result.current.canvas.onNodesChange([{
        id: 'Idle', type: 'position', position: { x: 24, y: 48 }, dragging: false,
      }]));
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.guidanceAnnouncement).toMatch(/source|visual|UML state/i);
      expect((saveInAct(result).content as { text: string }).text).toBe(source);
    });

    it.each([
      ['architecture', 'service', 'arch-service'], ['block', 'block', 'block-unit'],
      ['flowchart', 'process', 'flowchart-process'], ['bpmn', 'task', 'bpmn-task'],
      ['uml-class', 'class', 'uml-class'],
      ['uml-sequence', 'participant', 'uml-participant'],
      ['code', 'group', undefined], ['aiml', 'group', undefined],
      ['data-engineering', 'group', undefined], ['sketch', 'group', undefined],
    ] as const)('authors and reopens the first %s node through the shared source path',
      async (profile, type, symbolId) => {
        const { result } = await ready();
        const source = `@diagram ${profile}\n`;
        act(() => { result.current.header.onOpenFile({ name: `${profile}-blank.coral`, text: source }); });
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        expect(result.current.commandPalette.commands.find((item) => item.id === 'create-node')?.disabled)
          .toBe(false);
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'create-node')!
          .action({ invoker: null }));
        expect(result.current.authoring?.nodeOptions.map((option) => option.id)).toContain(type);
        let created!: { ok: true } | { ok: false; error: string };
        act(() => { created = result.current.authoring!.onSubmitNode({ id: 'first', type }); });
        expect(created).toEqual({ ok: true });
        const declaration = type === 'group' ? 'first group {}\n' : `first ${type}\n`;
        await waitFor(() => expect(result.current.editor.dsl).toBe(source + declaration));
        await waitFor(() => expect(result.current.canvas.nodes.some((node) => node.id === 'first')).toBe(true));
        expect(result.current.canvas.nodes.find((node) => node.id === 'first')?.data.symbolId).toBe(symbolId);
        const saved = saveInAct(result);
        const pinned = (saved.content as { text: string }).text;
        expect(pinned).toContain(declaration);
        act(() => { result.current.header.onOpenFile({ name: `${profile}-blank.coral.json`,
          text: JSON.stringify(saved) }); });
        await waitFor(() => expect(result.current.editor.dsl).toBe(pinned));
        expect(result.current.canvas.notation).toBe(profile);
      });

    it.each(Object.entries(HEADER_MANIFEST_028['0.2.8'] ?? {})
      .filter(([, edition]) => edition.enabled !== false)
      .filter(([profile]) => profile !== 'uml-state').map(([profile]) => profile))(
      'opens, checks, exports, and reopens a relation-omitted %s connector', async (profile) => {
        const { result } = await ready();
        const type = profile === 'uml-sequence' ? 'participant' : 'group';
        const source = `@diagram ${profile}\nfirst ${type}\nsecond ${type}\nlink = first -> second\n`;
        act(() => { result.current.header.onOpenFile({ name: `${profile}-plain.coral`, text: source }); });
        await waitFor(() => expect(result.current.editor.dsl).toBe(source));
        await quiesce(result);
        expect(result.current.editor.parseErrors.filter((item) => item.severity === 'error')).toEqual([]);
        expect(result.current.canvas.edges.map((edge) => edge.id)).toEqual(['link']);
        expect(parseCoralDSL(source).sourceGraph?.edges).toMatchObject([{ id: 'link',
          first: { node: 'first' }, second: { node: 'second' }, direction: 'first-to-second' }]);
        act(() => result.current.editor.onCheckConformance('strict', 'debug'));
        expect(result.current.editor.conformanceReport?.ruleset?.profileId).toBe(profile);
        expect(result.current.editor.conformanceReport?.findings.filter((finding) =>
          finding.category !== 'notation')).toEqual([]);
        const saved = saveInAct(result);
        expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
        const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:plain-matrix');
        const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        try {
          act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
          expect(result.current.rasterExportError).toBeNull();
          const exported = JSON.parse(await (createObjectUrl.mock.calls[0][0] as Blob).text());
          expect(exported.edges).toMatchObject([{ id: 'link', direction: 'first-to-second' }]);
        } finally {
          createObjectUrl.mockRestore();
          revokeObjectUrl.mockRestore();
          click.mockRestore();
        }
        act(() => { result.current.header.onOpenFile({ name: `${profile}-plain.coral.json`,
          text: JSON.stringify(saved) }); });
        await waitFor(() => expect(result.current.editor.dsl).toBe(source));
        expect(result.current.canvas.notation).toBe(profile);
      });

    it('refuses a lossy format switch from valid source-owned Coral', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\n@conformanceLevel strict\n' +
        'api service {\n  outbound port [direction: out, anchor: auto]\n}\n' +
        'store database\napi:outbound -> store:query [reads]\n';
      act(() => { result.current.header.onOpenFile({ name: 'source-owned.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.sourceErrorsLocked).toBe(false);
      act(() => result.current.editor.onDslTypeChange('mermaid'));
      expect(result.current.editor.dslType).toBe('coral');
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.guidanceAnnouncement).toMatch(/Edit this 0\.2\.8 diagram in Coral source/i);
      const saved = saveInAct(result);
      expect((saved.content as { text: string }).text).toContain('outbound port [direction: out, anchor: auto]');
    });

    it('refuses a saved-header node dialog after source changes', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service\n';
      act(() => { result.current.header.onOpenFile({ name: 'stale-node.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.some((node) => node.id === 'api')).toBe(true));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'create-node')!
        .action({ invoker: null }));
      const revised = source + 'store database\n';
      act(() => result.current.editor.onDslChange(revised));
      let refused!: { ok: true } | { ok: false; error: string };
      act(() => { refused = result.current.authoring!.onSubmitNode({ id: 'worker', type: 'service' }); });
      expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/source changed/i) });
      expect(result.current.editor.dsl).toBe(revised);
    });

    it('creates a plain saved-header connector without inventing port references', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service\nstore database\n';
      act(() => { result.current.header.onOpenFile({ name: 'plain-dialog.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'create-edge')!
        .action({ invoker: null }));
      expect(result.current.canvas.isValidConnection({ source: 'api', target: 'store' })).toBe(true);
      let created!: { ok: true } | { ok: false; error: string };
      act(() => { created = result.current.authoring!.onSubmitEdge({ sourceId: 'api', targetId: 'store' }); });
      expect(created).toEqual({ ok: true });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source + 'api -> store\n'));
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
      expect(result.current.canvas.edges[0]?.sourceHandle).toBeUndefined();
      expect(result.current.canvas.edges[0]?.targetHandle).toBeUndefined();
      const saved = saveInAct(result);
      const savedSource = result.current.editor.dsl;
      expect(savedSource).toBe(source + 'api -> store\n');
      act(() => { result.current.header.onOpenFile({ name: 'plain-dialog.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(savedSource));
      await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
    });

    it('refuses a dialog edge when its source changes before submission', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service {\n  audit port [direction: out]\n}\nstore database\n';
      act(() => { result.current.header.onOpenFile({ name: 'stale-dialog.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'create-edge')!
        .action({ invoker: null }));
      const revised = source.replace('audit port', 'send port');
      act(() => result.current.editor.onDslChange(revised));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'api')
        ?.data.authoredSemanticPorts?.[0]?.id).toBe('send'));
      let refused!: { ok: true } | { ok: false; error: string };
      act(() => { refused = result.current.authoring!.onSubmitEdge({
        sourceId: 'api', sourcePortId: 'audit', targetId: 'store', targetPortId: 'query',
      }); });
      expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/source changed/i) });
      expect(result.current.editor.dsl).toBe(revised);
      expect(result.current.canvas.edges).toHaveLength(0);
    });

    it('never falls back to legacy graph mutation when an open source-owned dialog loses its header', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service\nstore database\n';
      act(() => { result.current.header.onOpenFile({ name: 'header-dialog.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'create-edge')!
        .action({ invoker: null }));
      expect(result.current.authoring?.kind).toBe('edge');
      const revised = 'service "API" as api\nservice "Store" as store\n';
      act(() => result.current.editor.onDslChange(revised));
      let refused!: { ok: true } | { ok: false; error: string };
      act(() => { refused = result.current.authoring!.onSubmitEdge({ sourceId: 'api', targetId: 'store' }); });
      expect(refused).toMatchObject({ ok: false, error: expect.stringMatching(/source changed/i) });
      expect(result.current.editor.dsl).toBe(revised);
      expect(result.current.canvas.edges).toHaveLength(0);
    });

    it('opens both source-owned authoring shortcuts for accepted saved-header Coral', async () => {
      const { result } = await ready();
      act(() => { result.current.header.onOpenFile({ name: 'shortcuts.coral',
        text: '@diagram architecture\napi service\nstore database\n' }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const shortcut = (key: string) => new KeyboardEvent('keydown', {
        key, ctrlKey: true, altKey: true, bubbles: true, cancelable: true,
      });
      act(() => document.dispatchEvent(shortcut('n')));
      expect(result.current.authoring?.kind).toBe('node');
      act(() => result.current.authoring?.onCancel());
      act(() => document.dispatchEvent(shortcut('e')));
      expect(result.current.authoring?.kind).toBe('edge');
    });

    it.each(['none', 'typical', 'strict'] as const)(
      'keeps a source-owned flowchart connection editable at %s despite profile guidance', async (level) => {
        const { result } = await ready();
        const source = `@diagram flowchart\n@conformanceLevel ${level}\n` +
          'first process\nsecond process\nthird process\n' +
          'first:out -> second:in [flow]\n';
        act(() => { result.current.header.onOpenFile({ name: 'draft-flowchart.coral', text: source }); });
        await waitFor(() => expect(result.current.canvas.edges).toHaveLength(1));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const connection = { source: 'first', target: 'third', sourceHandle: 'out', targetHandle: 'in' };
        expect(result.current.canvas.isValidConnection(connection)).toBe(true);
        act(() => result.current.canvas.onConnectStart({}, {
          nodeId: 'first', handleId: 'out', handleType: 'source',
        }));
        expect(result.current.canvas.nodes.find((node) => node.id === 'third')?.data.dragStates?.in)
          .toBe('compatible');
        act(() => result.current.canvas.onConnectEnd());
        act(() => result.current.canvas.onConnect(connection));
        await waitFor(() => expect(result.current.editor.dsl)
          .toBe(source + 'first:out -> third:in\n'));
        expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
        expect(result.current.editor.diagnosticEntries.filter((entry) => entry.edgeId === 'edge-2')).toEqual([]);
        expect(result.current.canvas.edges.find((edge) => edge.id === 'edge-2')?.data?.compatibilityStatus)
          .toBeUndefined();
      },
    );

    it('uses a semantic inout port ID instead of its canvas handle suffix in saved source', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service {\n' +
        '  shared port [direction: inout]\n}\nstore database\n';
      act(() => { result.current.header.onOpenFile({ name: 'inout.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.isValidConnection({
        source: 'api', target: 'store', sourceHandle: 'shared-out', targetHandle: 'query',
      })).toBe(true);
      act(() => result.current.canvas.onConnectStart({}, {
        nodeId: 'api', handleId: 'shared-out', handleType: 'source',
      }));
      expect(result.current.canvas.nodes.find((node) => node.id === 'store')?.data.dragStates?.query)
        .toBe('compatible');
      act(() => result.current.canvas.onConnectEnd());
      act(() => result.current.canvas.onConnect({
        source: 'api', target: 'store', sourceHandle: 'shared-out', targetHandle: 'query',
      }));
      await waitFor(() => expect(result.current.editor.dsl).toBe(source + 'api:shared -> store:query\n'));
      await waitFor(() => expect(result.current.canvas.edges[0]?.sourceHandle).toBe('shared-out'));
      act(() => result.current.canvas.onReflow());
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.edges[0]?.sourceHandle).toBe('shared-out');
      expect(result.current.editor.dsl).toBe(source + 'api:shared -> store:query\n');
    });

    it('never offers a source-owned handle from an older source interpretation during a text edit', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service {\n' +
        '  audit port [direction: out]\n}\nstore database\n';
      act(() => { result.current.header.onOpenFile({ name: 'changing-port.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes).toHaveLength(2));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const oldConnection = { source: 'api', target: 'store', sourceHandle: 'audit', targetHandle: 'query' };
      expect(result.current.canvas.isValidConnection(oldConnection)).toBe(true);
      const revised = source.replace('audit port', 'send port');
      act(() => result.current.editor.onDslChange(revised));
      expect(result.current.canvas.isValidConnection(oldConnection)).toBe(false);
      expect(result.current.canvas.sourceConnectionsEnabled).toBe(false);
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'api')
        ?.data.authoredSemanticPorts?.[0]?.id).toBe('send'), { timeout: 3000 });
      await waitFor(() => expect(result.current.canvas.sourceConnectionsEnabled).toBe(true));
      expect(result.current.canvas.isValidConnection({ ...oldConnection, sourceHandle: 'send' })).toBe(true);
      expect(result.current.canvas.isValidConnection(oldConnection)).toBe(false);
    });

    it('does not publish a superseded 0.2.8 layout over the latest source-owned graph', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service as "Initial"\nstore database\n' +
        'read = api -> store [reads]\n';
      act(() => { result.current.header.onOpenFile({ name: 'superseded.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'api')?.data.label)
        .toBe('Initial'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));

      let resolveOldLayout!: (value: any) => void;
      const oldLayout = new Promise<any>((resolve) => { resolveOldLayout = resolve; });
      layout.mockImplementationOnce(() => oldLayout);
      const layoutCalls = layout.mock.calls.length;
      const older = source.replace('"Initial"', '"Older"') + 'olderNode service\n';
      act(() => result.current.editor.onDslChange(older));
      await waitFor(() => expect(layout.mock.calls.length).toBeGreaterThan(layoutCalls), { timeout: 3000 });

      const latest = source.replace('"Initial"', '"Latest"') + 'latestNode service\n';
      act(() => result.current.editor.onDslChange(latest));
      await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'api')?.data.label)
        .toBe('Latest'), { timeout: 3000 });
      expect(result.current.editor.dsl).toBe(latest);

      await act(async () => {
        resolveOldLayout({ children: [], edges: [] });
        await oldLayout;
      });
      expect(result.current.editor.dsl).toBe(latest);
      expect(result.current.canvas.nodes.find((node) => node.id === 'api')?.data.label).toBe('Latest');
      expect(result.current.canvas.nodes.find((node) => node.id === 'store')).toBeDefined();
      expect(result.current.canvas.nodes.find((node) => node.id === 'latestNode')).toBeDefined();
      expect(result.current.canvas.nodes.find((node) => node.id === 'olderNode')).toBeUndefined();
      expect(result.current.canvas.edges[0]?.id).toBe('read');
      const saved = saveInAct(result);
      const savedSource = (saved.content as { text: string }).text;
      expect(savedSource).toContain('api service as "Latest"');
      expect(savedSource).not.toContain('api service as "Older"');
      expect(parseInstalledDocument028(savedSource).graph?.nodes.find((node) => node.id === 'api')?.label)
        .toBe('Latest');
    });

    it('keeps semantic-port connections available after an exact-source save', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service {\n' +
        '  audit port [direction: out]\n}\nstore database\n';
      act(() => { result.current.header.onOpenFile({ name: 'pin-then-connect.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.sourceConnectionsEnabled).toBe(true));
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect((saved.content as { text: string }).text).toBe(source);
      expect(result.current.canvas.sourceConnectionsEnabled).toBe(true);
      const connection = { source: 'api', target: 'store', sourceHandle: 'audit', targetHandle: 'query' };
      expect(result.current.canvas.isValidConnection(connection)).toBe(true);
      act(() => result.current.canvas.onConnect(connection));
      await waitFor(() => expect(result.current.editor.dsl)
        .toBe((saved.content as { text: string }).text + 'api:audit -> store:query\n'));
    });

    it('re-routes a source-authored port change before exporting without moving the nodes', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service\nstore database\n' +
        'read = api:out -> store:query [reads]\n';
      act(() => { result.current.header.onOpenFile({ name: 'port-change.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]?.sourceHandle).toBe('out'));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const positions = new Map(result.current.canvas.nodes.map((node) => [node.id, node.position]));
      act(() => result.current.editor.onDslChange(source.replace('api:out', 'api:data')));
      await waitFor(() => expect(result.current.canvas.edges[0]?.sourceHandle).toBe('data'), { timeout: 3000 });
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      expect(result.current.canvas.nodes.map((node) => [node.id, node.position]))
        .toEqual([...positions]);
      const api = result.current.canvas.nodes.find((node) => node.id === 'api')!;
      expect(api.data.resolvedPortAttachments?.data).toBe('SOUTH');
      const route = result.current.canvas.edges[0]?.data?.routedPath as
        { startPoint: { x: number; y: number } } | undefined;
      const shape = shapeRegistry.get(symbolRegistry.get(api.data.symbolId!)!.shape)!;
      const fit = stencilFit028(shape, api.width ?? api.data.width as number,
        api.height ?? api.data.height as number);
      expect(route?.startPoint.y).toBeCloseTo(api.position.y + fit.offsetY + fit.fittedHeight, 0);
      const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:changed-port');
      const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      try {
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        expect(result.current.rasterExportError).toBeNull();
        expect(createObjectUrl).toHaveBeenCalledOnce();
        act(() => result.current.canvas.onUndo());
        await waitFor(() => expect(result.current.canvas.edges[0]?.sourceHandle).toBe('out'));
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        expect(result.current.rasterExportError).toBeNull();
        expect(createObjectUrl).toHaveBeenCalledTimes(2);
        act(() => result.current.canvas.onRedo());
        await waitFor(() => expect(result.current.canvas.edges[0]?.sourceHandle).toBe('data'));
        act(() => result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
        expect(result.current.rasterExportError).toBeNull();
        expect(createObjectUrl).toHaveBeenCalledTimes(3);
      } finally {
        createObjectUrl.mockRestore();
        revokeObjectUrl.mockRestore();
        click.mockRestore();
      }
    });

    it('updates the read-only sequence scene when source changes arrow direction', async () => {
      const { result } = await ready();
      const forward = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'message = client -> server as "send"\n';
      const reverse = forward.replace('client -> server', 'client <- server');
      act(() => { result.current.header.onOpenFile({ name: 'direction.coral', text: forward }); });
      await waitFor(() => expect(result.current.canvas.edges[0]).toMatchObject({
        id: 'message', source: 'client', target: 'server',
      }));
      act(() => result.current.editor.onDslChange(reverse));
      await waitFor(() => expect(result.current.canvas.edges[0]).toMatchObject({
        id: 'message', source: 'server', target: 'client',
      }), { timeout: 3000 });
      expect(result.current.editor.dsl).toBe(reverse);
    });

    it('opens a forward sequence source file with its interaction references intact', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'load = client -#> server as "load()"\n';
      act(() => { result.current.header.onOpenFile({ name: 'forward.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.edges[0]).toMatchObject({
        id: 'load', source: 'client', target: 'server',
      }));
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      expect(result.current.editor.dsl).toBe(source);
    });

    it('withholds a reverse sequence display when a written endpoint is unresolved', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\nclient participant\n' +
        'reply = client <- absent [return] as "result"\n';
      act(() => { result.current.header.onOpenFile({ name: 'missing.coral', text: source }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      expect(result.current.canvas.edges).toEqual([]);
      expect(result.current.editor.parseErrors.some((item) =>
        item.code === 'coral.reference.target.unresolved')).toBe(true);
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toMatchObject({ format: 'dsl', dslType: 'coral', text: source });
    });

    it('opens a profile-only UML class file in its saved profile instead of the prior editor setting', async () => {
      const { result } = await ready();
      const document = createBlankDocument();
      document.settings.notation = 'architecture';
      document.content.graphIR = { version: '3.0.0', id: 'profile-only',
        profile: { id: 'uml', kind: 'class', version: '1.0.0' },
        nodes: [{ id: 'Order', type: 'class', label: 'Order',
          classifier: { kind: 'class', name: 'Order', compartments: [{ id: 'name', kind: 'name' }] } }],
        edges: [] };
      act(() => { result.current.header.onOpenFile({ name: 'class.coral.json', text: JSON.stringify(document) }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['Order']));
      expect(result.current.editor.dsl).toContain('@diagram uml-class\n');
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
    });

    it.each([false, true])('keeps reopened source authoritative when a prior notation debounce is due (invalid=%s)', async (invalid) => {
      const { result } = await ready();
      const source = '@diagram architecture\napi service as "Reviewed"\n';
      act(() => { result.current.header.onOpenFile({ name: 'reviewed.coral', text: source }); });
      await quiesce(result);
      const saved = saveInAct(result);
      const reopened = invalid ? `${source}api service\n` : source;
      saved.content = { format: 'dsl', dslType: 'coral', text: reopened };
      vi.useFakeTimers();
      try {
        act(() => result.current.editor.onDslChange('@diagram flowchart\ntemporary process'));
        await act(async () => { await vi.advanceTimersByTimeAsync(300); });
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['temporary']);
        expect(result.current.canvas.isLoading).toBe(false);
        // Open commits synchronously, while React has not yet run the prior
        // source effect's cleanup. A due timer must not borrow the new open's
        // revision and publish the replaced source over its accepted meaning.
        await act(async () => {
          expect(result.current.header.onOpenFile({ name: 'reviewed.coral.json',
            text: JSON.stringify(saved) })).toBe(true);
          await vi.advanceTimersByTimeAsync(300);
        });
        expect(result.current.editor.dsl).toBe(reopened);
        expect(result.current.canvas.isLoading).toBe(false);
        expect(result.current.canvas.updateStatus).toBeNull();
        expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(invalid ? [] : ['api']);
        if (invalid) {
          expect(result.current.editor.parseErrors).toContainEqual(expect.objectContaining({
            message: 'Duplicate node ID: api',
          }));
        } else {
          expect(result.current.editor.parseErrors.filter((item) => item.severity === 'error')).toEqual([]);
          const url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:reopened');
          const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
          const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
          try {
            act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
            expect(result.current.rasterExportError).toBeNull();
            expect(url).toHaveBeenCalledOnce();
            const exported = JSON.parse(await (url.mock.calls[0][0] as Blob).text());
            expect(exported.nodes).toEqual(expect.arrayContaining([
              expect.objectContaining({ id: 'api', label: 'Reviewed' }),
            ]));
          } finally { url.mockRestore(); revoke.mockRestore(); click.mockRestore(); }
        }
      } finally { vi.useRealTimers(); }
    });

    it('opens, saves, and reopens a UML sequence as exact Coral source', async () => {
      const { result } = await ready();
      const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
        'client -#> server as "load()"\nreply = server -.-> client as "result"\n';
      const interaction = parseInstalledDocument028(source).graph?.interaction;
      expect(interaction?.messages).toHaveLength(2);
      act(() => { result.current.header.onOpenFile({ name: 'sequence.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id))
        .toEqual(['client', 'server']));
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.editor.parseErrors.filter((item) => item.severity !== 'warning')).toEqual([]);
      let saved!: ReturnType<typeof result.current.header.onSave>;
      act(() => { saved = result.current.header.onSave(); });
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: source });
      act(() => { result.current.header.onOpenFile({ name: 'sequence-saved.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      await waitFor(() => expect(result.current.sequence?.graph.interaction).toEqual(interaction));
    });

    it('refuses an unmapped canvas move over source-owned 0.2.8 text', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napiGateway service\nauditSink service\n' +
        'call = apiGateway -> auditSink [calls]\n';
      act(() => { result.current.header.onOpenFile({ name: 'source.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id).sort())
        .toEqual(['apiGateway', 'auditSink']));
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      await waitFor(() => expect(result.current.canvas.updateStatus).toBeNull());
      const before = result.current.canvas.nodes.find((node) => node.id === 'apiGateway')!.position;
      act(() => result.current.canvas.onNodesChange([{
        id: 'apiGateway', type: 'position', position: { x: before.x + 80, y: before.y + 20 }, dragging: false,
      }]));
      expect(result.current.canvas.nodes.find((node) => node.id === 'apiGateway')!.position).toEqual(before);
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.guidanceAnnouncement).toBe(
        'Edit this 0.2.8 diagram in Coral source; inline node labels, selected connector labels, and semantic-port connections preserve its authored notation.');
    });

    it('keeps 0.2.8 source edits undoable while canvas mutation is locked', async () => {
      const { result } = await ready();
      const source = '@diagram architecture\napiGateway service as "API gateway"\n';
      act(() => { result.current.header.onOpenFile({ name: 'source.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['apiGateway']));
      const edited = source.replace('API gateway', 'Primary API');
      act(() => result.current.editor.onDslChange(edited));
      await waitFor(() => expect(result.current.canvas.nodes[0]?.data.label).toBe('Primary API'));
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(edited));
    });

    it('changes only the authored diagram type through the inspector and keeps it undoable', async () => {
      const { result } = await ready();
      const source = '// Keep this comment and exact spacing.\n@diagram flowchart\n@conformanceLevel typical\n';
      act(() => { result.current.header.onOpenFile({ name: 'source.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.notation).toBe('flowchart'));
      act(() => result.current.inspector!.onDocumentSettingsChange({
        ...result.current.inspector!.documentSettings, notation: 'block',
      }));
      const changed = source.replace('@diagram flowchart', '@diagram block');
      await waitFor(() => expect(result.current.editor.dsl).toBe(changed));
      await waitFor(() => expect(result.current.canvas.notation).toBe('block'));
      expect(result.current.editor.dsl).not.toContain('@graph');
      act(() => result.current.canvas.onUndo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(source));
      act(() => result.current.canvas.onRedo());
      await waitFor(() => expect(result.current.editor.dsl).toBe(changed));
      const saved = result.current.header.onSave();
      expect(saved.content.format).toBe('dsl');
      expect((saved.content as { text: string }).text).toContain('@diagram block\n');
      expect((saved.content as { text: string }).text).toContain('@conformanceLevel typical\n');
    });

    it('changes a 0.2.8 diagram type through its command without replacing invalid source', async () => {
      const { result } = await ready();
      const source = '@diagram flowchart\nfirst process\nfirst ->\n';
      act(() => { result.current.header.onOpenFile({ name: 'draft.coral', text: source }); });
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const command = result.current.commandPalette.commands.find((item) => item.id === 'notation-block')!;
      act(() => command.action());
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('first: flowchart-process → generic'));
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('preview covers only parsed declarations'));
      await waitFor(() => expect(result.current.editor.dsl).toBe('@diagram block\nfirst process\nfirst ->\n'));
      expect(result.current.editor.dsl).not.toContain('@graph');
    });

    it('previews profile reinterpretation and leaves source unchanged when the author cancels', async () => {
      const { result } = await ready();
      const source = '@diagram bpmn\nwork task\ndone endEvent\ncall = work -> done\n';
      act(() => { result.current.header.onOpenFile({ name: 'task.coral', text: source }); });
      await waitFor(() => expect(result.current.canvas.notation).toBe('bpmn'));
      const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      act(() => result.current.inspector!.onDocumentSettingsChange({
        ...result.current.inspector!.documentSettings, notation: 'erd',
      }));
      expect(confirm).not.toHaveBeenCalled();
      expect(result.current.editor.dsl).toBe(source);
      expect(result.current.canvas.notation).toBe('bpmn');
      expect(result.current.guidanceAnnouncement).toBe('Diagram type erd is unavailable in Coral 0.2.8.');
    });

    it('saves a just-typed edit as its text rather than the last committed graph', async () => {
      const { result } = await ready();
      const original = '@diagram flowchart\nseed process\n';
      act(() => { result.current.header.onOpenFile({ name: 'seed.coral', text: original }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual(['seed']));
      const typed = '@diagram flowchart\nfresh process as "Fresh';
      act(() => result.current.editor.onDslChange(typed));
      const saved = result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: typed });
    });

    it.each([
      ['Coral', 'coral', 'clear.coral', '@diagram flowchart\na = process as "A"\n', 'a'],
      ['Mermaid', 'mermaid', 'clear.coral.json', null, 'A'],
    ] as const)('saves and reopens a cleared %s source as exact empty text', async (_label, format, name, source, nodeId) => {
      const { result } = await ready();
      const initial = source ?? (() => {
        const doc = createBlankDocument();
        doc.content = { format: 'dsl', dslType: 'mermaid', text: 'flowchart LR\n  A[Alpha]' };
        return JSON.stringify(doc);
      })();
      act(() => { result.current.header.onOpenFile({ name, text: initial }); });
      await waitFor(() => expect(result.current.canvas.nodes.map((node) => node.id)).toEqual([nodeId]));
      act(() => result.current.editor.onDslChange(''));
      await waitFor(() => expect(result.current.editor.dsl).toBe(''));
      await quiesce(result);
      const saved = saveInAct(result);
      expect(saved.content).toEqual({ format: 'dsl', dslType: format, text: '' });
      let reopened = false;
      act(() => { reopened = result.current.header.onOpenFile({
        name: 'cleared.coral.json', text: JSON.stringify(saved),
      }); });
      expect(reopened).toBe(true);
      await waitFor(() => expect(result.current.editor.dsl).toBe(''));
      await quiesce(result);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 650)); });
      expect(result.current.editor.dsl).toBe('');
      expect(saveInAct(result).content).toEqual({ format: 'dsl', dslType: format, text: '' });
    });

    it.each([
      ['coral', '@diagram flowchart\nfresh process as "Fresh"\n'],
      ['mermaid', 'flowchart LR\n  Fresh[Fresh] --> Done[Done]'],
    ] as const)('round-trips a pending %s edit as exact source (AC-4)', async (format, text) => {
      const { result } = await ready();
      if (format === 'coral') {
        act(() => { result.current.header.onOpenFile({ name: 'seed.coral', text: '@diagram flowchart\nseed process\n' }); });
      } else {
        const doc = createBlankDocument();
        doc.content = { format: 'dsl', dslType: 'mermaid', text: 'flowchart LR\n  Seed[Seed]' };
        act(() => { result.current.header.onOpenFile({ name: 'seed.coral.json', text: JSON.stringify(doc) }); });
      }
      await waitFor(() => expect(result.current.editor.dslType).toBe(format));
      act(() => result.current.editor.onDslChange(text));
      const saved = result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: format, text });

      act(() => { result.current.header.onOpenFile({ name: `pending-${format}.coral.json`, text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(text));
      expect(result.current.editor.dslType).toBe(format);
    });

    it('round-trips partially understood Mermaid with exact text and blocked semantic export (AC-4)', async () => {
      const { result } = await ready();
      const text = [
        'flowchart LR',
        'subgraph Group',
        '  A[Alpha] --> B[Beta]',
        'end',
        'style A fill:#fff',
        'classDef important fill:#fff',
        'class A important',
      ].join('\n');
      const doc = createBlankDocument();
      doc.metadata.name = 'Broken Mermaid';
      doc.content = { format: 'dsl', dslType: 'mermaid', text };
      act(() => { result.current.header.onOpenFile({ name: 'broken-mermaid.coral.json', text: JSON.stringify(doc) }); });
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      await waitFor(() => expect(result.current.editor.parseErrors.some((error) =>
        error.code === 'coral.foreign.projection.unverified')).toBe(true));
      const sourceDiagnostics = () => result.current.editor.parseErrors
        .filter((error) => error.code === 'mermaid.line.unparsed')
        .map(({ line, code }) => ({ line, code }));
      const before = sourceDiagnostics();
      expect(before).toEqual([
        { line: 5, code: 'mermaid.line.unparsed' },
        { line: 6, code: 'mermaid.line.unparsed' },
        { line: 7, code: 'mermaid.line.unparsed' },
      ]);
      const saved = result.current.header.onSave();
      expect(saved.content).toEqual({ format: 'dsl', dslType: 'mermaid', text });

      act(() => { result.current.header.onOpenFile({ name: 'broken-mermaid.coral.json', text: JSON.stringify(saved) }); });
      await waitFor(() => expect(result.current.editor.dsl).toBe(text));
      await waitFor(() => expect(result.current.sourceErrorsLocked).toBe(true));
      await waitFor(() => expect(sourceDiagnostics()).toEqual(before));
      expect(result.current.editor.dslType).toBe('mermaid');
      expect(result.current.editor.parseErrors.some((error) => /layout failed/i.test(error.message))).toBe(false);
    });

    it.each([
      ['coral', '@diagram flowchart\nfresh process as "Fresh"\ndone process as "Done"\nfresh -> done\n'],
      ['mermaid', 'flowchart LR\n  Fresh[Fresh] --> Done[Done]'],
    ] as const)('round-trips %s source after a transient layout failure without persisting that diagnostic (AC-4)',
      async (format, text) => {
        const { result } = await ready();
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        const doc = createBlankDocument();
        doc.metadata.name = `Layout ${format}`;
        doc.content = { format: 'dsl', dslType: format, text };
        layout.mockRejectedValueOnce(new Error('transient layout failure'));
        act(() => { result.current.header.onOpenFile({
          name: `layout-${format}.coral.json`, text: JSON.stringify(doc),
        }); });
        await waitFor(() => expect(result.current.editor.parseErrors.some((error) =>
          /layout failed/i.test(error.message))).toBe(true), { timeout: 2500 });
        const saved = result.current.header.onSave();
        expect(saved.content).toEqual({ format: 'dsl', dslType: format, text });

        restoreLayout();
        act(() => { result.current.header.onOpenFile({ name: `layout-${format}.coral.json`, text: JSON.stringify(saved) }); });
        await waitFor(() => expect(result.current.editor.dsl).toBe(text));
        await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
        expect(result.current.editor.dslType).toBe(format);
        expect(result.current.editor.parseErrors.some((error) => /layout failed/i.test(error.message))).toBe(false);
      });

    it('keeps an accepted file current and blocked when its post-commit layout fails (AC-5)', async () => {
      const { result } = await ready();
      await waitFor(() => expect(result.current.canvas.isLoading).toBe(false));
      const acceptedText = '@diagram flowchart\naccepted process as "Accepted"\npeer process as "Peer"\naccepted -> peer\n';
      layout.mockRejectedValueOnce(new Error('open layout denied'));

      let accepted = false;
      act(() => { accepted = result.current.header.onOpenFile({ name: 'accepted.coral', text: acceptedText }); });
      expect(accepted).toBe(true);
      await waitFor(() => expect(result.current.editor.parseErrors.some((error) =>
        /Automatic layout failed/.test(error.message))).toBe(true), { timeout: 2500 });

      expect(result.current.header.documentName).toBe('accepted');
      expect(result.current.editor.dsl).toBe(acceptedText);
      expect(result.current.sourceErrorsLocked).toBe(true);
      expect(exportDiagnostic(result)).toMatch(/automatic layout failed/i);
      const beforeEdit = result.current.editor.dsl;
      act(() => result.current.editor.onDslTypeChange('mermaid'));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(result.current.editor.dsl).toBe(beforeEdit);
      expect(result.current.editor.dslType).toBe('coral');
      expect(result.current.sourceErrorsLocked).toBe(true);
      expect(result.current.header.onSave().content).toEqual({
        format: 'dsl', dslType: 'coral', text: acceptedText,
      });
    });

    it('surfaces a Header Load file-read failure without changing current work (code review FIX-4)', async () => {
      const { result } = await ready();
      const before = result.current.editor.dsl;

      act(() => result.current.header.onOpenFileError({
        name: 'unavailable.coral', error: new Error('selected file unavailable'),
      }));

      expect(result.current.openFailure).toEqual({
        fileName: 'unavailable.coral',
        reasons: [{
          severity: 'error', code: 'coral.open.read.failed', message: 'selected file unavailable',
        }],
      });
      expect(result.current.guidanceAnnouncement).toMatch(/Could not read unavailable\.coral/);
      expect(result.current.editor.dsl).toBe(before);
    });

    it('opens through Ctrl+O and a single-file drop, and blocks a multi-file drop', async () => {
      const { result } = await ready();
      const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
      act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', ctrlKey: true, bubbles: true })); });
      const picker = click.mock.contexts[0] as HTMLInputElement | undefined;
      expect(picker?.type).toBe('file');
      Object.defineProperty(picker!, 'files', { value: [new File(['service "Keyed"'], 'keyed.coral')] });
      await act(async () => { picker!.dispatchEvent(new Event('change')); await new Promise((resolve) => setTimeout(resolve, 20)); });
      await waitFor(() => expect(result.current.editor.dsl).toBe('service "Keyed"'));
      click.mockRestore();

      const over = { preventDefault: vi.fn(), dataTransfer: { types: ['Files'], dropEffect: '' } };
      act(() => result.current.shell.onDragOver(over as never));
      expect(over.preventDefault).toHaveBeenCalled();
      const drop = { preventDefault: vi.fn(), dataTransfer: { files: [new File(['service "Dropped"'], 'dropped.coral')] } };
      await act(async () => { result.current.shell.onDrop(drop as never); await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(drop.preventDefault).toHaveBeenCalled();
      await waitFor(() => expect(result.current.editor.dsl).toBe('service "Dropped"'));
      const many = { preventDefault: vi.fn(), dataTransfer: { files: [new File(['a'], 'a.coral'), new File(['b'], 'b.coral')] } };
      await act(async () => { result.current.shell.onDrop(many as never); });
      expect(many.preventDefault).toHaveBeenCalled();
      expect(result.current.editor.dsl).toBe('service "Dropped"');
      expect(result.current.openFailure?.reasons[0].code).toBe('coral.open.drop.multiple');
      // Announced like every other failed open (TR94-C6-F4).
      expect(result.current.guidanceAnnouncement).toBe('Could not open 2 files. Your current work is unchanged.');
      expect(result.current.commandPalette.commands.some((item) => item.id === 'open' && item.shortcut === 'Ctrl+O')).toBe(true);
    });
  });
});
