import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import type { ComponentProps, ReactNode } from 'react';
import { documentCatalog029, projectInstalledSourceToSuccessor028, successorSourceDisplayWithSemanticPorts028 } from '@coral-viz/render';
import { CoralEditor } from '../src/editor/CoralEditor.js';
import { SymbolNode } from '../src/components/SymbolNode.js';

vi.mock('@xyflow/react', async () => ({
  ...await vi.importActual<Record<string, unknown>>('@xyflow/react'),
  ReactFlow: ({ children, nodes }: { children: ReactNode; nodes: ComponentProps<typeof SymbolNode>[] }) =>
    <div>{nodes.map((node) => <SymbolNode key={node.id} {...node} />)}{children}</div>,
  Handle: () => null, Background: () => null, Controls: () => null, MiniMap: () => null,
  useReactFlow: () => ({ getNodes: () => [], getEdges: () => [] }),
}));

const source = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {',
  'name "Probe"', 'size 60 x 40', 'outline ellipse', 'artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z"/></svg>',
  '"""', '}', 'g service [symbol: "local.probe"]', ''].join('\n');

function graph() {
  const parsed = projectInstalledSourceToSuccessor028(source).graph!;
  const { display } = successorSourceDisplayWithSemanticPorts028(parsed);
  return { ...display, documentCatalog029: documentCatalog029('architecture', parsed.userSymbols029!) };
}

describe('editor scene artwork reference resolution (G-38)', () => {
  it('resolves the node artwork to the definition within its own editor', () => {
    const { container } = render(<ReactFlowProvider><CoralEditor graph={graph()} /><CoralEditor graph={graph()} /></ReactFlowProvider>);
    const editors = [...container.querySelectorAll('.coral-editor')];
    expect(editors).toHaveLength(2);
    const ids: string[] = [];
    for (const editor of editors) {
      const definitions = [...editor.querySelectorAll('symbol')];
      const uses = [...editor.querySelectorAll('[data-coral-artwork] use')];
      expect(definitions).toHaveLength(1);
      expect(uses).toHaveLength(1);
      expect(uses[0]!.getAttribute('href')).toBe(`#${definitions[0]!.id}`);
      ids.push(definitions[0]!.id);
    }
    expect(new Set(ids).size).toBe(2);
  });
});
