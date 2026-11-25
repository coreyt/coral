import { describe, expect, it } from 'vitest';
import { successorSourceDisplayWithSemanticPorts028, userOutlineExitPoint029,
  verifyPortableSuccessorSource028 } from '@coral-viz/render';
import { buildNodeConnectionInfo, convertEdges, layoutNodes } from '../src/hooks/diagramUtils.js';

const SOURCE = ['@diagram architecture', '@coralVersion "0.2.9"', '@symbol probe {', '  name "Probe"',
  '  size 60 x 40', '  outline ellipse', '  anchor core [x: 0.5, y: 0.5, exit: E]',
  '  login port [direction: in, maxConnections: 1]', '  deep port [direction: out, anchor: core]',
  '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}', 'g service [symbol: "local.probe"] as "A long label that never resizes the frame"', 'b service',
  'a service', 'g:deep -> b', 'a -> g:login', ''].join('\n');
const attachment = userOutlineExitPoint029({ symbolId: 'local.probe', outline: 'ellipse', width: 60, height: 40 },
  'E', { x: 0.5, y: 0.5 });

async function editorLayout() {
  const meaning = verifyPortableSuccessorSource028(SOURCE).graph!;
  expect(meaning).toBeDefined();
  const { display, semanticInterpretations } = successorSourceDisplayWithSemanticPorts028(meaning);
  const result = await layoutNodes(display.nodes, display.edges, 'architecture',
    { algorithm: 'layered', direction: 'RIGHT' }, false, undefined, undefined, [], 'load', semanticInterpretations);
  return { display, semanticInterpretations, result };
}

describe('editor projection and layout of user symbols (R-065 AC-2, AC-4)', () => {
  it('sizes the node to the frame, carries the document catalog and routes from the attachment', async () => {
    const { result } = await editorLayout();
    expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
    const g = result.nodes.find((node) => node.id === 'g')!;
    expect([g.width, g.height]).toEqual([60, 40]);
    expect(g.data.documentCatalog029?.userSymbols.has('local.probe')).toBe(true);
    const route = [...result.edgeRouting.values()].find((item) => item.sourceId === 'g')!;
    expect(route.startPoint.x).toBeCloseTo(g.position.x + attachment.x * 60, 6);
    expect(route.startPoint.y).toBeCloseTo(g.position.y + attachment.y * 40, 6);
  });

  it('projects escape offsets onto canvas edges', async () => {
    const { display, semanticInterpretations, result } = await editorLayout();
    const edges = convertEdges(display.edges, result.edgeRouting, undefined,
      { notation: 'architecture', nodes: display.nodes, semanticInterpretations });
    const deep = edges.find((edge) => edge.source === 'g')!;
    expect(deep.data?.escape029).toEqual({ source: { x: (0.5 - attachment.x) * 60, y: 0 } });
    expect(edges.find((edge) => edge.target === 'g')!.data?.escape029).toBeUndefined();
  });

  it('builds connection info with the user-symbol ports and limits and no profile rule symbol', async () => {
    const { result } = await editorLayout();
    const info = buildNodeConnectionInfo(result.nodes, 'architecture').get('g')!;
    expect(info).toMatchObject({ symbolId: 'local.probe' });
    expect(info).not.toHaveProperty('ruleSymbolId');
    expect(info.resolutionIssue).toBeUndefined();
    expect(info.semanticPorts).toEqual([
      { id: 'login', direction: 'in', maxConnections: 1 }, { id: 'deep', direction: 'out' }]);
  });
});

describe('editor read diagnostics for user symbols and limits (R-065 AC-5)', () => {
  const artwork = SOURCE.slice(SOURCE.indexOf('  artwork svg'), SOURCE.indexOf('}\n') );
  const spare = ['@symbol spare {', '  name "Spare"', '  size 20 x 20', artwork.trimEnd(), '}'].join('\n');

  it('reports an exceeded limit and an unused definition in an edition 0.2.9 document', async () => {
    const { parseCoralDSL } = await import('../src/parsers.js');
    const source = SOURCE.replace('g service [', `${spare}\ng service [`) + 'b -> g:login\n';
    const parsed = parseCoralDSL(source);
    expect(parsed.coralVersion).toBe('0.2.9');
    expect(parsed.diagnostics?.filter((item) => item.code === 'coral.port.connections.exceeded'))
      .toEqual([expect.objectContaining({ severity: 'error', message: expect.stringMatching(/login.*g.*2.*1/) })]);
    expect(parsed.diagnostics?.filter((item) => item.code === 'coral.symbol.local.unused'))
      .toEqual([expect.objectContaining({ severity: 'info', message: expect.stringContaining('local.spare') })]);
  });

  it('warns once at an explicit level in a document that selects a user symbol', async () => {
    const { parseCoralDSL } = await import('../src/parsers.js');
    const parsed = parseCoralDSL(SOURCE.replace('@coralVersion "0.2.9"', '@coralVersion "0.2.9"\n@conformanceLevel typical'));
    expect(parsed.diagnostics?.filter((item) => item.code === 'coral.symbol.local.conformance-unsupported'))
      .toEqual([expect.objectContaining({ severity: 'warning', position: expect.objectContaining({ line: 3, column: 0 }) })]);
    expect(parsed.diagnostics?.filter((item) => item.severity === 'error')).toEqual([]);
  });

  it('adds no limit diagnostic to an edition 0.2.8 document', async () => {
    const { parseCoralDSL } = await import('../src/parsers.js');
    const parsed = parseCoralDSL('@diagram flowchart\na process\nb process\nd decision\na -> d:in\nb -> d:in\n');
    expect(parsed.coralVersion).toBe('0.2.8');
    expect(parsed.diagnostics?.map((item) => item.code)).not.toContain('coral.port.connections.exceeded');
  });
});
