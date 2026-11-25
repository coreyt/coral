import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GraphIR } from '@graph-ir/core';
import { parseInstalledDocument028 } from '../src/installedDocument028.js';
import { layoutGraphForSvg } from '../src/svg/layout.js';
import {
  decodeCharacterField028, renderCharacterGraph028, renderInstalledCharacterPreview028, renderSvg,
  type MonoTrueCapability028,
} from '../src/index.js';
import { adaptCharacterGraph028 } from '../src/characterPreview028.js';
import { CHARACTER_GLYPH_ROLES_028 } from '../src/characterGlyphRoles028.js';
import { finalizeCharacterPreview028, renderRoutedCharacters028 } from '../src/characterRouted028.js';

const fixture = (name: string): string => readFileSync(
  new URL(`./fixtures/character-integration/${name}.coral`, import.meta.url), 'utf8');
const galleryBlock = (name: string): string => readFileSync(
  new URL(`./fixtures/character-gallery/${name}.coral`, import.meta.url), 'utf8');
const pictureOnly = (text: string): string => text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!;
const statePictureOnly = (text: string): string => text.split('PICTURE\n')[1]!.split(/\n(?:GRAPH|NODES)\n/)[0]!;
const sourceNames = ['block', 'flowchart-simple', 'flowchart', 'bpmn'] as const;
const controlled: MonoTrueCapability028 = {
  profile: 'monotrue-v1', selected: true, face: 'Regular',
  fontSha256: '1725392f1253a23ce6131879ec279e68e3a83695b838586ff7afe6268a55fd89',
  validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028),
};

