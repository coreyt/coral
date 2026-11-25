import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseInstalledDocument028, renderInstalledCharacterPreview028, renderSvg } from '../src/index.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { CHARACTER_GLYPH_ROLES_028 } from '../src/characterGlyphRoles028.js';
import { renderUmlClassCharacters028, renderUmlSequenceCharacters028 } from '../src/characterUml028.js';
import { renderClassPicture028 } from '../src/characterClassPicture028.js';

const classSource = [
  '@diagram uml-class',
  'Customer class',
  'Order class {',
  '  fields = attributes {',
  '    orderId = public attribute id: String',
  '  }',
  '  actions = operations {',
  '    saveOp = public operation save(id: String): Boolean',
  '  }',
  '}',
  'LineItem class',
  'ExpressOrder class',
  'customerOrders = Customer -- Order [association]',
  'orderItems = Order -- LineItem [composition, firstEnd: filledDiamond]',
  'inherits = ExpressOrder --|> Order [inheritance]',
].join('\n');

const sequenceSource = [
  '@diagram uml-sequence',
  'client participant', 'api participant', 'store participant',
  'request = client -#> api as "request"',
  'query = api -> store as "find"',
  'result = store -.-> api as "row"',
  'reply = api -.-> client as "done"',
].join('\n');
const classFixture = (name: string) => readFileSync(join(import.meta.dirname,
  'fixtures/character-gallery', `${name}.coral`), 'utf8');
const pictureOf = (text: string) => text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
const endpointCharacters = (kind: string): string[] => Object.entries(CHARACTER_GLYPH_ROLES_028)
  .filter(([role]) => role.startsWith(`endpoint.${kind}.`)).map(([, row]) => row.character);
const countEndpoints = (picture: string, kind: string) =>
  [...picture].filter(char => endpointCharacters(kind).includes(char)).length;

function expectConnectedClassPicture(picture: string, ids: string[]): void {
  const rows = picture.split('\n');
  const stroke = /^[+|\-<>#\\/^v│─┌┐└┘├┤┬┴┼]$/;
  const approvedMarkers = new Set<string>(Object.entries(CHARACTER_GLYPH_ROLES_028)
    .filter(([role]) => role.startsWith('endpoint.')).map(([, row]) => row.character));
  const wall = (id: string): string => {
    const y = rows.findIndex((row) => row.includes(`[${id}]`));
    expect(y).toBeGreaterThanOrEqual(0);
    const x = Math.max(rows[y]!.lastIndexOf('|', rows[y]!.indexOf(`[${id}]`)),
      ...['│', '├', '┤'].map(char => rows[y]!.lastIndexOf(char, rows[y]!.indexOf(`[${id}]`))));
    expect(x).toBeGreaterThanOrEqual(0);
    return `${x},${y}`;
  };
  const seen = new Set<string>([wall(ids[0]!)]);
  const queue = [...seen];
  while (queue.length) {
    const [x, y] = queue.shift()!.split(',').map(Number);
    const diagonals = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], ...diagonals]) {
      const nx = x! + dx;
      const ny = y! + dy;
      const key = `${nx},${ny}`;
      const cell = rows[ny]?.[nx] ?? '';
      if (seen.has(key) || (!stroke.test(cell) && !approvedMarkers.has(cell))) continue;
      if (dx && dy && !/[\\/^v]/.test(rows[y]?.[x!] ?? '') &&
          !/[\\/^v]/.test(rows[ny]?.[nx] ?? '')) continue;
      seen.add(key);
      queue.push(key);
    }
  }
  for (const id of ids) expect(seen.has(wall(id)), `${id} must connect to the class picture`).toBe(true);
}

