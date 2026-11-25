import { describe, expect, it } from 'vitest';
import { projectInstalledSourceToSuccessor028 } from '../src/successorSourceProjection028.js';
import { printSuccessorSource028 } from '../src/successorSourceWriter028.js';

const RAW = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 28">\n' +
  '  <!-- // { } @symbol x { --> <path d="M12 0 L24 4 Z" fill="#2f6f4f"/>\n' +
  '<!--\n@coralVersion "0.2.8"\r\n-->\n' +
  '   </svg>\n';
const AUTHORED = '@diagram architecture\n@coralVersion "0.2.9"\n\n' +
  '@symbol shield {\n' +
  '  artwork svg """\n' + RAW + '"""\n' +
  '  audit port [anchor: keyhole, direction: out]\n' +
  '  login port [maxConnections: 1, label: "Sign-in", anchor: W, direction: in]\n' +
  '  anchor keyhole [exit: S, y: 0.55, x: 0.5]\n' +
  '  anchor crest [at: 0.5, side: N]\n' +
  '  license "CC0-1.0"\n' +
  '  source "Drawn in-house"\n' +
  '  tint none\n' +
  '  outline rounded\n' +
  '  label below\n' +
  '  size 48 x 56\n' +
  '  tags "security" "auth"\n' +
  '  description "Security boundary"\n' +
  '  name "Shield"\n' +
  '}\n\n' +
  'vault database as "Secrets" {\n' +
  '  ingest port [label: "Writes", anchor: W, direction: in, maxConnections: 3]\n' +
  '}\n';
const CANONICAL = '@diagram architecture\n@coralVersion "0.2.9"\n@profileVersion "1.0.0"\n' +
  '@catalogVersion "1.0.0"\n@conformanceLevel typical\n\n' +
  '@symbol shield {\n' +
  '  name "Shield"\n' +
  '  description "Security boundary"\n' +
  '  tags "security" "auth"\n' +
  '  size 48 x 56\n' +
  '  outline rounded\n' +
  '  source "Drawn in-house"\n' +
  '  license "CC0-1.0"\n' +
  '  anchor keyhole [x: 0.5, y: 0.55, exit: S]\n' +
  '  anchor crest [side: N, at: 0.5]\n' +
  '  audit port [direction: out, anchor: keyhole]\n' +
  '  login port [direction: in, anchor: W, label: "Sign-in", maxConnections: 1]\n' +
  '  artwork svg """\n' + RAW + '"""\n' +
  '}\n\n' +
  'vault database as "Secrets" {\n' +
  '  ingest port [direction: in, anchor: W, label: "Writes", maxConnections: 3]\n' +
  '}\n';

describe('Edition 0.2.9 successor projection and source writer', () => {
  it('projects port labels and limits and position-free user symbols', () => {
    const projected = projectInstalledSourceToSuccessor028(AUTHORED);
    expect(projected.diagnostics).toEqual([]);
    expect(projected.graph?.nodes[0]?.semanticPorts).toEqual([{ id: 'ingest', direction: 'in',
      anchor: { kind: 'exact', position: 'W' }, label: 'Writes', maxConnections: 3 }]);
    expect(projected.graph?.userSymbols029).toEqual([{
      id: 'shield', symbolId: 'local.shield', name: 'Shield', description: 'Security boundary',
      tags: ['security', 'auth'], size: { width: 48, height: 56 }, label: 'below', outline: 'rounded',
      tint: 'none', source: 'Drawn in-house', license: 'CC0-1.0',
      anchors: [{ kind: 'interior', id: 'keyhole', x: 0.5, y: 0.55, exit: 'S' },
        { kind: 'boundary', id: 'crest', side: 'N', at: 0.5 }],
      ports: [{ id: 'audit', direction: 'out', anchor: 'keyhole' },
        { id: 'login', direction: 'in', anchor: 'W', label: 'Sign-in', maxConnections: 1 }],
      artwork: { format: 'svg', text: RAW },
    }]);
  });

  it('prints definitions and port fields canonically and copies raw artwork byte for byte', () => {
    const graph = projectInstalledSourceToSuccessor028(AUTHORED).graph!;
    const written = printSuccessorSource028(graph);
    expect(written.diagnostics).toEqual([]);
    expect(written.text).toBe(CANONICAL);
    const again = projectInstalledSourceToSuccessor028(CANONICAL);
    expect(again.graph).toEqual(graph);
    expect(printSuccessorSource028(again.graph!).text).toBe(CANONICAL);
  });

  it('emits the effective edition instead of a hard-coded 0.2.8 pin', () => {
    const plain = projectInstalledSourceToSuccessor028('@diagram architecture\na service\n').graph!;
    expect(printSuccessorSource028(plain).text).toContain('@coralVersion "0.2.8"\n');
    expect(printSuccessorSource028(plain, { coralVersion: '0.2.9' }).text).toContain('@coralVersion "0.2.9"\n');
    const labelled = projectInstalledSourceToSuccessor028('@diagram architecture\n@coralVersion "0.2.9"\n' +
      'a service {\n  p port [direction: in, label: "P"]\n}\n').graph!;
    expect(printSuccessorSource028(labelled).text).toContain('@coralVersion "0.2.9"\n');
    expect(printSuccessorSource028(labelled, { coralVersion: '0.2.8' }).diagnostics.map(({ code }) => code))
      .toEqual(['coral.writer028.successor.unsupported']);
  });

  it('prints a minimal artwork block and omits every default', () => {
    const artwork = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>\n';
    const source = '@diagram architecture\n@coralVersion "0.2.9"\n' +
      `@symbol dot {\n  name "Dot"\n  size 1 x 2.5\n  artwork svg """\n${artwork}"""\n}\na service\n`;
    const written = printSuccessorSource028(projectInstalledSourceToSuccessor028(source).graph!);
    expect(written.diagnostics).toEqual([]);
    expect(written.text).toContain(`\n\n@symbol dot {\n  name "Dot"\n  size 1 x 2.5\n  artwork svg """\n${artwork}"""\n}\n\na service\n`);
  });

  it('refuses artwork text that a raw block cannot carry', () => {
    const graph = structuredClone(projectInstalledSourceToSuccessor028(AUTHORED).graph!);
    // Empty artwork is refused by admission when the printed source is read back.
    for (const text of ['', '<svg/>', '<svg>\n"""\n</svg>\n']) {
      graph.userSymbols029![0]!.artwork.text = text;
      expect(printSuccessorSource028(graph).diagnostics.map(({ code }) => code))
        .toEqual(['coral.writer028.successor.unsupported']);
    }
  });
});
