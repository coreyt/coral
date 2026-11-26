import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '@coral-viz/render';
import { parseCoralDSL } from '../src/parsers';
import { useEditorControllerWithProperties as useEditorController } from './fixtures/useEditorControllerWithProperties';
import { InspectorPane } from '../src/components/InspectorPane';

// Slice 60 C5: placement, inspector and symbol editor through the existing
// content-snapshot history (c5-design.md "Placement transaction", "Inspector",
// "Symbol editor").

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {},
    removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const DEFINITION = ['@symbol probe {', '  name "Probe"', '  tags "sensor"', '  size 60 x 40', '  outline ellipse',
  '  source "Drawn for tests"', '  license "CC0-1.0"', '  anchor core [x: 0.5, y: 0.5, exit: E]',
  '  login port [direction: in, maxConnections: 2]', '  deep port [direction: out, anchor: core]', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}'];
const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', ...DEFINITION,
  'g service [symbol: "local.probe"]', 'a service', 'b service', 'g:deep -> b', 'a -> g:login', ''].join('\n');
const PLAIN = '@diagram architecture\nseed service\n';

type Result = { current: ReturnType<typeof useEditorController> };

async function opened(text: string): Promise<Result> {
  const { result } = renderHook(() => useEditorController());
  await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
  act(() => { result.current.header.onOpenFile({ name: 'probe.coral', text }); });
  await waitFor(() => expect(result.current.editor.dsl).toBe(text));
  await settle(result);
  return result;
}

function openCreateNode(result: Result) {
  const create = result.current.commandPalette.commands.find((command) => command.id === 'create-node')!;
  act(() => create.action({ invoker: null }));
  expect(result.current.authoring?.kind).toBe('node');
}

async function undo(result: Result, expected: string) {
  act(() => result.current.canvas.onUndo());
  await waitFor(() => expect(result.current.editor.dsl).toBe(expected));
  await settle(result);
}

/** Pending reparses, layouts and Reflows finish, as useEditorController.test's quiesce. */
async function settle(result: Result) {
  await waitFor(() => {
    expect(result.current.canvas.updateStatus).toBeNull();
    expect(result.current.canvas.isLoading).toBe(false);
    expect(result.current.canvas.isReflowing).toBe(false);
    expect(result.current.canvas.reflowDisabledReason).toBeUndefined();
  }, { timeout: 3000 });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('placing a user symbol (R-065 AC-2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('offers document symbols in the Symbol list and places one as one Undo entry', async () => {
    const result = await opened(SOURCE);
    openCreateNode(result);
    const entries = result.current.authoring!.symbolEntries029!;
    expect(entries.filter((entry) => entry.kind === 'document').map((entry) => entry.symbol)).toEqual(['local.probe']);
    expect(entries.some((entry) => entry.typeWord === 'service')).toBe(true);
    act(() => { expect(result.current.authoring!.onSubmitNode({ id: 'h', type: 'service', symbol: 'local.probe' }))
      .toEqual({ ok: true }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(`${SOURCE}h service [symbol: "local.probe"]\n`));
    await undo(result, SOURCE);
  });

  it('places a library definition into a 0.2.8 document with the pin, block and node in one Undo entry', async () => {
    const result = await opened(PLAIN);
    const definition = projectInstalledSourceToSuccessor028(SOURCE).graph!.userSymbols029![0]!;
    openCreateNode(result);
    act(() => { expect(result.current.authoring!.onSubmitNode({ id: 'g', type: 'service', symbol: 'local.probe',
      definition })).toEqual({ ok: true }); });
    await waitFor(() => expect(result.current.editor.dsl).toContain('g service [symbol: "local.probe"]'));
    const placed = result.current.editor.dsl;
    expect(placed).toContain('@coralVersion "0.2.9"');
    expect(placed).toContain('@symbol probe {');
    await undo(result, PLAIN);
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(placed));
  });

  it('places into a document with an explicit conformance level, which then warns', async () => {
    const strict = '@diagram architecture\n@conformanceLevel strict\nseed service\n';
    const result = await opened(strict);
    const definition = projectInstalledSourceToSuccessor028(SOURCE).graph!.userSymbols029![0]!;
    openCreateNode(result);
    act(() => { expect(result.current.authoring!.onSubmitNode({ id: 'g', type: 'service', symbol: 'local.probe',
      definition })).toEqual({ ok: true }); });
    await waitFor(() => expect(result.current.editor.dsl).toContain('g service [symbol: "local.probe"]'));
    expect(parseCoralDSL(result.current.editor.dsl).diagnostics?.map((item) => item.code))
      .toContain('coral.symbol.local.conformance-unsupported');
  });
});

async function select(result: Result, id: string) {
  await waitFor(() => expect(result.current.canvas.nodes.some((node) => node.id === id)).toBe(true));
  const node = result.current.canvas.nodes.find((item) => item.id === id)!;
  act(() => result.current.canvas.onSelectionChange({ nodes: [node] }));
}

