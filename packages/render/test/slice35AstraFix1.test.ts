import { describe, expect, it } from 'vitest';
import { parseInstalledDocument028, projectInstalledSourceToSuccessor028,
  renderInstalledCharacterPreview028 } from '../src/index.js';
import { CHARACTER_GLYPH_ROLES_028 } from '../src/characterGlyphRoles028.js';

const aliases = '@diagram uml-state\nstart initial as "Born"\na state as "Same"\n' +
  'b state as "Same"\nfinish final as "Dead"\nstart -> a\na -> b\nb -> finish\n';
const monoTrue = { profile: 'monotrue-v1' as const, selected: true as const,
  face: 'Regular' as const,
  fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
  validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028) };
const picture = (text: string) => text.split('PICTURE\n')[1]!.split(/\n(?:GRAPH|NODES)\n/)[0]!;

function initialRouteIsConnected(text: string, charset: 'ASCII' | 'MonoTrue-v1'): boolean {
  const rows = picture(text).split('\n');
  const mark = charset === 'ASCII' ? '#####' : '●●●●●';
  const startY = rows.findIndex(row => row.includes(mark));
  const startX = rows[startY]!.indexOf(mark);
  const arrow = charset === 'ASCII' ? 'v' : CHARACTER_GLYPH_ROLES_028['endpoint.arrow_open.n'].character;
  const targetY = rows.findIndex(row => row.includes(arrow));
  const targetX = rows[targetY]!.indexOf(arrow);
  const ink = new Set<string>([...'#●|│-─+┌┐└┘├┤┬┴/\\v',
    ...Object.values(CHARACTER_GLYPH_ROLES_028).map(role => role.character)]);
  const queue: Array<[number, number]> = [[startX, startY]];
  const seen = new Set<string>();
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const key = `${x}:${y}`;
    if (seen.has(key) || !ink.has(rows[y]?.[x] ?? ' ')) continue;
    if (x === targetX && y === targetY) return true;
    seen.add(key);
    queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }
  return false;
}

function located(source: string, token: string): string {
  const offset = source.indexOf(token);
  expect(offset).toBeGreaterThanOrEqual(0);
  const before = source.slice(0, offset).split('\n');
  return `source.line.${before.length}.column.${before.at(-1)!.length}`;
}

const sources: Array<[string, string, string, string]> = [
  ['BPMN proximity', '@diagram bpmn\na task\nb task\na ----> b\n', '---->', 'character.source.capability'],
  ['BPMN endpoint port', '@diagram bpmn\na task\nb task\na:p -> b\n', 'p ->', 'character.source.capability'],
  ['BPMN port declaration', '@diagram bpmn\na task {\n  p port [direction: out]\n}\nb task\na:p -> b\n', 'port', 'character.source.capability'],
  ['BPMN layout', '@diagram bpmn\nlayout [direction: RIGHT]\na task\nb task\na -> b\n', 'layout', 'character.source.capability'],
  ['BPMN route', '@diagram bpmn\na task\nb task\ne = a -> b\nroute edge e {\n  w = waypoint at (10, 20)\n}\n', 'route', 'character.source.capability'],
  ['BPMN bidirectional operator', '@diagram bpmn\na task\nb task\na <-> b [sequence]\n', '<->', 'character.bpmn.source-construct'],
  ['BPMN symbol', '@diagram bpmn\na task [symbol: "bpmn-task"]\n', '"bpmn-task"', 'character.bpmn.source-construct'],
  ['BPMN-only kind', '@diagram bpmn\na subprocess\n', 'subprocess', 'character.bpmn.source-construct'],
  ['state proximity', '@diagram uml-state\ns initial\na state\nf final\ns ----> a\na -> f\n', '---->', 'character.source.capability'],
  ['state endpoint port', '@diagram uml-state\ns initial\na state\nf final\ns -> a:p\na -> f\n', 'p\na', 'character.source.capability'],
  ['state layout', '@diagram uml-state\nlayout [direction: RIGHT]\ns initial\na state\nf final\ns -> a\na -> f\n', 'layout', 'character.source.capability'],
  ['state route', '@diagram uml-state\ns initial\na state\nf final\ne = s -> a\na -> f\nroute edge e {\n w = waypoint at (10, 20)\n}\n', 'route', 'character.source.capability'],
  ['state-only kind', '@diagram uml-state\ns initial\na choice\nf final\ns -> a\na -> f\n', 'choice', 'character.state.source-construct'],
];

