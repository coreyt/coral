import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  prepareSpatialScene028, projectInstalledSourceToSuccessor028, renderSvg,
  sceneArtworkDefinitions029, stableSvgId, successorSourceDisplayWithSemanticPorts028,
} from '@coral-viz/render';
import { layoutGraphForSvg } from '../../render/src/svg/layout.js';
import { serializeScenePart028 } from '../../render/src/svg/projectScene028.js';
import { SpatialSceneArtworkDefs029, SpatialScenePart028, SpatialSceneSvg028 } from '../src/components/SpatialSceneSvg028.js';
import { EditProvider } from '../src/components/EditContext.js';
import { SymbolNode } from '../src/components/SymbolNode.js';

// C4 canvas artwork: the canvas draws the serializer's <symbol> text once and
// one <use> per instance, from the same scene part (c4-design.md "Editor canvas").

const SVG_NS = 'http://www.w3.org/2000/svg';
const SOURCE = (kind: string, tint = false) => ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {',
  '  name "Probe"', '  size 60 x 40', '  label center', `  outline ${kind}`, ...(tint ? ['  tint stroke'] : []),
  '  anchor core [x: 0.5, y: 0.5, exit: E]', '  deep port [direction: out, anchor: core]', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><linearGradient id="g"><stop offset="0" stop-color="#2f6f4f"/></linearGradient>' +
  '<path d="M0 0 L24 0 L24 16 Z" fill="url(#g)" stroke="#123456"/></svg>',
  '"""', '}', 'g service [symbol: "local.probe"]', 'h service [symbol: "local.probe"]', 'b service', 'g:deep -> b', 'h -> b', ''].join('\n');

async function prepared(kind: string, tint = false) {
  const graph = projectInstalledSourceToSuccessor028(SOURCE(kind, tint)).graph!;
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
  const laidOut = await layoutGraphForSvg(display, { direction: 'RIGHT', semanticInterpretations });
  const options = { edgeRoutes: laidOut.edgeRoutes, layoutDirection: 'RIGHT' as const,
    semanticGraph: display, successorSource: graph };
  return { scene: prepareSpatialScene028(laidOut, options), svg: renderSvg(laidOut, options) };
}

type Tree = [string, Record<string, string>, Tree[]];
const tree = (element: Element): Tree => [element.localName,
  Object.fromEntries([...element.attributes].map((attribute) => [attribute.name, attribute.value]).sort()),
  [...element.children].map(tree)];
const parsedChildren = (markup: string): Tree[] => {
  const document = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, 'image/svg+xml');
  return [...document.documentElement.children].map(tree);
};

describe.each(['rectangle', 'rounded', 'ellipse', 'diamond'])('canvas artwork for a %s user symbol', (kind) => {
  it('writes the serializer definitions once, element for element', async () => {
    const { scene } = await prepared(kind);
    const namespace = stableSvgId('coral-instance', 'canvas-test');
    const { container } = render(<svg><SpatialSceneArtworkDefs029 scene={scene} namespace={namespace} /></svg>);
    const defs = container.querySelector('defs')!;
    expect([...defs.children].map(tree)).toEqual(parsedChildren(sceneArtworkDefinitions029(scene.artwork029!, namespace)));
    expect(defs.querySelectorAll('symbol')).toHaveLength(1);
  });

  it('draws each artwork part as the serializer does', async () => {
    const { scene } = await prepared(kind, true);
    const namespace = stableSvgId('coral-instance', 'canvas-test');
    const parts = scene.parts.filter((part) => part.role === 'artwork');
    expect(parts.map((part) => part.owner.id)).toEqual(['g', 'h']);
    for (const part of parts) {
      const { container } = render(<svg><SpatialScenePart028 part={part} namespace={namespace} /></svg>);
      expect([...container.querySelector('svg')!.children].map(tree)).toEqual(parsedChildren(serializeScenePart028(part, namespace)));
      expect(container.querySelector('use')!.getAttribute('color')).toBe('#363430');
    }
  });
});

describe('the whole-scene canvas SVG', () => {
  it('defines each used symbol once and resolves every use to it', async () => {
    const { scene } = await prepared('ellipse');
    const { container } = render(<SpatialSceneSvg028 scene={scene} namespace="coral-scene-test" />);
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    const uses = [...container.querySelectorAll('use')];
    expect(uses).toHaveLength(2);
    for (const use of uses) expect(ids).toContain(use.getAttribute('href')!.slice(1));
    expect(container.querySelectorAll('symbol')).toHaveLength(1);
  });
});

describe('the SymbolNode fallback without scene parts', () => {
  const catalogNode = async () => {
    const graph = projectInstalledSourceToSuccessor028(SOURCE('ellipse')).graph!;
    const { semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(graph);
    return semanticInterpretations.get('g')!.userSymbol029!;
  };

  it('draws the artwork with ids unique to each node and no interim outline', async () => {
    const user = await catalogNode();
    const { documentCatalog029 } = await import('@coral-viz/render');
    const graph = projectInstalledSourceToSuccessor028(SOURCE('ellipse')).graph!;
    const catalog = documentCatalog029('architecture', graph.userSymbols029!);
    const node = (id: string) => <SymbolNode id={id} selected={false} data={{ label: id, nodeType: 'service',
      symbolId: user.definition.symbolId, notationId: 'architecture', documentCatalog029: catalog,
      width: 60, height: 40 } as never} />;
    const { container } = render(<ReactFlowProvider><EditProvider onLabelEdit={vi.fn()}>
      {node('g')}{node('h')}
    </EditProvider></ReactFlowProvider>);
    const symbols = [...container.querySelectorAll('symbol')];
    expect(symbols).toHaveLength(2);
    const ids = [...container.querySelectorAll('[id]')].map((element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const use of container.querySelectorAll('use')) expect(ids).toContain(use.getAttribute('href')!.slice(1));
    // The C3 interim body painted the outline path unfilled; it is gone.
    expect(container.querySelector('[data-coral-part-id="g:outline:1"]')).toBeNull();
    expect(container.querySelector('svg path[fill="none"]')).toBeNull();
    expect(container.querySelector('[data-coral-artwork="local.probe"] use')!.getAttribute('aria-hidden')).toBe('true');
  });
});