describe('inspector and symbol editor commits (R-065 AC-2, AC-5)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('shows the selected user symbol with its digest and its ports by owner', async () => {
    const result = await opened(SOURCE);
    await select(result, 'g');
    await waitFor(() => expect(result.current.inspector?.userSymbol029?.definition.symbolId).toBe('local.probe'));
    expect(result.current.inspector!.userSymbol029!.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.current.inspector!.ports029).toEqual([
      { id: 'login', direction: 'in', maxConnections: 2, owner: 'symbol', ownerName: 'Probe' },
      { id: 'deep', direction: 'out', owner: 'symbol', ownerName: 'Probe' },
    ]);
    await select(result, 'a');
    await waitFor(() => expect(result.current.inspector?.selectedNode?.id).toBe('a'));
    expect(result.current.inspector!.userSymbol029).toBeUndefined();
  });

  it('commits a definition edit as one Undo entry and announces a refusal', async () => {
    const result = await opened(SOURCE);
    await select(result, 'g');
    await waitFor(() => expect(result.current.inspector?.userSymbol029).toBeDefined());
    const definition = result.current.inspector!.userSymbol029!.definition;
    let ok = false;
    act(() => { ok = result.current.inspector!.onSymbolDefinitionEdit029!('local.probe', { ...definition, name: 'Sensor' }); });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.editor.dsl).toBe(SOURCE.replace('name "Probe"', 'name "Sensor"')));
    await settle(result);
    await undo(result, SOURCE);
    await waitFor(() => expect(result.current.inspector?.userSymbol029?.definition.name).toBe('Probe'));
    act(() => { ok = result.current.inspector!.onSymbolDefinitionEdit029!('local.probe',
      { ...definition, ports: definition.ports.filter((port) => port.id !== 'deep') }); });
    expect(ok).toBe(false);
    expect(result.current.guidanceAnnouncement).toMatch(/source-symbol\.port-used.*g:deep -> b/);
    expect(result.current.editor.dsl).toBe(SOURCE);
  });

  it('edits a node-local port label in a 0.2.8 document with the pin, and one Undo restores the header', async () => {
    const plain = '@diagram architecture\na service\nvault database {\n  ingest port [direction: in]\n}\na -> vault:ingest\n';
    const result = await opened(plain);
    await select(result, 'vault');
    await waitFor(() => expect(result.current.inspector?.ports029?.find((port) => port.id === 'ingest')?.owner)
      .toBe('node'));
    expect(result.current.inspector!.ports029!.find((port) => port.id === 'query'))
      .toEqual({ id: 'query', direction: expect.any(String), owner: 'catalog', ownerName: 'Database' });
    let ok = false;
    act(() => { ok = result.current.inspector!.onPortFieldsEdit029!('vault', 'ingest', { label: 'Writes' }); });
    expect(ok).toBe(true);
    await waitFor(() => expect(result.current.editor.dsl).toContain('ingest port [direction: in, label: "Writes"]'));
    expect(result.current.editor.dsl).toContain('@coralVersion "0.2.9"');
    await undo(result, plain);
  });
});

describe('the inspector between a commit and its parse (C5 review P1)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('keeps the symbol and ports while the committed text waits for its parse', async () => {
    const result = await opened(SOURCE);
    await select(result, 'g');
    await waitFor(() => expect(result.current.inspector?.userSymbol029).toBeDefined());
    const definition = result.current.inspector!.userSymbol029!.definition;
    act(() => { result.current.inspector!.onSymbolDefinitionEdit029!('local.probe', { ...definition, name: 'Sensor' }); });
    expect(result.current.editor.dsl).toBe(SOURCE.replace('name "Probe"', 'name "Sensor"'));
    expect(result.current.inspector!.userSymbol029).toBeDefined();
    expect(result.current.inspector!.ports029).toBeDefined();
    // A browser drops focus from a control that becomes disabled.
    expect(result.current.inspector!.sourceEditable029).toBe(true);
    await settle(result);
    expect(result.current.inspector!.userSymbol029!.definition.name).toBe('Sensor');
  });

  it('leaves focus on the committed symbol editor field, not Name', async () => {
    const result = {} as Result;
    function Harness() {
      result.current = useEditorController();
      const inspector = result.current.inspector;
      return inspector ? <InspectorPane {...inspector} activeTab="selection" onTabChange={() => {}} /> : null;
    }
    render(<Harness />);
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onOpenFile({ name: 'probe.coral', text: SOURCE }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(SOURCE));
    await settle(result);
    await select(result, 'g');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit symbol' }));
    const description = screen.getByLabelText('Description');
    act(() => description.focus());
    fireEvent.change(description, { target: { value: 'Reads values' } });
    fireEvent.keyDown(description, { key: 'Enter' });
    await waitFor(() => expect(result.current.editor.dsl).toContain('description "Reads values"'));
    await settle(result);
    expect(document.activeElement).toBe(screen.getByLabelText('Description'));
  });
});

