import React, { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveFont } from '@coral-viz/render';
import { EditProvider } from '../src/components/EditContext';
import { SymbolNode, type SymbolNodeData } from '../src/components/SymbolNode';
import { CORAL_NODE_VIEW_METADATA } from '../src/types';

const updateNodeInternals = vi.hoisted(() => vi.fn());
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@xyflow/react');
  return { ...actual, useUpdateNodeInternals: () => updateNodeInternals };
});
function data(width: number) {
  return {
    label: 'Refresh', nodeType: 'service', symbolId: 'flowchart-process', width, height: 60,
    [CORAL_NODE_VIEW_METADATA]: {
      dimensionSource: 'editor-font' as const,
      font: resolveFont({ family: 'serif', size: 16, weight: 400, lineHeight: 1.4 }),
      lines: ['Refresh'], lineHeightPx: 23,
    },
  };
}
const flush = () => act(async () => { await Promise.resolve(); });
function Editor({ ids = ['n1'], width = 120, sceneParts }: {
  ids?: string[]; width?: number; sceneParts?: SymbolNodeData['sceneParts028'];
}) {
  return <ReactFlowProvider><EditProvider>
    {ids.map(id => <SymbolNode key={id} id={id} data={{ ...data(width), sceneParts028: sceneParts }} />)}
  </EditProvider></ReactFlowProvider>;
}
describe('SymbolNode font-aware React Flow measurement', () => {
  beforeEach(() => updateNodeInternals.mockClear());
  it('batches mounted nodes and refreshes a later dimension projection once', async () => {
    const ids = Array.from({ length: 25 }, (_, index) => `n${index}`);
    const view = render(<Editor ids={ids} />);
    await flush();
    expect(updateNodeInternals.mock.calls).toEqual([[ids]]);
    view.rerender(<Editor ids={ids} />);
    await flush();
    expect(updateNodeInternals).toHaveBeenCalledTimes(1);
    view.rerender(<Editor ids={ids} width={180} />);
    await flush();
    expect(updateNodeInternals.mock.calls).toEqual([[ids], [ids]]);
  });
  it('refreshes handles when a same-sized prepared scene is replaced', async () => {
    const first: NonNullable<SymbolNodeData['sceneParts028']> = [];
    const next: NonNullable<SymbolNodeData['sceneParts028']> = [];
    const view = render(<Editor sceneParts={first} />);
    await flush();
    view.rerender(<Editor sceneParts={first} />);
    await flush();
    expect(updateNodeInternals).toHaveBeenCalledTimes(1);
    view.rerender(<Editor sceneParts={next} />);
    await flush();
    expect(updateNodeInternals.mock.calls).toEqual([[['n1']], [['n1']]]);
  });
  it('isolates editors with the same node IDs', async () => {
    render(<><Editor /><Editor /></>);
    await flush();
    expect(updateNodeInternals.mock.calls).toEqual([[['n1']], [['n1']]]);
  });
  it('cancels only the removed registration during StrictMode cleanup and remount', async () => {
    const view = render(<StrictMode><Editor ids={['n1', 'n2']} /></StrictMode>);
    view.rerender(<StrictMode><Editor ids={[]} /></StrictMode>);
    view.rerender(<StrictMode><Editor ids={['n1']} /></StrictMode>);
    await flush();
    expect(updateNodeInternals.mock.calls).toEqual([[['n1']]]);
    view.rerender(<StrictMode><Editor ids={['n1']} width={180} /></StrictMode>);
    await flush();
    expect(updateNodeInternals.mock.calls).toEqual([[['n1']], [['n1']]]);
  });
  it('does not measure a provider unmounted before the queued flush', async () => {
    const view = render(<Editor />);
    view.unmount();
    await flush();
    expect(updateNodeInternals).not.toHaveBeenCalled();
  });
});
