import { act, render, renderHook, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { successorSourceDisplayWithSemanticPorts028, userOutlineExitPoint029,
  verifyPortableSuccessorSource028 } from '@coral-viz/render';
import { EditProvider, SymbolNode } from '@coral-viz/viz';
import { layoutNodes } from '../src/hooks/diagramUtils.js';
import { useEditorController } from '../src/useEditorController';

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addListener: () => {}, removeListener: () => {}, addEventListener: () => {},
    removeEventListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const DEFINITION = ['@symbol probe {', '  name "Probe"', '  size 60 x 40', '  outline ellipse',
  '  anchor core [x: 0.5, y: 0.5, exit: E]', '  login port [direction: in, maxConnections: 1]',
  '  deep port [direction: out, anchor: core]', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}'];
const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', ...DEFINITION,
  'g service [symbol: "local.probe"]', 'a service', 'b service', 'g:deep -> b', 'a -> g:login', ''].join('\n');
describe('a user-symbol node on the editor canvas (R-065 AC-2, AC-4)', () => {
  it('draws the body at the frame size with a handle at each definition port attachment', async () => {
    // An off-centre interior anchor: its exit point is not a side midpoint.
    const meaning = verifyPortableSuccessorSource028(SOURCE.replace('y: 0.5, exit: E', 'y: 0.3, exit: E')).graph!;
    const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(meaning);
    const laid = await layoutNodes(display.nodes, display.edges, 'architecture',
      { algorithm: 'layered', direction: 'RIGHT' }, false, undefined, undefined, [], 'load', semanticInterpretations);
    const g = laid.nodes.find((node) => node.id === 'g')!;
    const { container } = render(<ReactFlowProvider><EditProvider onLabelEdit={vi.fn()}>
      <SymbolNode id="g" data={{ ...g.data, width: g.width, height: g.height } as any} selected={false} />
    </EditProvider></ReactFlowProvider>);
    for (const marker of ['data-coral-unresolved-symbol', 'data-coral-port-conflict',
      'data-coral-port-attachment-unavailable']) expect(container.querySelector(`[${marker}]`)).toBeNull();
    const body = container.querySelector<HTMLElement>('[data-coral-node-label]')!.parentElement!.parentElement!;
    expect([body.style.width, body.style.height]).toEqual(['60px', '40px']);
    expect(container.querySelector('svg path')).not.toBeNull();
    const handles = [...container.querySelectorAll<HTMLElement>('[data-handleid]')];
    expect(handles.map((handle) => handle.getAttribute('data-handleid'))).toEqual(['login', 'deep']);
    const exit = userOutlineExitPoint029({ symbolId: 'local.probe', outline: 'ellipse', width: 60, height: 40 },
      'E', { x: 0.5, y: 0.3 });
    const deep = handles[1]!;
    expect(parseFloat(deep.style.left)).toBeCloseTo(exit.x * 100, 6);
    expect(parseFloat(deep.style.top)).toBeCloseTo(exit.y * 100, 6);
  });
});

describe('editor persistence and export of a user-symbol document', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  async function opened(name: string, text: string) {
    const { result } = renderHook(() => useEditorController());
    await waitFor(() => expect(result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => { result.current.header.onOpenFile({ name, text }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(text));
    await waitFor(() => expect(result.current.canvas.nodes.some((node) => node.id === 'g')).toBe(true));
    return result;
  }

  it('keeps the definitions through a .coral.json save and reopen', async () => {
    const result = await opened('probe.coral', SOURCE);
    const saved = result.current.header.onSave();
    expect(saved.content).toEqual({ format: 'dsl', dslType: 'coral', text: SOURCE });
    act(() => { result.current.header.onOpenFile({ name: 'probe.coral.json', text: JSON.stringify(saved) }); });
    await waitFor(() => expect(result.current.editor.dsl).toBe(SOURCE));
    expect(result.current.editor.parseErrors.filter((item) => item.severity === 'error')).toEqual([]);
    await waitFor(() => expect(result.current.canvas.nodes.find((node) => node.id === 'g')?.data.documentCatalog029
      ?.userSymbols.has('local.probe')).toBe(true));
  });

  it('downloads a verified GraphIR 4 candidate after profile freeze', async () => {
    const result = await opened('probe.coral', SOURCE);
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:probe');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => result.current.commandPalette.commands.find((item) => item.id === 'export')!.action());
      expect(result.current.rasterExportError).toBeNull();
      expect(createObjectUrl).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
    } finally {
      createObjectUrl.mockRestore();
      click.mockRestore();
    }
  });
});