describe('the coral.symbol.local.edition quick fix (Q-C5-2)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('pins edition 0.2.9 as one Undo entry', async () => {
    const unpinned = SOURCE.replace('@coralVersion "0.2.9"\n', '');
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onOpenFile({ name: 'probe.coral', text: unpinned }); });
    await waitFor(() => expect(result.current.editor.parseErrors.map((entry) => entry.code))
      .toContain('coral.symbol.local.edition'));
    act(() => result.current.editor.onPinEdition029!());
    await waitFor(() => expect(result.current.editor.dsl).toBe(SOURCE));
    await settle(result);
    expect(result.current.editor.parseErrors.map((entry) => entry.code)).not.toContain('coral.symbol.local.edition');
    await undo(result, unpinned);
  });
});

describe('inspector edits while their preceding source parse is pending', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  async function mounted() {
    const result = {} as Result;
    function Harness() {
      result.current = useEditorController();
      return result.current.inspector
        ? <InspectorPane {...result.current.inspector} activeTab="selection" onTabChange={() => {}} /> : null;
    }
    render(<Harness />);
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => result.current.header.onOpenFile({ name: 'probe.coral', text: SOURCE }));
    await waitFor(() => expect(result.current.editor.dsl).toBe(SOURCE));
    await settle(result);
    await select(result, 'g');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit symbol' }));
    return result;
  }

  it('commits a blurred second field after the first edit settles, as separate Undo entries', async () => {
    const result = await mounted();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sensor' } });
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Enter' });
    const description = screen.getByLabelText('Description');
    fireEvent.change(description, { target: { value: 'Reads values' } });
    fireEvent.blur(description);
    expect((description as HTMLInputElement).value).toBe('Reads values');
    await waitFor(() => expect(result.current.editor.dsl).toContain('description "Reads values"'));
    expect(result.current.editor.dsl).toContain('name "Sensor"');
    await settle(result);
    act(() => result.current.canvas.onUndo());
    await waitFor(() => expect(result.current.editor.dsl).not.toContain('description "Reads values"'));
    expect(result.current.editor.dsl).toContain('name "Sensor"');
    await settle(result);
    await undo(result, SOURCE);
  });

  it('keeps a newer same-field draft when the preceding commit is acknowledged', async () => {
    const result = await mounted();
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Sensor' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.change(name, { target: { value: 'Sensor v2' } });
    await settle(result);
    expect((name as HTMLInputElement).value).toBe('Sensor v2');
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() => expect(result.current.editor.dsl).toContain('name "Sensor v2"'));
  });

  it.each([false, true])('keeps a normalized Tags acknowledgement after prior Undo: %s', async afterUndo => {
    const result = await mounted();
    if (afterUndo) {
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Sensor' } });
      fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Enter' });
      await settle(result);
      await undo(result, SOURCE);
    }
    const tags = screen.getByLabelText('Tags') as HTMLInputElement;
    fireEvent.change(tags, { target: { value: 'a,b' } });
    fireEvent.keyDown(tags, { key: 'Enter' });
    fireEvent.change(tags, { target: { value: 'a,b,c' } });
    await settle(result);
    expect(tags.value).toBe('a,b,c');
    fireEvent.keyDown(tags, { key: 'Enter' });
    await waitFor(() => expect(result.current.editor.dsl).toContain('tags "a" "b" "c"'));
  });

  it('offers source Undo and Redo during the parse window without enabling gestures', async () => {
    const result = await opened(SOURCE);
    act(() => result.current.editor.onDslChange(`${SOURCE}// typed\n`));
    expect(result.current.canvas.historyDisabled).toBe(false);
    expect(result.current.commandPalette.commands.find(item => item.id === 'undo')?.disabled).toBe(false);
    expect(result.current.canvas.sourceNodeDragEnabled).toBe(false);
    act(() => result.current.canvas.onUndo());
    expect(result.current.editor.dsl).toBe(SOURCE);
    expect(result.current.commandPalette.commands.find(item => item.id === 'redo')?.disabled).toBe(false);
    act(() => result.current.canvas.onRedo());
    await waitFor(() => expect(result.current.editor.dsl).toBe(`${SOURCE}// typed\n`));
    await settle(result);
  });

  it('keeps the connector label input enabled and focused through its own commit', async () => {
    const result = await mounted();
    fireEvent.click(screen.getByRole('button', { name: 'Back to node' }));
    const edge = result.current.canvas.edges[0]!;
    act(() => result.current.canvas.onSelectionChange({ nodes: [], edges: [edge] }));
    const input = await screen.findByLabelText('Connector label');
    act(() => input.focus());
    fireEvent.change(input, { target: { value: 'Read' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect((input as HTMLInputElement).disabled).toBe(false);
    await settle(result);
    expect(document.activeElement).toBe(input);
    expect(result.current.editor.dsl).toContain('"Read"');
  });
});

it('advances the inspector commit token even for identical source replacement', async () => {
  window.localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const result = await opened(SOURCE);
  const before = result.current.inspector!.sourceCommitState029!.revision;
  act(() => result.current.editor.onDslChange(SOURCE));
  expect(result.current.inspector!.sourceCommitState029!.revision).not.toBe(before);
  await settle(result);
});
