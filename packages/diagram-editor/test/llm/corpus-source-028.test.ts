import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseMermaid, type GraphIR } from '@coral-viz/language';
import { parseInstalledDocument028, projectInstalledSourceToSuccessor028,
  successorSourceDisplay028, successorSourceDisplayWithSemanticPorts028, renderSvg } from '@coral-viz/render';
import { layoutGraphForSvg } from '../../../render/src/svg/layout';
import { writeCorpusSource028 } from './corpus-source-028';

const corpus = join(__dirname, 'fixtures/corpus');
const slugs = readdirSync(join(corpus, 'coral')).map(file => file.replace(/\.coral$/, '')).sort();
const normalizeClassifier = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalizeClassifier);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key,
    key === 'id' && typeof nested === 'string' ? nested.replace(/^(attribute|operation)-(\d+)$/, '$1_$2')
      : normalizeClassifier(nested)]));
};
const nodes = (graph: GraphIR) => graph.nodes.map(node => ({
  id: node.id, type: node.type, label: node.label ?? node.id,
  classifier: normalizeClassifier(node.classifier),
}));
const edges = (graph: GraphIR) => graph.edges.map(edge => ({
  id: edge.id, source: edge.source, target: edge.target, type: edge.type, label: edge.label,
  firstEnd: edge.sourceEnd?.marker ?? { kind: 'none', fill: 'unspecified' },
  secondEnd: edge.targetEnd?.marker ?? (graph.metadata?.notation === 'uml-class'
    ? { kind: 'none', fill: 'unspecified' }
    : graph.metadata?.notation === 'uml-sequence' && edge.type === 'sync'
      ? { kind: 'triangle', fill: 'filled' } : { kind: 'arrow', fill: 'open' }),
  lineStyle: edge.style?.lineStyle ?? (graph.metadata?.notation === 'uml-sequence' && edge.type === 'return' ? 'dashed' : 'solid'),
}));

describe('production 0.2.8 diagram corpus', () => {
  it.each(slugs)('preserves %s nodes, connectors, labels, class members and authored direction', (slug) => {
    const imported = parseMermaid(readFileSync(join(corpus, 'raw', `${slug}.mmd`), 'utf8')).graph!;
    const text = writeCorpusSource028(imported);
    const document = parseInstalledDocument028(text);
    expect(document.header.diagnostics, slug).toEqual([]);
    expect(document.syntax.diagnostics, slug).toEqual([]);
    const projection = projectInstalledSourceToSuccessor028(text);
    expect(projection.diagnostics, slug).toEqual([]);
    const graph = successorSourceDisplay028(projection.graph!);
    expect(nodes(graph), slug).toEqual(nodes(imported));
    expect(edges(graph), slug).toEqual(edges(imported));
    if (imported.layoutOptions?.direction)
      expect(projection.graph!.layoutOptions?.direction, slug).toBe(imported.layoutOptions.direction);
    if (imported.interaction) {
      expect(graph.interaction, slug).toEqual(imported.interaction);
    }
  });

  it('renders every retained diagram through production layout and SVG in both styles', async () => {
    const failures: string[] = [];
    for (const slug of slugs) {
      const text = readFileSync(join(corpus, 'coral', `${slug}.coral`), 'utf8');
      const source = projectInstalledSourceToSuccessor028(text).graph!;
      for (const style of ['lowfi', 'hifi'] as const) {
        try {
          const paired = source.interaction ? undefined : successorSourceDisplayWithSemanticPorts028(source);
          const graph = paired?.display ?? successorSourceDisplay028(source);
          const direction = source.layoutOptions?.direction ?? 'RIGHT';
          const laidOut = await layoutGraphForSvg(graph, {
            svgOptions: { style, successorSource: source }, direction,
            ...(paired ? { semanticInterpretations: paired.semanticInterpretations } : {}),
          });

          const svg = renderSvg(laidOut, {
            style, successorSource: source, semanticGraph: graph,
            edgeRoutes: laidOut.edgeRoutes, layoutDirection: direction,
          });
          expect(svg, `${slug}/${style}`).toContain('<svg');
          expect(svg, `${slug}/${style}`).not.toMatch(/(?:NaN|Infinity)/);
        } catch (error) {
          const diagnostic = (error as { diagnostics?: unknown }).diagnostics;
          failures.push(`${slug}/${style}: ${error instanceof Error ? error.message : String(error)}${diagnostic ? ` (${JSON.stringify(diagnostic)})` : ''}`);
        }
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);

  it('refuses unsupported edge appearance instead of silently dropping it in the generic-node fallback', () => {
    const graph = parseMermaid('flowchart TD\nA{Decision} --> B[Work]').graph!;
    graph.edges[0]!.style = { lineStyle: 'dashed' };
    expect(() => writeCorpusSource028(graph)).toThrow(/lossless corpus conversion subset/);
  });

  it.each(['stateDiagram-v2\n[*] --> Idle', 'erDiagram\nUSER {\n int id PK\n}'])(
    'refuses unsupported notation instead of retaining graph-only source: %s', raw => {
      expect(() => writeCorpusSource028(parseMermaid(raw).graph!)).toThrow(/lossless installed/);
    },
  );
});