describe('Coral 0.2.8 source to routed character preview', () => {
  it('falls back atomically when a routed state direction lacks a validated MonoTrue arrow role', async () => {
    const limited = { ...controlled,
      validatedRoles: [...controlled.validatedRoles, 'mark.circle.filled']
        .filter((role) => role !== 'endpoint.arrow_open.n') };
    const result = await renderInstalledCharacterPreview028(galleryBlock('uml-state-moderate'),
      { columns: 120, target: 'controlled-display', monoTrue: limited });
    expect(result.charset).toBe('ASCII');
    expect(result.text).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it.each(['uml-state-moderate', 'uml-state-difficult'] as const)(
    'renders all branches, joins, cycles and captions of %s in the picture', async (name) => {
      const source = galleryBlock(name);
      const graph = parseInstalledDocument028(source).graph!;
      for (const charset of ['ASCII', 'MonoTrue-v1'] as const) {
        const result = await renderInstalledCharacterPreview028(source, charset === 'ASCII'
          ? { columns: 120 }
          : { columns: 120, target: 'controlled-display',
            monoTrue: { ...controlled, validatedRoles: [...controlled.validatedRoles, 'mark.circle.filled'] } });
        expect(result.graph).toEqual(graph);
        expect(result.charset).toBe(charset);
        const picture = statePictureOnly(result.text);
        const variant = charset === 'ASCII' ? 'ascii' : 'monotrue';
        const accepted = readFileSync(new URL(
          `./fixtures/character-gallery/${name}.expected-${variant}.txt`, import.meta.url), 'utf8');
        expect(`CHAR-PREVIEW/1 uml-state ${charset}\nPICTURE\n${picture}\n`).toBe(accepted);
        const rows = picture.split('\n');
        const endpointCharacters = new Set<string>(Object.entries(CHARACTER_GLYPH_ROLES_028)
          .filter(([role]) => role.startsWith('endpoint.')).map(([, row]) => row.character));
        const markerRows = charset === 'ASCII' ? []
          : rows.filter(row => [...row].some(char => endpointCharacters.has(char)));
        if (charset === 'MonoTrue-v1') {
          expect([...picture].filter(char => endpointCharacters.has(char))).toHaveLength(graph.edges.length);
        }
        // Route endpoints now occupy cells outside the wall. Preserve those marker lanes
        // while retaining the original compactness bound for the remaining picture rows.
        expect(rows.length - markerRows.length).toBeLessThanOrEqual(name === 'uml-state-moderate' ? 40 : 60);
        expect(rows.length).toBeLessThanOrEqual(120);
        for (const node of graph.nodes) {
          expect((picture.match(new RegExp(`\\[${node.id}\\]`, 'g')) ?? [])).toHaveLength(1);
        }
        expect(picture).not.toContain('[Checking] Checking');
        for (const edge of graph.edges) if (edge.label) expect(picture).toContain(edge.label);
        expect(picture).toContain(charset === 'ASCII' ? '#####' : '●●●●●');
        expect(picture).toMatch(charset === 'ASCII' ? /\(.*###.*\)/ : /\(.*●●●.*\)/);
        expect(result.diagnostics.filter((item) =>
          ['character.edge.legend', 'character.label.unplaced'].includes(item.code))).toEqual([]);
        expect(result.text).not.toContain('[legend-only]');
      }
    });

  it('preserves a special-character state caption in Graph IR and encodes it beside its route', async () => {
    const source = galleryBlock('uml-state-moderate').replace('"invalid"', '"x|y"');
    const parsed = parseInstalledDocument028(source).graph!;
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    expect(result.graph).toEqual(parsed);
    expect(parsed.edges.some((edge) => edge.label === 'x|y')).toBe(true);
    expect(statePictureOnly(result.text)).toContain('x\\u{7C}y');
  });

  it('changes visible target ports when a branch or feedback destination changes', async () => {
    const source = galleryBlock('uml-state-moderate');
    const original = statePictureOnly((await renderInstalledCharacterPreview028(source, { columns: 120 })).text);
    const branchSource = source.replace('Checking -> Approved [label: "valid"]',
      'Checking -> finish [label: "valid"]');
    const feedbackSource = source.replace('Rejected -> Checking [label: "retry"]',
      'Rejected -> Idle [label: "retry"]');
    const branch = statePictureOnly((await renderInstalledCharacterPreview028(branchSource, { columns: 120 })).text);
    const feedback = statePictureOnly((await renderInstalledCharacterPreview028(feedbackSource, { columns: 120 })).text);
    const rows = (picture: string) => picture.split('\n');
    const nodeBorder = (picture: string, id: string, offset: number) => {
      const lines = rows(picture);
      const middle = lines.findIndex((line) => line.includes(`[${id}]`));
      expect(middle).toBeGreaterThan(0);
      return lines[middle + offset]!;
    };
    const finalPorts = (picture: string) => {
      const lines = rows(picture);
      const label = lines.findIndex((line) => line.includes('[finish]'));
      expect(label).toBeGreaterThan(8);
      return (lines[label - 7]!.match(/v/g) ?? []).length;
    };
    expect(finalPorts(original)).toBe(1);
    expect(finalPorts(branch)).toBe(2);
    expect((nodeBorder(original, 'Approved', -1).match(/v/g) ?? [])).toHaveLength(2);
    expect((nodeBorder(branch, 'Approved', -1).match(/v/g) ?? [])).toHaveLength(1);
    expect(nodeBorder(original, 'Checking', 1)).toContain('^');
    expect(nodeBorder(original, 'Idle', 1)).not.toContain('^');
    expect(nodeBorder(feedback, 'Checking', 1)).not.toContain('^');
    expect(nodeBorder(feedback, 'Idle', 1)).toContain('^');
    const caption = statePictureOnly((await renderInstalledCharacterPreview028(
      source.replace('"invalid"', '"denied"'), { columns: 120 })).text);
    expect(caption).toContain('denied');
    expect(caption).not.toContain('invalid');
  });

  it('attaches both difficult state transitions directly to the final contour', async () => {
    const result = await renderInstalledCharacterPreview028(galleryBlock('uml-state-difficult'), { columns: 120 });
    const rows = statePictureOnly(result.text).split('\n');
    const finishLabelRow = rows.findIndex((row) => row.includes('[finish]'));
    expect(finishLabelRow).toBeGreaterThan(8);
    const finalRow = finishLabelRow - 4;
    const upperContour = rows[finalRow - 3]!;
    const left = upperContour.indexOf('.');
    const right = upperContour.lastIndexOf('.');
    expect(left).toBeGreaterThanOrEqual(0);
    expect(right).toBeGreaterThan(left + 4);
    expect((upperContour.slice(left + 1, right).match(/v/g) ?? [])).toHaveLength(2);
    expect(upperContour.slice(left, right + 1)).not.toContain('+');
    expect(rows[finalRow]!).toMatch(/\(.*###.*\)/);
    expect(rows[finalRow - 1]).toContain('/');
    expect(rows[finalRow + 1]).toContain('\\');
    expect(rows[finalRow + 3]).toContain("'");
  });

  it.each(['bpmn-simple', 'bpmn-moderate', 'bpmn-difficult'] as const)(
    'renders complete BPMN %s picture with notation-specific shapes and flows', async (name) => {
      const source = galleryBlock(name);
      const parsed = parseInstalledDocument028(source).graph!;
      for (const charset of ['ASCII', 'MonoTrue-v1'] as const) {
        const result = await renderInstalledCharacterPreview028(source, charset === 'ASCII'
          ? { columns: 120 }
          : { columns: 120, target: 'controlled-display', monoTrue: controlled });
        expect(result.graph).toEqual(parsed);
        expect(result.charset).toBe(charset);
        const picture = pictureOnly(result.text);
        const variant = charset === 'ASCII' ? 'ascii' : 'monotrue';
        const acceptedPicture = readFileSync(new URL(
          `./fixtures/character-gallery/${name}.expected-${variant}.txt`, import.meta.url), 'utf8');
        expect(picture).toBe(acceptedPicture);
        expect(picture.split('\n').length).toBeLessThanOrEqual(120);
        for (const node of parsed.nodes) {
          expect((picture.match(new RegExp(`\\[${node.id}\\]`, 'g')) ?? [])).toHaveLength(1);
        }
        for (const edge of parsed.edges) if (edge.label) expect(picture).toContain(edge.label);
        expect(result.diagnostics.filter((item) =>
          ['character.edge.legend', 'character.label.unplaced'].includes(item.code))).toEqual([]);
        expect((result.text.match(/\[routed\]/g) ?? [])).toHaveLength(parsed.edges.length);
        expect(picture).toContain('[begin] Begin');
        expect(picture).toContain('[done] Done');
        expect(picture).toMatch(/\/[-─]{3}\\/);
        expect(picture).toMatch(/# {3}#/);
        if (parsed.nodes.some((node) => node.type === 'exclusiveGateway')) {
          expect(picture).toContain('X [');
        }
        const rows = picture.split('\n');
        const task = parsed.nodes.find((node) => node.type === 'task')!;
        const taskRow = rows.findIndex((row) => row.includes(`[${task.id}]`));
        expect(rows[taskRow - 1]).toMatch(/\/.+\\/);
        expect(rows[taskRow + 1]).toMatch(/\\.+\//);
        if (charset === 'ASCII') {
          expect(picture).toMatch(/(?:=>|V)/);
        } else {
          const filledHeads = new Set<string>(Object.entries(CHARACTER_GLYPH_ROLES_028)
            .filter(([role]) => role.startsWith('endpoint.triangle_filled.')).map(([, row]) => row.character));
          expect([...picture].filter(char => filledHeads.has(char))).toHaveLength(parsed.edges.length);
        }
      }
    });

  it('rejects nonliteral BPMN sequence operators before Graph IR loses source syntax', async () => {
    const source = galleryBlock('bpmn-simple').replace('begin -> prepare', 'begin --> prepare');
    await expect(renderInstalledCharacterPreview028(source, { columns: 120 }))
      .rejects.toMatchObject({ code: 'character.source.capability',
        diagnostics: [expect.objectContaining({ path: 'source.line.5.column.6' })] });
  });

  it.each([
    '@diagram bpmn\ne endEvent as "End"\na task\ne -> a\n',
    '@diagram bpmn\na task\ns startEvent as "Start"\na -> s\n',
  ])('refuses Sequence Flows through invalid BPMN event endpoints', async (source) => {
    await expect(renderInstalledCharacterPreview028(source, { columns: 120 }))
      .rejects.toMatchObject({ code: 'character.bpmn.sequence-endpoint',
        diagnostics: [expect.objectContaining({ path: 'edges.0' })] });
  });

  it('refuses a start-event fanout that cannot be attached to its contour', async () => {
    const source = '@diagram bpmn\ns startEvent as "Start"\nt0 task\nt1 task\n' +
      's -> t0 [label: "out0"]\ns -> t1 [label: "out1"]\n';
    await expect(renderInstalledCharacterPreview028(source, { columns: 120 }))
      .rejects.toMatchObject({ code: 'character.bpmn.start-fanout',
        diagnostics: [expect.objectContaining({ path: 'nodes.s' })] });
  });

  it('attaches horizontal BPMN gateway ports to the sloped contour', async () => {
    const outbound = '@diagram bpmn\ng exclusiveGateway\nt0 task\nt1 task\n' +
      'g -> t0 [label: "out0"]\ng -> t1 [label: "out1"]\n';
    const inbound = '@diagram bpmn\na task\nb task\ng exclusiveGateway\n' +
      'a -> g [label: "a path"]\nb -> g [label: "b path"]\n';
    const outPicture = pictureOnly((await renderInstalledCharacterPreview028(outbound, { columns: 120 })).text);
    const inPicture = pictureOnly((await renderInstalledCharacterPreview028(inbound, { columns: 120 })).text);
    expect(outPicture).not.toContain('\\  ----------');
    expect(outPicture).not.toContain('/ ----------');
    expect(inPicture).not.toMatch(/=> +[\\/]/);
  });

  it.each(['bpmn-fanout', 'bpmn-merge'] as const)(
    'pins the image-reviewed horizontal gateway %s picture', async (name) => {
      const source = galleryBlock(name);
      const graph = parseInstalledDocument028(source).graph!;
      for (const variant of ['ascii', 'monotrue'] as const) {
        const result = await renderInstalledCharacterPreview028(source, variant === 'ascii'
          ? { columns: 120 }
          : { columns: 120, target: 'controlled-display', monoTrue: controlled });
        const accepted = readFileSync(new URL(
          `./fixtures/character-gallery/${name}.expected-${variant}.txt`, import.meta.url), 'utf8');
        expect(result.graph).toEqual(graph);
        expect(pictureOnly(result.text)).toBe(accepted);
        expect(result.diagnostics.filter((item) =>
          ['character.edge.legend', 'character.label.unplaced'].includes(item.code))).toEqual([]);
      }
    });

  it('detects broken BPMN branch, join, and caption attachment in picture-only evidence', () => {
    const fanout = readFileSync(new URL(
      './fixtures/character-gallery/bpmn-fanout.expected-ascii.txt', import.meta.url), 'utf8');
    const merge = readFileSync(new URL(
      './fixtures/character-gallery/bpmn-merge.expected-ascii.txt', import.meta.url), 'utf8');
    const fanoutOracle = (picture: string): boolean => {
      const rows = picture.split('\n');
      const upper = rows.findIndex((row) => row.includes('[t0]'));
      const lower = rows.findIndex((row) => row.includes('[t1]'));
      return upper >= 1 && lower > upper + 1 &&
        rows[upper - 1]!.includes('alpha') && rows[lower - 1]!.includes('beta') &&
        rows.some((row) => /\\-+\+/.test(row)) && rows.some((row) => /\/-+\+/.test(row));
    };
    const mergeOracle = (picture: string): boolean =>
      picture.includes('=>/') && picture.includes('=>\\');
    expect(fanoutOracle(fanout)).toBe(true);
    expect(mergeOracle(merge)).toBe(true);
    const brokenBranch = fanout.replace(/\\(-+\+)/, ' $1');
    const wrongCaptions = fanout.replace('alpha', 'PLACEHOLDER').replace('beta', 'alpha')
      .replace('PLACEHOLDER', 'beta');
    const brokenJoin = merge.replace('=>/', '=> ');
    for (const [accepted, mutated, oracle] of [
      [fanout, brokenBranch, fanoutOracle],
      [fanout, wrongCaptions, fanoutOracle],
      [merge, brokenJoin, mergeOracle],
    ] as const) {
      expect(mutated).not.toBe(accepted);
      expect(oracle(mutated)).toBe(false);
    }
  });

  it('keeps captions separate in a high-degree BPMN merge or refuses with an edge path', async () => {
    const source = '@diagram bpmn\ng exclusiveGateway\n' +
      Array.from({ length: 6 }, (_, i) => `t${i} task\nt${i} -> g [label: "in${i}"]\n`).join('');
    try {
      const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
      const picture = pictureOnly(result.text);
      expect(picture).not.toMatch(/in\d+in\d+/);
      for (let i = 0; i < 6; i++) expect(picture).toContain(`in${i}`);
      expect(result.diagnostics.filter((item) => item.code === 'character.label.unplaced')).toEqual([]);
    } catch (error) {
      expect(error).toMatchObject({ code: 'character.label.unplaced',
        diagnostics: [expect.objectContaining({ path: expect.stringMatching(/^edges\.edge-\d+\.label$/) })] });
    }
  });

  it.each(['block-simple', 'block-moderate', 'block-difficult'] as const)(
    'renders every node, edge, and caption in the %s picture', async (name) => {
      const source = galleryBlock(name);
      const graph = parseInstalledDocument028(source).graph!;
      for (const charset of ['ASCII', 'MonoTrue-v1'] as const) {
        const result = await renderInstalledCharacterPreview028(source, charset === 'ASCII'
          ? { columns: 120 }
          : { columns: 120, target: 'controlled-display', monoTrue: controlled });
        expect(result.graph).toEqual(graph);
        const picture = result.text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!;
        const variant = charset === 'ASCII' ? 'ascii' : 'monotrue';
        const acceptedPicture = readFileSync(new URL(
          `./fixtures/character-gallery/${name}.expected-${variant}.txt`, import.meta.url), 'utf8');
        expect(picture).toBe(acceptedPicture);
        for (const node of graph.nodes) {
          expect((picture.match(new RegExp(`\\[${node.id}\\]`, 'g')) ?? [])).toHaveLength(1);
        }
        for (const edge of graph.edges) expect(picture).toContain(edge.label!);
        expect(result.diagnostics.filter((item) =>
          ['character.edge.legend', 'character.label.unplaced'].includes(item.code))).toEqual([]);
        expect((result.text.match(/\[routed\]/g) ?? [])).toHaveLength(graph.edges.length);
        expect(picture.split('\n').length).toBeLessThanOrEqual(120);
      }
    });

  it('admits 24-cell Block captions and refuses 25-cell captions with an edge path', async () => {
    const source = (label: string) => '@diagram block\na block\nb block\n' +
      `m = a -> b [label: "${label}"]\n`;
    const accepted = await renderInstalledCharacterPreview028(source('x'.repeat(24)), { columns: 120 });
    expect(accepted.text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]).toContain('x'.repeat(24));
    await expect(renderInstalledCharacterPreview028(source('x'.repeat(25)), { columns: 120 }))
      .rejects.toMatchObject({ code: 'character.label.unsupported',
        diagnostics: [expect.objectContaining({ path: 'edges.m.label' })] });
  });
  it.each(sourceNames)('uses the installed parser and retains the exact source graph for %s', async (name) => {
    const source = fixture(name);
    const parsed = parseInstalledDocument028(source);
    expect(parsed.header.diagnostics).toEqual([]);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph?.version).toBe('3.0.0');
    const before = structuredClone(parsed.graph);
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    expect(result.graph).toEqual(before);
    expect(parsed.graph).toEqual(before);
    expect(result.charset).toBe('ASCII');
    expect(result.text).toMatch(/^CHAR-PREVIEW\/1 /);
    expect(result.text).toContain('I "coral-graph"');
    expect(result.text.split('\n').filter(Boolean).every((line) => line.length <= 120)).toBe(true);
    expect(result.width).toBe(Math.max(...result.text.trimEnd().split('\n').map((line) => line.length)));
    expect(result.height).toBe(result.text.trimEnd().split('\n').length);
    expect(await renderInstalledCharacterPreview028(source, { columns: 120 })).toEqual(result);
  });

  it.each(['block', 'flowchart-simple'] as const)('routes every basic %s edge visibly and retains its identity', async (name) => {
    const parsed = parseInstalledDocument028(fixture(name));
    const result = await renderInstalledCharacterPreview028(fixture(name), { columns: 120 });
    expect(result.diagnostics.filter((item) => item.code === 'character.edge.legend')).toEqual([]);
    expect(result.text).not.toContain('[legend-only]');
    expect((result.text.match(/\[routed\]/g) ?? []).length).toBe(parsed.graph!.edges.length);
    for (const node of parsed.graph!.nodes) expect(result.text).toContain(`[${node.id}]`);
    for (const edge of parsed.graph!.edges) {
      expect(result.text).toContain(`I "${edge.id}"`);
      expect(result.text).toContain(`F "${edge.source}"`);
      expect(result.text).toContain(`T "${edge.target}"`);
    }
    const picture = result.text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!.split('\n');
    for (const edge of parsed.graph!.edges) {
      const labelLine = picture.findIndex((line) => line.includes(`[${edge.target}]`));
      expect(labelLine).toBeGreaterThan(0);
      const boxLine = picture[labelLine]!;
      const targetAt = boxLine.indexOf(`[${edge.target}]`);
      const left = Math.max(...['|', '(', '<', '>'].map((side) => boxLine.lastIndexOf(side, targetAt)));
      const right = Math.min(...['|', ')', '>', '<'].map((side) => boxLine.indexOf(side, targetAt)).filter((x) => x >= 0));
      const role = parsed.graph!.nodes.find((node) => node.id === edge.target)!;
      const isDiamond = role.type === 'decision' || role.symbol === 'bpmn-gateway-exclusive';
      const topIndex = labelLine - (isDiamond ? 2 : 1);
      const bottomIndex = labelLine + (isDiamond ? 2 : 1);
      const top = picture[topIndex]!;
      const bottom = picture[bottomIndex]!;
      const fromLeft = boxLine[left] === '>';
      const fromRight = boxLine[right] === '<';
      const fromTop = [...top].some((char, x) => x >= left && x <= right && char === 'v');
      const fromBottom = [...bottom].some((char, x) => x >= left && x <= right && char === '^');
      expect(fromLeft || fromRight || fromTop || fromBottom).toBe(true);
    }
  });

  it('keeps a basic flowchart chain horizontal at 120 columns', async () => {
    const name = 'flowchart-simple';
    const result = await renderInstalledCharacterPreview028(fixture(name), { columns: 120 });
    expect(result.diagnostics.some((item) => item.code === 'character.layout.reflow')).toBe(false);
    expect(result.text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!.split('\n').length).toBeLessThan(10);
    expect(result.text).toContain('N 01');
    expect(result.text).toMatch(/R (start|task)/);
  });

  it('keeps a difficult decision cycle honest about reflow and any legend-only route', async () => {
    const result = await renderInstalledCharacterPreview028(fixture('flowchart'), { columns: 80 });
    expect(result.text).toContain('[check]');
    expect(result.text).toContain('L "No"');
    expect(result.diagnostics.some((item) => item.code === 'character.layout.reflow')).toBe(true);
    for (const edge of result.graph.edges) expect(result.text).toContain(`I "${edge.id}"`);
    for (const diagnostic of result.diagnostics.filter((item) => item.code === 'character.edge.legend')) {
      expect(diagnostic.path).toMatch(/^edges\./);
      expect(result.text).toContain('[legend-only]');
    }
  });

  it.each(['ASCII', 'MonoTrue-v1'] as const)('puts flowchart outcomes and node roles in the %s picture', async (charset) => {
    const galleryFlowchart = readFileSync(new URL('./fixtures/character-gallery/flowchart.coral', import.meta.url), 'utf8');
    const result = await renderInstalledCharacterPreview028(galleryFlowchart, charset === 'ASCII'
      ? { columns: 120 }
      : { columns: 120, target: 'controlled-display', monoTrue: controlled });
    const picture = result.text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!;
    expect(picture).toContain('No');
    expect(picture).toContain('Yes');
    const rows = picture.split('\n');
    const decisionRow = rows.findIndex((row) => row.includes('[ready] Ready?'));
    expect(decisionRow).toBeGreaterThan(1);
    expect(rows[decisionRow]).toMatch(/<.*\[ready\] Ready\?.*>/);
    const startRow = rows.find((row) => row.includes('[start] start'))!;
    expect(startRow).toMatch(/\(.*\[start\] start.*\)/);
    expect(rows.length).toBeLessThanOrEqual(55);
    const receiveRow = rows.findIndex((row) => row.includes('[receive] Receive request'));
    if (charset === 'ASCII') {
      expect(rows[receiveRow - 1]).toContain('v');
    } else {
      const arrow = CHARACTER_GLYPH_ROLES_028['endpoint.arrow_open.n'].character;
      const arrowX = rows[receiveRow - 2]!.indexOf(arrow);
      expect(arrowX).toBeGreaterThanOrEqual(0);
      expect(rows[receiveRow - 1]![arrowX]).toBe('┴');
    }
    expect(result.diagnostics.filter((item) => item.code === 'character.label.unplaced')).toEqual([]);
  });

  it('keeps two decision branches and both feedback cycles in a difficult flowchart picture', async () => {
    const source = readFileSync(new URL('./fixtures/character-gallery/flowchart-difficult.coral', import.meta.url), 'utf8');
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    const picture = result.text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!;
    for (const label of ['Invalid', 'Valid', 'Again', 'Approve', 'Reject']) {
      expect(picture).toContain(label);
    }
    const rows = picture.split('\n');
    const startRow = rows.findIndex((row) => row.includes('[start] start'));
    const firstDecisionRow = rows.findIndex((row) => row.includes('[valid] Valid?'));
    expect(startRow).toBeLessThan(firstDecisionRow);
    expect(result.graph.nodes).toHaveLength(9);
    expect(result.graph.edges).toHaveLength(11);
    expect(result.diagnostics.filter((item) =>
      ['character.edge.legend', 'character.label.unplaced'].includes(item.code))).toEqual([]);
  });

  it('never places an edge caption inside an unrelated decision node', async () => {
    const source = '@diagram flowchart\n' +
      'n0 decision as "Node0"\nn1 decision as "Node1"\nn2 process as "Node2"\n' +
      'n3 process as "Node3"\nn4 process as "Node4"\n' +
      'n3 -> n1 [label: "EDGE0"]\nn1 -> n2 [label: "EDGE1"]\n' +
      'n3 -> n2 [label: "EDGE2"]\nn1 -> n0 [label: "EDGE4"]\n' +
      'n4 -> n0 [label: "EDGE5"]\nn1 -> n2 [label: "EDGE6"]\n';
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    const rows = result.text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!.split('\n');
    const decisionRow = rows.findIndex((row) => row.includes('[n1] Node1'));
    const left = rows[decisionRow]!.indexOf('<');
    const right = rows[decisionRow]!.indexOf('>', left);
    expect(decisionRow).toBeGreaterThanOrEqual(2);
    expect(right).toBeGreaterThan(left);
    for (const row of rows.slice(decisionRow - 2, decisionRow + 3)) {
      const caption = row.indexOf('EDGE2');
      expect(caption < 0 || caption + 'EDGE2'.length <= left || caption > right).toBe(true);
    }
  });

  it('uses continuous Unicode corners for admitted flowchart route bends', async () => {
    const result = await renderInstalledCharacterPreview028(fixture('flowchart'), {
      columns: 80, target: 'controlled-display', monoTrue: controlled,
    });
    expect(result.charset).toBe('MonoTrue-v1');
    const picture = result.text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!;
    expect(picture).not.toContain('+');
    expect(picture).toMatch(/[┌┐└┘]/);
    const rows = picture.split('\n');
    const ports: Record<string, string> = {
      '┌': 'ES', '┐': 'WS', '└': 'NE', '┘': 'NW',
      '─': 'EW', '│': 'NS', '├': 'NES', '┤': 'NWS',
      '┬': 'EWS', '┴': 'NWE',
      ...Object.fromEntries(Object.entries(CHARACTER_GLYPH_ROLES_028)
        .filter(([role]) => role.startsWith('endpoint.'))
        .map(([role, row]) => [row.character, /\.[ew]$/.test(role) ? 'EW' : 'NS'])),
    };
    const steps = { N: [0, -1, 'S'], E: [1, 0, 'W'], S: [0, 1, 'N'], W: [-1, 0, 'E'] } as const;
    for (const [y, row] of rows.entries()) for (const [x, char] of [...row].entries()) {
      if (!'┌┐└┘'.includes(char)) continue;
      for (const side of ports[char]!) {
        const [dx, dy, reverse] = steps[side as keyof typeof steps];
        expect(ports[rows[y + dy]?.[x + dx] ?? ''] ?? '', `${char} at ${x},${y} lacks ${side}`)
          .toContain(reverse);
      }
    }
  });

  it('never returns a successful Block picture with a missing edge', async () => {
    const source = '@diagram block\na block\nb block\nc block\nd block\n' +
      'd -> b\na -> c\nd -> c\na -> b\n';
    const outcome = await renderInstalledCharacterPreview028(source, { columns: 120 })
      .then((result) => ({ result, error: undefined }),
        (error: unknown) => ({ result: undefined, error }));
    if (outcome.result) {
      const result = outcome.result;
      expect(result.diagnostics.filter((item) => item.code === 'character.edge.legend')).toEqual([]);
      expect((result.text.match(/\[routed\]/g) ?? [])).toHaveLength(4);
    } else {
      expect(outcome.error).toMatchObject({ code: 'character.edge.route.unplaced',
        diagnostics: [expect.objectContaining({ path: expect.stringMatching(/^edges\./) })] });
    }
  });

  it('keeps native SVG and character preview tied to the same parsed Graph IR', async () => {
    const source = fixture('block');
    const parsed = parseInstalledDocument028(source);
    const graph = parsed.graph!;
    const laid = await layoutGraphForSvg(graph, { direction: 'RIGHT', nodeSpacing: 50 });
    const svg = renderSvg(laid, { edgeRoutes: laid.edgeRoutes, theme: 'light' });
    const preview = await renderInstalledCharacterPreview028(source, { columns: 120 });
    expect(preview.graph).toEqual(graph);
    expect(svg).toContain('<svg');
    for (const node of graph.nodes) {
      expect(svg).toContain(node.label);
      expect(preview.text).toContain(`[${node.id}]`);
    }
  });

  it('uses whole-diagram ASCII unless an exact controlled MonoTrue capability is present', async () => {
    const source = fixture('block');
    const ascii = await renderInstalledCharacterPreview028(source, { columns: 120 });
    const unicode = await renderInstalledCharacterPreview028(source, {
      columns: 120, target: 'controlled-display', monoTrue: controlled,
    });
    expect(unicode.charset).toBe('MonoTrue-v1');
    expect(unicode.text).toContain('┌');
    const approved = new Set<string>(Object.values(CHARACTER_GLYPH_ROLES_028).map(row => row.character));
    const privateUse = [...unicode.text].filter(char => {
      const point = char.codePointAt(0)!;
      return point >= 0xe000 && point <= 0xf8ff;
    });
    expect(privateUse.length).toBeGreaterThan(0);
    expect(privateUse.every(char => approved.has(char))).toBe(true);
    for (const options of [
      { columns: 120 as const, target: 'copy-export' as const, monoTrue: controlled },
      { columns: 120 as const, target: 'controlled-display' as const, monoTrue: { ...controlled, fontSha256: '0'.repeat(64) } },
      { columns: 120 as const, target: 'controlled-display' as const, monoTrue: { ...controlled, validatedRoles: controlled.validatedRoles.filter(role => role !== 'endpoint.arrow_open.w') } },
    ]) {
      const result = await renderInstalledCharacterPreview028(source, options);
      expect(result.charset).toBe('ASCII');
      expect(result.text).toMatch(/^[\x20-\x7e\n]*$/);
      expect(result.text).toBe(ascii.text);
    }
  });

  it('escapes controls and literal backslashes distinctly without splitting continuation tokens', async () => {
    const source = '@diagram flowchart\n' +
      'a process as "é"\nb process as "\\\\u{E9}"\na -> b [label: "L  R"]\n';
    const result = await renderInstalledCharacterPreview028(source, { columns: 40 });
    expect(result.text).toContain('\\u{E9}');
    expect(result.text).toContain('\\\\u{E9}');
    expect(result.text).toContain('L  R');
    expect(result.text).toMatch(/^[\x20-\x7e\n]*$/);
    expect(result.text.split('\n').filter(Boolean).every((line) => line.length <= 40)).toBe(true);
    expect(result.text).not.toMatch(/\\u\{[0-9A-F]*\n/);
  });

  it.each([40, 80, 120] as const)('preserves long ledger fields and refuses unplaceable picture captions at %i columns', async (columns) => {
    const graph = parseInstalledDocument028('@diagram flowchart\na process\nb process\na -> b\n').graph!;
    const label = `${'x'.repeat(Math.min(60, columns - 7))}  é\\u{E9} Z`;
    graph.edges[0]!.label = label;
    const adapted = adaptCharacterGraph028(graph, columns);
    await expect(renderRoutedCharacters028(adapted, columns, 'ASCII')).rejects.toMatchObject({
      code: 'character.label.unplaced', diagnostics: [expect.objectContaining({ path: 'edges.edge-1.label' })],
    });
    const result = renderCharacterGraph028(adapted, { columns, target: 'copy-export' });
    const rows = result.text.split('E 01\n')[1]!.split('\n');
    const labelStart = rows.findIndex((line) => line.startsWith('L "'));
    expect(labelStart).toBeGreaterThan(0);
    const fieldRows: string[] = [];
    for (const line of rows.slice(labelStart)) {
      if (!line.startsWith('L "')) break;
      fieldRows.push(line);
    }
    const joined = fieldRows.map((line) => decodeCharacterField028(line.slice(3, -1))).join('');
    expect(joined).toBe(label);
    expect(rows.filter(Boolean).every((line) => line.length <= columns)).toBe(true);
  });

  it.each(['#FF0000', 'thick', 'animated'] as const)('refuses unprojected %s source intent with a source location', async (intent) => {
    const source = '@diagram block\na block\nb block\na -> b [style: ' + intent + ']\n';
    const parsed = parseInstalledDocument028(source);
    expect(parsed.syntax.diagnostics).toEqual([]);
    expect(parsed.graph).toBeUndefined();
    await expect(renderInstalledCharacterPreview028(source, { columns: 80 })).rejects.toMatchObject({
      code: 'character.source.projection-unavailable',
      diagnostics: [expect.objectContaining({ path: expect.stringMatching(/source.*4/) })],
    });
  });

  it('refuses invalid source, unsupported notation, and unknown semantic fields', async () => {
    await expect(renderInstalledCharacterPreview028('@diagram missing\na block\n', { columns: 80 }))
      .rejects.toMatchObject({ code: 'character.source.invalid' });
    await expect(renderInstalledCharacterPreview028('@diagram architecture\na service\n', { columns: 80 }))
      .rejects.toMatchObject({ code: 'character.notation.unsupported' });
    const graph = parseInstalledDocument028(fixture('bpmn')).graph!;
    for (const candidate of [
      { ...graph, nodes: [{ ...graph.nodes[0]!, type: 'event' }, ...graph.nodes.slice(1)] },
      { ...graph, edges: [{ ...graph.edges[0]!, type: 'message' }, ...graph.edges.slice(1)] },
      { ...graph, nodes: [{ ...graph.nodes[0]!, ports: [] }, ...graph.nodes.slice(1)] },
      { ...graph, nodes: [{ ...graph.nodes[0]!, variant: 'user' }, ...graph.nodes.slice(1)] },
    ]) {
      expect(() => adaptCharacterGraph028(candidate as GraphIR, 80)).toThrowError(
        expect.objectContaining({ code: expect.stringMatching(/^character\./) }));
    }
  });

  it('refuses every added semantic category before adaptation can drop meaning', () => {
    const graph = parseInstalledDocument028(fixture('block')).graph!;
    const edge = graph.edges[0]!;
    const node = graph.nodes[0]!;
    const cases: GraphIR[] = [
      { ...graph, nodes: [{ ...node, children: [{ id: 'child', type: 'block' }] }, ...graph.nodes.slice(1)] },
      { ...graph, nodes: [{ ...node, ports: [] }, ...graph.nodes.slice(1)] },
      { ...graph, edges: [{ ...edge, sourcePort: 'p' }, ...graph.edges.slice(1)] },
      { ...graph, edges: [{ ...edge, style: { lineStyle: 'dashed' } }, ...graph.edges.slice(1)] },
      { ...graph, edges: [{ ...edge, type: 'message' }, ...graph.edges.slice(1)] },
      { ...graph, edges: [{ ...edge, target: 'missing' }, ...graph.edges.slice(1)] },
      { ...graph, nodes: [node, node, ...graph.nodes.slice(1)] },
      { ...graph, constraints: [] },
    ];
    for (const candidate of cases) expect(() => adaptCharacterGraph028(candidate, 80)).toThrowError(
      expect.objectContaining({ code: expect.stringMatching(/^character\./) }));
  });

  it.each(['block', 'flowchart'] as const)('refuses an empty %s graph before layout', async (notation) => {
    await expect(renderInstalledCharacterPreview028(`@diagram ${notation}\n`, { columns: 40 }))
      .rejects.toMatchObject({ code: 'character.graph.empty' });
  });

  it('accepts a node box that exactly fits 40 columns', async () => {
    const source = `@diagram block\na block as "${'x'.repeat(32)}"\n`;
    const result = await renderInstalledCharacterPreview028(source, { columns: 40 });
    const picture = result.text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!;
    expect(Math.max(...picture.split('\n').map((line) => line.length))).toBe(40);
  });

  it('refuses an overlong Block edge caption before layout', async () => {
    const source = `@diagram block\na block\nb block\na -> b [label: "${'x'.repeat(81)}"]\n`;
    await expect(renderInstalledCharacterPreview028(source, { columns: 120 }))
      .rejects.toMatchObject({ code: 'character.label.unsupported',
        diagnostics: [expect.objectContaining({ path: 'edges.edge-1.label' })] });
  });

  it.each(['block', 'flowchart-simple', 'bpmn'] as const)('enforces %s node, edge, and input budgets', (name) => {
    const graph = parseInstalledDocument028(fixture(name)).graph!;
    const template = graph.nodes[0]!;
    const forty = structuredClone(graph);
    while (forty.nodes.length < 40) forty.nodes.push({ ...template, id: `extra-${forty.nodes.length}` });
    expect(() => adaptCharacterGraph028(forty, 80)).not.toThrow();
    const fortyOne = structuredClone(forty);
    fortyOne.nodes.push({ ...template, id: 'extra-40' });
    expect(() => adaptCharacterGraph028(fortyOne, 80)).toThrowError(
      expect.objectContaining({ code: 'character.size.unsupported' }));
    const eighty = structuredClone(graph);
    const firstEdge = name === 'bpmn' ? graph.edges[1]! : graph.edges[0]!;
    while (eighty.edges.length < 80) eighty.edges.push({ ...firstEdge, id: `extra-edge-${eighty.edges.length}` });
    expect(() => adaptCharacterGraph028(eighty, 80)).not.toThrow();
    const eightyOne = structuredClone(eighty);
    eightyOne.edges.push({ ...firstEdge, id: 'extra-edge-80' });
    expect(() => adaptCharacterGraph028(eightyOne, 80)).toThrowError(
      expect.objectContaining({ code: 'character.size.unsupported' }));
    const largestField = { ...graph, id: 'x'.repeat(2048) };
    expect(() => adaptCharacterGraph028(largestField, 80)).not.toThrow();
    expect(() => adaptCharacterGraph028({ ...graph, id: 'x'.repeat(2049) }, 80)).toThrowError(
      expect.objectContaining({ code: 'character.size.unsupported' }));
    const cumulative = structuredClone(graph);
    cumulative.id = 'x'.repeat(2048);
    cumulative.name = 'y'.repeat(2048);
    cumulative.nodes[0]!.label = 'z'.repeat(2048);
    cumulative.edges[0]!.label = 'w'.repeat(2048);
    expect(() => adaptCharacterGraph028(cumulative, 80)).toThrowError(
      expect.objectContaining({ code: 'character.size.unsupported' }));
  });

  it.each(['block', 'flowchart-simple', 'bpmn'] as const)('enforces encoded display text budgets for %s', async (name) => {
    const graph = parseInstalledDocument028(fixture(name)).graph!;
    const template = graph.nodes[0]!;
    while (graph.nodes.length < 39) graph.nodes.push({ ...template, id: `extra-${graph.nodes.length}`, label: 'é'.repeat(10) });
    const adapted = adaptCharacterGraph028(graph, 120);
    await expect(renderRoutedCharacters028(adapted, 120, 'ASCII')).rejects.toMatchObject({
      code: 'character.size.unsupported',
    });
  });

  it('enforces complete-output row, cell, and width budgets after the legend', () => {
    const diagnostics: [] = [];
    const exactCells = [...Array(546).fill('x'.repeat(120)), 'x'.repeat(16)];
    const exact = finalizeCharacterPreview028(exactCells, 120, 'ASCII', diagnostics);
    expect(exact.height).toBe(547);
    expect(exact.width).toBe(120);
    expect(() => finalizeCharacterPreview028([...exactCells, 'x'], 120, 'ASCII', diagnostics)).toThrowError(
      expect.objectContaining({ code: 'character.size.unsupported' }));
    expect(() => finalizeCharacterPreview028(Array(1025).fill('x'), 120, 'ASCII', diagnostics)).toThrowError(
      expect.objectContaining({ code: 'character.size.unsupported' }));
    expect(() => finalizeCharacterPreview028(['x'.repeat(121)], 120, 'ASCII', diagnostics)).toThrowError(
      expect.objectContaining({ code: 'character.width.unsupported' }));
  });

  it('retains the existing semantic ledger contract', () => {
    const graph = parseInstalledDocument028(fixture('block')).graph!;
    expect(renderCharacterGraph028(graph, { columns: 80 }).text).toMatch(/^CHAR\/1 block ASCII/);
  });
});
