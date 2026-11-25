import { describe, expect, it } from 'vitest';
import { CharacterRenderError } from '../src/characters028.js';
import { renderInstalledCharacterPreview028 } from '../src/characterPreview028.js';

// C4 character fallback (c4-design.md "Character fallback"; design D60-7):
// flowchart draws a labelled process box with a notice listing every escape
// segment it did not draw; block keeps its refusal of explicit symbols.

const definition = ['@symbol probe {', '  name "Probe"', '  size 60 x 40', '  outline ellipse',
  '  anchor core [x: 0.5, y: 0.25, exit: E]', '  anchor edge [side: S, at: 0.5]',
  '  deep port [direction: out, anchor: core]', '  low port [direction: out, anchor: edge]',
  '  intake port [direction: in, anchor: W]', '  artwork svg """',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 16"><path d="M0 0 L24 0 L24 16 Z" fill="#2f6f4f"/></svg>',
  '"""', '}'];
const flowchart = (body: string[]) => ['@diagram flowchart', '@coralVersion "0.2.9"', '', ...definition, '',
  'start terminal [variant: "start"]', 'check process [symbol: "local.probe"] as "Check request"',
  'done terminal [variant: "end"]', 'retry process as "Retry"', ...body, ''].join('\n');
const picture = (text: string) => text.split('PICTURE\n')[1]!.split('\nNODES\n')[0]!;

async function refusal(promise: Promise<unknown>): Promise<CharacterRenderError> {
  try { await promise; } catch (error) { return error as CharacterRenderError; }
  throw new Error('expected a refusal');
}

describe('flowchart character fallback for user symbols', () => {
  it('draws a labelled process box and notes the fallback', async () => {
    const result = await renderInstalledCharacterPreview028(flowchart(['start -> check', 'check -> done']), { columns: 120 });
    const drawn = picture(result.text);
    expect(drawn).toContain('[check] Check request');
    expect(result.diagnostics.filter((item) => item.code === 'character.symbol.local-fallback')).toEqual([{
      code: 'character.symbol.local-fallback', severity: 'info', path: 'nodes.check',
      message: 'Node check uses user symbol local.probe; drawn as a labelled box.',
    }]);
  });

  it('draws connectors that name user-symbol ports and lists each undrawn escape segment', async () => {
    const result = await renderInstalledCharacterPreview028(flowchart([
      'start -> check:intake', 'check:deep -> done', 'check:low -> retry']), { columns: 120 });
    const drawn = picture(result.text);
    for (const node of ['[start]', '[check] Check request', '[done]', '[retry] Retry']) expect(drawn).toContain(node);
    const notices = result.diagnostics.filter((item) => item.code === 'character.symbol.local-fallback');
    expect(notices).toEqual([{ code: 'character.symbol.local-fallback', severity: 'info', path: 'nodes.check',
      message: 'Node check uses user symbol local.probe; drawn as a labelled box. Port ends drawn to the box: ' +
        'edge-1:target intake, edge-2:source deep, edge-3:source low. Escape segments not drawn: ' +
        'edge-2:source from (0.5, 0.25) to (0.933, 0.25).' }]);
    // Every connector is routed in the picture and keeps its endpoints in the ledger.
    for (const [id, from, to] of [['edge-1', 'start', 'check'], ['edge-2', 'check', 'done'], ['edge-3', 'check', 'retry']])
      expect(result.text).toMatch(new RegExp(`E \\d+ \\[routed\\]\\nI "${id}"\\nF "${from}"\\nT "${to}"\\n`));
  });

  it('still refuses a connector that names a bundled node port', async () => {
    const source = flowchart(['retry2 decision as "Ready?" {', '  yes port [direction: out, anchor: S]', '}',
      'retry2:yes -> done']);
    const error = await refusal(renderInstalledCharacterPreview028(source, { columns: 120 }));
    expect(error.code).toBe('character.source.capability');
  });

  it('passes the admission gates with an unused definition and an explicit conformance level', async () => {
    const unused = ['@symbol spare {', '  name "Spare"', '  size 10 x 10', '  artwork svg """',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0 L1 0 L1 1 Z" fill="#000000"/></svg>',
      '"""', '}'].join('\n');
    const source = flowchart(['start -> check', 'check -> done'])
      .replace('@coralVersion "0.2.9"\n', '@coralVersion "0.2.9"\n@conformanceLevel strict\n')
      .replace('@symbol probe {', `${unused}\n@symbol probe {`);
    const result = await renderInstalledCharacterPreview028(source, { columns: 120 });
    expect(picture(result.text)).toContain('[check] Check request');
    expect(result.diagnostics.map((item) => item.code)).toContain('character.symbol.local-fallback');
  });
});

describe('only definitions may stand in for the withheld display graph', () => {
  it('still refuses a user-symbol flowchart whose connector has a style the display cannot carry', async () => {
    const source = flowchart(['start -> check [style: "dotted, #FF0000"]', 'check -> done']);
    expect((await refusal(renderInstalledCharacterPreview028(source, { columns: 120 }))).code)
      .toBe('character.source.projection-unavailable');
  });
});

describe('other notations keep their character refusals for user symbols', () => {
  it.each([
    ['uml-class', 'a class [symbol: "local.probe"] as "A"\nb class as "B"\na -> b', 'character.field.unsupported'],
    ['uml-sequence', 'a participant [symbol: "local.probe"] as "A"\nb participant as "B"\na -> b', 'character.source.conformance'],
    ['bpmn', 'a task [symbol: "local.probe"] as "A"\nb endEvent\na -> b', 'character.bpmn.source-construct'],
    ['architecture', 'a service [symbol: "local.probe"] as "A"\nb service\na -> b', 'character.notation.unsupported'],
  ])('%s', async (notation, body, code) => {
    const source = [`@diagram ${notation}`, '@coralVersion "0.2.9"', '', ...definition, '', body, ''].join('\n');
    expect((await refusal(renderInstalledCharacterPreview028(source, { columns: 120 }))).code).toBe(code);
  });
});

describe('block character refusal of user symbols', () => {
  it('keeps refusing an explicit user symbol', async () => {
    const source = ['@diagram block', '@coralVersion "0.2.9"', '', ...definition, '',
      'a block [symbol: "local.probe"] as "A"', 'b block as "B"', 'a -> b', ''].join('\n');
    const error = await refusal(renderInstalledCharacterPreview028(source, { columns: 120 }));
    expect(error.code).toBe('character.role.unsupported');
    expect(error.message).toBe('Only generic Block units are accepted.');
  });
});
