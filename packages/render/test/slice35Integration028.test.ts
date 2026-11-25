import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@graph-ir/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@graph-ir/core')>();
  return { ...actual, validateGraphIRSuccessorWithCatalog: vi.fn(actual.validateGraphIRSuccessorWithCatalog) };
});
import { layoutGraphForSvg } from '../src/svg/layout.js';
import { validateGraphIRSuccessorWithCatalog } from '@graph-ir/core';
import { getAvailableNotations028, notationCatalogIdentity028, parseInstalledDocument028,
  projectInstalledSourceToSuccessor028, resolveSuccessorGraphNodes028,
  successorCatalogSnapshot028, checkInstalledSuccessorSourceConformance028,
  renderInstalledCharacterPreview028, successorSourceDisplay028,
 } from '../src/index.js';

const source = (body: string) => `@diagram block\n@coralVersion "0.2.8"\n${body}\n`;

describe('Slice 35 current source character integration', () => {
  it.each([
    ['position', 'a block @ (10, 20)\nb block\na -> b', 3],
    ['pin', 'a block @ (10, 20) pinned\nb block\na -> b', 3],
    ['node label placement', 'a block as "Alpha" label above offset 20\nb block\na -> b', 3],
    ['edge label placement', 'a block\nb block\na -> b as "Transfer" label below at 0.5 offset 20', 5],
    ['proximity', 'a block\nb block\na ------> b', 5],
    ['authored port', 'a block {\n  outbound port [direction: out]\n}\nb block\na:outbound -> b', 4],
    ['layout controls', 'layout [direction: RIGHT]\na block\nb block\na -> b', 3],
    ['constraint', 'a block\nb block\na -> b\nconstraint order: node a left of node b', 6],
    ['arrangement', 'a block\nb block\na -> b\narrange row: a, b', 6],
    ['route', 'a block\nb block\ne = a -> b\nroute edge e {\nbend = waypoint at (20, 30)\n}', 6],
  ])('refuses unsupported %s before picture output with its source location', async (_name, body, line) => {
    const text = source(body as string);
    expect(parseInstalledDocument028(text).syntax.diagnostics).toEqual([]);
    expect(projectInstalledSourceToSuccessor028(text).graph).toBeDefined();
    await expect(renderInstalledCharacterPreview028(text, { columns: 120 })).rejects.toMatchObject({
      code: 'character.source.capability',
      diagnostics: [expect.objectContaining({ path: expect.stringContaining(`source.line.${line}.column.`) })],
    });
  });

  it.each(['block-simple', 'block-moderate', 'block-difficult',
    'flowchart-simple', 'flowchart', 'flowchart-difficult',
    'bpmn-simple', 'bpmn-moderate', 'bpmn-difficult',
    'uml-class-simple', 'uml-class', 'uml-class-difficult',
    'uml-sequence', 'uml-sequence-moderate', 'uml-sequence-difficult',
    'uml-state', 'uml-state-moderate', 'uml-state-difficult'])(
    'validates exact successor, U1/U2 and preserves source for %s', async (name) => {
      const text = readFileSync(new URL(`./fixtures/character-gallery/${name}.coral`, import.meta.url), 'utf8');
      const projected = projectInstalledSourceToSuccessor028(text);
      expect(projected.diagnostics).toEqual([]);
      const graph = projected.graph!;
      const before = structuredClone(graph);
      const exact = validateGraphIRSuccessorWithCatalog(graph, successorCatalogSnapshot028(graph));
      expect(exact.errors).toEqual([]);
      expect(exact.valid).toBe(true);
      expect(exact.verification.complete).toBe(true);
      expect(resolveSuccessorGraphNodes028(graph).size).toBe(graph.nodes.length);
      const checked = checkInstalledSuccessorSourceConformance028(text);
      expect(checked.diagnostics).toEqual([]);
      expect(checked.report).toBeDefined();
      const result = await renderInstalledCharacterPreview028(text, { columns: 120 });
      expect(result.charset).toBe('ASCII');
      expect(result.text).toMatch(/^[\x20-\x7e\n]*$/);
      expect(projectInstalledSourceToSuccessor028(text).graph).toEqual(before);
      expect(graph).toEqual(before);
    });

  it('refuses a flowchart caption that cannot fit beside its route', async () => {
    const text = '@diagram flowchart\na process\nb process\na -> b as "' + 'q'.repeat(60) + '"\n';
    await expect(renderInstalledCharacterPreview028(text, { columns: 120 })).rejects.toMatchObject({
      code: 'character.label.unplaced', diagnostics: [expect.objectContaining({ path: 'edges.edge-1.label' })],
    });
  });

  it('reserves spaces inside earlier routed captions', async () => {
    const text = '@diagram block\na block\nb block\nc block\nd block\ne block\n' +
      'a -> b as "cap0"\na -> c as "cap1"\nb -> d as "BEG    END"\nc -> d as "cap3"\n';
    const outcome = await renderInstalledCharacterPreview028(text, { columns: 120 })
      .then(result => ({ result, error: undefined }), error => ({ result: undefined, error }));
    if (outcome.error) expect(outcome.error).toMatchObject({ code: 'character.label.unplaced' });
    else {
      const picture = outcome.result!.text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!;
      expect(picture).toContain('BEG    END');
      expect(picture).toContain('cap3');
      expect(picture).not.toContain('BEGcap3END');
    }
  });

  it('runs exact catalog validation even for an ordinary forward Block source', async () => {
    vi.mocked(validateGraphIRSuccessorWithCatalog).mockClear();
    await renderInstalledCharacterPreview028('@diagram block\na block\nb block\na -> b\n', { columns: 80 });
    expect(validateGraphIRSuccessorWithCatalog).toHaveBeenCalledWith(
      expect.objectContaining({ version: '4.0.0', profile: expect.objectContaining({ id: 'block' }) }),
      expect.anything(), expect.anything());
  });

  it.each(['none', 'typical', 'strict'] as const)('keeps state partial-card obligations honest at %s', async (level) => {
    const text = readFileSync(new URL('./fixtures/character-gallery/uml-state.coral', import.meta.url), 'utf8')
      .replace('@diagram uml-state', `@diagram uml-state\n@conformanceLevel ${level}`);
    const checked = checkInstalledSuccessorSourceConformance028(text);
    expect(checked.report?.evaluatedLevel).toBe(level);
    expect(checked.report?.unverifiedObligations.length).toBeGreaterThan(0);
    expect(checked.report?.claimStatus).toBe(level === 'strict' ? 'unverified' : 'not-claimed');
    await expect(renderInstalledCharacterPreview028(text, { columns: 120 })).resolves.toHaveProperty('charset', 'ASCII');
  });

  it.each(['none', 'typical', 'strict'] as const)('refuses invalid U1 choices independently of %s notation filtering', async (level) => {
    const text = `@diagram block\n@conformanceLevel ${level}\na block [symbol: "missing"]\n`;
    expect(parseInstalledDocument028(text).syntax.diagnostics).toEqual([]);
    await expect(renderInstalledCharacterPreview028(text, { columns: 80 })).rejects.toMatchObject({ code: 'character.source.integrity' });
  });

  it.each(['none', 'typical', 'strict'] as const)('uses full U2 findings at the saved %s level', async (level) => {
    const text = `@diagram uml-class\n@conformanceLevel ${level}\nA class\nB class\nm = A -> B [inheritance]\n`;
    const checked = checkInstalledSuccessorSourceConformance028(text);
    if (level === 'typical') {
      expect(checked.report?.findings).toEqual([]);
      expect(checked.report?.notices).toEqual([]);
    }
    if (level === 'strict') {
      await expect(renderInstalledCharacterPreview028(text, { columns: 80 })).rejects.toMatchObject({ code: 'character.source.conformance' });
    } else await expect(renderInstalledCharacterPreview028(text, { columns: 80 })).resolves.toHaveProperty('charset', 'ASCII');
  });

  it.each(['bpmn-simple', 'uml-class-simple', 'uml-sequence', 'uml-state'])(
    'locates unrepresentable positions across %s without changing the family contract', async (name) => {
      const text = readFileSync(new URL(`./fixtures/character-gallery/${name}.coral`, import.meta.url), 'utf8');
      const lines = text.split('\n');
      lines[1] += ' @ (10, 20) pinned';
      const modified = lines.join('\n');
      expect(projectInstalledSourceToSuccessor028(modified).diagnostics).toEqual([]);
      await expect(renderInstalledCharacterPreview028(modified, { columns: 120 })).rejects.toMatchObject({
        code: 'character.source.capability', diagnostics: [expect.objectContaining({ path: 'source.line.2.column.' + lines[1]!.indexOf('@') })],
      });
    });

  it('keeps the state edition source-readable, identity-bound and outside visual creation', async () => {
    const text = readFileSync(new URL('./fixtures/character-gallery/uml-state.coral', import.meta.url), 'utf8');
    const document = parseInstalledDocument028(text);
    expect(document.header.diagnostics).toEqual([]);
    expect(document.header.header?.catalog).toEqual(notationCatalogIdentity028('uml-state'));
    expect(getAvailableNotations028().some(item => item.id === 'uml-state')).toBe(false);
    const graph = projectInstalledSourceToSuccessor028(text).graph!;
    expect(successorSourceDisplay028(graph).metadata?.notation).toBe('uml-state');
    await expect(layoutGraphForSvg(document.graph!)).rejects.toThrow(/character.only/i);
  });
});