describe('0.2.8 source-derived character gallery', () => {
  it.each([['class', classSource], ['sequence', sequenceSource]])('parses and renders real %s source without mutating its graph', async (_name, source) => {
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.version).toBe('3.0.0');
    const before = structuredClone(parsed.graph);
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    expect(result.graph).toEqual(before);
    expect(result.text).toContain('CHAR-PREVIEW/1');
    expect(result.text).toMatch(/\[routed\]/);
    expect(result.text).toMatch(/\n$/);
    expect(result.text.split('\n').every((row) => row.length <= 120)).toBe(true);
    expect(await renderInstalledCharacterPreview028(source, { columns: 120 })).toEqual(result);
  });

  it.each([['class', classSource], ['sequence', sequenceSource]])('accepts the same %s graph in the SVG path', async (_name, source) => {
    const graph = parseInstalledDocument028(source).graph!;
    const layout = await layoutGraphForSvg(graph, { direction: 'RIGHT', nodeSpacing: 50 });
    const svg = renderSvg(layout, { edgeRoutes: layout.edgeRoutes, theme: 'light' });
    expect(svg).toContain('<svg');
    for (const node of graph.nodes) expect(svg).toContain(node.label);
    expect((await renderInstalledCharacterPreview028(source, { columns: 120 })).graph).toEqual(graph);
  });

  it('keeps class compartments, items, and relation end meanings visible', async () => {
    const result = await renderInstalledCharacterPreview028(classSource, { columns: 120 });
    for (const value of ['fields', 'orderId', 'String', 'actions', 'saveOp', 'Boolean',
      'customerOrders', 'orderItems', 'inherits', 'filled diamond at source', 'open triangle at target']) {
      expect(result.text).toContain(value);
    }
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'character.glyph.approximation', path: expect.stringContaining('orderItems'),
    }));
  });

  it.each(['ASCII', 'MonoTrue-v1'] as const)('draws one connected %s class diagram with endpoint marks', async (charset) => {
    const result = await renderInstalledCharacterPreview028(classSource, charset === 'ASCII'
      ? { columns: 120 }
      : { columns: 120, target: 'controlled-display', monoTrue: {
        profile: 'monotrue-v1', selected: true, face: 'Regular',
        fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
        validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028),
      } });
    const picture = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
    for (const id of ['Customer', 'Order', 'LineItem', 'ExpressOrder']) {
      expect((picture.match(new RegExp(`\\[${id}\\]`, 'g')) ?? [])).toHaveLength(1);
    }
    if (charset === 'ASCII') {
      expect(picture).toContain('#####');
      expect(picture).toContain('|>');
    } else {
      expect(countEndpoints(picture, 'diamond_filled')).toBe(1);
      expect(countEndpoints(picture, 'triangle_open')).toBe(1);
      expect(result.diagnostics.filter(item => item.code === 'character.glyph.approximation')).toEqual([]);
    }
    expect(picture).toContain('id: String');
    expect(picture).toContain('save(id: String): Boolean');
    expect(picture).not.toContain('fields');
    expect(picture).not.toContain('actions');
    expectConnectedClassPicture(picture, ['Customer', 'Order', 'LineItem', 'ExpressOrder']);
    expect(result.diagnostics.filter((item) => item.code === 'character.edge.legend')).toEqual([]);
  });

  it.each(['uml-class-simple', 'uml-class-difficult'])('keeps every classifier connected in %s', async (name) => {
    const source = classFixture(name);
    const parsed = parseInstalledDocument028(source);
    expect(parsed.graph).toBeDefined();
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    const picture = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
    for (const node of parsed.graph!.nodes) {
      expect((picture.match(new RegExp(`\\[${node.id}\\]`, 'g')) ?? [])).toHaveLength(1);
    }
    expectConnectedClassPicture(picture, parsed.graph!.nodes.map((node) => node.id));
    expect(result.text).toMatch(/\[routed\]/);
    if (name === 'uml-class-difficult') {
      expect(picture).toContain('#####');
      expect(picture).toContain('|>');
    }
  });

  it.each(['ASCII', 'MonoTrue-v1'] as const)('draws the high-complexity cyclic class case in %s', async (charset) => {
    const source = classFixture('uml-class-cyclic');
    const graph = parseInstalledDocument028(source).graph!;
    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(8);
    const result = await renderInstalledCharacterPreview028(source, charset === 'ASCII'
      ? { columns: 120 }
      : { columns: 120, target: 'controlled-display', monoTrue: {
        profile: 'monotrue-v1', selected: true, face: 'Regular',
        fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
        validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028),
      } });
    const picture = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
    for (const node of graph.nodes) {
      expect((picture.match(new RegExp(`\\[${node.id}\\]`, 'g')) ?? [])).toHaveLength(1);
    }
    expectConnectedClassPicture(picture, graph.nodes.map((node) => node.id));
    if (charset === 'ASCII') {
      expect(picture).toContain('#####');
      expect(picture.includes('|>') || picture.includes('<|') || picture.includes('\\ /')).toBe(true);
    } else {
      expect(countEndpoints(picture, 'diamond_filled')).toBe(1);
      expect(countEndpoints(picture, 'triangle_open')).toBe(1);
      expect(result.diagnostics.filter(item => item.code === 'character.glyph.approximation')).toEqual([]);
    }
    expect(picture.split('\n').length).toBeLessThanOrEqual(80);
    // This image-reviewed golden protects all eight routes; connectedness alone cannot detect a missing cycle edge.
    const golden = readFileSync(join(import.meta.dirname, 'fixtures/character-gallery',
      `uml-class-cyclic.expected-${charset === 'ASCII' ? 'ascii' : 'monotrue'}.txt`), 'utf8');
    expect(picture.trimEnd()).toBe(golden.trimEnd());
  });

  it.each(['ASCII', 'MonoTrue-v1'] as const)('attaches reversed class markers in %s', async (charset) => {
    const source = classFixture('uml-class-reversed');
    const graph = parseInstalledDocument028(source).graph!;
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges[0]?.targetEnd?.marker).toMatchObject({ kind: 'diamond', fill: 'filled' });
    expect(graph.edges[2]?.sourceEnd?.marker).toMatchObject({ kind: 'triangle', fill: 'open' });
    const result = await renderInstalledCharacterPreview028(source, charset === 'ASCII'
      ? { columns: 120 }
      : { columns: 120, target: 'controlled-display', monoTrue: {
        profile: 'monotrue-v1', selected: true, face: 'Regular',
        fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
        validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028),
      } });
    const picture = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
    expectConnectedClassPicture(picture, graph.nodes.map((node) => node.id));
    if (charset === 'ASCII') {
      expect(picture).toContain('#####');
      expect(picture.includes('|>') || picture.includes('<|') || picture.includes('\\ /')).toBe(true);
    } else {
      expect(countEndpoints(picture, 'diamond_filled')).toBe(1);
      expect(countEndpoints(picture, 'triangle_open')).toBe(1);
    }
    if (charset === 'ASCII') {
      expect(result.diagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'character.glyph.approximation', path: 'edges.owns.targetEnd' }),
        expect.objectContaining({ code: 'character.glyph.approximation', path: 'edges.inherits.sourceEnd' }),
      ]));
    } else {
      expect(result.diagnostics.filter(item => item.code === 'character.glyph.approximation')).toEqual([]);
    }
    // Image-reviewed golden fixes the marker to the authored box, beyond ledger diagnostics.
    const golden = readFileSync(join(import.meta.dirname, 'fixtures/character-gallery',
      `uml-class-reversed.expected-${charset === 'ASCII' ? 'ascii' : 'monotrue'}.txt`), 'utf8');
    expect(picture.trimEnd()).toBe(golden.trimEnd());
  });

  it('bounds encoded class picture content before layout', async () => {
    await expect(renderClassPicture028([{ id: 'large', sections: [['x'.repeat(2001)]] }], [], 120, 'ASCII'))
      .rejects.toMatchObject({ code: 'character.limit.exceeded' });
  });

  it('keeps a full-cell clearance around a local inheritance cue', async () => {
    const { picture } = await renderClassPicture028([
      { id: 'Child', sections: [['[Child]']] }, { id: 'Base', sections: [['[Base]']] },
    ], [{ id: 'inherits', source: 'Child', target: 'Base', type: 'inheritance',
      sourceMarker: 'none/unspecified', targetMarker: 'none/unspecified' }], 80, 'ASCII');
    const rows = picture.split('\n');
    const y = rows.findIndex((row) => row.includes('<<inherits>>'));
    expect(y).toBeGreaterThan(0);
    const x = rows[y]!.indexOf('<<inherits>>');
    for (const neighbor of [rows[y - 1] ?? '', rows[y + 1] ?? '']) {
      expect(neighbor.padEnd(x + 13, ' ').slice(x - 1, x + 13)).toMatch(/^ +$/);
    }
  });

  it('reserves distinct ports for three incoming class relations', async () => {
    const nodes = ['Hub', 'A', 'B', 'C'].map((id) => ({ id, sections: [[`[${id}]`]] }));
    const edges = ['A', 'B', 'C'].map((source) => ({ id: `${source}Hub`, source, target: 'Hub',
      type: 'association', sourceMarker: 'none/unspecified', targetMarker: 'none/unspecified' }));
    const { picture } = await renderClassPicture028(nodes, edges, 120, 'ASCII');
    for (const node of nodes) expect((picture.match(new RegExp(`\\[${node.id}\\]`, 'g')) ?? [])).toHaveLength(1);
    expectConnectedClassPicture(picture, nodes.map((node) => node.id));
  });

  it('keeps participant and message order, kind, direction, and labels', async () => {
    const result = await renderInstalledCharacterPreview028(sequenceSource, { columns: 120 });
    const text = result.text;
    expect(text.indexOf('request')).toBeLessThan(text.indexOf('query'));
    expect(text.indexOf('query')).toBeLessThan(text.indexOf('result'));
    expect(text.indexOf('result')).toBeLessThan(text.indexOf('reply'));
    for (const value of ['client', 'api', 'store', 'sync', 'async', 'return', 'find', 'row', 'done']) {
      expect(text).toContain(value);
    }
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'character.glyph.approximation' }));
  });

  it.each(['ASCII', 'MonoTrue-v1'] as const)('shows authored participant labels and compact sync heads in %s', async (charset) => {
    const source = classFixture('uml-sequence-moderate');
    const result = await renderInstalledCharacterPreview028(source, charset === 'ASCII'
      ? { columns: 120 }
      : { columns: 120, target: 'controlled-display', monoTrue: {
        profile: 'monotrue-v1', selected: true, face: 'Regular',
        fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
        validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028),
      } });
    const rows = pictureOf(result.text).split('\n');
    expect(rows[0]).toContain('[browser] Web');
    for (const id of ['login', 'query']) {
      const caption = rows.findIndex((row) => row.includes(`sync ${id}`));
      expect(caption).toBeGreaterThan(0);
      if (charset === 'ASCII') {
        expect(rows[caption + 1]).toMatch(/##>|<##/);
      } else {
        expect(countEndpoints(rows[caption + 1]!, 'triangle_filled')).toBe(1);
      }
      expect(rows[caption]).not.toContain('#');
      expect(rows[caption + 2]).not.toContain('#');
    }
  });

  it.each(['ASCII', 'MonoTrue-v1'] as const)('keeps nonjunction crossings and reverse messages in difficult %s', async (charset) => {
    const source = classFixture('uml-sequence-difficult');
    const parsed = parseInstalledDocument028(source);
    expect(parsed.graph?.interaction?.messages).toHaveLength(11);
    const result = await renderInstalledCharacterPreview028(source, charset === 'ASCII'
      ? { columns: 120 }
      : { columns: 120, target: 'controlled-display', monoTrue: {
        profile: 'monotrue-v1', selected: true, face: 'Regular',
        fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
        validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028),
      } });
    const rows = pictureOf(result.text).split('\n');
    expect(rows[0]).toContain('[client] Mobile App');
    const lifeline = charset === 'ASCII' ? '|' : '│';
    const stroke = charset === 'ASCII' ? '-' : '─';
    const auth = rows[0]!.indexOf('[auth]') + 3;
    for (const id of ['execute', 'notify', 'audit']) {
      const labelRow = rows.findIndex((row) => row.includes(id));
      expect(labelRow).toBeGreaterThan(0);
      const crossing = rows[labelRow + 1]!;
      expect(crossing[auth]).toBe(lifeline);
      expect(crossing[auth - 1]).toBe(stroke);
      expect(crossing[auth + 1]).toBe(stroke);
      expect(rows[labelRow]![auth]).toBe(lifeline);
      expect(rows[labelRow + 2]![auth]).toBe(lifeline);
    }
    expect(rows.join('\n')).toContain('sync notify');
    expect(rows.join('\n')).toContain('audit');
    expect(rows.join('\n')).toContain('ack');
    expect(rows.every((row) => row.length <= 120)).toBe(true);
  });

  it.each(['A <- B', 'B -> A'])('keeps reverse asynchronous spelling %s', async (edge) => {
    const source = `@diagram uml-sequence\nA participant\nB participant\nm = ${edge} as "ping"\n`;
    const result = await renderInstalledCharacterPreview028(source, { columns: 80 });
    expect(result.graph.edges[0]).toMatchObject({ source: 'B', target: 'A', type: 'async' });
    const picture = pictureOf(result.text);
    expect(picture).toMatch(/<[- ]+\+/);
  });

  it.each(['A -#> B', 'B -#> A'])('bounds %s sync caption with its message path', async (edge) => {
    for (const [labelLength, accepts] of [[85, true], [86, false]] as const) {
      const source = `@diagram uml-sequence\nA participant\nB participant\nm = ${edge} as "${'x'.repeat(labelLength)}"\n`;
      if (accepts) {
        const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
        expect(pictureOf(result.text)).toContain('x'.repeat(labelLength));
      } else {
        await expect(renderInstalledCharacterPreview028(source, { columns: 120 }))
          .rejects.toMatchObject({ code: 'character.width.unsupported',
            diagnostics: [expect.objectContaining({ path: 'edges.m.label' })] });
      }
    }
  });

  it('keeps MonoTrue sequence lifelines continuous at message events', async () => {
    const result = await renderInstalledCharacterPreview028(sequenceSource, {
      columns: 120, target: 'controlled-display', monoTrue: {
        profile: 'monotrue-v1', selected: true, face: 'Regular',
        fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
        validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028),
      },
    });
    expect(result.charset).toBe('MonoTrue-v1');
    const picture = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
    expect(picture).not.toContain('+');
    const markers = [...endpointCharacters('arrow_open'), ...endpointCharacters('triangle_filled')].join('');
    const eventRows = picture.split('\n').filter(row => [...markers].some(marker => row.includes(marker)));
    expect(eventRows).toHaveLength(4);
    for (const row of eventRows) {
      expect(row).toMatch(new RegExp(`[├┤].*[${markers}]|[${markers}].*[├┤]`));
      expect(row[10]).toMatch(/[│├┤]/);
      expect(row[35]).toMatch(/[│├┤]/);
      expect(row[60]).toMatch(/[│├┤]/);
    }
  });

  it('refuses an incomplete state chain', async () => {
    await expect(renderInstalledCharacterPreview028('@diagram uml-state\nIdle state\n', { columns: 120 }))
      .rejects.toMatchObject({ code: 'character.state.size' });
  });

  it('refuses valid syntax-only sequence constructs and invalid neighboring source', async () => {
    const base = '@diagram uml-sequence\na participant\nb participant\nm = a -> b\n';
    for (const tail of ['note "hello" on a\n', 'activation b from m to m\n',
      'alt "yes" {\n  n = b -> a\n}\n', '???\n']) {
      await expect(renderInstalledCharacterPreview028(base + tail, { columns: 120 })).rejects.toMatchObject({
        code: expect.stringMatching(/^character\.(source|sequence)\./),
      });
    }
  });

  it('refuses self messages and source kind/operator conflicts', async () => {
    const base = '@diagram uml-sequence\na participant\nb participant\n';
    await expect(renderInstalledCharacterPreview028(base + 'm = a -> a [async]\n', { columns: 120 }))
      .rejects.toMatchObject({ code: 'character.sequence.self-message' });
    await expect(renderInstalledCharacterPreview028(base + 'm = a -> b [sync]\n', { columns: 120 }))
      .rejects.toMatchObject({ code: 'character.sequence.kind-conflict' });
  });

  it('falls back to printable ASCII with a wrong font capability', async () => {
    const result = await renderInstalledCharacterPreview028(sequenceSource, {
      columns: 120, target: 'controlled-display',
      monoTrue: { profile: 'monotrue-v1', selected: true, face: 'Bold',
        fontSha256: '4142f88ea02e4fcd1004fac84b91c4d8e7686726a58976d74c0b89772cb6a9f2',
        validatedRoles: ['stroke.single.h', 'stroke.single.v', 'endpoint.arrow_open.w'] },
    });
    expect(result.charset).toBe('ASCII');
    expect(result.text).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it('uses only reconciled one-cell Unicode drawing roles with Regular capability', async () => {
    const result = await renderInstalledCharacterPreview028(sequenceSource, {
      columns: 120, target: 'controlled-display',
      monoTrue: { profile: 'monotrue-v1', selected: true, face: 'Regular',
        fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
        validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028) },
    });
    expect(result.charset).toBe('MonoTrue-v1');
    expect(result.text).toContain(CHARACTER_GLYPH_ROLES_028['stroke.single.v'].character);
    expect(result.text).toContain(CHARACTER_GLYPH_ROLES_028['endpoint.arrow_open.w'].character);
    const drawing = [...result.text].filter((char) => char.charCodeAt(0) > 127);
    const allowed = new Set(Object.values(CHARACTER_GLYPH_ROLES_028).map((role) => role.character));
    expect(drawing.every((char) => allowed.has(char))).toBe(true);
  });

  it('shows every admitted class marker at its authored endpoint with a diagnostic', async () => {
    const source = '@diagram uml-class\nA class\nB class\n' +
      'm = A -> B [inheritance]\n';
    const result = await renderInstalledCharacterPreview028(source, { columns: 80 });
    expect(result.text).toContain('open arrow at target');
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: 'character.glyph.approximation', path: 'edges.m.targetEnd',
    }));
  });

  it('joins unique class boxes with a visible composition marker', async () => {
    const source = '@diagram uml-class\nPart class\nWhole class\n' +
      'c = Part --#<> Whole [composition]\n';
    const result = await renderInstalledCharacterPreview028(source, { columns: 80 });
    expect(result.text).toContain('filled diamond at target');
    const picture = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
    expect(picture).toContain('#####');
    expect((picture.match(/\[Part\]/g) ?? [])).toHaveLength(1);
    expect((picture.match(/\[Whole\]/g) ?? [])).toHaveLength(1);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ path: 'edges.c.targetEnd' }));
  });

  it('allows a tiny class atlas at 40 columns', async () => {
    const result = await renderInstalledCharacterPreview028('@diagram uml-class\nA class\n', { columns: 40 });
    expect(result.width).toBeLessThanOrEqual(40);
  });

  it('refuses extra root meaning and malformed sequence permutations', async () => {
    const graph = parseInstalledDocument028(classSource).graph!;
    await expect(renderUmlClassCharacters028({ ...graph, constraints: [] }, 120, 'ASCII'))
      .rejects.toThrowError(expect.objectContaining({ code: 'character.field.unsupported' }));
    const sequence = parseInstalledDocument028(sequenceSource).graph!;
    const interaction = sequence.interaction!;
    expect(() => renderUmlSequenceCharacters028({ ...sequence, interaction: {
      ...interaction, participantOrder: [...interaction.participantOrder, interaction.participantOrder[0]!],
    } }, 120, 'ASCII')).toThrowError(expect.objectContaining({ code: 'character.sequence.order' }));
    expect(() => renderUmlSequenceCharacters028({ ...sequence, interaction: {
      ...interaction, messageOrder: [...interaction.messageOrder, interaction.messageOrder[0]!],
    } }, 120, 'ASCII')).toThrowError(expect.objectContaining({ code: 'character.sequence.order' }));
  });

  it('does not invent a triangle for explicitly unmarked inheritance', async () => {
    const source = '@diagram uml-class\nChild class\nBase class\n' +
      'inherits = Child -- Base [inheritance]\n';
    const result = await renderInstalledCharacterPreview028(source, { columns: 80 });
    expect(result.text).toContain('none/unspecified');
    expect(result.text).not.toContain('triangle at target');
    expect(result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]).toContain('<<inherits>>');
    expect(result.diagnostics).toEqual([]);
  });

  it('joins Unicode class relation shafts to unique boxes', async () => {
    const result = await renderInstalledCharacterPreview028(
      '@diagram uml-class\nA class\nB class\na = A -- B [association]\n', {
        columns: 80, target: 'controlled-display',
        monoTrue: { profile: 'monotrue-v1', selected: true, face: 'Regular',
          fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
          validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028) },
      });
    expect(result.text).toMatch(/\[A\].*├─+┤ \[B\]/);
  });

  it('uses interaction order even when Graph IR arrays are reordered', () => {
    const graph = parseInstalledDocument028(sequenceSource).graph!;
    const reordered = { ...graph, nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() };
    const result = renderUmlSequenceCharacters028(reordered, 120, 'ASCII');
    const heads = result.text.split('\n')[2]!;
    expect(heads.indexOf('[client]')).toBeLessThan(heads.indexOf('[api]'));
    expect(heads.indexOf('[api]')).toBeLessThan(heads.indexOf('[store]'));
    expect(pictureOf(result.text).indexOf('sync request')).toBeLessThan(pictureOf(result.text).indexOf('query: find'));
    expect(result.text.indexOf('query: find')).toBeLessThan(result.text.indexOf('result: row'));
  });

  it('keeps lifelines present on message caption rows', async () => {
    const result = await renderInstalledCharacterPreview028(sequenceSource, { columns: 120 });
    const caption = pictureOf(result.text).split('\n').find((row) => row.includes('sync request'))!;
    expect(caption[10]).toBe('|');
    expect(caption[35]).toBe('|');
    expect(caption[60]).toBe('|');
  });

  it.each(['ASCII', 'MonoTrue-v1'] as const)('keeps %s sequence captions on their spans and distinguishes filled calls', async (charset) => {
    const result = await renderInstalledCharacterPreview028(sequenceSource, charset === 'ASCII'
      ? { columns: 120 }
      : { columns: 120, target: 'controlled-display', monoTrue: {
        profile: 'monotrue-v1', selected: true, face: 'Regular',
        fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
        validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028),
      } });
    const picture = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
    const rows = picture.split('\n');
    const request = rows.findIndex((row) => row.includes('sync request'));
    const query = rows.findIndex((row) => row.includes('query: find'));
    expect(rows[request]!.indexOf('sync request')).toBeGreaterThan(10);
    expect(rows[request]!.indexOf('sync request')).toBeLessThan(35);
    expect(rows[query]!.indexOf('query: find')).toBeGreaterThan(35);
    expect(rows[query]!.indexOf('query: find')).toBeLessThan(60);
    expect(rows[request + 1]).toContain(charset === 'ASCII' ? '##>'
      : CHARACTER_GLYPH_ROLES_028['endpoint.triangle_filled.w'].character);
    expect(rows[request]).not.toContain('#');
    expect(rows[request + 2]).not.toContain('#');
    expect(rows[query + 1]).not.toContain('#');
    expect(rows[query + 1]).toContain(charset === 'ASCII' ? '>'
      : CHARACTER_GLYPH_ROLES_028['endpoint.arrow_open.w'].character);
  });

  it('widens only the sequence span that needs a long caption', async () => {
    const source = '@diagram uml-sequence\nA participant\nB participant\n' +
      'C participant\nD participant\n' +
      'm = A -> B as "abcdefghijklmnopqrstuvwxy"\n';
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    const heads = result.text.split('PICTURE\n')[1]!.split('\n')[0]!;
    expect(heads.indexOf('[B]') - heads.indexOf('[A]')).toBeGreaterThan(25);
    expect(heads.indexOf('[C]') - heads.indexOf('[B]')).toBe(25);
    expect(heads.indexOf('[D]') - heads.indexOf('[C]')).toBe(25);
  });

  it('widens source-adjacent gaps for overlapping long message spans', async () => {
    const label = 'x'.repeat(25);
    const source = '@diagram uml-sequence\nA participant\nB participant\n' +
      'C participant\nD participant\n' +
      `m1 = A -> C as "${label}"\n` +
      `m2 = B -> D as "${label}"\n`;
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    const rows = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!.split('\n');
    const heads = rows[0]!;
    const b = heads.indexOf('[B]') + 1;
    const c = heads.indexOf('[C]') + 1;
    expect(b).toBeGreaterThan(35);
    expect(c - b).toBeGreaterThan(25);
    expect(rows.find((row) => row.includes('m1:'))?.[b]).toBe('|');
    expect(rows.find((row) => row.includes('m2:'))?.[c]).toBe('|');
  });

  it.each(['A -> C', 'C -> A'])('keeps the skipped lifeline visible for %s messages', async (endpoints) => {
    const source = '@diagram uml-sequence\nA participant\nB participant\n' +
      'C participant\n' + `m = ${endpoints} as "abcdefghijklmnopqrstuvwxy"\n`;
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    const rows = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!.split('\n');
    const b = rows[0]!.indexOf('[B]') + 1;
    expect(rows.find((row) => row.includes('m: abcdefghijklmnopqrstuvwxy'))?.[b]).toBe('|');
    const stroke = rows.find((row) => /[<>]/.test(row))!;
    expect(stroke[b]).toBe('|');
  });

  it('keeps a reverse filled head on its own row below the caption', async () => {
    const source = '@diagram uml-sequence\nA participant\nB participant\n' +
      'm = B -#> A as "abcdefghijklmnop"\n';
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    const picture = result.text.split('PICTURE\n')[1]!.split('\nGRAPH\n')[0]!;
    const rows = picture.split('\n');
    const caption = rows.findIndex((row) => row.includes('sync m: abcdefghijklmnop'));
    expect(caption).toBeGreaterThan(0);
    expect(rows[caption]).not.toContain('#');
    expect(rows[caption + 1]).toContain('<##');
    expect(rows[caption + 2]).not.toContain('#');
  });
});
