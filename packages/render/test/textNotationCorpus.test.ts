import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderText } from '../src/textRenderer/index.js';
import { renderInstalledCharacterPreview028 } from '../src/characterPreview028.js';

const families = {
  architecture: 'container', infrastructure: 'subnet', flowchart: 'process', erd: 'entity',
  'uml-state': 'state', 'uml-class': 'class', 'uml-sequence': 'participant',
  block: 'block', bpmn: 'task', aiml: 'model', 'data-engineering': 'transform', code: 'function', sketch: 'step',
};

function corpus(notation: keyof typeof families, size: number) {
  const sequence = notation === 'uml-sequence', state = notation === 'uml-state';
  const statements = [`@diagram ${notation}`, `@coralVersion "${state ? '0.2.17' : '0.2.14'}"`];
  if (state && size > 2) statements.push('outer composite as "Machine" {', 'inner composite as "Running" {');
  for (let i = 0; i < size; i++) {
    let type: string = families[notation];
    if (notation === 'architecture' && i === 0) type = 'person';
    if (notation === 'flowchart' && i === 1) type = 'decision';
    if (notation === 'infrastructure') type += ' [provider: "aws"]';
    let node = `n${i} ${type} as "Unit ${i}"`;
    if (notation === 'erd') node += ' {\n  columns {\n    id int [pk]\n    owner int [fk]\n  }\n}';
    if (notation === 'uml-class') node += ' {\n  operations {\n    + add(x: int): int\n  }\n}';
    statements.push(node);
  }
  if (sequence && size > 2) statements.push('loop "retry" {');
  for (let i = 1; i < size; i++) {
    const op = notation === 'erd' ? '||--o{' : notation === 'uml-class' ? '--|>' : '->';
    statements.push(`n${i - 1} ${op} n${i} as "Step ${i}"`);
  }
  if (sequence && size > 2) statements.push('}');
  if (state && size > 2) statements.push('}', '}');
  return statements.join('\n');
}

describe('AC-4 notation corpus, including Phase 2', () => {
  for (const notation of Object.keys(families) as (keyof typeof families)[]) {
    it.each([2, 7, 26])(`${notation} with %i nodes`, async size => {
      const result = await renderText(corpus(notation, size), { pageHeight: size === 26 ? 35 : 55 });
      expect(result.text).toMatchSnapshot();
      for (let i = 0; i < size; i++) expect(result.text).toContain('Unit ' + i);
      if (size === 26) expect(result.pageCount).toBeGreaterThan(1);
      if (size === 26 && notation === 'uml-sequence') {
        for (const page of result.pages) expect(page).toContain(result.pages[0].split('\n')[2]);
        expect(result.text).toContain('cont. from p.1');
      }
      if (size === 26 && notation === 'uml-state') expect(result.text).toContain('cont. p.2: Running');
      if (notation === 'erd') expect(result.text).toContain('||--o<');
    });
  }
});

it('AC-6 compact comments save at least 40% of legacy preview height', async () => {
  const source = readFileSync(new URL('./fixtures/character-gallery/flowchart.coral', import.meta.url), 'utf8');
  const legacy = await renderInstalledCharacterPreview028(source, { columns: 80 });
  const result = await renderText(source, { profile: 'comment' });
  expect(result.height).toBeLessThanOrEqual(legacy.text.split('\n').length * 0.6);
  expect(result.text).not.toMatch(/CHAR-PREVIEW|LEDGER|\[receive\]/);
});

it('AC-7 retains ten ERD columns and eight long participant names', async () => {
  const fields = Array.from({ length: 10 }, (_, i) => `field${i} varchar(50)`);
  const erd = await renderText('@diagram erd\n@coralVersion "0.2.14"\nt entity {\ncolumns {\n' + fields.join('\n') + '\n}\n}');
  for (const field of fields) expect(erd.text).toContain(field.replace(' ', ': '));
  const long = 'Participant name repeated '.repeat(6).trimEnd();
  const source = corpus('uml-sequence', 8).replaceAll('as "Unit ', 'as "' + long + ' ');
  const result = await renderText(source);
  expect(result.text).toContain('[H]');
  expect(result.text.replaceAll(/\s+/g, ' ')).toContain(long + ' 7');
});


it('preserves Phase 2 semantic cues in all charsets', async () => {
  const { CHARACTER_GLYPH_ROLES_028, FONT_SHA_BY_FACE_029 } = await import('../src/characterGlyphRoles028.js');
  const monoTrue = { profile: 'monotrue-v1', selected: true, face: 'Regular',
    fontSha256: FONT_SHA_BY_FACE_029.Regular, validatedRoles: Object.keys(CHARACTER_GLYPH_ROLES_028) } as const;
  for (const charset of ['ascii', 'utf8-box', 'monotrue-v1'] as const) {
    for (const name of ['aiml', 'data-engineering', 'sketch']) {
      const source = readFileSync(new URL('../../diagram-editor/src/example-sources/' + name + '.coral', import.meta.url), 'utf8');
      const result = await renderText(source, { charset, monoTrue });
      expect(result.charset).toBe(charset);
      expect(result.text).toContain(name === 'aiml' ? '[dataset]' : name === 'sketch' ? '(~)' : '[transform]');
    }
  }
  const bpmn = await renderText('@diagram bpmn\ns startEvent\nx exclusiveGateway\np parallelGateway\ne endEvent\ns -> x\nx -> p\np -> e');
  for (const cue of ['(o)', '<X>', '<+>', '((o))']) expect(bpmn.text).toContain(cue);
});
