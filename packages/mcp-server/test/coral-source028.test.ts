import { describe, expect, it } from 'vitest';
import { readCoralSource028 } from '../src/tools/coralSource028.js';

describe('one installed Coral source reader for MCP', () => {
  it('selects the authored 0.2.8 diagram and preserves source bytes', () => {
    const source = '@diagram flowchart\nentry process as "Entry"\nexit process\nentry -> exit [flow]\n';
    const result = readCoralSource028(source);
    expect(result.source).toBe(source);
    expect(result.parse).toMatchObject({ success: true,
      graph: { metadata: { notation: 'flowchart' }, nodes: [
        { id: 'entry', type: 'process', label: 'Entry' },
        { id: 'exit', type: 'process', label: 'exit' },
      ], edges: [{ source: 'entry', target: 'exit', type: 'flow' }] },
      diagnostics: [],
    });
    expect(result.header?.diagramType).toBe('flowchart');
  });

  it('never offers a partial graph after invalid header or body', () => {
    const cases = [
      ['entry process\n', 'header.diagram.required'],
      ['@diagram not-installed\nentry process\n', 'header.diagram.unsupported'],
      ['@diagram flowchart\n@profileVersion "1.\t0.0"\nentry process\n', 'header.string.control'],
      ['@diagram flowchart\nentry process\nentry -> missing\n', 'coral.reference.target.unresolved'],
    ];
    for (const [source, code] of cases) {
      const result = readCoralSource028(source);
      expect(result.parse.success).toBe(false);
      expect(result.parse.graph).toBeUndefined();
      expect(result.parse.diagnostics.map((item) => item.code)).toContain(code);
      expect(result.source).toBe(source);
    }
  });

  it('normalizes header locations without shifting UTF-16 body offsets', () => {
    const source = '// 🪸\r\n@diagram uninstalled\r\nentry process\r\nentry -> missing\r\n';
    const result = readCoralSource028(source);
    const header = result.parse.diagnostics.find((item) => item.code === 'header.diagram.unsupported');
    const body = result.parse.diagnostics.find((item) => item.code === 'coral.reference.target.unresolved');
    expect(header?.range?.start).toEqual({ line: 2, column: 9, offset: source.indexOf('uninstalled') });
    expect(body?.range?.start).toEqual({ line: 4, column: 9, offset: source.indexOf('missing') });
    expect(result.parse.errors).toEqual(result.parse.diagnostics);
  });

  it('withholds a sequence graph when a message predates participant creation', () => {
    const source = '@diagram uml-sequence\nclient participant\nworker participant\n' +
      'early = client -> worker\nspawn = client -.-> worker [create]\n';
    const result = readCoralSource028(source);
    expect(result.source).toBe(source);
    expect(result.parse.success).toBe(false);
    expect(result.parse.graph).toBeUndefined();
    expect(result.parse.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.message.outside-participant-lifetime',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.indexOf('worker', source.indexOf('early =')),
      }) }),
    }));
  });

  it('withholds a sequence graph when a message follows participant destruction', () => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' +
      'close = client -> server [destroy]\nlate = client -> server\n';
    const result = readCoralSource028(source);
    expect(result.source).toBe(source);
    expect(result.parse.success).toBe(false);
    expect(result.parse.graph).toBeUndefined();
    expect(result.parse.diagnostics).toContainEqual(expect.objectContaining({
      code: 'coral.sequence.message.outside-participant-lifetime',
      range: expect.objectContaining({ start: expect.objectContaining({
        offset: source.lastIndexOf('->'),
      }) }),
    }));
  });

  it.each([
    ['nested destruction', 'choice = alt "yes" {\n' +
      '  close = client -> server [destroy]\n} else "no" {\n  client -> server\n}\n',
    'coral.sequence.destroy.root-only'],
    ['duplicate destruction', 'close = client -> server [destroy]\n' +
      'again = client -> server [destroy]\n', 'coral.sequence.destroy.duplicate'],
  ])('keeps the specific %s projection finding', (_name, body, code) => {
    const source = '@diagram uml-sequence\nclient participant\nserver participant\n' + body;
    const result = readCoralSource028(source);
    expect(result.source).toBe(source);
    expect(result.parse.success).toBe(false);
    expect(result.parse.graph).toBeUndefined();
    expect(result.parse.diagnostics.map((item) => item.code)).toContain(code);
  });
});
