import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028, type SuccessorUserSymbol029 } from '@coral-viz/render';
import { appendSourceOwnedEdge028, appendSourceOwnedNode028, deleteSourceOwnedEdges028,
  editSourceOwnedEdgeLabel028, editSourceOwnedNodeLabel028, editSourceOwnedNodePositions028,
  pinSourceOwnedEdition029 } from '../src/sourceOwnedEdits028';

// Body-looking lines sit in a comment so the artwork is admissible (coral.svg-artwork 1).
const RAW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"> <!-- // \' " { } @coralVersion "0.2.8" -->\n' +
  '<!--\na service @ (0, 0)\na -> b as "x"\n}\n--><path d="M0 0"/></svg>\n';
const REGION = '@symbol key {\n  name "Key"\n  size 2 x 2\n  artwork svg """\n' + RAW + '"""\n}\n';
const SOURCE = '@diagram architecture\n@coralVersion "0.2.9"\n\n' + REGION + '\n' +
  'a service @ (10, 20)\nb database\ne = a -> b as "E"\n';
const regionEnd = SOURCE.indexOf(REGION) + REGION.length;
const keepsRegion = (edited: string) => {
  expect(edited.slice(0, regionEnd)).toBe(SOURCE.slice(0, regionEnd));
  expect(projectInstalledSourceToSuccessor028(edited).graph?.userSymbols029?.[0]?.artwork.text).toBe(RAW);
};
const DOT: SuccessorUserSymbol029 = { id: 'dot', symbolId: 'local.dot', name: 'Dot', tags: [],
  size: { width: 8, height: 8 }, label: 'below', outline: 'ellipse', tint: 'none', anchors: [],
  ports: [{ id: 'in', direction: 'in', anchor: 'W', maxConnections: 1 }],
  artwork: { format: 'svg', text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4"/></svg>\n' } };
const DOT_TEXT = '@symbol dot {\n  name "Dot"\n  size 8 x 8\n  outline ellipse\n' +
  '  in port [direction: in, anchor: W, maxConnections: 1]\n  artwork svg """\n' + DOT.artwork.text + '"""\n}\n';

describe('Source-owned edits treat definition regions as single spans', () => {
  it('edits body statements without touching raw artwork that looks like body syntax', () => {
    keepsRegion(editSourceOwnedNodePositions028(SOURCE, ['a'], { x: 5, y: 0 }));
    keepsRegion(editSourceOwnedNodeLabel028(SOURCE, 'b', 'Store'));
    keepsRegion(editSourceOwnedEdgeLabel028(SOURCE, 'e', 'Reads'));
    keepsRegion(deleteSourceOwnedEdges028(SOURCE, ['e']));
    keepsRegion(appendSourceOwnedNode028(SOURCE, { id: 'c', type: 'service' }));
    keepsRegion(appendSourceOwnedEdge028(SOURCE, { sourceId: 'b', targetId: 'a' }));
  });
});

describe('Header edition pin edit', () => {
  it('inserts @coralVersion "0.2.9" after the diagram line of an unpinned document', () => {
    expect(pinSourceOwnedEdition029('@diagram architecture\r\na service\r\n'))
      .toBe('@diagram architecture\r\n@coralVersion "0.2.9"\r\na service\r\n');
    expect(pinSourceOwnedEdition029('@diagram architecture'))
      .toBe('@diagram architecture\n@coralVersion "0.2.9"');
  });

  it('rewrites only the value of an explicit 0.2.8 pin and leaves a 0.2.9 pin alone', () => {
    expect(pinSourceOwnedEdition029('// c\n@diagram flowchart\n  @coralVersion \'0.2.8\'\na process\n'))
      .toBe('// c\n@diagram flowchart\n  @coralVersion "0.2.9"\na process\n');
    expect(pinSourceOwnedEdition029(SOURCE)).toBe(SOURCE);
  });

  it('is the quick fix for coral.symbol.local.edition and port fields in a 0.2.8 document', () => {
    const unpinned = SOURCE.replace('@coralVersion "0.2.9"\n', '');
    expect(projectInstalledSourceToSuccessor028(unpinned).diagnostics.map(({ code }) => code))
      .toEqual(['coral.symbol.local.edition']);
    expect(pinSourceOwnedEdition029(unpinned)).toBe(SOURCE);
    const port = '@diagram architecture\n@coralVersion "0.2.8"\na service {\n  p port [direction: in, label: "P"]\n}\n';
    const pinned = pinSourceOwnedEdition029(port);
    expect(pinned).toBe(port.replace('0.2.8', '0.2.9'));
    expect(projectInstalledSourceToSuccessor028(pinned).diagnostics).toEqual([]);
  });

  it('keeps the header refusal as the cause of the editor refusal', () => {
    let refusal: unknown;
    try { pinSourceOwnedEdition029('@diagram nonsense\n'); } catch (error) { refusal = error; }
    expect(refusal).toBeInstanceOf(Error);
    const cause = (refusal as { cause?: unknown }).cause;
    expect(cause).toBeInstanceOf(Error);
    expect((cause as Error).message).toBe('Cannot pin an invalid Coral header.');
  });

  it('refuses a header that the pin cannot repair', () => {
    expect(() => pinSourceOwnedEdition029('@diagram nonsense\n')).toThrow('coral.editor.source-pin.invalid');
    expect(() => pinSourceOwnedEdition029('@diagram architecture\n@coralVersion "9.9.9"\n'))
      .toThrow('coral.editor.source-pin.invalid');
  });
});

describe('Symbol-aware node placement', () => {
  it('pins 0.2.9, adds the definition after the header and the node in one edit', () => {
    const source = '@diagram architecture\n// body\na service\n';
    const placed = appendSourceOwnedNode028(source, { id: 'd', type: 'service', symbol: 'local.dot',
      definition: DOT, label: 'Dot' });
    expect(placed).toBe('@diagram architecture\n@coralVersion "0.2.9"\n\n' + DOT_TEXT + '\n' +
      '// body\na service\nd service [symbol: "local.dot"] as "Dot"\n');
    const graph = projectInstalledSourceToSuccessor028(placed).graph!;
    expect(graph.userSymbols029).toEqual([DOT]);
    expect(graph.nodes[1]).toMatchObject({ id: 'd', symbol: 'local.dot', label: 'Dot' });
  });

  it('adds a new definition after existing ones and reuses an identical definition', () => {
    const placed = appendSourceOwnedNode028(SOURCE, { id: 'd', type: 'service', symbol: 'local.dot',
      definition: DOT });
    expect(placed).toBe(SOURCE.replace(REGION, REGION + '\n' + DOT_TEXT) + 'd service [symbol: "local.dot"]\n');
    const again = appendSourceOwnedNode028(placed, { id: 'f', type: 'service', symbol: 'local.dot',
      definition: structuredClone(DOT) });
    expect(again).toBe(placed + 'f service [symbol: "local.dot"]\n');
    expect(appendSourceOwnedNode028(placed, { id: 'g', type: 'service', symbol: 'local.dot' }))
      .toBe(placed + 'g service [symbol: "local.dot"]\n');
  });

  it('places a bundled symbol without a definition or pin', () => {
    expect(appendSourceOwnedNode028('@diagram architecture\na service\n',
      { id: 'b', type: 'service', symbol: 'arch-service' }))
      .toBe('@diagram architecture\na service\nb service [symbol: "arch-service"]\n');
  });

  it('refuses a missing, mismatched or conflicting local definition', () => {
    expect(() => appendSourceOwnedNode028(SOURCE, { id: 'd', type: 'service', symbol: 'local.dot' }))
      .toThrow('coral.editor.source-node.symbol');
    expect(() => appendSourceOwnedNode028(SOURCE, { id: 'd', type: 'service', symbol: 'local.key',
      definition: DOT })).toThrow('coral.editor.source-node.symbol');
    expect(() => appendSourceOwnedNode028(SOURCE, { id: 'd', type: 'service', symbol: 'local.key',
      definition: { ...DOT, id: 'key', symbolId: 'local.key' } })).toThrow('coral.editor.source-node.symbol');
  });
});