describe('Slice 35 Astra FIX-1', () => {
  it.each(['ASCII', 'MonoTrue-v1'] as const)('preserves duplicate state aliases and pseudostate captions in the %s picture', async charset => {
    const sourceGraph = parseInstalledDocument028(aliases).graph!;
    const before = structuredClone(sourceGraph);
    const result = await renderInstalledCharacterPreview028(aliases, charset === 'ASCII'
      ? { columns: 120 } : { columns: 120, target: 'controlled-display', monoTrue });
    expect(result.charset).toBe(charset);
    expect(initialRouteIsConnected(result.text, charset)).toBe(true);
    for (const title of ['[start] Born', '[a] Same', '[b] Same', '[finish] Dead']) {
      expect(picture(result.text).split(title)).toHaveLength(2);
    }
    expect(result.graph).toEqual(before);
    expect(parseInstalledDocument028(aliases).graph).toEqual(before);
    expect(result.text).not.toContain('[legend-only]');
  });

  it.each(['missing-role', 'wrong-hash'] as const)('falls back atomically for aliased state chains with %s', async mode => {
    const capability = mode === 'missing-role'
      ? { ...monoTrue, validatedRoles: monoTrue.validatedRoles.filter(role => role !== 'endpoint.arrow_open.n') }
      : { ...monoTrue, fontSha256: '0'.repeat(64) };
    const ascii = await renderInstalledCharacterPreview028(aliases, { columns: 120 });
    const fallback = await renderInstalledCharacterPreview028(aliases,
      { columns: 120, target: 'controlled-display', monoTrue: capability });
    expect(fallback.charset).toBe('ASCII');
    expect(fallback.text).toBe(ascii.text);
    expect(fallback.text).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it('refuses an aliased state node that cannot fit the requested width', async () => {
    await expect(renderInstalledCharacterPreview028(aliases.replace('Born', 'B'.repeat(100)),
      { columns: 40 })).rejects.toMatchObject({ code: 'character.width.unsupported' });
  });

  it.each(sources)('locates %s at its authored token after header/comment shifts', async (_name, body, token, code) => {
    const source = body.replace('\n', '\n@coralVersion "0.2.8"\n// before declarations\n\n');
    expect(parseInstalledDocument028(source).syntax.diagnostics).toEqual([]);
    expect(projectInstalledSourceToSuccessor028(source).graph).toBeDefined();
    await expect(renderInstalledCharacterPreview028(source, { columns: 120 })).rejects.toMatchObject({
      code, diagnostics: [expect.objectContaining({ path: located(source, token) })],
    });
  });

  it.each(['class', 'state'] as const)('documents bounded UML %s output beyond the routed-only aggregate input cap', async family => {
    const id = (index: number) => `m${index}${'x'.repeat(1500)}`;
    const source = family === 'class'
      ? '@diagram uml-class\nA class {\n attrs = attributes {\n' +
        Array.from({ length: 6 }, (_, index) => `${id(index)} = public attribute field${index}: String`).join('\n') + '\n }\n}\n'
      : '@diagram uml-state\ns initial\na state\nb state\nc state\nd state\ne state\nf final\n' +
        ['s -> a', 'a -> b', 'b -> c', 'c -> d', 'd -> e', 'e -> f']
          .map((edge, index) => `${id(index)} = ${edge}`).join('\n') + '\n';
    expect(parseInstalledDocument028(source).syntax.diagnostics).toEqual([]);
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    expect(result.height).toBeLessThanOrEqual(1024);
    expect(result.text.length).toBeLessThanOrEqual(65536 + result.height);
    expect(result.text.split('\n').every(line => line.length <= 120)).toBe(true);
    expect(result.text).toMatch(/^[\x20-\x7e\n]*$/);
  });
});
