import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { computeNodeSize, measureSvgNode, resolveFont, visualStyle028 } from '@coral-viz/render';
import { projectDiagramNodes } from '../src/hooks/diagramUtils';
import { planFileOpen, useEditorController } from '../src/useEditorController';

describe('0.2.8 editor style', () => {
  it('fits a long flowchart label inside the painted rectangle in editor and SVG', () => {
    const node = { id: 'review', type: 'task', label: 'Assess eligibility' };
    const projected = projectDiagramNodes([node], 'flowchart')[0]!;
    const svgSize = measureSvgNode(node, { style: 'lowfi', notation: 'flowchart' });
    expect(projected.width).toBe(svgSize.width);
    expect(projected.height).toBe(svgSize.height);
    expect(projected.height).toBeGreaterThanOrEqual(Math.ceil(projected.width * .6));
  });

  it('sizes unpinned text for either production font before layout', () => {
    const text = 'eeeeeeeeeeeeeeeeeeee';
    const node = { id: 'long', type: 'process', label: text };
    const projected = projectDiagramNodes([node], 'flowchart')[0]!;
    for (const style of ['lowfi', 'hifi'] as const) {
      const visual = visualStyle028(style);
      const font = resolveFont({ family: visual.fontFamily, size: visual.labelSize,
        weight: style === 'hifi' ? 600 : 500, lineHeight: 1.4 });
      const needed = computeNodeSize({ text, shapeId: 'rectangle', sizingMode: 'adaptive',
        fontFamily: font.cssFamily, fontSize: font.size, fontWeight: font.weight,
        lineHeight: font.lineHeight });
      expect(projected.width).toBeGreaterThanOrEqual(needed.width);
      expect(projected.height).toBeGreaterThanOrEqual(needed.height);
      expect(measureSvgNode(node, { style, notation: 'flowchart' }).width).toBe(projected.width);
      expect(measureSvgNode(node, { style, notation: 'flowchart', fontSettings: {
        default: { family: visual.fontFamily, size: visual.labelSize,
          weight: style === 'hifi' ? 600 : 500, lineHeight: 1.4 },
      } }).width).toBe(projected.width);
    }
  });

  it('saves and reopens the chosen style', async () => {
    window.localStorage.clear();
    window.matchMedia = ((query: string) => ({ matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {}, addEventListener: () => {},
      removeEventListener: () => {}, dispatchEvent: () => false })) as typeof window.matchMedia;
    const editor = renderHook(() => useEditorController());
    await waitFor(() => expect(editor.result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => editor.result.current.canvas.onRenderStyle028Change('hifi'));
    expect(editor.result.current.canvas.renderStyle028).toBe('hifi');
    const saved = editor.result.current.header.onSave();
    expect(saved.settings.renderStyle028).toBe('hifi');
    const reopened = planFileOpen({ name: 'style.coral.json', text: JSON.stringify(saved) });
    expect(reopened.kind).toBe('open');
    if (reopened.kind === 'open') expect(reopened.prepared.result.settings.renderStyle028).toBe('hifi');
    editor.unmount();
    const restoredEditor = renderHook(() => useEditorController());
    await waitFor(() => expect(restoredEditor.result.current.canvas.nodes.length).toBeGreaterThan(0));
    act(() => {
      expect(restoredEditor.result.current.header.onOpenFile({ name: 'style.coral.json',
        text: JSON.stringify(saved) })).toBe(true);
    });
    await waitFor(() => expect(restoredEditor.result.current.canvas.renderStyle028).toBe('hifi'));
    restoredEditor.unmount();
  });

  it('gives a presentation-only style change a new canvas scene revision', async () => {
    window.localStorage.clear();
    const editor = renderHook(() => useEditorController());
    await waitFor(() => expect(editor.result.current.canvas.scene028?.revision).toBeTruthy());
    const before = editor.result.current.canvas.scene028!;
    act(() => editor.result.current.canvas.onRenderStyle028Change('hifi'));
    const after = editor.result.current.canvas.scene028!;
    expect(after.style).toBe('hifi');
    expect(after.revision).not.toBe(before.revision);
    editor.unmount();
  });

  it('exports the accepted source-owned BPMN direction through the shared scene', async () => {
    window.localStorage.clear();
    const editor = renderHook(() => useEditorController());
    await waitFor(() => expect(editor.result.current.canvas.nodes.length).toBeGreaterThan(0));
    const source = '@diagram bpmn\nreceived startEvent\nwork task\nreceived -> work\n';
    act(() => {
      expect(editor.result.current.header.onOpenFile({ name: 'flow.coral', text: source })).toBe(true);
    });
    await waitFor(() => expect(editor.result.current.editor.dsl).toBe(source));
    await waitFor(() => expect(editor.result.current.canvas.edges).toHaveLength(1));
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:source-owned-svg');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      act(() => editor.result.current.commandPalette.commands.find((item) => item.id === 'export-svg')!.action());
      expect(editor.result.current.rasterExportError).toBeNull();
      const svg = await (create.mock.calls.at(-1)![0] as Blob).text();
      expect(svg).toContain('data-coral-edge="edge-1"');
      expect(svg).toMatch(/marker-end="url\(#[^"]*coral-marker-74-72-69-61-6e-67-6c-65-7c-66-69-6c-6c-65-64/);
    } finally {
      create.mockRestore();
      revoke.mockRestore();
      click.mockRestore();
      editor.unmount();
    }
  });
});
